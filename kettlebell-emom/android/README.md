# Pink Bell EMOM for Android

A small WebView app that wraps `../index.html` so it runs offline from the home screen.

Build with `./build.sh` (Java 17+, Python 3, curl, unzip). It downloads its tools from
Maven Central, so the Android SDK isn't needed. The APK lands in `build/PinkBellEMOM.apk`.
A copy of the latest build is kept at `../PinkBellEMOM.apk`.

For an update, raise the version: `VERSION_CODE=2 VERSION_NAME=1.1 ./build.sh`.

The signing key (`keystore/pinkbell.p12`) is deliberately not committed. If it's missing,
`build.sh` makes a new one. Android only installs an update over the existing app when it is
signed with the same key, so an APK built with a new key means uninstalling the old app
first, which clears the training log stored in the app.
