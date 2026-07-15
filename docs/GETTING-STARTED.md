# Getting Started

This guide takes you from prerequisites to a verified Agent Toolkit installation, then explains how to repair or remove the skill paths the toolkit records.

## Prerequisites

- `Node.js >=24` with `npm` and `npx`.
- Git when installing the default third-party Agent Skills bundles.
- `uv` for the default Graphify installer, or `pipx` when you set `GRAPHIFY_INSTALLER=pipx`.
- A supported platform. The complete default path has pinned RTK binaries for macOS arm64/x64, Linux arm64/x64, and Windows x64. Other operating-system or architecture combinations require a manual RTK install.
- Any runtime CLIs you already use: `claude`, `codex`, `opencode`, `gemini`, or `agy`. They are optional before the first run; pass `--install-missing-clis` to let Agent Toolkit install or update selected CLIs. Antigravity uses its official installer rather than npm.

The `npx` entry point is the portable installation path. The checkout wrapper requires Bash, so Windows users should prefer `npx` unless they are working in a compatible Bash environment.

## Interactive Installation with npx

1. Start the installer without selection flags:

   ```bash
   npx -y @ranimontagna/agent-toolkit
   ```

2. Select tools, target runtimes, and either global or local scope. If you include Custom Skills, you can refine the selection by package, scope, or exact skill.
3. Review the detected status and final plan, then confirm the installation.

The interactive menu does not install missing runtime CLIs unless you explicitly approve that step.

## Run from a Local Checkout

Use the compatibility wrapper when developing the toolkit or testing an unpublished checkout:

```bash
git clone https://github.com/raniellimontagna/agent-toolkit.git
cd agent-toolkit
corepack prepare pnpm@11.8.0 --activate
pnpm install --frozen-lockfile
pnpm run build
bash setup-agent-toolkit.sh
```

The wrapper validates Node.js 24+, then delegates to the compiled Node CLI in `dist/`. It accepts the same flags as the `npx` command.

## Choose Tools

For a non-interactive install of the default tool set, combine `--all` with a runtime selector:

```bash
npx -y @ranimontagna/agent-toolkit --all --codex
```

`--all` selects RTK, Caveman, Superpowers, Graphify, GSD, Improve, Frontend Skills, Planning Skills, and bundled Custom Skills. Agent Browser is deliberately separate because it installs its pinned CLI, provisions Chrome for Testing, and copies its agent skill:

```bash
npx -y @ranimontagna/agent-toolkit --agent-browser-only --codex
```

Use one `--<tool>-only` flag when you want a single tool. If multiple `-only` flags are supplied, the later selector replaces the earlier one; use `--all` with `--no-<tool>` exclusions for a combined non-interactive selection.

## Choose Runtimes

Agent Toolkit targets Claude Code, Codex CLI, OpenCode, Gemini CLI, and Antigravity. The bare selectors `--claude`, `--codex`, `--opencode`, `--gemini`, and `--antigravity` are mutually exclusive: a later bare selector replaces the earlier one.

For multiple runtimes, select all runtimes and exclude the ones you do not want. This example targets Claude Code, Codex CLI, and OpenCode:

```bash
npx -y @ranimontagna/agent-toolkit \
  --all \
  --all-runtimes \
  --no-gemini \
  --no-antigravity
```

Do not combine bare runtime selectors to express a multi-runtime selection.

## Choose Global or Local Scope

`--global` is the default. It installs runtime assets in user configuration directories and keeps the global manifest under the user's Agent Toolkit state directory.

`--local` targets the current project. Supported integrations use project-specific destinations, Graphify receives its project flag, and the manifest is written below the project's `.agent-toolkit/` directory.

Run a local install from the project you intend to configure:

```bash
npx -y @ranimontagna/agent-toolkit --skills-only --codex --local
```

## Select Custom Skills

Bundled Custom Skills use repository-relative paths below `skills/`. Filters are repeatable and can be combined; package filtering runs first, scope filtering narrows the result, and exact paths select individual skills from the remaining set.

Select a first-level package:

```bash
npx -y @ranimontagna/agent-toolkit \
  --skills-only \
  --codex \
  --local \
  --skills-package backend
```

Select a nested scope:

```bash
npx -y @ranimontagna/agent-toolkit \
  --skills-only \
  --codex \
  --local \
  --skills-scope backend/java
```

Select one exact skill path:

```bash
npx -y @ranimontagna/agent-toolkit \
  --skills-only \
  --codex \
  --local \
  --skills-path frontend/react/react-testing
```

Use `--skills-list` to inspect the current package, scope, and path inventory before selecting filters.

## Preview, Install, and Verify

Preview the exact plan before allowing mutations:

```bash
npx -y @ranimontagna/agent-toolkit --all --codex --dry-run
```

If the plan is correct, run the same selection without `--dry-run`:

```bash
npx -y @ranimontagna/agent-toolkit --all --codex
```

After installation, inspect the selected tools and runtime as machine-readable output:

```bash
npx -y @ranimontagna/agent-toolkit --doctor --json --codex
```

`--status` is an alias for `--doctor`. Doctor reports missing tools or runtime CLIs but does not install them.

## Manifest, Repair, and Uninstall

Agent Toolkit currently writes manifest entries only for Custom Skills installed through its Custom Skills installer, including skills loaded from an alternate source directory selected with `--skills-dir`. The versioned manifest records its scope and generation time, plus each recorded Custom Skill's runtime, source, absolute destination, and installation time. External Agent Skills bundles such as Improve, Frontend Skills, Planning Skills, and Agent Browser are not recorded; neither are RTK, Caveman, Superpowers, Graphify, GSD, or runtime CLIs. Local and global scopes use separate manifests.

Repair re-runs the selected installers, but only successful Custom Skill installations handled by the Custom Skills installer update or insert manifest entries and refresh the manifest generation time. This includes toolkit-managed copies from an alternate `--skills-dir` source and successful installs delegated to Gemini CLI. External Agent Skills bundles and other tools may be reinstalled by their own installers; `--repair` does not bring them under manifest management:

```bash
npx -y @ranimontagna/agent-toolkit --repair --all --codex
```

Preview manifest-backed removal before deleting anything:

```bash
npx -y @ranimontagna/agent-toolkit \
  --uninstall \
  --skills-only \
  --codex \
  --dry-run
```

Then remove the validated entries for the selected runtime:

```bash
npx -y @ranimontagna/agent-toolkit --uninstall --skills-only --codex
```

Uninstall removes only manifest-recorded Custom Skill destinations created by the Custom Skills installer, including recorded copies sourced through `--skills-dir`, and only when they are direct, contained children of recognized runtime skill roots. It does not uninstall external Agent Skills bundles or other tools, sweep unrecorded files, or remove arbitrary directories. If a destination escapes its expected root, changes identity during removal, or otherwise fails safety validation, removal is rejected and the manifest is preserved for review or retry.

## Common Problems

### A runtime CLI is missing

Run Doctor for the intended runtime. Install the CLI yourself, or let Agent Toolkit install or update the selected CLI:

```bash
npx -y @ranimontagna/agent-toolkit \
  --skills-only \
  --gemini \
  --install-missing-clis
```

### npm reports `EACCES`

Prefer a Node version manager so global npm packages belong to your user. If you keep the current Node installation, move npm's global prefix to a user-writable directory:

```bash
npm config set prefix ~/.npm-global
export PATH="$HOME/.npm-global/bin:$PATH"
```

Retry the installer after opening a new shell or exporting the updated path. Avoid solving this with a privileged global npm install.

### Graphify cannot find its installer

Graphify uses `uv` by default. Install `uv`, or install `pipx` and select it explicitly:

```bash
GRAPHIFY_INSTALLER=pipx \
  npx -y @ranimontagna/agent-toolkit --graphify-only --codex
```

Only `uv` and `pipx` are accepted installer choices. If Graphify installs outside `PATH`, add the reported executable directory to `PATH` and retry.

### A target path is already a file

Agent Toolkit will not replace a file with a skill directory. Remove or rename the reported file, confirm that the intended parent path is a directory, and rerun the same command.

### An external source is rejected

External package versions, repository commits, checksums, and source identities are immutable by default. Remove the override to use `tools.lock.json`, or update that lock through review. `--allow-mutable-sources` also permits mutable versions, source-identity changes, and alternate lock files, so use it only when you explicitly accept that trust change.

## Next Steps

- [Configuration](CONFIGURATION.md) — environment variables, defaults, and source overrides
- [Architecture](ARCHITECTURE.md) — components, install flow, and trust boundaries
- [Testing](TESTING.md) — unit, integration, and release-gate commands
- [Security](../SECURITY.md) — vulnerability reporting and supply-chain controls
- [Changelog](../CHANGELOG.md) — release history and upgrade context
