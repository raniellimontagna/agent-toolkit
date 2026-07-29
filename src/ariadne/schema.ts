import { isRuntimeName } from "../state.js";
import type {
  AgentCriterionResult,
  AgentResult,
  ExpectedAgentResult,
} from "./result.js";
import type {
  AriadneConfig,
  AriadnePrd,
  AriadneStory,
  StoryStatus,
} from "./types.js";

export class AriadneStateError extends Error {
  constructor(
    public readonly jsonPath: string,
    message: string,
  ) {
    super(`${jsonPath}: ${message}`);
    this.name = "AriadneStateError";
  }
}

function stateError(path: string, message: string): never {
  throw new AriadneStateError(path, message);
}

function recordAt(input: unknown, jsonPath: string): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    stateError(jsonPath, "expected an object");
  }
  return input as Record<string, unknown>;
}

function stringAt(input: unknown, jsonPath: string): string {
  if (typeof input !== "string" || input.trim() === "") {
    stateError(jsonPath, "expected a non-empty string");
  }
  return input;
}

function integerAt(input: unknown, jsonPath: string, minimum = 0): number {
  if (!Number.isSafeInteger(input) || (input as number) < minimum) {
    stateError(
      jsonPath,
      `expected an integer greater than or equal to ${minimum}`,
    );
  }
  return input as number;
}

function arrayAt(input: unknown, jsonPath: string): unknown[] {
  if (!Array.isArray(input)) stateError(jsonPath, "expected an array");
  return input;
}

function schemaVersionAt(input: unknown, jsonPath: string): 1 {
  if (input !== 1) stateError(jsonPath, "expected schema version 1");
  return 1;
}

function statusAt(input: unknown, jsonPath: string): StoryStatus {
  if (
    input === "pending" ||
    input === "in_progress" ||
    input === "completed" ||
    input === "blocked"
  ) {
    return input;
  }
  return stateError(
    jsonPath,
    "expected pending, in_progress, completed, or blocked",
  );
}

function validateStory(input: unknown, jsonPath: string): AriadneStory {
  const story = recordAt(input, jsonPath);
  const acceptanceCriteria = arrayAt(
    story.acceptanceCriteria,
    `${jsonPath}.acceptanceCriteria`,
  ).map((criterion, index) =>
    stringAt(criterion, `${jsonPath}.acceptanceCriteria[${index}]`),
  );

  return {
    id: stringAt(story.id, `${jsonPath}.id`),
    title: stringAt(story.title, `${jsonPath}.title`),
    description: stringAt(story.description, `${jsonPath}.description`),
    acceptanceCriteria,
    priority: integerAt(story.priority, `${jsonPath}.priority`, 1),
    status: statusAt(story.status, `${jsonPath}.status`),
    attempts: integerAt(story.attempts, `${jsonPath}.attempts`),
  };
}

export function validatePrd(input: unknown): AriadnePrd {
  const prd = recordAt(input, "$");
  const userStories = arrayAt(prd.userStories, "$.userStories").map(
    (story, index) => validateStory(story, `$.userStories[${index}]`),
  );
  const ids = new Set<string>();
  for (let index = 0; index < userStories.length; index += 1) {
    const id = userStories[index]?.id;
    if (!id) continue;
    if (ids.has(id))
      stateError(`$.userStories[${index}].id`, `duplicate story id: ${id}`);
    ids.add(id);
  }

  return {
    schemaVersion: schemaVersionAt(prd.schemaVersion, "$.schemaVersion"),
    project: stringAt(prd.project, "$.project"),
    branchName: stringAt(prd.branchName, "$.branchName"),
    description: stringAt(prd.description, "$.description"),
    userStories,
  };
}

export function validateConfig(input: unknown): AriadneConfig {
  const config = recordAt(input, "$");
  const qualityChecks = arrayAt(config.qualityChecks, "$.qualityChecks").map(
    (check, index) => stringAt(check, `$.qualityChecks[${index}]`),
  );
  const runtime = config.runtime;
  if (
    runtime !== undefined &&
    (typeof runtime !== "string" || !isRuntimeName(runtime))
  ) {
    stateError("$.runtime", "expected a supported runtime");
  }
  const maxAttemptsPerStory =
    config.maxAttemptsPerStory === undefined
      ? 3
      : integerAt(config.maxAttemptsPerStory, "$.maxAttemptsPerStory", 1);

  return {
    schemaVersion: schemaVersionAt(config.schemaVersion, "$.schemaVersion"),
    ...(runtime === undefined ? {} : { runtime }),
    qualityChecks,
    maxAttemptsPerStory,
  };
}

export function assertRunnableConfig(config: AriadneConfig): void {
  if (config.qualityChecks.length === 0) {
    stateError(
      "$.qualityChecks",
      "at least one quality check is required for a run",
    );
  }
}

const transitions: Record<StoryStatus, readonly StoryStatus[]> = {
  pending: ["in_progress", "blocked"],
  in_progress: ["completed", "blocked", "pending"],
  completed: [],
  blocked: ["pending", "in_progress"],
};

export function assertStoryTransition(
  from: StoryStatus,
  to: StoryStatus,
): void {
  if (!transitions[from].includes(to)) {
    stateError(
      "$.userStories[].status",
      `invalid story transition from ${from} to ${to}`,
    );
  }
}

function booleanAt(input: unknown, jsonPath: string): boolean {
  if (typeof input !== "boolean") stateError(jsonPath, "expected a boolean");
  return input;
}

function safeRelativePathAt(input: unknown, jsonPath: string): string {
  const value = stringAt(input, jsonPath);
  if (
    value.includes("\0") ||
    value.startsWith("/") ||
    value.startsWith("\\") ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    value
      .split(/[\\/]+/)
      .some((part) => part === "" || part === "." || part === "..")
  ) {
    stateError(jsonPath, "expected a safe relative path");
  }
  return value;
}

function validateAgentCriterion(
  input: unknown,
  jsonPath: string,
): AgentCriterionResult {
  const criterion = recordAt(input, jsonPath);
  return {
    criterion: stringAt(criterion.criterion, `${jsonPath}.criterion`),
    passed: booleanAt(criterion.passed, `${jsonPath}.passed`),
    evidence: stringAt(criterion.evidence, `${jsonPath}.evidence`),
  };
}

export function validateAgentResult(
  input: unknown,
  expected: ExpectedAgentResult,
): AgentResult {
  const result = recordAt(input, "$"),
    criteria = arrayAt(result.criteria, "$.criteria").map((criterion, index) =>
      validateAgentCriterion(criterion, `$.criteria[${index}]`),
    ),
    filesChanged = arrayAt(result.filesChanged, "$.filesChanged").map(
      (file, index) => safeRelativePathAt(file, `$.filesChanged[${index}]`),
    ),
    checksAttempted = arrayAt(result.checksAttempted, "$.checksAttempted").map(
      (check, index) => stringAt(check, `$.checksAttempted[${index}]`),
    ),
    learnings = arrayAt(result.learnings, "$.learnings").map(
      (learning, index) => stringAt(learning, `$.learnings[${index}]`),
    );
  const outcome = result.outcome;
  if (outcome !== "completed" && outcome !== "failed") {
    stateError("$.outcome", "expected completed or failed");
  }
  const runId = stringAt(result.runId, "$.runId");
  if (runId !== expected.runId) stateError("$.runId", "does not match run");
  const storyId = stringAt(result.storyId, "$.storyId");
  if (storyId !== expected.storyId)
    stateError("$.storyId", "does not match story");

  const criteriaByName = new Map<string, AgentCriterionResult>();
  for (const [index, criterion] of criteria.entries()) {
    if (criteriaByName.has(criterion.criterion)) {
      stateError(`$.criteria[${index}].criterion`, "duplicate criterion");
    }
    criteriaByName.set(criterion.criterion, criterion);
  }
  for (const criterion of expected.acceptanceCriteria) {
    if (!criteriaByName.has(criterion)) {
      stateError("$.criteria", `missing criterion: ${criterion}`);
    }
  }
  if (criteriaByName.size !== expected.acceptanceCriteria.length) {
    stateError("$.criteria", "contains an unexpected criterion");
  }
  if (
    outcome === "completed" &&
    criteria.some((criterion) => !criterion.passed)
  ) {
    stateError("$.criteria", "completed results require passing criteria");
  }

  const failureReason =
    result.failureReason === undefined
      ? undefined
      : stringAt(result.failureReason, "$.failureReason");
  if (outcome === "failed" && failureReason === undefined) {
    stateError("$.failureReason", "is required for failed results");
  }

  return {
    schemaVersion: schemaVersionAt(result.schemaVersion, "$.schemaVersion"),
    runId,
    storyId,
    outcome,
    criteria,
    summary: stringAt(result.summary, "$.summary"),
    filesChanged,
    checksAttempted,
    learnings,
    ...(failureReason === undefined ? {} : { failureReason }),
  };
}
