# Task 11 Report — Companion Skills, Locked Provenance, and Documentation

## Status

Complete. Ariadne now ships two first-party companion skills through the
existing Custom Skills pipeline, validates immutable reviewed upstream
attribution in `tools.lock.json`, and documents the public autonomous workflow
for all five runtimes.

## RED

The implementation began by extending only the owning tests:

```bash
rtk pnpm exec vitest run tests/unit/tool-lock.test.ts tests/unit/skills-audit.test.ts
```

Observed result: 8 expected failures, 16 passes.

- `tools.ariadne` was absent from the lock.
- Mutated Ariadne provenance could not yet be validated because the catalog did
  not exist.
- `skills/workflow/ariadne/SKILL.md` and its notice were absent.
- `skills/workflow/ariadne-prd/SKILL.md` and its notice were absent.

The skill baseline pressure test, run before either skill existed, also exposed
behavioral gaps:

- it invented an incompatible `version/product/stories` PRD instead of the
  canonical schema-version-1 shape;
- it could not resolve whether runtime agents should commit;
- it did not know Ariadne's canonical state ownership;
- it treated quality-check placement and blocked recovery as ambiguous.

## GREEN and Refactor

The minimal implementation added:

- a required `ToolLock.tools.ariadne` record for `snarktank/ralph` at commit
  `6c53cb0b831ebe8739c6a003e22af14902d8b0b5`;
- exact MIT license, PRD skill, and Ralph skill paths and SHA-256 values;
- validation for GitHub source identity, full immutable ref, safe relative
  paths, SHA-256 shape, and exactly the required `prd` and `ralph` entries;
- `ariadne-prd`, which writes the exact canonical schema directly to
  `.ariadne/prd.json`, asks only unresolved material questions, preserves
  completed stories/IDs, sizes stories to one iteration, and keeps configured
  quality commands outside the PRD schema;
- `ariadne`, which documents `init`, `doctor`, `run`, `status`, autonomous
  default behavior, retries/blocking, recovery, and strict runtime-agent state
  and Git ownership;
- notices with repository, reviewed commit, MIT license, upstream paths, and
  corresponding hashes, without copying upstream prompts verbatim;
- public docs for quick start, architecture and non-goals, config defaults and
  flags, the five-runtime matrix, autonomous permissions, migration, recovery,
  logs, exit codes, tests, and attribution;
- an Unreleased changelog entry without version or release changes.

The GREEN pressure test reproduced the same scenarios with the skills loaded.
It selected the exact schema/location, one-iteration sizing, explicit
acceptance and configured quality evidence, all four commands, autonomous
default, three-attempt blocking, preserved-diff recovery, and the rule that a
runtime agent must not commit, push, or edit canonical PRD/progress state.
Refactoring then made the full executable name, no-push rule, material-question
boundary, and check-to-evidence mapping explicit.

## Files

- `skills/workflow/ariadne/SKILL.md`
- `skills/workflow/ariadne/NOTICE.md`
- `skills/workflow/ariadne-prd/SKILL.md`
- `skills/workflow/ariadne-prd/NOTICE.md`
- `tools.lock.json`
- `src/tool-lock.ts`
- `tests/unit/tool-lock.test.ts`
- `tests/unit/skills-audit.test.ts`
- `tests/unit/lock-update.test.ts`
- `README.md`
- `CHANGELOG.md`
- `docs/ARCHITECTURE.md`
- `docs/CONFIGURATION.md`
- `docs/GETTING-STARTED.md`
- `docs/TESTING.md`

`tests/unit/lock-update.test.ts` was the only integration exception to the
original file list: its strongly typed full-lock fixture required the new
mandatory record. The coordinator explicitly approved the minimal fixture
update instead of weakening `ToolLock.tools.ariadne` to optional.

## Verification

```text
Focused RED: 8 failed, 16 passed (expected missing implementation)
Focused GREEN: 2 files passed, 24 tests passed
Production build: passed
Compiled skills audit: 42 skills checked, 0 issues
Full pnpm run check: passed
  Biome: 99 files checked
  TypeScript: passed
  Vitest: 32 files passed, 330 tests passed
  Production build and generated JavaScript syntax: passed
  Shell syntax and integration suites: passed
git diff --check: passed
```

No default validation invoked a live model, required provider authentication,
or spent credits.

## Concerns and Boundaries

- A blocked story is deliberately recovered by a human editing its canonical
  status to `pending` or `in_progress`; there is no reset subcommand.
- Live provider/model behavior and packaged E2E coverage belong to Task 12 and
  were not added here.
- `tools.ariadne` is reviewed attribution metadata only. Normal Ariadne runs do
  not download or execute upstream content.
- The pre-existing dirty `.superpowers/sdd/task-5-report.md` was preserved and
  excluded from staging and commit.
- No push was performed.
