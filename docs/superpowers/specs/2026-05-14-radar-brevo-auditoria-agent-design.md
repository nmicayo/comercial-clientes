# Spec de Design — Auditoria Pontual do Brevo por Agent para radar-comercial-solar

Data: 2026-05-14
Status: Rascunho para revisão do usuário

## Objetivo

Criar um fluxo pontual de auditoria assistida por agent para inspecionar o estado real do Brevo usado pelo `radar-comercial-solar`, sem alterar configurações por padrão.

O agent deve entrar no Brevo, navegar nas áreas relevantes do funil comercial e devolver um diagnóstico confiável do que está configurado hoje, comparando o estado real com o fluxo esperado documentado no projeto e no Obsidian.

## Escopo

Esta fase deve:

- auditar a cadência `E1 -> E2 -> E3`
- auditar listas e seus papéis reais
- auditar tags operacionais
- auditar duplicidade, reentrada e bloqueios
- auditar lead quente
- auditar proposta e pós-proposta
- registrar evidências e divergências encontradas
- produzir um relatório acionável para alinhamento do projeto

Esta fase não deve:

- virar componente recorrente do radar
- operar disparos automaticamente
- editar workflows, listas, tags ou campanhas por padrão
- substituir a lógica existente de integração por API
- criar automações permanentes de navegador

## Contexto do problema

Hoje o projeto possui documentação local do fluxo esperado no Brevo, mas isso não garante que a configuração real da conta esteja alinhada.

Os principais riscos são:

- workflow documentado diferente do workflow realmente ativo
- listas com função operacional diferente da assumida no projeto
- tags faltando, sobrando ou não usadas
- contatos antigos podendo reentrar em disparos novos
- automações de lead quente e proposta existindo só no papel

O agent desta spec existe para reduzir incerteza operacional antes de qualquer ajuste estrutural no código ou no Brevo.

## Decisões aprovadas

- o uso do agent será pontual, para auditoria e alinhamento
- o foco é `Brevo/navegador`
- o comportamento padrão do agent é `audit-only`
- o agent pode abrir telas, navegar, ler estados e registrar evidências
- o agent não deve alterar nada sem uma etapa posterior explícita
- a saída principal deve ser um relatório útil para o projeto, não só observações soltas

## Resultado esperado

Ao final da auditoria, o projeto deve conseguir responder com confiança:

- o que o Brevo está fazendo hoje
- o que está diferente do que foi documentado
- quais riscos operacionais existem agora
- quais correções devem vir primeiro

## Abordagem recomendada

A abordagem aprovada é um `agent de auditoria no navegador`.

Esse agent deve:

- usar a interface real do Brevo como fonte principal de verdade
- navegar pelas áreas críticas da operação
- observar e registrar o estado encontrado
- comparar com o fluxo esperado do projeto
- devolver diagnóstico estruturado

Essa abordagem foi escolhida porque o objetivo não é operação recorrente nem automação de clique em produção. O objetivo é inspeção fiel do estado vivo da ferramenta.

## Fluxo de auditoria

### Etapa 1 — Listas

O agent deve identificar todas as listas relevantes e mapear seu papel real.

Checagens mínimas:

- qual lista recebe leads novos do radar
- quais listas representam nurturing, proposta ou outros estados
- se a lista principal está sendo usada como fila de entrada ou depósito histórico
- se existem listas redundantes, abandonadas ou ambíguas

Saída esperada:

- nome da lista
- função real observada
- evidência da função
- risco, se houver

### Etapa 2 — Workflows

O agent deve abrir cada automação relevante do Brevo e mapear sua estrutura real.

Checagens mínimas:

- trigger inicial
- delays configurados
- condições e branches
- dependência de lista
- dependência de tag
- dependência de abertura, clique ou resposta
- ações finais de saída

Saída esperada:

- nome do workflow
- estado encontrado
- sequência lógica observada
- divergência em relação ao esperado

### Etapa 3 — Campanhas e templates

O agent deve confirmar o que existe de fato para `E1`, `E2` e `E3`.

Checagens mínimas:

- nome real dos templates ou campanhas
- se o vínculo com cada etapa da cadência está correto
- se existe template faltando ou nome quebrado
- se o conteúdo referenciado pela automação realmente existe

### Etapa 4 — Duplicidade e bloqueios

O agent deve auditar como o Brevo está se comportando na prática em relação a reentrada de contatos.

Checagens mínimas:

- se a lógica real depende de contato global, lista, tag ou remoção manual
- se contatos antigos podem reentrar em novos disparos
- se existe blacklist, opt-out ou exclusão operacional relevante
- se a estrutura atual favorece contaminação da lista de entrada

### Etapa 5 — Lead quente e proposta

O agent deve confirmar se o fluxo de interesse e pós-proposta existe de verdade.

Checagens mínimas:

- gatilho real para abertura ou clique
- existência de alerta interno
- existência de tag de lead quente
- existência de funil de proposta
- existência de follow-up pós-proposta

## Método de análise

Para cada item auditado, o agent deve registrar quatro blocos obrigatórios:

- `estado encontrado`
- `evidência`
- `impacto`
- `ação recomendada`

Esse formato é obrigatório para impedir que a auditoria termine em relato genérico ou opinativo demais.

## Limites do agent

Por padrão, o agent deve ser somente leitura.

Isso significa:

- pode abrir páginas
- pode expandir workflows
- pode seguir navegação interna
- pode coletar nomes, condições, delays, listas e estados
- pode registrar screenshots ou notas, se a ferramenta permitir

Isso não significa:

- salvar alterações
- mover contatos
- ativar ou pausar automações
- editar tags
- disparar campanhas

Se depois da auditoria o usuário quiser uma segunda etapa de correção assistida, isso deve ser tratado como fluxo separado.

## Entregáveis

O agent deve gerar materiais úteis para o projeto.

Entregáveis mínimos:

- relatório de auditoria
- mapa do funil real encontrado
- lista de divergências
- plano curto de correção

## Formato do relatório

O relatório final deve seguir esta estrutura:

1. visão geral do fluxo real encontrado
2. listas e seus papéis reais
3. workflows reais e suas condições
4. campanhas e templates encontrados
5. duplicidade, reentrada e bloqueios
6. lead quente
7. proposta e pós-proposta
8. divergências vs documentação do projeto
9. riscos prioritários
10. correções recomendadas

## Integração com o projeto

O resultado da auditoria deve ser salvo no projeto em forma de spec ou relatório em `docs/superpowers/specs/`.

Opcionalmente, o projeto pode manter também um checklist operacional derivado com correções aprovadas para execução posterior.

Esse agent não precisa alterar o código nesta fase. O objetivo é produzir clareza suficiente para que futuras mudanças no radar, no fluxo de envio ou no próprio Brevo sejam feitas com base em evidência.

## Critérios de aceite

Esta auditoria é aceita quando:

- o estado real da cadência `E1 -> E2 -> E3` estiver documentado
- o papel real de cada lista relevante estiver documentado
- o uso real de tags estiver documentado
- os mecanismos reais de duplicidade e reentrada estiverem documentados
- o fluxo de lead quente estiver confirmado ou negado com evidência
- o fluxo de proposta e pós-proposta estiver confirmado ou negado com evidência
- as divergências entre Brevo e documentação local estiverem listadas
- houver uma ordem clara de correção recomendada

## Riscos conhecidos

- a UI do Brevo pode mudar e dificultar a navegação do agent
- alguns estados podem depender de permissões da conta autenticada
- a ferramenta pode exigir confirmação humana para login ou segurança
- parte do comportamento real pode depender de contato de teste e não ficar totalmente visível só pela configuração

## Fora de escopo

- automação recorrente de operação do Brevo
- correção automática das divergências encontradas
- refatoração imediata do radar com base na auditoria
- criação de uma camada permanente de computer use para este projeto
