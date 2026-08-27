# Spec de Design — Pipeline CNPJ + Score Firmográfico + Revisão CLI

Data: 2026-08-27
Status: Aprovada para implementação (por fases)
Supersede parcialmente: [[2026-08-24-radar-comercial-rewrite-design]] — especificamente a decisão de manter o score como "leitura real por IA" (volta a ser objetivo, baseado em dados estruturados) e a decisão de manter o painel local de aprovação Brevo (aposentado em favor de CLI/Markdown).

## Contexto e motivação

O rewrite de 2026-08-24 resolveu o problema de ruído na descoberta de leads, mas manteve dois pontos que o usuário identificou como frágeis nesta sessão:

1. **Score subjetivo.** A pontuação de `inteligencia/regras-score.md` passou a ser aplicada por leitura/julgamento de IA sobre o texto do site do lead, não por regra objetiva. Isso é inconsistente entre execuções e não escala — o usuário comparou com como grandes operações comerciais fazem scoring (firmográfico, baseado em dados estruturados, não em narrativa).
2. **Painel web desnecessário.** O projeto é deliberadamente operado em Markdown + CLI em todo o resto do fluxo, mas a etapa de aprovação usa um painel React/Vite local — complexidade de stack fora do padrão do projeto, para uma operação de um usuário só, em lote, sem necessidade de tempo real.

Nesta sessão, a Receita Federal disponibilizou a base completa de CNPJ (Cadastro Nacional da Pessoa Jurídica, snapshot mensal, ~6,4 GB) via mirror da Casa dos Dados, já baixada para `radar-comercial-solar/data/2026-08/`. Isso habilita substituir julgamento subjetivo por critérios objetivos: CNAE declarado, situação cadastral, porte, capital social, número de filiais, idade da empresa.

Adicionalmente, os CNPJs dos clientes-espelho de ambos os perfis (validados no rewrite anterior) foram localizados nesta sessão na base — servem de base de calibração para os pesos do score novo.

## Objetivo

Reformular o pipeline em 4 fases entregáveis independentemente, cobrindo os dois perfis (A=Solar, B=Industrial/Agro/Bebidas) desde o início:

1. Extração/filtro nacional da base CNPJ por CNAE de cada perfil
2. Score firmográfico objetivo, calibrado manualmente contra os clientes-espelho reais
3. Fluxo de revisão via CLI de terminal, substituindo o painel web
4. Consulta sob demanda de leads pendentes de follow-up (E2/E3) na campanha Brevo

## Fase 1 — Extração/filtro CNPJ

**Entrada:** os 21 arquivos já baixados em `radar-comercial-solar/data/2026-08/` (`Empresas0-9.zip`, `Estabelecimentos0-9.zip`, `Cnaes.zip`).

**Mudança de config:** `scripts/fonte-cnpj/cnaes.json` deixa de restringir por `ufs` fixa por perfil. A extração passa a ser **nacional** para os dois perfis — a UF/município do estabelecimento continua sendo capturada como dado (usada na Fase 2, camada de geografia), mas não filtra mais na entrada. Motivo: a cobertura logística da Phenyx não é uma lista fixa de UFs, é definida por qual filial (REC ou MGA) atende cada lead, incluindo casos de cotação antecipada fora da área direta — isso é lógica de roteamento, não de exclusão na extração.

**Mudança de processamento:** `scripts/fonte-cnpj/filtrar-cnpj.ts` já faz o join Estabelecimentos↔Empresas↔Municípios por CNAE — reaproveitado, rodado uma vez por perfil (`--perfil=a` e `--perfil=b`), sem argumento de UF.

**Novo campo de saída — nº de filiais por empresa:** ao processar `Estabelecimentos*.zip`, agregar por CNPJ básico (8 primeiros dígitos) contando quantas linhas (matriz + filiais) cada empresa tem. Esse dado não existe hoje na saída do script e precisa ser adicionado (agregação em memória ou passo de pré-processamento antes do join principal, dado o volume de +20M de linhas em Estabelecimentos).

**Saída:** um CSV por perfil (`candidatos-solar.csv`, `candidatos-industrial.csv`) com: CNPJ básico, CNAE (principal e secundários que deram match), razão social, porte, capital social, data de abertura, situação cadastral, UF/município, nº de filiais, contato declarado (telefone/e-mail, quando presente).

**Frequência:** manual, uma vez por atualização mensal da base CNPJ — não é um processo contínuo.

## Fase 2 — Score firmográfico

Substitui a "leitura real por IA" do rewrite anterior por um score em camadas, majoritariamente objetivo:

| Camada | Critério | Fonte |
|---|---|---|
| Fit (corte de entrada, binário) | CNAE principal ou secundário bate com o perfil (A ou B) | Fase 1 |
| Fit (corte de entrada, binário) | Situação cadastral = ativa | Fase 1 |
| Estrutura | Nº de filiais/estabelecimentos ativos (≥2 = sinal de operação distribuída) | Fase 1 |
| Estrutura | Porte = "Demais" (não ME/EPP) | Fase 1 |
| Estrutura | Capital social acima de limiar calibrado | Fase 1 |
| Estrutura | Idade da empresa (anos desde data de abertura) | Fase 1 |
| Geografia | UF/cidade prioritária (Cabo de Santo Agostinho, Maringá, Barueri/Alphaville) | Fase 1 |
| Refinamento (peso menor, opcional) | Sinais de texto do site (estoque, pronta entrega, contato público) — só quando houver enriquecimento manual ou scraping pontual | Fora da Fase 1 |

Empresas que não passam nos critérios de Fit (binários) são descartadas antes de entrar no score — não geram entrada na fila de revisão. Isso substitui a penalidade narrativa de "-40 pontos" do sistema antigo (`inteligencia/regras-score.md`) por um filtro de entrada.

**Calibração dos limiares de Estrutura:** manual, não estatística — dado o tamanho pequeno da amostra de clientes-espelho (~13 empresas). Processo: extrair os campos de Estrutura para os clientes-espelho de cada perfil (localizados nesta sessão — ver seção "Clientes-espelho localizados" abaixo), revisar os números junto com o usuário, e escolher limiares redondos em conjunto — não são definidos unilateralmente.

**Saída:** cada candidato recebe `scoreFit` (passa/não passa), `scoreEstrutura`, `scoreGeografia`, score total e classificação de potencial (Baixo/Médio/Alto), no formato `ReviewLead[]` já usado por `data/fila-revisao.json` (compatibilidade com a cadeia downstream existente: `register-approved.ts`, comandos `radar:registrar-aprovados`/`radar:listar-aprovados`/`radar:enviar-aprovados`).

### Clientes-espelho localizados nesta sessão (CNPJ básico)

| Cliente-espelho | Perfil | CNPJ básico | Confiança |
|---|---|---|---|
| FOTUS Distribuidora | A | 15701525 | Alta |
| Solfácil | A | 31931053 | Alta |
| Sol Copérnico | A | 39798207 | Alta |
| Gradiente Solar | A | 39942227 | Alta |
| DNL Comércio | A | 07189629 | **Baixa — ~15 razões sociais "DNL Comércio de X" na base; requer validação manual antes de usar como referência de calibração** |
| Ambev | B | 07526557 | Alta |
| Coamo Agroindustrial | B | 75904383 | Alta |
| Owens-Illinois | B | 08910541 ou 31452279 | **Média — duas entidades (LTDA e S/A); checar qual está ativa em Estabelecimentos antes de usar** |
| Crown Embalagens | B | 33174335 | Média — nome não é idêntico ao registrado em `clientes-espelho.md` |
| Trigobel | B | 03438822 | Alta |
| Camil | B | 64904295 | Alta |
| Spal Indústria | B | 61186888 | Alta |
| HNK BR Indústria | B | 50221019 | Alta |

Antes da calibração, resolver as entradas de confiança Média/Baixa (DNL, Owens-Illinois, Crown) cruzando com `Estabelecimentos*.zip` (situação ativa, endereço) ou consulta pontual ao site oficial de cada empresa.

## Fase 3 — Revisão via CLI (substitui o painel)

**Decisão:** `src/panel/*` (servidor, UI Vite/React) e o comando `radar:painel`/`radar:painel:build`/`radar:painel:dev` são removidos. Isso reverte a decisão do rewrite de 2026-08-24 de manter o painel "sem alteração de código".

**Fonte de dados:** `data/fila-revisao.json`, gerado pela Fase 2 — mesmo schema `ReviewLead[]` que o painel consumia, sem mudança de formato.

**Novo comando:** `npm run radar:revisar` — CLI interativo em Node (biblioteca leve de prompt de terminal, ex. `prompts` ou `enquirer`; sem servidor HTTP nem browser).

**Fluxo por lead:**
1. Exibe no terminal: empresa, site, score total com breakdown por camada, potencial, cidade/UF, contato coletado.
2. Pergunta: `[a]provar / [e]ditar contato / [d]escartar / [p]ular`.
3. "Editar contato": prompt de texto para corrigir e-mail/telefone antes de aprovar.
4. Ao aprovar: reaproveita a checagem de duplicidade que o painel já fazia — local (arquivos de leads existentes) e no Brevo via `BrevoClient.findContactByEmail` — bloqueando a aprovação se o contato já existir ou se a consulta ao Brevo falhar (mesma trava de segurança, só que disparada pelo CLI em vez do painel).

**Persistência:** status de aprovação/descarte grava de volta em `fila-revisao.json`; a escrita em `leads/leads-qualificados.md` / `leads/leads-descartados.md` reaproveita a lógica existente de `src/review/register-approved.ts` (dedup, backup `.bak`).

## Fase 4 — Consulta de pendências de envio (E2/E3)

**Sem automação proativa** (cron/notificação) por decisão explícita do usuário — controle manual é preferido.

**Novo comando:** `npm run radar:pendentes-envio` — roda quando o usuário lembra, sem agendamento.

**Lógica:** para leads com status `enviado` (campo `dataEnvioE1` já registrado):
- `hoje - dataEnvioE1 ≥ 7 dias` e status de campanha não é `em conversa`/`não interessado`/`cliente` → entra na lista "pronto para E2"
- `hoje - dataUltimoToque ≥ 18 dias` (contado a partir do E2, se já enviado) → entra na lista "pronto para E3"
- Respeita o checklist de `contexto/plano-campanha-brevo.md` (pula opt-out, não interessado, em conversa)

**Saída:** lista no terminal (empresa, e-mail, qual toque enviar, template sugerido de `templates/funil-followup-templates.md`) — o usuário dispara manualmente pelo painel do Brevo.

**Registro do envio:** manual, por decisão explícita do usuário (mais controle, sem risco de o sistema marcar como enviado por engano). O usuário atualiza `dataUltimoToque` no lead depois de enviar — sem essa ação, o lead continua aparecendo na consulta seguinte.

## O que fica sem mudança

- Modelo de dados em Markdown para leads (`leads/leads-*.md`) e seu formato de campos.
- `data/clientes-atuais.json` e `data/nao-contatar.json` como guarda-corpo obrigatório.
- Integração Brevo (`BrevoClient`, comandos `radar:registrar-aprovados`, `radar:listar-aprovados`, `radar:enviar-aprovados`, `radar:aberturas`, `radar:auditar-brevo`) — só muda quem dispara a aprovação (CLI em vez de painel), não a lógica de envio/dedup em si.
- `contexto/plano-campanha-brevo.md` como definição da sequência de toques e responsabilidades Brevo-vs-manual.

## Riscos e limitações conhecidas

- **Volume de processamento:** `Estabelecimentos*.zip` somado passa de 20M+ linhas; a agregação de "nº de filiais por CNPJ" precisa ser feita com streaming (não carregar tudo em memória de uma vez), já que o script atual usa `readline` linha a linha — validar que o padrão atual escala para essa agregação sem OOM.
- **Amostra de calibração pequena:** 13 clientes-espelho (e só 10-11 com confiança alta) é pouco para generalizar limiares com robustez estatística — aceito nesta fase como ponto de partida, não como validação definitiva.
- **DNL Comércio, Owens-Illinois, Crown Embalagens** têm CNPJ ambíguo — não usar para calibração até resolver manualmente.
- **Roteamento por unidade (REC vs MGA)** fica fora de escopo desta spec — mencionado como necessidade futura, não implementado agora.
