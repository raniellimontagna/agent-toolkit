import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { REPO_ROOT } from "./context.js";
import { die, info, ok } from "./logger.js";
import { type RunResult, run } from "./system.js";

export type ReleaseKind = "patch" | "minor" | "major";

type PackageJson = {
  version: string;
  [key: string]: unknown;
};

type ReleaseRunOptions = {
  cwd?: string;
  capture?: boolean;
};

export type ReleaseCommandRunner = (
  command: string,
  args?: string[],
  options?: ReleaseRunOptions,
) => RunResult;

export type ReleaseExecutionContext = {
  repoRoot?: string;
  runner?: ReleaseCommandRunner;
};

type ReleaseRepositoryContext = {
  repoRoot: string;
  runner: ReleaseCommandRunner;
};

function assertReleaseKind(
  value: string | undefined,
): asserts value is ReleaseKind {
  if (value !== "patch" && value !== "minor" && value !== "major") {
    die("Release kind must be patch, minor or major.");
  }
}

export function bumpVersion(version: string, kind: ReleaseKind): string {
  const parts = version.split(".").map((part) => Number.parseInt(part, 10));
  if (
    parts.length !== 3 ||
    parts.some((part) => !Number.isInteger(part) || part < 0)
  ) {
    throw new Error(`Unsupported semver version: ${version}`);
  }

  const [major = 0, minor = 0, patch = 0] = parts;
  switch (kind) {
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "major":
      return `${major + 1}.0.0`;
  }
}

export function updateReadmeReleaseTag(
  readme: string,
  version: string,
): string {
  return readme
    .replace(/git tag v[0-9]+\.[0-9]+\.[0-9]+/g, `git tag v${version}`)
    .replace(
      /git push origin v[0-9]+\.[0-9]+\.[0-9]+/g,
      `git push origin v${version}`,
    );
}

function readPackageJson(filePath: string): PackageJson {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as PackageJson;
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function gitFailureDetail(result: RunResult): string {
  return (
    result.stderr.trim() || result.error?.message || `status ${result.status}`
  );
}

function inspectGit(
  context: ReleaseRepositoryContext,
  args: string[],
): RunResult {
  return context.runner("git", args, {
    cwd: context.repoRoot,
    capture: true,
  });
}

function requireSuccessfulInspection(
  result: RunResult,
  description: string,
): RunResult {
  if (!result.ok) {
    die(`Unable to ${description}: ${gitFailureDetail(result)}`);
  }
  return result;
}

function canonicalPath(value: string): string {
  try {
    return fs.realpathSync.native(value);
  } catch {
    return path.resolve(value);
  }
}

function assertLocalReleaseState(
  context: ReleaseRepositoryContext,
  tagName: string,
): void {
  const topLevel = requireSuccessfulInspection(
    inspectGit(context, ["rev-parse", "--show-toplevel"]),
    "inspect the repository root",
  ).stdout.trim();
  if (canonicalPath(topLevel) !== canonicalPath(context.repoRoot)) {
    die(
      `Release repository root mismatch: expected ${context.repoRoot}, found ${topLevel}.`,
    );
  }

  const branch = requireSuccessfulInspection(
    inspectGit(context, ["branch", "--show-current"]),
    "inspect the active branch",
  ).stdout.trim();
  if (branch !== "main") {
    die(
      `Releases must be created from main; current branch is ${branch || "detached HEAD"}.`,
    );
  }

  const status = requireSuccessfulInspection(
    inspectGit(context, ["status", "--porcelain=v1", "--untracked-files=all"]),
    "inspect repository changes",
  ).stdout;
  if (status.trim()) {
    die(
      "Release requires a clean repository with no staged, unstaged or untracked changes.",
    );
  }

  const localTag = inspectGit(context, [
    "rev-parse",
    "--verify",
    "--quiet",
    `refs/tags/${tagName}`,
  ]);
  if (localTag.ok) {
    die(`Release tag ${tagName} already exists locally.`);
  }
  if (localTag.error || localTag.status !== 1) {
    die(
      `Unable to inspect local tag ${tagName}: ${gitFailureDetail(localTag)}`,
    );
  }
}

function assertRemoteReleaseState(
  context: ReleaseRepositoryContext,
  tagName: string,
): void {
  requireSuccessfulInspection(
    inspectGit(context, [
      "fetch",
      "--quiet",
      "--no-tags",
      "origin",
      "+refs/heads/main:refs/remotes/origin/main",
    ]),
    "fetch origin/main",
  );

  const upstream = requireSuccessfulInspection(
    inspectGit(context, [
      "rev-parse",
      "--abbrev-ref",
      "--symbolic-full-name",
      "@{upstream}",
    ]),
    "inspect main's upstream",
  ).stdout.trim();
  if (upstream !== "origin/main") {
    die(
      `Release main must track origin/main; current upstream is ${upstream || "unset"}.`,
    );
  }

  const divergence = requireSuccessfulInspection(
    inspectGit(context, [
      "rev-list",
      "--left-right",
      "--count",
      "origin/main...HEAD",
    ]),
    "compare main with origin/main",
  ).stdout.trim();
  const [behindText, aheadText, ...extra] = divergence.split(/\s+/);
  const behind = Number.parseInt(behindText ?? "", 10);
  const ahead = Number.parseInt(aheadText ?? "", 10);
  if (
    extra.length > 0 ||
    !/^\d+$/.test(behindText ?? "") ||
    !/^\d+$/.test(aheadText ?? "") ||
    !Number.isSafeInteger(behind) ||
    !Number.isSafeInteger(ahead)
  ) {
    die(
      `Unable to compare main with origin/main: unexpected output ${JSON.stringify(divergence)}.`,
    );
  }
  if (behind > 0) {
    die(`Release main is behind origin/main by ${behind} commit(s).`);
  }

  const remoteTag = inspectGit(context, [
    "ls-remote",
    "--exit-code",
    "--tags",
    "origin",
    `refs/tags/${tagName}`,
  ]);
  if (remoteTag.ok) {
    die(`Release tag ${tagName} already exists on origin.`);
  }
  if (remoteTag.error || remoteTag.status !== 2) {
    die(
      `Unable to inspect remote tag ${tagName}: ${gitFailureDetail(remoteTag)}`,
    );
  }
}

function runChecked(
  runner: ReleaseCommandRunner,
  repoRoot: string,
  command: string,
  args: string[],
): void {
  const result = runner(command, args, { cwd: repoRoot });
  if (!result.ok) {
    throw new Error(
      `${command} ${args.join(" ")} failed with ${result.status}`,
    );
  }
}

export function runReleaseCli(
  argv: string[],
  context?: ReleaseExecutionContext,
): void {
  const kind = argv[0];
  assertReleaseKind(kind);
  const push = argv.includes("--push");
  const noCheck = argv.includes("--no-check");

  const repoRoot = context?.repoRoot ?? REPO_ROOT;
  const runner = context?.runner ?? run;
  const repositoryContext = { repoRoot, runner };

  const packagePath = path.join(repoRoot, "package.json");
  const readmePath = path.join(repoRoot, "README.md");
  const packageJson = readPackageJson(packagePath);
  const nextVersion = bumpVersion(packageJson.version, kind);
  const tagName = `v${nextVersion}`;

  assertLocalReleaseState(repositoryContext, tagName);
  if (push) {
    assertRemoteReleaseState(repositoryContext, tagName);
  }

  packageJson.version = nextVersion;
  writeJson(packagePath, packageJson);
  fs.writeFileSync(
    readmePath,
    updateReadmeReleaseTag(fs.readFileSync(readmePath, "utf8"), nextVersion),
  );

  ok(`Prepared ${tagName}.`);

  if (!noCheck) {
    info("Running release gate: pnpm run check");
    runChecked(runner, repoRoot, "pnpm", ["run", "check"]);
  }

  runChecked(runner, repoRoot, "git", ["add", "package.json", "README.md"]);
  runChecked(runner, repoRoot, "git", [
    "commit",
    "-m",
    `chore: release ${nextVersion}`,
  ]);
  runChecked(runner, repoRoot, "git", ["tag", tagName]);
  ok(`Created release commit and tag ${tagName}.`);

  if (push) {
    runChecked(runner, repoRoot, "git", [
      "push",
      "--atomic",
      "origin",
      "main",
      tagName,
    ]);
    ok(`Pushed main and ${tagName}.`);
  } else {
    info(`Push with: git push origin main ${tagName}`);
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  runReleaseCli(process.argv.slice(2));
}
