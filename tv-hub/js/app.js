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
      sportHidden: defaultSportHidden(), mySports: d.mySports, options: d.options, usage: {}, lastKey: null
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
  var OVERLAYS = ['settings', 'picker', 'search'];

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
  function followedSport(title) {
    if (!/\blive\b/i.test(title)) return null;
    for (var i = 0; i < SPORTS.length; i++) {
      var sp = SPORTS[i];
      if (state.mySports.indexOf(sp.key) === -1) continue;
      if (new RegExp(sp.match, 'i').test(title) && !(sp.not && new RegExp(sp.not, 'i').test(title))) return sp;
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
      scheduleRebuild();
    });
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
    return state.online.join() + '|' + keys(liveEvents()) + '|' + keys((sportEvents || []).slice(0, 12));
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
    reset.appendChild(el('div', 'label', 'Start again (removes your shows and channels)'));
    reset.appendChild(confirmChip('Reset everything', function () {
      try { localStorage.removeItem(STORE_KEY); } catch (e) {}
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
  function tick() {
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
    // While an app is about to open, OK does nothing more and any other button cancels.
    if (launchTimer) {
      e.preventDefault();
      if (a !== 'ENTER' && cancelLaunch()) toast('Cancelled');
      return;
    }
    if (a === 'INFO' && current === 'home') return show('settings');
    var typing = document.activeElement && document.activeElement.tagName === 'INPUT';
    if (typing && e.keyCode === 8) return; // Backspace deletes text (keyboard in demo mode)
    if (!typing) e.preventDefault();

    if (a === 'EXIT') return Platform.exit();

    // Colour buttons and channel numbers work from home and while watching.
    if (current === 'home' || current === 'watch') {
      var colour = { RED: 'red', GREEN: 'green', YELLOW: 'yellow', BLUE: 'blue' }[a];
      if (colour) {
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
    if (document.hidden) { clearTimeout(previewTimer); cancelLaunch(); Platform.hideTvWindow(); tunedKey = null; }
    else if (current === 'home') { renderHome(); showPreview(); }
    else if (current === 'watch') screens.watch.enter();
  });

  window.addEventListener('resize', fitStage);

  // ---------------------------------------------------------------- start

  if (!Platform.isTv) {
    document.body.classList.add('demo');
    $('demo-badge').classList.remove('hidden');
  }
  save(); // store any upgrade from an older version straight away
  Platform.registerKeys();
  fitStage();
  tickClock();
  setInterval(tickClock, 15000);
  setInterval(tick, MINUTE);
  renderHome();
  showPreview();
  // Find NOW, RTÉ Player etc. on this TV by name if their IDs aren't known yet.
  Platform.resolveApps(state.apps, function (changedIds) {
    if (changedIds) { save(); renderHome(); }
  });
})();
