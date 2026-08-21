/**
 * Human-verified pairings (PRD §15). Once a recurring cross-venue contract is
 * verified, the mapping persists so the app becomes more accurate over time
 * rather than reclassifying the same markets. Only VERIFIED_EXACT pairs may
 * generate a guaranteed-arbitrage label (PRD §19).
 *
 * In the MVP this is a seed list keyed by venue market id. A real deployment
 * would persist verifications to the local store and let operators add them.
 */

export interface VerifiedPairing {
  canonicalId: string;
  canonicalTitle: string;
  kalshiMarketId: string;
  polymarketMarketId: string;
}

/**
 * Seed verifications. Empty by default because live venue ids rotate; operators
 * add entries here (or via the store) once they confirm a recurring pairing.
 * The plumbing that consumes these is fully wired (see canonical engine), so
 * adding one row here immediately upgrades that market to VERIFIED_EXACT.
 */
export const VERIFIED_PAIRINGS: VerifiedPairing[] = [];

/** Index verified pairings by each venue market id for O(1) lookup. */
export function indexVerified(pairings: VerifiedPairing[]): Map<string, VerifiedPairing> {
  const idx = new Map<string, VerifiedPairing>();
  for (const p of pairings) {
    idx.set(`kalshi:${p.kalshiMarketId}`, p);
    idx.set(`polymarket:${p.polymarketMarketId}`, p);
  }
  return idx;
}
