import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
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
    expect(lock.tools.graphify.version).toBe("0.8.51");
    expect(lock.tools.improve.ref).toBe(
      "03369ee6d7cafbfcecc4346539b05b3dc0a603bb",
    );
    expect(lock.tools.frontendSkills.skillsCli.version).toBe("1.5.13");
    expect(lock.tools.frontendSkills.impeccable.ref).toBe(
      "3590bf9e37c84ecbc92f9c205ce1aebf2185a971",
    );
    expect(lock.tools.frontendSkills.tasteSkill.ref).toBe(
      "06d6028b5c623016c59ce8536f578e5a1127b499",
    );
    expect(lock.tools.frontendSkills.reactDoctor).toEqual({
      source: "github",
      repository: "millionco/react-doctor",
      ref: "aa519e5f5505105ef8c00e1b1972c98514f7577a",
      skill: "react-doctor",
    });
    expect(lock.runtimeClis.gemini.version).toBe("0.49.0");
  });

  it("formats immutable package specs from locked versions", () => {
    expect(formatNpmPackageSpec("@opengsd/gsd-core", "1.6.1")).toBe(
      "@opengsd/gsd-core@1.6.1",
    );
    expect(formatNpmPackageSpec("@google/gemini-cli", "0.49.0")).toBe(
      "@google/gemini-cli@0.49.0",
    );
    expect(formatPythonPackageSpec("graphifyy", "0.8.51")).toBe(
      "graphifyy==0.8.51",
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
    expect(isMutableExternalSource("graphifyy==0.8.51")).toBe(false);
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
    expect(externalSourceIdentity("graphifyy==0.8.51")).toBe("graphifyy");
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
