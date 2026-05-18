import type { BrevoDeliveryAttempt, DuplicateIdentifierType } from "../contracts/lead-types.ts";
import { isValidEmail, normalizeEmail, normalizePhone } from "../utils/normalize-contact.ts";
import type { BrevoClient } from "./brevo-client.ts";
import type { NaoContatarList } from "./nao-contatar.ts";

type SendCandidate = {
  companyName: string;
  emailOriginal?: string;
  telefoneOriginal?: string;
};

type HistoryDuplicateMatch = {
  source: "local" | "brevo";
  identifierType: DuplicateIdentifierType;
  identifierValue: string;
  brevoContactId?: number;
  historyAttempt: BrevoDeliveryAttempt;
};

type EligibilityBase = {
  emailOriginal: string;
  emailNormalizado?: string;
  telefoneOriginal: string;
  telefoneNormalizado?: string;
  message: string;
};

type ReadyEligibilityResult = EligibilityBase & {
  status: "pronto_para_enviar";
  emailNormalizado: string;
};

type BlockedEligibilityResult = EligibilityBase & {
  status: "bloqueado";
  blockReason: "empresa" | "email";
};

type InvalidEmailEligibilityResult = EligibilityBase & {
  status: "email_invalido";
};

type DuplicateEligibilityResult = EligibilityBase & {
  status: "duplicado_local" | "duplicado_brevo_email" | "duplicado_brevo_telefone";
  duplicateSource: "local" | "brevo";
  duplicateIdentifierType: DuplicateIdentifierType;
  duplicateIdentifierValue: string;
  brevoContactId?: number;
  historyAttempt?: BrevoDeliveryAttempt;
};

type BrevoLookupErrorEligibilityResult = EligibilityBase & {
  status: "erro_consulta_brevo";
  errorCode: "erro_consulta_brevo";
  errorMessage: string;
};

export type SendEligibilityResult =
  | ReadyEligibilityResult
  | BlockedEligibilityResult
  | InvalidEmailEligibilityResult
  | DuplicateEligibilityResult
  | BrevoLookupErrorEligibilityResult;

const trackedAttempts = (attempts: BrevoDeliveryAttempt[]): BrevoDeliveryAttempt[] =>
  attempts.filter((attempt) => attempt.statusEnvio === "enviado" || attempt.statusEnvio === "duplicado");

const buildHistoryDuplicateMatch = (
  attempt: BrevoDeliveryAttempt,
  identifierType: DuplicateIdentifierType,
  identifierValue: string
): HistoryDuplicateMatch => {
  if (attempt.statusEnvio === "duplicado" && attempt.duplicateSource === "brevo") {
    return {
      source: "brevo",
      identifierType: attempt.duplicateIdentifierType ?? identifierType,
      identifierValue: attempt.duplicateIdentifierValue ?? identifierValue,
      brevoContactId: attempt.brevoContactId,
      historyAttempt: attempt
    };
  }

  return {
    source: "local",
    identifierType: attempt.duplicateIdentifierType ?? identifierType,
    identifierValue: attempt.duplicateIdentifierValue ?? identifierValue,
    brevoContactId: attempt.brevoContactId,
    historyAttempt: attempt
  };
};

export const findHistoryDuplicateMatch = (
  attempts: BrevoDeliveryAttempt[],
  emailNormalizado?: string,
  telefoneNormalizado?: string
): HistoryDuplicateMatch | undefined => {
  const history = trackedAttempts(attempts);

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const attempt = history[index];

    if (emailNormalizado && attempt.emailNormalizado === emailNormalizado) {
      return buildHistoryDuplicateMatch(attempt, "email", emailNormalizado);
    }

    if (telefoneNormalizado && attempt.telefoneNormalizado === telefoneNormalizado) {
      return buildHistoryDuplicateMatch(attempt, "telefone", telefoneNormalizado);
    }
  }

  return undefined;
};

export const findLatestAttemptForContact = (
  attempts: BrevoDeliveryAttempt[],
  emailNormalizado?: string,
  telefoneNormalizado?: string
): BrevoDeliveryAttempt | undefined => {
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    const attempt = attempts[index];

    if (emailNormalizado && attempt.emailNormalizado === emailNormalizado) {
      return attempt;
    }

    if (telefoneNormalizado && attempt.telefoneNormalizado === telefoneNormalizado) {
      return attempt;
    }
  }

  return undefined;
};

export const evaluateLeadForBrevoSend = async (
  candidate: SendCandidate,
  options: {
    attempts: BrevoDeliveryAttempt[];
    blocklist: NaoContatarList;
    brevoClient?: BrevoClient;
  }
): Promise<SendEligibilityResult> => {
  const emailOriginal = candidate.emailOriginal?.trim() ?? "";
  const telefoneOriginal = candidate.telefoneOriginal?.trim() ?? "";
  const emailNormalizado = normalizeEmail(emailOriginal) ?? undefined;
  const telefoneNormalizado = normalizePhone(telefoneOriginal) ?? undefined;

  if (!emailNormalizado || !isValidEmail(emailNormalizado)) {
    return {
      status: "email_invalido",
      emailOriginal,
      emailNormalizado,
      telefoneOriginal,
      telefoneNormalizado,
      message: "E-mail ausente ou invalido."
    };
  }

  if (options.blocklist.isBlockedCompany(candidate.companyName)) {
    return {
      status: "bloqueado",
      blockReason: "empresa",
      emailOriginal,
      emailNormalizado,
      telefoneOriginal,
      telefoneNormalizado,
      message: "Empresa bloqueada na lista nao-contatar."
    };
  }

  if (options.blocklist.isBlockedEmail(emailNormalizado)) {
    return {
      status: "bloqueado",
      blockReason: "email",
      emailOriginal,
      emailNormalizado,
      telefoneOriginal,
      telefoneNormalizado,
      message: "E-mail bloqueado na lista nao-contatar."
    };
  }

  const historyDuplicate = findHistoryDuplicateMatch(
    options.attempts,
    emailNormalizado,
    telefoneNormalizado
  );

  if (historyDuplicate) {
    if (historyDuplicate.source === "brevo" && historyDuplicate.identifierType === "email") {
      return {
        status: "duplicado_brevo_email",
        duplicateSource: "brevo",
        duplicateIdentifierType: "email",
        duplicateIdentifierValue: historyDuplicate.identifierValue,
        brevoContactId: historyDuplicate.brevoContactId,
        historyAttempt: historyDuplicate.historyAttempt,
        emailOriginal,
        emailNormalizado,
        telefoneOriginal,
        telefoneNormalizado,
        message: "Contato ja existe no Brevo com esse e-mail."
      };
    }

    if (historyDuplicate.source === "brevo" && historyDuplicate.identifierType === "telefone") {
      return {
        status: "duplicado_brevo_telefone",
        duplicateSource: "brevo",
        duplicateIdentifierType: "telefone",
        duplicateIdentifierValue: historyDuplicate.identifierValue,
        brevoContactId: historyDuplicate.brevoContactId,
        historyAttempt: historyDuplicate.historyAttempt,
        emailOriginal,
        emailNormalizado,
        telefoneOriginal,
        telefoneNormalizado,
        message: "Contato ja existe no Brevo com esse telefone."
      };
    }

    return {
      status: "duplicado_local",
      duplicateSource: "local",
      duplicateIdentifierType: historyDuplicate.identifierType,
      duplicateIdentifierValue: historyDuplicate.identifierValue,
      brevoContactId: historyDuplicate.brevoContactId,
      historyAttempt: historyDuplicate.historyAttempt,
      emailOriginal,
      emailNormalizado,
      telefoneOriginal,
      telefoneNormalizado,
      message: `Contato ja foi tratado anteriormente pelo historico local via ${historyDuplicate.identifierType}.`
    };
  }

  if (!options.brevoClient) {
    return {
      status: "pronto_para_enviar",
      emailOriginal,
      emailNormalizado,
      telefoneOriginal,
      telefoneNormalizado,
      message: "Contato elegivel localmente para tentativa de envio."
    };
  }

  try {
    const contactByEmail = await options.brevoClient.findContactByEmail(emailNormalizado);

    if (contactByEmail.found) {
      return {
        status: "duplicado_brevo_email",
        duplicateSource: "brevo",
        duplicateIdentifierType: "email",
        duplicateIdentifierValue: emailNormalizado,
        brevoContactId: contactByEmail.contactId,
        emailOriginal,
        emailNormalizado,
        telefoneOriginal,
        telefoneNormalizado,
        message: "Contato ja existe no Brevo com esse e-mail."
      };
    }

    if (telefoneNormalizado) {
      const contactByPhone = await options.brevoClient.findContactByPhone(telefoneNormalizado);

      if (contactByPhone.found) {
        return {
          status: "duplicado_brevo_telefone",
          duplicateSource: "brevo",
          duplicateIdentifierType: "telefone",
          duplicateIdentifierValue: telefoneNormalizado,
          brevoContactId: contactByPhone.contactId,
          emailOriginal,
          emailNormalizado,
          telefoneOriginal,
          telefoneNormalizado,
          message: "Contato ja existe no Brevo com esse telefone."
        };
      }
    }
  } catch (error) {
    return {
      status: "erro_consulta_brevo",
      errorCode: "erro_consulta_brevo",
      errorMessage: error instanceof Error ? error.message : "Falha ao consultar duplicidade no Brevo.",
      emailOriginal,
      emailNormalizado,
      telefoneOriginal,
      telefoneNormalizado,
      message: "Falha ao consultar duplicidade no Brevo."
    };
  }

  return {
    status: "pronto_para_enviar",
    emailOriginal,
    emailNormalizado,
    telefoneOriginal,
    telefoneNormalizado,
    message: "Contato apto para envio ao Brevo."
  };
};
