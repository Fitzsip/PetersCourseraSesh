import { CONNECTOR_TYPES, speedBand, distanceMetres } from './normalize.js';
import { loadStations } from './sources.js';
import { MAKES, modelsFor, findVehicle } from './vehicles.js';
import {
  CONDITIONS, ROAD_FACTOR, rangeKm, pctForRange, compatibility, arrivalPct,
  chargeMinutes, availability, othersAheadOf, recommend,
} from './planner.js';
import { loadProfile, saveProfile, loadTrip, saveTrip, describeCar, DEFAULT_RESERVE_PCT } from './profile.js';
import { roadDistances } from './routing.js';
import { sharedEnabled, fetchIntents, announce, cancel, myIntents, indexIntents } from './shared.js';

const KEY_STORAGE = 'evie.ocmKey';
const IRELAND_CENTRE = [53.4, -7.9];
const LIST_LIMIT = 50;
const REC_LIMIT = 8;
const ROUTED_CANDIDATES = 15;
const INTENT_POLL_MS = 60 * 1000;

const $ = (sel) => document.querySelector(sel);

const state = {
  stations: [],
  byId: new Map(),
  connectors: new Set(),
  minKw: 0,
  operator: '',
  hideOffline: true,
  onlyCompatible: true,
  profile: loadProfile(),
  trip: loadTrip(),
  userPos: null,
  routes: new Map(),
  routesKey: '',
  intentsFor: () => [],
  notice: '',
};

// ---------- map ----------

const map = L.map('map', { zoomControl: true }).setView(IRELAND_CENTRE, 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · ' +
    'Charger data: <a href="https://openchargemap.org">Open Charge Map</a> (CC BY 4.0), OpenStreetMap (ODbL) · ' +
    'Routing: <a href="https://project-osrm.org">OSRM</a>',
}).addTo(map);

const cluster = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 50 });
map.addLayer(cluster);
const markers = new Map(); // station id -> marker
const rangeCircle = L.circle(IRELAND_CENTRE, {
  radius: 1, color: '#0b7a4b', weight: 2, dashArray: '6 6', fill: true, fillOpacity: 0.04, interactive: false,
});
let userMarker = null;

const legend = L.control({ position: 'topright' });
legend.onAdd = () => {
  const div = L.DomUtil.create('div', 'legend');
  div.setAttribute('aria-hidden', 'true');
  div.innerHTML = [['standard', '≤22 kW'], ['fast', '23–42'], ['rapid', '43–99'], ['ultra', '100+'], ['unknown', '?']]
    .map(([cls, label]) => `<span><i class="dot ${cls}"></i>${label}</span>`)
    .join('');
  return div;
};
legend.addTo(map);

function origin() {
  if (state.userPos) return state.userPos;
  const c = map.getCenter();
  return { lat: c.lat, lon: c.lng };
}

// ---------- filters ----------

const connectorBox = $('#connector-filters');
for (const type of CONNECTOR_TYPES) {
  const label = document.createElement('label');
  label.innerHTML = `<input type="checkbox" value="${type}" /> ${type}`;
  connectorBox.append(label);
}
connectorBox.addEventListener('change', (e) => {
  const { value, checked } = e.target;
  checked ? state.connectors.add(value) : state.connectors.delete(value);
  refresh();
});
$('#min-kw').addEventListener('change', (e) => { state.minKw = Number(e.target.value); refresh(); });
$('#operator').addEventListener('change', (e) => { state.operator = e.target.value; refresh(); });
$('#hide-offline').addEventListener('change', (e) => { state.hideOffline = e.target.checked; refresh(); });
$('#only-compatible').addEventListener('change', (e) => { state.onlyCompatible = e.target.checked; refresh(); });

function matches(s) {
  if (state.hideOffline && s.status === 'offline') return false;
  if (state.operator && s.operator !== state.operator) return false;
  if (state.minKw && !(s.maxKw >= state.minKw)) return false;
  if (state.connectors.size && !s.connectors.some((c) => state.connectors.has(c.type))) return false;
  if (state.profile && state.onlyCompatible && compatibility(s, state.profile).ok === false) return false;
  return true;
}

function populateOperators() {
  const counts = new Map();
  for (const s of state.stations) if (s.operator) counts.set(s.operator, (counts.get(s.operator) || 0) + 1);
  const sel = $('#operator');
  const current = sel.value;
  sel.length = 1;
  [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .forEach(([name, n]) => sel.add(new Option(`${name} (${n})`, name)));
  sel.value = current;
}

// ---------- tabs & bottom sheet ----------

let activeTab = 'foryou';
document.querySelectorAll('[role=tab]').forEach((btn) =>
  btn.addEventListener('click', () => {
    activeTab = btn.dataset.tab;
    document.querySelectorAll('[role=tab]').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
    document.querySelectorAll('.tab').forEach((t) => (t.hidden = t.id !== `tab-${activeTab}`));
    if ($('#panel').classList.contains('collapsed')) toggleSheet();
    if (activeTab === 'nearby') renderList();
  }),
);

function toggleSheet() {
  $('#panel').classList.toggle('collapsed');
  setTimeout(() => map.invalidateSize(), 250);
}
$('#sheet-handle').addEventListener('click', toggleSheet);
$('#sheet-handle').addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && toggleSheet());

// ---------- rendering ----------

function currentRange() {
  return state.profile ? rangeKm(state.profile, state.trip.batteryPct, state.trip.conditions) : null;
}

function icon(s, far) {
  const cls = `${speedBand(s.maxKw)}${s.status === 'offline' ? ' offline' : ''}${far ? ' far' : ''}`;
  return L.divIcon({
    className: 'station-icon',
    html: `<i class="dot ${cls}"></i>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -10],
  });
}

function renderMarkers() {
  const range = currentRange();
  const o = origin();
  const visible = state.stations.filter(matches);
  markers.clear();
  cluster.clearLayers();
  cluster.addLayers(
    visible.map((s) => {
      const far = range != null && (distanceMetres(o, s) / 1000) * ROAD_FACTOR > range;
      const m = L.marker([s.lat, s.lon], { icon: icon(s, far), title: s.name });
      m.bindPopup(() => popupHtml(s), {
        maxWidth: 300,
        maxHeight: Math.max(200, map.getSize().y - 60),
        autoPanPaddingTopLeft: [56, 56],
        autoPanPaddingBottomRight: [12, 12],
      });
      markers.set(s.id, m);
      return m;
    }),
  );
  return visible;
}

function renderRangeCircle() {
  const range = currentRange();
  if (range == null) return rangeCircle.remove();
  rangeCircle.setLatLng([origin().lat, origin().lon]).setRadius((range / ROAD_FACTOR) * 1000);
  if (!map.hasLayer(rangeCircle)) rangeCircle.addTo(map);
}

// Full redraw: filters, data, car or battery changed.
function refresh() {
  if (!state.stations.length) return;
  renderMarkers();
  renderRangeCircle();
  renderForYou();
  renderList();
  refineRoutes();
}

let refreshTimer;
function refreshSoon() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refresh, 200);
}

function planContext() {
  return {
    origin: origin(),
    profile: state.profile,
    batteryPct: state.trip.batteryPct,
    conditions: state.trip.conditions,
    routes: state.userPos ? state.routes : new Map(),
    intentsFor: state.intentsFor,
    mine: new Set(myIntents().map((m) => m.id)),
  };
}

function renderForYou() {
  const box = $('#foryou');
  if (!state.profile) {
    box.innerHTML = `
      <div class="card empty">
        <h3>Find the best charger for your car</h3>
        <p>Tell us your car and battery level, and we'll rank chargers you can reach by how soon you'd be charged.</p>
        <button type="button" class="primary" data-action="add-car">Add my car</button>
      </div>`;
    return;
  }
  const recs = recommend(state.stations.filter(matches), planContext()).slice(0, REC_LIMIT);
  const from = state.userPos
    ? 'From your location.'
    : 'From the map centre. <button type="button" class="link" data-action="locate">Use my location</button>';
  if (!recs.length) {
    box.innerHTML = `<p class="from">${from}</p>
      <div class="card empty"><h3>No reachable chargers found</h3>
      <p>Nothing your car can use is within your estimated range with ${state.profile.reservePct}% kept in reserve.
      Check your battery level, try a different area, or turn off “Only chargers my car can use” in Filters.</p></div>`;
    return;
  }
  box.innerHTML = `<p class="from">${from}</p><ol class="recs">${recs.map(recHtml).join('')}</ol>`;
}

function recHtml(r) {
  const s = r.station;
  const est = r.routed ? '' : '≈';
  const charge = r.chargeMin == null
    ? 'Charging speed unknown'
    : r.chargeMin === 0
      ? 'No need to charge yet'
      : `~${formatMin(r.chargeMin)} to ${r.compat.dc ? '80%' : 'full'} at ${formatKw(r.compat.kw)}`;
  return `
    <li class="rec">
      <div class="rec-head">
        <i class="dot ${speedBand(s.maxKw)}"></i>
        <strong class="rec-name">${esc(s.name)}</strong>
        <span class="avail ${r.avail.level}">${r.avail.label}</span>
      </div>
      <div class="rec-op">${esc(s.operator || 'Unknown network')}${s.points ? ` · ${s.points} plug${s.points > 1 ? 's' : ''}` : ''}</div>
      <div class="rec-stats">
        <span>🚗 ${est}${formatMin(r.driveMin)} · ${est}${Math.round(r.km)} km</span>
        <span>🔋 arrive ~${Math.max(0, Math.round(r.arrivePct))}%</span>
        <span>⚡ ${charge}</span>
      </div>
      ${headingHtml(s, r)}
      <div class="rec-actions">
        <button type="button" data-action="show" data-id="${esc(s.id)}">Show on map</button>
        <a class="btn" href="${directionsUrl(s)}" target="_blank" rel="noopener">Directions</a>
        ${headingButton(s, r.arriveAt)}
      </div>
    </li>`;
}

function headingHtml(s, r) {
  if (!sharedEnabled) return '';
  const others = state.intentsFor(s).filter((i) => !isMine(i)).length;
  if (!others) return '';
  const ahead = r ? ` · ${r.ahead} arriving before you` : '';
  return `<div class="rec-heading">👥 ${others} other driver${others > 1 ? 's' : ''} heading here${ahead}</div>`;
}

function headingButton(s, arriveAt) {
  if (!sharedEnabled) return '';
  const mine = myIntentAt(s);
  if (mine) return `<button type="button" class="active" data-action="cancel-heading" data-intent="${esc(mine.id)}">✓ Heading here · cancel</button>`;
  return `<button type="button" class="primary" data-action="heading" data-id="${esc(s.id)}" data-eta="${arriveAt.toISOString()}">I'm heading here</button>`;
}

function isMine(intent) {
  return myIntents().some((m) => m.id === intent.id);
}

function myIntentAt(s) {
  const ids = new Set(state.intentsFor(s).map((i) => i.id));
  return myIntents().find((m) => ids.has(m.id) || m.stationId === s.id) || null;
}

// Nearest chargers to the driver (or the map centre), whatever is on screen.
function renderList() {
  if (activeTab !== 'nearby' || !state.stations.length) return updateStatus();
  const o = origin();
  const nearest = state.stations
    .filter(matches)
    .map((s) => ({ s, d: distanceMetres(o, s) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, LIST_LIMIT);
  const now = new Date();
  $('#list').replaceChildren(
    ...nearest.map(({ s, d }) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.action = 'show';
      btn.dataset.id = s.id;
      const avail = availability(s, new Date(now.getTime() + (d / 1000 / 50) * 3600000));
      btn.innerHTML = `
        <i class="dot ${speedBand(s.maxKw)}${s.status === 'offline' ? ' offline' : ''}"></i>
        <span class="name">${esc(s.name)}</span>
        <span class="dist">${formatDistance(d)}</span>
        <span class="meta">${esc(s.operator || 'Unknown network')} · ${s.maxKw ? `${formatKw(s.maxKw)}` : 'power unknown'} · ${esc(connectorSummary(s) || 'connectors unknown')}
          <span class="avail ${avail.level}">${avail.label}</span></span>`;
      li.append(btn);
      return li;
    }),
  );
  updateStatus();
}

function updateStatus() {
  if (!state.stations.length) return;
  const visible = state.stations.filter(matches).length;
  const text = `${visible.toLocaleString()} of ${state.stations.length.toLocaleString()} chargers shown.`;
  setStatus(`${text}${state.notice ? `\n${state.notice}` : ''}`);
}

function focusStation(s) {
  const m = markers.get(s.id);
  if (!m) return;
  if (window.matchMedia('(max-width: 720px)').matches) $('#panel').classList.add('collapsed');
  setTimeout(() => {
    map.invalidateSize();
    cluster.zoomToShowLayer(m, () => m.openPopup());
  }, 260);
}

function popupHtml(s) {
  const statusLabel = { operational: 'Operational', offline: 'Out of service', unknown: 'Status not reported' }[s.status];
  const rows = groupConnectors(s.connectors)
    .map((c) => `<tr><td>${esc(c.type)}</td><td>${c.kw ? `${c.kw} kW` : '–'}</td><td>×${c.qty}</td></tr>`)
    .join('');
  const links = s.links
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
      ${carSection(s)}
      ${s.updated ? `<p class="small">Status updated ${new Date(s.updated).toLocaleDateString('en-IE')}</p>` : ''}
      <div class="popup-actions">
        <a class="btn" href="${directionsUrl(s)}" target="_blank" rel="noopener">Directions</a>
        ${headingButton(s, etaFor(s).at)}
      </div>
      <div class="links">${links}</div>
    </div>`;
}

// Road distance (routed if known, else estimated) and arrival time.
function etaFor(s) {
  const r = state.userPos ? state.routes.get(s.id) : null;
  const km = r ? r.km : (distanceMetres(origin(), s) / 1000) * ROAD_FACTOR;
  const min = r ? r.min : km; // ~60 km/h average
  return { km, min, at: new Date(Date.now() + min * 60000) };
}

function carSection(s) {
  const eta = etaFor(s);
  const ahead = othersAheadOf(state.intentsFor(s), eta.at, new Set(myIntents().map((m) => m.id)));
  const avail = availability(s, eta.at, ahead);
  const time = eta.at.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' });
  const availRow = `<p><span class="avail ${avail.level}">${avail.label}</span> <span class="small">estimate for ${time}</span></p>${headingHtml(s, { ahead })}`;
  const p = state.profile;
  if (!p) return availRow;
  const compat = compatibility(s, p);
  if (compat.ok === false) return `${availRow}<p class="warn">Your ${esc(describeCar(p))} can't use the plugs here.</p>`;
  const arrive = arrivalPct(p, state.trip.batteryPct, eta.km, state.trip.conditions);
  const reachable = arrive >= p.reservePct;
  const charge = compat.kw ? chargeMinutes(p, arrive, compat.kw, compat.dc) : null;
  return `${availRow}
    <p class="${reachable ? '' : 'warn'}">🔋 ${reachable ? `Arrive with ~${Math.round(arrive)}%` : 'Probably out of range with your reserve'}
      <span class="small">(≈${Math.round(eta.km)} km)</span></p>
    ${charge ? `<p>⚡ ~${formatMin(charge)} to ${compat.dc ? '80%' : 'full'} at up to ${formatKw(compat.kw)}</p>` : ''}
    ${compat.ok === null ? '<p class="small">Connectors not reported, so it may not suit your car.</p>' : ''}`;
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

map.on('moveend', () => {
  if (!state.stations.length) return;
  if (!state.userPos) renderList();
  // Without GPS, plans start from the map centre, so follow the map.
  if (!state.userPos && state.profile) {
    renderRangeCircle();
    renderForYou();
  }
});

// ---------- road distances ----------

// Replace straight-line guesses with real road distances for the leading
// candidates. Only from a real GPS position, to keep requests to a minimum.
async function refineRoutes() {
  if (!state.userPos || !state.profile) return;
  const ctx = { ...planContext(), routes: new Map() };
  const candidates = recommend(state.stations.filter(matches), ctx).slice(0, ROUTED_CANDIDATES).map((r) => r.station);
  const o = state.userPos;
  const key = `${o.lat.toFixed(3)},${o.lon.toFixed(3)}|${candidates.map((s) => s.id).join(',')}`;
  if (!candidates.length || key === state.routesKey) return;
  state.routesKey = key;
  try {
    const routes = await roadDistances(o, candidates);
    if (key !== state.routesKey) return;
    state.routes = routes;
    renderForYou();
  } catch {
    // Keep the straight-line estimates.
  }
}

// ---------- trip bar ----------

const conditionsSel = $('#conditions');
for (const [k, v] of Object.entries(CONDITIONS)) conditionsSel.add(new Option(v.label, k));

function renderTripBar() {
  const p = state.profile;
  $('#trip-empty').hidden = Boolean(p);
  $('#trip-controls').hidden = !p;
  $('#car-label').textContent = p ? describeCar(p) : 'Add car';
  if (!p) return;
  $('#battery').value = state.trip.batteryPct;
  $('#battery-out').value = `${Math.round(state.trip.batteryPct)}%`;
  conditionsSel.value = state.trip.conditions;
  $('#range-out').textContent = `≈ ${Math.round(currentRange())} km usable`;
}

$('#battery').addEventListener('input', (e) => {
  state.trip.batteryPct = Number(e.target.value);
  $('#km-left').value = '';
  saveTrip(state.trip);
  renderTripBar();
  refreshSoon();
});

$('#km-left').addEventListener('change', (e) => {
  const km = Number(e.target.value);
  if (!state.profile || !e.target.value || !(km >= 0)) return;
  // Dashboard figures already allow for driving style, so use mixed conditions.
  state.trip.batteryPct = Math.max(1, Math.round(pctForRange(state.profile, km, 'mixed')));
  saveTrip(state.trip);
  renderTripBar();
  refresh();
});

conditionsSel.addEventListener('change', (e) => {
  state.trip.conditions = e.target.value;
  saveTrip(state.trip);
  renderTripBar();
  refresh();
});

// ---------- car profile dialog ----------

const makeSel = $('#car-make');
const modelSel = $('#car-model');
makeSel.add(new Option('Choose make…', ''));
MAKES.forEach((m) => makeSel.add(new Option(m, m)));
makeSel.add(new Option('Other', 'Other'));

const carFields = {
  usableKwh: $('#car-kwh'),
  consumption: $('#car-use'),
  maxDcKw: $('#car-dc'),
  maxAcKw: $('#car-ac'),
  dcPlug: $('#car-plug'),
  reservePct: $('#car-reserve'),
};

function fillModels() {
  const year = Number($('#car-year').value) || null;
  const current = modelSel.value;
  modelSel.length = 0;
  const models = makeSel.value && makeSel.value !== 'Other' ? modelsFor(makeSel.value, year) : [];
  models.forEach((v) => modelSel.add(new Option(v.model, v.model)));
  modelSel.add(new Option('Other / not listed', ''));
  if (current && [...modelSel.options].some((o) => o.value === current)) modelSel.value = current;
}

function fillSpecs() {
  const v = findVehicle(makeSel.value, modelSel.value);
  if (!v) {
    if (makeSel.value) $('#car-details').open = true;
    return;
  }
  carFields.usableKwh.value = v.kwh;
  carFields.consumption.value = v.use;
  carFields.maxDcKw.value = v.dc;
  carFields.maxAcKw.value = v.ac;
  carFields.dcPlug.value = v.plug || '';
}

makeSel.addEventListener('change', () => { fillModels(); fillSpecs(); });
$('#car-year').addEventListener('change', () => { fillModels(); fillSpecs(); });
modelSel.addEventListener('change', fillSpecs);

function openCarDialog() {
  const p = state.profile || {
    usableKwh: 58, consumption: 17, maxDcKw: 100, maxAcKw: 11, dcPlug: 'CCS', reservePct: DEFAULT_RESERVE_PCT,
  };
  makeSel.value = p.make && MAKES.includes(p.make) ? p.make : p.make ? 'Other' : '';
  $('#car-year').value = p.year || '';
  fillModels();
  modelSel.value = p.model && [...modelSel.options].some((o) => o.value === p.model) ? p.model : '';
  for (const [k, el] of Object.entries(carFields)) el.value = p[k] ?? '';
  $('#car-details').open = false;
  $('#car-dialog').showModal();
}

$('#car-btn').addEventListener('click', openCarDialog);
$('#trip-add-car').addEventListener('click', openCarDialog);

$('#car-dialog').addEventListener('close', () => {
  if ($('#car-dialog').returnValue !== 'save') return;
  const num = (el) => Number(el.value);
  state.profile = {
    make: makeSel.value && makeSel.value !== 'Other' ? makeSel.value : '',
    model: modelSel.value,
    year: Number($('#car-year').value) || null,
    usableKwh: num(carFields.usableKwh),
    consumption: num(carFields.consumption),
    maxDcKw: num(carFields.maxDcKw),
    maxAcKw: num(carFields.maxAcKw),
    dcPlug: carFields.dcPlug.value || null,
    reservePct: num(carFields.reservePct),
  };
  saveProfile(state.profile);
  state.routesKey = '';
  renderTripBar();
  refresh();
});

// ---------- buttons inside cards and popups ----------

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const s = el.dataset.id ? state.byId.get(el.dataset.id) : null;
  switch (el.dataset.action) {
    case 'show':
      if (s) focusStation(s);
      break;
    case 'add-car':
      openCarDialog();
      break;
    case 'locate':
      startLocation(true);
      break;
    case 'heading':
      if (!s) break;
      el.disabled = true;
      try {
        await announce(s, new Date(el.dataset.eta));
        await loadIntents();
      } catch {
        setStatus("Couldn't share that you're heading there. Try again in a moment.", true);
      }
      afterIntentChange();
      break;
    case 'cancel-heading':
      el.disabled = true;
      try {
        await cancel(el.dataset.intent);
        await loadIntents();
      } catch {
        setStatus("Couldn't cancel. Try again in a moment.", true);
      }
      afterIntentChange();
      break;
  }
});

function afterIntentChange() {
  renderForYou();
  map.closePopup();
}

// ---------- shared "heading here" data ----------

async function loadIntents() {
  if (!sharedEnabled) return;
  try {
    state.intentsFor = indexIntents(await fetchIntents());
  } catch {
    // Shared data is a bonus; carry on without it.
  }
}

if (sharedEnabled) {
  setInterval(async () => {
    if (document.hidden) return;
    await loadIntents();
    renderForYou();
  }, INTENT_POLL_MS);
}

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
    map.setView([+hit.lat, +hit.lon], 12);
  } catch {
    setStatus('Place search is unavailable right now.', true);
  }
});

let watchId = null;
let lastPlannedPos = null;

function startLocation(recentre) {
  if (!navigator.geolocation) return setStatus('Your browser does not support location.', true);
  if (watchId != null) {
    if (recentre && state.userPos) map.setView([state.userPos.lat, state.userPos.lon], 12);
    return;
  }
  let first = true;
  watchId = navigator.geolocation.watchPosition(
    ({ coords }) => {
      state.userPos = { lat: coords.latitude, lon: coords.longitude };
      const ll = [coords.latitude, coords.longitude];
      if (userMarker) userMarker.setLatLng(ll);
      else userMarker = L.circleMarker(ll, { radius: 8, color: '#fff', weight: 3, fillColor: '#1a73e8', fillOpacity: 1 }).addTo(map);
      if (first && (recentre || map.getZoom() < 9)) map.setView(ll, 12);
      first = false;
      // Re-plan when the driver has moved a meaningful distance.
      if (!lastPlannedPos || distanceMetres(lastPlannedPos, state.userPos) > 500) {
        lastPlannedPos = state.userPos;
        refresh();
      }
    },
    (err) => {
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      watchId = null;
      if (recentre || err.code !== err.PERMISSION_DENIED)
        setStatus('Could not get your location. Check location permissions for this site.', true);
    },
    { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 },
  );
}

$('#locate').addEventListener('click', () => startLocation(true));

// Start following the driver straight away if they've allowed it before.
navigator.permissions?.query({ name: 'geolocation' }).then(
  (p) => p.state === 'granted' && startLocation(false),
  () => {},
);

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
    state.byId = new Map(stations.map((s) => [s.id, s]));
    state.routesKey = '';
    const notes = [];
    if (pending.length) notes.push(`Still loading ${pending.join(', ')}…`);
    if (fromCache) notes.push(`Charger data from ${new Date(fetchedAt).toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' })}.`);
    if (errors.length) notes.push(`Some sources were unavailable: ${errors.join('; ')}`);
    if (!getKey()) notes.push('Tip: add a free Open Charge Map key in ⚙︎ Settings for fuller coverage.');
    state.notice = notes.join('\n');
    populateOperators();
    refresh();
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

function directionsUrl(s) {
  return `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}`;
}

function formatMin(min) {
  const m = Math.max(1, Math.round(min));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ''}`.trim();
}

function formatKw(kw) {
  return `${kw < 10 ? Math.round(kw * 10) / 10 : Math.round(kw)} kW`;
}

function formatDistance(m) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

renderTripBar();
loadIntents().then(() => init());
