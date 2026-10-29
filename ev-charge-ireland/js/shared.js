// "I'm heading here": lets drivers see who else is on the way to a charger.
// Backed by a Supabase table (see supabase/schema.sql) through its REST API.
// Switched off unless supabaseUrl and supabaseKey are set in config.js.

import { distanceMetres } from './normalize.js';

const MINE_KEY = 'evie.myIntents';
const MATCH_RADIUS_M = 50;

const cfg = globalThis.window?.EVIE_CONFIG || {};
const baseUrl = (cfg.supabaseUrl || '').replace(/\/$/, '');
const key = cfg.supabaseKey || '';

export const sharedEnabled = Boolean(baseUrl && key);

function headers(extra = {}) {
  const h = { apikey: key, 'Content-Type': 'application/json', ...extra };
  // Legacy anon keys are JWTs and also go in Authorization; new publishable keys don't.
  if (key.startsWith('eyJ')) h.Authorization = `Bearer ${key}`;
  return h;
}

async function call(path, init = {}) {
  const res = await fetch(`${baseUrl}/rest/v1/${path}`, { ...init, headers: headers(init.headers) });
  if (!res.ok) throw new Error(`Shared data HTTP ${res.status}`);
  return res.status === 204 ? null : res.json();
}

// Active intents across Ireland: arriving from 1 hour ago up to 4 hours ahead.
export async function fetchIntents() {
  if (!sharedEnabled) return [];
  const from = new Date(Date.now() - 60 * 60000).toISOString();
  return call(`intents?select=id,station_id,lat,lon,eta&cancelled=eq.false&eta=gte.${encodeURIComponent(from)}&order=eta&limit=2000`);
}

export async function announce(station, eta) {
  const token = crypto.randomUUID();
  const [row] = await call('intents?select=id', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ station_id: station.id, lat: station.lat, lon: station.lon, eta: eta.toISOString(), token }),
  });
  const mine = myIntents().filter((m) => new Date(m.eta).getTime() > Date.now() - 60 * 60000);
  mine.push({ id: row.id, token, stationId: station.id, eta: eta.toISOString() });
  saveMine(mine);
  return row.id;
}

export async function cancel(intentId) {
  const mine = myIntents();
  const m = mine.find((x) => x.id === intentId);
  if (!m) return;
  await call('rpc/cancel_intent', { method: 'POST', body: JSON.stringify({ p_id: m.id, p_token: m.token }) });
  saveMine(mine.filter((x) => x.id !== intentId));
}

export function myIntents() {
  try {
    return JSON.parse(localStorage.getItem(MINE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveMine(list) {
  try {
    localStorage.setItem(MINE_KEY, JSON.stringify(list));
  } catch {}
}

// Station ids differ between data sources, so intents are matched to stations
// by position. Returns a function station -> intents at that station.
export function indexIntents(intents) {
  const grid = new Map();
  const cell = (lat, lon) => `${Math.round(lat * 1000)}:${Math.round(lon * 1000)}`;
  for (const i of intents) {
    const k = cell(i.lat, i.lon);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }
  return (s) => {
    const la = Math.round(s.lat * 1000);
    const lo = Math.round(s.lon * 1000);
    const out = [];
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++)
        for (const i of grid.get(`${la + a}:${lo + b}`) || [])
          if (i.station_id === s.id || distanceMetres(i, s) <= MATCH_RADIUS_M) out.push(i);
    return out;
  };
}
