---
name: onboard-repo
description: Use when setting up a repository for AI-assisted development - detect the stack, install the right skills through the Agent Toolkit, and organize the agent docs (AGENTS.md, CLAUDE.md, MCP config). Trigger phrases include "onboard this repo", "set up this project for AI", "which skills fit this repository", or "organize the agent config here".
---

# Onboard Repo

Set up the current repository for AI-assisted development in three passes:
detect the stack, install matching skills, and organize the agent docs.
Report what you did and what you skipped at the end.

Do not run installs or write files before completing the detection pass and
showing the user your plan. Ask before overwriting any existing file.

## Pass 1 — Detect the stack

Inspect the repository (prefer fast reads over full scans):

- Manifests: `package.json` (+ workspaces), `pyproject.toml`, `go.mod`,
  `Cargo.toml`, `Gemfile`.
- Frameworks and libraries in dependencies: React, React Native, Astro,
  Next.js, Vue, GSAP, Tailwind, Playwright, Vitest/Jest.
- Structure: monorepo (turbo/nx/pnpm workspaces), apps vs packages, CI
  workflows, existing tests.
- Existing agent config: `AGENTS.md`, `CLAUDE.md`, `.mcp.json`, `RTK.md`,
  `.rtk/`, skill directories, `.agents/`, `.codex/` (never modify or delete
  agent-state directories you did not create).

Summarize findings in a few lines before proposing anything.

## Pass 2 — Choose and install skills

Map the detected stack to skills using this table, then install with a single
Agent Toolkit run using only the flags that apply:

| Signal | Skills | Toolkit selector |
|---|---|---|
| Any repo | grilling interviews, domain modeling | `--planning-skills-only` |
| Frontend (React/Vue/Astro/CSS-heavy) | Impeccable, Web Design Guidelines, React Doctor | `--frontend-skills-only` |
| Frontend | bundled `frontend` package (accessibility, design, gsap, react, react-native, astro — pick relevant) | `--skills-only` with `--skills-package frontend` |
| Backend/API services | bundled `backend` package | `--skills-only` with `--skills-package backend` |
| Infra/CI-heavy | bundled `devops` package | `--skills-only` with `--skills-package devops` |
| Codebase feels tangled or user asks for audits | Improve | `--improve-only` |

Notes:

- Combine selections into as few toolkit invocations as possible; each
  invocation is `npx -y @ranimontagna/agent-toolkit <flags>` plus the runtime
  flags the user works with (default: `--claude --codex --opencode`).
- Skip anything already installed (check the runtime skill directories first).
- Do not install skills for stacks the repo does not use; fewer, sharper
  skills beat a pile of unused ones.

## Pass 3 — Organize the agent docs

Follow this layout (create lazily, ask before overwriting):

- **`AGENTS.md`** — the canonical instruction file. Sections: project purpose
  (one paragraph), stack and commands (dev/build/test/lint), repository rules
  the agent must follow, available skills and when to reach for them, MCP
  servers if any. Keep it under ~120 lines; link out instead of inlining long
  docs.
- **`CLAUDE.md`** — minimal pointer only:

  ```markdown
  # Claude Instructions

  Read and follow `AGENTS.md` for this project.
  ```

- **`.mcp.json`** — only when the project benefits from specific MCP servers
  (e.g. Playwright for browser validation, Firecrawl for research). Reference
  env vars like `${FIRECRAWL_API_KEY}`; never hardcode secrets.
- **`RTK.md` / `.rtk/`** — only when the user uses RTK in this repo.

If an `AGENTS.md` already exists, update it (add the skills section, fix stale
commands) instead of rewriting it. Preserve the existing voice and structure.

## Final report

End with a short report:

1. Stack detected (one line).
2. Skills installed (and for which runtimes) vs skipped-as-present.
3. Files created or updated.
4. Anything deliberately left out and why (e.g. "no MCP config — no browser
   or research flows in this repo").
