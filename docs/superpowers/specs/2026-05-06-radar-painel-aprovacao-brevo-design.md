# Spec de Design — Painel Local de Aprovação Brevo para radar-comercial-solar

Data: 2026-05-06
Status: Rascunho para revisão do usuário

## Objetivo

Evoluir o `radar-comercial-solar` com um painel web local simples para revisão visual dos leads em `data/fila-revisao.json`, permitindo aprovar manualmente contatos para a lista Brevo `Consulta Software` sem duplicar clientes já enviados.

O painel deve:

- mostrar a fila de revisão com os principais dados já coletados
- permitir editar apenas `e-mail` e `telefone` antes do envio
- bloquear envio sem `e-mail` válido
- bloquear duplicidade por `e-mail` ou `telefone`
- consultar também o Brevo antes do envio
- manter o lead visível na fila com status operacional derivado

## Escopo

Esta fase deve:

- adicionar um painel local acessado no navegador via `localhost`
- reutilizar `data/fila-revisao.json` como fonte principal da revisão
- criar um histórico operacional local para tentativas e envios Brevo
- usar `.env` local do projeto para configuração Brevo
- enviar contatos aprovados para uma lista fixa do Brevo
- manter rastreabilidade de sucesso, duplicidade e erro

Esta fase não deve:

- criar CRM completo
- permitir escolha manual de lista ou campanha no momento da aprovação
- editar nome da empresa, site, cidade, score ou demais campos do lead
- substituir o pipeline atual de CLI
- introduzir banco de dados
- automatizar disparo de e-mail, WhatsApp ou cadência comercial

## Decisões aprovadas

- o fluxo visual acontecerá dentro do próprio `comercial-clientes`, no projeto `radar-comercial-solar`
- a origem dos leads continua sendo `data/fila-revisao.json`
- a lista Brevo é fixa: `Consulta Software`
- os únicos campos editáveis antes do envio são `e-mail` e `telefone`
- a lista principal deve mostrar: empresa/site, score/potencial, cidade/UF, sinais encontrados, contato encontrado e motivo da análise
- após envio bem-sucedido, o lead continua visível na fila
- não pode haver repetição de cliente por `e-mail` ou `telefone`
- a comparação local considera apenas contatos já enviados ao Brevo por este software
- o painel também deve consultar o Brevo antes de enviar
- se o contato já existir no Brevo, o envio é bloqueado como duplicado
- se a consulta ao Brevo falhar, o envio é bloqueado

## Experiência do usuário

O usuário abre um painel local por comando dedicado, por exemplo:

```bash
npm run radar:painel
```

O painel abre uma interface simples com duas áreas:

1. lista principal de leads
2. painel lateral ou seção de detalhes do lead selecionado

### Lista principal

Cada linha deve mostrar, sem abrir detalhes:

- empresa
- site
- score
- potencial
- cidade/UF
- sinais encontrados em forma resumida
- e-mail encontrado
- telefone encontrado
- motivo curto da análise
- status operacional atual

### Detalhe do lead

Ao selecionar um item, o painel mostra:

- dados completos que vieram da fila
- `e-mail` editável
- `telefone` editável
- histórico operacional resumido do item, se houver
- botão `Aprovar e enviar`

Comportamento esperado:

- lead `pendente`: pode ser enviado
- lead `erro`: pode ser reenviado após ajuste
- lead `duplicado`: pode ser reavaliado e reenviado somente se `e-mail` ou `telefone` mudarem e deixarem de colidir
- lead `enviado`: continua visível, mas a ação principal fica desabilitada por padrão

## Arquitetura recomendada

Como o projeto hoje é CLI em TypeScript puro, sem frontend existente e sem dependências web, a solução recomendada é um painel local mínimo com Node nativo.

### Forma do painel

- servidor local simples em Node
- HTML/CSS/JavaScript leve servido pelo próprio projeto
- sem framework frontend nesta fase
- sem build separado de frontend

### Script de execução

O painel deve usar `.env` local diretamente no comando de execução, evitando dependência extra de `dotenv`.

Exemplo esperado:

```bash
node --env-file=.env --experimental-strip-types src/panel/server.ts
```

### Blocos recomendados

- `PanelServer`: sobe o servidor local e expõe rotas HTTP mínimas
- `ReviewQueueReader`: lê `data/fila-revisao.json`
- `BrevoDeliveryStore`: lê e grava o histórico operacional em JSON
- `ContactNormalizer`: normaliza `e-mail` e `telefone`
- `LocalDuplicateChecker`: compara contra envios locais bem-sucedidos
- `BrevoContactChecker`: consulta o Brevo por `e-mail` e `telefone`
- `BrevoContactSender`: envia o novo contato para a lista fixa
- `PanelViewComposer`: combina fila + histórico para gerar o estado visual final

## Fontes de dados

### 1. `data/fila-revisao.json`

Continua sendo a fonte canônica dos leads que precisam decisão humana.

Esse arquivo permanece somente leitura para o painel.

Motivo:

- ele já é regenerado pelo pipeline
- misturar status operacional nele faria o sistema perder estado manual a cada nova rodada

### 2. `data/brevo-envios.json`

Novo artefato operacional do painel.

Esse arquivo deve ser append-only, registrando tentativas em vez de sobrescrever estado antigo. O status atual de cada lead será derivado da tentativa mais recente.

Campos mínimos esperados por tentativa:

- `attemptId`
- `leadId`
- `attemptedAt`
- `companyName`
- `website`
- `emailOriginal`
- `emailNormalizado`
- `telefoneOriginal`
- `telefoneNormalizado`
- `statusEnvio` com valores `enviado`, `duplicado`, `erro`
- `duplicateSource` com valores `local` ou `brevo`, quando aplicável
- `duplicateIdentifierType` com valores `email` ou `telefone`, quando aplicável
- `duplicateIdentifierValue`
- `brevoContactId`, quando existir
- `brevoListId`
- `brevoListLabel`
- `payloadEnviado`, quando houver envio
- `errorCode`, quando houver erro
- `errorMessage`, quando houver erro

Esse histórico também serve para preencher novamente `e-mail` e `telefone` editados ao reabrir o painel.

## Estado visual derivado

O painel não usa apenas o status sugerido da fila. Ele monta um estado operacional derivado combinando:

- `data/fila-revisao.json`
- `data/brevo-envios.json`

Status visuais finais:

- `pendente`
- `enviado`
- `duplicado`
- `erro`

Regra de resolução:

- sem histórico operacional: `pendente`
- última tentativa com `statusEnvio = enviado`: `enviado`
- última tentativa com `statusEnvio = duplicado`: `duplicado`
- última tentativa com `statusEnvio = erro`: `erro`

## Normalização dos identificadores

### E-mail

Normalização local:

- `trim`
- `lowercase`

O painel deve bloquear envio quando o `e-mail` estiver ausente ou inválido.

### Telefone

Normalização local:

- remover caracteres não numéricos
- se vier com 11 dígitos brasileiros, prefixar `55`
- se já vier com `55` e 13 dígitos, manter
- persistir no formato internacional sem máscara, por exemplo `5511999999999`

Esse formato segue a mesma direção da integração já existente no projeto de referência citado pelo usuário.

## Regras de duplicidade

### Camada 1 — histórico local

A primeira validação compara os identificadores normalizados contra `data/brevo-envios.json`.

Somente tentativas com `statusEnvio = enviado` entram na deduplicação local.

Se houver coincidência por:

- `emailNormalizado`
- ou `telefoneNormalizado`

o sistema bloqueia o envio e grava nova tentativa com:

- `statusEnvio = duplicado`
- `duplicateSource = local`

### Camada 2 — Brevo

Se a camada local não encontrar duplicidade, o painel consulta o Brevo antes de criar o contato.

Endpoints relevantes segundo a documentação da Brevo:

- `GET /v3/contacts/{identifier}?identifierType=email_id`
- `GET /v3/contacts/{identifier}?identifierType=phone_id`
- `POST /v3/contacts`

Regra:

- se `e-mail` existir, consultar por `email_id`
- se `telefone` existir, consultar por `phone_id`
- resposta `200` em qualquer consulta significa duplicidade no Brevo
- resposta `404` significa identificador não encontrado
- qualquer falha diferente de `404` bloqueia o envio

Se houver duplicidade externa, o painel grava:

- `statusEnvio = duplicado`
- `duplicateSource = brevo`

Se a consulta falhar por rede, timeout, autenticação ou erro inesperado da API, o painel grava:

- `statusEnvio = erro`
- `errorCode = erro_consulta_brevo`

e não envia o contato.

## Envio para o Brevo

O envio só acontece quando:

- o `e-mail` é válido
- não há duplicidade local
- não há duplicidade no Brevo
- a consulta prévia ao Brevo conclui sem erro

### Configuração em `.env`

Variáveis mínimas recomendadas:

- `BREVO_API_KEY`
- `BREVO_LIST_ID_CONSULTA_SOFTWARE`
- `PANEL_PORT` opcional

### Payload mínimo recomendado

Como esta fase quer minimizar dependências operacionais, o payload deve usar apenas os campos realmente úteis e já seguros para a conta Brevo.

Exemplo recomendado:

```json
{
  "email": "contato@empresa.com",
  "attributes": {
    "SMS": "5511999999999",
    "COMPANY": "Empresa Exemplo"
  },
  "listIds": [123],
  "updateEnabled": false
}
```

Observações:

- `SMS` é opcional quando o telefone não existir
- `COMPANY` deve receber o nome da empresa do lead
- `updateEnabled` permanece `false`, porque duplicados serão bloqueados antes do `POST`
- atributos customizados adicionais podem ser adicionados depois, mas não são necessários nesta fase

## Fluxo de ponta a ponta

1. o pipeline atual gera ou atualiza `data/fila-revisao.json`
2. o usuário abre o painel local
3. o painel lê a fila e o histórico operacional
4. o painel compõe a visão derivada de cada lead
5. o usuário escolhe um item e revisa os dados coletados
6. o usuário ajusta apenas `e-mail` e `telefone`, se necessário
7. ao clicar em `Aprovar e enviar`, o sistema valida `e-mail`
8. o sistema normaliza `e-mail` e `telefone`
9. o sistema checa duplicidade local contra envios bem-sucedidos
10. se passar, o sistema consulta o Brevo por `e-mail` e `telefone`
11. se passar nas duas checagens, o sistema envia o contato para a lista `Consulta Software`
12. o sistema registra a tentativa em `data/brevo-envios.json`
13. o lead continua aparecendo na fila com status operacional atualizado

## Tratamento de erro

### Sem e-mail válido

- bloqueia a ação antes da chamada externa
- mostra erro de validação no painel

### Duplicado local

- não consulta o `POST /contacts`
- registra tentativa com `duplicateSource = local`

### Duplicado no Brevo

- não chama o `POST /contacts`
- registra tentativa com `duplicateSource = brevo`

### Erro na consulta ao Brevo

- bloqueia o envio
- registra `statusEnvio = erro`
- registra `errorCode = erro_consulta_brevo`

### Erro no envio ao Brevo

- registra `statusEnvio = erro`
- registra `errorCode = erro_envio_brevo`
- preserva payload e mensagem retornada pela API

## Testes necessários

### Composição da fila

- montar corretamente a visão a partir de `fila-revisao.json` + `brevo-envios.json`
- reaproveitar `e-mail` e `telefone` da última tentativa quando existirem

### Normalização e deduplicação local

- comparar `e-mail` sem diferença de caixa
- comparar telefone com e sem máscara
- bloquear por `e-mail`
- bloquear por `telefone`
- ignorar tentativas locais que não terminaram em `enviado`

### Consulta ao Brevo

- tratar `200` como duplicado
- tratar `404` como não encontrado
- tratar `401`, `429`, `5xx` e timeout como erro bloqueante

### Envio ao Brevo

- gerar payload mínimo correto
- usar a lista fixa do `.env`
- persistir tentativa bem-sucedida com `statusEnvio = enviado`

### Fluxo visual

- lead novo aparece como `pendente`
- lead enviado aparece como `enviado`
- lead duplicado aparece como `duplicado`
- lead com falha aparece como `erro`
- lead sem `e-mail` válido não pode ser enviado

## Critérios de aceite

Esta fase será considerada pronta quando:

- existir comando para subir o painel local
- o painel listar os leads de `data/fila-revisao.json` com os campos aprovados pelo usuário
- o painel permitir editar apenas `e-mail` e `telefone`
- existir `data/brevo-envios.json` como histórico operacional append-only
- a deduplicação local usar somente contatos já enviados com sucesso
- existir consulta ao Brevo por `e-mail` e `telefone` antes do envio
- duplicidades locais ou no Brevo bloquearem novo cadastro
- falha de consulta ao Brevo bloquear o envio
- envio com sucesso registrar o lead e mantê-lo visível na fila com status `enviado`
- a solução não exigir banco de dados nem framework frontend nesta fase

## Ordem recomendada de implementação

1. criar contrato do histórico operacional `data/brevo-envios.json`
2. implementar normalização de `e-mail` e `telefone`
3. implementar deduplicação local por contatos enviados
4. implementar cliente Brevo para consulta de contato
5. implementar cliente Brevo para criação de contato
6. implementar composição do estado visual derivado
7. subir servidor local e interface web simples
8. conectar ação `Aprovar e enviar`

## Próxima etapa após aprovação

Depois da aprovação desta spec, a implementação deve começar pela base operacional e pelo servidor local mínimo, mantendo o pipeline atual intacto e adicionando o painel como camada separada.
