/* Geometry helpers. Positions near home use a flat x/y plane in km (x = east, y = north). */
var Geo = (function () {
  'use strict';
  var EARTH_KM = 6371.0088;
  var KM_PER_DEG = Math.PI * EARTH_KM / 180;
  var POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

  function rad(d) { return d * Math.PI / 180; }

  function toLocal(homeLat, homeLon, lat, lon) {
    var dLon = lon - homeLon;
    if (dLon > 180) dLon -= 360;
    if (dLon < -180) dLon += 360;
    return {
      x: dLon * KM_PER_DEG * Math.cos(rad(homeLat)),
      y: (lat - homeLat) * KM_PER_DEG
    };
  }

  function toLatLon(homeLat, homeLon, x, y) {
    return {
      lat: homeLat + y / KM_PER_DEG,
      lon: homeLon + x / (KM_PER_DEG * Math.cos(rad(homeLat)))
    };
  }

  // Velocity in km/s along a compass track.
  function velocity(trackDeg, speedKt) {
    var v = speedKt * 1.852 / 3600;
    return { vx: Math.sin(rad(trackDeg)) * v, vy: Math.cos(rad(trackDeg)) * v };
  }

  // Closest point of approach to home for a straight-line path.
  function closestApproach(x, y, vx, vy) {
    var v2 = vx * vx + vy * vy;
    var t = v2 > 0 ? -(x * vx + y * vy) / v2 : 0;
    if (t < 0) t = 0;
    return { seconds: t, km: Math.sqrt(Math.pow(x + vx * t, 2) + Math.pow(y + vy * t, 2)) };
  }

  // Compass bearing of point (x, y) as seen from home.
  function bearing(x, y) {
    return (Math.atan2(x, y) * 180 / Math.PI + 360) % 360;
  }

  function compass(deg) {
    return POINTS[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
  }

  return {
    toLocal: toLocal, toLatLon: toLatLon, velocity: velocity,
    closestApproach: closestApproach, bearing: bearing, compass: compass
  };
})();
