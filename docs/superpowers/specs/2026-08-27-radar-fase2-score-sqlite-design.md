# Spec de Design — Fase 2: Score Firmográfico via SQLite

Data: 2026-08-27
Status: Aprovada para implementação
Implementa: seção "Fase 2 — Score firmográfico" de [[2026-08-27-radar-pipeline-cnpj-score-cli-design]]
Depende de: Fase 1 (extração/filtro CNPJ), já implementada e mergeada — PR #1

## Contexto e motivação

A Fase 1 gerou candidatos válidos, mas em volume incompatível com o modelo de dados em Markdown do resto do projeto: uma validação de teste com um único shard (de 10) já produziu 697.667 candidatos no Perfil A e 269.944 no Perfil B. Rodar a extração completa (10 shards) deve multiplicar esse volume. Markdown/CSV não suporta filtrar, ordenar e pontuar nessa escala de forma prática.

Decisão tomada nesta sessão: usar **SQLite** (via `node:sqlite`, embutido no Node 22.5+, sem dependência nova) como camada de trabalho para o universo bruto de candidatos e o cálculo de score. Markdown continua sendo a camada de decisão humana (fila pequena, curada) — não muda.

Durante a resolução dos CNPJs ambíguos dos clientes-espelho (DNL Comércio, Owens-Illinois, Crown Embalagens — sinalizados na spec da Fase 1), foi confirmado com dados reais que **a suposição de que todos os estabelecimentos de uma empresa caem no mesmo shard da Receita Federal é falsa**: o CNPJ de DNL Comércio LTDA (07189629) aparece em `Empresas0.zip` mas não existe em nenhum dos 10 arquivos `Estabelecimentos*.zip`. Essa spec incorpora a mitigação para esse problema (ver "Import e agregação cruzada de shards").

## Clientes-espelho resolvidos nesta sessão

| Cliente-espelho | Perfil | CNPJ básico final | Evidência |
|---|---|---|---|
| Owens-Illinois | B | **08910541** (não 31452279) | Matriz ativa (situação "02"), e-mail real `CNPJ.EMPRESA@O-I.COM`, filiais ativas em PE/CE |
| Crown Embalagens | B | **33174335** (mantido) | Filial ativa em MG (situação "02"), e-mail real `CONTROLADORIA@CROWNCORK.COM.BR` |
| DNL Comércio | A | **excluído da calibração** | CNPJ 07189629 (de `Empresas0.zip`) não existe em nenhum dos 10 shards de `Estabelecimentos*.zip` — não pode ser localizado nos dados de Estabelecimentos, e o próprio `clientes-espelho.md` já marcava como "a validar" |

## Objetivo

Implementar a Fase 2 do pipeline: rodar a extração completa (todos os shards), importar para SQLite com agregação corrigida entre shards, calibrar e aplicar um score firmográfico objetivo, e gerar a fila de revisão (`data/fila-revisao.json`) pronta para a Fase 3 (ainda não implementada) consumir.

## Arquitetura

```
[Fase 1: já pronta] filtrar-cnpj.ts (por shard/perfil)
        │
        ▼
[Orquestrador de extração completa]  npm run fonte:cnpj:completo -- --perfil=a|b
   → roda os 10 shards em sequência, acumulando no CSV de saída
        │
        ▼
[Import SQLite]  npm run radar:importar-candidatos
   → carrega os CSVs completos em data/candidatos.db, tabela `candidatos`
   → upsert por cnpj_basico (idempotente — reimport não duplica)
   → recalcula filiais_ativas/data_abertura via GROUP BY cruzando
     candidatos que aparecem em mais de um shard
        │
        ▼
[Calibração]  npm run radar:calibrar -- --perfil=a|b
   → imprime capital social, filiais, idade dos clientes-espelho no terminal
   → usuário decide os limiares, edita score-config.json manualmente
        │
        ▼
[Score]  npm run radar:pontuar -- --perfil=a|b
   → aplica score-config.json via UPDATE SQL sobre `candidatos`
        │
        ▼
[Geração de fila]  npm run radar:gerar-fila -- --perfil=a|b
   → top 200 por score, potencial='alto', ainda não enfileirados
   → escreve/mescla data/fila-revisao.json (ReviewLead[])
   → marca linhas selecionadas (na_fila_desde) para não repetir em rodadas futuras
```

## Schema SQLite

```sql
CREATE TABLE candidatos (
  cnpj_basico TEXT PRIMARY KEY,
  perfil TEXT NOT NULL,              -- 'a' ou 'b'
  cnpj_completo TEXT NOT NULL,       -- CNPJ da matriz (14 dígitos)
  razao_social TEXT,
  nome_fantasia TEXT,
  porte TEXT,
  capital_social REAL,               -- convertido de "1000,00" (string BR) para número
  data_abertura TEXT,                -- YYYYMMDD, da matriz
  filiais_ativas INTEGER,            -- recalculado no import, agregando entre shards
  uf TEXT,
  municipio TEXT,
  cnae_principal TEXT,
  cnaes_que_bateram TEXT,
  cep TEXT,
  telefone TEXT,
  email TEXT,
  score_fit INTEGER,
  score_estrutura INTEGER,
  score_geografia INTEGER,
  score_total INTEGER,
  potencial TEXT,                    -- 'baixo' | 'medio' | 'alto'
  na_fila_desde TEXT,                -- NULL até entrar em fila-revisao.json; data ISO quando setado
  status_revisao TEXT                -- NULL | 'aprovado' | 'descartado' — escrito pela Fase 3 (fora de escopo aqui)
);
```

## Import e agregação cruzada de shards

O import lê os CSVs completos (gerados pelo orquestrador, um por perfil, contendo os 10 shards concatenados) e faz duas coisas por `cnpj_basico`:

1. **Upsert dos campos descritivos** (razão social, porte, capital social, UF, CNAE, contato) — a última ocorrência processada vence, já que esses campos não variam por shard.
2. **Agregação de `filiais_ativas`**: soma o `filiais_ativas` de todas as linhas com o mesmo `cnpj_basico` que aparecerem no CSV consolidado — cobre o caso em que o mesmo CNPJ básico aparece mais de uma vez (matriz num shard, filial noutro, algo que a Fase 1 não conseguia enxergar rodando shard por shard isoladamente).

**Limitação que permanece (documentada, não resolvida nesta fase):** se uma empresa não tiver **nenhuma** linha de Estabelecimentos ativa que bata no CNAE do perfil (caso DNL), ela simplesmente nunca aparece no CSV de candidatos da Fase 1 — não há como o import do SQLite recuperar isso, porque a fonte de dados (CSV) já não a contém. Isso é uma limitação de cobertura da Fase 1, não um bug do import.

## Comandos

- `npm run fonte:cnpj:completo -- --perfil=a|b` — orquestra as 10 execuções do `filtrar-cnpj.ts` (shards 0-9) contra `data/2026-08/extracted/EstabelecimentosN.csv`/`EmpresasN.csv`, acumulando em `data/candidatos-cnpj-perfil-a.csv` / `-b.csv`. Reaproveita a lógica de append já existente na Fase 1. Deve imprimir progresso ("shard N de 10") dado o tempo esperado de execução.
- `npm run radar:importar-candidatos -- --perfil=a|b` — lê o CSV consolidado, popula/atualiza `data/candidatos.db`.
- `npm run radar:calibrar -- --perfil=a|b` — consulta os clientes-espelho (lista de CNPJs básicos fixa em config, ver tabela acima) na tabela `candidatos` e imprime capital social, filiais_ativas, idade calculada em formato tabular no terminal, para uso manual na definição dos limiares.
- `npm run radar:pontuar -- --perfil=a|b` — lê `score-config.json`, aplica as camadas de score (fit, estrutura, geografia) via `UPDATE` SQL, classifica potencial.
- `npm run radar:gerar-fila -- --perfil=a|b` — seleciona top 200 por score com `potencial='alto' AND na_fila_desde IS NULL`, escreve/mescla em `data/fila-revisao.json` no formato `ReviewLead[]` já usado pela cadeia Brevo existente, marca as linhas selecionadas com `na_fila_desde`.

## Formato `score-config.json`

```json
{
  "perfil_a": {
    "estrutura": {
      "capital_social_min": 500000,
      "filiais_min": 2,
      "idade_anos_min": 3
    },
    "pesos": {
      "fit_cnae_principal": 30,
      "fit_cnae_secundario": 15,
      "estrutura_filiais": 25,
      "estrutura_porte": 15,
      "estrutura_capital": 10,
      "estrutura_idade": 10,
      "geo_cidade_prioritaria": 15,
      "geo_uf_perfil": 10
    },
    "faixas": { "baixo_max": 39, "medio_max": 69 }
  },
  "perfil_b": { "mesma_estrutura": true }
}
```

Editável manualmente após rodar `radar:calibrar` — não há UI, é edição direta do JSON (mesma filosofia de `cnaes.json`).

## Query de score (referência)

```sql
UPDATE candidatos SET
  score_fit = (CASE WHEN cnae_principal IN (:cnaes_perfil) THEN :fit_cnae_principal ELSE :fit_cnae_secundario END),
  score_estrutura =
    (CASE WHEN filiais_ativas >= :filiais_min THEN :estrutura_filiais ELSE 0 END) +
    (CASE WHEN porte != '01' THEN :estrutura_porte ELSE 0 END) +
    (CASE WHEN capital_social >= :capital_social_min THEN :estrutura_capital ELSE 0 END) +
    (CASE WHEN idade_anos >= :idade_anos_min THEN :estrutura_idade ELSE 0 END),
  score_geografia =
    (CASE WHEN municipio IN (:cidades_prioritarias) THEN :geo_cidade_prioritaria
          WHEN uf IN (:ufs_perfil) THEN :geo_uf_perfil ELSE 0 END)
WHERE perfil = :perfil;

UPDATE candidatos SET
  score_total = score_fit + score_estrutura + score_geografia,
  potencial = CASE
    WHEN score_total > :medio_max THEN 'alto'
    WHEN score_total > :baixo_max THEN 'medio'
    ELSE 'baixo'
  END
WHERE perfil = :perfil;
```

`idade_anos` é calculado a partir de `data_abertura` (formato `YYYYMMDD`) no momento da query, não armazenado.

## Geração da fila — comportamento incremental

- Seleção: `WHERE perfil = :perfil AND potencial = 'alto' AND na_fila_desde IS NULL ORDER BY score_total DESC LIMIT 200`.
- Mapeamento para `ReviewLead` (tipo já existente em `src/contracts/lead-types.ts`, reaproveitado sem alteração de schema): empresa (`razao_social`/`nome_fantasia`), site (vazio — fora de escopo desta fase, enriquecimento futuro), score, potencial, cidade/UF, sinais (lista dos `cnaes_que_bateram` + quais camadas pontuaram), contato (`telefone`/`email` do próprio CNPJ).
- Escreve em `data/fila-revisao.json`: se o arquivo já existir com entradas pendentes de uma rodada anterior, o comando **soma** as novas entradas sem duplicar (checagem por `cnpj_completo`).
- Após selecionar, marca `na_fila_desde = <data ISO de hoje>` nas linhas escolhidas — garante que rodar `radar:gerar-fila` de novo (ex.: próxima atualização mensal da base CNPJ, novos dados importados) traz os *próximos* 200 melhores ainda não enfileirados, não repete os mesmos.
- `status_revisao` (aprovado/descartado) é escrito pela Fase 3, que ainda não existe — esta fase só declara a coluna, não a popula.

## O que fica fora de escopo desta fase

- Fase 3 (CLI de revisão) — só consome `fila-revisao.json`, não é implementada aqui.
- Resolução manual do CNPJ correto de DNL Comércio (fica pendente, fora da calibração).
- Enriquecimento de site/contato além do que já vem no CNPJ (scraping, Google Places etc.) — mencionado como possibilidade futura na conversa, não faz parte desta fase.
- Roteamento por unidade (REC vs MGA) — mesma exclusão já registrada na spec da Fase 1.

## Riscos e limitações conhecidas

- **Cobertura incompleta por shard-locality quebrada:** confirmado que pelo menos uma empresa (DNL) existe em `Empresas` mas não em nenhum `Estabelecimentos` — candidatos assim nunca entram no pipeline, porque a Fase 1 extrai a partir de Estabelecimentos. A agregação cruzada de shards no import mitiga o caso "filiais espalhadas entre shards, mas presentes em algum shard" — não resolve o caso "ausente de todos os shards".
- **Amostra de calibração reduzida:** com DNL excluído, restam ~10-11 clientes-espelho de confiança alta/média para calibrar ambos os perfis — mesma ressalva já registrada na Fase 1, potencialmente agravada.
- **Tempo de execução do orquestrador completo:** 10 shards × 2 perfis, com o shard 0 sozinho já exigindo heap maior — a extração completa deve levar da ordem de dezenas de minutos a horas. O comando precisa de output de progresso para não parecer travado.
- **`node:sqlite`** é relativamente novo (estável desde Node 22.5) — risco baixo dado que o projeto já roda em Node 24, mas documentado como dependência de versão do runtime.
