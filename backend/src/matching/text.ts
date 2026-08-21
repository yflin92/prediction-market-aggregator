/**
 * Text-normalization and similarity helpers for candidate generation
 * (PRD §13, §14). Kept deterministic and dependency-free so matching behavior
 * is reproducible and testable.
 */

const STOPWORDS = new Set([
  'will',
  'the',
  'a',
  'an',
  'of',
  'in',
  'on',
  'at',
  'to',
  'for',
  'by',
  'be',
  'is',
  'are',
  'and',
  'or',
  'this',
  'that',
  'market',
  'resolve',
  'resolves',
  'yes',
  'no',
]);

/** Numbers, thresholds and dates carry economic meaning — extract them. */
const NUMBER_RE = /\$?\d[\d,]*(?:\.\d+)?%?/g;
const MONTH_RE =
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/gi;

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9%$.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(s: string): string[] {
  return normalize(s)
    .split(' ')
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

export function tokenSet(s: string): Set<string> {
  return new Set(tokenize(s));
}

/** Jaccard overlap of token sets — cheap lexical similarity in [0,1]. */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Extract numeric thresholds (e.g. "$150,000", "3.0%") for comparison. */
export function extractNumbers(s: string): string[] {
  return (s.match(NUMBER_RE) ?? []).map((n) => n.replace(/,/g, ''));
}

/** Extract month mentions to compare time windows (PRD §13 Time window). */
export function extractMonths(s: string): string[] {
  return (s.match(MONTH_RE) ?? []).map((m) => m.slice(0, 3).toLowerCase());
}

/** Extract 4-digit years. */
export function extractYears(s: string): string[] {
  return (s.match(/\b(20\d{2})\b/g) ?? []);
}
