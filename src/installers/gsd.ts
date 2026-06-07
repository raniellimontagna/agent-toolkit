import { err, info, ok, step } from "../logger.js";
import { hasSelectedGsdRuntime, selectedGsdArgs } from "../runtimes.js";
import { state } from "../state.js";
import { requireCommand, requireNode, run } from "../system.js";

export function installGsd(): boolean {
  step("GSD");
  console.log(
    "   Get-shit-done workflows for planning, execution and verification",
  );

  requireNode(22);
  requireCommand("npx");

  if (!hasSelectedGsdRuntime()) {
    ok("No GSD-supported runtimes selected; skipping GSD installer");
    return true;
  }

  info("Running GSD installer for selected runtimes...");
  const result = run("npx", ["-y", state.gsdPackage, ...selectedGsdArgs()]);
  if (result.ok) {
    ok("GSD installer completed");
    return true;
  }

  err("GSD installer failed");
  return false;
}
