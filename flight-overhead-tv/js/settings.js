/* Settings screen, driven entirely by the TV remote (arrow keys, OK, Back). */
var Settings = (function () {
  'use strict';

  var FIELDS = [
    { key: 'homeLat', label: 'Home latitude', type: 'number' },
    { key: 'homeLon', label: 'Home longitude', type: 'number' },
    { key: 'homeName', label: 'Location name', type: 'text' },
    { key: 'alertRadiusKm', label: 'Overhead radius (km)', type: 'number' },
    { key: 'maxAltitudeFt', label: 'Ignore planes above (ft)', type: 'number' },
    { key: 'watchRadiusKm', label: 'Radar range (km)', type: 'number' },
    { key: 'provider', label: 'Flight data source', type: 'choice', options: ['adsb.lol', 'airplanes.live', 'opensky'] },
    { key: 'units', label: 'Units', type: 'choice', options: ['imperial', 'metric'] },
    { key: 'sound', label: 'Chime on alert', type: 'bool' },
    { key: 'showRoutes', label: 'Look up routes', type: 'bool' },
    { key: 'showPhotos', label: 'Show aircraft photos', type: 'bool' },
    { key: 'demo', label: 'Demo mode (simulated planes)', type: 'bool' }
  ];

  var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 10009, ESC: 27,
              IME_DONE: 65376, IME_CANCEL: 65385 };

  var root, rowsEl, errorEl, draft, rows = [], index = 0, onSave = null, open = false;

  function init() {
    root = document.getElementById('settings');
    rowsEl = document.getElementById('settings-rows');
    errorEl = document.getElementById('settings-error');
    document.getElementById('settings-save').onclick = save;
    document.getElementById('settings-cancel').onclick = close;
  }

  function display(f) {
    var v = draft[f.key];
    if (f.type === 'bool') return v ? 'On' : 'Off';
    if (v === null || v === undefined || v === '') return 'not set';
    return String(v);
  }

  function build() {
    rowsEl.innerHTML = '';
    rows = [];
    FIELDS.forEach(function (f) {
      var row = document.createElement('div');
      row.className = 'row field';
      row.tabIndex = 0;
      var label = document.createElement('span');
      label.className = 'label';
      label.textContent = f.label;
      row.appendChild(label);

      if (f.type === 'number' || f.type === 'text') {
        var input = document.createElement('input');
        input.type = 'text';
        input.inputMode = f.type === 'number' ? 'decimal' : 'text';
        input.value = draft[f.key] === null || draft[f.key] === undefined ? '' : draft[f.key];
        input.placeholder = 'not set';
        input.tabIndex = -1;
        input.onkeydown = function (e) { inputKey(e, f, input, row); };
        input.onblur = function () { commitInput(f, input); };
        row.appendChild(input);
        row.input = input;
      } else {
        var value = document.createElement('span');
        value.className = 'value';
        value.textContent = '◀ ' + display(f) + ' ▶';
        row.appendChild(value);
        row.valueEl = value;
      }
      row.field = f;
      row.onclick = function () { focusRow(rows.indexOf(row)); activate(row); };
      rowsEl.appendChild(row);
      rows.push(row);
    });
    rows.push(document.getElementById('settings-save'));
    rows.push(document.getElementById('settings-cancel'));
  }

  function focusRow(i) {
    index = Math.max(0, Math.min(rows.length - 1, i));
    rows[index].focus();
    if (rows[index].scrollIntoView) rows[index].scrollIntoView(false);
  }

  function cycle(row, dir) {
    var f = row.field;
    if (f.type === 'bool') {
      draft[f.key] = !draft[f.key];
    } else if (f.type === 'choice') {
      var i = f.options.indexOf(draft[f.key]);
      draft[f.key] = f.options[(i + dir + f.options.length) % f.options.length];
    } else {
      return;
    }
    row.valueEl.textContent = '◀ ' + display(f) + ' ▶';
  }

  function activate(row) {
    if (!row.field) { row.click(); return; }
    if (row.input) { row.input.focus(); return; }   // opens the TV's on-screen keyboard
    cycle(row, 1);
  }

  function commitInput(f, input) {
    var raw = String(input.value).trim();
    if (f.type === 'number') {
      draft[f.key] = raw === '' ? null : parseFloat(raw);
    } else {
      draft[f.key] = raw;
    }
  }

  function inputKey(e, f, input, row) {
    var k = e.keyCode;
    if (k === KEY.ENTER || k === KEY.IME_DONE || k === KEY.UP || k === KEY.DOWN) {
      commitInput(f, input);
      input.blur();
      row.focus();
      if (k === KEY.UP) focusRow(index - 1);
      if (k === KEY.DOWN) focusRow(index + 1);
      e.preventDefault();
    } else if (k === KEY.IME_CANCEL || k === KEY.BACK || k === KEY.ESC) {
      input.value = draft[f.key] === null || draft[f.key] === undefined ? '' : draft[f.key];
      input.blur();
      row.focus();
      e.preventDefault();
    }
    e.stopPropagation();
  }

  function validate(c) {
    function isNum(v) { return typeof v === 'number' && isFinite(v); }
    if (!c.demo) {
      if (!isNum(c.homeLat) || c.homeLat < -90 || c.homeLat > 90) return 'Latitude must be between -90 and 90.';
      if (!isNum(c.homeLon) || c.homeLon < -180 || c.homeLon > 180) return 'Longitude must be between -180 and 180.';
    }
    if (!isNum(c.alertRadiusKm) || c.alertRadiusKm <= 0) return 'Overhead radius must be a positive number.';
    if (!isNum(c.maxAltitudeFt) || c.maxAltitudeFt <= 0) return 'Altitude limit must be a positive number.';
    if (!isNum(c.watchRadiusKm) || c.watchRadiusKm < c.alertRadiusKm || c.watchRadiusKm > 400) {
      return 'Radar range must be at least the overhead radius and at most 400 km.';
    }
    return '';
  }

  function save() {
    var problem = validate(draft);
    if (problem) {
      errorEl.textContent = problem;
      errorEl.className = 'error';
      return;
    }
    var result = draft;
    close();
    if (onSave) onSave(result);
  }

  function show(cfg, message, saveCallback) {
    draft = JSON.parse(JSON.stringify(cfg));
    onSave = saveCallback;
    errorEl.textContent = message || '';
    errorEl.className = '';
    build();
    root.className = '';
    open = true;
    focusRow(0);
  }

  function close() {
    root.className = 'hidden';
    open = false;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  // Returns true when the key was used by the settings screen.
  function handleKey(e) {
    if (!open) return false;
    var row = rows[index];
    switch (e.keyCode) {
      case KEY.UP: focusRow(index - 1); break;
      case KEY.DOWN: focusRow(index + 1); break;
      case KEY.LEFT: if (row.field) cycle(row, -1); else focusRow(rows.length - 2); break;
      case KEY.RIGHT: if (row.field) cycle(row, 1); else focusRow(rows.length - 1); break;
      case KEY.ENTER: activate(row); break;
      case KEY.BACK: case KEY.ESC: close(); break;
      default: return true;
    }
    e.preventDefault();
    return true;
  }

  return { init: init, show: show, handleKey: handleKey, isOpen: function () { return open; } };
})();
