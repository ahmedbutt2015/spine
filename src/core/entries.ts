import { readFile } from "node:fs/promises";
import path from "node:path";

import type { DetectedLanguage, EntryPoint, ProjectDetection } from "../types.js";
import { pathExists, readJsonIfExists, readTextIfExists, walkRepositoryFiles } from "./repository.js";

interface PackageJsonShape {
  bin?: string | Record<string, string>;
  main?: string;
  exports?: Record<string, unknown> | string;
}

function normalizePythonPackageName(name: string): string {
  return name.trim().replace(/[-.]+/g, "_").toLowerCase();
}

function parseTomlSectionValue(content: string, sectionName: string, key: string): string | null {
  const escapedSection = sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sectionPattern = new RegExp(
    `^\\[${escapedSection}\\]\\s*([\\s\\S]*?)(?=^\\[[^\\]]+\\]|$)`,
    "m"
  );
  const sectionBody = content.match(sectionPattern)?.[1];
  if (!sectionBody) {
    return null;
  }

  const valueMatch = sectionBody.match(new RegExp(`^\\s*${escapedKey}\\s*=\\s*["']([^"']+)["']`, "m"));
  return valueMatch?.[1] ?? null;
}

function parsePythonProjectNames(pyprojectContent: string | null): string[] {
  if (!pyprojectContent) {
    return [];
  }

  const names = [
    parseTomlSectionValue(pyprojectContent, "project", "name"),
    parseTomlSectionValue(pyprojectContent, "tool.poetry", "name")
  ].filter((value): value is string => Boolean(value));

  return [...new Set(names.map((name) => normalizePythonPackageName(name)))];
}

function countGoDeclarations(source: string): number {
  let declarations = 0;

  for (const line of source.split(/\r?\n/)) {
    if (/^\s*(?:type|func|var|const)\s+/.test(line)) {
      declarations += /\b[A-Z]/.test(line) ? 3 : 1;
    }
  }

  return declarations;
}

async function chooseGoLibraryRootFile(rootPath: string, filePaths: string[], moduleBasename: string | null): Promise<string> {
  const scored = await Promise.all(
    filePaths.map(async (filePath) => {
      const source = await readFile(path.join(rootPath, filePath), "utf8");
      let score = countGoDeclarations(source);
      if (filePath === `${moduleBasename}.go`) {
        score += 8;
      }
      if (filePath === "main.go") {
        score += 20;
      }
      if (filePath === "doc.go") {
        score -= 2;
      }

      return {
        filePath,
        score,
        lineCount: source.split(/\r?\n/).length
      };
    })
  );

  scored.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    if (right.lineCount !== left.lineCount) {
      return right.lineCount - left.lineCount;
    }
    return left.filePath.localeCompare(right.filePath);
  });

  return scored[0]?.filePath ?? filePaths[0];
}

async function findPythonLibraryEntryPaths(
  files: Array<{ path: string }>,
  pyprojectContent: string | null
): Promise<string[]> {
  const packageRoots = files
    .map((file) => file.path)
    .filter((filePath) => /(?:^|\/)__init__\.py$/.test(filePath))
    .filter((filePath) => /^(?:src\/)?[A-Za-z0-9_]+\/__init__\.py$/.test(filePath))
    .sort();

  if (packageRoots.length === 0) {
    return [];
  }

  const preferredNames = parsePythonProjectNames(pyprojectContent);
  const preferredEntries = packageRoots.filter((filePath) => {
    const normalizedRoot = filePath.replace(/^src\//, "").replace(/\/__init__\.py$/, "").toLowerCase();
    return preferredNames.includes(normalizedRoot);
  });

  if (preferredEntries.length > 0) {
    return preferredEntries;
  }

  const shallowestDepth = Math.min(...packageRoots.map((filePath) => filePath.split("/").length));
  return packageRoots.filter((filePath) => filePath.split("/").length === shallowestDepth).slice(0, 3);
}

async function resolveDeclaredEntryPath(rootPath: string, declaredPath: string): Promise<string | null> {
  const sourceRoots = ["src/", "lib/"];
  const extensionSwaps: Array<[RegExp, string]> = [
    [/\.cjs$/, ".ts"],
    [/\.mjs$/, ".ts"],
    [/\.js$/, ".ts"],
    [/\.cjs$/, ".js"],
    [/\.mjs$/, ".js"]
  ];

  const candidates = new Set<string>();
  const stripped = declaredPath.replace(/^\.\/dist\//, "").replace(/^dist\//, "");
  const prefersSource = /^(?:\.\/)?dist\//.test(declaredPath);
  for (const sourceRoot of sourceRoots) {
    for (const [pattern, replacement] of extensionSwaps) {
      candidates.add(`${sourceRoot}${stripped}`.replace(pattern, replacement));
    }
    candidates.add(`${sourceRoot}${stripped}`);
  }

  if (prefersSource) {
    for (const candidate of candidates) {
      if (candidate !== declaredPath && (await pathExists(path.join(rootPath, candidate)))) {
        return candidate;
      }
    }
  }

  if (await pathExists(path.join(rootPath, declaredPath))) {
    return declaredPath;
  }

  if (!prefersSource) {
    for (const candidate of candidates) {
      if (candidate !== declaredPath && (await pathExists(path.join(rootPath, candidate)))) {
        return candidate;
      }
    }
  }

  return null;
}

function parseCargoWorkspaceMembers(cargoToml: string): string[] {
  const sectionPattern = /^\[[\w.-]+\]/gm;
  const matches = [...cargoToml.matchAll(sectionPattern)];

  let workspaceBody = "";
  for (let index = 0; index < matches.length; index += 1) {
    if (matches[index][0] !== "[workspace]") {
      continue;
    }
    const start = matches[index].index! + matches[index][0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index! : cargoToml.length;
    workspaceBody = cargoToml.slice(start, end);
    break;
  }

  if (!workspaceBody) {
    return [];
  }

  const membersMatch = workspaceBody.match(/\bmembers\s*=\s*\[([\s\S]*?)\]/);
  if (!membersMatch) {
    return [];
  }

  return [...membersMatch[1].matchAll(/"([^"]+)"/g)]
    .map((match) => match[1])
    .filter((member) => !member.includes("*"));
}

function dedupeEntryPoints(entryPoints: EntryPoint[]): EntryPoint[] {
  const seen = new Set<string>();

  return entryPoints.filter((entryPoint) => {
    if (seen.has(entryPoint.path)) {
      return false;
    }

    seen.add(entryPoint.path);
    return true;
  });
}

function inferKind(filePath: string): EntryPoint["kind"] {
  const normalized = filePath.toLowerCase();

  if (normalized.includes("server")) {
    return "server";
  }

  if (normalized.includes("cli") || normalized.includes("bin") || normalized.includes("__main__")) {
    return "cli";
  }

  if (normalized.endsWith("index.php") || normalized.includes("public/index")) {
    return "app";
  }

  if (normalized.includes("index") || normalized.includes("lib")) {
    return "library";
  }

  if (normalized.includes("__init__")) {
    return "library";
  }

  if (normalized.includes("app") || normalized.includes("main")) {
    return "app";
  }

  return "main";
}

async function addIfExists(
  rootPath: string,
  entryPoints: EntryPoint[],
  relativePath: string,
  language: DetectedLanguage,
  reason: string
): Promise<void> {
  if (await pathExists(path.join(rootPath, relativePath))) {
    entryPoints.push({
      path: relativePath,
      language,
      kind: inferKind(relativePath),
      reason
    });
  }
}

export async function findEntryPoints(
  rootPath: string,
  detection?: ProjectDetection
): Promise<EntryPoint[]> {
  const resolvedDetection = detection;
  const entryPoints: EntryPoint[] = [];

  const packageJson = await readJsonIfExists<PackageJsonShape>(path.join(rootPath, "package.json"));
  const declaredBins =
    typeof packageJson?.bin === "string"
      ? [packageJson.bin]
      : packageJson?.bin
        ? Object.values(packageJson.bin)
        : [];

  for (const binPath of declaredBins) {
    const resolvedPath = await resolveDeclaredEntryPath(rootPath, binPath);
    if (!resolvedPath) {
      continue;
    }
    entryPoints.push({
      path: resolvedPath,
      language: resolvedPath.endsWith(".ts") ? "typescript" : "javascript",
      kind: "cli",
      reason: "Declared as package.json bin."
    });
  }

  if (typeof packageJson?.main === "string") {
    const resolvedPath = await resolveDeclaredEntryPath(rootPath, packageJson.main);
    if (resolvedPath) {
      entryPoints.push({
        path: resolvedPath,
        language: resolvedPath.endsWith(".ts") ? "typescript" : "javascript",
        kind: "library",
        reason: "Declared as package.json main."
      });
    }
  }

  await addIfExists(rootPath, entryPoints, "src/index.ts", "typescript", "Conventional TypeScript module entry.");
  await addIfExists(rootPath, entryPoints, "src/main.ts", "typescript", "Conventional TypeScript app entry.");
  await addIfExists(rootPath, entryPoints, "src/server.ts", "typescript", "Conventional TypeScript server entry.");
  await addIfExists(rootPath, entryPoints, "src/app.ts", "typescript", "Conventional TypeScript app entry.");
  await addIfExists(rootPath, entryPoints, "index.js", "javascript", "Conventional JavaScript module entry.");
  await addIfExists(rootPath, entryPoints, "main.py", "python", "Conventional Python application entry.");
  await addIfExists(rootPath, entryPoints, "app.py", "python", "Conventional Python application entry.");
  await addIfExists(rootPath, entryPoints, "manage.py", "python", "Conventional Python framework entry.");
  await addIfExists(rootPath, entryPoints, "src/main.rs", "rust", "Conventional Rust binary entry.");
  await addIfExists(rootPath, entryPoints, "src/lib.rs", "rust", "Conventional Rust library entry.");
  await addIfExists(rootPath, entryPoints, "main.go", "go", "Conventional Go entry.");
  await addIfExists(rootPath, entryPoints, "public/index.php", "php", "PHP front controller.");
  await addIfExists(rootPath, entryPoints, "index.php", "php", "Conventional PHP web entry.");
  await addIfExists(rootPath, entryPoints, "artisan", "php", "Laravel CLI entry.");
  await addIfExists(rootPath, entryPoints, "bin/console", "php", "Symfony CLI entry.");

  const files = await walkRepositoryFiles(rootPath);
  const pyprojectContent = await readTextIfExists(path.join(rootPath, "pyproject.toml"));

  for (const file of files) {
    if (/^cmd\/[^/]+\/main\.go$/.test(file.path)) {
      entryPoints.push({
        path: file.path,
        language: "go",
        kind: "cli",
        reason: "Go cmd/*/main.go convention."
      });
    }

    if (/^src\/bin\/.+\.rs$/.test(file.path)) {
      entryPoints.push({
        path: file.path,
        language: "rust",
        kind: "cli",
        reason: "Rust src/bin convention."
      });
    }

    if (/(^|\/)__main__\.py$/.test(file.path)) {
      entryPoints.push({
        path: file.path,
        language: "python",
        kind: "cli",
        reason: "Python __main__ module convention."
      });
    }

    if (/^bin\/.+\.(ts|js|mjs|cjs)$/.test(file.path)) {
      entryPoints.push({
        path: file.path,
        language: file.path.endsWith(".ts") ? "typescript" : "javascript",
        kind: "cli",
        reason: "Executable bin/ script."
      });
    }
  }

  if (resolvedDetection?.shape === "framework") {
    await addIfExists(rootPath, entryPoints, "src/pages/index.tsx", "typescript", "Framework convention: pages entry.");
    await addIfExists(rootPath, entryPoints, "app/page.tsx", "typescript", "Framework convention: app router entry.");
  }

  const cargoToml = await readTextIfExists(path.join(rootPath, "Cargo.toml"));
  if (cargoToml) {
    for (const member of parseCargoWorkspaceMembers(cargoToml)) {
      const candidates: Array<{ path: string; kind: EntryPoint["kind"] }> = [
        { path: `${member}/src/lib.rs`, kind: "library" },
        { path: `${member}/src/main.rs`, kind: "main" },
        { path: `${member}/lib.rs`, kind: "library" },
        { path: `${member}/main.rs`, kind: "main" }
      ];
      for (const candidate of candidates) {
        if (await pathExists(path.join(rootPath, candidate.path))) {
          entryPoints.push({
            path: candidate.path,
            language: "rust",
            kind: candidate.kind,
            reason: `Rust workspace member: ${member}.`
          });
        }
      }
    }
  }

  const hasPhpEntry = entryPoints.some((entryPoint) => entryPoint.language === "php");
  if (!hasPhpEntry) {
    const composer = await readJsonIfExists<{
      autoload?: { "psr-4"?: Record<string, string | string[]> };
    }>(path.join(rootPath, "composer.json"));
    const psrBlock = composer?.autoload?.["psr-4"];
    if (psrBlock) {
      for (const [prefix, value] of Object.entries(psrBlock)) {
        const baseDirectories = (Array.isArray(value) ? value : [value]).map((directory) =>
          directory.replace(/\/+$/, "").replace(/^\.\//, "")
        );
        const lastNamespaceSegment = prefix.replace(/\\+$/, "").split("\\").pop() ?? "";
        const conventionalNames = [
          lastNamespaceSegment ? `${lastNamespaceSegment}.php` : "",
          "App.php",
          "Application.php",
          "Kernel.php"
        ].filter((name): name is string => Boolean(name));

        for (const baseDirectory of baseDirectories) {
          const baseSlash = baseDirectory ? `${baseDirectory}/` : "";
          const candidatesUnderBase = files
            .map((file) => file.path)
            .filter((filePath) => baseSlash === "" || filePath.startsWith(baseSlash))
            .map((filePath) => ({
              path: filePath,
              basename: path.posix.basename(filePath),
              depth: filePath.split("/").length
            }))
            .filter((candidate) => conventionalNames.includes(candidate.basename))
            .sort((left, right) => {
              if (left.depth !== right.depth) {
                return left.depth - right.depth;
              }
              const leftRank = conventionalNames.indexOf(left.basename);
              const rightRank = conventionalNames.indexOf(right.basename);
              if (leftRank !== rightRank) {
                return leftRank - rightRank;
              }
              return left.path.localeCompare(right.path);
            });

          if (candidatesUnderBase.length === 0) {
            continue;
          }

          const minDepth = candidatesUnderBase[0].depth;
          const shallowestPicks = candidatesUnderBase
            .filter((candidate) => candidate.depth === minDepth)
            .slice(0, 3);

          for (const picked of shallowestPicks) {
            entryPoints.push({
              path: picked.path,
              language: "php",
              kind: "library",
              reason: `PHP package root for namespace ${prefix.replace(/\\\\/g, "\\")}.`
            });
          }
        }
      }
    }
  }

  const hasGoEntry = entryPoints.some((entryPoint) => entryPoint.language === "go");
  if (!hasGoEntry) {
    const goMod = await readTextIfExists(path.join(rootPath, "go.mod"));
    if (goMod) {
      const rootGoFiles = files
        .map((file) => file.path)
        .filter((filePath) => /^[^/]+\.go$/.test(filePath) && !filePath.endsWith("_test.go"))
        .sort();

      if (rootGoFiles.length > 0) {
        const moduleMatch = goMod.match(/^module\s+(\S+)/m);
        const moduleBasename = moduleMatch ? path.posix.basename(moduleMatch[1]) : null;
        const canonical = await chooseGoLibraryRootFile(rootPath, rootGoFiles, moduleBasename);

        entryPoints.push({
          path: canonical,
          language: "go",
          kind: "library",
          reason: "Go package root (no main.go)."
        });
      }
    }
  }

  const hasPythonEntry = entryPoints.some((entryPoint) => entryPoint.language === "python");
  if (!hasPythonEntry) {
    for (const entryPath of await findPythonLibraryEntryPaths(files, pyprojectContent)) {
      entryPoints.push({
        path: entryPath,
        language: "python",
        kind: "library",
        reason: "Python package root inferred from pyproject and __init__.py."
      });
    }
  }

  return dedupeEntryPoints(entryPoints).sort((left, right) => left.path.localeCompare(right.path));
}
