/* Bun's Dino Dig — DD.DigArt (character artist B), DESIGN §3 / §4.2 / §5.2. Everything here is drawn by code on a 2D canvas.
 *
 *   drawThing(ctx, thing, size, opt)   origin = BOTTOM CENTRE, size = the thing's height (px). thing = { kind, color?, shape?,
 *       animal?, text? }; kind egg | eggTop | eggBottom | stone | bone | toy | tablet | dino.
 *       opt = { wob px, glow 0..1, dim 0..1, night 0..1, crack 0..1 (egg), time s, shadow bool (contact shadow) }
 *   thingBox(thing, size) → { w, h, top, bottom }     visible box; top/bottom = y of its top / bottom edge (origin = bottom
 *       centre; top < 0). Every kind is exactly `size` tall except stone rect / square (see SHAPE_BOX) and the egg halves.
 *   drawMound(ctx, mound, opt)          the FRONT of a sand mound, origin = mound bottom centre (draw it AFTER the thing)
 *   drawHoleBack(ctx, mound, opt)       the back of the hole + back sand ring (draw it BEFORE the thing; no-op at dig ≤ 0.3)
 *       mound = { w, h0, dig 0..1, id? }  opt = { glow 0..1, wob px, pop 0..1+, night 0..1, sparkle 0..1, time s }
 *   moundGeom(mound) → { pileTop, hole:{ cx, cy, rx, ry } | null, lipY }   (relative to the mound origin)
 *   moundSurface(mound, x) → y of the front sand surface at x (relative; ≤ 0 is above the ground)
 *   clipBuried(ctx, mound, opt)        optional clip for a buried thing (instead of the §5.2 rect clip; see below)
 *   drawShovel(ctx, angle, size, opt)   kid's spade, origin = blade tip, angle 0 = blade down (handle up); opt { sand 0..1, night }
 *   drawSandBit(ctx, r, rot, opt)       one flung sand clump, origin = centre; opt { night, alpha, seed }
 *   drawShelf(ctx, shelf, opt)          wooden plank shelf in box layout.shelf (plank top = y + h − 30); opt { night, slots bool }
 *   drawIcon(ctx, thing, size)          centred in a size × size box: egg | blob | stone | toy | bone | tablet | number | letter
 *                                       | dots {n} | size {size:'big'|'small', kind:'bone'|'egg', color?} | dino {color}
 *   drawGhostHand(ctx, size, t)         friendly pointing hand, origin = fingertip (finger points UP), t = 0..1 tap phase
 *   Helpers: pal(color), PALETTE, SAND, FONT, SHAPE_BOX, TOY_W, clearCache().
 * Node-safe at load (no DOM). Path2D objects are cached per key; without Path2D (node tests) paths are rebuilt on the ctx.
 * Internal drawing of things is in a 100-unit box (y −100 … 0) scaled by size / 100.
 */
(function (DD) {
  'use strict';

  var FALLBACK_PALETTE = {
    red:    { base: '#E84A4A', dark: '#A8282E', light: '#F7A0A0' },
    blue:   { base: '#3C8DE8', dark: '#1F5BA8', light: '#A6CCF5' },
    yellow: { base: '#FFD23F', dark: '#C99A12', light: '#FFEB9C' },
    green:  { base: '#4CC26B', dark: '#2A8343', light: '#A8E6B8' },
    orange: { base: '#FF9A2E', dark: '#C4650C', light: '#FFCB8E' },
    purple: { base: '#8E44AD', dark: '#6840A8', light: '#D2BDF3' },
    pink:   { base: '#FF8FC0', dark: '#C9558A', light: '#FFCCE2' }
  };
  var SAND = { base: '#E9CF9A', shade: '#CFAE72', line: '#A9834A', hi: '#F6E3B9', hole: '#8E6A3E', holeDeep: '#5E4426' };
  var FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", system-ui, sans-serif';
  var EYE = '#2F2A3A', CHEEK = '#F6B1A0', NIGHT = '#34416C';
  var TAU = Math.PI * 2, LW = 3.6;   // outline width in the 100-unit box (≈ 4 px at item 112)

  // ---------------------------------------------------------------- colour helpers
  function rgb(h) { h = String(h).replace('#', ''); return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]; }
  function mix(a, b, t) {
    var A = rgb(a), B = rgb(b), o = '#';
    for (var i = 0; i < 3; i++) { var v = Math.round(A[i] + (B[i] - A[i]) * t); o += (v < 16 ? '0' : '') + v.toString(16); }
    return o.toUpperCase();
  }
  function clamp01(v) { v = +v || 0; return v < 0 ? 0 : v > 1 ? 1 : v; }
  function smooth01(v) { v = clamp01(v); return v * v * (3 - 2 * v); }
  function nowSec() { return (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) / 1000; }
  function hash(s) { var h = 7; s = String(s == null ? '' : s); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h % 1000) / 1000; }

  // night tint: every colour drawn goes through T(); `night` is set per draw call (0 = untouched)
  // Night: THINGS (answers) only take a light 12 % blue mix and keep their highlights, so red / orange / yellow stay
  // themselves; scene props (shelf, shovel) take 42 %; the mound sand has its own warm "lantern-lit" night table (SAND_N).
  // `dimV` (a wrong thing left in its hole): desaturates toward a warm grey of the SAME lightness (outlines stay dark, so the
  // shape still reads) and lifts a little toward sand-grey — clearly "not this one", never see-through.
  var night = 0, dimV = 0, tMode = 'scene', tintCache = {}, DIM = '#C9BCA4';
  function hiN() { return tMode === 'thing' ? 0 : night; }   // how much night dims highlights
  function dimCol(hex, d) {
    var c = rgb(hex), L = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
    var gq = function (v) { v = Math.round(Math.max(0, Math.min(255, v))); return (v < 16 ? '0' : '') + v.toString(16); };
    var grey = ('#' + gq(L + 7) + gq(L + 2) + gq(L - 9)).toUpperCase();
    return mix(mix(hex, grey, 0.86 * d), DIM, 0.22 * d);
  }
  function T(hex) {
    if (!(night > 0.01) && !(dimV > 0.01)) return hex;
    var n = Math.round(night * 20), d = Math.round(dimV * 20), k = hex + tMode + n + '/' + d, v = tintCache[k];
    if (!v) {
      v = n ? mix(hex, NIGHT, (tMode === 'thing' ? 0.12 : 0.42) * n / 20) : hex;
      if (d) v = dimCol(v, d / 20);
      tintCache[k] = v;
    }
    return v;
  }
  function TA(hex, a) { var c = rgb(T(hex)); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (+a).toFixed(3) + ')'; }
  function lum(h) { var c = rgb(h).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
  function lineOf(c) { return lum(c.base) > 0.5 ? mix(c.dark, '#4A3200', 0.5) : c.dark; }   // yellow: a darker outline (#8A6609) so it reads on sand
  // sand by day (DESIGN §3) and by night (warm lantern-lit; ΔE ≥ 47 to every answer colour at night, ≥ 32 to the bone)
  var SAND_N = { base: '#917C66', shade: '#76634F', line: '#4E3F2E', hi: '#B59C7C', hole: '#5E4A34', holeDeep: '#33271B' };
  function S(name) { return night > 0.01 ? mix(SAND[name], SAND_N[name], Math.round(night * 20) / 20) : SAND[name]; }
  function SA(name, a) { var c = rgb(S(name)); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (+a).toFixed(3) + ')'; }
  function pal(c) {
    if (!c) return null;
    var P = DD.PALETTE || FALLBACK_PALETTE, p = (P && P[c]) || FALLBACK_PALETTE[c];
    if (p && typeof p === 'object' && p.base) return { base: p.base, dark: p.dark || mix(p.base, '#000000', 0.35), light: p.light || mix(p.base, '#FFFFFF', 0.45) };
    if (typeof c === 'string' && /^#[0-9A-Fa-f]{6}$/.test(c)) return { base: c, dark: mix(c, '#3A2A1A', 0.45), light: mix(c, '#FFFFFF', 0.5) };
    return null;
  }
  function shadeOf(c) { return mix(c.base, c.dark, 0.42); }

  // ---------------------------------------------------------------- paths (Path2D cache with a ctx fallback)
  var cache = {}, cacheN = 0, MAX_CACHE = 400;
  function P2(key, build) {
    if (typeof Path2D === 'undefined') return null;
    var p = cache[key];
    if (!p) {
      if (cacheN > MAX_CACHE) { cache = {}; cacheN = 0; }
      p = cache[key] = new Path2D(); build(p); cacheN++;
    }
    return p;
  }
  function clearCache() { cache = {}; cacheN = 0; tintCache = {}; }
  function fillK(ctx, key, build, style) { if (style) ctx.fillStyle = style; var p = P2(key, build); if (p) ctx.fill(p); else { ctx.beginPath(); build(ctx); ctx.fill(); } }
  function strokeK(ctx, key, build, style, lw) {
    if (style) ctx.strokeStyle = style; if (lw) ctx.lineWidth = lw;
    var p = P2(key, build); if (p) ctx.stroke(p); else { ctx.beginPath(); build(ctx); ctx.stroke(); }
  }
  function clipK(ctx, key, build) { var p = P2(key, build); if (p) ctx.clip(p); else { ctx.beginPath(); build(ctx); ctx.clip(); } }
  function rr(p, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    p.moveTo(x + r, y); p.lineTo(x + w - r, y); p.arcTo(x + w, y, x + w, y + r, r);
    p.lineTo(x + w, y + h - r); p.arcTo(x + w, y + h, x + w - r, y + h, r);
    p.lineTo(x + r, y + h); p.arcTo(x, y + h, x, y + h - r, r);
    p.lineTo(x, y + r); p.arcTo(x, y, x + r, y, r); p.closePath();
  }
  function roundPoly(p, pts, r) {   // closed polygon with rounded corners (r number or per-vertex array)
    var n = pts.length, a = pts[n - 1], b = pts[0];
    p.moveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    for (var i = 0; i < n; i++) {
      var q = pts[i], nx = pts[(i + 1) % n];
      p.arcTo(q[0], q[1], (q[0] + nx[0]) / 2, (q[1] + nx[1]) / 2, Array.isArray(r) ? r[i] : r);
    }
    p.closePath();
  }
  function circ(p, x, y, r) { p.moveTo(x + r, y); p.arc(x, y, r, 0, TAU); }
  function ell(p, x, y, rx, ry, rot) { p.moveTo(x + rx * Math.cos(rot || 0), y + rx * Math.sin(rot || 0)); p.ellipse(x, y, rx, ry, rot || 0, 0, TAU); }

  // one-step cel shading: shade colour everywhere, base colour on a copy nudged up-left, soft highlight upper-left
  function celFill(ctx, key, build, base, shade, hx, hy, hr, dx, dy) {
    ctx.save();
    clipK(ctx, key, build);
    fillK(ctx, key, build, T(shade));
    ctx.translate(dx == null ? -4.5 : dx, dy == null ? -4 : dy); fillK(ctx, key, build, T(base)); ctx.translate(-(dx == null ? -4.5 : dx), -(dy == null ? -4 : dy));
    if (hr > 0) {
      var g = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr);
      g.addColorStop(0, 'rgba(255,255,255,' + (0.55 * (1 - 0.6 * hiN())).toFixed(3) + ')'); g.addColorStop(0.5, 'rgba(255,255,255,0.16)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(hx - hr, hy - hr, hr * 2, hr * 2);
    }
    ctx.restore();
  }
  function shinyDot(ctx, x, y, rx, ry, rot, a) {
    ctx.fillStyle = 'rgba(255,255,255,' + ((a || 0.75) * (1 - 0.5 * hiN())).toFixed(3) + ')';
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, TAU); ctx.fill();
  }
  function eye(ctx, x, y, r) {
    ctx.fillStyle = T(EYE); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(x - r * 0.32, y - r * 0.36, r * 0.38, 0, TAU); ctx.fill();
  }
  function cheek(ctx, x, y, r) { ctx.fillStyle = TA(CHEEK, 0.75); ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.72, 0, 0, TAU); ctx.fill(); }

  // ================================================================ EGG
  function eggB(p) {
    p.moveTo(0, 0); p.bezierCurveTo(22, 0, 39, -16, 39, -40); p.bezierCurveTo(39, -70, 22, -100, 0, -100);
    p.bezierCurveTo(-22, -100, -39, -70, -39, -40); p.bezierCurveTo(-39, -16, -22, 0, 0, 0); p.closePath();
  }
  var ZIG = (function () { var a = []; for (var i = 0; i <= 8; i++) a.push([-46 + i * 11.5, -50 + (i % 2 ? -8 : 5)]); return a; })();
  function zigTopB(p) { p.moveTo(-60, -120); p.lineTo(60, -120); p.lineTo(60, ZIG[8][1]); for (var i = 8; i >= 0; i--) p.lineTo(ZIG[i][0], ZIG[i][1]); p.lineTo(-60, ZIG[0][1]); p.closePath(); }
  function zigBotB(p) { p.moveTo(-60, ZIG[0][1]); for (var i = 0; i <= 8; i++) p.lineTo(ZIG[i][0], ZIG[i][1]); p.lineTo(60, ZIG[8][1]); p.lineTo(60, 10); p.lineTo(-60, 10); p.closePath(); }
  var SPECK_L = [[-13, -83, 5], [11, -71, 6.5], [-21, -55, 5.5], [19, -45, 4.5], [-6, -31, 7], [21, -20, 4], [-25, -24, 3.5], [3, -55, 3]];
  var SPECK_D = [[4, -90, 2.2], [-15, -67, 2.6], [23, -62, 2.2], [6, -46, 2.6], [-28, -40, 2.1], [11, -28, 2.6], [-11, -13, 2.2], [-4, -76, 1.8]];
  function drawEgg(ctx, c, part, crack) {
    var shade = shadeOf(c);
    ctx.save();
    if (part === 'top') clipK(ctx, 'zigT', zigTopB); else if (part === 'bottom') clipK(ctx, 'zigB', zigBotB);
    celFill(ctx, 'egg', eggB, c.base, shade, -14, -74, 30, -5, -4);
    ctx.save(); clipK(ctx, 'egg', eggB);
    var i, s;
    ctx.fillStyle = T(c.light);
    for (i = 0; i < SPECK_L.length; i++) { s = SPECK_L[i]; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.ellipse(s[0], s[1], s[2], s[2] * 0.82, 0.4, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 0.55; ctx.fillStyle = T(c.dark);
    for (i = 0; i < SPECK_D.length; i++) { s = SPECK_D[i]; ctx.beginPath(); ctx.arc(s[0], s[1], s[2], 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
    if (part === 'bottom') {   // inside of the shell under the jagged edge
      ctx.fillStyle = T('#FBF3E0'); ctx.beginPath(); ctx.ellipse(0, -47, 37, 10, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = T('#E7DAC0'); ctx.beginPath(); ctx.ellipse(0, -45, 33, 6, 0, 0, TAU); ctx.fill();
    }
    shinyDot(ctx, -16, -76, 6.5, 13, 0.38, 0.7); shinyDot(ctx, -8, -90, 2.6, 2.6, 0, 0.8);
    if (crack > 0 && !part) {   // the zig-zag crack grows from the middle outward
      var lim = 46 * clamp01(crack);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      for (var pass = 0; pass < 2; pass++) {
        ctx.beginPath();
        var started = false;
        for (i = 0; i <= 8; i++) {
          var q = ZIG[i], x = q[0], y = q[1];
          if (Math.abs(x) > lim) {
            var pq = i > 0 ? ZIG[i - 1] : null, nq = i < 8 ? ZIG[i + 1] : null, src = x < 0 ? nq : pq;
            if (!src || Math.abs(src[0]) > lim) continue;
            var t = (lim - Math.abs(src[0])) / (Math.abs(x) - Math.abs(src[0]));
            x = src[0] + (x - src[0]) * t; y = src[1] + (y - src[1]) * t;
          }
          if (!started) { ctx.moveTo(x, y + pass * 2.2); started = true; } else ctx.lineTo(x, y + pass * 2.2);
        }
        if (pass === 0) { ctx.strokeStyle = T(c.dark); ctx.lineWidth = 3.6; } else { ctx.strokeStyle = TA('#FFFFFF', 0.6); ctx.lineWidth = 1.6; }
        ctx.stroke();
      }
    }
    ctx.restore();
    strokeK(ctx, 'egg', eggB, T(lineOf(c)), LW);
    if (part) {   // the jagged edge outline
      ctx.save(); clipK(ctx, 'egg', eggB);
      ctx.beginPath(); for (i = 0; i <= 8; i++) { if (i) ctx.lineTo(ZIG[i][0], ZIG[i][1]); else ctx.moveTo(ZIG[i][0], ZIG[i][1]); }
      ctx.lineJoin = 'round'; ctx.strokeStyle = T(lineOf(c)); ctx.lineWidth = LW * 2; ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  // ================================================================ STONES
  // visible box per shape in the 100-unit box (w, h); all stand on y = 0. `c` = carving centre, `sw` = ammonite swirl spot.
  var SHAPE_BOX = {
    circle: { w: 100, h: 100, c: [0, -50], sw: [10, -30, 10] },
    square: { w: 96, h: 96, c: [0, -48], sw: [12, -26, 10] },
    triangle: { w: 118, h: 100, c: [0, -36], sw: [0, -22, 9] },
    star: { w: 100, h: 100, c: [0, -45], sw: [0, -40, 8] },
    heart: { w: 104, h: 100, c: [0, -58], sw: [0, -42, 9] },
    rect: { w: 132, h: 88, c: [0, -44], sw: [26, -26, 10] },
    diamond: { w: 92, h: 100, c: [0, -60], sw: [0, -38, 8] },
    oval: { w: 74, h: 100, c: [0, -50], sw: [6, -30, 9] }
  };
  // a friendly 5-point star with its arms raised a little (tips 25° above horizontal instead of 18°) so the arm tips sit at
  // 32 % depth: they stay visible when only the top 36–42 % peeks out of the sand (a regular star hides them at 38 %)
  var STAR_PTS = (function () {
    var R = 100 / (1 + Math.sin(54 * Math.PI / 180)), cy = -100 + R, a = [];
    var deg = [-90, -57.5, -25, 14.5, 54, 90, 126, 165.5, 205, 237.5];
    for (var i = 0; i < 10; i++) { var an = deg[i] * Math.PI / 180, r = i % 2 ? R * 0.5 : R; a.push([Math.cos(an) * r, cy + Math.sin(an) * r]); }
    return a;
  })();
  var SHAPE_B = {
    circle: function (p) { circ(p, 0, -50, 50); },
    oval: function (p) { ell(p, 0, -50, 37, 50); },
    square: function (p) { rr(p, -48, -96, 96, 96, 13); },
    rect: function (p) { rr(p, -66, -88, 132, 88, 12); },
    triangle: function (p) { roundPoly(p, [[0, -100], [59, 0], [-59, 0]], [9, 11, 11]); },
    diamond: function (p) { roundPoly(p, [[0, -100], [46, -64], [0, 0], [-46, -64]], [7, 8, 9, 8]); },
    star: function (p) { roundPoly(p, STAR_PTS, [5, 3, 5, 3, 5, 3, 5, 3, 5, 3]); },
    heart: function (p) {
      p.moveTo(0, 0); p.bezierCurveTo(-20, -18, -52, -38, -52, -68); p.bezierCurveTo(-52, -88, -38, -100, -25, -100);
      p.bezierCurveTo(-12, -100, -3, -92, 0, -80); p.bezierCurveTo(3, -92, 12, -100, 25, -100);
      p.bezierCurveTo(38, -100, 52, -88, 52, -68); p.bezierCurveTo(52, -38, 20, -18, 0, 0); p.closePath();
    }
  };
  var STONE_GREY = { base: '#B9B1A2', dark: '#7C7466', light: '#E2DCD0' };
  function drawStone(ctx, shape, c) {
    var b = SHAPE_B[shape] || SHAPE_B.circle, bx = SHAPE_BOX[shape] || SHAPE_BOX.circle, key = 'st:' + shape;
    c = c || STONE_GREY;
    var cx = bx.c[0], cy = bx.c[1];
    celFill(ctx, key, b, c.base, shadeOf(c), -bx.w * 0.18, -bx.h * 0.72, bx.h * 0.36, -5, -4.5);
    // carved rim: an inner groove (dark) with a light bevel just under it
    var k = 0.76;
    ctx.save(); clipK(ctx, key, b);
    ctx.translate(cx, cy + 1.6); ctx.scale(k, k); ctx.translate(-cx, -cy);   // light bevel just under the groove
    strokeK(ctx, key, b, TA('#FFFFFF', 0.45 * (1 - 0.5 * hiN())), 2.4 / k);
    ctx.restore();
    ctx.save(); clipK(ctx, key, b);
    ctx.translate(cx, cy); ctx.scale(k, k); ctx.translate(-cx, -cy);         // the dark groove
    strokeK(ctx, key, b, TA(c.dark, 0.55), 2.6 / k);
    ctx.restore();
    // a tiny ammonite swirl (low on the stone so the top silhouette stays clean)
    var sw = bx.sw, R = sw[2];
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    for (var i = 0; i <= 40; i++) { var t = i / 40, an = t * 3.4 * Math.PI, r = R * (0.12 + 0.88 * t); var x = sw[0] + Math.cos(an) * r, y = sw[1] + Math.sin(an) * r; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.strokeStyle = TA(c.dark, 0.6); ctx.lineWidth = 2.2; ctx.stroke();
    ctx.translate(0.9, 1.1); ctx.strokeStyle = TA('#FFFFFF', 0.3 * (1 - 0.5 * hiN())); ctx.lineWidth = 1.1; ctx.stroke();
    ctx.restore();
    // pits + a soft upper-left shine (stones are smooth, not glossy) — both kept inside the silhouette
    ctx.save(); clipK(ctx, key, b);
    ctx.fillStyle = TA(c.dark, 0.35);
    var pits = [[-0.16, -0.36, 1.8], [0.16, -0.62, 1.5], [-0.24, -0.2, 1.4]];
    for (var j = 0; j < pits.length; j++) { ctx.beginPath(); ctx.arc(pits[j][0] * bx.w, cy + (pits[j][1] + 0.5) * bx.h * 0.7, pits[j][2], 0, TAU); ctx.fill(); }
    var SH = { triangle: [-8, -58], diamond: [-12, -70], star: [-7, -66], heart: [-26, -80] }[shape] || [-bx.w * 0.22, -bx.h * 0.74];
    shinyDot(ctx, SH[0], SH[1], 6, 3, -0.6, 0.55);
    ctx.restore();
    strokeK(ctx, key, b, T(lineOf(c)), LW);
  }

  // ================================================================ BONE
  var BONE = { base: '#F3E6C8', line: '#A8946A', shade: '#DCC9A0' };
  function boneB(p) { rr(p, -10.5, -86, 21, 72, 6); circ(p, -11, -86, 13); circ(p, 11, -86, 13); circ(p, -11, -14, 13); circ(p, 11, -14, 13); }
  function drawBone(ctx) {
    ctx.save();
    ctx.translate(0, -50); ctx.rotate(0.2); ctx.translate(0, 50);
    strokeK(ctx, 'bone', boneB, T(mix(BONE.line, '#4A3B26', 0.55 * night)), LW * 2);
    celFill(ctx, 'bone', boneB, BONE.base, BONE.shade, -14, -88, 18, -4, -3);
    ctx.strokeStyle = TA(BONE.line, 0.55); ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(4, -64); ctx.lineTo(1, -58); ctx.lineTo(4, -53); ctx.moveTo(-3, -36); ctx.lineTo(0, -31); ctx.stroke();
    shinyDot(ctx, -5, -62, 2.4, 12, 0, 0.6);
    ctx.restore();
  }

  // ================================================================ TOYS (painted wooden figurines)
  var WOOD = { base: '#D9AC72', line: '#9A6D3C', top: '#EBC690' };
  var TOY = {
    duck: { base: '#F7D35A', line: '#7E5A08', w: 70 },
    cat: { base: '#B0AAB6', line: '#6E6878', w: 70 },
    dog: { base: '#C99160', line: '#7F5432', w: 78 },
    cow: { base: '#F7F2EA', line: '#8D857A', w: 76 },
    pig: { base: '#F5AAB8', line: '#B9667A', w: 70 },
    frog: { base: '#7BC66A', line: '#3F8A3A', w: 70 },
    lion: { base: '#EFC169', line: '#A9772A', w: 72 },
    elephant: { base: '#A7B3C4', line: '#647187', w: 88 }
  };
  var TOY_W = {}; for (var tk in TOY) TOY_W[tk] = TOY[tk].w / 100;
  function bodyB(p) { p.moveTo(-23, -12); p.bezierCurveTo(-28, -30, -25, -48, -12, -55); p.lineTo(12, -55); p.bezierCurveTo(25, -48, 28, -30, 23, -12); p.closePath(); }
  function baseB(p) { rr(p, -34, -15, 68, 15, 6); }
  function headB(p) { circ(p, 0, -72, 22); }
  function piece(ctx, key, build, fill, line, lw) { fillK(ctx, key, build, T(fill)); strokeK(ctx, key, build, T(line), lw || LW); }
  function drawToy(ctx, animal) {
    var A = TOY[animal] || TOY.duck, base = A.base, line = A.line, shade = mix(base, line, 0.35);
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // wooden stand
    celFill(ctx, 'toy:base', baseB, WOOD.base, mix(WOOD.base, WOOD.line, 0.35), -18, -14, 10, -3, -2);
    strokeK(ctx, 'toy:base', baseB, T(WOOD.line), LW * 0.9);
    ctx.fillStyle = T(WOOD.top); ctx.beginPath(); ctx.ellipse(0, -13.2, 30, 2.4, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = TA(WOOD.line, 0.45); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-26, -6); ctx.quadraticCurveTo(-8, -9, 10, -5); ctx.moveTo(14, -9); ctx.quadraticCurveTo(22, -8, 28, -6); ctx.stroke();

    // things BEHIND the head (ears / mane)
    switch (animal) {
      case 'elephant':
        piece(ctx, 'el:earL', function (p) { ell(p, -27, -74, 16, 20, 0.15); }, base, line);
        piece(ctx, 'el:earR', function (p) { ell(p, 27, -74, 16, 20, -0.15); }, base, line);
        ctx.fillStyle = T('#EBBAC2'); ctx.beginPath(); ell(ctx,-28, -73, 10, 13, 0.15); ell(ctx,28, -73, 10, 13, -0.15); ctx.fill();
        break;
      case 'lion': {
        var mane = function (p) {
          var n = 13; p.moveTo(29, -72);
          for (var i = 1; i <= n; i++) { var a0 = (i - 0.5) / n * TAU, a1 = i / n * TAU; p.quadraticCurveTo(Math.cos(a0) * 35, -72 + Math.sin(a0) * 33, Math.cos(a1) * 29, -72 + Math.sin(a1) * 27.5); }
          p.closePath();
        };
        celFill(ctx, 'lion:mane', mane, '#C8742F', '#A65A20', -12, -90, 14, -3, -3);
        strokeK(ctx, 'lion:mane', mane, T('#8A4A1A'), LW);
        piece(ctx, 'lion:earL', function (p) { circ(p, -15, -93, 6.5); }, base, line);
        piece(ctx, 'lion:earR', function (p) { circ(p, 15, -93, 6.5); }, base, line);
        break;
      }
      case 'cat':
        piece(ctx, 'cat:earL', function (p) { roundPoly(p, [[-21, -82], [-19, -101], [-5, -90]], 3); }, base, line);
        piece(ctx, 'cat:earR', function (p) { roundPoly(p, [[21, -82], [19, -101], [5, -90]], 3); }, base, line);
        ctx.fillStyle = T('#F2C1BC'); ctx.beginPath(); ctx.moveTo(-17, -86); ctx.lineTo(-17, -96); ctx.lineTo(-9, -89); ctx.closePath(); ctx.moveTo(17, -86); ctx.lineTo(17, -96); ctx.lineTo(9, -89); ctx.closePath(); ctx.fill();
        break;
      case 'pig':
        piece(ctx, 'pig:earL', function (p) { roundPoly(p, [[-20, -82], [-21, -100], [-6, -91]], 3); }, '#EE97A8', line);
        piece(ctx, 'pig:earR', function (p) { roundPoly(p, [[20, -82], [21, -100], [6, -91]], 3); }, '#EE97A8', line);
        break;
      case 'cow':
        piece(ctx, 'cow:hornL', function (p) { p.moveTo(-12, -90); p.quadraticCurveTo(-22, -94, -19, -101); p.quadraticCurveTo(-13, -98, -6, -93); p.closePath(); }, '#EFE0B6', '#A6936A');
        piece(ctx, 'cow:hornR', function (p) { p.moveTo(12, -90); p.quadraticCurveTo(22, -94, 19, -101); p.quadraticCurveTo(13, -98, 6, -93); p.closePath(); }, '#EFE0B6', '#A6936A');
        piece(ctx, 'cow:earL', function (p) { ell(p, -26, -80, 10, 5.5, 0.35); }, base, line);
        piece(ctx, 'cow:earR', function (p) { ell(p, 26, -80, 10, 5.5, -0.35); }, base, line);
        ctx.fillStyle = T('#F2B9AC'); ctx.beginPath(); ell(ctx,-26, -80, 6, 2.6, 0.35); ell(ctx,26, -80, 6, 2.6, -0.35); ctx.fill();
        break;
      case 'duck':
        piece(ctx, 'duck:tuft', function (p) { p.moveTo(-4, -92); p.quadraticCurveTo(-8, -102, 0, -101); p.quadraticCurveTo(2, -95, 3, -92); p.moveTo(2, -92); p.quadraticCurveTo(6, -101, 11, -99); p.quadraticCurveTo(8, -95, 7, -91); }, base, line, LW * 0.8);
        break;
      case 'frog':
        break;
    }

    // body
    celFill(ctx, 'toy:body', bodyB, base, shade, -10, -46, 14, -4, -3);
    strokeK(ctx, 'toy:body', bodyB, T(line), LW);
    var belly = animal === 'frog' ? '#CBEAA9' : animal === 'cow' ? '#FFFFFF' : mix(base, '#FFFFFF', 0.5);
    ctx.fillStyle = T(belly); ctx.beginPath(); ctx.ellipse(0, -30, 12, 13, 0, 0, TAU); ctx.fill();
    if (animal === 'cow') { ctx.fillStyle = T('#5B514C'); ctx.beginPath(); ctx.ellipse(-17, -36, 6, 9, 0.3, 0, TAU); ctx.fill(); }
    // arms / wings
    var armC = animal === 'duck' ? mix(base, line, 0.2) : base;
    piece(ctx, 'toy:armL', function (p) { ell(p, -22, -34, 6, 11, 0.3); }, armC, line, LW * 0.8);
    piece(ctx, 'toy:armR', function (p) { ell(p, 22, -34, 6, 11, -0.3); }, armC, line, LW * 0.8);
    // feet
    var footC = animal === 'duck' ? '#F39A45' : mix(base, line, 0.15), footL = animal === 'duck' ? '#B5621C' : line;
    piece(ctx, 'toy:feet', function (p) { ell(p, -10, -14, 8, 4, 0); ell(p, 10, -14, 8, 4, 0); }, footC, footL, LW * 0.75);

    // head
    var hb = animal === 'frog' ? function (p) { ell(p, 0, -70, 26, 18); } : animal === 'dog' ? function (p) { ell(p, 0, -72, 22, 21); } : headB;
    var hk = animal === 'frog' ? 'frog:head' : animal === 'dog' ? 'dog:head' : 'toy:head';
    celFill(ctx, hk, hb, base, shade, -9, -84, 14, -4, -3.5);
    strokeK(ctx, hk, hb, T(line), LW);

    // faces
    switch (animal) {
      case 'duck':
        eye(ctx, -8, -77, 3.6); eye(ctx, 8, -77, 3.6); cheek(ctx, -15, -67, 3.6); cheek(ctx, 15, -67, 3.6);
        piece(ctx, 'duck:bill', function (p) { p.moveTo(-15, -67); p.bezierCurveTo(-14, -73, 14, -73, 15, -67); p.bezierCurveTo(14, -59, -14, -59, -15, -67); p.closePath(); }, '#F39A45', '#B5621C', LW * 0.85);
        ctx.strokeStyle = T('#B5621C'); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-11, -66.5); ctx.quadraticCurveTo(0, -64, 11, -66.5); ctx.stroke();
        shinyDot(ctx, -7, -69.5, 4, 1.4, 0, 0.6);
        break;
      case 'cat':
        ctx.strokeStyle = TA(line, 0.7); ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(-5, -93); ctx.lineTo(-4, -87); ctx.moveTo(0, -94); ctx.lineTo(0, -87); ctx.moveTo(5, -93); ctx.lineTo(4, -87); ctx.stroke();
        eye(ctx, -8, -74, 3.6); eye(ctx, 8, -74, 3.6); cheek(ctx, -14, -65, 3.6); cheek(ctx, 14, -65, 3.6);
        ctx.fillStyle = T('#E98E9A'); ctx.beginPath(); ctx.moveTo(-3, -68); ctx.lineTo(3, -68); ctx.lineTo(0, -65); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = T(EYE); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(0, -65); ctx.quadraticCurveTo(-3, -61, -6, -63); ctx.moveTo(0, -65); ctx.quadraticCurveTo(3, -61, 6, -63); ctx.stroke();
        ctx.strokeStyle = TA(line, 0.8); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(-9, -66); ctx.lineTo(-21, -68); ctx.moveTo(-9, -64); ctx.lineTo(-20, -62); ctx.moveTo(9, -66); ctx.lineTo(21, -68); ctx.moveTo(9, -64); ctx.lineTo(20, -62); ctx.stroke();
        break;
      case 'dog':
        ctx.fillStyle = T(mix(base, line, 0.45)); ctx.beginPath(); ctx.ellipse(8, -76, 7, 6.5, 0, 0, TAU); ctx.fill();   // eye patch
        eye(ctx, -8, -75, 3.6); eye(ctx, 8, -75, 3.6); cheek(ctx, -14, -63, 3.4); cheek(ctx, 14, -63, 3.4);
        ctx.fillStyle = T(mix(base, '#FFFFFF', 0.45)); ctx.beginPath(); ctx.ellipse(0, -63, 10, 7.5, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = T('#3E2E26'); ctx.beginPath(); ctx.ellipse(0, -67, 4.6, 3.4, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = T('#3E2E26'); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -64); ctx.lineTo(0, -61); ctx.quadraticCurveTo(-3, -58, -6, -60); ctx.moveTo(0, -61); ctx.quadraticCurveTo(3, -58, 6, -60); ctx.stroke();
        // floppy ears hang in FRONT of the head sides
        piece(ctx, 'dog:earL', function (p) { p.moveTo(-14, -90); p.bezierCurveTo(-30, -92, -33, -72, -27, -60); p.bezierCurveTo(-23, -55, -17, -60, -18, -68); p.bezierCurveTo(-19, -76, -16, -84, -14, -90); p.closePath(); }, '#8A5A36', '#5E3A1E');
        piece(ctx, 'dog:earR', function (p) { p.moveTo(14, -90); p.bezierCurveTo(30, -92, 33, -72, 27, -60); p.bezierCurveTo(23, -55, 17, -60, 18, -68); p.bezierCurveTo(19, -76, 16, -84, 14, -90); p.closePath(); }, '#8A5A36', '#5E3A1E');
        break;
      case 'cow':
        ctx.save(); clipK(ctx, 'toy:head', headB);
        ctx.fillStyle = T('#5B514C'); ctx.beginPath(); ctx.ellipse(-12, -84, 9, 7, 0.4, 0, TAU); ctx.fill();
        ctx.restore();
        eye(ctx, -8, -76, 3.6); eye(ctx, 8, -76, 3.6);
        piece(ctx, 'cow:muzzle', function (p) { ell(p, 0, -63, 15, 9); }, '#F2B9AC', '#C07E70', LW * 0.8);
        ctx.fillStyle = T('#B86A5E'); ctx.beginPath(); ell(ctx,-5, -64, 2.2, 1.6, 0); ell(ctx,5, -64, 2.2, 1.6, 0); ctx.fill();
        ctx.strokeStyle = T('#B86A5E'); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-4, -59); ctx.quadraticCurveTo(0, -57, 4, -59); ctx.stroke();
        break;
      case 'pig':
        eye(ctx, -9, -77, 3.5); eye(ctx, 9, -77, 3.5); cheek(ctx, -15, -66, 3.6); cheek(ctx, 15, -66, 3.6);
        piece(ctx, 'pig:snout', function (p) { ell(p, 0, -66, 10.5, 7.5); }, '#EF90A3', '#B9667A', LW * 0.8);
        ctx.fillStyle = T('#B9667A'); ctx.beginPath(); ell(ctx,-3.6, -66, 1.9, 2.8, 0); ell(ctx,3.6, -66, 1.9, 2.8, 0); ctx.fill();
        ctx.strokeStyle = T('#8F4458'); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-4, -56); ctx.quadraticCurveTo(0, -54, 4, -56); ctx.stroke();
        break;
      case 'frog':
        piece(ctx, 'frog:bumpL', function (p) { circ(p, -13, -85, 9.5); }, base, line);
        piece(ctx, 'frog:bumpR', function (p) { circ(p, 13, -85, 9.5); }, base, line);
        ctx.fillStyle = T('#FFFFFF'); ctx.beginPath(); circ(ctx,-13, -86, 6.5); circ(ctx,13, -86, 6.5); ctx.fill();
        eye(ctx, -12, -86, 3.8); eye(ctx, 14, -86, 3.8);
        cheek(ctx, -17, -68, 3.6); cheek(ctx, 17, -68, 3.6);
        ctx.strokeStyle = T('#2F6A2C'); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-14, -70); ctx.quadraticCurveTo(0, -60, 14, -70); ctx.stroke();
        ctx.fillStyle = T('#2F6A2C'); ctx.beginPath(); circ(ctx,-3, -76, 1.1); circ(ctx,3, -76, 1.1); ctx.fill();
        break;
      case 'lion':
        eye(ctx, -8, -76, 3.6); eye(ctx, 8, -76, 3.6); cheek(ctx, -14, -66, 3.4); cheek(ctx, 14, -66, 3.4);
        ctx.fillStyle = T('#F8DDA0'); ctx.beginPath(); ell(ctx,-4.5, -63, 6, 5, 0); ell(ctx,4.5, -63, 6, 5, 0); ctx.fill();
        ctx.fillStyle = T('#7A4426'); ctx.beginPath(); ctx.moveTo(-4, -68); ctx.lineTo(4, -68); ctx.lineTo(0, -64); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = T('#7A4426'); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(0, -64); ctx.lineTo(0, -61); ctx.stroke();
        break;
      case 'elephant':
        eye(ctx, -9, -78, 3.5); eye(ctx, 9, -78, 3.5); cheek(ctx, -15, -69, 3.4); cheek(ctx, 15, -69, 3.4);
        ctx.lineCap = 'round';
        ctx.strokeStyle = T(line); ctx.lineWidth = 12 + LW * 2;
        ctx.beginPath(); ctx.moveTo(0, -65); ctx.bezierCurveTo(0, -59, -1, -53, 6, -47); ctx.stroke();
        ctx.strokeStyle = T(base); ctx.lineWidth = 12; ctx.stroke();
        ctx.strokeStyle = TA(line, 0.5); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(-5, -60); ctx.lineTo(4, -60); ctx.moveTo(-4, -55); ctx.lineTo(5, -56); ctx.stroke();
        break;
    }
    if (animal === 'frog') shinyDot(ctx, -19, -74, 4, 2.2, -0.5, 0.6); else shinyDot(ctx, -9, -86, 5, 2.6, -0.5, 0.65);
    ctx.restore();
  }

  // ================================================================ TABLET
  var TAB = { base: '#CFC6B4', line: '#8A8070', shade: '#B5AC98', ink: '#4A4237', bevel: '#EEE8DA' };
  function tabletB(p) {
    p.moveTo(-46, -78); p.quadraticCurveTo(-46, -100, -24, -100); p.lineTo(24, -100); p.quadraticCurveTo(46, -100, 46, -78);
    p.lineTo(46, -8); p.quadraticCurveTo(46, 0, 38, 0); p.lineTo(-38, 0); p.quadraticCurveTo(-46, 0, -46, -8); p.closePath();
  }
  function carveText(ctx, txt, cx, cy, fs, maxW) {
    ctx.font = '800 ' + fs + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var mw = ctx.measureText ? (ctx.measureText(txt).width || 0) : 0;
    if (mw > maxW) { fs = Math.max(12, Math.floor(fs * maxW / mw)); ctx.font = '800 ' + fs + 'px ' + FONT; }
    ctx.lineJoin = 'round';
    ctx.fillStyle = TA(TAB.bevel, 0.95); ctx.fillText(txt, cx + 1.6, cy + 2);
    ctx.fillStyle = T('#2E2820'); ctx.fillText(txt, cx - 0.8, cy - 0.9);
    ctx.fillStyle = T(TAB.ink); ctx.fillText(txt, cx, cy);
  }
  function drawTablet(ctx, text, mid) {
    celFill(ctx, 'tab', tabletB, TAB.base, TAB.shade, -24, -84, 30, -5, -4);
    ctx.save(); clipK(ctx, 'tab', tabletB);
    ctx.strokeStyle = TA(TAB.line, 0.55); ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(30, -18); ctx.lineTo(24, -12); ctx.lineTo(27, -6); ctx.moveTo(-34, -30); ctx.lineTo(-28, -26); ctx.stroke();
    ctx.fillStyle = TA(TAB.line, 0.4); ctx.beginPath(); circ(ctx,-26, -12, 1.8); circ(ctx,14, -22, 1.5); circ(ctx,36, -40, 1.4); ctx.fill();
    ctx.restore();
    // a carved frame line around the face
    ctx.save(); ctx.translate(0, -50); ctx.scale(0.84, 0.86); ctx.translate(0, 50);
    strokeK(ctx, 'tab', tabletB, TA('#FFFFFF', 0.35 * (1 - 0.5 * hiN())), 2.6);
    ctx.translate(-0.8, -1); strokeK(ctx, 'tab', tabletB, TA(TAB.line, 0.5), 1.8);
    ctx.restore();
    strokeK(ctx, 'tab', tabletB, T(TAB.line), LW);
    if (text != null && text !== '') {
      var txt = String(text), n = txt.length;
      var fs = n <= 1 ? 54 : n === 2 ? 44 : n === 3 ? 34 : 27;
      carveText(ctx, txt, 0, mid ? -50 : -66, fs, 78);
    }
  }

  // ================================================================ DINO (code fallback; the game uses the SVG hatchlings)
  function drawDinoUnit(ctx, c) {   // 100 box, bottom centre, facing RIGHT
    c = c || pal('green');
    var line = lineOf(c), shade = shadeOf(c);
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    var tail = function (p) { p.moveTo(-18, -34); p.quadraticCurveTo(-44, -30, -50, -12); p.quadraticCurveTo(-36, -16, -16, -16); p.closePath(); };
    piece(ctx, 'dino:tail', tail, c.base, line);
    // spikes along the back
    var spikes = function (p) {
      var S = [[-30, -40, -0.9], [-18, -50, -0.55], [-4, -56, -0.2], [12, -88, -0.5], [24, -94, 0], [36, -90, 0.5]];
      for (var i = 0; i < S.length; i++) { var s = S[i], ca = Math.cos(s[2]), sa = Math.sin(s[2]); p.moveTo(s[0] - 6 * ca, s[1] - 6 * sa); p.lineTo(s[0] + 9 * sa, s[1] - 9 * ca); p.lineTo(s[0] + 6 * ca, s[1] + 6 * sa); p.closePath(); }
    };
    fillK(ctx, 'dino:spk', spikes, T(c.light)); strokeK(ctx, 'dino:spk', spikes, T(line), LW * 0.8);
    var legs = function (p) { rr(p, -20, -16, 13, 16, 5); rr(p, 4, -16, 13, 16, 5); };
    piece(ctx, 'dino:legs', legs, shade, line);
    var body = function (p) { ell(p, -4, -32, 29, 24); };
    celFill(ctx, 'dino:body', body, c.base, shade, -14, -44, 14, -4, -3); strokeK(ctx, 'dino:body', body, T(line), LW);
    ctx.fillStyle = T(c.light); ctx.beginPath(); ctx.ellipse(4, -26, 15, 14, 0, 0, TAU); ctx.fill();
    var head = function (p) { ell(p, 22, -66, 24, 22); };
    celFill(ctx, 'dino:head', head, c.base, shade, 12, -78, 12, -4, -3); strokeK(ctx, 'dino:head', head, T(line), LW);
    piece(ctx, 'dino:arm', function (p) { ell(p, 18, -34, 7, 4.5, 0.5); }, c.base, line, LW * 0.8);
    eye(ctx, 30, -70, 6); eye(ctx, 14, -70, 5);
    cheek(ctx, 38, -58, 4); ctx.fillStyle = T(line); ctx.beginPath(); ctx.arc(43, -68, 1.3, 0, TAU); ctx.fill();
    ctx.strokeStyle = T(line); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(26, -56); ctx.quadraticCurveTo(33, -51, 40, -56); ctx.stroke();
    ctx.restore();
  }

  // ================================================================ THINGS (public)
  function thingBox(thing, size) {
    var s = (size || 100) / 100, k = thing && thing.kind, w = 78, h = 100, top = -100, bottom = 0;
    if (k === 'stone') { var b = SHAPE_BOX[thing.shape] || SHAPE_BOX.circle; w = b.w; h = b.h; top = -h; }
    else if (k === 'bone') { w = 64; }
    else if (k === 'toy') { w = (TOY[thing.animal] || TOY.duck).w; }
    else if (k === 'tablet') { w = 92; }
    else if (k === 'eggTop') { top = -100; bottom = -42; h = 58; }
    else if (k === 'eggBottom') { top = -58; bottom = 0; h = 58; }
    else if (k === 'dino') { w = 100; }
    return { w: w * s, h: h * s, top: top * s, bottom: bottom * s };
  }
  function drawThing(ctx, thing, size, opt) {
    if (!thing || !(size > 0)) return;
    opt = opt || {};
    var prevNight = night, prevDim = dimV, prevMode = tMode; night = clamp01(opt.night); dimV = clamp01(opt.dim); tMode = 'thing';
    var k = size / 100, wob = +opt.wob || 0, time = opt.time == null ? nowSec() : opt.time;
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (wob) { ctx.translate(wob, 0); ctx.rotate(wob * 0.006); }
    if (dimV) ctx.globalAlpha *= 1 - 0.12 * dimV;
    ctx.scale(k, k);
    var box = thingBox(thing, 100);
    if (opt.shadow) { ctx.fillStyle = 'rgba(60,40,20,0.22)'; ctx.beginPath(); ctx.ellipse(0, 0, box.w * 0.46, 5, 0, 0, TAU); ctx.fill(); }
    var glow = clamp01(opt.glow);
    if (glow > 0) {
      var pulse = 0.72 + 0.28 * Math.sin(time * 6), cy = (box.top + box.bottom) / 2, R = Math.max(box.w, box.h) * 0.78;
      var g = ctx.createRadialGradient(0, cy, R * 0.3, 0, cy, R);
      g.addColorStop(0, 'rgba(255,220,100,' + (0.75 * glow * pulse).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,220,100,0)');
      ctx.fillStyle = g; ctx.fillRect(-R, cy - R, 2 * R, 2 * R);
    }
    var c = pal(thing.color);
    switch (thing.kind) {
      case 'egg': drawEgg(ctx, c || pal('#EADCBE'), null, clamp01(opt.crack)); break;
      case 'eggTop': drawEgg(ctx, c || pal('#EADCBE'), 'top', 0); break;
      case 'eggBottom': drawEgg(ctx, c || pal('#EADCBE'), 'bottom', 0); break;
      case 'stone': drawStone(ctx, thing.shape, c); break;
      case 'bone': drawBone(ctx); break;
      case 'toy': drawToy(ctx, thing.animal); break;
      case 'tablet': drawTablet(ctx, thing.text != null ? thing.text : thing.n, !!thing.textMid); break;
      case 'dino': drawDinoUnit(ctx, c); break;
      default: break;
    }
    ctx.restore();
    night = prevNight; dimV = prevDim; tMode = prevMode;
  }

  // ================================================================ MOUND
  // Geometry (px, relative to the mound origin = bottom centre on the ground):
  //   pileTop = −h0·(1 − dig) (the flat top where the thing peeks), the heap = flat top over ±0.45·w/2 with round shoulders;
  //   rims (heaped loose sand) at |x| ≈ 0.37 w grow with dig up to 0.42·h0; from dig 0.3 a hole opens: ellipse centre
  //   cy = pileTop + 4 − ry, rx = 0.275 w·(0.5 + 0.5 e), ry = 0.08 w·(0.25 + 0.75 e), e = smooth((dig − 0.3) / 0.7). Its front lip
  //   (lowest point) is at pileTop + 4 = the thing's clip line, so the thing is cut exactly at the lip.
  function moundGeom(m) {
    var w = +m.w || 170, h0 = +m.h0 || 70, d = clamp01(m.dig), Hh = h0 * (1 - d);
    var g = { w: w, h0: h0, dig: d, pileTop: -Hh, rimH: h0 * 0.42 * smooth01(d), seed: hash(m.id != null ? m.id : 'm'), hole: null, ring: null, lipY: -Hh };
    if (d > 0.3) {
      var e = smooth01((d - 0.3) / 0.7), rx = 0.275 * w * (0.5 + 0.5 * e), ry = 0.08 * w * (0.25 + 0.75 * e), cy = -Hh + 4 - ry;
      g.hole = { cx: 0, cy: cy, rx: rx, ry: ry, e: e };
      g.ring = { rx: rx + 0.075 * w * (0.4 + 0.6 * e), ry: ry + 0.035 * w * (0.4 + 0.6 * e) };
      g.lipY = cy + ry;
    }
    return g;
  }
  function heapH(g, x) {   // height (≥ 0) of the sand profile at x
    var W = g.w / 2, u = Math.abs(x) / W, p = 0.55, hv = 0;
    if (u < p) hv = 1; else if (u < 1) { var t = (u - p) / (1 - p); hv = Math.pow(Math.max(0, 1 - Math.pow(t, 2.2)), 0.55); }
    hv *= -g.pileTop;
    var tr = (Math.abs(x) - 0.37 * g.w) / (0.15 * g.w), rim = Math.abs(tr) < 1 ? g.rimH * Math.pow(1 - tr * tr, 1.4) : 0;
    var v = Math.max(hv, rim);
    if (v > 2) v += (0.7 + 1.6 * g.dig) * Math.sin(x * 0.19 + g.seed * 40) * Math.min(1, v / 12);
    return Math.max(0, v);
  }
  function moundSurface(m, x) {
    var g = moundGeom(m), y = -heapH(g, x);
    if (g.hole) {
      var r = g.ring, h = g.hole;
      if (Math.abs(x) < r.rx) y = Math.min(y, h.cy - r.ry * Math.sqrt(1 - (x / r.rx) * (x / r.rx)));
      if (Math.abs(x) < h.rx) y = h.cy + h.ry * Math.sqrt(1 - (x / h.rx) * (x / h.rx));
    }
    return y;
  }
  // Optional alternative to the §5.2 rect clip: clip a buried thing to "everything above the mound's bottom edge" (in the
  // mound's own frame, with the same wob / pop). The front mound hides the buried part anyway, so a wide thing (rect, star
  // arms) sinks naturally into the shoulder slope instead of being cut by a horizontal line in mid-air.
  // Use: ctx.save(); ctx.translate(m.x, m.y); DigArt.clipBuried(ctx, m, opt); ctx.translate(0, thingY − m.y); drawThing…; ctx.restore()
  function clipBuried(ctx, mound, opt) {
    opt = opt || {};
    var g = moundGeom(mound), pop = opt.pop == null ? 1 : Math.max(0, +opt.pop), wob = +opt.wob || 0;
    var sx = pop * (1 + 0.1 * (1 - Math.min(1, pop))), sy = pop, kk = wob ? wob / Math.max(20, g.h0) : 0, big = 4 * g.h0 + 400;
    function P(x, y, first) { x *= sx; y *= sy; x -= kk * y; if (first) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    var W = 0.54 * g.w, n = 12;
    ctx.beginPath(); P(-3 * g.w, -big, true); P(3 * g.w, -big); P(3 * g.w, 0); P(W, 0);
    for (var i = 1; i < n; i++) { var t = i / n, x = W - 2 * W * t, y = 2 * t * (1 - t) * 0.075 * g.w; P(x, y); }   // the bottom curve
    P(-W, 0); P(-3 * g.w, 0); ctx.closePath(); ctx.clip();
  }
  function silhouette(ctx, g) {   // the whole sand shape (heap + rims + ring) as one path on ctx
    var W = 0.54 * g.w, N = 44;
    ctx.beginPath();
    ctx.moveTo(-W, 0);
    var prevX = -W, prevY = 0;
    for (var i = 1; i < N; i++) {
      var x = -W + 2 * W * i / N, y = -heapH(g, x);
      ctx.quadraticCurveTo(prevX, prevY, (prevX + x) / 2, (prevY + y) / 2);
      prevX = x; prevY = y;
    }
    ctx.quadraticCurveTo(prevX, prevY, W, 0);
    ctx.quadraticCurveTo(0, 0.075 * g.w, -W, 0);
    ctx.closePath();
    if (g.ring) { var h = g.hole; ctx.moveTo(g.ring.rx, h.cy); ctx.ellipse(0, h.cy, g.ring.rx, g.ring.ry, 0, 0, TAU); }
  }
  function columnPath(ctx, g, big) {   // the region above the hole's front lip (|x| < rx): belongs to the BACK layer
    var h = g.hole;
    ctx.moveTo(-h.rx, -big); ctx.lineTo(-h.rx, h.cy); ctx.ellipse(0, h.cy, h.rx, h.ry, 0, Math.PI, 0, true); ctx.lineTo(h.rx, -big); ctx.closePath();
  }
  function moundSetup(ctx, g, opt) {
    var pop = opt.pop == null ? 1 : +opt.pop, wob = +opt.wob || 0;
    if (wob) { var k = wob / Math.max(20, g.h0); ctx.transform(1, 0, -k, 1, 0, 0); }
    if (pop !== 1) ctx.scale(Math.max(0, pop) * (1 + 0.1 * (1 - Math.min(1, pop))), Math.max(0, pop));
    return pop > 0.001;
  }
  function paintSand(ctx, g, opt, time) {
    var lw = 2.6, glow = clamp01(opt.glow);
    if (glow > 0) {
      var pulse = 0.6 + 0.4 * Math.sin(time * 6);
      silhouette(ctx, g);
      ctx.lineJoin = 'round';
      ctx.lineWidth = 22; ctx.strokeStyle = 'rgba(255,206,70,' + (0.32 * glow * pulse).toFixed(3) + ')'; ctx.stroke();
      ctx.lineWidth = 12; ctx.strokeStyle = 'rgba(255,232,140,' + (0.55 * glow).toFixed(3) + ')'; ctx.stroke();
    }
    // contact shadow on the ground
    ctx.fillStyle = 'rgba(70,50,25,' + (0.2 * (1 - 0.3 * night)).toFixed(3) + ')';
    ctx.beginPath(); ctx.ellipse(0.03 * g.w, 0.02 * g.w, 0.56 * g.w, 0.07 * g.w, 0, 0, TAU); ctx.fill();
    silhouette(ctx, g); ctx.lineJoin = 'round'; ctx.lineWidth = lw * 2; ctx.strokeStyle = glow > 0 ? mix(S('line'), '#E8A014', 0.6 * glow) : S('line'); ctx.stroke();
    ctx.save();
    silhouette(ctx, g); ctx.clip();
    ctx.fillStyle = S('shade'); ctx.fillRect(-g.w, -2 * g.h0 - 20, 2 * g.w, 2 * g.h0 + 0.2 * g.w + 40);
    ctx.save(); ctx.translate(-0.045 * g.w, -0.1 * g.h0 - 2); silhouette(ctx, g); ctx.fillStyle = S('base'); ctx.fill(); ctx.restore();
    var hx = -0.16 * g.w, hy = Math.min(-8, g.pileTop * 0.7 - 6), hr = 0.32 * g.w;
    var hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr);
    hg.addColorStop(0, SA('hi', 0.85)); hg.addColorStop(0.6, SA('hi', 0.25)); hg.addColorStop(1, SA('hi', 0));
    ctx.fillStyle = hg; ctx.fillRect(hx - hr, hy - hr, 2 * hr, 2 * hr);
    // grains and pebbles (deterministic per mound)
    for (var i = 0; i < 12; i++) {
      var a = (g.seed * 997 + i * 61.7) % 1, b = (g.seed * 571 + i * 37.3) % 1, x = (a - 0.5) * 0.8 * g.w, top = -heapH(g, x);
      var y = top + (0.18 + 0.7 * b) * (0 - top) + 2;
      if (top > -6) continue;
      ctx.fillStyle = i % 3 ? SA('line', 0.42) : SA('hi', 0.9);
      ctx.beginPath(); ctx.ellipse(x, y, i % 4 ? 1.6 : 2.6, i % 4 ? 1.3 : 2, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  function drawHoleBack(ctx, mound, opt) {
    if (!mound) return;
    opt = opt || {};
    var g = moundGeom(mound);
    if (!g.hole) return;
    var prevNight = night, prevMode = tMode; night = clamp01(opt.night); tMode = 'scene';
    var time = opt.time == null ? nowSec() : opt.time, h = g.hole;
    ctx.save();
    if (moundSetup(ctx, g, opt)) {
      ctx.save();
      ctx.beginPath(); columnPath(ctx, g, 4 * g.h0 + 200); ctx.clip();
      paintSand(ctx, g, opt, time);
      ctx.restore();
      // the hole: lit back wall at the top, deep at the front
      ctx.save();
      ctx.beginPath(); ctx.ellipse(0, h.cy, h.rx, h.ry, 0, 0, TAU);
      ctx.fillStyle = S('holeDeep'); ctx.fill();
      ctx.clip();
      var gg = ctx.createLinearGradient(0, h.cy - h.ry, 0, h.cy + h.ry);
      gg.addColorStop(0, S('hole')); gg.addColorStop(0.55, SA('hole', 0.55)); gg.addColorStop(1, SA('hole', 0));
      ctx.fillStyle = gg; ctx.beginPath(); ctx.ellipse(0, h.cy - h.ry * 0.45, h.rx * 1.02, h.ry * 0.95, 0, 0, TAU); ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = SA('holeDeep', 0.8);
      ctx.beginPath(); ctx.ellipse(0, h.cy + 1.5, h.rx, h.ry, 0, Math.PI, 0); ctx.stroke();
      ctx.restore();
      ctx.lineWidth = 2.4; ctx.strokeStyle = S('line');
      ctx.beginPath(); ctx.ellipse(0, h.cy, h.rx, h.ry, 0, Math.PI, 0); ctx.stroke();
    }
    ctx.restore();
    night = prevNight; tMode = prevMode;
  }
  function sparkleStar(ctx, x, y, r, a) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.beginPath();
    for (var i = 0; i < 8; i++) { var q = i % 2 ? r * 0.28 : r, an = i * Math.PI / 4; if (i) ctx.lineTo(Math.cos(an) * q, Math.sin(an) * q); else ctx.moveTo(q, 0); }
    ctx.closePath(); ctx.fill(); ctx.restore();
  }
  function drawMound(ctx, mound, opt) {
    if (!mound) return;
    opt = opt || {};
    var prevNight = night, prevMode = tMode; night = clamp01(opt.night); tMode = 'scene';
    var g = moundGeom(mound), time = opt.time == null ? nowSec() : opt.time, h = g.hole;
    ctx.save();
    if (moundSetup(ctx, g, opt)) {
      ctx.save();
      if (h) { ctx.beginPath(); var big = 4 * g.h0 + 200; ctx.rect(-2 * g.w, -big, 4 * g.w, 2 * big); columnPath(ctx, g, big); ctx.clip('evenodd'); }
      paintSand(ctx, g, opt, time);
      ctx.restore();
      if (h) {   // the front lip of the hole
        ctx.lineCap = 'round';
        ctx.lineWidth = 2.6; ctx.strokeStyle = S('line');
        ctx.beginPath(); ctx.ellipse(0, h.cy, h.rx, h.ry, 0, Math.PI, 0, true); ctx.stroke();
        ctx.lineWidth = 2.2; ctx.strokeStyle = SA('hi', 0.9);
        ctx.beginPath(); ctx.ellipse(0, h.cy + 3, h.rx * 0.9, h.ry, 0, Math.PI * 0.85, Math.PI * 0.15, true); ctx.stroke();
      }
      var sp = clamp01(opt.sparkle);
      if (sp > 0) {
        ctx.fillStyle = 'rgba(255,250,215,' + (0.95 * sp).toFixed(3) + ')';
        for (var i = 0; i < 5; i++) {
          var a = g.seed * 10 + i * 1.257 + time * 0.9, tw = 0.6 + 0.4 * Math.sin(time * 7 + i * 2.1);
          sparkleStar(ctx, Math.cos(a) * 0.42 * g.w, g.pileTop * 0.6 - 10 + Math.sin(a) * 0.16 * g.w, (6 + 5 * tw) * (0.5 + 0.5 * sp), a);
        }
      }
    }
    ctx.restore();
    night = prevNight; tMode = prevMode;
  }

  // ================================================================ SHOVEL, SAND BIT, SHELF
  var STEEL = { base: '#B9C3CC', shade: '#919DA9', light: '#E4EAEF', line: '#5F6B78' };
  function bladeB(p) {
    p.moveTo(0, 1.5); p.bezierCurveTo(11, 0.5, 18, -8, 18, -20); p.lineTo(18, -33); p.quadraticCurveTo(18, -38, 13, -38);
    p.lineTo(-13, -38); p.quadraticCurveTo(-18, -38, -18, -33); p.lineTo(-18, -20); p.bezierCurveTo(-18, -8, -11, 0.5, 0, 1.5); p.closePath();
  }
  function drawShovel(ctx, angle, size, opt) {
    opt = opt || {};
    var prevNight = night, prevMode = tMode; night = clamp01(opt.night); tMode = 'scene';
    var k = (size || 100) / 100, sand = clamp01(opt.sand);
    ctx.save(); ctx.rotate(angle || 0); ctx.scale(k, k); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // handle shaft + T grip (wood)
    piece(ctx, 'sh:shaft', function (p) { rr(p, -4.2, -92, 8.4, 50, 3.5); }, '#C98B4E', '#7A5230', 2.6);
    ctx.fillStyle = TA('#F1C590', 0.8); ctx.fillRect(-2.6, -88, 2, 42);
    piece(ctx, 'sh:grip', function (p) { rr(p, -13, -101, 26, 11, 5.5); }, '#D9A066', '#7A5230', 2.6);
    ctx.fillStyle = TA('#F6D3A6', 0.85); ctx.fillRect(-9, -99, 12, 2.4);
    // neck
    piece(ctx, 'sh:neck', function (p) { rr(p, -5.5, -50, 11, 15, 3); }, '#9DA8B3', STEEL.line, 2.4);
    // blade
    celFill(ctx, 'sh:blade', bladeB, STEEL.base, STEEL.shade, -8, -30, 14, -3, -2);
    ctx.strokeStyle = TA(STEEL.line, 0.45); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(0, -34); ctx.lineTo(0, -6); ctx.stroke();
    ctx.fillStyle = TA(STEEL.light, 0.9); ctx.beginPath(); ctx.ellipse(-9, -24, 2.6, 9, 0.12, 0, TAU); ctx.fill();
    strokeK(ctx, 'sh:blade', bladeB, T(STEEL.line), 2.8);
    if (sand > 0) {   // a heap of sand on the blade
      var hgt = 6 + 12 * sand, wd = 10 + 7 * sand;
      ctx.beginPath(); ctx.moveTo(-wd, -20);
      ctx.bezierCurveTo(-wd * 0.9, -20 - hgt * 0.9, -wd * 0.2, -20 - hgt * 1.1, 2, -20 - hgt);
      ctx.bezierCurveTo(wd * 0.5, -20 - hgt * 0.95, wd, -20 - hgt * 0.5, wd, -20);
      ctx.quadraticCurveTo(0, -14, -wd, -20); ctx.closePath();
      ctx.fillStyle = S('base'); ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = S('line'); ctx.stroke();
      ctx.fillStyle = SA('hi', 0.9); ctx.beginPath(); ctx.ellipse(-wd * 0.3, -20 - hgt * 0.6, wd * 0.3, hgt * 0.16, -0.3, 0, TAU); ctx.fill();
      ctx.fillStyle = SA('line', 0.5); ctx.beginPath(); circ(ctx,wd * 0.35, -22 - hgt * 0.3, 1.4); circ(ctx,-wd * 0.5, -22, 1.2); ctx.fill();
    }
    ctx.restore();
    night = prevNight; tMode = prevMode;
  }
  function drawSandBit(ctx, r, rot, opt) {
    opt = opt || {};
    if (!(r > 0)) return;
    var prevNight = night, prevMode = tMode; night = clamp01(opt.night); tMode = 'scene';
    var seed = opt.seed == null ? 0.37 : +opt.seed, n = 7;
    ctx.save(); ctx.rotate(rot || 0);
    if (opt.alpha != null) ctx.globalAlpha *= clamp01(opt.alpha);
    ctx.beginPath();
    for (var i = 0; i <= n; i++) {
      var a = i / n * TAU, q = r * (0.82 + 0.26 * Math.abs(Math.sin(i * 2.3 + seed * 9)));
      var am = (i - 0.5) / n * TAU, qm = r * 1.05;
      if (!i) ctx.moveTo(Math.cos(a) * q, Math.sin(a) * q); else ctx.quadraticCurveTo(Math.cos(am) * qm, Math.sin(am) * qm, Math.cos(a) * q, Math.sin(a) * q);
    }
    ctx.closePath();
    ctx.fillStyle = S('base'); ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.2); ctx.strokeStyle = S('line'); ctx.stroke();
    ctx.fillStyle = S('shade'); ctx.beginPath(); ctx.ellipse(r * 0.25, r * 0.3, r * 0.5, r * 0.32, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = SA('hi', 0.95); ctx.beginPath(); ctx.ellipse(-r * 0.3, -r * 0.32, r * 0.32, r * 0.2, -0.5, 0, TAU); ctx.fill();
    ctx.restore();
    night = prevNight; tMode = prevMode;
  }
  var SHELF = { wood: '#B8875A', dark: '#7E5634', light: '#D9AE7E', top: '#CFA071', flag: '#C79A84', flagDk: '#8F6A58' };
  function drawShelf(ctx, shelf, opt) {
    if (!shelf) return;
    opt = opt || {};
    var prevNight = night, prevMode = tMode; night = clamp01(opt.night); tMode = 'scene';
    var x = shelf.x, y = shelf.y, w = shelf.w, h = shelf.h, py = y + h - 30, th = 16;
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // soft shadow
    ctx.fillStyle = 'rgba(40,30,20,0.18)'; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h - 1, w * 0.48, 5, 0, 0, TAU); ctx.fill();
    // legs
    [x + Math.min(70, w * 0.12), x + w - Math.min(70, w * 0.12)].forEach(function (lx) {
      ctx.beginPath(); rr(ctx, lx - 8, py + th - 4, 16, h - 30 - th + 6 + 2, 5);
      ctx.fillStyle = T(SHELF.wood); ctx.fill(); ctx.lineWidth = 2.4; ctx.strokeStyle = T(SHELF.dark); ctx.stroke();
      ctx.fillStyle = TA(SHELF.dark, 0.35); ctx.fillRect(lx + 2, py + th, 4, h - 30 - th);
    });
    // flag pole + pennant at the left end
    var fx = x + 16;
    ctx.beginPath(); rr(ctx, fx - 2.5, y + 4, 5, py - y - 2, 2.5); ctx.fillStyle = T(SHELF.dark); ctx.fill();
    ctx.beginPath(); ctx.moveTo(fx + 2, y + 7); ctx.quadraticCurveTo(fx + 22, y + 11, fx + 34, y + 17); ctx.quadraticCurveTo(fx + 20, y + 22, fx + 2, y + 27); ctx.closePath();
    ctx.fillStyle = T(SHELF.flag); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = T(SHELF.flagDk); ctx.stroke();
    ctx.fillStyle = TA('#FFFFFF', 0.35); ctx.beginPath(); ctx.arc(fx + 13, y + 17, 3, 0, TAU); ctx.fill();
    ctx.fillStyle = T('#E2C48E'); ctx.beginPath(); ctx.arc(fx, y + 4, 4, 0, TAU); ctx.fill(); ctx.strokeStyle = T(SHELF.dark); ctx.lineWidth = 1.6; ctx.stroke();
    // plank
    ctx.beginPath(); rr(ctx, x, py, w, th, 6);
    var g = ctx.createLinearGradient(0, py, 0, py + th); g.addColorStop(0, T(SHELF.light)); g.addColorStop(0.35, T(SHELF.wood)); g.addColorStop(1, T(mix(SHELF.wood, SHELF.dark, 0.35)));
    ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 2.6; ctx.strokeStyle = T(SHELF.dark); ctx.stroke();
    ctx.fillStyle = TA('#FFF1DA', 0.5); ctx.fillRect(x + 8, py + 2.5, w - 16, 2.4);
    // grain + nails
    ctx.strokeStyle = TA(SHELF.dark, 0.35); ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (var gx = x + 40; gx < x + w - 40; gx += 150) { ctx.moveTo(gx, py + 9); ctx.quadraticCurveTo(gx + 30, py + 7, gx + 60, py + 10); }
    ctx.stroke();
    ctx.fillStyle = T('#8A7A66');
    [x + 10, x + w - 10].forEach(function (nx) { ctx.beginPath(); ctx.arc(nx, py + th / 2, 2.2, 0, TAU); ctx.fill(); });
    if (opt.slots && shelf.slots) {
      ctx.fillStyle = TA(SHELF.dark, 0.16);
      shelf.slots.forEach(function (s) { ctx.beginPath(); ctx.ellipse(s.x, s.y + 1, (shelf.size || 64) * 0.32, 3, 0, 0, TAU); ctx.fill(); });
    }
    ctx.restore();
    night = prevNight; tMode = prevMode;
  }

  // ================================================================ ICONS
  function fitThing(ctx, thing, size, frac, opt) {
    var b = thingBox(thing, 100), s = size * frac * 100 / Math.max(b.w, b.h);
    ctx.save(); ctx.translate(0, -(b.top + b.bottom) / 2 * s / 100); drawThing(ctx, thing, s, opt || { time: 0 }); ctx.restore();
  }
  function drawIcon(ctx, thing, size) {
    if (!thing) return;
    var s = size || 100, c;
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    switch (thing.kind) {
      case 'blob':
        c = pal(thing.color) || pal('#DDDDDD');
        ctx.beginPath();
        ctx.moveTo(-s * 0.36, s * 0.1);
        ctx.bezierCurveTo(-s * 0.42, -s * 0.28, -s * 0.1, -s * 0.4, s * 0.04, -s * 0.36);
        ctx.bezierCurveTo(s * 0.34, -s * 0.34, s * 0.44, -s * 0.08, s * 0.36, s * 0.14);
        ctx.bezierCurveTo(s * 0.3, s * 0.3, s * 0.18, s * 0.2, s * 0.14, s * 0.32);
        ctx.bezierCurveTo(s * 0.1, s * 0.42, -s * 0.02, s * 0.42, -s * 0.04, s * 0.3);
        ctx.bezierCurveTo(-s * 0.08, s * 0.22, -s * 0.3, s * 0.32, -s * 0.36, s * 0.1);
        ctx.closePath();
        ctx.fillStyle = c.base; ctx.fill(); ctx.lineWidth = Math.max(2, s * 0.04); ctx.strokeStyle = c.dark; ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(-s * 0.14, -s * 0.18, s * 0.1, s * 0.05, -0.4, 0, TAU); ctx.fill();
        break;
      case 'egg': case 'eggTop': case 'eggBottom': case 'stone': case 'toy': case 'bone': case 'tablet':
        fitThing(ctx, thing, s, thing.kind === 'stone' ? 0.84 : 0.86);
        break;
      case 'number': case 'letter':
        fitThing(ctx, { kind: 'tablet', text: thing.kind === 'number' ? thing.n : thing.text, textMid: true }, s, 0.88);
        break;
      case 'dino': fitThing(ctx, { kind: 'dino', color: thing.color }, s, 0.88); break;
      case 'dots': {   // n bones standing in a tidy grid (rows of ≤ 5), as big as the cells allow
        var n = Math.max(0, Math.min(20, thing.n | 0)), per = n <= 3 ? n : n <= 4 ? 2 : n <= 6 ? 3 : 5;
        var rows = Math.ceil(n / Math.max(1, per)), cw = s * 0.92 / Math.max(per, 1), chh = s * 0.92 / Math.max(rows, 1);
        var bs = Math.min(chh * 0.9, cw * 1.55, s * 0.62);
        for (var i = 0; i < n; i++) {
          var row = Math.floor(i / per), inRow = Math.min(per, n - row * per), col = i - row * per;
          var x = (col - (inRow - 1) / 2) * cw, y = (row - (rows - 1) / 2) * chh;
          ctx.save(); ctx.translate(x, y + bs / 2); drawThing(ctx, { kind: 'bone' }, bs, { time: 0 }); ctx.restore();
        }
        break;
      }
      case 'size': {
        // {kind:'size', size:'big'|'small', of:'bone'|'egg'|'toy', color?, animal?} — big and small share the bottom line
        var small = thing.size === 'small', of = thing.of || 'bone';
        var inner = { kind: of === 'egg' || of === 'toy' ? of : 'bone', color: thing.color, animal: thing.animal || 'duck' };
        var hh = s * (small ? 0.5 : 0.88);
        ctx.save(); ctx.translate(0, s * 0.44); drawThing(ctx, inner, hh, { time: 0 }); ctx.restore();
        break;
      }
      default: break;
    }
    ctx.restore();
  }

  // ================================================================ GHOST HAND
  function drawGhostHand(ctx, size, t) {
    var s = size, F = '#FFF4E4', L = '#B9835A', SH = '#F1D6B8', EDGE = '#4A3B5C';
    var ph = ((t || 0) % 1 + 1) % 1;
    var press = ph < 0.18 ? 1 - ph / 0.18 : ph > 0.85 ? (ph - 0.85) / 0.15 : 0;
    ctx.save();
    if (ph < 0.3) {
      var q = ph / 0.3;
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.9 * (1 - q)).toFixed(3) + ')'; ctx.lineWidth = s * 0.035;
      ctx.beginPath(); ctx.arc(0, 0, s * (0.08 + 0.22 * q), 0, TAU); ctx.stroke();
    }
    ctx.translate(0, s * 0.05 * (1 - press));
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    function hand() {
      ctx.beginPath();
      rr(ctx, -s * 0.085, 0, s * 0.17, s * 0.52, s * 0.085);
      rr(ctx, -s * 0.26, s * 0.36, s * 0.47, s * 0.42, s * 0.14);
      ctx.moveTo(-s * 0.2, s * 0.5);
      ctx.ellipse(-s * 0.27, s * 0.46, s * 0.07, s * 0.15, -0.6, 0, TAU);
    }
    ctx.globalAlpha *= 0.95;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
    hand(); ctx.lineWidth = s * 0.07 + 6; ctx.strokeStyle = EDGE; ctx.stroke();
    ctx.restore();
    hand(); ctx.lineWidth = s * 0.07; ctx.strokeStyle = L; ctx.stroke();
    hand(); ctx.fillStyle = F; ctx.fill();
    ctx.strokeStyle = SH; ctx.lineWidth = s * 0.03;
    ctx.beginPath(); ctx.moveTo(0, s * 0.5); ctx.lineTo(s * 0.18, s * 0.5); ctx.moveTo(0, s * 0.62); ctx.lineTo(s * 0.18, s * 0.62); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.ellipse(-s * 0.03, s * 0.12, s * 0.025, s * 0.07, 0, 0, TAU); ctx.fill();
    // cuff: Bun's khaki explorer sleeve with the hat-band stripe
    ctx.fillStyle = '#C9B48A'; ctx.strokeStyle = '#7D6A4A'; ctx.lineWidth = s * 0.04;
    ctx.beginPath(); rr(ctx, -s * 0.24, s * 0.76, s * 0.44, s * 0.14, s * 0.05); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = EDGE; ctx.stroke();
    ctx.fillStyle = '#7D6A4A'; ctx.fillRect(-s * 0.2, s * 0.81, s * 0.36, s * 0.035);
    ctx.restore();
  }

  DD.DigArt = {
    drawThing: drawThing, thingBox: thingBox, drawMound: drawMound, drawHoleBack: drawHoleBack, moundGeom: moundGeom, clipBuried: clipBuried,
    moundSurface: moundSurface, drawShovel: drawShovel, drawSandBit: drawSandBit, drawShelf: drawShelf, drawIcon: drawIcon,
    drawGhostHand: drawGhostHand, pal: pal, PALETTE: FALLBACK_PALETTE, SAND: SAND, FONT: FONT, SHAPE_BOX: SHAPE_BOX,
    TOY_W: TOY_W, clearCache: clearCache
  };
})(typeof window !== 'undefined' ? (window.DD = window.DD || {}) : (global.DD = global.DD || {}));
