import {
  formatPrice,
  formatUsd,
  formatPct,
  formatCloseTime,
  freshnessLabel,
  type PriceFormat,
} from '../lib/format';
import type { MarketDetail, VenueMarketDetail } from '../lib/types';

function VenueCard({ vm, fmt }: { vm: VenueMarketDetail; fmt: PriceFormat }) {
  const name = vm.venue === 'kalshi' ? 'Kalshi' : 'Polymarket';
  return (
    <div className="venue-card">
      <h4>
        <span className={vm.venue === 'kalshi' ? 'kalshi' : 'poly'}>{name}</span>
        <span className="muted">YES</span>
      </h4>
      <div className="quote">
        {formatPrice(vm.yesBid, fmt)} / {formatPrice(vm.yesAsk, fmt)}
      </div>
      <div className="row">
        <span>Volume 24h</span>
        <span className="val">{formatUsd(vm.volume24h)}</span>
      </div>
      <div className="row">
        <span>Liquidity</span>
        <span className="val">{formatUsd(vm.liquidity)}</span>
      </div>
      <div className="row">
        <span>NO ask</span>
        <span className="val">{formatPrice(vm.noAsk, fmt)}</span>
      </div>
    </div>
  );
}

/** Explains an arbitrage / discrepancy in plain language (PRD §3, §18). */
function ArbitrageBox({ d }: { d: MarketDetail }) {
  const a = d.arbitrageDetail;
  if (!a) return null;
  const yesName = a.yesVenue === 'kalshi' ? 'Kalshi' : 'Polymarket';
  const noName = a.noVenue === 'kalshi' ? 'Kalshi' : 'Polymarket';
  return (
    <div className="section">
      <h3>{a.guaranteed ? 'Guaranteed Arbitrage' : 'Potential Pricing Discrepancy'}</h3>
      <div className={`explain ${a.guaranteed ? '' : 'warn'}`}>
        Buy YES on <b>{yesName}</b> at <b>{formatPrice(a.yesAsk, 'cents')}</b>
        <br />
        Buy NO on <b>{noName}</b> at <b>{formatPrice(a.noAsk, 'cents')}</b>
        <br />
        Gross combined cost: <b>{formatPrice(a.combinedCost, 'cents')}</b>
        <br />
        Settlement value if equivalent: <b>$1.00</b>
        <br />
        Gross edge: <b>{formatPct(a.grossReturnPct)}</b> · Est. fees:{' '}
        <b>{formatPct(a.estimatedFeePct)}</b> · Net edge: <b>{formatPct(a.netEdgePct)}</b>
        <br />
        Max executable size: <b>{formatUsd(a.maxSize)}</b>
        {!a.guaranteed && (
          <div className="diff-warn">
            Not labeled guaranteed: requires a VERIFIED_EXACT match, fresh data, and
            sufficient liquidity (PRD §19).
          </div>
        )}
      </div>
    </div>
  );
}

/** Side-by-side resolution-rule diff (PRD §26). */
function RulesDiff({ d }: { d: MarketDetail }) {
  const k = d.venueMarkets.find((v) => v.venue === 'kalshi');
  const p = d.venueMarkets.find((v) => v.venue === 'polymarket');
  const diffs = d.match?.semanticDifferences ?? [];
  return (
    <div className="section">
      <h3>Resolution Rules</h3>
      <div className="rules-diff">
        <div className="rules-col">
          <h5 className="kalshi">Kalshi</h5>
          {k?.rules || <span className="muted">No rules provided.</span>}
        </div>
        <div className="rules-col">
          <h5 className="poly">Polymarket</h5>
          {p?.rules || <span className="muted">No rules provided.</span>}
        </div>
      </div>
      {diffs.length > 0 && (
        <div className="diff-warn">
          ⚠ {diffs.length} semantic difference(s):
          <ul style={{ margin: '4px 0', paddingLeft: 18 }}>
            {diffs.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
          Contracts may not be identical — arbitrage classification limited.
        </div>
      )}
    </div>
  );
}

function OrderBook({ vm }: { vm: VenueMarketDetail }) {
  if (!vm.orderBook) return null;
  const name = vm.venue === 'kalshi' ? 'Kalshi' : 'Polymarket';
  return (
    <div>
      <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>
        {name}
      </div>
      <div className="orderbook">
        <div className="ob-side ob-bid">
          {vm.orderBook.bids.slice(0, 6).map((l, i) => (
            <div className="ob-row" key={i}>
              <span className="price">{Math.round(l.price * 100)}¢</span>
              <span>{Math.round(l.size)}</span>
            </div>
          ))}
        </div>
        <div className="ob-side ob-ask">
          {vm.orderBook.asks.slice(0, 6).map((l, i) => (
            <div className="ob-row" key={i}>
              <span className="price">{Math.round(l.price * 100)}¢</span>
              <span>{Math.round(l.size)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DetailPane(props: {
  detail: MarketDetail | null;
  loading: boolean;
  priceFormat: PriceFormat;
  onToggleWatch: (id: string, on: boolean) => void;
}) {
  const { detail: d, loading, priceFormat: fmt } = props;

  if (loading && !d) return <div className="detail empty">Loading…</div>;
  if (!d) return <div className="detail empty">Select a market to see venue comparison.</div>;

  const matched = d.venues.length > 1;
  const staleAny = d.venueMarkets.some(() => d.freshness.status === 'stale');

  return (
    <div className="detail">
      <h2>{d.title}</h2>
      <div className="sub">
        <span>{formatCloseTime(d.closeTime)}</span>
        <span>·</span>
        <span style={{ textTransform: 'capitalize' }}>{d.category}</span>
        <span>·</span>
        <span className={staleAny ? 'badge stale' : ''}>
          {freshnessLabel(d.freshness.status, d.freshness.ageSeconds)}
        </span>
        <button
          className={`watch-btn ${d.watched ? 'on' : ''}`}
          onClick={() => props.onToggleWatch(d.id, !d.watched)}
        >
          {d.watched ? '★ Watching' : '☆ Watch'}
        </button>
      </div>

      <div className="muted" style={{ fontSize: 11 }}>Consensus probability</div>
      <div className="consensus">{formatPrice(d.consensus, fmt)}</div>

      {matched && (
        <div className="venue-grid">
          {d.venueMarkets.map((vm) => (
            <VenueCard key={vm.venue} vm={vm} fmt={fmt} />
          ))}
        </div>
      )}

      {matched && d.price.midpointDivergence != null && (
        <div className="section">
          <h3>Executable Price Comparison</h3>
          <div className="explain">
            {d.price.cheapestYesVenue && (
              <>
                Cheapest place to buy YES:{' '}
                <b>
                  {d.price.cheapestYesVenue === 'kalshi' ? 'Kalshi' : 'Polymarket'} at{' '}
                  {formatPrice(d.price.cheapestYesAsk, 'cents')}
                </b>
                {d.price.yesAskSpread != null && d.price.yesAskSpread > 0 && (
                  <> — {formatPrice(d.price.yesAskSpread, 'cents')} cheaper than the other venue.</>
                )}
                <br />
              </>
            )}
            Midpoint divergence: <b>{formatPrice(d.price.midpointDivergence, 'cents')}</b>
          </div>
        </div>
      )}

      <ArbitrageBox d={d} />

      {matched && d.match && (
        <div className="section">
          <h3>Matching Assessment</h3>
          <div className="explain">
            <b>{Math.round(d.match.confidence * 100)}% match</b> — {d.match.classification}
            {d.matchStatus === 'VERIFIED_EXACT' && ' (Verified Exact)'}
            <br />
            {d.match.reason}
          </div>
        </div>
      )}

      {matched && <RulesDiff d={d} />}

      {matched && d.venueMarkets.some((v) => v.orderBook) && (
        <div className="section">
          <h3>Order Books</h3>
          {d.venueMarkets.map((vm) => (
            <OrderBook key={vm.venue} vm={vm} />
          ))}
        </div>
      )}

      <div className="section">
        <h3>Trade / Source</h3>
        {d.venueMarkets.map((vm) => (
          <a
            key={vm.venue}
            className={`link-btn ${vm.venue === 'kalshi' ? '' : 'secondary'}`}
            href={vm.url}
            target="_blank"
            rel="noreferrer"
          >
            Open {vm.venue === 'kalshi' ? 'Kalshi' : 'Polymarket'}
          </a>
        ))}
      </div>
    </div>
  );
}
