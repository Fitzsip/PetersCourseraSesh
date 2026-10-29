# Charge Ireland

Public EV charging points across the island of Ireland on one map, whichever network runs them
(ESB ecars, IONITY, EasyGo, Tesla, Circle K, Applegreen, Weev and others), so drivers don't
need to switch between apps.

## What it does

- Pulls charger data from **Open Charge Map** and **OpenStreetMap**, merges duplicate entries for
  the same site, and shows the result on one clustered map.
- **My car:** pick your make, year and model (about 55 common EVs in Ireland, specs editable) and
  it works out your range, which plugs you can use and how long charging takes. Saved on your
  device only.
- **Battery:** set your charge with a slider, or type the km left on your dashboard. Choose
  driving conditions (motorway, cold weather) to adjust the range. The map draws your approximate
  reach and fades chargers beyond it.
- **Best for you:** ranks reachable, compatible chargers by estimated minutes until you're
  charged (drive + likely wait + charging), using real road distances and drive times from
  your GPS position.
- **Estimated availability:** "Likely free / May be busy / Often busy", based on the number of
  plugs, typical busy times for the hour and day you'd arrive, charger speed and other app users
  heading there. **This is an estimate, not live data**; see below.
- **I'm heading here** (needs the shared database, see below): tell other drivers you're on the
  way. Others see how many drivers are expected before them; the first to arrive is assumed to
  get the plug.
- Filters by connector, minimum power and network, place/Eircode search, and following your
  location while the app is open.
## Running it

It's a static site with no build step. Open Charge Map needs a free API key; without one, the map
falls back to OpenStreetMap data only.

```bash
cd ev-charge-ireland
npm start          # serves on http://localhost:8080
npm test           # unit tests for parsing and de-duplication
```

Get a key at <https://openchargemap.org/site/develop/api>, then either paste it into ⚙︎ Settings
in the app (saved in that browser), or put it in `config.js` so every visitor uses it.

It's published to **https://fitzsip.github.io/PetersCourseraSesh/** by
`.github/workflows/pages.yml` on every push to `master` (one-time setup: repo
**Settings → Pages → Source: GitHub Actions**).

## How the data is combined

| Source | Coverage | Notes |
|---|---|---|
| Open Charge Map | Republic of Ireland plus a Northern Ireland bounding box | Best for operator, status and pricing. Licensed CC BY 4.0. |
| OpenStreetMap (Overpass API) | ROI + NI | Fills gaps, especially newer and smaller sites. Licensed ODbL. |

`js/normalize.js` converts both into one station format. Records less than 40 m apart from
different sources, with a compatible operator, count as the same site. Open Charge Map's fields
win, and OpenStreetMap fills in anything missing.

## Switching on "I'm heading here" (free Supabase project)

1. Create a free account and project at <https://supabase.com>.
2. In the project, open **SQL Editor → New query**, paste in `supabase/schema.sql`, and click **Run**.
3. In **Project Settings → API**, copy the **Project URL** and the **publishable** (or `anon`)
   key into `config.js` as `supabaseUrl` and `supabaseKey`.

The key is meant to be public. The table's rules only allow reading recent entries, adding new
ones, and cancelling your own (with a secret only your phone holds). No names, accounts or
locations are stored, just the charger position and expected arrival time.

## Limits worth knowing

- **Availability is estimated, not live.** EU rules (AFIR) now require operators to publish live
  charger status through national access points (Ireland: TII / data.gov.ie). Connecting to that
  feed is the next step and would replace the estimate wherever live data exists.
- The busy-time pattern in `js/planner.js` is an assumption, not measured Irish data.
- Car specs are typical figures; real range varies with speed, temperature and battery age.
- "I'm heading here" is honour-based and anonymous, so anyone could post false entries.
  Fine for a pilot; it would need sign-in or rate limits before wide use.
- The public OpenStreetMap (Overpass) and OSRM routing servers are shared and rate-limited.
  For heavier use, serve a prebuilt `stations.json` snapshot and self-host routing.

## Files

```
index.html        page layout
styles.css        styling (light/dark, mobile)
config.js         optional site-wide Open Charge Map key
js/app.js         map, panels, car dialog, location, "heading here" UI
js/sources.js     fetching + caching charger data
js/normalize.js   converting and de-duplicating provider data
js/planner.js     range, compatibility, charge time, availability estimate, ranking
js/vehicles.js    EV specs
js/profile.js     saving the car and battery settings
js/routing.js     road distances (OSRM)
js/shared.js      "heading here" data (Supabase)
supabase/         database setup for "heading here"
test/             node --test unit tests
```
