import { test } from "node:test";
import assert from "node:assert/strict";
import {
  splitLine,
  csvEscape,
  parseCnaesSecundarios,
  matchesCnae,
  parseEstabelecimentoLine,
  parseEmpresaLine,
  ATIVA,
  buildAgregacaoFiliais,
} from "./lib.ts";

test("splitLine remove aspas e espaços de cada campo", () => {
  const result = splitLine('"12345678";"EMPRESA TESTE LTDA";"02"');
  assert.deepEqual(result, ["12345678", "EMPRESA TESTE LTDA", "02"]);
});

test("csvEscape envolve em aspas quando há ; \" ou quebra de linha", () => {
  assert.equal(csvEscape("SEM ESPECIAL"), "SEM ESPECIAL");
  assert.equal(csvEscape("COM;PONTO"), '"COM;PONTO"');
  assert.equal(csvEscape('COM"ASPAS'), '"COM""ASPAS"');
});

test("parseCnaesSecundarios separa lista por vírgula e ignora vazio", () => {
  assert.deepEqual(parseCnaesSecundarios("4711302,4713004"), ["4711302", "4713004"]);
  assert.deepEqual(parseCnaesSecundarios(""), []);
});

test("matchesCnae bate pelo principal", () => {
  const cnaeSet = new Set(["4321500"]);
  const result = matchesCnae("4321500", [], cnaeSet);
  assert.equal(result.matched, true);
  assert.deepEqual(result.cnaesQueBateram, ["4321500"]);
});

test("matchesCnae bate por secundário quando principal não bate", () => {
  const cnaeSet = new Set(["4669999"]);
  const result = matchesCnae("4321500", ["4669999", "1113502"], cnaeSet);
  assert.equal(result.matched, true);
  assert.deepEqual(result.cnaesQueBateram, ["4669999"]);
});

test("matchesCnae não bate quando nenhum CNAE está no set", () => {
  const cnaeSet = new Set(["1113502"]);
  const result = matchesCnae("4321500", ["4669999"], cnaeSet);
  assert.equal(result.matched, false);
  assert.deepEqual(result.cnaesQueBateram, []);
});

test("parseEstabelecimentoLine extrai os campos pelo layout oficial da RFB", () => {
  const linha = [
    '"12345678"', '"0001"', '"90"', '"1"', '"NOME FANTASIA X"', `"${ATIVA}"`,
    '"20200101"', '""', '""', '""', '"20180315"', '"4321500"', '"4669999,1113502"',
    '"RUA"', '"DAS FLORES"', '"100"', '""', '"CENTRO"', '"01000000"', '"SP"',
    '"7107"', '"11"', '"999998888"', '""', '""', '""', '""',
    '"contato@empresax.com.br"', '""', '""',
  ].join(";");
  const row = parseEstabelecimentoLine(linha);
  assert.equal(row.cnpjBasico, "12345678");
  assert.equal(row.identificadorMatrizFilial, "1");
  assert.equal(row.situacaoCadastral, ATIVA);
  assert.equal(row.dataInicioAtividade, "20180315");
  assert.equal(row.cnaePrincipal, "4321500");
  assert.deepEqual(row.cnaesSecundarios, ["4669999", "1113502"]);
  assert.equal(row.uf, "SP");
  assert.equal(row.municipioCodigo, "7107");
  assert.equal(row.telefone, "11999998888");
  assert.equal(row.email, "contato@empresax.com.br");
});

test("parseEmpresaLine extrai cnpjBasico, razaoSocial, porte e capitalSocial", () => {
  const linha = '"12345678";"EMPRESA X LTDA";"2062";"49";"1500000,00";"05";""';
  const [cnpjBasico, info] = parseEmpresaLine(linha);
  assert.equal(cnpjBasico, "12345678");
  assert.equal(info.razaoSocial, "EMPRESA X LTDA");
  assert.equal(info.porte, "05");
  assert.equal(info.capitalSocial, "1500000,00");
});

async function* linhasDeTeste(linhas: string[]): AsyncIterable<string> {
  for (const l of linhas) yield l;
}

test("buildAgregacaoFiliais conta filiais ativas por CNPJ básico e guarda data de abertura da matriz", async () => {
  const linhas = [
    // matriz ativa, CNPJ 11111111
    ['"11111111"', '"0001"', '"90"', '"1"', '""', `"${ATIVA}"`, '""', '""', '""', '""', '"20150610"', '"4321500"', '""', '""', '""', '""', '""', '""', '""', '"SP"', '"7107"', '""', '""', '""', '""', '""', '""', '""', '""', '""'].join(";"),
    // filial ativa, mesmo CNPJ básico
    ['"11111111"', '"0002"', '"01"', '"2"', '""', `"${ATIVA}"`, '""', '""', '""', '""', '"20190101"', '"4321500"', '""', '""', '""', '""', '""', '""', '""', '"PR"', '"7455"', '""', '""', '""', '""', '""', '""', '""', '""', '""'].join(";"),
    // filial inativa (situação != 02), não deve contar
    ['"11111111"', '"0003"', '"02"', '"2"', '""', '"08"', '""', '""', '""', '""', '"20200101"', '"4321500"', '""', '""', '""', '""', '""', '""', '""', '"MG"', '"4123"', '""', '""', '""', '""', '""', '""', '""', '""', '""'].join(";"),
    // empresa diferente, uma matriz ativa
    ['"22222222"', '"0001"', '"90"', '"1"', '""', `"${ATIVA}"`, '""', '""', '""', '""', '"20220301"', '"4669999"', '""', '""', '""', '""', '""', '""', '""', '"BA"', '"2927"', '""', '""', '""', '""', '""', '""', '""', '""', '""'].join(";"),
  ];
  const agregacao = await buildAgregacaoFiliais(linhasDeTeste(linhas));

  assert.equal(agregacao["11111111"]?.filiaisAtivas, 2);
  assert.equal(agregacao["11111111"]?.dataAberturaMatriz, "20150610");
  assert.equal(agregacao["22222222"]?.filiaisAtivas, 1);
  assert.equal(agregacao["22222222"]?.dataAberturaMatriz, "20220301");
});
