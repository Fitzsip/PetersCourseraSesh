/*
 * Flight data sources. Every provider returns a list of aircraft normalised to:
 *   { hex, callsign, reg, type, desc, lat, lon, altFt, onGround, gsKt, track,
 *     vertRateFpm, squawk, ageSec }
 */
var Providers = (function () {
  'use strict';

  var READSB_POINT_URLS = {
    'adsb.lol': 'https://api.adsb.lol/v2/point/',
    'airplanes.live': 'https://api.airplanes.live/v2/point/'
  };

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
      ageSec: num(a.seen_pos) || 0
    };
  }

  function fetchReadsb(cfg) {
    var nm = Math.max(1, Math.min(250, Math.ceil(cfg.watchRadiusKm / 1.852)));
    var url = READSB_POINT_URLS[cfg.provider] + cfg.homeLat.toFixed(4) + '/' +
              cfg.homeLon.toFixed(4) + '/' + nm;
    return request('GET', url).then(function (data) {
      return (data.ac || data.aircraft || []).map(fromReadsb).filter(Boolean);
    });
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
          squawk: s[14] || '',
          ageSec: now && s[3] ? Math.max(0, now - s[3]) : 0
        };
      }).filter(Boolean);
    });
  }

  function fetchAircraft(cfg) {
    if (cfg.demo) return Promise.resolve(Demo.aircraft(cfg));
    if (cfg.provider === 'opensky') return fetchOpenSky(cfg);
    if (READSB_POINT_URLS[cfg.provider]) return fetchReadsb(cfg);
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

  function lookupRoute(a) {
    if (a.demoRoute) return Promise.resolve(a.demoRoute);
    if (!a.callsign) return Promise.resolve(null);
    return cached(routeCache, a.callsign, function () {
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
    fetchAircraft: fetchAircraft,
    lookupRoute: lookupRoute,
    lookupPhoto: lookupPhoto,
    fromReadsb: fromReadsb
  };
})();
