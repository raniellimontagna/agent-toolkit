#!/usr/bin/env bash
set -euo pipefail

# The test creates an isolated HOME. Remove host-level runtime config overrides
# so each CLI invocation resolves its default paths beneath that temporary HOME.
unset CODEX_HOME OPENCODE_CONFIG_DIR OPENCODE_CONFIG XDG_CONFIG_HOME

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
REAL_NODE="$(command -v node || true)"

if [[ -z "$REAL_NODE" ]]; then
  echo "Node.js is required to test the Node installer." >&2
  exit 1
fi

FAKE_BIN="$TMP_DIR/bin"
HOME_DIR="$TMP_DIR/home"
LOG_DIR="$TMP_DIR/logs"
mkdir -p "$FAKE_BIN" "$HOME_DIR" "$LOG_DIR"

NPM_LOG="$LOG_DIR/npm.log"
CLAUDE_LOG="$LOG_DIR/claude.log"
CODEX_LOG="$LOG_DIR/codex.log"
OPENCODE_LOG="$LOG_DIR/opencode.log"
GEMINI_LOG="$LOG_DIR/gemini.log"
ANTIGRAVITY_LOG="$LOG_DIR/antigravity.log"
GRAPHIFY_LOG="$LOG_DIR/graphify.log"
GIT_LOG="$LOG_DIR/git.log"
AGENT_BROWSER_LOG="$LOG_DIR/agent-browser.log"
export GRAPHIFY_LOG

if [[ ! -f "$ROOT_DIR/bin/agent-toolkit.ts" ]]; then
  echo "Expected TypeScript CLI source to exist: bin/agent-toolkit.ts" >&2
  exit 1
fi

if [[ ! -f "$ROOT_DIR/dist/bin/agent-toolkit.js" ]]; then
  echo "Expected compiled Node CLI to exist: dist/bin/agent-toolkit.js" >&2
  exit 1
fi

if [[ ! -f "$ROOT_DIR/package.json" ]]; then
  echo "Expected package.json to exist for the Node CLI" >&2
  exit 1
fi

PACKAGE_JSON_CONTENT="$(cat "$ROOT_DIR/package.json")"

if ! grep -Fq -- '"name": "@ranimontagna/agent-toolkit"' <<<"$PACKAGE_JSON_CONTENT"; then
  echo "Expected package name to use the public scoped package" >&2
  exit 1
fi

if ! grep -Fq -- '"access": "public"' <<<"$PACKAGE_JSON_CONTENT"; then
  echo "Expected scoped package to publish publicly" >&2
  exit 1
fi

ROOT_DIR="$ROOT_DIR" "$REAL_NODE" --input-type=module <<'NODE'
import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = process.env.ROOT_DIR;
if (!root) {
  throw new Error("ROOT_DIR is required");
}
const files = [];

function walk(path) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const next = path + "/" + entry.name;
    if (entry.isDirectory()) {
      walk(next);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(next);
    }
  }
}

walk(root + "/skills");

const missing = [];
for (const file of files) {
  const text = await readFile(file, "utf8");
  const markdownLinkPattern = /\[[^\]]+\]\(([^)]+)\)/g;
  for (const match of text.matchAll(markdownLinkPattern)) {
    const raw = match[1].trim();
    if (!raw || raw.startsWith("http:") || raw.startsWith("https:") || raw.startsWith("mailto:") || raw.startsWith("#")) {
      continue;
    }

    const target = raw.split("#")[0];
    if (!target || target.includes(":")) {
      continue;
    }

    const absolute = resolve(dirname(file), target);
    if (!existsSync(absolute)) {
      missing.push(file.slice(root.length + 1) + " -> " + raw);
    }
  }
}

if (missing.length > 0) {
  console.error("Expected bundled skill Markdown links to resolve locally:");
  console.error(missing.join("\n"));
  process.exit(1);
}
NODE

if [[ ! -f "$ROOT_DIR/tools.lock.json" ]]; then
  echo "Expected external tool provenance lock to exist: tools.lock.json" >&2
  exit 1
fi

if ! grep -Fq -- "dist/bin/agent-toolkit.js" "$ROOT_DIR/setup-agent-toolkit.sh"; then
  echo "Expected setup-agent-toolkit.sh to delegate to the compiled Node CLI" >&2
  exit 1
fi

for module in \
  args.ts \
  checksum.ts \
  context.ts \
  doctor.ts \
  lock-update.ts \
  logger.ts \
  main.ts \
  menu.ts \
  manifest.ts \
  provenance.ts \
  runtimes.ts \
  skills-audit.ts \
  skills.ts \
  state.ts \
  system.ts \
  tool-lock.ts \
  usage.ts \
  ui.ts \
  installers/caveman.ts \
  installers/agent-browser.ts \
  installers/frontend-skills.ts \
  installers/planning-skills.ts \
  installers/graphify.ts \
  installers/gsd.ts \
  installers/improve.ts \
  installers/rtk.ts \
  installers/superpowers.ts; do
  if [[ ! -f "$ROOT_DIR/src/$module" ]]; then
    echo "Expected setup module to exist: src/$module" >&2
    exit 1
  fi
done

if ! grep -Fq -- "../src/main.js" "$ROOT_DIR/bin/agent-toolkit.ts"; then
  echo "Expected bin/agent-toolkit.ts to be a thin entrypoint into src/main.ts" >&2
  exit 1
fi

if [[ -d "$ROOT_DIR/lib" ]] && find "$ROOT_DIR/lib" -type f -name '*.sh' | grep -q .; then
  echo "Old shell modules should be removed after the Node migration" >&2
  find "$ROOT_DIR/lib" -type f -name '*.sh' -print >&2
  exit 1
fi

"$REAL_NODE" --check "$ROOT_DIR/dist/bin/agent-toolkit.js" >/dev/null

OLD_SKILLS_MODULE="agent""-skills.sh"
if [[ -e "$ROOT_DIR/lib/$OLD_SKILLS_MODULE" ]]; then
  echo "Old private skills module should be removed" >&2
  exit 1
fi

OLD_CLI_MODULE="cop""ilot-cli.sh"
OLD_EDITOR_MODULE="vsc""ode.sh"
if [[ -e "$ROOT_DIR/lib/$OLD_CLI_MODULE" || -e "$ROOT_DIR/lib/$OLD_EDITOR_MODULE" ]]; then
  echo "Old editor/chat modules should be removed from this hub" >&2
  exit 1
fi

OLD_ENTRYPOINT="setup-cop""ilot-skills.sh"
if [[ -e "$ROOT_DIR/$OLD_ENTRYPOINT" ]]; then
  echo "Old entrypoint should be removed" >&2
  exit 1
fi

OLD_HUB_ENTRYPOINT="setup-ai-""hub.sh"
OLD_HUB_BIN="setup-ai-""hub.mjs"
if [[ -e "$ROOT_DIR/$OLD_HUB_ENTRYPOINT" || -e "$ROOT_DIR/bin/$OLD_HUB_BIN" ]]; then
  echo "Old AI Hub entrypoints should be removed after the Agent Toolkit rename" >&2
  exit 1
fi

cat > "$FAKE_BIN/rtk" <<'EOF'
#!/usr/bin/env bash
case "${1:-}" in
  --version) echo "rtk 0.0.0-test" ;;
  gain) exit 0 ;;
  hook) exit 0 ;;
  *) exit 0 ;;
esac
EOF
chmod +x "$FAKE_BIN/rtk"

cat > "$FAKE_BIN/node" <<'EOF'
#!/usr/bin/env bash
REAL_NODE_PLACEHOLDER
case "${1:-}" in
  --version) echo "v24.18.0" ;;
  -p) echo "24" ;;
  *) exec "$REAL_NODE_FOR_TEST" "$@" ;;
esac
EOF
perl -i -pe "s|REAL_NODE_PLACEHOLDER|REAL_NODE_FOR_TEST='$REAL_NODE'|" "$FAKE_BIN/node"
chmod +x "$FAKE_BIN/node"

cat > "$FAKE_BIN/npm" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$NPM_LOG"
exit 0
EOF
chmod +x "$FAKE_BIN/npm"

cat > "$FAKE_BIN/agent-browser" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$AGENT_BROWSER_LOG"
case "\${1:-}" in
  --version) echo "agent-browser 0.31.1" ;;
esac
exit 0
EOF
chmod +x "$FAKE_BIN/agent-browser"

cat > "$FAKE_BIN/npx" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$NPM_LOG"
exit 0
EOF
chmod +x "$FAKE_BIN/npx"

cat > "$FAKE_BIN/git" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$GIT_LOG"
if [[ "\${1:-}" == "clone" ]]; then
  destination="\${@: -1}"
  mkdir -p "\$destination"
  if [[ "\$destination" == */agent-browser ]]; then
    mkdir -p "\$destination/skills/agent-browser"
  fi
fi
if [[ "\${1:-}" == "-C" && "\${3:-}" == "fetch" ]]; then
  printf '%s\n' "\${@: -1}" > "\$2/.fake-fetch-head"
fi
if [[ "\${1:-}" == "-C" && "\${3:-}" == "rev-parse" ]]; then
  cat "\$2/.fake-fetch-head" 2>/dev/null
fi
exit 0
EOF
chmod +x "$FAKE_BIN/git"

cat > "$FAKE_BIN/uv" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$GRAPHIFY_LOG"
case " \$* " in
  *" tool install graphifyy==0.9.11 "*) cat > "$FAKE_BIN/graphify" <<'GRAPHIFY'
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$GRAPHIFY_LOG"
case "\${1:-}" in
  --version) echo "graphify 0.0.0-test" ;;
esac
exit 0
GRAPHIFY
chmod +x "$FAKE_BIN/graphify" ;;
esac
exit 0
EOF
chmod +x "$FAKE_BIN/uv"

cat > "$FAKE_BIN/pipx" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$GRAPHIFY_LOG"
case " \$* " in
  *" install graphifyy==0.9.11 "*) cat > "$FAKE_BIN/graphify" <<'GRAPHIFY'
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$GRAPHIFY_LOG"
case "\${1:-}" in
  --version) echo "graphify 0.0.0-test" ;;
esac
exit 0
GRAPHIFY
chmod +x "$FAKE_BIN/graphify" ;;
esac
exit 0
EOF
chmod +x "$FAKE_BIN/pipx"

cat > "$FAKE_BIN/claude" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$CLAUDE_LOG"
case "\${1:-}" in
  --version) echo "claude 0.0.0-test" ;;
esac
exit 0
EOF
chmod +x "$FAKE_BIN/claude"

cat > "$FAKE_BIN/codex" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$CODEX_LOG"
case "\${1:-}" in
  --version) echo "codex 0.0.0-test" ;;
esac
exit 0
EOF
chmod +x "$FAKE_BIN/codex"

cat > "$FAKE_BIN/opencode" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$OPENCODE_LOG"
case "\${1:-}" in
  --version) echo "opencode 0.0.0-test" ;;
esac
exit 0
EOF
chmod +x "$FAKE_BIN/opencode"

cat > "$FAKE_BIN/gemini" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$GEMINI_LOG"
case "\${1:-}" in
  --version) echo "gemini 0.0.0-test" ;;
esac
exit 0
EOF
chmod +x "$FAKE_BIN/gemini"

cat > "$FAKE_BIN/agy" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$ANTIGRAVITY_LOG"
case "\${1:-}" in
  --version) echo "agy 0.0.0-test" ;;
esac
exit 0
EOF
chmod +x "$FAKE_BIN/agy"

HELP_OUTPUT="$("$REAL_NODE" "$ROOT_DIR/dist/bin/agent-toolkit.js" --help)"
WRAPPER_HELP_OUTPUT="$(bash "$ROOT_DIR/setup-agent-toolkit.sh" --help)"

if [[ "$HELP_OUTPUT" != "$WRAPPER_HELP_OUTPUT" ]]; then
  echo "Expected Bash wrapper help output to match Node CLI help output" >&2
  diff -u <(printf '%s\n' "$HELP_OUTPUT") <(printf '%s\n' "$WRAPPER_HELP_OUTPUT") >&2 || true
  exit 1
fi

NODE_22_BIN="$TMP_DIR/node-22-bin"
mkdir -p "$NODE_22_BIN"
cat > "$NODE_22_BIN/node" <<EOF
#!/usr/bin/env bash
case "\${1:-}" in
  --version) echo "v22.0.0" ;;
  -p) echo "22" ;;
  *) exec "$REAL_NODE" "\$@" ;;
esac
EOF
chmod +x "$NODE_22_BIN/node"

if PATH="$NODE_22_BIN:/usr/bin:/bin" bash "$ROOT_DIR/setup-agent-toolkit.sh" --help >"$TMP_DIR/node-22.out" 2>&1; then
  echo "Expected wrapper to reject Node.js 22" >&2
  exit 1
fi

if ! grep -Fq -- "Node.js 24+ is required" "$TMP_DIR/node-22.out"; then
  echo "Expected Node.js 24 minimum-version guidance" >&2
  cat "$TMP_DIR/node-22.out" >&2
  exit 1
fi

for expected in \
  "Agent Toolkit" \
  "npx -y @ranimontagna/agent-toolkit" \
  "--caveman-only" \
  "--gsd-only" \
  "--improve-only" \
  "--agent-browser-only" \
  "--frontend-skills-only" \
  "--planning-skills-only" \
  "--graphify-only" \
  "--skills-only" \
  "--superpowers-only" \
  "--rtk-only" \
  "--no-graphify" \
  "--no-improve" \
  "--no-agent-browser" \
  "--no-frontend-skills" \
  "--no-planning-skills" \
  "--no-skills" \
  "--skills-dir" \
  "--skills-list" \
  "--skills-package" \
  "--skills-scope" \
  "--skills-path" \
  "--dry-run" \
  "--plan-only" \
  "--doctor" \
  "--status" \
  "--json" \
  "--uninstall" \
  "--repair" \
  "--update-lock" \
  "--skills-audit" \
  "--install-missing-clis" \
  "--allow-mutable-sources" \
  "AGENT_BROWSER_PACKAGE" \
  "--claude" \
  "--codex" \
  "--opencode" \
  "--gemini" \
  "--antigravity" \
  "--no-antigravity" \
  "--no-gemini"; do
  if ! grep -Fq -- "$expected" <<<"$HELP_OUTPUT"; then
    echo "Expected help output to contain: $expected" >&2
    echo "$HELP_OUTPUT" >&2
    exit 1
  fi
done

if ! grep -Fq -- "npx -y @ranimontagna/agent-toolkit --all --codex" "$ROOT_DIR/README.md"; then
  echo "Expected README to document one-command install through npm" >&2
  exit 1
fi

: > "$NPM_LOG"
: > "$GIT_LOG"
: > "$AGENT_BROWSER_LOG"
HOME="$HOME_DIR" \
PATH="$FAKE_BIN:/usr/bin:/bin" \
bash "$ROOT_DIR/setup-agent-toolkit.sh" --agent-browser-only --codex >/dev/null

if ! grep -Fxq -- "install --global agent-browser@0.31.1" "$NPM_LOG"; then
  echo "Expected Agent Browser package install through npm" >&2
  cat "$NPM_LOG" >&2
  exit 1
fi

if ! grep -Fxq -- "install" "$AGENT_BROWSER_LOG"; then
  echo "Expected Agent Browser to provision Chrome without system dependencies" >&2
  cat "$AGENT_BROWSER_LOG" >&2
  exit 1
fi

if ! grep -Eq -- "-y skills@1\\.5\\.13 add .+/skills/agent-browser --skill agent-browser --agent codex --global -y --copy" "$NPM_LOG"; then
  echo "Expected Agent Browser skill install for Codex" >&2
  cat "$NPM_LOG" >&2
  exit 1
fi

for expected_readme in \
  "React Doctor" \
  "millionco/react-doctor" \
  "Remotion Best Practices" \
  "remotion-dev/skills" \
  "Modified MIT License" \
  "agent skill integration, not automatic CI setup"; do
  if ! grep -Fq -- "$expected_readme" "$ROOT_DIR/README.md"; then
    echo "Expected README to document React Doctor detail: $expected_readme" >&2
    exit 1
  fi
done

: > "$NPM_LOG"
: > "$GIT_LOG"
: > "$AGENT_BROWSER_LOG"
DRY_RUN_HOME="$TMP_DIR/dry-run-home"
DRY_RUN_PROJECT="$TMP_DIR/dry-run-project"
mkdir -p "$DRY_RUN_HOME" "$DRY_RUN_PROJECT"

DRY_RUN_OUTPUT="$(
  cd "$DRY_RUN_PROJECT"
  HOME="$DRY_RUN_HOME" \
  XDG_CONFIG_HOME="$DRY_RUN_HOME/.config" \
  PATH="$FAKE_BIN:/usr/bin:/bin" \
  RTK_INSTALL_DIR="$TMP_DIR/dry-run-install-bin" \
  bash "$ROOT_DIR/setup-agent-toolkit.sh" --all --codex --dry-run
)"

if ! grep -Fq -- "Dry run: no changes were made." <<<"$DRY_RUN_OUTPUT" || \
  ! grep -Fq -- "Install plan" <<<"$DRY_RUN_OUTPUT"; then
  echo "Expected --dry-run to print an install plan and no-change message" >&2
  echo "$DRY_RUN_OUTPUT" >&2
  exit 1
fi

if [[ -s "$NPM_LOG" || -s "$GIT_LOG" || -e "$DRY_RUN_PROJECT/.codex/skills" ]]; then
  echo "Expected --dry-run to avoid installer side effects" >&2
  cat "$NPM_LOG" >&2
  cat "$GIT_LOG" >&2
  find "$DRY_RUN_PROJECT" -maxdepth 5 -type f -print >&2 || true
  exit 1
fi

DOCTOR_JSON="$(
  HOME="$DRY_RUN_HOME" \
  XDG_CONFIG_HOME="$DRY_RUN_HOME/.config" \
  PATH="$FAKE_BIN:/usr/bin:/bin" \
  bash "$ROOT_DIR/setup-agent-toolkit.sh" --doctor --json --codex
)"

DOCTOR_JSON="$DOCTOR_JSON" "$REAL_NODE" --input-type=module <<'NODE'
const report = JSON.parse(process.env.DOCTOR_JSON);
if (report.command !== "doctor" || !report.status || !Array.isArray(report.issues)) {
  throw new Error("Expected --doctor --json to emit a machine-readable doctor report");
}
if (!report.status.tools["agent-browser"].detail?.includes("Run agent-browser doctor")) {
  throw new Error("Expected Agent Browser status to provide a non-mutating Chrome validation hint");
}
NODE

if grep -Fxq -- "doctor" "$AGENT_BROWSER_LOG"; then
  echo "Expected Agent Toolkit doctor to avoid Agent Browser's mutating doctor command" >&2
  cat "$AGENT_BROWSER_LOG" >&2
  exit 1
fi

SKILLS_AUDIT_OUTPUT="$(
  HOME="$DRY_RUN_HOME" \
  PATH="$FAKE_BIN:/usr/bin:/bin" \
  bash "$ROOT_DIR/setup-agent-toolkit.sh" --skills-audit --skills-package core
)"

if ! grep -Fq -- "Skills audit passed" <<<"$SKILLS_AUDIT_OUTPUT"; then
  echo "Expected --skills-audit to pass for bundled core skills" >&2
  echo "$SKILLS_AUDIT_OUTPUT" >&2
  exit 1
fi

HOME="$HOME_DIR" \
XDG_CONFIG_HOME="$HOME_DIR/.config" \
PATH="$FAKE_BIN:/usr/bin:/bin" \
RTK_INSTALL_DIR="$TMP_DIR/install-bin" \
bash "$ROOT_DIR/setup-agent-toolkit.sh" --all --all-runtimes >/dev/null

if grep -Fq -- "agent-browser@" "$NPM_LOG" || grep -Fxq -- "install" "$AGENT_BROWSER_LOG"; then
  echo "Agent Browser must remain excluded from --all" >&2
  cat "$NPM_LOG" >&2
  cat "$AGENT_BROWSER_LOG" >&2
  exit 1
fi

if ! grep -Fxq -- "-y github:JuliusBrussee/caveman#25d22f864ad68cc447a4cb93aefde918aa4aec9f --only claude --only codex --only opencode --only gemini --minimal --non-interactive" "$NPM_LOG"; then
  echo "Expected Caveman installer to target Claude, Codex, OpenCode and Gemini" >&2
  cat "$NPM_LOG" >&2
  exit 1
fi

if grep -Fq -- "--only antigravity" "$NPM_LOG"; then
  echo "Caveman should not target Antigravity until the upstream installer supports it" >&2
  cat "$NPM_LOG" >&2
  exit 1
fi

if ! grep -Fxq -- "-y @opengsd/gsd-core@1.6.1 --global --claude --codex --opencode --gemini" "$NPM_LOG"; then
  echo "Expected GSD installer to target Claude, Codex, OpenCode and Gemini globally" >&2
  cat "$NPM_LOG" >&2
  exit 1
fi

if grep -Fq -- "--antigravity" "$NPM_LOG"; then
  echo "GSD should not target Antigravity until the upstream installer supports it" >&2
  cat "$NPM_LOG" >&2
  exit 1
fi

if ! grep -Eq -- "-y skills@1\\.5\\.13 add .+ --skill impeccable --agent claude-code --agent codex --agent opencode --agent gemini-cli --agent antigravity --global -y --copy" "$NPM_LOG"; then
  echo "Expected external frontend skill installer to install Impeccable for selected runtimes" >&2
  cat "$NPM_LOG" >&2
  exit 1
fi

if ! grep -Eq -- "-y skills@1\\.5\\.13 add .+ --skill web-design-guidelines --agent claude-code --agent codex --agent opencode --agent gemini-cli --agent antigravity --global -y --copy" "$NPM_LOG"; then
  echo "Expected external frontend skill installer to install Web Design Guidelines for selected runtimes" >&2
  cat "$NPM_LOG" >&2
  exit 1
fi

if ! grep -Eq -- "-y skills@1\\.5\\.13 add .+ --skill react-doctor --agent claude-code --agent codex --agent opencode --agent gemini-cli --agent antigravity --global -y --copy" "$NPM_LOG"; then
  echo "Expected external frontend skill installer to install React Doctor for selected runtimes" >&2
  cat "$NPM_LOG" >&2
  exit 1
fi

if ! grep -Eq -- "-y skills@1\\.5\\.13 add .+ --skill remotion-best-practices --agent claude-code --agent codex --agent opencode --agent gemini-cli --agent antigravity --global -y --copy" "$NPM_LOG"; then
  echo "Expected Remotion Best Practices installer for selected runtimes" >&2
  cat "$NPM_LOG" >&2
  exit 1
fi

if ! grep -Eq -- "-y skills@1\\.5\\.13 add .+/skills/improve --skill improve --agent claude-code --agent codex --agent opencode --agent gemini-cli --agent antigravity --global -y --copy" "$NPM_LOG"; then
  echo "Expected Improve installer to install the pinned shadcn Improve skill for selected runtimes" >&2
  cat "$NPM_LOG" >&2
  exit 1
fi

: > "$NPM_LOG"
HOME="$HOME_DIR" \
XDG_CONFIG_HOME="$HOME_DIR/.config" \
PATH="$FAKE_BIN:/usr/bin:/bin" \
bash "$ROOT_DIR/setup-agent-toolkit.sh" --caveman-only --antigravity >/dev/null

if grep -Fq -- "github:JuliusBrussee/caveman" "$NPM_LOG"; then
  echo "Expected --caveman-only --antigravity to skip the Caveman upstream installer" >&2
  cat "$NPM_LOG" >&2
  exit 1
fi

HOME="$HOME_DIR" \
XDG_CONFIG_HOME="$HOME_DIR/.config" \
PATH="$FAKE_BIN:/usr/bin:/bin" \
bash "$ROOT_DIR/setup-agent-toolkit.sh" --gsd-only --antigravity >/dev/null

if grep -Fq -- "@opengsd/gsd-core" "$NPM_LOG"; then
  echo "Expected --gsd-only --antigravity to skip the GSD upstream installer" >&2
  cat "$NPM_LOG" >&2
  exit 1
fi

if ! grep -Fq -- "https://github.com/pbakaus/impeccable.git" "$GIT_LOG"; then
  echo "Expected Impeccable source to be cloned before CLI installation" >&2
  cat "$GIT_LOG" >&2
  exit 1
fi

if ! grep -Fq -- "https://github.com/vercel-labs/agent-skills.git" "$GIT_LOG"; then
  echo "Expected Web Design Guidelines source to be cloned before CLI installation" >&2
  cat "$GIT_LOG" >&2
  exit 1
fi

if ! grep -Fq -- "https://github.com/millionco/react-doctor.git" "$GIT_LOG"; then
  echo "Expected React Doctor source to be cloned before CLI installation" >&2
  cat "$GIT_LOG" >&2
  exit 1
fi

if ! grep -Fq -- "https://github.com/remotion-dev/skills.git" "$GIT_LOG"; then
  echo "Expected Remotion Best Practices source to be cloned before CLI installation" >&2
  cat "$GIT_LOG" >&2
  exit 1
fi

if ! grep -Fq -- "https://github.com/shadcn/improve.git" "$GIT_LOG"; then
  echo "Expected Improve source to be cloned before CLI installation" >&2
  cat "$GIT_LOG" >&2
  exit 1
fi

if ! grep -Fxq -- "tool install graphifyy==0.9.11" "$GRAPHIFY_LOG"; then
  echo "Expected Graphify package install through uv tool" >&2
  cat "$GRAPHIFY_LOG" >&2
  exit 1
fi

for expected_graphify in \
  "install" \
  "install --platform codex" \
  "install --platform opencode" \
  "install --platform gemini"; do
  if ! grep -Fxq -- "$expected_graphify" "$GRAPHIFY_LOG"; then
    echo "Expected Graphify install command: $expected_graphify" >&2
    cat "$GRAPHIFY_LOG" >&2
    exit 1
  fi
done

if grep -Fxq -- "install --platform antigravity" "$GRAPHIFY_LOG"; then
  echo "Graphify should not target Antigravity until Graphify supports that platform" >&2
  cat "$GRAPHIFY_LOG" >&2
  exit 1
fi

if ! grep -Fxq -- "plugin install superpowers@claude-plugins-official" "$CLAUDE_LOG"; then
  echo "Expected Claude Superpowers plugin install" >&2
  cat "$CLAUDE_LOG" >&2
  exit 1
fi

if ! grep -Fxq -- "plugin add superpowers@openai-curated" "$CODEX_LOG"; then
  echo "Expected Codex Superpowers plugin install" >&2
  cat "$CODEX_LOG" >&2
  exit 1
fi

if ! grep -Fxq -- "extensions install https://github.com/obra/superpowers" "$GEMINI_LOG"; then
  echo "Expected Gemini Superpowers extension install" >&2
  cat "$GEMINI_LOG" >&2
  exit 1
fi

if [[ -s "$OPENCODE_LOG" ]] && grep -Fqi -- "superpowers" "$OPENCODE_LOG"; then
  echo "Superpowers should not pretend to install into OpenCode" >&2
  cat "$OPENCODE_LOG" >&2
  exit 1
fi

if [[ -s "$ANTIGRAVITY_LOG" ]] && grep -Fqi -- "superpowers" "$ANTIGRAVITY_LOG"; then
  echo "Superpowers should not pretend to install into Antigravity" >&2
  cat "$ANTIGRAVITY_LOG" >&2
  exit 1
fi

for skill_target in \
  "$HOME_DIR/.claude/skills/agent-toolkit-maintainer/SKILL.md" \
  "$HOME_DIR/.codex/skills/agent-toolkit-maintainer/SKILL.md" \
  "$HOME_DIR/.config/opencode/skills/agent-toolkit-maintainer/SKILL.md" \
  "$HOME_DIR/.agents/skills/agent-toolkit-maintainer/SKILL.md"; do
  if [[ ! -f "$skill_target" ]]; then
    echo "Expected custom skill to be installed at: $skill_target" >&2
    find "$HOME_DIR" -maxdepth 5 -type f -name SKILL.md -print >&2 || true
    exit 1
  fi
done

if ! grep -Fq -- "skills install $ROOT_DIR/skills/core/agent-toolkit-maintainer --scope user --consent" "$GEMINI_LOG"; then
  echo "Expected Gemini native skill install for bundled custom skill" >&2
  cat "$GEMINI_LOG" >&2
  exit 1
fi

CUSTOM_SKILLS_HOME="$TMP_DIR/custom-skills-home"
CUSTOM_PROJECT="$TMP_DIR/custom-project"
CUSTOM_SOURCE="$TMP_DIR/custom-source"
mkdir -p "$CUSTOM_SKILLS_HOME" "$CUSTOM_PROJECT" "$CUSTOM_SOURCE/sample-skill"
cat > "$CUSTOM_SOURCE/sample-skill/SKILL.md" <<'EOF'
---
name: sample-skill
description: Sample skill for installer test.
---

# Sample Skill
EOF

(
  cd "$CUSTOM_PROJECT"
  HOME="$CUSTOM_SKILLS_HOME" \
  PATH="$FAKE_BIN:/usr/bin:/bin" \
  bash "$ROOT_DIR/setup-agent-toolkit.sh" --skills-only --codex --local --skills-dir "$CUSTOM_SOURCE" >/dev/null
)

if [[ ! -f "$CUSTOM_PROJECT/.codex/skills/sample-skill/SKILL.md" ]]; then
  echo "Expected --skills-dir with --local --codex to install into project .codex/skills" >&2
  find "$CUSTOM_PROJECT" -maxdepth 5 -type f -print >&2 || true
  exit 1
fi

if [[ ! -f "$CUSTOM_PROJECT/.agent-toolkit/install-manifest.json" ]]; then
  echo "Expected local custom skill install to write an Agent Toolkit manifest" >&2
  find "$CUSTOM_PROJECT" -maxdepth 5 -type f -print >&2 || true
  exit 1
fi

UNINSTALL_DRY_RUN_OUTPUT="$(
  cd "$CUSTOM_PROJECT"
  HOME="$CUSTOM_SKILLS_HOME" \
  PATH="$FAKE_BIN:/usr/bin:/bin" \
  bash "$ROOT_DIR/setup-agent-toolkit.sh" --uninstall --dry-run --skills-only --codex --local 2>&1
)"

if ! grep -Fq -- "Dry run: no changes were made." <<<"$UNINSTALL_DRY_RUN_OUTPUT" || \
  ! grep -Fq -- "Would remove" <<<"$UNINSTALL_DRY_RUN_OUTPUT"; then
  echo "Expected --uninstall --dry-run to report the removal plan without acting" >&2
  echo "$UNINSTALL_DRY_RUN_OUTPUT" >&2
  exit 1
fi

if [[ ! -f "$CUSTOM_PROJECT/.codex/skills/sample-skill/SKILL.md" ]]; then
  echo "Expected --uninstall --dry-run to leave installed skills untouched" >&2
  find "$CUSTOM_PROJECT" -maxdepth 5 -type f -print >&2 || true
  exit 1
fi

(
  cd "$CUSTOM_PROJECT"
  HOME="$CUSTOM_SKILLS_HOME" \
  PATH="$FAKE_BIN:/usr/bin:/bin" \
  bash "$ROOT_DIR/setup-agent-toolkit.sh" --uninstall --skills-only --codex --local >/dev/null
)

if [[ -e "$CUSTOM_PROJECT/.codex/skills/sample-skill" ]]; then
  echo "Expected --uninstall to remove skill directories recorded in the manifest" >&2
  find "$CUSTOM_PROJECT" -maxdepth 5 -type f -print >&2 || true
  exit 1
fi

CUSTOM_ANTIGRAVITY_PROJECT="$TMP_DIR/custom-antigravity-project"
mkdir -p "$CUSTOM_ANTIGRAVITY_PROJECT"

(
  cd "$CUSTOM_ANTIGRAVITY_PROJECT"
  HOME="$CUSTOM_SKILLS_HOME" \
  PATH="$FAKE_BIN:/usr/bin:/bin" \
  bash "$ROOT_DIR/setup-agent-toolkit.sh" --skills-only --antigravity --local --skills-dir "$CUSTOM_SOURCE" >/dev/null
)

if [[ ! -f "$CUSTOM_ANTIGRAVITY_PROJECT/.agents/skills/sample-skill/SKILL.md" ]]; then
  echo "Expected --skills-dir with --local --antigravity to install into project .agents/skills" >&2
  find "$CUSTOM_ANTIGRAVITY_PROJECT" -maxdepth 5 -type f -print >&2 || true
  exit 1
fi

ANTIGRAVITY_GLOBAL_HOME="$TMP_DIR/antigravity-global-home"
mkdir -p "$ANTIGRAVITY_GLOBAL_HOME"

HOME="$ANTIGRAVITY_GLOBAL_HOME" \
PATH="$FAKE_BIN:/usr/bin:/bin" \
bash "$ROOT_DIR/setup-agent-toolkit.sh" --skills-only --antigravity --global --skills-dir "$CUSTOM_SOURCE" >/dev/null

for antigravity_skill_target in \
  "$ANTIGRAVITY_GLOBAL_HOME/.gemini/antigravity-cli/skills/sample-skill/SKILL.md" \
  "$ANTIGRAVITY_GLOBAL_HOME/.agents/skills/sample-skill/SKILL.md"; do
  if [[ ! -f "$antigravity_skill_target" ]]; then
    echo "Expected global Antigravity skill mirror at: $antigravity_skill_target" >&2
    find "$ANTIGRAVITY_GLOBAL_HOME" -maxdepth 6 -type f -print >&2 || true
    exit 1
  fi
done

TECH_SKILLS_HOME="$TMP_DIR/tech-skills-home"
TECH_SKILLS_PROJECT="$TMP_DIR/tech-skills-project"
TECH_SOURCE="$TMP_DIR/tech-source"
mkdir -p \
  "$TECH_SKILLS_HOME" \
  "$TECH_SKILLS_PROJECT" \
  "$TECH_SOURCE/frontend/react/react-patterns" \
  "$TECH_SOURCE/backend/node/fastify-patterns" \
  "$TECH_SOURCE/backend/go/go-patterns"

cat > "$TECH_SOURCE/frontend/react/react-patterns/SKILL.md" <<'EOF'
---
name: react-patterns
description: React patterns for installer recursion test.
---

# React Patterns
EOF

cat > "$TECH_SOURCE/backend/node/fastify-patterns/SKILL.md" <<'EOF'
---
name: fastify-patterns
description: Fastify patterns for installer scope test.
---

# Fastify Patterns
EOF

cat > "$TECH_SOURCE/backend/go/go-patterns/SKILL.md" <<'EOF'
---
name: go-patterns
description: Go patterns for installer scope test.
---

# Go Patterns
EOF

(
  cd "$TECH_SKILLS_PROJECT"
  HOME="$TECH_SKILLS_HOME" \
  PATH="$FAKE_BIN:/usr/bin:/bin" \
  bash "$ROOT_DIR/setup-agent-toolkit.sh" --skills-only --codex --local --skills-dir "$TECH_SOURCE" --skills-scope frontend/react >/dev/null
)

if [[ ! -f "$TECH_SKILLS_PROJECT/.codex/skills/react-patterns/SKILL.md" ]]; then
  echo "Expected recursive scoped skill install for frontend/react" >&2
  find "$TECH_SKILLS_PROJECT" -maxdepth 6 -type f -print >&2 || true
  exit 1
fi

if [[ -f "$TECH_SKILLS_PROJECT/.codex/skills/fastify-patterns/SKILL.md" || -f "$TECH_SKILLS_PROJECT/.codex/skills/go-patterns/SKILL.md" ]]; then
  echo "Expected --skills-scope frontend/react to exclude backend skills" >&2
  find "$TECH_SKILLS_PROJECT" -maxdepth 6 -type f -print >&2 || true
  exit 1
fi

PACKAGE_SKILLS_PROJECT="$TMP_DIR/package-skills-project"
mkdir -p "$PACKAGE_SKILLS_PROJECT"

(
  cd "$PACKAGE_SKILLS_PROJECT"
  HOME="$TECH_SKILLS_HOME" \
  PATH="$FAKE_BIN:/usr/bin:/bin" \
  bash "$ROOT_DIR/setup-agent-toolkit.sh" --skills-only --codex --local --skills-dir "$TECH_SOURCE" --skills-package backend >/dev/null
)

if [[ ! -f "$PACKAGE_SKILLS_PROJECT/.codex/skills/fastify-patterns/SKILL.md" || ! -f "$PACKAGE_SKILLS_PROJECT/.codex/skills/go-patterns/SKILL.md" ]]; then
  echo "Expected --skills-package backend to install backend skills" >&2
  find "$PACKAGE_SKILLS_PROJECT" -maxdepth 6 -type f -print >&2 || true
  exit 1
fi

if [[ -f "$PACKAGE_SKILLS_PROJECT/.codex/skills/react-patterns/SKILL.md" ]]; then
  echo "Expected --skills-package backend to exclude frontend skills" >&2
  find "$PACKAGE_SKILLS_PROJECT" -maxdepth 6 -type f -print >&2 || true
  exit 1
fi

PATH_SKILLS_PROJECT="$TMP_DIR/path-skills-project"
mkdir -p "$PATH_SKILLS_PROJECT"

(
  cd "$PATH_SKILLS_PROJECT"
  HOME="$TECH_SKILLS_HOME" \
  PATH="$FAKE_BIN:/usr/bin:/bin" \
  bash "$ROOT_DIR/setup-agent-toolkit.sh" --skills-only --codex --local --skills-dir "$TECH_SOURCE" --skills-package backend --skills-scope backend/go --skills-path backend/go/go-patterns >/dev/null
)

if [[ ! -f "$PATH_SKILLS_PROJECT/.codex/skills/go-patterns/SKILL.md" ]]; then
  echo "Expected --skills-path to install exact selected skill" >&2
  find "$PATH_SKILLS_PROJECT" -maxdepth 6 -type f -print >&2 || true
  exit 1
fi

if [[ -f "$PATH_SKILLS_PROJECT/.codex/skills/fastify-patterns/SKILL.md" ]]; then
  echo "Expected --skills-path to exclude unselected backend skills" >&2
  find "$PATH_SKILLS_PROJECT" -maxdepth 6 -type f -print >&2 || true
  exit 1
fi

SKILLS_LIST_OUTPUT="$(
  HOME="$TECH_SKILLS_HOME" \
  PATH="$FAKE_BIN:/usr/bin:/bin" \
  bash "$ROOT_DIR/setup-agent-toolkit.sh" --skills-list --skills-dir "$TECH_SOURCE"
)"

for expected_skill_list_item in \
  "frontend/react/react-patterns" \
  "backend/node/fastify-patterns" \
  "backend/go/go-patterns"; do
  if ! grep -Fq -- "$expected_skill_list_item" <<<"$SKILLS_LIST_OUTPUT"; then
    echo "Expected --skills-list to show recursive skill path: $expected_skill_list_item" >&2
    echo "$SKILLS_LIST_OUTPUT" >&2
    exit 1
  fi
done

REPO_BACKEND_SKILLS_OUTPUT="$(
  HOME="$TECH_SKILLS_HOME" \
  PATH="$FAKE_BIN:/usr/bin:/bin" \
  bash "$ROOT_DIR/setup-agent-toolkit.sh" --skills-list --skills-package backend
)"

for expected_backend_skill in \
  "backend/api/api-design" \
  "backend/database/postgres-patterns" \
  "backend/fastify-best-practices" \
  "backend/go/golang-patterns" \
  "backend/go/golang-testing" \
  "backend/java/java-coding-standards" \
  "backend/java/java-junit" \
  "backend/kotlin/kotlin-patterns" \
  "backend/kotlin/kotlin-testing" \
  "backend/python/python-patterns" \
  "backend/python/python-testing"; do
  if ! grep -Fq -- "$expected_backend_skill" <<<"$REPO_BACKEND_SKILLS_OUTPUT"; then
    echo "Expected repository backend package to include: $expected_backend_skill" >&2
    echo "$REPO_BACKEND_SKILLS_OUTPUT" >&2
    exit 1
  fi
done

REPO_API_SKILLS_OUTPUT="$(
  HOME="$TECH_SKILLS_HOME" \
  PATH="$FAKE_BIN:/usr/bin:/bin" \
  bash "$ROOT_DIR/setup-agent-toolkit.sh" --skills-list --skills-package backend --skills-scope backend/api
)"

if ! grep -Fq -- "backend/api/api-design" <<<"$REPO_API_SKILLS_OUTPUT" || \
  grep -Fq -- "backend/python/python-patterns" <<<"$REPO_API_SKILLS_OUTPUT"; then
  echo "Expected backend/api scope to list only API skills" >&2
  echo "$REPO_API_SKILLS_OUTPUT" >&2
  exit 1
fi

REPO_JAVA_SKILLS_OUTPUT="$(
  HOME="$TECH_SKILLS_HOME" \
  PATH="$FAKE_BIN:/usr/bin:/bin" \
  bash "$ROOT_DIR/setup-agent-toolkit.sh" --skills-list --skills-package backend --skills-scope backend/java
)"

if ! grep -Fq -- "backend/java/java-coding-standards" <<<"$REPO_JAVA_SKILLS_OUTPUT" || \
  ! grep -Fq -- "backend/java/java-junit" <<<"$REPO_JAVA_SKILLS_OUTPUT" || \
  grep -Fq -- "backend/go/golang-patterns" <<<"$REPO_JAVA_SKILLS_OUTPUT"; then
  echo "Expected backend/java scope to list only Java skills" >&2
  echo "$REPO_JAVA_SKILLS_OUTPUT" >&2
  exit 1
fi

REPO_GO_SKILLS_OUTPUT="$(
  HOME="$TECH_SKILLS_HOME" \
  PATH="$FAKE_BIN:/usr/bin:/bin" \
  bash "$ROOT_DIR/setup-agent-toolkit.sh" --skills-list --skills-package backend --skills-scope backend/go
)"

if ! grep -Fq -- "backend/go/golang-patterns" <<<"$REPO_GO_SKILLS_OUTPUT" || \
  ! grep -Fq -- "backend/go/golang-testing" <<<"$REPO_GO_SKILLS_OUTPUT" || \
  grep -Fq -- "backend/java/java-junit" <<<"$REPO_GO_SKILLS_OUTPUT"; then
  echo "Expected backend/go scope to list only Go skills" >&2
  echo "$REPO_GO_SKILLS_OUTPUT" >&2
  exit 1
fi

REPO_KOTLIN_SKILLS_OUTPUT="$(
  HOME="$TECH_SKILLS_HOME" \
  PATH="$FAKE_BIN:/usr/bin:/bin" \
  bash "$ROOT_DIR/setup-agent-toolkit.sh" --skills-list --skills-package backend --skills-scope backend/kotlin
)"

if ! grep -Fq -- "backend/kotlin/kotlin-patterns" <<<"$REPO_KOTLIN_SKILLS_OUTPUT" || \
  ! grep -Fq -- "backend/kotlin/kotlin-testing" <<<"$REPO_KOTLIN_SKILLS_OUTPUT" || \
  grep -Fq -- "backend/java/java-junit" <<<"$REPO_KOTLIN_SKILLS_OUTPUT"; then
  echo "Expected backend/kotlin scope to list only Kotlin skills" >&2
  echo "$REPO_KOTLIN_SKILLS_OUTPUT" >&2
  exit 1
fi

REPO_PYTHON_SKILLS_OUTPUT="$(
  HOME="$TECH_SKILLS_HOME" \
  PATH="$FAKE_BIN:/usr/bin:/bin" \
  bash "$ROOT_DIR/setup-agent-toolkit.sh" --skills-list --skills-package backend --skills-scope backend/python
)"

if ! grep -Fq -- "backend/python/python-patterns" <<<"$REPO_PYTHON_SKILLS_OUTPUT" || \
  ! grep -Fq -- "backend/python/python-testing" <<<"$REPO_PYTHON_SKILLS_OUTPUT" || \
  grep -Fq -- "backend/java/java-junit" <<<"$REPO_PYTHON_SKILLS_OUTPUT"; then
  echo "Expected backend/python scope to list only Python skills" >&2
  echo "$REPO_PYTHON_SKILLS_OUTPUT" >&2
  exit 1
fi

REPO_DATABASE_SKILLS_OUTPUT="$(
  HOME="$TECH_SKILLS_HOME" \
  PATH="$FAKE_BIN:/usr/bin:/bin" \
  bash "$ROOT_DIR/setup-agent-toolkit.sh" --skills-list --skills-package backend --skills-scope backend/database
)"

if ! grep -Fq -- "backend/database/postgres-patterns" <<<"$REPO_DATABASE_SKILLS_OUTPUT" || \
  grep -Fq -- "backend/go/golang-patterns" <<<"$REPO_DATABASE_SKILLS_OUTPUT" || \
  grep -Fq -- "backend/java/java-junit" <<<"$REPO_DATABASE_SKILLS_OUTPUT"; then
  echo "Expected backend/database scope to list only database skills" >&2
  echo "$REPO_DATABASE_SKILLS_OUTPUT" >&2
  exit 1
fi

REPO_FRONTEND_SKILLS_OUTPUT="$(
  HOME="$TECH_SKILLS_HOME" \
  PATH="$FAKE_BIN:/usr/bin:/bin" \
  bash "$ROOT_DIR/setup-agent-toolkit.sh" --skills-list --skills-package frontend
)"

for expected_frontend_skill in \
  "frontend/accessibility" \
  "frontend/astro/astro-developer" \
  "frontend/design/revenue-centric-design" \
  "frontend/design/ui-ux-pro-max" \
  "frontend/gsap/gsap-core" \
  "frontend/gsap/gsap-frameworks" \
  "frontend/gsap/gsap-performance" \
  "frontend/gsap/gsap-plugins" \
  "frontend/gsap/gsap-react" \
  "frontend/gsap/gsap-scrolltrigger" \
  "frontend/gsap/gsap-timeline" \
  "frontend/gsap/gsap-utils" \
  "frontend/react-native/react-native-expert" \
  "frontend/react-native/react-native-unistyles-v3" \
  "frontend/react/react-patterns" \
  "frontend/react/react-performance" \
  "frontend/react/react-testing"; do
  if ! grep -Fq -- "$expected_frontend_skill" <<<"$REPO_FRONTEND_SKILLS_OUTPUT"; then
    echo "Expected repository frontend package to include: $expected_frontend_skill" >&2
    echo "$REPO_FRONTEND_SKILLS_OUTPUT" >&2
    exit 1
  fi
done

REPO_ASTRO_SKILLS_OUTPUT="$(
  HOME="$TECH_SKILLS_HOME" \
  PATH="$FAKE_BIN:/usr/bin:/bin" \
  bash "$ROOT_DIR/setup-agent-toolkit.sh" --skills-list --skills-package frontend --skills-scope frontend/astro
)"

if ! grep -Fq -- "frontend/astro/astro-developer" <<<"$REPO_ASTRO_SKILLS_OUTPUT" || \
  grep -Fq -- "frontend/react/react-patterns" <<<"$REPO_ASTRO_SKILLS_OUTPUT"; then
  echo "Expected frontend/astro scope to list only Astro skills" >&2
  echo "$REPO_ASTRO_SKILLS_OUTPUT" >&2
  exit 1
fi

REPO_GSAP_SKILLS_OUTPUT="$(
  HOME="$TECH_SKILLS_HOME" \
  PATH="$FAKE_BIN:/usr/bin:/bin" \
  bash "$ROOT_DIR/setup-agent-toolkit.sh" --skills-list --skills-package frontend --skills-scope frontend/gsap
)"

if ! grep -Fq -- "frontend/gsap/gsap-core" <<<"$REPO_GSAP_SKILLS_OUTPUT" || \
  ! grep -Fq -- "frontend/gsap/gsap-scrolltrigger" <<<"$REPO_GSAP_SKILLS_OUTPUT" || \
  grep -Fq -- "frontend/react/react-patterns" <<<"$REPO_GSAP_SKILLS_OUTPUT"; then
  echo "Expected frontend/gsap scope to list only GSAP skills" >&2
  echo "$REPO_GSAP_SKILLS_OUTPUT" >&2
  exit 1
fi

REPO_REACT_NATIVE_SKILLS_OUTPUT="$(
  HOME="$TECH_SKILLS_HOME" \
  PATH="$FAKE_BIN:/usr/bin:/bin" \
  bash "$ROOT_DIR/setup-agent-toolkit.sh" --skills-list --skills-package frontend --skills-scope frontend/react-native
)"

if ! grep -Fq -- "frontend/react-native/react-native-expert" <<<"$REPO_REACT_NATIVE_SKILLS_OUTPUT" || \
  ! grep -Fq -- "frontend/react-native/react-native-unistyles-v3" <<<"$REPO_REACT_NATIVE_SKILLS_OUTPUT" || \
  grep -Fq -- "frontend/react/react-patterns" <<<"$REPO_REACT_NATIVE_SKILLS_OUTPUT"; then
  echo "Expected frontend/react-native scope to list only React Native skills" >&2
  echo "$REPO_REACT_NATIVE_SKILLS_OUTPUT" >&2
  exit 1
fi

REPO_FRONTEND_DESIGN_SKILLS_OUTPUT="$(
  HOME="$TECH_SKILLS_HOME" \
  PATH="$FAKE_BIN:/usr/bin:/bin" \
  bash "$ROOT_DIR/setup-agent-toolkit.sh" --skills-list --skills-package frontend --skills-scope frontend/design
)"

if ! grep -Fq -- "frontend/design/revenue-centric-design" <<<"$REPO_FRONTEND_DESIGN_SKILLS_OUTPUT" || \
  ! grep -Fq -- "frontend/design/ui-ux-pro-max" <<<"$REPO_FRONTEND_DESIGN_SKILLS_OUTPUT" || \
  grep -Fq -- "frontend/react/react-patterns" <<<"$REPO_FRONTEND_DESIGN_SKILLS_OUTPUT"; then
  echo "Expected frontend/design scope to list only design skills" >&2
  echo "$REPO_FRONTEND_DESIGN_SKILLS_OUTPUT" >&2
  exit 1
fi

REPO_GENERAL_SKILLS_OUTPUT="$(
  HOME="$TECH_SKILLS_HOME" \
  PATH="$FAKE_BIN:/usr/bin:/bin" \
  bash "$ROOT_DIR/setup-agent-toolkit.sh" --skills-list --skills-package general
)"

if ! grep -Fq -- "general/code-reviewer" <<<"$REPO_GENERAL_SKILLS_OUTPUT"; then
  echo "Expected general package to include code-reviewer skill" >&2
  echo "$REPO_GENERAL_SKILLS_OUTPUT" >&2
  exit 1
fi

REPO_DEVOPS_SKILLS_OUTPUT="$(
  HOME="$TECH_SKILLS_HOME" \
  PATH="$FAKE_BIN:/usr/bin:/bin" \
  bash "$ROOT_DIR/setup-agent-toolkit.sh" --skills-list --skills-package devops
)"

if ! grep -Fq -- "devops/docker-patterns" <<<"$REPO_DEVOPS_SKILLS_OUTPUT"; then
  echo "Expected devops package to include docker-patterns skill" >&2
  echo "$REPO_DEVOPS_SKILLS_OUTPUT" >&2
  exit 1
fi

REPO_REACT_PROJECT="$TMP_DIR/repo-react-project"
mkdir -p "$REPO_REACT_PROJECT"

(
  cd "$REPO_REACT_PROJECT"
  HOME="$TECH_SKILLS_HOME" \
    PATH="$FAKE_BIN:/usr/bin:/bin" \
    bash "$ROOT_DIR/setup-agent-toolkit.sh" --skills-only --codex --local --skills-package frontend --skills-scope frontend/react >/dev/null
)

for expected_react_rule in \
  "$REPO_REACT_PROJECT/.codex/skills/react-patterns/rules/react/hooks.md" \
  "$REPO_REACT_PROJECT/.codex/skills/react-testing/rules/react/testing.md" \
  "$REPO_REACT_PROJECT/.codex/skills/react-performance/rules/react/patterns.md"; do
  if [[ ! -f "$expected_react_rule" ]]; then
    echo "Expected installed React skill rule reference to exist: $expected_react_rule" >&2
    find "$REPO_REACT_PROJECT/.codex/skills" -maxdepth 5 -type f -print >&2 || true
    exit 1
  fi
done

REPO_DESIGN_PROJECT="$TMP_DIR/repo-design-project"
mkdir -p "$REPO_DESIGN_PROJECT"

(
  cd "$REPO_DESIGN_PROJECT"
  HOME="$TECH_SKILLS_HOME" \
    PATH="$FAKE_BIN:/usr/bin:/bin" \
    bash "$ROOT_DIR/setup-agent-toolkit.sh" --skills-only --codex --local --skills-package frontend --skills-scope frontend/design >/dev/null
)

for expected_design_file in \
  "$REPO_DESIGN_PROJECT/.codex/skills/ui-ux-pro-max/scripts/search.py" \
  "$REPO_DESIGN_PROJECT/.codex/skills/ui-ux-pro-max/scripts/core.py" \
  "$REPO_DESIGN_PROJECT/.codex/skills/ui-ux-pro-max/data/styles.csv" \
  "$REPO_DESIGN_PROJECT/.codex/skills/ui-ux-pro-max/data/stacks/react.csv" \
  "$REPO_DESIGN_PROJECT/.codex/skills/revenue-centric-design/SKILL.md" \
  "$REPO_DESIGN_PROJECT/.codex/skills/revenue-centric-design/LICENSE" \
  "$REPO_DESIGN_PROJECT/.codex/skills/revenue-centric-design/NOTICE.md" \
  "$REPO_DESIGN_PROJECT/.codex/skills/revenue-centric-design/references/pricing-and-monetization.md" \
  "$REPO_DESIGN_PROJECT/.codex/skills/revenue-centric-design/assets/2070140923380420796__1.jpg"; do
  if [[ ! -f "$expected_design_file" ]]; then
    echo "Expected installed design skill support file to exist: $expected_design_file" >&2
    find "$REPO_DESIGN_PROJECT/.codex/skills" -maxdepth 5 -type f -print >&2 || true
    exit 1
  fi
done

REPO_GSAP_PROJECT="$TMP_DIR/repo-gsap-project"
mkdir -p "$REPO_GSAP_PROJECT"

(
  cd "$REPO_GSAP_PROJECT"
  HOME="$TECH_SKILLS_HOME" \
    PATH="$FAKE_BIN:/usr/bin:/bin" \
    bash "$ROOT_DIR/setup-agent-toolkit.sh" --skills-only --codex --local --skills-package frontend --skills-scope frontend/gsap >/dev/null
)

for expected_gsap_file in \
  "$REPO_GSAP_PROJECT/.codex/skills/gsap-core/SKILL.md" \
  "$REPO_GSAP_PROJECT/.codex/skills/gsap-scrolltrigger/NOTICE.md" \
  "$REPO_GSAP_PROJECT/.codex/skills/gsap-react/LICENSE"; do
  if [[ ! -f "$expected_gsap_file" ]]; then
    echo "Expected installed GSAP skill file to exist: $expected_gsap_file" >&2
    find "$REPO_GSAP_PROJECT/.codex/skills" -maxdepth 3 -type f -print >&2 || true
    exit 1
  fi
done

INTERACTIVE_HOME="$TMP_DIR/interactive-home"
INTERACTIVE_PROJECT="$TMP_DIR/interactive-project"
INTERACTIVE_LOG="$TMP_DIR/interactive.log"
mkdir -p "$INTERACTIVE_HOME" "$INTERACTIVE_PROJECT"

(
  cd "$INTERACTIVE_PROJECT"
  printf 'skills\ncodex\nlocal\nn\nfrontend/react\n' | HOME="$INTERACTIVE_HOME" \
    PATH="$FAKE_BIN:/usr/bin:/bin" \
    bash "$ROOT_DIR/setup-agent-toolkit.sh" --skills-dir "$TECH_SOURCE" >"$INTERACTIVE_LOG" 2>&1
)

if [[ ! -f "$INTERACTIVE_PROJECT/.codex/skills/react-patterns/SKILL.md" ]]; then
  echo "Expected interactive install to install selected frontend/react skill only" >&2
  cat "$INTERACTIVE_LOG" >&2
  find "$INTERACTIVE_PROJECT" -maxdepth 6 -type f -print >&2 || true
  exit 1
fi

if [[ -f "$INTERACTIVE_PROJECT/.codex/skills/fastify-patterns/SKILL.md" || -f "$INTERACTIVE_PROJECT/.codex/skills/go-patterns/SKILL.md" ]]; then
  echo "Expected interactive skill scope to exclude unselected skills" >&2
  cat "$INTERACTIVE_LOG" >&2
  find "$INTERACTIVE_PROJECT" -maxdepth 6 -type f -print >&2 || true
  exit 1
fi

if grep -Fq -- "Caveman installer completed" "$INTERACTIVE_LOG"; then
  echo "Expected interactive selection to avoid installing unselected tools" >&2
  cat "$INTERACTIVE_LOG" >&2
  exit 1
fi

INTERACTIVE_GRANULAR_PROJECT="$TMP_DIR/interactive-granular-project"
INTERACTIVE_GRANULAR_LOG="$TMP_DIR/interactive-granular.log"
mkdir -p "$INTERACTIVE_GRANULAR_PROJECT"

(
  cd "$INTERACTIVE_GRANULAR_PROJECT"
  printf 'skills\ncodex\nlocal\nn\nbackend\nbackend/python\nbackend/python/python-testing\n' | HOME="$INTERACTIVE_HOME" \
    PATH="$FAKE_BIN:/usr/bin:/bin" \
    bash "$ROOT_DIR/setup-agent-toolkit.sh" >"$INTERACTIVE_GRANULAR_LOG" 2>&1
)

if [[ ! -f "$INTERACTIVE_GRANULAR_PROJECT/.codex/skills/python-testing/SKILL.md" ]]; then
  echo "Expected interactive granular skill selection to install python-testing" >&2
  cat "$INTERACTIVE_GRANULAR_LOG" >&2
  find "$INTERACTIVE_GRANULAR_PROJECT" -maxdepth 6 -type f -print >&2 || true
  exit 1
fi

if [[ -f "$INTERACTIVE_GRANULAR_PROJECT/.codex/skills/python-patterns/SKILL.md" ]]; then
  echo "Expected interactive granular skill selection to exclude python-patterns" >&2
  cat "$INTERACTIVE_GRANULAR_LOG" >&2
  find "$INTERACTIVE_GRANULAR_PROJECT" -maxdepth 6 -type f -print >&2 || true
  exit 1
fi

GEMINI_LOCAL_LOG="$TMP_DIR/gemini-local.log"
cat > "$FAKE_BIN/gemini" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$GEMINI_LOCAL_LOG"
case "\${1:-}" in
  --version) echo "gemini 0.0.0-test" ;;
esac
exit 0
EOF
chmod +x "$FAKE_BIN/gemini"

(
  cd "$CUSTOM_PROJECT"
  HOME="$CUSTOM_SKILLS_HOME" \
  PATH="$FAKE_BIN:/usr/bin:/bin" \
  bash "$ROOT_DIR/setup-agent-toolkit.sh" --skills-only --gemini --local --skills-dir "$CUSTOM_SOURCE" >/dev/null
)

if ! grep -Fxq -- "skills install $CUSTOM_SOURCE/sample-skill --scope workspace --consent" "$GEMINI_LOCAL_LOG"; then
  echo "Expected Gemini local skill install to use workspace scope" >&2
  cat "$GEMINI_LOCAL_LOG" >&2
  exit 1
fi

GRAPHIFY_ONLY_HOME="$TMP_DIR/graphify-only-home"
GRAPHIFY_ONLY_LOG="$TMP_DIR/graphify-only.log"
mkdir -p "$GRAPHIFY_ONLY_HOME"
cat > "$FAKE_BIN/graphify" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$GRAPHIFY_ONLY_LOG"
case "\${1:-}" in
  --version) echo "graphify 0.0.0-test" ;;
esac
exit 0
EOF
chmod +x "$FAKE_BIN/graphify"

(
  cd "$CUSTOM_PROJECT"
  HOME="$GRAPHIFY_ONLY_HOME" \
  PATH="$FAKE_BIN:/usr/bin:/bin" \
  bash "$ROOT_DIR/setup-agent-toolkit.sh" --graphify-only --codex --local >/dev/null
)

if ! grep -Fxq -- "install --platform codex --project" "$GRAPHIFY_ONLY_LOG"; then
  echo "Expected --graphify-only --codex --local to install project-scoped Codex Graphify" >&2
  cat "$GRAPHIFY_ONLY_LOG" >&2
  exit 1
fi

NO_GRAPHIFY_LOG="$TMP_DIR/no-graphify.log"
cat > "$FAKE_BIN/graphify" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$NO_GRAPHIFY_LOG"
case "\${1:-}" in
  --version) echo "graphify 0.0.0-test" ;;
esac
exit 0
EOF
chmod +x "$FAKE_BIN/graphify"

HOME="$GRAPHIFY_ONLY_HOME" \
PATH="$FAKE_BIN:/usr/bin:/bin" \
bash "$ROOT_DIR/setup-agent-toolkit.sh" --all --codex --no-graphify >/dev/null

if [[ -s "$NO_GRAPHIFY_LOG" ]]; then
  echo "Expected --no-graphify to avoid Graphify commands" >&2
  cat "$NO_GRAPHIFY_LOG" >&2
  exit 1
fi

PIPX_BIN="$TMP_DIR/pipx-bin"
PIPX_HOME="$TMP_DIR/pipx-home"
PIPX_LOG="$TMP_DIR/pipx-graphify.log"
export PIPX_LOG
mkdir -p "$PIPX_BIN" "$PIPX_HOME"
cp "$FAKE_BIN/node" "$PIPX_BIN/node"
cat > "$PIPX_BIN/pipx" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$PIPX_LOG"
case " \$* " in
  *" install graphifyy==0.9.11 "*) cat > "$PIPX_BIN/graphify" <<'GRAPHIFY'
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$PIPX_LOG"
case "\${1:-}" in
  --version) echo "graphify 0.0.0-test" ;;
esac
exit 0
GRAPHIFY
chmod +x "$PIPX_BIN/graphify" ;;
esac
exit 0
EOF
chmod +x "$PIPX_BIN/pipx"

HOME="$PIPX_HOME" \
PATH="$PIPX_BIN:/usr/bin:/bin" \
GRAPHIFY_INSTALLER="pipx" \
bash "$ROOT_DIR/setup-agent-toolkit.sh" --graphify-only --gemini >/dev/null

if ! grep -Fxq -- "install graphifyy==0.9.11" "$PIPX_LOG"; then
  echo "Expected GRAPHIFY_INSTALLER=pipx to install graphifyy through pipx" >&2
  cat "$PIPX_LOG" >&2
  exit 1
fi

if ! grep -Fxq -- "install --platform gemini" "$PIPX_LOG"; then
  echo "Expected Graphify pipx path to install Gemini platform" >&2
  cat "$PIPX_LOG" >&2
  exit 1
fi

UV_FALLBACK_BIN="$TMP_DIR/uv-fallback-bin"
UV_FALLBACK_HOME="$TMP_DIR/uv-fallback-home"
UV_FALLBACK_LOG="$TMP_DIR/uv-fallback-graphify.log"
mkdir -p "$UV_FALLBACK_BIN" "$UV_FALLBACK_HOME"
cp "$FAKE_BIN/node" "$UV_FALLBACK_BIN/node"
cat > "$UV_FALLBACK_BIN/uv" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$UV_FALLBACK_LOG"
case " \$* " in
  *" tool install graphifyy==0.9.11 "*) mkdir -p "$UV_FALLBACK_HOME/.local/bin"; cat > "$UV_FALLBACK_HOME/.local/bin/graphify" <<'GRAPHIFY'
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "UV_FALLBACK_LOG_PLACEHOLDER"
case "\${1:-}" in
  --version) echo "graphify 0.0.0-test" ;;
esac
exit 0
GRAPHIFY
perl -i -pe "s|UV_FALLBACK_LOG_PLACEHOLDER|$UV_FALLBACK_LOG|" "$UV_FALLBACK_HOME/.local/bin/graphify"
chmod +x "$UV_FALLBACK_HOME/.local/bin/graphify" ;;
esac
exit 0
EOF
chmod +x "$UV_FALLBACK_BIN/uv"

HOME="$UV_FALLBACK_HOME" \
PATH="$UV_FALLBACK_BIN:/usr/bin:/bin" \
bash "$ROOT_DIR/setup-agent-toolkit.sh" --graphify-only --codex >/dev/null

if ! grep -Fxq -- "tool install graphifyy==0.9.11" "$UV_FALLBACK_LOG"; then
  echo "Expected Graphify uv install when graphify is absent from PATH" >&2
  cat "$UV_FALLBACK_LOG" >&2
  exit 1
fi

if ! grep -Fxq -- "install --platform codex" "$UV_FALLBACK_LOG"; then
  echo "Expected Graphify installed outside PATH to still install Codex platform" >&2
  cat "$UV_FALLBACK_LOG" >&2
  exit 1
fi

BAD_SOURCE="$TMP_DIR/bad-source"
mkdir -p "$BAD_SOURCE/bad_skill"
cat > "$BAD_SOURCE/bad_skill/SKILL.md" <<'EOF'
---
name: Bad_Skill
description: Invalid skill name.
---

# Bad Skill
EOF

set +e
BAD_OUTPUT="$(
  HOME="$CUSTOM_SKILLS_HOME" \
  PATH="$FAKE_BIN:/usr/bin:/bin" \
  bash "$ROOT_DIR/setup-agent-toolkit.sh" --skills-only --codex --skills-dir "$BAD_SOURCE" 2>&1
)"
BAD_STATUS=$?
set -e

if [[ "$BAD_STATUS" -eq 0 ]]; then
  echo "Expected invalid Agent Skill metadata to fail installation" >&2
  echo "$BAD_OUTPUT" >&2
  exit 1
fi

if ! grep -Fq -- "Invalid skill name" <<<"$BAD_OUTPUT"; then
  echo "Expected invalid skill failure to mention invalid skill name" >&2
  echo "$BAD_OUTPUT" >&2
  exit 1
fi

INSTALL_BIN="$TMP_DIR/install-missing-bin"
INSTALL_HOME="$TMP_DIR/install-missing-home"
INSTALL_LOG="$TMP_DIR/install-missing-npm.log"
mkdir -p "$INSTALL_BIN" "$INSTALL_HOME"
cat > "$INSTALL_BIN/node" <<'EOF'
#!/usr/bin/env bash
REAL_NODE_PLACEHOLDER
case "${1:-}" in
  --version) echo "v24.18.0" ;;
  -p) echo "24" ;;
  *) exec "$REAL_NODE_FOR_TEST" "$@" ;;
esac
EOF
perl -i -pe "s|REAL_NODE_PLACEHOLDER|REAL_NODE_FOR_TEST='$REAL_NODE'|" "$INSTALL_BIN/node"
chmod +x "$INSTALL_BIN/node"

cat > "$INSTALL_BIN/npm" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$INSTALL_LOG"
case " \$* " in
  *" @google/gemini-cli@0.49.0 "*) cat > "$INSTALL_BIN/gemini" <<'GEMINI'
#!/usr/bin/env bash
case "${1:-}" in
  --version) echo "gemini 0.0.0-installed" ;;
esac
exit 0
GEMINI
chmod +x "$INSTALL_BIN/gemini" ;;
esac
exit 0
EOF
chmod +x "$INSTALL_BIN/npm"

HOME="$INSTALL_HOME" \
PATH="$INSTALL_BIN:/usr/bin:/bin" \
bash "$ROOT_DIR/setup-agent-toolkit.sh" --skills-only --gemini --install-missing-clis >/dev/null

if ! grep -Fxq -- "install -g @google/gemini-cli@0.49.0" "$INSTALL_LOG"; then
  echo "Expected --install-missing-clis to install Gemini CLI package" >&2
  cat "$INSTALL_LOG" >&2
  exit 1
fi

ANTIGRAVITY_INSTALL_BIN="$TMP_DIR/antigravity-install-bin"
ANTIGRAVITY_INSTALL_HOME="$TMP_DIR/antigravity-install-home"
ANTIGRAVITY_INSTALL_LOG="$TMP_DIR/antigravity-install.log"
mkdir -p "$ANTIGRAVITY_INSTALL_BIN" "$ANTIGRAVITY_INSTALL_HOME"
cp "$FAKE_BIN/node" "$ANTIGRAVITY_INSTALL_BIN/node"
cat > "$ANTIGRAVITY_INSTALL_BIN/npm" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
chmod +x "$ANTIGRAVITY_INSTALL_BIN/npm"
cat > "$ANTIGRAVITY_INSTALL_BIN/curl" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$ANTIGRAVITY_INSTALL_LOG"
cat <<'INSTALL'
#!/usr/bin/env bash
cat > "$ANTIGRAVITY_INSTALL_BIN/agy" <<'AGY'
#!/usr/bin/env bash
case "${1:-}" in
  --version) echo "agy 0.0.0-installed" ;;
esac
exit 0
AGY
chmod +x "$ANTIGRAVITY_INSTALL_BIN/agy"
INSTALL
EOF
chmod +x "$ANTIGRAVITY_INSTALL_BIN/curl"

HOME="$ANTIGRAVITY_INSTALL_HOME" \
ANTIGRAVITY_INSTALL_BIN="$ANTIGRAVITY_INSTALL_BIN" \
PATH="$ANTIGRAVITY_INSTALL_BIN:/usr/bin:/bin" \
bash "$ROOT_DIR/setup-agent-toolkit.sh" --skills-only --antigravity --install-missing-clis >/dev/null

if ! grep -Fxq -- "-fsSL https://antigravity.google/cli/install.sh" "$ANTIGRAVITY_INSTALL_LOG"; then
  echo "Expected --install-missing-clis to use the official Antigravity CLI installer" >&2
  cat "$ANTIGRAVITY_INSTALL_LOG" >&2
  exit 1
fi

if [[ ! -x "$ANTIGRAVITY_INSTALL_BIN/agy" ]]; then
  echo "Expected official Antigravity installer to provide agy on PATH" >&2
  find "$ANTIGRAVITY_INSTALL_BIN" -maxdepth 2 -type f -print >&2 || true
  exit 1
fi

OUTDATED_BIN="$TMP_DIR/outdated-bin"
OUTDATED_HOME="$TMP_DIR/outdated-home"
OUTDATED_NPM_LOG="$TMP_DIR/outdated-npm.log"
OUTDATED_CODEX_LOG="$TMP_DIR/outdated-codex.log"
mkdir -p "$OUTDATED_BIN" "$OUTDATED_HOME"
cp "$FAKE_BIN/node" "$OUTDATED_BIN/node"
cat > "$OUTDATED_BIN/npm" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$OUTDATED_NPM_LOG"
case " \$* " in
  *" @openai/codex@0.143.0 "*) cat > "$OUTDATED_BIN/codex" <<'CODEX'
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "OUTDATED_CODEX_LOG_PLACEHOLDER"
case "\${1:-}" in
  --version) echo "codex-cli 0.143.0" ;;
esac
exit 0
CODEX
perl -i -pe "s|OUTDATED_CODEX_LOG_PLACEHOLDER|$OUTDATED_CODEX_LOG|" "$OUTDATED_BIN/codex"
chmod +x "$OUTDATED_BIN/codex" ;;
esac
exit 0
EOF
chmod +x "$OUTDATED_BIN/npm"
cat > "$OUTDATED_BIN/codex" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$OUTDATED_CODEX_LOG"
case "\${1:-}" in
  --version) echo "codex-cli 0.125.0" ;;
  plugin) echo "error: unrecognized subcommand 'add'" >&2; exit 2 ;;
esac
exit 0
EOF
chmod +x "$OUTDATED_BIN/codex"

HOME="$OUTDATED_HOME" \
PATH="$OUTDATED_BIN:/usr/bin:/bin" \
bash "$ROOT_DIR/setup-agent-toolkit.sh" --superpowers-only --codex --install-missing-clis >/dev/null

if ! grep -Fxq -- "install -g @openai/codex@0.143.0" "$OUTDATED_NPM_LOG"; then
  echo "Expected --install-missing-clis to update outdated Codex CLI package" >&2
  cat "$OUTDATED_NPM_LOG" >&2
  exit 1
fi

if ! grep -Fxq -- "plugin add superpowers@openai-curated" "$OUTDATED_CODEX_LOG"; then
  echo "Expected Superpowers install to run after Codex CLI update" >&2
  cat "$OUTDATED_CODEX_LOG" >&2
  exit 1
fi

MUTABLE_OUTPUT="$(
  set +e
  HOME="$INSTALL_HOME" \
  PATH="$FAKE_BIN:/usr/bin:/bin" \
  GSD_PACKAGE="@opengsd/gsd-core@latest" \
  bash "$ROOT_DIR/setup-agent-toolkit.sh" --gsd-only --codex 2>&1
  printf 'status:%s\n' "$?"
)"

if ! grep -Fq -- "Mutable external tool source is not allowed" <<<"$MUTABLE_OUTPUT"; then
  echo "Expected mutable external tool source to fail without explicit override" >&2
  echo "$MUTABLE_OUTPUT" >&2
  exit 1
fi

if ! grep -Fxq -- "status:1" <<<"$MUTABLE_OUTPUT"; then
  echo "Expected mutable external tool source rejection to exit with status 1" >&2
  echo "$MUTABLE_OUTPUT" >&2
  exit 1
fi

MUTABLE_ALLOWED_LOG="$TMP_DIR/mutable-allowed-npm.log"
cat > "$FAKE_BIN/npx" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$MUTABLE_ALLOWED_LOG"
exit 0
EOF
chmod +x "$FAKE_BIN/npx"

HOME="$INSTALL_HOME" \
PATH="$FAKE_BIN:/usr/bin:/bin" \
GSD_PACKAGE="@opengsd/gsd-core@latest" \
bash "$ROOT_DIR/setup-agent-toolkit.sh" --gsd-only --codex --allow-mutable-sources >/dev/null

if ! grep -Fxq -- "-y @opengsd/gsd-core@latest --global --codex" "$MUTABLE_ALLOWED_LOG"; then
  echo "Expected --allow-mutable-sources to permit explicit mutable override" >&2
  cat "$MUTABLE_ALLOWED_LOG" >&2
  exit 1
fi

EACCES_BIN="$TMP_DIR/eacces-bin"
EACCES_HOME="$TMP_DIR/eacces-home"
EACCES_NPM_LOG="$TMP_DIR/eacces-npm.log"
mkdir -p "$EACCES_BIN" "$EACCES_HOME"
cp "$FAKE_BIN/node" "$EACCES_BIN/node"
cat > "$EACCES_BIN/npm" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$EACCES_NPM_LOG"
echo "npm error code EACCES" >&2
echo "npm error syscall mkdir" >&2
echo "npm error path /opt/homebrew/lib/node_modules/@google/gemini-cli" >&2
echo "npm error errno -13" >&2
echo "npm error Error: EACCES: permission denied, mkdir '/opt/homebrew/lib/node_modules/@google/gemini-cli'" >&2
exit 1
EOF
chmod +x "$EACCES_BIN/npm"

EACCES_OUTPUT="$(
  set +e
  HOME="$EACCES_HOME" \
  PATH="$EACCES_BIN:/usr/bin:/bin" \
  bash "$ROOT_DIR/setup-agent-toolkit.sh" \
    --skills-only --skills-package core --gemini --install-missing-clis 2>&1
  printf 'status:%s\n' "$?"
)"

if ! grep -Fxq -- "install -g @google/gemini-cli@0.49.0" "$EACCES_NPM_LOG"; then
  echo "Expected --install-missing-clis to attempt installing missing Gemini CLI" >&2
  cat "$EACCES_NPM_LOG" >&2
  exit 1
fi

if ! grep -Fq -- "npm does not have permission to write to its global directory" <<<"$EACCES_OUTPUT"; then
  echo "Expected EACCES npm failure to surface actionable permission guidance" >&2
  echo "$EACCES_OUTPUT" >&2
  exit 1
fi

if ! grep -Fq -- "npm config set prefix" <<<"$EACCES_OUTPUT"; then
  echo "Expected EACCES guidance to suggest a prefix or version-manager fix" >&2
  echo "$EACCES_OUTPUT" >&2
  exit 1
fi

if ! grep -Fxq -- "status:1" <<<"$EACCES_OUTPUT"; then
  echo "Expected runtime CLI install failure to propagate exit code 1" >&2
  echo "$EACCES_OUTPUT" >&2
  exit 1
fi

FLAG_WARN_HOME="$TMP_DIR/flag-warn-home"
mkdir -p "$FLAG_WARN_HOME"

RUNTIME_OVERRIDE_OUTPUT="$(
  HOME="$FLAG_WARN_HOME" \
  PATH="$FAKE_BIN:/usr/bin:/bin" \
  bash "$ROOT_DIR/setup-agent-toolkit.sh" --skills-only --claude --codex --dry-run 2>&1
)"

if ! grep -Fq -- "--claude was overridden by --codex" <<<"$RUNTIME_OVERRIDE_OUTPUT"; then
  echo "Expected stacking bare runtime flags to warn about the silent override" >&2
  echo "$RUNTIME_OVERRIDE_OUTPUT" >&2
  exit 1
fi

TOOL_OVERRIDE_OUTPUT="$(
  HOME="$FLAG_WARN_HOME" \
  PATH="$FAKE_BIN:/usr/bin:/bin" \
  bash "$ROOT_DIR/setup-agent-toolkit.sh" --rtk-only --caveman-only --claude --dry-run 2>&1
)"

if ! grep -Fq -- "--rtk-only was overridden by --caveman-only" <<<"$TOOL_OVERRIDE_OUTPUT"; then
  echo "Expected stacking \"-only\" tool flags to warn about the silent override" >&2
  echo "$TOOL_OVERRIDE_OUTPUT" >&2
  exit 1
fi

REPAIR_HOME="$TMP_DIR/repair-home"
REPAIR_GRAPHIFY_LOG="$TMP_DIR/repair-graphify.log"
mkdir -p "$REPAIR_HOME"
: > "$REPAIR_GRAPHIFY_LOG"
cat > "$FAKE_BIN/uv" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$REPAIR_GRAPHIFY_LOG"
exit 0
EOF
chmod +x "$FAKE_BIN/uv"
# Do not depend on earlier scenarios having created the graphify fake.
cat > "$FAKE_BIN/graphify" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$REPAIR_GRAPHIFY_LOG"
case "\${1:-}" in
  --version) echo "graphify 0.0.0-test" ;;
esac
exit 0
EOF
chmod +x "$FAKE_BIN/graphify"

HOME="$REPAIR_HOME" \
PATH="$FAKE_BIN:/usr/bin:/bin" \
bash "$ROOT_DIR/setup-agent-toolkit.sh" --repair --graphify-only --claude >/dev/null

if ! grep -Fxq -- "tool install --force graphifyy==0.9.11" "$REPAIR_GRAPHIFY_LOG"; then
  echo "Expected --repair to force-reinstall Graphify even when already on PATH" >&2
  cat "$REPAIR_GRAPHIFY_LOG" >&2
  exit 1
fi

SHA_MISMATCH_BIN="$TMP_DIR/sha-mismatch-bin"
SHA_MISMATCH_HOME="$TMP_DIR/sha-mismatch-home"
mkdir -p "$SHA_MISMATCH_BIN" "$SHA_MISMATCH_HOME"
cp "$FAKE_BIN/node" "$SHA_MISMATCH_BIN/node"
cp "$FAKE_BIN/npx" "$SHA_MISMATCH_BIN/npx"
cat > "$SHA_MISMATCH_BIN/git" <<'EOF'
#!/usr/bin/env bash
if [[ "${1:-}" == "clone" ]]; then
  destination="${@: -1}"
  mkdir -p "$destination"
fi
if [[ "${1:-}" == "-C" && "${3:-}" == "rev-parse" ]]; then
  echo "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
fi
exit 0
EOF
chmod +x "$SHA_MISMATCH_BIN/git"

SHA_MISMATCH_OUTPUT="$(
  set +e
  HOME="$SHA_MISMATCH_HOME" \
  PATH="$SHA_MISMATCH_BIN:/usr/bin:/bin" \
  bash "$ROOT_DIR/setup-agent-toolkit.sh" --improve-only --claude 2>&1
  printf 'status:%s\n' "$?"
)"

if ! grep -Fq -- "does not match pinned ref" <<<"$SHA_MISMATCH_OUTPUT"; then
  echo "Expected a fetched commit that differs from the pinned ref to be rejected" >&2
  echo "$SHA_MISMATCH_OUTPUT" >&2
  exit 1
fi

if ! grep -Fxq -- "status:1" <<<"$SHA_MISMATCH_OUTPUT"; then
  echo "Expected pinned ref mismatch to fail the install with exit code 1" >&2
  echo "$SHA_MISMATCH_OUTPUT" >&2
  exit 1
fi

IDENTITY_OUTPUT="$(
  set +e
  HOME="$INSTALL_HOME" \
  PATH="$FAKE_BIN:/usr/bin:/bin" \
  GSD_PACKAGE="@attacker/evil@1.0.0" \
  bash "$ROOT_DIR/setup-agent-toolkit.sh" --gsd-only --codex 2>&1
  printf 'status:%s\n' "$?"
)"

if ! grep -Fq -- "identity differs from tools.lock.json" <<<"$IDENTITY_OUTPUT" || \
  ! grep -Fxq -- "status:1" <<<"$IDENTITY_OUTPUT"; then
  echo "Expected a pinned-looking package with a different identity to be rejected" >&2
  echo "$IDENTITY_OUTPUT" >&2
  exit 1
fi

: > "$MUTABLE_ALLOWED_LOG"
HOME="$INSTALL_HOME" \
PATH="$FAKE_BIN:/usr/bin:/bin" \
GSD_PACKAGE="@attacker/evil@1.0.0" \
bash "$ROOT_DIR/setup-agent-toolkit.sh" --gsd-only --codex --allow-mutable-sources >/dev/null

if ! grep -Fxq -- "-y @attacker/evil@1.0.0 --global --codex" "$MUTABLE_ALLOWED_LOG"; then
  echo "Expected --allow-mutable-sources to permit an explicit identity override" >&2
  cat "$MUTABLE_ALLOWED_LOG" >&2
  exit 1
fi

ANTIGRAVITY_HTTP_OUTPUT="$(
  set +e
  HOME="$INSTALL_HOME" \
  PATH="$FAKE_BIN:/usr/bin:/bin" \
  ANTIGRAVITY_INSTALL_SCRIPT="http://attacker.example/install.sh" \
  bash "$ROOT_DIR/setup-agent-toolkit.sh" \
    --skills-only --skills-package core --antigravity --allow-mutable-sources 2>&1
  printf 'status:%s\n' "$?"
)"

if ! grep -Fq -- "must be an HTTPS URL" <<<"$ANTIGRAVITY_HTTP_OUTPUT" || \
  ! grep -Fxq -- "status:1" <<<"$ANTIGRAVITY_HTTP_OUTPUT"; then
  echo "Expected a plain-HTTP Antigravity install script to be rejected even with the override flag" >&2
  echo "$ANTIGRAVITY_HTTP_OUTPUT" >&2
  exit 1
fi

cp "$ROOT_DIR/tools.lock.json" "$TMP_DIR/alt-lock.json"
LOCKPATH_OUTPUT="$(
  set +e
  HOME="$INSTALL_HOME" \
  PATH="$FAKE_BIN:/usr/bin:/bin" \
  TOOLS_LOCK_PATH="$TMP_DIR/alt-lock.json" \
  bash "$ROOT_DIR/setup-agent-toolkit.sh" --skills-only --skills-package core --claude 2>&1
  printf 'status:%s\n' "$?"
)"

if ! grep -Fq -- "TOOLS_LOCK_PATH replaces the pinned tools.lock.json" <<<"$LOCKPATH_OUTPUT" || \
  ! grep -Fxq -- "status:1" <<<"$LOCKPATH_OUTPUT"; then
  echo "Expected TOOLS_LOCK_PATH to require an explicit override flag" >&2
  echo "$LOCKPATH_OUTPUT" >&2
  exit 1
fi

RTK_ASSET_NAME="$("$REAL_NODE" -e 'const p=process.platform,a=process.arch;const m={"linux:x64":"rtk-x86_64-unknown-linux-musl.tar.gz","linux:arm64":"rtk-aarch64-unknown-linux-gnu.tar.gz","darwin:arm64":"rtk-aarch64-apple-darwin.tar.gz","darwin:x64":"rtk-x86_64-apple-darwin.tar.gz"};console.log(m[`${p}:${a}`]||"")')"

if [[ -z "$RTK_ASSET_NAME" ]]; then
  echo "Skipping RTK download scenario: unsupported test platform" >&2
else
  RTK_DL_DIR="$TMP_DIR/rtk-download"
  NODE_DIR="$(dirname "$REAL_NODE")"
  mkdir -p "$RTK_DL_DIR/payload" "$RTK_DL_DIR/home"
  cat > "$RTK_DL_DIR/payload/rtk" <<'EOF'
#!/usr/bin/env bash
case "${1:-}" in
  --version) echo "rtk 9.9.9-test" ;;
esac
exit 0
EOF
  chmod +x "$RTK_DL_DIR/payload/rtk"
  tar -czf "$RTK_DL_DIR/asset.tar.gz" -C "$RTK_DL_DIR/payload" rtk

  RTK_ASSET_SHA="$("$REAL_NODE" -e 'const {createHash} = require("node:crypto"); const fs = require("node:fs"); console.log(createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex"));' "$RTK_DL_DIR/asset.tar.gz")"

  "$REAL_NODE" -e '
const fs = require("node:fs");
const [, src, dest, asset, sha] = process.argv;
const lock = JSON.parse(fs.readFileSync(src, "utf8"));
lock.tools.rtk.assets[asset] = { sha256: sha };
fs.writeFileSync(dest, `${JSON.stringify(lock, null, 2)}\n`);
' "$ROOT_DIR/tools.lock.json" "$RTK_DL_DIR/tools.lock.json" "$RTK_ASSET_NAME" "$RTK_ASSET_SHA"

  cat > "$RTK_DL_DIR/server.mjs" <<'EOF'
import http from "node:http";
import fs from "node:fs";
const [assetPath, assetName, portFile] = process.argv.slice(2);
const server = http.createServer((req, res) => {
  if (req.url === "/release") {
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        assets: [
          {
            name: assetName,
            browser_download_url: `http://127.0.0.1:${server.address().port}/asset`,
          },
        ],
      }),
    );
    return;
  }
  if (req.url === "/asset") {
    res.end(fs.readFileSync(assetPath));
    return;
  }
  res.statusCode = 404;
  res.end();
});
server.listen(0, "127.0.0.1", () => {
  fs.writeFileSync(portFile, String(server.address().port));
});
EOF
  "$REAL_NODE" "$RTK_DL_DIR/server.mjs" "$RTK_DL_DIR/asset.tar.gz" "$RTK_ASSET_NAME" "$RTK_DL_DIR/port" &
  RTK_SERVER_PID=$!
  trap 'kill "$RTK_SERVER_PID" 2>/dev/null || true; rm -rf "$TMP_DIR"' EXIT

  for _ in $(seq 1 100); do
    [[ -s "$RTK_DL_DIR/port" ]] && break
    sleep 0.1
  done
  RTK_PORT="$(cat "$RTK_DL_DIR/port")"

  RTK_DL_OUTPUT="$(
    set +e
    HOME="$RTK_DL_DIR/home" \
    PATH="$NODE_DIR:/usr/bin:/bin" \
    TOOLS_LOCK_PATH="$RTK_DL_DIR/tools.lock.json" \
    RTK_GITHUB="http://127.0.0.1:$RTK_PORT/release" \
    RTK_INSTALL_DIR="$RTK_DL_DIR/install-bin" \
    ALLOW_MUTABLE_SOURCES=1 \
    bash "$ROOT_DIR/setup-agent-toolkit.sh" --rtk-only --claude 2>&1
    printf 'status:%s\n' "$?"
  )"

  if ! grep -Fq -- "Verified RTK asset checksum: $RTK_ASSET_NAME" <<<"$RTK_DL_OUTPUT" || \
    ! grep -Fq -- "rtk 9.9.9-test" <<<"$RTK_DL_OUTPUT" || \
    ! grep -Fxq -- "status:0" <<<"$RTK_DL_OUTPUT"; then
    echo "Expected the RTK download pipeline to verify and install the served asset" >&2
    echo "$RTK_DL_OUTPUT" >&2
    exit 1
  fi

  if [[ ! -x "$RTK_DL_DIR/install-bin/rtk" ]]; then
    echo "Expected the RTK binary to be installed into RTK_INSTALL_DIR" >&2
    exit 1
  fi

  "$REAL_NODE" -e '
const fs = require("node:fs");
const [, src, dest, asset] = process.argv;
const lock = JSON.parse(fs.readFileSync(src, "utf8"));
lock.tools.rtk.assets[asset] = { sha256: "a".repeat(64) };
fs.writeFileSync(dest, `${JSON.stringify(lock, null, 2)}\n`);
' "$ROOT_DIR/tools.lock.json" "$RTK_DL_DIR/bad-lock.json" "$RTK_ASSET_NAME"

  RTK_BAD_OUTPUT="$(
    set +e
    HOME="$RTK_DL_DIR/home" \
    PATH="$NODE_DIR:/usr/bin:/bin" \
    TOOLS_LOCK_PATH="$RTK_DL_DIR/bad-lock.json" \
    RTK_GITHUB="http://127.0.0.1:$RTK_PORT/release" \
    RTK_INSTALL_DIR="$RTK_DL_DIR/bad-install" \
    ALLOW_MUTABLE_SOURCES=1 \
    bash "$ROOT_DIR/setup-agent-toolkit.sh" --rtk-only --claude 2>&1
    printf 'status:%s\n' "$?"
  )"

  if ! grep -Fq -- "RTK checksum verification failed" <<<"$RTK_BAD_OUTPUT" || \
    ! grep -Fxq -- "status:1" <<<"$RTK_BAD_OUTPUT"; then
    echo "Expected a checksum mismatch to reject the downloaded RTK asset" >&2
    echo "$RTK_BAD_OUTPUT" >&2
    exit 1
  fi

  if [[ -e "$RTK_DL_DIR/bad-install/rtk" ]]; then
    echo "Expected no RTK binary to be installed after a checksum failure" >&2
    exit 1
  fi

  kill "$RTK_SERVER_PID" 2>/dev/null || true
  wait "$RTK_SERVER_PID" 2>/dev/null || true
fi
