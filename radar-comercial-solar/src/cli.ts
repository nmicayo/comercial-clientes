import { resolve } from "node:path";

import { captureHybridLeads } from "./collectors/capture-hybrid.ts";
import { discoverCompanies } from "./collectors/discover-companies.ts";
import { generateSearches } from "./collectors/generate-searches.ts";
import { FileSearchProvider } from "./collectors/search-places.ts";
import { resolveCompanySites } from "./collectors/resolve-company-site.ts";
import { readJsonArtifact, writeJsonArtifact } from "./storage/json-artifact-store.ts";
import { dedupeLeads } from "./utils/dedupe-leads.ts";
import { fetchCompanySite } from "./collectors/fetch-company-site.ts";
import { extractSignals } from "./analysis/extract-signals.ts";
import { scoreLead } from "./analysis/score-lead.ts";
import { buildReviewQueue } from "./review/review-queue.ts";
import { registerApprovedReviewItems } from "./review/register-approved.ts";
import { sendApprovedLeads } from "./panel/send-approved.ts";
import { listApprovedLeads } from "./panel/list-approved.ts";
import { printBrevoAuditUsage, runBrevoAudit } from "./brevo-audit/run-brevo-audit.ts";
import { auditBrevo } from "./panel/audit-brevo.ts";
import type { AnalyzedLead, GeneratedSearch, PotentialLevel, RawLead, ScoredLead } from "./contracts/lead-types.ts";

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

const runGenerateSearches = async () => {
  const result = await generateSearches(projectRoot);
  logSummary("Resumo de radar:gerar-buscas", [
    `buscas geradas: ${result.searches.length}`,
    `arquivo de saída: ${result.outputFilePath}`,
    `backup criado: ${result.backupPath ?? "não"}`
  ]);

  return {
    generatedSearches: result.searches.length,
    outputFilePath: result.outputFilePath,
    backupPath: result.backupPath
  };
};

const runCapture = async () => {
  const inputFile = resolve(projectRoot, getArgValue("input") ?? "data/resultados-brutos.json");
  const searches = await readJsonArtifact<GeneratedSearch[]>(resolve(projectRoot, "data", "buscas-geradas.json"), []);
  const provider = new FileSearchProvider();
  const rawLeads = await provider.search({ generatedSearches: searches, inputFilePath: inputFile });
  const deduped = dedupeLeads(rawLeads);
  const outputPath = resolve(projectRoot, "data", "resultados-brutos.json");
  const persisted = await writeJsonArtifact(outputPath, deduped.leads);

  logSummary("Resumo de radar:captar", [
    `leads lidos: ${rawLeads.length}`,
    `leads captados: ${deduped.leads.length}`,
    `duplicados removidos: ${deduped.duplicatesRemoved}`,
    `arquivo de saída: ${outputPath}`,
    `backup criado: ${persisted.backupPath ?? "não"}`
  ]);

  return {
    inputFile,
    leadsRead: rawLeads.length,
    leadsCaptured: deduped.leads.length,
    duplicatesRemoved: deduped.duplicatesRemoved,
    outputFilePath: outputPath,
    backupPath: persisted.backupPath
  };
};

const runDiscover = async (options?: { inputFilePath?: string; useCliInput?: boolean }) => {
  const inputFile = options?.inputFilePath ?? (options?.useCliInput === false ? undefined : getArgValue("input"));
  const result = await discoverCompanies(projectRoot, {
    inputFilePath: inputFile ? resolve(projectRoot, inputFile) : undefined,
    maxSearches: getNumericArg("max-searches", 6),
    perSourceLimit: getNumericArg("per-source-limit", 5),
    timeoutMs: getNumericArg("timeout-ms", 7000)
  });

  const engineCount = result.candidates.filter((candidate) => candidate.sourceType === "engine_publica").length;
  const directoryCount = result.candidates.filter((candidate) => candidate.sourceType === "diretorio").length;
  const fixtureCount = result.candidates.filter((candidate) => candidate.sourceType === "fixture").length;

  logSummary("Resumo de radar:descobrir", [
    `buscas consideradas: ${result.searchesConsidered}`,
    `candidatos descobertos: ${result.discoveredCount}`,
    `duplicados removidos: ${result.duplicatesRemoved}`,
    `descartados por política: ${result.discardedByPolicy}`,
    `buscas bloqueadas por challenge: ${result.blockedByChallenge}`,
    `origem engine pública: ${engineCount}`,
    `origem diretórios: ${directoryCount}`,
    `origem fixture: ${fixtureCount}`,
    `provedores usados: ${result.providerNames.join(", ") || "nenhum"}`,
    `arquivo de saída: ${result.outputFilePath}`,
    `backup criado: ${result.backupPath ?? "não"}`
  ]);

  for (const warning of result.providerWarnings) {
    console.log(`  aviso: ${warning}`);
  }

  return result;
};

const runResolveSites = async (options?: { inputFilePath?: string; useCliInput?: boolean }) => {
  const inputFile = options?.inputFilePath ?? (options?.useCliInput === false ? undefined : getArgValue("input"));
  const result = await resolveCompanySites(projectRoot, {
    inputFilePath: inputFile ? resolve(projectRoot, inputFile) : undefined,
    timeoutMs: getNumericArg("timeout-ms", 7000)
  });

  logSummary("Resumo de radar:resolver-sites", [
    `candidatos processados: ${result.resolvedCandidates.length}`,
    `sites oficiais confirmados: ${result.confirmedSites}`,
    `itens ambíguos: ${result.ambiguousSites}`,
    `itens com mock/fixture: ${result.usedMock}`,
    `arquivo de saída: ${result.outputFilePath}`,
    `backup criado: ${result.backupPath ?? "não"}`
  ]);

  return result;
};

const runCaptureHybrid = async (options?: { inputFilePath?: string; useCliInput?: boolean }) => {
  const inputFile = options?.inputFilePath ?? (options?.useCliInput === false ? undefined : getArgValue("input"));
  const result = await captureHybridLeads(projectRoot, {
    inputFilePath: inputFile ? resolve(projectRoot, inputFile) : undefined
  });

  logSummary("Resumo de radar:captar-hibrido", [
    `leads lidos: ${result.leadsRead}`,
    `leads captados: ${result.leadsCaptured}`,
    `duplicados removidos: ${result.duplicatesRemoved}`,
    `leads com site confirmado: ${result.withConfirmedWebsite}`,
    `leads ambíguos: ${result.ambiguous}`,
    `arquivo de saída: ${result.outputFilePath}`,
    `backup criado: ${result.backupPath ?? "não"}`
  ]);

  return result;
};

const runAnalyzeSites = async () => {
  const rawLeads = await readJsonArtifact<RawLead[]>(resolve(projectRoot, "data", "resultados-brutos.json"), []);
  const analyzedLeads: AnalyzedLead[] = [];
  let successCount = 0;
  let skippedWithoutUrl = 0;

  for (const lead of rawLeads) {
    const siteAnalysis = await fetchCompanySite(lead);
    const signals = extractSignals(`${lead.description ?? ""} ${siteAnalysis.extractedText ?? ""}`);

    if (siteAnalysis.success) {
      successCount += 1;
    }

    if (!lead.website) {
      skippedWithoutUrl += 1;
    }

    analyzedLeads.push({
      ...lead,
      status: "analisado",
      siteAnalysis,
      signals
    });
  }

  const outputPath = resolve(projectRoot, "data", "sites-analisados.json");
  const persisted = await writeJsonArtifact(outputPath, analyzedLeads);

  logSummary("Resumo de radar:analisar-sites", [
    `leads analisados: ${analyzedLeads.length}`,
    `sites analisados com sucesso: ${successCount}`,
    `leads sem site: ${skippedWithoutUrl}`,
    `arquivo de saída: ${outputPath}`,
    `backup criado: ${persisted.backupPath ?? "não"}`
  ]);

  return {
    analyzedLeads: analyzedLeads.length,
    sitesAnalyzedSuccessfully: successCount,
    skippedWithoutUrl,
    outputFilePath: outputPath,
    backupPath: persisted.backupPath
  };
};

const runScore = async () => {
  const analyzedLeads = await readJsonArtifact<AnalyzedLead[]>(resolve(projectRoot, "data", "sites-analisados.json"), []);
  const currentClients = await readJsonArtifact<import("./analysis/score-lead.ts").CurrentClientEntry[]>(resolve(projectRoot, "data", "clientes-atuais.json"), []);
  const scoredLeads: ScoredLead[] = analyzedLeads.map((lead) => scoreLead(lead, currentClients));
  const outputPath = resolve(projectRoot, "data", "leads-pontuados.json");
  const persisted = await writeJsonArtifact(outputPath, scoredLeads);

  const highPotential = scoredLeads.filter((lead) => lead.potential === "alto").length;
  const mediumPotential = scoredLeads.filter((lead) => lead.potential === "medio").length;
  const lowPotential = scoredLeads.filter((lead) => lead.potential === "baixo").length;

  logSummary("Resumo de radar:pontuar", [
    `leads pontuados: ${scoredLeads.length}`,
    `alto potencial: ${highPotential}`,
    `médio potencial: ${mediumPotential}`,
    `baixo potencial: ${lowPotential}`,
    `arquivo de saída: ${outputPath}`,
    `backup criado: ${persisted.backupPath ?? "não"}`
  ]);

  return {
    scoredLeads: scoredLeads.length,
    highPotential,
    mediumPotential,
    lowPotential,
    outputFilePath: outputPath,
    backupPath: persisted.backupPath
  };
};

const runReview = async () => {
  const scoredLeads = await readJsonArtifact<ScoredLead[]>(resolve(projectRoot, "data", "leads-pontuados.json"), []);
  const reviewQueue = buildReviewQueue(scoredLeads);
  const outputPath = resolve(projectRoot, "data", "fila-revisao.json");
  const persisted = await writeJsonArtifact(outputPath, reviewQueue);

  const qualified = reviewQueue.filter((lead) => lead.suggestedDecision === "qualificado").length;
  const pending = reviewQueue.filter((lead) => lead.suggestedDecision === "pendente").length;
  const discarded = reviewQueue.filter((lead) => lead.suggestedDecision === "descartado").length;

  logSummary("Resumo de radar:revisar", [
    `itens enviados para fila de revisão: ${reviewQueue.length}`,
    `sugestão qualificado: ${qualified}`,
    `sugestão pendente: ${pending}`,
    `sugestão descartado: ${discarded}`,
    `arquivo de saída: ${outputPath}`,
    `backup criado: ${persisted.backupPath ?? "não"}`
  ]);

  return {
    reviewItems: reviewQueue.length,
    qualified,
    pending,
    discarded,
    outputFilePath: outputPath,
    backupPath: persisted.backupPath
  };
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

const runPipelineV1 = async () => {
  const captureResult = await runCapture();
  const siteAnalysisResult = await runAnalyzeSites();
  const scoreResult = await runScore();
  const reviewResult = await runReview();

  logSummary("Resumo consolidado de radar:rodar-v1", [
    `arquivo de entrada: ${captureResult.inputFile}`,
    `leads captados: ${captureResult.leadsCaptured}`,
    `duplicados removidos: ${captureResult.duplicatesRemoved}`,
    `sites analisados com sucesso: ${siteAnalysisResult.sitesAnalyzedSuccessfully}`,
    `leads pontuados: ${scoreResult.scoredLeads}`,
    `alto potencial: ${scoreResult.highPotential}`,
    `médio potencial: ${scoreResult.mediumPotential}`,
    `baixo potencial: ${scoreResult.lowPotential}`,
    `fila de revisão: ${reviewResult.reviewItems}`,
    `qualificados sugeridos: ${reviewResult.qualified}`,
    `pendentes sugeridos: ${reviewResult.pending}`,
    `descartados sugeridos: ${reviewResult.discarded}`
  ]);

  return {
    captureResult,
    siteAnalysisResult,
    scoreResult,
    reviewResult
  };
};

const runHybridPipeline = async () => {
  const inputFile = getArgValue("input");
  const discoverResult = await runDiscover({ inputFilePath: inputFile });
  const resolveResult = await runResolveSites({ useCliInput: false });
  const hybridCaptureResult = await runCaptureHybrid({ useCliInput: false });
  const siteAnalysisResult = await runAnalyzeSites();
  const scoreResult = await runScore();
  const reviewResult = await runReview();

  logSummary("Resumo consolidado de radar:rodar-hibrido", [
    `arquivo de descoberta: ${discoverResult.outputFilePath}`,
    `candidatos descobertos: ${discoverResult.discoveredCount}`,
    `sites oficiais confirmados: ${resolveResult.confirmedSites}`,
    `leads captados: ${hybridCaptureResult.leadsCaptured}`,
    `duplicados removidos: ${hybridCaptureResult.duplicatesRemoved}`,
    `sites analisados com sucesso: ${siteAnalysisResult.sitesAnalyzedSuccessfully}`,
    `leads pontuados: ${scoreResult.scoredLeads}`,
    `alto potencial: ${scoreResult.highPotential}`,
    `médio potencial: ${scoreResult.mediumPotential}`,
    `baixo potencial: ${scoreResult.lowPotential}`,
    `fila de revisão: ${reviewResult.reviewItems}`,
    `qualificados sugeridos: ${reviewResult.qualified}`,
    `pendentes sugeridos: ${reviewResult.pending}`,
    `descartados sugeridos: ${reviewResult.discarded}`
  ]);

  return {
    discoverResult,
    resolveResult,
    hybridCaptureResult,
    siteAnalysisResult,
    scoreResult,
    reviewResult
  };
};

const command = process.argv[2];

if (command === "radar:gerar-buscas") {
  await runGenerateSearches();
} else if (command === "radar:descobrir") {
  await runDiscover();
} else if (command === "radar:resolver-sites") {
  await runResolveSites();
} else if (command === "radar:captar-hibrido") {
  await runCaptureHybrid();
} else if (command === "radar:captar") {
  await runCapture();
} else if (command === "radar:analisar-sites") {
  await runAnalyzeSites();
} else if (command === "radar:pontuar") {
  await runScore();
} else if (command === "radar:revisar") {
  await runReview();
} else if (command === "radar:rodar-v1") {
  await runPipelineV1();
} else if (command === "radar:rodar-hibrido") {
  await runHybridPipeline();
} else if (command === "radar:registrar-aprovados") {
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
    "Comando desconhecido. Use: radar:gerar-buscas, radar:descobrir, radar:resolver-sites, radar:captar, radar:captar-hibrido, radar:analisar-sites, radar:pontuar, radar:revisar, radar:rodar-v1, radar:rodar-hibrido, radar:registrar-aprovados, radar:auditar-brevo ou radar:enviar-aprovados."
  );
  process.exitCode = 1;
}
