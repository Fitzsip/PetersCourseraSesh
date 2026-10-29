// Fetches charging-station data for the Republic of Ireland and Northern Ireland
// from open data sources, with a short-lived browser cache.

import { fromOpenChargeMap, fromOverpass, mergeStations } from './normalize.js';

const CACHE_KEY = 'evie.stations.v1';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

const OCM_URL = 'https://api.openchargemap.io/v3/poi/';
const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

// The whole island: ROI (IE) plus Northern Ireland (GB-NIR).
const OVERPASS_QUERY = `
[out:json][timeout:90];
(
  area["ISO3166-1"="IE"][admin_level=2];
  area["ISO3166-2"="GB-NIR"];
)->.island;
nwr["amenity"="charging_station"](area.island);
out center tags;
`;

export async function fetchOpenChargeMap(apiKey) {
  if (!apiKey) throw new Error('No Open Charge Map API key set');
  // Northern Ireland is filed under GB; use a bounding box for it.
  const common = { output: 'json', maxresults: '10000', compact: 'false', verbose: 'false', key: apiKey };
  const roi = new URLSearchParams({ ...common, countrycode: 'IE' });
  const ni = new URLSearchParams({
    ...common,
    countrycode: 'GB',
    boundingbox: '(55.4,-8.3),(54.0,-5.4)',
  });
  const [a, b] = await Promise.all([getJson(`${OCM_URL}?${roi}`), getJson(`${OCM_URL}?${ni}`)]);
  return [...a, ...b].map(fromOpenChargeMap);
}

export async function fetchOverpass() {
  let lastErr;
  for (const url of OVERPASS_URLS) {
    try {
      const data = await getJson(url, {
        method: 'POST',
        body: new URLSearchParams({ data: OVERPASS_QUERY }),
      });
      return data.elements.map(fromOverpass);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

// Loads from every source that works, merges, and reports which ones failed.
export async function loadStations({ ocmKey, force = false } = {}) {
  if (!force) {
    const cached = readCache();
    if (cached) return { ...cached, fromCache: true };
  }

  const tasks = [
    ['Open Charge Map', fetchOpenChargeMap(ocmKey)],
    ['OpenStreetMap', fetchOverpass()],
  ];
  const results = await Promise.allSettled(tasks.map(([, p]) => p));

  const lists = [];
  const errors = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') lists.push(r.value);
    else errors.push(`${tasks[i][0]}: ${r.reason.message}`);
  });
  if (!lists.length) throw new Error(`No data sources could be reached.\n${errors.join('\n')}`);

  const result = { stations: mergeStations(lists), errors, fetchedAt: Date.now() };
  writeCache(result);
  return { ...result, fromCache: false };
}

async function getJson(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    return Date.now() - c.fetchedAt < CACHE_TTL_MS ? c : null;
  } catch {
    return null;
  }
}

function writeCache(result) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(result));
  } catch {
    // Storage full or blocked: the app still works, it just refetches next time.
  }
}
