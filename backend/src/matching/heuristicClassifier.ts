/**
 * Deterministic heuristic pair classifier (PRD §13, §14).
 *
 * Design principle (PRD §9.2): matching is conservative. It is preferable to
 * miss an opportunity than to falsely claim equivalence. So this classifier
 * only returns EXACT when lexical similarity is high AND every threshold / time
 * window / year it can extract agrees. Any mismatch in those hard signals caps
 * the result at RELATED and records a semantic difference — which downstream
 * disables the arbitrage label (PRD §19, §26).
 */

import type { MatchAssessment, MatchClassification, VenueMarket } from '../types';
import type { PairClassifier } from './classifier';
import {
  extractMonths,
  extractNumbers,
  extractYears,
  jaccard,
  tokenSet,
} from './text';

function setEquals(a: string[], b: string[]): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size !== sb.size) return false;
  for (const x of sa) if (!sb.has(x)) return false;
  return true;
}

export class HeuristicClassifier implements PairClassifier {
  async classify(a: VenueMarket, b: VenueMarket): Promise<MatchAssessment> {
    const titleSim = jaccard(tokenSet(a.title), tokenSet(b.title));
    const bodyA = `${a.title} ${a.description}`;
    const bodyB = `${b.title} ${b.description}`;
    const hasBody = a.description.length > 0 && b.description.length > 0;
    const bodySim = jaccard(tokenSet(bodyA), tokenSet(bodyB));

    // Blend title (weighted higher) with body similarity — but only let the body
    // pull the score when both markets actually have a description. Otherwise an
    // empty body would spuriously drag down an otherwise strong title match.
    const lexical = hasBody ? 0.6 * titleSim + 0.4 * bodySim : titleSim;

    const differences: string[] = [];

    // Hard signal: numeric thresholds must agree (PRD §13 Threshold, §26).
    const numsA = extractNumbers(a.title);
    const numsB = extractNumbers(b.title);
    const thresholdConflict =
      numsA.length > 0 && numsB.length > 0 && !setEquals(numsA, numsB);
    if (thresholdConflict) {
      differences.push(
        `Threshold differs: Kalshi mentions ${numsA.join(', ')} vs Polymarket ${numsB.join(', ')}.`,
      );
    }

    // Hard signal: time window (year / month) must agree (PRD §13 Time window).
    const yearsA = extractYears(bodyA);
    const yearsB = extractYears(bodyB);
    const yearConflict =
      yearsA.length > 0 && yearsB.length > 0 && !setEquals(yearsA, yearsB);
    if (yearConflict) {
      differences.push(
        `Time window differs: ${yearsA.join(', ')} vs ${yearsB.join(', ')}.`,
      );
    }

    const monthsA = extractMonths(a.title);
    const monthsB = extractMonths(b.title);
    const monthConflict =
      monthsA.length > 0 && monthsB.length > 0 && !setEquals(monthsA, monthsB);
    if (monthConflict) {
      differences.push(
        `Month differs: ${monthsA.join(', ')} vs ${monthsB.join(', ')}.`,
      );
    }

    const hardConflict = thresholdConflict || yearConflict || monthConflict;

    // Category mismatch is a soft signal that lowers confidence.
    if (a.category !== b.category) {
      differences.push(
        `Category differs: ${a.category} vs ${b.category}.`,
      );
    }

    let classification: MatchClassification;
    let confidence: number;

    if (hardConflict) {
      // A concrete economic difference exists — never call this exact.
      classification = lexical >= 0.35 ? 'RELATED' : 'NOT_MATCHED';
      confidence = Math.min(lexical, 0.5);
    } else if (lexical >= 0.6) {
      classification = 'EXACT';
      confidence = Math.min(0.7 + lexical * 0.3, 0.99);
    } else if (lexical >= 0.4) {
      classification = 'LIKELY';
      confidence = 0.5 + (lexical - 0.4) * 1.5;
    } else if (lexical >= 0.22) {
      classification = 'RELATED';
      confidence = lexical;
    } else {
      classification = 'NOT_MATCHED';
      confidence = lexical;
    }

    const reason =
      classification === 'NOT_MATCHED'
        ? `Low lexical overlap (${(lexical * 100).toFixed(0)}%).`
        : `Lexical similarity ${(lexical * 100).toFixed(0)}%` +
          (differences.length
            ? `; ${differences.length} semantic difference(s) detected.`
            : '; no blocking differences detected.');

    return {
      classification,
      confidence: Number(confidence.toFixed(3)),
      reason,
      semanticDifferences: differences,
    };
  }
}
