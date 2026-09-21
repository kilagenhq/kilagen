#!/bin/bash
# Build the dashboard's vendored runtime libraries.
#
# The dashboard has no bundler: the browser loads these as plain <script> tags,
# so they are committed and a fresh clone already works. Run this only after
# package.json moves, to bring the committed copies back in line — CI fails if
# the two disagree.
#
# The files are copied verbatim on purpose. Each carries the copyright and
# license notice its license requires us to keep, and this package
# redistributes them; never minify or strip comments here.
set -euo pipefail

DASHBOARD="keel/dashboard"
VENDOR="$DASHBOARD/vendor"

echo "=== Installing dashboard dependencies ==="
(cd "$DASHBOARD" && npm ci --ignore-scripts)

echo ""
echo "=== Copying vendor libs ==="
mkdir -p "$VENDOR"
cp "$DASHBOARD/node_modules/marked/lib/marked.umd.js"      "$VENDOR/marked.umd.min.js"
cp "$DASHBOARD/node_modules/dompurify/dist/purify.min.js"  "$VENDOR/purify.min.js"
# js-yaml's minified build carries no version banner, and a file that cannot
# say what it is cannot be checked against what was pinned. That gap is how a
# stale copy sat in the tree twice. One line, written from package.json, and
# the artefact becomes self-describing.
JS_YAML_VERSION=$(cd "$DASHBOARD" && node -p "require('./node_modules/js-yaml/package.json').version")
{
  echo "/*! js-yaml $JS_YAML_VERSION | (c) Vitaly Puzrin and Dervus Grim | MIT | github.com/nodeca/js-yaml */"
  cat "$DASHBOARD/node_modules/js-yaml/dist/js-yaml.min.js"
} > "$VENDOR/js-yaml.min.js"

echo ""
ls -1 "$VENDOR"
echo "Done."
