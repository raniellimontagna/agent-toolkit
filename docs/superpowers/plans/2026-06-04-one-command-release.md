# One-Command Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish Agent Toolkit through a scoped npm package so users can run it with one `npx -y` command.

**Architecture:** Keep the compiled dependency-free Node CLI as the runtime artifact. Change only package metadata, release automation, user-facing command docs, help text and distribution-contract tests.

**Tech Stack:** Node.js 22, TypeScript, npm package metadata, GitHub Actions, Vitest, Bash integration tests.

---

### Task 1: Distribution Contract Tests

**Files:**
- Modify: `tests/test-agent-toolkit.sh`

- [x] **Step 1: Write failing assertions**

Add shell assertions after the existing `package.json` presence check:

```bash
PACKAGE_JSON_CONTENT="$(cat "$ROOT_DIR/package.json")"

if ! grep -Fq -- '"name": "@ranimontagna/agent-toolkit"' <<<"$PACKAGE_JSON_CONTENT"; then
  echo "Expected package name to use the public scoped package" >&2
  exit 1
fi

if ! grep -Fq -- '"access": "public"' <<<"$PACKAGE_JSON_CONTENT"; then
  echo "Expected scoped package to publish publicly" >&2
  exit 1
fi
```

Add help and README assertions:

```bash
if ! grep -Fq -- "npx -y @ranimontagna/agent-toolkit" <<<"$HELP_OUTPUT"; then
  echo "Expected help output to document the scoped npx command" >&2
  echo "$HELP_OUTPUT" >&2
  exit 1
fi

if ! grep -Fq -- "npx -y @ranimontagna/agent-toolkit --all --codex" "$ROOT_DIR/README.md"; then
  echo "Expected README to document one-command install through npm" >&2
  exit 1
fi
```

- [x] **Step 2: Run integration test to verify it fails**

Run:

```bash
rtk npm run build
rtk bash tests/test-agent-toolkit.sh
```

Expected: fail with "Expected package name to use the public scoped package".

### Task 2: Package Metadata and Help Text

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/usage.ts`

- [x] **Step 1: Update package metadata**

Set the package name and publish access:

```json
{
  "name": "@ranimontagna/agent-toolkit",
  "publishConfig": {
    "access": "public"
  }
}
```

Preserve the `agent-toolkit` and `setup-agent-toolkit` bin names.

- [x] **Step 2: Update CLI usage**

Change the help usage line from `npx agent-toolkit [options]` to:

```text
npx -y @ranimontagna/agent-toolkit [options]
```

- [x] **Step 3: Update lockfile**

Run:

```bash
rtk npm install --package-lock-only --ignore-scripts
```

Expected: exit 0 and root package metadata updated.

- [x] **Step 4: Run focused integration test**

Run:

```bash
rtk npm run build
rtk bash tests/test-agent-toolkit.sh
```

Expected: distribution assertions pass.

### Task 3: Release Workflow and README

**Files:**
- Create: `.github/workflows/release.yml`
- Modify: `README.md`

- [x] **Step 1: Add release workflow**

Create a tag-driven workflow:

```yaml
name: Release

on:
  push:
    tags:
      - "v*"

permissions:
  contents: read
  id-token: write

jobs:
  publish:
    name: Publish npm package
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          registry-url: https://registry.npmjs.org

      - name: Install dependencies
        run: npm ci

      - name: Run checks
        run: npm run check

      - name: Publish to npm
        run: npm publish --access public --provenance
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

- [x] **Step 2: Update README install docs**

Document the published package command first:

```bash
npx -y @ranimontagna/agent-toolkit --all --codex
```

Keep clone-based commands under local development.

- [x] **Step 3: Run focused integration test**

Run:

```bash
rtk npm run build
rtk bash tests/test-agent-toolkit.sh
```

Expected: README assertion passes.

### Task 4: Full Verification and Graph Refresh

**Files:**
- Generated: `dist/**`
- Generated: `graphify-out/**`

- [x] **Step 1: Run package dry-run**

Run:

```bash
rtk npm pack --dry-run --json
```

Expected: output package id is `@ranimontagna/agent-toolkit@0.1.1`, includes `dist/`, `skills/`, `tools.lock.json`, `setup-agent-toolkit.sh`, `README.md`.

- [x] **Step 2: Run full check**

Run:

```bash
rtk npm run check
```

Expected: exit 0.

- [x] **Step 3: Refresh graph**

Run:

```bash
rtk graphify update .
```

Expected: graph update exits 0 or reports no supported changes.

- [x] **Step 4: Inspect diff**

Run:

```bash
git diff --stat
git diff -- . ':(exclude)graphify-out'
```

Expected: only scoped package release work and generated artifacts are changed.
