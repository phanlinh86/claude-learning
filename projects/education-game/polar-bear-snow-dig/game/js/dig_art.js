/* Nuka's Snow Dig — NK.DigArt (character artist B), DESIGN §3 / §4.2. Everything here is drawn by code on a 2D canvas.
 *
 *   drawThing(ctx, thing, size, opt)   origin = BOTTOM CENTRE, size = the thing's height (px). thing = { kind, color?, shape?,
 *       animal?, text?, n? }; kind hat | gem | fish | toy | tablet (any other kind draws a harmless little snowball).
 *       opt = { wob px, glow 0..1, dim 0..1, night 0..1, time s, shadow bool (contact shadow) }
 *   thingBox(thing, size) → { w, h, top, bottom }     visible box (origin = bottom centre; top < 0). Every kind is exactly
 *       `size` tall except gem rect / square (see SHAPE_BOX).
 *   drawMound(ctx, mound, opt)          the FRONT of a snow drift, origin = drift bottom centre (draw it AFTER the thing)
 *   drawHoleBack(ctx, mound, opt)       the back of the hole + back snow ring (draw it BEFORE the thing; no-op at dig ≤ 0.3)
 *       mound = { w, h0, dig 0..1, id? }  opt = { glow 0..1, wob px, pop 0..1+, night 0..1, sparkle 0..1, time s }
 *   moundGeom(mound) → { pileTop, hole:{ cx, cy, rx, ry } | null, lipY }   (relative to the drift origin; same as the base)
 *   moundSurface(mound, x) → y of the front snow surface at x (relative; ≤ 0 is above the ground)
 *   clipBuried(ctx, mound, opt)        optional clip for a buried thing (alternative to the rect clip)
 *   drawShovel(ctx, angle, size, opt)   NUKA'S BIG FLUFFY PAW, origin = the rounded paw tip, angle 0 = paw pointing down
 *                                       (scooping, arm up); opt { sand 0..1 → a scoop of snow on the paw, night }
 *   drawSandBit(ctx, r, rot, opt)       one flung SNOW clump, origin = centre; opt { night, alpha, seed }
 *   drawShelf(ctx, shelf, opt)          the AURORA RIBBON in box layout.shelf; opt { t s, n finds, ripple 0..1, night 0..1,
 *                                       alpha 0..1, glow 0..1 (flash on a new find), slots bool (default true) }
 *   drawIcon(ctx, thing, size)          centred in a size × size box: hat {color} | blob {color} | gem {shape,color} |
 *                                       toy {animal} | fish | tablet | number {n} | letter {text} | dots {n} (n fish) |
 *                                       size {size:'big'|'small', of:'fish'|'hat'|'toy', color?, animal?}
 *   drawGhostHand(ctx, size, t, opt)    friendly pointing hand, origin = fingertip (finger points UP), t = 0..1 tap phase;
 *                                       opt.rub → the hand swishes left/right with motion lines (rub demo)
 *   Helpers: pal(color), PALETTE, SNOW (= SAND), FISH, FONT, SHAPE_BOX, TOY_W, clearCache().
 * Node-safe at load (no DOM). Path2D objects are cached per key; without Path2D (node tests) paths are rebuilt on the ctx.
 * Internal drawing of things is in a 100-unit box (y −100 … 0) scaled by size / 100.
 */
(function (NK) {
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
  // snow (DESIGN §3): drift, shade, outline, highlight, hole top → deep, sparkle dots
  var SNOW = { base: '#F4F8FC', shade: '#CFDDEA', line: '#8FA9BF', hi: '#FFFFFF', hole: '#9DBCD6', holeDeep: '#5F86A8', dot: '#A9BED2' };
  var SNOW_N = { base: '#C9D6EA', shade: '#A3B5CF', line: '#6F86A6', hi: '#E8F0FB', hole: '#7F9CC0', holeDeep: '#3F5A80', dot: '#8EA3C2' };
  var FISH = { base: '#9FB9CF', belly: '#E3EEF6', line: '#5E7C96', shade: '#839FB7', fin: '#B8CDDF' };
  var FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", system-ui, sans-serif';
  var EYE = '#2E2A33', CHEEK = '#F3BFB2', NIGHT = '#34416C';
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

  // night tint: every colour drawn goes through T(); `night` is set per draw call (0 = untouched).
  // THINGS (answers) take only a light 12 % blue mix and keep their highlights; scene props take 42 %; the snow has its own
  // moonlit table (SNOW_N). `dimV` (a wrong thing left in its hole) desaturates toward a cool grey of the same lightness.
  var night = 0, dimV = 0, tMode = 'scene', tintCache = {}, DIM = '#C3CBD3';
  function hiN() { return tMode === 'thing' ? 0 : night; }
  function dimCol(hex, d) {
    var c = rgb(hex), L = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
    var gq = function (v) { v = Math.round(Math.max(0, Math.min(255, v))); return (v < 16 ? '0' : '') + v.toString(16); };
    var grey = ('#' + gq(L - 4) + gq(L) + gq(L + 6)).toUpperCase();
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
  function lineOf(c) { return lum(c.base) > 0.5 ? mix(c.dark, '#4A3200', 0.5) : c.dark; }   // yellow: a darker outline so it reads on snow
  function S(name) { return night > 0.01 ? mix(SNOW[name], SNOW_N[name], Math.round(night * 20) / 20) : SNOW[name]; }
  function SA(name, a) { var c = rgb(S(name)); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (+a).toFixed(3) + ')'; }
  function pal(c) {
    if (!c) return null;
    var P = NK.PALETTE || FALLBACK_PALETTE, p = (P && P[c]) || FALLBACK_PALETTE[c];
    if (p && typeof p === 'object' && p.base) return { base: p.base, dark: p.dark || mix(p.base, '#000000', 0.35), light: p.light || mix(p.base, '#FFFFFF', 0.45) };
    if (typeof c === 'string' && /^#[0-9A-Fa-f]{6}$/.test(c)) return { base: c, dark: mix(c, '#1A2A3A', 0.45), light: mix(c, '#FFFFFF', 0.5) };
    return null;
  }
  function shadeOf(c) { return mix(c.base, c.dark, 0.42); }

  // ---------------------------------------------------------------- paths (Path2D cache with a ctx fallback)
  var cache = {}, cacheN = 0, MAX_CACHE = 500;
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
  function fluffCircle(p, x, y, r, n, bump) {   // a scalloped "fluffy" circle (pompom, snowball)
    var pts = n || 11, b = bump == null ? 0.16 : bump;
    p.moveTo(x + r, y);
    for (var i = 1; i <= pts; i++) {
      var a0 = (i - 0.5) / pts * TAU, a1 = i / pts * TAU;
      p.quadraticCurveTo(x + Math.cos(a0) * r * (1 + b), y + Math.sin(a0) * r * (1 + b), x + Math.cos(a1) * r, y + Math.sin(a1) * r);
    }
    p.closePath();
  }

  // one-step cel shading: shade colour everywhere, base colour on a copy nudged up-left, soft highlight upper-left
  function celFill(ctx, key, build, base, shade, hx, hy, hr, dx, dy) {
    dx = dx == null ? -4.5 : dx; dy = dy == null ? -4 : dy;
    ctx.save();
    clipK(ctx, key, build);
    fillK(ctx, key, build, T(shade));
    ctx.translate(dx, dy); fillK(ctx, key, build, T(base)); ctx.translate(-dx, -dy);
    if (hr > 0) {
      var g = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr);
      g.addColorStop(0, 'rgba(255,255,255,' + (0.5 * (1 - 0.6 * hiN())).toFixed(3) + ')'); g.addColorStop(0.5, 'rgba(255,255,255,0.14)'); g.addColorStop(1, 'rgba(255,255,255,0)');
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
    ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.34, r * 0.4, 0, TAU); ctx.fill();
  }
  function cheek(ctx, x, y, r) { ctx.fillStyle = TA(CHEEK, 0.8); ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.7, 0, 0, TAU); ctx.fill(); }
  function piece(ctx, key, build, fill, line, lw) { fillK(ctx, key, build, T(fill)); strokeK(ctx, key, build, T(line), lw || LW); }
  function smile(ctx, x, y, w, col, lw) {
    ctx.strokeStyle = T(col); ctx.lineWidth = lw || 1.8; ctx.beginPath();
    ctx.moveTo(x - w, y); ctx.quadraticCurveTo(x - w / 2, y + w * 0.7, x, y); ctx.quadraticCurveTo(x + w / 2, y + w * 0.7, x + w, y); ctx.stroke();
  }
  function snowflake(ctx, x, y, r, a) {
    ctx.save(); ctx.translate(x, y);
    ctx.strokeStyle = 'rgba(255,255,255,' + (a == null ? 0.95 : a).toFixed(3) + ')'; ctx.lineWidth = Math.max(0.8, r * 0.28); ctx.lineCap = 'round';
    ctx.beginPath();
    for (var i = 0; i < 3; i++) { var an = i * Math.PI / 3; ctx.moveTo(-Math.cos(an) * r, -Math.sin(an) * r); ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r); }
    ctx.stroke(); ctx.restore();
  }

  // ================================================================ HAT (knitted beanie with a big pompom)
  function pomB(p) { fluffCircle(p, 0, -89.4, 9.6, 10, 0.12); }
  function domeB(p) { p.moveTo(-39, -27); p.bezierCurveTo(-43, -58, -25, -83, 0, -83); p.bezierCurveTo(25, -83, 43, -58, 39, -27); p.closePath(); }
  function brimB(p) { rr(p, -45, -31, 90, 31, 12); }
  function drawHat(ctx, c) {
    var line = lineOf(c), shade = shadeOf(c), i, j;
    // dome
    celFill(ctx, 'hat:dome', domeB, c.base, shade, -14, -58, 26, -5, -4);
    ctx.save(); clipK(ctx, 'hat:dome', domeB);
    // knit texture: columns of little V stitches (dark), with a soft light tick on every other column
    ctx.lineWidth = 1.7; ctx.strokeStyle = TA(c.dark, 0.42);
    ctx.beginPath();
    for (i = -4; i <= 4; i++) {
      var x = i * 9;
      for (j = 0; j < 7; j++) { var y = -34 - j * 7.4; ctx.moveTo(x - 3.6, y - 3); ctx.lineTo(x, y + 1.2); ctx.lineTo(x + 3.6, y - 3); }
    }
    ctx.stroke();
    ctx.strokeStyle = TA('#FFFFFF', 0.22 * (1 - 0.5 * hiN())); ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (i = -4; i <= 4; i += 2) { var x2 = i * 9 - 1; for (j = 0; j < 7; j++) { var y2 = -36 - j * 7.2; ctx.moveTo(x2 - 2.6, y2 - 2.4); ctx.lineTo(x2, y2); } }
    ctx.stroke();
    ctx.restore();
    strokeK(ctx, 'hat:dome', domeB, T(line), LW);
    // ribbed brim (folded cuff)
    celFill(ctx, 'hat:brim', brimB, mix(c.base, c.dark, 0.12), mix(c.base, c.dark, 0.48), -24, -24, 18, -3, -3.5);
    ctx.save(); clipK(ctx, 'hat:brim', brimB);
    ctx.strokeStyle = TA(c.dark, 0.5); ctx.lineWidth = 2;
    ctx.beginPath(); for (i = -38; i <= 38; i += 7.6) { ctx.moveTo(i, -27); ctx.lineTo(i, -3); } ctx.stroke();
    ctx.strokeStyle = TA(c.light, 0.45 * (1 - 0.4 * hiN())); ctx.lineWidth = 1.6;
    ctx.beginPath(); for (i = -34.2; i <= 38; i += 7.6) { ctx.moveTo(i, -26); ctx.lineTo(i, -6); } ctx.stroke();
    ctx.fillStyle = TA('#FFFFFF', 0.3 * (1 - 0.5 * hiN())); ctx.fillRect(-40, -29, 80, 2.6);
    ctx.restore();
    strokeK(ctx, 'hat:brim', brimB, T(line), LW);
    // pompom: answer colour with light fluffy strands (never the light tone alone: red must never read pink)
    celFill(ctx, 'hat:pom', pomB, c.base, shade, -4, -93, 8, -2, -2);
    ctx.save(); clipK(ctx, 'hat:pom', pomB);
    ctx.strokeStyle = TA(mix(c.base, c.light, 0.6), 0.85); ctx.lineWidth = 1.7;
    ctx.beginPath();
    var F = [[-4.5, -93, 0.5], [1.5, -96, -0.2], [5, -90, 0.9], [-5, -86, -0.6], [1, -88, 0.3], [5.5, -84.5, -0.9]];
    for (i = 0; i < F.length; i++) { var f = F[i], ca = Math.cos(f[2]) * 3.2, sa = Math.sin(f[2]) * 3.2; ctx.moveTo(f[0] - ca, f[1] - sa); ctx.quadraticCurveTo(f[0] + sa, f[1] - ca, f[0] + ca, f[1] + sa); }
    ctx.stroke();
    ctx.strokeStyle = TA(c.dark, 0.35); ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(3, -82); ctx.quadraticCurveTo(6.5, -83.5, 7.8, -87.5); ctx.stroke();
    ctx.restore();
    strokeK(ctx, 'hat:pom', pomB, T(line), LW * 0.9);
    shinyDot(ctx, -4, -94, 2.8, 1.7, -0.5, 0.6);
    shinyDot(ctx, -20, -64, 6, 3, -0.7, 0.4);
  }

  // ================================================================ GEMS (chunky ice gems in the 8 shapes)
  var SHAPE_BOX = {
    circle: { w: 100, h: 100, c: [0, -50] },
    square: { w: 96, h: 96, c: [0, -48] },
    triangle: { w: 118, h: 100, c: [0, -36] },
    star: { w: 100, h: 100, c: [0, -45] },
    heart: { w: 104, h: 100, c: [0, -58] },
    rect: { w: 132, h: 88, c: [0, -44] },
    diamond: { w: 92, h: 100, c: [0, -60] },
    oval: { w: 74, h: 100, c: [0, -50] }
  };
  // a friendly 5-point star with raised arms (tips 25° above horizontal) so the arm tips show when only the top 40 % peeks
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
  var ICE_GREY = { base: '#BFD3E4', dark: '#7E9DB8', light: '#E6F0F8' };   // a gem without a colour: clear ice
  // highlight / glint spots per shape (in the 100 box)
  var GEM_HI = { triangle: [-10, -62], diamond: [-13, -70], star: [-8, -68], heart: [-28, -80], rect: [-40, -66], oval: [-15, -76] };
  var GEM_GLINT = { triangle: [10, -52], diamond: [14, -62], star: [12, -60], heart: [26, -76], rect: [44, -66], oval: [14, -74], square: [26, -74], circle: [24, -76] };
  function drawGem(ctx, shape, c) {
    var b = SHAPE_B[shape] || SHAPE_B.circle, bx = SHAPE_BOX[shape] || SHAPE_BOX.circle, key = 'gem:' + (SHAPE_B[shape] ? shape : 'circle');
    c = c || ICE_GREY;
    var cx = bx.c[0], cy = bx.c[1], line = lineOf(c), k;
    celFill(ctx, key, b, c.base, mix(c.base, c.dark, 0.5), -bx.w * 0.2, -bx.h * 0.72, bx.h * 0.3, -6, -5.5);
    ctx.save(); clipK(ctx, key, b);
    // facets: an inner "table" (slightly lighter) and a darker lower-right crescent → chunky cut-gem look
    k = 0.56;
    ctx.save(); ctx.translate(cx + 2, cy + 3); ctx.scale(k, k); ctx.translate(-cx, -cy);
    fillK(ctx, key, b, TA(c.dark, 0.28));
    ctx.restore();
    ctx.save(); ctx.translate(cx - 1, cy - 1); ctx.scale(k, k); ctx.translate(-cx, -cy);
    fillK(ctx, key, b, T(mix(c.base, '#FFFFFF', 0.16)));
    strokeK(ctx, key, b, TA('#FFFFFF', 0.55 * (1 - 0.5 * hiN())), 2.4 / k);
    ctx.restore();
    // frosty white rim just inside the outline
    strokeK(ctx, key, b, TA('#FFFFFF', 0.6 * (1 - 0.45 * hiN())), 7);
    ctx.save(); ctx.translate(cx, cy); ctx.scale(0.9, 0.9); ctx.translate(-cx, -cy);
    strokeK(ctx, key, b, TA('#FFFFFF', 0.18 * (1 - 0.45 * hiN())), 3);
    ctx.restore();
    // glossy streak upper-left
    var H = GEM_HI[shape] || [-bx.w * 0.22, -bx.h * 0.74];
    shinyDot(ctx, H[0], H[1], 8, 3.6, -0.7, 0.75);
    shinyDot(ctx, H[0] + 8, H[1] - 7, 2.4, 2.4, 0, 0.85);
    ctx.restore();
    strokeK(ctx, key, b, T(line), LW);
    var G = GEM_GLINT[shape] || [20, -70];
    snowflake(ctx, G[0], G[1], 5.2, 0.95 * (1 - 0.3 * hiN()));
  }

  // ================================================================ FISH (silver-blue, standing on its tail, for counting)
  function fishTailB(p) {
    p.moveTo(-5, -20); p.quadraticCurveTo(-16, -12, -25, -1); p.quadraticCurveTo(-13, -5, -2, -4);
    p.quadraticCurveTo(0, -8, 2, -4); p.quadraticCurveTo(13, -5, 25, -1); p.quadraticCurveTo(16, -12, 5, -20); p.closePath();
  }
  function fishBodyB(p) {
    p.moveTo(0, -99); p.bezierCurveTo(17, -99, 26, -80, 26, -60); p.bezierCurveTo(26, -40, 15, -23, 0, -16);
    p.bezierCurveTo(-15, -23, -26, -40, -26, -60); p.bezierCurveTo(-26, -80, -17, -99, 0, -99); p.closePath();
  }
  function fishFinB(p) { p.moveTo(24, -70); p.quadraticCurveTo(36, -66, 33, -48); p.quadraticCurveTo(29, -50, 24, -48); p.closePath(); }
  function fishSideFinB(p) { p.moveTo(-22, -50); p.quadraticCurveTo(-33, -46, -31, -34); p.quadraticCurveTo(-26, -38, -20, -40); p.closePath(); }
  function drawFish(ctx) {
    var F_ = FISH;
    ctx.save();
    piece(ctx, 'fish:tail', fishTailB, F_.fin, F_.line, LW * 0.9);
    ctx.strokeStyle = TA(F_.line, 0.45); ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(-3, -14); ctx.lineTo(-15, -5); ctx.moveTo(3, -14); ctx.lineTo(15, -5); ctx.stroke();
    piece(ctx, 'fish:fin', fishFinB, F_.fin, F_.line, LW * 0.85);
    celFill(ctx, 'fish:body', fishBodyB, F_.base, F_.shade, -10, -78, 22, -4, -3);
    ctx.save(); clipK(ctx, 'fish:body', fishBodyB);
    ctx.fillStyle = T(F_.belly); ctx.beginPath(); ctx.ellipse(-15, -54, 15, 36, 0.12, 0, TAU); ctx.fill();
    // scales: little arcs on the back half
    ctx.strokeStyle = TA(F_.line, 0.4); ctx.lineWidth = 1.4;
    ctx.beginPath();
    var SC = [[8, -56], [17, -50], [8, -44], [17, -38], [8, -32], [-1, -38], [-1, -50]];
    for (var i = 0; i < SC.length; i++) { ctx.moveTo(SC[i][0] - 4.5, SC[i][1]); ctx.quadraticCurveTo(SC[i][0], SC[i][1] + 5, SC[i][0] + 4.5, SC[i][1]); }
    ctx.stroke();
    // gill
    ctx.strokeStyle = TA(F_.line, 0.6); ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(-20, -66); ctx.quadraticCurveTo(0, -60, 20, -68); ctx.stroke();
    ctx.restore();
    strokeK(ctx, 'fish:body', fishBodyB, T(F_.line), LW);
    piece(ctx, 'fish:sfin', fishSideFinB, F_.fin, F_.line, LW * 0.8);
    // face: one big happy eye, cheek, smile near the top
    ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(7, -80, 8.6, 0, TAU); ctx.fill();
    ctx.strokeStyle = T(F_.line); ctx.lineWidth = 1.6; ctx.stroke();
    eye(ctx, 8, -79.5, 5.4);
    cheek(ctx, -10, -76, 4);
    smile(ctx, -4, -88, 5, '#3E566C', 2);
    shinyDot(ctx, -11, -86, 4.5, 2.2, -0.9, 0.7);
    ctx.restore();
  }

  // ================================================================ TOYS (soft plush arctic animals)
  var TOY = {
    fox:      { base: '#F2E8DA', line: '#988470', shade: '#DCCDB8', belly: '#FFFFFF', w: 86 },
    hare:     { base: '#F8F7F4', line: '#8E929C', shade: '#DFDEE2', belly: '#FFFFFF', w: 66 },
    reindeer: { base: '#A97C57', line: '#6A4730', shade: '#8E6545', belly: '#E9D6BC', w: 84 },
    walrus:   { base: '#BE927C', line: '#7A5747', shade: '#A47B67', belly: '#DDBBA6', w: 86 },
    whale:    { base: '#8AA1B4', line: '#4F6879', shade: '#7189A0', belly: '#DCE5EC', w: 84 },
    dog:      { base: '#8C95A1', line: '#535C69', shade: '#747D8B', belly: '#F6F6F4', w: 74 },
    goose:    { base: '#FAFAF7', line: '#94979C', shade: '#E0E1DF', belly: '#FFFFFF', w: 72 },
    owl:      { base: '#F6F5F1', line: '#8F949E', shade: '#DADBE0', belly: '#FFFFFF', w: 70 }
  };
  var TOY_W = {}; for (var tk in TOY) TOY_W[tk] = TOY[tk].w / 100;
  function bodyB(p) { p.moveTo(-25, -8); p.bezierCurveTo(-31, -28, -26, -48, -12, -52); p.lineTo(12, -52); p.bezierCurveTo(26, -48, 31, -28, 25, -8); p.quadraticCurveTo(0, 2, -25, -8); p.closePath(); }
  function headB(p) { ell(p, 0, -70, 23, 21); }
  function plushBody(ctx, A, key, build) {
    celFill(ctx, key || 'toy:body', build || bodyB, A.base, A.shade, -10, -40, 16, -4, -3);
    ctx.save(); clipK(ctx, key || 'toy:body', build || bodyB);
    ctx.fillStyle = T(A.belly); ctx.beginPath(); ctx.ellipse(0, -24, 13, 15, 0, 0, TAU); ctx.fill();
    ctx.restore();
    strokeK(ctx, key || 'toy:body', build || bodyB, T(A.line), LW);
  }
  function plushFeet(ctx, A, col) {
    piece(ctx, 'toy:feet', function (p) { ell(p, -12, -6, 9, 5.5, 0); ell(p, 12, -6, 9, 5.5, 0); }, col || A.base, A.line, LW * 0.8);
    ctx.fillStyle = TA(A.line, 0.35); ctx.beginPath(); circ(ctx, -12, -6, 2.2); circ(ctx, 12, -6, 2.2); ctx.fill();
  }
  function plushArms(ctx, A, col) {
    piece(ctx, 'toy:arms', function (p) { ell(p, -23, -30, 6.5, 11, 0.35); ell(p, 23, -30, 6.5, 11, -0.35); }, col || A.base, A.line, LW * 0.8);
  }
  function seam(ctx, A) {   // a little plush seam down the tummy
    ctx.strokeStyle = TA(A.line, 0.35); ctx.lineWidth = 1.1; ctx.setLineDash && ctx.setLineDash([2.2, 2.2]);
    ctx.beginPath(); ctx.moveTo(0, -38); ctx.lineTo(0, -12); ctx.stroke();
    ctx.setLineDash && ctx.setLineDash([]);
  }
  function whiskers(ctx, col, x, y, len) {
    ctx.strokeStyle = TA(col, 0.75); ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(x - 4, y); ctx.lineTo(x - 4 - len, y - 2.5); ctx.moveTo(x - 4, y + 2.5); ctx.lineTo(x - 4 - len, y + 4);
    ctx.moveTo(x + 4, y); ctx.lineTo(x + 4 + len, y - 2.5); ctx.moveTo(x + 4, y + 2.5); ctx.lineTo(x + 4 + len, y + 4);
    ctx.stroke();
  }
  function noseTri(ctx, x, y, w, col) {
    ctx.fillStyle = T(col || EYE); ctx.beginPath();
    ctx.moveTo(x - w, y - w * 0.55); ctx.quadraticCurveTo(x, y - w * 0.9, x + w, y - w * 0.55); ctx.quadraticCurveTo(x + w * 0.3, y + w * 0.5, x, y + w * 0.6); ctx.quadraticCurveTo(x - w * 0.3, y + w * 0.5, x - w, y - w * 0.55); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.ellipse(x - w * 0.35, y - w * 0.4, w * 0.3, w * 0.16, 0, 0, TAU); ctx.fill();
  }

  function drawFox(ctx, A) {
    // big fluffy tail curling up behind on the right, with a darker-free white tip
    var tail = function (p) { p.moveTo(16, -10); p.bezierCurveTo(40, -8, 46, -34, 38, -52); p.bezierCurveTo(33, -62, 24, -58, 27, -48); p.bezierCurveTo(31, -36, 26, -22, 14, -20); p.closePath(); };
    celFill(ctx, 'fox:tail', tail, A.base, A.shade, 34, -46, 10, -3, -3); strokeK(ctx, 'fox:tail', tail, T(A.line), LW);
    ctx.strokeStyle = TA(A.line, 0.4); ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(35, -40); ctx.quadraticCurveTo(38, -30, 33, -22); ctx.stroke();
    plushBody(ctx, A); plushFeet(ctx, A); plushArms(ctx, A);
    // tall pointed ears (behind the head)
    var ears = function (p) { roundPoly(p, [[-25, -72], [-23, -100], [-6, -86]], [4, 3, 4]); roundPoly(p, [[25, -72], [23, -100], [6, -86]], [4, 3, 4]); };
    piece(ctx, 'fox:ears', ears, A.base, A.line);
    ctx.fillStyle = T('#E7C6BA'); ctx.beginPath(); ctx.moveTo(-20, -78); ctx.lineTo(-20, -93); ctx.lineTo(-10, -85); ctx.closePath(); ctx.moveTo(20, -78); ctx.lineTo(20, -93); ctx.lineTo(10, -85); ctx.closePath(); ctx.fill();
    ctx.fillStyle = T('#7E7468'); ctx.beginPath(); ctx.moveTo(-23.5, -99); ctx.lineTo(-22, -93); ctx.lineTo(-17, -95); ctx.closePath(); ctx.moveTo(23.5, -99); ctx.lineTo(22, -93); ctx.lineTo(17, -95); ctx.closePath(); ctx.fill();
    // head with fluffy cheek tufts and a pointed chin
    var head = function (p) { roundPoly(p, [[0, -90], [17, -87], [25, -76], [32, -62], [20, -57], [8, -50], [0, -49], [-8, -50], [-20, -57], [-32, -62], [-25, -76], [-17, -87]], [10, 8, 6, 2, 4, 6, 6, 6, 4, 2, 6, 8]); };
    celFill(ctx, 'fox:head', head, A.base, A.shade, -9, -80, 14, -4, -3.5); strokeK(ctx, 'fox:head', head, T(A.line), LW);
    // muzzle tone + face
    // pointed white snout
    piece(ctx, 'fox:snout', function (p) { p.moveTo(-14, -67); p.quadraticCurveTo(-9, -56, 0, -52); p.quadraticCurveTo(9, -56, 14, -67); p.quadraticCurveTo(0, -71, -14, -67); p.closePath(); }, '#FFFFFF', mix(A.line, '#FFFFFF', 0.3), 1.4);
    eye(ctx, -9, -72, 3.8); eye(ctx, 9, -72, 3.8);
    ctx.strokeStyle = T(EYE); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-13.5, -74.5); ctx.lineTo(-11.5, -75.5); ctx.moveTo(13.5, -74.5); ctx.lineTo(11.5, -75.5); ctx.stroke();
    cheek(ctx, -18, -63, 3.6); cheek(ctx, 18, -63, 3.6);
    noseTri(ctx, 0, -57.5, 3.6);
    ctx.strokeStyle = T(EYE); ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(-3.5, -53.5); ctx.quadraticCurveTo(0, -52, 3.5, -53.5); ctx.stroke();
    shinyDot(ctx, -10, -83, 5, 2.4, -0.4, 0.6);
  }
  function drawHare(ctx, A) {
    plushBody(ctx, A); plushFeet(ctx, A); plushArms(ctx, A);
    // very long upright ears with grey tips
    var ears = function (p) { ell(p, -9, -85, 6.6, 15, -0.14); ell(p, 9, -85, 6.6, 15, 0.14); };
    fillK(ctx, 'hare:ears', ears, T(A.base));
    ctx.save(); clipK(ctx, 'hare:ears', ears);
    ctx.fillStyle = T('#EFCFCB'); ctx.beginPath(); ell(ctx, -9, -83, 3, 10, -0.14); ell(ctx, 9, -83, 3, 10, 0.14); ctx.fill();
    ctx.fillStyle = T('#6E737E'); ctx.fillRect(-20, -102, 40, 8.5);
    ctx.restore();
    strokeK(ctx, 'hare:ears', ears, T(A.line), LW);
    var head = function (p) { ell(p, 0, -64, 21, 18.5); };
    celFill(ctx, 'hare:head', head, A.base, A.shade, -8, -74, 13, -4, -3); strokeK(ctx, 'hare:head', head, T(A.line), LW);
    eye(ctx, -8, -67, 3.6); eye(ctx, 8, -67, 3.6);
    cheek(ctx, -14, -58, 3.6); cheek(ctx, 14, -58, 3.6);
    ctx.fillStyle = T('#E6A6A8'); ctx.beginPath(); ctx.moveTo(-3, -61); ctx.lineTo(3, -61); ctx.lineTo(0, -58); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = T(EYE); ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(0, -58); ctx.lineTo(0, -56); ctx.moveTo(-4, -55); ctx.quadraticCurveTo(0, -54, 4, -55); ctx.stroke();
    ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = T(A.line); ctx.lineWidth = 1;
    ctx.beginPath(); rr(ctx, -2.8, -55.5, 5.6, 4.4, 1.2); ctx.fill(); ctx.stroke();
    whiskers(ctx, A.line, 0, -58, 9);
    shinyDot(ctx, -8, -75, 4.6, 2.2, -0.4, 0.6);
  }
  function drawReindeer(ctx, A) {
    plushBody(ctx, A); plushFeet(ctx, A, '#7E5A3E'); plushArms(ctx, A);
    // antlers (behind the head): thick tan branches drawn as an outlined stroke
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var antl = function (p) {
      p.moveTo(-9, -86); p.quadraticCurveTo(-14, -94, -24, -98); p.moveTo(-16, -94); p.quadraticCurveTo(-15, -98, -12, -99);
      p.moveTo(-21, -97); p.quadraticCurveTo(-29, -96, -31, -90); p.moveTo(-12, -90); p.quadraticCurveTo(-20, -88, -24, -84);
      p.moveTo(9, -86); p.quadraticCurveTo(14, -94, 24, -98); p.moveTo(16, -94); p.quadraticCurveTo(15, -98, 12, -99);
      p.moveTo(21, -97); p.quadraticCurveTo(29, -96, 31, -90); p.moveTo(12, -90); p.quadraticCurveTo(20, -88, 24, -84);
    };
    strokeK(ctx, 'rd:antl', antl, T('#8A7350'), 7.4);
    strokeK(ctx, 'rd:antl', antl, T('#DCC7A2'), 4);
    // leaf ears sticking out sideways
    piece(ctx, 'rd:ears', function (p) { ell(p, -25, -76, 9, 4.8, 0.45); ell(p, 25, -76, 9, 4.8, -0.45); }, A.base, A.line, LW * 0.9);
    ctx.fillStyle = T('#E8C7B5'); ctx.beginPath(); ell(ctx, -25, -76, 5, 2.2, 0.45); ell(ctx, 25, -76, 5, 2.2, -0.45); ctx.fill();
    var head = function (p) { ell(p, 0, -69, 21, 20); };
    celFill(ctx, 'rd:head', head, A.base, A.shade, -8, -80, 13, -4, -3); strokeK(ctx, 'rd:head', head, T(A.line), LW);
    // light forehead tuft + muzzle
    ctx.fillStyle = T('#C99E78'); ctx.beginPath(); ctx.ellipse(0, -84, 7, 4, 0, 0, TAU); ctx.fill();
    piece(ctx, 'rd:muz', function (p) { ell(p, 0, -58, 13, 9); }, A.belly, mix(A.belly, A.line, 0.5), LW * 0.7);
    eye(ctx, -9, -71, 3.8); eye(ctx, 9, -71, 3.8);
    cheek(ctx, -15, -63, 3.4); cheek(ctx, 15, -63, 3.4);
    ctx.fillStyle = T('#4A3326'); ctx.beginPath(); ctx.ellipse(0, -61, 5.2, 3.8, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(-1.8, -62.4, 1.8, 1, 0, 0, TAU); ctx.fill();
    smile(ctx, 0, -56, 3.6, '#4A3326', 1.4);
    shinyDot(ctx, -9, -80, 4.6, 2.2, -0.4, 0.5);
  }
  function drawWalrus(ctx, A) {
    var body = function (p) { p.moveTo(-30, -8); p.bezierCurveTo(-36, -30, -30, -50, -14, -54); p.lineTo(14, -54); p.bezierCurveTo(30, -50, 36, -30, 30, -8); p.quadraticCurveTo(0, 3, -30, -8); p.closePath(); };
    plushBody(ctx, A, 'wal:body', body);
    // front flippers
    piece(ctx, 'wal:flip', function (p) { ell(p, -15, -6, 12, 5, 0.12); ell(p, 15, -6, 12, 5, -0.12); }, A.shade, A.line, LW * 0.8);
    piece(ctx, 'wal:arms', function (p) { ell(p, -28, -28, 7, 12, 0.5); ell(p, 28, -28, 7, 12, -0.5); }, A.base, A.line, LW * 0.8);
    var head = function (p) { ell(p, 0, -74, 27, 21); };
    celFill(ctx, 'wal:head', head, A.base, A.shade, -10, -84, 15, -4, -3); strokeK(ctx, 'wal:head', head, T(A.line), LW);
    // long white tusks (drawn before the muzzle so they come out from under it)
    var tusks = function (p) {
      p.moveTo(-9, -64); p.quadraticCurveTo(-11, -52, -8, -41); p.quadraticCurveTo(-5, -48, -3, -63); p.closePath();
      p.moveTo(9, -64); p.quadraticCurveTo(11, -52, 8, -41); p.quadraticCurveTo(5, -48, 3, -63); p.closePath();
    };
    piece(ctx, 'wal:tusk', tusks, '#FBF8EE', '#A39880', LW * 0.75);
    // puffy whisker pads
    piece(ctx, 'wal:pads', function (p) { ell(p, -8.5, -66, 10, 7.5); ell(p, 8.5, -66, 10, 7.5); }, A.belly, A.line, LW * 0.75);
    ctx.fillStyle = TA(A.line, 0.6); ctx.beginPath();
    var D = [[-13, -67], [-9, -64], [-5, -68], [-12, -63], [13, -67], [9, -64], [5, -68], [12, -63]];
    for (var i = 0; i < D.length; i++) circ(ctx, D[i][0], D[i][1], 0.9);
    ctx.fill();
    whiskers(ctx, '#8A6A5A', 0, -65, 10);
    ctx.fillStyle = T('#5B3D33'); ctx.beginPath(); ctx.ellipse(0, -72.5, 4.4, 3, 0, 0, TAU); ctx.fill();
    eye(ctx, -11, -81, 3.6); eye(ctx, 11, -81, 3.6);
    cheek(ctx, -20, -72, 3.6); cheek(ctx, 20, -72, 3.6);
    shinyDot(ctx, -12, -88, 5.5, 2.4, -0.3, 0.55);
  }
  function drawWhale(ctx, A) {
    // tail flukes up behind on the right
    var tail = function (p) { p.moveTo(20, -18); p.quadraticCurveTo(32, -26, 32, -40); p.quadraticCurveTo(36, -50, 44, -52); p.quadraticCurveTo(42, -44, 38, -40); p.quadraticCurveTo(44, -40, 47, -34); p.quadraticCurveTo(38, -32, 34, -36); p.quadraticCurveTo(32, -24, 24, -12); p.closePath(); };
    piece(ctx, 'wh:tail', tail, A.base, A.line);
    // water spout
    var spout = function (p) {
      p.moveTo(-2, -84); p.quadraticCurveTo(-4, -92, -12, -95); p.quadraticCurveTo(-16, -97, -18, -93); p.quadraticCurveTo(-12, -93, -6, -88);
      p.quadraticCurveTo(-4, -99, 0, -100); p.quadraticCurveTo(4, -99, 6, -88); p.quadraticCurveTo(12, -93, 18, -93); p.quadraticCurveTo(16, -97, 12, -95); p.quadraticCurveTo(4, -92, 2, -84); p.closePath();
    };
    piece(ctx, 'wh:spout', spout, '#EAF3FA', '#8FAABE', LW * 0.7);
    ctx.fillStyle = T('#EAF3FA'); ctx.strokeStyle = T('#8FAABE'); ctx.lineWidth = 1.4;
    ctx.beginPath(); circ(ctx, -21, -90, 2.6); circ(ctx, 21, -90, 2.6); ctx.fill(); ctx.stroke();
    // one round plush body (the whale IS its head)
    var body = function (p) { p.moveTo(0, -86); p.bezierCurveTo(22, -86, 32, -64, 31, -40); p.bezierCurveTo(30, -16, 18, -2, 0, -2); p.bezierCurveTo(-18, -2, -30, -16, -31, -40); p.bezierCurveTo(-32, -64, -22, -86, 0, -86); p.closePath(); };
    celFill(ctx, 'wh:body', body, A.base, A.shade, -12, -70, 20, -4, -3.5);
    ctx.save(); clipK(ctx, 'wh:body', body);
    // pale belly with throat grooves
    ctx.fillStyle = T(A.belly); ctx.beginPath(); ctx.ellipse(0, -14, 24, 30, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = TA(A.line, 0.35); ctx.lineWidth = 1.3; ctx.beginPath();
    for (var i = -2; i <= 2; i++) { ctx.moveTo(i * 7, -40 + Math.abs(i) * 2); ctx.lineTo(i * 8.5, -8); }
    ctx.stroke();
    // a few light spots on the back
    ctx.fillStyle = TA('#FFFFFF', 0.35); ctx.beginPath(); circ(ctx, 14, -74, 2.4); circ(ctx, 20, -66, 1.8); circ(ctx, 9, -80, 1.5); ctx.fill();
    ctx.restore();
    strokeK(ctx, 'wh:body', body, T(A.line), LW);
    piece(ctx, 'wh:fins', function (p) { ell(p, -29, -30, 5.5, 11, 0.7); ell(p, 29, -30, 5.5, 11, -0.7); }, A.shade, A.line, LW * 0.8);
    eye(ctx, -11, -62, 4); eye(ctx, 11, -62, 4);
    cheek(ctx, -18, -53, 3.8); cheek(ctx, 18, -53, 3.8);
    smile(ctx, 0, -54, 7, '#3A4F5E', 1.8);
    shinyDot(ctx, -13, -76, 6, 2.6, -0.5, 0.55);
  }
  function drawDog(ctx, A) {
    plushBody(ctx, A); plushFeet(ctx, A, A.belly); plushArms(ctx, A);
    // husky curled tail
    var tail = function (p) { p.moveTo(20, -18); p.bezierCurveTo(36, -18, 40, -34, 32, -40); p.bezierCurveTo(28, -44, 22, -40, 26, -34); p.bezierCurveTo(28, -30, 24, -26, 18, -26); p.closePath(); };
    piece(ctx, 'dog:tail', tail, A.base, A.line, LW * 0.9);
    // upright triangle ears
    var ears = function (p) { roundPoly(p, [[-22, -74], [-18, -98], [-5, -86]], [4, 4, 4]); roundPoly(p, [[22, -74], [18, -98], [5, -86]], [4, 4, 4]); };
    piece(ctx, 'dog:ears', ears, A.base, A.line);
    ctx.fillStyle = T('#EFD2CD'); ctx.beginPath(); ctx.moveTo(-18, -80); ctx.lineTo(-17, -92); ctx.lineTo(-9, -86); ctx.closePath(); ctx.moveTo(18, -80); ctx.lineTo(17, -92); ctx.lineTo(9, -86); ctx.closePath(); ctx.fill();
    var head = function (p) { ell(p, 0, -70, 23, 20.5); };
    celFill(ctx, 'dog:head', head, A.base, A.shade, -8, -82, 13, -4, -3); strokeK(ctx, 'dog:head', head, T(A.line), LW);
    // white husky mask: lower face + forehead stripe + brow dots
    ctx.save(); clipK(ctx, 'dog:head', head);
    ctx.fillStyle = T(A.belly); ctx.beginPath();
    ctx.moveTo(-23, -66); ctx.quadraticCurveTo(-14, -70, -6, -66); ctx.quadraticCurveTo(-3, -78, 0, -90); ctx.quadraticCurveTo(3, -78, 6, -66);
    ctx.quadraticCurveTo(14, -70, 23, -66); ctx.lineTo(23, -48); ctx.lineTo(-23, -48); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = T(A.belly); ctx.beginPath(); ctx.ellipse(-9, -79, 3.4, 2.2, 0.2, 0, TAU); ctx.ellipse(9, -79, 3.4, 2.2, -0.2, 0, TAU); ctx.fill();
    eye(ctx, -9, -72, 3.7); eye(ctx, 9, -72, 3.7);
    cheek(ctx, -15, -61, 3.4); cheek(ctx, 15, -61, 3.4);
    noseTri(ctx, 0, -63, 4.4, '#2E2A33');
    ctx.strokeStyle = T(EYE); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(0, -60); ctx.lineTo(0, -58); ctx.stroke();
    smile(ctx, 0, -58, 4.4, EYE, 1.4);
    ctx.fillStyle = T('#EAA0A6'); ctx.strokeStyle = T('#B86A73'); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-2.8, -56.5); ctx.quadraticCurveTo(-3, -51.5, 0, -51.5); ctx.quadraticCurveTo(3, -51.5, 2.8, -56.5); ctx.closePath(); ctx.fill(); ctx.stroke();
    shinyDot(ctx, -9, -83, 4.6, 2.2, -0.4, 0.45);
  }
  function drawGoose(ctx, A) {
    var body = function (p) { p.moveTo(-28, -10); p.bezierCurveTo(-34, -30, -24, -48, -4, -48); p.bezierCurveTo(18, -48, 30, -34, 28, -12); p.quadraticCurveTo(0, 2, -28, -10); p.closePath(); };
    var neck = function (p) { p.moveTo(-9, -40); p.bezierCurveTo(-11, -60, -10, -74, -7, -84); p.lineTo(11, -84); p.bezierCurveTo(11, -72, 10, -58, 11, -40); p.closePath(); };
    celFill(ctx, 'gs:neck', neck, A.base, A.shade, -4, -70, 8, -2.5, 0); strokeK(ctx, 'gs:neck', neck, T(A.line), LW);
    plushBody(ctx, A, 'gs:body', body);
    // grey wings, feet ochre-grey
    piece(ctx, 'gs:wings', function (p) { ell(p, -22, -26, 8, 14, 0.4); ell(p, 22, -26, 8, 14, -0.4); }, '#C9CED4', '#8A9097', LW * 0.8);
    ctx.strokeStyle = TA('#8A9097', 0.6); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-24, -24); ctx.lineTo(-20, -18); ctx.moveTo(24, -24); ctx.lineTo(20, -18); ctx.stroke();
    piece(ctx, 'gs:feet', function (p) { ell(p, -11, -5, 9, 4.5, 0); ell(p, 11, -5, 9, 4.5, 0); }, '#C9A04A', '#866621', LW * 0.75);
    // long neck + small round head on top
    var head = function (p) { ell(p, 2, -85, 14.5, 12.5); };
    celFill(ctx, 'gs:head', head, A.base, A.shade, -4, -92, 10, -3, -2.5); strokeK(ctx, 'gs:head', head, T(A.line), LW);
    ctx.fillStyle = T(A.base); ctx.beginPath(); ctx.ellipse(1.5, -75.5, 7.6, 3.6, 0, 0, TAU); ctx.fill();   // hide the neck/head seam
    // little head tuft
    ctx.strokeStyle = T(A.line); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-1, -97); ctx.quadraticCurveTo(-3, -101, 2, -100); ctx.stroke();
    // ochre beak pointing right
    var beak = function (p) { p.moveTo(14, -88); p.quadraticCurveTo(24, -89, 28, -84.5); p.quadraticCurveTo(24, -80.5, 14, -81); p.quadraticCurveTo(12, -84.5, 14, -88); p.closePath(); };
    piece(ctx, 'gs:beak', beak, '#D3AA52', '#866621', LW * 0.75);
    ctx.strokeStyle = T('#866621'); ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(15, -84.5); ctx.lineTo(25, -84.5); ctx.stroke();
    eye(ctx, 6, -88, 3.4); eye(ctx, -5, -88, 3); cheek(ctx, 9, -80.5, 2.8);
    shinyDot(ctx, -5, -93, 3.6, 1.8, -0.4, 0.5);
    ctx.strokeStyle = TA(A.line, 0.35); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-14, -32); ctx.quadraticCurveTo(-10, -30, -6, -32); ctx.moveTo(4, -28); ctx.quadraticCurveTo(8, -26, 12, -28); ctx.stroke();
  }
  function drawOwl(ctx, A) {
    // one round egg body with ear tufts
    var body = function (p) {
      p.moveTo(0, -86); p.bezierCurveTo(8, -86, 16, -88, 22, -96); p.bezierCurveTo(28, -86, 31, -74, 31, -56); p.bezierCurveTo(31, -22, 18, -2, 0, -2);
      p.bezierCurveTo(-18, -2, -31, -22, -31, -56); p.bezierCurveTo(-31, -74, -28, -86, -22, -96); p.bezierCurveTo(-16, -88, -8, -86, 0, -86); p.closePath();
    };
    celFill(ctx, 'owl:body', body, A.base, A.shade, -12, -70, 20, -4, -3.5);
    ctx.save(); clipK(ctx, 'owl:body', body);
    // grey speckle chevrons on the tummy and crown
    ctx.strokeStyle = TA('#7D838E', 0.75); ctx.lineWidth = 1.8; ctx.beginPath();
    var SP = [[-12, -38], [0, -34], [12, -38], [-6, -26], [6, -26], [-14, -18], [14, -18], [0, -16], [-18, -84], [18, -84], [-24, -46], [24, -46]];
    for (var i = 0; i < SP.length; i++) { var s = SP[i]; ctx.moveTo(s[0] - 3, s[1] - 1.5); ctx.lineTo(s[0], s[1] + 1.5); ctx.lineTo(s[0] + 3, s[1] - 1.5); }
    ctx.stroke();
    ctx.restore();
    strokeK(ctx, 'owl:body', body, T(A.line), LW);
    piece(ctx, 'owl:wings', function (p) { ell(p, -28, -36, 7, 15, 0.25); ell(p, 28, -36, 7, 15, -0.25); }, A.shade, A.line, LW * 0.8);
    ctx.strokeStyle = TA('#7D838E', 0.7); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-29, -40); ctx.lineTo(-27, -34); ctx.moveTo(29, -40); ctx.lineTo(27, -34); ctx.stroke();
    piece(ctx, 'owl:feet', function (p) { ell(p, -9, -3, 6, 3.6, 0); ell(p, 9, -3, 6, 3.6, 0); }, '#B9AE96', '#7E7462', LW * 0.7);
    // facial disc + big yellow eyes + small hooked beak
    piece(ctx, 'owl:disc', function (p) { circ(p, -11, -64, 13); circ(p, 11, -64, 13); }, '#FFFFFF', mix(A.line, '#FFFFFF', 0.35), 1.6);
    ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); circ(ctx, -11, -64, 12.2); circ(ctx, 11, -64, 12.2); ctx.fill();
    ctx.fillStyle = T('#F1CF4E'); ctx.strokeStyle = T('#B08A1E'); ctx.lineWidth = 1.4;
    ctx.beginPath(); circ(ctx, -11, -65, 8); circ(ctx, 11, -65, 8); ctx.fill(); ctx.stroke();
    eye(ctx, -10.5, -65, 4.8); eye(ctx, 10.5, -65, 4.8);
    var beak = function (p) { p.moveTo(-4, -57); p.quadraticCurveTo(0, -59, 4, -57); p.quadraticCurveTo(2, -51, 0, -49); p.quadraticCurveTo(-2, -51, -4, -57); p.closePath(); };
    piece(ctx, 'owl:beak', beak, '#6E6A62', '#45413B', 1.2);
    cheek(ctx, -21, -54, 3.2); cheek(ctx, 21, -54, 3.2);
    shinyDot(ctx, -14, -80, 5.5, 2.4, -0.5, 0.5);
  }
  var TOY_DRAW = { fox: drawFox, hare: drawHare, reindeer: drawReindeer, walrus: drawWalrus, whale: drawWhale, dog: drawDog, goose: drawGoose, owl: drawOwl };
  function drawToy(ctx, animal) {
    var a = TOY[animal] ? animal : 'fox';
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    TOY_DRAW[a](ctx, TOY[a]);
    if (a !== 'whale' && a !== 'owl' && a !== 'walrus' && a !== 'goose') seam(ctx, TOY[a]);
    ctx.restore();
  }

  // ================================================================ TABLET (ice block with a carved letter / number)
  var TAB = { base: '#E3F0FA', line: '#7E9DB8', shade: '#C4DAEC', ink: '#2D4A6B', inkDk: '#1B3048', bevel: '#FFFFFF' };
  function tabletB(p) {
    p.moveTo(-46, -84); p.quadraticCurveTo(-46, -100, -30, -100); p.lineTo(30, -100); p.quadraticCurveTo(46, -100, 46, -84);
    p.lineTo(46, -10); p.quadraticCurveTo(46, 0, 36, 0); p.lineTo(-36, 0); p.quadraticCurveTo(-46, 0, -46, -10); p.closePath();
  }
  function carveText(ctx, txt, cx, cy, fs, maxW) {
    ctx.font = '800 ' + fs + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var mw = ctx.measureText ? (ctx.measureText(txt).width || 0) : 0;
    if (mw > maxW) { fs = Math.max(12, Math.floor(fs * maxW / mw)); ctx.font = '800 ' + fs + 'px ' + FONT; }
    ctx.lineJoin = 'round';
    ctx.fillStyle = TA(TAB.bevel, 0.95); ctx.fillText(txt, cx + 1.6, cy + 2);
    ctx.fillStyle = T(TAB.inkDk); ctx.fillText(txt, cx - 0.9, cy - 1);
    ctx.fillStyle = T(TAB.ink); ctx.fillText(txt, cx, cy);
  }
  function drawTablet(ctx, text, mid) {
    celFill(ctx, 'tab', tabletB, TAB.base, TAB.shade, -24, -84, 34, -5, -4);
    ctx.save(); clipK(ctx, 'tab', tabletB);
    // frosty top edge with a soft white band and little rounded icicle drips
    ctx.fillStyle = TA('#FFFFFF', 0.85 * (1 - 0.4 * hiN()));
    ctx.beginPath(); ctx.moveTo(-50, -104); ctx.lineTo(50, -104); ctx.lineTo(50, -93);
    var D = [[38, -93], [33, -88], [28, -93], [14, -93], [10, -89], [6, -93], [-12, -93], [-17, -87], [-22, -93], [-36, -93], [-40, -90], [-44, -93]];
    for (var i = 0; i < D.length; i++) ctx.lineTo(D[i][0], D[i][1]);
    ctx.lineTo(-50, -93); ctx.closePath(); ctx.fill();
    // inner ice cracks / facets (low, so the carving stays clean)
    ctx.strokeStyle = TA('#FFFFFF', 0.7 * (1 - 0.4 * hiN())); ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-40, -30); ctx.lineTo(-28, -16); ctx.lineTo(-30, -6); ctx.moveTo(26, -22); ctx.lineTo(36, -12); ctx.stroke();
    ctx.strokeStyle = TA(TAB.line, 0.35); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-40, -30); ctx.lineTo(-34, -40); ctx.moveTo(30, -10); ctx.lineTo(22, -4); ctx.stroke();
    // right side face, a little darker
    ctx.fillStyle = TA(TAB.line, 0.12); ctx.fillRect(34, -96, 14, 96);
    ctx.restore();
    // frame line around the face
    ctx.save(); ctx.translate(0, -50); ctx.scale(0.84, 0.86); ctx.translate(0, 50);
    strokeK(ctx, 'tab', tabletB, TA('#FFFFFF', 0.55 * (1 - 0.5 * hiN())), 2.6);
    ctx.restore();
    strokeK(ctx, 'tab', tabletB, T(TAB.line), LW);
    shinyDot(ctx, -34, -78, 3, 9, 0.1, 0.8);
    snowflake(ctx, 34, -16, 4, 0.9);
    if (text != null && text !== '') {
      var txt = String(text), n = txt.length;
      var fs = n <= 1 ? 56 : n === 2 ? 44 : n === 3 ? 34 : 27;
      carveText(ctx, txt, 0, mid ? -50 : -64, fs, 78);
    }
  }

  // ================================================================ FALLBACK (unknown kinds: a little snowball, never throws)
  function snowballB(p) { fluffCircle(p, 0, -34, 32, 12, 0.07); }
  function drawFallback(ctx) {
    celFill(ctx, 'snowball', snowballB, SNOW.base, SNOW.shade, -12, -48, 18, -4, -3);
    strokeK(ctx, 'snowball', snowballB, T(SNOW.line), LW);
  }

  // ================================================================ THINGS (public)
  function thingBox(thing, size) {
    var s = (size || 100) / 100, k = thing && thing.kind, w = 70, h = 100, top = -100, bottom = 0;
    if (k === 'hat') { w = 90; }
    else if (k === 'gem') { var b = SHAPE_BOX[thing.shape] || SHAPE_BOX.circle; w = b.w; h = b.h; top = -h; }
    else if (k === 'fish') { w = 64; }
    else if (k === 'toy') { w = (TOY[thing.animal] || TOY.fox).w; }
    else if (k === 'tablet') { w = 92; }
    else { w = 70; h = 68; top = -68; }
    return { w: w * s, h: h * s, top: top * s, bottom: bottom * s };
  }
  function drawThing(ctx, thing, size, opt) {
    if (!thing || !(size > 0)) return;
    opt = opt || {};
    var prevNight = night, prevDim = dimV, prevMode = tMode; night = clamp01(opt.night); dimV = clamp01(opt.dim); tMode = 'thing';
    var k = size / 100, wob = +opt.wob || 0, time = opt.time == null ? nowSec() : +opt.time || 0;
    ctx.save();
    try {
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      if (wob) { ctx.translate(wob, 0); ctx.rotate(wob * 0.006); }
      if (dimV) ctx.globalAlpha *= 1 - 0.12 * dimV;
      ctx.scale(k, k);
      var box = thingBox(thing, 100);
      if (opt.shadow) { ctx.fillStyle = 'rgba(50,80,120,0.2)'; ctx.beginPath(); ctx.ellipse(0, 0, box.w * 0.46, 5, 0, 0, TAU); ctx.fill(); }
      var glow = clamp01(opt.glow);
      if (glow > 0) {
        var pulse = 0.72 + 0.28 * Math.sin(time * 6), cy = (box.top + box.bottom) / 2, R = Math.max(box.w, box.h) * 0.78;
        var g = ctx.createRadialGradient(0, cy, R * 0.3, 0, cy, R);
        g.addColorStop(0, 'rgba(255,224,120,' + (0.75 * glow * pulse).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,224,120,0)');
        ctx.fillStyle = g; ctx.fillRect(-R, cy - R, 2 * R, 2 * R);
      }
      var c = pal(thing.color);
      switch (thing.kind) {
        case 'hat': drawHat(ctx, c || pal('red')); break;
        case 'gem': drawGem(ctx, thing.shape, c); break;
        case 'fish': drawFish(ctx); break;
        case 'toy': drawToy(ctx, thing.animal); break;
        case 'tablet': drawTablet(ctx, thing.text != null ? thing.text : thing.n, !!thing.textMid); break;
        default: drawFallback(ctx); break;
      }
    } finally {
      ctx.restore();
      night = prevNight; dimV = prevDim; tMode = prevMode;
    }
  }

  // ================================================================ SNOW DRIFT
  // Geometry identical to the base (world / render rely on it): pileTop = −h0·(1 − dig); rims at |x| ≈ 0.37 w grow with dig
  // up to 0.42·h0; from dig 0.3 a hole opens: ellipse centre cy = pileTop + 4 − ry, rx = 0.275 w·(0.5 + 0.5 e),
  // ry = 0.08 w·(0.25 + 0.75 e), e = smooth((dig − 0.3) / 0.7); its front lip is at pileTop + 4 = the thing's clip line.
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
  function heapH(g, x) {   // height (≥ 0) of the snow profile at x: a soft rounded drift with gentle pillowy lumps
    var W = g.w / 2, u = Math.abs(x) / W, p = 0.5, hv = 0, H = -g.pileTop;
    if (u < p) hv = 1 + Math.min(0.06, 3 / Math.max(1, H)) * (0.55 + 0.45 * Math.sin(x * 0.11 + g.seed * 31)) * (1 - Math.pow(u / p, 4));
    else if (u < 1) { var t = (u - p) / (1 - p); hv = Math.pow(0.5 + 0.5 * Math.cos(Math.PI * Math.pow(t, 0.85)), 0.8); }
    hv *= H;
    var tr = (Math.abs(x) - 0.37 * g.w) / (0.15 * g.w), rim = Math.abs(tr) < 1 ? g.rimH * Math.pow(1 - tr * tr, 1.2) : 0;
    var v = Math.max(hv, rim);
    if (v > 2) v += (0.8 + 1.2 * g.dig) * Math.sin(x * 0.075 + g.seed * 40) * Math.min(1, v / 14);
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
  function clipBuried(ctx, mound, opt) {
    opt = opt || {};
    var g = moundGeom(mound), pop = opt.pop == null ? 1 : Math.max(0, +opt.pop), wob = +opt.wob || 0;
    var sx = pop * (1 + 0.1 * (1 - Math.min(1, pop))), sy = pop, kk = wob ? wob / Math.max(20, g.h0) : 0, big = 4 * g.h0 + 400;
    function P(x, y, first) { x *= sx; y *= sy; x -= kk * y; if (first) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    var W = 0.54 * g.w, n = 12;
    ctx.beginPath(); P(-3 * g.w, -big, true); P(3 * g.w, -big); P(3 * g.w, 0); P(W, 0);
    for (var i = 1; i < n; i++) { var t = i / n, x = W - 2 * W * t, y = 2 * t * (1 - t) * 0.075 * g.w; P(x, y); }
    P(-W, 0); P(-3 * g.w, 0); ctx.closePath(); ctx.clip();
  }
  // the whole snow shape (heap + rims + ring); cached as Path2D for resting drifts (dig 0 or 1), rebuilt while digging
  function silBuild(p, g) {
    var W = 0.54 * g.w, N = 36;
    p.moveTo(-W, 0);
    var prevX = -W, prevY = 0;
    for (var i = 1; i < N; i++) {
      var x = -W + 2 * W * i / N, y = -heapH(g, x);
      p.quadraticCurveTo(prevX, prevY, (prevX + x) / 2, (prevY + y) / 2);
      prevX = x; prevY = y;
    }
    p.quadraticCurveTo(prevX, prevY, W, 0);
    p.quadraticCurveTo(0, 0.075 * g.w, -W, 0);
    p.closePath();
    if (g.ring) { var h = g.hole; p.moveTo(g.ring.rx, h.cy); p.ellipse(0, h.cy, g.ring.rx, g.ring.ry, 0, 0, TAU); }
  }
  function silPath(g) {
    if (typeof Path2D === 'undefined' || (g.dig > 0.001 && g.dig < 0.999)) return null;
    return P2('sil:' + g.w.toFixed(1) + ':' + g.h0.toFixed(1) + ':' + (g.dig > 0.5 ? 1 : 0) + ':' + g.seed, function (p) { silBuild(p, g); });
  }
  function silFill(ctx, g, style) { ctx.fillStyle = style; var p = silPath(g); if (p) ctx.fill(p); else { ctx.beginPath(); silBuild(ctx, g); ctx.fill(); } }
  function silStroke(ctx, g, style, lw) { ctx.strokeStyle = style; ctx.lineWidth = lw; var p = silPath(g); if (p) ctx.stroke(p); else { ctx.beginPath(); silBuild(ctx, g); ctx.stroke(); } }
  function silClip(ctx, g) { var p = silPath(g); if (p) ctx.clip(p); else { ctx.beginPath(); silBuild(ctx, g); ctx.clip(); } }
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
  function paintSnow(ctx, g, opt, time) {
    var glow = clamp01(opt.glow), i;
    ctx.lineJoin = 'round';
    if (glow > 0) {
      var pulse = 0.6 + 0.4 * Math.sin(time * 6);
      silStroke(ctx, g, 'rgba(255,206,70,' + (0.34 * glow * pulse).toFixed(3) + ')', 22);
      silStroke(ctx, g, 'rgba(255,226,130,' + (0.6 * glow).toFixed(3) + ')', 12);
    }
    // soft blue contact shadow on the ground, offset to the lower right
    ctx.fillStyle = 'rgba(70,100,140,' + (0.22 * (1 - 0.2 * night)).toFixed(3) + ')';
    ctx.beginPath(); ctx.ellipse(0.05 * g.w, 0.022 * g.w, 0.56 * g.w, 0.068 * g.w, 0, 0, TAU); ctx.fill();
    silStroke(ctx, g, glow > 0 ? mix(S('line'), '#E8A014', 0.6 * glow) : S('line'), 5);
    ctx.save();
    silClip(ctx, g);
    // shade everywhere, the lit snow nudged up-left → a blue shadow band on the lower right
    ctx.fillStyle = S('shade'); ctx.fillRect(-g.w, -2 * g.h0 - 20, 2 * g.w, 2 * g.h0 + 0.2 * g.w + 40);
    ctx.save(); ctx.translate(-0.05 * g.w, -0.12 * g.h0 - 2); silFill(ctx, g, S('base')); ctx.restore();
    // bright top highlight (moon-rim at night)
    var hx = -0.14 * g.w, hy = Math.min(-8, g.pileTop * 0.75 - 4), hr = 0.34 * g.w;
    var hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr);
    hg.addColorStop(0, SA('hi', 0.95)); hg.addColorStop(0.55, SA('hi', 0.35)); hg.addColorStop(1, SA('hi', 0));
    ctx.fillStyle = hg; ctx.fillRect(hx - hr, hy - hr, 2 * hr, 2 * hr);
    // a soft blue-grey pillow crease low on the drift, and sparkle dots (deterministic per drift)
    if (g.pileTop < -14) {
      ctx.strokeStyle = SA('line', 0.28); ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0.08 * g.w, -0.18 * g.h0); ctx.quadraticCurveTo(0.22 * g.w, -0.26 * g.h0, 0.34 * g.w, -0.12 * g.h0); ctx.stroke();
    }
    for (i = 0; i < 9; i++) {
      var a = (g.seed * 997 + i * 61.7) % 1, b = (g.seed * 571 + i * 37.3) % 1, x = (a - 0.5) * 0.8 * g.w, top = -heapH(g, x);
      if (top > -6) continue;
      var y = top + (0.2 + 0.65 * b) * (0 - top) + 2;
      ctx.fillStyle = i % 3 ? SA('dot', 0.6) : SA('hi', 1);
      ctx.beginPath(); ctx.arc(x, y, i % 4 ? 1.5 : 2.3, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  function drawHoleBack(ctx, mound, opt) {
    if (!mound) return;
    opt = opt || {};
    var g = moundGeom(mound);
    if (!g.hole) return;
    var prevNight = night, prevMode = tMode; night = clamp01(opt.night); tMode = 'scene';
    var time = opt.time == null ? nowSec() : +opt.time || 0, h = g.hole;
    ctx.save();
    if (moundSetup(ctx, g, opt)) {
      ctx.save();
      ctx.beginPath(); columnPath(ctx, g, 4 * g.h0 + 200); ctx.clip();
      paintSnow(ctx, g, opt, time);
      ctx.restore();
      // the hole: icy blue, lit back wall at the top, deep at the front
      ctx.save();
      ctx.beginPath(); ctx.ellipse(0, h.cy, h.rx, h.ry, 0, 0, TAU);
      ctx.fillStyle = S('holeDeep'); ctx.fill();
      ctx.clip();
      var gg = ctx.createLinearGradient(0, h.cy - h.ry, 0, h.cy + h.ry);
      gg.addColorStop(0, S('hole')); gg.addColorStop(0.55, SA('hole', 0.6)); gg.addColorStop(1, SA('hole', 0));
      ctx.fillStyle = gg; ctx.beginPath(); ctx.ellipse(0, h.cy - h.ry * 0.45, h.rx * 1.02, h.ry * 0.95, 0, 0, TAU); ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = SA('holeDeep', 0.7);
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
    var g = moundGeom(mound), time = opt.time == null ? nowSec() : +opt.time || 0, h = g.hole;
    ctx.save();
    if (moundSetup(ctx, g, opt)) {
      ctx.save();
      if (h) { ctx.beginPath(); var big = 4 * g.h0 + 200; ctx.rect(-2 * g.w, -big, 4 * g.w, 2 * big); columnPath(ctx, g, big); ctx.clip('evenodd'); }
      paintSnow(ctx, g, opt, time);
      ctx.restore();
      if (h) {   // the front lip of the hole: a fluffy white rim
        ctx.lineCap = 'round';
        ctx.lineWidth = 2.6; ctx.strokeStyle = S('line');
        ctx.beginPath(); ctx.ellipse(0, h.cy, h.rx, h.ry, 0, Math.PI, 0, true); ctx.stroke();
        ctx.lineWidth = 3; ctx.strokeStyle = SA('hi', 0.95);
        ctx.beginPath(); ctx.ellipse(0, h.cy + 3, h.rx * 0.92, h.ry, 0, Math.PI * 0.85, Math.PI * 0.15, true); ctx.stroke();
      }
      var sp = clamp01(opt.sparkle);
      if (sp > 0) {
        ctx.fillStyle = 'rgba(255,246,200,' + (0.95 * sp).toFixed(3) + ')';
        for (var i = 0; i < 5; i++) {
          var a = g.seed * 10 + i * 1.257 + time * 0.9, tw = 0.6 + 0.4 * Math.sin(time * 7 + i * 2.1);
          sparkleStar(ctx, Math.cos(a) * 0.42 * g.w, g.pileTop * 0.6 - 10 + Math.sin(a) * 0.16 * g.w, (6 + 5 * tw) * (0.5 + 0.5 * sp), a);
        }
      }
    }
    ctx.restore();
    night = prevNight; tMode = prevMode;
  }

  // ================================================================ PAW (drawShovel), SNOW BIT, AURORA (drawShelf)
  var FUR = { base: '#FBF5E8', shade: '#E2D7C1', line: '#9A8C74', hi: '#FFFFFF', pad: '#4A4048', padHi: '#7A6E78' };
  // arm from the top (y −102) down to a big round mitt; origin = the rounded paw tip (0, 0); built in the 100 box.
  // The arm edges are scalloped fur; the mitt is wider than the arm, with four toe bumps along the tip.
  function armB(p) {
    p.moveTo(-19, -98); p.bezierCurveTo(-20, -82, -22, -62, -23, -44); p.lineTo(23, -44); p.bezierCurveTo(22, -62, 20, -82, 19, -98);
    p.bezierCurveTo(19, -110, -19, -110, -19, -98); p.closePath();
  }
  var TOES = [-19.5, -6.5, 6.5, 19.5];
  function mittB(p) {   // a round paw with four toe lobes along the tip (the lobes ARE the silhouette)
    p.moveTo(-26, -52);
    p.bezierCurveTo(-33, -40, -33, -20, -26, -8);
    for (var i = 0; i < TOES.length; i++) p.arc(TOES[i], -6.6, 6.5, Math.PI, 0, true);
    p.bezierCurveTo(33, -20, 33, -40, 26, -52);
    p.quadraticCurveTo(0, -60, -26, -52); p.closePath();
  }
  function drawShovel(ctx, angle, size, opt) {
    opt = opt || {};
    var prevNight = night, prevMode = tMode; night = clamp01(opt.night); tMode = 'thing';   // Nuka's paw keeps its warm cream at night
    var k = (size || 100) / 100, snow = clamp01(opt.sand);
    ctx.save(); ctx.rotate(+angle || 0); ctx.scale(k, k); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // arm
    celFill(ctx, 'paw:arm', armB, FUR.base, FUR.shade, -8, -84, 18, -5, 0);
    strokeK(ctx, 'paw:arm', armB, T(FUR.line), 3.2);
    ctx.strokeStyle = TA(FUR.line, 0.38); ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-5, -98); ctx.quadraticCurveTo(-8, -90, -4, -84); ctx.moveTo(7, -86); ctx.quadraticCurveTo(4, -78, 8, -72); ctx.stroke();
    // mitt
    celFill(ctx, 'paw:mitt', mittB, FUR.base, FUR.shade, -12, -36, 20, -5, -3);
    strokeK(ctx, 'paw:mitt', mittB, T(FUR.line), 3.2);
    // fur tufts where the arm meets the paw
    ctx.strokeStyle = TA(FUR.line, 0.5); ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(-16, -55); ctx.quadraticCurveTo(-12, -50, -8, -55); ctx.moveTo(-4, -56); ctx.quadraticCurveTo(0, -51, 4, -56); ctx.moveTo(8, -55); ctx.quadraticCurveTo(12, -50, 16, -55); ctx.stroke();
    // toe creases + four little dark toe beans peeking at the tip
    ctx.strokeStyle = TA(FUR.line, 0.7); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-13, -4); ctx.lineTo(-13, -13); ctx.moveTo(0, -4); ctx.lineTo(0, -14); ctx.moveTo(13, -4); ctx.lineTo(13, -13); ctx.stroke();
    ctx.fillStyle = T(FUR.pad);
    ctx.beginPath(); for (var ti = 0; ti < TOES.length; ti++) ell(ctx, TOES[ti], -2.6, 3.8, 2.3, 0); ctx.fill();
    ctx.fillStyle = TA(FUR.padHi, 0.9); ctx.beginPath(); for (ti = 0; ti < TOES.length; ti++) ell(ctx, TOES[ti] - 1.2, -3.4, 1.4, 0.7, 0); ctx.fill();
    ctx.fillStyle = TA(CHEEK, 0.55); ctx.beginPath(); ctx.ellipse(16, -30, 6, 3.6, 0, 0, TAU); ctx.fill();
    shinyDot(ctx, -14, -38, 6, 3.2, -0.4, 0.75);
    if (snow > 0) {   // a fluffy scoop of snow heaped on the paw tip
      var hgt = 8 + 14 * snow, wd = 15 + 10 * snow, by = -4;
      ctx.beginPath(); ctx.moveTo(-wd, by);
      ctx.bezierCurveTo(-wd * 1.05, by - hgt * 0.8, -wd * 0.35, by - hgt * 1.15, 1, by - hgt);
      ctx.bezierCurveTo(wd * 0.5, by - hgt * 1.1, wd * 1.05, by - hgt * 0.55, wd, by);
      ctx.quadraticCurveTo(wd * 0.4, by + 7, 0, by + 5); ctx.quadraticCurveTo(-wd * 0.4, by + 7, -wd, by); ctx.closePath();
      ctx.fillStyle = S('base'); ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = S('line'); ctx.stroke();
      ctx.fillStyle = S('shade'); ctx.beginPath(); ctx.ellipse(wd * 0.35, by - hgt * 0.1, wd * 0.42, hgt * 0.18, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = SA('hi', 1); ctx.beginPath(); ctx.ellipse(-wd * 0.3, by - hgt * 0.62, wd * 0.3, hgt * 0.15, -0.3, 0, TAU); ctx.fill();
      ctx.fillStyle = SA('dot', 0.7); ctx.beginPath(); circ(ctx, wd * 0.4, by - hgt * 0.5, 1.3); circ(ctx, -wd * 0.55, by - 3, 1.2); ctx.fill();
    }
    ctx.restore();
    night = prevNight; tMode = prevMode;
  }
  function drawSandBit(ctx, r, rot, opt) {
    opt = opt || {};
    if (!(r > 0)) return;
    var prevNight = night, prevMode = tMode; night = clamp01(opt.night); tMode = 'scene';
    var seed = opt.seed == null ? 0.37 : +opt.seed, n = 7;
    ctx.save(); ctx.rotate(+rot || 0);
    if (opt.alpha != null) ctx.globalAlpha *= clamp01(opt.alpha);
    ctx.beginPath();
    for (var i = 0; i <= n; i++) {
      var a = i / n * TAU, q = r * (0.84 + 0.22 * Math.abs(Math.sin(i * 2.3 + seed * 9)));
      var am = (i - 0.5) / n * TAU, qm = r * 1.08;
      if (!i) ctx.moveTo(Math.cos(a) * q, Math.sin(a) * q); else ctx.quadraticCurveTo(Math.cos(am) * qm, Math.sin(am) * qm, Math.cos(a) * q, Math.sin(a) * q);
    }
    ctx.closePath();
    ctx.fillStyle = S('base'); ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.16); ctx.strokeStyle = S('line'); ctx.stroke();
    ctx.fillStyle = S('shade'); ctx.beginPath(); ctx.ellipse(r * 0.25, r * 0.32, r * 0.5, r * 0.3, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = SA('hi', 1); ctx.beginPath(); ctx.ellipse(-r * 0.28, -r * 0.3, r * 0.34, r * 0.22, -0.5, 0, TAU); ctx.fill();
    ctx.restore();
    night = prevNight; tMode = prevMode;
  }
  // Aurora ribbon: a translucent wavy band (green → teal → violet) with soft vertical curtain rays and glowing slot rings.
  var AUR = ['#7FE3B0', '#6FD3E0', '#B9A3F0'];
  function drawShelf(ctx, shelf, opt) {
    if (!shelf) return;
    opt = opt || {};
    var x = +shelf.x || 0, y = +shelf.y || 0, w = +shelf.w || 0, h = +shelf.h || 0;
    if (!(w > 0) || !(h > 0)) return;
    var t = opt.t != null ? +opt.t || 0 : opt.time != null ? +opt.time || 0 : nowSec();
    var slots = shelf.slots || [], nSlots = slots.length || 12;
    var n = opt.n != null ? Math.max(0, +opt.n || 0) : 0, fill = Math.min(1, n / Math.max(4, nSlots));
    var ripple = clamp01(opt.ripple), nt = clamp01(opt.night), flash = clamp01(opt.glow);
    var alpha = (opt.alpha == null ? 1 : clamp01(opt.alpha)) * (0.85 + 0.15 * nt) * (0.7 + 0.3 * fill + 0.25 * flash + 0.2 * ripple);
    if (alpha <= 0.01) return;
    var mid = y + h * 0.5, amp = h * (0.13 + 0.12 * ripple), thick = h * (0.22 + 0.14 * fill + 0.08 * ripple);
    var N = 28, top = [], bot = [], i, u, xx, yy, th;
    for (i = 0; i <= N; i++) {
      u = i / N; xx = x + u * w;
      yy = mid + amp * Math.sin(u * 7.2 + t * 0.7) + amp * 0.45 * Math.sin(u * 15 - t * 1.1) + ripple * h * 0.12 * Math.sin(u * 22 - t * 9);
      th = thick * (0.6 + 0.4 * Math.sin(u * 5.3 + t * 0.5 + 1.3)) * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, Math.max(0, u * 1.06 - 0.03))));
      top.push([xx, yy - th]); bot.push([xx, yy + th * 0.55]);
    }
    ctx.save();
    ctx.beginPath(); ctx.rect(x - 4, y - h * 0.2, w + 8, h * 1.25); ctx.clip();   // never leak outside the ribbon box
    ctx.globalAlpha *= alpha;
    ctx.globalCompositeOperation = nt > 0.3 ? 'lighter' : 'source-over';
    var ba = (0.5 + 0.22 * (1 - nt)).toFixed(3), gx = ctx.createLinearGradient(x, 0, x + w, 0);
    gx.addColorStop(0, 'rgba(127,227,176,0)'); gx.addColorStop(0.08, 'rgba(127,227,176,' + ba + ')'); gx.addColorStop(0.45, 'rgba(111,211,224,' + ba + ')');
    gx.addColorStop(0.85, 'rgba(185,163,240,' + ba + ')'); gx.addColorStop(1, 'rgba(185,163,240,0)');
    // curtain rays rising from the band (soft vertical gradient strips)
    var rays = 18, rayH = h * (0.45 + 0.3 * fill + 0.25 * ripple);
    for (i = 0; i < rays; i++) {
      u = (i + 0.5) / rays; var k = Math.round(u * N), rx = x + u * w, ry = top[k][1];
      var ra = (0.16 + 0.14 * Math.sin(t * 1.3 + i * 1.7)) * (0.6 + 0.4 * fill) * (0.45 + 0.55 * nt);
      if (ra <= 0.02) continue;
      var col = u < 0.45 ? AUR[0] : u < 0.8 ? AUR[1] : AUR[2], c3 = rgb(col);
      var rg = ctx.createLinearGradient(0, ry + 4, 0, ry - rayH);
      rg.addColorStop(0, 'rgba(' + c3[0] + ',' + c3[1] + ',' + c3[2] + ',' + ra.toFixed(3) + ')'); rg.addColorStop(1, 'rgba(' + c3[0] + ',' + c3[1] + ',' + c3[2] + ',0)');
      ctx.fillStyle = rg; ctx.fillRect(rx - w / rays * 0.32, ry - rayH, w / rays * 0.64, rayH + 6);
    }
    // the band (two passes: wide soft + thinner bright core)
    for (var pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      var sc = pass ? 0.45 : 1;
      for (i = 0; i <= N; i++) { var m = (top[i][1] + bot[i][1]) / 2, py = m + (top[i][1] - m) * sc; if (i) ctx.lineTo(top[i][0], py); else ctx.moveTo(top[i][0], py); }
      for (i = N; i >= 0; i--) { var m2 = (top[i][1] + bot[i][1]) / 2; ctx.lineTo(bot[i][0], m2 + (bot[i][1] - m2) * sc); }
      ctx.closePath();
      ctx.fillStyle = gx; ctx.globalAlpha *= pass ? 1.15 : 1; ctx.fill();
    }
    // slot rings where the finds settle (brighter once filled)
    if (opt.slots !== false && slots.length) {
      var sz = +shelf.size || 64;
      for (i = 0; i < slots.length; i++) {
        var s = slots[i], on = i < n, cy = s.y - sz * 0.45, R = sz * 0.5;
        var pulse = 0.75 + 0.25 * Math.sin(t * 2.2 + i * 0.9);
        var rg2 = ctx.createRadialGradient(s.x, cy, R * 0.3, s.x, cy, R * 1.1);
        rg2.addColorStop(0, 'rgba(220,255,240,0)'); rg2.addColorStop(0.7, 'rgba(200,255,235,' + ((on ? 0.38 : 0.14) * pulse).toFixed(3) + ')'); rg2.addColorStop(1, 'rgba(200,255,235,0)');
        ctx.fillStyle = rg2; ctx.fillRect(s.x - R * 1.1, cy - R * 1.1, R * 2.2, R * 2.2);
        ctx.strokeStyle = 'rgba(235,255,250,' + ((on ? 0.55 : 0.22) * pulse).toFixed(3) + ')'; ctx.lineWidth = on ? 2.4 : 1.6;
        ctx.beginPath(); ctx.ellipse(s.x, cy, R * 0.82, R * 0.82, 0, 0, TAU); ctx.stroke();
      }
    }
    // twinkles riding on the band
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (i = 0; i < 6 + Math.round(6 * fill); i++) {
      u = ((i * 0.618 + t * 0.03) % 1); var k2 = Math.round(u * N), tw = 0.5 + 0.5 * Math.sin(t * 4 + i * 2.3);
      sparkleStar(ctx, top[k2][0], (top[k2][1] + bot[k2][1]) / 2, 2 + 3 * tw, 0.3 * i);
    }
    ctx.restore();
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
    try {
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
        case 'hat': case 'gem': case 'toy': case 'fish': case 'tablet':
          fitThing(ctx, thing, s, thing.kind === 'gem' ? 0.84 : 0.88);
          break;
        case 'number': case 'letter':
          fitThing(ctx, { kind: 'tablet', text: thing.kind === 'number' ? thing.n : thing.text, textMid: true }, s, 0.88);
          break;
        case 'dots': {   // n fish standing in a tidy grid (rows of ≤ 5), as big as the cells allow
          var n = Math.max(0, Math.min(20, thing.n | 0)), per = n <= 3 ? n : n <= 4 ? 2 : n <= 6 ? 3 : 5;
          var rows = Math.ceil(n / Math.max(1, per)), cw = s * 0.92 / Math.max(per, 1), chh = s * 0.92 / Math.max(rows, 1);
          var bs = Math.min(chh * 0.92, cw * 1.45, s * 0.6);
          for (var i = 0; i < n; i++) {
            var row = Math.floor(i / per), inRow = Math.min(per, n - row * per), col = i - row * per;
            var x = (col - (inRow - 1) / 2) * cw, y = (row - (rows - 1) / 2) * chh;
            ctx.save(); ctx.translate(x, y + bs / 2); drawThing(ctx, { kind: 'fish' }, bs, { time: 0 }); ctx.restore();
          }
          break;
        }
        case 'size': {
          // {kind:'size', size:'big'|'small', of:'fish'|'hat'|'toy', color?, animal?} — big and small share the bottom line
          var small = thing.size === 'small', of = thing.of || thing.what || 'fish';
          var inner = { kind: of === 'hat' || of === 'toy' || of === 'gem' ? of : 'fish', color: thing.color || (of === 'hat' ? 'red' : undefined), animal: thing.animal || 'fox', shape: thing.shape || 'circle' };
          var ib = thingBox(inner, 100), fit = Math.min(1, 100 / ib.w);
          var hh = s * (small ? 0.5 : 0.88) * fit;
          ctx.save(); ctx.translate(0, s * 0.44); drawThing(ctx, inner, hh, { time: 0 }); ctx.restore();
          break;
        }
        default: break;
      }
    } finally { ctx.restore(); }
  }

  // ================================================================ GHOST HAND
  function drawGhostHand(ctx, size, t, opt) {
    opt = opt || {};
    var s = +size || 110, F = '#FFF8EC', L = '#B49470', SH = '#EBDCC4', EDGE = '#3E4A6A';
    var ph = (((+t || 0) % 1) + 1) % 1, rub = !!opt.rub;
    var press = rub ? 0 : ph < 0.18 ? 1 - ph / 0.18 : ph > 0.85 ? (ph - 0.85) / 0.15 : 0;
    ctx.save();
    if (rub) {
      // swish: the fingertip slides left ↔ right; curved motion lines on both sides + a double arrow below the tip
      var sw = Math.sin(ph * TAU), dx = sw * s * 0.2;
      ctx.lineCap = 'round';
      for (var k = 0; k < 2; k++) {
        var side = k ? 1 : -1, al = 0.35 + 0.55 * Math.max(0, side * sw);
        ctx.strokeStyle = 'rgba(255,255,255,' + al.toFixed(3) + ')'; ctx.lineWidth = s * 0.035;
        var a0 = side > 0 ? 0 : Math.PI;
        ctx.beginPath(); ctx.arc(side * s * 0.2, -s * 0.02, s * 0.14, a0 - 0.8, a0 + 0.8); ctx.stroke();
        ctx.beginPath(); ctx.arc(side * s * 0.2, -s * 0.02, s * 0.24, a0 - 0.55, a0 + 0.55); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = s * 0.04;
      var ay = -s * 0.16;
      ctx.beginPath(); ctx.moveTo(-s * 0.22, ay); ctx.lineTo(s * 0.22, ay);
      ctx.moveTo(-s * 0.15, ay - s * 0.06); ctx.lineTo(-s * 0.23, ay); ctx.lineTo(-s * 0.15, ay + s * 0.06);
      ctx.moveTo(s * 0.15, ay - s * 0.06); ctx.lineTo(s * 0.23, ay); ctx.lineTo(s * 0.15, ay + s * 0.06);
      ctx.stroke();
      ctx.translate(dx, 0); ctx.rotate(-sw * 0.12);
    } else if (ph < 0.3) {
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
    // cuff: a ribbed knit cuff in Nuka's warm brown scarf colours
    ctx.fillStyle = '#A8714A'; ctx.strokeStyle = '#7A4E30'; ctx.lineWidth = s * 0.04;
    ctx.beginPath(); rr(ctx, -s * 0.24, s * 0.76, s * 0.44, s * 0.14, s * 0.05); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = EDGE; ctx.stroke();
    ctx.strokeStyle = '#C99670'; ctx.lineWidth = Math.max(1, s * 0.016);
    ctx.beginPath(); for (var r = -0.18; r <= 0.16; r += 0.07) { ctx.moveTo(s * r, s * 0.785); ctx.lineTo(s * r, s * 0.875); } ctx.stroke();
    ctx.restore();
  }

  NK.DigArt = {
    drawThing: drawThing, thingBox: thingBox, drawMound: drawMound, drawHoleBack: drawHoleBack, moundGeom: moundGeom, clipBuried: clipBuried,
    moundSurface: moundSurface, drawShovel: drawShovel, drawPaw: drawShovel, drawSandBit: drawSandBit, drawSnowBit: drawSandBit,
    drawShelf: drawShelf, drawAurora: drawShelf, drawIcon: drawIcon, drawGhostHand: drawGhostHand, pal: pal, PALETTE: FALLBACK_PALETTE,
    SNOW: SNOW, SAND: SNOW, FISH: FISH, FUR: FUR, FONT: FONT, SHAPE_BOX: SHAPE_BOX, TOY_W: TOY_W, KINDS: ['hat', 'gem', 'fish', 'toy', 'tablet'],
    ANIMALS: Object.keys(TOY), clearCache: clearCache
  };
})(typeof window !== 'undefined' ? (window.NK = window.NK || {}) : (global.NK = global.NK || {}));
