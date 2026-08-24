import { resolve } from "node:path";

import { readJsonArtifact } from "../storage/json-artifact-store.ts";

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

export const loadRegionCatalog = async (projectRoot: string): Promise<RegionCatalog> => {
  const filePath = resolve(projectRoot, "data", "regioes.json");
  return readJsonArtifact<RegionCatalog>(filePath, { regioes: [] });
};
