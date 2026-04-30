import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

import type {
  AnalysisResult,
  ReadingOrderItem,
  SubsystemSummary,
  TourSynthesis
} from "../types.js";
import { pathExists, readTextIfExists } from "./repository.js";

export interface SynthesisOptions {
  promptOutPath?: string;
  synthesisCommand?: string;
}

export interface SynthesisExecutor {
  execute(prompt: string): Promise<string>;
}

interface SynthesisPayload {
  detection: AnalysisResult["detection"];
  entryPoints: AnalysisResult["entryPoints"];
  spine: AnalysisResult["spine"];
  diagram: AnalysisResult["diagram"];
  subsystems: AnalysisResult["subsystems"];
  readme: string | null;
  keyConfigs: Array<{ path: string; content: string }>;
  spineSignatures: Array<{ path: string; signatures: string[] }>;
}

interface LlmResponseShape {
  tlDr: string;
  mentalModel: string;
  readingOrder: ReadingOrderItem[];
  subsystems: SubsystemSummary[];
  gotchas: string[];
  estimatedReadTime: {
    spineMinutes: number;
    fullCoverageHours: number;
  };
}

const SIGNATURE_PATTERNS = [
  /^\s*export\s+(?:async\s+)?(?:function|class|const|type|interface)\s+.+$/m,
  /^\s*(?:async\s+)?function\s+.+$/m,
  /^\s*def\s+.+$/m,
  /^\s*class\s+.+$/m,
  /^\s*pub\s+(?:mod|fn|struct|enum|trait)\s+.+$/m,
  /^\s*func\s+.+$/m
];

function pickSignatures(source: string, maxItems = 5): string[] {
  const lines = source.split(/\r?\n/);
  const signatures: string[] = [];

  for (const line of lines) {
    if (SIGNATURE_PATTERNS.some((pattern) => pattern.test(line))) {
      signatures.push(line.trim());
      if (signatures.length >= maxItems) {
        break;
      }
    }
  }

  return signatures;
}

interface SynthesisContext {
  payload: SynthesisPayload;
  spineLineCount: number;
}

function countNonBlankLines(source: string): number {
  let count = 0;
  for (const line of source.split(/\r?\n/)) {
    if (line.trim().length > 0) {
      count += 1;
    }
  }
  return count;
}

async function loadSynthesisContext(rootPath: string, analysis: AnalysisResult): Promise<SynthesisContext> {
  const readme = await readTextIfExists(path.join(rootPath, "README.md"));
  const keyConfigCandidates = [
    "package.json",
    "pyproject.toml",
    "Cargo.toml",
    "go.mod",
    "tsconfig.json"
  ];
  const keyConfigs: Array<{ path: string; content: string }> = [];

  for (const candidate of keyConfigCandidates) {
    const absolutePath = path.join(rootPath, candidate);
    if (await pathExists(absolutePath)) {
      const content = await readFile(absolutePath, "utf8");
      keyConfigs.push({
        path: candidate,
        content: content.slice(0, 2000)
      });
    }
  }

  const spineSignatures = [];
  let spineLineCount = 0;
  for (const filePath of analysis.spine.nodes) {
    const absolutePath = path.join(rootPath, filePath);
    if (!(await pathExists(absolutePath))) {
      continue;
    }

    const source = await readFile(absolutePath, "utf8");
    spineLineCount += countNonBlankLines(source);
    spineSignatures.push({
      path: filePath,
      signatures: pickSignatures(source)
    });
  }

  return {
    payload: {
      detection: analysis.detection,
      entryPoints: analysis.entryPoints,
      spine: analysis.spine,
      diagram: analysis.diagram,
      subsystems: analysis.subsystems,
      readme: readme ? readme.slice(0, 3000) : null,
      keyConfigs,
      spineSignatures
    },
    spineLineCount
  };
}

export function buildSynthesisPrompt(payload: SynthesisPayload): string {
  return [
    "You are synthesizing an onboarding tour for a codebase.",
    "",
    "Non-negotiable rules:",
    "- Use only the structured context below.",
    "- Do not invent files, subsystems, or architecture edges.",
    "- The diagram is already verified; do not alter or extend it.",
    "- Reading order items must use only listed repo files.",
    "- Subsystem entry points must use only listed repo files or null.",
    "- Return JSON only with keys: tlDr, mentalModel, readingOrder, subsystems, gotchas, estimatedReadTime.",
    "",
    "Expected JSON shape:",
    '{"tlDr":"...","mentalModel":"...","readingOrder":[{"path":"...","why":"..."}],"subsystems":[{"label":"...","whatItDoes":"...","whereItLives":"...","entryPoint":"...","skipUnless":"..."}],"gotchas":["..."],"estimatedReadTime":{"spineMinutes":30,"fullCoverageHours":2}}',
    "",
    "Structured context:",
    JSON.stringify(payload, null, 2)
  ].join("\n");
}

function renderDeterministicTlDr(analysis: AnalysisResult): string {
  const spineLead = analysis.spine.nodes.slice(0, 3).map((node) => `\`${node}\``).join(", ");
  return [
    `This repository is a ${analysis.detection.shape} built primarily in ${analysis.detection.languages.join(", ")}.`,
    spineLead ? `The verified spine currently runs through ${spineLead}.` : "The verified spine is still shallow for this codebase shape.",
    analysis.diagram
      ? "The architecture diagram is derived from verified static-analysis edges only."
      : "Architecture edges are still constrained to the verified relationships we could prove statically."
  ].join(" ");
}

function renderDeterministicMentalModel(analysis: AnalysisResult): string {
  const shape = analysis.detection.shape;
  if (shape === "cli") {
    return "Treat the command surface as the product: startup, argument flow, and the first handoff into core logic explain most of the system.";
  }
  if (shape === "library") {
    return "Start from the exported surface and work inward; the stable public entry points are the fastest way to orient.";
  }
  if (shape === "monorepo") {
    return "Work package-first, not file-first: find the owning workspace, then follow the verified spine inside that slice.";
  }
  return "Follow the first verified handoff from the entry point into the main runtime path, then branch into subsystems only after that spine makes sense.";
}

function buildDeterministicReadingOrder(analysis: AnalysisResult): ReadingOrderItem[] {
  return analysis.suggestedReadingOrder.slice(0, 12).map((filePath, index) => {
    let why = "Defines a key project contract or context file.";
    if (analysis.entryPoints.some((entryPoint) => entryPoint.path === filePath)) {
      why = "This is a detected entry point, so it shows how execution begins.";
    } else if (analysis.spine.nodes.includes(filePath)) {
      why = "This file sits on the verified architecture spine and explains the main runtime handoff.";
    } else if (index < 3) {
      why = "This file grounds the earliest high-signal part of the codebase.";
    }

    return { path: filePath, why };
  });
}

function buildDeterministicSubsystems(analysis: AnalysisResult): SubsystemSummary[] {
  return analysis.subsystems.slice(0, 8).map((cluster) => ({
    label: cluster.label,
    whatItDoes: cluster.whatItDoes,
    whereItLives: cluster.pathGlob,
    entryPoint: cluster.entryPoint,
    skipUnless: cluster.skipUnless
  }));
}

function estimateReadTime(
  analysis: AnalysisResult,
  spineLineCount: number
): TourSynthesis["estimatedReadTime"] {
  const subsystemFileCount = analysis.subsystems.reduce(
    (sum, cluster) => sum + cluster.files.length,
    0
  );
  const spineMinutes = Math.max(10, Math.ceil(spineLineCount / 80));
  const fullCoverageMinutes = spineMinutes + Math.round(subsystemFileCount * 0.2);
  const fullCoverageHours = Math.max(1, Number((fullCoverageMinutes / 60).toFixed(1)));

  return {
    spineMinutes,
    fullCoverageHours
  };
}

function buildDeterministicGotchas(analysis: AnalysisResult): string[] {
  const gotchas = [...analysis.detection.reasons];
  if (analysis.diagram) {
    gotchas.push("The architecture diagram is intentionally incomplete where static analysis could not verify an edge.");
  }
  if (analysis.subsystems.length === 0) {
    gotchas.push("Subsystem clustering is still sparse, which usually means the repo is small or highly centralized.");
  }

  return [...new Set(gotchas)].slice(0, 8);
}

function buildDeterministicSynthesis(
  prompt: string,
  analysis: AnalysisResult,
  spineLineCount: number
): TourSynthesis {
  return {
    source: "deterministic",
    prompt,
    tlDr: renderDeterministicTlDr(analysis),
    mentalModel: renderDeterministicMentalModel(analysis),
    readingOrder: buildDeterministicReadingOrder(analysis),
    subsystems: buildDeterministicSubsystems(analysis),
    gotchas: buildDeterministicGotchas(analysis),
    estimatedReadTime: estimateReadTime(analysis, spineLineCount)
  };
}

function isValidReadingOrderItem(value: unknown, allowedPaths: Set<string>): value is ReadingOrderItem {
  return Boolean(
    value &&
      typeof value === "object" &&
      "path" in value &&
      "why" in value &&
      typeof value.path === "string" &&
      typeof value.why === "string" &&
      allowedPaths.has(value.path)
  );
}

function isValidSubsystemSummary(value: unknown, allowedPaths: Set<string>): value is SubsystemSummary {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return Boolean(
    typeof candidate.label === "string" &&
      typeof candidate.whatItDoes === "string" &&
      typeof candidate.whereItLives === "string" &&
      (candidate.entryPoint === null ||
        (typeof candidate.entryPoint === "string" && allowedPaths.has(candidate.entryPoint))) &&
      typeof candidate.skipUnless === "string"
  );
}

function validateLlmResponse(parsed: unknown, analysis: AnalysisResult, prompt: string): TourSynthesis | null {
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const allowedPaths = new Set<string>([
    ...analysis.suggestedReadingOrder,
    ...analysis.subsystems.flatMap((cluster) => cluster.files),
    ...analysis.spine.nodes,
    ...analysis.entryPoints.map((entryPoint) => entryPoint.path)
  ]);
  const candidate = parsed as Partial<LlmResponseShape>;

  if (
    typeof candidate.tlDr !== "string" ||
    typeof candidate.mentalModel !== "string" ||
    !Array.isArray(candidate.readingOrder) ||
    !candidate.readingOrder.every((item) => isValidReadingOrderItem(item, allowedPaths)) ||
    !Array.isArray(candidate.subsystems) ||
    !candidate.subsystems.every((item) => isValidSubsystemSummary(item, allowedPaths)) ||
    !Array.isArray(candidate.gotchas) ||
    !candidate.gotchas.every((item) => typeof item === "string") ||
    !candidate.estimatedReadTime ||
    typeof candidate.estimatedReadTime.spineMinutes !== "number" ||
    typeof candidate.estimatedReadTime.fullCoverageHours !== "number"
  ) {
    return null;
  }

  return {
    source: "llm",
    prompt,
    tlDr: candidate.tlDr,
    mentalModel: candidate.mentalModel,
    readingOrder: candidate.readingOrder,
    subsystems: candidate.subsystems,
    gotchas: candidate.gotchas,
    estimatedReadTime: candidate.estimatedReadTime
  };
}

function createCommandExecutor(command: string): SynthesisExecutor {
  return {
    async execute(prompt: string): Promise<string> {
      return new Promise<string>((resolve, reject) => {
        const child = spawn(command, {
          cwd: process.cwd(),
          shell: true,
          stdio: ["pipe", "pipe", "pipe"]
        });

        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk) => {
          stdout += String(chunk);
        });
        child.stderr.on("data", (chunk) => {
          stderr += String(chunk);
        });
        child.on("exit", (code) => {
          if (code === 0) {
            resolve(stdout.trim());
            return;
          }

          reject(new Error(stderr || `Synthesis command failed with exit code ${code ?? "unknown"}`));
        });
        child.on("error", reject);
        child.stdin.write(prompt);
        child.stdin.end();
      });
    }
  };
}

export async function synthesizeTour(
  rootPath: string,
  analysis: AnalysisResult,
  options: SynthesisOptions = {},
  executor?: SynthesisExecutor
): Promise<TourSynthesis> {
  const { payload, spineLineCount } = await loadSynthesisContext(rootPath, analysis);
  const prompt = buildSynthesisPrompt(payload);

  if (options.promptOutPath) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(options.promptOutPath, prompt, "utf8");
  }

  const effectiveExecutor = executor ?? (options.synthesisCommand ? createCommandExecutor(options.synthesisCommand) : null);
  if (!effectiveExecutor) {
    return buildDeterministicSynthesis(prompt, analysis, spineLineCount);
  }

  try {
    const raw = await effectiveExecutor.execute(prompt);
    const parsed = JSON.parse(raw);
    const validated = validateLlmResponse(parsed, analysis, prompt);
    if (validated) {
      return validated;
    }
  } catch {
    // Fall back to deterministic synthesis below.
  }

  return buildDeterministicSynthesis(prompt, analysis, spineLineCount);
}

