import path from "node:path";
import { describe, expect, it } from "vitest";

import { analyzeRepository } from "../src/core/analyze.js";
import { extractVerifiedSpine } from "../src/core/spine.js";
import { findEntryPoints } from "../src/core/entries.js";

const fixturesRoot = path.resolve(import.meta.dirname, "fixtures");

describe("extractVerifiedSpine", () => {
  it("builds a verified import-only spine for a TypeScript repo", async () => {
    const rootPath = path.join(fixturesRoot, "spine-ts");
    const entryPoints = await findEntryPoints(rootPath);
    const spine = await extractVerifiedSpine(rootPath, entryPoints);

    expect(spine.entrySeeds).toEqual(["src/cli.ts", "src/index.ts"]);
    expect(spine.nodes).toEqual([
      "src/cli.ts",
      "src/index.ts",
      "src/services/user-service.ts",
      "src/core/router.ts",
      "src/handlers/user-handler.ts"
    ]);
    expect(spine.edges).toEqual([
      { from: "src/cli.ts", to: "src/core/router.ts", kind: "import" },
      { from: "src/core/router.ts", to: "src/handlers/user-handler.ts", kind: "import" },
      { from: "src/handlers/user-handler.ts", to: "src/services/user-service.ts", kind: "import" },
      { from: "src/index.ts", to: "src/services/user-service.ts", kind: "import" }
    ]);
  });

  it("threads spine nodes into the reading order", async () => {
    const result = await analyzeRepository(path.join(fixturesRoot, "spine-ts"));

    expect(result.suggestedReadingOrder.slice(0, 5)).toEqual([
      "src/cli.ts",
      "src/index.ts",
      "src/services/user-service.ts",
      "src/core/router.ts",
      "src/handlers/user-handler.ts"
    ]);
  });
});
