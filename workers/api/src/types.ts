// ============================================================
// Shared TypeScript types for momentum-api Worker
// ============================================================

/** Cloudflare Workers environment bindings */
export interface Env {
  DB: D1Database;
  ANTHROPIC_API_KEY: string;
  N8N_WEBHOOK_URL: string;
  N8N_WEBHOOK_SECRET: string;
  LINE_CHANNEL_ACCESS_TOKEN: string;
  LINE_USER_ID: string;
  CLAUDE_DAILY_CALL_LIMIT: string;
}

// -------------------------------------------------------
// Database row types (mirror D1 schema)
// -------------------------------------------------------

export interface WatchlistStock {
  id: string;
  symbol: string;
  name: string;
  exchange: 'TSE' | 'OTC';

  price_at_add: number | null;
  high_ref_price: number | null;
  high_ref_date: string | null;
  pullback_watch_pct: number;
  pullback_ideal_pct: number;
  pullback_max_pct: number;

  industry: string | null;
  concept_tags: string | null;   // JSON string: string[]
  ai_summary: string | null;
  tags_updated_at: string | null;

  current_price: number | null;
  price_updated_at: string | null;
  day60_high: number | null;
  day60_low: number | null;
  day60_high_date: string | null;
  pullback_from_high: number | null;
  pullback_zone: 'WATCH' | 'IDEAL' | 'DEEP' | 'NONE' | null;
  trend_state: 'FALLING' | 'BASING' | 'BREAKOUT' | 'RUNNING' | null;
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
  symbols: string;     // JSON string: string[]
  weekly_perf: number | null;
  daily_perf: number | null;
  vs_taiex_weekly: number | null;
  leader_symbol: string | null;
  updated_at: string | null;
}

export interface NotificationLog {
  id: string;
  symbol: string;
  trigger_type: TriggerType;
  message: string | null;
  ai_analysis: string | null;
  sent_at: string;
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

// -------------------------------------------------------
// Domain types
// -------------------------------------------------------

export type PullbackZone = 'NONE' | 'WATCH' | 'IDEAL' | 'DEEP';
export type TrendState = 'FALLING' | 'BASING' | 'BREAKOUT' | 'RUNNING';
export type VolatilityMode = 'NORMAL' | 'HIGH';
export type TriggerType =
  | 'PULLBACK_WATCH'
  | 'PULLBACK_IDEAL'
  | 'PULLBACK_DEEP'
  | 'SECTOR_ACTIVE'
  | 'VOLUME_SPIKE'
  | 'AI_ANALYSIS'
  | 'MONTHLY_REVIEW';

/** Computed technical indicators for a single stock cycle */
export interface StockIndicators {
  currentPrice: number;
  open: number;
  high: number;
  low: number;
  close: number;
  todayVolume: number;
  dailyChangePct: number;
  day60High: number;
  day60Low: number;
  day60HighDate: string;
  pullbackPct: number;
  pullbackZone: PullbackZone;
  trendState: TrendState;
  pricePositionPct: number;
  volRatio: number;
  dropSpeed5d: number;
  avg20Vol: number;
  closes: number[];
  volumes: number[];
}

/** Notification trigger flags */
export interface NotificationTriggers {
  volumeSpike: boolean;
  idealZoneEntry: boolean;
  watchZoneEntry: boolean;
  sectorActive: boolean;
}

/** Payload sent to n8n webhook */
export interface N8nPayload {
  triggerType: TriggerType;
  symbol: string;
  name: string;
  message: string;
  aiAnalysis?: string;
  timestamp: string;
}

/** Sector peer info for AI prompt */
export interface SectorPeer {
  name: string;
  symbol: string;
  dailyChg: number;
}

/** Concept enrichment from Claude */
export interface ConceptEnrichment {
  industry: string;
  concept_tags: string[];
  ai_summary: string;
}

/** Add stock request body */
export interface AddStockRequest {
  symbol: string;
  name?: string;
  exchange?: 'TSE' | 'OTC';
  notes?: string;
  pullback_watch_pct?: number;
  pullback_ideal_pct?: number;
  pullback_max_pct?: number;
  high_ref_price?: number;
  high_ref_date?: string;
  notify_cooldown_hrs?: number;
}
