/*
 * Push alerts to a phone with ntfy (https://ntfy.sh): install the free ntfy app,
 * subscribe to the same topic name as in Settings, and alerts arrive even when
 * nobody is watching the TV.
 *
 * The title goes in the URL, not a "Title" header: browsers refuse header values
 * containing emoji, which would make the push fail silently.
 */
var Notify = (function () {
  'use strict';

  function inQuietHours(cfg) {
    if (!cfg.quietHours) return false;
    var h = new Date().getHours();
    return h >= 22 || h < 8;
  }

  function send(cfg, title, body, opts) {
    opts = opts || {};
    var topic = (cfg.ntfyTopic || '').trim();
    if (!topic) return Promise.reject(new Error('No ntfy topic set'));
    if (!opts.ignoreQuiet && inQuietHours(cfg)) return Promise.resolve(false);
    var url = 'https://ntfy.sh/' + encodeURIComponent(topic) +
      '?title=' + encodeURIComponent(title) +
      '&tags=' + encodeURIComponent(opts.tags || 'small_airplane') +
      '&priority=' + (opts.priority || 'high');
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.timeout = 10000;
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) resolve(true);
        else reject(new Error('ntfy HTTP ' + xhr.status));
      };
      xhr.onerror = xhr.ontimeout = function () { reject(new Error('Cannot reach ntfy.sh')); };
      xhr.send(body);
    });
  }

  return { send: send, inQuietHours: inQuietHours };
})();
