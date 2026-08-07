#!/usr/bin/env bash
# Delete macOS AppleDouble sidecar files (._*) that this external volume keeps
# creating. These binary junk files break:
#   - Docker buildx   → "failed to xattr .../._Dockerfile: operation not permitted"
#   - vitest glob     → "Unexpected \"\\x00\"" on ._*.test.ts
#   - D1 migrations   → attempts to apply ._*.sql as a migration
# Run before docker builds, test runs, and D1 migrations on this volume.
#
# Usage: bash scripts/clean-appledouble.sh [path]   (default: repo root)

set -euo pipefail

ROOT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
COUNT=$(find "$ROOT" -name '._*' -not -path '*/.git/*' -print -delete 2>/dev/null | wc -l | tr -d ' ')

if [ "$COUNT" -gt 0 ]; then
  echo "🧹 Removed $COUNT AppleDouble file(s) under $ROOT"
else
  echo "✅ No AppleDouble files found under $ROOT"
fi
