// ============================================================
// Typed API client for momentum-api Worker
// ============================================================

import type {
  WatchlistStock,
  SectorGroup,
  MarketState,
  DashboardData,
  LookupResult,
  AddStockPayload,
} from './types';

const BASE = import.meta.env.VITE_API_BASE ?? '/api';

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error((err as { error?: string }).error ?? `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

// -------------------------------------------------------
// Watchlist
// -------------------------------------------------------

export const api = {
  watchlist: {
    list(includeInactive = false): Promise<WatchlistStock[]> {
      return request<WatchlistStock[]>(`/watchlist${includeInactive ? '?all=1' : ''}`);
    },

    get(id: string): Promise<WatchlistStock> {
      return request<WatchlistStock>(`/watchlist/${id}`);
    },

    add(payload: AddStockPayload): Promise<WatchlistStock> {
      return request<WatchlistStock>('/watchlist', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },

    update(id: string, payload: Partial<AddStockPayload & { active: number }>): Promise<WatchlistStock> {
      return request<WatchlistStock>(`/watchlist/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    },

    remove(id: string): Promise<{ success: boolean }> {
      return request<{ success: boolean }>(`/watchlist/${id}`, { method: 'DELETE' });
    },

    lookup(symbol: string): Promise<LookupResult> {
      return request<LookupResult>(`/watchlist/lookup?symbol=${encodeURIComponent(symbol)}`);
    },
  },

  sectors: {
    list(): Promise<SectorGroup[]> {
      return request<SectorGroup[]>('/sectors');
    },

    upsert(payload: {
      name: string;
      symbols: string[];
      weekly_perf?: number;
      daily_perf?: number;
      vs_taiex_weekly?: number;
      leader_symbol?: string;
    }): Promise<{ success: boolean }> {
      return request<{ success: boolean }>('/sectors', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
  },

  dashboard: {
    get(): Promise<DashboardData> {
      return request<DashboardData>('/dashboard');
    },
  },

  market: {
    get(): Promise<MarketState> {
      return request<MarketState>('/market-state');
    },
  },
};
