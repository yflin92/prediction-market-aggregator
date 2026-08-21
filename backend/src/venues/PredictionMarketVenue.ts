/**
 * The venue-adapter abstraction (PRD §42). Adding a future platform should
 * mean implementing this interface, not rewriting the application. Phase-2
 * trading methods (getBalances, placeOrder, …) are intentionally omitted from
 * the MVP interface and will be added as a separate `TradingVenue` extension.
 */

import type { OrderBook, VenueMarket } from '../types';

export interface ListMarketsOptions {
  /** Free-text query to filter markets at the source where supported. */
  query?: string;
  /** Cap on markets returned; adapters should page as needed to satisfy it. */
  limit?: number;
}

export interface PredictionMarketVenue {
  readonly venue: VenueMarket['venue'];

  /** Fetch active markets, normalized to VenueMarket. */
  listMarkets(opts?: ListMarketsOptions): Promise<VenueMarket[]>;

  /** Fetch a single market by its venue-native id. */
  getMarket(externalMarketId: string): Promise<VenueMarket | null>;

  /** Fetch the current order book for a market's YES side. */
  getOrderBook(externalMarketId: string): Promise<OrderBook | null>;
}
