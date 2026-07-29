import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "dist", "bin", "agent-toolkit.js");
const fakeRuntimeSource = path.join(
  root,
  "tests",
  "fixtures",
  "ariadne-fake-runtime.mjs",
);
const gitProxySource = path.join(
  root,
  "tests",
  "fixtures",
  "ariadne-git-proxy.mjs",
);
const realGit = process.env.ARIADNE_REAL_GIT ?? "git";
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ariadne-e2e-"));
const runtimeExecutables = {
  claude: "claude",
  codex: "codex",
  opencode: "opencode",
  gemini: "gemini",
  antigravity: "agy",
};

function command(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: options.env ?? process.env,
    encoding: "utf8",
    timeout: options.timeout ?? 30_000,
  });
  return {
    status: result.status ?? (result.signal === "SIGINT" ? 130 : 1),
    stdout: result.stdout ?? "",
    stderr: result.stderr || result.error?.message || "",
  };
}

function requireStatus(result, expected, label) {
  assert.equal(
    result.status,
    expected,
    `${label} exited ${result.status}, expected ${expected}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return result;
}

function git(project, ...args) {
  return requireStatus(
    command(realGit, args, { cwd: project }),
    0,
    `git ${args[0]}`,
  ).stdout.trim();
}

function writeJson(destination, value) {
  fs.writeFileSync(destination, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function createBin(name, runtimes) {
  const bin = path.join(temporaryRoot, `${name}-bin`);
  fs.mkdirSync(bin, { recursive: true });
  const gitProxy = path.join(bin, "git");
  fs.copyFileSync(gitProxySource, gitProxy);
  fs.chmodSync(gitProxy, 0o755);
  for (const runtime of runtimes) {
    const executable = path.join(bin, runtimeExecutables[runtime]);
    fs.copyFileSync(fakeRuntimeSource, executable);
    fs.chmodSync(executable, 0o755);
  }
  return bin;
}

function legacyPrd(shape, branchName) {
  const stories = [
    {
      id: "US-001",
      title: "Write the fixture",
      description: "Write the word complete to fixture.txt.",
      acceptanceCriteria: ["fixture.txt contains complete"],
      priority: 1,
      passes: false,
    },
  ];
  return {
    project: `Ariadne ${shape} fixture`,
    branchName,
    description: "Deterministic compiled CLI fixture",
    [shape === "helix" ? "stories" : "userStories"]: stories,
  };
}

function createProject(name, runtime, shape = "ralph", allRuntimes = false) {
  const projectPath = path.join(temporaryRoot, name);
  const branchName = `test/${name}`;
  const fakeLog = path.join(temporaryRoot, "logs", `${name}-runtime.jsonl`);
  const gitLog = path.join(temporaryRoot, "logs", `${name}-git.jsonl`);
  const stateDir = path.join(temporaryRoot, "state", name);
  fs.mkdirSync(projectPath, { recursive: true });
  const project = fs.realpathSync(projectPath);
  git(project, "init", "-b", branchName);
  git(project, "config", "user.name", "Ariadne E2E");
  git(project, "config", "user.email", "ariadne@example.test");
  fs.writeFileSync(path.join(project, "fixture.txt"), "pending\n", "utf8");
  fs.writeFileSync(
    path.join(project, "check.mjs"),
    'import fs from "node:fs";\nif (fs.readFileSync("fixture.txt", "utf8") !== "complete\\n") process.exit(1);\n',
    "utf8",
  );
  writeJson(path.join(project, "prd.json"), legacyPrd(shape, branchName));
  git(project, "add", "--all");
  git(project, "commit", "-m", "test: seed Ariadne fixture");
  const runtimes = allRuntimes ? Object.keys(runtimeExecutables) : [runtime];
  const bin = createBin(name, runtimes);
  const env = {
    ...process.env,
    PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
    ARIADNE_REAL_GIT: realGit,
    ARIADNE_GIT_LOG: gitLog,
    ARIADNE_FAKE_LOG: fakeLog,
    ARIADNE_FAKE_STATE_DIR: stateDir,
    ARIADNE_FAKE_MODE: "happy",
  };
  return { project, branchName, runtime, fakeLog, gitLog, stateDir, env };
}

function runCli(fixture, args, overrides = {}) {
  return command(process.execPath, [cli, "ariadne", ...args], {
    cwd: fixture.project,
    env: { ...fixture.env, ...overrides },
    timeout: 45_000,
  });
}

function parseJson(result, label) {
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(
      `${label} did not emit JSON: ${error.message}\n${result.stdout}`,
    );
  }
}

function initialize(fixture) {
  const source = fs.readFileSync(
    path.join(fixture.project, "prd.json"),
    "utf8",
  );
  const check = `${JSON.stringify(process.execPath)} check.mjs`;
  const init = requireStatus(
    runCli(fixture, [
      "init",
      "--runtime",
      fixture.runtime,
      "--check",
      check,
      "--json",
    ]),
    0,
    `${fixture.runtime} init`,
  );
  assert.equal(parseJson(init, "init").outcome, "initialized");
  assert.equal(
    fs.readFileSync(path.join(fixture.project, "prd.json"), "utf8"),
    source,
  );
  assert.match(
    fs.readFileSync(path.join(fixture.project, ".gitignore"), "utf8"),
    /^\.ariadne\/lock$/m,
  );
  assert.match(
    fs.readFileSync(path.join(fixture.project, ".gitignore"), "utf8"),
    /^\.ariadne\/runs\/$/m,
  );
  git(fixture.project, "add", "--all");
  git(fixture.project, "commit", "-m", "test: initialize Ariadne fixture");

  const status = requireStatus(
    runCli(fixture, ["status", "--json"]),
    0,
    "status",
  );
  assert.deepEqual(parseJson(status, "initial status").stories, {
    pending: 1,
    inProgress: 0,
    completed: 0,
    blocked: 0,
  });
  const doctor = runCli(fixture, ["doctor", "--json"]);
  const expectedDoctor =
    fixture.runtime === "gemini" || fixture.runtime === "antigravity" ? 4 : 0;
  requireStatus(doctor, expectedDoctor, `${fixture.runtime} doctor`);
  const report = parseJson(doctor, "doctor");
  assert.equal(report.status.runtime.name, fixture.runtime);
  if (expectedDoctor === 4) {
    assert.equal(report.issues[0].code, "runtime_unverified");
  } else {
    assert.equal(report.ok, true);
  }
  fs.writeFileSync(fixture.gitLog, "", "utf8");
  fs.writeFileSync(fixture.fakeLog, "", "utf8");
}

function jsonLines(source) {
  if (!fs.existsSync(source)) return [];
  return fs
    .readFileSync(source, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function runtimeCalls(fixture) {
  return jsonLines(fixture.fakeLog).filter((entry) =>
    entry.args.some((arg) => arg.startsWith("Read ")),
  );
}

function expectedArgs(runtime, project, instruction) {
  switch (runtime) {
    case "claude":
      return ["--print", "--dangerously-skip-permissions", instruction];
    case "codex":
      return [
        "exec",
        "--dangerously-bypass-approvals-and-sandbox",
        "--ephemeral",
        "-C",
        project,
        instruction,
      ];
    case "opencode":
      return ["run", "--auto", "--dir", project, instruction];
    case "gemini":
      return [
        "--prompt",
        instruction,
        "--approval-mode",
        "yolo",
        "--skip-trust",
      ];
    case "antigravity":
      return ["--print", "--dangerously-skip-permissions", instruction];
    default:
      throw new Error(`Unexpected runtime: ${runtime}`);
  }
}

function assertSafeGit(fixture, expectedCommits) {
  const calls = jsonLines(fixture.gitLog);
  const destructive = new Set(["push", "reset", "checkout", "clean", "revert"]);
  assert.equal(
    calls.some((args) => destructive.has(args[0])),
    false,
    `Ariadne invoked a forbidden Git command: ${JSON.stringify(calls)}`,
  );
  assert.equal(
    calls.filter((args) => args[0] === "commit").length,
    expectedCommits,
    `Unexpected Ariadne commit count: ${JSON.stringify(calls)}`,
  );
}

function assertSuccessfulRun(fixture, expectedAttempts = 1) {
  const status = requireStatus(
    runCli(fixture, ["status", "--json"]),
    0,
    "final status",
  );
  assert.deepEqual(parseJson(status, "final status").stories, {
    pending: 0,
    inProgress: 0,
    completed: 1,
    blocked: 0,
  });
  const prd = JSON.parse(
    fs.readFileSync(path.join(fixture.project, ".ariadne", "prd.json"), "utf8"),
  );
  assert.equal(prd.userStories[0].attempts, expectedAttempts);
  assert.equal(prd.userStories[0].status, "completed");
  assert.equal(git(fixture.project, "status", "--porcelain=v1"), "");
  assert.equal(
    git(fixture.project, "check-ignore", ".ariadne/runs"),
    ".ariadne/runs",
  );
  assert.equal(
    git(fixture.project, "check-ignore", ".ariadne/runs/.lock-coordinator"),
    ".ariadne/runs/.lock-coordinator",
  );
  assert.equal(git(fixture.project, "ls-files", ".ariadne/runs"), "");
  assert.equal(
    git(fixture.project, "ls-files", ".ariadne/progress.md"),
    ".ariadne/progress.md",
  );
  assert.match(
    git(fixture.project, "log", "-1", "--pretty=%s"),
    /^feat\(ariadne\): US-001 /,
  );
}

function runHappyRuntime(runtime) {
  const fixture = createProject(`happy-${runtime}`, runtime);
  initialize(fixture);
  const result = requireStatus(
    runCli(fixture, ["run", "--runtime", runtime, "--json"]),
    0,
    `${runtime} run`,
  );
  assert.equal(parseJson(result, `${runtime} run`).outcome, "complete");
  const calls = runtimeCalls(fixture);
  assert.equal(calls.length, 1);
  const instruction = calls[0].args.find((arg) => arg.startsWith("Read "));
  assert.deepEqual(
    calls[0].args,
    expectedArgs(runtime, fixture.project, instruction),
  );
  assertSuccessfulRun(fixture);
  assertSafeGit(fixture, 1);
}

try {
  assert.equal(fs.existsSync(cli), true, `Compiled CLI is missing: ${cli}`);
  for (const runtime of Object.keys(runtimeExecutables))
    runHappyRuntime(runtime);

  const repair = createProject("repair", "codex");
  initialize(repair);
  requireStatus(
    runCli(repair, ["run", "--runtime", "codex", "--json"], {
      ARIADNE_FAKE_MODE: "repair",
    }),
    0,
    "check failure followed by repair",
  );
  assert.equal(runtimeCalls(repair).length, 2);
  assertSuccessfulRun(repair, 2);
  assertSafeGit(repair, 1);

  const blocked = createProject("blocked", "codex");
  initialize(blocked);
  const blockedRun = requireStatus(
    runCli(blocked, ["run", "--runtime", "codex", "--json"], {
      ARIADNE_FAKE_MODE: "blocked",
    }),
    1,
    "three failed checks",
  );
  assert.equal(parseJson(blockedRun, "blocked run").outcome, "blocked");
  assert.equal(runtimeCalls(blocked).length, 3);
  assert.equal(
    JSON.parse(
      fs.readFileSync(path.join(blocked.project, ".ariadne", "prd.json")),
    ).userStories[0].status,
    "blocked",
  );
  assertSafeGit(blocked, 0);

  const missing = createProject("missing-result", "codex");
  initialize(missing);
  requireStatus(
    runCli(missing, ["run", "--runtime", "codex", "--json"], {
      ARIADNE_FAKE_MODE: "missing-result",
    }),
    1,
    "missing result",
  );
  assert.equal(runtimeCalls(missing).length, 3);
  assert.match(
    fs.readFileSync(
      path.join(missing.project, ".ariadne", "progress.md"),
      "utf8",
    ),
    /failure category: result/,
  );
  assertSafeGit(missing, 0);

  const dryRun = createProject("dry-run", "codex");
  initialize(dryRun);
  const beforeDryRun = git(dryRun.project, "status", "--porcelain=v1");
  const beforePrd = fs.readFileSync(
    path.join(dryRun.project, ".ariadne", "prd.json"),
    "utf8",
  );
  const dryResult = requireStatus(
    runCli(dryRun, ["run", "--runtime", "codex", "--dry-run", "--json"]),
    1,
    "dry run",
  );
  assert.equal(parseJson(dryResult, "dry run").outcome, "incomplete");
  assert.equal(runtimeCalls(dryRun).length, 0);
  assert.equal(git(dryRun.project, "status", "--porcelain=v1"), beforeDryRun);
  assert.equal(
    fs.readFileSync(path.join(dryRun.project, ".ariadne", "prd.json"), "utf8"),
    beforePrd,
  );
  assertSafeGit(dryRun, 0);

  const dirty = createProject("dirty", "codex");
  initialize(dirty);
  fs.writeFileSync(path.join(dirty.project, "dirty.txt"), "dirty\n", "utf8");
  requireStatus(
    runCli(dirty, ["run", "--runtime", "codex", "--json"]),
    4,
    "dirty initial worktree",
  );
  assert.equal(runtimeCalls(dirty).length, 0);
  assertSafeGit(dirty, 0);

  const ambiguous = createProject("ambiguous", "codex", "ralph", true);
  initialize(ambiguous);
  const configPath = path.join(ambiguous.project, ".ariadne", "config.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  delete config.runtime;
  writeJson(configPath, config);
  git(ambiguous.project, "add", configPath);
  git(ambiguous.project, "commit", "-m", "test: remove configured runtime");
  fs.writeFileSync(ambiguous.gitLog, "", "utf8");
  requireStatus(runCli(ambiguous, ["run", "--json"]), 3, "ambiguous runtime");
  assert.equal(runtimeCalls(ambiguous).length, 0);
  assertSafeGit(ambiguous, 0);

  const stale = createProject("stale-lock", "codex");
  initialize(stale);
  writeJson(path.join(stale.project, ".ariadne", "lock"), {
    schemaVersion: 1,
    pid: 99999999,
    startedAt: "2026-01-01T00:00:00.000Z",
    runId: "stale-run",
  });
  requireStatus(
    runCli(stale, ["run", "--runtime", "codex", "--json"]),
    0,
    "stale lock",
  );
  assert.equal(
    fs
      .readdirSync(path.join(stale.project, ".ariadne", "runs"), {
        recursive: true,
      })
      .some((entry) => String(entry).includes("recovered-lock-stale-run")),
    true,
  );
  assertSuccessfulRun(stale);
  assertSafeGit(stale, 1);

  const interrupted = createProject("interrupted", "codex");
  initialize(interrupted);
  const interruptedRun = requireStatus(
    runCli(interrupted, ["run", "--runtime", "codex", "--json"], {
      ARIADNE_FAKE_MODE: "interrupt",
    }),
    130,
    "interrupted run",
  );
  assert.equal(
    parseJson(interruptedRun, "interrupted run").outcome,
    "interrupted",
  );
  assert.equal(
    JSON.parse(
      fs.readFileSync(path.join(interrupted.project, ".ariadne", "prd.json")),
    ).userStories[0].status,
    "in_progress",
  );
  requireStatus(
    runCli(interrupted, ["run", "--runtime", "codex", "--json"], {
      ARIADNE_FAKE_MODE: "happy",
    }),
    0,
    "interrupted resume",
  );
  assertSuccessfulRun(interrupted, 2);
  assertSafeGit(interrupted, 1);

  const helix = createProject("helix-import", "codex", "helix");
  initialize(helix);
  requireStatus(
    runCli(helix, ["run", "--runtime", "codex", "--json"]),
    0,
    "Helix import",
  );
  assertSuccessfulRun(helix);
  assertSafeGit(helix, 1);

  const usage = createProject("usage", "codex");
  requireStatus(
    runCli(usage, ["run", "--max-iterations", "0"]),
    2,
    "invalid usage",
  );

  const legacyHelp = requireStatus(
    command(process.execPath, [cli, "--help"]),
    0,
    "legacy help",
  );
  assert.match(legacyHelp.stdout, /Agent Toolkit/);
  const ariadneHelp = requireStatus(
    command(process.execPath, [cli, "ariadne", "--help"]),
    0,
    "Ariadne help",
  );
  for (const subcommand of ["init", "run", "status", "doctor"]) {
    assert.match(ariadneHelp.stdout, new RegExp(`ariadne ${subcommand}`));
  }

  fs.rmSync(temporaryRoot, { recursive: true, force: true });
  console.log("Ariadne compiled CLI E2E passed");
} catch (error) {
  console.error(`Ariadne E2E fixture retained at ${temporaryRoot}`);
  throw error;
}
