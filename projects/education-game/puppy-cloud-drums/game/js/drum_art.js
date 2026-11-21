/* Bibi's Cloud Drums — CD.DrumArt (character artist B), DESIGN §3 / §4.2. Everything here is drawn by code on a 2D canvas.
 *
 *   drawDrum(ctx, thing, size, opt)  origin = the BOTTOM CENTRE of the drum (where it sits on its cushion); the body
 *       stands UP (−y). size = the longest side of the body.
 *       thing = { kind: 'drum'|'shape'|'big'|'dots'|'animal'|'glyph', color?, shape?, n?, animal?, text?, big? }
 *       opt   = { glow 0..1, ring 0..1 (rim flash + sound rings), dull 0|1 (wrong: no flash / rings), sq (vertical squash,
 *                 1 = rest; width × 1/√sq, bottom stays at the anchor), skin 0..1 + skinPh rad (membrane ripple), dim 0..1,
 *                 night 0..1 (moonlight rim, never darkens), pop 0..1.5 (scale about the anchor), count -1|0..n (dots drum:
 *                 the first `count` dots get a white ring), sing 0..1 (animal mouth open + song lines) }
 *   bodyBox(thing, size) → { w, h, cy }   visible box in px (w, h ≤ size); cy = body centre offset from the anchor (< 0)
 *   drawCushion(ctx, x, y, w, opt)        floating cloud cushion, origin = its TOP centre; opt { dent 0..1, t, night, alpha, pop }
 *   cushionDip(w, dent) → px              how far the cushion's top centre sinks for that dent (the drum may ride it)
 *   drawGarland(ctx, garland, lanterns, opt)   silver string between two tiny clouds; lanterns[i] = {x, y (star CENTRE, on
 *                                         the string), lit, color|null, swing, flash}; opt { t, night, r (star radius, 22) }
 *   drawCymbal(ctx, cym, opt)             cym = {x, y (stand foot), s (scale; or h → s = h / 150)}; cymbal top ≈ y − 142·s;
 *                                         opt { tilt rad, ring 0..1, night, t }
 *   drawCard(ctx, x, y, n, opt)           beat-mode number card, origin = CENTRE; opt { lit, pop, flash, size (card height 150) }
 *   drawNote(ctx, x, y, size, opt)        ♪ centred at (x, y), size = height; opt { color, alpha, rot }
 *   drawIcon(ctx, thing, size)            centred in a size × size box: any drum thing, or number {n} | color {color} |
 *                                         size {big, color?} | sound {animal} | letter {text}
 *   drawGhostHand(ctx, size, press)       friendly pointing hand, origin = fingertip (finger points UP-LEFT), press 0..1
 *   drawFirefly(ctx, x, y, r, glow)       night twinkle star, r = star body radius (px)
 *   Helpers: pal(color), PALETTE, BRASS, WOOD, SILVER, SKIN, CLOUD, FONT, SHAPES, ANIMALS, KINDS, thingKey, lanternRadius,
 *            cushionDip, clearCache.
 *
 * Drums are designed in a 100-unit box (x −50..50, y −100..0, anchor at (0, 0)); the ctx is scaled by size / 100.
 * Path2D objects are cached per part (size independent — equivalent to per thing+size because the ctx is scaled).
 * Node-safe at load (no DOM). Without Path2D (node tests) paths are rebuilt on the ctx each draw.
 */
(function (G) {
  'use strict';
  var CD = G.CD = G.CD || {};

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
  var WOOD = { base: '#C99466', dark: '#8E5F3A', light: '#E9C29A' };
  var SILVER = { base: '#E4E6EE', dark: '#9AA0B4', light: '#FFFFFF', line: '#7F869C' };
  var SKIN = { base: '#FFF6E6', dark: '#EADBC0', light: '#FFFFFF', line: '#B89B72' };
  var CREAM = { base: '#FFF6E6', dark: '#B89B72', light: '#FFFFFF' };          // cream body of the shape drums
  var CORD = '#F6EBD3', CORD_LINE = '#B89B72';
  var CLOUD = { base: '#F4F1FA', shade: '#DCD6EC', line: '#B3A9D0', light: '#FFFFFF' };
  var GOLD = { base: '#E9B949', dark: '#9C7838', light: '#F8E3A6' };          // notes / lanterns with no colour
  var STAR = { base: '#FFD23F', dark: '#B8860B', light: '#FFF1B0' };          // gold star emblem / lit card dots
  var INK = '#4A5A8C';                                                          // numerals on the card
  var SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'rect', 'diamond', 'oval'];
  var ANIMALS = ['cow', 'duck', 'cat', 'pig', 'frog', 'sheep', 'hen', 'mouse'];
  var KINDS = ['drum', 'shape', 'big', 'dots', 'animal', 'glyph'];
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
    var P = CD.PALETTE, c = P && P[name] && P[name].base ? P[name] : FALLBACK[name];
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
    if (o.under) { ctx.strokeStyle = o.line || lineOf(c); ctx.lineWidth = 2 * (o.lw || LW); strokeP(ctx, p); }   // union outline
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
    if (o.line !== false && !o.under) { ctx.strokeStyle = o.line || lineOf(c); ctx.lineWidth = o.lw || LW; strokeP(ctx, p); }
    return p;
  }
  function dot(ctx, x, y, r, col) { ctx.fillStyle = col; ctx.beginPath(); circ(ctx, x, y, Math.max(0.01, r)); ctx.fill(); }
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
  function starPts(cx, cy, ro, ri) {
    var pts = [];
    for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? ri : ro; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    return pts;
  }
  function starPath(t, cx, cy, ro, ri, rr) { rpoly(t, starPts(cx, cy, ro, ri), rr == null ? ro * 0.14 : rr); }

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
  function whiskers(ctx, y, x0, x1, col) {
    ctx.strokeStyle = col; ctx.lineWidth = 1.1; ctx.beginPath();
    [-1, 1].forEach(function (sd) {
      ctx.moveTo(sd * x0, y - 1); ctx.lineTo(sd * x1, y - 3.5);
      ctx.moveTo(sd * x0, y + 1.2); ctx.lineTo(sd * x1, y + 2);
    });
    ctx.stroke();
  }

  // ================================================================= DRUM GEOMETRY (all kinds share one builder)
  // R = body half width, yt/rt = top skin ellipse centre / half height, yb/rb = bottom ellipse, ht/hb = hoop band heights.
  var GEO = {
    drum:   { R: 44, rt: 12.5, yt: -74, rb: 10, yb: -12, ht: 8, hb: 7, bulge: 3.6, cords: 8 },
    shape:  { R: 44, rt: 10, yt: -77, rb: 9, yb: -11, ht: 6.5, hb: 6, bulge: 3.2, cords: 0 },
    big:    { R: 44, rt: 13, yt: -80, rb: 10, yb: -21, ht: 8.5, hb: 7.5, bulge: 3.6, cords: 8, legs: true },
    dots:   { R: 44, rt: 11.5, yt: -75, rb: 10, yb: -12, ht: 7.5, hb: 7, bulge: 3.4, cords: 8 },
    glyph:  { R: 44, rt: 11.5, yt: -75, rb: 10, yb: -12, ht: 7.5, hb: 7, bulge: 3.4, cords: 8 },
    animal: { R: 33, rt: 8.5, yt: -40, rb: 7.5, yb: -9.5, ht: 6, hb: 5.5, bulge: 3, cords: 6 }
  };
  function rh(g) { return g.R + 2.5; }                      // hoop radius
  function frontTop(g) { return g.yt + g.ht + g.rt; }       // the front edge under the top hoop (centre)
  function frontBot(g) { return g.yb - g.hb + g.rb; }       // the front edge over the bottom hoop (centre)
  function geoBox(g) {
    var top = g.yt - g.rt - LW / 2;
    return { w: 2 * (Math.max(rh(g), g.R + g.bulge) + LW / 2), h: -top, top: top };
  }
  var GB = {}, FLASH = 0;
  function gp(k, name) {        // geometry paths (built once per kind)
    var g = GEO[k], R = g.R, H = rh(g), key = 'g.' + k + '.' + name;
    var B = GB[key];
    if (B) return B;
    if (name === 'body') B = function (t) {
      var my = (g.yt + g.yb) / 2;
      t.moveTo(-R, g.yt); t.quadraticCurveTo(-R - g.bulge * 2, my, -R, g.yb);
      t.ellipse(0, g.yb, R, g.rb, 0, Math.PI, 0, true);
      t.quadraticCurveTo(R + g.bulge * 2, my, R, g.yt);
      t.ellipse(0, g.yt, R, g.rt, 0, 0, Math.PI, true);
      t.closePath();
    };
    else if (name === 'sil') B = function (t) {     // body + hoops outline (glow / flash / night rims)
      var my = (g.yt + g.yb) / 2;
      t.moveTo(-H, g.yt); t.quadraticCurveTo(-g.R - g.bulge * 2, my, -H, g.yb);
      t.ellipse(0, g.yb, H, g.rb, 0, Math.PI, 0, true);
      t.quadraticCurveTo(g.R + g.bulge * 2, my, H, g.yt);
      t.ellipse(0, g.yt, H, g.rt, 0, 0, Math.PI, true);
      t.closePath();
    };
    else if (name === 'bandT') B = function (t) { band(t, H, g.yt, g.ht, g.rt); };
    else if (name === 'bandB') B = function (t) { band(t, H, g.yb - g.hb, g.hb, g.rb); };
    else if (name === 'ring') B = function (t) { ell(t, 0, g.yt, H, g.rt, 0); };
    else if (name === 'skin') B = function (t) { ell(t, 0, g.yt, H - 4.5, g.rt - 2.4, 0); };
    GB[key] = B;
    return B;
  }
  /** the front of a hoop: from the upper ellipse's front half down to the lower one's front half */
  function band(t, H, y, h, ry) {
    t.moveTo(-H, y); t.ellipse(0, y, H, ry, 0, Math.PI, 0, true);
    t.lineTo(H, y + h); t.ellipse(0, y + h, H, ry, 0, 0, Math.PI, false); t.closePath();
  }

  /** silver hoop band with a bright upper edge and a darker right side */
  function hoop(ctx, k, name) {
    var g = GEO[k], H = rh(g), B = gp(k, name), p = P('g.' + k + '.' + name, B);
    ctx.fillStyle = SILVER.base; fillP(ctx, p);
    ctx.save(); clipP(ctx, p);
    ctx.fillStyle = mix(SILVER.base, SILVER.dark, 0.45); ctx.fillRect(H * 0.45, g.yt - 30, H, 140);
    ctx.fillStyle = mix(SILVER.base, SILVER.dark, 0.25); ctx.fillRect(H * 0.1, g.yt - 30, H * 0.35, 140);
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(-H * 0.72, g.yt - 30, H * 0.18, 140);
    var y = name === 'bandT' ? g.yt : g.yb - g.hb, ry = name === 'bandT' ? g.rt : g.rb;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.ellipse(0, y + 1.6, H - 1, ry, 0, Math.PI * 0.95, Math.PI * 0.35, true); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = SILVER.line; ctx.lineWidth = 2.8; strokeP(ctx, p);
  }
  /** cream zig-zag tension cords between the hoops, following the front curve */
  function cords(ctx, k) {
    var g = GEO[k], N = g.cords, pts = [], i;
    if (!N) return;
    for (i = 0; i <= N; i++) {
      var a = Math.PI - 0.2 - i * (Math.PI - 0.4) / N, x = g.R * 1.02 * Math.cos(a), s = Math.sin(a);
      pts.push(x, i % 2 ? (g.yb - g.hb + g.rb * s - 0.6) : (g.yt + g.ht + g.rt * s + 0.6));
    }
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    line(ctx, pts, CORD_LINE, k === 'animal' ? 3.6 : 4.4);
    line(ctx, pts, CORD, k === 'animal' ? 1.9 : 2.4);
    // tiny tension knots where the cord meets the hoops
    for (i = 0; i < pts.length; i += 2) dot(ctx, pts[i], pts[i + 1], k === 'animal' ? 1.6 : 2, CORD_LINE);
  }
  /** the drum body (cylinder) with toy gloss; c = colour {base, dark, light}; shade optional */
  function body(ctx, k, c, shade) {
    var g = GEO[k], R = g.R, B = gp(k, 'body'), p = P('g.' + k + '.body', B);
    ctx.fillStyle = c.base; fillP(ctx, p);
    ctx.save(); clipP(ctx, p);
    ctx.fillStyle = shade || shadeOf(c); ctx.beginPath(); ell(ctx, R * 1.05, (g.yt + g.yb) / 2, R * 0.62, 80, 0); ctx.fill();
    ctx.fillStyle = rgba(c.dark, 0.28); ctx.beginPath(); ell(ctx, R * 1.25, (g.yt + g.yb) / 2, R * 0.5, 80, 0); ctx.fill();
    ctx.fillStyle = rgba(mix(c.light, '#FFFFFF', 0.3), 0.55); ctx.beginPath(); ell(ctx, -R * 1.02, (g.yt + g.yb) / 2, R * 0.3, 80, 0); ctx.fill();
    // shadow under the top hoop (follows the ellipse)
    ctx.strokeStyle = rgba(c.dark, 0.32); ctx.lineWidth = 5;
    ctx.beginPath(); ctx.ellipse(0, g.yt + g.ht + 2.5, R + 3, g.rt, 0, Math.PI, 0, true); ctx.stroke();
    // glossy streak + glint (toy plastic / lacquer)
    var y0 = frontTop(g) + 4, y1 = frontBot(g) - 5;
    if (y1 - y0 > 8) {
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); rrect(ctx, -R * 0.7, y0, R * 0.13, (y1 - y0) * 0.62, R * 0.065); ctx.fill();
      dot(ctx, -R * 0.635, y0 + (y1 - y0) * 0.78, R * 0.06, 'rgba(255,255,255,0.5)');
    }
    ctx.restore();
    ctx.strokeStyle = lineOf(c); ctx.lineWidth = LW; strokeP(ctx, p);
  }
  /** top hoop ring + the cream skin with ripple; skin 0..1, ph rad; strong = big drum */
  function skinTop(ctx, k, skin, ph, strong, flash) {
    var g = GEO[k], H = rh(g), pr = P('g.' + k + '.ring', gp(k, 'ring')), ps = P('g.' + k + '.skin', gp(k, 'skin'));
    var rx = H - 4.5, ry = g.rt - 2.4, A = skin * 6 * (strong ? 1.3 : 1), sn = Math.sin(ph);
    ctx.fillStyle = SILVER.base; fillP(ctx, pr);
    ctx.strokeStyle = SILVER.line; ctx.lineWidth = 2.8; strokeP(ctx, pr);
    ctx.fillStyle = SKIN.dark; fillP(ctx, ps);
    ctx.save(); clipP(ctx, ps);
    ctx.fillStyle = SKIN.base; ctx.beginPath(); ell(ctx, 0, g.yt + 1.8, rx, ry, 0); ctx.fill();
    if (A > 0.05) {
      // the membrane bulges (lighter dome) / dips (darker dish), and concentric ripples run outwards
      var d = A * sn;
      if (d > 0) {   // a raised dome: shadow under its front, bright cap on top
        ctx.fillStyle = rgba('#D8C3A0', Math.min(0.85, 0.14 * d)); ctx.beginPath(); ell(ctx, 1.5, g.yt + 1.5, rx * 0.66, ry * 0.66, 0); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,' + Math.min(1, 0.2 * d).toFixed(3) + ')'; ctx.beginPath(); ell(ctx, -1, g.yt - d * 0.55, rx * 0.56, ry * 0.56, 0); ctx.fill();
      } else {       // a dish: darker centre with a light front lip
        ctx.fillStyle = rgba('#D2BB94', Math.min(0.85, -0.14 * d)); ctx.beginPath(); ell(ctx, 0, g.yt - d * 0.25, rx * 0.6, ry * 0.6, 0); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,' + Math.min(0.9, -0.15 * d).toFixed(3) + ')'; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.ellipse(0, g.yt - d * 0.25, rx * 0.6, ry * 0.6, 0, 0.2, Math.PI - 0.2); ctx.stroke();
      }
      for (var j = 0; j < 3; j++) {
        var f = ((ph / TAU + j / 3) % 1 + 1) % 1, a = skin * (1 - f) * 0.9;
        if (a < 0.03) continue;
        ctx.strokeStyle = rgba(SKIN.line, a * 0.75); ctx.lineWidth = 1.6;
        ctx.beginPath(); ell(ctx, 0, g.yt + 0.5 - d * 0.3 * (1 - f), rx * (0.15 + 0.85 * f), ry * (0.15 + 0.85 * f), 0); ctx.stroke();
      }
    } else {
      ctx.strokeStyle = 'rgba(184,155,114,0.16)'; ctx.lineWidth = 1.2; ctx.beginPath(); ell(ctx, 0, g.yt + 0.6, rx * 0.5, ry * 0.5, 0); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.beginPath(); ell(ctx, -rx * 0.42, g.yt - ry * 0.1, rx * 0.2, ry * 0.22, -0.12); ctx.fill();
    if (flash > 0.01) { ctx.fillStyle = 'rgba(255,255,255,' + (0.5 * flash).toFixed(3) + ')'; ctx.fillRect(-H, g.yt - 20, 2 * H, 40); }
    ctx.restore();
    ctx.strokeStyle = rgba(SILVER.dark, 0.9); ctx.lineWidth = 1.4; strokeP(ctx, ps);
    if (flash > 0.01) { ctx.strokeStyle = 'rgba(255,255,255,' + (0.95 * flash).toFixed(3) + ')'; ctx.lineWidth = 3 + 2 * flash; strokeP(ctx, pr); }
  }
  /** the whole standing drum of kind k in colour c; deco(ctx) draws the front decoration over the cords */
  function standDrum(ctx, k, c, o, deco, shade) {
    var g = GEO[k];
    if (g.legs) {   // little stand: two splayed silver legs with rubber feet (behind the body)
      [-1, 1].forEach(function (sd) {
        ctx.lineCap = 'round';
        line(ctx, [sd * 22, g.yb, sd * 33, -3], SILVER.line, 7);
        line(ctx, [sd * 22, g.yb, sd * 33, -3], SILVER.base, 4);
        oval(ctx, sd * 34, -2.6, 6.5, 2.8, 0, '#8E8AA0');
      });
      line(ctx, [-26, -10, 26, -10], SILVER.line, 4.6); line(ctx, [-26, -10, 26, -10], SILVER.base, 2.2);
    }
    body(ctx, k, c, shade);
    cords(ctx, k);
    if (deco) deco(ctx);
    hoop(ctx, k, 'bandB');
    hoop(ctx, k, 'bandT');
    skinTop(ctx, k, clamp01(o.skin), num(o.skinPh, 0), k === 'big', FLASH);
  }

  // ================================================================= DRUM (coloured tom)
  var DRUM = {
    g: 'drum',
    col: function (th) { return pal(th.color) || FALLBACK.red; },
    draw: function (ctx, th, o) { standDrum(ctx, 'drum', this.col(th), o); }
  };

  // ================================================================= SHAPE drum (cream body + big emblem)
  var SHAPE = {   // emblems in a −50..50 × 11..98 design box (centre ≈ 55), scaled onto the drum front
    circle:   { b: function (t) { circ(t, 0, 55, 44); }, k: 1 },
    square:   { b: function (t) { rrect(t, -42, 13, 84, 84, 10); }, k: 1 },
    triangle: { b: function (t) { rpoly(t, [[0, 8], [52, 96], [-52, 96]], [9, 9, 9]); }, k: 1, dy: 3 },
    star:     { b: function (t) { rpoly(t, starPts(0, 59, 52, 23), [5, 2.5, 5, 2.5, 5, 2.5, 5, 2.5, 5, 2.5]); }, k: 1.05, dy: 2 },
    heart:    { b: function (t) {
      t.moveTo(0, 96);
      t.bezierCurveTo(-14, 85, -48, 66, -48, 38);
      t.bezierCurveTo(-48, 22, -36, 13, -23.5, 13);
      t.bezierCurveTo(-11, 13, -3, 20, 0, 29);
      t.bezierCurveTo(3, 20, 11, 13, 23.5, 13);
      t.bezierCurveTo(36, 13, 48, 22, 48, 38);
      t.bezierCurveTo(48, 66, 14, 85, 0, 96);
      t.closePath();
    }, k: 1 },
    rect:     { b: function (t) { rrect(t, -58, 26, 116, 60, 9); }, k: 1 },
    diamond:  { b: function (t) { rpoly(t, [[0, 7], [36, 55], [0, 103], [-36, 55]], [7, 7, 7, 7]); }, k: 1 },
    oval:     { b: function (t) { ell(t, 0, 55, 31, 45, 0); }, k: 1 }
  };
  function shapeOf(th) { return SHAPE[th.shape] ? th.shape : 'circle'; }
  var EMB_H = 43;   // emblem height (design units) — ≈ 82 % of the front between the hoops
  function emblem(ctx, s, c) {
    var g = GEO.shape, S = SHAPE[s], b = bbox('emb.' + s, S.b), k = EMB_H / 90 * S.k;
    var cy = (frontTop(g) + frontBot(g)) / 2 + (S.dy || 0) * k;
    if (b.w * k > 80) k = 80 / b.w;
    ctx.save(); ctx.translate(0, cy); ctx.scale(k, k); ctx.translate(0, -(b.y + b.h / 2));
    var p = P('emb.' + s, S.b);
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 9 / k; ctx.lineJoin = 'round'; strokeP(ctx, p);     // sticker edge
    cel(ctx, 'emb.' + s, S.b, c, {
      s: 5, lw: 3.6 / k, line: lineOf(c),
      hl: [b.x + b.w * 0.3, b.y + b.h * 0.27, b.w * 0.12, b.h * 0.07, -0.6]
    });
    ctx.restore();
  }
  var SHAPED = {
    g: 'shape',
    col: function (th) { return pal(th.color) || FALLBACK.blue; },
    draw: function (ctx, th, o) {
      var c = this.col(th), s = shapeOf(th);
      standDrum(ctx, 'shape', CREAM, o, function (x) { emblem(x, s, c); }, SKIN.dark);
    }
  };

  // ================================================================= BIG bass drum (beat mode)
  var BIG = {
    g: 'big',
    col: function () { return WOOD; },
    draw: function (ctx, th, o) {
      var g = GEO.big, cy = (frontTop(g) + frontBot(g)) / 2;
      standDrum(ctx, 'big', WOOD, o, function (x) {
        var sp = function (t) { starPath(t, 0, cy + 1.5, 21, 9.5, 3); };
        x.strokeStyle = '#FFFFFF'; x.lineWidth = 6; x.lineJoin = 'round'; x.beginPath(); sp(x); x.stroke();
        cel(x, 'big.star', sp, STAR, { s: 2.6, lw: 2.8, hl: [-6, cy - 6, 3.5, 2.2, -0.6] });
      });
    }
  };

  // ================================================================= DOTS drum (counting, age 5+)
  var DOTC = FALLBACK.red;
  var PANEL = { x: -34, w: 68 };
  function panelRect(k) { var g = GEO[k], y0 = frontTop(g) + 3, y1 = frontBot(g) - 3.5; return { x: PANEL.x, y: y0, w: PANEL.w, h: y1 - y0 }; }
  function panel(ctx, k) {
    var r = panelRect(k), key = 'panel.' + k;
    var b = function (t) { rrect(t, r.x, r.y, r.w, r.h, 8); };
    cel(ctx, key, b, { base: '#FFF8EC', dark: '#D8C3A0', light: '#FFFFFF' }, {
      s: -2.2, shade: '#EBDCC0', line: '#9C7650', lw: 2.6, hl: false
    });
    return r;
  }
  function dotLayout(n, r) {
    var out = [], i, cx = 0, cy = r.y + r.h / 2, rr, sp;
    if (n <= 3) { sp = 19; rr = 7.8; for (i = 0; i < n; i++) out.push([(i - (n - 1) / 2) * sp, cy, rr]); return out; }
    if (n <= 5) { sp = 12.8; rr = 5.6; for (i = 0; i < n; i++) out.push([(i - (n - 1) / 2) * sp, cy, rr]); return out; }
    var rows = n <= 10 ? [cy - 6.6, cy + 6.6] : [cy - 11.4, cy, cy + 11.4];
    sp = 12.4; rr = n <= 10 ? 5 : 4.4;
    for (i = 0; i < n; i++) {
      var row = Math.floor(i / 5), col = i % 5, inRow = row < 2 ? Math.min(5, n - row * 5) : n - 10;
      out.push([row < 2 ? (col - 2) * sp : cx + (col - (inRow - 1) / 2) * sp, rows[row], rr]);   // ten-frame, extras centred below
    }
    return out;
  }
  var DOTS = {
    g: 'dots',
    col: function () { return WOOD; },
    draw: function (ctx, th, o) {
      var n = Math.max(1, Math.min(12, Math.round(num(th.n, 3)))), cnt = o.count == null ? -1 : num(o.count, -1);
      standDrum(ctx, 'dots', WOOD, o, function (x) {
        var L = dotLayout(n, panel(x, 'dots'));
        for (var i = 0; i < L.length; i++) {
          var d = L[i];
          dot(x, d[0] + 0.6, d[1] + 1.1, d[2], 'rgba(150,110,70,0.25)');
          dot(x, d[0], d[1], d[2], DOTC.base);
          x.strokeStyle = DOTC.dark; x.lineWidth = 1.6; x.beginPath(); circ(x, d[0], d[1], d[2]); x.stroke();
          oval(x, d[0] - d[2] * 0.32, d[1] - d[2] * 0.36, d[2] * 0.34, d[2] * 0.24, -0.6, 'rgba(255,255,255,0.75)');
          if (cnt >= 0 && i < cnt) {
            x.strokeStyle = '#E8A21A'; x.lineWidth = 4.2; x.beginPath(); circ(x, d[0], d[1], d[2] + 2.4); x.stroke();
            x.strokeStyle = '#FFFFFF'; x.lineWidth = 2.2; x.beginPath(); circ(x, d[0], d[1], d[2] + 2.4); x.stroke();
          }
        }
      });
    }
  };

  // ================================================================= GLYPH drum
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
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fillText(txt, x + 0.9, by + 1.6);       // the lip catches light
    ctx.fillStyle = mix(col, '#2F2A3A', 0.35); ctx.fillText(txt, x - 0.5, by - 0.6);       // inner wall
    ctx.fillStyle = col; ctx.fillText(txt, x, by);
  }
  var GLYPH = {
    g: 'glyph',
    col: function () { return WOOD; },
    draw: function (ctx, th, o) {
      var c = pal(th.color), txt = glyphText(th), ink = c ? (c.base === '#FFD23F' ? '#C99A12' : c.base) : '#5B6B9A';
      standDrum(ctx, 'glyph', WOOD, o, function (x) {
        var r = panel(x, 'glyph');
        carvedText(x, txt, 0, r.y + r.h / 2, txt.length > 1 ? 54 : 40, r.h * 0.74, ink);
      });
    }
  };

  // ================================================================= ANIMALS peeking over a small wood drum
  // Heads are designed around (0, 0) = head centre (≈ radius 22, nothing above −27) and drawn at (0, HY).
  var HY = -67, BORDER = 5.2;
  var PAWX = 21, PAWY = -44.5;
  var AN = {
    cow: {
      c: { base: '#F3EDE4', dark: '#8F8379', light: '#FFFFFF' }, paw: 'hoof', hoof: '#6E5B50',
      parts: [
        ['hornL', function (t) { ell(t, -11, -20.5, 3.6, 5.4, -0.45); }, { base: '#F2E6C8', dark: '#A89470', light: '#FFFFFF' }],
        ['hornR', function (t) { ell(t, 11, -20.5, 3.6, 5.4, 0.45); }, { base: '#F2E6C8', dark: '#A89470', light: '#FFFFFF' }],
        ['earL', function (t) { ell(t, -27, -7, 10.5, 5.6, 0.32); }], ['earR', function (t) { ell(t, 27, -7, 10.5, 5.6, -0.32); }],
        ['head', function (t) { ell(t, 0, 0, 22, 21, 0); }]
      ],
      face: function (ctx, c, o) {
        oval(ctx, -28, -6.5, 5.5, 2.6, 0.32, '#EDBFB4'); oval(ctx, 28, -6.5, 5.5, 2.6, -0.32, '#EDBFB4');
        ctx.save(); clipP(ctx, P('cow.head', AN.cow.parts[4][1]));
        oval(ctx, 13, -15, 11, 7.5, 0.35, '#7E6656'); oval(ctx, -17, 3, 6, 8, 0.2, '#7E6656');
        ctx.restore();
        cel(ctx, 'cow.muz', function (t) { ell(t, 0, 10.5, 16.5, 9.8, 0); }, { base: '#EDC6B8', dark: '#B9877A', light: '#FFFFFF' }, { lw: 2.2, s: 1.8, hl: false });
        oval(ctx, -6.5, 8.5, 2.2, 3, 0.2, '#A06A60'); oval(ctx, 6.5, 8.5, 2.2, 3, -0.2, '#A06A60');
        eye(ctx, -9, -4, 3.8); eye(ctx, 9, -4, 3.8);
        cheek(ctx, -17, 3, 3.4); cheek(ctx, 17, 3, 3.4);
        mouth(ctx, 0, 14.5, 4.2, o, '#8C5A52');
      }
    },
    duck: {
      c: { base: '#F5DC8E', dark: '#B8963E', light: '#FFF6D2' }, paw: 'wing',
      parts: [
        ['tuft1', function (t) { ell(t, -3.5, -21.5, 3.2, 5.6, -0.35); }], ['tuft2', function (t) { ell(t, 3, -21.5, 2.8, 4.8, 0.4); }],
        ['head', function (t) { circ(t, 0, 0, 22); }]
      ],
      face: function (ctx, c, o) {
        var B = { base: '#F2A65A', dark: '#B46A2E', light: '#FAD3A8' };
        eye(ctx, -9, -6, 3.9); eye(ctx, 9, -6, 3.9);
        cheek(ctx, -15.5, 4, 3.8); cheek(ctx, 15.5, 4, 3.8);
        if (o > 0.05) {
          oval(ctx, 0, 10 + 2.5 * o, 10.5, 2.4 + 4.4 * o, 0, MOUTH);
          oval(ctx, 0, 12 + 3.6 * o, 5.5, 1.5 + 1.8 * o, 0, TONGUE);
          ctx.save(); ctx.translate(0, 6.5 * o);
          cel(ctx, 'duck.billL', function (t) { ell(t, 0, 10, 11, 4.4, 0); }, B, { lw: 2.2, s: 1.2, hl: false });
          ctx.restore();
          cel(ctx, 'duck.billU', function (t) { ell(t, 0, 5.8, 13, 5, 0); }, B, { lw: 2.2, s: 1.2, hl: [-5, 4, 3.5, 1.4, -0.2] });
        } else {
          cel(ctx, 'duck.bill', function (t) { ell(t, 0, 7.5, 13, 6.6, 0); }, B, { lw: 2.2, s: 1.4, hl: [-5, 5, 3.5, 1.5, -0.2] });
          ctx.strokeStyle = B.dark; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-11, 8); ctx.quadraticCurveTo(0, 11.5, 11, 8); ctx.stroke();
          dot(ctx, -3.5, 4.5, 1.1, B.dark); dot(ctx, 3.5, 4.5, 1.1, B.dark);
        }
      }
    },
    cat: {
      c: { base: '#E9B47E', dark: '#A8703F', light: '#F8DCBA' }, paw: 'paw',
      parts: [
        ['earL', function (t) { rpoly(t, [[-22, -6], [-18, -26.5], [-5, -18]], [3.5, 3, 3]); }],
        ['earR', function (t) { rpoly(t, mirror([[-22, -6], [-18, -26.5], [-5, -18]]), [3, 3, 3.5]); }],
        ['head', function (t) { ell(t, 0, 0, 23, 20, 0); }]
      ],
      face: function (ctx, c, o) {
        ctx.fillStyle = '#F2BCB8'; ctx.beginPath(); rpoly(ctx, [[-18.5, -11], [-16.5, -22], [-9, -17]], 2); ctx.fill();
        ctx.beginPath(); rpoly(ctx, mirror([[-18.5, -11], [-16.5, -22], [-9, -17]]), 2); ctx.fill();
        ctx.strokeStyle = rgba(c.dark, 0.6); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.beginPath();
        ctx.moveTo(0, -19); ctx.lineTo(0, -13); ctx.moveTo(-5, -18.5); ctx.lineTo(-4, -13.5); ctx.moveTo(5, -18.5); ctx.lineTo(4, -13.5);
        ctx.moveTo(-23, 0); ctx.lineTo(-18, 1); ctx.moveTo(23, 0); ctx.lineTo(18, 1); ctx.stroke();
        oval(ctx, -4.6, 8, 6, 4.6, 0, '#FFF4E8'); oval(ctx, 4.6, 8, 6, 4.6, 0, '#FFF4E8');
        eye(ctx, -9, -3, 4); eye(ctx, 9, -3, 4);
        cheek(ctx, -16, 5, 3.2); cheek(ctx, 16, 5, 3.2);
        ctx.fillStyle = '#E58A9E'; ctx.beginPath(); rpoly(ctx, [[-3, 3.5], [3, 3.5], [0, 6.8]], 1); ctx.fill();
        whiskers(ctx, 8, 9, 22, rgba('#7A5232', 0.6));
        if (o > 0.05) mouth(ctx, 0, 9.5, 4.4, o, c.dark);
        else {
          ctx.strokeStyle = c.dark; ctx.lineWidth = 1.7; ctx.beginPath(); ctx.moveTo(0, 6.8); ctx.lineTo(0, 9);
          ctx.moveTo(-4.2, 9); ctx.quadraticCurveTo(-2, 11.6, 0, 9); ctx.quadraticCurveTo(2, 11.6, 4.2, 9); ctx.stroke();
        }
      }
    },
    pig: {
      c: { base: '#F2BDB6', dark: '#B9787A', light: '#FCE0DC' }, paw: 'hoof', hoof: '#C98E8E',
      parts: [
        ['earL', function (t) { rpoly(t, [[-7, -19], [-26, -21], [-21, -5]], [3, 4, 3]); }],
        ['earR', function (t) { rpoly(t, mirror([[-7, -19], [-26, -21], [-21, -5]]), [3, 4, 3]); }],
        ['head', function (t) { ell(t, 0, 0, 23.5, 20.5, 0); }]
      ],
      face: function (ctx, c, o) {
        ctx.fillStyle = rgba('#E59A9E', 0.8); ctx.beginPath(); rpoly(ctx, [[-11, -17.5], [-22.5, -19], [-19.5, -9.5]], 2); ctx.fill();
        ctx.beginPath(); rpoly(ctx, mirror([[-11, -17.5], [-22.5, -19], [-19.5, -9.5]]), 2); ctx.fill();
        eye(ctx, -10, -6, 3.7); eye(ctx, 10, -6, 3.7);
        cheek(ctx, -17, 4, 3.6); cheek(ctx, 17, 4, 3.6);
        cel(ctx, 'pig.snout', function (t) { ell(t, 0, 4.5, 10.5, 7.2, 0); }, { base: '#EFA9A6', dark: '#B06C6E', light: '#FCE0DC' }, { lw: 2.2, s: 1.4, hl: [-4, 1.5, 3, 1.4, -0.3] });
        oval(ctx, -3.6, 4.8, 1.8, 2.9, 0, '#9C5A5E'); oval(ctx, 3.6, 4.8, 1.8, 2.9, 0, '#9C5A5E');
        mouth(ctx, 0, 14, 4, o, '#9C5A5E');
      }
    },
    frog: {
      c: { base: '#8DBF7A', dark: '#577F48', light: '#D3EAC6' }, paw: 'frog',
      parts: [
        ['eyeL', function (t) { circ(t, -12.5, -16.5, 9.5); }], ['eyeR', function (t) { circ(t, 12.5, -16.5, 9.5); }],
        ['head', function (t) { ell(t, 0, 0, 25.5, 17.5, 0); }]
      ],
      face: function (ctx, c, o) {
        oval(ctx, 0, 8, 17, 7, 0, rgba(c.light, 0.85));
        [-12.5, 12.5].forEach(function (x) {
          cel(ctx, 'frog.w' + x, function (t) { circ(t, x, -16.5, 6.6); }, { base: '#FFFDF5', dark: '#B5C9A8', light: '#FFFFFF' }, { lw: 1.6, s: 1.2, hl: false });
          eye(ctx, x + 0.4, -16, 3.7);
        });
        dot(ctx, -3.5, -4, 1.2, c.dark); dot(ctx, 3.5, -4, 1.2, c.dark);
        cheek(ctx, -17, 2, 4); cheek(ctx, 17, 2, 4);
        if (o > 0.05) {
          var h = 4 + 8 * o;
          var m = function (q) { q.moveTo(-15, 1); q.quadraticCurveTo(0, 4, 15, 1); q.quadraticCurveTo(12, 1 + h, 0, 1 + h); q.quadraticCurveTo(-12, 1 + h, -15, 1); q.closePath(); };
          ctx.fillStyle = MOUTH; ctx.beginPath(); m(ctx); ctx.fill();
          oval(ctx, 0, 1 + h * 0.72, 6, Math.max(0.5, h * 0.22), 0, TONGUE);
          ctx.strokeStyle = c.dark; ctx.lineWidth = 1.8; ctx.beginPath(); m(ctx); ctx.stroke();
        } else {
          ctx.strokeStyle = c.dark; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(-15, 1); ctx.quadraticCurveTo(0, 10, 15, 1); ctx.stroke();
        }
      }
    },
    sheep: {
      c: { base: '#F6F1E8', dark: '#B4A899', light: '#FFFFFF' }, paw: 'hoof', hoof: '#6E625C',
      face0: { base: '#CDBDB2', dark: '#7F6C62', light: '#EEE3DA' },
      parts: [
        ['earL', function (t) { ell(t, -24, 1, 9, 4.6, 0.35); }, { base: '#CDBDB2', dark: '#7F6C62', light: '#EEE3DA' }],
        ['earR', function (t) { ell(t, 24, 1, 9, 4.6, -0.35); }, { base: '#CDBDB2', dark: '#7F6C62', light: '#EEE3DA' }],
        ['wool', function (t) { for (var i = 0; i < 9; i++) { var a = -Math.PI / 2 + i * TAU / 9; circ(t, Math.cos(a) * 15, -2 + Math.sin(a) * 14, 8.6); } circ(t, 0, -2, 16); }],
        ['face', function (t) { ell(t, 0, 4, 12.5, 14.5, 0); }, { base: '#CDBDB2', dark: '#7F6C62', light: '#EEE3DA' }]
      ],
      face: function (ctx, c, o) {
        [[-5, -9], [0, -11.5], [5, -9]].forEach(function (p) { dot(ctx, p[0], p[1], 5, c.base); });
        ctx.strokeStyle = rgba(c.dark, 0.7); ctx.lineWidth = 1.4; ctx.beginPath();
        ctx.arc(-5, -9, 5, Math.PI * 0.15, Math.PI * 0.85); ctx.moveTo(5 + 5 * Math.cos(Math.PI * 0.15), -9 + 5 * Math.sin(Math.PI * 0.15)); ctx.arc(5, -9, 5, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
        eye(ctx, -5.5, 2, 3.3); eye(ctx, 5.5, 2, 3.3);
        cheek(ctx, -9, 9, 2.6); cheek(ctx, 9, 9, 2.6);
        ctx.fillStyle = '#6E5A52'; ctx.beginPath(); rpoly(ctx, [[-2.6, 9.5], [2.6, 9.5], [0, 12]], 1); ctx.fill();
        mouth(ctx, 0, 13.5, 3.4, o, '#6E5A52');
      }
    },
    hen: {
      c: { base: '#F5EBDC', dark: '#B39C80', light: '#FFFFFF' }, paw: 'wing',
      parts: [
        ['comb', function (t) { circ(t, -6.5, -20.5, 5); circ(t, 0, -22, 5.5); circ(t, 6.5, -20.5, 5); }, { base: '#D9675F', dark: '#A3443E', light: '#F0A8A2' }],
        ['head', function (t) { ell(t, 0, 0, 21, 21.5, 0); }]
      ],
      face: function (ctx, c, o) {
        var BK = { base: '#E8A54B', dark: '#B07424', light: '#F8D9A4' }, RED = '#D9675F';
        eye(ctx, -8.5, -5, 3.8); eye(ctx, 8.5, -5, 3.8);
        cheek(ctx, -14.5, 4, 3.4); cheek(ctx, 14.5, 4, 3.4);
        ctx.lineJoin = 'round';
        if (o > 0.05) {
          oval(ctx, 0, 5.5 + 2 * o, 3.6, 1.5 + 2.6 * o, 0, MOUTH);
          ctx.fillStyle = RED; ctx.beginPath(); ell(ctx, 0, 14.5 + 3 * o, 2.8, 3.6, 0); ctx.fill();
          ctx.fillStyle = BK.base; ctx.strokeStyle = BK.dark; ctx.lineWidth = 1.5;
          ctx.beginPath(); rpoly(ctx, [[-5, 1], [5, 1], [0, 5.5]], 1); ctx.fill(); ctx.stroke();
          ctx.beginPath(); rpoly(ctx, [[-4, 7 + 3 * o], [4, 7 + 3 * o], [0, 10.5 + 3 * o]], 1); ctx.fill(); ctx.stroke();
        } else {
          ctx.fillStyle = RED; ctx.beginPath(); ell(ctx, 0, 12.5, 2.8, 3.8, 0); ctx.fill();
          ctx.fillStyle = BK.base; ctx.strokeStyle = BK.dark; ctx.lineWidth = 1.5;
          ctx.beginPath(); rpoly(ctx, [[-5, 1], [5, 1], [0, 9]], 1.2); ctx.fill(); ctx.stroke();
          line(ctx, [-3.5, 4.5, 3.5, 4.5], BK.dark, 1);
        }
      }
    },
    mouse: {
      c: { base: '#BEB5BA', dark: '#7E7479', light: '#E8E2E5' }, paw: 'paw', pawC: '#E9C4C8',
      parts: [
        ['earL', function (t) { circ(t, -17, -14.5, 11.5); }], ['earR', function (t) { circ(t, 17, -14.5, 11.5); }],
        ['head', function (t) { ell(t, 0, 1, 19.5, 18.5, 0); }]
      ],
      face: function (ctx, c, o) {
        dot(ctx, -17, -14, 7, '#F2C0C6'); dot(ctx, 17, -14, 7, '#F2C0C6');
        eye(ctx, -7.5, -1.5, 3.8); eye(ctx, 7.5, -1.5, 3.8);
        cheek(ctx, -13, 6, 3); cheek(ctx, 13, 6, 3);
        oval(ctx, 0, 10, 7.5, 5, 0, rgba(c.light, 0.9));
        dot(ctx, 0, 7, 2.8, '#E58A9E'); dot(ctx, -0.9, 6.2, 0.9, 'rgba(255,255,255,0.8)');
        whiskers(ctx, 9, 6, 19, rgba('#5E5458', 0.55));
        if (o > 0.05) mouth(ctx, 0, 11, 3.6, o, c.dark);
        else {
          ctx.strokeStyle = c.dark; ctx.lineWidth = 1.5; ctx.beginPath();
          ctx.moveTo(-3.4, 10.5); ctx.quadraticCurveTo(-1.7, 12.6, 0, 10.5); ctx.quadraticCurveTo(1.7, 12.6, 3.4, 10.5); ctx.stroke();
          ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = '#A99FA4'; ctx.lineWidth = 0.9;
          ctx.beginPath(); rrect(ctx, -2.2, 11.6, 4.4, 3.4, 0.8); ctx.fill(); ctx.stroke();
        }
      }
    }
  };
  function animalOf(th) { return AN[th.animal] ? th.animal : 'cow'; }
  function headParts(t, a) { a.parts.forEach(function (p) { p[1](t); }); }
  function stickerHead(ctx, a, name, w, col) {
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = w; ctx.lineJoin = 'round';
    for (var i = 0; i < a.parts.length; i++) { var p = P(name + '.' + a.parts[i][0], a.parts[i][1]); strokeP(ctx, p); fillP(ctx, p); }
  }
  /** the head (sticker border + parts + face) at the current origin */
  function drawHead(ctx, name, open) {
    var a = AN[name];
    ctx.save(); ctx.translate(0.8, 1.6); stickerHead(ctx, a, name, 2 * BORDER + 1.6, 'rgba(80,60,90,0.18)'); ctx.restore();
    stickerHead(ctx, a, name, 2 * BORDER, '#FFFFFF');
    for (var i = 0; i < a.parts.length; i++) {
      var pp = a.parts[i], main = pp[0] === 'head' || pp[0] === 'wool';
      cel(ctx, name + '.' + pp[0], pp[1], pp[2] || a.c, { lw: 2.8, s: main ? 3.6 : 2, under: pp[0] === 'wool' || pp[0] === 'comb' });
    }
    a.face(ctx, a.c, open);
  }
  function pawPath(kind, sd) {
    var x = sd * PAWX, y = PAWY;
    if (kind === 'hoof') return function (t) { rrect(t, x - 7, y - 5.5, 14, 11.5, 5.5); };
    if (kind === 'wing') return function (t) { ell(t, x, y - 0.5, 10, 6, sd * 0.2); circ(t, x + sd * 6, y + 3.4, 3.6); circ(t, x + sd * 0.6, y + 4.6, 3.6); circ(t, x - sd * 4.8, y + 4, 3.2); };
    if (kind === 'frog') return function (t) { ell(t, x, y, 8, 5.4, 0); circ(t, x - 5, y + 3.6, 2.6); circ(t, x, y + 4.4, 2.6); circ(t, x + 5, y + 3.6, 2.6); };
    return function (t) { ell(t, x, y, 8, 6, 0); };
  }
  function drawPaws(ctx, name) {
    var a = AN[name], kind = a.paw || 'paw';
    [-1, 1].forEach(function (sd) {
      var b = pawPath(kind, sd), key = name + '.paw' + sd, p = P(key, b);
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2 * BORDER - 1; ctx.lineJoin = 'round'; strokeP(ctx, p);
      ctx.fillStyle = '#FFFFFF'; fillP(ctx, p);
      cel(ctx, key, b, a.c, { lw: 2.4, s: 1.6, hl: false, under: kind === 'frog' || kind === 'wing' });
      var x = sd * PAWX, y = PAWY;
      ctx.lineCap = 'round';
      if (kind === 'hoof') {
        ctx.save(); clipP(ctx, p); ctx.fillStyle = a.hoof || '#6E5B50'; ctx.fillRect(x - 8, y + 1.5, 16, 6); ctx.restore();
        line(ctx, [x, y + 1.8, x, y + 6], rgba(a.c.dark, 0.9), 1.4);
        ctx.strokeStyle = lineOf(a.c); ctx.lineWidth = 2.4; strokeP(ctx, p);
      } else if (kind === 'wing') {
        ctx.strokeStyle = rgba(a.c.dark, 0.6); ctx.lineWidth = 1.2; ctx.beginPath();
        ctx.moveTo(x - sd * 6, y - 1); ctx.quadraticCurveTo(x, y + 1.5, x + sd * 6, y - 0.5); ctx.stroke();
      } else if (kind === 'paw') {
        line(ctx, [x - 2.6, y + 1.5, x - 2.6, y + 5.2], rgba(a.c.dark, 0.85), 1.3);
        line(ctx, [x + 2.6, y + 1.5, x + 2.6, y + 5.2], rgba(a.c.dark, 0.85), 1.3);
        if (a.pawC) dot(ctx, x, y - 1, 2.2, a.pawC);
      }
    });
  }
  function songLines(ctx, s) {
    if (s < 0.05) return;
    ctx.save(); ctx.globalAlpha *= clamp01(s * 1.5); ctx.lineCap = 'round';
    [[11, 1], [17.5, 0.8]].forEach(function (q, i) {
      var r = q[0], cx = 23, cy = HY - 12;
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 5.4; ctx.beginPath(); ctx.arc(cx, cy, r, -0.85, 0.15); ctx.stroke();
      ctx.strokeStyle = '#5B6B9A'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(cx, cy, r, -0.85, 0.15); ctx.stroke();
      if (!i) {
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 5.4; ctx.beginPath(); ctx.arc(-cx, cy, r, Math.PI - 0.15, Math.PI + 0.85); ctx.stroke();
        ctx.strokeStyle = '#5B6B9A'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(-cx, cy, r, Math.PI - 0.15, Math.PI + 0.85); ctx.stroke();
      }
    });
    ctx.restore();
  }
  var ANIMAL = {
    g: 'animal',
    col: function () { return WOOD; },
    headBox: function (name) {
      return bbox('head.' + name, function (t) { headParts(t, AN[name]); });
    },
    box: function (th) {
      var name = animalOf(th), hb = this.headBox(name), gb = geoBox(GEO.animal), pad = BORDER + 0.4;
      var w = Math.max(gb.w, 2 * Math.max(-(hb.x - pad), hb.x + hb.w + pad), 2 * (PAWX + 10 + BORDER));
      var h = Math.max(gb.h, -(HY + hb.y - pad));
      return { w: Math.min(100, w), h: Math.min(100, h), cy: -Math.min(100, h) / 2 };
    },
    sil: function (t, th) {     // the head parts only (the drum has its own silhouette)
      var name = animalOf(th);
      var a = AN[name];
      a.parts.forEach(function (p) { var q = { moveTo: function (x, y) { t.moveTo(x, y + HY); }, lineTo: function (x, y) { t.lineTo(x, y + HY); },
        quadraticCurveTo: function (a1, b1, x, y) { t.quadraticCurveTo(a1, b1 + HY, x, y + HY); },
        bezierCurveTo: function (a1, b1, a2, b2, x, y) { t.bezierCurveTo(a1, b1 + HY, a2, b2 + HY, x, y + HY); },
        ellipse: function (x, y, rx, ry, r, a0, a1, ccw) { t.ellipse(x, y + HY, rx, ry, r, a0, a1, ccw); },
        arc: function (x, y, r, a0, a1, ccw) { t.arc(x, y + HY, r, a0, a1, ccw); }, closePath: function () { t.closePath(); } };
        p[1](q); });
    },
    draw: function (ctx, th, o) {
      var name = animalOf(th), open = clamp01(o.sing);
      ctx.save(); ctx.translate(0, HY - 1.5 * open); drawHead(ctx, name, open); ctx.restore();
      standDrum(ctx, 'animal', WOOD, o);
      drawPaws(ctx, name);
      songLines(ctx, open);
    }
  };

  var K = { drum: DRUM, shape: SHAPED, big: BIG, dots: DOTS, animal: ANIMAL, glyph: GLYPH };
  function kindOf(th) { return K[th && th.kind] || DRUM; }
  function boxU(th) {           // design-unit box {w, h, cy}
    var Kd = kindOf(th);
    if (Kd.box) return Kd.box(th);
    var b = geoBox(GEO[Kd.g]);
    return { w: Math.min(100, b.w), h: Math.min(100, b.h), cy: -b.h / 2 };
  }
  function silOf(Kd, th) { return Kd.sil ? function (t) { Kd.sil(t, th); } : gp(Kd.g, 'sil'); }

  // ================================================================= PUBLIC: drums
  function bodyBox(thing, size) {
    size = num(size, 112);
    var b = boxU(thing || {}), s = size / 100;
    return { w: Math.min(size, b.w * s), h: Math.min(size, b.h * s), cy: b.cy * s };
  }
  function thingKey(t) {
    if (!t) return '?';
    return [t.kind, t.color || '', t.shape || '', t.n != null ? t.n : '', t.animal || '', t.text != null ? t.text : ''].join(':');
  }

  function drawDrum(ctx, thing, size, opt) {
    if (!ctx || !thing) return;
    size = num(size, 112); if (!(size > 0)) return;
    var o = opt || {}, Kd = kindOf(thing), pop = o.pop == null ? 1 : Math.max(0, Math.min(1.5, num(o.pop, 1)));
    if (pop <= 0.001) return;
    var b = boxU(thing), c = Kd.col(thing), s = size / 100 * pop;
    var glow = clamp01(o.glow), dull = !!(+o.dull), ring = dull ? 0 : clamp01(o.ring), dim = clamp01(o.dim), night = clamp01(o.night);
    var sq = Math.max(0.5, Math.min(1.5, num(o.sq, 1))), sx = 1 / Math.sqrt(sq);
    var g = GEO[Kd.g], cy = b.cy, sil = Kd === ANIMAL ? P('sil.head.' + animalOf(thing), silOf(Kd, thing)) : null;
    ctx.save();
    ctx.scale(s, s);
    if (dim > 0) ctx.globalAlpha *= 1 - 0.55 * dim;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // soft gold halo (not squashed)
    if (glow > 0.01) {
      var R = 64 + 16 * glow;
      var gr = ctx.createRadialGradient(0, cy, R * 0.2, 0, cy, R);
      gr.addColorStop(0, 'rgba(255,230,140,' + (0.75 * glow).toFixed(3) + ')');
      gr.addColorStop(0.55, 'rgba(255,214,100,' + (0.42 * glow).toFixed(3) + ')');
      gr.addColorStop(1, 'rgba(255,210,90,0)');
      ctx.fillStyle = gr; ctx.beginPath(); circ(ctx, 0, cy, R); ctx.fill();
    }
    ctx.scale(sx, sq);
    // rims behind the body: gold glow, cool moonlight (never darkens the body), white strike flash.
    // Animals: the head silhouette carries the sticker border, so its rim is that much wider.
    var dsil = P('g.' + Kd.g + '.sil', gp(Kd.g, 'sil'));
    var rim = function (col, w, dx, dy) {
      ctx.save(); ctx.translate(dx || 0, dy || 0); ctx.strokeStyle = col;
      ctx.lineWidth = w; strokeP(ctx, dsil);
      if (Kd === ANIMAL) { ctx.lineWidth = w + 2 * BORDER; strokeP(ctx, sil); }
      ctx.restore();
    };
    if (glow > 0.01) rim('rgba(255,236,160,' + (0.9 * glow).toFixed(3) + ')', 8 + 6 * glow);
    if (night > 0.01) rim('rgba(205,220,255,' + (0.32 * night).toFixed(3) + ')', 4.5, -1.2, -1.4);
    if (ring > 0.01) rim('rgba(255,255,255,' + (0.9 * ring).toFixed(3) + ')', 5 + 8 * ring);
    FLASH = ring;
    try { Kd.draw(ctx, thing, o); } finally { FLASH = 0; }
    // moonlight inside the body: a cool rim along the upper-left edge
    if (night > 0.01) {
      var pb = P('g.' + Kd.g + '.body', gp(Kd.g, 'body'));
      ctx.save(); clipP(ctx, pb);
      ctx.translate(2.6, 2.2); ctx.strokeStyle = 'rgba(214,226,255,' + (0.55 * night).toFixed(3) + ')'; ctx.lineWidth = 3; strokeP(ctx, pb);
      ctx.restore();
    }
    // sound rings rising from the skin: )) (( arcs on both sides, expanding and fading
    if (ring > 0.01) {
      var ac = c === WOOD || c === CREAM ? GOLD : c, H = rh(g);
      for (var k = 0; k < 3; k++) {
        var f = (1 - ring) * 0.9 + k * 0.22, a = ring * (1 - k * 0.26);
        if (a < 0.03) continue;
        var rx = H * (0.86 + 0.34 * f), ry = rx * 0.55, yy = g.yt - 6 - f * 14, span = 0.5 - k * 0.07;
        for (var side = 0; side < 2; side++) {
          var a0 = side ? -span : Math.PI - span, a1 = side ? span : Math.PI + span;
          ctx.strokeStyle = rgba(ac.base, a * 0.85); ctx.lineWidth = 5.4;
          ctx.beginPath(); ctx.ellipse(0, yy, rx, ry, 0, a0, a1); ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,' + (a * 0.95).toFixed(3) + ')'; ctx.lineWidth = 2.2;
          ctx.beginPath(); ctx.ellipse(0, yy, rx, ry, 0, a0, a1); ctx.stroke();
        }
      }
      sparkle(ctx, H * 0.62, g.yt - 14 - 10 * (1 - ring), 4 + 5 * ring, 'rgba(255,255,255,' + (0.95 * ring).toFixed(3) + ')');
    }
    ctx.restore();
  }

  // ================================================================= CLOUD CUSHION
  // designed for w = 100 units, top centre at (0, 0) (the middle puffs bulge a little above it, hidden behind the drum), bottom ≈ 29
  var PUFFS = [[-37, 14, 10.5], [-19, 8.5, 12], [4, 6.5, 13.5], [25, 9.5, 11.5], [40, 15, 8.5], [-26, 20, 8.5], [22, 20, 9], [-2, 20.5, 8.5]];
  function cloudPath(t, dent, wob) {
    for (var i = 0; i < PUFFS.length; i++) {
      var q = PUFFS[i], ax = Math.min(1, Math.abs(q[0]) / 50), r = q[2] * (1 + 0.05 * dent * ax + 0.025 * Math.sin(wob + i * 1.7));
      circ(t, q[0] * (1 + 0.06 * dent), q[1] + dent * 2 * (1 - ax) * (i < 5 ? 1 : 0), Math.max(1, r));
    }
    rrect(t, -47, 9, 94, 16.5, 8.2);
  }
  function dipU(dent) { dent = clamp01(dent); return 33 - (33 - 1.84 * dent) * (1 - 0.12 * dent); }   // centre puff top −7, bottom 26
  function cushionDip(w, dent) { return num(w, 140) / 100 * dipU(dent); }
  function drawCloud(ctx, dent, wob, night, flatShadow) {
    var b = function (t) { cloudPath(t, dent, wob); };
    var base = mix(CLOUD.base, '#DCDAF2', 0.3 * night), shade = mix(CLOUD.shade, '#B9B6DE', 0.35 * night);
    ctx.lineJoin = 'round';
    if (flatShadow) oval(ctx, 0, 31, 38, 4.5, 0, 'rgba(140,120,190,' + (0.16 + 0.1 * night).toFixed(3) + ')');
    ctx.strokeStyle = CLOUD.line; ctx.lineWidth = 2 * 3.2; ctx.beginPath(); b(ctx); ctx.stroke();
    ctx.fillStyle = shade; ctx.beginPath(); b(ctx); ctx.fill();
    ctx.save(); ctx.beginPath(); b(ctx); ctx.clip();
    ctx.translate(-1.5, -5); ctx.fillStyle = base; ctx.beginPath(); b(ctx); ctx.fill(); ctx.translate(1.5, 5);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    [[-37, 7, 4.5, 2], [-19, 1.5, 5, 2.2], [3, -1.5, 6, 2.4], [24, 2.5, 4, 1.8]].forEach(function (h) { ctx.beginPath(); ell(ctx, h[0] - 2, h[1], h[2], h[3], -0.25); ctx.fill(); });
    if (night > 0.01) { ctx.strokeStyle = 'rgba(225,232,255,' + (0.6 * night).toFixed(3) + ')'; ctx.lineWidth = 2; ctx.translate(1.5, 2); ctx.beginPath(); b(ctx); ctx.stroke(); }
    ctx.restore();
  }
  /** a small round sky puff (garland ends), centred at the origin, ≈ 64 × 40 px */
  function drawPuff(ctx, wob, night) {
    var b = function (t) {
      [[-18, 6, 12], [0, -2, 16], [18, 5, 12], [-6, 9, 11], [9, 9, 11]].forEach(function (q, i) { circ(t, q[0], q[1], q[2] * (1 + 0.03 * Math.sin(wob + i))); });
    };
    var base = mix(CLOUD.base, '#DCDAF2', 0.3 * night), shade = mix(CLOUD.shade, '#B9B6DE', 0.35 * night);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = CLOUD.line; ctx.lineWidth = 5.6; ctx.beginPath(); b(ctx); ctx.stroke();
    ctx.fillStyle = shade; ctx.beginPath(); b(ctx); ctx.fill();
    ctx.save(); ctx.beginPath(); b(ctx); ctx.clip();
    ctx.translate(-1.5, -4.5); ctx.fillStyle = base; ctx.beginPath(); b(ctx); ctx.fill();
    oval(ctx, -5, -10, 6, 2.6, -0.3, 'rgba(255,255,255,0.9)');
    ctx.restore();
  }
  function drawCushion(ctx, x, y, w, opt) {
    if (!ctx) return;
    var o = opt || {}, W = num(w, 140); if (!(W > 0)) return;
    var pop = o.pop == null ? 1 : Math.max(0, Math.min(1.5, num(o.pop, 1))), al = o.alpha == null ? 1 : clamp01(o.alpha);
    if (pop <= 0.001 || al <= 0.001) return;
    var dent = clamp01(o.dent), s = W / 100;
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.globalAlpha *= al;
    ctx.translate(0, 13); ctx.scale(pop, pop); ctx.translate(0, -13);        // pop about the cushion's middle
    ctx.translate(0, 26); ctx.scale(1 + 0.08 * dent, 1 - 0.12 * dent); ctx.translate(0, -26);   // squish (bottom fixed)
    drawCloud(ctx, dent, num(o.t, 0) * 2.2, clamp01(o.night), true);
    ctx.restore();
  }

  // ================================================================= GARLAND + STAR LANTERNS
  var LANTERN_R = 22;
  function lanternRadius() { return LANTERN_R; }
  function drawLantern(ctx, L, R, night) {
    var lit = clamp01(L.lit), flash = clamp01(L.flash), c = L.color ? (pal(L.color) || GOLD) : GOLD;
    var tone = L.color ? c.light : '#FFE58A';
    ctx.save(); ctx.translate(L.x, L.y);
    if (lit > 0.01 || flash > 0.01) {
      var gR = R * (2.6 + 1.4 * flash), gc = mix(tone, '#FFF3B0', 0.3), g = ctx.createRadialGradient(0, 0, R * 0.3, 0, 0, gR);
      g.addColorStop(0, rgba(gc, Math.min(1, 0.7 * lit + 0.4 * flash)));
      g.addColorStop(0.45, rgba(gc, 0.25 * lit + 0.2 * flash));
      g.addColorStop(1, rgba(gc, 0));
      ctx.fillStyle = g; ctx.beginPath(); circ(ctx, 0, 0, gR); ctx.fill();
    }
    ctx.translate(0, -R); ctx.rotate(num(L.swing, 0)); ctx.translate(0, R);
    // a little silver loop where the star hangs on the string
    ctx.strokeStyle = SILVER.line; ctx.lineWidth = 2.6; ctx.beginPath(); circ(ctx, 0, -R - 2, 3); ctx.stroke();
    ctx.strokeStyle = SILVER.base; ctx.lineWidth = 1.2; ctx.beginPath(); circ(ctx, 0, -R - 2, 3); ctx.stroke();
    var st = function (q) { starPath(q, 0, 1, R, R * 0.5, R * 0.16); };
    if (lit > 0.01) {
      var fill = mix('#FFF8E4', tone, lit), bg = ctx.createRadialGradient(-R * 0.15, -R * 0.15, 1, 0, 0, R);
      bg.addColorStop(0, mix('#FFFFFF', fill, 0.3)); bg.addColorStop(0.7, fill); bg.addColorStop(1, mix(fill, c.base, 0.35 * lit));
      ctx.fillStyle = bg;
    } else ctx.fillStyle = 'rgba(255,250,236,0.85)';
    ctx.beginPath(); st(ctx); ctx.fill();
    ctx.strokeStyle = lit > 0.01 ? mix('#C9B07A', lineOf(c), lit) : '#C4AD7C'; ctx.lineWidth = 2.8; ctx.lineJoin = 'round';
    ctx.beginPath(); st(ctx); ctx.stroke();
    if (lit > 0.01) { ctx.fillStyle = 'rgba(255,255,255,' + (0.75 * lit).toFixed(3) + ')'; ctx.beginPath(); ell(ctx, -R * 0.22, -R * 0.12, R * 0.16, R * 0.1, -0.6); ctx.fill(); }
    if (night > 0.01 && lit < 0.5) { ctx.strokeStyle = 'rgba(220,230,255,' + (0.45 * night).toFixed(3) + ')'; ctx.lineWidth = 1.2; ctx.beginPath(); starPath(ctx, -0.8, 0, R - 2.5, R * 0.5 - 1.5, R * 0.14); ctx.stroke(); }
    if (flash > 0.01) {
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.9 * flash).toFixed(3) + ')'; ctx.lineWidth = 3; ctx.beginPath(); starPath(ctx, 0, 1, R + 4, R * 0.5 + 2.5, R * 0.2); ctx.stroke();
      sparkle(ctx, R * 0.85, -R * 0.75, 4 + 6 * flash, 'rgba(255,255,255,' + flash.toFixed(3) + ')');
      sparkle(ctx, -R * 0.95, R * 0.55, 2 + 4 * flash, 'rgba(255,255,255,' + (0.8 * flash).toFixed(3) + ')');
    }
    ctx.restore();
  }
  function drawGarland(ctx, garland, lanterns, opt) {
    if (!ctx || !garland) return;
    var o = opt || {}, g = garland, sag = num(g.sag, 22), mx = (g.x0 + g.x1) / 2, R = num(o.r, LANTERN_R), night = clamp01(o.night), t = num(o.t, 0);
    ctx.save(); ctx.lineCap = 'round';
    var str = function (x) { x.moveTo(g.x0, g.y); x.quadraticCurveTo(mx, g.y + 2 * sag, g.x1, g.y); };
    ctx.strokeStyle = SILVER.line; ctx.lineWidth = 3.2; ctx.beginPath(); str(ctx); ctx.stroke();
    ctx.strokeStyle = SILVER.base; ctx.lineWidth = 1.4; ctx.beginPath(); str(ctx); ctx.stroke();
    // two tiny clouds hold the ends of the string
    [g.x0, g.x1].forEach(function (x, i) {
      ctx.save(); ctx.translate(x + (i ? 8 : -8), g.y - 4); ctx.scale(1, 1); drawPuff(ctx, t * 1.4 + i * 2, night); ctx.restore();
    });
    var Ls = lanterns || [];
    for (var i = 0; i < Ls.length; i++) if (Ls[i]) drawLantern(ctx, Ls[i], R, night);
    ctx.restore();
  }

  // ================================================================= CYMBAL on a stand
  var CYM_H = 150;
  function drawCymbal(ctx, cym, opt) {
    if (!ctx || !cym) return;
    var o = opt || {}, s = cym.s != null ? num(cym.s, 1) : (cym.h ? num(cym.h, CYM_H) / CYM_H : 1);
    if (!(s > 0)) return;
    var tilt = num(o.tilt, 0), ring = clamp01(o.ring), night = clamp01(o.night), t = num(o.t, 0);
    ctx.save(); ctx.translate(num(cym.x, 0), num(cym.y, 0)); ctx.scale(s, s); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    oval(ctx, 0, -1, 34, 4.5, 0, 'rgba(120,100,170,0.18)');
    // tripod legs + pole (silver)
    [[-28, 0], [28, 0], [7, -4]].forEach(function (f) { line(ctx, [0, -30, f[0], f[1]], SILVER.line, 5.6); line(ctx, [0, -30, f[0], f[1]], SILVER.base, 3); });
    [[-28, 0], [28, 0]].forEach(function (f) { oval(ctx, f[0], f[1] - 1, 4.5, 2.4, 0, '#8E8AA0'); });
    line(ctx, [0, -26, 0, -92], SILVER.line, 7.2); line(ctx, [0, -26, 0, -92], SILVER.base, 4.4); line(ctx, [-1, -28, -1, -90], '#FFFFFF', 1.2);
    line(ctx, [0, -90, 0, -134], SILVER.line, 5); line(ctx, [0, -90, 0, -134], SILVER.base, 2.6);
    ctx.fillStyle = SILVER.base; ctx.strokeStyle = SILVER.line; ctx.lineWidth = 2;
    ctx.beginPath(); rrect(ctx, -4.5, -96, 9, 8, 2.5); ctx.fill(); ctx.stroke();            // height clamp
    ctx.beginPath(); rrect(ctx, -4, -34, 8, 8, 2.5); ctx.fill(); ctx.stroke();               // leg joint
    // the brass cymbal (tilts about the top of the pole)
    ctx.save(); ctx.translate(0, -134); ctx.rotate(tilt);
    var disc = function (q) { ell(q, 0, 0, 48, 10.5, 0); };
    cel(ctx, 'cym.disc', disc, BRASS, {
      s: 2.6, lw: 3, hl: false,
      inner: function (x) {
        x.strokeStyle = rgba(BRASS.dark, 0.35); x.lineWidth = 1;
        [36, 26, 17].forEach(function (r) { x.beginPath(); ell(x, 0, -0.5, r, r * 0.22, 0); x.stroke(); });
        x.fillStyle = 'rgba(255,255,255,0.55)'; x.beginPath(); ell(x, -24, -3, 13, 2.2, -0.05); x.fill();
        var sh = 0.5 + 0.5 * Math.sin(t * 2.3);
        x.fillStyle = 'rgba(255,250,225,' + (0.25 + 0.25 * sh).toFixed(3) + ')'; x.beginPath(); ell(x, 22, -1, 6, 1.6, 0); x.fill();
      }
    });
    cel(ctx, 'cym.bell', function (q) { ell(q, 0, -3.5, 12.5, 6, 0); }, BRASS, { s: 1.6, lw: 2.4, hl: [-4, -6, 4, 1.6, -0.2] });
    ctx.fillStyle = '#8E8AA0'; ctx.strokeStyle = '#5E5A70'; ctx.lineWidth = 1.4;
    ctx.beginPath(); rrect(ctx, -4.5, -12.5, 9, 5, 2); ctx.fill(); ctx.stroke();            // felt + wing nut
    if (night > 0.01) { ctx.strokeStyle = 'rgba(214,226,255,' + (0.7 * night).toFixed(3) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, -1, 46, 9, 0, Math.PI * 0.95, Math.PI * 1.7); ctx.stroke(); }
    if (ring > 0.01) {
      for (var k = 0; k < 3; k++) {
        var f = (1 - ring) * 0.9 + k * 0.25, a = ring * (1 - k * 0.28), rx = 52 + f * 36;
        if (a < 0.03) continue;
        ctx.strokeStyle = rgba(BRASS.light, a * 0.9); ctx.lineWidth = 5; ctx.beginPath(); ell(ctx, 0, 0, rx, rx * 0.24 + 4, 0); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,' + (a * 0.9).toFixed(3) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ell(ctx, 0, 0, rx, rx * 0.24 + 4, 0); ctx.stroke();
      }
      sparkle(ctx, -30, -10, 4 + 6 * ring, 'rgba(255,255,255,' + ring.toFixed(3) + ')');
      sparkle(ctx, 34, -6, 3 + 5 * ring, 'rgba(255,255,255,' + (0.9 * ring).toFixed(3) + ')');
    }
    ctx.restore();
    ctx.restore();
  }

  // ================================================================= NUMBER CARD (beat mode)
  function cardDots(n) {
    var out = [], i, one = n <= 5, top = one ? n : Math.ceil(n / 2), sp = n <= 3 ? 22 : one ? 17 : 13.4, r = n <= 3 ? 8.2 : one ? 6.9 : 5.4;
    for (i = 0; i < n; i++) {
      var row = one ? 0 : (i < top ? 0 : 1), inRow = row ? n - top : top, col = row ? i - top : i;
      out.push([(col - (inRow - 1) / 2) * sp, one ? 28 : 21 + row * 14.5, r]);
    }
    return out;
  }
  function cardFace(ctx, n, lit, flash) {
    var w = n <= 3 ? 80 : 96, h = 100, txt = String(n);
    ctx.lineJoin = 'round';
    ctx.fillStyle = 'rgba(90,70,120,0.18)'; ctx.beginPath(); rrect(ctx, -w / 2 + 2, -h / 2 + 4, w, h, 16); ctx.fill();
    if (flash > 0.01) { ctx.strokeStyle = 'rgba(255,236,150,' + (0.8 * flash).toFixed(3) + ')'; ctx.lineWidth = 6 + 10 * flash; ctx.beginPath(); rrect(ctx, -w / 2, -h / 2, w, h, 16); ctx.stroke(); }
    var card = function (q) { rrect(q, -w / 2, -h / 2, w, h, 16); };
    cel(ctx, 'card.' + w, card, { base: '#FFF8EC', dark: '#B89B72', light: '#FFFFFF' }, { s: -2.6, shade: '#EBDCC0', lw: 3.2, hl: false });
    ctx.strokeStyle = 'rgba(184,155,114,0.35)'; ctx.lineWidth = 1.6; ctx.beginPath(); rrect(ctx, -w / 2 + 6, -h / 2 + 6, w - 12, h - 12, 11); ctx.stroke();
    carvedText(ctx, txt, 0, n > 5 ? -20 : -17, txt.length > 1 ? 64 : 48, n > 5 ? 36 : 40, INK);
    var D = cardDots(n);
    for (var i = 0; i < D.length; i++) {
      var d = D[i], on = i < lit;
      if (on) {
        var gr = ctx.createRadialGradient(d[0], d[1], 1, d[0], d[1], d[2] * 3);
        gr.addColorStop(0, 'rgba(255,225,120,0.85)'); gr.addColorStop(1, 'rgba(255,225,120,0)');
        ctx.fillStyle = gr; ctx.beginPath(); circ(ctx, d[0], d[1], d[2] * 3); ctx.fill();
        var r = d[2] * 1.22;
        dot(ctx, d[0], d[1], r, STAR.base); ctx.strokeStyle = STAR.dark; ctx.lineWidth = 1.8; ctx.beginPath(); circ(ctx, d[0], d[1], r); ctx.stroke();
        oval(ctx, d[0] - r * 0.3, d[1] - r * 0.35, r * 0.34, r * 0.22, -0.6, 'rgba(255,255,255,0.9)');
      } else {
        dot(ctx, d[0], d[1], d[2], '#F3E6CF'); ctx.strokeStyle = '#B89B72'; ctx.lineWidth = 1.8; ctx.beginPath(); circ(ctx, d[0], d[1], d[2]); ctx.stroke();
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
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    cardFace(ctx, N, lit, flash);
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

  // ================================================================= FIREFLY → night twinkle star
  function drawFirefly(ctx, x, y, r, glow) {
    if (!ctx) return;
    r = num(r, 4); var gl = clamp01(glow == null ? 1 : glow);
    if (!(r > 0)) return;
    ctx.save(); ctx.translate(x, y); ctx.lineJoin = 'round';
    var gr = r * (4 + 2.5 * gl), g = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, gr);
    g.addColorStop(0, 'rgba(255,243,176,' + (0.85 * gl).toFixed(3) + ')');
    g.addColorStop(0.35, 'rgba(255,243,176,' + (0.32 * gl).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(255,243,176,0)');
    ctx.fillStyle = g; ctx.beginPath(); circ(ctx, 0, 0, gr); ctx.fill();
    if (gl > 0.05) {   // twinkle rays
      ctx.strokeStyle = 'rgba(255,250,220,' + (0.7 * gl).toFixed(3) + ')'; ctx.lineWidth = Math.max(0.6, r * 0.22); ctx.lineCap = 'round';
      var L = r * (2.2 + 1.2 * gl);
      ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(L, 0); ctx.moveTo(0, -L); ctx.lineTo(0, L); ctx.stroke();
    }
    ctx.fillStyle = mix('#F2D98A', '#FFF9D8', gl); ctx.strokeStyle = mix('#C9A84E', '#E8C766', gl); ctx.lineWidth = Math.max(0.6, r * 0.22);
    ctx.beginPath(); starPath(ctx, 0, r * 0.08, r * 1.45, r * 0.68, r * 0.22); ctx.fill(); ctx.stroke();
    dot(ctx, -r * 0.35, -r * 0.3, r * 0.26, 'rgba(255,255,255,0.9)');
    ctx.restore();
  }

  // ================================================================= ICON
  function drawIcon(ctx, thing, size) {
    if (!ctx || !thing) return;
    size = num(size, 100); if (!(size > 0)) return;
    var t = thing, k = t.kind;
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (K[k]) {
      var bu = boxU(t), sz = size * 0.9 * 100 / Math.max(bu.w, bu.h, 60);
      ctx.translate(0, -bu.cy * sz / 100); drawDrum(ctx, t, sz, {});
    } else if (k === 'letter') {
      var th = { kind: 'glyph', text: t.text, color: t.color }, bg = boxU(th), sg = size * 0.9 * 100 / Math.max(bg.w, bg.h);
      ctx.translate(0, -bg.cy * sg / 100); drawDrum(ctx, th, sg, {});
    } else if (k === 'number') {
      var n = Math.round(num(t.n != null ? t.n : t.text, 1)), s1 = size / 100;
      ctx.scale(s1, s1);
      if (n >= 1 && n <= 12) { ctx.scale(0.9, 0.9); cardFace(ctx, n, 0, 0); }
      else {
        cel(ctx, 'ic.card', function (q) { rrect(q, -40, -46, 80, 92, 16); }, { base: '#FFF8EC', dark: '#B89B72', light: '#FFFFFF' }, { s: -2.6, shade: '#EBDCC0', lw: 3, hl: false });
        carvedText(ctx, String(n), 0, 0, 66, 56, INK);
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
      var big = t.big === true || t.size === 'big', inner = { kind: 'drum', color: t.color || 'red' }, ib = boxU(inner);
      if (big) { var sb = size * 0.92; ctx.translate(0, -ib.cy * sb / 100); drawDrum(ctx, inner, sb, {}); }
      else {
        ctx.strokeStyle = 'rgba(120,100,80,0.28)'; ctx.setLineDash && ctx.setLineDash([5, 5]); ctx.lineWidth = 2;
        ctx.beginPath(); rrect(ctx, -size * 0.44, -size * 0.44, size * 0.88, size * 0.88, size * 0.12); ctx.stroke(); ctx.setLineDash && ctx.setLineDash([]);
        ctx.translate(0, size * 0.4); drawDrum(ctx, inner, size * 0.5, {});
      }
    } else if (k === 'sound' || k === 'head') {
      var name = animalOf(t), hb = ANIMAL.headBox(name), ext = Math.max(hb.w, hb.h) + 2 * BORDER, s3 = size * 0.9 / ext;
      ctx.scale(s3, s3); ctx.translate(-(hb.x + hb.w / 2), -(hb.y + hb.h / 2));
      drawHead(ctx, name, clamp01(t.sing));
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
    // cuff: Bibi's white sailor collar cloth with a slate trim stripe
    ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = '#5B6478'; ctx.lineWidth = s * 0.035;
    ctx.beginPath(); rrect(ctx, -s * 0.25, s * 0.76, s * 0.46, s * 0.15, s * 0.06); ctx.fill(); ctx.stroke();
    line(ctx, [-s * 0.2, s * 0.835, s * 0.16, s * 0.835], '#5B6478', s * 0.025);
    ctx.restore();
  }

  function clearCache() { pcache = {}; pN = 0; bcache = {}; }

  CD.DrumArt = {
    drawDrum: drawDrum, bodyBox: bodyBox, drawCushion: drawCushion, cushionDip: cushionDip, drawGarland: drawGarland,
    drawCymbal: drawCymbal, drawCard: drawCard, drawNote: drawNote, drawIcon: drawIcon, drawGhostHand: drawGhostHand,
    drawFirefly: drawFirefly,
    pal: function (n) { return pal(n) || null; }, PALETTE: FALLBACK, BRASS: BRASS, WOOD: WOOD, SILVER: SILVER, SKIN: SKIN,
    CLOUD: CLOUD, FONT: FONT, SHAPES: SHAPES, ANIMALS: ANIMALS, KINDS: KINDS, CYMBAL_H: CYM_H,
    thingKey: thingKey, lanternRadius: lanternRadius, clearCache: clearCache
  };
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
