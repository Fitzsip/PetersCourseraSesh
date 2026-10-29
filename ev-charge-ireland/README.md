# Charge Ireland

Public EV charging points across the island of Ireland on one map, whichever network runs them
(ESB ecars, IONITY, EasyGo, Tesla, Circle K, Applegreen, Weev and others), so drivers don't
need to switch between apps.

## What it does

- Pulls charger data from **Open Charge Map** and **OpenStreetMap**, merges duplicate entries for
  the same site, and shows the result on one clustered map.
- Filters by connector (Type 2, CCS, CHAdeMO, Tesla), minimum power and network, and can hide
  chargers reported out of service.
- Search by town, address or Eircode, or use **Near me**. The side panel lists the nearest
  chargers in view.
- Each charger popup shows its connectors, power, cost (where known), operational status, a
  Directions link and links back to the source records.
- Works on phones; data is cached in the browser for 6 hours.

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

To publish it, any static host works, for example GitHub Pages pointed at this folder.

## How the data is combined

| Source | Coverage | Notes |
|---|---|---|
| Open Charge Map | Republic of Ireland plus a Northern Ireland bounding box | Best for operator, status and pricing. Licensed CC BY 4.0. |
| OpenStreetMap (Overpass API) | ROI + NI | Fills gaps, especially newer and smaller sites. Licensed ODbL. |

`js/normalize.js` converts both into one station format. Records less than 40 m apart from
different sources, with a compatible operator, count as the same site. Open Charge Map's fields
win, and OpenStreetMap fills in anything missing.

## Limits worth knowing

- **Live "free right now" availability isn't included yet.** Neither open source publishes
  real-time per-plug occupancy. "Out of service" comes from Open Charge Map's status field,
  which is crowd-sourced and can lag. Live occupancy would need data-sharing agreements with
  operators (ESB ecars is the largest network) or OCPI roaming access. That's the natural next
  step.
- The OpenStreetMap Overpass API is rate-limited and shared. For heavier use, add a small
  scheduled job that builds a `stations.json` snapshot and serve that instead of calling the
  APIs from every browser.

## Files

```
index.html        page layout
styles.css        styling (light/dark, mobile)
config.js         optional site-wide Open Charge Map key
js/app.js         map, filters, list, search, settings
js/sources.js     fetching + caching
js/normalize.js   converting and de-duplicating provider data
test/             node --test unit tests
```
