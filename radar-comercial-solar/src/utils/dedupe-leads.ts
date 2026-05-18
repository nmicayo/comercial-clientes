import type { RawLead } from "../contracts/lead-types.ts";

const normalizeName = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const buildCompositeKey = (lead: RawLead): string =>
  [normalizeName(lead.companyName), lead.city?.toLowerCase() ?? "", lead.state?.toLowerCase() ?? ""].join("|");

const mergeLead = (current: RawLead, incoming: RawLead): RawLead => {
  const matchedQueries = [...new Set([...current.matchedQueries, ...incoming.matchedQueries])];

  return {
    ...current,
    description: current.description?.length ? current.description : incoming.description,
    source: current.source ?? incoming.source,
    sourceType: current.sourceType ?? incoming.sourceType,
    sourceConfidence: Math.max(current.sourceConfidence ?? 0, incoming.sourceConfidence ?? 0) || undefined,
    website: current.website ?? incoming.website,
    normalizedWebsite: current.normalizedWebsite ?? incoming.normalizedWebsite,
    city: current.city ?? incoming.city,
    state: current.state ?? incoming.state,
    region: current.region ?? incoming.region,
    niche: current.niche ?? incoming.niche,
    contactEmail: current.contactEmail ?? incoming.contactEmail,
    contactPhone: current.contactPhone ?? incoming.contactPhone,
    mockSiteText: current.mockSiteText ?? incoming.mockSiteText,
    flags: [...new Set([...(current.flags ?? []), ...(incoming.flags ?? [])])],
    sourceUrls: [...new Set([...(current.sourceUrls ?? []), ...(incoming.sourceUrls ?? [])])],
    matchedQueries
  };
};

export const dedupeLeads = (leads: RawLead[]): { leads: RawLead[]; duplicatesRemoved: number } => {
  const uniqueByWebsite = new Map<string, RawLead>();
  const uniqueByComposite = new Map<string, RawLead>();
  const uniqueLeads: RawLead[] = [];
  const leadIndexById = new Map<string, number>();
  let duplicatesRemoved = 0;

  for (const lead of leads) {
    if (lead.normalizedWebsite && uniqueByWebsite.has(lead.normalizedWebsite)) {
      const merged = mergeLead(uniqueByWebsite.get(lead.normalizedWebsite)!, lead);
      uniqueByWebsite.set(lead.normalizedWebsite, merged);
      const index = leadIndexById.get(merged.id);

      if (index !== undefined) {
        uniqueLeads[index] = merged;
      }

      duplicatesRemoved += 1;
      continue;
    }

    const compositeKey = buildCompositeKey(lead);

    if (!lead.normalizedWebsite && uniqueByComposite.has(compositeKey)) {
      const merged = mergeLead(uniqueByComposite.get(compositeKey)!, lead);
      uniqueByComposite.set(compositeKey, merged);
      const index = leadIndexById.get(merged.id);

      if (index !== undefined) {
        uniqueLeads[index] = merged;
      }

      duplicatesRemoved += 1;
      continue;
    }

    uniqueLeads.push(lead);
    leadIndexById.set(lead.id, uniqueLeads.length - 1);

    if (lead.normalizedWebsite) {
      uniqueByWebsite.set(lead.normalizedWebsite, lead);
      continue;
    }

    uniqueByComposite.set(compositeKey, lead);
  }

  return { leads: uniqueLeads, duplicatesRemoved };
};
