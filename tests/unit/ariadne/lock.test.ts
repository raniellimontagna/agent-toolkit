import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type AriadneLockRecord,
  acquireProjectLock,
} from "../../../src/ariadne/lock.js";
import { AriadneStateError } from "../../../src/ariadne/schema.js";

const directories: string[] = [];
const LEGACY_OWNER_TOKEN = "00000000-0000-4000-8000-000000000011";
const REPLACEMENT_OWNER_TOKEN = "00000000-0000-4000-8000-000000000012";

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

function writeLegacyLock(lockPath: string, record: AriadneLockRecord): void {
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
    ).toThrow(AriadneStateError);
    expect(readLock(params.lockPath)).toEqual(handle.record);
    handle.release();
  });

  it("rejects a malformed legacy lock without removing it", () => {
    const params = input();
    fs.mkdirSync(path.dirname(params.lockPath), { recursive: true });
    fs.writeFileSync(params.lockPath, "not json");

    expect(() => acquireProjectLock(params)).toThrow(AriadneStateError);
    expect(fs.readFileSync(params.lockPath, "utf8")).toBe("not json");
  });

  it("rejects a lock record with unknown fields without removing it", () => {
    const params = input();
    const malformed = {
      schemaVersion: 1,
      pid: 9,
      startedAt: "2026-01-01T00:00:00.000Z",
      runId: "old",
      ownerToken: "00000000-0000-4000-8000-000000000001",
      unexpected: true,
    };
    fs.mkdirSync(path.dirname(params.lockPath), { recursive: true });
    fs.writeFileSync(params.lockPath, JSON.stringify(malformed));

    expect(() => acquireProjectLock(params)).toThrow(/malformed/i);
    expect(JSON.parse(fs.readFileSync(params.lockPath, "utf8"))).toEqual(
      malformed,
    );
  });

  it("rejects a lock record without an owner token", () => {
    const params = input();
    const malformed = {
      schemaVersion: 1,
      pid: 9,
      startedAt: "2026-01-01T00:00:00.000Z",
      runId: "old",
    };
    fs.mkdirSync(path.dirname(params.lockPath), { recursive: true });
    fs.writeFileSync(params.lockPath, JSON.stringify(malformed));

    expect(() => acquireProjectLock(params)).toThrow(/malformed/i);
    expect(JSON.parse(fs.readFileSync(params.lockPath, "utf8"))).toEqual(
      malformed,
    );
  });

  it("generates a unique owner token for every acquired lock", () => {
    const first = acquireProjectLock(input());
    const second = acquireProjectLock(input());
    const firstToken = (first.record as unknown as Record<string, unknown>)
      .ownerToken;
    const secondToken = (second.record as unknown as Record<string, unknown>)
      .ownerToken;

    expect(firstToken).toMatch(/^[0-9a-f-]{36}$/i);
    expect(secondToken).toMatch(/^[0-9a-f-]{36}$/i);
    expect(secondToken).not.toBe(firstToken);
    first.release();
    second.release();
  });

  it("does not replace a legacy lock held by a live process", () => {
    const params = input({ isProcessAlive: () => true });
    const live: AriadneLockRecord = {
      schemaVersion: 1,
      pid: 9,
      startedAt: "2026-01-01T00:00:00.000Z",
      runId: "old",
      ownerToken: LEGACY_OWNER_TOKEN,
    };
    writeLegacyLock(params.lockPath, live);

    expect(() => acquireProjectLock(params)).toThrow(AriadneStateError);
    expect(readLock(params.lockPath)).toEqual(live);
    expect(fs.existsSync(params.runDir)).toBe(false);
  });

  it("retains a valid stale lock inside the private coordinator before replacement", () => {
    const params = input({ isProcessAlive: () => false });
    const stale: AriadneLockRecord = {
      schemaVersion: 1,
      pid: 9,
      startedAt: "2026-01-01T00:00:00.000Z",
      runId: "legacy-old",
      ownerToken: LEGACY_OWNER_TOKEN,
    };
    writeLegacyLock(params.lockPath, stale);

    const handle = acquireProjectLock(params);

    expect(handle.recovered).toEqual(stale);
    expect(readLock(params.lockPath)).toEqual(handle.record);
    const coordinator = path.join(
      path.dirname(params.lockPath),
      "runs",
      ".lock-coordinator",
    );
    const diagnostics = fs
      .readdirSync(coordinator)
      .filter((filename) => filename.startsWith(".public-lock-"));
    expect(diagnostics).toHaveLength(1);
    const [diagnostic] = diagnostics;
    if (!diagnostic) throw new Error("Expected a recovered lock diagnostic.");
    expect(
      JSON.parse(fs.readFileSync(path.join(coordinator, diagnostic), "utf8")),
    ).toEqual(stale);
    handle.release();
  });

  it("does not publish stale-lock evidence through a mutable run-directory pathname", () => {
    const params = input({ isProcessAlive: () => false });
    const stale: AriadneLockRecord = {
      schemaVersion: 1,
      pid: 9,
      startedAt: "2026-01-01T00:00:00.000Z",
      runId: "legacy-old",
      ownerToken: LEGACY_OWNER_TOKEN,
    };
    writeLegacyLock(params.lockPath, stale);
    const links = vi.spyOn(fs, "linkSync");

    const handle = acquireProjectLock(params);

    expect(handle.recovered).toEqual(stale);
    expect(
      links.mock.calls.some(([, destination]) =>
        destination.toString().startsWith(`${params.runDir}${path.sep}`),
      ),
    ).toBe(false);
    handle.release();
  });

  it("does not follow a substituted recovery run directory", () => {
    const params = input({ isProcessAlive: () => false });
    const stale: AriadneLockRecord = {
      schemaVersion: 1,
      pid: 9,
      startedAt: "2026-01-01T00:00:00.000Z",
      runId: "legacy-old",
      ownerToken: LEGACY_OWNER_TOKEN,
    };
    writeLegacyLock(params.lockPath, stale);
    const attackTarget = path.join(params.root, "attack-target");
    fs.mkdirSync(path.dirname(params.runDir), { recursive: true });
    fs.mkdirSync(attackTarget);
    fs.symlinkSync(
      attackTarget,
      params.runDir,
      process.platform === "win32" ? "junction" : "dir",
    );

    expect(() => acquireProjectLock(params)).toThrow(
      /run directory|symbolic link|lock path changed/i,
    );
    expect(readLock(params.lockPath)).toEqual(stale);
    expect(fs.readdirSync(attackTarget)).toEqual([]);
  });

  it("never publishes through a run directory swapped at the rename boundary", () => {
    const params = input({ isProcessAlive: () => false });
    const stale = {
      schemaVersion: 1,
      pid: 9,
      startedAt: "2026-01-01T00:00:00.000Z",
      runId: "legacy-old",
      ownerToken: "00000000-0000-4000-8000-000000000001",
    } as AriadneLockRecord;
    writeLegacyLock(params.lockPath, stale);
    const attackTarget = path.join(params.root, "attack-target");
    fs.mkdirSync(attackTarget);
    const originalRename = fs.renameSync.bind(fs);
    let swapped = false;
    vi.spyOn(fs, "renameSync").mockImplementation((source, destination) => {
      if (!swapped && source.toString() === params.lockPath) {
        swapped = true;
        originalRename(params.runDir, `${params.runDir}-displaced`);
        fs.symlinkSync(
          attackTarget,
          params.runDir,
          process.platform === "win32" ? "junction" : "dir",
        );
      }
      originalRename(source, destination);
    });

    const handle = acquireProjectLock(params);
    expect(swapped).toBe(true);
    expect(handle.recovered).toEqual(stale);
    expect(readLock(params.lockPath)).toEqual(handle.record);
    expect(fs.readdirSync(attackTarget)).toEqual([]);
    handle.release();
  });

  it("blocks an Ariadne substitution attempt at the final release move", () => {
    const params = input();
    const handle = acquireProjectLock(params);
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
            isProcessAlive: (pid) => pid === handle.record.pid,
          }),
        ).toThrow(/already locked/i);
      }
      originalRename(source, destination);
    });

    handle.release();

    expect(attempted).toBe(true);
    expect(fs.existsSync(params.lockPath)).toBe(false);
  });

  it("preserves a successor injected at the final release unlink", () => {
    const params = input();
    const handle = acquireProjectLock(params);
    const successor = {
      schemaVersion: 1,
      pid: 4321,
      startedAt: "2026-07-29T01:00:00.000Z",
      runId: "run-successor",
      ownerToken: "00000000-0000-4000-8000-000000000002",
    } as AriadneLockRecord;
    const displaced = `${params.lockPath}.released-owner`;
    const originalRename = fs.renameSync.bind(fs);
    const originalUnlink = fs.unlinkSync.bind(fs);
    let injected = false;
    vi.spyOn(fs, "unlinkSync").mockImplementation((filename) => {
      if (!injected) {
        injected = true;
        if (fs.existsSync(params.lockPath)) {
          originalRename(params.lockPath, displaced);
        }
        fs.writeFileSync(params.lockPath, JSON.stringify(successor), {
          flag: "wx",
          mode: 0o600,
        });
      }
      originalUnlink(filename);
    });

    handle.release();

    expect(injected).toBe(true);
    expect(readLock(params.lockPath)).toEqual(successor);
  });

  it("restores its owned lock when private release cleanup fails", () => {
    const params = input();
    const handle = acquireProjectLock(params);
    const originalUnlink = fs.unlinkSync.bind(fs);
    let failed = false;
    vi.spyOn(fs, "unlinkSync").mockImplementation((filename) => {
      if (!failed && filename.toString().includes(".public-lock-")) {
        failed = true;
        throw Object.assign(new Error("injected cleanup failure"), {
          code: "EACCES",
        });
      }
      originalUnlink(filename);
    });

    expect(() => handle.release()).toThrow(/injected cleanup failure/i);

    expect(failed).toBe(true);
    expect(readLock(params.lockPath)).toEqual(handle.record);
  });

  it("does not overwrite a successor while restoring after cleanup failure", () => {
    const params = input();
    const handle = acquireProjectLock(params);
    const successor: AriadneLockRecord = {
      schemaVersion: 1,
      pid: 4321,
      startedAt: "2026-07-29T01:00:00.000Z",
      runId: "run-successor",
      ownerToken: "00000000-0000-4000-8000-000000000004",
    };
    const originalUnlink = fs.unlinkSync.bind(fs);
    let failed = false;
    vi.spyOn(fs, "unlinkSync").mockImplementation((filename) => {
      if (!failed && filename.toString().includes(".public-lock-")) {
        failed = true;
        fs.writeFileSync(params.lockPath, JSON.stringify(successor), {
          flag: "wx",
          mode: 0o600,
        });
        throw Object.assign(new Error("injected cleanup failure"), {
          code: "EACCES",
        });
      }
      originalUnlink(filename);
    });

    expect(() => handle.release()).toThrow(/injected cleanup failure/i);

    expect(failed).toBe(true);
    expect(readLock(params.lockPath)).toEqual(successor);
  });

  it("refuses to release through a substituted Ariadne directory ancestor", () => {
    const params = input();
    const handle = acquireProjectLock(params);
    const ariadneRoot = path.dirname(params.lockPath);
    const originalRoot = `${ariadneRoot}-original`;
    const attackRoot = path.join(params.root, "attack-target");
    fs.mkdirSync(path.join(attackRoot, "runs", ".lock-coordinator"), {
      recursive: true,
    });
    const attackLock = path.join(attackRoot, "lock");
    fs.writeFileSync(attackLock, JSON.stringify(handle.record), "utf8");
    fs.renameSync(ariadneRoot, originalRoot);
    fs.symlinkSync(
      attackRoot,
      ariadneRoot,
      process.platform === "win32" ? "junction" : "dir",
    );

    expect(() => handle.release()).toThrow(/lock path changed|symbolic link/i);
    expect(fs.existsSync(attackLock)).toBe(true);
    expect(
      fs.existsSync(
        path.join(attackRoot, "runs", ".lock-coordinator", "root.next"),
      ),
    ).toBe(false);
  });

  it("blocks an Ariadne substitution attempt at the final recovery boundary", () => {
    const params = input({ isProcessAlive: () => false });
    const stale: AriadneLockRecord = {
      schemaVersion: 1,
      pid: 9,
      startedAt: "2026-01-01T00:00:00.000Z",
      runId: "legacy-old",
      ownerToken: LEGACY_OWNER_TOKEN,
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

  it("restores a live replacement injected at the recovery rename boundary", () => {
    const replacement: AriadneLockRecord = {
      schemaVersion: 1,
      pid: 10,
      startedAt: "2026-07-29T01:00:00.000Z",
      runId: "run-live-replacement",
      ownerToken: REPLACEMENT_OWNER_TOKEN,
    };
    const params = input({
      isProcessAlive: (pid) => pid === replacement.pid,
    });
    const stale: AriadneLockRecord = {
      schemaVersion: 1,
      pid: 9,
      startedAt: "2026-01-01T00:00:00.000Z",
      runId: "legacy-old",
      ownerToken: LEGACY_OWNER_TOKEN,
    };
    writeLegacyLock(params.lockPath, stale);
    const originalRename = fs.renameSync.bind(fs);
    let injected = false;
    vi.spyOn(fs, "renameSync").mockImplementation((source, destination) => {
      if (!injected && source.toString() === params.lockPath) {
        injected = true;
        const candidate = `${params.lockPath}.live-replacement`;
        fs.writeFileSync(candidate, JSON.stringify(replacement), {
          flag: "wx",
          mode: 0o600,
        });
        originalRename(candidate, params.lockPath);
      }
      originalRename(source, destination);
    });

    expect(() => acquireProjectLock(params)).toThrow(/changed.*recovery/i);

    expect(injected).toBe(true);
    expect(readLock(params.lockPath)).toEqual(replacement);
    expect(fs.statSync(params.lockPath).mode & 0o777).toBe(0o600);
  });

  it("conditionally releases only a still-matching public record", () => {
    const params = input();
    const handle = acquireProjectLock(params);
    const replacement: AriadneLockRecord = {
      schemaVersion: 1,
      pid: 4321,
      startedAt: "2026-07-29T01:00:00.000Z",
      runId: "run-replacement",
      ownerToken: REPLACEMENT_OWNER_TOKEN,
    };
    fs.writeFileSync(params.lockPath, JSON.stringify(replacement));

    expect(() => handle.release()).toThrow(/lock path changed/i);

    expect(readLock(params.lockPath)).toEqual(replacement);
  });

  it("does not release a same-pid/run lock whose complete record changed", () => {
    const params = input();
    const handle = acquireProjectLock(params);
    const replacement: AriadneLockRecord = {
      ...handle.record,
      startedAt: "2026-07-29T01:00:00.000Z",
    };
    fs.writeFileSync(params.lockPath, JSON.stringify(replacement));

    expect(() => handle.release()).toThrow(/lock path changed/i);

    expect(readLock(params.lockPath)).toEqual(replacement);
  });

  it("does not release a lock whose owner token changed in place", () => {
    const params = input();
    const handle = acquireProjectLock(params);
    const replacement = {
      ...handle.record,
      ownerToken: "00000000-0000-4000-8000-000000000003",
    } as AriadneLockRecord;
    fs.writeFileSync(params.lockPath, JSON.stringify(replacement));

    expect(() => handle.release()).toThrow(/lock path changed/i);

    expect(readLock(params.lockPath)).toEqual(replacement);
  });

  it("detects a replaced runs-root identity before publication", () => {
    const params = input();
    const handle = acquireProjectLock(params);
    const runsRoot = path.dirname(params.runDir);
    const displacedRuns = `${runsRoot}-displaced`;
    fs.renameSync(runsRoot, displacedRuns);
    fs.mkdirSync(runsRoot);

    expect(() => handle.assertIntegrity()).toThrow(/lock path changed/i);
    expect(() => handle.release()).toThrow(/lock path changed/i);
    expect(fs.existsSync(params.lockPath)).toBe(true);
  });

  it("exposes an integrity check for a replaced public lock inode", () => {
    const params = input();
    const handle = acquireProjectLock(params);
    const originalLock = `${params.lockPath}.original`;
    fs.renameSync(params.lockPath, originalLock);
    fs.writeFileSync(params.lockPath, JSON.stringify(handle.record), {
      flag: "wx",
      mode: 0o600,
    });

    expect(() => handle.assertIntegrity()).toThrow(AriadneStateError);
    expect(readLock(params.lockPath)).toEqual(handle.record);
  });
});
