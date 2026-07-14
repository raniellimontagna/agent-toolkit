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

  it("exposes the validated Agent Skills catalog without mirrored arrays", () => {
    expect(state.agentSkillsCliPackage).toBe("skills@1.5.13");
    expect(Object.keys(state.agentSkillsCatalog.repositories)).toHaveLength(7);
    expect(
      state.agentSkillsCatalog.bundles["planning-skills"].skills.map(
        ({ skill }) => skill,
      ),
    ).toEqual([
      "grill-me",
      "grilling",
      "grill-with-docs",
      "domain-modeling",
      "codebase-design",
      "improve-codebase-architecture",
    ]);
  });
});
