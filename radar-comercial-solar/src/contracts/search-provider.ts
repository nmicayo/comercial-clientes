import type { GeneratedSearch, RawLead } from "./lead-types.ts";

export type SearchProviderRequest = {
  generatedSearches: GeneratedSearch[];
  inputFilePath: string;
};

export interface SearchProvider {
  readonly providerName: string;
  search(request: SearchProviderRequest): Promise<RawLead[]>;
}
