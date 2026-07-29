# Task 4 Fix — Process Signals and Stale-Lock Recovery

## Status

Complete. The Important review findings for Task 4 were corrected within
`src/ariadne/process.ts`, `src/ariadne/lock.ts`, and their focused unit tests.
No files owned by other tasks were changed.

## TDD evidence

The regression tests were added before the production changes.

RED command:

```sh
rtk pnpm exec vitest run tests/unit/ariadne/process.test.ts tests/unit/ariadne/lock.test.ts
```

Observed RED result:

- 2 test files failed.
- 5 tests failed and 8 passed.
- Both supervisor-signal forwarding cases failed because no new
  `SIGINT`/`SIGTERM` listener existed.
- The stale-lock replacement race failed because the replacement was moved and
  replaced instead of being preserved.
- Both diagnostic filename assertions failed because recovery still used the
  single fixed `recovered-lock.json` name.

After the minimal implementation, the same command passed all 13 tests.

## Corrections

### Supervisor signal lifecycle

- Active process runs now register `SIGINT` and `SIGTERM` handlers on the
  supervisor process.
- The received signal is forwarded unchanged to the child.
- The existing grace-period escalation is shared by timeout, abort, and
  supervisor-signal termination paths.
- Both supervisor listeners, the abort listener, and timeout/escalation timers
  are removed or cleared when the child closes.
- Real child-process tests prove forwarding of both signals and listener
  cleanup.

### Timeout and abort escalation

- Timeout and abort tests now use children that deliberately ignore `SIGTERM`.
- Both tests prove that the default escalation timer is scheduled for exactly
  10,000 ms and that POSIX children ultimately report `SIGKILL`.
- The test clock compresses only the 10-second escalation delay to keep the
  focused suite local and fast; the production default remains 10 seconds.

### Stale-lock TOCTOU hardening

- The stale record is re-read and compared in full after the injected liveness
  probe, before the run directory or recovery artifact is created.
- Recovery creates a hard-link diagnostic candidate, then verifies that the
  candidate and active path have the same device/inode and the same full lock
  record before unlinking the stale active name.
- A lock replaced during validation is left at the active path and recovery
  fails with the explicit changed-during-recovery diagnostic.
- The recovered record is preserved under a unique,
  run-identifiable `recovered-lock-<run-id>-<uuid>.json` filename.

### Release ownership

- A focused regression test replaces a handle's lock record before
  `release()` and proves the replacement remains untouched.
- Ownership continues to require the handle's PID and run ID.

## Verification

```sh
rtk pnpm exec vitest run tests/unit/ariadne/process.test.ts tests/unit/ariadne/lock.test.ts
# 2 files passed, 13 tests passed

rtk pnpm exec vitest run tests/unit/ariadne
# 6 files passed, 55 tests passed

rtk pnpm run typecheck
# passed

rtk pnpm exec biome check src/ariadne/process.ts src/ariadne/lock.ts tests/unit/ariadne/process.test.ts tests/unit/ariadne/lock.test.ts
# checked 4 files, no fixes required

git diff --check
# passed
```

## Commit

Conventional commit subject: `fix(ariadne): harden process and lock lifecycle`.
No push was performed.

## Concerns

None blocking. The hard-link recovery step assumes the contract's lock path and
run directory remain on the same project filesystem, as Ariadne's generated
paths do.
