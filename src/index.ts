export { analyzeRepository } from "./core/analyze.js";
export { generateArchitectureDiagram } from "./core/diagram.js";
export { detectProject } from "./core/detect.js";
export { findEntryPoints } from "./core/entries.js";
export { extractVerifiedSpine } from "./core/spine.js";
export { synthesizeTour, buildSynthesisPrompt } from "./core/synthesis.js";
export { clusterSubsystems } from "./core/subsystems.js";
export { writeRepoContextFile, computeContextContentHash } from "./core/repoContext.js";
export { renderOnboardingMarkdown } from "./formatters/onboarding.js";
export type {
  AnalysisResult,
  ArchitectureDiagram,
  DetectedLanguage,
  DiagramNodeRef,
  EntryPoint,
  EstimatedReadTime,
  ProjectDetection,
  ProjectShape,
  ReadingOrderItem,
  SpineAnalysis,
  SubsystemCluster,
  SubsystemSummary,
  TourSynthesis,
  VerifiedEdge
} from "./types.js";
