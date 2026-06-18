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
});
