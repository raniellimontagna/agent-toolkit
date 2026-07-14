import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bumpVersion,
  type ReleaseCommandRunner,
  runReleaseCli,
  updateReadmeReleaseTag,
} from "../../src/release.js";

const fixtureRoots: string[] = [];

function git(repoRoot: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
}

function createReleaseRepository(): string {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "release-fixture-"));
  fixtureRoots.push(repoRoot);

  git(repoRoot, ["init", "-b", "main"]);
  git(repoRoot, ["config", "user.name", "Release Fixture"]);
  git(repoRoot, ["config", "user.email", "release-fixture@example.com"]);

  fs.writeFileSync(
    path.join(repoRoot, "package.json"),
    `${JSON.stringify({ name: "release-fixture", version: "1.0.0" }, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(repoRoot, "README.md"),
    "git tag v1.0.0\ngit push origin v1.0.0\n",
  );
  fs.writeFileSync(path.join(repoRoot, "notes.txt"), "baseline\n");
  git(repoRoot, ["add", "."]);
  git(repoRoot, ["commit", "-m", "test: baseline"]);
  return repoRoot;
}

function snapshotVersionFiles(repoRoot: string): {
  packageJson: Buffer;
  readme: Buffer;
} {
  return {
    packageJson: fs.readFileSync(path.join(repoRoot, "package.json")),
    readme: fs.readFileSync(path.join(repoRoot, "README.md")),
  };
}

function expectVersionFilesUnchanged(
  repoRoot: string,
  before: ReturnType<typeof snapshotVersionFiles>,
): void {
  expect(fs.readFileSync(path.join(repoRoot, "package.json"))).toEqual(
    before.packageJson,
  );
  expect(fs.readFileSync(path.join(repoRoot, "README.md"))).toEqual(
    before.readme,
  );
}

function expectRejectedWithoutWrites(
  repoRoot: string,
  expectedMessage: RegExp,
  runner?: ReleaseCommandRunner,
): void {
  const before = snapshotVersionFiles(repoRoot);
  expect(() =>
    runReleaseCli(["patch", "--no-check", ...(runner ? ["--push"] : [])], {
      repoRoot,
      runner,
    }),
  ).toThrow(expectedMessage);
  expectVersionFilesUnchanged(repoRoot, before);
}

type FakePushOptions = {
  behindCount?: number;
  localTagError?: Error;
  remoteTagError?: Error;
  remoteTagStatus?: number;
  upstream?: string;
};

function createPushRunner(
  repoRoot: string,
  options: FakePushOptions = {},
): { calls: string[]; runner: ReleaseCommandRunner } {
  const calls: string[] = [];
  const runner: ReleaseCommandRunner = vi.fn(
    (command, args = [], runOptions) => {
      const call = [command, ...args].join(" ");
      calls.push(call);

      const success = (stdout = "") => ({
        ok: true,
        status: 0,
        stdout,
        stderr: "",
      });
      const failure = (status: number) => ({
        ok: false,
        status,
        stdout: "",
        stderr: "fixture failure",
      });

      if (command !== "git") return success();
      expect(runOptions?.cwd).toBe(repoRoot);

      const isInspection =
        call === "git rev-parse --show-toplevel" ||
        call === "git branch --show-current" ||
        call === "git status --porcelain=v1 --untracked-files=all" ||
        call.startsWith("git rev-parse --verify --quiet refs/tags/") ||
        call ===
          "git fetch --quiet --no-tags origin +refs/heads/main:refs/remotes/origin/main" ||
        call ===
          "git rev-parse --abbrev-ref --symbolic-full-name @{upstream}" ||
        call === "git rev-list --left-right --count origin/main...HEAD" ||
        call.startsWith("git ls-remote --exit-code --tags origin refs/tags/");
      if (isInspection) {
        expect(runOptions?.capture).toBe(true);
      }

      if (call === "git rev-parse --show-toplevel")
        return success(`${repoRoot}\n`);
      if (call === "git branch --show-current") return success("main\n");
      if (call === "git status --porcelain=v1 --untracked-files=all") {
        return success();
      }
      if (call.startsWith("git rev-parse --verify --quiet refs/tags/")) {
        if (options.localTagError) {
          return {
            ...failure(1),
            error: options.localTagError,
          };
        }
        return failure(1);
      }

      const isRemotePreflight =
        call ===
          "git fetch --quiet --no-tags origin +refs/heads/main:refs/remotes/origin/main" ||
        call ===
          "git rev-parse --abbrev-ref --symbolic-full-name @{upstream}" ||
        call === "git rev-list --left-right --count origin/main...HEAD" ||
        call.startsWith("git ls-remote --exit-code --tags origin refs/tags/");

      if (isRemotePreflight) {
        expect(
          JSON.parse(
            fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
          ).version,
        ).toBe("1.0.0");
      }

      if (
        call === "git rev-parse --abbrev-ref --symbolic-full-name @{upstream}"
      ) {
        return success(`${options.upstream ?? "origin/main"}\n`);
      }
      if (call === "git rev-list --left-right --count origin/main...HEAD") {
        return success(`${options.behindCount ?? 0}\t0\n`);
      }
      if (
        call.startsWith("git ls-remote --exit-code --tags origin refs/tags/")
      ) {
        const status = options.remoteTagStatus ?? 2;
        if (options.remoteTagError) {
          return {
            ...failure(status),
            error: options.remoteTagError,
          };
        }
        return status === 0 ? success("fixture-tag\n") : failure(status);
      }
      return success();
    },
  );

  return { calls, runner };
}

afterEach(() => {
  for (const repoRoot of fixtureRoots.splice(0)) {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

describe("release helpers", () => {
  it("accepts an isolated execution context", () => {
    expect(runReleaseCli.length).toBe(2);
  });

  it("bumps semantic versions by release kind", () => {
    expect(bumpVersion("0.1.17", "patch")).toBe("0.1.18");
    expect(bumpVersion("0.1.17", "minor")).toBe("0.2.0");
    expect(bumpVersion("0.1.17", "major")).toBe("1.0.0");
  });

  it("updates README release tag examples", () => {
    const readme = [
      "Release:",
      "```bash",
      "git tag v0.1.17",
      "git push origin v0.1.17",
      "```",
    ].join("\n");

    expect(updateReadmeReleaseTag(readme, "0.1.18")).toContain(
      "git tag v0.1.18\ngit push origin v0.1.18",
    );
  });
});

describe("release repository preflights", () => {
  it("rejects an active branch other than main before writing version files", () => {
    const repoRoot = createReleaseRepository();
    git(repoRoot, ["switch", "-c", "feature"]);

    expectRejectedWithoutWrites(repoRoot, /main/);
  });

  it("rejects an unrelated staged file before writing version files", () => {
    const repoRoot = createReleaseRepository();
    fs.writeFileSync(path.join(repoRoot, "notes.txt"), "staged change\n");
    git(repoRoot, ["add", "notes.txt"]);

    expectRejectedWithoutWrites(repoRoot, /clean|changes/i);
  });

  it("rejects an unstaged tracked change before writing version files", () => {
    const repoRoot = createReleaseRepository();
    fs.writeFileSync(path.join(repoRoot, "notes.txt"), "unstaged change\n");

    expectRejectedWithoutWrites(repoRoot, /clean|changes/i);
  });

  it("rejects an untracked file before writing version files", () => {
    const repoRoot = createReleaseRepository();
    fs.writeFileSync(path.join(repoRoot, "untracked.txt"), "untracked\n");

    expectRejectedWithoutWrites(repoRoot, /clean|changes/i);
  });

  it("rejects an existing target tag before writing version files", () => {
    const repoRoot = createReleaseRepository();
    git(repoRoot, ["tag", "v1.0.1"]);

    expectRejectedWithoutWrites(repoRoot, /already exists locally/i);
  });

  it("reports an operational local tag inspection failure before writing", () => {
    const repoRoot = createReleaseRepository();
    const before = snapshotVersionFiles(repoRoot);
    const { runner } = createPushRunner(repoRoot, {
      localTagError: new Error("spawn git ENOENT"),
    });

    expect(() =>
      runReleaseCli(["patch", "--no-check"], { repoRoot, runner }),
    ).toThrow(/inspect local tag/i);
    expectVersionFilesUnchanged(repoRoot, before);
  });

  it("creates a release commit and tag from a clean main fixture", () => {
    const repoRoot = createReleaseRepository();

    runReleaseCli(["patch", "--no-check"], { repoRoot });

    expect(
      JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"))
        .version,
    ).toBe("1.0.1");
    expect(git(repoRoot, ["tag", "--list", "v1.0.1"])).toBe("v1.0.1");
    expect(git(repoRoot, ["log", "-1", "--pretty=%s"])).toBe(
      "chore: release 1.0.1",
    );
  });
});

describe("release push preflights", () => {
  it("rejects a branch whose upstream is not origin/main before writing", () => {
    const repoRoot = createReleaseRepository();
    const { runner } = createPushRunner(repoRoot, { upstream: "fork/main" });

    expectRejectedWithoutWrites(repoRoot, /origin\/main/, runner);
  });

  it("rejects a local main behind origin/main before writing", () => {
    const repoRoot = createReleaseRepository();
    const { runner } = createPushRunner(repoRoot, { behindCount: 1 });

    expectRejectedWithoutWrites(repoRoot, /behind/i, runner);
  });

  it("rejects an existing remote target tag before writing", () => {
    const repoRoot = createReleaseRepository();
    const { runner } = createPushRunner(repoRoot, { remoteTagStatus: 0 });

    expectRejectedWithoutWrites(repoRoot, /already exists on origin/i, runner);
  });

  it("reports unexpected remote tag inspection failures before writing", () => {
    const repoRoot = createReleaseRepository();
    const { runner } = createPushRunner(repoRoot, { remoteTagStatus: 128 });

    expectRejectedWithoutWrites(repoRoot, /inspect.*remote tag/i, runner);
  });

  it("reports a status-2 remote operational failure without release writes", () => {
    const repoRoot = createReleaseRepository();
    const { calls, runner } = createPushRunner(repoRoot, {
      remoteTagError: new Error("spawn remote failure"),
      remoteTagStatus: 2,
    });

    expectRejectedWithoutWrites(repoRoot, /inspect.*remote tag/i, runner);
    expect(
      calls.some((call) => /^git (?:add|commit|tag|push)(?:\s|$)/.test(call)),
    ).toBe(false);
  });

  it("runs remote preflights before writing and pushes main plus tag atomically", () => {
    const repoRoot = createReleaseRepository();
    const { calls, runner } = createPushRunner(repoRoot);

    runReleaseCli(["patch", "--no-check", "--push"], { repoRoot, runner });

    expect(calls).toEqual([
      "git rev-parse --show-toplevel",
      "git branch --show-current",
      "git status --porcelain=v1 --untracked-files=all",
      "git rev-parse --verify --quiet refs/tags/v1.0.1",
      "git fetch --quiet --no-tags origin +refs/heads/main:refs/remotes/origin/main",
      "git rev-parse --abbrev-ref --symbolic-full-name @{upstream}",
      "git rev-list --left-right --count origin/main...HEAD",
      "git ls-remote --exit-code --tags origin refs/tags/v1.0.1",
      "git add package.json README.md",
      "git commit -m chore: release 1.0.1",
      "git tag v1.0.1",
      "git push --atomic origin main v1.0.1",
    ]);
  });
});

describe("release workflow defenses", () => {
  it("checks full main ancestry while preserving the publish helper", () => {
    const workflowPath = fileURLToPath(
      new URL("../../.github/workflows/release.yml", import.meta.url),
    );
    const workflow = fs.readFileSync(workflowPath, "utf8");

    expect(workflow).toMatch(/fetch-depth:\s*0/);
    expect(workflow).toContain(
      "git fetch --quiet --no-tags origin +refs/heads/main:refs/remotes/origin/main",
    );
    expect(workflow).toContain(
      `git merge-base --is-ancestor "\${GITHUB_SHA}" origin/main`,
    );
    expect(workflow).toContain(
      'bash scripts/publish-npm-with-retry.sh "$package_name" "$package_version"',
    );
  });
});
