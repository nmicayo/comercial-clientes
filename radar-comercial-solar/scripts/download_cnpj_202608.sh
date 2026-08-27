#!/bin/bash
set -e

BASE_URL="https://dados-abertos-rf-cnpj.casadosdados.com.br/arquivos/2026-08-09"
OUT_DIR="$(dirname "$0")/../data/2026-08"

mkdir -p "$OUT_DIR"

FILES=(
  "Cnaes.zip"
  "Empresas0.zip" "Empresas1.zip" "Empresas2.zip" "Empresas3.zip" "Empresas4.zip"
  "Empresas5.zip" "Empresas6.zip" "Empresas7.zip" "Empresas8.zip" "Empresas9.zip"
  "Estabelecimentos0.zip" "Estabelecimentos1.zip" "Estabelecimentos2.zip" "Estabelecimentos3.zip" "Estabelecimentos4.zip"
  "Estabelecimentos5.zip" "Estabelecimentos6.zip" "Estabelecimentos7.zip" "Estabelecimentos8.zip" "Estabelecimentos9.zip"
)

for f in "${FILES[@]}"; do
  echo ">>> Baixando $f"
  curl -L --retry 10 --retry-delay 5 --retry-all-errors -C - \
    -o "${OUT_DIR}/${f}" \
    "${BASE_URL}/${f}"
done

echo "Concluído. Arquivos em ${OUT_DIR}"
