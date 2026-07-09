import fs from "node:fs";
import path from "node:path";
import { HOME } from "./context.js";
import { ok, warn } from "./logger.js";
import {
  type InstallScope,
  type RuntimeName,
  runtimeNames,
  state,
} from "./state.js";

export type ManifestEntry = {
  kind: "skill";
  runtime: RuntimeName;
  source: string;
  destination: string;
  installedAt: string;
};

export type InstallManifest = {
  version: 1;
  scope: InstallScope;
  generatedAt: string;
  entries: ManifestEntry[];
};

type RemoveOptions = {
  runtimes: RuntimeName[];
  includeSkills: boolean;
  dryRun?: boolean;
};

let pendingManifest: InstallManifest | null = null;

function now(): string {
  return new Date().toISOString();
}

export function manifestPathForScope(
  scope: InstallScope,
  cwd = process.cwd(),
  home = HOME,
): string {
  const baseDir =
    scope === "local"
      ? path.join(cwd, ".agent-toolkit")
      : path.join(home, ".agent-toolkit");
  return path.join(baseDir, "install-manifest.json");
}

export function createManifest(scope: InstallScope): InstallManifest {
  return {
    version: 1,
    scope,
    generatedAt: now(),
    entries: [],
  };
}

function readManifest(
  filePath = manifestPathForScope(state.gsdScope),
): InstallManifest {
  if (!fs.existsSync(filePath)) return createManifest(state.gsdScope);

  const parsed = JSON.parse(
    fs.readFileSync(filePath, "utf8"),
  ) as InstallManifest;
  if (parsed.version !== 1 || !Array.isArray(parsed.entries)) {
    throw new Error(`Unsupported Agent Toolkit manifest: ${filePath}`);
  }
  return parsed;
}

function writeManifest(
  manifest: InstallManifest,
  filePath = manifestPathForScope(manifest.scope),
): void {
  manifest.generatedAt = now();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(`${filePath}.tmp`, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.renameSync(`${filePath}.tmp`, filePath);
}

export function upsertManifestEntry(
  manifest: InstallManifest,
  entry: Omit<ManifestEntry, "installedAt">,
): void {
  const installedAt = now();
  const existingIndex = manifest.entries.findIndex(
    (current) => current.destination === entry.destination,
  );
  const nextEntry = { ...entry, installedAt };

  if (existingIndex === -1) {
    manifest.entries.push(nextEntry);
  } else {
    manifest.entries[existingIndex] = nextEntry;
  }
}

export function recordSkillInstall(
  runtime: RuntimeName,
  source: string,
  destination: string,
): void {
  pendingManifest ??= readManifest();
  upsertManifestEntry(pendingManifest, {
    kind: "skill",
    runtime,
    source,
    destination,
  });
}

export function savePendingManifest(): void {
  if (!pendingManifest) return;
  writeManifest(pendingManifest);
  ok(
    `Wrote install manifest at ${manifestPathForScope(pendingManifest.scope)}`,
  );
  pendingManifest = null;
}

export function removeManifestEntries(
  manifest: InstallManifest,
  options: RemoveOptions,
): string[] {
  const selectedRuntimes = new Set(options.runtimes);
  const removed: string[] = [];
  const remaining: ManifestEntry[] = [];

  for (const entry of manifest.entries) {
    const shouldRemove =
      options.includeSkills &&
      entry.kind === "skill" &&
      selectedRuntimes.has(entry.runtime);

    if (!shouldRemove) {
      remaining.push(entry);
      continue;
    }

    if (!options.dryRun) {
      fs.rmSync(entry.destination, { recursive: true, force: true });
    }
    removed.push(entry.destination);
  }

  manifest.entries = remaining;
  return removed;
}

export function uninstallFromManifest(): boolean {
  const filePath = manifestPathForScope(state.gsdScope);
  if (!fs.existsSync(filePath)) {
    warn(`No Agent Toolkit manifest found at ${filePath}`);
    return true;
  }

  const manifest = readManifest(filePath);
  const selectedRuntimes = runtimeNames.filter(
    (runtime) => state.runtimes[runtime],
  );
  const removed = removeManifestEntries(manifest, {
    runtimes: selectedRuntimes,
    includeSkills: state.tools.skills,
    dryRun: state.dryRun,
  });

  if (state.dryRun) {
    if (removed.length === 0) {
      warn("No matching manifest entries found to uninstall.");
    } else {
      ok(`Would remove ${removed.length} manifest-recorded item(s):`);
      for (const destination of removed) {
        console.log(`   - ${destination}`);
      }
    }
    console.log("Dry run: no changes were made.");
    return true;
  }

  writeManifest(manifest, filePath);

  if (removed.length === 0) {
    warn("No matching manifest entries found to uninstall.");
    return true;
  }

  ok(`Removed ${removed.length} manifest-recorded item(s).`);
  return true;
}
