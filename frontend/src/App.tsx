import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './lib/api';
import type { MarketDetail, MarketSummary } from './lib/types';
import type { PriceFormat } from './lib/format';
import { Sidebar, type View } from './components/Sidebar';
import { MarketTable, type SortKey } from './components/MarketTable';
import { DetailPane } from './components/DetailPane';
import { CommandPalette } from './components/CommandPalette';

const VIEW_TITLES: Record<string, string> = {
  home: 'All Markets',
  trending: 'Trending',
  opportunities: 'Opportunities',
  arbitrage: 'Arbitrage',
  watchlist: 'Watchlist',
};

export function App() {
  const [view, setView] = useState<View>({ kind: 'home' });
  const [markets, setMarkets] = useState<MarketSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MarketDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sort, setSort] = useState<SortKey>('opportunity');
  const [priceFormat, setPriceFormat] = useState<PriceFormat>('cents');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [health, setHealth] = useState<{ classifier: string; marketCount: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    api.health().then(setHealth).catch(() => {});
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  // Load the market list whenever the view or sort changes.
  const loadMarkets = useCallback(async () => {
    try {
      let data: MarketSummary[];
      if (view.kind === 'opportunities') {
        data = await api.opportunities(0.02);
      } else if (view.kind === 'arbitrage') {
        data = await api.arbitrage();
      } else if (view.kind === 'watchlist') {
        data = await api.watchlist();
      } else if (view.kind === 'category') {
        data = await api.markets({ category: view.category, sort });
      } else if (view.kind === 'trending') {
        data = await api.markets({ sort: 'volume' });
      } else {
        data = await api.markets({ sort });
      }
      setMarkets(data);
    } catch {
      showToast('Could not reach the backend. Is it running on :8787?');
    }
  }, [view, sort, showToast]);

  useEffect(() => {
    loadMarkets();
    const t = setInterval(loadMarkets, 30_000); // keep the feed warm (PRD §28)
    return () => clearInterval(t);
  }, [loadMarkets]);

  // Load detail when selection changes.
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    api
      .market(selectedId)
      .then((d) => !cancelled && setDetail(d))
      .catch(() => !cancelled && setDetail(null))
      .finally(() => !cancelled && setDetailLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const toggleWatch = useCallback(
    async (id: string, on: boolean) => {
      await api.watch(id, on);
      setDetail((d) => (d && d.id === id ? { ...d, watched: on } : d));
      setMarkets((ms) => ms.map((m) => (m.id === id ? { ...m, watched: on } : m)));
      showToast(on ? 'Added to watchlist' : 'Removed from watchlist');
      if (view.kind === 'watchlist') loadMarkets();
    },
    [showToast, view.kind, loadMarkets],
  );

  // Keyboard shortcuts (PRD §29).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing =
        (e.target as HTMLElement)?.tagName === 'INPUT' ||
        (e.target as HTMLElement)?.tagName === 'TEXTAREA';

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        const map: Record<string, View> = {
          '1': { kind: 'home' },
          '2': { kind: 'opportunities' },
          '3': { kind: 'arbitrage' },
          '4': { kind: 'watchlist' },
        };
        setView(map[e.key]);
        setSelectedId(null);
        return;
      }
      if (typing || paletteOpen) return;

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        moveSelection(e.key === 'ArrowDown' ? 1 : -1);
      } else if (e.key.toLowerCase() === 'w' && selectedId) {
        const cur = markets.find((m) => m.id === selectedId);
        if (cur) toggleWatch(selectedId, !cur.watched);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markets, selectedId, paletteOpen, toggleWatch]);

  const moveSelection = (delta: number) => {
    setSelectedId((cur) => {
      const idx = markets.findIndex((m) => m.id === cur);
      const next = Math.max(0, Math.min(markets.length - 1, (idx < 0 ? 0 : idx) + delta));
      const id = markets[next]?.id ?? null;
      // Scroll the row into view.
      requestAnimationFrame(() => {
        tableRef.current
          ?.querySelector(`tr[data-id="${id}"]`)
          ?.scrollIntoView({ block: 'nearest' });
      });
      return id;
    });
  };

  const title = useMemo(() => {
    if (view.kind === 'category') return view.category[0].toUpperCase() + view.category.slice(1);
    return VIEW_TITLES[view.kind] ?? '';
  }, [view]);

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          Cross<span>Market</span>
        </div>
        <div className="status">
          {title} · {markets.length} markets
          {health && ` · matcher: ${health.classifier}`}
        </div>
        <div className="spacer" />
        <div className="search-hint" onClick={() => setPaletteOpen(true)}>
          Search ⌘K
        </div>
        <button className="theme-toggle" onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}>
          {theme === 'dark' ? '☾' : '☀'}
        </button>
      </header>

      <Sidebar
        view={view}
        onNavigate={(v) => {
          setView(v);
          setSelectedId(null);
        }}
        priceFormat={priceFormat}
        onTogglePriceFormat={() => setPriceFormat((f) => (f === 'percent' ? 'cents' : 'percent'))}
      />

      <div className={`main ${selectedId ? '' : 'no-detail'}`}>
        <div className="table-pane" ref={tableRef}>
          <MarketTable
            markets={markets}
            selectedId={selectedId}
            sort={sort}
            onSort={setSort}
            onSelect={setSelectedId}
            priceFormat={priceFormat}
          />
        </div>
        {selectedId && (
          <div className="detail-pane">
            <DetailPane
              detail={detail}
              loading={detailLoading}
              priceFormat={priceFormat}
              onToggleWatch={toggleWatch}
            />
          </div>
        )}
      </div>

      {paletteOpen && (
        <CommandPalette
          markets={markets}
          onClose={() => setPaletteOpen(false)}
          onSelect={(id) => setSelectedId(id)}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
