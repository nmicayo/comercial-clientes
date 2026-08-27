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
