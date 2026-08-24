# Spec de Design — Rewrite do radar-comercial-solar

Data: 2026-08-24
Status: Aprovada para implementação
Substitui: [[2026-05-05-radar-comercial-solar-design]] (Parte 1) e a evolução não-documentada das Partes 2/3 (pipeline TS, descoberta híbrida via Bing/DuckDuckGo)

## Contexto e diagnóstico

O projeto original nasceu focado só no nicho solar/fotovoltaico (praça PE, campanha "Armazenagem PE"). Cresceu organicamente além do escopo documentado (a Parte 1 dizia explicitamente "sem scraping, sem Brevo nesta fase"; a Parte 3 já tinha os dois) até um pipeline de 10+ comandos CLI (`radar:gerar-buscas`, `radar:descobrir`, `radar:resolver-sites`, `radar:captar-hibrido`, `radar:pontuar`, `radar:revisar`, etc.) usando scraping de Bing/DuckDuckGo via Playwright.

Diagnóstico confirmado pelo usuário (não é hipótese):

1. **Descoberta trazia ruído.** `leads/leads-brutos.md` tem entradas como "Loja de tecido", "Palma Parafusos e Ferramentas", "JR Agropecuária" misturadas com leads solares reais. De todo o volume gerado, só ~5 leads sobreviveram como qualificados de verdade.
2. **Pouco output real** mesmo rodando o pipeline inteiro.
3. **Nunca virou rotina** — o projeto ficou pronto mas não foi operado de forma consistente. A fricção de lembrar/rodar 10 comandos em sequência é um fator direto disso.

A campanha Brevo que saiu desse radar (E1 para 22 contatos em 2026-05-12) gerou conversas mas nenhum fechamento — não dá pra saber ainda se o problema era a oferta/fechamento ou a qualidade dos 22 leads, mas a característica do lead pool (gerado pelo pipeline ruidoso) é suspeita.

## Objetivo do rewrite

Substituir a descoberta automática por scraping genérico por curadoria estruturada de alta precisão, e eliminar a fricção operacional que impediu o projeto de virar hábito — sem descartar o que já funcionava (modelo de dados em Markdown, painel local de aprovação Brevo).

## Mudança de escopo: dois perfis desde o início

Diferente da Parte 1 original (só solar/PE), o rewrite nasce cobrindo os dois perfis de cliente validados por dados reais de operação (relatório SSW "CTRCs Expedidos e Recebidos", período 01/08–24/08/2026):

- **Perfil A — Energia solar / Nordeste (last-mile capilar).** Perfil original do projeto, validado pelos clientes-espelho reais Sol Copérnico e Solfácil (68% do volume de CTRCs do período analisado).
- **Perfil B — Industrial/agro/bebidas / Sul-Sudeste (rotas recorrentes).** Perfil novo, validado pelos clientes-espelho reais Ambev, Coamo Agroindustrial, Owens-Illinois, Crown Embalagens, Trigobel, Camil, Spal Indústria, HNK BR Indústria.

**Nota sobre o Perfil B e a exclusão de alimentício:** `contexto/objetivo.md` original exclui permanentemente os segmentos Químico e Alimentício por incompatibilidade com a operação de **armazenagem** da Phenyx. Os clientes-espelho do Perfil B (Ambev, Camil, Trigobel) são, na prática, clientes de **transporte/frete recorrente**, não de armazenagem. O rewrite trata isso como interpretação explícita: a exclusão de alimentício/químico continua valendo para oferta de armazenagem, mas não bloqueia prospecção de transporte recorrente nesses segmentos. Esse ponto deve ser confirmado por quem decide a oferta comercial antes do primeiro contato real com um lead do Perfil B do ramo alimentício.

**Escopo do Nicolas:** clientes novos apenas — recorrente (Perfil A e B) e operações pontuais/spot. A carteira atual de clientes não é alçada dele e nenhum lead descoberto pode ser um cliente já ativo (checagem obrigatória contra `data/clientes-atuais.json`).

## O que é descartado

- `src/collectors/*` — scraping de Bing/DuckDuckGo via Playwright
- Resolução heurística de site oficial
- Comandos: `radar:gerar-buscas`, `radar:descobrir`, `radar:resolver-sites`, `radar:captar-hibrido`, `radar:rodar-hibrido`, `radar:pontuar` (score numérico automatizado por keyword)
- `data/buscas-geradas.json`, `data/resultados-brutos.json`, `data/sites-analisados.json`, `data/sites-resolvidos.json`, `data/resultados-descoberta.json` e seus `.bak` — artefatos do pipeline antigo, sem valor fora dele

## O que fica (não foi o problema)

- Modelo de dados em Markdown: `leads/leads-brutos.md`, `leads/leads-qualificados.md`, `leads/leads-descartados.md`, com o mesmo formato de registro já validado (campos: Empresa, Site, Cidade/UF, Segmento, Fonte, Descrição encontrada, Sinais logísticos, Cliente espelho mais parecido, Potencial, Score estimado, Motivo da classificação, Canal sugerido, Próxima ação, Status + campos de campanha)
- `data/clientes-atuais.json` e `data/nao-contatar.json` como guarda-corpo obrigatório antes de qualquer registro ou contato
- Painel local de aprovação Brevo (`src/panel`) — dedupe local, consulta à API do Brevo antes de criar contato, bloqueio se contato já existir. Mantido como está; ferramenta de CRM/e-mail (Brevo) não muda nesta fase (ver decisão registrada abaixo).
- `inteligencia/regras-score.md` como critério de julgamento — deixa de ser aplicado por regex/keyword e passa a ser aplicado por leitura real (ver próxima seção)

**Decisão sobre ferramenta de CRM/e-mail:** avaliado trocar Brevo por HubSpot; descartado porque o plano free do HubSpot não inclui automação/sequência multi-etapa (fica atrás do Sales Hub pago), enquanto o Brevo free já inclui automação real (até 2.000 contatos por workflow — muito acima do volume atual). Fica no Brevo. Revisitar essa decisão separadamente do radar caso um limite específico volte a ser um bloqueio real.

## Fontes de descoberta (substituindo o scraping)

Descoberta deixa de ser "buscar tudo na web e filtrar depois" e passa a ser "começar de listas onde a chance de ruído já é baixa":

**Perfil A — Solar:**
- Listas de associados ABSOLAR (Associação Brasileira de Energia Solar Fotovoltaica) e ABGD (Associação Brasileira de Geração Distribuída)
- Diretórios setoriais (ex: Canal Solar e portais equivalentes de distribuidoras)
- Listas de expositores de feiras do setor (ex: Intersolar South America)
- WebSearch dirigido por nicho + região, só como complemento quando as listas acima não cobrirem uma região/nicho específico

**Perfil B — Industrial/agro/bebidas:**
- Diretórios de federações/sindicatos setoriais (FIESP, FIEP, ABIA — alimentação, ABRABE — bebidas, OCB — cooperativas agro)
- Busca direcionada por concorrentes/parceiros dos clientes-espelho reais (Ambev, Coamo, Owens-Illinois, Crown, Trigobel, Camil, Spal, HNK) via WebSearch
- WebSearch dirigido por nicho + região (PR/MG/SP/RJ/DF, rotas já operadas pela Phenyx)

Essas fontes ficam documentadas em dois arquivos novos de referência (não código): `inteligencia/fontes-estruturadas-solar.md` e `inteligencia/fontes-estruturadas-industrial.md`, cada um listando as fontes acima com link e observação de como consultar. Isso torna a descoberta repetível e auditável, em vez de depender de memória de quem está prospectando.

## Lógica de qualificação

Qualificação em duas etapas, pra não gastar leitura funda (e token) em candidato óbvio — de ruído ou de duplicidade:

**Etapa 1 — filtro barato (sem abrir o site do candidato):**

1. Não é cliente atual (`data/clientes-atuais.json`)?
2. Não está em `data/nao-contatar.json`?
3. **Não é contato já existente no Brevo** — checagem por domínio/e-mail via API do Brevo antes de prosseguir. Se já existe (de qualquer lista, não só da campanha atual), descarta aqui — não repete trabalho de qualificação em quem já está na base.
4. Passa num descarte rápido por título/snippet de busca (nicho obviamente errado, tipo "loja de tecido")?

Só quem sobrevive à Etapa 1 avança pra leitura funda.

**Etapa 2 — leitura real (por IA, não regex) só em quem sobrou:**

1. É do nicho certo (solar/fotovoltaico ou industrial-agro-bebidas conforme o perfil buscado)?
2. Tem sinal de operação física recorrente (estoque, CD, expedição, catálogo de produtos, atendimento B2B, entrega regional/nacional)?
3. Porte e região batem com o perfil (polos de preferência do Perfil A; rotas PR-MG-SP-RJ-DF do Perfil B)?

Só depois disso os critérios de `regras-score.md` são aplicados para estimar potencial e definir o registro em `leads-qualificados.md`, `leads-brutos.md` (pendente de mais info) ou `leads-descartados.md`.

## Fluxo operacional sob demanda

Sem CLI para lembrar de rodar. O fluxo passa a ser conversacional:

1. Nicolas pede um lote por perfil e critério (ex: "10 leads de distribuidora solar no Nordeste" ou "leads de indústria de bebidas no PR/SC").
2. A descoberta roda a partir das fontes estruturadas do perfil pedido (+ WebSearch se necessário).
3. Cada candidato é lido e qualificado conforme a seção acima.
4. Os registros são gravados diretamente nos arquivos `leads/*.md` existentes, no formato já validado.
5. Nicolas revisa o lote antes de qualquer contato (a revisão humana continua obrigatória — isso não muda).

Isso elimina a fila de revisão intermediária (`data/fila-revisao.json`) e o painel de "aprovações" separado do painel Brevo — a revisão acontece direto nos arquivos de leads, que já têm o campo `Status`.

## Validação de precisão (critério de aceite)

O rewrite só é considerado pronto quando:

- Um lote piloto de 15–20 candidatos por perfil (30–40 no total) for gerado e revisado manualmente por Nicolas
- A taxa de ruído óbvio (candidato claramente fora do nicho, tipo "loja de tecido") estiver próxima de zero — não apenas "menor que antes"
- Os arquivos `inteligencia/fontes-estruturadas-*.md` existirem e estiverem preenchidos com fontes reais e verificáveis (não fictícias)
- Nenhum candidato do lote piloto for cliente atual da Phenyx (checagem cruzada com `data/clientes-atuais.json` confirmada manualmente)
- Nenhum candidato do lote piloto já for contato existente no Brevo (checagem via API confirmada manualmente, incluindo os 22 contatos da campanha "Armazenagem PE" original)
- O fluxo sob demanda (sem comandos CLI de descoberta) tiver sido usado de ponta a ponta pelo menos uma vez por perfil

## Riscos e limites

- Fontes estruturadas (associações, sindicatos) podem ter cobertura desigual por região — pode ser necessário complementar com WebSearch mais do que o previsto inicialmente
- A leitura por IA é mais lenta por candidato que scraping em massa — o volume por lote será menor, mas a precisão deve compensar
- A interpretação sobre alimentício/armazenagem vs. transporte (seção "Mudança de escopo") precisa de confirmação de quem decide a oferta comercial antes do primeiro contato real com um lead desse tipo
- O painel Brevo e a decisão de manter Brevo como ferramenta não fazem parte da validação de precisão deste rewrite — são tratados como já resolvidos nesta spec

## Próxima etapa após aprovação

1. Criar `inteligencia/fontes-estruturadas-solar.md` e `inteligencia/fontes-estruturadas-industrial.md`
2. Remover o código e os artefatos de dados listados em "O que é descartado"
3. Atualizar `README.md` e `contexto/objetivo.md` para refletir os dois perfis e o fluxo sob demanda
4. Rodar o lote piloto de validação de precisão descrito acima
