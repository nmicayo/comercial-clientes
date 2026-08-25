# Fontes Estruturadas — Perfil B (Industrial/Agro/Bebidas)

Fontes de descoberta de alta precisão para o Perfil B, verificadas em 2026-08-24. Perfil novo nesta rewrite — validado pelos clientes-espelho reais confirmados no relatório SSW (Ambev, Coamo Agroindustrial, Owens-Illinois, Crown Embalagens, Trigobel, Camil, Spal Indústria, HNK BR Indústria).

## Federações e sindicatos setoriais

- **FIESP** (Federação das Indústrias do Estado de São Paulo) — mantém diretórios por sindicato setorial (ex: SIFESP, SINDIVIDRO, SINDILUX): https://www.fiesp.com.br/
- **FIEP** (Federação das Indústrias do Estado do Paraná): https://www.fiep.org.br/
- **ABIA** (Associação Brasileira da Indústria de Alimentos) — diretório de associadas: https://www.abia.org.br/associados
- **ABRABE** (Associação Brasileira de Bebidas): https://www.abrabe.org.br/
- **OCB** (Organização das Cooperativas Brasileiras) — Sistema OCB: https://somoscooperativismo.coop.br/institucional/ocb

## Como consultar

1. Abrir o diretório/sindicato relevante e listar candidatos com nome + site.
2. Aplicar a Etapa 1 (filtro barato) de `docs/superpowers/specs/2026-08-24-radar-comercial-rewrite-design.md` antes de ler qualquer site a fundo.
3. Complementar com busca direcionada por concorrentes/parceiros dos clientes-espelho reais (Ambev, Coamo, Owens-Illinois, Crown, Trigobel, Camil, Spal, HNK) via WebSearch.

## O que funcionou na prática (piloto 2026-08-25)

O piloto do Task 10 (lote de 20 candidatos investigados, 12 qualificados — ver `docs/superpowers/plans/2026-08-24-radar-rewrite-pilot-report.md`, seção 1) testou as 5 fontes institucionais acima como diretórios navegáveis de empresas. Resultado, fonte a fonte:

- **FIESP** — beco sem saída. Não foi possível localizar um diretório de associados navegável dentro do tempo da sessão; a página institucional não expõe lista de empresas.
- **FIEP** — beco sem saída. A página institucional lista apenas "105 sindicatos afiliados" em texto corrido, sem diretório de empresas navegável.
- **ABIA** — beco sem saída. A página `/associados` retornou erro de servidor (HTTP 500) ao WebFetch direto; a busca revelou apenas a contagem agregada (~107 associadas), sem lista extraível.
- **ABRABE** — **única fonte institucional que funcionou como diretório de verdade.** Lista navegável de 32 associadas (nome + site) direto no corpo da página institucional; rendeu um punhado de candidatos do lote (Companhia Müller de Bebidas, Refrigerantes Convenção via cruzamento, Grupo Thoquino, Dubar).
- **OCB** — beco sem saída como portal. Não expõe diretório de associados navegável; o que funcionou foi busca dirigida por "cooperativa agroindustrial" segmentada por estado (PR, MS), não o portal da OCB em si.

No total, **16 dos 20 candidatos investigados no lote vieram de busca dirigida por nicho + região via WebSearch** (ex.: "cooperativa agroindustrial Paraná distribuição insumos agrícolas atacado", "fábrica de rações animal atacado Paraná Santa Catarina distribuição", "indústria de laticínios Minas Gerais distribuição atacado fábrica", "indústria de embalagens PET plástico Paraná fornecedor bebidas alimentos") — não das 5 fontes institucionais listadas acima. Apenas ABRABE rendeu candidatos diretamente como diretório.

**Recomendação para próximas rodadas:** tratar a busca dirigida por nicho + estado-alvo (PR/SP/SC/MS/MG/RJ/DF) como método primário de descoberta para o Perfil B, não os diretórios institucionais. Consultar ABRABE quando o nicho for bebidas (única fonte institucional validada); FIESP, FIEP, ABIA e OCB podem ser tentados, mas não devem ser o ponto de partida — orçar pouco tempo neles antes de migrar para busca dirigida. Isso espelha o que o piloto do Perfil A encontrou com suas próprias fontes institucionais (ABSOLAR/ABGD fracas como diretórios navegáveis, busca dirigida por nicho + região rendendo a maior parte dos candidatos de qualidade) — ver `inteligencia/fontes-estruturadas-solar.md` e `.superpowers/sdd/2026-08-24-radar-comercial-rewrite/task-10-perfil-a-report.md`, seção 4.

## Cobertura da filial PR (obrigatório registrar por candidato)

O Perfil B é atendido pela filial Maringá/PR, que **não tem cobertura nacional**. Ao qualificar um candidato:

- Se ele está em **PR, SP, SC ou MS** → `region: "Sul-Sudeste (Perfil B) — cobertura direta PR"`, próxima ação normal.
- Se ele está em **qualquer outro estado** (MG, RJ, DF etc.) → continua sendo alvo válido, mas `region: "Sul-Sudeste (Perfil B) — cotação antecipada PR"` e "Próxima ação" deve dizer "Solicitar cotação antecipada à filial PR antes de fechar".

Essa regra vale só para a filial PR — não se aplica ao Perfil A (filial PE já tem cobertura própria validada no Nordeste).

## Nota sobre alimentício/armazenagem

`contexto/objetivo.md` exclui alimentício e químico permanentemente para a oferta de **armazenagem**. Leads deste perfil (Ambev, Camil, Trigobel são clientes-espelho de **transporte**, não de armazenagem) devem ser qualificados e abordados como oportunidade de transporte recorrente — confirmar com quem decide a oferta comercial antes do primeiro contato real com um lead alimentício.

## Clientes-espelho de referência

Ver `contexto/clientes-espelho.md`.
