// ============================================================
// Cloudflare Worker entry point
// - fetch()     → REST API + LINE webhook
// - scheduled() → daily closing-price scan at 14:30 Taiwan (06:30 UTC)
// ============================================================

import type { Env, WatchlistStock, SectorGroup, PullbackZone } from './types';
import { isWeeklyRefreshTime, fetchStockData, fetchTaiex, lookupStockName } from './yahoo';
import {
  calcIndicators,
  calcTrendState,
  getPullbackZone,
  calcATR20,
  calcVolatilityMode,
  evaluateTriggers,
  isCooledDown,
  calcRsScore,
} from './indicators';
import {
  getActiveWatchlist,
  getAllSectors,
  getMarketState,
  updateMarketState,
  updateWatchlistStock,
  writebackIndicators,
  updateLastNotified,
  insertNotificationLog,
  getStocksForMonthlyReview,
} from './db';
import {
  buildIdealZoneMessage,
  buildVolumeSpikeMessage,
  buildSectorActiveMessage,
  buildMonthlyReviewMessage,
  postToN8n,
  pushLineMessage,
} from './notifications';
import { analyzeVolumeSpike, refreshAllConceptTags } from './claude';
import { handleWatchlist } from './routes/watchlist';
import { handleSectors } from './routes/sectors';
import { handleDashboard } from './routes/dashboard';
import { handleMarket } from './routes/market';
import { handleLineWebhook } from './line-webhook';

// -------------------------------------------------------
// fetch() — HTTP routing
// -------------------------------------------------------

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight for all routes
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (path.startsWith('/api/watchlist')) return handleWatchlist(request, env);
    if (path.startsWith('/api/sectors'))  return handleSectors(request, env);
    if (path.startsWith('/api/dashboard')) return handleDashboard(request, env);
    if (path.startsWith('/api/market-state')) return handleMarket(request, env);
    if (path === '/webhook/line') return handleLineWebhook(request, env);

    // Debug: test Yahoo Finance quote for a single stock
    if (path === '/api/debug' && request.method === 'GET') {
      const sym = url.searchParams.get('symbol') ?? '2330.TW';
      try {
        const { fetchQuote, fetchHistory } = await import('./yahoo');
        const [quote, history] = await Promise.all([
          fetchQuote(sym).catch((e: unknown) => ({ error: String(e) })),
          fetchHistory(sym, 10).catch((e: unknown) => []),
        ]);
        return new Response(JSON.stringify({
          symbol: sym,
          quote,
          history_bars: Array.isArray(history) ? history.length : 0,
          last_close: Array.isArray(history) && history.length > 0 ? history[history.length - 1].close : null,
        }, null, 2), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: String(e) }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
    }

    // Manual scan trigger — runs synchronously and returns summary
    if (path === '/api/scan' && request.method === 'POST') {
      try {
        const before = Date.now();
        await runPriceMonitor(env);
        const elapsed = Date.now() - before;
        // Return updated prices after scan
        const stocks = await getActiveWatchlist(env.DB);
        const withPrice = stocks.filter(s => s.current_price && s.current_price > 0).length;
        return new Response(JSON.stringify({
          status: 'ok',
          elapsed_ms: elapsed,
          total: stocks.length,
          with_price: withPrice,
          time: new Date().toISOString(),
        }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      } catch (e) {
        return new Response(JSON.stringify({ status: 'error', message: String(e) }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }
    }

    return new Response(JSON.stringify({ status: 'momentum-api running' }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  },

  // -------------------------------------------------------
  // scheduled() — Cron trigger
  // -------------------------------------------------------

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('Starting daily closing-price scan...');

    try {
      await runPriceMonitor(env);
    } catch (err) {
      console.error('Price monitor cron failed:', err);
    }
  },
};

// -------------------------------------------------------
// Main cron logic
// -------------------------------------------------------

async function runPriceMonitor(env: Env): Promise<void> {
  const [stocks, sectors, marketState] = await Promise.all([
    getActiveWatchlist(env.DB),
    getAllSectors(env.DB),
    getMarketState(env.DB),
  ]);

  if (stocks.length === 0) {
    console.log('No active stocks to monitor');
    return;
  }

  // ① Update TAIEX / market state
  const taiexData = await fetchTaiex();
  let volatilityMode: 'NORMAL' | 'HIGH' = marketState.volatility_mode ?? 'NORMAL';
  let taiexChangePct = 0;

  if (taiexData) {
    taiexChangePct = taiexData.dailyChangePct;
    const atr20 = calcATR20(
      taiexData.closes.map((c, i) => ({
        date: new Date(),
        open: c, high: c, low: c, close: c, adjClose: c, volume: 0,
      }))
    );
    // Simple volatility: compare current ATR20 to its 60-day median (stored in DB)
    const prevAtr = marketState.atr20 ?? atr20;
    volatilityMode = calcVolatilityMode(atr20, prevAtr);

    await updateMarketState(env.DB, {
      taiex_close: taiexData.close,
      taiex_daily_chg: taiexData.dailyChangePct,
      atr20,
      volatility_mode: volatilityMode,
    });
  }

  // ② Build sector map for quick lookups
  const sectorMap = new Map<string, SectorGroup>();
  for (const sector of sectors) {
    const syms: string[] = JSON.parse(sector.symbols ?? '[]');
    for (const sym of syms) sectorMap.set(sym, sector);
  }

  // ③ Process each watchlist stock sequentially.
  //    Running once after market close: TWSE always has today's data by 14:30.
  //    Sequential with 300ms gap is plenty fast for ~15 stocks and avoids any rate limiting.
  const sectorDailyPerfCache = new Map<string, number>();

  for (const stock of stocks) {
    try {
      await processStock(stock, stocks, sectors, volatilityMode, taiexChangePct, env);
    } catch (err) {
      console.error(`Failed to process ${stock.symbol}:`, err);
    }
    await new Promise(r => setTimeout(r, 300));
  }

  // ④ Weekly Monday enrichment refresh
  if (isWeeklyRefreshTime()) {
    console.log('Weekly enrichment refresh triggered');
    ctx_waitUntil_shim(() => refreshAllConceptTags(stocks, env));

    // Also refresh Chinese names for stocks that have English names
    ctx_waitUntil_shim(async () => {
      for (const stock of stocks) {
        const isEnglish = (stock.name.match(/[\u4e00-\u9fff]/g) ?? []).length < 2;
        if (isEnglish) {
          const code = stock.symbol.replace(/\.(TW|TWO)$/, '');
          const zhName = await lookupStockName(stock.symbol).catch(() => null);
          if (zhName && zhName !== stock.name) {
            await updateWatchlistStock(env.DB, stock.id, { name: zhName } as any).catch(console.error);
            console.log(`Refreshed name: ${stock.symbol} → ${zhName}`);
          }
        }
      }
    });
  }

  // ⑤ Monthly review check
  await runMonthlyReviewCheck(env);

  console.log(`Cron run complete. Processed ${stocks.length} stocks.`);
}

// -------------------------------------------------------
// Process a single stock
// -------------------------------------------------------

async function processStock(
  stock: WatchlistStock,
  allStocks: WatchlistStock[],
  sectors: SectorGroup[],
  volatilityMode: 'NORMAL' | 'HIGH',
  taiexChangePct: number,
  env: Env
): Promise<void> {
  const data = await fetchStockData(stock.symbol);
  if (!data) {
    console.warn(`No data for ${stock.symbol}`);
    return;
  }

  const { quote, history } = data;

  // Calculate indicators
  const ind = calcIndicators(stock, quote, history);
  const trendState = calcTrendState(ind.currentPrice, ind.day60High, ind.closes, ind.volumes);
  const pullbackZone = getPullbackZone(ind.pullbackPct, stock, volatilityMode);

  ind.trendState = trendState;
  ind.pullbackZone = pullbackZone;

  // Previous zone (from DB) for transition detection
  const prevZone: PullbackZone = (stock.pullback_zone as PullbackZone) ?? 'NONE';

  // Sector peer changes for RS + AI analysis
  const sector = sectors.find((s) => {
    const syms: string[] = JSON.parse(s.symbols ?? '[]');
    return syms.includes(stock.symbol);
  });

  const sectorPeers = sector
    ? allStocks
        .filter((s) => {
          const syms: string[] = JSON.parse(sector.symbols ?? '[]');
          return syms.includes(s.symbol) && s.symbol !== stock.symbol;
        })
        .map((s) => ({
          name: s.name,
          symbol: s.symbol,
          dailyChg: s.vol_ratio != null ? (s.pullback_from_high ?? 0) * -1 : 0,
        }))
    : [];

  // RS score
  const peerChanges = sectorPeers.map((p) => p.dailyChg);
  const rsScore = calcRsScore(quote.regularMarketChangePercent, peerChanges);

  // Write back to D1
  await writebackIndicators(env.DB, stock.id, ind, pullbackZone, trendState);

  // Evaluate notification triggers
  const triggers = evaluateTriggers(ind, prevZone);
  const cooldownOk = isCooledDown(stock.last_notified_at, stock.notify_cooldown_hrs);

  // ① Volume spike → AI analysis (highest priority, no cooldown skip)
  if (triggers.volumeSpike) {
    const aiAnalysis = await analyzeVolumeSpike(
      stock, ind, sectorPeers, taiexChangePct, volatilityMode, env
    );

    if (aiAnalysis) {
      const msg = buildVolumeSpikeMessage(stock, ind, aiAnalysis);
      const sent = await pushLineMessage(msg, env);
      if (sent) {
        await updateLastNotified(env.DB, stock.id);
        await insertNotificationLog(env.DB, stock.symbol, 'VOLUME_SPIKE', msg, aiAnalysis);
      }
    }
    return; // Volume spike takes full priority
  }

  if (!cooldownOk) return;

  // ② Ideal zone entry
  if (triggers.idealZoneEntry) {
    const msg = buildIdealZoneMessage(stock, ind, sectors);
    const sent = await sendNotification(msg, 'PULLBACK_IDEAL', stock, env);
    if (sent) {
      await updateLastNotified(env.DB, stock.id);
      await insertNotificationLog(env.DB, stock.symbol, 'PULLBACK_IDEAL', msg);
    }
    return;
  }

  // ③ Watch zone entry
  if (triggers.watchZoneEntry) {
    const _shortCode = stock.symbol.replace(/\.(TW|TWO)$/, '');
    const _watchPct  = stock.pullback_watch_pct  ?? 8;
    const _idealPct  = stock.pullback_ideal_pct  ?? 13;
    const _maxPct    = stock.pullback_max_pct    ?? 20;
    const _idealHigh = stock.day60_high ? stock.day60_high * (1 - _watchPct  / 100) : null;
    const _idealLow  = stock.day60_high ? stock.day60_high * (1 - _idealPct  / 100) : null;
    const _maxPrice  = stock.day60_high ? stock.day60_high * (1 - _maxPct    / 100) : null;
    const _zoneLines = _idealHigh && _idealLow && _maxPrice
      ? `\n理想買入帶：NT$${_idealLow.toFixed(0)}–${_idealHigh.toFixed(0)}（回測 ${_idealPct}%–${_watchPct}%）\n最大容忍：NT$${_maxPrice.toFixed(0)}（回測 ${_maxPct}%）`
      : '';
    const msg = `👀 觀察帶提醒\n${stock.name}（${_shortCode}）\n現價 NT$${ind.currentPrice.toFixed(0)}，回測 ${ind.pullbackPct.toFixed(1)}%，進入觀察帶${_zoneLines}`;
    const sent = await sendNotification(msg, 'PULLBACK_WATCH', stock, env);
    if (sent) {
      await updateLastNotified(env.DB, stock.id);
      await insertNotificationLog(env.DB, stock.symbol, 'PULLBACK_WATCH', msg);
    }
  }
}

// -------------------------------------------------------
// Monthly review
// -------------------------------------------------------

async function runMonthlyReviewCheck(env: Env): Promise<void> {
  const stocks = await getStocksForMonthlyReview(env.DB);
  const month = new Date().getMonth() + 1;

  for (const stock of stocks) {
    const msg = buildMonthlyReviewMessage(stock, month);
    await pushLineMessage(msg, env);
    await insertNotificationLog(env.DB, stock.symbol, 'MONTHLY_REVIEW', msg);

    // Extend review_after by 30 days
    const newReviewAfter = new Date();
    newReviewAfter.setDate(newReviewAfter.getDate() + 30);
    await env.DB
      .prepare("UPDATE watchlist SET review_after = ? WHERE id = ?")
      .bind(newReviewAfter.toISOString().slice(0, 10), stock.id)
      .run();
  }
}

// -------------------------------------------------------
// Unified notification sender
// Primary: direct LINE push; secondary: n8n if configured
// -------------------------------------------------------

async function sendNotification(
  msg: string,
  type: string,
  stock: WatchlistStock,
  env: Env
): Promise<boolean> {
  // Always push directly to LINE
  const sent = await pushLineMessage(msg, env);

  // Optionally relay to n8n if webhook URL is set
  if (env.N8N_WEBHOOK_URL) {
    await postToN8n(
      { triggerType: type as import('./types').TriggerType, symbol: stock.symbol, name: stock.name, message: msg, timestamp: new Date().toISOString() },
      env
    ).catch((err) => console.warn('n8n relay failed (non-fatal):', err));
  }

  return sent;
}

// Shim for ctx.waitUntil when not available (type-safety workaround)
function ctx_waitUntil_shim(fn: () => Promise<void>): void {
  fn().catch(console.error);
}
