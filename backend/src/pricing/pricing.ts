/**
 * Pricing, divergence, and freshness engines (PRD §16, §17, §27).
 *
 * Product principle (PRD §9.1): emphasize executable prices over headline
 * probabilities. So we compute both a midpoint "consensus"/divergence and the
 * executable "where is YES cheapest to buy right now" comparison, and keep them
 * distinct in the output.
 */

import type { CanonicalMarket, Venue, VenueMarket } from '../types';
import type { FreshnessInfo, PriceComparison } from '../types/analysis';

/** Midpoint of a venue's YES quote, or last price / null as fallback. */
export function yesMidpoint(m: VenueMarket): number | null {
  if (m.yesBid != null && m.yesAsk != null) return (m.yesBid + m.yesAsk) / 2;
  return m.lastPrice;
}

function findVenue(market: CanonicalMarket, venue: Venue): VenueMarket | undefined {
  return market.venueMarkets.find((v) => v.venue === venue);
}

export function computePriceComparison(market: CanonicalMarket): PriceComparison {
  const kalshi = findVenue(market, 'kalshi');
  const poly = findVenue(market, 'polymarket');

  const midK = kalshi ? yesMidpoint(kalshi) : null;
  const midP = poly ? yesMidpoint(poly) : null;

  // Liquidity-weighted consensus midpoint (PRD §16). Falls back to simple mean.
  const consensus = weightedConsensus(kalshi, poly, midK, midP);
  const midpointDivergence =
    midK != null && midP != null ? Math.abs(midK - midP) : null;

  // Executable YES comparison (PRD §17): cheapest place to *buy* YES = lowest ask.
  const yesAsks: Array<{ venue: Venue; ask: number }> = [];
  if (kalshi?.yesAsk != null) yesAsks.push({ venue: 'kalshi', ask: kalshi.yesAsk });
  if (poly?.yesAsk != null) yesAsks.push({ venue: 'polymarket', ask: poly.yesAsk });
  yesAsks.sort((a, b) => a.ask - b.ask);

  const noAsks: Array<{ venue: Venue; ask: number }> = [];
  if (kalshi?.noAsk != null) noAsks.push({ venue: 'kalshi', ask: kalshi.noAsk });
  if (poly?.noAsk != null) noAsks.push({ venue: 'polymarket', ask: poly.noAsk });
  noAsks.sort((a, b) => a.ask - b.ask);

  return {
    consensus,
    midpointDivergence,
    cheapestYesVenue: yesAsks[0]?.venue ?? null,
    cheapestYesAsk: yesAsks[0]?.ask ?? null,
    yesAskSpread:
      yesAsks.length === 2 ? yesAsks[1].ask - yesAsks[0].ask : null,
    cheapestNoVenue: noAsks[0]?.venue ?? null,
    cheapestNoAsk: noAsks[0]?.ask ?? null,
  };
}

function weightedConsensus(
  kalshi: VenueMarket | undefined,
  poly: VenueMarket | undefined,
  midK: number | null,
  midP: number | null,
): number | null {
  const parts: Array<{ mid: number; weight: number }> = [];
  if (midK != null) parts.push({ mid: midK, weight: Math.max(kalshi?.liquidity ?? 0, 1) });
  if (midP != null) parts.push({ mid: midP, weight: Math.max(poly?.liquidity ?? 0, 1) });
  if (parts.length === 0) return null;
  const total = parts.reduce((s, p) => s + p.weight, 0);
  return parts.reduce((s, p) => s + p.mid * p.weight, 0) / total;
}

const FRESH_MAX_SECONDS = 5;
const DEGRADED_MAX_SECONDS = 30;

/**
 * Data freshness across the venue quotes backing a market (PRD §27). The market
 * is only as fresh as its stalest leg — this gates arbitrage notifications.
 */
export function computeFreshness(market: CanonicalMarket, now: number): FreshnessInfo {
  let maxAge = 0;
  for (const vm of market.venueMarkets) {
    const ts = Date.parse(vm.lastUpdatedAt);
    if (Number.isFinite(ts)) {
      maxAge = Math.max(maxAge, (now - ts) / 1000);
    }
  }
  const status =
    maxAge <= FRESH_MAX_SECONDS
      ? 'fresh'
      : maxAge <= DEGRADED_MAX_SECONDS
        ? 'degraded'
        : 'stale';
  return { status, ageSeconds: Math.round(maxAge) };
}
