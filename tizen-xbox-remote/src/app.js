// Runs the sign-in chain step by step and shows where it succeeds or stops,
// so a failure on the TV can be diagnosed from a photo of the screen.
(function () {
  'use strict';

  var config = window.APP_CONFIG || {};
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

  function msSignIn() {
    return XboxAuth.refreshMicrosoftToken(config.clientId).then(function (token) {
      if (token) return { token: token, detail: 'restored saved session' };
      var box = document.getElementById('signin');
      return XboxAuth.deviceCodeSignIn(config.clientId, function (code) {
        document.getElementById('signin-url').textContent = code.verificationUri.replace(/^https:\/\//, '');
        document.getElementById('signin-code').textContent = code.userCode;
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
            return { detail: list.length + ' ready' };
          });
        });
      })
      .then(function () {
        setSummary('Ready: Remote Play accepted this app. Next step is streaming.', 'ok');
      })
      .catch(function (err) {
        var name = STEPS.filter(function (s) { return s[0] === err.stepId; })[0];
        setSummary('Stopped at: ' + (name ? name[1] : 'unknown step') + '. Photo this screen.', 'fail');
      });
  }

  function restart() {
    XboxAuth.signOut();
    window.location.reload();
  }

  try { tizen.tvinputdevice.registerKey('ColorF0Red'); } catch (e) { /* not on a TV */ }
  document.addEventListener('keydown', function (e) {
    if (e.keyCode === 10009) {
      try { tizen.application.getCurrentApplication().exit(); } catch (err) { /* not on a TV */ }
    } else if (e.keyCode === 403) {
      restart();
    }
  });

  // Y on the controller (standard mapping button 3) signs out and starts again.
  var yWasDown = false;
  (function pollPad() {
    var pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (var i = 0; i < pads.length; i++) {
      if (!pads[i]) continue;
      var yDown = pads[i].buttons[3] && pads[i].buttons[3].pressed;
      if (yDown && !yWasDown) { restart(); return; }
      yWasDown = !!yDown;
      break;
    }
    requestAnimationFrame(pollPad);
  })();

  run();
})();
