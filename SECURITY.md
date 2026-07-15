# Security

Agent Toolkit installs tools and skills into local agent runtime directories, so
supply-chain changes need careful review.

## Reporting

Email the maintainer at
[raniellimontagna@hotmail.com](mailto:raniellimontagna@hotmail.com) instead of
opening a public issue. Include:

- affected version or commit;
- exact command used;
- affected runtime and install scope;
- relevant logs with secrets removed.

Do not paste tokens, private repository URLs or internal project names into
public issues. The project does not define a response-time or remediation SLA.

## Dependency Integrity

Repository dependencies resolve through `pnpm-lock.yaml`, and CI installs them
with `--frozen-lockfile`. Dependency-audit jobs install with lifecycle scripts
disabled before running the moderate-or-higher audit. See
[Architecture](docs/ARCHITECTURE.md) for the CI boundary.

## External-Source Provenance

`tools.lock.json` is the source of truth for the external sources represented in
the lock. Package sources use exact versions, Git sources use full commits, and
RTK archives are checked against locked SHA-256 values. The RTK metadata URL may
select another non-latest tagged release in the locked repository, but the
downloaded archive must still pass the locked checksum.

Two installer paths are not content-pinned by the lock: Superpowers delegates to
runtime-native plugin or extension identifiers, and the official Antigravity
installer is identity-gated to an HTTPS URL but is not pinned by checksum or
commit. Source-identity changes, mutable versions, alternate lock files, and a
different Antigravity URL require the explicit `--allow-mutable-sources` opt-in;
that permission accepts the reviewed exception for one invocation rather than
making it immutable. See [Architecture](docs/ARCHITECTURE.md) and
[Configuration](docs/CONFIGURATION.md) for the complete boundaries.

## Network Bounds

Toolkit-owned HTTP fetch and download helpers share a 30-second total deadline,
allow at most five redirects, reject HTTPS downgrades, and enforce response-size
limits. Downloads use an exclusive partial file and become visible at the target
path only after a complete response. External package managers, Git, and
runtime-native plugin commands retain their own network behavior. See
[Architecture](docs/ARCHITECTURE.md#transport-and-filesystem-security).

## Filesystem Containment

Agent Skills checkouts verify the fetched commit and contain requested skill
roots inside the checkout. Toolkit-managed Custom Skill copies are staged before
replacement. Manifest-backed uninstall removes only recorded direct children of
recognized runtime roots after canonical-path and filesystem-identity checks;
containment failures preserve the manifest for review or retry. See
[Architecture](docs/ARCHITECTURE.md#manifest-and-lifecycle-boundary).

## CI Security Gates

CI runs the full lint, typecheck, unit, build, syntax, and integration gate on
Node.js 24. Separate jobs scan full Git history with Gitleaks, audit dependencies
without lifecycle scripts, and review pull-request dependency changes at
moderate severity or higher. Contributor commands and suite ownership are in
[Testing](docs/TESTING.md).

## npm Provenance

Tag-driven publication reruns the full gate, checks version and `main` ancestry,
and grants only read-only repository contents plus `id-token: write`. The publish
helper uses `npm publish --provenance --access public` and bounded registry
verification retries; the workflow does not use a long-lived npm token. npm-side
trusted-publisher setup and release recovery are documented in
[Deployment and Releases](docs/DEPLOYMENT.md). Released project history remains
available in the public [changelog](CHANGELOG.md).
