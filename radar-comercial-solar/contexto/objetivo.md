# Objetivo

Construir um radar comercial para identificar empresas dos nichos solar/fotovoltaico e industrial/agro/bebidas (Perfil A e Perfil B — ver seção "Escopo" abaixo) com potencial de contratar serviços da Phenyx Logística.

## Pergunta central

Quais empresas parecem com os clientes atuais e mostram sinais concretos de necessidade de:

- Transporte recorrente
- Distribuição regional ou nacional
- Coleta e entrega B2B
- Armazenagem
- Apoio operacional em picos de volume

## Resultado esperado

Ter um fluxo simples, repetível e documentado para:

- Encontrar empresas parecidas com clientes-espelho
- Qualificar melhor os leads antes da abordagem
- Priorizar quem tem mais chance de ter dor logística real
- Organizar histórico de análise para o comercial

## Escopo (rewrite 2026-08-24)

Dois perfis ativos desde o início, cobrindo clientes novos apenas (a carteira atual da Phenyx não é alvo de prospecção nesta ferramenta):

- **Perfil A — Solar/Nordeste**: escopo original, validado pelos clientes-espelho Sol Copérnico e Solfácil.
- **Perfil B — Industrial/agro/bebidas/Sul-Sudeste**: perfil novo, validado pelos clientes-espelho Ambev, Coamo, Owens-Illinois, Crown, Trigobel, Camil, Spal, HNK BR Indústria.

Ver `docs/superpowers/specs/2026-08-24-radar-comercial-rewrite-design.md` para o design completo.

## Segmentos excluídos permanentemente

- **Químico** — incompatível com a operação de armazenagem da Phenyx
- **Alimentício** — incompatível com a operação de armazenagem da Phenyx

**Nota:** essa exclusão vale para a oferta de armazenagem. Leads alimentícios do Perfil B (transporte recorrente) não estão bloqueados por esta regra — ver `inteligencia/fontes-estruturadas-industrial.md`.

Perfil B (industrial/agro/bebidas) já é foco atual — ver seção Escopo acima. Outros segmentos além dos dois perfis ativos podem ser incluídos em fases futuras.

## Fora do escopo desta fase

- Disparo automatizado (envio agendado/em lote sem gatilho humano — o envio via painel Brevo é sempre disparado manualmente por uma pessoa)
- Scraping ou automação pesada
