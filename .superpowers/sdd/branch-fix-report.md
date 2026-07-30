# Ariadne Branch Fix Report

## Scope

This pass resolves the cross-cutting review findings on `docs/ariadne-design` while preserving the existing uncommitted `.superpowers/sdd/task-5-report.md` change. The implementation remains runtime-neutral and gives the Ariadne coordinator exclusive ownership of state transitions, validation, and Git commits.

## RED

- Added focused regressions for Windows npm command shims, canonical story transitions, exact legacy import paths, durable progress content, the no-push prompt contract, Git/state ownership, exhausted persisted attempts, dry-run inspection, run metadata, failure streak status, warning-only Doctor results, TTY runtime selection, cancellation, and stable exit classes.
- The initial focused run failed 23 tests while 92 passed. Failures corresponded to the missing reviewer behavior rather than unrelated baseline regressions.

## GREEN

- Runtime processes now reuse the Windows spawn planner, routing `.cmd` and `.bat` npm shims through `cmd.exe` with verbatim argument handling.
- Each real attempt records a sanitized invocation, runtime version, start/finish timing, process/check metadata, validated result summary, and Git HEAD before/after. Terminal summaries cover completion, retry failure, blocking, interruption, budget exhaustion, ownership violations, and commit failure.
- Ariadne snapshots HEAD plus exact `prd.json` and `progress.md` contents around runtime execution and checks. Agent commits or canonical-state edits are rejected without staging, resetting, or overwriting the evidence. The agent prompt explicitly forbids pushes and publication.
- Resumed `in_progress` stories at the attempt limit become blocked before another child process can start. Normal state changes use the canonical transition validator; commit failure is the documented coordinator recovery exception.
- Dry-run is non-mutating and returns a binding human/JSON inspection of project, selected/blocked story, prompt path, sanitized invocation, runtime detection/version, checks, and limits. A successful dry-run exits `0`.
- CLI interactivity now depends on real stdin/stdout TTY state. Multiple healthy runtimes honor explicit, project, automatic, global, and interactive precedence; interactive choices are persisted inside the coordinator only after Git preflight. Cancellation exits `130`.
- Doctor warnings remain successful, runtime readiness errors exit `3`, and Git/state errors exit `4`. Status reports consecutive failed/blocked runs.
- Legacy Ralph/Helix imports reject malformed collections and fields with typed source paths. Malformed imported JSON is a typed state failure. Durable progress contains validated summary, changed files, learnings, and check results without raw runtime log content.
- The compiled fake-runtime suite now emits real npm-style `.cmd` wrappers on Windows and is part of the Ubuntu/macOS/Windows CI matrix. POSIX retains destructive-Git command assertions; Windows validates Ariadne-owned commit history with real Git.
- The release gate now creates and installs a real npm tarball, then runs Ariadne and legacy help through `npx --no-install`. The packed bin is also required by dry-run package inspection.

## Verification

- `rtk pnpm run lint` — passed.
- `rtk pnpm run typecheck` — passed.
- `rtk pnpm run test:ariadne` — 15 files, 173 tests passed as part of the final full unit gate.
- `rtk pnpm run test:ariadne:compiled` — five-runtime compiled CLI smoke passed.
- `rtk pnpm run test:ariadne:package` — real pack, isolated install, Ariadne help, and legacy help passed.
- `rtk pnpm run check` — 32 files, 349 unit tests passed; build, syntax checks, full compiled Ariadne E2E, installed-tarball E2E, legacy integration, and publish retry tests passed.
- `rtk pnpm run security` — no known vulnerabilities.
- `rtk graphify update .` — refreshed successfully to 3,474 nodes, 4,996 edges, and 266 communities; no tracked graph delta remained.
- `git diff --check` — passed.

## Release Notes

- The installed-tarball proof is part of `test:integration`, so the existing release workflow's `pnpm run check` gate blocks publication on packaging or public-bin regressions.
- The Windows `.cmd` execution path is represented in CI and cannot be executed natively on this macOS host. The same compiled platform smoke passed locally with POSIX runtime fixtures.
- Authenticated provider smoke was not run; all verification remains deterministic and credit-free.
- Graphify retained its existing warning that `tile.json` and `tools.lock.json` produced no nodes.
- No push was performed.
