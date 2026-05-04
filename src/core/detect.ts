import path from "node:path";

import type { DetectedLanguage, ProjectDetection, ProjectShape, RepoFile } from "../types.js";
import {
  listTopLevelDirectories,
  pathExists,
  readJsonIfExists,
  readTextIfExists,
  walkRepositoryFiles
} from "./repository.js";

interface PackageJsonShape {
  name?: string;
  private?: boolean;
  workspaces?: string[] | { packages?: string[] };
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

function hasPythonLibraryPackage(files: RepoFile[], projectNames: string[]): boolean {
  const packageRoots = files
    .map((file) => file.path)
    .filter((filePath) => /(?:^|\/)__init__\.py$/.test(filePath))
    .map((filePath) => filePath.replace(/\/__init__\.py$/, ""));

  if (packageRoots.length === 0) {
    return false;
  }

  if (projectNames.length === 0) {
    return packageRoots.some((packageRoot) => /^(?:src\/)?[A-Za-z0-9_]+$/.test(packageRoot));
  }

  return packageRoots.some((packageRoot) => {
    const normalizedRoot = packageRoot.replace(/^src\//, "").toLowerCase();
    return projectNames.includes(normalizedRoot);
  });
}

const LANGUAGE_EXTENSIONS: Record<string, DetectedLanguage> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".php": "php"
};

function detectLanguages(files: RepoFile[]): DetectedLanguage[] {
  const counts = new Map<DetectedLanguage, number>();

  for (const file of files) {
    const language = LANGUAGE_EXTENSIONS[file.extension];
    if (!language) {
      continue;
    }

    counts.set(language, (counts.get(language) ?? 0) + 1);
  }

  const ranked = [...counts.entries()].sort((left, right) => right[1] - left[1]);
  if (ranked.length === 0) {
    return ["unknown"];
  }

  const totalSourceFiles = ranked.reduce((sum, [, count]) => sum + count, 0);
  const minimumCount = Math.max(5, Math.ceil(totalSourceFiles * 0.05));

  const filtered = ranked.filter(([, count], index) => index === 0 || count >= minimumCount);
  return filtered.map(([language]) => language);
}

function pickShape(options: {
  hasWorkspaces: boolean;
  hasFrameworkConfig: boolean;
  hasCliBin: boolean;
  hasLibraryExports: boolean;
  topLevelDirectories: string[];
  languages: DetectedLanguage[];
}): { shape: ProjectShape; reasons: string[] } {
  const reasons: string[] = [];

  if (options.hasWorkspaces) {
    reasons.push("Detected workspaces or multiple package roots.");
    return { shape: "monorepo", reasons };
  }

  if (options.hasFrameworkConfig) {
    reasons.push("Detected framework-specific config files.");
    return { shape: "framework", reasons };
  }

  if (options.hasLibraryExports) {
    reasons.push("Detected package exports or main entry.");
    return { shape: "library", reasons };
  }

  if (options.hasCliBin) {
    reasons.push("Detected CLI bin entry.");
    return { shape: "cli", reasons };
  }

  if (options.topLevelDirectories.includes("infra") || options.topLevelDirectories.includes("terraform")) {
    reasons.push("Detected infrastructure-focused directories.");
    return { shape: "infra", reasons };
  }

  if (options.languages.length > 1) {
    reasons.push("Detected multiple implementation languages.");
    return { shape: "mixed", reasons };
  }

  reasons.push("Defaulted to app after manifest and file scan.");
  return { shape: "app", reasons };
}

export async function detectProject(rootPath: string): Promise<ProjectDetection> {
  const files = await walkRepositoryFiles(rootPath);
  const languages = detectLanguages(files);
  const topLevelDirectories = await listTopLevelDirectories(rootPath);
  const repoName = path.basename(rootPath);

  const packageJsonPath = path.join(rootPath, "package.json");
  const packageJson = await readJsonIfExists<PackageJsonShape>(packageJsonPath);
  const pyproject = await pathExists(path.join(rootPath, "pyproject.toml"));
  const pyprojectContent = pyproject ? await readTextIfExists(path.join(rootPath, "pyproject.toml")) : null;
  const cargoToml = await readTextIfExists(path.join(rootPath, "Cargo.toml"));
  const goMod = await pathExists(path.join(rootPath, "go.mod"));
  const nextConfig =
    (await pathExists(path.join(rootPath, "next.config.js"))) ||
    (await pathExists(path.join(rootPath, "next.config.mjs"))) ||
    (await pathExists(path.join(rootPath, "next.config.ts")));
  const requirements = await pathExists(path.join(rootPath, "requirements.txt"));
  const composerJson = await readJsonIfExists<{ type?: string; autoload?: Record<string, unknown> }>(
    path.join(rootPath, "composer.json")
  );
  const pnpmWorkspace = await readTextIfExists(path.join(rootPath, "pnpm-workspace.yaml"));
  const rustLibFile = await pathExists(path.join(rootPath, "src/lib.rs"));
  const rustMainFile = await pathExists(path.join(rootPath, "src/main.rs"));
  const cargoDeclaresLib = Boolean(cargoToml?.match(/^\s*\[lib\]/m));
  const cargoDeclaresWorkspace = Boolean(cargoToml?.match(/^\s*\[workspace\]/m));
  const hasGoMain = files.some(
    (file) => file.path === "main.go" || /^cmd\/[^/]+\/main\.go$/.test(file.path)
  );
  const hasPythonAppEntry = files.some((file) =>
    ["main.py", "app.py", "manage.py"].includes(file.path) || /(?:^|\/)__main__\.py$/.test(file.path)
  );
  const pythonProjectNames = parsePythonProjectNames(pyprojectContent);
  const pythonLibrary = pyproject && !hasPythonAppEntry && hasPythonLibraryPackage(files, pythonProjectNames);
  const goLibrary = goMod && !hasGoMain;
  const composerHasPsr4 = Boolean(
    composerJson?.autoload && (composerJson.autoload as { "psr-4"?: unknown })["psr-4"]
  );
  const hasPhpAppEntry =
    (await pathExists(path.join(rootPath, "public/index.php"))) ||
    (await pathExists(path.join(rootPath, "index.php"))) ||
    (await pathExists(path.join(rootPath, "artisan"))) ||
    (await pathExists(path.join(rootPath, "bin/console")));
  const phpLibrary = composerJson?.type === "library" || (composerHasPsr4 && !hasPhpAppEntry);

  const workspaceArray = Array.isArray(packageJson?.workspaces)
    ? packageJson.workspaces
    : packageJson?.workspaces?.packages;
  const hasWorkspaces = Boolean(workspaceArray?.length || pnpmWorkspace || cargoDeclaresWorkspace);
  const hasCliBin = Boolean(packageJson?.bin) || (await pathExists(path.join(rootPath, "bin")));
  const hasLibraryExports =
    Boolean(packageJson?.exports || packageJson?.main) ||
    pythonLibrary ||
    (rustLibFile && !rustMainFile) ||
    cargoDeclaresLib ||
    goLibrary ||
    phpLibrary;
  const { shape, reasons } = pickShape({
    hasWorkspaces,
    hasFrameworkConfig: nextConfig,
    hasCliBin,
    hasLibraryExports,
    topLevelDirectories,
    languages
  });

  const manifests = [
    packageJson ? "package.json" : null,
    pyproject ? "pyproject.toml" : null,
    requirements ? "requirements.txt" : null,
    cargoToml !== null ? "Cargo.toml" : null,
    goMod ? "go.mod" : null,
    composerJson ? "composer.json" : null,
    pnpmWorkspace ? "pnpm-workspace.yaml" : null
  ].filter((value): value is string => Boolean(value));

  return {
    repoName,
    rootPath,
    languages,
    shape,
    manifests,
    topLevelDirectories,
    reasons
  };
}
