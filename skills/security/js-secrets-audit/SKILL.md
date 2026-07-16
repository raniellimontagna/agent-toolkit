---
name: js-secrets-audit
description: Use when reviewing JavaScript bundles, source maps, frontend configuration, or generated assets for exposed credentials and internal endpoints.
metadata:
  origin: Adapted from uphiago/recon-skills; first-party defensive rewrite.
  tags: javascript, security, frontend, secrets
---

# JavaScript Secrets Audit

Inspect browser-delivered JavaScript and source maps for values that grant
privilege or reveal sensitive internal systems. Public configuration is not
automatically a secret, and all findings must be redacted.

## When to Use

- Reviewing a frontend build before release.
- Investigating a suspected API key, JWT, private URL, or source-map exposure.
- Auditing generated assets from a local build or authorized staging site.

## Procedure

1. Inventory emitted JS, maps, HTML bootstraps, runtime config, and public
   environment variables. Prefer local build output.
2. Search for high-signal patterns: private-key headers, bearer tokens, JWT
   shapes, cloud access-key prefixes, database URLs, webhook secrets, and
   internal hostnames. Treat regex matches as leads.
3. Classify each value: public identifier, publishable key, short-lived token,
   privileged credential, personal data, or internal endpoint.
4. Confirm only through source/config ownership and documentation. Never call a
   matched service, decode a real token, or test a credential.
5. Report path, bundle offset/source line, secret class, masked fingerprint,
   exposure scope, and rotation/removal action.
6. Rebuild with proper environment separation, remove maps or sensitive config,
   invalidate caches, rotate credentials when needed, and rescan.

## Evidence Gate

Regex alone is insufficient. A finding needs ownership/context showing that the
value is sensitive or that the endpoint exposes protected functionality. Never
place the value in reports, snapshots, tickets, chat, or terminal output.

## Safe Masking

Use only a short prefix/suffix or a one-way fingerprint, for example
`sk_live_••••••••9f2a`; preserve enough context for the owner to locate it.

## Common Mistakes

- Reporting every Firebase/Supabase/public client key as a vulnerability.
- Assuming minification makes a secret safe.
- Downloading source maps from unrelated deployments.
- Testing a suspected credential instead of rotating it through the owner.
