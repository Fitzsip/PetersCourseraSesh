// Fetches charging-station data for the Republic of Ireland and Northern Ireland
// from open data sources, with a short-lived browser cache.

import { fromOpenChargeMap, fromOverpass, mergeStations } from './normalize.js';

const CACHE_KEY = 'evie.stations.v1';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

const OCM_URL = 'https://api.openchargemap.io/v3/poi/';
const OVERPASS_TIMEOUT_MS = 45 * 1000; // per mirror; the public servers can be slow
const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

// The whole island: ROI (IE) plus Northern Ireland (GB-NIR).
const OVERPASS_QUERY = `
[out:json][timeout:60];
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
        signal: AbortSignal.timeout(OVERPASS_TIMEOUT_MS),
      });
      return data.elements.map(fromOverpass);
    } catch (e) {
      lastErr = e.name === 'TimeoutError' ? new Error('timed out') : e;
    }
  }
  throw lastErr;
}

// Loads from every source that works and merges them. Calls onUpdate with the
// merged stations each time a source finishes, so fast sources show up without
// waiting for slow ones.
export async function loadStations({ ocmKey, force = false, onUpdate = () => {} } = {}) {
  if (!force) {
    const cached = readCache();
    if (cached) return { ...cached, fromCache: true };
  }

  // Order matters: earlier sources win when the same site is merged.
  const sources = [
    ['Open Charge Map', () => fetchOpenChargeMap(ocmKey)],
    ['OpenStreetMap', fetchOverpass],
  ];
  const lists = sources.map(() => null);
  const errors = [];
  let pending = sources.length;

  const snapshot = () => ({
    stations: mergeStations(lists.filter(Boolean)),
    errors: [...errors],
    pending: sources.filter((_, i) => !lists[i] && !errors.some((e) => e.startsWith(sources[i][0]))).map(([n]) => n),
    fetchedAt: Date.now(),
  });

  await Promise.all(
    sources.map(async ([name, fetchFn], i) => {
      try {
        lists[i] = await fetchFn();
      } catch (e) {
        errors.push(`${name}: ${e.message}`);
      }
      pending--;
      if (pending) onUpdate(snapshot());
    }),
  );

  if (!lists.some(Boolean)) throw new Error(`No data sources could be reached.\n${errors.join('\n')}`);

  const result = snapshot();
  // Only cache complete data, so a slow source gets another chance next visit.
  if (!errors.length) writeCache(result);
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
