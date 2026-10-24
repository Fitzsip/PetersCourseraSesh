/*
 * Thin wrapper around the Samsung/Tizen TV APIs.
 * Every call degrades gracefully, so the app also runs in a desktop browser ("demo mode").
 */
var Platform = (function () {
  var hasTizen = typeof window.tizen !== 'undefined';
  var hasTuner = hasTizen && !!tizen.tvchannel;
  var hasWindow = hasTizen && !!tizen.tvwindow;
  var tvWindowVisible = false;

  var KEYS = {
    LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13,
    BACK: 10009, EXIT: 10182,
    RED: 403, GREEN: 404, YELLOW: 405, BLUE: 406,
    CH_UP: 427, CH_DOWN: 428, INFO: 457
  };

  function registerKeys() {
    if (!hasTizen || !tizen.tvinputdevice) return;
    var wanted = ['ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue',
      'ChannelUp', 'ChannelDown', 'Info', 'Exit',
      '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    try {
      var supported = tizen.tvinputdevice.getSupportedKeys().map(function (k) { return k.name; });
      var keys = wanted.filter(function (k) { return supported.indexOf(k) !== -1; });
      tizen.tvinputdevice.registerKeyBatch(keys);
    } catch (e) {
      console.warn('Key registration failed', e);
    }
  }

  // Normalise a keydown event to one of our action names (also maps a PC keyboard for demo mode).
  function actionFor(e) {
    var c = e.keyCode;
    if (c >= 48 && c <= 57) return 'DIGIT_' + (c - 48);
    if (c >= 96 && c <= 105) return 'DIGIT_' + (c - 96);
    switch (c) {
      case KEYS.LEFT: return 'LEFT';
      case KEYS.RIGHT: return 'RIGHT';
      case KEYS.UP: return 'UP';
      case KEYS.DOWN: return 'DOWN';
      case KEYS.ENTER: return 'ENTER';
      case KEYS.BACK: case 8: case 27: case 65385: return 'BACK'; // 65385 = on-screen keyboard Cancel
      case 65376: return 'ENTER';                                 // on-screen keyboard Done
      case KEYS.EXIT: return 'EXIT';
      case KEYS.RED: case 82: return 'RED';        // R
      case KEYS.GREEN: case 71: return 'GREEN';    // G
      case KEYS.YELLOW: case 89: return 'YELLOW';  // Y
      case KEYS.BLUE: case 66: return 'BLUE';      // B
      case KEYS.CH_UP: case 33: return 'CH_UP';    // Page Up
      case KEYS.CH_DOWN: case 34: return 'CH_DOWN';// Page Down
      case KEYS.INFO: case 73: return 'INFO';      // I
    }
    return null;
  }

  function launchApp(appId, onError) {
    if (!hasTizen) {
      onError && onError('Demo mode: would open ' + appId);
      return;
    }
    try {
      tizen.application.launch(appId, function () {}, function (err) {
        onError && onError(err && err.message ? err.message : 'Could not open app');
      });
    } catch (e) {
      onError && onError(e.message);
    }
  }

  // Lists apps installed on the TV: [{appId, name, iconPath}]
  function getInstalledApps(cb) {
    if (!hasTizen) {
      cb([
        { appId: '3201907018807', name: 'Netflix' },
        { appId: '3201601007230', name: 'BBC iPlayer' },
        { appId: '121299000089',  name: 'ITVX' },
        { appId: '3201608010191', name: 'Plex' }
      ]);
      return;
    }
    try {
      tizen.application.getAppsInfo(function (list) {
        cb(list.filter(function (a) { return a.show !== false && a.name; })
          .map(function (a) { return { appId: a.id, name: a.name, iconPath: a.iconPath }; })
          .sort(function (a, b) { return a.name.localeCompare(b.name); }));
      }, function () { cb([]); });
    } catch (e) {
      cb([]);
    }
  }

  // Lists channels the TV has scanned: [{name, major, minor}]
  function getTvChannels(cb) {
    if (!hasTuner) {
      cb(hasTizen ? [] : [
        { name: 'BBC One', major: 101, minor: 0 }, { name: 'BBC Two', major: 102, minor: 0 },
        { name: 'ITV1', major: 103, minor: 0 }, { name: 'Channel 4', major: 104, minor: 0 },
        { name: 'Channel 5', major: 105, minor: 0 }, { name: 'BBC News', major: 231, minor: 0 },
        { name: 'Film4', major: 300, minor: 0 }
      ]);
      return;
    }
    try {
      tizen.tvchannel.getChannelList(function (list) {
        cb(list.map(function (c) {
          return { name: c.channelName || ('Channel ' + c.major), major: c.major, minor: c.minor };
        }));
      }, function () { cb([]); }, 'ALL', 0, 2000);
    } catch (e) {
      cb([]);
    }
  }

  function showTvWindow(rect, cb) {
    if (!hasWindow) { cb && cb(false); return; }
    var r = [rect.x + 'px', rect.y + 'px', rect.w + 'px', rect.h + 'px'];
    try {
      tizen.tvwindow.show(function () { tvWindowVisible = true; cb && cb(true); },
        function () { cb && cb(false); }, r, 'MAIN');
    } catch (e) { cb && cb(false); }
  }

  function hideTvWindow() {
    if (!hasWindow || !tvWindowVisible) return;
    try {
      tizen.tvwindow.hide(function () {}, function () {}, 'MAIN');
    } catch (e) {}
    tvWindowVisible = false;
  }

  // Make sure the TV window is showing the tuner (not HDMI etc.)
  function selectTunerSource() {
    if (!hasWindow || !tizen.systeminfo) return;
    try {
      tizen.systeminfo.getPropertyValue('VIDEOSOURCE', function (src) {
        var all = (src.connected || []).concat(src.disconnected || []);
        var tv = all.filter(function (s) { return s.type === 'TV'; })[0];
        if (tv) tizen.tvwindow.setSource(tv, function () {}, function () {}, 'MAIN');
      });
    } catch (e) {}
  }

  /*
   * Tune to a channel. callbacks: {ok(), noSignal(), program(title), fail(msg)}
   * Falls back to opening the TV's own live-TV viewer when tuning isn't permitted.
   */
  function tune(channel, callbacks, fallbackAppId) {
    callbacks = callbacks || {};
    if (!hasTuner) {
      if (hasTizen) {
        launchApp(fallbackAppId, callbacks.fail);
      } else {
        callbacks.ok && callbacks.ok();
        callbacks.program && callbacks.program('Demo programme on ' + channel.name);
      }
      return;
    }
    selectTunerSource();
    try {
      tizen.tvchannel.tune({ major: channel.major, minor: channel.minor || 0 }, {
        onsuccess: function () { callbacks.ok && callbacks.ok(); },
        onnosignal: function () { callbacks.noSignal && callbacks.noSignal(); },
        onprograminforeceived: function (p) { callbacks.program && callbacks.program(p && p.title); }
      }, function (err) {
        // Tuning refused (e.g. missing privilege): hand over to the TV's own viewer.
        launchApp(fallbackAppId, callbacks.fail);
      }, 'MAIN');
    } catch (e) {
      launchApp(fallbackAppId, callbacks.fail);
    }
  }

  // Now / next for one channel: cb({now, next}) — titles may be undefined.
  function getNowNext(channel, cb) {
    if (!hasTuner) {
      if (!hasTizen) cb({ now: 'Evening News', next: 'Quiz Night' });
      else cb({});
      return;
    }
    try {
      tizen.tvchannel.getChannelList(function (list) {
        var info = list.filter(function (c) { return c.major === channel.major && c.minor === (channel.minor || 0); })[0];
        if (!info) { cb({}); return; }
        tizen.tvchannel.getProgramList(info, tizen.time.getCurrentDateTime(), function (progs) {
          cb({ now: progs[0] && progs[0].title, next: progs[1] && progs[1].title });
        }, function () { cb({}); }, 3);
      }, function () { cb({}); }, 'ALL');
    } catch (e) {
      cb({});
    }
  }

  // GET a URL as text. cb(err, text). On the TV, the app's config.xml allows these requests.
  function getText(url, headers, cb) {
    var xhr = new XMLHttpRequest();
    var done = false;
    function finish(err, text) { if (!done) { done = true; cb(err, text); } }
    try {
      xhr.open('GET', url, true);
      xhr.timeout = 12000;
      if (headers) for (var h in headers) xhr.setRequestHeader(h, headers[h]);
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) finish(null, xhr.responseText);
        else finish(new Error('HTTP ' + xhr.status));
      };
      xhr.onerror = function () { finish(new Error('Network error')); };
      xhr.ontimeout = function () { finish(new Error('Timed out')); };
      xhr.send();
    } catch (e) {
      finish(e);
    }
  }

  /*
   * Fix up app IDs by looking for each app by name on the TV. Apps whose ID isn't installed
   * but whose "match" pattern fits an installed app get that app's ID. cb(changed)
   */
  function resolveApps(apps, cb) {
    if (!hasTizen) return cb(false);
    getInstalledApps(function (installed) {
      if (!installed.length) return cb(false);
      var ids = installed.map(function (a) { return a.appId; });
      var changed = false;
      apps.forEach(function (app) {
        if (!app.match || (app.appId && ids.indexOf(app.appId) !== -1)) return;
        var re = new RegExp(app.match, 'i');
        var hit = installed.filter(function (a) { return re.test(a.name); })[0];
        if (hit) { app.appId = hit.appId; changed = true; }
      });
      cb(changed);
    });
  }

  function exit() {
    hideTvWindow();
    if (hasTizen) {
      try { tizen.application.getCurrentApplication().exit(); } catch (e) {}
    }
  }

  function hide() {
    if (hasTizen) {
      try { tizen.application.getCurrentApplication().hide(); } catch (e) {}
    }
  }

  return {
    isTv: hasTizen,
    canTune: hasTuner,
    registerKeys: registerKeys,
    actionFor: actionFor,
    launchApp: launchApp,
    getText: getText,
    resolveApps: resolveApps,
    getInstalledApps: getInstalledApps,
    getTvChannels: getTvChannels,
    showTvWindow: showTvWindow,
    hideTvWindow: hideTvWindow,
    tune: tune,
    getNowNext: getNowNext,
    exit: exit,
    hide: hide
  };
})();
