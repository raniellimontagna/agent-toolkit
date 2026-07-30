import fs from "node:fs";
import path from "node:path";
import type { AriadneGit } from "./git.js";
import type { RuntimeRegistry } from "./runtimes/types.js";
import {
  type AriadneStatusInput,
  type AriadneStatusReport,
  buildAriadneStatus,
  createAriadneGit,
  inspectAriadneLock,
} from "./status.js";
import type { AriadneStore } from "./store.js";
import { AriadneStore as Store } from "./store.js";
import type {
  AriadneConfig,
  AriadneOwnershipViolation,
  AriadnePrd,
} from "./types.js";

export { formatAriadneDoctor } from "./render.js";

export type AriadneDoctorIssue = {
  code: string;
  severity: "error" | "warning";
  message: string;
};

export type AriadneDoctorReport = {
  schemaVersion: 1;
  command: "doctor";
  ok: boolean;
  issues: AriadneDoctorIssue[];
  status: AriadneStatusReport;
};

export type AriadneDoctorInput = Omit<
  AriadneStatusInput,
  "state" | "lock" | "ownershipViolation"
>;

function issue(
  issues: AriadneDoctorIssue[],
  code: string,
  severity: AriadneDoctorIssue["severity"],
  message: string,
): void {
  issues.push({ code, severity, message });
}

function fallbackPrd(projectRoot: string, branchName: string): AriadnePrd {
  return {
    schemaVersion: 1,
    project: path.basename(projectRoot),
    branchName: branchName || "unknown",
    description: "Invalid or unavailable Ariadne state",
    userStories: [],
  };
}

function fallbackConfig(): AriadneConfig {
  return {
    schemaVersion: 1,
    qualityChecks: [],
    maxAttemptsPerStory: 3,
  };
}

function readState(
  store: AriadneStore,
  projectRoot: string,
  issues: AriadneDoctorIssue[],
): {
  prd: AriadnePrd;
  config: AriadneConfig;
  prdValid: boolean;
  configValid: boolean;
} {
  let prd: AriadnePrd | undefined;
  let config: AriadneConfig | undefined;
  const failures: string[] = [];
  try {
    prd = store.loadPrd();
  } catch (error) {
    failures.push(
      `prd.json: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  try {
    config = store.loadConfig();
  } catch (error) {
    failures.push(
      `config.json: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (failures.length > 0) {
    issue(
      issues,
      "invalid_schema",
      "error",
      `Ariadne state is missing or invalid: ${failures.join("; ")}`,
    );
  }
  return {
    prd: prd ?? fallbackPrd(projectRoot, "unknown"),
    config: config ?? fallbackConfig(),
    prdValid: prd !== undefined,
    configValid: config !== undefined,
  };
}

function missingIgnoreEntries(projectRoot: string): string[] {
  let contents = "";
  try {
    contents = fs.readFileSync(path.join(projectRoot, ".gitignore"), "utf8");
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const lines = new Set(contents.split(/\r?\n/));
  return [".ariadne/lock", ".ariadne/runs/", ".ariadne-quarantine.json"].filter(
    (entry) => !lines.has(entry),
  );
}

function minimalStatus(
  projectRoot: string,
  state: { prd: AriadnePrd; config: AriadneConfig },
  currentBranch: string,
  dirty: boolean,
  lock: AriadneStatusReport["lock"],
  ownershipViolation?: AriadneOwnershipViolation,
): AriadneStatusReport {
  const stories = { pending: 0, inProgress: 0, completed: 0, blocked: 0 };
  for (const story of state.prd.userStories) {
    if (story.status === "in_progress") stories.inProgress += 1;
    else stories[story.status] += 1;
  }
  const active = state.prd.userStories.find(
    (story) => story.status === "in_progress",
  );
  const blocked = state.prd.userStories.find(
    (story) => story.status === "blocked",
  );
  const store = new Store(projectRoot);
  return {
    schemaVersion: 1,
    command: "status",
    project: state.prd.project,
    branch: { configured: state.prd.branchName, current: currentBranch },
    stories,
    ...(active
      ? {
          activeStory: {
            id: active.id,
            title: active.title,
            attempts: active.attempts,
          },
        }
      : {}),
    ...(blocked
      ? {
          blockedStory: {
            id: blocked.id,
            title: blocked.title,
            attempts: blocked.attempts,
          },
        }
      : {}),
    ...(ownershipViolation ? { ownershipViolation } : {}),
    dirty,
    lock,
    consecutiveFailures: 0,
    paths: { progress: store.paths.progress, runs: store.paths.runs },
  };
}

function statusWithState(input: {
  projectRoot: string;
  store: AriadneStore;
  registry?: RuntimeRegistry;
  isProcessAlive?: (pid: number) => boolean;
  git: AriadneGit;
  state: { prd: AriadnePrd; config: AriadneConfig };
  lock: AriadneStatusReport["lock"];
  ownershipViolation?: AriadneOwnershipViolation;
}): AriadneStatusReport {
  return buildAriadneStatus({
    projectRoot: input.projectRoot,
    store: input.store,
    git: input.git,
    state: input.state,
    lock: input.lock,
    ownershipViolation: input.ownershipViolation ?? null,
    ...(input.registry ? { registry: input.registry } : {}),
    ...(input.isProcessAlive ? { isProcessAlive: input.isProcessAlive } : {}),
  });
}

export function buildAriadneDoctor(
  input: AriadneDoctorInput,
): AriadneDoctorReport {
  const issues: AriadneDoctorIssue[] = [];
  const store = input.store ?? new Store(input.projectRoot);
  const state = readState(store, input.projectRoot, issues);
  const git = input.git ?? createAriadneGit(input.projectRoot);
  let gitReady = true;
  let currentBranch = "unknown";
  let dirty = false;
  try {
    git.assertRepository();
    currentBranch = git.currentBranch();
    dirty = git.statusPorcelain() !== "";
  } catch (error) {
    gitReady = false;
    issue(
      issues,
      "git_repository",
      "error",
      error instanceof Error ? error.message : String(error),
    );
  }

  let lock: AriadneStatusReport["lock"] = { state: "absent" };
  try {
    lock = inspectAriadneLock(store.paths.lock, input.isProcessAlive);
  } catch (error) {
    issue(
      issues,
      "invalid_lock",
      "error",
      error instanceof Error ? error.message : String(error),
    );
  }

  let ownershipViolation: AriadneOwnershipViolation | undefined;
  try {
    ownershipViolation = store.loadOwnershipViolation();
  } catch (error) {
    issue(
      issues,
      "invalid_ownership_marker",
      "error",
      error instanceof Error ? error.message : String(error),
    );
  }

  let status: AriadneStatusReport;
  if (gitReady) {
    status = statusWithState({
      projectRoot: input.projectRoot,
      store,
      git,
      state,
      lock,
      ...(ownershipViolation ? { ownershipViolation } : {}),
      ...(input.registry ? { registry: input.registry } : {}),
      ...(input.isProcessAlive ? { isProcessAlive: input.isProcessAlive } : {}),
    });
  } else {
    status = minimalStatus(
      input.projectRoot,
      state,
      currentBranch,
      dirty,
      lock,
      ownershipViolation,
    );
  }

  if (
    gitReady &&
    state.prdValid &&
    status.branch.current !== status.branch.configured
  ) {
    issue(
      issues,
      "wrong_branch",
      "error",
      `Configured branch ${status.branch.configured} does not match current branch ${status.branch.current}.`,
    );
  }
  if (status.dirty && !status.activeStory && !status.blockedStory) {
    issue(
      issues,
      "dirty_worktree",
      "error",
      "The worktree is dirty without an in-progress story to recover.",
    );
  }
  if (ownershipViolation) {
    issue(
      issues,
      "ownership_violation",
      "error",
      `Run ${ownershipViolation.runId} changed coordinator-owned ${ownershipViolation.changed.join(", ")}; inspect and restore Git/canonical state, then deliberately remove ${store.paths.ownershipViolation}.`,
    );
  }
  if (state.configValid && state.config.qualityChecks.length === 0) {
    issue(
      issues,
      "missing_checks",
      "error",
      "At least one quality check must be configured.",
    );
  }
  const missingIgnore = missingIgnoreEntries(input.projectRoot);
  if (missingIgnore.length > 0) {
    issue(
      issues,
      "missing_gitignore",
      "warning",
      `Missing required .gitignore entries: ${missingIgnore.join(", ")}.`,
    );
  }
  if (state.configValid && !state.config.runtime) {
    issue(
      issues,
      "runtime_unavailable",
      "error",
      "No Ariadne runtime is configured.",
    );
  } else if (
    state.configValid &&
    status.runtime &&
    status.runtime.state !== "healthy"
  ) {
    const runtimeState = status.runtime.state;
    issue(
      issues,
      `runtime_${runtimeState}`,
      runtimeState === "unverified" ? "warning" : "error",
      `Configured runtime ${state.config.runtime} is ${runtimeState}${status.runtime?.version ? ` (version ${status.runtime.version})` : ""}.`,
    );
  }
  if (status.lock.state === "stale") {
    issue(
      issues,
      "stale_lock",
      "warning",
      `Lock for run ${status.lock.runId ?? "unknown"} belongs to a process that is no longer alive.`,
    );
  }
  if (status.lastRun?.outcome === "interrupted") {
    issue(
      issues,
      "interrupted_state",
      status.activeStory ? "warning" : "error",
      status.activeStory
        ? `Interrupted story ${status.activeStory.id} is preserved for recovery.`
        : "The last run was interrupted but no in-progress story is available for recovery.",
    );
  }

  return {
    schemaVersion: 1,
    command: "doctor",
    ok: !issues.some((candidate) => candidate.severity === "error"),
    issues,
    status,
  };
}
