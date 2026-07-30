import fs from "node:fs";
import path from "node:path";
import { err, ok } from "./logger.js";
import {
  parseSkillMetadata,
  selectedSkillDirs,
  skillRelativePath,
} from "./skills.js";
import { state } from "./state.js";

export type SkillAuditIssue = {
  file: string;
  message: string;
};

export type SkillAuditReport = {
  checked: number;
  issues: SkillAuditIssue[];
};

const markdownLinkPattern = /\[[^\]]+\]\(([^)]+)\)/g;

function isLocalReference(value: string): boolean {
  if (!value) return false;
  if (value.startsWith("#")) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return false;
  return true;
}

function auditSkillFile(skillFile: string): SkillAuditIssue[] {
  const issues: SkillAuditIssue[] = [];
  const parsed = parseSkillMetadata(skillFile);
  if ("error" in parsed) {
    issues.push({ file: skillFile, message: parsed.error });
  } else {
    const { name = "", description = "" } = parsed.metadata;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
      issues.push({ file: skillFile, message: `Invalid skill name: ${name}` });
    }
    if (!description || description.length > 1024) {
      issues.push({
        file: skillFile,
        message: "Skill description must be present and under 1024 characters",
      });
    }
  }

  const text = fs.readFileSync(skillFile, "utf8");
  for (const match of text.matchAll(markdownLinkPattern)) {
    const raw = match[1]?.trim() || "";
    if (!isLocalReference(raw)) continue;

    const target = raw.split("#")[0] || "";
    if (!target) continue;

    const absolute = path.resolve(path.dirname(skillFile), target);
    if (!fs.existsSync(absolute)) {
      issues.push({
        file: skillFile,
        message: `Broken local Markdown link: ${target}`,
      });
    }
  }

  return issues;
}

function auditBriefFile(briefFile: string): SkillAuditIssue[] {
  const text = fs.readFileSync(briefFile, "utf8");
  if (text.trim().length === 0 || text.length > 2500) {
    return [
      {
        file: briefFile,
        message: "BRIEF.md must be non-empty and at most 2500 characters",
      },
    ];
  }

  const issues: SkillAuditIssue[] = [];
  for (const match of text.matchAll(markdownLinkPattern)) {
    const raw = match[1]?.trim() || "";
    if (!isLocalReference(raw)) continue;

    const target = raw.split("#")[0] || "";
    if (!target) continue;

    const absolute = path.resolve(path.dirname(briefFile), target);
    if (!fs.existsSync(absolute)) {
      issues.push({
        file: briefFile,
        message: `Broken local Markdown link: ${target}`,
      });
    }
  }
  return issues;
}

/**
 * Skills are installed by directory name alone, so two skills that live in
 * different categories but share a folder name overwrite each other silently.
 * Catch the clash here instead of losing a skill at install time.
 */
export function auditDuplicateSkillNames(
  skillDirs: string[],
): SkillAuditIssue[] {
  const byName = new Map<string, string[]>();
  for (const skillDir of skillDirs) {
    const name = path.basename(skillDir);
    const paths = byName.get(name);
    if (paths) paths.push(skillRelativePath(skillDir));
    else byName.set(name, [skillRelativePath(skillDir)]);
  }

  const issues: SkillAuditIssue[] = [];
  for (const [name, paths] of byName) {
    if (paths.length < 2) continue;
    const sorted = [...paths].sort();
    for (const relative of sorted) {
      issues.push({
        file: relative,
        message: `Duplicate skill directory name "${name}" also used by ${sorted
          .filter((other) => other !== relative)
          .join(
            ", ",
          )}. Skills install by directory name, so these would overwrite each other.`,
      });
    }
  }
  return issues;
}

export function auditSkills(
  skillsDir = state.customSkillsDir,
): SkillAuditReport {
  const originalSkillsDir = state.customSkillsDir;
  state.customSkillsDir = skillsDir;
  try {
    const skillDirs = selectedSkillDirs();
    const issues = [
      ...skillDirs.flatMap((skillDir) =>
        auditSkillFile(path.join(skillDir, "SKILL.md")),
      ),
      ...skillDirs.flatMap((skillDir) => {
        const briefFile = path.join(skillDir, "BRIEF.md");
        return fs.existsSync(briefFile) ? auditBriefFile(briefFile) : [];
      }),
      ...auditDuplicateSkillNames(skillDirs),
    ];
    return { checked: skillDirs.length, issues };
  } finally {
    state.customSkillsDir = originalSkillsDir;
  }
}

export function printSkillsAudit(report: SkillAuditReport): boolean {
  if (report.issues.length === 0) {
    ok(`Skills audit passed (${report.checked} skill(s) checked).`);
    return true;
  }

  err(`Skills audit failed (${report.issues.length} issue(s)).`);
  for (const issue of report.issues) {
    console.error(`- ${issue.file}: ${issue.message}`);
  }
  return false;
}
