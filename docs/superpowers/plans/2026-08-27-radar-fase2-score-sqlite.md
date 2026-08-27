# Fase 2 — Score Firmográfico via SQLite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rodar a extração CNPJ completa (10 shards × 2 perfis), importar os candidatos em SQLite com agregação corrigida entre shards, calibrar e aplicar um score firmográfico objetivo, e gerar `data/fila-revisao.json` pronto para a Fase 3 consumir.

**Architecture:** Cinco componentes em pipeline: (1) orquestrador bash que roda a extração da Fase 1 nos 10 shards, (2) importador que consolida os CSVs em SQLite (`node:sqlite`, sem dependência nova) com deduplicação/agregação por `cnpj_basico`, (3) comando de calibração que imprime os dados estruturais dos clientes-espelho, (4) motor de score que aplica `score-config.json` via SQL, (5) gerador de fila que seleciona o top 200 por score e escreve `ReviewLead[]` no formato já consumido pela cadeia Brevo existente.

**Tech Stack:** Node.js 24 (`--experimental-strip-types`, sem build step), `node:sqlite` (`DatabaseSync`, estável desde Node 22.5 — testado nesta sessão, funciona sem flag experimental), `node:test`/`node:assert/strict` para testes.

**Spec:** `docs/superpowers/specs/2026-08-27-radar-fase2-score-sqlite-design.md`

## Global Constraints

- Zero dependências novas — só `node:*` built-ins (mesma regra da Fase 1).
- Cobre os dois perfis (A=Solar, B=Industrial/Agro/Bebidas) desde já.
- `data/candidatos.db` e os CSVs consolidados NÃO são commitados no git (dados derivados/grandes — mesma regra do `.gitignore` já aplicado em `data/` na Fase 1).
- Import e geração de fila são idempotentes: reimportar não duplica linhas; regerar a fila não repete os mesmos 200 já enfileirados (rastreado via `na_fila_desde`).
- Clientes-espelho usados na calibração (CNPJs básicos resolvidos nesta sessão): ver tabela na spec — Owens-Illinois=`08910541`, Crown Embalagens=`33174335`, DNL Comércio excluído.

---

## Mapa de arquivos

- Create: `radar-comercial-solar/scripts/fonte-cnpj/extrair-todos-shards.sh` — orquestrador (Task 1)
- Create: `radar-comercial-solar/scripts/fonte-cnpj/db.ts` — abertura/schema SQLite compartilhado
- Create: `radar-comercial-solar/scripts/fonte-cnpj/csv-import-lib.ts` — parsing/agregação puros (testável)
- Create: `radar-comercial-solar/scripts/fonte-cnpj/csv-import-lib.test.ts`
- Create: `radar-comercial-solar/scripts/fonte-cnpj/importar-candidatos.ts` — orquestração do import (Task 2)
- Create: `radar-comercial-solar/scripts/fonte-cnpj/clientes-espelho.json` — CNPJs básicos por perfil (Task 3)
- Create: `radar-comercial-solar/scripts/fonte-cnpj/calibrar.ts` (Task 3)
- Create: `radar-comercial-solar/scripts/fonte-cnpj/score-config.json` — limiares/pesos default (Task 4)
- Create: `radar-comercial-solar/scripts/fonte-cnpj/score-lib.ts` — cálculo de score, puro (Task 4)
- Create: `radar-comercial-solar/scripts/fonte-cnpj/score-lib.test.ts`
- Create: `radar-comercial-solar/scripts/fonte-cnpj/pontuar.ts` — orquestração do score (Task 4)
- Create: `radar-comercial-solar/scripts/fonte-cnpj/fila-lib.ts` — montagem de `ReviewLead`, puro (Task 5)
- Create: `radar-comercial-solar/scripts/fonte-cnpj/fila-lib.test.ts`
- Create: `radar-comercial-solar/scripts/fonte-cnpj/gerar-fila.ts` — orquestração da fila (Task 5)
- Modify: `radar-comercial-solar/package.json` — novos scripts npm
- Modify: `radar-comercial-solar/scripts/fonte-cnpj/README.md` — documentar o fluxo completo

---

### Task 1: Orquestrador de extração completa (10 shards)

**Files:**
- Create: `radar-comercial-solar/scripts/download_cnpj_202608.sh` já existe — não mexer
- Create: `radar-comercial-solar/scripts/fonte-cnpj/extrair-todos-shards.sh`

**Interfaces:**
- Produces: `data/candidatos-cnpj-perfil-a.csv` e `data/candidatos-cnpj-perfil-b.csv` completos (10 shards concatenados) — consumidos pela Task 2.

Este script não precisa de teste automatizado (é infraestrutura de orquestração de I/O pesado, não lógica pura) — a validação é a Task 1's próprio "Step 3" rodando de verdade.

- [ ] **Step 1: Escrever o script**

Create `radar-comercial-solar/scripts/fonte-cnpj/extrair-todos-shards.sh`:

```bash
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
```

- [ ] **Step 2: Tornar executável**

```bash
chmod +x radar-comercial-solar/scripts/fonte-cnpj/extrair-todos-shards.sh
```

- [ ] **Step 3: Rodar para o Perfil A completo (validação real)**

```bash
cd radar-comercial-solar
./scripts/fonte-cnpj/extrair-todos-shards.sh a
```

Expected: script termina sem erro, imprime progresso "Shard N de 9" dez vezes, e no fim mostra a contagem de linhas de `data/candidatos-cnpj-perfil-a.csv` (deve ser bem maior que os 697.667 já validados só com o shard 0, já que agora inclui os outros 9).

**Isto pode levar bastante tempo** (dezenas de minutos a horas, dependendo do hardware — 10 shards, cada um com download+unzip+processamento de milhões de linhas). Rode em background se possível.

- [ ] **Step 4: Rodar para o Perfil B completo**

```bash
cd radar-comercial-solar
./scripts/fonte-cnpj/extrair-todos-shards.sh b
```

Expected: mesmo padrão, gera `data/candidatos-cnpj-perfil-b.csv`.

- [ ] **Step 5: Commit**

```bash
cd radar-comercial-solar
git add scripts/fonte-cnpj/extrair-todos-shards.sh
git commit -m "feat: orquestrador de extração CNPJ completa (10 shards)"
```

(Os CSVs de saída em `data/` não são commitados — já cobertos pelo `.gitignore` da Fase 1.)

---

### Task 2: Import SQLite com agregação cruzada de shards

**Files:**
- Create: `radar-comercial-solar/scripts/fonte-cnpj/db.ts`
- Create: `radar-comercial-solar/scripts/fonte-cnpj/csv-import-lib.ts`
- Create: `radar-comercial-solar/scripts/fonte-cnpj/csv-import-lib.test.ts`
- Create: `radar-comercial-solar/scripts/fonte-cnpj/importar-candidatos.ts`

**Interfaces:**
- Consumes: `data/candidatos-cnpj-perfil-a.csv` / `-b.csv` (saída da Task 1)
- Produces (usado pelas Tasks 3-5):
  - `openDb(dbPath?: string): DatabaseSync` — abre/cria `data/candidatos.db` com o schema `candidatos`
  - `parseCsvLine(line: string): string[]` — parser CSV respeitando aspas/escaping (mesmo estilo do `csvEscape` da Fase 1)
  - `parseCapitalSocial(raw: string): number` — converte `"800000,00"` → `800000.00`
  - `interface CandidatoAgregado { cnpjBasico, cnpjCompleto, razaoSocial, nomeFantasia, porte, capitalSocial, dataAbertura, filiaisAtivas, uf, municipio, cnaePrincipal, cnaesQueBateram, cep, telefone, email }`
  - `agregarCandidatos(linhas: AsyncIterable<string>): Promise<Map<string, CandidatoAgregado>>` — lê o CSV (pulando cabeçalho), deduplica pares `(cnpjBasico, filiaisAtivas)` distintos e soma (corrige contagem quando a mesma empresa aparece em shards diferentes), mantém os demais campos da última linha vista, e usa a primeira `dataAbertura` não-vazia encontrada.

- [ ] **Step 1: Write the failing test**

Create `radar-comercial-solar/scripts/fonte-cnpj/csv-import-lib.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd radar-comercial-solar && node --experimental-strip-types --test scripts/fonte-cnpj/csv-import-lib.test.ts`
Expected: FAIL — `csv-import-lib.ts` não existe.

- [ ] **Step 3: Write minimal implementation**

Create `radar-comercial-solar/scripts/fonte-cnpj/csv-import-lib.ts`:

```ts
// Parsing/agregação puros do CSV consolidado gerado pela Fase 1
// (data/candidatos-cnpj-perfil-*.csv). Sem I/O de arquivo — recebe um
// AsyncIterable<string> de linhas (tipicamente de readline).

export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ";") {
      fields.push(current);
      current = "";
      continue;
    }

    current += ch;
  }
  fields.push(current);
  return fields;
}

export function parseCapitalSocial(raw: string): number {
  if (!raw) return 0;
  return Number(raw.replace(",", ".")) || 0;
}

export interface CandidatoAgregado {
  cnpjBasico: string;
  cnpjCompleto: string;
  razaoSocial: string;
  nomeFantasia: string;
  porte: string;
  capitalSocial: number;
  dataAbertura: string;
  filiaisAtivas: number;
  uf: string;
  municipio: string;
  cnaePrincipal: string;
  cnaesQueBateram: string;
  cep: string;
  telefone: string;
  email: string;
}

export async function agregarCandidatos(
  linhas: AsyncIterable<string>
): Promise<Map<string, CandidatoAgregado>> {
  const resultado = new Map<string, CandidatoAgregado>();
  const filiaisVistos = new Map<string, Set<number>>();
  let isHeader = true;

  for await (const line of linhas) {
    if (isHeader) {
      isHeader = false;
      continue;
    }
    if (!line.trim()) continue;

    const f = parseCsvLine(line);
    const cnpjCompleto = f[0];
    const cnpjBasico = cnpjCompleto.slice(0, 8);
    const filiaisAtivas = Number(f[6]) || 0;
    const dataAbertura = f[5];

    const vistos = filiaisVistos.get(cnpjBasico) ?? new Set<number>();
    const jaSomado = vistos.has(filiaisAtivas);
    filiaisVistos.set(cnpjBasico, vistos);

    const anterior = resultado.get(cnpjBasico);
    const somaFiliais = (anterior?.filiaisAtivas ?? 0) + (jaSomado ? 0 : filiaisAtivas);
    if (!jaSomado) vistos.add(filiaisAtivas);

    resultado.set(cnpjBasico, {
      cnpjBasico,
      cnpjCompleto,
      razaoSocial: f[1],
      nomeFantasia: f[2],
      porte: f[3],
      capitalSocial: parseCapitalSocial(f[4]),
      dataAbertura: dataAbertura || anterior?.dataAbertura || "",
      filiaisAtivas: somaFiliais,
      uf: f[7],
      municipio: f[8],
      cnaePrincipal: f[9],
      cnaesQueBateram: f[10],
      cep: f[11],
      telefone: f[12],
      email: f[13],
    });
  }

  return resultado;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd radar-comercial-solar && node --experimental-strip-types --test scripts/fonte-cnpj/csv-import-lib.test.ts`
Expected: PASS — todos os 5 testes verdes.

- [ ] **Step 5: Write `db.ts`**

Create `radar-comercial-solar/scripts/fonte-cnpj/db.ts`:

```ts
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DEFAULT_DB_PATH = path.join(__dirname, "..", "..", "data", "candidatos.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS candidatos (
  cnpj_basico TEXT PRIMARY KEY,
  perfil TEXT NOT NULL,
  cnpj_completo TEXT NOT NULL,
  razao_social TEXT,
  nome_fantasia TEXT,
  porte TEXT,
  capital_social REAL,
  data_abertura TEXT,
  filiais_ativas INTEGER,
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
  potencial TEXT,
  na_fila_desde TEXT,
  status_revisao TEXT
);
`;

export function openDb(dbPath: string = DEFAULT_DB_PATH): DatabaseSync {
  const db = new DatabaseSync(dbPath);
  db.exec(SCHEMA);
  return db;
}
```

- [ ] **Step 6: Write `importar-candidatos.ts`**

Create `radar-comercial-solar/scripts/fonte-cnpj/importar-candidatos.ts`:

```ts
import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "./db.ts";
import { agregarCandidatos } from "./csv-import-lib.ts";
import { parseArgs } from "./lib.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const perfil = args.perfil;
  if (perfil !== "a" && perfil !== "b") {
    console.error("Uso: --perfil=a|b [--csv <arquivo>]");
    process.exit(1);
  }

  const csvPath =
    args.csv ?? path.join(__dirname, "..", "..", "data", `candidatos-cnpj-perfil-${perfil}.csv`);

  if (!existsSync(csvPath)) {
    console.error(`Arquivo não encontrado: ${csvPath}`);
    process.exit(1);
  }

  console.log(`Lendo e agregando ${csvPath}...`);
  const rl = createInterface({ input: createReadStream(csvPath, { encoding: "utf-8" }) });
  const agregados = await agregarCandidatos(rl);

  console.log(`Importando ${agregados.size} empresas para SQLite...`);
  const db = openDb();
  const upsert = db.prepare(`
    INSERT INTO candidatos (
      cnpj_basico, perfil, cnpj_completo, razao_social, nome_fantasia, porte,
      capital_social, data_abertura, filiais_ativas, uf, municipio,
      cnae_principal, cnaes_que_bateram, cep, telefone, email
    ) VALUES (
      :cnpj_basico, :perfil, :cnpj_completo, :razao_social, :nome_fantasia, :porte,
      :capital_social, :data_abertura, :filiais_ativas, :uf, :municipio,
      :cnae_principal, :cnaes_que_bateram, :cep, :telefone, :email
    )
    ON CONFLICT(cnpj_basico) DO UPDATE SET
      perfil = excluded.perfil,
      cnpj_completo = excluded.cnpj_completo,
      razao_social = excluded.razao_social,
      nome_fantasia = excluded.nome_fantasia,
      porte = excluded.porte,
      capital_social = excluded.capital_social,
      data_abertura = excluded.data_abertura,
      filiais_ativas = excluded.filiais_ativas,
      uf = excluded.uf,
      municipio = excluded.municipio,
      cnae_principal = excluded.cnae_principal,
      cnaes_que_bateram = excluded.cnaes_que_bateram,
      cep = excluded.cep,
      telefone = excluded.telefone,
      email = excluded.email
  `);

  for (const c of agregados.values()) {
    upsert.run({
      cnpj_basico: c.cnpjBasico,
      perfil,
      cnpj_completo: c.cnpjCompleto,
      razao_social: c.razaoSocial,
      nome_fantasia: c.nomeFantasia,
      porte: c.porte,
      capital_social: c.capitalSocial,
      data_abertura: c.dataAbertura,
      filiais_ativas: c.filiaisAtivas,
      uf: c.uf,
      municipio: c.municipio,
      cnae_principal: c.cnaePrincipal,
      cnaes_que_bateram: c.cnaesQueBateram,
      cep: c.cep,
      telefone: c.telefone,
      email: c.email,
    });
  }

  db.close();
  console.log(`Concluído. ${agregados.size} empresas importadas/atualizadas (perfil ${perfil}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Note: `ON CONFLICT ... DO UPDATE` faz o upsert idempotente — reimportar o mesmo CSV não duplica linhas, só atualiza.

- [ ] **Step 7: Adicionar script npm e testar manualmente com fixture pequena**

Modify `radar-comercial-solar/package.json`, adicionar em `"scripts"`:

```json
    "radar:importar-candidatos": "node --experimental-strip-types scripts/fonte-cnpj/importar-candidatos.ts",
```

Testar com um CSV pequeno de exemplo:

```bash
cd radar-comercial-solar
mkdir -p /tmp/radar-teste
cat > /tmp/radar-teste/teste.csv << 'EOF'
cnpj;razao_social;nome_fantasia;porte;capital_social;data_abertura;filiais_ativas;uf;municipio;cnae_principal;cnaes_que_bateram;cep;telefone;email
11111111000190;EMPRESA TESTE LTDA;;05;800000,00;20180315;1;SP;SAO PAULO;4321500;4321500;01000000;11999998888;teste@teste.com
EOF
node --experimental-strip-types scripts/fonte-cnpj/importar-candidatos.ts --perfil=a --csv=/tmp/radar-teste/teste.csv
node -e "const {DatabaseSync}=require('node:sqlite'); const db=new DatabaseSync('data/candidatos.db'); console.log(db.prepare('SELECT * FROM candidatos').all());"
rm -f data/candidatos.db
rm -rf /tmp/radar-teste
```

Expected: imprime a linha importada com os campos corretos, depois remove o banco de teste (não deixar `candidatos.db` de teste no lugar do banco real).

- [ ] **Step 8: Commit**

```bash
cd radar-comercial-solar
git add scripts/fonte-cnpj/db.ts scripts/fonte-cnpj/csv-import-lib.ts scripts/fonte-cnpj/csv-import-lib.test.ts scripts/fonte-cnpj/importar-candidatos.ts package.json
git commit -m "feat: import SQLite dos candidatos CNPJ com agregação cruzada de shards"
```

---

### Task 3: Comando de calibração

**Files:**
- Create: `radar-comercial-solar/scripts/fonte-cnpj/clientes-espelho.json`
- Create: `radar-comercial-solar/scripts/fonte-cnpj/calibrar.ts`

**Interfaces:**
- Consumes: `openDb` (Task 2), tabela `candidatos` populada
- Produces: saída de terminal (tabela formatada) — não produz artefato de arquivo

- [ ] **Step 1: Criar o arquivo de CNPJs dos clientes-espelho**

Create `radar-comercial-solar/scripts/fonte-cnpj/clientes-espelho.json`:

```json
{
  "perfil_a": {
    "FOTUS Distribuidora": "15701525",
    "Solfácil": "31931053",
    "Sol Copérnico": "39798207",
    "Gradiente Solar": "39942227"
  },
  "perfil_b": {
    "Ambev": "07526557",
    "Coamo Agroindustrial": "75904383",
    "Owens-Illinois": "08910541",
    "Crown Embalagens": "33174335",
    "Trigobel": "03438822",
    "Camil": "64904295",
    "Spal Indústria": "61186888",
    "HNK BR Indústria": "50221019"
  },
  "_excluidos": {
    "DNL Comércio": "CNPJ 07189629 não encontrado em nenhum dos 10 shards de Estabelecimentos — excluído da calibração, ver spec Fase 2"
  }
}
```

- [ ] **Step 2: Escrever `calibrar.ts`**

Create `radar-comercial-solar/scripts/fonte-cnpj/calibrar.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "./db.ts";
import { parseArgs } from "./lib.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function calcularIdadeAnos(dataAbertura: string): number | null {
  if (!dataAbertura || dataAbertura.length !== 8) return null;
  const ano = Number(dataAbertura.slice(0, 4));
  const mes = Number(dataAbertura.slice(4, 6));
  const dia = Number(dataAbertura.slice(6, 8));
  const abertura = new Date(ano, mes - 1, dia);
  const hoje = new Date();
  const anos = (hoje.getTime() - abertura.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  return Math.floor(anos);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const perfil = args.perfil;
  if (perfil !== "a" && perfil !== "b") {
    console.error("Uso: --perfil=a|b");
    process.exit(1);
  }

  const clientesEspelho = JSON.parse(
    readFileSync(path.join(__dirname, "clientes-espelho.json"), "utf-8")
  );
  const grupo = clientesEspelho[perfil === "a" ? "perfil_a" : "perfil_b"] as Record<string, string>;

  const db = openDb();
  const buscar = db.prepare("SELECT * FROM candidatos WHERE cnpj_basico = ?");

  console.log(`\nClientes-espelho — Perfil ${perfil.toUpperCase()}\n`);
  console.log(
    "Nome".padEnd(28) +
      "CNPJ básico".padEnd(14) +
      "Capital social".padEnd(18) +
      "Filiais".padEnd(10) +
      "Idade (anos)".padEnd(14) +
      "Porte"
  );
  console.log("-".repeat(90));

  for (const [nome, cnpjBasico] of Object.entries(grupo)) {
    const row = buscar.get(cnpjBasico) as Record<string, unknown> | undefined;
    if (!row) {
      console.log(`${nome.padEnd(28)}${cnpjBasico.padEnd(14)}(não encontrado na tabela candidatos — rode o import primeiro, ou a empresa não bateu CNAE do perfil)`);
      continue;
    }
    const idade = calcularIdadeAnos(String(row.data_abertura ?? ""));
    console.log(
      nome.padEnd(28) +
        String(cnpjBasico).padEnd(14) +
        String(row.capital_social ?? "").padEnd(18) +
        String(row.filiais_ativas ?? "").padEnd(10) +
        String(idade ?? "?").padEnd(14) +
        String(row.porte ?? "")
    );
  }

  console.log("\nUse esses números para ajustar os limiares em score-config.json.\n");
  db.close();
}

main();
```

- [ ] **Step 3: Adicionar script npm**

Modify `radar-comercial-solar/package.json`, adicionar:

```json
    "radar:calibrar": "node --experimental-strip-types scripts/fonte-cnpj/calibrar.ts",
```

- [ ] **Step 4: Testar manualmente**

```bash
cd radar-comercial-solar
npm run radar:calibrar -- --perfil=a
npm run radar:calibrar -- --perfil=b
```

Expected: imprime a tabela para cada cliente-espelho do perfil. Se o banco ainda não tiver os dados completos importados (Tasks 1-2 ainda rodando), vai mostrar "não encontrado" para a maioria — isso é esperado até o import completo estar pronto; o importante é confirmar que o comando roda sem erro e formata corretamente para quem já estiver no banco.

- [ ] **Step 5: Commit**

```bash
cd radar-comercial-solar
git add scripts/fonte-cnpj/clientes-espelho.json scripts/fonte-cnpj/calibrar.ts package.json
git commit -m "feat: comando de calibração — imprime dados estruturais dos clientes-espelho"
```

---

### Task 4: Motor de score

**Files:**
- Create: `radar-comercial-solar/scripts/fonte-cnpj/score-config.json`
- Create: `radar-comercial-solar/scripts/fonte-cnpj/score-lib.ts`
- Create: `radar-comercial-solar/scripts/fonte-cnpj/score-lib.test.ts`
- Create: `radar-comercial-solar/scripts/fonte-cnpj/pontuar.ts`

**Interfaces:**
- Consumes: `openDb` (Task 2), `score-config.json`
- Produces (usado pela Task 5): tabela `candidatos` com `score_fit`, `score_estrutura`, `score_geografia`, `score_total`, `potencial` preenchidos
  - `interface ScoreConfig { estrutura: {...}, pesos: {...}, faixas: {...} }`
  - `calcularScore(candidato: CandidatoParaScore, config: ScoreConfig, cnaesDoPerfil: Set<string>, cidadesPrioritarias: Set<string>, ufsDoPerfil: Set<string>): { scoreFit, scoreEstrutura, scoreGeografia, scoreTotal, potencial }`

- [ ] **Step 1: Criar `score-config.json` com valores de partida**

Create `radar-comercial-solar/scripts/fonte-cnpj/score-config.json`:

```json
{
  "perfil_a": {
    "estrutura": { "capital_social_min": 500000, "filiais_min": 2, "idade_anos_min": 3 },
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
  "perfil_b": {
    "estrutura": { "capital_social_min": 500000, "filiais_min": 2, "idade_anos_min": 3 },
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
  "_aviso": "Valores de partida — ajustar depois de rodar radar:calibrar com os clientes-espelho reais."
}
```

- [ ] **Step 2: Write the failing test**

Create `radar-comercial-solar/scripts/fonte-cnpj/score-lib.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularScore, type ScoreConfig, type CandidatoParaScore } from "./score-lib.ts";

const config: ScoreConfig = {
  estrutura: { capital_social_min: 500000, filiais_min: 2, idade_anos_min: 3 },
  pesos: {
    fit_cnae_principal: 30,
    fit_cnae_secundario: 15,
    estrutura_filiais: 25,
    estrutura_porte: 15,
    estrutura_capital: 10,
    estrutura_idade: 10,
    geo_cidade_prioritaria: 15,
    geo_uf_perfil: 10,
  },
  faixas: { baixo_max: 39, medio_max: 69 },
};

const cnaesDoPerfil = new Set(["4321500", "4669999"]);
const cidadesPrioritarias = new Set(["MARINGA", "CABO DE SANTO AGOSTINHO", "BARUERI"]);
const ufsDoPerfil = new Set(["PE", "BA", "PR", "SP"]);

const anoAtual = new Date().getFullYear();

function candidato(overrides: Partial<CandidatoParaScore>): CandidatoParaScore {
  return {
    cnaePrincipal: "4321500",
    cnaesQueBateram: "4321500",
    filiaisAtivas: 1,
    porte: "01",
    capitalSocial: 0,
    dataAbertura: "",
    municipio: "",
    uf: "",
    ...overrides,
  };
}

test("empresa forte em todas as camadas recebe score alto", () => {
  const c = candidato({
    cnaePrincipal: "4321500",
    filiaisAtivas: 3,
    porte: "05",
    capitalSocial: 1000000,
    dataAbertura: `${anoAtual - 10}0101`,
    municipio: "MARINGA",
  });
  const r = calcularScore(c, config, cnaesDoPerfil, cidadesPrioritarias, ufsDoPerfil);
  assert.equal(r.scoreFit, 30);
  assert.equal(r.scoreEstrutura, 25 + 15 + 10 + 10);
  assert.equal(r.scoreGeografia, 15);
  assert.equal(r.scoreTotal, 30 + 60 + 15);
  assert.equal(r.potencial, "alto");
});

test("match só por CNAE secundário pontua fit_cnae_secundario, não o principal", () => {
  const c = candidato({ cnaePrincipal: "9999999", cnaesQueBateram: "4669999" });
  const r = calcularScore(c, config, cnaesDoPerfil, cidadesPrioritarias, ufsDoPerfil);
  assert.equal(r.scoreFit, 15);
});

test("empresa fraca em tudo recebe potencial baixo", () => {
  const c = candidato({ filiaisAtivas: 1, porte: "01", capitalSocial: 0, dataAbertura: "" });
  const r = calcularScore(c, config, cnaesDoPerfil, cidadesPrioritarias, ufsDoPerfil);
  assert.equal(r.scoreEstrutura, 0);
  assert.equal(r.scoreGeografia, 0);
  assert.equal(r.potencial, "baixo");
});

test("UF do perfil sem cidade prioritária pontua geo_uf_perfil, não geo_cidade_prioritaria", () => {
  const c = candidato({ municipio: "LONDRINA", uf: "PR" });
  const r = calcularScore(c, config, cnaesDoPerfil, cidadesPrioritarias, ufsDoPerfil);
  assert.equal(r.scoreGeografia, 10);
});

test("faixas de classificação respeitam os limites configurados", () => {
  assert.equal(
    calcularScore(candidato({ filiaisAtivas: 2, porte: "05" }), config, cnaesDoPerfil, cidadesPrioritarias, ufsDoPerfil).potencial,
    "medio"
  );
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd radar-comercial-solar && node --experimental-strip-types --test scripts/fonte-cnpj/score-lib.test.ts`
Expected: FAIL — `score-lib.ts` não existe.

- [ ] **Step 4: Write minimal implementation**

Create `radar-comercial-solar/scripts/fonte-cnpj/score-lib.ts`:

```ts
export interface ScoreConfig {
  estrutura: { capital_social_min: number; filiais_min: number; idade_anos_min: number };
  pesos: {
    fit_cnae_principal: number;
    fit_cnae_secundario: number;
    estrutura_filiais: number;
    estrutura_porte: number;
    estrutura_capital: number;
    estrutura_idade: number;
    geo_cidade_prioritaria: number;
    geo_uf_perfil: number;
  };
  faixas: { baixo_max: number; medio_max: number };
}

export interface CandidatoParaScore {
  cnaePrincipal: string;
  cnaesQueBateram: string; // string separada por vírgula, ex: "4321500,4669999"
  filiaisAtivas: number;
  porte: string; // "01" = ME, "03" = EPP, "05" = Demais (RFB)
  capitalSocial: number;
  dataAbertura: string; // YYYYMMDD ou ""
  municipio: string;
  uf: string;
}

function calcularIdadeAnos(dataAbertura: string): number {
  if (!dataAbertura || dataAbertura.length !== 8) return 0;
  const ano = Number(dataAbertura.slice(0, 4));
  const mes = Number(dataAbertura.slice(4, 6));
  const dia = Number(dataAbertura.slice(6, 8));
  const abertura = new Date(ano, mes - 1, dia);
  const hoje = new Date();
  return Math.floor((hoje.getTime() - abertura.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
}

export function calcularScore(
  candidato: CandidatoParaScore,
  config: ScoreConfig,
  cnaesDoPerfil: Set<string>,
  cidadesPrioritarias: Set<string>,
  ufsDoPerfil: Set<string>
): {
  scoreFit: number;
  scoreEstrutura: number;
  scoreGeografia: number;
  scoreTotal: number;
  potencial: "alto" | "medio" | "baixo";
} {
  const scoreFit = cnaesDoPerfil.has(candidato.cnaePrincipal)
    ? config.pesos.fit_cnae_principal
    : config.pesos.fit_cnae_secundario;

  let scoreEstrutura = 0;
  if (candidato.filiaisAtivas >= config.estrutura.filiais_min) scoreEstrutura += config.pesos.estrutura_filiais;
  if (candidato.porte !== "01") scoreEstrutura += config.pesos.estrutura_porte;
  if (candidato.capitalSocial >= config.estrutura.capital_social_min) scoreEstrutura += config.pesos.estrutura_capital;
  if (calcularIdadeAnos(candidato.dataAbertura) >= config.estrutura.idade_anos_min) scoreEstrutura += config.pesos.estrutura_idade;

  let scoreGeografia = 0;
  if (cidadesPrioritarias.has(candidato.municipio)) {
    scoreGeografia = config.pesos.geo_cidade_prioritaria;
  } else if (ufsDoPerfil.has(candidato.uf)) {
    scoreGeografia = config.pesos.geo_uf_perfil;
  }

  const scoreTotal = scoreFit + scoreEstrutura + scoreGeografia;
  const potencial = scoreTotal > config.faixas.medio_max ? "alto" : scoreTotal > config.faixas.baixo_max ? "medio" : "baixo";

  return { scoreFit, scoreEstrutura, scoreGeografia, scoreTotal, potencial };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd radar-comercial-solar && node --experimental-strip-types --test scripts/fonte-cnpj/score-lib.test.ts`
Expected: PASS — todos os 5 testes verdes.

- [ ] **Step 6: Write `pontuar.ts`**

Create `radar-comercial-solar/scripts/fonte-cnpj/pontuar.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "./db.ts";
import { calcularScore, type ScoreConfig } from "./score-lib.ts";
import { parseArgs } from "./lib.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CIDADES_PRIORITARIAS = new Set(["CABO DE SANTO AGOSTINHO", "MARINGA", "BARUERI"]);

function main() {
  const args = parseArgs(process.argv.slice(2));
  const perfil = args.perfil;
  if (perfil !== "a" && perfil !== "b") {
    console.error("Uso: --perfil=a|b");
    process.exit(1);
  }

  const scoreConfigRaw = JSON.parse(readFileSync(path.join(__dirname, "score-config.json"), "utf-8"));
  const config: ScoreConfig = scoreConfigRaw[perfil === "a" ? "perfil_a" : "perfil_b"];

  const cnaesConfig = JSON.parse(readFileSync(path.join(__dirname, "cnaes.json"), "utf-8"));
  const perfilCnaeConfig = cnaesConfig[perfil === "a" ? "perfil_a" : "perfil_b"];
  const cnaesDoPerfil = new Set<string>(perfilCnaeConfig.cnaes);
  const ufsDoPerfil = new Set<string>(perfilCnaeConfig.ufs);

  const db = openDb();
  const rows = db.prepare("SELECT cnpj_basico, cnae_principal, cnaes_que_bateram, filiais_ativas, porte, capital_social, data_abertura, municipio, uf FROM candidatos WHERE perfil = ?").all(perfil) as Array<Record<string, unknown>>;

  const update = db.prepare(`
    UPDATE candidatos SET score_fit = :score_fit, score_estrutura = :score_estrutura,
      score_geografia = :score_geografia, score_total = :score_total, potencial = :potencial
    WHERE cnpj_basico = :cnpj_basico
  `);

  console.log(`Pontuando ${rows.length} candidatos do perfil ${perfil}...`);

  let alto = 0, medio = 0, baixo = 0;
  for (const row of rows) {
    const resultado = calcularScore(
      {
        cnaePrincipal: String(row.cnae_principal ?? ""),
        cnaesQueBateram: String(row.cnaes_que_bateram ?? ""),
        filiaisAtivas: Number(row.filiais_ativas ?? 0),
        porte: String(row.porte ?? ""),
        capitalSocial: Number(row.capital_social ?? 0),
        dataAbertura: String(row.data_abertura ?? ""),
        municipio: String(row.municipio ?? ""),
        uf: String(row.uf ?? ""),
      },
      config,
      cnaesDoPerfil,
      CIDADES_PRIORITARIAS,
      ufsDoPerfil
    );

    update.run({
      score_fit: resultado.scoreFit,
      score_estrutura: resultado.scoreEstrutura,
      score_geografia: resultado.scoreGeografia,
      score_total: resultado.scoreTotal,
      potencial: resultado.potencial,
      cnpj_basico: row.cnpj_basico,
    });

    if (resultado.potencial === "alto") alto++;
    else if (resultado.potencial === "medio") medio++;
    else baixo++;
  }

  db.close();
  console.log(`Concluído. Alto: ${alto} | Médio: ${medio} | Baixo: ${baixo}`);
}

main();
```

- [ ] **Step 7: Adicionar script npm**

Modify `radar-comercial-solar/package.json`, adicionar:

```json
    "radar:pontuar": "node --experimental-strip-types scripts/fonte-cnpj/pontuar.ts",
```

- [ ] **Step 8: Commit**

```bash
cd radar-comercial-solar
git add scripts/fonte-cnpj/score-config.json scripts/fonte-cnpj/score-lib.ts scripts/fonte-cnpj/score-lib.test.ts scripts/fonte-cnpj/pontuar.ts package.json
git commit -m "feat: motor de score firmográfico (fit + estrutura + geografia)"
```

---

### Task 5: Gerador de fila de revisão

**Files:**
- Create: `radar-comercial-solar/scripts/fonte-cnpj/fila-lib.ts`
- Create: `radar-comercial-solar/scripts/fonte-cnpj/fila-lib.test.ts`
- Create: `radar-comercial-solar/scripts/fonte-cnpj/gerar-fila.ts`

**Interfaces:**
- Consumes: `openDb` (Task 2), tabela `candidatos` pontuada (Task 4), `ReviewLead`/`PotentialLevel`/`ReviewDecision` de `src/contracts/lead-types.ts`
- Produces: `data/fila-revisao.json` (`ReviewLead[]`) — consumido pela Fase 3 (não implementada)

- [ ] **Step 1: Write the failing test**

Create `radar-comercial-solar/scripts/fonte-cnpj/fila-lib.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { construirReviewLead, type CandidatoParaFila } from "./fila-lib.ts";

const candidato: CandidatoParaFila = {
  cnpjCompleto: "11111111000190",
  razaoSocial: "EMPRESA TESTE SOLAR LTDA",
  nomeFantasia: "TESTE SOLAR",
  uf: "PE",
  municipio: "CABO DE SANTO AGOSTINHO",
  cnaesQueBateram: "4321500,4669999",
  telefone: "81999998888",
  email: "contato@testesolar.com.br",
  scoreTotal: 85,
  scoreFit: 30,
  scoreEstrutura: 40,
  scoreGeografia: 15,
  potencial: "alto",
};

test("construirReviewLead preenche todos os campos obrigatórios de ReviewLead", () => {
  const lead = construirReviewLead(candidato, "a");
  assert.equal(lead.companyName, "EMPRESA TESTE SOLAR LTDA");
  assert.equal(lead.city, "CABO DE SANTO AGOSTINHO");
  assert.equal(lead.state, "PE");
  assert.equal(lead.score, 85);
  assert.equal(lead.potential, "alto");
  assert.equal(lead.contactPhone, "81999998888");
  assert.equal(lead.contactEmail, "contato@testesolar.com.br");
  assert.equal(lead.suggestedDecision, "pendente");
  assert.equal(lead.destinoSugerido, "leads-qualificados.md");
  assert.ok(lead.id.length > 0);
  assert.ok(lead.blocoMarkdown.includes("EMPRESA TESTE SOLAR LTDA"));
  assert.ok(lead.blocoMarkdown.includes("81999998888"));
  assert.deepEqual(lead.signals, ["4321500", "4669999"]);
});

test("construirReviewLead usa CNPJ completo como parte do id (estável entre execuções)", () => {
  const lead1 = construirReviewLead(candidato, "a");
  const lead2 = construirReviewLead(candidato, "a");
  assert.equal(lead1.id, lead2.id, "o id deve ser determinístico para o mesmo CNPJ, não aleatório");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd radar-comercial-solar && node --experimental-strip-types --test scripts/fonte-cnpj/fila-lib.test.ts`
Expected: FAIL — `fila-lib.ts` não existe.

- [ ] **Step 3: Write minimal implementation**

Create `radar-comercial-solar/scripts/fonte-cnpj/fila-lib.ts`:

```ts
import type { ReviewLead } from "../../src/contracts/lead-types.ts";

export interface CandidatoParaFila {
  cnpjCompleto: string;
  razaoSocial: string;
  nomeFantasia: string;
  uf: string;
  municipio: string;
  cnaesQueBateram: string;
  telefone: string;
  email: string;
  scoreTotal: number;
  scoreFit: number;
  scoreEstrutura: number;
  scoreGeografia: number;
  potencial: "alto" | "medio" | "baixo";
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function construirReviewLead(c: CandidatoParaFila, perfil: "a" | "b"): ReviewLead {
  const id = `cnpj-${c.cnpjCompleto}`;
  const nomeExibicao = c.nomeFantasia || c.razaoSocial;
  const sinais = c.cnaesQueBateram.split(",").map((s) => s.trim()).filter(Boolean);

  const blocoMarkdown = `## Empresa

- Empresa: ${c.razaoSocial}
- Site:
- Cidade/UF: ${c.municipio}/${c.uf}
- Segmento: ${perfil === "a" ? "Solar/Fotovoltaico" : "Industrial/Agro/Bebidas"}
- Fonte: CNPJ (Receita Federal) — score firmográfico
- Descrição encontrada:
- Sinais logísticos: CNAEs ${sinais.join(", ")}
- Cliente espelho mais parecido:
- Potencial: ${c.potencial}
- Score estimado: ${c.scoreTotal} (fit ${c.scoreFit} + estrutura ${c.scoreEstrutura} + geografia ${c.scoreGeografia})
- Motivo da classificação: score firmográfico objetivo (CNAE + porte + capital social + filiais + idade + geografia)
- Canal sugerido: ${c.email ? "e-mail" : c.telefone ? "telefone" : "a definir"}
- Próxima ação: revisar e enriquecer contato antes de enviar
- Status: pendente

- Status campanha: [ pronto ]
- Última interação:
- Canal ativo: [ nenhum ]
- Observação campanha:`;

  return {
    id,
    reviewRank: 0,
    reviewPriority: c.potencial === "alto" ? "alta" : c.potencial === "medio" ? "media" : "baixa",
    reviewPriorityScore: c.scoreTotal,
    reviewPriorityReasons: [`Score firmográfico ${c.scoreTotal}`],
    companyName: c.razaoSocial,
    website: undefined,
    city: c.municipio,
    state: c.uf,
    niche: perfil === "a" ? "Solar/Fotovoltaico" : "Industrial/Agro/Bebidas",
    region: undefined,
    source: "CNPJ (Receita Federal)",
    description: nomeExibicao !== c.razaoSocial ? `Nome fantasia: ${nomeExibicao}` : undefined,
    contactEmail: c.email || undefined,
    contactPhone: c.telefone || undefined,
    score: c.scoreTotal,
    potential: c.potencial,
    suggestedDecision: "pendente",
    suggestedChannel: c.email ? "e-mail" : c.telefone ? "telefone" : "a definir",
    nextAction: "revisar e enriquecer contato antes de enviar",
    signals: sinais,
    flags: [],
    scoreReason: `fit ${c.scoreFit} + estrutura ${c.scoreEstrutura} + geografia ${c.scoreGeografia}`,
    destinoSugerido: "leads-qualificados.md",
    resumoCurto: `${c.razaoSocial} — ${c.municipio}/${c.uf} — score ${c.scoreTotal}`,
    blocoMarkdown,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd radar-comercial-solar && node --experimental-strip-types --test scripts/fonte-cnpj/fila-lib.test.ts`
Expected: PASS — 2 testes verdes.

- [ ] **Step 5: Write `gerar-fila.ts`**

Create `radar-comercial-solar/scripts/fonte-cnpj/gerar-fila.ts`:

```ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "./db.ts";
import { construirReviewLead } from "./fila-lib.ts";
import { parseArgs } from "./lib.ts";
import { readJsonArtifact, writeJsonArtifact } from "../../src/storage/json-artifact-store.ts";
import type { ReviewLead } from "../../src/contracts/lead-types.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LIMITE_POR_PERFIL = 200;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const perfil = args.perfil;
  if (perfil !== "a" && perfil !== "b") {
    console.error("Uso: --perfil=a|b");
    process.exit(1);
  }

  const db = openDb();
  const rows = db
    .prepare(
      `SELECT cnpj_completo, razao_social, nome_fantasia, uf, municipio, cnaes_que_bateram,
              telefone, email, score_total, score_fit, score_estrutura, score_geografia, potencial
       FROM candidatos
       WHERE perfil = ? AND potencial = 'alto' AND na_fila_desde IS NULL
       ORDER BY score_total DESC
       LIMIT ?`
    )
    .all(perfil, LIMITE_POR_PERFIL) as Array<Record<string, unknown>>;

  console.log(`Selecionados ${rows.length} candidatos (potencial alto, ainda não enfileirados) do perfil ${perfil}.`);

  const filaPath = path.join(__dirname, "..", "..", "data", "fila-revisao.json");
  const filaAtual = await readJsonArtifact<ReviewLead[]>(filaPath, []);
  const idsExistentes = new Set(filaAtual.map((l) => l.id));

  const novosLeads: ReviewLead[] = [];
  const hoje = new Date().toISOString().slice(0, 10);
  const marcarNaFila = db.prepare("UPDATE candidatos SET na_fila_desde = ? WHERE cnpj_completo = ?");

  for (const row of rows) {
    const lead = construirReviewLead(
      {
        cnpjCompleto: String(row.cnpj_completo),
        razaoSocial: String(row.razao_social ?? ""),
        nomeFantasia: String(row.nome_fantasia ?? ""),
        uf: String(row.uf ?? ""),
        municipio: String(row.municipio ?? ""),
        cnaesQueBateram: String(row.cnaes_que_bateram ?? ""),
        telefone: String(row.telefone ?? ""),
        email: String(row.email ?? ""),
        scoreTotal: Number(row.score_total ?? 0),
        scoreFit: Number(row.score_fit ?? 0),
        scoreEstrutura: Number(row.score_estrutura ?? 0),
        scoreGeografia: Number(row.score_geografia ?? 0),
        potencial: String(row.potencial) as "alto" | "medio" | "baixo",
      },
      perfil
    );

    if (idsExistentes.has(lead.id)) continue;

    novosLeads.push(lead);
    marcarNaFila.run(hoje, row.cnpj_completo);
  }

  const filaFinal = [...filaAtual, ...novosLeads];
  await writeJsonArtifact(filaPath, filaFinal);

  db.close();
  console.log(`${novosLeads.length} novos leads adicionados à fila. Total na fila: ${filaFinal.length}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 6: Adicionar script npm**

Modify `radar-comercial-solar/package.json`, adicionar:

```json
    "radar:gerar-fila": "node --experimental-strip-types scripts/fonte-cnpj/gerar-fila.ts",
```

- [ ] **Step 7: Rodar `npm test` completo pra garantir que nada quebrou**

Run: `cd radar-comercial-solar && npm test`
Expected: PASS — todos os testes de `scripts/fonte-cnpj/*.test.ts` (Fase 1 + Fase 2) verdes.

- [ ] **Step 8: Commit**

```bash
cd radar-comercial-solar
git add scripts/fonte-cnpj/fila-lib.ts scripts/fonte-cnpj/fila-lib.test.ts scripts/fonte-cnpj/gerar-fila.ts package.json
git commit -m "feat: gerador de fila de revisão (top 200, incremental)"
```

---

### Task 6: Documentação e validação ponta a ponta

**Files:**
- Modify: `radar-comercial-solar/scripts/fonte-cnpj/README.md`

- [ ] **Step 1: Atualizar o README com o fluxo completo da Fase 2**

Adicionar ao final de `radar-comercial-solar/scripts/fonte-cnpj/README.md` uma seção:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
cd radar-comercial-solar
git add scripts/fonte-cnpj/README.md
git commit -m "docs: documenta fluxo completo da Fase 2 (extração → SQLite → score → fila)"
```

---

## Fora de escopo desta fase

- Fase 3 (CLI de revisão que consome `fila-revisao.json`) — próxima fase do pipeline.
- Resolver o CNPJ correto de DNL Comércio.
- Enriquecimento de site/contato além do que vem no CNPJ.
- Roteamento por unidade (REC vs MGA).
