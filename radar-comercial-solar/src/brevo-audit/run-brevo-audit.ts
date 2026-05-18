import { constants } from "node:fs";
import { access, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { chromium, type BrowserContext, type Page } from "playwright-core";

import { writeJsonArtifact } from "../storage/json-artifact-store.ts";
import { writeTextArtifact } from "../storage/text-artifact-store.ts";
import { BREVO_AUDIT_STEPS, type BrevoAuditStep } from "./expected-audit-flow.ts";

type BrevoAuditStatus = "aligned" | "partial" | "not_confirmed";

type BrevoAuditOptions = {
  dryRun?: boolean;
  headless?: boolean;
  outputDir?: string;
  profileDir?: string;
  browserPath?: string;
};

type StepCapture = {
  documentTitle: string;
  headings: string[];
  tableLines: string[];
  actionLabels: string[];
  bodyTextExcerpt: string;
  matchedExpectedTerms: string[];
};

type BrevoAuditFinding = {
  stepId: string;
  title: string;
  section: string;
  description: string;
  status: BrevoAuditStatus;
  stateFound: string;
  impact: string;
  recommendedAction: string;
  evidence: {
    currentUrl: string;
    documentTitle: string;
    matchedExpectedTerms: string[];
    missingExpectedTerms: string[];
    headings: string[];
    tableLines: string[];
    actionLabels: string[];
    bodyTextExcerpt: string;
    screenshotPath: string;
    navigationMode: "automatic" | "manual";
  };
};

type BrevoAuditResult = {
  startedAt: string;
  finishedAt: string;
  outputDir: string;
  rawJsonPath: string;
  reportPath: string;
  findings: BrevoAuditFinding[];
  summary: {
    total: number;
    aligned: number;
    partial: number;
    notConfirmed: number;
  };
};

const BREVO_APP_URL = "https://app.brevo.com/";

const knownBrowserPaths = [
  process.env.BREVO_AUDIT_BROWSER_EXECUTABLE,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
].filter((value): value is string => Boolean(value));

const formatTimestamp = (date: Date): string =>
  date.toISOString().replace(/[:.]/g, "-");

const truncate = (value: string, maxLength: number): string =>
  value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const resolveBrowserExecutable = async (explicitPath?: string): Promise<string> => {
  const candidates = explicitPath ? [explicitPath, ...knownBrowserPaths] : knownBrowserPaths;

  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    "Nenhum navegador Chromium compativel foi encontrado. Defina BREVO_AUDIT_BROWSER_EXECUTABLE ou use --browser-path."
  );
};

const buildImpact = (status: BrevoAuditStatus): string => {
  if (status === "aligned") {
    return "Nao ha divergencia obvia nesta etapa com base na evidencia capturada.";
  }

  if (status === "partial") {
    return "A etapa parece parcialmente alinhada ou a evidencia capturada nao foi suficiente para confirmar toda a configuracao esperada.";
  }

  return "Nao foi possivel confirmar a configuracao esperada. Esta etapa deve ser tratada como risco operacional ate revisao manual.";
};

const buildRecommendedAction = (status: BrevoAuditStatus, step: BrevoAuditStep): string => {
  if (status === "aligned") {
    return `Manter esta etapa como referencia e revisar apenas detalhes finos se houver duvida em ${step.title.toLowerCase()}.`;
  }

  if (status === "partial") {
    return `Reabrir ${step.title.toLowerCase()} no Brevo e confirmar manualmente os termos ausentes antes de alterar codigo ou operacao.`;
  }

  return `Priorizar a revisao de ${step.title.toLowerCase()} no Brevo e alinhar o estado real com a documentacao do projeto.`;
};

const buildStateFound = (status: BrevoAuditStatus, matchedTerms: string[], missingTerms: string[]): string => {
  if (status === "aligned") {
    return `Configuracao esperada confirmada nesta tela. Termos encontrados: ${matchedTerms.join(", ")}.`;
  }

  if (status === "partial") {
    return `Configuracao parcialmente confirmada. Termos encontrados: ${matchedTerms.join(", ")}. Termos nao confirmados: ${missingTerms.join(", ")}.`;
  }

  return `Configuracao nao confirmada nesta etapa. Nenhum dos termos esperados foi encontrado na evidencia capturada.`;
};

const createPrompt = () => createInterface({ input, output });

const promptEnterToContinue = async (message: string): Promise<void> => {
  const prompt = createPrompt();
  try {
    await prompt.question(`${message}\nPressione Enter para continuar. `);
  } finally {
    prompt.close();
  }
};

const tryClickByLabel = async (page: Page, label: string): Promise<boolean> => {
  const pattern = new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const candidates = [
    page.getByRole("link", { name: pattern }).first(),
    page.getByRole("button", { name: pattern }).first(),
    page.getByText(pattern).first()
  ];

  for (const candidate of candidates) {
    const visible = await candidate.isVisible().catch(() => false);

    if (!visible) {
      continue;
    }

    await candidate.click({ timeout: 2000 }).catch(() => undefined);
    await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => undefined);
    await page.waitForTimeout(1200);
    return true;
  }

  return false;
};

const navigateToStep = async (page: Page, step: BrevoAuditStep): Promise<"automatic" | "manual"> => {
  for (const label of step.sidebarLabels) {
    const clicked = await tryClickByLabel(page, label);

    if (clicked) {
      return "automatic";
    }
  }

  await promptEnterToContinue(
    `Nao consegui abrir automaticamente a etapa '${step.title}'. ${step.manualHint}`
  );
  await page.waitForTimeout(800);
  return "manual";
};

const captureStep = async (page: Page, expectedTerms: string[]): Promise<StepCapture> =>
  page.evaluate(({ expectedTerms: nextExpectedTerms }) => {
    const unique = (values: string[]) => Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
    const textOf = (element: Element) => (element.textContent ?? "").replace(/\s+/g, " ").trim();
    const bodyText = textOf(document.body).slice(0, 5000);
    const loweredBody = bodyText.toLowerCase();
    const matchedExpectedTerms = nextExpectedTerms.filter((term) => loweredBody.includes(term.toLowerCase()));

    return {
      documentTitle: document.title,
      headings: unique(
        Array.from(document.querySelectorAll("h1, h2, h3, [role='heading']"))
          .map((element) => textOf(element))
          .slice(0, 12)
      ),
      tableLines: unique(
        Array.from(document.querySelectorAll("table tr, [role='row']"))
          .map((element) => textOf(element))
          .filter((value) => value.length > 0)
          .slice(0, 12)
      ),
      actionLabels: unique(
        Array.from(document.querySelectorAll("button, a"))
          .map((element) => textOf(element))
          .filter((value) => value.length > 0)
          .slice(0, 20)
      ),
      bodyTextExcerpt: bodyText,
      matchedExpectedTerms
    };
  }, { expectedTerms });

const classifyFinding = (matchedCount: number, expectedCount: number): BrevoAuditStatus => {
  if (expectedCount === 0) {
    return "partial";
  }

  if (matchedCount === expectedCount) {
    return "aligned";
  }

  if (matchedCount > 0) {
    return "partial";
  }

  return "not_confirmed";
};

const buildMarkdownReport = (result: BrevoAuditResult): string => {
  const lines: string[] = [
    "# Relatorio de Auditoria do Brevo",
    "",
    `Data: ${result.startedAt}`,
    `Saida: ${result.outputDir}`,
    "",
    "## Resumo",
    "",
    `- Total de etapas auditadas: ${result.summary.total}`,
    `- Alinhadas: ${result.summary.aligned}`,
    `- Parciais: ${result.summary.partial}`,
    `- Nao confirmadas: ${result.summary.notConfirmed}`,
    ""
  ];

  for (const finding of result.findings) {
    lines.push(`## ${finding.title}`);
    lines.push("");
    lines.push(`- Secao: ${finding.section}`);
    lines.push(`- Estado encontrado: ${finding.stateFound}`);
    lines.push(`- Impacto: ${finding.impact}`);
    lines.push(`- Acao recomendada: ${finding.recommendedAction}`);
    lines.push("- Evidencia:");
    lines.push(`  - URL: ${finding.evidence.currentUrl}`);
    lines.push(`  - Titulo da pagina: ${finding.evidence.documentTitle}`);
    lines.push(`  - Navegacao: ${finding.evidence.navigationMode}`);
    lines.push(`  - Termos encontrados: ${finding.evidence.matchedExpectedTerms.join(", ") || "nenhum"}`);
    lines.push(`  - Termos nao confirmados: ${finding.evidence.missingExpectedTerms.join(", ") || "nenhum"}`);
    lines.push(`  - Headings: ${finding.evidence.headings.join(" | ") || "nenhum"}`);
    lines.push(`  - Linhas de tabela: ${finding.evidence.tableLines.join(" | ") || "nenhuma"}`);
    lines.push(`  - Acoes visiveis: ${finding.evidence.actionLabels.join(" | ") || "nenhuma"}`);
    lines.push(`  - Screenshot: ${finding.evidence.screenshotPath}`);
    lines.push(`  - Trecho capturado: ${truncate(finding.evidence.bodyTextExcerpt, 600) || "vazio"}`);
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
};

const launchAuditContext = async (
  executablePath: string,
  profileDir: string,
  headless: boolean
): Promise<BrowserContext> => {
  await mkdir(profileDir, { recursive: true });
  return chromium.launchPersistentContext(profileDir, {
    executablePath,
    headless,
    viewport: null,
    args: ["--start-maximized"]
  });
};

export const printBrevoAuditUsage = () => {
  console.log(
    [
      "Uso: npm run radar:auditar-brevo -- [opcoes]",
      "",
      "Opcoes:",
      "- --dry-run                 mostra o roteiro da auditoria sem abrir navegador",
      "- --headless                tenta rodar o navegador sem interface grafica",
      "- --output-dir=<caminho>    define a pasta de saida dos artefatos",
      "- --profile-dir=<caminho>   define a pasta de perfil persistente do navegador",
      "- --browser-path=<caminho>  caminho explicito do executavel Edge/Chrome",
      "- --help                    mostra esta ajuda"
    ].join("\n")
  );
};

export const runBrevoAudit = async (
  projectRoot: string,
  options: BrevoAuditOptions = {}
): Promise<BrevoAuditResult | { dryRun: true; steps: BrevoAuditStep[] }> => {
  if (options.dryRun) {
    return {
      dryRun: true,
      steps: BREVO_AUDIT_STEPS
    };
  }

  if (!input.isTTY || !output.isTTY) {
    throw new Error("radar:auditar-brevo precisa ser executado em um terminal interativo.");
  }

  const startedAt = new Date();
  const runId = formatTimestamp(startedAt);
  const outputDir = resolve(projectRoot, options.outputDir ?? "data/brevo-audit", runId);
  const screenshotsDir = resolve(outputDir, "screenshots");
  const profileDir = resolve(projectRoot, options.profileDir ?? "data/brevo-audit/profile");
  const browserExecutable = await resolveBrowserExecutable(options.browserPath);

  await mkdir(screenshotsDir, { recursive: true });

  const context = await launchAuditContext(browserExecutable, profileDir, options.headless ?? false);

  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(BREVO_APP_URL, { waitUntil: "domcontentloaded" });

    await promptEnterToContinue(
      "Conclua o login no Brevo, abra o dashboard principal e garanta que a conta certa esta carregada."
    );

    const findings: BrevoAuditFinding[] = [];

    for (const [index, step] of BREVO_AUDIT_STEPS.entries()) {
      console.log(`\nAuditando ${step.section}: ${step.title}`);
      const navigationMode = await navigateToStep(page, step);
      await promptEnterToContinue(
        `Confira se a tela atual corresponde a '${step.title}'. ${step.manualHint}`
      );
      await page.waitForTimeout(1200);

      const screenshotPath = resolve(screenshotsDir, `${String(index + 1).padStart(2, "0")}-${step.id}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);

      const capture = await captureStep(page, step.expectedTerms);
      const missingExpectedTerms = step.expectedTerms.filter(
        (term) => !capture.matchedExpectedTerms.includes(term)
      );
      const status = classifyFinding(capture.matchedExpectedTerms.length, step.expectedTerms.length);

      findings.push({
        stepId: step.id,
        title: step.title,
        section: step.section,
        description: step.description,
        status,
        stateFound: buildStateFound(status, capture.matchedExpectedTerms, missingExpectedTerms),
        impact: buildImpact(status),
        recommendedAction: buildRecommendedAction(status, step),
        evidence: {
          currentUrl: page.url(),
          documentTitle: capture.documentTitle,
          matchedExpectedTerms: capture.matchedExpectedTerms,
          missingExpectedTerms,
          headings: capture.headings,
          tableLines: capture.tableLines,
          actionLabels: capture.actionLabels,
          bodyTextExcerpt: capture.bodyTextExcerpt,
          screenshotPath,
          navigationMode
        }
      });
    }

    const finishedAt = new Date();
    const rawJsonPath = resolve(outputDir, "raw-report.json");
    const reportPath = resolve(outputDir, "report.md");
    const summary = {
      total: findings.length,
      aligned: findings.filter((finding) => finding.status === "aligned").length,
      partial: findings.filter((finding) => finding.status === "partial").length,
      notConfirmed: findings.filter((finding) => finding.status === "not_confirmed").length
    };

    const result: BrevoAuditResult = {
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      outputDir,
      rawJsonPath,
      reportPath,
      findings,
      summary
    };

    await writeJsonArtifact(rawJsonPath, result);
    await writeTextArtifact(reportPath, buildMarkdownReport(result));

    return result;
  } finally {
    await context.close();
  }
};
