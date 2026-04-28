export type DetectedLanguage =
  | "typescript"
  | "javascript"
  | "python"
  | "go"
  | "rust"
  | "unknown";

export type ProjectShape =
  | "monorepo"
  | "app"
  | "library"
  | "cli"
  | "framework"
  | "infra"
  | "mixed";

export interface RepoFile {
  path: string;
  extension: string;
}

export interface ProjectDetection {
  repoName: string;
  rootPath: string;
  languages: DetectedLanguage[];
  shape: ProjectShape;
  manifests: string[];
  topLevelDirectories: string[];
  reasons: string[];
}

export interface EntryPoint {
  path: string;
  language: DetectedLanguage;
  kind: "main" | "server" | "app" | "cli" | "library" | "framework";
  reason: string;
}

export interface AnalysisResult {
  detection: ProjectDetection;
  entryPoints: EntryPoint[];
  suggestedReadingOrder: string[];
}

