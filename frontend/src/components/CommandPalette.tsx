import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { MarketSummary } from '../lib/types';

/**
 * Global search palette (PRD §22) — ⌘K queries the entire canonical market
 * index server-side (not just the currently-loaded view), so a search for
 * "bitcoin" finds markets regardless of which tab is open. Seeds from the
 * markets already in memory for an instant first paint.
 */
export function CommandPalette(props: {
  markets: MarketSummary[];
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const { markets, onClose, onSelect } = props;
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [results, setResults] = useState<MarketSummary[]>(markets.slice(0, 20));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced server-side search over the full canonical index.
  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setResults(markets.slice(0, 20));
      return;
    }
    const handle = setTimeout(() => {
      api
        .markets({ query, sort: 'volume' })
        .then((ms) => setResults(ms.slice(0, 20)))
        .catch(() => setResults([]));
    }, 150);
    return () => clearTimeout(handle);
  }, [q, markets]);

  useEffect(() => {
    setActive(0);
  }, [results]);

  const commit = (i: number) => {
    const m = results[i];
    if (m) {
      onSelect(m.id);
      onClose();
    }
  };

  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          placeholder="Search canonical markets across Kalshi & Polymarket…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter') {
              commit(active);
            } else if (e.key === 'Escape') {
              onClose();
            }
          }}
        />
        <div className="palette-results">
          {results.map((m, i) => (
            <div
              key={m.id}
              className={`palette-item ${i === active ? 'active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => commit(i)}
            >
              <span className="pi-title">{m.title}</span>
              <span className="muted" style={{ fontSize: 11 }}>
                {m.venues.map((v) => (v === 'kalshi' ? 'K' : 'P')).join('·')}
              </span>
            </div>
          ))}
          {results.length === 0 && <div className="empty">No matches.</div>}
        </div>
      </div>
    </div>
  );
}
