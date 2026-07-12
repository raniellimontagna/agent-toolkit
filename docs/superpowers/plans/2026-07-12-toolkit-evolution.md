# Toolkit Evolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Agent Toolkit from a reliable installer into a reproducible, self-maintaining setup platform.

**Architecture:** Build on the current typed lock, runtime selection, installer status, manifest, and Doctor report. Each phase lands independently, with compatibility maintained for the existing CLI and JSON output.

**Tech Stack:** TypeScript, Node.js 24+, pnpm, Vitest, Bash integration tests, GitHub Actions.

## Global Constraints

- Preserve pinned public sources and existing provenance checks.
- Keep every mutating operation explicit; dry-run and doctor remain non-mutating.
- Preserve backwards compatibility for all documented flags.
- Run `rtk pnpm run check` and `rtk graphify update .` after each completed phase.
- Use Conventional Commits.

---

## Phase 1: Automated pinned-source updates

**Outcome:** A scheduled GitHub workflow detects updates to `tools.lock.json`, refreshes pins through a reviewed PR, and runs the existing release gate.

**Key files:** `.github/workflows/`, `src/lock-update.ts`, `tools.lock.json`, `tests/unit/lock-update.test.ts`, `README.md`.

- [ ] Add machine-readable update output with current source, candidate version/ref, source type, and comparison result.
- [ ] Add a scheduled/manual GitHub Actions workflow that invokes the update report, writes a branch only when candidates exist, and opens/updates a PR.
- [ ] Ensure npm packages remain exact-version pins and GitHub sources remain full commit SHAs; no mutable candidate is written automatically.
- [ ] Test successful candidates, unknown upstream responses, no-change runs, and source-validation failures.
- [ ] Document review/merge expectations for automated update PRs.

**Done when:** scheduled runs create no PR when fully current; otherwise create one reviewable PR with the complete lock diff and a passing check.

## Phase 2: Complete installation manifest and lifecycle management

**Outcome:** `--repair`, `--doctor`, and `--uninstall` understand every item installed by the toolkit, not only copied Custom Skills.

**Key files:** `src/manifest.ts`, `src/main.ts`, `src/installers/*.ts`, `src/doctor.ts`, `tests/unit/manifest.test.ts`, `tests/test-agent-toolkit.sh`.

- [ ] Expand manifest entries with a typed install kind: copied skill, external skill, npm/global CLI, plugin, Python tool, or runtime configuration.
- [ ] Record immutable source identity, installed version/ref, selected runtime, destination or command, and install time after each successful installer operation.
- [ ] Make uninstall remove only manifest-owned filesystem assets and report safe manual cleanup commands for globally managed package tools.
- [ ] Make repair compare manifest expectations to current detection and rerun only drifted/missing items.
- [ ] Migrate existing v1 manifests safely or report a clear compatibility message without deleting data.

**Done when:** an install → doctor → repair → uninstall test can prove exactly which assets are tracked, repaired, and safely removed.

## Phase 3: Versioned installation profiles

**Outcome:** Users can select stable, composable presets such as `frontend`, `backend`, `planner`, and `video`.

**Key files:** `src/profiles.ts` (new), `src/args.ts`, `src/menu.ts`, `src/state.ts`, `src/usage.ts`, `tests/unit/*.test.ts`, `README.md`.

- [ ] Define profiles in typed source data: included tools, bundled skill package/scope filters, and supported runtime defaults.
- [ ] Add repeatable `--profile NAME` and `--profiles-list`; preserve explicit flags as the final override layer.
- [ ] Start with:
  - `frontend`: Frontend Skills, Agent Browser opt-in guidance, frontend bundled skills.
  - `backend`: backend bundled skills and code-quality skills.
  - `planner`: Superpowers, GSD, Improve, Planning Skills, Graphify.
  - `video`: Frontend Skills with Remotion Best Practices and Agent Browser.
- [ ] Show profile expansion in dry-run, including what was added or excluded.
- [ ] Reject unknown profile names and incompatible runtime/tool combinations with actionable messages.

**Done when:** profile selection is deterministic, visible in `--dry-run --json`, and explicit `--no-*` flags can reliably narrow a profile.

## Phase 4: Declarative runtime capability matrix

**Outcome:** Runtime support is modeled once and consumed by installers, menu, Doctor, docs generation, and tests.

**Key files:** `src/runtime-capabilities.ts` (new), `src/runtimes.ts`, `src/installers/*.ts`, `src/status.ts`, `README.md`, `tests/unit/runtimes.test.ts`.

- [ ] Define capabilities per tool/runtime: automated, manual, unsupported, plus the reason and remediation.
- [ ] Replace installer-local support arrays and warnings with matrix lookups.
- [ ] Make Doctor report selected but manual/unsupported combinations as non-blocking, clearly categorized guidance.
- [ ] Generate or validate the README support matrix from the same capability source.
- [ ] Add characterization tests for all tool/runtime combinations.

**Done when:** adding a runtime or tool requires updating one capability declaration, and command behavior/docs cannot drift silently.

## Phase 5: Prescriptive Doctor remediation

**Outcome:** `--doctor --json` becomes a safe, actionable diagnosis API.

**Key files:** `src/doctor.ts`, `src/status.ts`, `src/usage.ts`, `tests/unit/doctor.test.ts`, `README.md`.

- [ ] Extend each issue with stable code, severity, detected state, remediation category, and exact non-destructive command suggestion.
- [ ] Distinguish missing, version mismatch, source drift, incomplete browser setup, unsupported runtime, and manual-action cases.
- [ ] Add `--doctor --fix` only for explicitly safe, already-supported repair actions; otherwise show a command for the user to approve/run.
- [ ] Preserve current human-readable output while making JSON a stable documented contract.
- [ ] Cover each issue code and remediation in unit and shell integration tests.

**Done when:** a CI job or agent can consume Doctor JSON without parsing prose, and every reported issue has an unambiguous next action.

## Phase 6: Shareable project setup bundles

**Outcome:** A checked-in `agent-toolkit.json` can reproduce a project's preferred toolkit selection across machines.

**Key files:** `src/bundle.ts` (new), `src/args.ts`, `src/state.ts`, `src/provenance.ts`, `src/usage.ts`, `tests/unit/*.test.ts`, `README.md`.

- [ ] Define a versioned schema containing profiles, tool overrides, runtime targets, install scope, Custom Skill filters, and optional tool-lock identity.
- [ ] Add `--export-bundle PATH` and `--bundle PATH`; export never includes paths, tokens, cookies, or machine-local credentials.
- [ ] Validate bundles before applying them and show the resolved selection in dry-run.
- [ ] Require explicit `--allow-mutable-sources` if a bundle requests an alternate lock or source identity.
- [ ] Provide committed example bundles for frontend/video and planning workflows.

**Done when:** a fresh machine can run `agent-toolkit --bundle agent-toolkit.json --dry-run` and obtain the same resolved plan as the author.

## Dependencies and delivery order

```text
Phase 1: pinned updates
    ↓
Phase 2: complete manifest
    ↓
Phase 3: profiles
    ↓
Phase 4: runtime capability matrix
    ↓
Phase 5: prescriptive Doctor
    ↓
Phase 6: shareable bundles
```

Phase 2 supplies lifecycle metadata that profiles and bundles can surface. Phase 4 gives Phase 5 a normalized support model. Phase 6 depends on profiles and the capability matrix so exported bundles remain valid and explainable.

## Verification gates

After each phase:

```bash
rtk pnpm run check
rtk graphify update .
```

Before a release, add an end-to-end fixture that installs from the new public entry point, checks the generated Doctor JSON, then verifies dry-run/uninstall safety.

