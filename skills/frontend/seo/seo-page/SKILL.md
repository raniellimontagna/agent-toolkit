---
name: seo-page
description: Optimize landing pages for SEO, including technical SEO, on-page metadata, schema, sitemap readiness, content quality, image optimization, AI search readiness, and Generative Engine Optimization. Use when creating or improving landing pages, campaign pages, product pages, SaaS homepages, and SEO-focused pages.
---

# SEO Page

Treat SEO as part of the landing-page implementation, not a post-build checklist.

## Page Requirements

- Include a specific title, meta description, canonical strategy, and
  Open Graph/Twitter metadata when the stack supports them.
- Use one clear `h1`, logical headings, crawlable HTML, product-specific copy,
  descriptive image alt text, and understandable internal links/CTAs.
- Prefer fast static rendering for landing pages.

## Schema And Discovery

- Add Schema.org JSON-LD only when it matches real content. Typical valid types
  include `Organization`, `WebSite`, `Product`, `SoftwareApplication`, `Service`,
  `FAQPage`, and `BreadcrumbList`.
- Do not add deprecated or misleading schema.
- Preserve existing sitemap and robots conventions.
- Make product entities, claims, positioning, pricing, and proof easy to quote
  and attribute for AI search/GEO.

## Quality Gates

- Avoid thin pages and duplicate title/meta copy across generated pages.
- Do not keyword-stuff headings, alt text, or body copy.
- Protect Core Web Vitals: reduce client JavaScript, prevent layout shift, and
  size media responsibly.
- Run available build/lint checks and inspect generated HTML when practical.
