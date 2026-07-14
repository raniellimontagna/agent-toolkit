import process from "node:process";
import { parseArgs } from "./args.js";
import { buildDoctorReport, formatDoctorReport } from "./doctor.js";
import { installAgentBrowser } from "./installers/agent-browser.js";
import { installAgentSkillBundle } from "./installers/agent-skills.js";
import { installCaveman } from "./installers/caveman.js";
import { installGraphify } from "./installers/graphify.js";
import { installGsd } from "./installers/gsd.js";
import { installRtk } from "./installers/rtk.js";
import { installSuperpowers } from "./installers/superpowers.js";
import {
  buildLockUpdateReport,
  formatLockUpdateReport,
  printLockUpdateError,
} from "./lock-update.js";
import { die, err, skip, warn } from "./logger.js";
import { savePendingManifest, uninstallFromManifest } from "./manifest.js";
import { showMenu } from "./menu.js";
import { checkExternalToolProvenance } from "./provenance.js";
import { checkPrerequisites } from "./runtimes.js";
import { installCustomSkills, listCustomSkills } from "./skills.js";
import { auditSkills, printSkillsAudit } from "./skills-audit.js";
import {
  anyRuntimeSelected,
  anyToolSelected,
  runtimeNames,
  state,
  toolNames,
} from "./state.js";
import { detectInstallerStatus, formatInstallPlan } from "./status.js";
import { printHeader, printSelections, printSummary } from "./ui.js";

function selectedTools() {
  return toolNames.filter((tool) => state.tools[tool]);
}

function selectedRuntimes() {
  return runtimeNames.filter((runtime) => state.runtimes[runtime]);
}

function printDryRun(): void {
  checkExternalToolProvenance();
  const status = detectInstallerStatus();
  printHeader();
  printSelections();
  console.log("Install plan");
  console.log(formatInstallPlan(status));
  console.log("");
  console.log("Dry run: no changes were made.");
}

function printDoctor(): void {
  checkExternalToolProvenance();
  const report = buildDoctorReport(detectInstallerStatus(), {
    selectedTools: selectedTools(),
    selectedRuntimes: selectedRuntimes(),
    scope: state.gsdScope,
    customSkillsDir: state.customSkillsDir,
    installMissingClis: state.installMissingClis,
  });

  if (state.jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatDoctorReport(report));
  }
}

export async function runInstaller(
  argv: string[] = process.argv.slice(2),
): Promise<void> {
  if (!parseArgs(argv)) return;

  if (state.listSkills) {
    listCustomSkills();
    return;
  }

  if (state.auditSkills) {
    const passed = printSkillsAudit(auditSkills());
    if (!passed) process.exitCode = 1;
    return;
  }

  if (state.updateLock) {
    try {
      const report = await buildLockUpdateReport();
      console.log(
        state.jsonOutput
          ? JSON.stringify(report, null, 2)
          : formatLockUpdateReport(report),
      );
    } catch (error) {
      printLockUpdateError(error);
      process.exitCode = 1;
    }
    return;
  }

  if (state.doctor) {
    printDoctor();
    return;
  }

  if (!state.nonInteractive) await showMenu();

  if (!anyToolSelected()) die("Select at least one tool.");
  if (!anyRuntimeSelected()) die("Select at least one runtime.");

  if (state.uninstall) {
    uninstallFromManifest();
    return;
  }

  if (state.dryRun) {
    printDryRun();
    return;
  }

  checkExternalToolProvenance();

  printHeader();
  printSelections();
  if (state.repair) {
    console.log("  Repair mode: selected installs will be re-run.");
    console.log("");
  }
  const prerequisitesOk = checkPrerequisites();

  let hadError = false;
  if (!prerequisitesOk) {
    err("One or more selected runtime CLIs could not be installed.");
    hadError = true;
  }
  if (state.tools.rtk) {
    if (!(await installRtk())) {
      err("RTK install failed.");
      hadError = true;
    }
  } else {
    skip("RTK");
  }

  if (state.tools.caveman) {
    if (!installCaveman()) {
      err("Caveman install failed.");
      hadError = true;
    }
  } else {
    skip("Caveman");
  }

  if (state.tools.superpowers) {
    if (!installSuperpowers()) {
      err("Superpowers install failed.");
      hadError = true;
    }
  } else {
    skip("Superpowers");
  }

  if (state.tools.graphify) {
    if (!installGraphify()) {
      err("Graphify install failed.");
      hadError = true;
    }
  } else {
    skip("Graphify");
  }

  if (state.tools.gsd) {
    if (!installGsd()) {
      err("GSD install failed.");
      hadError = true;
    }
  } else {
    skip("GSD");
  }

  if (state.tools.improve) {
    if (!installAgentSkillBundle("improve").ok) {
      err("Improve install failed.");
      hadError = true;
    }
  } else {
    skip("Improve");
  }

  if (state.tools["agent-browser"]) {
    if (!installAgentBrowser()) {
      err("Agent Browser install failed.");
      hadError = true;
    }
  } else {
    skip("Agent Browser");
  }

  if (state.tools["frontend-skills"]) {
    if (!installAgentSkillBundle("frontend-skills").ok) {
      err("Frontend Skills install failed.");
      hadError = true;
    }
  } else {
    skip("Frontend Skills");
  }

  if (state.tools["planning-skills"]) {
    if (!installAgentSkillBundle("planning-skills").ok) {
      err("Planning Skills install failed.");
      hadError = true;
    }
  } else {
    skip("Planning Skills");
  }

  if (state.tools.skills) {
    if (!installCustomSkills()) {
      err("Custom Skills install failed.");
      hadError = true;
    }
  } else {
    skip("Custom Skills");
  }

  savePendingManifest();
  printSummary();

  if (hadError) {
    console.log("");
    warn("One or more installs failed. Review the messages above.");
    process.exitCode = 1;
  }
}
