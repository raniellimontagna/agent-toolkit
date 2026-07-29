import { isRuntimeName } from "../state.js";
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
