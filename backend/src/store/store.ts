/**
 * Local data store (PRD §41 "Local Data Store"). In-memory for the MVP: holds
 * the latest canonical market snapshot plus the persisted watchlist (PRD §23).
 *
 * The watchlist keys on canonical market id and survives refreshes because ids
 * for verified pairings are stable; auto-matched ids are regenerated per build,
 * so a production store would key watchlist on venue market ids. Kept simple
 * here to match MVP scope.
 */

import type { CanonicalMarket } from '../types';
import type { EnrichedMarket } from '../types/analysis';

export interface StoredMarket {
  canonical: CanonicalMarket;
  enriched: EnrichedMarket;
}

export class MarketStore {
  private markets: StoredMarket[] = [];
  private byId = new Map<string, StoredMarket>();
  private watchlist = new Set<string>();
  private lastRefresh: string | null = null;

  replaceAll(markets: StoredMarket[]): void {
    this.markets = markets;
    this.byId = new Map(markets.map((m) => [m.canonical.id, m]));
    this.lastRefresh = new Date().toISOString();
  }

  all(): StoredMarket[] {
    return this.markets;
  }

  get(id: string): StoredMarket | undefined {
    return this.byId.get(id);
  }

  getLastRefresh(): string | null {
    return this.lastRefresh;
  }

  isWatched(id: string): boolean {
    return this.watchlist.has(id);
  }

  watch(id: string): void {
    this.watchlist.add(id);
  }

  unwatch(id: string): void {
    this.watchlist.delete(id);
  }

  watchedIds(): string[] {
    return [...this.watchlist];
  }
}
