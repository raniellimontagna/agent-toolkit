import fs from "node:fs";
import { createInterface } from "node:readline/promises";
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

function selectToolsFromAnswer(answer: string): void {
  setAllTools(false);
  if (!answer.trim()) die("Select at least one tool.");

  for (const tool of splitList(answer)) {
    if (tool === "all") {
      setAllTools(true);
      return;
    }
    if (!isToolName(tool)) die(`Unknown tool in menu selection: ${tool}`);
    state.tools[tool] = true;
  }
}

function selectRuntimesFromAnswer(answer: string): void {
  setAllRuntimes(false);
  if (!answer.trim()) die("Select at least one runtime.");

  for (const runtime of splitList(answer)) {
    if (runtime === "all") {
      setAllRuntimes(true);
      return;
    }
    if (!isRuntimeName(runtime))
      die(`Unknown runtime in menu selection: ${runtime}`);
    state.runtimes[runtime] = true;
  }
}

function selectScopeFromAnswer(answer: string): void {
  if (!answer.trim()) return;

  const scope = answer.trim().toLowerCase();
  if (scope !== "global" && scope !== "local")
    die(`Unknown install scope: ${scope}`);
  state.gsdScope = scope;
}

function selectSkillScopesFromAnswer(answer: string): void {
  if (!answer.trim() || answer.trim().toLowerCase() === "all") return;
  state.skillScopes.push(...splitList(answer));
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

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log(usage());
    console.log("");

    const toolsAnswer = await rl.question(
      "Tools to install [comma list: rtk,caveman,superpowers,graphify,gsd,skills, or all]: ",
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
