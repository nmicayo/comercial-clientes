# Spec de Design - Rodadas Manuais Amplas para radar-comercial-solar

Data: 2026-05-14
Status: Rascunho para revisao do usuario

## Objetivo

Definir o fluxo futuro de atualizacao da base de leads do `radar-comercial-solar` usando `rodadas manuais amplas`, sem automacao de disparo da coleta.

O objetivo desta spec e separar com clareza:

- o momento de `coleta e triagem`
- o momento de `entrada no Brevo`
- o momento de `acompanhamento comercial`

Com isso, o projeto deve conseguir ampliar a base ao longo do tempo sem misturar leads novos, leads redescobertos, pendencias antigas e contatos ja em funil.

## Problema atual

Hoje a operacao pratica tende a misturar tres camadas diferentes:

- a rodada de descoberta do radar
- a elegibilidade para envio ao Brevo
- a vida comercial do contato depois que ele entrou na campanha

Sem uma separacao explicita por rodada, ficam mais dificeis perguntas como:

- esta coleta foi boa ou ruim?
- o radar esta saturando Pernambuco?
- quantos leads realmente novos sairam desta rodada?
- quais empresas seguem reaparecendo sem avancar?

## Escopo

Esta fase deve:

- manter a coleta como acao manual
- manter a coleta com escopo amplo
- tratar cada execucao como uma `rodada` identificavel
- separar o dominio da rodada do dominio do funil comercial
- definir o fechamento minimo de cada rodada com snapshot proprio
- preservar a regra de nunca reenviar contato que ja existe no Brevo

Esta fase nao deve:

- automatizar scheduler de coleta
- tornar a coleta dirigida por nicho como padrao
- reabrir automaticamente contatos ja existentes no Brevo
- fazer a rodada gerir contatos que ja estao no funil
- substituir o fluxo comercial atual no Brevo

## Decisoes aprovadas

- novas coletas continuam manuais
- o padrao de coleta continua amplo
- a abordagem recomendada e `rodada manual ampla com snapshot`
- o funil comercial continua continuo e separado da rodada
- contatos reencontrados em novas rodadas nao devem ser reabertos se ja existirem no Brevo

## Estrutura geral da rodada

Cada rodada manual ampla passa a ter seis momentos:

1. `Preparar a rodada`
2. `Rodar coleta ampla`
3. `Triar o resultado da rodada`
4. `Enviar entrada nova para o Brevo`
5. `Acompanhar pendencias da rodada`
6. `Fechar a rodada`

O objetivo operacional e simples:

- o funil comercial continua rodando em paralelo
- a coleta alimenta o topo desse funil
- cada rodada deixa memoria propria para nao depender de lembranca humana depois

## Separacao entre rodada e funil

### Rodada

Rodada e o evento de coleta, enriquecimento curto, triagem e decisao de entrada.

Estados principais da rodada:

- `novo_elegivel`
- `duplicado_brevo`
- `pendente_enriquecimento`
- `pendente_revisao`
- `descartado`

### Funil

Funil e a vida comercial do contato depois que ele entrou no Brevo.

Estados principais do funil:

- `entrou_na_lista`
- `em_cadencia_e1_e2_e3`
- `lead_quente`
- `proposta_enviada`
- `nurturing`
- `fechado_ganho`
- `fechado_perdido`

### Regra central

A rodada nao tenta gerir o que ja esta no funil.

Se um lead reaparecer em nova coleta e ja existir no Brevo:

- ele e marcado como `duplicado_brevo`
- ele nao volta para a lista de entrada
- ele nao reinicia cadencia
- ele nao reabre o trabalho comercial automaticamente

Isso protege o funil de redescobertas repetidas da mesma empresa.

## Gatilho da rodada

O disparo de nova rodada continua manual.

Nao deve existir, por padrao:

- scheduler
- gatilho por data
- gatilho automatico por esgotamento da base
- gatilho automatico por marco do funil

Quem decide abrir nova rodada e o operador.

## Escopo da rodada

Quando a decisao de rodar uma nova coleta for tomada, o padrao continua sendo `rodada ampla`.

Isso significa:

- revarrer os nichos e regioes ativos
- deixar a triagem posterior decidir o que sobe
- usar o filtro de duplicidade e elegibilidade para impedir reentrada indevida

Nao e necessario, nesta fase, transformar a coleta em rodada dirigida por nicho como comportamento padrao.

## Snapshot da rodada

Cada execucao manual ampla deve ter um `roundId` proprio.

Exemplos validos:

- `2026-05-14-ampla-01`
- `2026-05-14T18-40-00`

No fechamento, a rodada deve salvar um snapshot proprio.

### Conteudo minimo do snapshot

Parametros usados:

- `max-searches`
- nichos ativos
- regioes ativas
- limiar de envio

Metricas minimas:

- leads descobertos
- alto potencial
- medio potencial
- baixo potencial
- enviados
- duplicados Brevo
- duplicados locais
- pendentes
- descartados

Listas derivadas da rodada:

- elegiveis novos
- duplicados
- pendentes de enriquecimento
- pendentes de revisao
- descartados

O objetivo do snapshot nao e burocracia. O objetivo e tornar comparavel o desempenho de cada rodada.

## Fluxo operacional futuro

### 1. Decidir abrir rodada

Acao manual do operador.

Sem scheduler e sem disparo automatico.

### 2. Executar rodada ampla

Fluxo esperado:

```bash
npm run radar:gerar-buscas        # so se keywords/regioes mudarem
npm run radar:rodar-hibrido -- --max-searches=60
npm run radar:listar-aprovados -- --min-potential=baixo
```

### 3. Separar o resultado

Depois da rodada, o resultado deve ser lido em grupos operacionais:

- prontos para envio
- duplicados Brevo ou locais
- sem e-mail
- pendentes de revisao humana
- descartados

### 4. Fazer enriquecimento curto se necessario

Quando a rodada trouxer bons candidatos incompletos, o operador pode fazer enriquecimento curto, por exemplo:

- buscar e-mail manual de contas muito boas
- revisar leads medios fortes
- ajustar score ou filtro quando um padrao ruim aparecer

### 5. Enviar so entrada realmente nova

Fluxo esperado:

```bash
npm run radar:enviar-aprovados -- --min-potential=baixo
```

Esse envio deve continuar respeitando a regra da spec de deduplicacao global:

- contato que ja existe no Brevo nunca reenviar

### 6. Salvar snapshot da rodada

Ao final da rodada, registrar:

- resumo
- metricas
- listas derivadas
- observacoes uteis

### 7. Voltar ao acompanhamento comercial

Depois do envio, a operacao volta para o dominio do funil:

- monitorar cadencia
- responder lead quente
- acompanhar proposta
- mover para nurturing quando aplicavel

## Artefatos recomendados

Esta spec recomenda introduzir um armazenamento proprio por rodada em algo como:

- `data/rodadas/<roundId>/resumo.json`
- `data/rodadas/<roundId>/novos-elegiveis.json`
- `data/rodadas/<roundId>/duplicados.json`
- `data/rodadas/<roundId>/pendentes.json`
- `data/rodadas/<roundId>/descartados.json`

Opcionalmente, a rodada pode gerar tambem:

- um resumo em markdown para leitura rapida
- um registro resumido no Obsidian

O importante nao e o nome exato do arquivo. O importante e que cada rodada deixe memoria propria e reutilizavel.

## Beneficios esperados

Com esse desenho, o projeto passa a responder melhor:

- se a base de PE ainda esta rendendo
- se os nichos novos estao trazendo contato realmente novo
- quanto da rodada vira entrada real de campanha
- quais empresas seguem voltando sem gerar avanco

Tambem reduz a confusao entre:

- lead novo de verdade
- lead redescoberto
- pendencia antiga
- contato ja em cadencia

## Criterios de aceite

Esta projecao e aceita quando:

- a coleta continua manual
- a coleta continua ampla
- cada execucao passa a ser tratada como rodada identificavel
- rodada e funil ficam conceitualmente separados
- o envio ao Brevo continua restrito a contatos realmente novos
- cada rodada gera snapshot suficiente para comparacao futura
- o fechamento da rodada nao depende de memoria informal do operador

## Fora de escopo

- automacao de agenda para novas coletas
- rodada dirigida como padrao obrigatorio
- reabertura automatica de contatos ja existentes
- reformulacao total do funil comercial
- analise estatistica avancada de performance historica
