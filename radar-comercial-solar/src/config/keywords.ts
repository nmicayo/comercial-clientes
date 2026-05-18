import { resolve } from "node:path";

import type { GeneratedSearch } from "../contracts/lead-types.ts";
import { readJsonArtifact } from "../storage/json-artifact-store.ts";

export type KeywordGroup = {
  id: string;
  label: string;
  keywords: string[];
};

export type KeywordCatalog = {
  nichos: KeywordGroup[];
};

export type RegionEntry = {
  id: string;
  label: string;
  terms: string[];
  priority: string;
  fase?: number;
  lat?: number;
  lng?: number;
  radiusMeters?: number;
};

export type RegionCatalog = {
  regioes: RegionEntry[];
};

export const loadKeywordCatalog = async (projectRoot: string): Promise<KeywordCatalog> => {
  const filePath = resolve(projectRoot, "data", "keywords.json");
  return readJsonArtifact<KeywordCatalog>(filePath, { nichos: [] });
};

export const loadRegionCatalog = async (projectRoot: string): Promise<RegionCatalog> => {
  const filePath = resolve(projectRoot, "data", "regioes.json");
  return readJsonArtifact<RegionCatalog>(filePath, { regioes: [] });
};

export const buildSearchId = (search: Omit<GeneratedSearch, "id">): string =>
  `${search.niche}:${search.region}:${search.keyword}:${search.locationTerm}`
    .toLowerCase()
    .replace(/[^a-z0-9:]+/g, "-");
