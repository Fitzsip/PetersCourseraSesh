#!/usr/bin/env bash
# Packages TV Hub and installs it on your Samsung TV.
# Needs Tizen Studio's command-line tools (see README.md, steps 2-4).
#
#   ./build.sh <certificate-profile-name> [tv-ip-address]
set -euo pipefail

PROFILE="${1:?Usage: ./build.sh <certificate-profile-name> [tv-ip-address]}"
TV_IP="${2:-}"
TIZEN="${TIZEN:-$HOME/tizen-studio/tools/ide/bin/tizen}"
SDB="${SDB:-$HOME/tizen-studio/tools/sdb}"
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/build"

rm -rf "$OUT" && mkdir -p "$OUT"
cp -r "$HERE/config.xml" "$HERE/index.html" "$HERE/icon.png" "$HERE/css" "$HERE/js" "$OUT/"

"$TIZEN" package -t wgt -s "$PROFILE" -- "$OUT"
WGT="$(ls "$OUT"/*.wgt)"
echo "Built $WGT"

if [ -n "$TV_IP" ]; then
  "$SDB" connect "$TV_IP"
  TARGET="$("$SDB" devices | awk 'NR>1 && $1 ~ /:/ {print $3; exit}')"
  "$TIZEN" install -n "$WGT" -t "$TARGET"
  echo "Installed on $TARGET. Look for 'TV Hub' in your TV's Apps."
fi

# Keep a copy of the signing certificate: future updates must be signed with the same one,
# otherwise the TV makes you uninstall TV Hub first (losing your shows and settings).
DATA="${TIZEN_DATA:-$HOME/tizen-studio-data}"
if [ -d "$DATA/keystore" ] && command -v zip >/dev/null; then
  (cd "$DATA" && zip -qr "$HERE/tv-hub-certificate-backup.zip" keystore profile)
  echo "Certificate backed up to $HERE/tv-hub-certificate-backup.zip"
  echo "Email it to yourself or save it to cloud storage, with the certificate password."
fi
