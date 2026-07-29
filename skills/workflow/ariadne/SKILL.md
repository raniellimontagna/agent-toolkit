---
name: ariadne
description: Use when initializing, diagnosing, running, recovering, or inspecting an Agent Toolkit Ariadne autonomous coding loop.
---

# Ariadne

Ariadne is Agent Toolkit's runtime-neutral autonomous coding loop. The
orchestrator owns state transitions, quality checks, and commits; the selected
runtime agent implements one story at a time.

## Commands

| Command | Purpose |
| --- | --- |
| `agent-toolkit ariadne init` | Create or migrate `.ariadne/` state, auto-detect available checks, and configure a runtime when unambiguous. |
| `agent-toolkit ariadne doctor` | Diagnose Git, schema, lock, runtime, and quality-check readiness without running a story. |
| `agent-toolkit ariadne run` | Autonomously select and execute stories, verify them, and let Ariadne commit successful work. |
| `agent-toolkit ariadne status` | Report backlog counts, active story, branch, lock, latest run, and runtime health. |

Normal `run` is autonomous and mutates the repository. Use `run --dry-run` for
non-mutating inspection. Use `--runtime <claude|codex|opencode|gemini|antigravity>`
to override automatic runtime selection explicitly, `--max-iterations <n>` or
`--max-runtime <duration>` to bound a run, and `--json` for machine-readable
output. `run` first honors its explicit runtime, then a healthy configured
project runtime. An unverified, unavailable, or incompatible configured runtime
falls through to automatic selection: a single healthy candidate (or a sole
unverified candidate), a healthy global preference when set, an interactive
prompt when candidates remain ambiguous, or a non-interactive ambiguity error.

During `init`, Ariadne detects package quality checks automatically: it uses a
`check` script when present, otherwise it collects `lint`, `typecheck`, and
`test` scripts in that order. Repeated `--check` values replace those detected
checks. In a non-interactive project with no detected or explicit check, init
reports an error and requires `--check`.

## Safe operation

1. Start in the configured Git branch with the user's existing work preserved.
2. Run `doctor`; fix reported state, runtime, or quality-check errors.
3. Inspect `status`, then use `run --dry-run` before a first autonomous run.
4. Run normally only when the user accepts autonomous edits and commits.
5. Inspect `status` and `.ariadne/runs/<run-id>/` evidence after completion.

A runtime agent may edit project files and applicable `AGENTS.md` only for
genuinely reusable repository guidance. It must not create commits, push, or
edit `.ariadne/prd.json` or `.ariadne/progress.md`. Ariadne performs the
successful-story commit after its own acceptance and quality checks. Ariadne
never pushes and never resets,
reverts, cleans, checks out over changes, or discards a failed diff.

Before staging, Ariadne verifies that its lock, run coordinator, prompts,
results, and raw process streams are still effectively ignored and absent from
the tracked or staged index. It stages literal project paths, proves the full
project delta is represented, and publishes the exact certified tree on the
pre-runtime certified `HEAD` without running repository hooks. The state root,
runs root, run directory, lock coordinator, public lock, and operational files
must retain their captured filesystem identities. Output leaves must remain
present regular single-link files rather than symlinks or hard links. Ariadne
rechecks these boundaries immediately before staging and reference publication.
If a runtime breaks any boundary, Ariadne fails safely and leaves the project
diff available for deliberate recovery instead of risking an
operational-artifact commit.

## Retry and recovery

Failed processes, results, criteria, and checks are recorded in `.ariadne/runs/`
and `.ariadne/progress.md`. Validated result and check evidence is summarized
there with secrets and raw process output removed. Ariadne preserves the story
diff and retries the same `in_progress` story. The default limit is three
attempts; exhaustion marks the story `blocked` and stops subsequent runs. A
blocked story continues to own its preserved dirty diff, so `doctor` reports
that state without misclassifying it as unrelated work. Diagnose with `doctor`
and the latest run artifacts, repair the underlying problem, then have the
operator deliberately reset the story to `pending` or `in_progress` before
resuming.

A commit failure is different: Ariadne records it, restores the story to
`in_progress`, and preserves the worktree diff, original shared-index state,
and run progress for manual resolution and a deliberate resume. It does not automatically retry or block a
commit failure, and it never hides failures or discards the preserved diff to
force progress. If Git publication already succeeded, a later machine-local
summary-write failure is structural and does not roll the completed story back.

If a runtime changes the certified Git branch ref/`HEAD`, edits Ariadne's
canonical PRD/progress files, or breaks a pinned operational boundary, Ariadne
persists the repository-root `.ariadne-quarantine.json`. The ignored
`.ariadne-quarantine.checkpoint.json` persists the last certified ref/`HEAD`
and exact PRD/progress certificates, while a canonical progress marker makes
that checkpoint mandatory after execution begins. Later `init` and `run`
invocations validate the earlier ownership boundary before probing or state
mutation and fail closed when the checkpoint is missing, malformed, or
mismatched; `status` and `doctor` remain available. Restore the recorded
certified ref/`HEAD`, canonical files, and operational layout, inspect the
preserved evidence, and only then deliberately remove the quarantine marker
before running again.
