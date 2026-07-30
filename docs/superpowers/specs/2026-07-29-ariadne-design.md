# Ariadne Design

## Goal

Add Ariadne to Agent Toolkit as a native, cross-platform autonomous coding
loop. Ariadne repeatedly starts a fresh coding-agent process, gives it one
well-scoped story, validates the result outside the agent, commits successful
work, and continues until the PRD is complete or a deterministic stop
condition is reached.

Ariadne must run with every CLI runtime supported by Agent Toolkit: Claude
Code, Codex CLI, OpenCode, Gemini CLI, and Antigravity CLI.

## Name and Provenance

Ariadne is named for the thread that led through the labyrinth. In this design,
the PRD is the labyrinth, each story advances along the route, each agent starts
with fresh context, and Git plus Ariadne's progress files preserve the thread
between iterations.

Ariadne is an original multi-runtime implementation inspired by the Ralph
pattern. Documentation and bundled companion skills must credit
`snarktank/ralph`, its MIT license, and the reviewed upstream commit
`6c53cb0b831ebe8739c6a003e22af14902d8b0b5`. The toolkit must not present
Ariadne as the official Ralph implementation.

The existing private Helix repository is the validated Claude-only predecessor.
It remains available as a migration reference until Ariadne completes a real
end-to-end run. Archiving Helix is a follow-up operation, not part of the
Ariadne implementation commit.

## User-Facing Command

Ariadne is a native subcommand of the existing package:

```bash
agent-toolkit ariadne <command>
```

The same surface must work without a global installation:

```bash
npx -y @ranimontagna/agent-toolkit ariadne <command>
```

The initial command set is:

- `ariadne init`
- `ariadne run`
- `ariadne status`
- `ariadne doctor`

Adding a separate `ariadne` npm package or top-level executable is out of
scope. The internal boundaries must permit a future extraction without
requiring it now.

## Project Layout

Ariadne owns a single project-local directory:

```text
.ariadne/
├── config.json
├── prd.json
├── progress.md
├── lock
├── runs/
└── archive/
```

The following files are durable and versionable:

- `.ariadne/config.json`
- `.ariadne/prd.json`
- `.ariadne/progress.md`

The following paths are machine-local and must be added to `.gitignore` by
`ariadne init`:

- `.ariadne/lock`
- `.ariadne/runs/`

Archived imported PRDs are durable source records and remain versionable.
Raw run output is never added to Git automatically.

## Command Behavior

### `ariadne init`

`init` prepares the current Git repository without starting an agent. It must:

1. require execution inside a Git worktree;
2. create the `.ariadne/` layout with atomic file writes;
3. import a root `prd.json` when one exists;
4. accept both the Ralph `userStories` shape and the Helix `stories` shape;
5. preserve an unmodified copy of an imported PRD below `.ariadne/archive/`;
6. normalize imported stories into the Ariadne schema;
7. detect installed runtime CLIs;
8. detect conventional quality-check commands from project metadata;
9. confirm interactive choices before writing `config.json`;
10. update `.gitignore` only with the two machine-local Ariadne entries.

`init` must not delete, rename, or mutate the original root `prd.json`. In a
non-interactive terminal, runtime and quality checks must be supplied through
flags or already exist in a valid Ariadne configuration.

### `ariadne run`

`run` starts the autonomous loop. Supported options include:

```text
--runtime claude|codex|opencode|gemini|antigravity
--max-iterations <positive integer>
--max-runtime <positive duration>
--dry-run
--json
```

Autonomy is part of the command's contract. A normal `run` uses each runtime's
non-interactive, auto-approved execution mode without requiring a redundant
`--autonomous` flag. `--dry-run` resolves and prints the project, story,
runtime, prompt path, sanitized invocation, checks, and stop limits without
starting an agent or mutating Ariadne state.

Without `--max-iterations`, Ariadne continues until the PRD completes, a story
becomes blocked, the configured runtime budget expires, the user interrupts,
or a structural error occurs. The per-story attempt limit prevents an
unbounded failure loop.

### `ariadne status`

`status` is read-only and reports:

- project and configured branch;
- selected runtime and detected version;
- completed, active, pending, and blocked story counts;
- current story and attempt number;
- last run identifier, duration, and outcome;
- consecutive failures;
- worktree cleanliness;
- lock ownership or stale-lock state;
- paths to the progress file and local logs.

`--json` emits a versioned, machine-readable object and no decorative output.

### `ariadne doctor`

`doctor` is read-only and validates:

- Git repository and worktree state;
- Ariadne schema versions and required files;
- configured branch and current branch;
- runtime executable, version, headless flags, and locally detectable auth;
- resolved quality-check commands;
- lock validity;
- state consistency after interruption;
- required `.gitignore` entries.

Authentication checks must remain local and free of model calls. If a runtime
does not expose a local auth probe, Doctor reports authentication as
`unverified` rather than spending credits or claiming readiness.

## Runtime Detection

Runtime selection follows this deterministic order:

1. an explicit `--runtime` option;
2. the runtime stored in `.ariadne/config.json`;
3. the only installed and healthy supported runtime;
4. the toolkit's global preferred runtime when it is installed and healthy;
5. an interactive selection when multiple healthy choices remain;
6. an actionable ambiguity error in a non-interactive terminal.

After an interactive choice, Ariadne saves the project preference. An explicit
`--runtime` overrides that preference for the current run but does not rewrite
configuration unless the user separately updates the project configuration.

Detection distinguishes these states:

- unavailable: executable not found;
- incompatible: executable found but required headless capabilities missing;
- unverified: executable and flags found but local auth readiness unavailable;
- healthy: executable, version, capabilities, and local readiness checks pass.

An `unverified` runtime may be selected explicitly. Automatic selection prefers
`healthy` runtimes and uses `unverified` only when it is the sole available
candidate.

## Architecture

Ariadne is split into five independently testable units:

1. **CLI layer** parses commands and renders human or JSON output.
2. **Core loop** selects stories, advances state, enforces stop conditions, and
   coordinates checks and commits.
3. **Runtime adapters** detect one CLI and construct or interpret its process
   invocation.
4. **State layer** validates schemas, imports legacy PRDs, writes files
   atomically, and records attempts.
5. **Process runner** starts child processes, streams and captures output,
   handles timeouts and signals, and returns normalized results.

The core loop must not contain runtime-specific flags. Runtime adapters expose
one shared contract equivalent to:

```ts
interface AriadneRuntimeAdapter {
  detect(): RuntimeDetection;
  doctor(): RuntimeDiagnostic;
  buildInvocation(context: IterationContext): AgentInvocation;
  interpretResult(result: ProcessResult): AgentOutcome;
}
```

Each unit receives dependencies explicitly. Core tests use fake Git, process,
clock, filesystem, and runtime ports where isolation is required.

## PRD Schema

The canonical `.ariadne/prd.json` shape is:

```json
{
  "schemaVersion": 1,
  "project": "agent-toolkit",
  "branchName": "ariadne/multi-runtime-loop",
  "description": "Add the Ariadne autonomous loop",
  "userStories": [
    {
      "id": "US-001",
      "title": "Create the loop core",
      "description": "As a maintainer, I want a deterministic loop core so that every runtime follows the same lifecycle.",
      "acceptanceCriteria": [
        "Select exactly one pending story per iteration",
        "Stop after three consecutive failures for the same story"
      ],
      "priority": 1,
      "status": "pending",
      "attempts": 0
    }
  ]
}
```

Allowed story statuses are `pending`, `in_progress`, `completed`, and
`blocked`. Valid transitions are:

```text
pending -> in_progress
in_progress -> completed
in_progress -> blocked
in_progress -> in_progress
```

The final transition represents a recoverable failed attempt. Ariadne selects
the lowest numeric priority first and uses original array order as the stable
tie-breaker. Story identifiers must be unique and non-empty.

Ralph imports map `passes: true` to `completed` and `passes: false` to
`pending`. Helix imports first rename `stories` to `userStories` and then apply
the same mapping. Missing priorities use one-based source order. Import errors
must name the exact invalid JSON path and leave existing files unchanged.

## Configuration Schema

`.ariadne/config.json` is versioned independently from the PRD:

```json
{
  "schemaVersion": 1,
  "runtime": "codex",
  "qualityChecks": [
    "pnpm run lint",
    "pnpm run typecheck",
    "pnpm test"
  ],
  "maxAttemptsPerStory": 3
}
```

`maxAttemptsPerStory` defaults to `3` when omitted. Quality checks execute in
array order from the repository root and stop at the first non-zero exit. At
least one quality check is required before a non-dry run. Runtime-specific
model overrides and arbitrary environment injection are out of scope for the
initial release.

## Iteration Lifecycle

Each iteration follows the same transaction:

1. acquire the project lock;
2. validate state, branch, and worktree invariants;
3. select the active story or the highest-priority pending story;
4. atomically mark it `in_progress` and increment `attempts`;
5. create `.ariadne/runs/<run-id>/prompt.md` and attempt metadata;
6. start a fresh runtime process from the repository root;
7. capture stdout, stderr, exit status, timing, and signal information;
8. validate the agent-written structured result for every acceptance criterion;
9. run all configured quality checks outside the agent;
10. if successful, update PRD and progress, stage the complete clean-start
    delta, and create the Ariadne commit;
11. if unsuccessful, record the failure and leave the working diff available
    for the next fresh agent to repair;
12. release the lock and either continue or return the terminal outcome.

The core selects the story. The agent must not select another story, edit
`.ariadne/prd.json`, edit `.ariadne/progress.md`, or create commits. Its prompt
requires implementation of only the supplied story and creation of a result
file below the current ignored run directory.

The result file records:

- story identifier and run identifier;
- `completed` or `failed` outcome;
- one pass/fail entry per acceptance criterion;
- summary and files changed;
- checks attempted by the agent;
- reusable learnings;
- failure reason when applicable.

The result is evidence, not authority. Ariadne independently requires a
successful process, a valid result, all criteria reported as passed, and all
configured checks passing before completion.

## Git Ownership

Ariadne, not the runtime agent, owns commits. The initial run requires a clean
worktree so that Ariadne can safely attribute the resulting delta to the active
story.

Successful commits use:

```text
feat(ariadne): <story-id> <story-title>
```

The commit includes the implementation delta, completed PRD state, and durable
progress entry. Ariadne never pushes.

If commit creation fails after state was prepared, Ariadne restores the PRD
story to `in_progress` with an atomic file rewrite, records the commit failure,
and leaves the index and working tree intact for inspection or retry. It never
runs reset, checkout, clean, revert, or another destructive recovery command.

Failed attempts preserve their working diff. The next fresh agent receives the
same story plus the failure summary and is instructed to inspect and repair the
existing work. A blocked story also preserves its diff.

## Prompt and Durable Memory

Every iteration uses a runtime-neutral prompt generated at
`.ariadne/runs/<run-id>/prompt.md`. The process receives a short instruction to
read that file, avoiding large shell arguments, quoting differences, and stdin
behavior differences between CLIs.

The prompt contains:

- active story and acceptance criteria;
- repository root and Ariadne paths;
- relevant prior failure summary;
- configured quality checks;
- prohibition on commits and Ariadne state edits;
- result-file schema and exact destination;
- instruction to read applicable repository instructions;
- instruction to update nearby `AGENTS.md` only for genuinely reusable
  repository knowledge.

`AGENTS.md` is the portable durable instruction surface. Ariadne does not create
runtime-specific `CLAUDE.md`, `GEMINI.md`, or equivalent files. Completed
commits, `.ariadne/progress.md`, the PRD, and applicable `AGENTS.md` files form
the persistent thread between fresh contexts.

## Runtime Adapters

The initial adapter commands are based on the exact runtime versions in the
toolkit lock and must be represented as argument arrays rather than shell
strings:

| Runtime | Locked/version floor | Required autonomous headless mode |
| --- | --- | --- |
| Claude Code | `2.1.220` | `claude --print --dangerously-skip-permissions` |
| Codex CLI | `0.145.0` | `codex exec --dangerously-bypass-approvals-and-sandbox --ephemeral` |
| OpenCode | `1.18.8` | `opencode run --auto --dir <repository>` |
| Gemini CLI | `0.52.0` | `gemini --prompt <instruction> --approval-mode yolo --skip-trust` |
| Antigravity CLI | `1.1.8` minimum | `agy --print --dangerously-skip-permissions` |

Each adapter sets the repository root through the runtime's directory option
when one exists and otherwise launches the process with the repository as its
working directory. Model selection remains the user's runtime configuration.

Antigravity requires special capability validation because headless mode honors
permission and artifact-review policy. Ariadne uses a per-invocation bypass
supported by the compatible CLI version and must not rewrite the user's global
Antigravity settings. If the required bypass is absent, the adapter is
`incompatible`, even if `agy` itself is installed.

Runtime output formats may differ, but the ignored result file is the common
completion contract. Exit codes and structured output, when available, remain
additional diagnostic evidence.

## Locking, Interruption, and Recovery

The project lock stores Ariadne process identity, start time, and run
identifier. Lock creation must be exclusive. A second live process fails
without modifying state.

A lock is stale only when its recorded process is no longer alive on the local
machine. Stale-lock recovery preserves the lock contents in the current run's
diagnostics before replacing it. A stale lock with an `in_progress` story
resumes that story and does not consume a new attempt until a new runtime
process is actually started.

On `SIGINT` or `SIGTERM`, Ariadne forwards the signal to the child process,
waits a bounded grace period, escalates termination only when the child does
not exit, records interruption, and leaves the story `in_progress`. The next
run resumes it. Ariadne must not mark interrupted work complete.

## Stop Conditions and Exit Codes

Ariadne stops when:

- every story is `completed`;
- the active story reaches `maxAttemptsPerStory` and becomes `blocked`;
- an explicit iteration or runtime budget is reached;
- the user interrupts;
- state, Git, runtime, or process invariants fail.

The CLI uses stable exit classes:

- `0`: all stories completed, or a read-only command succeeded;
- `1`: incomplete because of a failed or blocked story;
- `2`: invalid usage or configuration;
- `3`: runtime unavailable, incompatible, or not ready;
- `4`: Git or state invariant failure;
- `130`: user interruption compatible with common shell conventions.

Machine-readable output includes the symbolic outcome in addition to the
numeric process code.

## Logs and Sensitive Output

Every attempt records local metadata, sanitized invocation, runtime version,
story, attempt, start and finish times, duration, process outcome, check
results, Git HEAD before and after, and paths to captured stdout and stderr.

Sanitization removes environment values and known credential-bearing command
arguments from rendered status. Ariadne never copies raw runtime output into
the durable progress file. `progress.md` contains only the validated summary,
changed-file list, check results, reusable learnings, and failure category.

Because agents may still print sensitive repository content, `.ariadne/runs/`
is always ignored and documentation warns users to treat local run logs as
sensitive.

## Companion Skills

Two first-party, runtime-neutral skills are bundled:

- `skills/workflow/ariadne-prd/`: create a PRD directly in the canonical
  Ariadne format or convert an existing requirements document;
- `skills/workflow/ariadne/`: explain initialization, Doctor, run, status,
  recovery, and migration workflows.

They install through the existing Custom Skills pipeline and therefore use the
same global and project-local target resolution for Claude Code, Codex,
OpenCode, Gemini, and Antigravity. Ariadne's loop does not require a skill to be
installed.

Each adapted skill includes an MIT attribution notice. The upstream identity,
reviewed commit, source paths, license, and content checksums are represented
in `tools.lock.json` and validated by the existing lock-loading boundary after
the schema is extended for Ariadne provenance.

## Testing Strategy

### Unit tests

Unit tests cover:

- valid and invalid Ariadne schemas;
- Ralph and Helix import mappings;
- atomic writes and import rollback;
- story ordering and every state transition;
- attempt limits and stop outcomes;
- runtime detection precedence and ambiguity;
- command construction for all five adapters;
- version and capability diagnostics;
- result-file validation;
- lock acquisition, live contention, stale recovery, and signal handling;
- quality-check sequencing;
- Git transaction and commit-failure recovery;
- human and JSON status output;
- stable exit-code mapping.

### Integration tests

Integration tests use a temporary Git repository, isolated home and runtime
configuration roots, and fake runtime executables. The compiled CLI is tested
against each adapter for:

- successful single-story completion and commit;
- multi-story ordering;
- failed check followed by repair;
- three failures followed by `blocked`;
- interruption and resume;
- ambiguous runtime detection;
- missing and incompatible runtimes;
- dirty initial worktree rejection;
- concurrent lock rejection;
- dry-run immutability;
- root Ralph import and Helix import;
- published package paths and companion skills.

No default test invokes a real model or requires external authentication.

### Optional authenticated smoke tests

Opt-in smoke tests run one minimal story with each locally installed and
authenticated runtime. They require an explicit environment gate, are excluded
from public CI, and verify current headless flags, result-file creation, checks,
and commit ownership. Failures identify adapter drift without weakening the
deterministic fake-runtime suite.

### Release gate

Implementation must pass the repository's full gate:

```bash
rtk pnpm run check
rtk pnpm run security
rtk graphify update .
```

Graphify output is refreshed only after implementation changes are complete.
The release is not considered validated until an `npm pack` inspection and a
temporary-directory `npx` smoke confirm the Ariadne command and companion skill
files are present.

## Success Criteria

Ariadne is ready when:

1. one canonical PRD can complete through each of the five fake-runtime
   adapters with identical state transitions;
2. opt-in real smoke passes for every authenticated CLI available to the
   maintainer;
3. runtime auto-detection and explicit override behave deterministically;
4. failed work never becomes a completed story or green commit;
5. interruption resumes the same story without discarding changes;
6. Ralph and Helix PRDs import without modifying their source files;
7. package, license, provenance, skills, docs, Doctor, and status surfaces are
   synchronized;
8. the complete repository release gate passes;
9. Ariadne completes one real multi-story project before the Helix repository
   is archived.

## Non-Goals

The initial release does not:

- run stories in parallel;
- use a server, database, queue, or remote orchestrator;
- push branches or open pull requests;
- resume a runtime conversation between iterations;
- select different runtimes per story;
- expose arbitrary runtime environment injection;
- manage model subscriptions, API keys, or authentication;
- discard, reset, revert, or clean failed work;
- replace Agent Platform's governed multi-agent orchestration use case;
- archive Helix automatically.

## Source References

- Ralph upstream: <https://github.com/snarktank/ralph>
- Ralph reviewed commit:
  `6c53cb0b831ebe8739c6a003e22af14902d8b0b5`
- Antigravity CLI permissions:
  <https://www.antigravity.google/docs/cli-permissions>
- Antigravity CLI reference:
  <https://antigravity.google/docs/cli/reference>
