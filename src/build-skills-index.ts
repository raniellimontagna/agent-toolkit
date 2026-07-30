import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REPO_ROOT } from "./context.js";
import { writeSkillsIndex } from "./skills-index.js";

export const sharedSkillRefs = [
  "frontend/accessibility",
  "frontend/astro/astro-react-landing",
  "frontend/design/frontend-design",
  "frontend/design/ui-ux-pro-max",
  "frontend/gsap/gsap-motion",
  "frontend/seo/seo-page",
  "quality/biome-formatting",
  "research/instagram-public-research",
  "research/research-data-collection",
] as const;

export function buildSkillsArtifacts(repoRoot = REPO_ROOT): void {
  const sourceSkillsDir = path.join(repoRoot, "skills");
  const packageRoot = path.join(repoRoot, "packages", "agent-skills");
  const packageSkillsDir = path.join(packageRoot, "skills");

  writeSkillsIndex(sourceSkillsDir, path.join(repoRoot, "skills.index.json"));
  fs.rmSync(packageSkillsDir, { recursive: true, force: true });
  for (const ref of sharedSkillRefs) {
    const source = path.join(sourceSkillsDir, ref);
    if (!fs.existsSync(path.join(source, "SKILL.md"))) {
      throw new Error(`Shared skill source is missing: skills/${ref}/SKILL.md`);
    }
    fs.cpSync(source, path.join(packageSkillsDir, ref), { recursive: true });
  }
  writeSkillsIndex(
    packageSkillsDir,
    path.join(packageRoot, "skills.index.json"),
  );
}

const invokedFile = process.argv[1];
if (
  invokedFile &&
  path.resolve(invokedFile) === fileURLToPath(import.meta.url)
) {
  buildSkillsArtifacts();
}
