---
name: llm-agent-security-audit
description: Use when auditing an LLM, RAG, chatbot, or tool-using agent for prompt injection, data exfiltration, system-prompt leakage, or cross-tenant access.
metadata:
  origin: Adapted from uphiago/recon-skills; first-party defensive rewrite.
  tags: security, llm, agents, prompt-injection
---

# LLM and Agent Security Audit

Test trust boundaries around model instructions, retrieved content, tools, and
tenant data. A refusal or unsafe sentence alone is not a vulnerability; require
reproducible impact at the data or action layer.

## When to Use

- Reviewing an agent with browser, shell, filesystem, email, or API tools.
- Assessing RAG/document ingestion, plugins, MCP tools, or multi-tenant chat.
- Investigating prompt injection, system-prompt leakage, or tool exfiltration.

## Procedure

1. Map system/developer/user/retrieved instructions, tool schemas, credentials,
   memory, tenant boundaries, and approval gates.
2. Use synthetic canary data and a disposable account. Label every test input
   and keep external callbacks under the auditor's control.
3. Test indirect instructions in documents and web content for instruction/data
   confusion. Verify whether the model can cause a tool action, not merely say
   it would.
4. Apply the run-twice rule for alleged prompt or system-message leakage. A
   finding needs reproducible non-guessable content or a verifiable action.
5. For exfiltration claims, require an authorized OOB callback containing only
   the synthetic canary. Rendered Markdown or a model claim is not proof.
6. Test cross-tenant retrieval with a value independently known to belong to a
   second synthetic tenant. Do not use real customer data.
7. Check tool permissions, argument validation, URL allowlists, confirmation
   gates, output encoding, and audit logs. Recommend architectural controls,
   not prompt-only mitigations.

## Evidence Gate

Confabulation, jailbreak compliance, a model repeating user input, and a generic
refusal bypass are not findings without a trust-boundary consequence.

## Report

Include model/build, synthetic input, tool/data boundary, reproducibility,
observable impact, logs or callback metadata, and mitigation. Never include
system prompts, customer content, credentials, or harmful payloads verbatim.

## Stop Conditions

Stop if a test reaches real data, sends an uncontrolled external request, or
would mutate a real system. Revoke test credentials and preserve minimal logs.
