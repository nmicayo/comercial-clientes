import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "./db.ts";
import { calcularScore, normalizarNomeCidade, type ScoreConfig } from "./score-lib.ts";
import { parseArgs } from "./lib.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CIDADES_PRIORITARIAS = new Set(
  ["CABO DE SANTO AGOSTINHO", "MARINGA", "BARUERI"].map(normalizarNomeCidade)
);

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
    WHERE cnpj_basico = :cnpj_basico AND perfil = :perfil
  `);

  console.log(`Pontuando ${rows.length} candidatos do perfil ${perfil}...`);

  let alto = 0, medio = 0, baixo = 0;
  db.exec("BEGIN");
  try {
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
      perfil,
    });

    if (resultado.potencial === "alto") alto++;
    else if (resultado.potencial === "medio") medio++;
    else baixo++;
  }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  db.close();
  console.log(`Concluído. Alto: ${alto} | Médio: ${medio} | Baixo: ${baixo}`);
}

main();
