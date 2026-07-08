# Task 5 Verification Fixes Report

Date: 2026-07-08

## Scope

- Updated `tests/unit/installers.test.ts` to include the pinned React Doctor source and install call.
- Stabilized `tests/unit/menu.test.ts` with a file-local `20_000` ms timeout because the Clack menu tests perform real installer status detection and exceed Vitest's default `5_000` ms limit in full-suite conditions.

## Root Cause Notes

1. `tests/unit/installers.test.ts`
   - Failure was a stale expectation.
   - `state.frontendSkillSources` now includes React Doctor, so the installer clones three pinned repositories and invokes the Agent Skills CLI three times.

2. `tests/unit/menu.test.ts`
   - The timeout was not an assertion failure.
   - `runClackMenu()` calls `detectInstallerStatus()`, which probes several CLIs and version commands. The menu file passes directly, but takes about 10s to 13s in this environment, so the default per-test timeout is too small.

## Commands And Outputs

### Focused verification

Command:

```bash
pnpm exec vitest run tests/unit/installers.test.ts
```

Output:

```text
Test Files  1 passed (1)
Tests       2 passed (2)
Duration    229ms
```

Command:

```bash
pnpm exec vitest run tests/unit/menu.test.ts
```

Output:

```text
Test Files  1 passed (1)
Tests       5 passed (5)
Duration    10.32s
```

Command:

```bash
pnpm exec biome check tests/unit/installers.test.ts tests/unit/menu.test.ts
```

Output:

```text
Checked 2 files in 8ms. No fixes applied.
```

### Full verification

Command:

```bash
rtk pnpm run check
```

Output:

```text
$ pnpm run lint && pnpm run typecheck && pnpm run test:unit && pnpm run build && find dist/bin dist/src -name '*.js' -print0 | xargs -0 -n1 node --check && bash -n setup-agent-toolkit.sh && pnpm run test:integration
$ biome check .
Checked 49 files in 107ms. No fixes applied.
$ tsc -p tsconfig.test.json --noEmit
$ vitest run
Test Files  12 passed (12)
Tests       35 passed (35)
Duration    15.03s
$ tsc -p tsconfig.json
$ pnpm run build && bash tests/test-agent-toolkit.sh
$ tsc -p tsconfig.json
Exit code: 0
```

### Graphify cache check

Command:

```bash
if test -f graphify-out/graph.json; then rtk graphify update .; fi
```

Output:

```text
No output. graphify-out/graph.json is absent in this checkout.
```

### Final diff inspection

Command:

```bash
git status --short
```

Output before commit:

```text
 M tests/unit/installers.test.ts
 M tests/unit/menu.test.ts
```

Command:

```bash
git diff --stat HEAD
```

Output before commit:

```text
tests/unit/installers.test.ts | 6 +++++-
tests/unit/menu.test.ts       | 2 +-
2 files changed, 6 insertions(+), 2 deletions(-)
```

## Follow-up review fix

- Removed the suite-level `20_000` ms timeout from `tests/unit/menu.test.ts`.
- Added a hoisted `vi.mock("../../src/system.js", ...)` in `tests/unit/menu.test.ts` so `detectInstallerStatus()` no longer shells out during unit tests.
- The mock returns `null` from `findCommand()` and an inert result from `capture()`, which keeps status formatting deterministic while avoiding subprocess probes entirely.

### Follow-up commands and outputs

Command:

```bash
rtk pnpm exec vitest run tests/unit/menu.test.ts
```

Output:

```text
Test Files  1 passed (1)
Tests       5 passed (5)
Duration    343ms
```

Command:

```bash
rtk pnpm exec vitest run tests/unit/installers.test.ts
```

Output:

```text
Test Files  1 passed (1)
Tests       2 passed (2)
Duration    245ms
```

Command:

```bash
rtk pnpm run check
```

Output:

```text
$ pnpm run lint && pnpm run typecheck && pnpm run test:unit && pnpm run build && find dist/bin dist/src -name '*.js' -print0 | xargs -0 -n1 node --check && bash -n setup-agent-toolkit.sh && pnpm run test:integration
$ biome check .
Checked 49 files in 51ms. No fixes applied.
$ tsc -p tsconfig.test.json --noEmit
$ vitest run
Test Files  12 passed (12)
Tests       35 passed (35)
Duration    730ms
$ tsc -p tsconfig.json
$ pnpm run build && bash tests/test-agent-toolkit.sh
$ tsc -p tsconfig.json
Exit code: 0
```
