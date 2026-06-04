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
    expect(lock.tools.rtk.tag).toBe("v0.42.1");
    expect(
      lock.tools.rtk.assets["rtk-x86_64-unknown-linux-musl.tar.gz"],
    ).toEqual({
      sha256:
        "a37ca300a42510a964453f2bc2e217769ef0872780af802db8a7d698f1da2465",
    });
    expect(lock.tools.caveman.ref).toBe(
      "655b7d9c5431f822264b7732e9901c5578ac84cf",
    );
    expect(lock.tools.gsd.version).toBe("1.42.3");
    expect(lock.tools.graphify.version).toBe("0.8.31");
    expect(lock.tools.frontendSkills.skillsCli.version).toBe("1.5.10");
    expect(lock.tools.frontendSkills.impeccable.ref).toBe(
      "1d5d745823aae7019044e8b0a621af4366dae224",
    );
    expect(lock.tools.frontendSkills.tasteSkill.ref).toBe(
      "3c7017d636c3a4aad378433ea6d0cfa6c921da4a",
    );
    expect(lock.runtimeClis.gemini.version).toBe("0.45.0");
  });

  it("formats immutable package specs from locked versions", () => {
    expect(formatNpmPackageSpec("get-shit-done-cc", "1.42.3")).toBe(
      "get-shit-done-cc@1.42.3",
    );
    expect(formatNpmPackageSpec("@google/gemini-cli", "0.45.0")).toBe(
      "@google/gemini-cli@0.45.0",
    );
    expect(formatPythonPackageSpec("graphifyy", "0.8.31")).toBe(
      "graphifyy==0.8.31",
    );
    expect(
      formatGithubPackageSpec(
        "JuliusBrussee/caveman",
        "655b7d9c5431f822264b7732e9901c5578ac84cf",
      ),
    ).toBe(
      "github:JuliusBrussee/caveman#655b7d9c5431f822264b7732e9901c5578ac84cf",
    );
    expect(githubReleaseApiUrl("rtk-ai/rtk", "v0.42.1")).toBe(
      "https://api.github.com/repos/rtk-ai/rtk/releases/tags/v0.42.1",
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
    expect(isMutableExternalSource("graphifyy==0.8.31")).toBe(false);
    expect(
      isMutableExternalSource(
        "github:JuliusBrussee/caveman#655b7d9c5431f822264b7732e9901c5578ac84cf",
      ),
    ).toBe(false);
  });
});
