import childProcess from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InstallManifest, ManifestEntry } from "../../src/manifest.js";
import {
  createManifest,
  manifestPathForScope,
  readManifest,
  removeManifestEntries,
  upsertManifestEntry,
} from "../../src/manifest.js";

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-toolkit-manifest-"));
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

function validManifest(scope: "local" | "global" = "local"): InstallManifest {
  return {
    version: 1,
    scope,
    generatedAt: "2026-07-14T12:00:00.000Z",
    entries: [
      {
        kind: "skill",
        runtime: "codex",
        source: "/repo/skills/sample-skill",
        destination: path.join(tempDir, "project/.codex/skills/sample-skill"),
        installedAt: "2026-07-14T12:00:00.000Z",
      },
    ],
  };
}

function writeRawManifest(value: unknown): string {
  const filePath = path.join(tempDir, "install-manifest.json");
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
  return filePath;
}

function firstEntry(manifest: InstallManifest): ManifestEntry {
  const entry = manifest.entries[0];
  if (!entry) throw new Error("Test manifest must contain an entry");
  return entry;
}

function localRemoveOptions(dryRun = false) {
  const cwd = path.join(tempDir, "project");
  fs.mkdirSync(cwd, { recursive: true });
  return {
    runtimes: ["codex"] as const,
    includeSkills: true,
    dryRun,
    cwd,
    home: path.join(tempDir, "home"),
    env: {},
  };
}

function createDirectoryLink(target: string, link: string): void {
  fs.symlinkSync(
    target,
    link,
    process.platform === "win32" ? "junction" : "dir",
  );
}

describe("install manifest", () => {
  it("stores global manifests under HOME and local manifests under the project", () => {
    expect(manifestPathForScope("global", "/work/project", "/home/user")).toBe(
      "/home/user/.agent-toolkit/install-manifest.json",
    );
    expect(manifestPathForScope("local", "/work/project", "/home/user")).toBe(
      "/work/project/.agent-toolkit/install-manifest.json",
    );
  });

  it("upserts skill entries by destination", () => {
    const manifest = createManifest("local");

    upsertManifestEntry(manifest, {
      kind: "skill",
      runtime: "codex",
      source: "/repo/skills/core/agent-toolkit-maintainer",
      destination: "/project/.codex/skills/agent-toolkit-maintainer",
    });
    upsertManifestEntry(manifest, {
      kind: "skill",
      runtime: "codex",
      source: "/repo/skills/core/agent-toolkit-maintainer",
      destination: "/project/.codex/skills/agent-toolkit-maintainer",
    });

    expect(manifest.entries).toHaveLength(1);
    expect(manifest.entries[0]).toMatchObject({
      kind: "skill",
      runtime: "codex",
      destination: "/project/.codex/skills/agent-toolkit-maintainer",
    });
  });

  it("normalizes a recorded destination to an absolute path", () => {
    const manifest = createManifest("local");

    upsertManifestEntry(manifest, {
      kind: "skill",
      runtime: "codex",
      source: "/repo/skills/sample-skill",
      destination: "relative/.codex/skills/sample-skill",
    });

    expect(firstEntry(manifest).destination).toBe(
      path.resolve("relative/.codex/skills/sample-skill"),
    );
  });

  it.each([
    ["root", () => null, "root"],
    ["array root", () => [], "root"],
    ["version", () => ({ ...validManifest(), version: 2 }), "version"],
    ["scope", () => ({ ...validManifest(), scope: "workspace" }), "scope"],
    ["scope mismatch", () => validManifest("global"), "scope"],
    [
      "generatedAt empty",
      () => ({ ...validManifest(), generatedAt: "" }),
      "generatedAt",
    ],
    [
      "generatedAt invalid",
      () => ({ ...validManifest(), generatedAt: "not-a-date" }),
      "generatedAt",
    ],
    ["entries", () => ({ ...validManifest(), entries: {} }), "entries"],
    [
      "entry root",
      () => ({ ...validManifest(), entries: [null] }),
      "entries[0]",
    ],
    [
      "kind",
      () => ({
        ...validManifest(),
        entries: [{ ...validManifest().entries[0], kind: "tool" }],
      }),
      "kind",
    ],
    [
      "runtime",
      () => ({
        ...validManifest(),
        entries: [{ ...validManifest().entries[0], runtime: "other" }],
      }),
      "runtime",
    ],
    [
      "source",
      () => ({
        ...validManifest(),
        entries: [{ ...validManifest().entries[0], source: "" }],
      }),
      "source",
    ],
    [
      "destination relative",
      () => ({
        ...validManifest(),
        entries: [
          { ...validManifest().entries[0], destination: "relative/skill" },
        ],
      }),
      "destination",
    ],
    [
      "installedAt empty",
      () => ({
        ...validManifest(),
        entries: [{ ...validManifest().entries[0], installedAt: "" }],
      }),
      "installedAt",
    ],
    [
      "installedAt invalid",
      () => ({
        ...validManifest(),
        entries: [{ ...validManifest().entries[0], installedAt: "not-a-date" }],
      }),
      "installedAt",
    ],
  ])("rejects invalid %s without mutating an installed path", (_name, makeValue, field) => {
    const installedPath = firstEntry(validManifest()).destination;
    fs.mkdirSync(installedPath, { recursive: true });
    const filePath = writeRawManifest(makeValue());

    expect(() => readManifest(filePath, "local")).toThrow(
      new RegExp(
        `${filePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*${field.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&",
        )}`,
      ),
    );
    expect(fs.existsSync(installedPath)).toBe(true);
  });

  it("reports malformed JSON with the manifest path and no echoed content", () => {
    const filePath = path.join(tempDir, "install-manifest.json");
    const secret = "do-not-echo-this-content";
    fs.writeFileSync(filePath, `{ invalid: "${secret}" }`);

    expect(() => readManifest(filePath, "local")).toThrow(filePath);
    expect(() => readManifest(filePath, "local")).not.toThrow(secret);
  });

  it("removes matching installed skill directories and leaves unrelated entries", () => {
    const codexSkill = path.join(tempDir, "project/.codex/skills/sample-skill");
    const claudeSkill = path.join(
      tempDir,
      "project/.claude/skills/sample-skill",
    );
    fs.mkdirSync(codexSkill, { recursive: true });
    fs.mkdirSync(claudeSkill, { recursive: true });

    const manifest = createManifest("local");
    upsertManifestEntry(manifest, {
      kind: "skill",
      runtime: "codex",
      source: "/repo/skills/sample-skill",
      destination: codexSkill,
    });
    upsertManifestEntry(manifest, {
      kind: "skill",
      runtime: "claude",
      source: "/repo/skills/sample-skill",
      destination: claudeSkill,
    });

    const removed = removeManifestEntries(manifest, {
      ...localRemoveOptions(),
    });

    expect(removed).toEqual([codexSkill]);
    expect(fs.existsSync(codexSkill)).toBe(false);
    expect(fs.existsSync(claudeSkill)).toBe(true);
    expect(manifest.entries).toHaveLength(1);
    expect(manifest.entries[0]?.runtime).toBe("claude");
  });

  it("pins the safe helper eval to CommonJS and keeps payload in argv", () => {
    const destination = path.join(
      tempDir,
      "project/.codex/skills/spawn-contract",
    );
    fs.mkdirSync(destination, { recursive: true });
    const manifest = validManifest();
    manifest.entries[0] = { ...firstEntry(manifest), destination };
    const originalSpawn = childProcess.spawnSync;
    const spawn = vi
      .spyOn(childProcess, "spawnSync")
      .mockImplementation((command, args, options) =>
        originalSpawn(command, args, options),
      );

    expect(removeManifestEntries(manifest, localRemoveOptions())).toEqual([
      destination,
    ]);
    const spawnArgs = spawn.mock.calls[0]?.[1];
    expect(spawnArgs).toBeDefined();
    expect(spawnArgs?.slice(0, 2)).toEqual(["--input-type=commonjs", "-e"]);
    expect(spawnArgs?.[2]).toContain("process.argv[1]");
    expect(spawnArgs?.[2]).not.toContain("spawn-contract");
    expect(JSON.parse(spawnArgs?.[3] ?? "null")).toMatchObject({
      basename: "spawn-contract",
    });
    expect(manifest.entries).toEqual([]);
  });

  it("removes a POSIX skill whose basename contains a literal backslash", () => {
    const basename = "odd\\name";
    if (process.platform === "win32") {
      expect(path.basename(basename)).not.toBe(basename);
      return;
    }

    const destination = path.join(tempDir, "project/.codex/skills", basename);
    fs.mkdirSync(destination, { recursive: true });
    const manifest = validManifest();
    manifest.entries[0] = { ...firstEntry(manifest), destination };

    expect(removeManifestEntries(manifest, localRemoveOptions())).toEqual([
      destination,
    ]);
    expect(fs.existsSync(destination)).toBe(false);
    expect(manifest.entries).toEqual([]);
  });

  it("passes a hostile-looking POSIX basename as inert JSON data", () => {
    if (process.platform === "win32") return;

    const basename = [
      'quote"',
      "\\",
      "line",
      "\n",
      "$(touch PWNED)",
      "process.exit(99)",
      "'",
    ].join("-");
    const root = path.join(tempDir, "project/.codex/skills");
    const destination = path.join(root, basename);
    fs.mkdirSync(destination, { recursive: true });
    const manifest = validManifest();
    manifest.entries[0] = { ...firstEntry(manifest), destination };
    const originalSpawn = childProcess.spawnSync;
    const spawn = vi
      .spyOn(childProcess, "spawnSync")
      .mockImplementation((command, args, options) =>
        originalSpawn(command, args, options),
      );

    expect(removeManifestEntries(manifest, localRemoveOptions())).toEqual([
      destination,
    ]);
    const spawnArgs = spawn.mock.calls[0]?.[1];
    expect(spawnArgs?.[2]).not.toContain(basename);
    expect(JSON.parse(spawnArgs?.[3] ?? "null")).toMatchObject({ basename });
    expect(fs.existsSync(path.join(root, "PWNED"))).toBe(false);
    expect(fs.existsSync(destination)).toBe(false);
    expect(manifest.entries).toEqual([]);
  });

  it("reports removals without deleting anything in dry-run mode", () => {
    const codexSkill = path.join(tempDir, "project/.codex/skills/sample-skill");
    fs.mkdirSync(codexSkill, { recursive: true });

    const manifest = createManifest("local");
    upsertManifestEntry(manifest, {
      kind: "skill",
      runtime: "codex",
      source: "/repo/skills/sample-skill",
      destination: codexSkill,
    });

    const removed = removeManifestEntries(manifest, {
      ...localRemoveOptions(true),
    });

    expect(removed).toEqual([codexSkill]);
    expect(fs.existsSync(codexSkill)).toBe(true);
  });

  it("removes benign global Antigravity entries from official and legacy roots", () => {
    const home = path.join(tempDir, "home");
    const official = path.join(
      home,
      ".gemini/antigravity-cli/skills/sample-skill",
    );
    const legacy = path.join(home, ".agents/skills/sample-skill");
    fs.mkdirSync(official, { recursive: true });
    fs.mkdirSync(legacy, { recursive: true });
    const manifest = validManifest("global");
    manifest.entries = [
      {
        ...firstEntry(manifest),
        runtime: "antigravity",
        destination: official,
      },
      { ...firstEntry(manifest), runtime: "antigravity", destination: legacy },
    ];

    expect(
      removeManifestEntries(manifest, {
        runtimes: ["antigravity"],
        includeSkills: true,
        cwd: path.join(tempDir, "project"),
        home,
        env: {},
      }),
    ).toEqual([official, legacy]);
    expect(fs.existsSync(official)).toBe(false);
    expect(fs.existsSync(legacy)).toBe(false);
    expect(manifest.entries).toEqual([]);
  });

  it("prunes a lexically safe absent entry without touching the filesystem", () => {
    const destination = path.join(tempDir, "project/.codex/skills/stale-skill");
    const manifest = validManifest();
    manifest.entries[0] = { ...firstEntry(manifest), destination };
    const rm = vi.spyOn(fs, "rmSync");

    expect(removeManifestEntries(manifest, localRemoveOptions())).toEqual([
      destination,
    ]);
    expect(rm).not.toHaveBeenCalled();
    expect(manifest.entries).toEqual([]);
  });

  it("prunes an absent global entry below a dangling root symlink without a helper", () => {
    const home = path.join(tempDir, "home");
    fs.mkdirSync(home, { recursive: true });
    createDirectoryLink(
      path.join(tempDir, "missing-codex-home"),
      path.join(home, ".codex"),
    );
    const destination = path.join(home, ".codex/skills/stale-global-skill");
    const manifest = validManifest("global");
    manifest.entries[0] = { ...firstEntry(manifest), destination };
    const spawn = vi.spyOn(childProcess, "spawnSync");
    const rm = vi.spyOn(fs, "rmSync");

    expect(
      removeManifestEntries(manifest, {
        runtimes: ["codex"],
        includeSkills: true,
        cwd: path.join(tempDir, "project"),
        home,
        env: {},
      }),
    ).toEqual([destination]);
    expect(spawn).not.toHaveBeenCalled();
    expect(rm).not.toHaveBeenCalled();
    expect(manifest.entries).toEqual([]);
  });

  it.each([
    ["root itself", (root: string) => root],
    ["sibling", (root: string) => path.join(path.dirname(root), "other-skill")],
    ["nested", (root: string) => path.join(root, "group", "sample-skill")],
    ["relative", () => "relative/sample-skill"],
    ["parent traversal", (root: string) => `${root}/../escaped-skill`],
    [
      "normalizing parent traversal",
      (root: string) =>
        `${root}${path.sep}placeholder${path.sep}..${path.sep}sample-skill`,
    ],
  ])("rejects an unsafe %s destination", (_name, destinationFor) => {
    const root = path.join(tempDir, "project/.codex/skills");
    fs.mkdirSync(root, { recursive: true });
    const manifest = validManifest();
    const destination = destinationFor(root);
    manifest.entries[0] = { ...firstEntry(manifest), destination };

    expect(() => removeManifestEntries(manifest, localRemoveOptions())).toThrow(
      /destination/i,
    );
    expect(fs.existsSync(root)).toBe(true);
    expect(manifest.entries).toHaveLength(1);
  });

  it("rejects a destination symlink that escapes its allowed root", () => {
    const root = path.join(tempDir, "project/.codex/skills");
    const outside = path.join(tempDir, "outside/sample-skill");
    const destination = path.join(root, "sample-skill");
    fs.mkdirSync(root, { recursive: true });
    fs.mkdirSync(outside, { recursive: true });
    createDirectoryLink(outside, destination);
    const manifest = validManifest();
    manifest.entries[0] = { ...firstEntry(manifest), destination };

    expect(() => removeManifestEntries(manifest, localRemoveOptions())).toThrow(
      /canonical/i,
    );
    expect(fs.existsSync(outside)).toBe(true);
    expect(fs.lstatSync(destination).isSymbolicLink()).toBe(true);
    expect(manifest.entries).toHaveLength(1);
  });

  it("rejects a local root whose parent symlink escapes canonical cwd", () => {
    const project = path.join(tempDir, "project");
    const outsideRuntime = path.join(tempDir, "outside/.codex");
    fs.mkdirSync(project, { recursive: true });
    fs.mkdirSync(path.join(outsideRuntime, "skills/sample-skill"), {
      recursive: true,
    });
    createDirectoryLink(outsideRuntime, path.join(project, ".codex"));
    const destination = path.join(project, ".codex/skills/sample-skill");
    const manifest = validManifest();
    manifest.entries[0] = { ...firstEntry(manifest), destination };

    expect(() => removeManifestEntries(manifest, localRemoveOptions())).toThrow(
      /outside canonical cwd/i,
    );
    expect(
      fs.existsSync(path.join(outsideRuntime, "skills/sample-skill")),
    ).toBe(true);
    expect(manifest.entries).toHaveLength(1);
  });

  it("rejects a validated root swapped for an external symlink before helper start", () => {
    const project = path.join(tempDir, "project");
    const root = path.join(project, ".codex/skills");
    const destination = path.join(root, "sample-skill");
    const originalRoot = path.join(project, ".codex/skills-original");
    const outsideRoot = path.join(tempDir, "outside-skills");
    const outsideDestination = path.join(outsideRoot, "sample-skill");
    fs.mkdirSync(destination, { recursive: true });
    fs.mkdirSync(outsideDestination, { recursive: true });
    fs.writeFileSync(path.join(outsideDestination, "marker"), "outside");
    const manifest = validManifest();
    manifest.entries[0] = { ...firstEntry(manifest), destination };
    const originalSpawn = childProcess.spawnSync;
    let swapped = false;
    vi.spyOn(childProcess, "spawnSync").mockImplementation(
      (command, args, options) => {
        if (!swapped) {
          fs.renameSync(root, originalRoot);
          createDirectoryLink(outsideRoot, root);
          swapped = true;
        }
        return originalSpawn(command, args, options);
      },
    );

    expect(() => removeManifestEntries(manifest, localRemoveOptions())).toThrow(
      /safe removal helper/i,
    );
    expect(swapped).toBe(true);
    expect(
      fs.readFileSync(path.join(outsideDestination, "marker"), "utf8"),
    ).toBe("outside");
    expect(fs.existsSync(path.join(originalRoot, "sample-skill"))).toBe(true);
    expect(manifest.entries).toHaveLength(1);
  });

  it("rejects a leaf swapped after preflight but before helper start", () => {
    const root = path.join(tempDir, "project/.codex/skills");
    const destination = path.join(root, "sample-skill");
    const originalDestination = path.join(root, "original-sample-skill");
    fs.mkdirSync(destination, { recursive: true });
    fs.writeFileSync(path.join(destination, "marker"), "original");
    const manifest = validManifest();
    manifest.entries[0] = { ...firstEntry(manifest), destination };
    const originalSpawn = childProcess.spawnSync;
    let swapped = false;
    vi.spyOn(childProcess, "spawnSync").mockImplementation(
      (command, args, options) => {
        if (!swapped) {
          fs.renameSync(destination, originalDestination);
          fs.mkdirSync(destination);
          fs.writeFileSync(path.join(destination, "marker"), "replacement");
          swapped = true;
        }
        return originalSpawn(command, args, options);
      },
    );

    expect(() => removeManifestEntries(manifest, localRemoveOptions())).toThrow(
      /safe removal helper/i,
    );
    expect(swapped).toBe(true);
    expect(fs.readFileSync(path.join(destination, "marker"), "utf8")).toBe(
      "replacement",
    );
    expect(
      fs.readFileSync(path.join(originalDestination, "marker"), "utf8"),
    ).toBe("original");
    expect(manifest.entries).toHaveLength(1);
  });

  it("fails closed on ENOTDIR while inspecting an allowed root", () => {
    const project = path.join(tempDir, "project");
    fs.mkdirSync(project, { recursive: true });
    fs.writeFileSync(path.join(project, ".codex"), "not a directory");
    const manifest = validManifest();

    expect(() => removeManifestEntries(manifest, localRemoveOptions())).toThrow(
      /cannot be inspected/i,
    );
    expect(fs.readFileSync(path.join(project, ".codex"), "utf8")).toBe(
      "not a directory",
    );
    expect(manifest.entries).toHaveLength(1);
  });

  it("fails closed when current environment overrides no longer match", () => {
    const project = path.join(tempDir, "project");
    const oldDestination = path.join(project, ".codex/skills/sample-skill");
    fs.mkdirSync(oldDestination, { recursive: true });
    const manifest = validManifest();

    expect(() =>
      removeManifestEntries(manifest, {
        ...localRemoveOptions(),
        cwd: project,
        env: { CODEX_HOME: path.join(tempDir, "different-codex-home") },
      }),
    ).not.toThrow();

    const globalManifest = validManifest("global");
    globalManifest.entries[0] = {
      ...firstEntry(globalManifest),
      destination: path.join(tempDir, "home/.codex/skills/sample-skill"),
    };
    fs.mkdirSync(globalManifest.entries[0].destination, { recursive: true });
    expect(() =>
      removeManifestEntries(globalManifest, {
        runtimes: ["codex"],
        includeSkills: true,
        cwd: project,
        home: path.join(tempDir, "home"),
        env: { CODEX_HOME: path.join(tempDir, "different-codex-home") },
      }),
    ).toThrow(/unsafe manifest destination/i);
    expect(fs.existsSync(globalManifest.entries[0].destination)).toBe(true);
  });

  it("applies the same unsafe preflight in dry-run mode", () => {
    const manifest = validManifest();
    manifest.entries[0] = {
      ...firstEntry(manifest),
      destination: path.join(tempDir, "project/.codex/skills/group/sample"),
    };

    expect(() =>
      removeManifestEntries(manifest, localRemoveOptions(true)),
    ).toThrow(/unsafe manifest destination/i);
    expect(manifest.entries).toHaveLength(1);
  });

  it("validates every selected entry before removing the first one", () => {
    const validDestination = path.join(
      tempDir,
      "project/.codex/skills/valid-skill",
    );
    fs.mkdirSync(validDestination, { recursive: true });
    const manifest = validManifest();
    manifest.entries = [
      { ...firstEntry(manifest), destination: validDestination },
      {
        ...firstEntry(manifest),
        destination: path.join(
          tempDir,
          "project/.codex/skills/group/malicious",
        ),
      },
    ];

    expect(() => removeManifestEntries(manifest, localRemoveOptions())).toThrow(
      /unsafe manifest destination/i,
    );
    expect(fs.existsSync(validDestination)).toBe(true);
    expect(manifest.entries).toHaveLength(2);
  });

  it("keeps the original manifest after a partial delete and converges on retry", () => {
    const project = path.join(tempDir, "project");
    const codexDestination = path.join(project, ".codex/skills/codex-skill");
    const claudeRoot = path.join(project, ".claude/skills");
    const claudeDestination = path.join(claudeRoot, "claude-skill");
    const originalClaudeRoot = path.join(project, ".claude/skills-original");
    const outsideClaudeRoot = path.join(tempDir, "outside-claude-skills");
    const outsideClaudeDestination = path.join(
      outsideClaudeRoot,
      "claude-skill",
    );
    fs.mkdirSync(codexDestination, { recursive: true });
    fs.mkdirSync(claudeDestination, { recursive: true });
    fs.mkdirSync(outsideClaudeDestination, { recursive: true });
    const manifest = validManifest();
    manifest.entries = [
      {
        ...firstEntry(manifest),
        runtime: "codex",
        destination: codexDestination,
      },
      {
        ...firstEntry(manifest),
        runtime: "claude",
        destination: claudeDestination,
      },
    ];
    const originalManifest = structuredClone(manifest.entries);
    const originalSpawn = childProcess.spawnSync;
    let spawnCount = 0;
    const spawn = vi
      .spyOn(childProcess, "spawnSync")
      .mockImplementation((command, args, options) => {
        spawnCount += 1;
        if (spawnCount === 2) {
          fs.renameSync(claudeRoot, originalClaudeRoot);
          createDirectoryLink(outsideClaudeRoot, claudeRoot);
        }
        return originalSpawn(command, args, options);
      });
    const options = {
      runtimes: ["codex", "claude"] as const,
      includeSkills: true,
      cwd: project,
      home: path.join(tempDir, "home"),
      env: {},
    };

    expect(() => removeManifestEntries(manifest, options)).toThrow(
      /safe removal helper/i,
    );
    expect(fs.existsSync(codexDestination)).toBe(false);
    expect(fs.existsSync(path.join(originalClaudeRoot, "claude-skill"))).toBe(
      true,
    );
    expect(fs.existsSync(outsideClaudeDestination)).toBe(true);
    expect(manifest.entries).toEqual(originalManifest);

    fs.rmSync(claudeRoot, { recursive: true, force: true });
    fs.renameSync(originalClaudeRoot, claudeRoot);
    spawn.mockRestore();

    expect(removeManifestEntries(manifest, options)).toEqual([
      codexDestination,
      claudeDestination,
    ]);
    expect(fs.existsSync(claudeDestination)).toBe(false);
    expect(fs.existsSync(outsideClaudeDestination)).toBe(true);
    expect(manifest.entries).toEqual([]);
  });

  it("never deletes an absent-at-preflight destination that appears afterward", () => {
    const destination = path.join(
      tempDir,
      "project/.codex/skills/appearing-skill",
    );
    const manifest = validManifest();
    manifest.entries[0] = { ...firstEntry(manifest), destination };
    const originalLstat = fs.lstatSync.bind(fs);
    let intercepted = false;
    vi.spyOn(fs, "lstatSync").mockImplementation(((filePath: fs.PathLike) => {
      if (!intercepted && path.resolve(String(filePath)) === destination) {
        intercepted = true;
        fs.mkdirSync(destination, { recursive: true });
        const error = new Error("not found") as NodeJS.ErrnoException;
        error.code = "ENOENT";
        throw error;
      }
      return originalLstat(filePath);
    }) as typeof fs.lstatSync);
    const rm = vi.spyOn(fs, "rmSync");
    const spawn = vi.spyOn(childProcess, "spawnSync");

    expect(removeManifestEntries(manifest, localRemoveOptions())).toEqual([
      destination,
    ]);
    expect(fs.existsSync(destination)).toBe(true);
    expect(rm).not.toHaveBeenCalledWith(destination, expect.anything());
    expect(spawn).not.toHaveBeenCalled();
    expect(manifest.entries).toEqual([]);
  });
});
