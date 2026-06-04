import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  availableSkillPackages,
  availableSkillScopes,
  discoverSkillDirs,
  listCustomSkills,
  parseSkillMetadata,
  selectedSkillDirs,
} from "../../src/skills.js";
import { state } from "../../src/state.js";

let tempDir: string;
let originalCustomSkillsDir: string;
let originalSkillScopes: string[];
let originalSkillPackages: string[];

function writeSkill(
  relativeDir: string,
  frontmatter: { name?: string; description?: string } = {},
): string {
  const skillDir = path.join(tempDir, relativeDir);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "SKILL.md"),
    `---
name: ${frontmatter.name || path.basename(relativeDir)}
description: ${frontmatter.description || "Skill used by unit tests."}
---

# Test Skill
`,
  );
  return skillDir;
}

function relativeSkillPaths(skillDirs: string[]): string[] {
  return skillDirs.map((skillDir) =>
    path.relative(tempDir, skillDir).replace(/\\/g, "/"),
  );
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-toolkit-skills-"));
  originalCustomSkillsDir = state.customSkillsDir;
  originalSkillScopes = [...state.skillScopes];
  originalSkillPackages = [...state.skillPackages];
  state.customSkillsDir = tempDir;
  state.skillScopes = [];
  state.skillPackages = [];
});

afterEach(() => {
  state.customSkillsDir = originalCustomSkillsDir;
  state.skillScopes = originalSkillScopes;
  state.skillPackages = originalSkillPackages;
  fs.rmSync(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("skill discovery", () => {
  it("keeps third-party frontend skills out of bundled personal skills", () => {
    const repoSkillsRoot = path.join(process.cwd(), "skills");
    state.customSkillsDir = repoSkillsRoot;

    const skillDirs = discoverSkillDirs();
    const repoRelativeSkillPaths = skillDirs.map((skillDir) =>
      path.relative(repoSkillsRoot, skillDir).replace(/\\/g, "/"),
    );

    expect(repoRelativeSkillPaths).not.toContain("frontend/design/impeccable");
    expect(repoRelativeSkillPaths).not.toContain("frontend/design/taste-skill");
  });

  it("discovers skills recursively and returns them sorted by repository path", () => {
    writeSkill("frontend/react/react-patterns");
    writeSkill("backend/node/fastify-patterns");
    writeSkill("backend/go/go-patterns");

    expect(relativeSkillPaths(discoverSkillDirs())).toEqual([
      "backend/go/go-patterns",
      "backend/node/fastify-patterns",
      "frontend/react/react-patterns",
    ]);
  });

  it("derives available scope paths from discovered skill directories", () => {
    const skillDirs = [
      writeSkill("frontend/react/react-patterns"),
      writeSkill("backend/node/fastify-patterns"),
    ];

    expect(availableSkillScopes(skillDirs)).toEqual([
      "backend",
      "backend/node",
      "frontend",
      "frontend/react",
    ]);
  });

  it("derives and filters selectable first-level skill packages", () => {
    writeSkill("core/agent-toolkit-maintainer");
    writeSkill("frontend/react/react-patterns");
    writeSkill("backend/node/fastify-patterns");
    state.skillPackages = ["backend", "core"];

    expect(availableSkillPackages(discoverSkillDirs())).toEqual([
      "backend",
      "core",
      "frontend",
    ]);
    expect(relativeSkillPaths(selectedSkillDirs())).toEqual([
      "backend/node/fastify-patterns",
      "core/agent-toolkit-maintainer",
    ]);
  });

  it("combines package and scope filters when selecting skills", () => {
    writeSkill("backend/node/fastify-patterns");
    writeSkill("backend/go/go-patterns");
    writeSkill("frontend/react/react-patterns");
    state.skillPackages = ["backend"];
    state.skillScopes = ["backend/node"];

    expect(relativeSkillPaths(selectedSkillDirs())).toEqual([
      "backend/node/fastify-patterns",
    ]);
  });

  it("lists only skills matching the selected scope", () => {
    writeSkill("frontend/react/react-patterns", {
      name: "react-patterns",
      description: "React patterns.",
    });
    writeSkill("backend/node/fastify-patterns", {
      name: "fastify-patterns",
      description: "Fastify patterns.",
    });
    state.skillScopes = ["frontend/react"];

    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    expect(listCustomSkills()).toBe(true);
    expect(log.mock.calls.map((call) => call.join(" "))).toEqual([
      "Custom Skills",
      "  - frontend/react/react-patterns - React patterns.",
    ]);
  });
});

describe("skill metadata parsing", () => {
  it("parses frontmatter metadata values", () => {
    const skillDir = writeSkill("backend/go/go-patterns", {
      name: "go-patterns",
      description: '"Go patterns."',
    });

    expect(parseSkillMetadata(path.join(skillDir, "SKILL.md"))).toEqual({
      metadata: {
        name: "go-patterns",
        description: "Go patterns.",
      },
    });
  });

  it("reports missing frontmatter boundaries", () => {
    const skillFile = path.join(tempDir, "SKILL.md");
    fs.writeFileSync(skillFile, "---\nname: broken\n");

    expect(parseSkillMetadata(skillFile)).toEqual({
      error: `Invalid skill frontmatter in ${skillFile}: missing closing ---`,
    });
  });
});
