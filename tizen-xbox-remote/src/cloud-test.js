// Checks whether Xbox Cloud Gaming (Game Pass Ultimate) accepts this app's sign-in.
// Cloud sessions need, besides the streaming token, a "console transfer" token that
// Microsoft normally issues only to its own Xbox apps; step 3 tests exactly that.
var CloudTest = (function () {
  'use strict';

  var http = XboxAuth.http;
  var CLOUD_HOST = 'https://xgpuweb.gssv-play-prod.xboxlive.com';
  var TRANSFER_SCOPE = 'service::http://Passport.NET/purpose::PURPOSE_XBOX_CLOUD_CONSOLE_TRANSFER_TOKEN';

  // report(name, ok, detail) is called once per step.
  function run(gssvToken, clientId, report) {
    var session = null;

    return http.postJson('Cloud login', CLOUD_HOST + '/v2/login/user', {
      offeringId: 'xgpuweb',
      token: gssvToken
    }, { 'x-gssv-client': 'XboxComBrowser' })
      .then(function (j) {
        var regions = (j.offeringSettings && j.offeringSettings.regions) || [];
        var region = regions.filter(function (r) { return r.isDefault; })[0] || regions[0];
        session = { gsToken: j.gsToken, baseUri: region ? region.baseUri : CLOUD_HOST };
        report('Cloud login', true, 'region ' + session.baseUri.replace(/^https:\/\//, ''));
      }, function (err) {
        report('Cloud login', false, err.message);
        throw err;
      })
      .then(function () {
        return http.getJson('Cloud library', session.baseUri + '/v2/titles?mr=25', {
          'Authorization': 'Bearer ' + session.gsToken,
          'x-gssv-client': 'XboxComBrowser'
        }).then(function (j) {
          var titles = (j && j.results) || [];
          report('Cloud library', true, titles.length + ' titles returned');
        }, function (err) {
          // Not decisive on its own; carry on to the token check.
          report('Cloud library', false, err.message);
        });
      })
      .then(function () {
        return XboxAuth.requestScopedToken(clientId, TRANSFER_SCOPE).then(function (r) {
          if (r.ok) {
            report('Cloud session token', true, 'issued; cloud play looks possible');
          } else {
            var j = r.json || {};
            report('Cloud session token', false,
              (j.error || 'HTTP ' + r.status) + ': ' + String(j.error_description || r.text).slice(0, 250));
          }
        });
      })
      .catch(function () { /* already reported */ });
  }

  return { run: run };
})();
