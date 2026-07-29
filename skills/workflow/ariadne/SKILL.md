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
| `agent-toolkit ariadne init` | Create or migrate `.ariadne/` state and configure runtime/checks. |
| `agent-toolkit ariadne doctor` | Diagnose Git, schema, lock, runtime, and quality-check readiness without running a story. |
| `agent-toolkit ariadne run` | Autonomously select and execute stories, verify them, and let Ariadne commit successful work. |
| `agent-toolkit ariadne status` | Report backlog counts, active story, branch, lock, latest run, and runtime health. |

Normal `run` is autonomous and mutates the repository. Use `run --dry-run` for
non-mutating inspection. Use `--runtime <claude|codex|opencode|gemini|antigravity>`
to choose explicitly, `--max-iterations <n>` or `--max-runtime <duration>` to
bound a run, and `--json` for machine-readable output.

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

## Retry and recovery

A failed process, result, criterion, check, or commit attempt is recorded in
`.ariadne/runs/` and `.ariadne/progress.md`. Ariadne preserves the story diff
and retries the same `in_progress` story. The default limit is three attempts;
exhaustion marks the story `blocked` and stops subsequent runs. Diagnose with
`doctor` and the latest run artifacts, repair the underlying problem, then have
the operator deliberately reset the story to `pending` or `in_progress` before
resuming. Never hide failures or discard the preserved diff to force progress.
