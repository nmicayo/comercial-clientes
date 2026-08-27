import type { ReviewLead } from "../../src/contracts/lead-types.ts";

export interface CandidatoParaFila {
  cnpjCompleto: string;
  razaoSocial: string;
  nomeFantasia: string;
  uf: string;
  municipio: string;
  cnaesQueBateram: string;
  telefone: string;
  email: string;
  scoreTotal: number;
  scoreFit: number;
  scoreEstrutura: number;
  scoreGeografia: number;
  potencial: "alto" | "medio" | "baixo";
}

export function construirReviewLead(c: CandidatoParaFila, perfil: "a" | "b"): ReviewLead {
  const id = `cnpj-${c.cnpjCompleto}`;
  const nomeExibicao = c.nomeFantasia || c.razaoSocial;
  const sinais = c.cnaesQueBateram.split(",").map((s) => s.trim()).filter(Boolean);

  const blocoMarkdown = `## Empresa

- Empresa: ${c.razaoSocial}
- Site:
- Cidade/UF: ${c.municipio}/${c.uf}
- Segmento: ${perfil === "a" ? "Solar/Fotovoltaico" : "Industrial/Agro/Bebidas"}
- Fonte: CNPJ (Receita Federal) — score firmográfico
- Descrição encontrada:
- Sinais logísticos: CNAEs ${sinais.join(", ")}
- Cliente espelho mais parecido:
- Telefone: ${c.telefone || "-"}
- E-mail: ${c.email || "-"}
- Potencial: ${c.potencial}
- Score estimado: ${c.scoreTotal} (fit ${c.scoreFit} + estrutura ${c.scoreEstrutura} + geografia ${c.scoreGeografia})
- Motivo da classificação: score firmográfico objetivo (CNAE + porte + capital social + filiais + idade + geografia)
- Canal sugerido: ${c.email ? "e-mail" : c.telefone ? "telefone" : "a definir"}
- Próxima ação: revisar e enriquecer contato antes de enviar
- Status: pendente

- Status campanha: [ pronto ]
- Última interação:
- Canal ativo: [ nenhum ]
- Observação campanha:`;

  return {
    id,
    reviewRank: 0,
    reviewPriority: c.potencial === "alto" ? "alta" : c.potencial === "medio" ? "media" : "baixa",
    reviewPriorityScore: c.scoreTotal,
    reviewPriorityReasons: [`Score firmográfico ${c.scoreTotal}`],
    companyName: c.razaoSocial,
    website: undefined,
    city: c.municipio,
    state: c.uf,
    niche: perfil === "a" ? "Solar/Fotovoltaico" : "Industrial/Agro/Bebidas",
    region: undefined,
    source: "CNPJ (Receita Federal)",
    description: nomeExibicao !== c.razaoSocial ? `Nome fantasia: ${nomeExibicao}` : undefined,
    contactEmail: c.email || undefined,
    contactPhone: c.telefone || undefined,
    score: c.scoreTotal,
    potential: c.potencial,
    suggestedDecision: "pendente",
    suggestedChannel: c.email ? "e-mail" : c.telefone ? "telefone" : "a definir",
    nextAction: "revisar e enriquecer contato antes de enviar",
    signals: sinais,
    flags: [],
    scoreReason: `fit ${c.scoreFit} + estrutura ${c.scoreEstrutura} + geografia ${c.scoreGeografia}`,
    destinoSugerido: "leads-qualificados.md",
    resumoCurto: `${c.razaoSocial} — ${c.municipio}/${c.uf} — score ${c.scoreTotal}`,
    blocoMarkdown,
  };
}
