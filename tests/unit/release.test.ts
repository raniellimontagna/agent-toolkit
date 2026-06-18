import { describe, expect, it } from "vitest";
import { bumpVersion, updateReadmeReleaseTag } from "../../src/release.js";

describe("release helpers", () => {
  it("bumps semantic versions by release kind", () => {
    expect(bumpVersion("0.1.17", "patch")).toBe("0.1.18");
    expect(bumpVersion("0.1.17", "minor")).toBe("0.2.0");
    expect(bumpVersion("0.1.17", "major")).toBe("1.0.0");
  });

  it("updates README release tag examples", () => {
    const readme = [
      "Release:",
      "```bash",
      "git tag v0.1.17",
      "git push origin v0.1.17",
      "```",
    ].join("\n");

    expect(updateReadmeReleaseTag(readme, "0.1.18")).toContain(
      "git tag v0.1.18\ngit push origin v0.1.18",
    );
  });
});
