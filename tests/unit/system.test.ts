import { describe, expect, it } from "vitest";
import { isInsecureRedirect } from "../../src/system.js";

describe("isInsecureRedirect", () => {
  it("flags https to http downgrades", () => {
    expect(
      isInsecureRedirect(
        "https://api.github.com/releases",
        "http://attacker.example/payload",
      ),
    ).toBe(true);
  });

  it("allows https to https redirects", () => {
    expect(
      isInsecureRedirect(
        "https://api.github.com/releases",
        "https://objects.githubusercontent.com/asset",
      ),
    ).toBe(false);
  });

  it("allows redirects that start from http", () => {
    expect(
      isInsecureRedirect(
        "http://internal.example",
        "http://internal.example/next",
      ),
    ).toBe(false);
  });
});
