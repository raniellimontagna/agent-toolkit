import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditSkills } from "../../src/skills-audit.js";

let tempDir: string;

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

function writeSkill(relativeDir: string, body: string): void {
  const skillDir = path.join(tempDir, relativeDir);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), body);
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agent-toolkit-skills-audit-"),
  );
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("skills audit", () => {
  it("audits the bundled Ariadne companion skills and their notices", () => {
    const skillsRoot = path.join(repoRoot, "skills");
    const report = auditSkills(skillsRoot);
    const expected = [
      [
        "ariadne",
        "ralph",
        "1de69bb4e0d53a32facbbc8a8732b945e6721ab0955fdefb27136e43fae860be",
      ],
      [
        "ariadne-prd",
        "prd",
        "f5395f014448e1e970cac40b8f814949b7fdbfe0b6db6be275be750895e955ca",
      ],
    ] as const;

    expect(report.issues).toEqual([]);
    for (const [name, source, hash] of expected) {
      const skillDir = path.join(skillsRoot, "workflow", name);
      const skill = fs.readFileSync(path.join(skillDir, "SKILL.md"), "utf8");
      const notice = fs.readFileSync(path.join(skillDir, "NOTICE.md"), "utf8");
      expect(skill).toMatch(new RegExp(`^name: ${name}$`, "m"));
      expect(notice).toContain("snarktank/ralph");
      expect(notice).toContain("6c53cb0b831ebe8739c6a003e22af14902d8b0b5");
      expect(notice).toContain("MIT");
      expect(notice).toContain(`skills/${source}/SKILL.md`);
      expect(notice).toContain(hash);
    }
  });

  it("passes valid skills with local Markdown references", () => {
    fs.mkdirSync(path.join(tempDir, "frontend/react/react-patterns/rules"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(tempDir, "frontend/react/react-patterns/rules/hooks.md"),
      "# Hooks\n",
    );
    writeSkill(
      "frontend/react/react-patterns",
      `---
name: react-patterns
description: React patterns.
---

# React Patterns

See [hooks](rules/hooks.md).
`,
    );

    expect(auditSkills(tempDir).issues).toEqual([]);
  });

  it("reports invalid metadata and broken local Markdown references", () => {
    writeSkill(
      "broken-skill",
      `---
name: Broken Skill
description: Broken skill.
---

# Broken

See [missing](rules/missing.md).
`,
    );

    expect(auditSkills(tempDir).issues).toEqual([
      {
        file: path.join(tempDir, "broken-skill/SKILL.md"),
        message: "Invalid skill name: Broken Skill",
      },
      {
        file: path.join(tempDir, "broken-skill/SKILL.md"),
        message: "Broken local Markdown link: rules/missing.md",
      },
    ]);
  });
  it("flags skills that share a directory name across categories", () => {
    const frontmatter = (name: string) =>
      `---\nname: ${name}\ndescription: Duplicate name check.\n---\n\n# ${name}\n`;

    writeSkill("frontend/design/ui-ux-pro-max", frontmatter("ui-ux-pro-max"));
    writeSkill("general/ui-ux-pro-max", frontmatter("ui-ux-pro-max"));

    const issues = auditSkills(tempDir).issues;

    expect(issues).toHaveLength(2);
    for (const issue of issues) {
      expect(issue.message).toContain(
        'Duplicate skill directory name "ui-ux-pro-max"',
      );
      expect(issue.message).toContain("overwrite each other");
    }
    expect(issues.map((issue) => issue.file).sort()).toEqual([
      "frontend/design/ui-ux-pro-max",
      "general/ui-ux-pro-max",
    ]);
  });

  it("accepts the same skill name when only one directory uses it", () => {
    writeSkill(
      "frontend/accessibility",
      "---\nname: accessibility\ndescription: Only one.\n---\n\n# Accessibility\n",
    );

    expect(auditSkills(tempDir).issues).toEqual([]);
  });

  it("rejects BRIEF.md files that exceed the platform prompt budget", () => {
    writeSkill(
      "frontend/accessibility",
      "---\nname: accessibility\ndescription: Accessible interfaces.\n---\n\n# Accessibility\n",
    );
    fs.writeFileSync(
      path.join(tempDir, "frontend/accessibility", "BRIEF.md"),
      "a".repeat(2501),
    );

    expect(auditSkills(tempDir).issues).toEqual([
      {
        file: path.join(tempDir, "frontend/accessibility/BRIEF.md"),
        message: "BRIEF.md must be non-empty and at most 2500 characters",
      },
    ]);
  });
});
