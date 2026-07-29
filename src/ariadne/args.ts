import { isRuntimeName } from "../state.js";
import {
  type AriadneCommand,
  type AriadneRuntimeName,
  AriadneUsageError,
} from "./types.js";

type CommandKind = AriadneCommand["kind"];

const commandNames = new Set<CommandKind>([
  "init",
  "run",
  "status",
  "doctor",
  "help",
]);

const allowedFlags: Record<CommandKind, ReadonlySet<string>> = {
  init: new Set(["--runtime", "--check", "--json"]),
  run: new Set([
    "--runtime",
    "--max-iterations",
    "--max-runtime",
    "--dry-run",
    "--json",
  ]),
  status: new Set(["--json"]),
  doctor: new Set(["--json"]),
  help: new Set(),
};
const knownFlags = new Set(
  Object.values(allowedFlags).flatMap((flags) => [...flags]),
);

function usageError(message: string): never {
  throw new AriadneUsageError(message);
}

function parseDuration(value: string): number {
  const match = /^(\d+)(ms|s|m|h)$/.exec(value);
  if (!match) usageError(`Invalid duration: ${value}.`);

  const amount = Number(match[1]);
  const unit = match[2];
  const multiplier =
    unit === "ms"
      ? 1
      : unit === "s"
        ? 1_000
        : unit === "m"
          ? 60_000
          : 3_600_000;
  const durationMs = amount * multiplier;

  if (!Number.isSafeInteger(durationMs) || durationMs <= 0) {
    usageError(`Invalid duration: ${value}.`);
  }

  return durationMs;
}

function parsePositiveInteger(value: string): number {
  if (!/^\d+$/.test(value)) {
    usageError(`Expected a positive integer, received: ${value}.`);
  }

  const result = Number(value);
  if (!Number.isSafeInteger(result) || result <= 0) {
    usageError(`Expected a positive integer, received: ${value}.`);
  }

  return result;
}

function takeValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    usageError(`${flag} requires a value.`);
  }
  return value;
}

export function parseAriadneArgs(argv: string[]): AriadneCommand {
  const [command, ...flags] = argv;
  if (!command || !commandNames.has(command as CommandKind)) {
    usageError("Ariadne requires init, run, status, or doctor.");
  }

  const kind = command as CommandKind;
  if (kind === "help") {
    if (flags.length > 0) usageError("No flags are valid for help.");
    return { kind: "help" };
  }

  let runtime: AriadneRuntimeName | undefined;
  let maxIterations: number | undefined;
  let maxRuntimeMs: number | undefined;
  let json = false;
  let dryRun = false;
  const qualityChecks: string[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < flags.length; index += 1) {
    const flag = flags[index];
    if (!flag) continue;

    if (!flag.startsWith("--") || !knownFlags.has(flag)) {
      usageError(`unknown flag: ${flag}.`);
    }
    if (!allowedFlags[kind].has(flag)) {
      usageError(`${flag} is not valid for ${kind}.`);
    }
    if (flag !== "--check" && seen.has(flag)) {
      usageError(`duplicate flag: ${flag}.`);
    }
    seen.add(flag);

    switch (flag) {
      case "--runtime": {
        const value = takeValue(flags, index, flag);
        if (!isRuntimeName(value)) usageError(`unsupported runtime: ${value}.`);
        runtime = value;
        index += 1;
        break;
      }
      case "--check":
        qualityChecks.push(takeValue(flags, index, flag));
        index += 1;
        break;
      case "--max-iterations":
        maxIterations = parsePositiveInteger(takeValue(flags, index, flag));
        index += 1;
        break;
      case "--max-runtime":
        maxRuntimeMs = parseDuration(takeValue(flags, index, flag));
        index += 1;
        break;
      case "--dry-run":
        dryRun = true;
        break;
      case "--json":
        json = true;
        break;
    }
  }

  switch (kind) {
    case "init":
      return {
        kind,
        ...(runtime === undefined ? {} : { runtime }),
        qualityChecks,
        json,
      };
    case "run":
      return {
        kind,
        ...(runtime === undefined ? {} : { runtime }),
        ...(maxIterations === undefined ? {} : { maxIterations }),
        ...(maxRuntimeMs === undefined ? {} : { maxRuntimeMs }),
        dryRun,
        json,
      };
    case "status":
    case "doctor":
      return { kind, json };
  }
}
