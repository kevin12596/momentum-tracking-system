-- Add volume-price signal and action suggestion columns
ALTER TABLE watchlist ADD COLUMN vol_price_signal TEXT DEFAULT 'NEUTRAL';
ALTER TABLE watchlist ADD COLUMN action_suggestion TEXT DEFAULT 'HOLD';
