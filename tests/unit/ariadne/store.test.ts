import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AriadneStore } from "../../../src/ariadne/store.js";
import type { AriadnePrd } from "../../../src/ariadne/types.js";

const prd: AriadnePrd = {
  schemaVersion: 1,
  project: "Ariadne",
  branchName: "feature/ariadne",
  description: "Durable state",
  userStories: [],
};
const directories: string[] = [];

function temporaryProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ariadne-store-"));
  directories.push(root);
  return root;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

describe("AriadneStore", () => {
  it("creates versioned layout and atomically round-trips a PRD", () => {
    const root = temporaryProject();
    const store = new AriadneStore(root);
    store.ensureLayout();
    store.savePrd(prd);

    expect(store.loadPrd()).toEqual(prd);
    expect(fs.existsSync(`${store.paths.prd}.tmp`)).toBe(false);
    expect(store.paths.runs).toBe(path.join(root, ".ariadne", "runs"));
    expect(fs.existsSync(store.paths.archive)).toBe(true);
  });

  it("keeps the prior PRD byte-for-byte when rename fails", () => {
    const root = temporaryProject();
    const store = new AriadneStore(root);
    store.savePrd(prd);
    const before = fs.readFileSync(store.paths.prd, "utf8");
    vi.spyOn(fs, "renameSync").mockImplementationOnce(() => {
      throw new Error("rename failed");
    });

    expect(() => store.savePrd({ ...prd, description: "Changed" })).toThrow(
      "rename failed",
    );
    expect(fs.readFileSync(store.paths.prd, "utf8")).toBe(before);
    expect(fs.existsSync(`${store.paths.prd}.tmp`)).toBe(false);
  });

  it("writes isolated run data and archives imports with path-safe UTC timestamps", () => {
    const store = new AriadneStore(temporaryProject());
    expect(store.createRunDir("run-1")).toBe(
      path.join(store.paths.runs, "run-1"),
    );
    expect(store.writeRunJson("run-1", "result.json", { ok: true })).toBe(
      path.join(store.paths.runs, "run-1", "result.json"),
    );
    expect(store.archiveImportedPrd("legacy", "2026-07-29T12:34:56.789Z")).toBe(
      path.join(
        store.paths.archive,
        "import-2026-07-29T12-34-56-789Z",
        "prd.json",
      ),
    );
  });
});
