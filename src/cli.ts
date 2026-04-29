#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import path from "node:path";

import { analyzeRepository } from "./core/analyze.js";
import { synthesizeTour } from "./core/synthesis.js";
import { renderOnboardingMarkdown } from "./formatters/onboarding.js";

interface CliOptions {
  targetPath: string;
  json: boolean;
  outPath?: string;
  promptOutPath?: string;
  synthesisCommand?: string;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    targetPath: ".",
    json: false
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

    if (!token.startsWith("-")) {
      options.targetPath = token;
    }
  }

  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const rootPath = path.resolve(process.cwd(), options.targetPath);
  const result = await analyzeRepository(rootPath);
  const synthesis = await synthesizeTour(rootPath, result, {
    promptOutPath: options.promptOutPath,
    synthesisCommand: options.synthesisCommand ?? process.env.SPINE_SYNTHESIS_COMMAND
  });

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
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
