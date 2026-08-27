import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(__dirname, "filtrar-cnpj.ts");
const fixturesDir = path.join(__dirname, "__fixtures__");
const outPath = path.join(__dirname, "__fixtures__", "saida-teste.csv");

test("filtrar-cnpj.ts filtra por CNAE (principal ou secundário), nacional, com filiais e capital social", () => {
  if (existsSync(outPath)) rmSync(outPath);

  execFileSync(
    process.execPath,
    [
      "--experimental-strip-types",
      scriptPath,
      "--perfil=a",
      `--estabelecimentos=${path.join(fixturesDir, "estabelecimentos-amostra.csv")}`,
      `--empresas=${path.join(fixturesDir, "empresas-amostra.csv")}`,
      `--municipios=${path.join(fixturesDir, "municipios-amostra.csv")}`,
      `--out=${outPath}`,
    ],
    { encoding: "utf-8" }
  );

  const conteudo = readFileSync(outPath, "utf-8").trim().split("\n");
  const header = conteudo[0];
  const linhas = conteudo.slice(1);

  assert.equal(header, "cnpj;razao_social;nome_fantasia;porte;capital_social;data_abertura;filiais_ativas;uf;municipio;cnae_principal;cnaes_que_bateram;cep;telefone;email");

  // Só a matriz do CNPJ 33333333 deve aparecer (bate CNAE principal 4321500 do perfil A);
  // a loja de roupas (44444444) não deve aparecer.
  assert.equal(linhas.length, 1);
  assert.match(linhas[0], /^33333333/);
  assert.match(linhas[0], /SOLAR DISTRIBUIDORA X LTDA/);
  assert.match(linhas[0], /800000,00/); // capital social
  assert.match(linhas[0], /20180315/); // data de abertura da matriz
  assert.match(linhas[0], /;2;/); // 2 filiais ativas (matriz + filial)
  assert.match(linhas[0], /SAO PAULO/);

  rmSync(outPath);
});
