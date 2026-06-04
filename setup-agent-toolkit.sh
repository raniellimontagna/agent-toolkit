#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 22+ is required to run Agent Toolkit." >&2
  echo "Install Node.js, then run this command again." >&2
  exit 1
fi

CLI_ENTRYPOINT="$SCRIPT_DIR/dist/bin/agent-toolkit.js"

if [[ ! -f "$CLI_ENTRYPOINT" ]]; then
  echo "Agent Toolkit build not found: dist/bin/agent-toolkit.js" >&2
  echo "Run pnpm install && pnpm run build, then run this command again." >&2
  exit 1
fi

exec node "$CLI_ENTRYPOINT" "$@"
