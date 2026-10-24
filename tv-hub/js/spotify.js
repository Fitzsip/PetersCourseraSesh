/*
 * Spotify remote control through Spotify's official Web API (needs Spotify Premium).
 *
 * Pairing, without typing anything long on the TV:
 *   1. You create a free app at developer.spotify.com with the redirect URI below and give
 *      TV Hub its Client ID.
 *   2. TV Hub shows a QR code with Spotify's sign-in link. You approve on your phone; the phone
 *      then lands on 127.0.0.1/callback?code=..., which won't load, and that's expected.
 *   3. You paste that address into TV Hub (e.g. with Apps2Samsung's remote typing) and TV Hub
 *      swaps the code for its own tokens (PKCE, so no secret is needed).
 *
 * Tokens are kept in their own storage key, separate from the settings backup.
 */
var Spotify = (function () {
  var STORE = 'tvhub.spotify';
  var REDIRECT = 'http://127.0.0.1:8888/callback';
  var SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing ' +
    'playlist-read-private playlist-read-collaborative user-read-recently-played';
  var API = 'https://api.spotify.com/v1';

  var s = load();
  function load() {
    try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; }
  }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch (e) {} }

  // ---- SHA-256 (older TVs don't offer crypto.subtle to apps), for the PKCE challenge
  function sha256(ascii) {
    function rr(v, n) { return (v >>> n) | (v << (32 - n)); }
    var K = [], H = [], i, j, isComposite = {};
    for (var cand = 2, n = 0; n < 64; cand++) {
      if (isComposite[cand]) continue;
      for (i = 0; i < 313; i += cand) isComposite[i] = cand;
      if (n < 8) H[n] = (Math.pow(cand, 0.5) * 4294967296) | 0;
      K[n++] = (Math.pow(cand, 1 / 3) * 4294967296) | 0;
    }
    var bytes = [];
    for (i = 0; i < ascii.length; i++) bytes.push(ascii.charCodeAt(i) & 0xff);
    var bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (i = 7; i >= 0; i--) bytes.push(i > 3 ? 0 : (bitLen >>> (i * 8)) & 0xff);
    for (j = 0; j < bytes.length; j += 64) {
      var w = [];
      for (i = 0; i < 16; i++) w[i] = (bytes[j + i * 4] << 24) | (bytes[j + i * 4 + 1] << 16) | (bytes[j + i * 4 + 2] << 8) | bytes[j + i * 4 + 3];
      for (i = 16; i < 64; i++) {
        var s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        var s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i++) {
        var t1 = (h + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        var t2 = ((rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H = [(H[0] + a) | 0, (H[1] + b) | 0, (H[2] + c) | 0, (H[3] + d) | 0, (H[4] + e) | 0, (H[5] + f) | 0, (H[6] + g) | 0, (H[7] + h) | 0];
    }
    var out = [];
    for (i = 0; i < 8; i++) for (j = 3; j >= 0; j--) out.push((H[i] >>> (j * 8)) & 0xff);
    return out;
  }
  function base64url(bytes) {
    return btoa(String.fromCharCode.apply(null, bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function randomString(len) {
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    var vals = new Uint8Array(len);
    (window.crypto || window.msCrypto).getRandomValues(vals);
    var out = '';
    for (var i = 0; i < len; i++) out += chars[vals[i] % chars.length];
    return out;
  }

  function form(obj) {
    return Object.keys(obj).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]); }).join('&');
  }

  // ---- pairing

  function setClientId(id) {
    s.clientId = String(id || '').replace(/[^0-9a-f]/gi, '');
    save();
    return s.clientId.length === 32;
  }

  // A fresh sign-in link (also starts a new pairing attempt).
  function authUrl() {
    s.verifier = randomString(64);
    save();
    return 'https://accounts.spotify.com/authorize?' + form({
      response_type: 'code', client_id: s.clientId, scope: SCOPES, redirect_uri: REDIRECT,
      code_challenge_method: 'S256', code_challenge: base64url(sha256(s.verifier))
    });
  }

  function storeTokens(t) {
    s.accessToken = t.access_token;
    s.expiresAt = Date.now() + (t.expires_in || 3600) * 1000;
    if (t.refresh_token) s.refreshToken = t.refresh_token;
    save();
  }

  // pasted: the 127.0.0.1 address from the phone (or just the code). cb(errorMessage or null)
  function finishPairing(pasted, cb) {
    var text = String(pasted || '').trim();
    var err = /[?&]error=([^&\s]+)/.exec(text);
    if (err) return cb('Spotify said: ' + decodeURIComponent(err[1]) + '. Try signing in again.');
    var m = /[?&]code=([^&\s#]+)/.exec(text);
    var code = m ? decodeURIComponent(m[1]) : (/^[A-Za-z0-9_-]{40,}$/.test(text) ? text : null);
    if (!code) return cb('That doesn’t look like the address from your phone. It should contain “code=”.');
    if (!s.verifier) return cb('Start again: show the QR code and sign in once more.');
    Platform.request('POST', 'https://accounts.spotify.com/api/token', { 'Content-Type': 'application/x-www-form-urlencoded' },
      form({ grant_type: 'authorization_code', code: code, redirect_uri: REDIRECT, client_id: s.clientId, code_verifier: s.verifier }),
      function (e, body) {
        var data = parse(body);
        if (e || !data || !data.access_token) {
          return cb((data && (data.error_description || data.error)) ? 'Spotify said: ' + (data.error_description || data.error) : 'Couldn’t reach Spotify — check the internet connection');
        }
        delete s.verifier;
        storeTokens(data);
        cb(null);
      });
  }

  function isPaired() { return !!s.refreshToken; }
  function clientId() { return s.clientId || ''; }
  function unpair() { s = { clientId: s.clientId }; save(); }

  // ---- API calls

  function parse(text) { try { return text ? JSON.parse(text) : null; } catch (e) { return null; } }

  var refreshing = null;
  function refresh(cb) {
    if (refreshing) return refreshing.push(cb);
    refreshing = [cb];
    Platform.request('POST', 'https://accounts.spotify.com/api/token', { 'Content-Type': 'application/x-www-form-urlencoded' },
      form({ grant_type: 'refresh_token', refresh_token: s.refreshToken, client_id: s.clientId }),
      function (e, body) {
        var data = parse(body);
        var msg = null;
        if (data && data.access_token) storeTokens(data);
        else if (data && data.error === 'invalid_grant') { unpair(); msg = 'Spotify sign-in expired — connect again in Settings'; }
        else msg = 'Couldn’t reach Spotify';
        var cbs = refreshing;
        refreshing = null;
        cbs.forEach(function (f) { f(msg); });
      });
  }

  // cb(errorMessage, data, status). Refreshes the access token as needed.
  function call(method, path, body, cb, retried) {
    cb = cb || function () {};
    if (!isPaired()) return cb('Spotify isn’t connected yet');
    if (!s.accessToken || Date.now() > s.expiresAt - 60000) {
      return refresh(function (msg) { if (msg) return cb(msg); call(method, path, body, cb, true); });
    }
    var headers = { Authorization: 'Bearer ' + s.accessToken };
    if (body) headers['Content-Type'] = 'application/json';
    Platform.request(method, API + path, headers, body ? JSON.stringify(body) : null, function (e, text, status) {
      var data = parse(text);
      if (status === 401 && !retried) { s.expiresAt = 0; return call(method, path, body, cb, true); }
      if (!e) return cb(null, data, status);
      var reason = data && data.error && (data.error.reason || data.error.message);
      cb(MESSAGES[reason] || (status === 403 ? 'Spotify refused — this needs Spotify Premium' : 'Spotify: ' + (reason || e.message)), data, status);
    });
  }

  var MESSAGES = {
    NO_ACTIVE_DEVICE: 'Nothing is playing — pick a device to play on',
    PREMIUM_REQUIRED: 'Controlling Spotify needs Spotify Premium',
    UNKNOWN: 'Spotify couldn’t do that right now'
  };

  function q(deviceId) { return deviceId ? '?device_id=' + encodeURIComponent(deviceId) : ''; }

  return {
    REDIRECT: REDIRECT,
    sha256hex: function (t) { return sha256(t).map(function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join(''); },
    setClientId: setClientId, clientId: clientId, authUrl: authUrl, finishPairing: finishPairing,
    isPaired: isPaired, unpair: unpair,
    // cb(err, state|null): state.item, state.is_playing, state.progress_ms, state.device
    playback: function (cb) { call('GET', '/me/player?additional_types=episode', null, function (e, d) { cb(e, d || null); }); },
    play: function (deviceId, cb) { call('PUT', '/me/player/play' + q(deviceId), null, cb); },
    pause: function (cb) { call('PUT', '/me/player/pause', null, cb); },
    next: function (cb) { call('POST', '/me/player/next', null, cb); },
    previous: function (cb) { call('POST', '/me/player/previous', null, cb); },
    volume: function (pct, cb) { call('PUT', '/me/player/volume?volume_percent=' + Math.max(0, Math.min(100, Math.round(pct))), null, cb); },
    devices: function (cb) { call('GET', '/me/player/devices', null, function (e, d) { cb(e, (d && d.devices) || []); }); },
    transfer: function (deviceId, play, cb) { call('PUT', '/me/player', { device_ids: [deviceId], play: !!play }, cb); },
    playContext: function (uri, deviceId, cb) {
      var body = /:track:/.test(uri) ? { uris: [uri] } : { context_uri: uri };
      call('PUT', '/me/player/play' + q(deviceId), body, cb);
    },
    playlists: function (cb) { call('GET', '/me/playlists?limit=20', null, function (e, d) { cb(e, (d && d.items) || []); }); },
    recent: function (cb) { call('GET', '/me/player/recently-played?limit=30', null, function (e, d) { cb(e, (d && d.items) || []); }); }
  };
})();
