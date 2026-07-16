---
name: api-security-audit
description: Use when reviewing an API for authorization gaps, unsafe input binding, token handling, CORS, or HTTP method configuration.
metadata:
  origin: Adapted from uphiago/recon-skills; first-party defensive rewrite.
  tags: api, security, authorization, cors
---

# API Security Audit

Review an API for configuration and authorization weaknesses without attempting
to take over accounts, alter data, or bypass production controls.

## When to Use

- Reviewing REST, GraphQL, RPC, or webhook endpoints.
- Investigating mass-assignment, BOLA/IDOR, CORS, JWT, or verb-tampering risk.
- Assessing an API before release or after an authorization change.

## Authorization Boundary

Work only against a repository, local fixture, staging environment, or written
test scope. Prefer source review and unit tests. Never send admin-changing
payloads to a real account, brute-force tokens, or probe unrelated hosts.

## Procedure

1. Inventory routes, methods, auth middleware, schemas, tenant identifiers, and
   generated API documentation.
2. For every read and write operation, identify the server-side authorization
   decision. Confirm that object ownership and tenant scope are checked after
   loading the object, not inferred from client input.
3. Inspect request binding. Flag direct persistence of request bodies where
   privileged fields such as `role`, `ownerId`, `tenantId`, `verified`, or
   `isAdmin` are not allowlisted.
4. Review method handling, including `OPTIONS`, `HEAD`, `TRACE`, method
   override headers, and routes that accept both GET and mutating verbs.
5. Review JWT validation: fixed algorithm allowlist, issuer/audience checks,
   key rotation, expiry, and rejection of unsigned or wrongly signed tokens.
6. Review CORS. A wildcard origin alone is not a credential leak; require an
   unsafe combination of origin reflection, credentials, and a sensitive
   browser-readable response.
7. Reproduce only with harmless fixtures: a second test user, a synthetic
   object, and a request that must return `401` or `403`. Do not modify data.

## Evidence Gate

Report a finding only when the code path or a controlled fixture demonstrates
the trust-boundary failure. A suspicious field name, decoded JWT, or permissive
header is a lead, not proof.

## Report

Include endpoint or source location, required role, expected decision, observed
decision, affected asset, minimal safe reproduction, impact, and remediation.
Redact tokens, cookies, API keys, and personal data.

## Common Mistakes

- Treating client-side route hiding as authorization.
- Calling `Access-Control-Allow-Origin: *` a credentialed CORS finding.
- Using a real user's identifier instead of a synthetic fixture.
- Recommending `alg:none` or privilege-changing payloads in production tests.
