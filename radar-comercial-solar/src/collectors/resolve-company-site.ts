import { resolve as resolvePath } from "node:path";

import type { DiscoveredCandidate, ResolvedSiteCandidate } from "../contracts/lead-types.ts";
import { readJsonArtifact, writeJsonArtifact } from "../storage/json-artifact-store.ts";
import { fetchText } from "../utils/fetch-text.ts";
import {
  decodeHtmlEntities,
  extractAnchorHrefs,
  extractCityState,
  extractEmails,
  extractEmailsFromHtml,
  extractPhones,
  stripHtml,
  summarizeText
} from "../utils/html-content.ts";
import { normalizeUrl } from "../utils/normalize-url.ts";

// Contact pages first — highest chance of having email/phone
const COMMON_SITE_PATHS = [
  "/contato", "/contatos", "/fale-conosco", "/contate-nos", "/contact", "/atendimento",
  "/sobre", "/quem-somos", "/a-empresa", "/produtos", "/solucoes", "/integradores"
];
const DIRECTORY_DOMAINS = ["telelistas.net", "guiamais.com.br", "listamais.com.br", "solucoesindustriais.com.br"];
const AGGREGATOR_DOMAINS = [
  "solartask.com.br",
  "portal-energia-solar.com",
  "getninjas.com.br",
  "habitissimo.com.br"
];
const NON_OFFICIAL_HOST_PATTERNS = [
  "duckduckgo.com",
  "google.com",
  "bing.com",
  "linkedin.com",
  "facebook.com",
  "instagram.com",
  "youtube.com"
];
const AGGREGATOR_TITLE_PATTERNS = [/\bas \d+ melhores empresas\b/i, /\bcompare instaladores\b/i, /\bsimule energia solar\b/i];

const getHostname = (value?: string): string | undefined => {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return undefined;
  }
};

const buildRootWebsite = (value: string): string => {
  const url = new URL(value);
  return `${url.protocol}//${url.hostname}`;
};

const isBlockedHostname = (hostname?: string): boolean => {
  if (!hostname) {
    return true;
  }

  return [...DIRECTORY_DOMAINS, ...AGGREGATOR_DOMAINS, ...NON_OFFICIAL_HOST_PATTERNS].some(
    (pattern) => hostname === pattern || hostname.endsWith(`.${pattern}`)
  );
};

const scoreExternalLink = (href: string, anchorText: string): number => {
  const hostname = getHostname(href);

  if (!hostname || isBlockedHostname(hostname)) {
    return -100;
  }

  let score = 0;
  const loweredText = anchorText.toLowerCase();

  if (loweredText.includes("site")) {
    score += 30;
  }

  if (loweredText.includes("oficial")) {
    score += 20;
  }

  if (href.startsWith("https://")) {
    score += 10;
  }

  return score;
};

const GENERIC_TITLE_LOWER_RESOLVE = new Set([
  "home", "início", "inicio", "index", "página inicial", "pagina inicial", "home page",
  "bem-vindo", "bem vindo", "principal",
]);
// "de" omitted intentionally — too common in brand names to reliably filter
const SEO_PREPOSITION_RE_RESOLVE = /\b(?:em|para|na|no|pelo|pela)\s+[A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ]/u;
const SEO_LOCATION_SUFFIX_RE_RESOLVE = /\s+(?:em|para|na|no)\s+.+$/i;

const isUsableCompanyName = (name: string): boolean =>
  name.length >= 2 &&
  name.length <= 50 &&
  !GENERIC_TITLE_LOWER_RESOLVE.has(name.toLowerCase()) &&
  !SEO_PREPOSITION_RE_RESOLVE.test(name);

// Stop at the first repeated SIGNIFICANT word (len > 2) — trims "JN Energia Solar Energia Solar em..." to "JN Energia Solar"
// Short words like "de", "da", "em" are skipped so "Distribuição de Sistemas de Energia" doesn't get cut
const dedupeWords = (text: string): string => {
  const words = text.split(/\s+/);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const word of words) {
    const lower = word.toLowerCase();
    if (lower.length > 2 && seen.has(lower)) break;
    if (lower.length > 2) seen.add(lower);
    result.push(word);
  }
  return result.join(" ");
};

// Strip embedded phone numbers from extracted names ("Logos Solar (81) 9 …" → "Logos Solar")
const EMBEDDED_PHONE_RE = /\s*[\+\(]?\d[\d\s\(\)\-]{5,}[\s\S]*$/;
const stripEmbeddedPhone = (s: string): string => s.replace(EMBEDDED_PHONE_RE, "").trim();

const bestNameFromTitle = (rawTitle: string): string => {
  const title = decodeHtmlEntities(rawTitle);
  const piped = title.split("|").map((s) => s.trim()).filter(Boolean);

  for (let i = piped.length - 1; i >= 0; i--) {
    const seg = piped[i];
    const dashParts = seg.split(/[-–:]/).map((s) => s.trim()).filter(Boolean);
    const firstPart = dedupeWords(stripEmbeddedPhone(dashParts[0] ?? ""));
    const lastPart = dedupeWords(stripEmbeddedPhone(dashParts[dashParts.length - 1] ?? ""));

    // Try the first dash-segment (e.g. "Brand - Tagline" → "Brand")
    if (isUsableCompanyName(firstPart)) return firstPart;

    // Try the last dash-segment (e.g. "SEO Title - Brand" → "Brand")
    if (lastPart !== firstPart && isUsableCompanyName(lastPart)) return lastPart;

    // Try stripping SEO location suffix ("3F Solar em Maringá" → "3F Solar")
    const stripped = dedupeWords(firstPart.replace(SEO_LOCATION_SUFFIX_RE_RESOLVE, "").trim());
    if (stripped && stripped !== firstPart && isUsableCompanyName(stripped)) return stripped;
  }

  // Last resort: any segment across all separators, last-to-first
  const allParts = title.split(/[|\-–:]/).map((s) => s.trim()).filter(Boolean);
  for (let i = allParts.length - 1; i >= 0; i--) {
    if (isUsableCompanyName(allParts[i])) return allParts[i];
  }

  return title.split(/[|\-–:]/)[0]?.trim() ?? title;
};

const deriveCompanyName = (candidate: DiscoveredCandidate, summaryText?: string): string => {
  if (candidate.mockCompanyName) return candidate.mockCompanyName;

  // Decode entities first — numeric entities inflate string length and confuse length checks
  const guess = candidate.companyNameGuess ? decodeHtmlEntities(candidate.companyNameGuess) : undefined;
  if (guess && isUsableCompanyName(guess)) {
    return guess;
  }

  const fromTitle = bestNameFromTitle(candidate.title);

  // Truncated search-result titles end with "…" or "..." — fall back to the live-fetched page text
  if ((fromTitle.endsWith("...") || fromTitle.endsWith("…")) && summaryText) {
    const fromSummary = bestNameFromTitle(summaryText.slice(0, 300));
    if (isUsableCompanyName(fromSummary) && !fromSummary.endsWith("...") && !fromSummary.endsWith("…")) {
      return fromSummary;
    }
  }

  return fromTitle;
};

const fetchPageText = async (
  url: string,
  timeoutMs: number
): Promise<{ ok: boolean; text?: string; finalUrl?: string; flags: string[] }> => {
  const response = await fetchText(url, timeoutMs);

  if (!response.ok || !response.body) {
    return { ok: false, flags: ["pagina_nao_lida"] };
  }

  // Extract emails from raw HTML before stripping:
  // - Cloudflare obfuscated (data-cfemail)
  // - mailto: href attributes
  // - plain text occurrences
  const htmlEmails = extractEmailsFromHtml(response.body).join(" ");

  const text = stripHtml(response.body);
  return {
    ok: true,
    text: htmlEmails ? `${text} ${htmlEmails}` : text,
    finalUrl: response.finalUrl,
    flags: []
  };
};

const primeOfficialSite = async (
  candidate: DiscoveredCandidate,
  officialWebsite: string | undefined,
  timeoutMs: number
): Promise<{
  summaryText?: string;
  city?: string;
  state?: string;
  contactEmail?: string;
  contactPhone?: string;
  pagesRead: string[];
  pageFlags: string[];
}> => {
  if (candidate.mockPrimerText?.trim()) {
    return {
      summaryText: candidate.mockPrimerText,
      city: candidate.mockCity,
      state: candidate.mockState,
      contactEmail: candidate.mockContactEmail,
      contactPhone: candidate.mockContactPhone,
      pagesRead: ["mock:home"],
      pageFlags: ["site_primer_mock"]
    };
  }

  if (!officialWebsite) {
    return {
      pagesRead: [],
      pageFlags: ["site_nao_confirmado"]
    };
  }

  const pagesToTry = [officialWebsite, ...COMMON_SITE_PATHS.map((path) => `${officialWebsite}${path}`)];
  const successfulTexts: string[] = [];
  const pagesRead: string[] = [];
  const pageFlags: string[] = [];

  for (const pageUrl of pagesToTry) {
    const result = await fetchPageText(pageUrl, timeoutMs);

    if (!result.ok || !result.text?.trim()) {
      continue;
    }

    successfulTexts.push(result.text);
    pagesRead.push(result.finalUrl ?? pageUrl);

    const combined = successfulTexts.join(" ");
    const hasEmail = extractEmails(combined).length > 0;
    const hasPhone = extractPhones(combined).length > 0;

    // Stop as soon as we have both contact channels
    if (hasEmail && hasPhone) break;
    // Or after 5 pages regardless
    if (successfulTexts.length >= 5) break;
  }

  if (!successfulTexts.length) {
    return {
      pagesRead,
      pageFlags: ["site_primer_sem_conteudo"]
    };
  }

  const combinedText = successfulTexts.join(" ");
  const cityState = extractCityState(combinedText);

  return {
    summaryText: summarizeText(combinedText, 1400),
    city: candidate.mockCity ?? candidate.city ?? cityState.city,
    state: candidate.mockState ?? candidate.state ?? cityState.state,
    contactEmail: candidate.mockContactEmail ?? extractEmails(combinedText)[0],
    contactPhone: candidate.mockContactPhone ?? extractPhones(combinedText)[0],
    pagesRead,
    pageFlags
  };
};

const resolveOfficialWebsite = async (
  candidate: DiscoveredCandidate,
  timeoutMs: number
): Promise<{
  officialWebsite?: string;
  resolutionConfidence: number;
  flags: string[];
  contactEmail?: string;
  contactPhone?: string;
  city?: string;
  state?: string;
}> => {
  if (candidate.mockResolvedWebsite) {
    return {
      officialWebsite: candidate.mockResolvedWebsite,
      resolutionConfidence: 0.95,
      flags: ["site_resolvido_mock"],
      contactEmail: candidate.mockContactEmail,
      contactPhone: candidate.mockContactPhone,
      city: candidate.mockCity,
      state: candidate.mockState
    };
  }

  if (AGGREGATOR_TITLE_PATTERNS.some((pattern) => pattern.test(candidate.title))) {
    return {
      resolutionConfidence: 0.2,
      flags: ["site_nao_confirmado", "empresa_ambigua", "pagina_agregadora"]
    };
  }

  const candidateHostname = getHostname(candidate.url);

  if (candidateHostname && !isBlockedHostname(candidateHostname)) {
    return {
      officialWebsite: buildRootWebsite(candidate.url),
      resolutionConfidence: candidate.sourceConfidence,
      flags: []
    };
  }

  const candidateHtml = candidate.mockCandidateHtml;
  const pageBody =
    candidateHtml ??
    (await fetchText(candidate.url, timeoutMs)).body;

  if (!pageBody) {
    return {
      resolutionConfidence: 0.2,
      flags: ["site_nao_confirmado"]
    };
  }

  const links = extractAnchorHrefs(pageBody)
    .map((item) => ({
      ...item,
      absoluteHref: item.href.startsWith("http") ? item.href : undefined,
      score: scoreExternalLink(item.href, item.text)
    }))
    .filter((item) => item.absoluteHref && item.score > 0)
    .sort((left, right) => right.score - left.score);

  const best = links[0];
  const pageText = stripHtml(pageBody);
  const cityState = extractCityState(pageText);
  const email = extractEmails(pageText)[0];
  const phone = extractPhones(pageText)[0];

  if (!best?.absoluteHref) {
    return {
      resolutionConfidence: 0.25,
      flags: ["site_nao_confirmado", "empresa_ambigua"],
      contactEmail: email,
      contactPhone: phone,
      city: cityState.city,
      state: cityState.state
    };
  }

  return {
    officialWebsite: buildRootWebsite(best.absoluteHref),
    resolutionConfidence: 0.7,
    flags: [],
    contactEmail: email,
    contactPhone: phone,
    city: cityState.city,
    state: cityState.state
  };
};

export const resolveCompanySites = async (
  projectRoot: string,
  options?: {
    inputFilePath?: string;
    timeoutMs?: number;
  }
) => {
  const inputFilePath = options?.inputFilePath ?? resolvePath(projectRoot, "data", "resultados-descoberta.json");
  const candidates = await readJsonArtifact<DiscoveredCandidate[]>(inputFilePath, []);
  const timeoutMs = options?.timeoutMs ?? 7000;
  const resolved: ResolvedSiteCandidate[] = [];
  let confirmedSites = 0;
  let ambiguousSites = 0;
  let usedMock = 0;

  for (const candidate of candidates) {
    const siteResolution = await resolveOfficialWebsite(candidate, timeoutMs);
    const primer = await primeOfficialSite(candidate, siteResolution.officialWebsite, timeoutMs);
    const flags = [...new Set([...candidate.flags, ...siteResolution.flags, ...primer.pageFlags])];
    const officialWebsite = siteResolution.officialWebsite;

    if (officialWebsite) {
      confirmedSites += 1;
    }

    if (flags.includes("empresa_ambigua") || flags.includes("site_nao_confirmado")) {
      ambiguousSites += 1;
    }

    if (candidate.mockPrimerText || candidate.mockResolvedWebsite) {
      usedMock += 1;
    }

    resolved.push({
      id: candidate.id,
      query: candidate.query,
      niche: candidate.niche,
      region: candidate.region,
      sourceType: candidate.sourceType,
      provider: candidate.provider,
      sourceConfidence: candidate.sourceConfidence,
      resolutionConfidence: siteResolution.resolutionConfidence,
      title: candidate.title,
      candidateUrl: candidate.url,
      officialWebsite,
      companyName: deriveCompanyName(candidate, primer.summaryText),
      snippet: candidate.snippet,
      city: primer.city ?? siteResolution.city,
      state: primer.state ?? siteResolution.state,
      contactEmail: primer.contactEmail ?? siteResolution.contactEmail,
      contactPhone: primer.contactPhone ?? siteResolution.contactPhone,
      summaryText: primer.summaryText,
      pagesRead: primer.pagesRead,
      pageFlags: primer.pageFlags,
      flags
    });
  }

  const outputFilePath = resolvePath(projectRoot, "data", "sites-resolvidos.json");
  const persisted = await writeJsonArtifact(outputFilePath, resolved);

  return {
    resolvedCandidates: resolved,
    confirmedSites,
    ambiguousSites,
    usedMock,
    outputFilePath,
    backupPath: persisted.backupPath,
    inputFilePath
  };
};
