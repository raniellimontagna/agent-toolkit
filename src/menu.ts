import fs from "node:fs";
import { createInterface } from "node:readline/promises";
import * as clack from "@clack/prompts";
import { die } from "./logger.js";
import { availableSkillScopes, discoverSkillDirs } from "./skills.js";
import {
  isRuntimeName,
  isToolName,
  setAllRuntimes,
  setAllTools,
  splitList,
  state,
} from "./state.js";
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

function selectSkillScopesFromAnswer(answer: string): void {
  if (!answer.trim()) return;
  selectSkillScopes(splitList(answer));
}

function printAvailableSkillScopes(): void {
  const skillDirs = discoverSkillDirs();
  const scopes = availableSkillScopes(skillDirs);
  if (scopes.length === 0) return;

  console.log("");
  console.log("Available skill scopes:");
  for (const scope of scopes) console.log(`  - ${scope}`);
}

function applyMenuAnswers(answers: string[]): void {
  selectToolsFromAnswer(answers[0] ?? "");
  selectRuntimesFromAnswer(answers[1] ?? "");
  selectScopeFromAnswer(answers[2] ?? "");
  state.installMissingClis = /^y(es)?$/i.test((answers[3] ?? "").trim());

  if (state.tools.skills) {
    selectSkillScopesFromAnswer(answers[4] ?? "");
  }
}

function toolOptions(): ClackOption[] {
  return [
    { value: "all", label: "All tools", hint: "full toolkit" },
    { value: "rtk", label: "RTK", hint: "token-aware shell proxy" },
    { value: "caveman", label: "Caveman", hint: "terse response modes" },
    {
      value: "superpowers",
      label: "Superpowers",
      hint: "planning and delivery workflows",
    },
    { value: "graphify", label: "Graphify", hint: "knowledge graph workflow" },
    { value: "gsd", label: "GSD", hint: "phase-based project control" },
    {
      value: "frontend-skills",
      label: "Frontend Skills",
      hint: "third-party design skills",
    },
    {
      value: "skills",
      label: "Custom Skills",
      hint: "bundled personal skills",
    },
  ];
}

function runtimeOptions(): ClackOption[] {
  return [
    { value: "all", label: "All runtimes" },
    { value: "claude", label: "Claude Code" },
    { value: "codex", label: "Codex CLI" },
    { value: "opencode", label: "OpenCode" },
    { value: "gemini", label: "Gemini CLI" },
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
    ...availableSkillScopes(discoverSkillDirs()).map((scope) => ({
      value: scope,
      label: scope,
    })),
  ];
}

export async function runClackMenu(api: ClackMenuApi): Promise<void> {
  api.intro("Agent Toolkit");

  const tools = valueOrCancel<string[]>(
    api,
    await api.multiselect({
      message: "Select tools to install",
      options: toolOptions(),
      required: true,
    }),
  );
  selectTools(tools);

  const runtimes = valueOrCancel<string[]>(
    api,
    await api.multiselect({
      message: "Select runtimes to target",
      options: runtimeOptions(),
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
    const scopes = valueOrCancel<string[]>(
      api,
      await api.multiselect({
        message: "Select Custom Skill scopes",
        options: skillScopeOptions(),
        required: true,
      }),
    );
    selectSkillScopes(scopes);
  }

  api.outro("Ready to install.");
}

async function showReadlineMenu(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log(usage());
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
      printAvailableSkillScopes();
      const scopeAnswer = await rl.question(
        "Skill scopes to install [comma list, all, default all]: ",
      );
      selectSkillScopesFromAnswer(scopeAnswer);
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
