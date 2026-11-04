/* Lulu's Jungle Tower — JT.BlockArt (character artist B), DESIGN §3 / §4.2.
 *
 *   drawBlock(ctx, block, S, opt)  origin = block CENTRE, S = side (px). opt = { glow 0..1, lift 0..1, dpr, img(name) }
 *       Pseudo-3D wooden cube: thin top face (14 % of S, slightly inset at the back), rounded corners r = 0.14·S,
 *       one-step cel shade (right + bottom), a soft highlight upper-left, wood grain. Painted face per kind:
 *       color | shape | dots | number | animal | letter | size | text.  Static faces are cached per (key, S, dpr)
 *       in lazily created offscreen canvases (no DOM in node → drawn directly, no cache).
 *   drawGhostHand(ctx, size, t)    friendly pointing hand, origin = fingertip, finger points UP; t = time (s) → tap ripple
 *   drawFlower(ctx, size, t, hue)  muted jungle flower, t 0..1 bloom; hue 'coral'|'cream'|'lilac' or 0/1/2
 *   drawLeafPad(ctx, w, h)         big leaf for the 2nd tray row; origin = top-centre of its resting surface
 *   drawGlow(ctx, w, h, t, strength)  golden pulsing halo around a w×h box centred at the origin
 *   COLORS                          = JT.PALETTE (or the DESIGN §3 table when content.js is not loaded)
 *   faceRect(S)                     { x, y, w, h } of the painted front face (for layout/debug)
 *   clearCache()
 */
(function (JT) {
  'use strict';

  var FALLBACK_PALETTE = {
    red:    { base: '#E84A4A', dark: '#A8282E', light: '#F7A0A0' },
    blue:   { base: '#3C8DE8', dark: '#1F5BA8', light: '#A6CCF5' },
    yellow: { base: '#FFD23F', dark: '#C99A12', light: '#FFEB9C' },
    green:  { base: '#4CC26B', dark: '#2A8343', light: '#A8E6B8' },
    orange: { base: '#FF9A2E', dark: '#C4650C', light: '#FFCB8E' },
    purple: { base: '#8E44AD', dark: '#5E2A78', light: '#C9A0DC' },
    pink:   { base: '#FF8FC0', dark: '#C9558A', light: '#FFCCE2' }
  };
  function palette() { return JT.PALETTE || FALLBACK_PALETTE; }
  function pal(c) {
    var p = palette()[c] || FALLBACK_PALETTE[c];
    if (p) return p;
    if (typeof c === 'string' && c[0] === '#') return { base: c, dark: mix(c, '#000000', 0.35), light: mix(c, '#FFFFFF', 0.45) };
    return FALLBACK_PALETTE.orange;
  }

  var PINE = { base: '#F1D3A1', dark: '#A8743F', light: '#F8E4C0' };
  var INK = '#5A3A22';                 // dots, numerals, letters
  var FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", system-ui, sans-serif';
  var TOP = 0.14;                      // top face height (fraction of S)
  var RAD = 0.14;                      // corner radius (fraction of S)

  // ---------------------------------------------------------------- colour helpers
  function rgb(h) { h = h.replace('#', ''); return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]; }
  function mix(a, b, t) {
    var A = rgb(a), B = rgb(b), o = '#';
    for (var i = 0; i < 3; i++) { var v = Math.round(A[i] + (B[i] - A[i]) * t); o += (v < 16 ? '0' : '') + v.toString(16); }
    return o.toUpperCase();
  }
  function rgba(h, a) { var c = rgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rnd(seed) { var s = seed || 1; return function () { s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x6D2B79F5) >>> 0; return (s % 100000) / 100000; }; }

  // ---------------------------------------------------------------- geometry
  function faceRect(S) { var lw = lineW(S); return { x: -S / 2 + lw, y: -S / 2 + TOP * S, w: S - 2 * lw, h: S * (1 - TOP) - lw }; }
  function lineW(S) { return Math.max(2.5, S * 0.045); }   // 5 px at S = 112

  // whole block silhouette: top trapezoid (back edge inset) + front face, rounded corners
  function bodyPath(ctx, S) {
    var h = S / 2, yT = -h + TOP * S, ins = 0.07 * S, r = RAD * S, rt = 0.05 * S;
    ctx.beginPath();
    ctx.moveTo(-h + ins + rt, -h);
    ctx.lineTo(h - ins - rt, -h);
    ctx.quadraticCurveTo(h - ins, -h, h - ins + rt * 0.5, -h + rt * 0.6);
    ctx.lineTo(h, yT + r * 0.2);
    ctx.lineTo(h, h - r);
    ctx.arcTo(h, h, h - r, h, r);
    ctx.lineTo(-h + r, h);
    ctx.arcTo(-h, h, -h, h - r, r);
    ctx.lineTo(-h, yT + r * 0.2);
    ctx.lineTo(-h + ins - rt * 0.5, -h + rt * 0.6);
    ctx.quadraticCurveTo(-h + ins, -h, -h + ins + rt, -h);
    ctx.closePath();
  }

  function roundRect(ctx, x, y, w, h, r, keep) {
    r = Math.min(r, w / 2, h / 2);
    if (!keep) ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
  }

  // ---------------------------------------------------------------- the wooden cube
  function drawCube(ctx, S, c, seedKey) {
    var h = S / 2, yT = -h + TOP * S, lw = lineW(S);
    var shade = mix(c.base, c.dark, 0.28), grain = mix(c.base, c.dark, 0.2);
    ctx.save();
    // outline: a fat stroke under the fill
    bodyPath(ctx, S);
    ctx.lineJoin = 'round';
    ctx.lineWidth = lw * 2; ctx.strokeStyle = c.dark; ctx.stroke();
    ctx.fillStyle = c.base; ctx.fill();
    ctx.clip();
    // cel shade: right side strip + bottom strip (one step darker)
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.moveTo(h - 0.1 * S, yT); ctx.lineTo(h + 2, yT); ctx.lineTo(h + 2, h + 2); ctx.lineTo(-h - 2, h + 2);
    ctx.lineTo(-h - 2, h - 0.09 * S); ctx.lineTo(h - 0.1 * S, h - 0.09 * S); ctx.closePath(); ctx.fill();
    // wood grain (front face): long gentle waves + one small knot
    var R = rnd(hash(seedKey || 'b') + Math.round(S));
    ctx.strokeStyle = rgba(grain, 0.55); ctx.lineWidth = Math.max(1, S * 0.012); ctx.lineCap = 'round';
    for (var i = 0; i < 4; i++) {
      var gy = yT + (0.16 + i * 0.2 + (R() - 0.5) * 0.06) * S, amp = (0.012 + R() * 0.02) * S, ph = R() * 6;
      ctx.beginPath();
      for (var x = -h; x <= h; x += S / 16) {
        var yy = gy + Math.sin(x / S * 7 + ph) * amp;
        if (x === -h) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    var kx = (R() - 0.5) * 0.5 * S, ky = yT + (0.55 + R() * 0.2) * S;
    ctx.beginPath(); ctx.ellipse(kx, ky, 0.035 * S, 0.018 * S, 0, 0, Math.PI * 2); ctx.stroke();
    // top face (lighter), with a crisp edge line
    ctx.fillStyle = c.light;
    ctx.fillRect(-h - 2, -h - 2, S + 4, TOP * S + 2);
    ctx.strokeStyle = rgba(grain, 0.5); ctx.lineWidth = Math.max(1, S * 0.01);
    ctx.beginPath(); ctx.moveTo(-h + 0.18 * S, -h + TOP * S * 0.5); ctx.lineTo(h - 0.3 * S, -h + TOP * S * 0.45); ctx.stroke();
    ctx.strokeStyle = c.dark; ctx.globalAlpha = 0.85; ctx.lineWidth = lw * 0.6;
    ctx.beginPath(); ctx.moveTo(-h, yT); ctx.lineTo(h, yT); ctx.stroke();
    ctx.globalAlpha = 1;
    // soft highlight upper-left of the front face
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath(); ctx.ellipse(-h + 0.2 * S, yT + 0.12 * S, 0.16 * S, 0.055 * S, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // re-stroke the outer outline on top (crisp silhouette, half the width)
    ctx.save(); bodyPath(ctx, S); ctx.lineJoin = 'round'; ctx.lineWidth = lw; ctx.strokeStyle = c.dark; ctx.stroke(); ctx.restore();
  }

  // ---------------------------------------------------------------- shapes
  function shapePath(ctx, shape, r) {
    var i, a;
    ctx.beginPath();
    switch (shape) {
      case 'circle': ctx.arc(0, 0, r, 0, Math.PI * 2); break;
      case 'square': roundRect(ctx, -r * 0.86, -r * 0.86, r * 1.72, r * 1.72, r * 0.16); break;
      case 'rect': roundRect(ctx, -r * 1.08, -r * 0.56, r * 2.16, r * 1.12, r * 0.14); break;
      case 'oval': ctx.ellipse(0, 0, r * 1.1, r * 0.66, 0, 0, Math.PI * 2); break;
      case 'diamond':
        ctx.moveTo(0, -r * 1.08); ctx.lineTo(r * 0.78, 0); ctx.lineTo(0, r * 1.08); ctx.lineTo(-r * 0.78, 0); ctx.closePath(); break;
      case 'triangle':
        ctx.moveTo(0, -r * 1.02); ctx.lineTo(r * 1.06, r * 0.82); ctx.lineTo(-r * 1.06, r * 0.82); ctx.closePath(); break;
      case 'star':
        for (i = 0; i < 10; i++) {
          a = -Math.PI / 2 + i * Math.PI / 5;
          var rr = i % 2 ? r * 0.5 : r * 1.08;
          if (i) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr + r * 0.06); else ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr + r * 0.06);
        }
        ctx.closePath(); break;
      case 'heart':
        ctx.moveTo(0, r * 1.0);
        ctx.bezierCurveTo(-r * 0.35, r * 0.68, -r * 1.12, r * 0.22, -r * 1.06, -r * 0.34);
        ctx.bezierCurveTo(-r * 1.0, -r * 0.92, -r * 0.24, -r * 1.06, 0, -r * 0.5);
        ctx.bezierCurveTo(r * 0.24, -r * 1.06, r * 1.0, -r * 0.92, r * 1.06, -r * 0.34);
        ctx.bezierCurveTo(r * 1.12, r * 0.22, r * 0.35, r * 0.68, 0, r * 1.0);
        ctx.closePath(); break;
      default: ctx.arc(0, 0, r, 0, Math.PI * 2);
    }
  }

  function drawShape(ctx, shape, r, c, lw) {
    ctx.save();
    ctx.lineJoin = 'round';
    shapePath(ctx, shape, r);
    ctx.lineWidth = lw; ctx.strokeStyle = c.dark; ctx.stroke();
    ctx.fillStyle = c.base; ctx.fill();
    ctx.clip();
    ctx.fillStyle = rgba(c.dark, 0.25);                          // cel shade lower-right
    ctx.beginPath(); ctx.ellipse(r * 0.55, r * 0.7, r * 1.2, r * 0.7, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';                     // highlight upper-left
    ctx.beginPath(); ctx.ellipse(-r * 0.38, -r * 0.42, r * 0.32, r * 0.16, -0.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.save(); shapePath(ctx, shape, r); ctx.lineJoin = 'round'; ctx.lineWidth = lw * 0.55; ctx.strokeStyle = c.dark; ctx.stroke(); ctx.restore();
  }

  // ---------------------------------------------------------------- dice dots
  var DICE = {
    1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
    6: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]],
    7: [[-1, -1], [-1, 0], [-1, 1], [0, 0], [1, -1], [1, 0], [1, 1]],
    8: [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]],
    9: [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]],
    10: [[-1.2, -1], [-0.4, -1], [0.4, -1], [1.2, -1], [-0.6, 0], [0.6, 0], [-1.2, 1], [-0.4, 1], [0.4, 1], [1.2, 1]]
  };
  function dot(ctx, x, y, r, col) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.32)'; ctx.beginPath(); ctx.arc(x - r * 0.32, y - r * 0.34, r * 0.3, 0, Math.PI * 2); ctx.fill();
  }
  function drawDice(ctx, n, S, cy, col) {
    n = Math.max(1, Math.min(10, n | 0));
    var pts = DICE[n], d = n <= 6 ? 0.24 * S : 0.225 * S, r = n <= 3 ? 0.092 * S : n <= 6 ? 0.084 * S : n <= 9 ? 0.07 * S : 0.062 * S;
    if (n === 10) d = 0.21 * S;
    for (var i = 0; i < pts.length; i++) dot(ctx, pts[i][0] * d, cy + pts[i][1] * d, r, col);
  }
  // small counting dots in up to 2 rows of 5 (under a numeral)
  function drawDotRow(ctx, n, S, cy, col) {
    n = Math.max(0, Math.min(10, n | 0)); if (!n) return;
    var rows = n > 5 ? 2 : 1, r = rows > 1 ? 0.042 * S : 0.05 * S, gap = rows > 1 ? 0.145 * S : 0.155 * S;
    for (var k = 0; k < rows; k++) {
      var cnt = rows > 1 ? (k ? n - 5 : 5) : n, y = cy + (rows > 1 ? (k - 0.5) * 0.1 * S : 0);
      for (var i = 0; i < cnt; i++) dot(ctx, (i - (cnt - 1) / 2) * gap, y, r, col);
    }
  }

  // ---------------------------------------------------------------- text
  function drawLabel(ctx, txt, S, cy, maxH, maxW, col) {
    txt = String(txt);
    var fs = maxH;
    ctx.font = 'bold ' + fs + 'px ' + FONT;
    var w = ctx.measureText(txt).width;
    if (w > maxW) { fs = Math.floor(fs * maxW / w); ctx.font = 'bold ' + fs + 'px ' + FONT; }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var y = cy + fs * 0.04;
    ctx.lineJoin = 'round';
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillText(txt, fs * 0.03, y + fs * 0.05);    // carved/emboss light edge
    ctx.lineWidth = Math.max(1.5, fs * 0.05); ctx.strokeStyle = col; ctx.strokeText(txt, 0, y);
    ctx.fillStyle = col; ctx.fillText(txt, 0, y);
  }

  // ---------------------------------------------------------------- animal sticker (or fallback)
  function drawSticker(ctx, img, size, cy) {
    if (img) { ctx.drawImage(img, -size / 2, cy - size / 2, size, size); return; }
    var r = size * 0.4;
    ctx.save();
    ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(0, cy, r + size * 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#C9A27A'; ctx.strokeStyle = '#8A6440'; ctx.lineWidth = size * 0.03;
    ctx.beginPath(); ctx.arc(0, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2F2A3A';
    ctx.beginPath(); ctx.arc(-r * 0.36, cy - r * 0.12, r * 0.13, 0, Math.PI * 2); ctx.arc(r * 0.36, cy - r * 0.12, r * 0.13, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2F2A3A'; ctx.lineWidth = size * 0.025; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, cy + r * 0.12, r * 0.3, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------- face per kind
  function isColorBlock(b) { return b.kind === 'color' || (b.kind === 'size' && !b.animal); }
  function blockScale(b) {
    if (b.kind !== 'size') return 1;
    if (typeof b.scale === 'number' && b.scale > 0) return b.scale;
    return (b.size || b.value) === 'small' ? 0.7 : 1;
  }
  function blockKey(b) {
    return [b.kind, b.value, b.color, b.shape, b.n, b.text, b.animal, b.size, b.showDots ? 1 : 0].join('|');
  }

  function paintBlock(ctx, b, S, imgFn) {
    var col = isColorBlock(b) ? pal(b.color || b.value) : PINE;
    drawCube(ctx, S, col, blockKey(b));
    var fr = faceRect(S), cy = fr.y + fr.h / 2, ink = b.color && !isColorBlock(b) && b.kind !== 'shape' ? pal(b.color).dark : INK;
    var lw = lineW(S);
    switch (b.kind) {
      case 'shape':
        drawShapeAt(ctx, b.shape || b.value, S, cy, pal(b.color || 'red'), lw);
        break;
      case 'dots':
        drawDice(ctx, b.n != null ? b.n : +b.value, S, cy, INK);
        break;
      case 'number':
        var num = b.text != null ? b.text : (b.n != null ? b.n : b.value);
        if (b.showDots) {
          drawLabel(ctx, num, S, cy - 0.13 * S, 0.5 * S, 0.8 * S, ink);
          drawDotRow(ctx, b.n != null ? b.n : +b.value, S, cy + 0.27 * S, ink);
        } else drawLabel(ctx, num, S, cy, 0.66 * S, 0.82 * S, ink);
        break;
      case 'letter':
        drawLabel(ctx, b.text != null ? b.text : b.value, S, cy, 0.66 * S, 0.82 * S, ink);
        break;
      case 'animal':
      case 'size':
        if (b.kind === 'size' && !b.animal) break;
        var an = b.animal || b.value;
        drawSticker(ctx, imgFn ? imgFn('animal_' + an) : null, S * 0.84, cy);
        break;
      case 'text':
        var t = String(b.text != null ? b.text : b.value), long = t.length > 4;
        drawLabel(ctx, t, S, cy, (long ? 0.34 : t.length > 2 ? 0.42 : 0.6) * S, 0.84 * S, ink);
        break;
      default: break;          // 'color': the painted cube is the face
    }
  }
  function drawShapeAt(ctx, shape, S, cy, c, lw) {
    ctx.save(); ctx.translate(0, cy);
    var r = shape === 'rect' || shape === 'oval' ? 0.31 * S : 0.29 * S;
    drawShape(ctx, shape, r, c, lw * 1.4);
    ctx.restore();
  }

  // ---------------------------------------------------------------- cache
  var cache = {}, cacheN = 0, MAX_CACHE = 160;
  function makeCanvas(w, h) {
    try {
      if (typeof document !== 'undefined' && document.createElement) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
      if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    } catch (e) { }
    return null;
  }
  function imgReady(img) { return img && (img.complete === undefined || img.complete) && (img.naturalWidth === undefined || img.naturalWidth > 0); }

  function faceCanvas(b, S, dpr, imgFn) {
    var needsImg = b.kind === 'animal' || (b.kind === 'size' && b.animal), img = null;
    if (needsImg && imgFn) { img = imgFn('animal_' + (b.animal || b.value)); if (!imgReady(img)) img = null; }
    var key = blockKey(b) + '@' + Math.round(S * 10) + 'x' + dpr + (needsImg && !img ? '#noimg' : '');
    var hit = cache[key];
    if (hit) return hit;
    var pad = Math.ceil(lineW(S) * 1.5 + 2), side = S + 2 * pad;
    var cv = makeCanvas(Math.ceil(side * dpr), Math.ceil(side * dpr));
    if (!cv) return null;
    var g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, side * dpr / 2, side * dpr / 2);
    paintBlock(g, b, S, function () { return img; });
    var entry = { canvas: cv, side: side };
    if (!(needsImg && !img)) {                                   // never cache a fallback face: the image may arrive
      if (cacheN >= MAX_CACHE) { cache = {}; cacheN = 0; }
      cache[key] = entry; cacheN++;
    }
    return entry;
  }

  // ---------------------------------------------------------------- public
  function drawBlock(ctx, block, S, opt) {
    if (!block) return;
    opt = opt || {};
    var sc = blockScale(block), s = S * sc;
    var glow = +opt.glow || 0, lift = +opt.lift || 0;
    if (glow > 0.01) drawGlow(ctx, s, s, opt.t != null ? opt.t : nowSec(), glow);
    var dpr = opt.dpr || 1, entry = null;
    if (opt.cache !== false) entry = faceCanvas(block, s, dpr, opt.img);
    if (entry) ctx.drawImage(entry.canvas, -entry.side / 2, -entry.side / 2, entry.side, entry.side);
    else paintBlock(ctx, block, s, opt.img);
    if (lift > 0.01) {
      ctx.save(); bodyPath(ctx, s); ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,236,200,' + (0.14 * Math.min(1, lift)).toFixed(3) + ')';
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.restore();
    }
  }
  function nowSec() { return (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) / 1000; }

  function drawGlow(ctx, w, h, t, strength) {
    strength = Math.max(0, Math.min(1, strength == null ? 1 : strength));
    if (!strength) return;
    var wave = Math.sin((t || 0) * 5.5), pulse = 0.85 + 0.15 * wave;
    var m = Math.min(w, h), R = m * (0.3 + 0.03 * wave);            // halo reach beyond the box
    ctx.save();
    // only OUTSIDE the box (the glow never tints what it surrounds)
    ctx.beginPath(); ctx.rect(-w - 4 * R, -h - 4 * R, 2 * w + 8 * R, 2 * h + 8 * R);
    roundRect(ctx, -w / 2 + 1, -h / 2 + 1, w - 2, h - 2, m * 0.14, true); ctx.clip('evenodd');
    // soft halo: a stack of rounded rects, fading outwards (works for any w×h, no blur filter)
    for (var i = 5; i >= 1; i--) {
      var e = R * i / 5, a = strength * pulse * 0.22 * (1 - (i - 1) / 5);
      roundRect(ctx, -w / 2 - e, -h / 2 - e, w + 2 * e, h + 2 * e, m * 0.14 + e);
      ctx.fillStyle = 'rgba(255,214,80,' + a.toFixed(3) + ')'; ctx.fill();
    }
    // bright golden rim hugging the box
    roundRect(ctx, -w / 2 - m * 0.05, -h / 2 - m * 0.05, w + m * 0.1, h + m * 0.1, m * 0.18);
    ctx.lineWidth = m * 0.05; ctx.strokeStyle = 'rgba(255,226,110,' + (0.95 * strength * pulse).toFixed(3) + ')'; ctx.stroke();
    ctx.lineWidth = m * 0.018; ctx.strokeStyle = 'rgba(255,255,235,' + (0.9 * strength).toFixed(3) + ')'; ctx.stroke();
    ctx.restore();
  }

  function drawGhostHand(ctx, size, t) {
    var s = size, F = '#FFF4E4', L = '#B9835A', SH = '#F1D6B8';
    t = t || 0;
    var press = 0.5 + 0.5 * Math.sin(t * 6);
    ctx.save();
    // tap ripple at the fingertip
    var ph = (t * 1.4) % 1;
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.8 * (1 - ph)).toFixed(3) + ')'; ctx.lineWidth = s * 0.035;
    ctx.beginPath(); ctx.arc(0, 0, s * (0.08 + 0.22 * ph), 0, Math.PI * 2); ctx.stroke();
    ctx.translate(0, s * 0.03 * press);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    function hand() {
      ctx.beginPath();
      roundRectPath(-s * 0.085, 0, s * 0.17, s * 0.52, s * 0.085);          // index finger
      roundRectPath(-s * 0.26, s * 0.36, s * 0.47, s * 0.42, s * 0.14);     // palm + folded fingers
      ctx.moveTo(-s * 0.2, s * 0.5);                                          // thumb
      ctx.ellipse(-s * 0.27, s * 0.46, s * 0.07, s * 0.15, -0.6, 0, Math.PI * 2);
    }
    function roundRectPath(x, y, w, h, r) {
      ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
      ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
      ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
      ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
    }
    ctx.globalAlpha *= 0.94;
    hand(); ctx.lineWidth = s * 0.07; ctx.strokeStyle = L; ctx.stroke();
    hand(); ctx.fillStyle = F; ctx.fill();
    // knuckle lines + cel shade
    ctx.strokeStyle = SH; ctx.lineWidth = s * 0.03;
    ctx.beginPath(); ctx.moveTo(s * 0.0, s * 0.5); ctx.lineTo(s * 0.18, s * 0.5); ctx.moveTo(s * 0.0, s * 0.62); ctx.lineTo(s * 0.18, s * 0.62); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.ellipse(-s * 0.03, s * 0.12, s * 0.025, s * 0.07, 0, 0, Math.PI * 2); ctx.fill();
    // cuff
    ctx.fillStyle = '#7CCBB5'; ctx.strokeStyle = '#4E9C88'; ctx.lineWidth = s * 0.04;
    ctx.beginPath(); roundRectPath(-s * 0.24, s * 0.76, s * 0.44, s * 0.14, s * 0.05); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  var FLOWER = {
    coral: { petal: '#E9A193', line: '#B66A5E', mid: '#F6D58A' },
    cream: { petal: '#F4E8C8', line: '#B9A479', mid: '#E6B45E' },
    lilac: { petal: '#C8B5DD', line: '#8D78A8', mid: '#F3D98A' }
  };
  function drawFlower(ctx, size, t, hue) {
    var key = typeof hue === 'number' ? ['coral', 'cream', 'lilac'][((hue % 3) + 3) % 3] : hue;
    var c = FLOWER[key] || FLOWER.coral;
    t = Math.max(0, Math.min(1, t == null ? 1 : t));
    if (t <= 0) return;
    var k = 1.70158, u = t - 1, e = 1 + (k + 1) * u * u * u + k * u * u;         // easeOutBack
    var r = size * 0.5 * Math.max(0, e);
    ctx.save();
    ctx.rotate((1 - t) * 0.9);
    ctx.lineWidth = Math.max(1, size * 0.045); ctx.strokeStyle = c.line; ctx.lineJoin = 'round';
    for (var pass = 0; pass < 2; pass++) {
      for (var i = 0; i < 5; i++) {
        var a = i * Math.PI * 2 / 5 - Math.PI / 2;
        ctx.save(); ctx.rotate(a);
        ctx.beginPath(); ctx.ellipse(r * 0.52, 0, r * 0.48, r * 0.3, 0, 0, Math.PI * 2);
        if (pass === 0) ctx.stroke(); else { ctx.fillStyle = c.petal; ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.ellipse(r * 0.5, -r * 0.08, r * 0.24, r * 0.09, 0, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
      }
    }
    ctx.fillStyle = c.mid; ctx.beginPath(); ctx.arc(0, 0, r * 0.24, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = Math.max(1, size * 0.03); ctx.strokeStyle = mix(c.mid, '#7A4A1A', 0.4); ctx.stroke();
    ctx.restore();
  }

  function drawLeafPad(ctx, w, h) {
    var hw = w / 2, top = -h * 0.42, bot = h * 0.5, th = h * 0.3;
    var SURF = '#79B47C', LIGHT = '#98C994', UNDER = '#3F7F57', LINE = '#2C5E42';
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    function leaf(dy) {
      ctx.beginPath();
      ctx.moveTo(-hw, (top + bot) / 2 + dy);
      ctx.bezierCurveTo(-hw * 0.7, top - h * 0.1 + dy, hw * 0.45, top - h * 0.12 + dy, hw, (top + bot) / 2 - h * 0.06 + dy);
      ctx.bezierCurveTo(hw * 0.45, bot + h * 0.08 + dy, -hw * 0.7, bot + h * 0.06 + dy, -hw, (top + bot) / 2 + dy);
      ctx.closePath();
    }
    // stem
    ctx.strokeStyle = LINE; ctx.lineWidth = Math.max(3, h * 0.14);
    ctx.beginPath(); ctx.moveTo(-hw - w * 0.06, (top + bot) / 2 + th * 0.8); ctx.quadraticCurveTo(-hw - w * 0.02, (top + bot) / 2 + th * 0.2, -hw + 2, (top + bot) / 2 + th * 0.4); ctx.stroke();
    // underside (thickness) then surface
    leaf(th); ctx.fillStyle = UNDER; ctx.fill(); ctx.lineWidth = Math.max(2, h * 0.07); ctx.strokeStyle = LINE; ctx.stroke();
    leaf(0); ctx.fillStyle = SURF; ctx.fill(); ctx.stroke();
    ctx.save(); leaf(0); ctx.clip();
    ctx.fillStyle = LIGHT; ctx.beginPath(); ctx.ellipse(-hw * 0.2, top + h * 0.05, hw * 0.75, h * 0.2, -0.04, 0, Math.PI * 2); ctx.fill();
    // veins
    ctx.strokeStyle = rgba(LINE, 0.55); ctx.lineWidth = Math.max(1.5, h * 0.05);
    var my = (top + bot) / 2;
    ctx.beginPath(); ctx.moveTo(-hw, my); ctx.quadraticCurveTo(0, my - h * 0.05, hw, my - h * 0.06); ctx.stroke();
    ctx.lineWidth = Math.max(1, h * 0.03);
    for (var i = 1; i <= 5; i++) {
      var x = -hw + i * w / 6.2, y0 = my - h * 0.04 * (x + hw) / w;
      ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x + w * 0.07, top - h * 0.1); ctx.moveTo(x, y0); ctx.lineTo(x + w * 0.07, bot + h * 0.1); ctx.stroke();
    }
    ctx.restore();
    ctx.restore();
  }

  JT.BlockArt = {
    drawBlock: drawBlock, drawGhostHand: drawGhostHand, drawFlower: drawFlower, drawLeafPad: drawLeafPad, drawGlow: drawGlow,
    get COLORS() { return palette(); },
    faceRect: faceRect, blockScale: blockScale, shapePath: shapePath,
    clearCache: function () { cache = {}; cacheN = 0; },
    PINE: PINE, INK: INK, FONT: FONT, _mix: mix
  };
})(typeof window !== 'undefined' ? (window.JT = window.JT || {}) : (globalThis.JT = globalThis.JT || {}));
