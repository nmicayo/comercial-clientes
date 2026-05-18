import { basename } from "node:path";

import type { RawLead } from "../contracts/lead-types.ts";
import type { SearchProvider, SearchProviderRequest } from "../contracts/search-provider.ts";
import { readJsonArtifact } from "../storage/json-artifact-store.ts";
import { normalizeUrl } from "../utils/normalize-url.ts";

type ManualLeadInput = {
  companyName: string;
  website?: string;
  city?: string;
  state?: string;
  region?: string;
  niche?: string;
  description?: string;
  query?: string;
  source?: string;
  contactEmail?: string;
  contactPhone?: string;
  mockSiteText?: string;
};

export class FileSearchProvider implements SearchProvider {
  readonly providerName = "file";

  async search(request: SearchProviderRequest): Promise<RawLead[]> {
    const items = await readJsonArtifact<ManualLeadInput[]>(request.inputFilePath, []);

    return items.map((item, index) => ({
      id: `${basename(request.inputFilePath)}:${index + 1}:${item.companyName}`.toLowerCase().replace(/[^a-z0-9:]+/g, "-"),
      source: item.source ?? "manual",
      companyName: item.companyName,
      website: item.website,
      normalizedWebsite: normalizeUrl(item.website),
      city: item.city,
      state: item.state,
      region: item.region,
      niche: item.niche,
      description: item.description,
      query: item.query,
      matchedQueries: item.query ? [item.query] : [],
      contactEmail: item.contactEmail,
      contactPhone: item.contactPhone,
      mockSiteText: item.mockSiteText,
      status: "captado"
    }));
  }
}

export class GooglePlacesSearchProvider implements SearchProvider {
  readonly providerName = "google-places-stub";

  async search(_request: SearchProviderRequest): Promise<RawLead[]> {
    throw new Error("GooglePlacesSearchProvider é apenas um stub na Parte 2 V1. A integração real fica para a Parte 3.");
  }
}
