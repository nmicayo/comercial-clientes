# Simulações — Uso de `analisar-lead.md`

Este arquivo mostra como a equipe pode usar `prompts/analisar-lead.md` no dia a dia.

Todos os exemplos abaixo são fictícios.

## Como ler estas simulações

Cada simulação mostra:

- Dados de entrada do lead
- Prompt aplicado
- Resposta esperada da IA
- Score estimado
- Justificativa do score
- Decisão final
- Próxima ação recomendada

## Simulação 1 — Lead de alto potencial

### Cenário

Empresa fictícia com sinais fortes de operação recorrente com produto físico.

### Dados de entrada do lead

- Empresa: Atlas Solar Distribuição
- Site: https://exemplo-ficticio-atlassolar.com.br
- Cidade/UF: Barueri/SP
- Segmento: Distribuidora solar
- Fonte: Exemplo fictício para teste manual do fluxo
- Descrição encontrada: Distribuidora de equipamentos fotovoltaicos com atendimento a integradores, pronta entrega e portfólio de módulos, inversores, estruturas e kits solares.
- Produtos/serviços: Módulos fotovoltaicos, inversores, kits solares, estruturas de fixação e acessórios
- Canal de contato: E-mail comercial
- Observações: Atuação em polo relevante e sinais claros de distribuição B2B

### Prompt aplicado

```md
# Prompt — Analisar Lead

Você é um analista comercial especializado em logística, transporte de cargas e armazenagem.

Analise a empresa abaixo com base nos clientes espelho:
- FOTUS Distribuidora
- Solfácil
- Sol Copérnico
- Gradiente Solar
- DNL Comércio

## Dados da empresa

Nome: Atlas Solar Distribuição
Site: https://exemplo-ficticio-atlassolar.com.br
Cidade/UF: Barueri/SP
Segmento: Distribuidora solar
Descrição encontrada: Distribuidora de equipamentos fotovoltaicos com atendimento a integradores, pronta entrega e portfólio de módulos, inversores, estruturas e kits solares.
Produtos/serviços: Módulos fotovoltaicos, inversores, kits solares, estruturas de fixação e acessórios
Canal de contato: E-mail comercial
Observações: Atuação em polo relevante e sinais claros de distribuição B2B

## Tarefa

Analise se essa empresa tem potencial para abordagem comercial da Phenyx Logística.

Regras importantes:
- O maior peso da análise deve estar na evidência de operação recorrente com produto físico
- Estoque, pronta entrega, expedição, entrega e distribuição valem mais do que branding ou tamanho aparente
- Financiamento solar, energia por assinatura, marketplace puro e geração compartilhada são baixa prioridade, salvo quando houver sinal claro de estoque, distribuição, expedição, entrega ou operação física

Avalie:
1. Se parece com algum cliente espelho
2. Qual nicho ela pertence
3. Quais sinais logísticos aparecem
4. Qual possível dor logística
5. Se o potencial é baixo, médio ou alto
6. Qual score estimado de 0 a 100
7. Qual seria o melhor argumento comercial
8. Se vale abordar por e-mail, WhatsApp, telefone ou formulário
9. Qual mensagem inicial sugerida
```

### Resposta esperada da IA

```md
Empresa: Atlas Solar Distribuição
Nicho: Distribuidora solar
Cliente espelho mais parecido: FOTUS Distribuidora
Sinais encontrados: Distribuidora de equipamentos solares; venda para integradores; pronta entrega; catálogo de produtos; operação B2B; mix de módulos, inversores e kits; entrega regional e nacional
Possível dor logística: Necessidade de transporte recorrente para abastecimento e distribuição, apoio em expedição, entregas para integradores e possível necessidade de armazenagem ou redistribuição entre polos
Potencial: Alto
Score: 93
Motivo da classificação: A empresa reúne os sinais mais fortes do radar. Há evidência clara de operação recorrente com produto físico, foco B2B, venda para integradores e indícios de logística estruturada. O peso principal vem da combinação de distribuição, pronta entrega e portfólio físico recorrente.
Canal recomendado: E-mail
Abordagem sugerida: Fazer contato destacando experiência com operações de transporte, distribuição e apoio logístico para empresas com pronta entrega e atendimento a integradores, conectando a conversa a picos de expedição, entregas regionais e cobertura operacional
Próxima ação: Registrar como lead qualificado e gerar abordagem inicial para contato comercial
```

### Score estimado

`93`

### Justificativa do score

- `+30`: é distribuidora solar
- `+25`: vende para integradores
- `+20`: trabalha com kits solares
- `+20`: trabalha com módulos ou inversores
- `+20`: menciona pronta entrega
- `+15`: atua em região operacional relevante
- `+5`: possui e-mail comercial público

Leitura prática:

- Mesmo sem mencionar explicitamente “centro de distribuição”, a soma de sinais físicos recorrentes já é forte o bastante para qualificação alta
- O lead não sobe por marca ou presença digital; ele sobe porque mostra operação física clara e repetível

### Decisão final

`Qualificado`

### Próxima ação recomendada

- Gerar abordagem com `prompts/gerar-abordagem.md`
- Registrar contato inicial por e-mail
- Priorizar abordagem por estar em `Barueri/SP`, que conversa com polo operacional relevante

### Como a equipe usaria no dia a dia

1. Copia os dados básicos do site ou LinkedIn da empresa.
2. Cola no prompt `analisar-lead.md`.
3. Confirma se os sinais físicos realmente aparecem no texto.
4. Se a resposta vier nessa linha, move para `leads-qualificados.md`.
5. Só depois disso gera abordagem.

---

## Simulação 2 — Lead ambíguo

### Cenário

Empresa fictícia de marketplace/ecossistema solar com relacionamento relevante no nicho, mas sem evidência clara de operação física própria.

### Dados de entrada do lead

- Empresa: SolarHub Conecta
- Site: https://exemplo-ficticio-solarhub.com.br
- Cidade/UF: São Paulo/SP
- Segmento: Marketplace / ecossistema solar
- Fonte: Exemplo fictício para teste manual do fluxo
- Descrição encontrada: Plataforma que conecta integradores, distribuidores e fornecedores do mercado solar, com vitrine de produtos e cadastro de parceiros.
- Produtos/serviços: Plataforma digital, vitrine de produtos, conexão entre parceiros do setor
- Canal de contato: Formulário e e-mail
- Observações: Atua no ecossistema certo, mas não deixa claro se opera estoque, retirada, entrega ou expedição própria

### Prompt aplicado

```md
# Prompt — Analisar Lead

Você é um analista comercial especializado em logística, transporte de cargas e armazenagem.

Analise a empresa abaixo com base nos clientes espelho:
- FOTUS Distribuidora
- Solfácil
- Sol Copérnico
- Gradiente Solar
- DNL Comércio

## Dados da empresa

Nome: SolarHub Conecta
Site: https://exemplo-ficticio-solarhub.com.br
Cidade/UF: São Paulo/SP
Segmento: Marketplace / ecossistema solar
Descrição encontrada: Plataforma que conecta integradores, distribuidores e fornecedores do mercado solar, com vitrine de produtos e cadastro de parceiros.
Produtos/serviços: Plataforma digital, vitrine de produtos, conexão entre parceiros do setor
Canal de contato: Formulário e e-mail
Observações: Atua no ecossistema certo, mas não deixa claro se opera estoque, retirada, entrega ou expedição própria

## Tarefa

Analise se essa empresa tem potencial para abordagem comercial da Phenyx Logística.

Regras importantes:
- O maior peso da análise deve estar na evidência de operação recorrente com produto físico
- Estoque, pronta entrega, expedição, entrega e distribuição valem mais do que branding ou tamanho aparente
- Financiamento solar, energia por assinatura, marketplace puro e geração compartilhada são baixa prioridade, salvo quando houver sinal claro de estoque, distribuição, expedição, entrega ou operação física

Avalie:
1. Se parece com algum cliente espelho
2. Qual nicho ela pertence
3. Quais sinais logísticos aparecem
4. Qual possível dor logística
5. Se o potencial é baixo, médio ou alto
6. Qual score estimado de 0 a 100
7. Qual seria o melhor argumento comercial
8. Se vale abordar por e-mail, WhatsApp, telefone ou formulário
9. Qual mensagem inicial sugerida
```

### Resposta esperada da IA

```md
Empresa: SolarHub Conecta
Nicho: Marketplace / ecossistema solar
Cliente espelho mais parecido: Solfácil
Sinais encontrados: Conexão com integradores, distribuidores e fornecedores; presença no ecossistema solar; vitrine de produtos; sem evidência clara de estoque, expedição, entrega ou operação física própria
Possível dor logística: Ainda indefinida. Pode existir apenas se a empresa também operar loja própria, distribuição, retirada ou apoio logístico interno para parceiros
Potencial: Médio/Baixo
Score: 42
Motivo da classificação: A empresa está no ecossistema certo e pode ser relevante como ponte comercial, mas o maior peso do radar é operação recorrente com produto físico. Como isso não está claro, o lead não deve ser tratado como oportunidade forte neste momento.
Canal recomendado: Formulário ou e-mail
Abordagem sugerida: Fazer contato exploratório e curto para validar se existe operação própria com estoque, expedição, entrega ou apoio logístico a parceiros, sem assumir dor logística antes dessa confirmação
Próxima ação: Manter em bruto/pendente e levantar mais evidências antes de qualificar
```

### Score estimado

`42`

### Justificativa do score

- `+15`: relacionamento com integradores e fornecedores pode indicar relevância comercial
- `+15`: atuação em região relevante
- `+5`: possui e-mail público
- `+5`: presença de vitrine de produtos
- `-15`: marketplace puro sem operação física aparente

Leitura prática:

- O score não cai para descarte total porque a empresa pode abrir portas no ecossistema
- O score também não sobe para qualificado porque falta o fator principal: operação recorrente com produto físico

### Decisão final

`Bruto/Pendente`

### Próxima ação recomendada

- Verificar se existe loja própria, centro de distribuição, retirada, entrega ou operação fulfillment
- Só mover para `leads-qualificados.md` se surgir evidência real de operação física
- Se continuar apenas como plataforma de conexão, manter como observação ou descartar da priorização ativa

### Como a equipe usaria no dia a dia

1. Encontra uma empresa interessante no ecossistema solar.
2. Preenche os dados e roda o prompt.
3. Observa que a IA não qualificou automaticamente só porque a empresa parece grande ou conectada.
4. Mantém o lead em `leads-brutos.md` enquanto busca prova de operação física.
5. Só avança para abordagem comercial mais forte depois dessa validação.

---

## Resumo operacional

Estas duas simulações mostram a calibragem esperada:

- Lead com distribuição, pronta entrega, integradores e produto físico recorrente sobe para qualificado
- Lead com ecossistema forte, mas sem prova de operação física, fica pendente

Essa diferença é o coração da Parte 1 do radar.
