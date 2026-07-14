import path from "node:path";
import { HOME, REPO_ROOT } from "./context.js";
import {
  formatGithubPackageSpec,
  formatNpmPackageSpec,
  formatPythonPackageSpec,
  githubReleaseApiUrl,
  loadToolLock,
  type ToolLock,
} from "./tool-lock.js";

export const toolNames = [
  "rtk",
  "caveman",
  "superpowers",
  "graphify",
  "gsd",
  "improve",
  "agent-browser",
  "frontend-skills",
  "planning-skills",
  "skills",
] as const;

export type ToolName = (typeof toolNames)[number];

export const runtimeNames = [
  "claude",
  "codex",
  "opencode",
  "gemini",
  "antigravity",
] as const;

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
  rtkAssetChecksums: Record<string, string>;
  cavemanPackage: string;
  cavemanMode: string;
  graphifyPackage: string;
  graphifyInstaller: string;
  gsdPackage: string;
  agentBrowserPackage: string;
  agentSkillsCliPackage: string;
  agentSkillsCatalog: ToolLock["tools"]["agentSkills"];
  gsdScope: InstallScope;
  customSkillsDir: string;
  skillPackages: string[];
  skillScopes: string[];
  skillPaths: string[];
  listSkills: boolean;
  cliPackages: Partial<Record<RuntimeName, string>>;
  tools: Record<ToolName, boolean>;
  runtimes: Record<RuntimeName, boolean>;
  nonInteractive: boolean;
  dryRun: boolean;
  doctor: boolean;
  jsonOutput: boolean;
  uninstall: boolean;
  repair: boolean;
  updateLock: boolean;
  auditSkills: boolean;
  installMissingClis: boolean;
  allowMutableSources: boolean;
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

const toolLock = loadToolLock();

export const state: State = {
  rtkInstallDir:
    process.env.RTK_INSTALL_DIR || path.join(HOME, ".local", "bin"),
  rtkGithub:
    process.env.RTK_GITHUB ||
    githubReleaseApiUrl(toolLock.tools.rtk.repository, toolLock.tools.rtk.tag),
  rtkAssetChecksums: Object.fromEntries(
    Object.entries(toolLock.tools.rtk.assets).map(([assetName, asset]) => [
      assetName,
      asset.sha256,
    ]),
  ),
  cavemanPackage:
    process.env.CAVEMAN_PACKAGE ||
    formatGithubPackageSpec(
      toolLock.tools.caveman.repository,
      toolLock.tools.caveman.ref,
    ),
  cavemanMode: process.env.CAVEMAN_MODE || "minimal",
  graphifyPackage:
    process.env.GRAPHIFY_PACKAGE ||
    formatPythonPackageSpec(
      toolLock.tools.graphify.package,
      toolLock.tools.graphify.version,
    ),
  graphifyInstaller: process.env.GRAPHIFY_INSTALLER || "uv",
  gsdPackage:
    process.env.GSD_PACKAGE ||
    formatNpmPackageSpec(
      toolLock.tools.gsd.package,
      toolLock.tools.gsd.version,
    ),
  agentBrowserPackage:
    process.env.AGENT_BROWSER_PACKAGE ||
    formatNpmPackageSpec(
      toolLock.tools.agentBrowser.package,
      toolLock.tools.agentBrowser.version,
    ),
  agentSkillsCliPackage:
    process.env.SKILLS_CLI_PACKAGE ||
    formatNpmPackageSpec(
      toolLock.tools.agentSkills.skillsCli.package,
      toolLock.tools.agentSkills.skillsCli.version,
    ),
  agentSkillsCatalog: toolLock.tools.agentSkills,
  gsdScope: envInstallScope(process.env.GSD_SCOPE),
  customSkillsDir:
    process.env.CUSTOM_SKILLS_DIR || path.join(REPO_ROOT, "skills"),
  skillPackages: splitList(
    process.env.SKILLS_PACKAGE || process.env.SKILLS_PACKAGES || "",
  ),
  skillScopes: splitList(process.env.SKILLS_SCOPE || ""),
  skillPaths: splitList(
    process.env.SKILLS_PATH || process.env.SKILLS_PATHS || "",
  ),
  listSkills: false,
  cliPackages: {
    claude:
      process.env.CLAUDE_CLI_PACKAGE ||
      formatNpmPackageSpec(
        toolLock.runtimeClis.claude.package,
        toolLock.runtimeClis.claude.version,
      ),
    codex:
      process.env.CODEX_CLI_PACKAGE ||
      formatNpmPackageSpec(
        toolLock.runtimeClis.codex.package,
        toolLock.runtimeClis.codex.version,
      ),
    opencode:
      process.env.OPENCODE_CLI_PACKAGE ||
      formatNpmPackageSpec(
        toolLock.runtimeClis.opencode.package,
        toolLock.runtimeClis.opencode.version,
      ),
    gemini:
      process.env.GEMINI_CLI_PACKAGE ||
      formatNpmPackageSpec(
        toolLock.runtimeClis.gemini.package,
        toolLock.runtimeClis.gemini.version,
      ),
  },
  tools: {
    rtk: true,
    caveman: true,
    superpowers: true,
    graphify: true,
    gsd: true,
    improve: true,
    "agent-browser": false,
    "frontend-skills": true,
    "planning-skills": true,
    skills: true,
  },
  runtimes: {
    claude: true,
    codex: true,
    opencode: true,
    gemini: true,
    antigravity: true,
  },
  nonInteractive: false,
  dryRun: false,
  doctor: false,
  jsonOutput: false,
  uninstall: false,
  repair: false,
  updateLock: false,
  auditSkills: false,
  installMissingClis: false,
  allowMutableSources: process.env.ALLOW_MUTABLE_SOURCES === "1",
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
  antigravity: {
    command: "agy",
    label: "Antigravity CLI",
    display: "Antigravity",
  },
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

export function normalizedSkillPaths(): string[] {
  const paths = state.skillPaths
    .map(normalizeScope)
    .filter((value) => value && value !== "all");
  return [...new Set(paths)];
}

export function normalizedSkillPackages(): string[] {
  const packages = state.skillPackages
    .map(normalizeScope)
    .filter((value) => value && value !== "all");
  return [...new Set(packages)];
}
