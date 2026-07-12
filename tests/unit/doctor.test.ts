import { describe, expect, it } from "vitest";
import { buildDoctorReport } from "../../src/doctor.js";
import type { InstallerStatus } from "../../src/status.js";

const status: InstallerStatus = {
  tools: {
    rtk: { state: "missing", summary: "missing from PATH" },
    caveman: { state: "external", summary: "checked by installer" },
    superpowers: { state: "external", summary: "checked by runtime" },
    graphify: { state: "installed", summary: "graphify 0.9.11" },
    gsd: { state: "external", summary: "checked by installer" },
    improve: { state: "external", summary: "pinned skill" },
    "agent-browser": { state: "missing", summary: "missing from PATH" },
    "frontend-skills": { state: "external", summary: "2 pinned skills" },
    "planning-skills": { state: "external", summary: "4 pinned skills" },
    skills: { state: "available", summary: "3 source skill(s) found" },
  },
  runtimes: {
    claude: { state: "installed", summary: "claude 1.0.0" },
    codex: { state: "missing", summary: "missing from PATH" },
    opencode: { state: "installed", summary: "opencode 1.0.0" },
    gemini: { state: "installed", summary: "gemini 1.0.0" },
    antigravity: { state: "missing", summary: "missing from PATH" },
  },
};

describe("doctor report", () => {
  it("summarizes selected missing tools and runtimes as issues", () => {
    const report = buildDoctorReport(status, {
      selectedTools: ["rtk", "skills"],
      selectedRuntimes: ["codex"],
      scope: "local",
      customSkillsDir: "/repo/skills",
      installMissingClis: false,
    });

    expect(report.ok).toBe(false);
    expect(report.scope).toBe("local");
    expect(report.selectedTools).toEqual(["rtk", "skills"]);
    expect(report.issues).toEqual([
      {
        kind: "tool",
        name: "RTK",
        message: "RTK is selected but missing from PATH.",
      },
      {
        kind: "runtime",
        name: "Codex CLI",
        message:
          "Codex CLI is selected but missing from PATH. Re-run with --install-missing-clis or install it manually.",
      },
    ]);
  });

  it("reports a selected missing Agent Browser executable", () => {
    const report = buildDoctorReport(status, {
      selectedTools: ["agent-browser"],
      selectedRuntimes: [],
      scope: "global",
      customSkillsDir: "/repo/skills",
      installMissingClis: false,
    });

    expect(report.issues).toEqual([
      {
        kind: "tool",
        name: "Agent Browser",
        message: "Agent Browser is selected but missing from PATH.",
      },
    ]);
  });
});
