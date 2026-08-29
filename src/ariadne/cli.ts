import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import process from "node:process";
import * as prompts from "@clack/prompts";
import { isRuntimeName } from "../state.js";
import { capture, findCommand } from "../system.js";
import { parseAriadneArgs } from "./args.js";
import { runQualityChecks } from "./checks.js";
import { buildAriadneDoctor } from "./doctor.js";
import { initializeAriadne } from "./init.js";
import { acquireProjectLock } from "./lock.js";
import { ARIADNE_EXIT_CODES, runAriadneLoop } from "./loop.js";
import {
  assertPersistedOwnership,
  captureOwnershipCertification,
} from "./ownership.js";
import { runAgentProcess } from "./process.js";
import {
  formatAriadneDoctor,
  formatAriadneJson,
  formatAriadneRun,
  formatAriadneStatus,
} from "./render.js";
import { createRuntimeRegistry, selectRuntime } from "./runtimes/index.js";
import { AriadneRuntimeError } from "./runtimes/types.js";
import { AriadneStateError } from "./schema.js";
import { buildAriadneStatus, createAriadneGit } from "./status.js";
import { AriadneStore } from "./store.js";
import {
  AriadneCancelledError,
  type AriadneRunOutcome,
  type AriadneRuntimeName,
  AriadneUsageError,
} from "./types.js";
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
  isInteractive: () => boolean;
  globalPreferredRuntime: () => AriadneRuntimeName | undefined;
  chooseRuntime: NonNullable<Parameters<typeof selectRuntime>[0]["choose"]>;
  write: (line: string) => void;
};

function globalPreferredRuntime(): AriadneRuntimeName | undefined {
  const preferred = process.env.AGENT_TOOLKIT_PREFERRED_RUNTIME;
  return typeof preferred === "string" && isRuntimeName(preferred)
    ? preferred
    : undefined;
}

async function chooseRuntime(
  choices: Parameters<
    NonNullable<Parameters<typeof selectRuntime>[0]["choose"]>
  >[0],
): Promise<AriadneRuntimeName> {
  const answer = await prompts.select({
    message: "Ariadne runtime",
    options: choices.map((choice) => ({
      value: choice.name,
      label: `${choice.name}${choice.version ? ` ${choice.version}` : ""}`,
      hint: choice.state,
    })),
  });
  if (prompts.isCancel(answer)) {
    throw new AriadneCancelledError("Ariadne runtime selection cancelled.");
  }
  return answer as AriadneRuntimeName;
}

function findProjectRoot(cwd: string): string {
  try {
    const toplevel = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    // Git prints POSIX separators and may echo a short path component on
    // Windows, so canonicalize before it becomes the stored project root.
    return fs.realpathSync.native(toplevel);
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
  isInteractive: () =>
    process.stdin.isTTY === true && process.stdout.isTTY === true,
  globalPreferredRuntime,
  chooseRuntime,
  write: (line) => console.log(line),
};

function errorExitCode(error: unknown): number {
  if (error instanceof AriadneUsageError) return ARIADNE_USAGE_EXIT_CODE;
  if (error instanceof AriadneRuntimeError) return ARIADNE_RUNTIME_EXIT_CODE;
  if (error instanceof AriadneStateError) return ARIADNE_STATE_EXIT_CODE;
  if (error instanceof AriadneCancelledError) return 130;
  return ARIADNE_RUNTIME_EXIT_CODE;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function ariadneExitCode(outcome: AriadneRunOutcome): number {
  return ARIADNE_EXIT_CODES[outcome];
}

export function ariadneDoctorExitCode(
  report: ReturnType<typeof buildAriadneDoctor>,
): number {
  if (!report.issues.some((issue) => issue.severity === "error")) return 0;
  if (
    report.issues.some(
      (issue) =>
        issue.severity === "error" && issue.code.startsWith("runtime_"),
    )
  ) {
    return ARIADNE_RUNTIME_EXIT_CODE;
  }
  return ARIADNE_STATE_EXIT_CODE;
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
    const store = deps.createStore(projectRoot);
    if (command.kind !== "status" && command.kind !== "doctor") {
      store.assertNoOwnershipViolation();
    }
    if (command.kind === "init") {
      assertPersistedOwnership({
        store,
        git: deps.createGit(projectRoot),
        now: deps.now,
      });
      const interactive = deps.isInteractive() && !command.json;
      const report = await deps.initialize({
        cwd: projectRoot,
        runtime: command.runtime,
        qualityChecks: command.qualityChecks,
        interactive,
      });
      deps.write(
        command.json
          ? JSON.stringify(report, null, 2)
          : report.outcome === "cancelled"
            ? "Ariadne initialization cancelled."
            : "Ariadne initialized.",
      );
      return report.outcome === "cancelled" ? 130 : 0;
    }

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
      return ariadneDoctorExitCode(report);
    }

    assertPersistedOwnership({ store, git, now: deps.now });
    const selectionCertification = store.hasCanonicalState()
      ? captureOwnershipCertification({
          store,
          git,
          runId: "runtime-selection",
          storyId: "runtime-selection",
        })
      : undefined;

    const config = store.loadConfig();
    const interactive = deps.isInteractive() && !command.json;
    const selection = await deps.selectRuntime({
      explicit: command.runtime,
      configured: config.runtime,
      globalPreferred: deps.globalPreferredRuntime(),
      interactive,
      ...(interactive ? { choose: deps.chooseRuntime } : {}),
      registry,
    });
    const result = await deps.runLoop(
      {
        runtime: selection.name,
        ...(selection.source === "interactive"
          ? { persistRuntimeSelection: true }
          : {}),
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
        detection: selection.detection,
        ...(selectionCertification ? { selectionCertification } : {}),
        acquireLock: deps.acquireLock,
        runProcess: deps.runProcess,
        runChecks: deps.runChecks,
        now: deps.now,
        createRunId: deps.createRunId,
      },
    );
    deps.write(
      command.json ? JSON.stringify(result, null, 2) : formatAriadneRun(result),
    );
    return command.dryRun ? 0 : ariadneExitCode(result.outcome);
  } catch (error) {
    console.error(errorMessage(error));
    return errorExitCode(error);
  }
}
