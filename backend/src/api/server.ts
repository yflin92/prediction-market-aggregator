/**
 * CrossMarket REST API. Backs the desktop/web client (PRD §10, §20–§24).
 *
 * Endpoints:
 *   GET  /api/health                      — status + last refresh + classifier
 *   GET  /api/markets?category=&sort=&q=  — canonical market feed (PRD §10, §22)
 *   GET  /api/markets/:id                 — market detail + order books (PRD §25)
 *   GET  /api/opportunities               — ranked divergence feed (PRD §20)
 *   GET  /api/arbitrage                   — arbitrage feed (PRD §21)
 *   GET  /api/watchlist                   — watched markets (PRD §23)
 *   POST /api/watchlist/:id  /  DELETE …  — watch / unwatch
 *   POST /api/refresh                     — force a data refresh
 *
 * On boot it does one refresh, then re-polls on an interval so the feed stays
 * warm without requiring a client request to trigger fetching.
 */

import cors from 'cors';
import express from 'express';
import { DataService } from '../store/dataService';
import { serializeDetail, serializeSummary } from './serialize';
import type { MarketCategory } from '../types';

const PORT = Number(process.env.PORT ?? 8787);
const REFRESH_MS = Number(process.env.REFRESH_MS ?? 60_000);

const data = new DataService();
const app = express();
app.use(cors());
app.use(express.json());

type SortKey =
  | 'divergence'
  | 'volume'
  | 'opportunity'
  | 'liquidity'
  | 'close'
  | 'title';

function sortMarkets(items: ReturnType<typeof serializeSummary>[], sort: SortKey) {
  const by: Record<SortKey, (a: any, b: any) => number> = {
    divergence: (a, b) => (b.divergence ?? 0) - (a.divergence ?? 0),
    volume: (a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0),
    opportunity: (a, b) => b.opportunityScore - a.opportunityScore,
    liquidity: (a, b) => (b.liquidity ?? 0) - (a.liquidity ?? 0),
    close: (a, b) => String(a.closeTime ?? '').localeCompare(String(b.closeTime ?? '')),
    title: (a, b) => String(a.title).localeCompare(String(b.title)),
  };
  return [...items].sort(by[sort] ?? by.opportunity);
}

const CATEGORIES = new Set<MarketCategory>([
  'politics',
  'economics',
  'crypto',
  'sports',
  'technology',
  'other',
]);

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    lastRefresh: data.store.getLastRefresh(),
    marketCount: data.store.all().length,
    classifier: data.classifierName,
    refreshIntervalMs: REFRESH_MS,
  });
});

app.get('/api/markets', (req, res) => {
  const category = String(req.query.category ?? '').toLowerCase();
  const q = String(req.query.query ?? req.query.q ?? '').toLowerCase().trim();
  const sort = String(req.query.sort ?? 'opportunity') as SortKey;
  const matchedOnly = req.query.matched === 'true';

  let items = data.store.all().map((m) => serializeSummary(m, data.store.isWatched(m.canonical.id)));

  if (category && CATEGORIES.has(category as MarketCategory)) {
    items = items.filter((m) => m.category === category);
  }
  if (q) {
    items = items.filter((m) => m.title.toLowerCase().includes(q));
  }
  if (matchedOnly) {
    items = items.filter((m) => m.venues.length > 1);
  }

  res.json({ markets: sortMarkets(items, sort), lastRefresh: data.store.getLastRefresh() });
});

app.get('/api/markets/:id', (req, res) => {
  const m = data.store.get(req.params.id);
  if (!m) return res.status(404).json({ error: 'not found' });
  res.json(serializeDetail(m, data.store.isWatched(m.canonical.id)));
});

app.get('/api/opportunities', (req, res) => {
  const minDivergence = Number(req.query.minDivergence ?? 0);
  const items = data.store
    .all()
    .map((m) => serializeSummary(m, data.store.isWatched(m.canonical.id)))
    .filter((m) => m.venues.length > 1 && (m.divergence ?? 0) >= minDivergence)
    .sort((a, b) => b.opportunityScore - a.opportunityScore);
  res.json({ opportunities: items });
});

app.get('/api/arbitrage', (_req, res) => {
  const items = data.store
    .all()
    .map((m) => serializeSummary(m, data.store.isWatched(m.canonical.id)))
    .filter((m) => m.arbitrage != null && (m.arbitrage.netEdgePct ?? 0) > 0)
    .sort((a, b) => (b.arbitrage!.netEdgePct ?? 0) - (a.arbitrage!.netEdgePct ?? 0));
  res.json({ arbitrage: items });
});

app.get('/api/watchlist', (_req, res) => {
  const ids = new Set(data.store.watchedIds());
  const items = data.store
    .all()
    .filter((m) => ids.has(m.canonical.id))
    .map((m) => serializeSummary(m, true));
  res.json({ watchlist: items });
});

app.post('/api/watchlist/:id', (req, res) => {
  if (!data.store.get(req.params.id)) return res.status(404).json({ error: 'not found' });
  data.store.watch(req.params.id);
  res.json({ ok: true, watched: true });
});

app.delete('/api/watchlist/:id', (req, res) => {
  data.store.unwatch(req.params.id);
  res.json({ ok: true, watched: false });
});

app.post('/api/refresh', async (_req, res) => {
  try {
    const result = await data.refresh();
    res.json({ ok: true, ...result, lastRefresh: data.store.getLastRefresh() });
  } catch (err) {
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

async function boot() {
  console.log(`[crossmarket] classifier=${data.classifierName}, refreshing…`);
  try {
    const result = await data.refresh();
    console.log(`[crossmarket] initial refresh: ${result.canonical} canonical markets from ${result.venueMarkets} venue markets`);
  } catch (err) {
    console.error('[crossmarket] initial refresh failed:', (err as Error).message);
  }
  setInterval(() => {
    data.refresh().catch((err) => console.error('[crossmarket] refresh error:', err.message));
  }, REFRESH_MS);

  app.listen(PORT, () => console.log(`[crossmarket] API listening on http://localhost:${PORT}`));
}

boot();
