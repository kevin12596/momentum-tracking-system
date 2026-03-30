// ============================================================
// Shared frontend types (mirrors Worker DB types)
// ============================================================

export type PullbackZone = 'NONE' | 'WATCH' | 'IDEAL' | 'DEEP';
export type TrendState = 'FALLING' | 'BASING' | 'BREAKOUT' | 'RUNNING';
export type Exchange = 'TSE' | 'OTC';

export interface WatchlistStock {
  id: string;
  symbol: string;
  name: string;
  exchange: Exchange;

  price_at_add: number | null;
  high_ref_price: number | null;
  high_ref_date: string | null;
  pullback_watch_pct: number;
  pullback_ideal_pct: number;
  pullback_max_pct: number;

  industry: string | null;
  concept_tags: string | null;  // JSON string[]
  ai_summary: string | null;
  tags_updated_at: string | null;

  current_price: number | null;
  price_updated_at: string | null;
  day60_high: number | null;
  day60_low: number | null;
  day60_high_date: string | null;
  pullback_from_high: number | null;
  pullback_zone: PullbackZone | null;
  trend_state: TrendState | null;
  rs_score: number | null;
  vol_ratio: number | null;
  price_position_pct: number | null;

  active: number;
  last_notified_at: string | null;
  notify_cooldown_hrs: number;
  ai_analyzed_at: string | null;

  tracking_since: string;
  review_after: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SectorGroup {
  id: string;
  name: string;
  symbols: string;  // JSON string[]
  weekly_perf: number | null;
  daily_perf: number | null;
  vs_taiex_weekly: number | null;
  leader_symbol: string | null;
  updated_at: string | null;
}

export interface MarketState {
  id: number;
  taiex_close: number | null;
  taiex_daily_chg: number | null;
  atr20: number | null;
  volatility_mode: 'NORMAL' | 'HIGH';
  ai_calls_today: number;
  ai_calls_date: string | null;
  updated_at: string | null;
}

export interface DashboardSectorGroup {
  sector: SectorGroup;
  stocks: WatchlistStock[];
}

export interface DashboardData {
  marketState: MarketState;
  sectorGroups: DashboardSectorGroup[];
  alerts: WatchlistStock[];
  uncategorized: WatchlistStock[];
}

export interface LookupResult {
  symbol: string;
  name: string;
  exchange: Exchange;
}

export interface AddStockPayload {
  symbol: string;
  name?: string;
  exchange?: Exchange;
  notes?: string;
  pullback_watch_pct?: number;
  pullback_ideal_pct?: number;
  pullback_max_pct?: number;
  high_ref_price?: number;
  high_ref_date?: string;
  notify_cooldown_hrs?: number;
}
