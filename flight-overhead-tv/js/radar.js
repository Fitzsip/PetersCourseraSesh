/* Radar-style map of nearby traffic, centred on home, north up. */
var Radar = (function () {
  'use strict';
  var canvas, ctx, w = 0, h = 0;

  // Simple aircraft silhouette pointing up, in units of its half-size.
  var PLANE = [[0, -1], [0.12, -0.6], [0.12, -0.2], [1, 0.25], [1, 0.4], [0.12, 0.2], [0.1, 0.7],
               [0.4, 0.9], [0.4, 1], [0, 0.92], [-0.4, 1], [-0.4, 0.9], [-0.1, 0.7], [-0.12, 0.2],
               [-1, 0.4], [-1, 0.25], [-0.12, -0.2], [-0.12, -0.6]];

  function init(el) {
    canvas = el;
    ctx = el.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }

  function resize() {
    var dpr = window.devicePixelRatio || 1;
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function altitudeColour(ft) {
    if (ft === null) return '#9fb3c8';
    if (ft < 5000) return '#7ee0c3';
    if (ft < 15000) return '#7cc4ff';
    return '#a99cff';
  }

  function drawPlane(x, y, trackDeg, size, colour) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((trackDeg || 0) * Math.PI / 180);
    ctx.beginPath();
    for (var i = 0; i < PLANE.length; i++) {
      var px = PLANE[i][0] * size, py = PLANE[i][1] * size;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = colour;
    ctx.fill();
    ctx.restore();
  }

  function draw(state, now) {
    if (!ctx || !w || !h) return;
    var cfg = state.cfg;
    var cx = w / 2, cy = h / 2;
    var R = Math.min(w, h) / 2 - 40;
    var scale = R / cfg.watchRadiusKm;
    var rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 10;

    ctx.clearRect(0, 0, w, h);

    var glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    glow.addColorStop(0, 'rgba(40, 110, 150, 0.35)');
    glow.addColorStop(1, 'rgba(10, 25, 40, 0.10)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();

    // Range rings and labels.
    ctx.strokeStyle = 'rgba(130, 190, 220, 0.25)';
    ctx.fillStyle = 'rgba(160, 200, 220, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.font = (1.6 * rem) + 'px sans-serif';
    ctx.textAlign = 'left';
    for (var i = 1; i <= 3; i++) {
      var r = R * i / 3;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillText(Fmt.dist(cfg.watchRadiusKm * i / 3, cfg), cx + r * 0.71 + 6, cy - r * 0.71);
    }
    ctx.beginPath();
    ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
    ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
    ctx.stroke();

    ctx.font = 'bold ' + (2 * rem) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', cx, cy - R - 20);
    ctx.fillText('S', cx, cy + R + 20);
    ctx.fillText('E', cx + R + 20, cy);
    ctx.fillText('W', cx - R - 20, cy);

    // Sweep.
    var sweep = (now / 4000 % 1) * Math.PI * 2 - Math.PI / 2;
    for (var k = 0; k < 24; k++) {
      var ang = sweep - k * 0.025;
      ctx.strokeStyle = 'rgba(126, 224, 195, ' + (0.22 * (1 - k / 24)) + ')';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R);
      ctx.stroke();
    }

    // Alert zone around the house.
    var rz = Math.max(cfg.alertRadiusKm * scale, 10);
    ctx.fillStyle = 'rgba(255, 181, 71, 0.14)';
    ctx.strokeStyle = 'rgba(255, 181, 71, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, rz, 0, Math.PI * 2);
    ctx.fill();
    if (ctx.setLineDash) ctx.setLineDash([8, 6]);
    ctx.stroke();
    if (ctx.setLineDash) ctx.setLineDash([]);

    // Airports.
    ctx.font = (1.5 * rem) + 'px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (var ap = 0; ap < AIRPORT_PINS.length; ap++) {
      var pin = Geo.toLocal(cfg.homeLat, cfg.homeLon, AIRPORT_PINS[ap].lat, AIRPORT_PINS[ap].lon);
      if (pin.x * pin.x + pin.y * pin.y > cfg.watchRadiusKm * cfg.watchRadiusKm) continue;
      var ax = cx + pin.x * scale, ay = cy - pin.y * scale;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#57c7d4';
      ctx.fillRect(-5, -5, 10, 10);
      ctx.restore();
      ctx.fillStyle = 'rgba(87, 199, 212, 0.85)';
      ctx.fillText(AIRPORT_PINS[ap].icao, ax + 10, ay);
    }

    // Home.
    ctx.fillStyle = '#ffd38a';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 12); ctx.lineTo(cx + 11, cy - 2); ctx.lineTo(cx + 8, cy - 2);
    ctx.lineTo(cx + 8, cy + 10); ctx.lineTo(cx - 8, cy + 10); ctx.lineTo(cx - 8, cy - 2);
    ctx.lineTo(cx - 11, cy - 2);
    ctx.closePath();
    ctx.fill();

    // Aircraft, moved forward smoothly between polls.
    var dt = Math.min(Math.max((now - state.fetchedAt) / 1000, 0), 30);
    var list = state.aircraft;
    var labels = [];
    for (var j = list.length - 1; j >= 0; j--) {
      var a = list[j];
      var x = a.x + a.vx * dt, y = a.y + a.vy * dt;
      if (x * x + y * y > cfg.watchRadiusKm * cfg.watchRadiusKm * 1.05) continue;
      var px = cx + x * scale, py = cy - y * scale;
      var colour = a.flag && a.flag.kind === 'private-jet' ? '#ff7ad9'
        : a.inZone ? '#ffb547' : altitudeColour(a.altFt);

      var trail = state.trails[a.hex];
      if (trail && trail.length > 1) {
        ctx.strokeStyle = colour;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (var t = 0; t < trail.length; t++) {
          var tx = cx + trail[t][0] * scale, ty = cy - trail[t][1] * scale;
          if (t === 0) ctx.moveTo(tx, ty); else ctx.lineTo(tx, ty);
        }
        ctx.lineTo(px, py);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      if (a.inZone) {
        ctx.fillStyle = 'rgba(255, 181, 71, 0.25)';
        ctx.beginPath();
        ctx.arc(px, py, 26 + 6 * Math.sin(now / 200), 0, Math.PI * 2);
        ctx.fill();
      }
      drawPlane(px, py, a.track, a.inZone ? 18 : 13, colour);
      labels.push({ a: a, x: px + 18, y: py, colour: colour });
    }
    drawLabels(labels, cfg, rem);
  }

  // Alerting planes get labelled first, then nearest; labels that would overlap are skipped.
  function drawLabels(labels, cfg, rem) {
    labels.sort(function (p, q) { return (q.a.inZone - p.a.inZone) || (p.a.distKm - q.a.distKm); });
    var placed = [];
    var lineH = 1.7 * rem;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    for (var i = 0; i < labels.length; i++) {
      var l = labels[i];
      var name = l.a.callsign || l.a.reg || l.a.hex.toUpperCase();
      var alt = l.a.onGround ? 'ground' : Fmt.alt(l.a.altFt, cfg);
      ctx.font = 'bold ' + (1.7 * rem) + 'px sans-serif';
      var boxW = Math.max(ctx.measureText(name).width, ctx.measureText(alt).width);
      var box = { x: l.x, y: l.y - lineH - 4, w: boxW, h: lineH * 2 + 4 };
      var clash = false;
      for (var k = 0; k < placed.length && !clash; k++) {
        var b = placed[k];
        clash = box.x < b.x + b.w && b.x < box.x + box.w && box.y < b.y + b.h && b.y < box.y + box.h;
      }
      if (clash) continue;
      placed.push(box);
      ctx.fillStyle = l.colour;
      ctx.fillText(name, l.x, l.y - 4);
      ctx.fillStyle = 'rgba(220, 230, 240, 0.75)';
      ctx.font = (1.5 * rem) + 'px sans-serif';
      ctx.fillText(alt, l.x, l.y + lineH);
    }
  }

  return { init: init, draw: draw, resize: resize };
})();
