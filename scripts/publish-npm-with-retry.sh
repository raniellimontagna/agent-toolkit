#!/usr/bin/env bash
set -euo pipefail

if (( $# != 2 )); then
  echo "Usage: $0 <package-name> <package-version>" >&2
  exit 2
fi

package_name="$1"
package_version="$2"
max_attempts="${PUBLISH_MAX_ATTEMPTS:-3}"
retry_delay_seconds="${PUBLISH_RETRY_DELAY_SECONDS:-30}"
readonly MAX_SUPPORTED_INTEGER=2147483647

if [[ ! "$max_attempts" =~ ^[0-9]+$ ]]; then
  echo "PUBLISH_MAX_ATTEMPTS must be a positive integer." >&2
  exit 2
fi

if [[ ! "$retry_delay_seconds" =~ ^[0-9]+$ ]]; then
  echo "PUBLISH_RETRY_DELAY_SECONDS must be a nonnegative integer." >&2
  exit 2
fi

while [[ "$max_attempts" == 0* && "$max_attempts" != "0" ]]; do
  max_attempts="${max_attempts#0}"
done

while [[ "$retry_delay_seconds" == 0* && "$retry_delay_seconds" != "0" ]]; do
  retry_delay_seconds="${retry_delay_seconds#0}"
done

if (( ${#max_attempts} > ${#MAX_SUPPORTED_INTEGER} )) \
  || { (( ${#max_attempts} == ${#MAX_SUPPORTED_INTEGER} )) && [[ "$max_attempts" > "$MAX_SUPPORTED_INTEGER" ]]; }; then
  echo "PUBLISH_MAX_ATTEMPTS must not exceed $MAX_SUPPORTED_INTEGER." >&2
  exit 2
fi

if (( ${#retry_delay_seconds} > ${#MAX_SUPPORTED_INTEGER} )) \
  || { (( ${#retry_delay_seconds} == ${#MAX_SUPPORTED_INTEGER} )) && [[ "$retry_delay_seconds" > "$MAX_SUPPORTED_INTEGER" ]]; }; then
  echo "PUBLISH_RETRY_DELAY_SECONDS must not exceed $MAX_SUPPORTED_INTEGER." >&2
  exit 2
fi

max_attempts="$((10#$max_attempts))"
retry_delay_seconds="$((10#$retry_delay_seconds))"

if (( max_attempts <= 0 )); then
  echo "PUBLISH_MAX_ATTEMPTS must be greater than zero." >&2
  exit 2
fi

if (( retry_delay_seconds < 0 )); then
  echo "PUBLISH_RETRY_DELAY_SECONDS must be nonnegative." >&2
  exit 2
fi

package_spec="${package_name}@${package_version}"
if npm view "$package_spec" version >/dev/null 2>&1; then
  echo "$package_spec is already published."
  exit 0
fi

for (( attempt = 1; attempt <= max_attempts; attempt++ )); do
  publish_status=0
  echo "Publishing $package_spec (attempt $attempt/$max_attempts)."
  npm publish --provenance --access public || publish_status=$?

  if (( publish_status == 0 )); then
    exit 0
  fi

  if npm view "$package_spec" version >/dev/null 2>&1; then
    echo "$package_spec was published despite a failed response."
    exit 0
  fi

  if (( attempt == max_attempts )); then
    exit "$publish_status"
  fi

  sleep "$((attempt * retry_delay_seconds))"
done
