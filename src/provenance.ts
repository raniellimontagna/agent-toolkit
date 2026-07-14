import process from "node:process";
import { die, warn } from "./logger.js";
import { runtimeMeta, runtimeNames, state } from "./state.js";
import {
  externalSourceIdentity,
  formatGithubPackageSpec,
  formatNpmPackageSpec,
  formatPythonPackageSpec,
  isMutableExternalSource,
  loadToolLock,
  type ToolLock,
} from "./tool-lock.js";

const DEFAULT_ANTIGRAVITY_INSTALL_SCRIPT =
  "https://antigravity.google/cli/install.sh";

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

function checkIdentity(label: string, spec: string, lockSpec: string): void {
  if (externalSourceIdentity(spec) === externalSourceIdentity(lockSpec)) {
    return;
  }

  if (state.allowMutableSources) {
    warn(
      `External tool source identity allowed explicitly: ${label}=${spec} (locked: ${externalSourceIdentity(lockSpec)})`,
    );
    return;
  }

  die(
    `External tool source identity differs from tools.lock.json: ${label}=${spec} ` +
      `(locked: ${externalSourceIdentity(lockSpec)}). ` +
      "Update tools.lock.json or pass --allow-mutable-sources.",
  );
}

function checkRtkReleaseSource(lock: ToolLock): void {
  const lockedPrefix = `https://api.github.com/repos/${lock.tools.rtk.repository}/releases/`;
  if (!state.rtkGithub.startsWith(lockedPrefix)) {
    if (state.allowMutableSources) {
      warn(
        `RTK release source allowed explicitly: ${state.rtkGithub} (locked repository: ${lock.tools.rtk.repository})`,
      );
    } else {
      die(
        `RTK release source does not match the repository pinned in tools.lock.json: ${state.rtkGithub} ` +
          `(locked: ${lock.tools.rtk.repository}). ` +
          "Update tools.lock.json or pass --allow-mutable-sources.",
      );
    }
  }

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

function checkToolsLockOverride(): void {
  if (!process.env.TOOLS_LOCK_PATH) return;

  if (state.allowMutableSources) {
    warn(
      `Alternate tools.lock.json allowed explicitly: ${process.env.TOOLS_LOCK_PATH}`,
    );
    return;
  }

  die(
    `TOOLS_LOCK_PATH replaces the pinned tools.lock.json (${process.env.TOOLS_LOCK_PATH}), ` +
      "which bypasses every checksum and ref pinned by this package. " +
      "Unset it or pass --allow-mutable-sources.",
  );
}

function checkAntigravitySource(): void {
  const script = process.env.ANTIGRAVITY_INSTALL_SCRIPT;
  if (!script) return;

  if (!script.startsWith("https:")) {
    die(
      `ANTIGRAVITY_INSTALL_SCRIPT must be an HTTPS URL, got: ${script}. ` +
        "The script is piped to bash, so plain HTTP is never allowed.",
    );
  }

  if (script === DEFAULT_ANTIGRAVITY_INSTALL_SCRIPT) return;

  if (state.allowMutableSources) {
    warn(`Antigravity install script allowed explicitly: ${script}`);
    return;
  }

  die(
    `ANTIGRAVITY_INSTALL_SCRIPT overrides the official installer URL: ${script}. ` +
      "The script is piped to bash. Unset it or pass --allow-mutable-sources.",
  );
}

export function checkExternalToolProvenance(): void {
  checkToolsLockOverride();

  const lock = loadToolLock();

  if (state.tools.rtk) checkRtkReleaseSource(lock);

  if (state.tools.caveman) {
    const lockSpec = formatGithubPackageSpec(
      lock.tools.caveman.repository,
      lock.tools.caveman.ref,
    );
    checkIdentity("Caveman", state.cavemanPackage, lockSpec);
    checkSource("Caveman", state.cavemanPackage);
  }

  if (state.tools.graphify) {
    const lockSpec = formatPythonPackageSpec(
      lock.tools.graphify.package,
      lock.tools.graphify.version,
    );
    checkIdentity("Graphify", state.graphifyPackage, lockSpec);
    checkSource("Graphify", state.graphifyPackage);
  }

  if (state.tools.gsd) {
    const lockSpec = formatNpmPackageSpec(
      lock.tools.gsd.package,
      lock.tools.gsd.version,
    );
    checkIdentity("GSD", state.gsdPackage, lockSpec);
    checkSource("GSD", state.gsdPackage);
  }

  if (state.tools["agent-browser"]) {
    const lockSpec = formatNpmPackageSpec(
      lock.tools.agentBrowser.package,
      lock.tools.agentBrowser.version,
    );
    checkIdentity("Agent Browser", state.agentBrowserPackage, lockSpec);
    checkSource("Agent Browser", state.agentBrowserPackage);
  }

  if (
    Object.keys(state.agentSkillsCatalog.bundles).some(
      (bundleId) => state.tools[bundleId as keyof typeof state.tools],
    )
  ) {
    const lockSpec = formatNpmPackageSpec(
      lock.tools.agentSkills.skillsCli.package,
      lock.tools.agentSkills.skillsCli.version,
    );
    checkIdentity("Agent Skills CLI", state.agentSkillsCliPackage, lockSpec);
    checkSource("Agent Skills CLI", state.agentSkillsCliPackage);
  }

  if (state.runtimes.antigravity) checkAntigravitySource();

  if (!state.installMissingClis) return;

  for (const runtime of runtimeNames) {
    if (!state.runtimes[runtime]) continue;
    const packageName = state.cliPackages[runtime];
    if (!packageName) continue;
    if (runtime !== "antigravity") {
      const lockCli = lock.runtimeClis[runtime];
      const lockSpec = formatNpmPackageSpec(lockCli.package, lockCli.version);
      checkIdentity(runtimeMeta[runtime].label, packageName, lockSpec);
    }
    checkSource(runtimeMeta[runtime].label, packageName);
  }
}
