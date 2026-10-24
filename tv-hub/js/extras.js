/*
 * Weather and sport stats.
 *   Weather - Open-Meteo (free, no account), today and tomorrow for your town
 *   F1      - jolpica-f1, the open successor to the Ergast F1 API: standings and race weekend times
 *   PL/NFL  - ESPN's public site API (unofficial): Premier League table, this week's NFL games
 * Every call is cached and fails quietly: cb(null) means "unavailable right now".
 */
var Extras = (function () {
  var cache = {};

  function getJson(url, maxAge, cb) {
    var hit = cache[url];
    if (hit && Date.now() - hit.at < (hit.data ? maxAge : 5 * 60000)) return cb(hit.data);
    Platform.getText(url, null, function (err, text) {
      var data = null;
      if (!err) { try { data = JSON.parse(text); } catch (e) { data = null; } }
      // Keep showing the last good answer if a refresh fails.
      cache[url] = { at: Date.now(), data: data || (hit && hit.data) || null };
      cb(cache[url].data);
    });
  }

  // ---------------------------------------------------------------- weather

  var WMO = {
    0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Cloudy', 45: 'Fog', 48: 'Fog',
    51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 56: 'Freezing drizzle', 57: 'Freezing drizzle',
    61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain',
    71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow', 80: 'Showers', 81: 'Showers', 82: 'Heavy showers',
    85: 'Snow showers', 86: 'Snow showers', 95: 'Thunderstorms', 96: 'Thunderstorms', 99: 'Thunderstorms'
  };

  // cb({ temp, text, todayMin, todayMax, tomorrowMin, tomorrowMax, tomorrowText }) or cb(null)
  function weather(town, cb) {
    var t = (TVHUB_DEFAULTS.towns || []).filter(function (x) { return x[0] === town; })[0] || TVHUB_DEFAULTS.towns[0];
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + t[1] + '&longitude=' + t[2] +
      '&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min' +
      '&timezone=Europe%2FDublin&forecast_days=2';
    getJson(url, 30 * 60000, function (d) {
      if (!d || !d.current || !d.daily) return cb(Platform.isTv ? null : { temp: 14, text: 'Light rain', todayMin: 9, todayMax: 15, tomorrowMin: 8, tomorrowMax: 13, tomorrowText: 'Showers' });
      var r = Math.round;
      cb({
        temp: r(d.current.temperature_2m), text: WMO[d.current.weather_code] || '',
        todayMin: r(d.daily.temperature_2m_min[0]), todayMax: r(d.daily.temperature_2m_max[0]),
        tomorrowMin: r(d.daily.temperature_2m_min[1]), tomorrowMax: r(d.daily.temperature_2m_max[1]),
        tomorrowText: WMO[d.daily.weather_code[1]] || ''
      });
    });
  }

  // ---------------------------------------------------------------- F1

  var F1 = 'https://api.jolpi.ca/ergast/f1/current';
  function utc(date, time) { return new Date(date + 'T' + (time || '12:00:00Z')); }

  // cb({ race: { name, circuit, sessions: [{ name, start }] }, drivers: [...], teams: [...] }) — parts may be missing
  function f1(cb) {
    var out = {}, left = 3;
    function done() { if (--left === 0) cb(out.race || out.drivers || out.teams ? out : (Platform.isTv ? null : demoF1())); }
    getJson(F1 + '.json?limit=40', 6 * 3600000, function (d) {
      var races = d && d.MRData && d.MRData.RaceTable && d.MRData.RaceTable.Races || [];
      var now = Date.now();
      for (var i = 0; i < races.length; i++) {
        var r = races[i];
        if (!r || !r.date) continue;
        var raceStart = utc(r.date, r.time);
        if (raceStart.getTime() + 3 * 3600000 < now) continue; // finished
        var sessions = [];
        [['FirstPractice', 'Practice 1'], ['SecondPractice', 'Practice 2'], ['ThirdPractice', 'Practice 3'],
          ['SprintQualifying', 'Sprint qualifying'], ['SprintShootout', 'Sprint shootout'], ['Sprint', 'Sprint'],
          ['Qualifying', 'Qualifying']].forEach(function (p) {
          if (r[p[0]] && r[p[0]].date) sessions.push({ name: p[1], start: utc(r[p[0]].date, r[p[0]].time) });
        });
        sessions.push({ name: 'Race', start: raceStart });
        sessions.sort(function (a, b) { return a.start - b.start; });
        out.race = { name: r.raceName, round: r.round, circuit: r.Circuit && r.Circuit.circuitName, sessions: sessions };
        break;
      }
      done();
    });
    getJson(F1 + '/driverStandings.json', 3 * 3600000, function (d) {
      var table = d && d.MRData && d.MRData.StandingsTable;
      var list = table && table.StandingsLists && table.StandingsLists[0];
      if (list && list.DriverStandings) out.drivers = list.DriverStandings.filter(function (x) { return x && x.Driver; }).map(function (x) {
        return { pos: x.position, name: [x.Driver.givenName, x.Driver.familyName].join(' ').trim(),
          team: x.Constructors && x.Constructors[0] ? x.Constructors[0].name : '', points: x.points, wins: x.wins };
      });
      done();
    });
    getJson(F1 + '/constructorStandings.json', 3 * 3600000, function (d) {
      var table = d && d.MRData && d.MRData.StandingsTable;
      var list = table && table.StandingsLists && table.StandingsLists[0];
      if (list && list.ConstructorStandings) out.teams = list.ConstructorStandings.filter(function (x) { return x && x.Constructor; }).map(function (x) {
        return { pos: x.position, name: x.Constructor.name, points: x.points, wins: x.wins };
      });
      done();
    });
  }

  // ---------------------------------------------------------------- Premier League

  function stat(entry, names) {
    var stats = entry.stats || [];
    for (var n = 0; n < names.length; n++) {
      for (var i = 0; i < stats.length; i++) {
        if (stats[i].name === names[n] || stats[i].abbreviation === names[n]) {
          return stats[i].value != null ? stats[i].value : parseFloat(stats[i].displayValue);
        }
      }
    }
    return null;
  }

  // cb([{ pos, team, played, won, drawn, lost, gd, points }]) or cb(null)
  function premierLeague(cb) {
    getJson('https://site.api.espn.com/apis/v2/sports/soccer/eng.1/standings', 3 * 3600000, function (d) {
      var entries = d && d.children && d.children[0] && d.children[0].standings && d.children[0].standings.entries;
      if (!entries || !entries.length) return cb(Platform.isTv ? null : demoPL());
      var rows = entries.map(function (e) {
        return {
          pos: stat(e, ['rank']), team: e.team && (e.team.shortDisplayName || e.team.displayName),
          played: stat(e, ['gamesPlayed', 'GP']), won: stat(e, ['wins', 'W']), drawn: stat(e, ['ties', 'D']),
          lost: stat(e, ['losses', 'L']), gd: stat(e, ['pointDifferential', 'GD']), points: stat(e, ['points', 'P'])
        };
      });
      rows.sort(function (a, b) { return (a.pos || 99) - (b.pos || 99) || (b.points || 0) - (a.points || 0); });
      rows.forEach(function (r, i) { if (!r.pos) r.pos = i + 1; });
      cb(rows);
    });
  }

  // ---------------------------------------------------------------- NFL

  // cb([{ start, state: 'pre'|'in'|'post', detail, away: {name, score}, home: {name, score} }]) or cb(null)
  function nfl(cb) {
    getJson('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard', 10 * 60000, function (d) {
      var events = d && d.events;
      if (!events) return cb(Platform.isTv ? null : demoNFL());
      cb(events.filter(Boolean).map(function (ev) {
        var comp = ev.competitions && ev.competitions[0] || {};
        var side = function (where) {
          var c = (comp.competitors || []).filter(function (x) { return x.homeAway === where; })[0] || {};
          return { name: c.team ? (c.team.shortDisplayName || c.team.displayName) : '?', score: c.score };
        };
        var type = ev.status && ev.status.type || {};
        return { start: new Date(ev.date), state: type.state, detail: type.shortDetail || type.detail || '', away: side('away'), home: side('home') };
      }).sort(function (a, b) { return a.start - b.start; }));
    });
  }

  // ---------------------------------------------------------------- demo data (desktop browser only)

  function demoF1() {
    var h = 3600000, now = Date.now();
    return {
      race: { name: 'Brazilian Grand Prix', circuit: 'Interlagos', sessions: [
        { name: 'Practice 1', start: new Date(now - 26 * h) }, { name: 'Sprint qualifying', start: new Date(now - 22 * h) },
        { name: 'Sprint', start: new Date(now + 2 * h) }, { name: 'Qualifying', start: new Date(now + 6 * h) },
        { name: 'Race', start: new Date(now + 26 * h) }] },
      drivers: [{ pos: 1, name: 'Demo Driver', team: 'Demo Racing', points: 300, wins: 8 }, { pos: 2, name: 'Second Driver', team: 'Other Team', points: 280, wins: 5 }],
      teams: [{ pos: 1, name: 'Demo Racing', points: 520, wins: 10 }]
    };
  }
  function demoPL() {
    return [{ pos: 1, team: 'Arsenal', played: 10, won: 8, drawn: 1, lost: 1, gd: 15, points: 25 },
      { pos: 2, team: 'Liverpool', played: 10, won: 7, drawn: 2, lost: 1, gd: 12, points: 23 }];
  }
  function demoNFL() {
    var now = Date.now();
    return [{ start: new Date(now - 3 * 3600000), state: 'post', detail: 'Final', away: { name: 'Chiefs', score: '24' }, home: { name: 'Bills', score: '21' } },
      { start: new Date(now + 26 * 3600000), state: 'pre', detail: 'Sun 6:00 PM', away: { name: 'Eagles', score: '0' }, home: { name: 'Cowboys', score: '0' } }];
  }

  return { weather: weather, f1: f1, premierLeague: premierLeague, nfl: nfl };
})();
