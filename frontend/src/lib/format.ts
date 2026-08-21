// Presentation helpers (PRD §12): probability vs contract-price display, and
// human-friendly volume/time formatting.

export type PriceFormat = 'percent' | 'cents';

/** Format a [0,1] price as "63%" or "63¢" per the user's preference (PRD §12). */
export function formatPrice(p: number | null | undefined, fmt: PriceFormat): string {
  if (p == null) return '—';
  const scaled = Math.round(p * 100);
  return fmt === 'percent' ? `${scaled}%` : `${scaled}¢`;
}

/** Format a divergence in [0,1] as a delta ("5¢" / "5pt"). */
export function formatDelta(p: number | null | undefined, fmt: PriceFormat): string {
  if (p == null) return '—';
  const scaled = Math.round(p * 100);
  return fmt === 'percent' ? `${scaled}pt` : `${scaled}¢`;
}

export function formatUsd(v: number | string | null | undefined): string {
  const n = toNum(v);
  if (n == null) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export function formatPct(v: number | string | null | undefined): string {
  const n = toNum(v);
  if (n == null) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

/** Coerce a value that may arrive as a numeric string into a finite number. */
function toNum(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function formatCloseTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Data-freshness label (PRD §27). */
export function freshnessLabel(status: string, ageSeconds: number): string {
  if (status === 'fresh') return `Updated ${ageSeconds < 1 ? '<1' : ageSeconds}s ago`;
  if (status === 'degraded') return `Delayed ${ageSeconds}s`;
  return '⚠ Data stale';
}
