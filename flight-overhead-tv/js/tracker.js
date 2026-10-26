/*
 * Decides which aircraft are "overhead" and which deserve a new popup.
 * A plane alerts when it is below maxAltitudeFt and either within alertRadiusKm
 * now, or on a straight course that brings it within that radius in the next
 * lookaheadSeconds (which also hides API and polling delay).
 */
function Tracker() {
  this.lastInZone = {};   // hex -> ms timestamp the plane was last inside the alert zone
  this.trails = {};       // hex -> recent [x, y] positions for the radar
}

Tracker.prototype.update = function (list, cfg, now) {
  var out = [];
  var newAlerts = [];
  var cooldownMs = cfg.cooldownMinutes * 60000;
  var seen = {};

  for (var i = 0; i < list.length; i++) {
    var a = list[i];
    var p = Geo.toLocal(cfg.homeLat, cfg.homeLon, a.lat, a.lon);
    var hasVelocity = a.gsKt !== null && a.track !== null && a.gsKt > 0;
    var v = hasVelocity ? Geo.velocity(a.track, a.gsKt) : { vx: 0, vy: 0 };

    // Dead-reckon positions reported a few seconds ago up to "now".
    a.x = p.x + v.vx * a.ageSec;
    a.y = p.y + v.vy * a.ageSec;
    a.vx = v.vx;
    a.vy = v.vy;
    a.distKm = Math.sqrt(a.x * a.x + a.y * a.y);
    if (a.distKm > cfg.watchRadiusKm) continue;

    a.bearing = Geo.bearing(a.x, a.y);
    a.flag = classifyAircraft(a);
    var cpa = Geo.closestApproach(a.x, a.y, v.vx, v.vy);
    a.cpaKm = cpa.km;
    a.cpaSec = cpa.seconds;

    var altOk = !a.onGround && (a.altFt === null || a.altFt <= cfg.maxAltitudeFt);
    a.overheadNow = altOk && a.distKm <= cfg.alertRadiusKm;
    a.inZone = a.overheadNow ||
      (altOk && hasVelocity && a.cpaKm <= cfg.alertRadiusKm && a.cpaSec <= cfg.lookaheadSeconds);

    if (a.inZone) {
      var last = this.lastInZone[a.hex];
      var wanted = cfg.alertFilter !== 'private jets' || a.flag.kind === 'private-jet';
      if ((!last || now - last > cooldownMs) && wanted) newAlerts.push(a);
      this.lastInZone[a.hex] = now;
    }

    var trail = this.trails[a.hex] || (this.trails[a.hex] = []);
    trail.push([a.x, a.y]);
    if (trail.length > 24) trail.shift();
    seen[a.hex] = true;
    out.push(a);
  }

  for (var hex in this.trails) {
    if (!seen[hex]) delete this.trails[hex];
  }
  for (hex in this.lastInZone) {
    if (now - this.lastInZone[hex] > cooldownMs) delete this.lastInZone[hex];
  }

  out.sort(function (a, b) { return a.distKm - b.distKm; });
  return { aircraft: out, newAlerts: newAlerts };
};
