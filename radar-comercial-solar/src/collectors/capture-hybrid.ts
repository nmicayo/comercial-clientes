import { basename, resolve as resolvePath } from "node:path";

import type { RawLead, ResolvedSiteCandidate } from "../contracts/lead-types.ts";
import { readJsonArtifact, writeJsonArtifact } from "../storage/json-artifact-store.ts";
import { dedupeLeads } from "../utils/dedupe-leads.ts";
import { normalizeUrl } from "../utils/normalize-url.ts";

const sanitizeId = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9:]+/g, "-");

const toRawLead = (candidate: ResolvedSiteCandidate, fileName: string, index: number): RawLead => ({
  id: sanitizeId(`${fileName}:${index + 1}:${candidate.companyName}`),
  source: "scraping_hibrido",
  sourceType: candidate.sourceType,
  sourceConfidence: candidate.resolutionConfidence,
  companyName: candidate.companyName,
  website: candidate.officialWebsite ?? candidate.candidateUrl,
  normalizedWebsite: normalizeUrl(candidate.officialWebsite ?? candidate.candidateUrl),
  city: candidate.city,
  state: candidate.state,
  region: candidate.region,
  niche: candidate.niche,
  description: candidate.snippet ?? candidate.summaryText,
  query: candidate.query,
  matchedQueries: candidate.query ? [candidate.query] : [],
  contactEmail: candidate.contactEmail,
  contactPhone: candidate.contactPhone,
  mockSiteText: candidate.summaryText,
  flags: [...new Set([...candidate.flags, ...candidate.pageFlags])],
  sourceUrls: [candidate.candidateUrl, candidate.officialWebsite].filter(Boolean) as string[],
  status: "captado"
});

export const captureHybridLeads = async (
  projectRoot: string,
  options?: {
    inputFilePath?: string;
  }
) => {
  const inputFilePath = options?.inputFilePath ?? resolvePath(projectRoot, "data", "sites-resolvidos.json");
  const resolvedCandidates = await readJsonArtifact<ResolvedSiteCandidate[]>(inputFilePath, []);
  const fileName = basename(inputFilePath);
  const rawLeads = resolvedCandidates.map((candidate, index) => toRawLead(candidate, fileName, index));
  const deduped = dedupeLeads(rawLeads);
  const outputFilePath = resolvePath(projectRoot, "data", "resultados-brutos.json");
  const persisted = await writeJsonArtifact(outputFilePath, deduped.leads);
  const withConfirmedWebsite = deduped.leads.filter((lead) => Boolean(lead.website)).length;
  const ambiguous = deduped.leads.filter((lead) => lead.flags?.includes("site_nao_confirmado") || lead.flags?.includes("empresa_ambigua")).length;

  return {
    rawLeads: deduped.leads,
    leadsRead: rawLeads.length,
    leadsCaptured: deduped.leads.length,
    duplicatesRemoved: deduped.duplicatesRemoved,
    withConfirmedWebsite,
    ambiguous,
    outputFilePath,
    backupPath: persisted.backupPath,
    inputFilePath
  };
};
