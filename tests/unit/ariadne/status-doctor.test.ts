import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildAriadneDoctor } from "../../../src/ariadne/doctor.js";
import type { AriadneGit } from "../../../src/ariadne/git.js";
import {
  formatAriadneDoctor,
  formatAriadneJson,
  formatAriadneStatus,
} from "../../../src/ariadne/render.js";
import type {
  AriadneRuntimeAdapter,
  RuntimeDetectionState,
  RuntimeRegistry,
} from "../../../src/ariadne/runtimes/types.js";
import { AriadneStateError } from "../../../src/ariadne/schema.js";
import { buildAriadneStatus } from "../../../src/ariadne/status.js";
import { AriadneStore } from "../../../src/ariadne/store.js";
import type {
  AriadneConfig,
  AriadnePrd,
  AriadneRuntimeName,
} from "../../../src/ariadne/types.js";

const directories: string[] = [];

function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function repository(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ariadne-status-"));
  directories.push(root);
  git(root, "init", "-b", "main");
  git(root, "config", "user.email", "ariadne@example.test");
  git(root, "config", "user.name", "Ariadne Test");
  return fs.realpathSync(root);
}

function prd(
  status: AriadnePrd["userStories"][number]["status"] = "pending",
): AriadnePrd {
  return {
    schemaVersion: 1,
    project: "Demo",
    branchName: "main",
    description: "Status fixture",
    userStories: [
      {
        id: "US-001",
        title: "Pending",
        description: "Pending work",
        acceptanceCriteria: ["pending"],
        priority: 2,
        status: "pending",
        attempts: 0,
      },
      {
        id: "US-002",
        title: "Active",
        description: "Active work",
        acceptanceCriteria: ["active"],
        priority: 1,
        status,
        attempts: 2,
      },
      {
        id: "US-003",
        title: "Done",
        description: "Completed work",
        acceptanceCriteria: ["done"],
        priority: 3,
        status: "completed",
        attempts: 1,
      },
      {
        id: "US-004",
        title: "Blocked",
        description: "Blocked work",
        acceptanceCriteria: ["blocked"],
        priority: 4,
        status: "blocked",
        attempts: 3,
      },
    ],
  };
}

function detectionRegistry(
  configuredState: RuntimeDetectionState = "healthy",
): RuntimeRegistry {
  const names: AriadneRuntimeName[] = [
    "claude",
    "codex",
    "opencode",
    "gemini",
    "antigravity",
  ];
  return Object.fromEntries(
    names.map((name) => {
      const state = name === "codex" ? configuredState : "unavailable";
      const adapter: AriadneRuntimeAdapter = {
        name,
        command: name,
        detect: () => ({
          name,
          state,
          ...(name === "codex" ? { version: "1.2.3" } : {}),
          reason: `${name} is ${state}`,
        }),
        buildInvocation: () => ({ command: name, args: [], cwd: "/", env: {} }),
        interpretResult: () => ({ ok: true, status: 0 }),
      };
      return [name, adapter];
    }),
  ) as RuntimeRegistry;
}

function writeProject(
  root: string,
  options: {
    storyStatus?: AriadnePrd["userStories"][number]["status"];
    checks?: string[];
    runtime?: AriadneRuntimeName;
    ignore?: boolean;
  } = {},
): AriadneStore {
  const store = new AriadneStore(root);
  store.savePrd(prd(options.storyStatus));
  const config: AriadneConfig = {
    schemaVersion: 1,
    runtime: options.runtime ?? "codex",
    qualityChecks: options.checks ?? ["pnpm test"],
    maxAttemptsPerStory: 3,
  };
  store.saveConfig(config);
  fs.writeFileSync(store.paths.progress, "", "utf8");
  if (options.ignore !== false) {
    fs.writeFileSync(
      path.join(root, ".gitignore"),
      ".ariadne/lock\n.ariadne/runs/\n",
      "utf8",
    );
  }
  return store;
}

function snapshot(root: string): string[] {
  return fs
    .readdirSync(root, { recursive: true })
    .map(String)
    .sort()
    .map((entry) => {
      const absolute = path.join(root, entry);
      return fs.statSync(absolute).isFile()
        ? `${entry}:${fs.readFileSync(absolute).toString("base64")}`
        : `${entry}/`;
    });
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("Ariadne status", () => {
  it("throws a typed state error for a malformed public lock", () => {
    const root = repository();
    const store = writeProject(root);
    fs.writeFileSync(store.paths.lock, "not json", "utf8");

    expect(() =>
      buildAriadneStatus({
        projectRoot: root,
        registry: detectionRegistry(),
        git: {
          assertRepository: () => undefined,
          currentBranch: () => "main",
          statusPorcelain: () => "",
        } as unknown as AriadneGit,
      }),
    ).toThrow(AriadneStateError);
  });

  it("reports stories, active attempts, latest run, Git, paths, and live/stale locks without writes", () => {
    const root = repository();
    const store = writeProject(root, { storyStatus: "in_progress" });
    store.writeRunJson("run-old", "attempt.json", {
      schemaVersion: 1,
      runId: "run-old",
      storyId: "US-002",
      startedAt: "2026-07-28T10:00:00.000Z",
    });
    store.writeRunJson("run-latest", "attempt.json", {
      schemaVersion: 1,
      runId: "run-latest",
      storyId: "US-002",
      startedAt: "2026-07-28T11:00:00.000Z",
      initialHead: "head-before",
      finalHead: "head-after",
    });
    store.writeRunJson("run-latest", "process.json", {
      status: 0,
      durationMs: 1250,
      startedAt: "2026-07-28T11:00:01.000Z",
      finishedAt: "2026-07-28T11:00:02.250Z",
    });
    store.writeRunJson("run-latest", "stop.json", {
      schemaVersion: 1,
      outcome: "interrupted",
      timestamp: "2026-07-28T11:00:03.000Z",
    });
    fs.writeFileSync(
      store.paths.lock,
      JSON.stringify({
        schemaVersion: 1,
        pid: 4242,
        startedAt: "2026-07-28T11:00:00.000Z",
        runId: "run-latest",
      }),
      "utf8",
    );
    git(root, "add", ".");
    git(root, "commit", "-m", "test: initialize fixture");
    fs.writeFileSync(path.join(root, "dirty.txt"), "dirty\n", "utf8");
    const before = snapshot(root);

    const input = {
      projectRoot: root,
      registry: detectionRegistry(),
      isProcessAlive: (pid: number) => pid === 4242,
    };
    const report = buildAriadneStatus(input);

    expect(report).toEqual({
      schemaVersion: 1,
      command: "status",
      project: "Demo",
      branch: { configured: "main", current: "main" },
      runtime: { name: "codex", state: "healthy", version: "1.2.3" },
      stories: { pending: 1, inProgress: 1, completed: 1, blocked: 1 },
      activeStory: { id: "US-002", title: "Active", attempts: 2 },
      lastRun: {
        id: "run-latest",
        outcome: "interrupted",
        durationMs: 1250,
        initialHead: "head-before",
        finalHead: "head-after",
      },
      dirty: true,
      lock: { state: "live", pid: 4242, runId: "run-latest" },
      paths: { progress: store.paths.progress, runs: store.paths.runs },
    });
    expect(
      buildAriadneStatus({ ...input, isProcessAlive: () => false }).lock,
    ).toEqual({ state: "stale", pid: 4242, runId: "run-latest" });
    expect(snapshot(root)).toEqual(before);
  });
});

describe("Ariadne doctor", () => {
  it("does not report runtime unavailability when Git failure prevents runtime inspection", () => {
    const root = repository();
    writeProject(root);
    const gitFailure = {
      assertRepository: () => {
        throw new Error("Git inspection failed");
      },
    } as unknown as AriadneGit;

    const report = buildAriadneDoctor({
      projectRoot: root,
      registry: detectionRegistry(),
      git: gitFailure,
      isProcessAlive: () => false,
    });

    expect(report.issues).toContainEqual(
      expect.objectContaining({ code: "git_repository", severity: "error" }),
    );
    expect(report.issues.map((entry) => entry.code)).not.toContain(
      "runtime_unavailable",
    );
  });

  it("uses stable codes for Git, config, ignore, lock, and interrupted recovery diagnostics", () => {
    const root = repository();
    const store = writeProject(root, {
      storyStatus: "in_progress",
      checks: [],
      ignore: false,
    });
    store.writeRunJson("run-1", "attempt.json", {
      runId: "run-1",
      storyId: "US-002",
      startedAt: "2026-07-28T11:00:00.000Z",
    });
    store.writeRunJson("run-1", "stop.json", {
      outcome: "interrupted",
      timestamp: "2026-07-28T11:00:01.000Z",
    });
    fs.writeFileSync(
      store.paths.lock,
      JSON.stringify({
        schemaVersion: 1,
        pid: 9999,
        startedAt: "2026-07-28T11:00:00.000Z",
        runId: "run-1",
      }),
    );
    git(root, "add", ".");
    git(root, "commit", "-m", "test: initialize fixture");
    git(root, "switch", "-c", "other");
    fs.writeFileSync(path.join(root, "dirty.txt"), "dirty\n");

    const report = buildAriadneDoctor({
      projectRoot: root,
      registry: detectionRegistry(),
      isProcessAlive: () => false,
    });

    expect(report.ok).toBe(false);
    expect(
      report.issues.map(({ code, severity }) => ({ code, severity })),
    ).toEqual([
      { code: "wrong_branch", severity: "error" },
      { code: "missing_checks", severity: "error" },
      { code: "missing_gitignore", severity: "warning" },
      { code: "stale_lock", severity: "warning" },
      { code: "interrupted_state", severity: "warning" },
    ]);
  });

  it.each([
    ["unavailable", "runtime_unavailable", "error"],
    ["incompatible", "runtime_incompatible", "error"],
    ["unverified", "runtime_unverified", "warning"],
  ] as const)("reports %s configured runtimes", (state, code, severity) => {
    const root = repository();
    writeProject(root);
    const report = buildAriadneDoctor({
      projectRoot: root,
      registry: detectionRegistry(state),
      isProcessAlive: () => false,
    });
    expect(report.issues).toContainEqual(
      expect.objectContaining({ code, severity }),
    );
  });

  it("reports invalid schemas instead of throwing or mutating state", () => {
    const root = repository();
    const store = writeProject(root);
    fs.writeFileSync(store.paths.prd, '{"schemaVersion":2}\n', "utf8");
    git(root, "add", ".");
    git(root, "commit", "-m", "test: commit invalid fixture");
    const before = snapshot(root);

    const report = buildAriadneDoctor({
      projectRoot: root,
      registry: detectionRegistry(),
      isProcessAlive: () => false,
    });

    expect(report.ok).toBe(false);
    expect(report.issues).toEqual([
      expect.objectContaining({
        code: "invalid_schema",
        severity: "error",
      }),
    ]);
    expect(snapshot(root)).toEqual(before);
  });

  it("reports a dirty initial worktree when no story can own the diff", () => {
    const root = repository();
    writeProject(root);
    git(root, "add", ".");
    git(root, "commit", "-m", "test: initialize fixture");
    fs.writeFileSync(path.join(root, "unowned.txt"), "dirty\n", "utf8");

    const report = buildAriadneDoctor({
      projectRoot: root,
      registry: detectionRegistry(),
      isProcessAlive: () => false,
    });

    expect(report.issues).toContainEqual(
      expect.objectContaining({ code: "dirty_worktree", severity: "error" }),
    );
  });
});

describe("Ariadne rendering", () => {
  it("renders stable human output and JSON with no wrapper or decoration", () => {
    const root = repository();
    writeProject(root);
    const status = buildAriadneStatus({
      projectRoot: root,
      registry: detectionRegistry(),
      isProcessAlive: () => false,
    });
    const doctor = buildAriadneDoctor({
      projectRoot: root,
      registry: detectionRegistry("unverified"),
      isProcessAlive: () => false,
    });

    expect(formatAriadneStatus(status)).toContain(
      "Ariadne status\nProject: Demo",
    );
    expect(formatAriadneDoctor(doctor)).toContain(
      "WARNING [runtime_unverified]",
    );
    expect(formatAriadneJson(status)).toBe(JSON.stringify(status, null, 2));
    expect(formatAriadneJson(doctor)).toBe(JSON.stringify(doctor, null, 2));
  });
});
