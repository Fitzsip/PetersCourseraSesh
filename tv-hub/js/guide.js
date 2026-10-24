/*
 * Online TV guide: what's on now/next for channels you watch through apps
 * (RTÉ Player, Virgin Media Player, Sky Sports on NOW).
 *
 * Sources (the same public listings the open-source iptv-org/epg project uses):
 *   virgin    - virginmediatelevision.ie's own TV guide (all Virgin Media channels, one page per day)
 *   tvireland - tvireland.ie listings (one page per channel per day), used for RTÉ
 *   sky       - Sky's EPG service (JSON, many channels per request), used for Sky Sports
 *
 * A programme is { title, start: Date, stop: Date, image, desc }.
 * All "days" are the TV's local day, which is Irish time (the same as UK time) at home.
 */
var Guide = (function () {
  var cache = {};    // request URL -> { at: ms, data } ; data null = the request failed
  var pending = {};  // request URL -> [callbacks] while a request is in flight
  var HOUR = 3600 * 1000;
  var RETRY_AFTER_FAILURE = 10 * 60 * 1000;
  var DAY = 24 * HOUR;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDays(d, n) { var c = new Date(d.getTime()); c.setDate(c.getDate() + n); return c; }

  // "9.30pm" on a given day -> Date
  function parseClock(day, text) {
    var m = /(\d{1,2})[.:](\d{2})\s*(am|pm)/i.exec(text || '');
    if (!m) return null;
    var h = parseInt(m[1], 10) % 12;
    if (m[3].toLowerCase() === 'pm') h += 12;
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, parseInt(m[2], 10));
  }

  // Programmes in a list run back to back: roll later ones past midnight, fill missing stop times.
  function chain(list) {
    for (var i = 1; i < list.length; i++) {
      while (list[i].start < list[i - 1].start) {
        var shift = list[i].stop ? list[i].stop - list[i].start : 0;
        list[i].start = addDays(list[i].start, 1);
        if (list[i].stop) list[i].stop = new Date(list[i].start.getTime() + shift);
      }
    }
    for (i = 0; i < list.length; i++) {
      if (!list[i].stop) list[i].stop = list[i + 1] ? list[i + 1].start : new Date(list[i].start.getTime() + 30 * 60000);
    }
    return list;
  }

  function html(text) { return new DOMParser().parseFromString(text, 'text/html'); }

  var sources = {
    virgin: {
      perDay: true,
      url: function (day) {
        return 'https://www.virginmediatelevision.ie/includes/ajax/tv_guide.php?date=' + ymd(day);
      },
      parse: function (text, day) {
        var out = {};
        var doc = html(text);
        var rows = doc.querySelectorAll('.programs[data-channel]');
        for (var r = 0; r < rows.length; r++) {
          var items = rows[r].querySelectorAll('.program > .info');
          var list = [];
          for (var i = 0; i < items.length; i++) {
            var info = items[i];
            // data-time is "9.00pm - 10.00pm"; the end time is the real one (data-minutes only
            // counts the part of a programme that falls inside this day).
            var parts = (info.getAttribute('data-time') || '').split('-');
            var start = parseClock(day, parts[0]);
            if (!start) continue;
            var stop = parseClock(day, parts[1]);
            if (stop && stop <= start) stop = addDays(stop, 1);
            var h2 = info.querySelector('h2');
            list.push({
              title: h2 ? h2.textContent.trim() : '',
              start: start, stop: stop,
              image: info.getAttribute('data-image') || null,
              desc: info.getAttribute('data-description') || ''
            });
          }
          // Each day's page starts with the programme that began the evening before
          // (e.g. "11.05pm - 12.05am"): move it back a day.
          if (list.length > 1 && list[0].start > list[1].start) {
            list[0].start = addDays(list[0].start, -1);
            if (list[0].stop) list[0].stop = addDays(list[0].stop, -1);
          }
          out[rows[r].getAttribute('data-channel')] = chain(list);
        }
        return out;
      }
    },

    tvireland: {
      url: function (day, id) {
        return 'https://www.tvireland.ie/tv/listings/channel/' + id + '?dt=' + ymd(day);
      },
      parse: function (text, day, id) {
        var doc = html(text);
        var rows = doc.querySelectorAll('table.table tbody tr');
        var list = [];
        for (var i = 0; i < rows.length; i++) {
          var a = rows[i].querySelector('td:nth-child(2) a');
          if (!a) continue;
          // The link carries the exact local start time: ...&tm=2023-11-25+00%3A20%3A00
          var start = null;
          var tm = /[?&]tm=([^&]+)/.exec(a.getAttribute('href') || '');
          if (tm) {
            var m = /(\d{4})-(\d{2})-(\d{2})\s(\d{2}):(\d{2})/.exec(decodeURIComponent(tm[1].replace(/\+/g, ' ')));
            if (m) start = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
          }
          if (!start) start = parseClock(day, rows[i].querySelector('td').textContent);
          if (!start) continue;
          var title = a.textContent.trim();
          list.push({ title: /^close$/i.test(title) ? 'Off air' : title, start: start, image: null, desc: '' });
        }
        var out = {};
        out[id] = chain(list);
        return out;
      }
    },

    sky: {
      perDay: true,
      headers: { 'X-SkyOTT-Territory': 'GB' },
      // Sky's schedule days are UK/Irish local days.
      url: function (day, id, ids) {
        return 'https://awk.epgsky.com/hawk/linear/schedule/' + ymd(day).replace(/-/g, '') + '/' + ids.join(',');
      },
      parse: function (text) {
        var out = {};
        var data = JSON.parse(text);
        (data.schedule || []).forEach(function (s) {
          out[String(s.sid)] = (s.events || []).map(function (e) {
            var start = new Date(e.st * 1000);
            return {
              title: e.t,
              start: start,
              stop: new Date(start.getTime() + e.d * 1000),
              image: e.programmeuuid ? 'https://images.metadata.sky.com/pd-image/' + e.programmeuuid + '/16-9/640' : null,
              desc: e.sy || ''
            };
          });
        });
        return out;
      }
    }
  };

  // All Sky channel IDs we ask about, so one request covers the whole Sport row.
  var skyIds = (TVHUB_DEFAULTS.sportChannels || []).map(function (c) { return c.sid; });

  function hasProgrammes(data) {
    for (var k in data) if (data[k] && data[k].length) return true;
    return false;
  }

  // Drop cached days older than two days, so a TV left on for weeks doesn't keep growing.
  function prune() {
    var now = Date.now();
    for (var url in cache) if (now - cache[url].at > 2 * DAY) delete cache[url];
  }

  // cb(data) where data is { channelId: [programmes] }, or null if unavailable.
  function fetchDay(source, day, id, cb) {
    var src = sources[source];
    var url = src.url(day, id, skyIds);
    var hit = cache[url];
    if (hit) {
      var age = Date.now() - hit.at;
      if (hit.data ? age < HOUR : age < RETRY_AFTER_FAILURE) return cb(hit.data || hit.last || null);
    }
    if (pending[url]) return pending[url].push(cb);
    pending[url] = [cb];
    prune();
    Platform.getText(url, src.headers, function (err, text) {
      var data = null;
      if (!err) {
        try { data = src.parse(text, day, id); } catch (e) { data = null; }
      }
      // A page that parses to nothing means the site changed: treat it as a failure.
      if (data && !hasProgrammes(data)) data = null;
      var last = hit && (hit.data || hit.last);
      cache[url] = { at: Date.now(), data: data, last: data ? null : last };
      var cbs = pending[url];
      delete pending[url];
      // If a refresh fails, keep showing the older listings we already had.
      cbs.forEach(function (f) { f(data || last || null); });
    });
  }

  function pick(list, now) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].start <= now && now < list[i].stop) return { now: list[i], next: list[i + 1] || null };
    }
    return null;
  }

  // cb({ now, next, unavailable }) for a channel. now/next are programmes or null;
  // unavailable is true when the listings couldn't be loaded at all.
  function nowNext(source, id, cb) {
    var now = new Date();
    fetchDay(source, now, id, function (today) {
      var found = today && today[id] && pick(today[id], now);
      if (found) return cb(found);
      // Just after midnight the current programme may only be on yesterday's listings.
      fetchDay(source, addDays(now, -1), id, function (yday) {
        var merged = ((yday && yday[id]) || []).concat((today && today[id]) || []);
        found = pick(merged, now);
        if (found) return cb(found);
        if (!Platform.isTv) return cb(demo(id));
        cb({ now: null, next: null, unavailable: !today && !yday });
      });
    });
  }

  // In a desktop browser the listing sites block requests, so show made-up programmes.
  var DEMO = {
    'one': ['Ireland AM', 'The Six O’Clock Show'], 'two': ['Coronation Street', 'Emmerdale'],
    '81/rte-one': ['Nationwide', 'The Late Late Show'], '82/rte2': ['Hometown Heroes', 'The Tonight Show'],
    '1309': ['Live: Premier League — Arsenal v Liverpool', 'Super Sunday Highlights'],
    '1312': ['Live: Premier League — Man City v Spurs', 'The Football Show'],
    '3840': ['EFL Highlights', 'Live: Championship — Leeds v Sunderland'],
    '1306': ['Live: F1 Qualifying — Brazil', 'Ted’s Qualifying Notebook'],
    '1324': ['Live: DP World Tour Golf', 'Golf Highlights'],
    '1302': ['Cricket: Ashes Classics', 'Live: The Hundred'],
    '1333': ['Live: NFL — Chiefs v Bills', 'NFL Redzone']
  };
  function demo(id) {
    var titles = DEMO[id] || ['Live programme', 'Coming up next'];
    var start = new Date(Date.now() - 25 * 60000);
    var mid = new Date(Date.now() + 35 * 60000);
    return {
      now: { title: titles[0], start: start, stop: mid, image: null, desc: 'Demo listing — real listings appear on the TV.' },
      next: { title: titles[1], start: mid, stop: new Date(mid.getTime() + 3600000), image: null, desc: '' }
    };
  }

  function progress(p) {
    if (!p) return 0;
    var span = p.stop - p.start;
    return span > 0 ? Math.max(0, Math.min(1, (Date.now() - p.start) / span)) : 0;
  }

  function clock(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  return { nowNext: nowNext, progress: progress, clock: clock, _sources: sources };
})();
