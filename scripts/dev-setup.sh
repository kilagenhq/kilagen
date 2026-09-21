#!/bin/bash
# Set up the local development environment for working on Kilagen itself.
# Run once after cloning: ./scripts/dev-setup.sh
set -euo pipefail

echo "=== Checking prerequisites ==="

missing=()

command -v python3 &>/dev/null || missing+=("python3")
command -v node &>/dev/null || missing+=("node (v22+)")
command -v pre-commit &>/dev/null || missing+=("pre-commit")
command -v lychee &>/dev/null || missing+=("lychee")

if [ ${#missing[@]} -gt 0 ]; then
  echo ""
  echo "Missing tools: ${missing[*]}"
  echo ""
  echo "Install with:"
  echo "  brew install pre-commit lychee python@3.12 node@22"
  echo ""
  exit 1
fi

echo "All prerequisites found."

VENV_DIR=".venv"

echo ""
if [ -d "$VENV_DIR" ]; then
  echo "=== Using existing virtualenv ($VENV_DIR) ==="
else
  echo "=== Creating virtualenv ($VENV_DIR) ==="
  python3 -m venv "$VENV_DIR"
fi

echo ""
echo "=== Installing Python dependencies ==="
"$VENV_DIR/bin/pip" install --quiet -r scripts/requirements.txt
# Editable, so the tests and the kilagen command run against the working tree.
"$VENV_DIR/bin/pip" install --quiet -e .

echo ""
echo "=== Installing pre-commit hooks ==="
pre-commit install

echo ""
echo "Done. Activate the environment, then run the test suites:"
echo "  source $VENV_DIR/bin/activate"
echo "  python -m unittest discover -s tests"
echo "  npm test --prefix keel/dashboard"
