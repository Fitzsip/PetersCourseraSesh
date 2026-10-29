// Pure planning logic: range, compatibility, charge time, estimated
// availability and ranking. No DOM or network access, so it is unit-tested.
//
// profile: { usableKwh, consumption (kWh/100km), maxDcKw, maxAcKw,
//            dcPlug ('CCS'|'CHAdeMO'|null), reservePct, make }

import { distanceMetres } from './normalize.js';

export const CONDITIONS = {
  mixed: { label: 'Mixed driving', factor: 1 },
  motorway: { label: 'Mostly motorway', factor: 1.15 },
  cold: { label: 'Cold or wet weather', factor: 1.15 },
  motorwayCold: { label: 'Motorway, cold weather', factor: 1.3 },
};

// Roads are longer than straight lines; used until real routing comes back.
export const ROAD_FACTOR = 1.3;
const AVG_SPEED_KMH = 60;
const DC_TARGET_PCT = 80;
const AC_TARGET_PCT = 100;
// How long another driver is assumed to occupy a plug once they arrive.
export const SESSION_MIN = 40;

const DC_TYPES = new Set(['CCS', 'CHAdeMO', 'Tesla']);

function kwhPerKm(profile, conditions = 'mixed') {
  return (profile.consumption * (CONDITIONS[conditions]?.factor ?? 1)) / 100;
}

// Usable range keeping the reserve in hand.
export function rangeKm(profile, batteryPct, conditions) {
  const pct = Math.max(0, batteryPct - profile.reservePct);
  return ((pct / 100) * profile.usableKwh) / kwhPerKm(profile, conditions);
}

// Inverse of rangeKm, for when the driver enters the km shown on the dashboard.
export function pctForRange(profile, km, conditions) {
  return Math.min(100, profile.reservePct + ((km * kwhPerKm(profile, conditions)) / profile.usableKwh) * 100);
}

export function arrivalPct(profile, batteryPct, km, conditions) {
  return batteryPct - ((km * kwhPerKm(profile, conditions)) / profile.usableKwh) * 100;
}

// Which of the station's connectors this car can use, and how fast.
// ok: true / false, or null when the station doesn't report its connectors.
export function compatibility(station, profile) {
  if (!station.connectors.length) return { ok: null, kw: null, dc: false };
  let best = null;
  for (const c of station.connectors) {
    const dc = DC_TYPES.has(c.type);
    let usable;
    if (!dc) usable = c.type === 'Type 2';
    else if (c.type === 'Tesla') usable = profile.make === 'Tesla';
    else usable = c.type === profile.dcPlug && profile.maxDcKw > 0;
    if (!usable) continue;
    const carMax = dc ? profile.maxDcKw : profile.maxAcKw;
    const kw = Math.min(c.kw || (dc ? 50 : 7), carMax);
    if (!best || kw > best.kw) best = { ok: true, kw, dc };
  }
  return best || { ok: false, kw: null, dc: false };
}

// Minutes to charge from fromPct to the usual stopping point (80% on DC, as
// charging slows sharply after that; full on AC).
export function chargeMinutes(profile, fromPct, kw, dc) {
  const target = dc ? DC_TARGET_PCT : AC_TARGET_PCT;
  if (!kw || fromPct >= target) return 0;
  const kwh = ((target - Math.max(0, fromPct)) / 100) * profile.usableKwh;
  const avgKw = kw * (dc ? 0.75 : 0.95); // DC tapers as the battery fills
  return Math.round((kwh / avgKw) * 60);
}

// Rough chance a single plug is busy, by hour of day. This is an assumption
// based on typical public-charging patterns, not measured Irish data.
const HOURLY_BUSY = [
  0.05, 0.04, 0.03, 0.03, 0.03, 0.05, 0.1, 0.18, 0.25, 0.28, 0.3, 0.33,
  0.36, 0.36, 0.34, 0.33, 0.35, 0.38, 0.38, 0.33, 0.26, 0.18, 0.12, 0.08,
];

export function plugBusyChance(date, rapid) {
  let p = HOURLY_BUSY[date.getHours()];
  const day = date.getDay();
  if (day === 0 || day === 6) p *= 0.9;
  if (day === 5 || day === 0) p += 0.05; // Friday/Sunday travel peaks
  if (rapid) p += 0.1; // fast chargers attract more drivers
  return Math.min(0.9, p);
}

// Estimated chance at least one plug is free on arrival.
// othersAhead: other app users expected to be charging there when you arrive.
export function availability(station, arriveAt, othersAhead = 0) {
  if (station.status === 'offline') return { pFree: 0, level: 'none', label: 'Reported out of service' };
  const plugs = station.points || station.connectors.reduce((n, c) => n + (c.qty || 1), 0) || 1;
  const remaining = plugs - othersAhead;
  const busy = plugBusyChance(arriveAt, (station.maxKw || 0) >= 43);
  const pFree = remaining <= 0 ? 0.1 : 1 - busy ** remaining;
  let level = 'low';
  let label = 'Often busy around then';
  if (pFree >= 0.75) [level, label] = ['high', 'Likely free'];
  else if (pFree >= 0.5) [level, label] = ['medium', 'May be busy'];
  return { pFree, level, label };
}

// Number of other drivers expected to occupy a plug when you arrive: those
// arriving before you and still within a typical session.
export function othersAheadOf(intents, myArrival, mine = new Set()) {
  const t = myArrival.getTime();
  return intents.filter((i) => {
    if (mine.has(i.id)) return false;
    const eta = new Date(i.eta).getTime();
    return eta <= t && eta > t - SESSION_MIN * 60000;
  }).length;
}

// Rank stations for this driver. Returns reachable, compatible stations sorted
// by estimated minutes until charged (drive + likely wait + charging).
// routes: optional Map stationId -> { km, min } from a routing service.
export function recommend(stations, ctx) {
  const { origin, profile, batteryPct, conditions, now = new Date(), routes = new Map(), intentsFor = () => [], mine } = ctx;
  const range = rangeKm(profile, batteryPct, conditions);
  const out = [];
  for (const s of stations) {
    if (s.status === 'offline') continue;
    const compat = compatibility(s, profile);
    if (compat.ok === false) continue;
    const straightKm = distanceMetres(origin, s) / 1000;
    if (straightKm * ROAD_FACTOR > range * 1.1 && !routes.has(s.id)) continue;
    const route = routes.get(s.id);
    const km = route ? route.km : straightKm * ROAD_FACTOR;
    if (km > range) continue;
    const driveMin = route ? route.min : (km / AVG_SPEED_KMH) * 60;
    const arriveAt = new Date(now.getTime() + driveMin * 60000);
    const arrive = arrivalPct(profile, batteryPct, km, conditions);
    const intents = intentsFor(s);
    const ahead = othersAheadOf(intents, arriveAt, mine);
    const avail = availability(s, arriveAt, ahead);
    const chargeMin = compat.kw ? chargeMinutes(profile, arrive, compat.kw, compat.dc) : null;
    const expectedWait = (1 - avail.pFree) * 20;
    // Unknown connectors: still shown, but ranked as if slow.
    const score = driveMin + expectedWait + (chargeMin ?? 90);
    out.push({ station: s, km, routed: Boolean(route), driveMin, arriveAt, arrivePct: arrive, compat, chargeMin, avail, ahead, heading: intents.length, score });
  }
  return out.sort((a, b) => a.score - b.score);
}
