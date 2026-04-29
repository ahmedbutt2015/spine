import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import type { RepoFile } from "../types.js";

const SKIP_DIRECTORIES = new Set([
  ".git",
  ".hg",
  ".svn",
  ".next",
  ".turbo",
  ".idea",
  ".vscode",
  "coverage",
  "dist",
  "build",
  "fixtures",
  "__fixtures__",
  "node_modules",
  "target",
  "__pycache__",
  ".pytest_cache",
  ".venv",
  "venv"
]);

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function readTextIfExists(targetPath: string): Promise<string | null> {
  try {
    return await readFile(targetPath, "utf8");
  } catch {
    return null;
  }
}

export async function readJsonIfExists<T>(targetPath: string): Promise<T | null> {
  const content = await readTextIfExists(targetPath);
  if (!content) {
    return null;
  }

  return JSON.parse(content) as T;
}

export async function listTopLevelDirectories(rootPath: string): Promise<string[]> {
  const entries = await readdir(rootPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !SKIP_DIRECTORIES.has(name))
    .sort();
}

async function isVendoredDirectory(directoryPath: string): Promise<boolean> {
  const gitignore = await readTextIfExists(path.join(directoryPath, ".gitignore"));
  if (!gitignore) {
    return false;
  }

  for (const rawLine of gitignore.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "*") {
      return true;
    }
  }

  return false;
}

export async function walkRepositoryFiles(rootPath: string, maxFiles = 2000): Promise<RepoFile[]> {
  const results: RepoFile[] = [];

  async function visit(currentPath: string): Promise<void> {
    if (results.length >= maxFiles) {
      return;
    }

    const entries = await readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      if (results.length >= maxFiles) {
        return;
      }

      const absolutePath = path.join(currentPath, entry.name);
      const relativePath = path.relative(rootPath, absolutePath);

      if (entry.isSymbolicLink()) {
        continue;
      }

      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name)) {
          continue;
        }
        if (await isVendoredDirectory(absolutePath)) {
          continue;
        }
        await visit(absolutePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      results.push({
        path: relativePath,
        extension: path.extname(entry.name).toLowerCase()
      });
    }
  }

  await visit(rootPath);

  return results.sort((left, right) => left.path.localeCompare(right.path));
}
