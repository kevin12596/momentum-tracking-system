// ============================================================
// Notification message builder + n8n webhook sender (spec §4)
// ============================================================

import type {
  Env,
  WatchlistStock,
  StockIndicators,
  SectorGroup,
  TriggerType,
  N8nPayload,
  SectorPeer,
} from './types';

// -------------------------------------------------------
// Message formatters (spec §4.1 – 4.4)
// -------------------------------------------------------

function formatDate(isoOrDatetime: string): string {
  const d = new Date(isoOrDatetime);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatDateShort(isoDate: string): string {
  const d = new Date(isoDate);
  const daysAgo = Math.round((Date.now() - d.getTime()) / 86_400_000);
  return `${daysAgo}天前`;
}

/** §4.1 IDEAL zone entry notification */
export function buildIdealZoneMessage(
  stock: WatchlistStock,
  ind: StockIndicators,
  sectorGroups: SectorGroup[]
): string {
  const conceptTags: string[] = stock.concept_tags ? JSON.parse(stock.concept_tags) : [];
  const highDateStr = stock.day60_high_date ? formatDateShort(stock.day60_high_date) : '–';
  const now = formatDate(new Date().toISOString());

  // Find matching sector
  const matchedSector = sectorGroups.find((s) => {
    const syms: string[] = JSON.parse(s.symbols ?? '[]');
    return syms.includes(stock.symbol);
  });

  const sectorLine = matchedSector
    ? `${matchedSector.name}族群本週 ${matchedSector.weekly_perf != null ? (matchedSector.weekly_perf >= 0 ? '+' : '') + matchedSector.weekly_perf.toFixed(1) : '?'}%（${matchedSector.vs_taiex_weekly != null ? (matchedSector.vs_taiex_weekly >= 0 ? '強於大盤 +' : '弱於大盤 ') + Math.abs(matchedSector.vs_taiex_weekly).toFixed(1) : ''}%）\n族群最強：${matchedSector.leader_symbol ?? '?'}`
    : '無族群資訊';

  const volStatus =
    ind.volRatio < 0.8
      ? '量縮（健康）'
      : ind.volRatio > 2.0
      ? `爆量 ${ind.volRatio.toFixed(1)}x`
      : `量比 ${ind.volRatio.toFixed(1)}x`;

  const priceRange = ind.day60High - ind.day60Low;
  const rangePct = ind.day60High > 0 ? (priceRange / ind.day60High) * 100 : 0;

  return `📊 動能買點提醒

股票：${stock.name}（${stock.symbol.replace(/\.(TW|TWO)$/, '')}）
現價：NT$${ind.currentPrice.toFixed(0)}　60日高點：NT$${ind.day60High.toFixed(0)}（${highDateStr}）
回測幅度：${ind.pullbackPct.toFixed(1)}% ← 進入理想買入帶

技術狀態
趨勢：${ind.trendState}（${ind.trendState === 'BASING' ? '整理中' : ind.trendState === 'FALLING' ? '下跌中' : ind.trendState === 'BREAKOUT' ? '突破' : '上升'}）
量能：${volStatus}
60日區間位置：${ind.pricePositionPct.toFixed(0)}%（${ind.pricePositionPct < 33 ? '低檔' : ind.pricePositionPct < 67 ? '中段' : '高檔'}）
區間波動幅度：${rangePct.toFixed(0)}%

族群狀態
${sectorLine}${stock.notes ? `\n備註：${stock.notes}` : ''}

時間：${now}`;
}

/** §4.2 Volume spike AI analysis notification */
export function buildVolumeSpikeMessage(
  stock: WatchlistStock,
  ind: StockIndicators,
  aiAnalysis: string
): string {
  const now = formatDate(new Date().toISOString());
  const shortCode = stock.symbol.replace(/\.(TW|TWO)$/, '');

  return `🔍 爆量深度分析

${stock.name}（${shortCode}）| 回測 ${ind.pullbackPct.toFixed(1)}% | 量比 ${ind.volRatio.toFixed(1)}x

【AI判讀】
${aiAnalysis}

此為 AI 輔助判斷，請結合自身風控決策
時間：${now}`;
}

/** §4.3 Sector activation notification */
export function buildSectorActiveMessage(
  sector: SectorGroup,
  trackedStocks: WatchlistStock[],
  taiexChange: number
): string {
  const now = formatDate(new Date().toISOString());
  const perfStr =
    (sector.daily_perf ?? 0) >= 0
      ? `+${(sector.daily_perf ?? 0).toFixed(1)}`
      : `${(sector.daily_perf ?? 0).toFixed(1)}`;
  const taiexStr = taiexChange >= 0 ? `+${taiexChange.toFixed(1)}` : `${taiexChange.toFixed(1)}`;

  const stockLines = trackedStocks.map((s, i) => {
    const isLast = i === trackedStocks.length - 1;
    const prefix = isLast ? '└' : '├';
    const shortCode = s.symbol.replace(/\.(TW|TWO)$/, '');
    const chgStr = s.pullback_from_high != null
      ? `回測 ${s.pullback_from_high.toFixed(1)}% ${s.pullback_zone ?? ''}`
      : '資料更新中';
    const chg = s.vol_ratio != null
      ? `${(s.pullback_from_high ?? 0) > 0 ? '-' : '+'}${Math.abs(s.pullback_from_high ?? 0).toFixed(1)}%`
      : '';
    return `${prefix} ${s.name} ${shortCode}：${chg}（${chgStr}）`;
  });

  return `🚀 族群啟動提醒

${sector.name}族群今日 ${perfStr}%（大盤 ${taiexStr}%）
超額報酬：${((sector.daily_perf ?? 0) - taiexChange) >= 0 ? '+' : ''}${((sector.daily_perf ?? 0) - taiexChange).toFixed(1)}%

你的追蹤股
${stockLines.join('\n')}

時間：${now}`;
}

/** §4.4 Monthly review notification */
export function buildMonthlyReviewMessage(
  stock: WatchlistStock,
  month: number
): string {
  const daysSince = stock.tracking_since
    ? Math.round((Date.now() - new Date(stock.tracking_since).getTime()) / 86_400_000)
    : '?';
  const priceAtAdd = stock.price_at_add ?? 0;
  const current = stock.current_price ?? 0;
  const chgPct = priceAtAdd > 0 ? ((current - priceAtAdd) / priceAtAdd) * 100 : 0;
  const chgStr = chgPct >= 0 ? `+${chgPct.toFixed(1)}` : chgPct.toFixed(1);
  const shortCode = stock.symbol.replace(/\.(TW|TWO)$/, '');

  const idealLow = stock.day60_high ? stock.day60_high * (1 - (stock.pullback_ideal_pct ?? 13) / 100) : null;
  const idealHigh = stock.day60_high ? stock.day60_high * (1 - (stock.pullback_watch_pct ?? 8) / 100) : null;
  const distPct =
    current > 0 && idealLow && idealHigh
      ? Math.min(Math.abs(current - idealLow), Math.abs(current - idealHigh)) / current * 100
      : null;

  return `📅 月度追蹤回顧（${month}月）

${stock.name} ${shortCode} 已追蹤 ${daysSince} 天
新增時：NT$${priceAtAdd.toFixed(0)} → 現價 NT$${current.toFixed(0)}（${chgStr}%）
${idealLow && idealHigh ? `理想買入帶：NT$${idealLow.toFixed(0)}–${idealHigh.toFixed(0)}（距離 ${distPct != null ? distPct.toFixed(1) : '?'}%）\n` : ''}
參考高點是否需要重新評估？`;
}

// -------------------------------------------------------
// n8n webhook sender
// -------------------------------------------------------

export async function postToN8n(
  payload: N8nPayload,
  env: Env
): Promise<boolean> {
  if (!env.N8N_WEBHOOK_URL) return false;

  try {
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // HMAC-SHA256 signature if secret is configured
    if (env.N8N_WEBHOOK_SECRET) {
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(env.N8N_WEBHOOK_SECRET),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
      const sigHex = Array.from(new Uint8Array(sig))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      headers['X-Webhook-Signature'] = `sha256=${sigHex}`;
    }

    const response = await fetch(env.N8N_WEBHOOK_URL, {
      method: 'POST',
      headers,
      body,
    });

    return response.ok;
  } catch {
    return false;
  }
}

// -------------------------------------------------------
// LINE Push message sender (for proactive cron notifications)
// -------------------------------------------------------

export async function pushLineMessage(message: string, env: Env): Promise<boolean> {
  if (!env.LINE_CHANNEL_ACCESS_TOKEN || !env.LINE_USER_ID) return false;

  try {
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        to: env.LINE_USER_ID,
        messages: [{ type: 'text', text: message }],
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
