import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function compressDefaultGracePeriod(): number[] {
  const nativeSetTimeout = globalThis.setTimeout;
  const delays: number[] = [];
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((
    callback: (...args: unknown[]) => void,
    delay?: number,
    ...args: unknown[]
  ) => {
    delays.push(delay ?? 0);
    return nativeSetTimeout(callback, delay === 5_000 ? 20 : delay, ...args);
  }) as typeof setTimeout);
  return delays;
}

async function waitForFileContent(
  filePath: string,
  expected: string,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (
      fs.existsSync(filePath) &&
      fs.readFileSync(filePath, "utf8").includes(expected)
    )
      return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${JSON.stringify(expected)}.`);
}

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

  it("uses SIGKILL after the default 5 second grace period on timeout", async () => {
    const { root, stdoutPath, stderrPath } = fixture();
    const delays = compressDefaultGracePeriod();
    const result = await runAgentProcess(
      {
        command: process.execPath,
        args: [
          "-e",
          "process.on('SIGTERM', () => {}); setInterval(() => {}, 1_000)",
        ],
        cwd: root,
        env: process.env,
      },
      { stdoutPath, stderrPath, timeoutMs: 200 },
    );

    expect(result).toMatchObject({ timedOut: true, aborted: false });
    expect(delays).toContain(5_000);
    if (process.platform !== "win32") expect(result.signal).toBe("SIGKILL");
  });

  it("uses SIGKILL after the default 5 second grace period on abort", async () => {
    const { root, stdoutPath, stderrPath } = fixture();
    const delays = compressDefaultGracePeriod();
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 200);
    const result = await runAgentProcess(
      {
        command: process.execPath,
        args: [
          "-e",
          "process.on('SIGTERM', () => {}); setInterval(() => {}, 1_000)",
        ],
        cwd: root,
        env: process.env,
      },
      { stdoutPath, stderrPath, signal: controller.signal },
    );

    expect(result).toMatchObject({ timedOut: false, aborted: true });
    expect(delays).toContain(5_000);
    if (process.platform !== "win32") expect(result.signal).toBe("SIGKILL");
  });

  it.each([
    "SIGINT",
    "SIGTERM",
  ] as const)("forwards supervisor %s to the child and removes supervisor listeners", async (signal) => {
    const { root, stdoutPath, stderrPath } = fixture();
    const controller = new AbortController();
    const listenersBefore = new Set(process.listeners(signal));
    const running = runAgentProcess(
      {
        command: process.execPath,
        args: [
          "-e",
          `process.on('${signal}', () => process.exit(23)); console.log('ready'); setInterval(() => {}, 1_000)`,
        ],
        cwd: root,
        env: process.env,
      },
      {
        stdoutPath,
        stderrPath,
        signal: controller.signal,
        gracePeriodMs: 200,
      },
    );

    try {
      await waitForFileContent(stdoutPath, "ready\n");
      const forward = process
        .listeners(signal)
        .find((listener) => !listenersBefore.has(listener));
      expect(forward).toBeDefined();
      forward?.(signal);

      const result = await running;
      expect(result).toMatchObject({
        status: 23,
        signal: null,
        timedOut: false,
        aborted: false,
      });
      expect(process.listeners(signal)).toEqual([...listenersBefore]);
    } finally {
      controller.abort();
      await running;
    }
  });
});
