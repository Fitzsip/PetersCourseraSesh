/*
 * Keeps the well-known aircraft list (js/notable.js) current: once a month it downloads
 * plane-alert-db and rebuilds the list with the same rules as tools/build-notable.py
 * (NOTABLE_RULES). The newest list is kept on the device; if a download fails or looks
 * wrong, the previous list stays in use.
 */
var NotableLive = (function () {
  'use strict';
  var SOURCE = 'https://raw.githubusercontent.com/sdr-enthusiasts/plane-alert-db/main/plane-alert-db.csv';
  var STORAGE_KEY = 'flightOverhead.notable';
  var REFRESH_MS = 30 * 24 * 3600 * 1000;
  var RETRY_MS = 24 * 3600 * 1000;
  var MIN_PEOPLE = 50;   // a smaller result means the file changed shape; keep the old list

  var updatedAt = 0;     // when the list in use was downloaded (0 = the one built into the app)
  var lastTry = 0;

  // Uses the list saved by an earlier download, if there is one.
  function load() {
    try {
      var saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && saved.list && saved.at) {
        NOTABLE = saved.list;
        updatedAt = saved.at;
      }
    } catch (e) { /* keep the built-in list */ }
  }

  // Splits CSV text into rows of fields, handling quoted fields.
  function parseCsv(text) {
    var rows = [], row = [], field = '', quoted = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (quoted) {
        if (ch === '"' && text.charAt(i + 1) === '"') { field += '"'; i++; }
        else if (ch === '"') quoted = false;
        else field += ch;
      } else if (ch === '"') {
        quoted = true;
      } else if (ch === ',') {
        row.push(field); field = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text.charAt(i + 1) === '\n') i++;
        row.push(field); field = '';
        rows.push(row); row = [];
      } else {
        field += ch;
      }
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    return rows;
  }

  // Same selection as tools/build-notable.py.
  function build(text) {
    var rows = parseCsv(text);
    var head = rows[0] || [];
    var col = {};
    for (var i = 0; i < head.length; i++) col[head[i]] = i;
    var icao = col['$ICAO'], operator = col['$Operator'], category = col.Category;
    if (icao === undefined || operator === undefined || category === undefined) return null;

    var list = {}, people = 0;
    for (i = 1; i < rows.length; i++) {
      var r = rows[i];
      var hex = String(r[icao] || '').replace(/^\s+|\s+$/g, '').toLowerCase();
      if (!/^[0-9a-f]{6}$/.test(hex)) continue;
      var cat = String(r[category] || '').replace(/^\s+|\s+$/g, '');
      var op = String(r[operator] || '').replace(/^\s+|\s+$/g, '');
      if (NOTABLE_RULES.people.hasOwnProperty(cat)) {
        list[hex] = [NOTABLE_RULES.fronts[op] || op, NOTABLE_RULES.people[cat], 1];
        people++;
      } else if (NOTABLE_RULES.services.hasOwnProperty(cat)) {
        list[hex] = [op, NOTABLE_RULES.services[cat], 0];
      }
    }
    return people >= MIN_PEOPLE ? list : null;
  }

  // Downloads a new list if this one is a month old. Calls onUpdate() after a successful update.
  function refresh(onUpdate) {
    var now = Date.now();
    if (updatedAt && now - updatedAt < REFRESH_MS) return;
    if (lastTry && now - lastTry < RETRY_MS) return;
    lastTry = now;
    var xhr = new XMLHttpRequest();
    xhr.open('GET', SOURCE, true);
    xhr.timeout = 60000;
    xhr.onload = function () {
      if (xhr.status !== 200) return;
      var list = build(xhr.responseText);
      if (!list) return;
      NOTABLE = list;
      updatedAt = Date.now();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ at: updatedAt, list: list }));
      } catch (e) { /* storage full: still used until the app restarts */ }
      if (onUpdate) onUpdate();
    };
    xhr.send(null);
  }

  // For the settings screen.
  function describe() {
    var n = 0;
    for (var k in NOTABLE) if (NOTABLE[k][2]) n++;
    if (!updatedAt) return n + ' well-known aircraft (built-in list)';
    var d = new Date(updatedAt);
    return n + ' well-known aircraft (updated ' + d.getDate() + ' ' +
      ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()] + ')';
  }

  return { load: load, refresh: refresh, build: build, describe: describe };
})();
