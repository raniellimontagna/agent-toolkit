# Task 11 Documentation Fix Report

## Scope

- Updated Ariadne's workflow skill and public setup/configuration documentation.
- Preserved the pre-existing `.superpowers/sdd/task-5-report.md` worktree change.

## Corrections

- Commit failures are now documented as a terminal preservation path: the story
  returns to `in_progress`, and Ariadne retains the staged diff and run progress
  for manual resolution and deliberate resume. They are neither retried nor
  blocked automatically.
- Initialization is documented as detecting package checks in this order:
  `check`, then available `lint`, `typecheck`, and `test` scripts.
- Runtime selection now documents configured-runtime priority, sole
  healthy/unverified automatic selection, healthy global preference, and
  interactive prompt versus non-interactive ambiguity error behavior.

## Validation

- `rtk pnpm run lint`
- `rtk pnpm run typecheck`
- `rtk pnpm run test:unit -- tests/unit/ariadne/init.test.ts tests/unit/ariadne/runtimes.test.ts tests/unit/ariadne/loop-success.test.ts`
- `git diff --check`
