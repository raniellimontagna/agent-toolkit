import { afterEach, describe, expect, it, vi } from "vitest";
import { installFrontendSkills } from "../../src/installers/frontend-skills.js";
import { installImprove } from "../../src/installers/improve.js";
import type { RunResult } from "../../src/system.js";

const { runMock } = vi.hoisted(() => ({
  runMock: vi.fn(
    (_command: string, _args: string[] = []): RunResult => ({
      ok: true,
      status: 0,
      stdout: "",
      stderr: "",
    }),
  ),
}));

vi.mock("../../src/system.js", () => ({
  requireCommand: vi.fn(),
  requireNode: vi.fn(),
  run: runMock,
}));

afterEach(() => {
  runMock.mockClear();
});

describe("third-party skill installers", () => {
  it("clones and installs the pinned shadcn Improve skill", () => {
    expect(installImprove()).toBe(true);

    const calls = runMock.mock.calls.map(([command, args]) => [command, args]);

    expect(calls).toEqual(
      expect.arrayContaining([
        [
          "git",
          expect.arrayContaining([
            "clone",
            "--filter=blob:none",
            "--no-checkout",
            "https://github.com/shadcn/improve.git",
          ]),
        ],
        [
          "git",
          expect.arrayContaining([
            "fetch",
            "--depth",
            "1",
            "origin",
            "03369ee6d7cafbfcecc4346539b05b3dc0a603bb",
          ]),
        ],
        [
          "npx",
          expect.arrayContaining([
            "-y",
            "skills@1.5.13",
            "add",
            "--skill",
            "improve",
            "--copy",
          ]),
        ],
      ]),
    );
  });

  it("clones and installs each pinned external frontend skill", () => {
    expect(installFrontendSkills()).toBe(true);

    const cloneUrls = runMock.mock.calls
      .filter(([command, args]) => command === "git" && args?.includes("clone"))
      .map(([, args]) => args?.filter((value) => value.endsWith(".git")));
    const npxCalls = runMock.mock.calls.filter(
      ([command]) => command === "npx",
    );

    expect(cloneUrls.flat()).toEqual([
      "https://github.com/pbakaus/impeccable.git",
      "https://github.com/Leonxlnx/taste-skill.git",
      "https://github.com/millionco/react-doctor.git",
    ]);
    expect(npxCalls).toHaveLength(3);
    expect(npxCalls[0]?.[1]).toEqual(
      expect.arrayContaining(["--skill", "impeccable", "--copy"]),
    );
    expect(npxCalls[1]?.[1]).toEqual(
      expect.arrayContaining(["--skill", "design-taste-frontend", "--copy"]),
    );
    expect(npxCalls[2]?.[1]).toEqual(
      expect.arrayContaining(["--skill", "react-doctor", "--copy"]),
    );
  });
});
