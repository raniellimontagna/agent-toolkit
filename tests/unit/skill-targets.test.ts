import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  canonicalPathsEqual,
  resolveSkillTargetDirs,
} from "../../src/skill-targets.js";

const cwd = path.resolve("/work/project");
const home = path.resolve("/home/user");

describe("skill target resolution", () => {
  it("compares canonical paths with exact case on every platform", () => {
    expect(canonicalPathsEqual("/Canonical/Skills", "/canonical/Skills")).toBe(
      false,
    );
    expect(
      canonicalPathsEqual("C:\\Canonical\\Skills", "c:\\Canonical\\Skills"),
    ).toBe(false);
  });

  it.each([
    ["claude", ".claude"],
    ["codex", ".codex"],
    ["opencode", ".opencode"],
    ["gemini", ".gemini"],
  ] as const)("resolves the local %s root under cwd", (runtime, directory) => {
    expect(
      resolveSkillTargetDirs(runtime, { scope: "local", cwd, home, env: {} }),
    ).toEqual([path.join(cwd, directory, "skills")]);
  });

  it("resolves the local Antigravity root under .agents", () => {
    expect(
      resolveSkillTargetDirs("antigravity", {
        scope: "local",
        cwd,
        home,
        env: {},
      }),
    ).toEqual([path.join(cwd, ".agents", "skills")]);
  });

  it("resolves default global roots for every runtime", () => {
    expect(
      Object.fromEntries(
        (["claude", "codex", "opencode", "gemini", "antigravity"] as const).map(
          (runtime) => [
            runtime,
            resolveSkillTargetDirs(runtime, {
              scope: "global",
              cwd,
              home,
              env: {},
            }),
          ],
        ),
      ),
    ).toEqual({
      claude: [path.join(home, ".claude", "skills")],
      codex: [path.join(home, ".codex", "skills")],
      opencode: [path.join(home, ".config", "opencode", "skills")],
      gemini: [path.join(home, ".gemini", "skills")],
      antigravity: [
        path.join(home, ".gemini", "antigravity-cli", "skills"),
        path.join(home, ".agents", "skills"),
      ],
    });
  });

  it("honors global runtime-specific overrides", () => {
    const env = {
      CLAUDE_CONFIG_DIR: path.join(home, "claude-config"),
      CODEX_HOME: path.join(home, "codex-home"),
      GEMINI_CONFIG_DIR: path.join(home, "gemini-config"),
      ANTIGRAVITY_SKILLS_DIR: path.join(home, "agy-official"),
      ANTIGRAVITY_LEGACY_SKILLS_DIR: path.join(home, "agy-legacy"),
    };

    expect(
      resolveSkillTargetDirs("claude", { scope: "global", cwd, home, env }),
    ).toEqual([path.join(env.CLAUDE_CONFIG_DIR, "skills")]);
    expect(
      resolveSkillTargetDirs("codex", { scope: "global", cwd, home, env }),
    ).toEqual([path.join(env.CODEX_HOME, "skills")]);
    expect(
      resolveSkillTargetDirs("gemini", { scope: "global", cwd, home, env }),
    ).toEqual([path.join(env.GEMINI_CONFIG_DIR, "skills")]);
    expect(
      resolveSkillTargetDirs("antigravity", {
        scope: "global",
        cwd,
        home,
        env,
      }),
    ).toEqual([env.ANTIGRAVITY_SKILLS_DIR, env.ANTIGRAVITY_LEGACY_SKILLS_DIR]);
  });

  it("preserves OpenCode override precedence", () => {
    const configDir = path.join(home, "opencode-dir");
    const configFile = path.join(home, "opencode-file", "config.json");
    const xdg = path.join(home, "xdg");

    expect(
      resolveSkillTargetDirs("opencode", {
        scope: "global",
        cwd,
        home,
        env: {
          OPENCODE_CONFIG_DIR: configDir,
          OPENCODE_CONFIG: configFile,
          XDG_CONFIG_HOME: xdg,
        },
      }),
    ).toEqual([path.join(configDir, "skills")]);
    expect(
      resolveSkillTargetDirs("opencode", {
        scope: "global",
        cwd,
        home,
        env: { OPENCODE_CONFIG: configFile, XDG_CONFIG_HOME: xdg },
      }),
    ).toEqual([path.join(path.dirname(configFile), "skills")]);
    expect(
      resolveSkillTargetDirs("opencode", {
        scope: "global",
        cwd,
        home,
        env: { XDG_CONFIG_HOME: xdg },
      }),
    ).toEqual([path.join(xdg, "opencode", "skills")]);
  });

  it("deduplicates equal Antigravity roots", () => {
    const shared = path.join(home, "shared-skills");

    expect(
      resolveSkillTargetDirs("antigravity", {
        scope: "global",
        cwd,
        home,
        env: {
          ANTIGRAVITY_SKILLS_DIR: shared,
          ANTIGRAVITY_LEGACY_SKILLS_DIR: shared,
        },
      }),
    ).toEqual([shared]);
  });
});
