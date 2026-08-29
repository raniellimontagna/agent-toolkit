import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
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

function executeGit(
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
): ReturnType<GitExec> {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
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
  const root = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), "ariadne-git-")),
  );
  directories.push(root);
  expect(executeGit(["init", "-b", "main"], root).ok).toBe(true);
  expect(executeGit(["config", "user.name", "Ariadne Test"], root).ok).toBe(
    true,
  );
  expect(
    executeGit(["config", "user.email", "ariadne@example.test"], root).ok,
  ).toBe(true);
  fs.writeFileSync(path.join(root, "README.md"), "baseline\n");
  fs.writeFileSync(
    path.join(root, ".gitignore"),
    ".ariadne/lock\n.ariadne/runs/\n.ariadne-quarantine.json\n.ariadne-quarantine.checkpoint.json\n",
  );
  expect(executeGit(["add", "--all"], root).ok).toBe(true);
  expect(executeGit(["commit", "-m", "test: baseline"], root).ok).toBe(true);

  const calls: string[][] = [];
  const capture: GitExec = (command, args, cwd, env) => {
    expect(command).toBe("git");
    expect(cwd).toBe(root);
    calls.push([...args]);
    return executeGit(args, cwd, env);
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
    const nestedGit = new AriadneGit(nested, (_command, args, cwd, env) =>
      executeGit(args, cwd, env),
    );
    const outside = fs.realpathSync.native(
      fs.mkdtempSync(path.join(os.tmpdir(), "ariadne-outside-")),
    );
    directories.push(outside);
    const outsideGit = new AriadneGit(outside, (_command, args, cwd, env) =>
      executeGit(args, cwd, env),
    );

    expect(() => git.assertRepository()).not.toThrow();
    expect(() => nestedGit.assertRepository()).toThrow(/repository root/i);
    expect(() => outsideGit.assertRepository()).toThrow(/Git repository/i);
  });

  it("reports the current branch, symbolic HEAD ref, and HEAD object", () => {
    const { git } = createRepository();

    expect(git.currentBranch()).toBe("main");
    expect(git.headRef()).toBe("refs/heads/main");
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
    expect(executeGit(["diff", "--cached", "--name-only"], root).stdout).toBe(
      "",
    );
    const committedHead = git.commit(story(), git.head());

    expect(executeGit(["status", "--porcelain"], root).stdout).toBe("");
    expect(committedHead).toBe(
      executeGit(["rev-parse", "HEAD"], root).stdout.trim(),
    );
    expect(executeGit(["log", "-1", "--pretty=%s"], root).stdout.trim()).toBe(
      "feat(ariadne): US-005 Protect repository state",
    );
    expect(calls).toContainEqual([
      "add",
      "--all",
      "--",
      ":(literal)feature.ts",
    ]);
    expect(calls.some((args) => forbiddenCommands.has(args[0] ?? ""))).toBe(
      false,
    );
  });

  it("leaves the shared index untouched when commit creation fails", () => {
    const { root, calls } = createRepository();
    const git = new AriadneGit(root, (_command, args, cwd, env) => {
      calls.push([...args]);
      if (args.includes("commit") || args.includes("commit-tree")) {
        return {
          ok: false,
          status: 23,
          stdout: "",
          stderr: "fixture commit failure",
        };
      }
      return executeGit(args, cwd, env);
    });
    fs.writeFileSync(
      path.join(root, "feature.ts"),
      "export const ready = true;\n",
    );
    git.stageAll();

    expect(() => git.commit(story(), git.head())).toThrow(/commit/i);
    expect(executeGit(["diff", "--cached", "--name-only"], root).stdout).toBe(
      "",
    );
    expect(executeGit(["status", "--porcelain=v1"], root).stdout).toContain(
      "feature.ts",
    );
    expect(calls.some((args) => forbiddenCommands.has(args[0] ?? ""))).toBe(
      false,
    );
  });

  it("commits the exact certified tree without allowing hooks to contaminate the index", () => {
    const { root, git } = createRepository();
    fs.writeFileSync(
      path.join(root, "feature.ts"),
      "export const certified = true;\n",
    );
    fs.mkdirSync(path.join(root, ".ariadne", "runs", "run-1"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(root, ".ariadne", "runs", "run-1", "prompt.md"),
      "sensitive prompt\n",
    );
    const hookPath = path.join(root, ".git", "hooks", "pre-commit");
    fs.writeFileSync(
      hookPath,
      [
        "#!/bin/sh",
        "git reset -q HEAD -- feature.ts",
        "git add -f .ariadne/runs/run-1/prompt.md",
        "touch hook-ran",
        "",
      ].join("\n"),
      { mode: 0o755 },
    );

    git.stageAll();
    git.commit(story(), git.head());

    expect(
      executeGit(["ls-tree", "-r", "--name-only", "HEAD"], root).stdout,
    ).toContain("feature.ts\n");
    expect(
      executeGit(["ls-tree", "-r", "--name-only", "HEAD"], root).stdout,
    ).not.toMatch(/^\.ariadne\/(?:lock|runs(?:\/|$))/m);
    expect(fs.existsSync(path.join(root, "hook-ran"))).toBe(false);
  });

  it("refuses to publish on a HEAD that changed after runtime certification", () => {
    const { root, git } = createRepository();
    const certifiedHead = git.head();
    fs.writeFileSync(
      path.join(root, "feature.ts"),
      "export const certified = true;\n",
    );
    git.stageAll();
    const baselineTree = executeGit(
      ["rev-parse", `${certifiedHead}^{tree}`],
      root,
    ).stdout.trim();
    const attackerCommit = executeGit(
      ["commit-tree", baselineTree, "-p", certifiedHead, "-m", "attacker"],
      root,
    ).stdout.trim();
    expect(
      executeGit(["update-ref", "HEAD", attackerCommit, certifiedHead], root)
        .ok,
    ).toBe(true);

    expect(() => git.commit(story(), certifiedHead)).toThrow(
      /HEAD.*changed|certified HEAD/i,
    );
    expect(git.head()).toBe(attackerCommit);
    expect(executeGit(["log", "-1", "--pretty=%s"], root).stdout.trim()).toBe(
      "attacker",
    );
  });

  it("refuses a same-OID symbolic HEAD retarget after private staging", () => {
    const { root, git } = createRepository();
    const certifiedHead = git.head();
    fs.writeFileSync(
      path.join(root, "feature.ts"),
      "export const certified = true;\n",
    );
    git.stageAll();
    expect(executeGit(["branch", "same-oid", certifiedHead], root).ok).toBe(
      true,
    );
    expect(
      executeGit(["symbolic-ref", "HEAD", "refs/heads/same-oid"], root).ok,
    ).toBe(true);

    expect(() => git.commit(story(), certifiedHead)).toThrow(
      /symbolic HEAD|certified.*ref|reference/i,
    );
    expect(git.headRef()).toBe("refs/heads/same-oid");
    expect(git.head()).toBe(certifiedHead);
    expect(
      executeGit(["show-ref", "--verify", "refs/heads/main"], root).stdout,
    ).toContain(certifiedHead);
  });

  // Windows filenames cannot contain ":" or "*", so the literal pathspec name
  // is only creatable on POSIX filesystems.
  it.skipIf(process.platform === "win32")(
    "stages a legal filename beginning with pathspec magic literally",
    () => {
      const { root, git } = createRepository();
      const filename = ":(exclude)**";
      fs.writeFileSync(path.join(root, filename), "literal pathspec name\n");

      git.stageAll();
      git.commit(story(), git.head());

      expect(
        executeGit(["ls-tree", "-r", "--name-only", "HEAD"], root).stdout,
      ).toContain(`${filename}\n`);
      expect(executeGit(["status", "--porcelain=v1"], root).stdout).toBe("");
    },
  );

  it.each([
    ["removes", "# runtime removed Ariadne safety ignores\n"],
    [
      "negates",
      ".ariadne/lock\n.ariadne/runs/\n!.ariadne/lock\n!.ariadne/runs/\n!.ariadne/runs/**\n",
    ],
  ])(
    "fails safely when the runtime %s machine-local ignores",
    (_scenario, gitignore) => {
      const { root, git } = createRepository();
      fs.writeFileSync(path.join(root, ".gitignore"), gitignore, "utf8");
      fs.writeFileSync(
        path.join(root, "feature.ts"),
        "export const safe = true;\n",
      );
      fs.mkdirSync(path.join(root, ".ariadne", "runs", ".lock-coordinator"), {
        recursive: true,
      });
      fs.writeFileSync(path.join(root, ".ariadne", "lock"), "local lock\n");
      fs.writeFileSync(
        path.join(root, ".ariadne", "runs", ".lock-coordinator", "root.json"),
        "local coordinator\n",
      );
      for (const name of [
        "prompt.md",
        "result.json",
        "runtime.stdout.log",
        "runtime.stderr.log",
      ]) {
        fs.writeFileSync(
          path.join(root, ".ariadne", "runs", name),
          `local ${name}\n`,
        );
      }

      expect(() => git.stageAll()).toThrow(/machine-local.*ignored/i);
      expect(executeGit(["diff", "--cached", "--name-only"], root).stdout).toBe(
        "",
      );
      expect(executeGit(["status", "--porcelain=v1"], root).stdout).toContain(
        "feature.ts",
      );
    },
  );

  it("refuses an index pre-contaminated with a forced machine-local artifact", () => {
    const { root, git } = createRepository();
    fs.writeFileSync(
      path.join(root, "feature.ts"),
      "export const safe = true;\n",
    );
    fs.mkdirSync(path.join(root, ".ariadne", "runs", "run-1"), {
      recursive: true,
    });
    const prompt = path.join(root, ".ariadne", "runs", "run-1", "prompt.md");
    fs.writeFileSync(prompt, "sensitive prompt\n");
    expect(executeGit(["add", "--force", prompt], root).ok).toBe(true);

    expect(() => git.stageAll()).toThrow(/machine-local.*staged/i);
    expect(executeGit(["diff", "--cached", "--name-only"], root).stdout).toBe(
      ".ariadne/runs/run-1/prompt.md\n",
    );
    expect(fs.readFileSync(prompt, "utf8")).toBe("sensitive prompt\n");
  });

  it.each([
    ".ARIADNE/RuNs/run-1/prompt.md",
    ".ARIADNE/LOCK/raw.json",
    ".ARIADNE-QUARANTINE.JSON",
  ])("rejects case-variant machine-local index path %s", (relativePath) => {
    const { root, git } = createRepository();
    const prompt = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(prompt), { recursive: true });
    fs.writeFileSync(prompt, "case-variant sensitive prompt\n");
    expect(executeGit(["add", "--force", prompt], root).ok).toBe(true);

    expect(() => git.stageAll()).toThrow(/machine-local.*staged|index/i);
    expect(executeGit(["diff", "--cached", "--name-only"], root).stdout).toBe(
      `${relativePath}\n`,
    );
  });

  it("rejects a machine-local artifact injected into the private candidate tree", () => {
    const { root } = createRepository();
    const prompt = path.join(root, ".ariadne", "runs", "run-1", "prompt.md");
    fs.mkdirSync(path.dirname(prompt), { recursive: true });
    fs.writeFileSync(prompt, "candidate-tree sensitive prompt\n");
    let injected = false;
    const git = new AriadneGit(root, (_command, args, cwd, env) => {
      if (
        !injected &&
        args[0] === "write-tree" &&
        typeof env?.GIT_INDEX_FILE === "string"
      ) {
        injected = true;
        expect(executeGit(["add", "--force", prompt], root, env).ok).toBe(true);
      }
      return executeGit(args, cwd, env);
    });
    fs.writeFileSync(
      path.join(root, "feature.ts"),
      "export const safe = true;\n",
    );

    expect(() => git.stageAll()).toThrow(/candidate tree.*machine-local/i);
    expect(executeGit(["diff", "--cached", "--name-only"], root).stdout).toBe(
      "",
    );
  });

  it("detects a shared-index mutation while building the private tree", () => {
    const { root, calls } = createRepository();
    let injected = false;
    const git = new AriadneGit(root, (_command, args, cwd, env) => {
      calls.push([...args]);
      if (
        !injected &&
        args[0] === "write-tree" &&
        typeof env?.GIT_INDEX_FILE === "string"
      ) {
        injected = true;
        fs.writeFileSync(path.join(root, "attacker-index.txt"), "attacker\n");
        expect(executeGit(["add", "attacker-index.txt"], root).ok).toBe(true);
      }
      return executeGit(args, cwd, env);
    });
    fs.writeFileSync(
      path.join(root, "feature.ts"),
      "export const safe = true;\n",
    );

    expect(() => git.stageAll()).toThrow(
      /shared index.*changed|index.*changed/i,
    );
    expect(executeGit(["diff", "--cached", "--name-only"], root).stdout).toBe(
      "attacker-index.txt\n",
    );
    expect(executeGit(["status", "--porcelain=v1"], root).stdout).toContain(
      "feature.ts",
    );
  });

  it("refuses a late worktree mutation before reference publication", () => {
    const { root } = createRepository();
    const certifiedHead = executeGit(["rev-parse", "HEAD"], root).stdout.trim();
    let injected = false;
    const git = new AriadneGit(root, (_command, args, cwd, env) => {
      const result = executeGit(args, cwd, env);
      if (!injected && args[0] === "commit-tree" && result.ok) {
        injected = true;
        fs.writeFileSync(path.join(root, "late-before-cas.txt"), "late\n");
      }
      return result;
    });
    fs.writeFileSync(
      path.join(root, "feature.ts"),
      "export const safe = true;\n",
    );
    git.stageAll();

    expect(() => git.commit(story(), certifiedHead)).toThrow(
      /complete project delta|worktree.*changed|publication/i,
    );
    expect(executeGit(["rev-parse", "HEAD"], root).stdout.trim()).toBe(
      certifiedHead,
    );
    expect(executeGit(["diff", "--cached", "--name-only"], root).stdout).toBe(
      "",
    );
    expect(executeGit(["status", "--porcelain=v1"], root).stdout).toContain(
      "feature.ts",
    );
  });

  it("rolls back the explicit ref and original index on a post-CAS worktree mutation", () => {
    const { root, calls } = createRepository();
    const certifiedHead = executeGit(["rev-parse", "HEAD"], root).stdout.trim();
    let injected = false;
    const git = new AriadneGit(root, (_command, args, cwd, env) => {
      const result = executeGit(args, cwd, env);
      if (
        !injected &&
        args.includes("update-ref") &&
        args.includes("refs/heads/main") &&
        args.includes(certifiedHead) &&
        result.ok
      ) {
        injected = true;
        fs.writeFileSync(path.join(root, "late-after-cas.txt"), "late\n");
      }
      calls.push([...args]);
      return result;
    });
    fs.writeFileSync(
      path.join(root, "feature.ts"),
      "export const safe = true;\n",
    );
    git.stageAll();

    expect(() => git.commit(story(), certifiedHead)).toThrow(
      /post-publication|rolled back|publication/i,
    );
    expect(executeGit(["rev-parse", "HEAD"], root).stdout.trim()).toBe(
      certifiedHead,
    );
    expect(executeGit(["diff", "--cached", "--name-only"], root).stdout).toBe(
      "",
    );
    expect(executeGit(["status", "--porcelain=v1"], root).stdout).toContain(
      "feature.ts",
    );
    const publications = calls.filter((args) => args.includes("update-ref"));
    expect(publications).toHaveLength(2);
    expect(publications[0]).toContain("refs/heads/main");
    expect(publications[0]).not.toContain("HEAD");
  });

  it("does not overturn a certified publication when private-index cleanup fails", () => {
    const { root } = createRepository();
    fs.writeFileSync(
      path.join(root, "feature.ts"),
      "export const safe = true;\n",
    );
    let published = false;
    const git = new AriadneGit(root, (_command, args, cwd, env) => {
      const result = executeGit(args, cwd, env);
      if (args.includes("update-ref") && result.ok) published = true;
      return result;
    });
    const originalUnlink = fs.unlinkSync.bind(fs);
    vi.spyOn(fs, "unlinkSync").mockImplementation((filename) => {
      if (published && filename.toString().includes(".ariadne-stage-")) {
        throw Object.assign(new Error("injected cleanup failure"), {
          code: "EACCES",
        });
      }
      originalUnlink(filename);
    });

    const stage = git.stageAll();
    const commit = git.commit(story(), stage.parentHead, () => {}, stage.ref);

    expect(executeGit(["rev-parse", "HEAD"], root).stdout.trim()).toBe(commit);
    expect(() => git.assertPublished(commit)).not.toThrow();
  });

  it.each([{ id: "US-005\nmalicious" }, { title: "Title\rwith a newline" }])(
    "rejects newline commit-message input without invoking Git",
    (overrides) => {
      const { calls, git } = createRepository();
      const callsBefore = calls.length;

      expect(() => git.commit(story(overrides), "unused-head")).toThrow(
        /newline/i,
      );
      expect(calls).toHaveLength(callsBefore);
    },
  );
});
