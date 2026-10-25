// Xbox Remote Play session: starts a home-streaming session on the console,
// negotiates WebRTC, and relays controller input over the 'input' data channel.
// The wire formats follow the reverse-engineered protocol used by open-source
// clients (e.g. Greenlight); every stage logs so failures can be read off the TV.
var XboxStream = (function () {
  'use strict';

  var http = XboxAuth.http;

  // Gamepad API standard-mapping index -> Xbox button bit.
  var BUTTON_BITS = [
    [0, 16], [1, 32], [2, 64], [3, 128],          // A B X Y
    [4, 4096], [5, 8192],                         // LB RB
    [8, 8], [9, 4],                               // View Menu
    [10, 16384], [11, 32768],                     // stick clicks
    [12, 256], [13, 512], [14, 1024], [15, 2048], // d-pad up down left right
    [16, 2]                                       // Xbox (Nexus) button
  ];
  var REPORT_METADATA = 1;
  var REPORT_GAMEPAD = 2;
  var REPORT_CLIENT_METADATA = 8;
  var CONTROL_ACCESS_KEY = '4BDB3609-C1F1-4195-9B37-FEFF45DA8B8E';

  function uuid() {
    var b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return (x + 0x100).toString(16).slice(1); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  function wait(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

  // ui: { log(text, cls), video, audio, onStats(text) }
  // options: { inputMaxVersion } - highest controller protocol version to offer the console.
  function Stream(session, serverId, ui, options) {
    this.options = options || {};
    this.session = session;
    this.serverId = serverId;
    this.ui = ui;
    this.sessionUrl = null;
    this.pc = null;
    this.channels = {};
    this.timers = [];
    this.stopped = false;
    this.inputSeq = 0;
    this.inputReady = false;
    // Diagnostics for the controller path, shown in the stats line.
    this.inputSent = 0;
    this.inputReceived = 0;
    this.lastMask = 0;
  }

  Stream.prototype.headers = function () {
    return {
      'Authorization': 'Bearer ' + this.session.gsToken,
      'x-gssv-client': 'XboxComBrowser'
    };
  };

  Stream.prototype.api = function (step, method, path, payload) {
    var h = this.headers();
    var options = { method: method, headers: h };
    if (payload !== undefined) {
      h['Content-Type'] = 'application/json';
      options.body = JSON.stringify(payload);
    }
    return http.request(step, this.sessionUrl + path, options).then(function (r) {
      if (!r.ok) {
        var err = new Error(step + ' failed: HTTP ' + r.status + (r.text ? ' — ' + r.text.slice(0, 300) : ''));
        throw err;
      }
      return r;
    });
  };

  Stream.prototype.start = function () {
    var self = this;
    return this.startSession()
      .then(function () { return self.waitForProvisioned(); })
      .then(function () { return self.negotiate(); })
      .then(function () {
        self.every(30000, function () {
          self.api('Keepalive', 'POST', '/keepalive', {})
            .then(function () { self.ui.log(self.elapsed() + 'Keepalive ok'); })
            .catch(function (e) { self.ui.log(self.elapsed() + e.message, 'warn'); });
        });
        self.every(2000, function () { self.reportStats(); });
      });
  };

  Stream.prototype.every = function (ms, fn) {
    this.timers.push(setInterval(fn, ms));
  };

  Stream.prototype.startSession = function () {
    var self = this;
    this.ui.log('Starting Remote Play session…');
    return http.postJson('Start session', this.session.baseUri + '/v5/sessions/home/play', {
      titleId: '',
      systemUpdateGroup: '',
      clientSessionId: '',
      settings: {
        nanoVersion: 'V3;WebrtcTransport.dll',
        enableTextToSpeech: false,
        highContrast: 0,
        locale: navigator.language || 'en-GB',
        useIceConnection: false,
        timezoneOffsetMinutes: -new Date().getTimezoneOffset(),
        sdkType: 'web',
        osName: 'windows'
      },
      serverId: this.serverId,
      fallbackRegionNames: []
    }, this.headers()).then(function (j) {
      self.sessionUrl = self.session.baseUri + '/' + j.sessionPath.replace(/^\//, '');
      self.ui.log('Session created (' + j.state + ')', 'ok');
    });
  };

  Stream.prototype.waitForProvisioned = function () {
    var self = this;
    var deadline = Date.now() + 120000;
    var last = null;
    function poll() {
      if (self.stopped) throw new Error('Stopped');
      if (Date.now() > deadline) throw new Error('Console did not become ready within 2 minutes (last state: ' + last + ')');
      return self.api('Session state', 'GET', '/state').then(function (r) {
        var state = r.json && r.json.state;
        if (state !== last) {
          self.ui.log('Session state: ' + state + (state === 'Provisioning' ? ' (waking the console)' : ''));
          last = state;
        }
        if (state === 'Provisioned') return null;
        if (state === 'Failed') {
          var d = (r.json && r.json.errorDetails) || {};
          throw new Error('Session failed: ' + (d.code || '') + ' ' + (d.message || JSON.stringify(r.json)));
        }
        if (state === 'ReadyToConnect') {
          throw new Error('Console asked for an extra sign-in step (ReadyToConnect), which this version does not handle yet.');
        }
        return wait(1000).then(poll);
      });
    }
    return poll();
  };

  Stream.prototype.negotiate = function () {
    var self = this;
    // Tizen 5.5's Chromium predates unified-plan as the default, so ask for it explicitly.
    var pc = this.pc = new RTCPeerConnection({ sdpSemantics: 'unified-plan' });
    var localCandidates = [];
    var gathered = new Promise(function (resolve) {
      pc.onicecandidate = function (ev) {
        if (!ev.candidate) { resolve(); return; }
        localCandidates.push({
          candidate: ev.candidate.candidate,
          sdpMid: ev.candidate.sdpMid,
          sdpMLineIndex: ev.candidate.sdpMLineIndex
        });
      };
    });

    pc.oniceconnectionstatechange = function () {
      var state = pc.iceConnectionState;
      var bad = state === 'failed' || state === 'disconnected' || state === 'closed';
      self.ui.log(self.elapsed() + 'Connection: ' + state, bad ? 'fail' : '');
      if (bad && !self.stopped) self.ui.problem();
    };
    pc.ontrack = function (ev) {
      var el = ev.track.kind === 'video' ? self.ui.video : self.ui.audio;
      el.srcObject = (ev.streams && ev.streams[0]) || new MediaStream([ev.track]);
      var played = el.play();
      if (played && played.catch) played.catch(function (e) { self.ui.log(ev.track.kind + ' play(): ' + e.message, 'warn'); });
      self.ui.log('Receiving ' + ev.track.kind, 'ok');
    };

    this.openChannels();
    var offerOptions = {};
    try {
      pc.addTransceiver('audio', { direction: 'sendrecv' });
      pc.addTransceiver('video', { direction: 'recvonly' });
    } catch (e) {
      // Older engines without transceivers: request the same media through offer options.
      this.ui.log('Using legacy media setup (' + e.name + ')', 'warn');
      offerOptions = { offerToReceiveAudio: true, offerToReceiveVideo: true };
    }

    return pc.createOffer(offerOptions)
      .then(function (offer) { return pc.setLocalDescription(offer).then(function () { return offer; }); })
      .then(function (offer) {
        self.ui.log('Sending connection offer…');
        return self.api('Send offer', 'POST', '/sdp', {
          messageType: 'offer',
          sdp: offer.sdp,
          configuration: {
            chatConfiguration: {
              bytesPerSample: 2,
              expectedClipDurationMs: 20,
              format: { codec: 'opus', container: 'webm' },
              numChannels: 1,
              sampleFrequencyHz: 24000
            },
            chat: { minVersion: 1, maxVersion: 1 },
            control: { minVersion: 1, maxVersion: 3 },
            input: { minVersion: 1, maxVersion: self.options.inputMaxVersion || 8 },
            message: { minVersion: 1, maxVersion: 1 }
          }
        });
      })
      .then(function () { return self.pollExchange('Connection answer', '/sdp'); })
      .then(function (answer) {
        if (answer.status && answer.status !== 'success') throw new Error('Console rejected the offer: ' + JSON.stringify(answer).slice(0, 300));
        self.ui.log('Answer received', 'ok');
        var extra = {};
        Object.keys(answer).forEach(function (k) { if (k !== 'sdp') extra[k] = answer[k]; });
        self.ui.log('Answer details: ' + JSON.stringify(extra).slice(0, 250));
        return pc.setRemoteDescription({ type: 'answer', sdp: answer.sdp });
      })
      .then(function () {
        return Promise.race([gathered, wait(5000)]);
      })
      .then(function () {
        self.ui.log('Sending ' + localCandidates.length + ' network candidates…');
        return self.api('Send candidates', 'POST', '/ice', { messageType: 'iceCandidate', candidate: localCandidates });
      })
      .then(function () { return self.pollExchange('Console candidates', '/ice'); })
      .then(function (remote) {
        var added = 0;
        (remote || []).forEach(function (c) {
          var text = String(c.candidate || '');
          if (text.indexOf('end-of-candidates') !== -1) return;
          pc.addIceCandidate({
            candidate: text.replace(/^a=/, ''),
            sdpMid: c.sdpMid,
            sdpMLineIndex: parseInt(c.sdpMLineIndex, 10)
          }).catch(function (e) { self.ui.log('Candidate rejected: ' + e.message, 'warn'); });
          added++;
        });
        self.ui.log('Added ' + added + ' console candidates', 'ok');
      });
  };

  // GETs an exchange endpoint until the console has answered; returns the parsed exchangeResponse.
  Stream.prototype.pollExchange = function (step, path) {
    var self = this;
    var deadline = Date.now() + 30000;
    function poll() {
      if (self.stopped) throw new Error('Stopped');
      if (Date.now() > deadline) throw new Error(step + ': no answer from the console within 30s');
      return self.api(step, 'GET', path).then(function (r) {
        if (r.status === 204 || !r.json || !r.json.exchangeResponse) return wait(1000).then(poll);
        // errorDetails is always present; it only signals a failure when it has content.
        var d = r.json.errorDetails;
        if (d && (d.code || d.message)) throw new Error(step + ': ' + JSON.stringify(d).slice(0, 300));
        return JSON.parse(r.json.exchangeResponse);
      });
    }
    return poll();
  };

  Stream.prototype.openChannels = function () {
    var self = this;
    var pc = this.pc;
    var input = this.channels.input = pc.createDataChannel('input', { ordered: true, protocol: '1.0' });
    var control = this.channels.control = pc.createDataChannel('control', { protocol: 'controlV1' });
    var message = this.channels.message = pc.createDataChannel('message', { protocol: 'messageV1' });
    this.channels.chat = pc.createDataChannel('chat', { protocol: 'chatV1' });
    input.binaryType = 'arraybuffer';

    // Any channel closing mid-stream means the console hung up; record when, and surface the log.
    [['input', input], ['control', control], ['message', message], ['chat', this.channels.chat]].forEach(function (pair) {
      pair[1].onclose = function () {
        if (self.stopped) return;
        if (pair[0] === 'chat') { self.ui.log('Voice chat channel closed (expected, no microphone)'); return; }
        self.ui.log(self.elapsed() + pair[0] + ' channel closed by console (input packets sent: ' + self.inputSent +
          ', last buttons 0x' + self.lastMask.toString(16) + ')', 'fail');
        self.ui.problem();
      };
    });

    input.onopen = function () {
      self.openedAt = Date.now();
      self.ui.log('Input channel open', 'ok');
    };
    input.onmessage = function (ev) {
      self.inputReceived++;
      if (self.inputReceived <= 3) {
        var bytes = new Uint8Array(ev.data);
        var hex = Array.prototype.slice.call(bytes, 0, 24).map(function (b) { return (b + 0x100).toString(16).slice(1); }).join(' ');
        self.ui.log('Input from console: type ' + new DataView(ev.data).getUint16(0, true) + ', ' + bytes.length + ' bytes: ' + hex);
      }
    };

    control.onopen = function () {
      self.ui.log('Control channel open', 'ok');
    };
    var controlLogged = 0;
    control.onmessage = function (ev) {
      if (++controlLogged <= 5) self.ui.log('Control from console: ' + String(ev.data).slice(0, 150));
    };

    this.messagesLogged = 0;
    message.onopen = function () {
      self.ui.log('Message channel open', 'ok');
      message.send(JSON.stringify({ type: 'Handshake', version: 'messageV1', id: uuid(), cv: '' }));
    };
    message.onmessage = function (ev) {
      var msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.type !== 'HandshakeAck' && ++self.messagesLogged <= 10) {
        self.ui.log('Message from console: ' + msg.type + (msg.target ? ' ' + msg.target : ''));
      }
      if (msg.type === 'HandshakeAck') {
        self.ui.log('Console handshake complete', 'ok');
        // The console only registers a client once the handshake is done, so the controller
        // authorization and input stream must start here, not when their channels open.
        self.startControl();
        self.startInput();
        self.sendConfiguration();
        self.requestKeyframe();
      } else if (msg.type === 'TransactionStart') {
        // The content often explains why (e.g. the reason for a server-initiated disconnect).
        self.ui.log(self.elapsed() + 'Console request ' + (msg.target || '') + ': ' + String(msg.content || '').slice(0, 300), 'warn');
        // Answer console UI requests (e.g. keyboard prompts) so they don't block the stream.
        message.send(JSON.stringify({ type: 'TransactionComplete', content: '', id: msg.id, cv: msg.cv || '' }));
      }
    };
  };

  // "[12.3s] " since the input channel opened, for timing when the console hangs up.
  Stream.prototype.elapsed = function () {
    return this.openedAt ? '[' + ((Date.now() - this.openedAt) / 1000).toFixed(1) + 's] ' : '';
  };

  Stream.prototype.sendConfiguration = function () {
    var channel = this.channels.message;
    function send(target, content) {
      channel.send(JSON.stringify({ type: 'Message', content: JSON.stringify(content), id: uuid(), target: target, cv: '' }));
    }
    send('/streaming/systemUi/configuration', { version: [0, 1, 0], systemUis: [] });
    send('/streaming/properties/clientappinstallidchanged', { clientAppInstallId: uuid() });
    send('/streaming/characteristics/orientationchanged', { orientation: 0 });
    send('/streaming/characteristics/touchinputenabledchanged', { touchInputEnabled: false });
    send('/streaming/characteristics/clientdevicecapabilities', {});
    send('/streaming/characteristics/dimensionschanged', {
      horizontal: 1920, vertical: 1080, preferredWidth: 1920, preferredHeight: 1080,
      safeAreaLeft: 0, safeAreaTop: 0, safeAreaRight: 1920, safeAreaBottom: 1080,
      supportsCustomResolution: true
    });
  };

  Stream.prototype.startControl = function () {
    var control = this.channels.control;
    control.send(JSON.stringify({ message: 'authorizationRequest', accessKey: CONTROL_ACCESS_KEY }));
    control.send(JSON.stringify({ message: 'gamepadChanged', gamepadIndex: 0, wasAdded: true }));
    this.ui.log(this.elapsed() + 'Controller registered with the console', 'ok');
  };

  Stream.prototype.startInput = function () {
    this.sendInput(this.clientMetadataPacket());
    this.inputReady = true;
    this.watchVideoFrames();
  };

  // Per-frame render reports, as the reference client sends; only possible where the
  // engine has requestVideoFrameCallback (newer than Tizen 5.5's, so usually skipped).
  Stream.prototype.watchVideoFrames = function () {
    var self = this;
    var video = this.ui.video;
    this.frameMetadata = [];
    if (!video.requestVideoFrameCallback) {
      this.ui.log('Frame reports: not supported on this TV');
      return;
    }
    function onFrame(now, info) {
      if (self.stopped) return;
      if (self.frameMetadata.length < 30) {
        self.frameMetadata.push([info.rtpTimestamp || 0, info.receiveTime || 0, info.receiveTime || 0,
          info.expectedDisplayTime || 0, info.expectedDisplayTime || 0]);
      }
      video.requestVideoFrameCallback(onFrame);
    }
    video.requestVideoFrameCallback(onFrame);
    this.ui.log('Frame reports: on');
  };

  Stream.prototype.requestKeyframe = function () {
    var control = this.channels.control;
    if (control && control.readyState === 'open') {
      control.send(JSON.stringify({ message: 'videoKeyframeRequested', ifrRequested: true }));
    }
  };

  // Packet header: uint16 report type, uint32 sequence, float64 timestamp (little-endian).
  Stream.prototype.packet = function (reportType, bodySize, sequence) {
    var view = new DataView(new ArrayBuffer(14 + bodySize));
    view.setUint16(0, reportType, true);
    view.setUint32(2, sequence === undefined ? ++this.inputSeq : sequence, true);
    view.setFloat64(6, performance.now(), true);
    return view;
  };

  Stream.prototype.clientMetadataPacket = function () {
    var view = this.packet(REPORT_CLIENT_METADATA, 1, 0);
    view.setUint8(14, 2); // max touch points
    return view.buffer;
  };

  Stream.prototype.sendInput = function (buffer) {
    var input = this.channels.input;
    if (input && input.readyState === 'open') input.send(buffer);
  };

  Stream.prototype.sendGamepad = function (pad) {
    if (!this.inputReady) return;
    var mask = 0;
    BUTTON_BITS.forEach(function (pair) {
      var b = pad.buttons[pair[0]];
      if (b && b.pressed) mask |= pair[1];
    });
    // Truncate toward zero, as the reference client's Int16/Uint16 conversion does.
    function axis(v) { return Math.trunc(Math.max(-32767, Math.min(32767, (v || 0) * 32767))); }
    function trigger(b) { return b ? Math.trunc(Math.max(0, Math.min(65535, b.value * 65535))) : 0; }

    var frames = this.frameMetadata || [];
    var metaSize = frames.length ? 1 + 28 * frames.length : 0;
    var view = this.packet(REPORT_GAMEPAD | (frames.length ? REPORT_METADATA : 0), metaSize + 1 + 23);
    var o = 14;
    if (frames.length) {
      var nowMs = performance.now();
      view.setUint8(o, frames.length); o += 1;
      frames.forEach(function (f) {
        f.concat([nowMs, nowMs]).forEach(function (v) { view.setUint32(o, Math.round(v) >>> 0, true); o += 4; });
      });
      this.frameMetadata = [];
    }
    view.setUint8(o, 1); o += 1;              // frame count
    view.setUint8(o, 0); o += 1;              // gamepad index
    view.setUint16(o, mask, true); o += 2;
    view.setInt16(o, axis(pad.axes[0]), true); o += 2;
    view.setInt16(o, axis(-pad.axes[1]), true); o += 2;  // Xbox expects up = positive
    view.setInt16(o, axis(pad.axes[2]), true); o += 2;
    view.setInt16(o, axis(-pad.axes[3]), true); o += 2;
    view.setUint16(o, trigger(pad.buttons[6]), true); o += 2;
    view.setUint16(o, trigger(pad.buttons[7]), true); o += 2;
    view.setUint32(o, 0, true); o += 4;       // physical physicality
    view.setUint32(o, 0, true);               // virtual physicality
    this.sendInput(view.buffer);
    this.inputSent++;
    if (mask && !this.lastMask && !this.firstPressLogged) {
      this.firstPressLogged = true;
      this.ui.log(this.elapsed() + 'First button press sent (0x' + mask.toString(16) + ')');
    }
    this.lastMask = mask;
  };

  Stream.prototype.reportStats = function () {
    var self = this;
    if (!this.pc || !this.pc.getStats) return;
    this.pc.getStats().then(function (report) {
      report.forEach(function (s) {
        if (s.type !== 'inbound-rtp' || (s.kind || s.mediaType) !== 'video') return;
        var now = s.timestamp;
        var fps = self.lastStats ? Math.round((s.framesDecoded - self.lastStats.frames) * 1000 / (now - self.lastStats.time)) : 0;
        var kbps = self.lastStats ? Math.round((s.bytesReceived - self.lastStats.bytes) * 8 / (now - self.lastStats.time)) : 0;
        if (self.lastStats && fps === 0 && self.inputReady) self.requestKeyframe();
        self.lastStats = { frames: s.framesDecoded, bytes: s.bytesReceived, time: now };
        var input = self.channels.input;
        self.ui.onStats((s.frameWidth ? s.frameWidth + 'x' + s.frameHeight + '  ' : '') +
          fps + ' fps  ' + kbps + ' kbps  lost ' + (s.packetsLost || 0) +
          ' | input ' + (input ? input.readyState : '-') + ' sent ' + self.inputSent +
          ' recv ' + self.inputReceived + ' buttons 0x' + self.lastMask.toString(16));
      });
    }).catch(function () { /* stats are best-effort */ });
  };

  Stream.prototype.stop = function () {
    this.stopped = true;
    this.timers.forEach(clearInterval);
    if (this.pc) this.pc.close();
    if (this.sessionUrl) this.api('End session', 'DELETE', '').catch(function () {});
  };

  return { Stream: Stream };
})();
