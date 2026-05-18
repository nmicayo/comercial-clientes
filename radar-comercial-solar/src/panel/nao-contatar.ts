import { resolve } from "node:path";
import { readJsonArtifact } from "../storage/json-artifact-store.ts";

type NaoContatarEntry = {
  tipo: "email" | "telefone" | "empresa_inteira";
  valor: string;
  motivo?: string;
  data?: string;
};

const normalize = (str: string): string => str.trim().toLowerCase();

export type NaoContatarList = {
  isBlockedEmail: (email: string) => boolean;
  isBlockedCompany: (name: string) => boolean;
};

export const loadNaoContatar = async (projectRoot: string): Promise<NaoContatarList> => {
  const raw = await readJsonArtifact<NaoContatarEntry[]>(
    resolve(projectRoot, "data", "nao-contatar.json"),
    []
  );

  const blockedEmails = new Set(
    raw.filter((e) => e.tipo === "email").map((e) => normalize(e.valor))
  );
  const blockedCompanies = new Set(
    raw.filter((e) => e.tipo === "empresa_inteira").map((e) => normalize(e.valor))
  );

  return {
    isBlockedEmail: (email) => blockedEmails.has(normalize(email)),
    isBlockedCompany: (name) => blockedCompanies.has(normalize(name))
  };
};
