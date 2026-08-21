/**
 * Canonical Market Engine (PRD §41). Takes normalized venue markets from all
 * adapters and produces the canonical market graph: the same real-world
 * question appears once, with multiple venues underneath it (PRD §45 Milestone 2).
 *
 * Pipeline:
 *   1. Candidate generation — block by category, propose cross-venue pairs with
 *      enough lexical overlap to be worth classifying (cheap, deterministic).
 *   2. Classification — a PairClassifier (heuristic or LLM) scores each pair.
 *   3. Grouping — best mutual matches above the LIKELY bar are merged into a
 *      canonical market; verified pairings (PRD §15) override everything.
 *   4. Single-venue markets pass through as their own canonical markets.
 */

import { createHash } from 'node:crypto';
import type {
  CanonicalMarket,
  MatchAssessment,
  MatchStatus,
  VenueMarket,
} from '../types';
import type { PairClassifier } from '../matching/classifier';
import { jaccard, tokenSet } from '../matching/text';
import { indexVerified, VERIFIED_PAIRINGS, type VerifiedPairing } from './verified';

/** A cross-venue candidate pair worth classifying. */
interface Candidate {
  a: VenueMarket; // always kalshi
  b: VenueMarket; // always polymarket
  lexical: number;
}

/** Only pairs with at least this title overlap become candidates. */
const CANDIDATE_THRESHOLD = 0.18;

/** Max candidate pairs classified in parallel (bounds LLM request fan-out). */
const CLASSIFY_CONCURRENCY = 8;

/** Map over items with a bounded number of in-flight async tasks. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Classifications at or above LIKELY are grouped into one canonical market. */
const GROUP_MIN: Record<MatchAssessment['classification'], boolean> = {
  EXACT: true,
  LIKELY: true,
  RELATED: false,
  NOT_MATCHED: false,
};

export interface EngineOptions {
  classifier: PairClassifier;
  verified?: VerifiedPairing[];
}

export class CanonicalEngine {
  private readonly classifier: PairClassifier;
  private readonly verifiedIdx: Map<string, VerifiedPairing>;

  constructor(opts: EngineOptions) {
    this.classifier = opts.classifier;
    this.verifiedIdx = indexVerified(opts.verified ?? VERIFIED_PAIRINGS);
  }

  async build(markets: VenueMarket[]): Promise<CanonicalMarket[]> {
    const kalshi = markets.filter((m) => m.venue === 'kalshi');
    const poly = markets.filter((m) => m.venue === 'polymarket');

    const candidates = this.generateCandidates(kalshi, poly);

    // Classify every candidate pair with bounded concurrency. Classification is
    // independent per pair; the heuristic classifier is CPU-cheap, but the LLM
    // classifier makes a network call per pair — running them in series would
    // make a refresh take minutes. A small worker pool keeps latency bounded
    // without hammering the upstream API.
    const scored = await mapWithConcurrency(candidates, CLASSIFY_CONCURRENCY, async (cand) => ({
      cand,
      assessment: await this.classifier.classify(cand.a, cand.b),
    }));

    // Greedy best-first matching: highest confidence pairs win, each venue
    // market used at most once (a canonical market has ≤1 market per venue).
    scored.sort((x, y) => y.assessment.confidence - x.assessment.confidence);

    const usedKalshi = new Set<string>();
    const usedPoly = new Set<string>();
    const canonical: CanonicalMarket[] = [];

    for (const { cand, assessment } of scored) {
      const kId = cand.a.externalMarketId;
      const pId = cand.b.externalMarketId;
      if (usedKalshi.has(kId) || usedPoly.has(pId)) continue;

      const verified = this.lookupVerified(cand.a, cand.b);
      if (!verified && !GROUP_MIN[assessment.classification]) continue;

      usedKalshi.add(kId);
      usedPoly.add(pId);
      canonical.push(this.mergePair(cand.a, cand.b, assessment, verified));
    }

    // Emit remaining single-venue markets as their own canonical entries.
    for (const m of kalshi) {
      if (!usedKalshi.has(m.externalMarketId)) canonical.push(this.single(m));
    }
    for (const m of poly) {
      if (!usedPoly.has(m.externalMarketId)) canonical.push(this.single(m));
    }

    return canonical;
  }

  /**
   * Block candidate generation by category, then keep cross-venue pairs whose
   * titles share enough tokens. O(k*p) within a category — fine for MVP volumes;
   * a production build would add an inverted index / embeddings.
   */
  private generateCandidates(
    kalshi: VenueMarket[],
    poly: VenueMarket[],
  ): Candidate[] {
    const byCat = new Map<string, VenueMarket[]>();
    for (const m of poly) {
      const arr = byCat.get(m.category) ?? [];
      arr.push(m);
      byCat.set(m.category, arr);
    }

    const out: Candidate[] = [];
    for (const a of kalshi) {
      const aTokens = tokenSet(a.title);
      // Verified pairings should always be candidates regardless of category.
      const pool = byCat.get(a.category) ?? [];
      for (const b of pool) {
        const lexical = jaccard(aTokens, tokenSet(b.title));
        if (lexical >= CANDIDATE_THRESHOLD || this.lookupVerified(a, b)) {
          out.push({ a, b, lexical });
        }
      }
    }
    return out;
  }

  private lookupVerified(a: VenueMarket, b: VenueMarket): VerifiedPairing | null {
    const va = this.verifiedIdx.get(`${a.venue}:${a.externalMarketId}`);
    if (va && va.polymarketMarketId === b.externalMarketId) return va;
    return null;
  }

  private mergePair(
    kalshi: VenueMarket,
    poly: VenueMarket,
    assessment: MatchAssessment,
    verified: VerifiedPairing | null,
  ): CanonicalMarket {
    let matchStatus: MatchStatus;
    if (verified) matchStatus = 'VERIFIED_EXACT';
    else if (assessment.classification === 'EXACT') matchStatus = 'AUTO_EXACT';
    else if (assessment.classification === 'LIKELY') matchStatus = 'AUTO_LIKELY';
    else matchStatus = 'AUTO_RELATED';

    // Prefer the venue with more volume as the canonical title source.
    const primary =
      (poly.totalVolume ?? 0) >= (kalshi.totalVolume ?? 0) ? poly : kalshi;

    return {
      id: verified?.canonicalId ?? stableId(kalshi, poly),
      title: verified?.canonicalTitle ?? primary.title,
      description: primary.description,
      category: primary.category,
      status: reconcileStatus(kalshi, poly),
      closeTime: earliest(kalshi.closeTime, poly.closeTime),
      matchStatus,
      match: assessment,
      venueMarkets: [kalshi, poly],
    };
  }

  private single(m: VenueMarket): CanonicalMarket {
    return {
      id: stableId(m),
      title: m.title,
      description: m.description,
      category: m.category,
      status: m.status,
      closeTime: m.closeTime,
      matchStatus: 'SINGLE_VENUE',
      match: null,
      venueMarkets: [m],
    };
  }
}

/**
 * Deterministic canonical id derived from the participating venue market ids.
 * Stable across refreshes so watchlist entries and selections survive a rebuild
 * (a random UUID per refresh would silently drop watched auto-matched markets).
 */
function stableId(...vms: VenueMarket[]): string {
  const key = vms
    .map((m) => `${m.venue}:${m.externalMarketId}`)
    .sort()
    .join('|');
  return createHash('sha1').update(key).digest('hex').slice(0, 24);
}

function reconcileStatus(a: VenueMarket, b: VenueMarket): CanonicalMarket['status'] {
  if (a.status === 'open' || b.status === 'open') return 'open';
  if (a.status === 'resolved' && b.status === 'resolved') return 'resolved';
  return 'closed';
}

function earliest(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}
