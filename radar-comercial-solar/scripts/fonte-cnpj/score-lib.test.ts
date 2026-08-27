import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularScore, type ScoreConfig, type CandidatoParaScore } from "./score-lib.ts";

const config: ScoreConfig = {
  estrutura: { capital_social_min: 500000, filiais_min: 2, idade_anos_min: 3 },
  pesos: {
    fit_cnae_principal: 30,
    fit_cnae_secundario: 15,
    estrutura_filiais: 25,
    estrutura_porte: 15,
    estrutura_capital: 10,
    estrutura_idade: 10,
    geo_cidade_prioritaria: 15,
    geo_uf_perfil: 10,
  },
  faixas: { baixo_max: 39, medio_max: 69 },
};

const cnaesDoPerfil = new Set(["4321500", "4669999"]);
const cidadesPrioritarias = new Set(["MARINGA", "CABO DE SANTO AGOSTINHO", "BARUERI"]);
const ufsDoPerfil = new Set(["PE", "BA", "PR", "SP"]);

const anoAtual = new Date().getFullYear();

function candidato(overrides: Partial<CandidatoParaScore>): CandidatoParaScore {
  return {
    cnaePrincipal: "4321500",
    cnaesQueBateram: "4321500",
    filiaisAtivas: 1,
    porte: "01",
    capitalSocial: 0,
    dataAbertura: "",
    municipio: "",
    uf: "",
    ...overrides,
  };
}

test("empresa forte em todas as camadas recebe score alto", () => {
  const c = candidato({
    cnaePrincipal: "4321500",
    filiaisAtivas: 3,
    porte: "05",
    capitalSocial: 1000000,
    dataAbertura: `${anoAtual - 10}0101`,
    municipio: "MARINGA",
  });
  const r = calcularScore(c, config, cnaesDoPerfil, cidadesPrioritarias, ufsDoPerfil);
  assert.equal(r.scoreFit, 30);
  assert.equal(r.scoreEstrutura, 25 + 15 + 10 + 10);
  assert.equal(r.scoreGeografia, 15);
  assert.equal(r.scoreTotal, 30 + 60 + 15);
  assert.equal(r.potencial, "alto");
});

test("match só por CNAE secundário pontua fit_cnae_secundario, não o principal", () => {
  const c = candidato({ cnaePrincipal: "9999999", cnaesQueBateram: "4669999" });
  const r = calcularScore(c, config, cnaesDoPerfil, cidadesPrioritarias, ufsDoPerfil);
  assert.equal(r.scoreFit, 15);
});

test("empresa fraca em tudo recebe potencial baixo", () => {
  const c = candidato({ filiaisAtivas: 1, porte: "01", capitalSocial: 0, dataAbertura: "" });
  const r = calcularScore(c, config, cnaesDoPerfil, cidadesPrioritarias, ufsDoPerfil);
  assert.equal(r.scoreEstrutura, 0);
  assert.equal(r.scoreGeografia, 0);
  assert.equal(r.potencial, "baixo");
});

test("UF do perfil sem cidade prioritária pontua geo_uf_perfil, não geo_cidade_prioritaria", () => {
  const c = candidato({ municipio: "LONDRINA", uf: "PR" });
  const r = calcularScore(c, config, cnaesDoPerfil, cidadesPrioritarias, ufsDoPerfil);
  assert.equal(r.scoreGeografia, 10);
});

test("faixas de classificação respeitam os limites configurados", () => {
  // filiaisAtivas: 2 (+25 estrutura_filiais) + porte "05" (+15 estrutura_porte) somados ao
  // fit_cnae_principal (30, cnaePrincipal padrão bate) totalizam 70, que é > faixas.medio_max (69),
  // logo o resultado correto é "alto". (O valor original do brief, "medio", era matematicamente
  // inconsistente com os pesos de score-config.json — ver nota no relatório da Task 4.)
  assert.equal(
    calcularScore(candidato({ filiaisAtivas: 2, porte: "05" }), config, cnaesDoPerfil, cidadesPrioritarias, ufsDoPerfil).potencial,
    "alto"
  );
});
