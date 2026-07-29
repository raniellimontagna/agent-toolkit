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
  AriadneRunSummary,
  AriadneStory,
} from "./types.js";

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
    ...(input.lastRunId ? { lastRunId: input.lastRunId } : {}),
    ...(input.commit ? { commit: input.commit } : {}),
  };
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

  for (;;) {
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
        return summary({
          options,
          outcome: "complete",
          iterations,
          completedStoryIds,
          ...(lastRunId ? { lastRunId } : {}),
          ...(commit ? { commit } : {}),
        });
      }

      const continuedStory = activeStory.status === "in_progress";
      activeStory.status = "in_progress";
      activeStory.attempts += 1;
      deps.store.savePrd(prd);
      iterations += 1;
      lastRunId = runId;

      const runDir = deps.store.createRunDir(runId);
      const promptPath = path.join(runDir, "prompt.md");
      const resultPath = path.join(runDir, "result.json");
      const prompt = buildIterationPrompt({
        runId,
        story: activeStory,
        projectRoot: deps.store.projectRoot,
        resultPath,
        qualityChecks: config.qualityChecks,
        hasExistingDiff: continuedStory,
      });
      fs.writeFileSync(promptPath, prompt, "utf8");
      deps.store.writeRunJson(runId, "attempt.json", {
        schemaVersion: 1,
        runId,
        storyId: activeStory.id,
        runtime: options.runtime,
        attempt: activeStory.attempts,
        startedAt: deps.now().toISOString(),
      });

      const invocation = deps.adapter.buildInvocation({
        runId,
        projectRoot: deps.store.projectRoot,
        promptPath,
        relativePromptPath: path.relative(deps.store.projectRoot, promptPath),
      });
      const processResult = await deps.runProcess(invocation, {
        stdoutPath: path.join(runDir, "runtime.stdout.log"),
        stderrPath: path.join(runDir, "runtime.stderr.log"),
      });
      deps.store.writeRunJson(runId, "process.json", processResult);
      const runtimeOutcome = deps.adapter.interpretResult(processResult);
      if (!runtimeOutcome.ok) {
        throw new Error(
          runtimeOutcome.reason ??
            `Ariadne runtime exited with status ${runtimeOutcome.status}`,
        );
      }

      const result = readAgentResult(resultPath, {
        runId,
        storyId: activeStory.id,
        acceptanceCriteria: activeStory.acceptanceCriteria,
        projectRoot: deps.store.projectRoot,
      });
      if (result.outcome !== "completed") {
        throw new Error(
          result.failureReason ??
            `Ariadne runtime did not complete ${activeStory.id}`,
        );
      }

      const checks = await deps.runChecks({
        commands: config.qualityChecks,
        projectRoot: deps.store.projectRoot,
        runDir,
        runProcess: deps.runProcess,
      });
      deps.store.writeRunJson(runId, "checks.json", checks);
      if (checks.length !== config.qualityChecks.length) {
        throw new Error(
          `Ariadne quality checks did not all run for ${activeStory.id}`,
        );
      }
      const failedCheck = checks.find((check) => check.status !== 0);
      if (failedCheck) {
        throw new Error(`Ariadne quality check failed: ${failedCheck.command}`);
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
