#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT_DIR/scripts/publish-npm-with-retry.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

FAKE_BIN="$TMP_DIR/bin"
SCENARIO_FILE="$TMP_DIR/scenario"
VIEW_COUNTER_FILE="$TMP_DIR/view-count"
PUBLISH_COUNTER_FILE="$TMP_DIR/publish-count"
NPM_LOG="$TMP_DIR/npm.log"
mkdir -p "$FAKE_BIN"

export SCENARIO_FILE VIEW_COUNTER_FILE PUBLISH_COUNTER_FILE NPM_LOG

cat > "$FAKE_BIN/npm" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

next_status() {
  local operation="$1"
  local call_number="$2"
  local configured_operation statuses

  while IFS='=' read -r configured_operation statuses; do
    if [[ "$configured_operation" != "$operation" ]]; then
      continue
    fi

    local values=()
    IFS=',' read -r -a values <<< "$statuses"
    if (( call_number < 1 || call_number > ${#values[@]} )); then
      echo "No $operation status configured for call $call_number" >&2
      return 96
    fi

    printf '%s\n' "${values[call_number - 1]}"
    return 0
  done < "$SCENARIO_FILE"

  echo "No statuses configured for $operation" >&2
  return 96
}

operation="${1:-}"
printf '%s\n' "$*" >> "$NPM_LOG"

case "$operation" in
  view)
    count="$(( $(cat "$VIEW_COUNTER_FILE") + 1 ))"
    printf '%s\n' "$count" > "$VIEW_COUNTER_FILE"
    status="$(next_status view "$count")"
    ;;
  publish)
    count="$(( $(cat "$PUBLISH_COUNTER_FILE") + 1 ))"
    printf '%s\n' "$count" > "$PUBLISH_COUNTER_FILE"
    status="$(next_status publish "$count")"
    ;;
  *)
    echo "Unexpected npm operation: $operation" >&2
    exit 97
    ;;
esac

exit "$status"
EOF
chmod +x "$FAKE_BIN/npm"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

assert_eq() {
  local expected="$1"
  local actual="$2"
  local message="$3"

  if [[ "$actual" != "$expected" ]]; then
    fail "$message: expected $expected, got $actual"
  fi
}

run_scenario() {
  local name="$1"
  local expected_status="$2"
  local expected_view_count="$3"
  local expected_publish_count="$4"
  local view_statuses="$5"
  local publish_statuses="$6"
  local output_file="$TMP_DIR/$name.out"

  printf 'view=%s\npublish=%s\n' "$view_statuses" "$publish_statuses" > "$SCENARIO_FILE"
  printf '0\n' > "$VIEW_COUNTER_FILE"
  printf '0\n' > "$PUBLISH_COUNTER_FILE"
  : > "$NPM_LOG"

  set +e
  PATH="$FAKE_BIN:$PATH" PUBLISH_RETRY_DELAY_SECONDS=0 \
    bash "$SCRIPT" "@scope/example" "1.2.3" > "$output_file" 2>&1
  local actual_status="$?"
  set -e

  if [[ "$actual_status" != "$expected_status" ]]; then
    cat "$output_file" >&2
    fail "$name status: expected $expected_status, got $actual_status"
  fi

  local actual_view_count actual_publish_count matching_view_calls matching_publish_calls
  actual_view_count="$(cat "$VIEW_COUNTER_FILE")"
  actual_publish_count="$(cat "$PUBLISH_COUNTER_FILE")"
  matching_view_calls="$(grep -cFx 'view @scope/example@1.2.3 version' "$NPM_LOG" || true)"
  matching_publish_calls="$(grep -cFx 'publish --provenance --access public' "$NPM_LOG" || true)"

  assert_eq "$expected_view_count" "$actual_view_count" "$name view call count"
  assert_eq "$expected_publish_count" "$actual_publish_count" "$name publish call count"
  assert_eq "$expected_view_count" "$matching_view_calls" "$name exact view arguments"
  assert_eq "$expected_publish_count" "$matching_publish_calls" "$name exact publish arguments"
}

run_invalid_config() {
  local name="$1"
  local variable="$2"
  local value="$3"
  local output_file="$TMP_DIR/$name.out"
  local failed=0

  printf 'view=1\npublish=0\n' > "$SCENARIO_FILE"
  printf '0\n' > "$VIEW_COUNTER_FILE"
  printf '0\n' > "$PUBLISH_COUNTER_FILE"
  : > "$NPM_LOG"

  set +e
  env PATH="$FAKE_BIN:$PATH" \
    PUBLISH_MAX_ATTEMPTS=3 \
    PUBLISH_RETRY_DELAY_SECONDS=0 \
    "$variable=$value" \
    bash "$SCRIPT" "@scope/example" "1.2.3" > "$output_file" 2>&1
  local actual_status="$?"
  set -e

  if (( actual_status == 0 )); then
    echo "FAIL: $name status: expected nonzero, got 0" >&2
    failed=1
  fi

  local actual_publish_count
  actual_publish_count="$(cat "$PUBLISH_COUNTER_FILE")"
  if [[ "$actual_publish_count" != "0" ]]; then
    echo "FAIL: $name publish call count: expected 0, got $actual_publish_count" >&2
    failed=1
  fi

  return "$failed"
}

run_scenario "already-published" 0 1 0 "0" ""
run_scenario "first-publish-success" 0 1 1 "1" "0"
run_scenario "lost-publish-response" 0 2 1 "1,0" "41"
run_scenario "third-attempt-success" 0 3 3 "1,1,1" "41,42,0"
run_scenario "all-attempts-fail" 73 4 3 "1,1,1,1" "41,42,73"

invalid_config_failed=0
run_invalid_config "overflowing-attempts" PUBLISH_MAX_ATTEMPTS "9223372036854775808" || invalid_config_failed=1
run_invalid_config "overflowing-delay" PUBLISH_RETRY_DELAY_SECONDS "9223372036854775808" || invalid_config_failed=1
if (( invalid_config_failed != 0 )); then
  exit 1
fi

echo "publish retry tests passed"
