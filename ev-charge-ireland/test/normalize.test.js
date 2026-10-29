import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  connectorFamily,
  parseKw,
  fromOpenChargeMap,
  fromOverpass,
  mergeStations,
  cleanOperator,
  speedBand,
} from '../js/normalize.js';

const ocmPoi = {
  ID: 12345,
  AddressInfo: { Title: 'Athlone Town Centre', AddressLine1: 'Church St', Town: 'Athlone', Latitude: 53.4239, Longitude: -7.9407 },
  OperatorInfo: { Title: 'ESB ecars' },
  StatusType: { Title: 'Operational', IsOperational: true },
  UsageCost: '€0.57/kWh',
  Connections: [
    { ConnectionType: { Title: 'CCS (Type 2)' }, PowerKW: 50, Quantity: 1 },
    { ConnectionType: { Title: 'CHAdeMO' }, PowerKW: 50, Quantity: 1 },
    { ConnectionType: { Title: 'Type 2 (Socket Only)' }, PowerKW: 22, Quantity: 2 },
  ],
};

const osmNode = {
  type: 'node',
  id: 987,
  lat: 53.42392,
  lon: -7.94075,
  tags: {
    amenity: 'charging_station',
    operator: 'ESB',
    'socket:type2_combo': '1',
    'socket:type2_combo:output': '50 kW',
    capacity: '3',
    'addr:city': 'Athlone',
  },
};

test('connectorFamily maps provider titles to families', () => {
  assert.equal(connectorFamily('CCS (Type 2)'), 'CCS');
  assert.equal(connectorFamily('Type 2 (Tethered Connector)'), 'Type 2');
  assert.equal(connectorFamily('CHAdeMO'), 'CHAdeMO');
  assert.equal(connectorFamily('Tesla Supercharger'), 'Tesla');
  assert.equal(connectorFamily('Three Pin Square (BS1363)'), 'Other');
});

test('parseKw handles kW, W and bare numbers', () => {
  assert.equal(parseKw('50 kW'), 50);
  assert.equal(parseKw('22kW'), 22);
  assert.equal(parseKw('7400 W'), 7.4);
  assert.equal(parseKw('150'), 150);
  assert.equal(parseKw(undefined), null);
});

test('cleanOperator normalises network names', () => {
  assert.equal(cleanOperator('ESB Networks (ecars)'), 'ESB ecars');
  assert.equal(cleanOperator('(Unknown Operator)'), null);
  assert.equal(cleanOperator('IONITY GmbH'), 'IONITY');
});

test('speedBand thresholds', () => {
  assert.equal(speedBand(7), 'standard');
  assert.equal(speedBand(22), 'standard');
  assert.equal(speedBand(25), 'fast');
  assert.equal(speedBand(50), 'rapid');
  assert.equal(speedBand(150), 'ultra');
  assert.equal(speedBand(null), 'unknown');
});

test('fromOpenChargeMap builds a station', () => {
  const s = fromOpenChargeMap(ocmPoi);
  assert.equal(s.id, 'ocm-12345');
  assert.equal(s.operator, 'ESB ecars');
  assert.equal(s.status, 'operational');
  assert.equal(s.maxKw, 50);
  assert.equal(s.points, 4);
  assert.match(s.address, /Athlone/);
});

test('fromOverpass builds a station from tags', () => {
  const s = fromOverpass(osmNode);
  assert.equal(s.id, 'osm-node-987');
  assert.equal(s.operator, 'ESB ecars');
  assert.deepEqual(s.connectors, [{ type: 'CCS', kw: 50, qty: 1 }]);
  assert.equal(s.points, 3);
  assert.equal(s.status, 'unknown');
});

test('fromOverpass uses way centre', () => {
  const s = fromOverpass({ type: 'way', id: 1, center: { lat: 52, lon: -8 }, tags: {} });
  assert.equal(s.lat, 52);
  assert.equal(s.lon, -8);
  assert.equal(s.name, 'Charging station');
});

test('mergeStations merges the same site from two sources', () => {
  const merged = mergeStations([[fromOpenChargeMap(ocmPoi)], [fromOverpass(osmNode)]]);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].sources, ['ocm', 'osm']);
  assert.equal(merged[0].links.length, 2);
  assert.equal(merged[0].connectors.length, 3, 'keeps the richer OCM connector list');
});

test('mergeStations keeps nearby sites from different operators apart', () => {
  const tesla = fromOverpass({ ...osmNode, id: 2, tags: { ...osmNode.tags, operator: 'Tesla' } });
  const merged = mergeStations([[fromOpenChargeMap(ocmPoi)], [tesla]]);
  assert.equal(merged.length, 2);
});

test('mergeStations keeps distant sites apart and never merges within one source', () => {
  const far = fromOverpass({ ...osmNode, id: 3, lat: 53.5 });
  const twin = fromOverpass({ ...osmNode, id: 4 });
  const merged = mergeStations([[], [fromOverpass(osmNode), far, twin]]);
  assert.equal(merged.length, 3);
});

test('mergeStations skips records without coordinates', () => {
  const bad = fromOverpass({ type: 'node', id: 5, tags: {} });
  assert.equal(mergeStations([[bad]]).length, 0);
});
