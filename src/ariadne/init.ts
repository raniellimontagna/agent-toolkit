import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import * as prompts from "@clack/prompts";
import { capture, findCommand } from "../system.js";
import { normalizeImportedPrd } from "./import.js";
import { createRuntimeRegistry } from "./runtimes/index.js";
import type { RuntimeDetection } from "./runtimes/types.js";
import { validateConfig, validatePrd } from "./schema.js";
import { AriadneStore } from "./store.js";
import type { AriadneConfig, AriadnePrd, AriadneRuntimeName } from "./types.js";
import { AriadneUsageError } from "./types.js";

const GITIGNORE_ADDITIONS = [".ariadne/lock", ".ariadne/runs/"] as const;

export type AriadneInitPlan = {
  projectRoot: string;
  sourcePrd?: string;
  prd: AriadnePrd;
  config: AriadneConfig;
  gitignoreAdditions: [".ariadne/lock", ".ariadne/runs/"];
};

export type AriadneInitInput = {
  cwd: string;
  runtime?: AriadneRuntimeName;
  qualityChecks: string[];
  interactive: boolean;
};

export type AriadneInitReport = {
  schemaVersion: 1;
  command: "init";
  outcome: "initialized" | "cancelled";
  projectRoot: string;
  importedFrom?: string;
  runtime?: AriadneRuntimeName;
  qualityChecks: string[];
};

type InitPrompts = {
  confirm: typeof prompts.confirm;
  text: typeof prompts.text;
  select: typeof prompts.select;
  isCancel: typeof prompts.isCancel;
};

export type AriadneInitDeps = {
  prompts?: InitPrompts;
  runtimeDetections?: () => RuntimeDetection[];
};

function gitOutput(cwd: string, args: string[], description: string): string {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    throw new AriadneUsageError(
      `Ariadne requires a Git repository to ${description}: ${cwd}`,
    );
  }
}

function repositoryRoot(cwd: string): string {
  const discovered = gitOutput(
    cwd,
    ["rev-parse", "--show-toplevel"],
    "initialize a project",
  );
  let actual: string;
  let root: string;
  try {
    actual = fs.realpathSync(cwd);
    root = fs.realpathSync(discovered);
  } catch {
    throw new AriadneUsageError(
      "Ariadne could not resolve the Git repository root.",
    );
  }
  if (actual !== root) {
    throw new AriadneUsageError(
      `Ariadne init must run from the repository root: ${root}`,
    );
  }
  return root;
}

function readJson(source: string): unknown {
  return JSON.parse(fs.readFileSync(source, "utf8")) as unknown;
}

function readPackage(root: string): Record<string, unknown> | undefined {
  const packagePath = path.join(root, "package.json");
  if (!fs.existsSync(packagePath)) return undefined;
  const value = readJson(packagePath);
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function packageManager(root: string, packageJson?: Record<string, unknown>) {
  if (typeof packageJson?.packageManager === "string") {
    const declared = packageJson.packageManager.split("@", 1)[0];
    if (
      declared === "pnpm" ||
      declared === "npm" ||
      declared === "yarn" ||
      declared === "bun"
    ) {
      return declared;
    }
  }
  if (fs.existsSync(path.join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(root, "yarn.lock"))) return "yarn";
  if (
    fs.existsSync(path.join(root, "bun.lock")) ||
    fs.existsSync(path.join(root, "bun.lockb"))
  ) {
    return "bun";
  }
  if (fs.existsSync(path.join(root, "package-lock.json"))) return "npm";
  return "npm";
}

function scriptCommand(manager: string, script: string): string {
  return `${manager} run ${script}`;
}

function detectQualityChecks(
  root: string,
  packageJson?: Record<string, unknown>,
): string[] {
  const scripts = packageJson?.scripts;
  if (!scripts || typeof scripts !== "object" || Array.isArray(scripts)) {
    return [];
  }
  const available = scripts as Record<string, unknown>;
  const manager = packageManager(root, packageJson);
  if (typeof available.check === "string") {
    return [scriptCommand(manager, "check")];
  }
  return ["lint", "typecheck", "test"]
    .filter((name) => typeof available[name] === "string")
    .map((name) => scriptCommand(manager, name));
}

function defaultPrd(
  root: string,
  packageJson?: Record<string, unknown>,
): AriadnePrd {
  const packageName = packageJson?.name;
  return {
    schemaVersion: 1,
    project:
      typeof packageName === "string" && packageName.trim()
        ? packageName
        : path.basename(root),
    branchName: gitOutput(root, ["branch", "--show-current"], "read branch"),
    description: "Ariadne project backlog",
    userStories: [],
  };
}

function detectedRuntime(): AriadneRuntimeName | undefined {
  const registry = createRuntimeRegistry({
    findCommand,
    capture,
    baseEnv: process.env,
  });
  const selectable = Object.values(registry)
    .map((adapter) => adapter.detect())
    .filter(
      (detection) =>
        detection.state === "healthy" || detection.state === "unverified",
    );
  return selectable.length === 1 ? selectable[0]?.name : undefined;
}

export function buildInitPlan(input: AriadneInitInput): AriadneInitPlan {
  const projectRoot = repositoryRoot(input.cwd);
  const store = new AriadneStore(projectRoot);
  const packageJson = readPackage(projectRoot);
  const existingPrd = fs.existsSync(store.paths.prd)
    ? store.loadPrd()
    : undefined;
  const rootPrd = path.join(projectRoot, "prd.json");
  const sourcePrd =
    existingPrd === undefined && fs.existsSync(rootPrd) ? rootPrd : undefined;
  const prd =
    existingPrd ??
    (sourcePrd
      ? normalizeImportedPrd(readJson(sourcePrd))
      : defaultPrd(projectRoot, packageJson));
  const existingConfig = fs.existsSync(store.paths.config)
    ? store.loadConfig()
    : undefined;
  const qualityChecks =
    input.qualityChecks.length > 0
      ? input.qualityChecks
      : existingConfig?.qualityChecks.length
        ? existingConfig.qualityChecks
        : detectQualityChecks(projectRoot, packageJson);
  if (!input.interactive && qualityChecks.length === 0) {
    throw new AriadneUsageError(
      "Ariadne init requires at least one quality check in non-interactive mode; pass --check.",
    );
  }
  const runtime = input.runtime ?? existingConfig?.runtime ?? detectedRuntime();
  const config: AriadneConfig = {
    schemaVersion: 1,
    ...(runtime ? { runtime } : {}),
    qualityChecks,
    maxAttemptsPerStory: existingConfig?.maxAttemptsPerStory ?? 3,
  };

  return {
    projectRoot,
    ...(sourcePrd ? { sourcePrd } : {}),
    prd,
    config,
    gitignoreAdditions: [...GITIGNORE_ADDITIONS],
  };
}

function updateGitignore(plan: AriadneInitPlan): void {
  const destination = path.join(plan.projectRoot, ".gitignore");
  const original = fs.existsSync(destination)
    ? fs.readFileSync(destination, "utf8")
    : "";
  const existing = new Set(original.split(/\r?\n/));
  const additions = plan.gitignoreAdditions.filter(
    (entry) => !existing.has(entry),
  );
  if (additions.length === 0) return;

  const newline = original.includes("\r\n") ? "\r\n" : "\n";
  const separator =
    original.length > 0 && !original.endsWith("\n") && !original.endsWith("\r")
      ? newline
      : "";
  const next = `${original}${separator}${additions.join(newline)}${newline}`;
  const temporary = `${destination}.ariadne-${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, next, { encoding: "utf8", flag: "wx" });
    fs.renameSync(temporary, destination);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}

function reportFor(
  plan: AriadneInitPlan,
  outcome: AriadneInitReport["outcome"],
): AriadneInitReport {
  return {
    schemaVersion: 1,
    command: "init",
    outcome,
    projectRoot: plan.projectRoot,
    ...(plan.sourcePrd ? { importedFrom: plan.sourcePrd } : {}),
    ...(plan.config.runtime ? { runtime: plan.config.runtime } : {}),
    qualityChecks: plan.config.qualityChecks,
  };
}

export function applyInitPlan(plan: AriadneInitPlan): AriadneInitReport {
  const projectRoot = repositoryRoot(plan.projectRoot);
  if (projectRoot !== plan.projectRoot) {
    throw new AriadneUsageError(
      `Ariadne init plan root does not match the repository root: ${projectRoot}`,
    );
  }
  if (
    plan.gitignoreAdditions.length !== GITIGNORE_ADDITIONS.length ||
    plan.gitignoreAdditions.some(
      (entry, index) => entry !== GITIGNORE_ADDITIONS[index],
    )
  ) {
    throw new AriadneUsageError(
      "Ariadne init plan contains unexpected .gitignore entries.",
    );
  }
  if (
    plan.sourcePrd &&
    path.resolve(plan.sourcePrd) !== path.join(projectRoot, "prd.json")
  ) {
    throw new AriadneUsageError(
      "Ariadne init may only import the repository-root prd.json.",
    );
  }
  const prd = validatePrd(plan.prd);
  const config = validateConfig(plan.config);
  const store = new AriadneStore(plan.projectRoot);
  store.ensureLayout();
  fs.mkdirSync(store.paths.runs, { recursive: true });
  if (plan.sourcePrd) {
    store.archiveImportedPrd(
      fs.readFileSync(plan.sourcePrd, "utf8"),
      new Date().toISOString(),
    );
  }
  store.savePrd(prd);
  store.saveConfig(config);
  if (!fs.existsSync(store.paths.progress)) {
    fs.writeFileSync(store.paths.progress, "", {
      encoding: "utf8",
      flag: "wx",
    });
  }
  updateGitignore(plan);
  return reportFor(plan, "initialized");
}

function defaultDetections(): RuntimeDetection[] {
  const registry = createRuntimeRegistry({
    findCommand,
    capture,
    baseEnv: process.env,
  });
  return Object.values(registry).map((adapter) => adapter.detect());
}

export async function initializeAriadne(
  input: AriadneInitInput,
  deps: AriadneInitDeps = {},
): Promise<AriadneInitReport> {
  const prompt = deps.prompts ?? prompts;
  let plan = buildInitPlan(input);
  if (input.interactive && plan.config.qualityChecks.length === 0) {
    const answer = await prompt.text({
      message: "Quality check command",
      placeholder: "pnpm test",
      validate: (value) =>
        !value || value.trim() === ""
          ? "Enter a quality check command."
          : undefined,
    });
    if (prompt.isCancel(answer)) return reportFor(plan, "cancelled");
    plan = buildInitPlan({ ...input, qualityChecks: [answer] });
  }
  if (input.interactive && !plan.config.runtime) {
    const detections = (deps.runtimeDetections ?? defaultDetections)().filter(
      (detection) =>
        detection.state === "healthy" || detection.state === "unverified",
    );
    if (detections.length > 0) {
      const answer = await prompt.select({
        message: "Runtime",
        options: detections.map((detection) => ({
          value: detection.name,
          label: `${detection.name}${detection.version ? ` ${detection.version}` : ""}`,
        })),
      });
      if (prompt.isCancel(answer)) return reportFor(plan, "cancelled");
      plan = buildInitPlan({
        ...input,
        runtime: answer,
        qualityChecks: plan.config.qualityChecks,
      });
    }
  }
  if (input.interactive) {
    const confirmed = await prompt.confirm({
      message: `Initialize Ariadne in ${plan.projectRoot}?`,
    });
    if (prompt.isCancel(confirmed) || !confirmed) {
      return reportFor(plan, "cancelled");
    }
  }
  return applyInitPlan(plan);
}
