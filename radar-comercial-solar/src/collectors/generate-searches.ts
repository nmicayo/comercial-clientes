import { resolve } from "node:path";

import type { GeneratedSearch } from "../contracts/lead-types.ts";
import { buildSearchId, loadKeywordCatalog, loadRegionCatalog } from "../config/keywords.ts";
import { writeJsonArtifact } from "../storage/json-artifact-store.ts";

const interleaveRoundRobin = (groups: GeneratedSearch[][]): GeneratedSearch[] => {
  const result: GeneratedSearch[] = [];
  const maxLen = Math.max(...groups.map((g) => g.length), 0);
  for (let i = 0; i < maxLen; i++) {
    for (const group of groups) {
      if (i < group.length) result.push(group[i]);
    }
  }
  return result;
};

export const generateSearches = async (projectRoot: string) => {
  const keywordCatalog = await loadKeywordCatalog(projectRoot);
  const regionCatalog = await loadRegionCatalog(projectRoot);

  // Fase 1 regions come first within each niche
  const sortedRegions = [...regionCatalog.regioes].sort((a, b) => {
    const aFase = (a as typeof a & { fase?: number }).fase ?? 99;
    const bFase = (b as typeof b & { fase?: number }).fase ?? 99;
    return aFase - bFase;
  });

  // Build searches grouped by niche
  const byNiche = new Map<string, GeneratedSearch[]>();

  for (const niche of keywordCatalog.nichos) {
    const nicheSearches: GeneratedSearch[] = [];
    for (const keyword of niche.keywords) {
      for (const region of sortedRegions) {
        for (const locationTerm of region.terms) {
          const search = {
            query: `${keyword} ${locationTerm}`,
            niche: niche.id,
            region: region.label,
            keyword,
            locationTerm
          };
          const id = buildSearchId(search);
          nicheSearches.push({ id, ...search });
        }
      }
    }
    byNiche.set(niche.id, nicheSearches);
  }

  // National keywords as own group
  const nationalKeywords: string[] = (keywordCatalog as { keywordsNacionais?: string[] }).keywordsNacionais ?? [];
  const nationalSearches: GeneratedSearch[] = nationalKeywords.map((keyword) => {
    const search = { query: keyword, niche: "nacional", region: "Brasil", keyword };
    return { id: buildSearchId(search), ...search };
  });
  if (nationalSearches.length > 0) byNiche.set("nacional", nationalSearches);

  // Interleave: each round picks one search per niche
  // Dedup by id to avoid exact-same queries
  const seen = new Set<string>();
  const interleaved = interleaveRoundRobin([...byNiche.values()]).filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });

  const filePath = resolve(projectRoot, "data", "buscas-geradas.json");
  const persisted = await writeJsonArtifact(filePath, interleaved);

  return {
    searches: interleaved,
    outputFilePath: filePath,
    backupPath: persisted.backupPath
  };
};
