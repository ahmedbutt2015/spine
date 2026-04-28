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

  it("builds a verified module spine for a Rust crate", async () => {
    const rootPath = path.join(fixturesRoot, "spine-rust");
    const entryPoints = await findEntryPoints(rootPath);
    const spine = await extractVerifiedSpine(rootPath, entryPoints);

    expect(spine.supportedLanguages).toEqual(["rust"]);
    expect(spine.entrySeeds).toEqual(["src/lib.rs"]);
    expect(spine.nodes).toEqual([
      "src/lib.rs",
      "src/config.rs",
      "src/routes/mod.rs",
      "src/services/mod.rs",
      "src/services/user_service.rs"
    ]);
    expect(spine.edges).toEqual([
      { from: "src/lib.rs", to: "src/config.rs", kind: "import" },
      { from: "src/lib.rs", to: "src/routes/mod.rs", kind: "import" },
      { from: "src/lib.rs", to: "src/services/mod.rs", kind: "import" },
      { from: "src/services/mod.rs", to: "src/services/user_service.rs", kind: "import" }
    ]);
  });

  it("builds a verified import-only spine for a Go repo", async () => {
    const rootPath = path.join(fixturesRoot, "spine-go");
    const entryPoints = await findEntryPoints(rootPath);
    const spine = await extractVerifiedSpine(rootPath, entryPoints);

    expect(spine.supportedLanguages).toEqual(["go"]);
    expect(spine.entrySeeds).toEqual(["main.go"]);
    expect(spine.nodes).toEqual([
      "main.go",
      "config/config.go",
      "routes/routes.go",
      "service/service.go",
      "store/store.go"
    ]);
    expect(spine.edges).toEqual([
      { from: "main.go", to: "config/config.go", kind: "import" },
      { from: "main.go", to: "routes/routes.go", kind: "import" },
      { from: "routes/routes.go", to: "service/service.go", kind: "import" },
      { from: "service/service.go", to: "store/store.go", kind: "import" }
    ]);
  });
});
