/*
 * TV Hub — one home screen for streaming apps, shows you follow, live satellite channels,
 * channels on the RTÉ / Virgin Media players, and Sky Sports on NOW.
 * Written in plain ES2015 so it runs on older Samsung TVs (Tizen 4/5, 2018-2019 models).
 */
(function () {
  'use strict';

  var STORE_KEY = 'tvhub.v1';
  var HOTKEYS = ['red', 'green', 'yellow', 'blue'];
  var PALETTE = ['#e50914', '#113ccf', '#00a8e1', '#ff0000', '#8e24aa', '#00897b', '#f4511e', '#3949ab', '#6d4c41'];
  var PLAYER = TVHUB_DEFAULTS.playerChannels;
  var SPORT = TVHUB_DEFAULTS.sportChannels;
  var SPORTS = TVHUB_DEFAULTS.sports;
  var SKY_COLOUR = '#003f8c';
  var MINUTE = 60000, HOUR = 60 * MINUTE;

  function $(id) { return document.getElementById(id); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  // Image URLs come from web listings, so escape them before putting them in CSS.
  function setImage(e, url) {
    e.style.backgroundImage = url ? 'url("' + String(url).replace(/["\\\n\r]/g, encodeURIComponent) + '")' : '';
  }
  function trim(s, n) { return s && s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : (s || ''); }

  // ---------------------------------------------------------------- state

  var state = load();

  function defaultSportHidden() {
    return SPORT.filter(function (c) { return c.hidden; }).map(function (c) { return c.key; });
  }

  function fresh() {
    var d = clone(TVHUB_DEFAULTS);
    return {
      version: d.version, apps: d.apps, channels: d.channels, online: d.online, shows: d.shows,
      sportHidden: defaultSportHidden(), mySports: d.mySports, options: d.options, usage: {}, lastKey: null, alerted: {}
    };
  }

  function load() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) {}
    if (!saved || typeof saved !== 'object') return fresh();
    var opts = clone(TVHUB_DEFAULTS.options);
    for (var k in saved.options) opts[k] = saved.options[k];
    saved.options = opts;
    saved.usage = saved.usage || {};
    migrate(saved);
    // Whatever was saved, every list must exist or the screens can't be drawn.
    var d = TVHUB_DEFAULTS;
    var lists = { apps: d.apps, channels: [], online: d.online, shows: [], sportHidden: defaultSportHidden(), mySports: d.mySports };
    for (var key in lists) if (!Array.isArray(saved[key])) saved[key] = clone(lists[key]);
    if (!saved.alerted || typeof saved.alerted !== 'object') saved.alerted = {};
    return saved;
  }

  // Bring a setup saved by an older version up to date, one version at a time, without losing anything.
  function migrate(s) {
    var d = clone(TVHUB_DEFAULTS);
    var v = s.version || 1;
    if (!Array.isArray(s.apps)) s.apps = d.apps;
    if (!Array.isArray(s.channels)) s.channels = [];
    if (v < 2) {
      // Version 2 added NOW, RTÉ Player and Virgin Media Player, My shows and Sport.
      d.apps.forEach(function (app, i) {
        var mine = s.apps.filter(function (a) { return a.id === app.id; })[0];
        if (!mine) s.apps.splice(Math.min(i, s.apps.length), 0, app);
      });
      s.shows = s.shows || [];
      s.sportHidden = s.sportHidden || [];
    }
    if (v < 3) {
      // Version 3 keeps online channels in their own list and remembers the last channel by
      // its number instead of its position.
      var last = s.channels[s.lastChannel || 0];
      var players = s.channels.filter(function (c) { return c.kind === 'player'; });
      s.online = v < 2 ? d.online : players.map(function (c) { return c.guide; });
      s.channels = s.channels.filter(function (c) { return c.kind !== 'player'; });
      s.lastKey = last && last.kind !== 'player' ? chKey(last) : null;
      delete s.lastChannel;
      // Tighter name patterns for finding apps on the TV.
      s.apps.forEach(function (a) {
        var def = d.apps.filter(function (x) { return x.id === a.id; })[0];
        if (def) a.match = def.match;
      });
    }
    if (v < 4) {
      // Version 4 adds "My sports" and starts the less-watched Sky Sports channels hidden.
      s.mySports = d.mySports;
      s.sportHidden = defaultSportHidden();
    }
    s.version = d.version;
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  function appById(id) { return state.apps.filter(function (a) { return a.id === id; })[0]; }
  function isBuiltIn(app) { return TVHUB_DEFAULTS.apps.some(function (a) { return a.id === app.id; }); }

  function visibleApps() {
    var apps = state.apps.filter(function (a) { return !a.hidden; });
    if (state.options.smartOrder) {
      var order = state.apps.slice();
      apps.sort(function (a, b) {
        var diff = (state.usage[b.id] || 0) - (state.usage[a.id] || 0);
        return diff || order.indexOf(a) - order.indexOf(b);
      });
    }
    return apps;
  }

  function appForHotkey(colour) {
    return state.apps.filter(function (a) { return a.hotkey === colour && !a.hidden; })[0];
  }

  function chKey(c) { return c.major + '-' + (c.minor || 0); }
  function channelLabel(c) { return c.minor ? c.major + '-' + c.minor : String(c.major); }
  function channelIndex(key) {
    for (var i = 0; i < state.channels.length; i++) if (chKey(state.channels[i]) === key) return i;
    return -1;
  }
  function lastIndex() {
    var i = channelIndex(state.lastKey);
    return i !== -1 ? i : (state.channels.length ? 0 : -1);
  }

  // ---------------------------------------------------------------- navigation

  // A screen's focusable items live in `.nav-row` containers. LEFT/RIGHT moves within a row.
  // UP/DOWN moves between rows: on the home screen to the tile nearest on screen, in lists
  // (settings, pickers) to the start of the row.
  function Nav(root, mode) {
    this.root = root;
    this.mode = mode || 'nearest';
    this.r = 0;
    this.c = 0;
  }
  Nav.prototype.rows = function () {
    return Array.prototype.filter.call(this.root.querySelectorAll('.nav-row'), function (row) {
      return !row.classList.contains('hidden') && row.querySelector('.focusable');
    });
  };
  Nav.prototype.items = function (row) { return row ? row.querySelectorAll('.focusable') : []; };
  Nav.prototype.current = function () {
    var row = this.rows()[this.r];
    return row ? this.items(row)[this.c] : null;
  };
  Nav.prototype.currentKey = function () {
    var cur = this.current();
    return cur ? cur.getAttribute('data-key') : null;
  };
  Nav.prototype.focus = function (r, c) {
    var rows = this.rows();
    if (!rows.length) return;
    this.r = Math.max(0, Math.min(r, rows.length - 1));
    var items = this.items(rows[this.r]);
    this.c = Math.max(0, Math.min(c, items.length - 1));
    var prev = this.root.querySelectorAll('.focused');
    for (var i = 0; i < prev.length; i++) prev[i].classList.remove('focused');
    var cur = items[this.c];
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    cur.classList.add('focused');
    scrollIntoView(cur);
    if (cur.onfocusitem) cur.onfocusitem();
  };
  // Focus the item with this data-key if it's still there (e.g. after the screen is rebuilt).
  Nav.prototype.focusKey = function (key) {
    var rows = this.rows();
    for (var r = 0; key && r < rows.length; r++) {
      var items = this.items(rows[r]);
      for (var c = 0; c < items.length; c++) {
        if (items[c].getAttribute('data-key') === key) return this.focus(r, c);
      }
    }
    this.refresh();
  };
  Nav.prototype.refresh = function () { this.focus(this.r, this.c); };
  Nav.prototype.move = function (action) {
    if (action === 'LEFT') return this.focus(this.r, this.c - 1);
    if (action === 'RIGHT') return this.focus(this.r, this.c + 1);
    var r = this.r + (action === 'UP' ? -1 : action === 'DOWN' ? 1 : 0);
    if (r === this.r) return;
    var rows = this.rows();
    if (r < 0 || r >= rows.length) return;
    if (this.mode === 'first') return this.focus(r, 0);
    // Pick the item in the new row whose centre is closest to the current one.
    var cur = this.current();
    var x = cur ? centreX(cur) : 0;
    var items = this.items(rows[r]);
    var best = 0, bestDist = Infinity;
    for (var i = 0; i < items.length; i++) {
      var d = Math.abs(centreX(items[i]) - x);
      if (d < bestDist) { best = i; bestDist = d; }
    }
    this.focus(r, best);
  };
  Nav.prototype.select = function () {
    var cur = this.current();
    if (cur && cur.onselect) cur.onselect();
  };
  function centreX(e) { var b = e.getBoundingClientRect(); return b.left + b.width / 2; }

  // Keeps the focused item on screen: tile rows slide sideways, the home rows and
  // settings panels scroll vertically.
  var homeScroll = 0;
  function scrollIntoView(item) {
    var row = item.parentNode;
    if (row.classList.contains('tiles')) {
      var left = item.offsetLeft - row.offsetLeft;
      var shift = Math.max(0, left + item.offsetWidth - 1728 + 60);
      row.style.transform = 'translateX(' + (-shift) + 'px)';
    }
    if (row.parentNode && row.parentNode.id === 'rows') {
      var title = row.previousElementSibling;
      // The focused row sits at the top, with the rows below it in view.
      var top = (title && title.classList.contains('row-title') ? title : row).offsetTop - row.parentNode.offsetTop;
      var maxScroll = Math.max(0, row.parentNode.scrollHeight - row.parentNode.parentNode.clientHeight);
      homeScroll = Math.min(top, maxScroll);
      row.parentNode.style.transform = 'translateY(' + (-homeScroll) + 'px)';
    }
    var scroller = item.closest ? item.closest('.scroll') : null;
    if (scroller) {
      var y = (item.getBoundingClientRect().top - scroller.getBoundingClientRect().top) / getScale() + scroller.scrollTop;
      if (y < scroller.scrollTop + 40) scroller.scrollTop = y - 40;
      else if (y + item.offsetHeight > scroller.scrollTop + scroller.clientHeight - 40) {
        scroller.scrollTop = y + item.offsetHeight - scroller.clientHeight + 40;
      }
    }
  }

  // ---------------------------------------------------------------- screens

  var screens = {};
  var current = 'home';
  var OVERLAYS = ['settings', 'picker', 'search', 'pair', 'stats', 'backup'];

  function show(name) {
    var prev = current;
    current = name;
    clearTimeout(previewTimer);
    cancelLaunch();
    ['home', 'watch'].concat(OVERLAYS).forEach(function (s) {
      var on = s === name || (s === 'home' && OVERLAYS.indexOf(name) !== -1);
      $(s).classList.toggle('active', on);
    });
    if (screens[name] && screens[name].enter) screens[name].enter(prev);
  }

  // ---------------------------------------------------------------- hero (top half of home)

  // o: { eyebrow, title, line1, line2, hint, progress (0-1 or null), warn, art: {image, color, label} | null }
  // art null = show the live satellite picture in the preview box.
  function hero(o) {
    $('hero-eyebrow').textContent = o.eyebrow || '';
    $('hero-title').textContent = o.title || '';
    $('hero-title').classList.toggle('long', (o.title || '').length > 26);
    $('hero-line1').textContent = o.line1 || '';
    $('hero-line2').textContent = o.line2 || '';
    $('hero-hint').textContent = o.hint || '';
    var bar = $('hero-bar');
    bar.classList.toggle('hidden', o.progress == null);
    bar.firstChild.style.width = Math.round((o.progress || 0) * 100) + '%';
    var art = $('preview-art');
    art.classList.toggle('hidden', !o.art);
    if (o.art) {
      art.style.backgroundColor = o.art.color || '';
      setImage(art, o.art.image);
      art.classList.toggle('has-image', !!o.art.image);
      art.firstChild.textContent = o.art.label || '';
    }
  }

  function untilText(p) { return p ? 'until ' + Guide.clock(p.stop) : ''; }
  var UNAVAILABLE = 'Listings unavailable right now — OK still opens the app';

  // ---------------------------------------------------------------- live data

  // Latest listings, shared by every tile that shows them.
  var sportNow = {};      // sport channel key -> { now, next, unavailable }
  var onlineNow = {};     // player key -> { now, next, unavailable }
  var sportEvents = null; // live and upcoming events for the sports you follow (null until loaded)
  // Tiles register a painter per data key; painters only update their own tile.
  var painters = {};
  function onPaint(key, fn) { (painters[key] = painters[key] || []).push(fn); }
  function paint(key) { (painters[key] || []).forEach(function (f) { f(); }); }

  function isLiveEvent(p) { return !!p && /\blive\b/i.test(p.title); }
  function visibleSport() {
    return SPORT.filter(function (c) { return state.sportHidden.indexOf(c.key) === -1; });
  }
  var SID_CHANNEL = {};
  SPORT.forEach(function (c) { SID_CHANNEL[c.sid] = c; });

  // The followed sport a programme belongs to, or null. Only live coverage counts.
  var sportRes = SPORTS.map(function (sp) {
    return { sp: sp, re: new RegExp(sp.match, 'i'), not: sp.not ? new RegExp(sp.not, 'i') : null };
  });
  function followedSport(title) {
    if (!/\blive\b/i.test(title)) return null;
    for (var i = 0; i < sportRes.length; i++) {
      var x = sportRes[i];
      if (state.mySports.indexOf(x.sp.key) === -1) continue;
      if (x.re.test(title) && !(x.not && x.not.test(title))) return x.sp;
    }
    return null;
  }

  function hash(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  // Live and upcoming events for the sports you follow, once each even when two channels
  // show them (e.g. Sky Sports Premier League and Main Event).
  function buildEvents(list) {
    var now = Date.now(), byKey = {}, out = [];
    list.forEach(function (p) {
      if (p.stop <= now) return;
      var sport = followedSport(p.title);
      if (!sport) return;
      var title = p.title.replace(/^\s*live:?\s*/i, '');
      var id = title.toLowerCase() + '|' + p.start.getTime();
      var ch = SID_CHANNEL[p.sid];
      var e = byKey[id];
      if (e) {
        if (e.channels.indexOf(ch) === -1) e.channels.push(ch);
        if (!e.image) e.image = p.image;
        return;
      }
      e = byKey[id] = { key: 'ev-' + hash(id), title: title, start: p.start, stop: p.stop,
        image: p.image, desc: p.desc, sport: sport, channels: [ch] };
      out.push(e);
    });
    return out;
  }

  function liveEvents() {
    var now = Date.now();
    return (sportEvents || []).filter(function (e) { return e.start <= now && now < e.stop; });
  }

  // Fetch (or re-read from the guide cache) everything the home screen shows. Results only
  // repaint tiles; rows whose set of tiles changes are rebuilt separately (scheduleRebuild).
  function refreshData() {
    state.online.forEach(function (k) {
      var def = PLAYER[k];
      if (!def) return;
      Guide.nowNextAny(def.feeds, function (nn) { onlineNow[k] = nn; paint('online-' + k); });
    });
    visibleSport().forEach(function (c) {
      Guide.nowNext('sky', c.sid, function (nn) { sportNow[c.key] = nn; paint('sport-' + c.key); });
    });
    Guide.skySchedule(SPORT.map(function (c) { return c.sid; }), 3, function (list) {
      sportEvents = buildEvents(list);
      paint('events');
      checkAlerts();
      scheduleRebuild();
    });
    pollMusic();
    loadMusicLists();
    state.channels.forEach(function (ch) { paint('sat-' + chKey(ch)); });
  }

  // ---------------------------------------------------------------- home

  var homeNav = new Nav($('home'), 'nearest');

  // Rebuild the home screen, keeping focus on the same tile if it's still there.
  function renderHome() {
    var key = homeNav.currentKey();
    painters = {};
    renderOnNow();
    renderShows();
    renderApps();
    renderMusic();
    renderChannels();
    renderSport();
    renderTools();
    renderHotkeys();
    shownSignature = signature();
    if (key) homeNav.focusKey(key);
    else homeNav.focus(firstRow(), 0);
    refreshData();
  }

  // The landing row: what's on now, else your shows, else your apps.
  function firstRow() {
    var rows = homeNav.rows();
    var want = ['row-onnow', state.shows.length ? 'row-shows' : '', 'row-apps'];
    for (var w = 0; w < want.length; w++) {
      for (var i = 0; i < rows.length; i++) if (rows[i].id === want[w]) return i;
    }
    return 0;
  }

  function tile(cls, key) {
    var t = el('div', 'tile focusable ' + cls);
    t.setAttribute('data-key', key);
    return t;
  }

  // -- On now: RTÉ / Virgin Media in your order (always first, so nothing pushes them aside),
  //    then up to two live events for the sports you follow, then your last satellite channel.

  // What the rebuildable rows (On now, My sport) contain; they're rebuilt when this changes.
  var shownSignature = '';
  function signature() {
    var keys = function (list) { return list.map(function (e) { return e.key; }).join(); };
    return state.online.join() + '|' + keys(liveEvents()) + '|' + keys((sportEvents || []).slice(0, 12)) + '|' +
      episodesToday().map(function (x) { return x.show.tvmazeId + (x.upcoming ? 'u' : ''); }).join() + '|' +
      (SpotifyApi.isPaired() ? 'S' + (music.lists ? music.lists.map(function (x) { return x.key; }).join() : '-') + (nowItem() && isPlaying() ? 'P' : '') : '');
  }

  function renderOnNow() {
    var row = $('row-onnow');
    row.innerHTML = '';
    state.online.forEach(function (k) { if (PLAYER[k]) row.appendChild(onlineTile(k)); });
    var live = liveEvents();
    live.slice(0, 2).forEach(function (e) { row.appendChild(eventTile(e, 'onnow-')); });
    if (live.length > 2) {
      var more = tile('add', 'onnow-more');
      more.appendChild(el('div', 'name', '+' + (live.length - 2) + ' more live'));
      more.onselect = function () { homeNav.focusKey('sport-' + live[0].key); };
      more.onfocusitem = function () {
        hero({ eyebrow: 'My sport', title: (live.length - 2) + ' more live events', line1: 'They’re all in the My sport row.',
          hint: 'Press OK to go there', art: { color: SKY_COLOUR, label: 'LIVE' } });
      };
      row.appendChild(more);
    }
    if (SpotifyApi.isPaired() && nowItem() && isPlaying()) row.appendChild(onNowMusicTile());
    episodesToday().forEach(function (x) { row.appendChild(episodeTile(x)); });
    var li = lastIndex();
    if (li !== -1) row.appendChild(satelliteTile(state.channels[li], 'onnow-sat', true));
    var empty = !row.firstChild;
    row.classList.toggle('hidden', empty);
    row.previousElementSibling.classList.toggle('hidden', empty);
  }

  // Rebuild when live sport starts or ends, or upcoming events change. Never mid-navigation:
  // wait until the remote has been idle for a few seconds. Focus stays on the same tile.
  var rebuildTimer = null;
  var lastKeyAt = 0;
  function scheduleRebuild(delay) {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(function () {
      if (current !== 'home' || signature() === shownSignature) return;
      var idle = Date.now() - lastKeyAt;
      if (idle < 3000) return scheduleRebuild(3000 - idle);
      renderHome();
    }, delay || 0);
  }

  function onlineTile(k) {
    var def = PLAYER[k];
    var app = appById(def.app) || {};
    var t = tile('pic wide', 'online-' + k);
    t.style.backgroundColor = app.color || '';
    var src = el('div', 'src', app.name || 'Player');
    src.style.background = app.color || '#555';
    t.appendChild(src);
    var name = el('div', 'name small', def.name);
    var sub = el('div', 'sub', 'Loading what’s on…');
    var bar = el('div', 'bar');
    bar.appendChild(el('i'));
    t.appendChild(name);
    t.appendChild(sub);
    t.appendChild(bar);
    var how = 'OK opens ' + (app.name || 'the player') + ' → Live → ' + def.name;
    function draw() {
      var nn = onlineNow[k];
      if (!nn) return;
      if (nn.now) {
        sub.textContent = nn.now.title + ' · ' + untilText(nn.now);
        sub.classList.remove('warn');
        bar.firstChild.style.width = Math.round(Guide.progress(nn.now) * 100) + '%';
        setImage(t, nn.now.image);
      } else {
        sub.textContent = nn.unavailable ? 'Listings unavailable' : 'Nothing listed right now';
        sub.classList.add('warn');
        setImage(t, null);
      }
      if (t.classList.contains('focused')) t.onfocusitem();
    }
    onPaint('online-' + k, draw);
    t.onselect = function () { openPlayerChannel(k); };
    t.onfocusitem = function () {
      var nn = onlineNow[k];
      hero({
        eyebrow: 'Live on ' + def.name, title: nn && nn.now ? nn.now.title : def.name,
        line1: !nn ? 'Loading what’s on…' : nn.now ? Guide.clock(nn.now.start) + ' – ' + Guide.clock(nn.now.stop)
          : nn.unavailable ? UNAVAILABLE : 'Nothing listed right now',
        progress: nn && nn.now ? Guide.progress(nn.now) : null,
        line2: nn && nn.next ? 'Next at ' + Guide.clock(nn.next.start) + ': ' + nn.next.title : trim(nn && nn.now && nn.now.desc, 160),
        hint: how,
        art: { image: nn && nn.now && nn.now.image, color: app.color, label: def.name }
      });
    };
    draw();
    return t;
  }

  function openPlayerChannel(k) {
    var def = PLAYER[k];
    var app = appById(def.app);
    if (!app) return toast('Add ' + def.name + '’s app in Settings first');
    openApp(app, 'Opening ' + app.name + ' — choose Live, then ' + def.name, 1500);
  }

  // -- My shows

  var showTried = {};
  // New episodes first, then the order you set in Settings.
  function sortedShows() {
    var order = state.shows.slice();
    return state.shows.slice().sort(function (a, b) {
      return (Shows.isNew(b) ? 1 : 0) - (Shows.isNew(a) ? 1 : 0) || order.indexOf(a) - order.indexOf(b);
    });
  }

  function renderShows() {
    var row = $('row-shows');
    row.innerHTML = '';
    sortedShows().forEach(function (s) {
      var app = appById(s.app) || {};
      var t = tile('show', 'show-' + s.tvmazeId);
      var poster = el('div', 'poster', s.info && s.info.poster ? '' : s.name.charAt(0));
      setImage(poster, s.info && s.info.poster);
      var body = el('div', 'body');
      var src = el('div', 'src', app.name || 'Choose app');
      src.style.background = app.color || '#555';
      src.style.color = app.text || '#fff';
      body.appendChild(src);
      body.appendChild(el('div', 'name small', s.name));
      body.appendChild(el('div', 'sub', Shows.status(s)));
      if (Shows.isNew(s)) body.appendChild(el('div', 'flag new', 'NEW EPISODE'));
      t.appendChild(poster);
      t.appendChild(body);
      t.onselect = function () { openShow(s); };
      t.onfocusitem = function () { heroShow(s); };
      row.appendChild(t);

      var stale = !s.info || Date.now() - s.info.at > 6 * HOUR;
      if (stale && Date.now() - (showTried[s.tvmazeId] || 0) > 10 * MINUTE) {
        showTried[s.tvmazeId] = Date.now();
        Shows.refresh(s, function () { save(); scheduleShowsRender(); });
      }
    });
    var add = tile('add', 'show-add');
    add.appendChild(el('div', 'name', '+ Add a show'));
    add.onselect = function () { show('search'); };
    add.onfocusitem = function () {
      hero({
        eyebrow: 'My shows', title: 'What are you watching?',
        line1: 'Add the shows you follow on Netflix, Disney+, NOW and the rest.',
        line2: 'They appear here with new-episode alerts, and OK opens the right app.',
        hint: 'Press OK to add a show', art: { color: '#232b45', label: '+' }
      });
    };
    row.appendChild(add);
  }

  function heroShow(s) {
    var info = s.info || {};
    var app = appById(s.app) || {};
    var line1 = '';
    if (Shows.isNew(s)) line1 = 'New episode: ' + Shows.epLabel(info.prev) + (info.prev.name ? ' “' + info.prev.name + '”' : '');
    else if (info.next) line1 = Shows.status(s) + (info.next.name ? ' — “' + info.next.name + '”' : '');
    else line1 = Shows.status(s);
    hero({
      eyebrow: 'My shows · ' + (app.name || ''),
      title: s.name, line1: line1, line2: trim(info.summary, 200),
      hint: 'Press OK to open ' + (app.name || 'the app'),
      art: { image: info.art || info.poster, color: app.color, label: s.name }
    });
  }

  function openShow(s) {
    var app = appById(s.app);
    if (!app) { toast('Choose which app ' + s.name + ' is on in Settings'); return; }
    openApp(app);
  }

  // -- Apps

  function renderApps() {
    var row = $('row-apps');
    row.innerHTML = '';
    visibleApps().forEach(function (app) {
      var t = tile('', 'app-' + app.id);
      t.style.background = app.color;
      t.style.color = app.text || '#fff';
      t.appendChild(el('div', 'name', app.name));
      if (app.hotkey) t.appendChild(el('div', 'key dot ' + app.hotkey));
      t.onselect = function () { openApp(app); };
      t.onfocusitem = function () {
        hero({
          eyebrow: 'App', title: app.name,
          line1: app.hotkey ? 'Shortcut: the ' + app.hotkey + ' button on your remote' : '',
          line2: app.appId ? 'To come back here afterwards, press Home on the remote, then TV Hub.'
            : 'Not found on this TV yet — open Settings › Apps › Change app',
          hint: 'Press OK to open', art: { color: app.color, label: app.name }
        });
      };
      row.appendChild(t);
    });
  }

  function renderHotkeys() {
    var hk = $('hotkeys');
    hk.innerHTML = '';
    HOTKEYS.forEach(function (colour) {
      var app = appForHotkey(colour);
      if (!app) return;
      var s = el('span');
      s.appendChild(el('i', 'dot ' + colour));
      s.appendChild(document.createTextNode(app.name));
      hk.appendChild(s);
    });
    if (state.options.spotifyKey && SpotifyApi.isPaired()) {
      var sp = el('span');
      sp.appendChild(el('i', 'dot ' + state.options.spotifyKey));
      sp.appendChild(document.createTextNode('Play / pause'));
      hk.appendChild(sp);
    }
    if (state.channels.length) hk.appendChild(el('span', null, '0–9  channel number'));
  }

  // -- Satellite TV

  function renderChannels() {
    var row = $('row-channels');
    row.innerHTML = '';
    var li = lastIndex();
    state.channels.forEach(function (ch, i) {
      row.appendChild(satelliteTile(ch, 'sat-' + chKey(ch), i === li));
    });
    var add = tile('add', 'sat-add');
    add.appendChild(el('div', 'name', state.channels.length ? '+ More channels' : '+ Add your satellite channels'));
    add.onselect = function () { openChannelPicker('home'); };
    add.onfocusitem = function () {
      hero({
        eyebrow: 'Satellite TV', title: state.channels.length ? 'Add more channels' : 'Set up your channels',
        line1: 'Pick the free-to-air channels you watch from the list your TV has scanned.',
        hint: 'Press OK to choose channels', art: { color: '#232b45', label: '+' }
      });
    };
    row.appendChild(add);
  }

  function satelliteTile(ch, key, isLast) {
    var t = tile('channel', key);
    t.appendChild(el('div', 'num', channelLabel(ch)));
    if (isLast) t.appendChild(el('div', 'live', key === 'onnow-sat' ? 'SATELLITE' : 'LAST'));
    t.appendChild(el('div', 'name', ch.name));
    var sub = el('div', 'sub', '');
    t.appendChild(sub);
    function draw() {
      Platform.getNowNext(ch, function (nn) { sub.textContent = nn.now ? 'Now: ' + nn.now : ''; });
    }
    onPaint('sat-' + chKey(ch), draw);
    t.onselect = function () { watchChannel(channelIndex(chKey(ch))); };
    t.onfocusitem = function () { previewChannel(ch, key); };
    return t;
  }

  // -- My sport: live and upcoming events for the sports you follow, then your Sky Sports channels

  function renderSport() {
    var row = $('row-sport');
    row.innerHTML = '';
    statsTiles(row);
    (sportEvents || []).slice(0, 12).forEach(function (e) { row.appendChild(eventTile(e, 'sport-')); });
    visibleSport().forEach(function (c) { row.appendChild(sportTile(c, 'sport-' + c.key)); });
    var names = SPORTS.filter(function (sp) { return state.mySports.indexOf(sp.key) !== -1; }).map(function (sp) { return sp.name; });
    $('sport-note').textContent = names.length ? names.join(' · ') + ' — live and coming up on Sky Sports' : 'choose your sports in Settings';
    var empty = !row.firstChild;
    $('sport-title').classList.toggle('hidden', empty);
    row.classList.toggle('hidden', empty);
  }

  function eventTile(e, prefix) {
    var t = tile('pic wide', prefix + e.key);
    t.style.backgroundColor = SKY_COLOUR;
    setImage(t, e.image);
    var src = el('div', 'src', e.channels.map(function (c) { return c.short; }).join(' · '));
    src.style.background = SKY_COLOUR;
    t.appendChild(src);
    var flag = el('div', 'flag');
    t.appendChild(flag);
    t.appendChild(el('div', 'name small', e.title));
    var sub = el('div', 'sub', '');
    var bar = el('div', 'bar');
    bar.appendChild(el('i'));
    t.appendChild(sub);
    t.appendChild(bar);
    function isLive() { var now = Date.now(); return e.start <= now && now < e.stop; }
    function draw() {
      var live = isLive();
      flag.textContent = live ? 'LIVE' : Guide.when(e.start);
      flag.classList.toggle('soon', !live);
      sub.textContent = e.sport.name + (live ? ' · ' + untilText(e) : '');
      bar.classList.toggle('hidden', !live);
      bar.firstChild.style.width = Math.round(Guide.progress(e) * 100) + '%';
    }
    draw();
    onPaint('events', draw);
    var channel = e.channels[0];
    t.onselect = function () {
      var app = appById(TVHUB_DEFAULTS.sportApp);
      if (!app) return toast('Add the NOW app in Settings first');
      openApp(app, isLive() ? 'Opening NOW — choose ' + channel.name
        : e.title + ' starts ' + Guide.when(e.start) + ' on ' + channel.name + '. Opening NOW…', 1500);
    };
    t.onfocusitem = function () {
      var live = isLive();
      hero({
        eyebrow: e.sport.name + ' · ' + e.channels.map(function (c) { return c.name; }).join(' and '),
        title: e.title,
        line1: live ? 'LIVE now · until ' + Guide.clock(e.stop) : 'Starts ' + Guide.when(e.start) + ' · until ' + Guide.clock(e.stop),
        progress: live ? Guide.progress(e) : null,
        line2: trim(e.desc, 180),
        hint: 'OK opens NOW → ' + channel.name,
        art: { image: e.image, color: SKY_COLOUR, label: e.sport.name }
      });
    };
    return t;
  }

  function sportTile(c, key) {
    var t = tile('pic wide', key);
    t.style.backgroundColor = SKY_COLOUR;
    var src = el('div', 'src', c.short);
    src.style.background = SKY_COLOUR;
    t.appendChild(src);
    var flag = el('div', 'flag hidden', 'LIVE');
    t.appendChild(flag);
    var name = el('div', 'name small', c.name);
    var sub = el('div', 'sub', 'Loading what’s on…');
    var bar = el('div', 'bar');
    bar.appendChild(el('i'));
    t.appendChild(name);
    t.appendChild(sub);
    t.appendChild(bar);
    function draw() {
      var nn = sportNow[c.key];
      if (!nn) return;
      if (nn.now) {
        name.textContent = nn.now.title;
        // Flag an upcoming live event, e.g. "Live at 16:30: Arsenal v Spurs".
        sub.textContent = !isLiveEvent(nn.now) && isLiveEvent(nn.next)
          ? 'Live at ' + Guide.clock(nn.next.start) + ': ' + nn.next.title.replace(/^live:?\s*/i, '')
          : c.short + ' · ' + untilText(nn.now);
        sub.classList.remove('warn');
        bar.firstChild.style.width = Math.round(Guide.progress(nn.now) * 100) + '%';
        flag.classList.toggle('hidden', !isLiveEvent(nn.now));
        setImage(t, nn.now.image);
      } else {
        name.textContent = c.name;
        sub.textContent = nn.unavailable ? 'Listings unavailable' : 'Nothing listed right now';
        sub.classList.add('warn');
        flag.classList.add('hidden');
        setImage(t, null);
      }
      if (t.classList.contains('focused')) t.onfocusitem();
    }
    onPaint('sport-' + c.key, draw);
    t.onselect = function () {
      var app = appById(TVHUB_DEFAULTS.sportApp);
      if (!app) return toast('Add the NOW app in Settings first');
      openApp(app, 'Opening NOW — choose ' + c.name, 1500);
    };
    t.onfocusitem = function () {
      var nn = sportNow[c.key];
      hero({
        eyebrow: c.name + ' · on NOW', title: nn && nn.now ? nn.now.title : c.name,
        line1: !nn ? 'Loading what’s on…' : nn.now
          ? Guide.clock(nn.now.start) + ' – ' + Guide.clock(nn.now.stop) + (isLiveEvent(nn.now) ? '  ·  LIVE' : '')
          : nn.unavailable ? UNAVAILABLE : 'Nothing listed right now',
        progress: nn && nn.now ? Guide.progress(nn.now) : null,
        line2: nn && nn.next ? 'Next at ' + Guide.clock(nn.next.start) + ': ' + nn.next.title : trim(nn && nn.now && nn.now.desc, 160),
        hint: 'OK opens NOW → ' + c.name,
        art: { image: nn && nn.now && nn.now.image, color: SKY_COLOUR, label: c.name }
      });
    };
    draw();
    return t;
  }

  // -- Tools

  function renderTools() {
    var tools = $('row-tools');
    tools.innerHTML = '';
    var buttons = [
      ['watch', 'Watch satellite TV', function () { watchChannel(lastIndex()); },
        { eyebrow: 'Satellite TV', title: 'Watch full screen', line1: 'Opens your last channel. CH ▲▼ changes channel, BACK comes home.' }],
      ['add', 'Add a show', function () { show('search'); },
        { eyebrow: 'My shows', title: 'Add a show', line1: 'Search for a show and choose which app you watch it on.' }],
      ['settings', 'Settings', function () { show('settings'); },
        { eyebrow: 'Settings', title: 'Settings', line1: 'Apps, colour buttons, channels, shows and sport. The INFO button also opens Settings.' }]
    ];
    if (!state.channels.length) buttons.shift();
    buttons.forEach(function (b) {
      var btn = el('button', 'btn focusable', b[1]);
      btn.setAttribute('data-key', 'tool-' + b[0]);
      btn.onselect = b[2];
      btn.onfocusitem = function () {
        var o = b[3];
        o.hint = 'Press OK';
        o.art = { color: '#232b45', label: b[1] };
        hero(o);
      };
      tools.appendChild(btn);
    });
  }

  // After show lookups finish, redraw just the My shows row (once, when they've settled).
  var showsTimer = null;
  function scheduleShowsRender() {
    clearTimeout(showsTimer);
    showsTimer = setTimeout(function () {
      if (current !== 'home') return;
      var key = homeNav.currentKey();
      renderShows();
      if (key && key.indexOf('show-') === 0) homeNav.focusKey(key);
    }, 800);
  }

  screens.home = {
    enter: function (prev) {
      if (OVERLAYS.indexOf(prev) !== -1) renderHome();
      showPreview();
      homeNav.refresh();
    },
    key: function (a) {
      if (a === 'ENTER') return homeNav.select();
      if (a === 'BACK') {
        // First BACK returns to the first row, second sends the app to the background.
        var first = firstRow();
        if (homeNav.r !== first || homeNav.c !== 0) return homeNav.focus(first, 0);
        Platform.hideTvWindow();
        return Platform.hide();
      }
      homeNav.move(a);
    }
  };

  // Open another app. A message shown for `delay` ms first gives time to read instructions;
  // any other button during that time cancels it, and OK isn't counted twice.
  var launchTimer = null;
  function openApp(app, message, delay) {
    clearTimeout(previewTimer);
    if (launchTimer) return;
    if (!app.appId) {
      toast(app.name + ' wasn’t found on this TV — open Settings › Apps › Change app');
      return;
    }
    state.usage[app.id] = (state.usage[app.id] || 0) + 1;
    var tip = '';
    if ((state.launches = (state.launches || 0) + 1) <= 3) tip = '  ·  To come back: Home, then TV Hub';
    save();
    toast((message || 'Opening ' + app.name + '…') + tip + (delay ? '  ·  any other button cancels' : ''), (delay || 0) + 3000);
    launchTimer = setTimeout(function () {
      launchTimer = null;
      Platform.hideTvWindow();
      Platform.launchApp(app.appId, function (msg) {
        toast(app.name + ': ' + msg + ' — check it in Settings › Apps');
        if (current === 'home') showPreview();
      });
    }, delay || 0);
  }
  function cancelLaunch() {
    if (!launchTimer) return false;
    clearTimeout(launchTimer);
    launchTimer = null;
    return true;
  }

  // ---------------------------------------------------------------- live satellite TV

  var tunedKey = null; // channel the tuner is on, so we don't retune needlessly
  var previewTimer = null;

  function heroTuner(ch, tileKey, warning) {
    hero({
      eyebrow: 'Satellite TV', title: channelLabel(ch) + '  ' + ch.name,
      line2: warning || '',
      hint: 'Press OK to watch full screen · CH ▲▼ to change channel', art: null
    });
    $('preview-fallback').firstChild.textContent = ch.name;
    if (warning) return;
    Platform.getNowNext(ch, function (nn) {
      if (homeNav.currentKey() !== tileKey) return; // focus moved on meanwhile
      if (nn.now) $('hero-line1').textContent = 'Now: ' + nn.now;
      if (nn.next) $('hero-line2').textContent = 'Next: ' + nn.next;
    });
  }

  // callbacks: { ok(), fail(msg, noTuner) }. A second request for a channel that's still
  // tuning waits for the same result.
  var tuning = null; // { key, waiters: [callbacks] }
  function tuneTo(ch, callbacks) {
    callbacks = callbacks || {};
    var key = chKey(ch);
    if (key === tunedKey) return callbacks.ok && callbacks.ok();
    if (tuning && tuning.key === key) return tuning.waiters.push(callbacks);
    var job = tuning = { key: key, waiters: [callbacks] };
    tunedKey = null;
    function finish(ok, msg, noTuner) {
      if (tuning === job) tuning = null;
      if (ok) tunedKey = key;
      job.waiters.forEach(function (w) {
        if (ok) { if (w.ok) w.ok(); } else if (w.fail) w.fail(msg, noTuner);
      });
    }
    Platform.tune(ch, {
      ok: function () { finish(true); },
      noSignal: function () { toast('No signal on ' + ch.name + ' — check the satellite dish'); },
      program: function (title) {
        if (title && current === 'watch') $('banner-now').textContent = 'Now: ' + title;
      },
      fail: function (msg, noTuner) { finish(false, msg, noTuner); }
    });
  }

  function previewOn() { return state.options.livePreview && Platform.canTune(); }

  function showPreview() {
    document.body.classList.toggle('no-preview', Platform.isTv && !previewOn());
    var i = lastIndex();
    $('preview-fallback').firstChild.textContent = i !== -1 ? state.channels[i].name : '';
    if (!previewOn()) return;
    var box = $('preview').getBoundingClientRect();
    Platform.showTvWindow({ x: Math.round(box.left), y: Math.round(box.top), w: Math.round(box.width), h: Math.round(box.height) });
    if (i !== -1) tuneTo(state.channels[i], { fail: function () {} });
  }

  // Focusing a satellite channel previews it after a short pause (so scrolling past doesn't
  // retune). A failed preview only shows a note; it never leaves the app.
  function previewChannel(ch, tileKey) {
    heroTuner(ch, tileKey);
    clearTimeout(previewTimer);
    if (!previewOn()) return;
    previewTimer = setTimeout(function () {
      if (current !== 'home' || homeNav.currentKey() !== tileKey) return;
      tuneTo(ch, { fail: function (msg) {
        if (current === 'home' && homeNav.currentKey() === tileKey) heroTuner(ch, tileKey, 'Can’t show this channel: ' + msg);
      } });
    }, 700);
  }

  function watchChannel(i) {
    clearTimeout(previewTimer);
    cancelLaunch();
    var ch = state.channels[i];
    if (!ch) { toast('No satellite channels yet — choose “Add your satellite channels”'); return; }
    state.lastKey = chKey(ch);
    save();
    tuneTo(ch, {
      ok: function () { if (current !== 'watch') show('watch'); else updateBanner(); },
      fail: function (msg, noTuner) {
        if (!noTuner) return toast('Couldn’t tune ' + ch.name + ': ' + msg);
        // This TV doesn't let apps change channel: hand over to its own live TV, and say which channel.
        toast('Opening the TV’s own live TV — choose ' + ch.name + ' (' + channelLabel(ch) + ')', 4000);
        Platform.hideTvWindow();
        Platform.launchApp(state.options.tvViewerAppId, function () {
          toast('Use the remote’s Source button and choose TV, then ' + channelLabel(ch));
        });
      }
    });
  }

  var bannerTimer = null;
  function updateBanner() {
    var ch = state.channels[lastIndex()];
    if (!ch) return;
    $('banner-num').textContent = channelLabel(ch);
    $('banner-name').textContent = ch.name;
    $('banner-now').textContent = '';
    $('watch-fallback').firstChild.textContent = ch.name;
    Platform.getNowNext(ch, function (nn) {
      if (nn.now) $('banner-now').textContent = 'Now: ' + nn.now + (nn.next ? '   ·   Next: ' + nn.next : '');
    });
    var b = $('banner');
    b.classList.remove('faded');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(function () { b.classList.add('faded'); }, 5000);
  }

  function stepChannel(dir) {
    var n = state.channels.length;
    if (!n) return;
    watchChannel((((lastIndex() + dir) % n) + n) % n);
  }

  screens.watch = {
    enter: function () {
      Platform.showTvWindow({ x: 0, y: 0, w: 1920, h: 1080 });
      var ch = state.channels[lastIndex()];
      if (ch) tuneTo(ch, { fail: function (msg) { toast('Couldn’t tune ' + ch.name + ': ' + msg); } });
      updateBanner();
    },
    key: function (a) {
      if (a === 'BACK') return show('home');
      if (a === 'CH_UP' || a === 'UP') return stepChannel(1);
      if (a === 'CH_DOWN' || a === 'DOWN') return stepChannel(-1);
      updateBanner(); // any other key: show what's on
    }
  };

  // Typing a channel number on the remote jumps straight to it; the box shows where it'll go.
  var digitBuf = '';
  var digitTimer = null;
  function channelForNumber(num) {
    for (var i = 0; i < state.channels.length; i++) if (state.channels[i].major === num) return i;
    // A single digit 1-9 that isn't a channel number picks your nth satellite channel.
    if (num >= 1 && num <= 9 && num <= state.channels.length) return num - 1;
    return -1;
  }
  function onDigit(d) {
    digitBuf = (digitBuf + d).slice(-4);
    var num = parseInt(digitBuf, 10);
    var idx = channelForNumber(num);
    var box = $('digits');
    box.textContent = digitBuf;
    box.appendChild(el('small', null, idx !== -1 ? state.channels[idx].name : ''));
    box.classList.remove('hidden');
    clearTimeout(digitTimer);
    digitTimer = setTimeout(function () {
      box.classList.add('hidden');
      digitBuf = '';
      if (idx !== -1) return watchChannel(idx);
      // Not in your list: if the TV has scanned it, add it and watch.
      Platform.getTvChannels(function (all) {
        var found = all.filter(function (c) { return c.major === num; })[0];
        if (!found) return toast('Channel ' + num + ' isn’t on this TV');
        state.channels.push({ name: found.name, major: found.major, minor: found.minor || 0 });
        toast(found.name + ' added to your channels');
        renderHome();
        watchChannel(state.channels.length - 1);
      });
    }, idx !== -1 && String(state.channels[idx].major) === digitBuf ? 1000 : 1500);
  }

  // ---------------------------------------------------------------- add a show

  var searchNav = new Nav($('search'), 'first');
  var searchInput = $('search-input');
  var searchToken = 0;

  function runSearch() {
    var q = searchInput.value.trim();
    if (!q) { searchInput.focus(); return; }
    var body = $('search-body');
    body.innerHTML = '';
    body.appendChild(el('div', 'label', 'Searching…'));
    var token = ++searchToken;
    Shows.search(q, function (results, err) {
      if (token !== searchToken) return; // an older search answered late
      body.innerHTML = '';
      if (err) body.appendChild(el('div', 'label', 'Couldn’t reach the show database — check the TV’s internet connection and try again'));
      else if (!results.length) body.appendChild(el('div', 'label', 'No shows found — check the spelling'));
      results.slice(0, 12).forEach(function (r) {
        var row = el('div', 'srow nav-row');
        var th = el('div', 'thumb');
        setImage(th, r.image);
        row.appendChild(th);
        var label = el('div', 'label', r.name + (r.year ? ' (' + r.year + ')' : ''));
        label.appendChild(el('small', null, r.network || ''));
        row.appendChild(label);
        var have = state.shows.some(function (s) { return s.tvmazeId === r.id; });
        row.appendChild(chip(have ? '✓ Added' : 'Add', function () { if (!have) chooseAppFor(r); }, have ? 'on' : ''));
        body.appendChild(row);
      });
      // Don't pull focus out of the box if you've started typing again.
      if (current === 'search' && document.activeElement !== searchInput) searchNav.focus(results.length ? 1 : 0, 0);
    });
  }

  function chooseAppFor(r) {
    var guess = Shows.guessApp(r.network);
    var apps = state.apps.filter(function (a) { return !a.hidden || a.id === guess; }).sort(function (a, b) {
      return (b.id === guess ? 1 : 0) - (a.id === guess ? 1 : 0);
    });
    openPicker({
      title: 'Where do you watch ' + r.name + '?',
      hint: 'OK to choose · BACK to go back',
      back: 'search',
      items: function () {
        return apps.map(function (app) {
          return {
            label: app.name + (app.id === guess ? '   (suggested)' : ''),
            chip: 'Choose', on: app.id === guess,
            select: function () {
              var s = { tvmazeId: r.id, name: r.name, app: app.id, added: Date.now() };
              state.shows.unshift(s);
              showTried[s.tvmazeId] = Date.now();
              save();
              Shows.refresh(s, function () { save(); scheduleShowsRender(); });
              toast(r.name + ' added — it opens in ' + app.name);
              show('home');
              homeNav.focusKey('show-' + s.tvmazeId);
              return true;
            }
          };
        });
      }
    });
  }

  screens.search = {
    enter: function (prev) {
      Platform.hideTvWindow();
      if (prev !== 'picker') {
        searchToken++; // ignore answers to searches from a previous visit
        searchInput.value = '';
        $('search-body').innerHTML = '';
        searchNav.focus(0, 0);
        searchInput.focus(); // brings up the TV's on-screen keyboard
      } else {
        searchNav.refresh();
      }
    },
    key: function (a) {
      var typing = document.activeElement === searchInput;
      if (typing) {
        if (a === 'ENTER') { searchInput.blur(); return runSearch(); }
        if (a === 'BACK' || a === 'DOWN' || a === 'UP') { searchInput.blur(); if (a === 'BACK') return; }
        else return; // let the keyboard handle it
      }
      if (a === 'BACK') { searchToken++; return show('home'); }
      if (a === 'ENTER') return searchNav.select();
      searchNav.move(a);
    }
  };
  searchInput.onselect = function () { searchInput.focus(); };
  $('search-go').onselect = runSearch;

  // ---------------------------------------------------------------- settings

  var settingsNav = new Nav($('settings'), 'first');

  function chip(text, fn, extra) {
    var b = el('button', 'chip focusable' + (extra ? ' ' + extra : ''), text);
    b.onselect = fn;
    return b;
  }

  // A chip that needs two presses: the first turns it red and asks again.
  function confirmChip(text, fn) {
    var armed = false, timer = null;
    var b = chip(text, function () {
      if (armed) { clearTimeout(timer); return fn(); }
      armed = true;
      b.textContent = 'Press OK again to confirm';
      b.classList.add('confirm');
      timer = setTimeout(function () { armed = false; b.textContent = text; b.classList.remove('confirm'); }, 3000);
    });
    return b;
  }

  function moveItem(list, i, delta) {
    var j = i + delta;
    if (j < 0 || j >= list.length) return 0;
    var tmp = list[i]; list[i] = list[j]; list[j] = tmp;
    return delta;
  }

  function section(body, title) { body.appendChild(el('div', 'section-title', title)); }

  function renderSettings() {
    var body = $('settings-body');
    body.innerHTML = '';

    section(body, 'My shows');
    state.shows.forEach(function (s, i) {
      var row = el('div', 'srow nav-row');
      var label = el('div', 'label', s.name);
      label.appendChild(el('small', null, (s.info && s.info.network) || ''));
      row.appendChild(label);
      var app = appById(s.app);
      row.appendChild(chip('Opens in: ' + (app ? app.name : '?'), function () {
        var choices = state.apps.filter(function (a) { return !a.hidden; });
        if (!choices.length) return toast('Show an app first');
        var idx = choices.indexOf(appById(s.app));
        s.app = choices[(idx + 1) % choices.length].id;
        changed();
      }));
      row.appendChild(chip('▲', function () { changed(moveItem(state.shows, i, -1)); }));
      row.appendChild(chip('▼', function () { changed(moveItem(state.shows, i, 1)); }));
      row.appendChild(confirmChip('Remove', function () { state.shows.splice(i, 1); changed(); toast(s.name + ' removed'); }));
      body.appendChild(row);
    });
    var addShow = el('div', 'srow nav-row');
    addShow.appendChild(chip('+ Add a show', function () { show('search'); }));
    body.appendChild(addShow);

    section(body, 'Apps');
    state.apps.forEach(function (app, i) {
      var row = el('div', 'srow nav-row');
      var sw = el('div', 'swatch'); sw.style.background = app.color;
      row.appendChild(sw);
      var label = el('div', 'label' + (app.hidden ? ' off' : ''), app.name);
      label.appendChild(el('small', null, app.appId ? 'Found on this TV' : 'Not found on this TV yet — use Change app'));
      row.appendChild(label);
      row.appendChild(chip(app.hidden ? 'Hidden' : '✓ Shown', function () { app.hidden = !app.hidden; changed(); }, app.hidden ? '' : 'on'));
      row.appendChild(chip('Button: ' + (app.hotkey || 'none'), function () {
        var next = HOTKEYS[(HOTKEYS.indexOf(app.hotkey) + 1)] || null; // cycles red→green→yellow→blue→none
        var had = next && appForHotkey(next);
        if (next) state.apps.forEach(function (o) { if (o.hotkey === next) o.hotkey = null; });
        if (next && state.options.spotifyKey === next) state.options.spotifyKey = null;
        app.hotkey = next;
        if (had && had !== app) toast('The ' + next + ' button now opens ' + app.name + ' instead of ' + had.name);
        changed();
      }));
      row.appendChild(chip('Change app', function () { openChangeApp(app); }));
      row.appendChild(chip('▲', function () { changed(moveItem(state.apps, i, -1)); }));
      row.appendChild(chip('▼', function () { changed(moveItem(state.apps, i, 1)); }));
      // Built-in apps are linked to My shows, On now and Sport, so they're hidden rather than removed.
      if (!isBuiltIn(app)) row.appendChild(confirmChip('Remove', function () { state.apps.splice(i, 1); changed(); }));
      body.appendChild(row);
    });
    var addRow = el('div', 'srow nav-row');
    addRow.appendChild(chip('+ Add an installed app', openAppPicker));
    body.appendChild(addRow);

    section(body, 'Satellite channels');
    state.channels.forEach(function (ch, i) {
      var row = el('div', 'srow nav-row');
      row.appendChild(el('div', 'label', channelLabel(ch) + '   ' + ch.name));
      row.appendChild(chip('▲', function () { changed(moveItem(state.channels, i, -1)); }));
      row.appendChild(chip('▼', function () { changed(moveItem(state.channels, i, 1)); }));
      row.appendChild(confirmChip('Remove', function () { state.channels.splice(i, 1); changed(); }));
      body.appendChild(row);
    });
    var chRow = el('div', 'srow nav-row');
    chRow.appendChild(chip('Choose channels from the TV’s list', function () { openChannelPicker('settings'); }));
    body.appendChild(chRow);

    var manual = el('div', 'srow nav-row');
    manual.appendChild(el('div', 'label', 'Add by number'));
    var num = el('input', 'field focusable'); num.type = 'number'; num.placeholder = 'e.g. 106';
    var name = el('input', 'field focusable'); name.type = 'text'; name.placeholder = 'Name';
    num.onselect = function () { num.focus(); };
    name.onselect = function () { name.focus(); };
    manual.appendChild(num);
    manual.appendChild(name);
    manual.appendChild(chip('Add', function () {
      var n = parseInt(num.value, 10);
      if (!n) return toast('Enter a channel number first');
      Platform.getTvChannels(function (all) {
        var tv = all.filter(function (c) { return c.major === n; })[0];
        var ch = { name: name.value.trim() || (tv && tv.name) || ('Channel ' + n), major: n, minor: tv ? tv.minor || 0 : 0 };
        if (channelIndex(chKey(ch)) !== -1) return toast('Channel ' + n + ' is already in your list');
        state.channels.push(ch);
        changed();
        toast('Added ' + ch.name);
      });
    }));
    body.appendChild(manual);

    section(body, 'Online channels (in “On now”)');
    state.online.forEach(function (k, i) {
      var def = PLAYER[k];
      if (!def) return;
      var app = appById(def.app);
      var row = el('div', 'srow nav-row');
      var label = el('div', 'label', def.name);
      label.appendChild(el('small', null, 'Opens ' + (app ? app.name : 'its player app')));
      row.appendChild(label);
      row.appendChild(chip('▲', function () { changed(moveItem(state.online, i, -1)); }));
      row.appendChild(chip('▼', function () { changed(moveItem(state.online, i, 1)); }));
      row.appendChild(confirmChip('Remove', function () { state.online.splice(i, 1); changed(); }));
      body.appendChild(row);
    });
    var onRow = el('div', 'srow nav-row');
    onRow.appendChild(chip('+ Add online channels (RTÉ, Virgin Media)', openPlayerPicker));
    body.appendChild(onRow);

    section(body, 'My sports (live events in On now and My sport)');
    var sportRow = null;
    SPORTS.forEach(function (sp, i) {
      if (i % 4 === 0) { sportRow = el('div', 'srow nav-row'); body.appendChild(sportRow); }
      var on = state.mySports.indexOf(sp.key) !== -1;
      sportRow.appendChild(chip((on ? '✓ ' : '') + sp.name, function () {
        if (on) state.mySports.splice(state.mySports.indexOf(sp.key), 1);
        else state.mySports.push(sp.key);
        sportEvents = null; // rebuilt from the guide cache with the new choice
        changed();
      }, on ? 'on' : ''));
    });

    section(body, 'Sky Sports channels (in My sport)');
    SPORT.forEach(function (c) {
      var row = el('div', 'srow nav-row');
      var hidden = state.sportHidden.indexOf(c.key) !== -1;
      row.appendChild(el('div', 'label' + (hidden ? ' off' : ''), c.name));
      row.appendChild(chip(hidden ? 'Hidden' : '✓ Shown', function () {
        if (hidden) state.sportHidden.splice(state.sportHidden.indexOf(c.key), 1);
        else state.sportHidden.push(c.key);
        changed();
      }, hidden ? '' : 'on'));
      body.appendChild(row);
    });

    section(body, 'Spotify');
    var spRow = el('div', 'srow nav-row');
    spRow.appendChild(el('div', 'label', SpotifyApi.isPaired() ? 'Connected · ' + speakerText() : 'Not connected'));
    spRow.appendChild(chip(SpotifyApi.isPaired() ? 'Reconnect' : 'Connect Spotify', function () { show('pair'); }));
    spRow.appendChild(chip('Play/pause button: ' + (state.options.spotifyKey || 'none'), function () {
      var next = HOTKEYS[(HOTKEYS.indexOf(state.options.spotifyKey) + 1)] || null;
      var had = null;
      state.apps.forEach(function (o) { if (next && o.hotkey === next) { had = had || o; o.hotkey = null; } });
      state.options.spotifyKey = next;
      if (had) toast('The ' + next + ' button now plays/pauses Spotify instead of opening ' + had.name);
      changed();
    }));
    if (SpotifyApi.isPaired()) spRow.appendChild(confirmChip('Disconnect', function () { SpotifyApi.unpair(); WebPlayer.stop(); music.state = null; music.lists = null; changed(); }));
    body.appendChild(spRow);

    section(body, 'Alerts, weather and screensaver');
    var alRow = el('div', 'srow nav-row');
    alRow.appendChild(el('div', 'label', 'Sport alerts'));
    alRow.appendChild(chip('When it goes live: ' + (state.options.alertLive ? 'On' : 'Off'),
      function () { state.options.alertLive = !state.options.alertLive; changed(); }, state.options.alertLive ? 'on' : ''));
    alRow.appendChild(chip('10 minutes before: ' + (state.options.alertSoon ? 'On' : 'Off'),
      function () { state.options.alertSoon = !state.options.alertSoon; changed(); }, state.options.alertSoon ? 'on' : ''));
    body.appendChild(alRow);
    var wxRow = el('div', 'srow nav-row');
    wxRow.appendChild(el('div', 'label', 'Weather and screensaver'));
    wxRow.appendChild(chip('Weather (Open-Meteo) for: ' + state.options.town, openTownPicker));
    wxRow.appendChild(chip('Screensaver: ' + (state.options.ambientMins ? 'after ' + state.options.ambientMins + ' min' : 'Off'), function () {
      var steps = [0, 5, 10, 20, 30];
      state.options.ambientMins = steps[(steps.indexOf(state.options.ambientMins) + 1) % steps.length];
      changed();
    }));
    body.appendChild(wxRow);

    section(body, 'Backup');
    var bkRow = el('div', 'srow nav-row');
    bkRow.appendChild(el('div', 'label', 'Keep your setup safe, or move it to another TV'));
    bkRow.appendChild(chip('Back up or restore', function () { show('backup'); }));
    body.appendChild(bkRow);

    section(body, 'Options');
    var opts = el('div', 'srow nav-row');
    opts.appendChild(el('div', 'label', 'Behaviour'));
    opts.appendChild(chip('Most-used apps first: ' + (state.options.smartOrder ? 'On' : 'Off'),
      function () { state.options.smartOrder = !state.options.smartOrder; changed(); }, state.options.smartOrder ? 'on' : ''));
    opts.appendChild(chip('Live preview: ' + (state.options.livePreview ? 'On' : 'Off'),
      function () { state.options.livePreview = !state.options.livePreview; if (!state.options.livePreview) Platform.hideTvWindow(); changed(); },
      state.options.livePreview ? 'on' : ''));
    body.appendChild(opts);
    var reset = el('div', 'srow nav-row');
    reset.appendChild(el('div', 'label', 'Start again (removes your shows and channels, and disconnects Spotify)'));
    reset.appendChild(confirmChip('Reset everything', function () {
      try { localStorage.removeItem(STORE_KEY); } catch (e) {}
      SpotifyApi.unpair();
      WebPlayer.stop();
      music.state = null;
      music.lists = null;
      state = load();
      changed();
      toast('Back to the original setup');
    }));
    body.appendChild(reset);
  }

  // Re-render after a change, keeping focus in place (or following a moved item).
  function changed(rowDelta) {
    save();
    var r = settingsNav.r + (rowDelta || 0), c = settingsNav.c;
    renderSettings();
    settingsNav.focus(r, c);
  }

  screens.settings = {
    enter: function (prev) {
      Platform.hideTvWindow();
      renderSettings();
      settingsNav.focus(prev === 'picker' ? settingsNav.r : 0, prev === 'picker' ? settingsNav.c : 0);
    },
    key: function (a) {
      var active = document.activeElement;
      var typing = active && active.tagName === 'INPUT';
      if (typing) {
        if (a === 'ENTER' || a === 'UP' || a === 'DOWN') { active.blur(); if (a === 'ENTER') return; }
        else if (a !== 'BACK') return; // let the on-screen keyboard handle it
        else { active.blur(); return; }
      }
      if (a === 'BACK') return show('home');
      if (a === 'ENTER') return settingsNav.select();
      settingsNav.move(a);
    }
  };

  // ---------------------------------------------------------------- picker

  var pickerNav = new Nav($('picker'), 'first');
  var picker = null;

  // cfg: { title, hint, back: screen to return to, items(): [{ label, chip, on, select() -> true to close }] }
  function openPicker(cfg) {
    picker = cfg;
    $('picker-title').textContent = cfg.title;
    $('picker-hint').textContent = cfg.hint || 'OK to add or remove · BACK when done';
    renderPicker();
    pickerNav.r = 0; pickerNav.c = 0;
    show('picker');
  }

  function renderPicker() {
    var body = $('picker-body');
    body.innerHTML = '';
    var items = picker.items();
    if (!items.length) body.appendChild(el('div', 'label', picker.empty || 'Nothing found on this TV.'));
    items.forEach(function (it) {
      var row = el('div', 'srow nav-row');
      row.appendChild(el('div', 'label', it.label));
      var c = chip(it.chip, function () {
        var res = it.select();
        if (res === true) return;
        save();
        if (res && res.chip) { c.textContent = res.chip; c.classList.toggle('on', !!res.on); return; }
        renderPicker();
        pickerNav.refresh();
      }, it.on ? 'on' : '');
      row.appendChild(c);
      body.appendChild(row);
    });
  }

  screens.picker = {
    enter: function () { Platform.hideTvWindow(); pickerNav.refresh(); },
    key: function (a) {
      if (a === 'BACK') return show(picker.back || 'settings');
      if (a === 'ENTER') return pickerNav.select();
      pickerNav.move(a);
    }
  };

  // Toggle-style picker: each item is added or removed.
  function togglePicker(title, list, label, isOn, toggle, back) {
    openPicker({
      title: title, back: back || 'settings',
      items: function () {
        return list.map(function (x) {
          var on = isOn(x);
          return { label: label(x), chip: on ? '✓ Added' : 'Add', on: on, select: function () {
            toggle(x);
            var now = isOn(x);
            return { chip: now ? '✓ Added' : 'Add', on: now };
          } };
        });
      }
    });
  }

  function withInstalledApps(cb) {
    toast('Looking for apps…');
    Platform.getInstalledApps(function (list, err) {
      if (err) return toast('The TV wouldn’t list its apps (' + err + ')');
      cb(list);
    });
  }

  // Point an app tile at a different installed app, keeping its links to shows, On now and Sport.
  function openChangeApp(app) {
    withInstalledApps(function (list) {
      openPicker({
        title: 'Which installed app is “' + app.name + '”?',
        hint: 'OK to choose · BACK to go back',
        items: function () {
          return list.map(function (a) {
            return {
              label: a.name, chip: a.appId === app.appId ? '✓ Current' : 'Choose', on: a.appId === app.appId,
              select: function () {
                app.appId = a.appId;
                app.hidden = false;
                save();
                toast(app.name + ' now opens “' + a.name + '”');
                show('settings');
                return true;
              }
            };
          });
        }
      });
    });
  }

  function openAppPicker() {
    withInstalledApps(function (list) {
      function find(a) { return state.apps.filter(function (x) { return x.appId === a.appId; })[0]; }
      // A built-in tile (e.g. NOW) that matches this app's name and isn't linked yet.
      function builtInFor(a) {
        return state.apps.filter(function (x) {
          return isBuiltIn(x) && !x.appId && x.match && new RegExp(x.match, 'i').test(a.name);
        })[0];
      }
      togglePicker('Add an installed app', list, function (a) { return a.name; }, function (a) { return !!find(a); }, function (a) {
        var existing = find(a);
        if (existing) {
          if (isBuiltIn(existing)) existing.hidden = !existing.hidden;
          else state.apps.splice(state.apps.indexOf(existing), 1);
          return;
        }
        var linked = builtInFor(a);
        if (linked) { linked.appId = a.appId; linked.hidden = false; return; }
        state.apps.push({
          id: 'app-' + a.appId, name: a.name, appId: a.appId,
          color: PALETTE[state.apps.length % PALETTE.length], text: '#ffffff', hotkey: null
        });
      });
    });
  }

  function openChannelPicker(back) {
    Platform.getTvChannels(function (list) {
      if (!list.length && Platform.isTv) {
        toast('This TV didn’t share its channel list — use Settings › Add by number');
        return;
      }
      list = list.slice().sort(function (a, b) { return a.major - b.major || (a.minor || 0) - (b.minor || 0); });
      togglePicker('Choose your satellite channels', list,
        function (c) { return channelLabel(c) + '   ' + c.name; },
        function (c) { return channelIndex(chKey(c)) !== -1; },
        function (c) {
          var i = channelIndex(chKey(c));
          if (i !== -1) state.channels.splice(i, 1);
          else state.channels.push({ name: c.name, major: c.major, minor: c.minor || 0 });
        }, back);
    });
  }

  function openPlayerPicker() {
    togglePicker('Online channels', Object.keys(PLAYER),
      function (k) { var app = appById(PLAYER[k].app); return PLAYER[k].name + '   ·   ' + (app ? app.name : ''); },
      function (k) { return state.online.indexOf(k) !== -1; },
      function (k) {
        var i = state.online.indexOf(k);
        if (i !== -1) state.online.splice(i, 1);
        else state.online.push(k);
      });
  }

  // ---------------------------------------------------------------- Spotify

  var music = { state: null, err: null, at: 0, stateAt: 0, lists: null, listsAt: 0, devices: [] };

  // Every 4 s while something plays on screen, 15 s on the screensaver, 30 s when nothing plays.
  var musicSeq = 0;
  function pollMusic(force) {
    if (!SpotifyApi.isPaired() || SpotifyApi.busy()) return;
    var gap = !isPlaying() ? 30000 : ambientOn ? 15000 : 4000;
    if (!force && Date.now() - music.at < gap) return;
    music.at = Date.now();
    var seq = ++musicSeq;
    SpotifyApi.playback(function (err, st) {
      if (seq !== musicSeq) return; // a newer answer is on its way
      if (!SpotifyApi.isPaired()) { music.state = null; return scheduleRebuild(); }
      music.err = err;
      music.state = st;
      music.stateAt = Date.now();
      paint('music');
      if (ambientOn) drawAmbient();
    });
  }

  // Playlists and recently played, refreshed every 15 minutes.
  function loadMusicLists() {
    if (!SpotifyApi.isPaired() || Date.now() - music.listsAt < 15 * MINUTE) return;
    music.listsAt = Date.now();
    var lists = [], recent = [], left = 2;
    function done() {
      if (--left) return;
      music.lists = lists.concat(recent); // playlists first, then recently played
      scheduleRebuild();
    }
    SpotifyApi.playlists(function (err, items) {
      items.forEach(function (p) {
        if (!p || !p.id) return;
        lists.push({ key: 'pl-' + p.id, name: p.name, sub: 'Playlist', uri: p.uri, image: p.images && p.images[0] && p.images[0].url });
      });
      done();
    });
    SpotifyApi.recent(function (err, items) {
      var seen = {};
      items.forEach(function (it) {
        if (!it) return;
        var t = it.track || {};
        var uri = it.context && it.context.uri || t.uri;
        if (!uri || seen[uri]) return;
        seen[uri] = true;
        var type = it.context ? it.context.type : 'track';
        recent.push({ key: 'rp-' + hash(uri), name: type === 'track' ? t.name : (type === 'album' && t.album ? t.album.name : t.name),
          sub: 'Recently played · ' + ((t.artists || []).map(function (a) { return a.name; }).join(', ')),
          uri: uri, image: t.album && t.album.images && t.album.images[0] && t.album.images[0].url });
      });
      done();
    });
  }

  function nowItem() { return music.state && music.state.item; }
  function isPlaying() { return !!(music.state && music.state.is_playing); }
  function musicProgress() {
    var st = music.state, item = nowItem();
    if (!st || !item || !item.duration_ms) return 0;
    var ms = st.progress_ms + (st.is_playing ? Date.now() - music.stateAt : 0);
    return Math.max(0, Math.min(1, ms / item.duration_ms));
  }
  function artistOf(item) {
    if (!item) return '';
    return item.artists ? item.artists.map(function (a) { return a.name; }).join(', ') : (item.show && item.show.name) || '';
  }
  function artOf(item) {
    var imgs = item && ((item.album && item.album.images) || item.images);
    return imgs && imgs[0] && imgs[0].url;
  }

  // Run a Spotify command, then re-read what's playing.
  function musicDo(fn, okMsg) {
    fn(function (err) {
      if (err) toast(err); else if (okMsg) toast(okMsg);
      setTimeout(function () { pollMusic(true); }, 700);
    });
  }

  // TV Hub's own speaker (js/webplayer.js): what it's doing, in a few words.
  function speakerText() {
    if (!SpotifyApi.canStream()) return 'Reconnect Spotify once to play through this TV';
    var st = WebPlayer.status();
    return st === 'ready' ? 'Ready to play through this TV' : st === 'starting' ? 'Getting ready…' :
      st === 'failed' ? WebPlayer.error() : 'Off';
  }

  // Where to play when nothing is active: TV Hub's own speaker if it's ready, else Spotify on this TV, else the first device.
  function withTarget(cb) {
    if (music.state && music.state.device) return cb(null);
    if (WebPlayer.deviceId()) { WebPlayer.activate(); return cb(WebPlayer.deviceId()); }
    SpotifyApi.devices(function (err, list) {
      music.devices = list;
      if (!list.length) {
        toast('No Spotify devices found — open Spotify on your phone or this TV, then try again');
        return;
      }
      var tv = list.filter(function (d) { return d.type === 'TV' || /tv|samsung/i.test(d.name); })[0];
      cb((tv || list[0]).id);
    });
  }

  function togglePlay() {
    if (!SpotifyApi.isPaired()) return show('pair');
    if (isPlaying()) return musicDo(SpotifyApi.pause, 'Paused');
    WebPlayer.activate();
    withTarget(function (id) { musicDo(function (cb) { SpotifyApi.play(id, cb); }, 'Playing'); });
  }

  function changeVolume(delta) {
    var d = music.state && music.state.device;
    if (!d) return toast('Nothing is playing');
    if (d.volume_percent == null) return toast(d.name + ' doesn’t let Spotify change its volume');
    // Count from the last volume asked for, so quick presses add up.
    d.volume_percent = Math.max(0, Math.min(100, d.volume_percent + delta));
    var v = d.volume_percent;
    musicDo(function (cb) { SpotifyApi.volume(v, cb); }, 'Volume ' + v + '%');
    paint('music');
  }

  function openDevicePicker() {
    SpotifyApi.devices(function (err, list) {
      if (err) return toast(err);
      openPicker({
        title: 'Play Spotify on…', hint: 'OK to switch · BACK to go back', back: 'home',
        empty: 'No devices found. Open Spotify on your phone, speaker or this TV, then try again.',
        items: function () {
          var mine = WebPlayer.deviceId();
          if (mine && !list.some(function (d) { return d.id === mine; })) list.unshift({ id: mine, name: WebPlayer.NAME, type: 'TV' });
          var items = list.map(function (d) {
            var name = d.id === mine ? WebPlayer.NAME + '   ·   plays while TV Hub is open' : d.name + '   ·   ' + d.type;
            return { label: name + (d.is_active ? '   (playing)' : ''), chip: d.is_active ? '✓ Current' : 'Play here', on: d.is_active,
              select: function () {
                if (d.id === mine) WebPlayer.activate();
                musicDo(function (cb) { SpotifyApi.transfer(d.id, true, cb); }, 'Playing on ' + d.name);
                show('home');
                return true;
              } };
          });
          if (!mine) {
            items.unshift(SpotifyApi.canStream()
              ? { label: 'This TV, through TV Hub   ·   ' + speakerText(), chip: 'Try again', select: function () { WebPlayer.stop(); WebPlayer.start(); toast('Starting TV Hub’s speaker…'); return true; } }
              : { label: 'This TV, through TV Hub   ·   reconnect Spotify once to allow it', chip: 'Reconnect', select: function () { show('pair'); return true; } });
          }
          var sp = appById('spotify');
          if (sp && sp.appId) items.push({ label: 'Use the Spotify app instead (leaves TV Hub; music stops if you leave Spotify)', chip: 'Open', select: function () { show('home'); openApp(sp); return true; } });
          return items;
        }
      });
    });
  }

  function renderMusic() {
    var row = $('row-music');
    row.innerHTML = '';
    if (!SpotifyApi.isPaired()) {
      var c = tile('add', 'music-connect');
      c.appendChild(el('div', 'name', 'Connect Spotify'));
      c.onselect = function () { show('pair'); };
      c.onfocusitem = function () {
        hero({ eyebrow: 'Spotify', title: 'Control Spotify from TV Hub',
          line1: 'See what’s playing, skip, change volume and play your playlists, on the TV, your phone or the Echo.',
          line2: 'One-time setup with your phone (Spotify Premium needed).', hint: 'Press OK to set up', art: { color: '#1db954', label: 'Spotify' } });
      };
      row.appendChild(c);
      $('music-note').textContent = '';
      return;
    }
    // Now playing
    var t = tile('pic wide', 'music-now');
    t.style.backgroundColor = '#14532d';
    var src = el('div', 'src', 'Spotify');
    src.style.background = '#1db954';
    src.style.color = '#000';
    t.appendChild(src);
    var flag = el('div', 'flag soon', '');
    t.appendChild(flag);
    var name = el('div', 'name small', 'Nothing playing');
    var sub = el('div', 'sub', 'OK to play');
    var bar = el('div', 'bar');
    bar.appendChild(el('i'));
    t.appendChild(name);
    t.appendChild(sub);
    t.appendChild(bar);
    function draw() {
      var item = nowItem();
      name.textContent = item ? item.name : 'Nothing playing';
      sub.textContent = item ? artistOf(item) : (music.err || 'OK to play');
      flag.textContent = isPlaying() ? 'PLAYING' : (item ? 'PAUSED' : '');
      flag.classList.toggle('hidden', !item);
      bar.firstChild.style.width = Math.round(musicProgress() * 100) + '%';
      var art = artOf(item);
      if (art !== t.lastArt) { setImage(t, art); t.lastArt = art; }
      var dev = music.state && music.state.device;
      $('music-note').textContent = dev ? 'on ' + dev.name + (dev.volume_percent != null ? ' · volume ' + dev.volume_percent + '%' : '') : '';
      if (t.classList.contains('focused')) {
        var id = (item && item.name) + '|' + isPlaying() + '|' + (dev && dev.volume_percent);
        if (id !== t.lastHero) { t.lastHero = id; t.onfocusitem(); }
        else $('hero-bar').firstChild.style.width = Math.round(musicProgress() * 100) + '%';
      }
    }
    onPaint('music', draw);
    t.onselect = togglePlay;
    t.onfocusitem = function () {
      var item = nowItem();
      hero({ eyebrow: 'Spotify' + (music.state && music.state.device ? ' · ' + music.state.device.name : ''),
        title: item ? item.name : 'Nothing playing', line1: artistOf(item),
        progress: item ? musicProgress() : null, line2: item && item.album ? item.album.name : (music.err || ''),
        hint: isPlaying() ? 'OK pauses · use the buttons to the right to skip or change volume' : 'OK plays',
        art: { image: artOf(item), color: '#1db954', label: 'Spotify' } });
    };
    draw();
    row.appendChild(t);

    // Controls
    [['music-prev', '◀◀', 'Previous', function () { musicDo(SpotifyApi.previous); }],
      ['music-play', '▶ II', 'Play / pause', togglePlay],
      ['music-next', '▶▶', 'Next', function () { musicDo(SpotifyApi.next); }],
      ['music-voldn', 'Vol −', 'Volume down', function () { changeVolume(-10); }],
      ['music-volup', 'Vol +', 'Volume up', function () { changeVolume(10); }],
      ['music-device', 'Play on…', 'Choose where Spotify plays', openDevicePicker]].forEach(function (b) {
      var ct = tile('ctl', b[0]);
      ct.appendChild(el('div', 'name', b[1]));
      ct.onselect = b[3];
      ct.onfocusitem = function () {
        var item = nowItem();
        hero({ eyebrow: 'Spotify', title: b[2], line1: item ? 'Now: ' + item.name + ' · ' + artistOf(item) : 'Nothing playing',
          progress: item ? musicProgress() : null, hint: 'Press OK', art: { image: artOf(item), color: '#1db954', label: 'Spotify' } });
      };
      row.appendChild(ct);
    });

    // TV Hub's own speaker
    var sp = tile('ctl speaker', 'music-speaker');
    var spName = el('div', 'name small', 'This TV');
    var spSub = el('div', 'sub', '');
    sp.appendChild(spName);
    sp.appendChild(spSub);
    function drawSpeaker() {
      var st = WebPlayer.status(), dev = music.state && music.state.device;
      var here = !!dev && dev.id === WebPlayer.deviceId();
      spSub.textContent = !SpotifyApi.canStream() ? 'Reconnect once' : here ? 'Playing here' : st === 'ready' ? 'Play here' :
        st === 'starting' ? 'Getting ready…' : st === 'failed' ? 'Not available' : 'Off';
      sp.classList.toggle('on', here);
    }
    onPaint('music', drawSpeaker);
    drawSpeaker();
    sp.onselect = function () {
      if (!SpotifyApi.canStream()) return show('pair');
      var st = WebPlayer.status();
      if (st === 'failed' || st === 'off') { WebPlayer.stop(); WebPlayer.start(); return toast('Starting TV Hub’s speaker…'); }
      if (st !== 'ready') return toast('Still getting ready — try again in a moment');
      WebPlayer.activate();
      musicDo(function (cb) { SpotifyApi.transfer(WebPlayer.deviceId(), true, cb); }, 'Playing through this TV');
    };
    sp.onfocusitem = function () {
      var st = WebPlayer.status();
      hero({ eyebrow: 'Spotify · this TV', title: 'Play through this TV',
        line1: speakerText(),
        line2: !SpotifyApi.canStream() ? 'TV Hub needs one extra Spotify permission. Reconnect with your phone, like the first time.' :
          st === 'failed' ? 'You can still use the Spotify app on this TV, or play on your phone or speaker and control it here.' :
          'Music plays while TV Hub is open. It stops if you open another app.',
        hint: !SpotifyApi.canStream() ? 'Press OK to reconnect' : st === 'failed' ? 'Press OK to try again' : 'Press OK to play here',
        art: { color: '#1db954', label: 'This TV' } });
    };
    row.appendChild(sp);

    // Playlists and recently played
    (music.lists || []).slice(0, 20).forEach(function (p) {
      var pt = tile('pic', 'music-' + p.key);
      pt.style.backgroundColor = '#1f2937';
      setImage(pt, p.image);
      pt.appendChild(el('div', 'name small', p.name));
      pt.appendChild(el('div', 'sub', p.sub));
      pt.onselect = function () { withTarget(function (id) { musicDo(function (cb) { SpotifyApi.playContext(p.uri, id, cb); }, 'Playing ' + p.name); }); };
      pt.onfocusitem = function () {
        hero({ eyebrow: 'Spotify · ' + p.sub, title: p.name, hint: 'OK plays it', art: { image: p.image, color: '#1db954', label: p.name } });
      };
      row.appendChild(pt);
    });
  }

  // A small "now playing" tile for On now; OK goes to the full Spotify row.
  function onNowMusicTile() {
    var t = tile('pic wide', 'onnow-music');
    t.style.backgroundColor = '#14532d';
    var src = el('div', 'src', 'Spotify');
    src.style.background = '#1db954';
    src.style.color = '#000';
    t.appendChild(src);
    var name = el('div', 'name small', '');
    var sub = el('div', 'sub', '');
    var bar = el('div', 'bar');
    bar.appendChild(el('i'));
    t.appendChild(name);
    t.appendChild(sub);
    t.appendChild(bar);
    function draw() {
      var item = nowItem();
      name.textContent = item ? item.name : 'Spotify';
      sub.textContent = item ? artistOf(item) : '';
      bar.firstChild.style.width = Math.round(musicProgress() * 100) + '%';
      var art = artOf(item);
      if (art !== t.lastArt) { setImage(t, art); t.lastArt = art; }
    }
    draw();
    onPaint('music', draw);
    t.onselect = function () { homeNav.focusKey('music-now'); };
    t.onfocusitem = function () {
      var item = nowItem();
      hero({ eyebrow: 'Spotify', title: item ? item.name : 'Spotify', line1: artistOf(item), progress: item ? musicProgress() : null,
        hint: 'OK for Spotify controls · ▶‖ on the remote plays/pauses', art: { image: artOf(item), color: '#1db954', label: 'Spotify' } });
    };
    return t;
  }

  // ---------------------------------------------------------------- Spotify pairing screen

  var pairNav = new Nav($('pair'), 'first');
  var freshQr = false;

  function renderPair() {
    var body = $('pair-body');
    body.innerHTML = '';
    var step1 = el('div', 'step');
    step1.appendChild(el('div', 'step-title', '1. Create a Spotify app (once, on your phone)'));
    step1.appendChild(el('div', 'step-text', 'Go to developer.spotify.com/dashboard → Create app. Any name and description. Redirect URI: ' +
      SpotifyApi.REDIRECT + ' (press Add). Tick “Web API” and “Web Playback SDK”, agree and Save. Then open the app’s Settings and copy its Client ID.'));
    body.appendChild(step1);
    var r1 = el('div', 'srow nav-row');
    var cid = el('input', 'field wide focusable');
    cid.type = 'text';
    cid.placeholder = 'Paste the Client ID here';
    cid.value = SpotifyApi.clientId();
    cid.onselect = function () { cid.focus(); };
    r1.appendChild(cid);
    r1.appendChild(chip('Save', function () {
      if (!SpotifyApi.setClientId(cid.value)) return toast('A Client ID is 32 letters and numbers — check it was pasted in full');
      toast('Saved — now scan the QR code');
      renderPair();
      pairNav.focus(1, 0);
    }));
    body.appendChild(r1);
    body.appendChild(el('div', 'step-text tip', 'Tip: to paste from your phone, use Apps2Samsung’s Remote keyboard, or the SmartThings app’s TV remote keyboard, which type straight into the TV.'));

    if (SpotifyApi.clientId().length === 32) {
      var step2 = el('div', 'step');
      step2.appendChild(el('div', 'step-title', '2. Sign in on your phone'));
      var wrap = el('div', 'qr-wrap');
      var img = el('img', 'qr');
      img.src = qrDataUrl(SpotifyApi.authUrl(freshQr), 360);
      freshQr = false;
      wrap.appendChild(img);
      wrap.appendChild(el('div', 'step-text', 'Scan with your phone’s camera and approve. Your phone then opens a page that won’t load, with an address starting 127.0.0.1 — that’s expected. Copy that whole address and paste it below.'));
      step2.appendChild(wrap);
      body.appendChild(step2);
      var r2 = el('div', 'srow nav-row');
      var code = el('input', 'field wide focusable');
      code.type = 'text';
      code.placeholder = 'Paste the 127.0.0.1 address here';
      code.onselect = function () { code.focus(); };
      r2.appendChild(code);
      r2.appendChild(chip('Connect', function () {
        toast('Connecting…');
        SpotifyApi.finishPairing(code.value, function (err) {
          if (err) return toast(err, 6000);
          toast('Spotify connected');
          music.listsAt = 0;
          WebPlayer.stop();
          WebPlayer.start();
          show('home');
          homeNav.focusKey('music-now');
        });
      }));
      body.appendChild(r2);
      var r3 = el('div', 'srow nav-row');
      r3.appendChild(chip('New QR code', function () { freshQr = true; renderPair(); pairNav.focus(2, 0); }));
      body.appendChild(r3);
    }
  }

  screens.pair = {
    enter: function () { Platform.hideTvWindow(); renderPair(); pairNav.focus(0, 0); },
    key: inputScreenKeys(pairNav, function () { show('home'); })
  };

  // Key handling for overlay screens with text boxes: arrows leave the box, BACK closes.
  function inputScreenKeys(nav, back) {
    return function (a) {
      var active = document.activeElement;
      if (active && active.tagName === 'INPUT') {
        if (a === 'ENTER' || a === 'UP' || a === 'DOWN' || a === 'BACK') { active.blur(); if (a === 'ENTER' || a === 'BACK') return; }
        else return;
      }
      if (a === 'BACK') return back();
      if (a === 'ENTER') return nav.select();
      nav.move(a);
    };
  }

  function qrDataUrl(text, px) {
    qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
    var qr = qrcode(0, 'L');
    qr.addData(text, 'Byte');
    qr.make();
    var cell = Math.max(2, Math.floor(px / (qr.getModuleCount() + 8)));
    return qr.createDataURL(cell, cell * 4);
  }

  // ---------------------------------------------------------------- sport stats screens

  var statsNav = new Nav($('stats'), 'nearest');

  var F1_COLOURS = {
    mclaren: '#ff8000', ferrari: '#e8002d', red_bull: '#3671c6', mercedes: '#27f4d2', aston_martin: '#229971',
    alpine: '#0093cc', williams: '#64c4ff', rb: '#6692ff', racing_bulls: '#6692ff', sauber: '#52e252',
    kick_sauber: '#52e252', audi: '#bb0a30', haas: '#b6babd', cadillac: '#c9b37e'
  };
  function teamColour(id) { return F1_COLOURS[id] || '#7aa2ff'; }

  var statsToken = 0;
  function dash(v) { return v == null || v !== v ? '–' : v; }

  // A focusable row (so ▲▼ scrolls through it) made of cells: [text|node, className]
  function statRow(parent, cells, cls) {
    var row = el('div', 'nav-row st-row focusable' + (cls ? ' ' + cls : ''));
    cells.forEach(function (c) {
      if (c == null) return;
      var cell = typeof c[0] === 'object' && c[0] ? c[0] : el('div', null, String(dash(c[0])));
      cell.className = (cell.className ? cell.className + ' ' : '') + 'st-cell ' + (c[1] || '');
      row.appendChild(cell);
    });
    parent.appendChild(row);
    return row;
  }

  function img(src, cls) {
    var i = el('div', cls);
    setImage(i, src);
    return i;
  }

  function openStats(kind) {
    var token = ++statsToken;
    var titles = { f1: 'Formula 1', pl: 'Premier League', nfl: 'NFL' };
    $('stats-title').textContent = titles[kind];
    var body = $('stats-body');
    body.className = 'scroll stats-' + kind;
    body.innerHTML = '';
    body.appendChild(el('div', 'label', 'Loading…'));
    show('stats');
    function fresh() { return token === statsToken && current === 'stats'; }
    function fail() { body.innerHTML = ''; statRow(body, [['Couldn’t load this right now — try again later', 'wide']]); statsNav.focus(0, 0); }
    if (kind === 'f1') Extras.f1(function (d) { if (fresh()) { if (d) drawF1(body, d); else fail(); } });
    if (kind === 'pl') Extras.premierLeague(function (rows) { if (fresh()) { if (rows) drawPL(body, rows); else fail(); } });
    if (kind === 'nfl') Extras.nfl(function (games) { if (fresh()) { if (games) drawNFL(body, games); else fail(); } });
  }

  // ---- F1: next race weekend as a timeline, then the two championships with points bars
  function drawF1(body, d) {
    body.innerHTML = '';
    if (d.race) {
      var card = el('div', 'nav-row f1-race focusable');
      var head = el('div', 'f1-race-head');
      head.appendChild(el('div', 'f1-kicker', 'Next race' + (d.race.round ? ' · Round ' + d.race.round : '')));
      head.appendChild(el('div', 'f1-race-name', d.race.name));
      if (d.race.circuit) head.appendChild(el('div', 'f1-circuit', d.race.circuit));
      card.appendChild(head);
      var line = el('div', 'f1-sessions');
      var now = Date.now(), nextMarked = false;
      d.race.sessions.forEach(function (s) {
        var length = (s.name === 'Race' ? 2.25 : 1.1) * HOUR;
        var state = now >= s.start && now < s.start.getTime() + length ? 'live'
          : now >= s.start.getTime() + length ? 'done' : (nextMarked ? '' : 'next');
        if (state === 'next') nextMarked = true;
        var chip = el('div', 'f1-session ' + state);
        chip.appendChild(el('div', 'f1-session-name', s.name));
        chip.appendChild(el('div', 'f1-session-when', state === 'live' ? 'LIVE NOW' : state === 'done' ? 'Done' : Guide.when(s.start)));
        line.appendChild(chip);
      });
      card.appendChild(line);
      body.appendChild(card);
    }
    if (d.drivers) {
      body.appendChild(el('div', 'st-heading', 'Drivers’ championship'));
      var top = parseFloat(d.drivers[0] && d.drivers[0].points) || 1;
      d.drivers.forEach(function (x) {
        var name = el('div', 'f1-driver');
        name.appendChild(el('span', 'f1-first', x.first ? x.first + ' ' : ''));
        name.appendChild(el('span', 'f1-last', x.last || x.name));
        var bar = el('div', 'st-bar');
        var fill = el('i');
        fill.style.width = Math.max(2, Math.round(parseFloat(x.points) / top * 100)) + '%';
        fill.style.background = teamColour(x.teamId);
        bar.appendChild(fill);
        var stripe = el('div', 'f1-stripe');
        stripe.style.background = teamColour(x.teamId);
        statRow(body, [[x.pos, 'pos'], [stripe], [name, 'grow'], [x.team, 'muted team'], [bar, 'barcell'], [x.points, 'pts'], [x.wins + ' wins', 'muted small']]);
      });
    }
    if (d.teams) {
      body.appendChild(el('div', 'st-heading', 'Constructors’ championship'));
      var topT = parseFloat(d.teams[0] && d.teams[0].points) || 1;
      d.teams.forEach(function (x) {
        var bar = el('div', 'st-bar');
        var fill = el('i');
        fill.style.width = Math.max(2, Math.round(parseFloat(x.points) / topT * 100)) + '%';
        fill.style.background = teamColour(x.teamId);
        bar.appendChild(fill);
        var stripe = el('div', 'f1-stripe');
        stripe.style.background = teamColour(x.teamId);
        statRow(body, [[x.pos, 'pos'], [stripe], [x.name, 'grow strong'], [bar, 'barcell'], [x.points, 'pts'], [x.wins + ' wins', 'muted small']]);
      });
    }
    statsNav.focus(0, 0);
  }

  // ---- Premier League: a proper table with crests; Champions League places and relegation marked
  function drawPL(body, rows) {
    body.innerHTML = '';
    var legend = el('div', 'pl-legend');
    legend.appendChild(el('span', 'pl-key ucl', 'Champions League places'));
    legend.appendChild(el('span', 'pl-key rel', 'Relegation'));
    body.appendChild(legend);
    var hdr = el('div', 'st-row pl-head');
    ['', '', 'Club', 'P', 'W', 'D', 'L', 'GD', 'Pts'].forEach(function (h, i) {
      hdr.appendChild(el('div', 'st-cell ' + ['pos', 'crest', 'grow', 'num', 'num', 'num', 'num', 'num', 'pts'][i], h));
    });
    body.appendChild(hdr);
    var n = rows.length;
    rows.forEach(function (r, i) {
      var zone = r.pos <= 4 ? 'ucl' : r.pos > n - 3 ? 'rel' : '';
      var gd = r.gd == null ? null : (r.gd > 0 ? '+' : '') + r.gd;
      statRow(body, [[r.pos, 'pos'], [img(r.logo, 'crest-img'), 'crest'], [r.team, 'grow strong'],
        [r.played, 'num'], [r.won, 'num'], [r.drawn, 'num'], [r.lost, 'num'], [gd, 'num'], [r.points, 'pts']], 'pl-row ' + zone);
    });
    statsNav.focus(0, 0);
  }

  // ---- NFL: a scoreboard of game cards, three to a row
  function drawNFL(body, games) {
    body.innerHTML = '';
    if (!games.length) { statRow(body, [['No games this week', 'wide']]); return statsNav.focus(0, 0); }
    if (games[0].week) body.appendChild(el('div', 'st-heading', 'Week ' + games[0].week));
    var row = null;
    games.forEach(function (g, i) {
      if (i % 3 === 0) { row = el('div', 'nav-row nfl-grid'); body.appendChild(row); }
      var card = el('div', 'nfl-card focusable ' + g.state);
      var status = el('div', 'nfl-status ' + g.state, g.state === 'in' ? 'LIVE · ' + g.detail : g.state === 'post' ? 'FINAL' : Guide.when(g.start));
      card.appendChild(status);
      [g.away, g.home].forEach(function (t, k) {
        var line = el('div', 'nfl-team' + (g.state === 'post' && !t.winner ? ' lost' : ''));
        var logo = img(t.logo, 'nfl-logo');
        if (!t.logo) { logo.textContent = t.abbr || t.name.charAt(0); logo.style.background = t.color || '#232b45'; }
        line.appendChild(logo);
        var nm = el('div', 'nfl-name');
        nm.appendChild(el('div', null, t.name));
        nm.appendChild(el('div', 'nfl-rec', (k === 0 ? 'Away' : 'Home') + (t.record ? ' · ' + t.record : '')));
        line.appendChild(nm);
        line.appendChild(el('div', 'nfl-score', g.state === 'pre' ? '' : dash(t.score)));
        card.appendChild(line);
      });
      row.appendChild(card);
    });
    statsNav.focus(0, 0);
  }

  screens.stats = {
    enter: function () { Platform.hideTvWindow(); },
    key: function (a) {
      if (a === 'BACK') return show('home');
      if (a !== 'ENTER') statsNav.move(a);
    }
  };

  function statsTiles(row) {
    [['f1', 'F1 standings & race times'], ['pl', 'Premier League table'], ['nfl', 'NFL scores']].forEach(function (s) {
      if (state.mySports.indexOf(s[0]) === -1) return;
      var t = tile('add stat', 'stats-' + s[0]);
      t.appendChild(el('div', 'name', s[1]));
      t.onselect = function () { openStats(s[0]); };
      t.onfocusitem = function () {
        hero({ eyebrow: 'My sport', title: s[1], line1: s[0] === 'f1' ? 'Championship standings and this weekend’s session times.'
          : s[0] === 'pl' ? 'The current table.' : 'This week’s games, with scores and kick-off times.',
          hint: 'Press OK to open', art: { color: SKY_COLOUR, label: s[1] } });
      };
      row.appendChild(t);
    });
  }

  // ---------------------------------------------------------------- "it's starting" alerts

  var alertShown = null, alertTimer = null, alertAt = 0;

  function checkAlerts() {
    // One at a time: the next one shows after this is dismissed or times out. Only on the home
    // screen or full-screen TV while TV Hub is in view, so nothing is missed or interrupts typing.
    if (!sportEvents || alertShown || document.hidden || (current !== 'home' && current !== 'watch')) return;
    var now = Date.now(), seen = state.alerted;
    for (var k in seen) if (now - seen[k] > 3 * 24 * HOUR) delete seen[k];
    for (var i = 0; i < sportEvents.length; i++) {
      var e = sportEvents[i];
      if (/practice|\bfp[123]\b/i.test(e.title)) continue; // practice sessions: listed, but no alert
      var startsIn = e.start - now;
      if (state.options.alertLive && startsIn <= 0 && -startsIn < 15 * MINUTE && now < e.stop && !seen[e.key + ':live']) return showAlert(e, 'live');
      if (state.options.alertSoon && startsIn > 0 && startsIn <= 10 * MINUTE && !seen[e.key + ':soon']) return showAlert(e, 'soon');
    }
  }

  function showAlert(e, kind) {
    state.alerted[e.key + ':' + kind] = Date.now();
    if (kind === 'live') state.alerted[e.key + ':soon'] = Date.now();
    save();
    if (ambientOn) exitAmbient();
    alertShown = e;
    alertAt = Date.now();
    $('alert-flag').textContent = kind === 'live' ? 'LIVE NOW' : 'IN ' + Math.max(1, Math.round((e.start - Date.now()) / MINUTE)) + ' MIN';
    $('alert-title').textContent = e.title;
    $('alert-sub').textContent = e.sport.name + ' · ' + e.channels.map(function (c) { return c.name; }).join(' and ') + '   ·   OK: watch on NOW   ·   BACK: dismiss';
    $('alert').classList.remove('hidden');
    clearTimeout(alertTimer);
    alertTimer = setTimeout(hideAlert, 30000);
  }

  function hideAlert() {
    clearTimeout(alertTimer);
    if (!alertShown) return;
    alertShown = null;
    $('alert').classList.add('hidden');
    setTimeout(checkAlerts, 2000); // anything that came up meanwhile
  }

  // ---------------------------------------------------------------- new-episode reminders

  function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }

  // Shows with an episode out today (already, or later tonight).
  function episodesToday() {
    var now = new Date();
    return state.shows.map(function (s) {
      var info = s.info || {};
      var next = info.next && info.next.airstamp && new Date(info.next.airstamp);
      var prev = info.prev && info.prev.airstamp && new Date(info.prev.airstamp);
      if (next && sameDay(next, now)) return { show: s, ep: info.next, at: next, upcoming: next > now };
      if (prev && sameDay(prev, now)) return { show: s, ep: info.prev, at: prev, upcoming: false };
      return null;
    }).filter(Boolean);
  }

  function episodeTile(x) {
    var s = x.show, app = appById(s.app) || {};
    var t = tile('pic wide', 'onnow-ep-' + s.tvmazeId);
    t.style.backgroundColor = app.color || '#232b45';
    setImage(t, s.info && (s.info.art || s.info.poster));
    var src = el('div', 'src', app.name || 'Show');
    src.style.background = app.color || '#555';
    t.appendChild(src);
    t.appendChild(el('div', 'flag new', x.upcoming ? 'NEW TONIGHT ' + Guide.clock(x.at) : 'NEW TODAY'));
    t.appendChild(el('div', 'name small', s.name));
    t.appendChild(el('div', 'sub', Shows.epLabel(x.ep) + (x.ep.name ? ' · ' + x.ep.name : '')));
    t.onselect = function () { openShow(s); };
    t.onfocusitem = function () { heroShow(s); };
    return t;
  }

  // ---------------------------------------------------------------- settings backup

  var backupNav = new Nav($('backup'), 'first');

  function backupText() {
    return 'TVHUB1' + JSON.stringify({
      apps: state.apps.map(function (a) { return [a.id, a.name, a.appId, a.hidden ? 1 : 0, a.hotkey || '', a.color, a.text]; }),
      ch: state.channels.map(function (c) { return [c.major, c.minor || 0, c.name]; }),
      on: state.online, sh: state.shows.map(function (s) { return [s.tvmazeId, s.name, s.app]; }),
      sp: state.sportHidden, ms: state.mySports, o: state.options, last: state.lastKey, sc: SpotifyApi.clientId()
    });
  }

  function restore(text) {
    var m = /TVHUB1(\{[\s\S]*\})/.exec(String(text || '').trim());
    var d = null;
    try { d = m && JSON.parse(m[1]); } catch (e) { d = null; }
    var bad = 'That isn’t a complete TV Hub backup — it should start with TVHUB1 and be pasted in full';
    if (!d || typeof d !== 'object' || !Array.isArray(d.apps)) return bad;
    function str(v) { return typeof v === 'string' ? v : ''; }
    function list(v) { return Array.isArray(v) ? v : []; }
    var known = {};
    TVHUB_DEFAULTS.apps.forEach(function (a) { known[a.id] = a; });
    var used = {}, apps = [];
    d.apps.forEach(function (a) {
      if (!Array.isArray(a) || !str(a[0]) || used[a[0]]) return;
      used[a[0]] = true;
      var base = known[a[0]] ? clone(known[a[0]]) : { id: a[0] };
      base.name = str(a[1]) || base.name || a[0];
      base.appId = str(a[2]);
      base.hidden = !!a[3];
      base.hotkey = HOTKEYS.indexOf(a[4]) !== -1 ? a[4] : null;
      base.color = /^#[0-9a-f]{3,8}$/i.test(a[5]) ? a[5] : base.color || '#555555';
      base.text = /^#[0-9a-f]{3,8}$/i.test(a[6]) ? a[6] : base.text || '#ffffff';
      apps.push(base);
    });
    if (!apps.length) return bad;
    var taken = {};
    apps.forEach(function (a) { if (a.hotkey) { if (taken[a.hotkey]) a.hotkey = null; else taken[a.hotkey] = true; } });
    var channels = [], seenCh = {};
    list(d.ch).forEach(function (c) {
      if (!Array.isArray(c) || typeof c[0] !== 'number' || !(c[0] > 0)) return;
      var ch = { major: c[0], minor: typeof c[1] === 'number' ? c[1] : 0, name: str(c[2]) || 'Channel ' + c[0] };
      if (!seenCh[chKey(ch)]) { seenCh[chKey(ch)] = true; channels.push(ch); }
    });
    var shows = [];
    list(d.sh).forEach(function (x) {
      if (Array.isArray(x) && typeof x[0] === 'number' && str(x[1])) shows.push({ tvmazeId: x[0], name: x[1], app: str(x[2]) });
    });
    var options = clone(state.options);
    if (d.o && typeof d.o === 'object') {
      for (var k in TVHUB_DEFAULTS.options) {
        if (k in d.o && typeof d.o[k] === typeof TVHUB_DEFAULTS.options[k]) options[k] = d.o[k];
      }
      if (d.o.spotifyKey === null || HOTKEYS.indexOf(d.o.spotifyKey) !== -1) options.spotifyKey = d.o.spotifyKey;
    }
    if (options.spotifyKey && taken[options.spotifyKey]) options.spotifyKey = null;
    // All checked: apply in one go.
    state.apps = apps;
    state.channels = channels;
    state.online = list(d.on).filter(function (k) { return PLAYER[k]; });
    state.shows = shows;
    state.sportHidden = list(d.sp).filter(function (k) { return SPORT.some(function (c) { return c.key === k; }); });
    state.mySports = list(d.ms).filter(function (k) { return SPORTS.some(function (x) { return x.key === k; }); });
    state.options = options;
    state.lastKey = typeof d.last === 'string' ? d.last : null;
    if (str(d.sc)) SpotifyApi.setClientId(d.sc);
    save();
    return null;
  }

  function renderBackup() {
    var body = $('backup-body');
    body.innerHTML = '';
    var text = backupText();
    var wrap = el('div', 'qr-wrap');
    var img = el('img', 'qr');
    try { img.src = qrDataUrl(text, 620); } catch (e) { img = el('div', 'label', 'Too much to fit in a QR code — remove a few shows and try again.'); }
    wrap.appendChild(img);
    wrap.appendChild(el('div', 'step-text', 'Back up: scan this with your phone’s camera and save the text it shows (email it to yourself or keep it in Google Drive). ' +
      'It holds your apps, colour buttons, channels, shows, sports and options — not your Spotify sign-in.'));
    body.appendChild(wrap);
    body.appendChild(el('div', 'step-title', 'Restore'));
    body.appendChild(el('div', 'step-text', 'Paste a saved backup here (Apps2Samsung → Remote can type it into the TV), then press Restore twice.'));
    var row = el('div', 'srow nav-row');
    var input = el('input', 'field wide focusable');
    input.type = 'text';
    input.placeholder = 'Paste the TVHUB1… text here';
    input.onselect = function () { input.focus(); };
    row.appendChild(input);
    row.appendChild(confirmChip('Restore', function () {
      var err = restore(input.value);
      if (err) return toast(err, 6000);
      toast('Settings restored');
      show('home');
    }));
    body.appendChild(row);
  }

  screens.backup = {
    enter: function () { Platform.hideTvWindow(); renderBackup(); backupNav.focus(0, 0); },
    key: inputScreenKeys(backupNav, function () { show('settings'); })
  };

  // ---------------------------------------------------------------- weather

  var weatherNow = null;
  function loadWeather() {
    Extras.weather(state.options.town, function (w) {
      weatherNow = w;
      $('weather').textContent = w ? w.temp + '° ' + w.text + '   ·   Tomorrow ' + w.tomorrowMin + '–' + w.tomorrowMax + '° ' + w.tomorrowText : '';
      if (ambientOn) drawAmbient();
    });
  }

  function openTownPicker() {
    openPicker({
      title: 'Weather for…', hint: 'OK to choose · BACK to go back',
      items: function () {
        return TVHUB_DEFAULTS.towns.map(function (t) {
          var on = t[0] === state.options.town;
          return { label: t[0], chip: on ? '✓ Chosen' : 'Choose', on: on,
            select: function () { state.options.town = t[0]; save(); loadWeather(); show('settings'); return true; } };
        });
      }
    });
  }

  // ---------------------------------------------------------------- ambient screensaver

  var ambientOn = false;

  function enterAmbient() {
    ambientOn = true;
    Platform.hideTvWindow();
    $('ambient').classList.remove('hidden');
    drawAmbient();
    pollMusic(true);
  }

  function exitAmbient() {
    ambientOn = false;
    $('ambient').classList.add('hidden');
    if (current === 'home') showPreview();
  }

  function drawAmbient() {
    var now = new Date();
    $('amb-clock').textContent = Guide.clock(now);
    $('amb-date').textContent = $('date').textContent;
    $('amb-weather').textContent = weatherNow ? weatherNow.temp + '° ' + weatherNow.text + '  ·  today ' + weatherNow.todayMin + '–' + weatherNow.todayMax + '°' : '';
    var item = nowItem();
    $('amb-music').classList.toggle('hidden', !item);
    if (item) {
      setImage($('amb-art'), artOf(item));
      $('amb-track').textContent = item.name;
      $('amb-artist').textContent = artistOf(item) + (isPlaying() ? '' : '  (paused)');
    }
    var live = liveEvents()[0];
    var next = (sportEvents || []).filter(function (e) { return e.start > Date.now(); })[0];
    $('amb-sport').textContent = live ? 'LIVE  ' + live.title + ' · ' + live.channels[0].name
      : next ? 'Next: ' + next.title + ' · ' + Guide.when(next.start) : '';
    // Drift slightly so nothing sits in the same place for hours.
    var box = $('amb-box');
    box.style.transform = 'translate(' + (now.getMinutes() % 7) * 12 + 'px,' + (now.getMinutes() % 5) * 14 + 'px)';
  }

  function checkAmbient() {
    var mins = state.options.ambientMins;
    if (ambientOn) return drawAmbient();
    if (!mins || current !== 'home' || document.hidden || alertShown || launchTimer) return;
    if (Date.now() - lastKeyAt > mins * MINUTE) enterAmbient();
  }

  // ---------------------------------------------------------------- global bits

  var toastTimer = null;
  function toast(msg, ms) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.add('hidden'); }, ms || 3500);
  }

  function tickClock() {
    var now = new Date();
    var hh = now.getHours(), mm = now.getMinutes();
    $('clock').textContent = (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
    var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    $('date').textContent = days[now.getDay()] + ' ' + now.getDate() + ' ' + months[now.getMonth()];
  }

  // Every minute: progress bars move on and finished programmes give way to the next.
  // Every hour: rebuild the screen so show alerts and orderings stay current on a TV left on for days.
  var lastFullRender = Date.now();
  var weatherAt = Date.now();
  function tick() {
    checkAlerts();
    if (Date.now() - weatherAt > 30 * MINUTE) { weatherAt = Date.now(); loadWeather(); }
    if (current !== 'home' || document.hidden) return;
    if (Date.now() - lastFullRender > HOUR && Date.now() - lastKeyAt > 10000) { lastFullRender = Date.now(); renderHome(); }
    else refreshData();
  }

  function getScale() {
    return Platform.isTv ? 1 : Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  }
  function fitStage() {
    $('stage').style.transform = 'scale(' + getScale() + ')';
  }

  document.addEventListener('keydown', function (e) {
    var a = Platform.actionFor(e);
    if (!a) return;
    lastKeyAt = Date.now();
    // The screensaver: any button just wakes it.
    if (ambientOn) { e.preventDefault(); exitAmbient(); return; }
    // A sport alert is showing: OK watches, BACK dismisses.
    var typingNow = document.activeElement && document.activeElement.tagName === 'INPUT';
    if (alertShown && (a === 'ENTER' || a === 'BACK') && !typingNow && (current === 'home' || current === 'watch')) {
      e.preventDefault();
      if (a === 'ENTER' && Date.now() - alertAt < 1500) return; // ignore an OK pressed just as it appeared
      var ev = alertShown;
      hideAlert();
      if (a === 'ENTER') {
        var nowApp = appById(TVHUB_DEFAULTS.sportApp);
        if (nowApp) openApp(nowApp, 'Opening NOW — choose ' + ev.channels[0].name, 1500);
      }
      return;
    }
    // While an app is about to open, OK does nothing more and any other button cancels.
    if (launchTimer) {
      e.preventDefault();
      if (a !== 'ENTER' && cancelLaunch()) toast('Cancelled');
      return;
    }
    if (a === 'INFO' && current === 'home') return show('settings');
    // The remote's media buttons control Spotify.
    if (a === 'PLAYPAUSE') { if (SpotifyApi.isPaired()) togglePlay(); return; }
    if ((a === 'NEXT' || a === 'PREV') && SpotifyApi.isPaired() && current !== 'watch') {
      return musicDo(a === 'NEXT' ? SpotifyApi.next : SpotifyApi.previous);
    }
    var typing = document.activeElement && document.activeElement.tagName === 'INPUT';
    if (typing && e.keyCode === 8) return; // Backspace deletes text (keyboard in demo mode)
    if (!typing) e.preventDefault();

    if (a === 'EXIT') return Platform.exit();

    // Colour buttons and channel numbers work from home and while watching.
    if (current === 'home' || current === 'watch') {
      var colour = { RED: 'red', GREEN: 'green', YELLOW: 'yellow', BLUE: 'blue' }[a];
      if (colour) {
        if (colour === state.options.spotifyKey && SpotifyApi.isPaired()) return togglePlay();
        var app = appForHotkey(colour);
        if (app) openApp(app);
        return;
      }
      if (a.indexOf('DIGIT_') === 0) return onDigit(a.slice(6));
      if (current === 'home' && (a === 'CH_UP' || a === 'CH_DOWN')) return stepChannel(a === 'CH_UP' ? 1 : -1);
    }
    if (typing && a.indexOf('DIGIT_') === 0) return;
    if (screens[current]) screens[current].key(a);
  });

  // Coming back from Netflix etc.: refresh everything (keeping your place) and put the live preview back.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { clearTimeout(previewTimer); cancelLaunch(); hideAlert(); if (ambientOn) exitAmbient(); Platform.hideTvWindow(); tunedKey = null; return; }
    lastKeyAt = Date.now(); // time away counts as activity, so the screensaver doesn't start at once
    if (current === 'home') { renderHome(); showPreview(); }
    else if (current === 'watch') screens.watch.enter();
    if (WebPlayer.status() !== 'ready') WebPlayer.start(); // the TV may have dropped it while we were away
  });

  window.addEventListener('resize', fitStage);

  // ---------------------------------------------------------------- start

  if (!Platform.isTv) {
    document.body.classList.add('demo');
    $('demo-badge').classList.remove('hidden');
    window.TVHubDebug = { backupText: backupText, restore: restore }; // for testing in a browser only
  }
  save(); // store any upgrade from an older version straight away
  Platform.registerKeys();
  fitStage();
  tickClock();
  setInterval(tickClock, 15000);
  setInterval(tick, MINUTE);
  renderHome();
  showPreview();
  loadWeather();
  lastKeyAt = Date.now();
  setInterval(checkAmbient, 15000);
  // Spotify: re-read what's playing every 5 s and move the progress bar every second.
  setInterval(function () { if ((current === 'home' || ambientOn) && !document.hidden) pollMusic(); }, 5000);
  setInterval(function () { if (isPlaying() && current === 'home' && !document.hidden) paint('music'); }, 1000);
  // Make TV Hub a Spotify speaker (does nothing until Spotify is connected with permission to play).
  WebPlayer.onChange(function () { paint('music'); });
  WebPlayer.start();
  // Find NOW, RTÉ Player etc. on this TV by name if their IDs aren't known yet.
  Platform.resolveApps(state.apps, function (changedIds) {
    if (changedIds) { save(); renderHome(); }
  });
})();
