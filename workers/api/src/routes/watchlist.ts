// ============================================================
// REST routes: /api/watchlist
// ============================================================

import type { Env, AddStockRequest } from '../types';
import {
  getActiveWatchlist,
  getAllWatchlist,
  getWatchlistById,
  insertWatchlistStock,
  updateWatchlistStock,
  setStockActive,
  writebackIndicators,
} from '../db';
import { fetchQuote, fetchStockData, toYahooSymbol, lookupStockName } from '../yahoo';
import { calcIndicators, calcTrendState, getPullbackZone } from '../indicators';
import { enrichConceptTags } from '../claude';

/** Fire-and-forget: fetch 60-day data and write back indicators for a newly added / updated stock */
async function quickScan(id: string, symbol: string, db: D1Database): Promise<void> {
  try {
    const data = await fetchStockData(symbol);
    if (!data) return;
    const { quote, history } = data;
    // Use a minimal stock stub — we only need the zone thresholds from DB
    const stub = await getWatchlistById(db, id);
    if (!stub) return;
    const ind = calcIndicators(stub, quote, history);
    const trendState = calcTrendState(ind.currentPrice, ind.day60High, ind.closes, ind.volumes);
    const zone = getPullbackZone(ind.pullbackPct, stub, 'NORMAL');
    await writebackIndicators(db, id, ind, zone, trendState);
  } catch (e) {
    console.error(`quickScan failed for ${symbol}:`, e);
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

function err(message: string, status = 400): Response {
  return json({ error: message }, status);
}

export async function handleWatchlist(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pathParts = url.pathname.replace(/^\/api\/watchlist\/?/, '').split('/').filter(Boolean);

  // OPTIONS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  // GET /api/watchlist/lookup?symbol=2330
  if (request.method === 'GET' && pathParts[0] === 'lookup') {
    const symbol = url.searchParams.get('symbol');
    if (!symbol) return err('Missing symbol parameter');
    // Try TSE first, then OTC
    const tseSymbol = toYahooSymbol(symbol, 'TSE');
    try {
      const [quote, zhName] = await Promise.all([
        fetchQuote(tseSymbol),
        lookupStockName(tseSymbol),
      ]);
      return json({ symbol: tseSymbol, name: zhName ?? quote.longName ?? quote.shortName, exchange: 'TSE' });
    } catch {
      const otcSymbol = toYahooSymbol(symbol, 'OTC');
      try {
        const [quote, zhName] = await Promise.all([
          fetchQuote(otcSymbol),
          lookupStockName(otcSymbol),
        ]);
        return json({ symbol: otcSymbol, name: zhName ?? quote.longName ?? quote.shortName, exchange: 'OTC' });
      } catch {
        return err('Stock not found', 404);
      }
    }
  }

  // GET /api/watchlist/:id
  if (request.method === 'GET' && pathParts[0] && pathParts[0] !== 'lookup') {
    const stock = await getWatchlistById(env.DB, pathParts[0]);
    if (!stock) return err('Not found', 404);
    return json(stock);
  }

  // GET /api/watchlist
  if (request.method === 'GET') {
    const includeInactive = url.searchParams.get('all') === '1';
    const stocks = includeInactive ? await getAllWatchlist(env.DB) : await getActiveWatchlist(env.DB);
    return json(stocks);
  }

  // POST /api/watchlist
  if (request.method === 'POST') {
    let body: AddStockRequest;
    try {
      body = (await request.json()) as AddStockRequest;
    } catch {
      return err('Invalid JSON body');
    }

    if (!body.symbol) return err('symbol is required');

    const code = body.symbol.trim();
    const exchange = body.exchange ?? 'TSE';
    const yahooSym = toYahooSymbol(code, exchange);

    // Auto-lookup name if not provided
    let name = body.name;
    if (!name) {
      name = (await lookupStockName(yahooSym)) ?? code;
    }

    // Get current price for price_at_add
    let priceAtAdd: number | null = null;
    try {
      const quote = await fetchQuote(yahooSym);
      priceAtAdd = quote.regularMarketPrice;
    } catch {}

    const id = await insertWatchlistStock(env.DB, {
      symbol: yahooSym,
      name,
      exchange,
      price_at_add: priceAtAdd,
      high_ref_price: body.high_ref_price ?? null,
      high_ref_date: body.high_ref_date ?? null,
      pullback_watch_pct: body.pullback_watch_pct ?? 8.0,
      pullback_ideal_pct: body.pullback_ideal_pct ?? 13.0,
      pullback_max_pct: body.pullback_max_pct ?? 20.0,
      notes: body.notes ?? null,
      notify_cooldown_hrs: body.notify_cooldown_hrs ?? 4,
      // Fields populated by cron / enrichment later
      industry: null, concept_tags: null, ai_summary: null, tags_updated_at: null,
      current_price: priceAtAdd, price_updated_at: null,
      day60_high: null, day60_low: null, day60_high_date: null,
      pullback_from_high: null, pullback_zone: null, trend_state: null,
      rs_score: null, vol_ratio: null, price_position_pct: null,
      active: 1, last_notified_at: null, ai_analyzed_at: null,
      tracking_since: new Date().toISOString().slice(0, 10),
      review_after: null,
    });

    // Fire-and-forget: enrichment + immediate 60-day scan
    enrichConceptTags(id, yahooSym, name, env).catch(console.error);
    quickScan(id, yahooSym, env.DB).catch(console.error);

    const stock = await getWatchlistById(env.DB, id);
    return json(stock, 201);
  }

  // PUT /api/watchlist/:id
  if (request.method === 'PUT' && pathParts[0]) {
    const existing = await getWatchlistById(env.DB, pathParts[0]);
    if (!existing) return err('Not found', 404);

    let body: Partial<AddStockRequest & { active: number }>;
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return err('Invalid JSON body');
    }

    const updates: Record<string, unknown> = {};
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.pullback_watch_pct !== undefined) updates.pullback_watch_pct = body.pullback_watch_pct;
    if (body.pullback_ideal_pct !== undefined) updates.pullback_ideal_pct = body.pullback_ideal_pct;
    if (body.pullback_max_pct !== undefined) updates.pullback_max_pct = body.pullback_max_pct;
    if (body.high_ref_price !== undefined) updates.high_ref_price = body.high_ref_price;
    if (body.high_ref_date !== undefined) updates.high_ref_date = body.high_ref_date;
    if (body.notify_cooldown_hrs !== undefined) updates.notify_cooldown_hrs = body.notify_cooldown_hrs;
    if (body.active !== undefined) updates.active = body.active;

    await updateWatchlistStock(env.DB, pathParts[0], updates as any);

    // Re-scan immediately if high_ref_price or pullback thresholds changed
    if (body.high_ref_price !== undefined || body.pullback_ideal_pct !== undefined || body.pullback_watch_pct !== undefined) {
      quickScan(pathParts[0], existing.symbol, env.DB).catch(console.error);
    }

    const updated = await getWatchlistById(env.DB, pathParts[0]);
    return json(updated);
  }

  // DELETE /api/watchlist/:id (soft delete)
  if (request.method === 'DELETE' && pathParts[0]) {
    const existing = await getWatchlistById(env.DB, pathParts[0]);
    if (!existing) return err('Not found', 404);
    await setStockActive(env.DB, pathParts[0], 0);
    return json({ success: true });
  }

  return err('Method not allowed', 405);
}
