import { resolve } from "node:path";

import type { SearchDiscoveryProvider, DiscoveryProviderRequest } from "../contracts/discovery-provider.ts";
import type { DiscoveredCandidate, GeneratedSearch } from "../contracts/lead-types.ts";
import type { RegionCatalog, RegionEntry } from "../config/keywords.ts";
import { readJsonArtifact } from "../storage/json-artifact-store.ts";
import { normalizeUrl } from "../utils/normalize-url.ts";

const PLACES_API_URL = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = "places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.businessStatus,places.types,places.id";

const EXCLUDED_PLACE_TYPES = new Set([
  "school", "university", "secondary_school", "primary_school", "preschool",
  "training_center", "event_venue", "auditorium", "concert_hall",
  "performing_arts_theater", "convention_center",
  "lodging", "hotel", "motel", "hostel", "campground",
  "restaurant", "cafe", "bar", "bakery", "meal_delivery", "meal_takeaway",
  "doctor", "dentist", "hospital", "pharmacy", "health",
  "church", "mosque", "synagogue", "hindu_temple", "place_of_worship",
  "park", "tourist_attraction", "zoo", "amusement_park", "museum",
  "gym", "stadium", "sports_club",
  "beauty_salon", "hair_care", "spa",
  "parking", "gas_station", "car_dealer", "car_repair",
  "bank", "atm", "insurance_agency", "accounting"
]);

const GARBAGE_FINAL_NAME_RE = /^(?:curso\s+de|auditório|hotel|unidade\s+de\s+curso|instalação\s*,|venda\s+e\s+orçamento)/i;

type PlacesApiPlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  businessStatus?: string;
  types?: string[];
};

type PlacesApiResponse = {
  places?: PlacesApiPlace[];
};

const sanitizeId = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const parseBrazilianAddress = (address?: string): { city?: string; state?: string } => {
  if (!address) return {};

  // "Rua X, 123 - Bairro, Cidade - UF, CEP, Brazil"
  const stateMatch = address.match(/[-,]\s*([A-Z]{2})[,\s]/);
  const state = stateMatch?.[1];

  const beforeState = stateMatch ? address.slice(0, stateMatch.index) : address;
  const parts = beforeState.split(",").map((p) => p.trim()).filter(Boolean);
  const city = parts[parts.length - 1]?.replace(/^.*-\s*/, "").trim();

  return { city: city || undefined, state: state || undefined };
};

const GARBAGE_FIRST_SEGMENT_RE = /^(?:placa\s+de\s+energia|energia\s+solar\s+em\s|instalação\s+de|curso\s+de\s+energia|as\s+melhores|melhores?\s+empresa|unidade\s|filial\s)/i;
const PURE_LOCATION_SEGMENT_RE = /^(?:recife|maringá|barueri|alphaville|olinda|paulista|pernambuco|[A-Z]{2})$/i;
const UNIT_BRANCH_SUFFIX_RE = /\s*[-–|]\s*(?:unidade|filial)\s+.+$/i;
const CITY_AFTER_SEPARATOR_RE = /\s*[-–]\s*(?:recife|maringá|barueri|alphaville|olinda|paulista|suape|arruda|boa\s+viagem|cabo\s+de\s+santo\s+agostinho|santana\s+do\s+parna[ií]ba)\b.*/i;
const EM_LOCATION_RE = /\s+(?:em|na|no)\s+[A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ].+$/i;
const STATE_ABBR_AT_END_RE = /\s*\/[A-Z]{2}$|\s+[A-Z]{2}$/;
const STATE_NAME_AT_END_RE = /\s+(?:pernambuco|paraná|são paulo|nordeste|paraíba|alagoas)\s*$/i;
const CITY_AT_END_RE = /\s+(?:Cabo\s+de\s+Santo\s+Agostinho|Jaboat[aã]o\s+dos\s+Guararapes|Recife|Maringá|Barueri|Alphaville|Olinda|Paulista|Caruaru|Suape)\s*(?:\/[A-Z]{2})?$/i;
const TRAILING_TAGLINE_RE = /\s*[-–|]\s*(?:energia solar|energia fotovoltaica)\s*$/i;
const TRAILING_JUNK_RE = /\s*[|/\\]+\s*$/;
const EMOJI_PREFIX_RE = /^[^\p{L}\p{N}]+/u;

const cleanGooglePlacesName = (raw: string): string => {
  let name = raw.trim().replace(EMOJI_PREFIX_RE, "").trim();

  // Divide por separadores comuns
  const parts = name.split(/\s+[-–|]\s+/);

  if (parts.length > 1) {
    // Tenta o primeiro segmento; se for lixo/localização, tenta o último
    const first = parts[0].trim();
    const last = parts[parts.length - 1].trim();
    if (GARBAGE_FIRST_SEGMENT_RE.test(first) || PURE_LOCATION_SEGMENT_RE.test(first)) {
      name = last;
    } else {
      name = first;
    }
  }

  // Remove "- Unidade X" ou "- Filial X"
  name = name.replace(UNIT_BRANCH_SUFFIX_RE, "").trim();

  // Remove "- Cidade" após separador
  name = name.replace(CITY_AFTER_SEPARATOR_RE, "").trim();

  // Remove "em Cidade/Estado"
  name = name.replace(EM_LOCATION_RE, "").trim();

  // Remove cidade conhecida no final
  name = name.replace(CITY_AT_END_RE, "").trim();

  // Remove estado no final: "/PE", " PE", "Pernambuco"
  name = name.replace(STATE_ABBR_AT_END_RE, "").trim();
  name = name.replace(STATE_NAME_AT_END_RE, "").trim();

  // Remove tagline duplicada: "- Energia Solar"
  name = name.replace(TRAILING_TAGLINE_RE, "").trim();

  // Remove caracteres sobrando no final
  name = name.replace(TRAILING_JUNK_RE, "").trim();

  return name || raw.trim();
};

const isExcludedByType = (place: PlacesApiPlace): boolean => {
  if (!place.types?.length) return false;
  return place.types.some((t) => EXCLUDED_PLACE_TYPES.has(t));
};

const toCandidate = (place: PlacesApiPlace, search: GeneratedSearch): DiscoveredCandidate | null => {
  if (isExcludedByType(place)) return null;

  const name = cleanGooglePlacesName(place.displayName?.text ?? "Empresa sem nome");

  if (GARBAGE_FINAL_NAME_RE.test(name)) return null;

  const website = place.websiteUri;
  const { city, state } = parseBrazilianAddress(place.formattedAddress);

  return {
    id: sanitizeId(`google-places-${search.id}-${name}`),
    query: search.query,
    niche: search.niche,
    region: search.region,
    sourceType: "engine_publica",
    provider: "google-places",
    sourceConfidence: 0.95,
    title: name,
    url: website ?? `https://maps.google.com/?q=${encodeURIComponent(name)}`,
    snippet: place.formattedAddress,
    companyNameGuess: name,
    city,
    state,
    flags: place.businessStatus && place.businessStatus !== "OPERATIONAL" ? ["negocio_nao_operacional"] : [],
    mockResolvedWebsite: website,
    mockCompanyName: name,
    mockCity: city,
    mockState: state,
    mockContactPhone: place.nationalPhoneNumber
  };
};

const buildRegionCoordMap = (catalog: RegionCatalog): Map<string, RegionEntry> =>
  new Map(catalog.regioes.map((r) => [r.label, r]));

const searchGooglePlaces = async (
  apiKey: string,
  query: string,
  region: RegionEntry,
  maxResults: number,
  timeoutMs: number
): Promise<PlacesApiPlace[]> => {
  const body = {
    textQuery: query,
    locationBias: {
      circle: {
        center: { latitude: region.lat, longitude: region.lng },
        radius: region.radiusMeters ?? 50000
      }
    },
    maxResultCount: Math.min(maxResults, 20),
    languageCode: "pt-BR"
  };

  const response = await fetch(PLACES_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Google Places API retornou ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = await response.json() as PlacesApiResponse;
  return (data.places ?? []).filter((p) => p.businessStatus !== "PERMANENTLY_CLOSED");
};

export class GooglePlacesDiscoveryProvider implements SearchDiscoveryProvider {
  readonly providerName = "google-places";
  discardedByPolicy = 0;
  blockedByChallenge = 0;
  providerWarnings: string[] = [];
  private readonly projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  async discover(request: DiscoveryProviderRequest): Promise<DiscoveredCandidate[]> {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
    if (!apiKey) return [];

    const catalog = await readJsonArtifact<RegionCatalog>(
      resolve(this.projectRoot, "data", "regioes.json"),
      { regioes: [] }
    );
    const regionMap = buildRegionCoordMap(catalog);

    const searches = request.generatedSearches.slice(0, request.maxSearches);
    const candidates: DiscoveredCandidate[] = [];
    this.discardedByPolicy = 0;
    this.providerWarnings = [];

    for (const search of searches) {
      const region = regionMap.get(search.region);
      if (!region?.lat || !region?.lng) {
        this.providerWarnings.push(`Google Places: região "${search.region}" sem coordenadas — busca ignorada.`);
        continue;
      }

      try {
        const places = await searchGooglePlaces(
          apiKey,
          search.query,
          region,
          request.perSourceLimit,
          request.timeoutMs
        );

        for (const place of places) {
          const candidate = toCandidate(place, search);
          if (candidate) candidates.push(candidate);
          else this.discardedByPolicy += 1;
        }
      } catch (error) {
        this.providerWarnings.push(
          `Google Places: falha na busca "${search.query}": ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return candidates;
  }
}
