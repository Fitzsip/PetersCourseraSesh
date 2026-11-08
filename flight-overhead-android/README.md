# Flight Overhead — Android phone app

The same app as the Samsung TV version (`../flight-overhead-tv`), packaged for Android
phones, with:

* a portrait touch layout: tap a plane in the list for details, tap a popup to close it,
  and the Back button closes settings and popups;
* **Track on Flightradar24** on every popup, and on each notification, to follow the
  flight live in the Flightradar24 app or website;
* **Jets (24h)**: private jets from the last 24 hours, including ones the background
  watcher saw while the app was closed; tap one to open it in Flightradar24;
* **Use this phone's location** in Settings to set your home position from the phone's
  GPS while you're at home;
* **notifications when the app is closed**: a small background service checks for planes
  every 15 seconds and posts an Android notification when a private jet (or any plane,
  if you choose **Notifications for → all alerts**) comes over. Android shows a
  "Watching the sky" notification while it runs. It respects the 22:00–08:00 quiet hours
  and restarts after the phone reboots.

The screens and alert rules come from the TV app's code, so changes there apply to both.

## Install

1. Copy `dist/FlightOverhead.apk` to the phone and open it.
2. Allow installing from that source when asked (**Settings → Apps → Special access →
   Install unknown apps**).
3. Open **Flight Overhead**, allow notifications, then set your location in Settings.
4. On Samsung phones, stop Android from pausing the watcher: **Settings → Apps → Flight
   Overhead → Battery → Unrestricted**.

Background checking keeps the phone partly awake, so it uses some battery. Turn off
**Notify when the app is closed** in Settings to stop it.

## Build

```sh
./build.sh
```

It needs Java 17+ and, the first time, internet access to download the build tools
(Apktool, dalvik-dx, uber-apk-signer and the Android 10 framework classes) into
`~/.cache/flight-overhead-android-tools`. It copies the TV app's web files into the APK,
compiles `src/`, and signs the result.

The signing key is kept outside the repository, at
`~/.cache/flight-overhead-android-tools/flightoverhead.keystore` (or `$KEYSTORE`), and is
created on the first build. Updates must be signed with the same key, or Android refuses
to install them over the existing app, so back the key up. A new key means uninstalling
the old app first, which clears its settings.

## Files

```
AndroidManifest.xml   Permissions, the screen, the background service, the boot receiver
src/.../MainActivity  Shows the shared app in a WebView, Back button, location, JS bridge
src/.../AlertService  Background checks and notifications while the app is closed
src/.../AlertLogic    Overhead and private-jet rules (mirrors js/tracker.js)
src/.../BootReceiver  Restarts the watcher after a reboot or app update
res/drawable-nodpi/   App and notification icons
```
