import path from "node:path";
import { HOME, REPO_ROOT } from "./context.js";

export const toolNames = [
  "rtk",
  "caveman",
  "superpowers",
  "graphify",
  "gsd",
  "skills",
] as const;

export type ToolName = (typeof toolNames)[number];

export const runtimeNames = ["claude", "codex", "opencode", "gemini"] as const;

export type RuntimeName = (typeof runtimeNames)[number];
export type InstallScope = "global" | "local";

type RuntimeMeta = {
  command: string;
  label: string;
  display: string;
};

type State = {
  rtkInstallDir: string;
  rtkGithub: string;
  cavemanPackage: string;
  cavemanMode: string;
  graphifyPackage: string;
  graphifyInstaller: string;
  gsdPackage: string;
  gsdScope: InstallScope;
  customSkillsDir: string;
  skillScopes: string[];
  listSkills: boolean;
  cliPackages: Record<RuntimeName, string>;
  tools: Record<ToolName, boolean>;
  runtimes: Record<RuntimeName, boolean>;
  nonInteractive: boolean;
  installMissingClis: boolean;
};

function envInstallScope(value: string | undefined): InstallScope {
  return value === "local" ? "local" : "global";
}

export function isToolName(value: string): value is ToolName {
  return (toolNames as readonly string[]).includes(value);
}

export function isRuntimeName(value: string): value is RuntimeName {
  return (runtimeNames as readonly string[]).includes(value);
}

export function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function normalizeScope(scope: string): string {
  return scope
    .trim()
    .toLowerCase()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");
}

export const state: State = {
  rtkInstallDir:
    process.env.RTK_INSTALL_DIR || path.join(HOME, ".local", "bin"),
  rtkGithub:
    process.env.RTK_GITHUB ||
    "https://api.github.com/repos/rtk-ai/rtk/releases/latest",
  cavemanPackage: process.env.CAVEMAN_PACKAGE || "github:JuliusBrussee/caveman",
  cavemanMode: process.env.CAVEMAN_MODE || "minimal",
  graphifyPackage: process.env.GRAPHIFY_PACKAGE || "graphifyy",
  graphifyInstaller: process.env.GRAPHIFY_INSTALLER || "uv",
  gsdPackage: process.env.GSD_PACKAGE || "get-shit-done-cc@latest",
  gsdScope: envInstallScope(process.env.GSD_SCOPE),
  customSkillsDir:
    process.env.CUSTOM_SKILLS_DIR || path.join(REPO_ROOT, "skills"),
  skillScopes: splitList(process.env.SKILLS_SCOPE || ""),
  listSkills: false,
  cliPackages: {
    claude: process.env.CLAUDE_CLI_PACKAGE || "@anthropic-ai/claude-code",
    codex: process.env.CODEX_CLI_PACKAGE || "@openai/codex",
    opencode: process.env.OPENCODE_CLI_PACKAGE || "opencode-ai",
    gemini: process.env.GEMINI_CLI_PACKAGE || "@google/gemini-cli",
  },
  tools: {
    rtk: true,
    caveman: true,
    superpowers: true,
    graphify: true,
    gsd: true,
    skills: true,
  },
  runtimes: {
    claude: true,
    codex: true,
    opencode: true,
    gemini: true,
  },
  nonInteractive: false,
  installMissingClis: false,
};

export const runtimeMeta: Record<RuntimeName, RuntimeMeta> = {
  claude: {
    command: "claude",
    label: "Claude Code CLI",
    display: "Claude Code",
  },
  codex: { command: "codex", label: "Codex CLI", display: "Codex CLI" },
  opencode: { command: "opencode", label: "OpenCode CLI", display: "OpenCode" },
  gemini: { command: "gemini", label: "Gemini CLI", display: "Gemini CLI" },
};

export function setAllTools(value: boolean): void {
  for (const key of toolNames) state.tools[key] = value;
}

export function selectOnlyTool(tool: ToolName): void {
  setAllTools(false);
  state.tools[tool] = true;
}

export function setAllRuntimes(value: boolean): void {
  for (const key of runtimeNames) state.runtimes[key] = value;
}

export function selectOnlyRuntime(runtime: RuntimeName): void {
  setAllRuntimes(false);
  state.runtimes[runtime] = true;
}

export function anyToolSelected(): boolean {
  return Object.values(state.tools).some(Boolean);
}

export function anyRuntimeSelected(): boolean {
  return Object.values(state.runtimes).some(Boolean);
}

export function normalizedSkillScopes(): string[] {
  return state.skillScopes.map(normalizeScope).filter(Boolean);
}
