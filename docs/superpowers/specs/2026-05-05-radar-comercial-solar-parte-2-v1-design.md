# Spec de Design — radar-comercial-solar Parte 2 V1

Data: 2026-05-05
Status: Rascunho para revisão do usuário

## Objetivo

Evoluir o `radar-comercial-solar` de uma base manual em Markdown para um pipeline híbrido de captação e qualificação de leads, mantendo a operação simples, auditável e usável no Cursor.

O foco da Parte 2 V1 é permitir:

- Gerar buscas automaticamente a partir de nichos, palavras-chave e regiões
- Receber resultados de forma manual ou semi-manual
- Normalizar e deduplicar leads
- Analisar sites quando houver URL
- Extrair sinais logísticos
- Aplicar score
- Gerar fila de revisão humana

## Escopo da Parte 2 V1

Esta fase deve entregar um pipeline funcional de ponta a ponta sem depender de API real de busca.

Esta fase deve:

- Definir contratos claros em `src/`
- Expor execução simples por CLI
- Persistir cada etapa em arquivos JSON conferíveis em `data/`
- Permitir origem intercambiável para os leads
- Implementar provider baseado em arquivo na V1
- Preparar um adaptador de API para a Parte 3 sem integração real obrigatória
- Incluir dados simulados mínimos para teste completo do pipeline

Esta fase não deve:

- Integrar Google Places ou outra API real de busca
- Criar frontend
- Criar integração com Brevo
- Criar automação de disparo
- Criar CRM
- Automatizar abordagem comercial

## Regra principal da arquitetura

O pipeline deve seguir esta lógica:

```text
entrada de leads
↓
normalização
↓
deduplicação
↓
análise do site
↓
extração de sinais
↓
score
↓
fila de revisão
```

Cada etapa deve gerar um arquivo conferível em `data/`.

## Estrutura alvo

```text
radar-comercial-solar/
├─ README.md
├─ contexto/
├─ inteligencia/
├─ prompts/
├─ templates/
├─ leads/
├─ data/
│  ├─ keywords.json
│  ├─ regioes.json
│  ├─ buscas-geradas.json
│  ├─ resultados-brutos.json
│  ├─ sites-analisados.json
│  ├─ leads-pontuados.json
│  ├─ fila-revisao.json
│  └─ exemplos/
│     └─ resultados-brutos.exemplo.json
├─ src/
│  ├─ cli.ts
│  ├─ config/
│  │  ├─ keywords.ts
│  │  └─ score-rules.ts
│  ├─ collectors/
│  │  ├─ generate-searches.ts
│  │  ├─ search-places.ts
│  │  └─ fetch-company-site.ts
│  ├─ analysis/
│  │  ├─ extract-signals.ts
│  │  ├─ score-lead.ts
│  │  └─ classify-lead.ts
│  ├─ review/
│  │  └─ review-queue.ts
│  └─ utils/
│     ├─ normalize-url.ts
│     └─ dedupe-leads.ts
└─ package.json
```

## Arquitetura do pipeline

A V1 deve combinar contratos claros com persistência simples em arquivos JSON.

Separação de responsabilidades:

- `src/`: contratos, regras e etapas do pipeline
- `data/`: artefatos intermediários e finais de cada etapa
- `cli.ts`: ponto de entrada operacional

O restante do pipeline não deve saber se o lead veio de arquivo manual, mock, API ou outra fonte. Essa abstração será garantida pelo contrato `SearchProvider`.

## Contratos mínimos

Os contratos principais em `src/` devem incluir:

- `SearchProvider`
- `RawLead`
- `AnalyzedLead`
- `ScoredLead`
- `ReviewLead`
- `LeadStatus`
- `LogisticSignal`

### Intenção de cada contrato

`SearchProvider`
- Responsável por retornar resultados padronizados para o pipeline

`RawLead`
- Lead cru vindo de arquivo, mock ou futura API

`AnalyzedLead`
- Lead com dados do site lido, resumo e sinais extraídos

`ScoredLead`
- Lead com score, justificativa e classificação

`ReviewLead`
- Lead final pronto para validação humana

`LeadStatus`
- Estado do lead ao longo do pipeline

`LogisticSignal`
- Sinal estruturado contendo nome, força e evidência textual

## Persistência em `data/`

Arquivos principais:

- `keywords.json`: palavras-chave e agrupamentos por nicho
- `regioes.json`: regiões e polos operacionais relevantes
- `buscas-geradas.json`: consultas produzidas pelo gerador
- `resultados-brutos.json`: entrada captada manualmente ou por provider
- `sites-analisados.json`: saída da leitura e enriquecimento de sites
- `leads-pontuados.json`: leads com sinais, score e classificação
- `fila-revisao.json`: fila final para revisão humana

Dados simulados mínimos obrigatórios:

- `data/exemplos/resultados-brutos.exemplo.json`

Esse arquivo deve permitir testar o pipeline de ponta a ponta sem depender de busca externa.

## Origem intercambiável dos leads

A V1 deve funcionar em modo híbrido.

Implementação esperada:

- `FileSearchProvider` na V1
- `ApiSearchProvider` ou `GooglePlacesSearchProvider` como stub ou adaptador preparado para a Parte 3

Na V1:

- o provider de arquivo deve ler dados preenchidos manualmente ou simulados
- o pipeline deve processar esses dados como se viessem de qualquer outra fonte

Na Parte 3:

- será possível plugar uma API real sem reescrever normalização, análise, score ou revisão

## Comandos da CLI

Comandos esperados:

- `radar:gerar-buscas`
- `radar:captar`
- `radar:analisar-sites`
- `radar:pontuar`
- `radar:revisar`

### Responsabilidade de cada comando

`radar:gerar-buscas`
- Lê `keywords.json` e `regioes.json`
- Gera combinações de consultas por nicho e região
- Grava em `buscas-geradas.json`

`radar:captar`
- Usa o provider configurado
- Na V1, lê arquivo manual ou simulado
- Normaliza entradas básicas
- Deduplica registros iniciais
- Grava em `resultados-brutos.json`

`radar:analisar-sites`
- Lê leads com URL válida
- Busca páginas do site quando possível
- Enriquecimento sem quebrar o pipeline em caso de falha
- Grava em `sites-analisados.json`

`radar:pontuar`
- Extrai sinais logísticos
- Aplica regras de score
- Classifica potencial
- Grava em `leads-pontuados.json`

`radar:revisar`
- Prepara a fila final de revisão humana
- Resume score, sinais, justificativa e próxima ação
- Grava em `fila-revisao.json`

### Resumo de execução no terminal

Cada comando da CLI deve exibir um resumo simples no terminal.

Exemplos:

- quantidade de buscas geradas
- quantidade de leads captados
- quantidade de sites analisados
- quantidade de leads pontuados
- quantidade de itens enviados para fila de revisão

O objetivo é tornar a execução transparente e fácil de acompanhar sem abrir imediatamente os arquivos.

## Regras de normalização e deduplicação

A deduplicação deve seguir uma ordem progressiva:

1. `website` normalizado
2. `companyName` normalizado + `city/state`
3. similaridade simples de nome quando não houver site

Quando houver conflito, o pipeline deve manter um registro consolidado e preservar contexto como:

- `sources`
- `matchedQueries`
- observações de origem

## Tratamento de erros

O pipeline não deve falhar inteiro por causa de um único lead ruim.

Casos esperados:

- sem URL válida: segue sem análise de site
- site indisponível: marca status e continua
- descrição insuficiente: score conservador
- dados contraditórios: envia para revisão humana

O comportamento padrão deve ser:

- continuar o processamento
- registrar a limitação
- empurrar dúvida para revisão humana

## Regra de score

O maior peso do score deve continuar na evidência de operação recorrente com produto físico.

Sinais com maior prioridade:

- estoque
- pronta entrega
- centro de distribuição
- expedição
- entrega regional ou nacional
- operação B2B
- venda para integradores
- catálogo físico recorrente

Sinais de baixa prioridade por padrão:

- marketplace puro
- financiamento solar
- energia por assinatura
- geração compartilhada

Esses casos só sobem de prioridade se houver evidência concreta de operação física.

## Revisão humana

A automação da V1 não deve tomar a decisão final sozinha.

`fila-revisao.json` deve destacar:

- dados consolidados
- sinais encontrados
- score
- justificativa resumida
- status sugerido
- próxima ação recomendada
- flags de atenção, como `sem_site`, `dados_insuficientes` e `ambiguidade_operacional`

Decisões humanas esperadas:

- qualificar
- manter pendente
- descartar

## Proteção contra sobrescrita silenciosa

Os comandos não devem apagar dados existentes de forma silenciosa.

Quando houver sobrescrita de arquivos em `data/`, o comportamento deve ser:

- previsível
- documentado
- protegido por backup simples ou estratégia equivalente

Exemplos aceitáveis:

- salvar `.bak` do arquivo anterior
- usar convenção documentada de sobrescrita com confirmação ou flag explícita

O importante é evitar perda silenciosa de dados intermediários ou de revisão.

## Critérios de aceite da Parte 2 V1

A Parte 2 V1 será considerada pronta quando:

- existir a estrutura `data/` e `src/` conforme o desenho aprovado
- existirem contratos claros para `SearchProvider`, `RawLead`, `AnalyzedLead`, `ScoredLead`, `ReviewLead`, `LeadStatus` e `LogisticSignal`
- os comandos `radar:gerar-buscas`, `radar:captar`, `radar:analisar-sites`, `radar:pontuar` e `radar:revisar` estiverem definidos e funcionando
- cada comando exibir um resumo simples da execução no terminal
- `FileSearchProvider` estiver implementado e utilizável na V1
- existir um provider de API apenas como stub ou adaptador preparado para a Parte 3
- cada etapa gerar seu arquivo conferível em `data/`
- existir um conjunto mínimo de dados simulados para teste completo do pipeline, incluindo `data/exemplos/resultados-brutos.exemplo.json`
- o pipeline funcionar com entradas manuais ou simuladas sem depender de busca externa
- o score priorizar operação recorrente com produto físico
- a saída final alimentar `fila-revisao.json` com justificativa e próxima ação
- os comandos não sobrescreverem arquivos de forma silenciosa
- não houver frontend, Brevo, CRM ou automação de disparo

## Limites da V1

- sem integração real com Google Places ou outra API
- sem scraping sofisticado
- sem infraestrutura complexa
- sem decisão automática final de abordagem
- sem envio de mensagens

## Próxima etapa após aprovação

Depois da aprovação desta spec, o trabalho pode seguir para implementação da Parte 2 V1 com:

1. estrutura `src/` e `data/`
2. contratos e tipos principais
3. CLI básica
4. provider de arquivo
5. pipeline mínimo funcional com dados simulados
