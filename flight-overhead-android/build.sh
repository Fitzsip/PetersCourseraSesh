#!/bin/sh
# Builds dist/FlightOverhead.apk from ../flight-overhead-tv (the shared app) and src/.
# Needs Java 17+ and internet access the first time, to download the build tools.
set -e
cd "$(dirname "$0")"
TOOLS="${TOOLS:-$HOME/.cache/flight-overhead-android-tools}"
mkdir -p "$TOOLS"

fetch() {
  [ -s "$TOOLS/$1" ] && return 0
  echo "Downloading $1"
  for i in 1 2 3 4 5; do
    curl -sSfL -m 600 -o "$TOOLS/$1.part" "$2" && mv "$TOOLS/$1.part" "$TOOLS/$1" && return 0
    sleep $((i * 10))
  done
  echo "Could not download $2" >&2
  exit 1
}
# Apktool bundles the aapt2 resource compiler; dalvik-dx turns Java classes into Android
# bytecode; uber-apk-signer aligns and signs; android-all supplies the Android 10 classes.
fetch apktool.jar https://github.com/iBotPeaches/Apktool/releases/download/v2.10.0/apktool_2.10.0.jar
fetch dx.jar https://repo1.maven.org/maven2/com/jakewharton/android/repackaged/dalvik-dx/16.0.1/dalvik-dx-16.0.1.jar
fetch signer.jar https://github.com/patrickfav/uber-apk-signer/releases/download/v1.3.0/uber-apk-signer-1.3.0.jar
fetch android-all-29.jar https://repo1.maven.org/maven2/org/robolectric/android-all/10-robolectric-5803371/android-all-10-robolectric-5803371.jar

VERSION=$(sed -n "s/^var APP_VERSION = '\([0-9.]*\)';/\1/p" ../flight-overhead-tv/js/config.js)
CODE=$(echo "$VERSION" | awk -F. '{ print $1 * 10000 + $2 * 100 + $3 }')
echo "Building Flight Overhead $VERSION ($CODE)"

rm -rf build
mkdir -p build/classes build/app/assets/www build/app/res dist
cp -r ../flight-overhead-tv/index.html ../flight-overhead-tv/css ../flight-overhead-tv/js ../flight-overhead-tv/icon.png build/app/assets/www/
cp -r res/* build/app/res/
cp AndroidManifest.xml build/app/

javac -nowarn --release 8 -Xlint:-options -cp "$TOOLS/android-all-29.jar" -d build/classes $(find src -name '*.java')
java -cp "$TOOLS/dx.jar" com.android.dx.command.Main --dex --min-sdk-version=26 --output=build/app/classes.dex build/classes

cat > build/app/apktool.yml <<YML
version: 2.10.0
apkFileName: FlightOverhead.apk
isFrameworkApk: false
usesFramework:
  ids:
  - 1
  tag: null
sdkInfo:
  minSdkVersion: 26
  targetSdkVersion: 34
packageInfo:
  forcedPackageId: 127
  renameManifestPackage: null
versionInfo:
  versionCode: $CODE
  versionName: $VERSION
resourcesAreCompressed: false
sharedLibrary: false
sparseResources: false
doNotCompress:
- resources.arsc
- png
YML

java -jar "$TOOLS/apktool.jar" build --frame-path "$TOOLS/framework" build/app -o build/unsigned.apk

# Updates only install over the existing app when signed with the same key, so keep it.
# It lives outside the repository; one is created on the first build.
KEYSTORE="${KEYSTORE:-$TOOLS/flightoverhead.keystore}"
KEYPASS="${KEYPASS:-flightoverhead}"
if [ ! -f "$KEYSTORE" ]; then
  keytool -genkeypair -keystore "$KEYSTORE" -alias flightoverhead -keyalg RSA -keysize 2048 \
    -validity 20000 -storepass "$KEYPASS" -keypass "$KEYPASS" -dname "CN=Flight Overhead"
fi
java -jar "$TOOLS/signer.jar" --apks build/unsigned.apk --out build/signed \
  --ks "$KEYSTORE" --ksAlias flightoverhead --ksPass "$KEYPASS" --ksKeyPass "$KEYPASS"
cp build/signed/*aligned-signed.apk dist/FlightOverhead.apk
echo "Built dist/FlightOverhead.apk"
