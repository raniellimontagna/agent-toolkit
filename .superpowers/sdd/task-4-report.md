# Task 4 — Async Process Lifecycle and Project Locking

## Status

Complete. Implemented the Task 4 process runner and exclusive project lock, with focused Vitest coverage. No network calls or model invocations are used by the tests.

## RED

Added `tests/unit/ariadne/process.test.ts` and `tests/unit/ariadne/lock.test.ts` before their implementation modules existed.

Command:

```sh
rtk pnpm exec vitest run tests/unit/ariadne/process.test.ts tests/unit/ariadne/lock.test.ts
```

Observed expected failure: both suites failed to import the absent `src/ariadne/process.js` and `src/ariadne/lock.js` modules.

## GREEN

- `src/ariadne/process.ts`
  - Uses `node:child_process.spawn` with `shell: false` and array arguments.
  - Writes all stdout/stderr data to the requested files while retaining at most 1 MiB of each stream in the returned result.
  - Applies writable-stream backpressure so log streaming does not create an unbounded in-memory queue.
  - Returns canonical `ProcessResult` metadata after both log streams close.
  - On timeout or abort sends `SIGTERM`, waits the configurable grace period (10 seconds by default), then uses `SIGKILL` on POSIX or `child.kill()` on Windows.
- `src/ariadne/lock.ts`
  - Creates `.ariadne/lock` exclusively via `openSync(..., "wx", 0o600)`.
  - Rejects malformed locks and live lock holders without deleting their files.
  - Recovers only locks whose injected process liveness probe reports dead; preserves the verified stale record as `recovered-lock.json` in the supplied run directory before replacing it.
  - Releases only when the on-disk PID/run ID still match the handle record.
- `ProcessResult` already existed as the shared canonical type in `src/ariadne/types.ts`; `process.ts` re-exports it for the process API.

## Test coverage

Focused process tests cover successful stdout/stderr capture and file logs, 1 MiB output capping with complete file retention, timeout, and abort.

Focused lock tests cover exclusive creation/live contention, malformed-lock preservation, stale recovery diagnostics, and release.

## Verification

```sh
rtk pnpm exec vitest run tests/unit/ariadne/process.test.ts tests/unit/ariadne/lock.test.ts
# 2 files passed, 8 tests passed

rtk pnpm exec vitest run tests/unit/ariadne
# 6 files passed, 50 tests passed

rtk pnpm run typecheck
# passed

rtk pnpm exec biome check src/ariadne/process.ts src/ariadne/lock.ts tests/unit/ariadne/process.test.ts tests/unit/ariadne/lock.test.ts
# passed

git diff --check
# passed
```

## Auto-review

Reviewed the owned files for shell invocation, lifecycle cleanup, output memory bounds, signal escalation, stale-lock safety, release identity checks, NodeNext `.js` imports, formatting, and type safety. No blocking findings remain.

## Commit

Conventional commit created: `feat(ariadne): manage processes and locks` (no push requested).
