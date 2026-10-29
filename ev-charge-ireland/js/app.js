import { CONNECTOR_TYPES, speedBand, distanceMetres } from './normalize.js';
import { loadStations } from './sources.js';

const KEY_STORAGE = 'evie.ocmKey';
const IRELAND_CENTRE = [53.4, -7.9];
const LIST_LIMIT = 50;

const $ = (sel) => document.querySelector(sel);

const state = {
  stations: [],
  connectors: new Set(),
  minKw: 0,
  operator: '',
  hideOffline: true,
};

// ---------- map ----------

const map = L.map('map', { zoomControl: true }).setView(IRELAND_CENTRE, 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · ' +
    'Charger data: <a href="https://openchargemap.org">Open Charge Map</a> (CC BY 4.0), OpenStreetMap (ODbL)',
}).addTo(map);

const cluster = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 50 });
map.addLayer(cluster);

const legend = L.control({ position: 'topright' });
legend.onAdd = () => {
  const div = L.DomUtil.create('div', 'legend');
  div.setAttribute('aria-hidden', 'true');
  div.innerHTML = [['standard', '≤22 kW'], ['fast', '23–42 kW'], ['rapid', '43–99 kW'], ['ultra', '100 kW+'], ['unknown', 'Unknown']]
    .map(([cls, label]) => `<span><i class="dot ${cls}"></i>${label}</span>`)
    .join('');
  return div;
};
legend.addTo(map);
const markers = new Map(); // station id -> marker

let userMarker = null;

// ---------- filters UI ----------

const connectorBox = $('#connector-filters');
for (const type of CONNECTOR_TYPES) {
  const label = document.createElement('label');
  label.innerHTML = `<input type="checkbox" value="${type}" /> ${type}`;
  connectorBox.append(label);
}
connectorBox.addEventListener('change', (e) => {
  const { value, checked } = e.target;
  checked ? state.connectors.add(value) : state.connectors.delete(value);
  render();
});
$('#min-kw').addEventListener('change', (e) => { state.minKw = Number(e.target.value); render(); });
$('#operator').addEventListener('change', (e) => { state.operator = e.target.value; render(); });
$('#hide-offline').addEventListener('change', (e) => { state.hideOffline = e.target.checked; render(); });

$('#panel-toggle').addEventListener('click', () => {
  const panel = $('#panel');
  const collapsed = panel.classList.toggle('collapsed');
  $('#panel-toggle').setAttribute('aria-expanded', String(!collapsed));
  setTimeout(() => map.invalidateSize(), 50);
});

function matches(s) {
  if (state.hideOffline && s.status === 'offline') return false;
  if (state.operator && s.operator !== state.operator) return false;
  if (state.minKw && !(s.maxKw >= state.minKw)) return false;
  if (state.connectors.size && !s.connectors.some((c) => state.connectors.has(c.type))) return false;
  return true;
}

function populateOperators() {
  const counts = new Map();
  for (const s of state.stations) if (s.operator) counts.set(s.operator, (counts.get(s.operator) || 0) + 1);
  const sel = $('#operator');
  sel.length = 1;
  [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .forEach(([name, n]) => sel.add(new Option(`${name} (${n})`, name)));
}

// ---------- rendering ----------

function icon(s) {
  const cls = `${speedBand(s.maxKw)}${s.status === 'offline' ? ' offline' : ''}`;
  return L.divIcon({
    className: 'station-icon',
    html: `<i class="dot ${cls}"></i>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10],
  });
}

function markerFor(s) {
  let m = markers.get(s.id);
  if (!m) {
    m = L.marker([s.lat, s.lon], { icon: icon(s), title: s.name });
    m.bindPopup(() => popupHtml(s), { maxWidth: 300 });
    markers.set(s.id, m);
  }
  return m;
}

function render() {
  const visible = state.stations.filter(matches);
  cluster.clearLayers();
  cluster.addLayers(visible.map(markerFor));
  renderList(visible);
}

function renderList(visible = state.stations.filter(matches)) {
  const origin = userMarker ? toPoint(userMarker.getLatLng()) : toPoint(map.getCenter());
  const bounds = map.getBounds();
  const inView = visible.filter((s) => bounds.contains([s.lat, s.lon]));
  const nearest = inView
    .map((s) => ({ s, d: distanceMetres(origin, s) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, LIST_LIMIT);

  const list = $('#list');
  list.replaceChildren(
    ...nearest.map(({ s, d }) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.innerHTML = `
        <i class="dot ${speedBand(s.maxKw)}${s.status === 'offline' ? ' offline' : ''}"></i>
        <span class="name">${esc(s.name)}</span>
        <span class="dist">${formatDistance(d)}</span>
        <span class="meta">${esc(s.operator || 'Unknown network')} · ${s.maxKw ? `${s.maxKw} kW` : 'power unknown'} · ${esc(connectorSummary(s) || 'connectors unknown')}</span>`;
      btn.addEventListener('click', () => focusStation(s));
      li.append(btn);
      return li;
    }),
  );

  setStatus(
    `${visible.length.toLocaleString()} of ${state.stations.length.toLocaleString()} chargers match. ` +
      `${inView.length.toLocaleString()} in view${inView.length > LIST_LIMIT ? `, nearest ${LIST_LIMIT} listed` : ''}.` +
      (state.notice ? `\n${state.notice}` : ''),
  );
}

function focusStation(s) {
  const m = markerFor(s);
  cluster.zoomToShowLayer(m, () => m.openPopup());
}

function popupHtml(s) {
  const statusLabel = { operational: 'Operational', offline: 'Out of service', unknown: 'Status not reported' }[s.status];
  const rows = groupConnectors(s.connectors)
    .map((c) => `<tr><td>${esc(c.type)}</td><td>${c.kw ? `${c.kw} kW` : '–'}</td><td>×${c.qty}</td></tr>`)
    .join('');
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}`;
  const links = [{ label: 'Directions', url: directions }, ...s.links]
    .map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`)
    .join('');
  return `
    <div class="popup">
      <h3>${esc(s.name)}</h3>
      <p class="op">${esc(s.operator || 'Unknown network')}</p>
      <span class="badge ${s.status}">${statusLabel}</span>
      ${s.address ? `<p>${esc(s.address)}</p>` : ''}
      ${rows ? `<table>${rows}</table>` : '<p>Connector details not reported.</p>'}
      ${s.cost ? `<p><strong>Cost:</strong> ${esc(s.cost)}</p>` : ''}
      ${s.updated ? `<p style="font-size:12px;color:#666">Status updated ${new Date(s.updated).toLocaleDateString('en-IE')}</p>` : ''}
      <div class="links">${links}</div>
    </div>`;
}

function groupConnectors(connectors) {
  const g = new Map();
  for (const c of connectors) {
    const k = `${c.type}|${c.kw}`;
    const cur = g.get(k);
    cur ? (cur.qty += c.qty) : g.set(k, { ...c });
  }
  return [...g.values()].sort((a, b) => (b.kw || 0) - (a.kw || 0));
}

function connectorSummary(s) {
  return [...new Set(s.connectors.map((c) => c.type))].join(', ');
}

map.on('moveend', () => state.stations.length && renderList());

// ---------- search & location ----------

$('#search').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('#search-input').value.trim();
  if (!q) return;
  const params = new URLSearchParams({ q, format: 'json', limit: '1', countrycodes: 'ie,gb', viewbox: '-11,55.5,-5.3,51.3', bounded: '1' });
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
    const [hit] = await res.json();
    if (!hit) return setStatus(`No place found for “${q}”.`, true);
    map.setView([+hit.lat, +hit.lon], 13);
  } catch {
    setStatus('Place search is unavailable right now.', true);
  }
});

$('#locate').addEventListener('click', () => {
  if (!navigator.geolocation) return setStatus('Your browser does not support location.', true);
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      const ll = [coords.latitude, coords.longitude];
      if (userMarker) userMarker.setLatLng(ll);
      else userMarker = L.circleMarker(ll, { radius: 8, color: '#fff', weight: 2, fillColor: '#1a73e8', fillOpacity: 1 }).addTo(map);
      map.setView(ll, 13);
    },
    () => setStatus('Could not get your location. Check location permissions.', true),
    { enableHighAccuracy: true, timeout: 10000 },
  );
});

// ---------- settings ----------

function getKey() {
  try {
    return localStorage.getItem(KEY_STORAGE) || window.EVIE_CONFIG?.ocmApiKey || '';
  } catch {
    return window.EVIE_CONFIG?.ocmApiKey || '';
  }
}

$('#settings-btn').addEventListener('click', () => {
  $('#ocm-key').value = getKey();
  $('#settings').showModal();
});

$('#settings').addEventListener('close', () => {
  if ($('#settings').returnValue !== 'save') return;
  try {
    localStorage.setItem(KEY_STORAGE, $('#ocm-key').value.trim());
  } catch {}
  init(true);
});

// ---------- startup ----------

let loadId = 0;

async function init(force = false) {
  const id = ++loadId;
  setStatus('Loading charging stations…');
  const show = ({ stations, errors, fromCache, fetchedAt, pending = [] }) => {
    if (id !== loadId) return; // a newer load (e.g. after changing the key) has started
    state.stations = stations;
    markers.clear();
    const notes = [];
    if (pending.length) notes.push(`Still loading ${pending.join(', ')}…`);
    if (fromCache) notes.push(`Data from ${new Date(fetchedAt).toLocaleTimeString('en-IE')}.`);
    if (errors.length) notes.push(`Some sources were unavailable:\n${errors.join('\n')}`);
    if (!getKey()) notes.push('Tip: add a free Open Charge Map key in ⚙︎ Settings for fuller coverage.');
    state.notice = notes.join('\n');
    populateOperators();
    render();
  };
  try {
    show(await loadStations({ ocmKey: getKey(), force, onUpdate: show }));
  } catch (err) {
    if (id === loadId) setStatus(err.message, true);
  }
}

function setStatus(text, isError = false) {
  const el = $('#status');
  el.textContent = text;
  el.classList.toggle('error', isError);
}

function toPoint(ll) {
  return { lat: ll.lat, lon: ll.lng };
}

function formatDistance(m) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

init();
