import path from "node:path";

import type { DetectedLanguage, EntryPoint, ProjectDetection } from "../types.js";
import { pathExists, readJsonIfExists, readTextIfExists, walkRepositoryFiles } from "./repository.js";

interface PackageJsonShape {
  bin?: string | Record<string, string>;
  main?: string;
  exports?: Record<string, unknown> | string;
}

async function resolveDeclaredEntryPath(rootPath: string, declaredPath: string): Promise<string | null> {
  if (await pathExists(path.join(rootPath, declaredPath))) {
    return declaredPath;
  }

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
  for (const sourceRoot of sourceRoots) {
    for (const [pattern, replacement] of extensionSwaps) {
      candidates.add(`${sourceRoot}${stripped}`.replace(pattern, replacement));
    }
    candidates.add(`${sourceRoot}${stripped}`);
  }

  for (const candidate of candidates) {
    if (candidate !== declaredPath && (await pathExists(path.join(rootPath, candidate)))) {
      return candidate;
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

  if (normalized.includes("index") || normalized.includes("lib")) {
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

  const files = await walkRepositoryFiles(rootPath);

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
        const canonical =
          (moduleBasename && rootGoFiles.find((filePath) => filePath === `${moduleBasename}.go`)) ||
          rootGoFiles.find((filePath) => filePath === "doc.go") ||
          rootGoFiles[0];

        entryPoints.push({
          path: canonical,
          language: "go",
          kind: "library",
          reason: "Go package root (no main.go)."
        });
      }
    }
  }

  return dedupeEntryPoints(entryPoints).sort((left, right) => left.path.localeCompare(right.path));
}
