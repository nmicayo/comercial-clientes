import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import type {
  BrevoDeliveryAttempt,
  PotentialLevel,
  ScoredLead
} from "../contracts/lead-types.ts";
import { readJsonArtifact, writeJsonArtifact } from "../storage/json-artifact-store.ts";
import { BrevoClient, BrevoRequestError } from "./brevo-client.ts";
import { loadNaoContatar } from "./nao-contatar.ts";
import { evaluateLeadForBrevoSend } from "./send-eligibility.ts";

const BREVO_LIST_LABEL = "Prospecção Armazenagem PE";

const POTENTIAL_ORDER: Record<PotentialLevel, number> = { alto: 3, medio: 2, baixo: 1 };

const scoredLeadsPath = (root: string) => resolve(root, "data", "leads-pontuados.json");
const attemptsPath = (root: string) => resolve(root, "data", "brevo-envios.json");

export type SendApprovedResult = {
  total: number;
  pulados: number;
  semEmail: number;
  duplicados: number;
  enviados: number;
  erros: number;
};

export const sendApprovedLeads = async (
  projectRoot: string,
  options: { apiKey: string; listId: number; minPotential?: PotentialLevel }
): Promise<SendApprovedResult> => {
  const { apiKey, listId, minPotential = "medio" } = options;
  const minLevel = POTENTIAL_ORDER[minPotential];

  const leads = await readJsonArtifact<ScoredLead[]>(scoredLeadsPath(projectRoot), []);
  const attempts = await readJsonArtifact<BrevoDeliveryAttempt[]>(attemptsPath(projectRoot), []);
  const blocklist = await loadNaoContatar(projectRoot);
  const brevo = new BrevoClient(apiKey);

  const result: SendApprovedResult = { total: leads.length, pulados: 0, semEmail: 0, duplicados: 0, enviados: 0, erros: 0 };
  const log = [...attempts];

  for (const lead of leads) {
    if ((POTENTIAL_ORDER[lead.potential] ?? 0) < minLevel) {
      result.pulados++;
      continue;
    }

    const emailOriginal = lead.contactEmail ?? "";
    const telefoneOriginal = lead.contactPhone ?? "";
    const eligibility = await evaluateLeadForBrevoSend(
      {
        companyName: lead.companyName,
        emailOriginal,
        telefoneOriginal
      },
      {
        attempts: log,
        blocklist,
        brevoClient: brevo
      }
    );

    const base: Omit<BrevoDeliveryAttempt, "statusEnvio"> = {
      attemptId: randomUUID(),
      leadId: lead.id,
      attemptedAt: new Date().toISOString(),
      companyName: lead.companyName,
      website: lead.website,
      emailOriginal,
      emailNormalizado: eligibility.emailNormalizado ?? emailOriginal,
      telefoneOriginal,
      telefoneNormalizado: eligibility.telefoneNormalizado,
      brevoListId: listId,
      brevoListLabel: BREVO_LIST_LABEL
    };

    if (eligibility.status === "email_invalido") {
      result.semEmail++;
      log.push({ ...base, statusEnvio: "erro", errorCode: "email_invalido", errorMessage: eligibility.message });
      continue;
    }

    if (eligibility.status === "bloqueado") {
      result.pulados++;
      continue;
    }

    if (
      eligibility.status === "duplicado_local" ||
      eligibility.status === "duplicado_brevo_email" ||
      eligibility.status === "duplicado_brevo_telefone"
    ) {
      result.duplicados++;
      log.push({
        ...base,
        statusEnvio: "duplicado",
        duplicateSource: eligibility.duplicateSource,
        duplicateIdentifierType: eligibility.duplicateIdentifierType,
        duplicateIdentifierValue: eligibility.duplicateIdentifierValue,
        brevoContactId: eligibility.brevoContactId
      });
      continue;
    }

    if (eligibility.status === "erro_consulta_brevo") {
      result.erros++;
      log.push({
        ...base,
        statusEnvio: "erro",
        errorCode: eligibility.errorCode,
        errorMessage: eligibility.errorMessage
      });
      continue;
    }

    try {
      const attributes: Record<string, string> = {};
      if (eligibility.telefoneNormalizado) attributes.SMS = eligibility.telefoneNormalizado;
      if (lead.companyName) { attributes.FIRSTNAME = lead.companyName; attributes.COMPANY = lead.companyName; }

      const payload = { email: eligibility.emailNormalizado, attributes: Object.keys(attributes).length ? attributes : undefined, listIds: [listId], updateEnabled: false };
      const created = await brevo.createContact(payload);

      result.enviados++;
      log.push({ ...base, statusEnvio: "enviado", brevoContactId: created.id, payloadEnviado: payload });
    } catch (error) {
      result.erros++;
      const msg = error instanceof Error ? error.message : "Erro desconhecido";
      const code = error instanceof BrevoRequestError ? (error.code ?? "erro_brevo") : "erro_brevo";
      log.push({ ...base, statusEnvio: "erro", errorCode: code, errorMessage: msg });
    }
  }

  await writeJsonArtifact(attemptsPath(projectRoot), log);
  return result;
};
