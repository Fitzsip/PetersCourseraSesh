# Flight Overhead — Samsung TV app

A Samsung Smart TV (Tizen) app that shows a live radar of aircraft around your
house and **pops up a card when a plane flies overhead**: callsign, airline,
route (e.g. `LHR → JFK`), aircraft type, a photo, altitude, speed and heading,
with a chime.



## How it works

* Every 5 seconds the app asks a free ADS-B flight-tracking API for aircraft
  near your home. In **auto** mode it tries **adsb.fi**, then **airplanes.live**,
  then **adsb.lol**, and sticks with whichever answers. No API key is needed.
* Private jets alert from further out (10 km by default) at any altitude, and the
  side list shows an **OVER HOUSE 1m 20s** countdown for planes heading your way.
* A plane counts as **overhead** when it is below the altitude limit (default
  20,000 ft) and either within the overhead radius (default 2.5 km) or on a
  course that will bring it inside that radius within 30 seconds. The early
  alert makes up for API and polling delay.
* Each aircraft is announced once per pass (20 minute cooldown).
* **Private jets** get a pink **PRIVATE JET** badge, a pink radar marker and a
  different chime. They're recognised by business-jet type (Gulfstream,
  Challenger, Citation, Falcon, Learjet, Phenom…), by private-jet operator
  callsigns (NetJets, VistaJet, Flexjet…), or by an airliner flying under its
  registration rather than an airline callsign (e.g. a Boeing Business Jet).
  Set **Pop up for → private jets** to only be alerted for those.
  Military aircraft, helicopters and private light aircraft are flagged too.
* Routes come from the adsb.lol route database and photos from
  planespotters.net. Both are optional and fail quietly.

## Push alerts to a phone (ntfy)

The TV can only show popups while the app is open, so it can also send alerts
to a phone with [ntfy](https://ntfy.sh), a free notification app:

1. Install **ntfy** on the phone (App Store / Google Play), tap **+** and
   subscribe to a topic name. Make it unique and hard to guess, for example
   `lisa-jets-4471`. Anyone who knows the name can read the alerts.
2. On the TV, open Settings, enter the same name in **Phone push topic (ntfy)**
   and choose **Send a test push**.
3. Choose **Push to phone for** → `private jets` (default) or `all alerts`.
   **No pushes 22:00–08:00** is on by default.

A push looks like:

```
Private jet approaching ✈️
VJT612 · Challenger 350 · 9H-VCE
Farnborough → Cork
6.9 km NNE of Home, 2,800 ft, over the house in ~1m 20s
In the air 47 min · Today: France → United Kingdom
```

Pushes only go out while the app is running on the TV.

## Where it came from, flight time and countries visited (optional)

The free APIs only report where planes are *right now*. Airline flights still get
their route from the adsb.lol route database, but private jets usually don't
have one. With a free **FlightAware AeroAPI** key the popup also shows:

* where the plane took off (for private jets too),
* how long it has been in the air,
* the countries the aircraft has been to today, e.g.
  `Today: Switzerland → France → United Kingdom (3 countries, 3 flights)`.

Setup:

1. Sign up at <https://www.flightaware.com/aeroapi/> and choose the **Personal**
   tier. At the time of writing it includes $5 of free queries a month (check
   the current pricing on that page).
2. Create an API key in the AeroAPI portal.
3. On the TV, open Settings → **FlightAware API key** and type it in. Typing is
   easier with the keyboard in the SmartThings phone app. You can also put it
   in `flightawareKey` in `js/config.js` before building, but don't commit it
   to a public repository.

The app makes one query per aircraft that triggers a popup, and caches it for
30 minutes. Radar-only planes never use any. Aircraft whose owners have asked
FlightAware to hide them won't have history.

## Remote control

| Button | Action |
| --- | --- |
| ▲ ▼ | Highlight a plane in the Nearby list (ringed on the radar) |
| **OK** | Details for the highlighted plane (OK again closes them); otherwise dismiss the newest popup or open settings |
| **Red** | Show a test popup for the nearest plane |
| **Back** / ◀ | Dismiss the popup, clear the highlight, close settings, or exit |
| ▲ ▼ ◀ ▶ | Move and change values in settings |

On first launch, Settings opens. Type your Eircode or address, choose **Find my
house from the address**, check the coordinates and press **Save**. The free map
data has few Eircodes, so if yours isn't found, open Google Maps on your phone,
search the Eircode, press and hold your roof, and type the numbers shown
(e.g. `51.91234, -8.46789`) into the same box. They're
saved on the TV, so the app goes straight to the radar on every later launch.
Uninstalling the app clears them. You can also turn on **Demo mode** to see
simulated planes.

## Try it in a desktop browser

Open `index.html` in Chrome. Handy URL options:

```
index.html?demo=1                      simulated planes, no network needed
index.html?lat=40.6413&lon=-73.7781    use real data for this location
```

Use **Enter**, **Esc** and **T** (test popup) in place of the remote buttons.
If a browser blocks the API with a CORS error, use demo mode. The TV app is
not affected because Tizen apps are allowed to call these APIs directly.

## Install from your phone (Apps2Samsung)

1. On the TV: open **Apps**, press `1 2 3 4 5` on the remote, turn **Developer mode**
   on, enter your **phone's** IP address, and restart the TV.
2. Get `dist/FlightOverhead.wgt` onto the phone. Rebuild it after code changes
   with `./build-wgt.sh`.
3. In Apps2Samsung, pick the TV, choose the custom `.wgt` option, select
   `FlightOverhead.wgt` and install. Apps2Samsung signs it for your TV.

Install updates the same way. A copy installed with a different tool, such as
Tizen Studio, has a different certificate and must be uninstalled first, which
also clears the saved location.

## Install on your Samsung TV (Tizen Studio)

You need a Samsung Tizen TV (2016 or newer) and a computer on the same Wi-Fi.

1. **Install Tizen Studio** from <https://developer.tizen.org/development/tizen-studio/download>.
   In its Package Manager, under *Extension SDK*, install **Samsung TV Extensions** and
   **Samsung Certificate Extension**.
2. **Turn on Developer Mode on the TV.** Open **Apps**, then press `1 2 3 4 5` on the
   remote. Switch Developer mode **On**, enter your computer's IP address, and
   restart the TV (hold the power button until it turns off and back on).
3. **Connect to the TV.** In Tizen Studio, open *Tools → Device Manager → Remote
   Device Manager*, scan or add the TV's IP address, and switch it to connected.
4. **Create a Samsung certificate.** Open *Tools → Certificate Manager*, click **+**,
   choose **Samsung → TV**, and sign in with your Samsung account. Use the connected
   TV when asked for a device (DUID).
5. **Build and install.** Either import this folder in Tizen Studio
   (*File → Import → Tizen → Tizen Project*) and use *Run As → Tizen Web Application*,
   or use the command line:

   ```sh
   cd flight-overhead-tv
   tizen build-web -- .
   tizen package -t wgt -s <your-certificate-profile> -- .buildResult
   tizen install -n .buildResult/FlightOverhead.wgt -t <tv-device-name>
   tizen run -p FlOvrhd001.FlightOverhead -t <tv-device-name>
   ```

   `sdb devices` lists the TV's device name.

The app then appears in the TV's Apps list as **Flight Overhead**. Developer
installs can expire after a while; reinstall the same way if that happens.

## Limitation: popups only show while the app is open

Samsung doesn't let third-party apps draw on top of live TV, HDMI inputs or
other apps, so popups only show while Flight Overhead is open. It's designed to
be left running on the TV as an ambient "plane radar" screen. It keeps the TV's
screen saver off and shifts the picture by a few pixels every minute to
reduce burn-in.

## Settings

All settings can be changed on the TV. The defaults are in `js/config.js`.

| Setting | Default | Meaning |
| --- | --- | --- |
| Overhead radius | 2.5 km | How close a plane must pass to trigger a popup |
| Ignore planes above | 20,000 ft | Skip high cruising traffic you can barely see |
| Radar range | 30 km | Area shown on the radar and requested from the API |
| Private jet alert radius | 10 km | Private jets alert from this far out, at any altitude |
| Data source | auto | `auto`, `adsb.fi`, `airplanes.live`, `adsb.lol` or `opensky` |
| Phone push topic | (none) | ntfy topic for phone alerts |
| Push to phone for | private jets | `private jets` or `all alerts` |
| No pushes 22:00–08:00 | on | Quiet hours for phone pushes |
| Units | metric | `metric` (m, km/h, km) or `imperial` (ft, mph, mi) |
| Pop up for | all | `all` or `private jets` |
| FlightAware API key | (none) | Enables take-off airport, flight time and countries |

Advanced options are only in `js/config.js`: `lookaheadSeconds`, `pollSeconds`,
`popupSeconds` and `cooldownMinutes`.

Anonymous OpenSky access allows only about 400 requests a day, so with OpenSky
the app polls every 90 seconds and may miss fast planes. Prefer adsb.lol or
airplanes.live.

## Files

```
config.xml        Tizen app manifest (ID, privileges, network access)
index.html        Page layout
css/style.css     TV styling (1920x1080, scales to any size)
js/config.js      Default settings
js/providers.js   Flight data APIs, route and photo lookups
js/notify.js      Phone pushes via ntfy
js/history.js     FlightAware lookup: take-off airport, flight time, countries
js/tracker.js     Overhead detection and alert cooldowns
js/radar.js       Radar drawing
js/ui.js          Side panel and popups
js/settings.js    Remote-controlled settings screen
js/demo.js        Simulated traffic
js/data.js        Airline/aircraft names, private-jet detection, airport countries
```

Flight data © adsb.lol / airplanes.live / The OpenSky Network contributors.
Photos © their photographers via planespotters.net.

## Changelog

* **1.3.1**: Landmarks on the radar (Cork City, Little Island, Blarney, Ballincollig);
  edit `LANDMARKS` in `js/data.js` to add your own.
* **1.3.0**: Select planes in the Nearby list (▲▼, OK) for a detail card with climb rate,
  closest approach and squawk; the radar rings the selected plane.
* **1.2.0**: With a FlightAware key, popups and pushes show origin → destination for
  private jets and the take-off time.
* **1.1.3**: Popups only say "Passed over" for planes that actually went over the house.
* **1.1.2**: Test popups (red button) are labelled as tests.
* **1.1.1**: Eircode search only accepts a result with the same Eircode, falls back
  to Photon, and accepts coordinates or a Google Maps link typed into the address box.
* **1.1.0**: Phone pushes via ntfy, Eircode/address lookup, adsb.fi with automatic
  fallback, hexdb.io routes, "over the house in" countdown, wider private-jet
  alert radius, airport pins on the radar.
* **1.0.0**: Radar, overhead popups, private jet flag, FlightAware history, demo mode.
