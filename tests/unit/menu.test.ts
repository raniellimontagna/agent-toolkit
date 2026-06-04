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
  originalInstallMissingClis = state.installMissingClis;
  originalGsdScope = state.gsdScope;
  originalTools = { ...state.tools };
  originalRuntimes = { ...state.runtimes };

  state.customSkillsDir = tempDir;
  state.skillScopes = [];
  state.skillPackages = [];
  state.installMissingClis = false;
  state.gsdScope = "global";
  for (const tool of toolNames) state.tools[tool] = true;
  for (const runtime of runtimeNames) state.runtimes[runtime] = true;
});

afterEach(() => {
  state.customSkillsDir = originalCustomSkillsDir;
  state.skillScopes = originalSkillScopes;
  state.skillPackages = originalSkillPackages;
  state.installMissingClis = originalInstallMissingClis;
  state.gsdScope = originalGsdScope;
  state.tools = originalTools;
  state.runtimes = originalRuntimes;
  fs.rmSync(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("clack menu", () => {
  it("applies visual prompt selections to installer state", async () => {
    writeSkill("backend/node/fastify-patterns");
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
        .mockResolvedValueOnce(["backend/node"]),
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
      "frontend-skills": false,
      skills: true,
    });
    expect(state.runtimes).toEqual({
      claude: false,
      codex: true,
      opencode: false,
      gemini: false,
    });
    expect(state.gsdScope).toBe("local");
    expect(state.installMissingClis).toBe(true);
    expect(state.skillPackages).toEqual(["backend"]);
    expect(state.skillScopes).toEqual(["backend/node"]);
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
});
