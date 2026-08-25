export type LeadStatus =
  | "novo"
  | "captado"
  | "analisado"
  | "pontuado"
  | "pendente_revisao"
  | "qualificado"
  | "descartado";

export type PotentialLevel = "alto" | "medio" | "baixo";
export type ReviewDecision = "qualificado" | "pendente" | "descartado";
export type SignalStrength = "strong" | "medium" | "weak" | "negative";
export type DiscoverySourceType = "manual" | "engine_publica" | "diretorio" | "fixture";

export type LogisticSignal = {
  id: string;
  label: string;
  strength: SignalStrength;
  evidence: string;
  points: number;
};

export type RawLead = {
  id: string;
  source: string;
  companyName: string;
  website?: string;
  normalizedWebsite?: string;
  city?: string;
  state?: string;
  region?: string;
  niche?: string;
  description?: string;
  query?: string;
  matchedQueries: string[];
  contactEmail?: string;
  contactPhone?: string;
  mockSiteText?: string;
  sourceType?: DiscoverySourceType;
  sourceConfidence?: number;
  flags?: string[];
  sourceUrls?: string[];
  status: LeadStatus;
};

export type SiteAnalysis = {
  attempted: boolean;
  success: boolean;
  source: "mock" | "network" | "none";
  summary?: string;
  extractedText?: string;
  flags: string[];
};

export type AnalyzedLead = RawLead & {
  status: "analisado";
  siteAnalysis: SiteAnalysis;
  signals: LogisticSignal[];
};

export type ScoreBreakdown = {
  criterion: string;
  points: number;
  matched: boolean;
  notes: string;
};

export type ScoredLead = AnalyzedLead & {
  status: "pontuado";
  score: number;
  potential: PotentialLevel;
  scoreBreakdown: ScoreBreakdown[];
  scoreReason: string;
  suggestedDecision: ReviewDecision;
  suggestedChannel: string;
  nextAction: string;
  storageScore: number;
  storagePotential: PotentialLevel;
};

export type ReviewLead = {
  id: string;
  reviewRank: number;
  reviewPriority: "alta" | "media" | "baixa";
  reviewPriorityScore: number;
  reviewPriorityReasons: string[];
  companyName: string;
  website?: string;
  city?: string;
  state?: string;
  niche?: string;
  region?: string;
  source?: string;
  description?: string;
  contactEmail?: string;
  contactPhone?: string;
  score: number;
  potential: PotentialLevel;
  suggestedDecision: ReviewDecision;
  suggestedChannel: string;
  nextAction: string;
  signals: string[];
  flags: string[];
  scoreReason: string;
  destinoSugerido: "leads-qualificados.md" | "leads-brutos.md" | "leads-descartados.md";
  resumoCurto: string;
  blocoMarkdown: string;
};

export type OperationalLeadStatus = "pendente" | "enviado" | "duplicado" | "erro";
export type BrevoDeliveryStatus = Exclude<OperationalLeadStatus, "pendente">;
export type DuplicateSource = "local" | "brevo";
export type DuplicateIdentifierType = "email" | "telefone";

export type BrevoDeliveryAttempt = {
  attemptId: string;
  leadId: string;
  attemptedAt: string;
  companyName: string;
  website?: string;
  emailOriginal?: string;
  emailNormalizado?: string;
  telefoneOriginal?: string;
  telefoneNormalizado?: string;
  statusEnvio: BrevoDeliveryStatus;
  duplicateSource?: DuplicateSource;
  duplicateIdentifierType?: DuplicateIdentifierType;
  duplicateIdentifierValue?: string;
  brevoContactId?: number;
  brevoListId?: number;
  brevoListLabel?: string;
  payloadEnviado?: unknown;
  errorCode?: string;
  errorMessage?: string;
};

export type ReviewApproval = {
  leadId: string;
  aprovado: boolean;
  destinoFinal?: ReviewLead["destinoSugerido"];
  observacoes?: string;
};
