import { test } from "node:test";
import assert from "node:assert/strict";
import { construirReviewLead, type CandidatoParaFila } from "./fila-lib.ts";

const candidato: CandidatoParaFila = {
  cnpjCompleto: "11111111000190",
  razaoSocial: "EMPRESA TESTE SOLAR LTDA",
  nomeFantasia: "TESTE SOLAR",
  uf: "PE",
  municipio: "CABO DE SANTO AGOSTINHO",
  cnaesQueBateram: "4321500,4669999",
  telefone: "81999998888",
  email: "contato@testesolar.com.br",
  scoreTotal: 85,
  scoreFit: 30,
  scoreEstrutura: 40,
  scoreGeografia: 15,
  potencial: "alto",
};

test("construirReviewLead preenche todos os campos obrigatórios de ReviewLead", () => {
  const lead = construirReviewLead(candidato, "a");
  assert.equal(lead.companyName, "EMPRESA TESTE SOLAR LTDA");
  assert.equal(lead.city, "CABO DE SANTO AGOSTINHO");
  assert.equal(lead.state, "PE");
  assert.equal(lead.score, 85);
  assert.equal(lead.potential, "alto");
  assert.equal(lead.contactPhone, "81999998888");
  assert.equal(lead.contactEmail, "contato@testesolar.com.br");
  assert.equal(lead.suggestedDecision, "pendente");
  assert.equal(lead.destinoSugerido, "leads-qualificados.md");
  assert.ok(lead.id.length > 0);
  assert.ok(lead.blocoMarkdown.includes("EMPRESA TESTE SOLAR LTDA"));
  assert.ok(lead.blocoMarkdown.includes("81999998888"));
  assert.deepEqual(lead.signals, ["4321500", "4669999"]);
});

test("construirReviewLead usa CNPJ completo como parte do id (estável entre execuções)", () => {
  const lead1 = construirReviewLead(candidato, "a");
  const lead2 = construirReviewLead(candidato, "a");
  assert.equal(lead1.id, lead2.id, "o id deve ser determinístico para o mesmo CNPJ, não aleatório");
});
