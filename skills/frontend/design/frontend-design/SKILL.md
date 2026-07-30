---
name: frontend-design
description: Improve frontend interface quality for web apps, landing pages, dashboards, and interactive product surfaces. Use when building or refining UI layout, visual hierarchy, typography, color, responsive behavior, motion, interaction states, or visual polish.
---

# Frontend Design

Choose a concrete visual direction before writing UI code. The interface should
feel intentional for the product category, not like a generic template.

## Design Process

1. Infer the product type and audience from the issue and existing app.
2. Reuse the local design system, components, icons, spacing, and CSS conventions.
3. Establish hierarchy: one dominant idea per viewport, compact supporting copy,
   clear primary and secondary actions, and dense operational layouts for tools.
4. Design for loading, empty, error, long labels, hover, focus, active, disabled,
   mobile, and narrow-desktop states.
5. Check that text fits its parent and cannot overlap neighboring content.

## Visual Rules

- Use restrained cards only for repeated items, modals, or framed tools.
- Avoid nested cards, decorative gradient blobs, and one-note palettes.
- Use icons for familiar actions when an icon exists in the repository's icon set.
- Keep dimensions stable for boards, tiles, toolbars, counters, and controls.
- Do not scale font sizes directly with viewport width or change letter spacing
  without an existing design-system rule.
- Prefer real or generated bitmap/media assets when users need to inspect a
  product, person, place, or state.

## Implementation Rules

- Match the existing framework and styling approach.
- Prefer semantic HTML and accessible controls.
- Do not introduce a UI library, animation library, image service, or font
  package unless the repository already uses it or the task requires it.
- Run the available visual or build verification before finishing.
