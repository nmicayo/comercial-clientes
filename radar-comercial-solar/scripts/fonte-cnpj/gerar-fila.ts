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
              telefone, email, score_total, score_fit, score_estrutura, score_geografia, potencial, dados_incompletos
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
  const marcarNaFila = db.prepare("UPDATE candidatos SET na_fila_desde = ? WHERE cnpj_completo = ? AND perfil = ?");

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
        dadosIncompletos: Number(row.dados_incompletos ?? 0) === 1,
      },
      perfil
    );

    // Marca sempre, mesmo quando o lead já está na fila — senão a linha
    // continua satisfazendo na_fila_desde IS NULL e volta a ser
    // selecionada (e pulada) toda vez que o comando roda de novo,
    // ocupando uma vaga do top 200 para sempre.
    marcarNaFila.run(hoje, row.cnpj_completo, perfil);

    if (idsExistentes.has(lead.id)) continue;

    novosLeads.push(lead);
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
