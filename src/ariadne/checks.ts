import fs from "node:fs";
import path from "node:path";
import type { ProcessRunOptions, runAgentProcess } from "./process.js";

const QUALITY_CHECK_TIMEOUT_MS = 30 * 60 * 1_000;

export type QualityCheckTimeoutOrigin = "quality_check" | "global_budget";

export type QualityCheckResult = {
  command: string;
  status: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
  timedOut: boolean;
  timeoutOrigin: QualityCheckTimeoutOrigin | null;
  aborted: boolean;
  stdoutPath: string;
  stderrPath: string;
};

export type QualityCheckInput = {
  commands: string[];
  projectRoot: string;
  runDir: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  runProcess: typeof runAgentProcess;
  assertRunDirectory?: () => void;
  certifyOutput?: ProcessRunOptions["certifyOutput"];
};

function shellInvocation(command: string, projectRoot: string) {
  if (process.platform === "win32") {
    return {
      command: process.env.comspec || "cmd.exe",
      // With /s, cmd.exe removes the first and last character of the command
      // line, so the whole check has to be wrapped in one extra pair of quotes
      // for a quoted executable path to survive. The plan is spawned verbatim
      // because Node's default quoting uses escapes cmd.exe does not accept.
      args: ["/d", "/s", "/c", `"${command}"`],
      cwd: projectRoot,
      env: process.env,
      verbatim: true,
    };
  }
  return {
    command: "sh",
    args: ["-lc", command],
    cwd: projectRoot,
    env: process.env,
  };
}

export async function runQualityChecks(
  input: QualityCheckInput,
): Promise<QualityCheckResult[]> {
  if (input.commands.length === 0) {
    throw new Error("At least one quality check is required");
  }
  if (input.commands.some((command) => command.trim() === "")) {
    throw new Error("Quality check commands cannot be empty");
  }

  if (input.assertRunDirectory) input.assertRunDirectory();
  else fs.mkdirSync(input.runDir, { recursive: true });
  const results: QualityCheckResult[] = [];
  const startedAt = Date.now();
  for (const [index, command] of input.commands.entries()) {
    input.assertRunDirectory?.();
    const remainingGlobalRuntime =
      input.timeoutMs === undefined
        ? undefined
        : input.timeoutMs - (Date.now() - startedAt);
    if (remainingGlobalRuntime !== undefined && remainingGlobalRuntime <= 0)
      break;
    const timeoutOrigin: QualityCheckTimeoutOrigin =
      remainingGlobalRuntime !== undefined &&
      remainingGlobalRuntime <= QUALITY_CHECK_TIMEOUT_MS
        ? "global_budget"
        : "quality_check";
    const timeoutMs =
      remainingGlobalRuntime === undefined
        ? QUALITY_CHECK_TIMEOUT_MS
        : Math.min(QUALITY_CHECK_TIMEOUT_MS, remainingGlobalRuntime);
    const checkNumber = index + 1;
    const stdoutPath = path.join(
      input.runDir,
      `check-${checkNumber}.stdout.log`,
    );
    const stderrPath = path.join(
      input.runDir,
      `check-${checkNumber}.stderr.log`,
    );
    const processResult = await input.runProcess(
      shellInvocation(command, input.projectRoot),
      {
        stdoutPath,
        stderrPath,
        timeoutMs,
        signal: input.signal,
        certifyOutput: input.certifyOutput,
      },
    );
    input.assertRunDirectory?.();
    results.push({
      command,
      status: processResult.status,
      signal: processResult.signal,
      durationMs: processResult.durationMs,
      timedOut: processResult.timedOut,
      timeoutOrigin: processResult.timedOut ? timeoutOrigin : null,
      aborted: processResult.aborted,
      stdoutPath,
      stderrPath,
    });
    if (processResult.status !== 0) break;
  }
  return results;
}
