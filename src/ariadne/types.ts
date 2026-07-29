import type { RuntimeName } from "../state.js";

export type AriadneRuntimeName = RuntimeName;
export type StoryStatus = "pending" | "in_progress" | "completed" | "blocked";

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
