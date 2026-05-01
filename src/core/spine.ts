import { readFile } from "node:fs/promises";
import path from "node:path";

import type { DetectedLanguage, EntryPoint, SpineAnalysis, VerifiedEdge } from "../types.js";
import { pathExists, readJsonIfExists, readTextIfExists, walkRepositoryFiles } from "./repository.js";

interface TsconfigPathConfig {
  baseUrl: string;
  paths: Array<{ pattern: string; replacements: string[] }>;
}

const SUPPORTED_SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
const SOURCE_EXTENSION_SET = new Set(SUPPORTED_SOURCE_EXTENSIONS);
const PYTHON_EXTENSION = ".py";
const RUST_EXTENSION = ".rs";
const GO_EXTENSION = ".go";
const PHP_EXTENSION = ".php";

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

function isGoLanguage(language: DetectedLanguage): boolean {
  return language === "go";
}

function isPhpLanguage(language: DetectedLanguage): boolean {
  return language === "php";
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

function isGoFile(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === GO_EXTENSION && !filePath.endsWith("_test.go");
}

function isPhpFile(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === PHP_EXTENSION;
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

function collectGoImportSpecifiers(source: string): string[] {
  const matches: string[] = [];
  const singleImportPattern = /^\s*import\s+(?:[A-Za-z0-9_\.]+\s+)?"([^"]+)"/gm;
  const importBlockPattern = /import\s*\(([\s\S]*?)\)/gm;
  const blockEntryPattern = /^\s*(?:[A-Za-z0-9_\.]+\s+)?"([^"]+)"/gm;

  for (const match of source.matchAll(singleImportPattern)) {
    const specifier = match[1];
    if (specifier) {
      matches.push(specifier);
    }
  }

  for (const blockMatch of source.matchAll(importBlockPattern)) {
    const block = blockMatch[1];
    if (!block) {
      continue;
    }

    for (const entryMatch of block.matchAll(blockEntryPattern)) {
      const specifier = entryMatch[1];
      if (specifier) {
        matches.push(specifier);
      }
    }
  }

  return matches;
}

async function loadTsconfigPathConfig(rootPath: string): Promise<TsconfigPathConfig | null> {
  const tsconfig = await readJsonIfExists<{
    compilerOptions?: {
      baseUrl?: string;
      paths?: Record<string, string[]>;
    };
  }>(path.join(rootPath, "tsconfig.json"));

  const paths = tsconfig?.compilerOptions?.paths;
  if (!paths) {
    return null;
  }

  const baseUrl = tsconfig?.compilerOptions?.baseUrl ?? ".";

  return {
    baseUrl: normalizeRelativePath(path.posix.normalize(baseUrl)),
    paths: Object.entries(paths).map(([pattern, replacements]) => ({
      pattern,
      replacements
    }))
  };
}

function expandAliasedSpecifier(specifier: string, config: TsconfigPathConfig): string[] {
  const candidates: string[] = [];

  for (const { pattern, replacements } of config.paths) {
    if (pattern.endsWith("/*")) {
      const prefix = pattern.slice(0, -2);
      if (specifier !== prefix && !specifier.startsWith(`${prefix}/`)) {
        continue;
      }

      const suffix = specifier === prefix ? "" : specifier.slice(prefix.length + 1);
      for (const replacement of replacements) {
        if (replacement.endsWith("/*")) {
          const base = replacement.slice(0, -2);
          candidates.push(suffix ? `${base}/${suffix}` : base);
        } else {
          candidates.push(replacement);
        }
      }
      continue;
    }

    if (pattern === specifier) {
      candidates.push(...replacements);
    }
  }

  return candidates;
}

function buildImportCandidates(baseTarget: string): Set<string> {
  const baseWithoutExtension = baseTarget.replace(/\.[^.\/]+$/, "");
  return new Set<string>([
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
}

async function firstExistingCandidate(rootPath: string, candidates: Iterable<string>): Promise<string | null> {
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

async function resolveLocalImport(
  rootPath: string,
  fromPath: string,
  specifier: string,
  tsconfig: TsconfigPathConfig | null
): Promise<string | null> {
  if (specifier.startsWith(".")) {
    const fromDirectory = path.dirname(fromPath);
    const baseTarget = normalizeRelativePath(path.posix.normalize(path.posix.join(fromDirectory, specifier)));
    return firstExistingCandidate(rootPath, buildImportCandidates(baseTarget));
  }

  if (!tsconfig) {
    return null;
  }

  for (const replacement of expandAliasedSpecifier(specifier, tsconfig)) {
    const baseTarget = normalizeRelativePath(
      path.posix.normalize(path.posix.join(tsconfig.baseUrl, replacement))
    );
    const resolved = await firstExistingCandidate(rootPath, buildImportCandidates(baseTarget));
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

async function buildImportGraph(
  rootPath: string,
  candidateFiles: Set<string>
): Promise<Map<string, Set<string>>> {
  const graph = new Map<string, Set<string>>();
  const tsconfig = await loadTsconfigPathConfig(rootPath);

  for (const filePath of candidateFiles) {
    const absolutePath = path.join(rootPath, filePath);
    const source = await readFile(absolutePath, "utf8");
    const imports = collectImportSpecifiers(source);
    const resolvedImports = new Set<string>();

    for (const specifier of imports) {
      const resolved = await resolveLocalImport(rootPath, filePath, specifier, tsconfig);
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

function chooseRepresentativeGoFile(directoryPath: string, files: string[]): string {
  const sortedFiles = [...files].sort();
  const basename = path.posix.basename(directoryPath);

  const preferredCandidates = [
    basename ? path.posix.join(directoryPath, `${basename}.go`) : "main.go",
    path.posix.join(directoryPath, "main.go"),
    path.posix.join(directoryPath, "root.go")
  ];

  for (const candidate of preferredCandidates) {
    if (sortedFiles.includes(candidate)) {
      return candidate;
    }
  }

  return sortedFiles[0];
}

function buildGoPackageIndex(candidateFiles: Set<string>): Map<string, string> {
  const filesByDirectory = new Map<string, string[]>();

  for (const filePath of candidateFiles) {
    const directoryPath = path.posix.dirname(filePath) === "." ? "" : path.posix.dirname(filePath);
    const existing = filesByDirectory.get(directoryPath) ?? [];
    existing.push(filePath);
    filesByDirectory.set(directoryPath, existing);
  }

  const packageIndex = new Map<string, string>();
  for (const [directoryPath, files] of filesByDirectory) {
    packageIndex.set(directoryPath, chooseRepresentativeGoFile(directoryPath, files));
  }

  return packageIndex;
}

function resolveGoImportToDirectory(modulePath: string, specifier: string): string | null {
  if (specifier === modulePath) {
    return "";
  }

  if (!specifier.startsWith(`${modulePath}/`)) {
    return null;
  }

  return specifier.slice(modulePath.length + 1);
}

async function buildGoImportGraph(
  rootPath: string,
  candidateFiles: Set<string>
): Promise<Map<string, Set<string>>> {
  const graph = new Map<string, Set<string>>();
  const goMod = await readTextIfExists(path.join(rootPath, "go.mod"));
  const modulePath = goMod?.match(/^module\s+(\S+)/m)?.[1];

  if (!modulePath) {
    for (const filePath of candidateFiles) {
      graph.set(filePath, new Set());
    }
    return graph;
  }

  const packageIndex = buildGoPackageIndex(candidateFiles);

  for (const filePath of candidateFiles) {
    const absolutePath = path.join(rootPath, filePath);
    const source = await readFile(absolutePath, "utf8");
    const specifiers = collectGoImportSpecifiers(source);
    const resolvedImports = new Set<string>();

    for (const specifier of specifiers) {
      const targetDirectory = resolveGoImportToDirectory(modulePath, specifier);
      if (targetDirectory === null) {
        continue;
      }

      const representativeFile = packageIndex.get(targetDirectory);
      if (representativeFile && representativeFile !== filePath) {
        resolvedImports.add(representativeFile);
      }
    }

    graph.set(filePath, resolvedImports);
  }

  return graph;
}

interface PsrMapping {
  prefix: string;
  baseDirectories: string[];
}

async function loadPsrMappings(rootPath: string): Promise<PsrMapping[]> {
  const composer = await readJsonIfExists<{
    autoload?: { "psr-4"?: Record<string, string | string[]> };
    "autoload-dev"?: { "psr-4"?: Record<string, string | string[]> };
  }>(path.join(rootPath, "composer.json"));

  if (!composer) {
    return [];
  }

  const mappings: PsrMapping[] = [];
  const blocks = [composer.autoload?.["psr-4"], composer["autoload-dev"]?.["psr-4"]];
  for (const block of blocks) {
    if (!block) {
      continue;
    }
    for (const [prefix, value] of Object.entries(block)) {
      const directories = (Array.isArray(value) ? value : [value])
        .map((directory) => directory.replace(/\/+$/, "").replace(/^\.\//, ""));
      mappings.push({ prefix, baseDirectories: directories });
    }
  }

  return mappings;
}

function collectPhpUseSpecifiers(source: string): string[] {
  const matches: string[] = [];
  for (const useMatch of source.matchAll(/^\s*use\s+([^;]+);/gm)) {
    for (const part of useMatch[1].split(",")) {
      const className = part.trim().replace(/^(?:function|const)\s+/i, "").split(/\s+as\s+/i)[0]?.trim();
      if (className) {
        matches.push(className);
      }
    }
  }
  return matches;
}

function collectPhpRequireSpecifiers(source: string): string[] {
  const matches: string[] = [];
  for (const requireMatch of source.matchAll(
    /(?:require|require_once|include|include_once)\s*\(?\s*['"]([^'"]+)['"]/g
  )) {
    matches.push(requireMatch[1]);
  }
  return matches;
}

function resolvePsrClassToCandidates(className: string, mappings: PsrMapping[]): string[] {
  const normalized = className.replace(/^\\+/, "");
  const candidates: string[] = [];

  for (const mapping of mappings) {
    if (!normalized.startsWith(mapping.prefix)) {
      continue;
    }

    const relative = normalized.slice(mapping.prefix.length);
    const fileSubpath = `${relative.split("\\").join("/")}.php`;
    for (const baseDirectory of mapping.baseDirectories) {
      const joined = baseDirectory ? `${baseDirectory}/${fileSubpath}` : fileSubpath;
      candidates.push(joined);
    }
  }

  return candidates;
}

async function buildPhpImportGraph(
  rootPath: string,
  candidateFiles: Set<string>
): Promise<Map<string, Set<string>>> {
  const graph = new Map<string, Set<string>>();
  const psrMappings = await loadPsrMappings(rootPath);

  for (const filePath of candidateFiles) {
    const absolutePath = path.join(rootPath, filePath);
    const source = await readFile(absolutePath, "utf8");
    const useSpecifiers = collectPhpUseSpecifiers(source);
    const requireSpecifiers = collectPhpRequireSpecifiers(source);
    const resolvedImports = new Set<string>();

    for (const className of useSpecifiers) {
      for (const candidate of resolvePsrClassToCandidates(className, psrMappings)) {
        if (candidateFiles.has(candidate) && candidate !== filePath) {
          resolvedImports.add(candidate);
        }
      }
    }

    const fromDirectory = path.posix.dirname(filePath);
    for (const specifier of requireSpecifiers) {
      if (specifier.startsWith("/") || /^https?:\/\//.test(specifier)) {
        continue;
      }
      const candidate = path.posix.normalize(path.posix.join(fromDirectory, specifier));
      if (candidateFiles.has(candidate) && candidate !== filePath) {
        resolvedImports.add(candidate);
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
  const goFiles = new Set(
    repositoryFiles.map((file) => file.path).filter((filePath) => isGoFile(filePath))
  );
  const phpFiles = new Set(
    repositoryFiles.map((file) => file.path).filter((filePath) => isPhpFile(filePath))
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
  const goEntries = entryPoints
    .filter((entryPoint) => isGoLanguage(entryPoint.language))
    .map((entryPoint) => entryPoint.path)
    .filter((filePath) => goFiles.has(filePath));
  const phpEntries = entryPoints
    .filter((entryPoint) => isPhpLanguage(entryPoint.language))
    .map((entryPoint) => entryPoint.path)
    .filter((filePath) => phpFiles.has(filePath));

  if (
    tsJsEntries.length === 0 &&
    pythonEntries.length === 0 &&
    rustEntries.length === 0 &&
    goEntries.length === 0 &&
    phpEntries.length === 0
  ) {
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

  if (goEntries.length > 0) {
    graphs.set("go", await buildGoImportGraph(rootPath, goFiles));
    supportedLanguages.push("go");
    for (const [filePath, score] of scoreGraphFromSeeds(graphs.get("go")!, goEntries, maxDepth)) {
      scores.set(filePath, (scores.get(filePath) ?? 0) + score);
    }
  }

  if (phpEntries.length > 0) {
    graphs.set("php", await buildPhpImportGraph(rootPath, phpFiles));
    supportedLanguages.push("php");
    for (const [filePath, score] of scoreGraphFromSeeds(graphs.get("php")!, phpEntries, maxDepth)) {
      scores.set(filePath, (scores.get(filePath) ?? 0) + score);
    }
  }

  const entrySeeds = [...tsJsEntries, ...pythonEntries, ...rustEntries, ...goEntries, ...phpEntries].sort();
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
