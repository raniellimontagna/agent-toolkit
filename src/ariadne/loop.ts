import fs from "node:fs";
import path from "node:path";
import type { QualityCheckResult, runQualityChecks } from "./checks.js";
import type { AriadneGit } from "./git.js";
import type { AriadneLockHandle, acquireProjectLock } from "./lock.js";
import type { runAgentProcess } from "./process.js";
import { buildIterationPrompt } from "./prompt.js";
import {
  type AgentResult,
  formatProgressEntry,
  readAgentResult,
} from "./result.js";
import type {
  AgentInvocation,
  AriadneRuntimeAdapter,
} from "./runtimes/types.js";
import {
  AriadneStateError,
  assertRunnableConfig,
  assertStoryTransition,
} from "./schema.js";
import type { AriadneStore } from "./store.js";
import type {
  AriadnePrd,
  AriadneRunOptions,
  AriadneRunOutcome,
  AriadneRunSummary,
  AriadneStory,
  AttemptFailure,
} from "./types.js";

export const ARIADNE_EXIT_CODES: Record<AriadneRunOutcome, number> = {
  complete: 0,
  incomplete: 1,
  blocked: 1,
  budget_exhausted: 1,
  interrupted: 130,
  structural_error: 4,
};

export type AriadneLoopDeps = {
  store: AriadneStore;
  git: AriadneGit;
  adapter: AriadneRuntimeAdapter;
  acquireLock: typeof acquireProjectLock;
  runProcess: typeof runAgentProcess;
  runChecks: typeof runQualityChecks;
  now: () => Date;
  createRunId: () => string;
};

type SanitizedInvocation = Pick<AgentInvocation, "command" | "args" | "cwd">;

type CanonicalSnapshot = {
  initialHead: string;
  prd: string | null;
  progress: string | null;
};

type AttemptMetadata = {
  runId: string;
  storyId: string;
  attempt: number;
  startedAt: string;
  startedMs: number;
  runtimeVersion?: string;
  initialHead: string;
  invocation: SanitizedInvocation;
  process?: {
    status: number | null;
    signal: NodeJS.Signals | null;
    durationMs: number;
    timedOut: boolean;
    aborted: boolean;
    stdoutPath: string;
    stderrPath: string;
  };
  validatedResult?: {
    outcome: AgentResult["outcome"];
    summary: string;
    filesChanged: string[];
    learnings: string[];
  };
  checks?: Array<
    Pick<
      QualityCheckResult,
      | "command"
      | "status"
      | "signal"
      | "durationMs"
      | "timedOut"
      | "timeoutOrigin"
      | "aborted"
    >
  >;
};

function selectStory(prd: AriadnePrd): AriadneStory | undefined {
  const active = prd.userStories.find(
    (story) => story.status === "in_progress",
  );
  if (active) return active;

  let selected: AriadneStory | undefined;
  for (const story of prd.userStories) {
    if (story.status !== "pending") continue;
    if (!selected || story.priority < selected.priority) selected = story;
  }
  return selected;
}

function transitionStory(
  story: AriadneStory,
  status: AriadneStory["status"],
): void {
  assertStoryTransition(story.status, status);
  story.status = status;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function summary(input: {
  options: AriadneRunOptions;
  outcome: AriadneRunSummary["outcome"];
  iterations: number;
  completedStoryIds: string[];
  activeStoryId?: string;
  blockedStoryId?: string;
  lastRunId?: string;
  commit?: string;
  inspection?: AriadneRunSummary["inspection"];
}): AriadneRunSummary {
  return {
    schemaVersion: 1,
    command: "run",
    outcome: input.outcome,
    runtime: input.options.runtime,
    iterations: input.iterations,
    completedStoryIds: input.completedStoryIds,
    ...(input.activeStoryId ? { activeStoryId: input.activeStoryId } : {}),
    ...(input.blockedStoryId ? { blockedStoryId: input.blockedStoryId } : {}),
    ...(input.lastRunId ? { lastRunId: input.lastRunId } : {}),
    ...(input.commit ? { commit: input.commit } : {}),
    ...(input.inspection ? { inspection: input.inspection } : {}),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatFailureProgress(input: {
  failure: AttemptFailure;
  storyId: string;
  runtime: AriadneRunOptions["runtime"];
}): string {
  return [
    `## ${input.failure.timestamp} — ${input.failure.runId}`,
    "",
    `- story: ${input.storyId}`,
    `- runtime: ${input.runtime}`,
    "- outcome: failed",
    `- failure category: ${input.failure.category}`,
    "",
    "---",
    "",
  ].join("\n");
}

const FAILURE_CATEGORIES = new Set<AttemptFailure["category"]>([
  "process",
  "result",
  "criterion",
  "check",
  "commit",
  "invariant",
]);

function readPriorAttemptFailure(
  store: AriadneStore,
  storyId: string,
): AttemptFailure | undefined {
  let runIds: string[];
  try {
    runIds = fs.readdirSync(store.paths.runs);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }

  const failures: AttemptFailure[] = [];
  for (const runId of runIds) {
    const runDir = path.join(store.paths.runs, runId);
    try {
      if (!fs.lstatSync(runDir).isDirectory()) continue;
      const attempt = JSON.parse(
        fs.readFileSync(path.join(runDir, "attempt.json"), "utf8"),
      ) as Record<string, unknown>;
      const failure = JSON.parse(
        fs.readFileSync(path.join(runDir, "failure.json"), "utf8"),
      ) as Record<string, unknown>;
      if (
        attempt.storyId !== storyId ||
        failure.runId !== runId ||
        typeof failure.category !== "string" ||
        !FAILURE_CATEGORIES.has(
          failure.category as AttemptFailure["category"],
        ) ||
        typeof failure.message !== "string" ||
        failure.message === "" ||
        typeof failure.timestamp !== "string" ||
        Number.isNaN(Date.parse(failure.timestamp))
      ) {
        continue;
      }
      failures.push(failure as AttemptFailure);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      if (error instanceof SyntaxError) continue;
      throw error;
    }
  }
  return failures.sort(
    (left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp),
  )[0];
}

export function recordFailedAttempt(
  prd: AriadnePrd,
  storyId: string,
  failure: AttemptFailure,
  maxAttempts: number,
): { prd: AriadnePrd; blocked: boolean } {
  const story = prd.userStories.find((candidate) => candidate.id === storyId);
  if (!story) {
    throw new Error(
      `Unable to record ${failure.category} failure for missing story ${storyId}`,
    );
  }
  const blocked = story.attempts >= maxAttempts;
  transitionStory(story, blocked ? "blocked" : "in_progress");
  return { prd, blocked };
}

function assertAdapterMatches(
  options: AriadneRunOptions,
  deps: AriadneLoopDeps,
) {
  if (deps.adapter.name !== options.runtime) {
    throw new Error(
      `Ariadne runtime adapter mismatch: expected ${options.runtime}, received ${deps.adapter.name}`,
    );
  }
}

function acquireIterationLock(
  runId: string,
  deps: AriadneLoopDeps,
): AriadneLockHandle {
  return deps.acquireLock({
    lockPath: deps.store.paths.lock,
    runId,
    runDir: path.join(deps.store.paths.runs, runId),
    pid: process.pid,
    now: deps.now,
    isProcessAlive,
  });
}

function readOptionalFile(source: string): string | null {
  try {
    return fs.readFileSync(source, "utf8");
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function sanitizeInvocation(invocation: AgentInvocation): SanitizedInvocation {
  const credential =
    /(?:api[-_]?key|token|password|secret|authorization|credential)/i;
  let redactNext = false;
  const args = invocation.args.map((argument) => {
    if (redactNext) {
      redactNext = false;
      return "[REDACTED]";
    }
    const equals = argument.indexOf("=");
    if (equals > 0 && credential.test(argument.slice(0, equals))) {
      return `${argument.slice(0, equals + 1)}[REDACTED]`;
    }
    if (credential.test(argument) && argument.startsWith("-")) {
      redactNext = true;
    }
    return argument;
  });
  return { command: invocation.command, args, cwd: invocation.cwd };
}

function captureCanonicalSnapshot(deps: AriadneLoopDeps): CanonicalSnapshot {
  return {
    initialHead: deps.git.head(),
    prd: readOptionalFile(deps.store.paths.prd),
    progress: readOptionalFile(deps.store.paths.progress),
  };
}

function assertRuntimeOwnership(
  snapshot: CanonicalSnapshot,
  deps: AriadneLoopDeps,
): void {
  if (deps.git.head() !== snapshot.initialHead) {
    throw new AriadneStateError(
      "$git",
      "Ariadne runtime changed Git HEAD; runtime agents must not commit",
    );
  }
  if (
    readOptionalFile(deps.store.paths.prd) !== snapshot.prd ||
    readOptionalFile(deps.store.paths.progress) !== snapshot.progress
  ) {
    throw new AriadneStateError(
      "$.ariadne",
      "Ariadne runtime edited canonical Ariadne state; only the coordinator may update prd.json or progress.md",
    );
  }
}

function inspectDryRun(
  options: AriadneRunOptions,
  deps: AriadneLoopDeps,
): AriadneRunSummary {
  const config = deps.store.loadConfig();
  const prd = deps.store.loadPrd();
  const blocked = prd.userStories.find((story) => story.status === "blocked");
  const active = blocked ?? selectStory(prd);
  deps.git.assertReady(
    prd.branchName,
    prd.userStories.some(
      (story) => story.status === "in_progress" || story.status === "blocked",
    ),
  );

  const promptPath = path.join(deps.store.paths.runs, "dry-run", "prompt.md");
  const invocation = deps.adapter.buildInvocation({
    runId: "dry-run",
    projectRoot: deps.store.projectRoot,
    promptPath,
    relativePromptPath: path.relative(deps.store.projectRoot, promptPath),
  });
  const detection = deps.adapter.detect();
  const inspection: NonNullable<AriadneRunSummary["inspection"]> = {
    project: {
      root: deps.store.projectRoot,
      name: prd.project,
      branch: prd.branchName,
    },
    selectedStory: active ? { ...active } : null,
    blockedStory: blocked ? { ...blocked } : null,
    promptPath,
    invocation: sanitizeInvocation(invocation),
    runtime: {
      name: detection.name,
      state: detection.state,
      ...(detection.version ? { version: detection.version } : {}),
    },
    checks: [...config.qualityChecks],
    limits: {
      maxAttemptsPerStory: config.maxAttemptsPerStory,
      maxIterations: options.maxIterations ?? null,
      maxRuntimeMs: options.maxRuntimeMs ?? null,
    },
  };
  return summary({
    options,
    outcome: blocked ? "blocked" : active ? "incomplete" : "complete",
    iterations: 0,
    completedStoryIds: [],
    ...(active ? { activeStoryId: active.id } : {}),
    ...(blocked ? { blockedStoryId: blocked.id } : {}),
    inspection,
  });
}

export async function runAriadneLoop(
  options: AriadneRunOptions,
  deps: AriadneLoopDeps,
): Promise<AriadneRunSummary> {
  assertAdapterMatches(options, deps);
  if (options.dryRun) return inspectDryRun(options, deps);

  const completedStoryIds: string[] = [];
  let iterations = 0;
  let lastRunId: string | undefined;
  let commit: string | undefined;
  let currentAttempt: AttemptMetadata | undefined;
  const finalizedAttemptRunIds = new Set<string>();
  const startedAt = deps.now().getTime();
  const priorFailures = new Map<string, AttemptFailure>();
  let parentSignal: "SIGINT" | "SIGTERM" | undefined;
  const onParentSigint = () => {
    parentSignal = "SIGINT";
  };
  const onParentSigterm = () => {
    parentSignal = "SIGTERM";
  };

  const runtimeBudgetReached = () =>
    options.maxRuntimeMs !== undefined &&
    deps.now().getTime() - startedAt >= options.maxRuntimeMs;

  const activeStoryId = () => {
    const prd = deps.store.loadPrd();
    return selectStory(prd)?.id;
  };

  const finishAttempt = (
    outcome:
      | "completed"
      | "failed"
      | "blocked"
      | "interrupted"
      | "budget_exhausted"
      | "structural_error",
    failureCategory?: AttemptFailure["category"],
  ): void => {
    if (!currentAttempt) return;
    const attempt = currentAttempt;
    const finishedAt = deps.now();
    let finalHead: string | undefined;
    try {
      finalHead = deps.git.head();
    } catch {
      // Preserve the original failure if Git itself is no longer readable.
    }
    deps.store.writeRunJson(attempt.runId, "summary.json", {
      schemaVersion: 1,
      runId: attempt.runId,
      storyId: attempt.storyId,
      runtime: options.runtime,
      ...(attempt.runtimeVersion
        ? { runtimeVersion: attempt.runtimeVersion }
        : {}),
      attempt: attempt.attempt,
      invocation: attempt.invocation,
      startedAt: attempt.startedAt,
      finishedAt: finishedAt.toISOString(),
      durationMs: Math.max(0, finishedAt.getTime() - attempt.startedMs),
      outcome,
      ...(failureCategory ? { failureCategory } : {}),
      initialHead: attempt.initialHead,
      ...(finalHead ? { finalHead } : {}),
      ...(attempt.process ? { process: attempt.process } : {}),
      ...(attempt.validatedResult
        ? { validatedResult: attempt.validatedResult }
        : {}),
      ...(attempt.checks ? { checks: attempt.checks } : {}),
    });
    finalizedAttemptRunIds.add(attempt.runId);
    currentAttempt = undefined;
  };

  const finishCoordinatorRun = (
    runId: string,
    storyId: string | undefined,
    outcome: "blocked" | "interrupted" | "budget_exhausted",
    reason: string,
  ): void => {
    const timestamp = deps.now().toISOString();
    let head: string | undefined;
    try {
      head = deps.git.head();
    } catch {
      // The stop record remains useful when Git metadata is unavailable.
    }
    deps.store.writeRunJson(runId, "summary.json", {
      schemaVersion: 1,
      runId,
      ...(storyId ? { storyId } : {}),
      runtime: options.runtime,
      startedAt: timestamp,
      finishedAt: timestamp,
      durationMs: 0,
      outcome,
      reason,
      ...(head ? { initialHead: head, finalHead: head } : {}),
    });
  };

  const stop = (
    outcome: "budget_exhausted" | "interrupted",
    reason: string,
    runId: string | undefined,
    storyId: string | undefined,
  ): AriadneRunSummary => {
    const result = summary({
      options,
      outcome,
      iterations,
      completedStoryIds,
      ...(storyId ? { activeStoryId: storyId } : {}),
      ...((runId ?? lastRunId) ? { lastRunId: runId ?? lastRunId } : {}),
      ...(commit ? { commit } : {}),
    });
    if (runId) {
      deps.store.writeRunJson(runId, "stop.json", {
        schemaVersion: 1,
        outcome,
        reason,
        timestamp: deps.now().toISOString(),
        iterations,
      });
      if (currentAttempt?.runId === runId) finishAttempt(outcome);
      else if (!finalizedAttemptRunIds.has(runId)) {
        finishCoordinatorRun(runId, storyId, outcome, reason);
      }
    }
    return result;
  };

  const failAttempt = (
    prd: AriadnePrd,
    story: AriadneStory,
    failure: AttemptFailure,
    maxAttempts: number,
  ) => {
    const state = recordFailedAttempt(prd, story.id, failure, maxAttempts);
    deps.store.savePrd(state.prd);
    deps.store.writeRunJson(failure.runId, "failure.json", failure);
    deps.store.appendProgress(
      formatFailureProgress({
        failure,
        storyId: story.id,
        runtime: options.runtime,
      }),
    );
    priorFailures.set(story.id, failure);
    finishAttempt(state.blocked ? "blocked" : "failed", failure.category);
    return state.blocked;
  };

  const blockedSummary = (
    storyId: string,
    runId: string,
  ): AriadneRunSummary => {
    const result = summary({
      options,
      outcome: "blocked",
      iterations,
      completedStoryIds,
      activeStoryId: storyId,
      blockedStoryId: storyId,
      lastRunId: runId,
      ...(commit ? { commit } : {}),
    });
    deps.store.writeRunJson(runId, "stop.json", {
      schemaVersion: 1,
      outcome: "blocked",
      reason: "max_attempts",
      timestamp: deps.now().toISOString(),
      iterations,
    });
    finishAttempt("blocked");
    return result;
  };

  const recordTerminalFailure = (
    story: AriadneStory,
    failure: AttemptFailure,
  ) => {
    deps.store.writeRunJson(failure.runId, "failure.json", failure);
    deps.store.appendProgress(
      formatFailureProgress({
        failure,
        storyId: story.id,
        runtime: options.runtime,
      }),
    );
  };

  const rejectOwnershipViolation = (
    error: unknown,
    story: AriadneStory,
    runId: string,
  ): never => {
    const failure: AttemptFailure = {
      runId,
      category: "invariant",
      message: errorMessage(error),
      timestamp: deps.now().toISOString(),
    };
    deps.store.writeRunJson(runId, "failure.json", failure);
    finishAttempt("structural_error", "invariant");
    // Canonical state may be attacker-controlled here, so do not load, save,
    // append, stage, or reset it. Preserve the evidence for manual recovery.
    throw error instanceof AriadneStateError
      ? error
      : new AriadneStateError(`$.userStories[${story.id}]`, failure.message);
  };

  process.on("SIGINT", onParentSigint);
  process.on("SIGTERM", onParentSigterm);
  try {
    for (;;) {
      if (options.signal?.aborted || parentSignal) {
        return stop(
          "interrupted",
          options.signal?.aborted ? "cancelled" : "signal",
          lastRunId,
          activeStoryId(),
        );
      }
      if (
        options.maxIterations !== undefined &&
        iterations >= options.maxIterations
      ) {
        return stop(
          "budget_exhausted",
          "max_iterations",
          lastRunId,
          activeStoryId(),
        );
      }
      if (runtimeBudgetReached()) {
        return stop(
          "budget_exhausted",
          "max_runtime",
          lastRunId,
          activeStoryId(),
        );
      }

      const runId = deps.createRunId();
      const lock = acquireIterationLock(runId, deps);
      try {
        const config = deps.store.loadConfig();
        const prd = deps.store.loadPrd();
        assertRunnableConfig(config);
        const hasPreservedDiff = prd.userStories.some(
          (story) =>
            story.status === "in_progress" || story.status === "blocked",
        );
        deps.git.assertReady(prd.branchName, hasPreservedDiff);

        const blockedStory = prd.userStories.find(
          (story) => story.status === "blocked",
        );
        if (blockedStory) {
          return summary({
            options,
            outcome: "blocked",
            iterations,
            completedStoryIds,
            activeStoryId: blockedStory.id,
            blockedStoryId: blockedStory.id,
            ...(lastRunId ? { lastRunId } : {}),
            ...(commit ? { commit } : {}),
          });
        }

        const activeStory = selectStory(prd);
        if (!activeStory) {
          return summary({
            options,
            outcome: "complete",
            iterations,
            completedStoryIds,
            ...(lastRunId ? { lastRunId } : {}),
            ...(commit ? { commit } : {}),
          });
        }

        if (
          activeStory.status === "in_progress" &&
          activeStory.attempts >= config.maxAttemptsPerStory
        ) {
          transitionStory(activeStory, "blocked");
          deps.store.savePrd(prd);
          deps.store.writeRunJson(runId, "stop.json", {
            schemaVersion: 1,
            outcome: "blocked",
            reason: "max_attempts",
            timestamp: deps.now().toISOString(),
            iterations,
          });
          finishCoordinatorRun(
            runId,
            activeStory.id,
            "blocked",
            "max_attempts",
          );
          return summary({
            options,
            outcome: "blocked",
            iterations,
            completedStoryIds,
            activeStoryId: activeStory.id,
            blockedStoryId: activeStory.id,
            lastRunId: runId,
            ...(commit ? { commit } : {}),
          });
        }

        if (runtimeBudgetReached()) {
          return stop("budget_exhausted", "max_runtime", runId, activeStory.id);
        }
        if (options.signal?.aborted || parentSignal) {
          return stop(
            "interrupted",
            options.signal?.aborted ? "cancelled" : "signal",
            runId,
            activeStory.id,
          );
        }

        if (
          options.persistRuntimeSelection &&
          config.runtime !== options.runtime
        ) {
          config.runtime = options.runtime;
          deps.store.saveConfig(config);
        }

        const continuedStory = activeStory.status === "in_progress";
        transitionStory(activeStory, "in_progress");
        deps.store.savePrd(prd);

        const runDir = deps.store.createRunDir(runId);
        const promptPath = path.join(runDir, "prompt.md");
        const resultPath = path.join(runDir, "result.json");
        const priorFailure =
          priorFailures.get(activeStory.id) ??
          readPriorAttemptFailure(deps.store, activeStory.id);
        const prompt = buildIterationPrompt({
          runId,
          story: activeStory,
          projectRoot: deps.store.projectRoot,
          resultPath,
          qualityChecks: config.qualityChecks,
          ...(priorFailure ? { priorFailure: priorFailure.message } : {}),
          hasExistingDiff: continuedStory,
        });
        fs.writeFileSync(promptPath, prompt, "utf8");
        const invocation = deps.adapter.buildInvocation({
          runId,
          projectRoot: deps.store.projectRoot,
          promptPath,
          relativePromptPath: path.relative(deps.store.projectRoot, promptPath),
        });
        const detection = deps.adapter.detect();
        const attempt = activeStory.attempts + 1;
        activeStory.attempts = attempt;
        deps.store.savePrd(prd);
        const canonicalSnapshot = captureCanonicalSnapshot(deps);
        const attemptStartedAt = deps.now();
        currentAttempt = {
          runId,
          storyId: activeStory.id,
          attempt,
          startedAt: attemptStartedAt.toISOString(),
          startedMs: attemptStartedAt.getTime(),
          ...(detection.version ? { runtimeVersion: detection.version } : {}),
          initialHead: canonicalSnapshot.initialHead,
          invocation: sanitizeInvocation(invocation),
        };
        deps.store.writeRunJson(runId, "attempt.json", {
          schemaVersion: 1,
          runId,
          storyId: activeStory.id,
          runtime: options.runtime,
          ...(detection.version ? { runtimeVersion: detection.version } : {}),
          attempt,
          startedAt: attemptStartedAt.toISOString(),
          initialHead: canonicalSnapshot.initialHead,
          invocation: currentAttempt.invocation,
        });

        iterations += 1;
        lastRunId = runId;
        const remainingRuntime =
          options.maxRuntimeMs === undefined
            ? undefined
            : Math.max(
                1,
                options.maxRuntimeMs - (deps.now().getTime() - startedAt),
              );
        const processPaths = {
          stdoutPath: path.join(runDir, "runtime.stdout.log"),
          stderrPath: path.join(runDir, "runtime.stderr.log"),
        };
        let processResult: Awaited<ReturnType<typeof deps.runProcess>>;
        try {
          processResult = await deps.runProcess(invocation, {
            ...processPaths,
            ...(remainingRuntime === undefined
              ? {}
              : { timeoutMs: remainingRuntime }),
            ...(options.signal ? { signal: options.signal } : {}),
          });
          try {
            assertRuntimeOwnership(canonicalSnapshot, deps);
          } catch (error) {
            rejectOwnershipViolation(error, activeStory, runId);
          }
        } catch (error) {
          try {
            assertRuntimeOwnership(canonicalSnapshot, deps);
          } catch (ownershipError) {
            rejectOwnershipViolation(ownershipError, activeStory, runId);
          }
          if (options.signal?.aborted || parentSignal) {
            return stop(
              "interrupted",
              options.signal?.aborted ? "cancelled" : "signal",
              runId,
              activeStory.id,
            );
          }
          if (runtimeBudgetReached()) {
            return stop(
              "budget_exhausted",
              "max_runtime",
              runId,
              activeStory.id,
            );
          }
          const failure: AttemptFailure = {
            runId,
            category: "process",
            message: errorMessage(error),
            timestamp: deps.now().toISOString(),
          };
          if (
            failAttempt(prd, activeStory, failure, config.maxAttemptsPerStory)
          ) {
            return blockedSummary(activeStory.id, runId);
          }
          continue;
        }
        currentAttempt.process = {
          status: processResult.status,
          signal: processResult.signal,
          durationMs: processResult.durationMs,
          timedOut: processResult.timedOut,
          aborted: processResult.aborted,
          ...processPaths,
        };
        deps.store.writeRunJson(runId, "process.json", processResult);

        if (processResult.timedOut && options.maxRuntimeMs !== undefined) {
          const failure: AttemptFailure = {
            runId,
            category: "process",
            message: "Ariadne runtime budget expired during the agent process",
            timestamp: deps.now().toISOString(),
          };
          failAttempt(prd, activeStory, failure, config.maxAttemptsPerStory);
          return stop("budget_exhausted", "max_runtime", runId, activeStory.id);
        }
        if (processResult.aborted || options.signal?.aborted) {
          const failure: AttemptFailure = {
            runId,
            category: "process",
            message: "Ariadne runtime was cancelled",
            timestamp: deps.now().toISOString(),
          };
          recordTerminalFailure(activeStory, failure);
          return stop("interrupted", "cancelled", runId, activeStory.id);
        }
        if (parentSignal) {
          const failure: AttemptFailure = {
            runId,
            category: "process",
            message: `Ariadne runtime was interrupted by parent ${parentSignal}`,
            timestamp: deps.now().toISOString(),
          };
          recordTerminalFailure(activeStory, failure);
          return stop("interrupted", "signal", runId, activeStory.id);
        }
        if (
          processResult.signal === "SIGINT" ||
          processResult.signal === "SIGTERM"
        ) {
          const failure: AttemptFailure = {
            runId,
            category: "process",
            message: `Ariadne runtime was interrupted by ${processResult.signal}`,
            timestamp: deps.now().toISOString(),
          };
          recordTerminalFailure(activeStory, failure);
          return stop("interrupted", "signal", runId, activeStory.id);
        }

        let runtimeOutcome: ReturnType<
          AriadneRuntimeAdapter["interpretResult"]
        >;
        try {
          runtimeOutcome = deps.adapter.interpretResult(processResult);
        } catch (error) {
          const failure: AttemptFailure = {
            runId,
            category: "process",
            message: errorMessage(error),
            timestamp: deps.now().toISOString(),
          };
          if (
            failAttempt(prd, activeStory, failure, config.maxAttemptsPerStory)
          ) {
            return blockedSummary(activeStory.id, runId);
          }
          continue;
        }
        if (!runtimeOutcome.ok) {
          const failure: AttemptFailure = {
            runId,
            category: "process",
            message:
              runtimeOutcome.reason ??
              `Ariadne runtime exited with status ${runtimeOutcome.status}`,
            timestamp: deps.now().toISOString(),
          };
          if (
            failAttempt(prd, activeStory, failure, config.maxAttemptsPerStory)
          ) {
            return blockedSummary(activeStory.id, runId);
          }
          continue;
        }

        let result: ReturnType<typeof readAgentResult>;
        try {
          result = readAgentResult(resultPath, {
            runId,
            storyId: activeStory.id,
            acceptanceCriteria: activeStory.acceptanceCriteria,
            projectRoot: deps.store.projectRoot,
          });
        } catch (error) {
          const failure: AttemptFailure = {
            runId,
            category: "result",
            message: errorMessage(error),
            timestamp: deps.now().toISOString(),
          };
          if (
            failAttempt(prd, activeStory, failure, config.maxAttemptsPerStory)
          ) {
            return blockedSummary(activeStory.id, runId);
          }
          continue;
        }
        currentAttempt.validatedResult = {
          outcome: result.outcome,
          summary: result.summary,
          filesChanged: [...result.filesChanged],
          learnings: [...result.learnings],
        };
        if (result.outcome !== "completed") {
          const category = result.criteria.some(
            (criterion) => !criterion.passed,
          )
            ? "criterion"
            : "result";
          const failure: AttemptFailure = {
            runId,
            category,
            message:
              result.failureReason ??
              `Ariadne runtime did not complete ${activeStory.id}`,
            timestamp: deps.now().toISOString(),
          };
          if (
            failAttempt(prd, activeStory, failure, config.maxAttemptsPerStory)
          ) {
            return blockedSummary(activeStory.id, runId);
          }
          continue;
        }

        if (runtimeBudgetReached()) {
          return stop("budget_exhausted", "max_runtime", runId, activeStory.id);
        }
        if (options.signal?.aborted || parentSignal) {
          return stop(
            "interrupted",
            options.signal?.aborted ? "cancelled" : "signal",
            runId,
            activeStory.id,
          );
        }

        let checks: Awaited<ReturnType<typeof deps.runChecks>>;
        const remainingCheckRuntime =
          options.maxRuntimeMs === undefined
            ? undefined
            : Math.max(
                1,
                options.maxRuntimeMs - (deps.now().getTime() - startedAt),
              );
        try {
          checks = await deps.runChecks({
            commands: config.qualityChecks,
            projectRoot: deps.store.projectRoot,
            runDir,
            runProcess: deps.runProcess,
            ...(options.signal ? { signal: options.signal } : {}),
            ...(remainingCheckRuntime === undefined
              ? {}
              : { timeoutMs: remainingCheckRuntime }),
          });
          try {
            assertRuntimeOwnership(canonicalSnapshot, deps);
          } catch (error) {
            rejectOwnershipViolation(error, activeStory, runId);
          }
        } catch (error) {
          try {
            assertRuntimeOwnership(canonicalSnapshot, deps);
          } catch (ownershipError) {
            rejectOwnershipViolation(ownershipError, activeStory, runId);
          }
          if (options.signal?.aborted || parentSignal) {
            return stop(
              "interrupted",
              options.signal?.aborted ? "cancelled" : "signal",
              runId,
              activeStory.id,
            );
          }
          if (runtimeBudgetReached()) {
            return stop(
              "budget_exhausted",
              "max_runtime",
              runId,
              activeStory.id,
            );
          }
          const failure: AttemptFailure = {
            runId,
            category: "check",
            message: errorMessage(error),
            timestamp: deps.now().toISOString(),
          };
          if (
            failAttempt(prd, activeStory, failure, config.maxAttemptsPerStory)
          ) {
            return blockedSummary(activeStory.id, runId);
          }
          continue;
        }
        currentAttempt.checks = checks.map((check) => ({
          command: check.command,
          status: check.status,
          signal: check.signal,
          durationMs: check.durationMs,
          timedOut: check.timedOut,
          timeoutOrigin: check.timeoutOrigin,
          aborted: check.aborted,
        }));
        deps.store.writeRunJson(runId, "checks.json", checks);
        const timedOutCheck = checks.find((check) => check.timedOut);
        if (timedOutCheck?.timeoutOrigin === "global_budget") {
          const failure: AttemptFailure = {
            runId,
            category: "check",
            message: `Ariadne runtime budget expired during quality check: ${timedOutCheck.command}`,
            timestamp: deps.now().toISOString(),
          };
          failAttempt(prd, activeStory, failure, config.maxAttemptsPerStory);
          return stop("budget_exhausted", "max_runtime", runId, activeStory.id);
        }
        if (timedOutCheck) {
          const failure: AttemptFailure = {
            runId,
            category: "check",
            message: `Ariadne quality check timed out: ${timedOutCheck.command}`,
            timestamp: deps.now().toISOString(),
          };
          if (
            failAttempt(prd, activeStory, failure, config.maxAttemptsPerStory)
          ) {
            return blockedSummary(activeStory.id, runId);
          }
          continue;
        }
        const abortedCheck = checks.find((check) => check.aborted);
        if (abortedCheck || options.signal?.aborted) {
          const failure: AttemptFailure = {
            runId,
            category: "check",
            message: `Ariadne quality check was cancelled: ${abortedCheck?.command ?? "external cancellation"}`,
            timestamp: deps.now().toISOString(),
          };
          recordTerminalFailure(activeStory, failure);
          return stop("interrupted", "cancelled", runId, activeStory.id);
        }
        const interruptedCheck = checks.find(
          (check) => check.signal === "SIGINT" || check.signal === "SIGTERM",
        );
        if (parentSignal || interruptedCheck) {
          const failure: AttemptFailure = {
            runId,
            category: "check",
            message: `Ariadne quality checks were interrupted by ${parentSignal ?? interruptedCheck?.signal}`,
            timestamp: deps.now().toISOString(),
          };
          recordTerminalFailure(activeStory, failure);
          return stop("interrupted", "signal", runId, activeStory.id);
        }
        if (runtimeBudgetReached()) {
          return stop("budget_exhausted", "max_runtime", runId, activeStory.id);
        }
        if (checks.length !== config.qualityChecks.length) {
          const failure: AttemptFailure = {
            runId,
            category: "check",
            message: `Ariadne quality checks did not all run for ${activeStory.id}`,
            timestamp: deps.now().toISOString(),
          };
          if (
            failAttempt(prd, activeStory, failure, config.maxAttemptsPerStory)
          ) {
            return blockedSummary(activeStory.id, runId);
          }
          continue;
        }
        const failedCheck = checks.find((check) => check.status !== 0);
        if (failedCheck) {
          const failure: AttemptFailure = {
            runId,
            category: "check",
            message: `Ariadne quality check failed: ${failedCheck.command}`,
            timestamp: deps.now().toISOString(),
          };
          if (
            failAttempt(prd, activeStory, failure, config.maxAttemptsPerStory)
          ) {
            return blockedSummary(activeStory.id, runId);
          }
          continue;
        }

        try {
          assertRuntimeOwnership(canonicalSnapshot, deps);
        } catch (error) {
          rejectOwnershipViolation(error, activeStory, runId);
        }
        transitionStory(activeStory, "completed");
        deps.store.savePrd(prd);
        deps.store.appendProgress(
          formatProgressEntry({
            timestamp: deps.now().toISOString(),
            runId,
            story: activeStory,
            runtime: options.runtime,
            result,
            checks,
          }),
        );
        try {
          deps.git.stageAll();
          commit = deps.git.commit(activeStory);
          finishAttempt("completed");
        } catch (error) {
          // Commit failure is the sole recovery transition from completed back
          // to in-progress; the completed state was never durably certified.
          activeStory.status = "in_progress";
          deps.store.savePrd(prd);
          deps.store.appendProgress(
            formatProgressEntry({
              timestamp: deps.now().toISOString(),
              runId,
              story: activeStory,
              runtime: options.runtime,
              result,
              checks,
              failureCategory: "commit_failure",
            }),
          );
          const failure: AttemptFailure = {
            runId,
            category: "commit",
            message: errorMessage(error),
            timestamp: deps.now().toISOString(),
          };
          deps.store.writeRunJson(runId, "failure.json", failure);
          finishAttempt("failed", "commit");
          throw error;
        }
        completedStoryIds.push(activeStory.id);

        if (!selectStory(prd)) {
          return summary({
            options,
            outcome: "complete",
            iterations,
            completedStoryIds,
            lastRunId,
            commit,
          });
        }
      } finally {
        lock.release();
      }
    }
  } finally {
    process.removeListener("SIGINT", onParentSigint);
    process.removeListener("SIGTERM", onParentSigterm);
  }
}
