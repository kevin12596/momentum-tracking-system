// ============================================================
// D1 database query helpers
// ============================================================

import type { D1Database } from '@cloudflare/workers-types';
import type {
  WatchlistStock,
  SectorGroup,
  MarketState,
  NotificationLog,
  TriggerType,
  PullbackZone,
  TrendState,
  StockIndicators,
} from './types';

// -------------------------------------------------------
// Watchlist
// -------------------------------------------------------

export async function getActiveWatchlist(db: D1Database): Promise<WatchlistStock[]> {
  const result = await db
    .prepare('SELECT * FROM watchlist WHERE active = 1 ORDER BY created_at DESC')
    .all<WatchlistStock>();
  return result.results;
}

export async function getWatchlistById(db: D1Database, id: string): Promise<WatchlistStock | null> {
  return db.prepare('SELECT * FROM watchlist WHERE id = ?').bind(id).first<WatchlistStock>();
}

export async function getWatchlistBySymbol(
  db: D1Database,
  symbol: string
): Promise<WatchlistStock | null> {
  return db
    .prepare('SELECT * FROM watchlist WHERE symbol = ? AND active = 1')
    .bind(symbol)
    .first<WatchlistStock>();
}

export async function getAllWatchlist(db: D1Database): Promise<WatchlistStock[]> {
  const result = await db
    .prepare('SELECT * FROM watchlist ORDER BY created_at DESC')
    .all<WatchlistStock>();
  return result.results;
}

export async function insertWatchlistStock(
  db: D1Database,
  stock: Omit<WatchlistStock, 'id' | 'created_at' | 'updated_at'>
): Promise<string> {
  const id = crypto.randomUUID().replace(/-/g, '');
  await db
    .prepare(
      `INSERT INTO watchlist (
        id, symbol, name, exchange,
        price_at_add, high_ref_price, high_ref_date,
        pullback_watch_pct, pullback_ideal_pct, pullback_max_pct,
        notes, notify_cooldown_hrs, tracking_since, review_after, active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, date('now'), date('now', '+30 days'), 1)`
    )
    .bind(
      id,
      stock.symbol,
      stock.name,
      stock.exchange,
      stock.price_at_add ?? null,
      stock.high_ref_price ?? null,
      stock.high_ref_date ?? null,
      stock.pullback_watch_pct ?? 8.0,
      stock.pullback_ideal_pct ?? 13.0,
      stock.pullback_max_pct ?? 20.0,
      stock.notes ?? null,
      stock.notify_cooldown_hrs ?? 4
    )
    .run();
  return id;
}

export async function updateWatchlistStock(
  db: D1Database,
  id: string,
  fields: Partial<WatchlistStock>
): Promise<void> {
  const sets: string[] = [];
  const values: (string | number | null)[] = [];

  for (const [key, val] of Object.entries(fields)) {
    if (key === 'id' || key === 'created_at') continue;
    sets.push(`${key} = ?`);
    values.push(val as string | number | null);
  }
  sets.push("updated_at = datetime('now')");
  values.push(id);

  await db
    .prepare(`UPDATE watchlist SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();
}

/** Write back computed technical indicators to D1 */
export async function writebackIndicators(
  db: D1Database,
  id: string,
  ind: StockIndicators,
  pullbackZone: PullbackZone,
  trendState: TrendState
): Promise<void> {
  await db
    .prepare(
      `UPDATE watchlist SET
        current_price = CASE WHEN ? > 0 THEN ? ELSE current_price END,
        price_updated_at = CASE WHEN ? > 0 THEN datetime('now') ELSE price_updated_at END,
        day60_high = ?,
        day60_low = ?,
        day60_high_date = ?,
        pullback_from_high = ?,
        pullback_zone = ?,
        trend_state = ?,
        vol_ratio = ?,
        price_position_pct = ?,
        updated_at = datetime('now')
      WHERE id = ?`
    )
    .bind(
      ind.currentPrice, // CASE check
      ind.currentPrice, // CASE value
      ind.currentPrice, // CASE check for price_updated_at
      ind.day60High,
      ind.day60Low,
      ind.day60HighDate,
      ind.pullbackPct,
      pullbackZone,
      trendState,
      ind.volRatio,
      ind.pricePositionPct,
      id
    )
    .run();
}

export async function updateLastNotified(db: D1Database, id: string): Promise<void> {
  await db
    .prepare("UPDATE watchlist SET last_notified_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
    .bind(id)
    .run();
}

export async function updateAiAnalyzedAt(db: D1Database, id: string): Promise<void> {
  await db
    .prepare("UPDATE watchlist SET ai_analyzed_at = date('now'), updated_at = datetime('now') WHERE id = ?")
    .bind(id)
    .run();
}

export async function updateConceptTags(
  db: D1Database,
  id: string,
  industry: string,
  conceptTags: string[],
  aiSummary: string
): Promise<void> {
  await db
    .prepare(
      `UPDATE watchlist SET
        industry = ?,
        concept_tags = ?,
        ai_summary = ?,
        tags_updated_at = date('now'),
        updated_at = datetime('now')
      WHERE id = ?`
    )
    .bind(industry, JSON.stringify(conceptTags), aiSummary, id)
    .run();
}

export async function setStockActive(db: D1Database, id: string, active: 0 | 1): Promise<void> {
  await db
    .prepare("UPDATE watchlist SET active = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(active, id)
    .run();
}

export async function getStocksForMonthlyReview(db: D1Database): Promise<WatchlistStock[]> {
  const result = await db
    .prepare("SELECT * FROM watchlist WHERE active = 1 AND review_after <= date('now')")
    .all<WatchlistStock>();
  return result.results;
}

// -------------------------------------------------------
// Sector groups
// -------------------------------------------------------

export async function getAllSectors(db: D1Database): Promise<SectorGroup[]> {
  const result = await db
    .prepare('SELECT * FROM sector_groups ORDER BY name')
    .all<SectorGroup>();
  return result.results;
}

export async function upsertSectorGroup(
  db: D1Database,
  name: string,
  symbols: string[],
  perf: Partial<Pick<SectorGroup, 'weekly_perf' | 'daily_perf' | 'vs_taiex_weekly' | 'leader_symbol'>>
): Promise<void> {
  const existing = await db
    .prepare('SELECT id FROM sector_groups WHERE name = ?')
    .bind(name)
    .first<{ id: string }>();

  if (existing) {
    await db
      .prepare(
        `UPDATE sector_groups SET
          symbols = ?, weekly_perf = ?, daily_perf = ?,
          vs_taiex_weekly = ?, leader_symbol = ?, updated_at = datetime('now')
        WHERE name = ?`
      )
      .bind(
        JSON.stringify(symbols),
        perf.weekly_perf ?? null,
        perf.daily_perf ?? null,
        perf.vs_taiex_weekly ?? null,
        perf.leader_symbol ?? null,
        name
      )
      .run();
  } else {
    const id = crypto.randomUUID().replace(/-/g, '');
    await db
      .prepare(
        `INSERT INTO sector_groups (id, name, symbols, weekly_perf, daily_perf, vs_taiex_weekly, leader_symbol, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      )
      .bind(
        id, name, JSON.stringify(symbols),
        perf.weekly_perf ?? null, perf.daily_perf ?? null,
        perf.vs_taiex_weekly ?? null, perf.leader_symbol ?? null
      )
      .run();
  }
}

// -------------------------------------------------------
// Notification log
// -------------------------------------------------------

export async function insertNotificationLog(
  db: D1Database,
  symbol: string,
  triggerType: TriggerType,
  message: string,
  aiAnalysis?: string
): Promise<void> {
  const id = crypto.randomUUID().replace(/-/g, '');
  await db
    .prepare(
      `INSERT INTO notification_log (id, symbol, trigger_type, message, ai_analysis)
      VALUES (?, ?, ?, ?, ?)`
    )
    .bind(id, symbol, triggerType, message, aiAnalysis ?? null)
    .run();
}

// -------------------------------------------------------
// Market state
// -------------------------------------------------------

export async function getMarketState(db: D1Database): Promise<MarketState> {
  const row = await db.prepare('SELECT * FROM market_state WHERE id = 1').first<MarketState>();
  return row ?? {
    id: 1,
    taiex_close: null,
    taiex_daily_chg: null,
    atr20: null,
    volatility_mode: 'NORMAL',
    ai_calls_today: 0,
    ai_calls_date: null,
    updated_at: null,
  };
}

export async function updateMarketState(
  db: D1Database,
  fields: Partial<Omit<MarketState, 'id'>>
): Promise<void> {
  const sets: string[] = [];
  const values: (string | number | null)[] = [];

  for (const [key, val] of Object.entries(fields)) {
    sets.push(`${key} = ?`);
    values.push(val as string | number | null);
  }
  sets.push("updated_at = datetime('now')");
  values.push(); // no extra bind needed, WHERE is constant

  await db
    .prepare(`UPDATE market_state SET ${sets.join(', ')} WHERE id = 1`)
    .bind(...values)
    .run();
}

/** Increment Claude API call counter (with date-based reset) */
export async function incrementAiCallCounter(db: D1Database): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const state = await getMarketState(db);

  let newCount: number;
  if (state.ai_calls_date !== today) {
    newCount = 1;
  } else {
    newCount = (state.ai_calls_today ?? 0) + 1;
  }

  await db
    .prepare("UPDATE market_state SET ai_calls_today = ?, ai_calls_date = ?, updated_at = datetime('now') WHERE id = 1")
    .bind(newCount, today)
    .run();

  return newCount;
}

export async function getAiCallsToday(db: D1Database): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const state = await getMarketState(db);
  if (state.ai_calls_date !== today) return 0;
  return state.ai_calls_today ?? 0;
}
