import { err, info, ok, step } from "../logger.js";
import { selectedCavemanArgs } from "../runtimes.js";
import { state } from "../state.js";
import { requireCommand, requireNode, run } from "../system.js";

export function installCaveman(): boolean {
  step("Caveman");
  console.log("   Ultra-compressed communication mode for coding agents");

  requireNode(18);
  requireCommand("npx");

  info("Running Caveman installer for selected runtimes...");
  const result = run("npx", [
    "-y",
    state.cavemanPackage,
    ...selectedCavemanArgs(),
  ]);
  if (result.ok) {
    ok("Caveman installer completed");
    return true;
  }

  err("Caveman installer failed");
  return false;
}
