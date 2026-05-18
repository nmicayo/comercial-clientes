import type { AnalyzedLead, LogisticSignal, PotentialLevel, ScoreBreakdown, ScoredLead } from "../contracts/lead-types.ts";
import { storageNegativeCriteria, storageScoreCriteria, storageScoreThresholds, strategicRegions } from "../config/score-rules.ts";

export type CurrentClientEntry = { nome: string; dominio: string; observacao?: string };

const normalizeHostname = (value?: string): string | undefined => {
  if (!value) return undefined;
  try {
    const url = value.startsWith("http") ? value : `https://${value}`;
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return value.toLowerCase().replace(/^www\./i, "");
  }
};

const isCurrentClient = (lead: AnalyzedLead, clients: CurrentClientEntry[]): CurrentClientEntry | undefined => {
  const leadDomain = normalizeHostname(lead.normalizedWebsite ?? lead.website);
  if (!leadDomain) return undefined;
  return clients.find((c) => {
    const clientDomain = normalizeHostname(c.dominio);
    return clientDomain && (leadDomain === clientDomain || leadDomain.endsWith(`.${clientDomain}`));
  });
};

const hasSignal = (signals: LogisticSignal[], id: string): boolean => signals.some((signal) => signal.id === id);

const corePhysicalSignals = [
  "distribuidora_solar",
  "pronta_entrega",
  "estoque_cd",
  "entrega_brasil",
  "kits_solares",
  "modulos_inversores"
];

const exploratorySignals = ["integradora_solar", "obras_multicidade", "ecossistema_solar", "marketplace_puro"];

const buildScoreBreakdown = (lead: AnalyzedLead): ScoreBreakdown[] => {
  const breakdown = lead.signals.map((signal) => ({
    criterion: signal.label,
    points: signal.points,
    matched: true,
    notes: signal.evidence
  }));

  const locationText = `${lead.city ?? ""} ${lead.region ?? ""}`.toLowerCase();
  const inStrategicRegion = strategicRegions.some((region) => locationText.includes(region));

  if (inStrategicRegion) {
    breakdown.push({
      criterion: "Atua em região relevante para a operação",
      points: 15,
      matched: true,
      notes: lead.region ?? lead.city ?? "Região estratégica"
    });
  }

  if (lead.contactEmail) {
    breakdown.push({
      criterion: "Possui e-mail comercial público",
      points: 5,
      matched: true,
      notes: lead.contactEmail
    });
  }

  if (lead.contactPhone) {
    breakdown.push({
      criterion: "Possui telefone comercial público",
      points: 5,
      matched: true,
      notes: lead.contactPhone
    });
  }

  if (!lead.website) {
    breakdown.push({
      criterion: "Não tem canal de site claro",
      points: -10,
      matched: true,
      notes: "Lead sem website informado"
    });
  }

  return breakdown;
};

const decideNextAction = (lead: AnalyzedLead, decision: ScoredLead["suggestedDecision"]): string => {
  if (decision === "qualificado") {
    return "Gerar abordagem comercial inicial e validar melhor canal de contato.";
  }

  if (decision === "pendente") {
    return "Levantar mais evidências de operação física antes de qualificar.";
  }

  return "Manter fora da priorização ativa e registrar como referência secundária.";
};

const decideSuggestedChannel = (lead: AnalyzedLead): string => {
  if (lead.contactEmail) {
    return "e-mail";
  }

  if (lead.contactPhone) {
    return "telefone/WhatsApp";
  }

  return "formulário";
};

const buildDecision = (lead: AnalyzedLead, score: number): { potential: ScoredLead["potential"]; decision: ScoredLead["suggestedDecision"] } => {
  const physicalSignalCount = corePhysicalSignals.filter((signalId) => hasSignal(lead.signals, signalId)).length;
  const hasExploratorySignal = exploratorySignals.some((signalId) => hasSignal(lead.signals, signalId));
  const hasStrongNegative = hasSignal(lead.signals, "nao_produto_fisico") || hasSignal(lead.signals, "assinatura_energia");

  if (score >= 70 && physicalSignalCount >= 2 && !hasStrongNegative) {
    return { potential: "alto", decision: "qualificado" };
  }

  if (hasStrongNegative && physicalSignalCount === 0) {
    return { potential: "baixo", decision: "descartado" };
  }

  if (score >= 40 || hasExploratorySignal) {
    return { potential: score >= 40 ? "medio" : "baixo", decision: "pendente" };
  }

  return { potential: "baixo", decision: "descartado" };
};

const buildScoreReason = (lead: AnalyzedLead, score: number, decision: ScoredLead["suggestedDecision"]): string => {
  if (decision === "qualificado") {
    return `Score ${score}: há evidência forte de operação recorrente com produto físico, o que justifica priorização comercial.`;
  }

  if (decision === "pendente") {
    return `Score ${score}: o lead está no ecossistema certo, mas ainda falta prova suficiente de operação física própria.`;
  }

  if (hasSignal(lead.signals, "assinatura_energia")) {
    return `Score ${score}: o lead atua mais como assinatura de energia do que como operação física recorrente.`;
  }

  return `Score ${score}: a aderência logística é baixa para o foco atual do radar.`;
};

const storageSignalIds = new Set([
  ...storageScoreCriteria.map((c) => c.id),
  ...storageNegativeCriteria.map((c) => c.id)
]);

const buildStorageScore = (lead: AnalyzedLead): { storageScore: number; storagePotential: PotentialLevel } => {
  const storageSignals = lead.signals.filter((s) => storageSignalIds.has(s.id));
  const raw = storageSignals.reduce((total, s) => total + s.points, 0);
  const storageScore = Math.max(0, Math.min(raw, 100));

  const storagePotential: PotentialLevel =
    storageScore >= storageScoreThresholds.high ? "alto"
    : storageScore >= storageScoreThresholds.medium ? "medio"
    : "baixo";

  return { storageScore, storagePotential };
};

export const scoreLead = (lead: AnalyzedLead, currentClients: CurrentClientEntry[] = []): ScoredLead => {
  const matchedClient = isCurrentClient(lead, currentClients);

  if (matchedClient) {
    return {
      ...lead,
      status: "pontuado",
      score: 0,
      potential: "baixo",
      scoreBreakdown: [{ criterion: "Cliente atual", points: 0, matched: true, notes: matchedClient.nome }],
      scoreReason: `Cliente atual da Phenyx (${matchedClient.nome}) — não prospectar.`,
      suggestedDecision: "descartado",
      suggestedChannel: "",
      nextAction: "Nenhuma — já é cliente ativo.",
      storageScore: 0,
      storagePotential: "baixo"
    };
  }

  const scoreBreakdown = buildScoreBreakdown(lead);
  const rawScore = scoreBreakdown.reduce((total, item) => total + item.points, 0);
  const score = Math.max(0, Math.min(rawScore, 100));
  const { potential, decision } = buildDecision(lead, score);
  const { storageScore, storagePotential } = buildStorageScore(lead);

  return {
    ...lead,
    status: "pontuado",
    score,
    potential,
    scoreBreakdown,
    scoreReason: buildScoreReason(lead, score, decision),
    suggestedDecision: decision,
    suggestedChannel: decideSuggestedChannel(lead),
    nextAction: decideNextAction(lead, decision),
    storageScore,
    storagePotential
  };
};
