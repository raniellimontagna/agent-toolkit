import fs from "node:fs";
import path from "node:path";
import { HOME } from "../context.js";
import { err, info, ok, step, warn } from "../logger.js";
import {
  type RuntimeName,
  runtimeMeta,
  runtimeNames,
  state,
} from "../state.js";
import { capture, findCommand, run } from "../system.js";

function findExecutable(candidate: string): string | null {
  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return candidate;
  } catch {
    return null;
  }
}

function findGraphifyCommand(): string | null {
  const onPath = findCommand("graphify");
  if (onPath) return onPath;

  const candidateDirs = [
    process.env.UV_TOOL_BIN_DIR,
    process.env.PIPX_BIN_DIR,
    path.join(HOME, ".local", "bin"),
  ].filter((dir): dir is string => Boolean(dir));

  for (const dir of candidateDirs) {
    const graphify = findExecutable(path.join(dir, "graphify"));
    if (graphify) return graphify;
  }

  return null;
}

function graphifyPlatformArgs(runtime: RuntimeName): string[] {
  if (runtime === "claude") return ["install"];
  return ["install", "--platform", runtime];
}

function graphifySupportsRuntime(runtime: RuntimeName): boolean {
  return runtime !== "antigravity";
}

function installGraphifyPackage(): boolean {
  const graphify = findGraphifyCommand();
  if (graphify && !state.repair) {
    const version =
      capture(graphify, ["--version"]).stdout.trim().split("\n")[0] ||
      "installed";
    ok(`Graphify already installed - ${version} (${graphify})`);
    return true;
  }
  if (graphify && state.repair) {
    info(`Repair mode: reinstalling Graphify over ${graphify}...`);
  }

  // In repair mode force a reinstall even when the tool is already present.
  const forceArgs = state.repair ? ["--force"] : [];

  if (state.graphifyInstaller === "uv") {
    info(`Installing Graphify via uv tool package ${state.graphifyPackage}...`);
    return run("uv", ["tool", "install", ...forceArgs, state.graphifyPackage])
      .ok;
  }

  if (state.graphifyInstaller === "pipx") {
    info(`Installing Graphify via pipx package ${state.graphifyPackage}...`);
    return run("pipx", ["install", ...forceArgs, state.graphifyPackage]).ok;
  }

  err("GRAPHIFY_INSTALLER must be uv or pipx.");
  return false;
}

export function installGraphify(): boolean {
  step("Graphify");
  console.log(
    "   Knowledge graph workflow for codebase and document navigation",
  );

  if (!installGraphifyPackage()) {
    err("Graphify package install failed.");
    return false;
  }

  const graphify = findGraphifyCommand();
  if (!graphify) {
    err(
      "Graphify package installed, but 'graphify' was not found in PATH or ~/.local/bin.",
    );
    return false;
  }
  if (!findCommand("graphify")) {
    warn(
      `Graphify is installed at ${graphify}, but its directory is not on PATH. Add ${path.dirname(graphify)} to PATH to run graphify directly.`,
    );
  }

  let hadError = false;
  for (const runtime of runtimeNames) {
    if (!state.runtimes[runtime]) continue;
    if (!graphifySupportsRuntime(runtime)) {
      warn(
        `${runtimeMeta[runtime].display} Graphify install is not automated yet; skipping until Graphify supports that platform.`,
      );
      continue;
    }

    const args = graphifyPlatformArgs(runtime);
    if (state.gsdScope === "local") args.push("--project");

    info(`Installing Graphify for ${runtimeMeta[runtime].display}...`);
    const result = run(graphify, args);
    if (result.ok) ok(`Graphify installed for ${runtimeMeta[runtime].display}`);
    else {
      warn(
        `Graphify install did not complete for ${runtimeMeta[runtime].display}.`,
      );
      hadError = true;
    }
  }

  return !hadError;
}
