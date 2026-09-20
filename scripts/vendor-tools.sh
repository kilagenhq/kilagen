#!/bin/bash
# Refresh the vendored tool inventory from kilagenhq/tools.
#
# The inventory is reference material about other people's products, so it is
# maintained in its own repository with its own contribution rules, and a
# release carries a snapshot — the same arrangement as the dashboard's vendored
# libraries in vendor-libs.sh. An instance never fetches anything: it gets the
# snapshot that shipped with the version it installed.
#
# This is maintainer tooling, not a CLI verb. It is our job to keep the
# snapshot current, and `pip install -U kilagen` is how it reaches anybody.
#
#   KILAGEN_TOOLS_REF   a branch or tag of kilagenhq/tools (default: main)
set -e

REF="${KILAGEN_TOOLS_REF:-main}"
SOURCE="${KILAGEN_TOOLS_REPO:-https://github.com/kilagenhq/tools.git}"
TARGET="keel/content/tools"

if [ ! -d "$TARGET" ]; then
  echo "run this from the repository root" >&2
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "=== Fetching $SOURCE @ $REF ==="
git clone --depth 1 --branch "$REF" "$SOURCE" "$WORK/tools"

if [ ! -d "$WORK/tools/tools" ]; then
  echo "that repository has no tools/ directory" >&2
  exit 1
fi

echo ""
echo "=== Replacing $TARGET ==="
rm -f "$TARGET"/*.yml
cp "$WORK"/tools/tools/*.yml "$TARGET/"

echo ""
ls -1 "$TARGET"
echo ""
echo "Review with: git diff -- $TARGET, then run: python3 -m unittest discover -s tests"
