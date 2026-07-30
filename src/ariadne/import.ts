import { AriadneStateError, validatePrd } from "./schema.js";
import type { AriadnePrd, AriadneStory, StoryStatus } from "./types.js";

function record(input: unknown, jsonPath: string): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AriadneStateError(jsonPath, "expected an object");
  }
  return input as Record<string, unknown>;
}

function text(value: unknown, fallback: string, jsonPath?: string): string {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || value.trim() === "") {
    throw new AriadneStateError(jsonPath ?? "$", "expected a non-empty string");
  }
  return value;
}

function legacyStatus(
  story: Record<string, unknown>,
  jsonPath: string,
): StoryStatus {
  if (
    story.status === "pending" ||
    story.status === "in_progress" ||
    story.status === "completed" ||
    story.status === "blocked"
  ) {
    return story.status;
  }
  if (story.status !== undefined) {
    throw new AriadneStateError(
      `${jsonPath}.status`,
      "expected pending, in_progress, completed, or blocked",
    );
  }
  if (story.passes !== undefined && typeof story.passes !== "boolean") {
    throw new AriadneStateError(`${jsonPath}.passes`, "expected a boolean");
  }
  return story.passes === true ? "completed" : "pending";
}

function normalizeStory(
  input: unknown,
  index: number,
  collectionPath: "$.userStories" | "$.stories",
): AriadneStory {
  const storyPath = `${collectionPath}[${index}]`;
  const story = record(input, storyPath);
  let criteria: string[] = [];
  if (story.acceptanceCriteria !== undefined) {
    if (!Array.isArray(story.acceptanceCriteria)) {
      throw new AriadneStateError(
        `${storyPath}.acceptanceCriteria`,
        "expected an array",
      );
    }
    criteria = story.acceptanceCriteria.map((criterion, criterionIndex) => {
      if (typeof criterion !== "string" || criterion.trim() === "") {
        throw new AriadneStateError(
          `${storyPath}.acceptanceCriteria[${criterionIndex}]`,
          "expected a non-empty string",
        );
      }
      return criterion;
    });
  }
  if (
    story.priority !== undefined &&
    (!Number.isSafeInteger(story.priority) || (story.priority as number) <= 0)
  ) {
    throw new AriadneStateError(
      `${storyPath}.priority`,
      "expected a positive integer",
    );
  }
  if (
    story.attempts !== undefined &&
    (!Number.isSafeInteger(story.attempts) || (story.attempts as number) < 0)
  ) {
    throw new AriadneStateError(
      `${storyPath}.attempts`,
      "expected a non-negative integer",
    );
  }
  return {
    id: text(
      story.id,
      `S${String(index + 1).padStart(2, "0")}`,
      `${storyPath}.id`,
    ),
    title: text(story.title, "Untitled story", `${storyPath}.title`),
    description:
      story.description === undefined
        ? "Legacy story"
        : text(story.description, "Legacy story", `${storyPath}.description`),
    acceptanceCriteria: criteria,
    priority:
      Number.isSafeInteger(story.priority) && (story.priority as number) > 0
        ? (story.priority as number)
        : index + 1,
    status: legacyStatus(story, storyPath),
    attempts:
      Number.isSafeInteger(story.attempts) && (story.attempts as number) >= 0
        ? (story.attempts as number)
        : 0,
  };
}

export function normalizeImportedPrd(input: unknown): AriadnePrd {
  const source = record(input, "$");
  if (source.schemaVersion === 1) return validatePrd(source);
  const collectionPath = Array.isArray(source.userStories)
    ? "$.userStories"
    : Array.isArray(source.stories)
      ? "$.stories"
      : undefined;
  if (!collectionPath) {
    throw new AriadneStateError("$.userStories", "expected an array");
  }
  const sourceStories =
    collectionPath === "$.userStories"
      ? (source.userStories as unknown[])
      : (source.stories as unknown[]);

  return validatePrd({
    schemaVersion: 1,
    project: text(source.project, "Imported project", "$.project"),
    branchName: text(source.branchName, "main", "$.branchName"),
    description: text(
      source.description,
      "Imported from legacy prd.json",
      "$.description",
    ),
    userStories: sourceStories.map((story, index) =>
      normalizeStory(story, index, collectionPath),
    ),
  });
}
