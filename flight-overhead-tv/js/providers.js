/*
 * Flight data sources. Every provider returns a list of aircraft normalised to:
 *   { hex, callsign, reg, type, desc, lat, lon, altFt, onGround, gsKt, track,
 *     vertRateFpm, squawk, category, dbFlags, owner, ageSec }
 */
var Providers = (function () {
  'use strict';

  // Free sources serving the readsb JSON format. 'auto' tries them in this order and
  // sticks with whichever answered last.
  var READSB_SOURCES = {
    'adsb.fi': function (lat, lon, nm) {
      return 'https://opendata.adsb.fi/api/v2/lat/' + lat + '/lon/' + lon + '/dist/' + nm;
    },
    'airplanes.live': function (lat, lon, nm) {
      return 'https://api.airplanes.live/v2/point/' + lat + '/' + lon + '/' + nm;
    },
    'adsb.lol': function (lat, lon, nm) {
      return 'https://api.adsb.lol/v2/point/' + lat + '/' + lon + '/' + nm;
    }
  };
  var AUTO_ORDER = ['adsb.fi', 'airplanes.live', 'adsb.lol'];
  var autoIndex = 0;
  var lastSource = '';

  function hostOf(url) {
    var m = /^https?:\/\/([^\/]+)/.exec(url);
    return m ? m[1] : url;
  }

  function request(method, url, body, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open(method, url, true);
      xhr.timeout = timeoutMs || 10000;
      if (body) xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch (e) {
            reject(new Error('Unreadable reply from ' + hostOf(url)));
          }
          return;
        }
        var err = new Error('HTTP ' + xhr.status + ' from ' + hostOf(url));
        err.status = xhr.status;
        reject(err);
      };
      xhr.onerror = function () { reject(new Error('Cannot reach ' + hostOf(url))); };
      xhr.ontimeout = function () { reject(new Error('Timed out waiting for ' + hostOf(url))); };
      xhr.send(body ? JSON.stringify(body) : null);
    });
  }

  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }

  // adsb.lol and airplanes.live both serve the readsb JSON format.
  function fromReadsb(a) {
    if (num(a.lat) === null || num(a.lon) === null) return null;
    var onGround = a.alt_baro === 'ground';
    var alt = num(a.alt_baro);
    if (alt === null) alt = num(a.alt_geom);
    return {
      hex: String(a.hex || '').replace('~', ''),
      callsign: String(a.flight || '').trim(),
      reg: a.r || '',
      type: a.t || '',
      desc: a.desc || '',
      lat: a.lat,
      lon: a.lon,
      altFt: onGround ? 0 : alt,
      onGround: onGround,
      gsKt: num(a.gs),
      track: num(a.track) !== null ? a.track : num(a.true_heading),
      vertRateFpm: num(a.baro_rate) !== null ? a.baro_rate : num(a.geom_rate),
      squawk: a.squawk || '',
      category: a.category || '',
      dbFlags: a.dbFlags || 0,
      owner: a.ownOp || '',
      ageSec: num(a.seen_pos) || 0
    };
  }

  function fetchReadsb(cfg, source) {
    var nm = Math.max(1, Math.min(250, Math.ceil(cfg.watchRadiusKm / 1.852)));
    var url = READSB_SOURCES[source](cfg.homeLat.toFixed(4), cfg.homeLon.toFixed(4), nm);
    return request('GET', url).then(function (data) {
      var list = data.ac || data.aircraft;
      if (!list || typeof list.length !== 'number') throw new Error('No aircraft list from ' + hostOf(url));
      lastSource = source;
      return list.map(fromReadsb).filter(Boolean);
    });
  }

  function fetchAuto(cfg) {
    var tries = 0;
    var firstError = null;
    function attempt() {
      var source = AUTO_ORDER[(autoIndex + tries) % AUTO_ORDER.length];
      return fetchReadsb(cfg, source).then(function (list) {
        autoIndex = (autoIndex + tries) % AUTO_ORDER.length;
        return list;
      }, function (err) {
        firstError = firstError || err;
        tries++;
        if (tries < AUTO_ORDER.length) return attempt();
        autoIndex = (autoIndex + 1) % AUTO_ORDER.length;
        throw firstError;
      });
    }
    return attempt();
  }

  // OpenSky "state vectors": positional arrays, SI units.
  function fetchOpenSky(cfg) {
    var dLat = cfg.watchRadiusKm / 111.32;
    var dLon = cfg.watchRadiusKm / (111.32 * Math.cos(cfg.homeLat * Math.PI / 180));
    var url = 'https://opensky-network.org/api/states/all' +
      '?lamin=' + (cfg.homeLat - dLat).toFixed(4) + '&lamax=' + (cfg.homeLat + dLat).toFixed(4) +
      '&lomin=' + (cfg.homeLon - dLon).toFixed(4) + '&lomax=' + (cfg.homeLon + dLon).toFixed(4);
    return request('GET', url).then(function (data) {
      var now = data.time;
      lastSource = 'opensky';
      return (data.states || []).map(function (s) {
        if (num(s[5]) === null || num(s[6]) === null) return null;
        var altM = num(s[7]) !== null ? s[7] : num(s[13]);
        return {
          hex: s[0], callsign: String(s[1] || '').trim(), reg: '', type: '', desc: '',
          lat: s[6], lon: s[5],
          altFt: altM === null ? null : altM * 3.28084,
          onGround: !!s[8],
          gsKt: num(s[9]) === null ? null : s[9] * 1.943844,
          track: num(s[10]),
          vertRateFpm: num(s[11]) === null ? null : s[11] * 196.85,
          squawk: s[14] || '', category: '', dbFlags: 0, owner: '',
          ageSec: now && s[3] ? Math.max(0, now - s[3]) : 0
        };
      }).filter(Boolean);
    });
  }

  function fetchAircraft(cfg) {
    if (cfg.demo) { lastSource = 'demo data'; return Promise.resolve(Demo.aircraft(cfg)); }
    if (cfg.provider === 'auto') return fetchAuto(cfg);
    if (cfg.provider === 'opensky') return fetchOpenSky(cfg);
    if (READSB_SOURCES[cfg.provider]) return fetchReadsb(cfg, cfg.provider);
    return Promise.reject(new Error('Unknown data source "' + cfg.provider + '"'));
  }

  // ---- Extras for the popup: route and photo. Both are best-effort and cached. ----

  var routeCache = {};
  var photoCache = {};
  var EXTRA_CACHE_MS = 6 * 3600 * 1000;

  function cached(cache, key, load) {
    var hit = cache[key];
    if (hit && Date.now() - hit.at < EXTRA_CACHE_MS) return hit.promise;
    var promise = load().catch(function () { return null; });
    cache[key] = { at: Date.now(), promise: promise };
    return promise;
  }

  function airport(ap) {
    return { code: ap.iata || ap.icao || '?', city: ap.location || ap.name || '' };
  }

  function routeFromAdsbLol(a) {
    return request('POST', 'https://api.adsb.lol/api/0/routeset',
      { planes: [{ callsign: a.callsign, lat: a.lat, lng: a.lon }] }, 8000)
      .then(function (res) {
        var r = res && res[0];
        var aps = r && r._airports;
        if (!aps || aps.length < 2) return null;
        return {
          origin: airport(aps[0]),
          dest: airport(aps[aps.length - 1]),
          plausible: r.plausible !== 0 && r.plausible !== false
        };
      });
  }

  // hexdb.io gives ICAO codes only ("EICK-EGSS"), so look the airport names up too.
  var hexdbAirports = {};
  function hexdbAirport(code) {
    return cached(hexdbAirports, code, function () {
      return request('GET', 'https://hexdb.io/api/v1/airport/icao/' + code, null, 8000)
        .then(function (j) {
          var name = j && j.airport ? String(j.airport)
            .replace(/\b(International|Airport|Airfield|Aerodrome|Air Base)\b/gi, '')
            .replace(/\s{2,}/g, ' ').replace(/[\s,\/-]+$/, '').trim() : '';
          return name || code;
        });
    }).then(function (name) { return { code: code, city: name || code }; });
  }

  function routeFromHexdb(a) {
    return request('GET', 'https://hexdb.io/api/v1/route/icao/' + encodeURIComponent(a.callsign), null, 8000)
      .then(function (j) {
        var m = j && /^([A-Z]{4})-(?:.*-)?([A-Z]{4})$/.exec(j.route || '');
        if (!m) return null;
        return Promise.all([hexdbAirport(m[1]), hexdbAirport(m[2])]).then(function (aps) {
          return { origin: aps[0], dest: aps[1], plausible: true };
        });
      });
  }

  function lookupRoute(a) {
    if (a.demoRoute) return Promise.resolve(a.demoRoute);
    if (!a.callsign) return Promise.resolve(null);
    return cached(routeCache, a.callsign, function () {
      return routeFromAdsbLol(a)
        .catch(function () { return null; })
        .then(function (r) { return r || routeFromHexdb(a); });
    });
  }

  function lookupPhoto(a) {
    if (!a.hex || a.demoRoute) return Promise.resolve(null);
    return cached(photoCache, a.hex, function () {
      return request('GET', 'https://api.planespotters.net/pub/photos/hex/' + a.hex, null, 8000)
        .then(function (res) {
          var p = res && res.photos && res.photos[0];
          var img = p && (p.thumbnail_large || p.thumbnail);
          return img ? { src: img.src, credit: p.photographer || '' } : null;
        });
    });
  }

  return {
    request: request,
    lastSource: function () { return lastSource; },
    fetchAircraft: fetchAircraft,
    lookupRoute: lookupRoute,
    lookupPhoto: lookupPhoto,
    fromReadsb: fromReadsb
  };
})();
