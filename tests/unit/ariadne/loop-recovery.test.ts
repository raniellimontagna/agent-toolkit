import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { QualityCheckResult } from "../../../src/ariadne/checks.js";
import type { AriadneGit } from "../../../src/ariadne/git.js";
import type { AriadneLoopDeps } from "../../../src/ariadne/loop.js";
import {
  ARIADNE_EXIT_CODES,
  runAriadneLoop,
} from "../../../src/ariadne/loop.js";
import type { ProcessResult } from "../../../src/ariadne/process.js";
import type {
  AgentInvocation,
  AriadneRuntimeAdapter,
  IterationContext,
} from "../../../src/ariadne/runtimes/types.js";
import { AriadneStore } from "../../../src/ariadne/store.js";
import type { AriadneStory } from "../../../src/ariadne/types.js";

const directories: string[] = [];

type FailureMode =
  | "success"
  | "process"
  | "process_reject"
  | "missing_result"
  | "false_criterion"
  | "check"
  | "check_timeout"
  | "check_local_timeout"
  | "check_cancelled"
  | "sigint"
  | "timeout_sigterm"
  | "cancelled_sigterm"
  | "cancelled";

function story(
  status: AriadneStory["status"] = "pending",
  attempts = 0,
): AriadneStory {
  return {
    id: "US-008",
    title: "Recover iterations",
    description: "Keep useful work while retrying failures.",
    acceptanceCriteria: ["Recovery is deterministic"],
    priority: 1,
    status,
    attempts,
  };
}

function processResult(overrides: Partial<ProcessResult> = {}): ProcessResult {
  return {
    status: 0,
    signal: null,
    stdout: "",
    stderr: "",
    startedAt: "2026-07-29T00:00:00.000Z",
    finishedAt: "2026-07-29T00:00:00.010Z",
    durationMs: 10,
    timedOut: false,
    aborted: false,
    ...overrides,
  };
}

type Harness = {
  root: string;
  store: AriadneStore;
  deps: AriadneLoopDeps;
  prompts: string[];
  processStarts: number;
  readyDiffFlags: boolean[];
  commits: number;
  setNow(value: number): void;
};

function createHarness(
  modes: FailureMode[],
  initialStory: AriadneStory | AriadneStory[] = story(),
  acquire?: AriadneLoopDeps["acquireLock"],
): Harness {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ariadne-recovery-"));
  directories.push(root);
  const store = new AriadneStore(root);
  store.saveConfig({
    schemaVersion: 1,
    runtime: "codex",
    qualityChecks: ["pnpm test"],
    maxAttemptsPerStory: 3,
  });
  store.savePrd({
    schemaVersion: 1,
    project: "Recovery fixture",
    branchName: "main",
    description: "Exercise deterministic recovery.",
    userStories: Array.isArray(initialStory) ? initialStory : [initialStory],
  });
  fs.writeFileSync(path.join(root, "kept.diff"), "preserve me\n", "utf8");

  const prompts: string[] = [];
  const readyDiffFlags: boolean[] = [];
  let processStarts = 0;
  let commits = 0;
  let runNumber = 0;
  let nowMs = Date.parse("2026-07-29T00:00:00.000Z");

  const git = {
    assertReady(_branch: string, allowActiveDiff: boolean) {
      readyDiffFlags.push(allowActiveDiff);
    },
    stageAll() {},
    commit() {
      commits += 1;
      return "commit-head";
    },
  } as unknown as AriadneGit;

  const adapter: AriadneRuntimeAdapter = {
    name: "codex",
    command: "fake-codex",
    detect: () => ({
      name: "codex",
      state: "healthy",
      reason: "fake adapter",
    }),
    buildInvocation(context: IterationContext): AgentInvocation {
      prompts.push(fs.readFileSync(context.promptPath, "utf8"));
      return {
        command: "fake-codex",
        args: [context.promptPath],
        cwd: root,
        env: {},
      };
    },
    interpretResult(result) {
      return {
        ok: result.status === 0,
        status: result.status,
        ...(result.status === 0 ? {} : { reason: "fake process failed" }),
      };
    },
  };

  const deps: AriadneLoopDeps = {
    store,
    git,
    adapter,
    acquireLock:
      acquire ??
      ((input) => ({
        record: {
          schemaVersion: 1,
          pid: input.pid,
          startedAt: input.now().toISOString(),
          runId: input.runId,
        },
        release() {},
      })),
    async runProcess(invocation) {
      processStarts += 1;
      const mode = modes[processStarts - 1] ?? modes.at(-1) ?? "success";
      const runDir = path.dirname(invocation.args[0] as string);
      const runId = path.basename(runDir);
      const active = store.loadPrd().userStories[0];
      if (!active) throw new Error("missing fixture story");

      if (mode !== "missing_result" && mode !== "process") {
        const failedCriterion = mode === "false_criterion";
        fs.writeFileSync(
          path.join(runDir, "result.json"),
          `${JSON.stringify({
            schemaVersion: 1,
            runId,
            storyId: active.id,
            outcome: failedCriterion ? "failed" : "completed",
            criteria: active.acceptanceCriteria.map((criterion) => ({
              criterion,
              passed: !failedCriterion,
              evidence: failedCriterion ? "criterion failed" : "passed",
            })),
            summary: failedCriterion ? "Needs repair." : "Completed.",
            filesChanged: ["kept.diff"],
            checksAttempted: ["pnpm test"],
            learnings: [],
            ...(failedCriterion
              ? { failureReason: "Acceptance criterion was false." }
              : {}),
          })}\n`,
          "utf8",
        );
      }
      if (mode === "process") return processResult({ status: 9 });
      if (mode === "process_reject")
        throw new Error("fake child failed to spawn");
      if (mode === "sigint")
        return processResult({ status: null, signal: "SIGINT" });
      if (mode === "timeout_sigterm")
        return processResult({
          status: null,
          signal: "SIGTERM",
          timedOut: true,
        });
      if (mode === "cancelled_sigterm")
        return processResult({
          status: null,
          signal: "SIGTERM",
          aborted: true,
        });
      if (mode === "cancelled")
        return processResult({ status: null, aborted: true });
      return processResult();
    },
    async runChecks(input) {
      const mode = modes[processStarts - 1] ?? modes.at(-1) ?? "success";
      const checks: QualityCheckResult[] = input.commands.map((command) => ({
        command,
        status: mode === "check" ? 1 : mode.startsWith("check_") ? null : 0,
        signal: mode.startsWith("check_") ? "SIGKILL" : null,
        durationMs: 5,
        timedOut: mode === "check_timeout" || mode === "check_local_timeout",
        timeoutOrigin:
          mode === "check_timeout"
            ? "global_budget"
            : mode === "check_local_timeout"
              ? "quality_check"
              : null,
        aborted: mode === "check_cancelled",
        stdoutPath: path.join(input.runDir, "check.stdout.log"),
        stderrPath: path.join(input.runDir, "check.stderr.log"),
      }));
      return checks;
    },
    now: () => new Date(nowMs),
    createRunId: () => `run-${++runNumber}`,
  };

  return {
    root,
    store,
    deps,
    prompts,
    get processStarts() {
      return processStarts;
    },
    readyDiffFlags,
    get commits() {
      return commits;
    },
    setNow(value: number) {
      nowMs = value;
    },
  };
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("runAriadneLoop recovery", () => {
  it("restores the prior failure summary after a coordinator restart", async () => {
    const harness = createHarness(["success"], story("in_progress", 1));
    harness.store.writeRunJson("previous-run", "attempt.json", {
      schemaVersion: 1,
      runId: "previous-run",
      storyId: "US-008",
      runtime: "codex",
      attempt: 1,
      startedAt: "2026-07-28T23:59:00.000Z",
    });
    harness.store.writeRunJson("previous-run", "failure.json", {
      runId: "previous-run",
      category: "check",
      message: "Previous typecheck failed.",
      timestamp: "2026-07-28T23:59:30.000Z",
    });

    const result = await runAriadneLoop(
      { runtime: "codex", dryRun: false },
      harness.deps,
    );

    expect(result.outcome).toBe("complete");
    expect(harness.prompts[0]).toContain("## Prior failure");
    expect(harness.prompts[0]).toContain("Previous typecheck failed.");
  });

  it.each([
    ["process", "process", "fake process failed"],
    ["process_reject", "process", "fake child failed to spawn"],
    ["missing_result", "result", "Unable to read agent result"],
    ["false_criterion", "criterion", "Acceptance criterion was false"],
    ["check", "check", "quality check failed"],
  ] as const)("recovers a %s failure with the same diff and prior summary", async (mode, category, priorMessage) => {
    const harness = createHarness([mode, "success"]);

    const result = await runAriadneLoop(
      { runtime: "codex", dryRun: false },
      harness.deps,
    );

    expect(result.outcome).toBe("complete");
    expect(harness.processStarts).toBe(2);
    expect(harness.store.loadPrd().userStories[0]).toMatchObject({
      status: "completed",
      attempts: 2,
    });
    expect(fs.readFileSync(path.join(harness.root, "kept.diff"), "utf8")).toBe(
      "preserve me\n",
    );
    expect(harness.readyDiffFlags).toEqual([false, true]);
    expect(harness.prompts[1]).toContain("## Prior failure");
    expect(harness.prompts[1]).toContain(priorMessage);
    expect(fs.readFileSync(harness.store.paths.progress, "utf8")).toContain(
      `failure category: ${category}`,
    );
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(harness.store.paths.runs, "run-1", "failure.json"),
          "utf8",
        ),
      ),
    ).toMatchObject({ runId: "run-1", category });
  });

  it("blocks after exactly three failed attempts", async () => {
    const harness = createHarness(["process"]);

    const result = await runAriadneLoop(
      { runtime: "codex", dryRun: false },
      harness.deps,
    );

    expect(result).toMatchObject({
      outcome: "blocked",
      iterations: 3,
      activeStoryId: "US-008",
      blockedStoryId: "US-008",
      lastRunId: "run-3",
    });
    expect(harness.processStarts).toBe(3);
    expect(harness.store.loadPrd().userStories[0]).toMatchObject({
      status: "blocked",
      attempts: 3,
    });
  });

  it("stops at the exact explicit iteration budget and persists the reason", async () => {
    const harness = createHarness(["process"]);

    const result = await runAriadneLoop(
      { runtime: "codex", dryRun: false, maxIterations: 1 },
      harness.deps,
    );

    expect(result).toMatchObject({
      outcome: "budget_exhausted",
      iterations: 1,
      activeStoryId: "US-008",
      lastRunId: "run-1",
    });
    expect(harness.processStarts).toBe(1);
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(harness.store.paths.runs, "run-1", "stop.json"),
          "utf8",
        ),
      ),
    ).toMatchObject({ outcome: "budget_exhausted", reason: "max_iterations" });
  });

  it("stops at the runtime deadline before another iteration", async () => {
    const harness = createHarness(["process"]);
    const originalRunProcess = harness.deps.runProcess;
    harness.deps.runProcess = async (...args) => {
      const result = await originalRunProcess(...args);
      harness.setNow(Date.parse("2026-07-29T00:00:00.100Z"));
      return result;
    };

    const result = await runAriadneLoop(
      { runtime: "codex", dryRun: false, maxRuntimeMs: 100 },
      harness.deps,
    );

    expect(result).toMatchObject({
      outcome: "budget_exhausted",
      iterations: 1,
      activeStoryId: "US-008",
    });
    expect(harness.processStarts).toBe(1);
  });

  it.each([
    ["sigint", "signal"],
    ["cancelled_sigterm", "cancelled"],
    ["cancelled", "cancelled"],
  ] as const)("returns interrupted for %s and preserves active state", async (mode, reason) => {
    const harness = createHarness([mode]);

    const result = await runAriadneLoop(
      { runtime: "codex", dryRun: false },
      harness.deps,
    );

    expect(result).toMatchObject({
      outcome: "interrupted",
      iterations: 1,
      activeStoryId: "US-008",
    });
    expect(harness.store.loadPrd().userStories[0]).toMatchObject({
      status: "in_progress",
      attempts: 1,
    });
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(harness.store.paths.runs, "run-1", "stop.json"),
          "utf8",
        ),
      ),
    ).toMatchObject({ outcome: "interrupted", reason });
  });

  it("classifies a runtime timeout before the SIGTERM used to stop the child", async () => {
    const harness = createHarness(["timeout_sigterm"]);

    const result = await runAriadneLoop(
      { runtime: "codex", dryRun: false, maxRuntimeMs: 100 },
      harness.deps,
    );

    expect(result).toMatchObject({
      outcome: "budget_exhausted",
      iterations: 1,
      lastRunId: "run-1",
    });
    expect(harness.commits).toBe(0);
  });

  it.each([
    ["check_timeout", "budget_exhausted", "max_runtime"],
    ["check_cancelled", "interrupted", "cancelled"],
  ] as const)("propagates %s from quality checks without committing", async (mode, outcome, reason) => {
    const harness = createHarness([mode]);
    let checkInput: Parameters<AriadneLoopDeps["runChecks"]>[0] | undefined;
    const originalRunChecks = harness.deps.runChecks;
    harness.deps.runChecks = async (input) => {
      checkInput = input;
      return originalRunChecks(input);
    };
    const controller = new AbortController();

    const result = await runAriadneLoop(
      {
        runtime: "codex",
        dryRun: false,
        maxRuntimeMs: 100,
        signal: controller.signal,
      },
      harness.deps,
    );

    expect(result).toMatchObject({ outcome, lastRunId: "run-1" });
    expect(checkInput?.timeoutMs).toBeGreaterThan(0);
    expect(checkInput?.timeoutMs).toBeLessThanOrEqual(100);
    expect(checkInput?.signal).toBe(controller.signal);
    expect(harness.commits).toBe(0);
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(harness.store.paths.runs, "run-1", "stop.json"),
          "utf8",
        ),
      ),
    ).toMatchObject({ outcome, reason });
  });

  it.each([
    {
      maxRuntimeMs: undefined,
      scenario: "without a global runtime budget",
    },
    {
      maxRuntimeMs: 31 * 60 * 1_000,
      scenario: "while the global runtime budget still has time",
    },
  ] as const)("retries a local quality-check timeout $scenario", async ({
    maxRuntimeMs,
  }) => {
    const harness = createHarness(["check_local_timeout", "success"]);

    const result = await runAriadneLoop(
      {
        runtime: "codex",
        dryRun: false,
        ...(maxRuntimeMs === undefined ? {} : { maxRuntimeMs }),
      },
      harness.deps,
    );

    expect(result.outcome).toBe("complete");
    expect(harness.processStarts).toBe(2);
    expect(harness.store.loadPrd().userStories[0]).toMatchObject({
      status: "completed",
      attempts: 2,
    });
    expect(harness.commits).toBe(1);
  });

  it.each([
    "SIGINT",
    "SIGTERM",
  ] as const)("treats a parent %s as interrupted even when the child is killed with SIGKILL", async (parentSignal) => {
    const harness = createHarness(["success"]);
    const listenersBefore = new Set(process.listeners(parentSignal));
    harness.deps.runProcess = async () => {
      const loopListener = process
        .listeners(parentSignal)
        .find((listener) => !listenersBefore.has(listener));
      expect(loopListener).toBeDefined();
      loopListener?.(parentSignal);
      return processResult({ status: null, signal: "SIGKILL" });
    };

    const result = await runAriadneLoop(
      { runtime: "codex", dryRun: false },
      harness.deps,
    );

    expect(result).toMatchObject({
      outcome: "interrupted",
      iterations: 1,
      lastRunId: "run-1",
    });
    expect(harness.commits).toBe(0);
  });

  it("archives a stale lock and does not increment when the budget expires before child start", async () => {
    let harness: Harness;
    const acquire: AriadneLoopDeps["acquireLock"] = (input) => {
      fs.mkdirSync(input.runDir, { recursive: true });
      fs.writeFileSync(
        path.join(input.runDir, "recovered-lock-stale.json"),
        JSON.stringify({ runId: "stale-run" }),
      );
      harness.setNow(Date.parse("2026-07-29T00:00:00.100Z"));
      return {
        record: {
          schemaVersion: 1,
          pid: input.pid,
          startedAt: input.now().toISOString(),
          runId: input.runId,
        },
        recovered: {
          schemaVersion: 1,
          pid: 999_999,
          startedAt: "2026-07-28T23:59:00.000Z",
          runId: "stale-run",
        },
        release() {},
      };
    };
    harness = createHarness(["success"], story("in_progress", 1), acquire);

    const result = await runAriadneLoop(
      { runtime: "codex", dryRun: false, maxRuntimeMs: 100 },
      harness.deps,
    );

    expect(result.outcome).toBe("budget_exhausted");
    expect(result.lastRunId).toBe("run-1");
    expect(harness.processStarts).toBe(0);
    expect(harness.store.loadPrd().userStories[0]).toMatchObject({
      status: "in_progress",
      attempts: 1,
    });
    expect(
      fs.existsSync(
        path.join(
          harness.store.paths.runs,
          "run-1",
          "recovered-lock-stale.json",
        ),
      ),
    ).toBe(true);
  });

  it("reports an already-blocked story while preserving its existing diff", async () => {
    const harness = createHarness(["success"], story("blocked", 3));
    harness.deps.git.assertReady = (_branch, allowPreservedDiff) => {
      if (!allowPreservedDiff) throw new Error("working tree is dirty");
    };

    const result = await runAriadneLoop(
      { runtime: "codex", dryRun: false },
      harness.deps,
    );

    expect(result).toMatchObject({
      outcome: "blocked",
      iterations: 0,
      activeStoryId: "US-008",
      blockedStoryId: "US-008",
    });
    expect(harness.processStarts).toBe(0);
  });

  it("does not start a pending story while a blocked story owns the preserved diff", async () => {
    const blocked = story("blocked", 3);
    const pending = {
      ...story("pending", 0),
      id: "US-009",
      title: "Do not start yet",
      priority: 2,
    };
    const harness = createHarness(["success"], [blocked, pending]);
    let checkStarts = 0;
    const originalRunChecks = harness.deps.runChecks;
    harness.deps.runChecks = async (input) => {
      checkStarts += 1;
      return originalRunChecks(input);
    };

    const result = await runAriadneLoop(
      { runtime: "codex", dryRun: false },
      harness.deps,
    );

    expect(result).toMatchObject({
      outcome: "blocked",
      iterations: 0,
      activeStoryId: "US-008",
      blockedStoryId: "US-008",
    });
    expect(harness.processStarts).toBe(0);
    expect(checkStarts).toBe(0);
    expect(harness.commits).toBe(0);
    expect(harness.store.loadPrd().userStories[1]).toMatchObject({
      id: "US-009",
      status: "pending",
      attempts: 0,
    });
  });
});

describe("ARIADNE_EXIT_CODES", () => {
  it("maps every loop outcome to its stable exit code", () => {
    expect(ARIADNE_EXIT_CODES).toEqual({
      complete: 0,
      incomplete: 1,
      blocked: 1,
      budget_exhausted: 1,
      interrupted: 130,
      structural_error: 4,
    });
  });
});
