export function usage(): string {
  return `Agent Toolkit installer

Usage:
  bash setup-agent-toolkit.sh [options]
  npx agent-toolkit [options]

Tools:
  --all                 Install every tool without the menu
  --rtk-only            Install only RTK
  --caveman-only        Install only Caveman
  --superpowers-only    Install only Superpowers
  --graphify-only       Install only Graphify
  --gsd-only            Install only GSD
  --skills-only         Install only Custom Skills
  --no-rtk              Skip RTK
  --no-caveman          Skip Caveman
  --no-superpowers      Skip Superpowers
  --no-graphify         Skip Graphify
  --no-gsd              Skip GSD
  --no-skills           Skip Custom Skills

Runtimes:
  --all-runtimes        Target Claude Code, Codex CLI, OpenCode and Gemini CLI
  --claude              Target only Claude Code
  --codex               Target only Codex CLI
  --opencode            Target only OpenCode
  --gemini              Target only Gemini CLI
  --no-claude           Skip Claude Code
  --no-codex            Skip Codex CLI
  --no-opencode         Skip OpenCode
  --no-gemini           Skip Gemini CLI

Install scope:
  --global              Install runtime assets into user config directories
  --local               Install runtime assets into the current project
  --skills-dir DIR      Use another source directory for Custom Skills
  --skills-scope SCOPE  Install skills under a relative scope path, repeatable
  --skills-list         List discovered Custom Skills and exit

Other:
  --install-missing-clis Install selected runtime CLIs if missing
  --help, -h            Show this help

Environment:
  RTK_INSTALL_DIR       RTK binary install directory
  CAVEMAN_PACKAGE       Caveman package source
  CAVEMAN_MODE          minimal or all
  GRAPHIFY_PACKAGE      Python package used to install Graphify
  GRAPHIFY_INSTALLER    uv or pipx
  GSD_PACKAGE           GSD package source
  GSD_SCOPE             global or local
  CUSTOM_SKILLS_DIR     Source directory for custom skills
  SKILLS_SCOPE          Comma-separated skill scope filters
  CLAUDE_CLI_PACKAGE    npm package used to install Claude Code CLI
  CODEX_CLI_PACKAGE     npm package used to install Codex CLI
  OPENCODE_CLI_PACKAGE  npm package used to install OpenCode CLI
  GEMINI_CLI_PACKAGE    npm package used to install Gemini CLI`;
}
