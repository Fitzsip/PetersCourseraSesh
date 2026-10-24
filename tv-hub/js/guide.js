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
 */
var Guide = (function () {
  var cache = {};    // "source|date|id" -> { at: ms, data } where data is { channelId: [programmes] }
  var pending = {};  // same key -> [callbacks] while a request is in flight
  var HOUR = 3600 * 1000;

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function ymdUtc(d) { return '' + d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()); }
  function addDays(d, n) { var c = new Date(d.getTime()); c.setDate(c.getDate() + n); return c; }

  // "9.30pm" on a given day -> Date (TV's local time, which is Irish time at home)
  function parseClock(day, text) {
    var m = /(\d{1,2})[.:](\d{2})\s*(am|pm)/i.exec(text || '');
    if (!m) return null;
    var h = parseInt(m[1], 10) % 12;
    if (m[3].toLowerCase() === 'pm') h += 12;
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, parseInt(m[2], 10));
  }

  // Programmes in a list run back to back: fill missing stop times and roll past midnight.
  function chain(list) {
    for (var i = 0; i < list.length; i++) {
      var p = list[i], prev = list[i - 1];
      if (prev && p.start < prev.start) p.start = addDays(p.start, 1);
      if (prev && !prev.stop) prev.stop = p.start;
    }
    var last = list[list.length - 1];
    if (last && !last.stop) last.stop = new Date(last.start.getTime() + 30 * 60000);
    for (i = 0; i < list.length; i++) {
      if (list[i].stop <= list[i].start) list[i].stop = addDays(list[i].stop, 1);
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
            var start = parseClock(day, info.getAttribute('data-time'));
            if (!start) continue;
            var h2 = info.querySelector('h2');
            list.push({
              title: h2 ? h2.textContent.trim() : '',
              start: start,
              mins: parseInt((info.querySelector('.time') || info).getAttribute('data-minutes'), 10) || 0,
              image: info.getAttribute('data-image') || null,
              desc: info.getAttribute('data-description') || ''
            });
          }
          chain(list).forEach(function (p) {
            if (p.mins) p.stop = new Date(p.start.getTime() + p.mins * 60000);
          });
          out[rows[r].getAttribute('data-channel')] = list;
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
      url: function (day, id, ids) {
        return 'https://awk.epgsky.com/hawk/linear/schedule/' + ymdUtc(day) + '/' + ids.join(',');
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

  function fetchDay(source, day, id, cb) {
    var src = sources[source];
    var key = source + '|' + ymd(day) + (src.perDay ? '' : '|' + id);
    var hit = cache[key];
    if (hit && Date.now() - hit.at < HOUR) return cb(hit.data);
    if (pending[key]) return pending[key].push(cb);
    pending[key] = [cb];
    var url = src.url(day, id, skyIds);
    Platform.getText(url, src.headers, function (err, text) {
      var data = null;
      if (!err) {
        try { data = src.parse(text, day, id); } catch (e) { data = null; }
      }
      if (data) cache[key] = { at: Date.now(), data: data };
      else if (hit) data = hit.data; // keep showing older listings if a refresh fails
      var cbs = pending[key];
      delete pending[key];
      cbs.forEach(function (f) { f(data); });
    });
  }

  function pick(list, now) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].start <= now && now < list[i].stop) return { now: list[i], next: list[i + 1] || null };
    }
    return null;
  }

  // cb({ now, next }) for a channel. now/next are programmes or null.
  function nowNext(source, id, cb) {
    var now = new Date();
    fetchDay(source, now, id, function (today) {
      var found = today && today[id] && pick(today[id], now);
      if (found) return cb(found);
      // Late at night the current programme may be on yesterday's listings.
      fetchDay(source, addDays(now, -1), id, function (yday) {
        var merged = ((yday && yday[id]) || []).concat((today && today[id]) || []);
        found = pick(merged, now);
        if (found) return cb(found);
        cb(Platform.isTv ? { now: null, next: null } : demo(id));
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
