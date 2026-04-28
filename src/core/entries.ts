import path from "node:path";

import type { DetectedLanguage, EntryPoint, ProjectDetection } from "../types.js";
import { pathExists, readJsonIfExists, walkRepositoryFiles } from "./repository.js";

interface PackageJsonShape {
  bin?: string | Record<string, string>;
  main?: string;
  exports?: Record<string, unknown> | string;
}

async function resolveDeclaredEntryPath(rootPath: string, declaredPath: string): Promise<string> {
  if (await pathExists(path.join(rootPath, declaredPath))) {
    return declaredPath;
  }

  const candidates = [
    declaredPath
      .replace(/^\.\/dist\//, "src/")
      .replace(/^dist\//, "src/")
      .replace(/\.js$/, ".ts"),
    declaredPath
      .replace(/^\.\/dist\//, "src/")
      .replace(/^dist\//, "src/")
      .replace(/\.cjs$|\.mjs$/, ".ts")
  ];

  for (const candidate of candidates) {
    if (candidate !== declaredPath && (await pathExists(path.join(rootPath, candidate)))) {
      return candidate;
    }
  }

  return declaredPath;
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
  if (typeof packageJson?.bin === "string") {
    const resolvedPath = await resolveDeclaredEntryPath(rootPath, packageJson.bin);
    entryPoints.push({
      path: resolvedPath,
      language: resolvedPath.endsWith(".ts") ? "typescript" : "javascript",
      kind: "cli",
      reason: "Declared as package.json bin."
    });
  } else if (packageJson?.bin) {
    for (const binPath of Object.values(packageJson.bin)) {
      const resolvedPath = await resolveDeclaredEntryPath(rootPath, binPath);
      entryPoints.push({
        path: resolvedPath,
        language: resolvedPath.endsWith(".ts") ? "typescript" : "javascript",
        kind: "cli",
        reason: "Declared as package.json bin."
      });
    }
  }

  if (typeof packageJson?.main === "string") {
    const resolvedPath = await resolveDeclaredEntryPath(rootPath, packageJson.main);
    entryPoints.push({
      path: resolvedPath,
      language: resolvedPath.endsWith(".ts") ? "typescript" : "javascript",
      kind: "library",
      reason: "Declared as package.json main."
    });
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

  return dedupeEntryPoints(entryPoints).sort((left, right) => left.path.localeCompare(right.path));
}
