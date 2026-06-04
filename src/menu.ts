import fs from "node:fs";
import { createInterface } from "node:readline/promises";
import * as clack from "@clack/prompts";
import { die } from "./logger.js";
import {
  availableSkillPackages,
  availableSkillScopes,
  discoverSkillDirs,
  selectedSkillDirs,
  skillRelativePath,
} from "./skills.js";
import {
  isRuntimeName,
  isToolName,
  setAllRuntimes,
  setAllTools,
  splitList,
  state,
} from "./state.js";
import {
  detectInstallerStatus,
  detectionHint,
  formatDetectedStatus,
  formatInstallPlan,
  type InstallerStatus,
} from "./status.js";
import { usage } from "./usage.js";

type ClackOption = {
  value: string;
  label: string;
  hint?: string;
};

export type ClackMenuApi = {
  intro(message: string): void;
  outro(message: string): void;
  cancel(message: string): void;
  note?(message: string, title?: string): void;
  isCancel(value: unknown): boolean;
  multiselect(options: {
    message: string;
    options: ClackOption[];
    required?: boolean;
  }): Promise<unknown>;
  select(options: {
    message: string;
    options: ClackOption[];
    initialValue?: string;
  }): Promise<unknown>;
  confirm(options: {
    message: string;
    initialValue?: boolean;
  }): Promise<unknown>;
};

function valueOrCancel<T>(api: ClackMenuApi, value: unknown): T {
  if (api.isCancel(value)) {
    api.cancel("Operation cancelled.");
    die("Operation cancelled.");
  }

  return value as T;
}

function selectTools(tools: string[]): void {
  setAllTools(false);
  if (tools.length === 0) die("Select at least one tool.");

  for (const tool of tools) {
    if (tool === "all") {
      setAllTools(true);
      return;
    }
    if (!isToolName(tool)) die(`Unknown tool in menu selection: ${tool}`);
    state.tools[tool] = true;
  }
}

function selectToolsFromAnswer(answer: string): void {
  if (!answer.trim()) die("Select at least one tool.");
  selectTools(splitList(answer));
}

function selectRuntimes(runtimes: string[]): void {
  setAllRuntimes(false);
  if (runtimes.length === 0) die("Select at least one runtime.");

  for (const runtime of runtimes) {
    if (runtime === "all") {
      setAllRuntimes(true);
      return;
    }
    if (!isRuntimeName(runtime))
      die(`Unknown runtime in menu selection: ${runtime}`);
    state.runtimes[runtime] = true;
  }
}

function selectRuntimesFromAnswer(answer: string): void {
  if (!answer.trim()) die("Select at least one runtime.");
  selectRuntimes(splitList(answer));
}

function selectScopeFromAnswer(answer: string): void {
  if (!answer.trim()) return;

  const scope = answer.trim().toLowerCase();
  if (scope !== "global" && scope !== "local")
    die(`Unknown install scope: ${scope}`);
  state.gsdScope = scope;
}

function selectSkillScopes(scopes: string[]): void {
  if (scopes.length === 0 || scopes.includes("all")) return;
  state.skillScopes.push(...scopes);
}

function selectSkillPaths(paths: string[]): void {
  if (paths.length === 0 || paths.includes("all")) return;
  state.skillPaths.push(...paths);
}

function selectSkillPackages(packages: string[]): void {
  if (packages.length === 0 || packages.includes("all")) return;
  state.skillPackages.push(...packages);
}

function selectSkillPackagesFromAnswer(answer: string): void {
  if (!answer.trim()) return;
  selectSkillPackages(splitList(answer));
}

function selectSkillScopesFromAnswer(answer: string): void {
  if (!answer.trim()) return;
  selectSkillScopes(splitList(answer));
}

function selectSkillPathsFromAnswer(answer: string): void {
  if (!answer.trim()) return;
  selectSkillPaths(splitList(answer));
}

function printAvailableSkillPackages(): void {
  const packages = availableSkillPackages(discoverSkillDirs());
  if (packages.length === 0) return;

  console.log("");
  console.log("Available skill packages:");
  for (const packageName of packages) console.log(`  - ${packageName}`);
}

function printAvailableSkillScopes(): void {
  const skillDirs = selectedSkillDirs();
  const scopes = availableSkillScopes(skillDirs);
  if (scopes.length === 0) return;

  console.log("");
  console.log("Available skill scopes:");
  for (const scope of scopes) console.log(`  - ${scope}`);
}

function printAvailableSkillPaths(): void {
  const skillPaths = selectedSkillDirs().map(skillRelativePath);
  if (skillPaths.length === 0) return;

  console.log("");
  console.log("Available individual skills:");
  for (const skillPath of skillPaths) console.log(`  - ${skillPath}`);
}

function applyMenuAnswers(answers: string[]): void {
  selectToolsFromAnswer(answers[0] ?? "");
  selectRuntimesFromAnswer(answers[1] ?? "");
  selectScopeFromAnswer(answers[2] ?? "");
  state.installMissingClis = /^y(es)?$/i.test((answers[3] ?? "").trim());

  if (state.tools.skills) {
    if ((answers[5] ?? "").trim() || (answers[6] ?? "").trim()) {
      selectSkillPackagesFromAnswer(answers[4] ?? "");
      selectSkillScopesFromAnswer(answers[5] ?? "");
      selectSkillPathsFromAnswer(answers[6] ?? "");
    } else {
      selectSkillScopesFromAnswer(answers[4] ?? "");
    }
  }
}

function toolOptions(status: InstallerStatus): ClackOption[] {
  return [
    { value: "all", label: "All tools", hint: "full toolkit" },
    {
      value: "rtk",
      label: "RTK",
      hint: detectionHint(status.tools.rtk, "token-aware shell proxy"),
    },
    {
      value: "caveman",
      label: "Caveman",
      hint: detectionHint(status.tools.caveman, "terse response modes"),
    },
    {
      value: "superpowers",
      label: "Superpowers",
      hint: detectionHint(
        status.tools.superpowers,
        "planning and delivery workflows",
      ),
    },
    {
      value: "graphify",
      label: "Graphify",
      hint: detectionHint(status.tools.graphify, "knowledge graph workflow"),
    },
    {
      value: "gsd",
      label: "GSD",
      hint: detectionHint(status.tools.gsd, "phase-based project control"),
    },
    {
      value: "frontend-skills",
      label: "Frontend Skills",
      hint: detectionHint(
        status.tools["frontend-skills"],
        "third-party design skills",
      ),
    },
    {
      value: "skills",
      label: "Custom Skills",
      hint: detectionHint(status.tools.skills, "bundled personal skills"),
    },
  ];
}

function runtimeOptions(status: InstallerStatus): ClackOption[] {
  return [
    { value: "all", label: "All runtimes" },
    {
      value: "claude",
      label: "Claude Code",
      hint: detectionHint(status.runtimes.claude, "runtime CLI"),
    },
    {
      value: "codex",
      label: "Codex CLI",
      hint: detectionHint(status.runtimes.codex, "runtime CLI"),
    },
    {
      value: "opencode",
      label: "OpenCode",
      hint: detectionHint(status.runtimes.opencode, "runtime CLI"),
    },
    {
      value: "gemini",
      label: "Gemini CLI",
      hint: detectionHint(status.runtimes.gemini, "runtime CLI"),
    },
  ];
}

function scopeOptions(): ClackOption[] {
  return [
    { value: "global", label: "Global", hint: "user config directories" },
    { value: "local", label: "Local", hint: "current project" },
  ];
}

function skillScopeOptions(): ClackOption[] {
  return [
    { value: "all", label: "All skill scopes" },
    ...availableSkillScopes(selectedSkillDirs()).map((scope) => ({
      value: scope,
      label: scope,
    })),
  ];
}

function skillPackageOptions(): ClackOption[] {
  return [
    { value: "all", label: "All skill packages" },
    ...availableSkillPackages(discoverSkillDirs()).map((packageName) => ({
      value: packageName,
      label: packageName,
    })),
  ];
}

function skillPathOptions(): ClackOption[] {
  return [
    { value: "all", label: "All selected skills" },
    ...selectedSkillDirs().map((skillDir) => {
      const skillPath = skillRelativePath(skillDir);
      return {
        value: skillPath,
        label: skillPath,
      };
    }),
  ];
}

export async function runClackMenu(api: ClackMenuApi): Promise<void> {
  api.intro("Agent Toolkit");
  const status = detectInstallerStatus();
  api.note?.(formatDetectedStatus(status), "Detected status");

  const tools = valueOrCancel<string[]>(
    api,
    await api.multiselect({
      message: "Select tools to install",
      options: toolOptions(status),
      required: true,
    }),
  );
  selectTools(tools);

  const runtimes = valueOrCancel<string[]>(
    api,
    await api.multiselect({
      message: "Select runtimes to target",
      options: runtimeOptions(status),
      required: true,
    }),
  );
  selectRuntimes(runtimes);

  const installScope = valueOrCancel<string>(
    api,
    await api.select({
      message: "Choose install scope",
      options: scopeOptions(),
      initialValue: state.gsdScope,
    }),
  );
  selectScopeFromAnswer(installScope);

  state.installMissingClis = valueOrCancel<boolean>(
    api,
    await api.confirm({
      message: "Install missing selected CLIs via npm?",
      initialValue: false,
    }),
  );

  if (state.tools.skills) {
    const packages = valueOrCancel<string[]>(
      api,
      await api.multiselect({
        message: "Select Custom Skill packages",
        options: skillPackageOptions(),
        required: true,
      }),
    );
    selectSkillPackages(packages);

    const scopes = valueOrCancel<string[]>(
      api,
      await api.multiselect({
        message: "Select Custom Skill scopes",
        options: skillScopeOptions(),
        required: true,
      }),
    );
    selectSkillScopes(scopes);

    const skillPaths = valueOrCancel<string[]>(
      api,
      await api.multiselect({
        message: "Select individual Custom Skills",
        options: skillPathOptions(),
        required: true,
      }),
    );
    selectSkillPaths(skillPaths);
  }

  api.note?.(formatInstallPlan(status), "Install plan");
  const shouldContinue = valueOrCancel<boolean>(
    api,
    await api.confirm({
      message: "Continue with installation?",
      initialValue: true,
    }),
  );
  if (!shouldContinue) {
    api.cancel("Installation cancelled.");
    die("Installation cancelled.");
  }

  api.outro("Ready to install.");
}

async function showReadlineMenu(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const status = detectInstallerStatus();
    console.log(usage());
    console.log("");
    console.log("Detected status");
    console.log(formatDetectedStatus(status));
    console.log("");

    const toolsAnswer = await rl.question(
      "Tools to install [comma list: rtk,caveman,superpowers,graphify,gsd,frontend-skills,skills, or all]: ",
    );
    selectToolsFromAnswer(toolsAnswer);

    const runtimeAnswer = await rl.question(
      "Runtimes to target [comma list: claude,codex,opencode,gemini, or all]: ",
    );
    selectRuntimesFromAnswer(runtimeAnswer);

    const scopeAnswer = await rl.question(
      "Install scope [global/local, default global]: ",
    );
    selectScopeFromAnswer(scopeAnswer);

    const cliAnswer = await rl.question(
      "Install missing selected CLIs via npm? [y/N]: ",
    );
    state.installMissingClis = /^y(es)?$/i.test(cliAnswer.trim());

    if (state.tools.skills) {
      printAvailableSkillPackages();
      const packageAnswer = await rl.question(
        "Skill packages to install [comma list, all, default all]: ",
      );
      selectSkillPackagesFromAnswer(packageAnswer);

      printAvailableSkillScopes();
      const scopeAnswer = await rl.question(
        "Skill scopes to install [comma list, all, default all]: ",
      );
      selectSkillScopesFromAnswer(scopeAnswer);

      printAvailableSkillPaths();
      const skillAnswer = await rl.question(
        "Individual skills to install [comma list, all, default all]: ",
      );
      selectSkillPathsFromAnswer(skillAnswer);
    }

    console.log("");
    console.log("Install plan");
    console.log(formatInstallPlan(status));
    const continueAnswer = await rl.question(
      "Continue with installation? [Y/n]: ",
    );
    if (/^n(o)?$/i.test(continueAnswer.trim())) {
      die("Installation cancelled.");
    }
  } finally {
    rl.close();
  }
}

export async function showMenu(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    const raw = fs.readFileSync(0, "utf8");
    if (!raw.trim()) {
      die(
        "No interactive terminal detected. Pass --all/--*-only flags or pipe menu answers.",
      );
    }
    applyMenuAnswers(raw.split(/\r?\n/));
    return;
  }

  if (process.env.AGENT_TOOLKIT_MENU === "plain") {
    await showReadlineMenu();
    return;
  }

  await runClackMenu(clack);
}
