import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { REPO_ROOT } from "./context.js";
import { die, info, ok } from "./logger.js";
import { run } from "./system.js";

export type ReleaseKind = "patch" | "minor" | "major";

type PackageJson = {
  version: string;
  [key: string]: unknown;
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

function runChecked(command: string, args: string[]): void {
  const result = run(command, args);
  if (!result.ok) {
    throw new Error(
      `${command} ${args.join(" ")} failed with ${result.status}`,
    );
  }
}

export function runReleaseCli(argv: string[]): void {
  const kind = argv[0];
  assertReleaseKind(kind);
  const push = argv.includes("--push");
  const noCheck = argv.includes("--no-check");

  const packagePath = path.join(REPO_ROOT, "package.json");
  const readmePath = path.join(REPO_ROOT, "README.md");
  const packageJson = readPackageJson(packagePath);
  const nextVersion = bumpVersion(packageJson.version, kind);
  const tagName = `v${nextVersion}`;

  packageJson.version = nextVersion;
  writeJson(packagePath, packageJson);
  fs.writeFileSync(
    readmePath,
    updateReadmeReleaseTag(fs.readFileSync(readmePath, "utf8"), nextVersion),
  );

  ok(`Prepared ${tagName}.`);

  if (!noCheck) {
    info("Running release gate: pnpm run check");
    runChecked("pnpm", ["run", "check"]);
  }

  runChecked("git", ["add", "package.json", "README.md"]);
  runChecked("git", ["commit", "-m", `chore: release ${nextVersion}`]);
  runChecked("git", ["tag", tagName]);
  ok(`Created release commit and tag ${tagName}.`);

  if (push) {
    runChecked("git", ["push", "origin", "main", tagName]);
    ok(`Pushed main and ${tagName}.`);
  } else {
    info(`Push with: git push origin main ${tagName}`);
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  runReleaseCli(process.argv.slice(2));
}
