#!/usr/bin/env bash
# Rebuild all UI bundles + TypeScript output for MPS_AC / Void dev.
# Run from repo root. After this, quit the app (Cmd+Q) and relaunch code.sh.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Repo: $ROOT"

if [ -f .nvmrc ] && command -v nvm >/dev/null 2>&1; then
  # shellcheck disable=SC1090
  source "$NVM_DIR/nvm.sh" 2>/dev/null || true
  nvm use 2>/dev/null || true
fi

echo ""
echo "==> 1/3 Void Chat React (Ctrl+L sidebar)"
cd "$ROOT/src/vs/workbench/contrib/void/browser/react"
node build.js

echo ""
echo "==> 2/3 Agentic AI React (sparkle sidebar; syncs to out/vs/.../react/out)"
cd "$ROOT/src/vs/workbench/contrib/agentic/browser/react"
node build.js

echo ""
echo "==> 3/3 Gulp compile (TypeScript → out/)"
cd "$ROOT"
node --max-old-space-size=8192 ./node_modules/gulp/bin/gulp.js compile

echo ""
echo "✅ UI rebuild complete."
echo ""
echo "Next steps:"
echo "  1. Quit MPS_AC completely (Cmd+Q)"
echo "  2. Relaunch:"
echo "       ./scripts/code.sh --user-data-dir ./.tmp/user-data --extensions-dir ./.tmp/extensions"
echo ""
echo "Which panel has live activity under your message:"
echo "  • Void Chat (Ctrl+L) — main chat sidebar"
echo "  • Agentic AI (sparkle icon) — separate agent panel"
