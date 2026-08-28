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
  dadosIncompletos: boolean;
}

const UF_VALIDA = /^[A-Z]{2}$/;

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
    // Detecta linhas com colunas deslocadas na origem (ex: UF ausente na
    // Fase 1 desloca CEP/CNAE/telefone para as posições vizinhas). O
    // sintoma mais confiável é o campo UF não ter o formato de 2 letras
    // esperado — contagem de campos não pega esse caso, porque o total
    // de campos continua correto, só o conteúdo é que desliza.
    const linhaIncompleta = !UF_VALIDA.test(f[7] ?? "");
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
      razaoSocial: f[1] || anterior?.razaoSocial || "",
      nomeFantasia: f[2] || anterior?.nomeFantasia || "",
      porte: f[3] || anterior?.porte || "",
      capitalSocial: parseCapitalSocial(f[4]) || anterior?.capitalSocial || 0,
      dataAbertura: dataAbertura || anterior?.dataAbertura || "",
      filiaisAtivas: somaFiliais,
      uf: f[7],
      municipio: f[8],
      cnaePrincipal: f[9],
      cnaesQueBateram: f[10],
      cep: f[11],
      telefone: f[12],
      email: f[13],
      dadosIncompletos: linhaIncompleta || anterior?.dadosIncompletos || false,
    });
  }

  return resultado;
}
