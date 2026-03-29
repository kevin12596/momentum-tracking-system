// ============================================================
// REST routes: /api/dashboard — aggregated view for frontend
// ============================================================

import type { Env, WatchlistStock, SectorGroup } from '../types';
import { getActiveWatchlist, getAllSectors, getMarketState } from '../db';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

export interface DashboardSectorGroup {
  sector: SectorGroup;
  stocks: WatchlistStock[];
}

export interface DashboardData {
  marketState: Awaited<ReturnType<typeof getMarketState>>;
  sectorGroups: DashboardSectorGroup[];
  alerts: WatchlistStock[];         // stocks in IDEAL or DEEP zone
  uncategorized: WatchlistStock[];  // stocks with no concept_tags
}

export async function handleDashboard(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (request.method !== 'GET') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const [stocks, sectors, marketState] = await Promise.all([
    getActiveWatchlist(env.DB),
    getAllSectors(env.DB),
    getMarketState(env.DB),
  ]);

  // Group stocks by sector
  const sectorGroups: DashboardSectorGroup[] = [];
  const assignedIds = new Set<string>();

  for (const sector of sectors) {
    const sectorSymbols: string[] = JSON.parse(sector.symbols ?? '[]');
    const sectorStocks = stocks.filter((s) => sectorSymbols.includes(s.symbol));

    if (sectorStocks.length > 0) {
      sectorGroups.push({ sector, stocks: sectorStocks });
      sectorStocks.forEach((s) => assignedIds.add(s.id));
    }
  }

  // Also group by concept_tags for stocks not in a formal sector
  const unassigned = stocks.filter((s) => !assignedIds.has(s.id));
  const tagMap = new Map<string, WatchlistStock[]>();

  for (const stock of unassigned) {
    const tags: string[] = stock.concept_tags ? JSON.parse(stock.concept_tags) : [];
    if (tags.length === 0) continue;
    const primaryTag = tags[0];
    if (!tagMap.has(primaryTag)) tagMap.set(primaryTag, []);
    tagMap.get(primaryTag)!.push(stock);
    assignedIds.add(stock.id);
  }

  for (const [tagName, tagStocks] of tagMap) {
    sectorGroups.push({
      sector: {
        id: `tag-${tagName}`,
        name: tagName,
        symbols: JSON.stringify(tagStocks.map((s) => s.symbol)),
        weekly_perf: null,
        daily_perf: null,
        vs_taiex_weekly: null,
        leader_symbol: null,
        updated_at: null,
      },
      stocks: tagStocks,
    });
  }

  const alerts = stocks.filter(
    (s) => s.pullback_zone === 'IDEAL' || s.pullback_zone === 'DEEP'
  );

  const uncategorized = stocks.filter((s) => !assignedIds.has(s.id));

  return json({
    marketState,
    sectorGroups,
    alerts,
    uncategorized,
  } satisfies DashboardData);
}
