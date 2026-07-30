import { ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OutputLeafIdentity } from "../../../src/ariadne/process.js";
import {
  planAgentSpawn,
  runAgentProcess,
} from "../../../src/ariadne/process.js";
import { AriadneStateError } from "../../../src/ariadne/schema.js";

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

function waitForFileContentSync(
  filePath: string,
  expected: string,
  timeoutMs = 5_000,
): void {
  const deadline = Date.now() + timeoutMs;
  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  while (Date.now() < deadline) {
    if (
      fs.existsSync(filePath) &&
      fs.readFileSync(filePath, "utf8").includes(expected)
    )
      return;
    Atomics.wait(sleeper, 0, 0, 10);
  }
  throw new Error(`Timed out waiting for ${JSON.stringify(expected)}.`);
}

function sigtermIgnoringProgram(readyPath: string): string {
  return [
    "process.on('SIGTERM', () => {});",
    `require('node:fs').writeFileSync(${JSON.stringify(readyPath)}, 'ready');`,
    "setInterval(() => {}, 1_000);",
  ].join("");
}

describe("runAgentProcess", () => {
  it("routes Windows npm command shims through cmd.exe for real agent execution", () => {
    expect(
      planAgentSpawn(
        {
          command: "codex",
          args: ["exec", "Read .ariadne/runs/run-1/prompt.md"],
          cwd: "C:\\repo",
          env: {},
        },
        "win32",
        () => "C:\\tools\\codex.cmd",
      ),
    ).toEqual({
      command: "cmd.exe",
      args: [
        "/d",
        "/s",
        "/c",
        '""C:\\tools\\codex.cmd" "exec" "Read .ariadne/runs/run-1/prompt.md""',
      ],
      verbatim: true,
    });
  });

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

  it("certifies the exact stdout and stderr leaf identities before resolving", async () => {
    const { root, stdoutPath, stderrPath } = fixture();
    const events: string[] = [];
    let certified:
      | { stdout: OutputLeafIdentity; stderr: OutputLeafIdentity }
      | undefined;

    await runAgentProcess(
      {
        command: process.execPath,
        args: ["-e", "console.log('ok'); console.error('warning')"],
        cwd: root,
        env: process.env,
      },
      {
        stdoutPath,
        stderrPath,
        certifyOutput(identities) {
          events.push("certified");
          certified = identities;
        },
      },
    );
    events.push("resolved");

    expect(events).toEqual(["certified", "resolved"]);
    expect(certified).toBeDefined();
    for (const [source, identity] of [
      [stdoutPath, certified?.stdout],
      [stderrPath, certified?.stderr],
    ] as const) {
      const stat = fs.lstatSync(source);
      expect(identity).toEqual({
        source,
        device: stat.dev,
        inode: stat.ino,
        links: stat.nlink,
      });
    }
  });

  it("rejects instead of resolving when output certification throws", async () => {
    const { root, stdoutPath, stderrPath } = fixture();
    const certificationFailure = new Error("output certification failed");
    const certifyOutput = vi.fn(() => {
      throw certificationFailure;
    });

    await expect(
      runAgentProcess(
        {
          command: process.execPath,
          args: ["-e", "console.log('ok')"],
          cwd: root,
          env: process.env,
        },
        { stdoutPath, stderrPath, certifyOutput },
      ),
    ).rejects.toBe(certificationFailure);

    expect(certifyOutput).toHaveBeenCalledOnce();
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

  it("rejects an invalid log target before starting the child", async () => {
    const { root, stderrPath } = fixture();
    const killedChildren: ChildProcess[] = [];
    vi.spyOn(ChildProcess.prototype, "kill").mockImplementation(function (
      this: ChildProcess,
    ) {
      killedChildren.push(this);
      return true;
    });
    const startedPath = path.join(root, "child-started");

    await expect(
      runAgentProcess(
        {
          command: process.execPath,
          args: [
            "-e",
            `require('node:fs').writeFileSync(${JSON.stringify(startedPath)}, 'started')`,
          ],
          cwd: root,
          env: process.env,
        },
        { stdoutPath: root, stderrPath },
      ),
    ).rejects.toMatchObject({ code: "EEXIST" });

    expect(killedChildren).toHaveLength(0);
    expect(fs.existsSync(startedPath)).toBe(false);
  });

  it("does not truncate a planted hard-link log target or start the child", async () => {
    const { root, stdoutPath, stderrPath } = fixture();
    const victim = path.join(root, "victim.txt");
    const startedPath = path.join(root, "child-started");
    fs.writeFileSync(victim, "preserve me\n", "utf8");
    fs.linkSync(victim, stdoutPath);

    await expect(
      runAgentProcess(
        {
          command: process.execPath,
          args: [
            "-e",
            `require('node:fs').writeFileSync(${JSON.stringify(startedPath)}, 'started')`,
          ],
          cwd: root,
          env: process.env,
        },
        { stdoutPath, stderrPath },
      ),
    ).rejects.toMatchObject({ code: "EEXIST" });

    expect(fs.readFileSync(victim, "utf8")).toBe("preserve me\n");
    expect(fs.existsSync(startedPath)).toBe(false);
  });

  it("rejects when a child relocates an already-open output leaf", async () => {
    const { root, stdoutPath, stderrPath } = fixture();
    const escapedPath = path.join(root, "project-output.txt");
    const script = [
      "const fs = require('node:fs');",
      "const [source, destination] = process.argv.slice(1);",
      "fs.renameSync(source, destination);",
      "process.stdout.write('raw runtime output\\n');",
    ].join("");

    const running = runAgentProcess(
      {
        command: process.execPath,
        args: ["-e", script, stdoutPath, escapedPath],
        cwd: root,
        env: process.env,
      },
      { stdoutPath, stderrPath },
    );

    await expect(running).rejects.toBeInstanceOf(AriadneStateError);
    await expect(running).rejects.toThrow(
      /output.*(?:changed|relocated)|path.*changed/i,
    );

    expect(fs.existsSync(stdoutPath)).toBe(false);
    expect(fs.readFileSync(escapedPath, "utf8")).toContain(
      "raw runtime output",
    );
  });

  it("rejects when a child hard-links an already-open output leaf", async () => {
    const { root, stdoutPath, stderrPath } = fixture();
    const escapedPath = path.join(root, "project-output.txt");
    const script = [
      "const fs = require('node:fs');",
      "const [source, destination] = process.argv.slice(1);",
      "fs.linkSync(source, destination);",
      "process.stdout.write('raw runtime output\\n');",
    ].join("");

    const running = runAgentProcess(
      {
        command: process.execPath,
        args: ["-e", script, stdoutPath, escapedPath],
        cwd: root,
        env: process.env,
      },
      { stdoutPath, stderrPath },
    );

    await expect(running).rejects.toBeInstanceOf(AriadneStateError);
    await expect(running).rejects.toThrow(/output.*(?:changed|hard-link)/i);
    expect(fs.readFileSync(escapedPath, "utf8")).toContain(
      "raw runtime output",
    );
  });

  it("does not unlink a replacement when stderr creation fails", async () => {
    const { root, stdoutPath, stderrPath } = fixture();
    const originalOutput = path.join(root, "original-stdout.log");
    fs.writeFileSync(stderrPath, "pre-existing stderr\n", "utf8");
    const nativeOpen = fs.openSync.bind(fs);
    let replaced = false;
    vi.spyOn(fs, "openSync").mockImplementation(
      (...args: Parameters<typeof fs.openSync>) => {
        if (!replaced && args[0].toString() === stderrPath) {
          replaced = true;
          fs.renameSync(stdoutPath, originalOutput);
          fs.writeFileSync(stdoutPath, "replacement stdout\n", "utf8");
        }
        return nativeOpen(...args);
      },
    );

    await expect(
      runAgentProcess(
        {
          command: process.execPath,
          args: ["-e", "process.exit(0)"],
          cwd: root,
          env: process.env,
        },
        { stdoutPath, stderrPath },
      ),
    ).rejects.toMatchObject({ code: "EEXIST" });

    expect(replaced).toBe(true);
    expect(fs.readFileSync(stdoutPath, "utf8")).toBe("replacement stdout\n");
    expect(fs.existsSync(originalOutput)).toBe(true);
  });

  it("removes its stdout leaf when exclusive stderr creation fails", async () => {
    const { root, stdoutPath, stderrPath } = fixture();
    const startedPath = path.join(root, "child-started");
    fs.writeFileSync(stderrPath, "pre-existing stderr\n", "utf8");

    await expect(
      runAgentProcess(
        {
          command: process.execPath,
          args: [
            "-e",
            `require('node:fs').writeFileSync(${JSON.stringify(startedPath)}, 'started')`,
          ],
          cwd: root,
          env: process.env,
        },
        { stdoutPath, stderrPath },
      ),
    ).rejects.toMatchObject({ code: "EEXIST" });

    expect(fs.existsSync(stdoutPath)).toBe(false);
    expect(fs.readFileSync(stderrPath, "utf8")).toBe("pre-existing stderr\n");
    expect(fs.existsSync(startedPath)).toBe(false);
  });

  it("uses SIGKILL after the default 5 second grace period on timeout", async () => {
    const { root, stdoutPath, stderrPath } = fixture();
    const readyPath = path.join(root, "ready");
    const delays = compressDefaultGracePeriod();
    const result = await runAgentProcess(
      {
        command: process.execPath,
        args: ["-e", sigtermIgnoringProgram(readyPath)],
        cwd: root,
        env: process.env,
      },
      {
        stdoutPath,
        stderrPath,
        get timeoutMs() {
          waitForFileContentSync(readyPath, "ready");
          return 1;
        },
      },
    );

    expect(result).toMatchObject({ timedOut: true, aborted: false });
    expect(delays).toContain(5_000);
    if (process.platform !== "win32") expect(result.signal).toBe("SIGKILL");
  });

  it("uses SIGKILL after the default 5 second grace period on abort", async () => {
    const { root, stdoutPath, stderrPath } = fixture();
    const readyPath = path.join(root, "ready");
    const delays = compressDefaultGracePeriod();
    const controller = new AbortController();
    const running = runAgentProcess(
      {
        command: process.execPath,
        args: ["-e", sigtermIgnoringProgram(readyPath)],
        cwd: root,
        env: process.env,
      },
      { stdoutPath, stderrPath, signal: controller.signal },
    );
    await waitForFileContent(readyPath, "ready");
    controller.abort();
    const result = await running;

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
