import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type AriadneLockRecord,
  acquireProjectLock,
} from "../../../src/ariadne/lock.js";

const directories: string[] = [];

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ariadne-lock-"));
  directories.push(root);
  return {
    root,
    lockPath: path.join(root, ".ariadne", "lock"),
    runDir: path.join(root, ".ariadne", "runs", "new"),
  };
}

function input(
  overrides: Partial<Parameters<typeof acquireProjectLock>[0]> = {},
) {
  const files = fixture();
  return {
    ...files,
    runId: "run-new",
    pid: 1234,
    now: () => new Date("2026-07-29T00:00:00.000Z"),
    isProcessAlive: () => false,
    ...overrides,
  };
}

function writeLegacyLock(
  lockPath: string,
  record: AriadneLockRecord,
): void {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.writeFileSync(lockPath, JSON.stringify(record), {
    flag: "wx",
    mode: 0o600,
  });
}

function readLock(lockPath: string): AriadneLockRecord {
  return JSON.parse(fs.readFileSync(lockPath, "utf8"));
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

describe("acquireProjectLock", () => {
  it("creates the documented path as an exclusive JSON file", () => {
    const params = input();
    const originalOpen = fs.openSync.bind(fs);
    const open = vi
      .spyOn(fs, "openSync")
      .mockImplementation((...args: Parameters<typeof fs.openSync>) =>
        originalOpen(...args),
      );

    const handle = acquireProjectLock(params);

    expect(fs.lstatSync(params.lockPath).isFile()).toBe(true);
    expect(readLock(params.lockPath)).toEqual(handle.record);
    expect(open).toHaveBeenCalledWith(params.lockPath, "wx", 0o600);
    handle.release();
    expect(fs.existsSync(params.lockPath)).toBe(false);
  });

  it("rejects live contention without changing the public lock", () => {
    const params = input();
    const handle = acquireProjectLock(params);

    expect(() =>
      acquireProjectLock({
        ...params,
        runId: "run-other",
        pid: 4321,
        isProcessAlive: (pid) => pid === handle.record.pid,
      }),
    ).toThrow(/already locked/i);
    expect(readLock(params.lockPath)).toEqual(handle.record);
    handle.release();
  });

  it("rejects a malformed legacy lock without removing it", () => {
    const params = input();
    fs.mkdirSync(path.dirname(params.lockPath), { recursive: true });
    fs.writeFileSync(params.lockPath, "not json");

    expect(() => acquireProjectLock(params)).toThrow(/malformed/i);
    expect(fs.readFileSync(params.lockPath, "utf8")).toBe("not json");
  });

  it("does not replace a legacy lock held by a live process", () => {
    const params = input({ isProcessAlive: () => true });
    const live: AriadneLockRecord = {
      schemaVersion: 1,
      pid: 9,
      startedAt: "2026-01-01T00:00:00.000Z",
      runId: "old",
    };
    writeLegacyLock(params.lockPath, live);

    expect(() => acquireProjectLock(params)).toThrow(/already locked/i);
    expect(readLock(params.lockPath)).toEqual(live);
    expect(fs.existsSync(params.runDir)).toBe(false);
  });

  it("renames a valid legacy stale file into the run directory before replacement", () => {
    const params = input({ isProcessAlive: () => false });
    const stale: AriadneLockRecord = {
      schemaVersion: 1,
      pid: 9,
      startedAt: "2026-01-01T00:00:00.000Z",
      runId: "legacy-old",
    };
    writeLegacyLock(params.lockPath, stale);

    const handle = acquireProjectLock(params);

    expect(handle.recovered).toEqual(stale);
    expect(readLock(params.lockPath)).toEqual(handle.record);
    const diagnostics = fs
      .readdirSync(params.runDir)
      .filter((filename) => filename.startsWith("recovered-lock-"));
    expect(diagnostics).toHaveLength(1);
    expect(
      JSON.parse(
        fs.readFileSync(path.join(params.runDir, diagnostics[0]!), "utf8"),
      ),
    ).toEqual(stale);
    handle.release();
  });

  it("blocks an Ariadne substitution attempt at the final release boundary", () => {
    const params = input();
    const handle = acquireProjectLock(params);
    const originalUnlink = fs.unlinkSync.bind(fs);
    let attempted = false;
    vi.spyOn(fs, "unlinkSync").mockImplementation((filename) => {
      if (!attempted && filename.toString() === params.lockPath) {
        attempted = true;
        expect(() =>
          acquireProjectLock({
            ...params,
            runId: "run-replacement",
            pid: 4321,
            isProcessAlive: (pid) => pid === handle.record.pid,
          }),
        ).toThrow(/already locked/i);
      }
      originalUnlink(filename);
    });

    handle.release();

    expect(attempted).toBe(true);
    expect(fs.existsSync(params.lockPath)).toBe(false);
  });

  it("blocks an Ariadne substitution attempt at the final recovery boundary", () => {
    const params = input({ isProcessAlive: () => false });
    const stale: AriadneLockRecord = {
      schemaVersion: 1,
      pid: 9,
      startedAt: "2026-01-01T00:00:00.000Z",
      runId: "legacy-old",
    };
    writeLegacyLock(params.lockPath, stale);
    const originalRename = fs.renameSync.bind(fs);
    let attempted = false;
    vi.spyOn(fs, "renameSync").mockImplementation((source, destination) => {
      if (!attempted && source.toString() === params.lockPath) {
        attempted = true;
        expect(() =>
          acquireProjectLock({
            ...params,
            runId: "run-replacement",
            pid: 4321,
            isProcessAlive: (pid) => pid === params.pid,
          }),
        ).toThrow(/already locked/i);
      }
      originalRename(source, destination);
    });

    const handle = acquireProjectLock(params);

    expect(attempted).toBe(true);
    expect(readLock(params.lockPath)).toEqual(handle.record);
    handle.release();
  });

  it("conditionally releases only a still-matching public record", () => {
    const params = input();
    const handle = acquireProjectLock(params);
    const replacement: AriadneLockRecord = {
      schemaVersion: 1,
      pid: 4321,
      startedAt: "2026-07-29T01:00:00.000Z",
      runId: "run-replacement",
    };
    fs.writeFileSync(params.lockPath, JSON.stringify(replacement));

    handle.release();

    expect(readLock(params.lockPath)).toEqual(replacement);
  });
});
