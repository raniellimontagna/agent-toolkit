import fs from "node:fs";
import path from "node:path";
import {
  discoverSkillDirs,
  selectedSkillDirs,
  skillRelativePath,
  skillsTargetDir,
} from "./skills.js";
import {
  normalizedSkillPackages,
  normalizedSkillPaths,
  type RuntimeName,
  runtimeMeta,
  runtimeNames,
  state,
  type ToolName,
  toolNames,
} from "./state.js";
import { capture, findCommand } from "./system.js";

export type DetectionState = "installed" | "missing" | "available" | "external";

export type Detection = {
  state: DetectionState;
  summary: string;
  detail?: string;
};

export type InstallerStatus = {
  tools: Record<ToolName, Detection>;
  runtimes: Record<RuntimeName, Detection>;
};

export function toolDisplayName(tool: ToolName): string {
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
    case "frontend-skills":
      return "Frontend Skills";
    case "planning-skills":
      return "Planning Skills";
    case "skills":
      return "Custom Skills";
  }
}

function firstLine(value: string): string {
  return value.trim().split(/\r?\n/)[0]?.trim() || "";
}

function commandDetection(command: string): Detection {
  const commandPath = findCommand(command);
  if (!commandPath) return { state: "missing", summary: "missing from PATH" };

  const version = capture(commandPath, ["--version"]);
  return {
    state: "installed",
    summary:
      firstLine(version.stdout) || firstLine(version.stderr) || "installed",
    detail: commandPath,
  };
}

function customSkillsDetection(): Detection {
  const skillDirs = discoverSkillDirs();
  if (skillDirs.length === 0) {
    return {
      state: "missing",
      summary: `no skills found in ${state.customSkillsDir}`,
    };
  }

  return {
    state: "available",
    summary: `${skillDirs.length} source skill(s) found`,
    detail: state.customSkillsDir,
  };
}

export function detectInstallerStatus(): InstallerStatus {
  return {
    tools: {
      rtk: commandDetection("rtk"),
      caveman: {
        state: "external",
        summary: "checked by the Caveman installer",
        detail: state.cavemanPackage,
      },
      superpowers: {
        state: "external",
        summary: "checked by runtime plugin commands",
      },
      graphify: commandDetection("graphify"),
      gsd: {
        state: "external",
        summary: "checked by the GSD installer",
        detail: state.gsdPackage,
      },
      improve: {
        state: "external",
        summary: "pinned shadcn advisor skill",
        detail: `${state.improveSkillSource.repository}@${state.improveSkillSource.ref}`,
      },
      "frontend-skills": {
        state: "external",
        summary: `${state.frontendSkillSources.length} pinned source skill(s)`,
        detail: "installed through Agent Skills CLI",
      },
      "planning-skills": {
        state: "external",
        summary: `${state.planningSkillSources.length} pinned source skill(s)`,
        detail: "installed through Agent Skills CLI",
      },
      skills: customSkillsDetection(),
    },
    runtimes: {
      claude: commandDetection(runtimeMeta.claude.command),
      codex: commandDetection(runtimeMeta.codex.command),
      opencode: commandDetection(runtimeMeta.opencode.command),
      gemini: commandDetection(runtimeMeta.gemini.command),
      antigravity: commandDetection(runtimeMeta.antigravity.command),
    },
  };
}

function detectionText(detection: Detection): string {
  const detail = detection.detail ? ` (${detection.detail})` : "";
  return `${detection.state}: ${detection.summary}${detail}`;
}

export function detectionHint(detection: Detection, fallback: string): string {
  return `${detection.state}: ${detection.summary}; ${fallback}`;
}

export function formatDetectedStatus(status: InstallerStatus): string {
  const lines = ["Tools:"];
  for (const tool of toolNames) {
    lines.push(
      `- ${toolDisplayName(tool)}: ${detectionText(status.tools[tool])}`,
    );
  }

  lines.push("", "Runtimes:");
  for (const runtime of runtimeNames) {
    lines.push(
      `- ${runtimeMeta[runtime].display}: ${detectionText(status.runtimes[runtime])}`,
    );
  }

  return lines.join("\n");
}

function selectedTools(): ToolName[] {
  return toolNames.filter((tool) => state.tools[tool]);
}

function selectedRuntimes(): RuntimeName[] {
  return runtimeNames.filter((runtime) => state.runtimes[runtime]);
}

function selectedToolPlan(tool: ToolName, detection: Detection): string {
  if (tool === "rtk" || tool === "graphify") {
    if (detection.state === "installed") {
      return `${detection.summary} already on PATH; installer will verify before doing package setup`;
    }
    return "not found on PATH; installer will set it up when prerequisites are available";
  }

  if (tool === "skills") {
    const skillDirs = selectedSkillDirs();
    if (skillDirs.length === 0) {
      return "no selected Custom Skills found; installer will skip copying";
    }
    return `${skillDirs.length} selected source skill(s); destination status is listed below`;
  }

  return detection.summary;
}

function selectedSkillPlanLines(): string[] {
  const skillDirs = selectedSkillDirs();
  if (skillDirs.length === 0) {
    return [`- No selected Custom Skills found in ${state.customSkillsDir}`];
  }

  const skillList = skillDirs.map(skillRelativePath).join(", ");
  const packages = normalizedSkillPackages();
  const paths = normalizedSkillPaths();
  const lines = [
    `- Selected packages: ${packages.length > 0 ? packages.join(", ") : "all"}`,
    `- Selected individual skills: ${paths.length > 0 ? paths.join(", ") : "all"}`,
    `- Selected source skills: ${skillList}`,
  ];

  for (const runtime of selectedRuntimes()) {
    const targetRoot = skillsTargetDir(runtime);
    let present = 0;
    for (const skillDir of skillDirs) {
      if (
        fs.existsSync(
          path.join(targetRoot, path.basename(skillDir), "SKILL.md"),
        )
      ) {
        present += 1;
      }
    }

    const missing = skillDirs.length - present;
    lines.push(
      `- ${runtimeMeta[runtime].display}: ${present}/${skillDirs.length} already present at ${targetRoot}; ${missing} will be copied`,
    );
  }

  return lines;
}

export function formatInstallPlan(status: InstallerStatus): string {
  const lines = ["Selected tools:"];
  for (const tool of selectedTools()) {
    lines.push(
      `- ${toolDisplayName(tool)}: ${selectedToolPlan(tool, status.tools[tool])}`,
    );
  }

  lines.push("", "Selected runtimes:");
  for (const runtime of selectedRuntimes()) {
    lines.push(
      `- ${runtimeMeta[runtime].display}: ${detectionText(status.runtimes[runtime])}`,
    );
  }

  if (state.tools.skills) {
    lines.push("", "Custom Skills:");
    lines.push(...selectedSkillPlanLines());
  }

  return lines.join("\n");
}
