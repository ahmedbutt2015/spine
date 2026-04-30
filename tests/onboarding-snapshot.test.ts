import path from "node:path";
import { describe, expect, it } from "vitest";

import { analyzeRepository } from "../src/core/analyze.js";
import { synthesizeTour } from "../src/core/synthesis.js";
import { renderOnboardingMarkdown } from "../src/formatters/onboarding.js";

const fixturesRoot = path.resolve(import.meta.dirname, "fixtures");

const snapshotFixtures = [
  "spine-ts",
  "spine-ts-paths",
  "spine-python",
  "spine-rust",
  "spine-go",
  "spine-go-multi",
  "spine-go-library"
];

describe("ONBOARDING.md snapshot", () => {
  for (const fixture of snapshotFixtures) {
    it(`renders a stable deterministic tour for ${fixture}`, async () => {
      const rootPath = path.join(fixturesRoot, fixture);
      const result = await analyzeRepository(rootPath);
      const synthesis = await synthesizeTour(rootPath, result);
      const markdown = renderOnboardingMarkdown(result, synthesis);

      expect(markdown).toMatchSnapshot();
    });
  }
});
