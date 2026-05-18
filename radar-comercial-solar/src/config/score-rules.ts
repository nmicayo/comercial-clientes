export type ScoreCriterion = {
  id: string;
  label: string;
  points: number;
  patterns?: RegExp[];
};

export const scoreThresholds = {
  high: 70,
  medium: 40
} as const;

export const positiveScoreCriteria: ScoreCriterion[] = [
  // --- Sinais solares ---
  { id: "distribuidora_solar", label: "É distribuidora solar", points: 30, patterns: [/distribuidora solar/i, /distribuidora de equipamentos fotovoltaicos/i] },
  { id: "vende_integradores", label: "Vende para integradores", points: 25, patterns: [/vende.*integradores/i, /atendimento a integradores/i] },
  { id: "kits_solares", label: "Trabalha com kits solares", points: 20, patterns: [/kits? solares?/i] },
  { id: "modulos_inversores", label: "Trabalha com módulos ou inversores", points: 20, patterns: [/m[oó]dulos?/i, /inversores?/i] },
  { id: "revenda_linha_solar", label: "É revenda com linha solar", points: 15, patterns: [/material el[eé]trico/i, /linha solar/i] },
  { id: "ecossistema_solar", label: "Atua como hub comercial no ecossistema solar", points: 25, patterns: [/fornecedores/i, /rede de parceiros/i, /ecossistema solar/i] },

  // --- Sinais genéricos de distribuição (qualquer segmento) ---
  { id: "distribuidora_atacadista", label: "É distribuidora ou atacadista", points: 28, patterns: [/\bdistribuidora\b/i, /\bdistribuidor\b/i, /\batacadista\b/i, /\batacado\b/i, /distribui[cç][aã]o de produtos/i] },
  { id: "importador", label: "É importador ou representante", points: 20, patterns: [/importador[a]?\b/i, /representante (comercial|exclusivo)/i, /importa[cç][aã]o e distribui[cç][aã]o/i] },
  { id: "vende_revendas", label: "Vende para revendas ou empresas B2B", points: 20, patterns: [/vende.*revendas?/i, /atende.*revendas?/i, /para.*revendedores?/i, /canal de distribui[cç][aã]o/i, /rede de revendas?/i] },
  { id: "produto_fisico_b2b", label: "Produto físico com operação B2B", points: 15, patterns: [/\bb2b\b/i, /venda por atacado/i, /pedido m[ií]nimo/i, /tabela de pre[cç]os para revendas?/i] },

  // --- Sinais genéricos de operação logística ---
  { id: "pronta_entrega", label: "Menciona pronta entrega", points: 20, patterns: [/pronta entrega/i] },
  { id: "estoque_cd", label: "Menciona estoque ou centro de distribuição", points: 25, patterns: [/\bestoque\b/i, /centro de distribui[cç][aã]o/i, /\bexpedi[cç][aã]o\b/i, /\bgalp[aã]o\b/i, /armazenagem pr[oó]pria/i] },
  { id: "entrega_brasil", label: "Entrega para todo o Brasil", points: 20, patterns: [/todo o brasil/i, /entregas? (regionais|nacionais)/i, /distribui[cç][aã]o nacional/i, /entregamos? em todo/i] },
  { id: "catalogo_produtos", label: "Possui catálogo ou portfólio físico", points: 10, patterns: [/cat[aá]logo/i, /portf[oó]lio/i, /vitrine de produtos/i, /linha de produtos/i] },
  { id: "operacao_b2b", label: "Tem operação B2B", points: 10, patterns: [/atende empresas/i, /revendas/i, /\bpj\b/i, /pessoa jur[ií]dica/i] },
  { id: "perfil_empresarial", label: "Atende empresas e indústrias", points: 10, patterns: [/empresariais/i, /industriais/i, /com[eé]rcio.*empresas/i] },

  // --- Sinais solares secundários (integradora / obras) ---
  { id: "integradora_solar", label: "É integradora solar", points: 12, patterns: [/integradora/i, /instala[cç][aã]o/i] },
  { id: "obras_multicidade", label: "Opera obras em várias cidades", points: 15, patterns: [/v[aá]rias cidades/i, /cronogramas de instala[cç][aã]o/i] }
];

export const negativeScoreCriteria: ScoreCriterion[] = [
  { id: "nao_produto_fisico", label: "Não atua com produto físico", points: -30, patterns: [/consultoria/i, /n[aã]o comercializamos equipamentos/i, /sem produto f[ií]sico/i] },
  { id: "assinatura_energia", label: "Atua apenas com assinatura de energia", points: -10, patterns: [/assinatura de energia/i, /cr[eé]ditos energ[eé]ticos/i] },
  { id: "marketplace_puro", label: "É marketplace puro sem operação física aparente", points: -15, patterns: [/marketplace/i, /plataforma/i] },
  { id: "financiamento_solar", label: "É operação de financiamento sem sinal logístico claro", points: -15, patterns: [/financiamento solar/i, /plataforma financeira/i] },
  { id: "geracao_compartilhada", label: "Atua apenas em geração compartilhada sem operação física evidente", points: -15, patterns: [/gera[cç][aã]o compartilhada/i] }
];

// Fase 1: apenas PE. Outras regiões mantidas para não quebrar leads históricos, mas sem peso adicional nesta fase.
export const strategicRegions = ["cabo de santo agostinho", "recife", "pernambuco"];

export const excludedSegmentPatterns: RegExp[] = [
  /qu[ií]mico/i,
  /produtos qu[ií]micos/i,
  /agroquímico/i,
  /alimentos/i,
  /alimentício/i,
  /frigorí[fi]co/i,
  /laticínios/i,
  /bebidas/i
];

export const storageScoreCriteria: ScoreCriterion[] = [
  { id: "distribuicao_multiregional", label: "Distribuição multi-regional ou nacional", points: 35, patterns: [/todo o brasil/i, /cobertura nacional/i, /distribui[cç][aã]o nacional/i, /entrega.*todo.*brasil/i, /multi.?regional/i] },
  { id: "entrega_multiplos_estados", label: "Entrega em múltiplos estados", points: 25, patterns: [/v[aá]rios estados/i, /todo.*territ[oó]rio/i, /nordeste.*sudeste/i, /sp.*pr.*pe/i, /pernambuco.*paran[aá]/i] },
  { id: "sem_cd_proprio", label: "Sem CD próprio aparente — sem menção a galpão ou armazém próprio", points: 20, patterns: [] },
  { id: "expansao_recente", label: "Crescimento ou expansão declarada", points: 15, patterns: [/em expans[aã]o/i, /crescimento/i, /nova filial/i, /expandindo/i, /novos mercados/i] },
  { id: "cobre_praças_phenyx", label: "Cobre PE, PR e SP — praças das filiais Phenyx", points: 20, patterns: [/pernambuco/i, /paran[aá]/i, /s[aã]o paulo/i] },
  { id: "volume_equipamentos", label: "Volume de equipamentos em escala", points: 15, patterns: [/grande volume/i, /alto giro/i, /estoque alto/i, /volume de.*m[oó]dulos/i] },
  { id: "pronta_entrega_sem_estrutura", label: "Pronta entrega sem evidência de estrutura própria", points: 15, patterns: [/pronta entrega/i] }
];

export const storageNegativeCriteria: ScoreCriterion[] = [
  { id: "cd_proprio_declarado", label: "CD próprio declarado nas regiões Phenyx", points: -25, patterns: [/centro de distribui[cç][aã]o pr[oó]prio/i, /galpão pr[oó]prio/i, /armazém pr[oó]prio/i] },
  { id: "atuacao_local_unica", label: "Atuação restrita a uma única cidade", points: -20, patterns: [/atuamos apenas em/i, /s[oó] atendemos/i] },
  { id: "volume_pequeno_residencial", label: "Volume pequeno ou foco residencial", points: -15, patterns: [/residencial/i, /pequenas instala[cç][oõ]es/i] }
];

export const storageScoreThresholds = {
  high: 60,
  medium: 30
} as const;
