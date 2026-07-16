---
name: cloud-misconfiguration-audit
description: Use when reviewing cloud storage, IAM, metadata access, network exposure, or deployment configuration for unauthorized access risk.
metadata:
  origin: Adapted from uphiago/recon-skills; first-party defensive rewrite.
  tags: cloud, security, iam, storage
---

# Cloud Misconfiguration Audit

Assess cloud exposure from configuration, policy, logs, and synthetic fixtures.
The goal is to reduce unintended access, not to enumerate or exploit another
tenant's infrastructure.

## When to Use

- Reviewing AWS, GCP, Azure, Supabase, Firebase, object storage, or IAM policy.
- Checking deployment templates, public endpoints, metadata protections, or
  container/cloud role boundaries.

## Procedure

1. Define account/project/subscription, region, environment, and read-only
   credentials in scope. Confirm the audit identity and expected permissions.
2. Inventory internet-facing services, buckets, databases, load balancers,
   serverless functions, service accounts, workload identities, and secrets.
3. Review IAM for wildcard principals/actions/resources, cross-account trust,
   unused roles, privilege escalation paths, and production identities in CI.
4. Review storage for public listing/read/write, predictable object paths,
   insecure CORS, version history, logs, and sensitive metadata.
5. Review metadata-service protections and container/task role boundaries in
   source and infrastructure-as-code. Do not query a live metadata endpoint
   unless the account owner explicitly provides an isolated fixture.
6. Confirm findings with policy simulation, provider analyzer output, or a
   synthetic object. Never download unrelated customer data or alter policy.
7. Recheck after remediation with the same read-only identity and record the
   before/after decision.

## Evidence Gate

Public policy syntax is not automatically exploitable. Prove the effective
permission, resource scope, and data class. A provider-owned public identifier
is not a credential.

## Report

Record provider/account alias, resource type and masked identifier, effective
principal/action, data class, impact, remediation, and verification result.
Keep account IDs, tokens, object names, and personal data to the minimum needed.

## Stop Conditions

Stop on customer data, cross-account access, write permission, or unexpected
production impact. Preserve only metadata and notify the authorized owner.
