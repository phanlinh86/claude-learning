/* Rio's Singing Eggs — SE.EggArt (character artist B), DESIGN §3 / §4.2. Everything here is drawn by code on a 2D canvas.
 *
 *   drawEgg(ctx, thing, size, opt)  origin = the BOTTOM CENTRE of the egg (where it sits in its straw ring); the body
 *       stands UP (−y). size = the egg's height (its longest side); width ≈ 0.78 × size.
 *       thing = { kind: 'egg'|'shape'|'big'|'dots'|'animal'|'glyph', color?, shape?, n?, animal?, text? }
 *       opt   = { glow 0..1 (soft gold halo), ring 0..1 (struck: white rim flash + shimmer + 2–3 sound rings from the top),
 *                 dull 0|1 (wrong: no flash / rings), sq (vertical squash, 1 = rest; width × 1/√sq, bottom stays at the
 *                 anchor), skin 0..1 + skinPh rad (a bright shimmer band sweeping round the shell), dim 0..1,
 *                 night 0..1 (moonlight rim, never darkens), pop 0..1.5 (scale about the anchor), count -1|0..n (dots egg:
 *                 the first `count` spots get a gold ring), sing 0..1 (animal mouth open + song lines) }
 *   bodyBox(thing, size) → { w, h, cy }   visible box in px (w, h ≤ size); cy = body centre offset from the anchor (< 0)
 *   drawCushion(ctx, x, y, w, opt)        mossy floating rock island + the BACK half of the straw ring, origin = the ring's
 *                                         TOP centre (the egg's bottom sits there); opt { dent 0..1, t, night, alpha, pop }
 *   drawCushionFront(ctx, x, y, w, opt)   the FRONT half of the straw ring — same args, drawn AFTER the egg
 *   cushionDip(w, dent) → px              how far the ring's top centre sinks for that dent (the egg may ride it)
 *   drawGarland(ctx, garland, lanterns, opt)   leafy vine between two fern tufts; lanterns[i] = {x, y (on the vine), lit 0..1,
 *                                         color|null, swing, flash, icon: thing|null, hidden, now 0..1}; opt { t, night, r (22) }
 *   drawCymbal(ctx, cym, opt)             the little volcano; cym = {x, y (foot), s (or h → s = h / 140)}; opt { tilt (puff
 *                                         wobble), ring 0..1 (sparkly smoke ring rising), night, t }
 *   drawCard(ctx, x, y, n, opt)           stone number tablet, origin = CENTRE; opt { lit, pop, flash, size (height, 150) }
 *   drawNote(ctx, x, y, size, opt)        ♪ centred at (x, y), size = height; opt { color, alpha, rot }
 *   drawSpark(ctx, x, y, size, opt)       Rio's sung spark (glowing star-puff + tiny trail), centred, size ≈ the star's span; opt { color, alpha, t,
 *                                         vx, vy (flight direction → the trail points the other way) }
 *   drawIcon(ctx, thing, size)            centred in a size × size box: any egg thing, or number {n} | color {color} |
 *                                         size {big, color?} | sound {animal} (the baby's head) | letter {text}
 *   drawGhostHand(ctx, size, press)       friendly pointing hand, origin = fingertip, press 0..1
 *   drawFirefly(ctx, x, y, r, glow)       a real firefly (tiny body + yellow-green tail light), r ≈ body size (px)
 *   Helpers: pal(color), PALETTE, SHELL, STRAW, ROCK, MOSS, VINE, POD, VOLCANO, STONE, FONT, SHAPES, ANIMALS, KINDS,
 *            thingKey, lanternRadius, cushionDip, clearCache, CYMBAL_H.
 *
 * Eggs are designed in a 100-unit box (x −39..39, y −100..0, anchor at (0, 0)); the ctx is scaled by size / 100.
 * Path2D objects are cached per part (size independent — equivalent to per thing+size because the ctx is scaled).
 * Node-safe at load (no DOM). Without Path2D (node tests) paths are rebuilt on the ctx each draw.
 */
(function (G) {
  'use strict';
  var SE = G.SE = G.SE || {};

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
  // neutral parts (DESIGN §3) — never an answer colour
  var SHELL = { base: '#FFF4E0', shade: '#EAD9BC', dark: '#B4976E', light: '#FFFFFF', speck: '#D9C3A0', inside: '#E2CDA6' };
  var STRAW = { base: '#E3C27E', dark: '#A88443', light: '#F5E2B0', deep: '#8A6A32' };
  var ROCK = { base: '#9C8F86', dark: '#6E625C', light: '#BDB3AA' };
  var MOSS = { base: '#8DBF6A', dark: '#5E8F45', light: '#B3D395' };
  var VINE = { base: '#6E9B52', dark: '#4C7238', light: '#9CC47E' };
  var POD = { base: '#EFDDB2', dark: '#9E8A63', shade: '#DCC69A', light: '#FFFFFF' };   // darker than the morning sky (QA visual P2-12)
  var ROOT = { base: '#8A6E52', dark: '#5E4A36' };
  var VOLCANO = { base: '#A27B5C', dark: '#6E5040', light: '#C9A27E', shade: '#8A664C', glow: '#E89A5C', hot: '#F6C48E' };
  var STONE = { base: '#DCD5C6', dark: '#8E8676', light: '#F3EFE6', shade: '#C4BBA8', ink: '#5A5246' };
  var GOLD = { base: '#E9B949', dark: '#9C7838', light: '#F8E3A6' };          // notes / pods with no colour
  var STAR = { base: '#FFD23F', dark: '#B8860B', light: '#FFF1B0' };          // gold star emblem / lit tablet dots
  var BIGSPOT = { base: '#C9944A', dark: '#9C6E30' };
  var GLYPH_INK = '#5B6B9A';
  var SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'rect', 'diamond', 'oval'];
  var ANIMALS = ['duck', 'chick', 'owl', 'frog', 'dino', 'snake'];
  var KINDS = ['egg', 'shape', 'big', 'dots', 'animal', 'glyph'];
  var EYE = '#2F2A3A', CHEEK = '#F4A9A0', MOUTH = '#7A2E3A', TONGUE = '#F28B9A';

  // ---------------------------------------------------------------- colour helpers
  function rgb(h) { h = String(h).replace('#', ''); return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]; }
  function mix(a, b, t) {
    var A = rgb(a), B = rgb(b), o = '#';
    for (var i = 0; i < 3; i++) { var v = Math.round(A[i] + (B[i] - A[i]) * t); o += (v < 16 ? '0' : '') + v.toString(16); }
    return o.toUpperCase();
  }
  function rgba(hex, a) { var c = rgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + Math.max(0, Math.min(1, +a || 0)).toFixed(3) + ')'; }
  function clamp01(v) { v = +v || 0; return v < 0 ? 0 : v > 1 ? 1 : v; }
  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function pal(name) {
    var P = SE.PALETTE, c = P && P[name] && P[name].base ? P[name] : FALLBACK[name];
    return c || null;
  }
  function lineOf(c) { return c.base === '#FFD23F' ? '#A87E0A' : c.dark; }   // yellow gets a deeper outline so it reads
  function shadeOf(c) { return c.shade || mix(c.base, c.dark, 0.36); }

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

  function circ(t, x, y, r) { r = Math.max(0.01, r); t.moveTo(x + r, y); t.arc(x, y, r, 0, TAU); t.closePath(); }
  function ell(t, x, y, rx, ry, rot) { rot = rot || 0; rx = Math.max(0.01, rx); ry = Math.max(0.01, ry); t.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot)); t.ellipse(x, y, rx, ry, rot, 0, TAU); t.closePath(); }
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
  function poly(t, pts) { t.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) t.lineTo(pts[i][0], pts[i][1]); t.closePath(); }

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

  /** one-step cel shading: shade, base shifted up-left (so the shade shows as a crescent lower-right), a soft highlight,
   *  then the outline */
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
  function dot(ctx, x, y, r, col) { ctx.fillStyle = col; ctx.beginPath(); circ(ctx, x, y, Math.max(0.01, r)); ctx.fill(); }
  function oval(ctx, x, y, rx, ry, rot, col) { ctx.fillStyle = col; ctx.beginPath(); ell(ctx, x, y, rx, ry, rot); ctx.fill(); }
  function line(ctx, pts, col, w) {
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.stroke();
  }
  function curve(ctx, x0, y0, cx, cy, x1, y1, col, w) {
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, x1, y1); ctx.stroke();
  }
  function sparkle(ctx, x, y, r, col) {
    r = Math.max(0.01, r);
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r); ctx.closePath(); ctx.fill();
  }
  function starPts(cx, cy, ro, ri) {
    var pts = [];
    for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? ri : ro; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    return pts;
  }
  function starPath(t, cx, cy, ro, ri, rr) { rpoly(t, starPts(cx, cy, ro, ri), rr == null ? ro * 0.14 : rr); }
  function glowDisc(ctx, x, y, r0, r1, col, a) {
    if (!(a > 0.003) || !(r1 > 0)) return;
    var g = ctx.createRadialGradient(x, y, Math.max(0, r0), x, y, r1);
    g.addColorStop(0, rgba(col, a)); g.addColorStop(0.5, rgba(col, a * 0.42)); g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g; ctx.beginPath(); circ(ctx, x, y, r1); ctx.fill();
  }

  // ---------------------------------------------------------------- faces
  function eye(ctx, x, y, r, happy) {
    if (happy) {
      ctx.strokeStyle = EYE; ctx.lineWidth = r * 0.8; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - r, y + r * 0.35); ctx.quadraticCurveTo(x, y - r * 1.1, x + r, y + r * 0.35); ctx.stroke();
      return;
    }
    oval(ctx, x, y, r, r * 1.12, 0, EYE);
    dot(ctx, x - r * 0.3, y - r * 0.4, r * 0.42, '#FFFFFF');
    dot(ctx, x + r * 0.35, y + r * 0.42, r * 0.17, 'rgba(255,255,255,0.8)');
  }
  function cheek(ctx, x, y, r) { oval(ctx, x, y, r, r * 0.62, 0, rgba(CHEEK, 0.75)); }
  /** a small mouth: closed smile, or (open > 0) an open singing "o"-smile */
  function mouth(ctx, x, y, w, open, col) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (open > 0.05) {
      var h = w * (0.5 + 1.1 * open);
      var m = function (q) {
        q.moveTo(x - w, y); q.quadraticCurveTo(x, y - w * 0.25, x + w, y);
        q.quadraticCurveTo(x + w * 0.9, y + h, x, y + h); q.quadraticCurveTo(x - w * 0.9, y + h, x - w, y); q.closePath();
      };
      ctx.fillStyle = MOUTH; ctx.beginPath(); m(ctx); ctx.fill();
      ctx.save(); ctx.beginPath(); m(ctx); ctx.clip();
      ctx.fillStyle = TONGUE; ctx.beginPath(); ell(ctx, x, y + h * 0.82, w * 0.55, h * 0.3, 0); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.beginPath(); m(ctx); ctx.stroke();
    } else {
      ctx.strokeStyle = col; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(x - w, y); ctx.quadraticCurveTo(x - w * 0.5, y + w * 0.75, x, y + w * 0.1);
      ctx.quadraticCurveTo(x + w * 0.5, y + w * 0.75, x + w, y); ctx.stroke();
    }
  }

  // ================================================================= EGG GEOMETRY
  // Right half of the shell as two cubic Béziers from the bottom (0, 0) to the top (0, −100); widest (39) at y −40.
  var EW = 39, EH = 100;
  var EGG_SEG = [[0, 0, 22, 0, EW, -14, EW, -40], [EW, -40, EW, -72, 22, -EH, 0, -EH]];
  function eggPath(t) {
    t.moveTo(0, 0);
    t.bezierCurveTo(22, 0, EW, -14, EW, -40); t.bezierCurveTo(EW, -72, 22, -EH, 0, -EH);
    t.bezierCurveTo(-22, -EH, -EW, -72, -EW, -40); t.bezierCurveTo(-EW, -14, -22, 0, 0, 0); t.closePath();
  }
  var EGG_PTS = (function () {   // sampled right half, bottom → top
    var out = [];
    EGG_SEG.forEach(function (s, k) {
      for (var i = k ? 1 : 0; i <= 48; i++) {
        var t = i / 48, u = 1 - t;
        out.push([u * u * u * s[0] + 3 * u * u * t * s[2] + 3 * u * t * t * s[4] + t * t * t * s[6],
          u * u * u * s[1] + 3 * u * u * t * s[3] + 3 * u * t * t * s[5] + t * t * t * s[7]]);
      }
    });
    return out;
  })();
  /** shell half width at height y (y in −100..0) */
  function hw(y) {
    for (var i = 1; i < EGG_PTS.length; i++) {
      var a = EGG_PTS[i - 1], b = EGG_PTS[i];
      if ((a[1] >= y && b[1] <= y)) { var f = (a[1] - y) / ((a[1] - b[1]) || 1); return a[0] + (b[0] - a[0]) * f; }
    }
    return 0;
  }
  /** zig-zag crack points from left to right at height y (teeth up / down) */
  function zig(y, teeth, amp, ph) {
    var w = hw(y), out = [];
    for (var i = 0; i <= teeth; i++) {
      var x = -w + 2 * w * i / teeth, up = (i + (ph || 0)) % 2 === 0;
      out.push([x, y + (i === 0 || i === teeth ? 0 : (up ? -amp : amp * 0.7))]);
    }
    return out;
  }
  /** the shell BELOW a zig-zag crack at y (front / back half of a hatched egg) */
  function lowerShell(t, y, teeth, amp, ph) {
    var Z = zig(y, teeth, amp, ph), i;
    t.moveTo(Z[Z.length - 1][0], Z[Z.length - 1][1]);
    for (i = EGG_PTS.length - 1; i >= 0; i--) if (EGG_PTS[i][1] >= y) t.lineTo(EGG_PTS[i][0], EGG_PTS[i][1]);
    for (i = 0; i < EGG_PTS.length; i++) if (EGG_PTS[i][1] >= y) t.lineTo(-EGG_PTS[i][0], EGG_PTS[i][1]);
    for (i = 0; i < Z.length; i++) t.lineTo(Z[i][0], Z[i][1]);
    t.closePath();
  }
  /** the shell ABOVE the crack (the cap) */
  function upperShell(t, y, teeth, amp, ph) {
    var Z = zig(y, teeth, amp, ph), i;
    t.moveTo(Z[0][0], Z[0][1]);
    for (i = 1; i < Z.length; i++) t.lineTo(Z[i][0], Z[i][1]);
    for (i = 0; i < EGG_PTS.length; i++) if (EGG_PTS[i][1] < y) t.lineTo(EGG_PTS[i][0], EGG_PTS[i][1]);
    for (i = EGG_PTS.length - 1; i >= 0; i--) if (EGG_PTS[i][1] < y) t.lineTo(-EGG_PTS[i][0], EGG_PTS[i][1]);
    t.closePath();
  }

  var FLASH = 0;
  /** a whole egg shell in colour c (cel shaded, highlight upper-left), speckles, then deco(ctx) on the front */
  function shell(ctx, c, specks, deco) {
    cel(ctx, 'egg.shell', eggPath, c, {
      s: 5.2, shade: shadeOf(c), lw: LW, line: c.line || lineOf(c), hl: false,
      inner: function (x) {
        // soft highlight upper-left + a little catch-light
        oval(x, -16, -70, 9, 15, 0.42, rgba(mix(c.light, '#FFFFFF', 0.55), 0.85));
        oval(x, -22, -50, 3, 4.5, 0.3, rgba('#FFFFFF', 0.6));
        // a soft reflected light along the bottom-right
        x.strokeStyle = rgba(c.light, 0.35); x.lineWidth = 2.2;
        x.beginPath(); x.ellipse(0, -40, EW - 4.5, 36, 0, 0.2, 1.25); x.stroke();
        if (specks) specks(x);
        if (FLASH > 0.01) { x.fillStyle = 'rgba(255,255,255,' + (0.35 * FLASH).toFixed(3) + ')'; x.fillRect(-EW - 2, -EH - 2, 2 * EW + 4, EH + 4); }
      }
    });
    if (deco) deco(ctx);
  }
  // fixed speckle spots (x, y, rx, ry, rot) — away from the centre emblem area for emblem eggs
  var SPECK_EGG = [[-20, -30, 4.2, 3.2, 0.4], [14, -76, 3.6, 2.6, -0.5], [22, -22, 3, 2.3, 0.2], [-6, -88, 2.2, 1.7, 0], [6, -46, 2, 1.6, 0.6], [-27, -58, 2.4, 1.8, 0.9]];
  var SPECK_EDGE = [[-26, -16, 2.8, 2.1, 0.4], [24, -14, 2.4, 1.8, -0.3], [-10, -90, 2.6, 1.9, 0.2], [12, -88, 2, 1.5, -0.4], [30, -60, 1.8, 1.4, 0.8], [-32, -48, 1.8, 1.4, 0.2]];
  function specks(list, col) { return function (x) { list.forEach(function (s) { oval(x, s[0], s[1], s[2], s[3], s[4], col); }); }; }
  var CREAM = { base: SHELL.base, dark: SHELL.dark, light: SHELL.light, shade: SHELL.shade, line: SHELL.dark };

  // ---------------------------------------------------------------- kind: 'egg' (colours, sizes) — the whole shell is the colour
  var EGG = {
    col: function (th) { return pal(th.color) || CREAM; },
    draw: function (ctx, th) {
      var c = this.col(th);
      shell(ctx, c, specks(SPECK_EGG, c === CREAM ? SHELL.speck : rgba(mix(c.light, '#FFFFFF', 0.15), 0.85)));
    }
  };

  // ---------------------------------------------------------------- kind: 'shape' — cream shell with a BIG emblem
  var SHAPE = {   // emblems in a −50..50 × 0..100 design box, scaled onto the egg front
    circle:   { b: function (t) { circ(t, 0, 55, 44); } },
    square:   { b: function (t) { rrect(t, -42, 13, 84, 84, 9); } },
    triangle: { b: function (t) { rpoly(t, [[0, 8], [52, 96], [-52, 96]], [9, 9, 9]); }, dy: 3 },
    star:     { b: function (t) { rpoly(t, starPts(0, 59, 52, 23), [5, 2.5, 5, 2.5, 5, 2.5, 5, 2.5, 5, 2.5]); }, dy: 2 },
    heart:    { b: function (t) {
      t.moveTo(0, 96);
      t.bezierCurveTo(-14, 85, -48, 66, -48, 38);
      t.bezierCurveTo(-48, 22, -36, 13, -23.5, 13);
      t.bezierCurveTo(-11, 13, -3, 20, 0, 29);
      t.bezierCurveTo(3, 20, 11, 13, 23.5, 13);
      t.bezierCurveTo(36, 13, 48, 22, 48, 38);
      t.bezierCurveTo(48, 66, 14, 85, 0, 96);
      t.closePath();
    } },
    rect:     { b: function (t) { rrect(t, -58, 26, 116, 60, 8); } },
    diamond:  { b: function (t) { rpoly(t, [[0, 4], [38, 55], [0, 106], [-38, 55]], [6, 7, 6, 7]); } },
    oval:     { b: function (t) { ell(t, 0, 55, 30, 46, 0); } }
  };
  function shapeOf(th) { return SHAPE[th.shape] ? th.shape : 'circle'; }
  /** the emblem centred at (0, cy) fitting a maxW × maxH box (design units) */
  function emblem(ctx, s, c, cy, maxW, maxH, border) {
    var S = SHAPE[s], b = bbox('emb.' + s, S.b), k = Math.min(maxW / b.w, maxH / b.h);
    ctx.save(); ctx.translate(0, cy + (S.dy || 0) * k); ctx.scale(k, k); ctx.translate(-(b.x + b.w / 2), -(b.y + b.h / 2));
    var p = P('emb.' + s, S.b);
    if (border !== false) { ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = (border || 4.6) * 2 / k; ctx.lineJoin = 'round'; strokeP(ctx, p); }
    cel(ctx, 'emb.' + s, S.b, c, { s: 5, lw: 3.2 / k, line: lineOf(c), hl: [b.x + b.w * 0.3, b.y + b.h * 0.27, b.w * 0.12, b.h * 0.07, -0.6] });
    ctx.restore();
  }
  var SHAPED = {
    col: function (th) { return pal(th.color) || FALLBACK.blue; },
    draw: function (ctx, th) {
      var c = this.col(th), s = shapeOf(th);
      shell(ctx, CREAM, specks(SPECK_EDGE, SHELL.speck), function (x) { emblem(x, s, c, -43, 56, 54); });
    }
  };

  // ---------------------------------------------------------------- kind: 'big' — giant cream egg, brown-gold spots + gold star
  var BIG_SPOTS = [[-25, -62, 7.5, 6, 0.5], [22, -78, 6.2, 5, -0.4], [26, -30, 7, 5.6, 0.3], [-22, -20, 6, 4.6, -0.2], [-4, -91, 4.4, 3.4, 0.1],
    [8, -12, 4.6, 3.4, 0], [-31, -40, 3.6, 3, 0.7], [31, -55, 3.4, 2.8, 0.2]];
  var BIG = {
    col: function () { return CREAM; },
    draw: function (ctx) {
      shell(ctx, CREAM, function (x) {
        BIG_SPOTS.forEach(function (s) {
          oval(x, s[0], s[1], s[2], s[3], s[4], BIGSPOT.base);
          x.strokeStyle = rgba(BIGSPOT.dark, 0.55); x.lineWidth = 1.4; x.beginPath(); ell(x, s[0], s[1], s[2], s[3], s[4]); x.stroke();
          oval(x, s[0] - s[2] * 0.3, s[1] - s[3] * 0.35, s[2] * 0.32, s[3] * 0.24, -0.5, 'rgba(255,240,210,0.6)');
        });
      }, function (x) {
        var sp = function (t) { starPath(t, 0, -44, 21, 9.6, 3); };
        x.strokeStyle = '#FFFFFF'; x.lineWidth = 7; x.lineJoin = 'round'; x.beginPath(); sp(x); x.stroke();
        cel(x, 'big.star', sp, STAR, { s: 2.6, lw: 2.8, hl: [-6, -52, 3.5, 2.2, -0.6] });
      });
    }
  };

  // ---------------------------------------------------------------- kind: 'dots' — n red spots, countable
  var DOTC = FALLBACK.red;
  function dotLayout(n) {
    var out = [], i, rows, per, sp, r, y0;
    if (n <= 3) { per = n; rows = 1; sp = 21; r = 8.6; y0 = -44; }
    else if (n <= 6) { per = Math.ceil(n / 2); rows = 2; sp = per === 2 ? 22 : 19; r = 7.6; y0 = -54; }
    else if (n <= 9) { per = 3; rows = 3; sp = 17.5; r = 6.9; y0 = -63; }
    else { per = 4; rows = 3; sp = 15.2; r = 6; y0 = -62; }
    var rowGap = rows === 3 ? 17 : 21;
    for (i = 0; i < n; i++) {
      var row = Math.floor(i / per), col = i % per, inRow = Math.min(per, n - row * per);
      // the last (partial) row starts under the first column so it reads like a ten-frame
      var x0 = n > 6 ? -(per - 1) / 2 * sp : -(inRow - 1) / 2 * sp;
      out.push([x0 + col * sp, y0 + row * rowGap, r]);
    }
    return out;
  }
  var DOTS = {
    col: function () { return CREAM; },
    draw: function (ctx, th, o) {
      var n = Math.max(1, Math.min(12, Math.round(num(th.n, 3)))), cnt = o.count == null ? -1 : num(o.count, -1);
      shell(ctx, CREAM, specks(SPECK_EDGE.slice(0, 4), SHELL.speck), function (x) {
        var L = dotLayout(n);
        for (var i = 0; i < L.length; i++) {
          var d = L[i];
          dot(x, d[0] + 0.7, d[1] + 1.2, d[2], 'rgba(150,110,70,0.22)');
          dot(x, d[0], d[1], d[2], DOTC.base);
          x.strokeStyle = DOTC.dark; x.lineWidth = 1.6; x.beginPath(); circ(x, d[0], d[1], d[2]); x.stroke();
          oval(x, d[0] - d[2] * 0.32, d[1] - d[2] * 0.36, d[2] * 0.34, d[2] * 0.24, -0.6, 'rgba(255,255,255,0.75)');
          if (cnt >= 0 && i < cnt) {
            x.strokeStyle = '#E8A21A'; x.lineWidth = 3.8; x.beginPath(); circ(x, d[0], d[1], d[2] + 2.4); x.stroke();
            x.strokeStyle = '#FFFFFF'; x.lineWidth = 1.8; x.beginPath(); circ(x, d[0], d[1], d[2] + 2.4); x.stroke();
          }
        }
      });
    }
  };

  // ---------------------------------------------------------------- kind: 'glyph' — a chunky letter / number
  function glyphText(t) { var s = t.text != null ? String(t.text) : t.n != null ? String(t.n) : '?'; return s.length ? s.slice(0, 2) : '?'; }
  function glyphFont(px) { return '900 ' + Math.round(px * 10) / 10 + 'px ' + FONT; }
  /** chunky text centred at (x, y) fitting maxW × maxH; col = ink colour; carved = engraved look (stone) */
  function chunkyText(ctx, txt, x, y, maxW, maxH, col, edge) {
    var px = maxH * 1.12;
    ctx.font = glyphFont(px);
    var m = ctx.measureText ? ctx.measureText(txt) : null, w = m && m.width > 0 ? m.width : px * 0.64 * txt.length;
    if (w > maxW) { px *= maxW / w; ctx.font = glyphFont(px); m = ctx.measureText ? ctx.measureText(txt) : null; }
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    var asc = m && m.actualBoundingBoxAscent > 0 ? m.actualBoundingBoxAscent : px * 0.72,
      desc = m && m.actualBoundingBoxDescent >= 0 && m.actualBoundingBoxAscent > 0 ? m.actualBoundingBoxDescent : 0;
    var by = y + (asc - desc) / 2;
    ctx.lineJoin = 'round';
    if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = Math.max(1, px * 0.12); ctx.strokeText && ctx.strokeText(txt, x, by); }
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillText(txt, x + 0.8, by + 1.4);       // the lip catches light
    ctx.fillStyle = mix(col, '#2F2A3A', 0.35); ctx.fillText(txt, x - 0.5, by - 0.6);     // inner wall
    ctx.fillStyle = col; ctx.fillText(txt, x, by);
  }
  var GLYPH = {
    col: function () { return CREAM; },
    draw: function (ctx, th) {
      var c = pal(th.color), txt = glyphText(th), ink = c ? (c.base === '#FFD23F' ? '#C99A12' : c.base) : GLYPH_INK;
      shell(ctx, CREAM, specks(SPECK_EDGE, SHELL.speck), function (x) {
        chunkyText(x, txt, 0, -43, txt.length > 1 ? 58 : 50, 46, ink, '#FFFFFF');
      });
    }
  };

  // ================================================================= ANIMALS — babies peeking out of a cracked egg
  var CR = -35, BORDER = 4.6, HY = -60;
  var AC = {
    duck:  { base: '#F6E08A', dark: '#B99A3E', light: '#FFF5C8' },
    chick: { base: '#FBE9A6', dark: '#C4A550', light: '#FFF9DC' },
    owl:   { base: '#A88E78', dark: '#6E5846', light: '#CDB8A2' },
    frog:  { base: '#9CCB7A', dark: '#5E8A44', light: '#CBE6B2' },
    dino:  { base: '#B7B0D8', dark: '#7A72A8', light: '#DCD8EF' },
    snake: { base: '#D8BC86', dark: '#9C7A45', light: '#F0DDB5' }   // sandy: never confused with the froglet (QA visual P2-8)
  };
  var BEAK = { base: '#F5B07A', dark: '#B86E3C', light: '#FFD9B8' };   // peach beak (not the answer orange)
  var BELLY = { base: '#FFF1D6', dark: '#C9AE84', light: '#FFFFFF' };
  var OWLDISC = { base: '#EFE2CC', dark: '#A88E78', light: '#FFFFFF' };
  var SPIKE = { base: '#F6D9A8', dark: '#C39A5E', light: '#FFF1D8' };
  var AN = {
    duck: {
      sil: function (t) { circ(t, 0, HY, 23); },
      cap: [7, HY - 19, 0.38],
      face: function (x, op) {
        eye(x, -9, HY - 4, 3.5, false); eye(x, 9, HY - 4, 3.5, false);
        cheek(x, -16, HY + 5, 4); cheek(x, 16, HY + 5, 4);
        // broad flat bill
        var up = function (t) { t.moveTo(-12, HY + 5); t.quadraticCurveTo(0, HY - 0.5, 12, HY + 5); t.quadraticCurveTo(13, HY + 10 - op * 3, 0, HY + 10 - op * 3); t.quadraticCurveTo(-13, HY + 10 - op * 3, -12, HY + 5); t.closePath(); };
        if (op > 0.05) {
          oval(x, 0, HY + 11, 8.5, 2 + op * 4.5, 0, MOUTH);
          var lo = function (t) { t.moveTo(-10, HY + 11 + op * 3); t.quadraticCurveTo(0, HY + 18 + op * 4, 10, HY + 11 + op * 3); t.quadraticCurveTo(0, HY + 13 + op * 3, -10, HY + 11 + op * 3); t.closePath(); };
          x.fillStyle = BEAK.base; x.beginPath(); lo(x); x.fill(); x.strokeStyle = BEAK.dark; x.lineWidth = 1.6; x.beginPath(); lo(x); x.stroke();
        }
        x.fillStyle = BEAK.base; x.beginPath(); up(x); x.fill(); x.strokeStyle = BEAK.dark; x.lineWidth = 1.8; x.beginPath(); up(x); x.stroke();
        oval(x, -4, HY + 4, 3.5, 1.3, 0, 'rgba(255,255,255,0.6)');
        dot(x, -3, HY + 3.4, 0.9, BEAK.dark); dot(x, 3, HY + 3.4, 0.9, BEAK.dark);
      },
      paws: 'wing'
    },
    chick: {
      sil: function (t) {
        var n = 14, R = 22;
        t.moveTo(R + 2, HY);
        for (var i = 1; i <= n; i++) { var a = i * TAU / n, am = a - TAU / (2 * n); t.quadraticCurveTo(Math.cos(am) * (R + 4.5), HY + Math.sin(am) * (R + 4.5), Math.cos(a) * (R + 2), HY + Math.sin(a) * (R + 2)); }
        t.closePath();
      },
      cap: [-6, HY - 20, -0.36],
      face: function (x, op) {
        eye(x, -8.5, HY - 3, 3.8, false); eye(x, 8.5, HY - 3, 3.8, false);
        cheek(x, -15, HY + 6, 4); cheek(x, 15, HY + 6, 4);
        var u = function (t) { t.moveTo(-5, HY + 3); t.lineTo(5, HY + 3); t.quadraticCurveTo(1, HY + 7 - op * 2, 0, HY + 9 - op * 2.5); t.quadraticCurveTo(-1, HY + 7 - op * 2, -5, HY + 3); t.closePath(); };
        if (op > 0.05) {
          oval(x, 0, HY + 8.5, 4.4, 1.5 + op * 3, 0, MOUTH);
          var l = function (t) { t.moveTo(-4, HY + 9 + op * 2.5); t.lineTo(4, HY + 9 + op * 2.5); t.lineTo(0, HY + 13 + op * 3); t.closePath(); };
          x.fillStyle = BEAK.base; x.beginPath(); l(x); x.fill(); x.strokeStyle = BEAK.dark; x.lineWidth = 1.4; x.beginPath(); l(x); x.stroke();
        }
        x.fillStyle = BEAK.base; x.beginPath(); u(x); x.fill(); x.strokeStyle = BEAK.dark; x.lineWidth = 1.5; x.beginPath(); u(x); x.stroke();
        // fluff tufts
        curve(x, -12, HY + 16, -10, HY + 19, -6, HY + 17, rgba(AC.chick.dark, 0.5), 1.3);
        curve(x, 6, HY + 17, 10, HY + 19, 12, HY + 16, rgba(AC.chick.dark, 0.5), 1.3);
      },
      paws: 'fluff'
    },
    owl: {
      sil: function (t) { rpoly(t, [[-24, HY - 16], [-15, HY - 28], [-7, HY - 19], [7, HY - 19], [15, HY - 28], [24, HY - 16], [25, HY + 12], [14, HY + 22], [-14, HY + 22], [-25, HY + 12]], [4, 3, 6, 6, 3, 4, 12, 10, 10, 12]); },
      cap: [0, HY - 17, 0.08],
      face: function (x, op) {
        [-1, 1].forEach(function (sd) {
          cel(x, 'owl.disc.' + sd, function (t) { circ(t, sd * 9.5, HY + 0.5, 11); }, OWLDISC, { s: 1.4, lw: 1.6, hl: false, line: rgba(AC.owl.dark, 0.6) });
          eye(x, sd * 9.5, HY + 0.5, 5.2, false);
        });
        // little brows
        curve(x, -16, HY - 12, -10, HY - 15, -4, HY - 11, AC.owl.dark, 1.8);
        curve(x, 4, HY - 11, 10, HY - 15, 16, HY - 12, AC.owl.dark, 1.8);
        var b = function (t) { t.moveTo(-3.6, HY + 7); t.lineTo(3.6, HY + 7); t.quadraticCurveTo(1, HY + 12 - op * 1.5, 0, HY + 14 - op * 2); t.quadraticCurveTo(-1, HY + 12 - op * 1.5, -3.6, HY + 7); t.closePath(); };
        if (op > 0.05) oval(x, 0, HY + 14, 3.6, 1.4 + op * 3, 0, MOUTH);
        x.fillStyle = '#D9A066'; x.beginPath(); b(x); x.fill(); x.strokeStyle = '#9A6534'; x.lineWidth = 1.4; x.beginPath(); b(x); x.stroke();
        // chest feather scallops
        [-6, 0, 6].forEach(function (dx) { curve(x, dx - 3, HY + 18, dx, HY + 21, dx + 3, HY + 18, rgba(AC.owl.light, 0.9), 1.5); });
        cheek(x, -19, HY + 9, 3); cheek(x, 19, HY + 9, 3);
      },
      paws: 'wingOwl'
    },
    frog: {
      sil: function (t) { ell(t, 0, HY + 5, 27, 17, 0); circ(t, -13, HY - 10, 10); circ(t, 13, HY - 10, 10); },
      cap: [0, HY - 14, -0.18],
      face: function (x, op) {
        [-1, 1].forEach(function (sd) {
          dot(x, sd * 13, HY - 10, 7.2, '#FFFFFF'); x.strokeStyle = rgba(AC.frog.dark, 0.5); x.lineWidth = 1.2; x.beginPath(); circ(x, sd * 13, HY - 10, 7.2); x.stroke();
          eye(x, sd * 13, HY - 9.5, 4.4, false);
        });
        cheek(x, -19, HY + 6, 4.4); cheek(x, 19, HY + 6, 4.4);
        dot(x, -3, HY + 0.5, 0.9, AC.frog.dark); dot(x, 3, HY + 0.5, 0.9, AC.frog.dark);
        if (op > 0.05) mouth(x, 0, HY + 6, 10, op, AC.frog.dark);
        else { x.strokeStyle = AC.frog.dark; x.lineWidth = 2.2; x.beginPath(); x.moveTo(-14, HY + 5); x.quadraticCurveTo(0, HY + 15, 14, HY + 5); x.stroke(); }
        // belly patch
        oval(x, 0, HY + 18, 13, 4.5, 0, rgba('#E9F3C8', 0.9));
      },
      paws: 'frog'
    },
    dino: {
      sil: function (t) { ell(t, -2, HY - 1, 22, 21, 0); ell(t, 9, HY + 8, 15, 11, -0.1); },
      cap: [-6, HY - 18, -0.34],
      back: function (x) {   // rounded back spikes behind the head (left)
        [[-21, HY - 14, -0.9], [-25, HY - 2, -1.35], [-24, HY + 10, -1.8]].forEach(function (s, i) {
          x.save(); x.translate(s[0], s[1]); x.rotate(s[2]);
          cel(x, 'dino.spike.' + i, function (t) { rpoly(t, [[-5.5, 3], [0, -8], [5.5, 3]], [2.5, 2.8, 2.5]); }, SPIKE, { s: 1, lw: 1.8, hl: false });
          x.restore();
        });
      },
      face: function (x, op) {
        eye(x, -9, HY - 6, 3.8, false); eye(x, 5, HY - 7, 3.8, false);
        cheek(x, -15, HY + 4, 3.8); cheek(x, 17, HY + 6, 3.6);
        dot(x, 11, HY + 3.5, 1.2, AC.dino.dark); dot(x, 17, HY + 3, 1.2, AC.dino.dark);
        if (op > 0.05) mouth(x, 7, HY + 11, 7.5, op, AC.dino.dark);
        else {
          x.strokeStyle = AC.dino.dark; x.lineWidth = 2; x.beginPath(); x.moveTo(-1, HY + 11); x.quadraticCurveTo(8, HY + 16, 18, HY + 10); x.stroke();
          x.fillStyle = '#FFFFFF'; x.beginPath(); x.moveTo(9, HY + 13.2); x.lineTo(11.8, HY + 13); x.lineTo(10.3, HY + 15.6); x.closePath(); x.fill();
        }
        // soft cream belly showing at the rim
        oval(x, -1, HY + 22, 11, 5, 0, BELLY.base);
      },
      paws: 'claw'
    },
    snake: {
      sil: function (t) { ell(t, 0, HY + 1, 21, 16.5, 0); rrect(t, -9, HY + 10, 18, 26, 8); },
      cap: [5, HY - 13, 0.3],
      face: function (x, op) {
        // belly stripe on the neck
        x.fillStyle = BELLY.base; x.beginPath(); rrect(x, -5, HY + 14, 10, 20, 5); x.fill();
        x.strokeStyle = rgba(BELLY.dark, 0.5); x.lineWidth = 1; [HY + 19, HY + 24, HY + 29].forEach(function (y) { x.beginPath(); x.moveTo(-4.5, y); x.lineTo(4.5, y); x.stroke(); });
        // head pattern
        [[-9, HY - 11, 2.4], [0, HY - 13.5, 2.8], [9, HY - 11, 2.4]].forEach(function (s) { oval(x, s[0], s[1], s[2], s[2] * 0.7, 0, rgba(AC.snake.dark, 0.45)); });
        eye(x, -8, HY - 2, 4.2, false); eye(x, 8, HY - 2, 4.2, false);
        cheek(x, -14, HY + 6, 3.4); cheek(x, 14, HY + 6, 3.4);
        dot(x, -2.5, HY + 4, 0.8, AC.snake.dark); dot(x, 2.5, HY + 4, 0.8, AC.snake.dark);
        // forked tongue (always a little; long when singing)
        var tl = 4 + 5 * op;
        x.strokeStyle = '#E2708A'; x.lineWidth = 1.8; x.lineCap = 'round';
        x.beginPath(); x.moveTo(0, HY + 9); x.lineTo(0, HY + 9 + tl); x.moveTo(0, HY + 9 + tl); x.lineTo(-2.2, HY + 11.5 + tl); x.moveTo(0, HY + 9 + tl); x.lineTo(2.2, HY + 11.5 + tl); x.stroke();
        if (op > 0.05) oval(x, 0, HY + 8.5, 5 + 2 * op, 1.4 + 2.4 * op, 0, MOUTH);
        else curve(x, -7, HY + 8, 0, HY + 11.5, 7, HY + 8, AC.snake.dark, 1.8);
      },
      paws: 'coil'
    }
  };
  function animalOf(th) { return AN[th && th.animal] ? th.animal : 'duck'; }
  /** wings / paws / the snake's coil resting on the front rim (drawn over the shell) */
  function rimParts(ctx, name) {
    var c = AC[name], y = CR + 1, i;
    var part = function (key, build, col, o) {
      var p = P(key, build);
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = LW + 2 * BORDER; strokeP(ctx, p);
      cel(ctx, key, build, col, o || { s: 1.6, lw: 2.6, hl: false });
    };
    if (name === 'duck' || name === 'chick' || name === 'owl') {
      for (var sd = -1; sd <= 1; sd += 2) {
        var cx = sd * 25, k = 'paw.' + name + '.' + sd;
        (function (sd, cx, k) {
          var big = name === 'owl' ? 1.12 : name === 'chick' ? 0.9 : 1;
          // a little wing resting on the rim: round shoulder, three feather scallops at the tip
          var wing = function (t) {
            var a = sd * big, x0 = cx - sd * 9 * big;
            t.moveTo(x0, y - 2);
            t.quadraticCurveTo(cx - a * 2, y - 10 * big, cx + a * 8, y - 6 * big);
            t.quadraticCurveTo(cx + a * 12, y - 3 * big, cx + a * 9, y + 1);
            t.quadraticCurveTo(cx + a * 8, y + 4 * big, cx + a * 4.5, y + 2.4);
            t.quadraticCurveTo(cx + a * 3, y + 5.6 * big, cx - a * 0.5, y + 3);
            t.quadraticCurveTo(cx - a * 2.5, y + 6 * big, cx - a * 5.5, y + 3);
            t.quadraticCurveTo(x0 - sd, y + 1, x0, y - 2); t.closePath();
          };
          part(k, wing, c, { s: 1.6, lw: 2.4, hl: [cx - sd * 2, y - 5, 4 * big, 1.6, sd * 0.3] });
          curve(ctx, cx - sd * 2, y - 1, cx + sd * 3, y - 2.5, cx + sd * 7, y - 1, rgba(c.dark, 0.45), 1.1);
        })(sd, cx, k);
      }
    } else if (name === 'frog') {
      for (var s2 = -1; s2 <= 1; s2 += 2) {
        (function (sd) {
          var cx = sd * 24;
          part('paw.frog.' + sd, function (t) { ell(t, cx, y - 0.5, 7.5, 4.5, 0); circ(t, cx - 5, y + 2.5, 2.6); circ(t, cx, y + 3.6, 2.6); circ(t, cx + 5, y + 2.5, 2.6); }, c, { s: 1.2, lw: 2.2, hl: false });
        })(s2);
      }
    } else if (name === 'dino') {
      for (var s3 = -1; s3 <= 1; s3 += 2) {
        (function (sd) {
          var cx = sd * 23;
          part('paw.dino.' + sd, function (t) { ell(t, cx, y - 1, 7.5, 5, 0); }, c);
          for (i = -1; i <= 1; i++) { oval(ctx, cx + i * 3.6, y + 3.2, 1.5, 2, 0, '#FFF6E6'); ctx.strokeStyle = c.dark; ctx.lineWidth = 0.8; ctx.beginPath(); ell(ctx, cx + i * 3.6, y + 3.2, 1.5, 2, 0); ctx.stroke(); }
        })(s3);
      }
    } else if (name === 'snake') {
      // a coil of body draped over the rim on the left, the tail tip curling over on the right
      var coil = function (t) { t.moveTo(-31, y - 3); t.quadraticCurveTo(-20, y - 10, -8, y - 4); t.quadraticCurveTo(-3, y - 1, -6, y + 4);
        t.quadraticCurveTo(-18, y + 2, -30, y + 6); t.quadraticCurveTo(-35, y + 2, -31, y - 3); t.closePath(); };
      part('paw.snake.coil', coil, c, { s: 1.6, lw: 2.4, hl: false });
      curve(ctx, -28, y + 3.6, -18, y - 0.5, -8, y + 2, rgba(BELLY.base, 0.95), 2.6);
      var tail = function (t) { t.moveTo(9, y + 3); t.quadraticCurveTo(20, y - 10, 31, y - 5); t.quadraticCurveTo(36, y - 1, 32, y + 2);
        t.quadraticCurveTo(30, y - 3, 26, y - 3); t.quadraticCurveTo(18, y - 3, 13, y + 5); t.closePath(); };
      part('paw.snake.tail', tail, c, { s: 1.2, lw: 2.2, hl: false });
      [[-22, y - 4.5], [-13, y - 3.6], [22, y - 6]].forEach(function (s) { oval(ctx, s[0], s[1], 2, 1.4, 0.3, rgba(c.dark, 0.45)); });
    }
  }
  function songLines(ctx, op) {
    if (!(op > 0.05)) return;
    ctx.save(); ctx.lineCap = 'round';
    for (var k = 0; k < 2; k++) {
      var r = 8 + k * 6, a = 0.95 - k * 0.25;
      ctx.strokeStyle = 'rgba(255,255,255,' + (a * op).toFixed(3) + ')'; ctx.lineWidth = 4.6;
      ctx.beginPath(); ctx.arc(24, HY - 6, r, -0.75, 0.35); ctx.stroke();
      ctx.strokeStyle = rgba('#8A6AB0', a * op); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(24, HY - 6, r, -0.75, 0.35); ctx.stroke();
    }
    // a tiny note
    dot(ctx, 40, HY - 18, 2.6, rgba('#8A6AB0', op)); line(ctx, [42.2, HY - 18, 42.2, HY - 28, 46, HY - 26], rgba('#8A6AB0', op), 1.6);
    ctx.restore();
  }
  function drawHead(ctx, name, open, bare) {
    var a = AN[name], c = AC[name];
    var sil = P('an.' + name + '.sil', a.sil);
    if (bare) { ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = LW + 2 * BORDER; strokeP(ctx, sil); if (a.back) a.back(ctx); }
    cel(ctx, 'an.' + name + '.sil', a.sil, c, { s: 3.2, lw: 2.8, hl: false,
      inner: function (x) { var b = bbox('an.' + name + '.sil', a.sil); oval(x, b.x + b.w * 0.3, b.y + b.h * 0.22, b.w * 0.13, b.h * 0.07, -0.6, rgba(mix(c.light, '#FFFFFF', 0.4), 0.85)); } });
    a.face(ctx, clamp01(open));
  }
  function capDraw(ctx, name, col) {
    var a = AN[name], cp = a.cap;
    ctx.save(); ctx.translate(cp[0], cp[1]); ctx.rotate(cp[2]); ctx.scale(0.4, 0.4); ctx.translate(0, -CR + 5);
    var up = function (t) { upperShell(t, CR, 9, 5, 1); };
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = (LW + 2 * BORDER) * 2; strokeP(ctx, P('an.cap', up));
    cel(ctx, 'an.cap', up, col, { s: 5, lw: LW * 1.8, hl: [-14, -72, 8, 12, 0.4] });
    oval(ctx, 16, -60, 4, 3, 0.3, SHELL.speck); oval(ctx, -10, -86, 3, 2.2, 0, SHELL.speck);
    ctx.restore();
  }
  var ANIMAL = {
    col: function () { return CREAM; },
    draw: function (ctx, th, o) {
      var name = animalOf(th), a = AN[name], op = clamp01(o.sing);
      var back = function (t) { lowerShell(t, CR - 7, 9, 4, 1); };
      var front = function (t) { lowerShell(t, CR, 9, 4.6, 0); };
      var sil = P('an.' + name + '.sil', a.sil), pf = P('an.front', front), pb = P('an.back', back);
      // white sticker border around everything
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = LW + 2 * BORDER;
      strokeP(ctx, pb); strokeP(ctx, sil);
      // the back half (inside of the shell)
      cel(ctx, 'an.back', back, { base: SHELL.inside, dark: SHELL.dark, light: SHELL.base, shade: mix(SHELL.inside, SHELL.dark, 0.25) }, { s: 3, hl: false, lw: LW });
      if (a.back) a.back(ctx);
      drawHead(ctx, name, op, false);
      // the front half of the cracked shell
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = LW + 2 * BORDER; strokeP(ctx, pf);
      cel(ctx, 'an.front', front, CREAM, { s: 4.4, lw: LW, hl: [-20, -32, 6, 4, -0.5],
        inner: function (x) {
          specks(SPECK_EDGE.slice(0, 2), SHELL.speck)(x); oval(x, 10, -26, 2.6, 2, 0.4, SHELL.speck);
          if (FLASH > 0.01) { x.fillStyle = 'rgba(255,255,255,' + (0.35 * FLASH).toFixed(3) + ')'; x.fillRect(-EW - 2, CR - 8, 2 * EW + 4, -CR + 10); }
        } });
      rimParts(ctx, name);
      capDraw(ctx, name, CREAM);
      songLines(ctx, op);
    },
    headBox: function (name) { return bbox('an.' + name + '.sil', AN[name].sil); }
  };
  function animalSils(name) {   // silhouettes for the rims (glow / night / strike flash)
    var a = AN[name];
    return [P('an.back', function (t) { lowerShell(t, CR - 7, 9, 4, 1); }), P('an.' + name + '.sil', a.sil)];
  }

  var K = { egg: EGG, shape: SHAPED, big: BIG, dots: DOTS, animal: ANIMAL, glyph: GLYPH };
  function kindOf(th) { return K[th && th.kind] || EGG; }
  function boxU(th) {           // design-unit box {w, h, cy}
    if (kindOf(th) === ANIMAL) return { w: 2 * EW + 2, h: EH, cy: -50 };
    return { w: 2 * EW, h: EH, cy: -EH / 2 };
  }

  // ================================================================= PUBLIC: eggs
  function bodyBox(thing, size) {
    size = num(size, 112);
    var b = boxU(thing || {}), s = size / 100;
    return { w: Math.min(size, b.w * s), h: Math.min(size, b.h * s), cy: b.cy * s };
  }
  function thingKey(t) {
    if (!t) return '?';
    return [t.kind, t.color || '', t.shape || '', t.n != null ? t.n : '', t.animal || '', t.text != null ? t.text : ''].join(':');
  }

  function drawEgg(ctx, thing, size, opt) {
    if (!ctx || !thing) return;
    size = num(size, 112); if (!(size > 0)) return;
    var o = opt || {}, Kd = kindOf(thing), pop = o.pop == null ? 1 : Math.max(0, Math.min(1.5, num(o.pop, 1)));
    if (pop <= 0.001) return;
    var b = boxU(thing), c = Kd.col(thing), s = size / 100 * pop;
    var glow = clamp01(o.glow), dull = !!(+o.dull), ring = dull ? 0 : clamp01(o.ring), dim = clamp01(o.dim), night = clamp01(o.night);
    var skin = clamp01(o.skin), ph = num(o.skinPh, 0);
    var sq = Math.max(0.5, Math.min(1.5, num(o.sq, 1))), sx = 1 / Math.sqrt(sq);
    var cy = b.cy, isA = Kd === ANIMAL, sils = isA ? animalSils(animalOf(thing)) : [P('egg.shell', eggPath)];
    ctx.save();
    ctx.scale(s, s);
    if (dim > 0) ctx.globalAlpha *= 1 - 0.55 * dim;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (glow > 0.01) glowDisc(ctx, 0, cy, 12, 66 + 16 * glow, '#FFE48C', 0.8 * glow);
    ctx.scale(sx, sq);
    // rims behind the body: gold glow, cool moonlight (never darkens the body), white strike flash
    var rim = function (col, w, dx, dy) {
      ctx.save(); ctx.translate(dx || 0, dy || 0); ctx.strokeStyle = col;
      ctx.lineWidth = w + (isA ? 2 * BORDER : 0);
      for (var i = 0; i < sils.length; i++) strokeP(ctx, sils[i]);
      ctx.restore();
    };
    if (glow > 0.01) rim('rgba(255,236,160,' + (0.9 * glow).toFixed(3) + ')', 8 + 6 * glow);
    var halo = night > 0.3 ? Math.min(1, (night - 0.3) / 0.4) : 0;
    if (!isA) rim('rgba(255,255,255,' + (0.5 + 0.35 * halo).toFixed(3) + ')', LW + 2.4 + 3.2 * halo);
    if (night > 0.01) rim('rgba(214,226,255,' + (0.3 * night).toFixed(3) + ')', LW + 9 * halo + 2, -0.8, -1);
    if (ring > 0.01) rim('rgba(255,255,255,' + (0.9 * ring).toFixed(3) + ')', 5 + 8 * ring);
    FLASH = ring;
    try { Kd.draw(ctx, thing, o); } finally { FLASH = 0; }
    // the singing shimmer: a bright band sweeping round the shell (+ while struck)
    var sh = Math.max(skin, ring * 0.6);
    if (sh > 0.01) {
      var clip = isA ? P('an.front', function (t) { lowerShell(t, CR, 9, 4.6, 0); }) : sils[0];
      var u = Math.sin(ph), bx = u * (EW - 8), bw = 8 + 9 * Math.cos(ph) * Math.cos(ph);
      ctx.save(); clipP(ctx, clip);
      ctx.translate(bx, -50); ctx.rotate(-0.32);
      var gr = ctx.createLinearGradient(-bw, 0, bw, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,' + (0.88 * sh).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gr; ctx.fillRect(-bw, -70, 2 * bw, 140);
      ctx.fillStyle = 'rgba(255,250,220,' + (0.55 * sh).toFixed(3) + ')'; ctx.fillRect(bw * 0.9, -70, 1.6, 140);
      ctx.restore();
      // ripple lines: two faint rings round the shell
      ctx.save(); clipP(ctx, clip);
      for (var q = 0; q < 2; q++) {
        var yy = -82 + ((ph * 6 + q * 40) % 80 + 80) % 80;
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.4 * sh * (1 - q * 0.3)).toFixed(3) + ')'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(0, yy, Math.max(1, hw(yy)), 4, 0, 0.1, Math.PI - 0.1); ctx.stroke();
      }
      ctx.restore();
    }
    // moonlight inside the body: a cool rim along the upper-left edge
    if (night > 0.01) {
      var mp = isA ? P('an.front', function (t) { lowerShell(t, CR, 9, 4.6, 0); }) : sils[0];
      ctx.save(); clipP(ctx, mp);
      ctx.translate(2.6, 2.2); ctx.strokeStyle = 'rgba(214,226,255,' + (0.55 * night).toFixed(3) + ')'; ctx.lineWidth = 3; strokeP(ctx, mp);
      ctx.restore();
    }
    // sound rings rising from the top: )) (( arcs on both sides, expanding and fading
    if (ring > 0.01) {
      var ac = c === CREAM ? GOLD : c, top = isA ? -82 : -86;
      for (var k = 0; k < 3; k++) {
        var f = (1 - ring) * 0.9 + k * 0.24, a = ring * (1 - k * 0.26);
        if (a < 0.03) continue;
        var rx = 30 + 18 * f + k * 5, ry = rx * 0.62, yy2 = top - f * 10, span = 0.55 - k * 0.07;
        for (var side = 0; side < 2; side++) {
          var a0 = side ? -span - 0.5 : Math.PI + 0.5 - span, a1 = side ? span - 0.5 : Math.PI + 0.5 + span;
          ctx.strokeStyle = rgba(ac.base, a * 0.85); ctx.lineWidth = 5.4;
          ctx.beginPath(); ctx.ellipse(0, yy2, rx, ry, 0, a0, a1); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,' + (a * 0.95).toFixed(3) + ')'; ctx.lineWidth = 2.2;
          ctx.beginPath(); ctx.ellipse(0, yy2, rx, ry, 0, a0, a1); ctx.stroke();
        }
      }
      sparkle(ctx, 26, -92 - 8 * (1 - ring), 4 + 5 * ring, 'rgba(255,255,255,' + (0.95 * ring).toFixed(3) + ')');
      sparkle(ctx, -28, -80 - 10 * (1 - ring), 2.5 + 3.5 * ring, 'rgba(255,255,255,' + (0.85 * ring).toFixed(3) + ')');
    }
    ctx.restore();
  }

  // ================================================================= ISLAND + STRAW RING (cushion)
  // designed for w = 100 units, origin = the ring's TOP centre (where the egg's bottom sits); ring ≈ −17..4, moss/rock 0..46,
  // roots to ≈ 60.
  var RING = { cy: -6.5, rx: 40, ry: 10.5, icy: -8.5, irx: 24.5, iry: 4.6 };
  function dipU(dent) { dent = clamp01(dent); return 33 - (33 - 1.84 * dent) * (1 - 0.12 * dent); }
  function cushionDip(w, dent) { return num(w, 140) / 100 * dipU(dent); }
  function cushionXf(ctx, x, y, w, o) {
    var W = num(w, 140); if (!(W > 0)) return false;
    var pop = o.pop == null ? 1 : Math.max(0, Math.min(1.5, num(o.pop, 1))), al = o.alpha == null ? 1 : clamp01(o.alpha);
    if (pop <= 0.001 || al <= 0.001) return false;
    var dent = clamp01(o.dent), s = W / 100;
    ctx.save(); ctx.translate(num(x, 0), num(y, 0)); ctx.scale(s, s); ctx.globalAlpha *= al;
    ctx.translate(0, 13); ctx.scale(pop, pop); ctx.translate(0, -13);                           // pop about the island's middle
    ctx.translate(0, 26); ctx.scale(1 + 0.08 * dent, 1 - 0.12 * dent); ctx.translate(0, -26);   // squish (bottom fixed)
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    return true;
  }
  function ringBand(t) { ell(t, 0, RING.cy, RING.rx, RING.ry, 0); }
  function ringHole(t) { ell(t, 0, RING.icy, RING.irx, RING.iry, 0); }
  /** straw strands round the ring, only those in [a0, a1] (angles on the ring ellipse; front = 0..π) */
  function straws(ctx, a0, a1, night, seed) {
    var N = 30, i;
    for (i = 0; i < N; i++) {
      var a = (i + 0.5) / N * TAU;
      if (!(a >= a0 && a <= a1)) continue;
      var m = 0.5 + 0.5 * Math.sin(i * 2.3 + seed), rx = (RING.rx + RING.irx) / 2 + (m - 0.5) * 9, ry = (RING.ry + RING.iry) / 2 + (m - 0.5) * 3;
      var cy = (RING.cy + RING.icy) / 2;
      var x0 = Math.cos(a - 0.17) * rx, y0 = cy + Math.sin(a - 0.17) * ry, x1 = Math.cos(a + 0.2) * (rx + 2), y1 = cy + Math.sin(a + 0.2) * (ry + 1);
      var col = i % 3 === 0 ? STRAW.dark : i % 3 === 1 ? STRAW.light : mix(STRAW.base, STRAW.dark, 0.3);
      curve(ctx, x0, y0, (x0 + x1) / 2, (y0 + y1) / 2 - 1.6, x1, y1, night > 0.01 ? mix(col, '#7C84B8', 0.25 * night) : col, i % 3 === 1 ? 1.4 : 1.8);
    }
  }
  function drawRingHalf(ctx, front, night, t) {
    var cy = RING.cy;
    ctx.save();
    ctx.beginPath();
    if (front) ctx.rect(-60, cy, 120, 40); else ctx.rect(-60, -40, 120, 40 + cy);
    ctx.clip();
    var base = mix(STRAW.base, '#9AA0C8', 0.22 * night), shade = mix(STRAW.dark, '#5E6390', 0.2 * night);
    // band = outer minus hole (even-odd)
    var band = function (q) { ringBand(q); ringHole(q); };
    if (!front) {   // the inside of the nest behind the egg
      ctx.fillStyle = mix(STRAW.deep, '#3A3D66', 0.3 * night); ctx.beginPath(); ringHole(ctx); ctx.fill();
      ctx.fillStyle = rgba(STRAW.dark, 0.6); ctx.beginPath(); ell(ctx, 0, RING.icy + 1.6, RING.irx - 3, RING.iry - 1.2, 0); ctx.fill();
    }
    ctx.strokeStyle = STRAW.deep; ctx.lineWidth = 3.2; ctx.beginPath(); band(ctx); ctx.stroke();
    ctx.fillStyle = shade; ctx.beginPath(); band(ctx); ctx.fill('evenodd');
    ctx.save(); ctx.beginPath(); band(ctx); ctx.clip('evenodd');
    ctx.fillStyle = base; ctx.beginPath(); ell(ctx, -1, RING.cy - 2.4, RING.rx - 1.5, RING.ry - 1.6, 0); ctx.fill();
    ctx.fillStyle = rgba(STRAW.light, 0.85); ctx.beginPath(); ell(ctx, -6, RING.cy - 4.6, RING.rx - 10, RING.ry - 5.4, 0); ctx.fill();
    straws(ctx, front ? 0 : Math.PI, front ? Math.PI : TAU, night, 0);
    straws(ctx, front ? 0 : Math.PI, front ? Math.PI : TAU, night, 2.1);
    ctx.restore();
    ctx.restore();
    // poking straws (front: a few sticking out over the rim, sway a little)
    var sw = Math.sin(num(t, 0) * 1.6) * 0.8;
    if (front) {
      [[-34, -3, -44, -10], [33, -2, 43, -9], [-12, 3, -16, 9], [20, 2.5, 26, 8], [-26, 1, -33, 5]].forEach(function (p, i) {
        curve(ctx, p[0], p[1], (p[0] + p[2]) / 2, (p[1] + p[3]) / 2 - 1, p[2] + sw * (i % 2 ? 1 : -1), p[3], STRAW.deep, 2.6);
        curve(ctx, p[0], p[1], (p[0] + p[2]) / 2, (p[1] + p[3]) / 2 - 1, p[2] + sw * (i % 2 ? 1 : -1), p[3], i % 2 ? STRAW.light : STRAW.base, 1.3);
      });
    } else {
      [[-18, -15, -22, -22], [12, -16, 15, -23]].forEach(function (p) {
        curve(ctx, p[0], p[1], p[0] - 1, (p[1] + p[3]) / 2, p[2] + sw, p[3], STRAW.deep, 2.4);
        curve(ctx, p[0], p[1], p[0] - 1, (p[1] + p[3]) / 2, p[2] + sw, p[3], STRAW.light, 1.1);
      });
    }
    if (night > 0.01) {
      ctx.save(); ctx.beginPath(); if (front) ctx.rect(-60, RING.cy, 120, 40); else ctx.rect(-60, -40, 120, 40 + RING.cy); ctx.clip();
      ctx.strokeStyle = 'rgba(214,226,255,' + (0.45 * night).toFixed(3) + ')'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.ellipse(0, RING.cy, RING.rx - 1.5, RING.ry - 1, 0, Math.PI * 1.02, Math.PI * 1.6); ctx.stroke();
      ctx.restore();
    }
  }
  function rockPath(t) {
    t.moveTo(-47, 4);
    t.quadraticCurveTo(-49, 14, -40, 22); t.quadraticCurveTo(-34, 32, -24, 36); t.quadraticCurveTo(-16, 46, -4, 47);
    t.quadraticCurveTo(8, 49, 15, 40); t.quadraticCurveTo(28, 36, 36, 25); t.quadraticCurveTo(48, 15, 47, 4);
    t.quadraticCurveTo(24, -4, 0, -4); t.quadraticCurveTo(-24, -4, -47, 4); t.closePath();
  }
  function mossPath(t) {
    t.moveTo(-49, 4);
    t.quadraticCurveTo(-26, -6, 0, -6); t.quadraticCurveTo(26, -6, 49, 4);
    t.quadraticCurveTo(50, 10, 44, 11); t.quadraticCurveTo(41, 19, 36, 13); t.quadraticCurveTo(26, 16, 16, 14);
    t.quadraticCurveTo(12, 22, 7, 14); t.quadraticCurveTo(-6, 16, -18, 14); t.quadraticCurveTo(-24, 21, -29, 13);
    t.quadraticCurveTo(-40, 14, -45, 11); t.quadraticCurveTo(-51, 9, -49, 4); t.closePath();
  }
  function drawIsland(ctx, night, t) {
    var wob = num(t, 0);
    // dangling roots (behind the rock), gently swaying
    [[-16, 42, -20, 58, 0.9], [-2, 46, 1, 62, 0], [13, 41, 17, 55, 1.7], [26, 34, 31, 47, 2.6]].forEach(function (r, i) {
      var sw = Math.sin(wob * 1.3 + r[4]) * 1.6;
      curve(ctx, r[0], r[1], r[0] + (i % 2 ? 4 : -4), (r[1] + r[3]) / 2, r[2] + sw, r[3], ROOT.dark, 3.2);
      curve(ctx, r[0], r[1], r[0] + (i % 2 ? 4 : -4), (r[1] + r[3]) / 2, r[2] + sw, r[3], ROOT.base, 1.6);
      if (i === 1) {   // a little leaf at the end of the longest root (a hanging vine)
        ctx.save(); ctx.translate(r[2] + sw, r[3]); ctx.rotate(0.5 + sw * 0.08);
        cel(ctx, 'isl.leaf', function (q) { q.moveTo(0, 0); q.quadraticCurveTo(5, 2, 4, 8); q.quadraticCurveTo(-2, 6, 0, 0); q.closePath(); }, VINE, { s: 0.8, lw: 1.4, hl: false });
        ctx.restore();
      }
    });
    // shadow tint at night
    var rc = night > 0.01 ? { base: mix(ROCK.base, '#6D7399', 0.3 * night), dark: ROCK.dark, light: ROCK.light, shade: mix(ROCK.dark, '#4A4F75', 0.25 * night) } : { base: ROCK.base, dark: ROCK.dark, light: ROCK.light, shade: mix(ROCK.base, ROCK.dark, 0.55) };
    cel(ctx, 'isl.rock', rockPath, rc, { s: 6, lw: 3.4, line: mix(ROCK.dark, '#4E4440', 0.35), hl: false,
      inner: function (x) {
        // facets + pebbly texture
        x.strokeStyle = rgba(ROCK.dark, 0.55); x.lineWidth = 1.5;
        x.beginPath(); x.moveTo(-30, 14); x.quadraticCurveTo(-24, 24, -14, 28); x.moveTo(8, 18); x.quadraticCurveTo(12, 28, 6, 38); x.moveTo(26, 14); x.quadraticCurveTo(30, 20, 28, 26); x.stroke();
        oval(x, -36, 12, 6, 3, -0.4, rgba(ROCK.light, 0.75)); oval(x, -10, 22, 5, 2.4, -0.2, rgba(ROCK.light, 0.5));
        dot(x, 18, 30, 1.6, rgba(ROCK.dark, 0.5)); dot(x, -20, 34, 1.3, rgba(ROCK.dark, 0.5)); dot(x, 30, 20, 1.2, rgba(ROCK.light, 0.7));
      } });
    var mc = { base: mix(MOSS.base, '#6F8A9A', 0.28 * night), dark: MOSS.dark, light: MOSS.light, shade: mix(MOSS.base, MOSS.dark, 0.5) };
    cel(ctx, 'isl.moss', mossPath, mc, { s: 2.6, lw: 2.8, line: MOSS.dark, hl: false,
      inner: function (x) {
        [[-38, 2, 3.4], [-20, -2, 3], [24, -1.5, 3.2], [40, 3, 2.6], [-30, 8, 2], [32, 8, 2]].forEach(function (d) { dot(x, d[0], d[1], d[2], rgba(MOSS.light, 0.8)); });
        dot(x, -6, 8, 1.6, rgba(MOSS.dark, 0.45)); dot(x, 12, 9, 1.4, rgba(MOSS.dark, 0.45));
      } });
    // a tiny fern on the left of the moss
    ctx.save(); ctx.translate(-41, 2); ctx.rotate(-0.25 + Math.sin(wob * 1.1) * 0.05);
    for (var f = 0; f < 3; f++) {
      var a = -1.15 + f * 0.55, L = 13 - Math.abs(f - 1) * 3;
      var ex = Math.cos(a - Math.PI / 2 + 0.2) * L, ey = Math.sin(a - Math.PI / 2 + 0.2) * L;
      curve(ctx, 0, 0, ex * 0.4 - 1, ey * 0.6, ex, ey, VINE.dark, 2.6);
      curve(ctx, 0, 0, ex * 0.4 - 1, ey * 0.6, ex, ey, VINE.base, 1.3);
      for (var j = 1; j <= 3; j++) { var px = ex * j / 4, py = ey * j / 4; oval(ctx, px - 1.6, py, 2.2, 1, a - 0.8, VINE.base); oval(ctx, px + 1.6, py, 2.2, 1, a + 0.8, VINE.base); }
    }
    ctx.restore();
    // a small flower bud on the right
    dot(ctx, 42, 0, 2.4, '#FFF4E0'); dot(ctx, 42, 0, 1, '#E8C26A');
  }
  function drawCushion(ctx, x, y, w, opt) {
    if (!ctx) return;
    var o = opt || {};
    if (!cushionXf(ctx, x, y, w, o)) return;
    var night = clamp01(o.night), t = num(o.t, 0);
    oval(ctx, 0, 4, 36, 4, 0, 'rgba(60,50,40,0.12)');
    drawIsland(ctx, night, t);
    drawRingHalf(ctx, false, night, t);
    ctx.restore();
  }
  function drawCushionFront(ctx, x, y, w, opt) {
    if (!ctx) return;
    var o = opt || {};
    if (!cushionXf(ctx, x, y, w, o)) return;
    drawRingHalf(ctx, true, clamp01(o.night), num(o.t, 0));
    ctx.restore();
  }

  // ================================================================= GARLAND: leafy vine + seed-pod lanterns
  var LANTERN_R = 22;
  function lanternRadius() { return LANTERN_R; }
  function leaf(ctx, x, y, a, L, col) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    var p = function (q) { q.moveTo(0, 0); q.quadraticCurveTo(L * 0.5, -L * 0.42, L, 0); q.quadraticCurveTo(L * 0.5, L * 0.42, 0, 0); q.closePath(); };
    ctx.fillStyle = col.base; ctx.beginPath(); p(ctx); ctx.fill();
    ctx.fillStyle = col.light; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(L * 0.5, -L * 0.42, L, 0); ctx.quadraticCurveTo(L * 0.5, -L * 0.12, 0, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = col.dark; ctx.lineWidth = 1.6; ctx.beginPath(); p(ctx); ctx.stroke();
    ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(1, 0); ctx.lineTo(L * 0.82, 0); ctx.stroke();
    ctx.restore();
  }
  function fernTuft(ctx, x, y, dir, t, night) {
    ctx.save(); ctx.translate(x, y);
    var vc = night > 0.01 ? { base: mix(VINE.base, '#5E6C94', 0.3 * night), dark: VINE.dark, light: mix(VINE.light, '#8C98C4', 0.3 * night) } : VINE;
    for (var i = 0; i < 5; i++) {
      var a = -Math.PI / 2 + (i - 2) * 0.48 + Math.sin(t * 1.2 + i) * 0.04;
      leaf(ctx, 0, 4, a, 18 - Math.abs(i - 2) * 3, vc);
    }
    oval(ctx, 0, 6, 8, 4, 0, mix(MOSS.base, '#6F8A9A', 0.28 * night));
    ctx.strokeStyle = MOSS.dark; ctx.lineWidth = 1.6; ctx.beginPath(); ell(ctx, 0, 6, 8, 4, 0); ctx.stroke();
    ctx.restore();
  }
  /** the small picture on a pod (simplified for ~22 px: a shape alone, an animal head, a numeral…) */
  function podIcon(ctx, th, size) {
    if (!th) return;
    var k = th.kind;
    if (k === 'shape') { var c = pal(th.color) || FALLBACK.blue, s = size / 100; ctx.save(); ctx.scale(s, s); emblem(ctx, shapeOf(th), c, 0, 92, 92, 5); ctx.restore(); }
    else if (k === 'animal') drawIcon(ctx, { kind: 'sound', animal: th.animal }, size * 1.05);
    else if (k === 'number' || (k === 'glyph')) {
      var txt = k === 'number' ? String(Math.round(num(th.n, 1))) : glyphText(th), cc = pal(th.color);
      chunkyText(ctx, txt, 0, 0, size * 0.95, size * 0.8, cc ? (cc.base === '#FFD23F' ? '#C99A12' : cc.base) : GLYPH_INK, '#FFFFFF');
    } else drawIcon(ctx, th, size);
  }
  function podPath(t, R) {   // a plump seed pod hanging from (0, 0): pointed top, round belly
    var w = R * 0.98, top = R * 0.12, bot = R * 1.52;
    t.moveTo(0, top);
    t.bezierCurveTo(w * 0.55, top + R * 0.1, w, R * 0.5, w, R * 0.86);
    t.bezierCurveTo(w, R * 1.28, w * 0.5, bot, 0, bot);
    t.bezierCurveTo(-w * 0.5, bot, -w, R * 1.28, -w, R * 0.86);
    t.bezierCurveTo(-w, R * 0.5, -w * 0.55, top + R * 0.1, 0, top); t.closePath();
  }
  function drawPod(ctx, L, R, night, t) {
    var lit = clamp01(L.lit), flash = clamp01(L.flash), now = clamp01(L.now), c = L.color ? (pal(L.color) || GOLD) : GOLD;
    var tone = L.color ? c.light : '#FFE58A', cyP = R * 0.86;
    ctx.save(); ctx.translate(num(L.x, 0), num(L.y, 0));
    ctx.rotate(num(L.swing, 0));
    var pulse = now > 0.01 ? 1 + 0.12 * now * (0.6 + 0.4 * Math.sin(t * 5.5)) : 1;
    // glows (gold for "now", the colour's light tone once lit)
    if (now > 0.01) glowDisc(ctx, 0, cyP, R * 0.3, R * 2.3 * pulse, '#FFE07A', 0.55 * now);
    if (lit > 0.01 || flash > 0.01) glowDisc(ctx, 0, cyP, R * 0.3, R * (2.5 + 1.3 * flash), mix(tone, '#FFF3B0', 0.3), Math.min(1, 0.65 * lit + 0.4 * flash));
    // the stem from the vine
    curve(ctx, 0, -2, 2, R * 0.08, 0, R * 0.22, VINE.dark, 3.2); curve(ctx, 0, -2, 2, R * 0.08, 0, R * 0.22, VINE.base, 1.6);
    ctx.translate(0, cyP); ctx.scale(pulse, pulse); ctx.translate(0, -cyP);
    // lit: the pod opens into a blossom — petals behind
    if (lit > 0.01) {
      var pc = { base: mix('#FFF8E4', tone, 0.85), dark: lineOf(c), light: '#FFFFFF' };
      for (var i = 0; i < 6; i++) {
        var a = i * TAU / 6 + 0.26, pr = R * (0.5 + 0.55 * lit);
        ctx.save(); ctx.translate(0, cyP); ctx.rotate(a); ctx.globalAlpha *= Math.min(1, lit * 1.4);
        var petal = function (q) { q.moveTo(0, 0); q.bezierCurveTo(R * 0.42, -R * 0.2, R * 0.38, -pr - R * 0.25, 0, -pr - R * 0.35); q.bezierCurveTo(-R * 0.38, -pr - R * 0.25, -R * 0.42, -R * 0.2, 0, 0); q.closePath(); };
        ctx.fillStyle = pc.base; ctx.beginPath(); petal(ctx); ctx.fill();
        ctx.strokeStyle = mix(pc.dark, '#FFFFFF', 0.15); ctx.lineWidth = 1.8; ctx.beginPath(); petal(ctx); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ell(ctx, 0, -pr * 0.6, R * 0.1, pr * 0.28, 0); ctx.fill();
        ctx.restore();
      }
    }
    // the pod (closed cream → its glowing heart when lit)
    var pk = 'pod.' + R, pb = function (q) { podPath(q, R); };
    var body = lit > 0.01 ? { base: mix(POD.base, mix('#FFFFFF', tone, 0.55), lit), dark: mix(POD.dark, lineOf(c), lit * 0.7), light: '#FFFFFF', shade: mix(POD.shade, tone, lit) } : POD;
    if (night > 0.01 && lit < 0.5) body = { base: mix(body.base, '#C9D0EE', 0.3 * night), dark: body.dark, light: body.light, shade: mix(body.shade || POD.shade, '#9AA3CC', 0.3 * night) };
    cel(ctx, pk, pb, body, { s: R * 0.12, lw: 2.4, line: body.dark, hl: [-R * 0.34, R * 0.52, R * 0.12, R * 0.22, 0.35],
      inner: function (x) {
        if (lit < 0.6) {   // seams of the closed pod
          x.strokeStyle = rgba(POD.dark, 0.32 * (1 - lit)); x.lineWidth = 1.2;
          x.beginPath(); x.moveTo(-R * 0.45, R * 0.4); x.quadraticCurveTo(-R * 0.62, R * 0.95, -R * 0.36, R * 1.42);
          x.moveTo(R * 0.45, R * 0.4); x.quadraticCurveTo(R * 0.62, R * 0.95, R * 0.36, R * 1.42); x.stroke();
        }
      } });
    // the little sepal cap (three leaves) where the pod meets the stem
    [-0.75, 0, 0.75].forEach(function (a) { leaf(ctx, 0, R * 0.18, Math.PI / 2 + a * 1.4 - Math.PI, R * 0.42, VINE); });
    // the picture / "?"
    if (L.hidden) {
      chunkyText(ctx, '?', 0, cyP + R * 0.12, R * 1.0, R * 0.9, lit > 0.5 ? lineOf(c) : '#8E7A55', '#FFFFFF');
    } else if (L.icon) {
      ctx.save(); ctx.globalAlpha *= lit > 0.5 ? 1 : 0.85; ctx.translate(0, cyP + R * 0.1);
      try { podIcon(ctx, L.icon, R * 2 * 0.98 * 0.62 * 1.12); } catch (e) { /* skip */ }
      ctx.restore();
    }
    if (night > 0.01 && lit < 0.5) { ctx.strokeStyle = 'rgba(220,230,255,' + (0.45 * night).toFixed(3) + ')'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(-1, cyP, R * 0.7, R * 0.58, 0, Math.PI * 0.95, Math.PI * 1.55); ctx.stroke(); }
    if (flash > 0.01) {
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.9 * flash).toFixed(3) + ')'; ctx.lineWidth = 2.6; ctx.beginPath(); circ(ctx, 0, cyP, R * (1.05 + 0.4 * (1 - flash))); ctx.stroke();
      sparkle(ctx, R * 0.95, cyP - R * 0.75, 4 + 6 * flash, 'rgba(255,255,255,' + flash.toFixed(3) + ')');
      sparkle(ctx, -R * 1.0, cyP + R * 0.45, 2 + 4 * flash, 'rgba(255,255,255,' + (0.8 * flash).toFixed(3) + ')');
    }
    if (now > 0.01) sparkle(ctx, R * 0.8, R * 0.25, 2 + 3 * now * (0.5 + 0.5 * Math.sin(t * 7)), 'rgba(255,240,170,' + (0.95 * now).toFixed(3) + ')');
    ctx.restore();
  }
  function drawGarland(ctx, garland, lanterns, opt) {
    if (!ctx || !garland) return;
    var o = opt || {}, g = garland, sag = num(g.sag, 22), x0 = num(g.x0, 0), x1 = num(g.x1, 100), gy = num(g.y, 0);
    var R = num(o.r, LANTERN_R), night = clamp01(o.night), t = num(o.t, 0), mx = (x0 + x1) / 2;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var vc = night > 0.01 ? { base: mix(VINE.base, '#5E6C94', 0.3 * night), dark: VINE.dark, light: mix(VINE.light, '#8C98C4', 0.3 * night) } : VINE;
    var str = function (x) { x.moveTo(x0, gy); x.quadraticCurveTo(mx, gy + 2 * sag, x1, gy); };
    ctx.strokeStyle = vc.dark; ctx.lineWidth = 5.2; ctx.beginPath(); str(ctx); ctx.stroke();
    ctx.strokeStyle = vc.base; ctx.lineWidth = 3; ctx.beginPath(); str(ctx); ctx.stroke();
    // a thinner twisting tendril along it
    ctx.strokeStyle = vc.light; ctx.lineWidth = 1.3; ctx.beginPath();
    var L = Math.max(1, x1 - x0), n = Math.max(8, Math.round(L / 14));
    for (var i = 0; i <= n; i++) {
      var u = i / n, x = x0 + L * u, y = gy + 4 * sag * u * (1 - u) + Math.sin(u * L / 18) * 2.2;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // small leaves along the vine, alternating sides, swaying a little
    var nl = Math.max(4, Math.round(L / 46));
    for (var j = 0; j < nl; j++) {
      var v = (j + 0.5) / nl, lx = x0 + L * v, ly = gy + 4 * sag * v * (1 - v), slope = Math.atan2(4 * sag * (1 - 2 * v), L);
      var up = j % 2 === 0, a = slope + (up ? -0.9 : 0.75) + Math.sin(t * 1.5 + j * 1.3) * 0.08;
      leaf(ctx, lx, ly, a, 13 + (j % 3) * 2, vc);
    }
    // two tiny fern tufts hold the ends
    fernTuft(ctx, x0 - 4, gy - 2, -1, t, night);
    fernTuft(ctx, x1 + 4, gy - 2, 1, t + 2, night);
    var Ls = lanterns || [];
    for (var k = 0; k < Ls.length; k++) if (Ls[k]) drawPod(ctx, Ls[k], R, night, t + k * 0.7);
    ctx.restore();
  }

  // ================================================================= the little VOLCANO (internal name: cymbal)
  var CYM_H = 140;
  function volcanoPath(t) {   // foot at y 0, width ≈ 116, crater lip at y ≈ −78
    t.moveTo(-58, 0);
    t.bezierCurveTo(-52, -18, -36, -40, -24, -68);
    t.quadraticCurveTo(-21, -78, -12, -78);
    t.quadraticCurveTo(0, -74, 12, -78);
    t.quadraticCurveTo(21, -78, 24, -68);
    t.bezierCurveTo(36, -40, 52, -18, 58, 0);
    t.quadraticCurveTo(0, 6, -58, 0); t.closePath();
  }
  function smokePuff(ctx, x, y, r, a, night) {
    var col = night > 0.01 ? mix('#F2EEE8', '#C9CCE6', 0.5 * night) : '#F4F0EA';
    ctx.fillStyle = rgba('#B8AFA4', a * 0.8); ctx.beginPath(); circ(ctx, x + r * 0.12, y + r * 0.14, r); ctx.fill();
    ctx.fillStyle = rgba(col, a); ctx.beginPath(); circ(ctx, x, y, r); ctx.fill();
    ctx.fillStyle = rgba('#FFFFFF', a * 0.7); ctx.beginPath(); circ(ctx, x - r * 0.3, y - r * 0.3, r * 0.35); ctx.fill();
  }
  function drawCymbal(ctx, cym, opt) {
    if (!ctx || !cym) return;
    var o = opt || {}, s = cym.s != null ? num(cym.s, 1) : (cym.h ? num(cym.h, CYM_H) / CYM_H : 1);
    if (!(s > 0)) return;
    var tilt = num(o.tilt, 0), ring = clamp01(o.ring), night = clamp01(o.night), t = num(o.t, 0);
    var wob = Math.max(-0.4, Math.min(0.4, tilt)), squ = Math.abs(wob);
    ctx.save(); ctx.translate(num(cym.x, 0), num(cym.y, 0)); ctx.scale(s, s); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    oval(ctx, 0, 0, 56, 6, 0, 'rgba(60,45,35,0.18)');
    // puff wobble: squash/stretch about the foot + a little lean
    ctx.save(); ctx.rotate(wob * 0.25); ctx.scale(1 + 0.45 * squ, 1 - 0.4 * squ + 0.15 * ring * Math.sin(ring * Math.PI));
    var vc = night > 0.01 ? { base: mix(VOLCANO.base, '#6D6F99', 0.25 * night), dark: VOLCANO.dark, light: VOLCANO.light, shade: mix(VOLCANO.shade, '#4E5078', 0.25 * night) } : VOLCANO;
    var glowA = 0.55 + 0.25 * Math.sin(t * 1.7) + 0.35 * ring + 0.2 * night;
    glowDisc(ctx, 0, -80, 6, 46, VOLCANO.glow, Math.min(0.8, 0.35 * glowA));
    cel(ctx, 'vol.cone', volcanoPath, vc, { s: 7, lw: 3.6, line: mix(VOLCANO.dark, '#3E2C22', 0.3), hl: false,
      inner: function (x) {
        // soft rock bands + highlight on the left flank
        x.strokeStyle = rgba(VOLCANO.dark, 0.35); x.lineWidth = 2;
        x.beginPath(); x.moveTo(-40, -26); x.quadraticCurveTo(-22, -20, -8, -27); x.moveTo(10, -46); x.quadraticCurveTo(22, -40, 32, -44); x.moveTo(-18, -54); x.quadraticCurveTo(-10, -50, -2, -55); x.stroke();
        oval(x, -30, -36, 5, 16, 0.5, rgba(VOLCANO.light, 0.7));
        // a lighter rounded lip round the crater + two short warm drips (muted)
        x.fillStyle = rgba(VOLCANO.light, 0.9); x.beginPath(); ell(x, 0, -76, 22, 6, 0); x.fill();
        [[-13, -73, 5, 7], [11, -73.5, 4.2, 5]].forEach(function (d) {
          var drip = function (q) { q.moveTo(d[0] - d[2], d[1]); q.quadraticCurveTo(d[0] - d[2], d[1] + d[3], d[0], d[1] + d[3] + d[2] * 0.8);
            q.quadraticCurveTo(d[0] + d[2], d[1] + d[3], d[0] + d[2], d[1]); q.closePath(); };
          x.fillStyle = VOLCANO.glow; x.beginPath(); drip(x); x.fill();
          dot(x, d[0] - d[2] * 0.3, d[1] + d[3] * 0.5, d[2] * 0.3, rgba(VOLCANO.hot, 0.9));
        });
        // small round stones near the foot
        [[-34, -8, 5], [22, -10, 4], [40, -6, 3.2]].forEach(function (p) { dot(x, p[0], p[1], p[2], rgba(VOLCANO.dark, 0.35)); dot(x, p[0] - 1, p[1] - 1, p[2] * 0.4, rgba(VOLCANO.light, 0.5)); });
      } });
    // crater: dark rim + glowing pool
    ctx.fillStyle = mix(VOLCANO.dark, '#3E2C22', 0.3); ctx.beginPath(); ell(ctx, 0, -77, 15, 4.4, 0); ctx.fill();
    var cg = ctx.createRadialGradient(0, -77, 1, 0, -77, 14);
    cg.addColorStop(0, rgba(VOLCANO.hot, Math.min(1, 0.85 + 0.15 * ring))); cg.addColorStop(1, rgba(VOLCANO.glow, 0.9));
    ctx.fillStyle = cg; ctx.beginPath(); ell(ctx, 0, -76.4, 12.5, 3.2, 0); ctx.fill();
    // a fern sprout at the foot
    ctx.save(); ctx.translate(46, -2);
    [-0.6, 0, 0.6].forEach(function (a) { leaf(ctx, 0, 0, -Math.PI / 2 + a, 12 - Math.abs(a) * 4, VINE); });
    ctx.restore();
    if (night > 0.01) { ctx.strokeStyle = 'rgba(214,226,255,' + (0.6 * night).toFixed(3) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-54, -4); ctx.bezierCurveTo(-48, -20, -34, -40, -24, -66); ctx.stroke(); }
    ctx.restore();
    // the idle steam wisp
    var wa = 0.55 * (1 - 0.6 * ring);
    for (var i = 0; i < 3; i++) {
      var ph = (t * 0.35 + i / 3) % 1, wy = -84 - ph * 40, wx = Math.sin(ph * 5 + i) * 5 + ph * 6;
      smokePuff(ctx, wx, wy, 4 + ph * 6, wa * Math.sin(ph * Math.PI), night);
    }
    // the puff: a sparkly smoke ring rising from the crater
    if (ring > 0.01) {
      var f = 1 - ring, ry0 = -92 - f * 62, rx = 24 + f * 30, ryy = 7 + f * 7, al = Math.min(1, ring * 1.4);
      // back half of the ring first, then the front half (a torus of small puffs with a clear hole)
      for (var hh = 0; hh < 2; hh++) {
        for (var k = 0; k < 16; k++) {
          var a2 = k * TAU / 16 + f * 0.8, sn = Math.sin(a2);
          if ((sn < 0) !== (hh === 0)) continue;
          smokePuff(ctx, Math.cos(a2) * rx, ry0 + sn * ryy, 4.4 + f * 2.5 + (k % 2) * 1.2, al * 0.95, night);
        }
      }
      for (var m = 0; m < 6; m++) {
        var a3 = m * TAU / 6 + f * 3, rr = 2.5 + 4 * ring * (m % 2 ? 0.6 : 1);
        sparkle(ctx, Math.cos(a3) * (rx + 6), ry0 + Math.sin(a3) * (ryy + 4) - 4, rr, m % 3 === 0 ? rgba('#FFE58A', al) : 'rgba(255,255,255,' + al.toFixed(3) + ')');
      }
      smokePuff(ctx, 0, -84 - f * 14, 7 + 5 * ring, ring * 0.8, night);
    }
    ctx.restore();
  }

  // ================================================================= STONE TABLET (beat mode number card)
  function cardDots(n) {
    var out = [], i, one = n <= 5, top = one ? n : Math.ceil(n / 2), sp = n <= 3 ? 22 : one ? 17 : 13.4, r = n <= 3 ? 8.2 : one ? 6.9 : 5.4;
    for (i = 0; i < n; i++) {
      var row = one ? 0 : (i < top ? 0 : 1), inRow = row ? n - top : top, col = row ? i - top : i;
      out.push([(col - (inRow - 1) / 2) * sp, one ? 28 : 21 + row * 14.5, r]);
    }
    return out;
  }
  function tabletPath(w, h) {
    return function (q) {
      var x0 = -w / 2, y0 = -h / 2;
      rpoly(q, [[x0 + 2, y0 + 4], [x0 + w * 0.5, y0 - 1], [x0 + w - 1, y0 + 3], [x0 + w + 1, y0 + h * 0.55], [x0 + w - 2, y0 + h], [x0 + w * 0.45, y0 + h + 1.5], [x0, y0 + h - 2], [x0 - 1.5, y0 + h * 0.45]],
        [14, 20, 14, 18, 14, 20, 14, 18]);
    };
  }
  function cardFace(ctx, n, lit, flash) {
    var w = n <= 3 ? 82 : 98, h = 100, txt = String(n), tp = tabletPath(w, h);
    ctx.lineJoin = 'round';
    ctx.save(); ctx.translate(2, 4); ctx.fillStyle = 'rgba(60,50,40,0.2)'; ctx.beginPath(); tp(ctx); ctx.fill(); ctx.restore();
    if (flash > 0.01) { ctx.strokeStyle = 'rgba(255,236,150,' + (0.8 * flash).toFixed(3) + ')'; ctx.lineWidth = 6 + 10 * flash; ctx.beginPath(); tp(ctx); ctx.stroke(); }
    cel(ctx, 'tab.' + w, tp, STONE, { s: 4, shade: STONE.shade, lw: 3.4, line: STONE.dark, hl: false,
      inner: function (x) {
        oval(x, -w * 0.28, -h * 0.36, w * 0.14, 3.4, -0.2, rgba(STONE.light, 0.9));
        // speckles + a little moss on the top-left corner
        [[w * 0.32, -h * 0.3, 1.6], [-w * 0.36, h * 0.1, 1.3], [w * 0.36, h * 0.24, 1.5], [-w * 0.1, h * 0.42, 1.2]].forEach(function (d) { dot(x, d[0], d[1], d[2], rgba(STONE.dark, 0.4)); });
        x.fillStyle = MOSS.base; x.beginPath(); x.moveTo(-w / 2 - 2, -h / 2 + 14); x.quadraticCurveTo(-w / 2 + 2, -h / 2 - 2, -w / 2 + 22, -h / 2 + 1);
        x.quadraticCurveTo(-w / 2 + 16, -h / 2 + 6, -w / 2 + 10, -h / 2 + 5); x.quadraticCurveTo(-w / 2 + 6, -h / 2 + 10, -w / 2 - 2, -h / 2 + 14); x.fill();
      } });
    // carved numeral
    chunkyText(ctx, txt, 0, n > 5 ? -20 : -17, txt.length > 1 ? 64 : 48, n > 5 ? 36 : 40, STONE.ink);
    var D = cardDots(n);
    for (var i = 0; i < D.length; i++) {
      var d = D[i], on = i < lit;
      if (on) {
        glowDisc(ctx, d[0], d[1], 1, d[2] * 3, '#FFE178', 0.85);
        var r = d[2] * 1.22;
        dot(ctx, d[0], d[1], r, STAR.base); ctx.strokeStyle = STAR.dark; ctx.lineWidth = 1.8; ctx.beginPath(); circ(ctx, d[0], d[1], r); ctx.stroke();
        oval(ctx, d[0] - r * 0.3, d[1] - r * 0.35, r * 0.34, r * 0.22, -0.6, 'rgba(255,255,255,0.9)');
      } else {   // a carved hollow
        dot(ctx, d[0], d[1], d[2], mix(STONE.shade, STONE.dark, 0.25));
        dot(ctx, d[0] + 0.6, d[1] + 0.8, d[2] * 0.78, mix(STONE.shade, '#FFFFFF', 0.15));
        ctx.strokeStyle = STONE.dark; ctx.lineWidth = 1.6; ctx.beginPath(); circ(ctx, d[0], d[1], d[2]); ctx.stroke();
      }
    }
    if (lit > 0 && lit <= D.length) { var L = D[lit - 1]; sparkle(ctx, L[0] + L[2] * 1.3, L[1] - L[2] * 1.4, 3.6, '#FFFFFF'); }
  }
  function drawCard(ctx, x, y, n, opt) {
    if (!ctx) return;
    var o = opt || {}, N = Math.max(1, Math.min(12, Math.round(num(n, 1)))), H = num(o.size, 150);
    var pop = o.pop == null ? 1 : Math.max(0, Math.min(1.5, num(o.pop, 1)));
    if (pop <= 0.001 || !(H > 0)) return;
    var lit = Math.max(0, Math.min(N, Math.round(num(o.lit, 0)))), flash = clamp01(o.flash), s = H / 100 * pop * (1 + 0.05 * flash);
    ctx.save(); ctx.translate(num(x, 0), num(y, 0)); ctx.scale(s, s);
    cardFace(ctx, N, lit, flash);
    ctx.restore();
  }

  // ================================================================= NOTE ♪
  function drawNote(ctx, x, y, size, opt) {
    if (!ctx) return;
    var o = opt || {}, s = num(size, 40) / 100, c = o.color ? (pal(o.color) || GOLD) : GOLD, a = o.alpha == null ? 1 : clamp01(o.alpha);
    if (a <= 0.001 || !(s > 0)) return;
    ctx.save(); ctx.translate(num(x, 0), num(y, 0)); ctx.rotate(num(o.rot, 0)); ctx.scale(s, s); ctx.globalAlpha *= a;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    glowDisc(ctx, 0, 0, 8, 72, mix(c.light, '#FFFFFF', 0.3), 0.8);
    var shape = function (q) {
      ell(q, -12, 30, 20, 14, -0.38);
      q.moveTo(2, 28); q.lineTo(2, -46); q.lineTo(12, -46); q.lineTo(12, 26); q.closePath();
      q.moveTo(8, -48); q.bezierCurveTo(16, -30, 40, -26, 36, 2); q.bezierCurveTo(32, -14, 20, -18, 10, -22); q.closePath();
    };
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 15; ctx.beginPath(); shape(ctx); ctx.stroke();
    ctx.strokeStyle = lineOf(c); ctx.lineWidth = 8; ctx.beginPath(); shape(ctx); ctx.stroke();
    ctx.fillStyle = c.base; ctx.beginPath(); shape(ctx); ctx.fill();
    oval(ctx, -17, 25, 6, 3.4, -0.4, 'rgba(255,255,255,0.75)');
    line(ctx, [5.5, -38, 5.5, 14], 'rgba(255,255,255,0.45)', 2.4);
    ctx.restore();
  }

  // ================================================================= SPARK (Rio's sung spark)
  function drawSpark(ctx, x, y, size, opt) {
    if (!ctx) return;
    var o = opt || {}, S = num(size, 30), a = o.alpha == null ? 1 : clamp01(o.alpha), t = num(o.t, 0);
    if (!(S > 0) || a <= 0.001) return;
    var c = o.color ? (pal(o.color) || GOLD) : null, tone = c ? c.light : '#FFE58A', core = c ? mix(c.light, '#FFFFFF', 0.55) : '#FFF6C8';
    var vx = num(o.vx, 1), vy = num(o.vy, -0.6), vl = Math.hypot(vx, vy) || 1;
    var s = S / 100;
    ctx.save(); ctx.translate(num(x, 0), num(y, 0)); ctx.scale(s, s); ctx.globalAlpha *= a; ctx.lineCap = 'round';
    // the trail: fading dots behind the flight direction
    for (var i = 1; i <= 4; i++) {
      var d = 22 + i * 20, tx = -vx / vl * d + Math.sin(t * 9 + i) * 3, ty = -vy / vl * d + Math.cos(t * 9 + i) * 3;
      glowDisc(ctx, tx, ty, 0, 22 - i * 3, tone, 0.6 - i * 0.12);
      dot(ctx, tx, ty, 9 - i * 1.6, rgba(core, 0.9 - i * 0.18));
    }
    glowDisc(ctx, 0, 0, 6, 92, tone, 0.75);
    glowDisc(ctx, 0, 0, 2, 50, core, 0.9);
    // the soft star-puff, gently turning + twinkling
    var tw = 1 + 0.12 * Math.sin(t * 14);
    ctx.save(); ctx.rotate(t * 1.5);
    var st = function (q) { starPath(q, 0, 0, 44 * tw, 21 * tw, 8); };
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 9; ctx.lineJoin = 'round'; ctx.beginPath(); st(ctx); ctx.stroke();
    ctx.fillStyle = c ? mix(c.light, '#FFFFFF', 0.25) : '#FFC93C'; ctx.beginPath(); st(ctx); ctx.fill();
    ctx.strokeStyle = c ? rgba(lineOf(c), 0.85) : GOLD.dark; ctx.lineWidth = c ? 4 : 5; ctx.beginPath(); st(ctx); ctx.stroke();
    ctx.restore();
    dot(ctx, -8, -9, 8, 'rgba(255,255,255,0.95)');
    sparkle(ctx, 0, 0, 62 * tw, 'rgba(255,255,255,0.5)');
    ctx.restore();
  }

  // ================================================================= FIREFLY (a real one)
  function drawFirefly(ctx, x, y, r, glow) {
    if (!ctx) return;
    r = num(r, 4); var gl = clamp01(glow == null ? 1 : glow);
    if (!(r > 0)) return;
    var LIGHT = '#E8F7A0';
    ctx.save(); ctx.translate(num(x, 0), num(y, 0)); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // the glow around the tail light (behind, a little below the body)
    var tx = r * 0.2, ty = r * 0.9;
    glowDisc(ctx, tx, ty, r * 0.2, r * (3.4 + 3 * gl), '#D8F27A', 0.75 * gl);
    // wings (translucent, flutter)
    var fl = Math.sin(num(x, 0) * 0.37 + num(y, 0) * 0.21) * 0.15;
    ctx.fillStyle = 'rgba(235,240,255,0.55)'; ctx.strokeStyle = 'rgba(150,160,190,0.6)'; ctx.lineWidth = Math.max(0.5, r * 0.12);
    [-1, 1].forEach(function (sd) { ctx.beginPath(); ell(ctx, sd * r * 0.85, -r * 0.35, r * 0.75, r * 0.42, sd * (0.5 + fl)); ctx.fill(); ctx.stroke(); });
    // body: head, thorax, then the glowing abdomen
    var lc = mix('#B9C46A', LIGHT, gl);
    ctx.fillStyle = lc; ctx.beginPath(); ell(ctx, tx, ty, r * 0.52, r * 0.62, 0); ctx.fill();
    dot(ctx, tx - r * 0.12, ty - r * 0.14, r * 0.2, rgba('#FFFFFF', 0.5 + 0.4 * gl));
    ctx.fillStyle = '#4E4438'; ctx.beginPath(); ell(ctx, 0, 0, r * 0.45, r * 0.55, 0); ctx.fill();
    ctx.fillStyle = '#D88A6A'; ctx.beginPath(); ell(ctx, -r * 0.1, -r * 0.62, r * 0.32, r * 0.26, 0); ctx.fill();   // the little red-ish head shield
    dot(ctx, -r * 0.22, -r * 0.68, r * 0.08, '#FFFFFF');
    ctx.strokeStyle = '#4E4438'; ctx.lineWidth = Math.max(0.5, r * 0.1);
    ctx.beginPath(); ctx.moveTo(-r * 0.2, -r * 0.8); ctx.quadraticCurveTo(-r * 0.5, -r * 1.3, -r * 0.8, -r * 1.35); ctx.moveTo(0, -r * 0.82); ctx.quadraticCurveTo(r * 0.1, -r * 1.35, r * 0.35, -r * 1.5); ctx.stroke();
    if (gl > 0.05) sparkle(ctx, tx + r * 0.9, ty - r * 0.2, r * (0.35 + 0.4 * gl), rgba('#F6FFD0', 0.9 * gl));
    ctx.restore();
  }

  // ================================================================= ICON
  function drawIcon(ctx, thing, size) {
    if (!ctx || !thing) return;
    size = num(size, 100); if (!(size > 0)) return;
    var t = thing, k = t.kind;
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (K[k]) {
      var bu = boxU(t), sz = size * (k === 'animal' ? 0.96 : 0.92) * 100 / Math.max(bu.w, bu.h, 60);
      ctx.translate(0, -bu.cy * sz / 100); drawEgg(ctx, t, sz, {});
    } else if (k === 'letter') {
      var th = { kind: 'glyph', text: t.text, color: t.color }, bg = boxU(th), sg = size * 0.92 * 100 / Math.max(bg.w, bg.h);
      ctx.translate(0, -bg.cy * sg / 100); drawEgg(ctx, th, sg, {});
    } else if (k === 'number') {
      var n = Math.round(num(t.n != null ? t.n : t.text, 1)), s1 = size / 100;
      ctx.scale(s1, s1);
      if (n >= 1 && n <= 12) { ctx.scale(0.9, 0.9); cardFace(ctx, n, 0, 0); }
      else {
        cel(ctx, 'ic.tab', tabletPath(84, 92), STONE, { s: 3, shade: STONE.shade, lw: 3, line: STONE.dark, hl: false });
        chunkyText(ctx, String(n), 0, 0, 66, 56, STONE.ink);
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
      var big = t.big === true || t.size === 'big', inner = { kind: 'egg', color: t.color || 'red' };
      if (big) { var sb = size * 0.94; ctx.translate(0, sb / 2); drawEgg(ctx, inner, sb, {}); }
      else {
        ctx.strokeStyle = 'rgba(120,100,80,0.28)'; ctx.setLineDash && ctx.setLineDash([5, 5]); ctx.lineWidth = 2;
        ctx.beginPath(); rrect(ctx, -size * 0.36, -size * 0.46, size * 0.72, size * 0.92, size * 0.12); ctx.stroke(); ctx.setLineDash && ctx.setLineDash([]);
        ctx.translate(0, size * 0.42); drawEgg(ctx, inner, size * 0.5, {});
      }
    } else if (k === 'sound' || k === 'head') {
      var name = animalOf(t), hb = ANIMAL.headBox(name), ext = Math.max(hb.w, hb.h) + 2 * BORDER + 4, s3 = size * 0.96 / ext;
      ctx.scale(s3, s3); ctx.translate(-(hb.x + hb.w / 2), -(hb.y + hb.h / 2));
      drawHead(ctx, name, clamp01(t.sing), true);
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
    // cuff: a soft mint sleeve (Rio's colour) with a darker trim
    ctx.fillStyle = '#7CD3C4'; ctx.strokeStyle = '#2F7A70'; ctx.lineWidth = s * 0.035;
    ctx.beginPath(); rrect(ctx, -s * 0.25, s * 0.76, s * 0.46, s * 0.15, s * 0.06); ctx.fill(); ctx.stroke();
    line(ctx, [-s * 0.2, s * 0.835, s * 0.16, s * 0.835], '#BFEDE4', s * 0.025);
    ctx.restore();
  }

  function clearCache() { pcache = {}; pN = 0; bcache = {}; }

  SE.EggArt = {
    drawEgg: drawEgg, bodyBox: bodyBox, drawCushion: drawCushion, drawCushionFront: drawCushionFront, cushionDip: cushionDip,
    drawGarland: drawGarland, drawCymbal: drawCymbal, drawCard: drawCard, drawNote: drawNote, drawSpark: drawSpark,
    drawIcon: drawIcon, drawGhostHand: drawGhostHand, drawFirefly: drawFirefly,
    pal: function (n) { return pal(n) || null; }, PALETTE: FALLBACK, SHELL: SHELL, STRAW: STRAW, ROCK: ROCK, MOSS: MOSS, VINE: VINE,
    POD: POD, VOLCANO: VOLCANO, STONE: STONE, FONT: FONT, SHAPES: SHAPES, ANIMALS: ANIMALS, KINDS: KINDS, CYMBAL_H: CYM_H,
    thingKey: thingKey, lanternRadius: lanternRadius, clearCache: clearCache
  };
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
