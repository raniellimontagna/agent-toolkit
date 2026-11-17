import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseSkillMetadata } from "../../src/skills.js";

const skillDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "skills",
  "frontend",
  "modern-web-guidance",
);
const skillFile = path.join(skillDir, "SKILL.md");
const briefFile = path.join(skillDir, "BRIEF.md");
const noticeFile = path.join(skillDir, "NOTICE.md");

function pinnedCliVersion(): string {
  const notice = fs.readFileSync(noticeFile, "utf8");
  const match = notice.match(/`modern-web-guidance@([0-9][^`]*)`/);
  if (!match?.[1]) throw new Error("NOTICE.md must name the pinned CLI");
  return match[1];
}

function cliCommandLines(file: string): string[] {
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((line) => /\b(?:npx|pnpx)\b.*modern-web-guidance@/.test(line));
}

describe("modern-web-guidance skill", () => {
  it("has metadata the toolkit parser accepts", () => {
    const parsed = parseSkillMetadata(skillFile);
    if ("error" in parsed) throw new Error(parsed.error);

    expect(parsed.metadata.name).toBe("modern-web-guidance");
    expect(parsed.metadata.description).toMatch(/^Search tool for modern web/);
    expect(parsed.metadata.description?.length ?? 0).toBeLessThanOrEqual(1024);
  });

  it("never runs a mutable CLI version", () => {
    for (const file of [skillFile, briefFile]) {
      expect(fs.readFileSync(file, "utf8")).not.toMatch(
        /modern-web-guidance@(?:latest|next)\b/,
      );
    }
  });

  it("pins every CLI command to the version recorded in NOTICE.md", () => {
    const version = pinnedCliVersion();
    const lines = [
      ...cliCommandLines(skillFile),
      ...cliCommandLines(briefFile),
    ];

    expect(lines.length).toBeGreaterThanOrEqual(5);
    for (const line of lines) {
      for (const [, used] of line.matchAll(
        /modern-web-guidance@([0-9A-Za-z.+-]+)/g,
      )) {
        expect(used).toBe(version);
      }
    }
  });

  it("keeps the telemetry opt-out on every CLI command", () => {
    for (const line of [
      ...cliCommandLines(skillFile),
      ...cliCommandLines(briefFile),
    ]) {
      expect(line).toContain("DISABLE_TELEMETRY=1");
    }
  });
});
