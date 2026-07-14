import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  externalSourceIdentity,
  formatGithubPackageSpec,
  formatNpmPackageSpec,
  formatPythonPackageSpec,
  githubReleaseApiUrl,
  isMutableExternalSource,
  loadToolLock,
} from "../../src/tool-lock.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  tempDirs.length = 0;
});

type MutableCatalogLock = {
  tools: {
    agentSkills: {
      repositories: Record<string, { ref: string }>;
      bundles: Record<
        string,
        {
          skills: Array<{
            repository: string;
            skill: string;
            path?: string;
          }>;
        }
      >;
    };
  };
};

function writeMutatedLock(mutate: (lock: MutableCatalogLock) => void): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tool-lock-test-"));
  const lock = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "tools.lock.json"), "utf8"),
  ) as MutableCatalogLock;
  mutate(lock);
  const lockPath = path.join(tempDir, "tools.lock.json");
  fs.writeFileSync(lockPath, JSON.stringify(lock));
  tempDirs.push(tempDir);
  return lockPath;
}

function getMutableRepository(lock: MutableCatalogLock, repositoryId: string) {
  const repository = lock.tools.agentSkills.repositories[repositoryId];
  if (!repository) {
    throw new Error(`Missing test repository ${repositoryId}`);
  }
  return repository;
}

function getMutableBundle(lock: MutableCatalogLock, bundleId: string) {
  const bundle = lock.tools.agentSkills.bundles[bundleId];
  if (!bundle) {
    throw new Error(`Missing test bundle ${bundleId}`);
  }
  return bundle;
}

function getFirstMutableSkill(lock: MutableCatalogLock, bundleId: string) {
  const skill = getMutableBundle(lock, bundleId).skills[0];
  if (!skill) {
    throw new Error(`Missing test skill in bundle ${bundleId}`);
  }
  return skill;
}

const invalidCatalogCases: Array<[string, (lock: MutableCatalogLock) => void]> =
  [
    [
      "unknown repository",
      (lock) => {
        getFirstMutableSkill(lock, "improve").repository = "missing";
      },
    ],
    [
      "mutable repository ref",
      (lock) => {
        getMutableRepository(lock, "shadcnImprove").ref = "main";
      },
    ],
    [
      "empty repositories",
      (lock) => {
        lock.tools.agentSkills.repositories = {};
      },
    ],
    [
      "malformed repository key",
      (lock) => {
        lock.tools.agentSkills.repositories["bad-key"] = getMutableRepository(
          lock,
          "shadcnImprove",
        );
        delete lock.tools.agentSkills.repositories.shadcnImprove;
      },
    ],
    [
      "empty bundle",
      (lock) => {
        getMutableBundle(lock, "planning-skills").skills = [];
      },
    ],
    [
      "unsupported bundle",
      (lock) => {
        lock.tools.agentSkills.bundles.unsupported = getMutableBundle(
          lock,
          "improve",
        );
      },
    ],
    [
      "malformed skill name",
      (lock) => {
        getFirstMutableSkill(lock, "improve").skill = "Bad Skill";
      },
    ],
    [
      "absolute path",
      (lock) => {
        getFirstMutableSkill(lock, "improve").path = "/tmp/improve";
      },
    ],
    [
      "path traversal",
      (lock) => {
        getFirstMutableSkill(lock, "improve").path = "skills/../improve";
      },
    ],
  ];

describe("external tool lock", () => {
  it("loads pinned external tool sources from tools.lock.json", () => {
    const lockPath = path.join(repoRoot, "tools.lock.json");

    expect(fs.existsSync(lockPath)).toBe(true);
    const lock = loadToolLock(lockPath);

    expect(lock.version).toBe(1);
    expect(lock.tools.rtk.tag).toBe("v0.43.0");
    expect(
      lock.tools.rtk.assets["rtk-x86_64-unknown-linux-musl.tar.gz"],
    ).toEqual({
      sha256:
        "ff8a1e7766496e175291a85aeca1dc97c9ff6df33e51e5893d1fbc78fea2a609",
    });
    expect(lock.tools.caveman.ref).toBe(
      "25d22f864ad68cc447a4cb93aefde918aa4aec9f",
    );
    expect(lock.tools.gsd.version).toBe("1.6.1");
    expect(lock.tools.graphify.version).toBe("0.9.11");
    expect(lock.tools.agentBrowser).toEqual({
      source: "npm",
      package: "agent-browser",
      version: "0.31.1",
    });
    expect(lock.tools.agentSkills.skillsCli).toEqual({
      source: "npm",
      package: "skills",
      version: "1.5.13",
    });
    expect(lock.tools.agentSkills.repositories.mattPocockSkills).toEqual({
      source: "github",
      repository: "mattpocock/skills",
      ref: "391a2701dd948f94f56a39f7533f8eea9a859c87",
    });
    expect(lock.tools.agentSkills.bundles["planning-skills"].skills).toEqual([
      { repository: "mattPocockSkills", skill: "grill-me" },
      { repository: "mattPocockSkills", skill: "grilling" },
      { repository: "mattPocockSkills", skill: "grill-with-docs" },
      { repository: "mattPocockSkills", skill: "domain-modeling" },
      { repository: "mattPocockSkills", skill: "codebase-design" },
      {
        repository: "mattPocockSkills",
        skill: "improve-codebase-architecture",
      },
    ]);
    expect(lock.runtimeClis.gemini.version).toBe("0.49.0");
  });

  it.each(
    invalidCatalogCases,
  )("rejects an Agent Skills catalog with %s", (_label, mutate) => {
    expect(() => loadToolLock(writeMutatedLock(mutate))).toThrow(
      "Invalid tools.lock.json",
    );
  });

  it("formats immutable package specs from locked versions", () => {
    expect(formatNpmPackageSpec("@opengsd/gsd-core", "1.6.1")).toBe(
      "@opengsd/gsd-core@1.6.1",
    );
    expect(formatNpmPackageSpec("@google/gemini-cli", "0.49.0")).toBe(
      "@google/gemini-cli@0.49.0",
    );
    expect(formatPythonPackageSpec("graphifyy", "0.9.11")).toBe(
      "graphifyy==0.9.11",
    );
    expect(
      formatGithubPackageSpec(
        "JuliusBrussee/caveman",
        "25d22f864ad68cc447a4cb93aefde918aa4aec9f",
      ),
    ).toBe(
      "github:JuliusBrussee/caveman#25d22f864ad68cc447a4cb93aefde918aa4aec9f",
    );
    expect(githubReleaseApiUrl("rtk-ai/rtk", "v0.43.0")).toBe(
      "https://api.github.com/repos/rtk-ai/rtk/releases/tags/v0.43.0",
    );
  });

  it("detects mutable external sources", () => {
    expect(isMutableExternalSource("@opengsd/gsd-core@latest")).toBe(true);
    expect(isMutableExternalSource("@opengsd/gsd-core")).toBe(true);
    expect(isMutableExternalSource("github:JuliusBrussee/caveman")).toBe(true);
    expect(isMutableExternalSource("github:JuliusBrussee/caveman#main")).toBe(
      true,
    );
    expect(isMutableExternalSource("graphifyy")).toBe(true);

    expect(isMutableExternalSource("@opengsd/gsd-core@1.6.1")).toBe(false);
    expect(isMutableExternalSource("graphifyy==0.9.11")).toBe(false);
    expect(
      isMutableExternalSource(
        "github:JuliusBrussee/caveman#25d22f864ad68cc447a4cb93aefde918aa4aec9f",
      ),
    ).toBe(false);
  });

  it("extracts the identity of an external source spec", () => {
    expect(externalSourceIdentity("@opengsd/gsd-core@1.6.1")).toBe(
      "@opengsd/gsd-core",
    );
    expect(externalSourceIdentity("@opengsd/gsd-core@latest")).toBe(
      "@opengsd/gsd-core",
    );
    expect(externalSourceIdentity("skills@1.5.13")).toBe("skills");
    expect(externalSourceIdentity("graphifyy==0.9.11")).toBe("graphifyy");
    expect(
      externalSourceIdentity(
        "github:JuliusBrussee/caveman#25d22f864ad68cc447a4cb93aefde918aa4aec9f",
      ),
    ).toBe("github:JuliusBrussee/caveman");
    expect(externalSourceIdentity("@attacker/evil@1.6.1")).not.toBe(
      externalSourceIdentity("@opengsd/gsd-core@1.6.1"),
    );
  });
});
