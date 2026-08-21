// Wire types mirroring the backend serializer. Kept minimal — only what the UI
// reads. See backend/src/api/serialize.ts for the source of truth.

export type Venue = 'kalshi' | 'polymarket';
export type Category =
  | 'politics'
  | 'economics'
  | 'crypto'
  | 'sports'
  | 'technology'
  | 'other';

export interface Freshness {
  status: 'fresh' | 'degraded' | 'stale';
  ageSeconds: number;
}

export interface ArbitrageSummary {
  netEdgePct: number;
  guaranteed: boolean;
  label: string;
}

export interface MarketSummary {
  id: string;
  title: string;
  category: Category;
  status: string;
  closeTime: string | null;
  matchStatus: string;
  matchConfidence: number | null;
  venues: Venue[];
  consensus: number | null;
  kalshiYes: number | null;
  polymarketYes: number | null;
  divergence: number | null;
  volume24h: number | null;
  liquidity: number | null;
  opportunityScore: number;
  arbitrage: ArbitrageSummary | null;
  freshness: Freshness;
  watched: boolean;
}

export interface MatchAssessment {
  classification: string;
  confidence: number;
  reason: string;
  semanticDifferences: string[];
}

export interface OrderBookLevel {
  price: number;
  size: number;
}

export interface VenueMarketDetail {
  venue: Venue;
  title: string;
  rules: string;
  yesBid: number | null;
  yesAsk: number | null;
  noBid: number | null;
  noAsk: number | null;
  lastPrice: number | null;
  volume24h: number | null;
  totalVolume: number | null;
  liquidity: number | null;
  closeTime: string | null;
  url: string;
  lastUpdatedAt: string;
  orderBook: { bids: OrderBookLevel[]; asks: OrderBookLevel[] } | null;
}

export interface PriceComparison {
  consensus: number | null;
  midpointDivergence: number | null;
  cheapestYesVenue: Venue | null;
  cheapestYesAsk: number | null;
  yesAskSpread: number | null;
  cheapestNoVenue: Venue | null;
  cheapestNoAsk: number | null;
}

export interface ArbitrageDetail extends ArbitrageSummary {
  yesVenue: Venue;
  yesAsk: number;
  noVenue: Venue;
  noAsk: number;
  combinedCost: number;
  grossEdge: number;
  grossReturnPct: number;
  maxSize: number;
  estimatedFeePct: number;
}

export interface MarketDetail extends MarketSummary {
  description: string;
  match: MatchAssessment | null;
  price: PriceComparison;
  arbitrageDetail: ArbitrageDetail | null;
  venueMarkets: VenueMarketDetail[];
}
