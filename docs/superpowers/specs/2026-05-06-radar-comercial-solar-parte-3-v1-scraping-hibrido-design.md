# Spec de Design — radar-comercial-solar Parte 3 V1 Scraping Híbrido

Data: 2026-05-06
Status: Rascunho para revisão do usuário

## Objetivo

Evoluir o `radar-comercial-solar` para uma etapa de captação automática híbrida, capaz de:

- descobrir empresas a partir das buscas geradas
- combinar engine pública e diretórios como fontes de descoberta
- resolver qual URL parece ser o site oficial da empresa
- ler algumas páginas-chave do site oficial
- transformar esse material em leads brutos melhores
- alimentar o pipeline atual de pontuação e revisão sem mudar o contrato principal

O foco desta etapa não é contato comercial nem disparo. O foco é reduzir trabalho manual na coleta de empresas e enriquecer a base com dados mais úteis para score.

## Escopo da Parte 3 V1

Esta fase deve:

- usar descoberta automática a partir de consultas geradas
- combinar busca em engine pública e fallback em diretórios
- identificar site oficial por heurística simples
- ler poucas páginas de alto valor do site oficial
- gerar saídas conferíveis em JSON para cada etapa
- alimentar `resultados-brutos.json` no mesmo formato compatível com a Parte 2

Esta fase não deve:

- integrar API obrigatória de busca
- fazer crawling amplo ou sem limite
- automatizar contato comercial
- criar frontend
- criar integração com Brevo
- disparar mensagens

## Estratégia de descoberta

A estratégia aprovada para a V1 é híbrida:

1. buscar candidatos em engine pública
2. usar diretórios como fallback quando a descoberta vier fraca ou ambígua
3. consolidar candidatos antes de tentar resolver o site oficial

Essa escolha reduz dependência de uma fonte só e aumenta a chance de chegar ao domínio oficial da empresa.

## Escopo da coleta por empresa

Para cada empresa candidata, a V1 deve tentar obter:

- nome
- URL candidata
- snippet ou descrição curta
- cidade/UF quando possível
- fonte de descoberta
- confiança inicial da origem
- site oficial resolvido, quando possível
- leitura limitada de páginas do site oficial
- e-mail ou telefone se aparecer facilmente

## Fluxo arquitetural

O fluxo principal desta etapa deve ser:

```text
consultas geradas
↓
descoberta em engine pública e diretórios
↓
consolidação de candidatos
↓
resolução de site oficial
↓
leitura inicial do site
↓
normalização para resultados-brutos.json
↓
pipeline atual: analisar-sites -> pontuar -> revisar
```

## Novos blocos da arquitetura

### SearchDiscoveryProvider

Responsável por executar a descoberta inicial nas fontes escolhidas.

Deve retornar candidatos com:

- `query`
- `title`
- `url`
- `snippet`
- `sourceType`
- `sourceConfidence`

Nesta etapa ainda não existe um lead final. Existem apenas candidatos encontrados em busca.

### OfficialSiteResolver

Responsável por decidir qual URL parece ser o site oficial da empresa.

Deve:

- priorizar domínio próprio
- rebaixar agregadores, diretórios e páginas intermediárias
- preservar ambiguidade quando não houver segurança

Quando a resolução não for confiável, o item não deve ser descartado automaticamente. Ele deve seguir com flags de incerteza.

### SitePrimer

Responsável por entrar no site oficial e ler poucas páginas prováveis de alto valor.

Páginas-alvo da V1:

- home
- sobre
- produtos
- contato
- integradores
- soluções

Saída esperada:

- `resolvedWebsite`
- `companyName`
- `cityStateGuess`
- `contactEmail`
- `contactPhone`
- `summaryText`
- `pageFlags`

### LeadNormalizer

Responsável por transformar os dados descobertos e enriquecidos no mesmo contrato de `resultados-brutos.json` já aceito pelo pipeline atual.

O restante do sistema não deve precisar saber se o lead veio de preenchimento manual, mock ou scraping automático.

## Saídas em data/

Novos artefatos esperados:

- `data/resultados-descoberta.json`
- `data/sites-resolvidos.json`
- `data/resultados-brutos.json`

Esses arquivos devem ser conferíveis e compatíveis com a lógica de backup já usada na Parte 2.

## Limites de scraping

A V1 deve ser deliberadamente limitada.

### Limite de profundidade

Nada de crawler amplo.

Para cada empresa:

- ler apenas algumas páginas previsíveis
- parar cedo quando já houver evidência suficiente
- registrar flags quando o material for insuficiente

### Limite por consulta

Cada consulta deve trabalhar com volume controlado de candidatos por fonte.

Objetivo:

- reduzir ruído
- facilitar auditoria
- evitar scraping agressivo

### Registro de origem

Todo item deve preservar:

- consulta que o encontrou
- fonte de descoberta
- URL original
- confiança da origem

## Fallback e flags

Quando a descoberta vier ruim, o sistema não deve inventar dados.

Flags previstas:

- `site_nao_confirmado`
- `cidade_nao_confirmada`
- `dados_ralos`
- `empresa_ambigua`

Essas flags devem afetar a priorização posterior, mas não necessariamente impedir que o item siga para revisão.

## Compatibilidade com o pipeline atual

O contrato principal de `resultados-brutos.json` deve continuar estável.

Isso significa que:

- `analisar-sites`
- `pontuar`
- `revisar`
- `registrar-aprovados`

devem continuar funcionando sem refatoração estrutural por causa da origem automática dos leads.

## Regras de segurança e comportamento

- nada de envio de mensagens
- nada de CRM
- nada de frontend
- nada de scraping infinito
- nada de tomada de decisão final sem revisão humana

Quando houver baixa confiança, o sistema deve priorizar registrar a incerteza em vez de forçar um dado.

## Critérios de aceite da Parte 3 V1

A Parte 3 V1 será considerada pronta quando:

- existir descoberta automática a partir das buscas geradas
- existir combinação de engine pública com fallback em diretórios
- existir `resultados-descoberta.json` como saída intermediária
- existir resolução básica de site oficial com `sites-resolvidos.json`
- existir leitura inicial limitada de páginas do site oficial
- existir normalização para `resultados-brutos.json`
- o pipeline da Parte 2 continuar funcionando sem depender da origem do lead
- o sistema registrar flags quando não conseguir confirmar site, cidade ou dados mínimos
- não houver frontend, disparo, Brevo ou API obrigatória nesta fase

## Ordem recomendada de implementação

1. descoberta automática e persistência em `resultados-descoberta.json`
2. resolução de site oficial e persistência em `sites-resolvidos.json`
3. normalização para `resultados-brutos.json`
4. leitura inicial das páginas do site oficial
5. reaproveitamento completo do pipeline atual

## Próxima etapa após aprovação

Depois da aprovação desta spec, a implementação deve começar pela descoberta automática mínima e pelos contratos dos novos blocos, sem tentar resolver tudo em um único passo.
