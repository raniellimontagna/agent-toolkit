# Agent Toolkit

Personal toolkit for setting up AI coding agents with the tools I use most:
RTK, Caveman, Superpowers, Graphify, GSD and bundled personal skills.

The installer source is written in TypeScript and compiled to a dependency-free
Node CLI in `dist/`. The Bash file is kept only as a compatibility wrapper, so
existing commands still work after building the project.

## Runtimes

| Runtime | Support |
|---|---|
| Claude Code | Plugins and skills |
| Codex CLI | Plugins, skills and local automation |
| OpenCode | Skills plus package-driven tools |
| Gemini CLI | Extensions and native Agent Skills install |

## Tools

| Tool | What it adds |
|---|---|
| RTK | Token-aware shell proxy for coding-agent sessions |
| Caveman | Terse response mode and optional agent integrations |
| Superpowers | Planning, TDD, debugging, review and delivery workflows |
| Graphify | Queryable knowledge graphs for codebases, docs and project context |
| GSD | Phase-based planning, execution, verification and project control |
| Custom Skills | Personal skills bundled in this repository |

Superpowers is installed automatically for Claude Code, Codex CLI and Gemini CLI.
OpenCode support is intentionally not automated yet for Superpowers because the
upstream install flow is not a stable single command. Caveman, GSD and Custom
Skills can target Claude Code, Codex CLI, OpenCode and Gemini CLI. Graphify is
installed through the official `graphifyy` package and registers itself for the
selected runtimes.

## Repository Layout

```text
bin/
  agent-toolkit.ts             Thin TypeScript entrypoint
src/
  main.ts               Installer orchestration
  args.ts               CLI flag parsing
  menu.ts               Interactive selection
  runtimes.ts           Runtime CLI checks
  skills.ts             Recursive skill discovery and installation
  installers/           Tool-specific installers
dist/
  bin/
    agent-toolkit.js     Compiled CLI used by npm and the wrapper
setup-agent-toolkit.sh         Bash compatibility wrapper
package.json            CLI metadata and test scripts
skills/
  core/
    agent-toolkit-maintainer/
      SKILL.md
  frontend/
  backend/
tests/
  unit/
    *.test.ts
  test-agent-toolkit.sh
```

## Prerequisites

- Node.js 22+ for the full toolkit
- `npx` for Caveman and GSD
- `npm` when using `--install-missing-clis`
- `uv` for Graphify, or `pipx` when `GRAPHIFY_INSTALLER=pipx`
- `tar` or `unzip` only when RTK needs to be downloaded
- The runtime CLIs you want to target: `claude`, `codex`, `opencode`, and/or `gemini`

The installer can install missing selected runtime CLIs through npm when run
with `--install-missing-clis`.

Install development dependencies and build the CLI before running from a clone:

```bash
npm install
npm run build
```

## Install

Clone the repository and run:

```bash
npm install
npm run build
bash setup-agent-toolkit.sh
```

Interactive runs ask which tools, runtimes and skill scopes to install. Pressing
Enter does not silently install the full kit; choose `all` explicitly when that
is what you want.

You can also call the Node CLI directly:

```bash
node dist/bin/agent-toolkit.js
```

Run the full kit non-interactively:

```bash
bash setup-agent-toolkit.sh --all --all-runtimes
```

Target one runtime:

```bash
bash setup-agent-toolkit.sh --all --codex
```

Install a single tool:

```bash
bash setup-agent-toolkit.sh --gsd-only --all-runtimes
```

Install Graphify for Codex only:

```bash
bash setup-agent-toolkit.sh --graphify-only --codex
```

Install only bundled skills into the current project:

```bash
bash setup-agent-toolkit.sh --skills-only --all-runtimes --local
```

Install only React-scoped skills:

```bash
bash setup-agent-toolkit.sh --skills-only --codex --skills-scope frontend/react
```

List available skills and their scope paths:

```bash
bash setup-agent-toolkit.sh --skills-list
```

Install missing selected CLIs before configuring them:

```bash
bash setup-agent-toolkit.sh --all --gemini --install-missing-clis
```

## Flags

```text
--all                  Install every tool without the menu
--rtk-only             Install only RTK
--caveman-only         Install only Caveman
--superpowers-only     Install only Superpowers
--graphify-only        Install only Graphify
--gsd-only             Install only GSD
--skills-only          Install only Custom Skills
--no-rtk               Skip RTK
--no-caveman           Skip Caveman
--no-superpowers       Skip Superpowers
--no-graphify          Skip Graphify
--no-gsd               Skip GSD
--no-skills            Skip Custom Skills

--all-runtimes         Target Claude Code, Codex CLI, OpenCode and Gemini CLI
--claude               Target only Claude Code
--codex                Target only Codex CLI
--opencode             Target only OpenCode
--gemini               Target only Gemini CLI
--no-claude            Skip Claude Code
--no-codex             Skip Codex CLI
--no-opencode          Skip OpenCode
--no-gemini            Skip Gemini CLI

--global               Install runtime assets into user config directories
--local                Install runtime assets into the current project
--skills-dir DIR       Use another source directory for skills
--skills-scope SCOPE   Install skills under a relative scope path, repeatable
--skills-list          List discovered skills and exit
--install-missing-clis Install selected runtime CLIs if missing
--help, -h             Show help
```

## Configuration

The installer can be customized with environment variables:

```text
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
GEMINI_CLI_PACKAGE    npm package used to install Gemini CLI
```

Defaults:

```text
CAVEMAN_PACKAGE=github:JuliusBrussee/caveman
GRAPHIFY_PACKAGE=graphifyy
GRAPHIFY_INSTALLER=uv
GSD_PACKAGE=get-shit-done-cc@latest
CLAUDE_CLI_PACKAGE=@anthropic-ai/claude-code
CODEX_CLI_PACKAGE=@openai/codex
OPENCODE_CLI_PACKAGE=opencode-ai
GEMINI_CLI_PACKAGE=@google/gemini-cli
```

## Adding Skills

Add personal skills under a scope path:

```text
skills/<scope>/<skill-name>/SKILL.md
```

Suggested organization:

```text
skills/
  core/
    agent-toolkit-maintainer/
      SKILL.md
  frontend/
    react/
      react-component-architecture/
        SKILL.md
  backend/
    node/
      fastify-api-patterns/
        SKILL.md
    go/
      go-service-patterns/
        SKILL.md
```

The installer discovers `SKILL.md` files recursively. The repository path is
used only for organization; runtime installs remain flat:

```text
~/.codex/skills/react-component-architecture/
~/.codex/skills/fastify-api-patterns/
~/.codex/skills/go-service-patterns/
```

Each skill should be concise and self-contained:

```markdown
---
name: my-skill
description: Use when doing a specific kind of task.
---

# My Skill

Follow these steps...
```

The installer validates the core Agent Skills requirements:

- each skill is a directory containing `SKILL.md`;
- `SKILL.md` starts with YAML frontmatter;
- `name` and `description` are required;
- `name` uses lowercase letters, numbers and hyphens only;
- `description` is non-empty and under 1024 characters.

For larger skills, put detailed supporting material in `references/`, scripts in
`scripts/`, and reusable assets in `assets/`.

Use `--skills-scope` to install only a subset:

```bash
bash setup-agent-toolkit.sh --skills-only --codex --skills-scope backend/node
```

Gemini CLI uses its native command:

```bash
gemini skills install skills/<skill-name> --scope user --consent
```

For local/project installs, the setup uses `--scope workspace`.

## Verification

Run the full local check:

```bash
npm run check
```

Available quality scripts:

```bash
npm run build             # Compile TypeScript into dist/
npm run typecheck         # Type-check source and unit tests
npm run lint              # Biome lint and format checks
npm run lint:fix          # Apply safe Biome fixes
npm run format            # Format with Biome
npm run test:unit         # Vitest unit tests
npm run test:integration  # Shell integration test
npm test                  # Unit + integration tests
```

The shell integration test validates the wrapper, flags, fake runtime CLIs,
installer command wiring, skill discovery and public-safe reference checks.

## Maintenance

Keep this repository public-safe:

- do not add company-specific URLs, tokens, secrets or internal project names;
- prefer public package installers and configurable sources;
- keep the installer idempotent;
- cover pure module behavior with Vitest;
- keep the shell integration test around behavior that can regress;
- document what is automatic and what still depends on each runtime CLI.
