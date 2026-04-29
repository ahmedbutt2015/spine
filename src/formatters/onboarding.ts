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
    `This pass is deterministic and now includes verified spine extraction plus validated diagram generation for supported languages; broader synthesis still comes next.`
  ].join(" ");

  const readingOrder = result.suggestedReadingOrder.length
    ? result.suggestedReadingOrder.map((filePath) => `- \`${filePath}\` - Read this early because it either starts the program or defines a key project contract.`).join("\n")
    : "- No reading order found yet.";

  const entryPoints = result.entryPoints.length
    ? result.entryPoints.map((entryPoint) => `- ${formatEntryPointReason(entryPoint)}`).join("\n")
    : "- No entry points detected.";

  const gotchas = result.detection.reasons.map((reason) => `- ${reason}`).join("\n");
  const architectureMap = result.diagram
    ? [
        "```mermaid",
        result.diagram.code,
        "```",
        "",
        `View / edit on [mermaid.live](${result.diagram.mermaidLiveUrl})`,
        "",
        "Legend:",
        ...result.diagram.nodes.map((nodeRef) => `- \`${nodeRef.id}\` = \`${nodeRef.path}\``),
        "",
        "Every edge above is verified by static analysis. Edges the tool couldn't verify are omitted, not guessed."
      ].join("\n")
    : result.spine.nodes.length
      ? [
          `Verified spine languages: ${result.spine.supportedLanguages.join(", ")}.`,
          `Verified spine nodes: ${result.spine.nodes.map((node) => `\`${node}\``).join(", ")}.`,
          `Retained ${result.spine.edges.length} verified edge(s) from static imports only.`,
          "Diagram validation failed twice, so the diagram was omitted rather than shipping broken Mermaid."
        ].join(" ")
      : "No verified spine is available yet for this repository shape. Diagram generation remains pending.";

  return `# Onboarding tour: ${result.detection.repoName}

## TL;DR
${tlDr}

## Architecture map
${architectureMap}

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
