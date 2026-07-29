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
  options: { commitFails?: boolean } = {},
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
  store.recording = true;

  let commitNumber = 0;
  const git = {
    assertReady(expectedBranch: string, allowActiveDiff: boolean) {
      expect(expectedBranch).toBe("main");
      expect(allowActiveDiff).toBe(false);
      events.push("git.assertReady");
    },
    stageAll() {
      events.push("git.stageAll");
    },
    commit(activeStory: AriadneStory) {
      events.push("git.commit");
      if (options.commitFails) throw new Error("commit hook failed");
      commitNumber += 1;
      return commitNumber === 1
        ? "commit-head"
        : `commit-head-${activeStory.id}`;
    },
  } as unknown as AriadneGit;

  const adapter: AriadneRuntimeAdapter = {
    name: "codex",
    command: "fake-codex",
    detect: () => ({
      name: "codex",
      state: "healthy",
      reason: "deterministic test adapter",
    }),
    buildInvocation(context: IterationContext): AgentInvocation {
      expect(fs.existsSync(context.promptPath)).toBe(true);
      events.push("prompt.write");
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
        durationMs: 5,
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
    ]);
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
    expect(summary).toEqual({
      schemaVersion: 1,
      command: "run",
      outcome: "incomplete",
      runtime: "codex",
      iterations: 0,
      completedStoryIds: [],
      activeStoryId: "US-001",
    });
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
});
