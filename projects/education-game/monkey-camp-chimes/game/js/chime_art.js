/* Kiki's Camp Chimes — CC.ChimeArt (character artist B), DESIGN §3 / §4.2. Everything here is drawn by code on a 2D canvas.
 *
 *   drawChime(ctx, thing, size, opt)  origin = the TOP of the body (cord attach point), the body hangs DOWN (+y).
 *       size = the body's design size (the longest side of a bell / plate / tag; strings use the same bell scale for
 *       every n, so a 1-bell string is smaller than a 5-bell string — fair for counting).
 *       thing = { kind: 'bell'|'plate'|'string'|'dots'|'animal'|'glyph', color?, shape?, n?, animal?, text?, big? }
 *       opt   = { glow 0..1, ring 0..1, flash 0..1 (rim flash; default = ring — pass 0 for a "wrong" dull ring),
 *                 dim 0..1, count -1|0..n, clap -1..1, night 0..1, pop 0..1 (scales about the anchor), t (s) }
 *   bodyBox(thing, size) → { w, h, cy }   visible box in px (w, h ≤ size), cy = body centre below the anchor.
 *   drawCord(ctx, x0, y0, x1, y1, opt)    twisted jute cord; opt { night }
 *   drawBeam(ctx, layout, opt)            log beam + two pine posts + brass hooks; opt { t, wob, night, hooks:[x | {x}] }
 *   hookPoint(layout, x, wob) → {x, y}    where a cord starts (the bottom of the brass screw-eye under the beam)
 *   drawGarland(ctx, garland, lanterns, opt)   lanterns[i] = {x, y (lantern CENTRE, on the string), lit, color, swing, flash}
 *                                         opt { t, night, r (lantern radius, default 19) }
 *   drawFire(ctx, fire, opt)              fire = {x, y, s} base centre; opt { t, glow }; flame tip ≈ y − 110·s (fireTop)
 *   drawNote(ctx, x, y, size, opt)        ♪ centred at (x, y), size = height; opt { color, alpha, rot }
 *   drawIcon(ctx, thing, size)            centred in a size × size box: any chime thing, or number {n} | color {color} |
 *                                         size {big, color?} | letter {text}
 *   drawGhostHand(ctx, size, press)       friendly pointing hand, origin = fingertip (finger points UP-LEFT), press 0..1
 *   drawFirefly(ctx, x, y, r, glow)       r = body radius (px)
 *   Helpers: pal(color), PALETTE, BRASS, WOOD, FONT, SHAPES, ANIMALS, KINDS, thingKey, lanternRadius, fireTop, clearCache.
 *
 * All chimes are designed in a 100-unit box (x −50..50, y 0..100, anchor at (0, 0)); the ctx is scaled by size / 100.
 * Path2D objects are cached per part (size independent — equivalent to per thing+size because the ctx is scaled).
 * Node-safe at load (no DOM). Without Path2D (node tests) paths are rebuilt on the ctx each draw.
 */
(function (G) {
  'use strict';
  var CC = G.CC = G.CC || {};

  var TAU = Math.PI * 2, LW = 3.6;            // outline width in the 100-unit design box (≈ 4 px at 112)
  var FONT = 'ui-rounded, "Arial Rounded MT Bold", Nunito, "Arial Black", system-ui, sans-serif';
  var FALLBACK = {
    red:    { base: '#E84A4A', dark: '#A8282E', light: '#F7A0A0' },
    blue:   { base: '#3C8DE8', dark: '#1F5BA8', light: '#A6CCF5' },
    yellow: { base: '#FFD23F', dark: '#C99A12', light: '#FFEB9C' },
    green:  { base: '#4CC26B', dark: '#2A8343', light: '#A8E6B8' },
    orange: { base: '#FF9A2E', dark: '#C4650C', light: '#FFCB8E' },
    purple: { base: '#8E44AD', dark: '#6840A8', light: '#D2BDF3' },
    pink:   { base: '#FF8FC0', dark: '#C9558A', light: '#FFCCE2' }
  };
  var BRASS = { base: '#D8B26A', dark: '#9C7838', light: '#F3DFAE' };
  var WOOD = { base: '#A87245', dark: '#6E4526', light: '#D29A66' };
  var TAG = { base: '#8FA6C9', dark: '#5D7299', light: '#C9D6EA' };      // default glyph edge
  var GOLD = { base: '#E9B949', dark: '#9C7838', light: '#F8E3A6' };     // notes / lanterns with no colour
  var SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'rect', 'diamond', 'oval'];
  var ANIMALS = ['bear', 'fox', 'owl', 'deer', 'rabbit', 'squirrel', 'frog', 'duck'];
  var KINDS = ['bell', 'plate', 'string', 'dots', 'animal', 'glyph'];
  var EYE = '#2F2A3A', CHEEK = '#F4A9A0', NOSE = '#4E3426', MOUTH = '#7A2E3A', TONGUE = '#F28B9A';

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
  function pal(name) {
    var P = CC.PALETTE, c = P && P[name] && P[name].base ? P[name] : FALLBACK[name];
    return c || null;
  }
  function lineOf(c) { return c.base === '#FFD23F' ? '#A87E0A' : c.dark; }   // yellow gets a deeper outline so it reads
  function shadeOf(c) { return mix(c.base, c.dark, 0.36); }

  // ---------------------------------------------------------------- path recorder (bbox) + Path2D cache
  function Rec() { this.c = []; this.x0 = 1e9; this.y0 = 1e9; this.x1 = -1e9; this.y1 = -1e9; this.px = 0; this.py = 0; }
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
  function mirror(pts) { return pts.map(function (p) { return [-p[0], p[1]]; }).reverse(); }

  function hasP2D() { return typeof Path2D !== 'undefined'; }
  var pcache = {}, pN = 0, bcache = {};
  function P(key, build) {
    if (!hasP2D()) return build;
    var p = pcache[key];
    if (!p) { if (pN > 2500) { pcache = {}; pN = 0; } p = pcache[key] = new Path2D(); build(p); pN++; }
    return p;
  }
  function fillP(ctx, p) { if (typeof p === 'function') { ctx.beginPath(); p(ctx); ctx.fill(); } else ctx.fill(p); }
  function strokeP(ctx, p) { if (typeof p === 'function') { ctx.beginPath(); p(ctx); ctx.stroke(); } else ctx.stroke(p); }
  function clipP(ctx, p) { if (typeof p === 'function') { ctx.beginPath(); p(ctx); ctx.clip(); } else ctx.clip(p); }
  function bbox(key, build) { var b = bcache[key]; if (!b) { var r = new Rec(); build(r); b = bcache[key] = { x: r.x0, y: r.y0, w: r.x1 - r.x0, h: r.y1 - r.y0 }; } return b; }

  /** one-step cel shading: base, a shade crescent lower-right, a soft highlight upper-left, the outline */
  function cel(ctx, key, build, c, o) {
    o = o || {};
    var p = P(key, build), b = bbox(key, build), s = o.s != null ? o.s : Math.max(1.5, Math.min(7, Math.min(b.w, b.h) * 0.12));
    ctx.fillStyle = c.base; fillP(ctx, p);
    ctx.save(); clipP(ctx, p);
    ctx.fillStyle = o.shade || shadeOf(c); ctx.fillRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
    ctx.translate(-s, -s * 1.1); ctx.fillStyle = c.base; fillP(ctx, p); ctx.translate(s, s * 1.1);
    if (o.hl !== false) {
      var h = o.hl || [b.x + b.w * 0.3, b.y + b.h * 0.26, Math.max(1, b.w * 0.13), Math.max(0.8, b.h * 0.08), -0.6];
      ctx.fillStyle = o.hlc || rgba(mix(c.light, '#FFFFFF', 0.45), 0.85);
      ctx.beginPath(); ell(ctx, h[0], h[1], h[2], h[3], h[4] || 0); ctx.fill();
    }
    if (o.inner) o.inner(ctx);
    ctx.restore();
    if (o.line !== false) { ctx.strokeStyle = o.line || lineOf(c); ctx.lineWidth = o.lw || LW; strokeP(ctx, p); }
    return p;
  }
  function part(ctx, key, build, fill, line, lw) {
    var p = P(key, build);
    if (fill) { ctx.fillStyle = fill; fillP(ctx, p); }
    if (line) { ctx.strokeStyle = line; ctx.lineWidth = lw || LW; strokeP(ctx, p); }
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

  // ---------------------------------------------------------------- faces
  function eye(ctx, x, y, r, happy) {
    if (happy) {
      ctx.strokeStyle = EYE; ctx.lineWidth = r * 0.8; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - r, y + r * 0.35); ctx.quadraticCurveTo(x, y - r * 1.1, x + r, y + r * 0.35); ctx.stroke();
      return;
    }
    oval(ctx, x, y, r, r * 1.15, 0, EYE);
    dot(ctx, x - r * 0.3, y - r * 0.4, r * 0.42, '#FFFFFF');
    dot(ctx, x + r * 0.35, y + r * 0.42, r * 0.17, 'rgba(255,255,255,0.8)');
  }
  function cheek(ctx, x, y, r) { oval(ctx, x, y, r, r * 0.62, 0, rgba(CHEEK, 0.8)); }
  /** a small mouth: closed smile, or (open > 0) an open singing "o"-smile */
  function mouth(ctx, x, y, w, open, col) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (open > 0.05) {
      var h = w * (0.5 + 1.1 * open);
      ctx.fillStyle = MOUTH; ctx.beginPath(); ctx.moveTo(x - w, y); ctx.quadraticCurveTo(x, y - w * 0.25, x + w, y);
      ctx.quadraticCurveTo(x + w * 0.9, y + h, x, y + h); ctx.quadraticCurveTo(x - w * 0.9, y + h, x - w, y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = TONGUE; ctx.beginPath(); ell(ctx, x, y + h * 0.72, w * 0.5, h * 0.24, 0); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x - w, y); ctx.quadraticCurveTo(x, y - w * 0.25, x + w, y);
      ctx.quadraticCurveTo(x + w * 0.9, y + h, x, y + h); ctx.quadraticCurveTo(x - w * 0.9, y + h, x - w, y); ctx.closePath(); ctx.stroke();
    } else {
      ctx.strokeStyle = col; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(x - w, y); ctx.quadraticCurveTo(x - w * 0.5, y + w * 0.75, x, y + w * 0.1);
      ctx.quadraticCurveTo(x + w * 0.5, y + w * 0.75, x + w, y); ctx.stroke();
    }
  }

  // ---------------------------------------------------------------- shared hardware
  /** brass loop at the very top (anchor y = 0) reaching down to y1 (the hole) — drawn BEHIND the body */
  function topLoop(ctx, y1) {
    var cy = (y1 + 1.6) / 2, ry = cy - 1.6;
    ctx.strokeStyle = BRASS.dark; ctx.lineWidth = 4.6; ctx.beginPath(); ell(ctx, 0, cy, 4.3, ry, 0); ctx.stroke();
    ctx.strokeStyle = BRASS.base; ctx.lineWidth = 2.4; ctx.beginPath(); ell(ctx, 0, cy, 4.3, ry, 0); ctx.stroke();
    ctx.strokeStyle = BRASS.light; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, cy - ry + 3.4, 3, Math.PI * 1.1, Math.PI * 1.6); ctx.stroke();
  }
  /** a hole through a plate with the brass wire showing through it */
  function hole(ctx, y, rim) {
    dot(ctx, 0, y, 3.6, rim || 'rgba(60,40,30,0.55)');
    dot(ctx, 0, y, 2.4, '#4A3A30');
    line(ctx, [0, y - 3.4, 0, y + 1.2], BRASS.base, 2.2);
  }

  // ================================================================= BELL
  var bellBody = function (t) {
    t.moveTo(-39, 80);
    t.bezierCurveTo(-32, 75, -27, 63, -27, 47);
    t.bezierCurveTo(-27, 27, -19, 15, 0, 15);
    t.bezierCurveTo(19, 15, 27, 27, 27, 47);
    t.bezierCurveTo(27, 63, 32, 75, 39, 80);
    t.quadraticCurveTo(42, 82.5, 40.5, 85);
    t.quadraticCurveTo(39.5, 87.5, 35, 87.5);
    t.lineTo(-35, 87.5);
    t.quadraticCurveTo(-39.5, 87.5, -40.5, 85);
    t.quadraticCurveTo(-42, 82.5, -39, 80);
    t.closePath();
  };
  var bellCrown = function (t) { rrect(t, -9, 9.5, 18, 8.5, 3.5); };
  var bellMouth = function (t) { ell(t, 0, 87.5, 33, 3.4, 0); };
  var bellLip = function (t) { t.moveTo(-38.5, 79.5); t.quadraticCurveTo(0, 88, 38.5, 79.5); };
  var bellBand = function (t) { t.moveTo(-26.5, 55); t.quadraticCurveTo(0, 62, 26.5, 55); };
  var bellBall = function (t) { circ(t, 0, 93.6, 4.6); };

  /** a whole bell in bell units (0..100); c = colour, lw = outline, clap = −1..1, loop = draw the brass top loop */
  function bellAt(ctx, c, lw, clap, loop, shine) {
    var cx = clap * 7;
    if (loop) topLoop(ctx, 12);
    // clapper (behind the lip, the ball peeks out below)
    line(ctx, [0, 84, cx * 0.9, 90], BRASS.dark, lw * 0.8);
    ctx.save(); ctx.translate(cx, 0); cel(ctx, 'bell.ball', bellBall, BRASS, { lw: lw * 0.8, s: 1.6, hl: [-1.6, 91.8, 1.6, 1.1, -0.6] }); ctx.restore();
    cel(ctx, 'bell.crown', bellCrown, BRASS, { lw: lw * 0.85, s: 2 });
    cel(ctx, 'bell.body', bellBody, c, {
      lw: lw, s: 6.5, hl: false,
      inner: function (x) {
        // waist band + lip rim (light tone over a dark under-line)
        x.lineCap = 'round';
        x.strokeStyle = rgba(c.dark, 0.45); x.lineWidth = 4.2; strokeP(x, P('bell.band', bellBand));
        x.strokeStyle = c.light; x.lineWidth = 2.6; x.save(); x.translate(0, -1.6); strokeP(x, P('bell.band', bellBand)); x.restore();
        x.strokeStyle = rgba(c.light, 0.95); x.lineWidth = 3; strokeP(x, P('bell.lip', bellLip));
        // shiny streak + glint
        if (shine !== false) {
          oval(x, -14, 40, 4.6, 14, 0.14, 'rgba(255,255,255,0.62)');
          oval(x, -16.5, 66, 2.6, 4.2, 0.2, 'rgba(255,255,255,0.45)');
          oval(x, 12, 26, 3, 2, 0.5, 'rgba(255,255,255,0.35)');
        }
      }
    });
    part(ctx, 'bell.mouth', bellMouth, mix(c.dark, '#2F2A3A', 0.25), null);
    // the clapper stem visible between the lip and the ball
    line(ctx, [0, 87.4, cx * 0.95, 90.5], BRASS.dark, lw * 0.75);
  }
  var BELL = {
    box: function () { return { w: 86, h: 100, cy: 52 }; },
    sil: function (t) { bellBody(t); bellCrown(t); },
    inner: function () { return bellBody; },
    col: function (th) { return pal(th.color) || FALLBACK.red; },
    draw: function (ctx, th, o) { bellAt(ctx, this.col(th), LW, num(o.clap, 0), true); }
  };

  // ================================================================= PLATE (shape cut-out)
  function starPts(cx, cy, ro, ri) {
    var pts = [];
    for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? ri : ro; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    return pts;
  }
  var SHAPE = {
    circle:   { b: function (t) { circ(t, 0, 56, 42.5); }, hole: 22 },
    square:   { b: function (t) { rrect(t, -41, 15, 82, 82, 11); }, hole: 24 },
    triangle: { b: function (t) { rpoly(t, [[0, 11], [47.5, 95], [-47.5, 95]], [10, 10, 10]); }, hole: 32 },
    star:     { b: function (t) { rpoly(t, starPts(0, 58.5, 49, 22), [5, 2.5, 5, 2.5, 5, 2.5, 5, 2.5, 5, 2.5]); }, hole: 25 },
    heart:    { b: function (t) {
      t.moveTo(0, 96);
      t.bezierCurveTo(-14, 85, -46.5, 66, -46.5, 39);
      t.bezierCurveTo(-46.5, 23, -35, 14, -23, 14);
      t.bezierCurveTo(-11, 14, -3, 21, 0, 30);
      t.bezierCurveTo(3, 21, 11, 14, 23, 14);
      t.bezierCurveTo(35, 14, 46.5, 23, 46.5, 39);
      t.bezierCurveTo(46.5, 66, 14, 85, 0, 96);
      t.closePath();
    }, hole: 37 },
    rect:     { b: function (t) { rrect(t, -48.5, 23, 97, 64.6, 10); }, hole: 31 },
    diamond:  { b: function (t) { rpoly(t, [[0, 11], [33.5, 54.5], [0, 98], [-33.5, 54.5]], [8, 8, 8, 8]); }, hole: 25 },
    oval:     { b: function (t) { ell(t, 0, 55.5, 32, 43, 0); }, hole: 21 }
  };
  function shapeOf(th) { return SHAPE[th.shape] ? th.shape : 'circle'; }
  function boxFromPath(key, build, extra) {
    var b = bbox(key, build), h = LW / 2;
    return { w: Math.min(100, b.w + LW), h: Math.min(100, b.y + b.h + h + (extra || 0)), cy: b.y + b.h / 2 };
  }
  var PLATE = {
    box: function (th) { var s = shapeOf(th); return boxFromPath('plate.' + s, SHAPE[s].b); },
    sil: function (t, th) { SHAPE[shapeOf(th)].b(t); },
    inner: function (th) { return SHAPE[shapeOf(th)].b; },
    col: function (th) { return pal(th.color) || FALLBACK.blue; },
    draw: function (ctx, th) {
      var s = shapeOf(th), S = SHAPE[s], c = this.col(th), key = 'plate.' + s, b = bbox(key, S.b);
      topLoop(ctx, S.hole);
      cel(ctx, key, S.b, c, {
        s: 5.5, hl: false,
        inner: function (x) {
          // bevel: a light inner band upper-left, darker lower-right
          x.save(); x.translate(1.6, 1.8); x.strokeStyle = rgba(c.dark, 0.32); x.lineWidth = 9; strokeP(x, P(key, S.b)); x.restore();
          x.save(); x.translate(-1.2, -1.2); x.strokeStyle = rgba(mix(c.light, '#FFFFFF', 0.3), 0.55); x.lineWidth = 6; strokeP(x, P(key, S.b)); x.restore();
          // diagonal metal shine
          x.fillStyle = 'rgba(255,255,255,0.32)';
          x.beginPath(); x.moveTo(b.x + b.w * 0.18, b.y + b.h); x.lineTo(b.x + b.w * 0.36, b.y + b.h);
          x.lineTo(b.x + b.w * 0.86, b.y); x.lineTo(b.x + b.w * 0.68, b.y); x.closePath(); x.fill();
          x.fillStyle = 'rgba(255,255,255,0.22)';
          x.beginPath(); x.moveTo(b.x + b.w * 0.42, b.y + b.h); x.lineTo(b.x + b.w * 0.47, b.y + b.h);
          x.lineTo(b.x + b.w * 0.97, b.y); x.lineTo(b.x + b.w * 0.92, b.y); x.closePath(); x.fill();
          sparkle(x, b.x + b.w * 0.3, b.y + b.h * 0.3, 4.5, 'rgba(255,255,255,0.9)');
        }
      });
      hole(ctx, S.hole, rgba(c.dark, 0.6));
    }
  };

  var CREAM = { base: '#FFF6E6', dark: '#B89B72', light: '#FFFFFF' };

  // ================================================================= MINI BELLS (strings, animal bells)
  /** a little brass bell whose crown top sits at (x, y); k = scale; lw = outline (units); lit → white ring + shine */
  var BRASS_S = { base: BRASS.base, dark: '#7A5A26', light: BRASS.light };   // string bells: same brass, deeper outline
  function miniBell(ctx, x, y, k, clap, lit, lw, c) {
    ctx.save(); ctx.translate(x, y); ctx.scale(k, k); ctx.translate(0, -9.5);
    bellAt(ctx, c || BRASS, (lw || 2.3) / k, clap, false, true);
    ctx.restore();
    if (lit > 0) {
      var cy = y + (52 - 9.5) * k, r = 46 * k;
      ctx.save(); ctx.globalAlpha *= clamp01(lit);
      ctx.strokeStyle = 'rgba(255,200,70,0.7)'; ctx.lineWidth = 7; ctx.beginPath(); circ(ctx, x, cy, r); ctx.stroke();
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 3.6; ctx.beginPath(); circ(ctx, x, cy, r); ctx.stroke();
      sparkle(ctx, x + r * 0.66, cy - r * 0.7, 6.5, '#FFFFFF');
      ctx.restore();
    }
  }

  // ================================================================= STRING (counting: n brass bells on a cream board)
  // Every n uses the SAME board (96 × 88) and the SAME bell size (0.35 scale ≈ 0.31 × size wide incl. outline), so a 1-bell and a
  // 5-bell string are equally big and only the number of bells differs (fair counting). 1–2 bells hang in one row;
  // 3–5 hang in a left → right zig-zag of two rows (top, bottom, top, …), so the cords pass between the top bells.
  // Bells are numbered left → right (that is the order opt.count lights them).
  var MB_K = 0.35, MB_H = (100 - 9.5) * MB_K;                   // mini bell scale + height below its crown top (31.7)
  var SB = { x: -48, y: 10, w: 96, h: 88, r: 13 };               // the cream backing board
  var BAR = { x: -42, y: 19, w: 84, h: 9 };                      // the wooden bar the bells hang from
  var ROW_TOP = 33, ROW_BOT = 64.5, ROW_ONE = 46;                // crown tops of the rows
  var STRX = { 1: [0], 2: [-19, 19], 3: [-27, 0, 27], 4: [-33, -11, 11, 33], 5: [-34, -17, 0, 17, 34] };
  function strN(th) { var n = Math.round(num(th.n, 3)); return n < 1 ? 1 : n > 5 ? 5 : n; }
  function strBells(n) {
    return STRX[n].map(function (x, i) {
      return { x: x, y: n <= 2 ? ROW_ONE + (n === 2 ? i * 4 : 0) : (i % 2 ? ROW_BOT : ROW_TOP) };
    });
  }
  var strBoard = function (t) { rrect(t, SB.x, SB.y, SB.w, SB.h, SB.r); };
  var strBar = function (t) { rrect(t, BAR.x, BAR.y, BAR.w, BAR.h, BAR.h / 2); };
  var STRING = {
    box: function () { return boxFromPath('str.board', strBoard); },
    sil: strBoard,
    inner: function () { return strBoard; },
    col: function () { return BRASS; },
    draw: function (ctx, th, o) {
      var n = strN(th), B = strBells(n), clap = num(o.clap, 0), cnt = o.count == null ? -1 : o.count, i;
      topLoop(ctx, 16);
      cel(ctx, 'str.board', strBoard, CREAM, {
        s: 4, shade: '#F1E2C6', line: CREAM.dark, lw: 3.2, hl: false,
        inner: function (x) {   // wood grain + an inner bevel
          x.strokeStyle = 'rgba(184,155,114,0.2)'; x.lineWidth = 1.3; x.beginPath();
          x.moveTo(-44, 50); x.bezierCurveTo(-20, 46, 10, 54, 44, 49);
          x.moveTo(-44, 82); x.bezierCurveTo(-14, 86, 16, 78, 44, 83); x.stroke();
          x.strokeStyle = 'rgba(184,155,114,0.32)'; x.lineWidth = 3; x.beginPath(); rrect(x, SB.x + 4, SB.y + 4, SB.w - 8, SB.h - 8, SB.r - 4); x.stroke();
        }
      });
      hole(ctx, 15, 'rgba(110,80,50,0.45)');
      // cords (behind the bar knots, in front of the board)
      for (i = 0; i < n; i++) {
        line(ctx, [B[i].x, BAR.y + BAR.h - 1, B[i].x, B[i].y + 1], '#6E5236', 2.8);
        line(ctx, [B[i].x, BAR.y + BAR.h - 1, B[i].x, B[i].y + 1], '#C29A66', 1.2);
      }
      cel(ctx, 'str.bar', strBar, WOOD, { lw: 2.8, s: 2.2, hl: [-20, BAR.y + 2.6, 16, 1.2, 0] });
      for (i = 0; i < n; i++) dot(ctx, B[i].x, BAR.y + BAR.h - 1.6, 1.7, WOOD.dark);
      // soft shadows of the bells on the board, then the bells
      for (i = 0; i < n; i++) oval(ctx, B[i].x + 2.2, B[i].y + MB_H * 0.55, 14, 15, 0, 'rgba(150,110,70,0.16)');
      for (i = 0; i < n; i++) {
        var lit = cnt >= 0 && i < cnt ? 1 : 0;
        miniBell(ctx, B[i].x, B[i].y, MB_K, clap * (i % 2 ? -1 : 1) * (0.7 + 0.3 * ((i * 7) % 3) / 2), lit, 3, BRASS_S);
      }
    }
  };

  // ================================================================= DOTS plate
  var DOTC = FALLBACK.red;
  var dotsPlate = function (t) { circ(t, 0, 56, 42.5); };
  function dotLayout(n) {
    var out = [], i, r, sp, rows;
    if (n <= 3) { sp = 24; r = 9.5; for (i = 0; i < n; i++) out.push([(i - (n - 1) / 2) * sp, 57, r]); return out; }
    if (n <= 5) { sp = 16.8; r = 6.7; for (i = 0; i < n; i++) out.push([(i - (n - 1) / 2) * sp, 57, r]); return out; }
    if (n <= 10) { sp = 15.8; r = 6.1; rows = [47.5, 65.5]; } else { sp = 14.6; r = 5.7; rows = [41, 56, 71]; }
    for (i = 0; i < n; i++) {
      var row = Math.floor(i / 5), col = i % 5, inRow = row < 2 ? 5 : n - 10;
      out.push([row < 2 ? (col - 2) * sp : (col - (inRow - 1) / 2) * sp, rows[row], r]);   // ten-frame, extras centred below
    }
    return out;
  }
  var DOTS = {
    box: function () { return boxFromPath('dots.plate', dotsPlate); },
    sil: dotsPlate,
    inner: function () { return dotsPlate; },
    col: function () { return DOTC; },
    draw: function (ctx, th, o) {
      var n = Math.max(1, Math.min(12, Math.round(num(th.n, 3)))), cnt = o.count == null ? -1 : o.count, L = dotLayout(n);
      topLoop(ctx, 22);
      cel(ctx, 'dots.plate', dotsPlate, CREAM, {
        s: 4.5, shade: '#F1E2C6', line: CREAM.dark, hl: false,
        inner: function (x) {   // wood grain rings
          x.strokeStyle = 'rgba(184,155,114,0.22)'; x.lineWidth = 1.4;
          x.beginPath(); ell(x, 6, 60, 30, 26, 0.3); x.stroke();
          x.beginPath(); ell(x, 6, 60, 18, 15, 0.3); x.stroke();
          x.strokeStyle = 'rgba(184,155,114,0.35)'; x.lineWidth = 3.4; x.beginPath(); circ(x, 0, 56, 38); x.stroke();
        }
      });
      hole(ctx, 22, 'rgba(110,80,50,0.45)');
      for (var i = 0; i < L.length; i++) {
        var d = L[i];
        dot(ctx, d[0] + 0.8, d[1] + 1.4, d[2], 'rgba(150,110,70,0.25)');
        dot(ctx, d[0], d[1], d[2], DOTC.base);
        ctx.strokeStyle = DOTC.dark; ctx.lineWidth = 1.9; ctx.beginPath(); circ(ctx, d[0], d[1], d[2]); ctx.stroke();
        oval(ctx, d[0] - d[2] * 0.32, d[1] - d[2] * 0.36, d[2] * 0.34, d[2] * 0.24, -0.6, 'rgba(255,255,255,0.75)');
        if (cnt >= 0 && i < cnt) {
          ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2.4; ctx.beginPath(); circ(ctx, d[0], d[1], d[2] + 2.8); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,190,60,0.8)'; ctx.lineWidth = 1.2; ctx.beginPath(); circ(ctx, d[0], d[1], d[2] + 4.6); ctx.stroke();
        }
      }
    }
  };

  // ================================================================= GLYPH tag
  var tagPath = function (t) { rpoly(t, [[-25, 12], [25, 12], [41, 28], [41, 98], [-41, 98], [-41, 28]], [8, 8, 9, 13, 13, 9]); };
  var tagFace = function (t) { rrect(t, -33.5, 30, 67, 61, 11); };
  function glyphText(t) { var s = t.text != null ? String(t.text) : t.n != null ? String(t.n) : '?'; return s.length ? s.slice(0, 2) : '?'; }
  function glyphFont(px) { return '900 ' + Math.round(px * 10) / 10 + 'px ' + FONT; }
  /** chunky carved text centred at (x, y) fitting maxW × maxH; col = ink colour */
  function carvedText(ctx, txt, x, y, maxW, maxH, col) {
    var px = maxH * 1.12;
    ctx.font = glyphFont(px);
    var m = ctx.measureText ? ctx.measureText(txt) : null, w = m && m.width > 0 ? m.width : px * 0.64 * txt.length;
    if (w > maxW) { px *= maxW / w; ctx.font = glyphFont(px); m = ctx.measureText ? ctx.measureText(txt) : null; }
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    var asc = m && m.actualBoundingBoxAscent > 0 ? m.actualBoundingBoxAscent : px * 0.72,
      desc = m && m.actualBoundingBoxDescent >= 0 && m.actualBoundingBoxAscent > 0 ? m.actualBoundingBoxDescent : 0;
    var by = y + (asc - desc) / 2;
    ctx.lineJoin = 'round';
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fillText(txt, x + 0.9, by + 1.6);       // the carved lip catches light
    ctx.fillStyle = mix(col, '#2F2A3A', 0.35); ctx.fillText(txt, x - 0.5, by - 0.6);       // inner wall
    ctx.fillStyle = col; ctx.fillText(txt, x, by);
  }
  var GLYPH = {
    box: function () { return boxFromPath('glyph.tag', tagPath); },
    sil: tagPath,
    inner: function () { return tagPath; },
    col: function (th) { return pal(th.color) || TAG; },
    draw: function (ctx, th) {
      var c = this.col(th), txt = glyphText(th);
      topLoop(ctx, 21);
      cel(ctx, 'glyph.tag', tagPath, c, { s: 4.5, hl: [-24, 22, 9, 3, -0.3] });
      cel(ctx, 'glyph.face', tagFace, { base: '#FFF8EC', dark: '#D8C3A0', light: '#FFFFFF' }, {
        s: -2.6, shade: '#EBDCC0', line: mix(c.dark, '#D8C3A0', 0.35), lw: 2.2, hl: false,
        inner: function (x) {
          x.strokeStyle = 'rgba(190,160,120,0.22)'; x.lineWidth = 1.2;
          x.beginPath(); x.moveTo(-30, 40); x.bezierCurveTo(-10, 37, 10, 43, 30, 39);
          x.moveTo(-30, 80); x.bezierCurveTo(-8, 83, 12, 77, 30, 81); x.stroke();
        }
      });
      hole(ctx, 21, rgba(c.dark, 0.6));
      var ink = c === TAG ? '#3E4F72' : (c.base === '#FFD23F' ? '#A87E0A' : c.dark);
      carvedText(ctx, txt, 0, 61, txt.length > 1 ? 60 : 52, 50, ink);
    }
  };

  // ================================================================= ANIMAL cut-outs
  var BORDER = 5.4, EDGE = 1.4;            // white sticker border (6 px at 112) + a thin wood edge outside it
  function A(def) { return def; }
  var AN = {
    bear: A({
      c: { base: '#B07A4E', dark: '#7A4F2E', light: '#E8C79E' },
      parts: [
        ['earL', function (t) { circ(t, -22, 27, 11); }], ['earR', function (t) { circ(t, 22, 27, 11); }],
        ['head', function (t) { ell(t, 0, 48.5, 29, 25.5, 0); }]
      ],
      face: function (ctx, c, o) {
        dot(ctx, -22, 27.5, 5.5, c.light); dot(ctx, 22, 27.5, 5.5, c.light);
        cel(ctx, 'bear.muz', function (t) { ell(t, 0, 58, 13.5, 10.5, 0); }, { base: '#F2DCC0', dark: '#B48A62', light: '#FFFFFF' }, { lw: 2.2, s: 2, hl: false });
        oval(ctx, 0, 53, 5.6, 3.9, 0, NOSE); dot(ctx, -1.6, 51.8, 1.4, 'rgba(255,255,255,0.7)');
        eye(ctx, -11.5, 42, 3.7); eye(ctx, 11.5, 42, 3.7);
        cheek(ctx, -19, 53, 4.2); cheek(ctx, 19, 53, 4.2);
        line(ctx, [0, 56.5, 0, 59.5], NOSE, 1.8);
        mouth(ctx, 0, 60, 5, o, NOSE);
      }
    }),
    fox: A({
      c: { base: '#D98A55', dark: '#9A5530', light: '#F6D2B4' },
      parts: [
        ['earL', function (t) { rpoly(t, [[-35, 15], [-11, 27], [-28, 43]], [4, 3, 3]); }],
        ['earR', function (t) { rpoly(t, mirror([[-35, 15], [-11, 27], [-28, 43]]), [3, 3, 4]); }],
        ['head', function (t) { rpoly(t, [[-23, 26], [23, 26], [39, 51], [0, 74], [-39, 51]], [13, 13, 5, 9, 5]); }]
      ],
      face: function (ctx, c, o) {
        oval(ctx, -25, 30, 4.5, 7, -0.85, '#6B4632'); oval(ctx, 25, 30, 4.5, 7, 0.85, '#6B4632');
        ctx.save(); clipP(ctx, P('fox.head', AN.fox.parts[2][1]));
        ctx.fillStyle = '#FFF4E6'; ctx.beginPath();
        ctx.moveTo(-42, 50); ctx.quadraticCurveTo(-22, 46, -12, 52); ctx.quadraticCurveTo(0, 58, 12, 52);
        ctx.quadraticCurveTo(22, 46, 42, 50); ctx.lineTo(0, 80); ctx.closePath(); ctx.fill();
        ctx.restore();
        ctx.strokeStyle = c.dark; ctx.lineWidth = 3; strokeP(ctx, P('fox.head', AN.fox.parts[2][1]));
        eye(ctx, -11.5, 43, 3.6); eye(ctx, 11.5, 43, 3.6);
        cheek(ctx, -19, 54, 3.6); cheek(ctx, 19, 54, 3.6);
        oval(ctx, 0, 62, 4.6, 3.4, 0, NOSE); dot(ctx, -1.4, 61, 1.2, 'rgba(255,255,255,0.7)');
        mouth(ctx, 0, 66.5, 4.2, o, NOSE);
      }
    }),
    owl: A({
      c: { base: '#A68A6D', dark: '#6E5741', light: '#E7D6BF' },
      parts: [
        ['tuftL', function (t) { rpoly(t, [[-31, 15], [-12, 25], [-27, 33]], [3, 3, 3]); }],
        ['tuftR', function (t) { rpoly(t, mirror([[-31, 15], [-12, 25], [-27, 33]]), [3, 3, 3]); }],
        ['wingL', function (t) { ell(t, -26, 55, 8, 15, 0.3); }], ['wingR', function (t) { ell(t, 26, 55, 8, 15, -0.3); }],
        ['body', function (t) { ell(t, 0, 47, 27.5, 27, 0); }]
      ],
      face: function (ctx, c, o) {
        cel(ctx, 'owl.belly', function (t) { ell(t, 0, 59, 15, 13.5, 0); }, { base: c.light, dark: '#B9A184', light: '#FFFFFF' }, { lw: 2, s: 2, hl: false });
        ctx.strokeStyle = 'rgba(110,87,65,0.55)'; ctx.lineWidth = 1.6;
        [[-6, 55], [6, 55], [0, 61], [-7, 66], [7, 66]].forEach(function (p) { ctx.beginPath(); ctx.moveTo(p[0] - 3, p[1]); ctx.quadraticCurveTo(p[0], p[1] + 3, p[0] + 3, p[1]); ctx.stroke(); });
        [-12, 12].forEach(function (x) {
          cel(ctx, 'owl.disk' + x, function (t) { circ(t, x, 39, 10.8); }, { base: '#FFF6E6', dark: '#B9A184', light: '#FFFFFF' }, { lw: 2.2, s: 1.6, hl: false });
          eye(ctx, x, 39.5, 5);
        });
        // beak: opens when singing
        var BK = { base: '#E5B86A', dark: '#A8823C', light: '#F8E2B4' };
        if (o > 0.05) {
          oval(ctx, 0, 52.5, 4.2, 3.6 * o + 1.5, 0, MOUTH);
          ctx.fillStyle = BK.base; ctx.strokeStyle = BK.dark; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(-5, 48); ctx.lineTo(5, 48); ctx.lineTo(0, 52); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-3.5, 54 + 2.5 * o); ctx.lineTo(3.5, 54 + 2.5 * o); ctx.lineTo(0, 57.5 + 2.5 * o); ctx.closePath(); ctx.fill(); ctx.stroke();
        } else {
          ctx.fillStyle = BK.base; ctx.strokeStyle = BK.dark; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(-5, 48); ctx.lineTo(5, 48); ctx.lineTo(0, 56); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
      }
    }),
    deer: A({
      c: { base: '#C79A6A', dark: '#8A6440', light: '#F1DDC0' },
      lines: [
        ['antL', function (t) { t.moveTo(-8, 33); t.quadraticCurveTo(-14, 22, -25, 17); t.moveTo(-14, 24); t.lineTo(-11, 15); t.moveTo(-20, 19.5); t.lineTo(-28, 25); }, 5.2],
        ['antR', function (t) { t.moveTo(8, 33); t.quadraticCurveTo(14, 22, 25, 17); t.moveTo(14, 24); t.lineTo(11, 15); t.moveTo(20, 19.5); t.lineTo(28, 25); }, 5.2]
      ],
      parts: [
        ['earL', function (t) { ell(t, -27, 41, 13, 6.2, 0.42); }], ['earR', function (t) { ell(t, 27, 41, 13, 6.2, -0.42); }],
        ['head', function (t) { ell(t, 0, 52, 20, 22, 0); }]
      ],
      face: function (ctx, c, o) {
        oval(ctx, -28, 41.5, 8, 3, 0.42, '#F3C9B0'); oval(ctx, 28, 41.5, 8, 3, -0.42, '#F3C9B0');
        dot(ctx, -6, 37, 1.9, '#FFF6E6'); dot(ctx, 5, 35.5, 1.6, '#FFF6E6'); dot(ctx, 1, 41, 1.4, '#FFF6E6');
        cel(ctx, 'deer.muz', function (t) { ell(t, 0, 63.5, 11.5, 9, 0); }, { base: c.light, dark: '#B48A62', light: '#FFFFFF' }, { lw: 2, s: 1.6, hl: false });
        oval(ctx, 0, 59.5, 5, 3.6, 0, NOSE); dot(ctx, -1.5, 58.4, 1.2, 'rgba(255,255,255,0.7)');
        eye(ctx, -9, 48, 3.7); eye(ctx, 9, 48, 3.7);
        cheek(ctx, -15, 57, 3.4); cheek(ctx, 15, 57, 3.4);
        mouth(ctx, 0, 65.5, 4.2, o, NOSE);
      }
    }),
    rabbit: A({
      c: { base: '#DCD3CC', dark: '#8E8178', light: '#F7F3F0' },
      parts: [
        ['earL', function (t) { ell(t, -11, 29, 8, 17.5, -0.13); }], ['earR', function (t) { ell(t, 11, 29, 8, 17.5, 0.13); }],
        ['head', function (t) { ell(t, 0, 55.5, 24.5, 19, 0); }]
      ],
      face: function (ctx, c, o) {
        oval(ctx, -11, 30, 3.6, 12, -0.13, '#F4B9C2'); oval(ctx, 11, 30, 3.6, 12, 0.13, '#F4B9C2');
        eye(ctx, -9.5, 51, 3.6); eye(ctx, 9.5, 51, 3.6);
        cheek(ctx, -16, 60, 3.8); cheek(ctx, 16, 60, 3.8);
        ctx.fillStyle = '#E58A9E'; ctx.beginPath(); ctx.moveTo(-3, 57.5); ctx.lineTo(3, 57.5); ctx.lineTo(0, 60.5); ctx.closePath(); ctx.fill();
        if (o > 0.05) mouth(ctx, 0, 62.5, 4.2, o, '#6E5A52');
        else {
          ctx.strokeStyle = '#6E5A52'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(0, 60.5); ctx.lineTo(0, 62.5);
          ctx.moveTo(-4.5, 62.5); ctx.quadraticCurveTo(-2, 65, 0, 62.5); ctx.quadraticCurveTo(2, 65, 4.5, 62.5); ctx.stroke();
          ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = '#B9ABA2'; ctx.lineWidth = 1;
          ctx.beginPath(); rrect(ctx, -2.6, 63.4, 5.2, 4.2, 1); ctx.fill(); ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(142,129,120,0.7)'; ctx.lineWidth = 1.1;
        ctx.beginPath(); ctx.moveTo(-6, 59); ctx.lineTo(-16, 57); ctx.moveTo(6, 59); ctx.lineTo(16, 57); ctx.stroke();
      }
    }),
    squirrel: A({
      c: { base: '#C08458', dark: '#84532F', light: '#EBC7A0' },
      parts: [
        ['tail', function (t) {
          t.moveTo(-4, 73); t.bezierCurveTo(-36, 76, -46, 46, -38, 27); t.bezierCurveTo(-32, 13, -12, 12, -12, 26);
          t.bezierCurveTo(-12, 34, -23, 35, -22, 46); t.bezierCurveTo(-21, 58, -8, 60, -4, 73); t.closePath();
        }, { base: '#CF9462', dark: '#84532F', light: '#F0D2A8' }],
        ['earL', function (t) { rpoly(t, [[-2, 39], [2, 21], [9, 36]], [2.5, 2, 2.5]); }],
        ['earR', function (t) { rpoly(t, [[19, 36], [27, 21], [30, 39]], [2.5, 2, 2.5]); }],
        ['head', function (t) { ell(t, 13, 52.5, 21.5, 19.5, 0); }]
      ],
      face: function (ctx, c, o) {
        ctx.strokeStyle = 'rgba(255,236,206,0.75)'; ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.moveTo(-10, 66); ctx.bezierCurveTo(-30, 64, -36, 44, -30, 31); ctx.bezierCurveTo(-26, 23, -18, 22, -17, 27); ctx.stroke();
        oval(ctx, 3.5, 34, 2, 5, 0.2, '#F3C9B0'); oval(ctx, 25, 34, 2, 5, -0.2, '#F3C9B0');
        cel(ctx, 'sq.muz', function (t) { ell(t, 14, 60, 10, 7.5, 0); }, { base: c.light, dark: '#B48A62', light: '#FFFFFF' }, { lw: 1.8, s: 1.4, hl: false });
        oval(ctx, 14, 56.5, 3.8, 2.8, 0, NOSE);
        eye(ctx, 5.5, 48.5, 3.5); eye(ctx, 21.5, 48.5, 3.5);
        cheek(ctx, 0, 57, 3.4); cheek(ctx, 28, 57, 3.4);
        mouth(ctx, 14, 61, 3.8, o, NOSE);
      }
    }),
    frog: A({
      c: { base: '#8DBF7A', dark: '#577F48', light: '#D3EAC6' },
      parts: [
        ['eyeL', function (t) { circ(t, -19, 34, 12.5); }], ['eyeR', function (t) { circ(t, 19, 34, 12.5); }],
        ['head', function (t) { ell(t, 0, 55, 36, 19, 0); }]
      ],
      face: function (ctx, c, o) {
        oval(ctx, 0, 62.5, 22, 8.5, 0, rgba(c.light, 0.9));
        [-19, 19].forEach(function (x) {
          cel(ctx, 'frog.w' + x, function (t) { circ(t, x, 33.5, 8.4); }, { base: '#FFFDF5', dark: '#B5C9A8', light: '#FFFFFF' }, { lw: 1.8, s: 1.4, hl: false });
          eye(ctx, x + 0.5, 34, 4.4);
        });
        dot(ctx, -4, 48, 1.4, c.dark); dot(ctx, 4, 48, 1.4, c.dark);
        cheek(ctx, -24, 56, 4.6); cheek(ctx, 24, 56, 4.6);
        if (o > 0.05) {
          var h = 5 + 8 * o;
          ctx.fillStyle = MOUTH; ctx.beginPath(); ctx.moveTo(-17, 54); ctx.quadraticCurveTo(0, 58, 17, 54);
          ctx.quadraticCurveTo(14, 54 + h, 0, 54 + h); ctx.quadraticCurveTo(-14, 54 + h, -17, 54); ctx.closePath(); ctx.fill();
          oval(ctx, 0, 54 + h * 0.72, 7, h * 0.24, 0, TONGUE);
          ctx.strokeStyle = c.dark; ctx.lineWidth = 1.8; ctx.stroke();
        } else {
          ctx.strokeStyle = c.dark; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(-18, 54); ctx.quadraticCurveTo(0, 64, 18, 54); ctx.stroke();
        }
      }
    }),
    duck: A({
      c: { base: '#F5DF96', dark: '#B8963E', light: '#FFF6D2' },
      parts: [
        ['tuft1', function (t) { ell(t, -11, 21, 3.6, 7, -0.55); }], ['tuft2', function (t) { ell(t, -4, 18.5, 3.8, 7.5, -0.1); }],
        ['head', function (t) { circ(t, -5, 46, 26); }],
        ['bill', function (t) { t.moveTo(12, 45); t.bezierCurveTo(24, 41, 42, 42, 44, 50); t.bezierCurveTo(45, 57, 30, 61, 12, 60); t.closePath(); }, { base: '#F2A65A', dark: '#B46A2E', light: '#FAD3A8' }]
      ],
      face: function (ctx, c, o) {
        var B = { base: '#F2A65A', dark: '#B46A2E', light: '#FAD3A8' };
        if (o > 0.05) {     // the bill opens: redraw it as two halves
          oval(ctx, 22, 55, 11, 2.5 + 2.5 * o, 0, MOUTH);
          oval(ctx, 22, 56.5 + o, 6, 1.6 + o, 0, TONGUE);
          ctx.save(); ctx.translate(0, 3.5 * o); ctx.rotate(0.04 * o);
          cel(ctx, 'duck.billL', function (t) { t.moveTo(12, 52); t.lineTo(40, 53); t.bezierCurveTo(42, 58, 30, 61, 12, 60); t.closePath(); }, B, { lw: 2.4, s: 1.4, hl: false });
          ctx.restore();
          ctx.save(); ctx.rotate(-0.05 * o);
          cel(ctx, 'duck.billU', function (t) { t.moveTo(12, 45); t.bezierCurveTo(24, 41, 42, 42, 44, 49); t.bezierCurveTo(44, 52, 30, 53, 12, 53); t.closePath(); }, B, { lw: 2.4, s: 1.4, hl: false });
          ctx.restore();
        } else {
          ctx.strokeStyle = B.dark; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(15, 52.5); ctx.quadraticCurveTo(30, 54.5, 42, 51.5); ctx.stroke();
          dot(ctx, 33, 47, 1.3, B.dark);
        }
        eye(ctx, 4, 38.5, 4.2);
        cheek(ctx, 4, 51, 4.4);
        ctx.strokeStyle = rgba(c.dark, 0.55); ctx.lineWidth = 1.8;   // a little wing-feather tuft at the neck
        ctx.beginPath(); ctx.moveTo(-24, 58); ctx.quadraticCurveTo(-18, 63, -12, 60); ctx.moveTo(-20, 64); ctx.quadraticCurveTo(-14, 68, -8, 65); ctx.stroke();
      }
    })
  };
  function animalOf(th) { return AN[th.animal] ? th.animal : 'bear'; }
  function stickerPass(ctx, a, name, w, col) {
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = w;
    for (var i = 0; i < a.parts.length; i++) { var p = P(name + '.' + a.parts[i][0], a.parts[i][1]); strokeP(ctx, p); fillP(ctx, p); }
    (a.lines || []).forEach(function (l) { ctx.lineWidth = l[2] + w; strokeP(ctx, P(name + '.' + l[0], l[1])); });
  }
  var ANIMAL_BELL_Y = 76, ANIMAL_BELL_K = 0.25;
  var ANIMAL = {
    box: function (th) {
      var name = animalOf(th), a = AN[name], r = new Rec();
      a.parts.forEach(function (p) { p[1](r); });
      (a.lines || []).forEach(function (l) { l[1](r); });
      var pad = BORDER + EDGE + 0.5, x0 = Math.min(r.x0 - pad, -82 * ANIMAL_BELL_K / 2), x1 = Math.max(r.x1 + pad, 82 * ANIMAL_BELL_K / 2);
      var w = 2 * Math.max(-x0, x1);    // symmetric around the anchor so the hit circle stays centred
      return { w: Math.min(100, w), h: Math.min(100, ANIMAL_BELL_Y + (100 - 9.5) * ANIMAL_BELL_K + 1.2), cy: 46 };
    },
    sil: function (t, th) {
      var name = animalOf(th), a = AN[name];
      a.parts.forEach(function (p) { p[1](t); });
    },
    col: function (th) { return AN[animalOf(th)].c; },
    draw: function (ctx, th, o) {
      var name = animalOf(th), a = AN[name], open = clamp01((num(o.ring, 0) - 0.5) * 4);
      // the little brass bell under the cut-out (behind it)
      line(ctx, [0, 66, 0, ANIMAL_BELL_Y + 1], '#6E5236', 2.4);
      miniBell(ctx, 0, ANIMAL_BELL_Y, ANIMAL_BELL_K, num(o.clap, 0), 0);
      topLoop(ctx, 16);
      // wooden cut-out thickness + edge, then the white sticker border
      ctx.save(); ctx.translate(1.2, 2.4); stickerPass(ctx, a, name, 2 * (BORDER + EDGE), '#A98760'); ctx.restore();
      stickerPass(ctx, a, name, 2 * (BORDER + EDGE), '#C9A27A');
      stickerPass(ctx, a, name, 2 * BORDER, '#FFFFFF');
      (a.lines || []).forEach(function (l) {
        var p = P(name + '.' + l[0], l[1]);
        ctx.strokeStyle = mix('#9C7452', '#4E3426', 0.4); ctx.lineWidth = l[2] + 3; strokeP(ctx, p);
        ctx.strokeStyle = '#A57C58'; ctx.lineWidth = l[2]; strokeP(ctx, p);
      });
      for (var i = 0; i < a.parts.length; i++) {
        var pp = a.parts[i];
        if (name === 'duck' && pp[0] === 'bill' && open > 0.05) continue;
        cel(ctx, name + '.' + pp[0], pp[1], pp[2] || a.c, { lw: 3, s: pp[0] === 'head' || pp[0] === 'body' ? 4.5 : 2.4 });
      }
      a.face(ctx, a.c, open);
      dot(ctx, 0, 16, 2.2, 'rgba(90,70,50,0.5)');   // the screw-eye hole
    }
  };

  var K = { bell: BELL, plate: PLATE, string: STRING, dots: DOTS, animal: ANIMAL, glyph: GLYPH };
  function kindOf(th) { return K[th && th.kind] || BELL; }

  // ================================================================= PUBLIC: chimes
  function bodyBox(thing, size) {
    size = num(size, 112);
    var b = kindOf(thing || {}).box(thing || {}), s = size / 100;
    return { w: Math.min(size, b.w * s), h: Math.min(size, b.h * s), cy: b.cy * s };
  }
  function thingKey(t) {
    if (!t) return '?';
    return [t.kind, t.color || '', t.shape || '', t.n != null ? t.n : '', t.animal || '', t.text != null ? t.text : ''].join(':');
  }

  function drawChime(ctx, thing, size, opt) {
    if (!ctx || !thing) return;
    size = num(size, 112); if (!(size > 0)) return;
    var o = opt || {}, Kd = kindOf(thing), pop = o.pop == null ? 1 : clamp01(o.pop);
    if (pop <= 0.001) return;
    var b = Kd.box(thing), c = Kd.col(thing), s = size / 100 * pop;
    var glow = clamp01(o.glow), ring = clamp01(o.ring), flash = o.flash == null ? ring : clamp01(o.flash), dim = clamp01(o.dim), night = clamp01(o.night);
    ctx.save();
    ctx.scale(s, s);
    if (dim > 0) ctx.globalAlpha *= 1 - 0.55 * dim;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    var silB = function (t) { Kd.sil(t, thing); };
    var cy = b.cy;
    // soft gold halo
    if (glow > 0.01) {
      var R = 62 + 16 * glow;
      var g = ctx.createRadialGradient(0, cy, R * 0.2, 0, cy, R);
      g.addColorStop(0, 'rgba(255,230,140,' + (0.75 * glow).toFixed(3) + ')');
      g.addColorStop(0.55, 'rgba(255,214,100,' + (0.42 * glow).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(255,210,90,0)');
      ctx.fillStyle = g; ctx.beginPath(); circ(ctx, 0, cy, R); ctx.fill();
      ctx.strokeStyle = 'rgba(255,236,160,' + (0.85 * glow).toFixed(3) + ')'; ctx.lineWidth = 7 + 5 * glow;
      ctx.beginPath(); silB(ctx); ctx.stroke();
    }
    // warm night rim (campfire light from below), behind the body so it never darkens it
    if (night > 0.01) {
      ctx.save(); ctx.translate(0, 2.2);
      ctx.strokeStyle = 'rgba(255,186,110,' + (0.7 * night).toFixed(3) + ')'; ctx.lineWidth = Kd === ANIMAL ? 2 * (BORDER + EDGE) + 4 : 6;
      ctx.beginPath(); silB(ctx); ctx.stroke();
      ctx.restore();
    }
    // bright rim flash behind (a white halo edge)
    if (flash > 0.01) {
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.9 * flash).toFixed(3) + ')';
      ctx.lineWidth = (Kd === ANIMAL ? 2 * (BORDER + EDGE) : 0) + 5 + 7 * flash;
      ctx.beginPath(); silB(ctx); ctx.stroke();
    }
    Kd.draw(ctx, thing, o);
    // overlays inside the main silhouette (single-path kinds)
    if (Kd.inner && (night > 0.01 || flash > 0.01)) {
      var ib = Kd.inner(thing);
      ctx.save(); ctx.beginPath(); ib(ctx); ctx.clip();
      if (night > 0.01) {
        var lg = ctx.createLinearGradient(0, cy - 20, 0, b.h);
        lg.addColorStop(0, 'rgba(255,170,90,0)'); lg.addColorStop(1, 'rgba(255,170,90,' + (0.16 * night).toFixed(3) + ')');
        ctx.fillStyle = lg; ctx.fillRect(-55, 0, 110, 105);
        ctx.strokeStyle = 'rgba(255,200,130,' + (0.75 * night).toFixed(3) + ')'; ctx.lineWidth = 3.4;
        ctx.save(); ctx.translate(1.5, -2.2); ctx.beginPath(); ib(ctx); ctx.stroke(); ctx.restore();
      }
      if (flash > 0.01) { ctx.fillStyle = 'rgba(255,255,255,' + (0.2 * flash * flash).toFixed(3) + ')'; ctx.fillRect(-55, 0, 110, 105); }
      ctx.restore();
    }
    // expanding ring arcs (sound waves) on both sides of the body
    if (ring > 0.01) {
      var R0 = 100 * (0.6 + (1 - ring) * 0.7), ac = c === CREAM ? DOTC : c;
      for (var k = 0; k < 3; k++) {
        var rr = R0 - k * 12; if (rr < 30) continue;
        var a = ring * (1 - k * 0.28), span = 0.62 - k * 0.1;
        for (var side = 0; side < 2; side++) {
          var a0 = side ? -span : Math.PI - span, a1 = side ? span : Math.PI + span;
          ctx.strokeStyle = rgba(ac.base, a * 0.9); ctx.lineWidth = 5.2;
          ctx.beginPath(); ctx.arc(0, cy, rr, a0, a1); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,' + (a * 0.95).toFixed(3) + ')'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(0, cy, rr, a0, a1); ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  // ================================================================= CORD
  function drawCord(ctx, x0, y0, x1, y1, opt) {
    if (!ctx) return;
    var o = opt || {}, dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
    if (!(L > 0.5)) return;
    ctx.save(); ctx.translate(x0, y0); ctx.rotate(Math.atan2(dy, dx));
    ctx.lineCap = 'round';
    line(ctx, [0, 0, L, 0], '#5E4329', 4.6);
    line(ctx, [0, 0, L, 0], '#9C7A4E', 2.8);
    ctx.strokeStyle = '#D2B07C'; ctx.lineWidth = 1.1; ctx.beginPath();
    for (var i = 2; i < L - 1; i += 4.2) { ctx.moveTo(i, -1.2); ctx.lineTo(i + 2.2, 1.2); }
    ctx.stroke();
    var n = clamp01(o.night);
    if (n > 0.01) line(ctx, [0, 1.6, L, 1.6], 'rgba(255,190,120,' + (0.45 * n).toFixed(3) + ')', 1);
    ctx.restore();
  }

  // ================================================================= BEAM + POSTS + HOOKS
  function hash(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function hookPoint(layout, x, wob) {
    var b = (layout && layout.beam) || { y: 0, r: 15 };
    return { x: x, y: b.y + num(wob, 0) + (b.r || 15) + 12 };
  }
  function drawPost(ctx, p, beamY, night) {
    var w = 26, x = p.x, top = p.top, bot = p.bottom, h = bot - top;
    if (!(h > 0)) return;
    // ground shadow
    oval(ctx, x + 4, bot, w * 0.95, 5, 0, 'rgba(60,40,30,0.25)');
    var body = function (t) { t.moveTo(x - w / 2, top + 5); t.lineTo(x - w / 2 - 2.5, bot); t.lineTo(x + w / 2 + 2.5, bot); t.lineTo(x + w / 2, top + 5); t.closePath(); };
    ctx.fillStyle = WOOD.base; ctx.beginPath(); body(ctx); ctx.fill();
    ctx.save(); ctx.beginPath(); body(ctx); ctx.clip();
    ctx.fillStyle = shadeOf(WOOD); ctx.fillRect(x + w * 0.18, top, w, h);
    ctx.fillStyle = rgba(WOOD.light, 0.55); ctx.fillRect(x - w * 0.34, top, w * 0.16, h);
    ctx.strokeStyle = rgba(WOOD.dark, 0.6); ctx.lineWidth = 1.8; ctx.beginPath();
    for (var i = 0; i < Math.ceil(h / 26); i++) {   // bark streaks
      var yy = top + 12 + i * 26 + hash(x + i) * 10, xx = x - w * 0.3 + hash(i * 3 + x) * w * 0.6;
      ctx.moveTo(xx, yy); ctx.quadraticCurveTo(xx + 2, yy + 9, xx, yy + 16 + hash(i + x * 2) * 8);
    }
    ctx.stroke();
    if (night > 0.01) { ctx.fillStyle = 'rgba(255,170,90,' + (0.18 * night).toFixed(3) + ')'; ctx.fillRect(x - w, beamY, w * 2, bot - beamY); }
    ctx.restore();
    ctx.strokeStyle = WOOD.dark; ctx.lineWidth = 3.4; ctx.lineJoin = 'round'; ctx.beginPath(); body(ctx); ctx.stroke();
    // cut top of the log (tree rings)
    ctx.fillStyle = WOOD.light; ctx.beginPath(); ell(ctx, x, top + 5, w / 2, 5, 0); ctx.fill();
    ctx.strokeStyle = WOOD.dark; ctx.lineWidth = 2.6; ctx.stroke();
    ctx.strokeStyle = rgba(WOOD.dark, 0.5); ctx.lineWidth = 1.1; ctx.beginPath(); ell(ctx, x, top + 5, w / 4, 2.4, 0); ctx.stroke();
    // a brass tack for the garland string
    dot(ctx, x, top + 13, 3, BRASS.base); ctx.strokeStyle = BRASS.dark; ctx.lineWidth = 1.4; ctx.beginPath(); circ(ctx, x, top + 13, 3); ctx.stroke();
  }
  function lashing(ctx, x, y, r) {
    ctx.save(); ctx.lineCap = 'round';
    for (var pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass ? '#C9A574' : '#5E4329'; ctx.lineWidth = pass ? 2.4 : 4.4;
      ctx.beginPath();
      ctx.moveTo(x - 13, y - r + 1); ctx.lineTo(x + 13, y + r - 1);
      ctx.moveTo(x + 13, y - r + 1); ctx.lineTo(x - 13, y + r - 1);
      ctx.moveTo(x - 14, y - r * 0.2); ctx.lineTo(x + 14, y - r * 0.2);
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawBeam(ctx, layout, opt) {
    if (!ctx || !layout || !layout.beam) return;
    var o = opt || {}, B = layout.beam, r = B.r || 15, wob = num(o.wob, 0), y = B.y + wob, night = clamp01(o.night);
    var posts = layout.posts || [{ x: B.x0, top: B.y - 70, bottom: B.y + 300 }, { x: B.x1, top: B.y - 70, bottom: B.y + 300 }];
    var hooks = o.hooks || layout.hooks || [];
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (var i = 0; i < posts.length; i++) drawPost(ctx, posts[i], B.y, night);
    var bx0 = B.x0 - 30, bx1 = B.x1 + 30, L = bx1 - bx0;
    // soft shadow under the beam
    ctx.fillStyle = 'rgba(40,30,30,0.12)'; ctx.beginPath(); rrect(ctx, bx0 + 6, y - r + 7, L - 6, r * 2, r); ctx.fill();
    var log = function (t) { rrect(t, bx0, y - r, L, r * 2, r * 0.55); };
    ctx.fillStyle = WOOD.base; ctx.beginPath(); log(ctx); ctx.fill();
    ctx.save(); ctx.beginPath(); log(ctx); ctx.clip();
    ctx.fillStyle = shadeOf(WOOD); ctx.fillRect(bx0, y + r * 0.28, L, r);
    ctx.fillStyle = rgba(WOOD.light, 0.6); ctx.fillRect(bx0, y - r * 0.72, L, r * 0.3);
    ctx.strokeStyle = rgba(WOOD.dark, 0.55); ctx.lineWidth = 1.8; ctx.beginPath();     // bark lines
    var nS = Math.max(4, Math.floor(L / 46));
    for (i = 0; i < nS; i++) {
      var sx = bx0 + 14 + (i + hash(i * 1.7)) * (L - 28) / nS, sl = 18 + hash(i * 2.3) * 22, sy = y - r * 0.35 + hash(i * 5.1) * r * 0.9;
      ctx.moveTo(sx, sy); ctx.quadraticCurveTo(sx + sl / 2, sy - 2 + hash(i) * 4, sx + sl, sy + 1);
    }
    ctx.stroke();
    for (i = 0; i < Math.max(2, Math.floor(L / 260)); i++) {   // knots
      var kx = bx0 + 60 + hash(i * 9.3) * (L - 120), ky = y - r * 0.15 + hash(i * 4.4) * r * 0.4;
      oval(ctx, kx, ky, 4.6, 2.8, 0, WOOD.dark); oval(ctx, kx - 0.8, ky - 0.6, 2.2, 1.2, 0, rgba(WOOD.light, 0.7));
    }
    if (night > 0.01) {
      var lg = ctx.createLinearGradient(0, y, 0, y + r);
      lg.addColorStop(0, 'rgba(255,170,90,0)'); lg.addColorStop(1, 'rgba(255,170,90,' + (0.42 * night).toFixed(3) + ')');
      ctx.fillStyle = lg; ctx.fillRect(bx0, y, L, r);
    }
    ctx.restore();
    ctx.strokeStyle = WOOD.dark; ctx.lineWidth = 3.4; ctx.beginPath(); log(ctx); ctx.stroke();
    // cut ends with tree rings
    [bx0 + r * 0.25, bx1 - r * 0.25].forEach(function (ex) {
      ctx.fillStyle = WOOD.light; ctx.beginPath(); ell(ctx, ex, y, r * 0.42, r - 1, 0); ctx.fill();
      ctx.strokeStyle = WOOD.dark; ctx.lineWidth = 2.6; ctx.stroke();
      ctx.strokeStyle = rgba(WOOD.dark, 0.45); ctx.lineWidth = 1.1;
      ctx.beginPath(); ell(ctx, ex, y, r * 0.24, r * 0.6, 0); ctx.stroke();
      dot(ctx, ex, y, 1.5, rgba(WOOD.dark, 0.6));
    });
    for (i = 0; i < posts.length; i++) lashing(ctx, posts[i].x, y, r);
    // brass screw-eye hooks
    for (i = 0; i < hooks.length; i++) {
      var hx = typeof hooks[i] === 'number' ? hooks[i] : hooks[i].x;
      ctx.fillStyle = BRASS.dark; ctx.fillRect(hx - 1.8, y + r - 3, 3.6, 6);
      ctx.strokeStyle = BRASS.dark; ctx.lineWidth = 4.6; ctx.beginPath(); circ(ctx, hx, y + r + 7.5, 4.4); ctx.stroke();
      ctx.strokeStyle = BRASS.base; ctx.lineWidth = 2.4; ctx.beginPath(); circ(ctx, hx, y + r + 7.5, 4.4); ctx.stroke();
      ctx.strokeStyle = BRASS.light; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(hx, y + r + 7.5, 4.4, Math.PI * 1.1, Math.PI * 1.6); ctx.stroke();
    }
    ctx.restore();
  }

  // ================================================================= GARLAND + LANTERNS
  var LANTERN_R = 22;
  function lanternRadius() { return LANTERN_R; }
  function drawLantern(ctx, L, R, t, night) {
    var lit = clamp01(L.lit), flash = clamp01(L.flash), c = L.color ? (pal(L.color) || GOLD) : GOLD;
    var tone = L.color ? c.light : '#FFE7A3';
    var paper = mix('#F6E7C8', mix(tone, c.base, 0.18), lit), line_ = mix('#B89B72', c.dark, lit * 0.7);
    var ry = R * 0.88;
    ctx.save(); ctx.translate(L.x, L.y);
    // glow
    if (lit > 0.01 || flash > 0.01) {
      var gR = R * (3 + 1.4 * flash), gc = mix(tone, '#FFD98A', 0.35), g = ctx.createRadialGradient(0, 0, R * 0.4, 0, 0, gR);
      g.addColorStop(0, rgba(gc, Math.min(1, 0.6 * lit + 0.4 * flash)));
      g.addColorStop(0.45, rgba(gc, 0.25 * lit + 0.2 * flash));
      g.addColorStop(1, rgba(gc, 0));
      ctx.fillStyle = g; ctx.beginPath(); circ(ctx, 0, 0, gR); ctx.fill();
    }
    ctx.translate(0, -ry); ctx.rotate(num(L.swing, 0)); ctx.translate(0, ry);
    // tassel
    line(ctx, [0, ry + 2, 0, ry + 5], line_, 1.6);
    ctx.fillStyle = lit > 0.3 && L.color ? c.base : '#C9A27A';
    ctx.beginPath(); ctx.moveTo(-2.4, ry + 4.5); ctx.lineTo(2.4, ry + 4.5); ctx.lineTo(3, ry + 9); ctx.lineTo(-3, ry + 9); ctx.closePath(); ctx.fill();
    // paper body
    var body = function (x) { ell(x, 0, 0, R, ry, 0); };
    if (lit > 0.01) {
      var bg = ctx.createRadialGradient(-R * 0.15, -R * 0.1, 1, 0, 0, R * 1.05);
      bg.addColorStop(0, mix('#FFFFF2', paper, 0.15)); bg.addColorStop(0.6, paper); bg.addColorStop(1, mix(paper, c.base, 0.35 * lit));
      ctx.fillStyle = bg;
    } else ctx.fillStyle = paper;
    ctx.beginPath(); body(ctx); ctx.fill();
    ctx.save(); ctx.beginPath(); body(ctx); ctx.clip();
    if (lit < 0.99) { ctx.fillStyle = 'rgba(184,155,114,' + (0.28 * (1 - lit)).toFixed(3) + ')'; ctx.beginPath(); ell(ctx, R * 0.35, R * 0.25, R * 0.9, ry * 0.95, 0); ctx.fill(); }
    ctx.strokeStyle = lit > 0.01 ? rgba(mix(c.base, '#B89B72', 0.3), 0.35 + 0.15 * lit) : '#D9C49E'; ctx.lineWidth = 1.4;
    [0.36, 0.72].forEach(function (k) { ctx.beginPath(); ell(ctx, 0, 0, R * k, ry, 0); ctx.stroke(); });
    ctx.beginPath(); ctx.moveTo(0, -ry); ctx.lineTo(0, ry); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(-R * 0.1, 0, R * 0.7, Math.PI * 1.08, Math.PI * 1.38); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = line_; ctx.lineWidth = 2.4; ctx.beginPath(); body(ctx); ctx.stroke();
    if (flash > 0.01) { ctx.strokeStyle = 'rgba(255,255,255,' + (0.9 * flash).toFixed(3) + ')'; ctx.lineWidth = 3; ctx.beginPath(); ell(ctx, 0, 0, R + 3, ry + 3, 0); ctx.stroke(); }
    // caps
    var cap = '#7A5232';
    ctx.fillStyle = cap; ctx.beginPath(); rrect(ctx, -R * 0.42, -ry - 3, R * 0.84, 5.5, 2); ctx.fill();
    ctx.beginPath(); rrect(ctx, -R * 0.36, ry - 2.5, R * 0.72, 5, 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(-R * 0.36, -ry - 2, R * 0.3, 1.4);
    if (night > 0.01 && lit < 0.5) { ctx.strokeStyle = 'rgba(255,190,120,' + (0.4 * night).toFixed(3) + ')'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0, 0, R - 1, 0.3, 2.2); ctx.stroke(); }
    ctx.restore();
  }
  function drawGarland(ctx, garland, lanterns, opt) {
    if (!ctx || !garland) return;
    var o = opt || {}, g = garland, sag = num(g.sag, 26), mx = (g.x0 + g.x1) / 2, R = num(o.r, LANTERN_R), night = clamp01(o.night);
    ctx.save(); ctx.lineCap = 'round';
    var str = function (x) { x.moveTo(g.x0, g.y); x.quadraticCurveTo(mx, g.y + 2 * sag, g.x1, g.y); };
    ctx.strokeStyle = '#5E4329'; ctx.lineWidth = 3.2; ctx.beginPath(); str(ctx); ctx.stroke();
    ctx.strokeStyle = '#A88458'; ctx.lineWidth = 1.4; ctx.beginPath(); str(ctx); ctx.stroke();
    var Ls = lanterns || [];
    for (var i = 0; i < Ls.length; i++) if (Ls[i]) drawLantern(ctx, Ls[i], R, num(o.t, 0), night);
    ctx.restore();
  }

  // ================================================================= CAMPFIRE
  var STONE = { base: '#A39D96', dark: '#6C6762', light: '#CFCAC3' };
  function fireTop(fire) { return fire.y - 110 * num(fire.s, 1); }
  function flame(ctx, w, h, sway, ph, t, col) {
    var f1 = 1 + 0.09 * Math.sin(t * 9.1 + ph) + 0.05 * Math.sin(t * 14.3 + ph * 2);
    var f2 = 1 + 0.12 * Math.sin(t * 7.3 + ph + 1.7), f3 = 1 + 0.12 * Math.sin(t * 8.2 + ph + 3.1);
    var H = h * f1, sw = sway * Math.sin(t * 4.7 + ph);
    ctx.fillStyle = col; ctx.beginPath();
    ctx.moveTo(-w, 0);
    ctx.bezierCurveTo(-w * 1.05, -h * 0.3, -w * 0.85, -h * 0.45 * f2, -w * 0.6 + sw * 0.5, -h * 0.66 * f2);
    ctx.quadraticCurveTo(-w * 0.42, -h * 0.42, -w * 0.22, -h * 0.5);
    ctx.bezierCurveTo(-w * 0.3, -h * 0.75, sw - w * 0.1, -H * 0.9, sw, -H);
    ctx.bezierCurveTo(sw + w * 0.1, -H * 0.85, w * 0.4, -h * 0.72, w * 0.26, -h * 0.5);
    ctx.quadraticCurveTo(w * 0.42, -h * 0.4, w * 0.58 + sw * 0.4, -h * 0.62 * f3);
    ctx.bezierCurveTo(w * 0.85, -h * 0.42 * f3, w * 1.05, -h * 0.28, w, 0);
    ctx.bezierCurveTo(w * 0.9, h * 0.2, -w * 0.9, h * 0.2, -w, 0);
    ctx.closePath(); ctx.fill();
  }
  function drawFire(ctx, fire, opt) {
    if (!ctx || !fire) return;
    var o = opt || {}, t = num(o.t, 0), glow = o.glow == null ? 1 : clamp01(o.glow), s = num(fire.s, 1);
    ctx.save(); ctx.translate(fire.x, fire.y); ctx.scale(s, s); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    var gp = 0.88 + 0.12 * Math.sin(t * 6.3) * Math.sin(t * 2.1 + 1);
    if (glow > 0.01) {
      var g = ctx.createRadialGradient(0, -2, 6, 0, -2, 150);
      g.addColorStop(0, 'rgba(255,170,80,' + (0.55 * glow * gp).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,150,60,0)');
      ctx.save(); ctx.scale(1, 0.3); ctx.fillStyle = g; ctx.beginPath(); circ(ctx, 0, -6, 150); ctx.fill(); ctx.restore();
      var g2 = ctx.createRadialGradient(0, -50, 10, 0, -50, 125);
      g2.addColorStop(0, 'rgba(255,190,100,' + (0.3 * glow * gp).toFixed(3) + ')'); g2.addColorStop(1, 'rgba(255,170,80,0)');
      ctx.fillStyle = g2; ctx.beginPath(); circ(ctx, 0, -50, 125); ctx.fill();
    }
    var stones = [];
    for (var i = 0; i < 11; i++) { var a = i / 11 * TAU + 0.2; stones.push({ a: a, x: Math.cos(a) * 54, y: -8 + Math.sin(a) * 13, rx: 11 + hash(i) * 4, ry: 8 + hash(i + 7) * 3 }); }
    function stone(st) {
      cel(ctx, 'fire.st' + Math.round(st.rx * 10) + '.' + Math.round(st.ry * 10), function (x) { ell(x, 0, 0, st.rx, st.ry, 0); }, STONE, { lw: 2.6, s: 2.2, hl: [-st.rx * 0.3, -st.ry * 0.35, st.rx * 0.35, st.ry * 0.2, -0.3] });
    }
    stones.filter(function (q) { return Math.sin(q.a) < 0; }).forEach(function (q) { ctx.save(); ctx.translate(q.x, q.y); stone(q); ctx.restore(); });
    // embers bed
    oval(ctx, 0, -9, 36, 8, 0, 'rgba(232,90,50,' + (0.5 + 0.3 * gp).toFixed(3) + ')');
    oval(ctx, 0, -10, 22, 4.5, 0, 'rgba(255,200,90,' + (0.55 + 0.3 * gp).toFixed(3) + ')');
    // crossed logs
    [-0.3, 0.3].forEach(function (rot, j) {
      ctx.save(); ctx.translate(0, -15); ctx.rotate(rot);
      cel(ctx, 'fire.log', function (x) { rrect(x, -48, -7.5, 96, 15, 7); }, WOOD, { lw: 3, s: 3, hl: [-10, -3.5, 26, 1.6, 0] });
      ctx.strokeStyle = rgba(WOOD.dark, 0.55); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-30, -1); ctx.lineTo(-12, 0); ctx.moveTo(8, 2); ctx.lineTo(28, 1); ctx.stroke();
      var ex = j ? -44 : 44;
      ctx.fillStyle = WOOD.light; ctx.beginPath(); ell(ctx, ex, 0, 3.6, 7, 0); ctx.fill();
      ctx.strokeStyle = WOOD.dark; ctx.lineWidth = 2.2; ctx.stroke();
      ctx.restore();
    });
    // flames: 3 layers
    ctx.save(); ctx.translate(0, -16);
    flame(ctx, 40, 90, 5, 0, t, 'rgba(240,96,52,0.95)');
    flame(ctx, 29, 68, 4, 1.9, t, '#FF9F3A');
    flame(ctx, 16, 42, 3, 3.7, t, '#FFE07A');
    oval(ctx, 0, -7, 9, 7, 0, 'rgba(255,250,215,0.9)');
    ctx.restore();
    stones.filter(function (q) { return Math.sin(q.a) >= 0; }).forEach(function (q) { ctx.save(); ctx.translate(q.x, q.y); stone(q); ctx.restore(); });
    ctx.restore();
  }

  // ================================================================= NOTE ♪
  function drawNote(ctx, x, y, size, opt) {
    if (!ctx) return;
    var o = opt || {}, s = num(size, 40) / 100, c = o.color ? (pal(o.color) || GOLD) : GOLD, a = o.alpha == null ? 1 : clamp01(o.alpha);
    if (a <= 0.001 || !(s > 0)) return;
    ctx.save(); ctx.translate(x, y); ctx.rotate(num(o.rot, 0)); ctx.scale(s, s); ctx.globalAlpha *= a;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    var g = ctx.createRadialGradient(0, 0, 8, 0, 0, 72);
    g.addColorStop(0, rgba(mix(c.light, '#FFFFFF', 0.3), 0.8)); g.addColorStop(1, rgba(c.light, 0));
    ctx.fillStyle = g; ctx.beginPath(); circ(ctx, 0, 0, 72); ctx.fill();
    var shape = function (q) {
      ell(q, -12, 30, 20, 14, -0.38);
      q.moveTo(2, 28); q.lineTo(2, -46); q.lineTo(12, -46); q.lineTo(12, 26); q.closePath();
      q.moveTo(8, -48); q.bezierCurveTo(16, -30, 40, -26, 36, 2); q.bezierCurveTo(32, -14, 20, -18, 10, -22); q.closePath();
    };
    ctx.strokeStyle = lineOf(c); ctx.lineWidth = 9; ctx.beginPath(); shape(ctx); ctx.stroke();
    ctx.fillStyle = c.base; ctx.beginPath(); shape(ctx); ctx.fill();
    oval(ctx, -17, 25, 6, 3.4, -0.4, 'rgba(255,255,255,0.75)');
    line(ctx, [5.5, -38, 5.5, 14], 'rgba(255,255,255,0.45)', 2.4);
    ctx.restore();
  }

  // ================================================================= FIREFLY
  function drawFirefly(ctx, x, y, r, glow) {
    if (!ctx) return;
    r = num(r, 4); var gl = clamp01(glow == null ? 1 : glow);
    if (!(r > 0)) return;
    ctx.save(); ctx.translate(x, y);
    var gr = r * (4 + 2.5 * gl), g = ctx.createRadialGradient(0, r * 0.4, r * 0.3, 0, r * 0.4, gr);
    g.addColorStop(0, 'rgba(233,245,154,' + (0.85 * gl).toFixed(3) + ')');
    g.addColorStop(0.35, 'rgba(233,245,154,' + (0.35 * gl).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(233,245,154,0)');
    ctx.fillStyle = g; ctx.beginPath(); circ(ctx, 0, r * 0.4, gr); ctx.fill();
    oval(ctx, -r * 0.75, -r * 0.55, r * 0.8, r * 0.45, -0.5, 'rgba(255,255,255,0.55)');
    oval(ctx, r * 0.75, -r * 0.55, r * 0.8, r * 0.45, 0.5, 'rgba(255,255,255,0.55)');
    oval(ctx, 0, r * 0.55, r * 0.55, r * 0.7, 0, mix('#C9CF86', '#F6FCC8', gl));
    oval(ctx, 0, -r * 0.25, r * 0.45, r * 0.5, 0, '#5B4A3A');
    dot(ctx, 0, -r * 0.8, r * 0.32, '#5B4A3A');
    ctx.restore();
  }

  // ================================================================= ICON
  function drawIcon(ctx, thing, size) {
    if (!ctx || !thing) return;
    size = num(size, 100); if (!(size > 0)) return;
    var t = thing, k = t.kind;
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (K[k]) {
      var bu = K[k].box(t), sz = size * 0.9 * 100 / Math.max(bu.w, bu.h, 60);
      ctx.translate(0, -bu.h * sz / 200); drawChime(ctx, t, sz, {});
    } else if (k === 'letter') {
      var bg = K.glyph.box({}), sg = size * 0.9 * 100 / Math.max(bg.w, bg.h);
      ctx.translate(0, -bg.h * sg / 200); drawChime(ctx, { kind: 'glyph', text: t.text, color: t.color }, sg, {});
    } else if (k === 'number') {
      var n = Math.round(num(t.n != null ? t.n : t.text, 1)), s1 = size / 100;
      ctx.scale(s1, s1);
      var txt = String(n);
      ctx.fillStyle = '#FFF6E6'; ctx.strokeStyle = '#B89B72'; ctx.lineWidth = 3;
      ctx.beginPath(); rrect(ctx, -44, -46, 88, 92, 18); ctx.fill(); ctx.stroke();
      carvedText(ctx, txt, 0, n >= 1 && n <= 10 ? -10 : 0, 70, n >= 1 && n <= 10 ? 52 : 64, '#6E4526');
      if (n >= 1 && n <= 10) {
        var per = n <= 5 ? n : 5, rows = n <= 5 ? 1 : 2, dr = 5;
        for (var i = 0; i < n; i++) {
          var row = Math.floor(i / 5), cnt = row ? n - 5 : per, col = i % 5;
          var dx = (col - (cnt - 1) / 2) * 13.5, dy = rows === 1 ? 30 : 26 + row * 12;
          dot(ctx, dx, dy, dr, DOTC.base); ctx.strokeStyle = DOTC.dark; ctx.lineWidth = 1.5; ctx.beginPath(); circ(ctx, dx, dy, dr); ctx.stroke();
        }
      }
    } else if (k === 'color') {
      var c = pal(t.color) || FALLBACK.red, s2 = size / 100;
      ctx.scale(s2, s2);
      var blob = function (x) {
        x.moveTo(40, 0);
        for (var j = 1; j <= 9; j++) { var a = j * TAU / 9, am = a - TAU / 18, ro = j % 2 ? 44 : 38; x.quadraticCurveTo(Math.cos(am) * 48, Math.sin(am) * 46, Math.cos(a) * ro, Math.sin(a) * ro * 0.95); }
        x.closePath();
      };
      cel(ctx, 'ic.blob', blob, c, { s: 5, hl: [-16, -18, 10, 6, -0.6] });
      dot(ctx, 30, 34, 6, c.base); ctx.strokeStyle = lineOf(c); ctx.lineWidth = 2.4; ctx.beginPath(); circ(ctx, 30, 34, 6); ctx.stroke();
      dot(ctx, 4, -24, 3.5, 'rgba(255,255,255,0.7)');
    } else if (k === 'size') {
      var big = t.big === true || t.size === 'big', inner = { kind: 'bell', color: t.color || 'red' };
      if (big) { ctx.translate(0, -size * 0.46); drawChime(ctx, inner, size * 0.92, {}); }
      else {
        ctx.strokeStyle = 'rgba(120,100,80,0.28)'; ctx.setLineDash && ctx.setLineDash([5, 5]); ctx.lineWidth = 2;
        ctx.beginPath(); rrect(ctx, -size * 0.44, -size * 0.44, size * 0.88, size * 0.88, size * 0.12); ctx.stroke(); ctx.setLineDash && ctx.setLineDash([]);
        ctx.translate(0, size * 0.44 - size * 0.5 - 4); drawChime(ctx, inner, size * 0.5, {});
      }
    } else {
      dot(ctx, 0, 0, size * 0.35, '#E9D7B9'); ctx.strokeStyle = '#A8875E'; ctx.lineWidth = 3; ctx.beginPath(); circ(ctx, 0, 0, size * 0.35); ctx.stroke();
    }
    ctx.restore();
  }

  // ================================================================= GHOST HAND (points up-left, tip at origin)
  function drawGhostHand(ctx, size, press) {
    if (!ctx) return;
    var s = num(size, 100); if (!(s > 0)) return;
    var p = clamp01(press), F = '#FFF6EA', L = '#B9835A', EDGE2 = '#4A3B5C';
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
    function hand(x) {
      x.beginPath();
      rrect(x, -s * 0.085, 0, s * 0.17, s * 0.52, s * 0.085);
      rrect(x, -s * 0.26, s * 0.36, s * 0.47, s * 0.42, s * 0.14);
      x.moveTo(-s * 0.2, s * 0.5);
      x.ellipse(-s * 0.27, s * 0.46, s * 0.07, s * 0.15, -0.6, 0, TAU);
    }
    ctx.globalAlpha *= 0.95;
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
    hand(ctx); ctx.lineWidth = s * 0.07 + 6; ctx.strokeStyle = EDGE2; ctx.stroke(); ctx.restore();
    hand(ctx); ctx.lineWidth = s * 0.07; ctx.strokeStyle = L; ctx.stroke();
    hand(ctx); ctx.fillStyle = F; ctx.fill();
    ctx.strokeStyle = '#F1D6B8'; ctx.lineWidth = s * 0.03;
    ctx.beginPath(); ctx.moveTo(0, s * 0.5); ctx.lineTo(s * 0.18, s * 0.5); ctx.moveTo(0, s * 0.62); ctx.lineTo(s * 0.18, s * 0.62); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.beginPath(); ell(ctx, -s * 0.03, s * 0.12, s * 0.025, s * 0.07, 0); ctx.fill();
    // cuff: Kiki's cream camp bandana with brown polka dots
    ctx.fillStyle = '#F1E6CF'; ctx.strokeStyle = '#A27B55'; ctx.lineWidth = s * 0.035;
    ctx.beginPath(); rrect(ctx, -s * 0.25, s * 0.76, s * 0.46, s * 0.15, s * 0.06); ctx.fill(); ctx.stroke();
    [[-0.16, 0.81], [-0.04, 0.86], [0.08, 0.81], [0.15, 0.87], [-0.1, 0.88]].forEach(function (d) { dot(ctx, s * d[0], s * d[1], s * 0.017, '#A27B55'); });
    ctx.restore();
  }

  function clearCache() { pcache = {}; pN = 0; bcache = {}; }

  CC.ChimeArt = {
    drawChime: drawChime, bodyBox: bodyBox, drawCord: drawCord, drawBeam: drawBeam, hookPoint: hookPoint,
    drawGarland: drawGarland, drawFire: drawFire, drawNote: drawNote, drawIcon: drawIcon, drawGhostHand: drawGhostHand,
    drawFirefly: drawFirefly,
    pal: function (n) { return pal(n) || null; }, PALETTE: FALLBACK, BRASS: BRASS, WOOD: WOOD, FONT: FONT,
    SHAPES: SHAPES, ANIMALS: ANIMALS, KINDS: KINDS, STRING_BELL: { k: MB_K, w: 82 * MB_K + 2.8, h: MB_H }, thingKey: thingKey, lanternRadius: lanternRadius, fireTop: fireTop,
    clearCache: clearCache
  };
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
