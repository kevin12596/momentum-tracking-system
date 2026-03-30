// ============================================================
// Claude API integration: volume spike analysis + concept enrichment
// ============================================================

import type { Env, WatchlistStock, StockIndicators, SectorPeer, ConceptEnrichment } from './types';
import {
  getAiCallsToday,
  incrementAiCallCounter,
  updateAiAnalyzedAt,
  updateConceptTags,
} from './db';

const CLAUDE_MODEL = 'claude-sonnet-4-20250514';

// -------------------------------------------------------
// Volume spike AI analysis (spec §3.4)
// -------------------------------------------------------

export async function analyzeVolumeSpike(
  stock: WatchlistStock,
  ind: StockIndicators,
  sectorPeers: SectorPeer[],
  taiexChangePct: number,
  volatilityMode: string,
  env: Env
): Promise<string | null> {
  // Guard: same stock already analyzed today
  if (stock.ai_analyzed_at) {
    const today = new Date().toISOString().slice(0, 10);
    if (stock.ai_analyzed_at >= today) return null;
  }

  // Guard: global daily call limit
  const dailyLimit = parseInt(env.CLAUDE_DAILY_CALL_LIMIT ?? '10', 10);
  const callsToday = await getAiCallsToday(env.DB);
  if (callsToday >= dailyLimit) return null;

  const conceptTagsArr: string[] = stock.concept_tags ? JSON.parse(stock.concept_tags) : [];
  const peerLines = sectorPeers
    .map((p) => `- ${p.name}：${p.dailyChg >= 0 ? '+' : ''}${p.dailyChg.toFixed(1)}%`)
    .join('\n');

  const prompt = `你是一位台股動能投資分析師。以下是一支股票今日的關鍵數據，
請判斷這個爆量信號的性質，並給出簡短操作建議。

【股票】${stock.name}（${stock.symbol}）
【族群】${conceptTagsArr.join('、')}
【今日數據】
- 現價：NT$${ind.currentPrice.toFixed(2)}
- 60日高點：NT$${ind.day60High.toFixed(2)}（${stock.day60_high_date ?? '–'}），回測幅度：${ind.pullbackPct.toFixed(1)}%
- 今日成交量：${ind.todayVolume.toLocaleString()}張（20日均量 ${ind.avg20Vol.toLocaleString()}張，量比 ${ind.volRatio.toFixed(1)}x）
- 今日K棒：開 ${ind.open.toFixed(2)} 高 ${ind.high.toFixed(2)} 低 ${ind.low.toFixed(2)} 收 ${ind.close.toFixed(2)}
- 近5日跌幅：${ind.dropSpeed5d.toFixed(1)}%
- 趨勢狀態：${ind.trendState}

【族群狀態】
${peerLines}
- 加權指數今日：${taiexChangePct >= 0 ? '+' : ''}${taiexChangePct.toFixed(1)}%
- 市場波動模式：${volatilityMode}

請嚴格用以下格式回答（繁體中文，總字數 120 字以內）：
信號性質：[恐慌性止跌承接 / 大戶出逃 / 不明確]
理由：（2句話）
建議：[可考慮進場 / 觀望 / 迴避]
風險提示：（1句話）`;

  try {
    await incrementAiCallCounter(env.DB);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'tools-2024-04-04',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 300,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error('Claude API error:', response.status, await response.text());
      return null;
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text?: string }>;
    };

    const textBlock = data.content.find((b) => b.type === 'text');
    const result = textBlock?.text?.trim() ?? null;

    if (result) {
      await updateAiAnalyzedAt(env.DB, stock.id);
    }

    return result;
  } catch (err) {
    console.error('Claude API call failed:', err);
    return null;
  }
}

// -------------------------------------------------------
// Concept tag enrichment (spec §6)
// -------------------------------------------------------

export async function enrichConceptTags(
  stockId: string,
  symbol: string,
  name: string,
  env: Env
): Promise<ConceptEnrichment | null> {
  const prompt = `請針對台股 ${symbol}（${name}）提供以下資訊，以 JSON 格式回答：
{
  "industry": "官方產業別（如：半導體業）",
  "concept_tags": ["標籤1", "標籤2", "標籤3"],
  "ai_summary": "一句話說明這家公司在其最重要族群中的定位（30字以內）"
}
注意：只回傳 JSON，不要任何說明文字。`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as {
      content: Array<{ type: string; text?: string }>;
    };

    const textBlock = data.content.find((b) => b.type === 'text');
    if (!textBlock?.text) return null;

    // Extract JSON from response (strip markdown code fences if present)
    const raw = textBlock.text.trim();
    const jsonStr = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    const parsed = JSON.parse(jsonStr) as ConceptEnrichment;

    if (!parsed.industry || !Array.isArray(parsed.concept_tags) || !parsed.ai_summary) {
      return null;
    }

    // Write to D1
    await updateConceptTags(env.DB, stockId, parsed.industry, parsed.concept_tags, parsed.ai_summary);

    return parsed;
  } catch (err) {
    console.error('Enrichment failed for', symbol, err);
    return null;
  }
}

// -------------------------------------------------------
// Weekly batch enrichment refresh
// -------------------------------------------------------

export async function refreshAllConceptTags(
  stocks: WatchlistStock[],
  env: Env
): Promise<void> {
  // Stagger calls to avoid rate limits
  for (const stock of stocks) {
    try {
      await enrichConceptTags(stock.id, stock.symbol, stock.name, env);
      // Small delay between enrichment calls
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (err) {
      console.error('Refresh failed for', stock.symbol, err);
    }
  }
}
