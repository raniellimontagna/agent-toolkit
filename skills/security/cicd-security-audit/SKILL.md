---
name: cicd-security-audit
description: Use when reviewing CI/CD workflows, build pipelines, release automation, action dependencies, permissions, artifacts, or secret handling.
metadata:
  origin: Adapted from uphiago/recon-skills; first-party defensive rewrite.
  tags: security, ci, cd, supply-chain
---

# CI/CD Security Audit

Review pipeline configuration for privilege, injection, secret, and supply
chain risks. Keep the assessment static or use isolated test branches.

## When to Use

- Reviewing GitHub Actions, GitLab CI, CircleCI, or release scripts.
- Preparing a repository for trusted publishing or external contributions.
- Investigating secrets in logs, unsafe artifacts, or unpinned actions.

## Procedure

1. Inventory workflow triggers, actors, environments, protected branches,
   reusable workflows, runners, deployment credentials, and artifacts.
2. Check least privilege. Each job should declare only required permissions;
   pull-request workflows must not expose write tokens to untrusted code.
3. Trace untrusted input from branch names, issue titles, PR fields, commit
   messages, and changed files into shell commands, expressions, paths, and
   scripts. Use environment variables and fixed argument arrays rather than
   interpolation.
4. Check third-party actions and downloaded tools for immutable commit pins,
   checksum verification, provenance, and update ownership.
5. Check secret handling: no echo/trace, no secrets in command-line arguments,
   artifacts, caches, test snapshots, or fork-triggered jobs.
6. Review artifact upload/download boundaries, retention, deployment gates,
   environment approvals, and concurrency controls.
7. Validate changes in a disposable branch with synthetic secrets and a dry-run
   deployment. Never print or exfiltrate a real secret.

## Evidence Gate

Distinguish a theoretical permission from an reachable path. Show the trigger,
job, permission/input flow, and affected asset. A floating action tag is a
supply-chain risk, not proof of compromise.

## Report

Include workflow/job, trigger, trust boundary, vulnerable data flow, impact,
safe reproduction or static evidence, and exact hardening. Redact secret names
when they reveal sensitive architecture and never include values.

## Common Mistakes

- Treating every `pull_request_target` workflow as automatically vulnerable.
- Calling a public CI log a secret leak without proving the value is sensitive.
- Suggesting live deployment tests for a static workflow review.
