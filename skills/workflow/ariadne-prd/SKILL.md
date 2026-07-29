---
name: ariadne-prd
description: Use when turning product requirements, plans, or an existing backlog into an Ariadne schema version 1 PRD.
---

# Ariadne PRD

Create the smallest executable backlog that preserves the user's intent. Ask
questions only for requirements that remain unresolved after inspecting the
request and repository; do not re-ask answered questions or invent
product-critical behavior.

## Workflow

1. Read applicable repository instructions and inspect existing code, tests,
   `.ariadne/prd.json`, and `.ariadne/config.json` when present.
2. Resolve only material unknowns with focused questions. Do not write an
   affected story until its material requirement is resolved. If a reversible,
   low-risk assumption is enough, state it and continue.
3. Split work into independently testable stories that one runtime agent can
   implement and verify in one Ariadne iteration. Separate unrelated outcomes,
   migrations, and cross-subsystem changes.
4. Write valid JSON directly to `.ariadne/prd.json` at the repository root.
   Preserve completed stories and stable IDs when revising an existing PRD.
5. Confirm that `.ariadne/config.json` names the real repository quality checks.
   Use `agent-toolkit ariadne init --check <command>` to establish them; never
   add unsupported fields to the PRD schema.

## Required schema

```json
{
  "schemaVersion": 1,
  "project": "project-name",
  "branchName": "current-branch",
  "description": "Measurable project outcome",
  "userStories": [
    {
      "id": "US-001",
      "title": "Small independently verifiable outcome",
      "description": "What changes and why",
      "acceptanceCriteria": [
        "Observable pass/fail behavior",
        "Relevant automated test or quality evidence passes"
      ],
      "priority": 1,
      "status": "pending",
      "attempts": 0
    }
  ]
}
```

Every story needs non-empty, observable acceptance criteria. Include relevant
testing, lint, typecheck, build, security, compatibility, or migration evidence
without naming commands that the repository does not provide. Priorities are
positive integers; lower values run first. New stories start `pending` with
zero attempts.

## Quality gate

- `.ariadne/prd.json` uses only the schema fields above and schema version `1`.
- IDs are unique, branch and project are correct, and stories fit one iteration.
- `.ariadne/config.json.qualityChecks` contains at least one real command before
  a normal run.
- Story acceptance evidence identifies which configured checks prove the
  relevant behavior; repository-wide checks remain in config, not PRD fields.
- No implementation, status transition, commit, or push is performed while
  authoring the PRD.
