import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type AriadneLockRecord,
  acquireProjectLock,
} from "../../../src/ariadne/lock.js";

const directories: string[] = [];
const ROOT_GENERATION = "root";
const REPLACEMENT_GENERATION = "gen-00000000-0000-4000-8000-000000000001";

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

function recordPath(lockPath: string, generation: string): string {
  return path.join(lockPath, `${generation}.json`);
}

function transitionPath(lockPath: string, generation: string): string {
  return path.join(lockPath, `${generation}.next`);
}

function readTransition(lockPath: string, generation: string): string | null {
  const filename = transitionPath(lockPath, generation);
  if (!fs.existsSync(filename)) return null;
  return JSON.parse(fs.readFileSync(filename, "utf8")).nextGeneration;
}

function tailGeneration(lockPath: string): string {
  let generation = ROOT_GENERATION;
  for (;;) {
    const next = readTransition(lockPath, generation);
    if (!next) return generation;
    generation = next;
  }
}

function readCurrentRecord(lockPath: string): AriadneLockRecord {
  return JSON.parse(
    fs.readFileSync(recordPath(lockPath, tailGeneration(lockPath)), "utf8"),
  );
}

function seedCurrentRecord(lockPath: string, record: AriadneLockRecord): void {
  fs.mkdirSync(lockPath, { recursive: true });
  fs.writeFileSync(
    recordPath(lockPath, tailGeneration(lockPath)),
    JSON.stringify(record),
    { flag: "wx", mode: 0o600 },
  );
}

function installReplacementAtTransitionBoundary(
  lockPath: string,
  replacement: AriadneLockRecord,
): () => boolean {
  const originalLink = fs.linkSync.bind(fs);
  const originalUnlink = fs.unlinkSync.bind(fs);
  let substituted = false;

  vi.spyOn(fs, "linkSync").mockImplementation((source, destination) => {
    const destinationPath = destination.toString();
    if (!substituted && destinationPath.endsWith(".next")) {
      substituted = true;
      fs.writeFileSync(
        recordPath(lockPath, REPLACEMENT_GENERATION),
        JSON.stringify(replacement),
        { flag: "wx", mode: 0o600 },
      );
      const replacementTransition = path.join(
        lockPath,
        ".replacement-transition.json",
      );
      fs.writeFileSync(
        replacementTransition,
        JSON.stringify({
          schemaVersion: 1,
          nextGeneration: REPLACEMENT_GENERATION,
        }),
        { flag: "wx", mode: 0o600 },
      );
      originalLink(replacementTransition, destinationPath);
      originalUnlink(replacementTransition);
    }
    originalLink(source, destination);
  });

  return () => substituted;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

describe("acquireProjectLock", () => {
  it("creates an exclusive generation and release makes the next generation available", () => {
    const params = input();
    const handle = acquireProjectLock(params);
    expect(readCurrentRecord(params.lockPath)).toEqual(handle.record);
    expect(() =>
      acquireProjectLock({
        ...params,
        runId: "run-other",
        isProcessAlive: () => true,
      }),
    ).toThrow(/already locked/i);

    handle.release();

    const next = acquireProjectLock({
      ...params,
      runId: "run-after-release",
      pid: 4321,
    });
    expect(readCurrentRecord(params.lockPath)).toEqual(next.record);
    next.release();
  });

  it("does not release a replacement published at the transition boundary", () => {
    const params = input();
    const handle = acquireProjectLock(params);
    const replacement: AriadneLockRecord = {
      schemaVersion: 1,
      pid: 4321,
      startedAt: "2026-07-29T01:00:00.000Z",
      runId: "run-replacement",
    };
    const wasSubstituted = installReplacementAtTransitionBoundary(
      params.lockPath,
      replacement,
    );

    handle.release();

    expect(wasSubstituted()).toBe(true);
    expect(readCurrentRecord(params.lockPath)).toEqual(replacement);
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
    seedCurrentRecord(params.lockPath, {
      schemaVersion: 1,
      pid: 9,
      startedAt: "2026-01-01T00:00:00.000Z",
      runId: "old",
    });
    expect(() => acquireProjectLock(params)).toThrow(/already locked/i);
    expect(fs.existsSync(params.runDir)).toBe(false);
  });

  it("preserves a verified stale record in the new run directory before recovery", () => {
    const params = input({ isProcessAlive: () => false });
    const stale: AriadneLockRecord = {
      schemaVersion: 1,
      pid: 9,
      startedAt: "2026-01-01T00:00:00.000Z",
      runId: "old",
    };
    seedCurrentRecord(params.lockPath, stale);

    const handle = acquireProjectLock(params);

    expect(handle.recovered).toEqual(stale);
    const diagnostic = fs
      .readdirSync(params.runDir)
      .find((filename) => filename.startsWith("recovered-lock-"));
    expect(diagnostic).toBeDefined();
    expect(
      JSON.parse(
        fs.readFileSync(path.join(params.runDir, diagnostic as string), "utf8"),
      ),
    ).toEqual(stale);
    handle.release();
  });

  it("does not recover a replacement published at the stale transition boundary", () => {
    const params = input({ isProcessAlive: () => false });
    const stale: AriadneLockRecord = {
      schemaVersion: 1,
      pid: 9,
      startedAt: "2026-01-01T00:00:00.000Z",
      runId: "old",
    };
    const replacement: AriadneLockRecord = {
      schemaVersion: 1,
      pid: 10,
      startedAt: "2026-07-29T01:00:00.000Z",
      runId: "replacement",
    };
    seedCurrentRecord(params.lockPath, stale);
    const wasSubstituted = installReplacementAtTransitionBoundary(
      params.lockPath,
      replacement,
    );

    expect(() => acquireProjectLock(params)).toThrow(/changed.*recovery/i);

    expect(wasSubstituted()).toBe(true);
    expect(readCurrentRecord(params.lockPath)).toEqual(replacement);
  });

  it("uses a distinct diagnostic filename for each recovered stale lock", () => {
    const params = input();
    seedCurrentRecord(params.lockPath, {
      schemaVersion: 1,
      pid: 9,
      startedAt: "2026-01-01T00:00:00.000Z",
      runId: "old-one",
    });

    const first = acquireProjectLock({ ...params, runId: "new-old-one" });
    first.release();
    seedCurrentRecord(params.lockPath, {
      schemaVersion: 1,
      pid: 10,
      startedAt: "2026-01-02T00:00:00.000Z",
      runId: "old-two",
    });
    const second = acquireProjectLock({ ...params, runId: "new-old-two" });
    second.release();

    const diagnostics = fs
      .readdirSync(params.runDir)
      .filter((filename) => filename.startsWith("recovered-lock-"));
    expect(diagnostics).toHaveLength(2);
    expect(
      diagnostics.map(
        (filename) =>
          JSON.parse(
            fs.readFileSync(path.join(params.runDir, filename), "utf8"),
          ).runId,
      ),
    ).toEqual(["old-one", "old-two"]);
  });
});
