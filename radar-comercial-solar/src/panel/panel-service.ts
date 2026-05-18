import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import type {
  BrevoDeliveryAttempt,
  DuplicateIdentifierType,
  OperationalLeadStatus,
  ReviewLead,
  ScoredLead
} from "../contracts/lead-types.ts";
import { readJsonArtifact, writeJsonArtifact } from "../storage/json-artifact-store.ts";
import type { RegionCatalog } from "../config/keywords.ts";
import { BrevoClient, BrevoRequestError } from "./brevo-client.ts";
import { loadNaoContatar } from "./nao-contatar.ts";
import { evaluateLeadForBrevoSend } from "./send-eligibility.ts";

const BREVO_LIST_LABEL = "Prospecção Armazenagem PE";
const DEFAULT_PANEL_PORT = 4173;

export type PanelConfig = {
  ready: boolean;
  errors: string[];
  listLabel: string;
  port: number;
};

export type PanelLead = {
  id: string;
  companyName: string;
  website?: string;
  city?: string;
  state?: string;
  displayLocation: string;
  description?: string;
  score: number;
  potential: string;
  reviewRank: number;
  reviewPriority: string;
  reviewPriorityScore: number;
  suggestedDecision: string;
  suggestedChannel: string;
  nextAction: string;
  signals: string[];
  flags: string[];
  scoreReason: string;
  resumoCurto: string;
  source?: string;
  contactEmail?: string;
  contactPhone?: string;
  editableCompanyName: string;
  editableEmail: string;
  editablePhone: string;
  statusOperacional: OperationalLeadStatus;
  lastAttempt?: BrevoDeliveryAttempt;
};

export type PanelData = {
  config: PanelConfig;
  leads: PanelLead[];
};

export type SendLeadResult = {
  ok: boolean;
  status: OperationalLeadStatus;
  message: string;
  lead: PanelLead;
};

export class PanelActionError extends Error {
  readonly statusCode: number;

  constructor(
    message: string,
    statusCode = 400
  ) {
    super(message);
    this.name = "PanelActionError";
    this.statusCode = statusCode;
  }
}

type ContactFallback = {
  contactEmail?: string;
  contactPhone?: string;
};

type DuplicateMatch = {
  source: "local" | "brevo";
  identifierType: DuplicateIdentifierType;
  identifierValue: string;
  brevoContactId?: number;
};

const reviewQueuePath = (projectRoot: string): string => resolve(projectRoot, "data", "fila-revisao.json");
const scoredLeadsPath = (projectRoot: string): string => resolve(projectRoot, "data", "leads-pontuados.json");
const brevoAttemptsPath = (projectRoot: string): string => resolve(projectRoot, "data", "brevo-envios.json");
const regioesCatalogPath = (projectRoot: string): string => resolve(projectRoot, "data", "regioes.json");

const loadFase1RegionLabels = async (projectRoot: string): Promise<Set<string>> => {
  const catalog = await readJsonArtifact<RegionCatalog>(regioesCatalogPath(projectRoot), { regioes: [] });
  const fase1 = catalog.regioes.filter((r) => r.fase === 1);
  return new Set(fase1.map((r) => r.label));
};

const isLeadInFase1Region = (lead: ReviewLead, fase1Labels: Set<string>): boolean => {
  if (fase1Labels.size === 0) return true;
  return fase1Labels.has(lead.region ?? "");
};

const parsePort = (value?: string): number => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PANEL_PORT;
};

const getPanelConfig = (): PanelConfig & { apiKey?: string; listId?: number } => {
  const errors: string[] = [];
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const listIdRaw = process.env.BREVO_LIST_ID_PROSPECCAO_ARMAZENAGEM_PE?.trim();
  const parsedListId = Number.parseInt(listIdRaw ?? "", 10);

  if (!apiKey) {
    errors.push("BREVO_API_KEY não configurada.");
  }

  if (!Number.isFinite(parsedListId) || parsedListId <= 0) {
    errors.push("BREVO_LIST_ID_PROSPECCAO_ARMAZENAGEM_PE inválida.");
  }

  return {
    ready: errors.length === 0,
    errors,
    listLabel: BREVO_LIST_LABEL,
    port: parsePort(process.env.PANEL_PORT),
    apiKey,
    listId: Number.isFinite(parsedListId) ? parsedListId : undefined
  };
};

const readBrevoAttempts = async (projectRoot: string): Promise<BrevoDeliveryAttempt[]> =>
  readJsonArtifact<BrevoDeliveryAttempt[]>(brevoAttemptsPath(projectRoot), []);

const appendBrevoAttempt = async (
  projectRoot: string,
  attempt: BrevoDeliveryAttempt
): Promise<void> => {
  const current = await readBrevoAttempts(projectRoot);
  current.push(attempt);
  await writeJsonArtifact(brevoAttemptsPath(projectRoot), current);
};

const buildContactFallbackMap = async (projectRoot: string): Promise<Map<string, ContactFallback>> => {
  const scoredLeads = await readJsonArtifact<ScoredLead[]>(scoredLeadsPath(projectRoot), []);
  return new Map(
    scoredLeads.map((lead) => [
      lead.id,
      {
        contactEmail: lead.contactEmail,
        contactPhone: lead.contactPhone
      }
    ])
  );
};

const buildLatestAttemptMap = (attempts: BrevoDeliveryAttempt[]): Map<string, BrevoDeliveryAttempt> => {
  const latestByLeadId = new Map<string, BrevoDeliveryAttempt>();

  for (const attempt of attempts) {
    const current = latestByLeadId.get(attempt.leadId);

    if (!current || attempt.attemptedAt >= current.attemptedAt) {
      latestByLeadId.set(attempt.leadId, attempt);
    }
  }

  return latestByLeadId;
};

const deriveOperationalStatus = (attempt?: BrevoDeliveryAttempt): OperationalLeadStatus => {
  if (!attempt) {
    return "pendente";
  }

  return attempt.statusEnvio;
};

const toPanelLead = (
  lead: ReviewLead,
  fallback: ContactFallback | undefined,
  lastAttempt: BrevoDeliveryAttempt | undefined
): PanelLead => ({
  id: lead.id,
  companyName: lead.companyName,
  website: lead.website,
  city: lead.city,
  state: lead.state,
  displayLocation: [lead.city, lead.state].filter(Boolean).join("/") || "A validar",
  description: lead.description,
  score: lead.score,
  potential: lead.potential,
  reviewRank: lead.reviewRank,
  reviewPriority: lead.reviewPriority,
  reviewPriorityScore: lead.reviewPriorityScore,
  suggestedDecision: lead.suggestedDecision,
  suggestedChannel: lead.suggestedChannel,
  nextAction: lead.nextAction,
  signals: lead.signals,
  flags: lead.flags,
  scoreReason: lead.scoreReason,
  resumoCurto: lead.resumoCurto,
  source: lead.source,
  contactEmail: lead.contactEmail ?? fallback?.contactEmail,
  contactPhone: lead.contactPhone ?? fallback?.contactPhone,
  editableCompanyName: lead.companyName,
  editableEmail: lastAttempt?.emailOriginal ?? lead.contactEmail ?? fallback?.contactEmail ?? "",
  editablePhone: lastAttempt?.telefoneOriginal ?? lead.contactPhone ?? fallback?.contactPhone ?? "",
  statusOperacional: deriveOperationalStatus(lastAttempt),
  lastAttempt
});

const buildDuplicateAttempt = (
  lead: PanelLead,
  emailOriginal: string,
  emailNormalizado: string,
  telefoneOriginal: string,
  telefoneNormalizado: string | undefined,
  duplicateMatch: DuplicateMatch
): BrevoDeliveryAttempt => ({
  attemptId: randomUUID(),
  leadId: lead.id,
  attemptedAt: new Date().toISOString(),
  companyName: lead.companyName,
  website: lead.website,
  emailOriginal,
  emailNormalizado,
  telefoneOriginal,
  telefoneNormalizado,
  statusEnvio: "duplicado",
  duplicateSource: duplicateMatch.source,
  duplicateIdentifierType: duplicateMatch.identifierType,
  duplicateIdentifierValue: duplicateMatch.identifierValue,
  brevoContactId: duplicateMatch.brevoContactId,
  brevoListId: getPanelConfig().listId,
  brevoListLabel: BREVO_LIST_LABEL
});

const buildErrorAttempt = (
  lead: PanelLead,
  emailOriginal: string,
  emailNormalizado: string,
  telefoneOriginal: string,
  telefoneNormalizado: string | undefined,
  errorCode: string,
  errorMessage: string,
  payloadEnviado?: unknown
): BrevoDeliveryAttempt => ({
  attemptId: randomUUID(),
  leadId: lead.id,
  attemptedAt: new Date().toISOString(),
  companyName: lead.companyName,
  website: lead.website,
  emailOriginal,
  emailNormalizado,
  telefoneOriginal,
  telefoneNormalizado,
  statusEnvio: "erro",
  brevoListId: getPanelConfig().listId,
  brevoListLabel: BREVO_LIST_LABEL,
  payloadEnviado,
  errorCode,
  errorMessage
});

const buildSuccessAttempt = (
  lead: PanelLead,
  emailOriginal: string,
  emailNormalizado: string,
  telefoneOriginal: string,
  telefoneNormalizado: string | undefined,
  brevoContactId: number | undefined,
  payloadEnviado: unknown,
  brevoListId: number
): BrevoDeliveryAttempt => ({
  attemptId: randomUUID(),
  leadId: lead.id,
  attemptedAt: new Date().toISOString(),
  companyName: lead.companyName,
  website: lead.website,
  emailOriginal,
  emailNormalizado,
  telefoneOriginal,
  telefoneNormalizado,
  statusEnvio: "enviado",
  brevoContactId,
  brevoListId,
  brevoListLabel: BREVO_LIST_LABEL,
  payloadEnviado
});

const buildActionResponse = async (
  projectRoot: string,
  leadId: string,
  status: OperationalLeadStatus,
  message: string
): Promise<SendLeadResult> => {
  const panelData = await loadPanelData(projectRoot);
  const lead = panelData.leads.find((current) => current.id === leadId);

  if (!lead) {
    throw new PanelActionError("Lead não encontrado após atualizar o histórico.", 404);
  }

  return {
    ok: status === "enviado",
    status,
    message,
    lead
  };
};

const extractBrevoErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof BrevoRequestError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
};

const syncPendingLeadsWithBrevo = async (
  projectRoot: string,
  panelLeads: PanelLead[],
  existingAttempts: BrevoDeliveryAttempt[],
  brevoClient: BrevoClient
): Promise<BrevoDeliveryAttempt[]> => {
  const blocklist = await loadNaoContatar(projectRoot);
  const pending = panelLeads.filter((l) => l.statusOperacional === "pendente" && l.editableEmail);
  const newAttempts: BrevoDeliveryAttempt[] = [];

  for (const lead of pending) {
    const alreadyRecorded = existingAttempts.some(
      (a) => a.leadId === lead.id && (a.statusEnvio === "enviado" || a.statusEnvio === "duplicado")
    );
    if (alreadyRecorded) continue;

    const eligibility = await evaluateLeadForBrevoSend(
      {
        companyName: lead.companyName,
        emailOriginal: lead.editableEmail,
        telefoneOriginal: lead.editablePhone
      },
      {
        attempts: existingAttempts,
        blocklist,
        brevoClient
      }
    );

    if (
      eligibility.status === "duplicado_brevo_email" ||
      eligibility.status === "duplicado_brevo_telefone"
    ) {
      newAttempts.push({
        attemptId: randomUUID(),
        leadId: lead.id,
        attemptedAt: new Date().toISOString(),
        companyName: lead.companyName,
        website: lead.website,
        emailOriginal: eligibility.emailOriginal,
        emailNormalizado: eligibility.emailNormalizado ?? eligibility.emailOriginal,
        telefoneOriginal: eligibility.telefoneOriginal,
        telefoneNormalizado: eligibility.telefoneNormalizado,
        statusEnvio: "duplicado",
        duplicateSource: eligibility.duplicateSource,
        duplicateIdentifierType: eligibility.duplicateIdentifierType,
        duplicateIdentifierValue: eligibility.duplicateIdentifierValue,
        brevoContactId: eligibility.brevoContactId
      });
    }
  }

  return newAttempts;
};

export const loadPanelData = async (projectRoot: string): Promise<PanelData> => {
  const [reviewQueue, attempts, contactFallbackMap, fase1Labels] = await Promise.all([
    readJsonArtifact<ReviewLead[]>(reviewQueuePath(projectRoot), []),
    readBrevoAttempts(projectRoot),
    buildContactFallbackMap(projectRoot),
    loadFase1RegionLabels(projectRoot)
  ]);

  const latestAttempts = buildLatestAttemptMap(attempts);
  const filteredQueue = reviewQueue
    .slice()
    .filter((lead) => isLeadInFase1Region(lead, fase1Labels))
    .sort((left, right) => left.reviewRank - right.reviewRank);

  const leads = filteredQueue.map((lead) =>
    toPanelLead(lead, contactFallbackMap.get(lead.id), latestAttempts.get(lead.id))
  );

  const config = getPanelConfig();

  if (config.ready && config.apiKey) {
    const brevoClient = new BrevoClient(config.apiKey);
    const newDuplicates = await syncPendingLeadsWithBrevo(projectRoot, leads, attempts, brevoClient);

    if (newDuplicates.length > 0) {
      const updated = [...attempts, ...newDuplicates];
      await writeJsonArtifact(brevoAttemptsPath(projectRoot), updated);
      const refreshedLatest = buildLatestAttemptMap(updated);
      return {
        config: { ready: config.ready, errors: config.errors, listLabel: config.listLabel, port: config.port },
        leads: filteredQueue.map((lead) =>
          toPanelLead(lead, contactFallbackMap.get(lead.id), refreshedLatest.get(lead.id))
        )
      };
    }
  }

  return {
    config: {
      ready: config.ready,
      errors: config.errors,
      listLabel: config.listLabel,
      port: config.port
    },
    leads
  };
};

export const sendLeadToBrevo = async (
  projectRoot: string,
  leadId: string,
  input: { email?: string; phone?: string; companyName?: string }
): Promise<SendLeadResult> => {
  const panelData = await loadPanelData(projectRoot);
  const lead = panelData.leads.find((current) => current.id === leadId);

  if (!lead) {
    throw new PanelActionError("Lead não encontrado.", 404);
  }

  const emailOriginal = input.email ?? lead.editableEmail;
  const telefoneOriginal = input.phone ?? lead.editablePhone;

  const config = getPanelConfig();

  if (!config.ready || !config.apiKey || !config.listId) {
    throw new PanelActionError(config.errors.join(" ") || "Configuração Brevo inválida.", 500);
  }

  const attempts = await readBrevoAttempts(projectRoot);
  const blocklist = await loadNaoContatar(projectRoot);
  const brevoClient = new BrevoClient(config.apiKey);
  const eligibility = await evaluateLeadForBrevoSend(
    {
      companyName: input.companyName?.trim() || lead.companyName,
      emailOriginal,
      telefoneOriginal
    },
    {
      attempts,
      blocklist,
      brevoClient
    }
  );

  if (eligibility.status === "email_invalido") {
    throw new PanelActionError("Preencha um e-mail válido antes de enviar.", 400);
  }

  if (eligibility.status === "bloqueado") {
    throw new PanelActionError(eligibility.message, 400);
  }

  if (
    eligibility.status === "duplicado_local" ||
    eligibility.status === "duplicado_brevo_email" ||
    eligibility.status === "duplicado_brevo_telefone"
  ) {
    await appendBrevoAttempt(
      projectRoot,
      buildDuplicateAttempt(
        lead,
        eligibility.emailOriginal,
        eligibility.emailNormalizado ?? eligibility.emailOriginal,
        eligibility.telefoneOriginal,
        eligibility.telefoneNormalizado,
        {
          source: eligibility.duplicateSource,
          identifierType: eligibility.duplicateIdentifierType,
          identifierValue: eligibility.duplicateIdentifierValue,
          brevoContactId: eligibility.brevoContactId
        }
      )
    );

    return buildActionResponse(
      projectRoot,
      leadId,
      "duplicado",
      eligibility.message
    );
  }

  if (eligibility.status === "erro_consulta_brevo") {
    await appendBrevoAttempt(
      projectRoot,
      buildErrorAttempt(
        lead,
        eligibility.emailOriginal,
        eligibility.emailNormalizado ?? eligibility.emailOriginal,
        eligibility.telefoneOriginal,
        eligibility.telefoneNormalizado,
        eligibility.errorCode,
        eligibility.errorMessage
      )
    );

    return buildActionResponse(
      projectRoot,
      leadId,
      "erro",
      "Falha ao consultar o Brevo antes do envio."
    );
  }

  const resolvedCompanyName = input.companyName?.trim() || lead.companyName;
  const attributes: Record<string, string> = {};

  if (eligibility.telefoneNormalizado) {
    attributes.SMS = eligibility.telefoneNormalizado;
  }

  if (resolvedCompanyName) {
    attributes.FIRSTNAME = resolvedCompanyName;
    attributes.COMPANY = resolvedCompanyName;
  }

  const payload = {
    email: eligibility.emailNormalizado,
    attributes: Object.keys(attributes).length ? attributes : undefined,
    listIds: [config.listId],
    updateEnabled: false
  };

  try {
    const createdContact = await brevoClient.createContact(payload);

    await appendBrevoAttempt(
      projectRoot,
      buildSuccessAttempt(
        lead,
        eligibility.emailOriginal,
        eligibility.emailNormalizado,
        eligibility.telefoneOriginal,
        eligibility.telefoneNormalizado,
        createdContact.id,
        payload,
        config.listId
      )
    );

    return buildActionResponse(projectRoot, leadId, "enviado", "Contato enviado para a lista de prospecção.");
  } catch (error) {
    await appendBrevoAttempt(
      projectRoot,
      buildErrorAttempt(
        lead,
        eligibility.emailOriginal,
        eligibility.emailNormalizado,
        eligibility.telefoneOriginal,
        eligibility.telefoneNormalizado,
        "erro_envio_brevo",
        extractBrevoErrorMessage(error, "Falha ao enviar contato para o Brevo."),
        payload
      )
    );

    return buildActionResponse(projectRoot, leadId, "erro", "Falha ao enviar o contato para o Brevo.");
  }
};
