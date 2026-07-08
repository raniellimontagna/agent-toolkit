import { err } from "./logger.js";
import { capture, fetchJson, type RunResult } from "./system.js";
import { loadToolLock, type ToolLock } from "./tool-lock.js";

export type LockUpdateItem = {
  name: string;
  source: "npm" | "pypi" | "github" | "github-release";
  current: string;
  latest?: string;
  status: "current" | "update-available" | "unknown";
  error?: string;
};

export type LockUpdateReport = {
  command: "update-lock";
  items: LockUpdateItem[];
};

type Clients = {
  capture?: (command: string, args?: string[]) => RunResult;
  fetchJson?: (url: string) => Promise<unknown>;
};

type GitHubRepoResponse = {
  default_branch?: string;
};

type GitHubCommitResponse = {
  sha?: string;
};

type GitHubReleaseResponse = {
  tag_name?: string;
};

type PyPiResponse = {
  info?: {
    version?: string;
  };
};

function itemStatus(
  current: string,
  latest?: string,
): LockUpdateItem["status"] {
  if (!latest) return "unknown";
  return current === latest ? "current" : "update-available";
}

async function latestNpmVersion(
  packageName: string,
  clients: Required<Pick<Clients, "capture">>,
): Promise<string> {
  const result = clients.capture("npm", [
    "view",
    packageName,
    "version",
    "--silent",
  ]);
  if (!result.ok) {
    throw new Error(
      result.stderr.trim() || `npm view failed for ${packageName}`,
    );
  }
  const version = result.stdout.trim().split(/\r?\n/).at(-1)?.trim();
  if (!version)
    throw new Error(`npm did not return a version for ${packageName}`);
  return version;
}

async function latestPyPiVersion(
  packageName: string,
  clients: Required<Pick<Clients, "fetchJson">>,
): Promise<string> {
  const response = (await clients.fetchJson(
    `https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`,
  )) as PyPiResponse;
  if (!response.info?.version) {
    throw new Error(`PyPI did not return a version for ${packageName}`);
  }
  return response.info.version;
}

async function latestGitHubCommit(
  repository: string,
  clients: Required<Pick<Clients, "fetchJson">>,
): Promise<string> {
  const repo = (await clients.fetchJson(
    `https://api.github.com/repos/${repository}`,
  )) as GitHubRepoResponse;
  const branch = repo.default_branch || "main";
  const commit = (await clients.fetchJson(
    `https://api.github.com/repos/${repository}/commits/${encodeURIComponent(branch)}`,
  )) as GitHubCommitResponse;
  if (!commit.sha)
    throw new Error(`GitHub did not return a commit for ${repository}`);
  return commit.sha;
}

async function latestGitHubRelease(
  repository: string,
  clients: Required<Pick<Clients, "fetchJson">>,
): Promise<string> {
  const release = (await clients.fetchJson(
    `https://api.github.com/repos/${repository}/releases/latest`,
  )) as GitHubReleaseResponse;
  if (!release.tag_name) {
    throw new Error(`GitHub did not return a latest release for ${repository}`);
  }
  return release.tag_name;
}

async function collectItem(
  item: Omit<LockUpdateItem, "status" | "latest" | "error">,
  resolver: () => Promise<string>,
): Promise<LockUpdateItem> {
  try {
    const latest = await resolver();
    return {
      ...item,
      latest,
      status: itemStatus(item.current, latest),
    };
  } catch (error) {
    return {
      ...item,
      status: "unknown",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function buildLockUpdateReport(
  lock: ToolLock = loadToolLock(),
  clients: Clients = {},
): Promise<LockUpdateReport> {
  const resolvedClients = {
    capture: clients.capture || capture,
    fetchJson: clients.fetchJson || fetchJson,
  };

  const items = await Promise.all([
    collectItem(
      {
        name: "RTK",
        source: "github-release",
        current: lock.tools.rtk.tag,
      },
      () => latestGitHubRelease(lock.tools.rtk.repository, resolvedClients),
    ),
    collectItem(
      {
        name: "Caveman",
        source: "github",
        current: lock.tools.caveman.ref,
      },
      () => latestGitHubCommit(lock.tools.caveman.repository, resolvedClients),
    ),
    collectItem(
      {
        name: "Graphify",
        source: "pypi",
        current: lock.tools.graphify.version,
      },
      () => latestPyPiVersion(lock.tools.graphify.package, resolvedClients),
    ),
    collectItem(
      {
        name: "GSD",
        source: "npm",
        current: lock.tools.gsd.version,
      },
      () => latestNpmVersion(lock.tools.gsd.package, resolvedClients),
    ),
    collectItem(
      {
        name: "Improve",
        source: "github",
        current: lock.tools.improve.ref,
      },
      () => latestGitHubCommit(lock.tools.improve.repository, resolvedClients),
    ),
    collectItem(
      {
        name: "Agent Skills CLI",
        source: "npm",
        current: lock.tools.frontendSkills.skillsCli.version,
      },
      () =>
        latestNpmVersion(
          lock.tools.frontendSkills.skillsCli.package,
          resolvedClients,
        ),
    ),
    collectItem(
      {
        name: "Impeccable",
        source: "github",
        current: lock.tools.frontendSkills.impeccable.ref,
      },
      () =>
        latestGitHubCommit(
          lock.tools.frontendSkills.impeccable.repository,
          resolvedClients,
        ),
    ),
    collectItem(
      {
        name: "Taste Skill",
        source: "github",
        current: lock.tools.frontendSkills.tasteSkill.ref,
      },
      () =>
        latestGitHubCommit(
          lock.tools.frontendSkills.tasteSkill.repository,
          resolvedClients,
        ),
    ),
    collectItem(
      {
        name: "React Doctor",
        source: "github",
        current: lock.tools.frontendSkills.reactDoctor.ref,
      },
      () =>
        latestGitHubCommit(
          lock.tools.frontendSkills.reactDoctor.repository,
          resolvedClients,
        ),
    ),
    ...(["claude", "codex", "opencode", "gemini"] as const).map((runtime) =>
      collectItem(
        {
          name: `${runtime} CLI`,
          source: "npm" as const,
          current: lock.runtimeClis[runtime].version,
        },
        () =>
          latestNpmVersion(lock.runtimeClis[runtime].package, resolvedClients),
      ),
    ),
  ]);

  return { command: "update-lock", items };
}

export function formatLockUpdateReport(report: LockUpdateReport): string {
  const lines = ["External source update report"];
  for (const item of report.items) {
    const latest = item.latest || "unknown";
    const suffix = item.error ? ` (${item.error})` : "";
    lines.push(
      `- ${item.name}: ${item.current} -> ${latest} [${item.status}]${suffix}`,
    );
  }
  lines.push(
    "",
    "This command reports candidates only; update tools.lock.json intentionally after reviewing checksums and changelogs.",
  );
  return lines.join("\n");
}

export function printLockUpdateError(error: unknown): void {
  err(error instanceof Error ? error.message : String(error));
}
