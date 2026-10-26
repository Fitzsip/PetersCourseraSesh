/*
 * Turns what was typed in Settings into home coordinates. Accepts:
 *   - coordinates, e.g. "51.91234, -8.46789" or a Google Maps link containing them
 *   - an Eircode, e.g. "T23 HN2C" (only found if it is in OpenStreetMap)
 *   - a street address
 * Tries Nominatim first, then Photon. Both use free OpenStreetMap data, which
 * has few Eircodes, so a result must carry the same Eircode to be accepted.
 */
var Geocode = (function () {
  'use strict';
  var EIRCODE = /^([AC-FHKNPRTV-Y]\d{2}|D6W)([0-9AC-FHKNPRTV-Y]{4})$/;

  function parseCoordinates(text) {
    var m = /(-?\d{1,2}\.\d{3,})\s*,?\s+(-?\d{1,3}\.\d{3,})|(-?\d{1,2}\.\d{3,}),(-?\d{1,3}\.\d{3,})/.exec(text);
    if (!m) return null;
    var lat = parseFloat(m[1] || m[3]), lon = parseFloat(m[2] || m[4]);
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return { lat: lat, lon: lon, label: 'coordinates you entered' };
  }

  function parseEircode(text) {
    var m = EIRCODE.exec(String(text).toUpperCase().replace(/\s+/g, ''));
    return m ? m[1] + ' ' + m[2] : null;
  }

  function sameEircode(a, b) {
    return String(a || '').toUpperCase().replace(/\s+/g, '') === String(b || '').toUpperCase().replace(/\s+/g, '');
  }

  function nominatim(params, eircode) {
    return Providers.request('GET', 'https://nominatim.openstreetmap.org/search?format=json&limit=5&addressdetails=1&' +
      params, null, 10000).then(function (res) {
      for (var i = 0; res && i < res.length; i++) {
        var r = res[i];
        if (eircode && !sameEircode(r.address && r.address.postcode, eircode)) continue;
        return { lat: parseFloat(r.lat), lon: parseFloat(r.lon),
                 label: String(r.display_name).split(',').slice(0, 3).join(',') };
      }
      return null;
    });
  }

  function photon(query, countryCode, eircode) {
    return Providers.request('GET', 'https://photon.komoot.io/api/?limit=5&lang=en&q=' + encodeURIComponent(query),
      null, 10000).then(function (res) {
      var feats = (res && res.features) || [];
      for (var i = 0; i < feats.length; i++) {
        var p = feats[i].properties || {};
        if (countryCode && String(p.countrycode || '').toLowerCase() !== countryCode) continue;
        if (eircode && !sameEircode(p.postcode, eircode)) continue;
        var c = feats[i].geometry.coordinates;
        return { lat: c[1], lon: c[0],
                 label: [p.name || p.street, p.city || p.county, p.postcode].filter(Boolean).join(', ') };
      }
      return null;
    });
  }

  // Resolves to {lat, lon, label}, or rejects with a message to show.
  function find(text, countryCode) {
    text = String(text || '').trim();
    var coords = parseCoordinates(text);
    if (coords) return Promise.resolve(coords);

    var eircode = parseEircode(text);
    var cc = countryCode ? '&countrycodes=' + countryCode : '';
    var attempts = eircode ? [
      function () { return nominatim('postalcode=' + encodeURIComponent(eircode) + '&countrycodes=ie', eircode); },
      function () { return nominatim('q=' + encodeURIComponent(eircode) + '&countrycodes=ie', eircode); },
      function () { return photon(eircode, 'ie', eircode); }
    ] : [
      function () { return nominatim('q=' + encodeURIComponent(text) + cc, null); },
      function () { return photon(text, countryCode, null); }
    ];

    var errors = [];
    var answered = false;
    function next(i) {
      if (i >= attempts.length) {
        if (!answered) {
          throw new Error('Could not reach the address search (' + errors.join('; ') + '). Check the internet connection.');
        }
        throw new Error(eircode
          ? 'That Eircode is not in the free map data. In Google Maps on your phone, search the Eircode, ' +
            'press and hold your roof, and type the numbers shown (e.g. 51.91234, -8.46789) into this box.'
          : 'No match. Try adding the town, check "Search in", or type coordinates from Google Maps.');
      }
      return attempts[i]().then(function (hit) {
        answered = true;
        return hit || next(i + 1);
      }, function (err) {
        errors.push(err.message);
        return next(i + 1);
      });
    }
    return next(0);
  }

  return { find: find, parseCoordinates: parseCoordinates, parseEircode: parseEircode };
})();
