import { spawn } from "node:child_process";
import fs from "node:fs";
import { finished } from "node:stream/promises";
import type { AgentInvocation } from "./runtimes/types.js";
import type { ProcessResult } from "./types.js";

export type { ProcessResult } from "./types.js";

const MAX_CAPTURE_BYTES = 1024 * 1024;
const DEFAULT_GRACE_PERIOD_MS = 10_000;

export type ProcessRunOptions = {
  stdoutPath: string;
  stderrPath: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  gracePeriodMs?: number;
};

function createOutputCapture(): {
  append: (chunk: Buffer) => void;
  text: () => string;
} {
  const chunks: Buffer[] = [];
  let size = 0;
  return {
    append(chunk) {
      if (size >= MAX_CAPTURE_BYTES) return;
      const retained = chunk.subarray(0, MAX_CAPTURE_BYTES - size);
      chunks.push(retained);
      size += retained.length;
    },
    text: () => Buffer.concat(chunks).toString("utf8"),
  };
}

export function runAgentProcess(
  invocation: AgentInvocation,
  options: ProcessRunOptions,
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const startedAt = new Date();
    const stdout = createOutputCapture();
    const stderr = createOutputCapture();
    const stdoutStream = fs.createWriteStream(options.stdoutPath, {
      flags: "w",
    });
    const stderrStream = fs.createWriteStream(options.stderrPath, {
      flags: "w",
    });
    const streamsClosed = Promise.all([
      finished(stdoutStream),
      finished(stderrStream),
    ]);
    const child = spawn(invocation.command, invocation.args, {
      cwd: invocation.cwd,
      env: invocation.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let timedOut = false;
    let aborted = false;
    let settled = false;
    let killTimer: NodeJS.Timeout | undefined;

    const removeSupervisorListeners = () => {
      process.removeListener("SIGINT", onSupervisorSigint);
      process.removeListener("SIGTERM", onSupervisorSigterm);
    };
    const endStreams = () => {
      stdoutStream.end();
      stderrStream.end();
    };
    const writeOutput = (
      source: NodeJS.ReadableStream,
      destination: fs.WriteStream,
      chunk: Buffer,
    ) => {
      if (destination.write(chunk)) return;
      source.pause();
      destination.once("drain", () => source.resume());
    };
    const forwardSignal = (signal: NodeJS.Signals) => {
      if (settled || child.exitCode !== null || child.signalCode !== null)
        return;
      child.kill(signal);
      if (killTimer) return;
      killTimer = setTimeout(() => {
        if (child.exitCode !== null || child.signalCode !== null) return;
        if (process.platform === "win32") child.kill();
        else child.kill("SIGKILL");
      }, options.gracePeriodMs ?? DEFAULT_GRACE_PERIOD_MS);
      killTimer.unref();
    };
    function onSupervisorSigint() {
      forwardSignal("SIGINT");
    }
    function onSupervisorSigterm() {
      forwardSignal("SIGTERM");
    }
    const terminate = () => forwardSignal("SIGTERM");
    const onAbort = () => {
      aborted = true;
      terminate();
    };
    const timeout =
      options.timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            timedOut = true;
            terminate();
          }, options.timeoutMs);
    timeout?.unref();

    process.on("SIGINT", onSupervisorSigint);
    process.on("SIGTERM", onSupervisorSigterm);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout.append(chunk);
      writeOutput(child.stdout, stdoutStream, chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr.append(chunk);
      writeOutput(child.stderr, stderrStream, chunk);
    });
    options.signal?.addEventListener("abort", onAbort, { once: true });
    if (options.signal?.aborted) onAbort();

    child.once("error", (error) => {
      const message = Buffer.from(`${error.message}\n`);
      stderr.append(message);
      stderrStream.write(message);
    });
    child.once("close", (status, signal) => {
      settled = true;
      if (timeout) clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      removeSupervisorListeners();
      options.signal?.removeEventListener("abort", onAbort);
      endStreams();
      void streamsClosed.then(() => {
        const finishedAt = new Date();
        resolve({
          status,
          signal,
          stdout: stdout.text(),
          stderr: stderr.text(),
          startedAt: startedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
          durationMs: finishedAt.getTime() - startedAt.getTime(),
          timedOut,
          aborted,
        });
      }, reject);
    });
  });
}
