import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { auditSkills } from "../../src/skills-audit.js";

let tempDir: string;

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
      expect(issue.message).toContain('Duplicate skill directory name "ui-ux-pro-max"');
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
});
