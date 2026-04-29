import path from "node:path";

import { describe, expect, it } from "vitest";

import { analyzeRepository } from "../src/core/analyze.js";
import { buildSynthesisPrompt, synthesizeTour } from "../src/core/synthesis.js";

const fixturesRoot = path.resolve(import.meta.dirname, "fixtures");

describe("subsystem clustering and synthesis", () => {
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
});

