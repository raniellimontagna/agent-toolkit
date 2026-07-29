import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

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

type LockTransition = {
  schemaVersion: 1;
  nextGeneration: string;
};

const ROOT_GENERATION = "root";
const GENERATION_PATTERN = /^(?:root|gen-[0-9a-f-]{36})$/;

function malformedLock(): Error {
  return new Error("Ariadne lock is malformed.");
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

function parseTransition(raw: string): LockTransition {
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
  return candidate as LockTransition;
}

function changedDuringRecovery(): Error {
  return new Error("Ariadne project lock changed during stale-lock recovery.");
}

function diagnosticSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function generationRecordPath(lockPath: string, generation: string): string {
  return path.join(lockPath, `${generation}.json`);
}

function generationTransitionPath(
  lockPath: string,
  generation: string,
): string {
  return path.join(lockPath, `${generation}.next`);
}

function ensureLockDirectory(lockPath: string): void {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  try {
    fs.mkdirSync(lockPath, { mode: 0o700 });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(lockPath);
    } catch {
      throw malformedLock();
    }
    if (!stat.isDirectory()) throw malformedLock();
  }
}

function writeCandidate(lockPath: string, value: unknown): string {
  const candidatePath = path.join(lockPath, `.candidate-${randomUUID()}.json`);
  const descriptor = fs.openSync(candidatePath, "wx", 0o600);
  try {
    fs.writeFileSync(descriptor, JSON.stringify(value), "utf8");
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  return candidatePath;
}

function removePrivateCandidate(candidatePath: string): void {
  try {
    fs.unlinkSync(candidatePath);
  } catch {
    // A candidate is private, unreachable state; failure to clean it is safe.
  }
}

/**
 * Publishes already-complete JSON with a single EEXIST-conditioned operation.
 * Only the private random candidate is unlinked; generation and transition
 * paths are immutable and are never removed or reused.
 */
function publishJsonExclusive(
  lockPath: string,
  destinationPath: string,
  value: unknown,
): boolean {
  const candidatePath = writeCandidate(lockPath, value);
  try {
    fs.linkSync(candidatePath, destinationPath);
    return true;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  } finally {
    removePrivateCandidate(candidatePath);
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

function readTransition(transitionPath: string): LockTransition | null {
  try {
    return parseTransition(fs.readFileSync(transitionPath, "utf8"));
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function findTailGeneration(lockPath: string): string {
  let generation = ROOT_GENERATION;
  const visited = new Set<string>();
  for (;;) {
    if (visited.has(generation)) throw malformedLock();
    visited.add(generation);
    const transition = readTransition(
      generationTransitionPath(lockPath, generation),
    );
    if (!transition) return generation;
    generation = transition.nextGeneration;
  }
}

function newGeneration(): string {
  return `gen-${randomUUID()}`;
}

function publishRecord(
  lockPath: string,
  generation: string,
  record: AriadneLockRecord,
): boolean {
  return publishJsonExclusive(
    lockPath,
    generationRecordPath(lockPath, generation),
    record,
  );
}

function publishTransition(
  lockPath: string,
  generation: string,
  nextGeneration: string,
): boolean {
  return publishJsonExclusive(
    lockPath,
    generationTransitionPath(lockPath, generation),
    { schemaVersion: 1, nextGeneration } satisfies LockTransition,
  );
}

function preserveStaleRecord(
  lockPath: string,
  generation: string,
  runDir: string,
  stale: AriadneLockRecord,
): void {
  fs.mkdirSync(runDir, { recursive: true });
  const recoveryMarker = path.join(
    runDir,
    `recovered-lock-${diagnosticSegment(stale.runId)}-${randomUUID()}.json`,
  );
  try {
    fs.linkSync(generationRecordPath(lockPath, generation), recoveryMarker);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw changedDuringRecovery();
    throw error;
  }
}

/**
 * `.ariadne/lock` is a persistent coordination directory. A generation record
 * is created with an atomic hard-link and is never deleted or overwritten.
 * Release and stale recovery publish an immutable `<generation>.next` link;
 * EEXIST means another owner already advanced that exact generation. This
 * removal-free protocol avoids pathname read-then-unlink races entirely.
 */
export function acquireProjectLock(
  input: AcquireProjectLockInput,
): AriadneLockHandle {
  ensureLockDirectory(input.lockPath);
  const record: AriadneLockRecord = {
    schemaVersion: 1,
    pid: input.pid,
    startedAt: input.now().toISOString(),
    runId: input.runId,
  };
  const generation = findTailGeneration(input.lockPath);
  const recordPath = generationRecordPath(input.lockPath, generation);

  if (publishRecord(input.lockPath, generation, record)) {
    return createHandle(input.lockPath, generation, record);
  }

  const stale = readRecord(recordPath);
  if (!stale) throw changedDuringRecovery();
  if (input.isProcessAlive(stale.pid)) {
    throw new Error(`Ariadne project is already locked by PID ${stale.pid}.`);
  }

  preserveStaleRecord(input.lockPath, generation, input.runDir, stale);
  const replacementGeneration = newGeneration();
  if (!publishRecord(input.lockPath, replacementGeneration, record)) {
    throw changedDuringRecovery();
  }
  if (!publishTransition(input.lockPath, generation, replacementGeneration)) {
    throw changedDuringRecovery();
  }
  return createHandle(input.lockPath, replacementGeneration, record, stale);
}

function createHandle(
  lockPath: string,
  generation: string,
  record: AriadneLockRecord,
  recovered?: AriadneLockRecord,
): AriadneLockHandle {
  return {
    record,
    recovered,
    release() {
      publishTransition(lockPath, generation, newGeneration());
    },
  };
}
