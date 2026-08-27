# Fonte CNPJ (Dados Abertos Receita Federal)

Filtro local para gerar listas de candidatos (Perfil A e Perfil B) a partir da
base pública de CNPJ, sem gastar busca de IA por empresa. A extração é
**nacional** — não filtra por UF; a UF de cada estabelecimento é capturada
como dado e usada depois, na etapa de score (Fase 2), não como corte de
entrada aqui.

## 1. Baixar os dados

Já baixado nesta sessão via `scripts/download_cnpj_202608.sh` para
`data/2026-08/` (Cnaes, Empresas0-9, Estabelecimentos0-9). Falta baixar
`Municipios.zip` separadamente (usado só para traduzir código de município em
nome — opcional, sem ele o script usa o código bruto).

Os arquivos baixados são `.zip`; descompacte cada um antes de rodar:

```bash
cd data/2026-08
mkdir -p extracted
for f in Empresas*.zip Estabelecimentos*.zip; do
  unzip -p "$f" > "extracted/${f%.zip}.csv"
done
```

Os arquivos descompactados são `.csv` mas na verdade separados por `;`, sem
cabeçalho, em latin1 — o script já trata isso.

## 2. Conferir os CNAEs em `cnaes.json`

Os códigos de CNAE em `cnaes.json` são um ponto de partida, **não confirmados
um a um**. Antes de rodar de verdade, confira/ajuste na tabela oficial:
https://concla.ibge.gov.br/busca-online-cnae.html — busque pelos nichos dos
clientes-espelho de cada perfil (ver `contexto/clientes-espelho.md`) e pelos
nichos em `inteligencia/nichos-prioritarios.md`.

O campo `ufs` de cada perfil em `cnaes.json` não é mais usado como filtro de
extração — fica só como referência para a etapa de score (Fase 2).

## 3. Rodar o filtro

```bash
# Perfil A (solar), um arquivo de estabelecimentos por vez
node --experimental-strip-types scripts/fonte-cnpj/filtrar-cnpj.ts \
  --perfil=a \
  --estabelecimentos=data/2026-08/extracted/Estabelecimentos0.csv \
  --empresas=data/2026-08/extracted/Empresas0.csv \
  --municipios=data/2026-08/extracted/Municipios.csv \
  --out=data/candidatos-cnpj-perfil-a.csv

# repetir trocando Estabelecimentos0 -> Estabelecimentos1, 2, ... 9
# (o --out é append, então vai acumulando um único CSV final)
```

Trocar `--perfil=a` por `--perfil=b` para o Perfil B (industrial/agro/bebidas)
— gerar um `--out` separado por perfil.

Shards grandes (ex. `Estabelecimentos0`, o maior, com ~29-30M linhas) podem
precisar de mais heap do que o padrão do Node (4GB), sob risco de OOM. Use
`--max-old-space-size` entre 8192 e 12288 (MB) nesses casos — não é
necessário para os shards menores (1-9, bem menores que o 0):

```bash
node --max-old-space-size=8192 --experimental-strip-types scripts/fonte-cnpj/filtrar-cnpj.ts \
  --perfil=a --estabelecimentos=data/2026-08/extracted/Estabelecimentos0.csv \
  --empresas=data/2026-08/extracted/Empresas0.csv \
  --municipios=data/2026-08/extracted/Municipios.csv \
  --out=data/candidatos-cnpj-perfil-a.csv
```

## 4. Saída

Um CSV em `data/` com as colunas:

`cnpj;razao_social;nome_fantasia;porte;capital_social;data_abertura;filiais_ativas;uf;municipio;cnae_principal;cnaes_que_bateram;cep;telefone;email`

- `capital_social`, `data_abertura` e `filiais_ativas` são calculados por
  empresa (CNPJ básico), não por estabelecimento — todo estabelecimento da
  mesma empresa carrega o mesmo valor.
- `cnaes_que_bateram` lista quais CNAEs (principal e/ou secundários) casaram
  com o perfil filtrado — útil para auditar falsos positivos depois.
- `filiais_ativas` conta todos os estabelecimentos ativos da empresa
  (matriz + filiais), não só as filiais — uma empresa de único endereço
  reporta `1`, não `0`.

Isso vira o ponto de partida da etapa de score (Fase 2) — filtra ruído
mecanicamente, sem IA lendo site por site.

Atenção: `--out` é append (acumula entre shards, ver seção 3). Rodar o mesmo
shard duas vezes contra o mesmo `--out` duplica as linhas — se for reprocessar
um shard já rodado, apague o arquivo de saída antes.

## Testes

```bash
npm test
```

Roda os testes unitários de `lib.ts` (parsing/matching, agregação de filiais)
e o teste de integração do script completo contra fixtures pequenas em
`__fixtures__/`.

## Fase 2 — Score via SQLite

Depois de gerar os CSVs de candidatos (Fase 1), rode em sequência:

```bash
# 1. Extração completa (10 shards) — pode levar horas
./scripts/fonte-cnpj/extrair-todos-shards.sh a
./scripts/fonte-cnpj/extrair-todos-shards.sh b

# 2. Import para SQLite (idempotente — pode rodar de novo sem duplicar)
npm run radar:importar-candidatos -- --perfil=a
npm run radar:importar-candidatos -- --perfil=b

# 3. Calibração manual — olhe os números e ajuste scripts/fonte-cnpj/score-config.json
npm run radar:calibrar -- --perfil=a
npm run radar:calibrar -- --perfil=b

# 4. Score
npm run radar:pontuar -- --perfil=a
npm run radar:pontuar -- --perfil=b

# 5. Gerar fila (top 200 por perfil, incremental entre rodadas)
npm run radar:gerar-fila -- --perfil=a
npm run radar:gerar-fila -- --perfil=b
```

`data/candidatos.db` não é commitado (dado derivado, grande). Para recalibrar do zero, delete o banco e reimporte.
