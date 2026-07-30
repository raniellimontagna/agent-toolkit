# Ariadne Final Fix 2 Report

## Outcome

This pass closes the requested runtime-boundary remediation on
`docs/ariadne-design` in implementation, tests, and operator documentation:

1. Ariadne-owned commits reject every case-folded machine-local artifact even
   when ignore rules, the shared index, hooks, or candidate-tree construction
   are hostile.
2. Runtime ownership of the certified ref/`HEAD`, PRD, and progress log remains
   enforceable across iterations and process invocations through a strict
   repository-root checkpoint plus durable quarantine.
3. Doctor accepts the deliberately preserved diff of an `in_progress` or
   `blocked` story but continues to reject unrelated initial dirtiness.
4. Retry, stop, and commit-failure evidence preserves useful validated result
   and check context after redacting secrets, paths, newlines, and oversized
   values; raw process output remains machine-local.

The pass also closes the bounded independent-review findings that exercised
the interactions among Git publication, runtime selection, lock release,
filesystem containment, and failure persistence. No documentation-only escape
hatch was used.

## Root Causes

### 1. Git publication trusted mutable surfaces too long

The earlier staging path did not provide one certified transaction spanning
the real index, literal worktree delta, candidate tree, explicit branch ref,
and post-publication state. Machine-local detection was incomplete under
case-variant spellings and did not reserve every descendant of `.ariadne/lock`.
Cleanup after a successful ref compare-and-swap could also throw and make a
valid publication appear to have failed.

### 2. Ownership certification ended with the process

In-memory snapshots caught mutations during one iteration but could not prove
what the previous coordinator process had certified. Runtime detection itself
could run before a canonical/ref baseline existed, and late mutations after a
successful iteration or during lock release could be accepted by a later
invocation as its starting state.

### 3. Recovery state and initial dirtiness were conflated

Doctor treated a dirty worktree as owned only by an `in_progress` story. Retry
exhaustion intentionally leaves the failed story diff in place while the story
becomes `blocked`, so that valid recovery state was being reported as unrelated
worktree dirtiness.

### 4. Failure evidence crossed the durable boundary inconsistently

Some retry and terminal paths fell back to generic messages after a validated
runtime result or partial check set was already available. Failure reasons and
check commands did not all pass through the same sanitization boundary. The
redactor also needed to cover complete Basic/Bearer authorization headers and
standalone provider-token forms, not only key/value assignments.

### 5. Late structural failures could escape quarantine

Lock-release and archive/run-directory interactions occur after untrusted
execution. A structural release failure could escape the same quarantine path
used by runtime ownership violations, stale-lock evidence could be published
through a mutable run-directory pathname, and a substituted archive path could
break unrelated post-runtime run writes.

## Implementation

### Artifact-safe exact-tree publication

- `AriadneGit` now copies the byte-certified shared Git index into an exclusive
  private index and stages only NUL-delimited literal project paths there.
- The complete real index, private index, and `HEAD` tree are scanned with
  case-folded path normalization. `.ariadne/lock` and every descendant,
  `.ariadne/runs/**`, both root quarantine files, and their temporary namespaces
  are reserved independently of `.gitignore` behavior.
- Effective ignore probes remain an invariant, but a runtime cannot make an
  artifact eligible merely by changing or negating ignore rules. Already
  tracked, force-staged, or candidate-tree-injected operational paths fail
  closed.
- Ariadne proves the private delta complete, writes one immutable candidate
  tree, creates the commit without repository hooks, and publishes only the
  certified fully qualified branch ref with an expected-old `update-ref`
  compare-and-swap.
- The shared index is certified before replacement. Ref, index, tree, and
  worktree are verified after publication. A late race causes a conditional ref
  rollback and original-index restore; a private-index unlink failure after all
  publication checks have succeeded cannot overturn the certified result.
- Filenames containing whitespace, newlines, or Git pathspec syntax remain
  literal. Ariadne never pushes, resets, cleans, reverts, or checks out over the
  preserved project diff.

### Persistent ownership checkpoint and quarantine

- `.ariadne-quarantine.checkpoint.json` is an ignored strict schema-v1 record
  containing the certified fully qualified ref, `HEAD`, run/story identity,
  timestamp, and PRD/progress device, inode, link-count, and SHA-256
  certificates.
- The first mutating run appends a versioned ownership marker to canonical
  progress. Once that marker exists, a missing or malformed checkpoint is an
  ownership violation rather than permission to establish a new baseline.
- The checkpoint is written immediately before untrusted execution and is
  refreshed only after coordinator-owned canonical transitions or a certified
  publication. It is checked before every later iteration and later mutating
  invocation.
- A mismatch writes `.ariadne-quarantine.json` with only strict sanitized
  certification metadata and the affected surfaces (`head`, `prd`, `progress`,
  or `operational`). `init`, normal run, and dry run refuse while quarantine is
  present; status and Doctor remain read-only for diagnosis. Ariadne never
  clears the marker automatically.
- Runtime selection is also inside the trust boundary. When canonical state
  exists, the CLI captures an in-memory ref/`HEAD` and canonical certificate
  before probing, passes both the selected detection and the certificate to the
  loop, and the loop validates it before mutation. Direct loop callers capture
  the equivalent baseline themselves. Dry-run remains byte-for-byte
  non-mutating while still detecting a probe-time ownership change.
- Two-run and two-iteration regressions prove that a late `HEAD` or progress
  mutation cannot be silently adopted by a fresh coordinator process.

### Filesystem and lock boundaries

- State, runs, active-run, lock-coordinator, public-lock, prompt/result, and
  stdout/stderr leaves use pinned containment and device/inode/link identities.
  Runtime and check output files are opened exclusively before child start and
  revalidated after execution.
- Lock ownership now includes an unguessable owner token. Conditional release
  cannot unlink a successor or operate through a replaced ancestor, and a
  structural release failure is converted into durable quarantine.
- Stale public-lock evidence is retained inside the pinned private
  `.ariadne/runs/.lock-coordinator` directory rather than linked through a
  mutable run path.
- Run writes no longer recreate or depend on `.ariadne/archive`; substituting
  the archive after runtime execution cannot redirect or suppress terminal run
  evidence.
- The repository-root quarantine and checkpoint use exclusive atomic writes
  and verified real root paths, so replacement of the `.ariadne` tree cannot
  hide the durable refusal state.

### Doctor recovery semantics

- Status exposes both active `in_progress` and current `blocked` story
  ownership.
- Doctor accepts a dirty worktree when either state legitimately owns the
  preserved repair diff.
- A dirty worktree with no active or blocked owner still emits the
  `dirty_worktree` error. Its regression fixture explicitly removes both
  possible owners before introducing unrelated dirtiness.

### Sanitized durable failure evidence

- Validated result summary, changed files, learnings, criteria count, check
  status/duration, outcome, category, and failure reason survive retry,
  blocking, interruption, budget exhaustion, and commit-failure paths.
- Every untrusted durable text value is newline-collapsed, limited to 500
  characters, and scrubbed for authorization headers, bearer/basic material,
  credential assignments, secret-bearing CLI flags, and standalone GitHub and
  OpenAI-style tokens.
- Check commands are sanitized and check log paths are reduced to basenames in
  machine-local JSON. Canonical progress never receives stdout/stderr contents
  or absolute log paths.
- Runtime adapter exceptions use coordinator-generated explanations that point
  to ignored logs; raw child stdout/stderr is not promoted into progress,
  retries, or later prompts.
- Structural persistence and release failures use the same quarantine routing
  rather than escaping after untrusted execution.

## Independent Review Closure

The bounded independent reviewer returned **NOT READY** before the final
corrections. Its closed finding set was:

| Finding | Correction and proof |
|---|---|
| Case-variant `.ARIADNE/LOCK/raw.json` bypass | Case-folded descendant rejection across real index, private index, and `HEAD`; real-Git regression added. |
| Certification did not persist across iterations/processes | Strict root checkpoint, canonical progress marker, two-iteration and next-invocation regressions. |
| Runtime probing preceded the ownership baseline | Pre-selection in-memory certificate validated before mutation; probe-mutation regression. |
| Post-CAS private-index cleanup could overturn publication | Cleanup cannot invalidate a fully verified commit; injected `EACCES` regression. |
| Late release/archive structural failures could escape quarantine | Release errors quarantine; run writes are archive-independent; dedicated regressions. |
| Basic/standalone secret forms could leak | Full authorization and provider-token redaction regressions. |

Earlier adversarial review findings for hook execution, pathspec magic,
run/output symlink or hard-link substitution, stale-lock publication, mutable
canonical recapture, and raw adapter exception text remain covered. Per the
final scope freeze, no second reviewer was opened after these corrections; the
claim here is bounded closure by the named regressions plus the full repository
gates, not a fabricated follow-up READY verdict.

## RED and GREEN Evidence

| Gate | Result |
|---|---|
| Initial task-focused RED | 13 expected failures with 68 passes. |
| First adversarial review RED | 5 expected failures with 81 passes; a standalone raw-adapter exception regression also failed before correction. |
| Final reviewer closed-set RED | 3 newly added boundary regressions failed before their implementation corrections. |
| Focused final GREEN | 156/156: 133 non-Git boundary tests plus 23 real-Git publication tests. |
| Ariadne-wide GREEN | 15 files, 251/251 tests. |
| Full repository GREEN | 32 files, 427/427 tests, followed by build, JS/shell syntax, legacy integration, compiled CLI E2E, installed-tarball E2E, and publish-retry tests. |

The final commands and observed results were:

- `pnpm exec biome check src/ariadne tests/unit/ariadne tests/ariadne-e2e.mjs`
  — 43 files checked, no findings.
- `pnpm exec tsc --noEmit --pretty false` — passed.
- `pnpm exec vitest run tests/unit/ariadne` — 15 files and 251 tests passed.
- `pnpm run check` — passed end to end; 32 files and 427 unit tests, compiled
  CLI E2E, installed-tarball E2E, and publication retry tests all passed.
- `pnpm audit --audit-level=moderate` — no known vulnerabilities.
- `pnpm run security:audit` — no known vulnerabilities.
- `git diff --check -- . ':(exclude).superpowers/sdd/task-5-report.md'` —
  passed.
- Targeted production scan for absolute user paths, private-key headers,
  cloud/provider token shapes, shell evaluation, destructive Git commands, and
  raw-output promotion — no production secret/path/dangerous-command hit;
  reviewed output references remain confined to certified ignored log leaves
  and sanitized evidence conversion.
- `rtk graphify update .` — passed; rebuilt 3,591 nodes, 5,374 edges, and 268
  communities. `graphify-out/` remains ignored. The existing zero-node warning
  for `tile.json` and `tools.lock.json` remains, and Graphify reported that
  semantic community labels can be refreshed separately.

## Files and Interfaces

- Git transaction: `src/ariadne/git.ts`.
- Persistent ownership: new `src/ariadne/ownership.ts`, plus
  `src/ariadne/store.ts`, `src/ariadne/cli.ts`, and `src/ariadne/loop.ts`.
- Operational containment: `src/ariadne/lock.ts`, `src/ariadne/process.ts`,
  `src/ariadne/checks.ts`, and store/loop integration.
- Recovery and rendering: `src/ariadne/status.ts`, `src/ariadne/doctor.ts`,
  `src/ariadne/render.ts`, and shared types.
- Evidence boundary: `src/ariadne/result.ts`, runtime adapter error mapping,
  and loop persistence paths.
- Public contract: `.gitignore`, init defaults, Architecture, Configuration,
  Getting Started, Testing, Changelog, and the bundled Ariadne workflow skill.
- Regression coverage: Ariadne Git, store, lock, process, result, loop,
  status/Doctor, CLI/init, runtime, compiled fixture, proxy, and E2E suites.

## Delivery Contract

- One Conventional Commit is created on `docs/ariadne-design`.
- No push is performed.
- `.superpowers/sdd/final-fix2-report.md` is force-added because the SDD report
  directory is intentionally ignored.
- The pre-existing modified `.superpowers/sdd/task-5-report.md` is excluded from
  staging and remains uncommitted.
- `.ariadne/lock`, coordinator/prompt/result/raw log artifacts, quarantine
  files, Graphify output, and other ignored SDD scratch files are excluded.
