import fs from "node:fs";
import type { QualityCheckResult } from "./checks.js";
import { validateAgentResult } from "./schema.js";
import type { AriadneRuntimeName, AriadneStory } from "./types.js";

export type AgentCriterionResult = {
  criterion: string;
  passed: boolean;
  evidence: string;
};

export type AgentResult = {
  schemaVersion: 1;
  runId: string;
  storyId: string;
  outcome: "completed" | "failed";
  criteria: AgentCriterionResult[];
  summary: string;
  filesChanged: string[];
  checksAttempted: string[];
  learnings: string[];
  failureReason?: string;
};

export type ExpectedAgentResult = {
  runId: string;
  storyId: string;
  acceptanceCriteria: string[];
  projectRoot: string;
};

export type ProgressEntryInput = {
  timestamp: string;
  runId: string;
  story: AriadneStory;
  runtime: AriadneRuntimeName;
  result: AgentResult;
  checks: QualityCheckResult[];
  commit?: string;
  failureCategory?: string;
};

export function readAgentResult(
  path: string,
  expected: ExpectedAgentResult,
): AgentResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(path, "utf8")) as unknown;
  } catch (error) {
    throw new Error(
      `Unable to read agent result at ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return validateAgentResult(parsed, expected);
}

export function formatProgressEntry(input: ProgressEntryInput): string {
  const checks = input.checks.map((check) => {
    const outcome = check.status === 0 ? "passed" : "failed";
    return `- ${check.command}: ${outcome} (${check.durationMs}ms)`;
  });
  const lines = [
    `## ${input.timestamp} — ${input.runId}`,
    "",
    `- story: ${input.story.id}`,
    `- runtime: ${input.runtime}`,
    `- outcome: ${input.result.outcome}`,
    `- criteria: ${input.result.criteria.filter((criterion) => criterion.passed).length}/${input.result.criteria.length} passed`,
    `- files changed: ${input.result.filesChanged.length}`,
    `- checks attempted: ${input.result.checksAttempted.length}`,
    ...checks,
    ...(input.commit ? [`- commit: ${input.commit}`] : []),
    ...(input.failureCategory
      ? [`- failure category: ${input.failureCategory}`]
      : []),
    "",
    "---",
    "",
  ];
  return lines.join("\n");
}
