/* Simulated traffic so the app can be tried without waiting for a real plane. */
var Demo = (function () {
  'use strict';

  // offsetKm: how far the straight flight path passes from home.
  // periodSec: how often the flight repeats.
  var FLIGHTS = [
    { hex: 'd0e001', callsign: 'BAW283', reg: 'G-XWBA', type: 'A35K', altFt: 6500, gsKt: 240,
      track: 250, offsetKm: 0.4, periodSec: 120, phase: 0.25,
      route: { origin: { code: 'LHR', city: 'London' }, dest: { code: 'LAX', city: 'Los Angeles' }, plausible: true } },
    { hex: 'd0e002', callsign: 'UAL917', reg: 'N27965', type: 'B789', altFt: 11000, gsKt: 300,
      track: 75, offsetKm: -1.2, periodSec: 180, phase: 0.7,
      route: { origin: { code: 'SFO', city: 'San Francisco' }, dest: { code: 'JFK', city: 'New York' }, plausible: true } },
    { hex: 'd0e003', callsign: 'EZY45QK', reg: 'G-UZHA', type: 'A20N', altFt: 18000, gsKt: 380,
      track: 140, offsetKm: 12, periodSec: 300, phase: 0.1,
      route: { origin: { code: 'EDI', city: 'Edinburgh' }, dest: { code: 'AMS', city: 'Amsterdam' }, plausible: true } },
    { hex: 'd0e004', callsign: 'FDX5241', reg: 'N851FD', type: 'B77L', altFt: 33000, gsKt: 470,
      track: 15, offsetKm: -18, periodSec: 240, phase: 0.5,
      route: { origin: { code: 'MEM', city: 'Memphis' }, dest: { code: 'CDG', city: 'Paris' }, plausible: true } },
    { hex: 'd0e006', callsign: 'VJT612', reg: '9H-VCE', type: 'CL35', altFt: 3000, gsKt: 160,
      track: 160, offsetKm: -0.8, periodSec: 150, phase: 0.75, route: null,
      history: { origin: { code: 'FAB', city: 'Farnborough', country: 'United Kingdom' }, airborneMin: 52,
                 countries: ['Switzerland', 'France', 'United Kingdom'], flightsToday: 3 } },
    { hex: 'd0e005', callsign: 'N172SP', reg: 'N172SP', type: 'C172', altFt: 2500, gsKt: 95,
      track: 300, offsetKm: 6, periodSec: 600, phase: 0.4, route: null }
  ];

  function aircraft(cfg) {
    var lat = cfg.homeLat === null ? 51.4775 : cfg.homeLat;
    var lon = cfg.homeLon === null ? -0.4614 : cfg.homeLon;
    var now = Date.now() / 1000;
    return FLIGHTS.map(function (f) {
      var v = Geo.velocity(f.track, f.gsKt);
      var speed = Math.sqrt(v.vx * v.vx + v.vy * v.vy);
      var frac = ((now / f.periodSec) + f.phase) % 1;
      var along = (frac - 0.5) * f.periodSec * speed;       // km from the closest point
      var ux = v.vx / speed, uy = v.vy / speed;             // unit vector along track
      var x = ux * along + uy * f.offsetKm;                 // add perpendicular offset
      var y = uy * along - ux * f.offsetKm;
      var pos = Geo.toLatLon(lat, lon, x, y);
      return {
        hex: f.hex, callsign: f.callsign, reg: f.reg, type: f.type, desc: '',
        lat: pos.lat, lon: pos.lon, altFt: f.altFt, onGround: false, gsKt: f.gsKt,
        track: f.track, vertRateFpm: f.altFt < 8000 ? -700 : 0, squawk: '', ageSec: 0,
        demoRoute: f.route || { origin: null, dest: null },
        demoHistory: f.history ? {
          origin: f.history.origin, departedAt: Date.now() - f.history.airborneMin * 60000,
          countries: f.history.countries, flightsToday: f.history.flightsToday
        } : null
      };
    });
  }

  return { aircraft: aircraft };
})();
