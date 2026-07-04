# Phase 1 — Discovery

## Purpose

Inventory the target repository so every later decision (naming, reuse, tokens, wiring) is grounded in what actually exists. This phase reads the repo; it changes nothing.

## Inputs

- Target repository working directory (ask which app/package first if monorepo).

## Procedure

1. **Stack detection**
   - Tailwind version: `tailwind.config.{js,ts,cjs,mjs}` → v3-style config; CSS with `@theme` / `@import "tailwindcss"` → v4. Record where tokens live.
   - shadcn: `components.json` present → record its aliases and `ui/` path.
   - Routing: `app/` or `pages/` dir (Next.js), `react-router` / `@tanstack/react-router` in package.json. Record the idiom (file-based vs route objects) and one example route file.
   - State: grep imports for `zustand`, `@reduxjs/toolkit`, `jotai`, `valtio`; note context-based patterns in `providers/` or `context/`.
   - Data-fetching: `@tanstack/react-query`, `swr`, or plain `fetch` wrappers (`lib/api`, `services/`). Record one example usage.

2. **Token inventory**
   - From the Tailwind config (v3) or `@theme` block / CSS vars (v4): colors, spacing overrides, font families, radii, shadows.
   - Record every custom token as `name → value`. Note whether colors are semantic (`primary`, `destructive`) or palette-step (`brand-500`).
   - No custom tokens at all → note "default Tailwind scale only" (triggers the degraded mode from SKILL.md).

3. **Component inventory**
   - Scan `components/`, `src/components/`, `ui/`, and the shadcn path if present.
   - Per component record: name, file path, props signature, variants (cva variants, union-typed props). **Read signatures and variant definitions only — not full implementations.**
   - Large codebases: inventory `ui/` primitives fully; feature-level components by name + one-line role only.

4. **Convention detection**
   - File naming (PascalCase.tsx vs kebab-case.tsx), folder-per-feature vs flat, export style (default vs named, barrel `index.ts` or not), test file pattern (`*.test.tsx` location), class-merge helper (`cn`, `clsx`, `twMerge`).

5. **Verify build commands**
   - Actually run the repo's typecheck and build once, now. If `pnpm exec`/`npx` wrappers misbehave (hook/proxy environments can break them), fall back to `./node_modules/.bin/<tool>` and record whichever form worked — Phases 4–5 depend on these commands.

## Output: `repo-map.md`

Write to the session scratchpad, in this shape:

```markdown
# Repo Map — <repo name>

## Stack
- Tailwind: v4 (tokens in src/styles/globals.css @theme)
- shadcn: yes (components.json → @/components/ui)
- Routing: Next.js app router | react-router v7 | none detected
- State: zustand (src/stores/) | none detected
- Data-fetching: react-query (src/hooks/queries/) | none detected

## Tokens
| Kind | Token | Value |
|---|---|---|
| color | primary | #4f46e5 |
| radius | radius-lg | 12px |

## Components
| Name | File | Props | Variants |
|---|---|---|---|
| Button | components/ui/button.tsx | variant, size, asChild | solid/ghost/outline; sm/md/lg |

## Conventions
- Naming: kebab-case files, named exports, no barrels
- Class merge: cn() from lib/utils
- Tests: colocated *.test.tsx

## Verified commands
- Typecheck: ./node_modules/.bin/tsc -b
- Build: ./node_modules/.bin/vite build
- Dev/preview: ./node_modules/.bin/vite preview --port 4180

## Wiring patterns
- Route example: app/dashboard/page.tsx
- Query example: useQuery in src/hooks/queries/use-orders.ts
```

Mark absent things explicitly as "none detected" — Phase 4 uses that to decide mock-only wiring.

## Failure modes

- **No Tailwind** → stop, abort per SKILL.md preconditions.
- **Monorepo, target ambiguous** → ask the user which app; do not inventory everything.
- **Hundreds of components** → primitives fully, feature components as name + role. Never dump full implementations into the map.
