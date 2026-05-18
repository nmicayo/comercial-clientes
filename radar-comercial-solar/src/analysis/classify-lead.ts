import type { PotentialLevel, ReviewDecision } from "../contracts/lead-types.ts";
import { scoreThresholds } from "../config/score-rules.ts";

export const classifyLead = (score: number): { potential: PotentialLevel; decision: ReviewDecision } => {
  if (score >= scoreThresholds.high) {
    return { potential: "alto", decision: "qualificado" };
  }

  if (score >= scoreThresholds.medium) {
    return { potential: "medio", decision: "pendente" };
  }

  return { potential: "baixo", decision: "descartado" };
};
