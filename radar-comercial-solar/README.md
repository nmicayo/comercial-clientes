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
│  ├─ fontes-estruturadas-solar.md
│  └─ fontes-estruturadas-industrial.md
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
