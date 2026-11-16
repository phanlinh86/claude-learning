/* Moka's Fairy Tea Party — FT.TeaArt (character artist B), DESIGN §3 / §4.3. Everything here is canvas code.
 *
 *   drawThing(ctx, thing, size, opt)    origin = the thing's BOTTOM centre (where it sits on the placemat), body goes UP (−y);
 *                                       size = body box height. The caller sets the transform (translate, squash, tilt).
 *       thing = { kind 'obj'|'cookie'|'plate'|'card'|'guest', color?, obj?, shape?, n?, animal?, text?, big? }
 *         obj     cup (teacup on a saucer, steam) | teapot | jar (jam jar, gingham cloth lid) | bowl (porridge + spoon) |
 *                 cupcake — the body painted in `color`, a tiny dot-eyed smiling face on each
 *         cookie  a round dough cookie standing on a small cream plate, the SHAPE as thick icing in `color`
 *                 (circle|square|triangle|star|heart|oval|rect|diamond), icing ≈ 70 % of the cookie's width
 *         plate   a cream plate with n raspberries (1–12, dice / rows layout, every berry clearly separate)
 *         card    a folded tent place card with `text` ("A", "3+2", "7−4", "12") in big rounded dark-brown glyphs + a sprig
 *         guest   FT.Assets image 'guests/<a>' (or 'guests/<a>_hop' when opt.hop) — a soft placeholder until it is loaded
 *         big: false → drawn at size × 0.62 (about the bottom centre)
 *       opt = { glow 0..1, dim 0..1, hop 0|1, night 0..1 (rain darkness: warm rim light, never darkens the body),
 *               count -1..n (plate: the first `count` berries get a white ring + shine), ring 0..1 (gold bell flash above),
 *               berryN (plates: draw every berry with the radius of berryLayout(berryN) — the round's max n, so berry size
 *               is never a clue), dpr }
 *       Painted things get a cream sticker outline (warm at night) so every colour reads on wood, moss and in the rain.
 *   bodyBox(thing, size) → { w, h, cy }
 *   drawPlacemat(ctx, w, opt)           leaf placemat, origin = centre of where a thing sits; opt { pop 0..1 }
 *   drawTable(ctx, x0, x1, y, opt)      mossy log plank from x0 − 30 to x1 + 30 (thickness 46, y = top surface) on two
 *                                       toadstool legs; opt { wet 0..1, spring px (plank dips), legs [x, x], groundY }
 *   drawGarland(ctx, g, lanterns, t)    vine from (g.x0, g.y) to (g.x1, g.y) sagging g.sag, leaves + twinkling bud lights;
 *                                       lanterns [{x, y (hang point on the vine), lit, color, thing, swing}] (default
 *                                       g.lanterns); g.twinkle 0..1; g.badge {home, i, a} draws the home badge under lantern i
 *   drawLantern(ctx, x, y, s, lit, color, thing, swing)   hangs from (x, y); stalk 30·s, flower ≈ 75·s tall below it; lit 0..1
 *                                       (overshoot > 1 ok); color = palette name | '#hex' | null (gold / thing.color)
 *   drawFluff(ctx, x, y, r, alpha)      dandelion fluff parachute, (x, y) = centre of the puff, its stalk hangs down to
 *                                       (x, y + 1.3 r) — put that point on the thing's top
 *   drawHomeBadge(ctx, home, r, opt)    forest|sea|ice|desert|savanna, centred, r = radius; opt { a, pop }
 *   drawIcon(ctx, choice, size)         centred in size × size: any thing, {kind:'color', color}, {kind:'number', n},
 *                                       {kind:'home', home}, {kind:'size', big, thing?}, {kind:'letter', text}
 *   drawHintHand(ctx, x, y, press, alpha, size?)  fingertip at (x, y), finger points UP-LEFT; press 0..1
 *   drawSparkle(ctx, x, y, r, alpha, rot)          4-point twinkle (fairy dust)
 *   Helpers: pal, berryLayout, thingKey, clearCache, PALETTE (fallback), TABLE, OBJECTS, SHAPES, ANIMALS, HOMES, KINDS, FONT.
 *
 * Things are designed in a 100-unit box (x −50..50, y −100..0, bottom at (0, 0)); the ctx is scaled by size / 100.
 * Path2D objects are cached per part (size independent — equivalent to per thing+size because the ctx is scaled).
 * Node-safe at load (no DOM). Without Path2D (node tests) paths are rebuilt on the ctx each draw.
 */
(function (G) {
  'use strict';
  var FT = G.FT = G.FT || {};

  var TAU = Math.PI * 2, LW = 3.2;            // outline width in the 100-unit design box (≈ 4 px at 124)
  var FONT = 'ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif';
  var FALLBACK = {
    red:    { base: '#E84A4A', dark: '#A8282E', light: '#F7A0A0' },
    blue:   { base: '#3C8DE8', dark: '#1F5BA8', light: '#A6CCF5' },
    yellow: { base: '#FFD23F', dark: '#C99A12', light: '#FFEB9C' },
    green:  { base: '#4CC26B', dark: '#2A8343', light: '#A8E6B8' },
    orange: { base: '#FF9A2E', dark: '#C4650C', light: '#FFCB8E' },
    purple: { base: '#8E44AD', dark: '#6840A8', light: '#D2BDF3' },
    pink:   { base: '#FF8FC0', dark: '#C9558A', light: '#FFCCE2' }
  };
  var TABLE = {
    wood: { base: '#A9784E', dark: '#6E4A2E', light: '#D2A576' }, moss: { base: '#8DAA6A', dark: '#5E7C46', light: '#B4CB92' },
    stalk: { base: '#F3E6CC', dark: '#C9B48E', light: '#FFFBF0' }, cap: { base: '#C98C86', dark: '#8E5A56', light: '#E6B8B2' },
    mat: { base: '#B7C98E', dark: '#7F9560', light: '#D6E3B6' }, berry: { base: '#C6375A', dark: '#7E1F38', light: '#E47A92' },
    plate: { base: '#FBF5E8', dark: '#D9CBB0', light: '#FFFFFF' }, dough: { base: '#E2B27A', dark: '#A97540', light: '#F3D3A6' },
    card: { base: '#FFF8EA', dark: '#D9C6A0', light: '#FFFFFF' }, ink: '#5A3B26'
  };
  var WOOD = TABLE.wood, MOSS = TABLE.moss, BERRY = TABLE.berry, PLATE = TABLE.plate, DOUGH = TABLE.dough, CARD = TABLE.card;
  var SAGE = { base: '#9DB07A', dark: '#66804A', light: '#C6D6A6' };
  var GOLD = { base: '#FFE7A3', dark: '#D8B26A', light: '#FFF7DC' };
  var BUD = { base: '#EDE3CC', dark: '#B9A989', light: '#FBF6EA' };
  var INK = TABLE.ink, EYE = '#2F2A3A';
  var OBJECTS = ['cup', 'teapot', 'jar', 'bowl', 'cupcake'];
  var SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'oval', 'rect', 'diamond'];
  var ANIMALS = ['bunny', 'fox', 'deer', 'squirrel', 'owl', 'raccoon', 'mouse', 'hedgehog', 'penguin', 'crab', 'goldfish', 'camel', 'lion'];
  var HOMES = ['forest', 'sea', 'ice', 'desert', 'savanna'];
  var KINDS = ['obj', 'cookie', 'plate', 'card', 'guest'];
  var SMALL = 0.62;

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
  var HEX = /^#[0-9A-Fa-f]{6}$/;
  function pal(name) {
    var P = FT.PALETTE, c = P && P[name] && HEX.test(P[name].base || '') && HEX.test(P[name].dark || '') && HEX.test(P[name].light || '') ? P[name] : FALLBACK[name];
    return c || null;
  }
  function lineOf(c) { return c.base === '#FFD23F' ? '#B0850A' : c.base === '#FF8FC0' ? '#B84A7E' : c.dark; }
  function shadeOf(c) { return mix(c.base, c.dark, 0.34); }

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
  function rpoly(t, pts, r) {   // rounded polygon: corner i rounded with radius r (number or array)
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
  function twinkle(ctx, x, y, r, col) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r); ctx.closePath(); ctx.fill();
  }
  /** the tea things' tiny face: dot eyes with a catch-light, a little smile, rosy cheeks */
  function face(ctx, x, y, c, s) {
    s = s || 1;
    var ink = mix(c.dark, EYE, 0.55);
    oval(ctx, x - 8 * s, y, 3.3 * s, 3.8 * s, 0, EYE); oval(ctx, x + 8 * s, y, 3.3 * s, 3.8 * s, 0, EYE);
    dot(ctx, x - 9 * s, y - 1.4 * s, 1.3 * s, '#FFFFFF'); dot(ctx, x + 7 * s, y - 1.4 * s, 1.3 * s, '#FFFFFF');
    ctx.strokeStyle = ink; ctx.lineWidth = 2.2 * s; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x, y + 2.4 * s, 4.4 * s, Math.PI * 0.2, Math.PI * 0.8); ctx.stroke();
    var ck = rgba(c.base === '#E84A4A' ? '#FFD0D0' : '#FF8F8F', c.base === '#E84A4A' ? 0.55 : 0.55);
    oval(ctx, x - 14 * s, y + 4.6 * s, 3.8 * s, 2.4 * s, 0, ck); oval(ctx, x + 14 * s, y + 4.6 * s, 3.8 * s, 2.4 * s, 0, ck);
  }
  function part2(ctx, key, build, fill, ln, lw) { var p = P(key, build); ctx.fillStyle = fill; fillP(ctx, p); ctx.strokeStyle = ln; ctx.lineWidth = lw; strokeP(ctx, p); }
  function lightOf(c) { return { base: c.light, dark: c.base, light: '#FFFFFF' }; }

  // ================================================================= OBJECTS (painted in the answer colour)
  var OB = {};
  // ---- cup: teacup on a saucer with two steam wisps
  var cpBody = function (t) { t.moveTo(-38, -62); t.lineTo(38, -62); t.bezierCurveTo(38, -34, 27, -17, 15, -14); t.lineTo(-15, -14); t.bezierCurveTo(-27, -17, -38, -34, -38, -62); t.closePath(); };
  var cpRim = function (t) { ell(t, 0, -62, 38, 8, 0); };
  var cpTea = function (t) { ell(t, 0, -62.5, 32, 5.2, 0); };
  var cpHandle = function (t) { t.moveTo(34, -52); t.bezierCurveTo(52, -56, 54, -30, 28, -28); };
  var cpSaucer = function (t) { ell(t, 0, -9, 47, 9, 0); };
  var cpFoot = function (t) { rrect(t, -17, -17, 34, 7, 3); };
  OB.cup = {
    sil: function (t) { cpBody(t); cpRim(t); cpSaucer(t); ell(t, 42, -42, 12, 15, 0); },
    draw: function (ctx, c) {
      // steam (cream wisps) — tells "hot tea" at a glance
      ctx.lineCap = 'round';
      [[-11, 0], [9, 1]].forEach(function (q) {
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 4.2;
        ctx.beginPath(); ctx.moveTo(q[0], -74); ctx.bezierCurveTo(q[0] - 7, -80, q[0] + 7, -86, q[0], -95 + q[1] * 3); ctx.stroke();
      });
      cel(ctx, 'cp.saucer', cpSaucer, c, { s: 2.4, hl: [-26, -12, 10, 2, 0] });
      ctx.fillStyle = rgba(c.dark, 0.35); ctx.beginPath(); ell(ctx, 0, -11, 26, 4, 0); ctx.fill();
      cel(ctx, 'cp.foot', cpFoot, { base: shadeOf(c), dark: c.dark, light: c.base }, { s: 1.2, hl: false });
      ctx.strokeStyle = lineOf(c); ctx.lineWidth = 11; strokeP(ctx, P('cp.h', cpHandle));
      ctx.strokeStyle = c.base; ctx.lineWidth = 5; strokeP(ctx, P('cp.h', cpHandle));
      cel(ctx, 'cp.body', cpBody, c, { s: 5, hl: [-24, -48, 4, 9, 0.35] });
      cel(ctx, 'cp.rim', cpRim, lightOf(c), { s: 1.4, line: lineOf(c), hl: false });
      cel(ctx, 'cp.tea', cpTea, { base: '#C68A52', dark: '#9A6236', light: '#E8B884' }, { s: -1.6, shade: '#9A6236', line: false, hl: [10, -63, 8, 1.4, 0] });
      face(ctx, 0, -40, c, 1);
    }
  };
  // ---- teapot (spout to the left, handle to the right)
  var tpBody = function (t) { ell(t, 0, -40, 35, 29, 0); };
  var tpSpout = function (t) { t.moveTo(-24, -52); t.bezierCurveTo(-40, -50, -46, -60, -51, -71); t.quadraticCurveTo(-49, -77, -42, -75); t.bezierCurveTo(-40, -60, -36, -36, -22, -26); t.closePath(); };
  var tpSpoutTip = function (t) { ell(t, -46.5, -73.5, 5.6, 3, -0.5); };
  var tpHandle = function (t) { t.moveTo(30, -56); t.bezierCurveTo(52, -60, 54, -24, 29, -26); };
  var tpLid = function (t) { t.moveTo(-20, -66); t.bezierCurveTo(-20, -82, 20, -82, 20, -66); t.closePath(); };
  var tpLidRim = function (t) { rrect(t, -25, -69, 50, 7, 3.5); };
  var tpKnob = function (t) { circ(t, 0, -83, 6); };
  var tpFoot = function (t) { rrect(t, -20, -14, 40, 10, 4); };
  OB.teapot = {
    sil: function (t) { tpBody(t); tpSpout(t); tpLid(t); tpLidRim(t); tpKnob(t); tpFoot(t); ell(t, 42, -42, 12, 17, 0); },
    draw: function (ctx, c) {
      ctx.lineCap = 'round';
      ctx.strokeStyle = lineOf(c); ctx.lineWidth = 11; strokeP(ctx, P('tp.h', tpHandle));
      ctx.strokeStyle = c.base; ctx.lineWidth = 5; strokeP(ctx, P('tp.h', tpHandle));
      cel(ctx, 'tp.spout', tpSpout, c, { s: 2.6, hl: false });
      part2(ctx, 'tp.tip', tpSpoutTip, mix(c.dark, EYE, 0.3), lineOf(c), 2.2);
      cel(ctx, 'tp.foot', tpFoot, { base: shadeOf(c), dark: c.dark, light: c.base }, { s: 1.4, hl: false });
      cel(ctx, 'tp.body', tpBody, c, { s: 5.5, hl: [-20, -54, 7, 10, 0.6],
        inner: function (x) {
          x.strokeStyle = rgba(c.light, 0.75); x.lineWidth = 2.2;
          x.beginPath(); x.moveTo(-31, -24); x.quadraticCurveTo(0, -16, 31, -24); x.stroke();
        } });
      cel(ctx, 'tp.lid', tpLid, c, { s: 2.2, hl: [-8, -75, 5, 2, -0.3] });
      cel(ctx, 'tp.lidrim', tpLidRim, lightOf(c), { s: 1.4, line: lineOf(c), lw: 2.8, hl: false });
      cel(ctx, 'tp.knob', tpKnob, c, { s: 1.6, hl: [-2, -85, 2, 1.4, -0.5] });
      face(ctx, 0, -42, c, 1);
    }
  };
  // ---- jam jar with a gingham cloth lid and a string bow
  var jrBody = function (t) { rpoly(t, [[-23, -71], [23, -71], [32, -59], [32, -4], [-32, -4], [-32, -59]], [4, 4, 11, 12, 12, 11]); };
  var jrCloth = function (t) {
    t.moveTo(-30, -78); t.quadraticCurveTo(0, -92, 30, -78);
    t.quadraticCurveTo(37, -70, 38, -62); t.quadraticCurveTo(33, -66, 28, -62); t.quadraticCurveTo(22, -67, 16, -63);
    t.quadraticCurveTo(10, -67, 4, -63); t.quadraticCurveTo(-2, -67, -8, -63); t.quadraticCurveTo(-14, -67, -20, -63);
    t.quadraticCurveTo(-26, -67, -32, -62); t.quadraticCurveTo(-36, -66, -38, -62); t.quadraticCurveTo(-37, -70, -30, -78); t.closePath();
  };
  OB.jar = {
    sil: function (t) { jrBody(t); jrCloth(t); },
    draw: function (ctx, c) {
      cel(ctx, 'jr.body', jrBody, c, { s: 5, hl: false,
        inner: function (x) {
          // glass shine strips
          x.fillStyle = 'rgba(255,255,255,0.55)';
          x.beginPath(); rrect(x, -27, -58, 6, 40, 3); x.fill();
          x.beginPath(); rrect(x, -18, -56, 3, 14, 1.5); x.fill();
          x.fillStyle = rgba(c.light, 0.6); x.fillRect(-34, -71, 68, 4);
        } });
      cel(ctx, 'jr.cloth', jrCloth, CARD, { s: 1.8, line: '#B8A27E', lw: 2.6, hl: false,
        inner: function (x) {   // gingham checks in the jar's colour
          x.fillStyle = rgba(c.base, 0.42);
          for (var gx = -40; gx < 40; gx += 10) x.fillRect(gx, -94, 5, 34);
          for (var gy = -92; gy < -60; gy += 10) x.fillRect(-40, gy, 80, 5);
        } });
      // string + bow
      ctx.strokeStyle = '#8C5A3C'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-31, -71); ctx.quadraticCurveTo(0, -67, 31, -71); ctx.stroke();
      ctx.fillStyle = '#B07A50';
      ctx.beginPath(); ctx.moveTo(0, -69); ctx.quadraticCurveTo(-10, -78, -12, -68); ctx.quadraticCurveTo(-8, -63, 0, -69); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -69); ctx.quadraticCurveTo(10, -78, 12, -68); ctx.quadraticCurveTo(8, -63, 0, -69); ctx.closePath(); ctx.fill(); ctx.stroke();
      line(ctx, [-1, -68, -5, -59], '#8C5A3C', 2.6); line(ctx, [1, -68, 5, -59], '#8C5A3C', 2.6);
      face(ctx, 2, -34, c, 1.05);
    }
  };
  // ---- bowl of porridge with a wooden spoon
  var bwBody = function (t) { t.moveTo(-46, -58); t.bezierCurveTo(-46, -24, -24, -12, 0, -12); t.bezierCurveTo(24, -12, 46, -24, 46, -58); t.quadraticCurveTo(0, -44, -46, -58); t.closePath(); };
  var bwRim = function (t) { ell(t, 0, -58, 46, 10, 0); };
  var bwFood = function (t) { ell(t, 0, -58.5, 39, 6.6, 0); };
  var bwFoot = function (t) { rrect(t, -21, -15, 42, 11, 4); };
  var bwSpoon = function (t) { t.moveTo(6, -58); t.lineTo(30, -94); };
  OB.bowl = {
    sil: function (t) { bwBody(t); bwRim(t); bwFoot(t); ell(t, 31, -95, 7, 7, 0); },
    draw: function (ctx, c) {
      cel(ctx, 'bw.foot', bwFoot, { base: shadeOf(c), dark: c.dark, light: c.base }, { s: 1.4, hl: false });
      cel(ctx, 'bw.rim', bwRim, lightOf(c), { s: 1.4, line: lineOf(c), hl: false });
      cel(ctx, 'bw.food', bwFood, { base: '#F6E7C8', dark: '#DCC59A', light: '#FFFFFF' }, { s: -1.6, shade: '#DCC59A', line: false, hl: [-12, -60, 9, 1.6, 0] });
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#8C5A3C'; ctx.lineWidth = 9; strokeP(ctx, P('bw.sp', bwSpoon));
      ctx.strokeStyle = WOOD.light; ctx.lineWidth = 4.6; strokeP(ctx, P('bw.sp', bwSpoon));
      dot(ctx, 31, -96, 5.6, '#8C5A3C'); dot(ctx, 31, -96, 3.2, WOOD.light);
      cel(ctx, 'bw.body', bwBody, c, { s: 5, hl: [-30, -42, 4, 7, 0.7],
        inner: function (x) { x.strokeStyle = rgba(c.light, 0.7); x.lineWidth = 2.2; x.beginPath(); x.moveTo(-40, -46); x.quadraticCurveTo(0, -34, 40, -46); x.stroke(); } });
      face(ctx, 0, -32, c, 1);
    }
  };
  // ---- cupcake: pleated wrapper + three-tier frosting swirl, white sprinkles, cream dollop
  var ccWrap = function (t) { rpoly(t, [[-33, -44], [33, -44], [24, -4], [-24, -4]], [3, 3, 5, 5]); };
  var ccF1 = function (t) { t.moveTo(-38, -44); t.bezierCurveTo(-46, -46, -42, -64, -28, -64); t.lineTo(28, -64); t.bezierCurveTo(42, -64, 46, -46, 38, -44); t.quadraticCurveTo(30, -40, 22, -44); t.quadraticCurveTo(14, -40, 6, -44); t.quadraticCurveTo(-2, -40, -10, -44); t.quadraticCurveTo(-18, -40, -26, -44); t.quadraticCurveTo(-32, -40, -38, -44); t.closePath(); };
  var ccF2 = function (t) { rrect(t, -29, -80, 58, 20, 10); };
  var ccF3 = function (t) { t.moveTo(-18, -77); t.bezierCurveTo(-20, -92, -6, -94, 0, -96); t.bezierCurveTo(4, -90, 20, -92, 18, -77); t.closePath(); };
  OB.cupcake = {
    sil: function (t) { ccWrap(t); ccF1(t); ccF2(t); ccF3(t); },
    draw: function (ctx, c) {
      var wc = { base: mix(c.base, c.dark, 0.22), dark: c.dark, light: c.light };
      cel(ctx, 'cc.wrap', ccWrap, wc, { s: 3.6, hl: false,
        inner: function (x) {
          x.strokeStyle = rgba(c.light, 0.75); x.lineWidth = 2.4;
          x.beginPath(); for (var i = -3; i <= 3; i++) { x.moveTo(i * 9.4, -42); x.lineTo(i * 6.8, -6); } x.stroke();
        } });
      cel(ctx, 'cc.f3', ccF3, c, { s: 2.2, hl: [-7, -86, 3, 2, -0.6] });
      cel(ctx, 'cc.f2', ccF2, c, { s: 3, hl: [-16, -74, 6, 2.2, -0.2] });
      cel(ctx, 'cc.f1', ccF1, c, { s: 3.4, hl: [-28, -57, 6, 2.4, -0.3] });
      // sprinkles
      var spr = [[-22, -52, 0.6], [-8, -56, -0.4], [12, -53, 0.9], [26, -55, -0.6], [-14, -72, 1.2], [6, -73, 0.2], [18, -70, -0.9], [-4, -86, 0.5]];
      ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 2.6;
      ctx.beginPath(); spr.forEach(function (s) { ctx.moveTo(s[0] - Math.cos(s[2]) * 2.6, s[1] - Math.sin(s[2]) * 2.6); ctx.lineTo(s[0] + Math.cos(s[2]) * 2.6, s[1] + Math.sin(s[2]) * 2.6); }); ctx.stroke();
      cel(ctx, 'cc.dollop', function (t) { circ(t, 0, -96, 6); }, CARD, { s: 1.2, line: '#C9B48E', lw: 2.2, hl: [-2, -98, 2, 1.4, 0] });
      face(ctx, 0, -27, wc, 0.95);
    }
  };
  function objOf(th) { return OB[th.obj] ? th.obj : 'cup'; }

  // ================================================================= COOKIES (shape icing on a round dough cookie)
  var CK = { cx: 0, cy: -52, r: 45 };
  var ckPlate = function (t) { ell(t, 0, -8, 44, 8, 0); };
  var ckDough = function (t) { circ(t, CK.cx, CK.cy, CK.r); };
  function heartAt(cx, cy, w, h) {
    return function (t) {
      var X = function (x) { return cx + x * w / 93; }, Y = function (y) { return cy + (y - 55) * h / 82; };
      t.moveTo(X(0), Y(96));
      t.bezierCurveTo(X(-14), Y(85), X(-46.5), Y(66), X(-46.5), Y(39));
      t.bezierCurveTo(X(-46.5), Y(23), X(-35), Y(14), X(-23), Y(14));
      t.bezierCurveTo(X(-11), Y(14), X(-3), Y(21), X(0), Y(30));
      t.bezierCurveTo(X(3), Y(21), X(11), Y(14), X(23), Y(14));
      t.bezierCurveTo(X(35), Y(14), X(46.5), Y(23), X(46.5), Y(39));
      t.bezierCurveTo(X(46.5), Y(66), X(14), Y(85), X(0), Y(96));
      t.closePath();
    };
  }
  var cy = CK.cy;
  var ICING = {
    circle:   function (t) { circ(t, 0, cy, 33); },
    square:   function (t) { rrect(t, -28, cy - 28, 56, 56, 6); },
    triangle: function (t) { rpoly(t, [[0, cy - 37], [37, cy + 25], [-37, cy + 25]], [7, 6, 6]); },
    star:     function (t) { rpoly(t, starPts(0, cy + 2, 40, 17.5), [3.5, 2, 3.5, 2, 3.5, 2, 3.5, 2, 3.5, 2]); },
    heart:    heartAt(0, cy + 3, 74, 64),
    oval:     function (t) { ell(t, 0, cy, 22, 36, 0); },
    rect:     function (t) { rrect(t, -38, cy - 20, 76, 40, 6); },
    diamond:  function (t) { rpoly(t, [[0, cy - 40], [28, cy], [0, cy + 40], [-28, cy]], [5, 4, 5, 4]); }
  };
  function shapeOf(th) { return ICING[th.shape] ? th.shape : 'circle'; }
  function drawCookie(ctx, th, c) {
    cel(ctx, 'ck.plate', ckPlate, PLATE, { s: 2, line: PLATE.dark, lw: 2.6, hl: false });
    ctx.fillStyle = rgba(PLATE.dark, 0.6); ctx.beginPath(); ell(ctx, 0, -9, 26, 3.4, 0); ctx.fill();
    cel(ctx, 'ck.dough', ckDough, DOUGH, { s: 4.2, line: DOUGH.dark, hl: false,
      inner: function (x) {
        // baked edge ring + crumbs
        x.strokeStyle = rgba(DOUGH.dark, 0.35); x.lineWidth = 3; x.beginPath(); circ(x, CK.cx, CK.cy, CK.r - 3); x.stroke();
        for (var i = 0; i < 14; i++) { var a = i * TAU / 14 + 0.2, rr = CK.r - 7 - (i % 3) * 1.5; dot(x, CK.cx + Math.cos(a) * rr, CK.cy + Math.sin(a) * rr, i % 2 ? 1.4 : 1.9, rgba(DOUGH.dark, 0.7)); }
      } });
    var s = shapeOf(th), key = 'ice.' + s, b = ICING[s];
    // thick icing: a darker drop under it, then the glossy top
    ctx.save(); ctx.translate(1.2, 3);
    ctx.fillStyle = mix(c.dark, DOUGH.dark, 0.25); fillP(ctx, P(key, b));
    ctx.restore();
    var bb = bbox(key, b);
    cel(ctx, key, b, c, { s: 3, line: lineOf(c), lw: 2.8, hl: false,
      inner: function (x) {
        x.save(); x.translate(-1, -1.2); x.strokeStyle = rgba(mix(c.light, '#FFFFFF', 0.4), 0.75); x.lineWidth = 3.4; strokeP(x, P(key, b)); x.restore();
        x.fillStyle = 'rgba(255,255,255,0.75)';
        x.beginPath(); ell(x, bb.x + bb.w * 0.3, bb.y + bb.h * 0.28, Math.max(2.4, bb.w * 0.09), Math.max(1.6, bb.h * 0.05), -0.7); x.fill();
      } });
  }

  // ================================================================= PLATES + RASPBERRIES
  var PL = { cx: 0, cy: -44, rx: 50, ry: 42, irx: 43, iry: 36 };
  var plRim = function (t) { ell(t, PL.cx, PL.cy, PL.rx, PL.ry, 0); };
  var plWell = function (t) { ell(t, PL.cx, PL.cy + 1, PL.irx, PL.iry, 0); };
  var ROWS = { 1: [1], 2: [2], 3: [3], 4: [2, 2], 5: [2, 1, 2], 6: [3, 3], 7: [4, 3], 8: [4, 4], 9: [3, 3, 3], 10: [3, 4, 3], 11: [4, 3, 4], 12: [4, 4, 4] };
  var RAD = { 1: 13, 2: 12, 3: 10.5, 4: 10.5, 5: 10, 6: 10, 7: 8.6, 8: 8.6, 9: 8, 10: 8, 11: 7.6, 12: 7.6 };
  var lcache = {};
  /** berry centres (reading order) + radius, inside the plate well */
  function berryLayout(n, rMax) {
    n = Math.max(1, Math.min(12, Math.round(num(n, 3))));
    var r = RAD[n]; if (rMax > 0 && rMax < r) r = rMax;
    var key = n + ':' + r;
    if (lcache[key]) return lcache[key];
    var rows = ROWS[n], nr = rows.length, gap = n >= 7 ? 3.4 : 5, step = 2 * r + gap, pts = [];
    var cx = PL.cx, cyy = PL.cy + 1;
    if (n === 5) {
      var d = r * 2.05;
      [[-d, -d], [d, -d], [0, 0], [-d, d], [d, d]].forEach(function (q) { pts.push([cx + q[0], cyy + q[1]]); });
    } else {
      var stepY = nr === 3 ? Math.min(step, 19) : step;
      rows.forEach(function (cnt, ri) {
        for (var i = 0; i < cnt; i++) pts.push([cx + (i - (cnt - 1) / 2) * step, cyy + (ri - (nr - 1) / 2) * stepY]);
      });
    }
    return (lcache[key] = { n: n, r: r, pts: pts });
  }
  function berryBuild(r) {   // a raspberry: a round body slightly pointed at the bottom
    return function (t) {
      t.moveTo(0, -r);
      t.bezierCurveTo(r * 0.62, -r, r * 1.02, -r * 0.6, r * 1.02, -r * 0.02);
      t.bezierCurveTo(r * 1.02, r * 0.62, r * 0.5, r * 1.06, 0, r * 1.08);
      t.bezierCurveTo(-r * 0.5, r * 1.06, -r * 1.02, r * 0.62, -r * 1.02, -r * 0.02);
      t.bezierCurveTo(-r * 1.02, -r * 0.6, -r * 0.62, -r, 0, -r);
      t.closePath();
    };
  }
  var DRUPE = [[-0.45, -0.35], [0.1, -0.5], [0.55, -0.2], [-0.6, 0.15], [-0.1, 0.05], [0.45, 0.3], [-0.3, 0.55], [0.15, 0.62]];
  function drawBerry(ctx, x, y, r, lit) {
    var key = 'berry' + Math.round(r * 10), b = berryBuild(r);
    ctx.save(); ctx.translate(x, y);
    if (lit) {
      ctx.fillStyle = 'rgba(255,240,170,0.8)'; ctx.beginPath(); circ(ctx, 0, 0, r * 1.45); ctx.fill();
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = Math.max(2, r * 0.28); ctx.beginPath(); circ(ctx, 0, 0.5, r * 1.3); ctx.stroke();
      ctx.scale(1.08, 1.08);
    }
    cel(ctx, key, b, BERRY, { s: r * 0.22, lw: Math.max(1.5, r * 0.2), line: BERRY.dark, hl: false,
      inner: function (q) {
        for (var i = 0; i < DRUPE.length; i++) dot(q, DRUPE[i][0] * r, DRUPE[i][1] * r, r * 0.13, rgba(BERRY.light, 0.9));
        oval(q, -r * 0.42, -r * 0.42, r * 0.2, r * 0.13, -0.6, lit ? '#FFFFFF' : 'rgba(255,220,228,0.85)');
      } });
    // calyx (sage)
    ctx.fillStyle = SAGE.base; ctx.strokeStyle = SAGE.dark; ctx.lineWidth = Math.max(0.8, r * 0.08);
    ctx.beginPath();
    for (var j = 0; j < 4; j++) { var a = -Math.PI / 2 + (j - 1.5) * 0.55; ctx.moveTo(0, -r * 0.92); ctx.quadraticCurveTo(Math.cos(a - 0.3) * r * 0.5, -r * 0.92 + Math.sin(a - 0.3) * r * 0.25, Math.cos(a) * r * 0.48, -r * 0.92 + Math.sin(a) * r * 0.2 + r * 0.06); }
    ctx.stroke();
    dot(ctx, 0, -r * 0.95, r * 0.17, SAGE.base);
    if (lit) twinkle(ctx, r * 0.55, -r * 0.55, r * 0.42, '#FFFFFF');
    ctx.restore();
  }
  function drawPlate(ctx, th, o) {
    var rMax = num(o.berryN, 0) >= 1 ? berryLayout(o.berryN).r : 0, L = berryLayout(th.n, rMax), count = Math.round(num(o.count, -1));
    cel(ctx, 'pl.rim', plRim, PLATE, { s: 3, line: PLATE.dark, lw: 3, hl: [-28, -68, 9, 4, -0.6] });
    cel(ctx, 'pl.well', plWell, { base: '#F4ECDB', dark: '#E2D4B8', light: '#FFFFFF' }, { s: -2.6, shade: '#E2D4B8', line: rgba(PLATE.dark, 0.9), lw: 2, hl: false });
    for (var i = 0; i < L.pts.length; i++) drawBerry(ctx, L.pts[i][0], L.pts[i][1], L.r, i < count);
  }

  // ================================================================= PLACE CARD (folded tent card)
  var cdFront = function (t) { rpoly(t, [[-42, -80], [42, -80], [46, -4], [-46, -4]], [5, 5, 4, 4]); };
  var cdSide = function (t) { rpoly(t, [[42, -80], [50, -6], [46, -4]], [2, 2, 2]); };
  function cardText(th) {
    var s = th.text != null ? String(th.text) : th.n != null ? String(th.n) : '?';
    s = s.replace(/-/g, '−');
    return s.length ? s.slice(0, 6) : '?';
  }
  function glyphFont(px) { return 'bold ' + Math.round(px * 10) / 10 + 'px ' + FONT; }
  /** big rounded dark-brown text centred at (x, y) fitting maxW × maxH (cap height) */
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
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.6, px * 0.045);
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillText(txt, x + 0.8, by + 1.4);
    ctx.fillStyle = col; ctx.fillText(txt, x, by); if (ctx.strokeText) ctx.strokeText(txt, x, by);
  }
  function sprig(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.lineCap = 'round';
    line(ctx, [0, 0, 9, -9], SAGE.dark, 1.8);
    [[3, -3, -0.9], [7, -7, 0.4], [10, -10, -0.5]].forEach(function (l) {
      ctx.save(); ctx.translate(l[0], l[1]); ctx.rotate(l[2]);
      ctx.fillStyle = SAGE.base; ctx.strokeStyle = SAGE.dark; ctx.lineWidth = 1.2;
      ctx.beginPath(); ell(ctx, 0, -4, 2.6, 5, 0); ctx.fill(); ctx.stroke(); ctx.restore();
    });
    dot(ctx, -1, -1, 3.2, '#F6EFE0'); ctx.strokeStyle = '#C9B48E'; ctx.lineWidth = 1; ctx.beginPath(); circ(ctx, -1, -1, 3.2); ctx.stroke();
    dot(ctx, -1, -1, 1.2, '#E9C46A');
    ctx.restore();
  }
  function drawCard(ctx, th) {
    var txt = cardText(th), n = txt.length;
    cel(ctx, 'cd.side', cdSide, { base: '#E6D6B6', dark: '#C9B48E', light: '#F4EAD4' }, { s: 0.8, line: '#A88E64', lw: 2.4, hl: false });
    cel(ctx, 'cd.front', cdFront, CARD, { s: 2.6, shade: '#F0E2C6', line: '#A88E64', lw: 2.8, hl: false,
      inner: function (x) {
        x.fillStyle = 'rgba(255,255,255,0.9)'; x.fillRect(-40, -79, 80, 3);            // the fold catches the light
        x.strokeStyle = rgba('#C9B48E', 0.6); x.lineWidth = 1.4;
        x.beginPath(); rrect(x, -37, -73, 74, 63, 5); x.stroke();
      } });
    sprig(ctx, -36, -70, 1.15);
    signText(ctx, txt, 0, -42, 70, n <= 1 ? 44 : n <= 2 ? 38 : 30, INK);
  }

  // ================================================================= GUESTS (images by artist C; placeholder)
  var GC = {   // muted body / outline tints for the placeholder
    bunny: ['#EDE4DA', '#9C8C7E'], fox: ['#D58A52', '#8E5430'], deer: ['#C49A6C', '#7E5C3A'], squirrel: ['#B9784A', '#74472A'],
    owl: ['#A88B6A', '#6A5238'], raccoon: ['#A8A4A0', '#5E5A58'], mouse: ['#C9BFB6', '#7E7268'], hedgehog: ['#9C7E62', '#5E4A36'],
    penguin: ['#4A5268', '#2A3042'], crab: ['#E08A6E', '#9A4E3A'], goldfish: ['#CFE8F2', '#6E98AC'], camel: ['#D8B67E', '#8E7040'],
    lion: ['#E2B46E', '#9A7038']
  };
  var gBody = function (t) { ell(t, 0, -32, 30, 28, 0); };
  var gHead = function (t) { circ(t, 0, -70, 24); };
  var gEars = function (t) { circ(t, -17, -90, 8); circ(t, 17, -90, 8); };
  function animalOf(th) { return GC[th.animal] ? th.animal : 'bunny'; }
  function assetImg(key, px) {
    var A = FT.Assets;
    if (!A) return null;
    try {
      if (typeof A.has === 'function' && typeof A.sprite === 'function' && A.has(key)) { var s = A.sprite(key, px); if (s) return s; }
      if (typeof A.img === 'function') { var i = A.img(key); if (i) return i; }
      if (A.images && A.images[key]) return A.images[key];
    } catch (e) { /* fall back to the placeholder */ }
    return null;
  }
  var tcache = {}, tN = 0;
  /** a flat-colour silhouette of an image (glow / rain rim), cached per image + colour + px */
  function silhouette(img, col, w, h) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    var id = img.__ftId || (img.__ftId = 'i' + (++tN));
    var key = id + col + w + 'x' + h, c = tcache[key];
    if (!c) {
      if (Object.keys(tcache).length > 80) tcache = {};
      c = document.createElement('canvas'); c.width = w; c.height = h;
      var g = c.getContext('2d');
      if (!g) return null;
      g.drawImage(img, 0, 0, w, h);
      g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, w, h);
      tcache[key] = c;
    }
    return c;
  }
  function drawGuest(ctx, th, o, sizePx) {
    var a = animalOf(th), hop = num(o.hop, 0) ? 1 : 0, k = 100 / 185;   // the SVG body box ≈ 185 of 200 units
    var dpr = num(o.dpr, (G.devicePixelRatio || 1)), px = sizePx * 200 / 185 * dpr;
    var img = (hop && assetImg('guests/' + a + '_hop', px)) || assetImg('guests/' + a, px);
    var glow = clamp01(o.glow), night = clamp01(o.night);
    if (img) {
      var W = 200 * k, X = -100 * k, Y = -196 * k;
      if (glow > 0.01 || night > 0.01) {
        var dpx = sizePx / 100 * dpr;
        if (glow > 0.01) {
          var sg = silhouette(img, '#FFE79A', W * dpx, W * dpx);
          if (sg) {
            ctx.save(); ctx.globalAlpha *= 0.85 * glow;
            var gs = 1.07 + 0.03 * glow;
            ctx.translate(0, -50); ctx.scale(gs, gs); ctx.translate(0, 50);
            ctx.drawImage(sg, X, Y, W, W); ctx.restore();
          }
        }
        if (night > 0.01) {
          var sn = silhouette(img, '#FFC27E', W * dpx, W * dpx);
          if (sn) {
            ctx.save(); ctx.globalAlpha *= 0.7 * night;
            ctx.drawImage(sn, X - 1.6, Y - 1.4, W, W); ctx.drawImage(sn, X + 1.6, Y - 1.4, W, W);
            ctx.restore();
          }
        }
      }
      ctx.drawImage(img, X, Y, W, W);
      return;
    }
    // ---- placeholder: a soft round plush (front view), white sticker edge, arms up when hopping
    var c = GC[a], C = { base: c[0], dark: c[1], light: '#FFFFFF' };
    ctx.save();
    ctx.strokeStyle = night > 0.01 ? mix('#FFFFFF', '#FFD38A', night) : '#FFFFFF'; ctx.lineWidth = 9;
    strokeP(ctx, P('g.body', gBody)); strokeP(ctx, P('g.head', gHead)); strokeP(ctx, P('g.ears', gEars));
    cel(ctx, 'g.ears', gEars, C, { s: 1.6, line: c[1], lw: 2.6, hl: false });
    cel(ctx, 'g.body', gBody, C, { s: 4, line: c[1], lw: 3 });
    oval(ctx, 0, -26, 16, 14, 0, rgba('#FFFFFF', 0.45));
    if (hop) { line(ctx, [-24, -44, -36, -62], c[1], 9); line(ctx, [24, -44, 36, -62], c[1], 9); line(ctx, [-24, -44, -36, -62], c[0], 5); line(ctx, [24, -44, 36, -62], c[0], 5); }
    cel(ctx, 'g.head', gHead, C, { s: 3, line: c[1], lw: 3 });
    oval(ctx, -8, -72, 3.4, 4, 0, EYE); oval(ctx, 8, -72, 3.4, 4, 0, EYE);
    dot(ctx, -9, -73.4, 1.3, '#FFFFFF'); dot(ctx, 7, -73.4, 1.3, '#FFFFFF');
    oval(ctx, -15, -64, 3.6, 2.2, 0, rgba('#F2A99A', 0.85)); oval(ctx, 15, -64, 3.6, 2.2, 0, rgba('#F2A99A', 0.85));
    ctx.strokeStyle = c[1]; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -64, 4, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------- alpha layer (dim / fade without see-through parts)
  var scratch = null;
  function layer(ctx, x0, y0, w, h, alpha, fn) {
    var m = typeof document !== 'undefined' && ctx.getTransform ? ctx.getTransform() : null;
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

  // ================================================================= PUBLIC: things
  function kindOf(th) { return KINDS.indexOf(th && th.kind) >= 0 ? th.kind : 'obj'; }
  function colOf(th, d) {
    var c = th && th.color;
    if (c && HEX.test(c)) return { base: c, dark: mix(c, '#2F2A3A', 0.35), light: mix(c, '#FFFFFF', 0.5) };
    return pal(c) || FALLBACK[d || 'red'];
  }
  function silOf(th) {
    var k = kindOf(th);
    if (k === 'obj') return OB[objOf(th)].sil;
    if (k === 'cookie') return function (t) { ckDough(t); ckPlate(t); };
    if (k === 'plate') return plRim;
    if (k === 'card') return function (t) { cdFront(t); cdSide(t); };
    return null;
  }
  function bodyBox(thing, size) {
    size = num(size, 124);
    var s = thing && thing.big === false ? SMALL : 1, h = size * s, k = kindOf(thing || {});
    var w = (k === 'guest' ? 0.9 : k === 'plate' ? 1.0 : k === 'card' ? 0.96 : 0.94) * h;
    return { w: w, h: h, cy: -h / 2 };
  }
  function thingKey(t) {
    if (!t) return '?';
    return [t.kind, t.color || '', t.obj || '', t.shape || '', t.n != null ? t.n : '', t.animal || '', t.text != null ? t.text : '', t.big === false ? 's' : ''].join(':');
  }

  function drawThing(ctx, thing, size, opt) {
    if (!ctx || !thing) return;
    size = num(size, 124); if (!(size > 0)) return;
    var o = opt || {}, sc = thing.big === false ? SMALL : 1, s = size / 100 * sc, dim = clamp01(o.dim);
    ctx.save();
    ctx.scale(s, s);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (dim > 0.001) layer(ctx, -90, -150, 180, 164, 1 - 0.55 * dim, function (g) { thingBody(g, thing, o, size * sc); });
    else thingBody(ctx, thing, o, size * sc);
    ctx.restore();
  }
  function thingBody(ctx, thing, o, sizePx) {
    var k = kindOf(thing), glow = clamp01(o.glow), night = clamp01(o.night), ring = clamp01(o.ring);
    var sil = silOf(thing);
    if (glow > 0.01) {   // soft gold halo + outline pulse (behind)
      var R = 66 + 16 * glow;
      var g = ctx.createRadialGradient(0, -50, R * 0.2, 0, -50, R);
      g.addColorStop(0, 'rgba(255,232,140,' + (0.8 * glow).toFixed(3) + ')');
      g.addColorStop(0.55, 'rgba(255,214,100,' + (0.45 * glow).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(255,210,90,0)');
      ctx.fillStyle = g; ctx.beginPath(); circ(ctx, 0, -50, R); ctx.fill();
      if (sil) {
        ctx.strokeStyle = 'rgba(255,238,160,' + (0.9 * glow).toFixed(3) + ')'; ctx.lineWidth = 8 + 6 * glow;
        ctx.beginPath(); sil(ctx); ctx.stroke();
      }
    }
    // cream sticker outline behind the dark outline (warm rim light in the rain)
    if (sil) {
      ctx.strokeStyle = night > 0.01 ? mix('#FFF8EA', '#FFD38A', night) : '#FFF8EA';
      ctx.save(); ctx.globalAlpha *= 0.92; ctx.lineWidth = LW + 6 + 2 * night; ctx.beginPath(); sil(ctx); ctx.stroke(); ctx.restore();
    }
    if (k === 'guest') drawGuest(ctx, thing, o, sizePx);
    else if (k === 'obj') OB[objOf(thing)].draw(ctx, colOf(thing));
    else if (k === 'cookie') drawCookie(ctx, thing, colOf(thing, 'blue'));
    else if (k === 'plate') drawPlate(ctx, thing, o);
    else drawCard(ctx, thing);
    if (ring > 0.01) drawRing(ctx, ring);
  }
  /** the chime: a little gold bell above the thing with a flash of lines */
  function drawRing(ctx, a) {
    ctx.save(); ctx.globalAlpha *= a;
    ctx.translate(0, -110); ctx.rotate(Math.sin(a * 9) * 0.35);
    var bell = function (t) { t.moveTo(-9, 4); t.quadraticCurveTo(-9, -12, 0, -12); t.quadraticCurveTo(9, -12, 9, 4); t.lineTo(12, 8); t.lineTo(-12, 8); t.closePath(); };
    cel(ctx, 'ring.bell', bell, { base: '#FFD66B', dark: '#C9962A', light: '#FFF2C2' }, { s: 1.8, line: '#A8781E', lw: 2.4, hl: [-4, -6, 2, 3, 0.3] });
    dot(ctx, 0, 10, 3, '#C9962A');
    ctx.rotate(-Math.sin(a * 9) * 0.35);
    ctx.strokeStyle = 'rgba(255,224,120,0.95)'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    ctx.beginPath();
    [[-1, -0.6], [1, -0.6], [-1.2, 0.2], [1.2, 0.2]].forEach(function (d) { ctx.moveTo(d[0] * 17, d[1] * 17); ctx.lineTo(d[0] * 25, d[1] * 25); });
    ctx.stroke();
    ctx.restore();
  }

  // ================================================================= PLACEMAT (leaf, origin = centre)
  function drawPlacemat(ctx, w, opt) {
    if (!ctx) return;
    w = num(w, 130); if (!(w > 0)) return;
    var o = opt || {}, p = clamp01(o.pop), s = w / 130;
    ctx.save(); ctx.scale(s * (1 + 0.1 * p), s * 0.72 * (1 - 0.16 * p));
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    var leaf = function (t) { t.moveTo(-62, 2); t.bezierCurveTo(-44, -22, 36, -24, 64, -2); t.bezierCurveTo(40, 22, -40, 24, -62, 2); t.closePath(); };
    oval(ctx, 2, 6, 60, 14, 0, 'rgba(60,40,20,0.2)');
    cel(ctx, 'mat.leaf', leaf, TABLE.mat, { s: 3, line: TABLE.mat.dark, lw: 3, hl: [-30, -8, 16, 3, -0.08],
      inner: function (x) {
        x.strokeStyle = rgba(TABLE.mat.dark, 0.65); x.lineWidth = 2.2;
        x.beginPath(); x.moveTo(-58, 2); x.quadraticCurveTo(0, -2, 60, -2); x.stroke();
        x.lineWidth = 1.4; x.beginPath();
        [-36, -16, 4, 24, 42].forEach(function (vx, i) { x.moveTo(vx, -0.5); x.lineTo(vx + 12, -12 + (i % 2)); x.moveTo(vx, -0.5); x.lineTo(vx + 12, 11); });
        x.stroke();
      } });
    // stem
    line(ctx, [-62, 2, -72, 6], TABLE.mat.dark, 3);
    ctx.restore();
  }

  // ================================================================= TABLE (mossy log plank on toadstool legs)
  function hash(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function drawTable(ctx, x0, x1, y, opt) {
    if (!ctx) return;
    x0 = num(x0, 0); x1 = num(x1, x0 + 400); y = num(y, 0);
    if (x1 < x0) { var tmp = x0; x0 = x1; x1 = tmp; }
    var o = opt || {}, wet = clamp01(o.wet), sp = num(o.spring, 0), T = 46;
    var L = x0 - 30, R = x1 + 30, W = R - L, top = y - 18 + sp, front = y + 9 + sp, bot = top + T;
    var legs = o.legs && o.legs.length === 2 ? [num(o.legs[0], x0 + 60), num(o.legs[1], x1 - 60)] : [x0 + (x1 - x0) * 0.13, x1 - (x1 - x0) * 0.13];
    var ground = num(o.groundY, y + 150);
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // ---- toadstool legs (stalk to the ground, rose cap under the plank)
    legs.forEach(function (lx, li) {
      var capY = bot + 16, sq = Math.max(-6, Math.min(8, sp)) * 0.5;
      oval(ctx, lx, ground + 2, 44, 8, 0, 'rgba(50,40,20,0.22)');
      ctx.beginPath();
      ctx.moveTo(lx - 15, capY); ctx.lineTo(lx + 15, capY);
      ctx.bezierCurveTo(lx + 16, ground - 30, lx + 18, ground - 10, lx + 26, ground);
      ctx.lineTo(lx - 26, ground);
      ctx.bezierCurveTo(lx - 18, ground - 10, lx - 16, ground - 30, lx - 15, capY);
      ctx.closePath();
      ctx.fillStyle = TABLE.stalk.base; ctx.fill();
      ctx.save(); ctx.clip();
      ctx.fillStyle = TABLE.stalk.dark; ctx.fillRect(lx + 4, capY, 30, ground - capY + 2);
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(lx - 10, capY + 8, 5, ground - capY - 16);
      ctx.restore();
      ctx.strokeStyle = '#A8916A'; ctx.lineWidth = 3.4; ctx.stroke();
      // the cap: a dusty-rose dome seen from just below, cream spots, gills underneath
      ctx.save(); ctx.translate(lx, capY); ctx.scale(1 + sq * 0.012, 1 - sq * 0.03);
      var cap = function (t) { t.moveTo(-58, 2); t.bezierCurveTo(-56, -30, 56, -30, 58, 2); t.quadraticCurveTo(0, 16, -58, 2); t.closePath(); };
      cel(ctx, 'tbl.cap', cap, TABLE.cap, { s: 3, line: TABLE.cap.dark, lw: 3.4, hl: false,
        inner: function (x) {
          [[-36, -6, 6], [-10, -12, 5.5], [20, -9, 7], [44, -3, 4.5]].forEach(function (d) { oval(x, d[0], d[1], d[2], d[2] * 0.7, 0, '#F6E9D2'); });
        } });
      ctx.fillStyle = '#E8D8BC'; ctx.beginPath(); ctx.moveTo(-48, 6); ctx.quadraticCurveTo(0, 18, 48, 6); ctx.quadraticCurveTo(0, 13, -48, 6); ctx.closePath(); ctx.fill();
      ctx.restore();
      void li;
    });
    // ---- the plank: top face (light), front face (grain), log ends with rings
    var plank = function (t) { rrect(t, L, top, W, T, 14); };
    ctx.fillStyle = 'rgba(50,30,15,0.22)'; ctx.beginPath(); rrect(ctx, L + 6, top + 6, W, T, 14); ctx.fill();
    ctx.fillStyle = WOOD.base; ctx.beginPath(); plank(ctx); ctx.fill();
    ctx.save(); ctx.beginPath(); plank(ctx); ctx.clip();
    ctx.fillStyle = WOOD.light; ctx.fillRect(L, top, W, front - top);                    // top surface
    ctx.fillStyle = mix(WOOD.light, '#FFFFFF', 0.25); ctx.fillRect(L, top, W, 3);
    ctx.fillStyle = mix(WOOD.base, WOOD.dark, 0.45); ctx.fillRect(L, bot - 9, W, 9);       // underside shade
    // grain on the front face
    ctx.strokeStyle = rgba(WOOD.dark, 0.45); ctx.lineWidth = 2;
    for (var i = 0; i < Math.max(4, W / 70); i++) {
      var gx = L + 20 + hash(i) * (W - 40), gy = front + 8 + hash(i + 9) * (bot - front - 18), gl = 30 + hash(i + 3) * 60;
      ctx.beginPath(); ctx.moveTo(gx, gy); ctx.quadraticCurveTo(gx + gl / 2, gy - 3 + hash(i + 5) * 6, gx + gl, gy); ctx.stroke();
    }
    // knots
    [0.31, 0.72].forEach(function (f, j) { var kx = L + W * f, ky = front + 18 + j * 4; oval(ctx, kx, ky, 7, 4, 0, rgba(WOOD.dark, 0.6)); oval(ctx, kx, ky, 3.5, 2, 0, rgba(WOOD.light, 0.6)); });
    // top-face lines
    ctx.strokeStyle = rgba(WOOD.dark, 0.22); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(L + 20, top + 7); ctx.lineTo(R - 30, top + 8); ctx.stroke();
    if (wet > 0.01) {   // rain: darker, glossy
      ctx.fillStyle = 'rgba(40,50,70,' + (0.18 * wet).toFixed(3) + ')'; ctx.fillRect(L, top, W, T);
      ctx.fillStyle = 'rgba(255,255,255,' + (0.55 * wet).toFixed(3) + ')';
      for (var w2 = 0; w2 < W / 90; w2++) { var wx = L + 30 + hash(w2 + 40) * (W - 60); oval(ctx, wx, top + 5, 10 + hash(w2) * 12, 1.8, 0, ctx.fillStyle); }
    }
    ctx.restore();
    // log ends with growth rings
    [L + 10, R - 10].forEach(function (ex, j) {
      ctx.save(); ctx.translate(ex, top + T / 2);
      oval(ctx, 0, 0, 11, T / 2 - 1, 0, mix(WOOD.light, '#F4DDB4', 0.4));
      ctx.strokeStyle = rgba(WOOD.dark, 0.5); ctx.lineWidth = 1.5;
      [0.72, 0.45, 0.2].forEach(function (k) { ctx.beginPath(); ell(ctx, 0, 0, 11 * k, (T / 2 - 1) * k, 0); ctx.stroke(); });
      ctx.strokeStyle = WOOD.dark; ctx.lineWidth = 3; ctx.beginPath(); ell(ctx, 0, 0, 11, T / 2 - 1, 0); ctx.stroke();
      ctx.restore(); void j;
    });
    ctx.strokeStyle = WOOD.dark; ctx.lineWidth = 3.6; ctx.beginPath(); plank(ctx); ctx.stroke();
    // moss along the front edge of the top (muted sage), with soft bumps and little drips
    var mx0 = L + 24, mx1 = R - 24, my = front;
    ctx.beginPath(); ctx.moveTo(mx0, my - 3);
    var nB = Math.max(3, Math.round((mx1 - mx0) / 22));
    for (var b = 0; b < nB; b++) {
      var bx0 = mx0 + (mx1 - mx0) * b / nB, bx1 = mx0 + (mx1 - mx0) * (b + 1) / nB, dip = 4 + hash(b + 70) * 6 + (b % 4 === 1 ? 7 : 0);
      ctx.quadraticCurveTo((bx0 + bx1) / 2, my + dip, bx1, my + 1);
    }
    ctx.lineTo(mx1, my - 4);
    for (var b2 = nB; b2 > 0; b2--) { var cx2 = mx0 + (mx1 - mx0) * (b2 - 0.5) / nB; ctx.quadraticCurveTo(cx2, my - 7 - hash(b2 + 20) * 3, mx0 + (mx1 - mx0) * (b2 - 1) / nB, my - 4); }
    ctx.closePath();
    ctx.fillStyle = MOSS.base; ctx.fill();
    ctx.strokeStyle = MOSS.dark; ctx.lineWidth = 2.4; ctx.stroke();
    ctx.fillStyle = rgba(MOSS.light, 0.9);
    for (var mb = 0; mb < nB; mb += 2) { var mxx = mx0 + (mx1 - mx0) * (mb + 0.5) / nB; oval(ctx, mxx - 3, my - 3, 5, 1.6, 0, ctx.fillStyle); }
    if (wet > 0.01) {   // drips under the plank
      ctx.fillStyle = 'rgba(200,225,240,' + (0.85 * wet).toFixed(3) + ')';
      for (var d = 0; d < W / 110; d++) {
        var dx = L + 40 + hash(d + 90) * (W - 80);
        ctx.beginPath(); ctx.moveTo(dx, bot); ctx.quadraticCurveTo(dx + 3, bot + 6, dx, bot + 8); ctx.quadraticCurveTo(dx - 3, bot + 6, dx, bot); ctx.fill();
      }
    }
    ctx.restore();
  }

  // ================================================================= LANTERN (bell flower, hangs from (x, y))
  function lanternColour(color, thing) {
    var c = color && HEX.test(color) ? { base: color, light: mix(color, '#FFFFFF', 0.5), dark: mix(color, '#2F2A3A', 0.35) } : pal(color);
    if (!c && thing && thing.color) c = pal(thing.color);
    return c;
  }
  var lnBud = function (t) { t.moveTo(0, 30); t.bezierCurveTo(19, 34, 22, 70, 0, 88); t.bezierCurveTo(-22, 70, -19, 34, 0, 30); t.closePath(); };
  var lnBell = function (t) {
    t.moveTo(-12, 32); t.quadraticCurveTo(0, 26, 12, 32);
    t.bezierCurveTo(20, 46, 22, 66, 34, 80);
    t.quadraticCurveTo(28, 86, 21, 82); t.quadraticCurveTo(15, 90, 7, 84); t.quadraticCurveTo(0, 91, -7, 84); t.quadraticCurveTo(-15, 90, -21, 82); t.quadraticCurveTo(-28, 86, -34, 80);
    t.bezierCurveTo(-22, 66, -20, 46, -12, 32); t.closePath();
  };
  var lnMouth = function (t) { ell(t, 0, 76, 26, 8, 0); };
  function drawLantern(ctx, x, y, s, lit, color, thing, swing) {
    if (!ctx) return;
    s = num(s, 1); if (!(s > 0)) return;
    var l = Math.max(0, Math.min(1.4, num(lit, 0))), open = clamp01(l), pop = 1 + Math.max(0, l - 1) * 0.6;
    var c = lanternColour(color, thing), tint = c ? mix(c.base, GOLD.base, 0.25) : '#FFD66B';
    ctx.save(); ctx.translate(num(x, 0), num(y, 0)); ctx.rotate(num(swing, 0)); ctx.scale(s, s);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // glow
    if (open > 0.01) {
      var g = ctx.createRadialGradient(0, 72, 4, 0, 72, 86);
      g.addColorStop(0, 'rgba(255,236,160,' + (0.75 * open).toFixed(3) + ')');
      g.addColorStop(0.5, rgba(c ? mix(c.light, '#FFE7A3', 0.5) : '#FFE7A3', 0.35 * open));
      g.addColorStop(1, 'rgba(255,231,163,0)');
      ctx.fillStyle = g; ctx.beginPath(); circ(ctx, 0, 72, 86); ctx.fill();
    }
    // stalk + leaf
    ctx.strokeStyle = SAGE.dark; ctx.lineWidth = 4.4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(6, 14, 0, 30); ctx.stroke();
    ctx.strokeStyle = SAGE.base; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(6, 14, 0, 30); ctx.stroke();
    ctx.save(); ctx.translate(3, 12); ctx.rotate(-0.9);
    cel(ctx, 'ln.leaf', function (t) { ell(t, 0, -7, 4.6, 8.4, 0); }, SAGE, { s: 1, lw: 1.8, hl: false });
    ctx.restore();
    ctx.translate(0, 30); ctx.scale(1.25, 1.25); ctx.translate(0, -30);   // the flower itself (≈ 75·s tall below the stalk)
    // closed bud (fades / shrinks as it opens)
    if (open < 0.99) {
      ctx.save(); ctx.globalAlpha *= 1 - open;
      ctx.translate(0, 30); ctx.scale(1 - 0.25 * open, 1 - 0.1 * open); ctx.translate(0, -30);
      cel(ctx, 'ln.bud', lnBud, BUD, { s: 3, line: BUD.dark, lw: 2.8, hl: [-7, 46, 3, 8, 0.2],
        inner: function (q) {
          q.strokeStyle = rgba(BUD.dark, 0.7); q.lineWidth = 1.6;
          q.beginPath(); q.moveTo(0, 34); q.quadraticCurveTo(-6, 60, 0, 86); q.moveTo(0, 34); q.quadraticCurveTo(9, 58, 6, 80); q.stroke();
        } });
      ctx.restore();
    }
    // open glowing bell
    if (open > 0.01) {
      ctx.save(); ctx.globalAlpha *= Math.min(1, open * 1.4);
      var k = (0.72 + 0.28 * open) * pop;
      ctx.translate(0, 30); ctx.scale(k, k); ctx.translate(0, -30);
      cel(ctx, 'ln.bell', lnBell, GOLD, { s: 3, line: GOLD.dark, lw: 2.8, hl: [-9, 46, 3, 9, 0.25],
        inner: function (q) {
          q.strokeStyle = rgba(GOLD.dark, 0.6); q.lineWidth = 1.5;
          q.beginPath(); q.moveTo(0, 32); q.lineTo(0, 82); q.moveTo(-8, 34); q.quadraticCurveTo(-14, 60, -16, 82); q.moveTo(8, 34); q.quadraticCurveTo(14, 60, 16, 82); q.stroke();
        } });
      // the mouth glows with the thing's colour
      var mg = ctx.createRadialGradient(0, 74, 1, 0, 74, 28);
      mg.addColorStop(0, '#FFFBEA'); mg.addColorStop(0.55, tint); mg.addColorStop(1, rgba(tint, 0.85));
      ctx.fillStyle = mg; fillP(ctx, P('ln.mouth', lnMouth));
      ctx.strokeStyle = GOLD.dark; ctx.lineWidth = 2; strokeP(ctx, P('ln.mouth', lnMouth));
      // mini icon of the thing inside
      if (thing) { ctx.save(); ctx.translate(0, 58); drawIcon(ctx, thing, 34); ctx.restore(); }
      ctx.restore();
    }
    // calyx (sepals) on top
    cel(ctx, 'ln.calyx', function (t) { t.moveTo(-13, 34); t.quadraticCurveTo(-8, 24, 0, 25); t.quadraticCurveTo(8, 24, 13, 34); t.quadraticCurveTo(7, 30, 4, 35); t.quadraticCurveTo(0, 30, -4, 35); t.quadraticCurveTo(-7, 30, -13, 34); t.closePath(); },
      SAGE, { s: 1.2, lw: 2, hl: false });
    ctx.restore();
  }

  // ================================================================= GARLAND (vine + leaves + bud lights + lanterns)
  function vinePt(g, t) {
    var u = 1 - t, mx = (g.x0 + g.x1) / 2, cy2 = g.y + 2 * g.sag;
    return [u * u * g.x0 + 2 * u * t * mx + t * t * g.x1, u * u * g.y + 2 * u * t * cy2 + t * t * g.y];
  }
  function drawGarland(ctx, g, lanterns, t) {
    if (!ctx || !g) return;
    var G2 = { x0: num(g.x0, 0), x1: num(g.x1, 400), y: num(g.y, 100), sag: num(g.sag, 40) }, time = num(t, 0), tw = clamp01(g.twinkle);
    var L = lanterns || g.lanterns || [];
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    var mx = (G2.x0 + G2.x1) / 2, cy2 = G2.y + 2 * G2.sag;
    ctx.strokeStyle = '#5E6A3A'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(G2.x0, G2.y); ctx.quadraticCurveTo(mx, cy2, G2.x1, G2.y); ctx.stroke();
    ctx.strokeStyle = '#8A9A5A'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(G2.x0, G2.y - 1); ctx.quadraticCurveTo(mx, cy2 - 1, G2.x1, G2.y - 1); ctx.stroke();
    var span = Math.max(1, G2.x1 - G2.x0), nL = Math.max(4, Math.round(span / 38));
    for (var i = 1; i < nL; i++) {
      var f = i / nL, p = vinePt(G2, f), up = i % 2 ? -1 : 1, rot = up * (0.7 + hash(i) * 0.5) + Math.sin(time * 1.3 + i) * 0.06;
      ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(rot);
      cel(ctx, 'gl.leaf', function (q) { q.moveTo(0, 0); q.quadraticCurveTo(7, -8, 0, -17); q.quadraticCurveTo(-7, -8, 0, 0); q.closePath(); }, i % 3 ? MOSS : SAGE, { s: 1, lw: 1.8, hl: false });
      ctx.restore();
    }
    // tiny bud lights
    var nB = Math.max(3, Math.round(span / 64));
    for (var j = 0; j < nB; j++) {
      var fb = (j + 0.5) / nB, pb = vinePt(G2, fb), a = 0.45 + 0.4 * Math.sin(time * 2.2 + j * 1.7) + 0.4 * tw;
      a = clamp01(a);
      var gr = ctx.createRadialGradient(pb[0], pb[1] + 4, 0.5, pb[0], pb[1] + 4, 10 + 6 * tw);
      gr.addColorStop(0, 'rgba(255,240,180,' + a.toFixed(3) + ')'); gr.addColorStop(1, 'rgba(255,230,150,0)');
      ctx.fillStyle = gr; ctx.beginPath(); circ(ctx, pb[0], pb[1] + 4, 10 + 6 * tw); ctx.fill();
      dot(ctx, pb[0], pb[1] + 4, 2.6, rgba('#FFF4C8', 0.6 + 0.4 * a));
    }
    // lanterns
    var s = num(g.lanternS, 1);
    for (var k = 0; k < L.length; k++) {
      var ln = L[k] || {};
      drawLantern(ctx, num(ln.x, 0), num(ln.y, 0), s, ln.lit, ln.color, ln.thing, ln.swing);
      if (tw > 0.01) {
        for (var q = 0; q < 3; q++) {
          var an = time * 2 + q * 2.1 + k, rr = 46 * s;
          drawSparkle(ctx, num(ln.x, 0) + Math.cos(an) * rr, num(ln.y, 0) + 64 * s + Math.sin(an) * rr * 0.7, 6 * s, tw * (0.5 + 0.5 * Math.sin(time * 5 + q)), an);
        }
      }
    }
    // home badge under its lantern
    if (g.badge && L[g.badge.i]) {
      var lb = L[g.badge.i], ba = g.badge.a == null ? 1 : clamp01(g.badge.a);
      ctx.save(); ctx.translate(num(lb.x, 0), num(lb.y, 0) + 142 * s);
      drawHomeBadge(ctx, g.badge.home, 30 * s, { a: ba, pop: g.badge.pop == null ? 1 : g.badge.pop });
      ctx.restore();
    }
    ctx.restore();
  }

  // ================================================================= DANDELION FLUFF ((x, y) = centre of the puff)
  function drawFluff(ctx, x, y, r, alpha) {
    if (!ctx) return;
    var a = alpha == null ? 1 : clamp01(alpha); r = num(r, 30);
    if (a <= 0.001 || !(r > 0)) return;
    ctx.save(); ctx.translate(num(x, 0), num(y, 0)); ctx.globalAlpha *= a;
    ctx.lineCap = 'round';
    // soft halo dome
    var gr = ctx.createRadialGradient(0, -r * 0.1, r * 0.1, 0, 0, r * 1.15);
    gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr; ctx.beginPath(); circ(ctx, 0, 0, r * 1.15); ctx.fill();
    var hub = [0, r * 0.42], N = 17;
    // stalk down to the hang point (with the little seed)
    ctx.strokeStyle = '#B9AE94'; ctx.lineWidth = Math.max(1.4, r * 0.07);
    ctx.beginPath(); ctx.moveTo(hub[0], hub[1]); ctx.lineTo(0, r * 1.3); ctx.stroke();
    oval(ctx, 0, r * 1.2, r * 0.07 + 1, r * 0.14 + 1, 0, '#A8916A');
    // filaments in a dome
    for (var i = 0; i < N; i++) {
      var an = Math.PI * (1.08 + 0.84 * i / (N - 1)), ex = Math.cos(an) * r, ey = Math.sin(an) * r * 0.92 + r * 0.05;
      ctx.strokeStyle = 'rgba(160,150,130,0.9)'; ctx.lineWidth = Math.max(1.8, r * 0.07);
      ctx.beginPath(); ctx.moveTo(hub[0], hub[1]); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = Math.max(0.9, r * 0.03);
      ctx.beginPath(); ctx.moveTo(hub[0], hub[1]); ctx.lineTo(ex, ey); ctx.stroke();
      // tuft at the tip: a few short white hairs
      for (var h = -1; h <= 1; h++) {
        var ah = an + h * 0.5;
        ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex + Math.cos(ah) * r * 0.2, ey + Math.sin(ah) * r * 0.2); ctx.stroke();
      }
      dot(ctx, ex, ey, Math.max(1.6, r * 0.075), '#FFFFFF'); ctx.strokeStyle = 'rgba(160,150,130,0.6)'; ctx.lineWidth = 0.8; ctx.beginPath(); circ(ctx, ex, ey, Math.max(1.6, r * 0.075)); ctx.stroke(); ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = Math.max(0.9, r * 0.03);
    }
    dot(ctx, hub[0], hub[1], Math.max(1.6, r * 0.08), '#C9B48E');
    ctx.restore();
  }

  // ================================================================= SPARKLE (4-point twinkle)
  function drawSparkle(ctx, x, y, r, alpha, rot) {
    if (!ctx) return;
    var a = alpha == null ? 1 : clamp01(alpha); r = num(r, 8);
    if (a <= 0.001 || !(r > 0)) return;
    ctx.save(); ctx.translate(num(x, 0), num(y, 0)); ctx.rotate(num(rot, 0)); ctx.globalAlpha *= a;
    var gr = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.9);
    gr.addColorStop(0, 'rgba(255,240,170,0.8)'); gr.addColorStop(1, 'rgba(255,220,120,0)');
    ctx.fillStyle = gr; ctx.beginPath(); circ(ctx, 0, 0, r * 0.9); ctx.fill();
    twinkle(ctx, 0, 0, r, '#FFD66B');
    twinkle(ctx, 0, 0, r * 0.6, '#FFFFFF');
    ctx.restore();
  }

  // ================================================================= HOME BADGES (unit radius 50, centred)
  var BADGE = {
    forest: { sky: ['#CFE6D4', '#EEF5E0'], draw: function (x) {
      oval(x, 0, 48, 70, 24, 0, '#8DAA6A');
      // pine
      x.fillStyle = '#5E8A50'; x.strokeStyle = '#3E6034'; x.lineWidth = 2.4;
      x.beginPath(); x.moveTo(-26, -34); x.lineTo(-8, 4); x.lineTo(-44, 4); x.closePath(); x.fill(); x.stroke();
      x.beginPath(); x.moveTo(-26, -18); x.lineTo(-4, 20); x.lineTo(-48, 20); x.closePath(); x.fill(); x.stroke();
      x.fillStyle = '#7A5130'; x.fillRect(-29, 20, 6, 10);
      // round tree
      x.fillStyle = '#7A5130'; x.fillRect(18, 4, 7, 26);
      x.fillStyle = '#7FA65E'; x.strokeStyle = '#4E7038'; x.beginPath(); circ(x, 21, -6, 18); x.fill(); x.stroke();
      oval(x, 15, -12, 6, 4, -0.5, '#A6C584');
      // toadstool
      x.fillStyle = '#F3E6CC'; x.fillRect(-3, 22, 7, 12);
      x.fillStyle = '#C98C86'; x.strokeStyle = '#8E5A56'; x.lineWidth = 2;
      x.beginPath(); x.moveTo(-10, 24); x.quadraticCurveTo(0, 8, 11, 24); x.closePath(); x.fill(); x.stroke();
      dot(x, -2, 19, 1.8, '#F6E9D2'); dot(x, 4, 21, 1.4, '#F6E9D2');
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
    desert: { sky: ['#F6E3B8', '#FCF2DA'], draw: function (x) {
      dot(x, 22, -22, 11, '#F7C978');
      x.fillStyle = '#E8C48A'; x.beginPath(); x.moveTo(-60, 20); x.quadraticCurveTo(-20, -6, 20, 18); x.quadraticCurveTo(40, 8, 60, 14); x.lineTo(60, 60); x.lineTo(-60, 60); x.closePath(); x.fill();
      x.fillStyle = '#D9AE6E'; x.beginPath(); x.moveTo(-60, 36); x.quadraticCurveTo(0, 14, 60, 34); x.lineTo(60, 60); x.lineTo(-60, 60); x.closePath(); x.fill();
      // cactus
      x.fillStyle = '#7E9A5E'; x.strokeStyle = '#4E6A38'; x.lineWidth = 2.4;
      x.beginPath(); rrect(x, -7, -22, 14, 50, 7); x.fill(); x.stroke();
      x.beginPath(); x.moveTo(-7, 6); x.lineTo(-16, 6); x.quadraticCurveTo(-20, 6, -20, 0); x.lineTo(-20, -8); x.quadraticCurveTo(-20, -13, -16, -13); x.quadraticCurveTo(-13, -13, -13, -8); x.lineTo(-13, 0); x.lineTo(-7, 0); x.closePath(); x.fill(); x.stroke();
      x.beginPath(); x.moveTo(7, -2); x.lineTo(15, -2); x.quadraticCurveTo(18, -2, 18, -8); x.lineTo(18, -16); x.quadraticCurveTo(18, -20, 14.5, -20); x.quadraticCurveTo(11, -20, 11, -16); x.lineTo(11, -8); x.lineTo(7, -8); x.closePath(); x.fill(); x.stroke();
      x.strokeStyle = 'rgba(255,255,255,0.45)'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(-2, -16); x.lineTo(-2, 22); x.stroke();
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
    var B = BADGE[home] || BADGE.forest, s = r / 50 * pop;
    ctx.save(); ctx.globalAlpha *= a; ctx.scale(s, s);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    oval(ctx, 2, 4, 52, 52, 0, 'rgba(60,40,30,0.22)');
    dot(ctx, 0, 0, 52, '#FFFFFF');
    ctx.save(); ctx.beginPath(); circ(ctx, 0, 0, 44); ctx.clip();
    var g = ctx.createLinearGradient(0, -44, 0, 44); g.addColorStop(0, B.sky[0]); g.addColorStop(1, B.sky[1]);
    ctx.fillStyle = g; ctx.fillRect(-46, -46, 92, 92);
    B.draw(ctx);
    ctx.restore();
    ctx.strokeStyle = '#D9CBB4'; ctx.lineWidth = 2.4; ctx.beginPath(); circ(ctx, 0, 0, 44); ctx.stroke();
    ctx.strokeStyle = '#B8A688'; ctx.lineWidth = 2.6; ctx.beginPath(); circ(ctx, 0, 0, 52); ctx.stroke();
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
      var sm = t.big === false ? SMALL : 1, ms = size * (k === 'guest' ? 0.92 : 0.86);
      ctx.translate(0, ms * sm / 2);
      drawThing(ctx, t, ms, {});
    } else if (k === 'letter') {
      ctx.translate(0, size * 0.43); drawThing(ctx, { kind: 'card', text: t.text }, size * 0.86, {});
    } else if (k === 'number') {
      var n = Math.round(num(t.n != null ? t.n : t.text, 1)), s1 = size / 100;
      ctx.scale(s1, s1);
      var dots = n >= 1 && n <= 10;
      cel(ctx, 'ic.card', function (x) { rrect(x, -45, -47, 90, 94, 18); }, CARD, { s: 2.2, line: '#B89B72', lw: 3, hl: false });
      signText(ctx, String(n), 0, dots ? -13 : 0, 70, dots ? 38 : 56, INK);
      if (dots) {
        var rows = n <= 5 ? [n] : [5, n - 5];
        rows.forEach(function (cnt, ri) {
          for (var i = 0; i < cnt; i++) {
            var dx = (i - (cnt - 1) / 2) * 15, dy = rows.length === 1 ? 29 : 22 + ri * 14;
            drawBerry(ctx, dx, dy, 5.6, false);
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
      var inner = t.thing && KINDS.indexOf(t.thing.kind) >= 0 ? Object.assign({}, t.thing) : { kind: 'obj', obj: 'cup', color: t.color || 'blue' };
      var big = t.big === true || t.size === 'big';
      inner.big = true;
      if (big) { ctx.translate(0, size * 0.45); drawThing(ctx, inner, size * 0.9, {}); }
      else {
        ctx.strokeStyle = 'rgba(120,100,80,0.3)'; if (ctx.setLineDash) ctx.setLineDash([5, 5]); ctx.lineWidth = 2;
        ctx.beginPath(); rrect(ctx, -size * 0.44, -size * 0.44, size * 0.88, size * 0.88, size * 0.12); ctx.stroke(); if (ctx.setLineDash) ctx.setLineDash([]);
        ctx.translate(0, size * 0.42); drawThing(ctx, inner, size * 0.9 * SMALL, {});
      }
    } else {
      dot(ctx, 0, 0, size * 0.35, '#E9D7B9'); ctx.strokeStyle = '#A8875E'; ctx.lineWidth = 3; ctx.beginPath(); circ(ctx, 0, 0, size * 0.35); ctx.stroke();
    }
    ctx.restore();
  }

  // ================================================================= HINT HAND (fingertip at (x, y), points UP-LEFT)
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
    var F = '#FFF6EA', L = '#B9835A', EDGE = '#4A3B3A';
    ctx.save();
    if (p > 0.02) {
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.9 * p).toFixed(3) + ')'; ctx.lineWidth = s * 0.035;
      ctx.beginPath(); ctx.arc(0, 0, s * (0.1 + 0.14 * (1 - p)), 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,214,90,' + (0.7 * p).toFixed(3) + ')'; ctx.lineWidth = s * 0.02;
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
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
    hand(ctx); ctx.lineWidth = s * 0.07 + 6; ctx.strokeStyle = EDGE; ctx.stroke(); ctx.restore();
    hand(ctx); ctx.lineWidth = s * 0.07; ctx.strokeStyle = L; ctx.stroke();
    hand(ctx); ctx.fillStyle = F; ctx.fill();
    ctx.strokeStyle = '#F1D6B8'; ctx.lineWidth = s * 0.03;
    ctx.beginPath(); ctx.moveTo(0, s * 0.5); ctx.lineTo(s * 0.18, s * 0.5); ctx.moveTo(0, s * 0.62); ctx.lineTo(s * 0.18, s * 0.62); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.beginPath(); ell(ctx, -s * 0.03, s * 0.12, s * 0.025, s * 0.07, 0); ctx.fill();
    // cuff: Moka's cream knitted scarf with the soft teal stripe
    ctx.fillStyle = '#F6EEDD'; ctx.strokeStyle = '#B8A27E'; ctx.lineWidth = s * 0.03;
    ctx.beginPath(); rrect(ctx, -s * 0.26, s * 0.76, s * 0.48, s * 0.16, s * 0.07); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#6FB7B0'; ctx.fillRect(-s * 0.24, s * 0.82, s * 0.44, s * 0.04);
    ctx.strokeStyle = 'rgba(184,162,126,0.7)'; ctx.lineWidth = s * 0.012;
    ctx.beginPath(); for (var i = 0; i < 6; i++) { var kx = -s * 0.2 + i * s * 0.075; ctx.moveTo(kx, s * 0.78); ctx.lineTo(kx + s * 0.02, s * 0.81); ctx.moveTo(kx, s * 0.87); ctx.lineTo(kx + s * 0.02, s * 0.9); } ctx.stroke();
    ctx.restore();
  }

  function clearCache() { pcache = {}; pN = 0; bcache = {}; lcache = {}; tcache = {}; }

  FT.TeaArt = {
    drawThing: drawThing, bodyBox: bodyBox, drawPlacemat: drawPlacemat, drawTable: drawTable, drawGarland: drawGarland,
    drawLantern: drawLantern, drawFluff: drawFluff, drawHomeBadge: drawHomeBadge, drawIcon: drawIcon,
    drawHintHand: drawHintHand, drawSparkle: drawSparkle,
    berryLayout: function (n, rMax) { var L = berryLayout(n, rMax); return { n: L.n, r: L.r, pts: L.pts.map(function (p) { return [p[0], p[1]]; }) }; },
    PLATE_WELL: { cx: PL.cx, cy: PL.cy + 1, rx: PL.irx, ry: PL.iry },
    pal: function (n) { return pal(n) || null; }, PALETTE: FALLBACK, TABLE: TABLE, FONT: FONT,
    OBJECTS: OBJECTS, SHAPES: SHAPES, ANIMALS: ANIMALS, HOMES: HOMES, KINDS: KINDS, SMALL: SMALL,
    TABLE_THICK: 46, LANTERN: { stalk: 30, bell: 75 },
    thingKey: thingKey, clearCache: clearCache
  };
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
