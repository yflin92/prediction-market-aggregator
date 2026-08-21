/**
 * Enrichment: decorate a canonical market with price comparison, freshness,
 * arbitrage, and the Opportunity Score used to rank the Opportunities feed
 * (PRD §20):
 *
 *   Opportunity Score = price divergence × match confidence × liquidity × freshness
 */

import type { CanonicalMarket } from '../types';
import type { EnrichedMarket } from '../types/analysis';
import { detectArbitrage } from '../arbitrage/arbitrage';
import { computeFreshness, computePriceComparison } from './pricing';

const FRESHNESS_WEIGHT = { fresh: 1, degraded: 0.5, stale: 0.1 } as const;

export function enrich(market: CanonicalMarket, now: number): EnrichedMarket {
  const price = computePriceComparison(market);
  const freshness = computeFreshness(market, now);
  const arbitrage = detectArbitrage(market, freshness);

  const divergence = price.midpointDivergence ?? 0;
  const confidence = market.match?.confidence ?? (market.venueMarkets.length > 1 ? 0.5 : 0);

  // Liquidity score: smallest venue liquidity, log-compressed to [0,1] around $100k.
  const minLiquidity = Math.min(
    ...market.venueMarkets.map((v) => v.liquidity ?? 0),
  );
  const liquidityScore = minLiquidity <= 0 ? 0 : Math.min(Math.log10(minLiquidity + 1) / 5, 1);

  const opportunityScore =
    divergence * confidence * liquidityScore * FRESHNESS_WEIGHT[freshness.status];

  return {
    price,
    freshness,
    arbitrage,
    opportunityScore: Number(opportunityScore.toFixed(6)),
  };
}
