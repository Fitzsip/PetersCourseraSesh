/* Formatting, the side panel and the "overhead" popups. */
var Fmt = {
  thousands: function (n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  },
  alt: function (ft, cfg) {
    if (ft === null || ft === undefined) return '—';
    return cfg.units === 'metric' ? Fmt.thousands(ft * 0.3048) + ' m' : Fmt.thousands(ft) + ' ft';
  },
  speed: function (kt, cfg) {
    if (kt === null || kt === undefined) return '—';
    return cfg.units === 'metric' ? Math.round(kt * 1.852) + ' km/h' : Math.round(kt * 1.15078) + ' mph';
  },
  eta: function (s) {
    if (s < 60) return Math.max(5, Math.round(s / 5) * 5) + 's';
    var m = Math.floor(s / 60), r = Math.min(50, Math.round((s % 60) / 10) * 10);
    return m + 'm' + (r ? ' ' + r + 's' : '');
  },
  dist: function (km, cfg) {
    var metric = cfg.units === 'metric';
    var v = metric ? km : km * 0.621371;
    return (v < 10 ? v.toFixed(1) : Math.round(v)) + (metric ? ' km' : ' mi');
  }
};

var UI = (function () {
  'use strict';
  var els = {};
  var cards = [];          // visible popups, newest last
  var MAX_CARDS = 2;
  var audioCtx = null;
  var onNearbyClick = null;

  function $(id) { return document.getElementById(id); }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function init() {
    ['clock', 'place', 'summary', 'nearby', 'status', 'alerts', 'details'].forEach(function (id) { els[id] = $(id); });
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function renderClock(cfg) {
    var d = new Date();
    var h = d.getHours();
    els.clock.textContent = cfg.units === 'metric'
      ? pad(h) + ':' + pad(d.getMinutes())
      : ((h % 12) || 12) + ':' + pad(d.getMinutes()) + (h < 12 ? ' am' : ' pm');
  }

  function renderSide(state) {
    var cfg = state.cfg;
    renderClock(cfg);
    els.place.textContent = (cfg.demo ? 'DEMO · ' : '') + (cfg.homeName || 'Home');

    var list = state.aircraft;
    var airborne = list.filter(function (a) { return !a.onGround; }).length;
    els.summary.textContent = airborne + ' aircraft within ' + Fmt.dist(cfg.watchRadiusKm, cfg);

    els.nearby.innerHTML = '';
    list.slice(0, 7).forEach(function (a) {
      var isJet = a.flag && a.flag.kind === 'private-jet';
      var li = el('li', (a.inZone ? 'hot ' : '') + (isJet ? 'private-jet ' : '') +
        (a.hex === state.selectedHex ? 'selected' : ''));
      li.onclick = function () { if (onNearbyClick) onNearbyClick(a.hex); };
      var top = el('div', 'nb-top');
      top.appendChild(el('span', 'nb-cs', a.callsign || a.reg || a.hex.toUpperCase()));
      top.appendChild(el('span', 'nb-dist', Fmt.dist(a.distKm, cfg) + ' ' + Geo.compass(a.bearing)));
      var sub = el('div', 'nb-sub',
        [aircraftTypeName(a) || airlineFor(a.callsign), a.onGround ? 'on ground' : Fmt.alt(a.altFt, cfg)]
          .filter(Boolean).join(' · '));
      if (isJet) sub.insertBefore(el('span', 'nb-tag', 'Private jet \u00b7 '), sub.firstChild);
      li.appendChild(top);
      li.appendChild(sub);
      if (a.overheadNow) li.appendChild(el('div', 'nb-badge', 'Overhead now'));
      else if (a.overHouseIn !== null) li.appendChild(el('div', 'nb-badge eta', 'Over the house in ' + Fmt.eta(a.overHouseIn)));
      els.nearby.appendChild(li);
    });
    if (!list.length) els.nearby.appendChild(el('li', 'empty', 'Clear skies right now'));
  }

  function setStatus(msg, isError) {
    els.status.textContent = msg;
    els.status.className = isError ? 'error' : '';
  }

  // ---- Popups ----

  function stat(label) {
    var box = el('div', 'stat');
    box.appendChild(el('div', 'stat-label', label));
    var value = el('div', 'stat-value', '—');
    box.appendChild(value);
    return { box: box, value: value };
  }

  // opts: { label: fixed kicker text (tests), detail: extra info row, silent: no chime,
  //         seconds: how long it stays up }
  function showAlert(a, cfg, opts) {
    opts = opts || {};
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].hex === a.hex) return;
    }
    while (cards.length >= MAX_CARDS) dismiss(cards[0]);

    var card = { hex: a.hex, testLabel: opts.label || '', detail: !!opts.detail };
    var seconds = opts.seconds || cfg.popupSeconds;
    var root = el('div', 'alert');
    var photo = el('div', 'alert-photo');
    photo.appendChild(el('div', 'alert-glyph', '✈'));
    var body = el('div', 'alert-body');
    card.kicker = el('div', 'alert-kicker');
    var title = el('div', 'alert-title');
    title.appendChild(el('span', 'alert-cs', a.callsign || a.reg || a.hex.toUpperCase()));
    var flag = a.flag || classifyAircraft(a);
    var airline = airlineFor(a.callsign);
    if (airline) title.appendChild(el('span', 'alert-airline', airline));
    if (flag.label) title.appendChild(el('span', 'badge ' + flag.kind, flag.label));
    var ownerName = flag.operator || titleCase(a.owner || '');
    if (ownerName.toLowerCase() === airline.toLowerCase()) ownerName = '';
    var owner = el('div', 'alert-owner', ownerName ? 'Operated by ' + ownerName : '');
    card.history = el('div', 'alert-history');
    card.route = el('div', 'alert-route');
    var typeLine = [aircraftTypeName(a), a.reg && a.reg !== a.callsign ? a.reg : ''].filter(Boolean).join(' · ');
    var type = el('div', 'alert-type', typeLine);
    var stats = el('div', 'alert-stats');
    card.alt = stat('Altitude');
    card.speed = stat('Speed');
    card.heading = stat('Heading');
    card.dist = stat('Distance');
    [card.alt, card.speed, card.heading, card.dist].forEach(function (s) { stats.appendChild(s.box); });
    var timer = el('div', 'alert-timer');
    var bar = el('i');
    timer.appendChild(bar);

    body.appendChild(card.kicker);
    body.appendChild(title);
    body.appendChild(card.route);
    if (typeLine) body.appendChild(type);
    if (ownerName) body.appendChild(owner);
    body.appendChild(card.history);
    card.extra = el('div', 'alert-extra');
    if (card.detail) body.appendChild(card.extra);
    body.appendChild(stats);
    root.appendChild(photo);
    root.appendChild(body);
    root.appendChild(timer);
    card.root = root;
    (opts.top ? els.details : els.alerts).appendChild(root);
    cards.push(card);

    updateCard(card, a, cfg);
    // Let the browser lay out the card before starting the slide-in and timer animations.
    setTimeout(function () {
      root.className = 'alert show ' + flag.kind;
      bar.style.transitionDuration = seconds + 's';
      bar.style.width = '0%';
    }, 30);
    card.timeout = setTimeout(function () { dismiss(card); }, seconds * 1000);

    if (cfg.showRoutes) {
      Providers.lookupRoute(a).then(function (r) {
        if (!r || !r.origin || !r.dest) return;
        card.hasRoute = true;
        card.route.innerHTML = '';
        appendAirport(card.route, r.origin);
        card.route.appendChild(el('span', 'arrow', '→'));
        appendAirport(card.route, r.dest);
        if (!r.plausible) card.route.appendChild(el('span', 'unsure', '(unconfirmed)'));
      });
    }
    History.lookup(a, cfg).then(function (h) {
      if (!h) return;
      card.historyData = h;
      // Private jets rarely have a published route, so fall back to the take-off airport.
      if (!card.hasRoute && h.origin) {
        card.route.innerHTML = '';
        if (h.dest) {
          appendAirport(card.route, h.origin);
          card.route.appendChild(el('span', 'arrow', '→'));
          appendAirport(card.route, h.dest);
        } else {
          card.route.appendChild(el('span', 'from', 'From'));
          appendAirport(card.route, h.origin);
        }
      }
      renderHistory(card);
    });
    if (cfg.showPhotos) {
      Providers.lookupPhoto(a).then(function (p) {
        if (!p) return;
        var img = el('img');
        img.onload = function () {
          photo.innerHTML = '';
          photo.appendChild(img);
          if (p.credit) photo.appendChild(el('div', 'credit', '© ' + p.credit + ' / planespotters.net'));
          photo.className = 'alert-photo has-photo';
        };
        img.src = p.src;
      });
    }
    if (cfg.sound && !opts.silent) chime(flag.kind === 'private-jet');
  }

  function duration(ms) {
    var mins = Math.max(0, Math.round(ms / 60000));
    var h = Math.floor(mins / 60), m = mins % 60;
    return h ? h + ' h ' + m + ' min' : m + ' min';
  }

  function renderHistory(card) {
    var h = card.historyData;
    if (!h) return;
    card.history.innerHTML = '';
    if (h.departedAt) {
      var from = h.origin && h.origin.country ? ' since leaving ' + h.origin.country : '';
      var off = new Date(h.departedAt);
      card.history.appendChild(el('div', '', 'In the air for ' + duration(Date.now() - h.departedAt) +
        ' (took off ' + pad(off.getHours()) + ':' + pad(off.getMinutes()) + ')' + from));
    }
    if (h.countries.length) {
      var n = h.countries.length;
      card.history.appendChild(el('div', 'countries',
        'Today: ' + h.countries.join(' \u2192 ') + ' (' + n + (n === 1 ? ' country, ' : ' countries, ') +
        h.flightsToday + (h.flightsToday === 1 ? ' flight)' : ' flights)')));
    }
  }

  function appendAirport(parent, ap) {
    var s = el('span', 'airport');
    s.appendChild(el('b', '', ap.code));
    if (ap.city) s.appendChild(el('span', 'city', ap.city));
    parent.appendChild(s);
  }

  function updateCard(card, a, cfg) {
    var where = Fmt.dist(a.distKm, cfg) + ' ' + Geo.compass(a.bearing) + ' of ' + (cfg.homeName || 'home');
    if (a.overheadNow) card.wasOverhead = true;
    if (a.overheadNow) {
      card.kicker.textContent = '✈  Overhead now · ' + where;
      card.kicker.className = 'alert-kicker now';
    } else if (a.overHouseIn !== null) {
      card.kicker.textContent = 'Approaching · over the house in ~' + Fmt.eta(a.overHouseIn);
      card.kicker.className = 'alert-kicker soon';
    } else if (a.inZone) {
      card.kicker.textContent = 'Nearby · ' + where;
      card.kicker.className = 'alert-kicker soon';
    } else {
      card.kicker.textContent = (card.wasOverhead ? 'Passed over · now ' : 'Now ') + where;
      card.kicker.className = 'alert-kicker past';
    }
    if (card.testLabel) {
      card.kicker.textContent = card.testLabel;
      card.kicker.className = 'alert-kicker test';
    }
    if (card.detail) card.extra.textContent = detailLine(a, cfg);
    card.alt.value.textContent = a.onGround ? 'Ground' : Fmt.alt(a.altFt, cfg);
    if (a.vertRateFpm !== null && Math.abs(a.vertRateFpm) > 300) {
      card.alt.value.textContent += a.vertRateFpm > 0 ? ' ▲' : ' ▼';
    }
    card.speed.value.textContent = Fmt.speed(a.gsKt, cfg);
    card.heading.value.textContent = a.track === null ? '—' : Geo.compass(a.track) + ' ' + Math.round(a.track) + '°';
    card.dist.value.textContent = Fmt.dist(a.distKm, cfg);
    renderHistory(card);
  }

  function detailLine(a, cfg) {
    var parts = [];
    var vr = a.vertRateFpm;
    if (vr !== null && vr !== undefined && Math.abs(vr) > 300) {
      parts.push((vr > 0 ? 'Climbing ' : 'Descending ') + (cfg.units === 'metric'
        ? (Math.abs(vr) * 0.00508).toFixed(1) + ' m/s' : Fmt.thousands(Math.abs(vr)) + ' ft/min'));
    } else if (!a.onGround) {
      parts.push('Level flight');
    }
    if (a.overheadNow) parts.push('Over the house now');
    else if (a.overHouseIn !== null) parts.push('Over the house in ~' + Fmt.eta(a.overHouseIn));
    else if (a.cpaSec > 0 && a.cpaKm < a.distKm - 0.5) {
      parts.push('Closest ' + Fmt.dist(a.cpaKm, cfg) + ' in ' + Fmt.eta(a.cpaSec));
    } else parts.push('Moving away');
    if (a.squawk) parts.push('Squawk ' + a.squawk);
    parts.push('ICAO ' + String(a.hex).toUpperCase());
    return parts.join(' · ');
  }

  function hasCard(hex) {
    for (var i = 0; i < cards.length; i++) if (cards[i].hex === hex) return cards[i];
    return null;
  }

  // OK on a selected plane opens its detail card, or closes it if already open.
  function toggleDetail(a, cfg) {
    var open = hasCard(a.hex);
    if (open) { dismiss(open); return; }
    // Open at the top when the plane is in the lower half of the radar, so the card doesn't hide it.
    showAlert(a, cfg, { detail: true, silent: true, seconds: 60, top: a.y < 0 });
  }

  function refreshAlerts(aircraft, cfg) {
    var byHex = {};
    aircraft.forEach(function (a) { byHex[a.hex] = a; });
    cards.forEach(function (c) { if (byHex[c.hex]) updateCard(c, byHex[c.hex], cfg); });
  }

  function dismiss(card) {
    var idx = cards.indexOf(card);
    if (idx < 0) return;
    cards.splice(idx, 1);
    clearTimeout(card.timeout);
    card.root.className = 'alert hide';
    setTimeout(function () {
      if (card.root.parentNode) card.root.parentNode.removeChild(card.root);
    }, 500);
  }

  function dismissNewest() {
    if (!cards.length) return false;
    dismiss(cards[cards.length - 1]);
    return true;
  }

  function chime(special) {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = audioCtx || new Ctx();
      var t0 = audioCtx.currentTime;
      (special ? [1046.5, 1318.5, 1568] : [880, 1318.5]).forEach(function (freq, i) {
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t0 + i * 0.18);
        gain.gain.exponentialRampToValueAtTime(0.25, t0 + i * 0.18 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.18 + 0.6);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(t0 + i * 0.18);
        osc.stop(t0 + i * 0.18 + 0.65);
      });
    } catch (e) { /* no audio available */ }
  }

  return {
    init: init, renderSide: renderSide, renderClock: renderClock, setStatus: setStatus,
    showAlert: showAlert, refreshAlerts: refreshAlerts, dismissNewest: dismissNewest,
    toggleDetail: toggleDetail,
    setNearbyClick: function (fn) { onNearbyClick = fn; }
  };
})();
