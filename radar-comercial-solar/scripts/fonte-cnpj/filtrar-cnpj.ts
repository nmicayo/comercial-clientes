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
    if (row.identificadorMatrizFilial !== "1") continue; // só matrizes

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
