/*
 * Small QR code generator for short links: byte mode, error correction level M,
 * versions 1-6 (up to 106 characters). Follows ISO/IEC 18004.
 */
var QR = (function () {
  'use strict';

  // Level M, per version: [data codewords per block, number of blocks, error correction codewords per block]
  var BLOCKS = [null, [16, 1, 10], [28, 1, 16], [44, 1, 26], [32, 2, 18], [43, 2, 24], [27, 4, 16]];
  var ALIGNMENT = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34]];
  var MASK = 0;  // any mask gives a valid code; mask 0 flips modules where (x + y) is even

  // Arithmetic in GF(256) with the QR polynomial x^8 + x^4 + x^3 + x^2 + 1.
  var EXP = [], LOG = [];
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();

  function mul(a, b) {
    return a && b ? EXP[LOG[a] + LOG[b]] : 0;
  }

  // Coefficients of (x + a^0)(x + a^1)...(x + a^(n-1)), highest power first.
  function generator(n) {
    var g = [1];
    for (var i = 0; i < n; i++) {
      var next = [];
      for (var j = 0; j <= g.length; j++) next[j] = 0;
      for (j = 0; j < g.length; j++) {
        next[j] ^= g[j];
        next[j + 1] ^= mul(g[j], EXP[i]);
      }
      g = next;
    }
    return g;
  }

  function errorCorrection(data, n) {
    var gen = generator(n);
    var rem = [];
    for (var i = 0; i < n; i++) rem[i] = 0;
    for (i = 0; i < data.length; i++) {
      var factor = data[i] ^ rem.shift();
      rem.push(0);
      for (var j = 0; j < n; j++) rem[j] ^= mul(gen[j + 1], factor);
    }
    return rem;
  }

  function utf8(text) {
    var s = unescape(encodeURIComponent(text));
    var out = [];
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
  }

  function codewords(bytes, version) {
    var b = BLOCKS[version];
    var capacity = b[0] * b[1];
    var bits = [];
    function put(value, length) {
      for (var i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
    }
    put(4, 4);              // byte mode
    put(bytes.length, 8);   // character count (8 bits for versions 1-9)
    for (var i = 0; i < bytes.length; i++) put(bytes[i], 8);
    put(0, Math.min(4, capacity * 8 - bits.length));
    while (bits.length % 8) bits.push(0);
    var data = [];
    for (i = 0; i < bits.length; i += 8) {
      var byte = 0;
      for (var j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
      data.push(byte);
    }
    for (i = 0; data.length < capacity; i++) data.push(i % 2 ? 0x11 : 0xec);

    // Split into blocks, add error correction, then interleave.
    var blocks = [], ecc = [];
    for (i = 0; i < b[1]; i++) {
      blocks.push(data.slice(i * b[0], (i + 1) * b[0]));
      ecc.push(errorCorrection(blocks[i], b[2]));
    }
    var out = [];
    for (i = 0; i < b[0]; i++) for (j = 0; j < b[1]; j++) out.push(blocks[j][i]);
    for (i = 0; i < b[2]; i++) for (j = 0; j < b[1]; j++) out.push(ecc[j][i]);
    return out;
  }

  // Returns a square array of booleans (true = dark), or null if the text is too long.
  function encode(text) {
    var bytes = utf8(text);
    var version = 1;
    while (version <= 6 && bytes.length > BLOCKS[version][0] * BLOCKS[version][1] - 2) version++;
    if (version > 6) return null;

    var size = version * 4 + 17;
    var modules = [], fixed = [];
    for (var y = 0; y < size; y++) {
      modules.push([]);
      fixed.push([]);
      for (var x = 0; x < size; x++) {
        modules[y].push(false);
        fixed[y].push(false);
      }
    }
    function set(x, y, dark) {
      modules[y][x] = dark;
      fixed[y][x] = true;
    }

    for (var i = 0; i < size; i++) {          // timing patterns
      set(6, i, i % 2 === 0);
      set(i, 6, i % 2 === 0);
    }
    function finder(cx, cy) {                 // finder pattern plus its light separator
      for (var dy = -4; dy <= 4; dy++) {
        for (var dx = -4; dx <= 4; dx++) {
          var d = Math.max(Math.abs(dx), Math.abs(dy));
          var px = cx + dx, py = cy + dy;
          if (px >= 0 && px < size && py >= 0 && py < size) set(px, py, d !== 2 && d !== 4);
        }
      }
    }
    finder(3, 3);
    finder(size - 4, 3);
    finder(3, size - 4);
    var pos = ALIGNMENT[version];
    for (i = 0; i < pos.length; i++) {
      for (var j = 0; j < pos.length; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0)) continue;
        for (var dy = -2; dy <= 2; dy++) {
          for (var dx = -2; dx <= 2; dx++) set(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }

    function formatBits() {
      var data = MASK;                        // level M is 00
      var rem = data;
      for (var k = 0; k < 10; k++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      var bits = ((data << 10) | rem) ^ 0x5412;
      function bit(n) { return ((bits >>> n) & 1) === 1; }
      for (k = 0; k <= 5; k++) set(8, k, bit(k));
      set(8, 7, bit(6));
      set(8, 8, bit(7));
      set(7, 8, bit(8));
      for (k = 9; k < 15; k++) set(14 - k, 8, bit(k));
      for (k = 0; k < 8; k++) set(size - 1 - k, 8, bit(k));
      for (k = 8; k < 15; k++) set(8, size - 15 + k, bit(k));
      set(8, size - 8, true);                 // the always-dark module
    }
    formatBits();

    // Place the data in two-column zigzags from the bottom right, skipping the timing column.
    var cw = codewords(bytes, version);
    var n = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (j = 0; j < 2; j++) {
          x = right - j;
          y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
          if (!fixed[y][x] && n < cw.length * 8) {
            modules[y][x] = ((cw[n >>> 3] >>> (7 - (n & 7))) & 1) === 1;
            n++;
          }
        }
      }
    }
    for (y = 0; y < size; y++) {
      for (x = 0; x < size; x++) {
        if (!fixed[y][x] && (x + y) % 2 === 0) modules[y][x] = !modules[y][x];
      }
    }
    return modules;
  }

  // Draws the code with a 4-module quiet zone; returns false if the text is too long.
  function draw(canvas, text) {
    var m = encode(text);
    if (!m) return false;
    var total = m.length + 8;
    var scale = Math.max(1, Math.floor(canvas.width / total));
    canvas.width = canvas.height = total * scale;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    for (var y = 0; y < m.length; y++) {
      for (var x = 0; x < m.length; x++) {
        if (m[y][x]) ctx.fillRect((x + 4) * scale, (y + 4) * scale, scale, scale);
      }
    }
    return true;
  }

  return { encode: encode, draw: draw };
})();
