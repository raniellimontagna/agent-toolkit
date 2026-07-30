import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { AriadneStateError } from "./schema.js";

export type AriadneLockRecord = {
  schemaVersion: 1;
  pid: number;
  startedAt: string;
  runId: string;
  ownerToken: string;
};

export type AriadneLockHandle = {
  record: AriadneLockRecord;
  recovered?: AriadneLockRecord;
  assertIntegrity(): void;
  release(): void;
};

export type AcquireProjectLockInput = {
  lockPath: string;
  runId: string;
  runDir: string;
  pid: number;
  now: () => Date;
  isProcessAlive: (pid: number) => boolean;
};

type CoordinatorTransition = {
  schemaVersion: 1;
  nextGeneration: string;
};

type PathIdentity = {
  source: string;
  kind: "directory" | "file";
  device: number;
  inode: number;
};

type CoordinatorBoundary = {
  stateRoot: string;
  runsRoot: string;
  coordinator: string;
  directories: PathIdentity[];
};

type PrivateLock = {
  source: string;
  identity: PathIdentity;
  record: AriadneLockRecord;
};

const ROOT_GENERATION = "root";
const GENERATION_PATTERN = /^(?:root|gen-[0-9a-f-]{36})$/;
const OWNER_TOKEN_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hasExactKeys(
  candidate: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(candidate);
  return (
    keys.length === expected.length &&
    expected.every((key) => Object.hasOwn(candidate, key))
  );
}

function lockStateError(message: string): AriadneStateError {
  return new AriadneStateError(".ariadne/lock", message);
}

function malformedLock(): AriadneStateError {
  return lockStateError("Ariadne lock is malformed.");
}

function changedDuringRecovery(): AriadneStateError {
  return lockStateError(
    "Ariadne project lock changed during stale-lock recovery.",
  );
}

function changedLockPath(): AriadneStateError {
  return lockStateError(
    "Ariadne lock path changed or became a symbolic link during the run.",
  );
}

function captureIdentity(
  source: string,
  kind: "directory" | "file",
): PathIdentity {
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(source);
  } catch {
    throw changedLockPath();
  }
  if (
    stat.isSymbolicLink() ||
    (kind === "directory" ? !stat.isDirectory() : !stat.isFile()) ||
    (kind === "file" && stat.nlink !== 1)
  ) {
    throw changedLockPath();
  }
  return { source, kind, device: stat.dev, inode: stat.ino };
}

function assertIdentity(identity: PathIdentity): void {
  const current = captureIdentity(identity.source, identity.kind);
  if (current.device !== identity.device || current.inode !== identity.inode) {
    throw changedLockPath();
  }
}

function assertLinkedFileIdentity(
  source: string,
  identity: PathIdentity,
  links: number,
): void {
  let current: fs.Stats;
  try {
    current = fs.lstatSync(source);
  } catch {
    throw changedLockPath();
  }
  if (
    current.isSymbolicLink() ||
    !current.isFile() ||
    current.dev !== identity.device ||
    current.ino !== identity.inode ||
    current.nlink !== links
  ) {
    throw changedLockPath();
  }
}

function sameIdentity(a: PathIdentity, b: PathIdentity): boolean {
  return a.device === b.device && a.inode === b.inode;
}

function contendedLock(pid: number): AriadneStateError {
  return lockStateError(`Ariadne project is already locked by PID ${pid}.`);
}

function parseLockRecord(raw: string): AriadneLockRecord {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw malformedLock();
  }
  if (!value || typeof value !== "object") throw malformedLock();
  const candidate = value as Record<string, unknown>;
  if (
    !hasExactKeys(candidate, [
      "schemaVersion",
      "pid",
      "startedAt",
      "runId",
      "ownerToken",
    ]) ||
    candidate.schemaVersion !== 1 ||
    !Number.isSafeInteger(candidate.pid) ||
    typeof candidate.pid !== "number" ||
    candidate.pid <= 0 ||
    typeof candidate.startedAt !== "string" ||
    Number.isNaN(Date.parse(candidate.startedAt)) ||
    typeof candidate.runId !== "string" ||
    !candidate.runId ||
    typeof candidate.ownerToken !== "string" ||
    !OWNER_TOKEN_PATTERN.test(candidate.ownerToken)
  ) {
    throw malformedLock();
  }
  return candidate as AriadneLockRecord;
}

function parseTransition(raw: string): CoordinatorTransition {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw malformedLock();
  }
  if (!value || typeof value !== "object") throw malformedLock();
  const candidate = value as Record<string, unknown>;
  if (
    !hasExactKeys(candidate, ["schemaVersion", "nextGeneration"]) ||
    candidate.schemaVersion !== 1 ||
    typeof candidate.nextGeneration !== "string" ||
    !GENERATION_PATTERN.test(candidate.nextGeneration) ||
    candidate.nextGeneration === ROOT_GENERATION
  ) {
    throw malformedLock();
  }
  return candidate as CoordinatorTransition;
}

function sameRecord(a: AriadneLockRecord, b: AriadneLockRecord): boolean {
  return a.pid === b.pid && a.runId === b.runId;
}

function sameCompleteRecord(
  a: AriadneLockRecord,
  b: AriadneLockRecord,
): boolean {
  return (
    sameRecord(a, b) &&
    a.schemaVersion === b.schemaVersion &&
    a.startedAt === b.startedAt &&
    a.ownerToken === b.ownerToken
  );
}

function coordinatorPath(lockPath: string): string {
  return path.join(path.dirname(lockPath), "runs", ".lock-coordinator");
}

function generationRecordPath(coordinator: string, generation: string): string {
  return path.join(coordinator, `${generation}.json`);
}

function generationTransitionPath(
  coordinator: string,
  generation: string,
): string {
  return path.join(coordinator, `${generation}.next`);
}

function ensureCoordinatorDirectory(lockPath: string): CoordinatorBoundary {
  const stateRoot = path.dirname(lockPath);
  fs.mkdirSync(stateRoot, { recursive: true });
  const stateIdentity = captureIdentity(stateRoot, "directory");
  const coordinator = coordinatorPath(lockPath);
  const runsRoot = path.dirname(coordinator);
  fs.mkdirSync(runsRoot, { recursive: true, mode: 0o700 });
  const runsIdentity = captureIdentity(runsRoot, "directory");
  try {
    fs.mkdirSync(coordinator, { mode: 0o700 });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(coordinator);
    } catch {
      throw malformedLock();
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw malformedLock();
  }
  return {
    stateRoot,
    runsRoot,
    coordinator,
    directories: [
      stateIdentity,
      runsIdentity,
      captureIdentity(coordinator, "directory"),
    ],
  };
}

function assertCoordinatorBoundary(boundary: CoordinatorBoundary): void {
  for (const identity of boundary.directories) assertIdentity(identity);
}

function ensureRecoveryRunDirectory(
  runDir: string,
  boundary: CoordinatorBoundary,
): PathIdentity {
  const resolvedRunDir = path.resolve(runDir);
  if (
    path.dirname(resolvedRunDir) !== path.resolve(boundary.runsRoot) ||
    resolvedRunDir === path.resolve(boundary.coordinator)
  ) {
    throw lockStateError(
      "Ariadne recovery run directory must be a direct child of .ariadne/runs.",
    );
  }

  assertCoordinatorBoundary(boundary);
  try {
    fs.mkdirSync(resolvedRunDir, { mode: 0o700 });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const identity = captureIdentity(resolvedRunDir, "directory");
  assertCoordinatorBoundary(boundary);
  return identity;
}

function writeCandidate(coordinator: string, value: unknown): string {
  const candidatePath = path.join(
    coordinator,
    `.candidate-${randomUUID()}.json`,
  );
  const descriptor = fs.openSync(candidatePath, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, JSON.stringify(value), "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  return candidatePath;
}

function publishJsonExclusive(
  coordinator: string,
  destinationPath: string,
  value: unknown,
): boolean {
  const candidatePath = writeCandidate(coordinator, value);
  try {
    fs.linkSync(candidatePath, destinationPath);
    return true;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  } finally {
    try {
      fs.unlinkSync(candidatePath);
    } catch {
      // Private candidates are unreachable coordinator state.
    }
  }
}

function readRecord(recordPath: string): AriadneLockRecord | null {
  try {
    return parseLockRecord(fs.readFileSync(recordPath, "utf8"));
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function readTransition(transitionPath: string): CoordinatorTransition | null {
  try {
    return parseTransition(fs.readFileSync(transitionPath, "utf8"));
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function findTailGeneration(coordinator: string): string {
  let generation = ROOT_GENERATION;
  const visited = new Set<string>();
  for (;;) {
    if (visited.has(generation)) throw malformedLock();
    visited.add(generation);
    const transition = readTransition(
      generationTransitionPath(coordinator, generation),
    );
    if (!transition) return generation;
    generation = transition.nextGeneration;
  }
}

function newGeneration(): string {
  return `gen-${randomUUID()}`;
}

function publishRecord(
  coordinator: string,
  generation: string,
  record: AriadneLockRecord,
): boolean {
  return publishJsonExclusive(
    coordinator,
    generationRecordPath(coordinator, generation),
    record,
  );
}

function publishTransition(
  coordinator: string,
  generation: string,
  nextGeneration: string,
): boolean {
  return publishJsonExclusive(
    coordinator,
    generationTransitionPath(coordinator, generation),
    { schemaVersion: 1, nextGeneration } satisfies CoordinatorTransition,
  );
}

function claimCoordinator(
  coordinator: string,
  record: AriadneLockRecord,
  isProcessAlive: (pid: number) => boolean,
): string {
  const generation = findTailGeneration(coordinator);
  const current = readRecord(generationRecordPath(coordinator, generation));
  if (!current) {
    if (publishRecord(coordinator, generation, record)) return generation;
    return claimCoordinator(coordinator, record, isProcessAlive);
  }
  if (isProcessAlive(current.pid)) {
    throw contendedLock(current.pid);
  }

  const replacementGeneration = newGeneration();
  if (!publishRecord(coordinator, replacementGeneration, record)) {
    throw changedDuringRecovery();
  }
  if (!publishTransition(coordinator, generation, replacementGeneration)) {
    throw changedDuringRecovery();
  }
  return replacementGeneration;
}

function releaseCoordinator(coordinator: string, generation: string): void {
  if (findTailGeneration(coordinator) !== generation) return;
  publishTransition(coordinator, generation, newGeneration());
}

function writePublicLockExclusive(
  lockPath: string,
  record: AriadneLockRecord,
): boolean {
  let descriptor: number;
  try {
    descriptor = fs.openSync(lockPath, "wx", 0o600);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
  try {
    fs.writeFileSync(descriptor, JSON.stringify(record), "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  return true;
}

function readPublicLock(lockPath: string): AriadneLockRecord | null {
  try {
    return parseLockRecord(fs.readFileSync(lockPath, "utf8"));
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function privateLockPath(boundary: CoordinatorBoundary): string {
  return path.join(boundary.coordinator, `.public-lock-${randomUUID()}.json`);
}

function restorePrivateLock(
  lockPath: string,
  privateLock: Pick<PrivateLock, "source" | "identity">,
  boundary: CoordinatorBoundary,
): void {
  assertCoordinatorBoundary(boundary);
  assertIdentity(privateLock.identity);
  try {
    fs.linkSync(privateLock.source, lockPath);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return;
    throw error;
  }
  assertCoordinatorBoundary(boundary);
  assertLinkedFileIdentity(privateLock.source, privateLock.identity, 2);
  assertLinkedFileIdentity(lockPath, privateLock.identity, 2);
  fs.unlinkSync(privateLock.source);
}

function moveExpectedPublicLock(
  lockPath: string,
  expectedRecord: AriadneLockRecord,
  boundary: CoordinatorBoundary,
  expectedIdentity?: PathIdentity,
): PrivateLock {
  assertCoordinatorBoundary(boundary);
  const privatePath = privateLockPath(boundary);
  try {
    fs.renameSync(lockPath, privatePath);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw changedLockPath();
    }
    throw error;
  }

  assertCoordinatorBoundary(boundary);
  const identity = captureIdentity(privatePath, "file");
  let record: AriadneLockRecord;
  try {
    const parsed = readPublicLock(privatePath);
    if (!parsed) throw changedLockPath();
    record = parsed;
  } catch (error) {
    restorePrivateLock(lockPath, { source: privatePath, identity }, boundary);
    throw error;
  }
  const privateLock = { source: privatePath, identity, record };
  if (
    (expectedIdentity && !sameIdentity(identity, expectedIdentity)) ||
    !sameCompleteRecord(record, expectedRecord)
  ) {
    restorePrivateLock(lockPath, privateLock, boundary);
    throw changedDuringRecovery();
  }
  return privateLock;
}

function assertPrivateLock(
  privateLock: PrivateLock,
  boundary: CoordinatorBoundary,
): void {
  assertCoordinatorBoundary(boundary);
  assertIdentity(privateLock.identity);
  const current = readPublicLock(privateLock.source);
  if (!current || !sameCompleteRecord(current, privateLock.record)) {
    throw changedLockPath();
  }
}

function recoverPublicLock(
  input: AcquireProjectLockInput,
  stale: AriadneLockRecord,
  boundary: CoordinatorBoundary,
): PrivateLock {
  // Validate the requested run directory before moving the public lock, but do
  // not publish recovery evidence through that mutable pathname. The moved
  // file itself remains durable inside the pinned private coordinator.
  ensureRecoveryRunDirectory(input.runDir, boundary);
  const publicIdentity = captureIdentity(input.lockPath, "file");
  const privateLock = moveExpectedPublicLock(
    input.lockPath,
    stale,
    boundary,
    publicIdentity,
  );
  try {
    assertPrivateLock(privateLock, boundary);
    return privateLock;
  } catch (error) {
    restorePrivateLock(input.lockPath, privateLock, boundary);
    throw error;
  }
}

export function acquireProjectLock(
  input: AcquireProjectLockInput,
): AriadneLockHandle {
  const boundary = ensureCoordinatorDirectory(input.lockPath);
  const { coordinator } = boundary;
  const record: AriadneLockRecord = {
    schemaVersion: 1,
    pid: input.pid,
    startedAt: input.now().toISOString(),
    runId: input.runId,
    ownerToken: randomUUID(),
  };
  const generation = claimCoordinator(
    coordinator,
    record,
    input.isProcessAlive,
  );

  try {
    if (writePublicLockExclusive(input.lockPath, record)) {
      return createHandle(input.lockPath, boundary, generation, record);
    }

    const existing = readPublicLock(input.lockPath);
    if (!existing) throw changedDuringRecovery();
    if (sameCompleteRecord(existing, record)) {
      return createHandle(input.lockPath, boundary, generation, record);
    }
    if (input.isProcessAlive(existing.pid)) {
      throw contendedLock(existing.pid);
    }

    const recoveredPrivate = recoverPublicLock(input, existing, boundary);
    try {
      if (!writePublicLockExclusive(input.lockPath, record)) {
        restorePrivateLock(input.lockPath, recoveredPrivate, boundary);
        throw changedDuringRecovery();
      }
    } catch (error) {
      restorePrivateLock(input.lockPath, recoveredPrivate, boundary);
      throw error;
    }
    return createHandle(input.lockPath, boundary, generation, record, existing);
  } catch (error) {
    assertCoordinatorBoundary(boundary);
    releaseCoordinator(coordinator, generation);
    throw error;
  }
}

function createHandle(
  lockPath: string,
  boundary: CoordinatorBoundary,
  generation: string,
  record: AriadneLockRecord,
  recovered?: AriadneLockRecord,
): AriadneLockHandle {
  const lockIdentity = captureIdentity(lockPath, "file");
  const assertIntegrity = () => {
    assertCoordinatorBoundary(boundary);
    assertIdentity(lockIdentity);
    const current = readPublicLock(lockPath);
    if (!current || !sameCompleteRecord(current, record)) {
      throw changedLockPath();
    }
  };
  return {
    record,
    recovered,
    assertIntegrity,
    release() {
      assertIntegrity();
      const { coordinator } = boundary;
      if (findTailGeneration(coordinator) !== generation) return;
      try {
        const privateLock = moveExpectedPublicLock(
          lockPath,
          record,
          boundary,
          lockIdentity,
        );
        try {
          assertPrivateLock(privateLock, boundary);
          fs.unlinkSync(privateLock.source);
        } catch (error) {
          restorePrivateLock(lockPath, privateLock, boundary);
          throw error;
        }
      } finally {
        releaseCoordinator(coordinator, generation);
      }
    },
  };
}
