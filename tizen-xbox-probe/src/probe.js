// Checks whether this TV's web engine has what an Xbox Remote Play client needs.
// Kept to ES2017 (no optional chaining) so it runs on older Tizen Chromium builds.
(function () {
  'use strict';

  var table = document.getElementById('results');
  var results = [];

  function report(name, status, detail, critical) {
    results.push({ name: name, status: status, critical: !!critical });
    var row = table.insertRow();
    var label = { pass: 'PASS', fail: 'FAIL', warn: 'WARN' }[status];
    row.insertCell().textContent = name + (critical ? ' *' : '');
    row.cells[0].className = 'name';
    var cell = row.insertCell();
    cell.className = status;
    cell.textContent = label + (detail ? ' — ' + detail : '');
  }

  function withTimeout(promise, ms) {
    return Promise.race([promise, new Promise(function (_, reject) {
      setTimeout(function () { reject(new Error('timeout')); }, ms);
    })]);
  }

  function checkWebRtc() {
    if (typeof RTCPeerConnection === 'undefined') {
      report('WebRTC', 'fail', 'missing', true);
      report('H.264 in WebRTC', 'fail', 'needs WebRTC', true);
      report('Data channels', 'fail', 'needs WebRTC', true);
      return Promise.resolve();
    }
    report('WebRTC', 'pass', '', true);

    var pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    try {
      pc.createDataChannel('input');
      report('Data channels', 'pass', '', true);
    } catch (e) {
      report('Data channels', 'fail', e.message, true);
    }

    var srflx = false;
    var gathered = new Promise(function (resolve) {
      pc.onicecandidate = function (ev) {
        if (!ev.candidate) { resolve(); return; }
        if (ev.candidate.candidate.indexOf(' srflx ') !== -1) srflx = true;
      };
    });

    if (pc.addTransceiver) {
      try {
        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.addTransceiver('audio', { direction: 'recvonly' });
      } catch (e) { /* fall back to offer options below */ }
    }

    return pc.createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: true })
      .then(function (offer) {
        var sdp = offer.sdp;
        var has = function (codec) { return new RegExp('a=rtpmap:\\d+ ' + codec + '/', 'i').test(sdp); };
        report('H.264 in WebRTC', has('H264') ? 'pass' : 'fail', '', true);
        var others = ['VP8', 'VP9', 'AV1X', 'AV1'].filter(has);
        report('Other video codecs', 'pass', others.join(', ') || 'none');
        report('Opus audio', has('opus') ? 'pass' : 'warn', has('opus') ? '' : 'no audio codec');
        return pc.setLocalDescription(offer);
      })
      .then(function () { return withTimeout(gathered, 8000).catch(function () {}); })
      .then(function () {
        report('ICE / STUN', srflx ? 'pass' : 'warn',
          srflx ? 'public address found' : 'no public candidate (LAN play may still work)');
        pc.close();
      })
      .catch(function (e) {
        report('H.264 in WebRTC', 'fail', 'createOffer failed: ' + e.message, true);
      });
  }

  function checkMedia() {
    var v = document.createElement('video');
    var h264 = v.canPlayType('video/mp4; codecs="avc1.640028"');
    report('H.264 High decode (<video>)', h264 ? 'pass' : 'warn', h264 || 'not reported');
    var hasMse = typeof MediaSource !== 'undefined';
    report('Media Source Extensions', hasMse ? 'pass' : 'warn', '');
  }

  function checkApis() {
    report('Gamepad API', navigator.getGamepads ? 'pass' : 'fail', '', true);
    report('fetch / Promise', typeof fetch === 'function' ? 'pass' : 'fail', '', true);
    report('WebSocket', typeof WebSocket === 'function' ? 'pass' : 'warn', '');
    var subtle = window.crypto && window.crypto.subtle;
    report('WebCrypto', subtle ? 'pass' : 'warn', subtle ? '' : 'sign-in may need a JS fallback');
  }

  // Can the app talk to Microsoft directly? A normal fetch succeeding means CORS isn't
  // in the way; an opaque no-cors response means reachable but CORS-restricted.
  function checkHost(label, url) {
    return withTimeout(fetch(url, { method: 'GET' }), 8000)
      .then(function (res) { report(label, 'pass', 'readable (HTTP ' + res.status + ')'); })
      .catch(function () {
        return withTimeout(fetch(url, { mode: 'no-cors' }), 8000)
          .then(function () { report(label, 'warn', 'reachable but CORS-blocked'); })
          .catch(function (e) { report(label, 'fail', 'unreachable (' + e.message + ')'); });
      });
  }

  function showDevice() {
    var lines = ['UA: ' + navigator.userAgent, 'Screen: ' + screen.width + 'x' + screen.height];
    try {
      lines.push('Model: ' + webapis.productinfo.getRealModel());
      lines.push('Firmware: ' + webapis.productinfo.getFirmware());
    } catch (e) {
      lines.push('webapis.productinfo unavailable');
    }
    document.getElementById('device').textContent = lines.join('\n');
  }

  function watchGamepad() {
    var status = document.getElementById('pad-status');
    var buttons = document.getElementById('pad-buttons');
    var axes = document.getElementById('pad-axes');
    if (!navigator.getGamepads) { status.textContent = 'Gamepad API not available.'; return; }

    var built = 0;
    (function poll() {
      var pads = navigator.getGamepads();
      var pad = null;
      for (var i = 0; i < pads.length; i++) if (pads[i]) { pad = pads[i]; break; }
      if (pad) {
        status.textContent = pad.id + ' (mapping: ' + (pad.mapping || 'none') + ')';
        if (built !== pad.buttons.length) {
          buttons.innerHTML = '';
          for (var b = 0; b < pad.buttons.length; b++) {
            var s = document.createElement('span');
            s.textContent = b;
            buttons.appendChild(s);
          }
          built = pad.buttons.length;
        }
        for (var j = 0; j < pad.buttons.length; j++) {
          buttons.children[j].className = pad.buttons[j].pressed ? 'on' : '';
        }
        axes.textContent = 'Axes: ' + Array.prototype.map.call(pad.axes, function (a) {
          return a.toFixed(2);
        }).join('  ');
      }
      requestAnimationFrame(poll);
    })();
  }

  function showVerdict() {
    var critical = results.filter(function (r) { return r.critical; });
    var failed = critical.filter(function (r) { return r.status !== 'pass'; });
    var verdict = document.getElementById('verdict');
    if (failed.length === 0) {
      verdict.textContent = 'Looks promising: every required (*) check passed.';
      verdict.className = 'pass';
    } else {
      verdict.textContent = 'Blocked: ' + failed.map(function (r) { return r.name; }).join(', ');
      verdict.className = 'fail';
    }
  }

  document.addEventListener('keydown', function (e) {
    if (e.keyCode === 10009) {
      try { tizen.application.getCurrentApplication().exit(); } catch (err) { /* not on a TV */ }
    }
  });

  showDevice();
  watchGamepad();
  checkApis();
  checkMedia();
  checkWebRtc()
    .then(function () { return checkHost('login.live.com', 'https://login.live.com/'); })
    .then(function () { return checkHost('Xbox streaming (xhome)', 'https://xhome.gssv-play-prod.xboxlive.com/'); })
    .then(showVerdict);
})();
