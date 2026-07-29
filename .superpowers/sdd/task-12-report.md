# Task 12 Report — Ariadne E2E, CI, and Package Proof

## RED

- Added the required package-script contract to `tests/test-agent-toolkit.sh` before changing `package.json`.
- `bash tests/test-agent-toolkit.sh` failed with `Expected package script test:ariadne to equal vitest run tests/unit/ariadne`, proving the new contract was active.
- The first compiled fake-runtime run then failed at the real CLI boundary with exit `4`: acquiring the project lock created unignored `.ariadne/lock.coordinator/{root.json,root.next}`, so Ariadne rejected its own project as dirty before invoking Claude.
- Moving coordinator state below the already ignored `.ariadne/runs/` boundary initially made all nine lock unit tests fail because the parent `runs` directory was absent in isolated lock fixtures. This proved directory creation also had to be self-contained.

## GREEN

- Added `test:ariadne` and the explicitly gated `test:ariadne:real` scripts.
- Added five deterministic fake runtime executables plus a real-Git proxy. The compiled CLI now proves happy paths for Claude, Codex, OpenCode, Gemini, and Antigravity with exact argument arrays and no network/model/auth use.
- Added recovery coverage for check failure then repair, three failures then blocked, missing result, dirty initial worktree, ambiguous runtime, stale lock, SIGINT interruption plus resume, dry-run immutability, Ralph import, Helix import, and legacy installer help.
- Asserted CLI exit classes `0`, `1`, `2`, `3`, `4`, and `130`; one Ariadne-owned commit per completed story; versioned progress; ignored run/coordinator artifacts; and absence of push, reset, checkout, clean, and revert commands.
- Added the opt-in authenticated smoke. Without both gates it prints `Ariadne authenticated smoke skipped`, exits `0`, and creates no project. Real provider smoke was intentionally not enabled for this fake-only task.
- Added the Ubuntu/macOS/Windows Node 24 matrix. It resolves pnpm from `packageManager` and runs Ariadne units, typecheck, and build; Windows does not run Bash integration.
- Added automated package dry-run inspection and manually packed/installed the real tarball. It contained compiled Ariadne sources, both Ariadne skills and notices, `tools.lock.json`, and `LICENSE`, contained no `.ariadne` state, and passed both Ariadne and legacy `npx agent-toolkit` help commands.
- Kept lock coordination beneath `.ariadne/runs/.lock-coordinator`, preserving the documented two ignore entries while preventing lock acquisition from dirtying or being committed by the project.

## Verification

- `pnpm exec vitest run tests/unit/ariadne/lock.test.ts` — 9 passed.
- `pnpm run test:ariadne` — 15 files, 154 tests passed.
- `pnpm run typecheck` — passed.
- `pnpm run build` — passed.
- `pnpm run test:ariadne:real` — gated skip, exit 0.
- `ARIADNE_REAL_GIT="$(command -v git)" node tests/ariadne-e2e.mjs` — passed.
- `rtk pnpm run check` — 32 files, 330 unit tests passed; compiled fake-runtime E2E and publish retry integration passed.
- `rtk pnpm run security` — no known vulnerabilities.
- `rtk graphify update .` — refreshed successfully (3,445 nodes, 4,928 edges, 269 communities); no tracked Graphify delta remained.
- Real `pnpm pack`, `tar -tf`, temporary `npm install`, `npx agent-toolkit ariadne --help`, and `npx agent-toolkit --help` — passed; explicit package-check and smoke directories removed.

## Files

- `.github/workflows/ci.yml`
- `docs/TESTING.md`
- `package.json`
- `src/ariadne/lock.ts`
- `tests/test-agent-toolkit.sh`
- `tests/ariadne-e2e.mjs`
- `tests/ariadne-smoke.mjs`
- `tests/fixtures/ariadne-fake-runtime.mjs`
- `tests/fixtures/ariadne-git-proxy.mjs`
- `.superpowers/sdd/task-12-report.md`

## Concerns

- Authenticated smoke was not run for any provider because Task 12 explicitly forbids model/auth/credit use; maintainers must run it per available authenticated runtime before release.
- Windows and Linux behavior is covered by the CI matrix configuration, not by this macOS host. Bash integration intentionally remains Ubuntu-only through the existing full-check job.
- Graphify reported its existing warning that `tile.json` and `tools.lock.json` produced zero graph nodes; the graph refresh still completed successfully.
- The pre-existing dirty `.superpowers/sdd/task-5-report.md` modification was neither edited nor staged.
