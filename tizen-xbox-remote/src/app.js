// Runs the sign-in chain step by step and shows where it succeeds or stops,
// so a failure on the TV can be diagnosed from a photo of the screen.
(function () {
  'use strict';

  var config = window.APP_CONFIG || {};
  var streamingSession = null;
  var readyConsole = null;
  var stream = null;
  var mode = 'signin'; // signin | ready | stream
  var MAX_RECONNECTS = 3;
  var reconnects = 0;
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
        // Signed in and the console is reachable: go straight to the stream.
        startStreaming();
      })
      .catch(function (err) {
        var name = STEPS.filter(function (s) { return s[0] === err.stepId; })[0];
        setSummary('Stopped at: ' + (name ? name[1] : 'unknown step') + '. Photo this screen.', 'fail');
      });
  }

  function showReady() {
    setSummary('Ready: press A (or OK) to stream ' + readyConsole.deviceName + '.', 'ok');
  }

  var streamEl = document.getElementById('stream');
  var streamLog = document.getElementById('stream-log');
  var streamStats = document.getElementById('stream-stats');
  var streamStatus = document.getElementById('stream-status');
  var video = document.getElementById('stream-video');
  var audio = document.getElementById('stream-audio');

  function streamLogLine(text, cls) {
    var line = document.createElement('div');
    line.textContent = text;
    if (cls) line.className = cls;
    streamLog.appendChild(line);
    streamLog.scrollTop = streamLog.scrollHeight;
  }

  function setStatus(text) {
    streamStatus.textContent = text || '';
    streamStatus.hidden = !text;
  }

  function startStreaming() {
    mode = 'stream';
    reconnects = 0;
    document.body.className = 'streaming';
    streamEl.hidden = false;
    streamLog.innerHTML = '';
    streamLog.hidden = true;
    connect();
  }

  // One connection attempt. A lost connection comes back through onEnded and retries.
  function connect() {
    streamStats.textContent = '';
    setStatus(reconnects ? 'Reconnecting to ' + readyConsole.deviceName + ' (' + reconnects + '/' + MAX_RECONNECTS + ')\u2026'
      : 'Connecting to ' + readyConsole.deviceName + '\u2026');

    var current = stream = new XboxStream.Stream(streamingSession, readyConsole.serverId, {
      log: streamLogLine,
      video: video,
      audio: audio,
      onStats: function (text) { streamStats.textContent = text; },
      onEnded: function (reason) { if (current === stream) connectionLost(reason); }
    });
    video.onplaying = function () {
      reconnects = 0;
      setStatus('');
    };
    current.start().catch(function (err) {
      if (current !== stream) return;
      streamLogLine(err.message, 'fail');
      // An expired streaming login can't be fixed by retrying; sign in again from scratch.
      if (/HTTP 401/.test(err.message)) { window.location.reload(); return; }
      connectionLost(err.message);
    });
  }

  function connectionLost(reason) {
    if (mode !== 'stream') return;
    if (stream) stream.stop();
    if (reconnects >= MAX_RECONNECTS) {
      setStatus('Could not reconnect. Press A to try again, or BACK to return.');
      streamLog.hidden = false;
      stream = null;
      return;
    }
    reconnects++;
    streamLogLine('Connection lost: ' + reason + '. Retrying\u2026', 'warn');
    setStatus('Connection lost. Reconnecting (' + reconnects + '/' + MAX_RECONNECTS + ')\u2026');
    stream = null;
    setTimeout(function () { if (mode === 'stream' && !stream) connect(); }, 2000 * reconnects);
  }

  function stopStreaming() {
    var s = stream;
    stream = null;
    if (s) s.stop();
    video.onplaying = null;
    video.srcObject = null;
    audio.srcObject = null;
    setStatus('');
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
    } else if (e.keyCode === 403 && mode !== 'stream') {
      restart();
    } else if (e.keyCode === 404 && mode === 'stream') {
      streamLog.hidden = !streamLog.hidden;
    }
  });

  // While streaming, the controller goes to the Xbox; otherwise A starts and Y signs out.
  // After reconnects run out, A on the "Could not reconnect" screen tries again.
  var wasDown = {};
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
      if (mode === 'stream' && stream) {
        stream.sendGamepad(pad);
      } else {
        var a = pressed(pad, 0);
        var y = pressed(pad, 3);
        if (mode === 'stream' && a) { reconnects = 0; streamLog.hidden = true; connect(); }
        if (y && mode !== 'stream') { restart(); return; }
        if (a && mode === 'ready') startStreaming();
      }
    }
    requestAnimationFrame(pollPad);
  })();

  run();
})();
