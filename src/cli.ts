#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { analyzeRepository } from "./core/analyze.js";
import { computeContextContentHash, writeRepoContextFile } from "./core/repoContext.js";
import { synthesizeTour } from "./core/synthesis.js";
import { renderOnboardingMarkdown } from "./formatters/onboarding.js";
import {
  estimateOutputTokens,
  estimateTokens,
  formatCostEstimate,
  resolveCostModel
} from "./core/cost.js";

interface CliOptions {
  targetPath: string;
  json: boolean;
  outPath?: string;
  promptOutPath?: string;
  synthesisCommand?: string;
  synthesisInputPath?: string;
  anthropicModel?: string;
  noContextFile: boolean;
  contextFilePath?: string;
  mapOnly: boolean;
  costModel?: string;
  diffAgainst?: string;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    targetPath: ".",
    json: false,
    noContextFile: false,
    mapOnly: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--json") {
      options.json = true;
      continue;
    }

    if (token === "--out") {
      options.outPath = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === "--prompt-out") {
      options.promptOutPath = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === "--synthesis-command") {
      options.synthesisCommand = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === "--synthesis-input") {
      options.synthesisInputPath = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === "--anthropic-model") {
      options.anthropicModel = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === "--no-context-file") {
      options.noContextFile = true;
      continue;
    }

    if (token === "--context-file") {
      options.contextFilePath = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === "--map-only") {
      options.mapOnly = true;
      continue;
    }

    if (token === "--cost-model") {
      options.costModel = argv[index + 1];
      index += 1;
      continue;
    }

    if (token === "--diff-against") {
      options.diffAgainst = argv[index + 1];
      index += 1;
      continue;
    }

    if (!token.startsWith("-")) {
      options.targetPath = token;
    }
  }

  return options;
}

function countNonBlankLines(source: string): number {
  return source.split(/\r?\n/).reduce((count, line) => count + (line.trim().length > 0 ? 1 : 0), 0);
}

async function countSpineLines(rootPath: string, spineNodes: string[]): Promise<number> {
  let lineCount = 0;

  for (const filePath of spineNodes) {
    try {
      const source = await readFile(path.join(rootPath, filePath), "utf8");
      lineCount += countNonBlankLines(source);
    } catch {
      // ignore unreadable spine files
    }
  }

  return lineCount;
}

function countSubsystemFiles(subsystems: Array<{ files: string[] }>): number {
  return subsystems.reduce((sum, cluster) => sum + cluster.files.length, 0);
}

function formatValueStatement(
  spineFileCount: number,
  spineLineCount: number,
  subsystemCount: number,
  subsystemFileCount: number,
  estimatedCost: number
): string {
  const manualHours = Math.max(1, Number(((spineLineCount + subsystemFileCount * 120) / 120).toFixed(1)));
  return `This tour covers ${spineFileCount} spine file(s) (~${spineLineCount} lines) and ${subsystemCount} subsystems.\nEstimated savings: ~${manualHours} hours of manual exploration for ~$${estimatedCost.toFixed(2)} of LLM cost.`;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const rootPath = path.resolve(process.cwd(), options.targetPath);
  const result = await analyzeRepository(rootPath);

  if (options.mapOnly) {
    if (options.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }

    if (!result.diagram) {
      process.stdout.write("No verified Mermaid diagram could be generated for this repository.\n");
      return;
    }

    if (options.outPath) {
      const mapOutPath = path.resolve(process.cwd(), options.outPath);
      await writeFile(mapOutPath, result.diagram.code, "utf8");
      process.stdout.write(`Wrote ${mapOutPath}\n`);
      process.stdout.write(`View / edit on ${result.diagram.mermaidLiveUrl}\n`);
      return;
    }

    process.stdout.write(`${result.diagram.code}\n\n`);
    process.stdout.write(`View / edit on ${result.diagram.mermaidLiveUrl}\n`);
    return;
  }

  const synthesis = await synthesizeTour(rootPath, result, {
    promptOutPath: options.promptOutPath,
    synthesisCommand: options.synthesisCommand ?? process.env.SPINE_SYNTHESIS_COMMAND,
    synthesisInputPath: options.synthesisInputPath,
    anthropicModel: options.anthropicModel ?? process.env.SPINE_ANTHROPIC_MODEL
  });

  if (options.diffAgainst) {
    const existingPath = path.resolve(process.cwd(), options.diffAgainst);
    const existingContent = await readFile(existingPath, "utf8");
    const newContent = renderOnboardingMarkdown(result, synthesis);

    process.stdout.write(`Comparing current analysis against ${existingPath}:\n\n`);

    // Extract and compare spine files
    const extractSpineFiles = (content: string): string[] => {
      const lines = content.split("\n");
      const legendStart = lines.findIndex(line => line.includes("Legend:"));
      if (legendStart === -1) return [];

      const files: string[] = [];
      for (let i = legendStart + 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === "" || line.startsWith("##")) break;
        const match = line.match(/- `([^`]+)` = `([^`]+)`/);
        if (match) {
          files.push(match[2]); // Use the actual file path
        }
      }

      return files.sort();
    };

    const oldSpineFiles = extractSpineFiles(existingContent);
    const newSpineFiles = extractSpineFiles(newContent);

    const added = newSpineFiles.filter(f => !oldSpineFiles.includes(f));
    const removed = oldSpineFiles.filter(f => !newSpineFiles.includes(f));

    if (added.length > 0) {
      process.stdout.write("New spine files:\n");
      for (const file of added) {
        process.stdout.write(`  + ${file}\n`);
      }
      process.stdout.write("\n");
    }

    if (removed.length > 0) {
      process.stdout.write("Removed spine files:\n");
      for (const file of removed) {
        process.stdout.write(`  - ${file}\n`);
      }
      process.stdout.write("\n");
    }

    if (added.length === 0 && removed.length === 0) {
      process.stdout.write("Spine files unchanged.\n");
    }

    return;
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ ...result, synthesis }, null, 2)}\n`);
    return;
  }

  const outPath = options.outPath
    ? path.resolve(process.cwd(), options.outPath)
    : path.join(rootPath, "ONBOARDING.md");
  const markdown = renderOnboardingMarkdown(result, synthesis);

  await writeFile(outPath, markdown, "utf8");

  process.stdout.write(`Detected ${result.detection.shape} in ${result.detection.languages.join(", ")}.\n`);
  process.stdout.write(`Found ${result.entryPoints.length} entry point(s).\n`);
  process.stdout.write(`Synthesis source: ${synthesis.source}.\n`);
  process.stdout.write(`Wrote ${outPath}\n`);

  const costModelKey = resolveCostModel(options.costModel);
  const inputTokens = estimateTokens(synthesis.prompt);
  const outputTokens = estimateOutputTokens(inputTokens);
  const costEstimate = formatCostEstimate(costModelKey, inputTokens, outputTokens);
  const actualCost = synthesis.actualCost;
  const costForValue = actualCost ? actualCost.totalCost : costEstimate.totalCost;

  if (actualCost) {
    process.stdout.write(
      `Actual usage: input=${actualCost.inputTokens} cache_create=${actualCost.cacheCreationInputTokens} cache_read=${actualCost.cacheReadInputTokens} output=${actualCost.outputTokens} cost=$${actualCost.totalCost.toFixed(4)} (${actualCost.model})\n`
    );

    const logPath = path.join(rootPath, ".spine-cost.log");
    const logLine = `[${new Date().toISOString()}] model=${actualCost.model} input=${actualCost.inputTokens} cache_create=${actualCost.cacheCreationInputTokens} cache_read=${actualCost.cacheReadInputTokens} output=${actualCost.outputTokens} cost=$${actualCost.totalCost.toFixed(4)} repo=${result.detection.repoName}\n`;
    await appendFile(logPath, logLine, "utf8");
    process.stdout.write(`Appended cost to ${logPath}\n`);
  } else {
    process.stdout.write(
      `Estimated cost: ~$${costEstimate.inputCost.toFixed(3)} input + ~$${costEstimate.outputCost.toFixed(3)} output = ~$${costEstimate.totalCost.toFixed(3)} (${costEstimate.modelLabel})\n`
    );
  }

  const spineLineCount = await countSpineLines(rootPath, result.spine.nodes);
  const subsystemFileCount = countSubsystemFiles(result.subsystems);
  process.stdout.write(
    `${formatValueStatement(
      result.spine.nodes.length,
      spineLineCount,
      result.subsystems.length,
      subsystemFileCount,
      costForValue
    )}\n`
  );

  if (!options.noContextFile) {
    const contextWrite = await writeRepoContextFile(rootPath, result, synthesis, {
      outPath: options.contextFilePath
        ? path.resolve(process.cwd(), options.contextFilePath)
        : undefined
    });
    process.stdout.write(`Wrote ${contextWrite.path} (hash ${contextWrite.contentHash})\n`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
