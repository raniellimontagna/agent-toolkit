import { err, info, ok, step } from "../logger.js";
import { state } from "../state.js";
import { requireCommand, requireNode, run } from "../system.js";
import { installSkillsCliSources } from "./frontend-skills.js";

export function installAgentBrowser(): boolean {
  step("Agent Browser");
  console.log(
    "   Browser automation CLI with a pinned skill and Chrome for Testing",
  );

  requireNode(24);
  requireCommand("npm");
  requireCommand("npx");
  requireCommand("git");

  info(`Installing Agent Browser package ${state.agentBrowserPackage}...`);
  if (!run("npm", ["install", "--global", state.agentBrowserPackage]).ok) {
    err("Agent Browser package install failed.");
    return false;
  }

  info("Installing Chrome for Testing for Agent Browser...");
  if (!run("agent-browser", ["install"]).ok) {
    err("Agent Browser Chrome setup failed.");
    return false;
  }

  const installed = installSkillsCliSources(
    "Agent Browser",
    "Pinned browser automation skill installed via Agent Skills CLI",
    [state.agentBrowserSkillSource],
  );
  if (installed) ok("Agent Browser installed");
  return installed;
}
