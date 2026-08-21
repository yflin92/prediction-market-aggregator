import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeFreshness, computePriceComparison } from './pricing';
import type { CanonicalMarket, VenueMarket } from '../types';

function vm(venue: VenueMarket['venue'], over: Partial<VenueMarket>): VenueMarket {
  return {
    venue,
    externalMarketId: `${venue}-1`,
    externalEventId: null,
    title: 't',
    description: '',
    rules: '',
    category: 'economics',
    status: 'open',
    yesBid: null,
    yesAsk: null,
    noBid: null,
    noAsk: null,
    lastPrice: null,
    volume24h: null,
    totalVolume: null,
    liquidity: 100_000,
    openTime: null,
    closeTime: null,
    url: '',
    lastUpdatedAt: new Date().toISOString(),
    ...over,
  };
}

function market(vms: VenueMarket[]): CanonicalMarket {
  return {
    id: 'm', title: 't', description: '', category: 'economics', status: 'open',
    closeTime: null, matchStatus: 'AUTO_EXACT', match: null, venueMarkets: vms,
  };
}

test('executable comparison finds cheapest YES ask (PRD §17)', () => {
  const k = vm('kalshi', { yesBid: 0.6, yesAsk: 0.64 });
  const p = vm('polymarket', { yesBid: 0.57, yesAsk: 0.59 });
  const cmp = computePriceComparison(market([k, p]));
  assert.equal(cmp.cheapestYesVenue, 'polymarket');
  assert.equal(cmp.cheapestYesAsk, 0.59);
  assert.ok(Math.abs(cmp.yesAskSpread! - 0.05) < 1e-9);
});

test('midpoint divergence computed from bid/ask midpoints (PRD §16)', () => {
  const k = vm('kalshi', { yesBid: 0.62, yesAsk: 0.64 }); // mid 0.63
  const p = vm('polymarket', { yesBid: 0.57, yesAsk: 0.59 }); // mid 0.58
  const cmp = computePriceComparison(market([k, p]));
  assert.ok(Math.abs(cmp.midpointDivergence! - 0.05) < 1e-9);
});

test('freshness degrades with quote age (PRD §27)', () => {
  const now = Date.parse('2026-01-01T00:00:00Z');
  const freshM = market([vm('kalshi', { lastUpdatedAt: new Date(now - 2000).toISOString() })]);
  assert.equal(computeFreshness(freshM, now).status, 'fresh');

  const degraded = market([vm('kalshi', { lastUpdatedAt: new Date(now - 15_000).toISOString() })]);
  assert.equal(computeFreshness(degraded, now).status, 'degraded');

  const staleM = market([vm('kalshi', { lastUpdatedAt: new Date(now - 120_000).toISOString() })]);
  assert.equal(computeFreshness(staleM, now).status, 'stale');
});
