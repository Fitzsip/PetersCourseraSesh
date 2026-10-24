#!/usr/bin/env bash
# Packages TV Hub as an unsigned .wgt file (dist/TVHub.wgt), ready for Apps2Samsung or
# Tizen Studio to sign for your TV and install. Needs only `zip`.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$HERE/dist"
rm -f "$HERE/dist/TVHub.wgt"
(cd "$HERE" && zip -qrX "dist/TVHub.wgt" config.xml index.html icon.png css js)
echo "Built $HERE/dist/TVHub.wgt"
