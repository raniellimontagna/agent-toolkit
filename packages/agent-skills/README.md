# @ranimontagna/agent-skills

Portable, dependency-free Markdown skills shared by supported agent runtimes.

`skills.index.json` maps each stable `ref` to its complete `SKILL.md` and its
prompt-sized `BRIEF.md`. Consumers that inject skills into a prompt should prefer
the brief; interactive runtimes can load the full skill and its companion files.

This package intentionally has no runtime JavaScript dependencies.

## Included refs

- `frontend/accessibility`
- `frontend/astro/astro-react-landing`
- `frontend/design/frontend-design`
- `frontend/design/ui-ux-pro-max`
- `frontend/gsap/gsap-motion`
- `frontend/seo/seo-page`
- `quality/biome-formatting`
- `research/instagram-public-research`
- `research/research-data-collection`

The package contains source content and indexes only. It has no `main`, `bin`,
or Node.js engine requirement. Publication is managed independently from
`@ranimontagna/agent-toolkit`.
