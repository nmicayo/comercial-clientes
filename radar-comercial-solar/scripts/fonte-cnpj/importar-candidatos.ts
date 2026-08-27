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
