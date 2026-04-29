import type { AnalysisResult, EntryPoint, TourSynthesis } from "../types.js";

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

function renderSubsystems(synthesis: TourSynthesis): string {
  if (synthesis.subsystems.length === 0) {
    return "- No subsystem clusters were strong enough to report yet.";
  }

  return synthesis.subsystems
    .map((subsystem) =>
      [
        `### ${subsystem.label}`,
        `What it does: ${subsystem.whatItDoes}`,
        `Where it lives: \`${subsystem.whereItLives}\``,
        `Entry point: ${subsystem.entryPoint ? `\`${subsystem.entryPoint}\`` : "None identified"}`,
        `Skip unless: ${subsystem.skipUnless}`
      ].join("\n")
    )
    .join("\n\n");
}

function formatHours(hours: number): string {
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}

export function renderOnboardingMarkdown(result: AnalysisResult, synthesis: TourSynthesis): string {
  const readingOrder = synthesis.readingOrder.length
    ? synthesis.readingOrder.map((item) => `- \`${item.path}\` - ${item.why}`).join("\n")
    : "- No reading order found yet.";

  const entryPoints = result.entryPoints.length
    ? result.entryPoints.map((entryPoint) => `- ${formatEntryPointReason(entryPoint)}`).join("\n")
    : "- No entry points detected.";

  const gotchas = synthesis.gotchas.map((reason) => `- ${reason}`).join("\n");
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
${synthesis.tlDr}

## Architecture map
${architectureMap}

## Mental model
${synthesis.mentalModel || renderMentalModel(result)}

## Reading order
${readingOrder}

## Entry points found
${entryPoints}

## Subsystems
${renderSubsystems(synthesis)}

## Gotchas
${gotchas || "- No gotchas yet."}

## Estimated read time
${synthesis.estimatedReadTime.spineMinutes} minutes for the spine, ${formatHours(synthesis.estimatedReadTime.fullCoverageHours)} for fuller coverage.
`;
}
