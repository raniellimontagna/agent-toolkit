import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createManifest,
  manifestPathForScope,
  removeManifestEntries,
  upsertManifestEntry,
} from "../../src/manifest.js";

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-toolkit-manifest-"));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

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
      runtimes: ["codex"],
      includeSkills: true,
    });

    expect(removed).toEqual([codexSkill]);
    expect(fs.existsSync(codexSkill)).toBe(false);
    expect(fs.existsSync(claudeSkill)).toBe(true);
    expect(manifest.entries).toHaveLength(1);
    expect(manifest.entries[0]?.runtime).toBe("claude");
  });
});
