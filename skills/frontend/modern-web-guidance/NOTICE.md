# Third-party notice

This skill is a modified copy of the Modern Web Guidance skill from Google Chrome.

- Source: https://github.com/GoogleChrome/modern-web-guidance/tree/64a6d708f5a43f2cd3fde5d4d7db3905ba1bdf65/skills/modern-web-guidance
- Source commit: 64a6d708f5a43f2cd3fde5d4d7db3905ba1bdf65 (release v1.0.1)
- Source SHA-256 (`skills/modern-web-guidance/SKILL.md`): 1292f0ce14794a5bc49af58e99d5f6d4edf10acd9472cade94ab0c5590892716
- CLI package: `modern-web-guidance@1.0.1` on npm, whose `SKILL.md` matches the source commit
- Skill version: `2026_11_10-47b4c80e`
- License: Apache-2.0
- Copyright: no copyright line upstream; published by the GoogleChrome GitHub organization

The upstream Apache License 2.0 is included in `LICENSE`. The upstream repository
has no `NOTICE` file. Only `SKILL.md` is copied: the guides, search index and
`legacy-scan` rules ship inside the npm package, which the skill runs through
`npx`. The `chrome-extensions` skill from the same repository is not included.

## Changes from upstream

- Every CLI command pins `modern-web-guidance@1.0.1` instead of `@latest`, so a
  new npm release cannot change what the agent runs.
- Every CLI command sets `DISABLE_TELEMETRY=1`. Without it the CLI sends each
  search query, retrieved guide ID, OS and agent name to Google.
- The "Disclose Skill Usage" step, which added a `### Modern Web Guidance`
  section to every answer, is replaced by naming the applied guide IDs in one
  line of the summary.
- The `description` frontmatter is folded into one line so the toolkit's
  frontmatter parser reads it.

## Refreshing

Update the npm version, the `--skill-version` value (from
`skills/modern-web-guidance/skill-version.txt` in the package), the source
commit and the source hash together. `tests/unit/modern-web-guidance-skill.test.ts`
fails if a command drops the pin or the telemetry opt-out.
