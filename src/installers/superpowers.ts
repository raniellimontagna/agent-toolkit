import { info, ok, step, warn } from "../logger.js";
import { state } from "../state.js";
import { capture, findCommand, run } from "../system.js";

// Codex lists Superpowers in the local `openai-curated` marketplace once it has
// synced that catalog. A CODEX_HOME that never synced it only has the account's
// remote catalog, where the same plugin is `openai-curated-remote`.
const CODEX_SUPERPOWERS_PLUGINS = [
  "superpowers@openai-curated",
  "superpowers@openai-curated-remote",
];

function addCodexSuperpowers(codex: string): boolean {
  const errors: string[] = [];
  for (const plugin of CODEX_SUPERPOWERS_PLUGINS) {
    const result = capture(codex, ["plugin", "add", plugin]);
    if (result.ok) return true;
    const error = (result.stderr || result.stdout).trim();
    if (error) errors.push(error);
  }
  for (const error of errors) warn(error);
  return false;
}

export function installSuperpowers(): boolean {
  step("Superpowers");
  console.log("   Planning, TDD, debugging and delivery workflows");

  let hadError = false;

  if (state.runtimes.claude) {
    const claude = findCommand("claude");
    if (claude) {
      info("Installing Superpowers for Claude Code...");
      const result = run(claude, [
        "plugin",
        "install",
        "superpowers@claude-plugins-official",
      ]);
      if (result.ok) ok("Superpowers installed for Claude Code");
      else {
        warn("Claude Code plugin install did not complete.");
        hadError = true;
      }
    } else {
      warn("Claude Code CLI not found; skipping Superpowers for Claude Code.");
    }
  }

  if (state.runtimes.codex) {
    const codex = findCommand("codex");
    if (codex) {
      info("Installing Superpowers for Codex CLI...");
      if (addCodexSuperpowers(codex)) ok("Superpowers installed for Codex CLI");
      else {
        warn("Codex plugin install did not complete.");
        hadError = true;
      }
    } else {
      warn("Codex CLI not found; skipping Superpowers for Codex CLI.");
    }
  }

  if (state.runtimes.opencode) {
    warn(
      "OpenCode Superpowers install requires following upstream OpenCode-specific instructions; skipping automatic install.",
    );
  }

  if (state.runtimes.gemini) {
    const gemini = findCommand("gemini");
    if (gemini) {
      info("Installing Superpowers for Gemini CLI...");
      const result = run(gemini, [
        "extensions",
        "install",
        "https://github.com/obra/superpowers",
      ]);
      if (result.ok) ok("Superpowers installed for Gemini CLI");
      else {
        warn("Gemini extension install did not complete.");
        hadError = true;
      }
    } else {
      warn("Gemini CLI not found; skipping Superpowers for Gemini CLI.");
    }
  }

  if (state.runtimes.antigravity) {
    warn(
      "Antigravity Superpowers install is not automated yet; skipping until a supported Antigravity plugin package is available.",
    );
  }

  return !hadError;
}
