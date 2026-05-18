import type { DiscoveredCandidate, GeneratedSearch } from "./lead-types.ts";

export type DiscoveryProviderRequest = {
  generatedSearches: GeneratedSearch[];
  inputFilePath?: string;
  maxSearches: number;
  perSourceLimit: number;
  timeoutMs: number;
};

export interface SearchDiscoveryProvider {
  readonly providerName: string;
  discover(request: DiscoveryProviderRequest): Promise<DiscoveredCandidate[]>;
}
