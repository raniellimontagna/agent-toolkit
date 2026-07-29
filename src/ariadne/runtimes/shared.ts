import type { AriadneRuntimeName, ProcessResult } from "../types.js";
import type {
  AgentInvocation,
  AgentOutcome,
  AriadneRuntimeAdapter,
  IterationContext,
  RuntimeDetection,
  RuntimeProbeDeps,
} from "./types.js";

type RuntimeVersionPolicy =
  | { kind: "exact"; version: string }
  | { kind: "minimum"; version: string };

export type RuntimeAdapterDefinition = {
  name: AriadneRuntimeName;
  command: string;
  version: RuntimeVersionPolicy;
  helpArgs: string[];
  requiredHelp: string[];
  authArgs?: string[];
  invocationArgs: (context: IterationContext) => string[];
};

const versionTokenPattern =
  /(?:^|[^0-9A-Za-z])v?(\d+(?:\.\d+){1,3}(?:[-+][0-9A-Za-z.-]+)?)(?=$|[^0-9A-Za-z])/;

export function parseVersionToken(output: string): string | undefined {
  return versionTokenPattern.exec(output)?.[1];
}

export function compareNumericVersions(left: string, right: string): number {
  const numeric = (value: string) =>
    value
      .split(/[+-]/, 1)[0]
      ?.split(".")
      .map((part) => Number.parseInt(part, 10)) ?? [];
  const leftParts = numeric(left);
  const rightParts = numeric(right);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

export function promptInstruction(relativePromptPath: string): string {
  return `Read ${relativePromptPath} and follow it exactly.`;
}

function probeFailureReason(
  fallback: string,
  stdout: string,
  stderr: string,
): string {
  return stderr.trim() || stdout.trim() || fallback;
}

function detectRuntime(
  definition: RuntimeAdapterDefinition,
  deps: RuntimeProbeDeps,
): RuntimeDetection {
  const commandPath = deps.findCommand(definition.command);
  if (!commandPath) {
    return {
      name: definition.name,
      state: "unavailable",
      reason: `${definition.command} was not found on PATH.`,
    };
  }

  const versionResult = deps.capture(commandPath, ["--version"]);
  const version = parseVersionToken(
    `${versionResult.stdout}\n${versionResult.stderr}`,
  );
  if (!versionResult.ok || !version) {
    return {
      name: definition.name,
      state: "incompatible",
      commandPath,
      version,
      reason: probeFailureReason(
        `Could not verify the ${definition.name} version.`,
        versionResult.stdout,
        versionResult.stderr,
      ),
    };
  }

  const versionCompatible =
    definition.version.kind === "exact"
      ? version === definition.version.version
      : compareNumericVersions(version, definition.version.version) >= 0;
  if (!versionCompatible) {
    const requirement =
      definition.version.kind === "exact"
        ? `exactly ${definition.version.version}`
        : `at least ${definition.version.version}`;
    return {
      name: definition.name,
      state: "incompatible",
      commandPath,
      version,
      reason: `${definition.name} must be ${requirement}; found ${version}.`,
    };
  }

  const helpResult = deps.capture(commandPath, definition.helpArgs);
  const help = `${helpResult.stdout}\n${helpResult.stderr}`;
  const missingFlags = definition.requiredHelp.filter(
    (required) => !help.includes(required),
  );
  if (!helpResult.ok || missingFlags.length > 0) {
    const reason =
      missingFlags.length > 0
        ? `Missing required headless flags: ${missingFlags.join(", ")}.`
        : probeFailureReason(
            `Could not inspect ${definition.name} headless capabilities.`,
            helpResult.stdout,
            helpResult.stderr,
          );
    return {
      name: definition.name,
      state: "incompatible",
      commandPath,
      version,
      reason,
    };
  }

  if (!definition.authArgs) {
    return {
      name: definition.name,
      state: "unverified",
      commandPath,
      version,
      reason: "No zero-credit local authentication probe is available.",
    };
  }

  const authResult = deps.capture(commandPath, definition.authArgs);
  if (!authResult.ok) {
    return {
      name: definition.name,
      state: "unverified",
      commandPath,
      version,
      reason: probeFailureReason(
        "Local authentication readiness could not be confirmed.",
        authResult.stdout,
        authResult.stderr,
      ),
    };
  }

  return {
    name: definition.name,
    state: "healthy",
    commandPath,
    version,
    reason: "Executable, version, headless flags, and local auth are ready.",
  };
}

export function interpretProcessResult(result: ProcessResult): AgentOutcome {
  if (result.timedOut) {
    return {
      ok: false,
      status: result.status,
      reason: "Runtime process timed out.",
    };
  }
  if (result.aborted) {
    return {
      ok: false,
      status: result.status,
      reason: "Runtime process was aborted.",
    };
  }
  if (result.status !== 0) {
    return {
      ok: false,
      status: result.status,
      reason: `Runtime exited with status ${result.status ?? "unknown"}; inspect machine-local logs.`,
    };
  }
  return { ok: true, status: result.status };
}

export function createRuntimeAdapter(
  definition: RuntimeAdapterDefinition,
  deps: RuntimeProbeDeps,
): AriadneRuntimeAdapter {
  return Object.freeze({
    name: definition.name,
    command: definition.command,
    detect: () => detectRuntime(definition, deps),
    buildInvocation: (context: IterationContext): AgentInvocation => ({
      command: deps.findCommand(definition.command) ?? definition.command,
      args: definition.invocationArgs(context),
      cwd: context.projectRoot,
      env: { ...deps.baseEnv, ARIADNE_RUN_ID: context.runId },
    }),
    interpretResult: interpretProcessResult,
  });
}
