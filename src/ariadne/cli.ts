import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { capture, findCommand } from "../system.js";
import { parseAriadneArgs } from "./args.js";
import { runQualityChecks } from "./checks.js";
import { buildAriadneDoctor } from "./doctor.js";
import { initializeAriadne } from "./init.js";
import { acquireProjectLock } from "./lock.js";
import { ARIADNE_EXIT_CODES, runAriadneLoop } from "./loop.js";
import { runAgentProcess } from "./process.js";
import {
  formatAriadneDoctor,
  formatAriadneJson,
  formatAriadneStatus,
} from "./render.js";
import { createRuntimeRegistry, selectRuntime } from "./runtimes/index.js";
import { AriadneRuntimeError } from "./runtimes/types.js";
import { AriadneStateError } from "./schema.js";
import { buildAriadneStatus, createAriadneGit } from "./status.js";
import { AriadneStore } from "./store.js";
import { type AriadneRunOutcome, AriadneUsageError } from "./types.js";
import { ariadneUsage } from "./usage.js";

export const ARIADNE_USAGE_EXIT_CODE = 2;
export const ARIADNE_RUNTIME_EXIT_CODE = 3;
export const ARIADNE_STATE_EXIT_CODE = 4;

type AriadneCliDeps = {
  cwd: () => string;
  findProjectRoot: (cwd: string) => string;
  initialize: typeof initializeAriadne;
  buildStatus: typeof buildAriadneStatus;
  buildDoctor: typeof buildAriadneDoctor;
  runLoop: typeof runAriadneLoop;
  createStore: (projectRoot: string) => AriadneStore;
  createGit: typeof createAriadneGit;
  createRegistry: typeof createRuntimeRegistry;
  selectRuntime: typeof selectRuntime;
  acquireLock: typeof acquireProjectLock;
  runProcess: typeof runAgentProcess;
  runChecks: typeof runQualityChecks;
  now: () => Date;
  createRunId: () => string;
  write: (line: string) => void;
};

function findProjectRoot(cwd: string): string {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    throw new AriadneStateError(
      "$git",
      `Ariadne requires a Git repository: ${cwd}`,
    );
  }
}

const defaultDeps: AriadneCliDeps = {
  cwd: () => process.cwd(),
  findProjectRoot,
  initialize: initializeAriadne,
  buildStatus: buildAriadneStatus,
  buildDoctor: buildAriadneDoctor,
  runLoop: runAriadneLoop,
  createStore: (projectRoot) => new AriadneStore(projectRoot),
  createGit: createAriadneGit,
  createRegistry: createRuntimeRegistry,
  selectRuntime,
  acquireLock: acquireProjectLock,
  runProcess: runAgentProcess,
  runChecks: runQualityChecks,
  now: () => new Date(),
  createRunId: randomUUID,
  write: (line) => console.log(line),
};

function errorExitCode(error: unknown): number {
  if (error instanceof AriadneUsageError) return ARIADNE_USAGE_EXIT_CODE;
  if (error instanceof AriadneRuntimeError) return ARIADNE_RUNTIME_EXIT_CODE;
  if (error instanceof AriadneStateError) return ARIADNE_STATE_EXIT_CODE;
  return ARIADNE_RUNTIME_EXIT_CODE;
}

function stateErrorForLock(error: unknown): AriadneStateError | undefined {
  if (!(error instanceof Error)) return undefined;
  if (
    error.message === "Ariadne lock is malformed." ||
    error.message ===
      "Ariadne project lock changed during stale-lock recovery." ||
    /^Ariadne project is already locked by PID \d+\.$/.test(error.message)
  ) {
    return new AriadneStateError(".ariadne/lock", error.message);
  }
  return undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function ariadneExitCode(outcome: AriadneRunOutcome): number {
  return ARIADNE_EXIT_CODES[outcome];
}

export async function runAriadne(
  argv: string[],
  overrides: Partial<AriadneCliDeps> = {},
): Promise<number> {
  const deps = { ...defaultDeps, ...overrides };
  try {
    const command = parseAriadneArgs(
      argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")
        ? ["help"]
        : argv,
    );
    if (command.kind === "help") {
      deps.write(ariadneUsage());
      return 0;
    }

    const projectRoot = deps.findProjectRoot(deps.cwd());
    if (command.kind === "init") {
      const report = await deps.initialize({
        cwd: projectRoot,
        runtime: command.runtime,
        qualityChecks: command.qualityChecks,
        interactive: !command.json,
      });
      deps.write(
        command.json ? JSON.stringify(report, null, 2) : "Ariadne initialized.",
      );
      return 0;
    }

    const store = deps.createStore(projectRoot);
    const git = deps.createGit(projectRoot);
    const registry = deps.createRegistry({
      findCommand,
      capture,
      baseEnv: process.env,
    });

    if (command.kind === "status") {
      const report = deps.buildStatus({ projectRoot, store, git, registry });
      deps.write(
        command.json ? formatAriadneJson(report) : formatAriadneStatus(report),
      );
      return 0;
    }
    if (command.kind === "doctor") {
      const report = deps.buildDoctor({ projectRoot, store, git, registry });
      deps.write(
        command.json ? formatAriadneJson(report) : formatAriadneDoctor(report),
      );
      return report.ok ? 0 : ARIADNE_STATE_EXIT_CODE;
    }

    const config = store.loadConfig();
    const selection = await deps.selectRuntime({
      explicit: command.runtime,
      configured: config.runtime,
      interactive: false,
      registry,
    });
    const result = await deps.runLoop(
      {
        runtime: selection.name,
        ...(command.maxIterations === undefined
          ? {}
          : { maxIterations: command.maxIterations }),
        ...(command.maxRuntimeMs === undefined
          ? {}
          : { maxRuntimeMs: command.maxRuntimeMs }),
        dryRun: command.dryRun,
      },
      {
        store,
        git,
        adapter: selection.adapter,
        acquireLock: deps.acquireLock,
        runProcess: deps.runProcess,
        runChecks: deps.runChecks,
        now: deps.now,
        createRunId: deps.createRunId,
      },
    );
    deps.write(
      command.json
        ? JSON.stringify(result, null, 2)
        : `Ariadne run: ${result.outcome}.`,
    );
    return ariadneExitCode(result.outcome);
  } catch (error) {
    const stateError = stateErrorForLock(error);
    const normalizedError = stateError ?? error;
    console.error(errorMessage(normalizedError));
    return errorExitCode(normalizedError);
  }
}
