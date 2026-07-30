# Task 8 Dry-Run Blocked-State Fix

## Outcome

Dry-run inspection now recognizes a blocked story as the owner of a preserved
working-tree diff. It permits that diff through the Git readiness check and
returns a non-mutating `blocked` summary with both `activeStoryId` and
`blockedStoryId` set to the blocked story.

This applies whether the blocked story is the only remaining story or pending
stories also exist; pending work is not selected until the blocked state is
resolved.

## TDD evidence

RED:

```text
pnpm exec vitest run tests/unit/ariadne/loop-success.test.ts
```

The two added regressions failed because dry-run passed `false` to
`git.assertReady`, which rejected the preserved dirty diff.

GREEN:

```text
pnpm exec vitest run tests/unit/ariadne/loop-success.test.ts tests/unit/ariadne/loop-recovery.test.ts
pnpm run typecheck
pnpm exec biome check src/ariadne/loop.ts tests/unit/ariadne/loop-success.test.ts
git diff --check
```

Results: 2 test files and 29 tests passed; TypeScript, Biome, and whitespace
validation passed.

## Scope

- `src/ariadne/loop.ts`
- `tests/unit/ariadne/loop-success.test.ts`
- this report

No run state, PRD, progress log, run artifacts, lock, process, check, or Git
mutation is performed by the dry-run path.
