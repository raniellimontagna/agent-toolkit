import process from "node:process";
import { parseArgs } from "./args.js";
import { installCaveman } from "./installers/caveman.js";
import { installFrontendSkills } from "./installers/frontend-skills.js";
import { installGraphify } from "./installers/graphify.js";
import { installGsd } from "./installers/gsd.js";
import { installRtk } from "./installers/rtk.js";
import { installSuperpowers } from "./installers/superpowers.js";
import { die, err, skip, warn } from "./logger.js";
import { showMenu } from "./menu.js";
import { checkExternalToolProvenance } from "./provenance.js";
import { checkPrerequisites } from "./runtimes.js";
import { installCustomSkills, listCustomSkills } from "./skills.js";
import { anyRuntimeSelected, anyToolSelected, state } from "./state.js";
import { printHeader, printSelections, printSummary } from "./ui.js";

export async function runInstaller(
  argv: string[] = process.argv.slice(2),
): Promise<void> {
  if (!parseArgs(argv)) return;

  if (state.listSkills) {
    listCustomSkills();
    return;
  }

  if (!state.nonInteractive) await showMenu();

  if (!anyToolSelected()) die("Select at least one tool.");
  if (!anyRuntimeSelected()) die("Select at least one runtime.");

  checkExternalToolProvenance();

  printHeader();
  printSelections();
  checkPrerequisites();

  let hadError = false;
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

  if (state.tools["frontend-skills"]) {
    if (!installFrontendSkills()) {
      err("Frontend Skills install failed.");
      hadError = true;
    }
  } else {
    skip("Frontend Skills");
  }

  if (state.tools.skills) {
    if (!installCustomSkills()) {
      err("Custom Skills install failed.");
      hadError = true;
    }
  } else {
    skip("Custom Skills");
  }

  printSummary();

  if (hadError) {
    console.log("");
    warn("One or more installs failed. Review the messages above.");
    process.exitCode = 1;
  }
}
