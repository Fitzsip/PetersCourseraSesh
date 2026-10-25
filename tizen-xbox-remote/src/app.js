// Runs the sign-in chain step by step and shows where it succeeds or stops,
// so a failure on the TV can be diagnosed from a photo of the screen.
(function () {
  'use strict';

  var config = window.APP_CONFIG || {};
  var streamingSession = null;
  var readyConsole = null;
  var stream = null;
  var mode = 'signin'; // signin | ready | stream

  // Highest controller-protocol version offered to the console; switchable on the Ready
  // screen so different versions can be tried without reinstalling.
  var INPUT_VERSIONS = [8, 6, 4, 2, 1];
  var INPUT_VERSION_KEY = 'xboxRemote.inputMaxVersion';
  var inputMaxVersion = 8;
  try {
    var saved = parseInt(window.localStorage.getItem(INPUT_VERSION_KEY), 10);
    if (INPUT_VERSIONS.indexOf(saved) !== -1) inputMaxVersion = saved;
  } catch (e) { /* storage unavailable */ }
  var stepsEl = document.getElementById('steps');
  var summaryEl = document.getElementById('summary');

  var STEPS = [
    ['ms', 'Microsoft sign-in'],
    ['user', 'Xbox Live user token'],
    ['profile', 'Xbox Live profile'],
    ['devices', 'Consoles on your account'],
    ['gssv', 'Remote Play authorization'],
    ['stream', 'Remote Play login'],
    ['servers', 'Remote Play consoles']
  ];
  var stepEls = {};

  STEPS.forEach(function (s) {
    var li = document.createElement('li');
    li.className = 'pending';
    li.textContent = s[1];
    var detail = document.createElement('span');
    detail.className = 'detail';
    li.appendChild(detail);
    stepsEl.appendChild(li);
    stepEls[s[0]] = li;
  });

  function setStep(id, state, detail) {
    var li = stepEls[id];
    li.className = state;
    li.lastChild.textContent = detail || '';
  }

  // Runs one step, marking it running/ok/fail. Failures propagate unless optional.
  function step(id, fn, optional) {
    setStep(id, 'running');
    return Promise.resolve().then(fn).then(function (result) {
      setStep(id, 'ok', result && result.detail);
      return result;
    }, function (err) {
      setStep(id, 'fail', err.message);
      if (optional) return null;
      err.stepId = id;
      throw err;
    });
  }

  function setSummary(text, cls) {
    summaryEl.textContent = text;
    summaryEl.className = cls || '';
  }

  function renderConsoles(items, describe) {
    var ul = document.getElementById('consoles');
    ul.innerHTML = '';
    if (!items.length) {
      ul.innerHTML = '<li class="muted">None found</li>';
      return;
    }
    items.forEach(function (c) {
      var li = document.createElement('li');
      li.textContent = describe(c);
      ul.appendChild(li);
    });
  }

  // The QR opens the plain sign-in page. Pre-filling the code with ?otc= sends Microsoft
  // down its first-party app flow, which rejects third-party apps with a consent error.
  function showSignInQr(code) {
    var link = code.verificationUriComplete || code.verificationUri;
    try {
      var qr = qrcode(0, 'M');
      qr.addData(link);
      qr.make();
      document.getElementById('signin-qr').src = qr.createDataURL(8, 4);
    } catch (e) {
      document.getElementById('signin-qr').hidden = true;
    }
  }

  function msSignIn() {
    return XboxAuth.refreshMicrosoftToken(config.clientId).then(function (token) {
      if (token) return { token: token, detail: 'restored saved session' };
      var box = document.getElementById('signin');
      return XboxAuth.deviceCodeSignIn(config.clientId, function (code) {
        document.getElementById('signin-url').textContent = code.verificationUri.replace(/^https:\/\//, '');
        document.getElementById('signin-code').textContent = code.userCode;
        showSignInQr(code);
        box.hidden = false;
        setSummary('Waiting for you to sign in on your phone…', 'running');
      }).then(function (t) {
        box.hidden = true;
        return { token: t, detail: 'signed in' };
      });
    });
  }

  function run() {
    if (!config.clientId) {
      setSummary('No app ID configured. Rebuild with ./build.sh <client-id>.', 'fail');
      return;
    }
    setSummary('Signing in…', 'running');

    var userToken, xboxLive, streaming;
    step('ms', msSignIn)
      .then(function (ms) {
        return step('user', function () {
          return XboxAuth.xboxUserToken(ms.token).then(function (t) { userToken = t; });
        });
      })
      .then(function () {
        return step('profile', function () {
          return XboxAuth.xsts('Xbox Live profile', userToken, 'http://xboxlive.com').then(function (x) {
            xboxLive = x;
            document.getElementById('gamertag').textContent = x.gamertag || '(gamertag not returned)';
            return { detail: x.gamertag ? 'gamertag ' + x.gamertag : '' };
          });
        });
      })
      .then(function () {
        return step('devices', function () {
          return XboxAuth.listAccountConsoles(xboxLive).then(function (list) {
            renderConsoles(list, function (c) {
              return (c.name || 'Unnamed') + ' — ' + (c.consoleType || '?') + ', ' + (c.powerState || '?');
            });
            return { detail: list.length + ' found' };
          });
        }, true);
      })
      .then(function () {
        return step('gssv', function () {
          return XboxAuth.xsts('Remote Play authorization', userToken, 'http://gssv.xboxlive.com/')
            .then(function (x) { streaming = x; });
        });
      })
      .then(function () {
        return step('stream', function () {
          return XboxAuth.streamingLogin(streaming.token).then(function (s) {
            streaming.session = s;
            return { detail: 'region ' + s.baseUri.replace(/^https:\/\//, '') };
          });
        });
      })
      .then(function () {
        return step('servers', function () {
          return XboxAuth.listStreamingConsoles(streaming.session).then(function (list) {
            renderConsoles(list, function (c) {
              return c.deviceName + ' — ' + c.consoleType + ', ' + c.powerState;
            });
            if (!list.length) throw new Error('No consoles available for Remote Play. Turn on Remote features on the Xbox.');
            readyConsole = list[0];
            streamingSession = streaming.session;
            return { detail: list.length + ' ready' };
          });
        });
      })
      .then(function () {
        mode = 'ready';
        showReady();
      })
      .catch(function (err) {
        var name = STEPS.filter(function (s) { return s[0] === err.stepId; })[0];
        setSummary('Stopped at: ' + (name ? name[1] : 'unknown step') + '. Photo this screen.', 'fail');
      });
  }

  function showReady() {
    setSummary('Ready: press A (or OK) to stream ' + readyConsole.deviceName +
      '. Controller protocol: up to v' + inputMaxVersion + ' (\u2190 \u2192 to change)', 'ok');
  }

  // Debounced because the TV may also turn controller d-pad presses into arrow keys.
  var lastCycle = 0;
  function cycleInputVersion(step) {
    if (Date.now() - lastCycle < 250) return;
    lastCycle = Date.now();
    var i = INPUT_VERSIONS.indexOf(inputMaxVersion);
    inputMaxVersion = INPUT_VERSIONS[(i + step + INPUT_VERSIONS.length) % INPUT_VERSIONS.length];
    try { window.localStorage.setItem(INPUT_VERSION_KEY, String(inputMaxVersion)); } catch (e) { /* storage unavailable */ }
    showReady();
  }

  var streamEl = document.getElementById('stream');
  var streamLog = document.getElementById('stream-log');
  var streamStats = document.getElementById('stream-stats');
  var logHideTimer = null;

  function streamLogLine(text, cls) {
    var line = document.createElement('div');
    line.textContent = text;
    if (cls) line.className = cls;
    streamLog.appendChild(line);
    streamLog.scrollTop = streamLog.scrollHeight;
  }

  function startStreaming() {
    mode = 'stream';
    document.body.className = 'streaming';
    streamEl.hidden = false;
    streamLog.innerHTML = '';
    streamLog.hidden = false;
    streamStats.textContent = '';
    var video = document.getElementById('stream-video');

    stream = new XboxStream.Stream(streamingSession, readyConsole.serverId, {
      log: streamLogLine,
      video: video,
      audio: document.getElementById('stream-audio'),
      onStats: function (text) { streamStats.textContent = text; },
      problem: function () {
        clearTimeout(logHideTimer);
        streamLog.hidden = false;
      }
    }, { inputMaxVersion: inputMaxVersion });
    streamLogLine('Offering controller protocol up to v' + inputMaxVersion);
    // Once frames are showing, tuck the log away; green button brings it back.
    video.onplaying = function () {
      streamLogLine('Video playing', 'ok');
      clearTimeout(logHideTimer);
      logHideTimer = setTimeout(function () { streamLog.hidden = true; }, 8000);
    };
    stream.start().catch(function (err) {
      streamLogLine(err.message, 'fail');
      streamLogLine('Photo this screen. Press BACK to return.', 'fail');
      streamLog.hidden = false;
    });
  }

  function stopStreaming() {
    if (stream) stream.stop();
    stream = null;
    clearTimeout(logHideTimer);
    var video = document.getElementById('stream-video');
    video.onplaying = null;
    video.srcObject = null;
    document.getElementById('stream-audio').srcObject = null;
    streamEl.hidden = true;
    document.body.className = '';
    mode = 'ready';
    showReady();
  }

  function restart() {
    XboxAuth.signOut();
    window.location.reload();
  }

  try {
    tizen.tvinputdevice.registerKey('ColorF0Red');
    tizen.tvinputdevice.registerKey('ColorF1Green');
  } catch (e) { /* not on a TV */ }

  document.addEventListener('keydown', function (e) {
    if (e.keyCode === 10009) {
      if (mode === 'stream') { stopStreaming(); return; }
      try { tizen.application.getCurrentApplication().exit(); } catch (err) { /* not on a TV */ }
    } else if (e.keyCode === 13 && mode === 'ready') {
      startStreaming();
    } else if ((e.keyCode === 37 || e.keyCode === 39) && mode === 'ready') {
      cycleInputVersion(e.keyCode === 39 ? 1 : -1);
    } else if (e.keyCode === 403 && mode !== 'stream') {
      restart();
    } else if (e.keyCode === 404 && mode === 'stream') {
      streamLog.hidden = !streamLog.hidden;
    }
  });

  // While streaming, the controller goes to the Xbox; otherwise A starts and Y restarts.
  var wasDown = {};
  var sendFailed = false;
  function pressed(pad, index) {
    var down = !!(pad.buttons[index] && pad.buttons[index].pressed);
    var rising = down && !wasDown[index];
    wasDown[index] = down;
    return rising;
  }
  (function pollPad() {
    var pads = navigator.getGamepads ? navigator.getGamepads() : [];
    var pad = null;
    for (var i = 0; i < pads.length; i++) if (pads[i]) { pad = pads[i]; break; }
    if (pad) {
      if (mode === 'stream') {
        try {
          stream.sendGamepad(pad);
        } catch (err) {
          if (!sendFailed) streamLogLine('Controller send failed: ' + err.message, 'fail');
          sendFailed = true;
        }
      } else {
        var a = pressed(pad, 0);
        var y = pressed(pad, 3);
        var left = pressed(pad, 14);
        var right = pressed(pad, 15);
        if (y) { restart(); return; }
        if (mode === 'ready' && (left || right)) cycleInputVersion(right ? 1 : -1);
        if (a && mode === 'ready') startStreaming();
      }
    }
    requestAnimationFrame(pollPad);
  })();

  run();
})();
