import { describe, expect, it } from "vitest";
import { normalizeImportedPrd } from "../../../src/ariadne/import.js";
import {
  AriadneStateError,
  assertRunnableConfig,
  assertStoryTransition,
  validateConfig,
  validatePrd,
} from "../../../src/ariadne/schema.js";

const canonicalPrd = {
  schemaVersion: 1,
  project: "Ariadne",
  branchName: "feature/ariadne",
  description: "Autonomous task runner",
  userStories: [
    {
      id: "S01",
      title: "Persist state",
      description: "Save the PRD",
      acceptanceCriteria: ["State survives a reload"],
      priority: 1,
      status: "pending",
      attempts: 0,
    },
  ],
};

describe("Ariadne schemas", () => {
  it("parses canonical PRD and config values", () => {
    expect(validatePrd(canonicalPrd)).toEqual(canonicalPrd);
    expect(
      validateConfig({
        schemaVersion: 1,
        runtime: "codex",
        qualityChecks: ["pnpm test"],
      }),
    ).toEqual({
      schemaVersion: 1,
      runtime: "codex",
      qualityChecks: ["pnpm test"],
      maxAttemptsPerStory: 3,
    });
  });

  it("reports duplicate story IDs at their exact JSON path", () => {
    expect(() =>
      validatePrd({
        ...canonicalPrd,
        userStories: [
          ...canonicalPrd.userStories,
          { ...canonicalPrd.userStories[0] },
        ],
      }),
    ).toThrow(expect.objectContaining({ jsonPath: "$.userStories[1].id" }));
  });

  it("reports malformed values at their exact JSON path", () => {
    expect(() => validatePrd({ ...canonicalPrd, branchName: "" })).toThrow(
      expect.objectContaining({ jsonPath: "$.branchName" }),
    );
    expect(() =>
      validateConfig({ schemaVersion: 1, qualityChecks: [""] }),
    ).toThrow(expect.objectContaining({ jsonPath: "$.qualityChecks[0]" }));
  });

  it("permits only explicit story status transitions", () => {
    expect(() => assertStoryTransition("pending", "in_progress")).not.toThrow();
    expect(() =>
      assertStoryTransition("in_progress", "completed"),
    ).not.toThrow();
    expect(() =>
      assertStoryTransition("in_progress", "in_progress"),
    ).not.toThrow();
    expect(() => assertStoryTransition("in_progress", "blocked")).not.toThrow();
    expect(() => assertStoryTransition("pending", "blocked")).toThrow(
      AriadneStateError,
    );
    expect(() => assertStoryTransition("in_progress", "pending")).toThrow(
      AriadneStateError,
    );
    expect(() => assertStoryTransition("blocked", "pending")).toThrow(
      AriadneStateError,
    );
    expect(() => assertStoryTransition("completed", "pending")).toThrow(
      AriadneStateError,
    );
    expect(() => assertStoryTransition("pending", "completed")).toThrow(
      AriadneStateError,
    );
  });

  it("requires quality checks only for an executable run", () => {
    const config = validateConfig({ schemaVersion: 1, qualityChecks: [] });
    expect(config.qualityChecks).toEqual([]);
    expect(() => assertRunnableConfig(config)).toThrow(
      expect.objectContaining({ jsonPath: "$.qualityChecks" }),
    );
  });
});

describe("normalizeImportedPrd", () => {
  it("rejects a missing legacy story collection with a typed exact path", () => {
    expect(() => normalizeImportedPrd({ project: "Missing stories" })).toThrow(
      expect.objectContaining({
        name: "AriadneStateError",
        jsonPath: "$.userStories",
      }),
    );
  });

  it("uses the source collection path for malformed Ralph and Helix stories", () => {
    expect(() => normalizeImportedPrd({ userStories: [null] })).toThrow(
      expect.objectContaining({ jsonPath: "$.userStories[0]" }),
    );
    expect(() => normalizeImportedPrd({ stories: [null] })).toThrow(
      expect.objectContaining({ jsonPath: "$.stories[0]" }),
    );
    expect(() =>
      normalizeImportedPrd({ stories: [{ id: 42, title: "Bad id" }] }),
    ).toThrow(expect.objectContaining({ jsonPath: "$.stories[0].id" }));
    expect(() =>
      normalizeImportedPrd({
        userStories: [
          { title: "Bad criteria", acceptanceCriteria: "not-an-array" },
        ],
      }),
    ).toThrow(
      expect.objectContaining({
        jsonPath: "$.userStories[0].acceptanceCriteria",
      }),
    );
    expect(() =>
      normalizeImportedPrd({
        stories: [{ title: "Bad criterion", acceptanceCriteria: [false] }],
      }),
    ).toThrow(
      expect.objectContaining({
        jsonPath: "$.stories[0].acceptanceCriteria[0]",
      }),
    );
  });

  it("normalizes Ralph userStories and passes without mutating the source", () => {
    const source = {
      project: "Ralph",
      branchName: "feature/ralph",
      userStories: [
        {
          id: "R1",
          title: "Ralph story",
          description: "Legacy",
          priority: 2,
          passes: true,
        },
      ],
    };
    const result = normalizeImportedPrd(source);

    expect(result).toMatchObject({
      schemaVersion: 1,
      project: "Ralph",
      userStories: [
        { id: "R1", status: "completed", attempts: 0, acceptanceCriteria: [] },
      ],
    });
    expect(result.userStories).not.toBe(source.userStories);
    expect(source).toEqual({
      project: "Ralph",
      branchName: "feature/ralph",
      userStories: [
        {
          id: "R1",
          title: "Ralph story",
          description: "Legacy",
          priority: 2,
          passes: true,
        },
      ],
    });
  });

  it("normalizes Helix stories and supplies missing priorities", () => {
    expect(
      normalizeImportedPrd({
        project: "Helix",
        stories: [
          {
            id: "H1",
            title: "Helix story",
            description: "Legacy",
            passes: false,
          },
        ],
      }),
    ).toMatchObject({
      project: "Helix",
      userStories: [{ id: "H1", priority: 1, status: "pending" }],
    });
  });

  it("migrates the documented legacy PRD shape", () => {
    expect(
      normalizeImportedPrd({
        branchName: "feature/photos",
        stories: [
          {
            id: "S01",
            title: "Photos",
            description: "Add photos",
            priority: 1,
            passes: false,
          },
        ],
      }),
    ).toEqual({
      schemaVersion: 1,
      project: "Imported project",
      branchName: "feature/photos",
      description: "Imported from legacy prd.json",
      userStories: [
        {
          id: "S01",
          title: "Photos",
          description: "Add photos",
          acceptanceCriteria: [],
          priority: 1,
          status: "pending",
          attempts: 0,
        },
      ],
    });
  });
});
