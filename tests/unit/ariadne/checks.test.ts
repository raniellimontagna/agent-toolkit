import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runQualityChecks } from "../../../src/ariadne/checks.js";
import type { runAgentProcess } from "../../../src/ariadne/process.js";
import type { ProcessResult } from "../../../src/ariadne/types.js";

const directories: string[] = [];

function fixture(): { projectRoot: string; runDir: string } {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ariadne-checks-"));
  directories.push(projectRoot);
  return { projectRoot, runDir: path.join(projectRoot, ".ariadne", "run-1") };
}

function result(status: number | null, durationMs: number): ProcessResult {
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
      durationMs: 47,
      stdoutPath: path.join(runDir, "check-1.stdout.log"),
      stderrPath: path.join(runDir, "check-1.stderr.log"),
    });
    expect(calls[0]?.[1]).toMatchObject({
      stdoutPath: check?.stdoutPath,
      stderrPath: check?.stderrPath,
    });
    expect(fs.statSync(runDir).isDirectory()).toBe(true);
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
      command: "cmd.exe",
      args: ["/d", "/s", "/c", "pnpm test"],
      cwd: projectRoot,
    });
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
    expect(calls).toHaveLength(1);
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
