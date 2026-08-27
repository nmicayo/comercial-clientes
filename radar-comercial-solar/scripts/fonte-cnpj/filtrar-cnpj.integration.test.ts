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

  // Tanto a matriz (CNAE principal 4321500) quanto a filial (CNAE 4661300)
  // devem aparecer como linhas independentes na saída, ambas com filiais_ativas=2
  // e compartilhando a data_abertura da matriz. A loja (44444444) não aparece.
  // A metalúrgica (55555555) casa só via CNAE SECUNDÁRIO (4321500), com CNAE
  // principal 4781400 (não bate) — cobre o caminho "match por secundário".
  assert.equal(linhas.length, 3);

  // Verificar que ambas as linhas pertencem ao CNPJ 33333333
  const linha0Start = linhas[0].substring(0, 8);
  const linha1Start = linhas[1].substring(0, 8);
  assert.equal(linha0Start, "33333333");
  assert.equal(linha1Start, "33333333");

  // Matriz (0001): CNAE principal 4321500
  const matrizLine = linhas.find((l) => l.includes("4321500"));
  assert(matrizLine, "Matriz com CNAE 4321500 deve estar presente");
  assert.match(matrizLine, /SOLAR DISTRIBUIDORA X LTDA/);
  assert.match(matrizLine, /800000,00/); // capital social
  assert.match(matrizLine, /20180315/); // data de abertura da matriz
  assert.match(matrizLine, /;2;/); // 2 filiais ativas (matriz + filial)
  assert.match(matrizLine, /SAO PAULO/);

  // Filial (0002): CNAE principal 4661300
  const filialLine = linhas.find((l) => l.includes("4661300"));
  assert(filialLine, "Filial com CNAE 4661300 deve estar presente");
  assert.match(filialLine, /;2;/); // também tem 2 filiais ativas (mesmo agregado)
  assert.match(filialLine, /20180315/); // também tem data de abertura da matriz
  assert.match(filialLine, /CURITIBA/); // sua própria cidade
  assert.match(filialLine, /800000,00/); // capital social do CNPJ

  // Loja de roupas (44444444) não deve aparecer
  assert(!linhas.some((l) => l.includes("44444444")), "Loja de roupas (CNAE 4781400) não deve aparecer");

  // Metalúrgica Z (55555555): CNAE principal 4781400 (não bate sozinho),
  // mas CNAE secundário 4321500 bate — cobre o caminho "match por secundário".
  const metalurgicaLine = linhas.find((l) => l.startsWith("55555555"));
  assert(metalurgicaLine, "Metalúrgica Z (match via CNAE secundário) deve estar presente");
  assert.match(metalurgicaLine!, /METALURGICA Z LTDA/);
  assert.match(metalurgicaLine!, /350000,00/); // capital social
  assert.match(metalurgicaLine!, /BELO HORIZONTE/);
  const camposMetalurgica = metalurgicaLine!.split(";");
  assert.equal(camposMetalurgica[9], "4781400"); // cnae_principal (não bate sozinho)
  assert.equal(camposMetalurgica[10], "4321500"); // cnaes_que_bateram (só o secundário)

  rmSync(outPath);
});
