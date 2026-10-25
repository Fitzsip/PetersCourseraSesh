#!/bin/sh
# Packages src/ into an unsigned .wgt for sideloading (Apps2Samsung signs it on install).
set -e
cd "$(dirname "$0")"
mkdir -p dist
rm -f dist/XboxProbe.wgt
(cd src && zip -X -r ../dist/XboxProbe.wgt . -x '.*')
echo "Built dist/XboxProbe.wgt"
