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

export const readTextArtifact = async (filePath: string, fallback: string): Promise<string> => {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return fallback;
  }
};

export const writeTextArtifact = async (
  filePath: string,
  content: string
): Promise<{ wroteFile: boolean; backupPath?: string }> => {
  await mkdir(dirname(filePath), { recursive: true });

  const currentExists = await fileExists(filePath);

  if (!currentExists) {
    await writeFile(filePath, content, "utf8");
    return { wroteFile: true };
  }

  const currentContent = await readFile(filePath, "utf8");

  if (currentContent === content) {
    return { wroteFile: false };
  }

  const backupPath = `${filePath}.bak`;
  await writeFile(backupPath, currentContent, "utf8");
  await writeFile(filePath, content, "utf8");
  return { wroteFile: true, backupPath };
};
