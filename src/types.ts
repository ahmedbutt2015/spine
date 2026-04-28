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

export interface VerifiedEdge {
  from: string;
  to: string;
  kind: "import";
}

export interface SpineAnalysis {
  supportedLanguages: DetectedLanguage[];
  nodes: string[];
  edges: VerifiedEdge[];
  entrySeeds: string[];
  omittedEntryPoints: string[];
}

export interface AnalysisResult {
  detection: ProjectDetection;
  entryPoints: EntryPoint[];
  spine: SpineAnalysis;
  suggestedReadingOrder: string[];
}
