/**
 * Polymarket venue adapter (PRD §39 P0, §41 adapter layer).
 *
 * Uses the public Gamma markets API for discovery/metadata and the CLOB API for
 * order books. Per PRD §35 we treat this as the US-facing data source and never
 * route users around geographic execution restrictions — this adapter only
 * *reads* public market data.
 *
 * Gamma returns several fields as JSON-encoded strings (outcomes, outcomePrices,
 * clobTokenIds); we parse them defensively. Only binary Yes/No markets are
 * mapped — multi-outcome markets are skipped for the MVP.
 */

import type { OrderBook, VenueMarket } from '../types';
import { classifyCategory } from '../util/category';
import { getJson } from '../util/http';
import type { ListMarketsOptions, PredictionMarketVenue } from './PredictionMarketVenue';

const GAMMA = 'https://gamma-api.polymarket.com';
const CLOB = 'https://clob.polymarket.com';

interface GammaMarket {
  id: string;
  question: string;
  description?: string;
  slug: string;
  conditionId?: string;
  outcomes?: string; // JSON string, e.g. '["Yes","No"]'
  outcomePrices?: string; // JSON string, e.g. '["0.63","0.37"]'
  clobTokenIds?: string; // JSON string of token ids, index-aligned with outcomes
  bestBid?: number;
  bestAsk?: number;
  lastTradePrice?: number;
  volume?: string;
  volume24hr?: number;
  liquidity?: string;
  endDate?: string;
  startDate?: string;
  active?: boolean;
  closed?: boolean;
  resolutionSource?: string;
  events?: Array<{ id: string; ticker?: string; title?: string; slug?: string }>;
}

function parseJsonArray(v: string | undefined): string[] {
  if (!v) return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function num(v: string | number | undefined | null): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Only Yes/No binary markets are supported in the MVP. */
function isBinaryYesNo(outcomes: string[]): boolean {
  if (outcomes.length !== 2) return false;
  const lower = outcomes.map((o) => o.toLowerCase());
  return lower.includes('yes') && lower.includes('no');
}

function mapStatus(m: GammaMarket): VenueMarket['status'] {
  if (m.closed) return 'resolved';
  if (m.active) return 'open';
  return 'closed';
}

function toVenueMarket(m: GammaMarket): VenueMarket | null {
  const outcomes = parseJsonArray(m.outcomes);
  if (!isBinaryYesNo(outcomes)) return null;

  const prices = parseJsonArray(m.outcomePrices).map((p) => num(p));
  const yesIdx = outcomes.findIndex((o) => o.toLowerCase() === 'yes');
  const yesMid = yesIdx >= 0 ? prices[yesIdx] ?? null : null;

  // Gamma exposes top-of-book as bestBid/bestAsk on the YES token. We derive
  // NO quotes from YES (NO bid = 1 - YES ask, NO ask = 1 - YES bid).
  const yesBid = num(m.bestBid);
  const yesAsk = num(m.bestAsk);
  const noBid = yesAsk != null ? 1 - yesAsk : null;
  const noAsk = yesBid != null ? 1 - yesBid : null;

  const event = m.events?.[0];

  return {
    venue: 'polymarket',
    externalMarketId: m.id,
    externalEventId: event?.id ?? null,
    title: m.question,
    description: m.description ?? '',
    rules: m.description ?? '',
    category: classifyCategory(m.question, m.description),
    status: mapStatus(m),
    yesBid,
    yesAsk,
    noBid,
    noAsk,
    lastPrice: num(m.lastTradePrice) ?? yesMid,
    volume24h: num(m.volume24hr),
    totalVolume: num(m.volume),
    liquidity: num(m.liquidity),
    openTime: m.startDate ?? null,
    closeTime: m.endDate ?? null,
    url: `https://polymarket.com/event/${event?.slug ?? m.slug}`,
    lastUpdatedAt: new Date().toISOString(),
  };
}

export class PolymarketVenue implements PredictionMarketVenue {
  readonly venue = 'polymarket' as const;

  async listMarkets(opts: ListMarketsOptions = {}): Promise<VenueMarket[]> {
    const { limit = 200, query } = opts;
    const out: VenueMarket[] = [];
    const pageSize = 100;
    let offset = 0;

    while (out.length < limit) {
      const url = new URL(`${GAMMA}/markets`);
      url.searchParams.set('active', 'true');
      url.searchParams.set('closed', 'false');
      url.searchParams.set('limit', String(pageSize));
      url.searchParams.set('offset', String(offset));
      url.searchParams.set('order', 'volume24hr');
      url.searchParams.set('ascending', 'false');

      const page = await getJson<GammaMarket[]>(url.toString());
      if (!Array.isArray(page) || page.length === 0) break;

      for (const gm of page) {
        const vm = toVenueMarket(gm);
        if (!vm) continue;
        if (query && !matchesQuery(vm, query)) continue;
        out.push(vm);
      }
      offset += pageSize;
      if (page.length < pageSize) break;
    }

    return out.slice(0, limit);
  }

  async getMarket(externalMarketId: string): Promise<VenueMarket | null> {
    const url = `${GAMMA}/markets/${encodeURIComponent(externalMarketId)}`;
    const gm = await getJson<GammaMarket>(url);
    return gm ? toVenueMarket(gm) : null;
  }

  async getOrderBook(externalMarketId: string): Promise<OrderBook | null> {
    // Resolve the YES CLOB token id from Gamma, then query the CLOB book.
    const gm = await getJson<GammaMarket>(
      `${GAMMA}/markets/${encodeURIComponent(externalMarketId)}`,
    );
    const outcomes = parseJsonArray(gm.outcomes);
    const tokenIds = parseJsonArray(gm.clobTokenIds);
    const yesIdx = outcomes.findIndex((o) => o.toLowerCase() === 'yes');
    const yesToken = yesIdx >= 0 ? tokenIds[yesIdx] : undefined;
    if (!yesToken) return null;

    interface ClobBook {
      bids?: Array<{ price: string; size: string }>;
      asks?: Array<{ price: string; size: string }>;
    }
    const book = await getJson<ClobBook>(
      `${CLOB}/book?token_id=${encodeURIComponent(yesToken)}`,
    );
    const bids = (book.bids ?? [])
      .map((l) => ({ price: Number(l.price), size: Number(l.size) }))
      .sort((a, b) => b.price - a.price);
    const asks = (book.asks ?? [])
      .map((l) => ({ price: Number(l.price), size: Number(l.size) }))
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
