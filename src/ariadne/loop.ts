import fs from "node:fs";
import path from "node:path";
import type { runQualityChecks } from "./checks.js";
import type { AriadneGit } from "./git.js";
import type { AriadneLockHandle, acquireProjectLock } from "./lock.js";
import type { runAgentProcess } from "./process.js";
import { buildIterationPrompt } from "./prompt.js";
import { formatProgressEntry, readAgentResult } from "./result.js";
import type { AriadneRuntimeAdapter } from "./runtimes/types.js";
import { assertRunnableConfig } from "./schema.js";
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
  story.status = blocked ? "blocked" : "in_progress";
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

function inspectDryRun(
  options: AriadneRunOptions,
  deps: AriadneLoopDeps,
): AriadneRunSummary {
  deps.store.loadConfig();
  const prd = deps.store.loadPrd();
  const active = selectStory(prd);
  deps.git.assertReady(
    prd.branchName,
    prd.userStories.some((story) => story.status === "in_progress"),
  );
  return summary({
    options,
    outcome: active ? "incomplete" : "complete",
    iterations: 0,
    completedStoryIds: [],
    ...(active ? { activeStoryId: active.id } : {}),
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
  const startedAt = deps.now().getTime();
  const priorFailures = new Map<string, AttemptFailure>();

  const runtimeBudgetReached = () =>
    options.maxRuntimeMs !== undefined &&
    deps.now().getTime() - startedAt >= options.maxRuntimeMs;

  const activeStoryId = () => {
    const prd = deps.store.loadPrd();
    return selectStory(prd)?.id;
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
      ...(lastRunId ? { lastRunId } : {}),
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
    return result;
  };

  for (;;) {
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
      const hasActiveStory = prd.userStories.some(
        (story) => story.status === "in_progress",
      );
      deps.git.assertReady(prd.branchName, hasActiveStory);

      const activeStory = selectStory(prd);
      if (!activeStory) {
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
        return summary({
          options,
          outcome: "complete",
          iterations,
          completedStoryIds,
          ...(lastRunId ? { lastRunId } : {}),
          ...(commit ? { commit } : {}),
        });
      }

      if (runtimeBudgetReached()) {
        return stop("budget_exhausted", "max_runtime", runId, activeStory.id);
      }

      const continuedStory = activeStory.status === "in_progress";
      activeStory.status = "in_progress";
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
      const attempt = activeStory.attempts + 1;
      deps.store.writeRunJson(runId, "attempt.json", {
        schemaVersion: 1,
        runId,
        storyId: activeStory.id,
        runtime: options.runtime,
        attempt,
        startedAt: deps.now().toISOString(),
      });

      const invocation = deps.adapter.buildInvocation({
        runId,
        projectRoot: deps.store.projectRoot,
        promptPath,
        relativePromptPath: path.relative(deps.store.projectRoot, promptPath),
      });
      activeStory.attempts = attempt;
      deps.store.savePrd(prd);
      iterations += 1;
      lastRunId = runId;
      const remainingRuntime =
        options.maxRuntimeMs === undefined
          ? undefined
          : Math.max(
              1,
              options.maxRuntimeMs - (deps.now().getTime() - startedAt),
            );
      let processResult: Awaited<ReturnType<typeof deps.runProcess>>;
      try {
        processResult = await deps.runProcess(invocation, {
          stdoutPath: path.join(runDir, "runtime.stdout.log"),
          stderrPath: path.join(runDir, "runtime.stderr.log"),
          ...(remainingRuntime === undefined
            ? {}
            : { timeoutMs: remainingRuntime }),
        });
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
      deps.store.writeRunJson(runId, "process.json", processResult);

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
        deps.store.writeRunJson(runId, "failure.json", failure);
        deps.store.appendProgress(
          formatFailureProgress({
            failure,
            storyId: activeStory.id,
            runtime: options.runtime,
          }),
        );
        return stop("interrupted", "signal", runId, activeStory.id);
      }
      if (processResult.aborted) {
        const failure: AttemptFailure = {
          runId,
          category: "process",
          message: "Ariadne runtime was cancelled",
          timestamp: deps.now().toISOString(),
        };
        deps.store.writeRunJson(runId, "failure.json", failure);
        deps.store.appendProgress(
          formatFailureProgress({
            failure,
            storyId: activeStory.id,
            runtime: options.runtime,
          }),
        );
        return stop("interrupted", "cancelled", runId, activeStory.id);
      }
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

      let runtimeOutcome: ReturnType<AriadneRuntimeAdapter["interpretResult"]>;
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
      if (result.outcome !== "completed") {
        const category = result.criteria.some((criterion) => !criterion.passed)
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

      let checks: Awaited<ReturnType<typeof deps.runChecks>>;
      try {
        checks = await deps.runChecks({
          commands: config.qualityChecks,
          projectRoot: deps.store.projectRoot,
          runDir,
          runProcess: deps.runProcess,
        });
      } catch (error) {
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
      deps.store.writeRunJson(runId, "checks.json", checks);
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

      activeStory.status = "completed";
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
      deps.git.stageAll();
      try {
        commit = deps.git.commit(activeStory);
      } catch (error) {
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
}
