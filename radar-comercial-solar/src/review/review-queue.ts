import type { ReviewLead, ScoredLead } from "../contracts/lead-types.ts";
import { strategicRegions } from "../config/score-rules.ts";

const buildFlags = (lead: ScoredLead): string[] => {
  const flags = [...lead.siteAnalysis.flags];

  if (!lead.website) {
    flags.push("sem_site");
  }

  if (lead.suggestedDecision === "pendente") {
    flags.push("ambiguidade_operacional");
  }

  if (lead.signals.length <= 1) {
    flags.push("dados_insuficientes");
  }

  return [...new Set(flags)];
};

const normalizeText = (value?: string): string =>
  value
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase() ?? "";

const isStrategicRegionLead = (lead: ScoredLead): boolean => {
  const regionText = `${lead.region ?? ""} ${lead.city ?? ""}`.trim();
  const normalized = normalizeText(regionText);
  return strategicRegions.some((region) => normalized.includes(normalizeText(region)));
};

const strongSignalCount = (lead: ScoredLead): number =>
  lead.signals.filter((signal) => signal.strength === "strong").length;

const nicheLabelMap: Record<string, string> = {
  distribuidora_solar: "Distribuidora solar",
  distribuidora_solar_armazenagem: "Distribuidora solar — potencial de armazenagem",
  integradora_solar: "Integradora solar",
  marketplace_solar: "Marketplace / ecossistema solar",
  energia_assinatura: "Energia por assinatura",
  consultoria_energetica: "Consultoria em eficiência energética"
};

const mirrorClientMap: Record<string, string> = {
  distribuidora_solar: "FOTUS Distribuidora",
  distribuidora_solar_armazenagem: "Gradiente Solar / Mazer / CMT Energia 2",
  integradora_solar: "Gradiente Solar",
  marketplace_solar: "Solfácil",
  energia_assinatura: "Sol Copérnico",
  consultoria_energetica: "Nenhum claramente aderente"
};

const potentialLabelMap = {
  alto: "Alto",
  medio: "Médio",
  baixo: "Baixo"
} as const;

const destinationByDecision = (
  decision: ScoredLead["suggestedDecision"]
): ReviewLead["destinoSugerido"] => {
  if (decision === "qualificado") {
    return "leads-qualificados.md";
  }

  if (decision === "pendente") {
    return "leads-brutos.md";
  }

  return "leads-descartados.md";
};

const statusByDecision = (decision: ScoredLead["suggestedDecision"]): string => {
  if (decision === "qualificado") {
    return "Qualificado";
  }

  if (decision === "pendente") {
    return "Em análise";
  }

  return "Descartado";
};

const buildShortReason = (lead: ScoredLead): string => {
  if (lead.suggestedDecision === "qualificado") {
    return "Operação física recorrente clara, com sinais fortes de distribuição e atendimento comercial.";
  }

  if (lead.suggestedDecision === "pendente") {
    return "Está no nicho certo, mas ainda falta evidência suficiente de operação física própria.";
  }

  return "Baixa aderência logística para o foco atual do radar.";
};

const buildMarkdownBlock = (lead: ScoredLead): string => {
  const cityState = [lead.city, lead.state].filter(Boolean).join("/");
  const segment = lead.niche ? nicheLabelMap[lead.niche] ?? lead.niche : "A validar";
  const mirrorClient = lead.niche ? mirrorClientMap[lead.niche] ?? "A validar" : "A validar";
  const signalSummary = lead.signals.map((signal) => signal.label).join("; ");
  const source = lead.source || "pipeline_v1";

  return [
    `## ${lead.companyName}`,
    "",
    `- Empresa: ${lead.companyName}`,
    `- Site: ${lead.website ?? ""}`,
    `- Cidade/UF: ${cityState}`,
    `- Segmento: ${segment}`,
    `- Fonte: ${source}`,
    `- Descrição encontrada: ${lead.description ?? ""}`,
    `- Sinais logísticos: ${signalSummary}`,
    `- Cliente espelho mais parecido: ${mirrorClient}`,
    `- Potencial: ${potentialLabelMap[lead.potential]}`,
    `- Score estimado: ${lead.score}`,
    `- Motivo da classificação: ${lead.scoreReason}`,
    `- Canal sugerido: ${lead.suggestedChannel}`,
    `- Próxima ação: ${lead.nextAction}`,
    `- Contato e-mail: ${lead.contactEmail ?? ""}`,
    `- Contato telefone: ${lead.contactPhone ?? ""}`,
    `- Status: ${statusByDecision(lead.suggestedDecision)}`,
    `- Score armazenagem: ${lead.storageScore} (${potentialLabelMap[lead.storagePotential]})`
  ].join("\n");
};

const buildPriorityAssessment = (
  lead: ScoredLead,
  flags: string[]
): {
  reviewPriority: ReviewLead["reviewPriority"];
  reviewPriorityScore: number;
  reviewPriorityReasons: string[];
} => {
  const reasons: string[] = [];
  let score = 0;

  if (lead.suggestedDecision === "qualificado") {
    score += 100;
    reasons.push("sugestão de qualificação imediata");
  } else if (lead.suggestedDecision === "pendente") {
    score += 60;
    reasons.push("lead pendente que precisa decisão humana");
  } else {
    score += 10;
    reasons.push("lead com baixa prioridade de revisão");
  }

  if (isStrategicRegionLead(lead)) {
    score += 25;
    reasons.push("atua em região estratégica");
  }

  if (lead.storagePotential === "alto") {
    score += 20;
    reasons.push("alto potencial de armazenagem");
  } else if (lead.storagePotential === "medio") {
    score += 10;
    reasons.push("potencial médio de armazenagem");
  }

  if (lead.score >= 80) {
    score += 20;
    reasons.push("score alto");
  } else if (lead.score >= 50) {
    score += 10;
    reasons.push("score intermediário relevante");
  }

  const strongSignals = strongSignalCount(lead);
  if (strongSignals >= 3) {
    score += 15;
    reasons.push("vários sinais fortes");
  } else if (strongSignals >= 1) {
    score += 5;
    reasons.push("ao menos um sinal forte");
  }

  if (flags.includes("sem_site")) {
    score -= 10;
    reasons.push("sem site para validação");
  }

  if (flags.includes("dados_insuficientes")) {
    score -= 5;
    reasons.push("dados insuficientes");
  }

  const reviewPriority: ReviewLead["reviewPriority"] =
    score >= 100 ? "alta" : score >= 55 ? "media" : "baixa";

  return {
    reviewPriority,
    reviewPriorityScore: score,
    reviewPriorityReasons: reasons
  };
};

export const buildReviewQueue = (scoredLeads: ScoredLead[]): ReviewLead[] => {
  const unsortedQueue: ReviewLead[] = scoredLeads.map((lead) => {
    const flags = buildFlags(lead);
    const priorityAssessment = buildPriorityAssessment(lead, flags);

    return {
      id: lead.id,
      reviewRank: 0,
      reviewPriority: priorityAssessment.reviewPriority,
      reviewPriorityScore: priorityAssessment.reviewPriorityScore,
      reviewPriorityReasons: priorityAssessment.reviewPriorityReasons,
      companyName: lead.companyName,
      website: lead.website,
      city: lead.city,
      state: lead.state,
      niche: lead.niche,
      region: lead.region,
      source: lead.source,
      description: lead.description,
      contactEmail: lead.contactEmail,
      contactPhone: lead.contactPhone,
      score: lead.score,
      potential: lead.potential,
      suggestedDecision: lead.suggestedDecision,
      suggestedChannel: lead.suggestedChannel,
      nextAction: lead.nextAction,
      signals: lead.signals.map((signal) => `${signal.label}: ${signal.evidence}`),
      flags,
      scoreReason: lead.scoreReason,
      destinoSugerido: destinationByDecision(lead.suggestedDecision),
      resumoCurto: buildShortReason(lead),
      blocoMarkdown: buildMarkdownBlock(lead)
    };
  });

  const sortedQueue = unsortedQueue.sort((left, right) => {
    if (right.reviewPriorityScore !== left.reviewPriorityScore) {
      return right.reviewPriorityScore - left.reviewPriorityScore;
    }

    if (right.score !== left.score) {
      return right.score - left.score;
    }

    return left.companyName.localeCompare(right.companyName, "pt-BR");
  });

  return sortedQueue.map((lead, index) => ({
    ...lead,
    reviewRank: index + 1
  }));
};
