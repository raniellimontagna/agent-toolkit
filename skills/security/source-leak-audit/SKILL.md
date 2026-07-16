---
name: source-leak-audit
description: Use when checking an application, repository, build, or deployment for exposed source files, debug artifacts, backups, configuration, or secrets.
metadata:
  origin: Adapted from uphiago/recon-skills; first-party defensive rewrite.
  tags: security, source-leak, debug, secrets
---

# Source Leak Audit

Find accidentally published source and diagnostic artifacts while preserving
confidentiality. The audit proves exposure and location without collecting or
redistributing secret values.

## When to Use

- Reviewing a web deployment, static asset bucket, container image, or repo.
- Investigating `.env`, source maps, backups, debug pages, directory listings,
  stack traces, or exposed API documentation.

## Procedure

1. Establish the exact authorized asset and deployment scope.
2. Inspect repository ignore rules, build output, Docker layers, release
   artifacts, static hosting configuration, and server error handling.
3. Search source and generated files for filenames and patterns such as
   `.env`, `*.map`, `.git/`, `backup`, `debug`, `phpinfo`, private keys, and
   connection strings. Record file path and line number, not values.
4. For a controlled deployment, request only harmless metadata or a bounded
   prefix sufficient to prove the artifact exists. Stop when sensitive content
   is confirmed.
5. Check whether the exposed value is active using the owning team's approved
   rotation or revocation process. Do not use the credential to authenticate.
6. Verify remediation by removing the artifact, invalidating caches, rotating
   credentials, and confirming the safe response status.

## Evidence Gate

An accessible filename is not enough. Confirm the artifact contains relevant
source/configuration or that a debug response exposes meaningful internals.
Never include secret values, full cookies, private keys, or personal data in a
report, terminal output, issue, or model context.

## Report

Record asset, path, response/build location, data class, exposure window if
known, impact, containment action, and safe verification result. Use masked
examples such as `DATABASE_URL=postgres://***`.

## Do Not

- Clone or archive an exposed private repository.
- Download more content after confirming exposure.
- Test leaked credentials against any service.
- Treat a public client identifier as a secret without evidence of privilege.
