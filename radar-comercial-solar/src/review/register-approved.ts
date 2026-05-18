import { resolve } from "node:path";

import type { ReviewApproval, ReviewLead } from "../contracts/lead-types.ts";
import { readJsonArtifact } from "../storage/json-artifact-store.ts";
import { readTextArtifact, writeTextArtifact } from "../storage/text-artifact-store.ts";

const buildMarker = (leadId: string): string => `<!-- radar-review-id: ${leadId} -->`;

const destinationPathMap = (projectRoot: string): Record<ReviewLead["destinoSugerido"], string> => ({
  "leads-qualificados.md": resolve(projectRoot, "leads", "leads-qualificados.md"),
  "leads-brutos.md": resolve(projectRoot, "leads", "leads-brutos.md"),
  "leads-descartados.md": resolve(projectRoot, "leads", "leads-descartados.md")
});

const alreadyRegistered = (content: string, lead: ReviewLead): boolean => {
  const marker = buildMarker(lead.id);

  if (content.includes(marker)) {
    return true;
  }

  const companyLine = `- Empresa: ${lead.companyName}`;
  const siteLine = `- Site: ${lead.website ?? ""}`;

  return content.includes(companyLine) && content.includes(siteLine);
};

const appendEntry = (content: string, lead: ReviewLead): string => {
  const marker = buildMarker(lead.id);
  const normalizedContent = content.endsWith("\n") ? content.trimEnd() : content.trimEnd();
  const block = `${marker}\n${lead.blocoMarkdown}\n`;
  return `${normalizedContent}\n\n${block}`;
};

export const registerApprovedReviewItems = async (
  projectRoot: string,
  approvalsFilePath?: string
) => {
  const resolvedApprovalsFilePath = resolve(projectRoot, approvalsFilePath ?? "data/aprovacoes-revisao.json");
  const reviewQueue = await readJsonArtifact<ReviewLead[]>(resolve(projectRoot, "data", "fila-revisao.json"), []);
  const approvals = await readJsonArtifact<ReviewApproval[]>(resolvedApprovalsFilePath, []);
  const destinationPaths = destinationPathMap(projectRoot);

  const approvedItems = approvals.filter((approval) => approval.aprovado);
  const queueById = new Map(reviewQueue.map((lead) => [lead.id, lead]));
  const results = {
    approvalsRead: approvals.length,
    approvedItems: approvedItems.length,
    registeredItems: 0,
    skippedExisting: 0,
    missingInQueue: 0,
    touchedFiles: [] as string[],
    backupPaths: [] as string[]
  };

  const itemsByDestination = new Map<ReviewLead["destinoSugerido"], ReviewLead[]>();

  for (const approval of approvedItems) {
    const lead = queueById.get(approval.leadId);

    if (!lead) {
      results.missingInQueue += 1;
      continue;
    }

    const destination = approval.destinoFinal ?? lead.destinoSugerido;
    const currentItems = itemsByDestination.get(destination) ?? [];
    currentItems.push({
      ...lead,
      destinoSugerido: destination
    });
    itemsByDestination.set(destination, currentItems);
  }

  for (const [destination, leads] of itemsByDestination.entries()) {
    const destinationPath = destinationPaths[destination];
    let content = await readTextArtifact(destinationPath, "");
    let changed = false;

    for (const lead of leads) {
      if (alreadyRegistered(content, lead)) {
        results.skippedExisting += 1;
        continue;
      }

      content = appendEntry(content, lead);
      results.registeredItems += 1;
      changed = true;
    }

    if (!changed) {
      continue;
    }

    const persisted = await writeTextArtifact(destinationPath, `${content.trimEnd()}\n`);
    results.touchedFiles.push(destinationPath);

    if (persisted.backupPath) {
      results.backupPaths.push(persisted.backupPath);
    }
  }

  return {
    ...results,
    approvalsFilePath: resolvedApprovalsFilePath
  };
};
