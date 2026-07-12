# Agent Browser Design

## Goal

Add Agent Browser as an explicitly selected installer tool. It must install a
pinned CLI and its matching Agent Skill, make its executable availability
visible through `--doctor`, and remain outside the `--all` selection. The
toolkit's global Node.js requirement moves from 22 to 24.

## User Flow

The interactive menu presents **Agent Browser** with the other optional tools.
Non-interactive users select it with `--agent-browser-only`; `--no-agent-browser`
removes it from a selected set. `--all` intentionally does not select it.

When selected, the installer installs the exact `agent-browser` npm version
recorded in `tools.lock.json`, runs `agent-browser install` to provision Chrome,
and installs the `agent-browser` skill from the pinned upstream Git revision.
The installer does not invoke `agent-browser install --with-deps`, configure
plugins, cloud providers, credentials, or browser state.

## Architecture

Add a dedicated installer module following the existing external-skill
installers. Extend the tool lock schema, CLI argument state, menu, status and
doctor report with the Agent Browser entry. Reuse the existing immutable-source
validation and Agent Skills CLI installation path for the skill source.

The doctor check distinguishes a missing CLI from an installed executable, but
does not invoke Agent Browser's `doctor` command because that command can clean
stale files. It reports the installed version and the exact upstream command
the user can run to validate Chrome/browser setup.

## Failure Handling

If the pinned npm install, Chrome provision, or skill install fails, the
installer reports the failed component and returns a non-zero overall result.
It never attempts system-package installation. Dry-run and doctor remain
non-mutating.

## Tests and Verification

Unit tests cover lock parsing, the Node 24 version floor, flags, selection
defaults, installer command wiring, status/doctor outcomes, and immutable
source validation. The shell
integration test covers dry-run, a successful mocked installation and the
missing-browser diagnostic. Its existing Custom Skill assertion is repaired so
the complete release gate has a stable baseline.

Run `rtk pnpm run check` after implementation. The expected result is lint,
typecheck, unit tests, build, compiled syntax checks, shell syntax checks and
the integration test all passing.

## Scope Boundaries

This change does not add Agent Browser plugins, MCP configuration, cloud
browser providers, credential management, browser-state import/export, or
automatic Linux dependency installation.
