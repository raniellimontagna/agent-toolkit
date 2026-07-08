import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runClackMenu } from "../../src/menu.js";
import { runtimeNames, state, toolNames } from "../../src/state.js";

type ClackFake = Parameters<typeof runClackMenu>[0];
type StatusClackFake = ClackFake & {
  note: (message: string, title?: string) => void;
};

let tempDir: string;
let originalCustomSkillsDir: string;
let originalSkillScopes: string[];
let originalSkillPackages: string[];
let originalSkillPaths: string[];
let originalInstallMissingClis: boolean;
let originalGsdScope: typeof state.gsdScope;
let originalTools: typeof state.tools;
let originalRuntimes: typeof state.runtimes;

function writeSkill(relativeDir: string): void {
  const skillDir = path.join(tempDir, relativeDir);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "SKILL.md"),
    `---
name: ${path.basename(relativeDir)}
description: Test skill.
---

# Test Skill
`,
  );
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-toolkit-menu-"));
  originalCustomSkillsDir = state.customSkillsDir;
  originalSkillScopes = [...state.skillScopes];
  originalSkillPackages = [...state.skillPackages];
  originalSkillPaths = [...state.skillPaths];
  originalInstallMissingClis = state.installMissingClis;
  originalGsdScope = state.gsdScope;
  originalTools = { ...state.tools };
  originalRuntimes = { ...state.runtimes };

  state.customSkillsDir = tempDir;
  state.skillScopes = [];
  state.skillPackages = [];
  state.skillPaths = [];
  state.installMissingClis = false;
  state.gsdScope = "global";
  for (const tool of toolNames) state.tools[tool] = true;
  for (const runtime of runtimeNames) state.runtimes[runtime] = true;
});

afterEach(() => {
  state.customSkillsDir = originalCustomSkillsDir;
  state.skillScopes = originalSkillScopes;
  state.skillPackages = originalSkillPackages;
  state.skillPaths = originalSkillPaths;
  state.installMissingClis = originalInstallMissingClis;
  state.gsdScope = originalGsdScope;
  state.tools = originalTools;
  state.runtimes = originalRuntimes;
  fs.rmSync(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("clack menu", { timeout: 20_000 }, () => {
  it("applies visual prompt selections to installer state", async () => {
    writeSkill("backend/node/fastify-patterns");
    writeSkill("backend/node/express-patterns");
    writeSkill("frontend/react/react-patterns");
    const clack: ClackFake = {
      intro: vi.fn(),
      outro: vi.fn(),
      cancel: vi.fn(),
      isCancel: vi.fn(() => false),
      multiselect: vi
        .fn()
        .mockResolvedValueOnce(["rtk", "skills"])
        .mockResolvedValueOnce(["codex"])
        .mockResolvedValueOnce(["backend"])
        .mockResolvedValueOnce(["backend/node/fastify-patterns"]),
      select: vi.fn().mockResolvedValue("local"),
      confirm: vi.fn().mockResolvedValue(true),
    };

    await runClackMenu(clack);

    expect(state.tools).toEqual({
      rtk: true,
      caveman: false,
      superpowers: false,
      graphify: false,
      gsd: false,
      improve: false,
      "frontend-skills": false,
      skills: true,
    });
    expect(state.runtimes).toEqual({
      claude: false,
      codex: true,
      opencode: false,
      gemini: false,
      antigravity: false,
    });
    expect(state.gsdScope).toBe("local");
    expect(state.installMissingClis).toBe(true);
    expect(state.skillPackages).toEqual(["backend"]);
    expect(state.skillScopes).toEqual([]);
    expect(state.skillPaths).toEqual(["backend/node/fastify-patterns"]);
    expect(clack.outro).toHaveBeenCalledWith("Ready to install.");
  });

  it("shows detected status and asks for confirmation before installing", async () => {
    writeSkill("core/agent-toolkit-maintainer");
    const note = vi.fn<(message: string, title?: string) => void>();
    const clack: StatusClackFake = {
      intro: vi.fn(),
      outro: vi.fn(),
      cancel: vi.fn(),
      isCancel: vi.fn(() => false),
      note,
      multiselect: vi
        .fn()
        .mockResolvedValueOnce(["rtk", "skills"])
        .mockResolvedValueOnce(["codex"])
        .mockResolvedValueOnce(["all"])
        .mockResolvedValueOnce(["all"])
        .mockResolvedValueOnce(["all"]),
      select: vi.fn().mockResolvedValue("global"),
      confirm: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true),
    };

    await runClackMenu(clack);

    expect(note).toHaveBeenCalledWith(
      expect.stringContaining("Codex CLI"),
      "Detected status",
    );
    expect(note).toHaveBeenCalledWith(
      expect.stringContaining("Custom Skills"),
      "Install plan",
    );
    expect(clack.confirm).toHaveBeenLastCalledWith({
      message: "Continue with installation?",
      initialValue: true,
    });
    expect(clack.confirm).toHaveBeenCalledTimes(2);
  });

  it("does not ask for scopes or individual skills after all skill packages are selected", async () => {
    writeSkill("backend/node/fastify-patterns");
    writeSkill("frontend/react/react-patterns");
    const clack: ClackFake = {
      intro: vi.fn(),
      outro: vi.fn(),
      cancel: vi.fn(),
      isCancel: vi.fn(() => false),
      multiselect: vi
        .fn()
        .mockResolvedValueOnce(["skills"])
        .mockResolvedValueOnce(["codex"])
        .mockResolvedValueOnce(["all"]),
      select: vi.fn().mockResolvedValue("local"),
      confirm: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true),
    };

    await runClackMenu(clack);

    expect(state.skillPackages).toEqual([]);
    expect(state.skillScopes).toEqual([]);
    expect(state.skillPaths).toEqual([]);
    expect(clack.multiselect).toHaveBeenCalledTimes(3);
    expect(clack.multiselect).not.toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Select Custom Skill scopes",
      }),
    );
    expect(clack.multiselect).not.toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Select individual Custom Skills",
      }),
    );
  });

  it("uses one integrated Custom Skills refinement prompt after package selection", async () => {
    writeSkill("backend/node/fastify-patterns");
    writeSkill("backend/python/python-patterns");
    writeSkill("backend/python/python-testing");
    const clack: ClackFake = {
      intro: vi.fn(),
      outro: vi.fn(),
      cancel: vi.fn(),
      isCancel: vi.fn(() => false),
      multiselect: vi
        .fn()
        .mockResolvedValueOnce(["skills"])
        .mockResolvedValueOnce(["codex"])
        .mockResolvedValueOnce(["backend"])
        .mockResolvedValueOnce(["backend/python"]),
      select: vi.fn().mockResolvedValue("local"),
      confirm: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true),
    };

    await runClackMenu(clack);

    expect(state.skillPackages).toEqual(["backend"]);
    expect(state.skillScopes).toEqual([]);
    expect(state.skillPaths).toEqual([
      "backend/python/python-patterns",
      "backend/python/python-testing",
    ]);
    expect(clack.multiselect).toHaveBeenCalledTimes(4);
    expect(clack.multiselect).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Select Custom Skills",
        options: expect.arrayContaining([
          expect.objectContaining({
            value: "backend/python",
            hint: "group",
          }),
          expect.objectContaining({
            value: "backend/python/python-testing",
            hint: "individual",
          }),
        ]),
      }),
    );
    expect(clack.multiselect).not.toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Select individual Custom Skills",
      }),
    );
  });

  it("does not ask for Custom Skills refinements when a selected package has one skill", async () => {
    writeSkill("devops/docker-patterns");
    const clack: ClackFake = {
      intro: vi.fn(),
      outro: vi.fn(),
      cancel: vi.fn(),
      isCancel: vi.fn(() => false),
      multiselect: vi
        .fn()
        .mockResolvedValueOnce(["skills"])
        .mockResolvedValueOnce(["codex"])
        .mockResolvedValueOnce(["devops"]),
      select: vi.fn().mockResolvedValue("local"),
      confirm: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true),
    };

    await runClackMenu(clack);

    expect(state.skillPackages).toEqual(["devops"]);
    expect(state.skillScopes).toEqual([]);
    expect(state.skillPaths).toEqual([]);
    expect(clack.multiselect).toHaveBeenCalledTimes(3);
    expect(clack.multiselect).not.toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Select Custom Skills",
      }),
    );
  });
});
