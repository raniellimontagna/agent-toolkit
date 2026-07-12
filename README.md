# Agent Toolkit

One command to set up an AI coding-agent workspace across Claude Code, Codex
CLI, OpenCode, Gemini CLI and Antigravity.

```bash
npx -y @ranimontagna/agent-toolkit
```

Agent Toolkit installs the tools and skills I use to run agentic coding
workflows: RTK, Caveman, Superpowers, Graphify, GSD, shadcn Improve,
third-party frontend skills installed through Agent Skills CLI and bundled
Custom Skills.

The installer is a TypeScript CLI published to npm. The Bash script is only a
compatibility wrapper for users who already run `setup-agent-toolkit.sh`.

## Install Flow

Interactive terminals use a Clack menu. The installer first shows what it can
detect locally, then asks what to install, then shows a final plan before doing
any work.

![Detected status terminal screen](docs/assets/install-status.svg)

Custom Skills are selected in three levels: package, optional scope and exact
individual skills. Today this repository ships `core`, `backend`, `frontend`,
`general` and `devops`; future packages can be added under
`skills/<package>/...` and they will appear automatically in the menu.

![Custom Skill granular selection terminal screen](docs/assets/install-skill-packages.svg)

The final plan shows selected tools, runtimes, skill packages, scopes, exact
skills and already present destinations before installation starts.

![Install plan terminal screen](docs/assets/install-plan.svg)

## What It Installs

| Area | What it adds |
|---|---|
| RTK | Token-aware shell proxy for coding-agent sessions |
| Caveman | Terse response mode and optional agent integrations |
| Superpowers | Planning, TDD, debugging, review and delivery workflows |
| Graphify | Queryable knowledge graphs for codebases, docs and project context |
| GSD | Phase-based planning, execution, verification and project control |
| Improve | shadcn advisor skill for codebase audits and execution plans |
| Agent Browser | Optional pinned browser automation CLI, Chrome for Testing and matching agent skill |
| Frontend Skills | Third-party frontend skills installed through Agent Skills CLI: Impeccable, Web Design Guidelines, React Doctor and Remotion Best Practices |
| Planning Skills | Third-party planning skills installed through Agent Skills CLI: Grill Me, Grilling, Grill With Docs and Domain Modeling (mattpocock/skills) |
| Custom Skills | Bundled skills from this repository, selected by package, scope and exact skill |

## Supported Runtimes

| Runtime | Support |
|---|---|
| Claude Code | Plugins and skills |
| Codex CLI | Plugins, skills and local automation |
| OpenCode | Skills plus package-driven tools |
| Gemini CLI | Extensions and native Agent Skills install |
| Antigravity | Custom Skills, third-party frontend skills and official `agy` install |

Superpowers is installed automatically for Claude Code, Codex CLI and Gemini
CLI. OpenCode Superpowers support is not automated yet because the upstream
install flow is not a stable single command. Antigravity Superpowers support is
not automated yet because there is not a pinned supported plugin package in this
toolkit.

Caveman, GSD, Improve, Frontend Skills, Planning Skills and Custom Skills can
target Claude Code, Codex CLI, OpenCode and Gemini CLI. Improve, Frontend
Skills, Planning Skills and Custom Skills can also target Antigravity. Graphify is installed through the official
`graphifyy` package and registers itself for selected runtimes that Graphify
supports.

When `--install-missing-clis` is enabled, Antigravity is installed through the
official `agy` installer instead of npm. Global Antigravity Custom Skills are
copied to the official `~/.gemini/antigravity-cli/skills/` path and mirrored to
`~/.agents/skills/` for compatibility with the Agent Skills CLI.

## Quick Commands

Run the interactive installer:

```bash
npx -y @ranimontagna/agent-toolkit
```

Install the full kit for Codex CLI:

```bash
npx -y @ranimontagna/agent-toolkit --all --codex
```

Install the full kit for every supported runtime:

```bash
npx -y @ranimontagna/agent-toolkit --all --all-runtimes
```

Install only Graphify for Codex CLI:

```bash
npx -y @ranimontagna/agent-toolkit --graphify-only --codex
```

Install only shadcn Improve for Codex CLI:

```bash
npx -y @ranimontagna/agent-toolkit --improve-only --codex
```

Install Agent Browser for Codex CLI:

```bash
npx -y @ranimontagna/agent-toolkit --agent-browser-only --codex
```

Agent Browser is deliberately excluded from `--all`: it installs a browser
automation executable, downloads Chrome for Testing and copies its pinned skill.
The toolkit never runs `agent-browser install --with-deps`, configures plugins,
cloud browsers or credentials. Run `agent-browser doctor` directly when you
want to validate its local Chrome setup.

Install only third-party frontend design skills for Codex CLI:

```bash
npx -y @ranimontagna/agent-toolkit --frontend-skills-only --codex
```

Install only third-party planning skills (grilling interviews and domain
modeling) for Claude Code:

```bash
npx -y @ranimontagna/agent-toolkit --planning-skills-only --claude
```

Install only bundled Custom Skills into the current project:

```bash
npx -y @ranimontagna/agent-toolkit --skills-only --codex --local
```

Preview an install plan without changing files:

```bash
npx -y @ranimontagna/agent-toolkit --all --codex --dry-run
```

Inspect selected tools and runtimes as JSON:

```bash
npx -y @ranimontagna/agent-toolkit --doctor --json --codex
```

Audit bundled Custom Skills metadata and local links:

```bash
npx -y @ranimontagna/agent-toolkit --skills-audit
```

Report newer candidates for pinned external tools:

```bash
npx -y @ranimontagna/agent-toolkit --update-lock
```

Install only the `core` Custom Skills package:

```bash
npx -y @ranimontagna/agent-toolkit --skills-only --codex --skills-package core
```

List bundled Custom Skills and their repository scope paths:

```bash
npx -y @ranimontagna/agent-toolkit --skills-list
```

Install missing selected runtime CLIs before configuring them:

```bash
npx -y @ranimontagna/agent-toolkit --all --gemini --install-missing-clis
```

## Custom Skills

Bundled skills live under `skills/`.

```text
skills/
  core/
    agent-toolkit-maintainer/
      SKILL.md
    onboard-repo/
      SKILL.md
  backend/
    api/
      api-design/
        SKILL.md
    database/
      postgres-patterns/
        SKILL.md
    fastify-best-practices/
      SKILL.md
      rules/
    go/
      golang-patterns/
        SKILL.md
      golang-testing/
        SKILL.md
    java/
      java-coding-standards/
        SKILL.md
      java-junit/
        SKILL.md
    kotlin/
      kotlin-patterns/
        SKILL.md
      kotlin-testing/
        SKILL.md
    python/
      python-patterns/
        SKILL.md
      python-testing/
        SKILL.md
  frontend/
    accessibility/
      SKILL.md
    astro/
      astro-developer/
        SKILL.md
        architecture.md
        constraints.md
        debugging.md
        testing.md
    design/
      revenue-centric-design/
        SKILL.md
        assets/
        references/
      ui-ux-pro-max/
        SKILL.md
        data/
        scripts/
    gsap/
      gsap-core/
        SKILL.md
      gsap-frameworks/
        SKILL.md
      gsap-performance/
        SKILL.md
      gsap-plugins/
        SKILL.md
      gsap-react/
        SKILL.md
      gsap-scrolltrigger/
        SKILL.md
      gsap-timeline/
        SKILL.md
      gsap-utils/
        SKILL.md
    react-native/
      react-native-expert/
        SKILL.md
      react-native-unistyles-v3/
        SKILL.md
    react/
      react-patterns/
        SKILL.md
        rules/
      react-performance/
        SKILL.md
        rules/
      react-testing/
        SKILL.md
        rules/
  general/
    code-reviewer/
      SKILL.md
      rules/
    thermo-nuclear-code-quality-review/
      SKILL.md
  devops/
    docker-patterns/
      SKILL.md
```

The first path segment is a selectable package:

```text
skills/<package>/<optional-scope>/<skill-name>/SKILL.md
```

Runtime installs are flat even when repository paths are nested. For example,
`skills/backend/java/java-junit/SKILL.md` installs as:

```text
~/.codex/skills/java-junit/
```

Use `--skills-package` to select first-level packages:

```bash
npx -y @ranimontagna/agent-toolkit --skills-only --codex --skills-package core
```

Use `--skills-scope` to select a narrower path:

```bash
npx -y @ranimontagna/agent-toolkit --skills-only --codex --skills-scope backend/java
```

Use `--skills-path` to select exact individual skills:

```bash
npx -y @ranimontagna/agent-toolkit \
  --skills-only \
  --codex \
  --skills-package backend \
  --skills-scope backend/python \
  --skills-path backend/python/python-testing
```

Install only Python skills:

```bash
npx -y @ranimontagna/agent-toolkit --skills-only --codex --skills-scope backend/python
```

Install only Kotlin skills:

```bash
npx -y @ranimontagna/agent-toolkit --skills-only --codex --skills-scope backend/kotlin
```

Install only React Native skills:

```bash
npx -y @ranimontagna/agent-toolkit --skills-only --codex --skills-scope frontend/react-native
```

All filters can be combined. The selected package filter runs first, the scope
filter narrows the result, and the path filter selects exact skills from that
final list.

```bash
npx -y @ranimontagna/agent-toolkit \
  --skills-only \
  --codex \
  --skills-package backend \
  --skills-scope backend/java \
  --skills-path backend/java/java-junit
```

Each skill must be a directory containing `SKILL.md` with frontmatter:

```markdown
---
name: my-skill
description: Use when doing a specific kind of task.
---

# My Skill

Follow these steps...
```

### Included Skill Packages

| Package | Skill | Source |
|---|---|---|
| `core` | `agent-toolkit-maintainer` | Maintained in this repository |
| `core` | `onboard-repo` | Maintained in this repository |
| `backend` | `api-design` | Copied from Affaan Mustafa's [`ECC`](https://github.com/affaan-m/ECC/tree/main/skills/api-design) under the MIT license |
| `backend` | `postgres-patterns` | Adapted from Affaan Mustafa's [`ECC`](https://github.com/affaan-m/ECC/tree/main/.kiro/skills/postgres-patterns) and [`sickn33/antigravity-awesome-skills`](https://github.com/sickn33/antigravity-awesome-skills/tree/main/skills/postgresql), both under the MIT license |
| `backend` | `fastify-best-practices` | Copied from Matteo Collina's [`mcollina/skills`](https://github.com/mcollina/skills/tree/main/skills/fastify) under the MIT license |
| `backend` | `golang-patterns` | Copied from Affaan Mustafa's [`ECC`](https://github.com/affaan-m/ECC/tree/main/skills/golang-patterns) under the MIT license |
| `backend` | `golang-testing` | Copied from Affaan Mustafa's [`ECC`](https://github.com/affaan-m/ECC/tree/main/.kiro/skills/golang-testing) under the MIT license |
| `backend` | `java-coding-standards` | Copied from Affaan Mustafa's [`ECC`](https://github.com/affaan-m/ECC/tree/main/skills/java-coding-standards) under the MIT license |
| `backend` | `java-junit` | Copied from GitHub's [`awesome-copilot`](https://github.com/github/awesome-copilot/tree/main/skills/java-junit) under the MIT license |
| `backend` | `kotlin-patterns` | Copied from Affaan Mustafa's [`ECC`](https://github.com/affaan-m/ECC/tree/main/skills/kotlin-patterns) under the MIT license |
| `backend` | `kotlin-testing` | Copied from Affaan Mustafa's [`ECC`](https://github.com/affaan-m/ECC/tree/main/skills/kotlin-testing) under the MIT license |
| `backend` | `python-patterns` | Copied from Affaan Mustafa's [`ECC`](https://github.com/affaan-m/ECC/tree/main/.kiro/skills/python-patterns) under the MIT license |
| `backend` | `python-testing` | Copied from Affaan Mustafa's [`ECC`](https://github.com/affaan-m/ECC/tree/main/.kiro/skills/python-testing) under the MIT license |
| `devops` | `docker-patterns` | Adapted from Affaan Mustafa's [`ECC`](https://github.com/affaan-m/ECC/tree/main/.kiro/skills/docker-patterns) and [`sickn33/antigravity-awesome-skills`](https://github.com/sickn33/antigravity-awesome-skills/tree/main/skills/docker-expert), both under the MIT license |
| `frontend` | `accessibility` | Copied from Affaan Mustafa's [`ECC`](https://github.com/affaan-m/ECC/tree/main/skills/accessibility) under the MIT license |
| `frontend` | `astro-developer` | Copied from the official [`withastro/astro`](https://github.com/withastro/astro/tree/main/.agents/skills/astro-developer) repository under the MIT license |
| `frontend` | `revenue-centric-design` | Copied from Helio Costa's [`revenue-centric-design`](https://github.com/heliocosta-dev/revenue-centric-design) under source-available custom terms requiring attribution and excluding gambling/betting/casino use |
| `frontend` | `ui-ux-pro-max` | Copied from Next Level Builder's [`ui-ux-pro-max-skill`](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/tree/main/.claude/skills/ui-ux-pro-max) under the MIT license |
| `frontend` | `gsap-core` | Copied from GreenSock's [`gsap-skills`](https://github.com/greensock/gsap-skills/tree/main/skills/gsap-core) under the MIT license |
| `frontend` | `gsap-frameworks` | Copied from GreenSock's [`gsap-skills`](https://github.com/greensock/gsap-skills/tree/main/skills/gsap-frameworks) under the MIT license |
| `frontend` | `gsap-performance` | Copied from GreenSock's [`gsap-skills`](https://github.com/greensock/gsap-skills/tree/main/skills/gsap-performance) under the MIT license |
| `frontend` | `gsap-plugins` | Copied from GreenSock's [`gsap-skills`](https://github.com/greensock/gsap-skills/tree/main/skills/gsap-plugins) under the MIT license |
| `frontend` | `gsap-react` | Copied from GreenSock's [`gsap-skills`](https://github.com/greensock/gsap-skills/tree/main/skills/gsap-react) under the MIT license |
| `frontend` | `gsap-scrolltrigger` | Copied from GreenSock's [`gsap-skills`](https://github.com/greensock/gsap-skills/tree/main/skills/gsap-scrolltrigger) under the MIT license |
| `frontend` | `gsap-timeline` | Copied from GreenSock's [`gsap-skills`](https://github.com/greensock/gsap-skills/tree/main/skills/gsap-timeline) under the MIT license |
| `frontend` | `gsap-utils` | Copied from GreenSock's [`gsap-skills`](https://github.com/greensock/gsap-skills/tree/main/skills/gsap-utils) under the MIT license |
| `frontend` | `react-native-expert` | Copied from Jeffallan's [`claude-skills`](https://github.com/Jeffallan/claude-skills/tree/main/skills/react-native-expert) under the MIT license |
| `frontend` | `react-native-unistyles-v3` | Copied from Jacek Pudysz's [`react-native-unistyles`](https://github.com/jpudysz/react-native-unistyles/tree/main/skills/react-native-unistyles-v3), declared MIT upstream |
| `frontend` | `react-patterns` | Copied from Affaan Mustafa's [`ECC`](https://github.com/affaan-m/ECC/tree/main/skills/react-patterns) under the MIT license |
| `frontend` | `react-performance` | Copied from Affaan Mustafa's [`ECC`](https://github.com/affaan-m/ECC/tree/main/skills/react-performance) under the MIT license |
| `frontend` | `react-testing` | Copied from Affaan Mustafa's [`ECC`](https://github.com/affaan-m/ECC/tree/main/skills/react-testing) under the MIT license |
| `general` | `code-reviewer` | Copied from Shubhamsaboo's [`awesome-llm-apps`](https://github.com/Shubhamsaboo/awesome-llm-apps/tree/main/awesome_agent_skills/code-reviewer) under the repository Apache-2.0 license |
| `general` | `thermo-nuclear-code-quality-review` | Copied from Cursor's [`plugins`](https://github.com/cursor/plugins/tree/main/cursor-team-kit/skills/thermo-nuclear-code-quality-review) repository under the MIT license |

Each React skill carries its own ECC `rules/react` references so Markdown links
still resolve after the installer copies skills into flat runtime directories.

The installer validates:

- `SKILL.md` exists;
- frontmatter starts and closes with `---`;
- `name` and `description` are present;
- `name` uses lowercase letters, numbers and hyphens;
- `description` is non-empty and under 1024 characters.

Other third-party frontend skills such as Impeccable, Web Design Guidelines, React
Doctor and Remotion Best Practices are not vendored as bundled Custom Skills. The
`frontend-skills` tool installs them externally through the Agent Skills CLI from
pinned public sources. React Doctor is installed as an agent skill integration, not automatic CI setup.

## CLI Reference

```text
Tools:
  --all                  Install every tool without the menu
  --rtk-only             Install only RTK
  --caveman-only         Install only Caveman
  --superpowers-only     Install only Superpowers
  --graphify-only        Install only Graphify
  --gsd-only             Install only GSD
  --improve-only         Install only shadcn Improve
  --agent-browser-only   Install only Agent Browser
  --frontend-skills-only Install only third-party frontend skills
  --planning-skills-only Install only third-party planning skills
  --skills-only          Install only Custom Skills
  --no-rtk               Skip RTK
  --no-caveman           Skip Caveman
  --no-superpowers       Skip Superpowers
  --no-graphify          Skip Graphify
  --no-gsd               Skip GSD
  --no-improve           Skip shadcn Improve
  --no-agent-browser     Skip Agent Browser
  --no-frontend-skills   Skip third-party frontend skills
  --no-planning-skills   Skip third-party planning skills
  --no-skills            Skip Custom Skills

Runtimes:
  --all-runtimes         Target Claude Code, Codex CLI, OpenCode, Gemini CLI and Antigravity
  --claude               Target only Claude Code
  --codex                Target only Codex CLI
  --opencode             Target only OpenCode
  --gemini               Target only Gemini CLI
  --antigravity          Target only Antigravity
  --no-claude            Skip Claude Code
  --no-codex             Skip Codex CLI
  --no-opencode          Skip OpenCode
  --no-gemini            Skip Gemini CLI
  --no-antigravity       Skip Antigravity

Install scope:
  --global               Install runtime assets into user config directories
  --local                Install runtime assets into the current project
  --skills-dir DIR       Use another source directory for Custom Skills
  --skills-package NAME  Install Custom Skills from a first-level package
  --skills-scope SCOPE   Install skills under a relative scope path
  --skills-path PATH     Install an exact Custom Skill path
  --skills-list          List discovered Custom Skills and exit

Operations:
  --dry-run              Print the selected install plan without changing files
  --plan-only            Alias for --dry-run
  --doctor, --status     Inspect selected tools and runtimes without installing
  --json                 Emit machine-readable output for supported operations
  --uninstall            Remove files recorded in the Agent Toolkit manifest
  --repair               Re-run selected installs and refresh the manifest
  --update-lock          Report newer versions for pinned external sources
  --skills-audit         Validate bundled Custom Skills metadata and links

Other:
  --install-missing-clis Install or update selected runtime CLIs
  --allow-mutable-sources Allow explicit mutable package sources like @latest
  --help, -h             Show help
```

Repeat `--skills-package`, `--skills-scope` or `--skills-path` to select more
than one filter.

## Configuration

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
AGENT_BROWSER_PACKAGE npm package used to install Agent Browser
CUSTOM_SKILLS_DIR     Source directory for Custom Skills
SKILLS_PACKAGE        Comma-separated first-level skill package filters
SKILLS_SCOPE          Comma-separated skill scope filters
SKILLS_PATH           Comma-separated exact skill path filters
ANTIGRAVITY_INSTALL_SCRIPT Official Antigravity CLI install script URL
ANTIGRAVITY_SKILLS_DIR Global Antigravity skills directory
ANTIGRAVITY_LEGACY_SKILLS_DIR Legacy Antigravity skills mirror directory
CLAUDE_CLI_PACKAGE    npm package used to install Claude Code CLI
CODEX_CLI_PACKAGE     npm package used to install Codex CLI
OPENCODE_CLI_PACKAGE  npm package used to install OpenCode CLI
GEMINI_CLI_PACKAGE    npm package used to install Gemini CLI
```

Defaults come from `tools.lock.json`:

```text
CAVEMAN_PACKAGE=github:JuliusBrussee/caveman#25d22f864ad68cc447a4cb93aefde918aa4aec9f
GRAPHIFY_PACKAGE=graphifyy==0.9.11
GRAPHIFY_INSTALLER=uv
GSD_PACKAGE=@opengsd/gsd-core@1.6.1
AGENT_BROWSER_PACKAGE=agent-browser@0.31.1
SKILLS_CLI_PACKAGE=skills@1.5.13
ANTIGRAVITY_INSTALL_SCRIPT=https://antigravity.google/cli/install.sh
CLAUDE_CLI_PACKAGE=@anthropic-ai/claude-code@2.1.204
CODEX_CLI_PACKAGE=@openai/codex@0.143.0
OPENCODE_CLI_PACKAGE=opencode-ai@1.17.15
GEMINI_CLI_PACKAGE=@google/gemini-cli@0.49.0
```

Mutable overrides like `@latest`, unpinned npm packages or GitHub package
sources without a full commit SHA are blocked unless you pass
`--allow-mutable-sources` or set `ALLOW_MUTABLE_SOURCES=1`.

The same explicit flag is required when an override changes the *identity* of
a source (a different npm package name, GitHub repository, PyPI package or RTK
release repository than the one pinned in `tools.lock.json`), and when
`TOOLS_LOCK_PATH` points at an alternate lock file. `ANTIGRAVITY_INSTALL_SCRIPT`
must always be an HTTPS URL — the script is piped to bash, so plain HTTP is
rejected even with the flag.

## Security Model

This project has two supply-chain boundaries:

- repository dependencies, controlled by `pnpm-lock.yaml`, CI, `pnpm audit`,
  pnpm supply-chain policies and npm release provenance;
- external tools installed by the runtime installer, controlled by
  `tools.lock.json` and runtime provenance validation.

Repository installs are configured in `pnpm-workspace.yaml` to delay newly
published package versions for 24 hours, enforce that delay strictly, reject
missing registry publish timestamps, block transitive exotic package sources and
fail trust downgrades for packages that previously had stronger publish
evidence.

Current external sources:

| Tool | Locked source | Runtime verification |
|---|---|---|
| RTK | GitHub release `rtk-ai/rtk@v0.43.0` | Verifies the selected asset SHA-256 before extraction |
| Caveman | `JuliusBrussee/caveman` at commit `25d22f864ad68cc447a4cb93aefde918aa4aec9f` | Immutable GitHub npm spec |
| Graphify | `graphifyy==0.9.11` | Blocks unpinned package overrides |
| GSD | `@opengsd/gsd-core@1.6.1` | Blocks `@latest` unless explicitly allowed |
| Improve | `shadcn/improve` at commit `03369ee6d7cafbfcecc4346539b05b3dc0a603bb` | Clones the pinned ref before Agent Skills CLI install |
| Agent Browser | `agent-browser@0.31.1` and `vercel-labs/agent-browser` at commit `afae698a51242166170b6fe4809dd57fe9f75798` | Installs Chrome for Testing without automatic system dependencies, then copies the pinned skill |
| Frontend Skills | `skills@1.5.13`, `pbakaus/impeccable`, `vercel-labs/agent-skills`, `millionco/react-doctor` and `remotion-dev/skills` at pinned commits | Clones pinned refs before install |
| Planning Skills | `mattpocock/skills` at commit `391a2701dd948f94f56a39f7533f8eea9a859c87` (grill-me, grilling, grill-with-docs, domain-modeling) | Clones the pinned ref before install |
| Runtime CLIs | Exact npm versions for Claude, Codex, OpenCode and Gemini | Installed or updated only when `--install-missing-clis` is enabled; Antigravity uses the official `agy` installer instead of npm |

Bundled third-party skills preserve upstream attribution and license files:

| Skill | Source commit | License |
|---|---|---|
| `api-design` | `affaan-m/ECC@2bc924faf2f8e893bfe0af86b1931283693c30ae` | MIT |
| `fastify-best-practices` | `mcollina/skills@5b2a81354b6d10325da0db9decc9ce5ecc714138` | MIT |
| `astro-developer` | `withastro/astro@e37dfe2a7623acd364d7e3556ecc9b31e3e45520` | MIT |
| `gsap-*` | `greensock/gsap-skills@aed9cfd3277740755f6bfc1155c7aa645403b760` | MIT |
| `react-native-expert` | `Jeffallan/claude-skills@e8be415bc94d8d6ebddc2fb50e5d03c6e27d4319` | MIT |
| `react-native-unistyles-v3` | `jpudysz/react-native-unistyles@8b5e9fd281a81bdfd87d4fe9e6a0b042c84c5c83` | MIT |
| `react-patterns` | `affaan-m/ECC@2bc924faf2f8e893bfe0af86b1931283693c30ae` | MIT |
| `react-performance` | `affaan-m/ECC@2bc924faf2f8e893bfe0af86b1931283693c30ae` | MIT |
| `react-testing` | `affaan-m/ECC@2bc924faf2f8e893bfe0af86b1931283693c30ae` | MIT |
| `python-patterns` | `affaan-m/ECC@0f84c0e2796703fbda87d577b2636351418c7442` | MIT |
| `python-testing` | `affaan-m/ECC@0f84c0e2796703fbda87d577b2636351418c7442` | MIT |
| `kotlin-patterns` | `affaan-m/ECC@2bc924faf2f8e893bfe0af86b1931283693c30ae` | MIT |
| `kotlin-testing` | `affaan-m/ECC@2bc924faf2f8e893bfe0af86b1931283693c30ae` | MIT |

React Doctor is installed externally from `millionco/react-doctor` at a pinned
commit and is documented upstream under a Modified MIT License; it is not
copied into this repository.

Remotion Best Practices is installed externally from `remotion-dev/skills` at a
pinned commit; it is not copied into this repository.

Releases use npm trusted publishing through GitHub Actions OIDC. The npm
package is published without a long-lived npm token, and npm automatically
generates provenance for public packages published through trusted publishing.

## Repository Layout

```text
bin/
  agent-toolkit.ts       Thin TypeScript entrypoint
.github/
  workflows/
    ci.yml               Quality and security gates
    release.yml          Trusted publishing release workflow
src/
  main.ts                Installer orchestration
  args.ts                CLI flag parsing
  menu.ts                Interactive selection
  status.ts              Local install status detection
  runtimes.ts            Runtime CLI checks
  skills.ts              Recursive skill discovery and installation
  installers/            Tool-specific installers
dist/
  bin/
    agent-toolkit.js     Compiled CLI used by npm and the wrapper
docs/
  assets/                README terminal screenshots
skills/
  core/
    agent-toolkit-maintainer/
      SKILL.md
    onboard-repo/
      SKILL.md
  backend/
    fastify-best-practices/
      SKILL.md
      rules/
  frontend/
    react-native/
    react/
tests/
  unit/
  test-agent-toolkit.sh
AGENTS.md                Shared project rules for coding agents
CLAUDE.md                Pointer to AGENTS.md for Claude Code
pnpm-lock.yaml           Repository dependency lockfile
pnpm-workspace.yaml      pnpm workspace and supply-chain policy settings
setup-agent-toolkit.sh   Bash compatibility wrapper
tools.lock.json          Pinned external tool sources and RTK checksums
```

## Development

Prerequisites:

- Node.js 24+ for the full toolkit;
- `npx` for Caveman, GSD, Improve and third-party frontend skills;
- `git` for pinned third-party Agent Skills sources;
- `pnpm` 11.x for repository development;
- `npm` when using `--install-missing-clis` for npm-managed runtimes or
  publishing through npm trusted publishing;
- `curl` and `bash` when installing Antigravity CLI through
  `--install-missing-clis`;
- `uv` for Graphify, or `pipx` when `GRAPHIFY_INSTALLER=pipx`;
- `tar` or `unzip` only when RTK needs to be downloaded;
- runtime CLIs you want to target: `claude`, `codex`, `opencode`, `gemini`,
  `agy`.

Install dependencies and build from a clone:

```bash
pnpm install
pnpm run build
bash setup-agent-toolkit.sh
```

Run the local Node CLI directly:

```bash
node dist/bin/agent-toolkit.js
```

Quality scripts:

```bash
pnpm run build
pnpm run typecheck
pnpm run lint
pnpm run lint:fix
pnpm run format
pnpm run release:patch
pnpm run release:minor
pnpm run release:major
pnpm run security
pnpm run test:unit
pnpm run test:integration
pnpm test
pnpm run check
```

`pnpm run check` is the release gate. It runs lint, typecheck, unit tests, build,
compiled JavaScript syntax checks, Bash syntax checks and the shell integration
test.

The shell integration test validates the wrapper, flags, fake runtime CLIs,
installer command wiring, skill discovery and public-safe reference checks.

## CI And Release

GitHub Actions runs:

- `Check`: lint, typecheck, unit tests, build and integration tests;
- `Secret scan`: Gitleaks over full Git history;
- `Dependency audit`: `pnpm install --frozen-lockfile --ignore-scripts` and
  `pnpm audit`;
- `Dependency review`: blocks PRs that add moderate-or-higher vulnerable
  dependencies.

Release a new npm version by updating `package.json`, pushing the change to
`main`, then pushing a matching tag:

```bash
git tag v0.1.31
git push origin v0.1.31
```

For normal releases, prefer the scripted flow. It bumps `package.json`, updates
the README release tag example, runs `pnpm run check`, commits with a
Conventional Commit message and creates the local tag:

```bash
pnpm run release:patch
git push origin main v0.1.18
```

The `Release` workflow runs the full check and publishes the scoped package to
npm through trusted publishing. Dependency install and checks use pnpm, but the
final publish step intentionally stays on `npm publish` because npm trusted
publishing OIDC is handled by the npm CLI. Configure the npm package trusted
publisher for GitHub Actions with workflow filename `release.yml` before
pushing a release tag.

## Maintenance Rules

Keep this repository public-safe:

- do not add company-specific URLs, tokens, secrets or internal project names;
- keep third-party skills on pinned public sources, and only vendor them when
  the license permits copying and the repository preserves attribution;
- keep the installer idempotent;
- keep `tools.lock.json` as the source of truth for external tool versions;
- cover pure module behavior with Vitest;
- keep the shell integration test around behavior that can regress;
- document what is automatic and what still depends on each runtime CLI.
