// ============================================================
// Technical indicator calculations (spec §3.2)
// ============================================================

import type {
  WatchlistStock,
  StockIndicators,
  PullbackZone,
  TrendState,
  VolatilityMode,
} from './types';
import type { HistoricalBar, QuoteResult } from './yahoo';

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

/** Compute 20-day ATR for the TAIEX volatility mode */
export function calcATR20(bars: HistoricalBar[]): number {
  if (bars.length < 2) return 0;
  const recent = bars.slice(-21);
  const trs: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    const high = recent[i].high;
    const low = recent[i].low;
    const prevClose = recent[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trs.push(tr);
  }
  return avg(trs);
}

// -------------------------------------------------------
// Core indicator calculation
// -------------------------------------------------------

export function calcIndicators(
  stock: WatchlistStock,
  quote: QuoteResult,
  history: HistoricalBar[]
): StockIndicators {
  const closes = history.map((h) => h.close);
  const volumes = history.map((h) => h.volume);

  const recent60 = history.slice(-60);
  const closes60 = recent60.map((h) => h.close);

  // 60-day high/low (adjusted)
  const day60High = Math.max(...closes60);
  const day60Low = Math.min(...closes60);
  const day60HighBar = recent60.find((h) => h.close === day60High);
  const day60HighDate = day60HighBar
    ? day60HighBar.date.toISOString().slice(0, 10)
    : history[history.length - 1].date.toISOString().slice(0, 10);

  const currentPrice = quote.regularMarketPrice;

  // Price position in 60-day range (0% = low, 100% = high)
  const pricePositionPct =
    day60High === day60Low
      ? 50
      : ((currentPrice - day60Low) / (day60High - day60Low)) * 100;

  // Pullback from high
  const pullbackPct = day60High > 0 ? ((day60High - currentPrice) / day60High) * 100 : 0;

  // Use manual high_ref_price override if set
  const effectiveHigh = stock.high_ref_price ?? day60High;
  const effectivePullbackPct =
    effectiveHigh > 0 ? ((effectiveHigh - currentPrice) / effectiveHigh) * 100 : pullbackPct;

  // Volume ratio: today / 20-day avg volume
  const vol20 = volumes.slice(-20);
  const avg20Vol = avg(vol20);
  const todayVolume = quote.regularMarketVolume;
  const volRatio = avg20Vol > 0 ? todayVolume / avg20Vol : 0;

  // 5-day price drop speed
  const len = closes.length;
  const dropSpeed5d =
    len >= 6 && closes[len - 6] > 0
      ? ((currentPrice - closes[len - 6]) / closes[len - 6]) * 100
      : 0;

  return {
    currentPrice,
    open: quote.regularMarketOpen,
    high: quote.regularMarketDayHigh,
    low: quote.regularMarketDayLow,
    close: quote.regularMarketPrice,
    todayVolume,
    dailyChangePct: quote.regularMarketChangePercent,
    day60High: effectiveHigh,
    day60Low,
    day60HighDate,
    pullbackPct: effectivePullbackPct,
    pullbackZone: 'NONE', // set separately
    trendState: 'FALLING', // set separately
    pricePositionPct,
    volRatio,
    dropSpeed5d,
    avg20Vol,
    closes,
    volumes,
  };
}

// -------------------------------------------------------
// Trend state classification
// -------------------------------------------------------

export function calcTrendState(
  currentPrice: number,
  day60High: number,
  closes: number[],
  volumes: number[]
): TrendState {
  // BREAKOUT: within 2% of 60-day high
  if (currentPrice >= day60High * 0.98) return 'BREAKOUT';

  // MA60 slope and position
  const len = closes.length;
  if (len >= 60) {
    const ma60 = avg(closes.slice(-60));
    const ma60Prev = avg(closes.slice(-61, -1));
    const ma60Slope = ma60 - ma60Prev;

    if (ma60Slope > 0 && currentPrice > ma60) return 'RUNNING';
  }

  // BASING: recent volumes shrinking AND price range tight
  const recentVols = volumes.slice(-5);
  const recentVolShrinking = recentVols.every((v, i, arr) => i === 0 || v <= arr[i - 1]);
  const recent5Closes = closes.slice(-5);
  const priceRange5d =
    recent5Closes.length > 0
      ? (Math.max(...recent5Closes) - Math.min(...recent5Closes)) /
        recent5Closes[recent5Closes.length - 1]
      : 1;

  if (recentVolShrinking && priceRange5d < 0.08) return 'BASING';

  return 'FALLING';
}

// -------------------------------------------------------
// Pullback zone classification
// -------------------------------------------------------

export function getPullbackZone(
  pullbackPct: number,
  stock: WatchlistStock,
  volatilityMode: VolatilityMode
): PullbackZone {
  const mult = volatilityMode === 'HIGH' ? 1.2 : 1.0;
  const maxMult = volatilityMode === 'HIGH' ? 1.3 : 1.0;

  const watchMin = stock.pullback_watch_pct * mult;
  const idealMin = stock.pullback_ideal_pct * mult;
  const maxLimit = stock.pullback_max_pct * maxMult;

  if (pullbackPct < watchMin) return 'NONE';
  if (pullbackPct < idealMin) return 'WATCH';
  if (pullbackPct < maxLimit) return 'IDEAL';
  return 'DEEP';
}

// -------------------------------------------------------
// Market volatility mode
// -------------------------------------------------------

export function calcVolatilityMode(atr20: number, atr20Median: number): VolatilityMode {
  return atr20 > atr20Median * 1.3 ? 'HIGH' : 'NORMAL';
}

/** Compute ATR20 median from a list of recent ATR20 values (rolling 60-day window) */
export function calcATR20Median(atr20Values: number[]): number {
  if (atr20Values.length === 0) return 0;
  const sorted = [...atr20Values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// -------------------------------------------------------
// Sector relative strength
// -------------------------------------------------------

/** RS score for a stock vs its sector peers: -100 to +100 */
export function calcRsScore(stockDailyChg: number, peerChanges: number[]): number {
  if (peerChanges.length === 0) return 0;
  const sectorAvg = avg(peerChanges);
  const excess = stockDailyChg - sectorAvg;
  // Normalize: ±5% excess maps to ±100
  return Math.max(-100, Math.min(100, (excess / 5) * 100));
}

// -------------------------------------------------------
// Notification condition evaluation
// -------------------------------------------------------

export function evaluateTriggers(
  ind: StockIndicators,
  prevZone: PullbackZone | null
): { volumeSpike: boolean; idealZoneEntry: boolean; watchZoneEntry: boolean } {
  const volumeSpike =
    ind.volRatio >= 2.5 &&
    ind.pullbackZone === 'DEEP' &&
    Math.abs(ind.dailyChangePct) >= 3.0;

  const idealZoneEntry =
    ind.pullbackZone === 'IDEAL' &&
    prevZone !== 'IDEAL' &&
    ind.trendState === 'BASING';

  const watchZoneEntry =
    ind.pullbackZone === 'WATCH' &&
    prevZone === 'NONE';

  return { volumeSpike, idealZoneEntry, watchZoneEntry };
}

export function isCooledDown(lastNotifiedAt: string | null, cooldownHrs: number): boolean {
  if (!lastNotifiedAt) return true;
  const diffMs = Date.now() - new Date(lastNotifiedAt).getTime();
  return diffMs >= cooldownHrs * 3_600_000;
}
