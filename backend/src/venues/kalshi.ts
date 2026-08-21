/**
 * Kalshi venue adapter (PRD §39 P0, §41 adapter layer).
 *
 * Uses Kalshi's public REST market/event endpoints. Prices are quoted in
 * dollars as strings (e.g. "0.6300"); we parse them to [0,1] numbers. Kalshi
 * markets nest under events, so we pull events with nested markets to recover
 * a human-readable question (event title) plus the per-outcome subtitle.
 *
 * Real-time WebSocket streaming (PRD §28) is deferred; the MVP polls REST.
 */

import type { OrderBook, VenueMarket } from '../types';
import { classifyCategory } from '../util/category';
import { getJson } from '../util/http';
import type { ListMarketsOptions, PredictionMarketVenue } from './PredictionMarketVenue';

const BASE = 'https://api.elections.kalshi.com/trade-api/v2';

interface KalshiMarket {
  ticker: string;
  event_ticker: string;
  title: string;
  yes_sub_title?: string;
  subtitle?: string;
  yes_bid_dollars?: string;
  yes_ask_dollars?: string;
  no_bid_dollars?: string;
  no_ask_dollars?: string;
  last_price_dollars?: string;
  volume_fp?: number | string;
  volume_24h_fp?: number | string;
  liquidity_dollars?: string;
  open_time?: string;
  close_time?: string;
  status?: string;
  market_type?: string;
  rules_primary?: string;
  rules_secondary?: string;
}

interface KalshiEvent {
  event_ticker: string;
  title?: string;
  category?: string;
  markets?: KalshiMarket[];
}

interface EventsResponse {
  events: KalshiEvent[];
  cursor?: string;
}

interface OrderBookResponse {
  orderbook: {
    // Kalshi returns [price_cents, size] pairs, best last. `yes`/`no` arrays.
    yes?: Array<[number, number]>;
    no?: Array<[number, number]>;
  };
}

/** Parse a Kalshi dollar-string price into [0,1], or null if absent/zero-noise. */
function parsePrice(v: string | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n;
}

/** Coerce a Kalshi numeric field (may be number or numeric string) to number. */
function numOrNull(v: number | string | undefined | null): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapStatus(s: string | undefined): VenueMarket['status'] {
  switch (s) {
    case 'active':
    case 'open':
      return 'open';
    case 'closed':
      return 'closed';
    case 'settled':
    case 'finalized':
      return 'resolved';
    default:
      return 'unknown';
  }
}

/**
 * A Kalshi binary event usually has one YES/NO market; multi-outcome events
 * have several. We title the VenueMarket with the event question plus the
 * outcome subtitle so cross-venue matching has real language to work with.
 */
function toVenueMarket(m: KalshiMarket, event: KalshiEvent): VenueMarket {
  const outcome = m.yes_sub_title || m.subtitle || '';
  const eventTitle = event.title || m.title;
  const title = outcome && outcome !== eventTitle ? `${eventTitle} — ${outcome}` : eventTitle;
  const rules = [m.rules_primary, m.rules_secondary].filter(Boolean).join('\n\n');

  return {
    venue: 'kalshi',
    externalMarketId: m.ticker,
    externalEventId: m.event_ticker,
    title,
    description: m.rules_primary || '',
    rules,
    category: classifyCategory(eventTitle, outcome, m.rules_primary, event.category),
    status: mapStatus(m.status),
    yesBid: parsePrice(m.yes_bid_dollars),
    yesAsk: parsePrice(m.yes_ask_dollars),
    noBid: parsePrice(m.no_bid_dollars),
    noAsk: parsePrice(m.no_ask_dollars),
    lastPrice: parsePrice(m.last_price_dollars),
    volume24h: numOrNull(m.volume_24h_fp),
    totalVolume: numOrNull(m.volume_fp),
    liquidity: parsePrice(m.liquidity_dollars),
    openTime: m.open_time ?? null,
    closeTime: m.close_time ?? null,
    url: `https://kalshi.com/markets/${m.event_ticker}`,
    lastUpdatedAt: new Date().toISOString(),
  };
}

/** Composite liquidity/volume score used to rank Kalshi markets. */
function rankScore(vm: VenueMarket): number {
  return (vm.volume24h ?? 0) * 1000 + (vm.totalVolume ?? 0) + (vm.liquidity ?? 0);
}

/** Keep only genuine, tradable single markets — drop multivariate combos. */
function isRealMarket(m: KalshiMarket): boolean {
  if (m.ticker.startsWith('KXMVE')) return false; // multivariate combo noise
  if (m.market_type && m.market_type !== 'binary') return false;
  return true;
}

export class KalshiVenue implements PredictionMarketVenue {
  readonly venue = 'kalshi' as const;

  async listMarkets(opts: ListMarketsOptions = {}): Promise<VenueMarket[]> {
    const { limit = 200, query } = opts;
    const collected: VenueMarket[] = [];
    let cursor: string | undefined;

    // Kalshi's /events endpoint has no volume ordering, so paginating a fixed
    // depth returns long-tail markets that rarely overlap Polymarket's volume-
    // sorted feed. Instead we gather a broad pool (several pages), then rank by
    // volume/liquidity and keep the top `limit` — prioritizing liquid markets
    // that are actually matchable and worth showing (PRD §20 liquidity signal).
    const POOL_PAGES = 12; // ~1200 events scanned for broad topic coverage
    for (let page = 0; page < POOL_PAGES; page++) {
      const url = new URL(`${BASE}/events`);
      url.searchParams.set('limit', '100');
      url.searchParams.set('status', 'open');
      url.searchParams.set('with_nested_markets', 'true');
      if (cursor) url.searchParams.set('cursor', cursor);

      const res = await getJson<EventsResponse>(url.toString());
      for (const event of res.events ?? []) {
        for (const m of event.markets ?? []) {
          if (!isRealMarket(m)) continue;
          const vm = toVenueMarket(m, event);
          if (query && !matchesQuery(vm, query)) continue;
          collected.push(vm);
        }
      }
      cursor = res.cursor;
      if (!cursor || (res.events ?? []).length === 0) break;
    }

    // Rank by 24h volume, then total volume, then liquidity (desc).
    collected.sort((a, b) => rankScore(b) - rankScore(a));
    return collected.slice(0, limit);
  }

  async getMarket(externalMarketId: string): Promise<VenueMarket | null> {
    const url = `${BASE}/markets/${encodeURIComponent(externalMarketId)}`;
    const res = await getJson<{ market: KalshiMarket }>(url);
    if (!res.market) return null;
    // Fetch the event for a proper question title.
    const evUrl = `${BASE}/events/${encodeURIComponent(res.market.event_ticker)}`;
    let event: KalshiEvent = { event_ticker: res.market.event_ticker };
    try {
      const ev = await getJson<{ event: KalshiEvent }>(evUrl);
      if (ev.event) event = ev.event;
    } catch {
      // Non-fatal: fall back to the market's own title.
    }
    return toVenueMarket(res.market, event);
  }

  async getOrderBook(externalMarketId: string): Promise<OrderBook | null> {
    const url = `${BASE}/markets/${encodeURIComponent(externalMarketId)}/orderbook`;
    const res = await getJson<OrderBookResponse>(url);
    const yes = res.orderbook?.yes ?? [];
    // Kalshi's `yes` array is YES bids in cents; asks are derived from `no` bids
    // (a YES ask at price p corresponds to a NO bid at 100-p). We expose the
    // YES-side book: bids from `yes`, asks reconstructed from `no`.
    const bids = yes
      .map(([cents, size]) => ({ price: cents / 100, size }))
      .sort((a, b) => b.price - a.price);
    const asks = (res.orderbook?.no ?? [])
      .map(([cents, size]) => ({ price: (100 - cents) / 100, size }))
      .sort((a, b) => a.price - b.price);
    return { bids, asks };
  }
}

function matchesQuery(vm: VenueMarket, query: string): boolean {
  const q = query.toLowerCase();
  return (
    vm.title.toLowerCase().includes(q) || vm.description.toLowerCase().includes(q)
  );
}
