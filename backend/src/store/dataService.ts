/**
 * DataService orchestrates one full refresh cycle (PRD §41 data flow):
 *
 *   venue adapters → normalized markets → canonical engine → enrichment → store
 *
 * It also selects the classifier: the LLM classifier when ANTHROPIC_API_KEY is
 * set (PRD §14), otherwise the deterministic heuristic. Refresh is REST-polling
 * for the MVP; streaming (PRD §28) would layer on top of the same store.
 */

import type { VenueMarket } from '../types';
import type { PredictionMarketVenue } from '../venues/PredictionMarketVenue';
import { KalshiVenue } from '../venues/kalshi';
import { PolymarketVenue } from '../venues/polymarket';
import { CanonicalEngine } from '../canonical/engine';
import { HeuristicClassifier } from '../matching/heuristicClassifier';
import { LlmClassifier } from '../matching/llmClassifier';
import type { PairClassifier } from '../matching/classifier';
import { enrich } from '../pricing/enrich';
import { MarketStore, type StoredMarket } from './store';

export interface DataServiceOptions {
  venues?: PredictionMarketVenue[];
  classifier?: PairClassifier;
  /** Max markets to pull per venue per refresh. */
  perVenueLimit?: number;
}

export class DataService {
  readonly store = new MarketStore();
  private readonly venues: PredictionMarketVenue[];
  private readonly engine: CanonicalEngine;
  private readonly perVenueLimit: number;
  readonly classifierName: string;

  constructor(opts: DataServiceOptions = {}) {
    this.venues = opts.venues ?? [new KalshiVenue(), new PolymarketVenue()];
    const classifier = opts.classifier ?? LlmClassifier.fromEnv() ?? new HeuristicClassifier();
    this.classifierName = classifier instanceof LlmClassifier ? 'llm' : 'heuristic';
    this.engine = new CanonicalEngine({ classifier });
    this.perVenueLimit = opts.perVenueLimit ?? 400;
  }

  /** Pull from all venues, rebuild the canonical graph, enrich, and store. */
  async refresh(): Promise<{ venueMarkets: number; canonical: number }> {
    const results = await Promise.allSettled(
      this.venues.map((v) => v.listMarkets({ limit: this.perVenueLimit })),
    );

    const venueMarkets: VenueMarket[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') venueMarkets.push(...r.value);
      // A failing venue must not take down the whole refresh (PRD §43 Risk 5).
    }

    const canonical = await this.engine.build(venueMarkets);
    const now = Date.now();
    const stored: StoredMarket[] = canonical.map((c) => ({
      canonical: c,
      enriched: enrich(c, now),
    }));

    this.store.replaceAll(stored);
    return { venueMarkets: venueMarkets.length, canonical: stored.length };
  }
}
