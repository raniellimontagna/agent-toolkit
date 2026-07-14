import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installAgentBrowser } from "../../src/installers/agent-browser.js";
import { installAgentSkillBundle } from "../../src/installers/agent-skills.js";
import { state } from "../../src/state.js";
import type { RunResult } from "../../src/system.js";

const { runMock, captureMock, failedSkills, pinMismatchRepositories } =
  vi.hoisted(() => {
    const fetchedRefs = new Map<string, string>();
    const failedSkills = new Set<string>();
    const pinMismatchRepositories = new Set<string>();
    const runMock = vi.fn((command: string, args: string[] = []): RunResult => {
      if (command === "git" && args[0] === "-C" && args[2] === "fetch") {
        fetchedRefs.set(args[1] ?? "", args.at(-1) ?? "");
      }
      if (command === "npx") {
        const skillIndex = args.indexOf("--skill");
        const skill = skillIndex === -1 ? "" : (args[skillIndex + 1] ?? "");
        if (failedSkills.has(skill)) {
          return { ok: false, status: 1, stdout: "", stderr: "failed" };
        }
      }
      return { ok: true, status: 0, stdout: "", stderr: "" };
    });
    const captureMock = vi.fn(
      (command: string, args: string[] = []): RunResult => {
        let stdout = "";
        if (command === "git" && args[0] === "-C" && args[2] === "rev-parse") {
          const repositoryId = args[1]?.split(/[\\/]/).at(-1) ?? "";
          stdout = pinMismatchRepositories.has(repositoryId)
            ? `${"f".repeat(40)}\n`
            : `${fetchedRefs.get(args[1] ?? "") ?? ""}\n`;
        }
        return { ok: true, status: 0, stdout, stderr: "" };
      },
    );
    return { runMock, captureMock, failedSkills, pinMismatchRepositories };
  });

vi.mock("../../src/system.js", () => ({
  requireCommand: vi.fn(),
  requireNode: vi.fn(),
  run: runMock,
  capture: captureMock,
}));

beforeEach(() => {
  vi.spyOn(fs, "existsSync").mockReturnValue(true);
  vi.spyOn(fs, "statSync").mockReturnValue({
    isDirectory: () => true,
  } as never);
  vi.spyOn(fs, "realpathSync").mockImplementation((value) => value as never);
});

afterEach(() => {
  runMock.mockClear();
  captureMock.mockClear();
  failedSkills.clear();
  pinMismatchRepositories.clear();
  vi.restoreAllMocks();
});

describe("third-party skill installers", () => {
  it("installs the pinned Agent Browser CLI, Chrome and skill", () => {
    expect(installAgentBrowser()).toBe(true);

    const calls = runMock.mock.calls.map(([command, args]) => [command, args]);

    expect(calls).toEqual(
      expect.arrayContaining([
        ["npm", ["install", "--global", "agent-browser@0.31.1"]],
        ["agent-browser", ["install"]],
        [
          "git",
          expect.arrayContaining([
            "clone",
            "https://github.com/vercel-labs/agent-browser.git",
          ]),
        ],
        [
          "git",
          expect.arrayContaining([
            "fetch",
            "afae698a51242166170b6fe4809dd57fe9f75798",
          ]),
        ],
        ["npx", expect.arrayContaining(["--skill", "agent-browser", "--copy"])],
      ]),
    );
  });

  it("clones a shared repository once and installs every Planning Skill", () => {
    const result = installAgentSkillBundle("planning-skills");
    const mattClones = runMock.mock.calls.filter(
      ([command, args]) =>
        command === "git" &&
        args?.includes("clone") &&
        args.includes("https://github.com/mattpocock/skills.git"),
    );

    expect(result.ok).toBe(true);
    expect(result.outcomes).toHaveLength(6);
    expect(result.outcomes.every(({ status }) => status === "installed")).toBe(
      true,
    );
    expect(mattClones).toHaveLength(1);
  });

  it("continues after one skill fails", () => {
    failedSkills.add("grilling");
    const result = installAgentSkillBundle("planning-skills");

    expect(result.ok).toBe(false);
    expect(result.outcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ skill: "grilling", status: "failed" }),
        expect.objectContaining({
          skill: "improve-codebase-architecture",
          status: "installed",
        }),
      ]),
    );
    expect(
      runMock.mock.calls.filter(([command]) => command === "npx"),
    ).toHaveLength(6);
  });

  it("blocks one repository after pin verification fails", () => {
    pinMismatchRepositories.add("mattPocockSkills");
    const result = installAgentSkillBundle("planning-skills");

    expect(result.ok).toBe(false);
    expect(result.outcomes.every(({ status }) => status === "blocked")).toBe(
      true,
    );
    expect(
      runMock.mock.calls.filter(([command]) => command === "npx"),
    ).toHaveLength(0);
  });

  it("continues with independent repositories after one pin failure", () => {
    pinMismatchRepositories.add("impeccable");
    const result = installAgentSkillBundle("frontend-skills");

    expect(result.ok).toBe(false);
    expect(result.outcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          repository: "impeccable",
          status: "blocked",
        }),
        expect.objectContaining({
          repository: "reactDoctor",
          status: "installed",
        }),
      ]),
    );
    expect(
      runMock.mock.calls.filter(([command]) => command === "npx"),
    ).toHaveLength(3);
  });

  it("isolates skill-root resolution failures to their repository", () => {
    vi.restoreAllMocks();
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "agent-toolkit-resolution-test-"),
    );
    for (const repositoryId of [
      "webDesignGuidelines",
      "reactDoctor",
      "remotionBestPractices",
    ]) {
      fs.mkdirSync(path.join(tempDir, repositoryId), { recursive: true });
    }
    vi.spyOn(fs, "mkdtempSync").mockReturnValue(tempDir);

    try {
      let result: ReturnType<typeof installAgentSkillBundle> | undefined;
      expect(() => {
        result = installAgentSkillBundle("frontend-skills");
      }).not.toThrow();

      expect(result?.ok).toBe(false);
      expect(result?.outcomes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            repository: "impeccable",
            status: "failed",
          }),
          expect.objectContaining({
            repository: "reactDoctor",
            status: "installed",
          }),
        ]),
      );
      expect(
        runMock.mock.calls.filter(([command]) => command === "npx"),
      ).toHaveLength(3);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("isolates an escaping skill symlink to its repository", () => {
    vi.restoreAllMocks();
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "agent-toolkit-symlink-test-"),
    );
    const externalSkillDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "agent-toolkit-external-skill-"),
    );
    for (const repositoryId of [
      "impeccable",
      "webDesignGuidelines",
      "reactDoctor",
      "remotionBestPractices",
    ]) {
      fs.mkdirSync(path.join(tempDir, repositoryId), { recursive: true });
    }
    fs.symlinkSync(
      externalSkillDir,
      path.join(tempDir, "impeccable", "skill-link"),
      "dir",
    );

    const entry = state.agentSkillsCatalog.bundles["frontend-skills"].skills[0];
    if (!entry) throw new Error("Missing Impeccable catalog entry.");
    const originalPath = entry.path;
    entry.path = "skill-link";
    vi.spyOn(fs, "mkdtempSync").mockReturnValue(tempDir);

    try {
      const result = installAgentSkillBundle("frontend-skills");

      expect(result.ok).toBe(false);
      expect(result.outcomes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            repository: "impeccable",
            status: "failed",
          }),
          expect.objectContaining({
            repository: "reactDoctor",
            status: "installed",
          }),
        ]),
      );
      expect(
        runMock.mock.calls.filter(([command]) => command === "npx"),
      ).toHaveLength(3);
      expect(fs.existsSync(externalSkillDir)).toBe(true);
    } finally {
      if (originalPath === undefined) delete entry.path;
      else entry.path = originalPath;
      fs.rmSync(tempDir, { recursive: true, force: true });
      fs.rmSync(externalSkillDir, { recursive: true, force: true });
    }
  });
});
