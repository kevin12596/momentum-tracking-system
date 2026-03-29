// ============================================================
// yahoo-finance2 wrapper for Taiwan stock data
// ============================================================

import yahooFinance from 'yahoo-finance2';
import type { StockIndicators } from './types';

// -------------------------------------------------------
// Taiwan trading hours guard
// -------------------------------------------------------

/** Returns true if current UTC time falls within Taiwan trading session
 *  09:00–13:30 TWN (UTC+8) = 01:00–05:30 UTC, weekdays only */
export function isTradingHours(): boolean {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const utcMin = now.getUTCMinutes();
  const utcDay = now.getUTCDay(); // 0=Sun, 6=Sat

  if (utcDay === 0 || utcDay === 6) return false;

  const totalMinutesUTC = utcHour * 60 + utcMin;
  const openUTC = 1 * 60;       // 01:00 UTC = 09:00 TWN
  const closeUTC = 5 * 60 + 30; // 05:30 UTC = 13:30 TWN

  return totalMinutesUTC >= openUTC && totalMinutesUTC <= closeUTC;
}

/** Check if today is Monday 02:00 UTC (weekly enrichment trigger) */
export function isWeeklyRefreshTime(): boolean {
  const now = new Date();
  return now.getUTCDay() === 1 && now.getUTCHours() === 2;
}

// -------------------------------------------------------
// Symbol utilities
// -------------------------------------------------------

/** Map bare Taiwan stock code to Yahoo Finance symbol */
export function toYahooSymbol(code: string, exchange: 'TSE' | 'OTC'): string {
  if (code.includes('.')) return code; // already qualified
  return exchange === 'OTC' ? `${code}.TWO` : `${code}.TW`;
}

/** Extract bare code from qualified Yahoo symbol */
export function fromYahooSymbol(symbol: string): string {
  return symbol.replace(/\.(TW|TWO)$/, '');
}

// -------------------------------------------------------
// Price / quote fetch
// -------------------------------------------------------

export interface QuoteResult {
  symbol: string;
  shortName: string;
  longName: string | undefined;
  regularMarketPrice: number;
  regularMarketOpen: number;
  regularMarketDayHigh: number;
  regularMarketDayLow: number;
  regularMarketPreviousClose: number;
  regularMarketVolume: number;
  regularMarketChangePercent: number;
}

export async function fetchQuote(symbol: string): Promise<QuoteResult> {
  const result = await yahooFinance.quote(symbol, {
    fields: [
      'regularMarketPrice',
      'regularMarketOpen',
      'regularMarketDayHigh',
      'regularMarketDayLow',
      'regularMarketPreviousClose',
      'regularMarketVolume',
      'regularMarketChangePercent',
      'shortName',
      'longName',
    ],
  });

  return {
    symbol: result.symbol,
    shortName: result.shortName ?? symbol,
    longName: result.longName,
    regularMarketPrice: result.regularMarketPrice ?? 0,
    regularMarketOpen: result.regularMarketOpen ?? 0,
    regularMarketDayHigh: result.regularMarketDayHigh ?? 0,
    regularMarketDayLow: result.regularMarketDayLow ?? 0,
    regularMarketPreviousClose: result.regularMarketPreviousClose ?? 0,
    regularMarketVolume: result.regularMarketVolume ?? 0,
    regularMarketChangePercent: result.regularMarketChangePercent ?? 0,
  };
}

// -------------------------------------------------------
// Historical OHLCV fetch (adjusted for dividends)
// -------------------------------------------------------

export interface HistoricalBar {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;          // adjusted close
  adjClose: number;
  volume: number;
}

export async function fetchHistory(symbol: string, days: number = 65): Promise<HistoricalBar[]> {
  const period1 = new Date();
  period1.setDate(period1.getDate() - days);

  const results = await yahooFinance.historical(symbol, {
    period1: period1.toISOString().slice(0, 10),
    interval: '1d',
    events: 'history',
    includeAdjustedClose: true,
  });

  return results
    .filter((r) => r.close != null && r.volume != null)
    .map((r) => ({
      date: r.date,
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.adjClose ?? r.close,
      adjClose: r.adjClose ?? r.close,
      volume: r.volume,
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

// -------------------------------------------------------
// TAIEX (加權指數) fetch  ^TWII
// -------------------------------------------------------

export interface TaiexData {
  close: number;
  dailyChangePct: number;
  closes: number[];
}

export async function fetchTaiex(): Promise<TaiexData | null> {
  try {
    const quote = await fetchQuote('^TWII');
    const history = await fetchHistory('^TWII', 25);
    const closes = history.map((h) => h.close);
    return {
      close: quote.regularMarketPrice,
      dailyChangePct: quote.regularMarketChangePercent,
      closes,
    };
  } catch {
    return null;
  }
}

// -------------------------------------------------------
// Stock name lookup (for add form)
// -------------------------------------------------------

export async function lookupStockName(symbol: string): Promise<string | null> {
  try {
    const result = await fetchQuote(symbol);
    return result.longName ?? result.shortName ?? null;
  } catch {
    return null;
  }
}

// -------------------------------------------------------
// Full indicator data fetch for a single stock
// -------------------------------------------------------

export async function fetchStockData(
  symbol: string
): Promise<{ quote: QuoteResult; history: HistoricalBar[] } | null> {
  try {
    const [quote, history] = await Promise.all([
      fetchQuote(symbol),
      fetchHistory(symbol, 65),
    ]);
    if (history.length < 20) return null;
    return { quote, history };
  } catch {
    return null;
  }
}
