import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rangeKm, pctForRange, arrivalPct, compatibility, chargeMinutes,
  availability, othersAheadOf, recommend, plugBusyChance,
} from '../js/planner.js';
import { VEHICLES, modelsFor, findVehicle } from '../js/vehicles.js';
import { indexIntents } from '../js/shared.js';

const car = { make: 'Volkswagen', usableKwh: 58, consumption: 16, maxDcKw: 120, maxAcKw: 11, dcPlug: 'CCS', reservePct: 10 };
const leaf = { make: 'Nissan', usableKwh: 37, consumption: 16, maxDcKw: 46, maxAcKw: 6.6, dcPlug: 'CHAdeMO', reservePct: 10 };

const station = (over = {}) => ({
  id: 'x', lat: 53.35, lon: -6.26, status: 'operational', points: 2, maxKw: 50,
  connectors: [{ type: 'CCS', kw: 50, qty: 1 }, { type: 'CHAdeMO', kw: 50, qty: 1 }, { type: 'Type 2', kw: 22, qty: 1 }],
  ...over,
});

test('rangeKm keeps the reserve and applies conditions', () => {
  // 50% - 10% reserve = 40% of 58 kWh = 23.2 kWh at 0.16 kWh/km = 145 km
  assert.equal(Math.round(rangeKm(car, 50, 'mixed')), 145);
  assert.ok(rangeKm(car, 50, 'motorwayCold') < rangeKm(car, 50, 'motorway'));
  assert.equal(rangeKm(car, 5, 'mixed'), 0);
});

test('pctForRange inverts rangeKm', () => {
  assert.equal(Math.round(pctForRange(car, rangeKm(car, 63, 'mixed'), 'mixed')), 63);
});

test('arrivalPct subtracts energy used', () => {
  // 58 km * 0.16 = 9.28 kWh = 16% of 58 kWh
  assert.equal(Math.round(arrivalPct(car, 50, 58, 'mixed')), 34);
});

test('compatibility picks the fastest usable plug, capped by the car', () => {
  assert.deepEqual(compatibility(station(), car), { ok: true, kw: 50, dc: true });
  assert.deepEqual(compatibility(station(), leaf), { ok: true, kw: 46, dc: true });
  const acOnly = station({ connectors: [{ type: 'Type 2', kw: 22, qty: 2 }] });
  assert.deepEqual(compatibility(acOnly, car), { ok: true, kw: 11, dc: false });
  const tesla = station({ connectors: [{ type: 'Tesla', kw: 250, qty: 8 }] });
  assert.equal(compatibility(tesla, car).ok, false);
  assert.equal(compatibility(tesla, { ...car, make: 'Tesla' }).ok, true);
  assert.equal(compatibility(station({ connectors: [] }), car).ok, null);
  const ccsOnly = station({ connectors: [{ type: 'CCS', kw: 150, qty: 2 }] });
  assert.equal(compatibility(ccsOnly, leaf).ok, false);
});

test('chargeMinutes to 80% on DC and to full on AC', () => {
  // 20% -> 80% of 58 kWh = 34.8 kWh at 50 * 0.75 kW = 55.7 min
  assert.equal(chargeMinutes(car, 20, 50, true), 56);
  assert.equal(chargeMinutes(car, 85, 50, true), 0);
  assert.ok(chargeMinutes(car, 20, 11, false) > 240);
});

test('availability: more plugs and quieter hours are more likely free', () => {
  const night = new Date('2026-10-28T03:00:00');
  const evening = new Date('2026-10-28T18:00:00');
  assert.ok(availability(station(), night).pFree > availability(station(), evening).pFree);
  assert.ok(availability(station({ points: 6 }), evening).pFree > availability(station({ points: 1 }), evening).pFree);
  assert.equal(availability(station({ status: 'offline' }), night).pFree, 0);
  assert.equal(availability(station({ points: 2 }), night, 2).pFree, 0.1);
  assert.ok(plugBusyChance(evening, true) > plugBusyChance(evening, false));
});

test('othersAheadOf counts drivers arriving before you who are still charging', () => {
  const me = new Date('2026-10-28T12:00:00Z');
  const intents = [
    { id: 'a', eta: '2026-10-28T11:50:00Z' }, // ahead, still charging
    { id: 'b', eta: '2026-10-28T11:00:00Z' }, // long gone
    { id: 'c', eta: '2026-10-28T12:10:00Z' }, // after me
    { id: 'd', eta: '2026-10-28T11:55:00Z' }, // mine
  ];
  assert.equal(othersAheadOf(intents, me, new Set(['d'])), 1);
});

test('recommend filters unreachable and incompatible stations and ranks the rest', () => {
  const origin = { lat: 53.35, lon: -6.26 };
  const near = station({ id: 'near', lat: 53.36 });
  const nearSlow = station({ id: 'slow', lat: 53.355, maxKw: 22, connectors: [{ type: 'Type 2', kw: 22, qty: 2 }] });
  const far = station({ id: 'far', lat: 51.9, lon: -8.47 }); // Cork, ~220 km
  const teslaOnly = station({ id: 'tesla', lat: 53.351, connectors: [{ type: 'Tesla', kw: 250, qty: 4 }] });
  const recs = recommend([far, nearSlow, near, teslaOnly], {
    origin, profile: car, batteryPct: 40, conditions: 'mixed', now: new Date('2026-10-28T03:00:00'),
  });
  assert.deepEqual(recs.map((r) => r.station.id), ['near', 'slow']);
});

test('recommend uses routed distances when given', () => {
  const origin = { lat: 53.35, lon: -6.26 };
  const s = station({ id: 's', lat: 53.4 });
  const [r] = recommend([s], {
    origin, profile: car, batteryPct: 80, conditions: 'mixed', routes: new Map([['s', { km: 9, min: 14 }]]),
  });
  assert.equal(r.routed, true);
  assert.equal(r.km, 9);
  assert.equal(r.driveMin, 14);
});

test('other drivers heading there lower the estimate', () => {
  const origin = { lat: 53.35, lon: -6.26 };
  const s = station({ id: 's', lat: 53.36, points: 1 });
  const now = new Date('2026-10-28T12:00:00Z');
  const ctx = { origin, profile: car, batteryPct: 60, conditions: 'mixed', now };
  const alone = recommend([s], ctx)[0];
  const busy = recommend([s], { ...ctx, intentsFor: () => [{ id: 'z', eta: now.toISOString() }] })[0];
  assert.equal(busy.ahead, 1);
  assert.ok(busy.avail.pFree < alone.avail.pFree);
});

test('indexIntents matches intents to stations by position', () => {
  const lookup = indexIntents([
    { id: '1', station_id: 'ocm-5', lat: 53.3500, lon: -6.2600, eta: '' },
    { id: '2', station_id: 'osm-node-9', lat: 53.35015, lon: -6.26010, eta: '' }, // ~20 m away, other source
    { id: '3', station_id: 'ocm-7', lat: 53.36, lon: -6.26, eta: '' },
  ]);
  assert.deepEqual(lookup({ id: 'ocm-5', lat: 53.35, lon: -6.26 }).map((i) => i.id).sort(), ['1', '2']);
});

test('vehicle data is complete and searchable', () => {
  for (const v of VEHICLES) {
    assert.ok(v.kwh > 10 && v.use > 8 && v.ac > 0, `${v.make} ${v.model}`);
    assert.ok(v.dc === 0 ? v.plug === null : ['CCS', 'CHAdeMO'].includes(v.plug), `${v.make} ${v.model}`);
  }
  assert.ok(modelsFor('Nissan', 2017).some((v) => v.model.includes('30 kWh')));
  assert.ok(!modelsFor('Nissan', 2017).some((v) => v.model.includes('62 kWh')));
  assert.equal(findVehicle('Tesla', 'Model Y Long Range').dc, 250);
});
