# Agent Skills Catalog Design

## Goal

Deepen the Agent Skills CLI installation flow around one normalized catalog.
Each upstream repository and immutable pin must be declared once, bundles must
reference skills from those repositories, and one installer module must own
checkout, pin verification, path resolution, installation, cleanup, and
outcome aggregation.

The change preserves the public bundle flags and install scopes while removing
the duplicated source mappings and installers that currently make an Agent
Skill addition cross several seams.

## Scope

The catalog covers only skills installed through Agent Skills CLI:

- Improve;
- Frontend Skills;
- Planning Skills;
- the Agent Browser skill.

The npm package and Chrome setup for Agent Browser remain in its dedicated
installer module. RTK, Caveman, Graphify, GSD, runtime CLIs, and other npm,
PyPI, GitHub release, or plugin sources remain in their existing lock and
installer paths. Combining those distinct install mechanisms would create an
interface nearly as complex as their implementations.

Bundles remain the public selection granularity. This change does not add
per-skill CLI flags or interactive selection.

## Lock Model

`tools.lock.json` remains the single source of truth for Agent Skills CLI
provenance and bundle composition. Its normalized `agentSkills` section has
three parts:

- `skillsCli`: the exact Agent Skills CLI package and version;
- `repositories`: keyed upstream repositories, each with one repository name
  and one full Git commit;
- `bundles`: the existing public tool identifiers, with presentation metadata
  and ordered skill entries that reference a repository key.

A skill entry contains its upstream skill name and an optional safe relative
path inside the checkout. Repository names and commits are never repeated in
bundle entries. Bundle identifiers match the public tool identifiers
`improve`, `frontend-skills`, `planning-skills`, and `agent-browser`, so no
translation table is required.

The runtime validator rejects:

- mutable or malformed Git refs;
- empty repositories or bundles;
- empty or malformed repository keys;
- bundle entries that reference an unknown repository;
- empty or malformed skill names;
- absolute paths or relative paths containing traversal;
- Agent Skill bundle identifiers that are not supported public tools.

Validation remains dependency-free and continues to run when the tool lock is
loaded.

## Deep Module

Replace the current Agent Skills installation modules with
`src/installers/agent-skills.ts`. Its external seam is one operation equivalent
to:

```ts
installAgentSkillBundle(bundleId): BundleInstallResult
```

The module hides:

- catalog lookup;
- repository grouping;
- temporary directory ownership;
- one checkout per repository;
- detached checkout and exact pin verification;
- safe skill-root resolution;
- Agent Skills CLI argument construction;
- selected runtime and global/local scope translation;
- per-skill outcome collection;
- logging and final bundle summary;
- unconditional temporary cleanup.

`src/installers/improve.ts` and
`src/installers/planning-skills.ts` are removed. The existing frontend installer
is replaced by the deep module rather than retained as a renamed pass-through.
The Agent Browser installer calls the same operation for the `agent-browser`
bundle after its npm and Chrome work completes.

`state.ts` retains the resolved Agent Skills CLI package override and a direct
reference to the validated catalog. It does not rebuild per-bundle source
arrays or hand-author skill labels.

## Installation Flow

For a selected bundle, the deep module performs these steps:

1. Resolve the bundle and group its skill entries by repository key.
2. Clone each referenced repository once into a unique temporary directory.
3. Fetch and check out the pinned commit in detached mode.
4. Compare the checked-out commit with the expected pin before using files.
5. Resolve and validate each skill root inside the checkout.
6. Invoke Agent Skills CLI for every resolvable skill and selected runtime.
7. Remove the temporary directory in all success and failure paths.
8. Return a structured bundle result and print a concise summary.

Multiple skills from `mattpocock/skills` therefore share one checkout during a
Planning Skills installation.

## Outcomes and Failure Handling

The install result exposes the bundle identifier, overall success, and one
outcome per skill. A skill outcome has one of these statuses:

- `installed`: Agent Skills CLI completed successfully;
- `failed`: the repository was available, but skill resolution or installation
  failed;
- `blocked`: repository checkout or pin verification failed, so installation
  was not attempted.

Repository failures block only skills that reference that repository. A failed
skill does not prevent independent skills or repositories from running. The
bundle result is unsuccessful when any skill is failed or blocked.

The top-level installer continues with other selected tools and preserves its
current non-zero exit behavior when any tool fails. User-facing logs remain,
but structured outcomes are the test surface.

## Preflight

Agent Skills CLI requirements are derived from the catalog rather than from a
hand-maintained list of tool conditions. Selecting any catalog bundle requires
the pinned Agent Skills CLI runtime prerequisites: Node.js 24, Git, and npx.

This makes Planning Skills participate in preflight automatically and closes
the existing gap where its installer requires Git and npx but the initial
prerequisite check does not include it. Dry-run and doctor consume the same
catalog-derived knowledge without changing their public output contract.

## Tests

Tests move toward the catalog and bundle-result interfaces:

- lock tests cover valid normalized repositories and bundles;
- invalid-lock tests cover mutable pins, unknown repository references, empty
  bundles, malformed skill names, absolute paths, and traversal;
- catalog tests confirm each public bundle resolves to its ordered skills;
- installer tests use the existing command seam to simulate successful
  checkouts, pin mismatches, repository failures, and individual skill
  failures;
- installer tests assert structured outcomes instead of internal function
  ordering;
- preflight tests prove every catalog bundle, including Planning Skills,
  requires Node.js 24, Git, and npx;
- integration tests prove `mattpocock/skills` is cloned once while all Planning
  Skills are installed;
- documentation contract checks require every catalog bundle identifier and
  skill identifier to appear in the README locked-source section, while prose
  remains hand-authored.

Tests tied only to the removed shallow modules are deleted after equivalent
coverage exists at the deep module's interface.

## Migration Sequence

1. Add normalized Agent Skills repository and bundle data to the lock schema.
2. Add generic runtime validation and catalog-resolution tests.
3. Implement the deep Agent Skills installer and structured outcomes.
4. Route Improve, Frontend Skills, Planning Skills, and Agent Browser through
   the new module.
5. Derive Agent Skills preflight from catalog membership.
6. Remove duplicated state mappings and shallow installer modules.
7. Update integration assertions and README provenance documentation.
8. Run the complete project verification gate.

The migration does not add runtime dependencies or change public flags, bundle
selection, runtime selection, scope semantics, immutable-source policy, or the
toolkit's continue-after-tool-failure behavior.

## Verification

Run:

```bash
rtk pnpm run check
```

The expected gate includes lint, typecheck, unit tests, build, compiled
JavaScript syntax checks, shell syntax checks, and integration tests. If the
repository knowledge graph exists when implementation completes, run
`rtk graphify update .`; an absent graph does not block the change.

## Out of Scope

- individual skill selection flags;
- a catalog for unrelated npm, PyPI, plugin, or binary installers;
- generated TypeScript source files;
- a new package or schema-validation dependency;
- transactional rollback of already installed third-party skills;
- redesigning the top-level tool catalog or all installer outcomes;
- changing Agent Browser CLI or Chrome installation behavior.
