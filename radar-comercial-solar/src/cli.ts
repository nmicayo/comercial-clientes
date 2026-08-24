import { registerApprovedReviewItems } from "./review/register-approved.ts";
import { sendApprovedLeads } from "./panel/send-approved.ts";
import { listApprovedLeads } from "./panel/list-approved.ts";
import { printBrevoAuditUsage, runBrevoAudit } from "./brevo-audit/run-brevo-audit.ts";
import { auditBrevo } from "./panel/audit-brevo.ts";
import type { PotentialLevel } from "./contracts/lead-types.ts";

const projectRoot = process.cwd();

const getArgValue = (name: string): string | undefined => {
  const entry = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return entry?.split("=")[1];
};

const hasFlag = (name: string): boolean => process.argv.includes(`--${name}`);

const logSummary = (title: string, lines: string[]) => {
  console.log(`\n${title}`);
  for (const line of lines) {
    console.log(`- ${line}`);
  }
};

const getNumericArg = (name: string, fallback: number): number => {
  const raw = getArgValue(name);
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const runRegisterApproved = async () => {
  const approvalsFile = getArgValue("approvals") ?? "data/aprovacoes-revisao.json";
  const result = await registerApprovedReviewItems(projectRoot, approvalsFile);

  logSummary("Resumo de radar:registrar-aprovados", [
    `arquivo de aprovações: ${result.approvalsFilePath}`,
    `aprovações lidas: ${result.approvalsRead}`,
    `itens aprovados: ${result.approvedItems}`,
    `itens registrados: ${result.registeredItems}`,
    `itens já existentes: ${result.skippedExisting}`,
    `itens ausentes na fila: ${result.missingInQueue}`,
    `arquivos alterados: ${result.touchedFiles.length}`,
    `backups criados: ${result.backupPaths.length}`
  ]);

  return result;
};

const runBrevoAuditCommand = async () => {
  if (hasFlag("help")) {
    printBrevoAuditUsage();
    return;
  }

  const result = await runBrevoAudit(projectRoot, {
    dryRun: hasFlag("dry-run"),
    headless: hasFlag("headless"),
    outputDir: getArgValue("output-dir"),
    profileDir: getArgValue("profile-dir"),
    browserPath: getArgValue("browser-path")
  });

  if ("dryRun" in result) {
    logSummary("Roteiro de radar:auditar-brevo", result.steps.map((step, index) => `${index + 1}. ${step.section} -> ${step.title}`));
    return;
  }

  logSummary("Resumo de radar:auditar-brevo", [
    `saida: ${result.outputDir}`,
    `relatorio markdown: ${result.reportPath}`,
    `json bruto: ${result.rawJsonPath}`,
    `etapas auditadas: ${result.summary.total}`,
    `alinhadas: ${result.summary.aligned}`,
    `parciais: ${result.summary.partial}`,
    `nao confirmadas: ${result.summary.notConfirmed}`
  ]);
};

const command = process.argv[2];

if (command === "radar:registrar-aprovados") {
  await runRegisterApproved();
} else if (command === "radar:auditar-brevo") {
  await runBrevoAuditCommand();
} else if (command === "radar:aberturas") {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const listIdRaw = process.env.BREVO_LIST_ID_PROSPECCAO_ARMAZENAGEM_PE?.trim();
  const listId = Number.parseInt(listIdRaw ?? "", 10);
  const days = getNumericArg("days", 30);

  if (!apiKey || !Number.isFinite(listId) || listId <= 0) {
    console.error("Erro: BREVO_API_KEY ou BREVO_LIST_ID_PROSPECCAO_ARMAZENAGEM_PE não configuradas.");
    process.exitCode = 1;
  } else {
    await auditBrevo(projectRoot, { apiKey, listId, days });
  }
} else if (command === "radar:listar-aprovados") {
  const minPotential = (getArgValue("min-potential") ?? "medio") as PotentialLevel;
  await listApprovedLeads(projectRoot, { minPotential });
} else if (command === "radar:enviar-aprovados") {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const listIdRaw = process.env.BREVO_LIST_ID_PROSPECCAO_ARMAZENAGEM_PE?.trim();
  const listId = Number.parseInt(listIdRaw ?? "", 10);
  const minPotential = (getArgValue("min-potential") ?? "medio") as PotentialLevel;

  if (!apiKey || !Number.isFinite(listId) || listId <= 0) {
    console.error("Erro: BREVO_API_KEY ou BREVO_LIST_ID_PROSPECCAO_ARMAZENAGEM_PE não configuradas.");
    process.exitCode = 1;
  } else {
    const result = await sendApprovedLeads(projectRoot, { apiKey, listId, minPotential });
    logSummary("Resumo de radar:enviar-aprovados", [
      `total de leads pontuados: ${result.total}`,
      `pulados (abaixo do limiar '${minPotential}'): ${result.pulados}`,
      `sem e-mail válido: ${result.semEmail}`,
      `duplicados: ${result.duplicados}`,
      `enviados ao Brevo: ${result.enviados}`,
      `erros: ${result.erros}`
    ]);
  }
} else {
  console.log(
    "Comando desconhecido. Use: radar:registrar-aprovados, radar:auditar-brevo, radar:aberturas, radar:listar-aprovados ou radar:enviar-aprovados."
  );
  process.exitCode = 1;
}
