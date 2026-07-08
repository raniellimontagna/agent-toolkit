import { describe, expect, it } from "vitest";
import { normalizeScope, splitList, state } from "../../src/state.js";

describe("state helpers", () => {
  it("splits comma lists into normalized lowercase values", () => {
    expect(splitList(" React, backend/node ,, GO ")).toEqual([
      "react",
      "backend/node",
      "go",
    ]);
  });

  it("normalizes scope separators and outer slashes", () => {
    expect(normalizeScope(" /Backend\\Node/ ")).toBe("backend/node");
  });

  it("exposes React Doctor as a pinned frontend skill source", () => {
    expect(state.frontendSkillSources).toEqual(
      expect.arrayContaining([
        {
          label: "React Doctor",
          repository: "millionco/react-doctor",
          ref: "aa519e5f5505105ef8c00e1b1972c98514f7577a",
          skill: "react-doctor",
        },
      ]),
    );
  });
});
