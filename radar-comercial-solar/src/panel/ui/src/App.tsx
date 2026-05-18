import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, RefreshCw, Send, X } from 'lucide-react'

import { fetchLeads, sendLead } from './api'
import type { OperationalStatus, PanelConfig, ReviewLead } from './types'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// ─── helpers ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 15

const _decoder = typeof document !== 'undefined' ? document.createElement('textarea') : null
function dec(html: string | undefined | null): string {
  if (!html) return ''
  if (!_decoder) return html
  _decoder.innerHTML = html
  return _decoder.value
}

const GENERIC_TITLES = new Set([
  'home', 'início', 'inicio', 'index', 'página inicial', 'pagina inicial', 'home page',
])

// Single-word product/technical terms that are never company names on their own
const PRODUCT_TERMS = new Set([
  'microinversor', 'inversor', 'inversores', 'painel', 'paineis', 'módulo', 'modulo',
  'módulos', 'modulos', 'placa', 'placas', 'bateria', 'baterias', 'usina', 'gerador',
  'geradores', 'sistema', 'sistemas', 'kit', 'kits', 'fotovoltaico', 'fotovoltaica',
  'solar', 'energia', 'instalação', 'instalacao', 'manutenção', 'manutencao',
  'serviços', 'servicos', 'produto', 'produtos', 'loja', 'categoria',
])

// SEO page title patterns: "Serviço em Cidade", "Instalação para X"
const SEO_TITLE_RE = /\b(em|para|de|na|no)\s+[A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ]/u

function looksLikeSeoTitle(name: string): boolean {
  const lower = name.toLowerCase().trim()
  if (GENERIC_TITLES.has(lower)) return true
  // Single technical/product word — never a company name alone
  if (!lower.includes(' ') && PRODUCT_TERMS.has(lower)) return true
  // "Energia Solar em Barueri", "Instalação de Painéis em SP", etc.
  if (SEO_TITLE_RE.test(name)) return true
  // Very long names are almost always page titles (> 50 chars)
  if (name.length > 50) return true
  return false
}

// Stop at the first repeated SIGNIFICANT word (len > 2) — extracts "JN Energia Solar" from "JN Energia Solar Energia Solar..."
// Short words like "de", "da", "em" are ignored so articles don't cause premature cuts
function takeBeforeRepeat(text: string): string {
  const words = text.split(/\s+/)
  const seen = new Set<string>()
  const result: string[] = []
  for (const word of words) {
    const lower = word.toLowerCase()
    if (lower.length > 2 && seen.has(lower)) break
    if (lower.length > 2) seen.add(lower)
    result.push(word)
  }
  return result.join(' ')
}

function resolveCompanyName(lead: ReviewLead): string {
  const raw = dec(lead.companyName)
  if (!looksLikeSeoTitle(raw)) return raw

  if (lead.description) {
    const decoded = dec(lead.description)
    const segments = decoded.split('|').map((s) => s.trim()).filter(Boolean)

    // Brand names are often the last pipe-segment ("SEO Title | Subtitle | Brand content…")
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i]
      // Strip trailing phone numbers and everything after
      const noPhone = seg.replace(/\s*[\+\(]?\d[\d\s\(\)\-+]{6,}[\s\S]*$/, '').trim()
      // Take the part before the first - or : then stop at repeated words
      const name = takeBeforeRepeat((noPhone.split(/[-–:]/).map((s) => s.trim())[0] ?? noPhone))
      if (name.length >= 2 && name.length <= 50 && !looksLikeSeoTitle(name)) {
        return name
      }
    }
  }

  // Fall back to domain (skysolar.com.br → Skysolar)
  if (lead.website) {
    try {
      const host = new URL(lead.website.startsWith('http') ? lead.website : `https://${lead.website}`).hostname
      const name = host.replace(/^www\./, '').split('.')[0]
      return name.charAt(0).toUpperCase() + name.slice(1)
    } catch { /* ignore */ }
  }

  return raw
}

function decodeLeads(leads: ReviewLead[]): ReviewLead[] {
  return leads.map((l) => ({
    ...l,
    companyName: resolveCompanyName(l),
    editableCompanyName: dec(l.editableCompanyName) || resolveCompanyName(l),
    displayLocation: dec(l.displayLocation),
    resumoCurto: dec(l.resumoCurto),
    scoreReason: dec(l.scoreReason),
    suggestedChannel: dec(l.suggestedChannel),
    signals: l.signals.map(dec),
    source: dec(l.source),
    nextAction: dec(l.nextAction),
    flags: l.flags.map(dec),
    description: dec(l.description),
    contactEmail: dec(l.contactEmail),
    contactPhone: dec(l.contactPhone),
    editableEmail: dec(l.editableEmail),
    editablePhone: dec(l.editablePhone),
  }))
}

function statusLabel(s: OperationalStatus): string {
  const map: Record<OperationalStatus, string> = {
    pendente: 'Pendente',
    enviado: 'Enviado',
    duplicado: 'Duplicado',
    erro: 'Erro',
  }
  return map[s]
}

function potentialLabel(p: 'alto' | 'medio' | 'baixo'): string {
  return p === 'alto' ? 'Alto' : p === 'medio' ? 'Médio' : 'Baixo'
}

function potentialColor(p: 'alto' | 'medio' | 'baixo'): string {
  return p === 'alto'
    ? 'text-green-400'
    : p === 'medio'
      ? 'text-amber-400'
      : 'text-slate-400'
}

type StatusVariant = 'pendente' | 'enviado' | 'duplicado' | 'erro'

function statusVariant(s: OperationalStatus): StatusVariant {
  return s as StatusVariant
}

// Score é informacional — decisão de envio é sempre do usuário
function isQualifiedLead(_lead: Pick<ReviewLead, 'suggestedDecision'>): boolean {
  return true
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR')
  } catch {
    return iso
  }
}

/** Wraps plain URLs found in a string with <a> tags. Returns JSX array. */
function linkifyText(text: string): React.ReactNode[] {
  const urlRegex = /(https?:\/\/[^\s,;)"'<>]+)/g
  const parts = text.split(urlRegex)
  return parts.map((part, i) => {
    if (urlRegex.test(part)) {
      urlRegex.lastIndex = 0
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline break-all hover:text-primary/80"
        >
          {part}
        </a>
      )
    }
    urlRegex.lastIndex = 0
    return part
  })
}

// ─── sub-components ─────────────────────────────────────────────────────────

interface CounterBadgeProps {
  label: string
  value: number
  active?: boolean
  colorClass?: string
}

function CounterBadge({ label, value, colorClass = 'text-foreground' }: CounterBadgeProps) {
  return (
    <div className="flex flex-col items-center px-4 py-1 rounded-lg bg-secondary/60 min-w-[72px]">
      <span className={`text-xl font-bold leading-tight ${colorClass}`}>{value}</span>
      <span className="text-xs text-muted-foreground mt-0.5">{label}</span>
    </div>
  )
}

// ─── Lead Sheet ─────────────────────────────────────────────────────────────

interface LeadSheetProps {
  lead: ReviewLead | null
  config: PanelConfig | null
  open: boolean
  onClose: () => void
  onSent: (id: string, updatedCompanyName: string, updatedEmail: string, updatedPhone: string, newStatus: OperationalStatus) => void
}

function LeadSheet({ lead, config, open, onClose, onSent }: LeadSheetProps) {
  const [companyName, setCompanyName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  // Reset form whenever lead changes
  useEffect(() => {
    if (lead) {
      setCompanyName(lead.editableCompanyName ?? lead.companyName ?? '')
      setEmail(lead.editableEmail ?? lead.contactEmail ?? '')
      setPhone(lead.editablePhone ?? lead.contactPhone ?? '')
      setResult(null)
    }
  }, [lead?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!lead) return null

  const actionableLead = isQualifiedLead(lead)
  const alreadySent = lead.statusOperacional === 'enviado'
  const canSend = actionableLead && !alreadySent && (config?.ready ?? false) && !sending

  async function handleSend() {
    if (!lead) return
    setSending(true)
    setResult(null)
    try {
      const res = await sendLead(lead.id, email, phone, companyName)
      setResult({ ok: res.ok, message: res.message })
      if (res.ok || res.status !== lead.statusOperacional) {
        onSent(lead.id, companyName, email, phone, res.status)
      }
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : 'Erro desconhecido.' })
    } finally {
      setSending(false)
    }
  }

  const attempt = lead.lastAttempt

  const historicalRows: { label: string; value: React.ReactNode }[] = []
  if (attempt) {
    historicalRows.push({ label: 'Tentado em', value: formatDateTime(attempt.attemptedAt) })
    if (attempt.emailOriginal) historicalRows.push({ label: 'E-mail original', value: attempt.emailOriginal })
    if (attempt.telefoneOriginal) historicalRows.push({ label: 'Telefone original', value: attempt.telefoneOriginal })
    if (attempt.brevoContactId) historicalRows.push({ label: 'ID Brevo', value: attempt.brevoContactId })
    if (attempt.duplicateSource) historicalRows.push({ label: 'Fonte duplicada', value: attempt.duplicateSource })
    if (attempt.duplicateIdentifierType)
      historicalRows.push({ label: 'Tipo duplicado', value: attempt.duplicateIdentifierType })
    if (attempt.duplicateIdentifierValue)
      historicalRows.push({ label: 'Valor duplicado', value: attempt.duplicateIdentifierValue })
    if (attempt.errorCode) historicalRows.push({ label: 'Código de erro', value: attempt.errorCode })
    if (attempt.errorMessage)
      historicalRows.push({
        label: 'Mensagem de erro',
        value: <span className="break-words">{linkifyText(attempt.errorMessage)}</span>,
      })
  }

  const collectedRows: { label: string; value: string }[] = []
  if (lead.source) collectedRows.push({ label: 'Fonte', value: lead.source })
  if (lead.contactEmail) collectedRows.push({ label: 'E-mail de contato', value: lead.contactEmail })
  if (lead.contactPhone) collectedRows.push({ label: 'Telefone de contato', value: lead.contactPhone })
  collectedRows.push({ label: 'Próxima ação', value: lead.nextAction })
  if (lead.flags.length) collectedRows.push({ label: 'Flags', value: lead.flags.join(', ') })

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[560px] overflow-y-auto flex flex-col p-0 border-l border-border"
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-border">
          <SheetHeader>
            <div className="flex items-start justify-between gap-3 pr-6">
              <div className="flex-1 min-w-0">
                <SheetTitle className="text-lg font-bold leading-tight break-words">
                  {companyName || lead.companyName}
                </SheetTitle>
                <SheetDescription className="mt-0.5 text-sm text-muted-foreground">
                  {lead.displayLocation}
                </SheetDescription>
              </div>
              <Badge variant={statusVariant(lead.statusOperacional)} className="shrink-0 mt-0.5">
                {statusLabel(lead.statusOperacional)}
              </Badge>
            </div>
            {lead.website && (
              <a
                href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-2"
              >
                <ExternalLink className="h-3 w-3" />
                {lead.website}
              </a>
            )}
          </SheetHeader>
        </div>

        <div className="flex-1 px-6 py-4 space-y-6">
          {/* Metrics grid */}
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Métricas
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <MetricCard label="Score" value={<span className="text-purple-400 font-bold text-base">{lead.score}</span>} />
              <MetricCard
                label="Potencial"
                value={
                  <span className={`font-semibold text-sm ${potentialColor(lead.potential)}`}>
                    {potentialLabel(lead.potential)}
                  </span>
                }
              />
              <MetricCard label="Localização" value={<span className="text-sm">{lead.displayLocation}</span>} />
              <MetricCard label="Canal sugerido" value={<span className="text-sm">{lead.suggestedChannel}</span>} />
            </div>
          </section>

          {/* Análise */}
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Motivo da análise
            </h3>
            <p className="text-sm leading-relaxed">{lead.resumoCurto}</p>
            {lead.scoreReason && (
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{lead.scoreReason}</p>
            )}
          </section>

          {/* Signals */}
          {lead.signals.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Sinais coletados
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {lead.signals.map((s, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground border border-border"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Contact form */}
          <section className="rounded-lg border border-border bg-card/50 p-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Contato para aprovação
            </h3>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="sheet-company" className="text-xs">Nome da empresa</Label>
                <Input
                  id="sheet-company"
                  type="text"
                  placeholder="Nome da empresa"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  disabled={!actionableLead || alreadySent || sending}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sheet-email" className="text-xs">E-mail</Label>
                <Input
                  id="sheet-email"
                  type="email"
                  placeholder="email@empresa.com.br"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={!actionableLead || alreadySent || sending}
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sheet-phone" className="text-xs">Telefone</Label>
                <Input
                  id="sheet-phone"
                  type="tel"
                  placeholder="+55 11 99999-9999"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={!actionableLead || alreadySent || sending}
                  className="h-8 text-sm"
                />
              </div>


              {!config?.ready && (
                <p className="text-xs text-amber-400">
                  Configuração Brevo incompleta — envio desabilitado.
                </p>
              )}

              {result && (
                <div
                  className={`rounded-md px-3 py-2 text-xs ${
                    result.ok
                      ? 'bg-green-600/15 text-green-300 border border-green-600/30'
                      : 'bg-red-600/15 text-red-300 border border-red-600/30'
                  }`}
                >
                  {result.message}
                </div>
              )}

              <Button
                onClick={handleSend}
                disabled={!canSend}
                className="w-full h-8 text-sm"
                size="sm"
              >
                {sending ? (
                  <span className="flex items-center gap-2">
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    Enviando…
                  </span>
                ) : alreadySent ? (
                  'Já enviado'
                ) : (
                  <span className="flex items-center gap-2">
                    <Send className="h-3 w-3" />
                    Aprovar e enviar
                  </span>
                )}
              </Button>
            </div>
          </section>

          {/* Histórico operacional */}
          {historicalRows.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Histórico operacional
              </h3>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <tbody>
                    {historicalRows.map((row, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-card/40' : 'bg-card/20'}>
                        <td className="px-3 py-1.5 font-medium text-muted-foreground w-36 shrink-0 align-top">
                          {row.label}
                        </td>
                        <td className="px-3 py-1.5 text-foreground break-words">
                          {row.value}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Dados coletados */}
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Dados coletados
            </h3>
            {collectedRows.length > 0 && (
              <div className="rounded-lg border border-border overflow-hidden mb-3">
                <table className="w-full text-xs">
                  <tbody>
                    {collectedRows.map((row, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-card/40' : 'bg-card/20'}>
                        <td className="px-3 py-1.5 font-medium text-muted-foreground w-36 shrink-0 align-top">
                          {row.label}
                        </td>
                        <td className="px-3 py-1.5 text-foreground break-words">{row.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {lead.description && (
              <div className="rounded-lg border border-border bg-card/30 p-3 max-h-40 overflow-y-auto">
                <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {lead.description}
                </p>
              </div>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}

interface MetricCardProps {
  label: string
  value: React.ReactNode
}

function MetricCard({ label, value }: MetricCardProps) {
  return (
    <div className="rounded-lg bg-secondary/40 border border-border/50 px-3 py-2">
      <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
      <div>{value}</div>
    </div>
  )
}

// ─── Main App ────────────────────────────────────────────────────────────────

export default function App() {
  const [leads, setLeads] = useState<ReviewLead[]>([])
  const [config, setConfig] = useState<PanelConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<OperationalStatus | 'todos'>('todos')
  const [page, setPage] = useState(1)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [sheetLead, setSheetLead] = useState<ReviewLead | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const [bulkSending, setBulkSending] = useState(false)
  const [bulkResult, setBulkResult] = useState<{ ok: boolean; message: string } | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchLeads()
      setLeads(decodeLeads(data.leads))
      setConfig(data.config)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // Counters
  const counters = useMemo(() => {
    const counts = { total: leads.length, pendente: 0, enviado: 0, duplicado: 0, erro: 0 }
    for (const l of leads) {
      if (l.statusOperacional === 'pendente') {
        if (isQualifiedLead(l)) counts.pendente++
        continue
      }

      counts[l.statusOperacional]++
    }
    return counts
  }, [leads])

  // Filtering + searching
  const filtered = useMemo(() => {
    let list = leads
    if (statusFilter !== 'todos') {
      list = list.filter((l) => {
        if (statusFilter === 'pendente') return l.statusOperacional === 'pendente' && isQualifiedLead(l)
        return l.statusOperacional === statusFilter
      })
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (l) =>
          l.companyName.toLowerCase().includes(q) ||
          l.displayLocation.toLowerCase().includes(q) ||
          l.resumoCurto.toLowerCase().includes(q),
      )
    }
    return list
  }, [leads, statusFilter, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  // Reset page when filters change
  useEffect(() => { setPage(1) }, [search, statusFilter])

  // Checkbox logic
  const pageIds = useMemo(() => paginated.map((l) => l.id), [paginated])
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id))
  const somePageSelected = pageIds.some((id) => selectedIds.has(id))

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allPageSelected) {
        pageIds.forEach((id) => next.delete(id))
      } else {
        pageIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  function toggleSelect(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clearSelection() {
    setSelectedIds(new Set())
    setBulkResult(null)
  }

  // Open sheet
  function openSheet(lead: ReviewLead) {
    setSheetLead(lead)
    setSheetOpen(true)
  }

  function closeSheet() {
    setSheetOpen(false)
  }

  // Update lead in-place after send
  function handleSent(id: string, updatedCompanyName: string, updatedEmail: string, updatedPhone: string, newStatus: OperationalStatus) {
    setLeads((prev) =>
      prev.map((l) =>
        l.id === id
          ? { ...l, statusOperacional: newStatus, companyName: updatedCompanyName || l.companyName, editableCompanyName: updatedCompanyName, editableEmail: updatedEmail, editablePhone: updatedPhone }
          : l,
      ),
    )
    if (sheetLead?.id === id) {
      setSheetLead((prev) =>
        prev
          ? { ...prev, statusOperacional: newStatus, companyName: updatedCompanyName || prev.companyName, editableCompanyName: updatedCompanyName, editableEmail: updatedEmail, editablePhone: updatedPhone }
          : prev,
      )
    }
  }

  // Bulk send — inclui pendente e erro (retry)
  const pendingSelected = useMemo(
    () => leads.filter((l) => selectedIds.has(l.id) && (l.statusOperacional === 'pendente' || l.statusOperacional === 'erro') && isQualifiedLead(l)),
    [leads, selectedIds],
  )

  async function handleBulkSend() {
    if (!pendingSelected.length) return
    setBulkSending(true)
    setBulkResult(null)
    let successCount = 0
    let failCount = 0
    for (const lead of pendingSelected) {
      try {
        const res = await sendLead(lead.id, lead.editableEmail, lead.editablePhone)
        if (res.ok) {
          successCount++
          setLeads((prev) =>
            prev.map((l) => (l.id === lead.id ? { ...l, statusOperacional: res.status } : l)),
          )
        } else {
          failCount++
          setLeads((prev) =>
            prev.map((l) => (l.id === lead.id ? { ...l, statusOperacional: res.status } : l)),
          )
        }
      } catch {
        failCount++
      }
    }
    setBulkSending(false)
    setSelectedIds(new Set())
    setBulkResult({
      ok: failCount === 0,
      message: `${successCount} enviado(s) com sucesso${failCount ? `, ${failCount} com erro` : ''}.`,
    })
  }

  // Ref for bulk result auto-dismiss
  const bulkResultTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (bulkResult) {
      if (bulkResultTimer.current) clearTimeout(bulkResultTimer.current)
      bulkResultTimer.current = setTimeout(() => setBulkResult(null), 6000)
    }
    return () => {
      if (bulkResultTimer.current) clearTimeout(bulkResultTimer.current)
    }
  }, [bulkResult])

  const selectedCount = selectedIds.size

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Top bar */}
      <header className="border-b border-border bg-card/80 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center gap-4 px-6 py-3 flex-wrap">
          <div className="flex items-center gap-2 mr-4">
            <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="text-primary text-sm font-bold">R</span>
            </div>
            <span className="font-semibold text-sm">Radar Comercial Solar</span>
            {config?.listLabel && (
              <span className="text-xs text-muted-foreground ml-1">— {config.listLabel}</span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <CounterBadge label="Total" value={counters.total} />
            <CounterBadge label="Pendente" value={counters.pendente} colorClass="text-violet-400" />
            <CounterBadge label="Enviado" value={counters.enviado} colorClass="text-green-400" />
            <CounterBadge label="Duplicado" value={counters.duplicado} colorClass="text-amber-400" />
            <CounterBadge label="Erro" value={counters.erro} colorClass="text-red-400" />
          </div>

          <div className="ml-auto flex items-center gap-2">
            {config && !config.ready && (
              <span className="text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded px-2 py-1">
                Brevo não configurado
              </span>
            )}
            <Button
              variant="outline"
              size="icon"
              onClick={() => void loadData()}
              disabled={loading}
              title="Recarregar"
              className="h-8 w-8"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </header>

      {/* Config errors */}
      {config?.errors && config.errors.length > 0 && (
        <div className="bg-amber-600/10 border-b border-amber-600/20 px-6 py-2">
          {config.errors.map((e, i) => (
            <p key={i} className="text-xs text-amber-300">
              {e}
            </p>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="px-6 py-3 border-b border-border flex items-center gap-3 flex-wrap">
        <Input
          placeholder="Buscar empresa, cidade…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 h-8 text-sm"
        />
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
        >
          <SelectTrigger className="w-40 h-8 text-sm">
            <SelectValue placeholder="Filtrar status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="pendente">Pendente</SelectItem>
            <SelectItem value="enviado">Enviado</SelectItem>
            <SelectItem value="duplicado">Duplicado</SelectItem>
            <SelectItem value="erro">Erro</SelectItem>
          </SelectContent>
        </Select>

        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} resultado{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Bulk bar */}
      {selectedCount > 0 && (
        <div className="px-6 py-2 border-b border-violet-600/30 bg-violet-600/10 flex items-center gap-3 flex-wrap">
          <span className="text-sm text-violet-300 font-medium">
            {selectedCount} selecionado{selectedCount !== 1 ? 's' : ''}
          </span>
          {pendingSelected.length > 0 && (
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handleBulkSend}
              disabled={bulkSending}
            >
              {bulkSending ? (
                <span className="flex items-center gap-1.5">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  Enviando…
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <Send className="h-3 w-3" />
                  Enviar {pendingSelected.length} selecionado{pendingSelected.length !== 1 ? 's' : ''}
                </span>
              )}
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearSelection}>
            <X className="h-3 w-3 mr-1" />
            Desmarcar
          </Button>

          {bulkResult && (
            <span
              className={`text-xs ml-2 ${bulkResult.ok ? 'text-green-400' : 'text-red-400'}`}
            >
              {bulkResult.message}
            </span>
          )}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="m-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
          <Button variant="link" size="sm" onClick={() => void loadData()} className="ml-2 text-destructive h-auto p-0">
            Tentar novamente
          </Button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !leads.length && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            <span className="text-sm">Carregando leads…</span>
          </div>
        </div>
      )}

      {/* Table */}
      {!loading || leads.length > 0 ? (
        <div className="flex-1 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="w-10 col-check">
                  <Checkbox
                    checked={allPageSelected}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Selecionar todos"
                    data-state={
                      allPageSelected ? 'checked' : somePageSelected ? 'indeterminate' : 'unchecked'
                    }
                  />
                </TableHead>
                <TableHead className="w-12 text-right text-muted-foreground">#</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead className="w-20 text-center">Score</TableHead>
                <TableHead className="w-24">Potencial</TableHead>
                <TableHead className="w-28">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                    Nenhum lead encontrado.
                  </TableCell>
                </TableRow>
              )}
              {paginated.map((lead) => (
                <TableRow
                  key={lead.id}
                  className="cursor-pointer hover:bg-muted/30 border-border"
                  onClick={() => openSheet(lead)}
                >
                  <TableCell className="col-check" onClick={(e) => toggleSelect(lead.id, e)}>
                    <Checkbox
                      checked={selectedIds.has(lead.id)}
                      onCheckedChange={() => {
                        setSelectedIds((prev) => {
                          const next = new Set(prev)
                          if (next.has(lead.id)) next.delete(lead.id)
                          else next.add(lead.id)
                          return next
                        })
                      }}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Selecionar ${lead.companyName}`}
                    />
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground text-xs font-mono">
                    {lead.reviewRank}
                  </TableCell>
                  <TableCell>
                    <div className="font-semibold text-sm leading-tight">{lead.companyName}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{lead.displayLocation}</div>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="text-purple-400 font-semibold text-sm">{lead.score}</span>
                  </TableCell>
                  <TableCell>
                    <span className={`text-sm font-medium ${potentialColor(lead.potential)}`}>
                      {potentialLabel(lead.potential)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(lead.statusOperacional)}>
                      {statusLabel(lead.statusOperacional)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {/* Pagination */}
      {filtered.length > PAGE_SIZE && (
        <div className="border-t border-border px-6 py-3 flex items-center justify-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            className="h-8 text-xs"
          >
            Anterior
          </Button>
          <span className="text-xs text-muted-foreground">
            Página {safePage} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
            className="h-8 text-xs"
          >
            Próxima
          </Button>
        </div>
      )}

      {/* Lead Sheet */}
      <LeadSheet
        lead={sheetLead}
        config={config}
        open={sheetOpen}
        onClose={closeSheet}
        onSent={handleSent}
      />
    </div>
  )
}
