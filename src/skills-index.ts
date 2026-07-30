import fs from "node:fs";
import path from "node:path";
import { parseSkillMetadata } from "./skills.js";

export type SkillsIndexEntry = {
  name: string;
  ref: string;
  path: string;
  brief: string | null;
};

export type SkillsIndex = {
  version: 1;
  skills: SkillsIndexEntry[];
};

function discoverSkillDirectories(skillsDir: string): string[] {
  const found: string[] = [];
  const visit = (dir: string): void => {
    if (fs.existsSync(path.join(dir, "SKILL.md"))) {
      found.push(dir);
      return;
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        visit(path.join(dir, entry.name));
      }
    }
  };
  visit(skillsDir);
  return found;
}

export function generateSkillsIndex(skillsDir: string): SkillsIndex {
  const skills = discoverSkillDirectories(skillsDir).map((skillDir) => {
    const skillFile = path.join(skillDir, "SKILL.md");
    const parsed = parseSkillMetadata(skillFile);
    if ("error" in parsed || !parsed.metadata.name) {
      throw new Error(`Cannot index skill without a valid name: ${skillFile}`);
    }
    const ref = path.relative(skillsDir, skillDir).replace(/\\/g, "/");
    const briefFile = path.join(skillDir, "BRIEF.md");
    return {
      name: parsed.metadata.name,
      ref,
      path: `skills/${ref}/SKILL.md`,
      brief: fs.existsSync(briefFile) ? `skills/${ref}/BRIEF.md` : null,
    };
  });
  skills.sort((left, right) => left.ref.localeCompare(right.ref));
  return { version: 1, skills };
}

export function writeSkillsIndex(skillsDir: string, outputFile: string): void {
  const index = generateSkillsIndex(skillsDir);
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, `${JSON.stringify(index, null, 2)}\n`);
}
