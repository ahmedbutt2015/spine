import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { benchmarkCatalog } from "./catalog.js";

const reposDirectory = path.resolve(process.cwd(), "benchmarks", "repos");

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

function printUsage(): void {
  process.stdout.write("Usage:\n");
  process.stdout.write("  npm run benchmark:list\n");
  process.stdout.write("  npm run benchmark:clone -- <name> [name...]\n");
}

function listBenchmarks(): void {
  for (const repo of benchmarkCatalog) {
    process.stdout.write(`${repo.name} [${repo.language}/${repo.size}] - ${repo.description}\n`);
  }
}

async function cloneRepository(name: string): Promise<void> {
  const repo = benchmarkCatalog.find((candidate) => candidate.name === name);
  if (!repo) {
    throw new Error(`Unknown benchmark repo: ${name}`);
  }

  await mkdir(reposDirectory, { recursive: true });
  const destination = path.join(reposDirectory, repo.name);

  if (await pathExists(destination)) {
    process.stdout.write(`Skipping ${repo.name}; already exists at ${destination}\n`);
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "git",
      ["clone", "--depth", "1", repo.gitUrl, destination],
      {
        cwd: process.cwd(),
        stdio: "inherit"
      }
    );

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`git clone failed for ${repo.name} with exit code ${code ?? "unknown"}`));
    });
    child.on("error", reject);
  });
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  if (command === "list") {
    listBenchmarks();
    return;
  }

  if (command === "clone") {
    if (args.length === 0) {
      throw new Error("Provide at least one benchmark name to clone.");
    }

    for (const name of args) {
      await cloneRepository(name);
    }
    return;
  }

  printUsage();
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
