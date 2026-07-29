import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const enabled = process.env.ARIADNE_E2E === "1";
const runtime = process.env.ARIADNE_RUNTIME;
if (!enabled || !runtime) {
  console.log("Ariadne authenticated smoke skipped");
  process.exit(0);
}

const supportedRuntimes = new Set([
  "claude",
  "codex",
  "opencode",
  "gemini",
  "antigravity",
]);
if (!supportedRuntimes.has(runtime)) {
  console.error(`Unsupported ARIADNE_RUNTIME: ${runtime}`);
  process.exit(2);
}

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const cli = path.join(repositoryRoot, "dist", "bin", "agent-toolkit.js");
const temporaryRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), `ariadne-real-${runtime}-`),
);

function run(command, args) {
  return spawnSync(command, args, {
    cwd: temporaryRoot,
    env: process.env,
    encoding: "utf8",
    timeout: 10 * 60 * 1_000,
  });
}

function requireSuccess(result, label) {
  assert.equal(
    result.status,
    0,
    `${label} failed with ${result.status}\nstdout:\n${result.stdout ?? ""}\nstderr:\n${result.stderr ?? result.error?.message ?? ""}`,
  );
  return result;
}

function git(...args) {
  return requireSuccess(run("git", args), `git ${args[0]}`).stdout.trim();
}

try {
  assert.equal(
    fs.existsSync(cli),
    true,
    `Build the compiled CLI first: ${cli}`,
  );
  git("init", "-b", "test/ariadne-authenticated-smoke");
  git("config", "user.name", "Ariadne Smoke");
  git("config", "user.email", "ariadne-smoke@example.test");
  fs.writeFileSync(path.join(temporaryRoot, "answer.txt"), "pending\n", "utf8");
  fs.writeFileSync(
    path.join(temporaryRoot, "check.mjs"),
    'import fs from "node:fs";\nif (fs.readFileSync("answer.txt", "utf8").trim() !== "42") process.exit(1);\n',
    "utf8",
  );
  fs.writeFileSync(
    path.join(temporaryRoot, "prd.json"),
    `${JSON.stringify(
      {
        project: "Ariadne authenticated smoke",
        branchName: "test/ariadne-authenticated-smoke",
        description: "Verify one authenticated runtime end to end.",
        userStories: [
          {
            id: "SMOKE-001",
            title: "Write the answer",
            description:
              "Replace answer.txt with exactly 42 followed by a newline.",
            acceptanceCriteria: ["answer.txt contains exactly 42"],
            priority: 1,
            passes: false,
          },
        ],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  git("add", "--all");
  git("commit", "-m", "test: seed authenticated Ariadne smoke");

  requireSuccess(
    run(process.execPath, [
      cli,
      "ariadne",
      "init",
      "--runtime",
      runtime,
      "--check",
      `${JSON.stringify(process.execPath)} check.mjs`,
      "--json",
    ]),
    "ariadne init",
  );
  git("add", "--all");
  git("commit", "-m", "test: initialize authenticated Ariadne smoke");
  const before = Number.parseInt(git("rev-list", "--count", "HEAD"), 10);
  const execution = requireSuccess(
    run(process.execPath, [
      cli,
      "ariadne",
      "run",
      "--runtime",
      runtime,
      "--json",
    ]),
    `ariadne run (${runtime})`,
  );
  const summary = JSON.parse(execution.stdout);
  assert.equal(summary.outcome, "complete");
  assert.equal(
    fs.readFileSync(path.join(temporaryRoot, "answer.txt"), "utf8"),
    "42\n",
  );
  assert.equal(
    Number.parseInt(git("rev-list", "--count", "HEAD"), 10),
    before + 1,
  );
  assert.match(git("log", "-1", "--pretty=%s"), /^feat\(ariadne\): SMOKE-001 /);
  const prd = JSON.parse(
    fs.readFileSync(path.join(temporaryRoot, ".ariadne", "prd.json"), "utf8"),
  );
  assert.equal(prd.userStories[0].status, "completed");
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
  console.log(`Ariadne authenticated smoke passed for ${runtime}`);
} catch (error) {
  console.error(
    `Ariadne authenticated smoke failed; project retained at ${temporaryRoot}`,
  );
  throw error;
}
