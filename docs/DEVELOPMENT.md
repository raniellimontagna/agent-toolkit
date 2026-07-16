# Development

## Local Setup

Agent Toolkit requires Node.js 24 or newer and pins pnpm 11.8.0 through the `packageManager` field in `package.json`. Corepack should activate that exact package-manager version.

1. Fork the public repository, then clone your fork:

   ```bash
   git clone https://github.com/<your-account>/agent-toolkit.git
   cd agent-toolkit
   ```

2. Enable Corepack and activate the pinned pnpm version:

   ```bash
   corepack enable
   corepack prepare pnpm@11.8.0 --activate
   ```

3. Install the locked dependency graph:

   ```bash
   rtk pnpm install --frozen-lockfile
   ```

4. Build the TypeScript sources before invoking the repository's shell wrapper directly:

   ```bash
   rtk pnpm run build
   bash setup-agent-toolkit.sh --help
   ```

RTK is preferred when it is available. If it is not installed yet, run the same `pnpm` commands without the `rtk` prefix. Development needs no mandatory environment file: repository defaults come from `tools.lock.json`, while supported overrides are documented in [Configuration](CONFIGURATION.md).

## Source Ownership

The package exposes `agent-toolkit` and `setup-agent-toolkit` from the compiled `dist/bin/agent-toolkit.js`. Authoring starts in `bin/agent-toolkit.ts`, a thin process and error boundary around the orchestration in `src/main.ts`. The compatibility wrapper `setup-agent-toolkit.sh` checks Node.js and delegates to that compiled entrypoint.

| Area | Ownership |
|---|---|
| `bin/agent-toolkit.ts` | CLI process entrypoint and top-level expected-error handling. |
| `src/args.ts`, `src/usage.ts`, `src/menu.ts`, `src/state.ts` | Public arguments and help, interactive selection, supported names, defaults, and invocation state. |
| `src/main.ts` | Operation routing, provenance and prerequisite gates, installer dispatch, lifecycle operations, and final exit status. |
| `src/installers/` | Tool-specific external commands and install behavior. |
| `src/tool-lock.ts`, `src/provenance.ts`, `tools.lock.json` | Lock schema, immutable source identities, checksums, catalog data, and override policy. |
| `src/runtimes.ts`, `src/skill-targets.ts` | Runtime support, prerequisite checks, installer arguments, and local or global skill destinations. |
| `src/skills.ts`, `src/skills-audit.ts`, `src/manifest.ts` | Bundled Custom Skill discovery, metadata and link audits, installation, managed records, and safe removal. |
| `skills/` | Bundled Custom Skill content and any required upstream license or notice material. |
| `src/release.ts`, `scripts/`, `.github/workflows/` | Production build cleanup, release preparation, publish retry behavior, and automation. |
| `tests/unit/`, `tests/test-agent-toolkit.sh`, `tests/publish-npm-with-retry.test.sh` | Unit behavior, built-CLI and documentation contracts, install flows, and publish retry scenarios. |

See [Architecture](ARCHITECTURE.md) for the execution path and trust boundaries.

## Change Matrix

Keep every public contract and its proof synchronized.

| Change | Primary files | Also update |
|---|---|---|
| Add or change a CLI flag | `src/args.ts`, `src/usage.ts` and, when interactive behavior changes, `src/menu.ts` or `src/state.ts` | Argument unit tests, integration help assertions, and user documentation. |
| Add or update an external source | `tools.lock.json`, `src/tool-lock.ts`, `src/provenance.ts`, and the consuming installer | Provenance and installer tests, integration expectations, source documentation, and license or notice material when content is vendored. |
| Add or change runtime support | `src/state.ts`, `src/runtimes.ts`, `src/skill-targets.ts`, and affected installers | Runtime, target, installer, integration, configuration, and architecture coverage. |
| Add or update a bundled Custom Skill | The skill directory below `skills/` | Valid metadata and local links, attribution files, audit and installation expectations, and the public catalog where applicable. Security skills must remain authorized, non-destructive, and redact secrets. |
| Change installer or lifecycle behavior | `src/main.ts`, the owning module in `src/installers/`, `src/skills.ts`, or `src/manifest.ts` | Focused unit tests, end-to-end integration assertions, and lifecycle documentation. |
| Change release or publish behavior | `src/release.ts`, `scripts/publish-npm-with-retry.sh`, or `.github/workflows/release.yml` | Release unit tests, publish-retry tests, README contracts, and release documentation. |

## Build and Quality Commands

These are all developer-relevant scripts defined in `package.json`.

| Command | Description |
|---|---|
| `rtk pnpm run build` | Remove `dist/`, then compile production TypeScript from `bin/` and `src/`. |
| `rtk pnpm run check` | Run the complete local release gate: lint, test-aware typecheck, unit tests, production build, generated JavaScript syntax checks, shell syntax checks, and integration tests. |
| `rtk pnpm run format` | Rewrite supported files with the Biome formatter. |
| `rtk pnpm run lint` | Check formatting and static lint rules with Biome without writing changes. |
| `rtk pnpm run lint:fix` | Apply Biome formatting and safe lint fixes. |
| `rtk pnpm run prepare` | Run the production build for the package lifecycle; dependency installation and package preparation may invoke it automatically. |
| `rtk pnpm run release:major` | Build, then run the release helper for a major version. |
| `rtk pnpm run release:minor` | Build, then run the release helper for a minor version. |
| `rtk pnpm run release:patch` | Build, then run the release helper for a patch version. |
| `rtk pnpm run security` | Run the project's dependency-security entrypoint. |
| `rtk pnpm run security:audit` | Run `pnpm audit` and fail for moderate-or-higher findings. |
| `rtk pnpm test` | Run the unit and integration suites. |
| `rtk pnpm run test:integration` | Build, then exercise the compiled CLI, wrapper, documentation contracts, install flows, and publish retry helper. |
| `rtk pnpm run test:unit` | Run the Vitest unit suite once. |
| `rtk pnpm run typecheck` | Type-check production and unit-test TypeScript without emitting files. |

The release scripts mutate version-controlled release files and tags. Use them only as part of the reviewed process in [Deployment and Releases](DEPLOYMENT.md).

## Code Style

The project uses Biome, configured in `biome.json`, for formatting and static lint rules. TypeScript uses two-space indentation, double quotes, and semicolons. The production compiler configuration is in `tsconfig.json`; `tsconfig.test.json` extends it to type-check `tests/unit/` without output.

Before editing, run a focused test for the behavior you plan to change. Keep that test passing while you work, then run the complete gate:

```bash
rtk pnpm exec vitest run tests/unit/args.test.ts
rtk pnpm run check
```

Use `rtk pnpm run format` or `rtk pnpm run lint:fix` deliberately, review all rewrites, and do not mix unrelated formatting churn into a focused change. See [Testing](TESTING.md) for suite layout and diagnostic commands.

## Source Safety and Public Content

- Treat `tools.lock.json` as the source of truth for represented external packages, repositories, commits, catalog entries, and RTK archive checksums. Keep package versions exact, Git refs at full commits, and checksums valid.
- Update the lock and its validation, provenance, installer, test, and documentation consumers together. Do not replace an immutable default with a mutable tag, branch, range, or latest-version selector.
- `--allow-mutable-sources` is an explicit exception for a reviewed invocation, not a new default or a substitute for updating the lock.
- Preserve upstream `LICENSE` and `NOTICE` files for vendored third-party skills, and keep public provenance wording accurate about what the toolkit installs.
- Keep examples, fixtures, issues, and documentation public-safe. Never commit credentials, tokens, private repository URLs, internal project names, copied environment values, or machine-local absolute paths. Remove secrets from diagnostic logs before sharing them.

Read [Security](../SECURITY.md) before changing download, command-execution, path-validation, or source-provenance behavior.

## Branch and Commit Conventions

The integration branch is `main`; CI runs for pushes to `main` and pull requests targeting `main`. The repository does not document a required feature-branch naming convention, so no prefix or branch pattern should be treated as mandatory.

Every commit must use a concise Conventional Commit subject. Examples from the project rules are:

```text
feat: add graphify installer
fix: resolve compiled package root
docs: update project rules
test: cover skill scope filtering
```

Avoid vague subjects such as `update`, `changes`, `fixes`, or `wip`.

## Pull Request Process

The repository currently has no pull request template. A contribution should still make its evidence easy to review:

1. Keep the change focused and explain the user-visible behavior, risk, and affected trust boundary in the pull request description.
2. Add or update the tests and public documentation that own the changed contract.
3. Use Conventional Commits and target `main`; no repository-wide source branch pattern is required.
4. Run the relevant focused tests, then finish with a clean `rtk pnpm run check` result and report the commands in the pull request.
5. For source or bundled-skill changes, call out the immutable pin, upstream provenance, and included license or notice files.

See [Contributing](../CONTRIBUTING.md) for the concise contribution policy, [Configuration](CONFIGURATION.md) for supported overrides, and [Deployment and Releases](DEPLOYMENT.md) for publication responsibilities.
