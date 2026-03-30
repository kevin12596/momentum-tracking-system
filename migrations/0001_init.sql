-- Migration 0001: Initial schema for 動能股票追蹤系統

CREATE TABLE IF NOT EXISTS watchlist (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  exchange TEXT NOT NULL CHECK (exchange IN ('TSE', 'OTC')),

  -- Pullback buy-point settings
  price_at_add REAL,
  high_ref_price REAL,
  high_ref_date TEXT,
  pullback_watch_pct REAL DEFAULT 8.0,
  pullback_ideal_pct REAL DEFAULT 13.0,
  pullback_max_pct REAL DEFAULT 20.0,

  -- Sector / concept tags (AI generated)
  industry TEXT,
  concept_tags TEXT,        -- JSON array, e.g. '["AI伺服器","散熱","CoWoS"]'
  ai_summary TEXT,
  tags_updated_at TEXT,

  -- Technical state (written back by cron worker)
  current_price REAL,
  price_updated_at TEXT,
  day60_high REAL,
  day60_low REAL,
  day60_high_date TEXT,
  pullback_from_high REAL,
  pullback_zone TEXT CHECK (pullback_zone IN ('WATCH', 'IDEAL', 'DEEP', 'NONE')),
  trend_state TEXT CHECK (trend_state IN ('FALLING', 'BASING', 'BREAKOUT', 'RUNNING')),
  rs_score REAL,
  vol_ratio REAL,
  price_position_pct REAL,

  -- Notification control
  active INTEGER DEFAULT 1,
  last_notified_at TEXT,
  notify_cooldown_hrs INTEGER DEFAULT 4,
  ai_analyzed_at TEXT,

  -- Tracking metadata
  tracking_since TEXT DEFAULT (date('now')),
  review_after TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_watchlist_symbol ON watchlist(symbol);
CREATE INDEX IF NOT EXISTS idx_watchlist_active ON watchlist(active);
CREATE INDEX IF NOT EXISTS idx_watchlist_pullback_zone ON watchlist(pullback_zone);

-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS sector_groups (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  symbols TEXT NOT NULL,     -- JSON array of symbols
  weekly_perf REAL,
  daily_perf REAL,
  vs_taiex_weekly REAL,
  leader_symbol TEXT,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sector_name ON sector_groups(name);

-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS notification_log (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  symbol TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'PULLBACK_WATCH', 'PULLBACK_IDEAL', 'PULLBACK_DEEP',
    'SECTOR_ACTIVE', 'VOLUME_SPIKE', 'AI_ANALYSIS', 'MONTHLY_REVIEW'
  )),
  message TEXT,
  ai_analysis TEXT,
  sent_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notif_symbol ON notification_log(symbol);
CREATE INDEX IF NOT EXISTS idx_notif_sent_at ON notification_log(sent_at);

-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS market_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  taiex_close REAL,
  taiex_daily_chg REAL,
  atr20 REAL,                         -- TAIEX 20-day ATR
  volatility_mode TEXT DEFAULT 'NORMAL' CHECK (volatility_mode IN ('NORMAL', 'HIGH')),
  ai_calls_today INTEGER DEFAULT 0,   -- Daily Claude API call counter
  ai_calls_date TEXT,                 -- Date string for counter reset
  updated_at TEXT
);

-- Seed a single market_state row
INSERT OR IGNORE INTO market_state (id) VALUES (1);
