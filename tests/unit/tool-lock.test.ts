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
    ariadne: {
      repository: string;
      ref: string;
      license: { path: string; sha256: string };
      sources: Record<string, { path: string; sha256: string }>;
    };
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

const expectedAriadneLock = {
  source: "github",
  repository: "snarktank/ralph",
  ref: "6c53cb0b831ebe8739c6a003e22af14902d8b0b5",
  license: {
    path: "LICENSE",
    sha256: "102b6470e861e782d90a42d9086f48b8a2f38cbc4c0229216bcf0364f79ea5a3",
  },
  sources: {
    prd: {
      path: "skills/prd/SKILL.md",
      sha256:
        "f5395f014448e1e970cac40b8f814949b7fdbfe0b6db6be275be750895e955ca",
    },
    ralph: {
      path: "skills/ralph/SKILL.md",
      sha256:
        "1de69bb4e0d53a32facbbc8a8732b945e6721ab0955fdefb27136e43fae860be",
    },
  },
} as const;

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
    expect(lock.tools.rtk.tag).toBe("v0.44.0");
    expect(
      lock.tools.rtk.assets["rtk-x86_64-unknown-linux-musl.tar.gz"],
    ).toEqual({
      sha256:
        "3c3316cfc068e372432b415faeab73d46f8047750d488dd94d01d8d9f016a2a1",
    });
    expect(lock.tools.caveman.ref).toBe(
      "0d95a81d35a9f2d123a5e9430d1cfc43d55f1bb0",
    );
    expect(lock.tools.gsd.version).toBe("1.8.0");
    expect(lock.tools.graphify.version).toBe("0.9.29");
    expect(lock.tools.agentBrowser).toEqual({
      source: "npm",
      package: "agent-browser",
      version: "0.33.1",
    });
    expect(lock.tools.agentSkills.skillsCli).toEqual({
      source: "npm",
      package: "skills",
      version: "1.5.20",
    });
    expect(lock.tools.agentSkills.repositories.mattPocockSkills).toEqual({
      source: "github",
      repository: "mattpocock/skills",
      ref: "2ab958093e83e0ec752e6c1c5932da465bf23e0c",
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
    expect(lock.tools.ariadne).toEqual(expectedAriadneLock);
    expect(lock.runtimeClis.gemini.version).toBe("0.52.0");
  });

  it.each([
    [
      "mutable ref",
      (lock: MutableCatalogLock) => (lock.tools.ariadne.ref = "main"),
    ],
    [
      "unsafe license path",
      (lock: MutableCatalogLock) =>
        (lock.tools.ariadne.license.path = "../LICENSE"),
    ],
    [
      "malformed source hash",
      (lock: MutableCatalogLock) =>
        (lock.tools.ariadne.sources.prd = {
          path: "skills/prd/SKILL.md",
          sha256: "not-a-sha256",
        }),
    ],
    [
      "wrong repository identity",
      (lock: MutableCatalogLock) =>
        (lock.tools.ariadne.repository = "other/ralph"),
    ],
    [
      "missing PRD source",
      (lock: MutableCatalogLock) => delete lock.tools.ariadne.sources.prd,
    ],
    [
      "missing Ralph source",
      (lock: MutableCatalogLock) => delete lock.tools.ariadne.sources.ralph,
    ],
  ])("rejects Ariadne provenance with %s", (_label, mutate) => {
    expect(() => loadToolLock(writeMutatedLock(mutate))).toThrow(
      "Invalid tools.lock.json",
    );
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
    expect(formatNpmPackageSpec("@google/gemini-cli", "0.52.0")).toBe(
      "@google/gemini-cli@0.52.0",
    );
    expect(formatPythonPackageSpec("graphifyy", "0.9.29")).toBe(
      "graphifyy==0.9.29",
    );
    expect(
      formatGithubPackageSpec(
        "JuliusBrussee/caveman",
        "0d95a81d35a9f2d123a5e9430d1cfc43d55f1bb0",
      ),
    ).toBe(
      "github:JuliusBrussee/caveman#0d95a81d35a9f2d123a5e9430d1cfc43d55f1bb0",
    );
    expect(githubReleaseApiUrl("rtk-ai/rtk", "v0.44.0")).toBe(
      "https://api.github.com/repos/rtk-ai/rtk/releases/tags/v0.44.0",
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
    expect(isMutableExternalSource("graphifyy==0.9.29")).toBe(false);
    expect(
      isMutableExternalSource(
        "github:JuliusBrussee/caveman#0d95a81d35a9f2d123a5e9430d1cfc43d55f1bb0",
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
    expect(externalSourceIdentity("skills@1.5.20")).toBe("skills");
    expect(externalSourceIdentity("graphifyy==0.9.29")).toBe("graphifyy");
    expect(
      externalSourceIdentity(
        "github:JuliusBrussee/caveman#0d95a81d35a9f2d123a5e9430d1cfc43d55f1bb0",
      ),
    ).toBe("github:JuliusBrussee/caveman");
    expect(externalSourceIdentity("@attacker/evil@1.6.1")).not.toBe(
      externalSourceIdentity("@opengsd/gsd-core@1.6.1"),
    );
  });
});
