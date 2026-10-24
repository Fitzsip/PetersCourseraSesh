/*
 * "My shows" data from TVmaze (free, no account needed): search, posters,
 * and the latest / upcoming episode, so the home screen can flag new episodes.
 */
var Shows = (function () {
  var API = 'https://api.tvmaze.com';
  var REFRESH = 6 * 3600 * 1000;
  var WEEK = 7 * 24 * 3600 * 1000;

  function getJson(url, cb) {
    Platform.getText(url, null, function (err, text) {
      if (err) return cb(err);
      try { cb(null, JSON.parse(text)); } catch (e) { cb(e); }
    });
  }

  function stripHtml(s) {
    return (s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  }

  function network(show) {
    return ((show.webChannel || show.network) || {}).name || '';
  }

  // cb(list of { id, name, year, network, image }, error) — error is set if TVmaze couldn't be reached.
  function search(query, cb) {
    getJson(API + '/search/shows?q=' + encodeURIComponent(query), function (err, data) {
      if (err || !data) return Platform.isTv ? cb([], err || new Error('No data')) : cb(demoSearch(query));
      cb(data.map(function (r) {
        var s = r.show;
        return {
          id: s.id, name: s.name,
          year: (s.premiered || '').slice(0, 4),
          network: network(s),
          image: s.image ? s.image.medium : null
        };
      }));
    });
  }

  function episode(e) {
    if (!e) return null;
    return { season: e.season, number: e.number, name: e.name, airstamp: e.airstamp };
  }

  // Lookups run one at a time with a short gap, to stay well inside TVmaze's rate limit
  // (about 20 requests per 10 seconds) however many shows you follow.
  var queue = [];
  var waiting = {};  // tvmazeId -> [callbacks] for lookups queued or in flight
  var busy = false;
  function pump() {
    if (busy || !queue.length) return;
    busy = true;
    var show = queue.shift();
    fetchInfo(show, function () {
      var cbs = waiting[show.tvmazeId] || [];
      delete waiting[show.tvmazeId];
      cbs.forEach(function (f) { if (f) f(show); });
      setTimeout(function () { busy = false; pump(); }, 600);
    });
  }

  // Fills show.info (poster, summary, latest/next episode). cb(show) when done.
  function refresh(show, cb) {
    if (show.info && Date.now() - show.info.at < REFRESH) return cb && cb(show);
    if (waiting[show.tvmazeId]) return waiting[show.tvmazeId].push(cb);
    waiting[show.tvmazeId] = [cb];
    queue.push(show);
    pump();
  }

  function fetchInfo(show, cb) {
    var url = API + '/shows/' + show.tvmazeId + '?embed%5B%5D=nextepisode&embed%5B%5D=previousepisode';
    getJson(url, function (err, s) {
      if (!err && s) {
        var emb = s._embedded || {};
        show.info = {
          at: Date.now(),
          poster: s.image ? s.image.medium : null,
          art: s.image ? s.image.original : null,
          summary: stripHtml(s.summary),
          network: network(s),
          status: s.status,
          prev: episode(emb.previousepisode),
          next: episode(emb.nextepisode)
        };
      } else if (!show.info && !Platform.isTv) {
        show.info = demoInfo(show);
      }
      cb();
    });
  }

  function epLabel(e) { return 'S' + e.season + ' E' + e.number; }

  function isNew(show) {
    var p = show.info && show.info.prev;
    if (!p || !p.airstamp) return false;
    var age = Date.now() - new Date(p.airstamp).getTime();
    return age >= 0 && age < WEEK;
  }

  // One short line for the tile, e.g. "New: S2 E5" or "Next ep Fri 7 Nov"
  function status(show) {
    var info = show.info;
    if (!info) return '';
    if (isNew(show)) return 'New: ' + epLabel(info.prev);
    if (info.next && info.next.airstamp) {
      var d = new Date(info.next.airstamp);
      var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return 'Next ep ' + days[d.getDay()] + ' ' + d.getDate() + ' ' + months[d.getMonth()];
    }
    if (info.status === 'Ended') return 'Series ended';
    return info.prev ? 'Latest: ' + epLabel(info.prev) : '';
  }

  // Which app a show is probably on, from its network name. Returns an app id or null.
  var NETWORK_APPS = [
    [/netflix/i, 'netflix'], [/disney/i, 'disney'], [/prime|amazon/i, 'prime'],
    [/sky|now\b|hbo|max\b/i, 'now'], [/rt[eé]/i, 'rte'], [/virgin/i, 'virgin'],
    [/apple/i, 'appletv'], [/youtube/i, 'youtube']
  ];
  function guessApp(networkName) {
    for (var i = 0; i < NETWORK_APPS.length; i++) {
      if (NETWORK_APPS[i][0].test(networkName || '')) return NETWORK_APPS[i][1];
    }
    return null;
  }

  // ---- demo data for a desktop browser without network access

  function demoSearch(q) {
    return [
      { id: 1, name: q, year: '2024', network: 'Netflix', image: null },
      { id: 2, name: q + ' (UK)', year: '2019', network: 'Sky Atlantic', image: null }
    ];
  }
  function demoInfo(show) {
    var now = Date.now();
    var fresh = show.name.length % 2 === 0;
    return {
      at: now, poster: null, art: null,
      summary: 'Demo details for ' + show.name + '. On the TV this comes from TVmaze.',
      network: '', status: 'Running',
      prev: { season: 2, number: 5, name: 'Episode 5', airstamp: new Date(now - (fresh ? 2 : 20) * 86400000).toISOString() },
      next: fresh ? null : { season: 2, number: 6, name: 'Episode 6', airstamp: new Date(now + 3 * 86400000).toISOString() }
    };
  }

  return { search: search, refresh: refresh, status: status, isNew: isNew, guessApp: guessApp, epLabel: epLabel };
})();
