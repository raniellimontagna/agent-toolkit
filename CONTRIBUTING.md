# Contributing

Agent Toolkit is a public installer for personal AI-agent workflows. Keep changes
small, pinned and easy to verify.

## Development Flow

1. Install dependencies with `pnpm install`.
2. Make focused changes that follow the existing TypeScript module boundaries.
3. Add or update tests for behavior that can regress.
4. Run the release gate before claiming completion:

```bash
rtk pnpm run check
```

If `rtk` is unavailable, run the same command without the prefix.

## Commit Messages

Use Conventional Commits:

```text
feat: add doctor command
fix: preserve skill manifest entries
docs: document release flow
test: cover installer dry run
```

## External Sources

Keep `tools.lock.json` as the source of truth for external tools. New third-party
skills must use immutable public sources, include license/notice files when
vendored, and pass `pnpm run check`.
