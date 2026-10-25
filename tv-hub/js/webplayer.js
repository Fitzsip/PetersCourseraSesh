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
    NAME: NAME, start: start, stop: stop, activate: activate,
    deviceId: function () { return deviceId; },
    status: function () { return status; },
    error: function () { return error; },
    onChange: function (f) { listeners.push(f); }
  };
})();
