import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildSkillsArtifacts,
  sharedSkillRefs,
} from "../../src/build-skills-index.js";
import { generateSkillsIndex } from "../../src/skills-index.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const packageRoot = path.join(repoRoot, "packages", "agent-skills");

describe("@ranimontagna/agent-skills", () => {
  it("uses an independent release tag namespace and provenance workflow", () => {
    const rootPackageJson = JSON.parse(
      fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };

    expect(rootPackageJson.scripts["pack:skills"]).toBe(
      "pnpm --filter @ranimontagna/agent-skills pack --dry-run",
    );
    expect(rootPackageJson.scripts["release:patch"]).not.toContain(
      "@ranimontagna/agent-skills",
    );

    const workflowPath = path.join(
      repoRoot,
      ".github",
      "workflows",
      "release-agent-skills.yml",
    );
    expect(fs.existsSync(workflowPath)).toBe(true);
    if (!fs.existsSync(workflowPath)) return;

    const workflow = fs.readFileSync(workflowPath, "utf8");
    expect(workflow).toContain('- "agent-skills-v*"');
    expect(workflow).toMatch(
      /expected_tag="agent-skills-v\$\{package_version\}"/,
    );
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("packages/agent-skills/package.json");
    expect(workflow).toContain("working-directory: packages/agent-skills");
    expect(workflow).toContain(
      'bash ../../scripts/publish-npm-with-retry.sh "$package_name" "$package_version"',
    );
    expect(
      fs.readFileSync(
        path.join(repoRoot, "scripts", "publish-npm-with-retry.sh"),
        "utf8",
      ),
    ).toContain("npm publish --provenance --access public");
  });

  it("contains exactly the nine shared skills as a dependency-free markdown package", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"),
    ) as {
      name: string;
      dependencies?: unknown;
      devDependencies?: unknown;
      engines?: unknown;
      main?: unknown;
      bin?: unknown;
      scripts?: unknown;
    };

    expect(packageJson.name).toBe("@ranimontagna/agent-skills");
    expect(packageJson.dependencies).toBeUndefined();
    expect(packageJson.devDependencies).toBeUndefined();
    expect(packageJson.engines).toBeUndefined();
    expect(packageJson.main).toBeUndefined();
    expect(packageJson.bin).toBeUndefined();
    expect(packageJson.scripts).toBeUndefined();

    const index = generateSkillsIndex(path.join(packageRoot, "skills"));
    expect(index.skills.map((skill) => skill.ref)).toEqual(sharedSkillRefs);
    expect(index.skills.every((skill) => skill.brief !== null)).toBe(true);

    for (const ref of sharedSkillRefs) {
      for (const file of ["SKILL.md", "BRIEF.md"]) {
        expect(
          fs.readFileSync(path.join(packageRoot, "skills", ref, file), "utf8"),
        ).toBe(
          fs.readFileSync(path.join(repoRoot, "skills", ref, file), "utf8"),
        );
      }
    }

    expect(
      JSON.parse(
        fs.readFileSync(path.join(packageRoot, "skills.index.json"), "utf8"),
      ),
    ).toEqual(index);
  });

  it("generates and packs a standalone payload with the root license and index", () => {
    const tempRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "agent-skills-package-"),
    );

    try {
      const tempPackageRoot = path.join(tempRoot, "packages", "agent-skills");
      fs.mkdirSync(tempPackageRoot, { recursive: true });
      fs.copyFileSync(
        path.join(repoRoot, "LICENSE"),
        path.join(tempRoot, "LICENSE"),
      );
      for (const file of ["package.json", "README.md"]) {
        fs.copyFileSync(
          path.join(packageRoot, file),
          path.join(tempPackageRoot, file),
        );
      }
      for (const ref of sharedSkillRefs) {
        fs.cpSync(
          path.join(repoRoot, "skills", ref),
          path.join(tempRoot, "skills", ref),
          { recursive: true },
        );
      }

      buildSkillsArtifacts(tempRoot);

      const packOutput = execFileSync("npm", ["pack", "--json"], {
        cwd: tempPackageRoot,
        encoding: "utf8",
      });
      const packResults = JSON.parse(packOutput) as Array<{
        filename: string;
        files: Array<{ path: string }>;
      }>;
      expect(packResults).toHaveLength(1);
      const packResult = packResults[0];
      if (!packResult) throw new Error("npm pack returned no package metadata");
      const payload = packResult.files.map((file) => file.path).sort();

      expect(payload).toContain("LICENSE");
      expect(payload).toContain("README.md");
      expect(payload).toContain("package.json");
      expect(payload).toContain("skills.index.json");
      expect(
        payload.every(
          (file) =>
            file === "LICENSE" ||
            file === "README.md" ||
            file === "package.json" ||
            file === "skills.index.json" ||
            file.startsWith("skills/"),
        ),
      ).toBe(true);
      for (const ref of sharedSkillRefs) {
        expect(payload).toContain(`skills/${ref}/SKILL.md`);
        expect(payload).toContain(`skills/${ref}/BRIEF.md`);
      }

      const tarball = path.join(tempPackageRoot, packResult.filename);
      const packedLicense = execFileSync(
        "tar",
        ["-xOf", tarball, "package/LICENSE"],
        { encoding: "utf8" },
      );
      const packedIndex = JSON.parse(
        execFileSync("tar", ["-xOf", tarball, "package/skills.index.json"], {
          encoding: "utf8",
        }),
      );

      expect(packedLicense).toBe(
        fs.readFileSync(path.join(repoRoot, "LICENSE"), "utf8"),
      );
      expect(packedIndex).toEqual(
        generateSkillsIndex(path.join(tempPackageRoot, "skills")),
      );
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }, 30_000);
});
