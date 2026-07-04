# Phase 2 — Input analysis

## Purpose

Turn the design artifact into a structured spec: what sections exist, how they're laid out, what values they use, what content they carry. The spec is the contract Phase 4 implements and Phase 5 verifies against.

## Inputs

- Design artifact(s): local HTML, artifact URL, and/or screenshot.
- `repo-map.md` (for naming component candidates in the repo's style).

## Procedure

1. **Detect inputs**
   - Use what the user pointed at. If nothing explicit, look for obvious candidates: `*.html` mockups in cwd, `temp/`, `designs/`, or recently mentioned files/URLs.
   - Multiple candidate designs and it's unclear which → **ask the user, never guess**.
   - Priority when the same design exists in several forms: **design source folder > local HTML > URL (fetch it, then treat as HTML) > screenshot**. HTML + screenshot together → HTML is the structural truth; use the screenshot only to validate rendered appearance.
   - **Design source folders** (Claude Design / Open Design exports) are the richest input. Recognize them by: a folder with `.jsx`/`.tsx` source files, one or more small `*.html` shells, large `*Standalone.html` bundles, and often a `HANDOFF*.md`/`README` doc. Handle each part by role:
     - `.jsx/.tsx` sources → structural truth: real component boundaries, props, state, interactions. Read these instead of parsing rendered HTML.
     - Handoff/README docs → often carry tokens, TypeScript types, mock data, and behavior notes **verbatim** — lift them directly into the spec instead of re-deriving. But its stack prescriptions (e.g. "don't use Tailwind") do NOT override the target repo: design = intent, repo = law.
     - `*Standalone.html` bundles (hundreds of KB to MB, inline React/Babel) → **never read as text** (they destroy context). Use them only as the render reference: screenshot with a headless browser for Phase 5 comparison. They need a generous render budget (e.g. `--virtual-time-budget=15000`) because they compile in-browser.

2. **Extract structure** (HTML: read markup + styles; screenshot: vision)
   - Section hierarchy top to bottom (nav, hero, content regions, footer...).
   - Layout system per section: grid vs flex, column counts, alignment, sidebar widths, breakpoints if declared.
   - Heading hierarchy (h1/h2/h3) — Phase 4 must preserve it.

3. **Extract observed tokens**
   - Colors (hex/rgb) with role: background, surface, text, accent, success/danger.
   - Typography: families, the distinct size/weight steps actually used.
   - Spacing rhythm: the distinct paddings/gaps in use (e.g., 18/22/28px) — record raw values; mapping to repo scale happens in Phase 3, not here.
   - Radii, shadows, borders.

4. **Extract states and interactions**
   - Hover/active/disabled styles present in CSS; focus styles; anything animated.
   - Screenshots can't show hover — note "states not observable" so Phase 4 falls back to repo component defaults.

5. **Extract content**
   - Real texts, numbers, table rows, labels. These become **typed mock data** in Phase 4 — never lorem ipsum when the design has real content.

6. **Decompose into candidate components**
   - One responsibility per node. Repeated visual units (cards, rows, tiers) → one component + data array.
   - Name candidates in the repo's naming style (from `repo-map.md`).

## Output: `design-spec.md`

Write to the session scratchpad, in this shape:

```markdown
# Design Spec — <artifact name>

## Overview
Analytics dashboard: fixed sidebar, header, stats row, revenue table, chart panel.

## Component tree
- DashboardPage
  - Sidebar — logo, nav list (5 items, active state), user footer
  - Header — search input, avatar
  - StatCard ×4 — label, value, delta (up/down)
  - RevenueTable — 5 rows, status badge per row
  - ChartPanel — bar chart placeholder

## Observed tokens
| Kind | Value | Role / where |
|---|---|---|
| color | #4f6ef7 | accent: active nav, primary button |
| spacing | 22px | card padding |

## States & interactions
- Nav item hover: background lightens
- Table row hover: surface tint

## Content inventory
- Stat cards: "Revenue $48,2k +12%", ...
- Table rows: (Acme Corp, $1,200, Paid), ...
```

## Failure modes

- **Illegible / low-res screenshot** → request a better export or the HTML. Do not invent details vision can't confirm.
- **URL unreachable** → ask for an HTML export instead.
- **Design spans multiple screens/pages** → one `design-spec.md` per screen plus `screen-backlog.md`, per the Multi-screen designs section of SKILL.md. Confirm scope/order with the user unless running autonomously (then: chrome first, leaf-to-complex).
