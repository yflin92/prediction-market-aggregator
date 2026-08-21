import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CanonicalEngine } from './engine';
import { HeuristicClassifier } from '../matching/heuristicClassifier';
import type { VenueMarket } from '../types';

function vm(venue: VenueMarket['venue'], id: string, title: string, over: Partial<VenueMarket> = {}): VenueMarket {
  return {
    venue,
    externalMarketId: id,
    externalEventId: null,
    title,
    description: '',
    rules: '',
    category: 'economics',
    status: 'open',
    yesBid: 0.6,
    yesAsk: 0.62,
    noBid: 0.38,
    noAsk: 0.4,
    lastPrice: 0.61,
    volume24h: 1000,
    totalVolume: 5000,
    liquidity: 10_000,
    openTime: null,
    closeTime: null,
    url: '',
    lastUpdatedAt: new Date().toISOString(),
    ...over,
  };
}

const engine = new CanonicalEngine({ classifier: new HeuristicClassifier() });

test('matches equivalent markets across venues into one canonical market', async () => {
  const markets = [
    vm('kalshi', 'K1', 'Will the Fed cut rates in September?'),
    vm('polymarket', 'P1', 'Will the Fed cut rates at the September meeting?'),
  ];
  const canonical = await engine.build(markets);
  assert.equal(canonical.length, 1);
  assert.equal(canonical[0].venueMarkets.length, 2);
});

test('canonical id is stable across rebuilds (watchlist persistence)', async () => {
  const markets = [
    vm('kalshi', 'K1', 'Will the Fed cut rates in September?'),
    vm('polymarket', 'P1', 'Will the Fed cut rates at the September meeting?'),
  ];
  const first = await engine.build(markets);
  const second = await engine.build(markets.map((m) => ({ ...m }))); // fresh objects
  assert.equal(first[0].id, second[0].id, 'same inputs must yield same canonical id');
});

test('unrelated markets stay separate as single-venue canonical markets', async () => {
  const markets = [
    vm('kalshi', 'K1', 'Will the Fed cut rates in September?'),
    vm('polymarket', 'P1', 'Will the Lakers win the NBA championship?', { category: 'sports' }),
  ];
  const canonical = await engine.build(markets);
  assert.equal(canonical.length, 2);
  assert.ok(canonical.every((c) => c.matchStatus === 'SINGLE_VENUE'));
});
