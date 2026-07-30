---
name: gsap-motion
description: Add or debug polished frontend motion with GSAP, timelines, ScrollTrigger, staggered transitions, transforms, and performance-conscious animation. Use when a task asks for GSAP, scroll animation, advanced web motion, or when a landing page would materially benefit from motion and the dependency is available or explicitly allowed.
---

# GSAP Motion

Use GSAP only when motion improves comprehension, conversion, or interaction
feedback. Prefer CSS transitions for simple hover and focus effects.

## When To Use GSAP

- Sequenced hero/reveal animations, coordinated staggers, timelines, SVG, or
  canvas-like motion.
- ScrollTrigger-driven sections, scrubbed progress, pinning, or parallax.
- Framework integration where lifecycle cleanup matters.

## Implementation Rules

1. Check whether `gsap` is already installed before adding it.
2. Keep any new dependency justified and local to the feature.
3. Animate `x`, `y`, `scale`, `rotation`, `opacity`, or `autoAlpha`; avoid
   layout-heavy `width`, `height`, `top`, `left`, `margin`, and `padding`.
4. Respect reduced-motion preferences.
5. In React, scope animations to refs and revert or clean them up on unmount.
6. Keep the page usable without waiting for animation.

## Landing-Page Defaults

- Hero: a short entrance sequence, never a long intro.
- Proof and benefits: stagger only as items enter view and only when it helps.
- CTA: guide attention without infinite pulsing.
- Scroll effects: avoid mobile pinning unless layout stability was tested.

Use the focused bundled GSAP skills for detailed API, ScrollTrigger, React,
performance, plugin, timeline, and utility guidance.
