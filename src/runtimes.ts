import { color, die, err, info, ok, step, warn } from "./logger.js";
import { normalizeAntigravityInstallUrl } from "./provenance.js";
import { type RuntimeName, runtimeMeta, runtimeNames, state } from "./state.js";
import {
  capture,
  commandExists,
  findCommand,
  requireCommand,
  requireNode,
  run,
} from "./system.js";
import { agentSkillBundleIds } from "./tool-lock.js";

export function runtimeCommand(runtime: RuntimeName): string {
  return runtimeMeta[runtime].command;
}

export function runtimeLabel(runtime: RuntimeName): string {
  return runtimeMeta[runtime].label;
}

const cavemanRuntimeNames: RuntimeName[] = [
  "claude",
  "codex",
  "opencode",
  "gemini",
];

const gsdRuntimeNames: RuntimeName[] = [
  "claude",
  "codex",
  "opencode",
  "gemini",
];

export function selectedCavemanArgs(): string[] {
  const args: string[] = [];
  for (const runtime of cavemanRuntimeNames) {
    if (state.runtimes[runtime]) args.push("--only", runtime);
  }
  if (state.cavemanMode !== "all") args.push("--minimal");
  args.push("--non-interactive");
  return args;
}

export function hasSelectedCavemanRuntime(): boolean {
  return cavemanRuntimeNames.some((runtime) => state.runtimes[runtime]);
}

export function selectedGsdArgs(): string[] {
  const args = [state.gsdScope === "local" ? "--local" : "--global"];
  for (const runtime of gsdRuntimeNames) {
    if (state.runtimes[runtime]) args.push(`--${runtime}`);
  }
  return args;
}

export function hasSelectedGsdRuntime(): boolean {
  return gsdRuntimeNames.some((runtime) => state.runtimes[runtime]);
}

const skillsAgentNames: Record<RuntimeName, string> = {
  claude: "claude-code",
  codex: "codex",
  opencode: "opencode",
  gemini: "gemini-cli",
  antigravity: "antigravity",
};

export function selectedSkillsAgentArgs(): string[] {
  const args: string[] = [];
  for (const runtime of runtimeNames) {
    if (state.runtimes[runtime])
      args.push("--agent", skillsAgentNames[runtime]);
  }
  return args;
}

function installRuntimeCli(runtime: RuntimeName): boolean {
  if (runtime === "antigravity") return installAntigravityCli();

  const label = runtimeLabel(runtime);
  const command = runtimeCommand(runtime);
  const packageName = state.cliPackages[runtime];
  if (!packageName) {
    warn(
      `${label} does not have an npm package install path in Agent Toolkit yet.`,
    );
    return false;
  }

  requireNode(24);
  requireCommand("npm");

  info(`Installing ${label} via npm package ${packageName}...`);
  const result = capture("npm", ["install", "-g", packageName]);
  if (!result.ok) {
    const output = `${result.stdout}\n${result.stderr}`;
    if (/EACCES|permission denied/i.test(output)) {
      err(
        `${label} install failed: npm does not have permission to write to its global directory.`,
      );
      console.log(
        "     This is common when Node.js was installed via Homebrew (or the system) without a version manager.",
      );
      console.log("     Fix: use a Node version manager, for example:");
      console.log(
        `     ${color.cyan}brew install fnm && fnm install --lts${color.reset}`,
      );
      console.log(
        "     Or keep the current Node install and redirect npm's global prefix:",
      );
      console.log(
        `     ${color.cyan}npm config set prefix ~/.npm-global && export PATH="$HOME/.npm-global/bin:$PATH"${color.reset}`,
      );
      console.log(
        "     See: https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally",
      );
    } else {
      err(`${label} install failed.`);
      const detail = result.stderr.trim() || result.stdout.trim();
      if (detail) {
        for (const line of detail.split("\n").slice(-5)) {
          console.log(`     ${line}`);
        }
      }
    }
    return false;
  }

  if (commandExists(command)) {
    ok(`${label} installed`);
    return true;
  }

  err(`${label} package installed, but '${command}' is still not on PATH.`);
  return false;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

type AntigravityInstallPlan = {
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
};

const ANTIGRAVITY_POWERSHELL_PROGRAM =
  "& ([scriptblock]::Create((Invoke-RestMethod -Uri $env:AGENT_TOOLKIT_ANTIGRAVITY_INSTALL_URL)))";
const ANTIGRAVITY_SOURCE_ENV_KEY = "ANTIGRAVITY_INSTALL_SCRIPT";
const ANTIGRAVITY_TRANSPORT_ENV_KEY = "AGENT_TOOLKIT_ANTIGRAVITY_INSTALL_URL";

export function antigravityInstallPlan(
  platform: NodeJS.Platform,
  installScript: string,
  baseEnv: NodeJS.ProcessEnv,
): AntigravityInstallPlan {
  if (platform === "win32") {
    const replacedKeys = new Set([
      ANTIGRAVITY_SOURCE_ENV_KEY.toLowerCase(),
      ANTIGRAVITY_TRANSPORT_ENV_KEY.toLowerCase(),
    ]);
    const childEnv = Object.fromEntries(
      Object.entries(baseEnv).filter(
        ([key]) => !replacedKeys.has(key.toLowerCase()),
      ),
    );
    childEnv[ANTIGRAVITY_TRANSPORT_ENV_KEY] = installScript;

    return {
      command: "powershell.exe",
      args: [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        ANTIGRAVITY_POWERSHELL_PROGRAM,
      ],
      env: childEnv,
    };
  }

  return {
    command: "bash",
    args: ["-c", `curl -fsSL ${shellQuote(installScript)} | bash`],
  };
}

function installAntigravityCli(): boolean {
  const label = runtimeLabel("antigravity");
  const installScript = normalizeAntigravityInstallUrl(
    process.env.ANTIGRAVITY_INSTALL_SCRIPT ||
      "https://antigravity.google/cli/install.sh",
  );
  const plan = antigravityInstallPlan(
    process.platform,
    installScript,
    process.env,
  );

  if (process.platform === "win32") {
    info(`Installing ${label} via official PowerShell installer...`);
    const result = run(plan.command, plan.args, { env: plan.env });
    if (!result.ok) {
      err(`${label} install failed.`);
      return false;
    }
  } else {
    requireCommand("bash");
    requireCommand("curl");
    info(`Installing ${label} via official installer ${installScript}...`);
    const result = run(plan.command, plan.args);
    if (!result.ok) {
      err(`${label} install failed.`);
      return false;
    }
  }

  if (commandExists(runtimeCommand("antigravity"))) {
    ok(`${label} installed`);
    return true;
  }

  err(`${label} installer completed, but 'agy' is still not on PATH.`);
  return false;
}

function npmPackageVersion(packageSpec: string | undefined): string | null {
  if (!packageSpec) return null;
  if (packageSpec.startsWith("@")) {
    const slashIndex = packageSpec.indexOf("/");
    if (slashIndex === -1) return null;
    const versionIndex = packageSpec.indexOf("@", slashIndex);
    return versionIndex === -1 ? null : packageSpec.slice(versionIndex + 1);
  }

  const versionIndex = packageSpec.lastIndexOf("@");
  return versionIndex <= 0 ? null : packageSpec.slice(versionIndex + 1);
}

function runtimeVersionOutput(commandPath: string): string {
  const version = capture(commandPath, ["--version"]);
  return [version.stdout, version.stderr].join("\n").trim();
}

export function versionOutputMatchesPin(
  output: string,
  expectedVersion: string,
): boolean {
  // Substring matching ("2.0.1" in "2.0.10") produces false positives, so the
  // pinned version must appear as a whole token (optionally "v"-prefixed).
  const escaped = expectedVersion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^0-9A-Za-z.-])v?${escaped}([^0-9A-Za-z.-]|$)`).test(
    output,
  );
}

function ensureRuntimeCli(runtime: RuntimeName): boolean {
  const command = runtimeCommand(runtime);
  const label = runtimeLabel(runtime);
  const commandPath = findCommand(command);
  const packageName = state.cliPackages[runtime];

  if (commandPath) {
    const expectedVersion = npmPackageVersion(packageName);
    const versionOutput = runtimeVersionOutput(commandPath);
    if (
      !expectedVersion ||
      versionOutputMatchesPin(versionOutput, expectedVersion)
    ) {
      ok(`${label} found`);
      return true;
    }

    if (state.installMissingClis) {
      warn(
        `${label} version does not match pinned ${expectedVersion}; updating via npm package ${packageName}...`,
      );
      return installRuntimeCli(runtime);
    }

    warn(
      `${label} found but does not match pinned ${expectedVersion}; use --install-missing-clis to update it before plugin installs.`,
    );
    return true;
  }

  if (state.installMissingClis && !packageName)
    return installRuntimeCli(runtime);

  if (state.installMissingClis) return installRuntimeCli(runtime);

  warn(
    `${label} not found; selected runtime may be skipped or require manual setup.`,
  );
  return true;
}

export function checkPrerequisites(): boolean {
  step("Checking prerequisites");

  if (state.tools.rtk && commandExists("rtk")) {
    ok("RTK found");
  }

  if (state.tools.caveman) {
    requireNode(24);
    requireCommand("npx");
    ok(`node found: ${process.version}`);
    ok("npx found");
  }

  if (state.tools.gsd) {
    requireNode(24);
    requireCommand("npx");
    ok(`node found: ${process.version}`);
    ok("npx found");
  }

  if (agentSkillBundleIds.some((bundleId) => state.tools[bundleId])) {
    requireNode(24);
    requireCommand("git");
    requireCommand("npx");
    ok(`node found: ${process.version}`);
    ok("git found");
    ok("npx found");
  }

  if (state.tools.graphify && !commandExists("graphify")) {
    if (state.graphifyInstaller === "uv") {
      requireCommand("uv");
      ok("uv found");
    } else if (state.graphifyInstaller === "pipx") {
      requireCommand("pipx");
      ok("pipx found");
    } else {
      die("GRAPHIFY_INSTALLER must be uv or pipx.");
    }
  }

  if (
    state.installMissingClis &&
    runtimeNames.some(
      (runtime) => state.runtimes[runtime] && state.cliPackages[runtime],
    )
  ) {
    requireNode(24);
    requireCommand("npm");
    ok("npm found");
  }

  let allOk = true;
  for (const runtime of runtimeNames) {
    if (state.runtimes[runtime] && !ensureRuntimeCli(runtime)) {
      allOk = false;
    }
  }

  console.log("");
  return allOk;
}
