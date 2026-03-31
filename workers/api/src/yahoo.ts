// ============================================================
// yahoo-finance2 v3 wrapper for Taiwan stock data
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

/** Fetch the official Chinese abbreviated name from TWSE autocomplete API.
 *  Works for both TSE (上市) and OTC (上櫃) stocks.
 *  Returns null on failure so callers can fall back to Yahoo name. */
async function fetchZhName(code: string): Promise<string | null> {
  try {
    const resp = await fetch(
      `https://www.twse.com.tw/zh/api/codeQuery?query=${encodeURIComponent(code)}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(3000) }
    );
    if (!resp.ok) return null;
    const data = await resp.json() as { suggestions?: string[] };
    if (data.suggestions && data.suggestions.length > 0) {
      // Format: "2313\t華通" — take the part after the tab
      const parts = data.suggestions[0].split('\t');
      return parts[1]?.trim() || null;
    }
    return null;
  } catch {
    return null;
  }
}

// -------------------------------------------------------
// TWSE / TPEX real-time price (fallback when Yahoo quote fails)
// mis.twse.com.tw — official exchange real-time data
// -------------------------------------------------------

interface TwseStockInfo {
  z?: string;  // current price (or "-" before market open)
  y?: string;  // yesterday close
  h?: string;  // today high
  l?: string;  // today low
  o?: string;  // today open
  v?: string;  // volume (lots)
  n?: string;  // Chinese name
}

async function fetchTwsePrice(code: string, exchange: 'TSE' | 'OTC'): Promise<{ price: number; prevClose: number } | null> {
  try {
    const exPrefix = exchange === 'OTC' ? 'otc' : 'tse';
    const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${exPrefix}_${code}.tw&json=1&delay=0`;
    const resp = await fetch(url, {
      headers: { 'Referer': 'https://mis.twse.com.tw/', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as { msgArray?: TwseStockInfo[]; rtmessage?: string };
    const item = data.msgArray?.[0];
    if (!item) return null;
    const price = parseFloat(item.z ?? '') || 0;
    const prevClose = parseFloat(item.y ?? '') || 0;
    // z = "-" before market open, use prevClose in that case
    return { price: price > 0 ? price : prevClose, prevClose };
  } catch {
    return null;
  }
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
  // For Taiwan stocks (.TW / .TWO), try TWSE official API first.
  // Yahoo Finance quote endpoint is sometimes blocked from cloud IPs.
  let twsePrice: { price: number; prevClose: number } | null = null;
  const isTW = symbol.endsWith('.TW') || symbol.endsWith('.TWO');
  if (isTW) {
    const code = fromYahooSymbol(symbol);
    const exchange = symbol.endsWith('.TWO') ? 'OTC' : 'TSE';
    twsePrice = await fetchTwsePrice(code, exchange).catch(() => null);
  }

  // Try Yahoo quote (for non-TW symbols or when TWSE didn't return a name)
  let yahooResult: Awaited<ReturnType<typeof yf.quote>> | null = null;
  try {
    yahooResult = await yf.quote(symbol);
  } catch {
    // Yahoo blocked or failed — use TWSE data only
  }

  const regularMarketPrice =
    twsePrice?.price ||
    yahooResult?.regularMarketPrice ||
    yahooResult?.regularMarketPreviousClose ||
    twsePrice?.prevClose ||
    0;

  return {
    symbol: yahooResult?.symbol ?? symbol,
    shortName: yahooResult?.shortName ?? symbol,
    longName: yahooResult?.longName ?? undefined,
    regularMarketPrice,
    regularMarketOpen: yahooResult?.regularMarketOpen ?? 0,
    regularMarketDayHigh: yahooResult?.regularMarketDayHigh ?? 0,
    regularMarketDayLow: yahooResult?.regularMarketDayLow ?? 0,
    regularMarketPreviousClose: yahooResult?.regularMarketPreviousClose ?? twsePrice?.prevClose ?? 0,
    regularMarketVolume: yahooResult?.regularMarketVolume ?? 0,
    regularMarketChangePercent: yahooResult?.regularMarketChangePercent ?? 0,
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
  close: number;       // adjusted close
  adjClose: number;
  volume: number;
}

// TWSE/TPEX after-market daily data — used as fallback when Yahoo historical is blocked.
// TSE:  twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?stockNo=2330&date=20260301&response=json
// OTC:  tpex.org.tw/web/stock/aftertrading/daily_trading_info/st43_result.php?l=zh-tw&d=115/03&stkno=3037&...
async function fetchTwseHistory(code: string, exchange: 'TSE' | 'OTC', days: number): Promise<HistoricalBar[]> {
  const bars: HistoricalBar[] = [];
  const today = new Date();

  for (let offset = 0; offset < 4 && bars.length < days; offset++) {
    const d = new Date(today.getFullYear(), today.getMonth() - offset, 1);
    try {
      let rows: string[][] = [];
      if (exchange === 'TSE') {
        const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}01`;
        const resp = await fetch(
          `https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?stockNo=${code}&date=${dateStr}&response=json`,
          { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(6000) }
        );
        if (!resp.ok) continue;
        const data = await resp.json() as { stat?: string; data?: string[][] };
        if (data.stat !== 'OK' || !data.data) continue;
        rows = data.data;
      } else {
        const rocYear = d.getFullYear() - 1911;
        const mon = String(d.getMonth() + 1).padStart(2, '0');
        const resp = await fetch(
          `https://www.tpex.org.tw/web/stock/aftertrading/daily_trading_info/st43_result.php?l=zh-tw&d=${rocYear}/${mon}&stkno=${code}&s=0,asc,0&output=json`,
          { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.tpex.org.tw/' }, signal: AbortSignal.timeout(6000) }
        );
        if (!resp.ok) continue;
        const data = await resp.json() as { aaData?: string[][] };
        if (!data.aaData) continue;
        rows = data.aaData;
      }

      // Rows are oldest-first; insert at front so final array is chronological
      const monthBars: HistoricalBar[] = [];
      for (const row of rows) {
        // Date: "115/03/03" (ROC) → convert year
        const parts = row[0].split('/');
        if (parts.length < 3) continue;
        const year = parseInt(parts[0]) + 1911;
        const month = parseInt(parts[1]);
        const day = parseInt(parts[2]);
        const open  = parseFloat(row[3].replace(/,/g, '')) || 0;
        const high  = parseFloat(row[4].replace(/,/g, '')) || 0;
        const low   = parseFloat(row[5].replace(/,/g, '')) || 0;
        const close = parseFloat(row[6].replace(/,/g, '')) || 0;
        const vol   = parseInt(row[1].replace(/,/g, ''), 10) || 0;
        if (close > 0) {
          monthBars.push({ date: new Date(year, month - 1, day), open, high, low, close, adjClose: close, volume: vol });
        }
      }
      // Prepend this month's bars (older months added in later iterations)
      bars.unshift(...monthBars);
    } catch {
      // Skip failed month
    }
  }

  return bars.slice(-days);
}

export async function fetchHistory(symbol: string, days: number = 65): Promise<HistoricalBar[]> {
  // Try Yahoo Finance first
  try {
    const period1 = new Date();
    period1.setDate(period1.getDate() - days);

    const results = await yf.historical(symbol, {
      period1: period1.toISOString().slice(0, 10),
      interval: '1d',
      events: 'history',
      includeAdjustedClose: true,
    });

    const bars = results
      .filter((r) => r.close != null && r.volume != null)
      .map((r) => ({
        date: r.date,
        open: r.open ?? r.close,
        high: r.high ?? r.close,
        low: r.low ?? r.close,
        close: r.adjClose ?? r.close,
        adjClose: r.adjClose ?? r.close,
        volume: r.volume ?? 0,
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    if (bars.length >= 20) return bars;
  } catch {
    // Yahoo historical blocked or failed — fall through to TWSE
  }

  // TWSE fallback for Taiwan stocks
  const isTW = symbol.endsWith('.TW') || symbol.endsWith('.TWO');
  if (isTW) {
    const code = fromYahooSymbol(symbol);
    const exchange = symbol.endsWith('.TWO') ? 'OTC' : 'TSE';
    return fetchTwseHistory(code, exchange, days);
  }

  return [];
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
    // Prefer Chinese name from TWSE for Taiwan stocks
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
    // If real-time price is unavailable (blocked/after-hours), use last historical close
    if (quote.regularMarketPrice === 0 && history.length > 0) {
      const lastClose = history[history.length - 1].close;
      quote.regularMarketPrice = lastClose;
      if (quote.regularMarketPreviousClose === 0) quote.regularMarketPreviousClose = lastClose;
    }
    return { quote, history };
  } catch {
    return null;
  }
}
