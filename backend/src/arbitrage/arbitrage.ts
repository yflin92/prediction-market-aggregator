/**
 * Arbitrage detection engine (PRD §18, §19).
 *
 * A cross-venue arbitrage exists when you can buy YES on one venue and NO on
 * the other for a combined cost < $1, since exactly one settles at $1 if the
 * contracts are equivalent. We compute gross edge, then subtract fees to get a
 * net edge, and size the position by available book depth (PRD §18, Risk 3).
 *
 * Safety (PRD §19): the "Guaranteed Arbitrage" label is only applied when the
 * match is VERIFIED_EXACT, both books are current, executable liquidity exists,
 * and expected payout exceeds cost + fees. Otherwise it is a "Potential pricing
 * discrepancy". Stale data never yields a guaranteed label (PRD §27).
 */

import type { CanonicalMarket, Venue, VenueMarket } from '../types';
import type {
  ArbitrageOpportunity,
  FreshnessInfo,
} from '../types/analysis';

/** Rough per-venue taker fee estimate as a fraction of notional (PRD §18). */
const FEE_PCT: Record<Venue, number> = {
  // Kalshi charges a per-contract fee that varies with price; approximate.
  kalshi: 0.02,
  polymarket: 0.0,
};

/** Minimum executable notional to bother surfacing an opportunity. */
const MIN_SIZE_USD = 20;

function findVenue(m: CanonicalMarket, v: Venue): VenueMarket | undefined {
  return m.venueMarkets.find((x) => x.venue === v);
}

/**
 * Estimate how much YES/NO notional can be filled near the top of book. Prefer
 * real order-book depth; fall back to the venue's reported liquidity figure,
 * which is coarser (Risk 3: best ask may hide tiny size).
 */
function executableSize(
  yesVenue: VenueMarket,
  noVenue: VenueMarket,
  yesAsk: number,
  noAsk: number,
): number {
  const yesDepth = topAskNotional(yesVenue, yesAsk) ?? (yesVenue.liquidity ?? 0);
  const noDepth = topAskNotional(noVenue, noAsk) ?? (noVenue.liquidity ?? 0);
  // Arbitrage size is bounded by the thinner of the two legs.
  return Math.min(yesDepth, noDepth);
}

/** Notional (USD) available at or better than `ask` on the YES side of a book. */
function topAskNotional(vm: VenueMarket, ask: number): number | null {
  const asks = vm.orderBook?.asks;
  if (!asks || asks.length === 0) return null;
  let notional = 0;
  for (const level of asks) {
    if (level.price > ask + 1e-9) break;
    notional += level.price * level.size;
  }
  return notional;
}

export function detectArbitrage(
  market: CanonicalMarket,
  freshness: FreshnessInfo,
): ArbitrageOpportunity | null {
  const kalshi = findVenue(market, 'kalshi');
  const poly = findVenue(market, 'polymarket');
  if (!kalshi || !poly) return null; // needs both venues

  // Two directions: (YES on K, NO on P) and (YES on P, NO on K). Pick the best.
  const candidates: ArbitrageOpportunity[] = [];
  for (const [yv, nv] of [
    [kalshi, poly],
    [poly, kalshi],
  ] as const) {
    const yesAsk = yv.yesAsk;
    const noAsk = nv.noAsk;
    if (yesAsk == null || noAsk == null) continue;

    const combinedCost = yesAsk + noAsk;
    if (combinedCost >= 1) continue; // no gross edge

    const grossEdge = 1 - combinedCost;
    const grossReturnPct = grossEdge / combinedCost;

    const maxSize = executableSize(yv, nv, yesAsk, noAsk);
    const estimatedFeePct = FEE_PCT[yv.venue] + FEE_PCT[nv.venue];
    const netEdgePct = grossReturnPct - estimatedFeePct;

    // Guaranteed-arbitrage safety gate (PRD §19).
    const guaranteed =
      market.matchStatus === 'VERIFIED_EXACT' &&
      freshness.status === 'fresh' &&
      maxSize >= MIN_SIZE_USD &&
      netEdgePct > 0;

    candidates.push({
      yesVenue: yv.venue,
      yesAsk,
      noVenue: nv.venue,
      noAsk,
      combinedCost: round(combinedCost),
      grossEdge: round(grossEdge),
      grossReturnPct: round(grossReturnPct),
      maxSize: Math.round(maxSize),
      estimatedFeePct,
      netEdgePct: round(netEdgePct),
      guaranteed,
      label: guaranteed ? 'Guaranteed Arbitrage' : 'Potential pricing discrepancy',
    });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.netEdgePct - a.netEdgePct);
  return candidates[0];
}

function round(n: number): number {
  return Number(n.toFixed(4));
}
