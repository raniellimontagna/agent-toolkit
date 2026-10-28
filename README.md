# Agent Toolkit

Agent Toolkit is a Node.js CLI for installing a pinned, reusable set of coding-agent tools and skills across Claude Code, Codex CLI, OpenCode, Gemini CLI, and Antigravity.

[![npm version](https://img.shields.io/npm/v/@ranimontagna/agent-toolkit)](https://www.npmjs.com/package/@ranimontagna/agent-toolkit)
[![CI](https://github.com/raniellimontagna/agent-toolkit/actions/workflows/ci.yml/badge.svg)](https://github.com/raniellimontagna/agent-toolkit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/raniellimontagna/agent-toolkit)](LICENSE)

**npm:** [@ranimontagna/agent-toolkit](https://www.npmjs.com/package/@ranimontagna/agent-toolkit)

## Features

- One command installs the same tool set (RTK, Caveman, Superpowers, Graphify, GSD, third-party skill bundles and the bundled Custom Skills) into one or more agent runtimes.
- Every external source is pinned in [`tools.lock.json`](tools.lock.json); mutable or re-identified sources are rejected unless you opt in.
- Interactive menu or fully non-interactive flags, with global or project-local (`--local`) scope.
- `--dry-run` prints the install plan first, `--doctor` reports what is installed, and `--repair` / `--uninstall` work from a manifest of the installed Custom Skills.
- Bundled skills can be filtered by package, scope or exact path.
- `ariadne` runs an autonomous, story-by-story coding loop inside a Git repository.

## Quick Start

1. Install [Node.js 24 or newer](https://nodejs.org/) so `npm` and `npx` are available.
2. Install the default tool set for Codex CLI:

```bash
npx -y @ranimontagna/agent-toolkit --all --codex
```

`--all` installs the default tool set. Agent Browser remains a separate opt-in because it also provisions Chrome for Testing. See [Getting Started](docs/GETTING-STARTED.md) for interactive setup, project-local installs, and selective skill examples.

To start an Ariadne autonomous coding loop inside a Git repository:

```bash
npx -y @ranimontagna/agent-toolkit ariadne init
npx -y @ranimontagna/agent-toolkit ariadne doctor
npx -y @ranimontagna/agent-toolkit ariadne run
npx -y @ranimontagna/agent-toolkit ariadne status
```

A normal Ariadne run autonomously edits the project and creates successful-story commits. It never pushes or uses destructive Git cleanup; use `ariadne run --dry-run` before granting the selected runtime's headless permission mode. See [Getting Started](docs/GETTING-STARTED.md#run-ariadne) for state, recovery, logs, and exit codes.

## Usage Example

A typical first session: preview, install, then add a few project skills.

```bash
# 1. Print the install plan for Claude Code without changing any file
npx -y @ranimontagna/agent-toolkit --all --claude --dry-run

# 2. Run the same selection for real
npx -y @ranimontagna/agent-toolkit --all --claude

# 3. Check what is installed (add --json for machine-readable output)
npx -y @ranimontagna/agent-toolkit --doctor --claude

# 4. List the bundled skills, then add only the backend ones to this project for Codex CLI
npx -y @ranimontagna/agent-toolkit --skills-list
npx -y @ranimontagna/agent-toolkit --skills-only --codex --local --skills-package backend
```

Run `npx -y @ranimontagna/agent-toolkit --help` for every flag and environment variable.

## Choose Tools and Runtimes

| Selection | CLI form | What it targets |
|---|---|---|
| Default tool set | `--all` | RTK, Caveman, Superpowers, Graphify, GSD, Improve, Frontend Skills, Planning Skills, and bundled Custom Skills |
| Agent Browser | `--agent-browser-only` | The pinned browser automation CLI, Chrome for Testing, and its matching agent skill; intentionally excluded from `--all` |
| Claude Code | `--claude` | Claude Code plugins and skills |
| Codex CLI | `--codex` | Codex plugins, skills, and local automation |
| OpenCode | `--opencode` | OpenCode skills and package-driven tools |
| Gemini CLI | `--gemini` | Gemini extensions and native skill installs |
| Antigravity | `--antigravity` | Antigravity skills and supported integrations |

Use the interactive installer to mix individual tools. For multiple runtimes, start with `--all-runtimes` and subtract targets with `--no-<runtime>`; bare runtime selectors target only one runtime.

```bash
# Claude Code and Codex CLI only: --claude --codex would keep just the last one
npx -y @ranimontagna/agent-toolkit --all --all-runtimes --no-opencode --no-gemini --no-antigravity
```

## Safe Lifecycle Operations

Preview and inspect before changing an environment, then use the manifest-backed lifecycle commands when an installation needs maintenance.

| Operation | Example |
|---|---|
| Preview the selected plan without mutations | `npx -y @ranimontagna/agent-toolkit --all --codex --dry-run` |
| Inspect status for a selected runtime | `npx -y @ranimontagna/agent-toolkit --doctor --codex` |
| Emit the Doctor report as JSON | `npx -y @ranimontagna/agent-toolkit --doctor --json --codex` |
| Use the `--status` alias | `npx -y @ranimontagna/agent-toolkit --status --codex` |
| Re-run selected installs and refresh skill records | `npx -y @ranimontagna/agent-toolkit --repair --all --codex` |
| Preview manifest-backed skill removal | `npx -y @ranimontagna/agent-toolkit --uninstall --skills-only --codex --dry-run` |
| Remove recorded, validated skill paths | `npx -y @ranimontagna/agent-toolkit --uninstall --skills-only --codex` |
| Report newer candidates for pinned sources | `npx -y @ranimontagna/agent-toolkit --update-lock` |
| Audit bundled Custom Skill metadata and links | `npx -y @ranimontagna/agent-toolkit --skills-audit` |

The installer rejects mutable or re-identified external sources by default. Keep the pins in `tools.lock.json`; use `--allow-mutable-sources` only for an intentional, reviewed override.

## Current External Sources

Current external sources:

| Tool | Locked source |
|---|---|
| RTK | `rtk-ai/rtk@v0.52.0`, with a SHA-256 pin for every supported archive |
| Caveman | `JuliusBrussee/caveman@2e08b9177c07bb7249a8a2d1a6758e5db281d002` |
| Graphify | `graphifyy==0.9.95` |
| GSD | `@opengsd/gsd-core@1.18.0` |
| Agent Browser | `agent-browser@0.39.4` |
| Agent Skills CLI | `skills@1.7.4`, with each source repository pinned to a full commit |
| Runtime CLIs | `@anthropic-ai/claude-code@2.1.310`, `@openai/codex@0.164.0`, `opencode-ai@1.19.4`, and `@google/gemini-cli@0.65.0` |
| Ariadne adaptation provenance | `snarktank/ralph@6c53cb0b831ebe8739c6a003e22af14902d8b0b5`, with reviewed SHA-256 values for the MIT license and both adapted source skills |

The Agent Skills catalog exposes these locked bundle IDs and skill names:

- `improve`: `improve`
- `agent-browser`: `agent-browser`
- `frontend-skills`: `impeccable`, `web-design-guidelines`, `react-doctor`, `remotion-best-practices`, `ui-humanizer`, `motion-designer`
- `planning-skills`: `grill-me`, `grilling`, `grill-with-docs`, `domain-modeling`, `codebase-design`, `improve-codebase-architecture`
- `research-skills`: `webscraping-expert`
- `security`: `api-security-audit`, `source-leak-audit`, `cicd-security-audit`, `cloud-misconfiguration-audit`, `llm-agent-security-audit`, `js-secrets-audit`

Bundled third-party skills preserve upstream attribution and license files in their skill directories. The repository catalog and immutable source pins in [`tools.lock.json`](tools.lock.json) are the source of truth.

## Third-Party Skills and Licenses

Agent Toolkit is MIT-licensed; skills that come from other projects keep their own licenses.

- **Installed from upstream (not copied here):** React Doctor from [`millionco/react-doctor`](https://github.com/millionco/react-doctor), documented upstream under a Modified MIT License (an agent skill integration, not automatic CI setup); Remotion Best Practices from [`remotion-dev/skills`](https://github.com/remotion-dev/skills); UI Humanizer, Motion Designer and Webscraping Expert from [`gabrielgreco1/skills`](https://github.com/gabrielgreco1/skills), which has no license file but grants use and modification in its README.
- **Bundled and copied or adapted:** each such skill keeps a `NOTICE.md` with its source, commit and license, plus the upstream license text. Examples: `security/security-audit` (vendored from `cloudflare/security-audit-skill`), `media/brag-slim` (from `latent-spaces/brag`), the `security` rewrites (informed by `uphiago/recon-skills`) and the Ariadne skills (adapted from `snarktank/ralph`).
- **Not MIT:** `general/code-reviewer` (Apache-2.0) and `frontend/design/revenue-centric-design` (source-available terms; no gambling, betting or casino use).

[Third-Party Sources and Licenses](docs/THIRD-PARTY.md) lists every source, upstream repository and license.

## Shared Skills Package

The build writes `skills.index.json` to the repository root: a deterministic catalog of every bundled skill. The file is git-ignored and ships inside the npm package. Each entry exposes a stable repository-relative `ref`, the full `SKILL.md` path, and an optional prompt-sized `BRIEF.md` path.

Nine skills shared with prompt-injection consumers are also assembled from that single root `skills/` source into the workspace package [`@ranimontagna/agent-skills`](packages/agent-skills/), which is not published to npm yet. Its generated index and copied package tree are created only in temporary staging and are not tracked by Git. The package has no Node.js runtime dependency or executable entrypoint: consumers can load the Markdown directly, preferring `BRIEF.md` when prompt space is limited and `SKILL.md` when progressive disclosure is available. Review its exact npm payload without publishing:

```bash
pnpm run pack:skills
```

Publishing this package is intentionally independent from the Agent Toolkit release scripts. Tags in the `agent-skills-vX.Y.Z` namespace trigger the dedicated [`Release Agent Skills`](.github/workflows/release-agent-skills.yml) workflow; toolkit tags remain `vX.Y.Z`.

## Documentation

- [Getting Started](docs/GETTING-STARTED.md) — first install, tool and runtime selection, lifecycle safety, and troubleshooting
- [Architecture](docs/ARCHITECTURE.md) — CLI components, data flow, and trust boundaries
- [Configuration](docs/CONFIGURATION.md) — environment variables, defaults, and source overrides
- [Development](docs/DEVELOPMENT.md) — local setup, code style, and contribution workflow
- [Testing](docs/TESTING.md) — unit, integration, and release-gate verification
- [Deployment and Releases](docs/DEPLOYMENT.md) — tag-driven npm publishing and release recovery
- [Third-Party Sources and Licenses](docs/THIRD-PARTY.md) — upstream source and license of every external or vendored skill
- [Changelog](CHANGELOG.md) — complete version history
- [Contributing](CONTRIBUTING.md) — contribution requirements
- [Security](SECURITY.md) — vulnerability reporting and supply-chain policy

## Development and Releases

Install the pinned development dependencies and run the complete local gate:

```bash
corepack prepare pnpm@11.8.0 --activate
pnpm install --frozen-lockfile
rtk pnpm run check
```

If RTK is not installed yet, run `pnpm run check` directly. The detailed workflows live in [Development](docs/DEVELOPMENT.md), [Testing](docs/TESTING.md), and [Deployment and Releases](docs/DEPLOYMENT.md); see the [Changelog](CHANGELOG.md) for the published history.

For normal releases, run the scripted patch flow:

```bash
pnpm run release:patch -- --push
```

`--push` performs the remote preflight before changing files, then runs the release checks and atomically pushes `main` and the new tag.

The `Release` workflow runs from matching version tags in GitHub Actions and publishes the package to npm through trusted publishing. See [Deployment and Releases](docs/DEPLOYMENT.md) for the complete release and recovery procedures.

## License

Released under the [MIT License](LICENSE). Third-party skills keep their own licenses; see [Third-Party Sources and Licenses](docs/THIRD-PARTY.md).
