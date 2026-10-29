// Road distance and drive time from the driver to a handful of stations, using
// the public OSRM demo server. Callers fall back to straight-line estimates if
// this fails, so it is best-effort only.

const OSRM_URL = 'https://router.project-osrm.org/table/v1/driving/';
const TIMEOUT_MS = 8000;

// Returns Map stationId -> { km, min }.
export async function roadDistances(origin, stations) {
  if (!stations.length) return new Map();
  const coords = [origin, ...stations].map((p) => `${p.lon.toFixed(5)},${p.lat.toFixed(5)}`).join(';');
  const res = await fetch(`${OSRM_URL}${coords}?sources=0&annotations=distance,duration`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Routing HTTP ${res.status}`);
  const data = await res.json();
  if (data.code !== 'Ok') throw new Error(`Routing: ${data.code}`);
  const out = new Map();
  stations.forEach((s, i) => {
    const km = data.distances[0][i + 1];
    const sec = data.durations[0][i + 1];
    if (km != null && sec != null) out.set(s.id, { km: km / 1000, min: sec / 60 });
  });
  return out;
}
