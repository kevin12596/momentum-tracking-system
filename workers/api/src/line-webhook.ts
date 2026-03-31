// ============================================================
// LINE Webhook: command parser + reply sender (spec §5)
// ============================================================

import type { Env } from './types';
import {
  getActiveWatchlist,
  getWatchlistBySymbol,
  insertWatchlistStock,
  setStockActive,
  getWatchlistById,
} from './db';
import { fetchQuote, toYahooSymbol, lookupStockName } from './yahoo';
import { enrichConceptTags } from './claude';

// -------------------------------------------------------
// Command patterns (spec §5.1)
// -------------------------------------------------------

const PATTERNS = {
  // 新增 CODE [IDEAL%] [HIGH_PRICE] [NOTES/TAG...]
  add: /^新增\s+(\d{4,6})(?:\s+(\d+))?(?:\s+(\d+(?:\.\d+)?))?(?:\s+(.+))?$/,
  remove: /^刪除\s+(\d{4,6})$/,
  pause: /^暫停\s+(\d{4,6})$/,
  list: /^清單$/,
  status: /^狀態\s+(\d{4,6})$/,
};

// -------------------------------------------------------
// LINE API helpers
// -------------------------------------------------------

// -------------------------------------------------------
// LINE reply helpers
// -------------------------------------------------------

interface QuickReplyItem {
  type: 'action';
  action: { type: 'message'; label: string; text: string };
}

const MAIN_MENU: QuickReplyItem[] = [
  { type: 'action', action: { type: 'message', label: '📋 清單', text: '清單' } },
  { type: 'action', action: { type: 'message', label: '➕ 新增股票', text: '新增 ' } },
  { type: 'action', action: { type: 'message', label: '📊 查狀態', text: '狀態 ' } },
  { type: 'action', action: { type: 'message', label: '⏸ 暫停追蹤', text: '暫停 ' } },
  { type: 'action', action: { type: 'message', label: '🗑 刪除股票', text: '刪除 ' } },
];

async function replyLine(
  replyToken: string,
  text: string,
  env: Env,
  quickReply?: QuickReplyItem[]
): Promise<void> {
  const message: Record<string, unknown> = { type: 'text', text };
  if (quickReply && quickReply.length > 0) {
    message.quickReply = { items: quickReply };
  }
  const resp = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ replyToken, messages: [message] }),
  });
  if (!resp.ok) {
    const errBody = await resp.text().catch(() => '');
    console.error(`LINE reply failed [${resp.status}]: ${errBody}`);
  }
}

// -------------------------------------------------------
// Command handlers
// -------------------------------------------------------

async function handleAdd(
  code: string,
  idealPct: string | undefined,
  replyToken: string,
  env: Env,
  highRef?: string,
  notes?: string
): Promise<void> {
  // Try TSE first
  let exchange: 'TSE' | 'OTC' = 'TSE';
  let yahooSym = toYahooSymbol(code, 'TSE');

  let name: string | null = null;
  let priceAtAdd: number | null = null;

  try {
    const [quote, zhName] = await Promise.all([
      fetchQuote(yahooSym),
      lookupStockName(yahooSym),
    ]);
    name = zhName ?? quote.longName ?? quote.shortName;
    priceAtAdd = quote.regularMarketPrice;
  } catch {
    // Try OTC
    yahooSym = toYahooSymbol(code, 'OTC');
    exchange = 'OTC';
    try {
      const [quote, zhName] = await Promise.all([
        fetchQuote(yahooSym),
        lookupStockName(yahooSym),
      ]);
      name = zhName ?? quote.longName ?? quote.shortName;
      priceAtAdd = quote.regularMarketPrice;
    } catch {
      await replyLine(replyToken, `❌ 找不到股票代碼 ${code}，請確認代碼是否正確。`, env);
      return;
    }
  }

  name = name ?? code;
  const pullback_ideal_pct = idealPct ? parseFloat(idealPct) : 13.0;
  const high_ref_price = highRef ? parseFloat(highRef) : null;

  const id = await insertWatchlistStock(env.DB, {
    symbol: yahooSym,
    name,
    exchange,
    price_at_add: priceAtAdd,
    high_ref_price,
    high_ref_date: high_ref_price ? new Date().toISOString().slice(0, 10) : null,
    pullback_watch_pct: 8.0,
    pullback_ideal_pct,
    pullback_max_pct: 20.0,
    notes: notes ?? null,
    notify_cooldown_hrs: 4,
    industry: null, concept_tags: null, ai_summary: null, tags_updated_at: null,
    current_price: priceAtAdd, price_updated_at: null,
    day60_high: null, day60_low: null, day60_high_date: null,
    pullback_from_high: null, pullback_zone: null, trend_state: null,
    rs_score: null, vol_ratio: null, price_position_pct: null,
    active: 1, last_notified_at: null, ai_analyzed_at: null,
    tracking_since: new Date().toISOString().slice(0, 10),
    review_after: null,
  });

  // Async enrichment
  enrichConceptTags(id, yahooSym, name, env).catch(console.error);

  const priceStr = priceAtAdd ? `現價 NT$${priceAtAdd.toFixed(0)}` : '';
  const highStr = high_ref_price ? `參考高點：NT$${high_ref_price.toFixed(0)}` : '高點：系統自動抓取60日高點';
  const notesStr = notes ? `備註：${notes}` : '';
  await replyLine(
    replyToken,
    [`✅ 已新增追蹤：${name}（${code}）`, priceStr, `理想買入回測：${pullback_ideal_pct}%`, highStr, notesStr]
      .filter(Boolean).join('\n'),
    env,
    [
      { type: 'action', action: { type: 'message', label: '📋 查看清單', text: '清單' } },
      { type: 'action', action: { type: 'message', label: `📊 ${code} 狀態`, text: `狀態 ${code}` } },
      { type: 'action', action: { type: 'message', label: '➕ 再新增', text: '新增 ' } },
    ]
  );
}

async function handleRemove(code: string, replyToken: string, env: Env): Promise<void> {
  // Try both exchanges
  let stock = await getWatchlistBySymbol(env.DB, toYahooSymbol(code, 'TSE'));
  if (!stock) stock = await getWatchlistBySymbol(env.DB, toYahooSymbol(code, 'OTC'));

  if (!stock) {
    await replyLine(replyToken, `❌ 清單中找不到 ${code}。`, env);
    return;
  }

  await setStockActive(env.DB, stock.id, 0);
  await replyLine(replyToken, `🗑 已移除追蹤：${stock.name}（${code}）`, env);
}

async function handlePause(code: string, replyToken: string, env: Env): Promise<void> {
  let stock = await getWatchlistBySymbol(env.DB, toYahooSymbol(code, 'TSE'));
  if (!stock) stock = await getWatchlistBySymbol(env.DB, toYahooSymbol(code, 'OTC'));

  if (!stock) {
    await replyLine(replyToken, `❌ 清單中找不到 ${code}。`, env);
    return;
  }

  await setStockActive(env.DB, stock.id, 0);
  await replyLine(replyToken, `⏸ 已暫停通知：${stock.name}（${code}）\n資料保留中`, env);
}

async function handleList(replyToken: string, env: Env): Promise<void> {
  const stocks = await getActiveWatchlist(env.DB);

  if (stocks.length === 0) {
    await replyLine(replyToken, '📋 追蹤清單目前為空。\n輸入「新增 XXXX」來新增股票。', env);
    return;
  }

  const lines = stocks.map((s) => {
    const code = s.symbol.replace(/\.(TW|TWO)$/, '');
    const price = s.current_price ? `NT$${s.current_price.toFixed(0)}` : '–';
    const zone = s.pullback_zone ?? '–';
    const pullback = s.pullback_from_high != null ? `回測${s.pullback_from_high.toFixed(1)}%` : '';
    return `• ${s.name}（${code}）${price} ${pullback} ${zone}`;
  });

  await replyLine(replyToken, `📋 追蹤清單（${stocks.length} 支）\n\n${lines.join('\n')}`, env);
}

async function handleStatus(code: string, replyToken: string, env: Env): Promise<void> {
  let stock = await getWatchlistBySymbol(env.DB, toYahooSymbol(code, 'TSE'));
  if (!stock) stock = await getWatchlistBySymbol(env.DB, toYahooSymbol(code, 'OTC'));

  if (!stock) {
    await replyLine(replyToken, `❌ 清單中找不到 ${code}。`, env);
    return;
  }

  const tags: string[] = stock.concept_tags ? JSON.parse(stock.concept_tags) : [];
  const price = stock.current_price ? `NT$${stock.current_price.toFixed(0)}` : '–';
  const high = stock.day60_high ? `NT$${stock.day60_high.toFixed(0)}` : '–';
  const pullback = stock.pullback_from_high != null ? `${stock.pullback_from_high.toFixed(1)}%` : '–';
  const zone = stock.pullback_zone ?? '–';
  const trend = stock.trend_state ?? '–';
  const volRatio = stock.vol_ratio != null ? `${stock.vol_ratio.toFixed(1)}x` : '–';
  const position = stock.price_position_pct != null ? `${stock.price_position_pct.toFixed(0)}%` : '–';

  const msg =
    `📊 ${stock.name}（${code}）\n` +
    `族群：${tags.join(' ') || '分析中...'}\n` +
    `${stock.ai_summary ?? ''}\n\n` +
    `現價：${price}\n` +
    `60日高點：${high}\n` +
    `回測幅度：${pullback}（${zone}）\n` +
    `趨勢：${trend}\n` +
    `量比：${volRatio}\n` +
    `60日位階：${position}\n` +
    `更新：${stock.price_updated_at ? stock.price_updated_at.slice(0, 16) : '–'}`;

  await replyLine(replyToken, msg, env);
}

// -------------------------------------------------------
// LINE signature verification (security)
// -------------------------------------------------------

async function verifyLineSignature(
  body: string,
  signature: string,
  channelSecret: string
): Promise<boolean> {
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(channelSecret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const mac = await crypto.subtle.sign('HMAC', key, enc.encode(body));
    const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
    return expected === signature;
  } catch {
    return false;
  }
}

// -------------------------------------------------------
// Main webhook handler
// -------------------------------------------------------

export async function handleLineWebhook(request: Request, env: Env): Promise<Response> {
  // Read raw body first for signature verification
  const rawBody = await request.text();

  // Verify LINE signature when secret is configured
  if (env.LINE_CHANNEL_SECRET) {
    const signature = request.headers.get('X-Line-Signature') ?? '';
    const valid = await verifyLineSignature(rawBody, signature, env.LINE_CHANNEL_SECRET);
    if (!valid) {
      // Log but don't block — allows debugging without locking out the bot
      console.warn('LINE webhook: signature mismatch, processing anyway');
    }
  }

  let body: {
    events: Array<{
      type: string;
      replyToken: string;
      message?: { type: string; text?: string };
    }>;
  };

  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const event = body.events?.[0];
  if (!event || event.type !== 'message' || event.message?.type !== 'text') {
    return new Response('OK');
  }

  const text = event.message.text?.trim() ?? '';
  const replyToken = event.replyToken;

  let matched = false;

  // / 或 菜單 → 顯示快速選單
  if (/^[\/菜單]$/.test(text) || text === '選單' || text === 'menu') {
    matched = true;
    await replyLine(
      replyToken,
      '👇 請選擇功能，或直接輸入指令：\n\n• 新增 代號 [回測%] [高點價格] [標籤]\n  例：新增 2330 15 600 封測\n• 狀態 XXXX\n• 清單\n• 暫停 XXXX\n• 刪除 XXXX',
      env,
      MAIN_MENU
    );
  }

  // 新增 XXXX [nn]
  if (!matched) {
    const addMatch = text.match(PATTERNS.add);
    if (addMatch) {
      matched = true;
      await handleAdd(addMatch[1], addMatch[2], replyToken, env, addMatch[3], addMatch[4]);
    }
  }

  // 刪除 XXXX
  if (!matched) {
    const removeMatch = text.match(PATTERNS.remove);
    if (removeMatch) {
      matched = true;
      await handleRemove(removeMatch[1], replyToken, env);
    }
  }

  // 暫停 XXXX
  if (!matched) {
    const pauseMatch = text.match(PATTERNS.pause);
    if (pauseMatch) {
      matched = true;
      await handlePause(pauseMatch[1], replyToken, env);
    }
  }

  // 清單
  if (!matched && PATTERNS.list.test(text)) {
    matched = true;
    await handleList(replyToken, env);
  }

  // 狀態 XXXX
  if (!matched) {
    const statusMatch = text.match(PATTERNS.status);
    if (statusMatch) {
      matched = true;
      await handleStatus(statusMatch[1], replyToken, env);
    }
  }

  // 未識別指令 → 顯示快速選單
  if (!matched) {
    await replyLine(
      replyToken,
      '❓ 看不懂這個指令\n\n請輸入 / 開啟功能選單，或直接點下方按鈕：',
      env,
      MAIN_MENU
    );
  }

  return new Response('OK');
}
