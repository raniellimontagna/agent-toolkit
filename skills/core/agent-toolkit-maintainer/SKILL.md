---
name: agent-toolkit-maintainer
description: Use when modifying, publishing, or validating the Agent Toolkit installer, bundled personal skills, runtime support, README, or public-safe repository hygiene.
---

# Agent Toolkit Maintainer

Use this skill when working in the Agent Toolkit repository.

## Priorities

- Keep the repository public-safe: no internal company names, private URLs, tokens, or credentials.
- Keep the installer focused on Claude Code, Codex CLI, OpenCode and Gemini CLI.
- Keep bundled skills organized by package under `skills/<package>/<skill-name>/SKILL.md`.
- Prefer external installers for third-party skills, but third-party skills may be bundled when the user explicitly asks for vendoring and the upstream license allows copying.
- When bundling third-party skills, preserve the upstream license, add clear attribution, and document source ownership in README.
- Install skills flat into runtime skill directories using the skill directory name.
- Prefer configurable sources over hard-coded local paths.
- Keep external tool defaults pinned in `tools.lock.json`; do not reintroduce mutable defaults like `@latest`.
- Use `rtk` for shell commands when the local project instructions require it.
- Use Conventional Commits for repository commits.

## Installer Changes

When changing `bin/agent-toolkit.ts`, `src/**/*.ts` or `setup-agent-toolkit.sh`:

1. Add or update focused Vitest tests in `tests/unit/` for pure module behavior.
2. Add or update behavior tests in `tests/test-agent-toolkit.sh` for installer flows.
3. Keep `bin/agent-toolkit.ts` as a thin entrypoint into `src/main.ts`.
4. Keep each install concern in a focused module under `src/installers/`.
5. Keep TypeScript imports using `.js` extensions so compiled ESM works in Node.
6. Keep the published runtime CLI dependency-free unless there is a strong reason to add a production package.
7. Keep `package.json` bin entries pointed at `dist/bin/agent-toolkit.js`.
8. Preserve non-interactive flags for automation.
9. Keep interactive runs explicit: the user should select tools, runtimes and skill scopes.
10. Keep external source provenance checks active unless an explicit override is documented.
11. Do not make runtime support claims unless the install path is implemented.
12. Run TypeScript build/typecheck, Biome, Vitest and the integration test before claiming completion.
13. Run lint and tests before every commit.

## Skill Changes

When adding a bundled skill:

1. Create `skills/<package>/<skill-name>/SKILL.md`.
2. Use concise YAML frontmatter with `name` and `description`.
3. Keep `SKILL.md` procedural and short.
4. Move large examples or detailed references into `references/`.
5. Do not add README or changelog files inside a skill directory.

When adding third-party skills, either add a dedicated external installer or
bundle the skill only when explicitly requested and allowed by license. Preserve
the upstream license text, add attribution with source URL and commit, and
document the license/source in README.

## Verification

Run:

```bash
rtk pnpm run check
rtk pnpm run security
rtk pnpm run lint
rtk pnpm run build
rtk pnpm run typecheck
rtk pnpm run test:unit
rtk pnpm run test:integration
rtk rg -n "private-company-or-old-tooling-pattern" .
rtk graphify update .
```
