import type { PriceFormat } from '../lib/format';

export type View =
  | { kind: 'home' }
  | { kind: 'trending' }
  | { kind: 'opportunities' }
  | { kind: 'arbitrage' }
  | { kind: 'watchlist' }
  | { kind: 'category'; category: string };

const CATEGORIES = [
  'politics',
  'economics',
  'crypto',
  'sports',
  'technology',
  'other',
];

function isActive(a: View, b: View): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'category' && b.kind === 'category') return a.category === b.category;
  return true;
}

export function Sidebar(props: {
  view: View;
  onNavigate: (v: View) => void;
  priceFormat: PriceFormat;
  onTogglePriceFormat: () => void;
}) {
  const { view, onNavigate } = props;
  const item = (v: View, label: string, kbd?: string) => (
    <div
      key={label}
      className={`nav-item ${isActive(view, v) ? 'active' : ''}`}
      onClick={() => onNavigate(v)}
    >
      <span>{label}</span>
      {kbd && <span className="kbd">{kbd}</span>}
    </div>
  );

  return (
    <nav className="sidebar">
      {item({ kind: 'home' }, 'Home', '⌘1')}
      {item({ kind: 'trending' }, 'Trending')}
      {item({ kind: 'opportunities' }, 'Opportunities', '⌘2')}
      {item({ kind: 'arbitrage' }, 'Arbitrage', '⌘3')}
      {item({ kind: 'watchlist' }, 'Watchlist', '⌘4')}
      <div className="nav-section">Categories</div>
      {CATEGORIES.map((c) =>
        item({ kind: 'category', category: c }, c[0].toUpperCase() + c.slice(1)),
      )}
      <div className="nav-section">Display</div>
      <div className="nav-item" onClick={props.onTogglePriceFormat}>
        <span>Price format</span>
        <span className="kbd">{props.priceFormat === 'percent' ? '63%' : '63¢'}</span>
      </div>
    </nav>
  );
}
