#!/usr/bin/env bash
# Runs the self-tests (index.html#test) in headless Chrome over file://,
# prints failed tests and the summary. Exit code 0 if all tests pass.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHROME="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"

if command -v cygpath >/dev/null 2>&1; then
  URL="file:///$(cygpath -m "$ROOT")/index.html#test"
else
  URL="file://$ROOT/index.html#test"
fi

# --dump-dom can capture the DOM before async tests finish (image decoding runs
# outside virtual time), so retry.
ATTEMPTS=5
SUMMARY=""
for attempt in $(seq 1 "$ATTEMPTS"); do
  DOM="$("$CHROME" --headless=new --disable-gpu --virtual-time-budget=60000 --dump-dom "$URL" 2>/dev/null || true)"
  SUMMARY="$(printf '%s' "$DOM" | grep -o 'TESTS: [0-9]* passed, [0-9]* failed' | tail -1 || true)"
  [ -n "$SUMMARY" ] && break
done
if [ -z "$SUMMARY" ]; then
  echo "No test summary after $ATTEMPTS attempts (page did not load or tests did not finish)"
  exit 2
fi

printf '%s' "$DOM" | grep -o '<tr><td>[^<]*</td><td class="is-fail">FAIL</td><td>[^<]*</td><td>[^<]*' \
  | sed -E 's#<tr><td>([^<]*)</td><td class="is-fail">FAIL</td><td>[^<]*</td><td>(.*)#FAIL \1: \2#' || true
echo "$SUMMARY"

case "$SUMMARY" in
  *" 0 failed") exit 0 ;;
  *) exit 1 ;;
esac
