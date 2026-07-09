import { describe, expect, it } from "vitest";
import { versionOutputMatchesPin } from "../../src/runtimes.js";

describe("versionOutputMatchesPin", () => {
  it("matches the pinned version as a whole token", () => {
    expect(
      versionOutputMatchesPin("claude 2.1.204 (Claude Code)", "2.1.204"),
    ).toBe(true);
    expect(versionOutputMatchesPin("codex-cli 0.143.0", "0.143.0")).toBe(true);
    expect(versionOutputMatchesPin("0.49.0", "0.49.0")).toBe(true);
  });

  it("accepts a v-prefixed version token", () => {
    expect(versionOutputMatchesPin("gemini v0.49.0", "0.49.0")).toBe(true);
  });

  it("rejects versions that merely contain the pin as a prefix", () => {
    expect(versionOutputMatchesPin("claude 2.0.10", "2.0.1")).toBe(false);
    expect(versionOutputMatchesPin("tool 12.0.1", "2.0.1")).toBe(false);
  });

  it("rejects prerelease variants of the pinned version", () => {
    expect(versionOutputMatchesPin("gsd 1.7.0-rc.4", "1.7.0")).toBe(false);
  });

  it("rejects unrelated output", () => {
    expect(versionOutputMatchesPin("codex-cli 0.125.0", "0.143.0")).toBe(false);
    expect(versionOutputMatchesPin("", "1.0.0")).toBe(false);
  });
});
