# Task 4 lint fix report

## Changes

- Applied Biome-required formatting in `src/ariadne/lock.ts` and `tests/unit/ariadne/lock.test.ts`.
- Replaced the `diagnostics[0]!` non-null assertion with an explicit runtime narrowing after the one-item assertion.
- Kept the Ariadne lock protocol and test behavior unchanged.

## Verification

- `rtk pnpm exec vitest run tests/unit/ariadne/lock.test.ts` — 8 tests passed.
- `rtk pnpm run lint` — passed (`biome check .`).
- `rtk pnpm run typecheck` — passed.
