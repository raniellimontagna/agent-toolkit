import fs from "node:fs";
import type { AriadneStory } from "./types.js";

export type GitExec = (
  command: "git",
  args: string[],
  cwd: string,
) => {
  ok: boolean;
  status: number;
  stdout: string;
  stderr: string;
};

type GitResult = ReturnType<GitExec>;

export class AriadneGit {
  constructor(
    readonly root: string,
    private readonly exec: GitExec,
  ) {}

  private capture(args: string[]): GitResult {
    return this.exec("git", args, this.root);
  }

  private require(args: string[], description: string): string {
    const result = this.capture(args);
    if (!result.ok) {
      const detail = result.stderr.trim() || result.stdout.trim();
      throw new Error(
        `Unable to ${description} (git exited ${result.status})${detail ? `: ${detail}` : ""}`,
      );
    }
    return result.stdout.trim();
  }

  assertRepository(): void {
    const result = this.capture(["rev-parse", "--show-toplevel"]);
    if (!result.ok) {
      throw new Error(`Ariadne requires a Git repository: ${this.root}`);
    }

    let configuredRoot: string;
    let discoveredRoot: string;
    try {
      configuredRoot = fs.realpathSync(this.root);
      discoveredRoot = fs.realpathSync(result.stdout.trim());
    } catch {
      throw new Error(`Ariadne could not resolve the Git repository root`);
    }
    if (configuredRoot !== discoveredRoot) {
      throw new Error(
        `Ariadne must run from the repository root: ${discoveredRoot}`,
      );
    }
  }

  currentBranch(): string {
    return this.require(["branch", "--show-current"], "read current branch");
  }

  head(): string {
    return this.require(["rev-parse", "HEAD"], "read HEAD");
  }

  statusPorcelain(): string {
    const result = this.capture([
      "status",
      "--porcelain=v1",
      "--untracked-files=all",
    ]);
    if (!result.ok) {
      const detail = result.stderr.trim() || result.stdout.trim();
      throw new Error(
        `Unable to read worktree status (git exited ${result.status})${detail ? `: ${detail}` : ""}`,
      );
    }
    return result.stdout;
  }

  assertReady(expectedBranch: string, allowActiveDiff: boolean): void {
    this.assertRepository();
    const actualBranch = this.currentBranch();
    if (actualBranch !== expectedBranch) {
      throw new Error(
        `Ariadne expected branch ${JSON.stringify(expectedBranch)}, found ${JSON.stringify(actualBranch)}`,
      );
    }
    if (!allowActiveDiff && this.statusPorcelain() !== "") {
      throw new Error("Ariadne requires a clean worktree before starting");
    }
  }

  stageAll(): void {
    this.require(["add", "--all"], "stage the Ariadne story delta");
  }

  commit(story: AriadneStory): string {
    if (/\r|\n/.test(story.id) || /\r|\n/.test(story.title)) {
      throw new Error("Ariadne commit IDs and titles cannot contain newlines");
    }
    const message = `feat(ariadne): ${story.id} ${story.title}`;
    this.require(["commit", "-m", message], "create Ariadne commit");
    return this.head();
  }
}
