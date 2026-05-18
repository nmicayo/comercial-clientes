import { basename } from "node:path";

import type { DiscoveryProviderRequest, SearchDiscoveryProvider } from "../contracts/discovery-provider.ts";
import type { DiscoveredCandidate, GeneratedSearch } from "../contracts/lead-types.ts";
import { readJsonArtifact, writeJsonArtifact } from "../storage/json-artifact-store.ts";
import { GooglePlacesDiscoveryProvider } from "./google-places-discovery-provider.ts";
import { fetchText } from "../utils/fetch-text.ts";
import { decodeHtmlEntities, stripHtml } from "../utils/html-content.ts";
import { normalizeUrl } from "../utils/normalize-url.ts";

const DIRECTORY_DOMAINS = ["telelistas.net", "guiamais.com.br", "listamais.com.br", "solucoesindustriais.com.br"];
const AGGREGATOR_DOMAINS = [
  "solartask.com.br",
  "portal-energia-solar.com",
  "getninjas.com.br",
  "habitissimo.com.br"
];
const BLOCKED_MARKETPLACE_DOMAINS = [
  "mercadolivre.com.br",
  "amazon.com.br",
  "shopee.com.br",
  "olx.com.br",
  "magazineluiza.com.br",
  "magalu.com",
  "americanas.com.br",
  "buscape.com.br"
];
const BLOCKED_REDIRECT_DOMAINS = ["duckduckgo.com", "googleadservices.com"];
const BLOCKED_TITLE_PATTERNS = [
  /\bcompre agora\b/i,
  /\bad viewing ads is privacy protected\b/i,
  /\bmelhores ofertas\b/i,
  /\bas \d+ melhores empresas\b/i,
  /\bcompare instaladores\b/i,
  /\bsimule energia solar\b/i
];
const BLOCKED_SNIPPET_PATTERNS = [
  /\bfrete gr[aá]tis\b/i,
  /\bveja condi[cç][oõ]es\b/i,
  /\bempresas cadastradas\b/i,
  /\bcrie seu projeto\b/i,
  /\breceba propostas\b/i
];
const SOLAR_RELEVANCE_PATTERNS = [
  /\bsolar\b/i,
  /\bfotovoltaic/i,
  /\benergia solar\b/i,
  /\bpain[eé]is?\b/i,
  /\bplacas?\b/i,
  /\binversor(?:es)?\b/i,
  /\bkits?\b/i,
  /\bm[oó]dulos?\b/i,
  /\bintegrador(?:es)?\b/i
];
const MAX_SNIPPET_LENGTH = 320;

const sanitizeId = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const buildCandidateId = (prefix: string, search: GeneratedSearch, title: string, url: string): string =>
  sanitizeId([prefix, search.id, title, normalizeUrl(url) ?? url].join("-"));

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

const decodeDuckDuckGoHref = (href: string): string => {
  if (href.startsWith("//duckduckgo.com/l/?")) {
    const params = new URLSearchParams(href.split("?")[1] ?? "");
    return decodeURIComponent(params.get("uddg") ?? href);
  }

  if (href.startsWith("/l/?")) {
    const params = new URLSearchParams(href.split("?")[1] ?? "");
    return decodeURIComponent(params.get("uddg") ?? href);
  }

  return decodeHtmlEntities(href);
};

const decodeBingHref = (href: string): string => {
  const decodedHref = decodeHtmlEntities(href);
  const hostname = getHostname(decodedHref);

  if (hostname !== "bing.com" && hostname !== "www.bing.com") {
    return decodedHref;
  }

  try {
    const url = new URL(decodedHref);
    const encodedTarget = url.searchParams.get("u");

    if (!encodedTarget) {
      return decodedHref;
    }

    if (/^a1/i.test(encodedTarget)) {
      const base64Url = encodedTarget.slice(2).replace(/-/g, "+").replace(/_/g, "/");
      const padding = "=".repeat((4 - (base64Url.length % 4 || 4)) % 4);
      const decodedTarget = Buffer.from(`${base64Url}${padding}`, "base64").toString("utf8");
      return decodedTarget || decodedHref;
    }

    return decodeURIComponent(encodedTarget);
  } catch {
    return decodedHref;
  }
};

const isAdRedirectHref = (href: string): boolean => {
  const normalized = href.toLowerCase();
  return normalized.includes("/y.js?") || normalized.includes("ad_domain=") || normalized.includes("ad_provider=");
};

const truncateSnippet = (value?: string): string | undefined => {
  if (!value?.trim()) {
    return undefined;
  }

  return value.replace(/\s+/g, " ").trim().slice(0, MAX_SNIPPET_LENGTH);
};

const GENERIC_TITLE_LOWER = new Set([
  "home", "início", "inicio", "index", "página inicial", "pagina inicial", "home page",
  "bem-vindo", "bem vindo", "principal",
]);
// "de" omitted intentionally — too common in brand names to reliably filter (e.g. "3F de Energia")
const SEO_PREPOSITION_RE = /\b(?:em|para|na|no|pelo|pela)\s+[A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ]/u;
const SEO_LOCATION_SUFFIX_RE = /\s+(?:em|para|na|no)\s+.+$/i;

const isUsableNameGuess = (name: string): boolean =>
  name.length >= 2 &&
  name.length <= 50 &&
  !GENERIC_TITLE_LOWER.has(name.toLowerCase()) &&
  !SEO_PREPOSITION_RE.test(name);

const guessCompanyName = (rawTitle: string): string | undefined => {
  const title = decodeHtmlEntities(rawTitle);
  const piped = title.split("|").map((s) => s.trim()).filter(Boolean);

  // Brands are usually the last |segment — iterate last-to-first
  for (let i = piped.length - 1; i >= 0; i--) {
    const seg = piped[i];
    const dashParts = seg.split(/[-–:]/).map((s) => s.trim()).filter(Boolean);
    const firstPart = dashParts[0] ?? "";
    const lastPart = dashParts[dashParts.length - 1] ?? "";

    // Try the first dash-segment (e.g. "Brand - Tagline" → "Brand")
    if (isUsableNameGuess(firstPart)) return firstPart;

    // Try the last dash-segment (e.g. "SEO Title - Brand" → "Brand")
    if (lastPart !== firstPart && isUsableNameGuess(lastPart)) return lastPart;

    // Try stripping the SEO location suffix ("3F Solar em Maringá" → "3F Solar")
    const stripped = firstPart.replace(SEO_LOCATION_SUFFIX_RE, "").trim();
    if (stripped && stripped !== firstPart && isUsableNameGuess(stripped)) return stripped;
  }

  // Fallback: any segment across all separators, last-to-first
  const allParts = title.split(/[|\-–:]/).map((s) => s.trim()).filter(Boolean);
  for (let i = allParts.length - 1; i >= 0; i--) {
    if (isUsableNameGuess(allParts[i])) return allParts[i];
  }

  const [head] = title.split(/[|\-–:]/);
  const cleaned = head?.trim();
  return cleaned?.length ? cleaned : undefined;
};

type ParsedDiscoveryBatch = {
  candidates: DiscoveredCandidate[];
  discardedByPolicy: number;
};

type InstrumentedDiscoveryProvider = SearchDiscoveryProvider & {
  discardedByPolicy: number;
  blockedByChallenge: number;
  providerWarnings: string[];
};

const shouldDiscardCandidate = (candidate: {
  rawHref: string;
  resolvedUrl: string;
  title: string;
  snippet?: string;
  search?: GeneratedSearch;
}): boolean => {
  if (isAdRedirectHref(candidate.rawHref)) {
    return true;
  }

  const hostname = getHostname(candidate.resolvedUrl);

  if (!hostname) {
    return true;
  }

  if (BLOCKED_REDIRECT_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
    return true;
  }

  if (AGGREGATOR_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
    return true;
  }

  if (BLOCKED_MARKETPLACE_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
    return true;
  }

  if (BLOCKED_TITLE_PATTERNS.some((pattern) => pattern.test(candidate.title))) {
    return true;
  }

  if (candidate.snippet && BLOCKED_SNIPPET_PATTERNS.some((pattern) => pattern.test(candidate.snippet))) {
    return true;
  }

  if (candidate.search?.niche.includes("solar")) {
    const relevanceText = `${candidate.title} ${candidate.snippet ?? ""} ${candidate.resolvedUrl}`;

    if (!SOLAR_RELEVANCE_PATTERNS.some((pattern) => pattern.test(relevanceText))) {
      return true;
    }
  }

  return false;
};

const isDuckDuckGoChallenge = (status?: number, body?: string): boolean => {
  if (status !== 202 || !body) {
    return false;
  }

  return /bots use DuckDuckGo too|anomaly-modal|challenge-form/i.test(body);
};

const parseBingResults = (
  html: string,
  search: GeneratedSearch,
  sourceType: DiscoveredCandidate["sourceType"],
  provider: string,
  sourceConfidence: number,
  directoryDomain?: string
): ParsedDiscoveryBatch => {
  const results: DiscoveredCandidate[] = [];
  let discardedByPolicy = 0;
  const resultPattern =
    /<li[^>]*class="[^"]*b_algo[^"]*"[^>]*>[\s\S]*?<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>[\s\S]{0,2000}?(?:<p>([\s\S]*?)<\/p>)?/gi;

  for (const match of html.matchAll(resultPattern)) {
    const rawHref = decodeHtmlEntities(match[1] ?? "").trim();
    const resolvedUrl = decodeBingHref(rawHref);
    const title = stripHtml(match[2] ?? "");
    const snippet = truncateSnippet(stripHtml(match[3] ?? ""));

    if (!resolvedUrl || !title) {
      continue;
    }

    if (shouldDiscardCandidate({ rawHref, resolvedUrl, title, snippet, search })) {
      discardedByPolicy += 1;
      continue;
    }

    results.push({
      id: buildCandidateId(provider, search, title, resolvedUrl),
      query: search.query,
      niche: search.niche,
      region: search.region,
      sourceType,
      provider,
      sourceConfidence,
      title,
      url: resolvedUrl,
      snippet,
      companyNameGuess: guessCompanyName(title),
      directoryDomain,
      flags: []
    });
  }

  return {
    candidates: results,
    discardedByPolicy
  };
};

const parseDuckDuckGoResults = (
  html: string,
  search: GeneratedSearch,
  sourceType: DiscoveredCandidate["sourceType"],
  provider: string,
  sourceConfidence: number,
  directoryDomain?: string
): ParsedDiscoveryBatch => {
  const results: DiscoveredCandidate[] = [];
  let discardedByPolicy = 0;
  const resultPattern =
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]{0,1200}?(?:<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>|<div[^>]*class="[^"]*result__snippet[^"]*"[^>]*>)([\s\S]*?)(?:<\/a>|<\/div>)/gi;

  for (const match of html.matchAll(resultPattern)) {
    const rawHref = match[1] ?? "";
    const resolvedUrl = decodeDuckDuckGoHref(rawHref);
    const title = stripHtml(match[2] ?? "");
    const snippet = truncateSnippet(stripHtml(match[3] ?? ""));

    if (!resolvedUrl || !title) {
      continue;
    }

    if (shouldDiscardCandidate({ rawHref, resolvedUrl, title, snippet, search })) {
      discardedByPolicy += 1;
      continue;
    }

    results.push({
      id: buildCandidateId(provider, search, title, resolvedUrl),
      query: search.query,
      niche: search.niche,
      region: search.region,
      sourceType,
      provider,
      sourceConfidence,
      title,
      url: resolvedUrl,
      snippet,
      companyNameGuess: guessCompanyName(title),
      directoryDomain,
      flags: []
    });
  }

  return {
    candidates: results,
    discardedByPolicy
  };
};

const dedupeDiscoveredCandidates = (
  candidates: DiscoveredCandidate[]
): { candidates: DiscoveredCandidate[]; duplicatesRemoved: number } => {
  const unique = new Map<string, DiscoveredCandidate>();
  let duplicatesRemoved = 0;

  for (const candidate of candidates) {
    const key = normalizeUrl(candidate.url) ?? sanitizeId(`${candidate.title}-${candidate.url}`);
    const existing = unique.get(key);

    if (!existing) {
      unique.set(key, candidate);
      continue;
    }

    duplicatesRemoved += 1;
    unique.set(key, {
      ...existing,
      snippet: existing.snippet?.length ? existing.snippet : candidate.snippet,
      sourceConfidence: Math.max(existing.sourceConfidence, candidate.sourceConfidence),
      flags: [...new Set([...existing.flags, ...candidate.flags])]
    });
  }

  return {
    candidates: [...unique.values()],
    duplicatesRemoved
  };
};

export class FixtureDiscoveryProvider implements SearchDiscoveryProvider {
  readonly providerName = "fixture";

  async discover(request: DiscoveryProviderRequest): Promise<DiscoveredCandidate[]> {
    if (!request.inputFilePath) {
      return [];
    }

    return readJsonArtifact<DiscoveredCandidate[]>(request.inputFilePath, []);
  }
}

class DuckDuckGoDiscoveryProvider implements SearchDiscoveryProvider {
  readonly providerName = "duckduckgo";
  discardedByPolicy = 0;
  blockedByChallenge = 0;
  providerWarnings: string[] = [];

  async discover(request: DiscoveryProviderRequest): Promise<DiscoveredCandidate[]> {
    const searches = request.generatedSearches.slice(0, request.maxSearches);
    const allCandidates: DiscoveredCandidate[] = [];
    this.discardedByPolicy = 0;
    this.blockedByChallenge = 0;
    this.providerWarnings = [];

    for (const search of searches) {
      const url = `https://html.duckduckgo.com/html/?${new URLSearchParams({ q: search.query }).toString()}`;
      const response = await fetchText(url, request.timeoutMs);

      if (!response.ok || !response.body) {
        continue;
      }

      if (isDuckDuckGoChallenge(response.status, response.body)) {
        this.blockedByChallenge += 1;
        this.providerWarnings.push(`DuckDuckGo bloqueou a busca "${search.query}" com challenge anti-bot.`);
        continue;
      }

      const parsed = parseDuckDuckGoResults(
        response.body,
        search,
        "engine_publica",
        this.providerName,
        0.85
      );
      this.discardedByPolicy += parsed.discardedByPolicy;
      const candidates = parsed.candidates.slice(0, request.perSourceLimit);

      allCandidates.push(...candidates);
    }

    return allCandidates;
  }
}

class BingDiscoveryProvider implements SearchDiscoveryProvider {
  readonly providerName = "bing";
  discardedByPolicy = 0;
  blockedByChallenge = 0;
  providerWarnings: string[] = [];

  async discover(request: DiscoveryProviderRequest): Promise<DiscoveredCandidate[]> {
    const searches = request.generatedSearches.slice(0, request.maxSearches);
    const allCandidates: DiscoveredCandidate[] = [];
    this.discardedByPolicy = 0;
    this.blockedByChallenge = 0;
    this.providerWarnings = [];

    for (const search of searches) {
      const url = `https://www.bing.com/search?${new URLSearchParams({ q: search.query }).toString()}`;
      const response = await fetchText(url, request.timeoutMs);

      if (!response.ok || !response.body) {
        continue;
      }

      const parsed = parseBingResults(
        response.body,
        search,
        "engine_publica",
        this.providerName,
        0.8
      );
      this.discardedByPolicy += parsed.discardedByPolicy;
      const candidates = parsed.candidates.slice(0, request.perSourceLimit);

      allCandidates.push(...candidates);
    }

    return allCandidates;
  }
}

class DirectoryFallbackProvider implements SearchDiscoveryProvider {
  readonly providerName = "directory-fallback";
  discardedByPolicy = 0;
  blockedByChallenge = 0;
  providerWarnings: string[] = [];

  async discover(request: DiscoveryProviderRequest): Promise<DiscoveredCandidate[]> {
    const searches = request.generatedSearches.slice(0, request.maxSearches);
    const allCandidates: DiscoveredCandidate[] = [];
    this.discardedByPolicy = 0;
    this.blockedByChallenge = 0;
    this.providerWarnings = [];

    for (const search of searches) {
      for (const directoryDomain of DIRECTORY_DOMAINS) {
        const query = `site:${directoryDomain} ${search.query}`;
        const url = `https://www.bing.com/search?${new URLSearchParams({ q: query }).toString()}`;
        const response = await fetchText(url, request.timeoutMs);

        if (!response.ok || !response.body) {
          continue;
        }

        const parsed = parseBingResults(
          response.body,
          search,
          "diretorio",
          `${this.providerName}:${directoryDomain}`,
          0.55,
          directoryDomain
        );
        this.discardedByPolicy += parsed.discardedByPolicy;
        const candidates = parsed.candidates.slice(0, Math.max(1, Math.floor(request.perSourceLimit / 2)));

        allCandidates.push(...candidates);
      }
    }

    return allCandidates;
  }
}

export const discoverCompanies = async (
  projectRoot: string,
  options?: {
    inputFilePath?: string;
    maxSearches?: number;
    perSourceLimit?: number;
    timeoutMs?: number;
  }
) => {
  const generatedSearches = await readJsonArtifact<GeneratedSearch[]>(`${projectRoot}\\data\\buscas-geradas.json`, []);
  const request: DiscoveryProviderRequest = {
    generatedSearches,
    inputFilePath: options?.inputFilePath,
    maxSearches: options?.maxSearches ?? 6,
    perSourceLimit: options?.perSourceLimit ?? 5,
    timeoutMs: options?.timeoutMs ?? 7000
  };

  let candidates: DiscoveredCandidate[] = [];
  const sources = new Set<string>();
  let discardedByPolicy = 0;
  let blockedByChallenge = 0;
  const providerWarnings: string[] = [];

  if (request.inputFilePath) {
    const fixtureProvider = new FixtureDiscoveryProvider();
    candidates = await fixtureProvider.discover(request);
    sources.add(fixtureProvider.providerName);
  } else {
    const hasGooglePlacesKey = Boolean(process.env.GOOGLE_PLACES_API_KEY?.trim());

    const providers: InstrumentedDiscoveryProvider[] = hasGooglePlacesKey
      ? [new GooglePlacesDiscoveryProvider(projectRoot) as unknown as InstrumentedDiscoveryProvider]
      : [
          new BingDiscoveryProvider(),
          new DuckDuckGoDiscoveryProvider(),
          new DirectoryFallbackProvider()
        ];

    for (const provider of providers) {
      const discovered = await provider.discover(request);
      candidates.push(...discovered);
      sources.add(provider.providerName);
      discardedByPolicy += (provider as InstrumentedDiscoveryProvider).discardedByPolicy ?? 0;
      blockedByChallenge += (provider as InstrumentedDiscoveryProvider).blockedByChallenge ?? 0;
      providerWarnings.push(...((provider as InstrumentedDiscoveryProvider).providerWarnings ?? []));
    }
  }

  const deduped = dedupeDiscoveredCandidates(candidates);
  const outputFilePath = `${projectRoot}\\data\\resultados-descoberta.json`;
  const persisted = await writeJsonArtifact(outputFilePath, deduped.candidates);

  return {
    searchesConsidered: request.generatedSearches.slice(0, request.maxSearches).length,
    candidates: deduped.candidates,
    discoveredCount: deduped.candidates.length,
    duplicatesRemoved: deduped.duplicatesRemoved,
    discardedByPolicy,
    blockedByChallenge,
    providerWarnings,
    providerNames: [...sources],
    outputFilePath,
    backupPath: persisted.backupPath,
    inputFilePath: request.inputFilePath
  };
};
