# Flight Overhead — Samsung TV app

A Samsung Smart TV (Tizen) app that shows a live radar of aircraft around your
house and **pops up a card when a plane flies overhead**: callsign, airline,
route (e.g. `LHR → JFK`), aircraft type, a photo, altitude, speed and heading,
with a chime.



## How it works

* Every 5 seconds the app asks a free ADS-B flight-tracking API for aircraft
  near your home (default **adsb.lol**; **airplanes.live** and **OpenSky** are
  also built in). No API key is needed.
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
| **OK** | Open settings, or dismiss the newest popup |
| **Red** | Show a test popup for the nearest plane |
| **Back** | Dismiss the popup, close settings, or exit |
| ▲ ▼ ◀ ▶ | Move and change values in settings |

On first launch you're asked for your home's latitude and longitude. To find
them, right-click your roof in Google Maps and click the coordinates to copy
them. You can also turn on **Demo mode** to see simulated planes.

## Try it in a desktop browser

Open `index.html` in Chrome. Handy URL options:

```
index.html?demo=1                      simulated planes, no network needed
index.html?lat=40.6413&lon=-73.7781    use real data for this location
```

Use **Enter**, **Esc** and **T** (test popup) in place of the remote buttons.
If a browser blocks the API with a CORS error, use demo mode. The TV app is
not affected because Tizen apps are allowed to call these APIs directly.

## Install on your Samsung TV

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
| Data source | adsb.lol | `adsb.lol`, `airplanes.live` or `opensky` |
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
