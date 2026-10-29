// The driver's car profile and current trip (battery, conditions), kept in
// this browser only.

const PROFILE_KEY = 'evie.profile';
const TRIP_KEY = 'evie.trip';

export const DEFAULT_RESERVE_PCT = 10;

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function loadProfile() {
  const p = read(PROFILE_KEY);
  return p && p.usableKwh > 0 && p.consumption > 0 ? p : null;
}

export function saveProfile(p) {
  write(PROFILE_KEY, p);
}

export function loadTrip() {
  return { batteryPct: 50, conditions: 'mixed', ...(read(TRIP_KEY) || {}) };
}

export function saveTrip(t) {
  write(TRIP_KEY, t);
}

export function describeCar(p) {
  return [p.year, p.make, p.model].filter(Boolean).join(' ') || 'My car';
}
