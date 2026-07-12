# Agent Browser Design

## Goal

Add Agent Browser as an explicitly selected installer tool. It must install a
pinned CLI and its matching Agent Skill, make its readiness visible through
`--doctor`, and remain outside the `--all` selection.

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

The doctor check distinguishes a missing CLI from a CLI whose Chrome/browser
setup has not completed. It uses the command's JSON diagnostic mode and reports
a remediation command without changing the system.

## Failure Handling

If the pinned npm install, Chrome provision, or skill install fails, the
installer reports the failed component and returns a non-zero overall result.
It never attempts system-package installation. Dry-run and doctor remain
non-mutating.

## Tests and Verification

Unit tests cover lock parsing, flags, selection defaults, installer command
wiring, status/doctor outcomes, and immutable source validation. The shell
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
