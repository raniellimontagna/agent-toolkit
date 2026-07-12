import {
  type InstallScope,
  type RuntimeName,
  runtimeMeta,
  type ToolName,
} from "./state.js";
import type { InstallerStatus } from "./status.js";

type DoctorIssue = {
  kind: "tool" | "runtime" | "skills";
  name: string;
  message: string;
};

export type DoctorReport = {
  command: "doctor";
  ok: boolean;
  scope: InstallScope;
  customSkillsDir: string;
  installMissingClis: boolean;
  selectedTools: ToolName[];
  selectedRuntimes: RuntimeName[];
  status: InstallerStatus;
  issues: DoctorIssue[];
};

type DoctorInput = {
  selectedTools: ToolName[];
  selectedRuntimes: RuntimeName[];
  scope: InstallScope;
  customSkillsDir: string;
  installMissingClis: boolean;
};

function toolLabel(tool: ToolName): string {
  switch (tool) {
    case "rtk":
      return "RTK";
    case "caveman":
      return "Caveman";
    case "superpowers":
      return "Superpowers";
    case "graphify":
      return "Graphify";
    case "gsd":
      return "GSD";
    case "improve":
      return "Improve";
    case "agent-browser":
      return "Agent Browser";
    case "frontend-skills":
      return "Frontend Skills";
    case "planning-skills":
      return "Planning Skills";
    case "skills":
      return "Custom Skills";
  }
}

export function buildDoctorReport(
  status: InstallerStatus,
  input: DoctorInput,
): DoctorReport {
  const issues: DoctorIssue[] = [];

  for (const tool of input.selectedTools) {
    const detection = status.tools[tool];
    if (detection.state === "missing") {
      issues.push({
        kind: tool === "skills" ? "skills" : "tool",
        name: toolLabel(tool),
        message: `${toolLabel(tool)} is selected but ${detection.summary}.`,
      });
    }
  }

  for (const runtime of input.selectedRuntimes) {
    const detection = status.runtimes[runtime];
    if (detection.state === "missing") {
      const installHint = input.installMissingClis
        ? "The installer is allowed to install or update it."
        : "Re-run with --install-missing-clis or install it manually.";
      issues.push({
        kind: "runtime",
        name: runtimeMeta[runtime].display,
        message: `${runtimeMeta[runtime].display} is selected but ${detection.summary}. ${installHint}`,
      });
    }
  }

  return {
    command: "doctor",
    ok: issues.length === 0,
    scope: input.scope,
    customSkillsDir: input.customSkillsDir,
    installMissingClis: input.installMissingClis,
    selectedTools: input.selectedTools,
    selectedRuntimes: input.selectedRuntimes,
    status,
    issues,
  };
}

export function formatDoctorReport(report: DoctorReport): string {
  const lines = [
    "Doctor report",
    `Scope: ${report.scope}`,
    `Custom Skills source: ${report.customSkillsDir}`,
    `Selected tools: ${report.selectedTools.join(", ") || "none"}`,
    `Selected runtimes: ${report.selectedRuntimes.join(", ") || "none"}`,
    "",
  ];

  if (report.issues.length === 0) {
    lines.push("No blocking issues found for the selected plan.");
    return lines.join("\n");
  }

  lines.push("Issues:");
  for (const issue of report.issues) {
    lines.push(`- ${issue.name}: ${issue.message}`);
  }

  return lines.join("\n");
}
