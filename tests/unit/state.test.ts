import { describe, expect, it } from "vitest";
import { normalizeScope, splitList } from "../../src/state.js";

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
});
