# Task 8 P1 Fix 2 Report

## Result

Resolved both remaining recovery findings with explicit timeout provenance and a
terminal guard for preserved blocked-story work.

## Changes

- `runQualityChecks` now records whether a timeout came from the 30-minute
  per-check limit or the remaining global runtime budget.
- Local quality-check timeouts are retryable check failures, including when a
  larger global runtime budget is configured.
- Only a timeout tagged `global_budget` returns `budget_exhausted`.
- A blocked story is reported before Ariadne can select a different pending
  story, preserving the existing diff without runtime, check, or commit work.

## TDD Evidence

The focused regression suite initially failed six tests: four because timeout
origin metadata was absent, one because a local timeout was misclassified as
global budget exhaustion, and one because `[blocked, pending]` started the
pending story. After the implementation, the focused suite passed 32/32 tests.

## Verification

`rtk pnpm run check` passed:

- Biome: 90 files checked, no fixes required.
- TypeScript typecheck: passed.
- Vitest: 29 files, 283 tests passed.
- Production build and emitted JavaScript syntax checks: passed.
- Shell syntax and integration tests: passed.

`rtk graphify update .` rebuilt 3,277 nodes and 4,516 edges. It retained the
existing non-fatal zero-node warning for `tile.json` and `tools.lock.json`.
