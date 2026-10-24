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
  var SKY_COLOUR = '#003f8c';

  function $(id) { return document.getElementById(id); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function bgImage(e, url) { if (url) e.style.backgroundImage = 'url("' + url + '")'; }
  function trim(s, n) { return s && s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : (s || ''); }

  // ---------------------------------------------------------------- state

  var state = load();

  function fresh() {
    var d = clone(TVHUB_DEFAULTS);
    return {
      version: d.version, apps: d.apps, channels: d.channels, shows: d.shows,
      sportHidden: [], options: d.options, usage: {}, lastChannel: 0
    };
  }

  function load() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) {}
    if (!saved) return fresh();
    var opts = clone(TVHUB_DEFAULTS.options);
    for (var k in saved.options) opts[k] = saved.options[k];
    saved.options = opts;
    saved.usage = saved.usage || {};
    if ((saved.version || 1) < TVHUB_DEFAULTS.version) migrate(saved);
    return saved;
  }

  // Bring a setup saved by an older version up to date without losing anything.
  function migrate(s) {
    var d = clone(TVHUB_DEFAULTS);
    d.apps.forEach(function (app, i) {
      var mine = s.apps.filter(function (a) { return a.id === app.id; })[0];
      if (mine) { if (!mine.match) mine.match = app.match; }
      else s.apps.splice(Math.min(i, s.apps.length), 0, app);
    });
    var players = d.channels.filter(function (c) { return c.kind === 'player'; });
    s.channels = players.concat(s.channels);
    s.lastChannel = (s.lastChannel || 0) + players.length;
    s.shows = s.shows || [];
    s.sportHidden = s.sportHidden || [];
    s.version = d.version;
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  function appById(id) { return state.apps.filter(function (a) { return a.id === id; })[0]; }

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

  function isTuner(ch) { return ch && ch.kind !== 'player'; }
  function channelLabel(c) { return c.minor ? c.major + '-' + c.minor : String(c.major); }
  function playerDef(ch) { return PLAYER[ch.guide] || {}; }

  // Index of the next satellite channel from `from` in direction `dir` (wraps), or -1.
  function stepTuner(from, dir) {
    var n = state.channels.length;
    for (var k = 1; k <= n; k++) {
      var i = (((from + dir * k) % n) + n) % n;
      if (isTuner(state.channels[i])) return i;
    }
    return -1;
  }
  function lastTuner() {
    var i = state.lastChannel;
    return isTuner(state.channels[i]) ? i : stepTuner(-1, 1);
  }

  // ---------------------------------------------------------------- navigation

  // A screen's focusable items live in `.nav-row` containers. UP/DOWN moves between rows,
  // LEFT/RIGHT within a row. Each screen remembers where focus was.
  function Nav(root) {
    this.root = root;
    this.r = 0;
    this.c = 0;
  }
  Nav.prototype.rows = function () {
    return Array.prototype.filter.call(this.root.querySelectorAll('.nav-row'), function (row) {
      return row.offsetParent !== null && row.querySelector('.focusable');
    });
  };
  Nav.prototype.items = function (row) { return row ? row.querySelectorAll('.focusable') : []; };
  Nav.prototype.current = function () {
    var row = this.rows()[this.r];
    return row ? this.items(row)[this.c] : null;
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
  Nav.prototype.refresh = function () { this.focus(this.r, this.c); };
  Nav.prototype.move = function (action) {
    if (action === 'UP') this.focus(this.r - 1, this.c);
    else if (action === 'DOWN') this.focus(this.r + 1, this.c);
    else if (action === 'LEFT') this.focus(this.r, this.c - 1);
    else if (action === 'RIGHT') this.focus(this.r, this.c + 1);
  };
  Nav.prototype.select = function () {
    var cur = this.current();
    if (cur && cur.onselect) cur.onselect();
  };

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
      var top = (title && title.classList.contains('row-title') ? title : row).offsetTop - row.parentNode.offsetTop;
      var bottom = row.offsetTop - row.parentNode.offsetTop + row.offsetHeight + 24;
      var h = row.parentNode.parentNode.clientHeight;
      if (top < homeScroll) homeScroll = top;
      else if (bottom > homeScroll + h) homeScroll = bottom - h;
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
    ['home', 'watch'].concat(OVERLAYS).forEach(function (s) {
      var on = s === name || (s === 'home' && OVERLAYS.indexOf(name) !== -1);
      $(s).classList.toggle('active', on);
    });
    if (screens[name] && screens[name].enter) screens[name].enter(prev);
  }

  // ---------------------------------------------------------------- hero (top half of home)

  // o: { eyebrow, title, line1, line2, hint, progress (0-1 or null), art: {image, color, label} | null }
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
      art.style.backgroundImage = o.art.image ? 'url("' + o.art.image + '")' : '';
      art.classList.toggle('has-image', !!o.art.image);
      art.firstChild.textContent = o.art.label || '';
    }
  }

  function untilText(p) { return p ? 'until ' + Guide.clock(p.stop) : ''; }

  // ---------------------------------------------------------------- home

  var homeNav = new Nav($('home'));
  var updaters = [];   // refresh "now on" info in tiles every minute
  var sportNow = {};   // sport key -> latest { now, next }

  function renderHome() {
    updaters = [];
    renderShows();
    renderApps();
    renderChannels();
    renderSport();
    renderTools();
    renderHotkeys();
    homeNav.refresh();
  }

  // -- My shows

  var showTried = {};
  function sortedShows() {
    var order = state.shows.slice();
    return state.shows.slice().sort(function (a, b) {
      var n = (Shows.isNew(b) ? 1 : 0) - (Shows.isNew(a) ? 1 : 0);
      return n || (b.lastOpened || 0) - (a.lastOpened || 0) || order.indexOf(a) - order.indexOf(b);
    });
  }

  function renderShows() {
    var row = $('row-shows');
    row.innerHTML = '';
    sortedShows().forEach(function (s) {
      var app = appById(s.app) || {};
      var t = el('div', 'tile show focusable');
      var poster = el('div', 'poster', s.info && s.info.poster ? '' : s.name.charAt(0));
      bgImage(poster, s.info && s.info.poster);
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
      t.onfocusitem = t.heroRefresh = function () { heroShow(s); };
      row.appendChild(t);

      var stale = !s.info || Date.now() - s.info.at > 6 * 3600 * 1000;
      if (stale && Date.now() - (showTried[s.tvmazeId] || 0) > 10 * 60 * 1000) {
        showTried[s.tvmazeId] = Date.now();
        Shows.refresh(s, function () { save(); scheduleRender(); });
      }
    });
    var add = el('div', 'tile add focusable');
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
    s.lastOpened = Date.now();
    var app = appById(s.app);
    if (!app) { toast('Choose which app ' + s.name + ' is on in Settings'); return; }
    openApp(app);
  }

  // -- Apps

  function renderApps() {
    var row = $('row-apps');
    row.innerHTML = '';
    visibleApps().forEach(function (app) {
      var t = el('div', 'tile focusable');
      t.style.background = app.color;
      t.style.color = app.text || '#fff';
      t.appendChild(el('div', 'name', app.name));
      if (app.hotkey) t.appendChild(el('div', 'key dot ' + app.hotkey));
      t.onselect = function () { openApp(app); };
      t.onfocusitem = function () {
        hero({
          eyebrow: 'App', title: app.name,
          line1: app.hotkey ? 'Shortcut: the ' + app.hotkey + ' button on your remote' : '',
          line2: app.appId ? '' : 'Not found on this TV yet — add it in Settings',
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
    hk.appendChild(el('span', null, '0–9  jump to channel'));
  }

  // -- Live channels (satellite + player apps)

  function renderChannels() {
    var row = $('row-channels');
    row.innerHTML = '';
    var last = lastTuner();
    state.channels.forEach(function (ch, i) {
      row.appendChild(isTuner(ch) ? tunerTile(ch, i, i === last) : playerTile(ch, i));
    });
  }

  function tunerTile(ch, i, isLast) {
    var t = el('div', 'tile channel focusable');
    t.appendChild(el('div', 'num', channelLabel(ch)));
    if (isLast) t.appendChild(el('div', 'live', 'LAST'));
    t.appendChild(el('div', 'name', ch.name));
    var sub = el('div', 'sub', '');
    t.appendChild(sub);
    t.onselect = function () { watchChannel(i); };
    t.onfocusitem = function () { previewChannel(i); };
    Platform.getNowNext(ch, function (nn) { if (nn.now) sub.textContent = 'Now: ' + nn.now; });
    return t;
  }

  function playerTile(ch, i) {
    var def = playerDef(ch);
    var app = appById(def.app) || {};
    var t = el('div', 'tile pic wide focusable');
    t.style.backgroundColor = app.color || '';
    var src = el('div', 'src', app.name || '');
    src.style.background = app.color || '#555';
    t.appendChild(src);
    t.appendChild(el('div', 'name small', ch.name));
    var sub = el('div', 'sub', 'Live on ' + (app.name || 'the player'));
    var bar = el('div', 'bar');
    bar.appendChild(el('i'));
    t.appendChild(sub);
    t.appendChild(bar);
    var latest = null;
    function update() {
      Guide.nowNext(def.source, def.id, function (nn) {
        latest = nn;
        if (nn.now) {
          sub.textContent = 'Now: ' + nn.now.title;
          bar.firstChild.style.width = Math.round(Guide.progress(nn.now) * 100) + '%';
          bgImage(t, nn.now.image);
        }
        if (t.classList.contains('focused')) t.heroRefresh();
      });
    }
    update();
    updaters.push(update);
    t.onselect = function () { openPlayerChannel(ch); };
    t.onfocusitem = t.heroRefresh = function () {
      var nn = latest || {};
      hero({
        eyebrow: 'Live on ' + (app.name || 'the player'), title: ch.name,
        line1: nn.now ? 'Now: ' + nn.now.title + '  ·  ' + untilText(nn.now) : 'Loading what’s on…',
        progress: nn.now ? Guide.progress(nn.now) : null,
        line2: nn.next ? 'Next at ' + Guide.clock(nn.next.start) + ': ' + nn.next.title : '',
        hint: 'Press OK to open ' + (app.name || 'the app'),
        art: { image: nn.now && nn.now.image, color: app.color, label: ch.name }
      });
    };
    return t;
  }

  function openPlayerChannel(ch) {
    var app = appById(playerDef(ch).app);
    if (!app) return toast('Add the player app in Settings first');
    openApp(app, 'Opening ' + app.name + ' — pick ' + ch.name + ' under Live');
  }

  // -- Sport (Sky Sports on NOW)

  function isLiveEvent(p) { return !!p && /\blive\b/i.test(p.title); }

  // Shown sport channels, live events first, then in list order.
  function sportOrder() {
    return SPORT.filter(function (c) { return state.sportHidden.indexOf(c.key) === -1; }).sort(function (a, b) {
      var la = isLiveEvent((sportNow[a.key] || {}).now), lb = isLiveEvent((sportNow[b.key] || {}).now);
      return (lb ? 1 : 0) - (la ? 1 : 0) || SPORT.indexOf(a) - SPORT.indexOf(b);
    });
  }
  function orderKey(list) { return list.map(function (c) { return c.key; }).join(); }

  function renderSport() {
    var row = $('row-sport');
    row.innerHTML = '';
    var chans = sportOrder();
    var rendered = orderKey(chans);
    $('sport-title').classList.toggle('hidden', !chans.length);
    row.classList.toggle('hidden', !chans.length);
    var app = appById(TVHUB_DEFAULTS.sportApp) || {};
    var pending = chans.length;
    chans.forEach(function (c) {
      var t = el('div', 'tile pic wide focusable');
      t.style.backgroundColor = SKY_COLOUR;
      var src = el('div', 'src', c.short);
      src.style.background = SKY_COLOUR;
      t.appendChild(src);
      var flag = el('div', 'flag hidden', 'LIVE');
      t.appendChild(flag);
      var name = el('div', 'name small', c.name);
      var sub = el('div', 'sub', '');
      var bar = el('div', 'bar');
      bar.appendChild(el('i'));
      t.appendChild(name);
      t.appendChild(sub);
      t.appendChild(bar);
      function fill(nn) {
        if (!nn || !nn.now) return;
        name.textContent = nn.now.title;
        sub.textContent = c.short + '  ·  ' + untilText(nn.now);
        bar.firstChild.style.width = Math.round(Guide.progress(nn.now) * 100) + '%';
        flag.classList.toggle('hidden', !isLiveEvent(nn.now));
        bgImage(t, nn.now.image);
      }
      function update(first) {
        Guide.nowNext('sky', c.sid, function (nn) {
          sportNow[c.key] = nn;
          fill(nn);
          if (t.classList.contains('focused')) t.heroRefresh();
          // Once everything has loaded, re-sort so live events come first (unless you're in this row).
          if (first && --pending === 0 && orderKey(sportOrder()) !== rendered) resortSport();
        });
      }
      fill(sportNow[c.key]);
      update(true);
      updaters.push(function () { update(false); });
      t.onselect = function () {
        if (!app.id) return toast('Add the NOW app in Settings first');
        openApp(app, 'Opening NOW — choose ' + c.name);
      };
      t.onfocusitem = t.heroRefresh = function () {
        var nn = sportNow[c.key] || {};
        hero({
          eyebrow: c.name + ' · on NOW', title: nn.now ? nn.now.title : c.name,
          line1: nn.now ? Guide.clock(nn.now.start) + ' – ' + Guide.clock(nn.now.stop) + (isLiveEvent(nn.now) ? '  ·  LIVE' : '') : 'Loading what’s on…',
          progress: nn.now ? Guide.progress(nn.now) : null,
          line2: nn.next ? 'Next at ' + Guide.clock(nn.next.start) + ': ' + nn.next.title : trim(nn.now && nn.now.desc, 160),
          hint: 'Press OK to open NOW',
          art: { image: nn.now && nn.now.image, color: SKY_COLOUR, label: c.name }
        });
      };
      row.appendChild(t);
    });
  }

  function resortSport() {
    var cur = homeNav.current();
    if (cur && cur.parentNode.id === 'row-sport') return;
    renderSport();
    homeNav.refresh();
  }

  // -- Tools

  function renderTools() {
    var tools = $('row-tools');
    tools.innerHTML = '';
    [
      ['Watch live TV', function () { watchChannel(lastTuner()); }],
      ['Add a show', function () { show('search'); }],
      ['Settings', function () { show('settings'); }],
      ['Exit', function () { Platform.exit(); }]
    ].forEach(function (b) {
      var btn = el('button', 'btn focusable', b[0]);
      btn.onselect = b[1];
      btn.onfocusitem = function () { previewChannel(lastTuner()); };
      tools.appendChild(btn);
    });
  }

  var renderTimer = null;
  function scheduleRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(function () { if (current === 'home') renderHome(); }, 400);
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
        // First BACK returns to the first tile, second sends the app to the background.
        if (homeNav.r !== 0 || homeNav.c !== 0) return homeNav.focus(0, 0);
        Platform.hideTvWindow();
        return Platform.hide();
      }
      homeNav.move(a);
    }
  };

  function openApp(app, message) {
    if (!app.appId) {
      toast(app.name + ' wasn’t found on this TV — add it in Settings › Add an installed app');
      return;
    }
    state.usage[app.id] = (state.usage[app.id] || 0) + 1;
    save();
    Platform.hideTvWindow();
    toast(message || 'Opening ' + app.name + '…');
    Platform.launchApp(app.appId, function (msg) {
      toast(app.name + ': ' + msg + ' — check it in Settings');
      showPreview();
    });
  }

  // ---------------------------------------------------------------- live satellite TV

  var tunedKey = null; // "major-minor" of what the tuner is on, so we don't retune needlessly
  var previewTimer = null;

  function heroTuner(ch) {
    var o = {
      eyebrow: 'Live TV · satellite', title: channelLabel(ch) + '  ' + ch.name,
      hint: 'Press OK to watch, or type a channel number', art: null
    };
    hero(o);
    $('preview-fallback').firstChild.textContent = ch.name;
    Platform.getNowNext(ch, function (nn) {
      if (nn.now) $('hero-line1').textContent = 'Now: ' + nn.now;
      if (nn.next) $('hero-line2').textContent = 'Next: ' + nn.next;
    });
  }

  function tuneTo(i, cb) {
    var ch = state.channels[i];
    if (!isTuner(ch)) return;
    var key = ch.major + '-' + (ch.minor || 0);
    if (key === tunedKey) { cb && cb(true); return; }
    tunedKey = key;
    Platform.tune(ch, {
      ok: function () { cb && cb(true); },
      noSignal: function () { toast('No signal on ' + ch.name + ' — check the satellite dish'); },
      program: function (title) {
        if (title && current === 'watch') $('banner-now').textContent = 'Now: ' + title;
      },
      fail: function (msg) { tunedKey = null; toast('Could not tune: ' + msg); cb && cb(false); }
    }, state.options.tvViewerAppId);
  }

  function showPreview() {
    var i = lastTuner();
    if (!state.options.livePreview || !Platform.canTune) {
      document.body.classList.toggle('no-preview', Platform.isTv);
    } else {
      var box = $('preview').getBoundingClientRect();
      Platform.showTvWindow({ x: Math.round(box.left), y: Math.round(box.top), w: Math.round(box.width), h: Math.round(box.height) });
      if (i !== -1) tuneTo(i);
    }
    if (i !== -1) $('preview-fallback').firstChild.textContent = state.channels[i].name;
  }

  // Focusing a satellite channel previews it after a short pause (so scrolling past doesn't retune).
  function previewChannel(i) {
    var ch = state.channels[i];
    if (!isTuner(ch)) return;
    heroTuner(ch);
    clearTimeout(previewTimer);
    if (!state.options.livePreview || !Platform.canTune) return;
    previewTimer = setTimeout(function () { tuneTo(i); }, 700);
  }

  function watchChannel(i) {
    if (i === -1 || !state.channels.length) { toast('No satellite channels yet — add some in Settings'); return; }
    var ch = state.channels[i];
    if (!isTuner(ch)) return openPlayerChannel(ch);
    state.lastChannel = i;
    save();
    if (!Platform.canTune && Platform.isTv) {
      // The TV won't let us tune: open its built-in viewer instead.
      tunedKey = null;
      tuneTo(i);
      return;
    }
    tuneTo(i, function (ok) { if (ok !== false && current !== 'watch') show('watch'); });
    if (current === 'watch') updateBanner();
  }

  var bannerTimer = null;
  function updateBanner() {
    var ch = state.channels[state.lastChannel];
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

  screens.watch = {
    enter: function () {
      Platform.showTvWindow({ x: 0, y: 0, w: 1920, h: 1080 });
      updateBanner();
    },
    key: function (a) {
      if (a === 'BACK') return show('home');
      if (a === 'CH_UP' || a === 'UP') return watchChannel(stepTuner(state.lastChannel, 1));
      if (a === 'CH_DOWN' || a === 'DOWN') return watchChannel(stepTuner(state.lastChannel, -1));
      updateBanner(); // any other key: show what's on
    }
  };

  // Typing a channel number on the remote jumps straight to it.
  var digitBuf = '';
  var digitTimer = null;
  function onDigit(d) {
    digitBuf = (digitBuf + d).slice(-4);
    var box = $('digits');
    box.textContent = digitBuf;
    box.classList.remove('hidden');
    clearTimeout(digitTimer);
    digitTimer = setTimeout(function () {
      box.classList.add('hidden');
      var num = parseInt(digitBuf, 10);
      digitBuf = '';
      var idx = -1;
      state.channels.forEach(function (c, i) { if (isTuner(c) && c.major === num && idx === -1) idx = i; });
      if (idx === -1 && num >= 1 && num <= state.channels.length && num < 100) idx = num - 1; // 1-9 = position in the row
      if (idx !== -1) return watchChannel(idx);
      // Not in the list yet: if the TV has scanned it, add it and watch.
      Platform.getTvChannels(function (all) {
        var found = all.filter(function (c) { return c.major === num; })[0];
        if (!found) return toast('Channel ' + num + ' isn’t in your list');
        state.channels.push({ name: found.name, major: found.major, minor: found.minor || 0 });
        toast(found.name + ' added to your channels');
        renderHome();
        watchChannel(state.channels.length - 1);
      });
    }, 1500);
  }

  // ---------------------------------------------------------------- add a show

  var searchNav = new Nav($('search'));
  var searchInput = $('search-input');

  function runSearch() {
    var q = searchInput.value.trim();
    if (!q) { searchInput.focus(); return; }
    var body = $('search-body');
    body.innerHTML = '';
    body.appendChild(el('div', 'label', 'Searching…'));
    Shows.search(q, function (results) {
      body.innerHTML = '';
      if (!results.length) body.appendChild(el('div', 'label', 'No shows found — check the spelling'));
      results.slice(0, 12).forEach(function (r) {
        var row = el('div', 'srow nav-row');
        var th = el('div', 'thumb');
        bgImage(th, r.image);
        row.appendChild(th);
        var label = el('div', 'label', r.name + (r.year ? ' (' + r.year + ')' : ''));
        label.appendChild(el('small', null, r.network || ''));
        row.appendChild(label);
        var have = state.shows.some(function (s) { return s.tvmazeId === r.id; });
        row.appendChild(chip(have ? '✓ Added' : 'Add', function () { if (!have) chooseAppFor(r); }, have ? 'on' : ''));
        body.appendChild(row);
      });
      searchNav.focus(1, 0);
    });
  }

  function chooseAppFor(r) {
    var guess = Shows.guessApp(r.network);
    var apps = state.apps.slice().sort(function (a, b) {
      return (b.id === guess ? 1 : 0) - (a.id === guess ? 1 : 0) || (a.hidden ? 1 : 0) - (b.hidden ? 1 : 0);
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
              save();
              Shows.refresh(s, function () { save(); scheduleRender(); });
              toast(r.name + ' added — it opens in ' + app.name);
              homeNav.r = 0; homeNav.c = 0;
              show('home');
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
      if (a === 'BACK') return show('home');
      if (a === 'ENTER') return searchNav.select();
      searchNav.move(a);
    }
  };
  searchInput.onselect = function () { searchInput.focus(); };
  $('search-go').onselect = runSearch;

  // ---------------------------------------------------------------- settings

  var settingsNav = new Nav($('settings'));

  function chip(text, fn, extra) {
    var b = el('button', 'chip focusable' + (extra ? ' ' + extra : ''), text);
    b.onselect = fn;
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
        var idx = state.apps.indexOf(appById(s.app));
        s.app = state.apps[(idx + 1) % state.apps.length].id;
        changed();
      }));
      row.appendChild(chip('▲', function () { changed(moveItem(state.shows, i, -1)); }));
      row.appendChild(chip('▼', function () { changed(moveItem(state.shows, i, 1)); }));
      row.appendChild(chip('Remove', function () { state.shows.splice(i, 1); changed(); }));
      body.appendChild(row);
    });
    var addShow = el('div', 'srow nav-row');
    addShow.appendChild(chip('+ Add a show', function () { show('search'); }));
    body.appendChild(addShow);

    section(body, 'Apps on your home screen');
    state.apps.forEach(function (app, i) {
      var row = el('div', 'srow nav-row');
      var sw = el('div', 'swatch'); sw.style.background = app.color;
      row.appendChild(sw);
      var label = el('div', 'label' + (app.hidden ? ' off' : ''), app.name);
      label.appendChild(el('small', null, app.appId ? 'ID ' + app.appId : 'Not found on this TV — use “Add an installed app”'));
      row.appendChild(label);
      row.appendChild(chip(app.hidden ? 'Hidden' : 'Shown', function () { app.hidden = !app.hidden; changed(); }, app.hidden ? '' : 'on'));
      row.appendChild(chip('Button: ' + (app.hotkey || 'none'), function () {
        var next = HOTKEYS[(HOTKEYS.indexOf(app.hotkey) + 1)] || null; // cycles red→green→yellow→blue→none
        if (next) state.apps.forEach(function (o) { if (o.hotkey === next) o.hotkey = null; });
        app.hotkey = next;
        changed();
      }));
      row.appendChild(chip('▲', function () { changed(moveItem(state.apps, i, -1)); }));
      row.appendChild(chip('▼', function () { changed(moveItem(state.apps, i, 1)); }));
      row.appendChild(chip('Remove', function () { state.apps.splice(i, 1); changed(); }));
      body.appendChild(row);
    });
    var addRow = el('div', 'srow nav-row');
    addRow.appendChild(chip('+ Add an installed app', openAppPicker));
    body.appendChild(addRow);

    section(body, 'Live channels');
    state.channels.forEach(function (ch, i) {
      var row = el('div', 'srow nav-row');
      var label;
      if (isTuner(ch)) {
        label = el('div', 'label', channelLabel(ch) + '   ' + ch.name);
        label.appendChild(el('small', null, 'Satellite'));
      } else {
        var app = appById(playerDef(ch).app);
        label = el('div', 'label', ch.name);
        label.appendChild(el('small', null, 'Online, via ' + (app ? app.name : 'player app')));
      }
      row.appendChild(label);
      row.appendChild(chip('▲', function () { changed(moveItem(state.channels, i, -1)); }));
      row.appendChild(chip('▼', function () { changed(moveItem(state.channels, i, 1)); }));
      row.appendChild(chip('Remove', function () {
        state.channels.splice(i, 1);
        if (state.lastChannel >= state.channels.length) state.lastChannel = 0;
        changed();
      }));
      body.appendChild(row);
    });

    var chRow = el('div', 'srow nav-row');
    chRow.appendChild(chip('Import channels from TV', openChannelPicker));
    chRow.appendChild(chip('Add online channels (RTÉ, Virgin Media)', openPlayerPicker));
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
      state.channels.push({ name: name.value.trim() || ('Channel ' + n), major: n, minor: 0 });
      changed();
      toast('Added channel ' + n);
    }));
    body.appendChild(manual);

    section(body, 'Sport row (Sky Sports on NOW)');
    SPORT.forEach(function (c) {
      var row = el('div', 'srow nav-row');
      var hidden = state.sportHidden.indexOf(c.key) !== -1;
      row.appendChild(el('div', 'label' + (hidden ? ' off' : ''), c.name));
      row.appendChild(chip(hidden ? 'Hidden' : 'Shown', function () {
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
    opts.appendChild(chip('Reset everything', function () {
      try { localStorage.removeItem(STORE_KEY); } catch (e) {}
      state = load();
      changed();
      toast('Back to the original setup');
    }));
    body.appendChild(opts);
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

  var pickerNav = new Nav($('picker'));
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
    if (!items.length) body.appendChild(el('div', 'label', 'Nothing found on this TV.'));
    items.forEach(function (it) {
      var row = el('div', 'srow nav-row');
      row.appendChild(el('div', 'label', it.label));
      row.appendChild(chip(it.chip, function () {
        if (it.select()) return;
        save();
        renderPicker();
        pickerNav.refresh();
      }, it.on ? 'on' : ''));
      body.appendChild(row);
    });
  }

  screens.picker = {
    enter: function () { pickerNav.refresh(); },
    key: function (a) {
      if (a === 'BACK') return show(picker.back || 'settings');
      if (a === 'ENTER') return pickerNav.select();
      pickerNav.move(a);
    }
  };

  // Toggle-style picker: each item is added or removed.
  function togglePicker(title, list, label, isOn, toggle) {
    openPicker({
      title: title, back: 'settings',
      items: function () {
        return list.map(function (x) {
          var on = isOn(x);
          return { label: label(x), chip: on ? '✓ Added' : 'Add', on: on, select: function () { toggle(x); } };
        });
      }
    });
  }

  function openAppPicker() {
    toast('Looking for apps…');
    Platform.getInstalledApps(function (list) {
      function find(a) { return state.apps.filter(function (x) { return x.appId === a.appId; })[0]; }
      togglePicker('Add an installed app', list, function (a) { return a.name; }, function (a) { return !!find(a); }, function (a) {
        var existing = find(a);
        if (existing) state.apps.splice(state.apps.indexOf(existing), 1);
        else state.apps.push({
          id: 'app-' + a.appId, name: a.name, appId: a.appId,
          color: PALETTE[state.apps.length % PALETTE.length], text: '#ffffff', hotkey: null
        });
      });
    });
  }

  function openChannelPicker() {
    Platform.getTvChannels(function (list) {
      if (!list.length && Platform.isTv) {
        toast('This TV didn’t share its channel list — use “Add by number” instead');
        return;
      }
      function idx(c) {
        for (var i = 0; i < state.channels.length; i++) {
          var s = state.channels[i];
          if (isTuner(s) && s.major === c.major && (s.minor || 0) === (c.minor || 0)) return i;
        }
        return -1;
      }
      togglePicker('Choose your satellite channels', list,
        function (c) { return channelLabel(c) + '   ' + c.name; },
        function (c) { return idx(c) !== -1; },
        function (c) {
          var i = idx(c);
          if (i !== -1) state.channels.splice(i, 1);
          else state.channels.push({ name: c.name, major: c.major, minor: c.minor || 0 });
          if (state.lastChannel >= state.channels.length) state.lastChannel = 0;
        });
    });
  }

  function openPlayerPicker() {
    var keys = Object.keys(PLAYER);
    function idx(k) {
      for (var i = 0; i < state.channels.length; i++) if (state.channels[i].guide === k) return i;
      return -1;
    }
    togglePicker('Online channels', keys,
      function (k) { var app = appById(PLAYER[k].app); return PLAYER[k].name + '   ·   ' + (app ? app.name : ''); },
      function (k) { return idx(k) !== -1; },
      function (k) {
        var i = idx(k);
        if (i !== -1) state.channels.splice(i, 1);
        else state.channels.push({ name: PLAYER[k].name, kind: 'player', guide: k });
      });
  }

  // ---------------------------------------------------------------- global bits

  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.add('hidden'); }, 3500);
  }

  function tickClock() {
    var now = new Date();
    var hh = now.getHours(), mm = now.getMinutes();
    $('clock').textContent = (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
    var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    $('date').textContent = days[now.getDay()] + ' ' + now.getDate() + ' ' + months[now.getMonth()];
  }

  // Every minute: move progress bars on, and pick up the next programme when one ends.
  function tickGuide() {
    if (current !== 'home' || document.hidden) return;
    updaters.forEach(function (u) { u(); });
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
      if (current === 'home' && (a === 'CH_UP' || a === 'CH_DOWN')) {
        return watchChannel(stepTuner(state.lastChannel, a === 'CH_UP' ? 1 : -1));
      }
    }
    if (typing && a.indexOf('DIGIT_') === 0) return;
    if (screens[current]) screens[current].key(a);
  });

  // Coming back from Netflix etc.: refresh everything and put the live preview back.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { Platform.hideTvWindow(); tunedKey = null; }
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
  setInterval(tickGuide, 60000);
  renderHome();
  homeNav.focus(0, 0);
  showPreview();
  // Find NOW, RTÉ Player etc. on this TV by name if their IDs aren't known yet.
  Platform.resolveApps(state.apps, function (changedIds) {
    if (changedIds) { save(); renderHome(); }
  });
})();
