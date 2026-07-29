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
import { AriadneStore } from "./store.js";
import type { AriadneConfig, AriadnePrd, AriadneRuntimeName } from "./types.js";

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
  lastRun?: { id: string; outcome: string; durationMs: number };
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
};

function gitExec(
  command: "git",
  args: string[],
  cwd: string,
): ReturnType<GitExec> {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
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
    throw new Error("Ariadne lock is malformed.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Ariadne lock is malformed.");
  }
  const record = value as Record<string, unknown>;
  if (
    record.schemaVersion !== 1 ||
    !Number.isSafeInteger(record.pid) ||
    (record.pid as number) <= 0 ||
    typeof record.startedAt !== "string" ||
    Number.isNaN(Date.parse(record.startedAt)) ||
    typeof record.runId !== "string" ||
    record.runId === ""
  ) {
    throw new Error("Ariadne lock is malformed.");
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
  return { id, timestamp, outcome, durationMs };
}

export function inspectLastAriadneRun(
  runsPath: string,
): AriadneStatusReport["lastRun"] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(runsPath, { withFileTypes: true });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  const candidates = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => runCandidate(runsPath, entry.name))
    .filter((candidate): candidate is RunCandidate => candidate !== undefined)
    .sort(
      (left, right) =>
        right.timestamp - left.timestamp || right.id.localeCompare(left.id),
    );
  const latest = candidates[0];
  return latest
    ? {
        id: latest.id,
        outcome: latest.outcome,
        durationMs: latest.durationMs,
      }
    : undefined;
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
    ...(lastRun ? { lastRun } : {}),
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
