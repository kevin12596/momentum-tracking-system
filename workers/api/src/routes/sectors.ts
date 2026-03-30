// ============================================================
// REST routes: /api/sectors
// ============================================================

import type { Env } from '../types';
import { getAllSectors, upsertSectorGroup } from '../db';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

export async function handleSectors(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (request.method === 'GET') {
    const sectors = await getAllSectors(env.DB);
    return json(sectors);
  }

  if (request.method === 'POST') {
    const body = (await request.json()) as {
      name: string;
      symbols: string[];
      weekly_perf?: number;
      daily_perf?: number;
      vs_taiex_weekly?: number;
      leader_symbol?: string;
    };

    if (!body.name || !Array.isArray(body.symbols)) {
      return json({ error: 'name and symbols[] required' }, 400);
    }

    await upsertSectorGroup(env.DB, body.name, body.symbols, {
      weekly_perf: body.weekly_perf,
      daily_perf: body.daily_perf,
      vs_taiex_weekly: body.vs_taiex_weekly,
      leader_symbol: body.leader_symbol,
    });

    return json({ success: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}
