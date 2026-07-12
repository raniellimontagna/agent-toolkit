# Agent Browser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Agent Browser as a pinned, opt-in installer tool with matching skill installation, readiness diagnostics, documentation, and a repaired integration baseline.

**Architecture:** Treat Agent Browser as a standalone executable tool, not as a member of the existing frontend-skill bundle: it needs both an exact npm package and a Chrome provisioning step. Reuse the existing Agent Skills CLI clone-and-copy flow for its pinned skill directory, while extending the shared tool state, CLI flags, status and doctor data structures.

**Tech Stack:** TypeScript 6, Node.js 24+, pnpm 11, Vitest 4, Biome, Bash integration test, npm, Agent Skills CLI.

## Global Constraints

- Pin `agent-browser@0.31.1` and `vercel-labs/agent-browser@afae698a51242166170b6fe4809dd57fe9f75798` in `tools.lock.json`.
- Require Node.js 24+ globally in package metadata, runtime prerequisites, CI and documentation.
- The skill directory is `skills/agent-browser`, and it installs under the skill name `agent-browser`.
- Keep Agent Browser outside `--all`; only menu selection or `--agent-browser-only` enables it.
- Never run `agent-browser install --with-deps`, enable plugins/cloud providers, or import credentials/browser state.
- Keep dry-run and doctor non-mutating; do not invoke upstream `agent-browser doctor` because it cleans stale files.
- Use Conventional Commits and run `rtk pnpm run check` before handoff.

---

### Task 1: Establish the regression baseline and repair the shell test

**Files:**

- Modify: `tests/test-agent-toolkit.sh:614-624`
- Test: `tests/test-agent-toolkit.sh`

**Interfaces:**

- Consumes: the existing full-kit invocation at `tests/test-agent-toolkit.sh:594`.
- Produces: a deterministic assertion that verifies every supported runtime's expected Custom Skill destination.

- [ ] **Step 1: Reproduce the existing failure in isolation**

Run: `rtk pnpm run test:integration`

Expected: FAIL at the assertion for `$HOME_DIR/.codex/skills/agent-toolkit-maintainer/SKILL.md`.

- [ ] **Step 2: Identify the actual runtime destination from the successful installation**

Immediately before the failing assertion, add this temporary diagnostic command:

```bash
find "$HOME_DIR" -maxdepth 6 -type f -path '*/agent-toolkit-maintainer/SKILL.md' -print >&2
```

Run: `rtk pnpm run test:integration`

Expected: the output identifies whether the installer selected a runtime-specific target incorrectly or the fixture assertion is missing the target path.

- [ ] **Step 3: Make the smallest assertion or fixture repair**

Remove the temporary diagnostic. Change only the failing fixture/assertion so its expectation exactly matches the documented target returned by `skillsTargetDir` for Claude, Codex, OpenCode and Gemini:

```bash
for skill_target in \
  "$HOME_DIR/.claude/skills/agent-toolkit-maintainer/SKILL.md" \
  "$HOME_DIR/.codex/skills/agent-toolkit-maintainer/SKILL.md" \
  "$HOME_DIR/.config/opencode/skills/agent-toolkit-maintainer/SKILL.md" \
  "$HOME_DIR/.agents/skills/agent-toolkit-maintainer/SKILL.md"; do
  test -f "$skill_target" || exit 1
done
```

If these paths are correct, fix the prior invocation or fixture environment instead; do not weaken the assertion.

- [ ] **Step 4: Verify the integration suite is green before adding Agent Browser**

Run: `rtk pnpm run test:integration`

Expected: exit code 0, including the Custom Skill destination check.

- [ ] **Step 5: Commit the independent repair**

```bash
git add tests/test-agent-toolkit.sh
git commit -m "test: stabilize custom skill integration fixture"
```

### Task 2: Add the pinned Agent Browser installer and command surface

**Files:**

- Create: `src/installers/agent-browser.ts`
- Modify: `package.json`, `.github/workflows/ci.yml`, `README.md`, `CONTRIBUTING.md`, `tools.lock.json`, `src/tool-lock.ts`, `src/state.ts`, `src/args.ts`, `src/main.ts`, `src/menu.ts`, `src/status.ts`, `src/doctor.ts`, `src/usage.ts`
- Test: `tests/unit/tool-lock.test.ts`, `tests/unit/args.test.ts`, `tests/unit/installers.test.ts`, `tests/unit/doctor.test.ts`

**Interfaces:**

- Consumes: `run`, `capture`, `requireCommand`, and `requireNode` from `src/system.ts`; Agent Skills CLI installer helpers from `src/installers/frontend-skills.ts`.
- Produces: `installAgentBrowser(): boolean`; the new `ToolName` literal `"agent-browser"`; state fields `agentBrowserPackage` and `agentBrowserSkillSource`.

- [ ] **Step 1: Write failing lock and selection tests**

Add assertions that `loadToolLock()` returns this locked source and that `--all` leaves it false while `--agent-browser-only` selects exactly it:

```ts
expect(lock.tools.agentBrowser).toEqual({
  source: "npm",
  package: "agent-browser",
  version: "0.31.1",
  skill: {
    source: "github",
    repository: "vercel-labs/agent-browser",
    ref: "afae698a51242166170b6fe4809dd57fe9f75798",
    path: "skills/agent-browser",
    skill: "agent-browser",
  },
});
```

Run: `rtk pnpm vitest run tests/unit/tool-lock.test.ts tests/unit/args.test.ts`

Expected: FAIL because the lock schema and tool literal do not exist.

- [ ] **Step 2: Extend the typed lock and state**

Add this JSON section beside `improve` in `tools.lock.json` and the equivalent `ToolLock` type/validation in `src/tool-lock.ts`:

```json
"agentBrowser": {
  "source": "npm",
  "package": "agent-browser",
  "version": "0.31.1",
  "skill": {
    "source": "github",
    "repository": "vercel-labs/agent-browser",
    "ref": "afae698a51242166170b6fe4809dd57fe9f75798",
    "path": "skills/agent-browser",
    "skill": "agent-browser"
  }
}
```

Add `"agent-browser"` to `toolNames`, state defaults and reset fixtures. Set its default to `false`; retain every existing tool default as `true`.

Raise the global Node version floor from 18 to 24 in `package.json`, replace every installer `requireNode(18)` call with `requireNode(24)`, and run CI checks on Node 24. Update all contributor-facing prerequisite text from Node 22+ to Node 24+.

- [ ] **Step 3: Add flags, help and menu selection**

Add `--agent-browser-only` using `applyOnlyTool(arg, "agent-browser")`, and `--no-agent-browser` setting `state.tools["agent-browser"] = false`. Add a Clack choice after Frontend Skills with the hint `browser automation with a separate Chrome setup`; do not include it in All-tools behavior. Document both flags in `usage()`.

- [ ] **Step 4: Implement the minimal installer**

Create `src/installers/agent-browser.ts` with this operational sequence:

```ts
export function installAgentBrowser(): boolean {
  step("Agent Browser");
  console.log("   Browser automation CLI with a pinned skill and Chrome for Testing");
  requireNode(18);
  requireCommand("npm");
  requireCommand("npx");
  requireCommand("git");

  if (!run("npm", ["install", "--global", state.agentBrowserPackage]).ok) return false;
  if (!run("agent-browser", ["install"]).ok) return false;
  return installPinnedAgentBrowserSkill();
}
```

Resolve the copied skill directory as `path.join(clonedRepo, source.path)`, validate its existence before running Agent Skills CLI, and generalize `installSkillsCliSources` with an optional per-source `path`. Do not pass `--with-deps` and do not invoke plugin, cloud, credential, state or MCP commands. Wire `installAgentBrowser()` into `runInstaller()` after Frontend Skills.

- [ ] **Step 5: Write installer-command tests and verify red/green**

Extend `tests/unit/installers.test.ts` to assert, in order, an exact npm package spec, `agent-browser install`, clone of the locked repository, checkout of the locked SHA and Agent Skills CLI `--skill agent-browser --copy` call. Stub `capture("git", ...)` to return the pinned ref, matching existing tests.

Run: `rtk pnpm vitest run tests/unit/installers.test.ts`

Expected before implementation: FAIL because `installAgentBrowser` is not exported. Expected after implementation: PASS.

- [ ] **Step 6: Add readiness status and doctor coverage**

Add an Agent Browser detection that calls only `agent-browser --version` when the executable is present. Map a missing executable to `missing`; map a detected executable to `installed` and include the non-mutating setup hint `Run agent-browser doctor to validate Chrome/browser setup.` Do not call `agent-browser doctor` from the toolkit.

Add `toolDisplayName` and `toolLabel` cases, then extend the doctor fixture and test to assert:

```ts
{
  kind: "tool",
  name: "Agent Browser",
  message: "Agent Browser is selected but missing from PATH.",
}
```

Run: `rtk pnpm vitest run tests/unit/doctor.test.ts tests/unit/status.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the tool implementation**

```bash
git add tools.lock.json src tests/unit
git commit -m "feat: add agent browser installer"
```

### Task 3: Document and exercise the public opt-in workflow

**Files:**

- Modify: `README.md`
- Modify: `tests/test-agent-toolkit.sh`
- Test: `tests/test-agent-toolkit.sh`

**Interfaces:**

- Consumes: the `--agent-browser-only` flag, pinned values in `tools.lock.json`, fake command harness in the integration test.
- Produces: a documented, dry-run-safe Agent Browser option with mocked end-to-end coverage.

- [ ] **Step 1: Write failing shell assertions for public behavior**

Add `agent-browser.ts` to the source-module inventory. Add `--agent-browser-only` and `--no-agent-browser` to the help expectations. Make the fake `npm` log package installation and add a fake `agent-browser` command that implements `--version`, `install`, and `doctor --json` without downloading Chrome.

Add these checks:

```bash
grep -Fq -- "agent-browser@0.31.1" "$NPM_LOG"
grep -Fxq -- "install" "$AGENT_BROWSER_LOG"
grep -Fq -- "--skill agent-browser" "$NPM_LOG"
```

Run: `rtk pnpm run test:integration`

Expected: FAIL until the CLI command and integration fixture are wired.

- [ ] **Step 2: Document the opt-in contract**

Update the README's install table, commands, CLI reference, lock table and maintenance notes. Include:

```bash
npx -y @ranimontagna/agent-toolkit --agent-browser-only --codex
```

State that it installs the pinned CLI, provisions Chrome for Testing, copies its matching agent skill, is intentionally excluded from `--all`, never auto-installs Linux system dependencies, and should not receive credentials/plugins/cloud-browser configuration from this toolkit.

- [ ] **Step 3: Verify integration and release gate**

Run: `rtk pnpm run test:integration`

Expected: exit code 0 with the mocked Agent Browser install and doctor workflow.

Run: `rtk pnpm run check`

Expected: Biome, typecheck, unit tests, build, compiled JavaScript syntax checks, Bash syntax checks and integration test all exit 0.

- [ ] **Step 4: Refresh the graph and commit**

Run: `rtk graphify update .`

Expected: graph update completes; include its generated changes only if tracked by the repository policy.

```bash
git add README.md tests/test-agent-toolkit.sh
git commit -m "docs: document agent browser setup"
```

## Self-Review

- Spec coverage: Task 1 repairs the known baseline; Task 2 adds pinning, opt-in selection, installation, skill copying, error handling and doctor status; Task 3 covers docs, integration and full verification.
- Placeholder scan: no TODO/TBD or deferred implementation references remain.
- Type consistency: `agentBrowserPackage`, `agentBrowserSkillSource`, `installAgentBrowser`, and the `"agent-browser"` ToolName are used consistently across all tasks.
