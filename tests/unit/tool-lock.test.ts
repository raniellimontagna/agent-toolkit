import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
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
    expect(lock.tools.rtk.tag).toBe("v0.42.4");
    expect(
      lock.tools.rtk.assets["rtk-x86_64-unknown-linux-musl.tar.gz"],
    ).toEqual({
      sha256:
        "34975116da11e09e502501daf758143e0b22ed3a42a10eb67fb693a6270d9e36",
    });
    expect(lock.tools.caveman.ref).toBe(
      "25d22f864ad68cc447a4cb93aefde918aa4aec9f",
    );
    expect(lock.tools.gsd.version).toBe("1.42.3");
    expect(lock.tools.graphify.version).toBe("0.8.41");
    expect(lock.tools.improve.ref).toBe(
      "03369ee6d7cafbfcecc4346539b05b3dc0a603bb",
    );
    expect(lock.tools.frontendSkills.skillsCli.version).toBe("1.5.11");
    expect(lock.tools.frontendSkills.impeccable.ref).toBe(
      "1c897a09c86ea7ed7e5cc3affaabcbbb46a05a7d",
    );
    expect(lock.tools.frontendSkills.tasteSkill.ref).toBe(
      "5285855df6719b6efb95d5268359e752d3d79045",
    );
    expect(lock.runtimeClis.gemini.version).toBe("0.47.0");
  });

  it("formats immutable package specs from locked versions", () => {
    expect(formatNpmPackageSpec("get-shit-done-cc", "1.42.3")).toBe(
      "get-shit-done-cc@1.42.3",
    );
    expect(formatNpmPackageSpec("@google/gemini-cli", "0.47.0")).toBe(
      "@google/gemini-cli@0.47.0",
    );
    expect(formatPythonPackageSpec("graphifyy", "0.8.41")).toBe(
      "graphifyy==0.8.41",
    );
    expect(
      formatGithubPackageSpec(
        "JuliusBrussee/caveman",
        "25d22f864ad68cc447a4cb93aefde918aa4aec9f",
      ),
    ).toBe(
      "github:JuliusBrussee/caveman#25d22f864ad68cc447a4cb93aefde918aa4aec9f",
    );
    expect(githubReleaseApiUrl("rtk-ai/rtk", "v0.42.4")).toBe(
      "https://api.github.com/repos/rtk-ai/rtk/releases/tags/v0.42.4",
    );
  });

  it("detects mutable external sources", () => {
    expect(isMutableExternalSource("get-shit-done-cc@latest")).toBe(true);
    expect(isMutableExternalSource("get-shit-done-cc")).toBe(true);
    expect(isMutableExternalSource("github:JuliusBrussee/caveman")).toBe(true);
    expect(isMutableExternalSource("github:JuliusBrussee/caveman#main")).toBe(
      true,
    );
    expect(isMutableExternalSource("graphifyy")).toBe(true);

    expect(isMutableExternalSource("get-shit-done-cc@1.42.3")).toBe(false);
    expect(isMutableExternalSource("graphifyy==0.8.41")).toBe(false);
    expect(
      isMutableExternalSource(
        "github:JuliusBrussee/caveman#25d22f864ad68cc447a4cb93aefde918aa4aec9f",
      ),
    ).toBe(false);
  });
});
