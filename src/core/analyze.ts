import path from "node:path";

import type { AnalysisResult } from "../types.js";
import { detectProject } from "./detect.js";
import { generateArchitectureDiagram } from "./diagram.js";
import { findEntryPoints } from "./entries.js";
import { pathExists } from "./repository.js";
import { extractVerifiedSpine } from "./spine.js";

async function collectReadingOrder(
  rootPath: string,
  entryPoints: string[],
  spineNodes: string[]
): Promise<string[]> {
  const candidates = [
    ...spineNodes,
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
  const spine = await extractVerifiedSpine(rootPath, entryPoints);
  const diagram = await generateArchitectureDiagram(spine);
  const suggestedReadingOrder = await collectReadingOrder(
    rootPath,
    entryPoints.map((entryPoint) => entryPoint.path),
    spine.nodes
  );

  return {
    detection,
    entryPoints,
    spine,
    diagram,
    suggestedReadingOrder
  };
}
