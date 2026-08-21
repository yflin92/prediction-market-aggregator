import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HeuristicClassifier } from './heuristicClassifier';
import type { VenueMarket } from '../types';

function vm(partial: Partial<VenueMarket> & { venue: VenueMarket['venue']; title: string }): VenueMarket {
  return {
    externalMarketId: partial.title,
    externalEventId: null,
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
    liquidity: null,
    openTime: null,
    closeTime: null,
    url: '',
    lastUpdatedAt: new Date().toISOString(),
    ...partial,
  };
}

const c = new HeuristicClassifier();

test('near-identical Fed rate cut markets classify EXACT', async () => {
  const a = vm({ venue: 'kalshi', title: 'Will the Fed cut rates at the September meeting?' });
  const b = vm({ venue: 'polymarket', title: 'Will the Fed cut rates in September?' });
  const r = await c.classify(a, b);
  assert.equal(r.classification, 'EXACT');
  assert.equal(r.semanticDifferences.length, 0);
});

test('differing numeric thresholds never classify EXACT (PRD §26)', async () => {
  const a = vm({ venue: 'kalshi', title: 'Will BTC exceed $150,000 in 2026?' });
  const b = vm({ venue: 'polymarket', title: 'Will BTC exceed $120,000 in 2026?', category: 'crypto' });
  // category mismatch is intentional to also exercise soft signal
  const a2 = vm({ venue: 'kalshi', title: 'Will BTC exceed $150,000 in 2026?', category: 'crypto' });
  const r = await c.classify(a2, b);
  assert.notEqual(r.classification, 'EXACT');
  assert.ok(r.semanticDifferences.some((d) => /Threshold differs/.test(d)));
  void a;
});

test('differing years are flagged and block EXACT (PRD §13 time window)', async () => {
  const a = vm({ venue: 'kalshi', title: 'Will the Democrats win the 2026 House?', description: 'Resolves for 2026 elections' });
  const b = vm({ venue: 'polymarket', title: 'Will the Democrats win the 2028 House?', description: 'Resolves for 2028 elections' });
  const r = await c.classify(a, b);
  assert.notEqual(r.classification, 'EXACT');
  assert.ok(r.semanticDifferences.some((d) => /Time window differs/.test(d)));
});

test('unrelated markets classify NOT_MATCHED', async () => {
  const a = vm({ venue: 'kalshi', title: 'Will the Fed cut rates in September?' });
  const b = vm({ venue: 'polymarket', title: 'Will the Lakers win the NBA championship?', category: 'sports' });
  const r = await c.classify(a, b);
  assert.equal(r.classification, 'NOT_MATCHED');
});
