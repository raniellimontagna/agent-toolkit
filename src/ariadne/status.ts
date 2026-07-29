import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { capture, findCommand } from "../system.js";
import { AriadneGit, type GitExec } from "./git.js";
import type { AriadneLockRecord } from "./lock.js";
import { createRuntimeRegistry } from "./runtimes/index.js";
import type {
  RuntimeDetectionState,
  RuntimeRegistry,
} from "./runtimes/types.js";
import { AriadneStateError } from "./schema.js";
import { AriadneStore } from "./store.js";
import type {
  AriadneConfig,
  AriadneOwnershipViolation,
  AriadnePrd,
  AriadneRuntimeName,
} from "./types.js";

export { formatAriadneStatus } from "./render.js";

export type AriadneStoryCounts = {
  pending: number;
  inProgress: number;
  completed: number;
  blocked: number;
};

export type AriadneStatusReport = {
  schemaVersion: 1;
  command: "status";
  project: string;
  branch: { configured: string; current: string };
  runtime?: {
    name: AriadneRuntimeName;
    state: RuntimeDetectionState;
    version?: string;
  };
  stories: AriadneStoryCounts;
  activeStory?: { id: string; title: string; attempts: number };
  blockedStory?: { id: string; title: string; attempts: number };
  ownershipViolation?: AriadneOwnershipViolation;
  lastRun?: {
    id: string;
    outcome: string;
    durationMs: number;
    initialHead?: string;
    finalHead?: string;
  };
  consecutiveFailures: number;
  dirty: boolean;
  lock: {
    state: "absent" | "live" | "stale";
    pid?: number;
    runId?: string;
  };
  paths: { progress: string; runs: string };
};

export type AriadneStatusInput = {
  projectRoot: string;
  registry?: RuntimeRegistry;
  isProcessAlive?: (pid: number) => boolean;
  store?: AriadneStore;
  git?: AriadneGit;
  state?: { prd: AriadnePrd; config: AriadneConfig };
  lock?: AriadneStatusReport["lock"];
  ownershipViolation?: AriadneOwnershipViolation | null;
};

function gitExec(
  command: "git",
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
): ReturnType<GitExec> {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: env ? { ...process.env, ...env } : process.env,
  });
  return {
    ok: !result.error && result.status === 0,
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr || result.error?.message || "",
  };
}

export function createAriadneGit(projectRoot: string): AriadneGit {
  return new AriadneGit(projectRoot, gitExec);
}

function defaultRegistry(): RuntimeRegistry {
  return createRuntimeRegistry({ findCommand, capture, baseEnv: process.env });
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function lockRecord(source: string): AriadneLockRecord {
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new AriadneStateError(".ariadne/lock", "Ariadne lock is malformed.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AriadneStateError(".ariadne/lock", "Ariadne lock is malformed.");
  }
  const record = value as Record<string, unknown>;
  const expectedKeys = [
    "schemaVersion",
    "pid",
    "startedAt",
    "runId",
    "ownerToken",
  ];
  const ownerTokenPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (
    Object.keys(record).length !== expectedKeys.length ||
    expectedKeys.some((key) => !Object.hasOwn(record, key)) ||
    record.schemaVersion !== 1 ||
    !Number.isSafeInteger(record.pid) ||
    (record.pid as number) <= 0 ||
    typeof record.startedAt !== "string" ||
    Number.isNaN(Date.parse(record.startedAt)) ||
    typeof record.runId !== "string" ||
    record.runId === "" ||
    typeof record.ownerToken !== "string" ||
    !ownerTokenPattern.test(record.ownerToken)
  ) {
    throw new AriadneStateError(".ariadne/lock", "Ariadne lock is malformed.");
  }
  return record as AriadneLockRecord;
}

export function inspectAriadneLock(
  lockPath: string,
  isProcessAlive: (pid: number) => boolean = processAlive,
): AriadneStatusReport["lock"] {
  let raw: string;
  try {
    raw = fs.readFileSync(lockPath, "utf8");
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { state: "absent" };
    }
    throw error;
  }
  const record = lockRecord(raw);
  return {
    state: isProcessAlive(record.pid) ? "live" : "stale",
    pid: record.pid,
    runId: record.runId,
  };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readRecord(source: string): Record<string, unknown> | undefined {
  try {
    return record(JSON.parse(fs.readFileSync(source, "utf8")) as unknown);
  } catch (error: unknown) {
    if (
      (error as NodeJS.ErrnoException).code === "ENOENT" ||
      error instanceof SyntaxError
    ) {
      return undefined;
    }
    throw error;
  }
}

type RunCandidate = {
  id: string;
  timestamp: number;
  outcome: string;
  durationMs: number;
  initialHead?: string;
  finalHead?: string;
};

function stringValue(
  sources: Array<Record<string, unknown> | undefined>,
  key: string,
): string | undefined {
  for (const source of sources) {
    if (typeof source?.[key] === "string") return source[key] as string;
  }
  return undefined;
}

function numberValue(
  sources: Array<Record<string, unknown> | undefined>,
  key: string,
): number | undefined {
  for (const source of sources) {
    const value = source?.[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function runCandidate(runsPath: string, id: string): RunCandidate | undefined {
  const runPath = path.join(runsPath, id);
  const summary = readRecord(path.join(runPath, "summary.json"));
  const run = readRecord(path.join(runPath, "run.json"));
  const stop = readRecord(path.join(runPath, "stop.json"));
  const failure = readRecord(path.join(runPath, "failure.json"));
  const result = readRecord(path.join(runPath, "result.json"));
  const processResult = readRecord(path.join(runPath, "process.json"));
  const attempt = readRecord(path.join(runPath, "attempt.json"));
  const sources = [summary, run, stop, failure, result, processResult, attempt];
  const startedAt = stringValue([attempt, run, processResult], "startedAt");
  const finishedAt =
    stringValue([summary, run, stop, failure, processResult], "finishedAt") ??
    stringValue([stop, failure], "timestamp");
  const timestampText = finishedAt ?? startedAt;
  let timestamp = timestampText ? Date.parse(timestampText) : Number.NaN;
  if (Number.isNaN(timestamp)) {
    try {
      timestamp = fs.statSync(runPath).mtimeMs;
    } catch {
      return undefined;
    }
  }
  const explicitOutcome = stringValue([summary, run, stop], "outcome");
  const outcome =
    explicitOutcome ??
    (failure ? "failed" : stringValue([result], "outcome")) ??
    (processResult?.status === 0 ? "completed" : "incomplete");
  let durationMs = numberValue(sources, "durationMs") ?? 0;
  if (durationMs === 0 && startedAt && finishedAt) {
    durationMs = Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));
  }
  const initialHead = stringValue(sources, "initialHead");
  const finalHead = stringValue(sources, "finalHead");
  return {
    id,
    timestamp,
    outcome,
    durationMs,
    ...(initialHead ? { initialHead } : {}),
    ...(finalHead ? { finalHead } : {}),
  };
}

export function inspectLastAriadneRun(
  runsPath: string,
): AriadneStatusReport["lastRun"] {
  const latest = inspectRunCandidates(runsPath)[0];
  return latest
    ? {
        id: latest.id,
        outcome: latest.outcome,
        durationMs: latest.durationMs,
        ...(latest.initialHead ? { initialHead: latest.initialHead } : {}),
        ...(latest.finalHead ? { finalHead: latest.finalHead } : {}),
      }
    : undefined;
}

function inspectRunCandidates(runsPath: string): RunCandidate[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(runsPath, { withFileTypes: true });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return entries
    .filter(
      (entry) => entry.isDirectory() && entry.name !== ".lock-coordinator",
    )
    .map((entry) => runCandidate(runsPath, entry.name))
    .filter((candidate): candidate is RunCandidate => candidate !== undefined)
    .sort(
      (left, right) =>
        right.timestamp - left.timestamp || right.id.localeCompare(left.id),
    );
}

function consecutiveFailures(runsPath: string): number {
  let count = 0;
  for (const candidate of inspectRunCandidates(runsPath)) {
    if (candidate.outcome !== "failed" && candidate.outcome !== "blocked") {
      break;
    }
    count += 1;
  }
  return count;
}

function storyCounts(prd: AriadnePrd): AriadneStoryCounts {
  const counts: AriadneStoryCounts = {
    pending: 0,
    inProgress: 0,
    completed: 0,
    blocked: 0,
  };
  for (const story of prd.userStories) {
    if (story.status === "in_progress") counts.inProgress += 1;
    else counts[story.status] += 1;
  }
  return counts;
}

export function buildAriadneStatus(
  input: AriadneStatusInput,
): AriadneStatusReport {
  const store = input.store ?? new AriadneStore(input.projectRoot);
  const git = input.git ?? createAriadneGit(input.projectRoot);
  const prd = input.state?.prd ?? store.loadPrd();
  const config = input.state?.config ?? store.loadConfig();
  git.assertRepository();
  const runtimeDetection = config.runtime
    ? (input.registry ?? defaultRegistry())[config.runtime].detect()
    : undefined;
  const active = prd.userStories.find(
    (story) => story.status === "in_progress",
  );
  const blocked = prd.userStories.find((story) => story.status === "blocked");
  const ownershipViolation =
    input.ownershipViolation === undefined
      ? store.loadOwnershipViolation()
      : (input.ownershipViolation ?? undefined);
  const lastRun = inspectLastAriadneRun(store.paths.runs);

  return {
    schemaVersion: 1,
    command: "status",
    project: prd.project,
    branch: {
      configured: prd.branchName,
      current: git.currentBranch(),
    },
    ...(runtimeDetection
      ? {
          runtime: {
            name: runtimeDetection.name,
            state: runtimeDetection.state,
            ...(runtimeDetection.version
              ? { version: runtimeDetection.version }
              : {}),
          },
        }
      : {}),
    stories: storyCounts(prd),
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
    ...(lastRun ? { lastRun } : {}),
    consecutiveFailures: consecutiveFailures(store.paths.runs),
    dirty: git.statusPorcelain() !== "",
    lock:
      input.lock ??
      inspectAriadneLock(
        store.paths.lock,
        input.isProcessAlive ?? processAlive,
      ),
    paths: { progress: store.paths.progress, runs: store.paths.runs },
  };
}
