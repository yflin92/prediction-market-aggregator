/**
 * Output types for the pricing, divergence, and arbitrage engines
 * (PRD §16–§21). These decorate a CanonicalMarket with computed signals.
 */

import type { Venue } from './index';

export type Freshness = 'fresh' | 'degraded' | 'stale';

export interface FreshnessInfo {
  status: Freshness;
  /** Age of the most stale venue quote backing this market, in seconds. */
  ageSeconds: number;
}

/**
 * Best executable prices across venues for a canonical market (PRD §17).
 * We distinguish the *probability* difference (midpoint vs midpoint) from the
 * *tradable* difference (cheapest place to actually buy).
 */
export interface PriceComparison {
  // Midpoint-based consensus and divergence (PRD §16).
  consensus: number | null; // liquidity-weighted midpoint, 0..1
  midpointDivergence: number | null; // abs difference between venue midpoints

  // Executable comparison (PRD §17): where is YES cheapest to buy right now?
  cheapestYesVenue: Venue | null;
  cheapestYesAsk: number | null;
  yesAskSpread: number | null; // how much cheaper the best venue is vs the other

  cheapestNoVenue: Venue | null;
  cheapestNoAsk: number | null;
}

/**
 * A detected arbitrage opportunity: buy YES on one venue and NO on the other
 * for a combined cost < $1 (PRD §18, §19). Only VERIFIED_EXACT matches may be
 * labeled "guaranteed"; everything else is a "potential pricing discrepancy".
 */
export interface ArbitrageOpportunity {
  yesVenue: Venue;
  yesAsk: number;
  noVenue: Venue;
  noAsk: number;

  combinedCost: number; // yesAsk + noAsk
  grossEdge: number; // 1 - combinedCost, per contract
  grossReturnPct: number; // grossEdge / combinedCost

  maxSize: number; // executable notional given book depth (PRD §18, Risk 3)
  estimatedFeePct: number;
  netEdgePct: number;

  /** True only when all PRD §19 safety conditions hold. */
  guaranteed: boolean;
  label: 'Guaranteed Arbitrage' | 'Potential pricing discrepancy';
}

/** A canonical market enriched with all computed signals for the UI. */
export interface EnrichedMarket {
  price: PriceComparison;
  freshness: FreshnessInfo;
  arbitrage: ArbitrageOpportunity | null;
  /** Ranking signal for the Opportunities feed (PRD §20). */
  opportunityScore: number;
}
