// Converts raw records from each data provider into one common station shape,
// then merges duplicates that appear in more than one source.
//
// Station shape:
// {
//   id, sources: ['ocm'|'osm'], name, lat, lon, address, operator,
//   connectors: [{ type, kw, qty }], maxKw, points,
//   status: 'operational' | 'offline' | 'unknown',
//   cost, updated, links: [{ label, url }]
// }

export const CONNECTOR_TYPES = ['Type 2', 'CCS', 'CHAdeMO', 'Tesla', 'Other'];

export function connectorFamily(title = '') {
  const t = title.toLowerCase();
  if (t.includes('chademo')) return 'CHAdeMO';
  if (t.includes('ccs') || t.includes('combo')) return 'CCS';
  if (t.includes('tesla')) return 'Tesla';
  if (t.includes('type 2') || t.includes('type2') || t.includes('mennekes')) return 'Type 2';
  return 'Other';
}

export function speedBand(kw) {
  if (!kw) return 'unknown';
  if (kw >= 100) return 'ultra';
  if (kw >= 43) return 'rapid';
  if (kw > 22) return 'fast';
  return 'standard';
}

// ---------- Open Charge Map ----------

export function fromOpenChargeMap(poi) {
  const a = poi.AddressInfo || {};
  const connectors = (poi.Connections || []).map((c) => ({
    type: connectorFamily(c.ConnectionType?.Title),
    kw: c.PowerKW || null,
    qty: c.Quantity || 1,
  }));
  const st = poi.StatusType;
  let status = 'unknown';
  if (st && st.IsOperational === true) status = 'operational';
  else if (st && st.IsOperational === false) status = 'offline';

  const address = [a.AddressLine1, a.AddressLine2, a.Town, a.StateOrProvince, a.Postcode]
    .filter(Boolean)
    .join(', ');

  return finish({
    id: `ocm-${poi.ID}`,
    sources: ['ocm'],
    name: a.Title || 'Charging station',
    lat: a.Latitude,
    lon: a.Longitude,
    address,
    operator: cleanOperator(poi.OperatorInfo?.Title),
    connectors,
    points: poi.NumberOfPoints || null,
    status,
    cost: poi.UsageCost || null,
    updated: poi.DateLastStatusUpdate || poi.DateLastVerified || null,
    links: [{ label: 'Open Charge Map', url: `https://map.openchargemap.io/?id=${poi.ID}` }],
  });
}

// ---------- OpenStreetMap (Overpass) ----------

const OSM_SOCKETS = {
  type2: 'Type 2',
  type2_cable: 'Type 2',
  type2_combo: 'CCS',
  chademo: 'CHAdeMO',
  tesla_supercharger: 'Tesla',
  tesla_supercharger_ccs: 'CCS',
};

export function parseKw(value) {
  if (!value) return null;
  const m = String(value).match(/([\d.]+)\s*(kw|w)?/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return m[2] && m[2].toLowerCase() === 'w' ? n / 1000 : n;
}

export function fromOverpass(el) {
  const tags = el.tags || {};
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;

  const connectors = [];
  for (const [key, family] of Object.entries(OSM_SOCKETS)) {
    const qtyTag = tags[`socket:${key}`];
    if (!qtyTag || qtyTag === 'no') continue;
    const qty = parseInt(qtyTag, 10) || 1;
    connectors.push({ type: family, kw: parseKw(tags[`socket:${key}:output`]), qty });
  }

  let status = 'unknown';
  if (tags['disused:amenity'] || tags.operational_status === 'closed') status = 'offline';

  const address = [
    [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' '),
    tags['addr:city'] || tags['addr:town'] || tags['addr:village'],
    tags['addr:county'],
  ]
    .filter(Boolean)
    .join(', ');

  return finish({
    id: `osm-${el.type}-${el.id}`,
    sources: ['osm'],
    name: tags.name || tags.brand || tags.operator || 'Charging station',
    lat,
    lon,
    address,
    operator: cleanOperator(tags.operator || tags.network || tags.brand),
    connectors,
    points: parseInt(tags.capacity, 10) || null,
    status,
    cost: tags.fee === 'no' ? 'Free' : tags.charge || null,
    updated: null,
    links: [{ label: 'OpenStreetMap', url: `https://www.openstreetmap.org/${el.type}/${el.id}` }],
  });
}

// ---------- shared helpers ----------

const OPERATOR_ALIASES = [
  [/esb|ecars/i, 'ESB ecars'],
  [/ionity/i, 'IONITY'],
  [/easygo|easy go/i, 'EasyGo'],
  [/tesla/i, 'Tesla'],
  [/circle\s*k/i, 'Circle K'],
  [/applegreen/i, 'Applegreen Electric'],
  [/weev/i, 'Weev'],
  [/pod\s*point/i, 'Pod Point'],
  [/bp\s*pulse/i, 'bp pulse'],
  [/tonik/i, 'Tonik'],
  [/electric\s*ireland/i, 'Electric Ireland'],
];

export function cleanOperator(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (/unknown|^\(|business owner/i.test(s)) return null;
  for (const [re, name] of OPERATOR_ALIASES) if (re.test(s)) return name;
  return s;
}

function finish(st) {
  st.maxKw = st.connectors.reduce((m, c) => Math.max(m, c.kw || 0), 0) || null;
  if (!st.points) st.points = st.connectors.reduce((n, c) => n + (c.qty || 1), 0) || null;
  return st;
}

export function distanceMetres(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function sameOperator(a, b) {
  return !a.operator || !b.operator || a.operator === b.operator;
}

// Merge stations from several sources. Records within `radius` metres and with a
// compatible operator are treated as the same site. The first list wins for
// scalar fields (Open Charge Map has richer status/cost data); gaps are filled
// from the later lists.
export function mergeStations(lists, radius = 40) {
  const merged = [];
  // Coarse grid so we don't compare every pair (~0.001 deg is ~110 m).
  const grid = new Map();
  const cellKey = (lat, lon) => `${Math.round(lat * 1000)}:${Math.round(lon * 1000)}`;

  const neighbours = (s) => {
    const out = [];
    const la = Math.round(s.lat * 1000);
    const lo = Math.round(s.lon * 1000);
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++) out.push(...(grid.get(`${la + i}:${lo + j}`) || []));
    return out;
  };

  for (const list of lists) {
    for (const s of list) {
      if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon)) continue;
      const match = neighbours(s).find(
        (m) => !m.sources.includes(s.sources[0]) && sameOperator(m, s) && distanceMetres(m, s) <= radius,
      );
      if (match) {
        match.sources.push(...s.sources);
        match.links.push(...s.links);
        for (const k of ['address', 'operator', 'cost', 'points', 'updated'])
          if (!match[k] && s[k]) match[k] = s[k];
        if (match.status === 'unknown') match.status = s.status;
        if (!match.connectors.length) match.connectors = s.connectors;
        match.maxKw = Math.max(match.maxKw || 0, s.maxKw || 0) || null;
        continue;
      }
      const copy = { ...s, sources: [...s.sources], links: [...s.links] };
      merged.push(copy);
      const key = cellKey(s.lat, s.lon);
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(copy);
    }
  }
  return merged;
}
