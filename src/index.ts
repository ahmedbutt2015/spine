export { analyzeRepository } from "./core/analyze.js";
export { detectProject } from "./core/detect.js";
export { findEntryPoints } from "./core/entries.js";
export { extractVerifiedSpine } from "./core/spine.js";
export { renderOnboardingMarkdown } from "./formatters/onboarding.js";
export type {
  AnalysisResult,
  DetectedLanguage,
  EntryPoint,
  ProjectDetection,
  ProjectShape,
  SpineAnalysis,
  VerifiedEdge
} from "./types.js";
