import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./context.js";

export type RuntimeCliLockName = "claude" | "codex" | "opencode" | "gemini";

export type ToolLock = {
  version: 1;
  tools: {
    rtk: {
      source: "github-release";
      repository: string;
      tag: string;
      assets: Record<string, { sha256: string }>;
    };
    caveman: {
      source: "github";
      repository: string;
      ref: string;
    };
    graphify: {
      source: "pypi";
      package: string;
      version: string;
    };
    gsd: {
      source: "npm";
      package: string;
      version: string;
    };
    improve: {
      source: "github";
      repository: string;
      ref: string;
      skill: string;
    };
    frontendSkills: {
      source: "skills-cli";
      skillsCli: {
        source: "npm";
        package: string;
        version: string;
      };
      impeccable: {
        source: "github";
        repository: string;
        ref: string;
        skill: string;
      };
      webDesignGuidelines: {
        source: "github";
        repository: string;
        ref: string;
        skill: string;
      };
      reactDoctor: {
        source: "github";
        repository: string;
        ref: string;
        skill: string;
      };
    };
    planningSkills: {
      source: "skills-cli";
      grillMe: {
        source: "github";
        repository: string;
        ref: string;
        skill: string;
      };
      grilling: {
        source: "github";
        repository: string;
        ref: string;
        skill: string;
      };
      grillWithDocs: {
        source: "github";
        repository: string;
        ref: string;
        skill: string;
      };
      domainModeling: {
        source: "github";
        repository: string;
        ref: string;
        skill: string;
      };
    };
  };
  runtimeClis: Record<
    RuntimeCliLockName,
    {
      source: "npm";
      package: string;
      version: string;
    }
  >;
};

const exactVersionPattern = /^[0-9]+(?:\.[0-9]+){1,3}(?:[-+][0-9A-Za-z.-]+)?$/;
const sha256Pattern = /^[a-f0-9]{64}$/i;
const fullGitShaPattern = /^[a-f0-9]{40}$/i;

export function formatNpmPackageSpec(
  packageName: string,
  version: string,
): string {
  return `${packageName}@${version}`;
}

export function formatPythonPackageSpec(
  packageName: string,
  version: string,
): string {
  return `${packageName}==${version}`;
}

export function formatGithubPackageSpec(
  repository: string,
  ref: string,
): string {
  return `github:${repository}#${ref}`;
}

export function githubReleaseApiUrl(repository: string, tag: string): string {
  return `https://api.github.com/repos/${repository}/releases/tags/${encodeURIComponent(tag)}`;
}

function npmVersionFromSpec(spec: string): string | null {
  if (spec.startsWith("@")) {
    const slashIndex = spec.indexOf("/");
    if (slashIndex === -1) return null;
    const versionIndex = spec.indexOf("@", slashIndex);
    return versionIndex === -1 ? null : spec.slice(versionIndex + 1);
  }

  const versionIndex = spec.lastIndexOf("@");
  return versionIndex <= 0 ? null : spec.slice(versionIndex + 1);
}

function isMutableVersion(version: string | null): boolean {
  if (!version) return true;
  if (["latest", "next", "canary", "beta", "alpha"].includes(version)) {
    return true;
  }
  return !exactVersionPattern.test(version);
}

export function isMutableExternalSource(spec: string): boolean {
  if (spec.startsWith("github:")) {
    const refIndex = spec.lastIndexOf("#");
    if (refIndex === -1) return true;
    return !fullGitShaPattern.test(spec.slice(refIndex + 1));
  }

  if (spec.includes("==")) {
    return isMutableVersion(spec.split("==").at(-1) ?? null);
  }

  return isMutableVersion(npmVersionFromSpec(spec));
}

export function externalSourceIdentity(spec: string): string {
  // github:owner/repo#ref -> github:owner/repo
  if (spec.startsWith("github:")) {
    const refIndex = spec.lastIndexOf("#");
    return refIndex === -1 ? spec : spec.slice(0, refIndex);
  }

  // pypi name==version -> name
  if (spec.includes("==")) {
    return spec.split("==")[0] ?? spec;
  }

  // npm name@version (scoped or bare) -> name
  if (spec.startsWith("@")) {
    const slashIndex = spec.indexOf("/");
    const versionIndex = slashIndex === -1 ? -1 : spec.indexOf("@", slashIndex);
    return versionIndex === -1 ? spec : spec.slice(0, versionIndex);
  }

  const versionIndex = spec.lastIndexOf("@");
  return versionIndex <= 0 ? spec : spec.slice(0, versionIndex);
}

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Invalid tools.lock.json: ${label} must be a string.`);
  }
}

function assertExactVersion(
  value: unknown,
  label: string,
): asserts value is string {
  assertString(value, label);
  if (isMutableVersion(value)) {
    throw new Error(
      `Invalid tools.lock.json: ${label} must be an exact version.`,
    );
  }
}

function assertGitSha(value: unknown, label: string): asserts value is string {
  assertString(value, label);
  if (!fullGitShaPattern.test(value)) {
    throw new Error(
      `Invalid tools.lock.json: ${label} must be a full commit SHA.`,
    );
  }
}

function assertSha256(value: unknown, label: string): asserts value is string {
  assertString(value, label);
  if (!sha256Pattern.test(value)) {
    throw new Error(
      `Invalid tools.lock.json: ${label} must be a SHA-256 hash.`,
    );
  }
}

function validateToolLock(lock: ToolLock): ToolLock {
  if (lock.version !== 1) {
    throw new Error("Invalid tools.lock.json: version must be 1.");
  }

  assertString(lock.tools.rtk.repository, "tools.rtk.repository");
  assertString(lock.tools.rtk.tag, "tools.rtk.tag");
  if (lock.tools.rtk.tag === "latest") {
    throw new Error(
      "Invalid tools.lock.json: tools.rtk.tag must not be latest.",
    );
  }
  for (const [assetName, asset] of Object.entries(lock.tools.rtk.assets)) {
    assertSha256(asset.sha256, `tools.rtk.assets.${assetName}.sha256`);
  }

  assertString(lock.tools.caveman.repository, "tools.caveman.repository");
  assertGitSha(lock.tools.caveman.ref, "tools.caveman.ref");
  assertString(lock.tools.graphify.package, "tools.graphify.package");
  assertExactVersion(lock.tools.graphify.version, "tools.graphify.version");
  assertString(lock.tools.gsd.package, "tools.gsd.package");
  assertExactVersion(lock.tools.gsd.version, "tools.gsd.version");
  assertString(lock.tools.improve.repository, "tools.improve.repository");
  assertGitSha(lock.tools.improve.ref, "tools.improve.ref");
  assertString(lock.tools.improve.skill, "tools.improve.skill");
  assertString(
    lock.tools.frontendSkills.skillsCli.package,
    "tools.frontendSkills.skillsCli.package",
  );
  assertExactVersion(
    lock.tools.frontendSkills.skillsCli.version,
    "tools.frontendSkills.skillsCli.version",
  );
  for (const skillName of [
    "impeccable",
    "webDesignGuidelines",
    "reactDoctor",
  ] as const) {
    const skill = lock.tools.frontendSkills[skillName];
    if (!skill) {
      throw new Error(
        `Invalid tools.lock.json: tools.frontendSkills.${skillName} must be defined.`,
      );
    }
    assertString(
      skill.repository,
      `tools.frontendSkills.${skillName}.repository`,
    );
    assertGitSha(skill.ref, `tools.frontendSkills.${skillName}.ref`);
    assertString(skill.skill, `tools.frontendSkills.${skillName}.skill`);
  }

  for (const skillName of [
    "grillMe",
    "grilling",
    "grillWithDocs",
    "domainModeling",
  ] as const) {
    const skill = lock.tools.planningSkills[skillName];
    if (!skill) {
      throw new Error(
        `Invalid tools.lock.json: tools.planningSkills.${skillName} must be defined.`,
      );
    }
    assertString(
      skill.repository,
      `tools.planningSkills.${skillName}.repository`,
    );
    assertGitSha(skill.ref, `tools.planningSkills.${skillName}.ref`);
    assertString(skill.skill, `tools.planningSkills.${skillName}.skill`);
  }

  for (const runtime of ["claude", "codex", "opencode", "gemini"] as const) {
    assertString(
      lock.runtimeClis[runtime].package,
      `runtimeClis.${runtime}.package`,
    );
    assertExactVersion(
      lock.runtimeClis[runtime].version,
      `runtimeClis.${runtime}.version`,
    );
  }

  return lock;
}

export function loadToolLock(
  lockPath = process.env.TOOLS_LOCK_PATH ||
    path.join(REPO_ROOT, "tools.lock.json"),
): ToolLock {
  const raw = fs.readFileSync(lockPath, "utf8");
  return validateToolLock(JSON.parse(raw) as ToolLock);
}
