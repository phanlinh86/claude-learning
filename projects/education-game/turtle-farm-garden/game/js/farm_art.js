/* Tumi's Flower Farm — FT.FarmArt (character artist B), DESIGN §3 / §4.2. Everything here is drawn by code on a 2D canvas.
 * Node-safe at load (no DOM access at load; Path2D / offscreen canvases are used lazily when they exist).
 *
 *   drawTray(ctx, box, opt)              raised wooden garden bed: plank frame OUTSIDE box (≤ opt.frame px, default 26), dark
 *                                        soil inside box (crumbs, a few pebbles); opt {glow 0..1 gold rim pulse, frame, time}
 *   drawRack(ctx, rack, opt) = drawFence the farm fence strip: 2 rails + rounded pickets across rack {x, y, w, h}
 *   drawBadge(ctx, ck, size, opt)        prize rosette: ribbon tails + pleated ring (ck.hex || first row colour || gold), white
 *                                        centre disc with a mini picture of ck (patch / sign + rows + carrots); origin = ring
 *                                        centre, size = ring diameter, hangs from a nail at the top. opt {sx, sy, wob, glow,
 *                                        sparkle, lift, dim, time}
 *   drawCookie(ctx, ck, size, opt)       origin = centre. ck = { kind:'round'|'shape'|'glyph'|'animal'|'home', shape?, text?,
 *       animal?, home?, icing?: [{pts, hex, width}], chips?: [{x, y, r}], icingBox?: {cx, cy, size} }   (as the bakery)
 *       opt.look: 'sign' (default) wooden sign on a short stake (board ≈ size, stake below to ≈ +0.6 size)
 *                 'bed'    on the garden bed: round → raked soil patch, shape → lighter raked patch cut in the shape (same
 *                          geometry as the bakery cookie body, so content.js SHAPE_FIT still holds), glyph → the sign lying
 *                          flat (numeral painted ≈ 0.74 size tall = the traced numeral), animal → standing animal, home → home
 *                          (≈ size tall, bottom at +0.45 size)
 *                 'walker' the animal alone, walking (opt.step 0..1 leg phase; default from opt.time), facing RIGHT
 *                 'badge'  = drawBadge
 *       A 'round' ck that still carries `text` (render.js renderCk(ck, plain) turns a glyph into 'round') draws as the same
 *       sign WITHOUT its numeral, so the plain cross-fade keeps the board.
 *       icing in ck → drawIcing({bloom:1}); chips → carrots. opt { look, lift, wob, glow, dim, selected, sparkle, squash | sx,
 *       sy, step, icing (extra list), icingBox, time }
 *   drawPacket(ctx, hex, size, opt)      seed packet (colour choices), origin = centre, size = height; opt {lift, wob, glow,
 *                                        selected, dim, time}
 *   drawIcingBag(ctx, hex, size, angle, opt)  the WATERING CAN. Origin = SPOUT TIP (or the visual centre with opt.center). At
 *       angle 0 the can sits above the tip, tipped for pouring; + clockwise. hex → colour band + flower decal (null → cream).
 *       opt {squeeze 0..1 (pouring: drops fall, tilts a little more), lift, wob, glow, selected, dim, empty, center, time}
 *       CAN_GRIP = handle point (× size, tip-relative, angle 0), CAN_CENTER = body centre, BAG_CENTER = CAN_CENTER.y (legacy).
 *   drawGuide(ctx, path, state, opt)     guide dots as the bakery (cream dots, dark soil rim), start ring + chevron, badges
 *   drawIcing(ctx, pts, hex, width, opt) planted row: furrow + plants every ≈ 26 px that GROW by distance from the END of pts
 *       (seed → sprout → bud → flower); opt {wet 0..1, alpha, bloom 0..1 (wave + overshoot, all open), grown (true: all full),
 *       road (pebble path), time (sway), screenScale, dpr}
 *   drawChip(ctx, r, opt)                carrot out of a soil mound, origin = mound centre; opt {squash (sy factor), grow 0..1}
 *   drawSprinkle(ctx, hex, len, rot)     a falling petal
 *   drawIcon(ctx, thing, size)           Talk-time icons: blob{color} shape{shape,color?} animal home number letter dots size cookie
 *   drawGhostHand(ctx, size, press)      pointing hand, origin = fingertip (finger UP)
 *   drawFlourPuff(ctx, r, t)             straw + dust puff, t 0..1
 *   drawPlant(ctx, hex, g, scale)        one plant, base at origin, g 0..1 growth (seed → flower)
 *   Helpers: pal(c), arcLengths(st), clearCache(), PALETTE, SOIL, BED, SIGN, FENCE, FONT, SHAPES, ANIMALS, HOMES.
 */
(function (FT) {
  'use strict';

  var TAU = Math.PI * 2;
  var FALLBACK_PALETTE = {
    red:    { base: '#E84A4A', dark: '#A8282E', light: '#F7A0A0' },
    blue:   { base: '#3C8DE8', dark: '#1F5BA8', light: '#A6CCF5' },
    yellow: { base: '#FFD23F', dark: '#C99A12', light: '#FFEB9C' },
    green:  { base: '#4CC26B', dark: '#2A8343', light: '#A8E6B8' },
    orange: { base: '#FF9A2E', dark: '#C4650C', light: '#FFCB8E' },
    purple: { base: '#8E44AD', dark: '#6840A8', light: '#D2BDF3' },
    pink:   { base: '#FF8FC0', dark: '#C9558A', light: '#FFCCE2' }
  };
  var SOIL = { soil: '#6B4630', light: '#8A5E40', dark: '#4A2F1F', crumb: '#9C6E4C', deep: '#3A2418' };
  var BED = { wood: '#C9935E', shade: '#9C6B3E', outline: '#6E4526', light: '#E2B27E' };
  var SIGN = { wood: '#F0D3A0', shade: '#CFA36C', outline: '#8A5A2E', glyph: '#5A3A28', light: '#FBE6C2' };
  var FENCE = { wood: '#D7B58A', shade: '#B8936A', outline: '#7E5A36', light: '#EBD3B0' };
  var STEM = '#5FA046', STEM_DK = '#3E7A2E', LEAF_LT = '#8CC56A';
  var CENTRE = '#FFE08A', CENTRE_RIM = '#C99A12', CENTRE_BROWN = '#8A5A2E';
  var STONE = '#D9CFC0', STONE_DK = '#B3A58F';
  var TIN = { base: '#B8C4CC', shade: '#8B98A2', light: '#E3EAEE', line: '#5E6B75' };
  var CARROT = { base: '#F2913A', dark: '#B85F1E', light: '#FFC07A' };
  var GOLD = { base: '#F5C542', dark: '#B8891A', light: '#FFE7A0' };
  var CREAM = { base: '#FFF3DE', dark: '#C9B392', light: '#FFFFFF' };
  var FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", system-ui, sans-serif';
  var SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'rect', 'diamond', 'oval'];
  var ANIMALS = ['dog', 'bee', 'bird', 'frog', 'duck', 'cow', 'sheep', 'rabbit', 'hen', 'pig'];
  var HOMES = ['kennel', 'hive', 'nest', 'pond', 'barn', 'burrow', 'coop', 'sty'];
  var ROW_STEP = 26;

  // ---------------------------------------------------------------- helpers
  function num(v, d) { v = +v; return isFinite(v) ? v : (d || 0); }
  function clamp01(v) { v = +v || 0; return v < 0 ? 0 : v > 1 ? 1 : v; }
  function amt(v) { return v === true ? 1 : clamp01(v); }
  function rgb(h) { h = String(h).replace('#', ''); return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]; }
  function mix(a, b, t) {
    var A = rgb(a), B = rgb(b), o = '#';
    for (var i = 0; i < 3; i++) { var v = Math.round(A[i] + (B[i] - A[i]) * t); o += (v < 16 ? '0' : '') + v.toString(16); }
    return o.toUpperCase();
  }
  function rgba(h, a) { var c = rgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + clamp01(a).toFixed(3) + ')'; }
  function nowSec() { return (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) / 1000; }
  function hash(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function pal(c) {
    if (!c) return null;
    var P = FT.PALETTE || FALLBACK_PALETTE, p = (P && P[c]) || FALLBACK_PALETTE[c];
    if (p && typeof p === 'object' && p.base) return { base: p.base, dark: p.dark || mix(p.base, '#000000', 0.35), light: p.light || mix(p.base, '#FFFFFF', 0.45) };
    if (typeof c === 'string' && /^#[0-9A-Fa-f]{6}$/.test(c)) {
      for (var k in FALLBACK_PALETTE) if (FALLBACK_PALETTE[k].base.toUpperCase() === c.toUpperCase()) return pal(k);
      return { base: c, dark: mix(c, '#000000', 0.32), light: mix(c, '#FFFFFF', 0.5) };
    }
    return null;
  }
  function rr(p, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    p.moveTo(x + r, y); p.lineTo(x + w - r, y); p.arcTo(x + w, y, x + w, y + r, r);
    p.lineTo(x + w, y + h - r); p.arcTo(x + w, y + h, x + w - r, y + h, r);
    p.lineTo(x + r, y + h); p.arcTo(x, y + h, x, y + h - r, r);
    p.lineTo(x, y + r); p.arcTo(x, y, x + r, y, r); p.closePath();
  }
  function C(p, x, y, r) { p.moveTo(x + r, y); p.arc(x, y, Math.max(0.01, r), 0, TAU); p.closePath(); }
  function El(p, x, y, rx, ry, rot) { rot = rot || 0; rx = Math.max(0.01, rx); ry = Math.max(0.01, ry); p.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot)); p.ellipse(x, y, rx, ry, rot, 0, TAU); p.closePath(); }
  function poly(p, v, r) {   // rounded polygon, auto-oriented clockwise
    var n = v.length, a = 0, i;
    for (i = 0; i < n; i++) a += v[i][0] * v[(i + 1) % n][1] - v[(i + 1) % n][0] * v[i][1];
    if (a < 0) v = v.slice().reverse();
    var m0 = [(v[n - 1][0] + v[0][0]) / 2, (v[n - 1][1] + v[0][1]) / 2];
    p.moveTo(m0[0], m0[1]);
    for (i = 0; i < n; i++) { var q = v[i], nx = v[(i + 1) % n]; p.arcTo(q[0], q[1], (q[0] + nx[0]) / 2, (q[1] + nx[1]) / 2, r); }
    p.closePath();
  }
  function sc(v, s) { return v.map(function (q) { return [q[0] * s, q[1] * s]; }); }

  // ---------------------------------------------------------------- Path2D cache: a "shape" = {p: Path2D|null, fn}
  var cache = {}, cacheN = 0, MAX_CACHE = 500;
  function shape(key, fn) {
    if (typeof Path2D === 'undefined') return { p: null, fn: fn };
    var hit = cache[key];
    if (!hit) {
      if (cacheN > MAX_CACHE) { cache = {}; cacheN = 0; }
      var p = new Path2D(); fn(p);
      hit = cache[key] = { p: p, fn: fn }; cacheN++;
    }
    return hit;
  }
  function tmp(fn) {
    if (typeof Path2D === 'undefined') return { p: null, fn: fn };
    var p = new Path2D(); fn(p); return { p: p, fn: fn };
  }
  function fillS(ctx, S) { if (S.p) ctx.fill(S.p); else { ctx.beginPath(); S.fn(ctx); ctx.fill(); } }
  function strokeS(ctx, S) { if (S.p) ctx.stroke(S.p); else { ctx.beginPath(); S.fn(ctx); ctx.stroke(); } }
  function clipS(ctx, S) { if (S.p) ctx.clip(S.p); else { ctx.beginPath(); S.fn(ctx); ctx.clip(); } }

  // ---------------------------------------------------------------- offscreen sprite cache (browser only)
  var sprites = {}, spriteN = 0, spritePx = 0, MAX_SPRITES = 900, MAX_PX = 24e6;
  function canMake() { return typeof document !== 'undefined' && document && typeof document.createElement === 'function'; }
  function sprite(key, w, h, k, draw) {   // w × h units at k device px per unit; draw(g) in units with origin at (0,0)=top-left
    var hit = sprites[key];
    if (hit) return hit;
    if (!canMake()) return null;
    if (spriteN > MAX_SPRITES || spritePx > MAX_PX) { sprites = {}; spriteN = 0; spritePx = 0; }
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w * k)); c.height = Math.max(1, Math.ceil(h * k));
    var g = c.getContext('2d'); if (!g) return null;
    g.scale(k, k); draw(g);
    hit = sprites[key] = { c: c, w: w, h: h }; spriteN++; spritePx += c.width * c.height;
    return hit;
  }
  function clearCache() { cache = {}; cacheN = 0; glyphM = {}; sprites = {}; spriteN = 0; spritePx = 0; }
  /** draw a static piece through a sprite at the current device scale (size steps of 8 %, rendered at the step above, so
   *  it is only ever scaled down). Box (bx, by, bw, bh) in units of size around the origin. false = not cached (draw it). */
  function cachedLook(ctx, key, size, bx, by, bw, bh, draw, maxPx) {
    if (!canMake()) return false;
    var k = devScale(ctx), px = size * k;
    if (!(px >= 10 && px <= (maxPx || 720))) return false;
    var q = Math.ceil(Math.log(px) / Math.log(1.08)), S = Math.pow(1.08, q);
    var spr = sprite(key + '|' + q, bw * S, bh * S, 1, function (g) { g.translate(-bx * S, -by * S); g.lineJoin = 'round'; g.lineCap = 'round'; draw(g, S); });
    if (!spr) return false;
    ctx.drawImage(spr.c, bx * size, by * size, bw * size, bh * size);
    return true;
  }
  /** device px per local unit (the full transform scale), ≥ 0.25 */
  function devScale(ctx) {
    var m = null;
    try { m = ctx.getTransform ? ctx.getTransform() : null; } catch (e) { m = null; }
    if (!m || !isFinite(m.a) || !isFinite(m.b)) return 1;
    var k = Math.hypot(m.a, m.b);
    return k > 0.01 && isFinite(k) ? k : 1;
  }
  function bucket(k) { var B = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6]; for (var i = 0; i < B.length; i++) if (B[i] >= k - 0.02) return B[i]; return 6; }

  // ---------------------------------------------------------------- drawing DSL
  function part(ctx, build, fill, line, lw) {
    ctx.beginPath(); build(ctx);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (line && lw > 0) { ctx.lineWidth = lw; ctx.strokeStyle = line; ctx.stroke(); }
  }
  /** one-step cel shading: shade fill, base fill shifted up-left (clipped), outline, optional highlight */
  function cel(ctx, build, base, shade, line, lw, off, hi) {
    ctx.beginPath(); build(ctx);
    ctx.fillStyle = shade; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.translate(-off, -off * 1.2); ctx.beginPath(); build(ctx); ctx.fillStyle = base; ctx.fill();
    ctx.restore();
    if (hi) { ctx.fillStyle = hi[4] || 'rgba(255,255,255,0.45)'; ctx.beginPath(); El(ctx, hi[0], hi[1], hi[2], hi[3], -0.5); ctx.fill(); }
    if (line && lw > 0) { ctx.beginPath(); build(ctx); ctx.lineWidth = lw; ctx.strokeStyle = line; ctx.stroke(); }
  }
  function eye(ctx, x, y, r, col) {
    ctx.fillStyle = col || '#3A2A22'; ctx.beginPath(); C(ctx, x, y, r); ctx.fill();
    ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); C(ctx, x - r * 0.3, y - r * 0.34, r * 0.4); C(ctx, x + r * 0.32, y + r * 0.3, r * 0.15); ctx.fill();
  }
  function blush(ctx, x, y, r) { ctx.fillStyle = 'rgba(240,130,120,0.45)'; ctx.beginPath(); El(ctx, x, y, r, r * 0.65); ctx.fill(); }
  function line(ctx, build, col, lw) { ctx.beginPath(); build(ctx); ctx.lineWidth = lw; ctx.strokeStyle = col; ctx.stroke(); }
  /** a rounded leg that swings about its hip (x, y) */
  function leg(ctx, x, y, w, h, ang, fill, ln, lw, foot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    part(ctx, function (p) { rr(p, -w / 2, -w * 0.3, w, h + w * 0.3, w * 0.45); }, fill, ln, lw);
    if (foot) part(ctx, function (p) { rr(p, -w / 2, h - w * 0.55, w, w * 0.55, w * 0.25); }, foot, ln, lw);
    ctx.restore();
  }
  function tuft(ctx, x, y, s, col, dk) {
    ctx.beginPath();
    ctx.moveTo(x - s * 0.5, y); ctx.quadraticCurveTo(x - s * 0.45, y - s * 0.5, x - s * 0.6, y - s * 0.95);
    ctx.quadraticCurveTo(x - s * 0.2, y - s * 0.55, x - s * 0.1, y - s * 0.2);
    ctx.quadraticCurveTo(x - s * 0.05, y - s * 0.8, x + s * 0.05, y - s * 1.15);
    ctx.quadraticCurveTo(x + s * 0.2, y - s * 0.6, x + s * 0.15, y - s * 0.2);
    ctx.quadraticCurveTo(x + s * 0.35, y - s * 0.55, x + s * 0.65, y - s * 0.85);
    ctx.quadraticCurveTo(x + s * 0.5, y - s * 0.35, x + s * 0.5, y); ctx.closePath();
    ctx.fillStyle = col || STEM; ctx.fill(); ctx.lineWidth = Math.max(1, s * 0.12); ctx.strokeStyle = dk || STEM_DK; ctx.stroke();
  }

  // ================================================================ SHAPE OUTLINES (unit box, centred; s = path size)
  var SHAPE_B = {
    circle: function (p, s) { C(p, 0, 0, s * 0.5); },
    oval: function (p, s) { El(p, 0, 0, s * 0.5, s * 0.36); },
    square: function (p, s) { poly(p, sc([[-0.44, -0.44], [0.44, -0.44], [0.44, 0.44], [-0.44, 0.44]], s), s * 0.13); },
    rect: function (p, s) { poly(p, sc([[-0.5, -0.31], [0.5, -0.31], [0.5, 0.31], [-0.5, 0.31]], s), s * 0.11); },
    triangle: function (p, s) { poly(p, sc([[0, -0.46], [0.52, 0.43], [-0.52, 0.43]], s), s * 0.11); },
    diamond: function (p, s) { poly(p, sc([[0, -0.5], [0.4, 0], [0, 0.5], [-0.4, 0]], s), s * 0.075); },
    star: function (p, s) {
      var v = [];
      for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.25 : 0.53; v.push([Math.cos(a) * r, Math.sin(a) * r + 0.05]); }
      poly(p, sc(v, s), s * 0.05);
    },
    heart: function (p, s) {
      p.moveTo(0, s * 0.45);
      p.bezierCurveTo(-s * 0.1, s * 0.36, -s * 0.52, s * 0.12, -s * 0.52, -s * 0.15);
      p.bezierCurveTo(-s * 0.52, -s * 0.4, -s * 0.26, -s * 0.5, -s * 0.13, -s * 0.46);
      p.bezierCurveTo(-s * 0.05, -s * 0.43, 0, -s * 0.36, 0, -s * 0.3);
      p.bezierCurveTo(0, -s * 0.36, s * 0.05, -s * 0.43, s * 0.13, -s * 0.46);
      p.bezierCurveTo(s * 0.26, -s * 0.5, s * 0.52, -s * 0.4, s * 0.52, -s * 0.15);
      p.bezierCurveTo(s * 0.52, s * 0.12, s * 0.1, s * 0.36, 0, s * 0.45);
      p.closePath();
    }
  };

  // ================================================================ ANIMALS (side / 3/4 view facing RIGHT)
  // fn(ctx, s, k): s = figure size, origin = figure centre, feet on y = +0.44 s. k = {step 0..1, time, still}
  function swing(k, ph) { return k.still ? 0 : Math.sin((k.step + ph) * TAU) * 0.38; }
  function lwOf(s) { return Math.max(1.3, s * 0.026); }
  var ANIMAL = {
    dog: function (ctx, s, k) {
      var B = '#EECDA0', S = '#D4A773', L = '#7E5532', E = '#9A6440', ES = '#7E4E30', lw = lwOf(s), o = s * 0.03;
      var wag = Math.sin(k.time * 9) * 0.25;
      // tail
      ctx.save(); ctx.translate(-s * 0.32, s * 0.02); ctx.rotate(-0.5 + wag);
      line(ctx, function (p) { p.moveTo(0, 0); p.quadraticCurveTo(-s * 0.06, -s * 0.12, -s * 0.02, -s * 0.2); }, L, s * 0.075 + 2 * lw);
      line(ctx, function (p) { p.moveTo(0, 0); p.quadraticCurveTo(-s * 0.06, -s * 0.12, -s * 0.02, -s * 0.2); }, B, s * 0.075);
      ctx.restore();
      ctx.lineCap = 'round';
      // far legs
      leg(ctx, -s * 0.2, s * 0.18, s * 0.1, s * 0.22, swing(k, 0.5), S, L, lw, ES);
      leg(ctx, s * 0.12, s * 0.18, s * 0.1, s * 0.22, swing(k, 0), S, L, lw, ES);
      cel(ctx, function (p) { El(p, -s * 0.06, s * 0.1, s * 0.3, s * 0.17); }, B, S, L, lw, o, [-s * 0.14, s * 0.02, s * 0.1, s * 0.04]);
      part(ctx, function (p) { El(p, -s * 0.14, s * 0.03, s * 0.12, s * 0.07, 0.2); }, E, null, 0);   // brown patch
      // near legs
      leg(ctx, -s * 0.13, s * 0.2, s * 0.11, s * 0.21, swing(k, 0), B, L, lw, ES);
      leg(ctx, s * 0.19, s * 0.2, s * 0.11, s * 0.21, swing(k, 0.5), B, L, lw, ES);
      // head
      cel(ctx, function (p) { C(p, s * 0.21, -s * 0.12, s * 0.2); El(p, s * 0.36, -s * 0.05, s * 0.13, s * 0.1); }, B, S, L, lw, o, [s * 0.14, -s * 0.22, s * 0.07, s * 0.04]);
      part(ctx, function (p) { El(p, s * 0.37, -s * 0.03, s * 0.1, s * 0.075); }, '#FFF3E0', null, 0);
      part(ctx, function (p) { El(p, s * 0.46, -s * 0.08, s * 0.05, s * 0.04); }, '#3A2A22', null, 0);
      line(ctx, function (p) { p.moveTo(s * 0.45, -s * 0.04); p.lineTo(s * 0.44, s * 0.0); p.quadraticCurveTo(s * 0.4, s * 0.04, s * 0.34, s * 0.01); }, '#3A2A22', lw * 0.9);
      eye(ctx, s * 0.27, -s * 0.16, s * 0.045);
      // floppy ear
      cel(ctx, function (p) { El(p, s * 0.1, -s * 0.12, s * 0.075, s * 0.15, 0.35); }, E, ES, L, lw, o * 0.6);
      blush(ctx, s * 0.31, -s * 0.06, s * 0.04);
      // collar
      part(ctx, function (p) { rr(p, s * 0.04, s * 0.0, s * 0.18, s * 0.05, s * 0.025); }, '#6FB3B8', '#3F7F86', lw * 0.8);
      part(ctx, function (p) { C(p, s * 0.14, s * 0.07, s * 0.03); }, '#F6D985', '#B8891A', lw * 0.6);
    },
    cow: function (ctx, s, k) {
      var B = '#FFFDF7', S = '#E2DACD', L = '#6E6258', D = '#4A3F3A', M = '#F4B8B0', MS = '#DE9890', lw = lwOf(s), o = s * 0.03;
      ctx.lineCap = 'round';
      // tail
      line(ctx, function (p) { p.moveTo(-s * 0.4, -s * 0.02); p.quadraticCurveTo(-s * 0.5, s * 0.08, -s * 0.46, s * 0.22); }, L, lw * 1.6);
      part(ctx, function (p) { El(p, -s * 0.46, s * 0.24, s * 0.035, s * 0.05); }, D, null, 0);
      leg(ctx, -s * 0.28, s * 0.16, s * 0.1, s * 0.24, swing(k, 0.5), S, L, lw, D);
      leg(ctx, s * 0.1, s * 0.16, s * 0.1, s * 0.24, swing(k, 0), S, L, lw, D);
      var body = function (p) { rr(p, -s * 0.42, -s * 0.12, s * 0.62, s * 0.34, s * 0.15); };
      cel(ctx, body, B, S, L, lw, o, [-s * 0.26, -s * 0.06, s * 0.1, s * 0.04]);
      ctx.save(); ctx.beginPath(); body(ctx); ctx.clip();
      part(ctx, function (p) { El(p, -s * 0.24, -s * 0.03, s * 0.11, s * 0.08, 0.3); El(p, s * 0.02, s * 0.1, s * 0.09, s * 0.07, -0.4); El(p, -s * 0.38, s * 0.14, s * 0.06, s * 0.08); }, D, null, 0);
      ctx.restore();
      ctx.beginPath(); body(ctx); ctx.lineWidth = lw; ctx.strokeStyle = L; ctx.stroke();
      part(ctx, function (p) { El(p, -s * 0.04, s * 0.22, s * 0.07, s * 0.04); }, M, MS, lw * 0.7);   // udder
      leg(ctx, -s * 0.2, s * 0.18, s * 0.11, s * 0.22, swing(k, 0), B, L, lw, D);
      leg(ctx, s * 0.16, s * 0.18, s * 0.11, s * 0.22, swing(k, 0.5), B, L, lw, D);
      // head
      part(ctx, function (p) { El(p, s * 0.2, -s * 0.27, s * 0.06, s * 0.03, -0.6); El(p, s * 0.38, -s * 0.27, s * 0.06, s * 0.03, 0.6); }, '#F3E6C8', '#9A8A6A', lw * 0.8);   // horns
      part(ctx, function (p) { El(p, s * 0.13, -s * 0.18, s * 0.08, s * 0.04, -0.4); El(p, s * 0.45, -s * 0.18, s * 0.08, s * 0.04, 0.4); }, B, L, lw);
      cel(ctx, function (p) { El(p, s * 0.29, -s * 0.12, s * 0.14, s * 0.16); }, B, S, L, lw, o, [s * 0.24, -s * 0.2, s * 0.05, s * 0.03]);
      part(ctx, function (p) { El(p, s * 0.25, -s * 0.2, s * 0.06, s * 0.05, 0.4); }, D, null, 0);
      cel(ctx, function (p) { El(p, s * 0.31, s * 0.02, s * 0.14, s * 0.09); }, M, MS, mix(MS, L, 0.4), lw, o * 0.5);
      part(ctx, function (p) { El(p, s * 0.26, s * 0.02, s * 0.022, s * 0.03); El(p, s * 0.36, s * 0.02, s * 0.022, s * 0.03); }, '#A8605A', null, 0);
      eye(ctx, s * 0.23, -s * 0.1, s * 0.04); eye(ctx, s * 0.36, -s * 0.1, s * 0.04);
    },
    sheep: function (ctx, s, k) {
      var W = '#FFF8EA', WS = '#E6D8C0', WL = '#9A8A72', F = '#5E5258', FL = '#362E33', lw = lwOf(s), o = s * 0.03;
      ctx.lineCap = 'round';
      leg(ctx, -s * 0.22, s * 0.2, s * 0.07, s * 0.2, swing(k, 0.5), mix(F, '#000000', 0.15), FL, lw, null);
      leg(ctx, s * 0.12, s * 0.2, s * 0.07, s * 0.2, swing(k, 0), mix(F, '#000000', 0.15), FL, lw, null);
      var wool = function (p) {
        var c = [[-0.3, 0.06, 0.13], [-0.2, -0.08, 0.14], [-0.04, -0.12, 0.14], [0.12, -0.06, 0.13], [0.17, 0.08, 0.12], [0.05, 0.18, 0.13], [-0.12, 0.2, 0.13], [-0.27, 0.17, 0.12], [-0.06, 0.04, 0.2]];
        for (var i = 0; i < c.length; i++) C(p, c[i][0] * s, c[i][1] * s, c[i][2] * s);
      };
      ctx.save(); ctx.beginPath(); wool(ctx); ctx.lineWidth = 2 * lw; ctx.strokeStyle = WL; ctx.stroke(); ctx.restore();
      ctx.save(); ctx.fillStyle = WS; ctx.beginPath(); wool(ctx); ctx.fill(); ctx.beginPath(); wool(ctx); ctx.clip();
      ctx.translate(-o, -o * 1.2); ctx.fillStyle = W; ctx.beginPath(); wool(ctx); ctx.fill(); ctx.restore();
      line(ctx, function (p) { [[-0.2, 0.02], [-0.06, -0.04], [-0.1, 0.12], [0.06, 0.08]].forEach(function (q) { p.moveTo(q[0] * s - s * 0.03, q[1] * s); p.arc(q[0] * s, q[1] * s, s * 0.03, Math.PI, TAU); }); }, WS, lw * 0.8);
      leg(ctx, -s * 0.15, s * 0.24, s * 0.075, s * 0.18, swing(k, 0), F, FL, lw, null);
      leg(ctx, s * 0.18, s * 0.22, s * 0.075, s * 0.2, swing(k, 0.5), F, FL, lw, null);
      // head
      part(ctx, function (p) { El(p, s * 0.2, -s * 0.12, s * 0.08, s * 0.035, -0.5); }, F, FL, lw);
      cel(ctx, function (p) { El(p, s * 0.31, -s * 0.06, s * 0.12, s * 0.15, 0.25); }, F, mix(F, '#000000', 0.25), FL, lw, o * 0.7, [s * 0.27, -s * 0.12, s * 0.04, s * 0.025, 'rgba(255,255,255,0.25)']);
      part(ctx, function (p) { El(p, s * 0.42, -s * 0.13, s * 0.08, s * 0.035, 0.4); }, F, FL, lw);
      part(ctx, function (p) { C(p, s * 0.26, -s * 0.2, s * 0.07); C(p, s * 0.34, -s * 0.21, s * 0.06); }, W, WL, lw * 0.9);
      // eyes on a dark face: white surround
      part(ctx, function (p) { C(p, s * 0.33, -s * 0.08, s * 0.045); }, '#FFFFFF', null, 0);
      eye(ctx, s * 0.34, -s * 0.08, s * 0.03);
      part(ctx, function (p) { El(p, s * 0.37, s * 0.02, s * 0.03, s * 0.02); }, '#E8A0A8', null, 0);
    },
    pig: function (ctx, s, k) {
      var B = '#F6BDB4', S = '#E49A92', L = '#A65F5C', N = '#EE9A96', lw = lwOf(s), o = s * 0.03;
      ctx.lineCap = 'round';
      line(ctx, function (p) { p.moveTo(-s * 0.36, s * 0.0); p.bezierCurveTo(-s * 0.48, -s * 0.04, -s * 0.46, -s * 0.15, -s * 0.4, -s * 0.13); p.bezierCurveTo(-s * 0.36, -s * 0.11, -s * 0.4, -s * 0.06, -s * 0.44, -s * 0.08); }, L, lw * 1.5);
      leg(ctx, -s * 0.22, s * 0.2, s * 0.1, s * 0.19, swing(k, 0.5), S, L, lw, '#B86E6A');
      leg(ctx, s * 0.1, s * 0.2, s * 0.1, s * 0.19, swing(k, 0), S, L, lw, '#B86E6A');
      cel(ctx, function (p) { El(p, -s * 0.05, s * 0.08, s * 0.34, s * 0.21); }, B, S, L, lw, o, [-s * 0.15, -s * 0.02, s * 0.12, s * 0.04]);
      leg(ctx, -s * 0.15, s * 0.22, s * 0.11, s * 0.18, swing(k, 0), B, L, lw, '#B86E6A');
      leg(ctx, s * 0.17, s * 0.22, s * 0.11, s * 0.18, swing(k, 0.5), B, L, lw, '#B86E6A');
      part(ctx, function (p) { poly(p, sc([[0.1, -0.22], [0.14, -0.4], [0.24, -0.25]], s), s * 0.03); }, S, L, lw);
      cel(ctx, function (p) { C(p, s * 0.25, -s * 0.08, s * 0.18); }, B, S, L, lw, o, [s * 0.2, -s * 0.16, s * 0.06, s * 0.035]);
      part(ctx, function (p) { poly(p, sc([[0.24, -0.24], [0.33, -0.41], [0.38, -0.2]], s), s * 0.03); }, B, L, lw);
      part(ctx, function (p) { poly(p, sc([[0.27, -0.25], [0.325, -0.35], [0.35, -0.23]], s), s * 0.015); }, S, null, 0);
      cel(ctx, function (p) { El(p, s * 0.41, -s * 0.03, s * 0.07, s * 0.085); }, N, mix(N, L, 0.3), L, lw, o * 0.4);
      part(ctx, function (p) { El(p, s * 0.395, -s * 0.05, s * 0.016, s * 0.026); El(p, s * 0.43, -s * 0.01, s * 0.016, s * 0.026); }, '#9E4E52', null, 0);
      eye(ctx, s * 0.27, -s * 0.12, s * 0.042);
      blush(ctx, s * 0.25, s * 0.0, s * 0.045);
      line(ctx, function (p) { p.moveTo(s * 0.32, s * 0.05); p.quadraticCurveTo(s * 0.36, s * 0.08, s * 0.4, s * 0.06); }, L, lw * 0.8);
    },
    rabbit: function (ctx, s, k) {
      var B = '#DCCDBE', S = '#C0AA94', L = '#7A6450', P = '#F2B6AF', lw = lwOf(s), o = s * 0.03;
      var hop = k.still ? 0 : Math.max(0, Math.sin(k.step * TAU)) * s * 0.08;
      ctx.lineCap = 'round';
      ctx.translate(0, -hop);
      part(ctx, function (p) { C(p, -s * 0.3, s * 0.16, s * 0.07); }, '#FFFFFF', L, lw);   // cotton tail
      cel(ctx, function (p) { El(p, -s * 0.08, s * 0.2, s * 0.25, s * 0.21); }, B, S, L, lw, o, [-s * 0.15, s * 0.08, s * 0.09, s * 0.05]);
      cel(ctx, function (p) { El(p, -s * 0.12, s * 0.33, s * 0.16, s * 0.08); }, B, S, L, lw, o * 0.5);   // hind foot
      part(ctx, function (p) { El(p, s * 0.13, s * 0.38, s * 0.07, s * 0.05); }, B, L, lw);   // front paw
      // ears
      cel(ctx, function (p) { El(p, s * 0.06, -s * 0.3, s * 0.065, s * 0.19, -0.25); }, S, mix(S, L, 0.3), L, lw, o * 0.4);
      cel(ctx, function (p) { El(p, s * 0.19, -s * 0.32, s * 0.07, s * 0.2, 0.15); }, B, S, L, lw, o * 0.4);
      part(ctx, function (p) { El(p, s * 0.19, -s * 0.31, s * 0.03, s * 0.14, 0.15); }, P, null, 0);
      cel(ctx, function (p) { C(p, s * 0.18, -s * 0.04, s * 0.17); El(p, s * 0.3, s * 0.0, s * 0.09, s * 0.08); }, B, S, L, lw, o, [s * 0.12, -s * 0.12, s * 0.06, s * 0.035]);
      part(ctx, function (p) { El(p, s * 0.33, s * 0.03, s * 0.08, s * 0.06); }, '#F6EEE6', null, 0);
      part(ctx, function (p) { El(p, s * 0.385, -s * 0.01, s * 0.028, s * 0.022); }, '#D9858A', null, 0);
      line(ctx, function (p) { p.moveTo(s * 0.38, s * 0.01); p.lineTo(s * 0.38, s * 0.04); p.moveTo(s * 0.33, s * 0.05); p.quadraticCurveTo(s * 0.38, s * 0.08, s * 0.4, s * 0.04); }, L, lw * 0.7);
      eye(ctx, s * 0.24, -s * 0.07, s * 0.045);
      blush(ctx, s * 0.24, s * 0.03, s * 0.04);
    },
    hen: function (ctx, s, k) {
      var B = '#C98758', S = '#A86A40', L = '#6E4228', CR = '#F2DDBE', CM = '#E2675E', CML = '#A8433C', BK = '#F2B24A', LG = '#E8A040', lw = lwOf(s), o = s * 0.03;
      ctx.lineCap = 'round';
      var bob = k.still ? 0 : Math.sin(k.step * TAU * 2) * s * 0.015;
      line(ctx, function (p) { var a = swing(k, 0) * 0.5; p.moveTo(-s * 0.06, s * 0.24); p.lineTo(-s * 0.06 + Math.sin(a) * s * 0.18, s * 0.42); p.moveTo(s * 0.08, s * 0.24); p.lineTo(s * 0.08 - Math.sin(a) * s * 0.18, s * 0.42); }, LG, lw * 1.6);
      line(ctx, function (p) { p.moveTo(-s * 0.12, s * 0.43); p.lineTo(s * 0.02, s * 0.43); p.moveTo(s * 0.02, s * 0.43); p.lineTo(s * 0.15, s * 0.43); }, LG, lw * 1.3);
      ctx.translate(0, bob);
      // tail fan
      cel(ctx, function (p) { p.moveTo(-s * 0.2, s * 0.02); p.quadraticCurveTo(-s * 0.48, -s * 0.06, -s * 0.42, -s * 0.3); p.quadraticCurveTo(-s * 0.32, -s * 0.18, -s * 0.28, -s * 0.28); p.quadraticCurveTo(-s * 0.2, -s * 0.14, -s * 0.12, -s * 0.12); p.closePath(); }, mix(B, '#5A3A28', 0.3), mix(B, '#3A2418', 0.45), L, lw, o * 0.5);
      cel(ctx, function (p) { El(p, -s * 0.02, s * 0.08, s * 0.28, s * 0.2, 0.15); }, B, S, L, lw, o, [-s * 0.1, -s * 0.02, s * 0.1, s * 0.04]);
      part(ctx, function (p) { El(p, s * 0.16, s * 0.12, s * 0.12, s * 0.12); }, CR, null, 0);   // chest
      cel(ctx, function (p) { p.moveTo(-s * 0.2, s * 0.02); p.quadraticCurveTo(-s * 0.02, -s * 0.06, s * 0.08, s * 0.08); p.quadraticCurveTo(-s * 0.06, s * 0.22, -s * 0.22, s * 0.12); p.closePath(); }, S, mix(S, L, 0.4), L, lw * 0.9, o * 0.4);
      // comb + wattle
      part(ctx, function (p) { C(p, s * 0.14, -s * 0.34, s * 0.045); C(p, s * 0.2, -s * 0.37, s * 0.05); C(p, s * 0.26, -s * 0.34, s * 0.04); }, CM, CML, lw);
      cel(ctx, function (p) { C(p, s * 0.2, -s * 0.2, s * 0.14); El(p, s * 0.14, -s * 0.04, s * 0.1, s * 0.14); }, B, S, L, lw, o, [s * 0.15, -s * 0.27, s * 0.05, s * 0.03]);
      part(ctx, function (p) { El(p, s * 0.31, -s * 0.11, s * 0.03, s * 0.05); }, CM, CML, lw * 0.8);
      part(ctx, function (p) { poly(p, sc([[0.31, -0.22], [0.42, -0.18], [0.31, -0.14]], s), s * 0.015); }, BK, '#B87A1E', lw * 0.8);
      eye(ctx, s * 0.24, -s * 0.22, s * 0.04);
      blush(ctx, s * 0.22, -s * 0.13, s * 0.035);
    },
    duck: function (ctx, s, k) {
      var B = '#FFFFFF', S = '#DCE2E8', L = '#7E8892', BK = '#F2A54A', BKL = '#B86E1E', lw = lwOf(s), o = s * 0.03;
      ctx.lineCap = 'round';
      var a = swing(k, 0) * 0.6, waddle = k.still ? 0 : Math.sin(k.step * TAU) * 0.06;
      // webbed feet
      [[-s * 0.06, a], [s * 0.08, -a]].forEach(function (q) {
        ctx.save(); ctx.translate(q[0], s * 0.3); ctx.rotate(q[1]);
        line(ctx, function (p) { p.moveTo(0, 0); p.lineTo(0, s * 0.12); }, BK, lw * 1.6);
        part(ctx, function (p) { p.moveTo(-s * 0.03, s * 0.11); p.lineTo(s * 0.1, s * 0.1); p.lineTo(s * 0.07, s * 0.15); p.lineTo(-s * 0.03, s * 0.15); p.closePath(); }, BK, BKL, lw * 0.8);
        ctx.restore();
      });
      ctx.rotate(waddle);
      part(ctx, function (p) { rr(p, s * 0.1, -s * 0.2, s * 0.14, s * 0.3, s * 0.07); }, B, L, lw);   // neck (under the body)
      cel(ctx, function (p) { p.moveTo(-s * 0.42, -s * 0.06); p.quadraticCurveTo(-s * 0.36, s * 0.02, -s * 0.3, s * 0.02); p.bezierCurveTo(-s * 0.36, s * 0.3, s * 0.2, s * 0.36, s * 0.28, s * 0.1); p.bezierCurveTo(s * 0.3, -s * 0.02, s * 0.1, -s * 0.02, -s * 0.1, -s * 0.02); p.quadraticCurveTo(-s * 0.26, -s * 0.02, -s * 0.42, -s * 0.06); p.closePath(); }, B, S, L, lw, o, [-s * 0.08, s * 0.04, s * 0.12, s * 0.04, 'rgba(255,255,255,0.8)']);
      cel(ctx, function (p) { p.moveTo(-s * 0.24, s * 0.06); p.quadraticCurveTo(-s * 0.02, s * 0.0, s * 0.1, s * 0.12); p.quadraticCurveTo(-s * 0.06, s * 0.24, -s * 0.24, s * 0.06); p.closePath(); }, '#EEF2F5', '#C8D0D8', L, lw * 0.9, o * 0.4);
      cel(ctx, function (p) { C(p, s * 0.19, -s * 0.2, s * 0.14); }, B, S, L, lw, o, [s * 0.14, -s * 0.27, s * 0.05, s * 0.03, 'rgba(255,255,255,0.8)']);
      cel(ctx, function (p) { p.moveTo(s * 0.29, -s * 0.22); p.quadraticCurveTo(s * 0.46, -s * 0.24, s * 0.47, -s * 0.16); p.quadraticCurveTo(s * 0.46, -s * 0.12, s * 0.29, -s * 0.13); p.closePath(); }, BK, mix(BK, BKL, 0.4), BKL, lw, o * 0.3);
      eye(ctx, s * 0.22, -s * 0.24, s * 0.04);
      blush(ctx, s * 0.22, -s * 0.15, s * 0.035);
    },
    bird: function (ctx, s, k) {
      var B = '#8CC4D8', S = '#6AA2B8', L = '#3E6E80', BL = '#FFF1DC', BK = '#F2A54A', lw = lwOf(s), o = s * 0.03;
      ctx.lineCap = 'round';
      var hop = k.still ? 0 : Math.abs(Math.sin(k.step * TAU)) * s * 0.06;
      line(ctx, function (p) { p.moveTo(-s * 0.04, s * 0.26); p.lineTo(-s * 0.06, s * 0.42); p.moveTo(s * 0.08, s * 0.26); p.lineTo(s * 0.08, s * 0.42); p.moveTo(-s * 0.12, s * 0.43); p.lineTo(s * 0.0, s * 0.43); p.moveTo(s * 0.02, s * 0.43); p.lineTo(s * 0.14, s * 0.43); }, '#C97A3A', lw * 1.2);
      ctx.translate(0, -hop);
      cel(ctx, function (p) { p.moveTo(-s * 0.2, s * 0.05); p.lineTo(-s * 0.46, -s * 0.1); p.lineTo(-s * 0.42, s * 0.04); p.lineTo(-s * 0.46, s * 0.16); p.closePath(); }, S, mix(S, L, 0.4), L, lw, o * 0.4);
      cel(ctx, function (p) { C(p, 0, s * 0.08, s * 0.25); C(p, s * 0.15, -s * 0.12, s * 0.17); }, B, S, L, lw, o, [-s * 0.02, -s * 0.18, s * 0.08, s * 0.04]);
      part(ctx, function (p) { El(p, s * 0.07, s * 0.16, s * 0.15, s * 0.13, -0.3); }, BL, null, 0);
      cel(ctx, function (p) { p.moveTo(-s * 0.18, s * 0.0); p.quadraticCurveTo(s * 0.02, -s * 0.06, s * 0.06, s * 0.1); p.quadraticCurveTo(-s * 0.08, s * 0.24, -s * 0.24, s * 0.14); p.closePath(); }, S, mix(S, L, 0.35), L, lw * 0.9, o * 0.4);
      part(ctx, function (p) { poly(p, sc([[0.29, -0.16], [0.43, -0.11], [0.29, -0.06]], s), s * 0.015); }, BK, '#B86E1E', lw * 0.8);
      eye(ctx, s * 0.2, -s * 0.15, s * 0.045);
      blush(ctx, s * 0.22, -s * 0.05, s * 0.035);
    },
    frog: function (ctx, s, k) {
      var B = '#9CCB7A', S = '#78AA58', L = '#4A7636', BL = '#E6F0C4', lw = lwOf(s), o = s * 0.03;
      ctx.lineCap = 'round';
      var hop = k.still ? 0 : Math.max(0, Math.sin(k.step * TAU)) * s * 0.1;
      ctx.translate(0, -hop);
      cel(ctx, function (p) { El(p, -s * 0.22, s * 0.3, s * 0.17, s * 0.11, 0.2); }, B, S, L, lw, o * 0.6);   // back leg
      part(ctx, function (p) { El(p, -s * 0.12, s * 0.42, s * 0.12, s * 0.035); }, S, L, lw);
      cel(ctx, function (p) { El(p, 0, s * 0.16, s * 0.3, s * 0.22); }, B, S, L, lw, o, [-s * 0.1, s * 0.06, s * 0.1, s * 0.05]);
      part(ctx, function (p) { El(p, s * 0.08, s * 0.22, s * 0.16, s * 0.13); }, BL, null, 0);
      // front legs
      part(ctx, function (p) { rr(p, s * 0.12, s * 0.22, s * 0.08, s * 0.2, s * 0.04); rr(p, -s * 0.02, s * 0.24, s * 0.08, s * 0.18, s * 0.04); }, B, L, lw);
      part(ctx, function (p) { El(p, s * 0.18, s * 0.42, s * 0.07, s * 0.03); El(p, s * 0.03, s * 0.42, s * 0.07, s * 0.03); }, S, L, lw);
      // head
      var head = function (p) { El(p, s * 0.08, -s * 0.08, s * 0.3, s * 0.17); C(p, -s * 0.06, -s * 0.24, s * 0.1); C(p, s * 0.2, -s * 0.24, s * 0.1); };
      cel(ctx, head, B, S, L, lw, o, [-s * 0.08, -s * 0.3, s * 0.04, s * 0.025]);
      part(ctx, function (p) { C(p, -s * 0.06, -s * 0.25, s * 0.065); C(p, s * 0.2, -s * 0.25, s * 0.065); }, '#FFFFFF', null, 0);
      eye(ctx, -s * 0.04, -s * 0.25, s * 0.042); eye(ctx, s * 0.22, -s * 0.25, s * 0.042);
      line(ctx, function (p) { p.moveTo(-s * 0.1, -s * 0.06); p.quadraticCurveTo(s * 0.08, s * 0.06, s * 0.3, -s * 0.07); }, L, lw * 1.1);
      blush(ctx, -s * 0.1, -s * 0.1, s * 0.04); blush(ctx, s * 0.3, -s * 0.12, s * 0.04);
      part(ctx, function (p) { C(p, -s * 0.12, s * 0.08, s * 0.025); C(p, -s * 0.2, s * 0.18, s * 0.02); C(p, -s * 0.05, s * 0.0, s * 0.018); }, S, null, 0);
    },
    bee: function (ctx, s, k) {
      var B = '#F6C94E', S = '#D9A82E', L = '#6E4E1E', D = '#4A3426', lw = lwOf(s), o = s * 0.03;
      ctx.lineCap = 'round';
      var bob = Math.sin(k.time * 4) * s * 0.03, flap = Math.sin(k.time * 30) * 0.25;
      ctx.translate(0, bob - s * 0.04);
      // wings (behind)
      ctx.save(); ctx.translate(-s * 0.02, -s * 0.14); ctx.rotate(-0.3 + flap);
      part(ctx, function (p) { El(p, -s * 0.06, -s * 0.12, s * 0.11, s * 0.17, -0.4); }, 'rgba(232,244,250,0.9)', '#8AA8B8', lw * 0.9);
      ctx.restore();
      line(ctx, function (p) { p.moveTo(-s * 0.32, s * 0.06); p.lineTo(-s * 0.42, s * 0.08); }, D, lw * 1.6);   // stinger
      var body = function (p) { El(p, -s * 0.05, s * 0.06, s * 0.28, s * 0.21); };
      cel(ctx, body, B, S, L, lw, o, [-s * 0.12, -s * 0.03, s * 0.1, s * 0.04]);
      ctx.save(); ctx.beginPath(); body(ctx); ctx.clip();
      part(ctx, function (p) { rr(p, -s * 0.2, -s * 0.2, s * 0.08, s * 0.5, s * 0.02); rr(p, -s * 0.04, -s * 0.2, s * 0.08, s * 0.5, s * 0.02); }, D, null, 0);
      ctx.restore();
      ctx.beginPath(); body(ctx); ctx.lineWidth = lw; ctx.strokeStyle = L; ctx.stroke();
      ctx.save(); ctx.translate(s * 0.08, -s * 0.12); ctx.rotate(0.2 - flap);
      part(ctx, function (p) { El(p, 0, -s * 0.14, s * 0.1, s * 0.16, 0.3); }, 'rgba(240,250,255,0.92)', '#8AA8B8', lw * 0.9);
      ctx.restore();
      // head
      cel(ctx, function (p) { C(p, s * 0.27, -s * 0.02, s * 0.15); }, B, S, L, lw, o * 0.8, [s * 0.22, -s * 0.09, s * 0.05, s * 0.03]);
      line(ctx, function (p) { p.moveTo(s * 0.26, -s * 0.15); p.quadraticCurveTo(s * 0.24, -s * 0.28, s * 0.3, -s * 0.32); p.moveTo(s * 0.33, -s * 0.15); p.quadraticCurveTo(s * 0.36, -s * 0.27, s * 0.43, -s * 0.28); }, D, lw * 1.1);
      part(ctx, function (p) { C(p, s * 0.3, -s * 0.32, s * 0.03); C(p, s * 0.43, -s * 0.28, s * 0.03); }, D, null, 0);
      eye(ctx, s * 0.32, -s * 0.04, s * 0.045);
      line(ctx, function (p) { p.moveTo(s * 0.28, s * 0.05); p.quadraticCurveTo(s * 0.34, s * 0.1, s * 0.39, s * 0.04); }, D, lw);
      blush(ctx, s * 0.25, s * 0.04, s * 0.035);
    }
  };

  // ================================================================ HOMES (≈ size tall, bottom at +0.45 s)
  var HOME = {
    kennel: function (ctx, s) {
      var W = '#D9A46A', WS = '#B8834A', L = '#6E4526', R = '#8C5A3B', RS = '#6E4428', lw = lwOf(s), o = s * 0.025;
      part(ctx, function (p) { El(p, 0, s * 0.45, s * 0.44, s * 0.05); }, 'rgba(60,40,20,0.18)', null, 0);
      cel(ctx, function (p) { rr(p, -s * 0.36, -s * 0.1, s * 0.72, s * 0.55, s * 0.03); }, W, WS, L, lw, o);
      line(ctx, function (p) { for (var i = 1; i < 5; i++) { var y = -s * 0.1 + i * s * 0.11; p.moveTo(-s * 0.34, y); p.lineTo(s * 0.34, y); } }, rgba(L, 0.35), lw * 0.7);
      cel(ctx, function (p) { poly(p, sc([[0, -0.46], [0.48, -0.02], [0.4, 0.04], [0, -0.33], [-0.4, 0.04], [-0.48, -0.02]], s), s * 0.03); }, R, RS, L, lw, o);
      part(ctx, function (p) { p.moveTo(-s * 0.17, s * 0.45); p.lineTo(-s * 0.17, s * 0.2); p.arc(0, s * 0.2, s * 0.17, Math.PI, 0); p.lineTo(s * 0.17, s * 0.45); p.closePath(); }, '#3B2618', L, lw);
      // bone plaque
      part(ctx, function (p) { rr(p, -s * 0.08, -s * 0.17, s * 0.16, s * 0.04, s * 0.02); C(p, -s * 0.085, -s * 0.17, s * 0.028); C(p, -s * 0.085, -s * 0.13, s * 0.028); C(p, s * 0.085, -s * 0.17, s * 0.028); C(p, s * 0.085, -s * 0.13, s * 0.028); }, '#FFF6E2', '#9A8A6A', lw * 0.7);
      part(ctx, function (p) { El(p, s * 0.27, s * 0.4, s * 0.09, s * 0.045); }, '#B8C4CC', TIN.line, lw * 0.8);   // food bowl
      tuft(ctx, -s * 0.38, s * 0.45, s * 0.1);
    },
    hive: function (ctx, s) {
      var H = '#E6C77E', HS = '#C9A45A', L = '#8A6830', P = '#B8834A', PL = '#6E4526', lw = lwOf(s), o = s * 0.025;
      part(ctx, function (p) { El(p, 0, s * 0.45, s * 0.3, s * 0.04); }, 'rgba(60,40,20,0.18)', null, 0);
      part(ctx, function (p) { rr(p, -s * 0.05, s * 0.1, s * 0.1, s * 0.35, s * 0.02); }, P, PL, lw);
      cel(ctx, function (p) { rr(p, -s * 0.3, s * 0.06, s * 0.6, s * 0.08, s * 0.02); }, P, mix(P, PL, 0.4), PL, lw, o * 0.5);
      var dome = function (p) { p.moveTo(-s * 0.3, s * 0.07); p.bezierCurveTo(-s * 0.36, -s * 0.2, -s * 0.2, -s * 0.44, 0, -s * 0.44); p.bezierCurveTo(s * 0.2, -s * 0.44, s * 0.36, -s * 0.2, s * 0.3, s * 0.07); p.closePath(); };
      cel(ctx, dome, H, HS, L, lw, o, [-s * 0.12, -s * 0.26, s * 0.07, s * 0.04]);
      ctx.save(); ctx.beginPath(); dome(ctx); ctx.clip();
      line(ctx, function (p) { [-0.32, -0.2, -0.08, 0.03].forEach(function (y) { p.moveTo(-s * 0.4, y * s); p.quadraticCurveTo(0, y * s + s * 0.07, s * 0.4, y * s); }); }, L, lw * 0.9);
      ctx.restore();
      part(ctx, function (p) { p.moveTo(-s * 0.07, s * 0.07); p.lineTo(-s * 0.07, s * 0.03); p.arc(0, s * 0.03, s * 0.07, Math.PI, 0); p.lineTo(s * 0.07, s * 0.07); p.closePath(); }, '#3B2618', null, 0);
      ctx.save(); ctx.translate(s * 0.32, -s * 0.3); ANIMAL.bee(ctx, s * 0.22, { step: 0, time: 0.3, still: true }); ctx.restore();
      tuft(ctx, -s * 0.1, s * 0.45, s * 0.09); tuft(ctx, s * 0.1, s * 0.45, s * 0.08);
    },
    nest: function (ctx, s) {
      var G = '#7DB35A', GS = '#5E9444', GL = '#3E6E2E', N = '#A0703E', NS = '#7E5228', NL = '#5A3A1E', lw = lwOf(s), o = s * 0.025;
      part(ctx, function (p) { El(p, 0, s * 0.45, s * 0.42, s * 0.05); }, 'rgba(60,40,20,0.18)', null, 0);
      var bush = function (p) { [[-0.28, 0.28, 0.17], [0.28, 0.28, 0.17], [-0.14, 0.14, 0.2], [0.14, 0.14, 0.2], [0, 0.3, 0.2], [0, 0.04, 0.2]].forEach(function (q) { C(p, q[0] * s, q[1] * s, q[2] * s); }); };
      ctx.save(); ctx.beginPath(); bush(ctx); ctx.lineWidth = 2 * lw; ctx.strokeStyle = GL; ctx.stroke(); ctx.restore();
      ctx.save(); ctx.fillStyle = GS; ctx.beginPath(); bush(ctx); ctx.fill(); ctx.beginPath(); bush(ctx); ctx.clip(); ctx.translate(-o, -o * 1.2); ctx.fillStyle = G; ctx.beginPath(); bush(ctx); ctx.fill(); ctx.restore();
      part(ctx, function (p) { C(p, -s * 0.2, s * 0.24, s * 0.025); C(p, s * 0.16, s * 0.3, s * 0.022); C(p, s * 0.02, s * 0.36, s * 0.02); }, '#F6E7B0', null, 0);
      // eggs + nest bowl
      part(ctx, function (p) { El(p, -s * 0.1, -s * 0.16, s * 0.065, s * 0.085, -0.2); El(p, s * 0.1, -s * 0.16, s * 0.065, s * 0.085, 0.2); El(p, 0, -s * 0.19, s * 0.07, s * 0.09); }, '#CFE6EE', '#7E9AA6', lw);
      part(ctx, function (p) { C(p, -s * 0.05, -s * 0.22, s * 0.012); C(p, s * 0.12, -s * 0.17, s * 0.01); }, '#8FA9B4', null, 0);
      var bowl = function (p) { p.moveTo(-s * 0.3, -s * 0.14); p.quadraticCurveTo(0, -s * 0.08, s * 0.3, -s * 0.14); p.bezierCurveTo(s * 0.3, s * 0.02, s * 0.14, s * 0.06, 0, s * 0.06); p.bezierCurveTo(-s * 0.14, s * 0.06, -s * 0.3, s * 0.02, -s * 0.3, -s * 0.14); p.closePath(); };
      cel(ctx, bowl, N, NS, NL, lw, o * 0.6);
      line(ctx, function (p) { for (var i = 0; i < 7; i++) { var x = -s * 0.26 + i * s * 0.08; p.moveTo(x, -s * 0.1); p.lineTo(x + s * 0.08, s * 0.02); p.moveTo(x + s * 0.08, -s * 0.1); p.lineTo(x, s * 0.02); } p.moveTo(-s * 0.34, -s * 0.15); p.lineTo(-s * 0.22, -s * 0.12); p.moveTo(s * 0.34, -s * 0.15); p.lineTo(s * 0.22, -s * 0.12); }, NL, lw * 0.7);
    },
    pond: function (ctx, s) {
      var Wt = '#7CC6D4', WS = '#5AA6B6', WL = '#3E7E8E', G = '#8DBF6A', GL = '#4E7E3A', lw = lwOf(s), o = s * 0.02;
      // reeds + cattails (behind)
      line(ctx, function (p) { p.moveTo(-s * 0.34, s * 0.14); p.quadraticCurveTo(-s * 0.36, -s * 0.12, -s * 0.38, -s * 0.38); p.moveTo(-s * 0.26, s * 0.12); p.quadraticCurveTo(-s * 0.24, -s * 0.08, -s * 0.22, -s * 0.28); p.moveTo(-s * 0.42, s * 0.16); p.quadraticCurveTo(-s * 0.46, -s * 0.04, -s * 0.5, -s * 0.12); }, STEM_DK, lw * 1.4);
      part(ctx, function (p) { rr(p, -s * 0.41, -s * 0.4, s * 0.06, s * 0.15, s * 0.03); rr(p, -s * 0.25, -s * 0.3, s * 0.055, s * 0.13, s * 0.027); }, '#8C5A3B', '#5A3A1E', lw * 0.8);
      part(ctx, function (p) { El(p, 0, s * 0.26, s * 0.5, s * 0.2); }, G, GL, lw);
      cel(ctx, function (p) { El(p, s * 0.02, s * 0.26, s * 0.42, s * 0.15); }, Wt, WS, WL, lw, -o * 2, [-s * 0.14, s * 0.22, s * 0.12, s * 0.03, 'rgba(255,255,255,0.4)']);
      line(ctx, function (p) { p.moveTo(-s * 0.22, s * 0.3); p.quadraticCurveTo(-s * 0.14, s * 0.27, -s * 0.06, s * 0.3); p.moveTo(s * 0.04, s * 0.35); p.quadraticCurveTo(s * 0.12, s * 0.32, s * 0.2, s * 0.35); }, 'rgba(255,255,255,0.8)', lw);
      part(ctx, function (p) { p.moveTo(s * 0.2, s * 0.22); p.arc(s * 0.2, s * 0.22, s * 0.1, -0.2, Math.PI * 2 - 0.8); p.closePath(); }, '#6FAF4E', GL, lw * 0.9);
      part(ctx, function (p) { for (var i = 0; i < 6; i++) { var a = i / 6 * TAU; El(p, s * 0.18 + Math.cos(a) * s * 0.035, s * 0.19 + Math.sin(a) * s * 0.025, s * 0.03, s * 0.02, a); } }, '#FBD3DC', '#C98A9A', lw * 0.6);
      part(ctx, function (p) { C(p, s * 0.18, s * 0.19, s * 0.018); }, CENTRE, null, 0);
      part(ctx, function (p) { El(p, s * 0.4, s * 0.38, s * 0.06, s * 0.04); El(p, -s * 0.42, s * 0.34, s * 0.05, s * 0.035); }, STONE, STONE_DK, lw * 0.8);
    },
    barn: function (ctx, s) {
      var W = '#C98A7A', WS = '#AE6F60', L = '#6E3E36', R = '#7A4E44', RS = '#5E3A32', T = '#FFF6E8', lw = lwOf(s), o = s * 0.025;
      part(ctx, function (p) { El(p, 0, s * 0.45, s * 0.46, s * 0.05); }, 'rgba(60,40,20,0.18)', null, 0);
      cel(ctx, function (p) { poly(p, sc([[-0.4, -0.08], [-0.4, 0.45], [0.4, 0.45], [0.4, -0.08], [0, -0.32]], s), s * 0.02); }, W, WS, L, lw, o);
      cel(ctx, function (p) { poly(p, sc([[0, -0.47], [0.3, -0.34], [0.48, -0.06], [0.42, 0.0], [0.27, -0.24], [0, -0.35], [-0.27, -0.24], [-0.42, 0.0], [-0.48, -0.06], [-0.3, -0.34]], s), s * 0.025); }, R, RS, L, lw, o);
      // loft window with hay
      part(ctx, function (p) { rr(p, -s * 0.08, -s * 0.23, s * 0.16, s * 0.13, s * 0.02); }, '#3B2618', T, lw * 1.2);
      part(ctx, function (p) { p.moveTo(-s * 0.07, -s * 0.1); p.quadraticCurveTo(0, -s * 0.17, s * 0.07, -s * 0.1); p.closePath(); }, '#E6C77E', null, 0);
      // door
      part(ctx, function (p) { rr(p, -s * 0.2, s * 0.06, s * 0.4, s * 0.39, s * 0.02); }, WS, T, lw * 1.4);
      line(ctx, function (p) { p.moveTo(-s * 0.2, s * 0.06); p.lineTo(s * 0.2, s * 0.45); p.moveTo(s * 0.2, s * 0.06); p.lineTo(-s * 0.2, s * 0.45); p.moveTo(0, s * 0.06); p.lineTo(0, s * 0.45); }, T, lw * 1.2);
      line(ctx, function (p) { p.moveTo(-s * 0.4, -s * 0.08); p.lineTo(-s * 0.4, s * 0.45); p.moveTo(s * 0.4, -s * 0.08); p.lineTo(s * 0.4, s * 0.45); }, T, lw * 1.2);
      tuft(ctx, -s * 0.3, s * 0.45, s * 0.09); tuft(ctx, s * 0.32, s * 0.45, s * 0.08);
    },
    burrow: function (ctx, s) {
      var G = '#8DBF6A', GS = '#6EA34E', GL = '#4A7A36', Sd = '#8A5E40', lw = lwOf(s), o = s * 0.025;
      var mound = function (p) { p.moveTo(-s * 0.5, s * 0.45); p.bezierCurveTo(-s * 0.46, -s * 0.05, -s * 0.24, -s * 0.24, 0, -s * 0.24); p.bezierCurveTo(s * 0.24, -s * 0.24, s * 0.46, -s * 0.05, s * 0.5, s * 0.45); p.closePath(); };
      cel(ctx, mound, G, GS, GL, lw, o, [-s * 0.18, -s * 0.12, s * 0.1, s * 0.04, 'rgba(255,255,255,0.3)']);
      part(ctx, function (p) { p.moveTo(-s * 0.26, s * 0.45); p.bezierCurveTo(-s * 0.26, s * 0.12, -s * 0.15, s * 0.0, 0, s * 0.0); p.bezierCurveTo(s * 0.15, s * 0.0, s * 0.26, s * 0.12, s * 0.26, s * 0.45); p.closePath(); }, Sd, mix(Sd, '#000000', 0.3), lw);
      part(ctx, function (p) { p.moveTo(-s * 0.18, s * 0.45); p.bezierCurveTo(-s * 0.18, s * 0.17, -s * 0.1, s * 0.07, 0, s * 0.07); p.bezierCurveTo(s * 0.1, s * 0.07, s * 0.18, s * 0.17, s * 0.18, s * 0.45); p.closePath(); }, '#2E1C12', null, 0);
      // a carrot by the door
      ctx.save(); ctx.translate(s * 0.36, s * 0.36); ctx.rotate(0.5);
      part(ctx, function (p) { p.moveTo(-s * 0.035, -s * 0.08); p.quadraticCurveTo(0, -s * 0.1, s * 0.035, -s * 0.08); p.lineTo(0, s * 0.1); p.closePath(); }, CARROT.base, CARROT.dark, lw * 0.8);
      line(ctx, function (p) { p.moveTo(0, -s * 0.09); p.lineTo(-s * 0.04, -s * 0.16); p.moveTo(0, -s * 0.09); p.lineTo(s * 0.03, -s * 0.17); }, STEM_DK, lw * 1.2);
      ctx.restore();
      [[-0.3, -0.04], [0.1, -0.2], [0.32, 0.02], [-0.1, -0.2]].forEach(function (q) { tuft(ctx, q[0] * s, q[1] * s + s * 0.04, s * 0.07, '#6EA34E', GL); });
      part(ctx, function (p) { El(p, -s * 0.38, s * 0.42, s * 0.05, s * 0.03); }, STONE, STONE_DK, lw * 0.8);
    },
    coop: function (ctx, s) {
      var W = '#E9C98F', WS = '#CDA868', L = '#7E5A36', R = '#8C5A3B', RS = '#6E4428', lw = lwOf(s), o = s * 0.025;
      part(ctx, function (p) { El(p, 0, s * 0.45, s * 0.42, s * 0.05); }, 'rgba(60,40,20,0.18)', null, 0);
      part(ctx, function (p) { rr(p, -s * 0.3, s * 0.16, s * 0.06, s * 0.29, s * 0.02); rr(p, s * 0.24, s * 0.16, s * 0.06, s * 0.29, s * 0.02); }, WS, L, lw);
      cel(ctx, function (p) { rr(p, -s * 0.34, -s * 0.12, s * 0.68, s * 0.34, s * 0.03); }, W, WS, L, lw, o);
      line(ctx, function (p) { for (var i = 1; i < 5; i++) { var x = -s * 0.34 + i * s * 0.136; p.moveTo(x, -s * 0.1); p.lineTo(x, s * 0.2); } }, rgba(L, 0.3), lw * 0.7);
      cel(ctx, function (p) { poly(p, sc([[0, -0.44], [0.44, -0.08], [0.38, -0.03], [0, -0.32], [-0.38, -0.03], [-0.44, -0.08]], s), s * 0.03); }, R, RS, L, lw, o);
      part(ctx, function (p) { C(p, -s * 0.12, s * 0.06, s * 0.08); }, '#3B2618', L, lw);
      part(ctx, function (p) { p.moveTo(-s * 0.18, s * 0.12); p.quadraticCurveTo(-s * 0.12, s * 0.08, -s * 0.06, s * 0.12); p.lineTo(-s * 0.06, s * 0.14); p.lineTo(-s * 0.18, s * 0.14); p.closePath(); }, '#E6C77E', null, 0);
      part(ctx, function (p) { rr(p, s * 0.08, -s * 0.04, s * 0.14, s * 0.12, s * 0.02); }, '#FFF6E2', L, lw);
      line(ctx, function (p) { p.moveTo(s * 0.15, -s * 0.04); p.lineTo(s * 0.15, s * 0.08); p.moveTo(s * 0.08, s * 0.02); p.lineTo(s * 0.22, s * 0.02); }, L, lw * 0.8);
      // ramp
      part(ctx, function (p) { poly(p, [[-s * 0.2, s * 0.14], [-s * 0.08, s * 0.16], [-s * 0.34, s * 0.46], [-s * 0.47, s * 0.44]], s * 0.01); }, W, L, lw);
      line(ctx, function (p) { for (var i = 1; i < 4; i++) { var t = i / 4; p.moveTo(-s * 0.2 + (-s * 0.27) * t, s * 0.14 + s * 0.3 * t); p.lineTo(-s * 0.08 + (-s * 0.26) * t, s * 0.16 + s * 0.3 * t); } }, L, lw * 0.9);
      tuft(ctx, s * 0.36, s * 0.45, s * 0.08);
    },
    sty: function (ctx, s) {
      var W = '#C9935E', WS = '#9C6B3E', L = '#6E4526', R = '#8C5A3B', M = '#8A6448', MS = '#6E4C34', lw = lwOf(s), o = s * 0.025;
      part(ctx, function (p) { El(p, 0, s * 0.42, s * 0.48, s * 0.07); }, 'rgba(60,40,20,0.18)', null, 0);
      // little hut behind
      cel(ctx, function (p) { rr(p, -s * 0.4, -s * 0.12, s * 0.42, s * 0.36, s * 0.02); }, W, WS, L, lw, o);
      cel(ctx, function (p) { poly(p, sc([[-0.46, -0.08], [-0.2, -0.38], [0.08, -0.08]], s), s * 0.03); }, R, mix(R, L, 0.4), L, lw, o);
      part(ctx, function (p) { p.moveTo(-s * 0.3, s * 0.24); p.lineTo(-s * 0.3, s * 0.08); p.arc(-s * 0.2, s * 0.08, s * 0.1, Math.PI, 0); p.lineTo(-s * 0.1, s * 0.24); p.closePath(); }, '#3B2618', null, 0);
      // mud puddle
      cel(ctx, function (p) { El(p, s * 0.16, s * 0.15, s * 0.3, s * 0.12); }, M, MS, mix(MS, '#000000', 0.3), lw, -o, [s * 0.08, s * 0.12, s * 0.08, s * 0.025, 'rgba(255,240,220,0.3)']);
      part(ctx, function (p) { C(p, s * 0.28, s * 0.14, s * 0.025); C(p, s * 0.04, s * 0.18, s * 0.018); }, 'rgba(255,240,220,0.35)', MS, lw * 0.5);
      // front fence
      part(ctx, function (p) { for (var i = 0; i < 6; i++) { var x = -s * 0.46 + i * s * 0.184; rr(p, x - s * 0.03, s * 0.2, s * 0.06, s * 0.25, s * 0.025); } }, W, L, lw);
      part(ctx, function (p) { rr(p, -s * 0.48, s * 0.25, s * 0.96, s * 0.055, s * 0.02); rr(p, -s * 0.48, s * 0.36, s * 0.96, s * 0.055, s * 0.02); }, mix(W, '#FFFFFF', 0.15), L, lw);
    }
  };

  // ================================================================ GLYPHS (painted numerals / letters)
  var glyphM = {};
  function glyphFit(ctx, text, H, maxW) {
    var k = text + '|' + Math.round(H) + '|' + Math.round(maxW);
    if (glyphM[k]) return glyphM[k];
    ctx.save();
    ctx.font = '900 100px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    var m = ctx.measureText(text) || {}, h, w, asc, dsc;
    ctx.restore();
    if (m.actualBoundingBoxAscent != null && isFinite(m.actualBoundingBoxAscent) && (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) > 1) {
      asc = m.actualBoundingBoxAscent; dsc = m.actualBoundingBoxDescent; h = asc + dsc;
      w = (m.actualBoundingBoxRight != null ? m.actualBoundingBoxLeft + m.actualBoundingBoxRight : m.width) || 60;
    } else { asc = 72; dsc = 0; h = 72; w = num(m.width, 60 * text.length) || 60 * text.length; }
    var f = H / h, sx = 1;
    if (w * f > maxW) { sx = Math.max(0.74, maxW / (w * f)); if (w * f * sx > maxW) f = maxW / (w * sx); }
    var r = { fs: 100 * f, sx: sx, dy: (asc - dsc) / 2 * f, dx: m.actualBoundingBoxLeft != null && m.actualBoundingBoxRight != null ? (m.actualBoundingBoxLeft - m.actualBoundingBoxRight) / 2 * f : 0 };
    glyphM[k] = r;
    return r;
  }
  function paintGlyph(ctx, text, H, maxW, col) {
    text = String(text == null ? '' : text);
    if (!text) return;
    var g = glyphFit(ctx, text, H, maxW), b = Math.max(0.8, H * 0.025);
    ctx.save();
    ctx.font = '900 ' + g.fs.toFixed(1) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.scale(g.sx, 1);
    var x = g.dx / g.sx, y = g.dy;
    ctx.fillStyle = 'rgba(255,240,210,0.7)'; ctx.fillText(text, x + b * 0.6, y + b);   // a light paint edge
    ctx.fillStyle = col || SIGN.glyph; ctx.fillText(text, x, y);
    ctx.restore();
  }

  // ================================================================ SIGNS, PATCHES
  function bodyGeom(size) { var R = size * 0.045, lw = Math.max(1.6, size * 0.018), E = R + lw; return { E: E, si: Math.max(4, size - 2 * E), lw: lw }; }
  /** the board outline of a sign (sub-path builder at size) */
  function boardOf(ck, size) {
    var kind = ck.kind || 'round', G = bodyGeom(size), si = G.si;
    if (kind === 'shape') { var f = SHAPE_B[ck.shape] || SHAPE_B.circle; return { key: 'sb:' + (SHAPE_B[ck.shape] ? ck.shape : 'circle') + '|' + Math.round(si * 2) / 2, fn: function (p) { f(p, si); }, w: si, h: si }; }
    if (kind === 'glyph' || (kind === 'round' && ck.text != null)) {
      var t = String(ck.text != null ? ck.text : ck.n != null ? ck.n : ''), wide = t.length > 1 ? 0.96 : 0.84;
      return { key: 'sg:' + wide + '|' + Math.round(size * 2) / 2, fn: function (p) { rr(p, -size * wide / 2, -size * 0.38, size * wide, size * 0.76, size * 0.12); }, w: size * wide, h: size * 0.76 };
    }
    if (kind === 'animal' || kind === 'home') return { key: 'sp:' + Math.round(size * 2) / 2, fn: function (p) { rr(p, -size * 0.45, -size * 0.43, size * 0.9, size * 0.84, size * 0.14); }, w: size * 0.9, h: size * 0.84 };
    return { key: 'sr:' + Math.round(si * 2) / 2, fn: function (p) { C(p, 0, 0, si * 0.47); }, w: si * 0.94, h: si * 0.94 };
  }
  function woodBoard(ctx, S, size, w, h, cols, grainSeed) {
    var lw = Math.max(1.5, size * 0.024), o = size * 0.03;
    cols = cols || SIGN;
    ctx.lineWidth = lw * 2; ctx.strokeStyle = cols.outline; strokeS(ctx, S);
    ctx.fillStyle = cols.shade; fillS(ctx, S);
    ctx.save(); clipS(ctx, S);
    ctx.translate(-o, -o * 1.1); ctx.fillStyle = cols.wood; fillS(ctx, S); ctx.translate(o, o * 1.1);
    // grain
    ctx.lineWidth = Math.max(0.8, size * 0.009); ctx.strokeStyle = rgba(cols.shade, 0.55); ctx.beginPath();
    for (var i = 0; i < 6; i++) {
      var y = -h / 2 + h * (i + 0.5) / 6 + (hash(i + grainSeed) - 0.5) * h * 0.06;
      ctx.moveTo(-w / 2, y); ctx.bezierCurveTo(-w * 0.2, y - h * 0.03, w * 0.1, y + h * 0.04, w / 2, y - h * 0.01);
    }
    ctx.stroke();
    ctx.fillStyle = rgba(cols.shade, 0.6); ctx.beginPath(); El(ctx, w * (0.22 - hash(grainSeed) * 0.1), h * 0.12, size * 0.035, size * 0.018); ctx.fill();
    var hg = ctx.createRadialGradient(-w * 0.25, -h * 0.28, 0, -w * 0.25, -h * 0.28, Math.max(w, h) * 0.45);
    hg.addColorStop(0, 'rgba(255,248,230,0.55)'); hg.addColorStop(1, 'rgba(255,248,230,0)');
    ctx.fillStyle = hg; ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.restore();
  }
  function nailHeads(ctx, pts, r) {
    ctx.fillStyle = '#8B8F94'; ctx.beginPath(); for (var i = 0; i < pts.length; i++) C(ctx, pts[i][0], pts[i][1], r); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); for (i = 0; i < pts.length; i++) C(ctx, pts[i][0] - r * 0.3, pts[i][1] - r * 0.3, r * 0.35); ctx.fill();
  }
  function stake(ctx, size, y0, y1) {
    var w = size * 0.1, lw = Math.max(1.4, size * 0.022);
    ctx.beginPath(); rr(ctx, -w / 2, y0, w, y1 - y0, w * 0.25);
    ctx.fillStyle = SIGN.shade; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = SIGN.outline; ctx.stroke();
    ctx.fillStyle = 'rgba(255,240,210,0.5)'; ctx.fillRect(-w * 0.32, y0 + lw, w * 0.18, y1 - y0 - 2 * lw);
  }
  var SIGN_CY = -0.08, STAKE_END = 0.6;
  /** the static sign art (grass tufts, stake, board, painted content) */
  function signStatic(ctx, ck, size) {
    var B = boardOf(ck, size), S = shape(B.key, B.fn), cy = size * SIGN_CY, kind = ck.kind || 'round', stakeEnd = size * STAKE_END;
    tuft(ctx, -size * 0.09, stakeEnd, size * 0.14); tuft(ctx, size * 0.1, stakeEnd, size * 0.12);
    stake(ctx, size, cy, stakeEnd);
    ctx.save(); ctx.translate(0, cy);
    woodBoard(ctx, S, size, B.w, B.h, SIGN, (kind.length * 3 + String(ck.shape || ck.animal || ck.home || ck.text || '').length) % 7);
    var nails = [[-B.w / 2 + size * 0.07, -B.h / 2 + size * 0.07], [B.w / 2 - size * 0.07, -B.h / 2 + size * 0.07]], nr = Math.max(1.2, size * 0.018);
    if (kind === 'glyph') {
      paintGlyph(ctx, String(ck.text != null ? ck.text : ck.n != null ? ck.n : ''), size * 0.56, B.w * 0.84);
      nailHeads(ctx, nails, nr);
    } else if (kind === 'round' && ck.text != null) nailHeads(ctx, nails, nr);
    else if (kind === 'animal' || kind === 'home') {
      ctx.save(); clipS(ctx, S);
      ctx.fillStyle = '#C8E3A8'; ctx.beginPath(); El(ctx, 0, size * 0.32, size * 0.5, size * 0.14); ctx.fill();
      ctx.restore();
      var fs = size * 0.74;
      if (kind === 'animal') { var A = ANIMAL[ck.animal]; if (A) { ctx.save(); A(ctx, fs, { step: 0, time: 0.3, still: true }); ctx.restore(); } }
      else { var H = HOME[ck.home]; if (H) { ctx.save(); H(ctx, fs * 0.98); ctx.restore(); } }
    } else if (kind === 'round') { ctx.save(); ctx.translate(0, size * 0.2); drawPlant(ctx, '#FF8FC0', 1, size * 0.02, 0); ctx.restore(); }
    else {   // shape signs: the shape is also painted as a thick dark outline, so every shape reads at 116 px
      var sf = SHAPE_B[ck.shape] || SHAPE_B.circle, ps = bodyGeom(size).si * (ck.shape === 'star' ? 0.66 : 0.72);
      ctx.save(); ctx.translate(0, ck.shape === 'triangle' ? size * 0.035 : 0);
      ctx.beginPath(); sf(ctx, ps); ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(2.5, size * 0.06); ctx.strokeStyle = 'rgba(255,240,210,0.7)'; ctx.save(); ctx.translate(size * 0.008, size * 0.012); ctx.stroke(); ctx.restore();
      ctx.strokeStyle = SIGN.glyph; ctx.stroke();
      ctx.restore();
      nailHeads(ctx, [[0, ck.shape === 'star' || ck.shape === 'triangle' ? -B.h * 0.3 : -B.h * 0.4 + size * 0.02]], Math.max(1.2, size * 0.018));
    }
    ctx.restore();
  }
  function lookKey(ck) { return (ck.kind || 'round') + '|' + (ck.shape || ck.animal || ck.home || '') + '|' + (ck.text != null ? ck.text : ck.n != null ? ck.n : ''); }
  function signLook(ctx, ck, size, o) {
    var B = boardOf(ck, size), S = shape(B.key, B.fn), cy = size * SIGN_CY;
    if (o.glow > 0) { ctx.save(); ctx.translate(0, cy); glowStroke(ctx, S, size, o.glow, o.time); ctx.restore(); }
    if (!cachedLook(ctx, 'sign|' + lookKey(ck), size, -0.58, -0.6, 1.16, 1.26, function (g, Sz) { signStatic(g, ck, Sz); })) signStatic(ctx, ck, size);
    if (o.dim) { ctx.save(); ctx.translate(0, cy); ctx.fillStyle = 'rgba(246,238,226,' + (0.5 * o.dim).toFixed(3) + ')'; fillS(ctx, S); ctx.restore(); }
    return { rx: B.w * 0.58, ry: (B.h + size * 0.3) * 0.55, cy: cy + size * 0.12 };
  }
  function glowStroke(ctx, S, size, glow, time) {
    var pulse = 0.6 + 0.4 * Math.sin(time * 6);
    ctx.save(); ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255,200,60,' + (0.4 * glow * pulse).toFixed(3) + ')'; ctx.lineWidth = size * 0.2; strokeS(ctx, S);
    ctx.strokeStyle = 'rgba(255,226,120,' + (0.8 * glow).toFixed(3) + ')'; ctx.lineWidth = size * 0.09; strokeS(ctx, S);
    ctx.restore();
  }
  function glowBlob(ctx, cy, rx, ry, glow, time) {
    var pulse = 0.6 + 0.4 * Math.sin(time * 6), r = Math.max(rx, ry);
    var g = ctx.createRadialGradient(0, cy, r * 0.3, 0, cy, r * 1.15);
    g.addColorStop(0, 'rgba(255,220,100,' + (0.65 * glow * pulse).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,220,100,0)');
    ctx.save(); ctx.scale(rx / r, ry / r); ctx.fillStyle = g; ctx.beginPath(); C(ctx, 0, cy * r / ry, r * 1.15); ctx.fill(); ctx.restore();
  }
  /** raked soil patch (round or shape) on the bed */
  function patchStatic(ctx, isShape, nm, size) {
    var G = bodyGeom(size), si = G.si, E = G.E, f = SHAPE_B[nm];
    var S = shape('pb:' + nm + '|' + Math.round(si * 2) / 2, function (p) { f(p, si); });
    var base = isShape ? '#A0714C' : SOIL.light, i;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = rgba(SOIL.dark, 0.6); ctx.lineWidth = 2 * E + size * 0.02; strokeS(ctx, S);   // the dug-out ring
    var g = ctx.createRadialGradient(-si * 0.18, -si * 0.22, 0, 0, 0, si * 0.7);
    g.addColorStop(0, mix(base, '#FFF0DC', 0.1)); g.addColorStop(1, mix(base, SOIL.dark, 0.22));
    ctx.fillStyle = g; ctx.lineWidth = E * 1.2; ctx.strokeStyle = g; strokeS(ctx, S); fillS(ctx, S);
    if (size > 40) {
      ctx.save(); clipS(ctx, S);
      // raked furrows: soft wavy dark bands with a light ridge above, slightly irregular
      var n = Math.max(5, Math.round(si / 30));
      ctx.beginPath();
      for (i = 0; i <= n; i++) {
        var y = -si * 0.55 + si * 1.1 * (i + 0.5) / (n + 1), amp = si * (0.008 + hash(i + 2) * 0.01), ph = hash(i) * 6;
        ctx.moveTo(-si * 0.6, y);
        for (var k = 1; k <= 12; k++) { var x = -si * 0.6 + si * 1.2 * k / 12; ctx.lineTo(x, y + Math.sin(k * 0.9 + ph) * amp + (k / 12 - 0.5) * si * 0.03); }
      }
      ctx.lineWidth = Math.max(1.5, si * 0.03); ctx.strokeStyle = rgba(SOIL.dark, 0.3); ctx.stroke();
      ctx.save(); ctx.translate(0, -Math.max(1.2, si * 0.022)); ctx.lineWidth = Math.max(0.8, si * 0.012); ctx.strokeStyle = 'rgba(255,226,190,0.16)'; ctx.stroke(); ctx.restore();
      ctx.fillStyle = rgba(SOIL.dark, 0.45); ctx.beginPath();
      for (i = 0; i < 26; i++) El(ctx, (hash(i * 5 + 3) - 0.5) * si, (hash(i * 5 + 4) - 0.5) * si, si * (0.008 + hash(i + 1) * 0.012), si * (0.005 + hash(i + 6) * 0.006), hash(i) * 3);
      ctx.fill();
      ctx.fillStyle = rgba(SOIL.crumb, 0.9); ctx.beginPath();
      for (i = 0; i < 40; i++) C(ctx, (hash(i * 3 + 1) - 0.5) * si, (hash(i * 3 + 2) - 0.5) * si, Math.max(0.7, si * (0.004 + hash(i) * 0.006)));
      ctx.fill();
      ctx.restore();
    }
    // beaded rim: little pebbles (shape patches: the shape reads from them) or soil crumbs (the round patch)
    // a soft continuous rim: darker soil band + a thin light ridge just inside (no beads: they read as trace dots)
    ctx.lineWidth = E * 1.1; ctx.strokeStyle = rgba(SOIL.dark, 0.75); strokeS(ctx, S);
    ctx.lineWidth = Math.max(1.2, E * 0.35); ctx.strokeStyle = isShape ? 'rgba(255,236,205,0.45)' : 'rgba(255,226,190,0.28)';
    ctx.save(); clipS(ctx, S); strokeS(ctx, S); ctx.restore();
    return S;
  }
  function patchLook(ctx, ck, size, o) {
    var isShape = ck.kind === 'shape', nm = isShape && SHAPE_B[ck.shape] ? ck.shape : 'circle', f = SHAPE_B[nm];
    var G = bodyGeom(size), si = G.si;
    var S = shape('pb:' + nm + '|' + Math.round(si * 2) / 2, function (p) { f(p, si); });
    if (o.glow > 0) glowStroke(ctx, S, size * 0.8, o.glow, o.time);
    if (!cachedLook(ctx, 'patch|' + (isShape ? 's' : 'r') + nm, size, -0.56, -0.56, 1.12, 1.12, function (g, Sz) { patchStatic(g, isShape, nm, Sz); }, 1100)) patchStatic(ctx, isShape, nm, size);
    if (o.dim) { ctx.fillStyle = 'rgba(246,238,226,' + (0.45 * o.dim).toFixed(3) + ')'; fillS(ctx, S); }
    return { rx: size * 0.58, ry: size * 0.58, cy: 0 };
  }
  /** a glyph sign lying flat on the bed (numeral ≈ 0.74 size) */
  function flatSignLook(ctx, ck, size, o) {
    var t = String(ck.text != null ? ck.text : ck.n != null ? ck.n : ''), wide = 0.96;
    var S = shape('fs|' + Math.round(size * 2) / 2, function (p) { rr(p, -size * wide / 2, -size * 0.45, size * wide, size * 0.9, size * 0.1); });
    ctx.save(); ctx.translate(size * 0.012, size * 0.02); ctx.fillStyle = rgba(SOIL.dark, 0.55); fillS(ctx, S); ctx.restore();
    if (o.glow > 0) glowStroke(ctx, S, size * 0.6, o.glow, o.time);
    woodBoard(ctx, S, size * 0.5, size * wide, size * 0.9, SIGN, 3);
    nailHeads(ctx, [[-size * 0.42, -size * 0.38], [size * 0.42, -size * 0.38], [-size * 0.42, size * 0.38], [size * 0.42, size * 0.38]], Math.max(1.5, size * 0.012));
    if (ck.kind === 'glyph') paintGlyph(ctx, t, size * 0.74, size * 0.82, rgba(SIGN.glyph, 0.85));
    if (o.dim) { ctx.fillStyle = 'rgba(246,238,226,' + (0.45 * o.dim).toFixed(3) + ')'; fillS(ctx, S); }
    return { rx: size * 0.56, ry: size * 0.52, cy: 0 };
  }
  function figureLook(ctx, ck, size, o, walking) {
    var kind = ck.kind, k = { step: o.step == null ? ((o.time * 1.6) % 1) : num(o.step), time: o.time, still: !walking };
    if (o.glow > 0) glowBlob(ctx, 0, size * 0.55, size * 0.55, o.glow, o.time);
    if (kind === 'animal' && ANIMAL[ck.animal]) {
      ctx.fillStyle = 'rgba(50,30,15,0.22)'; ctx.beginPath(); El(ctx, 0, size * 0.45, size * 0.32, size * 0.05); ctx.fill();
      var still = function (g, Sz) { ANIMAL[ck.animal](g, Sz, { step: 0, time: 0.3, still: true }); };
      if (walking || !cachedLook(ctx, 'fig|' + lookKey(ck), size, -0.6, -0.6, 1.2, 1.15, still)) { ctx.save(); ANIMAL[ck.animal](ctx, size, k); ctx.restore(); }
    } else if (kind === 'home' && HOME[ck.home]) {
      if (!cachedLook(ctx, 'fig|' + lookKey(ck), size, -0.6, -0.6, 1.2, 1.15, function (g, Sz) { HOME[ck.home](g, Sz); })) { ctx.save(); HOME[ck.home](ctx, size); ctx.restore(); }
    }
    else return patchLook(ctx, { kind: 'round' }, size, o);
    return { rx: size * 0.56, ry: size * 0.56, cy: 0 };
  }
  // sparkles + selection ring
  function sparkleStar(ctx, x, y, r, a) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.beginPath();
    for (var i = 0; i < 8; i++) { var q = i % 2 ? r * 0.28 : r, an = i * Math.PI / 4; if (i) ctx.lineTo(Math.cos(an) * q, Math.sin(an) * q); else ctx.moveTo(q, 0); }
    ctx.closePath(); ctx.fill(); ctx.restore();
  }
  function drawSparkles(ctx, rad, sp, time, seed) {
    ctx.save(); ctx.fillStyle = 'rgba(255,250,222,' + (0.95 * sp).toFixed(3) + ')';
    ctx.shadowColor = 'rgba(255,214,110,0.8)'; ctx.shadowBlur = 6;
    for (var k = 0; k < 5; k++) {
      var a = seed + k * 1.2566 + time * 0.9, tw = 0.55 + 0.45 * Math.sin(time * 7 + k * 2.1);
      sparkleStar(ctx, Math.cos(a) * rad, Math.sin(a) * rad * 0.85, rad * (0.09 + 0.07 * tw) * (0.5 + 0.5 * sp), a);
    }
    ctx.restore();
  }
  function selRing(ctx, rx, ry, sel, time) {
    ctx.beginPath(); ctx.ellipse(0, 0, Math.max(1, rx), Math.max(1, ry), 0, 0, TAU);
    ctx.strokeStyle = 'rgba(90,58,30,' + (0.85 * sel).toFixed(3) + ')'; ctx.lineWidth = Math.max(5, rx * 0.12); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,' + sel.toFixed(3) + ')'; ctx.lineWidth = Math.max(3, rx * 0.065);
    if (ctx.setLineDash) { ctx.setLineDash([rx * 0.24, rx * 0.11]); ctx.lineDashOffset = -time * 30; }
    ctx.stroke();
    if (ctx.setLineDash) { ctx.setLineDash([]); ctx.lineDashOffset = 0; }
  }
  /** rows + carrots of a decorated ck (picture px around icingBox, scaled to size) */
  function decorations(ctx, ck, size, opt, time) {
    var ice = ck.icing || [], extra = (opt && opt.icing) || [], box = (opt && opt.icingBox) || ck.icingBox || {};
    if (!(ice.length || extra.length || (ck.chips && ck.chips.length))) return;
    var bs = num(box.size, 330) || 330, k = size / bs, cx = num(box.cx, 300), cy = num(box.cy, 200);
    ctx.save(); ctx.scale(k, k); ctx.translate(-cx, -cy);
    ice.concat(extra).forEach(function (q) {
      if (!q || !q.pts || !q.pts.length) return;
      var o2 = { wet: 0, bloom: 1, road: !!q.road, time: time };
      if (Array.isArray(q.pts[0]) && Array.isArray(q.pts[0][0])) q.pts.forEach(function (st) { drawIcing(ctx, st, q.hex, q.width || 22, o2); });
      else drawIcing(ctx, q.pts, q.hex, q.width || 22, o2);
    });
    (ck.chips || []).forEach(function (c) { ctx.save(); ctx.translate(num(c.x), num(c.y)); drawChip(ctx, num(c.r, 15) || 15, { grow: 1, squash: c.squash }); ctx.restore(); });
    ctx.restore();
  }

  function drawCookie(ctx, ck, size, opt) {
    if (!ck) return;
    size = num(size); if (!(size > 1)) return;
    opt = opt || {};
    var look = opt.look || 'sign';
    if (look === 'badge') { drawBadge(ctx, ck, size, opt); return; }
    var time = opt.time == null ? nowSec() : num(opt.time);
    var lift = clamp01(opt.lift), wob = num(opt.wob), sel = amt(opt.selected), spk = clamp01(opt.sparkle);
    var o = { glow: clamp01(opt.glow), dim: amt(opt.dim), time: time, step: opt.step };
    var sy = opt.sy != null ? num(opt.sy, 1) : opt.squash != null ? num(opt.squash, 1) : 1;
    var sx = opt.sx != null ? num(opt.sx, 1) : 1 + (1 - sy) * 0.6;
    if (!(sy > 0.05)) sy = 0.05; if (!(sx > 0.05)) sx = 0.05;
    var kind = ck.kind || 'round';
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (o.dim && look !== 'sign') ctx.globalAlpha *= 1 - 0.25 * o.dim;
    var base = look === 'sign' ? size * 0.6 : size * 0.45;
    // lift shadow (signs / figures: an ellipse at the foot; patches lie on the soil)
    if (lift > 0 && look === 'sign') {
      ctx.fillStyle = rgba('#3A2418', 0.18 * lift); ctx.beginPath(); El(ctx, wob * 0.5, base + size * 0.02, size * 0.3 * (1 - 0.2 * lift), size * 0.05); ctx.fill();
    }
    ctx.translate(wob, -size * 0.12 * lift); ctx.rotate(wob * 0.012);
    ctx.translate(0, base * (1 - sy)); ctx.scale(sx, sy);   // squash about the foot / bottom
    var ls = 1 + 0.05 * lift + 0.03 * sel; ctx.scale(ls, ls);
    var R;
    if (look === 'walker') R = figureLook(ctx, ck, size, o, true);
    else if (look === 'bed') {
      if (kind === 'animal' || kind === 'home') R = figureLook(ctx, ck, size, o, false);
      else if (kind === 'glyph' || (kind === 'round' && ck.text != null)) R = flatSignLook(ctx, ck, size, o);
      else R = patchLook(ctx, ck, size, o);
    } else R = signLook(ctx, ck, size, o);
    decorations(ctx, ck, size, opt, time);
    if (sel > 0) { ctx.save(); ctx.translate(0, R.cy); selRing(ctx, R.rx, R.ry, sel, time); ctx.restore(); }
    if (spk > 0) drawSparkles(ctx, size * 0.48, spk, time, (kind.length * 1.7) % 6);
    ctx.restore();
  }

  // ================================================================ ROSETTE (badge)
  function drawBadge(ctx, ck, size, opt) {
    if (!ck) return;
    size = num(size); if (!(size > 1)) return;
    opt = opt || {};
    var time = opt.time == null ? nowSec() : num(opt.time);
    var hex = ck.hex || (ck.icing && ck.icing[0] && ck.icing[0].hex) || null, c = pal(hex) || GOLD;
    var ringC = mix(c.base, GOLD.base, 0.25), ringD = mix(c.dark, GOLD.dark, 0.25);
    var sy = opt.sy != null ? num(opt.sy, 1) : 1, sx = opt.sx != null ? num(opt.sx, 1) : 1, wob = num(opt.wob), lift = clamp01(opt.lift);
    var R = size / 2, lw = Math.max(1.2, size * 0.022);
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (amt(opt.dim)) ctx.globalAlpha *= 1 - 0.3 * amt(opt.dim);
    // the nail + string (do not swing)
    var ny = -R * 1.2;
    ctx.lineWidth = Math.max(1, size * 0.018); ctx.strokeStyle = '#8A6A4A';
    ctx.beginPath(); ctx.moveTo(-R * 0.35, -R * 0.82); ctx.lineTo(0, ny); ctx.lineTo(R * 0.35, -R * 0.82); ctx.stroke();
    nailHeads(ctx, [[0, ny]], Math.max(1.5, size * 0.045));
    ctx.translate(0, ny); ctx.rotate(wob * 0.02 + Math.sin(time * 1.7) * 0.02); ctx.translate(0, -ny);
    ctx.translate(0, -size * 0.1 * lift);
    ctx.translate(0, R * (1 - sy)); ctx.scale(sx, sy);
    if (opt.glow > 0) glowBlob(ctx, 0, R * 1.1, R * 1.1, clamp01(opt.glow), time);
    // tails
    [[-1, -0.32], [1, 0.3]].forEach(function (q) {
      ctx.save(); ctx.rotate(q[1]);
      ctx.beginPath(); ctx.moveTo(-R * 0.22, R * 0.2); ctx.lineTo(R * 0.22, R * 0.2); ctx.lineTo(R * 0.24, R * 1.55); ctx.lineTo(0, R * 1.36); ctx.lineTo(-R * 0.24, R * 1.55); ctx.closePath();
      ctx.fillStyle = q[0] < 0 ? c.base : mix(c.base, c.dark, 0.3); ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = c.dark; ctx.stroke();
      ctx.fillStyle = rgba(c.light, 0.6); ctx.fillRect(-R * 0.12, R * 0.3, R * 0.05, R * 1.0);
      ctx.restore();
    });
    // pleated ring
    var n = 22;
    ctx.beginPath();
    for (var i = 0; i <= n * 2; i++) { var a = i / (n * 2) * TAU, r = i % 2 ? R * 0.9 : R; if (i) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.moveTo(r, 0); }
    ctx.closePath(); ctx.fillStyle = ringC; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = ringD; ctx.stroke();
    ctx.beginPath(); for (i = 0; i < n; i++) { var b = (i + 0.5) / n * TAU; ctx.moveTo(Math.cos(b) * R * 0.66, Math.sin(b) * R * 0.66); ctx.lineTo(Math.cos(b) * R * 0.93, Math.sin(b) * R * 0.93); }
    ctx.lineWidth = Math.max(0.8, lw * 0.7); ctx.strokeStyle = rgba(ringD, 0.6); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); El(ctx, -R * 0.4, -R * 0.45, R * 0.28, R * 0.14, -0.7); ctx.fill();
    // gold band + white disc
    part(ctx, function (p) { C(p, 0, 0, R * 0.66); }, GOLD.base, GOLD.dark, lw);
    part(ctx, function (p) { C(p, 0, 0, R * 0.56); }, '#FFFDF6', mix(GOLD.dark, '#FFFFFF', 0.3), lw * 0.8);
    // the mini picture
    ctx.save(); ctx.beginPath(); C(ctx, 0, 0, R * 0.53); ctx.clip();
    var kind = ck.kind || 'round', ps = R * 1.0;
    if (kind === 'animal' || kind === 'home') { ctx.fillStyle = '#D8EDC0'; ctx.fillRect(-R, R * 0.12, R * 2, R); drawCookie(ctx, ck, R * 0.95, { look: 'bed', time: time }); }
    else if (kind === 'round' && ck.text == null && hex) {   // a plain round patch: one big flower of the row colour
      var sg = ctx.createRadialGradient(-R * 0.15, -R * 0.2, 0, 0, 0, R * 0.6); sg.addColorStop(0, '#B48660'); sg.addColorStop(1, SOIL.light);
      ctx.fillStyle = sg; ctx.fillRect(-R, -R, 2 * R, 2 * R);
      ctx.fillStyle = rgba(SOIL.dark, 0.35); ctx.beginPath(); El(ctx, 0, R * 0.3, R * 0.3, R * 0.07); ctx.fill();
      ctx.save(); ctx.translate(0, R * 0.3); drawPlant(ctx, hex, 1, R * 0.034, 0); ctx.restore();
    } else {
      ctx.fillStyle = '#9C6E4C'; ctx.fillRect(-R, -R, 2 * R, 2 * R);
      drawCookie(ctx, ck, kind === 'glyph' || ck.text != null ? R * 1.05 : ps, { look: 'bed', time: time });
    }
    ctx.restore();
    ctx.lineWidth = lw; ctx.strokeStyle = mix(GOLD.dark, '#FFFFFF', 0.2); ctx.beginPath(); C(ctx, 0, 0, R * 0.56); ctx.stroke();
    if (clamp01(opt.sparkle) > 0) drawSparkles(ctx, R * 1.05, clamp01(opt.sparkle), time, 1.3);
    ctx.restore();
  }

  // ================================================================ PLANTS (the planted row)
  /** one plant: base at (0,0), u = units scale (1 = width 22 row), g 0..1 growth (seed .. sprout .. bud .. full flower),
   *  ov = extra head scale (bloom overshoot) */
  function plantVec(ctx, c, brownCentre, g, u, ov) {
    ov = ov || 1;
    var lw = 1.3 * u;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (g < 0.12) {   // a seed in the furrow
      var sr = (1.6 + 8 * g) * u;
      ctx.fillStyle = '#C9A06A'; ctx.strokeStyle = SOIL.dark; ctx.lineWidth = 0.8 * u;
      ctx.beginPath(); El(ctx, 0, -sr * 0.5, sr * 1.15, sr * 0.8, -0.4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,245,220,0.7)'; ctx.beginPath(); C(ctx, -sr * 0.35, -sr * 0.8, sr * 0.3); ctx.fill();
      return;
    }
    var gs = g < 0.35 ? (g - 0.12) / 0.23 : 1;                  // sprout 0..1
    var gb = g < 0.35 ? 0 : g < 0.7 ? (g - 0.35) / 0.35 : 1;    // bud 0..1
    var gf = g < 0.7 ? 0 : (g - 0.7) / 0.3;                     // flower opening 0..1
    var h = (3 + 4 * gs + 3 * gb + 1 * gf) * u;                  // stem height
    // stem
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(1.2 * u, -h * 0.5, 0, -h);
    ctx.lineWidth = (2.2 + 0.6 * gb) * u + 2 * lw * 0.6; ctx.strokeStyle = STEM_DK; ctx.stroke();
    ctx.lineWidth = (2.2 + 0.6 * gb) * u; ctx.strokeStyle = STEM; ctx.stroke();
    // two leaves
    var ll = (3.2 + 3.6 * gs + 2.6 * gb) * u, lwid = ll * 0.48, ly = -h * (gb > 0 ? 0.32 : 0.7);
    ctx.fillStyle = STEM; ctx.strokeStyle = STEM_DK; ctx.lineWidth = lw * 0.9;
    ctx.beginPath();
    ctx.moveTo(0, ly); ctx.quadraticCurveTo(-ll * 0.5, ly - lwid * 1.2, -ll, ly - lwid * 0.5); ctx.quadraticCurveTo(-ll * 0.5, ly + lwid * 0.4, 0, ly); ctx.closePath();
    ctx.moveTo(0, ly); ctx.quadraticCurveTo(ll * 0.5, ly - lwid * 1.2, ll, ly - lwid * 0.5); ctx.quadraticCurveTo(ll * 0.5, ly + lwid * 0.4, 0, ly); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = rgba(LEAF_LT, 0.9); ctx.lineWidth = 0.7 * u; ctx.beginPath(); ctx.moveTo(-ll * 0.2, ly - lwid * 0.15); ctx.lineTo(-ll * 0.75, ly - lwid * 0.55); ctx.moveTo(ll * 0.2, ly - lwid * 0.15); ctx.lineTo(ll * 0.75, ly - lwid * 0.55); ctx.stroke();
    if (gb <= 0) return;
    var hy = -h;
    if (gf <= 0) {   // closed bud: green sepals + a colour tip
      var br = (2.6 + 3.2 * gb) * u;
      ctx.beginPath(); ctx.moveTo(0, hy - br * 2.1); ctx.bezierCurveTo(br * 1.15, hy - br * 1.3, br * 1.05, hy, 0, hy); ctx.bezierCurveTo(-br * 1.05, hy, -br * 1.15, hy - br * 1.3, 0, hy - br * 2.1); ctx.closePath();
      ctx.lineWidth = lw + 2 * u; ctx.strokeStyle = rgba(mix(c.light, '#FFFFFF', 0.35), 0.9); ctx.stroke();
      ctx.fillStyle = c.base; ctx.strokeStyle = c.dark; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(0, hy - br * 2.1); ctx.bezierCurveTo(br * 1.15, hy - br * 1.3, br * 1.05, hy, 0, hy); ctx.bezierCurveTo(-br * 1.05, hy, -br * 1.15, hy - br * 1.3, 0, hy - br * 2.1); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = rgba(c.light, 0.85); ctx.beginPath(); El(ctx, -br * 0.3, hy - br * 1.2, br * 0.25, br * 0.5, 0.2); ctx.fill();
      ctx.fillStyle = STEM; ctx.strokeStyle = STEM_DK; ctx.lineWidth = lw * 0.8;
      ctx.beginPath(); ctx.moveTo(-br * 0.95, hy - br * 0.5); ctx.quadraticCurveTo(-br * 0.2, hy + br * 0.3, 0, hy - br * 0.85); ctx.quadraticCurveTo(br * 0.2, hy + br * 0.3, br * 0.95, hy - br * 0.5); ctx.quadraticCurveTo(0, hy + br * 0.35, -br * 0.95, hy - br * 0.5); ctx.closePath(); ctx.fill(); ctx.stroke();
      return;
    }
    // flower: 5 petals opening
    var pr = (5.2 + 1.6 * gf) * u * ov, pd = (2.6 + 4.2 * gf) * u * ov, fy = hy - pd * 0.35 - 1 * u;
    ctx.save(); ctx.translate(0, fy);
    ctx.beginPath();
    for (var i = 0; i < 5; i++) { var a = -Math.PI / 2 + i * TAU / 5; El(ctx, Math.cos(a) * pd, Math.sin(a) * pd, pr, pr * 0.78, a); }
    ctx.lineWidth = lw * 2 + 2.2 * u; ctx.strokeStyle = rgba(mix(c.light, '#FFFFFF', 0.35), 0.95); ctx.stroke();   // light rim: pops on dark soil
    ctx.fillStyle = c.base; ctx.lineWidth = lw * 1.4; ctx.strokeStyle = c.dark; ctx.stroke(); ctx.fill();
    ctx.fillStyle = rgba(c.light, 0.9); ctx.beginPath();
    for (i = 0; i < 5; i++) { var b = -Math.PI / 2 + i * TAU / 5; El(ctx, Math.cos(b) * pd * 0.85, Math.sin(b) * pd * 0.85, pr * 0.42, pr * 0.24, b); }
    ctx.fill();
    var cr = (1.6 + 1.6 * gf) * u * ov;
    if (c.base.toUpperCase() === '#4CC26B') { ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); C(ctx, 0, 0, cr * 1.75); ctx.fill(); }   // green: a white ring (≠ leaves)
    ctx.fillStyle = brownCentre ? CENTRE_BROWN : CENTRE; ctx.strokeStyle = brownCentre ? '#5A3A1E' : CENTRE_RIM; ctx.lineWidth = lw;
    ctx.beginPath(); C(ctx, 0, 0, cr); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.beginPath(); C(ctx, -cr * 0.35, -cr * 0.35, cr * 0.32); ctx.fill();
    ctx.restore();
  }
  function isBrown(hex) { var u = String(hex || '').toUpperCase(); return u === '#E84A4A' || u === '#FFD23F' || u === 'RED' || u === 'YELLOW'; }
  var NSTAGE = 10, NROT = 5, ROT_STEP = 0.06;
  /** the cached plant sprite (or null) at device scale kq (device px per picture unit): stage q 0..NSTAGE (NSTAGE+1..+3 =
   *  bloom overshoot), rotation variant v 0..NROT-1, size variant z 0..1. Anchor = the plant base. */
  function plantSprite(c, brown, q, v, z, u, kq) {
    var key = 'pl|' + c.base + '|' + q + '|' + v + '|' + z + '|' + u.toFixed(2) + '|' + kq;
    var hit = sprites[key]; if (hit) return hit;
    var W = 38 * u, H = 38 * u, ax = W / 2, ay = 28 * u;
    var g = Math.min(1, q / NSTAGE), ov = q > NSTAGE ? 1 + (q - NSTAGE) * 0.075 : 1, js = z ? 1.07 : 0.94;
    hit = sprite(key, W, H, kq, function (gg) { gg.translate(ax, ay); gg.rotate((v - (NROT - 1) / 2) * ROT_STEP); gg.scale(js, js); plantVec(gg, c, brown, g, u, ov); });
    if (hit) { hit.ax = ax; hit.ay = ay; hit.k = kq; }
    return hit;
  }
  function drawPlant(ctx, hex, g, scale, ov) {
    var c = pal(hex) || CREAM, u = num(scale, 1) || 1;
    ctx.save(); plantVec(ctx, c, isBrown(c.base), clamp01(g), u, 1 + Math.max(0, num(ov))); ctx.restore();
  }

  // ================================================================ PLANTED ROW / PEBBLE PATH
  function polyPath(p, pts) {
    var n = pts.length, i, q = pts[0];
    p.moveTo(num(q[0]), num(q[1]));
    if (n === 1) { p.lineTo(num(q[0]) + 0.01, num(q[1])); return; }
    for (i = 1; i < n; i++) { q = pts[i]; p.lineTo(num(q[0]), num(q[1])); }
  }
  /** points every `step` px of arc length (offset `first`): [[x, y, s, ang]] */
  function samples(pts, step, first) {
    var out = [], n = pts.length, acc = 0, next = first, i;
    if (n === 1) return [[num(pts[0][0]), num(pts[0][1]), 0, 0]];
    for (i = 1; i < n; i++) {
      var ax = num(pts[i - 1][0]), ay = num(pts[i - 1][1]), bx = num(pts[i][0]), by = num(pts[i][1]);
      var d = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
      while (next <= acc + d && d > 0) { var t = (next - acc) / d; out.push([ax + (bx - ax) * t, ay + (by - ay) * t, next, Math.atan2(by - ay, bx - ax)]); next += step; }
      acc += d;
    }
    out.total = acc;
    return out;
  }
  function drawRoad(ctx, pts, w, u, S, time) {
    // a trodden band, stepping stones, a few grass tufts
    ctx.lineWidth = w * 1.25; ctx.strokeStyle = rgba(SOIL.light, 0.75); strokeS(ctx, S);
    ctx.lineWidth = w * 0.7; ctx.strokeStyle = rgba('#A07452', 0.55); strokeS(ctx, S);
    var st = samples(pts, 23 * u, 8 * u), i, list = [];
    for (i = 0; i < st.length; i++) {
      var q = st[i], side = (i % 2 ? 1 : -1) * 3.2 * u, nx = -Math.sin(q[3]), ny = Math.cos(q[3]);
      list.push([q[0] + nx * side, q[1] + ny * side, (8.2 + hash(i) * 2.2) * u, (6 + hash(i + 7) * 1.6) * u, q[3] + (hash(i + 3) - 0.5) * 0.6]);
    }
    if (!list.length && pts.length) list.push([num(pts[0][0]), num(pts[0][1]), 8 * u, 6 * u, 0]);
    ctx.fillStyle = 'rgba(40,24,12,0.35)'; ctx.beginPath(); for (i = 0; i < list.length; i++) El(ctx, list[i][0] + 0.6 * u, list[i][1] + 1.8 * u, list[i][2], list[i][3], list[i][4]); ctx.fill();
    ctx.fillStyle = STONE_DK; ctx.beginPath(); for (i = 0; i < list.length; i++) El(ctx, list[i][0], list[i][1], list[i][2], list[i][3], list[i][4]); ctx.fill();
    ctx.fillStyle = STONE; ctx.beginPath(); for (i = 0; i < list.length; i++) El(ctx, list[i][0] - 0.5 * u, list[i][1] - 1.1 * u, list[i][2] * 0.86, list[i][3] * 0.78, list[i][4]); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); for (i = 0; i < list.length; i++) El(ctx, list[i][0] - list[i][2] * 0.3, list[i][1] - list[i][3] * 0.4, list[i][2] * 0.28, list[i][3] * 0.18, list[i][4]); ctx.fill();
    for (i = 1; i < st.length; i += 3) {
      var q2 = st[i], sd = (i % 2 ? -1 : 1) * 14 * u;
      tuft(ctx, q2[0] - Math.sin(q2[3]) * sd, q2[1] + Math.cos(q2[3]) * sd + 3 * u, 6 * u);
    }
  }
  function drawIcing(ctx, pts, hex, width, opt) {
    if (!pts || !pts.length) return;
    opt = opt || {};
    var c = pal(hex) || CREAM;
    var w = num(width, 22) || 22, wet = opt.wet == null ? 0.6 : clamp01(opt.wet), u = w / 22;
    var time = opt.time == null ? nowSec() : num(opt.time);
    var S = tmp(function (p) { polyPath(p, pts); });
    ctx.save();
    if (opt.alpha != null) ctx.globalAlpha *= clamp01(opt.alpha);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (opt.road) { drawRoad(ctx, pts, w, u, S, time); ctx.restore(); return; }
    // furrow: raised crumbly edges + the dark groove (darker when wet)
    ctx.lineWidth = w + 6 * u; ctx.strokeStyle = rgba(SOIL.crumb, 0.85); strokeS(ctx, S);
    ctx.lineWidth = w; ctx.strokeStyle = mix(SOIL.dark, SOIL.deep, wet); strokeS(ctx, S);
    var sm = samples(pts, ROW_STEP * u, 10 * u), L = sm.total || 0, n = sm.length, i;
    if (wet > 0.05 && n) {   // a few water glints near the fresh end
      ctx.fillStyle = 'rgba(220,240,255,' + (0.55 * wet).toFixed(3) + ')'; ctx.beginPath();
      for (i = 0; i < n; i++) { var q0 = sm[i]; if (L - q0[2] < 140 * u) El(ctx, q0[0] - 4 * u, q0[1] + 3 * u, 3 * u, 1.4 * u, q0[3]); }
      ctx.fill();
    }
    // plants: growth by distance from the END (the finger)
    var bloom = clamp01(opt.bloom), grown = opt.grown === true ? 1 : clamp01(opt.grown), brown = isBrown(c.base), list = [];
    for (i = 0; i < n; i++) {
      var q = sm[i], d = L - q[2];
      var g = d < 8 * u ? d / (8 * u) * 0.1 : d < 30 * u ? 0.12 + (d - 8 * u) / (22 * u) * 0.22 : d < 90 * u ? 0.35 + (d - 30 * u) / (60 * u) * 0.34 : Math.min(1, 0.7 + (d - 90 * u) / (24 * u) * 0.3);
      var ov = 1;
      if (grown > 0) g = Math.max(g, grown);
      if (bloom > 0) {   // a wave along the row, a little overshoot
        var b = clamp01(bloom * 1.6 - (n > 1 ? i / (n - 1) : 0) * 0.6);
        if (b > 0) { g = Math.max(g, Math.min(1, b * 1.4)); ov = 1 + 0.3 * Math.sin(Math.PI * b) * (b < 1 ? 1 : 0); }
      }
      list.push([q[0] + (hash(i + 9.1) - 0.5) * 3 * u, q[1], g, ov, i]);
    }
    if (n === 0) list.push([num(pts[0][0]), num(pts[0][1]), 0.02, 1, 0]);
    list.sort(function (a, b2) { return a[1] - b2[1]; });
    var m = null; try { m = ctx.getTransform ? ctx.getTransform() : null; } catch (e) { m = null; }
    var k = m && isFinite(m.a) ? Math.hypot(m.a, m.b) : 1;
    if (k * u < 0.42) {   // tiny (a rosette's mini picture): one coloured dot per plant, two fills
      ctx.fillStyle = STEM; ctx.beginPath();
      for (i = 0; i < list.length; i++) if (list[i][2] < 0.7) C(ctx, list[i][0], list[i][1] - 4 * u, (3 + 4 * list[i][2]) * u);
      ctx.fill();
      ctx.beginPath();
      for (i = 0; i < list.length; i++) if (list[i][2] >= 0.7) C(ctx, list[i][0], list[i][1] - 4 * u, 17 * u);
      ctx.lineWidth = 9 * u; ctx.strokeStyle = rgba(mix(c.light, '#FFFFFF', 0.4), 0.95); ctx.stroke();
      ctx.fillStyle = c.base; ctx.lineWidth = 3 * u; ctx.strokeStyle = c.dark; ctx.stroke(); ctx.fill();
      ctx.restore(); return;
    }
    var axis = m && Math.abs(m.b) < 1e-6 && Math.abs(m.c) < 1e-6 && m.a > 0 && Math.abs(m.a - m.d) < 1e-6 && canMake();
    var kq = Math.round(k * 20) / 20;
    if (axis) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); }
    for (i = 0; i < list.length; i++) {
      var P = list[i], idx = P[4];
      var vb = hash(idx + 0.5) * NROT, sway = Math.sin(time * 1.3 + idx * 0.9) * 0.9 * Math.min(1, P[2] * 1.5);
      var v = Math.max(0, Math.min(NROT - 1, Math.floor(vb + sway))), z = hash(idx + 4.2) > 0.5 ? 1 : 0;
      var qn = Math.round(P[2] * NSTAGE), qo = P[3] > 1 ? Math.min(4, Math.round((P[3] - 1) / 0.075)) : 0;
      var spr = plantSprite(c, brown, qn + (qn === NSTAGE ? qo : 0), v, z, u, axis ? kq : bucket(k * 1.05));
      if (axis && spr) ctx.drawImage(spr.c, Math.round(m.a * P[0] + m.e - spr.ax * kq), Math.round(m.d * P[1] + m.f - spr.ay * kq));
      else if (spr) ctx.drawImage(spr.c, P[0] - spr.ax, P[1] - spr.ay, spr.w, spr.h);
      else { ctx.save(); ctx.translate(P[0], P[1]); ctx.rotate((v - (NROT - 1) / 2) * ROT_STEP); plantVec(ctx, c, brown, P[2], u * (z ? 1.07 : 0.94), P[3]); ctx.restore(); }
    }
    if (axis) ctx.restore();
    ctx.restore();
  }

  // ================================================================ GUIDE (dots + start marker + badges)
  var arcOf = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function arcLengths(st) {
    var pts = st && st.pts; if (!pts || !pts.length) return [0];
    var hit = arcOf && arcOf.get(st);
    if (hit && hit.n === pts.length && hit.p === pts) return hit.L;
    var L = [0];
    for (var i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(num(pts[i][0]) - num(pts[i - 1][0]), num(pts[i][1]) - num(pts[i - 1][1])));
    if (arcOf) arcOf.set(st, { n: pts.length, p: pts, L: L });
    return L;
  }
  function at(pts, L, s) {
    var n = pts.length;
    if (n === 1) return { x: num(pts[0][0]), y: num(pts[0][1]), ang: 0 };
    var tot = L[n - 1]; s = Math.max(0, Math.min(tot, s));
    var lo = 0, hi = n - 1;
    while (hi - lo > 1) { var m = (lo + hi) >> 1; if (L[m] <= s) lo = m; else hi = m; }
    var seg = L[hi] - L[lo] || 1, t = (s - L[lo]) / seg, a = pts[lo], b = pts[hi];
    var ax = num(a[0]), ay = num(a[1]), bx = num(b[0]), by = num(b[1]);
    return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t, ang: Math.atan2(by - ay, bx - ax) };
  }
  function badge(ctx, x, y, n, a, f) {
    f = f || 1;
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(x, y); ctx.scale(f, f);
    ctx.fillStyle = 'rgba(30,15,5,0.45)'; ctx.beginPath(); C(ctx, 0, 2, 15.5); ctx.fill();
    ctx.fillStyle = '#F0D3A0'; ctx.beginPath(); C(ctx, 0, 0, 15); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#5A3A28'; ctx.stroke();
    ctx.fillStyle = '#5A3A28'; ctx.font = '900 19px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(n), 0, 1);
    ctx.restore();
  }
  function screenScale(ctx, opt) {
    if (opt && +opt.screenScale > 0) return +opt.screenScale;
    var m = null;
    try { m = ctx.getTransform ? ctx.getTransform() : null; } catch (e) { m = null; }
    if (!m || !isFinite(m.a) || !isFinite(m.b)) return 1;
    var dpr = (opt && +opt.dpr > 0) ? +opt.dpr : (typeof window !== 'undefined' && window.devicePixelRatio > 0 ? Math.min(3, window.devicePixelRatio) : 1);
    var k = Math.hypot(m.a, m.b) / dpr;
    return k > 0.01 && isFinite(k) ? k : 1;
  }
  function drawGuide(ctx, path, done, opt) {
    if (!path || !path.strokes || !path.strokes.length) return;
    opt = opt || {};
    var strokes = path.strokes, ns = strokes.length, cur = 0, d = 0, i, k;
    if (done && typeof done === 'object') { if (done.complete) return; cur = done.stroke | 0; d = num(done.done); }
    else {
      d = num(done);
      while (cur < ns) { var Lc = arcLengths(strokes[cur]); var len = Lc[Lc.length - 1]; if (d >= len - 0.01 && cur < ns - 1) { d -= len; cur++; } else break; }
      var LL = arcLengths(strokes[ns - 1]); if (cur === ns - 1 && d >= LL[LL.length - 1] - 0.01 && num(done) > 0) return;
    }
    if (cur >= ns) return;
    var time = opt.time == null ? nowSec() : num(opt.time);
    var ph = opt.pulse == null ? (time * 1.1) % 1 : num(opt.pulse) % 1, pw = Math.sin(ph * TAU);
    var glow = clamp01(opt.glow);
    var sc0 = screenScale(ctx, opt), DR = Math.max(7, 5.6 / sc0), RR = Math.max(24, 20.5 / sc0), f = RR / 24;
    var SP = Math.max(22, DR * 3.1), px = 1 / sc0;
    var EDGE = '#4A2F1F';   // dark soil rim: the cream centre carries the contrast on #6B4630
    ctx.save();
    if (opt.alpha != null) ctx.globalAlpha *= clamp01(opt.alpha);
    var dotsCur = [], dotsLater = [];
    for (k = cur; k < ns; k++) {
      var st = strokes[k], pts = st.pts; if (!pts || !pts.length) continue;
      var L = arcLengths(st), tot = L[L.length - 1], s0 = k === cur ? d + RR + DR * 0.6 : RR * 0.6 + DR, end = st.closed ? tot - DR * 2 : tot + 0.01;
      var first = Math.ceil(s0 / SP) * SP;
      var lastX = 1e9, lastY = 1e9, list = k === cur ? dotsCur : dotsLater, MIN2 = (SP * 0.62) * (SP * 0.62);
      for (var s = first; s <= end; s += SP) {
        var q = at(pts, L, s), dx = q.x - lastX, dy = q.y - lastY;
        if (dx * dx + dy * dy < MIN2) continue;
        list.push([q.x, q.y, s - d]); lastX = q.x; lastY = q.y;
      }
      if (!st.closed && tot - (k === cur ? d : 0) > RR + DR) { var qe = at(pts, L, tot), ex = qe.x - lastX, ey = qe.y - lastY; if (ex * ex + ey * ey > MIN2) list.push([qe.x, qe.y, tot - d]); }
    }
    if (glow > 0) {
      ctx.fillStyle = 'rgba(255,206,80,' + (0.55 * glow).toFixed(3) + ')'; ctx.beginPath();
      for (i = 0; i < dotsCur.length; i++) C(ctx, dotsCur[i][0], dotsCur[i][1], DR * 2.1);
      ctx.fill();
    }
    function dotPass(list, a, wave) {
      if (!list.length) return;
      var R = [], ring = Math.max(1.6 * px, DR * 0.24);
      for (i = 0; i < list.length; i++) {
        var r = DR;
        if (wave) { var z = list[i][2] / 260 - ph; z = z - Math.floor(z); r = DR * (1 + 0.28 * Math.max(0, 1 - Math.abs(z - 0.5) * 6)); }
        R.push(r);
      }
      ctx.fillStyle = 'rgba(30,15,5,' + (0.45 * a).toFixed(3) + ')'; ctx.beginPath();
      for (i = 0; i < list.length; i++) C(ctx, list[i][0] + 0.6 * f, list[i][1] + 1.8 * f, R[i] + ring * 0.5);
      ctx.fill();
      ctx.fillStyle = rgba(EDGE, a); ctx.beginPath();
      for (i = 0; i < list.length; i++) C(ctx, list[i][0], list[i][1], R[i]);
      ctx.fill();
      ctx.fillStyle = a < 1 ? 'rgba(255,248,232,' + a.toFixed(3) + ')' : '#FFF8E8'; ctx.beginPath();
      for (i = 0; i < list.length; i++) C(ctx, list[i][0], list[i][1], R[i] - ring);
      ctx.fill();
    }
    dotPass(dotsLater, 0.6, false);
    dotPass(dotsCur, 1, true);
    for (k = cur + 1; k < ns; k++) {
      var sk = strokes[k]; if (!sk.pts || !sk.pts.length) continue;
      var p0 = at(sk.pts, arcLengths(sk), 0), r0 = RR * 0.55;
      ctx.lineWidth = 6 * f; ctx.strokeStyle = rgba(EDGE, 0.85); ctx.beginPath(); C(ctx, p0.x, p0.y, r0); ctx.stroke();
      ctx.lineWidth = 3 * f; ctx.strokeStyle = 'rgba(255,248,232,0.95)'; ctx.stroke();
    }
    var cs = strokes[cur], Lc2 = arcLengths(cs), pS = at(cs.pts, Lc2, d), pA = at(cs.pts, Lc2, d + RR * 1.6);
    var rr0 = RR * (1 + 0.08 * pw);
    var gg = ctx.createRadialGradient(pS.x, pS.y, rr0 * 0.5, pS.x, pS.y, rr0 * 1.9);
    gg.addColorStop(0, 'rgba(255,231,168,' + (0.8 + 0.2 * glow).toFixed(3) + ')'); gg.addColorStop(1, 'rgba(255,231,168,0)');
    ctx.fillStyle = gg; ctx.beginPath(); C(ctx, pS.x, pS.y, rr0 * 1.9); ctx.fill();
    ctx.lineWidth = 8 * f; ctx.strokeStyle = 'rgba(30,15,5,0.4)'; ctx.beginPath(); C(ctx, pS.x + 0.8 * f, pS.y + 2.4 * f, rr0); ctx.stroke();
    ctx.beginPath(); C(ctx, pS.x, pS.y, rr0);
    ctx.fillStyle = 'rgba(255,' + Math.round(200 + 20 * pw) + ',' + Math.round(80 + 30 * pw) + ',' + (0.55 + 0.12 * pw).toFixed(3) + ')'; ctx.fill();
    ctx.lineWidth = 9 * f; ctx.strokeStyle = EDGE; ctx.stroke();
    ctx.lineWidth = 5 * f; ctx.strokeStyle = '#FFFFFF'; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); El(ctx, pS.x - rr0 * 0.3, pS.y - rr0 * 0.32, rr0 * 0.26, rr0 * 0.16, -0.6); ctx.fill();
    ctx.lineWidth = 3 * f; ctx.strokeStyle = 'rgba(255,255,255,' + (0.8 * (1 - ph)).toFixed(3) + ')'; ctx.beginPath(); C(ctx, pS.x, pS.y, rr0 * (1 + 0.6 * ph)); ctx.stroke();
    var tot2 = Lc2[Lc2.length - 1];
    if (tot2 - d > RR * 1.3) {
      var ad = d + RR * 1.6 + 6 * f * (0.5 + 0.5 * pw), pc = at(cs.pts, Lc2, Math.min(tot2, ad)), pc2 = at(cs.pts, Lc2, Math.min(tot2, ad + 8 * f));
      var ang = Math.atan2(pc2.y - pc.y, pc2.x - pc.x);
      if (!isFinite(ang) || (pc2.x === pc.x && pc2.y === pc.y)) ang = pA.ang;
      ctx.save(); ctx.translate(pc.x, pc.y); ctx.rotate(ang); ctx.scale(f, f);
      ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-7, -13); ctx.lineTo(-2, 0); ctx.lineTo(-7, 13); ctx.closePath();
      ctx.lineJoin = 'round'; ctx.lineWidth = 6; ctx.strokeStyle = EDGE; ctx.stroke();
      ctx.fillStyle = '#FFD15C'; ctx.fill();
      ctx.restore();
    }
    if (ns > 1) {
      for (k = cur; k < ns; k++) {
        var bk = strokes[k]; if (!bk.pts || !bk.pts.length) continue;
        var Lb = arcLengths(bk), pb = at(bk.pts, Lb, k === cur ? d : 0), pn = at(bk.pts, Lb, (k === cur ? d : 0) + 12), a2 = Math.atan2(pn.y - pb.y, pn.x - pb.x);
        if (!isFinite(a2)) a2 = 0;
        var off = (k === cur ? RR + 20 * f : RR * 0.55 + 18 * f), nx = Math.sin(a2), ny = -Math.cos(a2);
        if (ny > 0 || (Math.abs(ny) < 0.2 && nx > 0)) { nx = -nx; ny = -ny; }
        badge(ctx, pb.x + nx * off - Math.cos(a2) * 8 * f, pb.y + ny * off - Math.sin(a2) * 8 * f, k + 1, k === cur ? 1 : 0.75, f);
      }
    }
    ctx.restore();
  }

  // ================================================================ WATERING CAN
  // Built in an upright frame (body centre 0,0, spout to the right), then tipped by TILT about the spout tip so that, at
  // angle 0, the tip is the origin and the can sits above-left of it.
  var CAN_TIP = [0.5, -0.1], TILT = 0.95;   // upright frame (× size); tilt (rad, clockwise)
  function canTipped(x, y, extra) {   // upright (× size) → tip-relative (× size)
    var a = TILT + (extra || 0), dx = x - CAN_TIP[0], dy = y - CAN_TIP[1];
    return [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)];
  }
  var CAN_CENTER = canTipped(0, 0), CAN_GRIP = canTipped(-0.02, -0.36);
  function drawIcingBag(ctx, hex, size, angle, opt) {
    opt = opt || {};
    var s = num(size, 120) || 120;
    var empty = !!opt.empty || !hex, c = empty ? CREAM : (pal(hex) || CREAM);
    var sq = clamp01(opt.squeeze), lift = clamp01(opt.lift), wob = num(opt.wob), glow = clamp01(opt.glow), sel = amt(opt.selected), dim = amt(opt.dim);
    var time = opt.time == null ? nowSec() : num(opt.time);
    var lw = Math.max(1.4, s * 0.022);
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (dim) ctx.globalAlpha *= 1 - 0.5 * dim;
    if (opt.center) ctx.translate(-CAN_CENTER[0] * s, -CAN_CENTER[1] * s);
    ctx.rotate(num(angle));
    ctx.translate(wob * 0.4, -s * 0.12 * lift); ctx.rotate(wob * 0.015);
    // water drops falling from the tip while pouring (screen-down in the can frame is fine: short drops)
    if (sq > 0.05 && !empty) {
      ctx.fillStyle = 'rgba(190,230,255,0.95)'; ctx.strokeStyle = 'rgba(50,110,160,0.85)'; ctx.lineWidth = Math.max(0.8, lw * 0.5);
      for (var dI = 0; dI < 5; dI++) {
        var ph = (time * 2.6 + dI * 0.25) % 1, dx2 = (dI - 1.5) * s * 0.05 + ph * s * 0.03, dy2 = s * (0.03 + ph * 0.26), r = s * 0.028 * (1 - ph * 0.35) * (0.6 + 0.4 * sq);
        ctx.beginPath(); ctx.moveTo(dx2, dy2 - r * 2); ctx.quadraticCurveTo(dx2 + r, dy2 - r * 0.2, dx2, dy2 + r); ctx.quadraticCurveTo(dx2 - r, dy2 - r * 0.2, dx2, dy2 - r * 2); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
    var ls = 1 + 0.05 * lift + 0.04 * sel;
    ctx.scale(ls, ls);
    if (glow > 0) {
      var pg = 0.7 + 0.3 * Math.sin(time * 6), gcx = CAN_CENTER[0] * s, gcy = CAN_CENTER[1] * s, hg = ctx.createRadialGradient(gcx, gcy, s * 0.15, gcx, gcy, s * 0.62);
      hg.addColorStop(0, 'rgba(255,214,90,' + (0.6 * glow * pg).toFixed(3) + ')'); hg.addColorStop(1, 'rgba(255,214,90,0)');
      ctx.fillStyle = hg; ctx.beginPath(); C(ctx, gcx, gcy, s * 0.62); ctx.fill();
    }
    // into the upright frame
    ctx.save(); ctx.rotate(TILT + sq * 0.18); ctx.translate(-CAN_TIP[0] * s, -CAN_TIP[1] * s);
    // handle (behind, over the top)
    var handle = function (p) { p.moveTo(-s * 0.2, -s * 0.16); p.bezierCurveTo(-s * 0.22, -s * 0.44, s * 0.16, -s * 0.44, s * 0.14, -s * 0.16); };
    line(ctx, handle, TIN.line, s * 0.07 + 2 * lw); line(ctx, handle, TIN.shade, s * 0.07); line(ctx, handle, TIN.light, s * 0.02);
    // back handle
    var bh = function (p) { p.moveTo(-s * 0.24, -s * 0.1); p.bezierCurveTo(-s * 0.4, -s * 0.08, -s * 0.4, s * 0.12, -s * 0.24, s * 0.12); };
    line(ctx, bh, TIN.line, s * 0.055 + 2 * lw); line(ctx, bh, TIN.shade, s * 0.055);
    // spout
    var spout = function (p) { p.moveTo(s * 0.14, s * 0.1); p.lineTo(s * 0.46, -s * 0.12); p.lineTo(s * 0.49, -s * 0.07); p.lineTo(s * 0.2, s * 0.17); p.closePath(); };
    part(ctx, spout, TIN.shade, TIN.line, lw);
    // the rose (sprinkler head)
    ctx.save(); ctx.translate(CAN_TIP[0] * s, CAN_TIP[1] * s); ctx.rotate(-0.62);
    part(ctx, function (p) { p.moveTo(-s * 0.04, -s * 0.03); p.lineTo(s * 0.03, -s * 0.065); p.lineTo(s * 0.03, s * 0.065); p.lineTo(-s * 0.04, s * 0.03); p.closePath(); }, TIN.base, TIN.line, lw);
    part(ctx, function (p) { El(p, s * 0.03, 0, s * 0.018, s * 0.065); }, TIN.light, TIN.line, lw * 0.8);
    ctx.fillStyle = TIN.line; ctx.beginPath(); for (var h = -2; h <= 2; h++) C(ctx, s * 0.032, h * s * 0.022, s * 0.005); ctx.fill();
    ctx.restore();
    // body (a rounded drum seen from the side)
    var body = function (p) { rr(p, -s * 0.25, -s * 0.18, s * 0.47, s * 0.37, s * 0.08); };
    ctx.beginPath(); body(ctx);
    var bg = ctx.createLinearGradient(-s * 0.25, 0, s * 0.22, 0);
    bg.addColorStop(0, TIN.light); bg.addColorStop(0.35, TIN.base); bg.addColorStop(1, TIN.shade);
    ctx.fillStyle = bg; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = TIN.line; ctx.stroke();
    // top lid ellipse + rim at the bottom
    part(ctx, function (p) { El(p, -s * 0.015, -s * 0.18, s * 0.2, s * 0.04); }, TIN.light, TIN.line, lw * 0.9);
    part(ctx, function (p) { El(p, -s * 0.03, -s * 0.18, s * 0.11, s * 0.02); }, mix(TIN.shade, TIN.line, 0.4), null, 0);
    // colour band + flower decal
    ctx.save(); ctx.beginPath(); body(ctx); ctx.clip();
    part(ctx, function (p) { p.rect(-s * 0.3, s * 0.06, s * 0.6, s * 0.1); }, c.base, c.dark, lw * 0.8);
    ctx.restore();
    ctx.save(); ctx.translate(-s * 0.03, -s * 0.03);
    ctx.fillStyle = c.base; ctx.strokeStyle = c.dark; ctx.lineWidth = lw * 0.8; ctx.beginPath();
    for (var i = 0; i < 5; i++) { var a = -Math.PI / 2 + i * TAU / 5; El(ctx, Math.cos(a) * s * 0.055, Math.sin(a) * s * 0.055, s * 0.048, s * 0.036, a); }
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = isBrown(c.base) ? CENTRE_BROWN : CENTRE; ctx.beginPath(); C(ctx, 0, 0, s * 0.03); ctx.fill();
    ctx.restore();
    // sheen
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); rr(ctx, -s * 0.2, -s * 0.12, s * 0.035, s * 0.24, s * 0.017); ctx.fill();
    ctx.restore();
    if (sel > 0) { ctx.save(); ctx.translate(CAN_CENTER[0] * s, CAN_CENTER[1] * s); selRing(ctx, s * 0.44, s * 0.4, sel, time); ctx.restore(); }
    ctx.restore();
  }

  // ================================================================ SEED PACKET
  function drawPacket(ctx, hex, size, opt) {
    opt = opt || {};
    var s = num(size, 120) || 120, c = pal(hex) || CREAM;
    var lift = clamp01(opt.lift), wob = num(opt.wob), glow = clamp01(opt.glow), sel = amt(opt.selected), dim = amt(opt.dim);
    var time = opt.time == null ? nowSec() : num(opt.time);
    var w = s * 0.72, h = s * 0.92, x = -w / 2, y = -h / 2, lw = Math.max(1.4, s * 0.02);
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (dim) ctx.globalAlpha *= 1 - 0.3 * dim;
    // shadow on the grass
    ctx.fillStyle = rgba('#2E4A1E', 0.22 * (1 - 0.5 * lift)); ctx.beginPath(); El(ctx, wob * 0.5, h / 2 + s * 0.03, w * 0.5 * (1 - 0.15 * lift), s * 0.05); ctx.fill();
    ctx.translate(wob, -s * 0.1 * lift); ctx.rotate(wob * 0.012 - 0.04);
    var ls = 1 + 0.05 * lift + 0.03 * sel; ctx.scale(ls, ls);
    var S = shape('pk|' + Math.round(s * 2) / 2, function (p) {
      p.moveTo(x + s * 0.03, y + s * 0.03);
      for (var i = 0; i <= 9; i++) p.lineTo(x + s * 0.03 + (w - s * 0.06) * i / 9, y + (i % 2 ? 0 : s * 0.03));
      p.lineTo(x + w - s * 0.01, y + h * 0.2); p.lineTo(x + w, y + h - s * 0.04); p.quadraticCurveTo(x + w, y + h, x + w - s * 0.04, y + h);
      p.lineTo(x + s * 0.04, y + h); p.quadraticCurveTo(x, y + h, x, y + h - s * 0.04); p.lineTo(x + s * 0.01, y + h * 0.2); p.closePath();
    });
    if (glow > 0) glowStroke(ctx, S, s, glow, time);
    ctx.lineWidth = lw * 2; ctx.strokeStyle = '#9A7E58'; strokeS(ctx, S);
    ctx.fillStyle = '#E8D8B8'; fillS(ctx, S);
    ctx.save(); clipS(ctx, S);
    ctx.fillStyle = '#FBF3E2'; ctx.fillRect(x - s * 0.02, y - s * 0.02, w * 0.92, h);
    // colour band at the top (crimped) + bottom stripe
    ctx.fillStyle = c.base; ctx.fillRect(x - 2, y - 2, w + 4, h * 0.2 + 2);
    ctx.fillStyle = c.dark; ctx.fillRect(x - 2, y + h * 0.2, w + 4, s * 0.014);
    ctx.strokeStyle = rgba(c.dark, 0.6); ctx.lineWidth = Math.max(0.8, s * 0.01); ctx.beginPath();
    for (var k = 1; k < 9; k++) { var cx = x + w * k / 9; ctx.moveTo(cx, y + s * 0.02); ctx.lineTo(cx, y + h * 0.14); }
    ctx.stroke();
    ctx.fillStyle = c.base; ctx.fillRect(x - 2, y + h * 0.86, w + 4, h * 0.14 + 2);
    ctx.fillStyle = rgba(c.light, 0.8); ctx.beginPath(); for (k = 0; k < 6; k++) El(ctx, x + w * (0.12 + k * 0.155), y + h * 0.93, s * 0.03, s * 0.02, 0.5); ctx.fill();
    // picture window: soft sky + the flower in the packet colour
    var wx = x + w * 0.12, wy = y + h * 0.27, ww = w * 0.76, wh = h * 0.54;
    ctx.beginPath(); rr(ctx, wx, wy, ww, wh, s * 0.05);
    var sg = ctx.createLinearGradient(0, wy, 0, wy + wh); sg.addColorStop(0, '#DFF1F6'); sg.addColorStop(1, '#F4FAEF');
    ctx.fillStyle = sg; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = '#B9DB98'; ctx.beginPath(); El(ctx, 0, wy + wh * 1.02, ww * 0.7, wh * 0.22); ctx.fill();
    ctx.translate(0, wy + wh * 0.9); drawPlant(ctx, c.base, 1, s * 0.019, 0);
    ctx.restore();
    ctx.beginPath(); rr(ctx, wx, wy, ww, wh, s * 0.05); ctx.lineWidth = lw; ctx.strokeStyle = rgba(c.dark, 0.85); ctx.stroke();
    // paper light + fold shade
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x, y, w * 0.08, h);
    ctx.fillStyle = 'rgba(120,90,50,0.12)'; ctx.fillRect(x + w * 0.9, y, w * 0.1, h);
    ctx.restore();
    ctx.lineWidth = lw; ctx.strokeStyle = '#9A7E58'; strokeS(ctx, S);
    if (dim) { ctx.fillStyle = 'rgba(246,238,226,' + (0.5 * dim).toFixed(3) + ')'; fillS(ctx, S); }
    if (sel > 0) selRing(ctx, s * 0.5, s * 0.6, sel, time);
    ctx.restore();
  }

  // ================================================================ GARDEN BED (tray) + FENCE (rack)
  function soilTexture(g, w, h) {
    var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#5E3D29'); gr.addColorStop(0.25, SOIL.soil); gr.addColorStop(1, '#654230');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    var n = Math.round(w * h / 700), i;
    g.fillStyle = rgba(SOIL.dark, 0.5); g.beginPath();
    for (i = 0; i < n * 0.6; i++) El(g, hash(i * 2.1) * w, hash(i * 3.7 + 1) * h, 2 + hash(i) * 4, 1.2 + hash(i + 2) * 2, hash(i + 5) * 3);
    g.fill();
    g.fillStyle = rgba(SOIL.crumb, 0.6); g.beginPath();
    for (i = 0; i < n; i++) C(g, hash(i * 5.3 + 7) * w, hash(i * 1.9 + 3) * h, 0.8 + hash(i + 11) * 1.8);
    g.fill();
    g.fillStyle = rgba(SOIL.light, 0.5); g.beginPath();
    for (i = 0; i < n * 0.3; i++) El(g, hash(i * 7.7 + 2) * w, hash(i * 4.1 + 9) * h, 3 + hash(i + 1) * 5, 2 + hash(i + 3) * 2.5, hash(i + 8) * 3);
    g.fill();
    for (i = 0; i < 9; i++) {   // a few pebbles near the edges
      var px = hash(i * 13.1 + 5), py = hash(i * 17.3 + 2);
      if (px > 0.2 && px < 0.8 && py > 0.2 && py < 0.8) px = px < 0.5 ? px * 0.3 : 1 - (1 - px) * 0.3;
      var X = px * w, Y = py * h, r = 3 + hash(i + 40) * 3;
      g.fillStyle = 'rgba(30,15,5,0.35)'; g.beginPath(); El(g, X + 0.6, Y + 1.4, r * 1.2, r * 0.8, 0); g.fill();
      g.fillStyle = STONE_DK; g.beginPath(); El(g, X, Y, r * 1.2, r * 0.85, 0.3); g.fill();
      g.fillStyle = STONE; g.beginPath(); El(g, X - 0.4, Y - 0.6, r * 0.9, r * 0.6, 0.3); g.fill();
    }
    var sh = g.createLinearGradient(0, 0, 0, Math.min(36, h * 0.1)); sh.addColorStop(0, 'rgba(20,10,4,0.45)'); sh.addColorStop(1, 'rgba(20,10,4,0)');
    g.fillStyle = sh; g.fillRect(0, 0, w, Math.min(36, h * 0.1));
    var sl = g.createLinearGradient(0, 0, Math.min(24, w * 0.05), 0); sl.addColorStop(0, 'rgba(20,10,4,0.3)'); sl.addColorStop(1, 'rgba(20,10,4,0)');
    g.fillStyle = sl; g.fillRect(0, 0, Math.min(24, w * 0.05), h);
  }
  function plank(ctx, x, y, w, h, seed, vertical) {
    ctx.beginPath(); rr(ctx, x, y, w, h, Math.min(w, h) * 0.18);
    var g = vertical ? ctx.createLinearGradient(x, 0, x + w, 0) : ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, BED.light); g.addColorStop(0.35, BED.wood); g.addColorStop(1, BED.shade);
    ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = BED.outline; ctx.stroke();
    ctx.save(); ctx.clip();
    ctx.lineWidth = 1.2; ctx.strokeStyle = rgba(BED.shade, 0.7); ctx.beginPath();
    for (var i = 0; i < 3; i++) {
      var t = 0.25 + i * 0.25 + (hash(seed + i) - 0.5) * 0.08;
      if (vertical) { var gx = x + w * t; ctx.moveTo(gx, y); ctx.bezierCurveTo(gx + w * 0.06, y + h * 0.3, gx - w * 0.06, y + h * 0.7, gx + w * 0.02, y + h); }
      else { var gy = y + h * t; ctx.moveTo(x, gy); ctx.bezierCurveTo(x + w * 0.3, gy + h * 0.06, x + w * 0.7, gy - h * 0.06, x + w, gy + h * 0.02); }
    }
    ctx.stroke();
    var kx = vertical ? x + w * 0.5 : x + w * (0.2 + hash(seed) * 0.6), ky = vertical ? y + h * (0.2 + hash(seed) * 0.6) : y + h * 0.5;
    ctx.fillStyle = rgba(BED.shade, 0.8); ctx.beginPath(); El(ctx, kx, ky, vertical ? w * 0.12 : 6, vertical ? 6 : h * 0.12, 0); ctx.fill();
    ctx.restore();
  }
  function drawTray(ctx, box, opt) {
    if (!box) return;
    opt = opt || {};
    var x = num(box.x), y = num(box.y), w = num(box.w), h = num(box.h);
    if (!(w > 0 && h > 0)) return;
    var time = opt.time == null ? nowSec() : num(opt.time);
    var F = Math.max(8, Math.min(num(opt.frame, 26) || 26, Math.min(w, h) * 0.08));
    var X = x - F, Y = y - F, WW = w + 2 * F, HH = h + 2 * F;
    ctx.save();
    ctx.lineJoin = 'round';
    // ground shadow
    ctx.fillStyle = 'rgba(40,60,20,0.22)'; ctx.beginPath(); rr(ctx, X - 4, Y + F * 0.6, WW + 8, HH + F * 0.2, F); ctx.fill();
    if (opt.glow > 0) {
      var gl = clamp01(opt.glow), pu = 0.65 + 0.35 * Math.sin(time * 5);
      ctx.beginPath(); rr(ctx, X - 7, Y - 7, WW + 14, HH + 14, F + 7);
      ctx.lineWidth = 14; ctx.strokeStyle = 'rgba(255,206,70,' + (0.55 * gl * pu).toFixed(3) + ')'; ctx.stroke();
    }
    // front face of the raised bed (a darker plank band below the frame)
    var fd = F * 0.45;
    ctx.fillStyle = BED.shade; ctx.beginPath(); rr(ctx, X, Y + HH - F * 0.4, WW, F * 0.4 + fd, F * 0.25); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = BED.outline; ctx.stroke();
    // soil
    var kb = bucket(devScale(ctx)), spr = null;
    if (canMake() && w * h * kb * kb < 6e6) spr = sprite('soil|' + Math.round(w) + '|' + Math.round(h) + '|' + kb, w, h, kb, function (g) { soilTexture(g, w, h); });
    ctx.save(); ctx.beginPath(); ctx.rect(x - 1, y - 1, w + 2, h + 2); ctx.clip(); ctx.translate(x, y);
    if (spr) ctx.drawImage(spr.c, 0, 0, w, h); else soilTexture(ctx, w, h);
    ctx.restore();
    // planks: top + bottom across, sides between, corner posts
    plank(ctx, X, Y, WW, F, 1, false);
    plank(ctx, X, y + h, WW, F, 2, false);
    plank(ctx, X, y - 1, F, h + 2, 3, true);
    plank(ctx, x + w, y - 1, F, h + 2, 4, true);
    var pw = F * 1.15;
    [[X - F * 0.08, Y - F * 0.08], [X + WW - pw + F * 0.08, Y - F * 0.08], [X - F * 0.08, Y + HH - pw + F * 0.08], [X + WW - pw + F * 0.08, Y + HH - pw + F * 0.08]].forEach(function (q, i) {
      ctx.beginPath(); rr(ctx, q[0], q[1], pw, pw, pw * 0.22);
      ctx.fillStyle = BED.wood; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = BED.outline; ctx.stroke();
      ctx.fillStyle = BED.light; ctx.beginPath(); rr(ctx, q[0] + pw * 0.14, q[1] + pw * 0.14, pw * 0.72, pw * 0.72, pw * 0.18); ctx.fill();
      ctx.strokeStyle = rgba(BED.shade, 0.8); ctx.lineWidth = 1.2; ctx.beginPath(); C(ctx, q[0] + pw / 2, q[1] + pw / 2, pw * 0.22); C(ctx, q[0] + pw / 2, q[1] + pw / 2, pw * 0.1); ctx.stroke();
    });
    nailHeads(ctx, [[X + pw + F * 0.3, Y + F / 2], [X + WW - pw - F * 0.3, Y + F / 2], [X + pw + F * 0.3, y + h + F / 2], [X + WW - pw - F * 0.3, y + h + F / 2],
      [X + F / 2, Y + pw + F * 0.3], [X + F / 2, y + h - F * 0.3], [x + w + F / 2, Y + pw + F * 0.3], [x + w + F / 2, y + h - F * 0.3]], Math.max(1.4, F * 0.08));
    // a soft inner edge line on the soil
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(30,15,5,0.4)'; ctx.strokeRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5);
    ctx.restore();
  }
  function drawRack(ctx, rack, opt) {
    if (!rack) return;
    var x = num(rack.x), y = num(rack.y), w = num(rack.w), h = num(rack.h);
    if (!(w > 0 && h > 0)) return;
    var lw = Math.max(1.5, Math.min(3, h * 0.03)), pk = Math.max(8, Math.min(22, h * 0.2)), gap = pk * 0.7, i;
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.fillStyle = 'rgba(40,60,20,0.18)'; ctx.beginPath(); El(ctx, x + w / 2, y + h, w * 0.52, Math.max(4, h * 0.06)); ctx.fill();
    // rails (behind the pickets)
    [0.3, 0.72].forEach(function (t) {
      var ry = y + h * t - h * 0.06;
      ctx.beginPath(); rr(ctx, x - pk * 0.2, ry, w + pk * 0.4, h * 0.12, h * 0.03);
      ctx.fillStyle = FENCE.shade; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = FENCE.outline; ctx.stroke();
      ctx.fillStyle = rgba(FENCE.light, 0.7); ctx.fillRect(x, ry + h * 0.02, w, h * 0.025);
    });
    var n = Math.max(2, Math.floor((w + gap) / (pk + gap))), step = (w - pk) / (n - 1);
    for (i = 0; i < n; i++) {
      var px = x + i * step, top = y + (i % 2 ? h * 0.04 : 0);
      ctx.beginPath();
      ctx.moveTo(px, y + h); ctx.lineTo(px, top + pk * 0.5); ctx.quadraticCurveTo(px, top, px + pk / 2, top - pk * 0.05); ctx.quadraticCurveTo(px + pk, top, px + pk, top + pk * 0.5); ctx.lineTo(px + pk, y + h); ctx.closePath();
      ctx.fillStyle = FENCE.wood; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = FENCE.outline; ctx.stroke();
      ctx.fillStyle = rgba(FENCE.light, 0.85); ctx.fillRect(px + pk * 0.18, top + pk * 0.4, pk * 0.16, h - pk * 0.6);
      ctx.fillStyle = rgba(FENCE.shade, 0.7); ctx.fillRect(px + pk * 0.72, top + pk * 0.4, pk * 0.14, h - pk * 0.5);
    }
    // grass along the foot
    for (i = 0; i < n; i += 2) tuft(ctx, x + i * step + pk * 0.5 + (hash(i) - 0.5) * pk, y + h + 1, Math.min(14, h * 0.14));
    ctx.restore();
  }

  // ================================================================ CARROT, PETAL, PUFF
  function drawChip(ctx, r, opt) {
    r = num(r, 15) || 15; opt = opt || {};
    var q = opt.squash != null ? Math.max(0.3, num(opt.squash, 1)) : 1, gr = opt.grow == null ? 1 : clamp01(opt.grow);
    var lw = Math.max(1, r * 0.1);
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.translate(0, r * (1 - q) * 0.5); ctx.scale(1 + (1 - q) * 0.6, q);
    // soil mound (back half)
    ctx.fillStyle = 'rgba(30,15,5,0.4)'; ctx.beginPath(); El(ctx, r * 0.1, r * 0.45, r * 1.25, r * 0.45); ctx.fill();
    ctx.fillStyle = SOIL.light; ctx.beginPath(); El(ctx, 0, r * 0.3, r * 1.15, r * 0.36); ctx.fill();
    ctx.lineWidth = lw * 0.8; ctx.strokeStyle = SOIL.dark; ctx.stroke();
    ctx.fillStyle = '#2E1C12'; ctx.beginPath(); El(ctx, 0, r * 0.22, r * 0.7, r * 0.2); ctx.fill();
    // leaves (first), then the orange shoulder rising
    var gl = clamp01(gr / 0.45), go = clamp01((gr - 0.3) / 0.7), up = r * 1.15 * go;
    if (gl > 0) {
      ctx.save(); ctx.translate(0, r * 0.15 - up);
      var L = r * (0.45 + 0.75 * gl);
      [[-0.45, 0.95], [0, 1.15], [0.45, 0.95]].forEach(function (f) {
        ctx.save(); ctx.rotate(f[0]);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -L * f[1]);
        ctx.lineWidth = r * 0.16 + lw * 1.2; ctx.strokeStyle = STEM_DK; ctx.stroke();
        ctx.lineWidth = r * 0.16; ctx.strokeStyle = STEM; ctx.stroke();
        ctx.fillStyle = STEM; ctx.strokeStyle = STEM_DK; ctx.lineWidth = lw * 0.8; ctx.beginPath();
        for (var k = 1; k <= 3; k++) { var yy = -L * f[1] * (0.35 + k * 0.2); El(ctx, -r * 0.16, yy, r * 0.2, r * 0.1, -0.6); El(ctx, r * 0.16, yy, r * 0.2, r * 0.1, 0.6); }
        ctx.fill(); ctx.stroke();
        ctx.restore();
      });
      ctx.restore();
    }
    if (go > 0) {
      ctx.save(); ctx.beginPath(); ctx.rect(-r * 2, -r * 4, r * 4, r * 4 + r * 0.34); ctx.clip();   // the soil hides the root
      ctx.translate(0, r * 0.4 - up);
      ctx.beginPath(); ctx.moveTo(-r * 0.62, r * 0.05); ctx.bezierCurveTo(-r * 0.66, -r * 0.4, -r * 0.3, -r * 0.5, 0, -r * 0.5); ctx.bezierCurveTo(r * 0.3, -r * 0.5, r * 0.66, -r * 0.4, r * 0.62, r * 0.05); ctx.lineTo(r * 0.36, r * 1.3); ctx.lineTo(-r * 0.36, r * 1.3); ctx.closePath();
      var cg = ctx.createLinearGradient(-r * 0.62, 0, r * 0.62, 0); cg.addColorStop(0, CARROT.light); cg.addColorStop(0.4, CARROT.base); cg.addColorStop(1, CARROT.dark);
      ctx.fillStyle = cg; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = mix(CARROT.dark, '#5A2A0E', 0.3); ctx.stroke();
      ctx.strokeStyle = rgba(CARROT.dark, 0.75); ctx.lineWidth = lw * 0.8; ctx.beginPath(); ctx.moveTo(-r * 0.4, -r * 0.05); ctx.lineTo(-r * 0.12, -r * 0.02); ctx.moveTo(r * 0.15, r * 0.3); ctx.lineTo(r * 0.42, r * 0.27); ctx.stroke();
      ctx.fillStyle = 'rgba(255,240,215,0.6)'; ctx.beginPath(); El(ctx, -r * 0.3, -r * 0.28, r * 0.14, r * 0.08, -0.5); ctx.fill();
      ctx.restore();
    }
    // soil lip in front
    ctx.fillStyle = SOIL.light; ctx.beginPath(); ctx.moveTo(-r * 1.15, r * 0.3); ctx.quadraticCurveTo(0, r * 0.52, r * 1.15, r * 0.3); ctx.quadraticCurveTo(r * 0.8, r * 0.66, 0, r * 0.66); ctx.quadraticCurveTo(-r * 0.8, r * 0.66, -r * 1.15, r * 0.3); ctx.closePath(); ctx.fill();
    ctx.lineWidth = lw * 0.8; ctx.strokeStyle = SOIL.dark; ctx.stroke();
    ctx.fillStyle = rgba(SOIL.crumb, 0.9); ctx.beginPath(); C(ctx, -r * 0.6, r * 0.45, r * 0.09); C(ctx, r * 0.5, r * 0.5, r * 0.08); C(ctx, r * 0.05, r * 0.6, r * 0.07); ctx.fill();
    ctx.restore();
  }
  function drawSprinkle(ctx, hex, len, rot) {
    var c = pal(hex) || { base: '#FFFFFF', dark: '#C9B89C', light: '#FFFFFF' }, L = num(len, 12) || 12;
    ctx.save(); ctx.rotate(num(rot)); ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-L * 0.5, 0); ctx.bezierCurveTo(-L * 0.2, -L * 0.42, L * 0.35, -L * 0.36, L * 0.5, 0); ctx.bezierCurveTo(L * 0.35, L * 0.36, -L * 0.2, L * 0.42, -L * 0.5, 0); ctx.closePath();
    ctx.fillStyle = c.base; ctx.fill(); ctx.lineWidth = Math.max(0.8, L * 0.07); ctx.strokeStyle = c.dark; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-L * 0.35, 0); ctx.quadraticCurveTo(0, -L * 0.06, L * 0.3, -L * 0.02);
    ctx.lineWidth = Math.max(0.6, L * 0.06); ctx.strokeStyle = rgba(c.light, 0.9); ctx.stroke();
    ctx.restore();
  }
  function drawFlourPuff(ctx, r, t) {
    r = num(r, 40) || 40; t = clamp01(t);
    if (t >= 1) return;
    var e = 1 - Math.pow(1 - t, 3), a = Math.pow(1 - t, 1.3), i;
    ctx.save(); ctx.lineCap = 'round';
    ctx.fillStyle = 'rgba(236,220,186,' + (0.7 * a).toFixed(3) + ')'; ctx.beginPath();
    for (i = 0; i < 7; i++) { var an = i * 0.9 + 0.4, d = r * (0.2 + 0.55 * e), cr = r * (0.3 - 0.1 * t) * (0.8 + 0.25 * (i % 3) / 2); C(ctx, Math.cos(an) * d, Math.sin(an) * d * 0.7 - r * 0.15 * e, cr); }
    ctx.fill();
    // straw bits flying out
    for (i = 0; i < 9; i++) {
      var b = i * 0.7 + 0.3, dd = r * (0.3 + 0.9 * e) * (0.8 + 0.4 * hash(i)), ln = r * 0.28 * (1 - 0.4 * t), sx = Math.cos(b) * dd, sy = Math.sin(b) * dd * 0.8 - r * 0.25 * e + r * 0.4 * t * t, rot = b + t * 4 * (i % 2 ? 1 : -1);
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(rot);
      ctx.lineWidth = Math.max(1.5, r * 0.07); ctx.strokeStyle = 'rgba(155,120,50,' + (0.8 * a).toFixed(3) + ')'; ctx.beginPath(); ctx.moveTo(-ln / 2, 0); ctx.lineTo(ln / 2, 0); ctx.stroke();
      ctx.lineWidth = Math.max(1, r * 0.045); ctx.strokeStyle = 'rgba(240,214,140,' + a.toFixed(3) + ')'; ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  // ================================================================ ICONS
  function drawIcon(ctx, thing, size) {
    if (!thing) return;
    var s = num(size, 100) || 100, c;
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    switch (thing.kind) {
      case 'blob': {   // one big flower of that colour
        c = pal(thing.color) || CREAM;
        ctx.fillStyle = 'rgba(60,90,30,0.18)'; ctx.beginPath(); El(ctx, 0, s * 0.42, s * 0.26, s * 0.05); ctx.fill();
        ctx.translate(0, s * 0.4); drawPlant(ctx, c.base, 1, s * 0.03, 0);
        break;
      }
      case 'shape': {
        c = pal(thing.color);
        if (!c) { drawCookie(ctx, { kind: 'shape', shape: thing.shape }, s * 0.82, { time: 0, look: 'sign' }); break; }
        var f = SHAPE_B[thing.shape] || SHAPE_B.circle, k = s * 0.78;
        var p = function (pp) { f(pp, k); };
        ctx.save(); ctx.translate(0, s * 0.03); part(ctx, p, 'rgba(60,40,20,0.22)', null, 0); ctx.restore();
        ctx.beginPath(); p(ctx); ctx.lineWidth = Math.max(4, s * 0.07); ctx.strokeStyle = c.dark; ctx.stroke();
        ctx.fillStyle = c.base; ctx.fill();
        ctx.save(); ctx.clip();
        var hg = ctx.createRadialGradient(-s * 0.16, -s * 0.18, 0, -s * 0.16, -s * 0.18, s * 0.32);
        hg.addColorStop(0, 'rgba(255,255,255,0.55)'); hg.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = hg; ctx.fillRect(-s / 2, -s / 2, s, s);
        ctx.restore();
        break;
      }
      case 'animal': drawCookie(ctx, { kind: 'animal', animal: thing.animal }, s * 0.9, { time: 0, look: 'bed' }); break;
      case 'home': drawCookie(ctx, { kind: 'home', home: thing.home }, s * 0.9, { time: 0, look: 'bed' }); break;
      case 'number': drawCookie(ctx, { kind: 'glyph', text: String(thing.n) }, s * 0.95, { time: 0, look: 'bed' }); break;
      case 'letter': drawCookie(ctx, { kind: 'glyph', text: String(thing.text) }, s * 0.95, { time: 0, look: 'bed' }); break;
      case 'size': {
        var small = thing.size === 'small';
        if (thing.animal) { var cs = s * (small ? 0.5 : 0.92); ctx.translate(0, small ? s * 0.2 : 0); drawCookie(ctx, { kind: 'animal', animal: thing.animal }, cs, { time: 0, look: 'bed' }); break; }
        ctx.fillStyle = 'rgba(60,90,30,0.18)'; ctx.beginPath(); El(ctx, 0, s * 0.42, s * (small ? 0.14 : 0.28), s * 0.05); ctx.fill();
        ctx.translate(0, s * 0.4); drawPlant(ctx, '#FF8FC0', 1, s * (small ? 0.015 : 0.03), 0);
        break;
      }
      case 'dots': {   // n carrots in a dice-like layout (rows of ≤ 4 up to 10, then a grid of 5) on a light soil tile
        var n = Math.max(0, Math.min(20, thing.n | 0));
        var ROWS = { 0: [], 1: [1], 2: [2], 3: [3], 4: [2, 2], 5: [2, 1, 2], 6: [3, 3], 7: [3, 1, 3], 8: [3, 2, 3], 9: [3, 3, 3], 10: [4, 2, 4] };
        var rowsN = ROWS[n]; if (!rowsN) { rowsN = []; for (var left = n; left > 0; left -= 5) rowsN.push(Math.min(5, left)); }
        var maxC = Math.max(1, Math.max.apply(null, rowsN.concat([1]))), nr = Math.max(1, rowsN.length);
        ctx.fillStyle = 'rgba(60,40,20,0.2)'; ctx.beginPath(); rr(ctx, -s * 0.47, -s * 0.44, s * 0.94, s * 0.92, s * 0.12); ctx.fill();
        ctx.fillStyle = '#B08560'; ctx.strokeStyle = SOIL.dark; ctx.lineWidth = Math.max(1.5, s * 0.02); ctx.beginPath(); rr(ctx, -s * 0.47, -s * 0.47, s * 0.94, s * 0.92, s * 0.12); ctx.fill(); ctx.stroke();
        var gx = s * 0.88 / Math.max(maxC, 2), gy = s * 0.86 / Math.max(nr, 1), cr = Math.min(gx / 2.5, gy / 3.3, s * 0.15);
        for (var ri = 0, d = 0; ri < nr; ri++) for (var ci = 0; ci < rowsN[ri]; ci++, d++) {
          var cx2 = (ci - (rowsN[ri] - 1) / 2) * gx, cy2 = (ri - (nr - 1) / 2) * gy + cr * 0.75;
          ctx.save(); ctx.translate(cx2, cy2); drawChip(ctx, cr, { grow: 1 }); ctx.restore();
        }
        break;
      }
      case 'cookie': {
        var ck = {}; for (var kk in thing) if (kk !== 'kind') ck[kk] = thing[kk];
        ck.kind = thing.cookieKind || thing.ckKind || (thing.animal ? 'animal' : thing.home ? 'home' : thing.text != null ? 'glyph' : thing.shape ? 'shape' : 'round');
        if (thing.ck) ck = thing.ck;
        drawCookie(ctx, ck, s * 0.92, { time: 0, look: 'bed' });
        break;
      }
      default: break;
    }
    ctx.restore();
  }

  // ================================================================ GHOST HAND
  function drawGhostHand(ctx, size, press) {
    var s = num(size, 90) || 90, F = '#FFF4E4', L = '#B9835A', SH = '#F1D6B8', EDGE = '#5A3A28';
    var pr = clamp01(press);
    ctx.save();
    if (pr > 0.4) {
      var q = (pr - 0.4) / 0.6;
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.9 * q).toFixed(3) + ')'; ctx.lineWidth = s * 0.035;
      ctx.beginPath(); C(ctx, 0, 0, s * (0.1 + 0.14 * q)); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,214,90,' + (0.6 * q).toFixed(3) + ')'; ctx.lineWidth = s * 0.02;
      ctx.beginPath(); C(ctx, 0, 0, s * (0.16 + 0.16 * q)); ctx.stroke();
    }
    ctx.translate(0, s * 0.06 * (1 - pr));
    var ks = 1 - 0.04 * pr; ctx.scale(ks, ks);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    function hand() {
      ctx.beginPath();
      rr(ctx, -s * 0.085, 0, s * 0.17, s * 0.52, s * 0.085);
      rr(ctx, -s * 0.26, s * 0.36, s * 0.47, s * 0.42, s * 0.14);
      ctx.moveTo(-s * 0.2, s * 0.5);
      ctx.ellipse(-s * 0.27, s * 0.46, s * 0.07, s * 0.15, -0.6, 0, TAU);
    }
    ctx.globalAlpha *= 0.95;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
    hand(); ctx.lineWidth = s * 0.07 + 6; ctx.strokeStyle = EDGE; ctx.stroke();
    ctx.restore();
    hand(); ctx.lineWidth = s * 0.07; ctx.strokeStyle = L; ctx.stroke();
    hand(); ctx.fillStyle = F; ctx.fill();
    ctx.strokeStyle = SH; ctx.lineWidth = s * 0.03;
    ctx.beginPath(); ctx.moveTo(0, s * 0.5); ctx.lineTo(s * 0.18, s * 0.5); ctx.moveTo(0, s * 0.62); ctx.lineTo(s * 0.18, s * 0.62); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.ellipse(-s * 0.03, s * 0.12, s * 0.025, s * 0.07, 0, 0, TAU); ctx.fill();
    // cuff: a sage gardening glove cuff with a cream stripe
    ctx.fillStyle = '#B9CC93'; ctx.strokeStyle = '#5E7446'; ctx.lineWidth = s * 0.04;
    ctx.beginPath(); rr(ctx, -s * 0.24, s * 0.76, s * 0.44, s * 0.14, s * 0.05); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = EDGE; ctx.stroke();
    ctx.fillStyle = '#FFF6E2'; ctx.fillRect(-s * 0.2, s * 0.81, s * 0.36, s * 0.035);
    ctx.restore();
  }

  FT.FarmArt = {
    drawTray: drawTray, drawRack: drawRack, drawFence: drawRack, drawBadge: drawBadge, drawCookie: drawCookie, drawPacket: drawPacket,
    drawIcingBag: drawIcingBag, drawCan: drawIcingBag, drawGuide: drawGuide, drawIcing: drawIcing, drawChip: drawChip, drawCarrot: drawChip,
    drawSprinkle: drawSprinkle, drawPetal: drawSprinkle, drawIcon: drawIcon, drawGhostHand: drawGhostHand, drawFlourPuff: drawFlourPuff,
    drawPlant: drawPlant,
    pal: pal, arcLengths: arcLengths, clearCache: clearCache,
    PALETTE: FALLBACK_PALETTE, SOIL: SOIL, BED: BED, SIGN: SIGN, FENCE: FENCE, TIN: TIN, CARROT: CARROT, FONT: FONT,
    CAN_GRIP: { x: CAN_GRIP[0], y: CAN_GRIP[1] }, CAN_CENTER: { x: CAN_CENTER[0], y: CAN_CENTER[1] }, BAG_CENTER: CAN_CENTER[1],
    ROW_STEP: ROW_STEP, SHAPES: SHAPES, ANIMALS: ANIMALS, HOMES: HOMES
  };
  FT.CookieArt = FT.FarmArt;
})(typeof window !== 'undefined' ? (window.FT = window.FT || {}) : (global.FT = global.FT || {}));
