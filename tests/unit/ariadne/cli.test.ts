import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ariadneExitCode, runAriadne } from "../../../src/ariadne/cli.js";
import { AriadneStateError } from "../../../src/ariadne/schema.js";
import { AriadneStore } from "../../../src/ariadne/store.js";
import { runCli } from "../../../src/cli.js";

const directories: string[] = [];

function temporaryProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ariadne-cli-"));
  directories.push(root);
  return root;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("runCli", () => {
  it("routes ariadne arguments without invoking the legacy installer", async () => {
    const runInstaller = vi.fn(async () => undefined);
    const runAriadne = vi.fn(async () => 0);

    await expect(
      runCli(["ariadne", "status", "--json"], {
        runInstaller,
        runAriadne,
      }),
    ).resolves.toBe(0);

    expect(runAriadne).toHaveBeenCalledWith(["status", "--json"]);
    expect(runInstaller).not.toHaveBeenCalled();
  });

  it("keeps legacy installer arguments unchanged", async () => {
    const runInstaller = vi.fn(async () => undefined);
    const runAriadne = vi.fn(async () => 0);

    await expect(
      runCli(["--doctor", "--json"], { runInstaller, runAriadne }),
    ).resolves.toBe(0);

    expect(runInstaller).toHaveBeenCalledWith(["--doctor", "--json"]);
    expect(runAriadne).not.toHaveBeenCalled();
  });
});

describe("runAriadne", () => {
  it.each([
    ["complete", 0],
    ["incomplete", 1],
    ["blocked", 1],
    ["budget_exhausted", 1],
    ["interrupted", 130],
    ["structural_error", 4],
  ] as const)("maps the %s loop outcome to exit code %i", (outcome, code) => {
    expect(ariadneExitCode(outcome)).toBe(code);
  });

  it("renders help without discovering a repository", async () => {
    const write = vi.fn();
    const findProjectRoot = vi.fn();

    await expect(
      runAriadne(["--help"], { write, findProjectRoot }),
    ).resolves.toBe(0);

    expect(write).toHaveBeenCalledWith(
      expect.stringContaining("agent-toolkit ariadne init"),
    );
    expect(findProjectRoot).not.toHaveBeenCalled();
  });

  it("maps invalid input and Git state failures to stable exit codes", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(runAriadne([])).resolves.toBe(2);
    await expect(
      runAriadne(["status"], {
        findProjectRoot: () => {
          throw new AriadneStateError("$git", "not a repository");
        },
      }),
    ).resolves.toBe(4);
  });

  it.each([
    ["missing", (store: AriadneStore) => store.ensureLayout()],
    [
      "malformed",
      (store: AriadneStore) => {
        store.ensureLayout();
        fs.writeFileSync(store.paths.config, "{not-json", "utf8");
      },
    ],
  ])("maps %s Ariadne store state to exit code 4", async (_kind, prepare) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const root = temporaryProject();
    const store = new AriadneStore(root);
    prepare(store);

    await expect(
      runAriadne(["run"], {
        cwd: () => root,
        findProjectRoot: () => root,
      }),
    ).resolves.toBe(4);
  });

  it("maps a real Git repository state failure to exit code 4", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const root = temporaryProject();
    const store = new AriadneStore(root);
    store.savePrd({
      schemaVersion: 1,
      project: "CLI fixture",
      branchName: "main",
      description: "A project without Git",
      userStories: [],
    });
    store.saveConfig({
      schemaVersion: 1,
      qualityChecks: [],
      maxAttemptsPerStory: 1,
    });

    await expect(
      runAriadne(["status"], {
        cwd: () => root,
        findProjectRoot: () => root,
      }),
    ).resolves.toBe(4);
  });

  it("maps a malformed public lock during status to the state exit code", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const root = temporaryProject();
    const store = new AriadneStore(root);
    store.savePrd({
      schemaVersion: 1,
      project: "CLI fixture",
      branchName: "main",
      description: "A project with a malformed lock",
      userStories: [],
    });
    store.saveConfig({
      schemaVersion: 1,
      qualityChecks: [],
      maxAttemptsPerStory: 1,
    });
    fs.writeFileSync(store.paths.lock, "not json", "utf8");

    await expect(
      runAriadne(["status"], {
        cwd: () => root,
        findProjectRoot: () => root,
        createGit: () =>
          ({
            assertRepository: () => undefined,
            currentBranch: () => "main",
            statusPorcelain: () => "",
          }) as never,
      }),
    ).resolves.toBe(4);
    expect(console.error).toHaveBeenCalledWith(
      ".ariadne/lock: Ariadne lock is malformed.",
    );
  });

  it("maps a contended public lock during run to the state exit code", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const root = temporaryProject();
    const store = new AriadneStore(root);
    store.saveConfig({
      schemaVersion: 1,
      runtime: "codex",
      qualityChecks: ["pnpm test"],
      maxAttemptsPerStory: 1,
    });

    await expect(
      runAriadne(["run"], {
        cwd: () => root,
        findProjectRoot: () => root,
        selectRuntime: async () => ({ name: "codex", adapter: {} }) as never,
        runLoop: async () => {
          throw new Error("Ariadne project is already locked by PID 1234.");
        },
      }),
    ).resolves.toBe(4);
    expect(console.error).toHaveBeenCalledWith(
      ".ariadne/lock: Ariadne project is already locked by PID 1234.",
    );
  });
});
