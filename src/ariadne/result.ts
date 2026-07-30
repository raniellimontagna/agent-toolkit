import fs from "node:fs";
import path from "node:path";
import type { QualityCheckResult } from "./checks.js";
import { validateAgentResult } from "./schema.js";
import type { AriadneExternalFileIdentity } from "./store.js";
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
  outcome?:
    | "completed"
    | "failed"
    | "blocked"
    | "interrupted"
    | "budget_exhausted";
  commit?: string;
  failureCategory?: string;
  failureReason?: string;
};

export type CoordinatorProgressEntryInput = {
  timestamp: string;
  runId: string;
  storyId: string;
  runtime: AriadneRuntimeName;
  outcome: "failed" | "blocked" | "interrupted" | "budget_exhausted";
  failureCategory: string;
  failureReason: string;
};

export type DurableValidatedResult = Pick<
  AgentResult,
  "outcome" | "summary" | "filesChanged" | "learnings"
>;

const MAX_DURABLE_VALUE_LENGTH = 500;

export function sanitizeDurableValue(value: string): string {
  let sanitized = value
    .replace(
      /\b(authorization)\s*([:=])\s*[^\r\n]*/gi,
      (_match, name: string, separator: string) =>
        `${name}${separator === ":" ? ": " : "="}[REDACTED]`,
    )
    .replace(/\p{Cc}+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  sanitized = sanitized
    .replace(/\bbearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(
      /(--(?:api[-_]?key|token|password|secret|authorization|credential))(?:=|\s+)(?:"[^"]*"|'[^']*'|\S+)/gi,
      "$1 [REDACTED]",
    )
    .replace(
      /\b(api[-_]?key|token|password|secret|authorization|credential)\s*([:=])\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
      (_match, name: string, separator: string) =>
        `${name}${separator === ":" ? ": " : "="}[REDACTED]`,
    )
    .replace(/\bgh[pousr]_[A-Za-z0-9_]{16,}\b/g, "[REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, "[REDACTED]");
  if (sanitized.length <= MAX_DURABLE_VALUE_LENGTH) return sanitized;
  return `${sanitized.slice(0, MAX_DURABLE_VALUE_LENGTH - 1)}…`;
}

export function sanitizeValidatedResult(
  result: DurableValidatedResult,
): DurableValidatedResult {
  return {
    outcome: result.outcome,
    summary: sanitizeDurableValue(result.summary),
    filesChanged: result.filesChanged.map(sanitizeDurableValue),
    learnings: result.learnings.map(sanitizeDurableValue),
  };
}

export function sanitizeQualityCheckResult(
  check: QualityCheckResult,
): QualityCheckResult {
  return {
    ...check,
    command: sanitizeDurableValue(check.command),
    stdoutPath: path.basename(check.stdoutPath),
    stderrPath: path.basename(check.stderrPath),
  };
}

export function readAgentResult(
  resultPath: string,
  expected: ExpectedAgentResult,
  certifiedIdentity?: AriadneExternalFileIdentity,
): AgentResult {
  let contents: string;
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(
      resultPath,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
    );
    const stat = fs.fstatSync(descriptor);
    if (
      !stat.isFile() ||
      stat.nlink !== 1 ||
      (certifiedIdentity !== undefined &&
        (certifiedIdentity.source !== resultPath ||
          certifiedIdentity.device !== stat.dev ||
          certifiedIdentity.inode !== stat.ino ||
          certifiedIdentity.links !== stat.nlink))
    ) {
      throw new Error("unsafe result identity");
    }
    contents = fs.readFileSync(descriptor, "utf8");
  } catch {
    throw new Error(
      "Unable to read agent result; inspect machine-local result.json.",
    );
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents) as unknown;
  } catch {
    throw new Error(
      "Agent result contains invalid JSON; inspect machine-local result.json.",
    );
  }
  try {
    return validateAgentResult(parsed, expected);
  } catch {
    throw new Error(
      "Agent result failed validation; inspect machine-local result.json.",
    );
  }
}

export function formatProgressEntry(input: ProgressEntryInput): string {
  const checks = input.checks.map((check) => {
    const outcome = check.status === 0 ? "passed" : "failed";
    return `- ${sanitizeDurableValue(check.command)}: ${outcome} (${check.durationMs}ms)`;
  });
  const outcome =
    input.outcome ??
    (input.failureCategory === undefined ? input.result.outcome : "failed");
  const lines = [
    `## ${input.timestamp} — ${input.runId}`,
    "",
    `- story: ${sanitizeDurableValue(input.story.id)}`,
    `- runtime: ${input.runtime}`,
    `- outcome: ${outcome}`,
    `- criteria: ${input.result.criteria.filter((criterion) => criterion.passed).length}/${input.result.criteria.length} passed`,
    `- summary: ${sanitizeDurableValue(input.result.summary)}`,
    "- changed files:",
    ...(input.result.filesChanged.length > 0
      ? input.result.filesChanged.map(
          (file) => `  - ${sanitizeDurableValue(file)}`,
        )
      : ["  - none"]),
    "- learnings:",
    ...(input.result.learnings.length > 0
      ? input.result.learnings.map(
          (learning) => `  - ${sanitizeDurableValue(learning)}`,
        )
      : ["  - none"]),
    `- checks attempted: ${input.result.checksAttempted.length}`,
    ...checks,
    ...(input.commit
      ? [`- commit: ${sanitizeDurableValue(input.commit)}`]
      : []),
    ...(input.failureCategory
      ? [`- failure category: ${sanitizeDurableValue(input.failureCategory)}`]
      : []),
    ...(input.failureReason
      ? [`- failure reason: ${sanitizeDurableValue(input.failureReason)}`]
      : []),
    "",
    "---",
    "",
  ];
  return lines.join("\n");
}

export function formatCoordinatorProgressEntry(
  input: CoordinatorProgressEntryInput,
): string {
  return [
    `## ${input.timestamp} — ${input.runId}`,
    "",
    `- story: ${sanitizeDurableValue(input.storyId)}`,
    `- runtime: ${input.runtime}`,
    `- outcome: ${input.outcome}`,
    `- failure category: ${sanitizeDurableValue(input.failureCategory)}`,
    `- failure reason: ${sanitizeDurableValue(input.failureReason)}`,
    "",
    "---",
    "",
  ].join("\n");
}
