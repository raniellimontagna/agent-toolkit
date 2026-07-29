import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runAgentProcess } from "../../../src/ariadne/process.js";

const directories: string[] = [];

function fixture(): { root: string; stdoutPath: string; stderrPath: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ariadne-process-"));
  directories.push(root);
  return {
    root,
    stdoutPath: path.join(root, "stdout.log"),
    stderrPath: path.join(root, "stderr.log"),
  };
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("runAgentProcess", () => {
  it("captures output, writes complete logs, and returns exit metadata", async () => {
    const { root, stdoutPath, stderrPath } = fixture();

    const result = await runAgentProcess(
      {
        command: process.execPath,
        args: ["-e", "console.log('ok'); console.error('warning')"],
        cwd: root,
        env: process.env,
      },
      { stdoutPath, stderrPath, timeoutMs: 1_000 },
    );

    expect(result).toMatchObject({
      status: 0,
      signal: null,
      stdout: "ok\n",
      stderr: "warning\n",
      timedOut: false,
      aborted: false,
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(fs.readFileSync(stdoutPath, "utf8")).toBe("ok\n");
    expect(fs.readFileSync(stderrPath, "utf8")).toBe("warning\n");
  });

  it("caps in-memory output while retaining full log files", async () => {
    const { root, stdoutPath, stderrPath } = fixture();
    const bytes = 1024 * 1024 + 17;
    const result = await runAgentProcess(
      {
        command: process.execPath,
        args: ["-e", `process.stdout.write('x'.repeat(${bytes}))`],
        cwd: root,
        env: process.env,
      },
      { stdoutPath, stderrPath },
    );

    expect(result.stdout).toHaveLength(1024 * 1024);
    expect(fs.statSync(stdoutPath).size).toBe(bytes);
  });

  it("terminates a timed-out process after its grace period", async () => {
    const { root, stdoutPath, stderrPath } = fixture();
    const result = await runAgentProcess(
      {
        command: process.execPath,
        args: ["-e", "setInterval(() => {}, 1_000)"],
        cwd: root,
        env: process.env,
      },
      { stdoutPath, stderrPath, timeoutMs: 30, gracePeriodMs: 20 },
    );

    expect(result).toMatchObject({ timedOut: true, aborted: false });
    expect(result.signal).toBe("SIGTERM");
  });

  it("terminates an aborted process after its grace period", async () => {
    const { root, stdoutPath, stderrPath } = fixture();
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 30);
    const result = await runAgentProcess(
      {
        command: process.execPath,
        args: ["-e", "setInterval(() => {}, 1_000)"],
        cwd: root,
        env: process.env,
      },
      {
        stdoutPath,
        stderrPath,
        signal: controller.signal,
        gracePeriodMs: 20,
      },
    );

    expect(result).toMatchObject({ timedOut: false, aborted: true });
    expect(result.signal).toBe("SIGTERM");
  });
});
