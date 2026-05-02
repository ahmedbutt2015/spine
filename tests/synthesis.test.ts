import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { analyzeRepository } from "../src/core/analyze.js";
import { buildSynthesisPrompt, synthesizeTour } from "../src/core/synthesis.js";
import type { CostModelKey } from "../src/core/cost.js";

const fixturesRoot = path.resolve(import.meta.dirname, "fixtures");

describe("subsystem clustering and synthesis", () => {
  it("keeps HTML pages and components in clusters but drops font assets", async () => {
    const result = await analyzeRepository(path.join(fixturesRoot, "html-frontend"));
    const clusterFiles = result.subsystems.flatMap((cluster) => cluster.files);

    expect(clusterFiles).toContain("public/index.html");
    expect(clusterFiles).toContain("public/about.html");
    expect(clusterFiles).toContain("src/components/Header.html");
    expect(clusterFiles).toContain("src/components/Footer.html");
    expect(clusterFiles.some((file) => file.endsWith(".woff2"))).toBe(false);

    const publicCluster = result.subsystems.find((cluster) => cluster.key === "public");
    expect(publicCluster?.entryPoint).toBe("public/index.html");
  });

  it("clusters non-spine files into subsystem summaries", async () => {
    const result = await analyzeRepository(path.join(fixturesRoot, "spine-ts"));

    expect(result.subsystems.map((cluster) => cluster.label)).toEqual([
      "Auth",
      "Config",
      "Docs",
      "Utils"
    ]);
    expect(result.subsystems.map((cluster) => cluster.entryPoint)).toEqual([
      "src/auth/session.ts",
      "src/config/env.ts",
      "docs/usage.md",
      "src/utils/logger.ts"
    ]);
  });

  it("builds a verified-data-only synthesis prompt", async () => {
    const result = await analyzeRepository(path.join(fixturesRoot, "spine-go"));
    const synthesis = await synthesizeTour(path.join(fixturesRoot, "spine-go"), result);

    expect(buildSynthesisPrompt).toBeTypeOf("function");
    expect(synthesis.prompt).toContain("Do not invent files, subsystems, or architecture edges.");
    expect(synthesis.prompt).toContain('"from": "main.go"');
    expect(synthesis.prompt).toContain('"to": "routes/routes.go"');
  });

  it("accepts validated LLM output and rejects invalid file references", async () => {
    const result = await analyzeRepository(path.join(fixturesRoot, "spine-go"));

    const valid = await synthesizeTour(
      path.join(fixturesRoot, "spine-go"),
      result,
      {},
      {
        execute: async () =>
          JSON.stringify({
            tlDr: "LLM TLDR",
            mentalModel: "LLM mental model",
            readingOrder: [{ path: "main.go", why: "Start here." }],
            subsystems: [
              {
                label: "Data",
                whatItDoes: "Handles storage.",
                whereItLives: "store/**",
                entryPoint: "store/store.go",
                skipUnless: "Skip unless data flow matters."
              }
            ],
            gotchas: ["LLM gotcha"],
            estimatedReadTime: { spineMinutes: 25, fullCoverageHours: 2 }
          })
      }
    );

    expect(valid.source).toBe("llm");
    expect(valid.tlDr).toBe("LLM TLDR");

    const invalid = await synthesizeTour(
      path.join(fixturesRoot, "spine-go"),
      result,
      {},
      {
        execute: async () =>
          JSON.stringify({
            tlDr: "Bad",
            mentalModel: "Bad",
            readingOrder: [{ path: "invented/file.go", why: "fake" }],
            subsystems: [],
            gotchas: [],
            estimatedReadTime: { spineMinutes: 10, fullCoverageHours: 1 }
          })
      }
    );

    expect(invalid.source).toBe("deterministic");
    expect(invalid.readingOrder[0]?.path).toBe("main.go");
  });

  describe("--synthesis-input file handoff", () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(path.join(tmpdir(), "spine-synth-"));
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it("loads validated synthesis from a file written by an external LLM", async () => {
      const result = await analyzeRepository(path.join(fixturesRoot, "spine-go"));
      const responsePath = path.join(tempDir, "response.json");
      await writeFile(
        responsePath,
        JSON.stringify({
          tlDr: "From file",
          mentalModel: "From file",
          readingOrder: [{ path: "main.go", why: "Start here." }],
          subsystems: [],
          gotchas: ["From file"],
          estimatedReadTime: { spineMinutes: 15, fullCoverageHours: 1 }
        }),
        "utf8"
      );

      const synthesis = await synthesizeTour(
        path.join(fixturesRoot, "spine-go"),
        result,
        { synthesisInputPath: responsePath }
      );

      expect(synthesis.source).toBe("file");
      expect(synthesis.tlDr).toBe("From file");
    });

    it("falls back to deterministic when the file references unknown paths", async () => {
      const result = await analyzeRepository(path.join(fixturesRoot, "spine-go"));
      const responsePath = path.join(tempDir, "response.json");
      await writeFile(
        responsePath,
        JSON.stringify({
          tlDr: "Bad",
          mentalModel: "Bad",
          readingOrder: [{ path: "fake/file.go", why: "invented" }],
          subsystems: [],
          gotchas: [],
          estimatedReadTime: { spineMinutes: 1, fullCoverageHours: 1 }
        }),
        "utf8"
      );

      const synthesis = await synthesizeTour(
        path.join(fixturesRoot, "spine-go"),
        result,
        { synthesisInputPath: responsePath }
      );

      expect(synthesis.source).toBe("deterministic");
    });
  });

  it("attaches actual Anthropic usage when the built-in executor returns usage metadata", async () => {
    const rootPath = path.join(fixturesRoot, "spine-go");
    const result = await analyzeRepository(rootPath);
    const executor = {
      model: "claude-sonnet-4-6" as CostModelKey,
      usage: {
        input_tokens: 1200,
        output_tokens: 400,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0
      },
      execute: async () =>
        JSON.stringify({
          tlDr: "LLM TLDR",
          mentalModel: "LLM mental model",
          readingOrder: [{ path: "main.go", why: "Start here." }],
          subsystems: [
            {
              label: "Data",
              whatItDoes: "Handles storage.",
              whereItLives: "store/**",
              entryPoint: "store/store.go",
              skipUnless: "Skip unless data flow matters."
            }
          ],
          gotchas: ["LLM gotcha"],
          estimatedReadTime: { spineMinutes: 25, fullCoverageHours: 2 }
        })
    };

    const synthesis = await synthesizeTour(rootPath, result, {}, executor);

    expect(synthesis.source).toBe("llm");
    expect(synthesis.actualCost).toEqual({
      model: "claude-sonnet-4-6",
      inputTokens: 1200,
      outputTokens: 400,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      totalCost: expect.any(Number),
      inputCost: expect.any(Number),
      outputCost: expect.any(Number),
      cacheCost: expect.any(Number)
    });
  });
});

