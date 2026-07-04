# Phase 3 — Mapping

## Purpose

Cross `design-spec.md` against `repo-map.md`: decide for every component candidate whether to reuse, extend, or create, and map every observed design value to a repo token. Ends in a **hard user-approval gate**.

## Inputs

- `design-spec.md` (what the design asks for)
- `repo-map.md` (what the repo offers)

## Procedure

1. **Component decisions** — for each candidate in the component tree:
   - **REUSE** — a repo component has the same role and a compatible API. Record which props/variants will be used.
   - **EXTEND** — a repo component has the role but lacks a variant/prop the design needs (e.g., Button has sm/md but design needs an xl hero button). Write an **explicit API diff**:
     ```
     Button (components/ui/button.tsx)
       size: "sm" | "md" | "lg"          → size: "sm" | "md" | "lg" | "xl"
     ```
     Extensions must be additive — never change existing variant behavior.
   - **NEW** — no equivalent exists. Decide its path per repo conventions (`repo-map.md` → Conventions).

2. **Color mapping** — for each observed color, pick the nearest repo token:
   - Compare hue first, then lightness. A same-hue token two lightness steps away beats a closer-lightness token in a different hue.
   - Ties → prefer semantic tokens (`primary`, `destructive`) over palette steps (`blue-500`).
   - Record the mapping and a one-word distance note (exact / close / far).

3. **Spacing / typography / radii mapping** — nearest scale step. Round consistently within a section (don't map 18px→4 and 22px→6 in the same card; pick one direction so rhythm survives).

4. **Exceptions** — arbitrary values (`h-[57px]`) are forbidden. The only escape: an Exceptions table row with written justification (e.g., brand asset with fixed aspect ratio). Target: empty table.

## Output: `mapping-table.md`

Write to the session scratchpad, three tables:

```markdown
# Mapping — <design> → <repo>

## Components
| Candidate | Decision | Target / new path | Notes |
|---|---|---|---|
| StatCard | NEW | components/dashboard/stat-card.tsx | no equivalent |
| Button (hero) | EXTEND | components/ui/button.tsx | size: +"xl" — diff below |
| Badge | REUSE | components/ui/badge.tsx | variant="success" |

### EXTEND diffs
Button: size "sm"|"md"|"lg" → "sm"|"md"|"lg"|"xl"

## Tokens
| Design value | Repo token | Distance |
|---|---|---|
| #4f6ef7 | primary (#4f46e5) | close |
| 22px card padding | p-5 (20px) | close |

## Exceptions
| Value | Justification |
|---|---|
| (none) | |
```

## Gate (hard stop — from SKILL.md)

Present all three tables to the user. Wait for explicit approval.

- EXTEND rows modify existing code — user must see each API diff.
- Token rows change the design's raw values — user must see what diverges.
- Apply requested changes to the table **before** entering Phase 4. Never skip the gate, even when everything is REUSE.

## Failure modes

- **No token remotely close** (design is neon green, repo palette is earth tones) → design-system conflict. Don't silently pick either side. Ask the user: (a) map to nearest anyway, (b) propose a new token as an extension, (c) keep the raw value as a justified exception.
- **Two repo components could serve the same role** → pick the one used more often in the repo; note the alternative in the table.
