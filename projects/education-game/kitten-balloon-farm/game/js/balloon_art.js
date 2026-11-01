// KB.BalloonArt — code-drawn balloons for Kitten's Balloon Farm (character artist A). See docs/DESIGN.md §5.6.
// Classic script; safe to require() in node (document / OffscreenCanvas are only touched lazily inside draw).
//
// Geometry (all in units of size = body width w, body centred at (0,0)):
//   shape     top      lowest   knot point (string attaches)   bodyH
//   circle   -0.600    +0.595   0.668                           1.195   (latex oval, narrower at the bottom)
//   heart    -0.470    +0.470   0.543                           0.940   (two round lobes, deep notch, rounded tip)
//   star     -0.530    +0.519   0.433 (valley between legs)     1.049   (5 fat rounded points, upright, ~1.1 w wide)
//   square   -0.480    +0.480   0.553                           0.960   (pillow, rounded corners)
//   triangle -0.500    +0.380   0.453                           0.880   (points up, rounded corners)
//   rect     -0.320    +0.320   0.393                           0.640   (wide pillow)
// knotY = attach + 0.073·w (the bottom of the tied knot). With squash the knot is at (0, knotY·sy).
(function (KB) {
  'use strict';

  var PALETTE = {
    red: ['#E84A4A', '#A8282E'], blue: ['#3C8DE8', '#1F5BA8'], yellow: ['#FFD23F', '#C99A12'],
    green: ['#4CC26B', '#2A8343'], orange: ['#FF9A2E', '#C4650C'], purple: ['#9B6BE0', '#6840A8'],
    pink: ['#FF8FC0', '#C9558A'], cream: ['#FFF4DC', '#C9A877']
  };

  function hexRgb(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
  function rgbHex(c) {
    return '#' + c.map(function (v) { var s = Math.max(0, Math.min(255, Math.round(v))).toString(16); return s.length < 2 ? '0' + s : s; }).join('').toUpperCase();
  }
  function mix(a, b, t) { var x = hexRgb(a), y = hexRgb(b); return rgbHex([0, 1, 2].map(function (i) { return x[i] + (y[i] - x[i]) * t; })); }
  function rgba(hex, a) { var c = hexRgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function lum(hex) {
    var c = hexRgb(hex).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) { var la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); }

  var COLORS = {};
  Object.keys(PALETTE).forEach(function (k) {
    var base = PALETTE[k][0], dark = PALETTE[k][1];
    COLORS[k] = {
      base: base, dark: dark,
      light: mix(base, '#FFFFFF', k === 'cream' ? 0.6 : 0.34),   // bevel / gradient light: still clearly the hue
      shade: mix(base, dark, 0.55),                               // cel-shade band
      rim: k === 'cream' ? '#B08F5E' : dark                        // outline
    };
  });

  // ---------------------------------------------------------------- shapes (unit w = 1)
  var GEO = {
    circle:   { top: -0.600, bot: 0.595, attach: 0.595, foil: false },
    heart:    { top: -0.470, bot: 0.470, attach: 0.470, foil: true },
    star:     { top: -0.530, bot: 0.519, attach: 0.360, foil: true },
    square:   { top: -0.480, bot: 0.480, attach: 0.480, foil: true },
    triangle: { top: -0.500, bot: 0.380, attach: 0.380, foil: true },
    rect:     { top: -0.320, bot: 0.320, attach: 0.320, foil: true }
  };
  var KNOT_H = 0.073;
  function geo(shape) { return GEO[shape] || GEO.circle; }

  // rounded polygon through vertices v with corner radii r (arcTo works on any 2D context)
  function roundPoly(ctx, v, r, ox, oy) {
    var n = v.length, m0x = (v[0][0] + v[n - 1][0]) / 2 + ox, m0y = (v[0][1] + v[n - 1][1]) / 2 + oy;
    ctx.moveTo(m0x, m0y);
    for (var i = 0; i < n; i++) {
      var a = v[i], b = v[(i + 1) % n];
      ctx.arcTo(a[0] + ox, a[1] + oy, (a[0] + b[0]) / 2 + ox, (a[1] + b[1]) / 2 + oy, typeof r === 'number' ? r : r[i]);
    }
    ctx.closePath();
  }

  // trace the body outline of `shape` for width w, offset by (ox, oy)
  function trace(ctx, shape, w, ox, oy) {
    ox = ox || 0; oy = oy || 0;
    ctx.beginPath();
    var s = w;
    function P(x, y) { return [x * s + ox, y * s + oy]; }
    var p, q, r;
    switch (shape) {
      case 'heart': {
        p = P(0, -0.25); ctx.moveTo(p[0], p[1]);
        var R = [[0.06, -0.41, 0.16, -0.47, 0.27, -0.47], [0.42, -0.47, 0.515, -0.36, 0.515, -0.2],
          [0.515, -0.01, 0.37, 0.15, 0.2, 0.3], [0.12, 0.375, 0.065, 0.425, 0.04, 0.445]];
        R.forEach(function (c) { var a = P(c[0], c[1]), b = P(c[2], c[3]), d = P(c[4], c[5]); ctx.bezierCurveTo(a[0], a[1], b[0], b[1], d[0], d[1]); });
        q = P(0, 0.485); r = P(-0.04, 0.445); ctx.quadraticCurveTo(q[0], q[1], r[0], r[1]);
        for (var i = R.length - 1; i >= 0; i--) {
          var c = R[i], prev = i > 0 ? R[i - 1] : null;
          var a = P(-c[2], c[3]), b = P(-c[0], c[1]), d = prev ? P(-prev[4], prev[5]) : P(0, -0.25);
          ctx.bezierCurveTo(a[0], a[1], b[0], b[1], d[0], d[1]);
        }
        ctx.closePath();
        break;
      }
      case 'star': {
        var ro = 0.58 * s, ri = 0.31 * s, cy = 0.05 * s, v = [], rad = [];
        for (var k = 0; k < 10; k++) {
          var ang = (-90 + k * 36) * Math.PI / 180, rr = k % 2 ? ri : ro;
          v.push([Math.cos(ang) * rr, Math.sin(ang) * rr + cy]);
          rad.push(k % 2 ? 0.07 * s : 0.1 * s);
        }
        roundPoly(ctx, v, rad, ox, oy);
        break;
      }
      case 'square': {
        var h = 0.48 * s, hw = 0.48 * s;
        roundPoly(ctx, [[-hw, -h], [hw, -h], [hw, h], [-hw, h]], 0.2 * s, ox, oy);
        break;
      }
      case 'rect': {
        roundPoly(ctx, [[-0.5 * s, -0.32 * s], [0.5 * s, -0.32 * s], [0.5 * s, 0.32 * s], [-0.5 * s, 0.32 * s]], 0.16 * s, ox, oy);
        break;
      }
      case 'triangle': {
        // vertices pushed out a little so the rounded result spans top -0.5 / base 0.38 / width 1
        roundPoly(ctx, [[0, -0.66 * s], [0.6 * s, 0.38 * s], [-0.6 * s, 0.38 * s]], 0.13 * s, ox, oy);
        break;
      }
      default: { // circle: latex oval, rounder on top, tapering to the knot
        var C = [[0.28, -0.6, 0.5, -0.38, 0.5, -0.1], [0.5, 0.2, 0.27, 0.5, 0.045, 0.578]];
        p = P(0, -0.6); ctx.moveTo(p[0], p[1]);
        C.forEach(function (c) { var a = P(c[0], c[1]), b = P(c[2], c[3]), d = P(c[4], c[5]); ctx.bezierCurveTo(a[0], a[1], b[0], b[1], d[0], d[1]); });
        q = P(0, 0.6); r = P(-0.045, 0.578); ctx.quadraticCurveTo(q[0], q[1], r[0], r[1]);
        var a1 = P(-0.27, 0.5), b1 = P(-0.5, 0.2), d1 = P(-0.5, -0.1); ctx.bezierCurveTo(a1[0], a1[1], b1[0], b1[1], d1[0], d1[1]);
        var a2 = P(-0.5, -0.38), b2 = P(-0.28, -0.6), d2 = P(0, -0.6); ctx.bezierCurveTo(a2[0], a2[1], b2[0], b2[1], d2[0], d2[1]);
        ctx.closePath();
      }
    }
  }

  // highlight spots (upper-left) per shape, unit coords: [x, y, rx, ry, angleDeg] + small dot [x, y, r]
  var HI = {
    circle:   [[-0.2, -0.32, 0.12, 0.07, -42], [-0.33, -0.12, 0.035]],
    heart:    [[-0.27, -0.29, 0.1, 0.06, -35], [-0.39, -0.13, 0.03]],
    star:     [[-0.12, -0.2, 0.09, 0.05, -55], [-0.33, -0.04, 0.03]],
    square:   [[-0.24, -0.27, 0.12, 0.055, -40], [-0.34, -0.06, 0.03]],
    triangle: [[-0.1, -0.12, 0.085, 0.045, -60], [-0.27, 0.18, 0.026]],
    rect:     [[-0.27, -0.15, 0.13, 0.05, -20], [-0.39, 0.03, 0.028]]
  };

  // the full body (no glow) drawn at (0,0) for width w — used to fill the cache
  function paintBody(ctx, shape, key, w, night) {
    var col = COLORS[key] || COLORS.red, g = geo(shape), lw = Math.max(1.5, 0.034 * w);
    var top = g.top * w, bot = g.bot * w;
    // knot first (the body overlaps its top)
    var ky = g.attach * w;
    ctx.beginPath();
    ctx.moveTo(-0.065 * w, ky + KNOT_H * w);
    ctx.quadraticCurveTo(0, ky - 0.035 * w, 0.065 * w, ky + KNOT_H * w);
    ctx.quadraticCurveTo(0, ky + (KNOT_H + 0.025) * w, -0.065 * w, ky + KNOT_H * w);
    ctx.closePath();
    ctx.fillStyle = col.shade; ctx.fill();
    ctx.lineWidth = lw * 0.8; ctx.lineJoin = 'round'; ctx.strokeStyle = col.rim; ctx.stroke();

    // night: a soft pale rim so balloons stay readable on navy
    if (night > 0) {
      trace(ctx, shape, w);
      ctx.lineWidth = lw * 3; ctx.strokeStyle = rgba(col.light, (0.55 * night).toFixed(3)); ctx.stroke();
    }

    ctx.save();
    trace(ctx, shape, w);
    ctx.clip();
    if (!g.foil) {
      // latex: radial gradient, light upper-left -> true base -> deeper rim
      var rg = ctx.createRadialGradient(-0.2 * w, -0.3 * w, 0.02 * w, -0.05 * w, -0.05 * w, 0.78 * w);
      rg.addColorStop(0, col.light); rg.addColorStop(0.3, col.base); rg.addColorStop(0.72, col.base); rg.addColorStop(1, col.shade);
      ctx.fillStyle = rg; ctx.fillRect(-w, top - 0.1 * w, 2 * w, bot - top + 0.3 * w);
      // a reflected-light crescent near the lower right
      ctx.beginPath();
      ctx.ellipse(0.22 * w, 0.3 * w, 0.17 * w, 0.06 * w, -0.9, 0, Math.PI * 2);
      ctx.fillStyle = rgba(col.light, 0.35); ctx.fill();
    } else {
      // foil: one-step cel bevel — light band along the upper-left edge, shade band along the lower-right edge
      var d = 0.065 * w;
      ctx.fillStyle = col.shade; ctx.fillRect(-w, top - 0.1 * w, 2 * w, bot - top + 0.3 * w);
      ctx.save();
      trace(ctx, shape, w, -d * 0.9, -d * 0.9); ctx.clip();
      ctx.fillStyle = col.light; ctx.fillRect(-w, top - 0.2 * w, 2 * w, bot - top + 0.4 * w);
      trace(ctx, shape, w, d * 0.55, d * 0.55);
      var lg = ctx.createLinearGradient(-0.4 * w, top, 0.4 * w, bot);
      lg.addColorStop(0, mix(col.base, col.light, 0.25)); lg.addColorStop(0.45, col.base); lg.addColorStop(1, mix(col.base, col.shade, 0.35));
      ctx.fillStyle = lg; ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    // outline
    trace(ctx, shape, w);
    ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.strokeStyle = col.rim; ctx.stroke();

    // glossy highlight + small dot (white, compact so the hue is not washed out)
    var h = HI[shape] || HI.circle, a = h[0], b = h[1];
    ctx.save();
    ctx.translate(a[0] * w, a[1] * w); ctx.rotate(a[4] * Math.PI / 180);
    ctx.beginPath(); ctx.ellipse(0, 0, a[2] * w, a[3] * w, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,' + (key === 'cream' || key === 'yellow' ? 0.85 : 0.72) + ')'; ctx.fill();
    ctx.restore();
    ctx.beginPath(); ctx.arc(b[0] * w, b[1] * w, b[2] * w, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill();
  }

  // ---------------------------------------------------------------- offscreen cache
  var cache = {}, cacheN = 0, CACHE_MAX = 160;
  function makeCanvas(wpx, hpx) {
    if (typeof document !== 'undefined' && document.createElement) {
      var c = document.createElement('canvas'); c.width = wpx; c.height = hpx; return c;
    }
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(wpx, hpx);
    return null;
  }
  function ctxScale(ctx) {
    try {
      if (ctx.getTransform) { var m = ctx.getTransform(); var s = Math.sqrt(m.a * m.a + m.b * m.b); if (s > 0) return s; }
    } catch (e) { /* ignore */ }
    return (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  }
  function getSprite(shape, key, bucket, dpr, nightB) {
    var id = shape + '|' + key + '|' + bucket + '|' + dpr + '|' + nightB;
    var e = cache[id];
    if (e) return e;
    var g = geo(shape), pad = 0.06 * bucket + 2;
    var x0 = -0.62 * bucket - pad, y0 = g.top * bucket - pad, x1 = 0.62 * bucket + pad, y1 = (g.attach + KNOT_H + 0.04) * bucket + pad;
    if (shape === 'triangle' || shape === 'star') { x0 -= 0.04 * bucket; x1 += 0.04 * bucket; }
    var cw = Math.ceil((x1 - x0) * dpr), ch = Math.ceil((y1 - y0) * dpr);
    var cv = makeCanvas(cw, ch);
    if (!cv) return null;
    var c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, -x0 * dpr, -y0 * dpr);
    paintBody(c, shape, key, bucket, nightB);
    if (cacheN >= CACHE_MAX) { cache = {}; cacheN = 0; }
    e = cache[id] = { cv: cv, x0: x0, y0: y0, w: x1 - x0, h: y1 - y0, bucket: bucket };
    cacheN++;
    return e;
  }

  function drawGlow(ctx, shape, size, glow) {
    var g = geo(shape), cy = (g.top + g.bot) / 2 * size, R = 0.95 * size * Math.max(1, (g.bot - g.top) * 0.9);
    var rg = ctx.createRadialGradient(0, cy, size * 0.3, 0, cy, R);
    rg.addColorStop(0, 'rgba(255,236,140,' + (0.9 * glow).toFixed(3) + ')');
    rg.addColorStop(0.55, 'rgba(255,214,90,' + (0.5 * glow).toFixed(3) + ')');
    rg.addColorStop(1, 'rgba(255,214,90,0)');
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(0, cy, R, 0, Math.PI * 2); ctx.fill();
    // a crisp warm ring hugging the shape
    ctx.save();
    ctx.scale(1.12, 1.12);
    trace(ctx, shape, size);
    ctx.lineWidth = 0.05 * size; ctx.strokeStyle = 'rgba(255,250,215,' + (0.85 * glow).toFixed(3) + ')'; ctx.stroke();
    ctx.restore();
  }

  function draw(ctx, o) {
    var shape = GEO[o.shape] ? o.shape : 'circle', key = COLORS[o.color] ? o.color : 'red';
    var size = o.size || 118, sx = o.sx == null ? 1 : o.sx, sy = o.sy == null ? 1 : o.sy;
    var glow = o.glow || 0, alpha = o.alpha == null ? 1 : o.alpha, night = o.night || 0;
    if (alpha <= 0) return;
    ctx.save();
    if (alpha < 1) ctx.globalAlpha *= alpha;
    ctx.scale(sx, sy);
    if (glow > 0.01) drawGlow(ctx, shape, size, Math.min(1, glow));
    var dpr = Math.min(3, Math.max(1, Math.round(ctxScale(ctx) * 2) / 2));
    var bucket = Math.max(16, Math.round(size / 8) * 8), nightB = Math.round(Math.min(1, night) * 2) / 2;
    var e = getSprite(shape, key, bucket, dpr, nightB);
    if (e) {
      var k = size / bucket;
      ctx.drawImage(e.cv, e.x0 * k, e.y0 * k, e.w * k, e.h * k);
    } else {
      paintBody(ctx, shape, key, size, nightB); // no canvas factory (tests): draw directly
    }
    ctx.restore();
  }

  function knotY(shape, size) { return (geo(shape).attach + KNOT_H) * size; }
  function bodyH(shape, size) { var g = geo(shape); return (g.bot - g.top) * size; }
  // where text/sprites look centred inside the shape (y offset from the body centre)
  function textY(shape, size) {
    return ({ heart: -0.05, star: 0.06, triangle: 0.1, circle: -0.04 }[shape] || 0) * size;
  }

  var DARK_TEXT = '#1A1210';
  function textColor(color) {
    var c = COLORS[color] || COLORS.red;
    return contrast('#FFFFFF', c.base) >= contrast(DARK_TEXT, c.base) ? '#fff' : DARK_TEXT;
  }

  // little curled latex bits: {x, y, rot, color, life (1 -> 0), size?}
  function drawShreds(ctx, shreds) {
    if (!shreds) return;
    for (var i = 0; i < shreds.length; i++) {
      var s = shreds[i], c = COLORS[s.color] || COLORS.red, r = s.size || 7, a = Math.max(0, Math.min(1, s.life == null ? 1 : s.life));
      if (a <= 0) continue;
      ctx.save();
      ctx.globalAlpha *= a;
      ctx.translate(s.x, s.y); ctx.rotate(s.rot || 0);
      ctx.beginPath();
      ctx.moveTo(-r, 0);
      ctx.quadraticCurveTo(0, -r * 1.3, r, 0);
      ctx.quadraticCurveTo(r * 0.2, -r * 0.45, -r, 0);
      ctx.closePath();
      ctx.fillStyle = c.base; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = c.rim; ctx.stroke();
      ctx.restore();
    }
  }

  // star-burst ring for the pop, t 0..1
  function drawPopFlash(ctx, x, y, size, t, color) {
    if (t < 0 || t > 1) return;
    var c = COLORS[color] || COLORS.red, e = 1 - Math.pow(1 - t, 3), a = 1 - t;
    ctx.save();
    ctx.translate(x, y);
    // white flash disc (first third)
    if (t < 0.35) {
      ctx.beginPath(); ctx.arc(0, 0, size * (0.35 + 0.35 * e), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,' + (0.7 * (1 - t / 0.35)).toFixed(3) + ')'; ctx.fill();
    }
    // ring
    ctx.beginPath(); ctx.arc(0, 0, size * (0.4 + 0.5 * e), 0, Math.PI * 2);
    ctx.lineWidth = size * 0.07 * a + 1; ctx.strokeStyle = rgba(c.light, a); ctx.stroke();
    // rays
    ctx.lineCap = 'round';
    for (var i = 0; i < 10; i++) {
      var ang = i * Math.PI / 5 + 0.3, r0 = size * (0.45 + 0.45 * e), r1 = r0 + size * 0.22 * (1 - e * 0.6) * (i % 2 ? 0.6 : 1);
      ctx.beginPath(); ctx.moveTo(Math.cos(ang) * r0, Math.sin(ang) * r0); ctx.lineTo(Math.cos(ang) * r1, Math.sin(ang) * r1);
      ctx.lineWidth = size * (i % 2 ? 0.035 : 0.05) * a + 0.5;
      ctx.strokeStyle = i % 2 ? rgba('#FFFFFF', a) : rgba(c.base, a);
      ctx.stroke();
    }
    ctx.restore();
  }

  KB.BalloonArt = {
    COLORS: COLORS, SHAPES: Object.keys(GEO),
    draw: draw, knotY: knotY, bodyH: bodyH, textY: textY, textColor: textColor,
    drawShreds: drawShreds, drawPopFlash: drawPopFlash,
    trace: trace,                                  // path of the body outline (e.g. for a custom hit/glow)
    clearCache: function () { cache = {}; cacheN = 0; },
    _contrast: contrast
  };
})(typeof window !== 'undefined' ? (window.KB = window.KB || {}) : (globalThis.KB = globalThis.KB || {}));
