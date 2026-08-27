// Filtra a base pública de CNPJ (Receita Federal) por CNAE + UF, sem IA.
// Uso: ver scripts/fonte-cnpj/README.md
import { createReadStream, existsSync, appendFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type Args = Record<string, string>;

function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (const raw of argv) {
    const m = raw.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

// Campos da Receita são separados por ";", cada campo entre aspas duplas.
// Não há vírgulas/pontos-e-vírgulas escapados dentro de aspas nesses arquivos
// na prática, então um split simples após remover aspas é suficiente.
function splitLine(line: string): string[] {
  return line.split(";").map((f) => f.replace(/^"|"$/g, "").trim());
}

async function loadMunicipios(filePath: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!filePath || !existsSync(filePath)) return map;
  const rl = createInterface({ input: createReadStream(filePath, { encoding: "latin1" }) });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const [codigo, nome] = splitLine(line);
    if (codigo) map.set(codigo, nome);
  }
  return map;
}

async function loadRazoesSociais(filePath: string): Promise<Map<string, { razaoSocial: string; porte: string }>> {
  const map = new Map<string, { razaoSocial: string; porte: string }>();
  if (!filePath || !existsSync(filePath)) return map;
  const rl = createInterface({ input: createReadStream(filePath, { encoding: "latin1" }) });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const f = splitLine(line);
    // 0 CNPJ_BASICO, 1 RAZAO_SOCIAL, 5 PORTE_EMPRESA
    map.set(f[0], { razaoSocial: f[1] ?? "", porte: f[5] ?? "" });
  }
  return map;
}

function csvEscape(v: string): string {
  if (v == null) return "";
  const s = String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
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

  const cnaesConfig = JSON.parse(
    await import("node:fs").then((fs) => fs.readFileSync(path.join(__dirname, "cnaes.json"), "utf-8"))
  );
  const perfilConfig = cnaesConfig[perfil === "a" ? "perfil_a" : "perfil_b"];
  const cnaeSet = new Set<string>(perfilConfig.cnaes);
  const ufSet = new Set<string>(perfilConfig.ufs);

  console.log(`Perfil ${perfil.toUpperCase()} (${perfilConfig.label}) — UFs: ${[...ufSet].join(", ")} — CNAEs: ${[...cnaeSet].join(", ")}`);

  const [municipios, razoesSociais] = await Promise.all([
    loadMunicipios(municipiosPath),
    loadRazoesSociais(empresasPath),
  ]);

  const header = "cnpj;razao_social;nome_fantasia;porte;uf;municipio;cnae_principal;cep;telefone;email\n";
  if (!existsSync(outPath)) writeFileSync(outPath, header, "utf-8");

  const rl = createInterface({ input: createReadStream(estabelecimentosPath, { encoding: "latin1" }) });

  let total = 0;
  let matched = 0;
  const buffer: string[] = [];

  for await (const line of rl) {
    if (!line.trim()) continue;
    total++;
    const f = splitLine(line);
    // índices conforme layout oficial "Estabelecimentos"
    const cnpjBasico = f[0];
    const cnpjOrdem = f[1];
    const cnpjDv = f[2];
    const nomeFantasia = f[4];
    const situacaoCadastral = f[5];
    const cnaePrincipal = f[11];
    const cep = f[18];
    const uf = f[19];
    const municipioCodigo = f[20];
    const ddd1 = f[21];
    const telefone1 = f[22];
    const email = f[27];

    if (situacaoCadastral !== "02") continue; // só ativas
    if (!ufSet.has(uf)) continue;
    if (!cnaeSet.has(cnaePrincipal)) continue;

    matched++;
    const cnpj = `${cnpjBasico}${cnpjOrdem}${cnpjDv}`;
    const empresa = razoesSociais.get(cnpjBasico);
    const municipioNome = municipios.get(municipioCodigo) ?? municipioCodigo;
    const telefone = ddd1 && telefone1 ? `${ddd1}${telefone1}` : "";

    buffer.push(
      [
        cnpj,
        csvEscape(empresa?.razaoSocial ?? ""),
        csvEscape(nomeFantasia),
        csvEscape(empresa?.porte ?? ""),
        uf,
        csvEscape(municipioNome),
        cnaePrincipal,
        cep,
        telefone,
        csvEscape(email),
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
