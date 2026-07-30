# Astro + React Landing

Use Astro for routes, layouts, metadata, and static landing content. Use React
only for interactive islands such as forms, calculators, and carousels; hydrate
intentionally with an Astro client directive. Keep essential copy crawlable and
do not maintain parallel full Astro and React page implementations.

Reuse local layouts/components, preserve canonical/Open Graph/structured data,
and test CTA hrefs and target section ids when changing them. Prefer static
generation and avoid client JavaScript for sections that can be static HTML/CSS.
