#!/bin/sh
# Packages src/ into an unsigned .wgt for sideloading (Apps2Samsung signs it on install).
# Usage: ./build.sh <entra-application-client-id>
set -e
cd "$(dirname "$0")"
if [ -z "$1" ]; then
  echo "Usage: $0 <entra-application-client-id>" >&2
  exit 1
fi
printf 'window.APP_CONFIG = { clientId: "%s" };\n' "$1" > src/config.js
mkdir -p dist
rm -f dist/XboxRemote.wgt
(cd src && zip -X -r ../dist/XboxRemote.wgt . -x '.*')
echo "Built dist/XboxRemote.wgt"
