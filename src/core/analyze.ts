import path from "node:path";

import type { AnalysisResult } from "../types.js";
import { detectProject } from "./detect.js";
import { findEntryPoints } from "./entries.js";
import { pathExists } from "./repository.js";

async function collectReadingOrder(rootPath: string, entryPoints: string[]): Promise<string[]> {
  const candidates = [
    ...entryPoints,
    "README.md",
    "package.json",
    "pyproject.toml",
    "Cargo.toml",
    "go.mod",
    "tsconfig.json",
    "src/index.ts",
    "src/main.ts"
  ];

  const unique = [...new Set(candidates)];
  const existing: string[] = [];

  for (const candidate of unique) {
    if (await pathExists(path.join(rootPath, candidate))) {
      existing.push(candidate);
    }
  }

  return existing;
}

export async function analyzeRepository(rootPath: string): Promise<AnalysisResult> {
  const detection = await detectProject(rootPath);
  const entryPoints = await findEntryPoints(rootPath, detection);
  const suggestedReadingOrder = await collectReadingOrder(
    rootPath,
    entryPoints.map((entryPoint) => entryPoint.path)
  );

  return {
    detection,
    entryPoints,
    suggestedReadingOrder
  };
}

