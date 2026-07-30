---
name: astro-react-landing
description: Build landing pages with Astro plus React. Use when creating a landing page from scratch, migrating a landing page, or adding interactive islands/components where the preferred stack is Astro pages/layouts with React components.
---

# Astro React Landing

Use Astro as the page and content framework. Use React for interactive islands,
stateful UI, forms, calculators, carousels, dashboards, and reusable components.

## Stack Contract

- Prefer `.astro` routes, layouts, and static content for the landing-page shell.
- Prefer React only where interactivity or component state is useful.
- When `motion` is present, add a small React island with real rendered motion;
  use `client:load` or `client:visible` intentionally and keep copy crawlable.
- Keep static sections server-rendered when possible and choose one rendered
  source of truth; do not maintain parallel full Astro and React pages.
- Use existing Astro image/content primitives and avoid client JavaScript for
  sections that can be static HTML/CSS.

## Implementation Pattern

1. Inspect the current Astro structure before creating files.
2. Update the landing route in `src/pages/` and reuse local layouts/components.
3. Place interactive React components near the project's existing conventions.
4. Hydrate islands only where needed.
5. Keep metadata, canonical URL, Open Graph, and structured content near the
   page or layout.
6. When changing CTA hrefs or section ids, add a smoke test that keeps them
   aligned.
7. Validate with the repository's Astro, TypeScript, formatting, test, or build
   command.

## Quality Rules

- Do not turn every section into React by default.
- Remove dead page implementations instead of updating unused React data.
- Do not add Astro or React dependencies when the task does not allow migration.
- Prefer static generation unless request-time data is necessary.
- Keep the initial viewport fast, semantic, crawlable, and usable without
  animation timing.
