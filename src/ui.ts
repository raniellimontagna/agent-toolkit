import { color, step } from "./logger.js";
import {
  normalizedSkillPaths,
  normalizedSkillScopes,
  runtimeMeta,
  runtimeNames,
  state,
} from "./state.js";

export function printHeader(): void {
  console.log("");
  console.log(`${color.bold}Agent Toolkit${color.reset}`);
  console.log("Personal toolkit installer for AI coding agents");
  console.log("");
}

export function printSelections(): void {
  console.log(`  ${color.bold}Selected tools:${color.reset}`);
  if (state.tools.rtk) console.log(`   ${color.green}+${color.reset} RTK`);
  if (state.tools.caveman)
    console.log(`   ${color.green}+${color.reset} Caveman`);
  if (state.tools.superpowers)
    console.log(`   ${color.green}+${color.reset} Superpowers`);
  if (state.tools.graphify)
    console.log(`   ${color.green}+${color.reset} Graphify`);
  if (state.tools.gsd) console.log(`   ${color.green}+${color.reset} GSD`);
  if (state.tools.improve)
    console.log(`   ${color.green}+${color.reset} Improve`);
  if (state.tools.skills)
    console.log(`   ${color.green}+${color.reset} Custom Skills`);
  console.log("");
  console.log(`  ${color.bold}Target runtimes:${color.reset}`);
  for (const runtime of runtimeNames) {
    if (state.runtimes[runtime])
      console.log(
        `   ${color.green}+${color.reset} ${runtimeMeta[runtime].display}`,
      );
  }
  console.log("");
}

export function printSummary(): void {
  step("Summary");
  console.log(`   Scope: ${state.gsdScope}`);
  console.log(`   Skills source: ${state.customSkillsDir}`);
  const scopes = normalizedSkillScopes();
  if (scopes.length > 0) console.log(`   Skills scope: ${scopes.join(", ")}`);
  const paths = normalizedSkillPaths();
  if (paths.length > 0) console.log(`   Skills path: ${paths.join(", ")}`);
  console.log("");
  console.log(
    "   Restart open agent sessions after installing plugins or skills.",
  );
}
