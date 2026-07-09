import { describe, expect, it } from "vitest";
import { isInsecureRedirect, windowsSpawnPlan } from "../../src/system.js";

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

describe("windowsSpawnPlan", () => {
  it("routes cmd shims through cmd.exe with an escaped command line", () => {
    const plan = windowsSpawnPlan(
      "npx",
      ["-y", "@opengsd/gsd-core@1.6.1", "--global"],
      () => "C:\\nodejs\\npx.CMD",
    );

    expect(plan.command.toLowerCase()).toContain("cmd");
    expect(plan.verbatim).toBe(true);
    expect(plan.args.slice(0, 3)).toEqual(["/d", "/s", "/c"]);
    expect(plan.args[3]).toBe(
      '""C:\\nodejs\\npx.CMD" "-y" "@opengsd/gsd-core@1.6.1" "--global""',
    );
  });

  it("escapes quotes and trailing backslashes in arguments", () => {
    const plan = windowsSpawnPlan(
      "npm.cmd",
      ['say "hi"', "C:\\path with space\\"],
      () => null,
    );

    expect(plan.args[3]).toBe(
      '""npm.cmd" "say \\"hi\\"" "C:\\path with space\\\\""',
    );
  });

  it("leaves executables untouched", () => {
    const plan = windowsSpawnPlan("git", ["status"], () => "C:\\git\\git.EXE");

    expect(plan).toEqual({
      command: "git",
      args: ["status"],
      verbatim: false,
    });
  });

  it("leaves unresolved commands untouched", () => {
    const plan = windowsSpawnPlan("missing-tool", ["--version"], () => null);

    expect(plan).toEqual({
      command: "missing-tool",
      args: ["--version"],
      verbatim: false,
    });
  });
});
