# radar-comercial-solar

Base operacional em Markdown para inteligência comercial e prospecção no nicho solar/fotovoltaico para a Phenyx Logística.

## Objetivo

Responder com mais consistência:

- Quais empresas parecem com clientes e referências já conhecidas
- Quais mostram sinais de dor logística recorrente
- Quais merecem entrar no funil comercial qualificado

## Escopo da Parte 1

Esta etapa foca em inteligência, qualificação e organização do fluxo comercial.

Inclui:

- Contexto do negócio e clientes-espelho
- Nichos prioritários
- Sinais de potencial logístico
- Regras de score
- Prompts de análise
- Registro manual de leads

Não inclui:

- Frontend
- Integração com Brevo
- Automação de disparo
- Envio automático de e-mails ou WhatsApp

## Referências iniciais

Clientes e referências usados como espelho:

- FOTUS Distribuidora
- Solfácil
- Sol Copérnico
- Gradiente Solar
- DNL Comércio

## Prioridade comercial

O maior peso do score deve estar na evidência de operação recorrente com produto físico.

Exemplos de sinais prioritários:

- Estoque
- Pronta entrega
- Centro de distribuição
- Expedição
- Entrega regional ou nacional
- Venda recorrente B2B
- Catálogo de produtos
- Atendimento a integradores, revendas ou instaladores

Baixa prioridade nesta fase:

- Financiamento solar
- Energia por assinatura
- Marketplace puro
- Geração compartilhada

Exceção:

- Esses modelos podem subir de prioridade quando houver sinal claro de estoque, distribuição, expedição, entrega ou outra operação física relevante.

## Polos de preferência

O radar pode buscar empresas em todo o Brasil, mas deve dar peso maior a empresas próximas de:

- Cabo de Santo Agostinho
- Maringá
- Barueri/Alphaville

## Estrutura

```text
radar-comercial-solar/
├─ README.md
├─ contexto/
├─ inteligencia/
├─ leads/
├─ prompts/
└─ templates/
```

## Fluxo manual sugerido

1. Encontrar uma empresa do setor solar ou adjacente.
2. Coletar nome, site, cidade/UF, segmento, descrição e fonte.
3. Usar `prompts/analisar-lead.md`.
4. Avaliar nicho, sinais logísticos, dor provável, score e canal sugerido.
5. Registrar em `leads/leads-brutos.md`, `leads/leads-qualificados.md` ou `leads/leads-descartados.md`.
6. Reaproveitar o histórico para refinar critérios e abordagem.

## Como testar o fluxo manualmente

1. Escolha uma empresa do setor solar, fotovoltaico ou adjacente.
2. Preencha os dados básicos: nome, site, cidade/UF, segmento, fonte e descrição encontrada.
3. Rode o prompt de análise em `prompts/analisar-lead.md`.
4. Compare o resultado com as regras em `inteligencia/regras-score.md`.
5. Mova o lead para `leads-brutos.md`, `leads-qualificados.md` ou `leads-descartados.md`.
6. Gere abordagem apenas se o lead for qualificado.

### Regra prática

- Se houver evidência clara de operação recorrente com produto físico, o lead tende a subir
- Se houver apenas ecossistema, assinatura ou intermediação sem operação física, o lead tende a cair
- Use os exemplos fictícios dos arquivos de leads como referência de calibragem inicial

## Critérios de aceite da Parte 1

A Parte 1 é aceita quando:

- A estrutura de pastas e arquivos estiver criada
- Os arquivos tiverem conteúdo inicial útil
- O fluxo manual de análise estiver documentado
- Os arquivos de inteligência reforçarem que o maior peso do score é a operação recorrente com produto físico
- Os nichos de baixa prioridade estiverem claramente sinalizados
- Os arquivos de leads tiverem modelo padrão de registro
- Não houver frontend, Brevo ou automação de disparo

## Próximos passos naturais

- Refinar palavras-chave e fontes de busca
- Alimentar a base com primeiros leads reais
- Ajustar score com base em respostas do time comercial
- Evoluir para semiautomação somente depois de validar o fluxo manual

## Pipeline V1

A Parte 2 V1 adiciona um pipeline híbrido em TypeScript com persistência em JSON.

Princípios:

- Contratos claros em `src/`
- Persistência conferível em `data/`
- CLI simples para cada etapa
- Sem API real de busca nesta fase
- Sem frontend, Brevo ou disparo

### Estado atual da Parte 3

A Parte 3 V1 já adiciona captação automática híbrida com algumas heurísticas práticas.

Hoje o comportamento real é este:

- `Bing` funciona como fonte principal de descoberta pública
- `DuckDuckGo` continua tentado como fonte auxiliar, mas pode responder com challenge anti-bot
- a descoberta já bloqueia anúncios, redirects, marketplaces e hubs/listagens mais óbvios
- a resolução de site oficial ainda é heurística e precisa de revisão humana depois
- o score continua priorizando evidência de operação recorrente com produto físico

Em outras palavras: a descoberta automática já ajuda a reduzir bastante o trabalho manual, mas ainda não substitui validação comercial.

### Estrutura nova

- `data/keywords.json`
- `data/regioes.json`
- `data/buscas-geradas.json`
- `data/resultados-brutos.json`
- `data/sites-analisados.json`
- `data/leads-pontuados.json`
- `data/fila-revisao.json`
- `data/exemplos/resultados-brutos.exemplo.json`
- `data/resultados-descoberta.json`
- `data/sites-resolvidos.json`
- `data/exemplos/resultados-descoberta.exemplo.json`
- `src/cli.ts`

### Comandos

Executar na pasta `radar-comercial-solar/`:

```bash
npm run radar:gerar-buscas
npm run radar:descobrir
npm run radar:resolver-sites
npm run radar:captar
npm run radar:captar-hibrido
npm run radar:analisar-sites
npm run radar:pontuar
npm run radar:revisar
npm run radar:rodar-v1
npm run radar:rodar-hibrido
npm run radar:registrar-aprovados
```

### O que cada comando faz

- `radar:gerar-buscas`: cruza nichos, palavras-chave e regiões
- `radar:descobrir`: tenta descobrir empresas via busca pública, registra bloqueios de engine e também aceita fixture
- `radar:resolver-sites`: tenta confirmar site oficial, ler páginas-chave e enriquecer os candidatos
- `radar:captar`: lê resultados manuais ou simulados, normaliza e deduplica
- `radar:captar-hibrido`: normaliza os sites resolvidos para o contrato de `resultados-brutos.json`
- `radar:analisar-sites`: usa mock de site ou tenta ler URL quando houver
- `radar:pontuar`: extrai sinais e aplica score
- `radar:revisar`: gera fila final de validação humana
- `radar:rodar-v1`: executa `captar -> analisar-sites -> pontuar -> revisar` e mostra um resumo consolidado
- `radar:rodar-hibrido`: executa `descobrir -> resolver-sites -> captar-hibrido -> analisar-sites -> pontuar -> revisar`
- `radar:registrar-aprovados`: lê aprovações manuais e registra os itens aprovados nos arquivos `leads/*.md`

### Como testar sem busca externa

1. Rode `npm run radar:gerar-buscas`.
2. Para testar com mock completo e deduplicação, rode:

```bash
npm run radar:rodar-v1 -- --input=data/exemplos/resultados-brutos.exemplo.json
```

   Ou edite manualmente `data/resultados-brutos.json` e rode as etapas separadas.
3. Confira os arquivos gerados em `data/`.

### Como testar a Parte 3 sem depender da web

1. Rode `npm run radar:gerar-buscas`.
2. Rode o fluxo híbrido com o fixture de descoberta:

```bash
npm run radar:rodar-hibrido -- --input=data/exemplos/resultados-descoberta.exemplo.json
```

3. Confira os artefatos:

- `data/resultados-descoberta.json`
- `data/sites-resolvidos.json`
- `data/resultados-brutos.json`
- `data/sites-analisados.json`
- `data/leads-pontuados.json`
- `data/fila-revisao.json`

Esse modo é útil para validar o pipeline completo quando você não quiser depender de rede ou de busca externa no momento.

### Como tentar a descoberta automática real

Para usar a descoberta automática sem fixture:

```bash
npm run radar:gerar-buscas
npm run radar:descobrir -- --max-searches=6 --per-source-limit=5
npm run radar:resolver-sites
npm run radar:captar-hibrido
npm run radar:analisar-sites
npm run radar:pontuar
npm run radar:revisar
```

Ou em fluxo único:

```bash
npm run radar:rodar-hibrido -- --max-searches=6 --per-source-limit=5
```

Observações:

- a V1 usa `Bing` como base prática de descoberta e tenta `DuckDuckGo` como fonte auxiliar
- quando o `DuckDuckGo` bloquear com challenge, isso aparece explicitamente no resumo
- a descoberta real depende de acesso à web no ambiente em que o comando for executado
- o sistema limita o volume por consulta para não virar um crawler agressivo
- o sistema já descarta anúncios, redirects, marketplaces e agregadores/hubs óbvios
- quando não houver confiança suficiente, o lead segue com flags como `site_nao_confirmado`, `empresa_ambigua` ou `dados_ralos`

### O que a descoberta já filtra

Na calibragem atual, `radar:descobrir` já tenta remover cedo:

- anúncios e redirects como `duckduckgo.com/y.js` e wrappers promocionais
- marketplaces como `Mercado Livre`, `Amazon`, `Shopee`, `OLX` e similares
- títulos promocionais como `Compre agora` ou `Melhores Ofertas`
- hubs/listagens como páginas de `melhores empresas`, comparadores e agregadores não-oficiais
- resultados genéricos sem aderência mínima ao nicho solar/fotovoltaico

Isso reduz ruído antes mesmo da resolução de site oficial.

### Limites atuais da descoberta

Mesmo com a limpeza atual, ainda existem limites conhecidos:

- alguns títulos ainda chegam genéricos demais e exigem melhor extração do nome real da empresa
- parte dos resultados ainda pode se concentrar em uma query/região mais forte que as demais
- a confirmação do site oficial ainda é baseada em heurística, não em integração confiável de API
- a revisão humana continua obrigatória antes de registrar ou abordar qualquer lead

### Executar etapa por etapa

Se preferir inspecionar o pipeline com mais granularidade:

```bash
npm run radar:captar -- --input=data/exemplos/resultados-brutos.exemplo.json
npm run radar:analisar-sites
npm run radar:pontuar
npm run radar:revisar
```

### Resumo no terminal

Cada comando imprime um resumo simples, como:

- buscas geradas
- candidatos descartados por política
- buscas bloqueadas por challenge
- leads captados
- sites analisados
- leads pontuados
- itens enviados para fila de revisão

### Auditoria pontual do Brevo

Para auditar o estado real do Brevo sem alterar configuracoes por padrao:

```bash
npm run radar:auditar-brevo
```

Comportamento esperado:

- abre um navegador Chromium compativel ja instalado no Windows
- reutiliza um perfil persistente em `data/brevo-audit/profile`
- pede login manual no Brevo se necessario
- tenta abrir as areas principais e cai para navegacao manual assistida quando nao conseguir
- gera artefatos em `data/brevo-audit/<timestamp>/`

Arquivos gerados:

- `report.md` com o relatorio da auditoria
- `raw-report.json` com a captura estruturada de cada etapa
- `screenshots/` com evidencias visuais

Para ver apenas o roteiro, sem abrir navegador:

```bash
npm run radar:auditar-brevo -- --dry-run
```

### Fila de revisão mais operacional

O arquivo `data/fila-revisao.json` agora também traz:

- `destinoSugerido`: qual arquivo de `leads/` faz mais sentido
- `resumoCurto`: leitura rápida para triagem humana
- `blocoMarkdown`: registro pronto para copiar para o arquivo final
- `reviewPriority`: prioridade operacional da revisão
- `reviewRank`: ordem sugerida para começar a revisão
- `reviewPriorityReasons`: por que esse item subiu ou caiu na fila
- `flags`: incertezas da descoberta, resolução e leitura inicial do site

Regra prática:

- `leads-qualificados.md` para casos qualificados
- `leads-brutos.md` para pendentes
- `leads-descartados.md` para baixa aderência
- revisar primeiro os itens com `reviewPriority: alta`

### Aprovar e registrar automaticamente

Use `data/aprovacoes-revisao.json` para indicar o que foi aprovado manualmente.

Formato:

```json
[
  {
    "leadId": "resultados-brutos-exemplo-json:1:atlas-solar-distribui-o",
    "aprovado": true
  }
]
```

Depois rode:

```bash
npm run radar:registrar-aprovados
```

Opcionalmente:

```bash
npm run radar:registrar-aprovados -- --approvals=data/exemplos/aprovacoes-revisao.exemplo.json
```

O comando:

- lê a fila de revisão
- filtra apenas itens aprovados
- usa `destinoSugerido` por padrão
- evita registrar duplicatas quando a empresa já estiver no arquivo
- cria backup `.bak` dos arquivos Markdown alterados

### Proteção contra sobrescrita

Quando um arquivo em `data/` é sobrescrito com conteúdo novo, a V1 salva um backup simples com extensão `.bak`.

## Painel local de aprovação Brevo

O projeto agora também tem um painel local para revisar visualmente a fila e aprovar contatos para a lista Brevo `Consulta Software`.

### Pré-requisitos

- `data/fila-revisao.json` já gerado pelo pipeline
- arquivo `.env` local com as variáveis Brevo

Exemplo de variáveis está em `.env.example`:

```bash
BREVO_API_KEY=sua_chave_brevo_aqui
BREVO_LIST_ID_CONSULTA_SOFTWARE=123456
PANEL_PORT=4173
```

### Subir o painel

Na pasta `radar-comercial-solar/` rode:

```bash
npm run radar:painel
```

O painel:

- mostra empresa/site, score, potencial, cidade/UF, sinais e contato coletado
- permite editar apenas `e-mail` e `telefone`
- checa duplicidade local por contatos já enviados
- consulta o Brevo antes de criar novo contato
- bloqueia envio se o contato já existir ou se a consulta ao Brevo falhar
- mantém o lead visível com status `pendente`, `enviado`, `duplicado` ou `erro`
