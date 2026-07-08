# React Doctor External Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add React Doctor as a pinned external frontend agent skill installed through the existing `frontend-skills` flow.

**Architecture:** Keep `tools.lock.json` as the source of truth and extend the existing pinned frontend skill list. The existing `src/installers/frontend-skills.ts` clone-and-install loop remains unchanged; React Doctor is added by lock metadata, state wiring, tests, and documentation. Spec: `docs/superpowers/specs/2026-07-08-react-doctor-external-skill-design.md`.

**Tech Stack:** TypeScript CLI, Vitest unit tests, Bash integration test, Agent Skills CLI `skills@1.5.13`, pinned GitHub source `millionco/react-doctor#aa519e5f5505105ef8c00e1b1972c98514f7577a`.

## Global Constraints

- Do not vendor React Doctor files into `skills/`.
- Do not run `react-doctor install`.
- Do not create `.github/workflows`, Git hooks, or project CI files.
- Preserve upstream license wording as "Modified MIT License".
- Keep external source versions in `tools.lock.json`.
- Use Conventional Commits.
- Run `graphify update .` after code changes only when `graphify-out/graph.json` exists.
- Final verification command: `rtk pnpm run check`.

---

## File Structure

```
tools.lock.json                         # Add pinned React Doctor source under tools.frontendSkills
src/tool-lock.ts                        # Type and validate the new lock entry
src/state.ts                            # Expose React Doctor through state.frontendSkillSources
src/lock-update.ts                      # Include React Doctor in --update-lock reporting
tests/unit/tool-lock.test.ts            # Lock loading/validation coverage
tests/unit/state.test.ts                # Frontend source state coverage
tests/unit/lock-update.test.ts          # Update report coverage
tests/test-agent-toolkit.sh             # Integration expectations for clone + skills add + README provenance
README.md                               # User-facing docs and provenance
```

No new installer file is required. `src/installers/frontend-skills.ts` already loops over `state.frontendSkillSources`.

---

### Task 1: Lock React Doctor Source

**Files:**
- Modify: `tests/unit/tool-lock.test.ts`
- Modify: `tools.lock.json`
- Modify: `src/tool-lock.ts`

**Interfaces:**
- Consumes: existing `ToolLock` shape and `loadToolLock(lockPath)`.
- Produces: `lock.tools.frontendSkills.reactDoctor` with `{ source: "github"; repository: string; ref: string; skill: string }`.

- [ ] **Step 1: Write the failing lock-load assertion**

Add this assertion in `tests/unit/tool-lock.test.ts`, inside `loads pinned external tool sources from tools.lock.json`, after the `tasteSkill` assertion:

```ts
    expect(lock.tools.frontendSkills.reactDoctor).toEqual({
      source: "github",
      repository: "millionco/react-doctor",
      ref: "aa519e5f5505105ef8c00e1b1972c98514f7577a",
      skill: "react-doctor",
    });
```

- [ ] **Step 2: Run the targeted test and verify red**

Run:

```bash
rtk pnpm exec vitest run tests/unit/tool-lock.test.ts -t "loads pinned external tool sources"
```

Expected failure:

```text
expected undefined to deeply equal { source: 'github', repository: 'millionco/react-doctor', ... }
```

- [ ] **Step 3: Add React Doctor to `tools.lock.json`**

Add this object under `tools.frontendSkills`, after `tasteSkill`:

```json
      "reactDoctor": {
        "source": "github",
        "repository": "millionco/react-doctor",
        "ref": "aa519e5f5505105ef8c00e1b1972c98514f7577a",
        "skill": "react-doctor"
      }
```

- [ ] **Step 4: Update the `ToolLock` type**

In `src/tool-lock.ts`, add a `reactDoctor` property beside `impeccable` and `tasteSkill`:

```ts
      reactDoctor: {
        source: "github";
        repository: string;
        ref: string;
        skill: string;
      };
```

- [ ] **Step 5: Update frontend skill validation**

Change the validation loop in `src/tool-lock.ts` from:

```ts
  for (const skillName of ["impeccable", "tasteSkill"] as const) {
```

to:

```ts
  for (const skillName of [
    "impeccable",
    "tasteSkill",
    "reactDoctor",
  ] as const) {
```

- [ ] **Step 6: Run the targeted test and verify green**

Run:

```bash
rtk pnpm exec vitest run tests/unit/tool-lock.test.ts -t "loads pinned external tool sources"
```

Expected: 1 test passed.

- [ ] **Step 7: Commit**

```bash
git add tests/unit/tool-lock.test.ts tools.lock.json src/tool-lock.ts
git commit -m "feat: lock React Doctor frontend skill"
```

---

### Task 2: Report React Doctor Lock Updates

**Files:**
- Modify: `tests/unit/lock-update.test.ts`
- Modify: `src/lock-update.ts`

**Interfaces:**
- Consumes: `ToolLock.tools.frontendSkills.reactDoctor`.
- Produces: `LockUpdateItem` with `name: "React Doctor"`.

- [ ] **Step 1: Write the failing update-report test**

Add this fixture entry in `tests/unit/lock-update.test.ts`, under `frontendSkills`, after `tasteSkill`:

```ts
      reactDoctor: {
        source: "github",
        repository: "millionco/react-doctor",
        ref: "f".repeat(40),
        skill: "react-doctor",
      },
```

Add this expected item to the `arrayContaining` assertion:

```ts
        expect.objectContaining({
          name: "React Doctor",
          current: "f".repeat(40),
          latest: "e".repeat(40),
          status: "update-available",
        }),
```

- [ ] **Step 2: Run the targeted test and verify red**

Run:

```bash
rtk pnpm exec vitest run tests/unit/lock-update.test.ts
```

Expected failure:

```text
expected [...] to equal ArrayContaining [...]
```

The missing item should be the React Doctor update report entry.

- [ ] **Step 3: Add React Doctor to `buildLockUpdateReport`**

In `src/lock-update.ts`, add this `collectItem` block after the Taste Skill block:

```ts
    collectItem(
      {
        name: "React Doctor",
        source: "github",
        current: lock.tools.frontendSkills.reactDoctor.ref,
      },
      () =>
        latestGitHubCommit(
          lock.tools.frontendSkills.reactDoctor.repository,
          resolvedClients,
        ),
    ),
```

- [ ] **Step 4: Run the targeted test and verify green**

Run:

```bash
rtk pnpm exec vitest run tests/unit/lock-update.test.ts
```

Expected: 1 test passed.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/lock-update.test.ts src/lock-update.ts
git commit -m "feat: report React Doctor lock updates"
```

---

### Task 3: Install React Doctor Through Frontend Skills

**Files:**
- Modify: `tests/unit/state.test.ts`
- Modify: `tests/test-agent-toolkit.sh`
- Modify: `src/state.ts`

**Interfaces:**
- Consumes: `toolLock.tools.frontendSkills.reactDoctor`.
- Produces: `state.frontendSkillSources` entry:
  `{ label: "React Doctor", repository: "millionco/react-doctor", ref: "aa519e5f5505105ef8c00e1b1972c98514f7577a", skill: "react-doctor" }`.

- [ ] **Step 1: Write the failing state test**

Change the import in `tests/unit/state.test.ts`:

```ts
import { normalizeScope, splitList, state } from "../../src/state.js";
```

Add this test case:

```ts
  it("exposes React Doctor as a pinned frontend skill source", () => {
    expect(state.frontendSkillSources).toEqual(
      expect.arrayContaining([
        {
          label: "React Doctor",
          repository: "millionco/react-doctor",
          ref: "aa519e5f5505105ef8c00e1b1972c98514f7577a",
          skill: "react-doctor",
        },
      ]),
    );
  });
```

- [ ] **Step 2: Run the targeted state test and verify red**

Run:

```bash
rtk pnpm exec vitest run tests/unit/state.test.ts
```

Expected failure:

```text
expected [ ...Impeccable, ...Taste Skill ] to equal ArrayContaining [...]
```

- [ ] **Step 3: Add integration assertions before implementation**

In `tests/test-agent-toolkit.sh`, add this assertion after the Taste Skill `skills add` assertion:

```bash
if ! grep -Eq -- "-y skills@1\\.5\\.13 add .+ --skill react-doctor --agent claude-code --agent codex --agent opencode --agent gemini-cli --agent antigravity --global -y --copy" "$NPM_LOG"; then
  echo "Expected external frontend skill installer to install React Doctor for selected runtimes" >&2
  cat "$NPM_LOG" >&2
  exit 1
fi
```

Add this clone assertion after the Taste Skill clone assertion:

```bash
if ! grep -Fq -- "https://github.com/millionco/react-doctor.git" "$GIT_LOG"; then
  echo "Expected React Doctor source to be cloned before CLI installation" >&2
  cat "$GIT_LOG" >&2
  exit 1
fi
```

- [ ] **Step 4: Run integration and verify red**

Run:

```bash
rtk pnpm run test:integration
```

Expected failure:

```text
Expected external frontend skill installer to install React Doctor for selected runtimes
```

- [ ] **Step 5: Add React Doctor to state**

In `src/state.ts`, append this entry to `frontendSkillSources` after Taste Skill:

```ts
    {
      label: "React Doctor",
      repository: toolLock.tools.frontendSkills.reactDoctor.repository,
      ref: toolLock.tools.frontendSkills.reactDoctor.ref,
      skill: toolLock.tools.frontendSkills.reactDoctor.skill,
    },
```

- [ ] **Step 6: Run targeted state test and integration test**

Run:

```bash
rtk pnpm exec vitest run tests/unit/state.test.ts
rtk pnpm run test:integration
```

Expected: state test passes; integration test logs React Doctor clone and `skills add` calls and exits 0.

- [ ] **Step 7: Commit**

```bash
git add tests/unit/state.test.ts tests/test-agent-toolkit.sh src/state.ts
git commit -m "feat: install React Doctor frontend skill"
```

---

### Task 4: Document React Doctor Provenance

**Files:**
- Modify: `tests/test-agent-toolkit.sh`
- Modify: `README.md`

**Interfaces:**
- Produces README documentation that identifies React Doctor as an external pinned frontend skill with "Modified MIT License" provenance and no automatic CI setup.

- [ ] **Step 1: Write failing README assertions**

In `tests/test-agent-toolkit.sh`, after the existing README one-command install assertion, add:

```bash
for expected_readme in \
  "React Doctor" \
  "millionco/react-doctor" \
  "Modified MIT License" \
  "agent skill integration, not automatic CI setup"; do
  if ! grep -Fq -- "$expected_readme" "$ROOT_DIR/README.md"; then
    echo "Expected README to document React Doctor detail: $expected_readme" >&2
    exit 1
  fi
done
```

- [ ] **Step 2: Run integration and verify red**

Run:

```bash
rtk pnpm run test:integration
```

Expected failure:

```text
Expected README to document React Doctor detail: React Doctor
```

or the first missing React Doctor documentation string.

- [ ] **Step 3: Update the README overview**

Update the README "What It Installs" and frontend skill prose so "Frontend Skills" names Impeccable, Taste Skill, and React Doctor as third-party skills installed externally through Agent Skills CLI.

Use wording equivalent to:

```md
| Frontend Skills | Third-party frontend skills installed through Agent Skills CLI: Impeccable, Taste Skill and React Doctor |
```

- [ ] **Step 4: Update README provenance sections**

Change the paragraph near the bundled Custom Skills section from:

```md
Other third-party frontend design skills such as Impeccable and Taste Skill are
not vendored as bundled Custom Skills. The `frontend-skills` tool installs them
externally through the Agent Skills CLI from pinned public sources.
```

to:

```md
Other third-party frontend skills such as Impeccable, Taste Skill and React
Doctor are not vendored as bundled Custom Skills. The `frontend-skills` tool
installs them externally through the Agent Skills CLI from pinned public
sources. React Doctor is installed as an agent skill integration, not automatic
CI setup.
```

Update the locked external tools table row for Frontend Skills to include React Doctor:

```md
| Frontend Skills | `skills@1.5.13`, `pbakaus/impeccable`, `Leonxlnx/taste-skill` and `millionco/react-doctor` at pinned commits | Clones pinned refs before install |
```

Add a provenance line near the bundled third-party skills/provenance notes:

```md
React Doctor is installed externally from `millionco/react-doctor` at a pinned
commit and is documented upstream under a Modified MIT License; it is not copied
into this repository.
```

- [ ] **Step 5: Run integration and verify green**

Run:

```bash
rtk pnpm run test:integration
```

Expected: integration test passes and README assertions pass.

- [ ] **Step 6: Commit**

```bash
git add tests/test-agent-toolkit.sh README.md
git commit -m "docs: document React Doctor frontend skill"
```

---

### Task 5: Full Verification And Graph Maintenance

**Files:**
- Modify only if previous tasks reveal formatting issues in changed files.

**Interfaces:**
- Consumes: all prior task changes.
- Produces: verified working repository with updated graph cache when present.

- [ ] **Step 1: Run full check**

Run:

```bash
rtk pnpm run check
```

Expected:

```text
biome check .
...
Test Files  12 passed
Tests  35 passed
...
tests/test-agent-toolkit.sh exits 0
```

The exact test count may be higher if tasks add additional assertions. Exit code must be 0.

- [ ] **Step 2: Update Graphify cache when present**

Run:

```bash
if test -f graphify-out/graph.json; then
  rtk graphify update .
fi
```

Expected on this checkout today: no output because `graphify-out/graph.json` is absent. If the graph exists in a future checkout, the command must exit 0 or the graph update error must be reported.

- [ ] **Step 3: Inspect final diff**

Run:

```bash
git status --short
git diff --stat HEAD
git diff -- tools.lock.json src/tool-lock.ts src/state.ts src/lock-update.ts tests/unit/tool-lock.test.ts tests/unit/state.test.ts tests/unit/lock-update.test.ts tests/test-agent-toolkit.sh README.md
```

Expected: only React Doctor integration changes are present. No `skills/react-doctor` directory, no `.github/workflows` file, and no Git hook file is added.

- [ ] **Step 4: Commit any verification-only corrections**

If formatting or test corrections were needed after the task commits:

```bash
git add <changed-files>
git commit -m "fix: stabilize React Doctor skill integration"
```

If no correction files remain, do not create an empty commit.

---

## Self-Review

- Spec coverage: pinned source in Task 1, installer path in Task 3, no vendoring and no CI setup in Global Constraints and Task 5, lock update reporting in Task 2, docs/provenance in Task 4, full verification in Task 5.
- Placeholder scan: no incomplete sections, no deferred implementation markers, no unspecified commands.
- Type consistency: `reactDoctor` is the lock key everywhere, while installed skill name remains `react-doctor`.
- Scope check: this plan does not add standalone CLI installation, flags, GitHub Actions, hooks, or vendored upstream files.
