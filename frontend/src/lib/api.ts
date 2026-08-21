import type { MarketDetail, MarketSummary } from './types';

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json() as Promise<T>;
}

export interface MarketQuery {
  category?: string;
  query?: string;
  sort?: string;
  matched?: boolean;
}

export const api = {
  async health() {
    return get<{ ok: boolean; lastRefresh: string | null; marketCount: number; classifier: string }>(
      '/api/health',
    );
  },

  async markets(q: MarketQuery = {}): Promise<MarketSummary[]> {
    const params = new URLSearchParams();
    if (q.category) params.set('category', q.category);
    if (q.query) params.set('query', q.query);
    if (q.sort) params.set('sort', q.sort);
    if (q.matched) params.set('matched', 'true');
    const data = await get<{ markets: MarketSummary[] }>(`/api/markets?${params}`);
    return data.markets;
  },

  async market(id: string): Promise<MarketDetail> {
    return get<MarketDetail>(`/api/markets/${encodeURIComponent(id)}`);
  },

  async opportunities(minDivergence = 0): Promise<MarketSummary[]> {
    const data = await get<{ opportunities: MarketSummary[] }>(
      `/api/opportunities?minDivergence=${minDivergence}`,
    );
    return data.opportunities;
  },

  async arbitrage(): Promise<MarketSummary[]> {
    const data = await get<{ arbitrage: MarketSummary[] }>('/api/arbitrage');
    return data.arbitrage;
  },

  async watchlist(): Promise<MarketSummary[]> {
    const data = await get<{ watchlist: MarketSummary[] }>('/api/watchlist');
    return data.watchlist;
  },

  async watch(id: string, on: boolean): Promise<void> {
    await fetch(`/api/watchlist/${encodeURIComponent(id)}`, {
      method: on ? 'POST' : 'DELETE',
    });
  },
};
