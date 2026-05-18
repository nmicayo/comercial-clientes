# Sessão de Testes Reais com Leads — Radar Comercial Solar

**Data:** 2026-05-06
**Contexto:** Phenyx Logística — primeira rodada de prospecção real com o pipeline `radar-comercial-solar`

---

## Objetivo

Terminar a sessão com 7 leads reais qualificados e abordagem (e-mail ou WhatsApp) pronta para envio pelo próprio Nicolas.

---

## Escopo

- Descoberta automática via `radar:rodar-hibrido`
- Regiões: Cabo de Santo Agostinho/PE, Maringá/PR, Barueri/Alphaville/SP
- Revisão humana obrigatória antes de qualquer registro
- Abordagem gerada no Claude Code para cada lead aprovado
- Sem frontend, sem Brevo, sem disparo automático

---

## Fluxo da Sessão

### Fase 1 — Preparação

1. Confirmar que o pipeline está instalado (`npm install` na pasta `radar-comercial-solar/` se necessário)
2. Rodar `npm run radar:gerar-buscas` para montar as queries cruzando nichos + palavras-chave + 3 regiões

### Fase 2 — Descoberta

Rodar o pipeline completo em uma única chamada:

```bash
npm run radar:rodar-hibrido -- --max-searches=9 --per-source-limit=6
```

O pipeline executa automaticamente: descoberta → resolução de sites → captação → análise → pontuação → fila de revisão.

**Parâmetros justificados:**
- `--max-searches=9` — cobre 3 nichos prioritários × 3 regiões com sobreposição útil
- `--per-source-limit=6` — balanceia cobertura com qualidade; acima disso aumenta ruído sem ganho proporcional

O pipeline já descarta cedo: anúncios, redirects, marketplaces (Mercado Livre, Amazon, Shopee), hubs de "melhores empresas" e agregadores.

### Fase 3 — Revisão Humana

1. Abrir `data/fila-revisao.json`
2. Revisar começando pelos itens com `reviewPriority: alta` (já ordenados por `reviewRank`)
3. Cada item traz: `resumoCurto`, `score`, `destinoSugerido`, `flags`, `blocoMarkdown` pronto
4. Preencher `data/aprovacoes-revisao.json` com os aprovados:

```json
[
  { "leadId": "<id do item>", "aprovado": true }
]
```

5. Rodar `npm run radar:registrar-aprovados`
6. Os aprovados são registrados automaticamente em `leads/leads-qualificados.md`

### Fase 4 — Geração de Abordagem

Para cada lead em `leads/leads-qualificados.md`:
1. Colar o bloco do lead no Claude Code junto com `prompts/gerar-abordagem.md`
2. Informar: nome/cargo do Nicolas, como apresentar a Phenyx, tom preferido
3. Receber mensagem pronta para envio no canal sugerido pelo score

---

## Critérios de Aprovação na Revisão

### Aprovado

- Score ≥ 60
- Pelo menos um sinal físico claro: estoque, pronta entrega, expedição, distribuição, entrega regional/nacional, catálogo B2B
- Sem flag `empresa_ambigua`
- Flag `site_nao_confirmado` é tolerável se nome e segmento forem claros

### Aprovado com ressalvas

- Score entre 45–59 com sinal físico forte e dúvida sanável
- Registrado em `leads-qualificados.md` com status "Qualificado com ressalvas"
- Próxima ação: validar volume e recorrência antes de abordar

### Descartado

- Score < 45
- Apenas financiamento solar, assinatura de energia, marketplace puro ou geração compartilhada sem operação física
- Flag `dados_ralos` sem nada concreto sobre a empresa

---

## Abordagem por Canal

| Canal | Quando usar | Formato |
|---|---|---|
| E-mail | Distribuidoras, operações maiores, empresas com site formal | Assunto + corpo |
| WhatsApp | Integradoras regionais, empresas menores, canal sugerido pelo score | Texto único direto |

A mensagem inclui: referência à operação específica da empresa, argumento comercial calibrado para a dor logística provável, tom direto e profissional.

---

## Plano B

Se a rodada não trouxer 7 candidatos aprovados:
- Rodar segunda rodada com nichos ou regiões diferentes
- Ou ajustar `--max-searches` e `--per-source-limit` para ampliar cobertura

---

## Output Esperado ao Final da Sessão

- `data/fila-revisao.json` — todos os candidatos descobertos e pontuados
- `leads/leads-qualificados.md` — 7 leads reais registrados
- 7 mensagens de abordagem prontas para envio (e-mail ou WhatsApp)
