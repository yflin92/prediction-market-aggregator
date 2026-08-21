import { formatDelta, formatPrice, formatUsd, type PriceFormat } from '../lib/format';
import type { MarketSummary } from '../lib/types';

export type SortKey = 'divergence' | 'volume' | 'opportunity' | 'title';

const COLUMNS: Array<{ key: SortKey | null; label: string; left?: boolean }> = [
  { key: 'title', label: 'Market', left: true },
  { key: null, label: 'Consensus' },
  { key: null, label: 'Kalshi' },
  { key: null, label: 'Polymarket' },
  { key: 'divergence', label: 'Δ' },
  { key: 'volume', label: 'Volume' },
];

function MatchBadge({ m }: { m: MarketSummary }) {
  if (m.venues.length < 2) return null;
  if (m.arbitrage?.guaranteed)
    return <span className="badge arb-guaranteed">ARB {(m.arbitrage.netEdgePct * 100).toFixed(1)}%</span>;
  if (m.arbitrage)
    return <span className="badge discrepancy">DISCREPANCY</span>;
  if (m.matchStatus === 'VERIFIED_EXACT') return <span className="badge verified">VERIFIED</span>;
  return null;
}

export function MarketTable(props: {
  markets: MarketSummary[];
  selectedId: string | null;
  sort: SortKey;
  onSort: (k: SortKey) => void;
  onSelect: (id: string) => void;
  priceFormat: PriceFormat;
}) {
  const { markets, selectedId, sort, onSort, onSelect, priceFormat } = props;

  if (markets.length === 0) {
    return <div className="empty">No markets to show. The feed refreshes every minute.</div>;
  }

  return (
    <table className="markets">
      <thead>
        <tr>
          {COLUMNS.map((c) => (
            <th
              key={c.label}
              className={`${c.left ? 'left' : ''} ${c.key && sort === c.key ? 'sorted' : ''}`}
              onClick={() => c.key && onSort(c.key)}
            >
              {c.label}
              {c.key && sort === c.key ? ' ▾' : ''}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {markets.map((m) => (
          <tr
            key={m.id}
            className={m.id === selectedId ? 'selected' : ''}
            data-id={m.id}
            onClick={() => onSelect(m.id)}
          >
            <td className="title">
              {m.watched && <span title="Watching">★ </span>}
              {m.title}
              <MatchBadge m={m} />
              {m.venues.map((v) => (
                <span className="badge venue" key={v}>
                  {v === 'kalshi' ? 'K' : 'P'}
                </span>
              ))}
              {m.freshness.status === 'stale' && <span className="badge stale">STALE</span>}
            </td>
            <td>{formatPrice(m.consensus, priceFormat)}</td>
            <td className="kalshi">{formatPrice(m.kalshiYes, priceFormat)}</td>
            <td className="poly">{formatPrice(m.polymarketYes, priceFormat)}</td>
            <td className={m.divergence && m.divergence >= 0.03 ? 'delta' : 'muted'}>
              {formatDelta(m.divergence, priceFormat)}
            </td>
            <td className="muted">{formatUsd(m.volume24h)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
