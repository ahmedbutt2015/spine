import type { AnalysisResult, EntryPoint } from "../types.js";

function formatEntryPointReason(entryPoint: EntryPoint): string {
  return `${entryPoint.path} - ${entryPoint.reason}`;
}

function renderMentalModel(result: AnalysisResult): string {
  const primaryLanguage = result.detection.languages[0];

  switch (result.detection.shape) {
    case "monorepo":
      return `Think in slices first: start from the top-level workspace contract, then drop into the package that owns the entry path you care about.`;
    case "framework":
      return `The framework conventions are part of the runtime. Read the app through the convention-defined entry files before diving into helpers.`;
    case "cli":
      return `Treat the command surface as the product. Follow the bin entry, then the argument parsing, then the core execution path.`;
    case "library":
      return `Public API boundaries matter more than request flow. Start from the exported surface, then trace inward to the implementation seam.`;
    default:
      return `Follow the runtime path from entry point to core services. In this ${primaryLanguage} codebase, the fastest way to orient is to track how startup hands off work.`;
  }
}

export function renderOnboardingMarkdown(result: AnalysisResult): string {
  const tlDr = [
    `This repository looks like a ${result.detection.shape} codebase built primarily in ${result.detection.languages.join(", ")}.`,
    `The most likely starting points are ${result.entryPoints.slice(0, 3).map((entryPoint) => `\`${entryPoint.path}\``).join(", ") || "still being determined"}.`,
    `This pass is deterministic and now includes first-pass TS/JS spine extraction; diagram generation and broader multi-language tracing come next.`
  ].join(" ");

  const readingOrder = result.suggestedReadingOrder.length
    ? result.suggestedReadingOrder.map((filePath) => `- \`${filePath}\` - Read this early because it either starts the program or defines a key project contract.`).join("\n")
    : "- No reading order found yet.";

  const entryPoints = result.entryPoints.length
    ? result.entryPoints.map((entryPoint) => `- ${formatEntryPointReason(entryPoint)}`).join("\n")
    : "- No entry points detected.";

  const gotchas = result.detection.reasons.map((reason) => `- ${reason}`).join("\n");
  const architectureSummary = result.spine.nodes.length
    ? [
        `Verified TS/JS spine nodes: ${result.spine.nodes.map((node) => `\`${node}\``).join(", ")}.`,
        `Retained ${result.spine.edges.length} verified edge(s) from static imports only.`,
        `Diagram generation is the next step, but the node and edge set is now grounded in real source relationships.`
      ].join(" ")
    : "No verified TS/JS spine is available yet for this repository shape. Diagram generation remains pending.";

  return `# Onboarding tour: ${result.detection.repoName}

## TL;DR
${tlDr}

## Architecture map
${architectureSummary}

## Mental model
${renderMentalModel(result)}

## Reading order
${readingOrder}

## Entry points found
${entryPoints}

## Subsystems
- Not clustered yet. Directory-based subsystem grouping lands in the next stage.

## Gotchas
${gotchas || "- No gotchas yet."}

## Estimated read time
10-20 minutes for the current deterministic scan, with deeper subsystem synthesis still pending.
`;
}
