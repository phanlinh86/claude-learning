/* Mimi's Splash Rocket — DK.MatArt (character artist B), DESIGN §3 / §4.3. Pure canvas code, node-safe at load.
 *
 *   drawMat(ctx, S, opt)               a round woven picnic mat in perspective (ellipse S × 0.42·S). ORIGIN = the mat CENTRE on
 *                                      the ground (things stand there). S = width (already × depth scale). opt = { seed,
 *                                      unfold 0..1 (0 = a rolled-up tube on the left, 1 = flat; it unrolls left → right;
 *                                      values up to 1.25 = overshoot wobble), flap −1..1 (cloth wave ripple, signed: a spring
 *                                      value), squish −0.5..1 (pressed down: wider + flatter; negative = rebound), gold 0..1,
 *                                      glow 0..1, active 0..1 (dashed white target ring), wet 0..1 (rain sheen), alpha 0..1,
 *                                      t (s, optional: animates the dashes / the wave phase) }
 *   drawThing(ctx, thing, size, opt)   size = box height in px; ORIGIN = BOTTOM-CENTRE (it stands on the mat centre).
 *                                      opt = { glow 0..1, wiggle −1..1 (no-no rock: ±0.3 rad), rot, alpha 0..1, count (dots:
 *                                      the first `count` pinecones are ringed while counted aloud), shadow (default true),
 *                                      numeral (forces the numeral on a dots sign), direct (skip the bitmap cache) }
 *       thing = { kind 'obj'|'shape'|'dots'|'tile'|'animal', color?, obj?, shape?, n?, numeral?, animal?, text?, big? }
 *       obj ∈ flower | mushroom | ball | mug | lantern;  big:false → drawn at size × 0.6
 *   drawPennant(ctx, thing, w, opt)    a triangular cloth pennant hanging from its TOP-LEFT corner (the pole side), tip to the
 *                                      right; height = 0.62·w (pennantH(w)). opt { flutter 0..1, t, alpha, dir (1 | −1: −1 =
 *                                      tip to the left, for a pole on the right side) }
 *   drawPole(ctx, x, y0, y1, opt)      a wooden camp flagpole from the ground (y0) up to y1 with a rope + golden knob; opt { t }
 *   drawPad(ctx, x, y, opt)            the launch pad. (x, y) = the rocket's base point (nozzle bottom). opt { aim (rad from
 *                                      vertical, + = to the right), hose {x, y} (the pump's hose point, see pumpHose), alpha }
 *   drawPump(ctx, x, y, opt)           the foot pump, (x, y) = plunger top (at rest). opt { press 0..1, glow 0..1, gauge 0..1,
 *                                      count 0..3, alpha }
 *   pumpHose(x, y) → {x, y}            where the hose leaves the pump (for drawPad's opt.hose)
 *   drawArc(ctx, pts, opt)             dotted aim arc preview, pts [{x, y}…]; opt { t, alpha }
 *   drawDrop(ctx, x, y, r, a)          a water droplet (centred)
 *   drawPuddleRing(ctx, x, y, r, a)    a flat splash ring on the ground (ry = 0.4·r)
 *   drawHomeBadge(ctx, home, r, opt)   farm|sea|ice|jungle|savanna; opt { a, pop }       (centred)
 *   drawIcon(ctx, choice, size)        centred in a size × size box: any thing, {kind:'color', color}, {kind:'number', n}
 *                                      (numeral + pinecones), {kind:'home', home}, {kind:'size', big, thing?}, {kind:'letter', text}
 *   drawHintHand(ctx, x, y, press, alpha, size?)  fingertip at (x, y), points UP-LEFT
 *   drawBurrow(ctx, x, y, r)           a burrow hole in the grass, centred on the hole (r = hole half-width)
 *   drawRock(ctx, x, y, w)             a far rock, origin = bottom-centre; its flat top is rockTop(w) px above y
 *   dotLayout(n, numeral) → { n, rs, pts } pinecone centres in the 100-unit thing box (origin bottom-centre, y up negative)
 *   thingTop(thing, size), pennantH(w), rockTop(w), matRy(S)
 *   Helpers: pal, lineOf, contrast, PALETTE, MAT, GOLD, SIGN, CONE, OBJS, SHAPES, ANIMALS, HOMES, KINDS, SMALL, thingKey,
 *            clearCache, stats
 *
 * Things are designed in a 100-unit box (x −50..50, y −50..50) and shifted so their foot sits on the origin. Paths are cached
 * as Path2D. With a canvas factory (document or OffscreenCanvas) every thing is rasterised once per thing + device-px bucket
 * (×1.1 steps) and every mat face once per (variant 0..3, device-px bucket); unfold / flap / squish are drawn per frame from
 * that bitmap (clip + strips + transform), gold / glow / active / wet are cheap vector overlays. Without a canvas factory
 * everything is drawn as vectors (unit tests in node).
 */
(function (G) {
  'use strict';
  var DK = G.DK = G.DK || {};

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
  var MAT = { top: '#EFE2C6', ring: '#CDB68E', line: '#9C8763', shade: '#E2D1AE', side: '#D6C29C', hl: '#FBF4E4', weave: '#DCC9A4' };
  var GOLD = '#F4D27A';
  var SIGN = { base: '#F3E6CC', dark: '#D9C29A', light: '#FFF8E8', line: '#9C7A5A' };
  var POST = { base: '#B88A5E', dark: '#8A6440', light: '#D8B48C', line: '#6E4E34' };
  var CONE = { base: '#8A5E3B', dark: '#6A4428', light: '#B8875C', line: '#4E321C' };
  var SAGE = { base: '#8FB47A', dark: '#6A9058', light: '#C4DDB4', line: '#4F6E43' };
  var CREAM = { base: '#F6EEDC', dark: '#E2D4B6', light: '#FFFFFF', line: '#9C8763' };
  var WATER = { light: '#E6F5F7', mid: '#B9DDE3', deep: '#7FB5C0', line: '#5E97A3' };
  var INK = '#3A3640';
  var OBJS = ['flower', 'mushroom', 'ball', 'mug', 'lantern'];
  var SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'oval', 'rect', 'diamond'];
  var ANIMALS = ['cow', 'pig', 'sheep', 'duck', 'hen', 'horse', 'goat', 'crab', 'penguin', 'lion', 'monkey', 'fishbowl'];
  var HOMES = ['farm', 'sea', 'ice', 'jungle', 'savanna'];
  var KINDS = ['obj', 'shape', 'dots', 'tile', 'animal'];
  var SMALL = 0.6, NV = 4;

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
    var P = DK.PALETTE, c = P && P[name] && okHex(P[name].base) && okHex(P[name].dark) && okHex(P[name].light) ? P[name] : FALLBACK[name];
    return c || null;
  }
  function lum(h) { var c = rgb(h).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
  function contrast(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  var LINES = { '#FFD23F': '#7A5600', '#FF9A2E': '#8A4600', '#FF8FC0': '#9A3A6A', '#4CC26B': '#1E6A34' }, lineMemo = {};
  /** outline of an answer colour: a darker tone of the fill, ≥ 3:1 against the oatmeal mat */
  function lineOf(c) {
    var k = String(c.base).toUpperCase() + c.dark;
    if (lineMemo[k]) return lineMemo[k];
    var l = LINES[String(c.base).toUpperCase()] || c.dark, i = 0;
    while (contrast(l, MAT.top) < 3.05 && i++ < 12) l = mix(l, '#1E1812', 0.14);
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
  function canDOM() {
    return (typeof document !== 'undefined' && !!document && typeof document.createElement === 'function') || typeof OffscreenCanvas !== 'undefined';
  }
  function makeCanvas(w, h) {
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
    if (typeof document !== 'undefined' && document && typeof document.createElement === 'function') {
      var c = document.createElement('canvas'); c.width = w; c.height = h; return c;
    }
    return new OffscreenCanvas(w, h);
  }
  function devScale(ctx) {
    var m = null;
    try { m = ctx.getTransform ? ctx.getTransform() : null; } catch (e) { m = null; }
    var k = m ? Math.max(Math.hypot(m.a, m.b), Math.hypot(m.c, m.d)) : 0;
    return k > 0 && isFinite(k) ? k : (G.devicePixelRatio || 1);
  }
  var BK = 1.1, LBK = Math.log(BK);
  function bucket(px, lo, hi) { px = Math.max(lo, Math.min(hi, px)); return Math.pow(BK, Math.ceil(Math.log(px) / LBK - 1e-9)); }
  var stats = { thingBuilt: 0, thingHit: 0, matBuilt: 0, matHit: 0 };
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
  // ---- camping enamel mug (handle right): the whole body is the colour, a steel rim, cocoa inside, white enamel speckles
  var MCX = -10, MRX = 28, MRY = 7.5, MTOP = -27, MBOT = 38;
  var mgBody = function (t) {
    t.moveTo(MCX - MRX, MTOP); t.lineTo(MCX - MRX, MBOT);
    t.ellipse(MCX, MBOT, MRX, MRY, 0, Math.PI, 0, true);
    t.lineTo(MCX + MRX, MTOP);
    t.ellipse(MCX, MTOP, MRX, MRY, 0, 0, -Math.PI, true);
    t.closePath();
  };
  var mgMouth = function (t) { ell(t, MCX, MTOP, MRX - 2.2, MRY - 1.6, 0); };
  var mgHandle = function (t) { t.moveTo(MCX + MRX - 3, -15); t.bezierCurveTo(MCX + MRX + 22, -19, MCX + MRX + 24, 26, MCX + MRX - 3, 24); };
  var mgSil = function (t) { mgBody(t); rrect(t, MCX + MRX - 4, -21, 30, 50, 12); };
  OBJ.mug = {
    sil: mgSil,
    icon: function (t) { mgBody(t); t.moveTo(MCX + MRX - 3, -15); t.bezierCurveTo(MCX + MRX + 24, -21, MCX + MRX + 26, 28, MCX + MRX - 3, 26); t.lineTo(MCX + MRX - 3, 15);
      t.bezierCurveTo(MCX + MRX + 12, 16, MCX + MRX + 12, -6, MCX + MRX - 3, -5); t.closePath(); },
    draw: function (ctx, c) {
      var L = lineOf(c);
      ctx.lineCap = 'round';
      ctx.strokeStyle = L; ctx.lineWidth = 14; strokeP(ctx, P('mg.handle', mgHandle));
      ctx.strokeStyle = c.base; ctx.lineWidth = 7.6; strokeP(ctx, P('mg.handle', mgHandle));
      ctx.strokeStyle = rgba(mix(c.light, '#FFFFFF', 0.3), 0.8); ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(MCX + MRX + 4, -15); ctx.quadraticCurveTo(MCX + MRX + 12, -12, MCX + MRX + 14, -2); ctx.stroke();
      cel(ctx, 'mg.body', mgBody, c, {
        s: 6, hl: [MCX - 15, -4, 5.5, 17, 0],
        inner: function (x) {
          // a soft darker foot band + white enamel speckles (reads as a camping mug)
          x.fillStyle = rgba(c.dark, 0.28); x.beginPath(); ell(x, MCX, MBOT, MRX + 2, MRY + 2.4, 0); x.fill();
          [[-30, 8, 1.6], [-22, 22, 1.2], [-4, 2, 1.4], [6, 18, 1.7], [12, -8, 1.2], [-16, -12, 1.3], [-28, -14, 1.1], [0, 30, 1.2], [14, 32, 1.0], [-12, 34, 1.4]].forEach(function (p) {
            dot(x, p[0], p[1], p[2], 'rgba(255,255,255,0.75)');
          });
        }
      });
      // mouth: steel rim, cocoa inside
      ctx.fillStyle = '#F6EEDC'; fillP(ctx, P('mg.mouth', mgMouth));
      ctx.save(); clipP(ctx, P('mg.mouth', mgMouth));
      oval(ctx, MCX, MTOP + 2.6, MRX - 4, MRY - 2.6, 0, '#9A6A4A');
      oval(ctx, MCX - 7, MTOP + 1.8, 7, 1.6, 0, 'rgba(255,236,214,0.7)');
      ctx.fillStyle = 'rgba(120,96,70,0.35)'; ctx.fillRect(MCX - MRX, MTOP - MRY, MRX * 2, 3.6);
      ctx.restore();
      ctx.strokeStyle = '#B9B6C0'; ctx.lineWidth = 3.6; ctx.beginPath(); ell(ctx, MCX, MTOP, MRX - 1, MRY - 0.6, 0); ctx.stroke();
      ctx.strokeStyle = '#7C7884'; ctx.lineWidth = 1.4; ctx.beginPath(); ell(ctx, MCX, MTOP, MRX - 2.9, MRY - 2.2, 0); ctx.stroke();
      ctx.strokeStyle = L; ctx.lineWidth = LW; strokeP(ctx, P('mg.body', mgBody));
      // a little curl of steam
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(MCX - 2, MTOP - 6); ctx.bezierCurveTo(MCX - 8, MTOP - 12, MCX + 4, MTOP - 16, MCX - 2, MTOP - 22); ctx.stroke();
    }
  };
  // ---- camping lantern: the colour is the big hood + the big base + the guard bars; pale glass with a tiny flame
  var lnHood = function (t) {
    t.moveTo(-31, -15); t.bezierCurveTo(-29, -28, -13, -37, 0, -37); t.bezierCurveTo(13, -37, 29, -28, 31, -15);
    t.bezierCurveTo(20, -10.5, -20, -10.5, -31, -15); t.closePath();
  };
  var lnKnob = function (t) { rrect(t, -6.5, -44, 13, 9, 3.5); };
  var lnGlass = function (t) { rrect(t, -21, -16, 42, 34, 13); };
  var lnBase = function (t) {
    t.moveTo(-28, 15); t.lineTo(28, 15); t.bezierCurveTo(34, 15, 35, 24, 34, 34); t.bezierCurveTo(33, 42, 30, 46, 22, 46);
    t.lineTo(-22, 46); t.bezierCurveTo(-30, 46, -33, 42, -34, 34); t.bezierCurveTo(-35, 24, -34, 15, -28, 15); t.closePath();
  };
  var lnBarL = function (t) { rrect(t, -15, -15, 6, 32, 3); };
  var lnBarR = function (t) { rrect(t, 9, -15, 6, 32, 3); };
  var lnBail = function (t) { t.moveTo(-24, -24); t.bezierCurveTo(-26, -52, 26, -52, 24, -24); };
  var lnFlame = function (t) { t.moveTo(0, -6); t.bezierCurveTo(4, -1, 5, 4, 0, 7); t.bezierCurveTo(-5, 4, -4, -1, 0, -6); t.closePath(); };
  OBJ.lantern = {
    sil: function (t) { lnHood(t); lnGlass(t); lnBase(t); lnKnob(t); rrect(t, -26, -49, 52, 6, 2); },
    draw: function (ctx, c) {
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#5E5A66'; ctx.lineWidth = 5.4; strokeP(ctx, P('ln.bail', lnBail));
      ctx.strokeStyle = '#A9A5B2'; ctx.lineWidth = 2.4; strokeP(ctx, P('ln.bail', lnBail));
      // glass + warm light
      ctx.fillStyle = '#FFF7E6'; fillP(ctx, P('ln.glass', lnGlass));
      ctx.save(); clipP(ctx, P('ln.glass', lnGlass));
      var gr = ctx.createRadialGradient(0, 2, 2, 0, 2, 24);
      gr.addColorStop(0, 'rgba(255,226,170,0.95)'); gr.addColorStop(0.5, 'rgba(255,236,200,0.55)'); gr.addColorStop(1, 'rgba(255,247,230,0)');
      ctx.fillStyle = gr; ctx.fillRect(-22, -17, 44, 36);
      ctx.fillStyle = '#F7B267'; fillP(ctx, P('ln.flame', lnFlame));
      ctx.save(); ctx.translate(0, 2); ctx.scale(0.5, 0.55); ctx.fillStyle = '#FFF3D6'; fillP(ctx, P('ln.flame', lnFlame)); ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); rrect(ctx, -18, -12, 4.5, 22, 2.2); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = '#B7A88C'; ctx.lineWidth = 2.6; strokeP(ctx, P('ln.glass', lnGlass));
      cel(ctx, 'ln.barL', lnBarL, c, { s: 1.4, hl: false, lw: 2.4 });
      cel(ctx, 'ln.barR', lnBarR, c, { s: 1.4, hl: false, lw: 2.4 });
      cel(ctx, 'ln.base', lnBase, c, {
        s: 5, hl: [-20, 22, 6, 3.2, -0.2],
        inner: function (x) {
          x.strokeStyle = rgba(c.dark, 0.6); x.lineWidth = 2.4; x.beginPath(); x.moveTo(-33, 26); x.quadraticCurveTo(0, 30, 33, 26); x.stroke();
          x.strokeStyle = rgba(mix(c.light, '#FFFFFF', 0.4), 0.8); x.lineWidth = 2; x.beginPath(); x.moveTo(-31, 19); x.quadraticCurveTo(0, 22, 31, 19); x.stroke();
        }
      });
      dot(ctx, 20, 36, 4.2, '#EDE6D6'); ctx.strokeStyle = '#7C7884'; ctx.lineWidth = 1.8; ctx.beginPath(); circ(ctx, 20, 36, 4.2); ctx.stroke();
      cel(ctx, 'ln.hood', lnHood, c, { s: 3.6, hl: [-13, -28, 7, 3, -0.4] });
      cel(ctx, 'ln.knob', lnKnob, c, { s: 1.6, hl: false, lw: 2.6 });
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
  var DREG = { disc: { e: [0, -9, 33, 33], cap: 11 }, tall: { r: [-36, -9, 36, 28], cap: 9.4 } };
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
    var rs = n === 1 ? (numeral ? 12 : 15) : best.rs;
    var cx = R.e ? R.e[0] : (R.r[0] + R.r[2]) / 2, cy = R.e ? R.e[1] : (R.r[1] + R.r[3]) / 2;
    return (lcache[key] = { n: n, rs: rs, pts: best.u.map(function (p) { return [cx + p[0] * rs, cy + p[1] * rs]; }) });
  }
  function dotLayout(n, numeral) {   // public: origin = bottom-centre of the 100 box (foot at y 0)
    var L = dotLayoutC(n, numeral);
    return { n: L.n, rs: L.rs, pts: L.pts.map(function (p) { return [p[0], p[1] - 50]; }) };
  }
  // ---- a pinecone in a circle of radius 10 (design units; scaled to the layout's rs): a rounded egg, scales, a tiny stem
  var pcBody = function (t) {
    t.moveTo(0, -9.4);
    t.bezierCurveTo(6.4, -9.4, 9.2, -4.6, 8.6, 0.6);
    t.bezierCurveTo(8, 5.4, 3.8, 9.6, 0, 9.8);
    t.bezierCurveTo(-3.8, 9.6, -8, 5.4, -8.6, 0.6);
    t.bezierCurveTo(-9.2, -4.6, -6.4, -9.4, 0, -9.4);
    t.closePath();
  };
  var pcScales = function (t) {
    // three rows of overlapping scale tips (little "u" arcs), offset per row
    [[-5.2, [-3.8, 0, 3.8]], [-1.2, [-5.7, -1.9, 1.9, 5.7]], [2.8, [-3.8, 0, 3.8]], [6.4, [-1.9, 1.9]]].forEach(function (row) {
      row[1].forEach(function (x) { t.moveTo(x - 1.9, row[0]); t.quadraticCurveTo(x, row[0] + 3.1, x + 1.9, row[0]); });
    });
  };
  function pinecone(ctx, x, y, r) {
    var k = r / 10;
    ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
    ctx.fillStyle = 'rgba(110,80,46,0.28)'; ctx.beginPath(); ell(ctx, 1, 1.4, 8.6, 9.6, 0); ctx.fill();   // carved shadow
    ctx.fillStyle = CONE.base; fillP(ctx, P('pc.body', pcBody));
    ctx.save(); clipP(ctx, P('pc.body', pcBody));
    ctx.fillStyle = CONE.dark; ctx.beginPath(); ell(ctx, 4.6, 4.8, 8.2, 8.6, -0.3); ctx.fill();
    ctx.fillStyle = CONE.base; ctx.beginPath(); ell(ctx, -1.3, -1.6, 7.8, 8.4, -0.2); ctx.fill();
    ctx.strokeStyle = CONE.light; ctx.lineWidth = 1.5; strokeP(ctx, P('pc.scales', pcScales));
    oval(ctx, -3.4, -5, 2.2, 1.2, -0.6, 'rgba(255,236,206,0.7)');
    ctx.restore();
    ctx.strokeStyle = CONE.line; ctx.lineWidth = 1.7; strokeP(ctx, P('pc.body', pcBody));
    ctx.lineCap = 'round'; ctx.strokeStyle = CONE.line; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(0, -9.2); ctx.quadraticCurveTo(0.6, -10.6, 2, -11.2); ctx.stroke();
    ctx.restore();
  }
  function drawDots(ctx, th) {
    var numeral = !!th.numeral, L = dotLayoutC(th.n, numeral);
    drawSign(ctx, numeral ? 'tall' : 'disc');
    if (numeral) signText(ctx, String(L.n), 0, -28, 64, 27, INK);
    L.pts.forEach(function (p) { pinecone(ctx, p[0], p[1], L.rs); });
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
    var A = DK.Assets;
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
    var o = opt || {};
    if (o.numeral && thing.kind === 'dots' && !thing.numeral) thing = Object.assign({}, thing, { numeral: true });
    var sc = (thing.big === false ? SMALL : 1) * bigDots(thing), box = size * sc, s = box / 100;
    var alpha = o.alpha == null ? 1 : clamp01(num(o.alpha, 1)); if (alpha <= 0.001) return;
    var glow = clamp01(o.glow), wig = Math.max(-1, Math.min(1, num(o.wiggle, 0))), rot = num(o.rot, 0), count = Math.round(num(o.count, -1));
    var k = kindOf(thing), foot = footOf(thing);
    ctx.save(); ctx.globalAlpha *= alpha;
    if (o.shadow !== false) {   // contact shadow on the mat (before any rotation: it stays on the mat)
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


  // ================================================================= MATS (design units: S = 100 wide, top ellipse 100 × 42)
  var RX = 50, RY = 21, THK = 3.4, MBW = 124, MBH = 60, MBX = 62, MBY = 27;   // sprite box (design units) + origin inside it
  function matVariant(seed) {
    var s = num(seed, 0);
    if (s % 1 !== 0) s = Math.floor(Math.abs(s) * 7919);
    return Math.abs(Math.floor(s)) % NV;
  }
  function matRy(S) { return num(S, 0) * RY / 100; }
  function ep(k, a) { return [k * RX * Math.cos(a), k * RY * Math.sin(a)]; }
  var faceP = function (t) { ell(t, 0, 0, RX, RY, 0); };
  /** the flat woven mat (vector), origin = centre of the top face */
  function matFace(g, v) {
    var r = function (i) { return hash(v * 17 + i + 3); };
    var band = [0.56 + 0.04 * r(1), 0.75 + 0.02 * r(2)], ph = r(3) * TAU, N = 34 + v * 2;
    var face = P('mat.face', faceP);
    g.lineJoin = 'round'; g.lineCap = 'round';
    // the mat's thickness (front rim) + its edge
    g.fillStyle = MAT.side; g.beginPath(); ell(g, 0, THK, RX, RY, 0); g.fill();
    g.strokeStyle = MAT.line; g.lineWidth = 2.6; g.beginPath(); ell(g, 0, THK, RX, RY, 0); g.stroke();
    g.fillStyle = MAT.top; fillP(g, face);
    g.save(); clipP(g, face);
    // one-step cel shade (lower right) + the woven sand-brown ring + a centre medallion
    g.fillStyle = MAT.shade; g.fillRect(-56, -26, 112, 52);
    g.fillStyle = MAT.top; g.beginPath(); ell(g, -2.6, -1.5, RX, RY, 0); g.fill();
    g.fillStyle = MAT.ring; g.beginPath(); ell(g, 0, 0, RX * band[1], RY * band[1], 0); g.fill();
    g.fillStyle = MAT.top; g.beginPath(); ell(g, 0, 0, RX * band[0], RY * band[0], 0); g.fill();
    g.fillStyle = MAT.ring; g.beginPath(); ell(g, 0, 0, RX * 0.2, RY * 0.2, 0); g.fill();
    g.fillStyle = mix(MAT.top, MAT.hl, 0.4); g.beginPath(); ell(g, 0, 0, RX * 0.11, RY * 0.11, 0); g.fill();
    // coils
    var coils = [0.97, 0.88, band[1], band[0], 0.46, 0.36, 0.27, 0.2];
    g.strokeStyle = rgba(MAT.line, 0.22); g.lineWidth = 0.9;
    coils.forEach(function (k) { g.beginPath(); ell(g, 0, 0, RX * k, RY * k, 0); g.stroke(); });
    // basket-weave stitches between the coils (alternating phase per coil → woven look)
    var zones = [[0.88, 0.97], [band[1], 0.88], [0.46, band[0]], [0.36, 0.46], [0.27, 0.36], [0.2, 0.27]];
    zones.forEach(function (z, zi) {
      var n = Math.max(10, Math.round(N * (z[0] + z[1]) / 2)), off = (zi % 2) * 0.5;
      g.strokeStyle = rgba(MAT.line, 0.26); g.lineWidth = 1.1; g.beginPath();
      for (var i = 0; i < n; i++) {
        var a = ph + (i + off) / n * TAU, p0 = ep(z[0] + 0.012, a), p1 = ep(z[1] - 0.012, a + 0.05);
        g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]);
      }
      g.stroke();
    });
    // the woven band: light cross stitches
    var nb = Math.round(N * 1.3);
    g.strokeStyle = rgba(MAT.hl, 0.6); g.lineWidth = 1.4; g.beginPath();
    for (var j = 0; j < nb; j++) {
      var a2 = ph + j / nb * TAU, q0 = ep(band[0] + 0.03, a2), q1 = ep(band[1] - 0.03, a2 + 0.11);
      g.moveTo(q0[0], q0[1]); g.lineTo(q1[0], q1[1]);
    }
    g.stroke();
    g.strokeStyle = rgba(MAT.line, 0.3); g.lineWidth = 1; g.beginPath();
    for (var q = 0; q < nb; q++) {
      var a3 = ph + (q + 0.5) / nb * TAU, s0 = ep(band[1] - 0.03, a3), s1 = ep(band[0] + 0.03, a3 + 0.11);
      g.moveTo(s0[0], s0[1]); g.lineTo(s1[0], s1[1]);
    }
    g.stroke();
    // crisp edges on the woven band so it reads as a ring at phone size
    g.strokeStyle = rgba(MAT.line, 0.7); g.lineWidth = 1.3;
    g.beginPath(); ell(g, 0, 0, RX * band[1], RY * band[1], 0); g.stroke();
    g.beginPath(); ell(g, 0, 0, RX * band[0], RY * band[0], 0); g.stroke();
    // soft highlight upper-left
    oval(g, -20, -9, 17, 4.2, -0.05, 'rgba(255,252,240,0.55)');
    oval(g, -27, -10.5, 6, 1.6, -0.05, 'rgba(255,255,255,0.7)');
    g.restore();
    // braided binding on the edge
    g.strokeStyle = MAT.ring; g.lineWidth = 3; g.beginPath(); ell(g, 0, 0, RX - 1.6, RY - 1.2, 0); g.stroke();
    g.strokeStyle = rgba(MAT.line, 0.55); g.lineWidth = 1; g.beginPath();
    for (var b = 0; b < 52; b++) {
      var ab = b / 52 * TAU, e0 = ep(0.995, ab), e1 = ep(0.94, ab + 0.07);
      g.moveTo(e0[0], e0[1]); g.lineTo(e1[0], e1[1]);
    }
    g.stroke();
    g.strokeStyle = MAT.line; g.lineWidth = 2.6; strokeP(g, face);
    // the front rim seam
    g.strokeStyle = rgba(MAT.line, 0.6); g.lineWidth = 1.2;
    g.beginPath(); g.ellipse(0, THK * 0.5, RX - 0.4, RY - 0.2, 0, 0.18, Math.PI - 0.18, false); g.stroke();
  }
  function matBitmap(ctx, v) {
    if (!canDOM()) return null;
    var dev = devScale(ctx), devPx = bucket(100 * dev, 12, 1600), u = devPx / 100;
    var key = 'mat:' + v + '|' + devPx.toFixed(1), c = sget(key);
    if (c) { stats.matHit++; return { c: c, u: u }; }
    try {
      c = makeCanvas(MBW * u, MBH * u);
      var g = c.getContext('2d');
      if (!g) return null;
      g.setTransform(u, 0, 0, u, MBX * u, MBY * u); matFace(g, v); stats.matBuilt++; sput(key, c);
      return { c: c, u: u };
    } catch (e) { return null; }
  }
  /** the face, cut at x < clipX, in vertical strips shifted by the cloth wave */
  function faceStrips(ctx, v, clipX, flap, t) {
    var bm = matBitmap(ctx, v), n = Math.abs(flap) > 0.01 ? 32 : 1, x0 = -MBX, w = MBW / n;
    for (var i = 0; i < n; i++) {
      var a = x0 + i * w, b = Math.min(a + w, clipX);
      if (b <= a) break;
      var xm = (a + b) / 2, env = 0.45 + 0.55 * Math.min(1, Math.abs(xm) / RX);
      var dy = n > 1 ? flap * 5.2 * env * Math.sin(xm / 100 * TAU * 1.25 + t * 9) : 0;
      var ov = n > 1 && b < clipX ? 0.6 : 0;   // tiny overlap: no hairline seams between strips
      if (bm) {
        var sx = (a + MBX) * bm.u, sw = (b - a + ov) * bm.u;
        sw = Math.min(sw, bm.c.width - sx);
        if (sw > 0.5) ctx.drawImage(bm.c, sx, 0, sw, bm.c.height, a, -MBY + dy, sw / bm.u, MBH);
      } else {
        ctx.save(); ctx.beginPath(); ctx.rect(a, -MBY - 10, b - a + ov, MBH + 20); ctx.clip();
        if (dy) ctx.translate(0, dy);
        matFace(ctx, v);
        ctx.restore();
      }
    }
  }
  /** the rolled-up part: a tube lying front-to-back at xr, radius rr, its spiral end facing us */
  function matRoll(ctx, xr, rr) {
    var ch = RY * 0.62 * Math.max(0.75, Math.sqrt(Math.max(0, 1 - (xr / RX) * (xr / RX)))), yb = -ch - rr * 0.6, yf = ch - rr;
    ctx.fillStyle = 'rgba(50,70,40,0.22)'; ctx.beginPath(); ell(ctx, xr + 2, 2, rr + 3.5, ch + 3, 0); ctx.fill();
    var gr = ctx.createLinearGradient(xr - rr, 0, xr + rr, 0);
    gr.addColorStop(0, MAT.hl); gr.addColorStop(0.45, MAT.top); gr.addColorStop(1, MAT.shade);
    ctx.fillStyle = gr; ctx.beginPath(); rrect(ctx, xr - rr, yb - rr, rr * 2, yf - yb + rr, rr); ctx.fill();
    // the woven ring shows on the outer wrap as two bands across the tube
    ctx.save(); ctx.beginPath(); rrect(ctx, xr - rr, yb - rr, rr * 2, yf - yb + rr, rr); ctx.clip();
    ctx.fillStyle = rgba(MAT.ring, 0.9); ctx.fillRect(xr - rr, yb + (yf - yb) * 0.22, rr * 2, (yf - yb) * 0.14);
    ctx.fillRect(xr - rr, yb + (yf - yb) * 0.64, rr * 2, (yf - yb) * 0.14);
    ctx.strokeStyle = rgba(MAT.line, 0.45); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(xr + rr * 0.35, yb - rr); ctx.lineTo(xr + rr * 0.35, yf); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = MAT.line; ctx.lineWidth = 2.4; ctx.beginPath(); rrect(ctx, xr - rr, yb - rr, rr * 2, yf - yb + rr, rr); ctx.stroke();
    if (rr > 6) {   // a khaki tie strap around the roll (only while it is still mostly rolled)
      var sy = (yb + yf) / 2 - rr * 0.2;
      ctx.fillStyle = '#C9B48A'; ctx.beginPath(); rrect(ctx, xr - rr - 0.6, sy - 2.6, rr * 2 + 1.2, 5.2, 2); ctx.fill();
      ctx.strokeStyle = '#7A6544'; ctx.lineWidth = 1.4; ctx.beginPath(); rrect(ctx, xr - rr - 0.6, sy - 2.6, rr * 2 + 1.2, 5.2, 2); ctx.stroke();
    }
    // the spiral end
    ctx.fillStyle = MAT.side; ctx.beginPath(); circ(ctx, xr, yf, rr); ctx.fill();
    ctx.strokeStyle = MAT.line; ctx.lineWidth = Math.max(0.8, Math.min(1.6, rr * 0.14)); ctx.beginPath();
    var turns = 2.6, steps = 40;
    for (var i = 0; i <= steps; i++) {
      var f = i / steps, a = f * turns * TAU, rad = rr * 0.9 * f;
      var px = xr + Math.cos(a) * rad, py = yf + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.strokeStyle = MAT.line; ctx.lineWidth = 2.2; ctx.beginPath(); circ(ctx, xr, yf, rr); ctx.stroke();
    oval(ctx, xr - rr * 0.45, yb + (yf - yb) * 0.4, rr * 0.22, (yf - yb) * 0.22, 0, 'rgba(255,255,255,0.5)');
  }
  function drawMat(ctx, S, opt) {
    if (!ctx) return;
    S = num(S, 0); if (!(S > 0)) return;
    var o = opt || {}, alpha = o.alpha == null ? 1 : clamp01(num(o.alpha, 1)); if (alpha <= 0.001) return;
    var v = matVariant(o.seed), u = o.unfold == null ? 1 : Math.max(0, Math.min(1.25, num(o.unfold, 1)));
    var flap = Math.max(-1, Math.min(1, num(o.flap, 0))), sq = Math.max(-0.5, Math.min(1, num(o.squish, 0)));
    var gold = clamp01(o.gold), glow = clamp01(o.glow), act = clamp01(o.active), wet = clamp01(o.wet), t = num(o.t, 0);
    var uf = Math.min(1, u), over = Math.max(0, u - 1), k = S / 100;
    var sx = 1 + 0.16 * sq + 0.32 * over, sy = 1 - 0.32 * sq - 0.4 * over;
    var rr = uf >= 0.999 ? 0 : 3 + 12 * Math.pow(1 - uf, 0.8);
    var xr = uf >= 0.999 ? RX + 20 : -RX + rr + uf * (2 * RX - rr);
    var cx0 = Math.min(RX, xr), spanL = (cx0 + RX) / 2;   // the flat part spans x −RX..cx0
    ctx.save(); ctx.globalAlpha *= alpha; ctx.scale(k, k);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // on the grass: soft shadow, golden / hint halo, the target ring
    ctx.fillStyle = 'rgba(46,70,36,0.2)'; ctx.beginPath(); ell(ctx, (cx0 - RX) / 2 + 2, THK + 3, (spanL + 3) * sx, (RY + 3.5) * Math.max(0.6, sy), 0); ctx.fill();
    if (gold > 0.01 || glow > 0.01) {
      ctx.save(); ctx.scale(1, 0.44);
      var hg = ctx.createRadialGradient(0, 0, 20, 0, 0, 78 + 8 * glow);
      var gA = Math.max(0.5 * gold, 0.62 * glow);
      hg.addColorStop(0, 'rgba(255,224,130,' + gA.toFixed(3) + ')'); hg.addColorStop(0.7, 'rgba(255,210,100,' + (gA * 0.45).toFixed(3) + ')'); hg.addColorStop(1, 'rgba(255,206,90,0)');
      ctx.fillStyle = hg; ctx.beginPath(); circ(ctx, 0, 0, 78 + 8 * glow); ctx.fill();
      ctx.restore();
    }
    if (act > 0.01) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.45 * act).toFixed(3) + ')'; ctx.lineWidth = 7;
      ctx.beginPath(); ell(ctx, 0, 1.5, RX * 1.2 * sx, RY * 1.36 * Math.max(0.6, sy), 0); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.98 * act).toFixed(3) + ')'; ctx.lineWidth = 3.4;
      if (ctx.setLineDash) { ctx.setLineDash([9, 7]); ctx.lineDashOffset = -t * 16; }
      ctx.beginPath(); ell(ctx, 0, 1.5, RX * 1.2 * sx, RY * 1.36 * Math.max(0.6, sy), 0); ctx.stroke();
      if (ctx.setLineDash) ctx.setLineDash([]);
      ctx.restore();
    }
    ctx.save(); ctx.scale(sx, sy);
    faceStrips(ctx, v, xr, flap, t);
    // overlays on the flat part
    ctx.save(); ctx.beginPath(); ctx.rect(-RX - 8, -RY - 12, Math.max(0, xr + RX + 8), RY * 2 + 24); ctx.clip();
    var face = P('mat.face', faceP);
    if (gold > 0.01) {
      ctx.save(); clipP(ctx, face);
      ctx.fillStyle = rgba(GOLD, 0.5 * gold); ctx.fillRect(-RX, -RY, RX * 2, RY * 2);
      ctx.fillStyle = 'rgba(255,250,225,' + (0.45 * gold).toFixed(3) + ')'; ctx.beginPath(); ell(ctx, -16, -7, 22, 5.5, -0.05); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(214,160,60,' + (0.85 * gold).toFixed(3) + ')'; ctx.lineWidth = 2.6; strokeP(ctx, face);
    }
    if (wet > 0.01) {   // rain: a slightly darker, glossy face with a few beads
      ctx.save(); clipP(ctx, face);
      ctx.fillStyle = 'rgba(96,84,60,' + (0.12 * wet).toFixed(3) + ')'; ctx.fillRect(-RX, -RY, RX * 2, RY * 2);
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.6 * wet).toFixed(3) + ')'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(-34, -9); ctx.quadraticCurveTo(-20, -14, -4, -14); ctx.moveTo(14, 9); ctx.quadraticCurveTo(24, 7, 32, 3); ctx.stroke();
      [[-26, 4, 1.8], [8, -8, 1.5], [22, -3, 2], [-6, 12, 1.6], [34, 8, 1.4], [-38, -2, 1.3]].forEach(function (b) {
        dot(ctx, b[0], b[1], b[2] * (0.5 + 0.5 * wet), 'rgba(190,222,230,' + (0.9 * wet).toFixed(3) + ')');
        dot(ctx, b[0] - b[2] * 0.35, b[1] - b[2] * 0.35, b[2] * 0.4, 'rgba(255,255,255,' + wet.toFixed(3) + ')');
      });
      ctx.restore();
    }
    if (glow > 0.01) {
      ctx.strokeStyle = 'rgba(255,190,60,' + (0.55 * glow).toFixed(3) + ')'; ctx.lineWidth = 9; strokeP(ctx, face);
      ctx.strokeStyle = 'rgba(255,230,130,' + (0.95 * glow).toFixed(3) + ')'; ctx.lineWidth = 4; strokeP(ctx, face);
      ctx.strokeStyle = 'rgba(255,252,232,' + (0.9 * glow).toFixed(3) + ')'; ctx.lineWidth = 1.5; strokeP(ctx, face);
    }
    if (gold > 0.6) {
      var ga = (gold - 0.6) / 0.4;
      sparkle(ctx, -36, -8, 5 * ga, 'rgba(255,255,255,0.95)'); sparkle(ctx, 40, 4, 3.8 * ga, 'rgba(255,250,220,0.95)'); sparkle(ctx, 10, -17, 3 * ga, 'rgba(255,255,255,0.9)');
    }
    ctx.restore();
    if (rr > 0) matRoll(ctx, xr, rr);
    ctx.restore();
    ctx.restore();
  }

  // ================================================================= PENNANTS (hang from the top-left corner, tip right)
  function pennantH(w) { return num(w, 70) * 0.62; }
  function silhouette(ctx, th, size, fill, line) {   // a colour thing's own silhouette, centred, fit in size × size
    var k = kindOf(th), key, build;
    if (k === 'obj') { var ob = objOf(th); key = 'sil.' + ob; build = OBJ[ob].sil; if (OBJ[ob].icon) { key = 'ico.' + ob; build = OBJ[ob].icon; } }
    else { var sh = shapeOf(th); key = 'shp.' + sh; build = SHP[sh]; }
    var b = bbox(key, build), sc = size / Math.max(b.w, b.h, 1);
    ctx.save(); ctx.scale(sc, sc); ctx.translate(-(b.x + b.w / 2), -(b.y + b.h / 2));
    ctx.strokeStyle = line; ctx.lineWidth = 2.4 / sc + 4; ctx.lineJoin = 'round'; strokeP(ctx, P(key, build));
    ctx.fillStyle = fill; fillP(ctx, P(key, build));
    if (key === 'sil.ball') {   // the ball's two seams, so it never reads as a plain circle shape
      ctx.strokeStyle = line; ctx.lineWidth = 3.2 / sc + 1.5; ctx.beginPath();
      ctx.moveTo(-40, 3); ctx.bezierCurveTo(-18, -15, 20, -17, 40, -1); ctx.moveTo(-38, 21); ctx.bezierCurveTo(-18, 2, 20, 0, 39, 16); ctx.stroke();
    }
    ctx.restore();
  }
  function drawPennant(ctx, thing, w, opt) {
    if (!ctx) return;
    w = num(w, 70); if (!(w > 0)) return;
    var o = opt || {}, a = o.alpha == null ? 1 : clamp01(num(o.alpha, 1)); if (a <= 0.001) return;
    var fl = clamp01(o.flutter), t = num(o.t, 0), dir = o.dir === -1 ? -1 : 1, h = pennantH(w);
    var th = thing || { kind: 'obj', obj: 'ball', color: 'red' }, kk = kindOf(th);
    var c = (kk === 'obj' || kk === 'shape') ? pal(th.color) : null;
    var C = c || CREAM, L = c ? lineOf(c) : CREAM.line, amp = h * (0.05 + 0.16 * fl);
    var wave = function (x) { var f = x / w; return amp * f * Math.sin(f * TAU * 0.95 - t * 7.5); };
    var N = 12, top = [], bot = [];
    for (var i = 0; i <= N; i++) {
      var x = w * i / N, f = i / N, dy = wave(x);
      top.push([x, f * h / 2 + dy]); bot.push([x, h - f * h / 2 + dy]);
    }
    var cloth = function (q) {
      q.moveTo(0, 0);
      for (var i = 1; i <= N; i++) q.lineTo(top[i][0], top[i][1]);
      for (var j = N - 1; j >= 0; j--) q.lineTo(bot[j][0], bot[j][1]);
      q.closePath();
    };
    ctx.save(); ctx.globalAlpha *= a; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.rotate(dir * fl * 0.05 * Math.sin(t * 3.1));
    ctx.save(); ctx.scale(dir, 1);
    ctx.fillStyle = 'rgba(40,50,40,0.16)'; ctx.save(); ctx.translate(2, 3); ctx.beginPath(); cloth(ctx); ctx.fill(); ctx.restore();
    ctx.fillStyle = C.base; ctx.beginPath(); cloth(ctx); ctx.fill();
    ctx.save(); ctx.beginPath(); cloth(ctx); ctx.clip();
    ctx.fillStyle = c ? shadeOf(c) : CREAM.dark;   // one-step shade along the lower edge
    ctx.beginPath(); ctx.moveTo(0, h * 0.72);
    for (var s1 = 0; s1 <= N; s1++) ctx.lineTo(bot[s1][0], bot[s1][1] - h * 0.2 * (1 - s1 / N));
    ctx.lineTo(w, h * 2); ctx.lineTo(0, h * 2); ctx.closePath(); ctx.fill();
    // a soft fold shade where the wave dips + the highlight upper-left
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ell(ctx, w * 0.3, h * 0.24 + wave(w * 0.3), w * 0.16, h * 0.05, 0.2); ctx.fill();
    // the hem sleeve on the pole side
    ctx.fillStyle = c ? c.dark : '#E2D4B6'; ctx.fillRect(0, -2, w * 0.085, h + 4);
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(w * 0.015, -2, w * 0.02, h + 4);
    ctx.restore();
    ctx.strokeStyle = L; ctx.lineWidth = Math.max(1.6, w * 0.035); ctx.beginPath(); cloth(ctx); ctx.stroke();
    // two grommets on the pole
    [h * 0.12, h * 0.88].forEach(function (gy) { dot(ctx, w * 0.045, gy, Math.max(1.6, w * 0.03), '#F3EEE2'); ctx.strokeStyle = '#7C7884'; ctx.lineWidth = 1.2; ctx.beginPath(); circ(ctx, w * 0.045, gy, Math.max(1.6, w * 0.03)); ctx.stroke(); });
    ctx.restore();
    // the icon (never mirrored)
    var ix = dir * w * 0.36, iy = h / 2 + wave(w * 0.36), isz = h * 0.6;
    ctx.save(); ctx.translate(ix, iy);
    if (c) silhouette(ctx, th, isz, mix(c.light, '#FFFFFF', 0.55), rgba(c.dark, 0.9));
    else if (kk === 'dots') {
      var n = Math.max(1, Math.min(12, Math.round(num(th.n, 1))));
      signText(ctx, String(n), -isz * 0.12, 0, isz * 0.95, isz * 0.62, INK);
      pinecone(ctx, isz * 0.5, -isz * 0.05, isz * 0.22);
    } else if (kk === 'tile') {
      signText(ctx, tileText(th), 0, 0, isz * 1.25, isz * 0.6, INK);
    } else {
      ctx.translate(0, isz * 0.5); drawThing(ctx, Object.assign({}, th, { big: true }), isz, { shadow: false });
    }
    ctx.restore();
    ctx.restore();
  }

  // ================================================================= FLAGPOLE
  function drawPole(ctx, x, y0, y1, opt) {
    if (!ctx) return;
    x = num(x, 0); y0 = num(y0, 0); y1 = num(y1, y0 - 200);
    if (y1 > y0 - 20) y1 = y0 - 20;
    var o = opt || {}, t = num(o.t, 0), hw = 4.6, sway = Math.sin(t * 1.7) * 1.6;
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // base: a little mound of stones
    oval(ctx, x + 2, y0 + 2, 22, 6, 0, 'rgba(46,70,36,0.25)');
    [[-12, -2, 7, 5, '#B9B6AE'], [10, -1, 8, 5.5, '#A8A59C'], [-1, -4, 9, 6, '#C6C2B8']].forEach(function (s) {
      oval(ctx, x + s[0], y0 + s[1], s[2], s[3], 0, s[4]);
      ctx.strokeStyle = '#857F74'; ctx.lineWidth = 1.6; ctx.beginPath(); ell(ctx, x + s[0], y0 + s[1], s[2], s[3], 0); ctx.stroke();
      oval(ctx, x + s[0] - s[2] * 0.3, y0 + s[1] - s[3] * 0.4, s[2] * 0.35, s[3] * 0.25, 0, 'rgba(255,255,255,0.5)');
    });
    // pole
    var gp = ctx.createLinearGradient(x - hw, 0, x + hw, 0);
    gp.addColorStop(0, POST.light); gp.addColorStop(0.45, POST.base); gp.addColorStop(1, POST.dark);
    ctx.fillStyle = gp; ctx.beginPath(); rrect(ctx, x - hw, y1, hw * 2, y0 - y1 - 3, hw); ctx.fill();
    ctx.strokeStyle = rgba(POST.line, 0.45); ctx.lineWidth = 1; ctx.beginPath();
    for (var gy = y1 + 30; gy < y0 - 20; gy += 46) { ctx.moveTo(x - 1.5, gy); ctx.quadraticCurveTo(x + 0.5, gy + 9, x - 0.5, gy + 18); }
    ctx.stroke();
    ctx.strokeStyle = POST.line; ctx.lineWidth = 2.2; ctx.beginPath(); rrect(ctx, x - hw, y1, hw * 2, y0 - y1 - 3, hw); ctx.stroke();
    // cleat + rope (up and down lines on the right side of the pole)
    var cy = y0 - 46;
    ctx.fillStyle = POST.dark; ctx.beginPath(); rrect(ctx, x + hw - 1, cy - 3, 9, 6, 3); ctx.fill();
    ctx.strokeStyle = POST.line; ctx.lineWidth = 1.4; ctx.beginPath(); rrect(ctx, x + hw - 1, cy - 3, 9, 6, 3); ctx.stroke();
    [hw + 2.2, hw + 5.2].forEach(function (rx, i) {
      ctx.strokeStyle = '#9C8763'; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(x + rx, y1 + 4); ctx.quadraticCurveTo(x + rx + 3 + sway * (i + 1), (y1 + cy) / 2, x + rx, cy); ctx.stroke();
      ctx.strokeStyle = '#EDE2C8'; ctx.lineWidth = 1.2; ctx.stroke();
    });
    // pulley + golden knob
    dot(ctx, x + hw + 2.5, y1 + 4, 3.4, '#8E8A94');
    var kr = 7;
    dot(ctx, x, y1 - kr + 1, kr, GOLD);
    ctx.save(); ctx.beginPath(); circ(ctx, x, y1 - kr + 1, kr); ctx.clip();
    oval(ctx, x + 2.5, y1 - kr + 3.5, kr, kr, 0, '#DDB056');
    oval(ctx, x - 2.4, y1 - kr - 1.4, kr * 0.42, kr * 0.3, -0.6, 'rgba(255,255,255,0.9)');
    ctx.restore();
    ctx.strokeStyle = '#A57E2E'; ctx.lineWidth = 2; ctx.beginPath(); circ(ctx, x, y1 - kr + 1, kr); ctx.stroke();
    ctx.restore();
  }

  // ================================================================= LAUNCH PAD + FOOT PUMP
  var TEAL = { base: '#8FB8B2', dark: '#5E8580', light: '#C4DDD8', line: '#4C6E6A' };
  function hose(ctx, x0, y0, x1, y1, ground) {
    var sag = Math.max(y0, y1) + 10, mx = (x0 + x1) / 2;
    if (ground != null) sag = Math.max(sag, ground);
    var path = function () { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.bezierCurveTo(x0 + (mx - x0) * 0.4, sag + 6, x1 - (x1 - mx) * 0.4, sag + 6, x1, y1); };
    ctx.lineCap = 'round';
    path(); ctx.strokeStyle = 'rgba(40,60,36,0.25)'; ctx.lineWidth = 8; ctx.save(); ctx.translate(0, 3); ctx.stroke(); ctx.restore();
    path(); ctx.strokeStyle = '#3F4A48'; ctx.lineWidth = 7.5; ctx.stroke();
    path(); ctx.strokeStyle = '#6E7E7A'; ctx.lineWidth = 4.4; ctx.stroke();
    path(); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.4; ctx.save(); ctx.translate(-0.8, -1.2); ctx.stroke(); ctx.restore();
  }
  function drawPad(ctx, x, y, opt) {
    if (!ctx) return;
    x = num(x, 0); y = num(y, 0);
    var o = opt || {}, a = o.alpha == null ? 1 : clamp01(num(o.alpha, 1)); if (a <= 0.001) return;
    var aim = Math.max(-0.9, Math.min(0.9, num(o.aim, 0))), gy = y + 34, py = y + 10;
    ctx.save(); ctx.globalAlpha *= a; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    oval(ctx, x + 2, gy + 1, 40, 8, 0, 'rgba(46,70,36,0.25)');
    // hose to the pump
    var hx = o.hose && isFinite(+o.hose.x) && isFinite(+o.hose.y) ? +o.hose.x : x + 70, hy = o.hose && isFinite(+o.hose.y) ? +o.hose.y : gy;
    var side = hx >= x ? 1 : -1;
    hose(ctx, x + side * 16, y + 22, hx, hy, gy);
    // A-frame legs
    ctx.strokeStyle = POST.line; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(x - 20, py + 8); ctx.lineTo(x - 30, gy); ctx.moveTo(x + 20, py + 8); ctx.lineTo(x + 30, gy); ctx.stroke();
    ctx.strokeStyle = POST.base; ctx.lineWidth = 4.6; ctx.stroke();
    ctx.strokeStyle = POST.line; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x - 25, gy - 9); ctx.lineTo(x + 25, gy - 9); ctx.stroke();
    ctx.strokeStyle = POST.dark; ctx.lineWidth = 2.4; ctx.stroke();
    // the platform (two planks)
    ctx.translate(x, py);
    ctx.fillStyle = POST.base; ctx.beginPath(); rrect(ctx, -32, 0, 64, 12, 4); ctx.fill();
    ctx.fillStyle = POST.dark; ctx.fillRect(-30, 7, 60, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(-28, 1.5, 40, 2);
    ctx.strokeStyle = rgba(POST.line, 0.7); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(0, 0.5); ctx.lineTo(0, 11.5); ctx.stroke();
    ctx.strokeStyle = POST.line; ctx.lineWidth = 2.4; ctx.beginPath(); rrect(ctx, -32, 0, 64, 12, 4); ctx.stroke();
    dot(ctx, -24, 6, 1.6, POST.line); dot(ctx, 24, 6, 1.6, POST.line);
    // the launcher tube tilts about its hinge
    ctx.save(); ctx.rotate(aim);
    ctx.strokeStyle = TEAL.line; ctx.lineWidth = 11; ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(0, -48); ctx.stroke();
    ctx.strokeStyle = TEAL.base; ctx.lineWidth = 7; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(-1.6, -6); ctx.lineTo(-1.6, -45); ctx.stroke();
    ctx.fillStyle = TEAL.dark; ctx.beginPath(); rrect(ctx, -8, -16, 16, 7, 3); ctx.fill();   // the clamp collar under the nozzle
    ctx.strokeStyle = TEAL.line; ctx.lineWidth = 1.8; ctx.beginPath(); rrect(ctx, -8, -16, 16, 7, 3); ctx.stroke();
    ctx.restore();
    // hinge bracket
    ctx.fillStyle = '#A9A5B2'; ctx.beginPath(); rrect(ctx, -8, -5, 16, 9, 3); ctx.fill();
    ctx.strokeStyle = '#6E6A76'; ctx.lineWidth = 1.8; ctx.beginPath(); rrect(ctx, -8, -5, 16, 9, 3); ctx.stroke();
    dot(ctx, 0, -0.5, 2.6, '#6E6A76'); dot(ctx, -0.8, -1.3, 0.9, '#FFFFFF');
    ctx.restore();
  }
  var PUMPK = 1.35;
  function pumpHose(x, y) { return { x: num(x, 0) + 33 * PUMPK, y: num(y, 0) + 52 * PUMPK }; }
  function drawPump(ctx, x, y, opt) {
    if (!ctx) return;
    x = num(x, 0); y = num(y, 0);
    var o = opt || {}, a = o.alpha == null ? 1 : clamp01(num(o.alpha, 1)); if (a <= 0.001) return;
    var p = clamp01(o.press), glow = clamp01(o.glow), gauge = clamp01(o.gauge), cnt = Math.max(0, Math.min(3, Math.round(num(o.count, 0))));
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(x, y); ctx.scale(PUMPK, PUMPK); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (glow > 0.01) {
      var hg = ctx.createRadialGradient(0, 28, 10, 0, 28, 66);
      hg.addColorStop(0, 'rgba(255,226,140,' + (0.7 * glow).toFixed(3) + ')'); hg.addColorStop(1, 'rgba(255,210,100,0)');
      ctx.fillStyle = hg; ctx.beginPath(); circ(ctx, 0, 28, 66); ctx.fill();
    }
    oval(ctx, 2, 58, 50, 7, 0, 'rgba(46,70,36,0.28)');
    // base plate with the 3 count lights (left of the barrel) and the hose port (right)
    ctx.fillStyle = '#7C7884'; ctx.beginPath(); rrect(ctx, -47, 45, 94, 13, 6.5); ctx.fill();
    ctx.fillStyle = '#9C98A4'; ctx.beginPath(); rrect(ctx, -45, 45, 90, 5, 3); ctx.fill();
    ctx.strokeStyle = '#55515E'; ctx.lineWidth = 2.2; ctx.beginPath(); rrect(ctx, -47, 45, 94, 13, 6.5); ctx.stroke();
    var LX = [-39, -30, -21];
    LX.forEach(function (lx, i) {
      var on = i < cnt;
      if (on) { var lg = ctx.createRadialGradient(lx, 52, 1, lx, 52, 9); lg.addColorStop(0, 'rgba(255,230,150,0.95)'); lg.addColorStop(1, 'rgba(255,214,110,0)'); ctx.fillStyle = lg; ctx.beginPath(); circ(ctx, lx, 52, 9); ctx.fill(); }
      dot(ctx, lx, 52, 3.6, on ? GOLD : '#D9D2C2');
      ctx.strokeStyle = on ? '#A57E2E' : '#6E6A76'; ctx.lineWidth = 1.3; ctx.beginPath(); circ(ctx, lx, 52, 3.6); ctx.stroke();
      if (on) dot(ctx, lx - 1, 51, 1.1, '#FFFFFF');
    });
    // hose port (front, right of the lights)
    dot(ctx, 33, 52, 4.6, '#3F4A48'); dot(ctx, 33, 52, 2.1, '#1E2624');
    // barrel
    cel(ctx, 'pump.barrel', function (q) { rrect(q, -15, 20, 30, 30, 7); }, TEAL, { s: 3, line: TEAL.line, lw: 2.4, hl: [-8, 26, 2.6, 6, 0] });
    // gauge dial on the barrel
    var gx = 0, gyy = 35, gr = 9.5;
    dot(ctx, gx, gyy, gr + 2.2, '#B9B6C0'); dot(ctx, gx, gyy, gr, '#FBF6EA');
    ctx.strokeStyle = 'rgba(232,160,122,0.9)'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(gx, gyy, gr - 2.6, -Math.PI * 0.05, Math.PI * 0.25, false); ctx.stroke();
    ctx.strokeStyle = '#7C7884'; ctx.lineWidth = 1.1; ctx.beginPath();
    for (var i = 0; i <= 6; i++) { var ta = Math.PI * 0.75 + i / 6 * Math.PI * 1.5; ctx.moveTo(gx + Math.cos(ta) * (gr - 1), gyy + Math.sin(ta) * (gr - 1)); ctx.lineTo(gx + Math.cos(ta) * (gr - 3.6), gyy + Math.sin(ta) * (gr - 3.6)); }
    ctx.stroke();
    var na = Math.PI * 0.75 + gauge * Math.PI * 1.5;
    ctx.strokeStyle = '#A9634A'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(gx, gyy); ctx.lineTo(gx + Math.cos(na) * (gr - 2.4), gyy + Math.sin(na) * (gr - 2.4)); ctx.stroke();
    dot(ctx, gx, gyy, 1.9, '#55515E');
    ctx.strokeStyle = '#6E6A76'; ctx.lineWidth = 1.4; ctx.beginPath(); circ(ctx, gx, gyy, gr + 2.2); ctx.stroke();
    // rod + foot pad (moves down with press)
    var d = 13 * p;
    ctx.fillStyle = '#B9B6C0'; ctx.fillRect(-3.5, 6 + d, 7, Math.max(0, 15 - d));
    ctx.strokeStyle = '#6E6A76'; ctx.lineWidth = 1.4; ctx.strokeRect(-3.5, 6 + d, 7, Math.max(0, 15 - d));
    ctx.save(); ctx.translate(0, d); ctx.scale(1 + 0.06 * p, 1 - 0.1 * p);
    ctx.fillStyle = '#5B5560'; ctx.beginPath(); rrect(ctx, -26, 0, 52, 9, 4.5); ctx.fill();
    ctx.fillStyle = '#76707C'; ctx.beginPath(); rrect(ctx, -25, 0.5, 50, 3.4, 2); ctx.fill();
    ctx.strokeStyle = 'rgba(40,36,44,0.6)'; ctx.lineWidth = 1.2; ctx.beginPath();
    for (var r = -18; r <= 18; r += 6) { ctx.moveTo(r, 4); ctx.lineTo(r, 8); }
    ctx.stroke();
    ctx.strokeStyle = '#3E3A44'; ctx.lineWidth = 2; ctx.beginPath(); rrect(ctx, -26, 0, 52, 9, 4.5); ctx.stroke();
    if (glow > 0.01) { ctx.strokeStyle = 'rgba(255,220,120,' + (0.9 * glow).toFixed(3) + ')'; ctx.lineWidth = 3; ctx.beginPath(); rrect(ctx, -29, -3, 58, 15, 7); ctx.stroke(); }
    ctx.restore();
    ctx.restore();
  }

  // ================================================================= AIM ARC
  function drawArc(ctx, pts, opt) {
    if (!ctx || !pts || !pts.length) return;
    var o = opt || {}, a = o.alpha == null ? 1 : clamp01(num(o.alpha, 1)), t = num(o.t, 0); if (a <= 0.001) return;
    var P2 = [];
    pts.forEach(function (p) { var x = p && (p.x != null ? +p.x : +p[0]), y = p && (p.y != null ? +p.y : +p[1]); if (isFinite(x) && isFinite(y)) P2.push([x, y]); });
    var n = P2.length; if (!n) return;
    ctx.save();
    for (var pass = 0; pass < 2; pass++) {
      for (var i = 0; i < n; i++) {
        var f = n > 1 ? i / (n - 1) : 0, bump = 0.5 + 0.5 * Math.sin(t * 8 - i * 0.9);
        var r = (6 - 2.4 * f) * (1 + 0.2 * bump), al = a * (1 - 0.6 * f);
        ctx.globalAlpha = Math.max(0, Math.min(1, al));
        if (pass === 0) dot(ctx, P2[i][0] + 1.4, P2[i][1] + 2.6, r, 'rgba(36,52,40,0.28)');
        else { dot(ctx, P2[i][0], P2[i][1], r, '#FFFFFF'); dot(ctx, P2[i][0] - r * 0.3, P2[i][1] - r * 0.3, r * 0.3, 'rgba(220,236,240,0.9)'); }
      }
    }
    ctx.restore();
  }

  // ================================================================= WATER BITS
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
    ctx.fillStyle = 'rgba(230,246,248,0.9)'; ctx.beginPath(); drop(ctx); ctx.fill();
    ctx.fillStyle = 'rgba(155,205,215,0.7)'; ctx.beginPath(); ctx.arc(x, y, r * 0.78, 0.15, Math.PI - 0.15, false); ctx.fill();
    ctx.strokeStyle = 'rgba(70,130,145,0.85)'; ctx.lineWidth = Math.max(0.8, r * 0.24); ctx.beginPath(); drop(ctx); ctx.stroke();
    dot(ctx, x - r * 0.36, y - r * 0.3, Math.max(0.6, r * 0.3), '#FFFFFF');
    ctx.restore();
  }
  function drawPuddleRing(ctx, x, y, r, a) {
    if (!ctx) return;
    a = a == null ? 1 : clamp01(a); r = num(r, 20); if (a <= 0.001 || !(r > 0)) return;
    x = num(x, 0); y = num(y, 0);
    var f = 0.4, lw = Math.max(1.6, Math.min(5, r * 0.08));
    ctx.save(); ctx.globalAlpha *= a;
    ctx.fillStyle = 'rgba(185,221,227,0.28)'; ctx.beginPath(); ell(ctx, x, y, r * 0.92, r * f * 0.92, 0); ctx.fill();
    ctx.strokeStyle = 'rgba(60,96,70,0.25)'; ctx.lineWidth = lw; ctx.beginPath(); ell(ctx, x, y + lw * 0.8, r, r * f, 0); ctx.stroke();
    ctx.strokeStyle = 'rgba(236,248,250,0.95)'; ctx.lineWidth = lw; ctx.beginPath(); ell(ctx, x, y, r, r * f, 0); ctx.stroke();
    ctx.strokeStyle = 'rgba(185,221,227,0.8)'; ctx.lineWidth = lw * 0.6; ctx.beginPath(); ell(ctx, x, y, r * 0.66, r * f * 0.66, 0); ctx.stroke();
    ctx.restore();
  }

  // ================================================================= BURROW + ROCK (surprises)
  function drawBurrow(ctx, x, y, r) {
    if (!ctx) return;
    x = num(x, 0); y = num(y, 0); r = num(r, 40); if (!(r > 0)) return;
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.translate(x, y); ctx.scale(r / 40, r / 40);
    oval(ctx, 2, 6, 62, 20, 0, 'rgba(46,70,36,0.22)');
    // dirt mound ring
    ctx.fillStyle = '#A97E57'; ctx.beginPath(); ell(ctx, 0, 2, 58, 22, 0); ctx.fill();
    ctx.save(); ctx.beginPath(); ell(ctx, 0, 2, 58, 22, 0); ctx.clip();
    oval(ctx, -6, -4, 54, 17, 0, '#BF9469');
    oval(ctx, -26, -8, 12, 3.4, -0.1, 'rgba(255,240,215,0.5)');
    ctx.restore();
    ctx.strokeStyle = '#7A5636'; ctx.lineWidth = 2.6; ctx.beginPath(); ell(ctx, 0, 2, 58, 22, 0); ctx.stroke();
    // the hole
    var hg = ctx.createRadialGradient(0, 2, 4, 0, 0, 40);
    hg.addColorStop(0, '#1E140E'); hg.addColorStop(1, '#4A3424');
    ctx.fillStyle = hg; ctx.beginPath(); ell(ctx, 0, 0, 40, 15, 0); ctx.fill();
    ctx.strokeStyle = '#6A4A2E'; ctx.lineWidth = 2.4; ctx.beginPath(); ell(ctx, 0, 0, 40, 15, 0); ctx.stroke();
    // the front lip
    ctx.strokeStyle = '#C79C70'; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.ellipse(0, 1, 40, 15, 0, 0.25, Math.PI - 0.25, false); ctx.stroke();
    // pebbles + grass tufts
    [[-44, 10, 4], [46, 8, 3.2], [30, 18, 2.6], [-28, 19, 2.4]].forEach(function (p) {
      oval(ctx, p[0], p[1], p[2] * 1.3, p[2], 0, '#C9C3B4'); ctx.strokeStyle = '#8E8676'; ctx.lineWidth = 1.2; ctx.beginPath(); ell(ctx, p[0], p[1], p[2] * 1.3, p[2], 0); ctx.stroke();
    });
    ctx.strokeStyle = '#6F9A5E'; ctx.lineWidth = 3;
    ctx.beginPath();
    [[-60, 8], [-54, 14], [56, 12], [62, 6]].forEach(function (g, i) {
      ctx.moveTo(g[0], g[1]); ctx.quadraticCurveTo(g[0] + (i % 2 ? 4 : -4), g[1] - 8, g[0] + (i % 2 ? 2 : -6), g[1] - 15);
      ctx.moveTo(g[0] + 3, g[1]); ctx.quadraticCurveTo(g[0] + 5, g[1] - 6, g[0] + 9, g[1] - 11);
    });
    ctx.stroke();
    ctx.restore();
  }
  function rockTop(w) { return num(w, 120) * 0.42; }
  var rockP = function (t) {
    smooth(t, [[-50, 0], [-48, -18], [-38, -36], [-16, -43], [14, -44], [36, -38], [48, -22], [52, -4], [40, 2], [0, 3], [-40, 2]]);
  };
  function drawRock(ctx, x, y, w) {
    if (!ctx) return;
    x = num(x, 0); y = num(y, 0); w = num(w, 120); if (!(w > 0)) return;
    var k = w / 100;
    ctx.save(); ctx.translate(x, y); ctx.scale(k, k); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    oval(ctx, 3, 1, 56, 8, 0, 'rgba(46,70,36,0.25)');
    var ROCK = { base: '#AEB3BE', dark: '#8A91A0', light: '#D6DAE2' };
    cel(ctx, 'rock.body', rockP, ROCK, {
      s: 6, line: '#6E7584', lw: 2.8, hl: [-18, -34, 16, 4, -0.1],
      inner: function (g) {
        g.fillStyle = 'rgba(214,218,226,0.9)'; g.beginPath(); ell(g, -2, -39, 34, 5.5, 0); g.fill();   // the flat top where the goat stands
        g.strokeStyle = 'rgba(110,117,132,0.55)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(14, -30); g.lineTo(20, -18); g.lineTo(16, -8); g.moveTo(-30, -16); g.lineTo(-22, -10); g.stroke();
        oval(g, -36, -6, 10, 4, 0.2, 'rgba(143,180,122,0.85)'); oval(g, 30, -40, 7, 2.6, 0, 'rgba(143,180,122,0.8)');
      }
    });
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
            var dx = (i - (cnt - 1) / 2) * 16, dy = rows.length === 1 ? 25 : 18 + ri * 16;
            pinecone(ctx, dx, dy, dr + 1);
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
    if (!scratch) { try { scratch = makeCanvas(W, H); } catch (e) { scratch = null; } }
    if (!scratch) { ctx.save(); ctx.globalAlpha *= alpha; fn(ctx); ctx.restore(); return; }
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
    // cuff: Mimi's khaki bucket-hat band
    ctx.fillStyle = '#C9B48A'; ctx.strokeStyle = '#7A6544'; ctx.lineWidth = s * 0.03;
    ctx.beginPath(); rrect(ctx, -s * 0.25, s * 0.76, s * 0.46, s * 0.14, s * 0.06); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(138,115,80,0.8)';
    [-0.15, -0.03, 0.09].forEach(function (dx) { ctx.beginPath(); circ(ctx, s * dx, s * 0.83, s * 0.018); ctx.fill(); });
    ctx.restore();
  }

  function clearCache() { pcache = {}; pN = 0; bcache = {}; lcache = {}; scache = {}; sN = 0; lineMemo = {}; }

  DK.MatArt = {
    drawMat: drawMat, drawThing: drawThing, drawPennant: drawPennant, drawPole: drawPole, drawPad: drawPad, drawPump: drawPump,
    drawArc: drawArc, drawDrop: drawDrop, drawPuddleRing: drawPuddleRing, drawHomeBadge: drawHomeBadge, drawIcon: drawIcon,
    drawHintHand: drawHintHand, drawBurrow: drawBurrow, drawRock: drawRock,
    dotLayout: function (n, numeral) { return dotLayout(n, numeral); }, thingTop: thingTop, pennantH: pennantH, rockTop: rockTop,
    matRy: matRy, pumpHose: pumpHose, variant: matVariant,
    pal: function (n) { return pal(n) || null; }, lineOf: function (c) { var p = typeof c === 'string' ? pal(c) : c; return p ? lineOf(p) : null; },
    contrast: contrast, PALETTE: FALLBACK, MAT: MAT, GOLD: GOLD, SIGN: SIGN, CONE: CONE, WATER: WATER, FONT: FONT, INK: INK,
    OBJS: OBJS, SHAPES: SHAPES, ANIMALS: ANIMALS, HOMES: HOMES, KINDS: KINDS, SMALL: SMALL,
    thingKey: thingKey, clearCache: clearCache, stats: stats
  };
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
