import { info, ok, step, warn } from "../logger.js";
import { state } from "../state.js";
import { findCommand, run } from "../system.js";

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
      const result = run(codex, [
        "plugin",
        "add",
        "superpowers@openai-curated",
      ]);
      if (result.ok) ok("Superpowers installed for Codex CLI");
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
