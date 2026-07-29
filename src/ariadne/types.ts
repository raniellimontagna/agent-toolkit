import type { RuntimeName } from "../state.js";

export type AriadneRuntimeName = RuntimeName;
export type StoryStatus = "pending" | "in_progress" | "completed" | "blocked";

export type AriadneRunOutcome =
  | "complete"
  | "incomplete"
  | "blocked"
  | "budget_exhausted"
  | "interrupted"
  | "structural_error";

export type AttemptFailure = {
  runId: string;
  category: "process" | "result" | "criterion" | "check" | "commit";
  message: string;
  timestamp: string;
};

export type AriadneRunOptions = {
  runtime: AriadneRuntimeName;
  maxIterations?: number;
  maxRuntimeMs?: number;
  dryRun: boolean;
};

export type AriadneRunSummary = {
  schemaVersion: 1;
  command: "run";
  outcome: AriadneRunOutcome;
  runtime: AriadneRuntimeName;
  iterations: number;
  completedStoryIds: string[];
  activeStoryId?: string;
  blockedStoryId?: string;
  lastRunId?: string;
  commit?: string;
};

export type AriadneStory = {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  priority: number;
  status: StoryStatus;
  attempts: number;
};

export type AriadnePrd = {
  schemaVersion: 1;
  project: string;
  branchName: string;
  description: string;
  userStories: AriadneStory[];
};

export type AriadneConfig = {
  schemaVersion: 1;
  runtime?: AriadneRuntimeName;
  qualityChecks: string[];
  maxAttemptsPerStory: number;
};

export type ProcessResult = {
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  timedOut: boolean;
  aborted: boolean;
};

export class AriadneUsageError extends Error {}

export type AriadneCommand =
  | {
      kind: "init";
      runtime?: AriadneRuntimeName;
      qualityChecks: string[];
      json: boolean;
    }
  | {
      kind: "run";
      runtime?: AriadneRuntimeName;
      maxIterations?: number;
      maxRuntimeMs?: number;
      dryRun: boolean;
      json: boolean;
    }
  | { kind: "status"; json: boolean }
  | { kind: "doctor"; json: boolean }
  | { kind: "help" };
