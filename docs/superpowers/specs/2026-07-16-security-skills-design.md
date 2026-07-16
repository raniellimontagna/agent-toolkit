# Defensive Security Skills Design

## Goal

Add a first-party `security` skill package based on selected ideas from
`uphiago/recon-skills`, adapted for authorized, non-destructive code and
application security reviews in Agent Toolkit's multi-runtime environment.

## Scope

Create six independent skills:

- `api-security-audit`
- `source-leak-audit`
- `cicd-security-audit`
- `cloud-misconfiguration-audit`
- `llm-agent-security-audit`
- `js-secrets-audit`

They will be bundled as ordinary local Custom Skills under `skills/security/`.
They will not install offensive tooling, execute mass scans, bypass controls,
exploit third parties, or load the upstream repository's `AGENTS.md`/`SOUL.md`.

## Design

Each skill follows the repository's existing Markdown skill format and includes
trigger conditions, authorized-scope boundaries, a review procedure, evidence
and false-positive gates, safe verification, and reporting guidance. Findings
must redact secret values and record only the minimum evidence needed to fix
the issue.

The upstream project is credited in `README.md` and `skills/security/NOTICE.md`.
The content is a first-party adaptation, not a verbatim vendored copy.

## Verification

The implementation must pass:

- `rtk pnpm exec tsx` is not assumed; use the repository's existing checks.
- `pnpm run skills-audit` is unavailable, so use the CLI audit command through
  the built artifact or the full `rtk pnpm run check` gate.
- `rtk graphify update .` when Graphify output is present and current.
- `rtk pnpm run check`.
