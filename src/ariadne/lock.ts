import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { AriadneStateError } from "./schema.js";

export type AriadneLockRecord = {
  schemaVersion: 1;
  pid: number;
  startedAt: string;
  runId: string;
};

export type AriadneLockHandle = {
  record: AriadneLockRecord;
  recovered?: AriadneLockRecord;
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

const ROOT_GENERATION = "root";
const GENERATION_PATTERN = /^(?:root|gen-[0-9a-f-]{36})$/;

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
    candidate.schemaVersion !== 1 ||
    !Number.isSafeInteger(candidate.pid) ||
    typeof candidate.pid !== "number" ||
    candidate.pid <= 0 ||
    typeof candidate.startedAt !== "string" ||
    Number.isNaN(Date.parse(candidate.startedAt)) ||
    typeof candidate.runId !== "string" ||
    !candidate.runId
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

function sameRecoveryRecord(
  a: AriadneLockRecord,
  b: AriadneLockRecord,
): boolean {
  return (
    sameRecord(a, b) &&
    a.schemaVersion === b.schemaVersion &&
    a.startedAt === b.startedAt
  );
}

function coordinatorPath(lockPath: string): string {
  return `${lockPath}.coordinator`;
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

function ensureCoordinatorDirectory(lockPath: string): string {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const coordinator = coordinatorPath(lockPath);
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
    if (!stat.isDirectory()) throw malformedLock();
  }
  return coordinator;
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

function diagnosticSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function restoreMovedPublicLock(
  lockPath: string,
  recoveryMarker: string,
): void {
  try {
    fs.linkSync(recoveryMarker, lockPath);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return;
    throw error;
  }
  fs.unlinkSync(recoveryMarker);
}

function recoverPublicLock(
  input: AcquireProjectLockInput,
  stale: AriadneLockRecord,
): void {
  fs.mkdirSync(input.runDir, { recursive: true });
  const recoveryMarker = path.join(
    input.runDir,
    `recovered-lock-${diagnosticSegment(stale.runId)}-${randomUUID()}.json`,
  );
  try {
    fs.renameSync(input.lockPath, recoveryMarker);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw changedDuringRecovery();
    throw error;
  }
  let recovered: AriadneLockRecord;
  try {
    recovered = parseLockRecord(fs.readFileSync(recoveryMarker, "utf8"));
  } catch {
    restoreMovedPublicLock(input.lockPath, recoveryMarker);
    throw changedDuringRecovery();
  }
  if (!sameRecoveryRecord(recovered, stale)) {
    restoreMovedPublicLock(input.lockPath, recoveryMarker);
    throw changedDuringRecovery();
  }
}

export function acquireProjectLock(
  input: AcquireProjectLockInput,
): AriadneLockHandle {
  const coordinator = ensureCoordinatorDirectory(input.lockPath);
  const record: AriadneLockRecord = {
    schemaVersion: 1,
    pid: input.pid,
    startedAt: input.now().toISOString(),
    runId: input.runId,
  };
  const generation = claimCoordinator(
    coordinator,
    record,
    input.isProcessAlive,
  );

  try {
    if (writePublicLockExclusive(input.lockPath, record)) {
      return createHandle(input.lockPath, coordinator, generation, record);
    }

    const existing = readPublicLock(input.lockPath);
    if (!existing) throw changedDuringRecovery();
    if (sameRecord(existing, record)) {
      return createHandle(input.lockPath, coordinator, generation, record);
    }
    if (input.isProcessAlive(existing.pid)) {
      throw contendedLock(existing.pid);
    }

    recoverPublicLock(input, existing);
    if (!writePublicLockExclusive(input.lockPath, record)) {
      throw changedDuringRecovery();
    }
    return createHandle(
      input.lockPath,
      coordinator,
      generation,
      record,
      existing,
    );
  } catch (error) {
    releaseCoordinator(coordinator, generation);
    throw error;
  }
}

function createHandle(
  lockPath: string,
  coordinator: string,
  generation: string,
  record: AriadneLockRecord,
  recovered?: AriadneLockRecord,
): AriadneLockHandle {
  return {
    record,
    recovered,
    release() {
      if (findTailGeneration(coordinator) !== generation) return;
      try {
        const current = readPublicLock(lockPath);
        if (current && sameRecord(current, record)) fs.unlinkSync(lockPath);
      } finally {
        releaseCoordinator(coordinator, generation);
      }
    },
  };
}
