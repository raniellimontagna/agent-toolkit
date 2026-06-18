# Security

Agent Toolkit installs tools and skills into local agent runtime directories, so
supply-chain changes need careful review.

## Reporting

Open a GitHub security advisory or a private issue with:

- affected version or commit;
- exact command used;
- affected runtime and install scope;
- relevant logs with secrets removed.

Do not paste tokens, private repository URLs or internal project names into
public issues.

## Project Controls

- repository dependencies are locked by `pnpm-lock.yaml`;
- external installer sources are pinned in `tools.lock.json`;
- mutable sources are blocked unless `--allow-mutable-sources` is explicit;
- CI runs lint, typecheck, tests, build, Gitleaks and dependency audit;
- npm releases use trusted publishing through GitHub Actions OIDC.
