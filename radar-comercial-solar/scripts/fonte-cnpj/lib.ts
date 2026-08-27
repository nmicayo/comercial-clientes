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
): Promise<Record<string, AgregadoEmpresa>> {
  const obj: Record<string, AgregadoEmpresa> = {};
  for await (const line of linhas) {
    if (!line.trim()) continue;
    const row = parseEstabelecimentoLine(line);
    if (row.situacaoCadastral !== ATIVA) continue;
    const atual = obj[row.cnpjBasico] ?? { filiaisAtivas: 0, dataAberturaMatriz: "" };
    atual.filiaisAtivas++;
    if (row.identificadorMatrizFilial === "1") {
      atual.dataAberturaMatriz = row.dataInicioAtividade;
    }
    obj[row.cnpjBasico] = atual;
  }
  return obj;
}
