/* Mit's Treasure Map — TM.PuzzleArt (character artist B), DESIGN §0.2 / §0.5 / §3 / §4.2. Everything here is drawn by code
 * on a 2D canvas (pirate island cove theme: map pieces on old parchment, floating in the shallow water at the shore).
 *
 *   drawPiece(ctx, thing, size, opt)   origin = piece CENTRE, size = the piece's longest side (px).
 *       thing = { kind: 'obj'|'shape'|'coins'|'dots'|'animal'|'glyph', obj?, color?, shape?, n?, animal?, text? }
 *               ('bunch' is kept as an alias of 'coins')
 *       opt   = { glow 0..1 (gold halo), lift 0..1 (drop shadow below), dim 0..1, count -1|0..n (lit coins / dots: the
 *                 first `count` get a white ring), alive 0..1 (the "comes alive" pose), season 0..3, t (s, idle phase) }
 *       obj ∈ boat, flag, pail, parasol, hat, shell, kite, bottle   (thing.color = answer colour, details neutral)
 *       animal ∈ parrot, turtle, fish, monkey, octopus, seagull, dolphin, starfish   (stickers, 6 px white border)
 *   drawShadow(ctx, thing, size, opt)  the empty slot: EXACTLY the piece's silhouette (same paths / same text drawing),
 *       styled per §3 (rgba(40,36,60,.30) fill, 4 px darker inner rim, inner bevel, dashed light outline 10/8).
 *       opt = { glow 0..1 (pulsing gold rim), alpha 0..1 }
 *   pieceBox(thing, size) → { w, h }   the visible bounding box; max(w, h) === size (the longest side is `size`), except
 *                                      coins: one constant coin size for every n (n = 5 fills `size`, fewer coins → smaller box).
 *   coinSpots(n, size) → [{ x, y, r }] the coin centres / radii (px, relative to the piece centre, counting order: top row
 *       left → right, then the bottom row) — for count sparkles / "ting" fx.
 *   drawBoard(ctx, board, scene, season, opt)   origin = board top-left; board = { w, h, r, frame? }. Rope-and-wood frame
 *       OUTSIDE (thickness opt.frame || board.frame || 22), an old-parchment picture inside clipped to the rounded rect.
 *       scene ∈ cove | sails | cave | lagoon | shore | deck (old names street/shapes/balloons/park/size/letters map to
 *       cove/sails/cave/lagoon/shore/deck). season = weather mood 0 sunny, 1 breezy, 2 rain, 3 rainbow.
 *       opt = { shine 0..1, alive 0..1, t (s), frame, flip }
 *   sceneBusy(scene, w, h, opt) → [{x, y, w, h}] busy scenery boxes (board-local) slots should avoid.
 *   drawTray(ctx, tray, season, opt)   the shallow turquoise water strip at the shore; tray = { x, y, w, h, spots? } in the
 *       CURRENT coordinates (not translated); opt = { item (px, for the ripples under resting pieces; default 112), t }
 *   drawChest(ctx, size, open, t)      treasure chest, origin = BOTTOM CENTRE, size = chest width; open 0..1 (lid on its hinge,
 *                                      gold coins + glow inside), t (s, glints)
 *   drawScroll(ctx, w, r)              a rolled parchment cylinder, origin = centre, length w (horizontal), radius r
 *   drawFish(ctx, size, a)             a friendly fish head peeking out of the water, origin = waterline centre,
 *                                      size = head width, a = 0..1 visibility (0 under water … 1 fully up)
 *   drawBubble(ctx, r, opt)            soap bubble, origin = centre; opt = { pop 0..1 (0 whole … 1 gone), t }
 *   drawIcon(ctx, thing, size)         centred in a size × size box: any piece thing, or number {n} | color {color} |
 *                                      size {big, obj?, color?, animal?} | letter {text}
 *   drawGhostHand(ctx, size, press)    friendly pointing hand, origin = fingertip (finger points UP-LEFT), press 0..1
 *   Helpers: pal(color), PALETTE, FONT, OBJECTS, SHAPES, ANIMALS, SCENES, SCENE_ALIAS, thingKey(thing), clearCache().
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
  var TM = G.TM = G.TM || {};

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
  var OBJECTS = ['boat', 'flag', 'pail', 'parasol', 'hat', 'shell', 'kite', 'bottle'];
  var SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'rect', 'diamond', 'oval'];
  var ANIMALS = ['parrot', 'turtle', 'fish', 'monkey', 'octopus', 'seagull', 'dolphin', 'starfish'];
  var SCENES = ['cove', 'sails', 'cave', 'lagoon', 'shore', 'deck'];
  var SCENE_ALIAS = { street: 'cove', shapes: 'sails', balloons: 'cave', park: 'lagoon', size: 'shore', letters: 'deck' };
  var EYE = '#2F2A3A', CHEEK = '#F4A9A0';
  // neutral detail palettes (never an answer colour)
  var N = {
    cream: { base: '#FFF3DC', dark: '#B89B72', light: '#FFFFFF' },
    sail:  { base: '#FBF3E2', dark: '#B39A74', light: '#FFFFFF' },
    glass: { base: '#DCEEF6', dark: '#7F98AA', light: '#FFFFFF' },
    wood:  { base: '#C99560', dark: '#7A5232', light: '#E8C092' },
    sand:  { base: '#F1DDB0', dark: '#BF9F68', light: '#FBF0D6' },
    brass: { base: '#E2BE6A', dark: '#9A7428', light: '#F8E3A8' },
    metal: { base: '#C9C6D0', dark: '#7E7A8C', light: '#F2F0F5' },
    gold:  { base: '#F2C14E', dark: '#B8862A', light: '#FFE6A0' },
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
    var P = TM.PALETTE, c = P && P[name] && P[name].base ? P[name] : FALLBACK[name];
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


  // ================================================================= OBJECTS (thing.color) — beach & pirate things
  function bez(p0, p1, p2, p3, s) { var u = 1 - s; return [u * u * u * p0[0] + 3 * u * u * s * p1[0] + 3 * u * s * s * p2[0] + s * s * s * p3[0], u * u * u * p0[1] + 3 * u * u * s * p1[1] + 3 * u * s * s * p2[1] + s * s * s * p3[1]]; }
  function bowB(x, y, r, rot) {
    return function (t) {
      var c = Math.cos(rot), s = Math.sin(rot);
      function R(px, py) { return [x + px * c - py * s, y + px * s + py * c]; }
      rpoly(t, [R(0, 0), R(-r, -r * 0.75), R(-r, r * 0.75)], 1.4);
      rpoly(t, [R(0, 0), R(r, -r * 0.75), R(r, r * 0.75)], 1.4);
    };
  }
  function rotAbout(ctx, x, y, a) { if (a) { ctx.translate(x, y); ctx.rotate(a); ctx.translate(-x, -y); } }
  function sandDots(x, pts, col) { for (var i = 0; i < pts.length; i++) dot(x, pts[i][0], pts[i][1], pts[i][2] || 1.3, col); }
  function anchorMark(ctx, x, y, s, col, w) {   // a tiny anchor (line art)
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = w || 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); circ(ctx, x, y - s * 0.78, s * 0.2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y - s * 0.58); ctx.lineTo(x, y + s * 0.62);
    ctx.moveTo(x - s * 0.36, y - s * 0.32); ctx.lineTo(x + s * 0.36, y - s * 0.32);
    ctx.moveTo(x - s * 0.62, y + s * 0.12); ctx.quadraticCurveTo(x - s * 0.5, y + s * 0.66, x, y + s * 0.66);
    ctx.quadraticCurveTo(x + s * 0.5, y + s * 0.66, x + s * 0.62, y + s * 0.12); ctx.stroke();
    ctx.restore();
  }
  function porthole(ctx, x, y, r, line) {
    dot(ctx, x, y, r, N.glass.base);
    ctx.strokeStyle = N.brass.dark; ctx.lineWidth = 2; ctx.beginPath(); circ(ctx, x, y, r); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(x, y, r * 0.55, Math.PI * 1.05, Math.PI * 1.6); ctx.stroke();
  }

  // --- boat: a little sailboat (hull + a cream main sail with a colour band + a coloured jib + a pennant)
  var boatHull = function (t) { rpoly(t, [[-49, 9], [51, 7], [34, 38], [-36, 38]], [4, 4, 11, 11]); };
  var boatMast = function (t) { rrect(t, -3, -50, 6, 62, 3); };
  var boatMain = function (t) { t.moveTo(6, -45); t.quadraticCurveTo(36, -22, 44, 1); t.lineTo(6, 1); t.closePath(); };
  var boatJib = function (t) { t.moveTo(-7, -36); t.quadraticCurveTo(-30, -14, -38, 1); t.lineTo(-7, 1); t.closePath(); };
  var boatPen = function (t) { rpoly(t, [[-1, -52], [-25, -46.5], [-1, -41]], [1.5, 2, 1.5]); };
  // --- flag on a pole, waving (pole + brass knob + a sand mound + the cloth)
  var flagPole = function (t) { rrect(t, -37, -44, 6.4, 88, 3.2); };
  var flagKnob = function (t) { circ(t, -33.8, -47, 5.6); };
  var flagMound = function (t) { ell(t, -33.8, 44, 19, 6.5, 0); };
  function flagCloth(p) {
    return function (t) {
      t.moveTo(-31, -42); t.bezierCurveTo(-8, -53 + p, 18, -31 - p, 47, -42 + p * 0.6);
      t.lineTo(47, -3 + p * 0.6); t.bezierCurveTo(18, 7 - p, -8, -14 + p, -31, -4); t.closePath();
    };
  }
  var flagCloth0 = flagCloth(0);
  // --- pail: a sand bucket with a handle, sand heaped on top
  var pailBody = function (t) { rpoly(t, [[-35, -14], [35, -14], [26, 46], [-26, 46]], [2, 2, 8, 8]); };
  var pailRim = function (t) { rrect(t, -39.5, -22, 79, 12, 6); };
  var pailHandle = function (t) { t.moveTo(-33, -16); t.bezierCurveTo(-34, -58, 34, -58, 33, -16); };
  var pailSand = function (t) { t.moveTo(-31, -19); t.quadraticCurveTo(-20, -37, -2, -35); t.quadraticCurveTo(18, -40, 31, -19); t.closePath(); };
  var pailStar = function (t) { rpoly(t, starPts(12, 5.5, 5).map(function (p) { return [p[0], p[1] + 14]; }), 2.2); };
  // --- parasol: a striped beach umbrella standing in a sand mound
  var PX = [50, 30, 10, -10, -30, -50];
  var paraCanopy = function (t) {
    t.moveTo(-50, -6); t.bezierCurveTo(-50, -35, -26, -50, 0, -50); t.bezierCurveTo(26, -50, 50, -35, 50, -6);
    for (var i = 0; i < 5; i++) t.quadraticCurveTo((PX[i] + PX[i + 1]) / 2, 3, PX[i + 1], -6);
    t.closePath();
  };
  var paraFinial = function (t) { circ(t, 0, -52, 4.2); };
  var paraPole = function (t) { t.moveTo(0, -8); t.lineTo(0, 40); };
  var paraMound = function (t) { ell(t, 0, 42, 25, 7, 0); };
  // --- hat: a tricorn pirate hat (no skull): crown dome behind the up-turned brim, cream braid, brass button, a feather
  var hatBrimTop = function (t) {
    t.moveTo(-52, -30); t.quadraticCurveTo(-40, -10, -21, -15); t.bezierCurveTo(-17, -42, 17, -42, 21, -15); t.quadraticCurveTo(40, -10, 52, -30);
  };
  var hatBrim = function (t) { hatBrimTop(t); t.bezierCurveTo(50, 4, 27, 22, 0, 24); t.bezierCurveTo(-27, 22, -50, 4, -52, -30); t.closePath(); };
  // --- shell: a scallop (a ribbed fan + two little "ears" at the hinge)
  var SC = [0, 30], SR = 60, SA0 = -Math.PI + 0.42, SA1 = -0.42, SNB = 7, SHP = [];
  for (var si = 0; si <= SNB; si++) { var sa = SA0 + (SA1 - SA0) * si / SNB; SHP.push([SC[0] + Math.cos(sa) * SR, SC[1] + Math.sin(sa) * SR]); }
  var shellFan = function (t) {
    t.moveTo(-9, 33); t.lineTo(SHP[0][0], SHP[0][1]);
    for (var i = 0; i < SNB; i++) {
      var am = SA0 + (SA1 - SA0) * (i + 0.5) / SNB;
      t.quadraticCurveTo(SC[0] + Math.cos(am) * SR * 1.13, SC[1] + Math.sin(am) * SR * 1.13, SHP[i + 1][0], SHP[i + 1][1]);
    }
    t.lineTo(9, 33); t.closePath();
  };
  var shellEars = function (t) { rpoly(t, [[-21, 29], [21, 29], [15, 42], [-15, 42]], 3.5); };
  // --- kite (diamond + tail with two bows)
  var KITE = [[-6, -50], [28, -26], [2, 14], [-36, -18]], KC = [-3, -22];
  var kiteQuad = function (t) { rpoly(t, KITE, 4); };
  var kiteTail = function (t) { t.moveTo(2, 14); t.bezierCurveTo(16, 26, 18, 44, 44, 46); };
  var TAILP = [[2, 14], [16, 26], [18, 44], [44, 46]];
  var kiteBows = [0.42, 0.72].map(function (s, i) { var p = bez(TAILP[0], TAILP[1], TAILP[2], TAILP[3], s); return bowB(p[0], p[1], 6, 0.5 + i * 0.4); });
  // --- bottle: a message bottle (coloured glass, cork, a rolled note inside)
  var bottleBody = function (t) {
    t.moveTo(-9, -35); t.lineTo(-9, -26); t.bezierCurveTo(-9, -15, -25, -16, -25, -3); t.lineTo(-25, 34); t.quadraticCurveTo(-25, 46, -13, 46);
    t.lineTo(13, 46); t.quadraticCurveTo(25, 46, 25, 34); t.lineTo(25, -3); t.bezierCurveTo(25, -16, 9, -15, 9, -26); t.lineTo(9, -35); t.closePath();
  };
  var bottleLip = function (t) { rrect(t, -12.5, -40, 25, 7.5, 3.5); };
  var bottleCork = function (t) { rrect(t, -8, -52, 16, 14, 4); };

  var OBJ = {
    boat: { sil: [boatMast, boatMain, boatJib, boatPen, boatHull], draw: function (ctx, c, o) {
      var al = o.alive || 0, tt = o.t || 0;
      ctx.save(); rotAbout(ctx, 0, 38, al * Math.sin(tt * 2.4) * 0.06);
      cel(ctx, 'bo.mast', boatMast, N.wood, { s: 1.5, hl: false });
      cel(ctx, 'bo.main', boatMain, N.sail, { s: 4, hl: [18, -14, 4, 7, 0.5], inner: function (x) {
        x.fillStyle = c.base; x.fillRect(0, -21, 50, 10);
        x.strokeStyle = lineOf(c); x.lineWidth = 1.6; x.beginPath(); x.moveTo(0, -21); x.lineTo(50, -21); x.moveTo(0, -11); x.lineTo(50, -11); x.stroke();
      } });
      cel(ctx, 'bo.jib', boatJib, c, { s: 3, hl: [-15, -10, 3, 6, -0.5] });
      var fl = al * Math.sin(tt * 9) * 2.2;
      ctx.save(); ctx.translate(0, fl * 0.2); cel(ctx, 'bo.pen', boatPen, c, { s: 1.5, hl: false }); ctx.restore();
      cel(ctx, 'bo.hull', boatHull, c, { s: 5, hl: [-26, 16, 12, 2.6, -0.02], inner: function (x) {
        x.fillStyle = c.light; x.fillRect(-55, 7, 110, 6);
        x.strokeStyle = lineOf(c); x.lineWidth = 1.6; x.beginPath(); x.moveTo(-55, 13); x.lineTo(55, 13); x.stroke();
      } });
      [-18, 0, 18].forEach(function (px) { porthole(ctx, px, 24, 4.6); });
      ctx.restore();
    } },
    flag: { sil: [flagPole, flagKnob, flagMound, flagCloth0], draw: function (ctx, c, o) {
      var al = o.alive || 0, p = al > 0.05 ? Math.round(al * Math.sin((o.t || 0) * 5.5) * 6 * 2) / 2 : 0;
      cel(ctx, 'fl.mound', flagMound, N.sand, { s: 2, hl: [-42, 41, 5, 1.6, 0] });
      sandDots(ctx, [[-44, 45], [-26, 46], [-36, 47.5]], N.sand.dark);
      cel(ctx, 'fl.pole', flagPole, N.wood, { s: 1.8, hl: false, inner: function (x) { x.fillStyle = rgba(N.wood.light, 0.8); x.fillRect(-35.6, -40, 1.8, 80); } });
      cel(ctx, 'fl.knob', flagKnob, N.brass, { s: 1.5, hl: [-35.5, -49, 1.8, 1.4, 0] });
      var cl = p ? flagCloth(p) : flagCloth0;
      cel(ctx, 'fl.cloth' + p, cl, c, { s: 4, hl: false, inner: function (x) {
        x.fillStyle = rgba(c.dark, 0.22); x.beginPath(); ell(x, 14, -22 - p * 0.3, 8, 30, 0.12); x.fill();
        x.fillStyle = rgba(mix(c.light, '#FFFFFF', 0.4), 0.55); x.beginPath(); ell(x, -18, -26 + p * 0.3, 5, 22, 0.1); x.fill();
      } });
      anchorMark(ctx, 9, -23 - p * 0.2, 12, N.cream.base, 3);
    } },
    pail: { sil: [{ b: pailHandle, w: 4.4 }, pailSand, pailRim, pailBody], draw: function (ctx, c, o) {
      var al = o.alive || 0;
      ctx.lineCap = 'round';
      stroke(ctx, pailHandle, N.metal.dark, 4.4); stroke(ctx, pailHandle, N.metal.base, 2);
      cel(ctx, 'pa.sand', pailSand, N.sand, { s: 3, hl: [-12, -30, 6, 2.4, -0.2] });
      sandDots(ctx, [[-14, -26], [6, -30], [18, -24], [-2, -23], [-22, -22]], N.sand.dark);
      cel(ctx, 'pa.body', pailBody, c, { s: 6, hl: [-20, 2, 3.4, 12, 0.1], inner: function (x) {
        x.fillStyle = rgba(c.light, 0.85); x.fillRect(-40, -12, 80, 5);
      } });
      if (al > 0.3) tileFace(ctx, 0, 14, 16 * Math.min(1, al * 1.6), lineOf(c));
      else part(ctx, 'pa.star', pailStar, N.cream.base, N.cream.dark, 2);
      cel(ctx, 'pa.rim', pailRim, c, { s: 2.5, hl: [-24, -19, 9, 1.6, 0] });
      dot(ctx, -33, -16, 2.6, N.metal.dark); dot(ctx, 33, -16, 2.6, N.metal.dark);
    } },
    parasol: { sil: [paraMound, { b: paraPole, w: 5.2 }, paraCanopy, paraFinial], draw: function (ctx, c, o) {
      var al = o.alive || 0;
      cel(ctx, 'pr.mound', paraMound, N.sand, { s: 2, hl: [-10, 39, 6, 1.6, 0] });
      sandDots(ctx, [[-14, 44], [12, 45], [4, 47]], N.sand.dark);
      ctx.save(); rotAbout(ctx, 0, 42, al * Math.sin((o.t || 0) * 2.6) * 0.07);
      ctx.lineCap = 'round';
      stroke(ctx, paraPole, N.wood.dark, 5.2); stroke(ctx, paraPole, N.cream.base, 2.4);
      cel(ctx, 'pr.can', paraCanopy, c, { s: 5, hl: false, inner: function (x) {
        x.fillStyle = N.sail.base;
        for (var i = 1; i < 5; i += 2) {
          x.beginPath(); x.moveTo(0, -50); x.quadraticCurveTo(PX[i] * 0.55, -40, PX[i], -6);
          x.quadraticCurveTo((PX[i] + PX[i + 1]) / 2, 3, PX[i + 1], -6); x.quadraticCurveTo(PX[i + 1] * 0.55, -40, 0, -50); x.fill();
        }
        x.fillStyle = rgba('#FFFFFF', 0.45); x.beginPath(); ell(x, -24, -32, 9, 4, -0.7); x.fill();
        x.strokeStyle = lineOf(c); x.lineWidth = 1.8;
        x.beginPath(); for (i = 1; i < 5; i++) { x.moveTo(0, -50); x.quadraticCurveTo(PX[i] * 0.55, -40, PX[i], -6); } x.stroke();
      } });
      cel(ctx, 'pr.fin', paraFinial, N.wood, { s: 1.2, hl: false });
      ctx.restore();
    } },
    hat: { sil: [hatBrim], draw: function (ctx, c, o) {
      var al = o.alive || 0, tt = o.t || 0;
      ctx.save(); ctx.translate(0, -al * Math.abs(Math.sin(tt * 5)) * 2.5); rotAbout(ctx, 0, 20, al * Math.sin(tt * 3) * 0.06);
      cel(ctx, 'ha.brim', hatBrim, c, { s: 5, hl: [-12, -26, 5, 6, 0.5], inner: function (x) {
        x.strokeStyle = rgba(c.dark, 0.35); x.lineWidth = 7; x.beginPath(); x.moveTo(-48, -6); x.bezierCurveTo(-30, 14, 30, 14, 48, -6); x.stroke();
        x.save(); x.translate(0, 4.4); x.strokeStyle = N.brass.base; x.lineWidth = 4.6; x.beginPath(); hatBrimTop(x); x.stroke();
        x.strokeStyle = N.brass.dark; x.lineWidth = 1; x.setLineDash([2.5, 3.5]); x.beginPath(); hatBrimTop(x); x.stroke(); x.setLineDash([]); x.restore();
        x.fillStyle = rgba(mix(c.light, '#FFFFFF', 0.4), 0.75); x.beginPath(); ell(x, -34, -6, 7, 3, 0.5); x.fill();
      } });
      // a cream cockade rosette with a brass button (no skull)
      var ck = function (t) { for (var i = 0; i < 8; i++) { var a = i * TAU / 8; circ(t, -20 + Math.cos(a) * 5.2, -2 + Math.sin(a) * 5.2, 4); } };
      part(ctx, 'ha.ck', ck, N.cream.base, N.cream.dark, 1.6);
      ctx.fillStyle = N.cream.base; ctx.beginPath(); circ(ctx, -20, -2, 6); ctx.fill();
      part(ctx, 'ha.btn', function (t) { circ(t, -20, -2, 4); }, N.brass.base, N.brass.dark, 1.6);
      dot(ctx, -21.2, -3.3, 1.3, N.brass.light);
      if (al > 0.3) tileFace(ctx, 10, 2, 12 * Math.min(1, al * 1.6), lineOf(c));
      ctx.restore();
    } },
    shell: { sil: [shellEars, shellFan], draw: function (ctx, c, o) {
      var al = o.alive || 0;
      cel(ctx, 'se.ears', shellEars, C3(mix(c.base, c.dark, 0.2), c.dark, c.light), { s: 2, hl: false });
      cel(ctx, 'se.fan', shellFan, c, { s: 5, hl: false, inner: function (x) {
        for (var i = 0; i < SNB; i += 2) {
          var a0 = SA0 + (SA1 - SA0) * (i + 0.2) / SNB, a1 = SA0 + (SA1 - SA0) * (i + 0.8) / SNB;
          x.fillStyle = rgba(mix(c.light, '#FFFFFF', 0.25), 0.55); x.beginPath(); x.moveTo(0, 34);
          x.lineTo(SC[0] + Math.cos(a0) * SR * 1.2, SC[1] + Math.sin(a0) * SR * 1.2); x.lineTo(SC[0] + Math.cos(a1) * SR * 1.2, SC[1] + Math.sin(a1) * SR * 1.2); x.closePath(); x.fill();
        }
        x.strokeStyle = shadeOf(c); x.lineWidth = 2.2; x.lineCap = 'round';
        x.beginPath(); for (i = 1; i < SNB; i++) { x.moveTo(0, 32); x.lineTo(SHP[i][0] * 0.94, SHP[i][1] + (SC[1] - SHP[i][1]) * 0.06); } x.stroke();
        x.strokeStyle = rgba(c.dark, 0.35); x.lineWidth = 1.4;
        for (i = 1; i <= 2; i++) { x.beginPath(); x.arc(0, 30, SR * (0.35 + i * 0.22), SA0 + 0.05, SA1 - 0.05); x.stroke(); }
      } });
      if (al > 0.3) tileFace(ctx, 0, 4, 18 * Math.min(1, al * 1.6), lineOf(c));
      else { ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ell(ctx, -24, -8, 6, 3, -0.6); ctx.fill(); }
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
    bottle: { sil: [bottleCork, bottleLip, bottleBody], draw: function (ctx, c, o) {
      var al = o.alive || 0, tt = o.t || 0;
      ctx.save(); rotAbout(ctx, 0, 46, al * Math.sin(tt * 2.2) * 0.08);
      cel(ctx, 'bt.cork', bottleCork, N.wood, { s: 2, hl: [-3, -48, 2.4, 1.6, 0], inner: function (x) { dot(x, -2, -44, 1.2, N.wood.dark); dot(x, 3, -47, 1, N.wood.dark); dot(x, 2, -42, 1, N.wood.dark); } });
      cel(ctx, 'bt.body', bottleBody, c, { s: 5, hl: false, inner: function (x) {
        x.fillStyle = rgba(mix(c.light, '#FFFFFF', 0.2), 0.45); x.beginPath(); rrect(x, -18, -2, 36, 42, 9); x.fill();
        x.save(); x.translate(1, 18); x.rotate(-0.32);
        x.fillStyle = N.sail.base; x.strokeStyle = N.sail.dark; x.lineWidth = 1.6;
        x.beginPath(); rrect(x, -7.5, -19, 15, 36, 4); x.fill(); x.stroke();
        x.strokeStyle = rgba(N.sail.dark, 0.7); x.lineWidth = 1.1;
        x.beginPath(); x.moveTo(-4, -12); x.lineTo(4, -12); x.moveTo(-4, -7); x.lineTo(3, -7); x.moveTo(-4, 6); x.lineTo(4, 6); x.moveTo(-4, 11); x.lineTo(2, 11); x.stroke();
        x.fillStyle = '#A0643A'; x.fillRect(-8.5, -2, 17, 4);
        x.restore();
        x.fillStyle = rgba(c.base, 0.25); x.fillRect(-30, -4, 60, 60);    // the note seen through coloured glass
        x.fillStyle = 'rgba(255,255,255,0.75)'; x.beginPath(); rrect(x, -20, 0, 4.5, 34, 2.2); x.fill();
        dot(x, -18, -6, 2, 'rgba(255,255,255,0.8)');
      } });
      cel(ctx, 'bt.lip', bottleLip, C3(mix(c.base, c.light, 0.35), c.dark, c.light), { s: 1.5, hl: false });
      if (al > 0.05) { ctx.fillStyle = rgba('#FFFFFF', 0.85 * al); ctx.beginPath(); starPath(ctx, 18, -34, 6, 2.2); ctx.fill(); }
      ctx.restore();
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

  // ================================================================= COINS: n separate gold coins (counting, ages ≤ 4)
  // Layout (design units): coin radius CR, visible gap CG between the outlines (≥ 6 px at size 112),
  // rows: 1 · 2 side by side · 3 = 1 on top of 2 (pyramid) · 4 = 2 + 2 · 5 = dice five (2 · 1 · 2, fills the square box).
  // Counting order: top row L→R, then down. EVERY coins piece uses the scale of the n = 5 layout (spec.ref), so a coin has
  // the same radius for any n: a 1-coin piece is one small coin (its pieceBox is smaller than size), never one giant coin.
  var CR = 20, CG = 8.4, CD = 2 * CR + LW + CG, CDY = CD * 0.866, CD5 = CD / Math.SQRT2;
  var COIN_ROWS = { 1: [[0]], 2: [[-0.5, 0.5]], 3: [[0], [-0.5, 0.5]], 4: [[-0.5, 0.5], [-0.5, 0.5]], 5: [[-1, 1], [0], [-1, 1]] };
  var coinCache = {};
  function coinDef(n) {
    n = Math.max(1, Math.min(5, Math.round(num(n, 1))));
    if (coinCache[n]) return coinCache[n];
    var rows = COIN_ROWS[n], dy = n === 4 ? CD : n === 5 ? CD5 : CDY, dx = n === 5 ? CD5 : CD, pts = [];
    rows.forEach(function (row, ri) {
      var y = (ri - (rows.length - 1) / 2) * dy;
      row.forEach(function (fx) { pts.push([fx * dx, y]); });
    });
    var discs = pts.map(function (p) { return function (t) { circ(t, p[0], p[1], CR); }; });
    return (coinCache[n] = { n: n, pts: pts, discs: discs, sil: discs });
  }
  var COIN = C3(N.gold.base, N.gold.dark, N.gold.light);
  function drawCoin(ctx, key, disc, x, y, o, i) {
    var r = CR, al = o.alive || 0, tt = o.t || 0;
    cel(ctx, key, disc, COIN, { s: 3.2, hl: false, line: '#9C6F1C' });
    ctx.strokeStyle = rgba(N.gold.dark, 0.75); ctx.lineWidth = 1.8; ctx.beginPath(); circ(ctx, x, y, r * 0.76); ctx.stroke();
    ctx.strokeStyle = rgba('#FFF3C8', 0.9); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(x, y, r * 0.76 + 1.8, Math.PI * 1.05, Math.PI * 1.7); ctx.stroke();
    // star stamp: dark pressed edge + light face
    ctx.save(); ctx.translate(x + 0.8, y + 0.4); ctx.fillStyle = N.gold.dark; ctx.beginPath(); rpoly(ctx, starPts(r * 0.46, r * 0.2, 5), 1.2); ctx.fill(); ctx.restore();
    ctx.save(); ctx.translate(x - 0.3, y - 0.8); ctx.fillStyle = N.gold.light; ctx.beginPath(); rpoly(ctx, starPts(r * 0.46, r * 0.2, 5), 1.2); ctx.fill(); ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ell(ctx, x - r * 0.5, y - r * 0.52, r * 0.2, r * 0.1, -0.7); ctx.fill();
    if (al > 0.05) {   // a glint that runs from coin to coin
      var ph = (tt * 1.2 - i * 0.22) % 1; if (ph < 0) ph += 1;
      if (ph < 0.35) {
        var k = Math.sin(ph / 0.35 * Math.PI) * al;
        ctx.fillStyle = rgba('#FFFFFF', 0.95 * k); ctx.beginPath(); starPath(ctx, x + r * 0.45, y - r * 0.45, r * 0.42 * k + 0.5, r * 0.12 * k + 0.2); ctx.fill();
      }
    }
  }
  function drawCoins(ctx, n, o) {
    var d = coinDef(n), cnt = o.count == null ? -1 : o.count, al = o.alive || 0, tt = o.t || 0;
    d.pts.forEach(function (p, i) {
      var hop = al * Math.max(0, Math.sin(tt * 6 - i * 0.7)) * 2.5;
      ctx.save(); ctx.translate(0, -hop);
      if (cnt > i) {
        ctx.fillStyle = 'rgba(255,240,180,0.55)'; ctx.beginPath(); circ(ctx, p[0], p[1], CR + 5.5); ctx.fill();
      }
      drawCoin(ctx, 'co' + d.n + '.' + i, d.discs[i], p[0], p[1], o, i);
      if (cnt > i) {
        ctx.strokeStyle = 'rgba(120,80,20,0.45)'; ctx.lineWidth = 6.6; ctx.beginPath(); circ(ctx, p[0], p[1], CR + 4); ctx.stroke();
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 4.4; ctx.beginPath(); circ(ctx, p[0], p[1], CR + 4); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,201,60,0.95)'; ctx.lineWidth = 1.4; ctx.beginPath(); circ(ctx, p[0], p[1], CR + 5.8); ctx.stroke();
      }
      ctx.restore();
    });
  }
  /** coin centres in px relative to the piece centre for a coins piece of `size` (counting order) */
  function coinSpots(n, size) {
    var t = { kind: 'coins', n: n }, d = coinDef(n), g = geom(t), k = num(size, 112) / 100 * g.k;
    return d.pts.map(function (p) { return { x: (p[0] - g.cx) * k, y: (p[1] - g.cy) * k, r: CR * k }; });
  }

  // ================================================================= DOTS tile (1..12)
  // One fixed card for every n (a ten-frame-like 4 × 3 grid sized for 12): dots fill row by row, L→R; empty wells show the
  // free places. Dot radius DR = 9 design units ≈ 9.7 px at 112. The shadow shows the dots as light discs (spec.marks).
  var DCOLS = 4, DROWS = 3, DR = 9, DS = 22, DM = 9;
  var DW = (DCOLS - 1) * DS + 2 * DR + 2 * DM, DH = (DROWS - 1) * DS + 2 * DR + 2 * DM;
  var dotsCache = {};
  var dotTile = function (t) { rrect(t, -DW / 2, -DH / 2, DW, DH, 12); };
  function dotGrid(i) { return [(i % DCOLS - (DCOLS - 1) / 2) * DS, (Math.floor(i / DCOLS) - (DROWS - 1) / 2) * DS]; }
  function dotsDef(n) {
    n = Math.max(0, Math.min(12, Math.round(num(n, 1))));
    if (dotsCache[n]) return dotsCache[n];
    var pts = [], wells = [];
    for (var i = 0; i < DCOLS * DROWS; i++) (i < n ? pts : wells).push(dotGrid(i));
    var marks = function (t) { pts.forEach(function (p) { circ(t, p[0], p[1], DR); }); };
    return (dotsCache[n] = { n: n, W: DW, H: DH, pts: pts, wells: wells, r: DR, tile: dotTile, sil: [dotTile], marks: marks });
  }
  function drawDots(ctx, n, o) {
    var d = dotsDef(n), T = { base: '#FFF6E6', dark: '#B89B72', light: '#FFFFFF' }, red = pal('red'), cnt = o.count == null ? -1 : o.count;
    cel(ctx, 'dt', d.tile, T, { s: 3.5, hl: [-d.W / 2 + 12, -d.H / 2 + 7, 7, 2.4, -0.2] });
    ctx.strokeStyle = rgba('#D9C3A0', 0.9); ctx.lineWidth = 1.4; ctx.setLineDash([3, 3]);
    ctx.beginPath(); rrect(ctx, -d.W / 2 + 4, -d.H / 2 + 4, d.W - 8, d.H - 8, 9); ctx.stroke(); ctx.setLineDash([]);
    d.wells.forEach(function (p) {   // the empty places: soft pressed rings, so the card is a ten-frame-like grid
      dot(ctx, p[0], p[1], d.r * 0.62, 'rgba(184,155,114,0.16)');
      ctx.strokeStyle = 'rgba(184,155,114,0.38)'; ctx.lineWidth = 1.3; ctx.beginPath(); circ(ctx, p[0], p[1], d.r * 0.62); ctx.stroke();
    });
    var bounce = (o.alive || 0);
    d.pts.forEach(function (p, i) {
      var y = p[1] - bounce * Math.max(0, Math.sin((o.t || 0) * 7 - i * 0.6)) * 3;
      if (cnt > i) { dot(ctx, p[0], y, d.r + 2.6, '#FFFFFF'); ctx.strokeStyle = '#FFC93C'; ctx.lineWidth = 2; ctx.beginPath(); circ(ctx, p[0], y, d.r + 2.6); ctx.stroke(); }
      dot(ctx, p[0] + 0.8, y + 1.2, d.r, red.dark);
      dot(ctx, p[0], y, d.r, red.base);
      ctx.strokeStyle = red.dark; ctx.lineWidth = 1.6; ctx.beginPath(); circ(ctx, p[0], y, d.r); ctx.stroke();
      dot(ctx, p[0] - d.r * 0.35, y - d.r * 0.38, d.r * 0.3, 'rgba(255,255,255,0.8)');
    });
  }

  // ================================================================= ANIMAL stickers (sea & island friends)
  var STK = 5.4;                      // sticker border (each side) in design units ≈ 6 px at 112
  var A = {};
  function C3(b, d, l) { return { base: b, dark: d, light: l }; }
  var AC = {
    parrot: C3('#7CC97A', '#3E8A4A', '#BFE8B4'), parrotWing: C3('#6AA9DA', '#3B6E9E', '#B4D6F0'), parrotBelly: C3('#D2E88E', '#93AE4E', '#EEF7C8'),
    beak: C3('#F7D78E', '#B88A34', '#FFF0C8'), leg: C3('#B9B3C2', '#7D7688', '#E2DEE8'),
    shell: C3('#BFA05C', '#76602C', '#E2CC92'), plate: C3('#D3B874', '#8C7236', '#EBDCA8'), skin: C3('#A6D79C', '#5C9460', '#D4EDCA'), belly: C3('#EFE2B0', '#AE9A60', '#FFF8DC'),
    fish: C3('#FFB55E', '#C87526', '#FFDDA8'), fin: C3('#F59C56', '#BF6A28', '#FFD0A0'), stripe: '#FFF7E8',
    monkey: C3('#BB8257', '#764829', '#DDB18A'), face: C3('#F4D3AE', '#C49A70', '#FFF0DE'),
    octo: C3('#C9A2DE', '#835DA0', '#E9D8F3'),
    gull: C3('#FAFBFC', '#98A4B2', '#FFFFFF'), gullWing: C3('#C7CFDA', '#7C8796', '#EEF1F6'), gullBeak: C3('#F7C548', '#B58A1C', '#FFE6A0'), gullFoot: C3('#F4A878', '#B96E44', '#FFD4B8'),
    dolphin: C3('#8EB9DC', '#557FA6', '#C8DEF0'), dBelly: '#EAF2F8',
    star: C3('#F59A84', '#B95A48', '#FFCDBF')
  };
  function face2(ctx, x1, x2, y, r, al, cy, cr, my, mw, line) {   // two eyes + cheeks + smile
    eye(ctx, x1, y, r, al); eye(ctx, x2, y, r, al);
    cheeks(ctx, x1 - (x2 - x1) * 0.45, x2 + (x2 - x1) * 0.45, cy, cr);
    smile(ctx, (x1 + x2) / 2, my, mw, al > 0.3 ? 0.8 * al : 0, line);
  }
  // --- parrot (perched, side view facing right: long tail, hooked beak, crest)
  A.parrot = (function () {
    var tail = function (t) { rpoly(t, [[-14, 17], [3, 24], [-12, 53], [-25, 48]], [3, 3, 5, 5]); };
    var body = function (t) { ell(t, -2, 6, 19, 27, -0.25); };
    var head = function (t) { circ(t, 8, -24, 18); };
    var crest = function (t) { ell(t, -1, -42, 5, 9.5, -0.55); };
    var beak = function (t) { t.moveTo(22, -32); t.quadraticCurveTo(39, -32, 36, -13); t.quadraticCurveTo(30, -20, 22, -17); t.closePath(); };
    var footL = function (t) { ell(t, -9, 34, 6.5, 4, 0); }, footR = function (t) { ell(t, 5, 35, 6.5, 4, 0); };
    var wing = function (t) { ell(t, -8, 8, 11.5, 21, 0.18); };
    return { sil: [tail, crest, footL, footR, body, wing, head, beak], draw: function (ctx, o) {
      var c = AC.parrot, al = o.alive || 0, fl = al * Math.abs(Math.sin((o.t || 0) * 9));
      cel(ctx, 'pa.t', tail, c, { s: 2.5, hl: false, inner: function (x) { x.fillStyle = AC.parrotWing.base; x.beginPath(); rpoly(x, [[-16, 38], [-4, 40], [-12, 54], [-26, 50]], 3); x.fill(); } });
      cel(ctx, 'pa.cr', crest, c, { s: 1.5, hl: false });
      cel(ctx, 'pa.fl', footL, AC.leg, { s: 1, hl: false }); cel(ctx, 'pa.fr', footR, AC.leg, { s: 1, hl: false });
      cel(ctx, 'pa.b', body, c, { s: 5, hl: false, inner: function (x) { oval(x, 7, 14, 10, 17, -0.25, AC.parrotBelly.base); } });
      ctx.save(); rotAbout(ctx, -4, -10, -fl * 0.5);
      cel(ctx, 'pa.w', wing, AC.parrot, { s: 3, hl: false, shade: c.dark, inner: function (x) {
        x.fillStyle = AC.parrotWing.base; x.beginPath(); ell(x, -10, 20, 9, 10, 0.18); x.fill();
        x.strokeStyle = rgba(c.dark, 0.6); x.lineWidth = 1.4; x.beginPath(); x.moveTo(-14, 2); x.quadraticCurveTo(-10, 12, -4, 16); x.moveTo(-8, -6); x.quadraticCurveTo(-4, 4, 1, 8); x.stroke();
      } });
      ctx.restore();
      cel(ctx, 'pa.h', head, c, { s: 4, hl: [0, -36, 5, 3, -0.6], inner: function (x) { oval(x, 13, -25, 8.5, 8, 0, '#FFF8EC'); } });
      cel(ctx, 'pa.k', beak, AC.beak, { s: 2, hl: [28, -28, 3, 1.6, 0.3] });
      eye(ctx, 13, -26, 4.4, al);
      oval(ctx, 12, -15, 4.5, 2.8, 0, rgba(CHEEK, 0.8));
    } };
  })();
  // --- turtle (side view walking right: dome shell with plates, head with a smile)
  A.turtle = (function () {
    var shell = function (t) { t.moveTo(-43, 12); t.bezierCurveTo(-41, -22, -17, -33, 2, -33); t.bezierCurveTo(22, -33, 43, -21, 43, 12); t.closePath(); };
    var rim = function (t) { rrect(t, -46, 7, 92, 11, 5.5); };
    var neck = function (t) { rrect(t, 33, -3, 17, 15, 6.5); };
    var head = function (t) { ell(t, 52, -2, 14, 12.5, 0); };
    var finF = function (t) { ell(t, 27, 23, 16, 7, 0.5); }, finB = function (t) { ell(t, -31, 23, 13, 6, -0.5); };
    var tail = function (t) { rpoly(t, [[-43, 8], [-56, 14], [-43, 16]], 2); };
    return { sil: [tail, finB, finF, neck, head, shell, rim], draw: function (ctx, o) {
      var al = o.alive || 0, pd = al * Math.sin((o.t || 0) * 5) * 0.25;
      cel(ctx, 'tu.tl', tail, AC.skin, { s: 1.5, hl: false });
      ctx.save(); rotAbout(ctx, -22, 16, -pd); cel(ctx, 'tu.fb', finB, AC.skin, { s: 2, hl: false }); ctx.restore();
      ctx.save(); rotAbout(ctx, 18, 16, pd); cel(ctx, 'tu.ff', finF, AC.skin, { s: 2, hl: false }); ctx.restore();
      cel(ctx, 'tu.n', neck, AC.skin, { s: 2, hl: false });
      cel(ctx, 'tu.h', head, AC.skin, { s: 3, hl: [47, -9, 4, 2.4, -0.4] });
      cel(ctx, 'tu.s', shell, AC.shell, { s: 5, hl: false, inner: function (x) {
        var hexes = [[2, -14, 12], [-24, -4, 9.5], [27, -4, 9.5], [-12, 4, 7], [15, 4, 7]];
        hexes.forEach(function (q) {
          var pts = []; for (var i = 0; i < 6; i++) { var a = i * TAU / 6; pts.push([q[0] + Math.cos(a) * q[2], q[1] + Math.sin(a) * q[2] * 0.85]); }
          x.fillStyle = AC.plate.base; x.strokeStyle = AC.shell.dark; x.lineWidth = 1.6; x.beginPath(); rpoly(x, pts, 2.5); x.fill(); x.stroke();
        });
        x.fillStyle = rgba(AC.shell.light, 0.85); x.beginPath(); ell(x, -18, -18, 8, 3.5, -0.6); x.fill();
      } });
      cel(ctx, 'tu.r', rim, AC.belly, { s: 2, hl: false });
      eye(ctx, 55, -5, 4, al);
      oval(ctx, 54, 5, 3.6, 2.2, 0, rgba(CHEEK, 0.85));
      ctx.strokeStyle = AC.skin.dark; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(58, 2); ctx.quadraticCurveTo(62, 4 + al * 2, 65, 0); ctx.stroke();
    } };
  })();
  // --- fish (side view facing right, cream stripes, big eye)
  A.fish = (function () {
    var tail = function (t) { rpoly(t, [[-28, 0], [-51, -23], [-44, 0], [-51, 23]], [4, 6, 3, 6]); };
    var body = function (t) { ell(t, 2, 0, 34, 27, 0); };
    var dors = function (t) { t.moveTo(-18, -21); t.quadraticCurveTo(-6, -45, 20, -24); t.closePath(); };
    var belly = function (t) { t.moveTo(-8, 22); t.quadraticCurveTo(-2, 38, 12, 24); t.closePath(); };
    return { sil: [tail, dors, belly, body], draw: function (ctx, o) {
      var c = AC.fish, al = o.alive || 0, wg = al * Math.sin((o.t || 0) * 10) * 0.18;
      ctx.save(); rotAbout(ctx, -30, 0, wg); cel(ctx, 'fi.t', tail, AC.fin, { s: 3, hl: false, inner: function (x) {
        x.strokeStyle = rgba(AC.fin.dark, 0.5); x.lineWidth = 1.4; x.beginPath(); x.moveTo(-32, -2); x.lineTo(-46, -16); x.moveTo(-32, 2); x.lineTo(-46, 16); x.moveTo(-33, 0); x.lineTo(-44, 0); x.stroke();
      } }); ctx.restore();
      cel(ctx, 'fi.d', dors, AC.fin, { s: 2, hl: false });
      cel(ctx, 'fi.be', belly, AC.fin, { s: 1.5, hl: false });
      cel(ctx, 'fi.b', body, c, { s: 5, hl: [8, -18, 8, 3.4, -0.2], inner: function (x) {
        [[-14, 6], [12, 7]].forEach(function (q) {
          x.fillStyle = AC.stripe; x.beginPath(); x.moveTo(q[0] - q[1] / 2, -30); x.quadraticCurveTo(q[0] + 5 - q[1] / 2, 0, q[0] - q[1] / 2, 30);
          x.lineTo(q[0] + q[1] / 2, 30); x.quadraticCurveTo(q[0] + 5 + q[1] / 2, 0, q[0] + q[1] / 2, -30); x.closePath(); x.fill();
          x.strokeStyle = rgba(c.dark, 0.55); x.lineWidth = 1.4; x.stroke();
        });
      } });
      cel(ctx, 'fi.p', function (t) { ell(t, 0, 8, 9, 5, 0.5); }, AC.fin, { s: 1.2, hl: false });
      eye(ctx, 22, -6, 5.4, al);
      oval(ctx, 22, 7, 4, 2.4, 0, rgba(CHEEK, 0.85));
      smile(ctx, 31, 6, 4.5, al > 0.3 ? 0.8 : 0, c.dark);
    } };
  })();
  // --- monkey (sitting, front: big ears, heart face, curly tail)
  A.monkey = (function () {
    var tail = function (t) { t.moveTo(16, 36); t.bezierCurveTo(42, 42, 50, 12, 38, 6); t.bezierCurveTo(29, 2, 26, 16, 34, 17); };
    var body = function (t) { ell(t, 0, 27, 20, 19, 0); };
    var earL = function (t) { circ(t, -27, -14, 10.5); }, earR = function (t) { circ(t, 27, -14, 10.5); };
    var head = function (t) { circ(t, 0, -16, 25); };
    var footL = function (t) { ell(t, -12, 45, 8.5, 4.5, 0); }, footR = function (t) { ell(t, 12, 45, 8.5, 4.5, 0); };
    var armL = function (t) { ell(t, -18, 28, 6, 13, 0.35); }, armR = function (t) { ell(t, 18, 28, 6, 13, -0.35); };
    var core = function (t) { ell(t, 0, 14, 24, 26, 0); };   // fills the little gaps between head, arms and body
    return { sil: [{ b: tail, w: 6.4 }, core, body, armL, armR, footL, footR, earL, earR, head], draw: function (ctx, o) {
      var c = AC.monkey, al = o.alive || 0, wv = al * Math.sin((o.t || 0) * 8);
      ctx.lineCap = 'round'; stroke(ctx, tail, c.dark, 6.4); stroke(ctx, tail, c.base, 2.8);
      cel(ctx, 'mo.b', body, c, { s: 5, hl: false, inner: function (x) { oval(x, 0, 30, 12, 13, 0, AC.face.base); } });
      cel(ctx, 'mo.fl', footL, AC.face, { s: 1.5, hl: false }); cel(ctx, 'mo.fr', footR, AC.face, { s: 1.5, hl: false });
      ctx.save(); rotAbout(ctx, -16, 16, -wv * 0.6);
      cel(ctx, 'mo.al', armL, c, { s: 2, hl: false }); ctx.restore();
      cel(ctx, 'mo.ar', armR, c, { s: 2, hl: false });
      cel(ctx, 'mo.el', earL, c, { s: 2, hl: false, inner: function (x) { dot(x, -27, -14, 6, AC.face.base); } });
      cel(ctx, 'mo.er', earR, c, { s: 2, hl: false, inner: function (x) { dot(x, 27, -14, 6, AC.face.base); } });
      cel(ctx, 'mo.h', head, c, { s: 4, hl: [-12, -33, 6, 3, -0.5], inner: function (x) {
        x.fillStyle = AC.face.base; x.beginPath(); circ(x, -9, -19, 10.5); circ(x, 9, -19, 10.5); ell(x, 0, -5, 17, 12.5, 0); x.fill();
      } });
      stroke(ctx, function (t) { t.moveTo(-3, -40); t.quadraticCurveTo(-1, -47, 4, -45); t.moveTo(2, -40); t.quadraticCurveTo(6, -46, 9, -42); }, c.dark, 2.2);
      eye(ctx, -9, -19, 4.4, al); eye(ctx, 9, -19, 4.4, al);
      dot(ctx, -2.4, -9, 1.5, AC.face.dark); dot(ctx, 2.4, -9, 1.5, AC.face.dark);
      cheeks(ctx, -15, 15, -7, 4);
      smile(ctx, 0, -3, 7, al > 0.3 ? 0.9 * al : 0, '#6E4232');
    } };
  })();
  // --- octopus (round head, six curly arms)
  A.octopus = (function () {
    var ARMS = [
      [[-21, 2], [-34, 20], [-50, 26], [-46, 11]], [[-14, 6], [-20, 30], [-32, 42], [-24, 45]], [[-5, 8], [-6, 32], [-14, 46], [-5, 48]],
      [[5, 8], [6, 32], [14, 46], [5, 48]], [[14, 6], [20, 30], [32, 42], [24, 45]], [[21, 2], [34, 20], [50, 26], [46, 11]]];
    var arms = ARMS.map(function (q) { return function (t) { t.moveTo(q[0][0], q[0][1]); t.bezierCurveTo(q[1][0], q[1][1], q[2][0], q[2][1], q[3][0], q[3][1]); }; });
    var head = function (t) { ell(t, 0, -15, 30, 28, 0); };
    return { sil: arms.map(function (b) { return { b: b, w: 9.5 }; }).concat([head]), draw: function (ctx, o) {
      var c = AC.octo, al = o.alive || 0, tt = o.t || 0;
      ctx.lineCap = 'round';
      ARMS.forEach(function (q, i) {
        var wv = al * Math.sin(tt * 5 + i) * 3, Q = [q[0], q[1], [q[2][0] + wv, q[2][1]], [q[3][0] + wv, q[3][1] - Math.abs(wv) * 0.5]];
        var b = function (t) { t.moveTo(Q[0][0], Q[0][1]); t.bezierCurveTo(Q[1][0], Q[1][1], Q[2][0], Q[2][1], Q[3][0], Q[3][1]); };
        stroke(ctx, b, c.dark, 9.5); stroke(ctx, b, c.base, 5.9);
        [0.45, 0.7, 0.9].forEach(function (s) { var p = bez(Q[0], Q[1], Q[2], Q[3], s); dot(ctx, p[0], p[1], 1.3, c.light); });
      });
      cel(ctx, 'oc.h', head, c, { s: 5, hl: [-12, -32, 8, 4.5, -0.5], inner: function (x) {
        dot(x, 14, -30, 3, rgba(c.light, 0.9)); dot(x, 20, -22, 2, rgba(c.light, 0.9)); dot(x, -20, -20, 2.2, rgba(c.light, 0.9));
      } });
      face2(ctx, -11, 11, -14, 5.4, al, -4, 4.4, -3, 6, c.dark);
    } };
  })();
  // --- seagull (flying, front view: wings spread in a soft M)
  A.seagull = (function () {
    var wingL = function (t) { t.moveTo(-10, -2); t.bezierCurveTo(-22, -26, -40, -32, -54, -22); t.bezierCurveTo(-46, -12, -30, 2, -12, 12); t.closePath(); };
    var wingR = function (t) { t.moveTo(10, -2); t.bezierCurveTo(22, -26, 40, -32, 54, -22); t.bezierCurveTo(46, -12, 30, 2, 12, 12); t.closePath(); };
    var body = function (t) { ell(t, 0, 10, 15, 20, 0); };
    var head = function (t) { circ(t, 0, -14, 15); };
    var beak = function (t) { rpoly(t, [[-6, -9], [6, -9], [0, 2]], 2); };
    var footL = function (t) { ell(t, -6, 31, 4.5, 3.5, 0.3); }, footR = function (t) { ell(t, 6, 31, 4.5, 3.5, -0.3); };
    return { sil: [footL, footR, wingL, wingR, body, head, beak], draw: function (ctx, o) {
      var al = o.alive || 0, fl = al * Math.sin((o.t || 0) * 8) * 0.22;
      cel(ctx, 'sg.fl', footL, AC.gullFoot, { s: 1, hl: false }); cel(ctx, 'sg.fr', footR, AC.gullFoot, { s: 1, hl: false });
      function wingIn(sg) { return function (x) { x.fillStyle = '#6E7886'; x.beginPath(); ell(x, sg * 48, -22, 8, 5, sg * -0.5); x.fill(); x.strokeStyle = rgba(AC.gullWing.dark, 0.6); x.lineWidth = 1.3; x.beginPath(); x.moveTo(sg * 18, -6); x.quadraticCurveTo(sg * 30, -12, sg * 42, -14); x.stroke(); }; }
      ctx.save(); rotAbout(ctx, -10, 4, fl); cel(ctx, 'sg.wl', wingL, AC.gullWing, { s: 3, hl: false, inner: wingIn(-1) }); ctx.restore();
      ctx.save(); rotAbout(ctx, 10, 4, -fl); cel(ctx, 'sg.wr', wingR, AC.gullWing, { s: 3, hl: false, inner: wingIn(1) }); ctx.restore();
      cel(ctx, 'sg.b', body, AC.gull, { s: 4, hl: false });
      cel(ctx, 'sg.h', head, AC.gull, { s: 3, hl: [-6, -22, 4, 2.4, -0.5] });
      eye(ctx, -6, -17, 3.8, al); eye(ctx, 6, -17, 3.8, al);
      cheeks(ctx, -10, 10, -9, 3.2);
      cel(ctx, 'sg.k', beak, AC.gullBeak, { s: 1.2, hl: false });
    } };
  })();
  // --- dolphin (leaping arc towards the upper right)
  A.dolphin = (function () {
    var body = function (t) {
      t.moveTo(49, -7); t.bezierCurveTo(45, -22, 20, -36, -4, -32); t.bezierCurveTo(-26, -28, -38, -6, -40, 20);
      t.lineTo(-31, 23); t.bezierCurveTo(-28, 6, -14, -3, 4, -4); t.bezierCurveTo(20, -5, 36, -1, 49, -1); t.closePath();
    };
    var fluke = function (t) { rpoly(t, [[-36, 16], [-55, 28], [-37, 27], [-21, 34]], [2, 5, 3, 5]); };
    var dors = function (t) { rpoly(t, [[-21, -27], [-15, -47], [-2, -32]], [2, 4, 2]); };
    var pect = function (t) { ell(t, 10, 2, 9.5, 4.5, 0.8); };
    return { sil: [fluke, dors, pect, body], draw: function (ctx, o) {
      var c = AC.dolphin, al = o.alive || 0, tt = o.t || 0;
      ctx.save(); rotAbout(ctx, -30, 20, al * Math.sin(tt * 6) * 0.15); cel(ctx, 'dp.f', fluke, c, { s: 2, hl: false }); ctx.restore();
      cel(ctx, 'dp.d', dors, c, { s: 2, hl: false });
      cel(ctx, 'dp.p', pect, C3(mix(c.base, c.dark, 0.25), c.dark, c.light), { s: 1.5, hl: false });
      cel(ctx, 'dp.b', body, c, { s: 4, hl: [-6, -26, 9, 2.6, -0.2], inner: function (x) {
        x.fillStyle = AC.dBelly; x.beginPath(); x.moveTo(-34, 22); x.bezierCurveTo(-28, 0, -10, -10, 8, -10); x.bezierCurveTo(24, -10, 38, -6, 50, -4);
        x.lineTo(50, 4); x.lineTo(-30, 30); x.closePath(); x.fill();
      } });
      eye(ctx, 30, -16, 4.2, al);
      oval(ctx, 30, -7, 3.8, 2.2, 0, rgba(CHEEK, 0.85));
      ctx.strokeStyle = c.dark; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(37, -6); ctx.quadraticCurveTo(42, -2 + al * 2, 47, -5); ctx.stroke();
      dot(ctx, 8, -30, 1.4, c.dark);
    } };
  })();
  // --- starfish (five plump arms, freckles, a face in the middle)
  A.starfish = (function () {
    var PTS = starPts(52, 25, 5).map(function (p) { return [p[0], p[1] - 2]; });
    var body = function (t) { rpoly(t, PTS, PTS.map(function (p, i) { return i % 2 ? 6 : 11; })); };
    return { sil: [body], draw: function (ctx, o) {
      var c = AC.star, al = o.alive || 0, tt = o.t || 0;
      ctx.save(); rotAbout(ctx, 0, 0, al * Math.sin(tt * 3) * 0.08);
      cel(ctx, 'st.b', body, c, { s: 5, hl: [-12, -18, 5, 3, -0.6], inner: function (x) {
        for (var i = 0; i < 5; i++) {
          var a = -Math.PI / 2 + i * TAU / 5;
          for (var j = 1; j <= 2; j++) dot(x, Math.cos(a) * (14 + j * 11), Math.sin(a) * (14 + j * 11), 2.4 - j * 0.4, c.light);
        }
      } });
      face2(ctx, -7, 7, -2, 4, al, 6, 3.6, 7, 5, c.dark);
      ctx.restore();
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
      case 'obj': return 'o|' + (OBJ[t.obj] ? t.obj : 'boat');
      case 'shape': return 's|' + (SHAPE_B[t.shape] ? t.shape : 'circle');
      case 'coins': case 'bunch': return 'c|' + coinDef(t.n).n;
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
    if (t.kind === 'obj') { var o = OBJ[t.obj] || OBJ.boat; s = { sil: o.sil, grow: LW, draw: function (ctx, th, op) { o.draw(ctx, pal(th.color), op); } }; }
    else if (t.kind === 'shape') { var sh = SHAPE_B[t.shape] ? t.shape : 'circle'; s = { sil: [SHAPE_B[sh]], grow: LW, draw: function (ctx, th, op) { drawShapeTile(ctx, sh, pal(th.color), op); } }; }
    else if (t.kind === 'coins' || t.kind === 'bunch') { var bd = coinDef(t.n); s = { sil: bd.sil, grow: LW, ref: bd.n === 5 ? null : { kind: 'coins', n: 5 }, draw: function (ctx, th, op) { drawCoins(ctx, bd.n, op); } }; }
    else if (t.kind === 'dots') { var dd = dotsDef(t.n); s = { sil: dd.sil, grow: LW, marks: dd.marks, draw: function (ctx, th, op) { drawDots(ctx, dd.n, op); } }; }
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
    // s.ref: a reference thing whose scale is shared (coins: every n uses the n = 5 scale → constant coin radius)
    var den = Math.max(w, h, 1); if (s.ref) { var rg = geom(s.ref); den = Math.max(den, 100 / rg.k); }
    gm = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: w, h: h, k: 100 / den };
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
    // a near-opaque warm underlay first: palms / the sail / the stains behind the shadow must not cut its silhouette
    h.drawImage(o.tint(A0, 'rgba(236,231,224,0.78)'), 0, 0);
    h.drawImage(o.tint(A0, 'rgba(40,36,60,0.36)'), 0, 0);
    h.drawImage(o.tint(o.minus(A0, o.ero(A0, 4 * sc)), 'rgba(40,36,60,0.215)'), 0, 0);            // inner rim → 0.45
    h.drawImage(o.tint(o.minus(A0, o.shift(A0, 3 * sc, 5 * sc)), 'rgba(40,36,60,0.16)'), 0, 0);   // hole depth, top-left
    h.drawImage(o.tint(o.minus(A0, o.shift(A0, -2 * sc, -3 * sc)), 'rgba(255,255,255,0.22)'), 0, 0); // lit lower-right lip
    if (L.s.marks) {   // dots cards: the dots show as light discs inside the dark shadow, so the count reads from the shadow
      h.save(); h.setTransform(sc, 0, 0, sc, L.W / 2, L.H / 2); h.scale(L.k, L.k); h.translate(-L.g.cx, -L.g.cy); markPaint(h, L.s.marks); h.restore();
    }
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
    var season = 0;
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
  function markPaint(g, marks) {
    g.fillStyle = 'rgba(252,248,240,0.82)'; g.beginPath(); marks(g); g.fill();
    g.strokeStyle = 'rgba(40,36,60,0.34)'; g.lineWidth = 2; g.beginPath(); marks(g); g.stroke();
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
        if (s.marks) markPaint(ctx, s.marks);
        if (ctx.setLineDash) ctx.setLineDash([10 / k, 8 / k]);
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'; silStroke(ctx, s, s.text ? s.grow + 2.5 / k : 2.5 / k, true);
        if (ctx.setLineDash) ctx.setLineDash([]);
        if (glow > 0.01) { ctx.globalAlpha *= glow; ctx.strokeStyle = '#FFC93C'; silStroke(ctx, s, s.grow + 9 / k, true); }
      });
    }
    ctx.restore();
  }


  // ================================================================= BOARD — old parchment treasure-map pictures
  // Ink-and-wash style: sepia ink lines, pale watercolour fills, calm and light so the answer colours pop.
  var INK = '#9A7448', XCOL = '#8E5A2C';
  var WC = {
    sea: '#C6E5DE', sea2: '#AFD8D2', sand: '#EED8A8', sandD: '#E2C68E', leaf: '#C2D7A0', leafD: '#9DBA7E', trunk: '#D2AE7A',
    rock: '#DCCFB4', rockD: '#C6B597', wood: '#E6C998', woodD: '#CDA673', sail: '#FAF1DD', cave: '#E7D2A6', caveD: '#D9BF8E',
    cloud: 'rgba(255,251,240,0.75)', rainCloud: '#D7DAD8', drop: '#BCD6E2', sun: '#F8E2A2'
  };
  var MOOD = [
    { name: 'sunny', sun: 1 }, { name: 'breezy', wind: 1, sun: 0.7 }, { name: 'rain', rain: 1 }, { name: 'rainbow', rainbow: 1, sun: 0.8 }
  ];
  function moodIdx(i) { i = Math.round(num(i, 0)); return ((i % 4) + 4) % 4; }
  function sceneName(s) { s = SCENE_ALIAS[s] || s; return SCENE[s] ? s : 'cove'; }
  function rnd(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hashS(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function ink(g, lw, a) { g.strokeStyle = a == null ? INK : rgba(INK, a); g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round'; }
  function shapeInk(g, fill, lw, build) { g.beginPath(); build(g); if (fill) { g.fillStyle = fill; g.fill(); } if (lw) { ink(g, lw); g.stroke(); } }

  function parchment(g, w, h, seed) {
    var R = rnd(seed), M = Math.max(w, h), i;
    g.fillStyle = '#F3E3BF'; g.fillRect(0, 0, w, h);
    for (i = 0; i < 8; i++) {   // soft mottled stains
      var x = R() * w, y = R() * h, rr = (0.1 + R() * 0.22) * M, gr = g.createRadialGradient(x, y, 0, x, y, rr);
      gr.addColorStop(0, rgba('#E3CD9C', 0.42 + R() * 0.25)); gr.addColorStop(1, rgba('#E3CD9C', 0));
      g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    for (i = 0; i < 5; i++) {   // lighter patches
      x = R() * w; y = R() * h; rr = (0.06 + R() * 0.12) * M; gr = g.createRadialGradient(x, y, 0, x, y, rr);
      gr.addColorStop(0, 'rgba(255,248,226,0.45)'); gr.addColorStop(1, 'rgba(255,248,226,0)');
      g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    for (i = 0; i < 2; i++) {   // faint ring stains
      x = R() * w; y = R() * h; rr = (0.025 + R() * 0.03) * M;
      g.strokeStyle = 'rgba(201,164,106,0.2)'; g.lineWidth = 2.5; g.beginPath(); g.arc(x, y, rr, R() * 6, R() * 6 + 4.2); g.stroke();
    }
    g.lineCap = 'round';
    for (i = 0; i < 70; i++) {   // fibres
      x = R() * w; y = R() * h; var a = R() * Math.PI, l = 4 + R() * 12;
      g.strokeStyle = 'rgba(180,140,85,' + (0.06 + R() * 0.08).toFixed(3) + ')'; g.lineWidth = 0.9;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    for (i = 0; i < 90; i++) dot(g, R() * w, R() * h, 0.5 + R() * 1.1, 'rgba(150,110,60,' + (0.06 + R() * 0.12).toFixed(3) + ')');
  }
  function parchEdges(g, w, h, seed) {
    var e = Math.min(w, h) * 0.12, R = rnd(seed + 7);
    [[0, 0, 0, e], [0, h, 0, h - e], [0, 0, e, 0], [w, 0, w - e, 0]].forEach(function (q) {
      var gr = g.createLinearGradient(q[0], q[1], q[2], q[3]);
      gr.addColorStop(0, 'rgba(201,164,106,0.55)'); gr.addColorStop(0.45, 'rgba(201,164,106,0.16)'); gr.addColorStop(1, 'rgba(201,164,106,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    [[0, 0], [w, 0], [0, h], [w, h]].forEach(function (c) {   // darker, "burnt-ish" corners
      var rr = e * (1.6 + R() * 0.8), gr = g.createRadialGradient(c[0], c[1], 0, c[0], c[1], rr);
      gr.addColorStop(0, 'rgba(176,128,70,0.34)'); gr.addColorStop(1, 'rgba(176,128,70,0)');
      g.fillStyle = gr; g.fillRect(c[0] - rr, c[1] - rr, rr * 2, rr * 2);
    });
  }
  function waveMarks(g, x0, x1, y, s, a, R) {   // little map-style "︵︵" sea marks
    ink(g, Math.max(1.1, s * 0.16), a == null ? 0.55 : a);
    for (var x = x0; x < x1 - s * 2; x += s * (3 + (R ? R() * 2 : 1))) {
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + s * 0.5, y - s * 0.55, x + s, y); g.quadraticCurveTo(x + s * 1.5, y - s * 0.55, x + s * 2, y); g.stroke();
    }
  }
  function cloudInk(g, x, y, s, fill) {
    shapeInk(g, fill || WC.cloud, Math.max(1.2, s * 0.05), function (t) {
      t.moveTo(x - s * 0.9, y + s * 0.2); t.quadraticCurveTo(x - s, y - s * 0.25, x - s * 0.55, y - s * 0.22);
      t.quadraticCurveTo(x - s * 0.4, y - s * 0.7, x, y - s * 0.55); t.quadraticCurveTo(x + s * 0.45, y - s * 0.8, x + s * 0.6, y - s * 0.25);
      t.quadraticCurveTo(x + s, y - s * 0.25, x + s * 0.9, y + s * 0.2); t.closePath();
    });
  }
  function sunInk(g, x, y, r, a) {
    g.save(); g.globalAlpha *= a == null ? 1 : a;
    ink(g, Math.max(1.4, r * 0.1));
    for (var i = 0; i < 10; i++) { var an = i * TAU / 10 + 0.15; g.beginPath(); g.moveTo(x + Math.cos(an) * r * 1.3, y + Math.sin(an) * r * 1.3); g.lineTo(x + Math.cos(an) * r * (i % 2 ? 1.6 : 1.75), y + Math.sin(an) * r * (i % 2 ? 1.6 : 1.75)); g.stroke(); }
    shapeInk(g, WC.sun, Math.max(1.4, r * 0.1), function (t) { circ(t, x, y, r); });
    dot(g, x - r * 0.32, y - r * 0.1, r * 0.08, INK); dot(g, x + r * 0.32, y - r * 0.1, r * 0.08, INK);
    ink(g, Math.max(1, r * 0.07)); g.beginPath(); g.arc(x, y + r * 0.08, r * 0.35, 0.35, Math.PI - 0.35); g.stroke();
    g.restore();
  }
  function rainbowInk(g, x, y, r) {
    var cols = ['#EDB0A8', '#F2CF9C', '#EEE3A0', '#C4DDAE', '#B4D2E4', '#CCBCE0'], bw = r * 0.085;
    g.save(); g.globalAlpha *= 0.85; g.lineCap = 'butt';
    cols.forEach(function (c, i) { g.strokeStyle = c; g.lineWidth = bw + 0.6; g.beginPath(); g.arc(x, y, r - i * bw, Math.PI, TAU); g.stroke(); });
    g.restore();
    ink(g, 1.2, 0.45); g.beginPath(); g.arc(x, y, r + bw / 2, Math.PI, TAU); g.stroke(); g.beginPath(); g.arc(x, y, r - (cols.length - 0.5) * bw, Math.PI, TAU); g.stroke();
    cloudInk(g, x - r + bw * 2.5, y, r * 0.3); cloudInk(g, x + r - bw * 2.5, y, r * 0.3);
  }
  function windInk(g, x, y, s) {
    ink(g, Math.max(1.3, s * 0.05), 0.6);
    g.beginPath(); g.moveTo(x - s, y); g.bezierCurveTo(x - s * 0.3, y - s * 0.12, x + s * 0.3, y + s * 0.08, x + s * 0.7, y - s * 0.05);
    g.bezierCurveTo(x + s * 1.05, y - s * 0.15, x + s * 0.95, y - s * 0.5, x + s * 0.7, y - s * 0.42); g.bezierCurveTo(x + s * 0.55, y - s * 0.38, x + s * 0.6, y - s * 0.22, x + s * 0.75, y - s * 0.25); g.stroke();
    g.beginPath(); g.moveTo(x - s * 0.7, y + s * 0.25); g.quadraticCurveTo(x, y + s * 0.15, x + s * 0.5, y + s * 0.28); g.stroke();
  }
  function rainInk(g, x, y, s) {
    cloudInk(g, x, y, s, WC.rainCloud);
    ink(g, Math.max(1.2, s * 0.04), 0.5);
    for (var i = 0; i < 5; i++) { var dx = x - s * 0.6 + i * s * 0.3; g.beginPath(); g.moveTo(dx, y + s * 0.4); g.lineTo(dx - s * 0.1, y + s * 0.72); g.stroke(); }
    [[x - s * 0.3, y + s * 0.95], [x + s * 0.35, y + s * 1.05]].forEach(function (p) { teardrop(g, p[0], p[1], s * 0.11); });
  }
  function teardrop(g, x, y, r) {
    shapeInk(g, WC.drop, Math.max(1, r * 0.25), function (t) { t.moveTo(x, y - r * 1.9); t.quadraticCurveTo(x + r * 1.1, y - r * 0.4, x + r, y); t.arc(x, y, r, 0, Math.PI); t.quadraticCurveTo(x - r * 1.1, y - r * 0.4, x, y - r * 1.9); t.closePath(); });
  }
  function gullsInk(g, x, y, s) {
    ink(g, Math.max(1.2, s * 0.12), 0.7);
    [[0, 0, 1], [s * 1.8, s * 0.6, 0.75], [s * 3.1, -s * 0.3, 0.6]].forEach(function (q) {
      var k = q[2] * s; g.beginPath(); g.moveTo(x + q[0] - k, y + q[1]); g.quadraticCurveTo(x + q[0] - k * 0.5, y + q[1] - k * 0.55, x + q[0], y + q[1]); g.quadraticCurveTo(x + q[0] + k * 0.5, y + q[1] - k * 0.55, x + q[0] + k, y + q[1]); g.stroke();
    });
  }
  function palmInk(g, x, by, H, lean) {
    lean = lean || 0;
    var tx = x + H * (0.14 + lean * 0.12), ty = by - H, tw = Math.max(3, H * 0.075);
    function trunk(t) { t.moveTo(x, by); t.quadraticCurveTo(x + H * 0.02, by - H * 0.55, tx, ty); }
    g.lineCap = 'round'; g.strokeStyle = INK; g.lineWidth = tw + 3; g.beginPath(); trunk(g); g.stroke();
    g.strokeStyle = WC.trunk; g.lineWidth = tw; g.beginPath(); trunk(g); g.stroke();
    ink(g, Math.max(1, tw * 0.2), 0.6);
    for (var i = 1; i < 8; i++) { var s = i / 8, px = (1 - s) * (1 - s) * x + 2 * (1 - s) * s * (x + H * 0.02) + s * s * tx, py = (1 - s) * (1 - s) * by + 2 * (1 - s) * s * (by - H * 0.55) + s * s * ty; g.beginPath(); g.moveTo(px - tw * 0.5, py + tw * 0.1); g.lineTo(px + tw * 0.5, py - tw * 0.15); g.stroke(); }
    var L = H * 0.48, angs = [-2.75, -2.25, -1.75, -1.25, -0.75, -0.3];
    angs.forEach(function (a0, k) {
      var a = a0 + lean * 0.55, droop = 0.5 + 0.2 * (k % 2);
      var ex = tx + Math.cos(a) * L, ey = ty + Math.sin(a) * L * 0.75 + L * droop * 0.55;
      var mx = tx + Math.cos(a) * L * 0.55, my = ty + Math.sin(a) * L * 0.55 - L * 0.08, nx = -(ey - ty), ny = ex - tx, nl = Math.hypot(nx, ny) || 1;
      nx /= nl; ny /= nl; var wdt = L * 0.16;
      shapeInk(g, k % 2 ? WC.leafD : WC.leaf, Math.max(1.2, H * 0.012), function (t) {
        t.moveTo(tx, ty); t.quadraticCurveTo(mx + nx * wdt, my + ny * wdt, ex, ey); t.quadraticCurveTo(mx - nx * wdt * 0.6, my - ny * wdt * 0.6, tx, ty); t.closePath();
      });
      ink(g, Math.max(0.9, H * 0.008), 0.6); g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo(mx + nx * wdt * 0.2, my + ny * wdt * 0.2, ex, ey); g.stroke();
    });
    [[-0.04, 0.05], [0.035, 0.06], [0, 0.1]].forEach(function (q) { shapeInk(g, '#C79A68', 1.2, function (t) { circ(t, tx + q[0] * H, ty + q[1] * H * 0.6, H * 0.035); }); });
  }
  function islandInk(g, cx, sy, w, lean) {
    shapeInk(g, WC.sand, Math.max(1.4, w * 0.012), function (t) { t.moveTo(cx - w / 2, sy); t.quadraticCurveTo(cx - w * 0.2, sy - w * 0.3, cx + w * 0.05, sy - w * 0.26); t.quadraticCurveTo(cx + w * 0.35, sy - w * 0.22, cx + w / 2, sy); t.closePath(); });
    palmInk(g, cx - w * 0.06, sy - w * 0.2, w * 0.62, lean);
    ink(g, 1.2, 0.5); g.beginPath(); g.moveTo(cx - w * 0.6, sy + 3); g.quadraticCurveTo(cx, sy + w * 0.05, cx + w * 0.6, sy + 3); g.stroke();
  }
  function rockInk(g, x, y, s, R) {
    shapeInk(g, WC.rock, Math.max(1.2, s * 0.06), function (t) { t.moveTo(x - s, y); t.quadraticCurveTo(x - s * 0.95, y - s * 0.6, x - s * 0.3, y - s * 0.7); t.quadraticCurveTo(x + s * 0.4, y - s * (0.85 + (R ? R() * 0.2 : 0)), x + s * 0.85, y - s * 0.3); t.quadraticCurveTo(x + s, y - s * 0.1, x + s, y); t.closePath(); });
    ink(g, Math.max(1, s * 0.05), 0.5); g.beginPath(); g.moveTo(x - s * 0.2, y - s * 0.55); g.quadraticCurveTo(x + s * 0.1, y - s * 0.3, x + s * 0.5, y - s * 0.3); g.stroke();
  }
  function shellInk(g, x, y, s) {
    ink(g, Math.max(1, s * 0.15), 0.6); g.beginPath();
    for (var i = 0; i <= 24; i++) { var a = i / 24 * TAU * 1.6, r = s * (0.15 + i / 24 * 0.85); if (i === 0) g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8); else g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8); }
    g.stroke();
  }
  function grassInk(g, x, y, s) { ink(g, Math.max(1, s * 0.09), 0.6); g.beginPath(); g.moveTo(x - s * 0.4, y); g.quadraticCurveTo(x - s * 0.4, y - s * 0.6, x - s * 0.7, y - s); g.moveTo(x, y); g.lineTo(x + s * 0.05, y - s * 1.2); g.moveTo(x + s * 0.4, y); g.quadraticCurveTo(x + s * 0.45, y - s * 0.6, x + s * 0.75, y - s * 0.9); g.stroke(); }
  function seaBand(g, w, y0, y1, R, s) {
    var gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, WC.sea2); gr.addColorStop(1, WC.sea);
    g.fillStyle = gr; g.fillRect(0, y0, w, y1 - y0);
    ink(g, 1.6, 0.75); g.beginPath(); g.moveTo(0, y0); g.lineTo(w, y0); g.stroke();
    for (var r = 0, n = Math.max(1, Math.floor((y1 - y0) / (s * 2.6))); r < n; r++) waveMarks(g, (r % 2) * s * 1.5 + R() * s, w, y0 + (r + 0.7) * (y1 - y0) / n, s * (0.85 + 0.15 * r / n), 0.45, R);
  }
  function shoreLine(g, w, y, amp, fill, h) {   // wavy shore line with a foam stroke; fills below with sand
    g.beginPath(); g.moveTo(0, y);
    for (var x = 0; x <= w + 40; x += 40) g.quadraticCurveTo(x + 20, y + (x / 40 % 2 ? -amp : amp), x + 40, y);
    g.lineTo(w, h); g.lineTo(0, h); g.closePath(); g.fillStyle = fill || WC.sand; g.fill();
    ink(g, 1.6, 0.75); g.beginPath(); g.moveTo(0, y); for (x = 0; x <= w + 40; x += 40) g.quadraticCurveTo(x + 20, y + (x / 40 % 2 ? -amp : amp), x + 40, y); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(0, y - 4); for (x = 0; x <= w + 40; x += 40) g.quadraticCurveTo(x + 20, y - 4 + (x / 40 % 2 ? -amp : amp), x + 40, y - 4); g.stroke();
  }
  function trail(g, pts, s) {
    g.save(); g.strokeStyle = 'rgba(142,90,44,0.42)'; g.lineWidth = Math.max(2.2, s * 0.13); g.lineCap = 'round';
    if (g.setLineDash) g.setLineDash([0.1, s * 0.55]);
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length - 1; i++) g.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
    g.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]); g.stroke();
    if (g.setLineDash) g.setLineDash([]);
    g.restore();
  }
  function xMark(g, x, y, s) {
    g.save(); g.lineCap = 'round';
    g.strokeStyle = 'rgba(142,90,44,0.25)'; g.lineWidth = s * 0.42; g.beginPath(); g.moveTo(x - s / 2 + 1.5, y - s / 2 + 2); g.lineTo(x + s / 2 + 1.5, y + s / 2 + 2); g.moveTo(x + s / 2 + 1.5, y - s / 2 + 2); g.lineTo(x - s / 2 + 1.5, y + s / 2 + 2); g.stroke();
    g.strokeStyle = XCOL; g.lineWidth = s * 0.3; g.beginPath(); g.moveTo(x - s / 2, y - s / 2); g.lineTo(x + s / 2, y + s / 2); g.moveTo(x + s / 2, y - s / 2); g.lineTo(x - s / 2, y + s / 2); g.stroke();
    g.restore();
  }
  function xSpot(w, h) { var m = Math.min(w, h); return { x: w - m * 0.1, y: h - m * 0.1, s: m * 0.065 }; }

  // Each scene: front(g, w, h, M, R) draws the cached picture, sky = [x, y] fractions for the mood sign, sea = [y0, y1]
  // fractions (sparkles / live waves), skyBand = [y0, y1] (the gull flies there), trail = points (fractions), busy(w, h)
  var SCENE = {};
  SCENE.cove = {
    sky: [0.16, 0.15], sea: [0.36, 0.6], skyBand: [0.06, 0.26],
    trail: [[0.05, 0.86], [0.25, 0.74], [0.45, 0.88], [0.66, 0.76], [0.8, 0.86]],
    front: function (g, w, h, M, R) {
      var s = h * 0.03;
      cloudInk(g, w * 0.48, h * 0.13, h * 0.08); cloudInk(g, w * 0.86, h * 0.09, h * 0.06);
      shapeInk(g, WC.leaf, 1.4, function (t) { t.moveTo(w * 0.04, h * 0.365); t.quadraticCurveTo(w * 0.12, h * 0.27, w * 0.22, h * 0.365); t.closePath(); });   // far island
      seaBand(g, w, h * 0.36, h * 0.62, R, s);
      islandInk(g, w * 0.72, h * 0.48, Math.min(w * 0.24, h * 0.44), M.wind ? 0.9 : 0);
      shoreLine(g, w, h * 0.62, h * 0.018, WC.sand, h);
      shellInk(g, w * 0.14, h * 0.72, h * 0.022); shellInk(g, w * 0.58, h * 0.94, h * 0.018); shellInk(g, w * 0.36, h * 0.68, h * 0.016);
      gullsInk(g, w * 0.3, h * 0.24, h * 0.022);
    },
    busy: function (w, h) { var iw = Math.min(w * 0.24, h * 0.44); return [{ x: w * 0.72 - iw * 0.62, y: h * 0.48 - iw * 0.95, w: iw * 1.25, h: iw * 1.0 }]; }
  };
  SCENE.sails = {
    sky: [0.88, 0.17], sea: [0.8, 1], skyBand: [0.04, 0.12],
    trail: [[0.22, 0.2], [0.4, 0.34], [0.32, 0.5], [0.55, 0.62], [0.78, 0.7], [0.86, 0.86]],
    front: function (g, w, h, M, R) {
      var mx = w * 0.1, s = h * 0.03, bulge = M.wind ? 0.07 : 0.045;
      seaBand(g, w, h * 0.8, h, R, s);
      shapeInk(g, WC.wood, 2, function (t) { rrect(t, mx - h * 0.018, -10, h * 0.036, h * 0.9, h * 0.012); });   // mast
      shapeInk(g, WC.wood, 1.8, function (t) { rrect(t, mx - h * 0.04, h * 0.08, w * 0.8, h * 0.03, h * 0.012); });  // yards
      shapeInk(g, WC.wood, 1.8, function (t) { rrect(t, mx - h * 0.03, h * 0.7, w * 0.76, h * 0.026, h * 0.012); });
      var x0 = mx + h * 0.02, x1 = mx + w * 0.72, y0 = h * 0.11, y1 = h * 0.7;
      function sail(t) { t.moveTo(x0, y0); t.lineTo(x1, y0); t.quadraticCurveTo(x1 + w * bulge * 1.6, (y0 + y1) / 2, x1 - w * 0.02, y1); t.lineTo(x0 + w * 0.02, y1); t.quadraticCurveTo(x0 + w * bulge, (y0 + y1) / 2, x0, y0); t.closePath(); }
      shapeInk(g, WC.sail, 2, sail);
      g.save(); g.beginPath(); sail(g); g.clip();
      ink(g, 1.1, 0.32);
      for (var i = 1; i < 7; i++) { var px = x0 + (x1 - x0) * i / 7; g.beginPath(); g.moveTo(px, y0); g.quadraticCurveTo(px + w * bulge * 1.4, (y0 + y1) / 2, px, y1); g.stroke(); }
      var sh = g.createLinearGradient(x0, 0, x1 + w * 0.1, 0); sh.addColorStop(0, 'rgba(201,164,106,0.18)'); sh.addColorStop(0.5, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(201,164,106,0.22)');
      g.fillStyle = sh; g.fillRect(x0 - 10, y0, x1 - x0 + w * 0.2, y1 - y0);
      g.restore();
      ink(g, 1.3, 0.6);   // rigging
      g.beginPath(); g.moveTo(x1 - w * 0.02, y1); g.lineTo(w * 0.97, h * 0.8); g.moveTo(x0 + w * 0.02, y1); g.lineTo(mx + w * 0.06, h * 0.8); g.stroke();
      shapeInk(g, WC.woodD, 1.6, function (t) { rrect(t, mx - h * 0.05, h * 0.0, h * 0.1, h * 0.05, h * 0.01); });   // crow's nest lip
    },
    busy: function (w, h) { return [{ x: w * 0.1 - h * 0.06, y: 0, w: h * 0.12, h: h * 0.9 }]; }
  };
  SCENE.cave = {
    sky: [0.17, 0.42], sea: [0.5, 0.62], skyBand: [0.33, 0.43], liveX: [0.04, 0.3],
    trail: [[0.12, 0.85], [0.3, 0.76], [0.46, 0.86], [0.62, 0.78], [0.8, 0.86]],
    front: function (g, w, h, M, R) {
      // the cave mouth (looking out to sea) on the left, the treasure nook on the right
      var mxc = w * 0.17, mw = Math.min(w * 0.17, h * 0.3);
      g.fillStyle = rgba(WC.cave, 0.75); g.fillRect(0, 0, w, h);
      g.save(); g.beginPath(); ell(g, mxc, h * 0.55, mw, h * 0.26, 0); g.clip();
      g.fillStyle = '#F6EAD0'; g.fillRect(0, 0, w, h); seaBand(g, w, h * 0.5, h * 0.66, R, h * 0.02); g.fillStyle = WC.sand; g.fillRect(0, h * 0.66, w, h);
      g.restore();
      ink(g, 2); g.beginPath(); ell(g, mxc, h * 0.55, mw, h * 0.26, 0); g.stroke();
      // rocky ceiling with stalactites
      shapeInk(g, WC.rock, 2, function (t) {
        t.moveTo(0, 0); t.lineTo(w, 0); t.lineTo(w, h * 0.12);
        for (var i = 10; i >= 0; i--) { var x = w * i / 10, d = (i % 3 === 1 ? 0.13 : i % 2 ? 0.07 : 0.04) * h; t.quadraticCurveTo(x + w * 0.05, h * 0.1 + d * 1.6, x, h * 0.1); }
        t.closePath();
      });
      ink(g, 1.2, 0.45); for (var i = 0; i < 6; i++) { var rx = w * (0.08 + i * 0.17); g.beginPath(); g.moveTo(rx, h * 0.03); g.quadraticCurveTo(rx + w * 0.03, h * 0.05, rx + w * 0.06, h * 0.03); g.stroke(); }
      // floor
      shoreLine(g, w, h * 0.78, h * 0.012, WC.caveD, h);
      rockInk(g, w * 0.04, h * 0.8, h * 0.07, R); rockInk(g, w * 0.97, h * 0.79, h * 0.09, R); rockInk(g, w * 0.36, h * 0.8, h * 0.04, R);
      // the open chest (muted ink, a soft glow — no loose coins, the pieces are the coins)
      var cx = w * 0.84, cy = h * 0.6, cw = Math.min(w * 0.17, h * 0.3), gl = g.createRadialGradient(cx, cy - cw * 0.35, 0, cx, cy - cw * 0.35, cw * 0.9);
      gl.addColorStop(0, 'rgba(255,236,170,0.75)'); gl.addColorStop(1, 'rgba(255,236,170,0)'); g.fillStyle = gl; g.fillRect(cx - cw, cy - cw * 1.3, cw * 2, cw * 1.4);
      shapeInk(g, WC.woodD, 1.8, function (t) { t.moveTo(cx - cw * 0.48, cy - cw * 0.3); t.lineTo(cx - cw * 0.44, cy - cw * 0.72); t.quadraticCurveTo(cx, cy - cw * 0.85, cx + cw * 0.44, cy - cw * 0.72); t.lineTo(cx + cw * 0.48, cy - cw * 0.3); t.closePath(); });   // lid, open
      shapeInk(g, '#F2DFA6', 1.6, function (t) { t.moveTo(cx - cw * 0.46, cy - cw * 0.28); t.quadraticCurveTo(cx, cy - cw * 0.52, cx + cw * 0.46, cy - cw * 0.28); t.closePath(); });     // gold heap (soft)
      shapeInk(g, WC.wood, 2, function (t) { rrect(t, cx - cw / 2, cy - cw * 0.3, cw, cw * 0.42, cw * 0.05); });
      ink(g, 1.4, 0.7); g.beginPath(); g.moveTo(cx - cw * 0.3, cy - cw * 0.3); g.lineTo(cx - cw * 0.3, cy + cw * 0.12); g.moveTo(cx + cw * 0.3, cy - cw * 0.3); g.lineTo(cx + cw * 0.3, cy + cw * 0.12); g.stroke();
      shapeInk(g, '#EBD39A', 1.2, function (t) { rrect(t, cx - cw * 0.06, cy - cw * 0.24, cw * 0.12, cw * 0.14, 2); });
    },
    busy: function (w, h) { var cw = Math.min(w * 0.17, h * 0.3), mw = Math.min(w * 0.17, h * 0.3); return [{ x: w * 0.84 - cw * 0.6, y: h * 0.6 - cw * 0.95, w: cw * 1.2, h: cw * 1.1 }, { x: 0, y: 0, w: w, h: h * 0.14 }]; }
  };
  SCENE.lagoon = {
    sky: [0.84, 0.13], sea: [0.6, 0.84], skyBand: [0.05, 0.22],
    trail: [[0.24, 0.94], [0.36, 0.58], [0.6, 0.52], [0.74, 0.92], [0.84, 0.9]],
    front: function (g, w, h, M, R) {
      cloudInk(g, w * 0.5, h * 0.12, h * 0.07);
      shapeInk(g, WC.leafD, 1.6, function (t) { t.moveTo(0, h * 0.44); t.quadraticCurveTo(w * 0.15, h * 0.28, w * 0.32, h * 0.38); t.quadraticCurveTo(w * 0.5, h * 0.24, w * 0.68, h * 0.36); t.quadraticCurveTo(w * 0.85, h * 0.27, w, h * 0.38); t.lineTo(w, h * 0.46); t.lineTo(0, h * 0.46); t.closePath(); });
      shoreLine(g, w, h * 0.45, h * 0.01, '#E9DCAE', h);
      var px = w * 0.54, py = h * 0.72, rx = Math.min(w * 0.3, h * 0.55), ry = h * 0.13;
      g.save(); g.beginPath(); ell(g, px, py, rx, ry, 0); g.clip();
      var pg = g.createLinearGradient(0, py - ry, 0, py + ry); pg.addColorStop(0, WC.sea2); pg.addColorStop(1, WC.sea); g.fillStyle = pg; g.fillRect(px - rx, py - ry, rx * 2, ry * 2);
      waveMarks(g, px - rx * 0.7, px + rx * 0.7, py - ry * 0.2, h * 0.02, 0.4, R); waveMarks(g, px - rx * 0.5, px + rx * 0.8, py + ry * 0.4, h * 0.02, 0.4, R);
      g.restore();
      ink(g, 2); g.beginPath(); ell(g, px, py, rx, ry, 0); g.stroke();
      [[0.62, -0.3, 0.05], [-0.55, 0.25, 0.04]].forEach(function (q) { shapeInk(g, WC.leaf, 1.3, function (t) { t.moveTo(px + q[0] * rx, py + q[1] * ry); t.arc(px + q[0] * rx, py + q[1] * ry, h * q[2], 0.3, TAU - 0.3); t.closePath(); }); });
      rockInk(g, px - rx * 0.92, py + ry * 0.25, h * 0.06, R); rockInk(g, px + rx * 0.95, py + ry * 0.1, h * 0.07, R); rockInk(g, px + rx * 0.75, py + ry * 1.05, h * 0.04, R);
      grassInk(g, px - rx * 0.7, py + ry * 1.1, h * 0.05); grassInk(g, w * 0.32, h * 0.52, h * 0.04); grassInk(g, w * 0.9, h * 0.52, h * 0.04);
      palmInk(g, w * 0.09, h * 0.86, h * 0.66, M.wind ? 1 : 0.15); palmInk(g, w * 0.94, h * 0.56, h * 0.36, M.wind ? 0.9 : -0.1);
    },
    busy: function (w, h) { return [{ x: 0, y: h * 0.1, w: w * 0.3, h: h * 0.4 }, { x: w * 0.82, y: h * 0.12, w: w * 0.18, h: h * 0.28 }]; }
  };
  SCENE.shore = {
    sky: [0.12, 0.09], sea: [0.17, 0.42], skyBand: [0.03, 0.14],
    trail: [[0.42, 0.95], [0.5, 0.66], [0.7, 0.58], [0.66, 0.82], [0.84, 0.88]],
    front: function (g, w, h, M, R) {
      var s = h * 0.026;
      cloudInk(g, w * 0.6, h * 0.08, h * 0.05);
      seaBand(g, w, h * 0.17, h * 0.44, R, s);
      shoreLine(g, w, h * 0.44, h * 0.016, WC.sand, h);
      g.fillStyle = rgba(WC.sandD, 0.5); g.fillRect(0, h * 0.46, w, h * 0.05);
      // a striped towel
      g.save(); g.translate(w * 0.2, h * 0.76); g.rotate(-0.12);
      var tw = Math.min(w * 0.26, h * 0.46), th = tw * 0.55, cols = ['#E8C7BD', '#FBF2E2', '#CADBBE', '#FBF2E2'];
      for (var i = 0; i < 6; i++) { g.fillStyle = cols[i % 4]; g.fillRect(-tw / 2 + i * tw / 6, -th / 2, tw / 6 + 0.5, th); }
      ink(g, 1.8); g.strokeRect(-tw / 2, -th / 2, tw, th);
      ink(g, 1.1, 0.6); g.beginPath(); for (i = 0; i <= 8; i++) { var fy = -th / 2 + i * th / 8; g.moveTo(-tw / 2, fy); g.lineTo(-tw / 2 - 5, fy + 1); g.moveTo(tw / 2, fy); g.lineTo(tw / 2 + 5, fy + 1); } g.stroke();
      g.restore();
      // footprints
      for (i = 0; i < 5; i++) { var fx = w * (0.42 + i * 0.06), fyy = h * (0.6 + (i % 2) * 0.04); oval(g, fx, fyy, h * 0.012, h * 0.02, 0.3, rgba(WC.sandD, 0.95)); dot(g, fx + h * 0.004, fyy - h * 0.028, h * 0.006, rgba(WC.sandD, 0.95)); }
      shellInk(g, w * 0.92, h * 0.6, h * 0.02); shellInk(g, w * 0.06, h * 0.56, h * 0.018);
      gullsInk(g, w * 0.36, h * 0.1, h * 0.02);
    },
    busy: function (w, h) { var tw = Math.min(w * 0.26, h * 0.46); return [{ x: w * 0.2 - tw * 0.58, y: h * 0.76 - tw * 0.4, w: tw * 1.16, h: tw * 0.8 }]; }
  };
  SCENE.deck = {
    sky: [0.88, 0.2], sea: [0.16, 0.3], skyBand: [0.08, 0.16],
    trail: [[0.24, 0.94], [0.34, 0.62], [0.58, 0.7], [0.72, 0.9], [0.84, 0.9]],
    front: function (g, w, h, M, R) {
      seaBand(g, w, h * 0.17, h * 0.31, R, h * 0.02);
      // deck planks
      var y0 = h * 0.42;
      g.fillStyle = WC.wood; g.fillRect(0, y0, w, h - y0);
      ink(g, 1.3, 0.55);
      for (var y = y0, k = 0; y < h; y += h * 0.075, k++) {
        g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
        for (var x = (k % 2) * w * 0.11 + w * 0.05; x < w; x += w * 0.22) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + h * 0.075); g.stroke(); dot(g, x - 4, y + h * 0.02, 1.2, rgba(INK, 0.6)); dot(g, x + 4, y + h * 0.02, 1.2, rgba(INK, 0.6)); }
      }
      g.fillStyle = 'rgba(255,248,230,0.35)'; g.fillRect(0, y0, w, h * 0.02);
      // railing
      for (x = w * 0.03; x < w; x += w * 0.06) shapeInk(g, WC.wood, 1.4, function (t) { rrect(t, x - h * 0.012, h * 0.31, h * 0.024, y0 - h * 0.31, h * 0.01); });
      shapeInk(g, WC.woodD, 1.8, function (t) { rrect(t, -6, h * 0.29, w + 12, h * 0.035, h * 0.012); });
      shapeInk(g, WC.woodD, 1.6, function (t) { rrect(t, -6, y0 - h * 0.012, w + 12, h * 0.024, h * 0.01); });
      // barrel + coiled rope (left)
      var bx = w * 0.08, by = h * 0.9, br = Math.min(w * 0.06, h * 0.11);
      shapeInk(g, WC.woodD, 1.8, function (t) { t.moveTo(bx - br * 0.8, by); t.quadraticCurveTo(bx - br * 1.05, by - br * 0.9, bx - br * 0.8, by - br * 1.8); t.lineTo(bx + br * 0.8, by - br * 1.8); t.quadraticCurveTo(bx + br * 1.05, by - br * 0.9, bx + br * 0.8, by); t.closePath(); });
      ink(g, 1.6, 0.8); g.beginPath(); g.moveTo(bx - br * 0.95, by - br * 0.45); g.lineTo(bx + br * 0.95, by - br * 0.45); g.moveTo(bx - br * 0.95, by - br * 1.35); g.lineTo(bx + br * 0.95, by - br * 1.35); g.stroke();
      var rx = w * 0.2, ry = h * 0.92; shapeInk(g, '#E4CC98', 1.6, function (t) { ell(t, rx, ry, br * 0.95, br * 0.4, 0); });
      ink(g, 1.2, 0.7); for (var i = 1; i < 4; i++) { g.beginPath(); ell(g, rx, ry - i * 0.5, br * (0.95 - i * 0.22), br * (0.4 - i * 0.09), 0); g.stroke(); }
    },
    busy: function (w, h) { var br = Math.min(w * 0.06, h * 0.11); return [{ x: 0, y: h * 0.9 - br * 1.9, w: w * 0.2 + br, h: br * 2.2 }]; }
  };

  function moodSign(g, w, h, sd, M) {
    var sx = sd.sky[0] * w, sy = sd.sky[1] * h, r = Math.min(w, h) * 0.045;
    if (M.rainbow) { rainbowInk(g, sx, sy + r * 1.6, r * 2.6); sunInk(g, sx + r * 3.2 * (sx > w / 2 ? -1 : 1), sy - r * 0.6, r * 0.7, 0.9); }
    else if (M.rain) rainInk(g, sx, sy, r * 1.9);
    else if (M.wind) { sunInk(g, sx, sy, r * 0.8, 0.8); windInk(g, sx + (sx > w / 2 ? -1 : 1) * r * 4, sy + r * 0.6, r * 1.8); windInk(g, w * 0.5, sd.skyBand[1] * h, r * 1.5); }
    else sunInk(g, sx, sy, r);
  }
  function sceneFront(g, scene, mi, w, h) {
    var sd = SCENE[scene], M = MOOD[mi], seed = hashS(scene), R = rnd(seed + 3);
    parchment(g, w, h, seed);
    g.save(); sd.front(g, w, h, M, R); g.restore();
    moodSign(g, w, h, sd, M);
    if (M.rain) { g.fillStyle = 'rgba(128,140,156,0.13)'; g.fillRect(0, 0, w, h); }
    var X = xSpot(w, h);
    trail(g, sd.trail.map(function (p) { return [p[0] * w, p[1] * h]; }).concat([[X.x - X.s * 0.8, X.y + X.s * 0.1]]), h * 0.04);
    xMark(g, X.x, X.y, X.s);
    parchEdges(g, w, h, seed);
  }
  function sceneLive(g, scene, mi, w, h, t, al) {
    var sd = SCENE[scene], M = MOOD[mi], sp = 1 + 2.5 * al;
    // the gull glides across the sky band
    var LX = sd.liveX || [0, 1], lx0 = LX[0] * w, lw2 = (LX[1] - LX[0]) * w;
    var gx = lx0 + ((t * 0.025 * sp + 0.3) % 1.3) * lw2 * 1.1 - lw2 * 0.15, gy = (sd.skyBand[0] + (sd.skyBand[1] - sd.skyBand[0]) * (0.5 + 0.4 * Math.sin(t * 0.4))) * h, gs = h * 0.02, fl = Math.sin(t * 5 * sp) * 0.25;
    ink(g, Math.max(1.3, gs * 0.13), 0.65 * (sd.liveX ? Math.max(0, Math.sin(Math.min(1, Math.max(0, (gx - lx0) / lw2)) * Math.PI)) : 1));
    g.beginPath(); g.moveTo(gx - gs, gy - gs * fl); g.quadraticCurveTo(gx - gs * 0.5, gy - gs * 0.6, gx, gy); g.quadraticCurveTo(gx + gs * 0.5, gy - gs * 0.6, gx + gs, gy - gs * fl); g.stroke();
    // moving sea marks + sparkles
    var y0 = sd.sea[0] * h, y1 = sd.sea[1] * h;
    for (var i = 0; i < 5; i++) {
      var ph = (t * 0.06 * sp + i * 0.21) % 1, x = lx0 + ph * lw2, y = y0 + (y1 - y0) * (0.2 + ((i * 0.37) % 0.7)), a = Math.sin(ph * Math.PI) * 0.55;
      if (y > h) continue;
      ink(g, 1.3, a); g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + h * 0.012, y - h * 0.012, x + h * 0.024, y); g.stroke();
      if (!M.rain) { var k = Math.max(0, Math.sin(t * 2.2 + i * 1.7)); if (k > 0.6) { g.fillStyle = rgba('#FFFFFF', (k - 0.6) * 2); g.beginPath(); starPath(g, x + h * 0.05, y - h * 0.01, h * 0.012 * k, h * 0.004); g.fill(); } }
    }
    if (M.rain) {   // a couple of slow drops
      for (i = 0; i < 4; i++) {
        var dp = (t * 0.35 + i * 0.27) % 1, dx = w * (0.15 + ((i * 0.31) % 0.8)), dy = dp * h;
        g.save(); g.globalAlpha *= Math.sin(dp * Math.PI) * 0.7; teardrop(g, dx, dy, h * 0.009); g.restore();
      }
    }
    if (scene === 'deck') bunting(g, -w * 0.02, h * 0.035, w * 1.04, h * 0.06, h, t, al);
    if (scene === 'sails') pennant(g, w * 0.1, h * 0.0, h * 0.05, t, al);
  }
  function bunting(g, x0, y0, bw, sag, h, t, al) {
    var x1 = x0 + bw, n = Math.max(6, Math.round(bw / (h * 0.085))), cols = ['#E8C7BD', '#CADBBE', '#EFDCAE', '#D7CBE2', '#C6DCE4'];
    ink(g, 1.3, 0.8); g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2, y0 + sag * 2, x1, y0); g.stroke();
    for (var i = 0; i < n; i++) {
      var s = (i + 0.5) / n, x = x0 + (x1 - x0) * s, y = y0 + 2 * s * (1 - s) * sag * 2, sw = Math.sin(t * 1.8 + i * 0.9) * 0.1 * (1 + 2 * al), fs = h * 0.03;
      g.save(); g.translate(x, y); g.rotate(sw);
      shapeInk(g, cols[i % 5], 1.1, function (q) { q.moveTo(-fs, 0); q.lineTo(fs, 0); q.lineTo(0, fs * 1.7); q.closePath(); });
      g.restore();
    }
  }
  function pennant(g, x, y, s, t, al) {
    var wv = Math.sin(t * 3) * s * 0.15 * (1 + 2 * al);
    shapeInk(g, '#EFDCAE', 1.3, function (q) { q.moveTo(x, y); q.quadraticCurveTo(x - s * 0.8, y + s * 0.15 + wv, x - s * 1.6, y + s * 0.3 + wv * 0.6); q.quadraticCurveTo(x - s * 0.8, y + s * 0.45 - wv, x, y + s * 0.6); q.closePath(); });
  }

  /** Busy scenery boxes of a board picture (board-local px): World.placeSlots prefers slots off these. opt.flip mirrors them. */
  function sceneBusy(scene, w, h, opt) {
    w = num(w, 0); h = num(h, 0);
    var sc = sceneName(scene), out = SCENE[sc].busy ? SCENE[sc].busy(w, h) : [], X = xSpot(w, h);
    out.push({ x: X.x - X.s * 1.2, y: X.y - X.s * 1.2, w: X.s * 2.4, h: X.s * 2.4 });
    if (opt && opt.flip) out.forEach(function (r) { r.x = w - r.x - r.w; });
    return out;
  }

  var boardCache = {}, boardOrder = [];
  function boardFront(scene, mi, w, h, sc) {
    var key = scene + '|' + mi + '|' + Math.round(w) + 'x' + Math.round(h) + '|' + sc, c = boardCache[key];
    if (c) return c;
    if (!canvasOK()) return null;
    c = newCanvas(w * sc, h * sc); var g = c.getContext('2d'); if (!g) return null;
    g.setTransform(sc, 0, 0, sc, 0, 0); sceneFront(g, scene, mi, w, h);
    boardCache[key] = c; boardOrder.push(key);
    while (boardOrder.length > 8) { var k = boardOrder.shift(); if (boardCache[k]) { boardCache[k].width = 0; boardCache[k].height = 0; } delete boardCache[k]; }
    return c;
  }
  /** points along a rounded rect: [x, y, tangent angle] every ~step px */
  function rrPts(x, y, w, h, r, step) {
    var out = [], segs = [
      [x + r, y, x + w - r, y], 'a', [x + w, y + r, x + w, y + h - r], 'a', [x + w - r, y + h, x + r, y + h], 'a', [x, y + h - r, x, y + r], 'a'];
    var corners = [[x + w - r, y + r, -Math.PI / 2], [x + w - r, y + h - r, 0], [x + r, y + h - r, Math.PI / 2], [x + r, y + r, Math.PI]], ci = 0;
    segs.forEach(function (s) {
      if (s === 'a') {
        var c = corners[ci++], n = Math.max(1, Math.round(r * Math.PI / 2 / step));
        for (var i = 0; i < n; i++) { var a = c[2] + (i + 0.5) / n * Math.PI / 2; out.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r, a + Math.PI / 2]); }
      } else {
        var L = Math.hypot(s[2] - s[0], s[3] - s[1]), m = Math.max(1, Math.round(L / step)), an = Math.atan2(s[3] - s[1], s[2] - s[0]);
        for (var j = 0; j < m; j++) { var q = (j + 0.5) / m; out.push([s[0] + (s[2] - s[0]) * q, s[1] + (s[3] - s[1]) * q, an]); }
      }
    });
    return out;
  }
  function drawFrame(ctx, w, h, r, F) {
    var RO = r + F * 0.8;
    ctx.fillStyle = 'rgba(70,45,25,0.22)'; ctx.beginPath(); rrect(ctx, -F + 2, -F + 7, w + 2 * F, h + 2 * F, RO); ctx.fill();
    ctx.beginPath(); rrect(ctx, -F, -F, w + 2 * F, h + 2 * F, RO); rrect(ctx, 0, 0, w, h, r);
    var wg = ctx.createLinearGradient(0, -F, 0, h + F); wg.addColorStop(0, '#CF9558'); wg.addColorStop(1, '#B37A42');
    ctx.fillStyle = wg; ctx.fill('evenodd');
    ctx.save(); ctx.beginPath(); rrect(ctx, -F, -F, w + 2 * F, h + 2 * F, RO); rrect(ctx, 0, 0, w, h, r); ctx.clip('evenodd');
    ctx.strokeStyle = 'rgba(142,90,44,0.3)'; ctx.lineWidth = 1.3;
    for (var gi = 0; gi < 4; gi++) {   // wood grain on the outer band
      var o = -F + 2 + gi * F * 0.15;
      ctx.beginPath(); rrect(ctx, o, o, w - 2 * o, h - 2 * o, Math.max(2, RO + o + F)); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(232,184,128,0.95)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); rrect(ctx, -F + 2.5, -F + 2.5, w + 2 * F - 5, h + 2 * F - 5, RO - 2.5); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = '#8E5A2C'; ctx.lineWidth = 2.6; ctx.beginPath(); rrect(ctx, -F, -F, w + 2 * F, h + 2 * F, RO); ctx.stroke();
    // the rope, laid in the inner part of the frame
    var ri = F * 0.3, rw = Math.max(3, F * 0.42), rr = r + ri;
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#8A6334'; ctx.lineWidth = rw + 2.4; ctx.beginPath(); rrect(ctx, -ri, -ri, w + 2 * ri, h + 2 * ri, rr); ctx.stroke();
    ctx.strokeStyle = '#DDBC82'; ctx.lineWidth = rw; ctx.beginPath(); rrect(ctx, -ri, -ri, w + 2 * ri, h + 2 * ri, rr); ctx.stroke();
    var pts = rrPts(-ri, -ri, w + 2 * ri, h + 2 * ri, rr, rw * 0.85), hl = rw * 0.55;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#A57B42'; ctx.lineWidth = Math.max(1.2, rw * 0.2); ctx.beginPath();
    pts.forEach(function (p) { var a = p[2] + 0.8, dx = Math.cos(a) * hl, dy = Math.sin(a) * hl; ctx.moveTo(p[0] - dx, p[1] - dy); ctx.lineTo(p[0] + dx, p[1] + dy); });
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,240,205,0.75)'; ctx.lineWidth = Math.max(0.8, rw * 0.1); ctx.beginPath();
    pts.forEach(function (p) { var a = p[2] + 0.8, dx = Math.cos(a) * hl * 0.6, dy = Math.sin(a) * hl * 0.6, ox = Math.cos(p[2]) * rw * 0.22, oy = Math.sin(p[2]) * rw * 0.22; ctx.moveTo(p[0] - dx - ox, p[1] - dy - oy); ctx.lineTo(p[0] + dx - ox, p[1] + dy - oy); });
    ctx.stroke();
    // rope lashings at the corners (a wrapped band) + brass rivets on the outer wood
    var cq = r - (r + ri) * 0.7071, cr = r - (r + F * 0.78) * 0.7071;
    [[cq, cq, -Math.PI / 4], [w - cq, cq, Math.PI / 4], [cq, h - cq, Math.PI / 4], [w - cq, h - cq, -Math.PI / 4]].forEach(function (p) {
      ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(p[2]);
      ctx.fillStyle = '#C9A266'; ctx.strokeStyle = '#7E5A2E'; ctx.lineWidth = 1.3;
      ctx.beginPath(); rrect(ctx, -rw * 0.55, -rw * 0.85, rw * 1.1, rw * 1.7, rw * 0.3); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-rw * 0.55, -rw * 0.25); ctx.lineTo(rw * 0.55, -rw * 0.25); ctx.moveTo(-rw * 0.55, rw * 0.25); ctx.lineTo(rw * 0.55, rw * 0.25); ctx.stroke();
      ctx.restore();
    });
    [[cr, cr], [w - cr, cr], [cr, h - cr], [w - cr, h - cr]].forEach(function (p) {
      var sr = Math.max(2, F * 0.11); dot(ctx, p[0] + 0.5, p[1] + 0.8, sr, 'rgba(90,55,25,0.35)'); dot(ctx, p[0], p[1], sr, N.brass.base);
      ctx.strokeStyle = N.brass.dark; ctx.lineWidth = 1; ctx.beginPath(); circ(ctx, p[0], p[1], sr); ctx.stroke(); dot(ctx, p[0] - sr * 0.3, p[1] - sr * 0.3, sr * 0.35, N.brass.light);
    });
    ctx.strokeStyle = '#8E5A2C'; ctx.lineWidth = 2; ctx.beginPath(); rrect(ctx, -0.5, -0.5, w + 1, h + 1, r + 0.5); ctx.stroke();
  }
  function drawBoard(ctx, board, scene, season, opt) {
    if (!ctx || !board) return;
    opt = opt || {};
    var w = num(board.w, 0), h = num(board.h, 0); if (!(w > 4 && h > 4)) return;
    var r = Math.min(num(board.r, 26), w / 2, h / 2), F = num(opt.frame != null ? opt.frame : board.frame, 22);
    scene = sceneName(scene);
    var mi = moodIdx(season), t = num(opt.t, 0), al = clamp01(opt.alive);
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (F > 0) drawFrame(ctx, w, h, r, F);
    ctx.save(); ctx.beginPath(); rrect(ctx, 0, 0, w, h, r); ctx.clip();
    var flip = !!opt.flip;
    if (flip) { ctx.save(); ctx.translate(w, 0); ctx.scale(-1, 1); }
    var front = boardFront(scene, mi, w, h, pxScale(ctx, 2));
    if (front) ctx.drawImage(front, 0, 0, w, h);
    else { ctx.save(); sceneFront(ctx, scene, mi, w, h); ctx.restore(); }
    ctx.save(); sceneLive(ctx, scene, mi, w, h, t, al); ctx.restore();
    if (flip) ctx.restore();
    // inner frame shadow (the picture sits a little deeper)
    ctx.strokeStyle = 'rgba(80,50,25,0.2)'; ctx.lineWidth = 9; ctx.beginPath(); rrect(ctx, -3, -3, w + 6, h + 6, r + 3); ctx.stroke();
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

  // ================================================================= TRAY — the shallow water strip at the shore
  function waterTop(x, w, y, t, amp) { return function (xx) { return y + Math.sin(xx * 0.045 + t * 1.6) * amp + Math.sin(xx * 0.017 - t * 0.9) * amp * 0.8; }; }
  function drawTray(ctx, tray, season, opt) {
    if (!ctx || !tray) return;
    opt = opt || {};
    var x = num(tray.x, 0), y = num(tray.y, 0), w = num(tray.w, 0), h = num(tray.h, 0); if (!(w > 4 && h > 4)) return;
    var mi = moodIdx(season), M = MOOD[mi], t = num(opt.t, 0), item = num(opt.item, 112), i;
    var r = Math.min(h * 0.42, 44), lap = Math.sin(t * 1.1) * 2.2, top = y + 3 + lap, fy = waterTop(x, w, top, t, M.wind ? 3.4 : 2);
    var cTop = '#8FDCE0', cBot = '#5CC3D6';
    // rain: clearly greyer teal (spec §0.5); breezy: a touch deeper and choppier
    if (M.rain) { cTop = '#A2C6C4'; cBot = '#6A9CA0'; }
    else if (M.wind) { cTop = mix(cTop, '#6FCAD6', 0.5); cBot = mix(cBot, '#3FA9C4', 0.5); }
    function water(g, inset) {
      inset = inset || 0;
      var x0 = x + inset, x1 = x + w - inset, rr = Math.max(4, r - inset);
      g.moveTo(x0, fy(x0) + rr * 0.6);
      g.quadraticCurveTo(x0, fy(x0), x0 + rr * 0.8, fy(x0 + rr * 0.8));
      for (var xx = x0 + rr * 0.8; xx < x1 - rr * 0.8; xx += 10) g.lineTo(xx, fy(xx));
      g.lineTo(x1 - rr * 0.8, fy(x1 - rr * 0.8)); g.quadraticCurveTo(x1, fy(x1), x1, fy(x1) + rr * 0.6);
      g.lineTo(x1, y + h - rr); g.quadraticCurveTo(x1, y + h - inset, x1 - rr, y + h - inset);
      g.lineTo(x0 + rr, y + h - inset); g.quadraticCurveTo(x0, y + h - inset, x0, y + h - rr); g.closePath();
    }
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // wet sand around the water
    ctx.fillStyle = M.rain ? 'rgba(150,125,90,0.28)' : 'rgba(196,158,100,0.3)'; ctx.beginPath(); rrect(ctx, x - 9, y - 8, w + 18, h + 14, r + 9); ctx.fill();
    ctx.fillStyle = 'rgba(196,158,100,0.22)'; ctx.beginPath(); rrect(ctx, x - 4, y - 3, w + 8, h + 6, r + 4); ctx.fill();
    var gr = ctx.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, cTop); gr.addColorStop(1, cBot);
    ctx.fillStyle = gr; ctx.beginPath(); water(ctx); ctx.fill();
    ctx.save(); ctx.beginPath(); water(ctx); ctx.clip();
    // sand showing through the shallow edge + soft caustics
    var sg = ctx.createLinearGradient(0, y, 0, y + Math.min(30, h * 0.3)); sg.addColorStop(0, M.rain ? 'rgba(220,205,170,0.35)' : 'rgba(241,221,176,0.45)'); sg.addColorStop(1, 'rgba(241,221,176,0)');
    ctx.fillStyle = sg; ctx.fillRect(x, y, w, Math.min(30, h * 0.3));
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 2;
    for (i = 0; i < Math.max(3, w / 90); i++) {
      var cx = x + ((i * 97.3 + t * 9) % (w + 60)) - 30, cy = y + h * (0.35 + ((i * 0.41) % 0.55));
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.bezierCurveTo(cx + 12, cy - 5, cx + 22, cy + 5, cx + 34, cy); ctx.stroke();
    }
    var dg = ctx.createLinearGradient(0, y + h * 0.65, 0, y + h); dg.addColorStop(0, 'rgba(40,120,150,0)'); dg.addColorStop(1, 'rgba(40,120,150,0.16)');
    ctx.fillStyle = dg; ctx.fillRect(x, y + h * 0.6, w, h * 0.4);
    // a second, softer foam line lapping lower down
    ctx.strokeStyle = 'rgba(255,255,255,0.38)'; ctx.lineWidth = 2.2;
    ctx.beginPath(); for (var xx = x; xx <= x + w; xx += 10) { var yy = top + 11 - lap * 1.6 + Math.sin(xx * 0.05 - t * 1.3) * 2.2; if (xx === x) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy); } ctx.stroke();
    // ripples + a soft shadow under every resting spot (the pieces float)
    (tray.spots || []).forEach(function (s, k) {
      var sx = num(s.x, 0), sy = Math.min(y + h - 8, num(s.y, 0) + item * 0.36), ph = (t * 0.5 + k * 0.29) % 1;
      oval(ctx, sx, sy + 2, item * 0.42, item * 0.08, 0, 'rgba(30,95,120,0.16)');
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.55 * (1 - ph)).toFixed(3) + ')'; ctx.lineWidth = 2;
      ctx.beginPath(); ell(ctx, sx, sy, item * (0.4 + 0.18 * ph), item * (0.075 + 0.03 * ph), 0); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(sx, sy, item * 0.36, item * 0.065, 0, 0.1, Math.PI - 0.1); ctx.stroke();
    });
    // mood life on the water
    if (M.rain) {
      ctx.fillStyle = 'rgba(70,95,100,0.12)'; ctx.fillRect(x, y, w, h);   // a grey overcast veil on the water
      for (i = 0; i < Math.max(9, Math.round(w / 55)); i++) {             // many rain rings, two rings per drop
        var q = t * 1.1 + i * 0.29, cyc = Math.floor(q), p = q - cyc, hs = hashS('r' + i + ':' + cyc);
        var rx = x + 12 + (hs % 1000) / 1000 * (w - 24), ry = y + 16 + ((hs >>> 10) % 1000) / 1000 * (h - 28);
        ctx.strokeStyle = 'rgba(245,250,252,' + (0.8 * (1 - p)).toFixed(3) + ')'; ctx.lineWidth = 1.8;
        ctx.beginPath(); ell(ctx, rx, ry, 4 + p * 22, 1.5 + p * 6.5, 0); ctx.stroke();
        if (p > 0.25) { ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(245,250,252,' + (0.55 * (1 - p)).toFixed(3) + ')'; ctx.beginPath(); ell(ctx, rx, ry, (p - 0.25) * 14, (p - 0.25) * 4.4, 0); ctx.stroke(); }
        if (p < 0.18) dot(ctx, rx, ry - 2 - p * 20, 1.6, 'rgba(245,250,252,' + (0.9 * (1 - p / 0.18)).toFixed(3) + ')');   // the splash drop
      }
    } else if (M.wind) {
      ctx.strokeStyle = 'rgba(30,110,140,0.22)'; ctx.lineWidth = 1.6;   // choppy wavelets
      for (i = 0; i < Math.max(8, Math.round(w / 45)); i++) {
        var vx = x + ((i * 61.7 + t * 34) % (w + 30)) - 15, vy = y + h * (0.28 + ((i * 0.37) % 0.62));
        ctx.beginPath(); ctx.moveTo(vx - 9, vy); ctx.quadraticCurveTo(vx - 4.5, vy - 4, vx, vy); ctx.quadraticCurveTo(vx + 4.5, vy - 4, vx + 9, vy); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineWidth = 2.8;
      for (i = 0; i < Math.max(6, Math.round(w / 70)); i++) {           // white caps
        var wx = x + ((i * 173 + t * 40) % (w + 40)) - 20, wy = y + h * (0.32 + ((i * 0.29) % 0.55)), ws = 1.3 + ((i * 0.53) % 0.8);
        ctx.beginPath(); ctx.moveTo(wx - 9 * ws, wy + 2); ctx.quadraticCurveTo(wx - 2 * ws, wy - 6 * ws, wx + 7 * ws, wy - 3 * ws); ctx.quadraticCurveTo(wx + 2 * ws, wy, wx + 9 * ws, wy + 2); ctx.stroke();
        dot(ctx, wx + 9 * ws, wy - 1, 1.3, 'rgba(255,255,255,0.8)');
      }
    } else {
      for (i = 0; i < Math.max(4, Math.round(w / 90)); i++) {
        var k2 = Math.sin(t * 2.4 + i * 2.1); if (k2 < 0.55) continue;
        var px2 = x + 14 + ((i * 131.7) % (w - 28)), py2 = y + 18 + ((i * 53.3) % Math.max(10, h - 30)), sz = 3 + (k2 - 0.55) * 10;
        ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.95, (k2 - 0.55) * 2.4).toFixed(3) + ')'; ctx.beginPath(); starPath(ctx, px2, py2, sz, sz * 0.28); ctx.fill();
      }
    }
    ctx.restore();
    // the foam edge on the sand, lapping with t
    ctx.strokeStyle = M.rain ? 'rgba(240,244,246,0.85)' : 'rgba(255,255,255,0.95)'; ctx.lineWidth = 4.5;
    ctx.beginPath(); water(ctx); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (xx = x + r; xx < x + w - r; xx += 13) { var bob = Math.sin(xx * 0.3 + t * 2.2); if (bob > 0.1) { ctx.beginPath(); circ(ctx, xx, fy(xx) + 1, 1.8 + bob * 1.8); ctx.fill(); } }
    ctx.strokeStyle = 'rgba(120,170,180,0.35)'; ctx.lineWidth = 1.2; ctx.beginPath(); water(ctx, -2.5); ctx.stroke();
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
      var big = t.big === true || t.size === 'big', inner = t.animal ? { kind: 'animal', animal: t.animal } : { kind: 'obj', obj: t.obj || 'boat', color: t.color || 'red' };
      if (big) drawPiece(ctx, inner, size * 0.92, {});
      else {
        ctx.strokeStyle = 'rgba(120,100,80,0.28)'; ctx.setLineDash([5, 5]); ctx.lineWidth = 2;
        ctx.beginPath(); rrect(ctx, -size * 0.44, -size * 0.44, size * 0.88, size * 0.88, size * 0.12); ctx.stroke(); ctx.setLineDash([]);
        ctx.translate(0, size * 0.14); drawPiece(ctx, inner, size * 0.48, {});
      }
    } else if (k === 'obj' || k === 'shape' || k === 'coins' || k === 'bunch' || k === 'dots' || k === 'animal' || k === 'glyph') {
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
    // cuff: Mit's cream shirt with brown stripes
    ctx.fillStyle = '#F1E6CF'; ctx.strokeStyle = '#A27B55'; ctx.lineWidth = s * 0.035;
    ctx.beginPath(); rrect(ctx, -s * 0.25, s * 0.76, s * 0.46, s * 0.15, s * 0.06); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#A27B55'; ctx.fillRect(-s * 0.2, s * 0.8, s * 0.36, s * 0.025); ctx.fillRect(-s * 0.2, s * 0.85, s * 0.36, s * 0.025);
    ctx.restore();
  }


  // ================================================================= CHEST (origin = bottom centre, size = width)
  var CW = { wood: '#B47A44', woodD: '#6E4520', woodL: '#D39A60', inner: '#5A3418', band: N.brass };
  function drawChest(ctx, size, open, t) {
    if (!ctx) return;
    var W = num(size, 160); if (!(W > 2)) return;
    var a = clamp01(open), tt = num(t, 0), bh = W * 0.44, lh = W * 0.27, D = W * 0.34, th = a * 1.95, cs = Math.cos(th), sn = Math.sin(th);
    var hy = -bh, lw = Math.max(1.5, W * 0.022), bw = W * 0.085, bx = W * 0.3;
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    oval(ctx, 0, 0, W * 0.56, W * 0.07, 0, 'rgba(60,40,20,0.22)');
    if (a > 0.02) {   // glow
      var gk = Math.min(1, a * 1.4), gr = ctx.createRadialGradient(0, hy - W * 0.08, 0, 0, hy - W * 0.08, W * (0.5 + 0.35 * gk));
      gr.addColorStop(0, 'rgba(255,236,150,' + (0.85 * gk).toFixed(3) + ')'); gr.addColorStop(0.5, 'rgba(255,214,90,' + (0.35 * gk).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(255,214,90,0)');
      ctx.fillStyle = gr; ctx.fillRect(-W * 0.9, hy - W * 0.95, W * 1.8, W * 1.4);
      for (var i = 0; i < 7; i++) {   // soft rays
        var ra = -Math.PI / 2 + (i - 3) * 0.32 + Math.sin(tt * 0.8 + i) * 0.03, rl = W * (0.55 + 0.12 * (i % 2)) * gk;
        ctx.fillStyle = 'rgba(255,240,180,' + (0.28 * gk).toFixed(3) + ')';
        ctx.beginPath(); ctx.moveTo(0, hy); ctx.lineTo(Math.cos(ra - 0.07) * rl, hy + Math.sin(ra - 0.07) * rl); ctx.lineTo(Math.cos(ra + 0.07) * rl, hy + Math.sin(ra + 0.07) * rl); ctx.closePath(); ctx.fill();
      }
    }
    var ly = hy - D * sn * 0.62;   // the lid's front edge (it rises as the lid swings back)
    function lidOuter(yb, hh) {    // the dome face of the lid, bottom edge at yb, height hh (> 0)
      ctx.beginPath(); ctx.moveTo(-W / 2, yb); ctx.lineTo(-W / 2, yb - hh * 0.5); ctx.bezierCurveTo(-W / 2, yb - hh * 1.1, W / 2, yb - hh * 1.1, W / 2, yb - hh * 0.5); ctx.lineTo(W / 2, yb); ctx.closePath();
    }
    function lidBands(yb, hh) {
      ctx.fillStyle = CW.band.base; ctx.strokeStyle = CW.band.dark; ctx.lineWidth = lw * 0.7;
      [-bx, bx].forEach(function (x) { ctx.beginPath(); ctx.moveTo(x - bw / 2, yb); ctx.lineTo(x - bw / 2, yb - hh * 0.86); ctx.lineTo(x + bw / 2, yb - hh * 0.86); ctx.lineTo(x + bw / 2, yb); ctx.closePath(); ctx.fill(); ctx.stroke(); });
    }
    if (a > 0.02) {
      // the open mouth: dark inside, then the gold heap rising
      ctx.fillStyle = CW.inner; ctx.beginPath(); ctx.rect(-W / 2 + lw, ly, W - 2 * lw, hy - ly + 2); ctx.fill();
      var pk = clamp01((th - 0.9) / 0.7);
      if (pk > 0) {   // the inside of the lid swings up behind the gold (continuous through upright)
        var ih = (hy - ly) + (cs < 0 ? lh * -cs * 1.4 : 0), ptop = hy - ih;
        ctx.save(); ctx.globalAlpha *= pk;
        ctx.fillStyle = mix(CW.wood, CW.inner, 0.45); ctx.strokeStyle = CW.woodD; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.rect(-W / 2, ptop, W, ih); ctx.fill(); ctx.stroke();
        lidBands(hy, ih / 0.86);
        ctx.restore();
      }
      var hk = Math.max(0, Math.min(1, (a - 0.25) / 0.6)), heapTop = hy - W * 0.13 * hk;
      if (hk > 0) {
        ctx.save(); ctx.beginPath(); ctx.rect(-W, heapTop - W * 0.12, W * 2, hy - heapTop + W * 0.14); ctx.clip();
        ctx.fillStyle = N.gold.dark; ctx.beginPath(); ctx.moveTo(-W / 2 + lw, hy + 2); ctx.quadraticCurveTo(-W * 0.3, heapTop, 0, heapTop - W * 0.02); ctx.quadraticCurveTo(W * 0.3, heapTop, W / 2 - lw, hy + 2); ctx.closePath(); ctx.fill();
        var cr = W * 0.055;
        [[-0.32, 0.25], [-0.18, 0.6], [0, 0.85], [0.17, 0.62], [0.33, 0.28], [-0.08, 0.35], [0.08, 0.3], [-0.26, 0.05], [0.25, 0.05]].forEach(function (q, k) {
          var cxx = q[0] * W, cyy = hy - W * 0.13 * hk * q[1] + cr * 0.2;
          ctx.fillStyle = N.gold.base; ctx.strokeStyle = N.gold.dark; ctx.lineWidth = lw * 0.6; ctx.beginPath(); ell(ctx, cxx, cyy, cr, cr * 0.62, 0); ctx.fill(); ctx.stroke();
          ctx.fillStyle = N.gold.light; ctx.beginPath(); ell(ctx, cxx - cr * 0.25, cyy - cr * 0.15, cr * 0.4, cr * 0.18, 0); ctx.fill();
          var gl = Math.sin(tt * 3 + k * 1.9); if (gl > 0.75) { ctx.fillStyle = 'rgba(255,255,255,' + ((gl - 0.75) * 3.6).toFixed(3) + ')'; ctx.beginPath(); starPath(ctx, cxx + cr * 0.4, cyy - cr * 0.4, cr * 0.7, cr * 0.18); ctx.fill(); }
        });
        ctx.restore();
      }
    }
    // the body
    ctx.fillStyle = CW.wood; ctx.strokeStyle = CW.woodD; ctx.lineWidth = lw;
    ctx.beginPath(); rrect(ctx, -W / 2, -bh, W, bh, W * 0.04); ctx.fill();
    ctx.save(); ctx.beginPath(); rrect(ctx, -W / 2, -bh, W, bh, W * 0.04); ctx.clip();
    ctx.fillStyle = rgba(CW.woodD, 0.25); ctx.fillRect(-W / 2, -bh * 0.18, W, bh * 0.18);
    ctx.fillStyle = rgba(CW.woodL, 0.6); ctx.fillRect(-W / 2, -bh, W, bh * 0.1);
    ctx.strokeStyle = rgba(CW.woodD, 0.55); ctx.lineWidth = lw * 0.6;
    for (var p = 1; p < 3; p++) { ctx.beginPath(); ctx.moveTo(-W / 2, -bh + bh * p / 3); ctx.lineTo(W / 2, -bh + bh * p / 3); ctx.stroke(); }
    ctx.restore();
    ctx.strokeStyle = CW.woodD; ctx.lineWidth = lw; ctx.beginPath(); rrect(ctx, -W / 2, -bh, W, bh, W * 0.04); ctx.stroke();
    [-bx, bx].forEach(function (x) {
      ctx.fillStyle = CW.band.base; ctx.strokeStyle = CW.band.dark; ctx.lineWidth = lw * 0.7; ctx.beginPath(); ctx.rect(x - bw / 2, -bh, bw, bh); ctx.fill(); ctx.stroke();
      dot(ctx, x, -bh * 0.25, bw * 0.13, CW.band.dark); dot(ctx, x, -bh * 0.75, bw * 0.13, CW.band.dark);
      ctx.fillStyle = rgba(CW.band.light, 0.9); ctx.fillRect(x - bw / 2 + 1, -bh + 1, bw * 0.25, bh - 2);
    });
    // the lid (outer face) while it is not yet past upright
    if (cs > 0) {
      var hh = lh * cs;
      ctx.fillStyle = CW.wood; ctx.strokeStyle = CW.woodD; ctx.lineWidth = lw; lidOuter(ly, hh); ctx.fill();
      ctx.save(); lidOuter(ly, hh); ctx.clip(); ctx.fillStyle = rgba(CW.woodL, 0.55); ctx.fillRect(-W / 2, ly - hh * 1.1, W, hh * 0.35); ctx.restore();
      lidOuter(ly, hh); ctx.stroke();
      lidBands(ly, hh);
      ctx.fillStyle = CW.band.base; ctx.strokeStyle = CW.band.dark; ctx.lineWidth = lw * 0.7; ctx.beginPath(); ctx.rect(-W / 2, ly - W * 0.035, W, W * 0.035); ctx.fill(); ctx.stroke();
    }
    // the lock plate (on the body, under the lid's edge)
    var lk = W * 0.12;
    ctx.fillStyle = CW.band.base; ctx.strokeStyle = CW.band.dark; ctx.lineWidth = lw * 0.8; ctx.beginPath(); rrect(ctx, -lk / 2, -bh - lk * 0.1, lk, lk * 1.05, lk * 0.25); ctx.fill(); ctx.stroke();
    ctx.fillStyle = CW.inner; ctx.beginPath(); circ(ctx, 0, -bh + lk * 0.32, lk * 0.13); ctx.fill(); ctx.beginPath(); rpoly(ctx, [[-lk * 0.06, -bh + lk * 0.36], [lk * 0.06, -bh + lk * 0.36], [lk * 0.1, -bh + lk * 0.72], [-lk * 0.1, -bh + lk * 0.72]], 1); ctx.fill();
    ctx.restore();
  }

  // ================================================================= SCROLL (a rolled parchment cylinder, origin = centre)
  function drawScroll(ctx, w, r) {
    if (!ctx) return;
    w = num(w, 200); r = num(r, 18); if (!(w > 1 && r > 0.5)) return;
    var ex = r * 0.38;
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    oval(ctx, 0, r * 1.05, w * 0.5, r * 0.28, 0, 'rgba(60,40,20,0.18)');
    var g = ctx.createLinearGradient(0, -r, 0, r);
    g.addColorStop(0, '#D8BC86'); g.addColorStop(0.22, '#F8EBCB'); g.addColorStop(0.5, '#F0DDB2'); g.addColorStop(0.85, '#CFAE72'); g.addColorStop(1, '#B8955A');
    ctx.fillStyle = g; ctx.beginPath(); ctx.rect(-w / 2, -r, w, 2 * r); ctx.fill();
    ctx.strokeStyle = 'rgba(160,120,70,0.35)'; ctx.lineWidth = Math.max(1, r * 0.06);
    for (var i = 1; i < 5; i++) { var x = -w / 2 + w * i / 5 + Math.sin(i * 7.3) * w * 0.03; ctx.beginPath(); ctx.moveTo(x, -r * 0.7); ctx.quadraticCurveTo(x + r * 0.2, 0, x, r * 0.7); ctx.stroke(); }
    ctx.strokeStyle = '#9A7448'; ctx.lineWidth = Math.max(1.2, r * 0.1);
    ctx.beginPath(); ctx.moveTo(-w / 2, -r); ctx.lineTo(w / 2, -r); ctx.moveTo(-w / 2, r); ctx.lineTo(w / 2, r); ctx.stroke();
    [-1, 1].forEach(function (sd) {   // rolled ends with a spiral
      var cx = sd * w / 2;
      ctx.fillStyle = '#EAD3A4'; ctx.strokeStyle = '#9A7448'; ctx.lineWidth = Math.max(1.2, r * 0.1);
      ctx.beginPath(); ell(ctx, cx, 0, ex, r, 0); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(140,100,55,0.8)'; ctx.lineWidth = Math.max(1, r * 0.07); ctx.beginPath();
      for (var k = 0; k <= 30; k++) { var a = k / 30 * TAU * 2.2, q = 0.12 + k / 30 * 0.72; var px = cx + Math.cos(a) * ex * q, py = Math.sin(a) * r * q; if (!k) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
      ctx.stroke();
    });
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillRect(-w / 2 + ex, -r * 0.62, w - 2 * ex, r * 0.12);
    ctx.restore();
  }

  // ================================================================= FISH peeking out of the water (origin = waterline centre)
  function drawFish(ctx, size, a) {
    if (!ctx) return;
    var S = num(size, 60), v = clamp01(a); if (!(S > 1) || v <= 0.001) return;
    var R = S * 0.5, c = AC.fish, cy = -R * 0.5 + (1 - v) * R * 1.7;
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.save(); ctx.beginPath(); ctx.rect(-S * 2, -S * 3, S * 4, S * 3 + 1); ctx.clip();
    ctx.translate(0, cy);
    var lw = Math.max(1.5, S * 0.05);
    // side fins (waving) + top fin
    [-1, 1].forEach(function (sd) {
      ctx.fillStyle = AC.fin.base; ctx.strokeStyle = AC.fin.dark; ctx.lineWidth = lw;
      ctx.beginPath(); ell(ctx, sd * R * 0.98, R * 0.35, R * 0.34, R * 0.18, sd * 0.6); ctx.fill(); ctx.stroke();
    });
    ctx.fillStyle = AC.fin.base; ctx.strokeStyle = AC.fin.dark; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(-R * 0.4, -R * 0.82); ctx.quadraticCurveTo(-R * 0.1, -R * 1.45, R * 0.42, -R * 0.84); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = c.base; ctx.beginPath(); ell(ctx, 0, 0, R, R * 0.92, 0); ctx.fill();
    ctx.save(); ctx.beginPath(); ell(ctx, 0, 0, R, R * 0.92, 0); ctx.clip();
    ctx.fillStyle = shadeOf(c); ctx.beginPath(); ell(ctx, R * 0.25, R * 0.3, R, R * 0.92, 0); ctx.fill();
    ctx.fillStyle = c.base; ctx.beginPath(); ell(ctx, -R * 0.08, -R * 0.1, R * 0.98, R * 0.9, 0); ctx.fill();
    ctx.fillStyle = AC.stripe; ctx.beginPath(); ctx.rect(-R, R * 0.38, R * 2, R * 0.22); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = c.dark; ctx.lineWidth = lw; ctx.beginPath(); ell(ctx, 0, 0, R, R * 0.92, 0); ctx.stroke();
    oval(ctx, -R * 0.45, -R * 0.5, R * 0.18, R * 0.1, -0.6, 'rgba(255,255,255,0.8)');
    eye(ctx, -R * 0.36, -R * 0.2, R * 0.18, 0); eye(ctx, R * 0.36, -R * 0.2, R * 0.18, 0);
    cheeks(ctx, -R * 0.62, R * 0.62, R * 0.12, R * 0.12);
    ctx.fillStyle = '#B4583A'; ctx.beginPath(); ell(ctx, 0, R * 0.18, R * 0.13, R * 0.15, 0); ctx.fill();   // "o" mouth, blowing bubbles
    ctx.fillStyle = 'rgba(255,190,190,0.8)'; ctx.beginPath(); ell(ctx, 0, R * 0.22, R * 0.07, R * 0.06, 0); ctx.fill();
    ctx.restore();
    // ripples + a water sheen at the waterline
    var k = Math.min(1, v * 1.6);
    ctx.fillStyle = 'rgba(92,195,214,' + (0.45 * k).toFixed(3) + ')'; ctx.beginPath(); ell(ctx, 0, 1, S * 0.62, S * 0.11, 0); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.9 * k).toFixed(3) + ')'; ctx.lineWidth = Math.max(1.5, S * 0.05);
    ctx.beginPath(); ctx.ellipse(0, 0, S * 0.6, S * 0.1, 0, 0.05, Math.PI - 0.05); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.5 * k).toFixed(3) + ')'; ctx.lineWidth = Math.max(1, S * 0.03);
    ctx.beginPath(); ell(ctx, 0, 2, S * 0.85, S * 0.15, 0); ctx.stroke();
    ctx.restore();
  }

  function clearCache() {
    pcache = {}; pN = 0; bcache = {}; geomCache = {}; specCache = {}; coinCache = {}; dotsCache = {};
    Object.keys(layerCache).forEach(function (k) { freeLayer(layerCache[k]); }); layerCache = {}; layerOrder = [];
    Object.keys(boardCache).forEach(function (k) { boardCache[k].width = 0; }); boardCache = {}; boardOrder = [];
    Object.keys(spriteCache).forEach(function (k) { spriteCache[k].c.width = 0; }); spriteCache = {}; spriteOrder = [];
    measureCtx = null;
  }

  TM.PuzzleArt = {
    drawPiece: drawPiece, drawShadow: drawShadow, pieceBox: pieceBox, drawBoard: drawBoard, drawTray: drawTray,
    drawBubble: drawBubble, drawIcon: drawIcon, drawGhostHand: drawGhostHand, sceneBusy: sceneBusy,
    drawChest: drawChest, drawScroll: drawScroll, drawFish: drawFish, coinSpots: coinSpots,
    pal: pal, PALETTE: FALLBACK, FONT: FONT, OBJECTS: OBJECTS, SHAPES: SHAPES, ANIMALS: ANIMALS, SCENES: SCENES, SCENE_ALIAS: SCENE_ALIAS,
    thingKey: thingKey, clearCache: clearCache
  };
})(typeof window !== 'undefined' ? window : this);
