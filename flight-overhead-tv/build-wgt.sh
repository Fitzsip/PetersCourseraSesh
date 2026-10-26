#!/bin/sh
# Packages the app as an unsigned dist/FlightOverhead.wgt for sideloading tools
# such as Apps2Samsung, which sign it for your TV during install.
set -e
cd "$(dirname "$0")"
mkdir -p dist
rm -f dist/FlightOverhead.wgt
python3 - <<'PY'
import os, zipfile
files = ['config.xml', 'index.html', 'icon.png']
for d in ('css', 'js'):
    files += sorted(os.path.join(d, f) for f in os.listdir(d))
with zipfile.ZipFile('dist/FlightOverhead.wgt', 'w', zipfile.ZIP_DEFLATED) as z:
    for f in files:
        z.write(f, f)
PY
echo "Built dist/FlightOverhead.wgt"
