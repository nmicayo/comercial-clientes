import type { RawLead, SiteAnalysis } from "../contracts/lead-types.ts";
import { fetchText } from "../utils/fetch-text.ts";
import { stripHtml, summarizeText } from "../utils/html-content.ts";

export const fetchCompanySite = async (lead: RawLead): Promise<SiteAnalysis> => {
  if (lead.mockSiteText?.trim()) {
    return {
      attempted: true,
      success: true,
      source: "mock",
      summary: summarizeText(lead.mockSiteText),
      extractedText: lead.mockSiteText,
      flags: ["site_using_mock"]
    };
  }

  if (!lead.website) {
    return {
      attempted: false,
      success: false,
      source: "none",
      flags: ["sem_site"]
    };
  }

  try {
    const response = await fetchText(lead.website, 5000);

    if (!response.ok || !response.body) {
      return {
        attempted: true,
        success: false,
        source: "network",
        flags: ["site_unavailable"]
      };
    }

    const text = stripHtml(response.body);

    return {
      attempted: true,
      success: true,
      source: "network",
      summary: summarizeText(text),
      extractedText: text,
      flags: []
    };
  } catch {
    return {
      attempted: true,
      success: false,
      source: "network",
      flags: ["site_not_analyzed"]
    };
  }
};
