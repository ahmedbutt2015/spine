import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { analyzeRepository } from "../src/core/analyze.js";
import { extractVerifiedSpine } from "../src/core/spine.js";
import { findEntryPoints } from "../src/core/entries.js";
import type { VerifiedEdge } from "../src/types.js";

const fixturesRoot = path.resolve(import.meta.dirname, "fixtures");

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function verifyEdgeBackedBySource(rootPath: string, edge: VerifiedEdge): Promise<boolean> {
  const source = await readFile(path.join(rootPath, edge.from), "utf8");
  const filename = path.posix.basename(edge.to);
  const extension = path.posix.extname(edge.to);

  if ([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"].includes(extension)) {
    const baseName = filename.replace(/\.[^.]+$/, "");
    const importable = baseName === "index" ? path.posix.basename(path.posix.dirname(edge.to)) : baseName;
    return new RegExp(`["'][^"']*\\b${escapeRegex(importable)}\\b[^"']*["']`).test(source);
  }

  if (extension === ".py") {
    const importable =
      filename === "__init__.py" ? path.posix.basename(path.posix.dirname(edge.to)) : filename.replace(/\.py$/, "");
    return new RegExp(`(?:from|import)\\s+[\\w\\.]*${escapeRegex(importable)}\\b`).test(source);
  }

  if (extension === ".rs") {
    const modName =
      filename === "mod.rs" ? path.posix.basename(path.posix.dirname(edge.to)) : filename.replace(/\.rs$/, "");
    return new RegExp(`\\bmod\\s+${escapeRegex(modName)}\\s*;`).test(source);
  }

  if (extension === ".go") {
    const directory = path.posix.dirname(edge.to);
    const importableSegment = directory === "." ? filename.replace(/\.go$/, "") : path.posix.basename(directory);
    return new RegExp(`["'][^"']*\\b${escapeRegex(importableSegment)}["']`).test(source);
  }

  return false;
}

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

  it("resolves TypeScript imports through tsconfig path aliases", async () => {
    const rootPath = path.join(fixturesRoot, "spine-ts-paths");
    const entryPoints = await findEntryPoints(rootPath);
    const spine = await extractVerifiedSpine(rootPath, entryPoints);

    expect(spine.entrySeeds).toEqual(["src/index.ts"]);
    expect(spine.nodes).toEqual([
      "src/index.ts",
      "src/services/user-service.ts",
      "src/utils/index.ts"
    ]);
    expect(spine.edges).toEqual([
      { from: "src/index.ts", to: "src/services/user-service.ts", kind: "import" },
      { from: "src/index.ts", to: "src/utils/index.ts", kind: "import" },
      { from: "src/services/user-service.ts", to: "src/utils/index.ts", kind: "import" }
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

  it("seeds a Go library spine from the canonical root file when no main.go exists", async () => {
    const rootPath = path.join(fixturesRoot, "spine-go-library");
    const entryPoints = await findEntryPoints(rootPath);
    const spine = await extractVerifiedSpine(rootPath, entryPoints);

    expect(entryPoints.map((entryPoint) => entryPoint.path)).toEqual(["lib.go"]);
    expect(entryPoints[0].kind).toBe("library");
    expect(entryPoints[0].reason).toBe("Go package root (no main.go).");

    expect(spine.supportedLanguages).toEqual(["go"]);
    expect(spine.entrySeeds).toEqual(["lib.go"]);
    expect(spine.nodes).toEqual([
      "lib.go",
      "internal/parser/parser.go",
      "internal/transport/transport.go"
    ]);
    expect(spine.edges).toEqual([
      { from: "lib.go", to: "internal/parser/parser.go", kind: "import" },
      { from: "lib.go", to: "internal/transport/transport.go", kind: "import" }
    ]);
  });

  it("seeds spine from each Rust workspace member's lib.rs or main.rs", async () => {
    const rootPath = path.join(fixturesRoot, "spine-rust-workspace");
    const entryPoints = await findEntryPoints(rootPath);
    const spine = await extractVerifiedSpine(rootPath, entryPoints);

    expect(entryPoints.map((entryPoint) => entryPoint.path)).toEqual([
      "cli/src/main.rs",
      "core/src/lib.rs"
    ]);
    expect(entryPoints.map((entryPoint) => entryPoint.reason)).toEqual([
      "Rust workspace member: cli.",
      "Rust workspace member: core."
    ]);

    expect(spine.supportedLanguages).toEqual(["rust"]);
    expect(spine.entrySeeds).toEqual(["cli/src/main.rs", "core/src/lib.rs"]);
    expect(spine.nodes).toEqual([
      "cli/src/main.rs",
      "core/src/lib.rs",
      "cli/src/commands.rs",
      "core/src/parser.rs",
      "core/src/types.rs"
    ]);
    expect(spine.edges).toEqual([
      { from: "cli/src/main.rs", to: "cli/src/commands.rs", kind: "import" },
      { from: "core/src/lib.rs", to: "core/src/parser.rs", kind: "import" },
      { from: "core/src/lib.rs", to: "core/src/types.rs", kind: "import" }
    ]);
  });

  it("traces both binaries in a multi-binary Go module", async () => {
    const rootPath = path.join(fixturesRoot, "spine-go-multi");
    const entryPoints = await findEntryPoints(rootPath);
    const spine = await extractVerifiedSpine(rootPath, entryPoints);

    expect(spine.supportedLanguages).toEqual(["go"]);
    expect(spine.entrySeeds).toEqual(["cmd/api/main.go", "cmd/worker/main.go"]);
    expect(spine.nodes).toEqual([
      "cmd/api/main.go",
      "cmd/worker/main.go",
      "internal/store/store.go",
      "internal/jobs/jobs.go",
      "internal/server/server.go"
    ]);
    expect(spine.edges).toEqual([
      { from: "cmd/api/main.go", to: "internal/server/server.go", kind: "import" },
      { from: "cmd/worker/main.go", to: "internal/jobs/jobs.go", kind: "import" },
      { from: "internal/jobs/jobs.go", to: "internal/store/store.go", kind: "import" },
      { from: "internal/server/server.go", to: "internal/store/store.go", kind: "import" }
    ]);
  });

  it("retains only edges that can be traced back to a real source-level import", async () => {
    const fixtures = [
      "spine-ts",
      "spine-ts-paths",
      "spine-python",
      "spine-python-src",
      "spine-rust",
      "spine-rust-workspace",
      "spine-go",
      "spine-go-multi",
      "spine-go-library"
    ];

    for (const fixture of fixtures) {
      const rootPath = path.join(fixturesRoot, fixture);
      const entryPoints = await findEntryPoints(rootPath);
      const spine = await extractVerifiedSpine(rootPath, entryPoints);

      expect(spine.edges.length, `${fixture} should produce at least one verified edge`).toBeGreaterThan(0);

      for (const edge of spine.edges) {
        const verified = await verifyEdgeBackedBySource(rootPath, edge);
        expect(
          verified,
          `${fixture}: ${edge.from} -> ${edge.to} should be backed by a real import statement`
        ).toBe(true);
      }
    }
  });
});
