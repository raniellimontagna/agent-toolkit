import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { sharedSkillRefs } from "../../src/build-skills-index.js";
import { generateSkillsIndex } from "../../src/skills-index.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const packageRoot = path.join(repoRoot, "packages", "agent-skills");

describe("@ranimontagna/agent-skills", () => {
  it("exposes a review-only pack command without coupling it to toolkit publication", () => {
    const rootPackageJson = JSON.parse(
      fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };

    expect(rootPackageJson.scripts["pack:skills"]).toBe(
      "pnpm --filter @ranimontagna/agent-skills pack --dry-run",
    );
    expect(rootPackageJson.scripts["release:patch"]).not.toContain(
      "@ranimontagna/agent-skills",
    );
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
    };

    expect(packageJson.name).toBe("@ranimontagna/agent-skills");
    expect(packageJson.dependencies).toBeUndefined();
    expect(packageJson.devDependencies).toBeUndefined();
    expect(packageJson.engines).toBeUndefined();
    expect(packageJson.main).toBeUndefined();
    expect(packageJson.bin).toBeUndefined();

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
});
