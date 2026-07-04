# Phase 5 — Verification

## Purpose

Prove the generated code matches the design **structurally** — not pixel-for-pixel, since Phase 3 intentionally remapped raw values to repo tokens.

## Inputs

- Generated code (Phase 4)
- Original design artifact (HTML/screenshot/URL)
- `design-spec.md`, `mapping-table.md`

## Procedure

1. **Static verification (must pass before the visual loop)**
   - Discover the target repo's scripts from its `package.json`: typecheck (`tsc --noEmit` or a `typecheck` script), lint, build.
   - Run all three. Fix failures before any screenshot — a broken build makes visual comparison meaningless.
   - If `pnpm exec`/`npx` misbehaves (hangs, OOMs, "missing script" for a binary that exists — shell hooks/proxies can break these wrappers), bypass with the direct binary: `./node_modules/.bin/<tool>`. Record the working commands in `repo-map.md` so later phases reuse them.

2. **Visual loop**
   1. Start the repo's dev server (its `dev` script) in the background; wait for it to report ready.
   2. Screenshot the new page/components. Tooling, in detection order:
      - Playwright already in the repo → use it
      - `npx playwright screenshot` available → use that
      - Headless Chrome/Chromium (`chromium --headless --screenshot`) → fallback
   3. Compare against the original design artifact side by side.
   - **Match app state to the design's depicted state before comparing** (auth logged in/out, active tab, filters, seeded data). A state mismatch reads as dozens of false layout diffs.
   - `file://` screenshot pitfalls: spaces/unicode in filenames break the URL — copy the file to a space-free scratch path instead of fighting encoding. A suspiciously small screenshot (~15–20 KB dark page) is Chrome's error page (`ERR_FILE_NOT_FOUND`), not your render — check the path before debugging the code.

3. **Fidelity checklist (structural, not pixel)**
   - [ ] Section order and hierarchy match the design-spec component tree
   - [ ] Layout system matches per section: column counts, alignment, sidebar placement
   - [ ] Relative spacing rhythm preserved (tighter/looser relationships, not exact px)
   - [ ] Typography hierarchy matches: same number of distinct levels, same ordering of prominence
   - [ ] Interactive states present (hover/focus/disabled where the spec lists them)
   - [ ] Colors correct **per mapping-table** — the repo token was applied where the mapping says; divergence from the design's raw hex is correct behavior, divergence from the mapping is a bug
   - [ ] Content matches the spec's content inventory (real texts/numbers, no placeholder lorem)

4. **Iterate**
   - Any unchecked item → fix the code, re-screenshot, re-run the checklist.
   - **Maximum 3 rounds.** After the third, stop and report the remaining differences honestly, with the screenshots, and let the user decide.

5. **Report**
   - Static results (commands + pass/fail), rounds used, final checklist state, screenshots compared, any accepted differences and why.

## Failure modes

- **Dev server won't start** → fall back to static verification + a line-by-line self-review of the generated code against `design-spec.md` (every tree node implemented? every state handled? every content item present?). State clearly in the report that the visual loop did not run.
- **No screenshot tooling available** → same fallback, same disclosure.
- **Screenshot renders blank/broken** → check the route is correct and the server finished compiling before concluding the code is wrong.
