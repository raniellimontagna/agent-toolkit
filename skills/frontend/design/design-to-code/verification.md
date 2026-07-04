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
   - **Arbitrary-value gate (mechanical):** grep the generated/modified files for arbitrary Tailwind values — `grep -nE '\[(#|[0-9]+px)' <new files>` catches `bg-[#...]`, `p-[18px]`, `h-[57px]`. Every hit must correspond to a row in the mapping-table's Exceptions table. A hit with no exception row is a Phase 4 bug: fix the code or (rarely) go back to the gate to justify it. Decorative parametric styles passed via `style=` (per-datum gradients) are exempt only if the Exceptions table names them.

2. **Visual loop**
   1. Start the repo's dev server (its `dev` script) in the background; wait for it to report ready.
   2. Screenshot the new page/components. Tooling, in detection order:
      - Playwright already in the repo → use it
      - `npx playwright screenshot` available → use that
      - Headless Chrome/Chromium (`chromium --headless --screenshot`) → fallback
   3. Compare against the original design artifact side by side.
   4. **Responsive matrix:** when the design-spec declares breakpoints or responsive behavior (sidebar collapse, grid → single column), screenshot at three widths — mobile 390, tablet 768, desktop 1440 — and run the fidelity checklist per viewport. Desktop-only designs skip this, but say so in the report rather than silently checking one width.

3. **Interactive states (don't skip — static screenshots miss them)**
   Route screenshots never capture modals, hover states, dropdowns, or multi-step flows. For every spec'd state that needs interaction to reach:
   - **Preferred:** drive the real flow — a throwaway Playwright script (repo's Playwright or `./node_modules/.bin/playwright`), or headless Chrome via DevTools Protocol, that clicks through and screenshots each state (e.g., open the booking modal, advance each step; log in through the app's own mock auth to reach protected screens). Real-flow driving beats state injection: it also proves the transitions work.
   - **Fallback — state injection:** temporarily flip the state's source to render it directly (store default, seeded route param, initial-step prop), screenshot, then revert before committing. Same technique as auth-state parity.
   - **Neither possible:** the state goes in the report under **"Spec'd states NOT visually verified"** with the reason. This list is mandatory in the final report — an empty list is a claim, so make it explicitly ("all interactive states exercised"), not by omission.
   - **Match app state to the design's depicted state before comparing** (auth logged in/out, active tab, filters, seeded data). A state mismatch reads as dozens of false layout diffs.
   - `file://` screenshot pitfalls: spaces/unicode in filenames break the URL — copy the file to a space-free scratch path instead of fighting encoding. A suspiciously small screenshot (~15–20 KB dark page) is Chrome's error page (`ERR_FILE_NOT_FOUND`), not your render — check the path before debugging the code.
   - **SPA prototypes with state-based routing** (route in `useState`/localStorage, no URL routing) can't deep-link to inner views. To screenshot an inner view, patch a *copy* of the prototype's initial-route expression (`sed` on the copy — never the original). If the bundle is compiled/minified and the pattern doesn't match, don't fight it: verify that view against the design-spec derived from the JSX sources instead, and note in the report that the pixel reference was home-only.

4. **Fidelity checklist (structural, not pixel)**
   - [ ] Section order and hierarchy match the design-spec component tree
   - [ ] Layout system matches per section: column counts, alignment, sidebar placement
   - [ ] Relative spacing rhythm preserved (tighter/looser relationships, not exact px)
   - [ ] Typography hierarchy matches: same number of distinct levels, same ordering of prominence
   - [ ] Interactive states present (hover/focus/disabled where the spec lists them)
   - [ ] Colors correct **per mapping-table** — the repo token was applied where the mapping says; divergence from the design's raw hex is correct behavior, divergence from the mapping is a bug
   - [ ] Content matches the spec's content inventory (real texts/numbers, no placeholder lorem)
   - [ ] **No design drift**: the result keeps the design's visual identity and mood — its motifs, its type-scale relationships, its negative space — instead of collapsing into a generic template that merely has the same sections

5. **Iterate**
   - Any unchecked item → fix the code, re-screenshot, re-run the checklist.
   - **Maximum 3 rounds.** After the third, stop and report the remaining differences honestly, with the screenshots, and let the user decide.

6. **Consolidation pass (multi-screen runs)**
   After several screens/batches, generated components drift: near-duplicates appear (two card variants that are one component with a prop), and components born inside a feature turn out to be app-wide primitives. Before the final report:
   - Scan the components created this run for near-duplicates → merge into one component + variant prop.
   - Any component used by 2+ features that has no feature-specific logic → promote to the repo's primitive layer (`ui/`), following its conventions.
   - **Cross-screen consistency audit**: batches drift visually, not just structurally. Compare screens for the same type-scale logic, the same spacing discipline, the same CTA styling, the same recurring motifs (from the design-spec). A screen built in batch 5 that renders its CTAs or section headings differently from batch 1 is a bug even if each screen individually passes.
   - Re-run static verification after consolidating.
   Single-screen runs skip this step.

7. **Report**
   - Static results (commands + pass/fail, arbitrary-value gate outcome), rounds used, final checklist state per viewport, screenshots compared, the "spec'd states NOT visually verified" list, consolidation changes, any accepted differences and why.

## Failure modes

- **Dev server won't start** → fall back to static verification + a line-by-line self-review of the generated code against `design-spec.md` (every tree node implemented? every state handled? every content item present?). State clearly in the report that the visual loop did not run.
- **No screenshot tooling available** → same fallback, same disclosure.
- **Screenshot renders blank/broken** → check the route is correct and the server finished compiling before concluding the code is wrong.
