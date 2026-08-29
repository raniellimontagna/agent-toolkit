import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AriadneStore } from "../../../src/ariadne/store.js";
import type {
  AriadneOwnershipViolation,
  AriadnePrd,
} from "../../../src/ariadne/types.js";

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

  it("rejects a replaced run-directory symlink before operational writes escape", () => {
    const root = temporaryProject();
    const store = new AriadneStore(root);
    const runDir = store.createRunDir("run-symlink");
    fs.rmSync(runDir, { recursive: true, force: true });
    fs.symlinkSync(
      root,
      runDir,
      process.platform === "win32" ? "junction" : "dir",
    );

    expect(() => store.assertRunDirectory("run-symlink")).toThrow(
      /run directory.*symbolic link/i,
    );
    expect(() =>
      store.writeRunJson("run-symlink", "process.json", { unsafe: true }),
    ).toThrow(/run directory.*symbolic link/i);
    expect(fs.existsSync(path.join(root, "process.json"))).toBe(false);
  });

  it("rejects a run artifact hard-linked into the project", () => {
    const root = temporaryProject();
    const store = new AriadneStore(root);
    const runDir = store.createRunDir("run-hardlink");
    const output = path.join(runDir, "runtime.stdout.log");
    const projectCopy = path.join(root, "runtime-output.txt");
    fs.writeFileSync(output, "raw runtime output\n", "utf8");
    fs.linkSync(output, projectCopy);

    expect(() =>
      store.assertRunArtifacts("run-hardlink", ["runtime.stdout.log"]),
    ).toThrow(/single link|hard link/i);
    expect(fs.readFileSync(projectCopy, "utf8")).toBe("raw runtime output\n");
  });

  it("pins the run directory and required output leaf identities", () => {
    const root = temporaryProject();
    const store = new AriadneStore(root);
    const runDir = store.createRunDir("run-pinned");
    for (const name of ["runtime.stdout.log", "runtime.stderr.log"]) {
      fs.writeFileSync(path.join(runDir, name), `${name}\n`, "utf8");
    }
    const boundary = store.certifyRunBoundary("run-pinned", [
      "runtime.stdout.log",
      "runtime.stderr.log",
    ]);
    const displaced = `${runDir}-displaced`;
    fs.renameSync(runDir, displaced);
    fs.mkdirSync(runDir);
    for (const name of ["runtime.stdout.log", "runtime.stderr.log"]) {
      fs.writeFileSync(
        path.join(runDir, name),
        `replacement ${name}\n`,
        "utf8",
      );
    }

    expect(() => store.assertRunBoundary(boundary)).toThrow(
      /boundary changed/i,
    );
  });

  it("requires every artifact named in a certified run boundary", () => {
    const store = new AriadneStore(temporaryProject());
    store.createRunDir("run-missing-output");

    expect(() =>
      store.certifyRunBoundary("run-missing-output", ["runtime.stdout.log"]),
    ).toThrow(/required run artifact.*unavailable/i);
  });

  it("atomically round-trips a strict machine-local ownership marker", () => {
    const store = new AriadneStore(temporaryProject());
    const marker: AriadneOwnershipViolation = {
      schemaVersion: 1,
      runId: "run-1",
      storyId: "US-001",
      detectedAt: "2026-07-29T12:00:00.000Z",
      certifiedHead: "certified-head",
      observedHead: "agent-head",
      changed: ["head", "prd"],
    };

    expect(store.loadOwnershipViolation()).toBeUndefined();
    store.saveOwnershipViolation(marker);

    expect(store.paths.ownershipViolation).toBe(
      path.join(store.projectRoot, ".ariadne-quarantine.json"),
    );
    expect(store.loadOwnershipViolation()).toEqual(marker);
    expect(fs.existsSync(`${store.paths.ownershipViolation}.tmp`)).toBe(false);
  });

  it("persists exact canonical identities in an ownership checkpoint", () => {
    const store = new AriadneStore(temporaryProject());
    const prdCertificate = store.savePrd(prd);
    fs.writeFileSync(store.paths.progress, "checkpoint progress\n", "utf8");
    const progressCertificate = store.captureCanonicalCertificate(
      store.paths.progress,
    );

    const checkpoint = store.saveOwnershipCheckpoint({
      runId: "run-checkpoint",
      storyId: "US-001",
      certifiedAt: "2026-07-29T12:00:00.000Z",
      certifiedHead: "0123456789012345678901234567890123456789",
      certifiedRef: "refs/heads/main",
      prd: prdCertificate,
      progress: progressCertificate,
    });

    expect(store.loadOwnershipCheckpoint()).toEqual(checkpoint);
    expect(store.ownershipCheckpointChanges(checkpoint)).toEqual([]);
    fs.appendFileSync(store.paths.progress, "late mutation\n", "utf8");
    expect(store.ownershipCheckpointChanges(checkpoint)).toEqual(["progress"]);
  });

  it("fails closed on a malformed ownership marker", () => {
    const store = new AriadneStore(temporaryProject());
    fs.writeFileSync(
      store.paths.ownershipViolation,
      '{"schemaVersion":1,"certifiedHead":"missing fields"}\n',
      "utf8",
    );

    expect(() => store.loadOwnershipViolation()).toThrow(
      /ownership violation marker/i,
    );
  });

  it("does not read an ownership marker through a symbolic link", () => {
    const root = temporaryProject();
    const store = new AriadneStore(root);
    const externalMarker = path.join(root, "external-marker.json");
    fs.writeFileSync(
      externalMarker,
      `${JSON.stringify({ schemaVersion: 1, runId: "outside" })}\n`,
      "utf8",
    );
    fs.symlinkSync(externalMarker, store.paths.ownershipViolation, "file");

    // POSIX refuses the open through O_NOFOLLOW; Windows has no such flag, so
    // the post-open identity check rejects the symbolic link instead.
    expect(() => store.loadOwnershipViolation()).toThrow(
      /regular non-symbolic file|must be a real file/i,
    );
  });

  it("persists quarantine outside a substituted Ariadne state tree", () => {
    const root = temporaryProject();
    const store = new AriadneStore(root);
    store.ensureLayout();
    fs.rmSync(store.paths.root, { recursive: true, force: true });
    const externalState = path.join(root, "external-state");
    fs.mkdirSync(externalState);
    fs.symlinkSync(
      externalState,
      store.paths.root,
      process.platform === "win32" ? "junction" : "dir",
    );
    const marker: AriadneOwnershipViolation = {
      schemaVersion: 1,
      runId: "run-quarantine",
      storyId: "US-001",
      detectedAt: "2026-07-29T12:00:00.000Z",
      certifiedHead: "certified-head",
      observedHead: "unavailable",
      certifiedRef: "refs/heads/main",
      observedRef: "unavailable",
      changed: ["operational"],
    };

    store.saveOwnershipViolation(marker);

    expect(store.loadOwnershipViolation()).toEqual(marker);
    expect(
      fs.existsSync(path.join(externalState, ".ownership-violation.json")),
    ).toBe(false);
  });

  it("returns exact coordinator certificates for PRD writes and progress appends", () => {
    const store = new AriadneStore(temporaryProject());
    const prdCertificate = store.savePrd(prd);
    fs.writeFileSync(store.paths.progress, "existing\n", "utf8");
    const progressBefore = store.captureCanonicalCertificate(
      store.paths.progress,
    );

    const progressAfter = store.appendProgress("coordinator", progressBefore);

    expect(prdCertificate.contents).toBe(`${JSON.stringify(prd, null, 2)}\n`);
    expect(progressAfter.contents).toBe("existing\ncoordinator\n");
    expect(() =>
      store.assertCanonicalCertificate(prdCertificate),
    ).not.toThrow();
    expect(() => store.assertCanonicalCertificate(progressAfter)).not.toThrow();
    fs.appendFileSync(store.paths.progress, "late runtime mutation\n", "utf8");
    expect(() => store.assertCanonicalCertificate(progressAfter)).toThrow(
      /changed after coordinator certification/i,
    );
  });

  it("extends a run boundary only with creator-certified output identities", () => {
    const store = new AriadneStore(temporaryProject());
    const prompt = store.writeRunTextExclusive(
      "run-output",
      "prompt.md",
      "prompt",
    );
    const boundary = store.certifyRunBoundary(
      "run-output",
      ["prompt.md"],
      [prompt],
    );
    const output = store.writeRunTextExclusive(
      "run-output",
      "runtime.stdout.log",
      "output",
    );
    const extended = store.extendRunBoundary(boundary, [output]);

    fs.renameSync(output.source, path.join(store.projectRoot, "leaked-output"));
    fs.writeFileSync(output.source, "replacement", "utf8");

    expect(() => store.assertRunBoundary(extended)).toThrow(
      /boundary changed/i,
    );
  });

  it("rejects a symbolic Ariadne root before creating layout in its target", () => {
    const root = temporaryProject();
    const target = path.join(root, "outside-state");
    fs.mkdirSync(target);
    fs.symlinkSync(
      target,
      path.join(root, ".ariadne"),
      process.platform === "win32" ? "junction" : "dir",
    );
    const store = new AriadneStore(root);

    expect(() => store.createRunDir("run-escape")).toThrow(/symbolic link/i);
    expect(fs.existsSync(path.join(target, "archive"))).toBe(false);
    expect(fs.existsSync(path.join(target, "runs"))).toBe(false);
  });
});
