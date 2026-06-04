import { die, err, info, ok, step, warn } from "./logger.js";
import { type RuntimeName, runtimeMeta, runtimeNames, state } from "./state.js";
import { commandExists, requireCommand, requireNode, run } from "./system.js";

export function runtimeCommand(runtime: RuntimeName): string {
  return runtimeMeta[runtime].command;
}

export function runtimeLabel(runtime: RuntimeName): string {
  return runtimeMeta[runtime].label;
}

export function selectedCavemanArgs(): string[] {
  const args: string[] = [];
  for (const runtime of runtimeNames) {
    if (state.runtimes[runtime]) args.push("--only", runtime);
  }
  if (state.cavemanMode !== "all") args.push("--minimal");
  args.push("--non-interactive");
  return args;
}

export function selectedGsdArgs(): string[] {
  const args = [state.gsdScope === "local" ? "--local" : "--global"];
  for (const runtime of runtimeNames) {
    if (state.runtimes[runtime]) args.push(`--${runtime}`);
  }
  return args;
}

function installRuntimeCli(runtime: RuntimeName): boolean {
  const label = runtimeLabel(runtime);
  const command = runtimeCommand(runtime);
  const packageName = state.cliPackages[runtime];

  requireNode(18);
  requireCommand("npm");

  info(`Installing ${label} via npm package ${packageName}...`);
  const result = run("npm", ["install", "-g", packageName]);
  if (!result.ok) {
    err(`${label} install failed.`);
    return false;
  }

  if (commandExists(command)) {
    ok(`${label} installed`);
    return true;
  }

  err(`${label} package installed, but '${command}' is still not on PATH.`);
  return false;
}

function ensureRuntimeCli(runtime: RuntimeName): boolean {
  const command = runtimeCommand(runtime);
  const label = runtimeLabel(runtime);

  if (commandExists(command)) {
    ok(`${label} found`);
    return true;
  }

  if (state.installMissingClis) return installRuntimeCli(runtime);

  warn(
    `${label} not found; selected runtime may be skipped or require manual setup.`,
  );
  return true;
}

export function checkPrerequisites(): void {
  step("Checking prerequisites");

  if (state.tools.rtk && commandExists("rtk")) {
    ok("RTK found");
  }

  if (state.tools.caveman) {
    requireNode(18);
    requireCommand("npx");
    ok(`node found: ${process.version}`);
    ok("npx found");
  }

  if (state.tools.gsd) {
    requireNode(22);
    requireCommand("npx");
    ok(`node found: ${process.version}`);
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

  if (state.installMissingClis) {
    requireNode(18);
    requireCommand("npm");
    ok("npm found");
  }

  for (const runtime of runtimeNames) {
    if (state.runtimes[runtime]) ensureRuntimeCli(runtime);
  }

  console.log("");
}
