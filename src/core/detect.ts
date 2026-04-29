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
  ".rs": "rust"
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

  const languages = [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([language]) => language);

  return languages.length > 0 ? languages : ["unknown"];
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

  if (options.hasCliBin) {
    reasons.push("Detected CLI bin entry.");
    return { shape: "cli", reasons };
  }

  if (options.hasLibraryExports) {
    reasons.push("Detected package exports or main entry.");
    return { shape: "library", reasons };
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
  const cargoToml = await readTextIfExists(path.join(rootPath, "Cargo.toml"));
  const goMod = await pathExists(path.join(rootPath, "go.mod"));
  const nextConfig =
    (await pathExists(path.join(rootPath, "next.config.js"))) ||
    (await pathExists(path.join(rootPath, "next.config.mjs"))) ||
    (await pathExists(path.join(rootPath, "next.config.ts")));
  const requirements = await pathExists(path.join(rootPath, "requirements.txt"));
  const pnpmWorkspace = await readTextIfExists(path.join(rootPath, "pnpm-workspace.yaml"));
  const rustLibFile = await pathExists(path.join(rootPath, "src/lib.rs"));
  const rustMainFile = await pathExists(path.join(rootPath, "src/main.rs"));
  const cargoDeclaresLib = Boolean(cargoToml?.match(/^\s*\[lib\]/m));
  const cargoDeclaresWorkspace = Boolean(cargoToml?.match(/^\s*\[workspace\]/m));

  const workspaceArray = Array.isArray(packageJson?.workspaces)
    ? packageJson.workspaces
    : packageJson?.workspaces?.packages;
  const hasWorkspaces = Boolean(workspaceArray?.length || pnpmWorkspace || cargoDeclaresWorkspace);
  const hasCliBin = Boolean(packageJson?.bin) || (await pathExists(path.join(rootPath, "bin")));
  const hasLibraryExports =
    Boolean(packageJson?.exports || packageJson?.main) ||
    (rustLibFile && !rustMainFile) ||
    cargoDeclaresLib;
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

