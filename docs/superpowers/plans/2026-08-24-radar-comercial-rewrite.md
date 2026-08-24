# Rewrite do radar-comercial-solar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the noisy Bing/DuckDuckGo scraping pipeline from `radar-comercial-solar`, replace it with structured, high-precision discovery sourced from real sector directories, and expand scope from solar-only to also cover the industrial/agro/bebidas profile — while keeping the Brevo approval panel working unchanged.

**Architecture:** No new discovery/scoring code is written. A live AI session (the agent itself, using WebSearch/WebFetch) becomes the discovery + qualification engine on demand, writing results directly into the existing `leads/*.md` files and into `data/fila-revisao.json` in the existing `ReviewLead[]` shape — the exact contract the Brevo panel already consumes. The obsolete automated pipeline (collectors, keyword scoring, review-queue builder) is deleted. `ScoredLead` and its dependency chain (`RawLead`, `AnalyzedLead`, `SiteAnalysis`, `LogisticSignal`, `ScoreBreakdown`, `LeadStatus`, `SignalStrength`, `DiscoverySourceType`) stay in `lead-types.ts` even though nothing produces them anymore, because 3 kept panel files (`panel-service.ts`, `list-approved.ts`, `send-approved.ts`) still import `ScoredLead` as a fallback-data type — deleting that chain would break the panel.

**Tech Stack:** Node.js with `--experimental-strip-types` (no build step, no type-checking at runtime — types are stripped, not enforced), plain JSON/Markdown data files, a Vite-based panel UI under `src/panel/ui` (untouched by this plan).

**Spec:** `docs/superpowers/specs/2026-08-24-radar-comercial-rewrite-design.md`

## Global Constraints

- Every candidate lead must be checked against `data/clientes-atuais.json` and `data/nao-contatar.json` before registration — never register an existing client or a do-not-contact entry.
- Brevo dedupe check (`BrevoClient.findContactByEmail`) happens as soon as a candidate's e-mail is found, before finishing the qualification write-up — never register a lead that's already a Brevo contact.
- Every new lead entry written to `leads/*.md` or `data/fila-revisao.json` must also carry a `region` value that exactly matches one of the `fase: 1` labels in `data/regioes.json` (see Task 4) — otherwise the panel's Fase-1 filter silently hides it.
- **Perfil B coverage rule (filial PR/Maringá only, does not apply to Perfil A/filial PE):** direct coverage is PR/SP/SC/MS. A Perfil B candidate in MG/RJ/DF or any other state is still a valid target, but its `region` must be `"Sul-Sudeste (Perfil B) — cotação antecipada PR"` (not the direct-coverage label), and its "Próxima ação" field must say "Solicitar cotação antecipada à filial PR antes de fechar".
- Do not modify `src/panel/ui/*` — it has its own independent type definitions and is unaffected by any backend change in this plan.
- Do not remove `ScoredLead`, `RawLead`, `AnalyzedLead`, `SiteAnalysis`, `LogisticSignal`, `ScoreBreakdown`, `LeadStatus`, `SignalStrength`, `DiscoverySourceType` from `lead-types.ts` — they're dead at runtime but structurally required by kept panel files.
- No API key, no new automated/scheduled discovery code — this rewrite is agent-in-session only (see spec's "Decisão sobre ferramenta de CRM/e-mail" and Opção 1 vs Opção 2 discussion).
- **`data/` and `leads/` are gitignored in this repo** (`.gitignore`: "Dados operacionais com PII — não versionar"). Every task touching those paths (Task 4, Task 10) is invisible to `git diff`/`review-package` — verify by reading the live filesystem directly, not by trusting an empty-looking diff. This applies to the final whole-branch review too.

---

### Task 1: Remove the obsolete discovery/scoring pipeline (source files)

**Files:**
- Delete: `src/collectors/discover-companies.ts`
- Delete: `src/collectors/fetch-company-site.ts`
- Delete: `src/collectors/generate-searches.ts`
- Delete: `src/collectors/google-places-discovery-provider.ts`
- Delete: `src/collectors/resolve-company-site.ts`
- Delete: `src/collectors/search-places.ts`
- Delete: `src/collectors/capture-hybrid.ts`
- Delete: `src/analysis/classify-lead.ts`
- Delete: `src/analysis/extract-signals.ts`
- Delete: `src/analysis/score-lead.ts`
- Delete: `src/review/review-queue.ts`
- Delete: `src/contracts/discovery-provider.ts`
- Delete: `src/contracts/search-provider.ts`
- Delete: `src/utils/dedupe-leads.ts`

**Interfaces:**
- Consumes: nothing (this is pure deletion)
- Produces: nothing — these files have zero consumers left once Task 2 trims `src/cli.ts`. Confirmed by grep: `RegionCatalog`, `ScoredLead`, `PotentialLevel`, `ReviewDecision` (the only types referenced from kept panel/review files) are declared in `lead-types.ts` and `keywords.ts`, not in any file deleted here.

- [ ] **Step 1: Confirm no kept file imports these modules**

Run:
```bash
cd /Users/nmicayo/Documents/Projects/Trabalho/comercial-clientes/radar-comercial-solar
grep -rn "collectors/\|analysis/classify-lead\|analysis/extract-signals\|analysis/score-lead\|review/review-queue\|contracts/discovery-provider\|contracts/search-provider\|utils/dedupe-leads" src/panel src/review/register-approved.ts src/brevo-audit src/storage src/panel/ui 2>/dev/null
```
Expected: no output (empty). If anything prints, stop and investigate before deleting.

- [ ] **Step 2: Delete the files**

```bash
cd /Users/nmicayo/Documents/Projects/Trabalho/comercial-clientes/radar-comercial-solar
rm src/collectors/discover-companies.ts src/collectors/fetch-company-site.ts src/collectors/generate-searches.ts src/collectors/google-places-discovery-provider.ts src/collectors/resolve-company-site.ts src/collectors/search-places.ts src/collectors/capture-hybrid.ts
rm src/analysis/classify-lead.ts src/analysis/extract-signals.ts src/analysis/score-lead.ts
rm src/review/review-queue.ts
rm src/contracts/discovery-provider.ts src/contracts/search-provider.ts
rm src/utils/dedupe-leads.ts
rmdir src/collectors src/analysis 2>/dev/null || true
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor: remove Bing/DuckDuckGo scraping pipeline and keyword-based scoring

These produced heavy noise (irrelevant companies mixed with real leads)
per the 2026-08-24 rewrite spec. Discovery/qualification moves to an
AI-in-session flow described in the spec; the Brevo panel and its data
contracts are unaffected.
EOF
)"
```

---

### Task 2: Trim `src/cli.ts` and `package.json` to drop discovery/scoring commands

**Files:**
- Modify: `src/cli.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `registerApprovedReviewItems` (from `src/review/register-approved.ts`, unchanged), `sendApprovedLeads`/`listApprovedLeads` (from `src/panel/send-approved.ts`/`list-approved.ts`, unchanged), `printBrevoAuditUsage`/`runBrevoAudit` (from `src/brevo-audit/run-brevo-audit.ts`, unchanged), `auditBrevo` (from `src/panel/audit-brevo.ts`, unchanged), `PotentialLevel` (from `src/contracts/lead-types.ts`, unchanged)
- Produces: a `cli.ts` that only supports `radar:registrar-aprovados`, `radar:auditar-brevo`, `radar:aberturas`, `radar:listar-aprovados`, `radar:enviar-aprovados`

- [ ] **Step 1: Delete the obsolete command functions in `src/cli.ts`**

Delete these function definitions entirely (they call into the modules removed in Task 1):
- `runGenerateSearches` (originally lines 43-57)
- `runCapture` (originally lines 58-84)
- `runDiscover` (originally lines 85-118)
- `runResolveSites` (originally lines 119-137)
- `runCaptureHybrid` (originally lines 138-156)
- `runAnalyzeSites` (originally lines 157-202)
- `runScore` (originally lines 203-232)
- `runReview` (originally lines 233-261)
- `runPipelineV1` (originally lines 310-337)
- `runHybridPipeline` (originally lines 339-373)

Keep `runRegisterApproved` and `runBrevoAuditCommand` untouched.

- [ ] **Step 2: Delete the obsolete dispatch branches**

In the `if (command === ...) { ... } else if (...) { ... }` chain, delete the branches for: `radar:gerar-buscas`, `radar:descobrir`, `radar:resolver-sites`, `radar:captar-hibrido`, `radar:captar`, `radar:analisar-sites`, `radar:pontuar`, `radar:revisar`, `radar:rodar-v1`, `radar:rodar-hibrido`.

Keep the branches for `radar:registrar-aprovados`, `radar:auditar-brevo`, `radar:aberturas`, `radar:listar-aprovados`, `radar:enviar-aprovados`, and the final `else` fallback — but update the fallback message:

```typescript
} else {
  console.log(
    "Comando desconhecido. Use: radar:registrar-aprovados, radar:auditar-brevo, radar:aberturas, radar:listar-aprovados ou radar:enviar-aprovados."
  );
  process.exitCode = 1;
}
```

- [ ] **Step 3: Trim the import block at the top of `src/cli.ts`**

Replace the current import block with:

```typescript
import { registerApprovedReviewItems } from "./review/register-approved.ts";
import { sendApprovedLeads } from "./panel/send-approved.ts";
import { listApprovedLeads } from "./panel/list-approved.ts";
import { printBrevoAuditUsage, runBrevoAudit } from "./brevo-audit/run-brevo-audit.ts";
import { auditBrevo } from "./panel/audit-brevo.ts";
import type { PotentialLevel } from "./contracts/lead-types.ts";
```

(Drops the imports of `resolve` from `node:path`, `readJsonArtifact`/`writeJsonArtifact`, `dedupeLeads`, `extractSignals`, `scoreLead`, `buildReviewQueue`, and the collector functions — none of these are referenced by the kept command branches. If `resolve` or the storage helpers turn out to still be used by `getArgValue`/`hasFlag`/`logSummary`/`getNumericArg`, keep those specific imports.)

- [ ] **Step 4: Remove the obsolete scripts from `package.json`**

Delete these entries from `"scripts"`:
```json
"radar:gerar-buscas": "node --experimental-strip-types src/cli.ts radar:gerar-buscas",
"radar:descobrir": "node --experimental-strip-types src/cli.ts radar:descobrir",
"radar:resolver-sites": "node --experimental-strip-types src/cli.ts radar:resolver-sites",
"radar:captar": "node --experimental-strip-types src/cli.ts radar:captar",
"radar:captar-hibrido": "node --experimental-strip-types src/cli.ts radar:captar-hibrido",
"radar:analisar-sites": "node --experimental-strip-types src/cli.ts radar:analisar-sites",
"radar:pontuar": "node --experimental-strip-types src/cli.ts radar:pontuar",
"radar:revisar": "node --experimental-strip-types src/cli.ts radar:revisar",
"radar:rodar-v1": "node --experimental-strip-types src/cli.ts radar:rodar-v1",
"radar:rodar-hibrido": "node --env-file=.env --experimental-strip-types src/cli.ts radar:rodar-hibrido",
```

Keep `radar:registrar-aprovados`, `radar:listar-aprovados`, `radar:enviar-aprovados`, `radar:aberturas`, `radar:auditar-brevo`, `radar:painel`, `radar:painel:build`, `radar:painel:dev`.

**Do not remove the `playwright-core` dependency.** It looks collector-only at first glance, but `src/brevo-audit/run-brevo-audit.ts` (kept — backs `radar:auditar-brevo`) imports it too. Leave `"dependencies": { "playwright-core": "^1.60.0" }` untouched.

- [ ] **Step 5: Verify the kept commands still run**

```bash
cd /Users/nmicayo/Documents/Projects/Trabalho/comercial-clientes/radar-comercial-solar
node --experimental-strip-types src/cli.ts radar:listar-aprovados
node --experimental-strip-types src/cli.ts radar:comando-inexistente
```
Expected: `radar:listar-aprovados` runs without an import/syntax error (it may report zero leads — that's fine, the point is it doesn't crash on a missing import). `radar:comando-inexistente` prints the updated "Comando desconhecido" message listing only the 5 kept commands.

- [ ] **Step 6: Commit**

```bash
git add src/cli.ts package.json
git commit -m "refactor: drop discovery/scoring CLI commands, keep Brevo approval commands"
```

---

### Task 3: Trim `src/contracts/lead-types.ts` and `src/config/keywords.ts`

**Files:**
- Modify: `src/contracts/lead-types.ts`
- Modify: `src/config/keywords.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: same exported type names as before, minus `GeneratedSearch`, `DiscoveredCandidate`, `ResolvedSiteCandidate` — every other export (including the `ScoredLead` chain) stays because `src/panel/panel-service.ts`, `src/panel/list-approved.ts`, and `src/panel/send-approved.ts` still import `ScoredLead`. `src/config/keywords.ts` keeps exporting `RegionEntry`, `RegionCatalog`, `loadRegionCatalog` (the last is uncalled today, but it operates on the live `data/regioes.json` Task 4 maintains — cheap to keep) — `panel-service.ts` imports `RegionCatalog` from this exact file.

**Correction (found during implementation):** `src/config/keywords.ts` was missing from Task 1's deletion list even though it imports `GeneratedSearch` (removed by this task) and defines `buildSearchId` (part of the discarded search-generation pipeline, unused anywhere now). It cannot be deleted wholesale — `RegionEntry`/`RegionCatalog` in the same file are imported by the kept `src/panel/panel-service.ts`. This task now also trims that file: remove `KeywordGroup`, `KeywordCatalog`, `loadKeywordCatalog`, `buildSearchId`, and the `GeneratedSearch` import; keep `RegionEntry`, `RegionCatalog`, `loadRegionCatalog`, and the `resolve`/`readJsonArtifact` imports they still need.

- [ ] **Step 1: Remove the three orphaned types**

Delete these three type definitions (verified zero references anywhere outside the files deleted in Task 1):

```typescript
export type GeneratedSearch = {
  id: string;
  query: string;
  niche: string;
  region: string;
  keyword: string;
  locationTerm?: string;
};
```

```typescript
export type DiscoveredCandidate = {
  id: string;
  query: string;
  niche: string;
  region: string;
  sourceType: DiscoverySourceType;
  provider: string;
  sourceConfidence: number;
  title: string;
  url: string;
  snippet?: string;
  companyNameGuess?: string;
  city?: string;
  state?: string;
  directoryDomain?: string;
  flags: string[];
  mockResolvedWebsite?: string;
  mockCompanyName?: string;
  mockCity?: string;
  mockState?: string;
  mockContactEmail?: string;
  mockContactPhone?: string;
  mockPrimerText?: string;
  mockCandidateHtml?: string;
};
```

```typescript
export type ResolvedSiteCandidate = {
  id: string;
  query: string;
  niche: string;
  region: string;
  sourceType: DiscoverySourceType;
  provider: string;
  sourceConfidence: number;
  resolutionConfidence: number;
  title: string;
  candidateUrl: string;
  officialWebsite?: string;
  companyName: string;
  snippet?: string;
  city?: string;
  state?: string;
  contactEmail?: string;
  contactPhone?: string;
  summaryText?: string;
  pagesRead: string[];
  pageFlags: string[];
  flags: string[];
};
```

Leave every other type in the file untouched — `LeadStatus`, `PotentialLevel`, `ReviewDecision`, `SignalStrength`, `DiscoverySourceType`, `LogisticSignal`, `RawLead`, `SiteAnalysis`, `AnalyzedLead`, `ScoreBreakdown`, `ScoredLead`, `ReviewLead`, `OperationalLeadStatus`, `BrevoDeliveryStatus`, `DuplicateSource`, `DuplicateIdentifierType`, `BrevoDeliveryAttempt`, `ReviewApproval` all stay exactly as they are.

- [ ] **Step 2: Trim `src/config/keywords.ts`**

Replace the file content with:

```typescript
import { resolve } from "node:path";

import { readJsonArtifact } from "../storage/json-artifact-store.ts";

export type RegionEntry = {
  id: string;
  label: string;
  terms: string[];
  priority: string;
  fase?: number;
  lat?: number;
  lng?: number;
  radiusMeters?: number;
};

export type RegionCatalog = {
  regioes: RegionEntry[];
};

export const loadRegionCatalog = async (projectRoot: string): Promise<RegionCatalog> => {
  const filePath = resolve(projectRoot, "data", "regioes.json");
  return readJsonArtifact<RegionCatalog>(filePath, { regioes: [] });
};
```

This drops the `GeneratedSearch` import, `KeywordGroup`, `KeywordCatalog`, `loadKeywordCatalog`, and `buildSearchId`.

- [ ] **Step 3: Verify nothing references the removed types/functions**

```bash
cd /Users/nmicayo/Documents/Projects/Trabalho/comercial-clientes/radar-comercial-solar
grep -rn "GeneratedSearch\|DiscoveredCandidate\|ResolvedSiteCandidate\|KeywordGroup\|KeywordCatalog\|loadKeywordCatalog\|buildSearchId" src/
```
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/contracts/lead-types.ts src/config/keywords.ts
git commit -m "refactor: drop discovery-only types from lead-types.ts and keywords.ts, keep ScoredLead chain and RegionCatalog for panel"
```

---

### Task 4: Update `data/regioes.json` for the two profiles, remove stale data artifacts

**Files:**
- Modify: `data/regioes.json`
- Delete: `data/buscas-geradas.json`, `data/buscas-geradas.json.bak`, `data/resultados-brutos.json`, `data/resultados-brutos.json.bak`, `data/sites-analisados.json`, `data/sites-analisados.json.bak`, `data/sites-resolvidos.json`, `data/sites-resolvidos.json.bak`, `data/resultados-descoberta.json`, `data/resultados-descoberta.json.bak`, `data/keywords.json`, `data/leads-pontuados.json`, `data/leads-pontuados.json.bak`, `data/exemplos/` (whole directory)

**Interfaces:**
- Consumes: nothing
- Produces: `data/regioes.json` with two new `fase: 1` region entries (`"Nordeste (Perfil A)"`, `"Sul-Sudeste (Perfil B)"`) that Task 6/7's discovery work and the pilot batch (Task 9) must use verbatim as the `region` field value on every `ReviewLead` and `leads/*.md` entry they write, so the panel's Fase-1 filter (`isLeadInFase1Region` in `src/panel/panel-service.ts`) doesn't hide them.

- [ ] **Step 1: Delete the stale pipeline data artifacts**

```bash
cd /Users/nmicayo/Documents/Projects/Trabalho/comercial-clientes/radar-comercial-solar
rm -f data/buscas-geradas.json data/buscas-geradas.json.bak
rm -f data/resultados-brutos.json data/resultados-brutos.json.bak
rm -f data/sites-analisados.json data/sites-analisados.json.bak
rm -f data/sites-resolvidos.json data/sites-resolvidos.json.bak
rm -f data/resultados-descoberta.json data/resultados-descoberta.json.bak
rm -f data/keywords.json
rm -f data/leads-pontuados.json data/leads-pontuados.json.bak
rm -rf data/exemplos
```

Do **not** delete `data/clientes-atuais.json`, `data/nao-contatar.json`, `data/fila-revisao.json`, `data/aprovacoes-revisao.json`, `data/brevo-envios.json` (and their `.bak`s) — these are consumed by the kept panel/review code.

- [ ] **Step 2: Add the two new region entries to `data/regioes.json`**

Replace the file content with:

```json
{
  "regioes": [
    {
      "id": "nordeste_perfil_a",
      "label": "Nordeste (Perfil A)",
      "terms": [
        "Pernambuco",
        "Bahia",
        "Maranhão",
        "Rio Grande do Norte",
        "Paraíba",
        "Ceará",
        "Sergipe",
        "Alagoas"
      ],
      "priority": "alta",
      "fase": 1
    },
    {
      "id": "perfil_b_cobertura_direta_pr",
      "label": "Sul-Sudeste (Perfil B) — cobertura direta PR",
      "terms": [
        "Paraná",
        "São Paulo",
        "Santa Catarina",
        "Mato Grosso do Sul"
      ],
      "priority": "alta",
      "fase": 1
    },
    {
      "id": "perfil_b_cotacao_antecipada_pr",
      "label": "Sul-Sudeste (Perfil B) — cotação antecipada PR",
      "terms": [
        "Minas Gerais",
        "Rio de Janeiro",
        "Distrito Federal"
      ],
      "priority": "media",
      "fase": 1
    },
    {
      "id": "cabo_santo_agostinho",
      "label": "Cabo de Santo Agostinho",
      "terms": [
        "Cabo de Santo Agostinho",
        "Recife",
        "Pernambuco"
      ],
      "priority": "alta",
      "fase": 1,
      "lat": -8.0576,
      "lng": -34.8829,
      "radiusMeters": 50000
    },
    {
      "id": "maringa",
      "label": "Maringá",
      "terms": [
        "Maringá"
      ],
      "priority": "media",
      "fase": 1,
      "lat": -23.4205,
      "lng": -51.9333,
      "radiusMeters": 30000
    },
    {
      "id": "barueri_alphaville",
      "label": "Barueri/Alphaville",
      "terms": [
        "Barueri",
        "Alphaville"
      ],
      "priority": "media",
      "fase": 1,
      "lat": -23.5011,
      "lng": -46.8771,
      "radiusMeters": 20000
    }
  ]
}
```

(Bumped `maringa` and `barueri_alphaville` from `fase: 2` to `fase: 1` too, since Perfil B's Sul-Sudeste scope now covers their states from day one — there's no more "Fase 2, expand later" in this rewrite.)

- [ ] **Step 3: Verify the JSON is valid and the panel still boots**

```bash
cd /Users/nmicayo/Documents/Projects/Trabalho/comercial-clientes/radar-comercial-solar
node -e "JSON.parse(require('fs').readFileSync('data/regioes.json', 'utf8')); console.log('ok')"
node --env-file-if-exists=.env --experimental-strip-types src/panel/server.ts &
sleep 2
curl -sf http://localhost:4173/ > /dev/null && echo "panel boots ok"
kill %1
```
Expected: `ok` then `panel boots ok` (adjust the port if `PANEL_PORT` is set differently in `.env`).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove stale pipeline data artifacts, mark Perfil A/B regions as fase 1"
```

---

### Task 5: Update `.env.example`

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Remove the Google Places key (only used by the deleted `google-places-discovery-provider.ts`)**

Replace the file content with:

```bash
BREVO_API_KEY=sua_chave_brevo_aqui
BREVO_LIST_ID_PROSPECCAO_ARMAZENAGEM_PE=123456
PANEL_PORT=4173
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "chore: drop unused GOOGLE_PLACES_API_KEY from .env.example"
```

---

### Task 6: Create `inteligencia/fontes-estruturadas-solar.md`

**Files:**
- Create: `inteligencia/fontes-estruturadas-solar.md`

- [ ] **Step 1: Write the file**

```markdown
# Fontes Estruturadas — Perfil A (Solar/Fotovoltaico)

Fontes de descoberta de alta precisão para o Perfil A, verificadas em 2026-08-24. Consultar estas antes de recorrer a WebSearch genérico — o objetivo é começar de listas onde a chance de ruído já é baixa.

## Associações setoriais

- **ABSOLAR** (Associação Brasileira de Energia Solar Fotovoltaica) — diretório de associados: https://www.absolar.org.br/associados/
- **ABGD** (Associação Brasileira de Geração Distribuída) — portal: https://www.abgd.com.br/portal/

## Diretórios/portais setoriais

- **Canal Solar** — categoria Distribuidores: https://canalsolar.com.br/category/distribuidores/
- **Portal Solar** — diretório de distribuidores/fornecedores de equipamentos: https://www.portalsolar.com.br/distribuidor-fornecedor-equipamentos-energia-solar-fotovoltaica.html

## Como consultar

1. Abrir o diretório/associados e listar candidatos com nome + site.
2. Aplicar a Etapa 1 (filtro barato) de `docs/superpowers/specs/2026-08-24-radar-comercial-rewrite-design.md` antes de ler qualquer site a fundo.
3. Quando as fontes acima não cobrirem uma região específica dentro do Nordeste (ver `data/regioes.json`, região `nordeste_perfil_a`), complementar com WebSearch dirigido por nicho + região, nunca com busca genérica sem filtro de nicho.

## Clientes-espelho de referência

Ver `contexto/clientes-espelho.md` — Sol Copérnico e Solfácil são os clientes-espelho reais validados pelos dados de operação (relatório SSW, período 01/08–24/08/2026).
```

- [ ] **Step 2: Commit**

```bash
cd /Users/nmicayo/Documents/Projects/Trabalho/comercial-clientes/radar-comercial-solar
git add inteligencia/fontes-estruturadas-solar.md
git commit -m "docs: add structured discovery sources for Perfil A (solar)"
```

---

### Task 7: Create `inteligencia/fontes-estruturadas-industrial.md`

**Files:**
- Create: `inteligencia/fontes-estruturadas-industrial.md`

- [ ] **Step 1: Write the file**

```markdown
# Fontes Estruturadas — Perfil B (Industrial/Agro/Bebidas)

Fontes de descoberta de alta precisão para o Perfil B, verificadas em 2026-08-24. Perfil novo nesta rewrite — validado pelos clientes-espelho reais confirmados no relatório SSW (Ambev, Coamo Agroindustrial, Owens-Illinois, Crown Embalagens, Trigobel, Camil, Spal Indústria, HNK BR Indústria).

## Federações e sindicatos setoriais

- **FIESP** (Federação das Indústrias do Estado de São Paulo) — mantém diretórios por sindicato setorial (ex: SIFESP, SINDIVIDRO, SINDILUX): https://www.fiesp.com.br/
- **FIEP** (Federação das Indústrias do Estado do Paraná): https://www.fiepr.org.br/
- **ABIA** (Associação Brasileira da Indústria de Alimentos) — diretório de associadas: https://www.abia.org.br/associados
- **ABRABE** (Associação Brasileira de Bebidas): https://www.abrabe.org.br/
- **OCB** (Organização das Cooperativas Brasileiras) — Sistema OCB: https://somoscooperativismo.coop.br/institucional/ocb

## Como consultar

1. Abrir o diretório/sindicato relevante e listar candidatos com nome + site.
2. Aplicar a Etapa 1 (filtro barato) de `docs/superpowers/specs/2026-08-24-radar-comercial-rewrite-design.md` antes de ler qualquer site a fundo.
3. Complementar com busca direcionada por concorrentes/parceiros dos clientes-espelho reais (Ambev, Coamo, Owens-Illinois, Crown, Trigobel, Camil, Spal, HNK) via WebSearch.

## Cobertura da filial PR (obrigatório registrar por candidato)

O Perfil B é atendido pela filial Maringá/PR, que **não tem cobertura nacional**. Ao qualificar um candidato:

- Se ele está em **PR, SP, SC ou MS** → `region: "Sul-Sudeste (Perfil B) — cobertura direta PR"`, próxima ação normal.
- Se ele está em **qualquer outro estado** (MG, RJ, DF etc.) → continua sendo alvo válido, mas `region: "Sul-Sudeste (Perfil B) — cotação antecipada PR"` e "Próxima ação" deve dizer "Solicitar cotação antecipada à filial PR antes de fechar".

Essa regra vale só para a filial PR — não se aplica ao Perfil A (filial PE já tem cobertura própria validada no Nordeste).

## Nota sobre alimentício/armazenagem

`contexto/objetivo.md` exclui alimentício e químico permanentemente para a oferta de **armazenagem**. Leads deste perfil (Ambev, Camil, Trigobel são clientes-espelho de **transporte**, não de armazenagem) devem ser qualificados e abordados como oportunidade de transporte recorrente — confirmar com quem decide a oferta comercial antes do primeiro contato real com um lead alimentício.

## Clientes-espelho de referência

Ver `contexto/clientes-espelho.md`.
```

- [ ] **Step 2: Commit**

```bash
cd /Users/nmicayo/Documents/Projects/Trabalho/comercial-clientes/radar-comercial-solar
git add inteligencia/fontes-estruturadas-industrial.md
git commit -m "docs: add structured discovery sources for Perfil B (industrial/agro/bebidas)"
```

---

### Task 8: Update `contexto/clientes-espelho.md`, `inteligencia/nichos-prioritarios.md`, and `contexto/perfil-phenyx.md` for Perfil B

**Files:**
- Modify: `contexto/clientes-espelho.md`
- Modify: `inteligencia/nichos-prioritarios.md`
- Modify: `contexto/perfil-phenyx.md`

- [ ] **Step 1: Append the Perfil B mirror clients to `contexto/clientes-espelho.md`**

Add at the end of the file, after the existing `## DNL Comércio` section, following the exact same structure as the existing entries:

```markdown
---

## Ambev

Tipo de empresa:
- Indústria de bebidas (cervejas e refrigerantes)

Possíveis características:
- Produção e distribuição em larga escala
- Múltiplas plantas industriais, rotas recorrentes entre fábrica e distribuidores/atacadistas
- Alto volume de frete fracionado e dedicado

Por que é um bom cliente espelho:
- Cliente real confirmado pelos dados de operação (relatório SSW, período 01/08–24/08/2026)
- Operação recorrente com produto físico em alto volume
- Rotas Sul-Sudeste (Perfil B)

---

## Coamo Agroindustrial

Tipo de empresa:
- Cooperativa agroindustrial

Possíveis características:
- Distribuição de insumos e produtos agrícolas
- Rotas recorrentes entre cooperativa e atacadistas/distribuidores
- Operação capilar dentro do estado do Paraná e vizinhos

Por que é um bom cliente espelho:
- Cliente real confirmado pelos dados de operação
- Perfil de cooperativa agro — ver fonte OCB em `inteligencia/fontes-estruturadas-industrial.md`

---

## Owens-Illinois / Crown Embalagens

Tipo de empresa:
- Indústria de embalagens (vidro/metal) para bebidas e alimentos

Possíveis características:
- Fornecimento recorrente para indústrias de bebidas/alimentos
- Rotas fixas entre planta industrial e cliente final

Por que é um bom cliente espelho:
- Cliente real confirmado pelos dados de operação
- Indica que fornecedores da cadeia de bebidas/alimentos (não só as marcas finais) também são alvo válido

---

## Trigobel / Camil / Spal Indústria / HNK BR Indústria

Tipo de empresa:
- Indústria de alimentos, bebidas e nutrição animal

Possíveis características:
- Operação recorrente com produto físico
- Rotas Sul-Sudeste, múltiplos CTRCs por mês por cliente

Por que é um bom cliente espelho:
- Clientes reais confirmados pelos dados de operação
- Ver nota sobre alimentício/armazenagem em `inteligencia/fontes-estruturadas-industrial.md` — são clientes de transporte, não de armazenagem
```

- [ ] **Step 2: Append a Perfil B section to `inteligencia/nichos-prioritarios.md`**

Add at the end of the file:

```markdown
---

## 7. Indústria de alimentos/bebidas/agro (Perfil B — novo)

Prioridade: Alta

Empresas que:
- Produzem alimentos, bebidas ou insumos agrícolas em escala industrial
- Têm rotas recorrentes de distribuição Sul-Sudeste (PR/MG/SP/RJ/DF)
- Fornecem para atacadistas, distribuidores ou outras indústrias (ex: fabricantes de embalagem)

Por que são boas:
- Clientes-espelho reais confirmados por dados de operação (não hipótese) — ver `contexto/clientes-espelho.md`
- Alto volume de frete recorrente
- Podem indicar fornecedores/concorrentes no mesmo setor

Atenção:
- Nicho alimentício está excluído permanentemente da oferta de **armazenagem** (ver `contexto/objetivo.md`) — qualificar e abordar como oportunidade de **transporte**, não armazenagem
```

- [ ] **Step 3: Append a coverage-filter note to `contexto/perfil-phenyx.md`**

Add at the end of the "Filtros mentais para análise" section:

```markdown
- Perfil B (indústria/agro/bebidas) é atendido pela filial Maringá/PR, que não tem cobertura nacional: atendimento direto é PR/SP/SC/MS; candidatos em outros estados continuam válidos, mas precisam de "cotação antecipada à filial PR" antes de fechar — essa regra não se aplica ao Perfil A (filial PE tem cobertura própria já validada no Nordeste)
```

- [ ] **Step 4: Commit**

```bash
cd /Users/nmicayo/Documents/Projects/Trabalho/comercial-clientes/radar-comercial-solar
git add contexto/clientes-espelho.md inteligencia/nichos-prioritarios.md contexto/perfil-phenyx.md
git commit -m "docs: add Perfil B mirror clients, priority niche, and PR filial coverage rule"
```

---

### Task 9: Update `README.md` and `contexto/objetivo.md`

**Files:**
- Modify: `README.md`
- Modify: `contexto/objetivo.md`

- [ ] **Step 1: Rewrite the "Pipeline V1" / "Estado atual da Parte 3" / command-reference sections of `README.md`**

Remove every section describing the deleted commands (`radar:gerar-buscas` through `radar:rodar-hibrido`, the "O que cada comando faz" table, "Como testar sem busca externa", "Como tentar a descoberta automática real", "O que a descoberta já filtra", "Limites atuais da descoberta"). Replace with:

```markdown
## Fluxo atual (rewrite 2026-08-24)

Não há mais pipeline automatizado de descoberta. O fluxo é sob demanda, guiado por uma sessão de IA (ver `docs/superpowers/specs/2026-08-24-radar-comercial-rewrite-design.md`):

1. Peça um lote por perfil (ex: "10 leads de distribuidora solar no Nordeste" ou "leads de indústria de bebidas no PR/SC").
2. A descoberta parte das fontes estruturadas em `inteligencia/fontes-estruturadas-solar.md` (Perfil A) ou `inteligencia/fontes-estruturadas-industrial.md` (Perfil B), complementada por WebSearch dirigido quando necessário.
3. Cada candidato passa pelo filtro barato (cliente atual? não-contatar? nicho óbvio errado?) e só depois pela leitura funda do site + checagem Brevo por e-mail.
4. Resultados aprovados são gravados em `leads/*.md` e em `data/fila-revisao.json` (mesmo formato `ReviewLead[]` que o painel já consome).
5. Revisão humana continua obrigatória antes de qualquer contato — aprove pelo painel (`npm run radar:painel`) ou por `data/aprovacoes-revisao.json` + `npm run radar:registrar-aprovados`.

## Comandos restantes

- `radar:registrar-aprovados`: lê aprovações manuais e registra os itens aprovados nos arquivos `leads/*.md`
- `radar:listar-aprovados` / `radar:enviar-aprovados`: fluxo de envio para o Brevo
- `radar:aberturas`: consulta estatísticas de abertura no Brevo
- `radar:auditar-brevo`: auditoria pontual do estado do Brevo
- `radar:painel`: painel local de aprovação (ver seção "Painel local de aprovação Brevo" abaixo)
```

Keep the "Painel local de aprovação Brevo" section, "Pré-requisitos", "Subir o painel", "Aprovar e registrar automaticamente" and "Proteção contra sobrescrita" sections unchanged — those describe kept functionality.

Update the top-level "Estrutura" section to add `inteligencia/fontes-estruturadas-solar.md` and `inteligencia/fontes-estruturadas-industrial.md` to the tree.

- [ ] **Step 2: Update `contexto/objetivo.md`**

Replace the "Fases de expansão geográfica" section (which describes a PE-first, PR/SP-later rollout that no longer applies) with:

```markdown
## Escopo (rewrite 2026-08-24)

Dois perfis ativos desde o início, cobrindo clientes novos apenas (a carteira atual da Phenyx não é alvo de prospecção nesta ferramenta):

- **Perfil A — Solar/Nordeste**: escopo original, validado pelos clientes-espelho Sol Copérnico e Solfácil.
- **Perfil B — Industrial/agro/bebidas/Sul-Sudeste**: perfil novo, validado pelos clientes-espelho Ambev, Coamo, Owens-Illinois, Crown, Trigobel, Camil, Spal, HNK BR Indústria.

Ver `docs/superpowers/specs/2026-08-24-radar-comercial-rewrite-design.md` para o design completo.
```

Keep the "Segmentos excluídos permanentemente" section (Químico, Alimentício) but add the clarifying note already present in `inteligencia/fontes-estruturadas-industrial.md`:

```markdown
**Nota:** essa exclusão vale para a oferta de armazenagem. Leads alimentícios do Perfil B (transporte recorrente) não estão bloqueados por esta regra — ver `inteligencia/fontes-estruturadas-industrial.md`.
```

- [ ] **Step 3: Commit**

```bash
cd /Users/nmicayo/Documents/Projects/Trabalho/comercial-clientes/radar-comercial-solar
git add README.md contexto/objetivo.md
git commit -m "docs: update README and objetivo.md for the two-profile, on-demand flow"
```

---

### Task 10: Run the precision pilot batch and write the validation report

**Files:**
- Modify: `leads/leads-qualificados.md`, `leads/leads-brutos.md`, `leads/leads-descartados.md` (append real entries)
- Modify: `data/fila-revisao.json` (append real `ReviewLead[]` entries)
- Create: `docs/superpowers/plans/2026-08-24-radar-rewrite-pilot-report.md`

This task is executed live by the agent (WebSearch + WebFetch + judgment), not scripted — it's the actual exercise of the new flow, and its output is the acceptance-criteria evidence from the spec.

- [ ] **Step 1: Run a Perfil A pilot batch (15-20 candidates)**

Using `inteligencia/fontes-estruturadas-solar.md`, discover 15-20 candidates. For each: apply Etapa 1 (check against `data/clientes-atuais.json`, `data/nao-contatar.json`, obvious-noise filter), then Etapa 2 for survivors (real site read, Brevo `findContactByEmail` check as soon as an email is found). Write qualified/pending/discarded entries to `leads/*.md` with `region: "Nordeste (Perfil A)"`, and write `ReviewLead[]` entries for qualified ones to `data/fila-revisao.json`.

- [ ] **Step 2: Run a Perfil B pilot batch (15-20 candidates)**

Same process using `inteligencia/fontes-estruturadas-industrial.md`. For each candidate, apply the PR filial coverage rule: `region: "Sul-Sudeste (Perfil B) — cobertura direta PR"` if the candidate is in PR/SP/SC/MS, or `region: "Sul-Sudeste (Perfil B) — cotação antecipada PR"` otherwise (with "Próxima ação" noting the advance-quote requirement). Aim for a mix of both so the pilot report can confirm the distinction actually gets applied, not just the direct-coverage case.

- [ ] **Step 3: Write the validation report**

Create `docs/superpowers/plans/2026-08-24-radar-rewrite-pilot-report.md` documenting, per the spec's acceptance criteria:
- Total candidates reviewed per profile
- Count discarded at Etapa 1 vs Etapa 2, and why
- Count of obvious-noise false positives (target: as close to zero as the spec requires)
- Count of candidates that were already in `data/clientes-atuais.json` or already Brevo contacts (caught before registration)
- Final qualified/pending/discarded counts written to `leads/*.md`

- [ ] **Step 4: Verify against acceptance criteria**

Re-read `docs/superpowers/specs/2026-08-24-radar-comercial-rewrite-design.md`'s "Validação de precisão" section and confirm every bullet is satisfied by the pilot report. If not, run additional candidates or adjust the fontes-estruturadas files before declaring the rewrite done.

- [ ] **Step 5: Commit**

```bash
cd /Users/nmicayo/Documents/Projects/Trabalho/comercial-clientes/radar-comercial-solar
git add leads/ data/fila-revisao.json
git add ../docs/superpowers/plans/2026-08-24-radar-rewrite-pilot-report.md 2>/dev/null || git -C /Users/nmicayo/Documents/Projects/Trabalho/comercial-clientes add docs/superpowers/plans/2026-08-24-radar-rewrite-pilot-report.md
git commit -m "test: run precision pilot batch for Perfil A and Perfil B, document results"
```
