import type { RunResult } from "../../system.js";
import type { AriadneRuntimeName, ProcessResult } from "../types.js";

export type RuntimeDetectionState =
  | "unavailable"
  | "incompatible"
  | "unverified"
  | "healthy";

export type AgentInvocation = {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  // Set when the caller already built a Windows command line that cmd.exe must
  // receive unmodified, so Node must not re-quote the arguments.
  verbatim?: boolean;
};

export type RuntimeDetection = {
  name: AriadneRuntimeName;
  state: RuntimeDetectionState;
  commandPath?: string;
  version?: string;
  reason: string;
};

export type IterationContext = {
  runId: string;
  projectRoot: string;
  promptPath: string;
  relativePromptPath: string;
};

export type AgentOutcome = {
  ok: boolean;
  status: number | null;
  reason?: string;
};

export type RuntimeProbeDeps = {
  findCommand: (command: string) => string | null;
  capture: (command: string, args: string[]) => RunResult;
  baseEnv: NodeJS.ProcessEnv;
};

export type RuntimeRegistry = Record<AriadneRuntimeName, AriadneRuntimeAdapter>;

export type RuntimeSelectionInput = {
  explicit?: AriadneRuntimeName;
  configured?: AriadneRuntimeName;
  globalPreferred?: AriadneRuntimeName;
  interactive: boolean;
  choose?: (choices: RuntimeDetection[]) => Promise<AriadneRuntimeName>;
  registry: RuntimeRegistry;
};

export type RuntimeSelection = {
  name: AriadneRuntimeName;
  adapter: AriadneRuntimeAdapter;
  detection: RuntimeDetection;
  source: "explicit" | "configured" | "automatic" | "global" | "interactive";
};

export class AriadneRuntimeError extends Error {}

export interface AriadneRuntimeAdapter {
  readonly name: AriadneRuntimeName;
  readonly command: string;
  detect(): RuntimeDetection;
  buildInvocation(context: IterationContext): AgentInvocation;
  interpretResult(result: ProcessResult): AgentOutcome;
}
