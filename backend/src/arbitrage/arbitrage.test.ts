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

test('single-venue market has no arbitrage', () => {
  const k = vm('kalshi', { yesAsk: 0.5, noAsk: 0.4 });
  const m: CanonicalMarket = { ...market('SINGLE_VENUE', k, k), venueMarkets: [k] };
  assert.equal(detectArbitrage(m, fresh), null);
});
