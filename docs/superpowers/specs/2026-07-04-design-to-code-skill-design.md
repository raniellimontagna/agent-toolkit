# Design: `design-to-code` skill

**Date:** 2026-07-04
**Status:** Approved for planning

## Goal

Proprietary skill that converts design artifacts (Claude Design / Open Design output: HTML mockups, screenshots, artifact URLs) into React + TypeScript + Tailwind code that follows the conventions and design system of the repository where the skill runs.

Complementary to `taste-skill` (which generates tasteful designs); this skill converts existing design artifacts into code that respects the target repo.

## Core rule

**Design = intent, repo = law.** The design communicates structure and intent; the target repository's design system, components, and conventions govern the implementation. Never invent tokens or patterns the repo lacks without proposing them as explicit extensions.

## Decisions

| Topic | Decision |
|---|---|
| Input | Auto-detect: local HTML > artifact URL > screenshot. HTML is structural source of truth; screenshot validates appearance when both exist. |
| Fidelity | Adapt to the repo's design system — map design colors/spacing to nearest existing tokens. Arbitrary Tailwind values (`bg-[#...]`) forbidden except with explicit justification. |
| Component reuse | Reuse existing components; when a design needs an unsupported variant, propose an explicit extension (API diff shown to user). Create new components only when no equivalent exists. |
| Output scope | Full wiring (route, state, data-fetching) when the repo has detectable patterns; otherwise components + assembled page with typed mock data. |
| Verification | Always: static (typecheck/lint/build) + visual loop (dev server, screenshot, compare against design, iterate). |

## Architecture

Progressive-disclosure skill following the repo's existing pattern (`ui-ux-pro-max`, `astro-developer`):

```
skills/frontend/design/design-to-code/
├── SKILL.md              # frontmatter + 5-phase workflow + gates + when to load each ref
├── discovery.md          # Phase 1: target repo inventory
├── input-analysis.md     # Phase 2: design detection and extraction
├── mapping.md            # Phase 3: design→repo mapping rules
├── generation.md         # Phase 4: code generation conventions
└── verification.md       # Phase 5: static + visual verification loop
```

`SKILL.md` (~150 lines) orchestrates; each phase's reference file loads only when that phase starts. Frontmatter description includes triggers: "transformar design em código", "implementar mockup", "design to code", "Claude Design", "Open Design", HTML mockup → React.

Phases are gated: phase N starts only when N−1 produced its artifact. Intermediate artifacts persist in the session scratchpad so later phases read them instead of re-analyzing, and work can resume mid-pipeline:

- Phase 1 → `repo-map.md`
- Phase 2 → `design-spec.md`
- Phase 3 → `mapping-table.md` (user review gate before generation)

## Phase content

### Phase 1 — Discovery (`discovery.md`)

Inventory the target repo:

- **Stack detection:** Tailwind v3 (JS config) vs v4 (CSS `@theme`); shadcn (`components.json`); routing (Next app/pages, react-router, TanStack); state (zustand, redux, context); data-fetching (react-query, SWR, plain fetch).
- **Tokens:** colors, spacing, fonts, radii from Tailwind config / CSS vars.
- **Components:** scan `components/`/`ui/`, extract name + props + variants (read signatures, not full implementations).
- **Conventions:** file naming, folder structure, export style, test patterns.

Output: `repo-map.md`.

### Phase 2 — Input analysis (`input-analysis.md`)

- Detection order: local HTML > URL (fetch) > screenshot (vision). Multiple inputs: HTML wins structurally, screenshot validates visuals.
- Extract: section/component hierarchy, grid/layout, colors, typography, spacing, visible states (hover, disabled), real text content (becomes mock data).
- Decompose into a candidate component tree, single responsibility per node.

Output: `design-spec.md`.

### Phase 3 — Mapping (`mapping.md`)

- Each candidate component → **REUSE** (equivalent exists), **EXTEND** (exists but lacks a variant — explicit proposal with API diff), or **NEW**.
- Each color → nearest token by perceptual distance; each spacing → nearest scale step.
- Output `mapping-table.md` and **stop for user review** — extensions modify existing code and deserve confirmation before generation.

### Phase 4 — Generation (`generation.md`)

- Order: component extensions → new components → page/composition → wiring (route + state + query if `repo-map.md` shows a pattern; otherwise typed mocks in `mocks/` or inline).
- Follow repo conventions from `repo-map.md`. Strict TS: typed props, no `any`.
- Baseline accessibility mandatory: semantic elements, alt text, labels, focus handling.

### Phase 5 — Verification (`verification.md`)

- Static: target repo's typecheck + lint + build.
- Visual loop: start dev server, screenshot (Playwright or headless Chrome — detect what's available), compare with original design. Fidelity checklist is **structural** (layout, hierarchy, relative spacing, states) — colors compared via the mapping table, so intentional divergence is fine.
- Iterate until checklist passes or 3 rounds; then report remaining differences honestly.

## Error handling

- Ambiguous/missing input → ask the user instead of assuming.
- Repo without Tailwind → abort with a clear message (skill requires react+ts+tailwind), state what's missing.
- Repo without a design system (no custom tokens, no components) → degrade: default Tailwind scale, everything becomes NEW, warn the user.
- Illegible/low-res screenshot → request a better export or the HTML.
- Dev server won't start in phase 5 → fall back to static verification + self-review of generated code against `design-spec.md`, report that the visual loop did not run.

## Test fixtures

Committed under `temp/` at the repo root:

- `temp/design-example-dashboard.html` — Claude Design-style mockup: sidebar, stat cards, table, chart placeholder. Exercises rich decomposition + token mapping.
- `temp/design-example-landing.html` — landing page: hero, features grid, pricing, CTA. Exercises public page + typography + button variants.

Both self-contained (inline `<style>`), with colors/spacing deliberately off the default Tailwind scale to force the mapping phase to work.

## Repo integration

- Bundled skills are auto-discovered from `skills/` by the installer (`src/skills.ts`) — no registration needed.
- No per-skill LICENSE/NOTICE (that pattern is for vendored third-party skills; this one is proprietary).
- Verification per AGENTS.md: `rtk pnpm run check` before claiming done.

## Out of scope (YAGNI)

- Figma as input.
- Generating unit tests for produced components.
- CSS-in-JS / styled-components support.
- Vue/Svelte or other frameworks.
