import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateSkillsIndex } from "../../src/skills-index.js";

let tempDir: string;

function writeSkill(relativeDir: string, name: string): void {
  const skillDir = path.join(tempDir, relativeDir);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${name} description.\n---\n\n# ${name}\n`,
  );
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agent-toolkit-skills-index-"),
  );
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("skills index", () => {
  it("creates a deterministic index ordered by skill reference", () => {
    writeSkill("frontend/zebra", "zebra");
    writeSkill("backend/api/alpha", "alpha");
    fs.writeFileSync(path.join(tempDir, "frontend/zebra", "BRIEF.md"), "Brief");

    expect(generateSkillsIndex(tempDir)).toEqual({
      version: 1,
      skills: [
        {
          name: "alpha",
          ref: "backend/api/alpha",
          path: "skills/backend/api/alpha/SKILL.md",
          brief: null,
        },
        {
          name: "zebra",
          ref: "frontend/zebra",
          path: "skills/frontend/zebra/SKILL.md",
          brief: "skills/frontend/zebra/BRIEF.md",
        },
      ],
    });
  });
});
