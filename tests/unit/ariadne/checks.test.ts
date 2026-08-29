import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runQualityChecks } from "../../../src/ariadne/checks.js";
import type { runAgentProcess } from "../../../src/ariadne/process.js";
import type { ProcessResult } from "../../../src/ariadne/types.js";

const directories: string[] = [];

function fixture(): { projectRoot: string; runDir: string } {
  const projectRoot = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), "ariadne-checks-")),
  );
  directories.push(projectRoot);
  return { projectRoot, runDir: path.join(projectRoot, ".ariadne", "run-1") };
}

function result(
  status: number | null,
  durationMs: number,
  overrides: Partial<ProcessResult> = {},
): ProcessResult {
  return {
    status,
    signal: status === null ? "SIGTERM" : null,
    stdout: "",
    stderr: "",
    startedAt: "2026-07-29T00:00:00.000Z",
    finishedAt: "2026-07-29T00:00:01.000Z",
    durationMs,
    timedOut: status === null,
    aborted: false,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("runQualityChecks", () => {
  it("runs commands in order and stops after the first non-zero status", async () => {
    const { projectRoot, runDir } = fixture();
    const statuses = [result(0, 11), result(2, 22), result(0, 33)];
    const calls: Parameters<typeof runAgentProcess>[] = [];
    const runProcess: typeof runAgentProcess = async (...args) => {
      calls.push(args);
      return statuses[calls.length - 1] ?? result(0, 0);
    };

    const results = await runQualityChecks({
      commands: ["pnpm lint", "pnpm typecheck", "pnpm test"],
      projectRoot,
      runDir,
      runProcess,
    });

    expect(results.map((entry) => entry.command)).toEqual([
      "pnpm lint",
      "pnpm typecheck",
    ]);
    expect(results.map((entry) => entry.status)).toEqual([0, 2]);
    expect(calls).toHaveLength(2);
  });

  it("rechecks run containment before starting a later quality check", async () => {
    const { projectRoot, runDir } = fixture();
    fs.mkdirSync(runDir, { recursive: true });
    const runProcess = vi.fn<typeof runAgentProcess>(async () => result(0, 1));
    let boundaryChecks = 0;
    const assertRunDirectory = () => {
      boundaryChecks += 1;
      if (boundaryChecks === 4) {
        throw new Error("run directory substituted between checks");
      }
    };

    await expect(
      runQualityChecks({
        commands: ["first", "must-not-start"],
        projectRoot,
        runDir,
        runProcess,
        assertRunDirectory,
      }),
    ).rejects.toThrow(/substituted between checks/i);

    expect(runProcess).toHaveBeenCalledOnce();
  });

  it("captures duration and stable per-check output paths", async () => {
    const { projectRoot, runDir } = fixture();
    const calls: Parameters<typeof runAgentProcess>[] = [];
    const runProcess: typeof runAgentProcess = async (...args) => {
      calls.push(args);
      return result(0, 47);
    };

    const [check] = await runQualityChecks({
      commands: ["pnpm test"],
      projectRoot,
      runDir,
      runProcess,
    });

    expect(check).toEqual({
      command: "pnpm test",
      status: 0,
      signal: null,
      durationMs: 47,
      timedOut: false,
      timeoutOrigin: null,
      aborted: false,
      stdoutPath: path.join(runDir, "check-1.stdout.log"),
      stderrPath: path.join(runDir, "check-1.stderr.log"),
    });
    expect(calls[0]?.[1]).toMatchObject({
      stdoutPath: check?.stdoutPath,
      stderrPath: check?.stderrPath,
    });
    expect(fs.statSync(runDir).isDirectory()).toBe(true);
  });

  it("forwards output certification to every quality-check process", async () => {
    const { projectRoot, runDir } = fixture();
    const calls: Parameters<typeof runAgentProcess>[] = [];
    const runProcess: typeof runAgentProcess = async (...args) => {
      calls.push(args);
      return result(0, 1);
    };
    const certifyOutput = vi.fn();

    await runQualityChecks({
      commands: ["first", "second"],
      projectRoot,
      runDir,
      runProcess,
      certifyOutput,
    });

    expect(calls).toHaveLength(2);
    expect(calls[0]?.[1].certifyOutput).toBe(certifyOutput);
    expect(calls[1]?.[1].certifyOutput).toBe(certifyOutput);
  });

  it("passes each POSIX command as a single sh argument without interpolation", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("linux");
    const { projectRoot, runDir } = fixture();
    const command = "printf '%s' '$TOKEN'; echo $(never-run-by-parent)";
    const calls: Parameters<typeof runAgentProcess>[] = [];
    const runProcess: typeof runAgentProcess = async (...args) => {
      calls.push(args);
      return result(0, 1);
    };

    await runQualityChecks({
      commands: [command],
      projectRoot,
      runDir,
      runProcess,
    });

    expect(calls[0]?.[0]).toEqual({
      command: "sh",
      args: ["-lc", command],
      cwd: projectRoot,
      env: process.env,
    });
  });

  it("uses cmd.exe with Windows command parsing flags", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    const { projectRoot, runDir } = fixture();
    const calls: Parameters<typeof runAgentProcess>[] = [];
    const runProcess: typeof runAgentProcess = async (...args) => {
      calls.push(args);
      return result(0, 1);
    };

    await runQualityChecks({
      commands: ["pnpm test"],
      projectRoot,
      runDir,
      runProcess,
    });

    expect(calls[0]?.[0]).toMatchObject({
      command: process.env.comspec || "cmd.exe",
      // /s makes cmd.exe drop the first and last character, so the command
      // needs one wrapping pair of quotes to survive intact.
      args: ["/d", "/s", "/c", '"pnpm test"'],
      cwd: projectRoot,
      verbatim: true,
    });
  });

  it("keeps a quoted Windows executable path intact for cmd.exe", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    const { projectRoot, runDir } = fixture();
    const command = '"C:\\Program Files\\nodejs\\node.exe" check.mjs';
    const calls: Parameters<typeof runAgentProcess>[] = [];
    const runProcess: typeof runAgentProcess = async (...args) => {
      calls.push(args);
      return result(0, 1);
    };

    await runQualityChecks({
      commands: [command],
      projectRoot,
      runDir,
      runProcess,
    });

    const invocation = calls[0]?.[0];
    expect(invocation?.args.at(-1)).toBe(`"${command}"`);
    expect(invocation?.verbatim).toBe(true);
    // Dropping the outer pair leaves exactly the command cmd.exe must parse.
    expect((invocation?.args.at(-1) ?? "").slice(1, -1)).toBe(command);
  });

  it("forwards cancellation and enforces an individual command timeout", async () => {
    const { projectRoot, runDir } = fixture();
    const controller = new AbortController();
    const calls: Parameters<typeof runAgentProcess>[] = [];
    const runProcess: typeof runAgentProcess = async (...args) => {
      calls.push(args);
      return result(null, 100);
    };

    const results = await runQualityChecks({
      commands: ["slow-check", "never-reached"],
      projectRoot,
      runDir,
      signal: controller.signal,
      runProcess,
    });

    expect(calls[0]?.[1].signal).toBe(controller.signal);
    expect(calls[0]?.[1].timeoutMs).toBeGreaterThan(0);
    expect(results.map((entry) => entry.status)).toEqual([null]);
    expect(results[0]?.timeoutOrigin).toBe("quality_check");
    expect(calls).toHaveLength(1);
  });

  it("caps checks to the remaining loop runtime and preserves stop metadata", async () => {
    const { projectRoot, runDir } = fixture();
    const calls: Parameters<typeof runAgentProcess>[] = [];
    const runProcess: typeof runAgentProcess = async (...args) => {
      calls.push(args);
      return result(null, 25, {
        signal: "SIGKILL",
        timedOut: true,
        aborted: false,
      });
    };

    const [check] = await runQualityChecks({
      commands: ["slow-check"],
      projectRoot,
      runDir,
      timeoutMs: 75,
      runProcess,
    });

    expect(calls[0]?.[1].timeoutMs).toBeLessThanOrEqual(75);
    expect(check).toMatchObject({
      status: null,
      signal: "SIGKILL",
      timedOut: true,
      timeoutOrigin: "global_budget",
      aborted: false,
    });
  });

  it("identifies the local 30-minute check timeout when global runtime remains", async () => {
    const { projectRoot, runDir } = fixture();
    const calls: Parameters<typeof runAgentProcess>[] = [];
    const runProcess: typeof runAgentProcess = async (...args) => {
      calls.push(args);
      return result(null, 30 * 60 * 1_000, {
        signal: "SIGKILL",
        timedOut: true,
      });
    };

    const [check] = await runQualityChecks({
      commands: ["slow-check"],
      projectRoot,
      runDir,
      timeoutMs: 31 * 60 * 1_000,
      runProcess,
    });

    expect(calls[0]?.[1].timeoutMs).toBe(30 * 60 * 1_000);
    expect(check).toMatchObject({
      timedOut: true,
      timeoutOrigin: "quality_check",
    });
  });

  it("preserves cancellation metadata from a quality check", async () => {
    const { projectRoot, runDir } = fixture();
    const runProcess: typeof runAgentProcess = async () =>
      result(null, 5, {
        signal: "SIGKILL",
        timedOut: false,
        aborted: true,
      });

    const [check] = await runQualityChecks({
      commands: ["cancelled-check"],
      projectRoot,
      runDir,
      runProcess,
    });

    expect(check).toMatchObject({
      signal: "SIGKILL",
      timedOut: false,
      timeoutOrigin: null,
      aborted: true,
    });
  });

  it("rejects an empty command list without starting a process", async () => {
    const { projectRoot, runDir } = fixture();
    const runProcess = vi.fn<typeof runAgentProcess>();

    await expect(
      runQualityChecks({ commands: [], projectRoot, runDir, runProcess }),
    ).rejects.toThrow(/at least one quality check/i);
    expect(runProcess).not.toHaveBeenCalled();
  });
});
