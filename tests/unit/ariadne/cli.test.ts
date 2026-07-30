import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ariadneDoctorExitCode,
  ariadneExitCode,
  runAriadne,
} from "../../../src/ariadne/cli.js";
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

  it("uses real terminal interactivity for init instead of treating human output as a TTY", async () => {
    const root = temporaryProject();
    const initialize = vi.fn(async (input) => ({
      schemaVersion: 1 as const,
      command: "init" as const,
      outcome: "initialized" as const,
      projectRoot: input.cwd,
      runtime: "codex" as const,
      qualityChecks: ["pnpm test"],
    }));

    await expect(
      runAriadne(["init"], {
        cwd: () => root,
        findProjectRoot: () => root,
        initialize,
        isInteractive: () => false,
        write: vi.fn(),
      }),
    ).resolves.toBe(0);

    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({ interactive: false }),
    );
  });

  it("renders init cancellation distinctly and returns interruption status", async () => {
    const root = temporaryProject();
    const write = vi.fn();

    await expect(
      runAriadne(["init"], {
        cwd: () => root,
        findProjectRoot: () => root,
        initialize: async () => ({
          schemaVersion: 1,
          command: "init",
          outcome: "cancelled",
          projectRoot: root,
          qualityChecks: ["pnpm test"],
        }),
        isInteractive: () => true,
        write,
      }),
    ).resolves.toBe(130);

    expect(write).toHaveBeenCalledWith("Ariadne initialization cancelled.");
    expect(write).not.toHaveBeenCalledWith("Ariadne initialized.");
  });

  it("refuses init before mutation while an ownership quarantine is unresolved", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const root = temporaryProject();
    const store = new AriadneStore(root);
    store.saveOwnershipViolation({
      schemaVersion: 1,
      runId: "run-violation",
      storyId: "US-001",
      detectedAt: "2026-07-29T12:00:00.000Z",
      certifiedHead: "certified-head",
      observedHead: "runtime-head",
      changed: ["head"],
    });
    const initialize = vi.fn();
    const markerBefore = fs.readFileSync(
      store.paths.ownershipViolation,
      "utf8",
    );

    await expect(
      runAriadne(["init"], {
        cwd: () => root,
        findProjectRoot: () => root,
        createStore: () => store,
        initialize,
        write: vi.fn(),
      }),
    ).resolves.toBe(4);

    expect(initialize).not.toHaveBeenCalled();
    expect(fs.readFileSync(store.paths.ownershipViolation, "utf8")).toBe(
      markerBefore,
    );
  });

  it("passes TTY choice and global preference into runtime selection and persists an interactive choice", async () => {
    const root = temporaryProject();
    const store = new AriadneStore(root);
    store.saveConfig({
      schemaVersion: 1,
      qualityChecks: ["pnpm test"],
      maxAttemptsPerStory: 3,
    });
    const chooseRuntime = vi.fn(async () => "codex" as const);
    const selectRuntime = vi.fn(async (_input) => ({
      name: "codex" as const,
      adapter: {} as never,
      detection: {
        name: "codex" as const,
        state: "healthy" as const,
        reason: "ready",
      },
      source: "interactive" as const,
    }));
    const runLoop = vi.fn(async () => ({
      schemaVersion: 1 as const,
      command: "run" as const,
      outcome: "incomplete" as const,
      runtime: "codex" as const,
      iterations: 0,
      completedStoryIds: [],
    }));

    await expect(
      runAriadne(["run"], {
        cwd: () => root,
        findProjectRoot: () => root,
        createStore: () => store,
        createGit: () => ({}) as never,
        createRegistry: () => ({}) as never,
        isInteractive: () => true,
        globalPreferredRuntime: () => "claude",
        chooseRuntime,
        selectRuntime,
        runLoop,
        write: vi.fn(),
      }),
    ).resolves.toBe(1);

    expect(selectRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        configured: undefined,
        globalPreferred: "claude",
        interactive: true,
        choose: chooseRuntime,
      }),
    );
    expect(runLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        runtime: "codex",
        persistRuntimeSelection: true,
      }),
      expect.any(Object),
    );
    // The coordinator persists only after its Git preflight; the CLI itself
    // must not dirty the worktree before runLoop starts.
    expect(store.loadConfig().runtime).toBeUndefined();
  });

  it("returns success for a binding dry-run inspection", async () => {
    const root = temporaryProject();
    const store = new AriadneStore(root);
    store.saveConfig({
      schemaVersion: 1,
      runtime: "codex",
      qualityChecks: ["pnpm test"],
      maxAttemptsPerStory: 3,
    });

    await expect(
      runAriadne(["run", "--dry-run"], {
        cwd: () => root,
        findProjectRoot: () => root,
        createStore: () => store,
        createGit: () => ({}) as never,
        createRegistry: () => ({ codex: {} }) as never,
        selectRuntime: async () => ({
          name: "codex",
          adapter: {} as never,
          detection: { name: "codex", state: "healthy", reason: "ready" },
          source: "configured",
        }),
        runLoop: async () => ({
          schemaVersion: 1,
          command: "run",
          outcome: "incomplete",
          runtime: "codex",
          iterations: 0,
          completedStoryIds: [],
        }),
        write: vi.fn(),
      }),
    ).resolves.toBe(0);
  });

  it("classifies doctor runtime readiness separately while warnings remain successful", () => {
    const base = {
      schemaVersion: 1 as const,
      command: "doctor" as const,
      status: {} as never,
    };
    expect(
      ariadneDoctorExitCode({
        ...base,
        ok: false,
        issues: [
          { code: "runtime_incompatible", severity: "error", message: "old" },
        ],
      }),
    ).toBe(3);
    expect(
      ariadneDoctorExitCode({
        ...base,
        ok: true,
        issues: [
          { code: "runtime_unverified", severity: "warning", message: "local" },
        ],
      }),
    ).toBe(0);
    expect(
      ariadneDoctorExitCode({
        ...base,
        ok: false,
        issues: [
          { code: "wrong_branch", severity: "error", message: "branch" },
        ],
      }),
    ).toBe(4);
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

  it("maps a typed contended public lock during run to the state exit code", async () => {
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
          throw new AriadneStateError(
            ".ariadne/lock",
            "Ariadne project is already locked by PID 1234.",
          );
        },
      }),
    ).resolves.toBe(4);
    expect(console.error).toHaveBeenCalledWith(
      ".ariadne/lock: Ariadne project is already locked by PID 1234.",
    );
  });

  it("does not classify arbitrary errors by their lock-like message", async () => {
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
    ).resolves.toBe(3);
    expect(console.error).toHaveBeenCalledWith(
      "Ariadne project is already locked by PID 1234.",
    );
  });
});
