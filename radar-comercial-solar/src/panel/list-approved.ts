import { resolve } from "node:path";

import type { BrevoDeliveryAttempt, PotentialLevel, ScoredLead } from "../contracts/lead-types.ts";
import { readJsonArtifact } from "../storage/json-artifact-store.ts";
import { loadNaoContatar } from "./nao-contatar.ts";
import { evaluateLeadForBrevoSend, findLatestAttemptForContact } from "./send-eligibility.ts";

const POTENTIAL_ORDER: Record<PotentialLevel, number> = { alto: 3, medio: 2, baixo: 1 };
const POTENTIAL_LABEL: Record<PotentialLevel, string> = { alto: "ALTO ", medio: "MEDIO", baixo: "BAIXO" };

const truncate = (str: string, len: number): string =>
  str.length > len ? str.slice(0, len - 1) + "…" : str.padEnd(len);

const hasSentAttemptForContact = (
  attempts: BrevoDeliveryAttempt[],
  emailNormalizado?: string,
  telefoneNormalizado?: string
): boolean =>
  attempts.some((attempt) => {
    if (attempt.statusEnvio !== "enviado") {
      return false;
    }

    return (
      (emailNormalizado && attempt.emailNormalizado === emailNormalizado) ||
      (telefoneNormalizado && attempt.telefoneNormalizado === telefoneNormalizado)
    );
  });

export const listApprovedLeads = async (
  projectRoot: string,
  options: { minPotential?: PotentialLevel } = {}
): Promise<void> => {
  const { minPotential = "medio" } = options;
  const minLevel = POTENTIAL_ORDER[minPotential];

  const leads = await readJsonArtifact<ScoredLead[]>(resolve(projectRoot, "data", "leads-pontuados.json"), []);
  const attempts = await readJsonArtifact<BrevoDeliveryAttempt[]>(resolve(projectRoot, "data", "brevo-envios.json"), []);
  const blocklist = await loadNaoContatar(projectRoot);

  const filtered = leads.filter((l) => (POTENTIAL_ORDER[l.potential] ?? 0) >= minLevel);

  let prontos = 0;
  let jaEnviados = 0;
  let semEmail = 0;
  let duplicadosLocais = 0;
  let existentesBrevo = 0;
  let bloqueados = 0;
  let errosConsulta = 0;

  const header = [
    "POT  ",
    "SCORE",
    truncate("EMPRESA", 30),
    truncate("E-MAIL", 35),
    truncate("CIDADE", 20),
    "STATUS"
  ].join(" │ ");

  const sep = "─".repeat(header.length);

  console.log(`\n📋 Leads para envio — limiar: ${minPotential.toUpperCase()}\n`);
  console.log(sep);
  console.log(header);
  console.log(sep);

  for (const lead of filtered) {
    const emailOriginal = lead.contactEmail ?? "";
    const telefoneOriginal = lead.contactPhone ?? "";
    const eligibility = await evaluateLeadForBrevoSend(
      {
        companyName: lead.companyName,
        emailOriginal,
        telefoneOriginal
      },
      {
        attempts,
        blocklist
      }
    );
    const latestAttempt = findLatestAttemptForContact(
      attempts,
      eligibility.emailNormalizado,
      eligibility.telefoneNormalizado
    );
    const wasPreviouslySent = hasSentAttemptForContact(
      attempts,
      eligibility.emailNormalizado,
      eligibility.telefoneNormalizado
    );

    let status: string;
    if (eligibility.status === "bloqueado") {
      status = "bloqueado";
      bloqueados++;
    } else if (eligibility.status === "email_invalido") {
      status = "sem e-mail";
      semEmail++;
    } else if (eligibility.status === "duplicado_local") {
      if (wasPreviouslySent || eligibility.historyAttempt?.statusEnvio === "enviado") {
        status = "já enviado";
        jaEnviados++;
      } else {
        status = "duplicado local";
        duplicadosLocais++;
      }
    } else if (
      eligibility.status === "duplicado_brevo_email" ||
      eligibility.status === "duplicado_brevo_telefone"
    ) {
      status = "já existe no Brevo";
      existentesBrevo++;
    } else if (latestAttempt?.statusEnvio === "erro" && latestAttempt.errorCode === "erro_consulta_brevo") {
      status = "erro de consulta";
      errosConsulta++;
    } else {
      status = "✓ pronto";
      prontos++;
    }

    const row = [
      POTENTIAL_LABEL[lead.potential] ?? "?    ",
      String(lead.score).padStart(5),
      truncate(lead.companyName, 30),
      truncate(emailOriginal || "—", 35),
      truncate([lead.city, lead.state].filter(Boolean).join("/") || "—", 20),
      status
    ].join(" │ ");

    console.log(row);
  }

  console.log(sep);
  console.log(`\nTotal acima do limiar: ${filtered.length}`);
  console.log(`  ✓ prontos para envio: ${prontos}`);
  console.log(`  ✗ já enviados:        ${jaEnviados}`);
  console.log(`  ✗ já no Brevo:        ${existentesBrevo}`);
  console.log(`  ✗ duplicado local:    ${duplicadosLocais}`);
  console.log(`  ✗ bloqueados:         ${bloqueados}`);
  console.log(`  ✗ sem e-mail:         ${semEmail}`);
  console.log(`  ✗ erro de consulta:   ${errosConsulta}`);

  if (prontos > 0) {
    console.log(`\nPara enviar: npm run radar:enviar-aprovados -- --min-potential=${minPotential}`);
  }
  console.log();
};
