---
name: research-data-collection
description: Collect, normalize, and summarize public web data for downstream agents. Use when researching markets, competitors, products, pricing, positioning, SEO content, source evidence, or customer language using search, HTTP extraction, Firecrawl, Playwright, Scrapling, or other scraping tools.
---

# Research Data Collection

Collect useful evidence, not raw dumps. The output should help another agent
make better decisions.

## Safety Policy

1. Prefer public pages and official APIs.
2. Check robots.txt, site terms, and task scope before crawling.
3. Do not bypass paywalls, login walls, captchas, or access controls.
4. Do not collect sensitive personal data without a lawful explicit scope and
   repository policy.
5. Rate-limit requests, keep crawls narrow, record provenance, and separate
   facts from inferences.

## Tool Selection

- Start with search or a human-curated source list for broad questions.
- Use public-page extraction for markdown-friendly sources; use HTTP clients for
  static pages/APIs and browser automation only for JS-rendered pages.
- Restrict crawlers to bounded multi-page extraction.
- Avoid stealth or anti-bot modes unless the terms permit automation and a human
  explicitly approved the risk.

## Output Contract

Return a compact research pack with objective/scope; source URL, title, access
time, method, relevance and confidence; cited facts; relevant competitor claims,
offers, pricing, proof, objections, and audience language; SEO entities/content
gaps; artifacts where visual evidence matters; limitations; and next actions.

For landing-page research, prioritize audience pains, outcomes, positioning,
proof, differentiation, official contact channels, search terms, FAQs,
objections, and visual references. Mark channels as validated, user-provided,
inferred, inaccessible, or pending; never invent a WhatsApp number.
