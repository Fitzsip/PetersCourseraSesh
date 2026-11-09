/*
 * Private jets and helicopters seen in the last 24 hours, with Flightradar24 links, so they can be
 * looked up after the popup or notification has gone. Stored on the TV, or in the
 * phone app's storage (shared with its background watcher) when running on Android.
 */
var JetLog = (function () {
  'use strict';
  var STORAGE_KEY = 'flightOverhead.jetLog';
  var KEEP_MS = 24 * 3600 * 1000;
  var KEY = { ENTER: 13, BACK: 10009, ESC: 27, GREEN: 404, J: 74, UP: 38, DOWN: 40 };

  var root, listEl, qrCanvas, qrCaption, entries = [], index = 0, open = false;

  function bridge() {
    return window.AndroidBridge && AndroidBridge.getJetLog ? AndroidBridge : null;
  }

  function load() {
    var raw = null;
    try {
      raw = bridge() ? bridge().getJetLog() : localStorage.getItem(STORAGE_KEY);
    } catch (e) { /* storage unavailable */ }
    var list = [];
    try { list = JSON.parse(raw) || []; } catch (e) { list = []; }
    var cutoff = Date.now() - KEEP_MS;
    return list.filter(function (e) { return e && e.lastSeen >= cutoff; })
      .sort(function (a, b) { return b.lastSeen - a.lastSeen; });
  }

  // Adds the jet, or updates it if it was already seen in the last 24 hours.
  function record(a) {
    var entry = {
      hex: a.hex, kind: a.flag ? a.flag.kind : '', callsign: a.callsign, reg: a.reg, type: aircraftTypeName(a),
      operator: (a.flag && a.flag.operator) || titleCase(a.owner || ''),
      closestKm: Math.round(a.distKm * 10) / 10, altFt: a.altFt,
      firstSeen: Date.now(), lastSeen: Date.now()
    };
    if (bridge()) {
      try { bridge().recordJet(JSON.stringify(entry)); } catch (e) { /* bridge unavailable */ }
      return;
    }
    var list = load();
    for (var i = 0; i < list.length; i++) {
      if (list[i].hex !== entry.hex) continue;
      entry.firstSeen = list[i].firstSeen;
      if (list[i].closestKm < entry.closestKm) {
        entry.closestKm = list[i].closestKm;
        entry.altFt = list[i].altFt;
      }
      list.splice(i, 1);
      break;
    }
    list.unshift(entry);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch (e) { /* storage full */ }
  }

  function counts() {
    var c = { jets: 0, helicopters: 0 };
    load().forEach(function (e) {
      if (e.kind === 'helicopter') c.helicopters++;
      else c.jets++;
    });
    return c;
  }

  // ---- The list screen ----

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function when(ms) {
    var d = new Date(ms);
    var today = new Date().toDateString() === d.toDateString();
    return (today ? '' : 'Yesterday ') + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function init() {
    root = document.getElementById('jetlog');
    listEl = document.getElementById('jetlog-list');
    qrCanvas = document.getElementById('jetlog-qr-code');
    qrCaption = document.getElementById('jetlog-qr-caption');
    document.getElementById('jetlog-close').onclick = close;
  }

  function render(cfg) {
    listEl.innerHTML = '';
    if (!entries.length) {
      listEl.appendChild(el('li', 'empty', 'No private jets or helicopters in the last 24 hours.'));
      qrCanvas.style.visibility = 'hidden';
      qrCaption.textContent = '';
      return;
    }
    entries.forEach(function (e, i) {
      var li = el('li', (i === index ? 'selected ' : '') + (e.kind === 'helicopter' ? 'helicopter' : ''));
      var top = el('div', 'jl-top');
      top.appendChild(el('span', 'jl-time', when(e.firstSeen)));
      top.appendChild(el('span', 'jl-cs', e.callsign || e.reg || String(e.hex).toUpperCase()));
      top.appendChild(el('span', 'jl-dist', 'closest ' + Fmt.dist(e.closestKm, cfg)));
      li.appendChild(top);
      li.appendChild(el('div', 'jl-sub', [e.type, e.reg && e.reg !== e.callsign ? e.reg : '', e.operator]
        .filter(Boolean).join(' · ')));
      li.onclick = function () {
        index = i;
        if (PLATFORM === 'android') openLink(e);
        else render(cfg);
      };
      listEl.appendChild(li);
    });
    var sel = entries[index];
    qrCanvas.width = 240;
    qrCanvas.style.visibility = QR.draw(qrCanvas, historyUrl(sel)) ? 'visible' : 'hidden';
    qrCaption.textContent = 'Scan for ' + (sel.callsign || sel.reg) + ' on Flightradar24';
    var selected = listEl.children[index];
    if (selected && selected.scrollIntoView) selected.scrollIntoView(false);
  }

  function openLink(e) {
    var url = historyUrl(e);
    if (window.AndroidBridge && AndroidBridge.openUrl) AndroidBridge.openUrl(url);
    else window.open(url, '_blank');
  }

  function show(cfg) {
    entries = load();
    index = 0;
    open = true;
    root.className = '';
    render(cfg);
  }

  function close() {
    open = false;
    root.className = 'hidden';
  }

  // Returns true when the key was used by the list screen.
  function handleKey(e, cfg) {
    if (!open) return false;
    switch (e.keyCode) {
      case KEY.UP: index = Math.max(0, index - 1); render(cfg); break;
      case KEY.DOWN: index = Math.min(entries.length - 1, index + 1); render(cfg); break;
      case KEY.BACK: case KEY.ESC: case KEY.GREEN: case KEY.J: case KEY.ENTER: close(); break;
      default: return true;
    }
    e.preventDefault();
    return true;
  }

  return {
    init: init, record: record, counts: counts, show: show, close: close, handleKey: handleKey,
    isOpen: function () { return open; }
  };
})();
