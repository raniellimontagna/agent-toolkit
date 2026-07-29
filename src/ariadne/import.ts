import { validatePrd } from "./schema.js";
import type { AriadnePrd, AriadneStory, StoryStatus } from "./types.js";

function record(input: unknown, jsonPath: string): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError(`${jsonPath}: expected an object`);
  }
  return input as Record<string, unknown>;
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

function legacyStatus(story: Record<string, unknown>): StoryStatus {
  if (
    story.status === "pending" ||
    story.status === "in_progress" ||
    story.status === "completed" ||
    story.status === "blocked"
  ) {
    return story.status;
  }
  return story.passes === true ? "completed" : "pending";
}

function normalizeStory(input: unknown, index: number): AriadneStory {
  const story = record(input, `$.stories[${index}]`);
  const criteria = Array.isArray(story.acceptanceCriteria)
    ? story.acceptanceCriteria.map((criterion) => criterion)
    : [];
  return {
    id: text(story.id, `S${String(index + 1).padStart(2, "0")}`),
    title: text(story.title, "Untitled story"),
    description: text(story.description, ""),
    acceptanceCriteria: criteria,
    priority:
      Number.isSafeInteger(story.priority) && (story.priority as number) > 0
        ? (story.priority as number)
        : index + 1,
    status: legacyStatus(story),
    attempts:
      Number.isSafeInteger(story.attempts) && (story.attempts as number) >= 0
        ? (story.attempts as number)
        : 0,
  };
}

export function normalizeImportedPrd(input: unknown): AriadnePrd {
  const source = record(input, "$");
  if (source.schemaVersion === 1) return validatePrd(source);
  const sourceStories = Array.isArray(source.userStories)
    ? source.userStories
    : Array.isArray(source.stories)
      ? source.stories
      : [];

  return validatePrd({
    schemaVersion: 1,
    project: text(source.project, "Imported project"),
    branchName: text(source.branchName, "main"),
    description: text(source.description, "Imported from legacy prd.json"),
    userStories: sourceStories.map(normalizeStory),
  });
}
