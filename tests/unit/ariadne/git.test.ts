import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AriadneGit, type GitExec } from "../../../src/ariadne/git.js";
import type { AriadneStory } from "../../../src/ariadne/types.js";

const directories: string[] = [];
const forbiddenCommands = new Set([
  "push",
  "reset",
  "clean",
  "revert",
  "checkout",
]);

function executeGit(args: string[], cwd: string): ReturnType<GitExec> {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    ok: result.status === 0,
    status: result.status ?? 1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function createRepository(): {
  root: string;
  calls: string[][];
  git: AriadneGit;
} {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ariadne-git-"));
  directories.push(root);
  expect(executeGit(["init", "-b", "main"], root).ok).toBe(true);
  expect(executeGit(["config", "user.name", "Ariadne Test"], root).ok).toBe(
    true,
  );
  expect(
    executeGit(["config", "user.email", "ariadne@example.test"], root).ok,
  ).toBe(true);
  fs.writeFileSync(path.join(root, "README.md"), "baseline\n");
  expect(executeGit(["add", "--all"], root).ok).toBe(true);
  expect(executeGit(["commit", "-m", "test: baseline"], root).ok).toBe(true);

  const calls: string[][] = [];
  const capture: GitExec = (command, args, cwd) => {
    expect(command).toBe("git");
    expect(cwd).toBe(root);
    calls.push([...args]);
    return executeGit(args, cwd);
  };
  return { root, calls, git: new AriadneGit(root, capture) };
}

function story(overrides: Partial<AriadneStory> = {}): AriadneStory {
  return {
    id: "US-005",
    title: "Protect repository state",
    description: "",
    acceptanceCriteria: [],
    priority: 1,
    status: "in_progress",
    attempts: 1,
    ...overrides,
  };
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("AriadneGit", () => {
  it("requires the configured directory to be a repository root", () => {
    const { root, git } = createRepository();
    const nested = path.join(root, "nested");
    fs.mkdirSync(nested);
    const nestedGit = new AriadneGit(nested, (_command, args, cwd) =>
      executeGit(args, cwd),
    );
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "ariadne-outside-"));
    directories.push(outside);
    const outsideGit = new AriadneGit(outside, (_command, args, cwd) =>
      executeGit(args, cwd),
    );

    expect(() => git.assertRepository()).not.toThrow();
    expect(() => nestedGit.assertRepository()).toThrow(/repository root/i);
    expect(() => outsideGit.assertRepository()).toThrow(/Git repository/i);
  });

  it("reports the current branch and HEAD", () => {
    const { git } = createRepository();

    expect(git.currentBranch()).toBe("main");
    expect(git.head()).toMatch(/^[0-9a-f]{40}$/);
  });

  it("requires a clean baseline on a matching branch", () => {
    const { root, git } = createRepository();

    expect(() => git.assertReady("main", false)).not.toThrow();
    fs.writeFileSync(path.join(root, "dirty.txt"), "uncommitted\n");

    expect(git.statusPorcelain()).toContain("dirty.txt");
    expect(() => git.assertReady("main", false)).toThrow(/clean worktree/i);
    expect(() => git.assertReady("different", true)).toThrow(/branch/i);
  });

  it("allows an active story to resume with its existing dirty diff", () => {
    const { root, git } = createRepository();
    fs.writeFileSync(path.join(root, "repair.ts"), "export {};\n");

    expect(() => git.assertReady("main", true)).not.toThrow();
  });

  it("stages the complete story delta and creates the owned commit", () => {
    const { root, calls, git } = createRepository();
    fs.writeFileSync(
      path.join(root, "feature.ts"),
      "export const ready = true;\n",
    );

    git.stageAll();
    const committedHead = git.commit(story());

    expect(executeGit(["status", "--porcelain"], root).stdout).toBe("");
    expect(committedHead).toBe(
      executeGit(["rev-parse", "HEAD"], root).stdout.trim(),
    );
    expect(executeGit(["log", "-1", "--pretty=%s"], root).stdout.trim()).toBe(
      "feat(ariadne): US-005 Protect repository state",
    );
    expect(calls).toContainEqual(["add", "--all"]);
    expect(calls.some((args) => forbiddenCommands.has(args[0] ?? ""))).toBe(
      false,
    );
  });

  it("preserves the staged diff when commit creation fails", () => {
    const { root, calls, git } = createRepository();
    fs.writeFileSync(
      path.join(root, "feature.ts"),
      "export const ready = true;\n",
    );
    const hookPath = path.join(root, ".git", "hooks", "pre-commit");
    fs.writeFileSync(hookPath, "#!/bin/sh\nexit 23\n", { mode: 0o755 });
    git.stageAll();

    expect(() => git.commit(story())).toThrow(/commit/i);
    expect(executeGit(["diff", "--cached", "--name-only"], root).stdout).toBe(
      "feature.ts\n",
    );
    expect(calls.some((args) => forbiddenCommands.has(args[0] ?? ""))).toBe(
      false,
    );
  });

  it.each([
    { id: "US-005\nmalicious" },
    { title: "Title\rwith a newline" },
  ])("rejects newline commit-message input without invoking Git", (overrides) => {
    const { calls, git } = createRepository();
    const callsBefore = calls.length;

    expect(() => git.commit(story(overrides))).toThrow(/newline/i);
    expect(calls).toHaveLength(callsBefore);
  });
});
