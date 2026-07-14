import path from "node:path";
import type { InstallScope, RuntimeName } from "./state.js";

export type SkillTargetContext = {
  scope: InstallScope;
  cwd: string;
  home: string;
  env: NodeJS.ProcessEnv;
};

export function canonicalPathsEqual(left: string, right: string): boolean {
  return path.normalize(left) === path.normalize(right);
}

function opencodeConfigDir(context: SkillTargetContext): string {
  if (context.env.OPENCODE_CONFIG_DIR) return context.env.OPENCODE_CONFIG_DIR;
  if (context.env.OPENCODE_CONFIG)
    return path.dirname(context.env.OPENCODE_CONFIG);
  if (context.env.XDG_CONFIG_HOME)
    return path.join(context.env.XDG_CONFIG_HOME, "opencode");
  return path.join(context.home, ".config", "opencode");
}

export function resolveSkillTargetDirs(
  runtime: RuntimeName,
  context: SkillTargetContext,
): string[] {
  if (context.scope === "local") {
    const runtimeDir = runtime === "antigravity" ? ".agents" : `.${runtime}`;
    return [path.join(context.cwd, runtimeDir, "skills")];
  }

  switch (runtime) {
    case "claude":
      return [
        path.join(
          context.env.CLAUDE_CONFIG_DIR || path.join(context.home, ".claude"),
          "skills",
        ),
      ];
    case "codex":
      return [
        path.join(
          context.env.CODEX_HOME || path.join(context.home, ".codex"),
          "skills",
        ),
      ];
    case "opencode":
      return [path.join(opencodeConfigDir(context), "skills")];
    case "gemini":
      return [
        path.join(
          context.env.GEMINI_CONFIG_DIR || path.join(context.home, ".gemini"),
          "skills",
        ),
      ];
    case "antigravity": {
      const roots = [
        context.env.ANTIGRAVITY_SKILLS_DIR ||
          path.join(context.home, ".gemini", "antigravity-cli", "skills"),
        context.env.ANTIGRAVITY_LEGACY_SKILLS_DIR ||
          path.join(context.home, ".agents", "skills"),
      ];
      return roots.filter((root, index) => roots.indexOf(root) === index);
    }
  }
}
