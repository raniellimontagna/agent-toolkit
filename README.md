<!-- generated-by: gsd-doc-writer -->

# Agent Toolkit

Agent Toolkit is a Node.js CLI for installing a pinned, reusable set of coding-agent tools and skills across Claude Code, Codex CLI, OpenCode, Gemini CLI, and Antigravity.

## Quick Start

1. Install [Node.js 24 or newer](https://nodejs.org/) so `npm` and `npx` are available.
2. Install the default tool set for Codex CLI:

```bash
npx -y @ranimontagna/agent-toolkit --all --codex
```

`--all` installs the default tool set. Agent Browser remains a separate opt-in because it also provisions Chrome for Testing. See [Getting Started](docs/GETTING-STARTED.md) for interactive setup, project-local installs, and selective skill examples.

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
| RTK | `rtk-ai/rtk@v0.43.0`, with a SHA-256 pin for every supported archive |
| Caveman | `JuliusBrussee/caveman@25d22f864ad68cc447a4cb93aefde918aa4aec9f` |
| Graphify | `graphifyy==0.9.11` |
| GSD | `@opengsd/gsd-core@1.6.1` |
| Agent Browser | `agent-browser@0.31.1` |
| Agent Skills CLI | `skills@1.5.13`, with each source repository pinned to a full commit |
| Runtime CLIs | `@anthropic-ai/claude-code@2.1.204`, `@openai/codex@0.143.0`, `opencode-ai@1.17.15`, and `@google/gemini-cli@0.49.0` |

The Agent Skills catalog exposes these locked bundle IDs and skill names:

- `improve`: `improve`
- `agent-browser`: `agent-browser`
- `frontend-skills`: `impeccable`, `web-design-guidelines`, `react-doctor`, `remotion-best-practices`
- `planning-skills`: `grill-me`, `grilling`, `grill-with-docs`, `domain-modeling`, `codebase-design`, `improve-codebase-architecture`

React Doctor is installed from [`millionco/react-doctor`](https://github.com/millionco/react-doctor) at a pinned commit and is documented upstream under a Modified MIT License. It is an agent skill integration, not automatic CI setup. Remotion Best Practices is installed from [`remotion-dev/skills`](https://github.com/remotion-dev/skills) at a pinned commit.

Bundled third-party skills preserve upstream attribution and license files in their skill directories. The repository catalog and immutable source pins in [`tools.lock.json`](tools.lock.json) are the source of truth.

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

If RTK is not installed yet, run `pnpm run check` directly. The detailed workflows live in [Development](docs/DEVELOPMENT.md), [Testing](docs/TESTING.md), and [Deployment and Releases](docs/DEPLOYMENT.md). Releases are driven by Git tags and GitHub Actions; see the [Changelog](CHANGELOG.md) for the published history.

Agent Toolkit is available under the [MIT License](LICENSE).
