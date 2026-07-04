---
name: design-to-code
description: "Convert design artifacts into React + TypeScript + Tailwind code that follows the target repository's design system and conventions. Inputs auto-detected: local HTML mockups (Claude Design / Open Design output), artifact URLs, or screenshots. Use when asked to 'transformar design em código', 'implementar mockup', 'implementar design', 'design to code', turn a Claude Design / Open Design artifact into components, or convert an HTML mockup to React. Requires the target repo to use React, TypeScript, and Tailwind. Output: components + assembled page, wired to the repo's routing/state/data-fetching patterns when detectable, with structural visual verification."
---

# Design to Code

Convert a design artifact into production React + TypeScript + Tailwind code that looks like it was written by the target repo's own team.

## Golden rule

**Design = intent, repo = law.**

The design tells you *what* to build — structure, hierarchy, content, interaction. The target repository tells you *how* — tokens, components, naming, wiring. When they conflict, the repo wins.

Consequences:

- Never use arbitrary Tailwind values (`bg-[#3B82F6]`, `p-[18px]`). Map every design value to the nearest repo token. The only escape is a documented exception with written justification (see `mapping.md`).
- Never invent a token, variant, or pattern the repo lacks. If the design needs one, propose it as an **explicit extension** and get approval at the Phase 3 gate.
- Reuse existing components before creating new ones. New components only when no equivalent exists.

## Preconditions

The target repo MUST have React + TypeScript + Tailwind.

- **No Tailwind** → abort. Tell the user exactly what is missing and that this skill only targets react+ts+tailwind repos.
- **No design system** (no custom tokens, no reusable components) → degrade gracefully: use the default Tailwind scale, mark every component NEW, and warn the user that nothing could be reused.
- **Monorepo** → ask which app/package is the target before Phase 1.

## Pipeline

Five phases, strictly gated. On entering a phase, read its reference file (same directory as this SKILL.md). Do not read phase files ahead of time — progressive disclosure keeps context lean.

| Phase | Reference | Output artifact | Gate to proceed |
|---|---|---|---|
| 1. Discovery | `discovery.md` | `repo-map.md` | Artifact written |
| 2. Input analysis | `input-analysis.md` | `design-spec.md` | Artifact written |
| 3. Mapping | `mapping.md` | `mapping-table.md` | **USER APPROVAL** |
| 4. Generation | `generation.md` | Code in target repo | Static checks pass |
| 5. Verification | `verification.md` | Verification report | Checklist passes or 3 rounds |

Phase N may not start until phase N−1's gate is satisfied. Phases 1 and 2 are independent of each other in content but run in this order so component candidates in Phase 2 can be named in the repo's style.

**Create a todo per phase when the pipeline starts.** Mark each in_progress/completed as you go.

## Artifacts

Write intermediate artifacts to the session scratchpad directory:

- `repo-map.md` — what the repo offers (tokens, components, conventions, wiring patterns)
- `design-spec.md` — what the design asks for (component tree, observed tokens, content, states)
- `mapping-table.md` — the crossing of the two (REUSE / EXTEND / NEW decisions, token mapping, exceptions)

Later phases **read artifacts instead of re-analyzing**. If a session is resumed mid-pipeline, read the existing artifacts and continue from the first missing one.

## The Phase 3 gate (hard stop)

`mapping-table.md` is presented to the user before any code is generated:

- EXTEND decisions modify existing components — the user must see the API diff and approve.
- Token mappings change the design's raw values — the user must see what diverges and why.

Wait for explicit approval. Apply any requested changes to the table, then enter Phase 4. Never skip this gate, even when every decision is REUSE.

**Autonomous runs:** when the user has explicitly pre-authorized unattended execution (batch run, "não precisa me perguntar", scheduled/loop mode), self-approve the gate — but record in `mapping-table.md` that it was auto-approved and why, keep every EXTEND strictly additive, and surface the full table in the final report so the user reviews it after the fact.

## Input priority

When multiple design inputs exist for the same design:

1. **Local HTML file** — structural source of truth
2. **Artifact URL** — fetch, then treat as HTML
3. **Screenshot** — vision extraction; when HTML also exists, the screenshot only validates appearance

Multiple candidate designs (e.g., two HTML files, unclear which) → ask the user. Never guess.
