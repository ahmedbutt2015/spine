import path from "node:path";
import { describe, expect, it } from "vitest";

import { analyzeRepository } from "../src/core/analyze.js";

const fixturesRoot = path.resolve(import.meta.dirname, "fixtures");

describe("analyzeRepository", () => {
  it("detects a TypeScript app", async () => {
    const result = await analyzeRepository(path.join(fixturesRoot, "js-app"));

    expect(result.detection.shape).toBe("app");
    expect(result.detection.languages[0]).toBe("typescript");
    expect(result.detection.languages).not.toContain("python");
    expect(result.entryPoints.map((entryPoint) => entryPoint.path)).toEqual([
      "src/main.ts",
      "src/server.ts"
    ]);
  });

  it("detects a Python app", async () => {
    const result = await analyzeRepository(path.join(fixturesRoot, "python-app"));

    expect(result.detection.languages).toContain("python");
    expect(result.entryPoints.map((entryPoint) => entryPoint.path)).toContain("manage.py");
  });

  it("detects a Go CLI", async () => {
    const result = await analyzeRepository(path.join(fixturesRoot, "go-cli"));

    expect(result.detection.shape).toBe("app");
    expect(result.entryPoints.map((entryPoint) => entryPoint.path)).toContain("cmd/api/main.go");
  });

  it("detects a Rust library and binary", async () => {
    const result = await analyzeRepository(path.join(fixturesRoot, "rust-lib"));

    expect(result.detection.languages).toContain("rust");
    expect(result.entryPoints.map((entryPoint) => entryPoint.path)).toEqual([
      "src/lib.rs",
      "src/main.rs"
    ]);
  });

  it("detects a workspace monorepo", async () => {
    const result = await analyzeRepository(path.join(fixturesRoot, "monorepo-js"));

    expect(result.detection.shape).toBe("monorepo");
    expect(result.detection.manifests).toContain("package.json");
  });

  it("resolves declared bin entries back to source when possible", async () => {
    const result = await analyzeRepository(path.join(fixturesRoot, "cli-ts"));

    expect(result.detection.shape).toBe("cli");
    expect(result.entryPoints.map((entryPoint) => entryPoint.path)).toContain("src/cli.ts");
  });
});
