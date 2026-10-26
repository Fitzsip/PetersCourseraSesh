/* App start-up, polling loop and remote-control keys. */
(function () {
  'use strict';

  var STORAGE_KEY = 'flightOverhead.config';
  var KEY = { ENTER: 13, BACK: 10009, ESC: 27, RED: 403, T: 84 };

  var tracker = new Tracker();
  var state = { cfg: null, aircraft: [], trails: tracker.trails, fetchedAt: Date.now() };
  var pollTimer = null;
  var failures = 0;

  function loadConfig() {
    var cfg = {};
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch (e) { saved = {}; }
    for (var k in DEFAULT_CONFIG) cfg[k] = saved.hasOwnProperty(k) ? saved[k] : DEFAULT_CONFIG[k];

    // URL overrides for testing in a desktop browser, e.g. index.html?lat=51.5&lon=-0.1&demo=1
    var q = {};
    location.search.replace(/[?&]([^=&]+)=([^&]*)/g, function (m, key, val) { q[key] = decodeURIComponent(val); });
    if (q.lat) cfg.homeLat = parseFloat(q.lat);
    if (q.lon) cfg.homeLon = parseFloat(q.lon);
    if (q.provider) cfg.provider = q.provider;
    if (q.demo) cfg.demo = q.demo === '1' || q.demo === 'true';
    if (q.units) cfg.units = q.units;
    return cfg;
  }

  function saveConfig(cfg) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch (e) { /* storage unavailable */ }
  }

  function hasHome(cfg) {
    return typeof cfg.homeLat === 'number' && typeof cfg.homeLon === 'number';
  }

  // Demo mode works anywhere; without a saved home it uses a spot near London.
  function effectiveConfig() {
    var cfg = state.cfg;
    if (cfg.demo && !hasHome(cfg)) {
      var copy = {};
      for (var k in cfg) copy[k] = cfg[k];
      copy.homeLat = 51.4775;
      copy.homeLon = -0.4614;
      return copy;
    }
    return cfg;
  }

  function schedule(seconds) {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(poll, seconds * 1000);
  }

  function poll() {
    var cfg = effectiveConfig();
    if (!hasHome(cfg)) {
      UI.setStatus('Set your home location in Settings (press OK).', true);
      return;
    }
    Providers.fetchAircraft(cfg).then(function (list) {
      var now = Date.now();
      var result = tracker.update(list, cfg, now);
      state.aircraft = result.aircraft;
      state.fetchedAt = now;
      result.newAlerts.forEach(function (a) { UI.showAlert(a, cfg); });
      UI.refreshAlerts(result.aircraft, cfg);
      UI.renderSide({ cfg: cfg, aircraft: state.aircraft });
      UI.setStatus('Updated ' + new Date(now).toLocaleTimeString() + ' · ' +
        (cfg.demo ? 'demo data' : cfg.provider), false);
      failures = 0;
      schedule(pollInterval(cfg));
    }, function (err) {
      failures++;
      var wait = Math.min(120, pollInterval(cfg) * Math.pow(2, failures));
      if (err.status === 429) wait = Math.max(wait, 60);
      UI.setStatus(err.message + ' — retrying in ' + Math.round(wait) + ' s', true);
      schedule(wait);
    });
  }

  function pollInterval(cfg) {
    // Anonymous OpenSky allows only a few hundred calls a day.
    return cfg.provider === 'opensky' && !cfg.demo ? Math.max(cfg.pollSeconds, 90) : cfg.pollSeconds;
  }

  function applyConfig(cfg) {
    state.cfg = cfg;
    saveConfig(cfg);
    tracker = new Tracker();
    state.trails = tracker.trails;
    state.aircraft = [];
    failures = 0;
    UI.renderSide({ cfg: effectiveConfig(), aircraft: [] });
    poll();
  }

  function openSettings(message) {
    Settings.show(state.cfg, message, applyConfig);
  }

  // Show a popup for the nearest aircraft (or a demo plane) so you can check the TV setup.
  function testAlert() {
    var cfg = effectiveConfig();
    var a = state.aircraft[0];
    if (!a) {
      var demoCfg = {};
      for (var k in cfg) demoCfg[k] = cfg[k];
      if (!hasHome(demoCfg)) { demoCfg.homeLat = 51.4775; demoCfg.homeLon = -0.4614; }
      a = new Tracker().update(Demo.aircraft(demoCfg), demoCfg, Date.now()).aircraft[0];
      cfg = demoCfg;
    }
    if (a) UI.showAlert(a, cfg);
  }

  function exitApp() {
    try { tizen.application.getCurrentApplication().exit(); } catch (e) { /* not on a TV */ }
  }

  function onKey(e) {
    if (Settings.handleKey(e)) return;
    switch (e.keyCode) {
      case KEY.ENTER:
        if (!UI.dismissNewest()) openSettings();
        break;
      case KEY.BACK:
      case KEY.ESC:
        if (!UI.dismissNewest()) exitApp();
        break;
      case KEY.RED:
      case KEY.T:
        testAlert();
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  function setupTv() {
    try {
      tizen.tvinputdevice.registerKey('ColorF0Red');
    } catch (e) { /* not on a TV */ }
    try {
      // Keep the TV's screen saver from kicking in while the radar is showing.
      webapis.appcommon.setScreenSaver(webapis.appcommon.AppCommonScreenSaverState.SCREEN_SAVER_OFF);
    } catch (e) { /* not on a TV */ }
  }

  // Nudge the whole screen by a few pixels now and then to avoid burn-in.
  function antiBurnIn() {
    var stage = document.getElementById('stage');
    setInterval(function () {
      var dx = Math.round(Math.random() * 12 - 6), dy = Math.round(Math.random() * 12 - 6);
      stage.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    }, 60000);
  }

  function frame() {
    Radar.draw({ cfg: effectiveConfig(), aircraft: state.aircraft, trails: state.trails, fetchedAt: state.fetchedAt },
      Date.now());
    // ~25 fps is plenty for a radar and gentler on older TVs.
    setTimeout(function () { window.requestAnimationFrame(frame); }, 40);
  }

  function start() {
    state.cfg = loadConfig();
    UI.init();
    Settings.init();
    Radar.init(document.getElementById('radar'));
    setupTv();
    antiBurnIn();
    document.addEventListener('keydown', onKey);
    setInterval(function () { UI.renderClock(state.cfg); }, 10000);
    UI.renderSide({ cfg: effectiveConfig(), aircraft: [] });
    frame();

    if (!hasHome(state.cfg) && !state.cfg.demo) {
      openSettings('Welcome! Enter the latitude and longitude of your house to get started, ' +
        'or turn on demo mode to try it out.');
      UI.setStatus('Waiting for home location…', true);
    } else {
      poll();
    }
  }

  window.onload = start;
})();
