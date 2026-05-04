import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCli } from "../src/cli.js";

async function captureCliOutput(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  let stdout = "";
  let stderr = "";

  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += String(chunk);
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr += String(chunk);
    return true;
  }) as typeof process.stderr.write;

  try {
    await runCli(args);
  } finally {
    process.stdout.write = originalStdoutWrite as typeof process.stdout.write;
    process.stderr.write = originalStderrWrite as typeof process.stderr.write;
  }

  return { stdout, stderr };
}

async function runCliQuietly(args: string[]): Promise<void> {
  await captureCliOutput(args);
}

describe("cli safety", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await mkdtemp(path.join(tmpdir(), "spine-cli-"));
    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(tempDir, { recursive: true, force: true });
  });

  it("--help prints usage without scanning or writing files", async () => {
    await runCliQuietly(["--help"]);

    await expect(readFile(path.join(tempDir, "ONBOARDING.md"), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(tempDir, ".claude", "REPO_CONTEXT.md"), "utf8")).rejects.toThrow();
  });

  it("--dry-run avoids writing onboarding and context files", async () => {
    await mkdir(path.join(tempDir, "src"), { recursive: true });
    await writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "cli-dry-run", main: "src/index.ts" }, null, 2),
      "utf8"
    );
    await writeFile(path.join(tempDir, "src", "index.ts"), "export const ready = true;\n", "utf8");

    await runCliQuietly([".", "--dry-run", "--write-context-file"]);

    await expect(readFile(path.join(tempDir, "ONBOARDING.md"), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(tempDir, ".claude", "REPO_CONTEXT.md"), "utf8")).rejects.toThrow();
  });

  it("prints a coverage hint when no verified entry points are found", async () => {
    await writeFile(path.join(tempDir, "README.md"), "# scratch\n", "utf8");

    const { stdout } = await captureCliOutput([".", "--dry-run"]);

    expect(stdout).toContain("Coverage is limited: no verified entry points were found");
  });
});
