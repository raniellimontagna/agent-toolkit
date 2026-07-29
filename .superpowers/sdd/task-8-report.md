# Task 8 Report — Retry, Recovery, and Budgets

## Result

Implemented deterministic Ariadne iteration recovery with exactly three
attempts per story by default and no default global iteration limit.

## Delivered

- Added stable loop exit-code mapping for all `AriadneRunOutcome` values.
- Added the `AttemptFailure` contract and centralized failed-attempt state
  transitions in `recordFailedAttempt`.
- Recover process exits/rejections, missing or invalid results, false criteria,
  and failed checks while preserving the active story and existing worktree.
- Persist sanitized failure categories to progress and detailed diagnostics to
  ignored per-run `failure.json` files.
- Restore the prior failure summary from run diagnostics after a coordinator
  restart and include it in the next prompt.
- Block after the third failed attempt without starting a fourth process.
- Enforce exact explicit iteration and runtime budgets, pass the remaining
  runtime to the child timeout, and persist stop outcomes/reasons in
  `stop.json`.
- Return `interrupted` for `SIGINT`, `SIGTERM`, and cancelled child results
  while keeping the story `in_progress` and preserving its diff.
- Recheck runtime budget after lock recovery so a stale lock can be archived
  without consuming another attempt or starting a child.
- Kept dry-run behavior unchanged and retained Task 7 commit-failure semantics.

## TDD Evidence

- Initial recovery suite: 11/11 tests failed for the expected missing retry,
  budget, interruption, and exit-map behavior.
- Coordinator-restart prior-failure test failed before durable recovery was
  added, then passed.
- Rejected-process test failed before the rejection recovery branch was added,
  then passed.
- Focused final verification: 17/17 loop success/recovery tests passed.

## Verification

`rtk pnpm run check` passed:

- Biome: 90 files checked, no fixes required.
- TypeScript test typecheck: passed.
- Vitest: 29 files, 270 tests passed.
- Production build and emitted JavaScript syntax checks: passed.
- Shell syntax checks: passed.
- Integration and publish-retry tests: passed.

`rtk graphify update .` completed successfully after the code changes. It
reported the existing non-fatal warning that `tile.json` and `tools.lock.json`
produce zero graph nodes.
