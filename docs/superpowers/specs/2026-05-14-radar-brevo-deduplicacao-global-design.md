# Spec de Design — Deduplicação Global Brevo para radar-comercial-solar

Data: 2026-05-14
Status: Rascunho para revisão do usuário

## Objetivo

Evoluir o `radar-comercial-solar` para que nenhum contato seja reenviado ao Brevo quando já existir como contato na conta, mesmo que apareça novamente em novas rodadas do radar.

Além disso, a operação deve deixar de tratar a lista de entrada da campanha como base histórica. A lista de entrada deve servir apenas para contatos realmente novos, evitando que e-mails antigos sejam considerados novamente em novos disparos.

## Problema atual

Hoje existem diferenças de comportamento entre os pontos de envio:

- `src/panel/send-approved.ts` consulta o Brevo apenas por `e-mail`
- `src/panel/panel-service.ts` consulta o Brevo por `e-mail` e `telefone`
- `src/panel/list-approved.ts` decide status só com base no histórico local

Na prática, isso cria três problemas:

- um lead pode parecer pronto na listagem, mas ser barrado no envio real
- CLI e painel não seguem exatamente a mesma regra
- a lista de entrada do Brevo pode misturar contatos novos com contatos antigos da própria operação

## Escopo

Esta fase deve:

- aplicar a mesma regra de deduplicação em CLI e painel
- bloquear envio quando o contato já existir no histórico local ou no Brevo
- consultar o Brevo por `e-mail` e também por `telefone` quando houver telefone válido
- melhorar a leitura operacional de `listar-aprovados`
- preservar rastreabilidade em `data/brevo-envios.json`
- redefinir o papel da lista Brevo como fila de entrada de novos contatos

Esta fase não deve:

- criar suporte para reenviar contatos antigos em campanhas futuras
- criar múltiplas listas por lote ou campanha
- substituir o funil comercial já existente
- mexer no pipeline de descoberta, score ou revisão
- criar banco de dados

## Decisões aprovadas

- se o contato já existir no Brevo, ele nunca deve ser reenviado
- existência no Brevo deve ser verificada por `e-mail` e por `telefone`, quando houver
- a regra deve valer tanto para `npm run radar:enviar-aprovados` quanto para o painel
- a lista Brevo de prospecção deve ser tratada como lista de entrada, não como base histórica
- contatos que entrarem na cadência devem sair da lista de entrada logo no início do workflow
- o histórico local `data/brevo-envios.json` continua sendo mantido como trilha operacional append-only

## Regra operacional alvo

Fluxo alvo por contato:

1. o radar encontra o lead
2. o sistema normaliza `e-mail` e `telefone`
3. o sistema valida bloqueios e formato mínimo
4. o sistema verifica duplicidade no histórico local
5. o sistema consulta o Brevo por `e-mail`
6. o sistema consulta o Brevo por `telefone`, quando houver
7. se qualquer checagem acusar duplicidade, registra `duplicado` e encerra
8. se nenhuma checagem acusar duplicidade, cria o contato no Brevo e adiciona à lista de entrada

Regra final:

- contato já existente no Brevo morre para novas campanhas deste radar

## Arquitetura recomendada

### Checagem central de elegibilidade

Criar um ponto único de decisão para envio, reutilizado por:

- `src/panel/send-approved.ts`
- `src/panel/panel-service.ts`
- `src/panel/list-approved.ts`

Esse bloco deve encapsular toda a regra de elegibilidade operacional antes do envio.

Saídas esperadas da checagem:

- `pronto_para_enviar`
- `duplicado_local`
- `duplicado_brevo_email`
- `duplicado_brevo_telefone`
- `email_invalido`
- `bloqueado`
- `erro_consulta_brevo`

Essa centralização elimina divergência entre CLI e painel e evita que a listagem mostre um lead como pronto quando o envio real o barraria.

### BrevoClient

`src/panel/brevo-client.ts` continua sendo a fronteira da API externa.

Nesta fase ele deve continuar responsável por:

- consultar contato por `e-mail`
- consultar contato por `telefone`
- criar contato

Não é necessário criar suporte a remoção de lista pelo código nesta fase, porque o esvaziamento da lista de entrada será tratado no workflow do Brevo.

## Mudanças por arquivo

### `src/panel/send-approved.ts`

Deve deixar de tomar decisões locais parciais e passar a depender da checagem central.

Comportamento esperado:

- usa a checagem central antes de qualquer tentativa de criação
- registra `duplicado` de forma uniforme
- consulta Brevo por `e-mail` e `telefone`
- nunca cria contato quando a checagem indicar bloqueio ou duplicidade

### `src/panel/panel-service.ts`

Deve reutilizar a mesma checagem central usada pela CLI.

Comportamento esperado:

- o botão de envio toma a mesma decisão da CLI
- o status operacional derivado passa a refletir a regra consolidada
- sincronizações automáticas de duplicado com o Brevo usam a mesma interpretação

### `src/panel/list-approved.ts`

Deve passar a refletir o estado operacional mais fiel ao envio real.

Nesta fase, `listar-aprovados` não fará consulta remota em massa ao Brevo. A listagem continuará sendo baseada em validação local, histórico operacional e regras de bloqueio já conhecidas.

Estados desejados na visualização:

- `✓ pronto`
- `duplicado local`
- `já existe no Brevo`
- `bloqueado`
- `sem e-mail`
- `erro de consulta`

Nesta leitura, `✓ pronto` significa "elegível localmente e apto para tentativa de envio", ainda sujeito à checagem remota final de duplicidade no momento do envio. Se no futuro houver necessidade de pré-checagem remota em lote, isso deve entrar como etapa separada.

## Regras de deduplicação

### Camada 1 — histórico local

O histórico local continua sendo `data/brevo-envios.json`.

Devem ser considerados impeditivos locais os registros com:

- `statusEnvio = enviado`
- `statusEnvio = duplicado`

Quando houver coincidência por `emailNormalizado` ou `telefoneNormalizado`, o resultado deve ser `duplicado_local`.

### Camada 2 — Brevo

Se a checagem local não barrar, o sistema consulta o Brevo:

1. `e-mail`
2. `telefone`, quando houver telefone válido

Regras:

- resposta `200` para `e-mail` gera `duplicado_brevo_email`
- resposta `200` para `telefone` gera `duplicado_brevo_telefone`
- resposta `404` significa que o identificador não existe
- qualquer falha diferente de `404` gera `erro_consulta_brevo`

Se a consulta ao Brevo falhar, o sistema não envia no escuro.

## Histórico operacional

`data/brevo-envios.json` continua append-only.

Os registros de tentativa devem continuar preservando:

- identificadores originais e normalizados
- status final da tentativa
- origem da duplicidade quando houver
- `brevoContactId` quando disponível
- payload de envio quando houver criação real
- erro técnico quando houver falha

O objetivo do arquivo continua sendo:

- rastreabilidade
- deduplicação local
- reconstrução de estado operacional do painel

## Fluxo operacional no Brevo

### Papel da lista

A lista `BREVO_LIST_ID_PROSPECCAO_ARMAZENAGEM_PE` passa a ser tratada como lista de entrada de novos contatos.

Ela não deve representar todo o histórico da campanha.

### Workflow recomendado

Quando um novo contato entra na lista:

1. o workflow da campanha é disparado
2. o contato recebe uma tag operacional, por exemplo `cadencia-armazenagem-pe-ativa`
3. o contato é removido da lista de entrada
4. a cadência E1/E2/E3 segue controlada pelo próprio workflow e pelas tags

Esse desenho mantém a lista de entrada limpa para novas rodadas.

### Validação operacional obrigatória

Antes de considerar essa etapa concluída em produção, executar um teste com 1 contato real ou de teste para confirmar:

- o workflow dispara ao entrar na lista
- a remoção da lista de entrada não interrompe a cadência
- o contato continua seguindo E1/E2/E3 normalmente

Se esse teste falhar por limitação do Brevo, a implementação de código desta spec continua válida, e o ajuste operacional do Brevo deve ser redesenhado em uma spec separada. Nesta fase, porém, o desenho assumido é remover o contato da lista de entrada logo no início do workflow.

## Tratamento de erros

- `e-mail` ausente ou inválido: não envia
- contato bloqueado em `nao-contatar`: não envia
- duplicado local: não envia
- duplicado no Brevo por `e-mail`: não envia
- duplicado no Brevo por `telefone`: não envia
- falha de consulta no Brevo: não envia
- falha na criação do contato: registra `erro`

Princípio desta fase:

- nenhuma falha externa deve resultar em envio incerto

## Critérios de aceite

Esta mudança é aceita quando:

- CLI e painel usam a mesma regra de elegibilidade para envio
- `send-approved.ts` consulta Brevo por `e-mail` e `telefone`
- nenhum contato existente no Brevo é reenviado
- `brevo-envios.json` continua registrando duplicidade com origem consistente
- `listar-aprovados` deixa de sinalizar como pronto algo que o histórico já sabe que será barrado
- a lista de entrada do Brevo passa a ser usada apenas para contatos novos
- o workflow do Brevo é validado com remoção do contato da lista de entrada sem quebrar a cadência

## Testes recomendados

1. Envio com e-mail novo

- esperado: cria contato e registra `enviado`

2. Envio com e-mail já existente no Brevo

- esperado: registra `duplicado` sem criar contato

3. Envio com telefone já existente no Brevo

- esperado: registra `duplicado` sem criar contato

4. Envio com e-mail inválido

- esperado: registra `erro` ou bloqueio local sem chamar criação

5. Comparação CLI x painel

- esperado: ambos tomam a mesma decisão para o mesmo lead

6. Teste operacional do workflow

- esperado: contato entra no workflow, sai da lista de entrada e continua na cadência

## Fora de escopo

- reativação manual de contatos antigos em campanhas futuras
- múltiplas listas por segmento, lote ou rodada
- gerenciamento de campanhas históricas dentro do radar
- sincronização reversa do Brevo para o pipeline de leads
