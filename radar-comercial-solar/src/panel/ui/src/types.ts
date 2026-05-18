export type OperationalStatus = 'pendente' | 'enviado' | 'duplicado' | 'erro'
export type ReviewDecision = 'qualificado' | 'pendente' | 'descartado'

export interface BrevoDeliveryAttempt {
  attemptedAt: string
  emailOriginal?: string
  telefoneOriginal?: string
  duplicateSource?: string
  duplicateIdentifierType?: string
  duplicateIdentifierValue?: string
  errorCode?: string
  errorMessage?: string
  brevoContactId?: string
}

export interface ReviewLead {
  id: string
  reviewRank: number
  companyName: string
  website?: string
  displayLocation: string
  score: number
  potential: 'alto' | 'medio' | 'baixo'
  suggestedDecision: ReviewDecision
  suggestedChannel: string
  statusOperacional: OperationalStatus
  resumoCurto: string
  scoreReason: string
  signals: string[]
  source?: string
  nextAction: string
  flags: string[]
  description?: string
  contactEmail?: string
  contactPhone?: string
  editableCompanyName: string
  editableEmail: string
  editablePhone: string
  lastAttempt?: BrevoDeliveryAttempt
}

export interface PanelConfig {
  ready: boolean
  listLabel: string
  errors: string[]
  port: number
}

export interface ApiLeadsResponse {
  config: PanelConfig
  leads: ReviewLead[]
}

export interface ApiSendResponse {
  ok: boolean
  status: OperationalStatus
  message: string
}
