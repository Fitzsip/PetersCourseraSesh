// Fetches charging-station data for the Republic of Ireland and Northern Ireland
// from open data sources, with a short-lived browser cache.

import { fromOpenChargeMap, fromOverpass, mergeStations } from './normalize.js';

const CACHE_KEY = 'evie.stations.v2';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const PARTIAL_CACHE_TTL_MS = 15 * 60 * 1000; // retry failed sources sooner

const OCM_URL = 'https://api.openchargemap.io/v3/poi/';
const OVERPASS_TIMEOUT_MS = 45 * 1000; // per mirror; the public servers can be slow
const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

// A bounding box around the island is much lighter for the public servers
// than an area lookup. It clips a corner of Scotland, removed in fetchOverpass.
const OVERPASS_QUERY = `
[out:json][timeout:60];
nwr["amenity"="charging_station"](51.3,-10.8,55.45,-5.3);
out center tags;
`;
const inScotland = (s) => s.lat > 55.2 && s.lon > -6.05;

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
      return data.elements.map(fromOverpass).filter((st) => !inScotland(st));
    } catch (e) {
      if (e.name === 'TimeoutError') lastErr = new Error('timed out');
      else if (e instanceof TypeError) lastErr = new Error('server busy or unreachable');
      else lastErr = e;
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
    // Data missing a source is kept briefly, so the failed source is retried soon.
    const ttl = c.errors?.length ? PARTIAL_CACHE_TTL_MS : CACHE_TTL_MS;
    return Date.now() - c.fetchedAt < ttl ? c : null;
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
