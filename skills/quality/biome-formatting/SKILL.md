---
name: biome-formatting
description: Use Biome for formatting and linting in JavaScript, TypeScript, Astro, React, JSON, and CSS projects. Use when the repository has biome.json, Biome scripts, or tasks that require code style, import organization, lint fixes, or formatting validation.
---

# Biome Formatting

Use the repository's Biome configuration as the source of truth for formatting,
linting, import organization, and safe automatic fixes.

## Workflow

1. Check `package.json` scripts and `biome.json` before choosing commands.
2. Prefer the repository script, such as `pnpm lint`, `pnpm lint:fix`, or its
   documented verification command.
3. Use automatic writes only for formatting, import organization, and safe fixes.
4. Re-run validation after automatic fixes.
5. Keep unrelated files out of the commit unless the formatter intentionally
   touched them.

## Implementation Rules

- Let Biome decide quote style, semicolons, trailing commas, and import ordering.
- Do not hand-format against Biome output or add ESLint/Prettier when Biome is
  already configured.
- Use JSON-aware edits for `biome.json`, `package.json`, and similar config.
- Review semantic code changes separately from mechanical formatter changes.
