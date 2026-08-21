/**
 * Keyword-based category classification. Venues use their own taxonomies, so we
 * map to the CrossMarket sidebar categories (PRD §10) from title/description.
 * Deliberately simple and deterministic; this is a normalization aid, not the
 * matching engine.
 */

import type { MarketCategory } from '../types';

const RULES: Array<{ category: MarketCategory; patterns: RegExp[] }> = [
  {
    category: 'politics',
    patterns: [
      /\b(election|president|senate|congress|governor|primary|nominee|vote|ballot|parliament|prime minister|referendum|impeach)\b/i,
      /\b(trump|biden|harris|republican|democrat|gop)\b/i,
    ],
  },
  {
    category: 'economics',
    patterns: [
      /\b(fed|federal reserve|interest rate|rate cut|rate hike|cpi|inflation|gdp|unemployment|jobs report|recession|fomc|treasury|bls)\b/i,
    ],
  },
  {
    category: 'crypto',
    patterns: [
      /\b(bitcoin|btc|ethereum|eth|solana|sol|crypto|dogecoin|stablecoin|token|nft|defi)\b/i,
    ],
  },
  {
    category: 'sports',
    patterns: [
      /\b(nba|nfl|mlb|nhl|super bowl|world cup|olympics|championship|playoff|premier league|ufc|f1|grand prix|tournament|finals)\b/i,
    ],
  },
  {
    category: 'technology',
    patterns: [
      /\b(ai|artificial intelligence|openai|gpt|apple|google|tesla|spacex|nvidia|chip|iphone|launch|starship|agi|llm)\b/i,
    ],
  },
];

export function classifyCategory(...text: Array<string | null | undefined>): MarketCategory {
  const haystack = text.filter(Boolean).join(' ');
  for (const { category, patterns } of RULES) {
    if (patterns.some((p) => p.test(haystack))) return category;
  }
  return 'other';
}
