import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { err, info, ok, step } from "../logger.js";
import { selectedSkillsAgentArgs } from "../runtimes.js";
import { state } from "../state.js";
import { capture, requireCommand, requireNode, run } from "../system.js";

export type SkillsCliSource = {
  label: string;
  repository: string;
  ref: string;
  skill: string;
};

function cloneLockedSource(source: SkillsCliSource, parentDir: string): string {
  const repoUrl = `https://github.com/${source.repository}.git`;
  const sourceDir = path.join(parentDir, source.skill);

  info(`Cloning ${source.label} at ${source.ref}...`);
  if (
    !run("git", [
      "clone",
      "--filter=blob:none",
      "--no-checkout",
      repoUrl,
      sourceDir,
    ]).ok
  ) {
    throw new Error(`Failed to clone ${source.repository}.`);
  }

  if (
    !run("git", [
      "-C",
      sourceDir,
      "fetch",
      "--depth",
      "1",
      "origin",
      source.ref,
    ]).ok
  ) {
    throw new Error(`Failed to fetch ${source.repository}@${source.ref}.`);
  }

  if (!run("git", ["-C", sourceDir, "checkout", "--detach", "FETCH_HEAD"]).ok) {
    throw new Error(`Failed to checkout ${source.repository}@${source.ref}.`);
  }

  // FETCH_HEAD is whatever the remote decided to serve; confirm it is the
  // pinned commit before trusting the checked-out content.
  const head = capture("git", ["-C", sourceDir, "rev-parse", "HEAD"])
    .stdout.trim()
    .toLowerCase();
  if (head !== source.ref.toLowerCase()) {
    throw new Error(
      `Fetched commit for ${source.repository} does not match pinned ref: expected ${source.ref}, got ${head || "unknown"}.`,
    );
  }

  return sourceDir;
}

function installSource(source: SkillsCliSource, sourceDir: string): boolean {
  const args = [
    "-y",
    state.frontendSkillsCliPackage,
    "add",
    sourceDir,
    "--skill",
    source.skill,
    ...selectedSkillsAgentArgs(),
    ...(state.gsdScope === "global" ? ["--global"] : []),
    "-y",
    "--copy",
  ];

  info(`Installing ${source.label} through Agent Skills CLI...`);
  const result = run("npx", args);
  if (result.ok) {
    ok(`${source.label} skill installed`);
    return true;
  }

  err(`${source.label} skill install failed`);
  return false;
}

export function installSkillsCliSources(
  stepLabel: string,
  description: string,
  sources: SkillsCliSource[],
): boolean {
  step(stepLabel);
  console.log(`   ${description}`);

  requireNode(18);
  requireCommand("git");
  requireCommand("npx");

  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agent-toolkit-skills-"),
  );
  try {
    for (const source of sources) {
      const sourceDir = cloneLockedSource(source, tempDir);
      if (!installSource(source, sourceDir)) return false;
    }
  } catch (error) {
    err(error instanceof Error ? error.message : String(error));
    return false;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  return true;
}

export function installFrontendSkills(): boolean {
  return installSkillsCliSources(
    "Frontend Skills",
    "Third-party frontend skills installed via Agent Skills CLI",
    state.frontendSkillSources,
  );
}
