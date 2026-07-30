# Agent Toolkit

Agent Toolkit is a Node.js CLI for installing a pinned, reusable set of coding-agent tools and skills across Claude Code, Codex CLI, OpenCode, Gemini CLI, and Antigravity.

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
| RTK | `rtk-ai/rtk@v0.44.0`, with a SHA-256 pin for every supported archive |
| Caveman | `JuliusBrussee/caveman@0d95a81d35a9f2d123a5e9430d1cfc43d55f1bb0` |
| Graphify | `graphifyy==0.9.29` |
| GSD | `@opengsd/gsd-core@1.8.0` |
| Agent Browser | `agent-browser@0.33.1` |
| Agent Skills CLI | `skills@1.5.20`, with each source repository pinned to a full commit |
| Runtime CLIs | `@anthropic-ai/claude-code@2.1.220`, `@openai/codex@0.145.0`, `opencode-ai@1.18.8`, and `@google/gemini-cli@0.52.0` |
| Ariadne adaptation provenance | `snarktank/ralph@6c53cb0b831ebe8739c6a003e22af14902d8b0b5`, with reviewed SHA-256 values for the MIT license and both adapted source skills |

The Agent Skills catalog exposes these locked bundle IDs and skill names:

- `improve`: `improve`
- `agent-browser`: `agent-browser`
- `frontend-skills`: `impeccable`, `web-design-guidelines`, `react-doctor`, `remotion-best-practices`
- `planning-skills`: `grill-me`, `grilling`, `grill-with-docs`, `domain-modeling`, `codebase-design`, `improve-codebase-architecture`
- `security`: `api-security-audit`, `source-leak-audit`, `cicd-security-audit`, `cloud-misconfiguration-audit`, `llm-agent-security-audit`, `js-secrets-audit`

React Doctor is installed from [`millionco/react-doctor`](https://github.com/millionco/react-doctor) at a pinned commit and is documented upstream under a Modified MIT License. It is an agent skill integration, not automatic CI setup. Remotion Best Practices is installed from [`remotion-dev/skills`](https://github.com/remotion-dev/skills) at a pinned commit.

Bundled third-party skills preserve upstream attribution and license files in their skill directories. The repository catalog and immutable source pins in [`tools.lock.json`](tools.lock.json) are the source of truth.

## Shared Skills Package

The build generates [`skills.index.json`](skills.index.json), a deterministic
catalog of every bundled skill. Each entry exposes a stable repository-relative
`ref`, the full `SKILL.md` path, and an optional prompt-sized `BRIEF.md` path.

Nine skills shared with prompt-injection consumers are also assembled from that
single root `skills/` source into the workspace package
`@ranimontagna/agent-skills`. The generated index and copied package tree are
created only in temporary staging and are not tracked by Git. The package has no Node.js
runtime dependency or executable entrypoint: consumers can load the Markdown
directly, preferring `BRIEF.md` when prompt space is limited and `SKILL.md` when
progressive disclosure is available. Review its exact npm payload without
publishing:

```bash
pnpm run pack:skills
```

Publishing this package is intentionally independent from the Agent Toolkit
release scripts. Tags in the `agent-skills-vX.Y.Z` namespace trigger the
dedicated [`Release Agent Skills`](.github/workflows/release-agent-skills.yml)
workflow; toolkit tags remain `vX.Y.Z`.

The first-party `security` skills are defensive rewrites informed by [`uphiago/recon-skills`](https://github.com/uphiago/recon-skills), under its MIT License. They are intended for authorized, non-destructive reviews; upstream offensive infrastructure, agent instructions, scripts, and mass-scanning workflows are not included. See [`skills/security/NOTICE.md`](skills/security/NOTICE.md) for attribution.

The first-party `ariadne` and `ariadne-prd` skills are Ariadne-specific adaptations of concepts from [`snarktank/ralph`](https://github.com/snarktank/ralph) under the MIT License. They install through the ordinary Custom Skills pipeline for all five runtimes; `tools.ariadne` records reviewed attribution only and is not fetched or executed during a normal Ariadne run. Each skill directory contains its source path, reviewed commit, and source hash in `NOTICE.md`.

## Documentation

- [Getting Started](docs/GETTING-STARTED.md) — first install, tool and runtime selection, lifecycle safety, and troubleshooting
- [Architecture](docs/ARCHITECTURE.md) — CLI components, data flow, and trust boundaries
- [Configuration](docs/CONFIGURATION.md) — environment variables, defaults, and source overrides
- [Development](docs/DEVELOPMENT.md) — local setup, code style, and contribution workflow
- [Testing](docs/TESTING.md) — unit, integration, and release-gate verification
- [Deployment and Releases](docs/DEPLOYMENT.md) — tag-driven npm publishing and release recovery
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

Agent Toolkit is available under the [MIT License](LICENSE).
