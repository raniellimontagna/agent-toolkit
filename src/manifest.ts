import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { HOME } from "./context.js";
import { InstallerError, ok, warn } from "./logger.js";
import {
  canonicalPathsEqual,
  resolveSkillTargetDirs,
} from "./skill-targets.js";
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
  runtimes: readonly RuntimeName[];
  includeSkills: boolean;
  dryRun?: boolean;
  cwd?: string;
  home?: string;
  env?: NodeJS.ProcessEnv;
};

type RemovalContext = {
  scope: InstallScope;
  cwd: string;
  home: string;
  env: NodeJS.ProcessEnv;
};

type FilesystemType =
  | "block-device"
  | "character-device"
  | "directory"
  | "fifo"
  | "file"
  | "socket"
  | "symbolic-link"
  | "unknown";

type FilesystemIdentity = {
  dev: string;
  ino: string;
  type: FilesystemType;
};

type PruneOnlyRemoval = {
  destination: string;
  existedAtPreflight: false;
};

type ExistingRemoval = {
  destination: string;
  existedAtPreflight: true;
  canonicalRoot: string;
  basename: string;
  rootIdentity: FilesystemIdentity;
  destinationIdentity: FilesystemIdentity;
};

type ValidatedRemoval = PruneOnlyRemoval | ExistingRemoval;

type RemovalPlan = {
  selected: ValidatedRemoval[];
  remaining: ManifestEntry[];
};

let pendingManifest: InstallManifest | null = null;

const SAFE_REMOVAL_HELPER_SOURCE = String.raw`
"use strict";
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

let basename;
let tombstone;
let renamed = false;

function filesystemType(stats) {
  if (stats.isBlockDevice()) return "block-device";
  if (stats.isCharacterDevice()) return "character-device";
  if (stats.isDirectory()) return "directory";
  if (stats.isFIFO()) return "fifo";
  if (stats.isFile()) return "file";
  if (stats.isSocket()) return "socket";
  if (stats.isSymbolicLink()) return "symbolic-link";
  return "unknown";
}

function identity(stats) {
  return {
    dev: stats.dev.toString(),
    ino: stats.ino.toString(),
    type: filesystemType(stats),
  };
}

function validIdentity(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof value.dev === "string" &&
    typeof value.ino === "string" &&
    typeof value.type === "string"
  );
}

function sameIdentity(left, right) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.type === right.type
  );
}

function directBasename(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value !== "." &&
    value !== ".." &&
    !value.includes("/") &&
    !path.isAbsolute(value) &&
    path.basename(value) === value
  );
}

function isAbsent(value) {
  try {
    fs.lstatSync(value);
    return false;
  } catch (error) {
    if (error && error.code === "ENOENT") return true;
    throw error;
  }
}

function rollback() {
  if (!renamed || !directBasename(basename) || !directBasename(tombstone)) {
    return;
  }
  try {
    if (isAbsent(basename)) fs.renameSync(tombstone, basename);
  } catch {}
}

try {
  const payload = JSON.parse(process.argv[1] || "null");
  if (
    payload === null ||
    typeof payload !== "object" ||
    !directBasename(payload.basename) ||
    !validIdentity(payload.rootIdentity) ||
    !validIdentity(payload.destinationIdentity)
  ) {
    throw new Error("invalid payload");
  }
  basename = payload.basename;

  const rootStats = fs.statSync(".", { bigint: true });
  if (
    !rootStats.isDirectory() ||
    !sameIdentity(identity(rootStats), payload.rootIdentity)
  ) {
    throw new Error("root identity changed");
  }

  const rootCanonical = fs.realpathSync(".");
  const childStats = fs.lstatSync(basename, { bigint: true });
  if (!sameIdentity(identity(childStats), payload.destinationIdentity)) {
    throw new Error("destination identity changed");
  }
  const childCanonical = fs.realpathSync(basename);
  if (path.dirname(childCanonical) !== rootCanonical) {
    throw new Error("destination escaped root");
  }

  tombstone =
    ".agent-toolkit-remove-" +
    process.pid +
    "-" +
    crypto.randomBytes(16).toString("hex");
  if (!directBasename(tombstone) || !isAbsent(tombstone)) {
    throw new Error("invalid tombstone");
  }

  fs.renameSync(basename, tombstone);
  renamed = true;

  const tombstoneStats = fs.lstatSync(tombstone, { bigint: true });
  if (!sameIdentity(identity(tombstoneStats), payload.destinationIdentity)) {
    throw new Error("renamed destination identity changed");
  }
  const tombstoneCanonical = fs.realpathSync(tombstone);
  if (path.dirname(tombstoneCanonical) !== rootCanonical) {
    throw new Error("renamed destination escaped root");
  }

  fs.rmSync(tombstone, { recursive: true, force: true });
  renamed = false;
} catch {
  rollback();
  process.stderr.write("safe removal rejected\n");
  process.exitCode = 1;
}
`;

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRuntimeName(value: unknown): value is RuntimeName {
  return (
    typeof value === "string" &&
    runtimeNames.some((runtime) => runtime === value)
  );
}

function isInstallScope(value: unknown): value is InstallScope {
  return value === "local" || value === "global";
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    Number.isFinite(Date.parse(value))
  );
}

function invalidManifest(filePath: string, reason: string): InstallerError {
  return new InstallerError(
    `Invalid Agent Toolkit manifest at ${filePath}: ${reason}`,
  );
}

function validateManifestDocument(
  value: unknown,
  expectedScope: InstallScope,
  filePath: string,
): InstallManifest {
  if (!isRecord(value))
    throw invalidManifest(filePath, "root must be an object");
  if (value.version !== 1) throw invalidManifest(filePath, "version must be 1");
  if (!isInstallScope(value.scope))
    throw invalidManifest(filePath, "scope must be local or global");
  if (value.scope !== expectedScope)
    throw invalidManifest(filePath, `scope must be ${expectedScope}`);
  if (!isTimestamp(value.generatedAt))
    throw invalidManifest(filePath, "generatedAt must be a valid timestamp");
  if (!Array.isArray(value.entries))
    throw invalidManifest(filePath, "entries must be an array");

  const entries = value.entries.map((rawEntry, index): ManifestEntry => {
    const prefix = `entries[${index}]`;
    if (!isRecord(rawEntry))
      throw invalidManifest(filePath, `${prefix} must be an object`);
    if (rawEntry.kind !== "skill")
      throw invalidManifest(filePath, `${prefix}.kind must be skill`);
    if (!isRuntimeName(rawEntry.runtime))
      throw invalidManifest(filePath, `${prefix}.runtime is unsupported`);
    if (
      typeof rawEntry.source !== "string" ||
      rawEntry.source.trim().length === 0
    )
      throw invalidManifest(filePath, `${prefix}.source must be non-empty`);
    if (
      typeof rawEntry.destination !== "string" ||
      !path.isAbsolute(rawEntry.destination)
    )
      throw invalidManifest(filePath, `${prefix}.destination must be absolute`);
    if (!isTimestamp(rawEntry.installedAt))
      throw invalidManifest(
        filePath,
        `${prefix}.installedAt must be a valid timestamp`,
      );

    return {
      kind: "skill",
      runtime: rawEntry.runtime,
      source: rawEntry.source,
      destination: rawEntry.destination,
      installedAt: rawEntry.installedAt,
    };
  });

  return {
    version: 1,
    scope: value.scope,
    generatedAt: value.generatedAt,
    entries,
  };
}

export function readManifest(
  filePath = manifestPathForScope(state.gsdScope),
  expectedScope = state.gsdScope,
): InstallManifest {
  if (!fs.existsSync(filePath)) return createManifest(expectedScope);

  const raw = fs.readFileSync(filePath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw invalidManifest(filePath, "invalid JSON");
  }
  return validateManifestDocument(parsed, expectedScope, filePath);
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
  const destination = path.resolve(entry.destination);
  const existingIndex = manifest.entries.findIndex(
    (current) => current.destination === destination,
  );
  const nextEntry = { ...entry, destination, installedAt };

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

function errorCode(error: unknown): string | undefined {
  return isRecord(error) && typeof error.code === "string"
    ? error.code
    : undefined;
}

function normalizeAbsolute(input: string, cwd: string): string {
  return path.normalize(
    path.isAbsolute(input) ? input : path.resolve(cwd, input),
  );
}

function hasParentTraversal(input: string): boolean {
  return input.split(/[\\/]+/).includes("..");
}

function isProperDescendant(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return (
    relative.length > 0 &&
    !path.isAbsolute(relative) &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`)
  );
}

function canonicalizeAllowMissing(input: string): string {
  let current = path.resolve(input);
  const missingSegments: string[] = [];

  while (true) {
    try {
      fs.lstatSync(current);
    } catch (error) {
      if (errorCode(error) !== "ENOENT") throw error;
      const parent = path.dirname(current);
      if (parent === current) throw error;
      missingSegments.unshift(path.basename(current));
      current = parent;
      continue;
    }

    const canonicalExisting = fs.realpathSync(current);
    return path.resolve(canonicalExisting, ...missingSegments);
  }
}

function filesystemType(stats: fs.BigIntStats): FilesystemType {
  if (stats.isBlockDevice()) return "block-device";
  if (stats.isCharacterDevice()) return "character-device";
  if (stats.isDirectory()) return "directory";
  if (stats.isFIFO()) return "fifo";
  if (stats.isFile()) return "file";
  if (stats.isSocket()) return "socket";
  if (stats.isSymbolicLink()) return "symbolic-link";
  return "unknown";
}

function filesystemIdentity(stats: fs.BigIntStats): FilesystemIdentity {
  return {
    dev: stats.dev.toString(),
    ino: stats.ino.toString(),
    type: filesystemType(stats),
  };
}

function inspectDestination(
  destination: string,
): { exists: false } | { exists: true; identity: FilesystemIdentity } {
  try {
    const stats = fs.lstatSync(destination, { bigint: true });
    return { exists: true, identity: filesystemIdentity(stats) };
  } catch (error) {
    if (errorCode(error) === "ENOENT") return { exists: false };
    throw error;
  }
}

function unsafeDestination(
  runtime: RuntimeName,
  reason: string,
): InstallerError {
  return new InstallerError(
    `Unsafe manifest destination for ${runtime}: ${reason}. Review the manifest manually.`,
  );
}

function validateRemovalEntry(
  entry: ManifestEntry,
  context: RemovalContext,
): ValidatedRemoval {
  if (!path.isAbsolute(entry.destination))
    throw unsafeDestination(entry.runtime, "destination is not absolute");
  if (hasParentTraversal(entry.destination))
    throw unsafeDestination(
      entry.runtime,
      "destination contains parent traversal",
    );

  const destination = normalizeAbsolute(entry.destination, context.cwd);
  const roots = resolveSkillTargetDirs(entry.runtime, context).map((root) =>
    normalizeAbsolute(root, context.cwd),
  );
  const lexicalRoot = roots.find(
    (root) =>
      path.basename(destination).length > 0 &&
      canonicalPathsEqual(path.dirname(destination), root),
  );
  if (!lexicalRoot)
    throw unsafeDestination(
      entry.runtime,
      "destination is not a direct child of a current skills root",
    );

  let destinationInspection:
    | { exists: false }
    | { exists: true; identity: FilesystemIdentity };
  try {
    destinationInspection = inspectDestination(destination);
  } catch {
    throw unsafeDestination(entry.runtime, "destination cannot be inspected");
  }

  if (!destinationInspection.exists && context.scope === "global") {
    return { destination, existedAtPreflight: false };
  }

  let canonicalRoot: string;
  try {
    canonicalRoot = canonicalizeAllowMissing(lexicalRoot);
  } catch {
    throw unsafeDestination(
      entry.runtime,
      "skills root cannot be canonicalized",
    );
  }

  if (context.scope === "local") {
    let canonicalCwd: string;
    try {
      canonicalCwd = fs.realpathSync(context.cwd);
    } catch {
      throw unsafeDestination(entry.runtime, "cwd cannot be canonicalized");
    }
    if (!isProperDescendant(canonicalCwd, canonicalRoot))
      throw unsafeDestination(
        entry.runtime,
        "skills root is outside canonical cwd",
      );
  }

  if (!destinationInspection.exists) {
    return { destination, existedAtPreflight: false };
  }

  let rootStats: fs.BigIntStats;
  let canonicalDestination: string;
  try {
    rootStats = fs.statSync(canonicalRoot, { bigint: true });
    canonicalDestination = fs.realpathSync(destination);
  } catch {
    throw unsafeDestination(
      entry.runtime,
      "existing destination cannot be canonicalized",
    );
  }
  if (!rootStats.isDirectory())
    throw unsafeDestination(entry.runtime, "skills root is not a directory");
  if (!canonicalPathsEqual(path.dirname(canonicalDestination), canonicalRoot))
    throw unsafeDestination(
      entry.runtime,
      "canonical destination escapes the canonical skills root",
    );

  return {
    destination,
    existedAtPreflight: true,
    canonicalRoot,
    basename: path.basename(destination),
    rootIdentity: filesystemIdentity(rootStats),
    destinationIdentity: destinationInspection.identity,
  };
}

function runSafeRemovalHelper(item: ExistingRemoval): void {
  const payload = JSON.stringify({
    basename: item.basename,
    rootIdentity: item.rootIdentity,
    destinationIdentity: item.destinationIdentity,
  });
  const result = childProcess.spawnSync(
    process.execPath,
    ["--input-type=commonjs", "-e", SAFE_REMOVAL_HELPER_SOURCE, payload],
    {
      cwd: item.canonicalRoot,
      encoding: "utf8",
      maxBuffer: 64 * 1024,
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
      timeout: 30_000,
    },
  );

  if (result.error) {
    throw new InstallerError(
      "Safe removal helper could not start. The manifest was preserved for retry.",
    );
  }
  if (result.status !== 0) {
    throw new InstallerError(
      "Safe removal helper rejected a filesystem identity or containment change. The manifest was preserved for retry.",
    );
  }
}

function preflightManifestRemoval(
  manifest: InstallManifest,
  options: RemoveOptions,
): RemovalPlan {
  const context: RemovalContext = {
    scope: manifest.scope,
    cwd: path.resolve(options.cwd ?? process.cwd()),
    home: path.resolve(options.home ?? HOME),
    env: options.env ?? process.env,
  };
  const selectedRuntimes = new Set(options.runtimes);
  const selected: ValidatedRemoval[] = [];
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
    selected.push(validateRemovalEntry(entry, context));
  }

  return { selected, remaining };
}

export function removeManifestEntries(
  manifest: InstallManifest,
  options: RemoveOptions,
): string[] {
  const validatedManifest = validateManifestDocument(
    manifest,
    manifest.scope,
    "in-memory manifest",
  );
  const plan = preflightManifestRemoval(validatedManifest, options);
  const removed = plan.selected.map((item) => item.destination);

  if (options.dryRun) return removed;

  for (const item of plan.selected) {
    if (!item.existedAtPreflight) continue;
    runSafeRemovalHelper(item);
  }
  manifest.entries = plan.remaining;
  return removed;
}

export function uninstallFromManifest(): boolean {
  const filePath = manifestPathForScope(state.gsdScope);
  if (!fs.existsSync(filePath)) {
    warn(`No Agent Toolkit manifest found at ${filePath}`);
    return true;
  }

  const manifest = readManifest(filePath, state.gsdScope);
  const selectedRuntimes = runtimeNames.filter(
    (runtime) => state.runtimes[runtime],
  );
  const removed = removeManifestEntries(manifest, {
    runtimes: selectedRuntimes,
    includeSkills: state.tools.skills,
    dryRun: state.dryRun,
    cwd: process.cwd(),
    home: HOME,
    env: process.env,
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
