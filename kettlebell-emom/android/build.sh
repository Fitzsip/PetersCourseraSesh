#!/usr/bin/env bash
# Builds Pink Bell EMOM as an installable Android APK without the Android SDK.
# Tools come from Maven Central: apktool's bundled aapt2 + framework, the API 16
# class library, dx (Java -> DEX) and apksig (v2 signing).
# Needs: java 17+, python3, curl, unzip.  Output: build/PinkBellEMOM.apk
set -euo pipefail
cd "$(dirname "$0")"
VERSION_CODE=${VERSION_CODE:-1}
VERSION_NAME=${VERSION_NAME:-1.0}
KEYSTORE=${KEYSTORE:-keystore/pinkbell.p12}
KEY_PASS=${KEY_PASS:-pinkbell}

M=https://repo1.maven.org/maven2
T=.tools
mkdir -p "$T"
fetch() { # fetch <maven path> <file>
  [ -s "$T/$2" ] && return
  for wait in 2 5 10 20 40; do curl -sSfL -o "$T/$2" "$M/$1" && return; sleep $wait; done
  echo "Could not download $1" >&2; exit 1
}
fetch org/apktool/apktool-lib/3.0.3/apktool-lib-3.0.3.jar apktool-lib.jar
fetch com/google/android/android/4.1.1.4/android-4.1.1.4.jar android.jar
fetch com/jakewharton/android/repackaged/dalvik-dx/16.0.1/dalvik-dx-16.0.1.jar dx.jar
fetch com/android/tools/build/apksig/2.3.0/apksig-2.3.0.jar apksig.jar
if [ ! -x "$T/aapt2" ]; then
  unzip -joq "$T/apktool-lib.jar" prebuilt/linux/aapt2 prebuilt/android-framework.jar -d "$T"
  chmod +x "$T/aapt2"
fi

B=build
rm -rf "$B"; mkdir -p "$B/classes" "$B/assets"

# 1. Web app -> assets: wrap the page in a full document and use the bundled fonts.
cp -r assets-src/fonts "$B/assets/fonts"
python3 - ../index.html "$B/assets/index.html" <<'PY'
import re, sys
page = open(sys.argv[1]).read()
page = re.sub(r'<link rel="preconnect"[^>]*>\n', '', page)
page = re.sub(r'<link rel="stylesheet" href="https://fonts.googleapis.com[^"]*">', '<link rel="stylesheet" href="fonts/fonts.css">', page)
head = ('<!doctype html><html><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<style>:root{color-scheme:light}body{margin:0;font:14px system-ui,sans-serif}'
        'img{max-width:100%}[hidden]{display:none!important}</style></head><body>')
open(sys.argv[2], 'w').write(head + page + '</body></html>')
PY

# 2. Resources + manifest.
"$T/aapt2" compile --dir res -o "$B/res.zip"
"$T/aapt2" link -o "$B/unsigned.apk" -I "$T/android-framework.jar" \
  --manifest AndroidManifest.xml -A "$B/assets" "$B/res.zip" \
  --min-sdk-version 24 --target-sdk-version 34 \
  --version-code "$VERSION_CODE" --version-name "$VERSION_NAME"

# 3. Java -> DEX. The JavascriptInterface stub is compile-only.
javac -nowarn -Xlint:-options --release 8 -cp "$T/android.jar" \
  -sourcepath stubs -implicit:none -d "$B/classes" src/com/pinkbell/emom/*.java
java -cp "$T/dx.jar" com.android.dx.command.Main --dex --min-sdk-version=24 \
  --output="$B/classes.dex" "$B/classes"
(cd "$B" && zip -q unsigned.apk classes.dex)

# 4. Align and sign (v2; minSdk 24 needs nothing older).
python3 tools/align.py "$B/unsigned.apk" "$B/aligned.apk"
if [ ! -f "$KEYSTORE" ]; then
  mkdir -p "$(dirname "$KEYSTORE")"
  keytool -genkeypair -storetype PKCS12 -keystore "$KEYSTORE" -storepass "$KEY_PASS" \
    -alias pinkbell -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Pink Bell EMOM" 2>/dev/null
fi
javac -nowarn -cp "$T/apksig.jar" -d "$B/tools" tools/Sign.java
java --add-exports java.base/sun.security.x509=ALL-UNNAMED --add-exports java.base/sun.security.pkcs=ALL-UNNAMED --add-exports java.base/sun.security.util=ALL-UNNAMED \
  -cp "$B/tools:$T/apksig.jar" Sign "$KEYSTORE" pinkbell "$KEY_PASS" "$B/aligned.apk" "$B/PinkBellEMOM.apk"
echo "Built $(pwd)/$B/PinkBellEMOM.apk"
