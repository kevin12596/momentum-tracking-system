// ============================================================
// Claude API integration: volume spike analysis + concept enrichment
// ============================================================

import type { Env, WatchlistStock, StockIndicators, SectorPeer, ConceptEnrichment } from './types';
import {
  getAiCallsToday,
  incrementAiCallCounter,
  updateAiAnalyzedAt,
  updateConceptTags,
  getAllSectors,
  updateWatchlistStock,
} from './db';
import { fetchMisData, isValidChineseName } from './yahoo';

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
// Anti-hallucination: Claude can only assign tags from the
// existing sector list in DB. Output is validated post-call.
// -------------------------------------------------------

export async function enrichConceptTags(
  stockId: string,
  symbol: string,
  name: string,
  env: Env
): Promise<ConceptEnrichment | null> {
  // Step 1: Fix name if not Chinese (verifiable success criterion: ≥2 Chinese chars)
  const code = symbol.replace(/\.(TW|TWO)$/, '');
  if (!isValidChineseName(name)) {
    const { name: misName } = await fetchMisData(code).catch(() => ({ price: null, name: null }));
    if (misName && isValidChineseName(misName)) {
      await updateWatchlistStock(env.DB, stockId, { name: misName } as any).catch(console.error);
      name = misName;
      console.log(`[name] enrichConceptTags fixed name: ${symbol} → ${misName}`);
    }
  }

  // Step 2: Fetch existing sectors as the allowed set (constrains LLM output)
  const sectors = await getAllSectors(env.DB);
  const allowedSectors = sectors.map(s => s.name);
  const sectorList = allowedSectors.length > 0
    ? allowedSectors.join('、')
    : '（尚未建立族群，請填空陣列）';

  // Step 3: Constrained prompt — Claude maps to existing sectors only
  const prompt = `你是台股分類系統。請針對台股 ${symbol}（${name}）提供分類資訊，以 JSON 格式回答。

【重要限制】concept_tags 只能從以下現有族群清單選擇，不可自創新標籤：
${sectorList}
若無合適族群，concept_tags 填 []。

{
  "industry": "TWSE官方產業別（如：光電業、半導體業、電腦及週邊設備業）",
  "concept_tags": ["從上方清單選，最多2個，沒有合適的就填空陣列"],
  "ai_summary": "主要產品或業務一句話（20字內）",
  "confidence": "HIGH或LOW（LOW=不確定族群歸屬）"
}
只回傳 JSON，不要任何說明。`;

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

    const raw = textBlock.text.trim();
    const jsonStr = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    const parsed = JSON.parse(jsonStr) as ConceptEnrichment & { confidence?: string };

    if (!parsed.industry || !Array.isArray(parsed.concept_tags) || !parsed.ai_summary) {
      return null;
    }

    // Step 4: Validate — strip any tags NOT in the allowed sector list (removes hallucinations)
    const validTags = allowedSectors.length > 0
      ? parsed.concept_tags.filter(t => allowedSectors.includes(t))
      : parsed.concept_tags;

    const stripped = parsed.concept_tags.length - validTags.length;
    if (stripped > 0) {
      console.warn(`[enrich] ${symbol}: stripped ${stripped} hallucinated tag(s): ${parsed.concept_tags.filter(t => !allowedSectors.includes(t)).join(', ')}`);
    }

    // Step 5: If confidence is LOW, clear sector tags (no sector > wrong sector)
    const finalTags = parsed.confidence === 'LOW' ? [] : validTags;
    if (parsed.confidence === 'LOW') {
      console.log(`[enrich] ${symbol}: LOW confidence — sector tags cleared`);
    }

    await updateConceptTags(env.DB, stockId, parsed.industry, finalTags, parsed.ai_summary);

    return { industry: parsed.industry, concept_tags: finalTags, ai_summary: parsed.ai_summary };
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
