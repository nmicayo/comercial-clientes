import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const DEFAULT_DB_PATH = path.join(__dirname, "..", "..", "data", "candidatos.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS candidatos (
  cnpj_basico TEXT NOT NULL,
  perfil TEXT NOT NULL,
  cnpj_completo TEXT NOT NULL,
  razao_social TEXT,
  nome_fantasia TEXT,
  porte TEXT,
  capital_social REAL,
  data_abertura TEXT,
  filiais_ativas INTEGER,
  uf TEXT,
  municipio TEXT,
  cnae_principal TEXT,
  cnaes_que_bateram TEXT,
  cep TEXT,
  telefone TEXT,
  email TEXT,
  score_fit INTEGER,
  score_estrutura INTEGER,
  score_geografia INTEGER,
  score_total INTEGER,
  potencial TEXT,
  na_fila_desde TEXT,
  status_revisao TEXT,
  PRIMARY KEY (cnpj_basico, perfil)
);
`;

export function openDb(dbPath: string = DEFAULT_DB_PATH): DatabaseSync {
  const db = new DatabaseSync(dbPath);
  db.exec(SCHEMA);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  return db;
}
