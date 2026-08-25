import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectArbitrage } from './arbitrage';
import type { CanonicalMarket, MatchStatus, VenueMarket } from '../types';
import type { FreshnessInfo } from '../types/analysis';

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

function market(status: MatchStatus, k: VenueMarket, p: VenueMarket): CanonicalMarket {
  return {
    id: 'm1',
    title: 't',
    description: '',
    category: 'economics',
    status: 'open',
    closeTime: null,
    matchStatus: status,
    match: null,
    venueMarkets: [k, p],
  };
}

const fresh: FreshnessInfo = { status: 'fresh', ageSeconds: 0 };
const stale: FreshnessInfo = { status: 'stale', ageSeconds: 120 };

test('detects arbitrage when YES + NO combined < $1', () => {
  const k = vm('kalshi', { yesAsk: 0.64, noAsk: 0.4 });
  const p = vm('polymarket', { yesAsk: 0.47, noAsk: 0.49 });
  const arb = detectArbitrage(market('VERIFIED_EXACT', k, p), fresh);
  assert.ok(arb);
  // best direction: YES on polymarket (0.47) + NO on kalshi (0.40) = 0.87
  assert.equal(arb!.combinedCost, 0.87);
  assert.ok(arb!.grossEdge > 0.12);
});

test('no arbitrage when combined cost >= $1', () => {
  const k = vm('kalshi', { yesAsk: 0.6, noAsk: 0.42 });
  const p = vm('polymarket', { yesAsk: 0.6, noAsk: 0.42 });
  const arb = detectArbitrage(market('VERIFIED_EXACT', k, p), fresh);
  assert.equal(arb, null);
});

test('guaranteed label requires VERIFIED_EXACT (PRD §19)', () => {
  const k = vm('kalshi', { yesAsk: 0.64, noAsk: 0.4 });
  const p = vm('polymarket', { yesAsk: 0.47, noAsk: 0.49 });
  const autoMatch = detectArbitrage(market('AUTO_EXACT', k, p), fresh);
  assert.ok(autoMatch);
  assert.equal(autoMatch!.guaranteed, false);
  assert.equal(autoMatch!.label, 'Potential pricing discrepancy');

  const verified = detectArbitrage(market('VERIFIED_EXACT', k, p), fresh);
  assert.equal(verified!.guaranteed, true);
  assert.equal(verified!.label, 'Guaranteed Arbitrage');
});

test('stale data never yields a guaranteed label (PRD §27)', () => {
  const k = vm('kalshi', { yesAsk: 0.64, noAsk: 0.4 });
  const p = vm('polymarket', { yesAsk: 0.47, noAsk: 0.49 });
  const arb = detectArbitrage(market('VERIFIED_EXACT', k, p), stale);
  assert.ok(arb);
  assert.equal(arb!.guaranteed, false);
});

test('no liquidity on one venue: gross edge exists but not guaranteed', () => {
  // Kalshi has a book with size; polymarket has zero depth (no orderBook and
  // liquidity 0). The gross pricing edge still exists, but executable size is
  // bounded by the thinner (empty) leg, so it falls below MIN_SIZE_USD and the
  // opportunity cannot be labeled guaranteed (PRD §18, Risk 3).
  const k = vm('kalshi', {
    yesAsk: 0.4,
    noAsk: 0.4,
    liquidity: 100_000,
    orderBook: { asks: [{ price: 0.4, size: 1000 }], bids: [] },
  });
  const p = vm('polymarket', {
    yesAsk: 0.47,
    noAsk: 0.47,
    liquidity: 0,
    orderBook: { asks: [], bids: [] },
  });
  const arb = detectArbitrage(market('VERIFIED_EXACT', k, p), fresh);
  assert.ok(arb, 'a gross pricing edge should still be surfaced');
  assert.ok(arb!.grossEdge > 0, 'combined cost is under $1');
  assert.equal(arb!.maxSize, 0, 'thinner leg has no executable size');
  assert.equal(arb!.guaranteed, false, 'zero size cannot be guaranteed');
  assert.equal(arb!.label, 'Potential pricing discrepancy');
});

test('single-venue market has no arbitrage', () => {
  const k = vm('kalshi', { yesAsk: 0.5, noAsk: 0.4 });
  const m: CanonicalMarket = { ...market('SINGLE_VENUE', k, k), venueMarkets: [k] };
  assert.equal(detectArbitrage(m, fresh), null);
});
