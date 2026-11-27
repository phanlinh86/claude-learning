/* Tupi's Bakery Delivery — BD.HouseArt (character artist B), DESIGN §3 / §4.3. Pure canvas code, node-safe at load
 * (no DOM touched until the first draw). Grown from the river game's stone_art.js (thing / badge / hint-hand / snowflake code).
 *
 *   drawHouse(ctx, S, opt)             a gingerbread house, S = width (height ≈ 0.98·S incl. the gumdrop). ORIGIN = the DOOR
 *                                      point = bottom-centre of the house. opt = { seed (roof style 0..2, window style 0..2,
 *                                      gumdrop colour from a calm set), color (answer colour name: roof icing + door in that
 *                                      colour + a round colour-blob plaque in the gable) | null, sign: thing | null (sign
 *                                      mode: a big cream board over the door shows the thing; thing box = 0.56·S), door 0..1
 *                                      (hinged on the left, dark warm interior), lit 0..1 (windows glow), glow 0..1 (hint:
 *                                      warm outline), active 0..1 (soft ring on the table + a little lift), squash (scaleY,
 *                                      1 = none; x widens to keep the volume), snow 0..1 (snow icing), alpha, lang ('@odd') }
 *   houseBox(S, opt)                   { x0, y0, x1, y1, w, h, signC:[x,y], signR, signW, signH, chimney:[x,y], door:{x0,y0,x1,y1},
 *                                      windows:[[x,y]…] } relative to the door point (opt.color → signC/signR = the plaque)
 *   drawThing(ctx, thing, size, opt)   size = box height in px; ORIGIN = BOTTOM-CENTRE. thing.kind ∈ KINDS:
 *       treat {obj ∈ cupcake|macaron|donut|cakepop|jelly, color} · shape {shape, color} · cookies {n 1–12} · dots {n, numeral}
 *       · tile {text | n} ('@odd' / '@even' → the word in opt.lang / BD.lang) · animal {animal} · home {home} · blob {color}
 *       big:false → drawn at size × 0.6.  opt = { glow 0..1, wiggle −1..1, rot, alpha, count (dots / cookies: the first `count`
 *       are ringed while counted aloud), shadow (default true), direct (skip the bitmap cache), lang }
 *   drawHomeBadge(ctx, home, r, opt)   farm|sea|ice|jungle|savanna; opt { a, pop }            (centred)
 *   drawSnowflake(ctx, r, rot, a)      centred
 *   drawIcon(ctx, choice, size)        centred in a size × size box: any thing, {kind:'color', color}, {kind:'number', n},
 *                                      {kind:'home', home}, {kind:'size', big, thing?}, {kind:'letter', text}
 *   drawHintHand(ctx, x, y, press, alpha, size?)  fingertip at (x, y), points UP-LEFT
 *   drawHeartPuff(ctx, r, a)           a soft pink-white heart-shaped smoke puff, centred, r = half width
 *   drawSprinkle(ctx, kind, r, rot)    kind 0..5 (0–2 rods, 3–5 dots; colour = kind), r = half length; pastels (HSL S ≤ 0.5)
 *   dotLayout(n, numeral), cookieLayout(n) → { n, rs, pts } centres in the 100-unit box (origin bottom-centre, y up negative)
 *   thingTop(thing, size) → px above the origin where the thing's top is
 *   Helpers: pal, lineOf, contrast, PALETTE, KINDS, TREATS, SHAPES, ANIMALS, HOMES, SMALL, HOUSE, SIGN, INK, SPRINKLES,
 *            thingKey, variant, clearCache, stats
 *
 * Things are designed in a 100-unit box (x −50..50, y −50..50) and shifted so their foot sits on the origin. Paths are
 * cached as Path2D. In a browser every thing is rasterised once per thing + device-px bucket (×1.1 steps); every house body
 * (walls, roof, chimney, gumdrop, windows, the sign board with its thing, snow) once per (seed variant, colour, sign key,
 * snow quarter, device-px bucket). Door, lit windows, glow, active and squash are drawn per frame on top.
 * Without `document` everything is drawn as vectors (unit tests).
 */
(function (G) {
  'use strict';
  var BD = G.BD = G.BD || {};

  var TAU = Math.PI * 2, LW = 3.4;
  var FONT = 'ui-rounded, "Arial Rounded MT Bold", "SF Pro Rounded", Nunito, "Varela Round", system-ui, sans-serif';
  var FALLBACK = {
    red:    { base: '#E84A4A', dark: '#A8282E', light: '#F7A0A0' },
    blue:   { base: '#3C8DE8', dark: '#1F5BA8', light: '#A6CCF5' },
    yellow: { base: '#FFD23F', dark: '#C99A12', light: '#FFEB9C' },
    green:  { base: '#4CC26B', dark: '#2A8343', light: '#A8E6B8' },
    orange: { base: '#FF9A2E', dark: '#C4650C', light: '#FFCB8E' },
    purple: { base: '#8E44AD', dark: '#6840A8', light: '#D2BDF3' },
    pink:   { base: '#FF8FC0', dark: '#C9558A', light: '#FFCCE2' }
  };
  var TABLE = '#F6ECD8';
  var HOUSE = { wall: '#C98A52', shade: '#A86C3C', line: '#7E4E2A', light: '#E2AE78', trim: '#FFF8EC', roof: '#FFF2DC',
    roofDark: '#E8D2AE', roofLine: '#B28B5E', door: '#B5773F', doorDark: '#8E5A2C', doorLine: '#6A4220', inside: '#4A2E22',
    glass: '#7C5B4A', lit: '#FFD47A', litLight: '#FFF0B8' };
  var SNOWC = { base: '#F7F9FC', shade: '#D3DCE8', line: '#A5B3C6' };
  var SIGN = { base: '#F3E6CC', dark: '#D9C29A', light: '#FFF8E8', line: '#9C7A5A' };
  var POST = { base: '#B88A5E', dark: '#8A6440', light: '#D8B48C', line: '#6E4E34' };
  var BISC = { base: '#D9A066', dark: '#A8703C', light: '#F2C990', line: '#7A4C27' };
  var CREAM = { base: '#FFF6E6', dark: '#E8D6B6', light: '#FFFFFF', line: '#B59670' };
  var CHIP = '#5A3826';
  var INK = '#3A3640';
  var GUMS = ['#E7C9CC', '#CADCC9', '#E3D3B4', '#CCD6E2', '#DCD0E2'];   // calm gumdrops (never an answer colour)
  var SPRINKLES = ['#EDD3D9', '#CFE5D8', '#ECE6CE', '#CFDDEA', '#DCD2E8', '#EEDDD2'];   // pastels, HSL saturation ≤ 0.5
  var TREATS = ['cupcake', 'macaron', 'donut', 'cakepop', 'jelly'];
  var SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'oval', 'rect', 'diamond'];
  var ANIMALS = ['cow', 'pig', 'sheep', 'duck', 'hen', 'horse', 'goat', 'crab', 'penguin', 'lion', 'monkey', 'fishbowl'];
  var HOMES = ['farm', 'sea', 'ice', 'jungle', 'savanna'];
  var KINDS = ['treat', 'shape', 'cookies', 'dots', 'tile', 'animal', 'home', 'blob'];
  var SMALL = 0.6;
  var WORDS = { en: { odd: 'odd', even: 'even' }, vi: { odd: 'lẻ', even: 'chẵn' } };

  // ---------------------------------------------------------------- colour helpers
  function rgb(h) { h = String(h).replace('#', ''); return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]; }
  function mix(a, b, t) {
    var A = rgb(a), B = rgb(b), o = '#';
    for (var i = 0; i < 3; i++) { var v = Math.round(A[i] + (B[i] - A[i]) * t); o += (v < 16 ? '0' : '') + v.toString(16); }
    return o.toUpperCase();
  }
  function rgba(hex, a) { var c = rgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (+a).toFixed(3) + ')'; }
  function clamp01(v) { v = +v || 0; return v < 0 ? 0 : v > 1 ? 1 : v; }
  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function okHex(h) { return /^#[0-9A-Fa-f]{6}$/.test(h || ''); }
  function pal(name) {
    var P = BD.PALETTE, c = P && P[name] && okHex(P[name].base) && okHex(P[name].dark) && okHex(P[name].light) ? P[name] : FALLBACK[name];
    return c || null;
  }
  function lum(h) { var c = rgb(h).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
  function contrast(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  var LINES = { '#FFD23F': '#7A5600', '#FF9A2E': '#8A4600', '#FF8FC0': '#9A3A6A', '#4CC26B': '#1E6A34' }, lineMemo = {};
  /** outline of an answer colour: a darker tone of the fill, ≥ 3:1 against the cream tablecloth */
  function lineOf(c) {
    var k = String(c.base).toUpperCase() + c.dark;
    if (lineMemo[k]) return lineMemo[k];
    var l = LINES[String(c.base).toUpperCase()] || c.dark, i = 0;
    while (contrast(l, TABLE) < 3.05 && i++ < 12) l = mix(l, '#1E1812', 0.14);
    return (lineMemo[k] = l);
  }
  function shadeOf(c) { return mix(c.base, c.dark, 0.34); }
  function hash(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  // ---------------------------------------------------------------- path recorder (bbox) + Path2D cache
  function Rec() { this.x0 = 1e9; this.y0 = 1e9; this.x1 = -1e9; this.y1 = -1e9; this.px = 0; this.py = 0; }
  Rec.prototype._p = function (x, y) { if (x < this.x0) this.x0 = x; if (x > this.x1) this.x1 = x; if (y < this.y0) this.y0 = y; if (y > this.y1) this.y1 = y; };
  Rec.prototype.moveTo = function (x, y) { this._p(x, y); this.px = x; this.py = y; };
  Rec.prototype.lineTo = function (x, y) { this._p(x, y); this.px = x; this.py = y; };
  Rec.prototype.quadraticCurveTo = function (cx, cy, x, y) {
    for (var i = 1; i <= 8; i++) { var t = i / 8, u = 1 - t; this._p(u * u * this.px + 2 * u * t * cx + t * t * x, u * u * this.py + 2 * u * t * cy + t * t * y); }
    this.px = x; this.py = y;
  };
  Rec.prototype.bezierCurveTo = function (ax, ay, bx, by, x, y) {
    for (var i = 1; i <= 12; i++) {
      var t = i / 12, u = 1 - t;
      this._p(u * u * u * this.px + 3 * u * u * t * ax + 3 * u * t * t * bx + t * t * t * x, u * u * u * this.py + 3 * u * u * t * ay + 3 * u * t * t * by + t * t * t * y);
    }
    this.px = x; this.py = y;
  };
  Rec.prototype.ellipse = function (x, y, rx, ry, rot, a0, a1, ccw) {
    var d = a1 - a0;
    if (!ccw) { while (d < 0) d += TAU; } else { while (d > 0) d -= TAU; }
    if (Math.abs(d) > TAU) d = d > 0 ? TAU : -TAU;
    var cr = Math.cos(rot), sr = Math.sin(rot), ex = 0, ey = 0;
    for (var i = 0; i <= 32; i++) {
      var a = a0 + d * i / 32; ex = rx * Math.cos(a); ey = ry * Math.sin(a);
      this._p(x + ex * cr - ey * sr, y + ex * sr + ey * cr);
    }
    this.px = x + ex * cr - ey * sr; this.py = y + ex * sr + ey * cr;
  };
  Rec.prototype.arc = function (x, y, r, a0, a1, ccw) { this.ellipse(x, y, r, r, 0, a0, a1, ccw); };
  Rec.prototype.closePath = function () {};
  Rec.prototype.rect = function (x, y, w, h) { this._p(x, y); this._p(x + w, y + h); };

  function circ(t, x, y, r) { t.moveTo(x + r, y); t.arc(x, y, r, 0, TAU); t.closePath(); }
  function ell(t, x, y, rx, ry, rot) { rot = rot || 0; t.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot)); t.ellipse(x, y, rx, ry, rot, 0, TAU); t.closePath(); }
  function rrect(t, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    t.moveTo(x + r, y); t.lineTo(x + w - r, y); t.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
    t.lineTo(x + w, y + h - r); t.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    t.lineTo(x + r, y + h); t.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
    t.lineTo(x, y + r); t.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5); t.closePath();
  }
  function rpoly(t, pts, r) {
    var n = pts.length;
    for (var i = 0; i < n; i++) {
      var p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], ri = typeof r === 'number' ? r : (r ? r[i] : 0);
      var d0 = Math.hypot(p0[0] - p1[0], p0[1] - p1[1]) || 1, d2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) || 1;
      var k0 = Math.min(ri, d0 / 2) / d0, k2 = Math.min(ri, d2 / 2) / d2;
      var ax = p1[0] + (p0[0] - p1[0]) * k0, ay = p1[1] + (p0[1] - p1[1]) * k0, bx = p1[0] + (p2[0] - p1[0]) * k2, by = p1[1] + (p2[1] - p1[1]) * k2;
      if (i === 0) t.moveTo(ax, ay); else t.lineTo(ax, ay);
      t.quadraticCurveTo(p1[0], p1[1], bx, by);
    }
    t.closePath();
  }
  function smooth(t, pts) {   // a closed curve through the midpoints (quadratic B-spline): no corners
    var n = pts.length, m = function (i) { var a = pts[(i + n) % n], b = pts[(i + 1 + n) % n]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
    var s0 = m(0); t.moveTo(s0[0], s0[1]);
    for (var i = 1; i <= n; i++) { var c = pts[i % n], e = m(i); t.quadraticCurveTo(c[0], c[1], e[0], e[1]); }
    t.closePath();
  }
  function poly(t, pts) { t.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) t.lineTo(pts[i][0], pts[i][1]); t.closePath(); }
  function starPts(cx, cy, ro, ri) {
    var pts = [];
    for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? ri : ro; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    return pts;
  }

  function hasP2D() { return typeof Path2D !== 'undefined'; }
  var pcache = {}, pN = 0, bcache = {};
  function P(key, build) {
    if (!hasP2D()) return build;
    var p = pcache[key];
    if (!p) { if (pN > 3000) { pcache = {}; pN = 0; } p = pcache[key] = new Path2D(); build(p); pN++; }
    return p;
  }
  function fillP(ctx, p) { if (typeof p === 'function') { ctx.beginPath(); p(ctx); ctx.fill(); } else ctx.fill(p); }
  function strokeP(ctx, p) { if (typeof p === 'function') { ctx.beginPath(); p(ctx); ctx.stroke(); } else ctx.stroke(p); }
  function clipP(ctx, p) { if (typeof p === 'function') { ctx.beginPath(); p(ctx); ctx.clip(); } else ctx.clip(p); }
  function bbox(key, build) { var b = bcache[key]; if (!b) { var r = new Rec(); build(r); b = bcache[key] = { x: r.x0, y: r.y0, w: r.x1 - r.x0, h: r.y1 - r.y0 }; } return b; }

  /** one-step cel shading: base, a shade crescent lower-right, a soft highlight upper-left, the outline */
  function cel(ctx, key, build, c, o) {
    o = o || {};
    var p = P(key, build), b = bbox(key, build), s = o.s != null ? o.s : Math.max(1.5, Math.min(6.5, Math.min(b.w, b.h) * 0.12));
    ctx.fillStyle = c.base; fillP(ctx, p);
    ctx.save(); clipP(ctx, p);
    if (s) {
      ctx.fillStyle = o.shade || shadeOf(c); ctx.fillRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
      ctx.translate(-s, -s * 1.05); ctx.fillStyle = c.base; fillP(ctx, p); ctx.translate(s, s * 1.05);
    }
    if (o.hl !== false) {
      var h = o.hl || [b.x + b.w * 0.3, b.y + b.h * 0.24, Math.max(1, b.w * 0.13), Math.max(0.8, b.h * 0.07), -0.6];
      ctx.fillStyle = o.hlc || rgba(mix(c.light, '#FFFFFF', 0.45), 0.85);
      ctx.beginPath(); ell(ctx, h[0], h[1], h[2], h[3], h[4] || 0); ctx.fill();
    }
    if (o.inner) o.inner(ctx, b);
    ctx.restore();
    if (o.line !== false) { ctx.strokeStyle = o.line || lineOf(c); ctx.lineWidth = o.lw || LW; strokeP(ctx, p); }
    return p;
  }
  function dot(ctx, x, y, r, col) { ctx.fillStyle = col; ctx.beginPath(); circ(ctx, x, y, r); ctx.fill(); }
  function oval(ctx, x, y, rx, ry, rot, col) { ctx.fillStyle = col; ctx.beginPath(); ell(ctx, x, y, rx, ry, rot); ctx.fill(); }
  function sparkle(ctx, x, y, r, col) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r); ctx.closePath(); ctx.fill();
  }
  function eye(ctx, x, y, r) {
    oval(ctx, x, y, r, r * 1.12, 0, '#2F2A3A');
    dot(ctx, x - r * 0.3, y - r * 0.4, r * 0.42, '#FFFFFF');
  }

  // ---------------------------------------------------------------- DOM helpers (lazy, node-safe)
  function canDOM() { return typeof document !== 'undefined' && !!document.createElement; }
  function makeCanvas(w, h) {
    var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c;
  }
  function devScale(ctx) {
    var m = null;
    try { m = ctx.getTransform ? ctx.getTransform() : null; } catch (e) { m = null; }
    var k = m ? Math.max(Math.hypot(m.a, m.b), Math.hypot(m.c, m.d)) : 0;
    return k > 0 && isFinite(k) ? k : (G.devicePixelRatio || 1);
  }
  var BK = 1.1, LBK = Math.log(BK);
  function bucket(px, lo, hi) { px = Math.max(lo, Math.min(hi, px)); return Math.pow(BK, Math.ceil(Math.log(px) / LBK - 1e-9)); }
  var stats = { thingBuilt: 0, thingHit: 0, houseBuilt: 0, houseHit: 0 };
  var scache = {}, sN = 0;          // bitmap cache, cleared when it grows past 260 entries
  function sget(key) { return scache[key] || null; }
  function sput(key, c) { if (sN > 260) { scache = {}; sN = 0; } scache[key] = c; sN++; return c; }
  /** a cached bitmap of a design drawn in a box of `units` × `units` design units centred on (0, 0); drawn back at that size */
  function boxSprite(ctx, key, units, devPerUnit, draw, st) {
    var devPx = bucket(units * devPerUnit, 12, 1400), u = devPx / units, k2 = key + '|' + devPx.toFixed(1);
    var c = sget(k2);
    if (c) { stats[st + 'Hit']++; }
    else {
      try {
        c = makeCanvas(devPx, devPx);
        var g = c.getContext('2d');
        if (!g) c = null;
        else { g.setTransform(u, 0, 0, u, devPx / 2, devPx / 2); g.lineJoin = 'round'; g.lineCap = 'round'; draw(g); stats[st + 'Built']++; sput(k2, c); }
      } catch (e) { c = null; }
    }
    if (!c) return false;
    ctx.drawImage(c, -units / 2, -units / 2, units, units);
    return true;
  }

  // ================================================================= SHAPE COOKIES (a biscuit with the shape iced in the colour)
  var heartS = function (t) {
    var X = function (x) { return x * 0.9; }, Y = function (y) { return (y - 56) * 0.92; };
    t.moveTo(X(0), Y(96));
    t.bezierCurveTo(X(-14), Y(85), X(-46.5), Y(66), X(-46.5), Y(39));
    t.bezierCurveTo(X(-46.5), Y(23), X(-35), Y(14), X(-23), Y(14));
    t.bezierCurveTo(X(-11), Y(14), X(-3), Y(21), X(0), Y(30));
    t.bezierCurveTo(X(3), Y(21), X(11), Y(14), X(23), Y(14));
    t.bezierCurveTo(X(35), Y(14), X(46.5), Y(23), X(46.5), Y(39));
    t.bezierCurveTo(X(46.5), Y(66), X(14), Y(85), X(0), Y(96));
    t.closePath();
  };
  var SHP = {
    circle:   function (t) { circ(t, 0, 0, 41); },
    square:   function (t) { rrect(t, -37, -37, 74, 74, 9); },
    triangle: function (t) { rpoly(t, [[0, -45], [48, 37], [-48, 37]], [9, 8, 8]); },
    star:     function (t) { rpoly(t, starPts(0, 3, 49, 22), [5, 2.5, 5, 2.5, 5, 2.5, 5, 2.5, 5, 2.5]); },
    heart:    heartS,
    oval:     function (t) { ell(t, 0, -2, 27, 43, 0); },
    rect:     function (t) { rrect(t, -48, -25, 96, 50, 9); },
    diamond:  function (t) { rpoly(t, [[0, -48], [35, -2], [0, 44], [-35, -2]], [7, 6, 7, 6]); }
  };
  function shapeOf(th) { return SHP[th.shape] ? th.shape : 'circle'; }
  var DEPTH = 6;   // cookie thickness: the biscuit side shows below
  function drawShape(ctx, th, c) {
    var s = shapeOf(th), key = 'shp.' + s, b = SHP[s], bb = bbox(key, b);
    var cx = bb.x + bb.w / 2, cy = bb.y + bb.h / 2, ins = s === 'star' ? 0.8 : s === 'triangle' ? 0.8 : 0.84;
    // biscuit side + top
    ctx.save(); ctx.translate(0, DEPTH);
    ctx.fillStyle = BISC.dark; fillP(ctx, P(key, b)); ctx.strokeStyle = BISC.line; ctx.lineWidth = LW; strokeP(ctx, P(key, b));
    ctx.restore();
    ctx.save(); ctx.translate(0, DEPTH / 2); ctx.strokeStyle = BISC.dark; ctx.lineWidth = 6; strokeP(ctx, P(key, b)); ctx.restore();
    cel(ctx, key, b, BISC, { s: 2.6, line: BISC.line, hl: false });
    // the icing: the same shape, inset, in the answer colour (dominant: ≈ 2/3 of the face)
    ctx.save(); ctx.translate(cx, cy - 1); ctx.scale(ins, ins); ctx.translate(-cx, -cy);
    cel(ctx, key, b, c, {
      s: 4.6, hl: false, lw: 3,
      inner: function (x) {
        x.save(); x.translate(-1.6, -1.6); x.strokeStyle = rgba(mix(c.light, '#FFFFFF', 0.35), 0.8); x.lineWidth = 5.4; strokeP(x, P(key, b)); x.restore();
        x.fillStyle = rgba(mix(c.light, '#FFFFFF', 0.5), 0.9);
        x.beginPath(); ell(x, bb.x + bb.w * 0.33, bb.y + bb.h * 0.3, Math.max(2.4, bb.w * 0.1), Math.max(1.6, bb.h * 0.055), -0.7); x.fill();
        sparkle(x, bb.x + bb.w * 0.54, bb.y + bb.h * 0.26, 3.6, 'rgba(255,255,255,0.9)');
      }
    });
    ctx.restore();
  }

  // ================================================================= TREATS (frosting / shell / glaze / jelly in the colour)
  var LINER = { base: '#F1DDBB', dark: '#D2B88E', light: '#FFF4DE', line: '#9C7A50' };
  var STICK = { base: '#FFFDF6', dark: '#E4DCCB', light: '#FFFFFF', line: '#A89C88' };
  var TR = {};
  var cuLiner = function (t) { rpoly(t, [[-31, 8], [31, 8], [24, 47], [-24, 47]], [3, 3, 5, 5]); };
  var cuT1 = function (t) { ell(t, 0, 6, 41, 13.5, 0); };
  var cuT2 = function (t) { ell(t, 0, -10, 32, 11.5, 0); };
  var cuT3 = function (t) { ell(t, 1, -24, 21, 9.5, 0); };
  var cuCherry = function (t) { circ(t, 2, -37, 8); };
  TR.cupcake = { foot: 48, head: -50, draw: function (ctx, c) {
    cel(ctx, 'cu.liner', cuLiner, LINER, { s: 3, line: LINER.line, hl: false, inner: function (x) {
      x.strokeStyle = '#D6BC90'; x.lineWidth = 2.6; x.beginPath();
      for (var i = -3; i <= 3; i++) { x.moveTo(i * 9.4, 8); x.lineTo(i * 7.1, 47); }
      x.stroke();
    } });
    var swirl = function (rx, y) { return function (x) { x.strokeStyle = rgba(mix(c.light, '#FFFFFF', 0.3), 0.9); x.lineWidth = 2.6; x.beginPath(); x.ellipse(0, y, rx, 4, 0, Math.PI * 1.08, Math.PI * 1.62); x.stroke(); }; };
    cel(ctx, 'cu.t1', cuT1, c, { s: 4.4, hl: false, inner: swirl(30, 4) });
    cel(ctx, 'cu.t2', cuT2, c, { s: 3.8, hl: false, inner: swirl(23, -12) });
    cel(ctx, 'cu.t3', cuT3, c, { s: 3.2, hl: [-6, -27, 7, 3, -0.3] });
    ctx.strokeStyle = BISC.line; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(3, -44); ctx.quadraticCurveTo(4, -50, 10, -52); ctx.stroke();
    var ch = { base: mix(c.base, c.dark, 0.3), dark: c.dark, light: c.light };
    cel(ctx, 'cu.ch', cuCherry, ch, { s: 2.2, line: lineOf(c), lw: 2.8, hl: [-1, -40, 2.6, 1.8, -0.6] });
  } };
  var maTop = function (t) { t.moveTo(-44, -5); t.bezierCurveTo(-46, -34, -28, -40, 0, -40); t.bezierCurveTo(28, -40, 46, -34, 44, -5); t.closePath(); };
  var maBot = function (t) { t.moveTo(-44, 9); t.lineTo(44, 9); t.bezierCurveTo(46, 38, 28, 45, 0, 45); t.bezierCurveTo(-28, 45, -46, 38, -44, 9); t.closePath(); };
  var maFill = function (t) { rrect(t, -40, -7, 80, 18, 6); };
  function ruffle(ctx, y, c, up) {
    ctx.fillStyle = mix(c.base, c.light, 0.35); ctx.strokeStyle = lineOf(c); ctx.lineWidth = 2;
    ctx.beginPath();
    for (var x = -40; x <= 40; x += 8) { ctx.moveTo(x + 4.2, y); ctx.arc(x, y, 4.2, 0, TAU); }
    ctx.fill(); ctx.stroke();
    void up;
  }
  TR.macaron = { foot: 46, head: -41, draw: function (ctx, c) {
    cel(ctx, 'ma.fill', maFill, CREAM, { s: 2, line: CREAM.line, lw: 2.8, hl: false });
    ruffle(ctx, 11, c); cel(ctx, 'ma.bot', maBot, c, { s: 4.4, hl: false });
    ruffle(ctx, -6, c); cel(ctx, 'ma.top', maTop, c, { s: 4.4, hl: [-18, -28, 11, 4.5, -0.25] });
  } };
  var doBody = function (t) { ell(t, 0, 8, 47, 34, 0); };
  var doGlaze = function (t) {
    var pts = [];
    for (var i = 0; i < 18; i++) {
      var a = i / 18 * TAU, drip = Math.sin(a) > 0.2 ? (i % 3 === 0 ? 8 : i % 3 === 1 ? 3 : 5) * Math.sin(a) : 0;
      pts.push([Math.cos(a) * 41, 2 + Math.sin(a) * 26 + drip]);
    }
    smooth(t, pts);
  };
  var doHole = function (t) { ell(t, 0, 4, 12.5, 8, 0); };
  TR.donut = { foot: 43, head: -27, draw: function (ctx, c) {
    cel(ctx, 'do.body', doBody, BISC, { s: 5, line: BISC.line, hl: false });
    cel(ctx, 'do.glaze', doGlaze, c, { s: 3.6, lw: 3, hl: [-20, -12, 10, 4, -0.3], inner: function (x) {
      var R = [[-26, -4, 0.5], [-14, -15, -0.4], [6, -17, 0.9], [22, -9, -0.6], [30, 6, 0.3], [16, 18, 1.1], [-6, 20, -0.2], [-28, 12, 0.8], [-34, 0, -1.2], [26, 17, -0.9]];
      R.forEach(function (r, i) {
        x.save(); x.translate(r[0], r[1]); x.rotate(r[2]);
        x.fillStyle = i % 2 ? '#FFFFFF' : '#FFF1D6'; x.strokeStyle = rgba('#7A6A5A', 0.55); x.lineWidth = 1;
        x.beginPath(); rrect(x, -4.2, -1.5, 8.4, 3, 1.5); x.fill(); x.stroke(); x.restore();
      });
    } });
    // the hole: the dough's inner wall + a soft shadow
    ctx.fillStyle = BISC.dark; ctx.beginPath(); doHole(ctx); ctx.fill();
    ctx.fillStyle = 'rgba(70,40,22,0.55)'; ctx.beginPath(); ell(ctx, 0, 6, 10, 5.5, 0); ctx.fill();
    ctx.strokeStyle = lineOf(c); ctx.lineWidth = 2.6; ctx.beginPath(); doHole(ctx); ctx.stroke();
  } };
  var cpStick = function (t) { rrect(t, -3.6, 0, 7.2, 47, 3.6); };
  var cpBall = function (t) { circ(t, 0, -17, 32); };
  TR.cakepop = { foot: 48, head: -50, draw: function (ctx, c) {
    cel(ctx, 'cp.stick', cpStick, STICK, { s: 1.6, line: STICK.line, lw: 2.6, hl: false });
    cel(ctx, 'cp.ball', cpBall, c, { s: 5.6, hl: [-12, -32, 9, 5, -0.6], inner: function (x) {
      x.strokeStyle = rgba(mix(c.light, '#FFFFFF', 0.4), 0.95); x.lineWidth = 3.6; x.beginPath();
      x.moveTo(-30, -24); x.quadraticCurveTo(-22, -34, -14, -22); x.quadraticCurveTo(-6, -36, 2, -22); x.quadraticCurveTo(10, -36, 18, -22); x.quadraticCurveTo(25, -33, 32, -22);
      x.stroke();
      [[-14, -6], [4, -2], [18, -10], [-4, 6], [14, 6], [-20, 4]].forEach(function (p, i) { dot(x, p[0], p[1], 2.2, i % 2 ? '#FFFFFF' : '#FFF1D6'); });
    } });
    // a cream bow where the stick meets the ball
    ctx.fillStyle = CREAM.base; ctx.strokeStyle = CREAM.line; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, 17); ctx.lineTo(-10, 12); ctx.lineTo(-10, 22); ctx.closePath(); ctx.moveTo(0, 17); ctx.lineTo(10, 12); ctx.lineTo(10, 22); ctx.closePath(); ctx.fill(); ctx.stroke();
    dot(ctx, 0, 17, 3, CREAM.dark);
  } };
  var jeBody = function (t) { t.moveTo(-38, 32); t.bezierCurveTo(-46, 2, -34, -38, 0, -42); t.bezierCurveTo(34, -38, 46, 2, 38, 32); t.bezierCurveTo(20, 37, -20, 37, -38, 32); t.closePath(); };
  var jePlate = function (t) { ell(t, 0, 39, 48, 8, 0); };
  TR.jelly = { foot: 48, head: -43, draw: function (ctx, c) {
    cel(ctx, 'je.plate', jePlate, CREAM, { s: 2.4, line: CREAM.line, lw: 2.8, hl: false });
    cel(ctx, 'je.body', jeBody, c, { s: 5.4, hl: false, inner: function (x) {
      // fluted mould ridges + a light translucent core
      x.fillStyle = rgba(c.light, 0.45); x.beginPath(); ell(x, -4, -4, 20, 26, 0); x.fill();
      x.strokeStyle = rgba(mix(c.light, '#FFFFFF', 0.3), 0.85); x.lineWidth = 3;
      x.beginPath();
      [-24, -9, 7, 22].forEach(function (fx) { x.moveTo(fx * 0.55, -38); x.quadraticCurveTo(fx * 1.12, -4, fx * 1.25, 32); });
      x.stroke();
      x.fillStyle = 'rgba(255,255,255,0.85)'; x.beginPath(); ell(x, -18, -18, 4.5, 11, 0.25); x.fill();
      dot(x, -10, -32, 2.6, 'rgba(255,255,255,0.9)');
    } });
  } };
  function treatOf(th) { return TR[th.obj] ? th.obj : 'cupcake'; }

  // ================================================================= COOKIES (n chocolate-chip cookies on a round platter)
  var plOuter = function (t) { ell(t, 0, 1, 50, 48, 0); };
  var COOKR = { e: [0, 1, 44.5, 41.5], cap: 17 };
  var ccache = {}, COPT = { 3: [[1, 2]], 5: [[2, 1, 2]], 7: [[2, 3, 2]] };   // cookie-friendly extra layouts (bigger cookies)
  function cookieLayoutC(n) {
    n = Math.max(1, Math.min(12, Math.round(num(n, 1))));
    if (ccache[n]) return ccache[n];
    var best = null;
    DOPT[n].concat(COPT[n] || []).forEach(function (rows) { var u = unitPts(rows), rs = fitR(u, COOKR); if (!best || rs > best.rs + 0.3) best = { u: u, rs: rs }; });
    var rs = n === 1 ? 28 : best.rs;
    return (ccache[n] = { n: n, rs: rs, pts: best.u.map(function (p) { return [p[0] * rs, 1 + p[1] * rs]; }) });
  }
  function cookieLayout(n) { var L = cookieLayoutC(n); return { n: L.n, rs: L.rs, pts: L.pts.map(function (p) { return [p[0], p[1] - 48]; }) }; }
  var CHIPS = [[-0.42, -0.3, 0.2, 0.5], [0.32, -0.42, 0.17, -0.4], [0.12, 0.2, 0.22, 0.2], [-0.36, 0.38, 0.15, 1], [0.5, 0.22, 0.14, -1]];
  function cookie(ctx, x, y, r, i) {
    dot(ctx, x + r * 0.08, y + r * 0.14, r * 1.02, 'rgba(120,80,40,0.28)');
    ctx.fillStyle = BISC.base; ctx.beginPath(); circ(ctx, x, y, r); ctx.fill();
    ctx.save(); ctx.beginPath(); circ(ctx, x, y, r); ctx.clip();
    dot(ctx, x + r * 0.22, y + r * 0.26, r * 0.95, mix(BISC.base, BISC.dark, 0.45));
    dot(ctx, x - r * 0.06, y - r * 0.08, r * 0.9, BISC.base);
    oval(ctx, x - r * 0.36, y - r * 0.42, r * 0.3, r * 0.15, -0.6, rgba(BISC.light, 0.9));
    ctx.restore();
    CHIPS.forEach(function (c, j) { if (r < 9 && j > 2) return; var rot = c[3] + i; oval(ctx, x + c[0] * r, y + c[1] * r, c[2] * r, c[2] * r * 0.8, rot, CHIP); });
    ctx.strokeStyle = BISC.line; ctx.lineWidth = Math.max(1.6, Math.min(3, r * 0.17)); ctx.beginPath(); circ(ctx, x, y, r); ctx.stroke();
  }
  function drawCookies(ctx, th) {
    var L = cookieLayoutC(th.n);
    cel(ctx, 'ck.plate', plOuter, CREAM, { s: 3.2, line: CREAM.line, lw: 3, hl: false, inner: function (x) {
      x.strokeStyle = rgba(CREAM.dark, 0.9); x.lineWidth = 1.8; x.beginPath(); ell(x, 0, 1, 46.5, 44.5, 0); x.stroke();
    } });
    L.pts.forEach(function (p, i) { cookie(ctx, p[0], p[1], L.rs, i); });
  }
  function drawRings(ctx, L, count) {   // counted dots / cookies get a white + gold ring (vector overlay, never cached)
    var n = Math.min(count, L.n);
    for (var i = 0; i < n; i++) {
      var p = L.pts[i], rr = L.rs * 1.32 + 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = Math.max(2, L.rs * 0.36);
      ctx.beginPath(); circ(ctx, p[0], p[1], rr); ctx.stroke();
      ctx.strokeStyle = 'rgba(240,170,40,0.95)'; ctx.lineWidth = Math.max(1.2, L.rs * 0.2);
      ctx.beginPath(); circ(ctx, p[0], p[1], rr); ctx.stroke();
    }
  }

  // ================================================================= COLOUR BLOB (a glossy splat sweet)
  var blobP = function (x) {
    x.moveTo(42, -2);
    for (var j = 1; j <= 9; j++) { var a = j * TAU / 9, am = a - TAU / 18, ro = j % 2 ? 43 : 38; x.quadraticCurveTo(Math.cos(am) * 48, -2 + Math.sin(am) * 45, Math.cos(a) * ro, -2 + Math.sin(a) * ro * 0.95); }
    x.closePath();
  };
  function drawBlob(ctx, c) {
    cel(ctx, 'bl.blob', blobP, c, { s: 5, hl: [-16, -20, 11, 6, -0.6] });
    dot(ctx, 33, 34, 6.5, c.base); ctx.strokeStyle = lineOf(c); ctx.lineWidth = 2.6; ctx.beginPath(); circ(ctx, 33, 34, 6.5); ctx.stroke();
    dot(ctx, -36, 33, 4, c.base); ctx.beginPath(); circ(ctx, -36, 33, 4); ctx.stroke();
    dot(ctx, 4, -27, 3.6, 'rgba(255,255,255,0.75)'); sparkle(ctx, 16, -24, 4.5, 'rgba(255,255,255,0.9)');
  }
  // ================================================================= WOODEN SIGN (dots + tiles)
  // dots sign: a round cream disc on a short post. With a numeral: a taller tablet, numeral on top, dots below.
  var sgDisc = function (t) { circ(t, 0, -9, 41); };
  var sgTall = function (t) { rrect(t, -43, -51, 86, 86, 24); };
  var sgWide = function (t) { rrect(t, -49, -36, 98, 64, 26); };
  var SIGNS = {
    disc: { path: sgDisc, key: 'sg.disc', inner: function (t) { circ(t, 0, -9, 34.5); }, postTop: 26 },
    tall: { path: sgTall, key: 'sg.tall', inner: function (t) { rrect(t, -37, -45, 74, 74, 19); }, postTop: 30 },
    wide: { path: sgWide, key: 'sg.wide', inner: function (t) { rrect(t, -43, -30, 86, 52, 21); }, postTop: 24 }
  };
  var sgPost = function (t) { rrect(t, -6.5, 14, 13, 36, 4); };
  var sgFoot = function (t) { ell(t, 0, 47, 13, 4, 0); };
  function drawSign(ctx, kind) {
    var S = SIGNS[kind];
    cel(ctx, 'sg.post', sgPost, POST, { s: 2.4, line: POST.line, lw: 2.8, hl: false });
    cel(ctx, S.key, S.path, SIGN, {
      s: 4.2, line: SIGN.line, lw: LW, hl: false,
      inner: function (x) {
        // a soft carved inner rim + a few grain lines: reads as wood, keeps the face calm for the dots
        x.strokeStyle = rgba('#C9AE84', 0.8); x.lineWidth = 2; strokeP(x, P(S.key + '.in', S.inner));
        x.strokeStyle = rgba('#D6BF98', 0.55); x.lineWidth = 1.4; x.beginPath();
        x.moveTo(-30, -36); x.quadraticCurveTo(-8, -40, 18, -35); x.moveTo(-34, 22); x.quadraticCurveTo(0, 27, 30, 21);
        x.stroke();
        oval(x, -20, kind === 'wide' ? -24 : -38, 11, 4, -0.35, 'rgba(255,255,255,0.75)');
      }
    });
    dot(ctx, 0, kind === 'tall' ? -46 : kind === 'wide' ? -31 : -45, 2.4, '#B79A72');   // the nail
  }
  // ---- dot layouts (in dot-radius units; centre spacing ≥ 2.75 → gap ≥ 0.75·r: every dot clearly separate)
  var HX = 2.8, HY = 2.65, DD = 1.98;
  var DOPT = {
    1: [[[0, 0]]], 2: [[2]], 3: ['d3', [3]], 4: [[2, 2]], 5: ['d5', [3, 2]], 6: [[3, 3], [2, 2, 2]], 7: [[2, 3, 2], [4, 3]], 8: [[3, 2, 3], [4, 4]],
    9: [[3, 3, 3], [5, 4]], 10: [[3, 4, 3], [5, 5], [4, 3, 3]], 11: [[4, 3, 4], [6, 5]], 12: [[4, 4, 4], [6, 6]]
  };
  function unitPts(rows) {
    if (rows === 'd3') return [[-DD, -DD], [0, 0], [DD, DD]];
    if (rows === 'd5') return [[-DD, -DD], [DD, -DD], [0, 0], [-DD, DD], [DD, DD]];
    if (typeof rows[0] !== 'number') return rows;
    var pts = [], nr = rows.length;
    rows.forEach(function (cnt, ri) { for (var i = 0; i < cnt; i++) pts.push([(i - (cnt - 1) / 2) * HX, (ri - (nr - 1) / 2) * HY]); });
    return pts;
  }
  var DREG = { disc: { e: [0, -9, 33, 33], cap: 11 }, tall: { r: [-36, -9, 36, 28], cap: 8.6 } };
  function fitR(u, R) {
    var lo = 1, hi = R.cap;
    var fits = function (rs) {
      return u.every(function (p) {
        var x = p[0] * rs, y = p[1] * rs;
        if (R.e) return R.e[2] > rs && R.e[3] > rs && Math.hypot(x / (R.e[2] - rs), y / (R.e[3] - rs)) <= 1 + 1e-6;
        return Math.abs(x) + rs <= (R.r[2] - R.r[0]) / 2 + 1e-6 && Math.abs(y) + rs <= (R.r[3] - R.r[1]) / 2 + 1e-6;
      });
    };
    if (fits(hi)) return hi;
    for (var i = 0; i < 30; i++) { var m = (lo + hi) / 2; if (fits(m)) lo = m; else hi = m; }
    return lo;
  }
  var lcache = {};
  function dotLayoutC(n, numeral) {   // centred (design box) coordinates
    n = Math.max(1, Math.min(12, Math.round(num(n, 1))));
    var key = n + (numeral ? 'n' : '');
    if (lcache[key]) return lcache[key];
    var R = DREG[numeral ? 'tall' : 'disc'], best = null;
    DOPT[n].forEach(function (rows) { var u = unitPts(rows), rs = fitR(u, R); if (!best || rs > best.rs + 0.3) best = { u: u, rs: rs }; });
    var rs = n === 1 ? (numeral ? 10 : 15) : best.rs;
    var cx = R.e ? R.e[0] : (R.r[0] + R.r[2]) / 2, cy = R.e ? R.e[1] : (R.r[1] + R.r[3]) / 2;
    return (lcache[key] = { n: n, rs: rs, pts: best.u.map(function (p) { return [cx + p[0] * rs, cy + p[1] * rs]; }) });
  }
  function dotLayout(n, numeral) {   // public: origin = bottom-centre of the 100 box (foot at y 0)
    var L = dotLayoutC(n, numeral);
    return { n: L.n, rs: L.rs, pts: L.pts.map(function (p) { return [p[0], p[1] - 50]; }) };
  }
  function drawDots(ctx, th) {
    var numeral = !!th.numeral, L = dotLayoutC(th.n, numeral);
    drawSign(ctx, numeral ? 'tall' : 'disc');
    if (numeral) signText(ctx, String(L.n), 0, -28, 64, 27, INK);
    L.pts.forEach(function (p) {
      dot(ctx, p[0] + L.rs * 0.08, p[1] + L.rs * 0.12, L.rs, 'rgba(120,90,50,0.25)');   // a tiny carved shadow
      dot(ctx, p[0], p[1], L.rs, INK);
      dot(ctx, p[0] - L.rs * 0.32, p[1] - L.rs * 0.34, L.rs * 0.28, 'rgba(255,255,255,0.55)');
    });
  }
  // ---- tiles (text on the sign)
  function tileText(th, lang) {
    var s = th.text != null ? String(th.text) : th.n != null ? String(th.n) : '?';
    if (th.lang === 'vi' || th.lang === 'en') lang = th.lang;
    if (s.charAt(0) === '@') {   // '@odd' / '@even': the word in the current language
      var w = s.slice(1), L = lang === 'vi' ? 'vi' : lang === 'en' ? 'en' : (BD.lang === 'vi' ? 'vi' : 'en'), got = null;
      try { if (BD.I18N && typeof BD.I18N.word === 'function') got = BD.I18N.word(L, w); } catch (e) { got = null; }
      s = typeof got === 'string' && got ? got : (WORDS[L][w] || w);
    }
    s = s.replace(/-/g, '−');
    return s.length ? s.slice(0, 6) : '?';
  }
  function glyphFont(px) { return 'bold ' + Math.round(px * 10) / 10 + 'px ' + FONT; }
  function signText(ctx, txt, x, y, maxW, maxH, col) {
    var px = maxH * 1.36;
    ctx.font = glyphFont(px);
    var m = ctx.measureText ? ctx.measureText(txt) : null, w = m && m.width > 0 ? m.width : px * 0.62 * txt.length;
    if (w > maxW) { px *= maxW / w; ctx.font = glyphFont(px); m = ctx.measureText ? ctx.measureText(txt) : null; }
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    var asc = m && m.actualBoundingBoxAscent > 0 ? m.actualBoundingBoxAscent : px * 0.72,
      desc = m && m.actualBoundingBoxDescent >= 0 && m.actualBoundingBoxAscent > 0 ? m.actualBoundingBoxDescent : 0;
    if (asc + desc > maxH * 1.08) {   // tall glyphs (Vietnamese stacked marks "ẵ", "Ặ") also fit the height
      var f = maxH * 1.08 / (asc + desc); px *= f; asc *= f; desc *= f; ctx.font = glyphFont(px);
    }
    var by = y + (asc - desc) / 2;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.6, px * 0.06);
    ctx.fillStyle = col; ctx.fillText(txt, x, by); if (ctx.strokeText) ctx.strokeText(txt, x, by);
  }
  function tileSign(txt) { return txt.length <= 2 ? 'disc' : 'wide'; }
  function drawTile(ctx, th, lang) {
    var txt = tileText(th, lang), n = txt.length, kind = tileSign(txt);
    drawSign(ctx, kind);
    if (kind === 'disc') signText(ctx, txt, 0, -9, n <= 1 ? 54 : 60, n <= 1 ? 40 : 33, INK);
    else signText(ctx, txt, 0, -4, 84, n <= 3 ? 34 : 30, INK);
  }

  // ================================================================= ANIMALS (images by the animal artist; placeholder)
  var ANC = {
    cow: ['#F4EFE6', '#8C7A6A'], pig: ['#F2B8B0', '#B87870'], sheep: ['#F3EEE4', '#9A8E80'], duck: ['#F6F2E6', '#A8A08A'],
    hen: ['#E9C9A2', '#9C7650'], horse: ['#B98A62', '#6E4E34'], goat: ['#E3D8C6', '#8E7E66'], crab: ['#E08A6E', '#9A4E3A'],
    penguin: ['#4A5268', '#2A3042'], lion: ['#E2B46E', '#9A7038'], monkey: ['#A87A56', '#6A4A30'], fishbowl: ['#CFE8F2', '#6E98AC']
  };
  var anBody = function (t) { ell(t, -6, 10, 34, 23, 0); };
  var anHead = function (t) { circ(t, 24, -14, 20); };
  var anLegs = function (t) { rrect(t, -30, 20, 10, 29, 5); rrect(t, -12, 20, 10, 29, 5); rrect(t, 6, 20, 10, 29, 5); rrect(t, 18, 20, 10, 29, 5); };
  function animalOf(th) { return ANC[th.animal] ? th.animal : 'cow'; }
  function assetImg(key, px) {
    var A = BD.Assets;
    if (!A) return null;
    try {
      if (typeof A.has === 'function' && typeof A.sprite === 'function' && A.has(key)) { var s = A.sprite(key, px); if (s) return s; }
      if (typeof A.img === 'function') { var i = A.img(key); if (i) return i; }
      if (A.images && A.images[key]) return A.images[key];
    } catch (e) { /* placeholder */ }
    return null;
  }
  // SVG 0 0 200 200, feet (100, 194), body ≈ y 14..194 (180 tall) → 100 units: k = 100/180, feet at design (0, 50)
  var AK = 100 / 180, AW = 200 * AK, AX = -100 * AK, AY = 50 - 194 * AK;
  function drawAnimal(ctx, th, img) {
    if (img) { ctx.drawImage(img, AX, AY, AW, AW); return; }
    var c = ANC[animalOf(th)], C = { base: c[0], dark: c[1], light: '#FFFFFF' };
    ctx.save(); ctx.globalAlpha *= 0.85;
    cel(ctx, 'an.legs', anLegs, C, { s: 1.6, line: c[1], lw: 2.6, hl: false });
    cel(ctx, 'an.body', anBody, C, { s: 4, line: c[1], lw: 3 });
    cel(ctx, 'an.head', anHead, C, { s: 3, line: c[1], lw: 3 });
    eye(ctx, 30, -17, 3.6);
    oval(ctx, 34, -8, 3.6, 2.2, 0, rgba('#F2A99A', 0.85));
    ctx.restore();
  }

  // ================================================================= PUBLIC: things
  function kindOf(th) { return KINDS.indexOf(th && th.kind) >= 0 ? th.kind : 'treat'; }
  function colOf(th, d) { return pal(th.color) || FALLBACK[d || 'red']; }
  function homeOf(th) { return BADGE[th.home] ? th.home : 'farm'; }
  function thingKey(t, lang) {
    if (!t) return '?';
    var k = kindOf(t);
    return [k, t.color || '', t.obj || '', t.shape || '', t.n != null ? t.n : '', t.numeral ? 'N' : '', t.animal || '', t.home || '',
      k === 'tile' ? tileText(t, lang) : '', t.big === false ? 's' : ''].join(':');
  }
  /** design-unit y of the thing's foot (the point that sits on the origin) */
  function footOf(th) {
    var k = kindOf(th);
    if (k === 'treat') return TR[treatOf(th)].foot;
    if (k === 'shape') { var s = shapeOf(th), bs = bbox('shp.' + s, SHP[s]); return bs.y + bs.h + DEPTH + 1.4; }
    if (k === 'cookies') return 49;
    if (k === 'home') return 50;
    if (k === 'blob') return 42;
    return 50;
  }
  function headOf(th) {   // design-unit y of the thing's top
    var k = kindOf(th);
    if (k === 'treat') return TR[treatOf(th)].head;
    if (k === 'shape') { var s = shapeOf(th); return bbox('shp.' + s, SHP[s]).y - 1.5; }
    if (k === 'cookies') return -47;
    if (k === 'dots') return th.numeral ? -53 : -52;
    if (k === 'tile') return tileSign(tileText(th)) === 'disc' ? -52 : -38;
    if (k === 'home') return -50;
    if (k === 'blob') return -47;
    return -50;
  }
  /** many dots (≥ 7, no numeral) get a bigger sign so every dot stays countable on a phone */
  function bigDots(th) { return th && kindOf(th) === 'dots' && !th.numeral && num(th.n, 0) >= 7 ? 1.28 : 1; }
  function thingTop(thing, size) {
    if (!thing) return 0;
    var sc = (thing.big === false ? SMALL : 1) * bigDots(thing);
    return (footOf(thing) - headOf(thing)) * num(size, 90) * sc / 100;
  }
  function thingBody(ctx, th, img, lang) {
    var k = kindOf(th);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (k === 'treat') TR[treatOf(th)].draw(ctx, colOf(th));
    else if (k === 'shape') drawShape(ctx, th, colOf(th, 'blue'));
    else if (k === 'cookies') drawCookies(ctx, th);
    else if (k === 'dots') drawDots(ctx, th);
    else if (k === 'tile') drawTile(ctx, th, lang);
    else if (k === 'home') drawHomeBadge(ctx, homeOf(th), 46, {});
    else if (k === 'blob') drawBlob(ctx, colOf(th));
    else drawAnimal(ctx, th, img);
  }
  function langOf(o) { var l = (o && o.lang) || BD.lang || (BD.I18N && BD.I18N.lang) || 'en'; return l === 'vi' ? 'vi' : 'en'; }
  var BOXU = 132;   // sprite box in design units (100 + padding for outlines)
  function drawThing(ctx, thing, size, opt) {
    if (!ctx || !thing) return;
    size = num(size, 90); if (!(size > 0)) return;
    var o = opt || {}, sc = (thing.big === false ? SMALL : 1) * bigDots(thing), box = size * sc, s = box / 100;
    var alpha = o.alpha == null ? 1 : clamp01(num(o.alpha, 1)); if (alpha <= 0.001) return;
    var glow = clamp01(o.glow), wig = Math.max(-1, Math.min(1, num(o.wiggle, 0))), rot = num(o.rot, 0), count = Math.round(num(o.count, -1));
    var k = kindOf(thing), foot = footOf(thing), lang = langOf(o);
    ctx.save(); ctx.globalAlpha *= alpha;
    if (o.shadow !== false) {   // a soft contact shadow on the table / tray
      var sw = k === 'dots' || k === 'tile' ? 0.2 : k === 'cookies' || k === 'home' ? 0.42 : 0.34;
      ctx.fillStyle = 'rgba(70,48,30,0.26)'; ctx.beginPath(); ell(ctx, 0, 0, box * sw, box * 0.07, 0); ctx.fill();
      ctx.fillStyle = 'rgba(70,48,30,0.18)'; ctx.beginPath(); ell(ctx, 0, 0, box * sw * 0.6, box * 0.04, 0); ctx.fill();
    }
    var r = wig * 0.3 + rot;
    if (r) ctx.rotate(r);
    if (wig) ctx.scale(1 + 0.04 * Math.abs(wig), 1 - 0.04 * Math.abs(wig));
    ctx.scale(s, s);
    ctx.translate(0, -foot);
    if (glow > 0.01) {
      var cy = (headOf(thing) + foot) / 2, R = 62 + 12 * glow, gr = ctx.createRadialGradient(0, cy, R * 0.25, 0, cy, R);
      gr.addColorStop(0, 'rgba(255,236,150,' + (0.85 * glow).toFixed(3) + ')');
      gr.addColorStop(0.6, 'rgba(255,214,100,' + (0.42 * glow).toFixed(3) + ')');
      gr.addColorStop(1, 'rgba(255,210,90,0)');
      ctx.fillStyle = gr; ctx.beginPath(); circ(ctx, 0, cy, R); ctx.fill();
    }
    var dev = devScale(ctx);
    var img = k === 'animal' ? assetImg('animals/' + animalOf(thing), AW * dev * s) : null;
    var done = false;
    if (canDOM() && !o.direct) {
      var key = 'th:' + thingKey(thing, lang) + '|' + (k === 'animal' ? (img ? 'i' : 'p') : '');
      done = boxSprite(ctx, key, BOXU, dev * s, function (g) { thingBody(g, thing, img, lang); }, 'thing');
    }
    if (!done) thingBody(ctx, thing, img, lang);
    if (count > 0 && k === 'dots') drawRings(ctx, dotLayoutC(thing.n, !!thing.numeral), count);
    if (count > 0 && k === 'cookies') drawRings(ctx, cookieLayoutC(thing.n), count);
    ctx.restore();
  }

  // ================================================================= HOUSES
  // Design units: S = 100, origin = the door point (bottom-centre). Wall x −44..44, y −50..0; roof eaves y ≈ −42, x ±58;
  // the sign board x −37..37, y −90..−30 (sign mode); the door x −12..12, y −27..0; windows at (±29, −19).
  var HV = 45, hgeo = {};
  function variant(seed) {
    var s = num(seed, 0);
    if (s % 1 !== 0) s = Math.floor(Math.abs(s) * 7919);
    return Math.abs(Math.floor(s)) % HV;
  }
  var ROOFS = [
    { peak: -92, path: function (t) { rpoly(t, [[0, -92], [59, -41], [-59, -41]], [10, 7, 7]); } },
    { peak: -93, path: function (t) { t.moveTo(-57, -41); t.bezierCurveTo(-58, -72, -32, -93, 0, -93); t.bezierCurveTo(32, -93, 58, -72, 57, -41); t.closePath(); } },
    { peak: -96, path: function (t) { rpoly(t, [[0, -96], [50, -46], [61, -39], [-61, -39], [-50, -46]], [8, 5, 4, 4, 5]); } }
  ];
  var hWall = function (t) { rrect(t, -44, -52, 88, 52, 4); };
  var hChim = function (t) { rrect(t, 31, -90, 14, 34, 3); };
  var hCap = function (t) { rrect(t, 28, -96, 20, 8, 3.5); };
  var hBoard = function (t) { rrect(t, -37, -90, 74, 60, 12); };
  var hDoor = function (t) { t.moveTo(-12, 0); t.lineTo(-12, -15); t.arc(0, -15, 12, Math.PI, 0); t.lineTo(12, 0); t.closePath(); };
  var hDoorFrame = function (t) { t.moveTo(-15.5, 0.5); t.lineTo(-15.5, -15); t.arc(0, -15, 15.5, Math.PI, 0); t.lineTo(15.5, 0.5); t.closePath(); };
  var WINX = [-29, 29], WINY = -19;
  var WINS = [
    function (x) { return function (t) { circ(t, x, WINY, 8); }; },
    function (x) { return function (t) { rrect(t, x - 8, WINY - 8, 16, 16, 3); }; },
    function (x) { return function (t) { t.moveTo(x - 7, WINY + 9); t.lineTo(x - 7, WINY - 3); t.arc(x, WINY - 3, 7, Math.PI, 0); t.lineTo(x + 7, WINY + 9); t.closePath(); }; }
  ];
  function geoH(v) {
    if (hgeo[v]) return hgeo[v];
    var g = { v: v, roof: v % 3, win: Math.floor(v / 3) % 3, gum: Math.floor(v / 9) % 5 };
    g.R = ROOFS[g.roof];
    g.wins = WINX.map(function (x) { return WINS[g.win](x); });
    return (hgeo[v] = g);
  }
  function plaque(colour) { return colour ? { c: [0, -63], r: 17 } : { c: [0, -60], r: 30 }; }
  function houseBox(S, opt) {
    S = num(S, 150); var k = S / 100, o = opt || {}, col = houseColour(o), pq = plaque(col);
    return {
      x0: -61 * k, y0: -107 * k, x1: 61 * k, y1: 2 * k, w: 122 * k, h: 109 * k,
      signC: [pq.c[0] * k, pq.c[1] * k], signR: pq.r * k, signW: (col ? 30 : 74) * k, signH: (col ? 30 : 60) * k,
      chimney: [38 * k, -98 * k], door: { x0: -12 * k, y0: -27 * k, x1: 12 * k, y1: 0 }, windows: WINX.map(function (x) { return [x * k, WINY * k]; })
    };
  }
  function houseColour(o) { return pal(o.color) ? o.color : (o.sign && o.sign.kind === 'blob' && pal(o.sign.color) ? o.sign.color : null); }
  var ROOFC = { base: HOUSE.roof, dark: HOUSE.roofDark, light: '#FFFFFF' };
  function drips(ctx, y, x0, x1, fill, line) {
    ctx.fillStyle = fill; ctx.strokeStyle = line; ctx.lineWidth = 2.6;
    ctx.beginPath();
    for (var x = x0, i = 0; x <= x1 + 0.1; x += 11.5, i++) {
      var L = i % 3 === 1 ? 9 : 5;
      ctx.moveTo(x - 5, y); ctx.lineTo(x - 5, y + L - 5); ctx.arc(x, y + L - 5, 5, Math.PI, 0, true); ctx.lineTo(x + 5, y);
    }
    ctx.fill(); ctx.stroke();
  }
  function pipeDots(ctx, pts, r, col, line) {
    pts.forEach(function (p) { dot(ctx, p[0], p[1], r, col); });
    if (line) { ctx.strokeStyle = line; ctx.lineWidth = 1.1; ctx.beginPath(); pts.forEach(function (p) { circ(ctx, p[0], p[1], r); }); ctx.stroke(); }
  }
  function gumdrop(ctx, x, y, col, q) {
    var C = { base: col, dark: mix(col, '#6A5A5A', 0.35), light: '#FFFFFF' };
    cel(ctx, 'h.gum', function (t) { t.moveTo(-9, 0); t.bezierCurveTo(-10, -15, 10, -15, 9, 0); t.closePath(); }, C, { s: 2, line: mix(col, '#5A4A48', 0.55), lw: 2.6, hl: [-3, -8, 2.4, 1.6, -0.5] });
    void x; void y;
    [[-4, -4], [3, -7], [5, -2]].forEach(function (p) { dot(ctx, p[0], p[1], 1.1, 'rgba(255,255,255,0.8)'); });
    if (q > 0) { ctx.fillStyle = SNOWC.base; ctx.beginPath(); ell(ctx, 0, -10, 6 + 2 * q, 2.4 + 1.4 * q, 0); ctx.fill(); }
  }
  function snowBand(ctx, build, d, th) {   // the region of the roof (shifted up d) that lies above the roof shifted down th
    ctx.save();
    ctx.translate(0, -d); ctx.beginPath(); build(ctx); ctx.clip();
    ctx.beginPath(); build(ctx); ctx.translate(0, d + th); build(ctx); ctx.translate(0, -th);
    ctx.fillStyle = SNOWC.base; ctx.fill('evenodd');
    ctx.strokeStyle = SNOWC.line; ctx.lineWidth = 1.8; ctx.stroke();
    ctx.restore();
  }
  /** the static body (cached): chimney, walls, windows (unlit), door frame + interior, roof, sign board + thing, snow */
  function houseBody(ctx, g, colour, sign, q, lang, img) {
    var c = colour ? pal(colour) : null, rc = c || ROOFC, rl = c ? lineOf(c) : HOUSE.roofLine, R = g.R;
    var WALLC = { base: HOUSE.wall, dark: HOUSE.shade, light: HOUSE.light };
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // chimney (behind the roof)
    cel(ctx, 'h.chim', hChim, WALLC, { s: 3, line: HOUSE.line, hl: false });
    cel(ctx, 'h.cap', hCap, { base: HOUSE.trim, dark: '#E6D9C2', light: '#FFFFFF' }, { s: 2, line: HOUSE.roofLine, lw: 2.6, hl: false });
    if (q > 0) { ctx.fillStyle = SNOWC.base; ctx.beginPath(); ell(ctx, 38, -96, 10 + 2 * q, 3 + 2 * q, 0); ctx.fill(); ctx.strokeStyle = SNOWC.line; ctx.lineWidth = 1.6; ctx.stroke(); }
    // walls
    cel(ctx, 'h.wall', hWall, WALLC, { s: 5, line: HOUSE.line, hl: false, inner: function (x) {
      x.fillStyle = rgba(HOUSE.light, 0.6); x.beginPath(); ell(x, -30, -40, 9, 3.5, -0.2); x.fill();
      // piped icing: a wavy line along the base and dotted corners
      x.strokeStyle = HOUSE.trim; x.lineWidth = 3.2; x.beginPath(); x.moveTo(-44, -5);
      for (var i = 0; i < 11; i++) x.quadraticCurveTo(-40 + i * 8, i % 2 ? -1 : -9, -36 + i * 8, -5);
      x.stroke();
    } });
    pipeDots(ctx, [[-40, -44], [-40, -34], [-40, -24], [40, -44], [40, -34], [40, -24]], 2.2, HOUSE.trim);
    // windows (unlit glass; the lit glow is an overlay)
    g.wins.forEach(function (w, i) {
      ctx.fillStyle = HOUSE.glass; fillP(ctx, P('h.win' + g.win + i, w));
      ctx.save(); clipP(ctx, P('h.win' + g.win + i, w));
      ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.beginPath(); ell(ctx, WINX[i] - 3, WINY - 4, 4, 2.4, -0.5); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = HOUSE.trim; ctx.lineWidth = 3.4; strokeP(ctx, P('h.win' + g.win + i, w));
      if (g.win !== 0) { ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(WINX[i], WINY - 9); ctx.lineTo(WINX[i], WINY + 8); ctx.moveTo(WINX[i] - 8, WINY + 1); ctx.lineTo(WINX[i] + 8, WINY + 1); ctx.stroke(); }
      ctx.fillStyle = HOUSE.trim; ctx.beginPath(); rrect(ctx, WINX[i] - 11, WINY + 9, 22, 4.5, 2.2); ctx.fill();
      ctx.strokeStyle = HOUSE.roofLine; ctx.lineWidth = 1.4; ctx.stroke();
      if (q > 0) { ctx.fillStyle = SNOWC.base; ctx.beginPath(); ell(ctx, WINX[i], WINY + 8.5, 10, 1.6 + 1.6 * q, 0); ctx.fill(); }
    });
    // door frame + the warm interior (the door panel itself is drawn per frame)
    cel(ctx, 'h.dframe', hDoorFrame, { base: HOUSE.trim, dark: '#E6D9C2', light: '#FFFFFF' }, { s: 1.6, line: HOUSE.roofLine, lw: 2.6, hl: false });
    var gi = ctx.createLinearGradient(0, -27, 0, 0); gi.addColorStop(0, HOUSE.inside); gi.addColorStop(1, '#7A4A2E');
    ctx.fillStyle = gi; fillP(ctx, P('h.door', hDoor));
    ctx.fillStyle = 'rgba(255,190,110,0.35)'; ctx.beginPath(); ell(ctx, 0, -2, 9, 3, 0); ctx.fill();
    ctx.fillStyle = HOUSE.trim; ctx.beginPath(); rrect(ctx, -17, -1.5, 34, 4, 2); ctx.fill(); ctx.strokeStyle = HOUSE.roofLine; ctx.lineWidth = 1.4; ctx.stroke();
    // roof: a gingerbread fascia under a thick icing slab with drips
    ctx.save(); ctx.translate(0, 4); cel(ctx, 'h.roof' + g.roof, R.path, WALLC, { s: 0, line: HOUSE.line, hl: false }); ctx.restore();
    var rb = bbox('h.roof' + g.roof, R.path);
    drips(ctx, rb.y + rb.h - 1, rb.x + 7, rb.x + rb.w - 7, rc.base, rl);
    cel(ctx, 'h.roof' + g.roof, R.path, rc, { s: 4.2, line: rl, hl: [-20, R.peak + 22, 10, 4, -0.7], inner: function (x) {
      x.fillStyle = rgba(c ? mix(c.light, '#FFFFFF', 0.3) : '#FFFFFF', 0.9);
      if (g.roof === 0) { for (var i = 1; i <= 4; i++) { dot(x, -i * 11.5, R.peak + 6 + i * 9.8, 2.2, x.fillStyle); dot(x, i * 11.5, R.peak + 6 + i * 9.8, 2.2, x.fillStyle); } }
      else {
        x.strokeStyle = rgba(c ? c.dark : HOUSE.roofDark, 0.45); x.lineWidth = 2.2; x.beginPath();
        var rows = g.roof === 1 ? [-58, -48] : [-70, -58, -48];
        rows.forEach(function (yy, j) { for (var xx = -60 + (j % 2) * 7; xx < 62; xx += 14) { x.moveTo(xx - 7, yy); x.arc(xx, yy, 7, Math.PI, 0, true); } });
        x.stroke();
      }
    } });
    if (q > 0) {
      snowBand(ctx, R.path, 1.5 + 2 * q, 1.5 + 4 * q);
      // a soft heap of snow on the ridge + two lumps: reads as snow, not as a glass rim
      ctx.fillStyle = SNOWC.base; ctx.strokeStyle = SNOWC.line; ctx.lineWidth = 1.6;
      var hw = g.roof === 1 ? 30 : 16;
      ctx.beginPath(); ell(ctx, 0, R.peak + 3 + (g.roof === 1 ? 2 : 4), hw * (0.5 + 0.5 * q), 3 + 3 * q, 0); ctx.fill(); ctx.stroke();
      if (g.roof === 1) { [[-34, -78], [34, -78]].forEach(function (b) { ctx.beginPath(); ell(ctx, b[0], b[1], 7 * q + 3, 2.5 + 2 * q, b[0] < 0 ? -0.6 : 0.6); ctx.fill(); ctx.stroke(); }); }
    }
    // the sign: a round colour plaque in the gable, or the big cream board over the door
    var gumY = R.peak + 2;
    if (c) {
      var pq = plaque(true);
      cel(ctx, 'h.plq', function (t) { circ(t, pq.c[0], pq.c[1], pq.r); }, SIGN, { s: 2.4, line: SIGN.line, lw: 3, hl: false });
      ctx.save(); ctx.translate(pq.c[0], pq.c[1]); ctx.scale(0.28, 0.28); ctx.translate(0, 2); drawBlob(ctx, c); ctx.restore();
    } else if (sign) {
      cel(ctx, 'h.board', hBoard, SIGN, { s: 3.6, line: SIGN.line, lw: 3.6, hl: false, inner: function (x) {
        x.strokeStyle = rgba('#FFFFFF', 0.85); x.lineWidth = 2.4; x.beginPath(); rrect(x, -33, -86, 66, 52, 9); x.stroke();
      } });
      var dotsB = []; for (var bx = -30; bx <= 30.1; bx += 10) { dotsB.push([bx, -90]); dotsB.push([bx, -30]); }
      pipeDots(ctx, dotsB, 1.8, HOUSE.trim, SIGN.line);
      ctx.save(); ctx.beginPath(); rrect(ctx, -36, -89, 72, 58, 11); ctx.clip();
      boardThing(ctx, sign, lang, img);
      ctx.restore();
      if (q > 0) { ctx.fillStyle = SNOWC.base; ctx.beginPath(); rrect(ctx, -34, -94 - 2 * q, 68, 5 + 3 * q, 4); ctx.fill(); ctx.strokeStyle = SNOWC.line; ctx.lineWidth = 1.6; ctx.stroke(); }
      gumY = -90 - (q > 0 ? 2 + 3 * q : 0);
    }
    ctx.save(); ctx.translate(0, gumY); gumdrop(ctx, 0, 0, GUMS[g.gum], q); ctx.restore();
  }
  /** a thing on the sign board (board inner ≈ 70 × 56 at centre (0, −60)); dots / tiles are drawn straight on the board */
  function boardThing(ctx, th, lang, img) {
    var k = kindOf(th), CX = 0, CY = -60;
    if (k === 'dots') {
      var n = Math.max(1, Math.min(12, Math.round(num(th.n, 1))));
      if (th.numeral) {
        var two = n >= 10, dvx = two ? 4 : -1;   // two-digit numerals get a wider column
        signText(ctx, String(n), two ? -15 : -17, CY + 1, two ? 36 : 28, 42, INK);
        ctx.strokeStyle = rgba(SIGN.line, 0.5); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(dvx, -82); ctx.lineTo(dvx, -38); ctx.stroke();
        boardDots(ctx, n, { r: [dvx + 3, -84, 34, -36], cap: 8 });
      } else boardDots(ctx, n, { r: [-33, -86, 33, -34], cap: 11 });
      return;
    }
    if (k === 'tile') { var txt = tileText(th, lang); signText(ctx, txt, CX, CY, 64, txt.length <= 1 ? 46 : txt.length <= 2 ? 40 : 30, INK); return; }
    var size = 57 * (th.big === false ? 1 : 1), ext = (footOf(th) - headOf(th)) / 100 * (th.big === false ? SMALL : 1);
    if (ext * size > 54) size = 54 / ext;
    ctx.save(); ctx.translate(CX, CY + ext * size / 2);
    ctx.scale(size / 100 * (th.big === false ? SMALL : 1), size / 100 * (th.big === false ? SMALL : 1)); ctx.translate(0, -footOf(th));
    thingBody(ctx, th, img, lang);
    ctx.restore();
  }
  function boardDots(ctx, n, R) {
    var best = null;
    DOPT[n].concat(BOPT[n] || []).forEach(function (rows) { var u = unitPts(rows), rs = fitR(u, R); if (!best || rs > best.rs + 0.3) best = { u: u, rs: rs }; });
    var rs = n === 1 ? R.cap * 1.25 : best.rs, cx = (R.r[0] + R.r[2]) / 2, cy = (R.r[1] + R.r[3]) / 2;
    best.u.forEach(function (p) {
      var x = cx + p[0] * rs, y = cy + p[1] * rs;
      dot(ctx, x + rs * 0.08, y + rs * 0.12, rs, 'rgba(120,90,50,0.25)');
      dot(ctx, x, y, rs, INK);
      dot(ctx, x - rs * 0.32, y - rs * 0.34, rs * 0.28, 'rgba(255,255,255,0.55)');
    });
  }
  var BOPT = { 7: [[2, 2, 2, 1], [2, 1, 2, 2]], 8: [[2, 2, 2, 2]], 9: [[3, 3, 3]], 10: [[3, 2, 3, 2], [2, 3, 3, 2]], 11: [[3, 3, 3, 2]], 12: [[3, 3, 3, 3]] };
  var HSW = 132, HSH = 124, HSX = 66, HSY = 112;   // house sprite box (design units) and the origin inside it
  function drawHouseBody(ctx, g, colour, sign, q, lang) {
    var img = sign && kindOf(sign) === 'animal' ? assetImg('animals/' + animalOf(sign), 200 * devScale(ctx) * 0.6) : null;
    if (canDOM()) {
      var dev = devScale(ctx), devPx = bucket(100 * dev, 12, 1400), u = devPx / 100;
      var key = 'h:' + g.v + ':' + (colour || '') + ':' + (colour ? '' : sign ? thingKey(sign, lang) + (img ? 'i' : '') : '') + ':' + Math.round(q * 4) + '|' + devPx.toFixed(1), cv = sget(key);
      if (cv) stats.houseHit++;
      else {
        try {
          cv = makeCanvas(HSW * u, HSH * u);
          var x = cv.getContext('2d');
          if (!x) cv = null; else { x.setTransform(u, 0, 0, u, HSX * u, HSY * u); houseBody(x, g, colour, sign, q, lang, img); stats.houseBuilt++; sput(key, cv); }
        } catch (e) { cv = null; }
      }
      if (cv) { ctx.drawImage(cv, -HSX, -HSY, HSW, HSH); return; }
    }
    houseBody(ctx, g, colour, sign, q, lang, img);
  }
  function drawHouse(ctx, S, opt) {
    if (!ctx) return;
    S = num(S, 0); if (!(S > 0)) return;
    var o = opt || {}, alpha = o.alpha == null ? 1 : clamp01(num(o.alpha, 1)); if (alpha <= 0.001) return;
    var g = geoH(variant(o.seed)), colour = houseColour(o), sign = o.sign && typeof o.sign === 'object' ? o.sign : null;
    var door = clamp01(o.door), lit = clamp01(o.lit), glow = clamp01(o.glow), act = clamp01(o.active), q = Math.round(clamp01(o.snow) * 4) / 4;
    var sq = Math.max(0.5, Math.min(1.5, num(o.squash, 1))), k = S / 100, lang = langOf(o);
    var c = colour ? pal(colour) : null;
    ctx.save(); ctx.globalAlpha *= alpha;
    ctx.scale(k, k);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // on the table: the soft shadow and the active ring
    ctx.fillStyle = 'rgba(80,52,30,0.22)'; ctx.beginPath(); ell(ctx, 3, 1, 60, 8, 0); ctx.fill();
    if (act > 0.01) {
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.9 * act).toFixed(3) + ')'; ctx.lineWidth = 4;
      ctx.beginPath(); ell(ctx, 0, 1, 66, 11, 0); ctx.stroke();
    }
    ctx.scale(1 + (1 - sq) * 0.5, sq);
    if (act > 0.01) ctx.translate(0, -3 * act);
    if (glow > 0.01) {   // hint: a warm outline around the whole house
      var parts = [hWall, hChim, hCap, g.R.path].concat(!c && sign ? [hBoard] : []);
      [[13, 'rgba(255,196,70,', 0.5], [7, 'rgba(255,226,130,', 0.95]].forEach(function (L) {
        ctx.strokeStyle = L[1] + (L[2] * glow).toFixed(3) + ')'; ctx.lineWidth = L[0];
        parts.forEach(function (p, i) { strokeP(ctx, P('h.glow' + (p === g.R.path ? 'r' + g.roof : i), p)); });
      });
    }
    drawHouseBody(ctx, g, colour, sign, q, lang);
    // lit windows (overlay)
    if (lit > 0.01) {
      g.wins.forEach(function (w, i) {
        var gr = ctx.createRadialGradient(WINX[i], WINY, 2, WINX[i], WINY, 20);
        gr.addColorStop(0, 'rgba(255,214,120,' + (0.55 * lit).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(255,214,120,0)');
        ctx.fillStyle = gr; ctx.beginPath(); circ(ctx, WINX[i], WINY, 20); ctx.fill();
        ctx.save(); ctx.globalAlpha *= lit;
        var gw = ctx.createLinearGradient(0, WINY - 9, 0, WINY + 9); gw.addColorStop(0, HOUSE.litLight); gw.addColorStop(1, HOUSE.lit);
        ctx.fillStyle = gw; fillP(ctx, P('h.win' + g.win + i, w));
        ctx.strokeStyle = HOUSE.trim; ctx.lineWidth = 3.4; strokeP(ctx, P('h.win' + g.win + i, w));
        if (g.win !== 0) { ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(WINX[i], WINY - 9); ctx.lineTo(WINX[i], WINY + 8); ctx.moveTo(WINX[i] - 8, WINY + 1); ctx.lineTo(WINX[i] + 8, WINY + 1); ctx.stroke(); }
        ctx.restore();
      });
      ctx.fillStyle = 'rgba(255,200,110,' + (0.4 * lit * door).toFixed(3) + ')'; ctx.beginPath(); ell(ctx, 0, -8, 10, 9, 0); ctx.fill();
    }
    // the door panel, hinged on the left edge (x −12): its width shrinks as it swings open towards the viewer
    var f = 1 - 0.86 * door;
    if (f > 0.02) {
      var D = c ? { base: c.base, dark: c.dark, light: c.light } : { base: HOUSE.door, dark: HOUSE.doorDark, light: '#D9A066' }, dl = c ? lineOf(c) : HOUSE.doorLine;
      ctx.save(); ctx.translate(-12, 0); ctx.scale(f, 1); ctx.translate(12, 0);
      if (door > 0.02) { ctx.save(); ctx.translate(-2.5 * door / f, 0); ctx.fillStyle = D.dark; fillP(ctx, P('h.door', hDoor)); ctx.restore(); }
      cel(ctx, 'h.door', hDoor, D, { s: 3, line: dl, lw: 2.8, hl: false, inner: function (x) {
        x.strokeStyle = rgba(D.dark, 0.55); x.lineWidth = 1.8; x.beginPath(); x.moveTo(-4, -25); x.lineTo(-4, 0); x.moveTo(4, -25); x.lineTo(4, 0); x.stroke();
        x.fillStyle = rgba(mix(D.light, '#FFFFFF', 0.4), 0.7); x.beginPath(); ell(x, -6, -20, 3, 4.5, 0.3); x.fill();
      } });
      ctx.restore();
      if (f > 0.35) {   // the knob + a little iced heart
        var kx = -12 + (19.5) * f;
        dot(ctx, kx, -11, 2.4, HOUSE.trim); ctx.strokeStyle = dl; ctx.lineWidth = 1.2; ctx.beginPath(); circ(ctx, kx, -11, 2.4); ctx.stroke();
      }
    }
    ctx.restore();
  }

  // ================================================================= HEART PUFF + SPRINKLES
  var heartP = function (t) {   // a puffy heart, ≈ 100 × 90 centred
    t.moveTo(0, 42);
    t.bezierCurveTo(-18, 30, -50, 10, -48, -14);
    t.bezierCurveTo(-46, -36, -20, -44, 0, -24);
    t.bezierCurveTo(20, -44, 46, -36, 48, -14);
    t.bezierCurveTo(50, 10, 18, 30, 0, 42);
    t.closePath();
  };
  function drawHeartPuff(ctx, r, a) {
    if (!ctx) return;
    a = a == null ? 1 : clamp01(a); r = num(r, 16); if (a <= 0.001 || !(r > 0)) return;
    var s = r / 50;
    ctx.save(); ctx.globalAlpha *= a; ctx.scale(s, s);
    var gs = ctx.createRadialGradient(0, 0, 8, 0, 0, 70); gs.addColorStop(0, 'rgba(255,236,242,0.55)'); gs.addColorStop(1, 'rgba(255,236,242,0)');
    ctx.fillStyle = gs; ctx.beginPath(); circ(ctx, 0, 0, 70); ctx.fill();
    ctx.lineJoin = 'round';
    var hp = P('hp.heart', heartP);
    ctx.fillStyle = '#FBE4EA'; fillP(ctx, hp);
    ctx.save(); clipP(ctx, hp);
    ctx.fillStyle = '#F2CBD6'; ctx.beginPath(); ell(ctx, 16, 20, 40, 26, -0.4); ctx.fill();
    // puffy smoke bumps inside
    [[-24, -16, 17], [22, -16, 17], [0, 8, 20], [-14, 14, 12], [14, 14, 12]].forEach(function (b) { dot(ctx, b[0] - 3, b[1] - 3, b[2], 'rgba(255,248,250,0.8)'); });
    ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ell(ctx, -24, -22, 11, 6, -0.6); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#E2A9BA'; ctx.lineWidth = 5; strokeP(ctx, hp);
    ctx.restore();
  }
  function drawSprinkle(ctx, kind, r, rot) {
    if (!ctx) return;
    r = num(r, 6); if (!(r > 0)) return;
    var k = Math.abs(Math.round(num(kind, 0))) % 6, col = SPRINKLES[k], line = mix(col, '#7A6E68', 0.42);
    ctx.save(); ctx.rotate(num(rot, 0));
    ctx.fillStyle = col; ctx.strokeStyle = line; ctx.lineWidth = Math.max(0.8, r * 0.22);
    ctx.beginPath();
    if (k < 3) rrect(ctx, -r, -r * 0.34, 2 * r, r * 0.68, r * 0.34);
    else circ(ctx, 0, 0, r * 0.62);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath();
    if (k < 3) ell(ctx, -r * 0.35, -r * 0.08, r * 0.38, r * 0.1, 0); else ell(ctx, -r * 0.2, -r * 0.22, r * 0.2, r * 0.13, -0.6);
    ctx.fill();
    ctx.restore();
  }
  function drawSnowflake(ctx, r, rot, a) {
    if (!ctx) return;
    a = a == null ? 1 : clamp01(a); r = num(r, 30); if (a <= 0.001 || !(r > 0)) return;
    ctx.save(); ctx.globalAlpha *= a; ctx.rotate(num(rot, 0));
    var gs = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.2);
    gs.addColorStop(0, 'rgba(255,255,255,0.55)'); gs.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gs; ctx.beginPath(); circ(ctx, 0, 0, r * 1.2); ctx.fill();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    function arms(q) {
      q.beginPath();
      for (var i = 0; i < 6; i++) {
        var an = i * TAU / 6 - Math.PI / 2, c = Math.cos(an), s = Math.sin(an);
        q.moveTo(c * r * 0.18, s * r * 0.18); q.lineTo(c * r * 0.86, s * r * 0.86);
        [[0.46, 0.22], [0.68, 0.16]].forEach(function (b) {
          var bx = c * r * b[0], by = s * r * b[0];
          [0.9, -0.9].forEach(function (d) { var a2 = an + d; q.moveTo(bx, by); q.lineTo(bx + Math.cos(a2) * r * b[1], by + Math.sin(a2) * r * b[1]); });
        });
      }
    }
    var w = Math.max(2, r * 0.12);
    arms(ctx); ctx.strokeStyle = '#8FA8D0'; ctx.lineWidth = w + Math.max(2, r * 0.07); ctx.stroke();
    arms(ctx); ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = w; ctx.stroke();
    for (var i = 0; i < 6; i++) {
      var an = i * TAU / 6 - Math.PI / 2;
      dot(ctx, Math.cos(an) * r * 0.9, Math.sin(an) * r * 0.9, r * 0.1, '#8FA8D0');
      dot(ctx, Math.cos(an) * r * 0.9, Math.sin(an) * r * 0.9, r * 0.07, '#FFFFFF');
    }
    ctx.fillStyle = '#8FA8D0'; ctx.beginPath(); circ(ctx, 0, 0, r * 0.26); ctx.fill();
    ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); circ(ctx, 0, 0, r * 0.2); ctx.fill();
    dot(ctx, -r * 0.06, -r * 0.07, r * 0.06, '#DCE8FA');
    ctx.restore();
  }

  // ================================================================= HOME BADGES (unit radius 50, centred)
  var BADGE = {
    farm: { sky: ['#CFE7F1', '#EEF6E8'], draw: function (x) {
      oval(x, -10, 46, 70, 30, 0, '#9CC27A'); oval(x, 30, 52, 60, 24, 0, '#86B064');
      x.fillStyle = '#B5735E'; x.strokeStyle = '#7E4A3C'; x.lineWidth = 3;
      x.beginPath(); x.moveTo(-24, 26); x.lineTo(-24, -4); x.lineTo(-12, -20); x.lineTo(12, -20); x.lineTo(24, -4); x.lineTo(24, 26); x.closePath(); x.fill(); x.stroke();
      x.fillStyle = '#7E4A3C'; x.beginPath(); x.moveTo(-28, -2); x.lineTo(-13, -24); x.lineTo(13, -24); x.lineTo(28, -2); x.lineTo(24, 0); x.lineTo(11, -19); x.lineTo(-11, -19); x.lineTo(-24, 0); x.closePath(); x.fill();
      x.fillStyle = '#5A3428'; x.fillRect(-9, 6, 18, 20);
      x.strokeStyle = '#F1E6CF'; x.lineWidth = 2.2; x.strokeRect(-9, 6, 18, 20);
      x.beginPath(); x.moveTo(-9, 6); x.lineTo(9, 26); x.moveTo(9, 6); x.lineTo(-9, 26); x.stroke();
      x.fillStyle = '#F1E6CF'; x.fillRect(-5, -12, 10, 8);
      oval(x, -36, -26, 9, 4, 0, '#FFFFFF'); oval(x, -29, -28, 7, 4.5, 0, '#FFFFFF');
    } },
    sea: { sky: ['#BFE3F2', '#E6F4F8'], draw: function (x) {
      oval(x, 22, -24, 9, 9, 0, '#F7D98A');
      x.fillStyle = '#5BA7C9'; x.fillRect(-60, -2, 120, 70);
      x.strokeStyle = '#FFFFFF'; x.lineWidth = 3.2;
      [-2, 12].forEach(function (yy, j) { x.beginPath(); for (var i = -60; i <= 60; i += 20) { x.moveTo(i + (j ? 10 : 0), yy); x.quadraticCurveTo(i + 5 + (j ? 10 : 0), yy - 6, i + 10 + (j ? 10 : 0), yy); } x.stroke(); });
      oval(x, 0, 40, 60, 14, 0, '#F1DDB0');
      x.save(); x.translate(-6, 30);
      x.fillStyle = '#F4B8A8'; x.strokeStyle = '#B9705E'; x.lineWidth = 2.4;
      x.beginPath(); x.moveTo(-14, 6); x.quadraticCurveTo(-16, -14, 0, -15); x.quadraticCurveTo(16, -14, 14, 6); x.closePath(); x.fill(); x.stroke();
      x.fillRect(-5, 5, 10, 4); x.strokeRect(-5, 5, 10, 4);
      x.beginPath(); [-8, -3, 3, 8].forEach(function (d) { x.moveTo(d * 0.4, 5); x.lineTo(d * 1.2, -11); }); x.stroke();
      x.restore();
    } },
    ice: { sky: ['#D6E6F7', '#F2F7FC'], draw: function (x) {
      x.fillStyle = '#7FA9CF'; x.fillRect(-60, 14, 120, 60);
      x.fillStyle = '#FFFFFF'; x.strokeStyle = '#8EB4D6'; x.lineWidth = 3;
      x.beginPath(); x.moveTo(-34, 16); x.lineTo(-22, -16); x.lineTo(-10, -8); x.lineTo(4, -30); x.lineTo(20, -6); x.lineTo(30, -14); x.lineTo(40, 16); x.closePath(); x.fill(); x.stroke();
      x.fillStyle = '#D6E8F7'; x.beginPath(); x.moveTo(4, -30); x.lineTo(20, -6); x.lineTo(30, -14); x.lineTo(40, 16); x.lineTo(8, 16); x.closePath(); x.fill();
      x.fillStyle = 'rgba(214,232,247,0.75)'; x.beginPath(); x.moveTo(-30, 18); x.lineTo(36, 18); x.lineTo(22, 34); x.lineTo(-18, 32); x.closePath(); x.fill();
      x.strokeStyle = '#FFFFFF'; x.lineWidth = 2.4; x.beginPath(); x.moveTo(-44, 44); x.lineTo(-30, 44); x.moveTo(18, 50); x.lineTo(36, 50); x.stroke();
    } },
    jungle: { sky: ['#CDE8C2', '#EDF6E2'], draw: function (x) {
      oval(x, 0, 48, 70, 22, 0, '#6E9E58');
      x.strokeStyle = '#7A5130'; x.lineWidth = 7; x.beginPath(); x.moveTo(-6, 44); x.quadraticCurveTo(-10, 10, 4, -14); x.stroke();
      x.strokeStyle = '#A57A4C'; x.lineWidth = 2; x.beginPath(); [34, 22, 10, -2].forEach(function (yy) { x.moveTo(-10, yy); x.lineTo(-3, yy - 2); }); x.stroke();
      [[-2.6, 34], [-1.9, 32], [-0.9, 30], [-0.2, 32], [0.6, 30]].forEach(function (f) {
        x.save(); x.translate(4, -14); x.rotate(f[0]);
        x.fillStyle = '#5E9A4A'; x.strokeStyle = '#3E6E30'; x.lineWidth = 2.2;
        x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(f[1] * 0.5, -10, f[1], 2); x.quadraticCurveTo(f[1] * 0.5, 3, 0, 0); x.closePath(); x.fill(); x.stroke();
        x.restore();
      });
      [[-30, 36, -0.6], [30, 38, 0.7]].forEach(function (l) {
        x.save(); x.translate(l[0], l[1]); x.rotate(l[2]);
        x.fillStyle = '#7BB660'; x.strokeStyle = '#3E6E30'; x.lineWidth = 2.2;
        x.beginPath(); ell(x, 0, -10, 9, 16, 0); x.fill(); x.stroke();
        x.beginPath(); x.moveTo(0, 4); x.lineTo(0, -22); x.stroke();
        x.restore();
      });
      dot(x, 8, -4, 3.4, '#8E6A3E'); dot(x, 1, -2, 3.2, '#8E6A3E');
    } },
    savanna: { sky: ['#F7D9A8', '#FBEBCB'], draw: function (x) {
      dot(x, 18, -14, 15, '#F3B65A'); dot(x, 18, -14, 11, '#F7C978');
      x.fillStyle = '#D8B46E'; x.fillRect(-60, 18, 120, 60);
      oval(x, 0, 20, 70, 8, 0, '#C9A25C');
      x.strokeStyle = '#6E4E34'; x.lineWidth = 5; x.beginPath(); x.moveTo(-14, 22); x.lineTo(-14, -2); x.moveTo(-14, 4); x.lineTo(-26, -8); x.moveTo(-14, 0); x.lineTo(-2, -10); x.stroke();
      x.fillStyle = '#7E9A4E'; x.strokeStyle = '#506A30'; x.lineWidth = 2.4;
      x.beginPath(); ell(x, -14, -14, 30, 9, 0); x.fill(); x.stroke();
      oval(x, -20, -17, 14, 3, 0, '#9AB566');
      x.strokeStyle = '#B08A48'; x.lineWidth = 1.8;
      x.beginPath(); [-40, -34, 26, 32, 38].forEach(function (gx) { x.moveTo(gx, 36); x.lineTo(gx - 2, 29); x.moveTo(gx + 3, 36); x.lineTo(gx + 4, 30); }); x.stroke();
    } }
  };
  function drawHomeBadge(ctx, home, r, opt) {
    if (!ctx) return;
    r = num(r, 46); if (!(r > 0)) return;
    var o = opt || {}, a = o.a != null ? clamp01(o.a) : o.alpha != null ? clamp01(o.alpha) : 1, pop = o.pop == null ? 1 : clamp01(o.pop);
    if (a <= 0.001 || pop <= 0.001) return;
    var B = BADGE[home] || BADGE.farm, s = r / 50 * pop;
    ctx.save(); ctx.globalAlpha *= a; ctx.scale(s, s);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    oval(ctx, 2, 4, 52, 52, 0, 'rgba(60,50,40,0.22)');
    dot(ctx, 0, 0, 52, '#FFFDF6');
    ctx.save(); ctx.beginPath(); circ(ctx, 0, 0, 44); ctx.clip();
    var g = ctx.createLinearGradient(0, -44, 0, 44); g.addColorStop(0, B.sky[0]); g.addColorStop(1, B.sky[1]);
    ctx.fillStyle = g; ctx.fillRect(-46, -46, 92, 92);
    B.draw(ctx);
    ctx.restore();
    ctx.strokeStyle = '#E2D6BE'; ctx.lineWidth = 2.4; ctx.beginPath(); circ(ctx, 0, 0, 44); ctx.stroke();
    ctx.strokeStyle = '#9C7A5A'; ctx.lineWidth = 2.8; ctx.beginPath(); circ(ctx, 0, 0, 52); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ell(ctx, -22, -28, 10, 4.5, -0.6); ctx.fill();
    ctx.restore();
  }

  // ================================================================= ICONS (centred in a size × size box)
  function drawIcon(ctx, choice, size) {
    if (!ctx || !choice) return;
    size = num(size, 100); if (!(size > 0)) return;
    var t = choice, k = t.kind;
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (KINDS.indexOf(k) >= 0) {
      var box = size * 0.82, h = thingTop(t, box);
      ctx.translate(0, h / 2);
      drawThing(ctx, t, box, { shadow: false });
    } else if (k === 'letter') {
      var lt = { kind: 'tile', text: t.text }, hb = thingTop(lt, size * 0.82);
      ctx.translate(0, hb / 2); drawThing(ctx, lt, size * 0.82, { shadow: false });
    } else if (k === 'number') {
      var n = Math.round(num(t.n != null ? t.n : t.text, 1)), s1 = size / 100;
      ctx.scale(s1, s1);
      var dots = n >= 1 && n <= 10;
      cel(ctx, 'ic.card', function (x) { rrect(x, -45, -47, 90, 94, 20); }, SIGN, { s: 3.4, line: SIGN.line, lw: 3.2, hl: false });
      signText(ctx, String(n), 0, dots ? -14 : 0, 70, dots ? 36 : 54, INK);
      if (dots) {
        var rows = n <= 5 ? [n] : [5, n - 5], dr = 6;
        rows.forEach(function (cnt, ri) {
          for (var i = 0; i < cnt; i++) {
            var dx = (i - (cnt - 1) / 2) * 16, dy = rows.length === 1 ? 26 : 20 + ri * 15;
            dot(ctx, dx, dy, dr, INK); dot(ctx, dx - 1.8, dy - 2, 1.6, 'rgba(255,255,255,0.55)');
          }
        });
      }
    } else if (k === 'color') {
      var c = pal(t.color) || FALLBACK.red, s2 = size / 100;
      ctx.scale(s2, s2); ctx.translate(0, -2);
      drawBlob(ctx, c);
    } else if (k === 'home') {
      drawHomeBadge(ctx, t.home, size * 0.46, {});
    } else if (k === 'size') {
      var inner = t.thing && KINDS.indexOf(t.thing.kind) >= 0 ? Object.assign({}, t.thing) : { kind: 'treat', obj: 'cupcake', color: t.color || 'pink' };
      var big = t.big === true || t.size === 'big';
      inner.big = true;
      if (big) { ctx.translate(0, size * 0.43); drawThing(ctx, inner, size * 0.86, { shadow: false }); }
      else {
        ctx.strokeStyle = 'rgba(110,100,90,0.4)'; if (ctx.setLineDash) ctx.setLineDash([5, 5]); ctx.lineWidth = 2;
        ctx.beginPath(); rrect(ctx, -size * 0.44, -size * 0.44, size * 0.88, size * 0.88, size * 0.12); ctx.stroke(); if (ctx.setLineDash) ctx.setLineDash([]);
        ctx.translate(0, size * 0.42); drawThing(ctx, inner, size * 0.86 * SMALL, { shadow: false });
      }
    } else {
      dot(ctx, 0, 0, size * 0.35, '#EEE8DC'); ctx.strokeStyle = '#B9A58A'; ctx.lineWidth = 3; ctx.beginPath(); circ(ctx, 0, 0, size * 0.35); ctx.stroke();
    }
    ctx.restore();
  }
  // ================================================================= HINT HAND (fingertip at (x, y), points UP-LEFT)
  var scratch = null;
  function layer(ctx, x0, y0, w, h, alpha, fn) {
    var m = canDOM() && ctx.getTransform ? ctx.getTransform() : null;
    var k = m ? Math.min(6, Math.max(Math.hypot(m.a, m.b), Math.hypot(m.c, m.d))) : 0;
    if (!(k > 0) || w * k > 2048 || h * k > 2048) { ctx.save(); ctx.globalAlpha *= alpha; fn(ctx); ctx.restore(); return; }
    var W = Math.ceil(w * k), H = Math.ceil(h * k);
    if (!scratch) scratch = document.createElement('canvas');
    if (scratch.width < W || scratch.height < H) { scratch.width = Math.max(scratch.width, W); scratch.height = Math.max(scratch.height, H); }
    var g = scratch.getContext('2d');
    if (!g) { ctx.save(); ctx.globalAlpha *= alpha; fn(ctx); ctx.restore(); return; }
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W + 1, H + 1);
    g.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
    g.lineJoin = 'round'; g.lineCap = 'round';
    fn(g);
    g.setTransform(1, 0, 0, 1, 0, 0);
    ctx.save(); ctx.globalAlpha *= alpha;
    ctx.drawImage(scratch, 0, 0, W, H, x0, y0, W / k, H / k);
    ctx.restore();
  }
  function drawHintHand(ctx, x, y, press, alpha, size) {
    if (!ctx) return;
    var a = alpha == null ? 1 : clamp01(alpha); if (a <= 0.001) return;
    var s = num(size, 96); if (!(s > 0)) return;
    var p = clamp01(press);
    ctx.save(); ctx.translate(num(x, 0), num(y, 0));
    if (a < 0.999) layer(ctx, -s * 0.45, -s * 0.4, s * 1.05, s * 1.5, a, function (g) { handBody(g, s, p); });
    else handBody(ctx, s, p);
    ctx.restore();
  }
  function handBody(ctx, s, p) {
    var F = '#FFF8EE', L = '#B9A58A', EDGE = '#4A4250';
    ctx.save();
    if (p > 0.02) {
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.9 * p).toFixed(3) + ')'; ctx.lineWidth = s * 0.035;
      ctx.beginPath(); ctx.arc(0, 0, s * (0.1 + 0.14 * (1 - p)), 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,206,90,' + (0.8 * p).toFixed(3) + ')'; ctx.lineWidth = s * 0.02;
      ctx.beginPath(); ctx.arc(0, 0, s * (0.2 + 0.1 * (1 - p)), 0, TAU); ctx.stroke();
    }
    ctx.rotate(-0.35);
    ctx.translate(0, s * 0.06 * (1 - p));
    ctx.scale(1 - 0.06 * p, 1 - 0.06 * p);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    function hand(q) {
      q.beginPath();
      rrect(q, -s * 0.085, 0, s * 0.17, s * 0.52, s * 0.085);
      rrect(q, -s * 0.26, s * 0.36, s * 0.47, s * 0.42, s * 0.14);
      q.moveTo(-s * 0.2, s * 0.5);
      q.ellipse(-s * 0.27, s * 0.46, s * 0.07, s * 0.15, -0.6, 0, TAU);
    }
    ctx.globalAlpha *= 0.96;
    ctx.save(); ctx.shadowColor = 'rgba(30,40,40,0.3)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
    hand(ctx); ctx.lineWidth = s * 0.07 + 6; ctx.strokeStyle = EDGE; ctx.stroke(); ctx.restore();
    hand(ctx); ctx.lineWidth = s * 0.07; ctx.strokeStyle = L; ctx.stroke();
    hand(ctx); ctx.fillStyle = F; ctx.fill();
    ctx.strokeStyle = '#EADFCB'; ctx.lineWidth = s * 0.03;
    ctx.beginPath(); ctx.moveTo(0, s * 0.5); ctx.lineTo(s * 0.18, s * 0.5); ctx.moveTo(0, s * 0.62); ctx.lineTo(s * 0.18, s * 0.62); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ell(ctx, -s * 0.03, s * 0.12, s * 0.025, s * 0.07, 0); ctx.fill();
    // cuff: Tupi's cream apron with a caramel trim
    ctx.fillStyle = '#F3E4C8'; ctx.strokeStyle = '#C98E4E'; ctx.lineWidth = s * 0.03;
    ctx.beginPath(); rrect(ctx, -s * 0.25, s * 0.76, s * 0.46, s * 0.14, s * 0.06); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(201,142,78,0.8)';
    [-0.15, -0.03, 0.09].forEach(function (dx) { ctx.beginPath(); circ(ctx, s * dx, s * 0.83, s * 0.018); ctx.fill(); });
    ctx.restore();
  }

  function clearCache() { pcache = {}; pN = 0; bcache = {}; lcache = {}; ccache = {}; scache = {}; sN = 0; hgeo = {}; lineMemo = {}; }

  BD.HouseArt = {
    drawHouse: drawHouse, houseBox: houseBox, drawThing: drawThing, drawHomeBadge: drawHomeBadge, drawSnowflake: drawSnowflake,
    drawIcon: drawIcon, drawHintHand: drawHintHand, drawHeartPuff: drawHeartPuff, drawSprinkle: drawSprinkle,
    dotLayout: function (n, numeral) { return dotLayout(n, numeral); }, cookieLayout: function (n) { return cookieLayout(n); },
    thingTop: thingTop, variant: variant, houseStyle: function (seed) { var g = geoH(variant(seed)); return { roof: g.roof, win: g.win, gum: g.gum }; },
    pal: function (n) { return pal(n) || null; }, lineOf: function (c) { var p = typeof c === 'string' ? pal(c) : c; return p ? lineOf(p) : null; },
    contrast: contrast, tileText: function (t, lang) { return tileText(t || {}, lang); },
    PALETTE: FALLBACK, HOUSE: HOUSE, SIGN: SIGN, TABLE: TABLE, FONT: FONT, INK: INK, SPRINKLES: SPRINKLES, GUMS: GUMS,
    TREATS: TREATS, SHAPES: SHAPES, ANIMALS: ANIMALS, HOMES: HOMES, KINDS: KINDS, SMALL: SMALL,
    thingKey: function (t, lang) { return thingKey(t, lang); }, clearCache: clearCache, stats: stats
  };
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
