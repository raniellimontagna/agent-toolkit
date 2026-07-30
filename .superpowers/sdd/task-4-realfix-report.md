# Task 4 Real Fix — Recovery Boundary and Process Readiness

## Result

The two remaining Task 4 blockers were corrected within the assigned files.

- Ariadne still exposes `.ariadne/lock` as a JSON file created with
  `openSync(lockPath, "wx", 0o600)`.
- All cooperative Ariadne acquisition, stale-recovery, and release mutations
  remain serialized by the private append-only `<lockPath>.coordinator`.
- Legacy stale locks are still renamed into the acquiring run directory before
  a replacement public lock is created.
- Recovery now compares the complete record moved by `renameSync` with the
  record previously validated as stale.
- If a live replacement is injected exactly inside the recovery rename
  boundary, Ariadne restores the moved object to the public path with
  `linkSync`, removes the temporary diagnostic name, and aborts recovery.
- Timeout and abort escalation tests now use a local ready-file handshake. The
  child installs its `SIGTERM` ignore handler before writing readiness; the
  timeout is armed and the abort is triggered only after that readiness signal.

## TDD Evidence

The adversarial lock test was written first and injects a complete live
replacement from inside the mocked `renameSync` call, immediately before the
real rename mutation.

RED:

```text
pnpm exec vitest run tests/unit/ariadne/process.test.ts tests/unit/ariadne/lock.test.ts
1 failed, 14 passed
ENOENT reading the public lock after recovery moved the live replacement
```

GREEN after the minimal recovery repair:

```text
pnpm exec vitest run tests/unit/ariadne/process.test.ts tests/unit/ariadne/lock.test.ts
2 files passed, 15 tests passed
```

The existing cooperative-boundary tests also invoke a second
`acquireProjectLock()` from inside the public recovery/release mutation. They
prove that a protocol-following Ariadne participant cannot enter the public
transition while the first participant owns the private coordinator
generation.

## Process-Test Determinism

The timeout child executes these events in program order:

1. install the `SIGTERM` ignore handler;
2. synchronously write the ready file;
3. remain alive.

The test's `timeoutMs` getter waits synchronously for that file before returning
the timeout value, so the runner cannot arm its timeout first. The abort test
awaits the same file asynchronously before calling `AbortController.abort()`.
Both tests continue to assert the default 5,000 ms grace timer and `SIGKILL` on
POSIX.

## Verification

The focused suite passed three consecutive runs:

```text
run 1: 2 files passed, 15 tests passed
run 2: 2 files passed, 15 tests passed
run 3: 2 files passed, 15 tests passed
```

Full validation:

```text
pnpm run check
biome: 79 files checked
typecheck: passed
unit: 23 files passed, 225 tests passed
build and JavaScript/shell syntax checks: passed
integration tests: passed

git diff --check
passed
```

## Portability Boundary

The private coordinator makes public-path transitions exclusive for every
Ariadne participant that follows the protocol. The recovery repair also
preserves an uncooperative replacement injected immediately before the rename
mutation.

Portable Node filesystem APIs still provide no
`rename-if-directory-entry-is-this-inode` or `unlink-if-record-matches`
operation. Therefore no implementation can prevent an arbitrary actor that
ignores the coordinator from replacing the public pathname after Ariadne's
last verified filesystem operation. The implementation does not claim that
stronger guarantee.

## Commit

Conventional commit subject: `fix(ariadne): harden recovery boundary tests`.
No push was performed.
