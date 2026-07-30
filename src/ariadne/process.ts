import { spawn } from "node:child_process";
import fs from "node:fs";
import { finished } from "node:stream/promises";
import { findCommand, windowsSpawnPlan } from "../system.js";
import type { AgentInvocation } from "./runtimes/types.js";
import { AriadneStateError } from "./schema.js";
import type { ProcessResult } from "./types.js";

export type { ProcessResult } from "./types.js";

const MAX_CAPTURE_BYTES = 1024 * 1024;
const DEFAULT_GRACE_PERIOD_MS = 5_000;

export type AgentSpawnPlan = {
  command: string;
  args: string[];
  verbatim: boolean;
};

export function planAgentSpawn(
  invocation: AgentInvocation,
  platform: NodeJS.Platform = process.platform,
  resolve: (command: string) => string | null = findCommand,
): AgentSpawnPlan {
  return platform === "win32"
    ? windowsSpawnPlan(invocation.command, invocation.args, resolve)
    : {
        command: invocation.command,
        args: invocation.args,
        verbatim: false,
      };
}

export type ProcessRunOptions = {
  stdoutPath: string;
  stderrPath: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  gracePeriodMs?: number;
  certifyOutput?: (identities: {
    stdout: OutputLeafIdentity;
    stderr: OutputLeafIdentity;
  }) => void;
};

export type OutputLeafIdentity = {
  readonly source: string;
  readonly device: number;
  readonly inode: number;
  readonly links: number;
};

type OpenOutputLeaf = {
  descriptor: number;
  identity: OutputLeafIdentity;
};

function changedOutputPath(source: string): AriadneStateError {
  return new AriadneStateError(
    source,
    "Agent output path changed, was relocated, or gained a hard-link during execution.",
  );
}

function closeDescriptor(descriptor: number): void {
  try {
    fs.closeSync(descriptor);
  } catch {
    // Best-effort cleanup after an output setup failure.
  }
}

function unlinkOwnedOutput(identity: OutputLeafIdentity): void {
  let current: fs.Stats;
  try {
    current = fs.lstatSync(identity.source);
  } catch {
    return;
  }
  if (
    current.isSymbolicLink() ||
    !current.isFile() ||
    current.dev !== identity.device ||
    current.ino !== identity.inode
  ) {
    return;
  }
  try {
    fs.unlinkSync(identity.source);
  } catch {
    // A concurrent relocation is safer to leave behind than to chase.
  }
}

function openOutputLeaf(source: string): OpenOutputLeaf {
  const descriptor = fs.openSync(source, "wx", 0o600);
  let stat: fs.Stats;
  try {
    stat = fs.fstatSync(descriptor);
  } catch (error) {
    closeDescriptor(descriptor);
    throw error;
  }
  const identity: OutputLeafIdentity = {
    source,
    device: stat.dev,
    inode: stat.ino,
    links: stat.nlink,
  };
  if (!stat.isFile() || stat.nlink !== 1) {
    closeDescriptor(descriptor);
    unlinkOwnedOutput(identity);
    throw changedOutputPath(source);
  }
  return { descriptor, identity };
}

function assertOutputLeaf(identity: OutputLeafIdentity): void {
  let current: fs.Stats;
  try {
    current = fs.lstatSync(identity.source);
  } catch {
    throw changedOutputPath(identity.source);
  }
  if (
    identity.links !== 1 ||
    current.isSymbolicLink() ||
    !current.isFile() ||
    current.dev !== identity.device ||
    current.ino !== identity.inode ||
    current.nlink !== 1
  ) {
    throw changedOutputPath(identity.source);
  }
}

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
    let stdoutLeaf: OpenOutputLeaf;
    let stderrLeaf: OpenOutputLeaf;
    try {
      stdoutLeaf = openOutputLeaf(options.stdoutPath);
      try {
        stderrLeaf = openOutputLeaf(options.stderrPath);
      } catch (error) {
        closeDescriptor(stdoutLeaf.descriptor);
        unlinkOwnedOutput(stdoutLeaf.identity);
        throw error;
      }
    } catch (error) {
      reject(error);
      return;
    }
    const stdoutStream = fs.createWriteStream(options.stdoutPath, {
      fd: stdoutLeaf.descriptor,
      autoClose: true,
    });
    const stderrStream = fs.createWriteStream(options.stderrPath, {
      fd: stderrLeaf.descriptor,
      autoClose: true,
    });
    const plan = planAgentSpawn(invocation);
    const child = spawn(plan.command, plan.args, {
      cwd: invocation.cwd,
      env: invocation.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsVerbatimArguments: plan.verbatim || undefined,
    });
    let timedOut = false;
    let aborted = false;
    let settled = false;
    let childClosed = false;
    let streamsClosed = false;
    let killTimer: NodeJS.Timeout | undefined;
    let outputFailure: Error | undefined;
    let closeStatus: number | null = null;
    let closeSignal: NodeJS.Signals | null = null;

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
      try {
        if (destination.write(chunk)) return;
        source.pause();
        destination.once("drain", () => source.resume());
      } catch (error) {
        onOutputFailure(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
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
    const removeOutputListeners = () => {
      child.stdout.removeListener("data", onStdoutData);
      child.stderr.removeListener("data", onStderrData);
    };
    const stopReadingOutput = () => {
      removeOutputListeners();
      child.stdout.resume();
      child.stderr.resume();
    };
    function onOutputFailure(error: Error) {
      if (outputFailure) return;
      outputFailure = error;
      stopReadingOutput();
      terminate();
    }
    const settle = () => {
      if (settled || !childClosed || !streamsClosed) return;
      settled = true;
      try {
        assertOutputLeaf(stdoutLeaf.identity);
        assertOutputLeaf(stderrLeaf.identity);
      } catch (error) {
        reject(error);
        return;
      }
      if (outputFailure) {
        reject(outputFailure);
        return;
      }
      try {
        options.certifyOutput?.({
          stdout: stdoutLeaf.identity,
          stderr: stderrLeaf.identity,
        });
      } catch (error) {
        reject(error);
        return;
      }
      const finishedAt = new Date();
      resolve({
        status: closeStatus,
        signal: closeSignal,
        stdout: stdout.text(),
        stderr: stderr.text(),
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        timedOut,
        aborted,
      });
    };
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
    function onStdoutData(chunk: Buffer) {
      stdout.append(chunk);
      writeOutput(child.stdout, stdoutStream, chunk);
    }
    function onStderrData(chunk: Buffer) {
      stderr.append(chunk);
      writeOutput(child.stderr, stderrStream, chunk);
    }
    child.stdout.on("data", onStdoutData);
    child.stderr.on("data", onStderrData);
    void Promise.all([
      finished(stdoutStream).then(undefined, onOutputFailure),
      finished(stderrStream).then(undefined, onOutputFailure),
    ]).then(() => {
      streamsClosed = true;
      settle();
    });
    options.signal?.addEventListener("abort", onAbort, { once: true });
    if (options.signal?.aborted) onAbort();

    child.once("error", (error) => {
      const message = Buffer.from(`${error.message}\n`);
      stderr.append(message);
      if (!outputFailure) writeOutput(child.stderr, stderrStream, message);
    });
    child.once("close", (status, signal) => {
      childClosed = true;
      closeStatus = status;
      closeSignal = signal;
      if (timeout) clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      removeSupervisorListeners();
      removeOutputListeners();
      options.signal?.removeEventListener("abort", onAbort);
      endStreams();
      settle();
    });
  });
}
