/**
 * API serialization: flattens the internal StoredMarket into the shape the
 * frontend renders (PRD §10 table + detail pane). Kept separate from domain
 * types so the wire format can evolve independently.
 */

import type { StoredMarket } from '../store/store';

export function serializeSummary(m: StoredMarket, watched: boolean) {
  const { canonical, enriched } = m;
  const kalshi = canonical.venueMarkets.find((v) => v.venue === 'kalshi');
  const poly = canonical.venueMarkets.find((v) => v.venue === 'polymarket');
  return {
    id: canonical.id,
    title: canonical.title,
    category: canonical.category,
    status: canonical.status,
    closeTime: canonical.closeTime,
    matchStatus: canonical.matchStatus,
    matchConfidence: canonical.match?.confidence ?? null,
    venues: canonical.venueMarkets.map((v) => v.venue),
    consensus: enriched.price.consensus,
    kalshiYes: kalshi ? midOrLast(kalshi.yesBid, kalshi.yesAsk, kalshi.lastPrice) : null,
    polymarketYes: poly ? midOrLast(poly.yesBid, poly.yesAsk, poly.lastPrice) : null,
    divergence: enriched.price.midpointDivergence,
    volume24h: sum(kalshi?.volume24h, poly?.volume24h),
    liquidity: sum(kalshi?.liquidity, poly?.liquidity),
    opportunityScore: enriched.opportunityScore,
    arbitrage: enriched.arbitrage
      ? { netEdgePct: enriched.arbitrage.netEdgePct, guaranteed: enriched.arbitrage.guaranteed, label: enriched.arbitrage.label }
      : null,
    freshness: enriched.freshness,
    watched,
  };
}

export function serializeDetail(m: StoredMarket, watched: boolean) {
  const { canonical, enriched } = m;
  return {
    ...serializeSummary(m, watched),
    description: canonical.description,
    match: canonical.match,
    price: enriched.price,
    arbitrageDetail: enriched.arbitrage,
    venueMarkets: canonical.venueMarkets.map((v) => ({
      venue: v.venue,
      title: v.title,
      rules: v.rules,
      yesBid: v.yesBid,
      yesAsk: v.yesAsk,
      noBid: v.noBid,
      noAsk: v.noAsk,
      lastPrice: v.lastPrice,
      volume24h: v.volume24h,
      totalVolume: v.totalVolume,
      liquidity: v.liquidity,
      closeTime: v.closeTime,
      url: v.url,
      lastUpdatedAt: v.lastUpdatedAt,
      orderBook: v.orderBook ?? null,
    })),
  };
}

function midOrLast(bid: number | null, ask: number | null, last: number | null): number | null {
  if (bid != null && ask != null) return (bid + ask) / 2;
  return last;
}

function sum(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null && b == null) return null;
  return Number(a ?? 0) + Number(b ?? 0);
}
