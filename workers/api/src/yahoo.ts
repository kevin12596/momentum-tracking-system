// ============================================================
// yahoo-finance2 v3 wrapper for Taiwan stock data
// Price strategy: use daily closing prices only (stable, official).
// TW stocks (.TW / .TWO) → TWSE/TPEX after-market history, no real-time.
// Non-TW (e.g. ^TWII) → Yahoo Finance.
// ============================================================

import YahooFinance from 'yahoo-finance2';

// Singleton instance
const yf = new YahooFinance();

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
// TWSE / TPEX Chinese name lookup
// -------------------------------------------------------

async function fetchZhName(code: string): Promise<string | null> {
  try {
    const resp = await fetch(
      `https://www.twse.com.tw/zh/api/codeQuery?query=${encodeURIComponent(code)}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(3000) }
    );
    if (!resp.ok) return null;
    const data = await resp.json() as { suggestions?: string[] };
    if (data.suggestions && data.suggestions.length > 0) {
      const parts = data.suggestions[0].split('\t');
      return parts[1]?.trim() || null;
    }
    return null;
  } catch {
    return null;
  }
}

// -------------------------------------------------------
// Quote result type
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

/**
 * Fetch quote data.
 * For TW stocks: returns only the name; price fields are populated later
 * from historical data in fetchStockData (closing prices only, no real-time).
 * For non-TW (e.g. ^TWII index): uses Yahoo Finance.
 */
export async function fetchQuote(symbol: string): Promise<QuoteResult> {
  const isTW = symbol.endsWith('.TW') || symbol.endsWith('.TWO');

  if (isTW) {
    const code = fromYahooSymbol(symbol);
    const shortName = await fetchZhName(code).catch(() => null) ?? symbol;
    return {
      symbol,
      shortName,
      longName: undefined,
      regularMarketPrice: 0,
      regularMarketOpen: 0,
      regularMarketDayHigh: 0,
      regularMarketDayLow: 0,
      regularMarketPreviousClose: 0,
      regularMarketVolume: 0,
      regularMarketChangePercent: 0,
    };
  }

  // Non-TW symbols (^TWII, US stocks, etc.)
  const result = await yf.quote(symbol);
  return {
    symbol: result.symbol,
    shortName: result.shortName ?? symbol,
    longName: result.longName ?? undefined,
    regularMarketPrice: result.regularMarketPrice || result.regularMarketPreviousClose || 0,
    regularMarketOpen: result.regularMarketOpen ?? 0,
    regularMarketDayHigh: result.regularMarketDayHigh ?? 0,
    regularMarketDayLow: result.regularMarketDayLow ?? 0,
    regularMarketPreviousClose: result.regularMarketPreviousClose ?? 0,
    regularMarketVolume: result.regularMarketVolume ?? 0,
    regularMarketChangePercent: result.regularMarketChangePercent ?? 0,
  };
}

// -------------------------------------------------------
// Historical OHLCV fetch
// -------------------------------------------------------

export interface HistoricalBar {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose: number;
  volume: number;
}

// TWSE after-market daily data (official, unblocked).
// TSE:  twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?stockNo=2330&date=20260301&response=json
// OTC:  tpex.org.tw/web/stock/aftertrading/daily_trading_info/st43_result.php?l=zh-tw&d=115/03&stkno=3037&...
async function fetchTwseHistory(code: string, exchange: 'TSE' | 'OTC', days: number): Promise<HistoricalBar[]> {
  // Always use Taiwan local time (UTC+8) — Cloudflare Workers run in UTC,
  // so using new Date() directly would pick the wrong month before 16:00 UTC.
  const utcNow = new Date();
  const twNow  = new Date(utcNow.getTime() + 8 * 60 * 60 * 1000); // shift to UTC+8
  const twYear  = twNow.getUTCFullYear();
  const twMonth = twNow.getUTCMonth(); // 0-based

  const monthBarsResults = await Promise.all(
    [0, 1, 2, 3].map(async (offset): Promise<HistoricalBar[]> => {
      const d = new Date(twYear, twMonth - offset, 1);
      try {
        let rows: string[][] = [];
        if (exchange === 'TSE') {
          const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}01`;
          const resp = await fetch(
            `https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?stockNo=${code}&date=${dateStr}&response=json`,
            { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.twse.com.tw/' }, signal: AbortSignal.timeout(8000) }
          );
          if (!resp.ok) return [];
          const data = await resp.json() as { stat?: string; data?: string[][] };
          if (data.stat !== 'OK' || !data.data) return [];
          rows = data.data;
        } else {
          const rocYear = d.getFullYear() - 1911;
          const mon = String(d.getMonth() + 1).padStart(2, '0');
          const resp = await fetch(
            `https://www.tpex.org.tw/web/stock/aftertrading/daily_trading_info/st43_result.php?l=zh-tw&d=${rocYear}/${mon}&stkno=${code}&s=0,asc,0&output=json`,
            { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.tpex.org.tw/' }, signal: AbortSignal.timeout(8000) }
          );
          if (!resp.ok) return [];
          const data = await resp.json() as { aaData?: string[][] };
          if (!data.aaData) return [];
          rows = data.aaData;
        }

        const parsed: HistoricalBar[] = [];
        for (const row of rows) {
          const parts = row[0].split('/');
          if (parts.length < 3) continue;
          const year  = parseInt(parts[0]) + 1911;
          const month = parseInt(parts[1]);
          const day   = parseInt(parts[2]);
          const open  = parseFloat(row[3].replace(/,/g, '')) || 0;
          const high  = parseFloat(row[4].replace(/,/g, '')) || 0;
          const low   = parseFloat(row[5].replace(/,/g, '')) || 0;
          const close = parseFloat(row[6].replace(/,/g, '')) || 0;
          const vol   = parseInt(row[1].replace(/,/g, ''), 10) || 0;
          if (close > 0) {
            parsed.push({ date: new Date(year, month - 1, day), open, high, low, close, adjClose: close, volume: vol });
          }
        }
        return parsed;
      } catch {
        return [];
      }
    })
  );

  // monthBarsResults[0] = current month, [1] = prev, [2] = 2 months ago, [3] = 3 months ago
  // Reverse to get chronological order (oldest first), then flatten
  const allBars = monthBarsResults.reverse().flat();
  allBars.sort((a, b) => a.date.getTime() - b.date.getTime());

  return allBars.slice(-days);
}

// Stooq.com CSV download — reliable Taiwan stock fallback, no auth needed
// URL format: https://stooq.com/q/d/l/?s=2313.tw&i=d
async function fetchStooqHistory(code: string, days: number): Promise<HistoricalBar[]> {
  try {
    const resp = await fetch(
      `https://stooq.com/q/d/l/?s=${code.toLowerCase()}.tw&i=d`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) }
    );
    if (!resp.ok) return [];
    const csv = await resp.text();
    if (!csv.includes(',')) return [];
    const lines = csv.trim().split('\n');
    if (lines.length < 2) return [];
    const bars: HistoricalBar[] = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      if (parts.length < 5) continue;
      const date = new Date(parts[0]);
      const open  = parseFloat(parts[1]);
      const high  = parseFloat(parts[2]);
      const low   = parseFloat(parts[3]);
      const close = parseFloat(parts[4]);
      const vol   = parseInt(parts[5] ?? '0', 10) || 0;
      if (isNaN(date.getTime()) || close <= 0) continue;
      bars.push({ date, open: open || close, high: high || close, low: low || close, close, adjClose: close, volume: vol });
    }
    return bars.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(-days);
  } catch {
    return [];
  }
}

async function fetchYahooChartDirect(symbol: string, days: number): Promise<HistoricalBar[] | null> {
  try {
    const range = days <= 30 ? '1mo' : days <= 90 ? '3mo' : '6mo';
    const resp = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!resp.ok) return null;
    const data = await resp.json() as {
      chart?: {
        result?: Array<{
          timestamp?: number[];
          indicators?: {
            quote?: Array<{ open?: number[]; high?: number[]; low?: number[]; close?: number[]; volume?: number[] }>;
            adjclose?: Array<{ adjclose?: number[] }>;
          };
        }>;
      };
    };
    const result = data.chart?.result?.[0];
    if (!result?.timestamp) return null;
    const q = result.indicators?.quote?.[0];
    const adj = result.indicators?.adjclose?.[0]?.adjclose;
    if (!q) return null;
    return result.timestamp
      .map((ts, i) => ({
        date: new Date(ts * 1000),
        open: q.open?.[i] ?? 0,
        high: q.high?.[i] ?? 0,
        low: q.low?.[i] ?? 0,
        close: adj?.[i] ?? q.close?.[i] ?? 0,
        adjClose: adj?.[i] ?? q.close?.[i] ?? 0,
        volume: q.volume?.[i] ?? 0,
      }))
      .filter(b => b.close > 0);
  } catch {
    return null;
  }
}

export async function fetchHistory(symbol: string, days: number = 65): Promise<HistoricalBar[]> {
  const isTW = symbol.endsWith('.TW') || symbol.endsWith('.TWO');

  if (isTW) {
    const code = fromYahooSymbol(symbol);
    const exchange = symbol.endsWith('.TWO') ? 'OTC' : 'TSE';

    // Helper: days since last bar using Taiwan time (UTC+8)
    const staleness = (b: HistoricalBar[]): number => {
      if (b.length === 0) return 999;
      const twNow = Date.now() + 8 * 60 * 60 * 1000;
      return (twNow - b[b.length - 1].date.getTime()) / 86_400_000;
    };
    // A source is "fresh" if its last bar is within 7 calendar days.
    // 7 days covers normal weekends (Fri close → Mon morning = 3 days)
    // and short holiday breaks (up to ~5 days).
    const isFresh = (b: HistoricalBar[]) => b.length >= 20 && staleness(b) < 7;

    const bars = await fetchTwseHistory(code, exchange, days);
    console.log(`[hist] ${symbol} TWSE/${exchange}: ${bars.length} bars, ${staleness(bars).toFixed(1)}d ago`);
    if (isFresh(bars)) return bars;

    // Fallback 1: try the other exchange (handles mis-classified stocks)
    const altExchange: 'TSE' | 'OTC' = exchange === 'OTC' ? 'TSE' : 'OTC';
    const altBars = await fetchTwseHistory(code, altExchange, days);
    console.log(`[hist] ${symbol} TWSE/${altExchange}: ${altBars.length} bars, ${staleness(altBars).toFixed(1)}d ago`);
    if (isFresh(altBars)) return altBars;

    // Fallback 2: stooq.com CSV (reliable, no rate-limit, no auth)
    const stooqBars = await fetchStooqHistory(code, days);
    console.log(`[hist] ${symbol} stooq: ${stooqBars.length} bars, ${staleness(stooqBars).toFixed(1)}d ago`);
    if (stooqBars.length >= 5 && staleness(stooqBars) < 7) return stooqBars;

    // Fallback 3: Yahoo historical (may work via different CDN path)
    try {
      const period1 = new Date();
      period1.setDate(period1.getDate() - days);
      const results = await yf.historical(symbol, { period1: period1.toISOString().slice(0, 10), interval: '1d', events: 'history', includeAdjustedClose: true });
      const yBars = results.filter(r => r.close != null).map(r => ({ date: r.date, open: r.open ?? r.close, high: r.high ?? r.close, low: r.low ?? r.close, close: r.adjClose ?? r.close, adjClose: r.adjClose ?? r.close, volume: r.volume ?? 0 })).sort((a, b) => a.date.getTime() - b.date.getTime());
      if (yBars.length >= 5) return yBars;
    } catch { /* blocked */ }
    // Fallback 4: direct Yahoo chart HTTP (bypasses library)
    const directBars = await fetchYahooChartDirect(symbol, days);
    if (directBars && directBars.length >= 5) return directBars;
    // Return freshest available among all tried sources
    const candidates = [bars, altBars, stooqBars].filter(b => b.length > 0);
    if (candidates.length === 0) return [];
    return candidates.sort((a, b) => b[b.length - 1].date.getTime() - a[a.length - 1].date.getTime())[0];
  }

  // Non-TW: try yahoo-finance2, then direct HTTP chart API
  try {
    const period1 = new Date();
    period1.setDate(period1.getDate() - days);
    const results = await yf.historical(symbol, { period1: period1.toISOString().slice(0, 10), interval: '1d', events: 'history', includeAdjustedClose: true });
    const bars = results.filter(r => r.close != null && r.volume != null).map(r => ({ date: r.date, open: r.open ?? r.close, high: r.high ?? r.close, low: r.low ?? r.close, close: r.adjClose ?? r.close, adjClose: r.adjClose ?? r.close, volume: r.volume ?? 0 })).sort((a, b) => a.date.getTime() - b.date.getTime());
    if (bars.length >= 5) return bars;
  } catch { /* fall through */ }

  const directBars = await fetchYahooChartDirect(symbol, days);
  return directBars ?? [];
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
  // Try Yahoo Finance for ^TWII first
  try {
    const history = await fetchHistory('^TWII', 25);
    if (history.length >= 2) {
      const closes = history.map(h => h.close);
      const last = closes[closes.length - 1];
      const prev = closes[closes.length - 2];
      return { close: last, dailyChangePct: prev > 0 ? ((last - prev) / prev) * 100 : 0, closes };
    }
  } catch { /* fall through */ }

  // Fallback: 元大台灣50 ETF (0050.TW) closely tracks TAIEX (~99% correlation)
  try {
    const history = await fetchHistory('0050.TW', 25);
    if (history.length >= 2) {
      const closes = history.map(h => h.close);
      const last = closes[closes.length - 1];
      const prev = closes[closes.length - 2];
      return { close: last, dailyChangePct: prev > 0 ? ((last - prev) / prev) * 100 : 0, closes };
    }
  } catch { /* give up */ }

  return null;
}

// -------------------------------------------------------
// Stock name lookup (for add form)
// -------------------------------------------------------

export async function lookupStockName(symbol: string): Promise<string | null> {
  try {
    const code = fromYahooSymbol(symbol);
    if (symbol.endsWith('.TW') || symbol.endsWith('.TWO')) {
      const zhName = await fetchZhName(code);
      if (zhName) return zhName;
    }
    const result = await fetchQuote(symbol);
    return result.longName ?? result.shortName ?? null;
  } catch {
    return null;
  }
}

// -------------------------------------------------------
// TWSE MIS closing price — last-resort fallback
// -------------------------------------------------------
// Used when monthly STOCK_DAY + TPEX + stooq all return 0 bars
// (e.g. 興櫃 stocks, stocks not indexed by stooq, temporary suspensions).
// After market close (13:30 Taiwan), `z` = today's closing price.
// Tries tse_ and otc_ in one request; uses whichever responds.
export async function fetchMisPrice(code: string): Promise<number | null> {
  try {
    const resp = await fetch(
      `https://mis.twse.com.tw/stock/api/getStockInfo.asp?json=1&delay=0&ex_ch=tse_${code}.tw%7Cotc_${code}.tw`,
      { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://mis.twse.com.tw/' }, signal: AbortSignal.timeout(5000) }
    );
    if (!resp.ok) return null;
    const data = await resp.json() as { msgArray?: Array<{ z?: string; y?: string }> };
    const stock = data.msgArray?.find(s => s.z && s.z !== '-') ?? data.msgArray?.[0];
    if (!stock) return null;
    // z = last trade price (closing price after market close), y = previous close
    const price = parseFloat(stock.z ?? '') || parseFloat(stock.y ?? '') || 0;
    return price > 0 ? price : null;
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

    // For TW stocks the quote price is 0 (set to zero in fetchQuote intentionally).
    // Derive price fields from the last two history bars (closing prices only).
    if (quote.regularMarketPrice === 0 && history.length > 0) {
      const last = history[history.length - 1];
      const prev = history.length >= 2 ? history[history.length - 2] : last;
      quote.regularMarketPrice           = last.close;
      quote.regularMarketPreviousClose   = prev.close;
      quote.regularMarketVolume          = last.volume;
      quote.regularMarketDayHigh         = last.high;
      quote.regularMarketDayLow          = last.low;
      quote.regularMarketOpen            = last.open;
      quote.regularMarketChangePercent   = prev.close > 0 ? ((last.close - prev.close) / prev.close) * 100 : 0;
    }

    return { quote, history };
  } catch {
    return null;
  }
}
