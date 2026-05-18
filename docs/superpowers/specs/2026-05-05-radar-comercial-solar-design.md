# Spec de Design — radar-comercial-solar

Data: 2026-05-05
Status: Aprovada para implementacao da Parte 1

## Objetivo

Criar uma base operacional em Markdown para inteligência comercial e prospecção no nicho solar/fotovoltaico da Phenyx Logística.

O foco da primeira etapa não é enviar mensagens nem automatizar disparos. O foco é responder, com mais consistência:

- Quais empresas parecem com os clientes atuais ou referências conhecidas
- Quais delas mostram sinais de dor logística recorrente
- Quais merecem entrar no funil comercial qualificado

## Escopo da Parte 1

O projeto nasce como um repositório de trabalho em Markdown, organizado para uso manual no Cursor.

Esta fase deve:

- Centralizar contexto do negócio e clientes-espelho
- Definir nichos prioritários
- Registrar sinais de potencial logístico
- Definir um score simples de qualificação
- Padronizar prompts de análise de leads
- Organizar a separacao entre leads brutos, qualificados e descartados

Esta fase nao deve:

- Criar frontend
- Criar integração com Brevo
- Criar automação de disparo
- Criar software operacional completo

## Estrutura proposta

O projeto deve ser criado com a seguinte estrutura:

```text
radar-comercial-solar/
├─ README.md
├─ contexto/
│  ├─ objetivo.md
│  ├─ perfil-phenyx.md
│  └─ clientes-espelho.md
├─ inteligencia/
│  ├─ nichos-prioritarios.md
│  ├─ sinais-de-potencial.md
│  ├─ regras-score.md
│  └─ palavras-chave-de-busca.md
├─ leads/
│  ├─ leads-brutos.md
│  ├─ leads-qualificados.md
│  └─ leads-descartados.md
├─ prompts/
│  ├─ analisar-cliente-espelho.md
│  ├─ analisar-lead.md
│  ├─ comparar-com-clientes-atuais.md
│  └─ gerar-abordagem.md
└─ templates/
   ├─ abordagem-email.md
   ├─ abordagem-whatsapp.md
   └─ follow-up.md
```

## Clientes-espelho iniciais

O radar deve usar estas referências como base inicial de comparação:

- FOTUS Distribuidora
- Solfácil
- Sol Copérnico
- Gradiente Solar
- DNL Comércio

Essas referências servem para encontrar empresas parecidas em operação, nicho, tipo de produto e possível dor logística.

## Prioridade comercial inicial

O radar deve priorizar empresas com sinais de operação recorrente envolvendo produto físico.

O maior peso do score deve sempre estar na evidência de operação recorrente com produto físico. Isso inclui sinais como estoque, pronta entrega, distribuição, expedição, centros de distribuição, catálogo de produtos, venda recorrente B2B e entrega regional ou nacional.

Prioridade mais alta:

- Distribuidoras solares
- Revendas de material elétrico com linha solar

Prioridade secundaria:

- Integradoras solares grandes
- Marketplaces e ecossistemas solares
- Energia por assinatura e geração compartilhada

Financiamento solar, energia por assinatura, marketplace puro e geração compartilhada devem ser tratados como baixa prioridade nesta fase, salvo quando houver sinal claro de estoque, distribuição, expedição, entrega ou outra operação física relevante.

## Geografia e polos de preferencia

O filtro geográfico inicial não deve limitar o radar a cidades específicas.

O criterio correto e:

- Buscar empresas em qualquer região relevante do Brasil
- Dar peso maior a leads que estejam próximos de polos já importantes para a operação

Polos operacionais iniciais:

- Cabo de Santo Agostinho
- Maringá
- Barueri/Alphaville

## Logica de qualificacao

O fluxo manual inicial deve funcionar assim:

1. Encontrar uma empresa do setor solar ou adjacente
2. Coletar nome, site, cidade, segmento e descricao encontrada
3. Colar os dados no prompt de análise
4. Avaliar semelhança com clientes-espelho, nicho, sinais e dor logística
5. Estimar score e classificar potencial
6. Registrar o lead em bruto, qualificado ou descartado

## Inteligência mínima obrigatória

Os arquivos de inteligência devem cobrir quatro funções:

- `nichos-prioritarios.md`: onde procurar primeiro
- `sinais-de-potencial.md`: o que observar em cada empresa
- `regras-score.md`: como pontuar de forma consistente
- `palavras-chave-de-busca.md`: como gerar listas e pesquisas futuras
- `leads/*.md`: como registrar leads de forma padronizada, com campos mínimos obrigatórios

## Papel dos prompts

Os prompts devem transformar a IA em um analista comercial com foco logístico.

Eles precisam apoiar pelo menos quatro tarefas:

- Entender por que um cliente-espelho é relevante
- Analisar um novo lead
- Comparar uma empresa com clientes atuais
- Gerar uma abordagem inicial coerente com o contexto

## Resultado esperado da Parte 1

Ao fim desta etapa, a equipe deve ter:

- Um projeto organizado para inteligência comercial no nicho solar
- Um critério repetível de qualificação
- Um fluxo manual simples e claro para novos leads
- Um acervo inicial pronto para evoluir para semiautomação depois

## Riscos e limites desta fase

- O score inicial será heurístico, não estatístico
- Alguns leads bons podem parecer medianos por falta de informação pública
- Nichos indiretos podem gerar boas indicações, mesmo sem dor logística imediata
- O acervo precisa ser mantido com disciplina para nao virar lista solta

## Proxima etapa apos aprovacao

Depois da aprovação desta spec, o trabalho segue para:

1. Criar a estrutura de pastas e arquivos
2. Preencher os arquivos com o conteúdo inicial definido
3. Deixar a base pronta para uso manual no Cursor

## Critérios de aceite da Parte 1

A Parte 1 será considerada concluída quando:

- A pasta `radar-comercial-solar/` existir com a estrutura aprovada
- Todos os arquivos iniciais estiverem criados e preenchidos com conteúdo útil
- O README explicar objetivo, escopo, fluxo manual e critérios de aceite
- Os arquivos de inteligência deixarem claro que o maior peso do score é a evidência de operação recorrente com produto físico
- Os arquivos diferenciarem claramente alta prioridade de baixa prioridade no nicho solar
- Os arquivos de leads trouxerem um modelo padrão de registro com estes campos:
  Empresa, Site, Cidade/UF, Segmento, Fonte, Descrição encontrada, Sinais logísticos, Cliente espelho mais parecido, Potencial, Score estimado, Motivo da classificação, Canal sugerido, Próxima ação e Status
- Não houver frontend, integração com Brevo ou automação de disparo nesta fase
