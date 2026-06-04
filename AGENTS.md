--- project-doc ---

# Agent Toolkit Project Rules

## Shell Commands

- Prefer `rtk` as the command prefix when it is available, for example `rtk pnpm run check`.
- If `rtk` is not installed yet, run the equivalent command without the prefix or install RTK through this toolkit.
- Keep these project rules portable; do not reference machine-local instruction files.

## Git Workflow

- Use Conventional Commits for every commit message.
- Keep commit subjects concise and scoped, for example:
  - `feat: add graphify installer`
  - `fix: resolve compiled package root`
  - `docs: update project rules`
  - `test: cover skill scope filtering`
- Do not create commits with vague subjects such as `update`, `changes`, `fixes`, or `wip`.

## Verification

- Before claiming work is complete, run lint and tests.
- Prefer the full check whenever the change touches code, scripts, package metadata, installer behavior, tests, or project rules:

```bash
rtk pnpm run check
```

- For very small documentation-only changes, at minimum run:

```bash
rtk pnpm run lint
rtk pnpm test
```

- If any verification command fails, fix the issue or report the exact blocker before saying the task is done.

## Graphify

This project has a knowledge graph at `graphify-out/` with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, invoke the `skill` tool with `skill: "graphify"` before doing anything else.

Rules:

- For codebase questions, first run `graphify query "<question>"` when `graphify-out/graph.json` exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than `GRAPH_REPORT.md` or raw grep output.
- Dirty `graphify-out/` files are expected after hooks or incremental updates; dirty graph files are not a reason to skip Graphify. Only skip Graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If `graphify-out/wiki/index.md` exists, use it for broad navigation instead of raw source browsing.
- Read `graphify-out/GRAPH_REPORT.md` only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current.
