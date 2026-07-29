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

function parseLockRecord(raw: string): AriadneLockRecord {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("Ariadne lock is malformed.");
  }
  if (!value || typeof value !== "object") {
    throw new Error("Ariadne lock is malformed.");
  }
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
    throw new Error("Ariadne lock is malformed.");
  }
  return candidate as AriadneLockRecord;
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

function changedDuringRecovery(): Error {
  return new Error("Ariadne project lock changed during stale-lock recovery.");
}

function diagnosticSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function writeExclusive(lockPath: string, record: AriadneLockRecord): boolean {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  try {
    const descriptor = fs.openSync(lockPath, "wx", 0o600);
    try {
      fs.writeFileSync(descriptor, JSON.stringify(record), "utf8");
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    return true;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
}

export function acquireProjectLock(
  input: AcquireProjectLockInput,
): AriadneLockHandle {
  const record: AriadneLockRecord = {
    schemaVersion: 1,
    pid: input.pid,
    startedAt: input.now().toISOString(),
    runId: input.runId,
  };
  if (writeExclusive(input.lockPath, record))
    return createHandle(input.lockPath, record);

  const stale = parseLockRecord(fs.readFileSync(input.lockPath, "utf8"));
  if (input.isProcessAlive(stale.pid)) {
    throw new Error(`Ariadne project is already locked by PID ${stale.pid}.`);
  }

  let revalidated: AriadneLockRecord;
  try {
    revalidated = parseLockRecord(fs.readFileSync(input.lockPath, "utf8"));
  } catch {
    throw changedDuringRecovery();
  }
  if (!sameRecoveryRecord(stale, revalidated)) throw changedDuringRecovery();

  fs.mkdirSync(input.runDir, { recursive: true });
  const recoveryMarker = path.join(
    input.runDir,
    `recovered-lock-${diagnosticSegment(stale.runId)}-${randomUUID()}.json`,
  );
  try {
    fs.linkSync(input.lockPath, recoveryMarker);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw changedDuringRecovery();
    throw error;
  }

  let recoveryCandidateIsCurrent = false;
  try {
    const candidate = parseLockRecord(fs.readFileSync(recoveryMarker, "utf8"));
    const current = parseLockRecord(fs.readFileSync(input.lockPath, "utf8"));
    const candidateStat = fs.statSync(recoveryMarker);
    const currentStat = fs.statSync(input.lockPath);
    recoveryCandidateIsCurrent =
      sameRecoveryRecord(stale, candidate) &&
      sameRecoveryRecord(stale, current) &&
      candidateStat.dev === currentStat.dev &&
      candidateStat.ino === currentStat.ino;
  } catch {
    recoveryCandidateIsCurrent = false;
  }
  if (!recoveryCandidateIsCurrent) {
    fs.unlinkSync(recoveryMarker);
    throw changedDuringRecovery();
  }

  fs.unlinkSync(input.lockPath);
  if (!writeExclusive(input.lockPath, record)) {
    throw changedDuringRecovery();
  }
  return createHandle(input.lockPath, record, stale);
}

function createHandle(
  lockPath: string,
  record: AriadneLockRecord,
  recovered?: AriadneLockRecord,
): AriadneLockHandle {
  return {
    record,
    recovered,
    release() {
      try {
        const current = parseLockRecord(fs.readFileSync(lockPath, "utf8"));
        if (sameRecord(current, record)) fs.unlinkSync(lockPath);
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    },
  };
}
