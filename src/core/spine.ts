import { readFile } from "node:fs/promises";
import path from "node:path";

import type { DetectedLanguage, EntryPoint, SpineAnalysis, VerifiedEdge } from "../types.js";
import { pathExists, walkRepositoryFiles } from "./repository.js";

const SUPPORTED_SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
const SOURCE_EXTENSION_SET = new Set(SUPPORTED_SOURCE_EXTENSIONS);
const PYTHON_EXTENSION = ".py";
const RUST_EXTENSION = ".rs";

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

function isPythonLanguage(language: DetectedLanguage): boolean {
  return language === "python";
}

function isRustLanguage(language: DetectedLanguage): boolean {
  return language === "rust";
}

function isSourceFile(filePath: string): boolean {
  return SOURCE_EXTENSION_SET.has(path.extname(filePath).toLowerCase());
}

function isPythonFile(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === PYTHON_EXTENSION;
}

function isRustFile(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === RUST_EXTENSION;
}

function getPythonModuleParts(filePath: string): string[] {
  const normalized = filePath.replace(/\.py$/, "").split("/");
  const withoutLayoutPrefix = normalized[0] === "src" ? normalized.slice(1) : normalized;

  if (withoutLayoutPrefix[withoutLayoutPrefix.length - 1] === "__init__") {
    return withoutLayoutPrefix.slice(0, -1);
  }

  return withoutLayoutPrefix;
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

function collectPythonImportSpecifiers(source: string): string[] {
  const matches: string[] = [];
  const lines = source.split(/\r?\n/);

  for (const line of lines) {
    const importMatch = line.match(/^\s*import\s+(.+)$/);
    if (importMatch) {
      const modules = importMatch[1]
        .split(",")
        .map((part) => part.trim().split(/\s+as\s+/)[0]?.trim())
        .filter((part): part is string => Boolean(part));
      matches.push(...modules);
      continue;
    }

    const fromMatch = line.match(/^\s*from\s+([.\w]+)\s+import\s+(.+)$/);
    if (fromMatch) {
      const moduleSpecifier = fromMatch[1];
      const importedNames = fromMatch[2]
        .split(",")
        .map((part) => part.trim().split(/\s+as\s+/)[0]?.trim())
        .filter((part): part is string => Boolean(part && part !== "*"));

      for (const importedName of importedNames) {
        matches.push(`${moduleSpecifier}:${importedName}`);
      }

      matches.push(`${moduleSpecifier}:`);
    }
  }

  return matches;
}

function collectRustModuleSpecifiers(source: string): string[] {
  const matches: string[] = [];
  const modulePattern = /(?:^|\s)(?:pub\s+)?mod\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/gm;

  for (const match of source.matchAll(modulePattern)) {
    const specifier = match[1];
    if (specifier) {
      matches.push(specifier);
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

function buildPythonModuleIndex(candidateFiles: Set<string>): Map<string, string[]> {
  const moduleIndex = new Map<string, string[]>();

  for (const filePath of candidateFiles) {
    const moduleName = getPythonModuleParts(filePath).join(".");
    const moduleNames = moduleName ? [moduleName] : [];

    for (const moduleName of moduleNames) {
      const existing = moduleIndex.get(moduleName) ?? [];
      existing.push(filePath);
      moduleIndex.set(moduleName, existing);
    }
  }

  return moduleIndex;
}

function getPythonPackageParts(filePath: string): string[] {
  const moduleParts = getPythonModuleParts(filePath);
  return path.basename(filePath) === "__init__.py" ? moduleParts : moduleParts.slice(0, -1);
}

function resolvePythonBaseModule(filePath: string, moduleSpecifier: string): string {
  if (!moduleSpecifier.startsWith(".")) {
    return moduleSpecifier;
  }

  const dotPrefix = moduleSpecifier.match(/^\.+/)?.[0].length ?? 0;
  const remainder = moduleSpecifier.slice(dotPrefix);
  const currentPackageParts = getPythonPackageParts(filePath);
  const retainedParts = currentPackageParts.slice(0, Math.max(0, currentPackageParts.length - (dotPrefix - 1)));
  const remainderParts = remainder ? remainder.split(".").filter(Boolean) : [];

  return [...retainedParts, ...remainderParts].join(".");
}

function resolvePythonSpecifierToModuleNames(filePath: string, specifier: string): string[] {
  if (specifier.includes(":")) {
    const [modulePart, importedName] = specifier.split(":", 2);
    const baseModule = resolvePythonBaseModule(filePath, modulePart);
    const candidates = importedName ? [`${baseModule}.${importedName}`, baseModule] : [baseModule];
    return candidates.filter(Boolean);
  }

  return [resolvePythonBaseModule(filePath, specifier)].filter(Boolean);
}

async function buildPythonImportGraph(
  rootPath: string,
  candidateFiles: Set<string>
): Promise<Map<string, Set<string>>> {
  const graph = new Map<string, Set<string>>();
  const moduleIndex = buildPythonModuleIndex(candidateFiles);

  for (const filePath of candidateFiles) {
    const absolutePath = path.join(rootPath, filePath);
    const source = await readFile(absolutePath, "utf8");
    const specifiers = collectPythonImportSpecifiers(source);
    const resolvedImports = new Set<string>();

    for (const specifier of specifiers) {
      const moduleCandidates = resolvePythonSpecifierToModuleNames(filePath, specifier);
      for (const moduleName of moduleCandidates) {
        const targetFiles = moduleIndex.get(moduleName);
        if (!targetFiles) {
          continue;
        }

        for (const targetFile of targetFiles) {
          if (candidateFiles.has(targetFile) && targetFile !== filePath) {
            resolvedImports.add(targetFile);
          }
        }

        if (targetFiles.length > 0) {
          break;
        }
      }
    }

    graph.set(filePath, resolvedImports);
  }

  return graph;
}

function resolveRustModuleFile(fromPath: string, moduleName: string, candidateFiles: Set<string>): string | null {
  const fileDirectory = path.posix.dirname(fromPath);
  const isRootModule =
    fromPath === "src/lib.rs" ||
    fromPath === "src/main.rs" ||
    /^src\/bin\/[^/]+\.rs$/.test(fromPath);

  const baseDirectory =
    path.posix.basename(fromPath) === "mod.rs" || isRootModule ? fileDirectory : path.posix.dirname(fromPath);

  const candidates = [
    path.posix.join(baseDirectory, `${moduleName}.rs`),
    path.posix.join(baseDirectory, moduleName, "mod.rs")
  ];

  for (const candidate of candidates) {
    if (candidateFiles.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function buildRustModuleGraph(
  rootPath: string,
  candidateFiles: Set<string>
): Promise<Map<string, Set<string>>> {
  const graph = new Map<string, Set<string>>();

  for (const filePath of candidateFiles) {
    const absolutePath = path.join(rootPath, filePath);
    const source = await readFile(absolutePath, "utf8");
    const moduleSpecifiers = collectRustModuleSpecifiers(source);
    const resolvedModules = new Set<string>();

    for (const moduleSpecifier of moduleSpecifiers) {
      const resolved = resolveRustModuleFile(filePath, moduleSpecifier, candidateFiles);
      if (resolved && resolved !== filePath) {
        resolvedModules.add(resolved);
      }
    }

    graph.set(filePath, resolvedModules);
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

function scoreGraphFromSeeds(
  graph: Map<string, Set<string>>,
  seeds: string[],
  maxDepth: number
): Map<string, number> {
  const scores = new Map<string, number>();

  for (const seed of seeds) {
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

  return scores;
}

export async function extractVerifiedSpine(
  rootPath: string,
  entryPoints: EntryPoint[],
  maxDepth = 3
): Promise<SpineAnalysis> {
  const repositoryFiles = await walkRepositoryFiles(rootPath);
  const tsJsFiles = new Set(
    repositoryFiles.map((file) => file.path).filter((filePath) => isSourceFile(filePath))
  );
  const pythonFiles = new Set(
    repositoryFiles.map((file) => file.path).filter((filePath) => isPythonFile(filePath))
  );
  const rustFiles = new Set(
    repositoryFiles.map((file) => file.path).filter((filePath) => isRustFile(filePath))
  );

  const tsJsEntries = entryPoints
    .filter((entryPoint) => isTsOrJsLanguage(entryPoint.language))
    .map((entryPoint) => entryPoint.path)
    .filter((filePath) => tsJsFiles.has(filePath));
  const pythonEntries = entryPoints
    .filter((entryPoint) => isPythonLanguage(entryPoint.language))
    .map((entryPoint) => entryPoint.path)
    .filter((filePath) => pythonFiles.has(filePath));
  const rustEntries = entryPoints
    .filter((entryPoint) => isRustLanguage(entryPoint.language))
    .map((entryPoint) => entryPoint.path)
    .filter((filePath) => rustFiles.has(filePath));

  if (tsJsEntries.length === 0 && pythonEntries.length === 0 && rustEntries.length === 0) {
    return {
      supportedLanguages: [],
      nodes: [],
      edges: [],
      entrySeeds: [],
      omittedEntryPoints: entryPoints.map((entryPoint) => entryPoint.path)
    };
  }

  const graphs = new Map<string, Map<string, Set<string>>>();
  const scores = new Map<string, number>();
  const supportedLanguages: DetectedLanguage[] = [];

  if (tsJsEntries.length > 0) {
    graphs.set("tsjs", await buildImportGraph(rootPath, tsJsFiles));
    supportedLanguages.push("typescript", "javascript");
    for (const [filePath, score] of scoreGraphFromSeeds(graphs.get("tsjs")!, tsJsEntries, maxDepth)) {
      scores.set(filePath, (scores.get(filePath) ?? 0) + score);
    }
  }

  if (pythonEntries.length > 0) {
    graphs.set("python", await buildPythonImportGraph(rootPath, pythonFiles));
    supportedLanguages.push("python");
    for (const [filePath, score] of scoreGraphFromSeeds(graphs.get("python")!, pythonEntries, maxDepth)) {
      scores.set(filePath, (scores.get(filePath) ?? 0) + score);
    }
  }

  if (rustEntries.length > 0) {
    graphs.set("rust", await buildRustModuleGraph(rootPath, rustFiles));
    supportedLanguages.push("rust");
    for (const [filePath, score] of scoreGraphFromSeeds(graphs.get("rust")!, rustEntries, maxDepth)) {
      scores.set(filePath, (scores.get(filePath) ?? 0) + score);
    }
  }

  const entrySeeds = [...tsJsEntries, ...pythonEntries, ...rustEntries].sort();
  const nodes = chooseSpineNodes(scores, entrySeeds);
  const nodeSet = new Set(nodes);
  const edges: VerifiedEdge[] = [];

  for (const graph of graphs.values()) {
    for (const from of nodes) {
      for (const to of graph.get(from) ?? []) {
        if (nodeSet.has(to)) {
          edges.push({ from, to, kind: "import" });
        }
      }
    }
  }

  return {
    supportedLanguages,
    nodes,
    edges: edges.sort((left, right) => {
      if (left.from !== right.from) {
        return left.from.localeCompare(right.from);
      }

      return left.to.localeCompare(right.to);
    }),
    entrySeeds,
    omittedEntryPoints: entryPoints
      .map((entryPoint) => entryPoint.path)
      .filter((filePath) => !entrySeeds.includes(filePath))
      .sort()
  };
}
