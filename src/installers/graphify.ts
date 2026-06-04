import { err, info, ok, step, warn } from "../logger.js";
import {
  type RuntimeName,
  runtimeMeta,
  runtimeNames,
  state,
} from "../state.js";
import { capture, findCommand, run } from "../system.js";

function graphifyPlatformArgs(runtime: RuntimeName): string[] {
  if (runtime === "claude") return ["install"];
  return ["install", "--platform", runtime];
}

function installGraphifyPackage(): boolean {
  const graphify = findCommand("graphify");
  if (graphify) {
    const version =
      capture(graphify, ["--version"]).stdout.trim().split("\n")[0] ||
      "installed";
    ok(`Graphify already installed - ${version} (${graphify})`);
    return true;
  }

  if (state.graphifyInstaller === "uv") {
    info(`Installing Graphify via uv tool package ${state.graphifyPackage}...`);
    return run("uv", ["tool", "install", state.graphifyPackage]).ok;
  }

  if (state.graphifyInstaller === "pipx") {
    info(`Installing Graphify via pipx package ${state.graphifyPackage}...`);
    return run("pipx", ["install", state.graphifyPackage]).ok;
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

  const graphify = findCommand("graphify");
  if (!graphify) {
    err("Graphify package installed, but 'graphify' is still not on PATH.");
    return false;
  }

  let hadError = false;
  for (const runtime of runtimeNames) {
    if (!state.runtimes[runtime]) continue;

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
