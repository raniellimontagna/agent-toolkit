# Phase 4 — Generation

## Purpose

Produce the code exactly as `mapping-table.md` (approved at the gate) prescribes, written in the target repo's own style.

## Inputs

- `mapping-table.md` (approved) — the only source of component decisions and token choices
- `design-spec.md` — structure, content, states
- `repo-map.md` — conventions and wiring patterns

## Procedure

1. **Order of work**
   1. **Extensions first** — smallest diffs, and they unblock reuse everywhere else. Apply each approved API diff additively; never alter existing variant behavior.
   2. **NEW components, leaf-first** — primitives before composites, so composites import real code.
   3. **Page / composition** — assemble per the design-spec component tree, preserving section order and heading hierarchy.
   4. **Wiring last** — see step 3.

2. **Style rules (every file)**
   - Strict TS: typed props (interface or type per repo habit), no `any`, no `@ts-ignore`.
   - Follow `repo-map.md` conventions exactly: file naming, export style, folder placement, class-merge helper (`cn`/`clsx`).
   - Tailwind classes only from the approved token mapping. Class order: layout → spacing → typography → color → states.
   - No inline `style=` attributes.
   - Repeated visual units (cards, rows, tiers) render from a typed data array, never copy-pasted JSX.

3. **Wiring**
   - `repo-map.md` shows a routing pattern → create the route in that idiom (app-router page, route object, etc.).
   - Shows a data-fetching pattern → wire it in the repo's idiom (e.g., a `useQuery` hook) backed by the mock data, so swapping to a real endpoint is a one-line change.
   - Shows a state pattern and the design needs shared state → follow it. Local UI state stays `useState`.
   - Pattern "none detected" → typed mock data only: put it in the repo's `mocks/` dir if one exists, else colocate a `*.mock.ts` next to the page. Mock content comes from the design-spec Content inventory — real texts and numbers, not lorem ipsum.

4. **Filling design gaps with restraint**
   When the design doesn't specify something you must build anyway (responsive collapse it never drew, empty/error/loading states, a screen edge case):
   - Default to restraint: no invented badges/pills/decorative micro-UI, no cards nested inside cards, preserve the design's negative space and rhythm.
   - Reuse the design's own motifs (from the design-spec) instead of importing generic patterns.
   - Every invented piece goes in the Phase 5 report under "accepted differences" — gap-filling is fine, silent invention is not.

5. **Accessibility baseline (mandatory)**
   - Semantic landmarks: `nav`, `main`, `header`, `footer`, `aside`.
   - Heading hierarchy exactly as extracted in the design-spec.
   - `alt` on images, labels on form controls, `button` vs `a` used by behavior (action vs navigation).
   - Interactive elements keyboard-reachable with visible focus (repo's focus ring token if one exists).

6. **Per-file self-check (before moving to the next file)**
   - Does it compile in your head — every import exists per `repo-map.md`?
   - Every class traceable to the approved mapping? Zero arbitrary values outside the Exceptions table?
   - Props typed, mock data typed?
   - Only use component APIs the repo actually has (per the `repo-map.md` props column). Don't assume shadcn idioms (`asChild`, `forwardRef` wrappers, slot props) on hand-rolled components that look similar.

## Output

Code in the target repo. No artifact file — Phase 5 verifies directly.

## Failure modes

- **Extension was rejected at the gate** → NEW component that wraps the existing one instead of modifying it.
- **Ambiguous wiring** (two routers present, two fetch idioms) → ask the user; don't pick silently.
- **Design-spec node impossible with approved mapping** (e.g., needs a variant the user removed at the gate) → go back to the gate with a revised proposal; don't improvise.
