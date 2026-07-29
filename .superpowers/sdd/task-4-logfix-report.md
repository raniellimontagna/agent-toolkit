# Task 4 Log I/O Failure Fix

## Result

`runAgentProcess()` now treats a stdout/stderr log-stream failure as a
supervised process failure:

- both `finished()` rejections receive handlers immediately;
- the first output failure stops further log writes and drains the child pipes;
- the child receives `SIGTERM`, retaining the existing configurable grace
  period and default 5,000 ms `SIGKILL` escalation;
- timeout, abort, supervisor-signal, timer, and listener cleanup remains tied to
  child closure;
- the returned promise rejects with the original log I/O error only after the
  child has closed and both output streams have finished.

This prevents an unhandled promise rejection and prevents a failed log
destination from leaving a blocked or orphaned child.

## TDD Evidence

The regression test passes an existing temporary directory as `stdoutPath`,
runs a long-lived local Node child, observes calls to the real
`ChildProcess.kill()`, and requires the returned promise to reject with
`EISDIR` only after the killed child has an exit code or signal.

RED:

```text
1 failed, 6 passed
expected 'pending' to be 'rejected'
Vitest caught 1 unhandled error
Unhandled Rejection: EISDIR: illegal operation on a directory
```

GREEN:

```text
tests/unit/ariadne/process.test.ts
1 file passed, 7 tests passed
```

No process-level unhandled error was reported in the green run.

## Verification

Focused:

```text
rtk pnpm exec vitest run tests/unit/ariadne/process.test.ts --reporter=verbose --no-file-parallelism
1 file passed, 7 tests passed
```

Full:

```text
rtk pnpm run check
biome: 79 files checked
typecheck: passed
unit: 23 files passed, 226 tests passed
build and JavaScript/shell syntax checks: passed
integration tests and publish retry tests: passed
```

Additional:

```text
git diff --check
passed
```

`graphify-out/graph.json` is absent in this checkout, so no graph update was
available.

## Commit

Conventional commit subject: `fix(ariadne): handle log stream failures`.
No push was performed.
