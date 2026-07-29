import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { acquireProjectLock } from "../../../src/ariadne/lock.js";

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

afterEach(() => {
  for (const directory of directories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

describe("acquireProjectLock", () => {
  it("creates an exclusive lock and releases only its own record", () => {
    const params = input();
    const handle = acquireProjectLock(params);
    expect(JSON.parse(fs.readFileSync(params.lockPath, "utf8"))).toEqual(
      handle.record,
    );
    expect(() =>
      acquireProjectLock({
        ...params,
        runId: "run-other",
        isProcessAlive: () => true,
      }),
    ).toThrow(/already locked/i);
    handle.release();
    expect(fs.existsSync(params.lockPath)).toBe(false);
  });

  it("rejects a malformed existing lock without removing it", () => {
    const params = input({ isProcessAlive: () => false });
    fs.mkdirSync(path.dirname(params.lockPath), { recursive: true });
    fs.writeFileSync(params.lockPath, "not json");
    expect(() => acquireProjectLock(params)).toThrow(/malformed/i);
    expect(fs.readFileSync(params.lockPath, "utf8")).toBe("not json");
  });

  it("does not replace a lock held by a live process", () => {
    const params = input({ isProcessAlive: () => true });
    fs.mkdirSync(path.dirname(params.lockPath), { recursive: true });
    fs.writeFileSync(
      params.lockPath,
      JSON.stringify({
        schemaVersion: 1,
        pid: 9,
        startedAt: "2026-01-01T00:00:00.000Z",
        runId: "old",
      }),
    );
    expect(() => acquireProjectLock(params)).toThrow(/already locked/i);
  });

  it("preserves a verified stale record in the new run directory before recovery", () => {
    const params = input({ isProcessAlive: () => false });
    const stale = {
      schemaVersion: 1,
      pid: 9,
      startedAt: "2026-01-01T00:00:00.000Z",
      runId: "old",
    };
    fs.mkdirSync(path.dirname(params.lockPath), { recursive: true });
    fs.writeFileSync(params.lockPath, JSON.stringify(stale));
    const handle = acquireProjectLock(params);
    expect(handle.recovered).toEqual(stale);
    expect(
      fs.readFileSync(path.join(params.runDir, "recovered-lock.json"), "utf8"),
    ).toContain('"runId":"old"');
    handle.release();
  });
});
