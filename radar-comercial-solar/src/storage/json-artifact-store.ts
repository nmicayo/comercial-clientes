import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await readFile(filePath, "utf8");
    return true;
  } catch {
    return false;
  }
};

export const readJsonArtifact = async <T>(filePath: string, fallback: T): Promise<T> => {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

export const writeJsonArtifact = async (
  filePath: string,
  data: unknown
): Promise<{ wroteFile: boolean; backupPath?: string }> => {
  await mkdir(dirname(filePath), { recursive: true });

  const nextContent = `${JSON.stringify(data, null, 2)}\n`;
  const currentExists = await fileExists(filePath);

  if (!currentExists) {
    await writeFile(filePath, nextContent, "utf8");
    return { wroteFile: true };
  }

  const currentContent = await readFile(filePath, "utf8");

  if (currentContent === nextContent) {
    return { wroteFile: false };
  }

  const backupPath = `${filePath}.bak`;
  await writeFile(backupPath, currentContent, "utf8");
  await writeFile(filePath, nextContent, "utf8");
  return { wroteFile: true, backupPath };
};
