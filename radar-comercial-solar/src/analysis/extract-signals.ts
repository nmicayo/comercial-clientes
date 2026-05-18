import type { LogisticSignal } from "../contracts/lead-types.ts";
import { excludedSegmentPatterns, negativeScoreCriteria, positiveScoreCriteria, storageNegativeCriteria, storageScoreCriteria } from "../config/score-rules.ts";

const negativeContextPattern = /\b(sem|não|nao|nunca|não há|nao ha|não informa|nao informa|não descreve|nao descreve|não comercializamos|nao comercializamos)\b/i;

const splitIntoSentences = (text: string): string[] =>
  text
    .split(/[.!?]\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

const findEvidenceInSentences = (
  sentences: string[],
  patterns: RegExp[],
  allowNegation: boolean
): string | undefined => {
  for (const sentence of sentences) {
    if (!allowNegation && negativeContextPattern.test(sentence)) {
      continue;
    }

    for (const pattern of patterns) {
      const match = sentence.match(pattern);

      if (match?.[0]) {
        return match[0];
      }
    }
  }

  return undefined;
};

export const isExcludedSegment = (text: string): boolean =>
  excludedSegmentPatterns.some((pattern) => pattern.test(text));

export const extractSignals = (input: string): LogisticSignal[] => {
  const text = input.trim();

  if (!text) {
    return [];
  }

  if (isExcludedSegment(text)) {
    return [{
      id: "segmento_excluido",
      label: "Segmento excluído (químico ou alimentício)",
      strength: "negative",
      evidence: "Texto menciona segmento incompatível com armazenagem Phenyx",
      points: -50
    }];
  }

  const sentences = splitIntoSentences(text);
  const signals: LogisticSignal[] = [];

  const registerSignals = (
    criteria: typeof positiveScoreCriteria,
    allowNegation: boolean
  ) => {
    for (const criterion of criteria) {
      if (!criterion.patterns?.length) {
        continue;
      }

      const evidence = findEvidenceInSentences(sentences, criterion.patterns, allowNegation);

      if (!evidence) {
        continue;
      }

      signals.push({
        id: criterion.id,
        label: criterion.label,
        strength: criterion.points >= 20 ? "strong" : criterion.points > 0 ? "medium" : "negative",
        evidence,
        points: criterion.points
      });
    }
  };

  registerSignals(positiveScoreCriteria, false);
  registerSignals(negativeScoreCriteria, true);
  registerSignals(storageScoreCriteria.filter((c) => c.patterns && c.patterns.length > 0), false);
  registerSignals(storageNegativeCriteria, true);

  return signals;
};
