/*
 * TV Hub — one home screen for streaming apps and live satellite channels.
 * Written in plain ES2015 so it runs on older Samsung TVs (Tizen 4/5, 2018-2019 models).
 */
(function () {
  'use strict';

  var STORE_KEY = 'tvhub.v1';
  var HOTKEYS = ['red', 'green', 'yellow', 'blue'];
  var PALETTE = ['#e50914', '#113ccf', '#00a8e1', '#ff0000', '#8e24aa', '#00897b', '#f4511e', '#3949ab', '#6d4c41'];

  function $(id) { return document.getElementById(id); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // ---------------------------------------------------------------- state

  var state = load();

  function load() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) {}
    var d = clone(TVHUB_DEFAULTS);
    if (!saved) {
      return { apps: d.apps, channels: d.channels, options: d.options, usage: {}, lastChannel: 0 };
    }
    var opts = d.options;
    for (var k in saved.options) opts[k] = saved.options[k];
    saved.options = opts;
    saved.usage = saved.usage || {};
    return saved;
  }

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
  }

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

  function channelLabel(c) { return c.minor ? c.major + '-' + c.minor : String(c.major); }

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
      return row.querySelector('.focusable');
    });
  };
  Nav.prototype.items = function (row) { return row ? row.querySelectorAll('.focusable') : []; };
  Nav.prototype.current = function () {
    var rows = this.rows();
    var row = rows[this.r];
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

  // Keeps the focused item on screen: horizontal rows slide, vertical panels scroll.
  function scrollIntoView(item) {
    var row = item.parentNode;
    if (row.classList.contains('tiles')) {
      var left = item.offsetLeft;
      var visible = 1728; // 1920 minus side padding
      var shift = Math.max(0, left + item.offsetWidth - visible + 60);
      row.style.transform = 'translateX(' + (-shift) + 'px)';
    }
    var scroller = item.closest ? item.closest('.scroll') : null;
    if (scroller) {
      var top = (item.getBoundingClientRect().top - scroller.getBoundingClientRect().top) / getScale() + scroller.scrollTop;
      if (top < scroller.scrollTop + 40) scroller.scrollTop = top - 40;
      else if (top + item.offsetHeight > scroller.scrollTop + scroller.clientHeight - 40) {
        scroller.scrollTop = top + item.offsetHeight - scroller.clientHeight + 40;
      }
    }
  }

  // ---------------------------------------------------------------- screens

  var screens = {};
  var current = 'home';

  function show(name) {
    var prev = current;
    current = name;
    ['home', 'watch', 'settings', 'picker'].forEach(function (s) {
      var on = s === name || (s === 'home' && (name === 'settings' || name === 'picker'));
      $(s).classList.toggle('active', on);
    });
    if (screens[name] && screens[name].enter) screens[name].enter(prev);
  }

  // ---------------------------------------------------------------- home

  var homeNav = new Nav($('home'));

  function renderHome() {
    var apps = visibleApps();
    var rowApps = $('row-apps');
    rowApps.innerHTML = '';
    apps.forEach(function (app) {
      var t = el('div', 'tile focusable');
      t.style.background = app.color;
      t.style.color = app.text || '#fff';
      t.appendChild(el('div', 'name', app.name));
      if (app.hotkey) {
        var k = el('div', 'key dot ' + app.hotkey);
        t.appendChild(k);
      }
      t.onselect = function () { openApp(app); };
      rowApps.appendChild(t);
    });

    var rowCh = $('row-channels');
    rowCh.innerHTML = '';
    state.channels.forEach(function (ch, i) {
      var t = el('div', 'tile channel focusable');
      t.appendChild(el('div', 'num', channelLabel(ch)));
      if (i === state.lastChannel) t.appendChild(el('div', 'live', 'LAST'));
      t.appendChild(el('div', 'name', ch.name));
      var sub = el('div', 'sub', '');
      t.appendChild(sub);
      t.onselect = function () { watchChannel(i); };
      t.onfocusitem = function () { previewChannel(i); };
      Platform.getNowNext(ch, function (nn) { if (nn.now) sub.textContent = 'Now: ' + nn.now; });
      rowCh.appendChild(t);
    });

    var tools = $('row-tools');
    tools.innerHTML = '';
    [
      ['Watch live TV', function () { watchChannel(state.lastChannel); }],
      ['Settings', function () { show('settings'); }],
      ['Exit', function () { Platform.exit(); }]
    ].forEach(function (b) {
      var btn = el('button', 'btn focusable', b[0]);
      btn.onselect = b[1];
      tools.appendChild(btn);
    });

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
    var s2 = el('span', null, '0–9  jump to channel');
    hk.appendChild(s2);

    homeNav.refresh();
  }

  screens.home = {
    enter: function (prev) {
      if (prev === 'settings' || prev === 'picker') renderHome();
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

  function openApp(app) {
    state.usage[app.id] = (state.usage[app.id] || 0) + 1;
    save();
    Platform.hideTvWindow();
    toast('Opening ' + app.name + '…');
    Platform.launchApp(app.appId, function (msg) {
      toast(app.name + ': ' + msg + ' — check its ID in Settings');
      showPreview();
    });
  }

  // ---------------------------------------------------------------- live TV

  var tunedKey = null; // "major-minor" of what the tuner is on, so we don't retune needlessly
  var previewTimer = null;

  function setHeroInfo(ch) {
    $('hero-channel').textContent = channelLabel(ch) + '  ' + ch.name;
    $('hero-now').textContent = '';
    $('hero-next').textContent = '';
    $('preview-fallback').firstChild.textContent = ch.name;
    Platform.getNowNext(ch, function (nn) {
      if (nn.now) $('hero-now').textContent = 'Now: ' + nn.now;
      if (nn.next) $('hero-next').textContent = 'Next: ' + nn.next;
    });
  }

  function tuneTo(i, cb) {
    var ch = state.channels[i];
    if (!ch) return;
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
    if (!state.options.livePreview || !Platform.canTune) {
      document.body.classList.toggle('no-preview', Platform.isTv);
      if (state.channels[state.lastChannel]) setHeroInfo(state.channels[state.lastChannel]);
      return;
    }
    var box = $('preview').getBoundingClientRect();
    Platform.showTvWindow({ x: Math.round(box.left), y: Math.round(box.top), w: Math.round(box.width), h: Math.round(box.height) });
    var ch = state.channels[state.lastChannel];
    if (ch) { setHeroInfo(ch); tuneTo(state.lastChannel); }
  }

  // Focusing a channel tile previews it after a short pause (so scrolling past doesn't retune).
  function previewChannel(i) {
    var ch = state.channels[i];
    if (!ch) return;
    setHeroInfo(ch);
    clearTimeout(previewTimer);
    if (!state.options.livePreview || !Platform.canTune) return;
    previewTimer = setTimeout(function () { tuneTo(i); }, 700);
  }

  function watchChannel(i) {
    if (!state.channels.length) { toast('No channels yet — add some in Settings'); return; }
    i = ((i % state.channels.length) + state.channels.length) % state.channels.length;
    state.lastChannel = i;
    save();
    if (!Platform.canTune && Platform.isTv) {
      // The TV won't let us tune: open its built-in viewer on this channel instead.
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
      if (a === 'CH_UP' || a === 'UP') return watchChannel(state.lastChannel + 1);
      if (a === 'CH_DOWN' || a === 'DOWN') return watchChannel(state.lastChannel - 1);
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
      state.channels.forEach(function (c, i) { if (c.major === num && idx === -1) idx = i; });
      if (idx === -1 && num >= 1 && num <= state.channels.length && num < 100) idx = num - 1; // 1-9 = favourite slot
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

  function renderSettings() {
    var body = $('settings-body');
    body.innerHTML = '';

    body.appendChild(el('div', 'section-title', 'Apps on your home screen'));
    state.apps.forEach(function (app, i) {
      var row = el('div', 'srow nav-row');
      var sw = el('div', 'swatch'); sw.style.background = app.color;
      row.appendChild(sw);
      var label = el('div', 'label' + (app.hidden ? ' off' : ''), app.name);
      label.appendChild(el('small', null, 'ID ' + app.appId));
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

    body.appendChild(el('div', 'section-title', 'Live TV channels'));
    state.channels.forEach(function (ch, i) {
      var row = el('div', 'srow nav-row');
      var label = el('div', 'label', channelLabel(ch) + '   ' + ch.name);
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

    body.appendChild(el('div', 'section-title', 'Options'));
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

  function openPicker(title, items, isOn, toggle) {
    $('picker-title').textContent = title;
    var body = $('picker-body');
    function render() {
      body.innerHTML = '';
      if (!items.length) {
        body.appendChild(el('div', 'label', 'Nothing found on this TV.'));
        return;
      }
      items.forEach(function (it) {
        var row = el('div', 'srow nav-row');
        row.appendChild(el('div', 'label', it.label));
        var on = isOn(it);
        row.appendChild(chip(on ? '✓ Added' : 'Add', function () { toggle(it); save(); render(); pickerNav.refresh(); }, on ? 'on' : ''));
        body.appendChild(row);
      });
    }
    render();
    pickerNav.r = 0; pickerNav.c = 0;
    show('picker');
  }

  screens.picker = {
    enter: function () { pickerNav.refresh(); },
    key: function (a) {
      if (a === 'BACK') return show('settings');
      if (a === 'ENTER') return pickerNav.select();
      pickerNav.move(a);
    }
  };

  function openAppPicker() {
    toast('Looking for apps…');
    Platform.getInstalledApps(function (list) {
      var items = list.map(function (a) { return { label: a.name, app: a }; });
      function find(it) { return state.apps.filter(function (x) { return x.appId === it.app.appId; })[0]; }
      openPicker('Add an installed app', items, function (it) { return !!find(it); }, function (it) {
        var existing = find(it);
        if (existing) state.apps.splice(state.apps.indexOf(existing), 1);
        else state.apps.push({
          id: 'app-' + it.app.appId, name: it.app.name, appId: it.app.appId,
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
      var items = list.map(function (c) { return { label: channelLabel(c) + '   ' + c.name, ch: c }; });
      function idx(it) {
        for (var i = 0; i < state.channels.length; i++) {
          var c = state.channels[i];
          if (c.major === it.ch.major && (c.minor || 0) === (it.ch.minor || 0)) return i;
        }
        return -1;
      }
      openPicker('Choose your channels', items, function (it) { return idx(it) !== -1; }, function (it) {
        var i = idx(it);
        if (i !== -1) state.channels.splice(i, 1);
        else state.channels.push({ name: it.ch.name, major: it.ch.major, minor: it.ch.minor || 0 });
        if (state.lastChannel >= state.channels.length) state.lastChannel = 0;
      });
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
        return watchChannel(state.lastChannel + (a === 'CH_UP' ? 1 : -1));
      }
    }
    if (typing && a.indexOf('DIGIT_') === 0) return;
    if (screens[current]) screens[current].key(a);
  });

  // Coming back from Netflix etc.: put the live preview back.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { Platform.hideTvWindow(); tunedKey = null; }
    else if (current === 'home') showPreview();
    else if (current === 'watch') screens.watch.enter();
  });

  window.addEventListener('resize', fitStage);

  // ---------------------------------------------------------------- start

  if (!Platform.isTv) {
    document.body.classList.add('demo');
    $('demo-badge').classList.remove('hidden');
  }
  Platform.registerKeys();
  fitStage();
  tickClock();
  setInterval(tickClock, 15000);
  renderHome();
  homeNav.focus(0, 0);
  showPreview();
})();
