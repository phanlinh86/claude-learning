/* Pom's Puzzle Town — PZ.PuzzleArt (character artist B), DESIGN §3 / §4.2. Everything here is drawn by code on a 2D canvas.
 *
 *   drawPiece(ctx, thing, size, opt)   origin = piece CENTRE, size = the piece's longest side (px).
 *       thing = { kind: 'obj'|'shape'|'bunch'|'dots'|'animal'|'glyph', obj?, color?, shape?, n?, animal?, text? }
 *       opt   = { glow 0..1 (gold halo), lift 0..1 (drop shadow below), dim 0..1, count -1|0..n (lit balloons / dots),
 *                 alive 0..1 (the "comes alive" pose), season 0..3, t (s, optional idle phase for alive) }
 *   drawShadow(ctx, thing, size, opt)  the empty slot: EXACTLY the piece's silhouette (same paths / same text drawing),
 *       styled per §3 (rgba(40,36,60,.30) fill, 4 px darker inner rim, inner bevel, dashed light outline 10/8).
 *       opt = { glow 0..1 (pulsing gold rim), alpha 0..1 }
 *   pieceBox(thing, size) → { w, h }   the visible bounding box; max(w, h) === size (the longest side is `size`).
 *   drawBoard(ctx, board, scene, season, opt)   origin = board top-left; board = { w, h, r, frame? }. Wooden frame OUTSIDE
 *       (thickness opt.frame || board.frame || 22), picture inside clipped to the rounded rect. scene ∈ street | shapes |
 *       balloons | park | letters | size. opt = { shine 0..1, alive 0..1, t (s), frame }
 *   drawTray(ctx, tray, season, opt)   tray = layout.tray { x, y, w, h, spots? } in the CURRENT coordinates (not translated);
 *       opt = { item (px, for the spot dimples; default 112), t }
 *   drawBubble(ctx, r, opt)            soap bubble, origin = centre; opt = { pop 0..1 (0 whole … 1 gone), t }
 *   drawIcon(ctx, thing, size)         centred in a size × size box: any piece thing, or number {n} | color {color} |
 *                                      size {big, obj?, color?, animal?} | letter {text}
 *   drawGhostHand(ctx, size, press)    friendly pointing hand, origin = fingertip (finger points UP-LEFT), press 0..1
 *   Helpers: pal(color), PALETTE, FONT, OBJECTS, SHAPES, ANIMALS, SCENES, thingKey(thing), clearCache().
 *
 * How it works: every piece is designed in a ~100-unit box; its silhouette is a list of path builders (or, for glyphs, the
 * very same fillText/strokeText calls). geom() measures that silhouette once and scales it so the longest side is exactly
 * `size`. Shadows, the lift drop shadow and the glow halo are rendered from ONE opaque mask of that silhouette into small
 * cached offscreen canvases (erode / dilate by shifted copies) — so they match the piece pixel for pixel and inner part
 * edges never show. Path2D objects are cached per part (size-independent, the ctx is scaled); layers per thing+size+dpr.
 * Node-safe at load (no DOM); without Path2D / document (node tests) paths are rebuilt on the ctx and shadows are vector.
 */
(function (G) {
  'use strict';
  var PZ = G.PZ = G.PZ || {};

  var TAU = Math.PI * 2, LW = 3.6;           // outline width in the 100-unit design box (≈ 4 px at 112)
  var FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", Nunito, "Arial Black", system-ui, sans-serif';
  var GLYPH_FONT = '900 100px ' + FONT;
  var FALLBACK = {
    red:    { base: '#E84A4A', dark: '#A8282E', light: '#F7A0A0' },
    blue:   { base: '#3C8DE8', dark: '#1F5BA8', light: '#A6CCF5' },
    yellow: { base: '#FFD23F', dark: '#C99A12', light: '#FFEB9C' },
    green:  { base: '#4CC26B', dark: '#2A8343', light: '#A8E6B8' },
    orange: { base: '#FF9A2E', dark: '#C4650C', light: '#FFCB8E' },
    purple: { base: '#8E44AD', dark: '#6840A8', light: '#D2BDF3' },
    pink:   { base: '#FF8FC0', dark: '#C9558A', light: '#FFCCE2' }
  };
  var NEUTRAL = { base: '#E9D7B9', dark: '#A8875E', light: '#F7EEDD' };
  var OBJECTS = ['car', 'bus', 'balloon', 'kite', 'umbrella', 'house', 'flower', 'hat'];
  var SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'rect', 'diamond', 'oval'];
  var ANIMALS = ['duck', 'cat', 'dog', 'cow', 'pig', 'frog', 'lion', 'rabbit'];
  var SCENES = ['street', 'shapes', 'balloons', 'park', 'letters', 'size'];
  var BUNCH_COLORS = ['red', 'yellow', 'blue', 'green', 'orange'];
  var EYE = '#2F2A3A', CHEEK = '#F4A9A0';
  // neutral detail palettes (never an answer colour)
  var N = {
    cream: { base: '#FFF3DC', dark: '#B89B72', light: '#FFFFFF' },
    glass: { base: '#DCEEF6', dark: '#7F98AA', light: '#FFFFFF' },
    tyre:  { base: '#4E4C5A', dark: '#2C2A36', light: '#7A788C' },
    hub:   { base: '#DEDCE5', dark: '#8E8C9C', light: '#FFFFFF' },
    wood:  { base: '#C99560', dark: '#7A5232', light: '#E8C092' },
    roof:  { base: '#B07A5A', dark: '#74482F', light: '#D8A585' },
    stem:  { base: '#8FB383', dark: '#5B7D52', light: '#C5DDB9' },
    seed:  { base: '#B07A4A', dark: '#6E4626', light: '#D9A877' },
    string: '#9C8B7A', grey: { base: '#CFCBD6', dark: '#8A8696', light: '#F2F0F5' }
  };

  // ---------------------------------------------------------------- colour helpers
  function rgb(h) { h = String(h).replace('#', ''); return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]; }
  function mix(a, b, t) {
    var A = rgb(a), B = rgb(b), o = '#';
    for (var i = 0; i < 3; i++) { var v = Math.round(A[i] + (B[i] - A[i]) * t); o += (v < 16 ? '0' : '') + v.toString(16); }
    return o.toUpperCase();
  }
  function rgba(hex, a) { var c = rgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (+a).toFixed(3) + ')'; }
  function clamp01(v) { v = +v || 0; return v < 0 ? 0 : v > 1 ? 1 : v; }
  function num(v, d) { v = +v; return Number.isFinite ? (Number.isFinite(v) ? v : d) : (isFinite(v) ? v : d); }
  function pal(name) {
    var P = PZ.PALETTE, c = P && P[name] && P[name].base ? P[name] : FALLBACK[name];
    return c || NEUTRAL;
  }
  function lineOf(c) { return c.base === '#FFD23F' ? '#A87E0A' : c.dark; }     // yellow gets a deeper outline so it reads
  function shadeOf(c) { return mix(c.base, c.dark, 0.36); }

  // ---------------------------------------------------------------- path recorder (bbox) + Path2D cache
  function Rec() { this.c = []; this.x0 = 1e9; this.y0 = 1e9; this.x1 = -1e9; this.y1 = -1e9; this.px = 0; this.py = 0; }
  Rec.prototype._p = function (x, y) { if (x < this.x0) this.x0 = x; if (x > this.x1) this.x1 = x; if (y < this.y0) this.y0 = y; if (y > this.y1) this.y1 = y; };
  Rec.prototype.moveTo = function (x, y) { this.c.push(['moveTo', x, y]); this._p(x, y); this.px = x; this.py = y; };
  Rec.prototype.lineTo = function (x, y) { this.c.push(['lineTo', x, y]); this._p(x, y); this.px = x; this.py = y; };
  Rec.prototype.quadraticCurveTo = function (cx, cy, x, y) {
    this.c.push(['quadraticCurveTo', cx, cy, x, y]);
    for (var i = 1; i <= 8; i++) { var t = i / 8, u = 1 - t; this._p(u * u * this.px + 2 * u * t * cx + t * t * x, u * u * this.py + 2 * u * t * cy + t * t * y); }
    this.px = x; this.py = y;
  };
  Rec.prototype.bezierCurveTo = function (ax, ay, bx, by, x, y) {
    this.c.push(['bezierCurveTo', ax, ay, bx, by, x, y]);
    for (var i = 1; i <= 12; i++) {
      var t = i / 12, u = 1 - t;
      this._p(u * u * u * this.px + 3 * u * u * t * ax + 3 * u * t * t * bx + t * t * t * x, u * u * u * this.py + 3 * u * u * t * ay + 3 * u * t * t * by + t * t * t * y);
    }
    this.px = x; this.py = y;
  };
  Rec.prototype.ellipse = function (x, y, rx, ry, rot, a0, a1, ccw) {
    this.c.push(['ellipse', x, y, rx, ry, rot, a0, a1, !!ccw]);
    var d = a1 - a0;
    if (!ccw) { while (d < 0) d += TAU; } else { while (d > 0) d -= TAU; }
    if (Math.abs(d) > TAU) d = d > 0 ? TAU : -TAU;
    var cr = Math.cos(rot), sr = Math.sin(rot), ex, ey;
    for (var i = 0; i <= 32; i++) {
      var a = a0 + d * i / 32; ex = rx * Math.cos(a); ey = ry * Math.sin(a);
      this._p(x + ex * cr - ey * sr, y + ex * sr + ey * cr);
    }
    this.px = x + ex * cr - ey * sr; this.py = y + ex * sr + ey * cr;
  };
  Rec.prototype.arc = function (x, y, r, a0, a1, ccw) {
    this.ellipse(x, y, r, r, 0, a0, a1, ccw); this.c[this.c.length - 1] = ['arc', x, y, r, a0, a1, !!ccw];
  };
  Rec.prototype.closePath = function () { this.c.push(['closePath']); };
  Rec.prototype.rect = function (x, y, w, h) { this.c.push(['rect', x, y, w, h]); this._p(x, y); this._p(x + w, y + h); };
  Rec.prototype.replay = function (t) { for (var i = 0; i < this.c.length; i++) { var q = this.c[i]; t[q[0]].apply(t, q.slice(1)); } };

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
  function poly(t, pts) { t.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) t.lineTo(pts[i][0], pts[i][1]); t.closePath(); }

  function hasP2D() { return typeof Path2D !== 'undefined'; }
  var pcache = {}, pN = 0, bcache = {};
  function P(key, build) {
    if (!hasP2D()) return build;
    var p = pcache[key];
    if (!p) { if (pN > 2500) { pcache = {}; pN = 0; } p = pcache[key] = new Path2D(); build(p); pN++; }
    return p;
  }
  function fillP(ctx, p, rule) { if (typeof p === 'function') { ctx.beginPath(); p(ctx); ctx.fill(rule || 'nonzero'); } else ctx.fill(p, rule || 'nonzero'); }
  function strokeP(ctx, p) { if (typeof p === 'function') { ctx.beginPath(); p(ctx); ctx.stroke(); } else ctx.stroke(p); }
  function clipP(ctx, p) { if (typeof p === 'function') { ctx.beginPath(); p(ctx); ctx.clip(); } else ctx.clip(p); }
  function bbox(key, build) { var b = bcache[key]; if (!b) { var r = new Rec(); build(r); b = bcache[key] = { x: r.x0, y: r.y0, w: r.x1 - r.x0, h: r.y1 - r.y0 }; } return b; }

  /** fill + optional outline */
  function part(ctx, key, build, fill, line, lw) {
    var p = P(key, build);
    if (fill) { ctx.fillStyle = fill; fillP(ctx, p); }
    if (line) { ctx.strokeStyle = line; ctx.lineWidth = lw || LW; strokeP(ctx, p); }
    return p;
  }
  /** one-step cel shading: base, a shade crescent lower-right, a soft highlight upper-left, the outline */
  function cel(ctx, key, build, c, o) {
    o = o || {};
    var p = P(key, build), b = bbox(key, build), s = o.s != null ? o.s : Math.max(2.5, Math.min(7, Math.min(b.w, b.h) * 0.12));
    ctx.fillStyle = c.base; fillP(ctx, p);
    ctx.save(); clipP(ctx, p);
    ctx.fillStyle = o.shade || shadeOf(c); ctx.fillRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
    ctx.translate(-s, -s * 1.1); ctx.fillStyle = c.base; fillP(ctx, p); ctx.translate(s, s * 1.1);
    if (o.hl !== false) {
      var h = o.hl || [b.x + b.w * 0.3, b.y + b.h * 0.26, Math.max(2, b.w * 0.13), Math.max(1.5, b.h * 0.08), -0.6];
      ctx.fillStyle = o.hlc || rgba(mix(c.light, '#FFFFFF', 0.45), 0.9);
      ctx.beginPath(); ell(ctx, h[0], h[1], h[2], h[3], h[4] || 0); ctx.fill();
    }
    if (o.inner) o.inner(ctx);
    ctx.restore();
    if (o.line !== false) { ctx.strokeStyle = o.line || lineOf(c); ctx.lineWidth = o.lw || LW; strokeP(ctx, p); }
    return p;
  }
  function stroke(ctx, build, col, w) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); build(ctx); ctx.stroke(); }
  function dot(ctx, x, y, r, col) { ctx.fillStyle = col; ctx.beginPath(); circ(ctx, x, y, r); ctx.fill(); }
  function oval(ctx, x, y, rx, ry, rot, col) { ctx.fillStyle = col; ctx.beginPath(); ell(ctx, x, y, rx, ry, rot); ctx.fill(); }

  // ---------------------------------------------------------------- faces
  function eye(ctx, x, y, r, happy) {
    if (happy > 0.5) {   // ^ ^ happy closed eye
      ctx.strokeStyle = EYE; ctx.lineWidth = r * 0.75; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - r, y + r * 0.35); ctx.quadraticCurveTo(x, y - r * 1.1, x + r, y + r * 0.35); ctx.stroke();
      return;
    }
    oval(ctx, x, y, r, r * 1.18, 0, EYE);
    dot(ctx, x - r * 0.32, y - r * 0.42, r * 0.42, '#FFFFFF');
    dot(ctx, x + r * 0.35, y + r * 0.4, r * 0.16, 'rgba(255,255,255,0.8)');
  }
  function cheeks(ctx, x1, x2, y, r) { oval(ctx, x1, y, r, r * 0.62, 0, rgba(CHEEK, 0.75)); oval(ctx, x2, y, r, r * 0.62, 0, rgba(CHEEK, 0.75)); }
  function smile(ctx, x, y, w, open, col) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (open > 0.3) {
      ctx.fillStyle = '#7A2E3A'; ctx.beginPath(); ctx.moveTo(x - w, y); ctx.quadraticCurveTo(x, y + w * 1.6 * open, x + w, y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#F28B9A'; ctx.beginPath(); ell(ctx, x, y + w * 0.75 * open, w * 0.45, w * 0.3 * open, 0); ctx.fill();
      ctx.strokeStyle = col || '#5A3A3A'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - w, y); ctx.quadraticCurveTo(x, y + w * 1.6 * open, x + w, y); ctx.closePath(); ctx.stroke();
    } else {
      ctx.strokeStyle = col || '#5A3A3A'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(x - w, y); ctx.quadraticCurveTo(x, y + w * 0.9, x + w, y); ctx.stroke();
    }
  }
  function tileFace(ctx, x, y, s, line) {   // the cute face a shape / flower gets when it comes alive
    eye(ctx, x - s * 0.42, y - s * 0.12, s * 0.17, 1);
    eye(ctx, x + s * 0.42, y - s * 0.12, s * 0.17, 1);
    cheeks(ctx, x - s * 0.7, x + s * 0.7, y + s * 0.16, s * 0.16);
    smile(ctx, x, y + s * 0.16, s * 0.26, 0.9, line);
  }

  // ================================================================= OBJECTS (thing.color)
  function wheel(ctx, key, x, y, r, spin) {
    part(ctx, key, function (t) { circ(t, x, y, r); }, N.tyre.base, N.tyre.dark, LW);
    ctx.strokeStyle = rgba(N.tyre.light, 0.8); ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(x, y, r * 0.78, Math.PI * 1.05, Math.PI * 1.55); ctx.stroke();
    part(ctx, key + 'h', function (t) { circ(t, x, y, r * 0.46); }, N.hub.base, N.hub.dark, 2);
    ctx.fillStyle = N.hub.dark;
    for (var i = 0; i < 4; i++) { var a = spin + i * TAU / 4; dot(ctx, x + Math.cos(a) * r * 0.25, y + Math.sin(a) * r * 0.25, r * 0.07 + 0.4, N.hub.dark); }
  }
  function glassWin(ctx, key, build) {
    var b = bbox(key, build);
    part(ctx, key, build, N.glass.base, null);
    ctx.save(); clipP(ctx, P(key, build));
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = Math.max(1.6, b.w * 0.16);
    ctx.beginPath(); ctx.moveTo(b.x + b.w * 0.2, b.y + b.h * 0.95); ctx.lineTo(b.x + b.w * 0.65, b.y - b.h * 0.05); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = N.glass.dark; ctx.lineWidth = 2.2; strokeP(ctx, P(key, build));
  }

  var carBody = function (t) { rpoly(t, [[-48, 22], [-48, 2], [-40, -5], [-24, -7], [-14, -29], [16, -29], [29, -7], [44, -3], [49, 6], [49, 22]], [6, 6, 8, 8, 9, 9, 8, 8, 6, 6]); };
  var carWinF = function (t) { rpoly(t, [[1, -24], [13, -24], [22, -9], [1, -9]], 3); };
  var carWinB = function (t) { rpoly(t, [[-10, -24], [-4, -24], [-4, -9], [-19, -9]], 3); };
  var carW1 = function (t) { circ(t, -26, 22, 12.5); }, carW2 = function (t) { circ(t, 27, 22, 12.5); };
  var busBody = function (t) { rrect(t, -50, -36, 100, 58, 12); };
  var busSign = function (t) { rrect(t, -22, -44, 34, 10, 4); };
  var busW1 = function (t) { circ(t, -29, 23, 11.5); }, busW2 = function (t) { circ(t, 30, 23, 11.5); };
  var balloonBody = function (t) {
    t.moveTo(0, 20); t.bezierCurveTo(-18, 12, -32, -6, -32, -20); t.bezierCurveTo(-32, -40, -17, -50, 0, -50);
    t.bezierCurveTo(17, -50, 32, -40, 32, -20); t.bezierCurveTo(32, -6, 18, 12, 0, 20); t.closePath();
  };
  var balloonKnot = function (t) { rpoly(t, [[0, 18], [6, 27], [-6, 27]], 2); };
  var balloonString = function (t) { t.moveTo(0, 26); t.bezierCurveTo(9, 34, -8, 42, 3, 51); };
  var KITE = [[-6, -50], [28, -26], [2, 14], [-36, -18]], KC = [-3, -22];
  var kiteQuad = function (t) { rpoly(t, KITE, 4); };
  var kiteTail = function (t) { t.moveTo(2, 14); t.bezierCurveTo(16, 26, 18, 44, 44, 46); };
  function bez(p0, p1, p2, p3, s) { var u = 1 - s; return [u * u * u * p0[0] + 3 * u * u * s * p1[0] + 3 * u * s * s * p2[0] + s * s * s * p3[0], u * u * u * p0[1] + 3 * u * u * s * p1[1] + 3 * u * s * s * p2[1] + s * s * s * p3[1]]; }
  var TAILP = [[2, 14], [16, 26], [18, 44], [44, 46]];
  function bowB(x, y, r, rot) {
    return function (t) {
      var c = Math.cos(rot), s = Math.sin(rot);
      function R(px, py) { return [x + px * c - py * s, y + px * s + py * c]; }
      rpoly(t, [R(0, 0), R(-r, -r * 0.75), R(-r, r * 0.75)], 1.4);
      rpoly(t, [R(0, 0), R(r, -r * 0.75), R(r, r * 0.75)], 1.4);
    };
  }
  var kiteBows = [0.42, 0.72].map(function (s, i) { var p = bez(TAILP[0], TAILP[1], TAILP[2], TAILP[3], s); return bowB(p[0], p[1], 6, 0.5 + i * 0.4); });
  var umbCanopy = function (t) {
    t.moveTo(-48, 0); t.bezierCurveTo(-48, -30, -26, -46, 0, -46); t.bezierCurveTo(26, -46, 48, -30, 48, 0);
    for (var i = 0; i < 4; i++) { var x0 = 48 - 24 * i, x1 = x0 - 24; t.quadraticCurveTo((x0 + x1) / 2, -12, x1, 0); }
    t.closePath();
  };
  var umbKnob = function (t) { circ(t, 0, -48, 4); };
  var umbShaft = function (t) { t.moveTo(0, -4); t.lineTo(0, 36); t.arc(-8, 36, 8, 0, Math.PI, false); };
  var houseBody = function (t) { rrect(t, -34, -8, 68, 52, 5); };
  var houseRoof = function (t) { rpoly(t, [[-47, -3], [0, -46], [47, -3]], [6, 8, 6]); };
  var houseChim = function (t) { rrect(t, 19, -44, 12, 24, 2.5); };
  var houseDoor = function (t) { t.moveTo(-9, 44); t.lineTo(-9, 24); t.arc(0, 24, 9, Math.PI, 0); t.lineTo(9, 44); t.closePath(); };
  var houseWinL = function (t) { rrect(t, -28, 4, 14, 14, 3); }, houseWinR = function (t) { rrect(t, 14, 4, 14, 14, 3); };
  var houseAttic = function (t) { circ(t, 0, -19, 6.5); };
  var PETALS = []; for (var pi = 0; pi < 6; pi++) PETALS.push([Math.cos(pi * TAU / 6 - Math.PI / 2) * 19, -22 + Math.sin(pi * TAU / 6 - Math.PI / 2) * 19]);
  var flowerPetal = PETALS.map(function (p) { return function (t) { circ(t, p[0], p[1], 14.5); }; });
  var flowerCentre = function (t) { circ(t, 0, -22, 12.5); };
  var flowerStem = function (t) { t.moveTo(0, -10); t.quadraticCurveTo(-5, 20, 0, 50); };
  var flowerLeafL = function (t) { ell(t, -13, 25, 13, 6.5, -0.55); }, flowerLeafR = function (t) { ell(t, 13, 33, 13, 6.5, 0.55); };
  var hatBrim = function (t) { ell(t, 0, 16, 50, 12, 0); };
  var hatCrown = function (t) { t.moveTo(-28, 15); t.bezierCurveTo(-31, -24, -18, -36, 0, -36); t.bezierCurveTo(18, -36, 31, -24, 28, 15); t.closePath(); };

  var OBJ = {
    car: { sil: [carBody, carW1, carW2], draw: function (ctx, c, o) {
      if (o.alive > 0.05) {   // headlight beam
        ctx.fillStyle = rgba('#FFF6C8', 0.55 * o.alive); ctx.beginPath(); ctx.moveTo(46, 4); ctx.lineTo(70, -6); ctx.lineTo(70, 16); ctx.closePath(); ctx.fill();
      }
      cel(ctx, 'car.body', carBody, c, { s: 5, hl: [-26, -2, 11, 3, -0.08] });
      glassWin(ctx, 'car.wf', carWinF); glassWin(ctx, 'car.wb', carWinB);
      ctx.lineCap = 'round'; stroke(ctx, function (t) { t.moveTo(-2, -5); t.lineTo(-2, 15); }, lineOf(c), 2);
      stroke(ctx, function (t) { t.moveTo(4, 0); t.lineTo(9, 0); }, lineOf(c), 2.4);
      part(ctx, 'car.hl', function (t) { ell(t, 44.5, 4, 3.2, 4.4, 0); }, '#FFF3C2', lineOf(c), 1.8);
      part(ctx, 'car.tl', function (t) { rrect(t, -49, 3, 4.5, 7, 2); }, c.light, lineOf(c), 1.6);
      var spin = (o.alive || 0) * TAU * 1.5;
      wheel(ctx, 'car.w1', -26, 22, 12.5, spin); wheel(ctx, 'car.w2', 27, 22, 12.5, spin);
    } },
    bus: { sil: [busSign, busBody, busW1, busW2], draw: function (ctx, c, o) {
      part(ctx, 'bus.sign', busSign, N.cream.base, N.cream.dark, 2.6);
      stroke(ctx, function (t) { t.moveTo(-15, -39); t.lineTo(4, -39); }, N.cream.dark, 2);
      cel(ctx, 'bus.body', busBody, c, { s: 5, hl: [-30, -30, 12, 2.6, 0], inner: function (x) {
        x.fillStyle = c.light; x.fillRect(-52, 1, 104, 6);
        x.fillStyle = N.grey.base; x.fillRect(-52, 14, 104, 8);
        x.strokeStyle = N.grey.dark; x.lineWidth = 1.6; x.beginPath(); x.moveTo(-52, 14); x.lineTo(52, 14); x.stroke();
      } });
      for (var i = 0; i < 3; i++) (function (i) { glassWin(ctx, 'bus.w' + i, function (t) { rrect(t, -43 + i * 15, -29, 12, 16, 3); }); })(i);
      glassWin(ctx, 'bus.door', function (t) { rrect(t, 4, -29, 13, 41, 3); });
      stroke(ctx, function (t) { t.moveTo(10.5, -27); t.lineTo(10.5, 10); }, N.glass.dark, 1.6);
      glassWin(ctx, 'bus.ws', function (t) { rrect(t, 31, -29, 15, 25, 4); });
      part(ctx, 'bus.hl', function (t) { ell(t, 46.5, 7, 2.8, 3.8, 0); }, '#FFF3C2', lineOf(c), 1.6);
      var spin = (o.alive || 0) * TAU * 1.5;
      wheel(ctx, 'bus.w1', -29, 23, 11.5, spin); wheel(ctx, 'bus.w2', 30, 23, 11.5, spin);
    } },
    balloon: { sil: [balloonBody, balloonKnot, { b: balloonString, w: 2.6 }], draw: function (ctx, c, o) {
      var sw = (o.alive || 0) * Math.sin((o.t || 0) * 5) * 6;
      ctx.lineCap = 'round';
      stroke(ctx, function (t) { t.moveTo(0, 26); t.bezierCurveTo(9 + sw, 34, -8 - sw, 42, 3 + sw * 0.5, 51); }, N.string, 2.6);
      cel(ctx, 'bal.body', balloonBody, c, { s: 6, hl: [-15, -32, 6, 11, 0.5] });
      dot(ctx, -21, -16, 2.6, rgba('#FFFFFF', 0.7));
      part(ctx, 'bal.knot', balloonKnot, c.dark, lineOf(c), 2.2);
    } },
    kite: { sil: [kiteQuad, { b: kiteTail, w: 2.6 }].concat(kiteBows), draw: function (ctx, c, o) {
      var sw = (o.alive || 0) * Math.sin((o.t || 0) * 6) * 6;
      ctx.lineCap = 'round';
      stroke(ctx, function (t) { t.moveTo(2, 14); t.bezierCurveTo(16 + sw, 26, 18 - sw, 44, 44, 46); }, N.string, 2.6);
      cel(ctx, 'kite.q', kiteQuad, c, { s: 4, hl: false, inner: function (x) {
        x.fillStyle = c.light;
        x.beginPath(); x.moveTo(KITE[0][0], KITE[0][1]); x.lineTo(KITE[1][0], KITE[1][1]); x.lineTo(KC[0], KC[1]); x.closePath(); x.fill();
        x.beginPath(); x.moveTo(KITE[2][0], KITE[2][1]); x.lineTo(KITE[3][0], KITE[3][1]); x.lineTo(KC[0], KC[1]); x.closePath(); x.fill();
        x.strokeStyle = N.wood.dark; x.lineWidth = 2.2;
        x.beginPath(); x.moveTo(KITE[0][0], KITE[0][1]); x.lineTo(KITE[2][0], KITE[2][1]); x.moveTo(KITE[1][0], KITE[1][1]); x.lineTo(KITE[3][0], KITE[3][1]); x.stroke();
        x.fillStyle = 'rgba(255,255,255,0.6)'; x.beginPath(); ell(x, -18, -26, 4, 7, 0.9); x.fill();
      } });
      kiteBows.forEach(function (b, i) { part(ctx, 'kite.bow' + i, b, N.cream.base, N.cream.dark, 2); });
      if (o.alive > 0.3) tileFace(ctx, -4, -20, 13 * Math.min(1, o.alive * 1.6), lineOf(c));
    } },
    umbrella: { sil: [umbCanopy, umbKnob, { b: umbShaft, w: 6.4 }], draw: function (ctx, c) {
      ctx.lineCap = 'round';
      stroke(ctx, umbShaft, N.wood.dark, 6.4); stroke(ctx, umbShaft, N.wood.base, 3.4);
      part(ctx, 'umb.knob', umbKnob, N.wood.base, N.wood.dark, 2.4);
      cel(ctx, 'umb.can', umbCanopy, c, { s: 5, hl: [-24, -30, 9, 4, -0.7], inner: function (x) {
        x.fillStyle = c.light;
        x.beginPath(); x.moveTo(0, -46); x.quadraticCurveTo(-12, -24, -24, 0); x.lineTo(-48, 0); x.bezierCurveTo(-48, -30, -26, -46, 0, -46); x.fill();
        x.beginPath(); x.moveTo(0, -46); x.quadraticCurveTo(12, -24, 24, 0); x.lineTo(0, 0); x.quadraticCurveTo(2, -24, 0, -46); x.fill();
        x.strokeStyle = lineOf(c); x.lineWidth = 2;
        x.beginPath(); x.moveTo(0, -46); x.quadraticCurveTo(-12, -24, -24, 0); x.moveTo(0, -46); x.quadraticCurveTo(2, -24, 0, 0);
        x.moveTo(0, -46); x.quadraticCurveTo(12, -24, 24, 0); x.stroke();
      } });
    } },
    house: { sil: [houseChim, houseBody, houseRoof], draw: function (ctx, c, o) {
      var warm = o.alive > 0.05 || o.season === 3;
      if (o.alive > 0.05) {   // a puff of chimney smoke
        var a = o.alive, ph = ((o.t || 0) * 0.8) % 1;
        oval(ctx, 25 + ph * 6, -50 - ph * 10, 5 + ph * 3, 4 + ph * 2.5, 0, rgba('#FFFFFF', 0.8 * a * (1 - ph)));
        oval(ctx, 23, -50, 4, 3.4, 0, rgba('#FFFFFF', 0.75 * a));
      }
      cel(ctx, 'h.chim', houseChim, N.roof, { s: 2.5, hl: false });
      cel(ctx, 'h.body', houseBody, c, { s: 6, hl: false });
      cel(ctx, 'h.roof', houseRoof, N.roof, { s: 5, hl: [-18, -22, 9, 3, -0.75], inner: function (x) {
        x.strokeStyle = N.roof.dark; x.lineWidth = 1.6;
        for (var i = 0; i < 3; i++) { var y = -30 + i * 9; x.beginPath(); x.moveTo(-60, y); x.lineTo(60, y); x.stroke(); }
        if (o.season === 3) {
          x.fillStyle = '#FFFFFF'; x.beginPath(); x.moveTo(-40, -4); x.lineTo(0, -45); x.lineTo(40, -4); x.lineTo(34, -6); x.quadraticCurveTo(14, -24, 0, -36); x.quadraticCurveTo(-14, -24, -34, -6); x.closePath(); x.fill();
        }
      } });
      var gw = warm ? '#FFE7A6' : null;
      [['h.wl', houseWinL], ['h.wr', houseWinR], ['h.at', houseAttic]].forEach(function (q) {
        if (gw) { part(ctx, q[0], q[1], gw, N.glass.dark, 2.2); } else glassWin(ctx, q[0], q[1]);
      });
      ctx.lineCap = 'round';
      stroke(ctx, function (t) { t.moveTo(-21, 4); t.lineTo(-21, 18); t.moveTo(-28, 11); t.lineTo(-14, 11); t.moveTo(21, 4); t.lineTo(21, 18); t.moveTo(14, 11); t.lineTo(28, 11); }, N.glass.dark, 1.6);
      cel(ctx, 'h.door', houseDoor, N.wood, { s: 2.5, hl: false });
      dot(ctx, 4.5, 33, 1.8, N.wood.dark);
      ctx.fillStyle = rgba(c.dark, 0.35); ctx.fillRect(-33, 40, 66, 3);
    } },
    flower: { sil: [{ b: flowerStem, w: 7.6 }, flowerLeafL, flowerLeafR].concat(flowerPetal, [flowerCentre]), draw: function (ctx, c, o) {
      ctx.lineCap = 'round';
      stroke(ctx, flowerStem, N.stem.dark, 7.6); stroke(ctx, flowerStem, N.stem.base, 4);
      cel(ctx, 'fl.ll', flowerLeafL, N.stem, { s: 2, hl: false }); cel(ctx, 'fl.lr', flowerLeafR, N.stem, { s: 2, hl: false });
      var L = lineOf(c);
      ctx.strokeStyle = L; ctx.lineWidth = LW * 2;
      flowerPetal.forEach(function (b, i) { strokeP(ctx, P('fl.p' + i, b)); });
      flowerPetal.forEach(function (b, i) { ctx.fillStyle = c.base; fillP(ctx, P('fl.p' + i, b)); });
      flowerPetal.forEach(function (b, i) {   // petal shading toward the centre + a little highlight
        var p = PETALS[i], dx = p[0] / 19, dy = (p[1] + 22) / 19;
        oval(ctx, p[0] - dx * 5, p[1] - dy * 5, 7, 7, 0, rgba(shadeOf(c), 0.55));
        oval(ctx, p[0] + dx * 4 - 3, p[1] + dy * 4 - 3, 4, 2.6, -0.6, rgba(mix(c.light, '#FFFFFF', 0.5), 0.85));
      });
      cel(ctx, 'fl.c', flowerCentre, N.seed, { s: 3 });
      if (o.alive > 0.3) tileFace(ctx, 0, -22, 10, N.seed.dark);
      else for (var k = 0; k < 6; k++) dot(ctx, Math.cos(k * 1.3) * 6, -22 + Math.sin(k * 1.3) * 6, 1.3, N.seed.light);
    } },
    hat: { sil: [hatBrim, hatCrown], draw: function (ctx, c, o) {
      cel(ctx, 'hat.brim', hatBrim, c, { s: 3, hl: [-32, 12, 10, 2.5, -0.1] });
      cel(ctx, 'hat.crown', hatCrown, c, { s: 5, hl: [-12, -24, 6, 7, 0.4], inner: function (x) {
        x.fillStyle = N.cream.base; x.fillRect(-40, 1, 80, 10);
        x.strokeStyle = N.cream.dark; x.lineWidth = 1.6; x.beginPath(); x.moveTo(-40, 1); x.lineTo(40, 1); x.moveTo(-40, 11); x.lineTo(40, 11); x.stroke();
      } });
      var w = (o.alive || 0) * Math.sin((o.t || 0) * 8) * 0.3;
      ctx.save(); ctx.translate(18, 6); ctx.rotate(w);
      part(ctx, 'hat.bowL', function (t) { ell(t, -5, -2, 6, 4, -0.4); }, N.cream.base, N.cream.dark, 1.8);
      part(ctx, 'hat.bowR', function (t) { ell(t, 5, -2, 6, 4, 0.4); }, N.cream.base, N.cream.dark, 1.8);
      part(ctx, 'hat.knot', function (t) { circ(t, 0, -1.5, 2.8); }, N.cream.light, N.cream.dark, 1.6);
      ctx.restore();
      ctx.strokeStyle = rgba('#FFFFFF', 0.6); ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 16, 44, 7.5, 0, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
    } }
  };

  // ================================================================= SHAPES (tiles)
  function starPts(R, r, n) { var p = []; for (var i = 0; i < n * 2; i++) { var a = -Math.PI / 2 + i * Math.PI / n, q = i % 2 ? r : R; p.push([Math.cos(a) * q, Math.sin(a) * q + 2]); } return p; }
  var SHAPE_B = {
    circle: function (t) { circ(t, 0, 0, 48); },
    square: function (t) { rrect(t, -46, -46, 92, 92, 15); },
    triangle: function (t) { rpoly(t, [[0, -44], [50, 40], [-50, 40]], 11); },
    star: function (t) { rpoly(t, starPts(51, 24, 5), 4.5); },
    heart: function (t) {
      t.moveTo(0, 44); t.bezierCurveTo(-28, 24, -50, 6, -50, -16); t.bezierCurveTo(-50, -36, -36, -46, -24, -46);
      t.bezierCurveTo(-12, -46, -3, -38, 0, -28); t.bezierCurveTo(3, -38, 12, -46, 24, -46);
      t.bezierCurveTo(36, -46, 50, -36, 50, -16); t.bezierCurveTo(50, 6, 28, 24, 0, 44); t.closePath();
    },
    rect: function (t) { rrect(t, -50, -33, 100, 66, 13); },
    diamond: function (t) { rpoly(t, [[0, -50], [38, 0], [0, 50], [-38, 0]], 8); },
    oval: function (t) { ell(t, 0, 0, 37, 50, 0); }
  };
  var SHAPE_FACE = { circle: 0, square: 0, triangle: 14, star: 4, heart: -6, rect: 0, diamond: 0, oval: 0 };
  function drawShapeTile(ctx, shape, c, o) {
    var b = SHAPE_B[shape] || SHAPE_B.circle, k = 'sh.' + (SHAPE_B[shape] ? shape : 'circle');
    part(ctx, k, b, mix(c.base, c.dark, 0.5), lineOf(c), LW);      // the bevel side
    ctx.save(); ctx.translate(-1.3, -2); ctx.scale(0.86, 0.86);
    cel(ctx, k, b, c, { s: 4, line: false, hl: false });
    ctx.strokeStyle = rgba(mix(c.light, '#FFFFFF', 0.4), 0.9); ctx.lineWidth = 2.4;
    ctx.save(); clipP(ctx, P(k, b)); ctx.translate(2.4, 2.8); strokeP(ctx, P(k, b)); ctx.restore();
    ctx.restore();
    var bb = bbox(k, b);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath(); ell(ctx, bb.x + bb.w * 0.3, bb.y + bb.h * 0.27 + (shape === 'triangle' ? 18 : shape === 'star' ? 14 : 0), Math.max(3, bb.w * 0.07), Math.max(2, bb.h * 0.04), -0.7); ctx.fill();
    if (o.alive > 0.3) tileFace(ctx, 0, SHAPE_FACE[shape] || 0, 22 * Math.min(1, o.alive * 1.6), lineOf(c));
  }

  // ================================================================= BUNCH of n balloons
  var BUNCH = {
    1: { r: 28, p: [[0, -22]] },
    2: { r: 22, p: [[-23, -16], [23, -20]] },
    3: { r: 19, p: [[-38, -6], [0, -28], [38, -6]] },
    4: { r: 16, p: [[-45, 0], [-17, -22], [17, -22], [45, 0]] },
    5: { r: 13, p: [[-35, -32], [0, -42], [35, -32], [-18, -2], [18, -2]] }
  };
  var bunchCache = {};
  function bunchDef(n) {
    n = Math.max(1, Math.min(5, Math.round(num(n, 1))));
    if (bunchCache[n]) return bunchCache[n];
    var B = BUNCH[n], r = B.r, knot = [0, 46], balls = [], strings = [], knots = [];
    B.p.forEach(function (p, i) {
      var cx = p[0], cy = p[1], ry = r * 1.15, bot = cy + ry;
      balls.push(function (t) { ell(t, cx, cy, r, ry, 0); });
      knots.push(function (t) { rpoly(t, [[cx, bot - 2], [cx + 4, bot + 5], [cx - 4, bot + 5]], 1.5); });
      strings.push(function (t) { t.moveTo(cx, bot + 4); t.quadraticCurveTo(cx * 0.55 + (i % 2 ? 4 : -4), (bot + knot[1]) / 2, knot[0], knot[1]); });
    });
    var bow = bowB(0, 46, 6, 0);
    var sil = [bow].concat(strings.map(function (s) { return { b: s, w: 2.4 }; }), knots, balls);
    return (bunchCache[n] = { n: n, r: r, B: B, balls: balls, strings: strings, knots: knots, bow: bow, sil: sil });
  }
  function drawBunch(ctx, n, o) {
    var d = bunchDef(n), cnt = o.count == null ? -1 : o.count, sw = (o.alive || 0) * Math.sin((o.t || 0) * 4);
    ctx.lineCap = 'round';
    d.strings.forEach(function (s) { stroke(ctx, s, N.string, 2.4); });
    d.B.p.forEach(function (p, i) {
      var c = pal(BUNCH_COLORS[i % 5]);
      ctx.save(); ctx.translate(p[0], p[1] + d.r * 1.15); ctx.rotate(sw * 0.08 * (i % 2 ? 1 : -1)); ctx.translate(-p[0], -(p[1] + d.r * 1.15));
      cel(ctx, 'bu' + d.n + '.b' + i, d.balls[i], c, { s: d.r * 0.2, hl: [p[0] - d.r * 0.42, p[1] - d.r * 0.5, d.r * 0.2, d.r * 0.34, 0.5] });
      part(ctx, 'bu' + d.n + '.k' + i, d.knots[i], c.dark, lineOf(c), 1.8);
      if (cnt > i) {
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 3.6; ctx.beginPath(); ell(ctx, p[0], p[1], d.r + 4.5, d.r * 1.15 + 4.5, 0); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,214,90,0.9)'; ctx.lineWidth = 1.6; ctx.beginPath(); ell(ctx, p[0], p[1], d.r + 7, d.r * 1.15 + 7, 0); ctx.stroke();
      }
      ctx.restore();
    });
    part(ctx, 'bu' + d.n + '.bow', d.bow, N.cream.base, N.cream.dark, 2);
    dot(ctx, 0, 46, 2.4, N.cream.dark);
  }

  // ================================================================= DOTS tile (1..12)
  var dotsCache = {};
  function dotsDef(n) {
    n = Math.max(0, Math.min(12, Math.round(num(n, 1))));
    if (dotsCache[n]) return dotsCache[n];
    var cols = Math.max(1, Math.min(n, 5)), rows = Math.max(1, Math.ceil(n / 5)), S = 18;
    var W = S * Math.max(cols, 2) + 26, H = S * Math.max(rows, 2) + 26, pts = [];
    for (var i = 0; i < n; i++) {
      var row = Math.floor(i / 5), col = i % 5, inRow = n <= 5 ? n : 5;
      var x0 = -(inRow - 1) * S / 2, y0 = -(rows - 1) * S / 2;
      pts.push([x0 + col * S, y0 + row * S]);
    }
    var tile = function (t) { rrect(t, -W / 2, -H / 2, W, H, 13); };
    return (dotsCache[n] = { n: n, W: W, H: H, pts: pts, r: n <= 2 ? 9 : 7.2, tile: tile, sil: [tile] });
  }
  function drawDots(ctx, n, o) {
    var d = dotsDef(n), T = { base: '#FFF6E6', dark: '#B89B72', light: '#FFFFFF' }, red = pal('red'), cnt = o.count == null ? -1 : o.count;
    cel(ctx, 'dt' + d.n, d.tile, T, { s: 3.5, hl: [-d.W / 2 + 12, -d.H / 2 + 9, 7, 2.6, -0.2] });
    ctx.strokeStyle = rgba('#D9C3A0', 0.9); ctx.lineWidth = 1.6; ctx.setLineDash([3, 3]);
    ctx.beginPath(); rrect(ctx, -d.W / 2 + 6, -d.H / 2 + 6, d.W - 12, d.H - 12, 8); ctx.stroke(); ctx.setLineDash([]);
    var bounce = (o.alive || 0);
    d.pts.forEach(function (p, i) {
      var y = p[1] - bounce * Math.max(0, Math.sin((o.t || 0) * 7 - i * 0.6)) * 3;
      if (cnt > i) { dot(ctx, p[0], y, d.r + 4, '#FFFFFF'); ctx.strokeStyle = '#FFC93C'; ctx.lineWidth = 2; ctx.beginPath(); circ(ctx, p[0], y, d.r + 4); ctx.stroke(); }
      dot(ctx, p[0] + 0.8, y + 1.2, d.r, red.dark);
      dot(ctx, p[0], y, d.r, red.base);
      ctx.strokeStyle = red.dark; ctx.lineWidth = 1.6; ctx.beginPath(); circ(ctx, p[0], y, d.r); ctx.stroke();
      dot(ctx, p[0] - d.r * 0.35, y - d.r * 0.38, d.r * 0.3, 'rgba(255,255,255,0.8)');
    });
  }

  // ================================================================= ANIMAL stickers
  var STK = 5.4;                      // sticker border (each side) in design units ≈ 6 px at 112
  var A = {};
  function C3(b, d, l) { return { base: b, dark: d, light: l }; }
  var AC = {
    duck: C3('#FFE07A', '#C79A2E', '#FFF4C4'), beak: C3('#F5A04A', '#B8611E', '#FFD0A0'),
    cat: C3('#F3B672', '#B5753A', '#FFE0B8'), catBelly: C3('#FFF1DC', '#C9A57A', '#FFFFFF'),
    dog: C3('#E3B47C', '#A0703E', '#F7DDB8'), dogEar: C3('#9A6440', '#5E3C20', '#C4906A'), muzzle: C3('#FFF3E2', '#C9A882', '#FFFFFF'),
    cow: C3('#FBF8F4', '#9A93A0', '#FFFFFF'), cowPatch: '#5A5060', cowNose: C3('#F6C6C0', '#C98C86', '#FFE4E0'), horn: C3('#F3E3BF', '#B49E70', '#FFFFFF'),
    pig: C3('#F7B6C2', '#C9788A', '#FFDDE4'), snout: C3('#F294A8', '#C0647A', '#FFC6D2'),
    frog: C3('#93CC7E', '#5A9049', '#C9E8B9'), frogBelly: C3('#EAF4CF', '#9DB57E', '#FFFFFF'),
    lion: C3('#EEC47C', '#B98A3E', '#FBE3B4'), mane: C3('#C98B4A', '#8A5628', '#E7B57E'),
    rabbit: C3('#F4F0F2', '#A79FAE', '#FFFFFF'), earIn: '#F6C2CC'
  };
  // --- duck (side view, facing right)
  A.duck = (function () {
    var tail = function (t) { rpoly(t, [[-26, 6], [-47, -6], [-36, 22]], 5); };
    var body = function (t) { ell(t, -2, 22, 36, 24, 0); };
    var head = function (t) { circ(t, 14, -16, 24); };
    var beak = function (t) { rpoly(t, [[30, -20], [52, -13], [30, -5]], 4); };
    var footL = function (t) { ell(t, -10, 46, 9, 4, 0); }, footR = function (t) { ell(t, 12, 46, 9, 4, 0); };
    return { sil: [tail, footL, footR, body, head, beak], draw: function (ctx, o) {
      var c = AC.duck, al = o.alive || 0;
      cel(ctx, 'du.fl', footL, AC.beak, { s: 1.5, hl: false }); cel(ctx, 'du.fr', footR, AC.beak, { s: 1.5, hl: false });
      cel(ctx, 'du.t', tail, c, { s: 3, hl: false });
      cel(ctx, 'du.b', body, c, { s: 6, hl: [-18, 8, 8, 4, -0.4] });
      ctx.save(); ctx.translate(-6, 22); ctx.rotate(-0.25 - al * 0.35 * Math.abs(Math.sin((o.t || 0) * 9)));
      cel(ctx, 'du.w', function (t) { ell(t, 0, 0, 17, 11, 0); }, c, { s: 3, hl: false, shade: shadeOf(c) });
      ctx.restore();
      cel(ctx, 'du.h', head, c, { s: 5, hl: [4, -30, 6, 4, -0.6] });
      stroke(ctx, function (t) { t.moveTo(10, -40); t.quadraticCurveTo(12, -48, 18, -46); }, c.dark, 2.6);
      cel(ctx, 'du.k', beak, AC.beak, { s: 2, hl: false });
      stroke(ctx, function (t) { t.moveTo(32, -12.5); t.quadraticCurveTo(40, -11 + al * 3, 48, -12.5); }, AC.beak.dark, 1.8);
      eye(ctx, 20, -21, 4.4, al);
      oval(ctx, 16, -7, 5, 3, 0, rgba(CHEEK, 0.8));
    } };
  })();
  // --- cat (sitting, front)
  A.cat = (function () {
    var tail = function (t) { t.moveTo(18, 40); t.bezierCurveTo(48, 42, 50, 14, 40, 2); };
    var body = function (t) { ell(t, 0, 25, 27, 23, 0); };
    var earL = function (t) { rpoly(t, [[-29, -22], [-25, -50], [-6, -36]], [4, 5, 4]); };
    var earR = function (t) { rpoly(t, [[29, -22], [25, -50], [6, -36]], [4, 5, 4]); };
    var head = function (t) { ell(t, 0, -14, 31, 26, 0); };
    var pawL = function (t) { ell(t, -11, 45, 9, 5.5, 0); }, pawR = function (t) { ell(t, 11, 45, 9, 5.5, 0); };
    return { sil: [{ b: tail, w: 11.5 }, body, pawL, pawR, earL, earR, head], draw: function (ctx, o) {
      var c = AC.cat, al = o.alive || 0;
      ctx.lineCap = 'round'; stroke(ctx, tail, c.dark, 11.5); stroke(ctx, tail, c.base, 7.9);
      cel(ctx, 'ca.b', body, c, { s: 5, hl: false, inner: function (x) { oval(x, 0, 30, 15, 16, 0, AC.catBelly.base); } });
      cel(ctx, 'ca.pl', pawL, AC.catBelly, { s: 1.5, hl: false }); cel(ctx, 'ca.pr', pawR, AC.catBelly, { s: 1.5, hl: false });
      cel(ctx, 'ca.el', earL, c, { s: 2, hl: false, inner: function (x) { x.fillStyle = '#F6C2BE'; x.beginPath(); rpoly(x, [[-24, -27], [-23, -44], [-11, -35]], 3); x.fill(); } });
      cel(ctx, 'ca.er', earR, c, { s: 2, hl: false, inner: function (x) { x.fillStyle = '#F6C2BE'; x.beginPath(); rpoly(x, [[24, -27], [23, -44], [11, -35]], 3); x.fill(); } });
      cel(ctx, 'ca.h', head, c, { s: 5, hl: [-16, -28, 7, 4, -0.5], inner: function (x) {
        x.strokeStyle = shadeOf(c); x.lineWidth = 2.6; x.lineCap = 'round';
        x.beginPath(); x.moveTo(-6, -38); x.lineTo(-5, -31); x.moveTo(0, -40); x.lineTo(0, -32); x.moveTo(6, -38); x.lineTo(5, -31); x.stroke();
        oval(x, 0, -3, 13, 9, 0, AC.catBelly.base);
      } });
      eye(ctx, -12, -15, 4.8, al); eye(ctx, 12, -15, 4.8, al);
      cheeks(ctx, -20, 20, -5, 5);
      ctx.fillStyle = '#E98A94'; ctx.beginPath(); rpoly(ctx, [[-3.5, -7], [3.5, -7], [0, -3]], 1.5); ctx.fill();
      ctx.strokeStyle = '#6E4A3A'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, -3); ctx.quadraticCurveTo(-3, 1 + al * 2, -6, -1); ctx.moveTo(0, -3); ctx.quadraticCurveTo(3, 1 + al * 2, 6, -1); ctx.stroke();
      ctx.strokeStyle = rgba('#8A6A55', 0.8); ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(-10, -4); ctx.lineTo(-25, -7); ctx.moveTo(-10, -1); ctx.lineTo(-25, 1); ctx.moveTo(10, -4); ctx.lineTo(25, -7); ctx.moveTo(10, -1); ctx.lineTo(25, 1); ctx.stroke();
    } };
  })();
  // --- dog (sitting, front, floppy ears)
  A.dog = (function () {
    var tail = function (t) { t.moveTo(20, 38); t.quadraticCurveTo(40, 34, 42, 16); };
    var body = function (t) { ell(t, 0, 28, 23, 19, 0); };
    var head = function (t) { ell(t, 0, -16, 26, 24, 0); };
    var earL = function (t) { ell(t, -36, 2, 9, 19, 0.62); }, earR = function (t) { ell(t, 36, 2, 9, 19, -0.62); };
    var pawL = function (t) { ell(t, -11, 45, 9, 5.5, 0); }, pawR = function (t) { ell(t, 11, 45, 9, 5.5, 0); };
    return { sil: [{ b: tail, w: 10 }, body, pawL, pawR, head, earL, earR], draw: function (ctx, o) {
      var c = AC.dog, al = o.alive || 0, wag = al * Math.sin((o.t || 0) * 14) * 0.5;
      ctx.lineCap = 'round';
      ctx.save(); ctx.translate(20, 38); ctx.rotate(wag); ctx.translate(-20, -38);
      stroke(ctx, tail, c.dark, 10); stroke(ctx, tail, c.base, 6.4); ctx.restore();
      cel(ctx, 'do.b', body, c, { s: 5, hl: false, inner: function (x) { oval(x, 0, 32, 14, 14, 0, AC.muzzle.base); } });
      cel(ctx, 'do.pl', pawL, AC.muzzle, { s: 1.5, hl: false }); cel(ctx, 'do.pr', pawR, AC.muzzle, { s: 1.5, hl: false });
      cel(ctx, 'do.h', head, c, { s: 5, hl: [-12, -30, 7, 4, -0.4], inner: function (x) {
        oval(x, 13, -18, 10, 9, 0.3, mix(c.base, AC.dogEar.base, 0.45));   // eye patch
        oval(x, 0, -1, 16, 11, 0, AC.muzzle.base);
      } });
      cel(ctx, 'do.el', earL, AC.dogEar, { s: 2.5, hl: false }); cel(ctx, 'do.er', earR, AC.dogEar, { s: 2.5, hl: false });
      eye(ctx, -11, -15, 4.8, al); eye(ctx, 12, -15, 4.8, al);
      oval(ctx, 0, -7, 6.5, 4.6, 0, '#3A2E36'); dot(ctx, -2, -8.4, 1.6, 'rgba(255,255,255,0.8)');
      ctx.strokeStyle = '#5A3A30'; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(0, -2.5); ctx.lineTo(0, 1); ctx.quadraticCurveTo(-4, 5, -8, 2); ctx.moveTo(0, 1); ctx.quadraticCurveTo(4, 5, 8, 2); ctx.stroke();
      if (al > 0.3) { oval(ctx, 0, 7, 4, 5 * al, 0, '#F28B9A'); }
      cheeks(ctx, -20, 20, -3, 4.5);
    } };
  })();
  // --- cow (front)
  A.cow = (function () {
    var body = function (t) { ell(t, 0, 29, 27, 19, 0); };
    var head = function (t) { ell(t, 0, -10, 26, 25, 0); };
    var earL = function (t) { ell(t, -31, -18, 12, 6, 0.35); }, earR = function (t) { ell(t, 31, -18, 12, 6, -0.35); };
    var hornL = function (t) { rpoly(t, [[-18, -28], [-22, -44], [-9, -33]], [2, 3.5, 2]); };
    var hornR = function (t) { rpoly(t, [[18, -28], [22, -44], [9, -33]], [2, 3.5, 2]); };
    var nose = function (t) { ell(t, 0, 5, 21, 13, 0); };
    var hoofL = function (t) { ell(t, -11, 46, 8, 4.5, 0); }, hoofR = function (t) { ell(t, 11, 46, 8, 4.5, 0); };
    return { sil: [body, hoofL, hoofR, hornL, hornR, earL, earR, head, nose], draw: function (ctx, o) {
      var c = AC.cow, al = o.alive || 0;
      cel(ctx, 'co.hl', hoofL, C3('#6E6476', '#3E3646', '#9A90A2'), { s: 1.5, hl: false }); cel(ctx, 'co.hr', hoofR, C3('#6E6476', '#3E3646', '#9A90A2'), { s: 1.5, hl: false });
      cel(ctx, 'co.b', body, c, { s: 5, hl: false, inner: function (x) { oval(x, -14, 26, 10, 8, 0.4, AC.cowPatch); oval(x, 18, 34, 8, 7, 0, AC.cowPatch); } });
      cel(ctx, 'co.hnl', hornL, AC.horn, { s: 1.5, hl: false }); cel(ctx, 'co.hnr', hornR, AC.horn, { s: 1.5, hl: false });
      cel(ctx, 'co.el', earL, c, { s: 2, hl: false, inner: function (x) { oval(x, -31, -18, 7, 3, 0.35, '#F6C6C0'); } });
      cel(ctx, 'co.er', earR, c, { s: 2, hl: false, inner: function (x) { oval(x, 31, -18, 7, 3, -0.35, '#F6C6C0'); } });
      cel(ctx, 'co.h', head, c, { s: 4, hl: false, inner: function (x) {
        x.fillStyle = AC.cowPatch; x.beginPath(); x.moveTo(8, -36); x.quadraticCurveTo(26, -34, 26, -16); x.quadraticCurveTo(16, -12, 10, -20); x.quadraticCurveTo(2, -28, 8, -36); x.fill();
        oval(x, -16, -24, 5, 4, 0, AC.cowPatch);
      } });
      stroke(ctx, function (t) { t.moveTo(-4, -34); t.quadraticCurveTo(-2, -42, 3, -38); t.moveTo(1, -34); t.quadraticCurveTo(4, -41, 7, -36); }, '#6E6476', 2.2);
      cel(ctx, 'co.n', nose, AC.cowNose, { s: 2.5, hl: [-10, 0, 4, 2.4, -0.3] });
      oval(ctx, -7, 4, 2.6, 3.6, 0.2, AC.cowNose.dark); oval(ctx, 7, 4, 2.6, 3.6, -0.2, AC.cowNose.dark);
      smile(ctx, 0, 11, 6, al, AC.cowNose.dark);
      eye(ctx, -11, -15, 4.6, al); eye(ctx, 11, -15, 4.6, al);
    } };
  })();
  // --- pig (side view, facing right: snout disc, four stubby legs, curly tail — never confused with the cat)
  A.pig = (function () {
    var tail = function (t) { t.moveTo(-38, 2); t.bezierCurveTo(-48, -2, -50, 10, -44, 10); t.bezierCurveTo(-39, 10, -40, 2, -47, 0); };
    var legs = [[-30, 22], [-17, 24], [8, 24], [21, 22]].map(function (q) { return function (t) { rrect(t, q[0], q[1], 11, 18 - (q[1] - 22), 4.5); }; });
    var body = function (t) { ell(t, -6, 8, 36, 23, 0); };
    var head = function (t) { circ(t, 22, -10, 23); };
    var earB = function (t) { rpoly(t, [[4, -24], [5, -44], [17, -31]], [3, 4, 3]); };
    var earF = function (t) { rpoly(t, [[14, -29], [22, -48], [31, -31]], [3, 4, 3]); };
    var snout = function (t) { ell(t, 43, -5, 8, 10.5, 0); };
    return { sil: [{ b: tail, w: 3.4 }].concat(legs, [body, earB, head, earF, snout]), draw: function (ctx, o) {
      var c = AC.pig, al = o.alive || 0;
      ctx.lineCap = 'round'; stroke(ctx, tail, c.dark, 3.4);
      legs.forEach(function (l, i) { cel(ctx, 'pi.l' + i, l, i === 0 || i === 2 ? C3(mix(c.base, c.dark, 0.25), c.dark, c.light) : c, { s: 2, hl: false }); });
      cel(ctx, 'pi.eb', earB, C3(mix(c.base, c.dark, 0.3), c.dark, c.light), { s: 1.5, hl: false });
      cel(ctx, 'pi.b', body, c, { s: 6, hl: [-22, -4, 9, 4.5, -0.25] });
      cel(ctx, 'pi.h', head, c, { s: 5, hl: [12, -24, 6, 3.6, -0.6] });
      cel(ctx, 'pi.ef', earF, c, { s: 2, hl: false, inner: function (x) { x.fillStyle = AC.snout.base; x.beginPath(); rpoly(x, [[18, -32], [22, -43], [27, -32]], 2.5); x.fill(); } });
      cel(ctx, 'pi.s', snout, AC.snout, { s: 2, hl: [41, -10, 2.5, 3, 0] });
      oval(ctx, 41.5, -8, 1.8, 3, 0, AC.snout.dark); oval(ctx, 46, -3, 1.8, 3, 0, AC.snout.dark);
      eye(ctx, 27, -16, 4.4, al);
      oval(ctx, 26, -3, 5, 3, 0, rgba(CHEEK, 0.8));
      ctx.strokeStyle = AC.snout.dark; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(30, 4); ctx.quadraticCurveTo(34, 8 + al * 3, 38, 5); ctx.stroke();
    } };
  })();
  // --- frog (sitting, wide, big eyes on top)
  A.frog = (function () {
    var legL = function (t) { ell(t, -37, 30, 15, 10, -0.2); }, legR = function (t) { ell(t, 37, 30, 15, 10, 0.2); };
    var body = function (t) { ell(t, 0, 10, 42, 30, 0); };
    var eyeL = function (t) { circ(t, -21, -20, 14); }, eyeR = function (t) { circ(t, 21, -20, 14); };
    var feetL = function (t) { ell(t, -15, 40, 9, 4.5, 0); }, feetR = function (t) { ell(t, 15, 40, 9, 4.5, 0); };
    return { sil: [legL, legR, body, eyeL, eyeR, feetL, feetR], draw: function (ctx, o) {
      var c = AC.frog, al = o.alive || 0;
      cel(ctx, 'fr.ll', legL, c, { s: 3, hl: false }); cel(ctx, 'fr.lr', legR, c, { s: 3, hl: false });
      cel(ctx, 'fr.b', body, c, { s: 6, hl: false, inner: function (x) { oval(x, 0, 22, 24, 15, 0, AC.frogBelly.base); } });
      cel(ctx, 'fr.el', eyeL, c, { s: 3, hl: false }); cel(ctx, 'fr.er', eyeR, c, { s: 3, hl: false });
      [-21, 21].forEach(function (x) {
        if (al > 0.5) { eye(ctx, x, -19, 6.5, 1); return; }
        dot(ctx, x, -20, 9, '#FFFFFF'); ctx.strokeStyle = c.dark; ctx.lineWidth = 1.4; ctx.beginPath(); circ(ctx, x, -20, 9); ctx.stroke();
        eye(ctx, x + 1, -19, 5, 0);
      });
      cel(ctx, 'fr.fl', feetL, c, { s: 1.5, hl: false }); cel(ctx, 'fr.fr', feetR, c, { s: 1.5, hl: false });
      ctx.strokeStyle = c.dark; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
      if (al > 0.3) { smile(ctx, 0, 4, 18, 0.55 * al, c.dark); }
      else { ctx.beginPath(); ctx.moveTo(-19, 2); ctx.quadraticCurveTo(0, 15, 19, 2); ctx.stroke(); }
      cheeks(ctx, -27, 27, 4, 5);
      dot(ctx, -4, -6, 1.3, c.dark); dot(ctx, 4, -6, 1.3, c.dark);
    } };
  })();
  // --- lion (big round mane)
  A.lion = (function () {
    var MN = []; for (var i = 0; i < 9; i++) { var a = -Math.PI / 2 + i * TAU / 9; MN.push([Math.cos(a) * 34, -10 + Math.sin(a) * 34]); }
    var mane = MN.map(function (p) { return function (t) { circ(t, p[0], p[1], 13); }; });
    var maneC = function (t) { circ(t, 0, -10, 30); };
    var tail = function (t) { t.moveTo(18, 40); t.quadraticCurveTo(42, 42, 44, 22); };
    var tuft = function (t) { ell(t, 44, 19, 5.5, 7, 0.3); };
    var body = function (t) { ell(t, 0, 33, 22, 15, 0); };
    var pawL = function (t) { ell(t, -10, 46, 8, 4.5, 0); }, pawR = function (t) { ell(t, 10, 46, 8, 4.5, 0); };
    var face = function (t) { circ(t, 0, -10, 23); };
    var earL = function (t) { circ(t, -17, -29, 7); }, earR = function (t) { circ(t, 17, -29, 7); };
    return { sil: [{ b: tail, w: 6.6 }, tuft, body, pawL, pawR, maneC].concat(mane), draw: function (ctx, o) {
      var c = AC.lion, m = AC.mane, al = o.alive || 0;
      ctx.lineCap = 'round'; stroke(ctx, tail, c.dark, 6.6); stroke(ctx, tail, c.base, 3);
      cel(ctx, 'li.tf', tuft, m, { s: 1.5, hl: false });
      cel(ctx, 'li.b', body, c, { s: 4, hl: false });
      cel(ctx, 'li.pl', pawL, c, { s: 1.5, hl: false }); cel(ctx, 'li.pr', pawR, c, { s: 1.5, hl: false });
      ctx.strokeStyle = m.dark; ctx.lineWidth = LW * 2;
      mane.forEach(function (b, i) { strokeP(ctx, P('li.m' + i, b)); });
      ctx.fillStyle = m.base; mane.forEach(function (b, i) { fillP(ctx, P('li.m' + i, b)); }); fillP(ctx, P('li.mc', maneC));
      MN.forEach(function (p, i) { oval(ctx, p[0] * 1.06 + 3, p[1] + (p[1] + 10) * 0.06 + 3, 7.5, 7.5, 0, rgba(shadeOf(m), 0.6)); });
      oval(ctx, -22, -30, 6, 3.5, -0.7, rgba(m.light, 0.9));
      cel(ctx, 'li.el', earL, c, { s: 1.5, hl: false, inner: function (x) { dot(x, -17, -29, 3.5, '#F2B9A6'); } });
      cel(ctx, 'li.er', earR, c, { s: 1.5, hl: false, inner: function (x) { dot(x, 17, -29, 3.5, '#F2B9A6'); } });
      cel(ctx, 'li.f', face, c, { s: 4, hl: [-10, -24, 5, 3, -0.5], inner: function (x) { oval(x, 0, 0, 13, 9, 0, AC.muzzle.base); } });
      eye(ctx, -9, -14, 4.4, al); eye(ctx, 9, -14, 4.4, al);
      ctx.fillStyle = '#8A5240'; ctx.beginPath(); rpoly(ctx, [[-5, -5], [5, -5], [0, 1]], 2); ctx.fill();
      ctx.strokeStyle = '#6E4232'; ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(0, 1); ctx.quadraticCurveTo(-3, 5 + al * 2, -7, 3); ctx.moveTo(0, 1); ctx.quadraticCurveTo(3, 5 + al * 2, 7, 3); ctx.stroke();
      cheeks(ctx, -16, 16, -2, 4);
    } };
  })();
  // --- rabbit (sitting, long ears)
  A.rabbit = (function () {
    var earL = function (t) { ell(t, -11, -33, 8.5, 20, -0.14); }, earR = function (t) { ell(t, 11, -33, 8.5, 20, 0.14); };
    var tail = function (t) { circ(t, 23, 37, 7.5); };
    var body = function (t) { ell(t, 0, 31, 22, 17, 0); };
    var head = function (t) { ell(t, 0, -3, 24, 21, 0); };
    var footL = function (t) { ell(t, -12, 46, 9, 4.5, 0); }, footR = function (t) { ell(t, 12, 46, 9, 4.5, 0); };
    return { sil: [earL, earR, tail, body, footL, footR, head], draw: function (ctx, o) {
      var c = AC.rabbit, al = o.alive || 0, tw = al * Math.sin((o.t || 0) * 10) * 0.12;
      ctx.save(); ctx.translate(-11, -16); ctx.rotate(-tw); ctx.translate(11, 16);
      cel(ctx, 'ra.el', earL, c, { s: 2.5, hl: false, inner: function (x) { oval(x, -11, -32, 4.2, 14, -0.14, AC.earIn); } }); ctx.restore();
      ctx.save(); ctx.translate(11, -16); ctx.rotate(tw); ctx.translate(-11, 16);
      cel(ctx, 'ra.er', earR, c, { s: 2.5, hl: false, inner: function (x) { oval(x, 11, -32, 4.2, 14, 0.14, AC.earIn); } }); ctx.restore();
      cel(ctx, 'ra.t', tail, c, { s: 2, hl: false });
      cel(ctx, 'ra.b', body, c, { s: 5, hl: false });
      cel(ctx, 'ra.fl', footL, c, { s: 1.5, hl: false }); cel(ctx, 'ra.fr', footR, c, { s: 1.5, hl: false });
      cel(ctx, 'ra.h', head, c, { s: 4, hl: false });
      eye(ctx, -10, -6, 4.6, al); eye(ctx, 10, -6, 4.6, al);
      cheeks(ctx, -16, 16, 4, 4.5);
      ctx.fillStyle = '#E98A9A'; ctx.beginPath(); rpoly(ctx, [[-3.5, 2], [3.5, 2], [0, 5.5]], 1.5); ctx.fill();
      ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = c.dark; ctx.lineWidth = 1.2;
      ctx.beginPath(); rrect(ctx, -3, 9 + al, 6, 4.5, 1.2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#7A6A70'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(0, 5.5); ctx.quadraticCurveTo(-3, 9, -6, 7); ctx.moveTo(0, 5.5); ctx.quadraticCurveTo(3, 9, 6, 7); ctx.stroke();
    } };
  })();
  // --- unknown animal → a friendly round bear-ish face so nothing ever breaks
  A._generic = (function () {
    var head = function (t) { circ(t, 0, 0, 40); }, eL = function (t) { circ(t, -28, -30, 13); }, eR = function (t) { circ(t, 28, -30, 13); };
    return { sil: [eL, eR, head], draw: function (ctx, o) {
      var c = C3('#D9B48C', '#9A7450', '#F2DCC2');
      cel(ctx, 'ge.l', eL, c, { s: 2, hl: false }); cel(ctx, 'ge.r', eR, c, { s: 2, hl: false }); cel(ctx, 'ge.h', head, c, { s: 5 });
      eye(ctx, -14, -6, 5, o.alive); eye(ctx, 14, -6, 5, o.alive); oval(ctx, 0, 10, 7, 5, 0, '#5A3A30'); cheeks(ctx, -24, 24, 10, 5);
    } };
  })();

  // ================================================================= GLYPH (font text)
  var GEX = 0.7, GEY = 1.0, GD = 4, GLW = LW * 1.3;   // GLW = glyph outer stroke width (outline GLW/2 outside)           // extrusion direction and steps (design units)
  var measureCtx = null;
  function mctx() {
    if (measureCtx !== null) return measureCtx || null;
    try {
      if (typeof document !== 'undefined' && document.createElement) { var c = document.createElement('canvas'); measureCtx = c.getContext('2d') || false; }
      else if (typeof OffscreenCanvas !== 'undefined') measureCtx = new OffscreenCanvas(4, 4).getContext('2d') || false;
      else measureCtx = false;
    } catch (e) { measureCtx = false; }
    return measureCtx || null;
  }
  function glyphText(t) { var s = t.text != null ? String(t.text) : t.n != null ? String(t.n) : '?'; return s.length ? s : '?'; }
  function glyphMetrics(txt) {
    var m = mctx(), r = null;
    if (m && m.measureText) {
      m.font = GLYPH_FONT; m.textAlign = 'center'; m.textBaseline = 'alphabetic';
      var q = m.measureText(txt);
      if (q && q.actualBoundingBoxAscent != null && isFinite(q.actualBoundingBoxLeft)) r = { l: -q.actualBoundingBoxLeft, r: q.actualBoundingBoxRight, t: -q.actualBoundingBoxAscent, b: q.actualBoundingBoxDescent };
    }
    if (!r) {   // node / old engine estimate
      var w = 0, desc = /[gjpqy]/.test(txt) ? 20 : 0;
      for (var i = 0; i < txt.length; i++) w += /[MWmw]/.test(txt[i]) ? 86 : /[Iil1.,!|]/.test(txt[i]) ? 34 : 64;
      r = { l: -w / 2, r: w / 2, t: /[a-z]/.test(txt) && !/[A-Z0-9bdfhklt]/.test(txt) ? -52 : -72, b: desc };
    }
    return r;
  }
  function textOn(g) { g.font = GLYPH_FONT; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.lineJoin = 'round'; g.lineCap = 'round'; }
  function drawGlyph(ctx, t, o) {
    var txt = glyphText(t), c = t.color ? pal(t.color) : C3('#8FA6C9', '#5A6E94', '#C9D6EA'), L = t.color ? lineOf(c) : c.dark;
    textOn(ctx);
    ctx.strokeStyle = L; ctx.lineWidth = GLW;
    for (var d = GD; d >= 0; d--) ctx.strokeText(txt, d * GEX, d * GEY);
    ctx.fillStyle = c.base;
    for (d = GD; d >= 1; d--) ctx.fillText(txt, d * GEX, d * GEY);
    ctx.fillStyle = rgba(c.dark, 0.35); ctx.fillText(txt, GD * GEX, GD * GEY);
    ctx.lineWidth = LW * 0.9; ctx.strokeText(txt, 0, 0);
    var m = glyphMetrics(txt), gr = ctx.createLinearGradient(0, m.t, 0, m.b);
    gr.addColorStop(0, '#FFFFFF'); gr.addColorStop(0.45, '#FFF8EC'); gr.addColorStop(1, '#F1E3CC');
    ctx.fillStyle = gr; ctx.fillText(txt, 0, 0);
    if (o.alive > 0.05) { ctx.fillStyle = rgba('#FFFFFF', 0.7 * o.alive); ctx.beginPath(); starPath(ctx, m.r - 4, m.t + 6, 7, 2.6); ctx.fill(); }
  }
  function starPath(t, x, y, R, r) { var p = starPts(R, r, 4); t.moveTo(x + p[0][0], y + p[0][1]); for (var i = 1; i < p.length; i++) t.lineTo(x + p[i][0], y + p[i][1]); t.closePath(); }

  // ================================================================= specs, geometry
  function thingKey(t) { t = t || {}; return [t.kind, t.obj, t.color, t.shape, t.n, t.animal, t.text].join('|'); }
  function silKey(t) {
    t = t || {};
    switch (t.kind) {
      case 'obj': return 'o|' + (OBJ[t.obj] ? t.obj : 'car');
      case 'shape': return 's|' + (SHAPE_B[t.shape] ? t.shape : 'circle');
      case 'bunch': return 'b|' + bunchDef(t.n).n;
      case 'dots': return 'd|' + dotsDef(t.n).n;
      case 'animal': return 'a|' + (A[t.animal] && t.animal !== '_generic' ? t.animal : '_generic');
      case 'glyph': return 'g|' + glyphText(t);
      default: return 'x';
    }
  }
  var MISSING = { sil: [function (t) { rrect(t, -45, -45, 90, 90, 20); }], grow: LW, draw: function (ctx) {
    cel(ctx, 'x.box', MISSING.sil[0], NEUTRAL, { s: 5 }); dot(ctx, 0, 0, 8, NEUTRAL.dark);
  } };
  var specCache = {};
  function spec(t) {
    var k = silKey(t), s = specCache[k];
    if (s) return s;
    t = t || {};
    if (t.kind === 'obj') { var o = OBJ[t.obj] || OBJ.car; s = { sil: o.sil, grow: LW, draw: function (ctx, th, op) { o.draw(ctx, pal(th.color), op); } }; }
    else if (t.kind === 'shape') { var sh = SHAPE_B[t.shape] ? t.shape : 'circle'; s = { sil: [SHAPE_B[sh]], grow: LW, draw: function (ctx, th, op) { drawShapeTile(ctx, sh, pal(th.color), op); } }; }
    else if (t.kind === 'bunch') { var bd = bunchDef(t.n); s = { sil: bd.sil, grow: LW, draw: function (ctx, th, op) { drawBunch(ctx, bd.n, op); } }; }
    else if (t.kind === 'dots') { var dd = dotsDef(t.n); s = { sil: dd.sil, grow: LW, draw: function (ctx, th, op) { drawDots(ctx, dd.n, op); } }; }
    else if (t.kind === 'animal') {
      var an = A[t.animal] && t.animal !== '_generic' ? A[t.animal] : A._generic;
      s = { sil: an.sil, grow: LW + 2 * STK, sticker: true, draw: function (ctx, th, op) { drawSticker(ctx, s); an.draw(ctx, op); } };
    }
    else if (t.kind === 'glyph') { var tx = glyphText(t); s = { text: tx, grow: GLW, draw: function (ctx, th, op) { drawGlyph(ctx, th, op); } }; }
    else s = MISSING;
    return (specCache[k] = s);
  }
  function drawSticker(ctx, s) {   // white die-cut border with a thin warm-grey edge
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    silPaint(ctx, s, '#D8D0C4', 0);
    silPaint(ctx, s, '#FFFFFF', -2.4);
  }
  /** paint the silhouette opaque in `col` (fill + grow stroke); extra adds to the stroke width. face (glyphs only): the FRONT
   *  face alone (no outer outline, no extrusion copies) — the shadow of a letter / number keeps its counters and apertures open. */
  var FACE_W = 0.35 * GLW;
  function silPaint(g, s, col, extra, face) {
    extra = extra || 0;
    g.fillStyle = col; g.strokeStyle = col; g.lineJoin = 'round'; g.lineCap = 'round';
    if (s.text && face) {
      textOn(g); g.fillStyle = col; g.strokeStyle = col; g.lineWidth = Math.max(0.1, FACE_W + extra);
      g.fillText(s.text, 0, 0); g.strokeText(s.text, 0, 0);
      return;
    }
    if (s.text) {
      textOn(g); g.fillStyle = col; g.strokeStyle = col; g.lineWidth = Math.max(0.1, s.grow + extra);
      for (var d = 0; d <= GD; d++) { g.fillText(s.text, d * GEX, d * GEY); g.strokeText(s.text, d * GEX, d * GEY); }
      return;
    }
    for (var i = 0; i < s.sil.length; i++) {
      var e = s.sil[i], b = typeof e === 'function' ? e : e.b, open = typeof e !== 'function', key = 'sil' + i + '|' + silKeyOf(s);
      var p = P(key, b);
      if (open) { g.lineWidth = Math.max(0.1, e.w + (s.grow - LW) + extra); strokeP(g, p); }
      else { fillP(g, p); g.lineWidth = Math.max(0.1, s.grow + extra); strokeP(g, p); }
    }
  }
  function silKeyOf(s) { if (!s._k) { s._k = 'k' + (++silKeyOf.n); } return s._k; }
  silKeyOf.n = 0;
  /** stroke only the silhouette outline paths (for the dashed rim) */
  function silStroke(g, s, w, face) {
    g.lineJoin = 'round'; g.lineCap = 'round';
    if (s.text && face) { textOn(g); g.lineWidth = Math.max(0.1, w - s.grow + FACE_W); g.strokeText(s.text, 0, 0); return; }
    if (s.text) { textOn(g); g.lineWidth = w; g.strokeText(s.text, 0, 0); g.strokeText(s.text, GD * GEX, GD * GEY); return; }
    for (var i = 0; i < s.sil.length; i++) {
      var e = s.sil[i], b = typeof e === 'function' ? e : e.b, open = typeof e !== 'function';
      g.lineWidth = open ? e.w + (s.grow - LW) + w : w;
      strokeP(g, P('sil' + i + '|' + silKeyOf(s), b));
    }
  }
  var geomCache = {};
  function geom(t) {
    var k = silKey(t), gm = geomCache[k];
    if (gm) return gm;
    var s = spec(t), x0, y0, x1, y1;
    if (s.text) {
      var m = glyphMetrics(s.text), e = s.grow / 2;
      x0 = m.l - e; x1 = m.r + GD * GEX + e; y0 = m.t - e; y1 = m.b + GD * GEY + e;
    } else {
      x0 = 1e9; y0 = 1e9; x1 = -1e9; y1 = -1e9;
      s.sil.forEach(function (en) {
        var r = new Rec(), open = typeof en !== 'function';
        (open ? en.b : en)(r);
        var g2 = open ? (en.w + s.grow - LW) / 2 : s.grow / 2;
        x0 = Math.min(x0, r.x0 - g2); y0 = Math.min(y0, r.y0 - g2); x1 = Math.max(x1, r.x1 + g2); y1 = Math.max(y1, r.y1 + g2);
      });
    }
    var w = x1 - x0, h = y1 - y0;
    gm = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: w, h: h, k: 100 / Math.max(w, h, 1) };
    // a glyph measured before a canvas existed is re-measured later
    if (!(s.text && !mctx())) geomCache[k] = gm;
    return gm;
  }
  function pieceBox(t, size) {
    var g = geom(t || {}), s = num(size, 100) / 100 * g.k;
    return { w: g.w * s, h: g.h * s };
  }

  // ---------------------------------------------------------------- offscreen layers (mask, hole, dash, halo, gold rim)
  function canvasOK() { return typeof document !== 'undefined' && document && typeof document.createElement === 'function'; }
  function newCanvas(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  function pxScale(ctx, cap) {
    var s = 2;
    try {
      var m = ctx.getTransform && ctx.getTransform();
      if (m && isFinite(m.a)) s = Math.max(Math.hypot(m.a, m.b), Math.hypot(m.c, m.d));
    } catch (e) { /* keep 2 */ }
    s = s <= 1.05 ? 1 : s <= 1.6 ? 1.5 : s <= 2.2 ? 2 : 3;
    return Math.min(s, cap || 2);
  }
  var layerCache = {}, layerOrder = [];
  function freeLayer(L) { ['A', 'hole', 'dash', 'halo', 'gold'].forEach(function (k) { if (L[k]) { L[k].width = 0; L[k].height = 0; } }); }
  /** offscreen silhouette layers; face = the shadow version (a glyph's front face only, see silPaint) */
  function layers(t, size, sc, face) {
    var s = spec(t); face = !!(face && s.text);
    var key = silKey(t) + '|' + Math.round(size * 2) / 2 + '|' + sc + (face ? '|f' : ''), L = layerCache[key];
    if (L) return L;
    if (!canvasOK()) return null;
    var g0 = geom(t), k = size / 100 * g0.k, bw = g0.w * k, bh = g0.h * k, pad = 22;
    var W = Math.ceil((bw + 2 * pad) * sc), H = Math.ceil((bh + 2 * pad) * sc);
    var Acv = newCanvas(W, H), a = Acv.getContext('2d');
    if (!a) return null;
    a.setTransform(sc, 0, 0, sc, W / 2, H / 2); a.scale(k, k); a.translate(-g0.cx, -g0.cy);
    silPaint(a, s, '#000000', 0, face);
    L = { A: Acv, W: W, H: H, lw: W / sc, lh: H / sc, sc: sc, k: k, g: g0, s: s, face: face };
    layerCache[key] = L; layerOrder.push(key);
    while (layerOrder.length > 48) { var old = layerOrder.shift(); if (layerCache[old]) freeLayer(layerCache[old]); delete layerCache[old]; }
    return L;
  }
  function cvOps(L) {
    var W = L.W, H = L.H;
    function cp(src) { var c = newCanvas(W, H); c.getContext('2d').drawImage(src, 0, 0); return c; }
    function dil(src, r) {
      var c = newCanvas(W, H), x = c.getContext('2d'); x.drawImage(src, 0, 0);
      for (var i = 0; i < 16; i++) { var an = i * TAU / 16; x.drawImage(src, Math.cos(an) * r, Math.sin(an) * r); }
      if (r > 2) for (i = 0; i < 8; i++) { an = i * TAU / 8 + 0.2; x.drawImage(src, Math.cos(an) * r / 2, Math.sin(an) * r / 2); }
      return c;
    }
    function ero(src, r) {
      var c = cp(src), x = c.getContext('2d'); x.globalCompositeOperation = 'destination-in';
      for (var i = 0; i < 16; i++) { var an = i * TAU / 16; x.drawImage(src, Math.cos(an) * r, Math.sin(an) * r); }
      return c;
    }
    function minus(a, b) { var c = cp(a), x = c.getContext('2d'); x.globalCompositeOperation = 'destination-out'; x.drawImage(b, 0, 0); return c; }
    function shift(src, dx, dy) { var c = newCanvas(W, H); c.getContext('2d').drawImage(src, dx, dy); return c; }
    function tint(src, col) { var c = cp(src), x = c.getContext('2d'); x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, W, H); return c; }
    return { cp: cp, dil: dil, ero: ero, minus: minus, shift: shift, tint: tint };
  }
  function holeLayers(L) {
    if (L.hole) return L;
    var o = cvOps(L), A0 = L.A, sc = L.sc;
    var hole = newCanvas(L.W, L.H), h = hole.getContext('2d');
    // a near-opaque warm underlay first: trees / windows / the chalkboard behind the shadow must not cut its silhouette
    h.drawImage(o.tint(A0, 'rgba(236,231,224,0.78)'), 0, 0);
    h.drawImage(o.tint(A0, 'rgba(40,36,60,0.36)'), 0, 0);
    h.drawImage(o.tint(o.minus(A0, o.ero(A0, 4 * sc)), 'rgba(40,36,60,0.215)'), 0, 0);            // inner rim → 0.45
    h.drawImage(o.tint(o.minus(A0, o.shift(A0, 3 * sc, 5 * sc)), 'rgba(40,36,60,0.16)'), 0, 0);   // hole depth, top-left
    h.drawImage(o.tint(o.minus(A0, o.shift(A0, -2 * sc, -3 * sc)), 'rgba(255,255,255,0.22)'), 0, 0); // lit lower-right lip
    // dashed light outline straddling the edge
    var ring = o.minus(o.dil(A0, 2.5 * sc), o.ero(A0, 2 * sc));
    var dash = newCanvas(L.W, L.H), d = dash.getContext('2d');
    d.setTransform(sc, 0, 0, sc, L.W / 2, L.H / 2); d.scale(L.k, L.k); d.translate(-L.g.cx, -L.g.cy);
    d.setLineDash([10 / L.k, 8 / L.k]); d.strokeStyle = '#FFFFFF';
    silStroke(d, L.s, L.s.grow + 7 / L.k, L.face);
    d.setTransform(1, 0, 0, 1, 0, 0); d.setLineDash([]); d.globalCompositeOperation = 'destination-in'; d.drawImage(ring, 0, 0);
    L.dash = o.tint(dash, 'rgba(255,255,255,0.62)');
    // gold rim for hints (shadow glow)
    var gold = newCanvas(L.W, L.H), gg = gold.getContext('2d');
    gg.drawImage(o.tint(o.minus(o.dil(A0, 16 * sc), A0), 'rgba(255,214,90,0.5)'), 0, 0);       // wide soft halo (reads on phones too)
    gg.drawImage(o.tint(o.minus(o.dil(A0, 7 * sc), o.ero(A0, 3 * sc)), '#FFC93C'), 0, 0);
    L.gold = gold; L.hole = hole;
    return L;
  }
  function haloLayer(L) {
    if (L.halo) return L;
    var o = cvOps(L), A0 = L.A, sc = L.sc, c = newCanvas(L.W, L.H), x = c.getContext('2d');
    x.drawImage(o.tint(o.dil(A0, 12 * sc), 'rgba(255,222,120,0.42)'), 0, 0);
    x.drawImage(o.tint(o.dil(A0, 6 * sc), 'rgba(255,208,70,0.7)'), 0, 0);
    L.halo = c;
    return L;
  }
  function blit(ctx, L, cv, dx, dy, sx) { sx = sx || 1; ctx.drawImage(cv, -L.lw * sx / 2 + (dx || 0), -L.lh * sx / 2 + (dy || 0), L.lw * sx, L.lh * sx); }

  /** a resting piece as a cached sprite (pieces are static unless alive / counting / dimmed) */
  var spriteCache = {}, spriteOrder = [];
  function sprite(t, size, sc, o) {
    var season = t.kind === 'obj' && t.obj === 'house' && o.season === 3 ? 3 : 0;
    var key = thingKey(t) + '|' + Math.round(size * 2) / 2 + '|' + sc + '|' + season, S = spriteCache[key];
    if (S) return S;
    if (!canvasOK()) return null;
    var g0 = geom(t), sp = spec(t), k = size / 100 * g0.k, pad = 3;
    var W = Math.ceil((g0.w * k + 2 * pad) * sc), H = Math.ceil((g0.h * k + 2 * pad) * sc);
    var c = newCanvas(W, H), x = c.getContext('2d');
    if (!x) return null;
    x.setTransform(sc, 0, 0, sc, W / 2, H / 2); x.scale(k, k); x.translate(-g0.cx, -g0.cy); x.lineJoin = 'round'; x.lineCap = 'round';
    sp.draw(x, t, { glow: 0, lift: 0, dim: 0, count: -1, alive: 0, season: season, t: 0 });
    S = spriteCache[key] = { c: c, lw: W / sc, lh: H / sc };
    spriteOrder.push(key);
    while (spriteOrder.length > 40) { var old = spriteOrder.shift(); if (spriteCache[old]) { spriteCache[old].c.width = 0; spriteCache[old].c.height = 0; } delete spriteCache[old]; }
    return S;
  }

  /** vector fallback (no DOM): paint the silhouette in design space */
  function vecSil(ctx, t, size, fn) {
    var g = geom(t), s = spec(t), k = size / 100 * g.k;
    ctx.save(); ctx.scale(k, k); ctx.translate(-g.cx, -g.cy); fn(s, k); ctx.restore();
  }

  // ================================================================= drawPiece / drawShadow
  function drawPiece(ctx, thing, size, opt) {
    if (!ctx || !thing) return;
    size = num(size, 112); if (!(size > 0)) return;
    opt = opt || {};
    var o = { glow: clamp01(opt.glow), lift: clamp01(opt.lift), dim: clamp01(opt.dim), count: opt.count == null ? -1 : num(opt.count, -1),
      alive: clamp01(opt.alive), season: opt.season == null ? 0 : Math.round(num(opt.season, 0)), t: num(opt.t, 0) };
    var g = geom(thing), sp = spec(thing), k = size / 100 * g.k;
    ctx.save();
    if (o.lift > 0.01 || o.glow > 0.01) {
      var L = layers(thing, size, pxScale(ctx));
      if (o.lift > 0.01) {
        if (L) {
          var al = ctx.globalAlpha;
          ctx.globalAlpha = al * 0.16 * o.lift; blit(ctx, L, L.A, size * 0.05 * o.lift, size * 0.13 * o.lift, 1.06);
          ctx.globalAlpha = al * 0.12 * o.lift; blit(ctx, L, L.A, size * 0.04 * o.lift, size * 0.10 * o.lift, 1.0);
          ctx.globalAlpha = al;
        } else {
          ctx.save(); ctx.translate(size * 0.05 * o.lift, size * 0.12 * o.lift);
          vecSil(ctx, thing, size, function (s) { silPaint(ctx, s, 'rgba(40,30,50,' + (0.25 * o.lift).toFixed(3) + ')', 0); });
          ctx.restore();
        }
      }
      if (o.glow > 0.01) {
        if (L) { haloLayer(L); var a2 = ctx.globalAlpha; ctx.globalAlpha = a2 * o.glow; blit(ctx, L, L.halo); ctx.globalAlpha = a2; }
        else vecSil(ctx, thing, size, function (s, kk) { silPaint(ctx, s, 'rgba(255,214,90,' + (0.6 * o.glow).toFixed(3) + ')', 12 / kk); });
      }
    }
    if (!(o.alive > 0.01 || o.count >= 0 || o.dim > 0.01) && opt.sprite !== false) {
      var SP = sprite(thing, size, pxScale(ctx, 3), o);
      if (SP) { ctx.drawImage(SP.c, -SP.lw / 2, -SP.lh / 2, SP.lw, SP.lh); ctx.restore(); return; }
    }
    if (o.dim > 0.01) ctx.globalAlpha *= 1 - 0.45 * o.dim;
    ctx.scale(k, k); ctx.translate(-g.cx, -g.cy);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    sp.draw(ctx, thing, o);
    ctx.restore();
    if (o.dim > 0.01 && !sp.text) {   // a soft warm veil so a dimmed piece also loses some colour
      ctx.save(); ctx.scale(k, k); ctx.translate(-g.cx, -g.cy); ctx.globalAlpha *= 0.35 * o.dim;
      silPaintParts(ctx, sp, '#EFE8DC'); ctx.restore();
    }
  }
  function silPaintParts(ctx, s, col) {   // fill only (no grow) — for the dim veil
    ctx.fillStyle = col;
    if (s.text) { textOn(ctx); ctx.fillText(s.text, 0, 0); return; }
    // one combined path so overlaps are not painted twice
    if (hasP2D()) {
      var pk = 'veil|' + silKeyOf(s), p = pcache[pk];
      if (!p) { p = pcache[pk] = new Path2D(); s.sil.forEach(function (e) { if (typeof e === 'function') e(p); }); }
      ctx.fill(p, 'nonzero');
    } else { ctx.beginPath(); s.sil.forEach(function (e) { if (typeof e === 'function') e(ctx); }); ctx.fill(); }
  }
  function drawShadow(ctx, thing, size, opt) {
    if (!ctx || !thing) return;
    size = num(size, 112); if (!(size > 0)) return;
    opt = opt || {};
    var alpha = opt.alpha == null ? 1 : clamp01(opt.alpha), glow = clamp01(opt.glow);
    if (alpha <= 0.001) return;
    ctx.save();
    var L = layers(thing, size, pxScale(ctx), true);
    if (L) {
      holeLayers(L);
      ctx.globalAlpha *= alpha;
      blit(ctx, L, L.hole); blit(ctx, L, L.dash);
      if (glow > 0.01) { ctx.globalAlpha *= glow; blit(ctx, L, L.gold); }
    } else {
      vecSil(ctx, thing, size, function (s, k) {
        ctx.globalAlpha *= alpha;
        silPaint(ctx, s, 'rgba(236,231,224,0.78)', 0, true);   // the underlay flattens the scenery inside the silhouette
        silPaint(ctx, s, 'rgba(40,36,60,0.36)', 0, true);
        if (ctx.setLineDash) ctx.setLineDash([10 / k, 8 / k]);
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'; silStroke(ctx, s, s.text ? s.grow + 2.5 / k : 2.5 / k, true);
        if (ctx.setLineDash) ctx.setLineDash([]);
        if (glow > 0.01) { ctx.globalAlpha *= glow; ctx.strokeStyle = '#FFC93C'; silStroke(ctx, s, s.grow + 9 / k, true); }
      });
    }
    ctx.restore();
  }

  // ================================================================= BOARD
  var SEA = [
    { sky: ['#C4E5F6', '#FDEFF4'], tree: C3('#F7DDE6', '#D3A9BC', '#FFF5F8'), tree2: C3('#F2D3DE', '#CB9DB2', '#FFF0F5'), grass: ['#D3EAC4', '#B9D7A6'], blossom: true },
    { sky: ['#9CD4F2', '#DDF3FB'], tree: C3('#9FCB98', '#6E9C6B', '#C8E4C0'), tree2: C3('#8DBF8A', '#5F8E5D', '#BEDDB8'), grass: ['#CBE6B6', '#ADCF98'], sun: true },
    { sky: ['#F5CFA6', '#FCEBD3'], tree: C3('#E2B06A', '#B5833F', '#F2D3A0'), tree2: C3('#D49464', '#A2683D', '#ECC09E'), grass: ['#E6DCB2', '#D0C28E'] },
    { sky: ['#C6D3E3', '#F0F3F8'], tree: null, tree2: null, grass: ['#F5F7FB', '#DDE4EE'], snow: true }
  ];
  var TRUNK = C3('#B89474', '#86684C', '#D7BC9F');
  function seaOf(i) { i = Math.round(num(i, 0)); return SEA[((i % 4) + 4) % 4]; }
  function softLine(c) { return mix(c, '#5E5068', 0.32); }

  function tree(ctx, x, by, h, S, v) {   // street / park tree; v = variant 0|1
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    var tw = h * 0.09;
    ctx.fillStyle = TRUNK.base; ctx.strokeStyle = TRUNK.dark; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(x - tw, by); ctx.lineTo(x - tw * 0.6, by - h * 0.55); ctx.lineTo(x + tw * 0.6, by - h * 0.55); ctx.lineTo(x + tw, by); ctx.closePath(); ctx.fill(); ctx.stroke();
    var cy = by - h * 0.66, r = h * 0.3;
    if (S.snow) {   // bare branches with snow
      ctx.strokeStyle = TRUNK.dark; ctx.lineWidth = Math.max(1.5, h * 0.035);
      var br = [[-0.9, 0.55], [-0.4, 0.75], [0.3, 0.8], [0.85, 0.5], [0, 0.95]];
      br.forEach(function (b) {
        ctx.beginPath(); ctx.moveTo(x, by - h * 0.45); ctx.quadraticCurveTo(x + b[0] * r * 0.4, by - h * (0.45 + b[1] * 0.25), x + b[0] * r, by - h * (0.42 + b[1] * 0.45)); ctx.stroke();
        oval(ctx, x + b[0] * r * 0.9, by - h * (0.42 + b[1] * 0.45) - 1.5, h * 0.06, h * 0.025, 0, '#FFFFFF');
      });
      return;
    }
    var c = v ? S.tree2 : S.tree, blobs = [[-0.55, 0.15, 0.7], [0.55, 0.15, 0.7], [0, -0.25, 0.85], [0, 0.25, 0.75]];
    ctx.strokeStyle = softLine(c.base); ctx.lineWidth = 3.2;
    blobs.forEach(function (b) { ctx.beginPath(); circ(ctx, x + b[0] * r, cy + b[1] * r, b[2] * r); ctx.stroke(); });
    ctx.fillStyle = c.base; blobs.forEach(function (b) { ctx.beginPath(); circ(ctx, x + b[0] * r, cy + b[1] * r, b[2] * r); ctx.fill(); });
    oval(ctx, x + r * 0.25, cy + r * 0.45, r * 0.65, r * 0.3, 0, rgba(c.dark, 0.35));
    oval(ctx, x - r * 0.35, cy - r * 0.45, r * 0.32, r * 0.18, -0.5, rgba(c.light, 0.9));
    if (S.blossom) for (var i = 0; i < 7; i++) dot(ctx, x + Math.cos(i * 2.4) * r * 0.75, cy + Math.sin(i * 2.4) * r * 0.6, r * 0.07, '#FFFFFF');
  }
  function bush(ctx, x, y, w, S) {
    var c = S.snow ? C3('#E9EEF5', '#B9C4D3', '#FFFFFF') : S.tree2 && !S.blossom ? S.tree2 : C3('#BCD9AE', '#8DB07E', '#DCEFD2');
    ctx.fillStyle = c.base; ctx.strokeStyle = softLine(c.base); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - w / 2, y);
    ctx.quadraticCurveTo(x - w / 2, y - w * 0.32, x - w / 4, y - w * 0.32); ctx.quadraticCurveTo(x - w / 8, y - w * 0.55, x + w / 8, y - w * 0.4);
    ctx.quadraticCurveTo(x + w / 2, y - w * 0.45, x + w / 2, y); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  function cloudShape(ctx, x, y, s, a) {
    ctx.fillStyle = 'rgba(255,255,255,' + (0.85 * a).toFixed(3) + ')';
    ctx.beginPath(); circ(ctx, x, y, s * 0.5); circ(ctx, x + s * 0.55, y + s * 0.1, s * 0.38); circ(ctx, x - s * 0.55, y + s * 0.12, s * 0.34);
    rrect(ctx, x - s * 0.55, y + s * 0.1, s * 1.1, s * 0.36, s * 0.16); ctx.fill();   // one path: no double-alpha seams
  }
  function snowCap(ctx, x, y, w, th) {
    ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = '#DCE4EE'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x - 2, y + 1); ctx.quadraticCurveTo(x - 3, y - th, x + th, y - th);
    ctx.lineTo(x + w - th, y - th); ctx.quadraticCurveTo(x + w + 3, y - th, x + w + 2, y + 1);
    for (var i = 4; i >= 0; i--) ctx.quadraticCurveTo(x + w * (i + 0.5) / 5, y + th * 0.9, x + w * i / 5, y + 1);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  function awning(ctx, x, y, w, h, col, S) {
    var n = Math.max(3, Math.round(w / 22)), sw = w / n;
    for (var i = 0; i < n; i++) {
      ctx.fillStyle = i % 2 ? '#FBF6EE' : col;
      ctx.beginPath(); ctx.moveTo(x + i * sw, y); ctx.lineTo(x + (i + 1) * sw, y); ctx.lineTo(x + (i + 1) * sw, y + h);
      ctx.quadraticCurveTo(x + (i + 0.5) * sw, y + h + sw * 0.45, x + i * sw, y + h); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = softLine(col); ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h);
    for (i = n - 1; i >= 0; i--) ctx.quadraticCurveTo(x + (i + 0.5) * sw, y + h + sw * 0.45, x + i * sw, y + h);
    ctx.closePath(); ctx.stroke();
    if (S.snow) snowCap(ctx, x, y, w, Math.max(3, h * 0.25));
  }
  function windowPane(ctx, x, y, w, h, S, warm) {
    ctx.fillStyle = warm ? '#FBE7B8' : '#DDEBF1'; ctx.strokeStyle = '#B9AE9E'; ctx.lineWidth = 1.6;
    ctx.beginPath(); rrect(ctx, x, y, w, h, Math.min(4, w * 0.15)); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = Math.max(1.2, w * 0.08);
    ctx.beginPath(); ctx.moveTo(x + w * 0.25, y + h * 0.8); ctx.lineTo(x + w * 0.55, y + h * 0.2); ctx.stroke();
    ctx.strokeStyle = '#B9AE9E'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); ctx.stroke();
  }
  function ground(ctx, w, h, gy, S, col) {
    var g = ctx.createLinearGradient(0, gy, 0, h);
    g.addColorStop(0, (col || S.grass)[0]); g.addColorStop(1, (col || S.grass)[1]);
    ctx.fillStyle = g; ctx.fillRect(0, gy, w, h - gy);
  }
  function viewWindow(ctx, x, y, w, h, S) {   // indoor window showing the season outside
    ctx.fillStyle = '#FBF6EE'; ctx.strokeStyle = '#C9B79C'; ctx.lineWidth = 2;
    ctx.beginPath(); rrect(ctx, x - 6, y - 6, w + 12, h + 12, 8); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.beginPath(); rrect(ctx, x, y, w, h, 5); ctx.clip();
    var g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, S.sky[0]); g.addColorStop(1, S.sky[1]); ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ground(ctx, x + w, y + h, y + h * 0.72, S); ctx.fillStyle = S.grass[0]; ctx.fillRect(x, y + h * 0.72, w, h * 0.28);
    tree(ctx, x + w * 0.3, y + h * 0.8, h * 0.7, S, 0);
    cloudShape(ctx, x + w * 0.72, y + h * 0.22, h * 0.12, 1);
    if (S.snow) { ctx.fillStyle = 'rgba(255,255,255,0.9)'; for (var i = 0; i < 10; i++) dot(ctx, x + ((i * 37) % 100) / 100 * w, y + ((i * 53) % 70) / 100 * h, 1.6, '#FFFFFF'); }
    ctx.restore();
    ctx.strokeStyle = '#E2D6C4'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h); ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2); ctx.stroke();
    ctx.fillStyle = S.snow ? '#FFFFFF' : '#EDE2D0'; ctx.fillRect(x - 10, y + h + 4, w + 20, 6);
  }

  var SCENE = {};
  SCENE.street = { outdoor: true, front: function (ctx, w, h, S) {
    var gy = h * 0.7, n = w / h > 1.35 ? 4 : 3, sw = w / n;
    // far rooftops & a clock tower
    ctx.fillStyle = rgba(mix(S.sky[1], '#B6AFC6', 0.45), 0.8);
    ctx.beginPath(); ctx.moveTo(0, gy);
    for (var i = 0; i <= 8; i++) { var x = i * w / 8, top = gy - h * (0.42 + ((i * 7) % 3) * 0.04); ctx.lineTo(x, top); ctx.lineTo(x + w / 16, top - h * 0.04); ctx.lineTo(x + w / 8, top); }
    ctx.lineTo(w, gy); ctx.closePath(); ctx.fill();
    ctx.fillRect(w * 0.55, gy - h * 0.64, w * 0.05, h * 0.3); ctx.beginPath(); ctx.moveTo(w * 0.545, gy - h * 0.64); ctx.lineTo(w * 0.575, gy - h * 0.72); ctx.lineTo(w * 0.605, gy - h * 0.64); ctx.fill();
    dot(ctx, w * 0.575, gy - h * 0.58, h * 0.018, rgba('#FFFFFF', 0.8));
    var walls = ['#F6EBDD', '#F1E4D6', '#EEE7DB', '#F5E8E2'], awns = ['#E8C1BC', '#C4D6BA', '#EAD6AE', '#D8CBE0'];
    for (i = 0; i < n; i++) {
      var x0 = i * sw + sw * 0.05, ww = sw * 0.9, top2 = gy - h * (0.5 + 0.05 * ((i * 5) % 3) / 2), col = walls[i % 4];
      ctx.fillStyle = col; ctx.strokeStyle = '#CDBFAE'; ctx.lineWidth = 1.8;
      ctx.beginPath(); rrect(ctx, x0, top2, ww, gy - top2 + 2, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = mix(col, '#B8A58C', 0.25); ctx.fillRect(x0 - 3, top2 - 4, ww + 6, 8);
      if (S.snow) snowCap(ctx, x0 - 3, top2 - 4, ww + 6, 6);
      windowPane(ctx, x0 + ww * 0.12, top2 + h * 0.06, ww * 0.3, h * 0.11, S, S.snow);
      windowPane(ctx, x0 + ww * 0.58, top2 + h * 0.06, ww * 0.3, h * 0.11, S, S.snow);
      var ay = gy - h * 0.25;
      windowPane(ctx, x0 + ww * 0.1, ay + h * 0.07, ww * 0.46, h * 0.16, S, S.snow);
      ctx.fillStyle = '#D8C4A6'; ctx.strokeStyle = '#B49C7C'; ctx.beginPath(); rrect(ctx, x0 + ww * 0.64, ay + h * 0.06, ww * 0.24, gy - ay - h * 0.06, 3); ctx.fill(); ctx.stroke();
      awning(ctx, x0 + ww * 0.04, ay, ww * 0.92, h * 0.05, awns[i % 4], S);
    }
    // pavement + kerb + road
    ctx.fillStyle = S.snow ? '#EEF1F6' : '#E9E1D3'; ctx.fillRect(0, gy, w, h * 0.13);
    ctx.strokeStyle = S.snow ? '#DCE3EC' : '#D8CDBC'; ctx.lineWidth = 1.2;
    for (x = 0; x < w; x += h * 0.09) { ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x - h * 0.02, gy + h * 0.13); ctx.stroke(); }
    ctx.fillStyle = '#D4CABB'; ctx.fillRect(0, gy + h * 0.13, w, h * 0.022);
    ctx.fillStyle = '#D9D6D2'; ctx.fillRect(0, gy + h * 0.152, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (x = w * 0.03; x < w; x += w * 0.16) ctx.fillRect(x, gy + h * 0.225, w * 0.07, h * 0.014);
    if (S.snow) { ctx.fillStyle = '#FFFFFF'; for (x = 0; x < w; x += h * 0.12) { ctx.beginPath(); ell(ctx, x, gy + h * 0.15, h * 0.08, h * 0.018, 0); ctx.fill(); } }
    tree(ctx, sw * 1, gy + h * 0.06, h * 0.5, S, 1);
    // lamp post + bus-stop sign
    var lx = w - sw * 0.5 + sw * 0.42;
    ctx.fillStyle = '#9AA5A2'; ctx.fillRect(lx - 2, gy - h * 0.38, 4, h * 0.44);
    oval(ctx, lx, gy - h * 0.4, h * 0.03, h * 0.022, 0, S.snow ? '#FFE9B0' : '#F1EEE6');
    var bx = sw * (n - 1) + sw * 0.08;
    ctx.fillStyle = '#A9B2B0'; ctx.fillRect(bx - 1.5, gy - h * 0.2, 3, h * 0.26);
    dot(ctx, bx, gy - h * 0.21, h * 0.035, '#C3D3D6'); ctx.strokeStyle = '#8FA2A6'; ctx.lineWidth = 1.5; ctx.beginPath(); circ(ctx, bx, gy - h * 0.21, h * 0.035); ctx.stroke();
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(bx - h * 0.018, gy - h * 0.218, h * 0.036, h * 0.014);
  } };
  SCENE.shapes = { outdoor: true, front: function (ctx, w, h, S) {
    var wy = h * 0.3, gy = h * 0.84;
    tree(ctx, w * 0.12, wy + h * 0.06, h * 0.32, S, 0); tree(ctx, w * 0.86, wy + h * 0.06, h * 0.36, S, 1);
    ctx.fillStyle = rgba(mix(S.sky[1], '#B6AFC6', 0.4), 0.7);
    ctx.beginPath(); ctx.moveTo(w * 0.3, wy); ctx.lineTo(w * 0.36, wy - h * 0.12); ctx.lineTo(w * 0.42, wy); ctx.lineTo(w * 0.48, wy - h * 0.08); ctx.lineTo(w * 0.62, wy - h * 0.08); ctx.lineTo(w * 0.66, wy); ctx.fill();
    // the wall of soft stone blocks
    ctx.fillStyle = '#F1E8DA'; ctx.fillRect(0, wy, w, gy - wy);
    ctx.strokeStyle = '#E2D5C1'; ctx.lineWidth = 1.4;
    var bh = (gy - wy) / 6;
    for (var r = 0; r < 6; r++) {
      var y = wy + r * bh; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      for (var x = (r % 2) * bh * 1.1; x < w; x += bh * 2.2) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + bh); ctx.stroke(); }
    }
    ctx.fillStyle = '#E4D7C3'; ctx.fillRect(-2, wy - 8, w + 4, 10); ctx.strokeStyle = '#CFC0A9'; ctx.strokeRect(-2, wy - 8, w + 4, 10);
    if (S.snow) snowCap(ctx, -2, wy - 8, w + 4, 6);
    // no shape outlines on the wall: they were decoys for a 3-year-old asked "where is the square?" (visual P2-7)
    ground(ctx, w, h, gy, S);
    ctx.fillStyle = rgba(S.grass[1], 0.7); ctx.fillRect(0, gy, w, 4);
    for (x = w * 0.05; x < w; x += w * 0.12) bush(ctx, x, gy + h * 0.04, h * 0.1, S);
  } };
  SCENE.balloons = { outdoor: true, front: function (ctx, w, h, S) {
    var gy = h * 0.66;
    ctx.fillStyle = rgba(mix(S.grass[0], '#9FB79A', 0.25), 1);
    ctx.beginPath(); ctx.moveTo(0, gy); ctx.quadraticCurveTo(w * 0.25, gy - h * 0.12, w * 0.5, gy - h * 0.02); ctx.quadraticCurveTo(w * 0.75, gy - h * 0.12, w, gy - h * 0.03); ctx.lineTo(w, gy); ctx.fill();
    ground(ctx, w, h, gy, S);
    // striped tent
    var tx = w * 0.22, tw = Math.min(w * 0.32, h * 0.6), tb = gy + h * 0.06, th = h * 0.42, tt = tb - th;
    var stripes = 6;
    for (var i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 ? '#FBF3EA' : '#EBC6C2';
      ctx.beginPath(); ctx.moveTo(tx - tw / 2 + tw * i / stripes, tb); ctx.lineTo(tx - tw / 2 + tw * (i + 1) / stripes, tb);
      ctx.lineTo(tx - tw / 2 + tw * (i + 1) / stripes, tt + th * 0.42); ctx.lineTo(tx - tw / 2 + tw * i / stripes, tt + th * 0.42); ctx.fill();
    }
    ctx.fillStyle = '#D9B5B0'; ctx.beginPath(); ctx.moveTo(tx - tw * 0.1, tb); ctx.quadraticCurveTo(tx, tt + th * 0.5, tx + tw * 0.1, tb); ctx.fill();
    for (i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 ? '#EBC6C2' : '#FBF3EA';
      ctx.beginPath(); ctx.moveTo(tx, tt); ctx.lineTo(tx - tw * 0.58 + tw * 1.16 * i / stripes, tt + th * 0.44); ctx.lineTo(tx - tw * 0.58 + tw * 1.16 * (i + 1) / stripes, tt + th * 0.44); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = '#C7A7A2'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(tx, tt); ctx.lineTo(tx - tw * 0.58, tt + th * 0.44); ctx.lineTo(tx + tw * 0.58, tt + th * 0.44); ctx.closePath(); ctx.stroke();
    ctx.strokeRect(tx - tw / 2, tt + th * 0.44, tw, th * 0.56);
    if (S.snow) { ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.moveTo(tx, tt - 2); ctx.lineTo(tx - tw * 0.4, tt + th * 0.3); ctx.quadraticCurveTo(tx, tt + th * 0.2, tx + tw * 0.4, tt + th * 0.3); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = '#B9A58C'; ctx.fillRect(tx - 1, tt - h * 0.07, 2, h * 0.07);
    // ticket booth (muted) under the Ferris wheel, which turns in the live layer
    var kx = w * 0.79, ky = gy + h * 0.08;
    ctx.fillStyle = '#F3E6D2'; ctx.strokeStyle = '#C9B79C'; ctx.lineWidth = 1.6;
    ctx.beginPath(); rrect(ctx, kx - h * 0.07, ky - h * 0.13, h * 0.14, h * 0.13, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#E8C1BC'; ctx.beginPath(); ctx.moveTo(kx - h * 0.09, ky - h * 0.13); ctx.lineTo(kx, ky - h * 0.19); ctx.lineTo(kx + h * 0.09, ky - h * 0.13); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#DDEBF1'; ctx.fillRect(kx - h * 0.04, ky - h * 0.1, h * 0.08, h * 0.045);
    bush(ctx, w * 0.5, gy + h * 0.08, h * 0.12, S); bush(ctx, w * 0.96, gy + h * 0.2, h * 0.14, S);
    if (S.snow) for (i = 0; i < 6; i++) oval(ctx, w * (0.1 + i * 0.17), gy + h * (0.15 + (i % 2) * 0.12), h * 0.07, h * 0.015, 0, '#FFFFFF');
  }, live: function (ctx, w, h, S, t, al) {
    var fx = w * 0.9, R = h * 0.2, fy = h * 0.66 - R * 0.95, rot = t * (0.08 + 0.5 * al), cab = ['#EBC6C2', '#C9DCC3', '#EBDDB3', '#D5CCE3', '#C8DAE2', '#F0D2C0'];
    ctx.strokeStyle = '#C9BBA8'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(fx - R * 0.55, h * 0.66 + 2); ctx.lineTo(fx, fy); ctx.lineTo(fx + R * 0.55, h * 0.66 + 2); ctx.stroke();
    ctx.lineWidth = 1.6; ctx.beginPath(); circ(ctx, fx, fy, R); ctx.stroke();
    for (var i = 0; i < 6; i++) {
      var a = rot + i * TAU / 6, x = fx + Math.cos(a) * R, y = fy + Math.sin(a) * R;
      ctx.strokeStyle = '#D6CABA'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(x, y); ctx.stroke();
      ctx.fillStyle = cab[i]; ctx.strokeStyle = mix(cab[i], '#7E7088', 0.3); ctx.beginPath(); rrect(ctx, x - h * 0.022, y, h * 0.044, h * 0.034, 4); ctx.fill(); ctx.stroke();
    }
    dot(ctx, fx, fy, 3, '#B9A58C');
    flag(ctx, w * 0.22, h * 0.66 + h * 0.06 - h * 0.42 - h * 0.07, h * 0.06, t, al, '#E8C1BC');
    bunting(ctx, 0, h * 0.06, w, h * 0.1, h, t, al);
  } };
  SCENE.park = { outdoor: true, front: function (ctx, w, h, S) {
    var gy = h * 0.56;
    ctx.fillStyle = mix(S.grass[0], '#A8BFA0', 0.3);
    ctx.beginPath(); ctx.moveTo(0, gy + h * 0.02); ctx.quadraticCurveTo(w * 0.3, gy - h * 0.1, w * 0.6, gy - h * 0.01); ctx.quadraticCurveTo(w * 0.85, gy - h * 0.08, w, gy); ctx.lineTo(w, gy + 4); ctx.lineTo(0, gy + 4); ctx.fill();
    tree(ctx, w * 0.42, gy + h * 0.02, h * 0.32, S, 1);
    ground(ctx, w, h, gy, S);
    ctx.fillStyle = S.snow ? '#E6EBF2' : '#EDE3D0';
    ctx.beginPath(); ctx.moveTo(w * 0.38, gy); ctx.quadraticCurveTo(w * 0.3, h * 0.75, w * 0.14, h); ctx.lineTo(w * 0.36, h); ctx.quadraticCurveTo(w * 0.42, h * 0.75, w * 0.42, gy); ctx.fill();
    var px = w * 0.7, py = h * 0.8, rx = Math.min(w * 0.2, h * 0.36), ry = h * 0.09;
    oval(ctx, px, py + 3, rx + 4, ry + 3, 0, S.snow ? '#D8E0EA' : '#C7D7B8');
    oval(ctx, px, py, rx, ry, 0, S.snow ? '#E3EEF5' : '#CFE3EC');
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(px - rx * 0.2, py - ry * 0.25, rx * 0.4, ry * 0.25, 0, Math.PI * 1.1, Math.PI * 1.7); ctx.stroke();
    if (!S.snow) { ctx.strokeStyle = '#9DB98E'; ctx.lineWidth = 2; for (var i = 0; i < 5; i++) { var x = px + rx * 0.75 + i * 4; ctx.beginPath(); ctx.moveTo(x, py); ctx.quadraticCurveTo(x + 2, py - h * 0.05, x + (i - 2), py - h * 0.09); ctx.stroke(); } }
    tree(ctx, w * 0.1, gy + h * 0.18, h * 0.62, S, 0); tree(ctx, w * 0.92, gy + h * 0.1, h * 0.5, S, 1);
    // bench
    var bx = w * 0.56, by = gy + h * 0.08;
    ctx.fillStyle = '#D8B994'; ctx.strokeStyle = '#A88A64'; ctx.lineWidth = 1.5;
    ctx.beginPath(); rrect(ctx, bx - h * 0.1, by - h * 0.07, h * 0.2, h * 0.025, 3); ctx.fill(); ctx.stroke();
    ctx.beginPath(); rrect(ctx, bx - h * 0.11, by - h * 0.035, h * 0.22, h * 0.025, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#9AA5A2'; ctx.fillRect(bx - h * 0.09, by - h * 0.01, 3, h * 0.04); ctx.fillRect(bx + h * 0.085, by - h * 0.01, 3, h * 0.04);
    if (S.snow) snowCap(ctx, bx - h * 0.1, by - h * 0.07, h * 0.2, 3);
    bush(ctx, w * 0.25, gy + h * 0.06, h * 0.12, S);
  }, live: function (ctx, w, h, S, t, al) {
    if (S.snow) return;
    var px = w * 0.7, py = h * 0.8, rx = Math.min(w * 0.2, h * 0.36);
    for (var i = 0; i < 2; i++) {
      var ph = ((t * 0.35 + i * 0.5) % 1), a = (1 - ph) * (0.5 + 0.5 * al);
      ctx.strokeStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(px - rx * 0.3 + i * rx * 0.5, py + h * 0.01, rx * (0.08 + 0.2 * ph), h * (0.012 + 0.03 * ph), 0, 0, TAU); ctx.stroke();
    }
  } };
  SCENE.letters = { outdoor: false, front: function (ctx, w, h, S) {
    ctx.fillStyle = '#F6EEE2'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(232,220,200,0.45)'; for (var x = 0; x < w; x += h * 0.08) ctx.fillRect(x, 0, h * 0.04, h * 0.72);
    ctx.fillStyle = '#EADCC6'; ctx.fillRect(0, h * 0.72, w, h * 0.2);
    ctx.strokeStyle = '#DCCAB0'; ctx.lineWidth = 1.4; for (x = 0; x < w; x += h * 0.06) { ctx.beginPath(); ctx.moveTo(x, h * 0.73); ctx.lineTo(x, h * 0.92); ctx.stroke(); }
    ctx.fillStyle = '#DCC8AA'; ctx.fillRect(0, h * 0.71, w, h * 0.02);
    ctx.fillStyle = '#E4D0B2'; ctx.fillRect(0, h * 0.92, w, h * 0.08);
    // soft sage board with chalk letters
    var bw = Math.min(w * 0.5, h * 0.95), bxx = w * 0.06, by = h * 0.16, bhh = h * 0.42;
    ctx.fillStyle = '#D2B48C'; ctx.beginPath(); rrect(ctx, bxx - 6, by - 6, bw + 12, bhh + 12, 8); ctx.fill();
    ctx.fillStyle = '#BCD0C2'; ctx.beginPath(); rrect(ctx, bxx, by, bw, bhh, 5); ctx.fill();
    ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = Math.max(2, bhh * 0.02); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var sx = bxx + bw * 0.2, sy = by + bhh * 0.32, sr = bhh * 0.1;           // chalk doodles (no letters: they would compete with letter pieces)
    ctx.beginPath(); circ(ctx, sx, sy, sr); for (var k = 0; k < 8; k++) { var ka = k * TAU / 8; ctx.moveTo(sx + Math.cos(ka) * sr * 1.4, sy + Math.sin(ka) * sr * 1.4); ctx.lineTo(sx + Math.cos(ka) * sr * 1.9, sy + Math.sin(ka) * sr * 1.9); } ctx.stroke();
    var hx = bxx + bw * 0.55, hy = by + bhh * 0.78, hs = bhh * 0.24;
    ctx.beginPath(); ctx.rect(hx - hs / 2, hy - hs, hs, hs); ctx.moveTo(hx - hs * 0.65, hy - hs); ctx.lineTo(hx, hy - hs * 1.6); ctx.lineTo(hx + hs * 0.65, hy - hs); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bxx + bw * 0.1, by + bhh * 0.85); for (var q = 0; q <= 6; q++) ctx.lineTo(bxx + bw * (0.1 + q * 0.05), by + bhh * (0.85 - (q % 2) * 0.08)); ctx.stroke();
    var fx2 = bxx + bw * 0.84, fy2 = by + bhh * 0.45;
    ctx.beginPath(); for (q = 0; q < 5; q++) { var qa = q * TAU / 5; circ(ctx, fx2 + Math.cos(qa) * bhh * 0.07, fy2 + Math.sin(qa) * bhh * 0.07, bhh * 0.05); } ctx.moveTo(fx2, fy2 + bhh * 0.12); ctx.lineTo(fx2, fy2 + bhh * 0.38); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#E8DCC8'; ctx.fillRect(bxx + bw * 0.1, by + bhh + 4, bw * 0.3, 4);
    viewWindow(ctx, w * 0.66, h * 0.14, Math.min(w * 0.26, h * 0.5), h * 0.4, S);
    // a little shelf of books on the rail
    var cols = ['#E6C3BE', '#C9D8C2', '#EBD9B2', '#D5CCE3', '#C8D9E0'];
    for (var i = 0; i < 5; i++) { ctx.fillStyle = cols[i]; ctx.fillRect(w * 0.58 + i * h * 0.035, h * 0.71 - h * (0.07 + (i % 2) * 0.015), h * 0.03, h * (0.07 + (i % 2) * 0.015)); }
  }, live: function (ctx, w, h, S, t, al) { bunting(ctx, 0, h * 0.05, w, h * 0.08, h, t, al); } };
  SCENE.size = { outdoor: false, front: function (ctx, w, h, S) {
    ctx.fillStyle = '#F4E9DC'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(236,222,204,0.6)'; for (var x = 0; x < w; x += h * 0.1) ctx.fillRect(x, 0, h * 0.05, h);
    viewWindow(ctx, w * 0.06, h * 0.07, Math.min(w * 0.22, h * 0.4), h * 0.24, S);
    function shelf(y) {
      ctx.fillStyle = '#E7C9A2'; ctx.fillRect(0, y, w, h * 0.03); ctx.fillStyle = '#CFA77A'; ctx.fillRect(0, y + h * 0.03, w, h * 0.025);
      ctx.fillStyle = 'rgba(120,90,60,0.12)'; ctx.fillRect(0, y + h * 0.055, w, h * 0.03);
    }
    var y1 = h * 0.42, y2 = h * 0.78;
    // muted toys
    function block(x, y, s, c) { ctx.fillStyle = c; ctx.strokeStyle = mix(c, '#7E7088', 0.3); ctx.lineWidth = 1.4; ctx.beginPath(); rrect(ctx, x, y - s, s, s, s * 0.15); ctx.fill(); ctx.stroke(); }
    function teddy(x, y, s) {
      var c = '#DCC2A2', l = '#B79A78'; ctx.lineWidth = 1.4; ctx.strokeStyle = l; ctx.fillStyle = c;
      [[-0.32, -0.95, 0.15], [0.32, -0.95, 0.15], [0, -0.7, 0.32], [0, -0.22, 0.3]].forEach(function (q) { ctx.beginPath(); circ(ctx, x + q[0] * s, y + q[1] * s, q[2] * s); ctx.fill(); ctx.stroke(); });
      dot(ctx, x - 0.11 * s, y - 0.74 * s, s * 0.04, '#8C7A6A'); dot(ctx, x + 0.11 * s, y - 0.74 * s, s * 0.04, '#8C7A6A');
    }
    function ball(x, y, r) { dot(ctx, x, y - r, r, '#E9D6D2'); ctx.strokeStyle = '#C7AEA9'; ctx.lineWidth = 1.4; ctx.beginPath(); circ(ctx, x, y - r, r); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x - r, y - r); ctx.quadraticCurveTo(x, y - r * 1.6, x + r, y - r); ctx.stroke(); }
    var u = h * 0.11;
    block(w * 0.36, y1, u * 0.7, '#D9D0E6'); block(w * 0.36 + u * 0.72, y1, u * 0.7, '#DCE6D3'); block(w * 0.36 + u * 0.36, y1 - u * 0.7, u * 0.7, '#EEDDB8');
    teddy(w * 0.62, y1, u * 1.1); ball(w * 0.8, y1, u * 0.4); teddy(w * 0.9, y1, u * 0.6);
    block(w * 0.08, y2, u * 0.55, '#EACFCB'); ball(w * 0.28, y2, u * 0.55); teddy(w * 0.5, y2, u * 1.3); block(w * 0.68, y2, u * 0.9, '#D3E0E6'); ball(w * 0.9, y2, u * 0.3);
    shelf(y1); shelf(y2);
    ctx.fillStyle = '#E8D6BC'; ctx.fillRect(0, y2 + h * 0.055, w, h);
    ctx.fillStyle = 'rgba(214,192,160,0.5)'; for (x = 0; x < w; x += h * 0.12) ctx.fillRect(x, y2 + h * 0.055 + ((x / (h * 0.12)) % 2 ? h * 0.08 : 0), h * 0.12, h * 0.08);
  }, live: function (ctx, w, h, S, t, al) {   // a little pinwheel mobile turning
    var x = w * 0.9, y = h * 0.16, r = h * 0.07, rot = t * (0.6 + 2.5 * al);
    ctx.strokeStyle = '#C9B79C'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, y); ctx.stroke();
    var cs = ['#EACFCB', '#D3E0E6', '#EEDDB8', '#D9D0E6'];
    for (var i = 0; i < 4; i++) {
      var a = rot + i * Math.PI / 2; ctx.fillStyle = cs[i];
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); ctx.lineTo(x + Math.cos(a + 0.8) * r * 0.7, y + Math.sin(a + 0.8) * r * 0.7); ctx.closePath(); ctx.fill();
    }
    dot(ctx, x, y, 2.4, '#B9A58C');
    bunting(ctx, 0, h * 0.03, w * 0.5, h * 0.06, h, t, al);
  } };
  SCENE.street.live = function (ctx, w, h, S, t, al) {
    var n = w / h > 1.35 ? 4 : 3, sw = w / n;
    flag(ctx, sw * 2 + sw * 0.5, h * 0.7 - h * 0.55 - h * 0.05, h * 0.05, t, al, '#C4D6BA');
  };
  SCENE.shapes.live = function (ctx, w, h, S, t, al) { bunting(ctx, 0, h * 0.24, w, h * 0.06, h, t, al); };
  function flag(ctx, x, y, s, t, al, col) {
    ctx.strokeStyle = '#A9A29A'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x, y + s * 1.2); ctx.lineTo(x, y - s * 0.2); ctx.stroke();
    var wv = Math.sin(t * 3) * s * 0.12 * (1 + 2 * al);
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, y - s * 0.2); ctx.quadraticCurveTo(x + s * 0.5, y - s * 0.2 + wv, x + s, y + wv * 0.5);
    ctx.quadraticCurveTo(x + s * 0.5, y + s * 0.3 - wv, x, y + s * 0.4); ctx.closePath(); ctx.fill();
  }
  function bunting(ctx, x0, y0, x1w, sag, h, t, al) {
    var x1 = x0 + x1w, n = Math.max(5, Math.round(x1w / (h * 0.09))), cols = ['#EBC6C2', '#C9DCC3', '#EBDDB3', '#D5CCE3', '#C8DAE2'];
    ctx.strokeStyle = '#C9B79C'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2, y0 + sag * 2, x1, y0); ctx.stroke();
    for (var i = 0; i < n; i++) {
      var s = (i + 0.5) / n, x = x0 + (x1 - x0) * s, y = y0 + 2 * s * (1 - s) * sag * 2, sw = Math.sin(t * 1.8 + i * 0.9) * 0.1 * (1 + 2 * al), fs = h * 0.035;
      ctx.save(); ctx.translate(x, y); ctx.rotate(sw); ctx.fillStyle = cols[i % 5];
      ctx.beginPath(); ctx.moveTo(-fs, 0); ctx.lineTo(fs, 0); ctx.lineTo(0, fs * 1.6); ctx.closePath(); ctx.fill(); ctx.restore();
    }
  }

  /** Busy scenery of a board picture (w × h, board-local px): tree crowns + trunks, the tent and Ferris wheel, the chalkboard and
   *  the windows — the same geometry as the scene painters above. World.placeSlots prefers slots off these (open sky / grass / road)
   *  so a shadow is never "a tree with a grey smudge". opt.flip mirrors them like a flipped board. → [{x, y, w, h}] */
  function sceneBusy(scene, w, h, opt) {
    w = num(w, 0); h = num(h, 0);
    var out = [];
    function tr(x, by, H) { var r = H * 0.3, cy = by - H * 0.66; out.push({ x: x - 1.25 * r, y: cy - 1.1 * r, w: 2.5 * r, h: by - (cy - 1.1 * r) }); }
    function box(x, y, bw, bh) { out.push({ x: x, y: y, w: bw, h: bh }); }
    if (scene === 'street') { var n = w / h > 1.35 ? 4 : 3; tr(w / n, h * 0.76, h * 0.5); }
    else if (scene === 'shapes') { tr(w * 0.12, h * 0.36, h * 0.32); tr(w * 0.86, h * 0.36, h * 0.36); }
    else if (scene === 'balloons') {
      var tw = Math.min(w * 0.32, h * 0.6), tb = h * 0.72; box(w * 0.22 - 0.58 * tw, tb - h * 0.42, 1.16 * tw, h * 0.42);
      var R = h * 0.2, fy = h * 0.66 - R * 0.95; box(w * 0.9 - R - h * 0.03, fy - R - h * 0.02, 2 * R + h * 0.06, h * 0.66 - fy + R + h * 0.02);
    } else if (scene === 'park') { var gy = h * 0.56; tr(w * 0.42, gy + h * 0.02, h * 0.32); tr(w * 0.1, gy + h * 0.18, h * 0.62); tr(w * 0.92, gy + h * 0.1, h * 0.5); }
    else if (scene === 'letters') {
      var bw = Math.min(w * 0.5, h * 0.95); box(w * 0.06 - 6, h * 0.16 - 6, bw + 12, h * 0.42 + 12);
      box(w * 0.66 - 6, h * 0.14 - 6, Math.min(w * 0.26, h * 0.5) + 12, h * 0.4 + 16);
    } else if (scene === 'size') { box(w * 0.06 - 6, h * 0.07 - 6, Math.min(w * 0.22, h * 0.4) + 12, h * 0.24 + 16); }
    if (opt && opt.flip) out.forEach(function (r) { r.x = w - r.x - r.w; });
    return out;
  }

  var WASH = 'rgba(255,252,246,0.16)';       // calm wash so answer colours pop (baked into the cached picture)
  var boardCache = {}, boardOrder = [];
  function boardFront(scene, season, w, h, sc) {
    var key = scene + '|' + season + '|' + Math.round(w) + 'x' + Math.round(h) + '|' + sc, c = boardCache[key];
    if (c) return c;
    if (!canvasOK()) return null;
    c = newCanvas(w * sc, h * sc); var g = c.getContext('2d'); if (!g) return null;
    g.setTransform(sc, 0, 0, sc, 0, 0); SCENE[scene].front(g, w, h, seaOf(season));
    g.globalCompositeOperation = 'source-atop'; g.fillStyle = WASH; g.fillRect(0, 0, w, h);   // calm wash baked in
    boardCache[key] = c; boardOrder.push(key);
    while (boardOrder.length > 8) { var k = boardOrder.shift(); if (boardCache[k]) { boardCache[k].width = 0; boardCache[k].height = 0; } delete boardCache[k]; }
    return c;
  }
  function drawBoard(ctx, board, scene, season, opt) {
    if (!ctx || !board) return;
    opt = opt || {};
    var w = num(board.w, 0), h = num(board.h, 0); if (!(w > 4 && h > 4)) return;
    var r = Math.min(num(board.r, 26), w / 2, h / 2), F = num(opt.frame != null ? opt.frame : board.frame, 22);
    scene = SCENE[scene] ? scene : 'street';
    var si = Math.round(num(season, 0)), S = seaOf(si), sd = SCENE[scene], t = num(opt.t, 0), al = clamp01(opt.alive);
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // contact shadow + wooden frame (outside the picture)
    if (F > 0) {
      ctx.fillStyle = 'rgba(70,45,25,0.20)'; ctx.beginPath(); rrect(ctx, -F + 2, -F + 7, w + 2 * F, h + 2 * F, r + F * 0.8); ctx.fill();
      ctx.beginPath(); rrect(ctx, -F, -F, w + 2 * F, h + 2 * F, r + F * 0.8); rrect(ctx, 0, 0, w, h, r);
      var wg = ctx.createLinearGradient(0, -F, 0, h + F); wg.addColorStop(0, '#D49B60'); wg.addColorStop(1, '#BF8448');
      ctx.fillStyle = wg; ctx.fill('evenodd');
      ctx.save(); ctx.beginPath(); rrect(ctx, -F, -F, w + 2 * F, h + 2 * F, r + F * 0.8); rrect(ctx, 0, 0, w, h, r); ctx.clip('evenodd');
      ctx.strokeStyle = 'rgba(142,90,44,0.28)'; ctx.lineWidth = 1.4;
      for (var gi = 0; gi < 9; gi++) {   // wood grain
        var gy0 = -F + (gi + 0.5) * (h + 2 * F) / 9;
        ctx.beginPath(); ctx.moveTo(-F, gy0); ctx.bezierCurveTo(w * 0.3, gy0 - 6, w * 0.6, gy0 + 6, w + F, gy0 - 2); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(230,180,126,0.95)'; ctx.lineWidth = 3;     // top-left light bevel
      ctx.beginPath(); rrect(ctx, -F + 3, -F + 3, w + 2 * F - 6, h + 2 * F - 6, r + F * 0.8 - 3); ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = '#8E5A2C'; ctx.lineWidth = 3;
      ctx.beginPath(); rrect(ctx, -F, -F, w + 2 * F, h + 2 * F, r + F * 0.8); ctx.stroke();
      ctx.strokeStyle = '#8E5A2C'; ctx.lineWidth = 2.5; ctx.beginPath(); rrect(ctx, -1, -1, w + 2, h + 2, r + 1); ctx.stroke();
      var sr = Math.max(2.5, F * 0.17);
      var cq = r - (r + F / 2) * 0.7071;
      [[cq, cq], [w - cq, cq], [cq, h - cq], [w - cq, h - cq]].forEach(function (p, i) {   // 4 screws (on the frame's corner arcs)
        dot(ctx, p[0] + 0.6, p[1] + 1, sr, 'rgba(90,55,25,0.35)');
        dot(ctx, p[0], p[1], sr, '#E8DCC8'); ctx.strokeStyle = '#8E7A62'; ctx.lineWidth = 1.2; ctx.beginPath(); circ(ctx, p[0], p[1], sr); ctx.stroke();
        var a = 0.6 + i * 0.7; ctx.beginPath(); ctx.moveTo(p[0] - Math.cos(a) * sr * 0.6, p[1] - Math.sin(a) * sr * 0.6); ctx.lineTo(p[0] + Math.cos(a) * sr * 0.6, p[1] + Math.sin(a) * sr * 0.6); ctx.stroke();
      });
    }
    // the picture (mirrored on every other round: opt.flip — the 4 pictures of a chapter do not look the same)
    ctx.save(); ctx.beginPath(); rrect(ctx, 0, 0, w, h, r); ctx.clip();
    var flip = !!opt.flip;
    if (flip) { ctx.save(); ctx.translate(w, 0); ctx.scale(-1, 1); }
    var sk = ctx.createLinearGradient(0, 0, 0, h * 0.75); sk.addColorStop(0, mix(S.sky[0], '#FFFCF6', 0.16)); sk.addColorStop(1, mix(S.sky[1], '#FFFCF6', 0.16));
    ctx.fillStyle = sk; ctx.fillRect(0, 0, w, h);
    if (sd.outdoor) {
      if (S.sun) { dot(ctx, w * 0.84, h * 0.14, h * 0.1, 'rgba(255,248,214,0.55)'); dot(ctx, w * 0.84, h * 0.14, h * 0.065, '#FFF3C4'); }
      for (var ci = 0; ci < 3; ci++) {
        var cx = ((ci * 0.37 + t * 0.006 * (1 + 3 * al)) % 1.2) * w * 1.0 - w * 0.1, cy = h * (0.1 + ci * 0.07);
        cloudShape(ctx, cx, cy, h * (0.07 + 0.015 * ci), si === 3 ? 0.8 : 1);
      }
    }
    var front = boardFront(scene, si, w, h, pxScale(ctx, 2));
    if (front) ctx.drawImage(front, 0, 0, w, h);
    else { ctx.save(); sd.front(ctx, w, h, S); ctx.restore(); ctx.fillStyle = WASH; ctx.fillRect(0, 0, w, h); }
    if (sd.live) { ctx.save(); sd.live(ctx, w, h, S, t, al); ctx.restore(); }
    if (flip) ctx.restore();
    // inner frame shadow (the picture sits a little deeper)
    ctx.strokeStyle = 'rgba(80,50,25,0.22)'; ctx.lineWidth = 10; ctx.beginPath(); rrect(ctx, -3, -3, w + 6, h + 6, r + 3); ctx.stroke();
    var shine = num(opt.shine, 0);
    if (shine > 0 && shine < 1) {
      var bx = -w * 0.35 + shine * (w * 1.7), bw = Math.max(w, h) * 0.16;
      ctx.save(); ctx.transform(1, 0, -0.45, 1, h * 0.25, 0);
      var sg = ctx.createLinearGradient(bx - bw, 0, bx + bw, 0);
      sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.55)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg; ctx.fillRect(bx - bw, -10, bw * 2, h + 20);
      ctx.restore();
    }
    ctx.restore();
    ctx.restore();
  }

  // ================================================================= TRAY
  function drawTray(ctx, tray, season, opt) {
    if (!ctx || !tray) return;
    opt = opt || {};
    var x = num(tray.x, 0), y = num(tray.y, 0), w = num(tray.w, 0), h = num(tray.h, 0); if (!(w > 4 && h > 4)) return;
    var S = seaOf(season), r = Math.min(22, h * 0.3), lip = Math.min(22, Math.max(12, h * 0.16)), item = num(opt.item, 112);
    ctx.save(); ctx.lineJoin = 'round';
    ctx.fillStyle = 'rgba(70,45,25,0.16)'; ctx.beginPath(); rrect(ctx, x + 2, y + 6, w, h, r); ctx.fill();
    // wooden tray: rim + soft felt inside
    ctx.fillStyle = '#C98D52'; ctx.beginPath(); rrect(ctx, x, y, w, h, r); ctx.fill();
    ctx.strokeStyle = '#8E5A2C'; ctx.lineWidth = 2.5; ctx.stroke();
    var fg = ctx.createLinearGradient(0, y, 0, y + h); fg.addColorStop(0, '#E4CFAE'); fg.addColorStop(1, '#EEDFC6');   // a touch darker felt so yellow / orange pieces stand off it (visual P3-7)
    ctx.fillStyle = fg; ctx.beginPath(); rrect(ctx, x + 9, y + 8, w - 18, h - 8 - lip, Math.max(6, r - 8)); ctx.fill();
    ctx.strokeStyle = 'rgba(142,90,44,0.45)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.save(); ctx.beginPath(); rrect(ctx, x + 9, y + 8, w - 18, h - 8 - lip, Math.max(6, r - 8)); ctx.clip();
    ctx.strokeStyle = 'rgba(110,70,35,0.16)'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(x, y + 10); ctx.lineTo(x + w, y + 10); ctx.stroke();
    ctx.restore();
    // front lip with grain + highlight
    ctx.fillStyle = '#B97E45'; ctx.beginPath(); rrect(ctx, x, y + h - lip, w, lip, Math.min(r, lip / 2)); ctx.fill();
    ctx.strokeStyle = 'rgba(230,180,126,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + r * 0.6, y + h - lip + 2); ctx.lineTo(x + w - r * 0.6, y + h - lip + 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(142,90,44,0.35)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x + 14, y + h - lip * 0.45); ctx.bezierCurveTo(x + w * 0.3, y + h - lip * 0.6, x + w * 0.7, y + h - lip * 0.3, x + w - 14, y + h - lip * 0.5); ctx.stroke();
    ctx.strokeStyle = '#8E5A2C'; ctx.lineWidth = 2.5; ctx.beginPath(); rrect(ctx, x, y, w, h, r); ctx.stroke();
    // resting dimples under each spot
    (tray.spots || []).forEach(function (s) {
      var sy = Math.min(y + h - lip - 6, num(s.y, 0) + item * 0.42);
      oval(ctx, num(s.x, 0), sy, item * 0.36, item * 0.07, 0, 'rgba(120,80,40,0.13)');
    });
    // season touch on the rim
    if (S.snow) { snowCap(ctx, x + r * 0.5, y + 1, w - r, 6); }
    else if (season === 2 || season === 0) {
      var cs = season === 2 ? ['#D9A15A', '#C77F4A'] : ['#F7DDE6', '#FFFFFF'];
      [[0.08, 0.2], [0.93, -0.5], [0.5, 1.1]].forEach(function (q, i) {
        ctx.save(); ctx.translate(x + w * q[0], y + 4); ctx.rotate(q[1]); ctx.fillStyle = cs[i % 2]; ctx.strokeStyle = softLine(cs[0]); ctx.lineWidth = 1;
        ctx.beginPath(); ell(ctx, 0, 0, 7, 3.6, 0); ctx.fill(); ctx.stroke(); ctx.restore();
      });
    }
    ctx.restore();
  }

  // ================================================================= BUBBLE
  function drawBubble(ctx, r, opt) {
    if (!ctx) return;
    r = num(r, 30); if (!(r > 0.5)) return;
    opt = opt || {};
    var pop = clamp01(opt.pop), t = num(opt.t, 0);
    if (pop >= 1) return;
    ctx.save();
    if (pop > 0) {   // ring breaks into droplets
      var q = pop, rr = r * (1 + 0.35 * q);
      ctx.globalAlpha *= 1 - q;
      for (var i = 0; i < 10; i++) {
        var a = i * TAU / 10 + 0.3; dot(ctx, Math.cos(a) * rr * (1 + 0.3 * q), Math.sin(a) * rr * (1 + 0.3 * q), Math.max(1.2, r * 0.1 * (1 - q * 0.4)), i % 2 ? 'rgba(200,230,255,0.95)' : 'rgba(255,230,250,0.95)');
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = Math.max(1, r * 0.06);
      for (i = 0; i < 6; i++) { a = i * TAU / 6 + q; ctx.beginPath(); ctx.arc(0, 0, rr, a, a + 0.45 * (1 - q)); ctx.stroke(); }
      ctx.restore(); return;
    }
    var wob = Math.sin(t * 3.1) * 0.03;
    ctx.scale(1 + wob, 1 - wob);
    // visible on the pale board too (visual P2-9): a milky fill, a strong blue rim, the rainbow sheen and a big white glint
    var g = ctx.createRadialGradient(-r * 0.25, -r * 0.3, r * 0.1, 0, 0, r);
    g.addColorStop(0, 'rgba(255,255,255,0.28)'); g.addColorStop(0.7, 'rgba(225,240,255,0.3)'); g.addColorStop(1, 'rgba(190,215,250,0.5)');
    ctx.fillStyle = g; ctx.beginPath(); circ(ctx, 0, 0, r); ctx.fill();
    ctx.strokeStyle = 'rgba(120,170,230,0.85)'; ctx.lineWidth = 4; ctx.beginPath(); circ(ctx, 0, 0, r - 2); ctx.stroke();
    var hues = ['rgba(255,150,190,0.55)', 'rgba(255,210,120,0.55)', 'rgba(150,230,170,0.55)', 'rgba(130,190,255,0.6)', 'rgba(200,150,255,0.55)'];
    ctx.lineWidth = Math.max(1.2, r * 0.07);
    for (i = 0; i < 10; i++) {
      var a0 = i * TAU / 10 + t * 0.6;
      ctx.strokeStyle = hues[i % 5]; ctx.beginPath(); ctx.arc(0, 0, r * 0.95, a0, a0 + TAU / 10 + 0.02); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = Math.max(1, r * 0.035); ctx.beginPath(); circ(ctx, 0, 0, r); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.55, Math.PI * 1.08, Math.PI * 1.45); ctx.stroke();   // the upper-left glint arc
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ell(ctx, -r * 0.4, -r * 0.42, r * 0.2, r * 0.11, -0.75); ctx.fill();
    dot(ctx, -r * 0.12, -r * 0.62, r * 0.06, 'rgba(255,255,255,0.85)');
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = Math.max(1, r * 0.05);
    ctx.beginPath(); ctx.arc(0, 0, r * 0.75, 0.3, 1.1); ctx.stroke();
    ctx.restore();
  }

  // ================================================================= ICON
  function drawIcon(ctx, thing, size) {
    if (!ctx || !thing) return;
    size = num(size, 100); if (!(size > 0)) return;
    var t = thing, k = t.kind;
    ctx.save();
    if (k === 'number' || k === 'letter') {
      drawPiece(ctx, { kind: 'glyph', text: k === 'number' ? (t.n != null ? t.n : t.text) : t.text, color: t.color }, size * 0.86, {});
    } else if (k === 'color') {
      var c = pal(t.color), s = size / 100;
      ctx.scale(s, s); ctx.lineJoin = 'round';
      var blob = function (x) {
        x.moveTo(40, 0);
        for (var i = 1; i <= 9; i++) { var a = i * TAU / 9, am = a - TAU / 18, ro = i % 2 ? 44 : 38; x.quadraticCurveTo(Math.cos(am) * 48, Math.sin(am) * 46, Math.cos(a) * ro, Math.sin(a) * ro * 0.95); }
        x.closePath();
      };
      cel(ctx, 'ic.blob', blob, c, { s: 5, hl: [-16, -18, 10, 6, -0.6] });
      dot(ctx, 30, 34, 6, c.base); ctx.strokeStyle = lineOf(c); ctx.lineWidth = 2.4; ctx.beginPath(); circ(ctx, 30, 34, 6); ctx.stroke();
      dot(ctx, 4, -24, 3.5, 'rgba(255,255,255,0.7)');
    } else if (k === 'size') {
      var big = t.big === true || t.size === 'big', inner = t.animal ? { kind: 'animal', animal: t.animal } : { kind: 'obj', obj: t.obj || 'car', color: t.color || 'red' };
      if (big) drawPiece(ctx, inner, size * 0.92, {});
      else {
        ctx.strokeStyle = 'rgba(120,100,80,0.28)'; ctx.setLineDash([5, 5]); ctx.lineWidth = 2;
        ctx.beginPath(); rrect(ctx, -size * 0.44, -size * 0.44, size * 0.88, size * 0.88, size * 0.12); ctx.stroke(); ctx.setLineDash([]);
        ctx.translate(0, size * 0.14); drawPiece(ctx, inner, size * 0.48, {});
      }
    } else if (k === 'obj' || k === 'shape' || k === 'bunch' || k === 'dots' || k === 'animal' || k === 'glyph') {
      drawPiece(ctx, t, size * 0.92, {});
    } else {
      dot(ctx, 0, 0, size * 0.35, NEUTRAL.base); ctx.strokeStyle = NEUTRAL.dark; ctx.lineWidth = 3; ctx.beginPath(); circ(ctx, 0, 0, size * 0.35); ctx.stroke();
    }
    ctx.restore();
  }

  // ================================================================= GHOST HAND (points up-left, tip at origin)
  function drawGhostHand(ctx, size, press) {
    if (!ctx) return;
    var s = num(size, 100); if (!(s > 0)) return;
    var p = clamp01(press), F = '#FFF6EA', L = '#B9835A', EDGE = '#4A3B5C';
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
    hand(ctx); ctx.lineWidth = s * 0.07 + 6; ctx.strokeStyle = EDGE; ctx.stroke(); ctx.restore();
    hand(ctx); ctx.lineWidth = s * 0.07; ctx.strokeStyle = L; ctx.stroke();
    hand(ctx); ctx.fillStyle = F; ctx.fill();
    ctx.strokeStyle = '#F1D6B8'; ctx.lineWidth = s * 0.03;
    ctx.beginPath(); ctx.moveTo(0, s * 0.5); ctx.lineTo(s * 0.18, s * 0.5); ctx.moveTo(0, s * 0.62); ctx.lineTo(s * 0.18, s * 0.62); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.beginPath(); ell(ctx, -s * 0.03, s * 0.12, s * 0.025, s * 0.07, 0); ctx.fill();
    // cuff: Pom's cream knitted scarf with brown stripes
    ctx.fillStyle = '#F1E6CF'; ctx.strokeStyle = '#A27B55'; ctx.lineWidth = s * 0.035;
    ctx.beginPath(); rrect(ctx, -s * 0.25, s * 0.76, s * 0.46, s * 0.15, s * 0.06); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#A27B55'; ctx.fillRect(-s * 0.2, s * 0.8, s * 0.36, s * 0.025); ctx.fillRect(-s * 0.2, s * 0.85, s * 0.36, s * 0.025);
    ctx.restore();
  }

  function clearCache() {
    pcache = {}; pN = 0; bcache = {}; geomCache = {}; specCache = {}; bunchCache = {}; dotsCache = {};
    Object.keys(layerCache).forEach(function (k) { freeLayer(layerCache[k]); }); layerCache = {}; layerOrder = [];
    Object.keys(boardCache).forEach(function (k) { boardCache[k].width = 0; }); boardCache = {}; boardOrder = [];
    Object.keys(spriteCache).forEach(function (k) { spriteCache[k].c.width = 0; }); spriteCache = {}; spriteOrder = [];
    measureCtx = null;
  }

  PZ.PuzzleArt = {
    drawPiece: drawPiece, drawShadow: drawShadow, pieceBox: pieceBox, drawBoard: drawBoard, drawTray: drawTray,
    drawBubble: drawBubble, drawIcon: drawIcon, drawGhostHand: drawGhostHand, sceneBusy: sceneBusy,
    pal: pal, PALETTE: FALLBACK, FONT: FONT, OBJECTS: OBJECTS, SHAPES: SHAPES, ANIMALS: ANIMALS, SCENES: SCENES,
    thingKey: thingKey, clearCache: clearCache
  };
})(typeof window !== 'undefined' ? window : this);
