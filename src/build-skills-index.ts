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
  writeSkillsIndex(sourceSkillsDir, path.join(repoRoot, "skills.index.json"));
}

export function stageAgentSkillsPackage(
  repoRoot: string,
  stagingRoot: string,
): void {
  const sourceSkillsDir = path.join(repoRoot, "skills");
  const packageRoot = path.join(repoRoot, "packages", "agent-skills");
  const stagingSkillsDir = path.join(stagingRoot, "skills");

  if (path.resolve(stagingRoot) === path.resolve(packageRoot)) {
    throw new Error("Agent Skills staging must not overwrite package metadata");
  }
  if (fs.existsSync(stagingRoot)) {
    throw new Error("Agent Skills staging destination already exists");
  }

  fs.mkdirSync(stagingRoot, { recursive: true });
  for (const file of ["package.json", "README.md"]) {
    fs.copyFileSync(path.join(packageRoot, file), path.join(stagingRoot, file));
  }
  fs.copyFileSync(
    path.join(repoRoot, "LICENSE"),
    path.join(stagingRoot, "LICENSE"),
  );

  for (const ref of sharedSkillRefs) {
    const source = path.join(sourceSkillsDir, ref);
    if (!fs.existsSync(path.join(source, "SKILL.md"))) {
      throw new Error(`Shared skill source is missing: skills/${ref}/SKILL.md`);
    }
    fs.cpSync(source, path.join(stagingSkillsDir, ref), { recursive: true });
  }
  writeSkillsIndex(
    stagingSkillsDir,
    path.join(stagingRoot, "skills.index.json"),
  );
}

const invokedFile = process.argv[1];
if (
  invokedFile &&
  path.resolve(invokedFile) === fileURLToPath(import.meta.url)
) {
  buildSkillsArtifacts();
}
