export type DetectedLanguage =
  | "typescript"
  | "javascript"
  | "python"
  | "go"
  | "rust"
  | "php"
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

export interface DiagramNodeRef {
  id: string;
  path: string;
}

export interface ArchitectureDiagram {
  code: string;
  mermaidLiveUrl: string;
  nodes: DiagramNodeRef[];
}

export interface SubsystemCluster {
  key: string;
  label: string;
  files: string[];
  pathGlob: string;
  entryPoint: string | null;
  whatItDoes: string;
  skipUnless: string;
}

export interface ReadingOrderItem {
  path: string;
  why: string;
}

export interface SubsystemSummary {
  label: string;
  whatItDoes: string;
  whereItLives: string;
  entryPoint: string | null;
  skipUnless: string;
}

export interface EstimatedReadTime {
  spineMinutes: number;
  fullCoverageHours: number;
}

export interface ActualCostSummary {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  totalCost: number;
  inputCost: number;
  outputCost: number;
  cacheCost: number;
}

export interface TourSynthesis {
  source: "deterministic" | "llm" | "file";
  prompt: string;
  tlDr: string;
  mentalModel: string;
  readingOrder: ReadingOrderItem[];
  subsystems: SubsystemSummary[];
  gotchas: string[];
  estimatedReadTime: EstimatedReadTime;
  actualCost?: ActualCostSummary;
}

export interface AnalysisResult {
  detection: ProjectDetection;
  entryPoints: EntryPoint[];
  spine: SpineAnalysis;
  diagram: ArchitectureDiagram | null;
  subsystems: SubsystemCluster[];
  suggestedReadingOrder: string[];
}
