#!/usr/bin/env bash
set -euo pipefail

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
GRAPHIFY_LOG="$LOG_DIR/graphify.log"
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
  logger.ts \
  main.ts \
  menu.ts \
  provenance.ts \
  runtimes.ts \
  skills.ts \
  state.ts \
  system.ts \
  tool-lock.ts \
  usage.ts \
  ui.ts \
  installers/caveman.ts \
  installers/graphify.ts \
  installers/gsd.ts \
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
  --version) echo "v22.21.1" ;;
  -p) echo "22" ;;
  *) exec "$REAL_NODE_FOR_TEST" "$@" ;;
esac
EOF
sed -i "s|REAL_NODE_PLACEHOLDER|REAL_NODE_FOR_TEST='$REAL_NODE'|" "$FAKE_BIN/node"
chmod +x "$FAKE_BIN/node"

cat > "$FAKE_BIN/npm" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$NPM_LOG"
exit 0
EOF
chmod +x "$FAKE_BIN/npm"

cat > "$FAKE_BIN/npx" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$NPM_LOG"
exit 0
EOF
chmod +x "$FAKE_BIN/npx"

cat > "$FAKE_BIN/uv" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$GRAPHIFY_LOG"
case " \$* " in
  *" tool install graphifyy==0.8.31 "*) cat > "$FAKE_BIN/graphify" <<'GRAPHIFY'
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
  *" install graphifyy==0.8.31 "*) cat > "$FAKE_BIN/graphify" <<'GRAPHIFY'
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

HELP_OUTPUT="$("$REAL_NODE" "$ROOT_DIR/dist/bin/agent-toolkit.js" --help)"
WRAPPER_HELP_OUTPUT="$(bash "$ROOT_DIR/setup-agent-toolkit.sh" --help)"

if [[ "$HELP_OUTPUT" != "$WRAPPER_HELP_OUTPUT" ]]; then
  echo "Expected Bash wrapper help output to match Node CLI help output" >&2
  diff -u <(printf '%s\n' "$HELP_OUTPUT") <(printf '%s\n' "$WRAPPER_HELP_OUTPUT") >&2 || true
  exit 1
fi

for expected in \
  "Agent Toolkit" \
  "--caveman-only" \
  "--gsd-only" \
  "--graphify-only" \
  "--skills-only" \
  "--superpowers-only" \
  "--rtk-only" \
  "--no-graphify" \
  "--no-skills" \
  "--skills-dir" \
  "--skills-list" \
  "--skills-scope" \
  "--install-missing-clis" \
  "--allow-mutable-sources" \
  "--claude" \
  "--codex" \
  "--opencode" \
  "--gemini" \
  "--no-gemini"; do
  if ! grep -Fq -- "$expected" <<<"$HELP_OUTPUT"; then
    echo "Expected help output to contain: $expected" >&2
    echo "$HELP_OUTPUT" >&2
    exit 1
  fi
done

for forbidden in \
  "Cop""ilot" \
  "Mini""CD" \
  "Mag""alu" \
  "Con""fluence" \
  "Zal""tron" \
  "agent""-skills"; do
  if grep -Fqi -- "$forbidden" <<<"$HELP_OUTPUT"; then
    echo "Help output still contains forbidden legacy/private term: $forbidden" >&2
    echo "$HELP_OUTPUT" >&2
    exit 1
  fi
done

HOME="$HOME_DIR" \
XDG_CONFIG_HOME="$HOME_DIR/.config" \
PATH="$FAKE_BIN:/usr/bin:/bin" \
RTK_INSTALL_DIR="$TMP_DIR/install-bin" \
bash "$ROOT_DIR/setup-agent-toolkit.sh" --all --all-runtimes >/dev/null

if ! grep -Fxq -- "-y github:JuliusBrussee/caveman#655b7d9c5431f822264b7732e9901c5578ac84cf --only claude --only codex --only opencode --only gemini --minimal --non-interactive" "$NPM_LOG"; then
  echo "Expected Caveman installer to target Claude, Codex, OpenCode and Gemini" >&2
  cat "$NPM_LOG" >&2
  exit 1
fi

if ! grep -Fxq -- "-y get-shit-done-cc@1.42.3 --global --claude --codex --opencode --gemini" "$NPM_LOG"; then
  echo "Expected GSD installer to target Claude, Codex, OpenCode and Gemini globally" >&2
  cat "$NPM_LOG" >&2
  exit 1
fi

if ! grep -Fxq -- "tool install graphifyy==0.8.31" "$GRAPHIFY_LOG"; then
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

for skill_target in \
  "$HOME_DIR/.claude/skills/agent-toolkit-maintainer/SKILL.md" \
  "$HOME_DIR/.codex/skills/agent-toolkit-maintainer/SKILL.md" \
  "$HOME_DIR/.config/opencode/skills/agent-toolkit-maintainer/SKILL.md"; do
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
  *" install graphifyy==0.8.31 "*) cat > "$PIPX_BIN/graphify" <<'GRAPHIFY'
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

if ! grep -Fxq -- "install graphifyy==0.8.31" "$PIPX_LOG"; then
  echo "Expected GRAPHIFY_INSTALLER=pipx to install graphifyy through pipx" >&2
  cat "$PIPX_LOG" >&2
  exit 1
fi

if ! grep -Fxq -- "install --platform gemini" "$PIPX_LOG"; then
  echo "Expected Graphify pipx path to install Gemini platform" >&2
  cat "$PIPX_LOG" >&2
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
  --version) echo "v22.21.1" ;;
  -p) echo "22" ;;
  *) exec "$REAL_NODE_FOR_TEST" "$@" ;;
esac
EOF
sed -i "s|REAL_NODE_PLACEHOLDER|REAL_NODE_FOR_TEST='$REAL_NODE'|" "$INSTALL_BIN/node"
chmod +x "$INSTALL_BIN/node"

cat > "$INSTALL_BIN/npm" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$INSTALL_LOG"
case " \$* " in
  *" @google/gemini-cli@0.45.0 "*) cat > "$INSTALL_BIN/gemini" <<'GEMINI'
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

if ! grep -Fxq -- "install -g @google/gemini-cli@0.45.0" "$INSTALL_LOG"; then
  echo "Expected --install-missing-clis to install Gemini CLI package" >&2
  cat "$INSTALL_LOG" >&2
  exit 1
fi

MUTABLE_OUTPUT="$(
  set +e
  HOME="$INSTALL_HOME" \
  PATH="$FAKE_BIN:/usr/bin:/bin" \
  GSD_PACKAGE="get-shit-done-cc@latest" \
  bash "$ROOT_DIR/setup-agent-toolkit.sh" --gsd-only --codex 2>&1
  printf 'status:%s\n' "$?"
)"

if ! grep -Fq -- "Mutable external tool source is not allowed" <<<"$MUTABLE_OUTPUT"; then
  echo "Expected mutable external tool source to fail without explicit override" >&2
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
GSD_PACKAGE="get-shit-done-cc@latest" \
bash "$ROOT_DIR/setup-agent-toolkit.sh" --gsd-only --codex --allow-mutable-sources >/dev/null

if ! grep -Fxq -- "-y get-shit-done-cc@latest --global --codex" "$MUTABLE_ALLOWED_LOG"; then
  echo "Expected --allow-mutable-sources to permit explicit mutable override" >&2
  cat "$MUTABLE_ALLOWED_LOG" >&2
  exit 1
fi

LEGACY_PATTERN="Mini""CD|Mag""alu|mag""azine|luiza""labs|Git""Lab|Con""fluence|Zal""tron|agent""-skills|setup-cop""ilot|GitHub Cop""ilot|Cop""ilot|Ran""ni AI Hub|ran""ni-ai-hub|setup-ai-""hub|Ran""ni Skills"
SEARCH_OUTPUT="$(grep -RInE "$LEGACY_PATTERN" "$ROOT_DIR" --exclude-dir=.git --exclude-dir=graphify-out --exclude-dir=node_modules || true)"
if [[ -n "$SEARCH_OUTPUT" ]]; then
  echo "Repository still contains legacy/private references:" >&2
  echo "$SEARCH_OUTPUT" >&2
  exit 1
fi
