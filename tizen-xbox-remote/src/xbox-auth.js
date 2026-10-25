// Microsoft account + Xbox Live sign-in using the user's own Entra app registration
// (device code flow, consumers tenant), then Xbox streaming (gssv) login.
// Kept to ES2017 so it runs on the Tizen 5.5 web engine.
var XboxAuth = (function () {
  'use strict';

  var MS_BASE = 'https://login.microsoftonline.com/consumers/oauth2/v2.0';
  var SCOPE = 'XboxLive.signin offline_access';
  var GSSV_HOST = 'https://xhome.gssv-play-prod.xboxlive.com';
  var REFRESH_KEY = 'xboxRemote.refreshToken';

  // Xbox XSTS errors that have a clear fix for the user.
  var XERR = {
    2148916233: 'This Microsoft account has no Xbox profile yet. Sign in at xbox.com once to create one.',
    2148916235: 'Xbox Live is not available in this account\'s country/region.',
    2148916236: 'This account needs adult verification (South Korea).',
    2148916237: 'This account needs adult verification (South Korea).',
    2148916238: 'This is a child account; it must be added to a Microsoft family by an adult.'
  };

  function HttpError(step, status, body) {
    var err = new Error(step + ' failed: HTTP ' + status + (body ? ' — ' + body.slice(0, 300) : ''));
    err.status = status;
    err.body = body;
    return err;
  }

  function request(step, url, options) {
    var timeout = new Promise(function (_, reject) {
      setTimeout(function () { reject(new Error(step + ' failed: request timed out')); }, 20000);
    });
    return Promise.race([fetch(url, options), timeout]).then(function (res) {
      return res.text().then(function (text) {
        var json = null;
        try { json = text ? JSON.parse(text) : null; } catch (e) { /* not JSON */ }
        return { ok: res.ok, status: res.status, text: text, json: json };
      });
    });
  }

  function postForm(step, url, params) {
    var body = Object.keys(params).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }).join('&');
    return request(step, url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body
    });
  }

  function postJson(step, url, payload, headers) {
    var h = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    Object.keys(headers || {}).forEach(function (k) { h[k] = headers[k]; });
    return request(step, url, { method: 'POST', headers: h, body: JSON.stringify(payload) })
      .then(function (r) {
        if (!r.ok) throw HttpError(step, r.status, r.text);
        return r.json;
      });
  }

  function getJson(step, url, headers) {
    return request(step, url, { method: 'GET', headers: headers || {} }).then(function (r) {
      if (!r.ok) throw HttpError(step, r.status, r.text);
      return r.json;
    });
  }

  function wait(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

  function storage(fn) {
    try { return fn(window.localStorage); } catch (e) { return null; }
  }

  function saveRefreshToken(token) {
    storage(function (s) { s.setItem(REFRESH_KEY, token); });
  }

  function signOut() {
    storage(function (s) { s.removeItem(REFRESH_KEY); });
  }

  // Returns a Microsoft access token, or null if there is no saved session.
  function refreshMicrosoftToken(clientId) {
    var refreshToken = storage(function (s) { return s.getItem(REFRESH_KEY); });
    if (!refreshToken) return Promise.resolve(null);
    return postForm('Token refresh', MS_BASE + '/token', {
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: SCOPE
    }).then(function (r) {
      if (!r.ok || !r.json || !r.json.access_token) {
        signOut();
        return null;
      }
      if (r.json.refresh_token) saveRefreshToken(r.json.refresh_token);
      return r.json.access_token;
    });
  }

  // onCode({userCode, verificationUri}) is called once the code is ready to show.
  function deviceCodeSignIn(clientId, onCode) {
    return postForm('Device code request', MS_BASE + '/devicecode', {
      client_id: clientId,
      scope: SCOPE
    }).then(function (r) {
      if (!r.ok) throw HttpError('Device code request', r.status, r.text);
      var dc = r.json;
      onCode({ userCode: dc.user_code, verificationUri: dc.verification_uri });
      var interval = (dc.interval || 5) * 1000;
      var deadline = Date.now() + (dc.expires_in || 900) * 1000;

      function poll() {
        if (Date.now() > deadline) throw new Error('The sign-in code expired. Press Y to get a new one.');
        return wait(interval).then(function () {
          return postForm('Sign-in', MS_BASE + '/token', {
            client_id: clientId,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
            device_code: dc.device_code
          });
        }).then(function (t) {
          if (t.ok && t.json && t.json.access_token) {
            if (t.json.refresh_token) saveRefreshToken(t.json.refresh_token);
            return t.json.access_token;
          }
          var code = t.json && t.json.error;
          if (code === 'authorization_pending') return poll();
          if (code === 'slow_down') { interval += 5000; return poll(); }
          if (code === 'authorization_declined') throw new Error('Sign-in was declined on the phone.');
          throw HttpError('Sign-in', t.status, t.text);
        });
      }
      return poll();
    });
  }

  function xboxUserToken(msAccessToken) {
    return postJson('Xbox Live user token', 'https://user.auth.xboxlive.com/user/authenticate', {
      Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: 'd=' + msAccessToken },
      RelyingParty: 'http://auth.xboxlive.com',
      TokenType: 'JWT'
    }, { 'x-xbl-contract-version': '1' }).then(function (j) { return j.Token; });
  }

  // Returns {token, uhs, gamertag}. Gamertag is only present for some relying parties.
  function xsts(step, userToken, relyingParty) {
    return postJson(step, 'https://xsts.auth.xboxlive.com/xsts/authorize', {
      Properties: { SandboxId: 'RETAIL', UserTokens: [userToken] },
      RelyingParty: relyingParty,
      TokenType: 'JWT'
    }, { 'x-xbl-contract-version': '1' }).then(function (j) {
      var xui = (j.DisplayClaims && j.DisplayClaims.xui && j.DisplayClaims.xui[0]) || {};
      return { token: j.Token, uhs: xui.uhs, gamertag: xui.gtg };
    }).catch(function (err) {
      var parsed = null;
      try { parsed = JSON.parse(err.body); } catch (e) { /* not JSON */ }
      if (parsed && XERR[parsed.XErr]) throw new Error(XERR[parsed.XErr]);
      throw err;
    });
  }

  // Consoles registered to the account (Xbox Live device list, independent of streaming).
  function listAccountConsoles(xboxLive) {
    return getJson('Account console list',
      'https://xccs.xboxlive.com/lists/devices?queryCurrentDevice=false&includeStorageDevices=false', {
        'Authorization': 'XBL3.0 x=' + xboxLive.uhs + ';' + xboxLive.token,
        'x-xbl-contract-version': '4',
        'skillplatform': 'RemoteManagement'
      }).then(function (j) { return (j && j.result) || []; });
  }

  // Exchanges the gssv XSTS token for a streaming token and region list.
  function streamingLogin(gssvToken) {
    return postJson('Xbox streaming login', GSSV_HOST + '/v2/login/user', {
      offeringId: 'xhome',
      token: gssvToken
    }, { 'x-gssv-client': 'XboxComBrowser' }).then(function (j) {
      var regions = (j.offeringSettings && j.offeringSettings.regions) || [];
      var region = regions.filter(function (r) { return r.isDefault; })[0] || regions[0];
      return { gsToken: j.gsToken, baseUri: region ? region.baseUri : GSSV_HOST, regions: regions };
    });
  }

  // Consoles that can be streamed from, as the streaming service sees them.
  function listStreamingConsoles(session) {
    return getJson('Remote Play console list', session.baseUri + '/v6/servers/home?mr=50', {
      'Authorization': 'Bearer ' + session.gsToken,
      'x-gssv-client': 'XboxComBrowser'
    }).then(function (j) { return (j && j.results) || []; });
  }

  return {
    refreshMicrosoftToken: refreshMicrosoftToken,
    deviceCodeSignIn: deviceCodeSignIn,
    xboxUserToken: xboxUserToken,
    xsts: xsts,
    listAccountConsoles: listAccountConsoles,
    streamingLogin: streamingLogin,
    listStreamingConsoles: listStreamingConsoles,
    signOut: signOut,
    http: { request: request, postJson: postJson, getJson: getJson }
  };
})();
