// FC.CampArt — code-drawn camp things for Pip's Camp Hide & Seek (character artist A). See docs/DESIGN.md §5.6.
// Classic script; safe to require() in node (document / canvases are only touched lazily inside draw calls).
//
// Everything is drawn at the current transform origin:
//   drawClue(ctx, clue, size, opt)   origin = the friend's HEAD TOP centre (see HEAD_TOP); size = friend sprite box px
//                                    (the 128-box animal drawn size × size). opt { t:seconds, bob:0..1 (hint bob + pulse),
//                                    alpha:0..1 }. Kinds:
//                                      hat   chunky knitted beanie (ribbed cuff, knit stitches, pompom) in clue.color
//                                            (fallback clue.value); covers y −0.13…+0.155·size, pompom up to −0.27·size
//                                      flag  stick from the head up + cream flag cloth showing clue.shape (fallback
//                                            clue.value) in clue.color; cloth spans x −0.19…+0.31·size, y −0.62…−0.22·size
//                                      sign  wooden sign on a stick: optional numeral (clue.text, or clue.number === true →
//                                            n) on a round plate + clue.n (fallback value) gold stars in dice layout (1..12)
//                                      badge round (or pill, > 2 chars) light-wood badge on a stick with clue.text
//                                            (fallback value), dark ink, contrast > 10:1
//                                      ears / size  nothing (the friend's own head is the clue)
//   clueHeight(clue, size)           px the clue sticks up above the head top: hat 0.27·size, flag 0.66·size,
//                                    sign 0.65·size + 3, badge 0.62·size + 3, ears/size 0
//   clueBox(clue, size)              → { x0, y0, x1, y1 } drawn bounds relative to the origin (px) or null for ears/size
//   drawFlames(ctx, power, t, size)  campfire flames, origin = base of the flames (on the logs), pointing up.
//                                    size = flame base width px (≈ 0.45 × the drawn campfire.svg width);
//                                    height ≈ size·(0.95 + 0.85·power). power 0 is still a cosy small fire.
//   drawGlow(ctx, w, h, t, strength) soft golden pulsing glow ellipse w × h, centred (hints)
//   drawButterfly(ctx, size, t, color) flapping butterfly (size = wingspan), color key or hex (default pale yellow)
//   drawSpark(ctx, size, color)      4-point twinkle, size = tip-to-tip
//   drawStar(ctx, size, color)       rounded 5-point star with outline + gloss (size = tip-to-tip width), color key or hex
//   COLORS = { key: { base, dark, light, shade } } (answer palette, exact hex), SHAPES, HEAD_TOP, clearCache()
//   HEAD_TOP = { animal: [x, y] } head-top point in the 128 box of items/animal_<x>.svg (where the clue origin goes):
//              origin_px = sprite top-left + HEAD_TOP[a] / 128 · size
// Bitmaps (hats, flag cloths, signs, badges, stars) are cached per key / size bucket / device-pixel bucket.
(function (FC) {
  'use strict';

  var PALETTE = {
    red: ['#E84A4A', '#A8282E'], blue: ['#3C8DE8', '#1F5BA8'], yellow: ['#FFD23F', '#C99A12'],
    green: ['#4CC26B', '#2A8343'], orange: ['#FF9A2E', '#C4650C'], purple: ['#9B6BE0', '#6840A8'],
    pink: ['#FF8FC0', '#C9558A']
  };
  var FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", system-ui, -apple-system, sans-serif';
  var SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'rect', 'diamond', 'oval'];
  var GOLD = { base: '#FFC93C', dark: '#C98A12', light: '#FFE89A', shade: '#F2AE22' };
  var WOOD = { base: '#D7A266', dark: '#7A5230', light: '#EDC48E', shade: '#BF8A50', grain: '#A8743F' };
  var PALE = { base: '#F7E5BF', dark: '#7A5230', ink: '#3A2414', shade: '#E8CF9E' };
  var STICK = { base: '#9A6A3E', dark: '#5A3A20', light: '#C08E5C' };
  var CLOTH = { base: '#FFF8EA', dark: '#9A8468', shade: '#EFE3CC' };
  var HEAD_TOP = { cat: [70, 19], dog: [70, 20], cow: [70, 20], pig: [70, 23], sheep: [75, 13], duck: [72, 19],
    lion: [70, 12], frog: [70, 19] };

  // ---------------------------------------------------------------- colour helpers
  function hexRgb(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
  function rgbHex(c) {
    return '#' + c.map(function (v) { var s = Math.max(0, Math.min(255, Math.round(v))).toString(16); return s.length < 2 ? '0' + s : s; }).join('').toUpperCase();
  }
  function mix(a, b, t) { var x = hexRgb(a), y = hexRgb(b); return rgbHex([0, 1, 2].map(function (i) { return x[i] + (y[i] - x[i]) * t; })); }
  function rgba(hex, a) { var c = hexRgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (+a).toFixed(3) + ')'; }

  var COLORS = {};
  Object.keys(PALETTE).forEach(function (k) {
    var base = PALETTE[k][0], dark = PALETTE[k][1];
    COLORS[k] = { base: base, dark: dark, light: mix(base, '#FFFFFF', 0.45), shade: mix(base, dark, 0.45) };
  });
  function colOf(c) {
    if (!c) return null;
    if (COLORS[c]) return COLORS[c];
    if (typeof c === 'string' && c.charAt(0) === '#' && c.length === 7) return { base: c, dark: mix(c, '#2A2040', 0.4), light: mix(c, '#FFFFFF', 0.45), shade: mix(c, '#2A2040', 0.18) };
    return null;
  }
  function colKey(c) { return COLORS[c] ? c : (colOf(c) ? c : 'red'); }

  // ---------------------------------------------------------------- canvas cache
  var cache = {}, cacheN = 0, CACHE_MAX = 200;
  function makeCanvas(w, h) {
    if (typeof OffscreenCanvas !== 'undefined') { try { return new OffscreenCanvas(w, h); } catch (e) { /* fall through */ } }
    if (typeof document !== 'undefined' && document.createElement) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
    return null;
  }
  function pxScale(ctx) {
    var s = 1;
    try {
      if (ctx.getTransform) { var m = ctx.getTransform(); s = Math.sqrt(m.c * m.c + m.d * m.d) || 1; }
    } catch (e) { s = 1; }
    return Math.max(1, Math.min(4, Math.ceil(s * 2 - 0.15) / 2));
  }
  // draw `fn(c2d)` once into a cached bitmap covering box {x0,y0,x1,y1} (local units), then blit at the origin
  function cached(ctx, key, box, fn) {
    var ps = pxScale(ctx), k = key + '@' + ps;
    var e = cache[k];
    if (!e) {
      var pad = 4, w = Math.ceil((box.x1 - box.x0 + pad * 2) * ps), h = Math.ceil((box.y1 - box.y0 + pad * 2) * ps);
      var cv = (w > 0 && h > 0 && w < 4096 && h < 4096) ? makeCanvas(w, h) : null;
      if (!cv) { fn(ctx); return; }
      var c = cv.getContext('2d');
      c.setTransform(ps, 0, 0, ps, (pad - box.x0) * ps, (pad - box.y0) * ps);
      fn(c);
      if (cacheN >= CACHE_MAX) { cache = {}; cacheN = 0; }
      e = cache[k] = { cv: cv, x: box.x0 - pad, y: box.y0 - pad, w: w / ps, h: h / ps };
      cacheN++;
    }
    ctx.drawImage(e.cv, e.x, e.y, e.w, e.h);
  }
  function clearCache() { cache = {}; cacheN = 0; }
  function bucket(v) { return v < 64 ? Math.round(v / 4) * 4 : Math.round(v / 8) * 8; }
  // draw a cached thing painted at a bucketed size sb, scaled to `size`
  function blit(ctx, key, size, box, paint) {
    var sb = Math.max(8, bucket(size));
    ctx.save();
    ctx.scale(size / sb, size / sb);
    cached(ctx, key + '|' + sb, { x0: box[0] * sb, y0: box[1] * sb, x1: box[2] * sb, y1: box[3] * sb }, function (c) { paint(c, sb); });
    ctx.restore();
  }

  // ---------------------------------------------------------------- small path helpers
  function ell(ctx, x, y, rx, ry, rot) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot || 0, 0, Math.PI * 2); }
  function roundPoly(ctx, v, r) {
    var n = v.length;
    ctx.moveTo((v[0][0] + v[n - 1][0]) / 2, (v[0][1] + v[n - 1][1]) / 2);
    for (var i = 0; i < n; i++) {
      var a = v[i], b = v[(i + 1) % n];
      ctx.arcTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, typeof r === 'number' ? r : r[i]);
    }
    ctx.closePath();
  }
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); roundPoly(ctx, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], Math.min(r, w / 2, h / 2)); }
  function starPath(ctx, cx, cy, ro, ri, round) {
    var v = [], rad = [];
    for (var k = 0; k < 10; k++) {
      var a = (-90 + k * 36) * Math.PI / 180, r = k % 2 ? ri : ro;
      v.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); rad.push(k % 2 ? ro * 0.05 : ro * (round || 0.16));
    }
    ctx.beginPath(); roundPoly(ctx, v, rad);
  }

  // ---------------------------------------------------------------- shapes (unit s, centred)
  function traceShape(ctx, shape, s) {
    ctx.beginPath();
    switch (shape) {
      case 'square': roundPoly(ctx, [[-0.42 * s, -0.42 * s], [0.42 * s, -0.42 * s], [0.42 * s, 0.42 * s], [-0.42 * s, 0.42 * s]], 0.08 * s); break;
      case 'rect': roundPoly(ctx, [[-0.62 * s, -0.3 * s], [0.62 * s, -0.3 * s], [0.62 * s, 0.3 * s], [-0.62 * s, 0.3 * s]], 0.07 * s); break;
      case 'triangle': roundPoly(ctx, [[0, -0.52 * s], [0.58 * s, 0.46 * s], [-0.58 * s, 0.46 * s]], 0.09 * s); break;
      case 'diamond': roundPoly(ctx, [[0, -0.56 * s], [0.4 * s, 0], [0, 0.56 * s], [-0.4 * s, 0]], 0.07 * s); break;
      case 'oval': ctx.ellipse(0, 0, 0.62 * s, 0.36 * s, 0, 0, Math.PI * 2); break;
      case 'star': {
        var v = [], rad = [];
        for (var k = 0; k < 10; k++) {
          var ang = (-90 + k * 36) * Math.PI / 180, r = k % 2 ? 0.25 * s : 0.6 * s;
          v.push([Math.cos(ang) * r, Math.sin(ang) * r + 0.06 * s]); rad.push(k % 2 ? 0.03 * s : 0.07 * s);
        }
        roundPoly(ctx, v, rad);
        break;
      }
      case 'heart':
        ctx.moveTo(0, -0.26 * s);
        ctx.bezierCurveTo(0.08 * s, -0.47 * s, 0.55 * s, -0.49 * s, 0.55 * s, -0.11 * s);
        ctx.bezierCurveTo(0.55 * s, 0.15 * s, 0.22 * s, 0.33 * s, 0, 0.52 * s);
        ctx.bezierCurveTo(-0.22 * s, 0.33 * s, -0.55 * s, 0.15 * s, -0.55 * s, -0.11 * s);
        ctx.bezierCurveTo(-0.55 * s, -0.49 * s, -0.08 * s, -0.47 * s, 0, -0.26 * s);
        ctx.closePath();
        break;
      default: ctx.arc(0, 0, 0.5 * s, 0, Math.PI * 2);
    }
  }
  // flat sticker shape: dark outline, one-step shade lower-right, gloss upper-left. Centred at (0,0).
  function paintShape(c, shape, col, s) {
    var lw = Math.max(1.4, s * 0.06);
    traceShape(c, shape, s);
    c.lineJoin = 'round'; c.strokeStyle = col.dark; c.lineWidth = lw * 2; c.stroke();
    c.fillStyle = col.base; c.fill();
    c.save(); traceShape(c, shape, s); c.clip();
    c.fillStyle = col.shade; c.globalAlpha = 0.75;
    c.beginPath(); c.arc(s * 0.42, s * 0.5, s * 0.6, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 1;
    c.fillStyle = rgba('#FFFFFF', 0.75); ell(c, -s * 0.16, -s * 0.2, s * 0.13, s * 0.065, -0.5); c.fill();
    c.restore();
  }

  function paintStar(c, s, colKey) {   // s = tip-to-tip width
    var col = colOf(colKey) || GOLD, ro = s * 0.5, ri = ro * 0.45, lw = Math.max(0.9, s * 0.06);
    starPath(c, 0, s * 0.03, ro, ri, 0.12);
    c.lineJoin = 'round'; c.strokeStyle = col.dark; c.lineWidth = lw * 2; c.stroke();
    c.fillStyle = col.base; c.fill();
    c.save(); c.clip();
    c.fillStyle = col.shade || col.dark; c.globalAlpha = 0.6;
    c.beginPath(); c.arc(ro * 0.5, ro * 0.6, ro * 0.9, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
    c.restore();
    if (s >= 10) { c.fillStyle = rgba(col.light || '#FFFFFF', 0.95); ell(c, -ro * 0.26, -ro * 0.2, ro * 0.16, ro * 0.09, -0.6); c.fill(); }
  }

  // dice-like layouts for 1..12 in a unit square (−1..1); r = star radius in the same units
  var DICE = {
    1: [[0, 0]], 2: [[-0.55, -0.55], [0.55, 0.55]], 3: [[-0.66, -0.66], [0, 0], [0.66, 0.66]],
    4: [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]],
    5: [[-0.64, -0.64], [0.64, -0.64], [0, 0], [-0.64, 0.64], [0.64, 0.64]],
    6: [[-0.68, -0.45], [0, -0.45], [0.68, -0.45], [-0.68, 0.45], [0, 0.45], [0.68, 0.45]]   // 3 × 2 (wider field)
  };
  var DICE_R = { 1: 0.78, 2: 0.5, 3: 0.4, 4: 0.46, 5: 0.36, 6: 0.36 };
  function diceLayout(n) {
    n = Math.max(1, Math.min(12, Math.round(n) || 1));
    if (DICE[n]) return { pts: DICE[n], r: DICE_R[n] };
    if (n <= 9) {   // 7–9: 3 columns × 3 rows filled row-wise, last row centred (field is wider: hx 0.24)
      var pts = [], rows = [3, 3, n - 6];
      rows.forEach(function (cnt, ri) { for (var i = 0; i < cnt; i++) pts.push([(i - (cnt - 1) / 2) * 0.72, (ri - 1) * 0.68]); });
      return { pts: pts, r: 0.3 };
    }
    var p2 = [], rows2 = [4, 4, n - 8];   // 10–12: 4 + 4 + 2..4 (hx 0.29)
    rows2.forEach(function (cnt, ri) { for (var i = 0; i < cnt; i++) p2.push([(i - (cnt - 1) / 2) * 0.6, (ri - 1) * 0.68]); });
    return { pts: p2, r: 0.3 };
  }

  function fitFont(c, text, maxW, px, weight) {
    var size = px;
    c.font = (weight || '800') + ' ' + size + 'px ' + FONT;
    var m = c.measureText(text).width;
    if (m > maxW && m > 0) { size = Math.max(6, Math.floor(size * maxW / m)); c.font = (weight || '800') + ' ' + size + 'px ' + FONT; }
    return size;
  }

  // ======================================================================= CLUES (unit u = friend size)
  // ---------------------------------------------------------------- hat: knitted beanie
  var HAT = { hw: 0.245, top: -0.13, cuffY0: 0.045, cuffY1: 0.155, cuffHW: 0.272, pomY: -0.165, pomR: 0.072 };
  function domePath(c, u) {
    var hw = HAT.hw * u, y0 = (HAT.cuffY0 + 0.03) * u, top = HAT.top * u;
    c.beginPath();
    c.moveTo(-hw, y0);
    c.bezierCurveTo(-hw * 1.02, top * 0.25, -hw * 0.62, top, 0, top);
    c.bezierCurveTo(hw * 0.62, top, hw * 1.02, top * 0.25, hw, y0);
    c.closePath();
  }
  function pomPath(c, u, grow) {
    var cx = 0.01 * u, cy = HAT.pomY * u, r = HAT.pomR * u, g = grow || 0;
    c.beginPath();
    for (var k = 0; k < 11; k++) {
      var a = k / 11 * Math.PI * 2, x = cx + Math.cos(a) * r * 0.78, y = cy + Math.sin(a) * r * 0.78;
      c.moveTo(x + r * 0.36 + g, y); c.arc(x, y, r * 0.36 + g, 0, Math.PI * 2);
    }
    c.moveTo(cx + r * 0.8 + g, cy); c.arc(cx, cy, r * 0.8 + g, 0, Math.PI * 2);
  }
  function paintHat(c, key, u) {
    var col = colOf(key) || COLORS.red, lw = Math.max(1.5, u * 0.02);
    var chw = HAT.cuffHW * u, cy0 = HAT.cuffY0 * u, cy1 = HAT.cuffY1 * u;
    c.lineJoin = 'round'; c.lineCap = 'round';
    // soft contact shadow on the head under the cuff
    c.fillStyle = 'rgba(40,30,40,0.18)'; ell(c, 0, cy1 + u * 0.01, chw * 0.95, u * 0.03); c.fill();
    // cream halo so a green / yellow hat still pops on the meadow (visual QA P2-4)
    c.fillStyle = 'rgba(255,248,232,0.95)'; pomPath(c, u, lw * 3); c.fill();
    domePath(c, u); c.strokeStyle = 'rgba(255,248,232,0.95)'; c.lineWidth = lw * 6; c.stroke();
    // pompom (behind the dome)
    pomPath(c, u, lw); c.fillStyle = col.dark; c.fill();
    pomPath(c, u, 0); c.fillStyle = col.base; c.fill();
    c.save(); pomPath(c, u, 0); c.clip();
    c.fillStyle = col.shade; ell(c, 0.05 * u, HAT.pomY * u + 0.05 * u, 0.07 * u, 0.06 * u); c.fill();
    c.fillStyle = rgba(col.light, 0.95); ell(c, -0.02 * u, HAT.pomY * u - 0.03 * u, 0.035 * u, 0.025 * u, -0.4); c.fill();
    c.restore();
    // fluffy tuft strokes on the pompom
    c.strokeStyle = rgba(col.dark, 0.45); c.lineWidth = Math.max(0.8, u * 0.008);
    [[-0.03, -0.16, 0.02, -0.17], [0.03, -0.14, 0.05, -0.12], [-0.02, -0.12, 0.0, -0.11]].forEach(function (l) {
      c.beginPath(); c.moveTo(l[0] * u, l[1] * u); c.lineTo(l[2] * u, l[3] * u); c.stroke();
    });
    // dome
    domePath(c, u); c.strokeStyle = col.dark; c.lineWidth = lw * 2; c.stroke();
    c.fillStyle = col.base; c.fill();
    c.save(); domePath(c, u); c.clip();
    c.fillStyle = col.shade; ell(c, 0.2 * u, 0.04 * u, 0.17 * u, 0.2 * u); c.fill();
    // knit stitches: columns of little "v"s that follow the dome's curve
    c.strokeStyle = rgba(col.dark, 0.3); c.lineWidth = Math.max(0.8, u * 0.009);
    for (var i = -4; i <= 4; i++) {
      var cxk = i * 0.054 * u;
      for (var j = 0; j < 6; j++) {
        var yk = (0.07 - j * 0.04) * u + Math.abs(i) * Math.abs(i) * 0.0012 * u * j;
        var vw = 0.018 * u * (1 - Math.abs(i) * 0.05), vh = 0.014 * u;
        c.beginPath(); c.moveTo(cxk - vw, yk - vh); c.lineTo(cxk, yk); c.lineTo(cxk + vw, yk - vh); c.stroke();
      }
    }
    c.fillStyle = rgba(col.light, 0.85); ell(c, -0.1 * u, -0.075 * u, 0.075 * u, 0.032 * u, -0.45); c.fill();
    c.restore();
    domePath(c, u); c.strokeStyle = col.dark; c.lineWidth = lw; c.stroke();
    // ribbed cuff (folded band)
    rr(c, -chw, cy0, chw * 2, cy1 - cy0, (cy1 - cy0) * 0.45);
    c.strokeStyle = col.dark; c.lineWidth = lw * 2; c.stroke();
    c.fillStyle = col.base; c.fill();
    c.save(); rr(c, -chw, cy0, chw * 2, cy1 - cy0, (cy1 - cy0) * 0.45); c.clip();
    c.fillStyle = col.shade; c.fillRect(-chw, cy0 + (cy1 - cy0) * 0.62, chw * 2, cy1 - cy0); c.fillRect(chw * 0.55, cy0, chw, cy1 - cy0);
    c.fillStyle = rgba(col.light, 0.7); c.fillRect(-chw, cy0 + (cy1 - cy0) * 0.12, chw * 1.4, (cy1 - cy0) * 0.16);
    c.strokeStyle = rgba(col.dark, 0.5); c.lineWidth = Math.max(0.9, u * 0.011);
    for (var r = -chw + 0.034 * u; r < chw; r += 0.034 * u) {
      c.beginPath(); c.moveTo(r, cy0 + u * 0.016); c.lineTo(r, cy1 - u * 0.014); c.stroke();
    }
    c.restore();
    rr(c, -chw, cy0, chw * 2, cy1 - cy0, (cy1 - cy0) * 0.45); c.strokeStyle = col.dark; c.lineWidth = lw; c.stroke();
  }

  // ---------------------------------------------------------------- flag
  var FLAG = { sx: -0.2, base: 0.06, top: -0.64, cw: 0.5, ch: 0.4, ct: -0.62 };
  function clothPath(c, u, wave) {
    var x0 = (FLAG.sx + 0.012) * u, x1 = x0 + FLAG.cw * u, y0 = FLAG.ct * u, y1 = y0 + FLAG.ch * u, a = 0.022 * u * (wave == null ? 1 : wave);
    c.beginPath();
    c.moveTo(x0, y0 + 0.02 * u);
    c.bezierCurveTo(x0 + (x1 - x0) * 0.3, y0 - a, x0 + (x1 - x0) * 0.62, y0 + a * 1.4, x1, y0 + 0.01 * u);
    c.quadraticCurveTo(x1 + 0.016 * u, y0 + 0.012 * u, x1 + 0.004 * u, y0 + 0.04 * u);
    c.lineTo(x1, y1 - 0.03 * u);
    c.quadraticCurveTo(x1 + 0.006 * u, y1, x1 - 0.03 * u, y1 + 0.004 * u);
    c.bezierCurveTo(x0 + (x1 - x0) * 0.62, y1 + a * 1.4, x0 + (x1 - x0) * 0.3, y1 - a, x0, y1 - 0.01 * u);
    c.closePath();
  }
  function paintFlag(c, shape, key, u) {
    var col = colOf(key) || COLORS.red, lw = Math.max(1.4, u * 0.018);
    c.lineJoin = 'round'; c.lineCap = 'round';
    clothPath(c, u); c.strokeStyle = CLOTH.dark; c.lineWidth = lw * 2; c.stroke();
    c.fillStyle = CLOTH.base; c.fill();
    c.save(); clothPath(c, u); c.clip();
    c.fillStyle = CLOTH.shade; c.fillRect((FLAG.sx) * u, FLAG.ct * u - u, 0.07 * u, 2 * u);
    c.fillStyle = rgba(CLOTH.shade, 0.8); ell(c, (FLAG.sx + FLAG.cw * 0.72) * u, (FLAG.ct + FLAG.ch * 0.5) * u, 0.05 * u, 0.3 * u, 0.05); c.fill();
    c.restore();
    c.save();
    c.translate((FLAG.sx + 0.012 + FLAG.cw * 0.53) * u, (FLAG.ct + FLAG.ch * 0.5) * u);
    paintShape(c, shape, col, 0.31 * u);
    c.restore();
  }
  function drawStick(ctx, x, y0, y1, u) {
    var w = Math.max(2.4, 0.032 * u);
    ctx.lineCap = 'round';
    ctx.strokeStyle = STICK.dark; ctx.lineWidth = w + Math.max(2, u * 0.016);
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
    ctx.strokeStyle = STICK.base; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
    ctx.strokeStyle = STICK.light; ctx.lineWidth = w * 0.3;
    ctx.beginPath(); ctx.moveTo(x - w * 0.2, y0 - w); ctx.lineTo(x - w * 0.2, y1 + w); ctx.stroke();
  }
  function knob(ctx, x, y, u) {
    var r = Math.max(2.4, 0.03 * u);
    ell(ctx, x, y, r, r); ctx.fillStyle = GOLD.base; ctx.fill(); ctx.strokeStyle = GOLD.dark; ctx.lineWidth = Math.max(1, u * 0.01); ctx.stroke();
    ell(ctx, x - r * 0.3, y - r * 0.3, r * 0.35, r * 0.25); ctx.fillStyle = '#FFFFFF'; ctx.fill();
  }

  // ---------------------------------------------------------------- sign (wooden board, numeral + stars)
  function signGeom(clue) {
    var n = Math.max(1, Math.min(12, Math.round(clue.n != null ? clue.n : clue.value) || 1));
    var num = clue.text != null && clue.text !== '' ? String(clue.text) : (clue.number === true ? String(n) : null);
    var hy = 0.19, hx = n <= 5 ? 0.19 : n <= 9 ? 0.24 : 0.29;   // star field half extents (u)
    var w = hx * 2 + 0.07 + (num ? 0.27 : 0), h = hy * 2 + 0.06;
    return { n: n, num: num, w: w, h: h, cy: -0.21 - h / 2, hx: hx, hy: hy };
  }
  function boardPath(c, u, w, h, cy) {
    rr(c, -w / 2 * u, (cy - h / 2) * u, w * u, h * u, 0.06 * u);
  }
  function paintSign(c, clue, u) {
    var g = signGeom(clue), lw = Math.max(1.5, u * 0.02), w = g.w, h = g.h, cy = g.cy;
    c.lineJoin = 'round'; c.lineCap = 'round';
    // shadow
    c.fillStyle = 'rgba(40,30,20,0.2)'; rr(c, -w / 2 * u, (cy - h / 2) * u + u * 0.02, w * u, h * u, 0.06 * u); c.fill();
    boardPath(c, u, w, h, cy); c.strokeStyle = WOOD.dark; c.lineWidth = lw * 2; c.stroke();
    c.fillStyle = WOOD.base; c.fill();
    c.save(); boardPath(c, u, w, h, cy); c.clip();
    // two planks + grain
    c.fillStyle = WOOD.shade; c.fillRect(-w / 2 * u, cy * u + 0.005 * u, w * u, h / 2 * u);
    c.strokeStyle = WOOD.dark; c.globalAlpha = 0.55; c.lineWidth = Math.max(1, u * 0.01);
    c.beginPath(); c.moveTo(-w / 2 * u, cy * u + 0.005 * u); c.lineTo(w / 2 * u, cy * u + 0.005 * u); c.stroke();
    c.globalAlpha = 0.35; c.strokeStyle = WOOD.grain;
    [[-0.3, -0.08, 0.1], [0.05, -0.12, 0.14], [-0.15, 0.08, 0.12], [0.18, 0.1, 0.1]].forEach(function (k) {
      c.beginPath(); c.moveTo((k[0] * w) * u, (cy + k[1]) * u); c.quadraticCurveTo((k[0] * w + k[2] / 2) * u, (cy + k[1] - 0.012) * u, (k[0] * w + k[2]) * u, (cy + k[1]) * u); c.stroke();
    });
    c.globalAlpha = 1;
    c.fillStyle = rgba(WOOD.light, 0.8); c.fillRect(-w / 2 * u, (cy - h / 2) * u + 0.012 * u, w * u, 0.03 * u);
    c.restore();
    boardPath(c, u, w, h, cy); c.strokeStyle = WOOD.dark; c.lineWidth = lw; c.stroke();
    // nails
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (p) {
      ell(c, p[0] * (w / 2 - 0.035) * u, (cy + p[1] * (h / 2 - 0.035)) * u, 0.011 * u, 0.011 * u); c.fillStyle = WOOD.dark; c.fill();
    });
    if (g.num) {
      // numeral on a pale round plate at the left
      var px = (-w / 2 + 0.165) * u, pr = 0.125 * u;
      ell(c, px, cy * u, pr, pr); c.fillStyle = PALE.base; c.fill(); c.strokeStyle = WOOD.dark; c.lineWidth = lw; c.stroke();
      c.textAlign = 'center'; c.textBaseline = 'middle';
      fitFont(c, g.num, pr * 1.6, Math.round(pr * 1.55), '900');
      c.fillStyle = PALE.ink; c.fillText(g.num, px, cy * u + pr * 0.08);
    }
    // stars, dice layout inside the star field (hx × hy half extents), right of the numeral plate
    var L = diceLayout(g.n), cx = (num0(g) ? (w / 2 - 0.035 - g.hx) : 0) * u;
    L.pts.forEach(function (p) {
      c.save(); c.translate(cx + p[0] * g.hx * 0.92 * u, cy * u + p[1] * g.hy * 0.92 * u);
      paintStar(c, L.r * g.hy * 2.1 * u, null); c.restore();
    });
  }
  function num0(g) { return !!g.num; }

  // ---------------------------------------------------------------- badge (round light-wood badge with a letter/number)
  function badgeGeom(clue) {
    var text = String(clue.text != null ? clue.text : (clue.value != null ? clue.value : '?'));
    var w = text.length <= 2 ? 0.4 : Math.min(0.72, 0.13 * text.length + 0.16);
    return { text: text, w: w, h: 0.4, cy: -0.42 };
  }
  function paintBadge(c, clue, u) {
    var g = badgeGeom(clue), lw = Math.max(1.5, u * 0.02), w = g.w * u, h = g.h * u, cy = g.cy * u;
    c.lineJoin = 'round';
    c.fillStyle = 'rgba(40,30,20,0.2)'; rr(c, -w / 2, cy - h / 2 + u * 0.02, w, h, h / 2); c.fill();
    rr(c, -w / 2, cy - h / 2, w, h, h / 2); c.strokeStyle = WOOD.dark; c.lineWidth = lw * 2; c.stroke();
    c.fillStyle = WOOD.base; c.fill();
    // inner pale face
    var ins = 0.035 * u;
    rr(c, -w / 2 + ins, cy - h / 2 + ins, w - ins * 2, h - ins * 2, h / 2 - ins); c.fillStyle = PALE.base; c.fill();
    c.save(); c.clip();
    c.fillStyle = PALE.shade; ell(c, w * 0.25, cy + h * 0.3, w * 0.45, h * 0.32); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.7)'; ell(c, -w * 0.18, cy - h * 0.3, w * 0.2, h * 0.07, -0.3); c.fill();
    c.restore();
    c.textAlign = 'center'; c.textBaseline = 'middle';
    fitFont(c, g.text, w - ins * 4, Math.round(h * 0.62), '900');
    c.fillStyle = PALE.ink; c.fillText(g.text, 0, cy + h * 0.04);
  }

  // ---------------------------------------------------------------- public clue API
  function clueKind(clue) { return clue && clue.kind; }
  function clueBox(clue, size) {
    var k = clueKind(clue), u = size;
    if (k === 'hat') return { x0: -0.3 * u, y0: -0.27 * u, x1: 0.3 * u, y1: 0.18 * u };
    if (k === 'flag') return { x0: (FLAG.sx - 0.04) * u, y0: (FLAG.top - 0.02) * u, x1: (FLAG.sx + FLAG.cw + 0.05) * u, y1: FLAG.base * u };
    if (k === 'sign') { var g = signGeom(clue); return { x0: -g.w / 2 * u - 3, y0: (g.cy - g.h / 2) * u - 3, x1: g.w / 2 * u + 3, y1: 0.06 * u }; }
    if (k === 'badge') { var b = badgeGeom(clue); return { x0: -b.w / 2 * u - 3, y0: (b.cy - b.h / 2) * u - 3, x1: b.w / 2 * u + 3, y1: 0.06 * u }; }
    return null;
  }
  function clueHeight(clue, size) {
    var bx = clueBox(clue, size);
    return bx ? Math.max(0, -bx.y0) : 0;
  }
  function drawClue(ctx, clue, size, opt) {
    var k = clueKind(clue);
    if (!k || k === 'ears' || k === 'size' || !(size > 0)) return;
    opt = opt || {};
    var t = +opt.t || 0, bob = Math.max(0, Math.min(1, +opt.bob || 0)), u = size;
    ctx.save();
    if (opt.alpha != null && opt.alpha < 1) ctx.globalAlpha *= Math.max(0, opt.alpha);
    if (bob > 0) {
      var ph = Math.abs(Math.sin(t * 5));
      ctx.translate(0, -ph * 0.06 * u * bob);
      var sc = 1 + 0.06 * bob * ph; ctx.scale(sc, sc);
    }
    if (k === 'hat') {
      var ck = colKey(clue.color || clue.value);
      ctx.rotate(-0.06);
      blit(ctx, 'hat|' + ck, u, [-0.32, -0.29, 0.32, 0.2], function (c, sb) { paintHat(c, ck, sb); });
    } else if (k === 'flag') {
      var shape = SHAPES.indexOf(clue.shape) >= 0 ? clue.shape : (SHAPES.indexOf(clue.value) >= 0 ? clue.value : 'circle');
      var fk = colKey(clue.color || 'red');
      var sway = Math.sin(t * 2.2) * 0.035;
      ctx.translate(FLAG.sx * u, FLAG.base * u); ctx.rotate(sway); ctx.translate(-FLAG.sx * u, -FLAG.base * u);
      drawStick(ctx, FLAG.sx * u, FLAG.base * u, (FLAG.top + 0.02) * u, u);
      // cloth flutter: tiny vertical skew about the stick
      ctx.save();
      ctx.translate(FLAG.sx * u, 0); ctx.transform(1, Math.sin(t * 3.1 + 0.6) * 0.035, 0, 1, 0, 0); ctx.translate(-FLAG.sx * u, 0);
      blit(ctx, 'flag|' + shape + '|' + fk, u, [FLAG.sx - 0.03, FLAG.ct - 0.06, FLAG.sx + FLAG.cw + 0.06, FLAG.ct + FLAG.ch + 0.06],
        function (c, sb) { paintFlag(c, shape, fk, sb); });
      ctx.restore();
      knob(ctx, FLAG.sx * u, (FLAG.top + 0.01) * u, u);
    } else if (k === 'sign' || k === 'badge') {
      var g = k === 'sign' ? signGeom(clue) : badgeGeom(clue);
      ctx.rotate(Math.sin(t * 1.7) * 0.02);
      drawStick(ctx, 0, 0.06 * u, (g.cy + g.h / 2 - 0.02) * u, u);
      var key = k === 'sign' ? 'sign|' + g.n + '|' + (g.num || '') : 'badge|' + g.text;
      blit(ctx, key, u, [-g.w / 2 - 0.04, g.cy - g.h / 2 - 0.04, g.w / 2 + 0.04, g.cy + g.h / 2 + 0.06], function (c, sb) {
        if (k === 'sign') paintSign(c, clue, sb); else paintBadge(c, clue, sb);
      });
    }
    ctx.restore();
  }

  // ======================================================================= CAMPFIRE
  function tongue(ctx, x, w, h, lean) {   // from the base (y = 0) up to the tip at (x + lean, −h)
    ctx.beginPath();
    ctx.moveTo(x - w / 2, 0);
    ctx.bezierCurveTo(x - w * 0.62, -h * 0.38, x + lean * 0.2 - w * 0.3, -h * 0.7, x + lean, -h);
    ctx.bezierCurveTo(x + lean * 0.2 + w * 0.3, -h * 0.7, x + w * 0.62, -h * 0.38, x + w / 2, 0);
    ctx.quadraticCurveTo(x, w * 0.28, x - w / 2, 0);
    ctx.closePath();
  }
  // tongues: x offset, width, height (in units of the base width), phase
  var TONGUES = [[-0.3, 0.42, 0.62, 0.3], [0.3, 0.42, 0.66, 1.7], [-0.12, 0.5, 0.9, 2.6], [0.14, 0.5, 0.84, 4.1], [0, 0.62, 1.0, 5.3]];
  var FIRE_COLS = ['#E8542E', '#FF8A33', '#FFC444', '#FFF1C2'];
  function drawFlames(ctx, power, t, size) {
    power = Math.max(0, Math.min(1, +power || 0));
    t = +t || 0; size = size || 80;
    var W = size, Hk = (0.95 + 0.85 * power);
    ctx.save();
    // warm glow
    var gr = W * (1.1 + 0.5 * power);
    var g = ctx.createRadialGradient(0, -W * 0.35, 0, 0, -W * 0.35, gr);
    g.addColorStop(0, 'rgba(255,196,90,' + (0.42 + 0.25 * power).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,160,70,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -W * 0.35, gr, 0, Math.PI * 2); ctx.fill();
    // layered tongues
    for (var layer = 0; layer < 4; layer++) {
      var k = [1, 0.8, 0.58, 0.34][layer];
      ctx.fillStyle = FIRE_COLS[layer];
      for (var i = 0; i < TONGUES.length; i++) {
        var T = TONGUES[i];
        if (layer >= 2 && (i === 0 || i === 1)) continue;   // the small side tongues have no core
        var fl = Math.sin(t * (7 + i * 1.3) + T[3]) * 0.5 + Math.sin(t * (12.7 + i) + T[3] * 2) * 0.5;
        var h = W * T[2] * Hk * k * (1 + 0.12 * fl), w = W * T[1] * (0.55 + 0.45 * k);
        var lean = W * (0.08 * Math.sin(t * 5.3 + T[3]) + 0.04 * fl);
        tongue(ctx, T[0] * W * (0.6 + 0.4 * k), w, h, lean);
        ctx.fill();
      }
    }
    // rising embers
    var nE = 3 + Math.round(power * 5);
    for (var e = 0; e < nE; e++) {
      var ph = (t * (0.7 + (e % 3) * 0.18) + e * 0.271) % 1;
      var x = Math.sin(e * 7.1 + t * 2.3) * W * 0.32 * (0.4 + ph);
      var y = -W * Hk * (0.45 + ph * 0.9);
      ctx.globalAlpha = (1 - ph) * (0.55 + 0.45 * power);
      ctx.fillStyle = e % 2 ? '#FFD45A' : '#FF9A3C';
      ctx.beginPath(); ctx.arc(x, y, Math.max(1, W * 0.03 * (1 - ph * 0.6)), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawGlow(ctx, w, h, t, strength) {
    strength = Math.max(0, Math.min(1, strength == null ? 1 : +strength));
    if (strength <= 0.01 || !(w > 0) || !(h > 0)) return;
    t = +t || 0;
    var pulse = 0.75 + 0.25 * Math.sin(t * 4.2);
    ctx.save();
    ctx.scale(1, h / w);
    var r = w / 2 * (0.96 + 0.06 * Math.sin(t * 4.2));
    var g = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r);
    g.addColorStop(0, 'rgba(255,240,170,' + (0.75 * strength * pulse).toFixed(3) + ')');
    g.addColorStop(0.55, 'rgba(255,214,90,' + (0.45 * strength * pulse).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(255,200,70,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawButterfly(ctx, size, t, color) {
    var col = colOf(color) || colOf('#FFE27A'), s = (size || 24) / 2;
    t = +t || 0;
    var flap = 0.22 + 0.78 * Math.abs(Math.cos(t * 13));
    ctx.save();
    ctx.lineJoin = 'round';
    var lw = Math.max(1, s * 0.09);
    [-1, 1].forEach(function (sd) {
      ctx.save(); ctx.scale(sd * flap, 1);
      // upper wing
      ctx.beginPath(); ctx.moveTo(0, -s * 0.05);
      ctx.bezierCurveTo(s * 0.3, -s * 0.95, s * 1.05, -s * 0.85, s * 0.95, -s * 0.25);
      ctx.bezierCurveTo(s * 0.9, s * 0.02, s * 0.4, s * 0.08, 0, s * 0.05);
      ctx.closePath();
      ctx.fillStyle = col.base; ctx.fill(); ctx.strokeStyle = col.dark; ctx.lineWidth = lw; ctx.stroke();
      // lower wing
      ctx.beginPath(); ctx.moveTo(0, s * 0.05);
      ctx.bezierCurveTo(s * 0.55, s * 0.05, s * 0.75, s * 0.45, s * 0.5, s * 0.7);
      ctx.bezierCurveTo(s * 0.3, s * 0.88, s * 0.05, s * 0.5, 0, s * 0.2);
      ctx.closePath();
      ctx.fillStyle = col.shade; ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ell(ctx, s * 0.58, -s * 0.42, s * 0.14, s * 0.12); ctx.fill();
      ell(ctx, s * 0.36, s * 0.42, s * 0.08, s * 0.08); ctx.fill();
      ctx.restore();
    });
    // body + antennae
    ctx.fillStyle = '#5B3A2E'; ell(ctx, 0, s * 0.05, s * 0.1, s * 0.42); ctx.fill();
    ctx.strokeStyle = '#5B3A2E'; ctx.lineWidth = Math.max(0.8, s * 0.06); ctx.lineCap = 'round';
    [-1, 1].forEach(function (sd) {
      ctx.beginPath(); ctx.moveTo(0, -s * 0.3); ctx.quadraticCurveTo(sd * s * 0.12, -s * 0.6, sd * s * 0.28, -s * 0.66); ctx.stroke();
      ell(ctx, sd * s * 0.29, -s * 0.67, s * 0.05, s * 0.05); ctx.fillStyle = '#5B3A2E'; ctx.fill();
    });
    ctx.restore();
  }

  function drawSpark(ctx, size, color) {
    var s = size / 2, c = colOf(color) ? colOf(color).light : (color || '#FFFFFF');
    ctx.save();
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.quadraticCurveTo(s * 0.14, -s * 0.14, s, 0); ctx.quadraticCurveTo(s * 0.14, s * 0.14, 0, s);
    ctx.quadraticCurveTo(-s * 0.14, s * 0.14, -s, 0); ctx.quadraticCurveTo(-s * 0.14, -s * 0.14, 0, -s);
    ctx.fill();
    ctx.globalAlpha *= 0.55; ctx.beginPath(); ctx.arc(0, 0, s * 0.28, 0, Math.PI * 2); ctx.fillStyle = '#FFFFFF'; ctx.fill();
    ctx.restore();
  }
  function drawStar(ctx, size, color) {
    var col = colOf(color) ? color : null;
    ctx.save();
    if (size >= 14) {
      var sb = bucket(size);
      ctx.scale(size / sb, size / sb);
      cached(ctx, 'star|' + (col || 'gold') + '|' + sb, { x0: -sb * 0.6, y0: -sb * 0.6, x1: sb * 0.6, y1: sb * 0.65 }, function (c) { paintStar(c, sb, col); });
    } else paintStar(ctx, size, col);
    ctx.restore();
  }

  FC.CampArt = {
    COLORS: COLORS, SHAPES: SHAPES, HEAD_TOP: HEAD_TOP, GOLD: GOLD, WOOD: WOOD,
    drawClue: drawClue, clueHeight: clueHeight, clueBox: clueBox,
    drawFlames: drawFlames, drawGlow: drawGlow, drawButterfly: drawButterfly,
    drawSpark: drawSpark, drawStar: drawStar, clearCache: clearCache, _mix: mix
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = FC.CampArt;
})(window.FC = window.FC || {});
