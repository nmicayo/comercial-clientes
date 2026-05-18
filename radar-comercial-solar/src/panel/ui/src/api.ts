import type { ApiLeadsResponse, ApiSendResponse } from './types'

const BASE = ''

export async function fetchLeads(): Promise<ApiLeadsResponse> {
  const res = await fetch(`${BASE}/api/leads`)
  if (!res.ok) {
    throw new Error(`Erro ao carregar leads: ${res.status} ${res.statusText}`)
  }
  return res.json() as Promise<ApiLeadsResponse>
}

export async function sendLead(
  id: string,
  email: string,
  phone: string,
  companyName?: string,
): Promise<ApiSendResponse> {
  const res = await fetch(`${BASE}/api/leads/${encodeURIComponent(id)}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, phone, companyName }),
  })
  const data = (await res.json()) as ApiSendResponse
  return data
}
