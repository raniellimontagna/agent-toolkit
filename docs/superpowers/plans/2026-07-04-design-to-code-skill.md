# design-to-code Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the proprietary `design-to-code` skill that converts design artifacts (HTML mockups, screenshots, artifact URLs) into React + TS + Tailwind code following the target repo's design system, plus two HTML test fixtures.

**Architecture:** Progressive-disclosure skill at `skills/frontend/design/design-to-code/` — an orchestrating `SKILL.md` plus five phase reference files, each loaded only when its phase starts. Phases communicate through scratchpad artifacts (`repo-map.md`, `design-spec.md`, `mapping-table.md`). Spec: `docs/superpowers/specs/2026-07-04-design-to-code-skill-design.md`.

**Tech Stack:** Markdown skill files only (no `src/` changes — installer auto-discovers `skills/`). Fixtures are self-contained HTML. Verification via `rtk pnpm run check`.

---

## File Structure

```
skills/frontend/design/design-to-code/
├── SKILL.md              # orchestrator: frontmatter, golden rule, 5-phase workflow, gates
├── discovery.md          # Phase 1: target repo inventory → repo-map.md
├── input-analysis.md     # Phase 2: design detection/extraction → design-spec.md
├── mapping.md            # Phase 3: design→repo mapping → mapping-table.md + user gate
├── generation.md         # Phase 4: code generation conventions
└── verification.md       # Phase 5: static + visual verification loop
temp/
├── design-example-dashboard.html   # fixture: dashboard mockup
└── design-example-landing.html     # fixture: landing page mockup
.gitignore                # add negation so fixtures are committable
```

Each phase file follows one shape: **Purpose → Inputs → Procedure (numbered) → Output artifact (exact format) → Failure modes**. That keeps files focused and lets the orchestrator reference them uniformly.

---

### Task 1: SKILL.md orchestrator

**Files:**
- Create: `skills/frontend/design/design-to-code/SKILL.md`

- [ ] **Step 1: Write SKILL.md** with:
  - Frontmatter: `name: design-to-code`; description covering triggers — "transformar design em código", "implementar mockup/design", "design to code", "Claude Design", "Open Design", "HTML mockup para React", inputs (HTML file, screenshot, artifact URL), output (React+TS+Tailwind respecting repo conventions), and the requirement that the target repo uses React+TS+Tailwind.
  - **Golden rule** at top: "Design = intent, repo = law." Never invent tokens/patterns the repo lacks without proposing them as explicit extensions. No arbitrary Tailwind values (`bg-[#3B82F6]`) except with written justification.
  - **Pipeline table**: 5 phases, each row = phase, reference file to load on entry, output artifact, gate condition. Phase N requires N−1's artifact to exist.
  - **Artifacts** section: intermediate files go to the session scratchpad; later phases read artifacts instead of re-analyzing; resuming mid-pipeline = read existing artifacts, continue from first missing one.
  - **Hard gate** after Phase 3: present `mapping-table.md` to the user and wait for approval before generating code (extensions modify existing code).
  - **Preconditions**: target repo must have React + TypeScript + Tailwind; if Tailwind missing → abort with clear message listing what's missing. No design system at all (no custom tokens, no components) → degrade to default Tailwind scale, everything NEW, warn user.
  - Checklist instruction: create a todo per phase on entry.

- [ ] **Step 2: Verify frontmatter parses** — first line `---`, valid YAML `name` + `description`, closing `---`.

- [ ] **Step 3: Commit**

```bash
git add skills/frontend/design/design-to-code/SKILL.md
git commit -m "feat: add design-to-code skill orchestrator"
```

### Task 2: discovery.md (Phase 1)

**Files:**
- Create: `skills/frontend/design/design-to-code/discovery.md`

- [ ] **Step 1: Write discovery.md** — Purpose: inventory target repo. Procedure:
  1. Stack: Tailwind v3 (`tailwind.config.{js,ts}`) vs v4 (CSS `@theme`); shadcn via `components.json`; routing (Next app/pages dirs, react-router, TanStack Router); state (zustand/redux/jotai/context imports); data-fetching (react-query/SWR/fetch usage).
  2. Tokens: colors, spacing, fonts, radii from Tailwind config or CSS vars. Record token name + value.
  3. Components: scan `components/`, `ui/`, `src/components/`; per component record name, file, props signature, variants (cva/variant props). Read signatures only, not implementations.
  4. Conventions: file naming, folder-per-feature vs flat, export style (default vs named, barrels), test file pattern.
  - Output format: `repo-map.md` template with sections Stack / Tokens (table: token → value) / Components (table: name → file → props → variants) / Conventions / Wiring patterns (routing, state, data-fetching each marked detected-or-absent).
  - Failure modes: no Tailwind → abort per SKILL.md; monorepo → ask which app; huge component dirs → inventory `ui/` primitives fully, feature components by name only.

- [ ] **Step 2: Commit**

```bash
git add skills/frontend/design/design-to-code/discovery.md
git commit -m "feat: add design-to-code discovery phase"
```

### Task 3: input-analysis.md (Phase 2)

**Files:**
- Create: `skills/frontend/design/design-to-code/input-analysis.md`

- [ ] **Step 1: Write input-analysis.md** — Purpose: detect and extract the design. Procedure:
  1. Detect inputs: user-provided path/URL/image; else look for obvious candidates (`*.html` mockups in cwd/temp). Multiple candidates → ask user, never guess.
  2. Priority: local HTML > URL (fetch page) > screenshot (vision). HTML+screenshot → HTML is structural truth, screenshot validates appearance.
  3. Extract: section hierarchy, layout system (grid/flex, columns, breakpoints if present), colors (hex/rgb), typography (families, sizes, weights), spacing rhythm, visible interaction states (hover/disabled/active), real text content → becomes typed mock data.
  4. Decompose into candidate component tree; one responsibility per node; name candidates in the repo's naming style.
  - Output format: `design-spec.md` template — Overview / Component tree (nested list with responsibility per node) / Design tokens observed (table: kind → value → where used) / Content inventory (mock data source) / States & interactions.
  - Failure modes: illegible or low-res screenshot → request better export or HTML; URL unreachable → ask for HTML export; design too large (multiple screens) → split, confirm scope with user.

- [ ] **Step 2: Commit**

```bash
git add skills/frontend/design/design-to-code/input-analysis.md
git commit -m "feat: add design-to-code input-analysis phase"
```

### Task 4: mapping.md (Phase 3)

**Files:**
- Create: `skills/frontend/design/design-to-code/mapping.md`

- [ ] **Step 1: Write mapping.md** — Purpose: cross `design-spec.md` × `repo-map.md`. Procedure:
  1. Components: each candidate → **REUSE** (equivalent exists — same role, compatible API), **EXTEND** (exists, lacks variant/prop — write explicit API diff: current props → proposed props), **NEW** (no equivalent; place per repo conventions).
  2. Colors: map to nearest repo token by perceptual closeness (compare hue first, then lightness); ties → prefer semantic token (`primary`) over palette step (`blue-500`).
  3. Spacing/typography/radii: nearest scale step; consistent rounding direction within a section.
  4. Arbitrary values forbidden; the only escape is a table row with written justification (e.g., brand asset aspect ratio).
  - Output format: `mapping-table.md` — three tables: Components (candidate → decision → target/new path → notes; EXTEND rows include API diff), Tokens (design value → repo token → distance note), Exceptions (arbitrary values + justification, ideally empty).
  - **Gate**: present the tables to the user; wait for explicit approval; apply requested changes to the table before Phase 4.
  - Failure modes: no token remotely close (e.g., design is neon green, repo palette is earth tones) → flag as design-system conflict, ask user: map anyway / propose token extension / keep arbitrary with justification.

- [ ] **Step 2: Commit**

```bash
git add skills/frontend/design/design-to-code/mapping.md
git commit -m "feat: add design-to-code mapping phase"
```

### Task 5: generation.md (Phase 4)

**Files:**
- Create: `skills/frontend/design/design-to-code/generation.md`

- [ ] **Step 1: Write generation.md** — Purpose: generate code per `mapping-table.md`. Procedure:
  1. Order: component extensions first (smallest diffs, unblock reuse) → NEW components (leaf-first) → page/composition → wiring.
  2. Wiring: if `repo-map.md` shows patterns, wire route (repo's router idiom), state, and data-fetching (repo's query idiom) with mock-backed responses; otherwise typed mock data (`mocks/` dir if repo has one, else colocated file) and assembled page only.
  3. Style rules: strict TS (typed props, no `any`), follow repo naming/export conventions exactly, Tailwind classes ordered layout→spacing→typography→color, no inline styles.
  4. Accessibility baseline (mandatory): semantic landmarks, heading hierarchy from design, alt text, form labels, focus-visible on interactive elements, buttons vs links used correctly.
  5. After each file: does it compile in your head? imports exist per repo-map? tokens only from mapping-table?
  - Failure modes: extension rejected during gate → fall back to NEW component wrapping the existing one; repo pattern ambiguous (two routers found) → ask.

- [ ] **Step 2: Commit**

```bash
git add skills/frontend/design/design-to-code/generation.md
git commit -m "feat: add design-to-code generation phase"
```

### Task 6: verification.md (Phase 5)

**Files:**
- Create: `skills/frontend/design/design-to-code/verification.md`

- [ ] **Step 1: Write verification.md** — Purpose: prove generated code matches the design structurally. Procedure:
  1. Static: run target repo's typecheck, lint, build (discover scripts from its package.json). All must pass before visual loop.
  2. Visual loop: start dev server (repo's dev script), screenshot the new page/components — detect tooling in order: Playwright in repo → `npx playwright` → headless Chrome/Chromium. Compare against original design artifact.
  3. Fidelity checklist (**structural, not pixel**): section order and hierarchy match; layout system matches (columns, alignment); relative spacing rhythm preserved; typography hierarchy matches; interactive states present; colors correct **per mapping-table** (intentional divergence from design raw values is correct behavior).
  4. Iterate: fix → re-screenshot → re-check. Max 3 rounds; then report remaining differences honestly with screenshots.
  - Failure modes: dev server won't start → fall back to static verification + line-by-line self-review of generated code against `design-spec.md`; state clearly that the visual loop did not run. No screenshot tooling available → same fallback.

- [ ] **Step 2: Commit**

```bash
git add skills/frontend/design/design-to-code/verification.md
git commit -m "feat: add design-to-code verification phase"
```

### Task 7: Test fixtures in temp/

**Files:**
- Create: `temp/design-example-dashboard.html`
- Create: `temp/design-example-landing.html`
- Modify: `.gitignore` (add `!temp/design-example-*.html` after the `temp/` rule)

- [ ] **Step 1: Add .gitignore negation**

```gitignore
temp/
!temp/
temp/*
!temp/design-example-*.html
```

(Replace the existing single `temp/` line — a plain `temp/` dir rule can't be negated for children, so switch to the `temp/*` + negation pattern.)

- [ ] **Step 2: Write `temp/design-example-dashboard.html`** — self-contained (all CSS in `<style>`), Claude Design-style analytics dashboard: fixed sidebar (logo, 5 nav items, user footer), header with search + avatar, 4 stat cards (label, value, delta up/down), revenue table (5 rows, status badges), chart placeholder panel (CSS bars). Colors deliberately off Tailwind default scale (e.g., `#4f6ef7`, `#12b76a`, `#f04438`, background `#f7f8fa`); spacing off-scale (e.g., 18px, 22px, 28px); font stack Inter-ish. Hover states on nav + table rows.

- [ ] **Step 3: Write `temp/design-example-landing.html`** — self-contained landing page: sticky navbar (logo, 4 links, ghost + solid CTA buttons), hero (headline, subcopy, email input + button, social proof strip), features grid (6 cards, icon placeholder + title + copy), pricing (3 tiers, middle highlighted with badge), final CTA band, footer (4 columns). Same off-scale palette approach but different hues (e.g., `#7c5cff` primary); at least 3 button variants (solid, ghost, outline) and 2 sizes to exercise EXTEND decisions.

- [ ] **Step 4: Open both in a browser (or render check) — layout not broken, all sections present.**

- [ ] **Step 5: Commit**

```bash
git add .gitignore temp/design-example-dashboard.html temp/design-example-landing.html
git commit -m "feat: add design-to-code test fixtures"
```

### Task 8: Verify toolkit + install check

- [ ] **Step 1: Run full check**

Run: `rtk pnpm run check`
Expected: lint + tests pass (skill is markdown-only; nothing in `src/` changed).

- [ ] **Step 2: Confirm installer discovery** — the installer scans `skills/` recursively for skill dirs; confirm `skills/frontend/design/design-to-code/SKILL.md` sits at the same depth/pattern as `skills/frontend/design/revenue-centric-design/SKILL.md`.

- [ ] **Step 3: Skill dry-read** — read SKILL.md top to bottom as if executing: every referenced file exists, every artifact named consistently (`repo-map.md`, `design-spec.md`, `mapping-table.md`), gate wording unambiguous.

---

## Self-review notes

- Spec coverage: golden rule (T1), 5 phases (T1–T6), artifacts + resume (T1), mapping gate (T4), error handling distributed into each phase's failure modes, fixtures (T7), YAGNI exclusions honored (no Figma/tests-gen/CSS-in-JS/Vue tasks), repo integration (T8).
- No `src/` changes needed — auto-discovery confirmed in `src/skills.ts` (`installCustomSkills` walks `state.customSkillsDir`).
- `.gitignore` conflict with spec ("committed under temp/") resolved in T7 via negation pattern.
