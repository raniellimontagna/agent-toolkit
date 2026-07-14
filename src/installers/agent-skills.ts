import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { err, info, ok, step } from "../logger.js";
import { selectedSkillsAgentArgs } from "../runtimes.js";
import { state } from "../state.js";
import { capture, requireCommand, requireNode, run } from "../system.js";
import type {
  AgentSkillBundleId,
  AgentSkillEntry,
  AgentSkillRepository,
} from "../tool-lock.js";

export type SkillInstallStatus = "installed" | "failed" | "blocked";

export type SkillInstallOutcome = {
  repository: string;
  skill: string;
  status: SkillInstallStatus;
  reason?: string;
};

export type BundleInstallResult = {
  bundle: AgentSkillBundleId;
  ok: boolean;
  outcomes: SkillInstallOutcome[];
};

type CheckoutResult =
  | { ok: true; directory: string }
  | { ok: false; reason: string };

function checkoutRepository(
  repositoryId: string,
  repository: AgentSkillRepository,
  tempDir: string,
): CheckoutResult {
  const directory = path.join(tempDir, repositoryId);
  const repoUrl = `https://github.com/${repository.repository}.git`;
  info(`Cloning ${repository.repository} at ${repository.ref}...`);

  if (
    !run("git", [
      "clone",
      "--filter=blob:none",
      "--no-checkout",
      repoUrl,
      directory,
    ]).ok
  ) {
    return { ok: false, reason: `Failed to clone ${repository.repository}.` };
  }
  if (
    !run("git", [
      "-C",
      directory,
      "fetch",
      "--depth",
      "1",
      "origin",
      repository.ref,
    ]).ok
  ) {
    return {
      ok: false,
      reason: `Failed to fetch ${repository.repository}@${repository.ref}.`,
    };
  }
  if (!run("git", ["-C", directory, "checkout", "--detach", "FETCH_HEAD"]).ok) {
    return {
      ok: false,
      reason: `Failed to checkout ${repository.repository}@${repository.ref}.`,
    };
  }

  const head = capture("git", ["-C", directory, "rev-parse", "HEAD"]);
  const actualRef = head.stdout.trim().toLowerCase();
  if (!head.ok || actualRef !== repository.ref.toLowerCase()) {
    return {
      ok: false,
      reason: `Fetched commit for ${repository.repository} does not match pinned ref: expected ${repository.ref}, got ${actualRef || "unknown"}.`,
    };
  }
  return { ok: true, directory };
}

function installSkill(
  entry: AgentSkillEntry,
  checkoutDir: string,
): SkillInstallOutcome {
  const skillRoot = entry.path
    ? path.resolve(checkoutDir, entry.path)
    : checkoutDir;
  const failedOutcome: SkillInstallOutcome = {
    repository: entry.repository,
    skill: entry.skill,
    status: "failed",
    reason: `Missing ${entry.skill} skill directory: ${skillRoot}.`,
  };
  let canonicalSkillRoot: string;
  try {
    const canonicalCheckoutDir = fs.realpathSync(checkoutDir);
    canonicalSkillRoot = fs.realpathSync(skillRoot);
    const relativeSkillRoot = path.relative(
      canonicalCheckoutDir,
      canonicalSkillRoot,
    );
    if (
      relativeSkillRoot === ".." ||
      relativeSkillRoot.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeSkillRoot) ||
      !fs.statSync(canonicalSkillRoot).isDirectory()
    ) {
      return failedOutcome;
    }
  } catch {
    return failedOutcome;
  }

  info(`Installing ${entry.skill} through Agent Skills CLI...`);
  const result = run("npx", [
    "-y",
    state.agentSkillsCliPackage,
    "add",
    canonicalSkillRoot,
    "--skill",
    entry.skill,
    ...selectedSkillsAgentArgs(),
    ...(state.gsdScope === "global" ? ["--global"] : []),
    "-y",
    "--copy",
  ]);
  if (result.ok) {
    ok(`${entry.skill} skill installed`);
    return {
      repository: entry.repository,
      skill: entry.skill,
      status: "installed",
    };
  }
  return {
    repository: entry.repository,
    skill: entry.skill,
    status: "failed",
    reason: `${entry.skill} skill install failed.`,
  };
}

export function installAgentSkillBundle(
  bundleId: AgentSkillBundleId,
): BundleInstallResult {
  const bundle = state.agentSkillsCatalog.bundles[bundleId];
  step(bundle.label);
  console.log(`   ${bundle.description}`);
  requireNode(24);
  requireCommand("git");
  requireCommand("npx");

  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agent-toolkit-skills-"),
  );
  const checkouts = new Map<string, CheckoutResult>();
  const outcomes: SkillInstallOutcome[] = [];

  try {
    for (const entry of bundle.skills) {
      let checkout = checkouts.get(entry.repository);
      if (!checkout) {
        const repository =
          state.agentSkillsCatalog.repositories[entry.repository];
        checkout = repository
          ? checkoutRepository(entry.repository, repository, tempDir)
          : { ok: false, reason: `Unknown repository ${entry.repository}.` };
        checkouts.set(entry.repository, checkout);
      }

      if (!checkout.ok) {
        err(checkout.reason);
        outcomes.push({
          repository: entry.repository,
          skill: entry.skill,
          status: "blocked",
          reason: checkout.reason,
        });
        continue;
      }

      const outcome = installSkill(entry, checkout.directory);
      if (outcome.status === "failed" && outcome.reason) err(outcome.reason);
      outcomes.push(outcome);
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  const result = {
    bundle: bundleId,
    ok: outcomes.every(({ status }) => status === "installed"),
    outcomes,
  };
  const installedCount = outcomes.filter(
    ({ status }) => status === "installed",
  ).length;
  const problemCount = outcomes.length - installedCount;
  const summary = `${bundle.label}: ${installedCount} installed, ${problemCount} failed or blocked.`;
  if (result.ok) ok(summary);
  else err(summary);
  return result;
}
