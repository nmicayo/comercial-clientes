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
