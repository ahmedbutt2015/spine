import { readFile } from "node:fs/promises";
import path from "node:path";

import type { DetectedLanguage, EntryPoint, SpineAnalysis, VerifiedEdge } from "../types.js";
import { pathExists, walkRepositoryFiles } from "./repository.js";

const SUPPORTED_SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
const SOURCE_EXTENSION_SET = new Set(SUPPORTED_SOURCE_EXTENSIONS);

const IMPORT_PATTERNS = [
  /import\s+(?:type\s+)?[^"'`]*?from\s*["']([^"'`]+)["']/g,
  /import\s*["']([^"'`]+)["']/g,
  /export\s+[^"'`]*?from\s*["']([^"'`]+)["']/g,
  /require\(\s*["']([^"'`]+)["']\s*\)/g,
  /import\(\s*["']([^"'`]+)["']\s*\)/g
];

function normalizeRelativePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function isTsOrJsLanguage(language: DetectedLanguage): boolean {
  return language === "typescript" || language === "javascript";
}

function isSourceFile(filePath: string): boolean {
  return SOURCE_EXTENSION_SET.has(path.extname(filePath).toLowerCase());
}

function collectImportSpecifiers(source: string): string[] {
  const matches: string[] = [];

  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0;

    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier) {
        matches.push(specifier);
      }
    }
  }

  return matches;
}

async function resolveLocalImport(
  rootPath: string,
  fromPath: string,
  specifier: string
): Promise<string | null> {
  if (!specifier.startsWith(".")) {
    return null;
  }

  const fromDirectory = path.dirname(fromPath);
  const baseTarget = normalizeRelativePath(path.posix.normalize(path.posix.join(fromDirectory, specifier)));
  const baseWithoutExtension = baseTarget.replace(/\.[^.\/]+$/, "");
  const candidates = new Set<string>([
    baseTarget,
    `${baseWithoutExtension}.ts`,
    `${baseWithoutExtension}.tsx`,
    `${baseWithoutExtension}.mts`,
    `${baseWithoutExtension}.cts`,
    `${baseWithoutExtension}.js`,
    `${baseWithoutExtension}.jsx`,
    `${baseWithoutExtension}.mjs`,
    `${baseWithoutExtension}.cjs`,
    `${baseTarget}/index.ts`,
    `${baseTarget}/index.tsx`,
    `${baseTarget}/index.mts`,
    `${baseTarget}/index.cts`,
    `${baseTarget}/index.js`,
    `${baseTarget}/index.jsx`,
    `${baseTarget}/index.mjs`,
    `${baseTarget}/index.cjs`,
    `${baseWithoutExtension}/index.ts`,
    `${baseWithoutExtension}/index.tsx`,
    `${baseWithoutExtension}/index.mts`,
    `${baseWithoutExtension}/index.cts`,
    `${baseWithoutExtension}/index.js`,
    `${baseWithoutExtension}/index.jsx`,
    `${baseWithoutExtension}/index.mjs`,
    `${baseWithoutExtension}/index.cjs`
  ]);

  for (const candidate of candidates) {
    if (!isSourceFile(candidate)) {
      continue;
    }

    if (await pathExists(path.join(rootPath, candidate))) {
      return candidate;
    }
  }

  return null;
}

async function buildImportGraph(
  rootPath: string,
  candidateFiles: Set<string>
): Promise<Map<string, Set<string>>> {
  const graph = new Map<string, Set<string>>();

  for (const filePath of candidateFiles) {
    const absolutePath = path.join(rootPath, filePath);
    const source = await readFile(absolutePath, "utf8");
    const imports = collectImportSpecifiers(source);
    const resolvedImports = new Set<string>();

    for (const specifier of imports) {
      const resolved = await resolveLocalImport(rootPath, filePath, specifier);
      if (resolved && candidateFiles.has(resolved)) {
        resolvedImports.add(resolved);
      }
    }

    graph.set(filePath, resolvedImports);
  }

  return graph;
}

function chooseSpineNodes(scores: Map<string, number>, entrySeeds: string[]): string[] {
  const ranked = [...scores.entries()].sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }

    const leftSeed = entrySeeds.includes(left[0]) ? 1 : 0;
    const rightSeed = entrySeeds.includes(right[0]) ? 1 : 0;
    if (rightSeed !== leftSeed) {
      return rightSeed - leftSeed;
    }

    return left[0].localeCompare(right[0]);
  });

  return ranked.slice(0, Math.min(7, Math.max(5, ranked.length))).map(([filePath]) => filePath);
}

export async function extractVerifiedSpine(
  rootPath: string,
  entryPoints: EntryPoint[],
  maxDepth = 3
): Promise<SpineAnalysis> {
  const repositoryFiles = await walkRepositoryFiles(rootPath);
  const candidateFiles = new Set(
    repositoryFiles.map((file) => file.path).filter((filePath) => isSourceFile(filePath))
  );

  const tsJsEntries = entryPoints
    .filter((entryPoint) => isTsOrJsLanguage(entryPoint.language))
    .map((entryPoint) => entryPoint.path)
    .filter((filePath) => candidateFiles.has(filePath));

  if (tsJsEntries.length === 0) {
    return {
      supportedLanguages: [],
      nodes: [],
      edges: [],
      entrySeeds: [],
      omittedEntryPoints: entryPoints.map((entryPoint) => entryPoint.path)
    };
  }

  const graph = await buildImportGraph(rootPath, candidateFiles);
  const scores = new Map<string, number>();

  for (const seed of tsJsEntries) {
    const seenDepth = new Map<string, number>();
    const queue = [{ filePath: seed, depth: 0 }];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        continue;
      }

      const priorDepth = seenDepth.get(current.filePath);
      if (priorDepth !== undefined && priorDepth <= current.depth) {
        continue;
      }

      seenDepth.set(current.filePath, current.depth);
      const currentScore = scores.get(current.filePath) ?? 0;
      scores.set(current.filePath, currentScore + (maxDepth - current.depth + 1));

      if (current.depth >= maxDepth) {
        continue;
      }

      for (const dependency of graph.get(current.filePath) ?? []) {
        queue.push({ filePath: dependency, depth: current.depth + 1 });
      }
    }
  }

  const nodes = chooseSpineNodes(scores, tsJsEntries);
  const nodeSet = new Set(nodes);
  const edges: VerifiedEdge[] = [];

  for (const from of nodes) {
    for (const to of graph.get(from) ?? []) {
      if (nodeSet.has(to)) {
        edges.push({ from, to, kind: "import" });
      }
    }
  }

  return {
    supportedLanguages: ["typescript", "javascript"],
    nodes,
    edges: edges.sort((left, right) => {
      if (left.from !== right.from) {
        return left.from.localeCompare(right.from);
      }

      return left.to.localeCompare(right.to);
    }),
    entrySeeds: tsJsEntries.sort(),
    omittedEntryPoints: entryPoints
      .map((entryPoint) => entryPoint.path)
      .filter((filePath) => !tsJsEntries.includes(filePath))
      .sort()
  };
}
