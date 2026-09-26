#!/usr/bin/env bash
# Product check for index.html:
#   1) launch-constraint guard: the file must keep working from file://;
#   2) type check: the <script> body is cut into a temporary .js and run through
#      tsc --allowJs --checkJs --noEmit.
# Exit code 0 only if both parts pass.
#
# Environment:
#   TSC_SKIP=1     skip the type check (e.g. no network for npx).
#   CHECK_FILE=... check another file (used to test the guard itself).
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FILE="${CHECK_FILE:-$ROOT/index.html}"
STATUS=0

if [ ! -f "$FILE" ]; then
  echo "Not found: $FILE"
  exit 2
fi

# ------------------------------------------------------------------ guard
# The only protection against silently breaking file:// launch: the self-tests
# cannot see it, they run inside an already loaded page.
echo "== Launch constraints =="

VIOLATIONS=0
# report <description> <ERE> [allow ERE]
# The allow pattern exempts the permitted form of a construct (ERE has no
# negative lookahead).
report() {
  local what="$1" re="$2" allow="${3:-}" hits
  hits="$(grep -nE "$re" "$FILE" || true)"
  if [ -n "$allow" ] && [ -n "$hits" ]; then
    hits="$(printf '%s\n' "$hits" | grep -vE "$allow" || true)"
  fi
  if [ -n "$hits" ]; then
    echo "VIOLATION: $what"
    printf '%s\n' "$hits" | sed "s#^#  $(basename "$FILE"):#"
    VIOLATIONS=$((VIOLATIONS + 1))
  fi
}

report 'ES module: type="module" is blocked from file://' \
  '<script[^>]*type[[:space:]]*=[[:space:]]*.module.'
report 'top-level import/export turns the script into a module' \
  '^[[:space:]]*(import|export)[[:space:]]+'
report 'external script <script src=...>' \
  '<script[^>]*[[:space:]]src[[:space:]]*='
# rel="canonical" only names the page's address for search engines, nothing loads
report 'external resource in <link href=...>' \
  '<link[^>]*href[[:space:]]*=[[:space:]]*.(https?:)?//' \
  'rel="canonical"'
report 'external resource in @import' \
  '@import[[:space:]]+(url\()?.?(https?:)?//'
# fetch() only to data: and blob:. A local path from file:// hits CORS and
# fails silently.
report 'fetch(): only data: and blob: work from file://' \
  '[^a-zA-Z0-9_.]fetch\(' \
  "fetch\\([[:space:]]*['\\\"\`](data|blob):"
# Workers only from a Blob (URL.createObjectURL), not from a .js file.
report 'new Worker(): workers only from a Blob' \
  'new[[:space:]]+Worker\(' \
  'createObjectURL'

if [ "$VIOLATIONS" -eq 0 ]; then
  echo "OK: no forbidden constructs"
else
  echo "Violations: $VIOLATIONS"
  STATUS=1
fi

# ------------------------------------------------------------- types (tsc)
echo
echo "== Type check =="

if [ "${TSC_SKIP:-}" = "1" ]; then
  echo "Skipped (TSC_SKIP=1)"
  exit "$STATUS"
fi

TMP_CHECK="$(mktemp -d)"
trap 'rm -rf "$TMP_CHECK"' EXIT
JS="$TMP_CHECK/ixpix.js"

# Cut by tags, not line numbers. Dropped HTML lines become empty lines so tsc
# line numbers match index.html.
awk '
  /<\/script>/ && inside { inside = 0; print ""; next }
  inside { print; next }
  /<script[^>]*>/ { inside = 1; found = 1; print ""; next }
  { print "" }
  END { if (!found) exit 3 }
' "$FILE" > "$JS" || { echo "No <script> tag found"; exit 2; }

if ! grep -q '[^[:space:]]' "$JS"; then
  echo "<script> is empty, nothing to check"
  exit 2
fi

# tsc prints the temp file path (Windows form); map it back to index.html.
JS_NATIVE="$JS"
if command -v cygpath >/dev/null 2>&1; then
  JS_NATIVE="$(cygpath -m "$JS")"
fi

# One strict pass over the app and the tests together: tests/tests.js is a
# classic script sharing the app's global scope, so tsc gets both files.
# --strict is explicit: its default differs between TypeScript versions.
TESTS_JS="$ROOT/tests/tests.js"
OUT="$(npx -y -p typescript tsc --allowJs --checkJs --noEmit \
  --target es2022 --lib es2022,dom,dom.iterable --strict true \
  "$JS" "$TESTS_JS" 2>&1)"
CODE=$?
printf '%s\n' "$OUT" \
  | sed -e "s#$JS#$(basename "$FILE")#g" -e "s#$JS_NATIVE#$(basename "$FILE")#g"
if [ "$CODE" -eq 0 ]; then
  echo "OK: strict type check, no errors"
else
  echo "Type errors: $(printf '%s\n' "$OUT" | grep -cE 'error TS[0-9]+' || true)"
  STATUS=1
fi

exit "$STATUS"
