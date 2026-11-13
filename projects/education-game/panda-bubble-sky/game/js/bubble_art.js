/* Bao's Bubble Sky — PB.BubbleArt (character artist B), DESIGN §3 / §4.3. Everything here is canvas code. Origin = the CENTRE.
 *
 *   drawBubble(ctx, r, opt)            a soap bubble of radius r. opt = { wob 0..0.3, wobA (rad), t (s), glow 0..1, frost 0..1,
 *                                      alpha 0..1, grow 0..1 (1 = free; < 1 = still on the wand: flattened, thicker film),
 *                                      pop 0..1 (> 0: the rupture ring instead of the film), part: 'back' | 'front' | (both) }
 *                                      Render as back → thing → front so the highlight sits OVER the thing (glass feel);
 *                                      with no `part` both are drawn (the highlight then sits under the thing).
 *   drawThing(ctx, thing, size, opt)   size = box height in px (recommend size = 1.2·r inside a bubble);
 *                                      opt = { glow 0..1, wiggle −1..1 (no-no wiggle: rotation ±0.35 rad), night, count −1..n
 *                                      (stars: the first `count` stars are lit while counted aloud), maxN (stars: the round's
 *                                      largest n — every bubble then uses the same star size, so star size is never a clue),
 *                                      direct (true: vector, no bitmap cache) }
 *       thing = { kind 'toy'|'shape'|'stars'|'tile'|'animal', color?, obj?, shape?, n?, animal?, text?, big? }; big:false → ×0.6
 *   drawRainbow(ctx, rb, k, filled, opt)  rb = { cx, cy, r, w }; k pieces by angle from the LEFT foot; opt = { shine, alpha, guide }
 *   rainbowPoint(rb, k, f)             → { x, y, a } leading-edge point (band middle) at fill f (0..k)
 *   drawDrop(ctx, x, y, r, a) · drawMiniBubble(ctx, x, y, r, a) · drawSnowflake(ctx, r, rot, a) (centred at the origin)
 *   drawHomeBadge(ctx, home, r, opt)   farm|sea|ice|jungle|savanna; opt { a, pop }
 *   drawIcon(ctx, choice, size)        any thing, {kind:'color'}, {kind:'number', n}, {kind:'home'}, {kind:'size', big, thing?},
 *                                      {kind:'letter', text}; centred in a size × size box
 *   drawHintHand(ctx, x, y, press, alpha, size?)  fingertip at (x, y), points UP-LEFT
 *   starLayout(n, maxN?) → { n, rs, pts:[[x,y]] } in the 100-unit thing box (pts in reading order = counting order)
 *   Helpers: pal, PALETTE, STAR, RAINBOW, TOYS, SHAPES, ANIMALS, HOMES, KINDS, SMALL, thingKey, clearCache, stats
 *
 * Things are designed in a 100-unit box (x −50..50, y −50..50). Path2D cached per part (size independent). In a browser things
 * are rasterised once per thing + device-px bucket (×1.1 steps) with a white sticker edge, and the bubble film / shine are
 * rasterised once per device-radius bucket; per frame a bubble is ~2 drawImage + a few strokes. Node-safe at load (no DOM);
 * without `document` everything is drawn as vectors (unit tests).
 */
(function (G) {
  'use strict';
  var PB = G.PB = G.PB || {};

  var TAU = Math.PI * 2, LW = 3.4;
  var FONT = 'ui-rounded, "Arial Rounded MT Bold", "SF Pro Rounded", Nunito, system-ui, sans-serif';
  var FALLBACK = {
    red:    { base: '#E84A4A', dark: '#A8282E', light: '#F7A0A0' },
    blue:   { base: '#3C8DE8', dark: '#1F5BA8', light: '#A6CCF5' },
    yellow: { base: '#FFD23F', dark: '#C99A12', light: '#FFEB9C' },
    green:  { base: '#4CC26B', dark: '#2A8343', light: '#A8E6B8' },
    orange: { base: '#FF9A2E', dark: '#C4650C', light: '#FFCB8E' },
    purple: { base: '#8E44AD', dark: '#6840A8', light: '#D2BDF3' },
    pink:   { base: '#FF8FC0', dark: '#C9558A', light: '#FFCCE2' }
  };
  var STAR = { base: '#FFC23A', dark: '#C98A12', light: '#FFE6A0' };
  var RAINBOW = ['#F6A6A6', '#F8C49A', '#F7E19A', '#B9E3A8', '#A9D2F2', '#B9B2EE', '#E2B6E8'];
  var IRIS = ['#7FD6F2', '#B9A2F2', '#F5A8D8', '#FFC79A', '#D4EE9C', '#9EE6D0', '#7FD6F2'];   // thin-film pastels
  var WOOD = { base: '#C8A27A', dark: '#8E6B45', light: '#E6CBA8' };
  var TYRE = { base: '#4A4452', dark: '#2E2A34', light: '#7A7484' };
  var GLASS = { base: '#EAF6FA', dark: '#B9D4DF', light: '#FFFFFF' };
  var CARD = { base: '#FFFFFF', dark: '#E3E8F2', light: '#FFFFFF' };
  var INK = '#3A3640';
  var TOYS = ['ball', 'duck', 'umbrella', 'kite', 'car'];
  var SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'oval', 'rect', 'diamond'];
  var ANIMALS = ['cow', 'pig', 'sheep', 'duck', 'hen', 'horse', 'goat', 'crab', 'penguin', 'lion', 'monkey', 'fishbowl'];
  var HOMES = ['farm', 'sea', 'ice', 'jungle', 'savanna'];
  var KINDS = ['toy', 'shape', 'stars', 'tile', 'animal'];
  var SMALL = 0.6;

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
    var P = PB.PALETTE, c = P && P[name] && okHex(P[name].base) && okHex(P[name].dark) && okHex(P[name].light) ? P[name] : FALLBACK[name];
    return c || null;
  }
  function lineOf(c) { return c.base === '#FFD23F' ? '#B0850A' : c.base === '#FF8FC0' ? '#B84A7E' : c.dark; }
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
  function line(ctx, pts, col, w) {
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.stroke();
  }
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
  var stats = { thingBuilt: 0, filmBuilt: 0, thingHit: 0, filmHit: 0 };
  var scache = {}, sN = 0;          // bitmap cache (things + film), cleared when it grows past 220 entries
  function sget(key) { var c = scache[key]; if (c) return c; return null; }
  function sput(key, c) { if (sN > 220) { scache = {}; sN = 0; } scache[key] = c; sN++; return c; }

  // ================================================================= TOYS (painted in the answer colour)
  var TOY = {};
  // ---- ball
  var blBody = function (t) { circ(t, 0, 0, 40); };
  TOY.ball = {
    sil: blBody,
    draw: function (ctx, c) {
      cel(ctx, 'bl.body', blBody, c, {
        s: 6, hl: false,
        inner: function (x) {
          // one wide curved stripe in the light tint of the SAME colour + two seams: reads as a toy ball, still one colour
          x.fillStyle = mix(c.base, c.light, 0.55);
          x.beginPath(); x.moveTo(-46, -2); x.bezierCurveTo(-20, -24, 22, -26, 46, -8); x.lineTo(46, 10); x.bezierCurveTo(22, -8, -20, -6, -46, 16); x.closePath(); x.fill();
          x.strokeStyle = rgba(c.dark, 0.55); x.lineWidth = 2.2;
          x.beginPath(); x.moveTo(-46, -2); x.bezierCurveTo(-20, -24, 22, -26, 46, -8); x.moveTo(-46, 16); x.bezierCurveTo(-20, -6, 22, -8, 46, 10); x.stroke();
          oval(x, -16, -22, 9, 5, -0.6, 'rgba(255,255,255,0.85)');
          dot(x, -4, -29, 2.6, 'rgba(255,255,255,0.8)');
        }
      });
    }
  };
  // ---- rubber duck (facing right)
  var dkBody = function (t) {
    t.moveTo(-46, -8);
    t.bezierCurveTo(-46, 14, -36, 38, -6, 38);
    t.bezierCurveTo(26, 38, 42, 26, 42, 10);
    t.bezierCurveTo(42, -2, 30, -6, 18, -4);
    t.lineTo(-14, -2);
    t.bezierCurveTo(-26, -2, -36, -4, -46, -8);
    t.closePath();
  };
  var dkHead = function (t) { circ(t, 14, -20, 21); };
  var dkBeak = function (t) { rpoly(t, [[30, -24], [47, -18], [45, -10], [30, -10]], [3, 5, 4, 3]); };
  var dkWing = function (t) { t.moveTo(-18, 10); t.bezierCurveTo(-8, -2, 12, 2, 16, 12); t.bezierCurveTo(6, 24, -12, 22, -18, 10); t.closePath(); };
  TOY.duck = {
    sil: function (t) { dkBody(t); dkHead(t); dkBeak(t); },
    draw: function (ctx, c) {
      cel(ctx, 'dk.body', dkBody, c, { s: 5, hl: [-24, 8, 7, 4, -0.4] });
      cel(ctx, 'dk.wing', dkWing, c, { s: 2.4, hl: false, shade: c.dark, line: lineOf(c), lw: 2.6 });
      cel(ctx, 'dk.head', dkHead, c, { s: 4, hl: [6, -32, 6, 3.6, -0.6] });
      eye(ctx, 20, -24, 4.6);
      oval(ctx, 26, -12, 4.2, 2.6, 0, rgba(mix(c.light, '#FFFFFF', 0.3), 0.9));
      // beak drawn after the head so it sits in front
      cel(ctx, 'dk.beak', dkBeak, { base: '#FBDDB0', dark: '#E2B57E', light: '#FFF4E0' }, { s: 1.6, line: '#B98A5A', lw: 2.6, hl: false });
      line(ctx, [31, -17, 44, -15], '#C99A6A', 1.6);
    }
  };
  // ---- umbrella
  var umCanopy = function (t) {
    t.moveTo(-46, 4);
    t.bezierCurveTo(-46, -28, -24, -40, 0, -40);
    t.bezierCurveTo(24, -40, 46, -28, 46, 4);
    for (var i = 0; i < 4; i++) { var x0 = 46 - 23 * i, x1 = x0 - 23; t.quadraticCurveTo((x0 + x1) / 2, -8, x1, 4); }
    t.closePath();
  };
  var umShaft = function (t) { t.moveTo(0, 0); t.lineTo(0, 34); t.arc(-8, 34, 8, 0, Math.PI, false); };
  TOY.umbrella = {
    sil: function (t) { umCanopy(t); rrect(t, -19, -2, 23, 48, 6); circ(t, 0, -44, 5); },
    draw: function (ctx, c) {
      ctx.lineCap = 'round';
      ctx.strokeStyle = WOOD.dark; ctx.lineWidth = 7.4; strokeP(ctx, P('um.shaft', umShaft));
      ctx.strokeStyle = WOOD.base; ctx.lineWidth = 3.8; strokeP(ctx, P('um.shaft', umShaft));
      cel(ctx, 'um.tip', function (t) { circ(t, 0, -43, 4.6); }, WOOD, { s: 1, line: WOOD.dark, lw: 2.4, hl: false });
      cel(ctx, 'um.canopy', umCanopy, c, {
        s: 5, hl: [-20, -26, 9, 4, -0.5],
        inner: function (x) {
          // alternate panels slightly lighter (same hue) + ribs
          x.fillStyle = rgba(c.light, 0.45);
          x.beginPath(); x.moveTo(0, -40); x.quadraticCurveTo(-14, -20, -23, 4); x.lineTo(0, 4); x.closePath();
          x.moveTo(0, -40); x.quadraticCurveTo(30, -26, 46, 4); x.lineTo(23, 4); x.closePath(); x.fill();
          x.strokeStyle = rgba(c.dark, 0.55); x.lineWidth = 2.2;
          x.beginPath(); x.moveTo(0, -40); x.quadraticCurveTo(-14, -20, -23, 4); x.moveTo(0, -40); x.lineTo(0, 4); x.moveTo(0, -40); x.quadraticCurveTo(14, -20, 23, 4); x.stroke();
        }
      });
    }
  };
  // ---- little kite
  var ktBody = function (t) { rpoly(t, [[6, -50], [40, -12], [6, 26], [-28, -12]], [5, 5, 5, 5]); };
  var ktTail = function (t) { t.moveTo(6, 26); t.bezierCurveTo(6, 36, -6, 36, -12, 41); t.bezierCurveTo(-16, 46, -24, 45, -30, 50); };
  function bow(ctx, x, y, a, c, key) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    cel(ctx, 'kt.bow', function (t) { rpoly(t, [[0, 0], [-9, -6], [-9, 6]], 2); rpoly(t, [[0, 0], [9, -6], [9, 6]], 2); }, c, { s: 1, line: lineOf(c), lw: 2, hl: false });
    dot(ctx, 0, 0, 2.4, lineOf(c));
    ctx.restore();
  }
  TOY.kite = {
    sil: function (t) { ktBody(t); circ(t, -12, 40, 9); circ(t, -28, 49, 9); },
    draw: function (ctx, c) {
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#8B8794'; ctx.lineWidth = 2.2; strokeP(ctx, P('kt.tail', ktTail));
      cel(ctx, 'kt.body', ktBody, c, {
        s: 4, hl: false,
        inner: function (x) {
          x.fillStyle = rgba(c.light, 0.55);
          x.beginPath(); x.moveTo(6, -50); x.lineTo(6, -12); x.lineTo(-28, -12); x.closePath(); x.moveTo(6, -12); x.lineTo(40, -12); x.lineTo(6, 26); x.closePath(); x.fill();
          x.strokeStyle = rgba(c.dark, 0.7); x.lineWidth = 2.6;
          x.beginPath(); x.moveTo(6, -50); x.lineTo(6, 26); x.moveTo(-28, -12); x.lineTo(40, -12); x.stroke();
          oval(x, -5, -26, 5.5, 2.8, -0.8, 'rgba(255,255,255,0.75)');
        }
      });
      bow(ctx, -12, 40, -0.3, c); bow(ctx, -28, 49, 0.2, c);
    }
  };
  // ---- toy car (facing right)
  var crBody = function (t) { rrect(t, -46, -6, 92, 28, 11); };
  var crCab = function (t) { rpoly(t, [[-26, -4], [-16, -32], [14, -32], [30, -4]], [3, 8, 8, 3]); };
  var crWinA = function (t) { rpoly(t, [[-20, -8], [-13, -27], [-3, -27], [-3, -8]], [2, 3, 2, 2]); };
  var crWinB = function (t) { rpoly(t, [[2, -8], [2, -27], [11, -27], [23, -8]], [2, 2, 3, 2]); };
  function wheel(ctx, x, key) {
    cel(ctx, key, function (t) { circ(t, x, 24, 13); }, TYRE, { s: 2, line: TYRE.dark, lw: 2.6, hl: false });
    cel(ctx, key + 'h', function (t) { circ(t, x, 24, 6); }, { base: '#E9E8EE', dark: '#B9B6C4', light: '#FFFFFF' }, { s: 1.2, line: '#8B8794', lw: 1.8, hl: false });
  }
  TOY.car = {
    sil: function (t) { crBody(t); crCab(t); circ(t, -25, 24, 13); circ(t, 25, 24, 13); },
    draw: function (ctx, c) {
      ctx.save(); ctx.translate(0, -3);
      cel(ctx, 'cr.cab', crCab, c, { s: 3.4, hl: false });
      cel(ctx, 'cr.winA', crWinA, GLASS, { s: 1.4, line: lineOf(c), lw: 2.2, hl: false,
        inner: function (x) { x.fillStyle = '#FFFFFF'; x.beginPath(); x.moveTo(-15, -12); x.lineTo(-10, -24); x.lineTo(-7, -24); x.lineTo(-12, -12); x.closePath(); x.fill(); } });
      cel(ctx, 'cr.winB', crWinB, GLASS, { s: 1.4, line: lineOf(c), lw: 2.2, hl: false });
      cel(ctx, 'cr.body', crBody, c, { s: 4.4, hl: [-26, -1, 12, 2.6, 0],
        inner: function (x) {
          x.strokeStyle = rgba(c.dark, 0.5); x.lineWidth = 2; x.beginPath(); x.moveTo(-1, -4); x.lineTo(-1, 14); x.stroke();
          x.fillStyle = rgba(c.dark, 0.55); x.fillRect(4, 3, 7, 2.4);
        } });
      oval(ctx, 41, 2, 4, 5, 0, '#FFF3C4'); ctx.strokeStyle = lineOf(c); ctx.lineWidth = 1.6; ctx.beginPath(); ell(ctx, 41, 2, 4, 5, 0); ctx.stroke();
      oval(ctx, -43, 2, 2.6, 4, 0, '#FFE1D6');
      wheel(ctx, -25, 'cr.w1'); wheel(ctx, 25, 'cr.w2');
      ctx.restore();
    }
  };
  function toyOf(th) { return TOY[th.obj] ? th.obj : 'ball'; }

  // ================================================================= SHAPES (chunky cookies / gems)
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
    circle:   function (t) { circ(t, 0, -2, 38); },
    square:   function (t) { rrect(t, -35, -37, 70, 70, 9); },
    triangle: function (t) { rpoly(t, [[0, -44], [46, 34], [-46, 34]], [9, 8, 8]); },
    star:     function (t) { rpoly(t, starPts(0, 2, 46, 20.5), [5, 2.5, 5, 2.5, 5, 2.5, 5, 2.5, 5, 2.5]); },
    heart:    heartS,
    oval:     function (t) { ell(t, 0, -2, 26, 40, 0); },
    rect:     function (t) { rrect(t, -46, -26, 92, 48, 9); },
    diamond:  function (t) { rpoly(t, [[0, -46], [33, -2], [0, 42], [-33, -2]], [7, 6, 7, 6]); }
  };
  function shapeOf(th) { return SHP[th.shape] ? th.shape : 'circle'; }
  var DEPTH = [0, 5];   // cookie thickness: the side shows below
  function drawShape(ctx, th, c) {
    var s = shapeOf(th), key = 'shp.' + s, b = SHP[s];
    ctx.save(); ctx.translate(DEPTH[0], DEPTH[1]);
    ctx.fillStyle = mix(c.base, c.dark, 0.6); fillP(ctx, P(key, b));
    ctx.strokeStyle = lineOf(c); ctx.lineWidth = LW; strokeP(ctx, P(key, b));
    ctx.restore();
    ctx.save(); ctx.translate(DEPTH[0] / 2, DEPTH[1] / 2);
    ctx.strokeStyle = mix(c.base, c.dark, 0.6); ctx.lineWidth = 5.4; strokeP(ctx, P(key, b));
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

  // ================================================================= STARS (n = 1..12, golden, counted)
  var ROWOPT = {
    1: [[1]], 2: [[2]], 3: [[1, 2]], 4: [[2, 2]], 5: ['dice'], 6: [[3, 3], [2, 2, 2]], 7: [[2, 3, 2]], 8: [[3, 2, 3], [4, 4]],
    9: [[3, 3, 3]], 10: [[3, 4, 3], [2, 3, 3, 2]], 11: [[4, 3, 4], [3, 4, 4]], 12: [[4, 4, 4], [2, 4, 4, 2], [3, 3, 3, 3]]
  };
  var HX = 2.36, HY = 2.18, RC = 45;   // centre spacing in star radii (gap ≥ 0.36 rs: every star clearly separate)
  var lcache = {};
  function unitPts(rows) {
    if (rows === 'dice') { var d = 1.72; return [[-d, -d], [d, -d], [0, 0], [-d, d], [d, d]]; }
    var pts = [], nr = rows.length;
    rows.forEach(function (cnt, ri) { for (var i = 0; i < cnt; i++) pts.push([(i - (cnt - 1) / 2) * HX, (ri - (nr - 1) / 2) * HY]); });
    return pts;
  }
  function fitRs(pts) { var m = 0; pts.forEach(function (p) { m = Math.max(m, Math.hypot(p[0], p[1] * 1.04)); }); return RC / (m + 1.02); }
  function starLayoutU(n) {
    n = Math.max(1, Math.min(12, Math.round(num(n, 1))));
    if (lcache[n]) return lcache[n];
    var best = null;
    ROWOPT[n].forEach(function (rows) { var u = unitPts(rows), rs = fitRs(u); if (!best || rs > best.rs + 0.4) best = { u: u, rs: rs }; });
    var rs = n === 1 ? 34 : Math.min(best.rs, 22);
    return (lcache[n] = { n: n, rs: rs, u: best.u });
  }
  function starLayout(n, maxN) {
    var L = starLayoutU(n), rs = L.rs;
    if (num(maxN, 0) >= 1 && L.n > 1) rs = Math.min(rs, starLayoutU(Math.max(2, maxN)).rs);
    if (num(maxN, 0) >= 2 && L.n === 1) rs = Math.min(rs, starLayoutU(maxN).rs * 1.25);
    return { n: L.n, rs: rs, pts: L.u.map(function (p) { return [p[0] * rs, p[1] * rs]; }) };
  }
  function starPath(L) {
    return function (t) { L.pts.forEach(function (p) { rpoly(t, starPts(p[0], p[1] + L.rs * 0.06, L.rs, L.rs * 0.5), L.rs * 0.14); }); };
  }
  function drawStars(ctx, th, o) {
    var L = starLayout(th.n, o.maxN), key = 'stars.' + L.n + '.' + Math.round(L.rs * 100), b = starPath(L);
    var lw = Math.max(1.6, Math.min(3.4, L.rs * 0.17));
    // soft cream backing disc (keeps tiny stars readable through the film)
    var bg = ctx.createRadialGradient(0, 0, 20, 0, 0, 50);
    bg.addColorStop(0, 'rgba(255,250,232,0.6)'); bg.addColorStop(0.75, 'rgba(255,250,232,0.45)'); bg.addColorStop(1, 'rgba(255,250,232,0)');
    ctx.fillStyle = bg; ctx.beginPath(); circ(ctx, 0, 0, 50); ctx.fill();
    cel(ctx, key, b, STAR, { s: Math.max(1, L.rs * 0.16), line: STAR.dark, lw: lw, hl: false,
      inner: function (x) { L.pts.forEach(function (p) { oval(x, p[0] - L.rs * 0.22, p[1] - L.rs * 0.2, L.rs * 0.2, L.rs * 0.12, -0.6, 'rgba(255,248,215,0.95)'); }); } });
  }
  function drawStarCount(ctx, th, o, count) {   // lit stars (vector overlay, never cached)
    var L = starLayout(th.n, o.maxN), n = Math.min(count, L.n);
    for (var i = 0; i < n; i++) {
      var p = L.pts[i];
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = Math.max(2, L.rs * 0.22);
      ctx.beginPath(); circ(ctx, p[0], p[1], L.rs * 1.22); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,200,70,0.9)'; ctx.lineWidth = Math.max(1, L.rs * 0.1);
      ctx.beginPath(); circ(ctx, p[0], p[1], L.rs * 1.22); ctx.stroke();
      sparkle(ctx, p[0] + L.rs * 0.75, p[1] - L.rs * 0.75, L.rs * 0.45, '#FFFFFF');
    }
  }

  // ================================================================= TILE (round cloud card + glyphs)
  var PUFFS = [[-30, 12, 19], [30, 12, 19], [-26, -12, 20], [26, -12, 20], [-8, -24, 22], [12, -24, 21], [0, 18, 24], [-14, 20, 18], [14, 20, 18]];
  var tlCard = function (t) { rrect(t, -42, -26, 84, 56, 24); PUFFS.forEach(function (p) { circ(t, p[0], p[1], p[2]); }); };
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
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.6, px * 0.05);
    ctx.fillStyle = col; ctx.fillText(txt, x, by); if (ctx.strokeText) ctx.strokeText(txt, x, by);
  }
  function drawTile(ctx, th) {
    var txt = tileText(th), p = P('tl.card', tlCard);
    // outline as a fat stroke under the fill → only the outer edge of the puff union shows
    ctx.strokeStyle = '#A9B3C9'; ctx.lineWidth = LW * 2; strokeP(ctx, p);
    ctx.fillStyle = CARD.base; fillP(ctx, p);
    ctx.save(); clipP(ctx, p);
    ctx.fillStyle = CARD.dark; ctx.fillRect(-60, -60, 120, 120);
    ctx.translate(-3, -4); ctx.fillStyle = CARD.base; fillP(ctx, p); ctx.translate(3, 4);
    oval(ctx, -20, -30, 10, 4, -0.4, 'rgba(255,255,255,1)');
    ctx.restore();
    var n = txt.length;
    signText(ctx, txt, 0, 1, n <= 1 ? 60 : n <= 2 ? 72 : 82, n <= 1 ? 42 : n <= 2 ? 36 : n <= 3 ? 30 : 24, INK);
  }

  // ================================================================= ANIMALS (images by the animal artist; placeholder)
  var ANC = {
    cow: ['#F4EFE6', '#8C7A6A'], pig: ['#F2B8B0', '#B87870'], sheep: ['#F3EEE4', '#9A8E80'], duck: ['#F6F2E6', '#A8A08A'],
    hen: ['#E9C9A2', '#9C7650'], horse: ['#B98A62', '#6E4E34'], goat: ['#E3D8C6', '#8E7E66'], crab: ['#E08A6E', '#9A4E3A'],
    penguin: ['#4A5268', '#2A3042'], lion: ['#E2B46E', '#9A7038'], monkey: ['#A87A56', '#6A4A30'], fishbowl: ['#CFE8F2', '#6E98AC']
  };
  var anBody = function (t) { ell(t, -6, 4, 34, 23, 0); };
  var anHead = function (t) { circ(t, 24, -20, 20); };
  var anLegs = function (t) { rrect(t, -30, 14, 10, 30, 5); rrect(t, -12, 14, 10, 30, 5); rrect(t, 6, 14, 10, 30, 5); rrect(t, 18, 14, 10, 30, 5); };
  function animalOf(th) { return ANC[th.animal] ? th.animal : 'cow'; }
  function assetImg(key, px) {
    var A = PB.Assets;
    if (!A) return null;
    try {
      if (typeof A.has === 'function' && typeof A.sprite === 'function' && A.has(key)) { var s = A.sprite(key, px); if (s) return s; }
      if (typeof A.img === 'function') { var i = A.img(key); if (i) return i; }
      if (A.images && A.images[key]) return A.images[key];
    } catch (e) { /* placeholder */ }
    return null;
  }
  function drawAnimal(ctx, th, img) {
    if (img) { ctx.drawImage(img, -53, -56, 106, 106); return; }   // SVG 200 box, body ≈ y 14..194 → centred
    var c = ANC[animalOf(th)], C = { base: c[0], dark: c[1], light: '#FFFFFF' };
    cel(ctx, 'an.legs', anLegs, C, { s: 1.6, line: c[1], lw: 2.6, hl: false });
    cel(ctx, 'an.body', anBody, C, { s: 4, line: c[1], lw: 3 });
    cel(ctx, 'an.head', anHead, C, { s: 3, line: c[1], lw: 3 });
    eye(ctx, 30, -23, 3.6);
    oval(ctx, 34, -14, 3.6, 2.2, 0, rgba('#F2A99A', 0.85));
  }

  // ================================================================= PUBLIC: things
  function kindOf(th) { return KINDS.indexOf(th && th.kind) >= 0 ? th.kind : 'toy'; }
  function colOf(th, d) { return pal(th.color) || FALLBACK[d || 'red']; }
  function thingKey(t) {
    if (!t) return '?';
    return [t.kind, t.color || '', t.obj || '', t.shape || '', t.n != null ? t.n : '', t.animal || '', t.text != null ? t.text : '', t.big === false ? 's' : ''].join(':');
  }
  /** the thing at design scale (100-unit box, centred); img = the animal image (or null) */
  function thingBody(ctx, th, o, img) {
    var k = kindOf(th);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (k === 'toy') TOY[toyOf(th)].draw(ctx, colOf(th));
    else if (k === 'shape') drawShape(ctx, th, colOf(th, 'blue'));
    else if (k === 'stars') drawStars(ctx, th, o);
    else if (k === 'tile') drawTile(ctx, th);
    else drawAnimal(ctx, th, img);
  }
  var PADU = 16;   // design-unit padding around the 100 box in the sprite
  var scrA = null, scrB = null;
  function buildThingSprite(th, o, img, devPx) {
    var u = devPx / 100, S = Math.ceil((100 + 2 * PADU) * u);
    if (!scrA) { scrA = makeCanvas(S, S); scrB = makeCanvas(S, S); }
    if (scrA.width < S || scrA.height < S) { scrA.width = scrA.height = scrB.width = scrB.height = Math.max(S, scrA.width); }
    var a = scrA.getContext('2d'), b = scrB.getContext('2d');
    if (!a || !b) return null;
    a.setTransform(1, 0, 0, 1, 0, 0); a.clearRect(0, 0, scrA.width, scrA.height);
    a.setTransform(u, 0, 0, u, S / 2, S / 2);
    thingBody(a, th, o, img);
    a.setTransform(1, 0, 0, 1, 0, 0);
    // white silhouette → dilated sticker edge
    b.setTransform(1, 0, 0, 1, 0, 0); b.globalCompositeOperation = 'source-over'; b.clearRect(0, 0, scrB.width, scrB.height);
    b.drawImage(scrA, 0, 0); b.globalCompositeOperation = 'source-in'; b.fillStyle = '#FFFFFF'; b.fillRect(0, 0, S, S);
    b.globalCompositeOperation = 'source-over';
    var out = makeCanvas(S, S), g = out.getContext('2d'), ring = Math.max(1.5, devPx * 0.034);
    g.globalAlpha = 0.95;
    for (var i = 0; i < 16; i++) { var an = i * TAU / 16; g.drawImage(scrB, 0, 0, S, S, Math.cos(an) * ring, Math.sin(an) * ring, S, S); }
    g.globalAlpha = 1;
    g.drawImage(scrA, 0, 0, S, S, 0, 0, S, S);
    stats.thingBuilt++;
    return out;
  }
  function drawThing(ctx, thing, size, opt) {
    if (!ctx || !thing) return;
    size = num(size, 90); if (!(size > 0)) return;
    var o = opt || {}, sc = thing.big === false ? SMALL : 1, box = size * sc, s = box / 100;
    var glow = clamp01(o.glow), wig = Math.max(-1, Math.min(1, num(o.wiggle, 0))), count = Math.round(num(o.count, -1));
    var k = kindOf(thing);
    ctx.save();
    if (wig) { ctx.rotate(wig * 0.35); ctx.scale(1 + 0.04 * Math.abs(wig), 1 - 0.04 * Math.abs(wig)); }
    ctx.scale(s, s);
    if (glow > 0.01) {
      var R = 60 + 12 * glow, gr = ctx.createRadialGradient(0, 0, R * 0.25, 0, 0, R);
      gr.addColorStop(0, 'rgba(255,236,150,' + (0.85 * glow).toFixed(3) + ')');
      gr.addColorStop(0.6, 'rgba(255,214,100,' + (0.42 * glow).toFixed(3) + ')');
      gr.addColorStop(1, 'rgba(255,210,90,0)');
      ctx.fillStyle = gr; ctx.beginPath(); circ(ctx, 0, 0, R); ctx.fill();
    }
    var dev = devScale(ctx);            // device px per design unit (the ctx is already scaled)
    var img = k === 'animal' ? assetImg('animals/' + animalOf(thing), 106 * dev) : null;
    if (canDOM() && !o.direct) {
      var devPx = bucket(100 * dev, 16, 900), key = thingKey(thing) + '|' + (k === 'stars' ? Math.round(starLayout(thing.n, o.maxN).rs * 100) : '') + '|' + (k === 'animal' ? (img ? 'i' : 'p') : '') + '|' + devPx.toFixed(1);
      var spr = sget(key);
      if (spr) stats.thingHit++;
      else { try { spr = buildThingSprite(thing, o, img, devPx); } catch (e) { spr = null; } if (spr) sput(key, spr); }
      if (spr) { var W = 100 + 2 * PADU; ctx.drawImage(spr, -W / 2, -W / 2, W, W); }
      else thingBody(ctx, thing, o, img);
    } else thingBody(ctx, thing, o, img);
    if (k === 'stars' && count > 0) drawStarCount(ctx, thing, o, count);
    ctx.restore();
  }

  // ================================================================= BUBBLE
  function conic(g, R) {
    var gr = null;
    if (g.createConicGradient) { try { gr = g.createConicGradient(-0.6, 0, 0); } catch (e) { gr = null; } }
    if (!gr) gr = g.createLinearGradient(-R, -R, R, R);
    return gr;
  }
  /** film layer: near-clear interior (Fresnel: brighter towards the edge) + iridescent rim; rotationally neutral → rotated for shimmer */
  function filmBody(g, R, boost) {
    var gi = g.createRadialGradient(0, 0, 0, 0, 0, R);
    gi.addColorStop(0, 'rgba(255,255,255,0.07)'); gi.addColorStop(0.62, 'rgba(255,255,255,0.10)');
    gi.addColorStop(0.88, 'rgba(255,255,255,0.17)'); gi.addColorStop(1, 'rgba(255,255,255,0.30)');
    g.fillStyle = gi; g.beginPath(); circ(g, 0, 0, R); g.fill();
    var rings = [[0.975, 0.05, 0.55], [0.93, 0.06, 0.34], [0.885, 0.06, 0.18], [0.845, 0.05, 0.08]];
    rings.forEach(function (q) {
      var gr = conic(g, R), a = Math.min(0.55, q[2] * boost);
      IRIS.forEach(function (c, i) { gr.addColorStop(i / (IRIS.length - 1), rgba(c, a)); });
      g.strokeStyle = gr; g.lineWidth = Math.max(1, q[1] * R); g.beginPath(); circ(g, 0, 0, R * q[0]); g.stroke();
    });
    // crisp edge: a cool thin outline so the bubble reads on the palest skies, + a white inner line
    g.strokeStyle = 'rgba(96,116,170,0.36)'; g.lineWidth = Math.max(1, R * 0.016); g.beginPath(); circ(g, 0, 0, R); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = Math.max(0.8, R * 0.012); g.beginPath(); circ(g, 0, 0, R * 0.985); g.stroke();
  }
  /** shine layer (fixed to the light, upper-left): curved highlight, dot, lower-right glint, bottom reflection */
  function shineBody(g, R) {
    var gg = g.createRadialGradient(-0.42 * R, -0.42 * R, 0, -0.42 * R, -0.42 * R, 0.62 * R);
    gg.addColorStop(0, 'rgba(255,255,255,0.22)'); gg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gg; g.beginPath(); circ(g, 0, 0, R * 0.98); g.fill();
    // big curved crescent
    var a0 = Math.PI * 1.02, a1 = Math.PI * 1.44, ro = 0.84 * R, am = (a0 + a1) / 2;
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.beginPath(); g.moveTo(Math.cos(a0) * ro, Math.sin(a0) * ro); g.arc(0, 0, ro, a0, a1, false);
    g.quadraticCurveTo(Math.cos(am) * R * 0.6, Math.sin(am) * R * 0.6, Math.cos(a0) * ro, Math.sin(a0) * ro); g.closePath(); g.fill();
    // small round highlight just inside the crescent's curve
    var ad = Math.PI * 1.505; dot(g, Math.cos(ad) * R * 0.82, Math.sin(ad) * R * 0.82, R * 0.055, 'rgba(255,255,255,0.9)');
    // small lower-right glint
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = Math.max(1, R * 0.05); g.lineCap = 'round';
    g.beginPath(); g.arc(0, 0, R * 0.82, Math.PI * 0.14, Math.PI * 0.3); g.stroke();
    // faint bottom reflection
    g.save(); g.beginPath(); circ(g, 0, 0, R * 0.96); g.clip();
    var gb = g.createRadialGradient(0.05 * R, 0.86 * R, 0, 0.05 * R, 0.86 * R, 0.55 * R);
    gb.addColorStop(0, 'rgba(255,255,255,0.26)'); gb.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gb; g.beginPath(); ell(g, 0.05 * R, 0.86 * R, 0.6 * R, 0.24 * R, 0); g.fill();
    g.restore();
  }
  function layerSprite(kind, devR, boost) {
    var key = 'film:' + kind + ':' + devR.toFixed(1) + ':' + boost.toFixed(3);   // boost = film thickness, or the frost level for 'shine'
    var c = sget(key);
    if (c) { stats.filmHit++; return c; }
    var S = Math.ceil(devR * 2.12) + 4;
    c = makeCanvas(S, S);
    var g = c.getContext('2d'); if (!g) return null;
    g.translate(S / 2, S / 2);
    if (kind === 'film') filmBody(g, devR, boost); else { shineBody(g, devR); if (boost > 0) drawFrost(g, devR, boost); }
    stats.filmBuilt++;
    return sput(key, c);
  }
  function drawLayer(ctx, kind, r, boost, rot) {
    if (canDOM()) {
      var dev = devScale(ctx), devR = bucket(r * dev, 6, 700), spr = null;
      try { spr = layerSprite(kind, devR, boost); } catch (e) { spr = null; }
      if (spr) {
        var W = spr.width * r / devR;
        if (rot) { ctx.save(); ctx.rotate(rot); ctx.drawImage(spr, -W / 2, -W / 2, W, W); ctx.restore(); }
        else ctx.drawImage(spr, -W / 2, -W / 2, W, W);
        return;
      }
    }
    ctx.save(); if (rot) ctx.rotate(rot);
    if (kind === 'film') filmBody(ctx, r, boost); else { shineBody(ctx, r); if (boost > 0) drawFrost(ctx, r, boost); }
    ctx.restore();
  }
  function drawFrost(ctx, r, f) {
    ctx.save(); ctx.globalAlpha *= f;
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = Math.max(1, r * 0.04);
    ctx.beginPath(); circ(ctx, 0, 0, r * 0.95); ctx.stroke();
    for (var j = 0; j < 22; j++) {   // fine frost grains along the rim
      var aj = hash(j + 70) * TAU, rj = r * (0.9 + 0.08 * hash(j + 90));
      dot(ctx, Math.cos(aj) * rj, Math.sin(aj) * rj, Math.max(0.6, r * 0.014), 'rgba(255,255,255,0.9)');
    }
    // frosty rime gathering on the lower rim
    ctx.save(); ctx.beginPath(); circ(ctx, 0, 0, r); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = r * 0.09;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.97, Math.PI * 0.18, Math.PI * 0.82); ctx.stroke();
    ctx.restore();
    for (var i = 0; i < 14; i++) {
      var a = hash(i) * TAU, rr = r * (0.86 + 0.12 * hash(i + 20)), s = r * (0.035 + 0.05 * hash(i + 40));
      sparkle(ctx, Math.cos(a) * rr, Math.sin(a) * rr, s, i % 3 ? 'rgba(255,255,255,0.95)' : 'rgba(214,232,255,0.95)');
    }
    ctx.restore();
  }
  function drawPop(ctx, r, p, t) {
    var e = 1 - Math.pow(1 - p, 2.2), R = r * (1 + 0.32 * e), a = Math.pow(1 - p, 0.8);
    if (p < 0.4) {   // the flash: a bright soapy ring flash
      var fa = (0.4 - p) / 0.4, gf = ctx.createRadialGradient(0, 0, r * 0.7, 0, 0, r * 1.15);
      gf.addColorStop(0, 'rgba(255,255,255,0)'); gf.addColorStop(0.85, 'rgba(255,255,255,' + (0.45 * fa).toFixed(3) + ')'); gf.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gf; ctx.beginPath(); circ(ctx, 0, 0, r * 1.15); ctx.fill();
    }
    if (p < 0.12) {   // the film still there for a blink, already tearing
      ctx.save(); ctx.globalAlpha *= 1 - p / 0.12; drawLayer(ctx, 'film', r, 1, num(t, 0) * 0.5); ctx.restore();
    }
    var N = 12, seg = TAU / N;
    ctx.lineCap = 'round';
    for (var i = 0; i < N; i++) {
      var mid = i * seg + 0.3 + (hash(i + 3) - 0.5) * 0.25, len = seg * (0.78 - 0.62 * e) * (0.75 + 0.5 * hash(i + 9));
      var rr = R * (0.94 + 0.12 * hash(i + 15));
      var lw = Math.max(1.2, r * 0.085 * (1 - 0.55 * e));
      ctx.strokeStyle = rgba('#6E84BE', 0.35 * a); ctx.lineWidth = lw + Math.max(1.2, r * 0.02);
      ctx.beginPath(); ctx.arc(0, 0, rr, mid - len / 2, mid + len / 2); ctx.stroke();
      ctx.strokeStyle = rgba(i % 2 ? '#FFFFFF' : IRIS[i % 6], 0.95 * a); ctx.lineWidth = lw;
      ctx.beginPath(); ctx.arc(0, 0, rr, mid - len / 2, mid + len / 2); ctx.stroke();
    }
  }
  function drawBubble(ctx, r, opt) {
    if (!ctx) return;
    r = num(r, 0); if (!(r > 0)) return;
    var o = opt || {}, alpha = clamp01(num(o.alpha, 1)); if (alpha <= 0.001) return;
    var wob = Math.max(-0.35, Math.min(0.35, num(o.wob, 0))), wa = num(o.wobA, 0), t = num(o.t, 0);
    var glow = clamp01(o.glow), frost = clamp01(o.frost), grow = o.grow == null ? 1 : clamp01(o.grow), pop = clamp01(o.pop);
    var part = o.part === 'back' || o.part === 'front' ? o.part : 'both';
    ctx.save(); ctx.globalAlpha *= alpha;
    if (pop > 0) { if (part !== 'front' && pop < 1) drawPop(ctx, r, pop, t); ctx.restore(); return; }
    if ((part !== 'front') && glow > 0.01) {   // gold halo behind
      var gh = ctx.createRadialGradient(0, 0, r * 0.85, 0, 0, r * 1.42);
      gh.addColorStop(0, 'rgba(255,224,120,' + (0.6 * glow).toFixed(3) + ')'); gh.addColorStop(1, 'rgba(255,214,100,0)');
      ctx.fillStyle = gh; ctx.beginPath(); circ(ctx, 0, 0, r * 1.42); ctx.fill();
    }
    // membrane deformation: stretch along wobA (area preserving) + the flattened film while still on the wand
    if (wob) { var sx = 1 + wob; ctx.rotate(wa); ctx.scale(sx, 1 / sx); ctx.rotate(-wa); }
    if (grow < 1) { var f = 1 - grow; ctx.scale(1 + 0.05 * f, 1 - 0.12 * f); }
    var boost = grow < 1 ? 1.35 : 1;
    if (part !== 'front') drawLayer(ctx, 'film', r, boost, t * 0.45 + Math.sin(t * 0.9) * 0.35);
    if (part !== 'back') {
      drawLayer(ctx, 'shine', r, Math.round(frost * 8) / 8, 0);   // frost baked into the shine sprite (8 levels)
      if (glow > 0.01) {   // rim pulse
        var pu = 0.6 + 0.4 * Math.sin(t * 6);
        ctx.strokeStyle = 'rgba(255,214,90,' + (0.85 * glow * pu).toFixed(3) + ')'; ctx.lineWidth = Math.max(2, r * 0.07);
        ctx.beginPath(); circ(ctx, 0, 0, r * 1.02); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.7 * glow).toFixed(3) + ')'; ctx.lineWidth = Math.max(1, r * 0.022);
        ctx.beginPath(); circ(ctx, 0, 0, r * 1.02); ctx.stroke();
      }
    }
    ctx.restore();
  }

  // ================================================================= RAINBOW
  function rainbowPoint(rb, k, f) {
    rb = rb || {}; k = Math.max(1, Math.round(num(k, 3)));
    var cx = num(rb.cx, 0), cy = num(rb.cy, 0), r = num(rb.r, 200), w = num(rb.w, 50);
    var a = Math.PI + Math.PI * Math.max(0, Math.min(k, num(f, 0))) / k, rm = r - w / 2;
    return { x: cx + Math.cos(a) * rm, y: cy + Math.sin(a) * rm, a: a };
  }
  function drawRainbow(ctx, rb, k, filled, opt) {
    if (!ctx || !rb) return;
    var o = opt || {}, alpha = o.alpha == null ? 1 : clamp01(o.alpha), guide = o.guide == null ? 1 : clamp01(o.guide), shine = clamp01(o.shine);
    if (alpha <= 0.001) return;
    k = Math.max(1, Math.round(num(k, 3)));
    var cx = num(rb.cx, 0), cy = num(rb.cy, 0), r = num(rb.r, 0), w = Math.min(num(rb.w, 40), r * 0.9);
    if (!(r > 0) || !(w > 0)) return;
    var f = Math.max(0, Math.min(k, num(filled, 0))), A0 = Math.PI, ae = A0 + Math.PI * f / k, ri = r - w, bw = w / RAINBOW.length;
    ctx.save(); ctx.globalAlpha *= alpha; ctx.lineCap = 'round';
    // unpainted guide: faint white fill + dotted edges + dotted piece separators
    if (guide > 0.01 && f < k) {
      ctx.save(); ctx.globalAlpha *= guide;
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.beginPath(); ctx.arc(cx, cy, r, ae, 2 * Math.PI); ctx.arc(cx, cy, ri, 2 * Math.PI, ae, true); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = Math.max(2, w * 0.07);
      if (ctx.setLineDash) ctx.setLineDash([0.1, Math.max(8, w * 0.28)]);
      ctx.beginPath(); ctx.arc(cx, cy, r - 1, ae, 2 * Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, ri + 1, ae, 2 * Math.PI); ctx.stroke();
      for (var j = Math.ceil(f + 1e-6); j < k; j++) {
        var aj = A0 + Math.PI * j / k, cj = Math.cos(aj), sj = Math.sin(aj);
        ctx.beginPath(); ctx.moveTo(cx + cj * (ri + 2), cy + sj * (ri + 2)); ctx.lineTo(cx + cj * (r - 2), cy + sj * (r - 2)); ctx.stroke();
      }
      if (ctx.setLineDash) ctx.setLineDash([]);
      ctx.restore();
    }
    if (f > 0.001) {
      ctx.save(); ctx.globalAlpha *= 0.9;
      for (var i = 0; i < RAINBOW.length; i++) {
        var ro = r - i * bw, rin = ro - bw - 0.6;
        ctx.fillStyle = RAINBOW[i];
        ctx.beginPath(); ctx.arc(cx, cy, ro, A0, ae); ctx.arc(cx, cy, Math.max(ri, rin), ae, A0, true); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      // soft white rims + a gloss line
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = Math.max(1.2, w * 0.03);
      ctx.beginPath(); ctx.arc(cx, cy, r, A0, ae); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, ri, A0, ae); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = Math.max(2, w * 0.08);
      ctx.beginPath(); ctx.arc(cx, cy, r - w * 0.22, A0, ae); ctx.stroke();
      // painted piece seams (very faint): the child sees the pieces they made
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5;
      for (var s = 1; s < Math.floor(f + 1e-6) + 1 && s < k; s++) {
        if (s >= f) break;
        var as = A0 + Math.PI * s / k;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(as) * ri, cy + Math.sin(as) * ri); ctx.lineTo(cx + Math.cos(as) * r, cy + Math.sin(as) * r); ctx.stroke();
      }
      // leading edge: bright line + glow (strong while animating, soft when resting on a piece end)
      if (f < k - 1e-6) {
        var frac = f - Math.floor(f), edge = frac > 0.001 ? 1 : 0.55, ce = Math.cos(ae), se = Math.sin(ae), rm = r - w / 2;
        var ex = cx + ce * rm, ey = cy + se * rm, ge = ctx.createRadialGradient(ex, ey, 0, ex, ey, w * 0.95);
        ge.addColorStop(0, 'rgba(255,255,255,' + (0.8 * edge).toFixed(3) + ')'); ge.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = ge; ctx.beginPath(); circ(ctx, ex, ey, w * 0.95); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.9 * edge).toFixed(3) + ')'; ctx.lineWidth = Math.max(2, w * 0.08);
        ctx.beginPath(); ctx.moveTo(cx + ce * ri, cy + se * ri); ctx.lineTo(cx + ce * r, cy + se * r); ctx.stroke();
        sparkle(ctx, ex + ce * w * 0.1, ey + se * w * 0.1, w * 0.22 * edge + 2, 'rgba(255,255,255,0.95)');
      }
    }
    // shine: a white glint sweeping left → right over the painted arch
    if (shine > 0.001 && shine < 0.999 && f > 0.001) {
      var sa = A0 + Math.PI * shine, sw = Math.sin(Math.PI * shine);
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, r + 1, A0, ae); ctx.arc(cx, cy, ri - 1, ae, A0, true); ctx.closePath(); ctx.clip();
      [[0.26, 0.12], [0.18, 0.16], [0.11, 0.22], [0.05, 0.3]].forEach(function (q) {
        ctx.fillStyle = 'rgba(255,255,255,' + (q[1] * sw).toFixed(3) + ')';
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r + 4, sa - q[0], sa + q[0]); ctx.closePath(); ctx.fill();
      });
      ctx.restore();
      var sp = rainbowPoint(rb, k, shine * k);
      sparkle(ctx, sp.x, sp.y - w * 0.1, w * 0.3 * sw + 1, 'rgba(255,255,255,0.95)');
    }
    ctx.restore();
  }

  // ================================================================= DROPS, MINI BUBBLES, SNOWFLAKE
  function drawDrop(ctx, x, y, r, a) {
    if (!ctx) return;
    a = a == null ? 1 : clamp01(a); r = num(r, 4); if (a <= 0.001 || !(r > 0)) return;
    x = num(x, 0); y = num(y, 0);
    ctx.save(); ctx.globalAlpha *= a;
    ctx.fillStyle = 'rgba(222,240,255,0.75)'; ctx.beginPath(); circ(ctx, x, y, r); ctx.fill();
    ctx.strokeStyle = 'rgba(122,150,210,0.7)'; ctx.lineWidth = Math.max(0.8, r * 0.22); ctx.beginPath(); circ(ctx, x, y, r); ctx.stroke();
    ctx.strokeStyle = 'rgba(245,168,216,0.8)'; ctx.lineWidth = Math.max(0.6, r * 0.18); ctx.beginPath(); ctx.arc(x, y, r * 0.78, 0.2, 1.5); ctx.stroke();
    dot(ctx, x - r * 0.35, y - r * 0.38, Math.max(0.6, r * 0.3), '#FFFFFF');
    ctx.restore();
  }
  function drawMiniBubble(ctx, x, y, r, a) {
    if (!ctx) return;
    a = a == null ? 1 : clamp01(a); r = num(r, 8); if (a <= 0.001 || !(r > 0)) return;
    x = num(x, 0); y = num(y, 0);
    ctx.save(); ctx.globalAlpha *= a;
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); circ(ctx, x, y, r); ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.13);
    ctx.strokeStyle = 'rgba(110,132,190,0.55)'; ctx.beginPath(); circ(ctx, x, y, r); ctx.stroke();
    ctx.strokeStyle = 'rgba(185,162,242,0.85)'; ctx.beginPath(); ctx.arc(x, y, r * 0.88, 0.1, 1.6); ctx.stroke();
    ctx.strokeStyle = 'rgba(127,214,242,0.85)'; ctx.beginPath(); ctx.arc(x, y, r * 0.88, 1.7, 3.0); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = Math.max(1, r * 0.16); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x, y, r * 0.62, Math.PI * 1.1, Math.PI * 1.42); ctx.stroke();
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
    oval(ctx, 2, 4, 52, 52, 0, 'rgba(60,50,80,0.2)');
    dot(ctx, 0, 0, 52, '#FFFFFF');
    ctx.save(); ctx.beginPath(); circ(ctx, 0, 0, 44); ctx.clip();
    var g = ctx.createLinearGradient(0, -44, 0, 44); g.addColorStop(0, B.sky[0]); g.addColorStop(1, B.sky[1]);
    ctx.fillStyle = g; ctx.fillRect(-46, -46, 92, 92);
    B.draw(ctx);
    ctx.restore();
    ctx.strokeStyle = '#D3D8E6'; ctx.lineWidth = 2.4; ctx.beginPath(); circ(ctx, 0, 0, 44); ctx.stroke();
    ctx.strokeStyle = '#A9B3C9'; ctx.lineWidth = 2.6; ctx.beginPath(); circ(ctx, 0, 0, 52); ctx.stroke();
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
      drawThing(ctx, t, size * 0.8, {});
    } else if (k === 'letter') {
      drawThing(ctx, { kind: 'tile', text: t.text }, size * 0.84, {});
    } else if (k === 'number') {
      var n = Math.round(num(t.n != null ? t.n : t.text, 1)), s1 = size / 100;
      ctx.scale(s1, s1);
      var dots = n >= 1 && n <= 10;
      cel(ctx, 'ic.card', function (x) { rrect(x, -45, -47, 90, 94, 18); }, CARD, { s: 2.6, line: '#A9B3C9', lw: 3, hl: false });
      signText(ctx, String(n), 0, dots ? -12 : 0, 70, dots ? 38 : 54, INK);
      if (dots) {
        var rows = n <= 5 ? [n] : [5, n - 5], dr = 7.2;
        rows.forEach(function (cnt, ri) {
          for (var i = 0; i < cnt; i++) {
            var dx = (i - (cnt - 1) / 2) * 16.5, dy = rows.length === 1 ? 29 : 21 + ri * 15;
            cel(ctx, 'ic.st' + dx + '.' + dy, function (q) { rpoly(q, starPts(dx, dy, dr, dr * 0.5), 1); }, STAR, { s: 1, line: STAR.dark, lw: 1.4, hl: false });
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
      var inner = t.thing && KINDS.indexOf(t.thing.kind) >= 0 ? Object.assign({}, t.thing) : { kind: 'toy', obj: 'ball', color: t.color || 'red' };
      var big = t.big === true || t.size === 'big';
      inner.big = true;
      if (big) drawThing(ctx, inner, size * 0.86, {});
      else {
        ctx.strokeStyle = 'rgba(110,120,150,0.35)'; if (ctx.setLineDash) ctx.setLineDash([5, 5]); ctx.lineWidth = 2;
        ctx.beginPath(); rrect(ctx, -size * 0.44, -size * 0.44, size * 0.88, size * 0.88, size * 0.12); ctx.stroke(); if (ctx.setLineDash) ctx.setLineDash([]);
        ctx.translate(0, size * 0.16); drawThing(ctx, inner, size * 0.86 * SMALL, {});
      }
    } else {
      dot(ctx, 0, 0, size * 0.35, '#E6EAF2'); ctx.strokeStyle = '#A9B3C9'; ctx.lineWidth = 3; ctx.beginPath(); circ(ctx, 0, 0, size * 0.35); ctx.stroke();
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
      ctx.strokeStyle = 'rgba(127,214,242,' + (0.75 * p).toFixed(3) + ')'; ctx.lineWidth = s * 0.02;
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
    ctx.save(); ctx.shadowColor = 'rgba(30,30,60,0.3)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
    hand(ctx); ctx.lineWidth = s * 0.07 + 6; ctx.strokeStyle = EDGE; ctx.stroke(); ctx.restore();
    hand(ctx); ctx.lineWidth = s * 0.07; ctx.strokeStyle = L; ctx.stroke();
    hand(ctx); ctx.fillStyle = F; ctx.fill();
    ctx.strokeStyle = '#EADFCB'; ctx.lineWidth = s * 0.03;
    ctx.beginPath(); ctx.moveTo(0, s * 0.5); ctx.lineTo(s * 0.18, s * 0.5); ctx.moveTo(0, s * 0.62); ctx.lineTo(s * 0.18, s * 0.62); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ell(ctx, -s * 0.03, s * 0.12, s * 0.025, s * 0.07, 0); ctx.fill();
    // cuff: Bao's cream bandana
    ctx.fillStyle = '#EED9B5'; ctx.strokeStyle = '#B79E74'; ctx.lineWidth = s * 0.03;
    ctx.beginPath(); rrect(ctx, -s * 0.25, s * 0.76, s * 0.46, s * 0.14, s * 0.06); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(183,158,116,0.7)';
    [-0.15, -0.03, 0.09].forEach(function (dx) { ctx.beginPath(); circ(ctx, s * dx, s * 0.83, s * 0.018); ctx.fill(); });
    ctx.restore();
  }

  function clearCache() { pcache = {}; pN = 0; bcache = {}; lcache = {}; scache = {}; sN = 0; }

  PB.BubbleArt = {
    drawBubble: drawBubble, drawThing: drawThing, drawRainbow: drawRainbow, rainbowPoint: rainbowPoint,
    drawDrop: drawDrop, drawMiniBubble: drawMiniBubble, drawHomeBadge: drawHomeBadge, drawSnowflake: drawSnowflake,
    drawIcon: drawIcon, drawHintHand: drawHintHand,
    starLayout: function (n, maxN) { return starLayout(n, maxN); },
    pal: function (n) { return pal(n) || null; }, PALETTE: FALLBACK, STAR: STAR, RAINBOW: RAINBOW, IRIS: IRIS, FONT: FONT, INK: INK,
    TOYS: TOYS, SHAPES: SHAPES, ANIMALS: ANIMALS, HOMES: HOMES, KINDS: KINDS, SMALL: SMALL,
    thingKey: thingKey, clearCache: clearCache, stats: stats
  };
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
