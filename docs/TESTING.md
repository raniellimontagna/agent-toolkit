<!-- generated-by: gsd-doc-writer -->

# Testing

## Test Framework and Setup

Unit tests use Vitest 4.1.9 with TypeScript. `vitest.config.ts` keeps Vitest's default exclusions, excludes embedded `.worktrees/`, and sets a 15-second per-test timeout for suites whose setup can be sensitive to machine load. There is no global test setup file.

Integration coverage is shell-based:

- `tests/test-agent-toolkit.sh` builds an isolated `HOME`, supplies fake external commands, and exercises the compiled CLI, `setup-agent-toolkit.sh`, README and package contracts, selection and install flows, provenance failures, manifests, runtime targets, and bundled skills.
- `tests/publish-npm-with-retry.test.sh` replaces `npm` with a deterministic fake and proves already-published, successful, ambiguous-response, retry, terminal-failure, and invalid-configuration behavior.

Use Node.js 24 or newer and the pnpm 11.8.0 version pinned in `package.json`:

```bash
corepack enable
corepack prepare pnpm@11.8.0 --activate
rtk pnpm install --frozen-lockfile
```

If RTK is unavailable, omit only the `rtk` prefix.

## Script-to-Proof Matrix

| Command | What it proves |
|---|---|
| `rtk pnpm run lint` | Biome formatting and static lint rules. |
| `rtk pnpm run typecheck` | Test-aware TypeScript compilation without output. |
| `rtk pnpm run test:unit` | Vitest behavior for arguments, installers, provenance, lifecycle, releases, networking, targets, and catalogs. |
| `rtk pnpm run build` | Clean production TypeScript build. |
| `rtk pnpm run test:integration` | Built CLI, shell wrapper, README contracts, install flows, and npm publish retry script. |
| `rtk pnpm test` | Unit plus integration suites. |
| `rtk pnpm run check` | Full local release gate: lint, typecheck, unit, build, JavaScript syntax, shell syntax, and integration. |
| `rtk pnpm run security` | Dependency audit at moderate severity or higher. |

## Running Tests

Run the complete test suite:

```bash
rtk pnpm test
```

Run only Vitest unit tests:

```bash
rtk pnpm run test:unit
```

Run only the built-CLI and publish-retry integration suites:

```bash
rtk pnpm run test:integration
```

Run one unit-test file while developing a focused change:

```bash
rtk pnpm exec vitest run tests/unit/system.test.ts
```

Run one named test for diagnosis:

```bash
rtk pnpm exec vitest run tests/unit/system.test.ts -t "shares one total deadline across redirects"
```

Finish code, script, package, installer, workflow, or test changes with the full local gate:

```bash
rtk pnpm run check
```

`test:integration` performs its own production build. The full `check` script also checks every generated JavaScript file with `node --check` and validates the wrapper, publish helper, and publish test shell syntax with `bash -n` before running integration tests.

## Test Layout

| Path | Responsibility |
|---|---|
| `tests/unit/args.test.ts`, `tests/unit/menu.test.ts`, `tests/unit/state.test.ts` | CLI and interactive selection state. |
| `tests/unit/installers.test.ts`, `tests/unit/runtimes.test.ts`, `tests/unit/skill-targets.test.ts` | Installer isolation, runtime command plans, prerequisites, and target resolution. |
| `tests/unit/tool-lock.test.ts`, `tests/unit/provenance.test.ts`, `tests/unit/checksum.test.ts`, `tests/unit/lock-update.test.ts` | Catalog validation, immutable-source policy, checksums, and update reporting. |
| `tests/unit/manifest.test.ts`, `tests/unit/doctor.test.ts` | Managed lifecycle safety and read-only health reporting. |
| `tests/unit/skills.test.ts`, `tests/unit/skills-audit.test.ts` | Bundled skill discovery, filtering, metadata, and local links. |
| `tests/unit/system.test.ts` | Process planning and bounded local HTTP request, redirect, timeout, cleanup, and download behavior. |
| `tests/unit/release.test.ts` | Version changes, repository preflights, tags, atomic push behavior, and workflow defenses. |
| `tests/unit/tooling-config.test.ts` | Biome and Vitest worktree exclusions. |
| `tests/test-agent-toolkit.sh` | Compiled CLI and wrapper contracts plus isolated end-to-end install behavior. |
| `tests/publish-npm-with-retry.test.sh` | Deterministic npm publication retry behavior. |

## Writing New Tests

- Put TypeScript unit tests in `tests/unit/` and name them after the owning module as `*.test.ts`. Import source modules with NodeNext-compatible `.js` specifiers, as the existing tests do.
- Keep fixtures local to the test file. Existing suites create temporary directories, restore shared `state` and environment values in hooks, remove files and servers after each test, and use `vi.mock()` at external command boundaries.
- For HTTP behavior, use a loopback server on an ephemeral port and close both servers and sockets during cleanup. Do not make unit tests depend on live external services.
- Extend `tests/test-agent-toolkit.sh` when behavior must be proven through the compiled CLI, shell wrapper, fake runtime commands, filesystem targets, package contracts, or public README wording.
- Extend `tests/publish-npm-with-retry.test.sh` for publish-helper state transitions. Keep retry delays deterministic and replace network-facing `npm` calls with the local fake.

There is no shared unit-test helper or global bootstrap today. Add shared infrastructure only when it removes real duplication without hiding setup, cleanup, or security-sensitive assertions.

## Timing-Sensitive Network Tests

The bounded-network tests in `tests/unit/system.test.ts` use local sockets and deadlines, so a loaded machine can make a failure timing-sensitive. Isolate the failing file or named test to diagnose the timeout, resource cleanup, and assertion path. After the diagnosis or fix, require a clean full `rtk pnpm run check` rerun before delivery. Never make the gate green by deleting, disabling, or skipping the failing test.

## Coverage Requirements

No coverage threshold is configured. Vitest is run without a coverage provider or threshold block, and CI does not publish a coverage gate.

| Type | Threshold |
|---|---|
| Lines | Not configured |
| Branches | Not configured |
| Functions | Not configured |
| Statements | Not configured |

Behavioral regression coverage is still required for changes that can fail. Prefer assertions at the narrowest owning layer, then add integration coverage when the compiled package, wrapper, documentation contract, or filesystem side effect is part of the behavior.

## CI Integration

The `CI` workflow in `.github/workflows/ci.yml` runs on pushes to `main` and pull requests targeting `main`. A concurrency group cancels an older in-progress run for the same workflow and Git ref.

| Job | Triggers | Proof |
|---|---|---|
| `Check` | Push to `main`; pull request targeting `main` | Checks out the repository, uses Node.js 24, activates the `packageManager` value through Corepack, installs with `pnpm install --frozen-lockfile`, and runs `pnpm run check`. |
| `Secret scan` | Push to `main`; pull request targeting `main` | Checks out full history and runs Gitleaks with the workflow token. |
| `Dependency audit` | Push to `main`; pull request targeting `main` | Uses Node.js 24, installs the frozen lockfile with lifecycle scripts disabled, and runs `pnpm run security`. |
| `Dependency review` | Pull request targeting `main` only | Reviews dependency changes and fails on moderate-or-higher severity. |

The release workflow has additional publication checks; see [Deployment and Releases](DEPLOYMENT.md). For contributor setup and source ownership, see [Development](DEVELOPMENT.md). The system boundaries behind the suites are described in [Architecture](ARCHITECTURE.md), and source-override policy is documented in [Configuration](CONFIGURATION.md) and [Security](../SECURITY.md).
