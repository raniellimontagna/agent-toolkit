import fs from "node:fs";
import path from "node:path";
import { HOME } from "./context.js";
import { err, ok, step, warn } from "./logger.js";
import {
  normalizedSkillPackages,
  normalizedSkillScopes,
  type RuntimeName,
  runtimeNames,
  state,
} from "./state.js";
import { commandExists, findCommand, run } from "./system.js";

type SkillMetadata = Record<string, string>;
type SkillMetadataResult = { metadata: SkillMetadata } | { error: string };

function opencodeConfigDir(): string {
  if (process.env.OPENCODE_CONFIG_DIR) return process.env.OPENCODE_CONFIG_DIR;
  if (process.env.OPENCODE_CONFIG)
    return path.dirname(process.env.OPENCODE_CONFIG);
  if (process.env.XDG_CONFIG_HOME)
    return path.join(process.env.XDG_CONFIG_HOME, "opencode");
  return path.join(HOME, ".config", "opencode");
}

function geminiConfigDir(): string {
  return process.env.GEMINI_CONFIG_DIR || path.join(HOME, ".gemini");
}

export function skillsTargetDir(runtime: RuntimeName): string {
  if (state.gsdScope === "local") {
    return path.join(process.cwd(), `.${runtime}`, "skills");
  }

  switch (runtime) {
    case "claude":
      return path.join(
        process.env.CLAUDE_CONFIG_DIR || path.join(HOME, ".claude"),
        "skills",
      );
    case "codex":
      return path.join(
        process.env.CODEX_HOME || path.join(HOME, ".codex"),
        "skills",
      );
    case "opencode":
      return path.join(opencodeConfigDir(), "skills");
    case "gemini":
      return path.join(geminiConfigDir(), "skills");
  }
}

export function parseSkillMetadata(filePath: string): SkillMetadataResult {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);
  if (lines[0] !== "---") {
    return {
      error: `Invalid skill frontmatter in ${filePath}: first line must be ---`,
    };
  }

  const closing = lines.findIndex((line, index) => index > 0 && line === "---");
  if (closing === -1) {
    return {
      error: `Invalid skill frontmatter in ${filePath}: missing closing ---`,
    };
  }

  const metadata: SkillMetadata = {};
  for (const line of lines.slice(1, closing)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    const rawValue = match[2];
    if (!key || rawValue === undefined) continue;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    metadata[key] = value;
  }

  return { metadata };
}

function validateSkillDir(skillDir: string): boolean {
  const filePath = path.join(skillDir, "SKILL.md");
  if (!fs.existsSync(filePath)) {
    err(`Missing SKILL.md in ${skillDir}`);
    return false;
  }

  const parsed = parseSkillMetadata(filePath);
  if ("error" in parsed) {
    err(parsed.error);
    return false;
  }

  const { name = "", description = "" } = parsed.metadata;
  if (!name) {
    err(`Invalid skill metadata in ${filePath}: missing name`);
    return false;
  }

  if (name.length > 64 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
    err(`Invalid skill name in ${filePath}: ${name}`);
    return false;
  }

  if (!description) {
    err(`Invalid skill metadata in ${filePath}: missing description`);
    return false;
  }

  if (description.length > 1024) {
    err(
      `Invalid skill description in ${filePath}: description exceeds 1024 characters`,
    );
    return false;
  }

  return true;
}

export function skillRelativePath(skillDir: string): string {
  return path.relative(state.customSkillsDir, skillDir).replace(/\\/g, "/");
}

function skillPackageName(skillDir: string): string {
  return skillRelativePath(skillDir).split("/").filter(Boolean)[0] || "";
}

export function discoverSkillDirs(): string[] {
  if (
    !fs.existsSync(state.customSkillsDir) ||
    !fs.statSync(state.customSkillsDir).isDirectory()
  ) {
    return [];
  }

  const found: string[] = [];
  const visit = (dir: string): void => {
    const skillFile = path.join(dir, "SKILL.md");
    if (fs.existsSync(skillFile)) {
      found.push(dir);
      return;
    }

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".")) continue;
      visit(path.join(dir, entry.name));
    }
  };

  visit(state.customSkillsDir);
  return found.sort((a, b) =>
    skillRelativePath(a).localeCompare(skillRelativePath(b)),
  );
}

function skillMatchesScope(skillDir: string, scope: string): boolean {
  const relative = skillRelativePath(skillDir).toLowerCase();
  return relative === scope || relative.startsWith(`${scope}/`);
}

function filterSkillDirsByPackage(skillDirs: string[]): string[] {
  const packages = normalizedSkillPackages();
  if (packages.length === 0) return skillDirs;
  return skillDirs.filter((skillDir) =>
    packages.includes(skillPackageName(skillDir).toLowerCase()),
  );
}

function filterSkillDirsByScope(skillDirs: string[]): string[] {
  const scopes = normalizedSkillScopes();
  if (scopes.length === 0) return skillDirs;
  return skillDirs.filter((skillDir) =>
    scopes.some((scope) => skillMatchesScope(skillDir, scope)),
  );
}

export function selectedSkillDirs(): string[] {
  return filterSkillDirsByScope(filterSkillDirsByPackage(discoverSkillDirs()));
}

export function availableSkillPackages(skillDirs: string[]): string[] {
  const packages = new Set<string>();
  for (const skillDir of skillDirs) {
    const packageName = skillPackageName(skillDir);
    if (packageName) packages.add(packageName);
  }
  return [...packages].sort();
}

export function availableSkillScopes(skillDirs: string[]): string[] {
  const scopes = new Set<string>();
  for (const skillDir of skillDirs) {
    const parts = skillRelativePath(skillDir).split("/").filter(Boolean);
    for (let i = 1; i < parts.length; i += 1) {
      scopes.add(parts.slice(0, i).join("/"));
    }
  }
  return [...scopes].sort();
}

export function listCustomSkills(): boolean {
  if (
    !fs.existsSync(state.customSkillsDir) ||
    !fs.statSync(state.customSkillsDir).isDirectory()
  ) {
    warn(`Skills directory not found: ${state.customSkillsDir}`);
    return true;
  }

  const skillDirs = selectedSkillDirs();
  if (skillDirs.length === 0) {
    warn(`No Agent Skills found in ${state.customSkillsDir}`);
    return true;
  }

  console.log("Custom Skills");
  for (const skillDir of skillDirs) {
    const parsed = parseSkillMetadata(path.join(skillDir, "SKILL.md"));
    const description =
      !("error" in parsed) && parsed.metadata.description
        ? ` - ${parsed.metadata.description}`
        : "";
    console.log(`  - ${skillRelativePath(skillDir)}${description}`);
  }
  return true;
}

function copySkillDir(sourceDir: string, targetRoot: string): void {
  const name = path.basename(sourceDir);
  const destination = path.join(targetRoot, name);
  const tempDestination = `${destination}.tmp.${process.pid}`;

  fs.mkdirSync(targetRoot, { recursive: true });
  fs.rmSync(tempDestination, { recursive: true, force: true });
  fs.cpSync(sourceDir, tempDestination, { recursive: true });
  fs.rmSync(destination, { recursive: true, force: true });
  fs.renameSync(tempDestination, destination);
}

function installGeminiSkill(skillDir: string): boolean {
  const scope = state.gsdScope === "local" ? "workspace" : "user";
  const gemini = findCommand("gemini");
  if (gemini) {
    return run(gemini, [
      "skills",
      "install",
      skillDir,
      "--scope",
      scope,
      "--consent",
    ]).ok;
  }

  copySkillDir(skillDir, skillsTargetDir("gemini"));
  return true;
}

function installCustomSkillsForRuntime(
  runtime: RuntimeName,
  skillDirs: string[],
): boolean {
  const targetRoot = skillsTargetDir(runtime);
  let installed = 0;

  for (const skillDir of skillDirs) {
    if (runtime === "gemini") {
      if (!installGeminiSkill(skillDir)) return false;
    } else {
      copySkillDir(skillDir, targetRoot);
    }
    installed += 1;
  }

  if (installed > 0) {
    if (runtime === "gemini" && commandExists("gemini")) {
      ok(`Installed ${installed} skill(s) for gemini via Gemini CLI`);
    } else {
      ok(`Installed ${installed} skill(s) for ${runtime} at ${targetRoot}`);
    }
  } else {
    warn(`No skills found in ${state.customSkillsDir} for ${runtime}`);
  }

  return true;
}

export function installCustomSkills(): boolean {
  step("Custom Skills");
  console.log("   Personal skills bundled with this hub");

  if (
    !fs.existsSync(state.customSkillsDir) ||
    !fs.statSync(state.customSkillsDir).isDirectory()
  ) {
    warn(`Skills directory not found: ${state.customSkillsDir}`);
    return true;
  }

  const skillDirs = selectedSkillDirs();

  for (const skillDir of skillDirs) {
    if (!validateSkillDir(skillDir)) return false;
  }

  if (skillDirs.length === 0) {
    const packages = normalizedSkillPackages();
    const scopes = normalizedSkillScopes();
    if (packages.length > 0 || scopes.length > 0) {
      const filters = [
        packages.length > 0 ? `package: ${packages.join(", ")}` : "",
        scopes.length > 0 ? `scope: ${scopes.join(", ")}` : "",
      ].filter(Boolean);
      warn(
        `No Agent Skills found in ${state.customSkillsDir} for ${filters.join("; ")}`,
      );
    } else {
      warn(`No Agent Skills found in ${state.customSkillsDir}`);
    }
    return true;
  }

  for (const runtime of runtimeNames) {
    if (
      state.runtimes[runtime] &&
      !installCustomSkillsForRuntime(runtime, skillDirs)
    ) {
      return false;
    }
  }

  return true;
}
