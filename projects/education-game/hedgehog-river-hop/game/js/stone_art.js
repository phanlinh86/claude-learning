/* Nim's River Hop — NH.StoneArt (character artist B), DESIGN §3 / §4.3. Pure canvas code, node-safe at load.
 *
 *   drawStone(ctx, S, opt)             a river stepping stone, S = width. ORIGIN = the centre of the stone's TOP FACE (the
 *                                      point where things / Nim stand). Top face ≈ S × 0.36·S ellipse, side ≈ 0.22·S down
 *                                      to the waterline plane. opt = { seed (shape variant), tilt (rad, rotation about the
 *                                      origin), dip 0..1 (waterline moves up by 0.1·S), gold 0..1, glow 0..1, snow 0..1,
 *                                      wet 0..1, alpha 0..1, active 0..1 (dashed white ring on the water), t (s, optional:
 *                                      animates the active ring's dashes) }
 *                                      Draw it, then its thing at the same origin (same tilt transform).
 *   drawRipple(ctx, x, y, r, a, flat)  an ellipse ring on the water (flat = ry / rx, default 0.38)
 *   drawDrop(ctx, x, y, r, a)          a water droplet (teardrop, tip up), centred at (x, y)
 *   drawThing(ctx, thing, size, opt)   size = box height in px; ORIGIN = BOTTOM-CENTRE (it stands on the stone).
 *                                      opt = { glow 0..1, wiggle −1..1 (no-no rock about the base: ±0.3 rad), rot (rad, extra
 *                                      rotation about the base), alpha 0..1, count (dots: the first `count` dots are ringed
 *                                      while counted aloud), shadow (default true: a contact shadow at the origin), direct }
 *       thing = { kind 'obj'|'shape'|'dots'|'tile'|'animal', color?, obj?, shape?, n?, numeral?, animal?, text?, big? }
 *       big:false → drawn at size × 0.6
 *   drawFruit(ctx, kind, size, opt)    apple|pear|strawberry|mushroom|acorn; origin = centre; opt { rot, alpha, glow }
 *   drawHomeBadge(ctx, home, r, opt)   farm|sea|ice|jungle|savanna; opt { a, pop }       (centred)
 *   drawSnowflake(ctx, r, rot, a)      centred
 *   drawIcon(ctx, choice, size)        centred in a size × size box: any thing, {kind:'color', color}, {kind:'number', n},
 *                                      {kind:'home', home}, {kind:'size', big, thing?}, {kind:'letter', text}, {kind:'fruit', fruit}
 *   drawHintHand(ctx, x, y, press, alpha, size?)  fingertip at (x, y), points UP-LEFT
 *   drawLilyPad(ctx, r, rot, opt)      a muted green pad with a notch, seen in perspective (opt.flat, default 0.45), centred
 *   dotLayout(n, numeral) → { n, rs, pts:[[x,y]] } dot centres in the 100-unit thing box (y up from the base: pts are in
 *                                      the box's own coordinates, origin = bottom-centre, y negative upwards), reading order
 *   thingTop(thing, size) → px above the origin where the thing's top is (for badges / count fx above it)
 *   Helpers: pal, lineOf, contrast, PALETTE, STONE, GOLD, OBJS, SHAPES, FRUITS, ANIMALS, HOMES, KINDS, SMALL, thingKey,
 *            clearCache, stats
 *
 * Things are designed in a 100-unit box (x −50..50, y −50..50) and shifted so their foot sits on the origin. Paths are cached
 * as Path2D (size independent). In a browser every thing / fruit is rasterised once per thing + device-px bucket (×1.1 steps)
 * and every stone body once per (variant 0..7, snow level, plain|gold, device-px bucket); dip, tilt, wet, glow and active are
 * drawn per frame on top (clips + a few strokes). Without `document` everything is drawn as vectors (unit tests).
 */
(function (G) {
  'use strict';
  var NH = G.NH = G.NH || {};

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
  var STONE = { top: '#B9B2A6', side: '#8E877C', line: '#6C665D', hl: '#D8D2C7', shade: '#A8A194', sideDark: '#7A7369', speck: '#9F978A' };
  var GOLD = { top: '#E9B860', side: '#B98A3A', line: '#8A6420', hl: '#FBE3AE', shade: '#DCA850', sideDark: '#9E7430', speck: '#D09C48' };   // amber (fix round 1: further from answer yellow)
  var SNOWC = { base: '#F1F4F8', shade: '#C9D4E2', line: '#9DAEC4' };
  var WATER = { light: '#D9F0EC', shallow: '#7FB8B4', deep: '#4E8E95', shadow: '#2E5F66' };
  var SIGN = { base: '#F3E6CC', dark: '#D9C29A', light: '#FFF8E8', line: '#9C7A5A' };
  var POST = { base: '#B88A5E', dark: '#8A6440', light: '#D8B48C', line: '#6E4E34' };
  var SAGE = { base: '#8FB47A', dark: '#6A9058', light: '#C4DDB4', line: '#4F6E43' };
  var GLASS = { base: '#FFFFFF', dark: '#E3E8F2', light: '#FFFFFF' };
  var STAR = { base: '#FFC23A', dark: '#C98A12', light: '#FFE6A0' };
  var INK = '#3A3640';
  var OBJS = ['flower', 'mushroom', 'leaf', 'ball', 'duck'];
  var SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'oval', 'rect', 'diamond'];
  var FRUITS = ['apple', 'pear', 'strawberry', 'mushroom', 'acorn'];
  var ANIMALS = ['cow', 'pig', 'sheep', 'duck', 'hen', 'horse', 'goat', 'crab', 'penguin', 'lion', 'monkey', 'fishbowl'];
  var HOMES = ['farm', 'sea', 'ice', 'jungle', 'savanna'];
  var KINDS = ['obj', 'shape', 'dots', 'tile', 'animal'];
  var SMALL = 0.6, NV = 8;

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
    var P = NH.PALETTE, c = P && P[name] && okHex(P[name].base) && okHex(P[name].dark) && okHex(P[name].light) ? P[name] : FALLBACK[name];
    return c || null;
  }
  function lum(h) { var c = rgb(h).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
  function contrast(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  var LINES = { '#FFD23F': '#7A5600', '#FF9A2E': '#8A4600', '#FF8FC0': '#9A3A6A', '#4CC26B': '#1E6A34' }, lineMemo = {};
  /** outline of an answer colour: a darker tone of the fill, ≥ 3:1 against the grey stone top */
  function lineOf(c) {
    var k = String(c.base).toUpperCase() + c.dark;
    if (lineMemo[k]) return lineMemo[k];
    var l = LINES[String(c.base).toUpperCase()] || c.dark, i = 0;
    while (contrast(l, STONE.top) < 3.05 && i++ < 12) l = mix(l, '#1E1812', 0.14);
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
  var stats = { thingBuilt: 0, thingHit: 0, stoneBuilt: 0, stoneHit: 0, fruitBuilt: 0, fruitHit: 0 };
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

  // ================================================================= OBJS (painted in the answer colour; centred 100 box)
  var OBJ = {};
  // ---- flower: five big petals, brown centre, short sage stem with two leaves
  var flStem = function (t) { t.moveTo(0, 47); t.bezierCurveTo(-3, 34, 3, 22, 0, 4); };
  var flLeafL = function (t) { t.moveTo(-1, 36); t.bezierCurveTo(-8, 24, -22, 22, -27, 26); t.bezierCurveTo(-22, 36, -10, 40, -1, 36); t.closePath(); };
  var flLeafR = function (t) { t.moveTo(1, 28); t.bezierCurveTo(8, 18, 21, 15, 26, 18); t.bezierCurveTo(22, 28, 10, 32, 1, 28); t.closePath(); };
  var FLC = [0, -15], FLD = 18.5;
  function flPetal(i) { var a = -Math.PI / 2 + i * TAU / 5; return function (t) { ell(t, FLC[0] + Math.cos(a) * FLD, FLC[1] + Math.sin(a) * FLD, 17, 14, a); }; }
  var flCentre = function (t) { circ(t, FLC[0], FLC[1], 11.5); };
  var CENTRE = { base: '#B47A40', dark: '#8A5A2C', light: '#E2B27A' };
  OBJ.flower = {
    sil: function (t) { for (var i = 0; i < 5; i++) flPetal(i)(t); rrect(t, -3, 0, 6, 47, 3); flLeafL(t); flLeafR(t); },
    draw: function (ctx, c) {
      ctx.lineCap = 'round';
      ctx.strokeStyle = SAGE.line; ctx.lineWidth = 8.6; strokeP(ctx, P('fl.stem', flStem));
      ctx.strokeStyle = SAGE.base; ctx.lineWidth = 4.2; strokeP(ctx, P('fl.stem', flStem));
      cel(ctx, 'fl.leafL', flLeafL, SAGE, { s: 2, line: SAGE.line, lw: 2.8, hl: false });
      cel(ctx, 'fl.leafR', flLeafR, SAGE, { s: 2, line: SAGE.line, lw: 2.8, hl: false });
      // petals back-to-front so the lower ones overlap the upper ones (reads as a cupped flower)
      [0, 1, 4, 2, 3].forEach(function (i) {
        cel(ctx, 'fl.p' + i, flPetal(i), c, { s: 3.2, hl: i === 0 || i === 4 ? null : false, lw: 3.2 });
      });
      cel(ctx, 'fl.c', flCentre, CENTRE, { s: 2.4, line: '#6E4522', lw: 2.6, hl: [FLC[0] - 4, FLC[1] - 5, 3.6, 2.2, -0.6],
        inner: function (x) { [[3, -2], [-2, 4], [5, 4]].forEach(function (p) { dot(x, FLC[0] + p[0], FLC[1] + p[1], 1.5, '#7A4A22'); }); } });
    }
  };
  // ---- mushroom: a dome cap in the colour with white dots, cream stem
  var muCap = function (t) {
    t.moveTo(-47, 6);
    t.bezierCurveTo(-48, -30, -26, -47, 0, -47);
    t.bezierCurveTo(26, -47, 48, -30, 47, 6);
    t.bezierCurveTo(30, 13, -30, 13, -47, 6);
    t.closePath();
  };
  var muStem = function (t) { rpoly(t, [[-14, 4], [14, 4], [19, 46], [-19, 46]], [6, 6, 9, 9]); };
  var muGill = function (t) { ell(t, 0, 8, 38, 6, 0); };
  var STEM = { base: '#F6EBD6', dark: '#D9C4A0', light: '#FFFFFF', line: '#9C7A5A' };
  OBJ.mushroom = {
    sil: function (t) { muCap(t); muStem(t); },
    draw: function (ctx, c) {
      cel(ctx, 'mu.stem', muStem, STEM, { s: 4, line: STEM.line, lw: 3, hl: [-6, 20, 3, 9, 0] });
      oval(ctx, 0, 9, 36, 6, 0, mix(c.dark, '#3A2A20', 0.25));
      cel(ctx, 'mu.cap', muCap, c, {
        s: 5, hl: [-22, -30, 10, 5, -0.6],
        inner: function (x) {
          [[-22, -16, 8], [4, -31, 7], [25, -12, 8.5], [-2, -6, 5.5], [-38, -2, 4.5], [38, -1, 4]].forEach(function (d) {
            dot(x, d[0], d[1], d[2], '#FFFFFF');
            x.strokeStyle = rgba(c.dark, 0.35); x.lineWidth = 1.4; x.beginPath(); circ(x, d[0], d[1], d[2]); x.stroke();
          });
        }
      });
    }
  };
  // ---- leaf: a big round leaf standing on its stalk, veins in a lighter tone
  var lfBlade = function (t) {
    t.moveTo(8, -50);
    t.bezierCurveTo(20, -38, 46, -20, 36, 6);
    t.bezierCurveTo(29, 23, 12, 31, 0, 32);
    t.bezierCurveTo(-12, 31, -30, 22, -36, 4);
    t.bezierCurveTo(-44, -20, -20, -36, 8, -50);
    t.closePath();
  };
  var lfStalk = function (t) { t.moveTo(0, 30); t.quadraticCurveTo(1, 40, -1, 47); };
  OBJ.leaf = {
    sil: function (t) { lfBlade(t); rrect(t, -3, 28, 6, 19, 3); },
    draw: function (ctx, c) {
      ctx.lineCap = 'round';
      ctx.strokeStyle = lineOf(c); ctx.lineWidth = 9; strokeP(ctx, P('lf.stalk', lfStalk));
      ctx.strokeStyle = c.dark; ctx.lineWidth = 4.6; strokeP(ctx, P('lf.stalk', lfStalk));
      cel(ctx, 'lf.blade', lfBlade, c, {
        s: 5.5, hl: [-17, -26, 8, 4.5, -0.9],
        inner: function (x) {
          x.strokeStyle = rgba(mix(c.light, '#FFFFFF', 0.25), 0.95); x.lineWidth = 3.4; x.lineCap = 'round';
          x.beginPath(); x.moveTo(0, 30); x.quadraticCurveTo(0, -8, 7, -44); x.stroke();
          x.lineWidth = 2.4; x.beginPath();
          [[-12, -18, 20], [6, 22, -2], [-3, 26, -26]].forEach(function (v, j) {
            var y = [-22, -4, 14][j];
            x.moveTo(1, y); x.quadraticCurveTo(14, y - 6, 24 - j * 3, y - 14 + j * 2);
            x.moveTo(-1, y + 2); x.quadraticCurveTo(-14, y - 4, -24 + j * 3, y - 12 + j * 2);
          });
          x.stroke();
        }
      });
    }
  };
  // ---- ball: one colour, a wide light stripe + two seams
  var blBody = function (t) { circ(t, 0, 7, 40); };
  OBJ.ball = {
    sil: blBody,
    draw: function (ctx, c) {
      cel(ctx, 'bl.body', blBody, c, {
        s: 6, hl: false,
        inner: function (x) {
          x.fillStyle = mix(c.base, c.light, 0.55);
          x.beginPath(); x.moveTo(-46, 5); x.bezierCurveTo(-20, -17, 22, -19, 46, -1); x.lineTo(46, 17); x.bezierCurveTo(22, -1, -20, 1, -46, 23); x.closePath(); x.fill();
          x.strokeStyle = rgba(c.dark, 0.55); x.lineWidth = 2.2;
          x.beginPath(); x.moveTo(-46, 5); x.bezierCurveTo(-20, -17, 22, -19, 46, -1); x.moveTo(-46, 23); x.bezierCurveTo(-20, 1, 22, -1, 46, 17); x.stroke();
          oval(x, -16, -15, 9, 5, -0.6, 'rgba(255,255,255,0.85)');
          dot(x, -4, -22, 2.6, 'rgba(255,255,255,0.8)');
        }
      });
    }
  };
  // ---- rubber duck (facing right), sitting on its flat bottom
  var DKY = 9;
  var dkBody = function (t) {
    t.moveTo(-46, -8 + DKY);
    t.bezierCurveTo(-46, 14 + DKY, -36, 38 + DKY, -6, 38 + DKY);
    t.bezierCurveTo(26, 38 + DKY, 42, 26 + DKY, 42, 10 + DKY);
    t.bezierCurveTo(42, -2 + DKY, 30, -6 + DKY, 18, -4 + DKY);
    t.lineTo(-14, -2 + DKY);
    t.bezierCurveTo(-26, -2 + DKY, -36, -4 + DKY, -46, -8 + DKY);
    t.closePath();
  };
  var dkHead = function (t) { circ(t, 14, -20 + DKY, 21); };
  var dkBeak = function (t) { rpoly(t, [[30, -24 + DKY], [47, -18 + DKY], [45, -10 + DKY], [30, -10 + DKY]], [3, 5, 4, 3]); };
  var dkWing = function (t) { t.moveTo(-18, 10 + DKY); t.bezierCurveTo(-8, -2 + DKY, 12, 2 + DKY, 16, 12 + DKY); t.bezierCurveTo(6, 24 + DKY, -12, 22 + DKY, -18, 10 + DKY); t.closePath(); };
  OBJ.duck = {
    sil: function (t) { dkBody(t); dkHead(t); dkBeak(t); },
    draw: function (ctx, c) {
      cel(ctx, 'dk.body', dkBody, c, { s: 5, hl: [-24, 8 + DKY, 7, 4, -0.4] });
      cel(ctx, 'dk.wing', dkWing, c, { s: 2.4, hl: false, shade: c.dark, lw: 2.6 });
      cel(ctx, 'dk.head', dkHead, c, { s: 4, hl: [6, -32 + DKY, 6, 3.6, -0.6] });
      eye(ctx, 20, -24 + DKY, 4.6);
      oval(ctx, 26, -12 + DKY, 4.2, 2.6, 0, rgba(mix(c.light, '#FFFFFF', 0.3), 0.9));
      cel(ctx, 'dk.beak', dkBeak, { base: '#FBDDB0', dark: '#E2B57E', light: '#FFF4E0' }, { s: 1.6, line: '#9A6A3A', lw: 2.6, hl: false });
      ctx.strokeStyle = '#B9875A'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(31, -17 + DKY); ctx.lineTo(44, -15 + DKY); ctx.stroke();
    }
  };
  function objOf(th) { return OBJ[th.obj] ? th.obj : 'ball'; }

  // ================================================================= SHAPES (chunky cookies standing up)
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
    circle:   function (t) { circ(t, 0, 0, 40); },
    square:   function (t) { rrect(t, -36, -36, 72, 72, 9); },
    triangle: function (t) { rpoly(t, [[0, -44], [47, 36], [-47, 36]], [9, 8, 8]); },
    star:     function (t) { rpoly(t, starPts(0, 3, 48, 21.5), [5, 2.5, 5, 2.5, 5, 2.5, 5, 2.5, 5, 2.5]); },
    heart:    heartS,
    oval:     function (t) { ell(t, 0, -2, 27, 42, 0); },
    rect:     function (t) { rrect(t, -47, -24, 94, 48, 9); },
    diamond:  function (t) { rpoly(t, [[0, -47], [34, -2], [0, 43], [-34, -2]], [7, 6, 7, 6]); }
  };
  function shapeOf(th) { return SHP[th.shape] ? th.shape : 'circle'; }
  var DEPTH = 6;   // cookie thickness: the side shows below
  function drawShape(ctx, th, c) {
    var s = shapeOf(th), key = 'shp.' + s, b = SHP[s];
    ctx.save(); ctx.translate(0, DEPTH);
    ctx.fillStyle = mix(c.base, c.dark, 0.62); fillP(ctx, P(key, b));
    ctx.strokeStyle = lineOf(c); ctx.lineWidth = LW; strokeP(ctx, P(key, b));
    ctx.restore();
    ctx.save(); ctx.translate(0, DEPTH / 2);
    ctx.strokeStyle = mix(c.base, c.dark, 0.62); ctx.lineWidth = 6; strokeP(ctx, P(key, b));
    ctx.restore();
    var bb = bbox(key, b);
    cel(ctx, key, b, c, {
      s: 4.4, hl: false,
      inner: function (x) {
        x.save(); x.translate(-1.4, -1.4); x.strokeStyle = rgba(mix(c.light, '#FFFFFF', 0.35), 0.75); x.lineWidth = 5.4; strokeP(x, P(key, b)); x.restore();
        x.fillStyle = rgba(mix(c.light, '#FFFFFF', 0.5), 0.9);
        x.beginPath(); ell(x, bb.x + bb.w * 0.33, bb.y + bb.h * 0.3, Math.max(2.4, bb.w * 0.1), Math.max(1.6, bb.h * 0.055), -0.7); x.fill();
        sparkle(x, bb.x + bb.w * 0.52, bb.y + bb.h * 0.25, 3.4, 'rgba(255,255,255,0.9)');
      }
    });
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
  function drawDotCount(ctx, th, count) {   // counted dots get a white + gold ring (vector overlay, never cached)
    var L = dotLayoutC(th.n, !!th.numeral), n = Math.min(count, L.n);
    for (var i = 0; i < n; i++) {
      var p = L.pts[i], rr = L.rs * 1.45;
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = Math.max(2, L.rs * 0.42);
      ctx.beginPath(); circ(ctx, p[0], p[1], rr); ctx.stroke();
      ctx.strokeStyle = 'rgba(240,170,40,0.95)'; ctx.lineWidth = Math.max(1.2, L.rs * 0.22);
      ctx.beginPath(); circ(ctx, p[0], p[1], rr); ctx.stroke();
    }
  }
  // ---- tiles (text on the sign)
  function tileText(th) {
    var s = th.text != null ? String(th.text) : th.n != null ? String(th.n) : '?';
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
    var by = y + (asc - desc) / 2;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.6, px * 0.06);
    ctx.fillStyle = col; ctx.fillText(txt, x, by); if (ctx.strokeText) ctx.strokeText(txt, x, by);
  }
  function tileSign(txt) { return txt.length <= 2 ? 'disc' : 'wide'; }
  function drawTile(ctx, th) {
    var txt = tileText(th), n = txt.length, kind = tileSign(txt);
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
    var A = NH.Assets;
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
  function kindOf(th) { return KINDS.indexOf(th && th.kind) >= 0 ? th.kind : 'obj'; }
  function colOf(th, d) { return pal(th.color) || FALLBACK[d || 'red']; }
  function thingKey(t) {
    if (!t) return '?';
    return [t.kind, t.color || '', t.obj || '', t.shape || '', t.n != null ? t.n : '', t.numeral ? 'N' : '', t.animal || '', t.text != null ? t.text : '', t.big === false ? 's' : ''].join(':');
  }
  /** design-unit y of the thing's foot (the point that sits on the origin) */
  function footOf(th) {
    var k = kindOf(th);
    if (k === 'obj') { var o = OBJ[objOf(th)], b = bbox('sil.' + objOf(th), o.sil); return b.y + b.h + 1.2; }
    if (k === 'shape') { var s = shapeOf(th), bs = bbox('shp.' + s, SHP[s]); return bs.y + bs.h + DEPTH + 1.4; }
    return 50;
  }
  function headOf(th) {   // design-unit y of the thing's top
    var k = kindOf(th);
    if (k === 'obj') { var o = OBJ[objOf(th)]; return bbox('sil.' + objOf(th), o.sil).y - 1.5; }
    if (k === 'shape') { var s = shapeOf(th); return bbox('shp.' + s, SHP[s]).y - 1.5; }
    if (k === 'dots') return th.numeral ? -53 : -52;
    if (k === 'tile') return tileSign(tileText(th)) === 'disc' ? -52 : -38;
    return -50;
  }
  /** many dots (≥ 7, no numeral) get a bigger sign so every dot stays countable on a phone (visual QA P2-3) */
  function bigDots(th) { return th && kindOf(th) === 'dots' && !th.numeral && num(th.n, 0) >= 7 ? 1.28 : 1; }
  function thingTop(thing, size) {
    if (!thing) return 0;
    var sc = (thing.big === false ? SMALL : 1) * bigDots(thing);
    return (footOf(thing) - headOf(thing)) * num(size, 90) * sc / 100;
  }
  function thingBody(ctx, th, img) {
    var k = kindOf(th);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (k === 'obj') OBJ[objOf(th)].draw(ctx, colOf(th));
    else if (k === 'shape') drawShape(ctx, th, colOf(th, 'blue'));
    else if (k === 'dots') drawDots(ctx, th);
    else if (k === 'tile') drawTile(ctx, th);
    else drawAnimal(ctx, th, img);
  }
  var BOXU = 132;   // sprite box in design units (100 + padding for petals / outlines)
  function drawThing(ctx, thing, size, opt) {
    if (!ctx || !thing) return;
    size = num(size, 90); if (!(size > 0)) return;
    var o = opt || {}, sc = (thing.big === false ? SMALL : 1) * bigDots(thing), box = size * sc, s = box / 100;
    var alpha = o.alpha == null ? 1 : clamp01(num(o.alpha, 1)); if (alpha <= 0.001) return;
    var glow = clamp01(o.glow), wig = Math.max(-1, Math.min(1, num(o.wiggle, 0))), rot = num(o.rot, 0), count = Math.round(num(o.count, -1));
    var k = kindOf(thing), foot = footOf(thing);
    ctx.save(); ctx.globalAlpha *= alpha;
    if (o.shadow !== false) {   // contact shadow on the stone (before any rotation: it stays on the stone)
      var sw = k === 'dots' || k === 'tile' ? 0.2 : 0.34;
      ctx.fillStyle = 'rgba(52,44,36,0.30)'; ctx.beginPath(); ell(ctx, 0, 0, box * sw, box * 0.075, 0); ctx.fill();
      ctx.fillStyle = 'rgba(52,44,36,0.22)'; ctx.beginPath(); ell(ctx, 0, 0, box * sw * 0.6, box * 0.045, 0); ctx.fill();
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
    var img = k === 'animal' ? assetImg('animals/' + animalOf(thing), AW * dev) : null;
    var done = false;
    if (canDOM() && !o.direct) {
      var key = 'th:' + thingKey(thing) + '|' + (k === 'animal' ? (img ? 'i' : 'p') : '');
      done = boxSprite(ctx, key, BOXU, dev, function (g) { thingBody(g, thing, img); }, 'thing');
    }
    if (!done) thingBody(ctx, thing, img);
    if (k === 'dots' && count > 0) drawDotCount(ctx, thing, count);
    ctx.restore();
  }

  // ================================================================= FRUITS (centre origin, 100 box)
  var FR = {};
  var frStem = function (t) { t.moveTo(0, -28); t.quadraticCurveTo(1, -40, 6, -47); };
  var frLeaf = function (t) { t.moveTo(4, -38); t.bezierCurveTo(10, -50, 26, -52, 32, -46); t.bezierCurveTo(26, -36, 12, -32, 4, -38); t.closePath(); };
  function stemLeaf(ctx) {
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#5A3E26'; ctx.lineWidth = 7.4; strokeP(ctx, P('fr.stem', frStem));
    ctx.strokeStyle = '#8A6440'; ctx.lineWidth = 3.6; strokeP(ctx, P('fr.stem', frStem));
    cel(ctx, 'fr.leaf', frLeaf, SAGE, { s: 2, line: SAGE.line, lw: 2.6, hl: false,
      inner: function (x) { x.strokeStyle = rgba(SAGE.light, 0.9); x.lineWidth = 1.6; x.beginPath(); x.moveTo(7, -38); x.quadraticCurveTo(18, -44, 28, -46); x.stroke(); } });
  }
  var apBody = function (t) {
    t.moveTo(0, -27);
    t.bezierCurveTo(14, -40, 46, -36, 44, -2);
    t.bezierCurveTo(42, 30, 20, 44, 8, 40);
    t.bezierCurveTo(4, 38, -4, 38, -8, 40);
    t.bezierCurveTo(-20, 44, -42, 30, -44, -2);
    t.bezierCurveTo(-46, -36, -14, -40, 0, -27);
    t.closePath();
  };
  var APPLE = { base: '#E77A6E', dark: '#B9493F', light: '#F7B9AE' };
  FR.apple = function (ctx) {
    cel(ctx, 'fr.apple', apBody, APPLE, { s: 6, line: '#97392F', lw: LW, hl: [-22, -16, 8, 12, 0.5] });
    stemLeaf(ctx);
  };
  var peBody = function (t) {
    t.moveTo(0, -36);
    t.bezierCurveTo(11, -36, 15, -26, 16, -16);
    t.bezierCurveTo(19, -4, 38, 4, 37, 22);
    t.bezierCurveTo(36, 40, 18, 46, 0, 46);
    t.bezierCurveTo(-18, 46, -36, 40, -37, 22);
    t.bezierCurveTo(-38, 4, -19, -4, -16, -16);
    t.bezierCurveTo(-15, -26, -11, -36, 0, -36);
    t.closePath();
  };
  var PEAR = { base: '#CFD77A', dark: '#9CA548', light: '#EEF2BE' };
  FR.pear = function (ctx) {
    ctx.save(); ctx.translate(0, -2);
    cel(ctx, 'fr.pear', peBody, PEAR, { s: 6, line: '#6E7530', lw: LW, hl: [-18, 14, 7, 12, 0.3],
      inner: function (x) { [[12, 20], [-6, 30], [20, 4], [-20, 22]].forEach(function (p) { dot(x, p[0], p[1], 1.4, 'rgba(110,117,48,0.5)'); }); } });
    ctx.save(); ctx.translate(0, 8); stemLeaf(ctx); ctx.restore();
    ctx.restore();
  };
  var swBody = function (t) {
    t.moveTo(0, 46);
    t.bezierCurveTo(-20, 38, -41, 12, -39, -10);
    t.bezierCurveTo(-37, -28, -18, -32, 0, -28);
    t.bezierCurveTo(18, -32, 37, -28, 39, -10);
    t.bezierCurveTo(41, 12, 20, 38, 0, 46);
    t.closePath();
  };
  var swCalyx = function (t) {
    var pts = [];
    for (var i = 0; i < 10; i++) { var a = Math.PI + i * Math.PI / 9, r = i % 2 ? 9 : 24; pts.push([Math.cos(a) * r * 1.15, -30 - Math.sin(a) * r * 0.55 + (i % 2 ? 0 : 6)]); }
    rpoly(t, pts, 2.5);
  };
  var STRAW = { base: '#E8706F', dark: '#B5423F', light: '#F7B2AE' };
  FR.strawberry = function (ctx) {
    cel(ctx, 'fr.straw', swBody, STRAW, { s: 6, line: '#943533', lw: LW, hl: [-20, -10, 6, 10, 0.4],
      inner: function (x) {
        for (var r = 0; r < 5; r++) for (var i = 0; i < 5 - (r > 2 ? r - 2 : 0); i++) {
          var cnt = 5 - (r > 2 ? r - 2 : 0), sx = (i - (cnt - 1) / 2) * 13 + (r % 2 ? 6 : 0), sy = -16 + r * 12;
          if (Math.abs(sx) > 34 - r * 4) continue;
          oval(x, sx, sy, 2.2, 3.4, 0.2, '#FBE7B0');
          x.strokeStyle = 'rgba(148,53,51,0.5)'; x.lineWidth = 0.8; x.beginPath(); ell(x, sx, sy, 2.2, 3.4, 0.2); x.stroke();
        }
      } });
    cel(ctx, 'fr.calyx', swCalyx, { base: '#7FA86A', dark: '#5E8A4E', light: '#B8D6A2' }, { s: 2, line: '#4A6E3E', lw: 2.6, hl: false });
    ctx.lineCap = 'round'; ctx.strokeStyle = '#4A6E3E'; ctx.lineWidth = 6.4; ctx.beginPath(); ctx.moveTo(0, -32); ctx.quadraticCurveTo(1, -40, 5, -45); ctx.stroke();
    ctx.strokeStyle = '#7FA86A'; ctx.lineWidth = 3; ctx.stroke();
  };
  var fmCap = function (t) {
    t.moveTo(-45, 4); t.bezierCurveTo(-46, -30, -24, -44, 0, -44); t.bezierCurveTo(24, -44, 46, -30, 45, 4); t.bezierCurveTo(28, 12, -28, 12, -45, 4); t.closePath();
  };
  var fmStem = function (t) { rpoly(t, [[-14, 2], [14, 2], [18, 42], [-18, 42]], [5, 5, 10, 10]); };
  var FMCAP = { base: '#F2E6D0', dark: '#CDB894', light: '#FFFFFF' };
  FR.mushroom = function (ctx) {
    cel(ctx, 'fr.mstem', fmStem, { base: '#FBF3E4', dark: '#DCCBAE', light: '#FFFFFF' }, { s: 4, line: '#8E6E50', lw: 3, hl: false });
    oval(ctx, 0, 7, 34, 5.5, 0, '#C9B08A');
    cel(ctx, 'fr.mcap', fmCap, FMCAP, { s: 6, line: '#8E6E50', lw: LW, hl: [-20, -28, 9, 4.5, -0.5],
      inner: function (x) { [[-20, -14, 8, 5], [8, -28, 7, 4.5], [26, -10, 6, 4], [-2, -4, 5, 3.4]].forEach(function (d) { oval(x, d[0], d[1], d[2], d[3], -0.2, '#B89A78'); }); } });
  };
  var acNut = function (t) { t.moveTo(-31, -6); t.bezierCurveTo(-32, 22, -14, 42, 0, 48); t.bezierCurveTo(14, 42, 32, 22, 31, -6); t.closePath(); };
  var acCap = function (t) { t.moveTo(-38, -2); t.bezierCurveTo(-40, -26, -22, -34, 0, -34); t.bezierCurveTo(22, -34, 40, -26, 38, -2); t.bezierCurveTo(20, 4, -20, 4, -38, -2); t.closePath(); };
  var ACORN = { base: '#B98A55', dark: '#8A5E30', light: '#E2C094' }, ACAP = { base: '#8C6A44', dark: '#6A4C2C', light: '#B8956A' };
  FR.acorn = function (ctx) {
    cel(ctx, 'fr.anut', acNut, ACORN, { s: 6, line: '#6A4524', lw: LW, hl: [-14, 10, 5, 12, 0.2] });
    dot(ctx, 0, 45, 2.6, '#6A4524');
    cel(ctx, 'fr.acap', acCap, ACAP, { s: 3.5, line: '#4E3420', lw: LW, hl: false,
      inner: function (x) {
        x.strokeStyle = 'rgba(78,52,32,0.55)'; x.lineWidth = 1.6; x.beginPath();
        for (var i = -40; i <= 40; i += 9) { x.moveTo(i, -36); x.lineTo(i + 22, 4); x.moveTo(i, -36); x.lineTo(i - 22, 4); }
        x.stroke();
      } });
    ctx.lineCap = 'round'; ctx.strokeStyle = '#4E3420'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(0, -33); ctx.quadraticCurveTo(2, -42, 7, -46); ctx.stroke();
    ctx.strokeStyle = '#8C6A44'; ctx.lineWidth = 3.4; ctx.stroke();
  };
  function fruitOf(k) { return FR[k] ? k : 'apple'; }
  function drawFruit(ctx, kind, size, opt) {
    if (!ctx) return;
    size = num(size, 60); if (!(size > 0)) return;
    var o = opt || {}, a = o.alpha == null ? 1 : clamp01(num(o.alpha, 1)); if (a <= 0.001) return;
    var f = fruitOf(kind), glow = clamp01(o.glow), s = size / 100;
    ctx.save(); ctx.globalAlpha *= a; ctx.rotate(num(o.rot, 0)); ctx.scale(s, s);
    if (glow > 0.01) {
      var gr = ctx.createRadialGradient(0, 0, 14, 0, 0, 70);
      gr.addColorStop(0, 'rgba(255,236,150,' + (0.8 * glow).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(255,214,100,0)');
      ctx.fillStyle = gr; ctx.beginPath(); circ(ctx, 0, 0, 70); ctx.fill();
    }
    var done = false;
    if (canDOM() && !o.direct) done = boxSprite(ctx, 'fr:' + f, 112, devScale(ctx), function (g) { FR[f](g); }, 'fruit');
    if (!done) { ctx.lineJoin = 'round'; ctx.lineCap = 'round'; FR[f](ctx); }
    ctx.restore();
  }

  // ================================================================= STONES
  // Design units: S = 100. Top face ≈ 100 × 36 centred on the origin; the waterline plane 22 below (dip moves it up by ≤ 10);
  // the body goes on under the water to 34 below (seen faintly through the water).
  var DEEP = 34, geoC = {};
  function variant(seed) {
    var s = num(seed, 0);
    if (s % 1 !== 0) s = Math.floor(Math.abs(s) * 7919);
    return Math.abs(Math.floor(s)) % NV;
  }
  function geo(v) {
    if (geoC[v]) return geoC[v];
    var r = function (i) { return hash(v * 13 + i + 1); };
    var sx = 0.95 + 0.05 * r(1), sy = 0.9 + 0.18 * r(2), a2 = 0.015 + 0.03 * r(3), p2 = r(4) * TAU, a3 = 0.01 + 0.022 * r(5), p3 = r(6) * TAU;
    var N = 48, top = [];
    for (var i = 0; i <= N; i++) {
      var th = i / N * TAU, k = 1 + a2 * Math.cos(2 * th + p2) + a3 * Math.cos(3 * th + p3);
      top.push([50 * sx * k * Math.cos(th), 18 * sy * k * Math.sin(th)]);
    }
    var bot = [];
    for (var j = 0; j <= N / 2; j++) bot.push([top[j][0] * 0.8, top[j][1] * 0.86 + DEEP]);
    var xr = top[0][0], xl = top[N / 2][0];
    var g = {
      v: v, sx: sx, sy: sy, top: top, bot: bot, xr: xr, xl: xl, cx: (xr + xl) / 2, hw: (xr - xl) / 2, ry: 18 * sy,
      specks: [], crack: [r(20) * 30 - 15, r(21)]
    };
    for (var q = 0; q < 9; q++) {
      var ang = r(30 + q) * TAU, rr = 0.25 + 0.6 * Math.sqrt(r(40 + q));
      g.specks.push([Math.cos(ang) * 44 * sx * rr, Math.sin(ang) * 15 * sy * rr, 0.9 + 1.4 * r(50 + q), q % 3 === 0]);
    }
    // the outer silhouette: back half of the top, the rounded right side, the bottom (front), the left side
    g.body = function (t) {
      var T = g.top, B = g.bot, n = N / 2;
      t.moveTo(T[n][0], T[n][1]);
      for (var a = n + 1; a <= N; a++) t.lineTo(T[a][0], T[a][1]);
      t.bezierCurveTo(xr * 1.035, 5, B[0][0] * 1.27, DEEP - 9, B[0][0], B[0][1]);
      for (var b = 1; b <= n; b++) t.lineTo(B[b][0], B[b][1]);
      t.bezierCurveTo(B[n][0] * 1.27, DEEP - 9, xl * 1.035, 5, T[n][0], T[n][1]);
      t.closePath();
    };
    g.topf = function (t) { poly(t, g.top.slice(0, N)); };
    g.front = function (t) { var T = g.top; t.moveTo(T[0][0], T[0][1]); for (var a = 1; a <= N / 2; a++) t.lineTo(T[a][0], T[a][1]); };
    return (geoC[v] = g);
  }
  /** waterline ellipse at plane depth h */
  function wl(g, h) { var f = 1 + 0.06 * Math.sin(Math.PI * h / DEEP) - 0.12 * (h / DEEP); return { cx: g.cx, y: h, rx: g.hw * f + 0.6, ry: g.ry * f }; }
  function dryClip(t, w) { t.moveTo(-70, -60); t.lineTo(70, -60); t.lineTo(70, w.y); t.lineTo(w.cx + w.rx, w.y); t.ellipse(w.cx, w.y, w.rx, w.ry, 0, 0, Math.PI, false); t.lineTo(-70, w.y); t.closePath(); }
  function wetClip(t, w) { t.moveTo(70, w.y); t.lineTo(70, 90); t.lineTo(-70, 90); t.lineTo(-70, w.y); t.lineTo(w.cx - w.rx, w.y); t.ellipse(w.cx, w.y, w.rx, w.ry, 0, Math.PI, 0, true); t.closePath(); }
  function bandClip(t, w, b) {
    t.moveTo(w.cx + w.rx, w.y - b); t.ellipse(w.cx, w.y - b, w.rx, w.ry, 0, 0, Math.PI, false);
    t.lineTo(w.cx - w.rx, w.y); t.ellipse(w.cx, w.y, w.rx, w.ry, 0, Math.PI, 0, true); t.closePath();
  }
  /** the full stone body (vector) in palette C, with an optional snow cap q (0..1) */
  function stoneBody(ctx, g, C, q) {
    var v = g.v, body = P('st.body.' + v, g.body), topf = P('st.top.' + v, g.topf), front = P('st.front.' + v, g.front);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // side: lighter left, darker right, a deeper lower-right crescent
    var gs = ctx.createLinearGradient(-50, 0, 50, 0);
    gs.addColorStop(0, mix(C.side, C.top, 0.22)); gs.addColorStop(0.55, C.side); gs.addColorStop(1, C.sideDark);
    ctx.fillStyle = gs; fillP(ctx, body);
    ctx.save(); clipP(ctx, body);
    ctx.fillStyle = rgba(C.sideDark, 0.55); ctx.beginPath(); ell(ctx, 30, 40, 40, 20, -0.15); ctx.fill();
    ctx.fillStyle = rgba(mix(C.side, '#FFFFFF', 0.3), 0.35); ctx.beginPath(); ell(ctx, -36, 14, 9, 5, 0.5); ctx.fill();
    var gv = ctx.createLinearGradient(0, 14, 0, 46);
    gv.addColorStop(0, rgba(C.sideDark, 0)); gv.addColorStop(1, rgba(C.sideDark, 0.75));
    ctx.fillStyle = gv; ctx.fillRect(-70, 14, 140, 40);
    // rounded shoulder: a soft light band just under the top's front edge
    ctx.save(); ctx.translate(0, 4.2); ctx.strokeStyle = rgba(mix(C.side, '#FFFFFF', 0.38), 0.45); ctx.lineWidth = 5; strokeP(ctx, front); ctx.restore();
    // a couple of pits on the side
    dot(ctx, -22 + g.crack[1] * 10, 27, 1.4, rgba(C.line, 0.4)); dot(ctx, 18 - g.crack[1] * 8, 24, 1.2, rgba(C.line, 0.35)); dot(ctx, g.crack[0], 30, 1, rgba(C.line, 0.3));
    ctx.restore();
    // top face
    ctx.fillStyle = C.top; fillP(ctx, topf);
    ctx.save(); clipP(ctx, topf);
    ctx.fillStyle = C.shade; ctx.fillRect(-60, -30, 120, 60);
    ctx.translate(-2.5, -3); ctx.fillStyle = C.top; fillP(ctx, topf); ctx.translate(2.5, 3);
    ctx.fillStyle = rgba(C.hl, 0.95); ctx.beginPath(); ell(ctx, -16, -5, 22, 6.5, -0.08); ctx.fill();
    ctx.fillStyle = rgba(mix(C.hl, '#FFFFFF', 0.5), 0.8); ctx.beginPath(); ell(ctx, -22, -7, 8, 2.4, -0.08); ctx.fill();
    g.specks.forEach(function (p) { dot(ctx, p[0], p[1], p[2] * 0.8, p[3] ? rgba(C.hl, 0.9) : rgba(C.speck, 0.8)); });
    ctx.restore();
    // rounded front edge: a light bevel just inside, then a soft seam line
    ctx.save(); ctx.translate(0, -2.2); ctx.strokeStyle = rgba(mix(C.top, '#FFFFFF', 0.35), 0.9); ctx.lineWidth = 2.2; strokeP(ctx, front); ctx.restore();
    ctx.strokeStyle = rgba(mix(C.line, C.side, 0.3), 0.85); ctx.lineWidth = 1.7; strokeP(ctx, front);
    if (q > 0) snowCap(ctx, g, q);
    ctx.strokeStyle = C.line; ctx.lineWidth = 2.7; strokeP(ctx, body);
  }
  function snowCap(ctx, g, q) {
    var v = g.v, N = 48, k = 0.84 + 0.15 * q, lift = 2 + 3 * q;
    var cap = P('st.snow.' + v + '.' + Math.round(q * 4), function (t) {
      var pts = [];
      for (var i = 0; i < N; i++) {
        var p = g.top[i], th = i / N * TAU, drip = Math.sin(th) > 0 ? q * (1.5 + 2.6 * Math.max(0, Math.sin(th * 7 + v))) * Math.sin(th) : 0;
        var sc = 1 + 0.025 * Math.cos(th * 9 + v); pts.push([p[0] * k * sc, p[1] * k * sc - lift * (Math.sin(th) < 0 ? 1 : 0.35) + drip]);
      }
      smooth(t, pts);
    });
    ctx.save(); ctx.translate(0, 2 + 2.4 * q); ctx.fillStyle = SNOWC.shade; fillP(ctx, cap); ctx.strokeStyle = SNOWC.line; ctx.lineWidth = 1.7; strokeP(ctx, cap); ctx.restore();
    ctx.fillStyle = SNOWC.base; fillP(ctx, cap);
    ctx.save(); clipP(ctx, cap);
    ctx.fillStyle = 'rgba(201,212,226,0.55)'; ctx.beginPath(); ell(ctx, 14, 6, 34, 9, 0); ctx.fill();
    ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ell(ctx, -14, -5, 18, 4.5, 0); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = SNOWC.line; ctx.lineWidth = 1.7; strokeP(ctx, cap);
    sparkle(ctx, -24, -3, 2.6, 'rgba(255,255,255,0.95)'); sparkle(ctx, 20, -6, 2, 'rgba(255,255,255,0.95)');
  }
  var STW = 128, STH = 104, STX = 64, STY = 36;   // sprite box (design units) and the origin inside it
  function drawBody(ctx, g, gold, q) {
    var C = gold ? GOLD : STONE;
    if (canDOM()) {
      var dev = devScale(ctx), devPx = bucket(100 * dev, 12, 1400), u = devPx / 100;
      var key = 'st:' + g.v + ':' + (gold ? 'g' : 'p') + ':' + Math.round(q * 4) + '|' + devPx.toFixed(1), c = sget(key);
      if (c) stats.stoneHit++;
      else {
        try {
          c = makeCanvas(STW * u, STH * u);
          var x = c.getContext('2d');
          if (!x) c = null; else { x.setTransform(u, 0, 0, u, STX * u, STY * u); stoneBody(x, g, C, q); stats.stoneBuilt++; sput(key, c); }
        } catch (e) { c = null; }
      }
      if (c) { ctx.drawImage(c, -STX, -STY, STW, STH); return; }
    }
    stoneBody(ctx, g, C, q);
  }
  function drawStone(ctx, S, opt) {
    if (!ctx) return;
    S = num(S, 0); if (!(S > 0)) return;
    var o = opt || {}, alpha = o.alpha == null ? 1 : clamp01(num(o.alpha, 1)); if (alpha <= 0.001) return;
    var g = geo(variant(o.seed)), tilt = Math.max(-0.6, Math.min(0.6, num(o.tilt, 0))), dip = clamp01(o.dip), gold = clamp01(o.gold),
      glow = clamp01(o.glow), snow = Math.round(clamp01(o.snow) * 4) / 4, wet = clamp01(o.wet), act = clamp01(o.active), t = num(o.t, 0);
    var w = wl(g, 22 - 10 * dip), k = S / 100;
    ctx.save(); ctx.globalAlpha *= alpha;
    if (tilt) ctx.rotate(tilt);
    ctx.scale(k, k);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // on the water: soft shadow, the active ring, the golden halo
    ctx.fillStyle = rgba(WATER.shadow, 0.24); ctx.beginPath(); ell(ctx, w.cx + 3, w.y + 4, w.rx * 1.14, w.ry * 1.22, 0); ctx.fill();
    if (act > 0.01) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.55 * act).toFixed(3) + ')'; ctx.lineWidth = 7;
      ctx.beginPath(); ell(ctx, w.cx, w.y, w.rx * 1.3, w.ry * 1.42, 0); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.95 * act).toFixed(3) + ')'; ctx.lineWidth = 3.4;
      if (ctx.setLineDash) { ctx.setLineDash([9, 7]); ctx.lineDashOffset = -t * 14; }
      ctx.beginPath(); ell(ctx, w.cx, w.y, w.rx * 1.3, w.ry * 1.42, 0); ctx.stroke();
      if (ctx.setLineDash) ctx.setLineDash([]);
      ctx.restore();
    }
    if (gold > 0.01) {
      var gh = ctx.createRadialGradient(0, 10, 20, 0, 10, 82);
      gh.addColorStop(0, 'rgba(255,226,130,' + (0.55 * gold).toFixed(3) + ')'); gh.addColorStop(1, 'rgba(255,214,100,0)');
      ctx.fillStyle = gh; ctx.beginPath(); ell(ctx, 0, 10, 82, 56, 0); ctx.fill();
    }
    // under the water: the body seen faintly
    ctx.save(); ctx.beginPath(); wetClip(ctx, w); ctx.clip();
    ctx.globalAlpha *= 0.36; drawBody(ctx, g, gold > 0.5, 0);
    ctx.restore();
    // above the water
    ctx.save(); ctx.beginPath(); dryClip(ctx, w); ctx.clip();
    drawBody(ctx, g, false, snow);
    if (gold > 0.01) { ctx.globalAlpha *= gold; drawBody(ctx, g, true, snow); }
    ctx.restore();
    // the wet darker band at the waterline (taller when wet)
    var bh = 5 + 3 * wet, body = P('st.body.' + g.v, g.body);
    ctx.save(); clipP(ctx, body); ctx.beginPath(); bandClip(ctx, w, bh); ctx.clip();
    ctx.fillStyle = 'rgba(58,62,58,' + (0.3 + 0.12 * wet).toFixed(3) + ')'; ctx.fillRect(-70, w.y - bh - 20, 140, bh + 40);
    ctx.restore();
    if (wet > 0.01 && snow < 0.01) {   // splashed: darker, glossy top
      ctx.save(); clipP(ctx, P('st.top.' + g.v, g.topf));
      ctx.fillStyle = 'rgba(70,72,70,' + (0.2 * wet).toFixed(3) + ')'; ctx.fillRect(-60, -30, 120, 60);
      ctx.fillStyle = 'rgba(255,255,255,' + (0.55 * wet).toFixed(3) + ')';
      ctx.beginPath(); ell(ctx, -12, -6, 16, 2.6, -0.1); ctx.fill(); ctx.beginPath(); ell(ctx, 18, 4, 7, 1.6, -0.1); ctx.fill();
      ctx.restore();
    }
    // the waterline: a light rim hugging the front of the stone + two foam dots
    ctx.strokeStyle = rgba(WATER.light, 0.9); ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.ellipse(w.cx, w.y, w.rx + 1.5, w.ry + 1.8, 0, 0.12, Math.PI - 0.12, false); ctx.stroke();
    ctx.strokeStyle = rgba(WATER.light, 0.45); ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(w.cx, w.y + 1, w.rx + 6, w.ry + 6, 0, 0.35, Math.PI - 0.35, false); ctx.stroke();
    dot(ctx, w.cx - w.rx * 0.62, w.y + w.ry * 0.86, 1.6, 'rgba(255,255,255,0.8)'); dot(ctx, w.cx + w.rx * 0.4, w.y + w.ry * 0.98, 1.3, 'rgba(255,255,255,0.75)');
    if (glow > 0.01) {   // hint / active: a warm outline around the dry stone
      ctx.save(); ctx.beginPath(); dryClip(ctx, w); ctx.clip();
      ctx.strokeStyle = 'rgba(255,200,70,' + (0.55 * glow).toFixed(3) + ')'; ctx.lineWidth = 11; strokeP(ctx, body);
      ctx.strokeStyle = 'rgba(255,224,120,' + (0.95 * glow).toFixed(3) + ')'; ctx.lineWidth = 5; strokeP(ctx, body);
      ctx.strokeStyle = 'rgba(255,252,230,' + (0.9 * glow).toFixed(3) + ')'; ctx.lineWidth = 1.8; strokeP(ctx, body);
      ctx.restore();
    }
    if (gold > 0.6) {
      var ga = (gold - 0.6) / 0.4;
      sparkle(ctx, -34, -10, 5 * ga, 'rgba(255,255,255,0.95)'); sparkle(ctx, 38, 2, 3.6 * ga, 'rgba(255,250,220,0.95)');
    }
    ctx.restore();
  }

  // ================================================================= WATER BITS
  function drawRipple(ctx, x, y, r, a, flat) {
    if (!ctx) return;
    a = a == null ? 1 : clamp01(a); r = num(r, 20); if (a <= 0.001 || !(r > 0)) return;
    x = num(x, 0); y = num(y, 0); var f = Math.max(0.1, Math.min(1, num(flat, 0.38)));
    ctx.save(); ctx.globalAlpha *= a;
    var lw = Math.max(1.4, Math.min(4, r * 0.06));
    ctx.strokeStyle = rgba(WATER.shadow, 0.28); ctx.lineWidth = lw;
    ctx.beginPath(); ell(ctx, x, y + lw * 0.7, r, r * f, 0); ctx.stroke();
    ctx.strokeStyle = rgba(WATER.light, 0.95); ctx.lineWidth = lw;
    ctx.beginPath(); ell(ctx, x, y, r, r * f, 0); ctx.stroke();
    ctx.strokeStyle = rgba(WATER.light, 0.45); ctx.lineWidth = lw * 0.7;
    ctx.beginPath(); ell(ctx, x, y, r * 0.72, r * f * 0.72, 0); ctx.stroke();
    ctx.restore();
  }
  function drawDrop(ctx, x, y, r, a) {
    if (!ctx) return;
    a = a == null ? 1 : clamp01(a); r = num(r, 4); if (a <= 0.001 || !(r > 0)) return;
    x = num(x, 0); y = num(y, 0);
    ctx.save(); ctx.globalAlpha *= a;
    var drop = function (t) {
      t.moveTo(x, y - 1.75 * r);
      t.bezierCurveTo(x + 0.35 * r, y - 1.1 * r, x + r, y - 0.6 * r, x + r, y);
      t.arc(x, y, r, 0, Math.PI, false);
      t.bezierCurveTo(x - r, y - 0.6 * r, x - 0.35 * r, y - 1.1 * r, x, y - 1.75 * r);
      t.closePath();
    };
    ctx.fillStyle = 'rgba(226,245,242,0.85)'; ctx.beginPath(); drop(ctx); ctx.fill();
    ctx.strokeStyle = 'rgba(58,118,124,0.8)'; ctx.lineWidth = Math.max(0.8, r * 0.24); ctx.beginPath(); drop(ctx); ctx.stroke();
    ctx.fillStyle = 'rgba(127,184,180,0.5)'; ctx.beginPath(); ctx.arc(x, y, r * 0.75, 0.2, Math.PI - 0.2, false); ctx.fill();
    dot(ctx, x - r * 0.36, y - r * 0.3, Math.max(0.6, r * 0.3), '#FFFFFF');
    ctx.restore();
  }
  function drawLilyPad(ctx, r, rot, opt) {
    if (!ctx) return;
    r = num(r, 40); if (!(r > 0)) return;
    var o = opt || {}, f = Math.max(0.2, Math.min(1, num(o.flat, 0.45))), a = o.alpha == null ? 1 : clamp01(num(o.alpha, 1)), R = num(rot, 0);
    if (a <= 0.001) return;
    var cr = Math.cos(R), sr = Math.sin(R), N = 40, notch = 0.32;
    var pt = function (ang, rr) { var x = Math.cos(ang) * rr, y = Math.sin(ang) * rr; return [x * cr - y * sr, (x * sr + y * cr) * f]; };
    var pad = function (t, dy) {
      var c0 = pt(0, 0); t.moveTo(c0[0], c0[1] + dy);
      for (var i = 0; i <= N; i++) { var ang = notch + (TAU - 2 * notch) * i / N, wob = 1 + 0.025 * Math.sin(ang * 5); var p = pt(ang, r * wob); t.lineTo(p[0], p[1] + dy); }
      t.closePath();
    };
    ctx.save(); ctx.globalAlpha *= a; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.fillStyle = rgba(WATER.shadow, 0.25); ctx.beginPath(); ell(ctx, 2, r * f * 0.35, r * 1.05, r * f * 1.05, 0); ctx.fill();
    ctx.fillStyle = '#5F8A50'; ctx.beginPath(); pad(ctx, Math.max(1.5, r * 0.07)); ctx.fill();
    ctx.fillStyle = '#7FA86A'; ctx.beginPath(); pad(ctx, 0); ctx.fill();
    ctx.save(); ctx.beginPath(); pad(ctx, 0); ctx.clip();
    var h = pt(Math.PI * 1.25, r * 0.45);
    ctx.fillStyle = 'rgba(184,214,162,0.7)'; ctx.beginPath(); ell(ctx, h[0], h[1], r * 0.32, r * 0.32 * f, 0); ctx.fill();
    ctx.strokeStyle = 'rgba(184,214,162,0.85)'; ctx.lineWidth = Math.max(1, r * 0.045); ctx.beginPath();
    for (var i = 0; i < 7; i++) { var ang = notch + 0.35 + i * (TAU - 2 * notch - 0.7) / 6, p = pt(ang, r * 0.86); ctx.moveTo(0, 0); ctx.lineTo(p[0], p[1]); }
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = '#557A47'; ctx.lineWidth = Math.max(1.2, r * 0.06); ctx.beginPath(); pad(ctx, 0); ctx.stroke();
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
      var box = size * 0.82, sc = t.big === false ? SMALL : 1, h = thingTop(t, box);
      ctx.translate(0, h / 2 + (t.big === false ? box * 0.2 * sc : 0));
      drawThing(ctx, t, box, { shadow: false });
    } else if (k === 'letter') {
      ctx.translate(0, size * 0.41); drawThing(ctx, { kind: 'tile', text: t.text }, size * 0.82, { shadow: false });
    } else if (k === 'fruit') {
      drawFruit(ctx, t.fruit || t.obj, size * 0.8, {});
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
      ctx.scale(s2, s2);
      var blob = function (x) {
        x.moveTo(40, 0);
        for (var j = 1; j <= 9; j++) { var a = j * TAU / 9, am = a - TAU / 18, ro = j % 2 ? 43 : 38; x.quadraticCurveTo(Math.cos(am) * 47, Math.sin(am) * 45, Math.cos(a) * ro, Math.sin(a) * ro * 0.95); }
        x.closePath();
      };
      cel(ctx, 'ic.blob', blob, c, { s: 5, hl: [-16, -18, 10, 6, -0.6] });
      dot(ctx, 30, 35, 6, c.base); ctx.strokeStyle = lineOf(c); ctx.lineWidth = 2.4; ctx.beginPath(); circ(ctx, 30, 35, 6); ctx.stroke();
      dot(ctx, 4, -24, 3.5, 'rgba(255,255,255,0.7)');
    } else if (k === 'home') {
      drawHomeBadge(ctx, t.home, size * 0.46, {});
    } else if (k === 'size') {
      var inner = t.thing && KINDS.indexOf(t.thing.kind) >= 0 ? Object.assign({}, t.thing) : { kind: 'obj', obj: 'ball', color: t.color || 'red' };
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
    // cuff: Nim's mustard scarf
    ctx.fillStyle = '#E3B65A'; ctx.strokeStyle = '#A9812E'; ctx.lineWidth = s * 0.03;
    ctx.beginPath(); rrect(ctx, -s * 0.25, s * 0.76, s * 0.46, s * 0.14, s * 0.06); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(169,129,46,0.7)';
    [-0.15, -0.03, 0.09].forEach(function (dx) { ctx.beginPath(); circ(ctx, s * dx, s * 0.83, s * 0.018); ctx.fill(); });
    ctx.restore();
  }

  function clearCache() { pcache = {}; pN = 0; bcache = {}; lcache = {}; scache = {}; sN = 0; geoC = {}; lineMemo = {}; }

  NH.StoneArt = {
    drawStone: drawStone, drawRipple: drawRipple, drawDrop: drawDrop, drawThing: drawThing, drawFruit: drawFruit,
    drawHomeBadge: drawHomeBadge, drawSnowflake: drawSnowflake, drawIcon: drawIcon, drawHintHand: drawHintHand, drawLilyPad: drawLilyPad,
    dotLayout: function (n, numeral) { return dotLayout(n, numeral); }, thingTop: thingTop, variant: variant,
    pal: function (n) { return pal(n) || null; }, lineOf: function (c) { var p = typeof c === 'string' ? pal(c) : c; return p ? lineOf(p) : null; },
    contrast: contrast, PALETTE: FALLBACK, STONE: STONE, GOLD: GOLD, WATER: WATER, SIGN: SIGN, FONT: FONT, INK: INK,
    OBJS: OBJS, SHAPES: SHAPES, FRUITS: FRUITS, ANIMALS: ANIMALS, HOMES: HOMES, KINDS: KINDS, SMALL: SMALL,
    thingKey: thingKey, clearCache: clearCache, stats: stats
  };
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
