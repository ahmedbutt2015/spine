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

  it("builds a verified import-only spine for a Python repo", async () => {
    const rootPath = path.join(fixturesRoot, "spine-python");
    const entryPoints = await findEntryPoints(rootPath);
    const spine = await extractVerifiedSpine(rootPath, entryPoints);

    expect(spine.supportedLanguages).toEqual(["python"]);
    expect(spine.entrySeeds).toEqual(["manage.py"]);
    expect(spine.nodes).toEqual([
      "manage.py",
      "app/main.py",
      "app/config.py",
      "app/routes.py",
      "app/services/user_service.py"
    ]);
    expect(spine.edges).toEqual([
      { from: "app/main.py", to: "app/config.py", kind: "import" },
      { from: "app/main.py", to: "app/routes.py", kind: "import" },
      { from: "app/main.py", to: "app/services/user_service.py", kind: "import" },
      { from: "app/routes.py", to: "app/services/user_service.py", kind: "import" },
      { from: "manage.py", to: "app/main.py", kind: "import" }
    ]);
  });

  it("resolves Python src-layout imports into verified edges", async () => {
    const rootPath = path.join(fixturesRoot, "spine-python-src");
    const entryPoints = await findEntryPoints(rootPath);
    const spine = await extractVerifiedSpine(rootPath, entryPoints);

    expect(spine.supportedLanguages).toEqual(["python"]);
    expect(spine.entrySeeds).toEqual(["src/tool/__main__.py"]);
    expect(spine.nodes).toEqual([
      "src/tool/__main__.py",
      "src/tool/cli.py",
      "src/tool/config.py"
    ]);
    expect(spine.edges).toEqual([
      { from: "src/tool/__main__.py", to: "src/tool/cli.py", kind: "import" },
      { from: "src/tool/cli.py", to: "src/tool/config.py", kind: "import" }
    ]);
  });
});
