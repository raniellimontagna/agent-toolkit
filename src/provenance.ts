import { die, warn } from "./logger.js";
import { runtimeMeta, runtimeNames, state } from "./state.js";
import { isMutableExternalSource } from "./tool-lock.js";

function checkSource(label: string, spec: string): void {
  if (!isMutableExternalSource(spec)) return;

  if (state.allowMutableSources) {
    warn(`Mutable external tool source allowed explicitly: ${label}=${spec}`);
    return;
  }

  die(
    `Mutable external tool source is not allowed: ${label}=${spec}. ` +
      "Pin it in tools.lock.json or pass --allow-mutable-sources.",
  );
}

function checkRtkReleaseSource(): void {
  if (!state.rtkGithub.includes("/releases/latest")) return;

  if (state.allowMutableSources) {
    warn(`Mutable RTK release source allowed explicitly: ${state.rtkGithub}`);
    return;
  }

  die(
    `Mutable external tool source is not allowed: RTK=${state.rtkGithub}. ` +
      "Use a tagged release URL from tools.lock.json or pass --allow-mutable-sources.",
  );
}

export function checkExternalToolProvenance(): void {
  if (state.tools.rtk) checkRtkReleaseSource();
  if (state.tools.caveman) checkSource("Caveman", state.cavemanPackage);
  if (state.tools.graphify) checkSource("Graphify", state.graphifyPackage);
  if (state.tools.gsd) checkSource("GSD", state.gsdPackage);
  if (state.tools["frontend-skills"] || state.tools.improve) {
    checkSource("Agent Skills CLI", state.frontendSkillsCliPackage);
  }

  if (!state.installMissingClis) return;

  for (const runtime of runtimeNames) {
    if (!state.runtimes[runtime]) continue;
    const packageName = state.cliPackages[runtime];
    if (!packageName) continue;
    checkSource(runtimeMeta[runtime].label, packageName);
  }
}
