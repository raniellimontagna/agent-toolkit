# Repository Documentation Refresh Design

## Goal

Turn the repository documentation into a complete, accurate entry point for
users and maintainers. The refreshed documentation must explain installation,
configuration, architecture, development, testing, security, and publishing
without forcing readers through the implementation history. It must also
describe the meaningful difference in every tagged version from `v0.1.0`
through `v0.2.0`.

All public documentation remains in English.

## Audience and Information Architecture

The documentation uses a layered structure:

1. `README.md` is the product landing page. It explains what Agent Toolkit is,
   gives the shortest safe installation path, summarizes supported runtimes and
   operations, and routes readers to focused guides.
2. Canonical guides under `docs/` own operational detail:
   - `GETTING-STARTED.md` — prerequisites, installation, selection examples,
     dry-run, Doctor, repair, uninstall, and first verification.
   - `ARCHITECTURE.md` — entrypoint, state and argument parsing, catalogs,
     installers, runtime targets, manifests, provenance, release flow, and
     security boundaries.
   - `CONFIGURATION.md` — CLI flags, environment variables, source locks,
     runtime target overrides, scopes, and precedence.
   - `DEVELOPMENT.md` — local setup, module boundaries, contribution workflow,
     public-safe rules, and release preparation.
   - `TESTING.md` — unit, integration, build, security, and full-gate commands,
     including what each gate proves.
   - `DEPLOYMENT.md` — version selection, release preflights, atomic push,
     GitHub Actions, npm trusted publishing, and post-release verification.
3. `CONTRIBUTING.md` and `SECURITY.md` remain concise policy documents and link
   to the canonical guides instead of repeating them.
4. `CHANGELOG.md` is the single source for release history and comparisons.
5. `docs/superpowers/` remains historical design and implementation evidence.
   Those files are not operational documentation and are not rewritten as
   current behavior.

## Content Ownership

Each fact should have one primary home:

- README: quick orientation and navigation.
- Getting Started: user journey and examples.
- Configuration: complete option and environment reference.
- Architecture: internal relationships and trust boundaries.
- Development and Testing: maintainer workflow and quality gates.
- Deployment: how a version becomes a published npm package.
- Changelog: what changed between versions.
- Contributing and Security: project policy.

Cross-links replace duplicated long sections. The README may summarize a fact,
but detailed tables and edge cases belong in the appropriate guide.

## Release History Model

The repository has 33 Git tags: `v0.1.0` through `v0.1.31`, plus `v0.2.0`.
The npm registry contains 31 published versions: `0.1.1` through `0.1.31`
except `0.1.8`, plus `0.2.0`. Therefore `v0.1.0` and `v0.1.8` must be marked as
tag-only versions rather than described as npm publications.

`CHANGELOG.md` will contain:

- a short milestone table showing the major evolution from foundation to the
  catalog-driven and hardened `0.2.0` release;
- one entry for every tag, newest first;
- release date and publication status for each entry;
- one to four user-relevant differences per version;
- a comparison link to the previous tag when a previous tag exists;
- an explicit note that GitHub uses tags and Actions rather than GitHub Release
  objects for the current publication flow.

Release descriptions are reconstructed from the exact commit range between
adjacent tags, existing changelog entries, package metadata, npm publication
metadata, and the tagged source. Commit subjects are evidence, not copy: related
commits are consolidated into concise outcomes.

## Accuracy and Safety

Documentation claims must be checked against live repository sources:

- `src/args.ts` and `src/usage.ts` for CLI behavior;
- `src/state.ts`, `src/skill-targets.ts`, and relevant installers for runtime
  and configuration behavior;
- `src/manifest.ts` for lifecycle and uninstall guarantees;
- `tools.lock.json`, catalog modules, and provenance modules for source claims;
- `package.json` and workflow YAML for commands, Node support, CI, and release;
- Git tags, tag ranges, and npm metadata for the changelog.

Generated or updated docs must not contain local absolute paths, private names,
credentials, tokens, private URLs, or internal planning methodology. Shell
examples must be copyable and must not suggest mutable sources where the
toolkit requires pinned defaults.

## Implementation Sequence

Documentation is produced in two waves so later guides can link to stable
foundations:

1. Foundation: README, Architecture, Configuration, and the complete changelog.
2. Operational guides: Getting Started, Development, Testing, Deployment,
   Contributing, and Security.

Existing hand-written policy documents are updated surgically. The README may
be substantially shortened because its detailed material moves into canonical
guides. Historical plans and specs are preserved.

## Verification

The refresh is complete only when:

- every tag has exactly one changelog entry and publication status is accurate;
- internal Markdown links and referenced repository paths resolve;
- documented CLI flags, environment variables, scripts, runtime names, and
  release commands match the source;
- no placeholder or `VERIFY` marker remains for a repository-verifiable fact;
- changed documentation passes the public-secret scan;
- `rtk pnpm run lint` and `rtk pnpm test` pass at minimum;
- the full `rtk pnpm run check` and `rtk pnpm run security` gates pass before
  final delivery.

## Non-Goals

- Adding a documentation-site framework or hosted docs deployment.
- Creating GitHub Release objects for historical tags.
- Rewriting historical design specs as if they were current user guidance.
- Changing installer behavior, release behavior, or public APIs as part of the
  documentation refresh.
- Producing a Portuguese mirror in this iteration.
