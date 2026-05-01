import path from "node:path";

import type { EntryPoint, SubsystemCluster } from "../types.js";
import { walkRepositoryFiles } from "./repository.js";

const NON_SUBSYSTEM_ROOT_FILES = new Set([
  "README.md",
  "ONBOARDING.md",
  "package.json",
  "package-lock.json",
  "pyproject.toml",
  "Cargo.toml",
  "go.mod",
  "tsconfig.json"
]);

const NON_SUBSYSTEM_EXTENSIONS = new Set([
  ".crt",
  ".csv",
  ".gif",
  ".ico",
  ".jpg",
  ".jpeg",
  ".key",
  ".lock",
  ".pem",
  ".png",
  ".sum",
  ".svg",
  ".webp",
  ".woff",
  ".woff2"
]);

const SOURCE_EXTENSIONS_FOR_CLUSTER_ENTRY = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".rs",
  ".go"
]);

const LABEL_COPY: Record<string, { label: string; whatItDoes: string; skipUnless: string }> = {
  auth: {
    label: "Auth",
    whatItDoes: "Authentication and authorization flow.",
    skipUnless: "Skip unless you are changing login, permissions, or identity handling."
  },
  cli: {
    label: "CLI",
    whatItDoes: "Command wiring and runtime entry behavior.",
    skipUnless: "Skip unless you are changing command UX or startup flow."
  },
  config: {
    label: "Config",
    whatItDoes: "Configuration loading, defaults, and environment handling.",
    skipUnless: "Skip unless configuration, flags, or env wiring matters to your task."
  },
  core: {
    label: "Core",
    whatItDoes: "Core orchestration and shared runtime behavior.",
    skipUnless: "Skip unless you need the central control flow or shared abstractions."
  },
  data: {
    label: "Data",
    whatItDoes: "Data access, persistence, and state interaction.",
    skipUnless: "Skip unless your task touches storage, models, or persistence."
  },
  docs: {
    label: "Docs",
    whatItDoes: "Documentation and non-runtime reference material.",
    skipUnless: "Skip unless you are updating docs or looking for usage guidance."
  },
  handlers: {
    label: "Handlers",
    whatItDoes: "Request or command handling logic near the system edge.",
    skipUnless: "Skip unless you are changing how inputs are handled."
  },
  infra: {
    label: "Infra",
    whatItDoes: "Infrastructure, deployment, or environment-level configuration.",
    skipUnless: "Skip unless you are touching deployment or runtime environment setup."
  },
  routes: {
    label: "Routes",
    whatItDoes: "Routing and endpoint-to-handler wiring.",
    skipUnless: "Skip unless you are changing routing or endpoint mapping."
  },
  services: {
    label: "Services",
    whatItDoes: "Business logic and domain-level operations.",
    skipUnless: "Skip unless your task changes core behavior or domain workflows."
  },
  tests: {
    label: "Tests",
    whatItDoes: "Test coverage and verification logic.",
    skipUnless: "Skip unless you need to understand or extend coverage."
  },
  ui: {
    label: "UI",
    whatItDoes: "User-facing interface rendering and interaction logic.",
    skipUnless: "Skip unless your task changes interface behavior or presentation."
  },
  utils: {
    label: "Utils",
    whatItDoes: "Shared helpers and low-level support functions.",
    skipUnless: "Skip unless you need a reused helper or utility abstraction."
  },
  vendor: {
    label: "Vendor",
    whatItDoes: "Vendored or third-party code mirrored into the repo.",
    skipUnless: "Skip unless you are auditing or updating bundled external code."
  }
};

function inferClusterKey(filePath: string): string {
  const lower = filePath.toLowerCase();
  const segments = lower.split("/");

  if (segments.some((segment) => ["test", "tests", "__tests__"].includes(segment))) return "tests";
  if (segments.some((segment) => ["docs", "doc"].includes(segment))) return "docs";
  if (segments.some((segment) => ["infra", "terraform", "deploy", "deployment"].includes(segment))) return "infra";
  if (segments.some((segment) => ["auth", "oauth"].includes(segment))) return "auth";
  if (segments.some((segment) => ["route", "routes", "router"].includes(segment))) return "routes";
  if (segments.some((segment) => ["handler", "handlers"].includes(segment))) return "handlers";
  if (segments.some((segment) => ["service", "services"].includes(segment))) return "services";
  if (segments.some((segment) => ["config", "configs", "settings"].includes(segment))) return "config";
  if (segments.some((segment) => ["component", "components", "ui", "views", "pages"].includes(segment))) return "ui";
  if (segments.some((segment) => ["db", "database", "store", "stores", "repo", "repos", "model", "models"].includes(segment))) return "data";
  if (segments.some((segment) => ["util", "utils", "helper", "helpers"].includes(segment))) return "utils";
  if (segments.some((segment) => ["bin", "cmd", "command", "commands", "cli"].includes(segment))) return "cli";
  if (segments.some((segment) => ["vendor", "third_party"].includes(segment))) return "vendor";
  if (segments.some((segment) => ["core", "internal"].includes(segment))) return "core";

  if (segments.length > 1 && ["src", "app", "lib"].includes(segments[0])) {
    const candidate = segments[1] ?? "core";
    return candidate.includes(".") ? "core" : candidate;
  }

  if (segments[0] && !segments[0].includes(".")) {
    return segments[0];
  }

  return "core";
}

function inferPathGlob(files: string[]): string {
  if (files.length === 0) {
    return "*";
  }

  const directorySegments = files.map((filePath) => {
    const directory = path.posix.dirname(filePath);
    return directory === "." ? [] : directory.split("/");
  });
  const minLength = Math.min(...directorySegments.map((segments) => segments.length));
  const commonSegments: string[] = [];

  for (let index = 0; index < minLength; index += 1) {
    const candidate = directorySegments[0]?.[index];
    if (!candidate || directorySegments.some((segments) => segments[index] !== candidate)) {
      break;
    }

    commonSegments.push(candidate);
  }

  if (commonSegments.length > 0) {
    return `${commonSegments.join("/")}/**`;
  }

  const directories = new Set(files.map((filePath) => path.posix.dirname(filePath)));
  if (directories.size === 1) {
    const [directory] = [...directories];
    return directory === "." ? "*" : `${directory}/**`;
  }

  return `${path.posix.dirname(files[0])}/**`.replace(/^\.\//, "");
}

function shouldIncludeInSubsystems(filePath: string): boolean {
  if (NON_SUBSYSTEM_ROOT_FILES.has(filePath)) {
    return false;
  }

  if (filePath.startsWith(".") || filePath.split("/").some((segment) => segment.startsWith("."))) {
    return false;
  }

  if (!filePath.includes("/")) {
    return false;
  }

  const extension = path.posix.extname(filePath).toLowerCase();
  if (NON_SUBSYSTEM_EXTENSIONS.has(extension)) {
    return false;
  }

  return true;
}

function chooseClusterEntryPoint(
  files: string[],
  entryPoints: EntryPoint[],
  clusterKey: string
): string | null {
  const entryPaths = new Set(entryPoints.map((entryPoint) => entryPoint.path));
  const directEntry = files.find((filePath) => entryPaths.has(filePath));
  if (directEntry) {
    return directEntry;
  }

  const preferDocFiles = clusterKey === "docs";
  const sourceFiles = files.filter((filePath) =>
    SOURCE_EXTENSIONS_FOR_CLUSTER_ENTRY.has(path.posix.extname(filePath).toLowerCase())
  );
  const candidatePool = preferDocFiles || sourceFiles.length === 0 ? files : sourceFiles;

  const matchesClusterName = candidatePool.find((filePath) => {
    const basename = path.posix.basename(filePath).toLowerCase();
    const stem = basename.replace(/\.[^.]+$/, "");
    return stem === clusterKey;
  });
  if (matchesClusterName) {
    return matchesClusterName;
  }

  const conventionalEntry = candidatePool.find((filePath) =>
    /(index|main|app|router|routes|config|mod|lib)\.[^.]+$/.test(filePath)
  );
  if (conventionalEntry) {
    return conventionalEntry;
  }

  return candidatePool[0] ?? files[0] ?? null;
}

export async function clusterSubsystems(
  rootPath: string,
  spineNodes: string[],
  entryPoints: EntryPoint[]
): Promise<SubsystemCluster[]> {
  const files = await walkRepositoryFiles(rootPath);
  const excluded = new Set([...spineNodes, ...entryPoints.map((entryPoint) => entryPoint.path)]);
  const grouped = new Map<string, string[]>();

  for (const file of files) {
    if (excluded.has(file.path)) {
      continue;
    }

    if (!shouldIncludeInSubsystems(file.path)) {
      continue;
    }

    const key = inferClusterKey(file.path);
    const existing = grouped.get(key) ?? [];
    existing.push(file.path);
    grouped.set(key, existing);
  }

  return [...grouped.entries()]
    .map(([key, clusterFiles]) => {
      const sortedFiles = clusterFiles.sort();
      const copy = LABEL_COPY[key] ?? {
        label: key.charAt(0).toUpperCase() + key.slice(1).replace(/[-_]/g, " "),
        whatItDoes: `Files grouped around the ${key} part of the codebase.`,
        skipUnless: `Skip unless your task touches the ${key} area directly.`
      };

      return {
        key,
        label: copy.label,
        files: sortedFiles,
        pathGlob: inferPathGlob(sortedFiles),
        entryPoint: chooseClusterEntryPoint(sortedFiles, entryPoints, key),
        whatItDoes: copy.whatItDoes,
        skipUnless: copy.skipUnless
      };
    })
    .sort((left, right) => {
      if (right.files.length !== left.files.length) {
        return right.files.length - left.files.length;
      }

      return left.label.localeCompare(right.label);
    });
}
