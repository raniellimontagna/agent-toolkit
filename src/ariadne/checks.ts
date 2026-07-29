import fs from "node:fs";
import path from "node:path";
import type { runAgentProcess } from "./process.js";

const QUALITY_CHECK_TIMEOUT_MS = 30 * 60 * 1_000;

export type QualityCheckResult = {
  command: string;
  status: number | null;
  durationMs: number;
  stdoutPath: string;
  stderrPath: string;
};

export type QualityCheckInput = {
  commands: string[];
  projectRoot: string;
  runDir: string;
  signal?: AbortSignal;
  runProcess: typeof runAgentProcess;
};

function shellInvocation(command: string, projectRoot: string) {
  if (process.platform === "win32") {
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", command],
      cwd: projectRoot,
      env: process.env,
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

  fs.mkdirSync(input.runDir, { recursive: true });
  const results: QualityCheckResult[] = [];
  for (const [index, command] of input.commands.entries()) {
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
        timeoutMs: QUALITY_CHECK_TIMEOUT_MS,
        signal: input.signal,
      },
    );
    results.push({
      command,
      status: processResult.status,
      durationMs: processResult.durationMs,
      stdoutPath,
      stderrPath,
    });
    if (processResult.status !== 0) break;
  }
  return results;
}
