# Fase 1 — Extração/Filtro CNPJ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reescrever `scripts/fonte-cnpj/filtrar-cnpj.ts` para extrair candidatos da base CNPJ nacionalmente (sem filtro de UF), casando CNAE principal e secundário, e enriquecendo a saída com capital social, data de abertura e número de filiais ativas por empresa.

**Architecture:** Extrai a lógica pura de parsing/matching para um módulo `lib.ts` testável com `node:test`, mantendo o script `filtrar-cnpj.ts` como orquestração de I/O (streaming em duas passadas sobre o arquivo de Estabelecimentos: 1ª para agregar filiais/data de abertura por empresa, 2ª para filtrar por CNAE e gravar o CSV de saída).

**Tech Stack:** Node.js 24 (TypeScript via `--experimental-strip-types`, sem build step), `node:test`/`node:assert/strict` para testes (sem dependência nova), streaming via `node:readline`/`node:fs`.

**Spec:** `docs/superpowers/specs/2026-08-27-radar-pipeline-cnpj-score-cli-design.md` — seção "Fase 1 — Extração/filtro CNPJ"

## Global Constraints

- Extração é **nacional** — não filtra mais por UF na entrada (spec, Fase 1).
- Roda uma vez por perfil (`--perfil=a` e `--perfil=b`), cobrindo ambos desde já (spec, Objetivo).
- Só considera estabelecimentos com situação cadastral ativa (`"02"`) — regra já existente, mantida.
- CSV de saída usa `;` como separador e aspas duplas para escaping (padrão já usado no projeto — `csvEscape`).
- Sem dependências novas no `package.json` — usar só `node:*` built-ins.

---

## Mapa de arquivos

- Criar: `radar-comercial-solar/scripts/fonte-cnpj/lib.ts` — funções puras de parsing/matching (testável)
- Criar: `radar-comercial-solar/scripts/fonte-cnpj/lib.test.ts` — testes unitários de `lib.ts`
- Modificar: `radar-comercial-solar/scripts/fonte-cnpj/filtrar-cnpj.ts` — orquestração I/O usando `lib.ts`
- Criar: `radar-comercial-solar/scripts/fonte-cnpj/__fixtures__/estabelecimentos-amostra.csv` — fixture pequena para teste de integração
- Criar: `radar-comercial-solar/scripts/fonte-cnpj/__fixtures__/empresas-amostra.csv` — fixture pequena
- Criar: `radar-comercial-solar/scripts/fonte-cnpj/__fixtures__/municipios-amostra.csv` — fixture pequena
- Criar: `radar-comercial-solar/scripts/fonte-cnpj/filtrar-cnpj.integration.test.ts` — teste de integração rodando o script como subprocesso sobre as fixtures
- Modificar: `radar-comercial-solar/scripts/fonte-cnpj/README.md` — documentar novas colunas de saída e remoção do filtro de UF
- Modificar: `radar-comercial-solar/package.json` — adicionar script `test`

---

### Task 1: Módulo de parsing/matching puro (`lib.ts`)

**Files:**
- Create: `radar-comercial-solar/scripts/fonte-cnpj/lib.ts`
- Test: `radar-comercial-solar/scripts/fonte-cnpj/lib.test.ts`

**Interfaces:**
- Produces (usado pela Task 2 e Task 3):
  - `parseArgs(argv: string[]): Record<string, string>`
  - `splitLine(line: string): string[]`
  - `csvEscape(v: string): string`
  - `parseCnaesSecundarios(raw: string): string[]`
  - `interface CnaeMatch { matched: boolean; cnaesQueBateram: string[] }`
  - `matchesCnae(cnaePrincipal: string, cnaesSecundarios: string[], cnaeSet: Set<string>): CnaeMatch`
  - `interface EstabelecimentoRow { cnpjBasico: string; cnpjOrdem: string; cnpjDv: string; identificadorMatrizFilial: string; nomeFantasia: string; situacaoCadastral: string; dataInicioAtividade: string; cnaePrincipal: string; cnaesSecundarios: string[]; cep: string; uf: string; municipioCodigo: string; telefone: string; email: string }`
  - `parseEstabelecimentoLine(line: string): EstabelecimentoRow`
  - `interface EmpresaInfo { razaoSocial: string; porte: string; capitalSocial: string }`
  - `parseEmpresaLine(line: string): [cnpjBasico: string, info: EmpresaInfo]`
  - `const ATIVA = "02"`

- [ ] **Step 1: Write the failing test**

Create `radar-comercial-solar/scripts/fonte-cnpj/lib.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd radar-comercial-solar && node --experimental-strip-types --test scripts/fonte-cnpj/lib.test.ts`
Expected: FAIL — `lib.ts` não existe ainda (`Cannot find module`).

- [ ] **Step 3: Write minimal implementation**

Create `radar-comercial-solar/scripts/fonte-cnpj/lib.ts`:

```ts
// Funções puras de parsing/matching da base CNPJ (Receita Federal).
// Sem I/O — testável isoladamente. Orquestração de arquivos fica em filtrar-cnpj.ts.

export function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of argv) {
    const m = raw.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

// Campos da Receita são separados por ";", cada campo entre aspas duplas.
// Não há vírgulas/pontos-e-vírgulas escapados dentro de aspas nesses arquivos
// na prática, então um split simples após remover aspas é suficiente.
export function splitLine(line: string): string[] {
  return line.split(";").map((f) => f.replace(/^"|"$/g, "").trim());
}

export function csvEscape(v: string): string {
  if (v == null) return "";
  const s = String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function parseCnaesSecundarios(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

export interface CnaeMatch {
  matched: boolean;
  cnaesQueBateram: string[];
}

export function matchesCnae(
  cnaePrincipal: string,
  cnaesSecundarios: string[],
  cnaeSet: Set<string>
): CnaeMatch {
  const cnaesQueBateram: string[] = [];
  if (cnaeSet.has(cnaePrincipal)) cnaesQueBateram.push(cnaePrincipal);
  for (const c of cnaesSecundarios) {
    if (cnaeSet.has(c)) cnaesQueBateram.push(c);
  }
  return { matched: cnaesQueBateram.length > 0, cnaesQueBateram };
}

// Layout oficial "Estabelecimentos" da Receita Federal (30 campos, 0-indexed):
// 0 CNPJ_BASICO, 1 CNPJ_ORDEM, 2 CNPJ_DV, 3 IDENTIFICADOR_MATRIZ_FILIAL,
// 4 NOME_FANTASIA, 5 SITUACAO_CADASTRAL, 6 DATA_SITUACAO_CADASTRAL,
// 7 MOTIVO_SITUACAO_CADASTRAL, 8 NOME_CIDADE_EXTERIOR, 9 PAIS,
// 10 DATA_INICIO_ATIVIDADE, 11 CNAE_FISCAL_PRINCIPAL, 12 CNAE_FISCAL_SECUNDARIA,
// 13 TIPO_LOGRADOURO, 14 LOGRADOURO, 15 NUMERO, 16 COMPLEMENTO, 17 BAIRRO,
// 18 CEP, 19 UF, 20 MUNICIPIO, 21 DDD_1, 22 TELEFONE_1, 23 DDD_2, 24 TELEFONE_2,
// 25 DDD_FAX, 26 TELEFONE_FAX, 27 CORREIO_ELETRONICO, 28 SITUACAO_ESPECIAL,
// 29 DATA_SITUACAO_ESPECIAL
export interface EstabelecimentoRow {
  cnpjBasico: string;
  cnpjOrdem: string;
  cnpjDv: string;
  identificadorMatrizFilial: string;
  nomeFantasia: string;
  situacaoCadastral: string;
  dataInicioAtividade: string;
  cnaePrincipal: string;
  cnaesSecundarios: string[];
  cep: string;
  uf: string;
  municipioCodigo: string;
  telefone: string;
  email: string;
}

export function parseEstabelecimentoLine(line: string): EstabelecimentoRow {
  const f = splitLine(line);
  const ddd1 = f[21];
  const telefone1 = f[22];
  return {
    cnpjBasico: f[0],
    cnpjOrdem: f[1],
    cnpjDv: f[2],
    identificadorMatrizFilial: f[3],
    nomeFantasia: f[4],
    situacaoCadastral: f[5],
    dataInicioAtividade: f[10],
    cnaePrincipal: f[11],
    cnaesSecundarios: parseCnaesSecundarios(f[12]),
    cep: f[18],
    uf: f[19],
    municipioCodigo: f[20],
    telefone: ddd1 && telefone1 ? `${ddd1}${telefone1}` : "",
    email: f[27],
  };
}

// Layout oficial "Empresas": 0 CNPJ_BASICO, 1 RAZAO_SOCIAL, 2 NATUREZA_JURIDICA,
// 3 QUALIFICACAO_RESPONSAVEL, 4 CAPITAL_SOCIAL, 5 PORTE_EMPRESA,
// 6 ENTE_FEDERATIVO_RESPONSAVEL
export interface EmpresaInfo {
  razaoSocial: string;
  porte: string;
  capitalSocial: string;
}

export function parseEmpresaLine(line: string): [cnpjBasico: string, info: EmpresaInfo] {
  const f = splitLine(line);
  return [f[0], { razaoSocial: f[1] ?? "", porte: f[5] ?? "", capitalSocial: f[4] ?? "" }];
}

export const ATIVA = "02";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd radar-comercial-solar && node --experimental-strip-types --test scripts/fonte-cnpj/lib.test.ts`
Expected: PASS — todos os testes verdes.

- [ ] **Step 5: Commit**

```bash
cd radar-comercial-solar
git add scripts/fonte-cnpj/lib.ts scripts/fonte-cnpj/lib.test.ts
git commit -m "feat: extrai parsing/matching puro da base CNPJ para lib.ts testável"
```

---

### Task 2: Agregação de filiais ativas e data de abertura por empresa

**Files:**
- Modify: `radar-comercial-solar/scripts/fonte-cnpj/lib.ts`
- Modify: `radar-comercial-solar/scripts/fonte-cnpj/lib.test.ts`

**Interfaces:**
- Consumes: `parseEstabelecimentoLine`, `ATIVA` (Task 1, mesmo arquivo)
- Produces (usado pela Task 3):
  - `interface AgregadoEmpresa { filiaisAtivas: number; dataAberturaMatriz: string }`
  - `buildAgregacaoFiliais(linhas: AsyncIterable<string>): Promise<Map<string, AgregadoEmpresa>>`

- [ ] **Step 1: Write the failing test**

Append to `radar-comercial-solar/scripts/fonte-cnpj/lib.test.ts` (adicionar ao import existente `buildAgregacaoFiliais`):

```ts
import { buildAgregacaoFiliais } from "./lib.ts";

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

  assert.equal(agregacao.get("11111111")?.filiaisAtivas, 2);
  assert.equal(agregacao.get("11111111")?.dataAberturaMatriz, "20150610");
  assert.equal(agregacao.get("22222222")?.filiaisAtivas, 1);
  assert.equal(agregacao.get("22222222")?.dataAberturaMatriz, "20220301");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd radar-comercial-solar && node --experimental-strip-types --test scripts/fonte-cnpj/lib.test.ts`
Expected: FAIL — `buildAgregacaoFiliais` não está exportado ainda.

- [ ] **Step 3: Write minimal implementation**

Append to `radar-comercial-solar/scripts/fonte-cnpj/lib.ts`:

```ts
export interface AgregadoEmpresa {
  filiaisAtivas: number;
  dataAberturaMatriz: string;
}

// Duas responsabilidades numa passada: contar estabelecimentos ativos por
// empresa (matriz + filiais) e guardar a data de abertura da matriz, quando
// a matriz também estiver ativa. Todos os estabelecimentos de uma empresa
// compartilham o mesmo CNPJ_BASICO e, na prática, caem no mesmo arquivo
// shard da Receita — por isso uma única passada sobre um arquivo já é
// suficiente, sem precisar juntar os 10 arquivos.
export async function buildAgregacaoFiliais(
  linhas: AsyncIterable<string>
): Promise<Map<string, AgregadoEmpresa>> {
  const map = new Map<string, AgregadoEmpresa>();
  for await (const line of linhas) {
    if (!line.trim()) continue;
    const row = parseEstabelecimentoLine(line);
    if (row.situacaoCadastral !== ATIVA) continue;
    const atual = map.get(row.cnpjBasico) ?? { filiaisAtivas: 0, dataAberturaMatriz: "" };
    atual.filiaisAtivas++;
    if (row.identificadorMatrizFilial === "1") {
      atual.dataAberturaMatriz = row.dataInicioAtividade;
    }
    map.set(row.cnpjBasico, atual);
  }
  return map;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd radar-comercial-solar && node --experimental-strip-types --test scripts/fonte-cnpj/lib.test.ts`
Expected: PASS — todos os testes verdes, incluindo o novo.

- [ ] **Step 5: Commit**

```bash
cd radar-comercial-solar
git add scripts/fonte-cnpj/lib.ts scripts/fonte-cnpj/lib.test.ts
git commit -m "feat: agrega nº de filiais ativas e data de abertura por empresa"
```

---

### Task 3: Reescrever orquestração `filtrar-cnpj.ts` (nacional, duas passadas, saída enriquecida)

**Files:**
- Modify: `radar-comercial-solar/scripts/fonte-cnpj/filtrar-cnpj.ts`
- Create: `radar-comercial-solar/scripts/fonte-cnpj/__fixtures__/estabelecimentos-amostra.csv`
- Create: `radar-comercial-solar/scripts/fonte-cnpj/__fixtures__/empresas-amostra.csv`
- Create: `radar-comercial-solar/scripts/fonte-cnpj/__fixtures__/municipios-amostra.csv`
- Create: `radar-comercial-solar/scripts/fonte-cnpj/filtrar-cnpj.integration.test.ts`

**Interfaces:**
- Consumes: tudo de `lib.ts` (Task 1 e 2) — `parseArgs`, `csvEscape`, `matchesCnae`, `parseEstabelecimentoLine`, `parseEmpresaLine`, `buildAgregacaoFiliais`, `ATIVA`, `EmpresaInfo`
- Produces: CSV em `--out` com colunas `cnpj;razao_social;nome_fantasia;porte;capital_social;data_abertura;filiais_ativas;uf;municipio;cnae_principal;cnaes_que_bateram;cep;telefone;email`

- [ ] **Step 1: Criar fixtures de teste**

Create `radar-comercial-solar/scripts/fonte-cnpj/__fixtures__/estabelecimentos-amostra.csv` (3 linhas — uma que bate no perfil A, uma que bate por CNAE secundário, uma que não bate):

```
"33333333";"0001";"90";"1";"SOLAR DISTRIB X";"02";"";"";"";"";"20180315";"4321500";"";"";"";"";"";"";"01000000";"SP";"7107";"11";"999998888";"";"";"";"";"contato@solarx.com.br";"";""
"33333333";"0002";"01";"2";"";"02";"";"";"";"";"20190101";"4661300";"";"";"";"";"";"";"";"PR";"7455";"";"";"";"";"";"";"";"";"";""
"44444444";"0001";"90";"1";"LOJA DE ROUPAS";"02";"";"";"";"";"20200101";"4781400";"";"";"";"";"";"";"";"SP";"7107";"";"";"";"";"";"";"";"";"";""
```

Create `radar-comercial-solar/scripts/fonte-cnpj/__fixtures__/empresas-amostra.csv`:

```
"33333333";"SOLAR DISTRIBUIDORA X LTDA";"2062";"49";"800000,00";"05";""
"44444444";"LOJA DE ROUPAS Y LTDA";"2062";"49";"20000,00";"01";""
```

Create `radar-comercial-solar/scripts/fonte-cnpj/__fixtures__/municipios-amostra.csv`:

```
"7107";"SAO PAULO"
"7455";"CURITIBA"
```

- [ ] **Step 2: Write the failing integration test**

Create `radar-comercial-solar/scripts/fonte-cnpj/filtrar-cnpj.integration.test.ts`:

```ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd radar-comercial-solar && node --experimental-strip-types --test scripts/fonte-cnpj/filtrar-cnpj.integration.test.ts`
Expected: FAIL — cabeçalho/colunas do CSV atual não batem com o esperado (script ainda não reescrito), ou falha por filtro de UF ausente nas fixtures (a fixture não tem UF no `ufSet` do perfil A, que hoje é `["PE","BA",...]` — a UF usada é SP/PR, então o filtro de UF atual bloquearia o match).

- [ ] **Step 4: Write minimal implementation**

Replace `radar-comercial-solar/scripts/fonte-cnpj/filtrar-cnpj.ts` entirely:

```ts
// Filtra a base pública de CNPJ (Receita Federal) por CNAE, nacionalmente, sem IA.
// Uso: ver scripts/fonte-cnpj/README.md
import { createReadStream, existsSync, appendFileSync, writeFileSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  parseArgs,
  csvEscape,
  matchesCnae,
  parseEstabelecimentoLine,
  parseEmpresaLine,
  buildAgregacaoFiliais,
  ATIVA,
  type EmpresaInfo,
} from "./lib.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadMunicipios(filePath: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!filePath || !existsSync(filePath)) return map;
  const rl = createInterface({ input: createReadStream(filePath, { encoding: "latin1" }) });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const [codigo, nome] = line.split(";").map((f) => f.replace(/^"|"$/g, "").trim());
    if (codigo) map.set(codigo, nome);
  }
  return map;
}

async function loadEmpresas(filePath: string): Promise<Map<string, EmpresaInfo>> {
  const map = new Map<string, EmpresaInfo>();
  if (!filePath || !existsSync(filePath)) return map;
  const rl = createInterface({ input: createReadStream(filePath, { encoding: "latin1" }) });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const [cnpjBasico, info] = parseEmpresaLine(line);
    map.set(cnpjBasico, info);
  }
  return map;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const perfil = args.perfil;
  if (perfil !== "a" && perfil !== "b") {
    console.error("Uso: --perfil=a|b --estabelecimentos <arquivo> [--empresas <arquivo>] [--municipios <arquivo>] --out <arquivo>");
    process.exit(1);
  }
  const estabelecimentosPath = args.estabelecimentos;
  const empresasPath = args.empresas ?? "";
  const municipiosPath = args.municipios ?? "";
  const outPath = args.out;
  if (!estabelecimentosPath || !outPath) {
    console.error("Faltam argumentos obrigatórios: --estabelecimentos e --out");
    process.exit(1);
  }
  if (!existsSync(estabelecimentosPath)) {
    console.error(`Arquivo não encontrado: ${estabelecimentosPath}`);
    process.exit(1);
  }

  const cnaesConfig = JSON.parse(readFileSync(path.join(__dirname, "cnaes.json"), "utf-8"));
  const perfilConfig = cnaesConfig[perfil === "a" ? "perfil_a" : "perfil_b"];
  const cnaeSet = new Set<string>(perfilConfig.cnaes);

  console.log(`Perfil ${perfil.toUpperCase()} (${perfilConfig.label}) — busca nacional — CNAEs: ${[...cnaeSet].join(", ")}`);

  console.log("Passo 1/2: agregando nº de filiais ativas e data de abertura por empresa...");
  const rlPass1 = createInterface({ input: createReadStream(estabelecimentosPath, { encoding: "latin1" }) });
  const agregacao = await buildAgregacaoFiliais(rlPass1);

  const [municipios, empresas] = await Promise.all([
    loadMunicipios(municipiosPath),
    loadEmpresas(empresasPath),
  ]);

  const header =
    "cnpj;razao_social;nome_fantasia;porte;capital_social;data_abertura;filiais_ativas;uf;municipio;cnae_principal;cnaes_que_bateram;cep;telefone;email\n";
  if (!existsSync(outPath)) writeFileSync(outPath, header, "utf-8");

  console.log("Passo 2/2: filtrando por CNAE (principal ou secundário) e gravando candidatos...");
  const rlPass2 = createInterface({ input: createReadStream(estabelecimentosPath, { encoding: "latin1" }) });

  let total = 0;
  let matched = 0;
  const buffer: string[] = [];

  for await (const line of rlPass2) {
    if (!line.trim()) continue;
    total++;
    const row = parseEstabelecimentoLine(line);
    if (row.situacaoCadastral !== ATIVA) continue;

    const { matched: bateu, cnaesQueBateram } = matchesCnae(row.cnaePrincipal, row.cnaesSecundarios, cnaeSet);
    if (!bateu) continue;

    matched++;
    const cnpj = `${row.cnpjBasico}${row.cnpjOrdem}${row.cnpjDv}`;
    const empresa = empresas.get(row.cnpjBasico);
    const municipioNome = municipios.get(row.municipioCodigo) ?? row.municipioCodigo;
    const agregado = agregacao.get(row.cnpjBasico);

    buffer.push(
      [
        cnpj,
        csvEscape(empresa?.razaoSocial ?? ""),
        csvEscape(row.nomeFantasia),
        csvEscape(empresa?.porte ?? ""),
        csvEscape(empresa?.capitalSocial ?? ""),
        agregado?.dataAberturaMatriz ?? "",
        String(agregado?.filiaisAtivas ?? 0),
        row.uf,
        csvEscape(municipioNome),
        row.cnaePrincipal,
        csvEscape(cnaesQueBateram.join(",")),
        row.cep,
        row.telefone,
        csvEscape(row.email),
      ].join(";")
    );

    if (buffer.length >= 500) {
      appendFileSync(outPath, buffer.join("\n") + "\n", "utf-8");
      buffer.length = 0;
    }
  }
  if (buffer.length) appendFileSync(outPath, buffer.join("\n") + "\n", "utf-8");

  console.log(`Linhas lidas: ${total} | Candidatos encontrados: ${matched} | Saída: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Note: o filtro de UF (`ufSet.has(uf)`) foi removido — a extração agora é nacional para os dois perfis, conforme a spec.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd radar-comercial-solar && node --experimental-strip-types --test scripts/fonte-cnpj/filtrar-cnpj.integration.test.ts`
Expected: PASS.

Run também os testes unitários pra garantir que nada quebrou: `node --experimental-strip-types --test scripts/fonte-cnpj/lib.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd radar-comercial-solar
git add scripts/fonte-cnpj/filtrar-cnpj.ts scripts/fonte-cnpj/filtrar-cnpj.integration.test.ts scripts/fonte-cnpj/__fixtures__/
git commit -m "feat: extração CNPJ nacional com CNAE secundário, capital social e filiais"
```

---

### Task 4: Script `npm test` e atualização do README

**Files:**
- Modify: `radar-comercial-solar/package.json`
- Modify: `radar-comercial-solar/scripts/fonte-cnpj/README.md`

**Interfaces:**
- Consumes: nenhuma nova — só documenta o que as Tasks 1-3 produziram.

- [ ] **Step 1: Adicionar script de teste ao `package.json`**

Modify `radar-comercial-solar/package.json`, dentro de `"scripts"`, adicionar:

```json
    "test": "node --experimental-strip-types --test scripts/fonte-cnpj/*.test.ts",
```

- [ ] **Step 2: Rodar para confirmar que agrega os dois arquivos de teste**

Run: `cd radar-comercial-solar && npm test`
Expected: PASS — roda `lib.test.ts` e `filtrar-cnpj.integration.test.ts` juntos, todos verdes.

- [ ] **Step 3: Atualizar o README**

Replace `radar-comercial-solar/scripts/fonte-cnpj/README.md` entirely:

```markdown
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
  --estabelecimentos data/2026-08/extracted/Estabelecimentos0.csv \
  --empresas data/2026-08/extracted/Empresas0.csv \
  --municipios data/2026-08/extracted/Municipios.csv \
  --out data/candidatos-cnpj-perfil-a.csv

# repetir trocando Estabelecimentos0 -> Estabelecimentos1, 2, ... 9
# (o --out é append, então vai acumulando um único CSV final)
```

Trocar `--perfil=a` por `--perfil=b` para o Perfil B (industrial/agro/bebidas)
— gerar um `--out` separado por perfil.

## 4. Saída

Um CSV em `data/` com as colunas:

`cnpj;razao_social;nome_fantasia;porte;capital_social;data_abertura;filiais_ativas;uf;municipio;cnae_principal;cnaes_que_bateram;cep;telefone;email`

- `capital_social`, `data_abertura` e `filiais_ativas` são calculados por
  empresa (CNPJ básico), não por estabelecimento — todo estabelecimento da
  mesma empresa carrega o mesmo valor.
- `cnaes_que_bateram` lista quais CNAEs (principal e/ou secundários) casaram
  com o perfil filtrado — útil para auditar falsos positivos depois.

Isso vira o ponto de partida da etapa de score (Fase 2) — filtra ruído
mecanicamente, sem IA lendo site por site.

## Testes

```bash
npm test
```

Roda os testes unitários de `lib.ts` (parsing/matching, agregação de filiais)
e o teste de integração do script completo contra fixtures pequenas em
`__fixtures__/`.
```

- [ ] **Step 4: Commit**

```bash
cd radar-comercial-solar
git add package.json scripts/fonte-cnpj/README.md
git commit -m "docs: documenta extração nacional, novas colunas e npm test"
```

---

### Task 5: Validar com dados reais (Perfil A e B, shard 0)

**Files:** nenhum arquivo de código novo — task de validação usando os dados já baixados em `data/2026-08/`.

**Interfaces:** nenhuma nova — usa o CLI produzido nas Tasks 1-4.

- [ ] **Step 1: Descompactar Empresas0 e Estabelecimentos0**

```bash
cd radar-comercial-solar/data/2026-08
mkdir -p extracted
unzip -p Empresas0.zip > extracted/Empresas0.csv
unzip -p Estabelecimentos0.zip > extracted/Estabelecimentos0.csv
```

- [ ] **Step 2: Baixar `Municipios.zip` (pequeno, ~42KB, faltava no lote original)**

```bash
cd radar-comercial-solar/data/2026-08
curl -L -o Municipios.zip "https://dados-abertos-rf-cnpj.casadosdados.com.br/arquivos/2026-08-09/Municipios.zip"
unzip -p Municipios.zip > extracted/Municipios.csv
```

- [ ] **Step 3: Rodar o filtro para o Perfil A (Solar) contra o shard 0**

```bash
cd radar-comercial-solar
node --experimental-strip-types scripts/fonte-cnpj/filtrar-cnpj.ts \
  --perfil=a \
  --estabelecimentos=data/2026-08/extracted/Estabelecimentos0.csv \
  --empresas=data/2026-08/extracted/Empresas0.csv \
  --municipios=data/2026-08/extracted/Municipios.csv \
  --out=data/candidatos-cnpj-perfil-a.csv
```

Expected: o comando termina sem erro, imprime `Linhas lidas: N | Candidatos encontrados: M | Saída: data/candidatos-cnpj-perfil-a.csv` com `M > 0` (o shard 0 é o maior, deve conter pelo menos alguns candidatos solares).

- [ ] **Step 4: Rodar o filtro para o Perfil B (Industrial/Agro/Bebidas) contra o shard 0**

```bash
cd radar-comercial-solar
node --experimental-strip-types scripts/fonte-cnpj/filtrar-cnpj.ts \
  --perfil=b \
  --estabelecimentos=data/2026-08/extracted/Estabelecimentos0.csv \
  --empresas=data/2026-08/extracted/Empresas0.csv \
  --municipios=data/2026-08/extracted/Municipios.csv \
  --out=data/candidatos-cnpj-perfil-b.csv
```

Expected: mesmo padrão de saída, `M > 0`.

- [ ] **Step 5: Inspecionar amostra do resultado**

```bash
cd radar-comercial-solar
head -5 data/candidatos-cnpj-perfil-a.csv
head -5 data/candidatos-cnpj-perfil-b.csv
wc -l data/candidatos-cnpj-perfil-a.csv data/candidatos-cnpj-perfil-b.csv
```

Confirmar visualmente que as linhas têm `capital_social`, `data_abertura` e
`filiais_ativas` preenchidos (não vazios) para pelo menos algumas empresas, e
que `cnaes_que_bateram` faz sentido para o perfil.

- [ ] **Step 6: Não commitar os CSVs de saída (dados grandes/derivados)**

```bash
cd radar-comercial-solar
git status
```

Confirmar que `data/2026-08/extracted/`, `data/candidatos-cnpj-perfil-a.csv`
e `data/candidatos-cnpj-perfil-b.csv` aparecem como untracked — adicionar ao
`.gitignore` do projeto se ainda não estiverem cobertos:

```bash
cd radar-comercial-solar
grep -q "^data/2026-08/extracted/" .gitignore 2>/dev/null || echo "data/2026-08/extracted/" >> .gitignore
grep -q "^data/candidatos-cnpj-" .gitignore 2>/dev/null || echo "data/candidatos-cnpj-*.csv" >> .gitignore
git add .gitignore
git commit -m "chore: ignora dados extraídos/derivados da base CNPJ"
```

---

## Fora de escopo desta fase (fica para Fase 2 e além)

- Rodar contra os shards 1-9 (o usuário roda depois, mesmo comando, trocando o número do arquivo — documentado no README).
- Score/classificação de potencial (Fase 2, spec `docs/superpowers/specs/2026-08-27-radar-pipeline-cnpj-score-cli-design.md`).
- Resolver os CNPJs ambíguos dos clientes-espelho (DNL, Owens-Illinois, Crown) — necessário antes da calibração na Fase 2, não na extração.
- Roteamento por unidade (REC vs MGA) — explicitamente fora de escopo na spec.
