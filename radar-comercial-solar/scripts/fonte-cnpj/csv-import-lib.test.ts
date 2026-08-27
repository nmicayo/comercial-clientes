import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsvLine, parseCapitalSocial, agregarCandidatos } from "./csv-import-lib.ts";

test("parseCsvLine separa por ; respeitando campos entre aspas", () => {
  const linha = '12345678900190;RAZAO SOCIAL X;"NOME; COM PONTO";05;800000,00';
  assert.deepEqual(parseCsvLine(linha), [
    "12345678900190",
    "RAZAO SOCIAL X",
    "NOME; COM PONTO",
    "05",
    "800000,00",
  ]);
});

test("parseCsvLine lida com aspas duplicadas dentro de campo escapado", () => {
  const linha = '111;"EMPRESA ""ALIAS"" LTDA";222';
  assert.deepEqual(parseCsvLine(linha), ["111", 'EMPRESA "ALIAS" LTDA', "222"]);
});

test("parseCapitalSocial converte formato brasileiro para número", () => {
  assert.equal(parseCapitalSocial("800000,00"), 800000);
  assert.equal(parseCapitalSocial("1500000,50"), 1500000.5);
  assert.equal(parseCapitalSocial(""), 0);
});

const header =
  "cnpj;razao_social;nome_fantasia;porte;capital_social;data_abertura;filiais_ativas;uf;municipio;cnae_principal;cnaes_que_bateram;cep;telefone;email";

async function* linhasDeTeste(linhas: string[]): AsyncIterable<string> {
  yield header;
  for (const l of linhas) yield l;
}

test("agregarCandidatos deduplica filiais_ativas repetido no mesmo shard (matriz+filial)", async () => {
  const linhas = [
    "11111111000190;EMPRESA X;;05;800000,00;20180315;2;SP;SAO PAULO;4321500;4321500;01000000;11999998888;x@x.com",
    "11111111000271;EMPRESA X;;05;800000,00;20180315;2;PR;CURITIBA;4661300;4661300;80000000;;",
  ];
  const map = await agregarCandidatos(linhasDeTeste(linhas));
  const c = map.get("11111111");
  assert.ok(c);
  assert.equal(c!.filiaisAtivas, 2, "mesmo valor repetido no mesmo shard não deve somar duas vezes");
});

test("agregarCandidatos soma filiais_ativas quando valores diferentes aparecem (empresa em 2 shards)", async () => {
  const linhas = [
    "22222222000105;EMPRESA Y;;05;100000,00;20200101;1;SP;SAO PAULO;4321500;4321500;01000000;;",
    "22222222000186;EMPRESA Y;;05;100000,00;20200101;3;RJ;RIO DE JANEIRO;4321500;4321500;20000000;;",
  ];
  const map = await agregarCandidatos(linhasDeTeste(linhas));
  const c = map.get("22222222");
  assert.equal(c!.filiaisAtivas, 4, "valores diferentes (shards diferentes) devem somar");
});

test("agregarCandidatos usa a primeira data_abertura não-vazia encontrada", async () => {
  const linhas = [
    "33333333000100;EMPRESA Z;;05;0;;1;SP;SAO PAULO;4321500;4321500;01000000;;",
    "33333333000280;EMPRESA Z;;05;0;20150610;2;PR;CURITIBA;4321500;4321500;80000000;;",
  ];
  const map = await agregarCandidatos(linhasDeTeste(linhas));
  assert.equal(map.get("33333333")!.dataAbertura, "20150610");
});

test("agregarCandidatos mantém razao_social/nome_fantasia/porte/capital_social de shard anterior quando o shard seguinte vem vazio (empresa não encontrada no Empresas daquele shard)", async () => {
  const linhas = [
    "44444444000100;EMPRESA COMPLETA LTDA;FANTASIA W;05;900000,00;20190101;1;SP;SAO PAULO;4321500;4321500;01000000;11988887777;w@w.com",
    "44444444000280;;;;;20190101;2;PR;CURITIBA;4321500;4321500;80000000;;",
  ];
  const map = await agregarCandidatos(linhasDeTeste(linhas));
  const c = map.get("44444444");
  assert.ok(c);
  assert.equal(c!.razaoSocial, "EMPRESA COMPLETA LTDA");
  assert.equal(c!.nomeFantasia, "FANTASIA W");
  assert.equal(c!.porte, "05");
  assert.equal(c!.capitalSocial, 900000);
});
