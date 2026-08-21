/**
 * Pair classifier interface (PRD §14). Candidate generation proposes pairs of
 * venue markets; a classifier decides EXACT / LIKELY / RELATED / NOT_MATCHED
 * with confidence, reason, and the semantic differences that block equivalence.
 *
 * The MVP ships a deterministic heuristic classifier. An LLM classifier can be
 * dropped in behind the same interface (PRD §14 "An LLM may then classify…")
 * without touching candidate generation or the canonical engine.
 */

import type { MatchAssessment, VenueMarket } from '../types';

export interface PairClassifier {
  classify(a: VenueMarket, b: VenueMarket): Promise<MatchAssessment>;
}
