# Task 9 Report — Project Operations

## Outcome

Implemented the Task 9 service surface only:

- `src/ariadne/init.ts`
- `src/ariadne/status.ts`
- `src/ariadne/doctor.ts`
- `src/ariadne/render.ts`
- `tests/unit/ariadne/init.test.ts`
- `tests/unit/ariadne/status-doctor.test.ts`

No CLI routing, public documentation, push, model execution, lock replacement,
or state mutation from status/Doctor was added.

## Initialization

- Requires the actual Git repository root before planning or applying writes.
- Imports canonical, Ralph `userStories`, and Helix `stories` PRDs while leaving
  the root `prd.json` byte-for-byte unchanged and archiving those exact bytes.
- Reuses valid Ariadne state on repeated initialization.
- Detects `check`, or `lint` / `typecheck` / `test` in order, using the declared
  package manager or lockfile; explicit repeated checks take precedence.
- Rejects non-interactive initialization without checks.
- Uses Clack prompts for interactive check/runtime choice and confirmation;
  cancellation returns a versioned report without writes.
- Validates externally supplied plans before creating any layout and updates
  `.gitignore` atomically with only `.ariadne/lock` and `.ariadne/runs/`.

## Read-only reports

- Status reports project/branch/runtime/version, exact story counts, active
  attempts, latest run outcome/duration, dirty state, live/stale/absent lock,
  and progress/run paths.
- Run inspection reads structured local metadata only and does not copy raw
  runtime output into reports.
- Doctor returns stable issue codes for schema, Git repository/branch/dirty
  state, checks, ignore entries, runtime states, malformed/stale locks, and
  interrupted recovery.
- Invalid state uses diagnostic fallbacks without manufacturing dependent
  branch or runtime failures.
- Human output is deterministic; JSON output is exactly
  `JSON.stringify(report, null, 2)`.

## TDD evidence

### RED

1. `tests/unit/ariadne/init.test.ts` failed because
   `src/ariadne/init.js` did not exist.
2. `tests/unit/ariadne/status-doctor.test.ts` failed because
   `src/ariadne/doctor.js` did not exist.
3. The invalid-plan test proved application created `.ariadne/` before schema
   validation; validation was moved ahead of every write.
4. The invalid-schema Doctor test exposed a false `wrong_branch` issue derived
   from fallback state; dependent diagnostics are now gated on valid state.

### GREEN

```text
rtk pnpm exec vitest run tests/unit/ariadne/init.test.ts tests/unit/ariadne/status-doctor.test.ts
Test Files  2 passed (2)
Tests       16 passed (16)
```

## Verification

```text
rtk pnpm run typecheck
exit 0

rtk pnpm run check
Biome: Checked 96 files. No fixes applied.
Unit: 31 files passed, 301 tests passed.
Build, JavaScript syntax checks, shell syntax checks, and integration tests: exit 0.

rtk graphify update .
Code graph updated: 3348 nodes, 4727 edges, 260 communities.
```

The unrelated existing modification to
`.superpowers/sdd/task-5-report.md` was preserved and excluded from this task's
commit.
