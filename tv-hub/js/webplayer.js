/*
 * Experimental: makes TV Hub itself a Spotify Connect speaker ("TV Hub (this TV)") with
 * Spotify's Web Playback SDK, so music plays through the TV while you use TV Hub.
 * Spotify only officially supports desktop browsers for this, so on a TV it may refuse; if so,
 * status() is 'failed' and error() says why, and TV Hub falls back to the Spotify app.
 */
var WebPlayer = (function () {
  var SDK = 'https://sdk.scdn.co/spotify-player.js';
  var NAME = 'TV Hub (this TV)';
  var player = null, deviceId = null, status = 'off', error = '', scriptLoaded = false, timer = null;
  var listeners = [];

  function notify() { listeners.forEach(function (f) { try { f(); } catch (e) {} }); }
  function fail(msg) {
    clearTimeout(timer);
    status = 'failed';
    error = error || msg;
    deviceId = null;
    notify();
  }

  function start() {
    if (status === 'starting' || status === 'ready' || !SpotifyApi.canStream()) return;
    status = 'starting';
    error = '';
    notify();
    clearTimeout(timer);
    timer = setTimeout(function () { if (status === 'starting') fail('Spotify’s player didn’t start on this TV'); }, 25000);
    if (window.Spotify && window.Spotify.Player) return create();
    window.onSpotifyWebPlaybackSDKReady = create;
    if (scriptLoaded) return;
    scriptLoaded = true;
    var sc = document.createElement('script');
    sc.src = SDK;
    sc.onerror = function () { scriptLoaded = false; fail('Couldn’t load Spotify’s player — check the internet connection'); };
    document.head.appendChild(sc);
  }

  function create() {
    if (player) return reconnect();
    try {
      player = new window.Spotify.Player({
        name: NAME, volume: 0.8,
        getOAuthToken: function (cb) { SpotifyApi.token(function (t) { if (t) cb(t); }); }
      });
    } catch (e) {
      player = null;
      return fail('This TV can’t run Spotify’s player (' + e.message + ')');
    }
    player.addListener('ready', function (d) {
      clearTimeout(timer);
      deviceId = d.device_id;
      status = 'ready';
      error = '';
      notify();
    });
    player.addListener('not_ready', function () { deviceId = null; status = 'starting'; notify(); });
    player.addListener('player_state_changed', function () { notify(); });
    player.addListener('initialization_error', function (e) { fail('This TV’s browser can’t play Spotify (' + (e && e.message) + ')'); });
    player.addListener('authentication_error', function (e) { fail('Spotify sign-in problem — reconnect Spotify (' + (e && e.message) + ')'); });
    player.addListener('account_error', function () { fail('Playing on this TV needs Spotify Premium'); });
    player.addListener('playback_error', function (e) { error = 'Playback problem: ' + (e && e.message); notify(); });
    player.addListener('autoplay_failed', function () { error = 'The TV blocked the sound until a button is pressed'; notify(); });
    reconnect();
  }

  function reconnect() {
    try {
      player.connect().then(function (ok) { if (!ok) fail('Spotify refused to connect this TV as a speaker'); });
    } catch (e) {
      fail(e.message);
    }
  }

  // Browsers only allow audio after a button press; call this from one.
  function activate() {
    try { if (player && player.activateElement) player.activateElement(); } catch (e) {}
  }

  // Unlock sound and nudge the player, for when Spotify says it's playing here but nothing is heard.
  function resume() {
    activate();
    try { if (player) player.resume(); } catch (e) {}
  }

  // What this TV can do, for the Sound check screen. cb(list of [label, result]), in a fixed order.
  function diagnose(cb) {
    var rows = [], left = 1;
    function add(label) { var r = [label, '…']; rows.push(r); left++; return function (v) { r[1] = v; if (--left === 0) cb(rows); }; }
    function codec(t) { try { return !!(window.MediaSource && MediaSource.isTypeSupported(t)); } catch (e) { return false; } }
    rows.push(['Spotify’s player', { ready: 'Connected', starting: 'Starting', failed: 'Failed', off: 'Off' }[status]]);
    if (error) rows.push(['Last problem', error]);
    rows.push(['Audio formats MP4 / WebM / FLAC', ['audio/mp4; codecs="mp4a.40.2"', 'audio/webm; codecs="vorbis"', 'audio/mp4; codecs="flac"']
      .map(function (t) { return codec(t) ? 'yes' : 'no'; }).join(' / ')]);
    [['com.widevine.alpha', 'Protected audio: Widevine (Spotify needs this)'], ['com.microsoft.playready', 'Protected audio: PlayReady']].forEach(function (k) {
      var set = add(k[1]);
      try {
        navigator.requestMediaKeySystemAccess(k[0], [{ initDataTypes: ['cenc'], audioCapabilities: [{ contentType: 'audio/mp4; codecs="mp4a.40.2"' }] }])
          .then(function () { set('yes'); }, function (e) { set('no (' + ((e && e.name) || 'refused') + ')'); });
      } catch (e) { set('not available'); }
    });
    var setState = add('Player state'), setVol = add('Player volume');
    if (!player) { setState('none'); setVol('—'); }
    else {
      try {
        player.getCurrentState().then(function (st) {
          setState(st ? (st.paused ? 'paused' : 'playing') + ' at ' + Math.round(st.position / 1000) + ' s' : 'not playing here');
        }, function () { setState('unknown'); });
        player.getVolume().then(function (v) { setVol(Math.round(v * 100) + '%'); }, function () { setVol('unknown'); });
      } catch (e) { setState('error'); setVol('error'); }
    }
    if (--left === 0) cb(rows);
  }

  // A short beep through the TV's speakers, to check web audio works at all.
  function beep() {
    try {
      var C = window.AudioContext || window.webkitAudioContext, ctx = new C(), o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 660; g.gain.value = 0.3;
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.8);
      setTimeout(function () { try { ctx.close(); } catch (e) {} }, 1500);
      return true;
    } catch (e) { return false; }
  }

  function stop() {
    clearTimeout(timer);
    try { if (player) player.disconnect(); } catch (e) {}
    player = null;
    deviceId = null;
    status = 'off';
    error = '';
    notify();
  }

  return {
    NAME: NAME, start: start, stop: stop, activate: activate, resume: resume, diagnose: diagnose, beep: beep,
    deviceId: function () { return deviceId; },
    status: function () { return status; },
    error: function () { return error; },
    onChange: function (f) { listeners.push(f); }
  };
})();
