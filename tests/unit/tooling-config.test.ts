import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { configDefaults } from "vitest/config";
import vitestConfig from "../../vitest.config.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

function normalizeGlob(glob: string): string {
  return glob.replaceAll("\\", "/").replace(/^\.\//, "");
}

describe("tooling configuration", () => {
  it("excludes embedded worktrees from Biome", () => {
    const biomeConfig = JSON.parse(
      fs.readFileSync(path.join(repoRoot, "biome.json"), "utf8"),
    ) as { files: { includes: string[] } };

    expect(biomeConfig.files.includes.map(normalizeGlob)).toContain(
      "!.worktrees",
    );
  });

  it("excludes embedded worktrees from Vitest without replacing defaults", () => {
    const config = vitestConfig as { test?: { exclude?: string[] } };
    const excludes = (config.test?.exclude ?? []).map(normalizeGlob);
    const defaultExcludes = configDefaults.exclude.map(normalizeGlob);

    expect(excludes).toContain(".worktrees/**");
    expect(excludes).toEqual(expect.arrayContaining(defaultExcludes));
  });
});
