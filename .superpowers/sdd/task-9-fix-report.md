# Task 9 Review Fix Report

## Scope

Resolved the Task 9 init, Doctor, and status review findings without changing
CLI routing, runtime adapter contracts, or state mutation behavior.

## Changes

- Init planning consumes precomputed runtime detections before considering a
  probe, including an explicitly empty result set.
- Runtime probing is dependency-controlled and awaited asynchronously with a
  finite per-command timeout and output bound; default probes run in parallel
  and no longer use synchronous `capture()` calls.
- Git subprocesses used during init planning/application now also have a finite
  timeout.
- Doctor does not manufacture `runtime_unavailable` when Git inspection fails
  and the fallback status therefore has no runtime detection data.
- Status retains optional `initialHead` and `finalHead` values from the latest
  run metadata.

## TDD Evidence

The focused regressions first failed because injected detections were ignored,
an explicitly empty precomputed result fell through to probing, runtime probes
were not dependency-controlled, Doctor inferred runtime unavailability from
missing fallback data, and status discarded both HEAD values.

After the implementation:

```text
rtk pnpm exec vitest run tests/unit/ariadne/init.test.ts tests/unit/ariadne/status-doctor.test.ts
Test Files  2 passed (2)
Tests       20 passed (20)
```

## Verification

```text
rtk pnpm run check
lint:        passed (96 files)
typecheck:   passed
unit tests:  passed (31 files, 305 tests)
build:       passed
syntax:      passed
integration: passed

rtk graphify update .
rebuilt 3352 nodes, 4733 edges, 262 communities
```
