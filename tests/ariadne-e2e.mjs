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
const platformSmoke = process.argv.includes("--platform-smoke");

function discoverExecutable(name) {
  const lookup = spawnSync(
    process.platform === "win32" ? "where.exe" : "which",
    [name],
    { encoding: "utf8" },
  );
  const executable = lookup.stdout?.split(/\r?\n/).find(Boolean);
  if (lookup.status !== 0 || !executable) {
    throw new Error(`Unable to resolve executable: ${name}`);
  }
  return executable.trim();
}

const realGit = process.env.ARIADNE_REAL_GIT ?? discoverExecutable("git");
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
  if (process.platform !== "win32") {
    const gitProxy = path.join(bin, "git");
    fs.copyFileSync(gitProxySource, gitProxy);
    fs.chmodSync(gitProxy, 0o755);
  }
  for (const runtime of runtimes) {
    const executableName = runtimeExecutables[runtime];
    if (process.platform === "win32") {
      const executable = path.join(bin, `${executableName}.cmd`);
      fs.writeFileSync(
        executable,
        [
          "@echo off",
          `set "ARIADNE_FAKE_RUNTIME=${runtime}"`,
          `"${process.execPath}" "${fakeRuntimeSource}" %*`,
          "exit /b %errorlevel%",
          "",
        ].join("\r\n"),
        "utf8",
      );
    } else {
      const executable = path.join(bin, executableName);
      fs.copyFileSync(fakeRuntimeSource, executable);
      fs.chmodSync(executable, 0o755);
    }
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
    timeout: 90_000,
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
  assert.match(
    fs.readFileSync(path.join(fixture.project, ".gitignore"), "utf8"),
    /^\.ariadne-quarantine\.json$/m,
  );
  assert.match(
    fs.readFileSync(path.join(fixture.project, ".gitignore"), "utf8"),
    /^\.ariadne-quarantine\.checkpoint\.json$/m,
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
  requireStatus(doctor, 0, `${fixture.runtime} doctor`);
  const report = parseJson(doctor, "doctor");
  assert.equal(report.status.runtime.name, fixture.runtime);
  if (fixture.runtime === "gemini" || fixture.runtime === "antigravity") {
    assert.equal(report.issues[0].code, "runtime_unverified");
    assert.equal(report.ok, true);
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
  const subjects = git(fixture.project, "log", "--format=%s").split("\n");
  assert.equal(
    subjects.filter((subject) => subject.startsWith("feat(ariadne):")).length,
    expectedCommits,
    `Unexpected Ariadne commit history: ${JSON.stringify(subjects)}`,
  );
  if (process.platform === "win32") return;
  const calls = jsonLines(fixture.gitLog);
  const destructive = new Set(["push", "reset", "checkout", "clean", "revert"]);
  assert.equal(
    calls.some((args) => destructive.has(args[0])),
    false,
    `Ariadne invoked a forbidden Git command: ${JSON.stringify(calls)}`,
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
    git(fixture.project, "check-ignore", ".ariadne-quarantine.json"),
    ".ariadne-quarantine.json",
  );
  assert.equal(
    git(fixture.project, "check-ignore", ".ariadne-quarantine.checkpoint.json"),
    ".ariadne-quarantine.checkpoint.json",
  );
  assert.equal(
    git(fixture.project, "ls-files", ".ariadne/progress.md"),
    ".ariadne/progress.md",
  );
  assert.match(
    git(fixture.project, "log", "-1", "--pretty=%s"),
    /^feat\(ariadne\): US-001 /,
  );
}

function dumpFixtures() {
  const logs = path.join(temporaryRoot, "logs");
  if (fs.existsSync(logs)) {
    for (const entry of fs.readdirSync(logs).sort()) {
      const contents = fs
        .readFileSync(path.join(logs, entry), "utf8")
        .slice(0, 4_000);
      console.error(`--- logs/${entry}\n${contents}`);
    }
  }
  const projects = fs
    .readdirSync(temporaryRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(temporaryRoot, entry.name))
    .filter((project) => fs.existsSync(path.join(project, ".ariadne")));
  for (const project of projects) {
    const state = path.join(project, ".ariadne");
    const entries = fs
      .readdirSync(state, { recursive: true })
      .map(String)
      .filter((entry) => /\.(md|json|log|jsonl)$/.test(entry))
      .sort();
    console.error(`--- ${project}`);
    for (const entry of entries) {
      const absolute = path.join(state, entry);
      let contents = "";
      try {
        if (!fs.statSync(absolute).isFile()) continue;
        contents = fs.readFileSync(absolute, "utf8").slice(0, 4_000);
      } catch {
        continue;
      }
      console.error(`--- ${entry}\n${contents}`);
    }
  }
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

  if (!platformSmoke) {
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
    const repairProgress = fs.readFileSync(
      path.join(repair.project, ".ariadne", "progress.md"),
      "utf8",
    );
    assert.match(repairProgress, /summary: Repair US-001; token=\[REDACTED\]/);
    assert.match(repairProgress, /Retry with --password \[REDACTED\]/);
    assert.match(repairProgress, /check\.mjs.*failed/);
    assert.doesNotMatch(repairProgress, /e2e-(summary|learning)-secret/);
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
    const blockedDoctor = requireStatus(
      runCli(blocked, ["doctor", "--json"]),
      0,
      "blocked preserved diff doctor",
    );
    assert.equal(
      parseJson(blockedDoctor, "blocked doctor").issues.some(
        (issue) => issue.code === "dirty_worktree",
      ),
      false,
    );
    assertSafeGit(blocked, 0);

    const unsafeIgnore = createProject("unsafe-ignore", "codex");
    initialize(unsafeIgnore);
    requireStatus(
      runCli(unsafeIgnore, ["run", "--runtime", "codex", "--json"], {
        ARIADNE_FAKE_MODE: "unsafe-ignore",
      }),
      4,
      "runtime-negated machine-local ignores",
    );
    assert.equal(runtimeCalls(unsafeIgnore).length, 1);
    assert.equal(
      git(unsafeIgnore.project, "ls-files", ".ariadne/lock", ".ariadne/runs"),
      "",
    );
    assert.equal(
      git(
        unsafeIgnore.project,
        "diff",
        "--cached",
        "--name-only",
        "--",
        ".ariadne/lock",
        ".ariadne/runs",
      ),
      "",
    );
    assertSafeGit(unsafeIgnore, 0);

    const runDirSymlink = createProject("run-dir-symlink", "codex");
    initialize(runDirSymlink);
    requireStatus(
      runCli(runDirSymlink, ["run", "--runtime", "codex", "--json"], {
        ARIADNE_FAKE_MODE: "run-dir-symlink",
      }),
      4,
      "runtime-replaced run directory",
    );
    for (const artifact of [
      "process.json",
      "checks.json",
      "runtime.stdout.log",
      "runtime.stderr.log",
    ]) {
      assert.equal(
        fs.existsSync(path.join(runDirSymlink.project, artifact)),
        false,
        `Operational artifact escaped into project root: ${artifact}`,
      );
    }
    assert.equal(
      git(runDirSymlink.project, "diff", "--cached", "--name-only"),
      "",
    );
    assertSafeGit(runDirSymlink, 0);

    const outputRelocation = createProject("output-relocation", "codex");
    initialize(outputRelocation);
    requireStatus(
      runCli(outputRelocation, ["run", "--runtime", "codex", "--json"], {
        ARIADNE_FAKE_MODE: "output-relocation",
      }),
      4,
      "runtime-relocated output leaf",
    );
    const relocatedOutput = path.join(
      outputRelocation.project,
      "runtime-output.txt",
    );
    assert.match(
      fs.readFileSync(relocatedOutput, "utf8"),
      /e2e-relocated-output-secret/,
    );
    assert.equal(
      git(outputRelocation.project, "diff", "--cached", "--name-only"),
      "",
    );
    assert.equal(
      git(outputRelocation.project, "ls-tree", "-r", "--name-only", "HEAD")
        .split("\n")
        .includes("runtime-output.txt"),
      false,
    );
    assert.equal(
      fs.existsSync(
        path.join(outputRelocation.project, ".ariadne-quarantine.json"),
      ),
      true,
    );
    const outputCallsBeforeRetry = runtimeCalls(outputRelocation).length;
    requireStatus(
      runCli(outputRelocation, ["run", "--runtime", "codex", "--json"], {
        ARIADNE_FAKE_MODE: "happy",
      }),
      4,
      "output relocation quarantine retry",
    );
    assert.equal(runtimeCalls(outputRelocation).length, outputCallsBeforeRetry);
    assertSafeGit(outputRelocation, 0);

    const backgroundOutput = createProject(
      "background-output-relocation",
      "codex",
    );
    initialize(backgroundOutput);
    const backgroundReady = path.join(backgroundOutput.stateDir, "ready");
    const backgroundTrigger = path.join(backgroundOutput.stateDir, "trigger");
    const backgroundAck = path.join(backgroundOutput.stateDir, "ack");
    requireStatus(
      runCli(backgroundOutput, ["run", "--runtime", "codex", "--json"], {
        ARIADNE_FAKE_MODE: "background-output-relocation",
        ARIADNE_BACKGROUND_READY: backgroundReady,
        ARIADNE_BACKGROUND_TRIGGER: backgroundTrigger,
        ARIADNE_BACKGROUND_ACK: backgroundAck,
      }),
      4,
      "background descendant relocated output leaf",
    );
    assert.equal(fs.readFileSync(backgroundAck, "utf8"), "ok\n");
    assert.match(
      fs.readFileSync(
        path.join(backgroundOutput.project, "background-output.txt"),
        "utf8",
      ),
      /e2e-background-output-secret/,
    );
    const backgroundCallsBeforeRetry = runtimeCalls(backgroundOutput).length;
    requireStatus(
      runCli(backgroundOutput, ["run", "--runtime", "codex", "--json"], {
        ARIADNE_FAKE_MODE: "happy",
      }),
      4,
      "background descendant quarantine retry",
    );
    assert.equal(
      runtimeCalls(backgroundOutput).length,
      backgroundCallsBeforeRetry,
    );
    assertSafeGit(backgroundOutput, 0);

    const illicitCommit = createProject("illicit-commit", "codex");
    initialize(illicitCommit);
    requireStatus(
      runCli(illicitCommit, ["run", "--runtime", "codex", "--json"], {
        ARIADNE_FAKE_MODE: "illicit-commit",
      }),
      4,
      "runtime-owned illicit commit",
    );
    const violationPath = path.join(
      illicitCommit.project,
      ".ariadne-quarantine.json",
    );
    assert.equal(fs.existsSync(violationPath), true);
    const callsBeforeRetry = runtimeCalls(illicitCommit).length;
    requireStatus(
      runCli(illicitCommit, ["run", "--runtime", "codex", "--json"], {
        ARIADNE_FAKE_MODE: "happy",
      }),
      4,
      "unresolved ownership marker retry",
    );
    assert.equal(runtimeCalls(illicitCommit).length, callsBeforeRetry);
    assert.equal(
      git(illicitCommit.project, "log", "--format=%s")
        .split("\n")
        .some((subject) => subject.startsWith("feat(ariadne):")),
      false,
    );
    const quarantinedPrd = fs.readFileSync(
      path.join(illicitCommit.project, ".ariadne", "prd.json"),
      "utf8",
    );
    requireStatus(
      runCli(illicitCommit, [
        "init",
        "--runtime",
        "codex",
        "--check",
        `${JSON.stringify(process.execPath)} check.mjs`,
        "--json",
      ]),
      4,
      "ownership quarantine init",
    );
    assert.equal(
      fs.readFileSync(
        path.join(illicitCommit.project, ".ariadne", "prd.json"),
        "utf8",
      ),
      quarantinedPrd,
    );

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
      0,
      "dry run",
    );
    assert.equal(parseJson(dryResult, "dry run").outcome, "incomplete");
    assert.equal(runtimeCalls(dryRun).length, 0);
    assert.equal(git(dryRun.project, "status", "--porcelain=v1"), beforeDryRun);
    assert.equal(
      fs.readFileSync(
        path.join(dryRun.project, ".ariadne", "prd.json"),
        "utf8",
      ),
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
      ownerToken: "33333333-3333-4333-8333-333333333333",
    });
    requireStatus(
      runCli(stale, ["run", "--runtime", "codex", "--json"]),
      0,
      "stale lock",
    );
    assert.equal(
      fs
        .readdirSync(
          path.join(stale.project, ".ariadne", "runs", ".lock-coordinator"),
        )
        .some((entry) => String(entry).startsWith(".public-lock-")),
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
  }

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
  dumpFixtures();
  throw error;
}
