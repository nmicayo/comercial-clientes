#!/bin/bash
# Roda a extração da Fase 1 (filtrar-cnpj.ts) para os 10 shards de um perfil,
# descompactando cada shard sob demanda e removendo os CSVs extraídos depois
# de processados (evita acumular ~90GB em disco simultaneamente).
set -e

PERFIL="$1"
if [ "$PERFIL" != "a" ] && [ "$PERFIL" != "b" ]; then
  echo "Uso: extrair-todos-shards.sh a|b"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$SCRIPT_DIR/../../data/2026-08"
EXTRACTED_DIR="$DATA_DIR/extracted"
OUT_FILE="$SCRIPT_DIR/../../data/candidatos-cnpj-perfil-${PERFIL}.csv"

mkdir -p "$EXTRACTED_DIR"

# Municipios só precisa ser extraído uma vez
if [ ! -f "$EXTRACTED_DIR/Municipios.csv" ]; then
  if [ ! -f "$DATA_DIR/Municipios.zip" ]; then
    echo ">>> Baixando Municipios.zip"
    curl -L -o "$DATA_DIR/Municipios.zip" "https://dados-abertos-rf-cnpj.casadosdados.com.br/arquivos/2026-08-09/Municipios.zip"
  fi
  unzip -p "$DATA_DIR/Municipios.zip" > "$EXTRACTED_DIR/Municipios.csv"
fi

for N in 0 1 2 3 4 5 6 7 8 9; do
  echo ">>> Shard $N de 9 (perfil $PERFIL)"

  EMP_CSV="$EXTRACTED_DIR/Empresas${N}.csv"
  EST_CSV="$EXTRACTED_DIR/Estabelecimentos${N}.csv"

  if [ ! -f "$EMP_CSV" ]; then
    unzip -p "$DATA_DIR/Empresas${N}.zip" > "$EMP_CSV"
  fi
  if [ ! -f "$EST_CSV" ]; then
    unzip -p "$DATA_DIR/Estabelecimentos${N}.zip" > "$EST_CSV"
  fi

  node --max-old-space-size=12288 --experimental-strip-types \
    "$SCRIPT_DIR/filtrar-cnpj.ts" \
    --perfil="$PERFIL" \
    --estabelecimentos="$EST_CSV" \
    --empresas="$EMP_CSV" \
    --municipios="$EXTRACTED_DIR/Municipios.csv" \
    --out="$OUT_FILE"

  # Libera espaço — os .csv extraídos podem passar de 10GB por shard grande
  rm -f "$EMP_CSV" "$EST_CSV"
done

echo ">>> Concluído. Saída: $OUT_FILE"
wc -l "$OUT_FILE"
