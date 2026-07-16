# Defensive Security Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add six first-party defensive security skills inspired by selected recon-skills workflows.

**Architecture:** Skills are ordinary local Custom Skills under `skills/security/`, discovered and filtered by the existing recursive skill loader. No new installer path or runtime dependency is required. Attribution and safety boundaries live in the skill files, a package notice, the README catalog, and integration assertions.

**Tech Stack:** Markdown Agent Skills, TypeScript/Vitest repository checks, Bash integration tests, Graphify.

## Global Constraints

- Keep all workflows limited to authorized targets and non-destructive validation.
- Never print or copy secret values; report type, location, and masked context only.
- Do not import the upstream repository's agent instructions or environment assumptions.
- Preserve the existing `skills/<package>/<skill-name>/SKILL.md` layout.
- Use Conventional Commits if committing.

### Task 1: Add the security skill package

**Files:**
- Create: `skills/security/NOTICE.md`
- Create: six `skills/security/*/SKILL.md` files named in the design spec.

- [ ] Add each skill with valid frontmatter, trigger conditions, safe procedure, false-positive gates, and reporting format.
- [ ] Run the bundled skill audit and inspect every reported issue.

### Task 2: Update public catalog and guardrails

**Files:**
- Modify: `README.md`
- Modify: `tests/test-agent-toolkit.sh`
- Modify: `tests/unit/skills.test.ts` only if discovery assertions need a security-package contract.

- [ ] Document the `security` package and upstream inspiration/attribution.
- [ ] Assert the six skill names and safety wording in the integration contract.

### Task 3: Verify

- [ ] Run `rtk graphify update .` only if `graphify-out/graph.json` exists.
- [ ] Run `rtk pnpm run check`.
- [ ] Report any unrelated pre-existing failure with its exact command and output.
