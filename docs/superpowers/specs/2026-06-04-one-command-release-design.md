# One-Command Release Design

## Goal

Make Agent Toolkit installable from a published artifact with one command, without requiring users to clone the repository or build `dist/` locally.

## Decision

Publish the toolkit as the scoped npm package `@ranimontagna/agent-toolkit`. The public npm name `agent-toolkit` is already reserved by another maintainer, so the scoped package avoids a naming conflict while preserving the executable names `agent-toolkit` and `setup-agent-toolkit`.

The supported command becomes:

```bash
npx -y @ranimontagna/agent-toolkit --all --codex
```

The existing local wrapper remains available for clone-based development:

```bash
bash setup-agent-toolkit.sh --all --codex
```

## Architecture

The compiled TypeScript CLI remains the runtime entrypoint. `package.json` continues to expose `dist/bin/agent-toolkit.js` through both bin names, and `npm pack` includes `dist/`, `skills/`, `tools.lock.json`, the README and the compatibility wrapper.

Publishing is handled by a tag-driven GitHub Actions workflow. Tags matching `v*` install dependencies, run the full check, and publish the package to npm using an `NPM_TOKEN` secret.

## Error Handling

The release workflow fails before publishing if lint, typecheck, tests, build, compiled JavaScript syntax checks, wrapper syntax checks, or integration tests fail. npm publishing uses `--access public` so the scoped package is not accidentally private.

## Testing

Tests cover the distribution contract in the shell integration suite:

- package name is scoped;
- package is public-publishable;
- bin names still point to `dist/bin/agent-toolkit.js`;
- help output shows the scoped `npx -y` command;
- README documents the one-command install path.

## Non-Goals

This change does not add a `curl | bash` bootstrap. GitHub Release assets can be added later if a shell-only install path is needed, but npm is the smallest stable path for the current Node-based CLI.
