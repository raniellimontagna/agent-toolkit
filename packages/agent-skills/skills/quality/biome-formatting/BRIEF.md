# Biome Formatting

Treat the repository's `biome.json` and package scripts as the source of truth.
Use the documented lint/format scripts; apply automatic writes only for
formatting, import organization, and safe lint fixes, then rerun validation.

Do not hand-format against Biome or add ESLint/Prettier where Biome is already
configured. Review semantic changes separately and avoid staging unrelated
formatter output unless that scope was intentional.
