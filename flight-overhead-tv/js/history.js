/*
 * Today's flights for an aircraft, from FlightAware AeroAPI (needs your own API key,
 * see README). Gives where the current flight took off, how long it has been
 * airborne, and the countries the aircraft has been to today.
 *
 * Result: { origin: {code, name, city, country}, departedAt: ms|null,
 *           countries: [names...], flightsToday: n } or null.
 */
var History = (function () {
  'use strict';
  var BASE = 'https://aeroapi.flightaware.com/aeroapi/flights/';
  var cache = {};
  var CACHE_MS = 30 * 60 * 1000;

  function get(url, key) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.timeout = 10000;
      xhr.setRequestHeader('x-apikey', key);
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)); } catch (e) { reject(new Error('Bad FlightAware reply')); }
        } else {
          reject(new Error('FlightAware HTTP ' + xhr.status));
        }
      };
      xhr.onerror = xhr.ontimeout = function () { reject(new Error('Cannot reach FlightAware')); };
      xhr.send(null);
    });
  }

  function airport(ap) {
    if (!ap) return null;
    var icao = ap.code_icao || (ap.code && ap.code.length === 4 ? ap.code : '');
    return {
      code: ap.code_iata || ap.code_icao || ap.code || '?',
      name: ap.name || '',
      city: ap.city || ap.name || '',
      country: countryForIcao(icao)
    };
  }

  function time(s) {
    var t = s ? Date.parse(s) : NaN;
    return isNaN(t) ? null : t;
  }

  // Exposed for testing: turns an AeroAPI /flights response into the summary above.
  function summarise(res, now) {
    var flights = (res && res.flights) || [];
    var midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0);
    midnight = midnight.getTime();

    var current = null;
    var today = [];
    flights.forEach(function (f) {
      if (f.cancelled) return;
      var off = time(f.actual_off);
      var on = time(f.actual_on);
      if (off === null) return;                                   // hasn't departed
      if (on === null && !current && now - off < 20 * 3600000) current = f;
      if (off >= midnight || on === null || on >= midnight) today.push(f);
    });
    if (!current && !today.length) return null;

    // Oldest first, so the country list reads in travel order.
    today.sort(function (a, b) { return time(a.actual_off) - time(b.actual_off); });
    var countries = [];
    function add(ap) {
      var c = ap && ap.country;
      if (c && countries.indexOf(c) < 0) countries.push(c);
    }
    today.forEach(function (f) {
      add(airport(f.origin));
      if (time(f.actual_on) !== null) add(airport(f.destination));  // only count places it has landed
    });

    return {
      origin: airport((current || today[today.length - 1]).origin),
      departedAt: current ? time(current.actual_off) : null,
      countries: countries,
      flightsToday: today.length
    };
  }

  function lookup(a, cfg) {
    if (a.demoHistory) return Promise.resolve(a.demoHistory);
    var key = (cfg.flightawareKey || '').trim();
    var reg = (a.reg || '').replace(/-/g, '');
    var ident = reg || a.callsign;
    if (!key || !ident) return Promise.resolve(null);

    var hit = cache[ident];
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.promise;
    var start = new Date(Date.now() - 24 * 3600000).toISOString().replace(/\.\d+Z$/, 'Z');
    var url = BASE + encodeURIComponent(ident) + '?ident_type=' + (reg ? 'registration' : 'designator') +
      '&start=' + encodeURIComponent(start);
    var promise = get(url, key)
      .then(function (res) { return summarise(res, Date.now()); })
      .catch(function () { return null; });
    cache[ident] = { at: Date.now(), promise: promise };
    return promise;
  }

  return { lookup: lookup, summarise: summarise };
})();
