# Agent Toolkit

Personal toolkit for setting up AI coding agents with the tools I use most:
RTK, Caveman, Superpowers, Graphify, GSD, third-party frontend skills and
bundled personal skills.

The installer source is written in TypeScript and compiled to a dependency-free
Node CLI in `dist/`. The Bash file is kept only as a compatibility wrapper, so
existing commands still work after building the project.

The repository includes CI, security gates, MIT licensing, portable agent
instructions and tests for the installer flows.

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
| Frontend Skills | Third-party design skills installed through Agent Skills CLI |
| Custom Skills | Personal skills bundled in this repository |

Superpowers is installed automatically for Claude Code, Codex CLI and Gemini CLI.
OpenCode support is intentionally not automated yet for Superpowers because the
upstream install flow is not a stable single command. Caveman, GSD, Frontend
Skills and Custom Skills can target Claude Code, Codex CLI, OpenCode and Gemini
CLI. Graphify is installed through the official `graphifyy` package and
registers itself for the selected runtimes.

## Repository Layout

```text
bin/
  agent-toolkit.ts             Thin TypeScript entrypoint
.github/
  workflows/
    ci.yml              Quality and security gates
AGENTS.md              Shared project rules for coding agents
CLAUDE.md              Pointer to AGENTS.md for Claude Code
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
tools.lock.json         Pinned external tool sources and RTK checksums
LICENSE                 MIT license
skills/
  core/
    agent-toolkit-maintainer/
      SKILL.md
  backend/
tests/
  unit/
    *.test.ts
  test-agent-toolkit.sh
```

## Prerequisites

- Node.js 22+ for the full toolkit
- `npx` for Caveman, GSD and third-party frontend skills
- `git` for pinned third-party frontend skill sources
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

Run the published package directly:

```bash
npx -y @ranimontagna/agent-toolkit
```

Interactive runs ask which tools, runtimes and skill scopes to install. Pressing
Enter does not silently install the full kit; choose `all` explicitly when that
is what you want. Interactive terminals use a visual Clack menu. Pipe answers
or set `AGENT_TOOLKIT_MENU=plain` to use the line-based fallback.

Run the full kit for Codex in one command:

```bash
npx -y @ranimontagna/agent-toolkit --all --codex
```

Run the full kit for every supported runtime:

```bash
npx -y @ranimontagna/agent-toolkit --all --all-runtimes
```

From a local clone, install development dependencies and build the CLI first:

```bash
npm install
npm run build
bash setup-agent-toolkit.sh
```

You can also call the compiled Node CLI directly from a built clone:

```bash
node dist/bin/agent-toolkit.js
```

Target one runtime:

```bash
npx -y @ranimontagna/agent-toolkit --all --codex
```

Install a single tool:

```bash
npx -y @ranimontagna/agent-toolkit --gsd-only --all-runtimes
```

Install Graphify for Codex only:

```bash
npx -y @ranimontagna/agent-toolkit --graphify-only --codex
```

Install only third-party frontend design skills for Codex:

```bash
npx -y @ranimontagna/agent-toolkit --frontend-skills-only --codex
```

Install only bundled skills into the current project:

```bash
npx -y @ranimontagna/agent-toolkit --skills-only --all-runtimes --local
```

Install only React-scoped skills:

```bash
npx -y @ranimontagna/agent-toolkit --skills-only --codex --skills-scope frontend/react
```

List available skills and their scope paths:

```bash
npx -y @ranimontagna/agent-toolkit --skills-list
```

Install missing selected CLIs before configuring them:

```bash
npx -y @ranimontagna/agent-toolkit --all --gemini --install-missing-clis
```

## Flags

```text
--all                  Install every tool without the menu
--rtk-only             Install only RTK
--caveman-only         Install only Caveman
--superpowers-only     Install only Superpowers
--graphify-only        Install only Graphify
--gsd-only             Install only GSD
--frontend-skills-only Install only third-party frontend skills
--skills-only          Install only Custom Skills
--no-rtk               Skip RTK
--no-caveman           Skip Caveman
--no-superpowers       Skip Superpowers
--no-graphify          Skip Graphify
--no-gsd               Skip GSD
--no-frontend-skills   Skip third-party frontend skills
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
--allow-mutable-sources Allow explicit mutable source overrides like @latest
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
SKILLS_CLI_PACKAGE    npm package used for third-party skill installs
GSD_SCOPE             global or local
TOOLS_LOCK_PATH       External tool provenance lock path
ALLOW_MUTABLE_SOURCES Set to 1 to allow mutable source overrides
AGENT_TOOLKIT_MENU    Set to plain to force the line-based interactive menu
CUSTOM_SKILLS_DIR     Source directory for custom skills
SKILLS_SCOPE          Comma-separated skill scope filters
CLAUDE_CLI_PACKAGE    npm package used to install Claude Code CLI
CODEX_CLI_PACKAGE     npm package used to install Codex CLI
OPENCODE_CLI_PACKAGE  npm package used to install OpenCode CLI
GEMINI_CLI_PACKAGE    npm package used to install Gemini CLI
```

Defaults:

```text
CAVEMAN_PACKAGE=github:JuliusBrussee/caveman#655b7d9c5431f822264b7732e9901c5578ac84cf
GRAPHIFY_PACKAGE=graphifyy==0.8.31
GRAPHIFY_INSTALLER=uv
GSD_PACKAGE=get-shit-done-cc@1.42.3
SKILLS_CLI_PACKAGE=skills@1.5.10
CLAUDE_CLI_PACKAGE=@anthropic-ai/claude-code@2.1.162
CODEX_CLI_PACKAGE=@openai/codex@0.137.0
OPENCODE_CLI_PACKAGE=opencode-ai@1.15.13
GEMINI_CLI_PACKAGE=@google/gemini-cli@0.45.0
```

These defaults come from `tools.lock.json`. Mutable overrides like `@latest`,
unpinned npm packages, or GitHub package sources without a full commit SHA are
blocked unless you pass `--allow-mutable-sources` or set
`ALLOW_MUTABLE_SOURCES=1`.

## External Tool Provenance

The CI protects this repository's own dependency graph with `npm audit`,
registry signature checks, dependency review and Gitleaks. The installer also
protects tools downloaded later by reading `tools.lock.json` and rejecting
mutable external sources by default.

Current external sources:

| Tool | Locked source | Runtime verification |
|---|---|---|
| RTK | GitHub release `rtk-ai/rtk@v0.42.1` | Verifies the selected asset SHA-256 before extraction |
| Caveman | `JuliusBrussee/caveman` at commit `655b7d9c5431f822264b7732e9901c5578ac84cf` | Installs through an immutable GitHub npm spec |
| Graphify | `graphifyy==0.8.31` | Blocks unpinned package overrides |
| GSD | `get-shit-done-cc@1.42.3` | Blocks `@latest` unless explicitly allowed |
| Frontend Skills | `skills@1.5.10`, `pbakaus/impeccable` and `Leonxlnx/taste-skill` at pinned commits | Clones pinned refs, then installs selected skills through Agent Skills CLI |
| Runtime CLIs | Exact npm versions for Claude, Codex, OpenCode and Gemini | Used when `--install-missing-clis` is enabled |

Use `TOOLS_LOCK_PATH=/path/to/tools.lock.json` to test another lock file. Keep
that file committed if it represents the expected public installer behavior.

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

Third-party frontend design skills are not bundled as personal skills. The
`frontend-skills` tool installs them externally:

| Runtime folder | Skill name | Source |
|---|---|---|
| `impeccable` | `impeccable` | `pbakaus/impeccable`, Apache-2.0 |
| `design-taste-frontend` | `design-taste-frontend` | `Leonxlnx/taste-skill`, MIT |

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
npm run security          # npm vulnerability audit and registry signature checks
npm run security:audit    # Fail on moderate+ vulnerable dependencies
npm run security:signatures # Verify npm signatures and attestations
npm run test:unit         # Vitest unit tests
npm run test:integration  # Shell integration test
npm test                  # Unit + integration tests
```

The shell integration test validates the wrapper, flags, fake runtime CLIs,
installer command wiring, skill discovery and public-safe reference checks.

The GitHub Actions CI runs four gates:

- `Check`: lint, typecheck, unit tests, build and integration tests;
- `Secret scan`: Gitleaks over full Git history;
- `Dependency audit`: `npm audit` and `npm audit signatures`;
- `Dependency review`: blocks PRs that add moderate-or-higher vulnerable dependencies.

These gates cover repository code, npm dependencies and pull-request dependency
changes. External tool version safety is handled by `tools.lock.json` plus
runtime provenance checks in the installer.

## Maintenance

Keep this repository public-safe:

- do not add company-specific URLs, tokens, secrets or internal project names;
- prefer public package installers and configurable sources;
- keep the installer idempotent;
- cover pure module behavior with Vitest;
- keep the shell integration test around behavior that can regress;
- document what is automatic and what still depends on each runtime CLI.

Release a new npm version by updating `package.json`, pushing the change to
`main`, then pushing a matching tag:

```bash
git tag v0.1.2
git push origin v0.1.2
```

The `Release` workflow runs the full check and publishes the scoped package to
npm. Configure the repository secret `NPM_TOKEN` before pushing a release tag.
