import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { err, info, ok, step } from "../logger.js";
import { selectedSkillsAgentArgs } from "../runtimes.js";
import { state } from "../state.js";
import { capture, requireCommand, requireNode, run } from "../system.js";

function cloneImproveSource(parentDir: string): string {
  const source = state.improveSkillSource;
  const repoUrl = `https://github.com/${source.repository}.git`;
  const repoDir = path.join(parentDir, "shadcn-improve");

  info(`Cloning ${source.label} at ${source.ref}...`);
  if (
    !run("git", [
      "clone",
      "--filter=blob:none",
      "--no-checkout",
      repoUrl,
      repoDir,
    ]).ok
  ) {
    throw new Error(`Failed to clone ${source.repository}.`);
  }

  if (
    !run("git", ["-C", repoDir, "fetch", "--depth", "1", "origin", source.ref])
      .ok
  ) {
    throw new Error(`Failed to fetch ${source.repository}@${source.ref}.`);
  }

  if (!run("git", ["-C", repoDir, "checkout", "--detach", "FETCH_HEAD"]).ok) {
    throw new Error(`Failed to checkout ${source.repository}@${source.ref}.`);
  }

  // FETCH_HEAD is whatever the remote decided to serve; confirm it is the
  // pinned commit before trusting the checked-out content.
  const head = capture("git", ["-C", repoDir, "rev-parse", "HEAD"])
    .stdout.trim()
    .toLowerCase();
  if (head !== source.ref.toLowerCase()) {
    throw new Error(
      `Fetched commit for ${source.repository} does not match pinned ref: expected ${source.ref}, got ${head || "unknown"}.`,
    );
  }

  return path.join(repoDir, "skills", source.skill);
}

function installImproveSource(sourceDir: string): boolean {
  const args = [
    "-y",
    state.frontendSkillsCliPackage,
    "add",
    sourceDir,
    "--skill",
    state.improveSkillSource.skill,
    ...selectedSkillsAgentArgs(),
    ...(state.gsdScope === "global" ? ["--global"] : []),
    "-y",
    "--copy",
  ];

  info("Installing Improve through Agent Skills CLI...");
  const result = run("npx", args);
  if (result.ok) {
    ok("Improve skill installed");
    return true;
  }

  err("Improve skill install failed");
  return false;
}

export function installImprove(): boolean {
  step("Improve");
  console.log(
    "   shadcn advisor skill for auditing codebases and writing execution plans",
  );

  requireNode(18);
  requireCommand("git");
  requireCommand("npx");

  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agent-toolkit-improve-"),
  );
  try {
    const sourceDir = cloneImproveSource(tempDir);
    return installImproveSource(sourceDir);
  } catch (error) {
    err(error instanceof Error ? error.message : String(error));
    return false;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
