<!-- generated-by: gsd-doc-writer -->

# Configuration

Agent Toolkit is configured with command-line flags, environment variables, and the repository's validated [`tools.lock.json`](../tools.lock.json). No environment variable is required for a normal run: unset values resolve to the lock-backed, path, or behavior defaults described below.

## Precedence and Selection Rules

Arguments are applied from left to right. Put the broad selector before its exclusions, as in `--all --no-graphify` or `--all-runtimes --no-antigravity`; a later broad selector can re-enable an earlier exclusion.

- The last bare `--*-only` tool selector wins. Replacing an earlier `-only` selector emits an override warning. Use `--all` followed by one or more `--no-<tool>` flags when you need several tools.
- The last bare runtime selector (`--claude`, `--codex`, `--opencode`, `--gemini`, or `--antigravity`) wins. Replacing an earlier bare selector emits an override warning. Use `--all-runtimes` followed by one or more `--no-<runtime>` flags when you need several runtimes.
- `GSD_SCOPE` initializes the install scope. An explicit `--global` or `--local` overrides it; if both CLI flags occur, the later one wins.
- Repeated `--skills-package`, `--skills-scope`, and `--skills-path` selectors accumulate. Each argument may also be a comma-separated list. Values are trimmed and matched case-insensitively; scope and path separators are normalized to `/`.
- `--skills-dir` does not accumulate. Its required argument is resolved against the current working directory, and the last occurrence wins.
- `--plan-only` is an alias for `--dry-run`. `--status` is an alias for `--doctor`.
- `--json` only changes operations that implement machine-readable output. Currently those are `--doctor`/`--status` and `--update-lock`; it does not convert normal installation, dry-run, skill-list, audit, repair, or uninstall output to JSON.
- Avoid combining independent operation flags. If combined, early-return operations are checked in this order: skill list, skill audit, lock update, and Doctor. Manifest-backed uninstall runs before a normal dry-run; `--uninstall --dry-run` therefore previews removal instead of printing an install plan.

Without a noninteractive selector, the installer opens its menu. The initial noninteractive state enables every standard tool except Agent Browser and enables all five runtimes; a bare tool or runtime selector narrows its respective set.

## Command-Line Options

Both supported entry points accept the same flags:

```bash
npx -y @ranimontagna/agent-toolkit [options]
bash setup-agent-toolkit.sh [options]
```

Every option is long-form except the documented `-h` help alias.

### Tools

| Flag | Effect |
|---|---|
| `--all` | Select all standard tools without the menu. Agent Browser remains excluded and requires `--agent-browser-only`. |
| `--rtk-only` | Select only RTK. |
| `--caveman-only` | Select only Caveman. |
| `--superpowers-only` | Select only Superpowers. |
| `--graphify-only` | Select only Graphify. |
| `--gsd-only` | Select only GSD. |
| `--improve-only` | Select only shadcn Improve. |
| `--agent-browser-only` | Select only Agent Browser. This is its explicit opt-in path. |
| `--frontend-skills-only` | Select only the pinned third-party frontend skill bundle. |
| `--planning-skills-only` | Select only the pinned third-party planning skill bundle. |
| `--skills-only` | Select only Custom Skills discovered below the configured skills source directory. |
| `--no-rtk` | Exclude RTK from the current tool selection. |
| `--no-caveman` | Exclude Caveman from the current tool selection. |
| `--no-superpowers` | Exclude Superpowers from the current tool selection. |
| `--no-graphify` | Exclude Graphify from the current tool selection. |
| `--no-gsd` | Exclude GSD from the current tool selection. |
| `--no-improve` | Exclude shadcn Improve from the current tool selection. |
| `--no-agent-browser` | Exclude Agent Browser. It is already excluded from the default and `--all` selections. |
| `--no-frontend-skills` | Exclude the third-party frontend skill bundle. |
| `--no-planning-skills` | Exclude the third-party planning skill bundle. |
| `--no-skills` | Exclude bundled or custom-directory Custom Skills. |

### Runtimes

| Flag | Effect |
|---|---|
| `--all-runtimes` | Select Claude Code, Codex CLI, OpenCode, Gemini CLI, and Antigravity. |
| `--claude` | Select only Claude Code. |
| `--codex` | Select only Codex CLI. |
| `--opencode` | Select only OpenCode. |
| `--gemini` | Select only Gemini CLI. |
| `--antigravity` | Select only Antigravity. |
| `--no-claude` | Exclude Claude Code from the current runtime selection. |
| `--no-codex` | Exclude Codex CLI from the current runtime selection. |
| `--no-opencode` | Exclude OpenCode from the current runtime selection. |
| `--no-gemini` | Exclude Gemini CLI from the current runtime selection. |
| `--no-antigravity` | Exclude Antigravity from the current runtime selection. |

### Install Scope and Skill Filters

| Flag | Effect |
|---|---|
| `--global` | Install runtime assets into user configuration directories. This is the default scope. |
| `--local` | Install runtime assets into the current project and use project-local runtime targets. |
| `--skills-dir DIR` | Replace the Custom Skills source directory. `DIR` is required and is resolved to an absolute path from the current working directory. |
| `--skills-package NAME` | Restrict Custom Skills to a first-level package. `NAME` is required; the flag is repeatable and accepts comma-separated values. |
| `--skills-scope SCOPE` | Restrict Custom Skills to a relative scope and its descendants. `SCOPE` is required; the flag is repeatable and accepts comma-separated values. |
| `--skills-path PATH` | Restrict Custom Skills to an exact source-relative skill path. `PATH` is required; the flag is repeatable and accepts comma-separated values. |
| `--skills-list` | List discovered Custom Skills after applying configured filters, then exit. |

Package filtering runs first, scope filtering narrows that result, and exact paths narrow it again. Empty filters mean all discovered Custom Skills. Normalized package and path values named `all` are treated as no explicit package or path filter.

### Operations

| Flag | Effect |
|---|---|
| `--dry-run` | Validate applicable provenance and print the selected install plan without changing files. With `--uninstall`, preview matching manifest removals. |
| `--plan-only` | Alias for `--dry-run`. |
| `--doctor` | Inspect selected tools and runtimes without installing. Supports `--json`. |
| `--status` | Alias for `--doctor`. |
| `--json` | Emit machine-readable output for supported operations: Doctor and lock-update reporting. |
| `--uninstall` | Remove validated Custom Skill paths recorded in the selected scope's Agent Toolkit manifest. It does not sweep unrecorded paths or uninstall other tool categories. |
| `--repair` | Re-run selected installers. Successful Custom Skill installs refresh their manifest entries. |
| `--update-lock` | Report newer versions for pinned external sources without modifying the lock. Supports `--json`. |
| `--skills-audit` | Validate bundled Custom Skill metadata and local links, then exit. |

### Other

| Flag | Effect |
|---|---|
| `--install-missing-clis` | Install or update selected runtime CLIs. Claude Code, Codex CLI, OpenCode, and Gemini CLI use their configured npm package specs; Antigravity uses its configured HTTPS installer script. |
| `--allow-mutable-sources` | Permit mutable sources, source-identity changes, a non-default Antigravity installer URL, RTK release-source exceptions, or an alternate lock for this invocation. This changes the trust policy and emits warnings. |
| `--help`, `-h` | Print CLI help and exit. No other short flags are defined. |

## Runtime Skill Targets

Local targets are always relative to the directory where Agent Toolkit runs. Global environment overrides affect only global scope.

| Runtime | Local target | Default global target | Global override |
|---|---|---|---|
| Claude Code | `.claude/skills` | `~/.claude/skills` | `CLAUDE_CONFIG_DIR` supplies the parent directory. |
| Codex CLI | `.codex/skills` | `~/.codex/skills` | `CODEX_HOME` supplies the parent directory. |
| OpenCode | `.opencode/skills` | `~/.config/opencode/skills` | See the OpenCode precedence below. |
| Gemini CLI | `.gemini/skills` | `~/.gemini/skills` | `GEMINI_CONFIG_DIR` supplies the parent directory. |
| Antigravity | `.agents/skills` | `~/.gemini/antigravity-cli/skills` and legacy `~/.agents/skills` | `ANTIGRAVITY_SKILLS_DIR` and `ANTIGRAVITY_LEGACY_SKILLS_DIR` replace the two full target paths. |

OpenCode resolves its global configuration directory in this exact order:

1. `OPENCODE_CONFIG_DIR` as the directory itself.
2. The directory containing the `OPENCODE_CONFIG` file path.
3. `XDG_CONFIG_HOME/opencode`.
4. `~/.config/opencode`.

The installer appends `skills` to the resolved OpenCode directory. For Antigravity, the current and legacy target strings are deduplicated when they are exactly equal, so configuring both variables to the same value produces one target.

## Environment Variables

All variables are optional. "Source identity effect" distinguishes a value that can select different executable content from a destination, mode, or filter. Permission-gated values are checked before applicable Doctor, dry-run, or installation operations. Exact immutable version changes that retain the locked package or repository identity can pass the identity and mutability checks; a different identity or a mutable spec requires `--allow-mutable-sources` or `ALLOW_MUTABLE_SOURCES=1`.

### Public Variables

| Variable | Accepted form | Default source | Purpose | Source identity effect |
|---|---|---|---|---|
| `RTK_INSTALL_DIR` | Directory path | `~/.local/bin` | Destination for the RTK binary. | No; destination only. |
| `RTK_GITHUB` | RTK GitHub release-metadata URL | Tagged release API URL derived from the RTK repository and tag in `tools.lock.json` | Selects the RTK release metadata endpoint. URLs outside the locked repository's releases namespace and `/releases/latest` require mutable-source permission. Downloaded assets are still checked against the lock's SHA-256. | Yes; identity-gated release source. |
| `CAVEMAN_PACKAGE` | Immutable npm spec or `github:owner/repository#<full-commit-sha>` | GitHub repository and full commit from `tools.lock.json` | Package spec passed to `npx` for Caveman. | Yes; package/repository identity is checked. |
| `CAVEMAN_MODE` | `minimal` or `all` | `minimal` | Controls whether the Caveman installer receives `--minimal`. Only the exact value `all` selects full mode; other values behave as minimal. | No; mode only. |
| `GRAPHIFY_PACKAGE` | Python package spec, normally `name==exact.version` | Package and exact version from `tools.lock.json` | Package passed to `uv tool install` or `pipx install`. | Yes; package identity and mutability are checked. |
| `GRAPHIFY_INSTALLER` | `uv` or `pipx` | `uv` | Chooses the Graphify package installer when Graphify must be installed or repaired. Other values are rejected when an installer is required. | No; install mechanism only. |
| `GSD_PACKAGE` | Immutable npm package spec, normally `name@exact.version` | Package and exact version from `tools.lock.json` | Package spec passed to `npx` for GSD. | Yes; package identity and mutability are checked. |
| `AGENT_BROWSER_PACKAGE` | Immutable npm package spec, normally `name@exact.version` | Package and exact version from `tools.lock.json` | Package installed for Agent Browser when that separately opted-in tool is selected. | Yes; package identity and mutability are checked. |
| `SKILLS_CLI_PACKAGE` | Immutable npm package spec, normally `name@exact.version` | Agent Skills CLI package and exact version from `tools.lock.json` | CLI used to install the pinned Improve, Frontend Skills, Planning Skills, and Agent Browser skill bundles. | Yes; CLI package identity and mutability are checked. |
| `GSD_SCOPE` | `global` or `local` | `global` | Initializes install scope. Only the exact value `local` selects local scope; other values resolve to global. CLI scope flags override it. | No; scope only. |
| `TOOLS_LOCK_PATH` | Path to a complete, valid version-1 lock JSON document | Package-root `tools.lock.json` | Replaces every lock-backed checksum, ref, package, and runtime CLI default. The alternate file is validated against the same schema. | Yes; replaces the lock and requires mutable-source permission. |
| `ALLOW_MUTABLE_SOURCES` | Exactly `1` to enable; unset otherwise | Disabled | Environment equivalent of `--allow-mutable-sources`. It permits, but does not itself select, mutable or re-identified sources and alternate locks. | No direct selection; it opens the provenance permission gate. |
| `AGENT_TOOLKIT_MENU` | `plain` to force line-based prompts | Rich interactive menu on a TTY; piped answers when no TTY is available | Chooses the line-based interactive menu instead of the rich prompt UI. | No. |
| `CUSTOM_SKILLS_DIR` | Directory path; an absolute path is recommended | Package-root `skills` directory | Replaces the source root scanned for Custom Skills. A missing or non-directory path produces no discovered skills and a warning in relevant operations. | Yes; changes the Custom Skill source root. |
| `SKILLS_PACKAGE` | Comma-separated first-level package names | Empty, meaning no package filter | Initializes package filters before CLI selectors append more values. | No external identity change; selection only. |
| `SKILLS_SCOPE` | Comma-separated relative scope paths | Empty, meaning no scope filter | Initializes scope filters before CLI selectors append more values. | No external identity change; selection only. |
| `SKILLS_PATH` | Comma-separated exact source-relative skill paths | Empty, meaning no path filter | Initializes exact-path filters before CLI selectors append more values. | No external identity change; selection only. |
| `ANTIGRAVITY_INSTALL_SCRIPT` | HTTPS URL without embedded credentials | `https://antigravity.google/cli/install.sh` | Installer script used only when `--install-missing-clis` needs Antigravity. A different URL requires mutable-source permission; plain HTTP and credential-bearing URLs are rejected. | Yes; executable script identity. |
| `ANTIGRAVITY_SKILLS_DIR` | Full directory path | `~/.gemini/antigravity-cli/skills` | Replaces the current global Antigravity skill target. | No; destination only. |
| `ANTIGRAVITY_LEGACY_SKILLS_DIR` | Full directory path | `~/.agents/skills` | Replaces the legacy global Antigravity skill mirror. | No; destination only. |
| `CLAUDE_CLI_PACKAGE` | Immutable npm package spec, normally `name@exact.version` | Claude Code package and exact version from `tools.lock.json` | Package used when `--install-missing-clis` installs or updates Claude Code. | Yes; checked when runtime CLI installation is enabled. |
| `CODEX_CLI_PACKAGE` | Immutable npm package spec, normally `name@exact.version` | Codex CLI package and exact version from `tools.lock.json` | Package used when `--install-missing-clis` installs or updates Codex CLI. | Yes; checked when runtime CLI installation is enabled. |
| `OPENCODE_CLI_PACKAGE` | Immutable npm package spec, normally `name@exact.version` | OpenCode package and exact version from `tools.lock.json` | Package used when `--install-missing-clis` installs or updates OpenCode. | Yes; checked when runtime CLI installation is enabled. |
| `GEMINI_CLI_PACKAGE` | Immutable npm package spec, normally `name@exact.version` | Gemini CLI package and exact version from `tools.lock.json` | Package used when `--install-missing-clis` installs or updates Gemini CLI. | Yes; checked when runtime CLI installation is enabled. |

### Runtime and Integration Variables

These variables are implemented integration points but are not printed in the short `Environment:` help block.

| Variable | Accepted form | Default source | Purpose | Source identity effect |
|---|---|---|---|---|
| `CLAUDE_CONFIG_DIR` | Directory path | `~/.claude` | Replaces Claude Code's global configuration parent; `skills` is appended. | No; destination only. |
| `CODEX_HOME` | Directory path | `~/.codex` | Replaces Codex CLI's global configuration parent; `skills` is appended. | No; destination only. |
| `OPENCODE_CONFIG_DIR` | Directory path | Next OpenCode precedence source | Highest-precedence OpenCode global configuration directory; `skills` is appended. | No; destination only. |
| `OPENCODE_CONFIG` | File path | Next OpenCode precedence source | Its directory becomes the OpenCode configuration directory when `OPENCODE_CONFIG_DIR` is absent; the file is not read by Agent Toolkit. | No; destination only. |
| `XDG_CONFIG_HOME` | Directory path | `~/.config` for the OpenCode fallback | Supplies the parent of `opencode/skills` when the two OpenCode-specific variables are absent. | No; destination only. |
| `GEMINI_CONFIG_DIR` | Directory path | `~/.gemini` | Replaces Gemini CLI's global configuration parent; `skills` is appended. | No; destination only. |
| `UV_TOOL_BIN_DIR` | Directory path | Unset | Adds a Graphify executable candidate after `PATH` and before `PIPX_BIN_DIR` and `~/.local/bin`. | No package-source change; it can change which existing executable is discovered. |
| `PIPX_BIN_DIR` | Directory path | Unset | Adds a Graphify executable candidate after `UV_TOOL_BIN_DIR` and before `~/.local/bin`. | No package-source change; it can change which existing executable is discovered. |
| `NO_COLOR` | Any non-empty value, conventionally `1` | Color enabled | Disables ANSI color sequences in logs. | No. |
| `SKILLS_PACKAGES` | Comma-separated first-level package names | Empty | Compatibility alias used only when `SKILLS_PACKAGE` is unset or empty. | No external identity change; selection only. |
| `SKILLS_PATHS` | Comma-separated exact source-relative skill paths | Empty | Compatibility alias used only when `SKILLS_PATH` is unset or empty. | No external identity change; selection only. |

Graphify executable discovery checks the active `PATH` first, then `UV_TOOL_BIN_DIR`, `PIPX_BIN_DIR`, and finally `~/.local/bin`. The first executable candidate wins. These variables do not change `GRAPHIFY_PACKAGE`, but pointing them at a different pre-existing executable changes what the toolkit invokes.

## Locked Source Configuration

[`tools.lock.json`](../tools.lock.json) is a complete versioned JSON document, not a partial user-override file. Agent Toolkit loads and validates the whole document before deriving defaults from it.

| Lock area | Validation and use |
|---|---|
| `version` | Must be exactly `1`. |
| `tools.rtk` | Defines the GitHub repository, a non-`latest` tag, and per-asset SHA-256 hashes. |
| `tools.caveman` | Defines a GitHub repository and full 40-character commit SHA. |
| `tools.graphify`, `tools.gsd`, and `tools.agentBrowser` | Define package names with exact immutable versions. |
| `tools.agentSkills` | Defines the exact Agent Skills CLI, full-commit repository identities, supported bundle metadata, and safe repository-relative skill paths. |
| `runtimeClis` | Defines exact npm package versions for Claude Code, Codex CLI, OpenCode, and Gemini CLI. |

The lock rejects mutable package versions, short Git refs, invalid SHA-256 values, unsupported bundle identifiers, unknown repository references, and unsafe relative paths. Prefer a reviewed lock change when intentionally updating project defaults. `TOOLS_LOCK_PATH` replaces the entire trust catalog and therefore requires the mutable-source permission gate for applicable provenance checks.

## Safe Examples

### Plain interactive menu

Force the line-based menu without persisting a shell setting:

```bash
AGENT_TOOLKIT_MENU=plain npx -y @ranimontagna/agent-toolkit
```

### Graphify through pipx

```bash
GRAPHIFY_INSTALLER=pipx \
  npx -y @ranimontagna/agent-toolkit --graphify-only --codex
```

### Local Custom Skills from one scope

Run from the project that should receive `.codex/skills`:

```bash
npx -y @ranimontagna/agent-toolkit \
  --skills-only \
  --codex \
  --local \
  --skills-scope backend/java
```

### Multiple Custom Skill packages

Repeat package selectors to accumulate them:

```bash
npx -y @ranimontagna/agent-toolkit \
  --skills-only \
  --codex \
  --skills-package backend \
  --skills-package frontend
```

The equivalent environment form is `SKILLS_PACKAGE=backend,frontend`.

### Custom global target directories

This invocation targets four isolated configuration roots and leaves Antigravity excluded:

```bash
CLAUDE_CONFIG_DIR="$HOME/.config/agent-toolkit/claude" \
CODEX_HOME="$HOME/.config/agent-toolkit/codex" \
OPENCODE_CONFIG_DIR="$HOME/.config/agent-toolkit/opencode" \
GEMINI_CONFIG_DIR="$HOME/.config/agent-toolkit/gemini" \
  npx -y @ranimontagna/agent-toolkit \
    --skills-only \
    --all-runtimes \
    --no-antigravity \
    --global
```

### Expert-only mutable source override

This deliberately removes Graphify's exact-version pin for one invocation:

```bash
GRAPHIFY_PACKAGE=graphifyy \
  npx -y @ranimontagna/agent-toolkit \
    --graphify-only \
    --codex \
    --allow-mutable-sources
```

Use this only when you have independently reviewed and accepted the unpinned source. The permission flag also authorizes source-identity changes, alternate lock files through `TOOLS_LOCK_PATH`, a non-default Antigravity install script, and applicable RTK release-source exceptions; those are broader trust changes, not routine installation settings. `ALLOW_MUTABLE_SOURCES=1` is the environment equivalent.

## Shell and Environment Profiles

Agent Toolkit reads the process environment; it does not load project-specific `.env` files. Keep one-off overrides inline as shown above, or export stable destination and presentation settings from the shell profile that launches the command. Avoid persisting mutable-source permission globally, because it weakens provenance checks for every invocation from that environment.

For different projects, prefer `--local` from each project root or project-scoped shell configuration. Global runtime target overrides are ignored in local scope, where the fixed project-relative targets in the runtime matrix apply.

## Related Documentation

- [Getting Started](GETTING-STARTED.md) — first installation, repair, uninstall, and common setup issues.
- [Architecture](ARCHITECTURE.md) — orchestration, provenance, runtime targets, and lifecycle boundaries.
- [Security](../SECURITY.md) — supported versions and vulnerability reporting.
