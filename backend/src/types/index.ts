/**
 * Core domain model for CrossMarket.
 *
 * Everything downstream of the venue adapters speaks in these types. The
 * strategic bet (PRD §44) is that owning the canonical market graph — knowing
 * which contracts across venues represent the same economic proposition — is
 * the defensible layer. So these types are the contract between the adapters
 * and the rest of the system; keep them venue-agnostic.
 */

export type Venue = 'kalshi' | 'polymarket';

export type MarketCategory =
  | 'politics'
  | 'economics'
  | 'crypto'
  | 'sports'
  | 'technology'
  | 'other';

export type MarketStatus = 'open' | 'closed' | 'resolved' | 'unknown';

/** A single price level in an order book (price in [0,1], size in contracts). */
export interface OrderBookLevel {
  price: number;
  size: number;
}

/** One side ('yes'/'no') of a venue order book, best price first. */
export interface OrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

/**
 * A binary market as it exists on a single venue, normalized (PRD §11, §12).
 *
 * Prices are always YES-oriented probabilities in [0,1]. A `null` price means
 * "no quote available", which is distinct from 0.
 */
export interface VenueMarket {
  venue: Venue;
  externalMarketId: string;
  externalEventId: string | null;

  title: string;
  description: string;
  rules: string;

  category: MarketCategory;
  status: MarketStatus;

  // Executable YES/NO prices in [0,1]. NO ≈ 1 - YES on binary markets but we
  // keep both because venues quote them independently and spreads differ.
  yesBid: number | null;
  yesAsk: number | null;
  noBid: number | null;
  noAsk: number | null;

  lastPrice: number | null;

  volume24h: number | null;
  totalVolume: number | null;
  liquidity: number | null;

  openTime: string | null; // ISO 8601
  closeTime: string | null; // ISO 8601

  orderBook?: OrderBook;

  url: string;
  lastUpdatedAt: string; // ISO 8601 — every price MUST carry a timestamp (PRD §27)
}

/** Confidence buckets produced by the matching engine (PRD §13, §14). */
export type MatchClassification = 'EXACT' | 'LIKELY' | 'RELATED' | 'NOT_MATCHED';

/** Verification state for a canonical grouping (PRD §15, §19). */
export type MatchStatus =
  | 'VERIFIED_EXACT' // human-verified; only these may generate a guaranteed-arbitrage label
  | 'AUTO_EXACT'
  | 'AUTO_LIKELY'
  | 'AUTO_RELATED'
  | 'SINGLE_VENUE'; // only one venue lists this market

export interface MatchAssessment {
  classification: MatchClassification;
  confidence: number; // 0..1
  reason: string;
  semanticDifferences: string[];
}

/**
 * A real-world question, potentially backed by markets on multiple venues
 * (PRD §11 CanonicalMarket). The unit the product actually presents.
 */
export interface CanonicalMarket {
  id: string;
  title: string;
  description: string;
  category: MarketCategory;
  status: MarketStatus;

  closeTime: string | null;

  matchStatus: MatchStatus;
  match: MatchAssessment | null; // null for single-venue markets

  venueMarkets: VenueMarket[];
}
