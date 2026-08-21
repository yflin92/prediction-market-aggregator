/**
 * Optional LLM pair classifier (PRD §14). Off by default; enabled only when an
 * Anthropic API key is present. Wraps a heuristic pre-filter so we don't spend
 * tokens on obviously-unrelated pairs, then asks Claude to classify the pair
 * into EXACT / LIKELY / RELATED / NOT_MATCHED with confidence, reason, and the
 * semantic differences that would block an arbitrage label.
 *
 * The interface is identical to HeuristicClassifier, so the canonical engine is
 * agnostic to which one is in use.
 */

import type { MatchAssessment, VenueMarket } from '../types';
import type { PairClassifier } from './classifier';
import { HeuristicClassifier } from './heuristicClassifier';
import { jaccard, tokenSet } from './text';

const MODEL = 'claude-opus-4-8';
const API_URL = 'https://api.anthropic.com/v1/messages';

interface AnthropicResponse {
  content: Array<{ type: string; text?: string }>;
}

const SYSTEM_PROMPT = `You compare two prediction-market contracts from different venues and decide whether they represent the SAME economic proposition.

Be conservative: only answer EXACT when the entity, predicate, threshold, time window, and resolution criteria are all equivalent. If any of these differ, the best you may answer is RELATED and you MUST list the difference. A false EXACT is the worst possible error.

Respond with ONLY a JSON object, no prose:
{
  "classification": "EXACT" | "LIKELY" | "RELATED" | "NOT_MATCHED",
  "confidence": number between 0 and 1,
  "reason": "one sentence",
  "semantic_differences": ["..."]
}`;

export class LlmClassifier implements PairClassifier {
  private readonly fallback = new HeuristicClassifier();

  constructor(private readonly apiKey: string) {}

  static fromEnv(): LlmClassifier | null {
    const key = process.env.ANTHROPIC_API_KEY;
    return key ? new LlmClassifier(key) : null;
  }

  async classify(a: VenueMarket, b: VenueMarket): Promise<MatchAssessment> {
    // Cheap pre-filter: don't spend tokens on clearly unrelated pairs.
    const lexical = jaccard(tokenSet(a.title), tokenSet(b.title));
    if (lexical < 0.15) {
      return this.fallback.classify(a, b);
    }

    const userPrompt = [
      `Contract A (${a.venue}):`,
      `  Title: ${a.title}`,
      `  Rules: ${truncate(a.rules, 800)}`,
      '',
      `Contract B (${b.venue}):`,
      `  Title: ${b.title}`,
      `  Rules: ${truncate(b.rules, 800)}`,
    ].join('\n');

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 400,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });
      if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
      const data = (await res.json()) as AnthropicResponse;
      const text = data.content.find((c) => c.type === 'text')?.text ?? '';
      return parseAssessment(text);
    } catch {
      // On any LLM failure, degrade gracefully to the heuristic classifier.
      return this.fallback.classify(a, b);
    }
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function parseAssessment(text: string): MatchAssessment {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  const json = start >= 0 && end > start ? text.slice(start, end + 1) : text;
  const raw = JSON.parse(json) as {
    classification: MatchAssessment['classification'];
    confidence: number;
    reason: string;
    semantic_differences?: string[];
  };
  return {
    classification: raw.classification,
    confidence: Math.max(0, Math.min(1, raw.confidence)),
    reason: raw.reason,
    semanticDifferences: raw.semantic_differences ?? [],
  };
}
