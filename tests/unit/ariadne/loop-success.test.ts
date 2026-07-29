import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { QualityCheckResult } from "../../../src/ariadne/checks.js";
import type { AriadneGit } from "../../../src/ariadne/git.js";
import type { AriadneLoopDeps } from "../../../src/ariadne/loop.js";
import type { ProcessResult } from "../../../src/ariadne/process.js";
import type {
  AgentInvocation,
  AriadneRuntimeAdapter,
  IterationContext,
} from "../../../src/ariadne/runtimes/types.js";
import { AriadneStore } from "../../../src/ariadne/store.js";
import type { AriadnePrd, AriadneStory } from "../../../src/ariadne/types.js";

const directories: string[] = [];

function story(id: string, priority: number): AriadneStory {
  return {
    id,
    title: `Implement ${id}`,
    description: `Complete story ${id}.`,
    acceptanceCriteria: [`${id} passes`],
    priority,
    status: "pending",
    attempts: 0,
  };
}

class RecordingStore extends AriadneStore {
  recording = false;
  private readonly statuses = new Map<string, AriadneStory["status"]>();

  constructor(
    projectRoot: string,
    private readonly events: string[],
  ) {
    super(projectRoot);
  }

  override savePrd(prd: AriadnePrd): void {
    super.savePrd(prd);
    const changed = prd.userStories.find(
      (candidate) => this.statuses.get(candidate.id) !== candidate.status,
    );
    for (const candidate of prd.userStories) {
      this.statuses.set(candidate.id, candidate.status);
    }
    if (this.recording && changed) {
      this.events.push(`story.${changed.id}.${changed.status}`);
    }
  }

  override appendProgress(entry: string): void {
    super.appendProgress(entry);
    if (this.recording) this.events.push("progress.append");
  }
}

type Harness = {
  root: string;
  store: RecordingStore;
  deps: AriadneLoopDeps;
  events: string[];
  runtimeRunIds: string[];
};

function createHarness(
  stories: AriadneStory[],
  options: {
    stageFails?: boolean;
    commitFails?: boolean;
    agentCommits?: boolean;
    agentEditsPrd?: boolean;
    agentEditsProgress?: boolean;
  } = {},
): Harness {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ariadne-loop-"));
  directories.push(root);
  const events: string[] = [];
  const runtimeRunIds: string[] = [];
  const store = new RecordingStore(root, events);
  store.saveConfig({
    schemaVersion: 1,
    runtime: "codex",
    qualityChecks: ["pnpm test"],
    maxAttemptsPerStory: 3,
  });
  store.savePrd({
    schemaVersion: 1,
    project: "Loop fixture",
    branchName: "main",
    description: "A deterministic loop fixture.",
    userStories: stories,
  });
  fs.writeFileSync(store.paths.progress, "", "utf8");
  store.recording = true;

  let commitNumber = 0;
  let currentHead = "initial-head";
  const git = {
    assertReady(expectedBranch: string, allowActiveDiff: boolean) {
      expect(expectedBranch).toBe("main");
      expect(allowActiveDiff).toBe(false);
      events.push("git.assertReady");
    },
    stageAll() {
      events.push("git.stageAll");
      if (options.stageFails) throw new Error("git add failed");
    },
    head() {
      return currentHead;
    },
    commit(activeStory: AriadneStory) {
      events.push("git.commit");
      if (options.commitFails) throw new Error("commit hook failed");
      commitNumber += 1;
      currentHead =
        commitNumber === 1 ? "commit-head" : `commit-head-${activeStory.id}`;
      return currentHead;
    },
  } as unknown as AriadneGit;

  const adapter: AriadneRuntimeAdapter = {
    name: "codex",
    command: "fake-codex",
    detect: () => ({
      name: "codex",
      state: "healthy",
      version: "0.145.0",
      reason: "deterministic test adapter",
    }),
    buildInvocation(context: IterationContext): AgentInvocation {
      if (context.runId !== "dry-run") {
        expect(fs.existsSync(context.promptPath)).toBe(true);
        events.push("prompt.write");
      }
      return {
        command: "fake-codex",
        args: [context.promptPath],
        cwd: root,
        env: {},
      };
    },
    interpretResult(result: ProcessResult) {
      return { ok: result.status === 0, status: result.status };
    },
  };

  const runProcess: AriadneLoopDeps["runProcess"] = async (invocation) => {
    events.push("runtime.start");
    const promptPath = invocation.args[0] as string;
    const runId = path.basename(path.dirname(promptPath));
    runtimeRunIds.push(runId);
    const activeStory = store
      .loadPrd()
      .userStories.find((candidate) => candidate.status === "in_progress");
    if (!activeStory) throw new Error("Expected one active story");
    fs.writeFileSync(
      path.join(path.dirname(promptPath), "result.json"),
      `${JSON.stringify({
        schemaVersion: 1,
        runId,
        storyId: activeStory.id,
        outcome: "completed",
        criteria: activeStory.acceptanceCriteria.map((criterion) => ({
          criterion,
          passed: true,
          evidence: "fake runtime evidence",
        })),
        summary: `Completed ${activeStory.id}.`,
        filesChanged: ["src/fixture.ts"],
        checksAttempted: ["pnpm test"],
        learnings: [],
      })}\n`,
      "utf8",
    );
    if (options.agentCommits) currentHead = "agent-owned-head";
    if (options.agentEditsPrd) {
      fs.writeFileSync(store.paths.prd, '{"agent":"edited canonical state"}\n');
    }
    if (options.agentEditsProgress) {
      fs.writeFileSync(store.paths.progress, "agent edited progress\n", "utf8");
    }
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
    };
  };

  const runChecks: AriadneLoopDeps["runChecks"] = async (input) => {
    events.push("result.validate");
    const results: QualityCheckResult[] = input.commands.map((command) => {
      events.push(`check.${command}`);
      return {
        command,
        status: 0,
        signal: null,
        durationMs: 5,
        timedOut: false,
        timeoutOrigin: null,
        aborted: false,
        stdoutPath: path.join(input.runDir, "check.stdout.log"),
        stderrPath: path.join(input.runDir, "check.stderr.log"),
      };
    });
    return results;
  };

  let nextRun = 0;
  const deps: AriadneLoopDeps = {
    store,
    git,
    adapter,
    acquireLock(input) {
      events.push("lock.acquire");
      return {
        record: {
          schemaVersion: 1,
          pid: input.pid,
          startedAt: input.now().toISOString(),
          runId: input.runId,
        },
        release() {
          events.push("lock.release");
        },
      };
    },
    runProcess,
    runChecks,
    now: () => new Date("2026-07-29T00:00:00.000Z"),
    createRunId: () => `run-${++nextRun}`,
  };

  return { root, store, deps, events, runtimeRunIds };
}

function snapshotDirectory(root: string): Record<string, string> {
  const snapshot: Record<string, string> = {};
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else
        snapshot[path.relative(root, absolute)] = fs.readFileSync(
          absolute,
          "utf8",
        );
    }
  };
  visit(root);
  return snapshot;
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("runAriadneLoop successful lifecycle", () => {
  it("executes and commits one successful story in the required order", async () => {
    const harness = createHarness([story("US-001", 1)]);
    const { runAriadneLoop } = await import("../../../src/ariadne/loop.js");

    const summary = await runAriadneLoop(
      { runtime: "codex", dryRun: false },
      harness.deps,
    );

    expect(harness.events).toEqual([
      "lock.acquire",
      "git.assertReady",
      "story.US-001.in_progress",
      "prompt.write",
      "runtime.start",
      "result.validate",
      "check.pnpm test",
      "story.US-001.completed",
      "progress.append",
      "git.stageAll",
      "git.commit",
      "lock.release",
    ]);
    expect(summary).toEqual({
      schemaVersion: 1,
      command: "run",
      outcome: "complete",
      runtime: "codex",
      iterations: 1,
      completedStoryIds: ["US-001"],
      lastRunId: "run-1",
      commit: "commit-head",
    });
    expect(harness.store.loadPrd().userStories[0]?.status).toBe("completed");
    expect(fs.readFileSync(harness.store.paths.progress, "utf8")).toContain(
      "pnpm test: passed",
    );
    expect(
      fs.readdirSync(path.join(harness.store.paths.runs, "run-1")).sort(),
    ).toEqual([
      "attempt.json",
      "checks.json",
      "process.json",
      "prompt.md",
      "result.json",
      "summary.json",
    ]);
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(harness.store.paths.runs, "run-1", "attempt.json"),
          "utf8",
        ),
      ),
    ).toMatchObject({
      runtimeVersion: "0.145.0",
      initialHead: "initial-head",
      invocation: {
        command: "fake-codex",
        args: [expect.stringContaining("prompt.md")],
        cwd: harness.root,
      },
    });
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(harness.store.paths.runs, "run-1", "summary.json"),
          "utf8",
        ),
      ),
    ).toMatchObject({
      outcome: "completed",
      initialHead: "initial-head",
      finalHead: "commit-head",
      validatedResult: {
        summary: "Completed US-001.",
        filesChanged: ["src/fixture.ts"],
      },
    });
  });

  it("selects multiple stories by priority then source order", async () => {
    const harness = createHarness([
      story("US-001", 2),
      story("US-002", 1),
      story("US-003", 1),
    ]);
    const { runAriadneLoop } = await import("../../../src/ariadne/loop.js");

    const summary = await runAriadneLoop(
      { runtime: "codex", dryRun: false },
      harness.deps,
    );

    expect(summary.completedStoryIds).toEqual(["US-002", "US-003", "US-001"]);
    expect(summary.iterations).toBe(3);
    expect(summary.lastRunId).toBe("run-3");
    expect(harness.runtimeRunIds).toEqual(["run-1", "run-2", "run-3"]);
    expect(new Set(harness.runtimeRunIds).size).toBe(3);
  });

  it("does not rewrite a completed attempt when a later loop budget stops", async () => {
    const harness = createHarness([story("US-001", 1), story("US-002", 2)]);
    const { runAriadneLoop } = await import("../../../src/ariadne/loop.js");

    const result = await runAriadneLoop(
      { runtime: "codex", dryRun: false, maxIterations: 1 },
      harness.deps,
    );

    expect(result).toMatchObject({
      outcome: "budget_exhausted",
      completedStoryIds: ["US-001"],
      activeStoryId: "US-002",
      lastRunId: "run-1",
    });
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(harness.store.paths.runs, "run-1", "summary.json"),
          "utf8",
        ),
      ),
    ).toMatchObject({
      storyId: "US-001",
      outcome: "completed",
      finalHead: "commit-head",
    });
  });

  it("persists an interactive runtime preference only inside the coordinator", async () => {
    const harness = createHarness([story("US-001", 1)]);
    const config = harness.store.loadConfig();
    delete config.runtime;
    harness.store.saveConfig(config);
    const { runAriadneLoop } = await import("../../../src/ariadne/loop.js");

    await runAriadneLoop(
      {
        runtime: "codex",
        persistRuntimeSelection: true,
        dryRun: false,
      },
      harness.deps,
    );

    expect(harness.events.indexOf("git.assertReady")).toBeLessThan(
      harness.events.indexOf("story.US-001.in_progress"),
    );
    expect(harness.store.loadConfig().runtime).toBe("codex");
  });

  it("keeps dry-run inspection non-mutating", async () => {
    const harness = createHarness([story("US-001", 1)]);
    const before = snapshotDirectory(harness.root);
    const { runAriadneLoop } = await import("../../../src/ariadne/loop.js");

    const summary = await runAriadneLoop(
      { runtime: "codex", dryRun: true },
      harness.deps,
    );

    expect(snapshotDirectory(harness.root)).toEqual(before);
    expect(harness.events).toEqual(["git.assertReady"]);
    expect(summary).toMatchObject({
      schemaVersion: 1,
      command: "run",
      outcome: "incomplete",
      runtime: "codex",
      iterations: 0,
      completedStoryIds: [],
      activeStoryId: "US-001",
      inspection: {
        project: {
          root: harness.root,
          name: "Loop fixture",
          branch: "main",
        },
        selectedStory: {
          id: "US-001",
          title: "Implement US-001",
          priority: 1,
          status: "pending",
          attempts: 0,
        },
        blockedStory: null,
        promptPath: path.join(harness.store.paths.runs, "dry-run", "prompt.md"),
        invocation: {
          command: "fake-codex",
          args: [path.join(harness.store.paths.runs, "dry-run", "prompt.md")],
          cwd: harness.root,
        },
        runtime: { name: "codex", state: "healthy", version: "0.145.0" },
        checks: ["pnpm test"],
        limits: {
          maxAttemptsPerStory: 3,
          maxIterations: null,
          maxRuntimeMs: null,
        },
      },
    });
  });

  it("inspects a dry run without requiring executable quality checks", async () => {
    const harness = createHarness([story("US-001", 1)]);
    const config = harness.store.loadConfig();
    config.qualityChecks = [];
    harness.store.saveConfig(config);
    const before = snapshotDirectory(harness.root);
    const { runAriadneLoop } = await import("../../../src/ariadne/loop.js");

    const result = await runAriadneLoop(
      { runtime: "codex", dryRun: true },
      harness.deps,
    );

    expect(result).toMatchObject({
      outcome: "incomplete",
      inspection: { checks: [] },
    });
    expect(snapshotDirectory(harness.root)).toEqual(before);
  });

  it("reports a blocked story in a non-mutating dry run", async () => {
    const blocked = { ...story("US-001", 1), status: "blocked" as const };
    const harness = createHarness([blocked]);
    const before = snapshotDirectory(harness.root);
    harness.deps.git.assertReady = (_branch, allowPreservedDiff) => {
      if (!allowPreservedDiff) throw new Error("working tree is dirty");
      harness.events.push("git.assertReady");
    };
    const { runAriadneLoop } = await import("../../../src/ariadne/loop.js");

    const summary = await runAriadneLoop(
      { runtime: "codex", dryRun: true },
      harness.deps,
    );

    expect(snapshotDirectory(harness.root)).toEqual(before);
    expect(harness.events).toEqual(["git.assertReady"]);
    expect(summary).toMatchObject({
      outcome: "blocked",
      iterations: 0,
      activeStoryId: "US-001",
      blockedStoryId: "US-001",
      inspection: {
        selectedStory: { id: "US-001", status: "blocked" },
        blockedStory: { id: "US-001", status: "blocked" },
        invocation: { command: "fake-codex", cwd: harness.root },
      },
    });
  });

  it("does not select a pending story when dry run finds a blocked diff", async () => {
    const blocked = { ...story("US-001", 1), status: "blocked" as const };
    const pending = story("US-002", 2);
    const harness = createHarness([blocked, pending]);
    const before = snapshotDirectory(harness.root);
    harness.deps.git.assertReady = (_branch, allowPreservedDiff) => {
      if (!allowPreservedDiff) throw new Error("working tree is dirty");
      harness.events.push("git.assertReady");
    };
    const { runAriadneLoop } = await import("../../../src/ariadne/loop.js");

    const summary = await runAriadneLoop(
      { runtime: "codex", dryRun: true },
      harness.deps,
    );

    expect(snapshotDirectory(harness.root)).toEqual(before);
    expect(harness.events).toEqual(["git.assertReady"]);
    expect(summary).toMatchObject({
      outcome: "blocked",
      iterations: 0,
      blockedStoryId: "US-001",
      activeStoryId: "US-001",
    });
    expect(summary.activeStoryId).not.toBe("US-002");
  });

  it("restores in-progress state and records commit failure without cleanup", async () => {
    const harness = createHarness([story("US-001", 1)], {
      commitFails: true,
    });
    const { runAriadneLoop } = await import("../../../src/ariadne/loop.js");

    await expect(
      runAriadneLoop({ runtime: "codex", dryRun: false }, harness.deps),
    ).rejects.toThrow("commit hook failed");

    expect(harness.store.loadPrd().userStories[0]).toMatchObject({
      id: "US-001",
      status: "in_progress",
      attempts: 1,
    });
    expect(fs.readFileSync(harness.store.paths.progress, "utf8")).toContain(
      "failure category: commit_failure",
    );
    expect(harness.events.slice(-6)).toEqual([
      "progress.append",
      "git.stageAll",
      "git.commit",
      "story.US-001.in_progress",
      "progress.append",
      "lock.release",
    ]);
  });

  it("restores in-progress state when staging fails before the owned commit", async () => {
    const harness = createHarness([story("US-001", 1)], {
      stageFails: true,
    });
    const { runAriadneLoop } = await import("../../../src/ariadne/loop.js");

    await expect(
      runAriadneLoop({ runtime: "codex", dryRun: false }, harness.deps),
    ).rejects.toThrow("git add failed");

    expect(harness.store.loadPrd().userStories[0]).toMatchObject({
      id: "US-001",
      status: "in_progress",
      attempts: 1,
    });
    expect(harness.events).toContain("git.stageAll");
    expect(harness.events).not.toContain("git.commit");
    expect(
      JSON.parse(
        fs.readFileSync(
          path.join(harness.store.paths.runs, "run-1", "summary.json"),
          "utf8",
        ),
      ),
    ).toMatchObject({ outcome: "failed", failureCategory: "commit" });
    expect(fs.readFileSync(harness.store.paths.progress, "utf8")).toContain(
      "failure category: commit_failure",
    );
  });

  it("refuses to certify work when the runtime creates a commit", async () => {
    const harness = createHarness([story("US-001", 1)], {
      agentCommits: true,
    });
    const { runAriadneLoop } = await import("../../../src/ariadne/loop.js");

    await expect(
      runAriadneLoop({ runtime: "codex", dryRun: false }, harness.deps),
    ).rejects.toThrow(/runtime changed Git HEAD/i);

    expect(harness.events).not.toContain("git.stageAll");
    expect(harness.events).not.toContain("git.commit");
    expect(harness.store.loadPrd().userStories[0]).toMatchObject({
      status: "in_progress",
      attempts: 1,
    });
  });

  it.each([
    ["prd", { agentEditsPrd: true }],
    ["progress", { agentEditsProgress: true }],
  ] as const)("refuses runtime edits to canonical %s state", async (_label, options) => {
    const harness = createHarness([story("US-001", 1)], options);
    const { runAriadneLoop } = await import("../../../src/ariadne/loop.js");

    await expect(
      runAriadneLoop({ runtime: "codex", dryRun: false }, harness.deps),
    ).rejects.toThrow(/runtime edited canonical Ariadne state/i);

    expect(harness.events).not.toContain("git.stageAll");
    expect(harness.events).not.toContain("git.commit");
  });
});
