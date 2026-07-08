# React Doctor External Skill Design

**Date:** 2026-07-08
**Status:** Approved for written spec review

## Goal

Add React Doctor to Agent Toolkit as a pinned external frontend agent skill so
selected runtimes can learn and run React Doctor checks without vendoring the
upstream project or automatically changing application CI.

## Decision

Use the existing `frontend-skills` installer path. React Doctor will become a
third pinned source installed through Agent Skills CLI, alongside Impeccable and
Taste Skill.

The first integration pins `millionco/react-doctor` to commit
`aa519e5f5505105ef8c00e1b1972c98514f7577a` and installs the upstream
`react-doctor` skill from that checkout. The current npm package version at this
commit is `0.7.2`, but the toolkit integration should pin the Git source commit
because that matches the existing third-party skill model.

## Architecture

`tools.lock.json` remains the source of truth for external tool versions. Add a
`reactDoctor` entry under `tools.frontendSkills`, with the same shape used by
`impeccable` and `tasteSkill`: `source`, `repository`, `ref`, and `skill`.

`src/state.ts` will append React Doctor to `state.frontendSkillSources`, so the
existing `src/installers/frontend-skills.ts` loop clones the pinned repository
and runs:

```bash
npx -y skills@1.5.13 add <checkout> --skill react-doctor <agents> --copy
```

No new installer module is needed. Status, dry-run, and normal install output
should continue to describe the `frontend-skills` group as pinned external
skills, with counts automatically reflecting the new source.

## Behavior

When users select `frontend-skills`, the installer will install:

- Impeccable;
- Taste Skill;
- React Doctor.

React Doctor installs only as an agent skill for selected runtimes. The toolkit
must not run `react-doctor install`, must not create `.github/workflows`, and
must not add Git hooks. Project-level CI adoption remains a separate explicit
choice made inside each React repository.

## Licensing And Provenance

Do not copy React Doctor into `skills/`. The upstream repository uses a
"Modified MIT License", not plain MIT. README provenance must preserve that
wording and explain that the toolkit installs React Doctor externally from a
pinned public source.

This keeps the repository public-safe and aligned with the existing rule:
third-party skills stay on pinned public sources unless the license clearly
permits vendoring and attribution is preserved.

## Documentation

Update README references to third-party frontend skills so React Doctor appears
next to Impeccable and Taste Skill. The docs should state that React Doctor is an
agent skill integration, not automatic CI setup.

Update the locked external tools table and public-safe/provenance notes so a
reader can see:

- Agent Skills CLI version remains `skills@1.5.13`;
- React Doctor source is `millionco/react-doctor` at the pinned commit;
- license/provenance is "Modified MIT License";
- no code is vendored.

## Testing

Use TDD for installer behavior changes.

Focused tests should cover:

- `tools.lock.json` validation accepts the new `reactDoctor` source and still
  requires a full commit SHA;
- lock update reporting includes a React Doctor item;
- integration test expectations include a `skills add ... --skill react-doctor`
  call;
- README checks include React Doctor in the documented frontend skill set.

Full verification before completion:

```bash
rtk pnpm run check
```

## Out Of Scope

- Installing React Doctor CLI as a standalone toolkit binary.
- Adding `--react-doctor-only` or `--no-react-doctor` flags.
- Running React Doctor scans during Agent Toolkit install.
- Creating or updating GitHub Actions workflows.
- Installing project Git hooks.
- Vendoring upstream React Doctor skill files into this repository.
