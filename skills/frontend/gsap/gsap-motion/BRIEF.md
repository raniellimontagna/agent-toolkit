# GSAP Motion

Use GSAP only when motion improves comprehension, conversion, or feedback.
Confirm the dependency is available before adding it. Prefer compositor-friendly
`x`, `y`, `scale`, `rotation`, `opacity`, and `autoAlpha`; avoid animating layout
properties such as width, height, top, left, margin, or padding.

Respect reduced motion. In React, scope animations to refs and clean them up on
unmount. Keep hero sequences brief, use subtle in-view staggers, avoid endlessly
pulsing CTAs, and test mobile scroll effects before pinning content.
