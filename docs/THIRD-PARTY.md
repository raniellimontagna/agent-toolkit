# Third-Party Sources and Licenses

Agent Toolkit is released under the [MIT License](../LICENSE). Some of the skills it installs come from other projects and keep their own licenses. This page lists where each one comes from.

The source of truth is the repository itself:

- [`tools.lock.json`](../tools.lock.json) pins every external tool and skill source to an exact version or commit.
- Every bundled skill that was copied or adapted from another project keeps a `NOTICE.md` (source URL, upstream commit, license) and the upstream license text in its own directory.

## External skills installed from upstream

These skills are not copied into this repository. The installer fetches them from the pinned upstream commit through the Agent Skills CLI.

React Doctor is installed from [`millionco/react-doctor`](https://github.com/millionco/react-doctor) at a pinned commit and is documented upstream under a Modified MIT License. It is an agent skill integration, not automatic CI setup.

Remotion Best Practices is installed from [`remotion-dev/skills`](https://github.com/remotion-dev/skills) at a pinned commit.

UI Humanizer, Motion Designer and Webscraping Expert are installed from [`gabrielgreco1/skills`](https://github.com/gabrielgreco1/skills) at a pinned commit; that repository has no license file, and its README grants permission to use and modify the skills. Motion Designer narration calls the ElevenLabs API and needs an API key in the environment. Webscraping Expert covers anti-bot and CAPTCHA techniques; check the target site terms of service before using them.

## Bundled skills with upstream sources

| Skill path under `skills/` | Upstream | License |
|---|---|---|
| [`backend/api/api-design`](../skills/backend/api/api-design/NOTICE.md) | [`affaan-m/ECC`](https://github.com/affaan-m/ECC) | MIT |
| [`backend/database/postgres-patterns`](../skills/backend/database/postgres-patterns/NOTICE.md) | [`affaan-m/ECC`](https://github.com/affaan-m/ECC), [`sickn33/antigravity-awesome-skills`](https://github.com/sickn33/antigravity-awesome-skills) | MIT |
| [`backend/fastify-best-practices`](../skills/backend/fastify-best-practices/NOTICE.md) | [`mcollina/skills`](https://github.com/mcollina/skills) | MIT |
| [`backend/go/golang-patterns`](../skills/backend/go/golang-patterns/NOTICE.md) | [`affaan-m/ECC`](https://github.com/affaan-m/ECC) | MIT |
| [`backend/go/golang-testing`](../skills/backend/go/golang-testing/NOTICE.md) | [`affaan-m/ECC`](https://github.com/affaan-m/ECC) | MIT |
| [`backend/java/java-coding-standards`](../skills/backend/java/java-coding-standards/NOTICE.md) | [`affaan-m/ECC`](https://github.com/affaan-m/ECC) | MIT |
| [`backend/java/java-junit`](../skills/backend/java/java-junit/NOTICE.md) | [`github/awesome-copilot`](https://github.com/github/awesome-copilot) | MIT |
| [`backend/kotlin/kotlin-patterns`](../skills/backend/kotlin/kotlin-patterns/NOTICE.md) | [`affaan-m/ECC`](https://github.com/affaan-m/ECC) | MIT |
| [`backend/kotlin/kotlin-testing`](../skills/backend/kotlin/kotlin-testing/NOTICE.md) | [`affaan-m/ECC`](https://github.com/affaan-m/ECC) | MIT |
| [`backend/python/python-patterns`](../skills/backend/python/python-patterns/NOTICE.md) | [`affaan-m/ECC`](https://github.com/affaan-m/ECC) | MIT |
| [`backend/python/python-testing`](../skills/backend/python/python-testing/NOTICE.md) | [`affaan-m/ECC`](https://github.com/affaan-m/ECC) | MIT |
| [`devops/docker-patterns`](../skills/devops/docker-patterns/NOTICE.md) | [`affaan-m/ECC`](https://github.com/affaan-m/ECC), [`sickn33/antigravity-awesome-skills`](https://github.com/sickn33/antigravity-awesome-skills) | MIT |
| [`frontend/accessibility`](../skills/frontend/accessibility/NOTICE.md) | [`affaan-m/ECC`](https://github.com/affaan-m/ECC) | MIT |
| [`frontend/astro/astro-developer`](../skills/frontend/astro/astro-developer/NOTICE.md) | [`withastro/astro`](https://github.com/withastro/astro) | MIT |
| [`frontend/design/revenue-centric-design`](../skills/frontend/design/revenue-centric-design/NOTICE.md) | [`heliocosta-dev/revenue-centric-design`](https://github.com/heliocosta-dev/revenue-centric-design) | Source-available custom terms: attribution required, no gambling, betting or casino use |
| [`frontend/design/ui-ux-pro-max`](../skills/frontend/design/ui-ux-pro-max/NOTICE.md) | [`nextlevelbuilder/ui-ux-pro-max-skill`](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | MIT |
| `frontend/gsap/` (`gsap-core`, `gsap-frameworks`, `gsap-performance`, `gsap-plugins`, `gsap-react`, `gsap-scrolltrigger`, `gsap-timeline`, `gsap-utils`) | [`greensock/gsap-skills`](https://github.com/greensock/gsap-skills) | MIT |
| [`frontend/react-native/react-native-expert`](../skills/frontend/react-native/react-native-expert/NOTICE.md) | [`Jeffallan/claude-skills`](https://github.com/Jeffallan/claude-skills) | MIT |
| [`frontend/react-native/react-native-unistyles-v3`](../skills/frontend/react-native/react-native-unistyles-v3/NOTICE.md) | [`jpudysz/react-native-unistyles`](https://github.com/jpudysz/react-native-unistyles) | MIT, as declared by the upstream README and package metadata |
| [`frontend/react/react-patterns`](../skills/frontend/react/react-patterns/NOTICE.md) | [`affaan-m/ECC`](https://github.com/affaan-m/ECC) | MIT |
| [`frontend/react/react-performance`](../skills/frontend/react/react-performance/NOTICE.md) | [`affaan-m/ECC`](https://github.com/affaan-m/ECC) | MIT |
| [`frontend/react/react-testing`](../skills/frontend/react/react-testing/NOTICE.md) | [`affaan-m/ECC`](https://github.com/affaan-m/ECC) | MIT |
| [`general/code-reviewer`](../skills/general/code-reviewer/NOTICE.md) | [`Shubhamsaboo/awesome-llm-apps`](https://github.com/Shubhamsaboo/awesome-llm-apps) | Apache-2.0 (repository license) |
| [`general/thermo-nuclear-code-quality-review`](../skills/general/thermo-nuclear-code-quality-review/NOTICE.md) | [`cursor/plugins`](https://github.com/cursor/plugins) | MIT |
| [`media/brag-slim`](../skills/media/brag-slim/NOTICE.md) | [`latent-spaces/brag`](https://github.com/latent-spaces/brag) | MIT |
| [`security/`](../skills/security/NOTICE.md) (first-party rewrites) | [`uphiago/recon-skills`](https://github.com/uphiago/recon-skills) | MIT |
| [`security/security-audit`](../skills/security/security-audit/NOTICE.md) | [`cloudflare/security-audit-skill`](https://github.com/cloudflare/security-audit-skill) | MIT |
| [`workflow/ariadne`](../skills/workflow/ariadne/NOTICE.md), [`workflow/ariadne-prd`](../skills/workflow/ariadne-prd/NOTICE.md) | [`snarktank/ralph`](https://github.com/snarktank/ralph) | MIT |

Each GSAP skill directory has its own `NOTICE.md`. The React skills also carry a `rules/react/NOTICE.md` for their shared rule files.

## Notes on selected skills

The first-party `security` skills are defensive rewrites informed by [`uphiago/recon-skills`](https://github.com/uphiago/recon-skills), under its MIT License. They are intended for authorized, non-destructive reviews; upstream offensive infrastructure, agent instructions, scripts, and mass-scanning workflows are not included. See [`skills/security/NOTICE.md`](../skills/security/NOTICE.md) for attribution.

The bundled `security/security-audit` skill is vendored unchanged from [`cloudflare/security-audit-skill`](https://github.com/cloudflare/security-audit-skill) at commit `c1c8a8c1471069fb0e188eeaff69b8e8db6564a8` under the MIT License. It runs a six-phase, multi-agent source audit (reconnaissance, coverage-led hunting, adversarial validation, schema-checked `findings.json`, independent verification, report) and needs Node.js for its zero-dependency validators plus an OS-enforced sandbox before it executes any target code. See [`skills/security/security-audit/NOTICE.md`](../skills/security/security-audit/NOTICE.md) for attribution.

The bundled `media/brag-slim` skill is vendored from [`latent-spaces/brag`](https://github.com/latent-spaces/brag) at commit `069432cac935ed1895859df201c31436c07fb74e` under the MIT License. It turns a project directory or website URL into a short launch video with share copy, built with tools already on the machine; the full `/brag` skill, its render scripts, and bundled music are not included. See [`skills/media/brag-slim/NOTICE.md`](../skills/media/brag-slim/NOTICE.md) for attribution.

The first-party `ariadne` and `ariadne-prd` skills are Ariadne-specific adaptations of concepts from [`snarktank/ralph`](https://github.com/snarktank/ralph) under the MIT License. They install through the ordinary Custom Skills pipeline for all five runtimes; `tools.ariadne` in `tools.lock.json` records reviewed attribution only and is not fetched or executed during a normal Ariadne run. Each skill directory contains its source path, reviewed commit, and source hash in `NOTICE.md`.
