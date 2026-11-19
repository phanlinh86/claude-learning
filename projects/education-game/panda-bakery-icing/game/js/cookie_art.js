/* Mochi's Icing Bakery — IB.CookieArt (character artist B), DESIGN §3 / §4.2. Everything here is drawn by code on a 2D canvas.
 * Node-safe at load (no DOM access; Path2D is used lazily when it exists, else paths are rebuilt on the context).
 *
 *   drawTray(ctx, box, opt)              rounded steel baking tray, rim OUTSIDE box (≤ opt.frame px, default 26), parchment
 *                                        #FFF8EC inside box; opt {glow 0..1 gold rim pulse, frame px, time}
 *   drawRack(ctx, rack, opt)             wire cooling rack strip in rack {x, y, w, h}; opt {time}
 *   drawCookie(ctx, ck, size, opt)       origin = centre, size = diameter / bounding size.
 *       ck = { kind:'round'|'shape'|'glyph'|'animal'|'home', shape?, text?, animal?, home?,
 *              icing?: [{pts:[[x,y]…], hex}], chips?: [{x, y, r}], icingBox?: {cx, cy, size} }
 *       icing / chips are in tray picture px around icingBox (default {cx 300, cy 200, size 330} = the big cookie on the
 *       tray), scaled to `size` — so a finished tray cookie drawn small on the rack keeps its icing.
 *       opt { lift 0..1, wob px, glow 0..1, dim 0..1|bool, selected 0..1|bool, sparkle 0..1, squash (sy factor, 1 = none;
 *             sx = 1 + (1 − sy)·0.6, bottom-anchored) | sx, sy, icing (extra list), time }
 *   drawIcingBag(ctx, hex, size, angle, opt)  origin = NOZZLE TIP (or the visual centre with opt.center), bag points down at
 *       angle 0 (+ clockwise), size = length; hex = palette name or #hex (null → cream / empty);
 *       opt { squeeze 0..1, lift 0..1, wob px, glow 0..1, selected, dim, empty, center bool, time }
 *   drawGuide(ctx, path, done, opt)      ctx in tray picture space. done = arc length along the whole path (number) or an
 *       IB.Trace state {stroke, done, complete}. Remaining dots, pulsing start ring + direction chevron, stroke badges.
 *       opt { pulse phase 0..1 (default from the clock), glow 0..1 (hint), alpha, screenScale (CSS px per picture px;
 *       default = ctx transform scale ÷ devicePixelRatio), dpr }. Dots: brown ring + cream centre (reads on dough and
 *       parchment), ≥ 11 CSS px across; start = gold disc + white ring + dark outline, ≥ 40 CSS px across.
 *   drawIcing(ctx, pts, hex, width, opt) glossy royal-icing polyline (3 strokes + 1 fill) with a darker edge all round
 *       (≥ 1.2 CSS px); opt {wet 0..1, alpha, screenScale, dpr}
 *   drawChip(ctx, r, opt)                chocolate chip, origin centre; opt {squash}
 *   drawSprinkle(ctx, hex, len, rot)     rod sprinkle, origin centre
 *   drawIcon(ctx, thing, size)           Talk-time icon in a size box: blob{color} shape{shape,color?} animal{animal}
 *       home{home} number{n} letter{text} dots{n} size{size:'big'|'small'} cookie{…ck}
 *   drawGhostHand(ctx, size, press)      pointing hand, origin = fingertip (finger points UP), press 0..1
 *   drawFlourPuff(ctx, r, t)             soft white puff burst, t 0..1
 *   Helpers: pal(c) → {base, dark, light}, DOUGH, GINGER, FONT, BAG_CENTER (tip → visual centre, × size, negative = up),
 *            ANIMALS, HOMES, SHAPES (drawable lists), arcLengths(stroke), clearCache().
 */
(function (IB) {
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
  var DOUGH = { dough: '#E9B872', light: '#F6D59D', shade: '#C98E4A', outline: '#9A6330', rim: '#D79B55',
    chip: '#5A3A28', chipHi: '#8A5E44', glyph: '#8A5A2E', bevel: '#F8E2B8' };
  var GINGER = { dough: '#B9773F', light: '#D69D62', shade: '#94592A', outline: '#6B3C1B', rim: '#A4662F' };
  // muted decorating icings for animals / homes (never an exact answer colour, all pastel or brown)
  var ICE = { white: '#FFFBF3', dark: '#3E2518', choc: '#8C5A3B', pink: '#F2B6AF', pinkDk: '#DE8F8A', rose: '#EBA3A3',
    sage: '#A9CC8C', sageDk: '#7EA866', aqua: '#A6D8DA', aquaDk: '#6FB3B8', honey: '#F2C76B', butter: '#F6D985',
    lilac: '#C8C0D8', lilacDk: '#9088A8', beak: '#EFA752', grey: '#D8D0CB', egg: '#CFE2EA' };
  var FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", system-ui, sans-serif';
  var BAG_CENTER = -0.5;
  var SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'rect', 'diamond', 'oval'];
  var ANIMALS = ['dog', 'cat', 'bee', 'bird', 'frog', 'cow', 'rabbit', 'fish', 'duck', 'pig'];
  var HOMES = ['kennel', 'hive', 'nest', 'pond', 'barn', 'burrow', 'bowl', 'basket'];

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
  function pal(c) {
    if (!c) return null;
    var P = IB.PALETTE || FALLBACK_PALETTE, p = (P && P[c]) || FALLBACK_PALETTE[c];
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
  // sub-path helpers (all clockwise on screen so unions never cut holes)
  function C(p, x, y, r) { p.moveTo(x + r, y); p.arc(x, y, r, 0, TAU); p.closePath(); }
  function El(p, x, y, rx, ry, rot) { rot = rot || 0; p.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot)); p.ellipse(x, y, rx, ry, rot, 0, TAU); p.closePath(); }
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
  var cache = {}, cacheN = 0, MAX_CACHE = 400;
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
  function tmp(fn) {   // un-cached shape (built once per call)
    if (typeof Path2D === 'undefined') return { p: null, fn: fn };
    var p = new Path2D(); fn(p); return { p: p, fn: fn };
  }
  function fillS(ctx, S) { if (S.p) ctx.fill(S.p); else { ctx.beginPath(); S.fn(ctx); ctx.fill(); } }
  function strokeS(ctx, S) { if (S.p) ctx.stroke(S.p); else { ctx.beginPath(); S.fn(ctx); ctx.stroke(); } }
  function clipS(ctx, S) { if (S.p) ctx.clip(S.p); else { ctx.beginPath(); S.fn(ctx); ctx.clip(); } }
  function clearCache() { cache = {}; cacheN = 0; glyphM = {}; }

  // ---------------------------------------------------------------- small decorating helpers (units × s)
  function fillWith(ctx, fn, color) { ctx.beginPath(); fn(ctx); ctx.fillStyle = color; ctx.fill(); }
  /** flood icing: a raised, glossy area (shadow edge, base, gloss, thin edge) */
  function flood(ctx, s, fn, base, gx, gy, gr) {
    ctx.save();
    ctx.translate(0, s * 0.014); fillWith(ctx, fn, rgba(mix(base, '#3A2010', 0.55), 0.45));
    ctx.restore();
    // the thin edge is stroked UNDER the fill, so overlapping sub-shapes merge without seams
    ctx.beginPath(); fn(ctx); ctx.lineWidth = Math.max(1.6, s * 0.016); ctx.strokeStyle = mix(base, '#5A3A20', 0.35); ctx.stroke();
    ctx.fillStyle = base; ctx.fill();
    ctx.save(); ctx.clip();
    if (gr > 0) {
      var g = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
      g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(0.5, 'rgba(255,255,255,0.16)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
    }
    ctx.restore();
  }
  /** piped icing line (a thin raised line): shadow, colour, highlight */
  function pipe(ctx, s, fn, color, w) {
    var lw = Math.max(1.2, s * w);
    ctx.beginPath(); fn(ctx);
    ctx.save(); ctx.translate(0, lw * 0.3); ctx.lineWidth = lw * 1.25; ctx.strokeStyle = rgba(mix(color, '#2A1408', 0.6), 0.45); ctx.stroke(); ctx.restore();
    ctx.lineWidth = lw; ctx.strokeStyle = color; ctx.stroke();
    if (lw > 2.5) { ctx.save(); ctx.translate(-lw * 0.12, -lw * 0.22); ctx.lineWidth = lw * 0.3; ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.stroke(); ctx.restore(); }
  }
  function eye(ctx, x, y, r) {
    ctx.fillStyle = ICE.dark; ctx.beginPath(); C(ctx, x, y, r); ctx.fill();
    ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); C(ctx, x - r * 0.32, y - r * 0.36, r * 0.36); C(ctx, x + r * 0.3, y + r * 0.3, r * 0.14); ctx.fill();
  }
  function dots(ctx, list, r, color) {
    ctx.fillStyle = color; ctx.beginPath();
    for (var i = 0; i < list.length; i++) C(ctx, list[i][0], list[i][1], list[i][2] || r);
    ctx.fill();
  }
  function cheeks(ctx, s, x, y, r) { ctx.fillStyle = 'rgba(232,130,120,0.42)'; ctx.beginPath(); El(ctx, -x * s, y * s, r * s, r * 0.7 * s); El(ctx, x * s, y * s, r * s, r * 0.7 * s); ctx.fill(); }

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

  // ================================================================ ANIMAL COOKIES {build(p, s), deco(ctx, s)}
  var ANIMAL = {
    dog: {
      build: function (p, s) { El(p, 0, s * 0.04, s * 0.35, s * 0.34); El(p, -s * 0.33, s * 0.02, s * 0.14, s * 0.27, 0.32); El(p, s * 0.33, s * 0.02, s * 0.14, s * 0.27, -0.32); },
      deco: function (ctx, s) {
        flood(ctx, s, function (p) { El(p, -s * 0.33, s * 0.03, s * 0.1, s * 0.22, 0.32); El(p, s * 0.33, s * 0.03, s * 0.1, s * 0.22, -0.32); }, ICE.choc, -s * 0.36, -s * 0.1, s * 0.16);
        flood(ctx, s, function (p) { El(p, s * 0.13, -s * 0.06, s * 0.1, s * 0.095, 0.3); }, ICE.choc, s * 0.1, -s * 0.1, s * 0.08);
        flood(ctx, s, function (p) { El(p, 0, s * 0.18, s * 0.18, s * 0.13); }, ICE.white, -s * 0.06, s * 0.12, s * 0.12);
        pipe(ctx, s, function (p) { p.moveTo(0, s * 0.15); p.lineTo(0, s * 0.22); p.moveTo(-s * 0.07, s * 0.22); p.quadraticCurveTo(-s * 0.035, s * 0.27, 0, s * 0.22); p.quadraticCurveTo(s * 0.035, s * 0.27, s * 0.07, s * 0.22); }, ICE.dark, 0.022);
        flood(ctx, s, function (p) { El(p, 0, s * 0.27, s * 0.035, s * 0.04); }, ICE.rose, 0, s * 0.26, s * 0.03);
        flood(ctx, s, function (p) { El(p, 0, s * 0.12, s * 0.065, s * 0.048); }, ICE.dark, -s * 0.02, s * 0.1, s * 0.04);
        eye(ctx, -s * 0.13, -s * 0.05, s * 0.05); eye(ctx, s * 0.13, -s * 0.05, s * 0.05);
      }
    },
    cat: {
      build: function (p, s) {
        El(p, 0, s * 0.07, s * 0.39, s * 0.32);
        poly(p, sc([[-0.37, -0.02], [-0.3, -0.47], [-0.04, -0.23]], s), s * 0.06);
        poly(p, sc([[0.37, -0.02], [0.04, -0.23], [0.3, -0.47]], s), s * 0.06);
      },
      deco: function (ctx, s) {
        flood(ctx, s, function (p) { poly(p, sc([[-0.3, -0.1], [-0.27, -0.36], [-0.11, -0.22]], s), s * 0.03); poly(p, sc([[0.3, -0.1], [0.11, -0.22], [0.27, -0.36]], s), s * 0.03); }, ICE.pink, -s * 0.25, -s * 0.28, s * 0.08);
        pipe(ctx, s, function (p) { p.moveTo(-s * 0.06, -s * 0.18); p.lineTo(-s * 0.05, -s * 0.1); p.moveTo(0, -s * 0.2); p.lineTo(0, -s * 0.11); p.moveTo(s * 0.06, -s * 0.18); p.lineTo(s * 0.05, -s * 0.1); }, ICE.choc, 0.026);
        eye(ctx, -s * 0.15, s * 0.0, s * 0.055); eye(ctx, s * 0.15, s * 0.0, s * 0.055);
        flood(ctx, s, function (p) { poly(p, sc([[-0.05, 0.09], [0.05, 0.09], [0, 0.15]], s), s * 0.02); }, ICE.pinkDk, 0, s * 0.1, s * 0.04);
        pipe(ctx, s, function (p) {
          p.moveTo(0, s * 0.15); p.lineTo(0, s * 0.18);
          p.moveTo(-s * 0.08, s * 0.18); p.quadraticCurveTo(-s * 0.04, s * 0.24, 0, s * 0.18); p.quadraticCurveTo(s * 0.04, s * 0.24, s * 0.08, s * 0.18);
          p.moveTo(-s * 0.16, s * 0.12); p.lineTo(-s * 0.33, s * 0.08); p.moveTo(-s * 0.16, s * 0.16); p.lineTo(-s * 0.33, s * 0.18);
          p.moveTo(s * 0.16, s * 0.12); p.lineTo(s * 0.33, s * 0.08); p.moveTo(s * 0.16, s * 0.16); p.lineTo(s * 0.33, s * 0.18);
        }, ICE.dark, 0.016);
        cheeks(ctx, s, 0.24, 0.17, 0.05);
      }
    },
    bee: {
      build: function (p, s) {
        El(p, s * 0.02, s * 0.08, s * 0.4, s * 0.3);
        El(p, -s * 0.1, -s * 0.24, s * 0.15, s * 0.2, -0.45); El(p, s * 0.17, -s * 0.24, s * 0.15, s * 0.2, 0.45);
        poly(p, sc([[0.36, 0.0], [0.53, 0.09], [0.36, 0.18]], s), s * 0.035);
        C(p, -s * 0.33, -s * 0.2, s * 0.075);
      },
      deco: function (ctx, s) {
        flood(ctx, s, function (p) { El(p, -s * 0.1, -s * 0.25, s * 0.11, s * 0.16, -0.45); El(p, s * 0.17, -s * 0.25, s * 0.11, s * 0.16, 0.45); }, ICE.white, -s * 0.12, -s * 0.32, s * 0.1);
        var body = function (p) { El(p, s * 0.02, s * 0.08, s * 0.35, s * 0.25); };
        flood(ctx, s, body, ICE.honey, -s * 0.1, -s * 0.02, s * 0.28);
        ctx.save(); ctx.beginPath(); body(ctx); ctx.clip();
        flood(ctx, s, function (p) { rr(p, s * 0.02, -s * 0.2, s * 0.09, s * 0.56, s * 0.03); rr(p, s * 0.19, -s * 0.2, s * 0.09, s * 0.56, s * 0.03); }, ICE.dark, 0, 0, 0);
        ctx.restore();
        pipe(ctx, s, function (p) { p.moveTo(-s * 0.22, -s * 0.1); p.quadraticCurveTo(-s * 0.26, -s * 0.18, -s * 0.32, -s * 0.2); }, ICE.dark, 0.02);
        dots(ctx, [[-s * 0.335, -s * 0.205]], s * 0.032, ICE.dark);
        eye(ctx, -s * 0.19, s * 0.03, s * 0.05);
        pipe(ctx, s, function (p) { p.moveTo(-s * 0.27, s * 0.14); p.quadraticCurveTo(-s * 0.2, s * 0.21, -s * 0.12, s * 0.15); }, ICE.dark, 0.02);
        ctx.fillStyle = 'rgba(232,130,120,0.45)'; ctx.beginPath(); El(ctx, -s * 0.09, s * 0.1, s * 0.04, s * 0.028); ctx.fill();
      }
    },
    bird: {
      build: function (p, s) {
        C(p, -s * 0.04, s * 0.08, s * 0.33); C(p, s * 0.17, -s * 0.16, s * 0.21);
        poly(p, sc([[-0.3, -0.02], [-0.52, -0.2], [-0.48, 0.12]], s), s * 0.05);
        poly(p, sc([[0.34, -0.22], [0.52, -0.14], [0.34, -0.07]], s), s * 0.03);
      },
      deco: function (ctx, s) {
        flood(ctx, s, function (p) { C(p, -s * 0.04, s * 0.08, s * 0.28); C(p, s * 0.17, -s * 0.16, s * 0.165); }, ICE.lilac, -s * 0.0, -s * 0.18, s * 0.3);
        flood(ctx, s, function (p) { El(p, s * 0.04, s * 0.18, s * 0.2, s * 0.15, -0.3); }, ICE.white, 0, s * 0.12, s * 0.12);
        flood(ctx, s, function (p) { p.moveTo(-s * 0.24, s * 0.0); p.quadraticCurveTo(-s * 0.06, -s * 0.06, s * 0.02, s * 0.08); p.quadraticCurveTo(-s * 0.1, s * 0.22, -s * 0.28, s * 0.16); p.quadraticCurveTo(-s * 0.32, s * 0.06, -s * 0.24, s * 0.0); p.closePath(); }, mix(ICE.lilac, ICE.lilacDk, 0.55), -s * 0.16, s * 0.02, s * 0.08);
        pipe(ctx, s, function (p) { p.moveTo(-s * 0.2, s * 0.08); p.quadraticCurveTo(-s * 0.1, s * 0.06, -s * 0.04, s * 0.1); p.moveTo(-s * 0.22, s * 0.13); p.quadraticCurveTo(-s * 0.12, s * 0.12, -s * 0.07, s * 0.15); }, ICE.white, 0.014);
        flood(ctx, s, function (p) { poly(p, sc([[0.33, -0.2], [0.47, -0.145], [0.33, -0.09]], s), s * 0.02); }, ICE.beak, s * 0.36, -s * 0.18, s * 0.05);
        eye(ctx, s * 0.2, -s * 0.19, s * 0.055);
        ctx.fillStyle = 'rgba(232,130,120,0.45)'; ctx.beginPath(); El(ctx, s * 0.24, -s * 0.08, s * 0.04, s * 0.026); ctx.fill();
      }
    },
    frog: {
      build: function (p, s) { El(p, 0, s * 0.1, s * 0.42, s * 0.3); C(p, -s * 0.21, -s * 0.21, s * 0.16); C(p, s * 0.21, -s * 0.21, s * 0.16); },
      deco: function (ctx, s) {
        flood(ctx, s, function (p) { El(p, 0, s * 0.1, s * 0.37, s * 0.25); C(p, -s * 0.21, -s * 0.21, s * 0.12); C(p, s * 0.21, -s * 0.21, s * 0.12); }, ICE.sage, -s * 0.12, -s * 0.12, s * 0.32);
        flood(ctx, s, function (p) { C(p, -s * 0.21, -s * 0.21, s * 0.085); C(p, s * 0.21, -s * 0.21, s * 0.085); }, ICE.white, -s * 0.24, -s * 0.25, s * 0.06);
        eye(ctx, -s * 0.2, -s * 0.2, s * 0.05); eye(ctx, s * 0.22, -s * 0.2, s * 0.05);
        pipe(ctx, s, function (p) { p.moveTo(-s * 0.22, s * 0.1); p.quadraticCurveTo(0, s * 0.28, s * 0.22, s * 0.1); }, ICE.dark, 0.026);
        dots(ctx, [[-s * 0.05, -s * 0.0], [s * 0.05, -s * 0.0]], s * 0.018, mix(ICE.sageDk, '#000000', 0.25));
        cheeks(ctx, s, 0.27, 0.1, 0.05);
        dots(ctx, [[-s * 0.26, s * 0.26, s * 0.02], [s * 0.3, s * 0.22, s * 0.025], [s * 0.12, s * 0.3, s * 0.018]], s * 0.02, ICE.sageDk);
      }
    },
    cow: {
      build: function (p, s) {
        El(p, 0, -s * 0.03, s * 0.3, s * 0.33);
        El(p, -s * 0.35, -s * 0.1, s * 0.14, s * 0.075, -0.25); El(p, s * 0.35, -s * 0.1, s * 0.14, s * 0.075, 0.25);
        C(p, -s * 0.17, -s * 0.37, s * 0.07); C(p, s * 0.17, -s * 0.37, s * 0.07);
        El(p, 0, s * 0.25, s * 0.29, s * 0.17);
      },
      deco: function (ctx, s) {
        flood(ctx, s, function (p) { C(p, -s * 0.17, -s * 0.37, s * 0.045); C(p, s * 0.17, -s * 0.37, s * 0.045); }, '#EFE6D8', -s * 0.18, -s * 0.39, s * 0.03);
        var head = function (p) { El(p, 0, -s * 0.03, s * 0.25, s * 0.28); El(p, -s * 0.34, -s * 0.1, s * 0.1, s * 0.045, -0.25); El(p, s * 0.34, -s * 0.1, s * 0.1, s * 0.045, 0.25); };
        flood(ctx, s, head, ICE.white, -s * 0.1, -s * 0.15, s * 0.25);
        ctx.save(); ctx.beginPath(); head(ctx); ctx.clip();
        fillWith(ctx, function (p) { El(p, s * 0.17, -s * 0.2, s * 0.13, s * 0.1, 0.5); El(p, -s * 0.24, s * 0.06, s * 0.08, s * 0.11, -0.3); C(p, -s * 0.08, -s * 0.27, s * 0.045); }, ICE.dark);
        ctx.restore();
        flood(ctx, s, function (p) { El(p, 0, s * 0.25, s * 0.24, s * 0.125); }, ICE.pink, -s * 0.08, s * 0.2, s * 0.12);
        dots(ctx, [[-s * 0.09, s * 0.25, s * 0.035], [s * 0.09, s * 0.25, s * 0.035]], s * 0.03, ICE.pinkDk);
        eye(ctx, -s * 0.11, -s * 0.04, s * 0.05); eye(ctx, s * 0.11, -s * 0.04, s * 0.05);
      }
    },
    rabbit: {
      build: function (p, s) { C(p, 0, s * 0.16, s * 0.31); El(p, -s * 0.13, -s * 0.24, s * 0.1, s * 0.25, -0.12); El(p, s * 0.13, -s * 0.24, s * 0.1, s * 0.25, 0.12); },
      deco: function (ctx, s) {
        flood(ctx, s, function (p) { C(p, 0, s * 0.16, s * 0.26); El(p, -s * 0.13, -s * 0.24, s * 0.06, s * 0.2, -0.12); El(p, s * 0.13, -s * 0.24, s * 0.06, s * 0.2, 0.12); }, ICE.white, -s * 0.1, s * 0.02, s * 0.22);
        flood(ctx, s, function (p) { El(p, -s * 0.13, -s * 0.24, s * 0.03, s * 0.14, -0.12); El(p, s * 0.13, -s * 0.24, s * 0.03, s * 0.14, 0.12); }, ICE.pink, 0, 0, 0);
        eye(ctx, -s * 0.11, s * 0.1, s * 0.05); eye(ctx, s * 0.11, s * 0.1, s * 0.05);
        flood(ctx, s, function (p) { El(p, 0, s * 0.2, s * 0.04, s * 0.03); }, ICE.pinkDk, 0, s * 0.19, s * 0.02);
        flood(ctx, s, function (p) { rr(p, -s * 0.035, s * 0.25, s * 0.07, s * 0.06, s * 0.012); }, '#FFFFFF', 0, 0, 0);
        pipe(ctx, s, function (p) {
          p.moveTo(0, s * 0.22); p.lineTo(0, s * 0.25); p.moveTo(-s * 0.07, s * 0.25); p.quadraticCurveTo(-s * 0.03, s * 0.27, 0, s * 0.25); p.quadraticCurveTo(s * 0.03, s * 0.27, s * 0.07, s * 0.25);
          p.moveTo(-s * 0.1, s * 0.21); p.lineTo(-s * 0.24, s * 0.18); p.moveTo(-s * 0.1, s * 0.24); p.lineTo(-s * 0.23, s * 0.27);
          p.moveTo(s * 0.1, s * 0.21); p.lineTo(s * 0.24, s * 0.18); p.moveTo(s * 0.1, s * 0.24); p.lineTo(s * 0.23, s * 0.27);
        }, ICE.dark, 0.014);
        cheeks(ctx, s, 0.19, 0.2, 0.045);
      }
    },
    fish: {
      build: function (p, s) {
        El(p, s * 0.07, s * 0.02, s * 0.37, s * 0.27);
        poly(p, sc([[-0.24, 0.02], [-0.52, -0.25], [-0.46, 0.02], [-0.52, 0.29]], s), s * 0.06);
        poly(p, sc([[-0.05, -0.2], [0.05, -0.34], [0.2, -0.22]], s), s * 0.05);
      },
      deco: function (ctx, s) {
        var b = function (p) { El(p, s * 0.07, s * 0.02, s * 0.32, s * 0.22); };
        flood(ctx, s, b, ICE.aqua, -s * 0.02, -s * 0.08, s * 0.28);
        flood(ctx, s, function (p) { poly(p, sc([[-0.27, 0.02], [-0.46, -0.18], [-0.42, 0.02], [-0.46, 0.22]], s), s * 0.04); }, ICE.aquaDk, -s * 0.38, -s * 0.05, s * 0.08);
        pipe(ctx, s, function (p) {
          for (var i = 0; i < 3; i++) for (var j = 0; j < 2; j++) {
            var x = -s * 0.12 + i * s * 0.1, y = -s * 0.05 + j * s * 0.12 + (i % 2) * s * 0.06;
            p.moveTo(x - s * 0.04, y - s * 0.03); p.quadraticCurveTo(x + s * 0.02, y, x - s * 0.04, y + s * 0.04);
          }
        }, ICE.white, 0.018);
        pipe(ctx, s, function (p) { p.moveTo(s * 0.17, -s * 0.18); p.quadraticCurveTo(s * 0.12, s * 0.02, s * 0.18, s * 0.2); }, ICE.white, 0.02);
        eye(ctx, s * 0.27, -s * 0.04, s * 0.06);
        pipe(ctx, s, function (p) { p.moveTo(s * 0.3, s * 0.08); p.quadraticCurveTo(s * 0.34, s * 0.12, s * 0.39, s * 0.07); }, ICE.dark, 0.018);
      }
    },
    duck: {
      build: function (p, s) {
        El(p, -s * 0.04, s * 0.16, s * 0.38, s * 0.24);
        C(p, s * 0.16, -s * 0.18, s * 0.2);
        poly(p, sc([[0.28, -0.22], [0.53, -0.17], [0.5, -0.08], [0.28, -0.08]], s), s * 0.05);
        poly(p, sc([[-0.32, 0.02], [-0.5, -0.12], [-0.4, 0.18]], s), s * 0.05);
      },
      deco: function (ctx, s) {
        flood(ctx, s, function (p) { El(p, -s * 0.04, s * 0.16, s * 0.33, s * 0.19); C(p, s * 0.16, -s * 0.18, s * 0.155); }, ICE.butter, -s * 0.02, -s * 0.16, s * 0.3);
        flood(ctx, s, function (p) { poly(p, sc([[0.28, -0.2], [0.49, -0.16], [0.47, -0.1], [0.28, -0.1]], s), s * 0.03); }, ICE.beak, s * 0.36, -s * 0.18, s * 0.06);
        flood(ctx, s, function (p) { p.moveTo(-s * 0.26, s * 0.08); p.quadraticCurveTo(-s * 0.02, s * 0.0, s * 0.08, s * 0.14); p.quadraticCurveTo(-s * 0.08, s * 0.27, -s * 0.26, s * 0.08); p.closePath(); }, mix(ICE.butter, '#C89A30', 0.3), -s * 0.12, s * 0.08, s * 0.1);
        pipe(ctx, s, function (p) { p.moveTo(-s * 0.18, s * 0.1); p.quadraticCurveTo(-s * 0.06, s * 0.08, s * 0.0, s * 0.14); }, ICE.white, 0.012);
        eye(ctx, s * 0.19, -s * 0.21, s * 0.05);
        ctx.fillStyle = 'rgba(232,130,120,0.45)'; ctx.beginPath(); El(ctx, s * 0.22, -s * 0.1, s * 0.04, s * 0.026); ctx.fill();
      }
    },
    pig: {
      build: function (p, s) {
        El(p, 0, s * 0.06, s * 0.39, s * 0.33);
        poly(p, sc([[-0.34, -0.12], [-0.36, -0.46], [-0.08, -0.26]], s), s * 0.06);
        poly(p, sc([[0.34, -0.12], [0.08, -0.26], [0.36, -0.46]], s), s * 0.06);
      },
      deco: function (ctx, s) {
        flood(ctx, s, function (p) { El(p, 0, s * 0.06, s * 0.34, s * 0.28); poly(p, sc([[-0.3, -0.14], [-0.31, -0.39], [-0.12, -0.25]], s), s * 0.04); poly(p, sc([[0.3, -0.14], [0.12, -0.25], [0.31, -0.39]], s), s * 0.04); }, ICE.pink, -s * 0.12, -s * 0.1, s * 0.32);
        flood(ctx, s, function (p) { El(p, 0, s * 0.13, s * 0.15, s * 0.105); }, ICE.rose, -s * 0.05, s * 0.09, s * 0.08);
        dots(ctx, [[-s * 0.055, s * 0.13, s * 0.03], [s * 0.055, s * 0.13, s * 0.03]], 0, '#9E4E52');
        eye(ctx, -s * 0.14, -s * 0.04, s * 0.05); eye(ctx, s * 0.14, -s * 0.04, s * 0.05);
        pipe(ctx, s, function (p) { p.moveTo(-s * 0.07, s * 0.28); p.quadraticCurveTo(0, s * 0.32, s * 0.07, s * 0.28); }, ICE.dark, 0.018);
        cheeks(ctx, s, 0.25, 0.13, 0.05);
      }
    }
  };

  // ================================================================ HOME COOKIES (gingerbread)
  var W = ICE.white;
  var HOME = {
    kennel: {
      build: function (p, s) { poly(p, sc([[0, -0.48], [0.51, -0.05], [0.39, -0.05], [0.39, 0.45], [-0.39, 0.45], [-0.39, -0.05], [-0.51, -0.05]], s), s * 0.045); },
      deco: function (ctx, s) {
        flood(ctx, s, function (p) { poly(p, sc([[0, -0.42], [0.43, -0.07], [-0.43, -0.07]], s), s * 0.03); }, ICE.choc, -s * 0.1, -s * 0.3, s * 0.2);
        pipe(ctx, s, function (p) { p.moveTo(-s * 0.43, -s * 0.07); p.lineTo(0, -s * 0.42); p.lineTo(s * 0.43, -s * 0.07); }, W, 0.03);
        pipe(ctx, s, function (p) { for (var i = 0; i < 7; i++) { var x = -s * 0.33 + i * s * 0.11; p.moveTo(x - s * 0.055, -s * 0.02); p.quadraticCurveTo(x, s * 0.05, x + s * 0.055, -s * 0.02); } }, W, 0.022);
        flood(ctx, s, function (p) { p.moveTo(-s * 0.17, s * 0.42); p.lineTo(-s * 0.17, s * 0.22); p.arc(0, s * 0.22, s * 0.17, Math.PI, 0); p.lineTo(s * 0.17, s * 0.42); p.closePath(); }, '#3B2216', 0, 0, 0);
        pipe(ctx, s, function (p) { p.moveTo(-s * 0.2, s * 0.42); p.lineTo(-s * 0.2, s * 0.22); p.arc(0, s * 0.22, s * 0.2, Math.PI, 0); p.lineTo(s * 0.2, s * 0.42); }, W, 0.026);
        // bone on the roof
        flood(ctx, s, function (p) { rr(p, -s * 0.09, -s * 0.215, s * 0.18, s * 0.05, s * 0.025); C(p, -s * 0.1, -s * 0.215, s * 0.032); C(p, -s * 0.1, -s * 0.165, s * 0.032); C(p, s * 0.1, -s * 0.215, s * 0.032); C(p, s * 0.1, -s * 0.165, s * 0.032); }, W, 0, 0, 0);
        dots(ctx, [[-s * 0.3, s * 0.14], [-s * 0.3, s * 0.27], [s * 0.3, s * 0.14], [s * 0.3, s * 0.27]], s * 0.022, W);
      }
    },
    hive: {
      build: function (p, s) { p.moveTo(-s * 0.44, s * 0.45); p.bezierCurveTo(-s * 0.54, s * 0.05, -s * 0.36, -s * 0.48, 0, -s * 0.48); p.bezierCurveTo(s * 0.36, -s * 0.48, s * 0.54, s * 0.05, s * 0.44, s * 0.45); p.closePath(); },
      deco: function (ctx, s) {
        pipe(ctx, s, function (p) {
          var ys = [-0.3, -0.13, 0.04, 0.21, 0.36];
          for (var i = 0; i < ys.length; i++) { var y = ys[i] * s, hw = s * (0.26 + 0.2 * Math.sqrt(Math.min(1, (ys[i] + 0.48) / 0.8))); p.moveTo(-hw, y); p.quadraticCurveTo(0, y + s * 0.07, hw, y); }
        }, W, 0.03);
        flood(ctx, s, function (p) { p.moveTo(-s * 0.13, s * 0.43); p.lineTo(-s * 0.13, s * 0.34); p.arc(0, s * 0.34, s * 0.13, Math.PI, 0); p.lineTo(s * 0.13, s * 0.43); p.closePath(); }, '#3B2216', 0, 0, 0);
        flood(ctx, s, function (p) { p.moveTo(-s * 0.2, -s * 0.44); p.quadraticCurveTo(0, -s * 0.52, s * 0.2, -s * 0.44); p.lineTo(s * 0.16, -s * 0.36); p.quadraticCurveTo(s * 0.12, -s * 0.28, s * 0.08, -s * 0.36); p.quadraticCurveTo(0, -s * 0.38, -s * 0.06, -s * 0.36); p.quadraticCurveTo(-s * 0.1, -s * 0.26, -s * 0.15, -s * 0.37); p.closePath(); }, ICE.honey, -s * 0.06, -s * 0.44, s * 0.1);
      }
    },
    nest: {
      build: function (p, s) {
        El(p, -s * 0.17, -s * 0.12, s * 0.13, s * 0.16, -0.2); El(p, s * 0.17, -s * 0.12, s * 0.13, s * 0.16, 0.2); El(p, 0, -s * 0.18, s * 0.13, s * 0.17);
        p.moveTo(-s * 0.52, -s * 0.02); p.lineTo(s * 0.52, -s * 0.02); p.bezierCurveTo(s * 0.5, s * 0.34, s * 0.25, s * 0.44, 0, s * 0.44); p.bezierCurveTo(-s * 0.25, s * 0.44, -s * 0.5, s * 0.34, -s * 0.52, -s * 0.02); p.closePath();
      },
      deco: function (ctx, s) {
        flood(ctx, s, function (p) { El(p, -s * 0.17, -s * 0.12, s * 0.095, s * 0.125, -0.2); El(p, s * 0.17, -s * 0.12, s * 0.095, s * 0.125, 0.2); }, ICE.egg, -s * 0.2, -s * 0.18, s * 0.07);
        flood(ctx, s, function (p) { El(p, 0, -s * 0.18, s * 0.095, s * 0.13); }, W, -s * 0.03, -s * 0.24, s * 0.07);
        dots(ctx, [[-s * 0.2, -s * 0.12], [-s * 0.14, -s * 0.06], [s * 0.2, -s * 0.1], [s * 0.14, -s * 0.15], [s * 0.02, -s * 0.12]], s * 0.012, '#8FA9B4');
        pipe(ctx, s, function (p) {
          for (var i = 0; i < 9; i++) { var x = -s * 0.44 + i * s * 0.11; p.moveTo(x, s * 0.0); p.lineTo(x + s * 0.13, s * 0.36 - Math.abs(i - 4) * s * 0.03); p.moveTo(x + s * 0.13, s * 0.0); p.lineTo(x, s * 0.36 - Math.abs(i - 4) * s * 0.03); }
        }, '#6B3E1E', 0.022);
        pipe(ctx, s, function (p) { p.moveTo(-s * 0.5, s * 0.0); p.quadraticCurveTo(0, s * 0.07, s * 0.5, s * 0.0); p.moveTo(-s * 0.4, s * 0.2); p.quadraticCurveTo(0, s * 0.28, s * 0.4, s * 0.2); }, ICE.white, 0.024);
      }
    },
    pond: {
      build: function (p, s) { El(p, 0, s * 0.0, s * 0.51, s * 0.4); },
      deco: function (ctx, s) {
        flood(ctx, s, function (p) { El(p, s * 0.02, s * 0.03, s * 0.42, s * 0.3); }, ICE.aqua, -s * 0.15, -s * 0.08, s * 0.35);
        pipe(ctx, s, function (p) { p.moveTo(-s * 0.3, s * 0.04); p.quadraticCurveTo(-s * 0.22, -s * 0.01, -s * 0.14, s * 0.04); p.quadraticCurveTo(-s * 0.06, s * 0.09, s * 0.02, s * 0.04); p.moveTo(-s * 0.08, s * 0.2); p.quadraticCurveTo(0, s * 0.15, s * 0.08, s * 0.2); p.quadraticCurveTo(s * 0.16, s * 0.25, s * 0.24, s * 0.2); }, W, 0.022);
        flood(ctx, s, function (p) { p.moveTo(s * 0.2, -s * 0.06); p.arc(s * 0.2, -s * 0.06, s * 0.13, -0.3, Math.PI * 2 - 0.9); p.closePath(); }, ICE.sage, s * 0.15, -s * 0.12, s * 0.1);
        pipe(ctx, s, function (p) { p.moveTo(s * 0.2, -s * 0.06); p.lineTo(s * 0.28, -s * 0.12); p.moveTo(s * 0.2, -s * 0.06); p.lineTo(s * 0.1, -s * 0.12); }, ICE.sageDk, 0.012);
        flood(ctx, s, function (p) { for (var i = 0; i < 5; i++) { var a = i / 5 * TAU; C(p, s * 0.18 + Math.cos(a) * s * 0.035, -s * 0.09 + Math.sin(a) * s * 0.035, s * 0.03); } }, '#F6D2D6', 0, 0, 0);
        dots(ctx, [[s * 0.18, -s * 0.09]], s * 0.022, ICE.honey);
        pipe(ctx, s, function (p) { p.moveTo(-s * 0.36, s * 0.0); p.lineTo(-s * 0.38, -s * 0.3); p.moveTo(-s * 0.3, s * 0.02); p.lineTo(-s * 0.28, -s * 0.24); }, ICE.sageDk, 0.02);
        flood(ctx, s, function (p) { rr(p, -s * 0.405, -s * 0.36, s * 0.05, s * 0.12, s * 0.025); rr(p, -s * 0.305, -s * 0.3, s * 0.05, s * 0.11, s * 0.025); }, ICE.choc, 0, 0, 0);
      }
    },
    barn: {
      build: function (p, s) { poly(p, sc([[0, -0.49], [0.31, -0.36], [0.47, -0.12], [0.47, 0.45], [-0.47, 0.45], [-0.47, -0.12], [-0.31, -0.36]], s), s * 0.04); },
      deco: function (ctx, s) {
        flood(ctx, s, function (p) { poly(p, sc([[0, -0.43], [0.28, -0.32], [0.41, -0.12], [-0.41, -0.12], [-0.28, -0.32]], s), s * 0.03); }, ICE.choc, -s * 0.1, -s * 0.35, s * 0.2);
        pipe(ctx, s, function (p) { p.moveTo(-s * 0.41, -s * 0.12); p.lineTo(-s * 0.28, -s * 0.32); p.lineTo(0, -s * 0.43); p.lineTo(s * 0.28, -s * 0.32); p.lineTo(s * 0.41, -s * 0.12); p.lineTo(-s * 0.41, -s * 0.12); }, W, 0.026);
        flood(ctx, s, function (p) { rr(p, -s * 0.08, -s * 0.33, s * 0.16, s * 0.13, s * 0.02); }, '#3B2216', 0, 0, 0);
        pipe(ctx, s, function (p) { rr(p, -s * 0.08, -s * 0.33, s * 0.16, s * 0.13, s * 0.02); p.moveTo(0, -s * 0.33); p.lineTo(0, -s * 0.2); }, W, 0.018);
        flood(ctx, s, function (p) { rr(p, -s * 0.2, s * 0.04, s * 0.4, s * 0.38, s * 0.02); }, ICE.choc, -s * 0.1, s * 0.08, s * 0.15);
        pipe(ctx, s, function (p) { rr(p, -s * 0.2, s * 0.04, s * 0.4, s * 0.38, s * 0.02); p.moveTo(-s * 0.2, s * 0.04); p.lineTo(s * 0.2, s * 0.42); p.moveTo(s * 0.2, s * 0.04); p.lineTo(-s * 0.2, s * 0.42); }, W, 0.024);
        dots(ctx, [[-s * 0.35, s * 0.0], [-s * 0.35, s * 0.15], [-s * 0.35, s * 0.3], [s * 0.35, s * 0.0], [s * 0.35, s * 0.15], [s * 0.35, s * 0.3]], s * 0.02, W);
      }
    },
    burrow: {
      build: function (p, s) { p.moveTo(-s * 0.52, s * 0.42); p.bezierCurveTo(-s * 0.5, -s * 0.2, -s * 0.24, -s * 0.42, 0, -s * 0.42); p.bezierCurveTo(s * 0.24, -s * 0.42, s * 0.5, -s * 0.2, s * 0.52, s * 0.42); p.closePath(); },
      deco: function (ctx, s) {
        pipe(ctx, s, function (p) {
          [[-0.3, -0.18], [-0.1, -0.34], [0.14, -0.32], [0.33, -0.16]].forEach(function (q) { var x = q[0] * s, y = q[1] * s; p.moveTo(x - s * 0.05, y + s * 0.03); p.lineTo(x - s * 0.02, y - s * 0.05); p.moveTo(x, y + s * 0.03); p.lineTo(x + s * 0.005, y - s * 0.07); p.moveTo(x + s * 0.05, y + s * 0.03); p.lineTo(x + s * 0.03, y - s * 0.05); });
        }, ICE.sage, 0.022);
        flood(ctx, s, function (p) { p.moveTo(-s * 0.2, s * 0.4); p.bezierCurveTo(-s * 0.2, s * 0.08, -s * 0.12, -s * 0.02, 0, -s * 0.02); p.bezierCurveTo(s * 0.12, -s * 0.02, s * 0.2, s * 0.08, s * 0.2, s * 0.4); p.closePath(); }, '#3B2216', 0, 0, 0);
        pipe(ctx, s, function (p) { p.moveTo(-s * 0.24, s * 0.4); p.bezierCurveTo(-s * 0.24, s * 0.04, -s * 0.14, -s * 0.06, 0, -s * 0.06); p.bezierCurveTo(s * 0.14, -s * 0.06, s * 0.24, s * 0.04, s * 0.24, s * 0.4); }, W, 0.024);
        // carrot
        flood(ctx, s, function (p) { p.moveTo(s * 0.3, s * 0.08); p.quadraticCurveTo(s * 0.4, s * 0.06, s * 0.42, s * 0.12); p.lineTo(s * 0.36, s * 0.38); p.quadraticCurveTo(s * 0.34, s * 0.4, s * 0.33, s * 0.37); p.closePath(); }, '#E9A060', s * 0.34, s * 0.12, s * 0.06);
        pipe(ctx, s, function (p) { p.moveTo(s * 0.36, s * 0.08); p.lineTo(s * 0.32, s * 0.0); p.moveTo(s * 0.37, s * 0.08); p.lineTo(s * 0.4, -s * 0.01); }, ICE.sageDk, 0.02);
        dots(ctx, [[-s * 0.36, s * 0.3, s * 0.03], [-s * 0.3, s * 0.36, s * 0.022], [-s * 0.4, s * 0.38, s * 0.02]], 0, '#C9BBA8');
      }
    },
    bowl: {
      build: function (p, s) { C(p, 0, s * 0.07, s * 0.43); poly(p, sc([[-0.27, -0.49], [0.27, -0.49], [0.27, -0.3], [-0.27, -0.3]], s), s * 0.05); },
      deco: function (ctx, s) {
        var glass = function (p) { C(p, 0, s * 0.07, s * 0.37); };
        flood(ctx, s, glass, '#EAF2F1', -s * 0.15, -s * 0.12, s * 0.25);
        ctx.save(); ctx.beginPath(); glass(ctx); ctx.clip();
        flood(ctx, s, function (p) { p.moveTo(-s * 0.5, -s * 0.04); p.quadraticCurveTo(-s * 0.25, -s * 0.1, 0, -s * 0.04); p.quadraticCurveTo(s * 0.25, s * 0.02, s * 0.5, -s * 0.04); p.lineTo(s * 0.5, s * 0.5); p.lineTo(-s * 0.5, s * 0.5); p.closePath(); }, ICE.aqua, -s * 0.15, s * 0.05, s * 0.25);
        dots(ctx, [[-s * 0.2, s * 0.38, s * 0.05], [-s * 0.08, s * 0.41, s * 0.045], [s * 0.05, s * 0.4, s * 0.05], [s * 0.18, s * 0.37, s * 0.045]], 0, '#C9BBA8');
        ctx.restore();
        pipe(ctx, s, function (p) { p.moveTo(-s * 0.3, -s * 0.04); p.quadraticCurveTo(-s * 0.15, -s * 0.09, 0, -s * 0.04); p.quadraticCurveTo(s * 0.15, s * 0.01, s * 0.3, -s * 0.04); }, W, 0.022);
        flood(ctx, s, function (p) { rr(p, -s * 0.23, -s * 0.45, s * 0.46, s * 0.1, s * 0.04); }, W, -s * 0.1, -s * 0.44, s * 0.08);
        pipe(ctx, s, function (p) { C(p, s * 0.12, s * 0.08, s * 0.035); C(p, s * 0.2, -s * 0.0, s * 0.022); C(p, s * 0.06, s * 0.2, s * 0.025); }, W, 0.014);
        pipe(ctx, s, function (p) { p.moveTo(-s * 0.26, -s * 0.12); p.quadraticCurveTo(-s * 0.32, s * 0.04, -s * 0.26, s * 0.2); }, '#FFFFFF', 0.025);
      }
    },
    basket: {
      pre: function (ctx, s, P, E) {   // the handle: a thick dough strap drawn behind the body
        var arc = function (p) { p.moveTo(-s * 0.36, s * 0.02); p.bezierCurveTo(-s * 0.36, -s * 0.58, s * 0.36, -s * 0.58, s * 0.36, s * 0.02); };
        var hw = s * 0.08;
        ctx.beginPath(); arc(ctx); ctx.lineCap = 'round';
        ctx.lineWidth = hw + 2 * E; ctx.strokeStyle = P.outline; ctx.stroke();
        ctx.lineWidth = hw + 2 * (E - Math.max(1.6, E * 0.3)); ctx.strokeStyle = P.rim; ctx.stroke();
        ctx.lineWidth = hw; ctx.strokeStyle = P.dough; ctx.stroke();
        pipe(ctx, s, function (p) { for (var i = 1; i < 8; i++) { var t = i / 8, x = -s * 0.36 * (1 - 2 * t), y = s * 0.02 + (-s * 0.58 + s * 0.02) * 1.5 * t * (1 - t) * 2; p.moveTo(x - s * 0.02, y - s * 0.025); p.lineTo(x + s * 0.02, y + s * 0.025); } }, W, 0.018);
      },
      build: function (p, s) { poly(p, sc([[-0.5, -0.05], [0.5, -0.05], [0.38, 0.45], [-0.38, 0.45]], s), s * 0.07); },
      deco: function (ctx, s) {
        flood(ctx, s, function (p) { p.moveTo(-s * 0.36, -s * 0.03); p.quadraticCurveTo(-s * 0.3, -s * 0.22, 0, -s * 0.2); p.quadraticCurveTo(s * 0.3, -s * 0.22, s * 0.36, -s * 0.03); p.closePath(); }, ICE.pink, -s * 0.12, -s * 0.16, s * 0.12);
        pipe(ctx, s, function (p) { p.moveTo(-s * 0.46, s * 0.04); p.lineTo(s * 0.46, s * 0.04); }, W, 0.03);
        pipe(ctx, s, function (p) {
          for (var r = 0; r < 3; r++) { var y = s * (0.12 + r * 0.11), x0 = -s * (0.4 - r * 0.03), x1 = -x0, st = (x1 - x0) / 6;
            for (var i = 0; i < 6; i++) { var x = x0 + i * st + (r % 2 ? st * 0.5 : 0); if (x + st * 0.7 > x1 + 1) continue; p.moveTo(x + st * 0.15, y); p.lineTo(x + st * 0.7, y); } }
        }, W, 0.03);
        pipe(ctx, s, function (p) { p.moveTo(-s * 0.37, s * 0.43); p.lineTo(s * 0.37, s * 0.43); }, W, 0.024);
      }
    }
  };

  // ================================================================ GLYPHS (embossed numerals / letters)
  var glyphM = {};
  function glyphFit(ctx, text, size) {
    var k = text + '|' + Math.round(size);
    if (glyphM[k]) return glyphM[k];
    var target = size * 0.56, maxW = size * (text.length > 1 ? 0.64 : 0.56);
    ctx.save();
    ctx.font = '900 100px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    var m = ctx.measureText(text) || {}, h, w, asc, dsc;
    ctx.restore();
    if (m.actualBoundingBoxAscent != null && isFinite(m.actualBoundingBoxAscent) && (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) > 1) {
      asc = m.actualBoundingBoxAscent; dsc = m.actualBoundingBoxDescent; h = asc + dsc;
      w = (m.actualBoundingBoxRight != null ? m.actualBoundingBoxLeft + m.actualBoundingBoxRight : m.width) || 60;
    } else { asc = 72; dsc = 0; h = 72; w = num(m.width, 60 * text.length) || 60 * text.length; }
    var f = target / h, sx = 1;
    if (w * f > maxW) { sx = Math.max(0.74, maxW / (w * f)); if (w * f * sx > maxW) f = maxW / (w * sx); }
    var r = { fs: 100 * f, sx: sx, dy: (asc - dsc) / 2 * f, dx: m.actualBoundingBoxLeft != null && m.actualBoundingBoxRight != null ? (m.actualBoundingBoxLeft - m.actualBoundingBoxRight) / 2 * f : 0 };
    glyphM[k] = r;
    return r;
  }
  function glyphDeco(ctx, text, s, full) {
    text = String(text == null ? '' : text);
    if (!text) return;
    var g = glyphFit(ctx, text, full), b = Math.max(1, full * 0.016);
    ctx.save();
    ctx.font = '900 ' + g.fs.toFixed(1) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.scale(g.sx, 1);
    var x = g.dx / g.sx, y = g.dy;
    ctx.lineJoin = 'round';
    // pressed into the dough: dark inner edge top-left, light bevel bottom-right, glyph body
    ctx.fillStyle = rgba('#5E3A1C', 0.55); ctx.fillText(text, x - b * 0.8, y - b * 0.8);
    ctx.fillStyle = DOUGH.bevel; ctx.fillText(text, x + b, y + b * 1.2);
    ctx.fillStyle = DOUGH.glyph; ctx.fillText(text, x, y);
    ctx.restore();
  }

  // ================================================================ COOKIE
  var PORES = [];
  (function () { var a = 0.7; for (var i = 0; i < 16; i++) { a += 2.399963; var r = Math.sqrt((i + 0.5) / 16) * 0.4; PORES.push([Math.cos(a) * r, Math.sin(a) * r, 0.006 + (i % 3) * 0.003]); } })();

  function specOf(ck) {
    var kind = ck.kind || 'round', A, H;
    if (kind === 'shape') return { key: 'shape:' + (SHAPE_B[ck.shape] ? ck.shape : 'circle'), build: SHAPE_B[ck.shape] || SHAPE_B.circle, P: DOUGH };
    if (kind === 'animal' && (A = ANIMAL[ck.animal])) return { key: 'animal:' + ck.animal, build: A.build, deco: A.deco, P: DOUGH };
    if (kind === 'home' && (H = HOME[ck.home])) return { key: 'home:' + ck.home, build: H.build, deco: H.deco, pre: H.pre, P: GINGER };
    if (kind === 'glyph') return { key: 'round', build: SHAPE_B.circle, glyph: ck.text != null ? ck.text : ck.n, P: DOUGH };
    return { key: 'round', build: SHAPE_B.circle, P: DOUGH };
  }
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
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
    ctx.strokeStyle = 'rgba(122,74,36,' + (0.85 * sel).toFixed(3) + ')'; ctx.lineWidth = Math.max(5, rx * 0.12); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,' + sel.toFixed(3) + ')'; ctx.lineWidth = Math.max(3, rx * 0.065);
    if (ctx.setLineDash) { ctx.setLineDash([rx * 0.24, rx * 0.11]); ctx.lineDashOffset = -time * 30; }
    ctx.stroke();
    if (ctx.setLineDash) { ctx.setLineDash([]); ctx.lineDashOffset = 0; }
  }

  function drawCookie(ctx, ck, size, opt) {
    if (!ck) return;
    size = num(size); if (!(size > 1)) return;
    opt = opt || {};
    var time = opt.time == null ? nowSec() : num(opt.time);
    var lift = clamp01(opt.lift), wob = num(opt.wob), glow = clamp01(opt.glow), dim = amt(opt.dim), sel = amt(opt.selected), spk = clamp01(opt.sparkle);
    var sy = opt.sy != null ? num(opt.sy, 1) : opt.squash != null ? num(opt.squash, 1) : 1;
    var sx = opt.sx != null ? num(opt.sx, 1) : 1 + (1 - sy) * 0.6;
    if (!(sy > 0.05)) sy = 0.05; if (!(sx > 0.05)) sx = 0.05;
    var S = specOf(ck), P = S.P;
    var R = size * 0.045, lw = Math.max(1.6, size * 0.018), E = R + lw, si = Math.max(4, size - 2 * E);
    var bodyS = shape(S.key + '|' + Math.round(si * 2) / 2, function (p) { S.build(p, si); });

    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (dim) ctx.globalAlpha *= 1 - 0.18 * dim;
    // shadow on the tray (stays on the surface while the cookie lifts)
    ctx.save();
    var so = size * (0.03 + 0.07 * lift), ss = 1 - 0.08 * lift;
    ctx.translate(wob * 0.5, so); ctx.scale(ss * sx, ss * Math.min(1, sy));
    ctx.fillStyle = rgba('#5A3418', 0.12 * (1 - 0.5 * lift)); ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 2 * E + size * 0.05;
    strokeS(ctx, bodyS); fillS(ctx, bodyS);
    ctx.fillStyle = rgba('#5A3418', 0.16 * (1 - 0.6 * lift)); ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 2 * E;
    strokeS(ctx, bodyS); fillS(ctx, bodyS);
    ctx.restore();

    ctx.translate(wob, -size * 0.12 * lift); ctx.rotate(wob * 0.012);
    ctx.translate(0, size * 0.5 * (1 - sy)); ctx.scale(sx, sy);
    var ls = 1 + 0.05 * lift + 0.03 * sel; ctx.scale(ls, ls);

    if (glow > 0) {
      var pulse = 0.6 + 0.4 * Math.sin(time * 6);
      ctx.strokeStyle = 'rgba(255,200,60,' + (0.35 * glow * pulse).toFixed(3) + ')'; ctx.lineWidth = 2 * E + size * 0.14; strokeS(ctx, bodyS);
      ctx.strokeStyle = 'rgba(255,226,120,' + (0.75 * glow).toFixed(3) + ')'; ctx.lineWidth = 2 * E + size * 0.06; strokeS(ctx, bodyS);
    }
    if (S.pre) S.pre(ctx, si, P, E);
    // baked body: outline → rim → mid → dough fill (strokes under the fill = clean union edges)
    ctx.strokeStyle = P.outline; ctx.lineWidth = 2 * E; strokeS(ctx, bodyS);
    ctx.strokeStyle = P.rim; ctx.lineWidth = 2 * R; strokeS(ctx, bodyS);
    ctx.strokeStyle = mix(P.rim, P.dough, 0.5); ctx.lineWidth = R * 1.1; strokeS(ctx, bodyS);
    var g = ctx.createRadialGradient(-si * 0.18, -si * 0.22, 0, -si * 0.05, -si * 0.05, si * 0.72);
    g.addColorStop(0, P.light); g.addColorStop(0.5, P.dough); g.addColorStop(1, mix(P.dough, P.shade, 0.45));
    ctx.fillStyle = g; fillS(ctx, bodyS);
    if (size > 50) {
      ctx.save(); clipS(ctx, bodyS);
      ctx.fillStyle = rgba(P.shade, 0.4); ctx.beginPath();
      for (var i = 0; i < PORES.length; i++) C(ctx, PORES[i][0] * si * 1.1, PORES[i][1] * si * 1.1, Math.max(0.7, PORES[i][2] * si));
      ctx.fill();
      var hg = ctx.createRadialGradient(-si * 0.22, -si * 0.26, 0, -si * 0.22, -si * 0.26, si * 0.34);
      hg.addColorStop(0, 'rgba(255,246,222,0.45)'); hg.addColorStop(1, 'rgba(255,246,222,0)');
      ctx.fillStyle = hg; ctx.fillRect(-si * 0.6, -si * 0.6, si * 0.8, si * 0.8);
      ctx.restore();
    }
    if (S.deco) { ctx.save(); S.deco(ctx, si); ctx.restore(); }
    if (S.glyph != null) glyphDeco(ctx, S.glyph, si, size);

    var ice = ck.icing || [], extra = opt.icing || [], box = opt.icingBox || ck.icingBox || {};
    if (ice.length || extra.length || (ck.chips && ck.chips.length)) {
      var bs = num(box.size, 330) || 330, k = size / bs, cx = num(box.cx, 300), cy = num(box.cy, 200);
      ctx.save(); ctx.scale(k, k); ctx.translate(-cx, -cy);
      ice.concat(extra).forEach(function (q) {
        if (!q || !q.pts || !q.pts.length) return;
        if (Array.isArray(q.pts[0]) && Array.isArray(q.pts[0][0])) q.pts.forEach(function (st) { drawIcing(ctx, st, q.hex, q.width || 22, { wet: 0 }); });
        else drawIcing(ctx, q.pts, q.hex, q.width || 22, { wet: q.wet || 0 });
      });
      (ck.chips || []).forEach(function (c) { ctx.save(); ctx.translate(num(c.x), num(c.y)); drawChip(ctx, num(c.r, 15) || 15, { squash: c.squash }); ctx.restore(); });
      ctx.restore();
    }
    if (dim) {   // a soft flour veil: reads "not now" without showing the layers through
      ctx.fillStyle = ctx.strokeStyle = 'rgba(246,238,226,' + (0.55 * dim).toFixed(3) + ')'; ctx.lineWidth = 2 * E;
      strokeS(ctx, bodyS); fillS(ctx, bodyS);
    }
    if (sel > 0) selRing(ctx, size * 0.58, size * 0.58, sel, time);
    if (spk > 0) drawSparkles(ctx, size * 0.48, spk, time, (S.key.length * 1.7) % 6);
    ctx.restore();
  }

  // ================================================================ ICING POLYLINE
  function polyPath(p, pts) {
    var n = pts.length, i, q = pts[0];
    p.moveTo(num(q[0]), num(q[1]));
    if (n === 1) { p.lineTo(num(q[0]) + 0.01, num(q[1])); return; }
    for (i = 1; i < n; i++) { q = pts[i]; p.lineTo(num(q[0]), num(q[1])); }
  }
  function drawIcing(ctx, pts, hex, width, opt) {
    if (!pts || !pts.length) return;
    opt = opt || {};
    var c = pal(hex) || { base: '#FFF8EC', dark: '#C9B89C', light: '#FFFFFF' };
    var w = num(width, 22) || 22, wet = opt.wet == null ? 0.6 : clamp01(opt.wet), u = w / 22;
    var S = tmp(function (p) { polyPath(p, pts); });
    ctx.save();
    if (opt.alpha != null) ctx.globalAlpha *= clamp01(opt.alpha);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // 1 dark edge all round (QA P2-3: yellow / orange read on dough + parchment) + the raised under-edge: one stroke,
    //   offset 1.2 down, ≥ 1.2 CSS px on top, thicker below. Colour = the dark tone pushed towards brown.
    var ow = Math.max(1.6 * u, 1.3 / screenScale(ctx, opt));
    ctx.save(); ctx.translate(0, 1.2 * u); ctx.lineWidth = w + 2 * ow + 2.4 * u; ctx.strokeStyle = mix(c.dark, '#3A2010', 0.35); strokeS(ctx, S); ctx.restore();
    // 2 body
    ctx.lineWidth = w; ctx.strokeStyle = c.base; strokeS(ctx, S);
    // 3 gloss line (light tone, −3 px, 30 %)
    ctx.save(); ctx.translate(-0.6 * u, -3 * u); ctx.lineWidth = w * 0.3; ctx.strokeStyle = rgba(mix(c.light, '#FFFFFF', 0.35 * wet), 0.55 + 0.4 * wet); strokeS(ctx, S); ctx.restore();
    // specular dots (one fill)
    var n = pts.length, step = Math.max(1, Math.round(9 / Math.max(0.3, u))), r = w * (0.07 + 0.04 * wet);
    ctx.fillStyle = 'rgba(255,255,255,' + (0.45 + 0.5 * wet).toFixed(3) + ')';
    ctx.beginPath();
    for (var i = 2; i < n; i += step) { var q = pts[i]; C(ctx, num(q[0]) - 0.8 * u, num(q[1]) - 3.6 * u, r * (i % (step * 2) ? 0.7 : 1)); }
    if (n <= 2) C(ctx, num(pts[0][0]) - 2 * u, num(pts[0][1]) - 3 * u, r);
    ctx.fill();
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
    ctx.fillStyle = 'rgba(80,45,15,0.35)'; ctx.beginPath(); C(ctx, 0, 2, 15); ctx.fill();
    ctx.fillStyle = '#9A6330'; ctx.beginPath(); C(ctx, 0, 0, 15); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#FFF8EC'; ctx.stroke();
    ctx.fillStyle = '#FFF8EC'; ctx.font = '900 19px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(n), 0, 1);
    ctx.restore();
  }
  /** CSS px per local unit: the ctx transform scale ÷ devicePixelRatio (render.js puts DPR into its transform), or
   *  opt.screenScale when the caller knows it. Falls back to 1 (mock contexts / no getTransform). */
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
    // minimum on-screen sizes (QA P2-5): dots ≥ 11 CSS px across, start ring ≥ 40 CSS px across, at any tray scale
    var sc = screenScale(ctx, opt), DR = Math.max(7, 5.6 / sc), RR = Math.max(24, 20.5 / sc), f = RR / 24;
    var SP = Math.max(22, DR * 3.1), px = 1 / sc;
    var EDGE = '#7A4A22';   // ≥ 4:1 on dough #E9B872 and ≥ 7:1 on parchment #FFF8EC
    ctx.save();
    if (opt.alpha != null) ctx.globalAlpha *= clamp01(opt.alpha);
    // collect dots
    var dotsCur = [], dotsLater = [];
    for (k = cur; k < ns; k++) {
      var st = strokes[k], pts = st.pts; if (!pts || !pts.length) continue;
      var L = arcLengths(st), tot = L[L.length - 1], s0 = k === cur ? d + RR + DR * 0.6 : RR * 0.6 + DR, end = st.closed ? tot - DR * 2 : tot + 0.01;
      var first = Math.ceil(s0 / SP) * SP;
      var lastX = 1e9, lastY = 1e9, list = k === cur ? dotsCur : dotsLater, MIN2 = (SP * 0.62) * (SP * 0.62);
      for (var s = first; s <= end; s += SP) {   // skip dots that bunch up across a sharp corner
        var q = at(pts, L, s), dx = q.x - lastX, dy = q.y - lastY;
        if (dx * dx + dy * dy < MIN2) continue;
        list.push([q.x, q.y, s - d]); lastX = q.x; lastY = q.y;
      }
      if (!st.closed && tot - (k === cur ? d : 0) > RR + DR) { var qe = at(pts, L, tot), ex = qe.x - lastX, ey = qe.y - lastY; if (ex * ex + ey * ey > MIN2) list.push([qe.x, qe.y, tot - d]); }
    }
    // hint glow under the next dots
    if (glow > 0) {
      ctx.fillStyle = 'rgba(255,206,80,' + (0.5 * glow).toFixed(3) + ')'; ctx.beginPath();
      for (i = 0; i < dotsCur.length; i++) C(ctx, dotsCur[i][0], dotsCur[i][1], DR * 2.1);
      ctx.fill();
    }
    // two-tone dots (QA P1-2): soft shadow → warm brown ring → cream centre; readable on dough AND parchment
    function dotPass(list, a, wave) {
      if (!list.length) return;
      var R = [], ring = Math.max(1.6 * px, DR * 0.26);
      for (i = 0; i < list.length; i++) {
        var r = DR;
        if (wave) { var z = list[i][2] / 260 - ph; z = z - Math.floor(z); r = DR * (1 + 0.28 * Math.max(0, 1 - Math.abs(z - 0.5) * 6)); }
        R.push(r);
      }
      ctx.fillStyle = 'rgba(80,45,15,' + (0.3 * a).toFixed(3) + ')'; ctx.beginPath();
      for (i = 0; i < list.length; i++) C(ctx, list[i][0] + 0.6 * f, list[i][1] + 1.8 * f, R[i] + ring * 0.5);
      ctx.fill();
      ctx.fillStyle = rgba(EDGE, a); ctx.beginPath();
      for (i = 0; i < list.length; i++) C(ctx, list[i][0], list[i][1], R[i]);
      ctx.fill();
      ctx.fillStyle = a < 1 ? 'rgba(255,248,236,' + a.toFixed(3) + ')' : '#FFF8EC'; ctx.beginPath();
      for (i = 0; i < list.length; i++) C(ctx, list[i][0], list[i][1], R[i] - ring);
      ctx.fill();
    }
    dotPass(dotsLater, 0.6, false);
    dotPass(dotsCur, 1, true);
    // later strokes: small start rings
    for (k = cur + 1; k < ns; k++) {
      var sk = strokes[k]; if (!sk.pts || !sk.pts.length) continue;
      var p0 = at(sk.pts, arcLengths(sk), 0), r0 = RR * 0.55;
      ctx.lineWidth = 6 * f; ctx.strokeStyle = 'rgba(122,74,34,0.75)'; ctx.beginPath(); C(ctx, p0.x, p0.y, r0); ctx.stroke();
      ctx.lineWidth = 3 * f; ctx.strokeStyle = 'rgba(255,248,236,0.95)'; ctx.stroke();
    }
    // start marker (QA P1-2): gold-filled pulsing disc, white ring, dark outline
    var cs = strokes[cur], Lc2 = arcLengths(cs), pS = at(cs.pts, Lc2, d), pA = at(cs.pts, Lc2, d + RR * 1.6);
    var rr0 = RR * (1 + 0.08 * pw);
    var gg = ctx.createRadialGradient(pS.x, pS.y, rr0 * 0.5, pS.x, pS.y, rr0 * 1.9);
    gg.addColorStop(0, 'rgba(255,231,168,' + (0.8 + 0.2 * glow).toFixed(3) + ')'); gg.addColorStop(1, 'rgba(255,231,168,0)');
    ctx.fillStyle = gg; ctx.beginPath(); C(ctx, pS.x, pS.y, rr0 * 1.9); ctx.fill();
    ctx.lineWidth = 8 * f; ctx.strokeStyle = 'rgba(80,45,15,0.3)'; ctx.beginPath(); C(ctx, pS.x + 0.8 * f, pS.y + 2.4 * f, rr0); ctx.stroke();
    ctx.beginPath(); C(ctx, pS.x, pS.y, rr0);
    ctx.fillStyle = 'rgba(255,' + Math.round(200 + 20 * pw) + ',' + Math.round(80 + 30 * pw) + ',' + (0.5 + 0.12 * pw).toFixed(3) + ')'; ctx.fill();   // see-through: the animal / cookie under the start stays visible
    ctx.lineWidth = 9 * f; ctx.strokeStyle = EDGE; ctx.stroke();
    ctx.lineWidth = 5 * f; ctx.strokeStyle = '#FFFFFF'; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); El(ctx, pS.x - rr0 * 0.3, pS.y - rr0 * 0.32, rr0 * 0.26, rr0 * 0.16, -0.6); ctx.fill();
    // outward ping ring
    ctx.lineWidth = 3 * f; ctx.strokeStyle = 'rgba(255,255,255,' + (0.8 * (1 - ph)).toFixed(3) + ')'; ctx.beginPath(); C(ctx, pS.x, pS.y, rr0 * (1 + 0.6 * ph)); ctx.stroke();
    // direction chevron just ahead of the ring, on the path (outlined)
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
    // stroke-number badges (several strokes)
    if (ns > 1) {
      for (k = cur; k < ns; k++) {
        var bk = strokes[k]; if (!bk.pts || !bk.pts.length) continue;
        var Lb = arcLengths(bk), pb = at(bk.pts, Lb, k === cur ? d : 0), pn = at(bk.pts, Lb, (k === cur ? d : 0) + 12), a2 = Math.atan2(pn.y - pb.y, pn.x - pb.x);
        if (!isFinite(a2)) a2 = 0;
        var off = (k === cur ? RR + 20 * f : RR * 0.55 + 18 * f), nx = Math.sin(a2), ny = -Math.cos(a2);
        // place on the side pointing up / left
        if (ny > 0 || (Math.abs(ny) < 0.2 && nx > 0)) { nx = -nx; ny = -ny; }
        badge(ctx, pb.x + nx * off - Math.cos(a2) * 8 * f, pb.y + ny * off - Math.sin(a2) * 8 * f, k + 1, k === cur ? 1 : 0.75, f);
      }
    }
    ctx.restore();
  }

  // ================================================================ ICING BAG
  function drawIcingBag(ctx, hex, size, angle, opt) {
    opt = opt || {};
    var s = num(size, 120) || 120;
    var empty = !!opt.empty || !hex, c = empty ? { base: '#FFF3DE', dark: '#C9B392', light: '#FFFFFF' } : (pal(hex) || { base: '#FFF3DE', dark: '#C9B392', light: '#FFFFFF' });
    var sq = clamp01(opt.squeeze), lift = clamp01(opt.lift), wob = num(opt.wob), glow = clamp01(opt.glow), sel = amt(opt.selected), dim = amt(opt.dim);
    var time = opt.time == null ? nowSec() : num(opt.time);
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (dim) ctx.globalAlpha *= 1 - 0.5 * dim;
    if (opt.center) ctx.translate(0, -BAG_CENTER * s);   // the origin given was the visual centre: move to the tip
    ctx.rotate(num(angle));
    ctx.translate(wob * 0.4, -s * 0.12 * lift); ctx.rotate(wob * 0.015);
    var ls = 1 + 0.05 * lift + 0.04 * sel; ctx.translate(0, BAG_CENTER * s); ctx.scale(ls, ls); ctx.translate(0, -BAG_CENTER * s);
    var bw = 1 + 0.17 * sq, top = -s * (0.87 - 0.05 * sq), lw = Math.max(1.5, s * 0.016);
    function bag(p) {
      var nb = -s * 0.2;
      p.moveTo(-s * 0.072, nb);
      p.bezierCurveTo(-s * 0.15 * bw, -s * 0.36, -s * 0.275 * bw, -s * 0.55, -s * 0.272 * bw, top + s * 0.15);
      p.bezierCurveTo(-s * 0.27 * bw, top + s * 0.06, -s * 0.15, top + s * 0.02, -s * 0.055, top);
      p.lineTo(s * 0.055, top);
      p.bezierCurveTo(s * 0.15, top + s * 0.02, s * 0.27 * bw, top + s * 0.06, s * 0.272 * bw, top + s * 0.15);
      p.bezierCurveTo(s * 0.275 * bw, -s * 0.55, s * 0.15 * bw, -s * 0.36, s * 0.072, nb);
      p.closePath();
    }
    var cy = BAG_CENTER * s;
    if (glow > 0) {
      var pg = 0.7 + 0.3 * Math.sin(time * 6), hg = ctx.createRadialGradient(0, cy, s * 0.15, 0, cy, s * 0.62);
      hg.addColorStop(0, 'rgba(255,214,90,' + (0.6 * glow * pg).toFixed(3) + ')'); hg.addColorStop(1, 'rgba(255,214,90,0)');
      ctx.fillStyle = hg; ctx.beginPath(); C(ctx, 0, cy, s * 0.62); ctx.fill();
    }
    // twisted film above the gather
    var ty = top;
    ctx.beginPath(); ctx.moveTo(-s * 0.05, ty + s * 0.01);
    ctx.bezierCurveTo(-s * 0.035, ty - s * 0.05, -s * 0.06, ty - s * 0.09, -s * 0.03, ty - s * 0.12);
    ctx.quadraticCurveTo(0, ty - s * 0.14, s * 0.035, ty - s * 0.115);
    ctx.bezierCurveTo(s * 0.05, ty - s * 0.08, s * 0.03, ty - s * 0.05, s * 0.05, ty + s * 0.01); ctx.closePath();
    ctx.fillStyle = 'rgba(246,246,250,0.96)'; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = '#8F8C96'; ctx.stroke();
    ctx.beginPath();
    for (var tw = 0; tw < 3; tw++) { var yy = ty - s * (0.03 + tw * 0.032); ctx.moveTo(-s * 0.035, yy + s * 0.012); ctx.quadraticCurveTo(0, yy - s * 0.004, s * 0.035, yy - s * 0.016); }
    ctx.lineWidth = lw * 0.75; ctx.strokeStyle = 'rgba(143,140,150,0.85)'; ctx.stroke();
    // bag film + icing inside
    ctx.beginPath(); bag(ctx); ctx.fillStyle = 'rgba(246,246,250,0.96)'; ctx.fill();
    ctx.save(); ctx.beginPath(); bag(ctx); ctx.clip();
    var fill = top + s * (0.17 - 0.03 * sq);
    var ig = ctx.createLinearGradient(-s * 0.28, 0, s * 0.28, 0);
    ig.addColorStop(0, c.light); ig.addColorStop(0.3, c.base); ig.addColorStop(0.75, c.base); ig.addColorStop(1, c.dark);
    ctx.fillStyle = ig; ctx.beginPath();
    ctx.moveTo(-s * 0.4, fill + s * 0.02);
    ctx.quadraticCurveTo(-s * 0.2, fill - s * 0.035, -s * 0.04, fill + s * 0.005); ctx.quadraticCurveTo(s * 0.13, fill + s * 0.045, s * 0.4, fill - s * 0.01);
    ctx.lineTo(s * 0.4, 0); ctx.lineTo(-s * 0.4, 0); ctx.closePath(); ctx.fill();
    // gathered creases on the shoulders (towards the twist)
    ctx.lineWidth = lw * 0.8; ctx.strokeStyle = 'rgba(140,136,150,0.55)'; ctx.beginPath();
    [-0.2, -0.1, 0.08, 0.18].forEach(function (fx) { ctx.moveTo(fx * s * bw, fill - s * 0.005); ctx.quadraticCurveTo(fx * s * 0.7, top + s * 0.05, fx * s * 0.25, top + s * 0.005); });
    ctx.stroke();
    // film over the icing: veil + streak highlights + a darker fold
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(-s * 0.4, top - s * 0.1, s * 0.8, s);
    ctx.lineWidth = lw * 2.6; ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.moveTo(-s * 0.17 * bw, top + s * 0.2); ctx.bezierCurveTo(-s * 0.19 * bw, -s * 0.5, -s * 0.12, -s * 0.34, -s * 0.05, -s * 0.24); ctx.stroke();
    ctx.lineWidth = lw; ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath(); ctx.moveTo(-s * 0.1 * bw, top + s * 0.24); ctx.quadraticCurveTo(-s * 0.1 * bw, -s * 0.42, -s * 0.03, -s * 0.28); ctx.stroke();
    ctx.lineWidth = lw * 0.9; ctx.strokeStyle = rgba(c.dark, 0.4);
    ctx.beginPath(); ctx.moveTo(s * 0.14 * bw, top + s * 0.22); ctx.quadraticCurveTo(s * 0.15 * bw, -s * 0.45, s * 0.05, -s * 0.26); ctx.stroke();
    ctx.restore();
    ctx.beginPath(); bag(ctx); ctx.lineWidth = lw * 1.3; ctx.strokeStyle = mix(c.dark, '#6E6A74', 0.3); ctx.stroke();
    // a coloured tie on the gather (the colour also reads from the top)
    ctx.beginPath(); rr(ctx, -s * 0.08, top - s * 0.035, s * 0.16, s * 0.05, s * 0.022);
    ctx.fillStyle = c.base; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = c.dark; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(-s * 0.055, top - s * 0.027, s * 0.07, s * 0.011);
    // coupler ring + star nozzle (silver)
    ctx.beginPath(); rr(ctx, -s * 0.09, -s * 0.225, s * 0.18, s * 0.05, s * 0.018);
    var cg = ctx.createLinearGradient(-s * 0.09, 0, s * 0.09, 0); cg.addColorStop(0, '#F2F4F7'); cg.addColorStop(0.5, '#B9C0CA'); cg.addColorStop(1, '#808999');
    ctx.fillStyle = cg; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = '#5A6271'; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-s * 0.068, -s * 0.178); ctx.lineTo(-s * 0.04, -s * 0.02);
    for (var i = 0; i <= 6; i++) { var x = -s * 0.04 + i * s * 0.08 / 6; ctx.lineTo(x, i % 2 ? -s * 0.02 : 0); }
    ctx.lineTo(s * 0.068, -s * 0.178); ctx.closePath();
    var ng = ctx.createLinearGradient(-s * 0.07, 0, s * 0.07, 0); ng.addColorStop(0, '#F6F8FA'); ng.addColorStop(0.45, '#C3C9D1'); ng.addColorStop(1, '#858E9C');
    ctx.fillStyle = ng; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = '#5A6271'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-s * 0.02, -s * 0.17); ctx.lineTo(-s * 0.013, -s * 0.03); ctx.moveTo(s * 0.02, -s * 0.17); ctx.lineTo(s * 0.013, -s * 0.03);
    ctx.lineWidth = lw * 0.7; ctx.strokeStyle = 'rgba(90,98,113,0.6)'; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(-s * 0.05, -s * 0.16, s * 0.012, s * 0.11);
    // icing at the tip while squeezing
    if (sq > 0.05 && !empty) {
      var br = s * 0.04 * (0.5 + 0.5 * sq);
      ctx.fillStyle = c.base; ctx.strokeStyle = c.dark; ctx.lineWidth = lw * 0.8;
      ctx.beginPath(); El(ctx, 0, br * 0.55, br * 1.05, br); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); C(ctx, -br * 0.35, br * 0.25, br * 0.3); ctx.fill();
    }
    if (sel > 0) { ctx.save(); ctx.translate(0, cy); selRing(ctx, s * 0.42, s * 0.56, sel, time); ctx.restore(); }
    ctx.restore();
  }

  // ================================================================ TRAY + RACK
  function drawTray(ctx, box, opt) {
    if (!box) return;
    opt = opt || {};
    var x = num(box.x), y = num(box.y), w = num(box.w), h = num(box.h);
    if (!(w > 0 && h > 0)) return;
    var time = opt.time == null ? nowSec() : num(opt.time);
    var F = Math.max(8, Math.min(num(opt.frame, 26) || 26, Math.min(w, h) * 0.06));
    var X = x - F, Y = y - F, WW = w + 2 * F, HH = h + 2 * F, R0 = F * 1.25;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.fillStyle = 'rgba(70,45,20,0.16)'; ctx.beginPath(); rr(ctx, X - 2, Y + F * 0.5, WW + 4, HH + 2, R0); ctx.fill();
    ctx.fillStyle = 'rgba(70,45,20,0.18)'; ctx.beginPath(); rr(ctx, X + 2, Y + F * 0.35, WW - 4, HH, R0); ctx.fill();
    if (opt.glow > 0) {
      var gl = clamp01(opt.glow), pu = 0.65 + 0.35 * Math.sin(time * 5);
      ctx.beginPath(); rr(ctx, X - 7, Y - 7, WW + 14, HH + 14, R0 + 7);
      ctx.lineWidth = 14; ctx.strokeStyle = 'rgba(255,206,70,' + (0.5 * gl * pu).toFixed(3) + ')'; ctx.stroke();
    }
    // rolled steel rim
    var g = ctx.createLinearGradient(0, Y, 0, Y + HH);
    g.addColorStop(0, '#E6E1DA'); g.addColorStop(0.15, '#C9C2B8'); g.addColorStop(0.85, '#B4ADA3'); g.addColorStop(1, '#9E968C');
    ctx.fillStyle = g; ctx.beginPath(); rr(ctx, X, Y, WW, HH, R0); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#7E766C'; ctx.stroke();
    ctx.lineWidth = Math.max(2, F * 0.14); ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); rr(ctx, X + F * 0.22, Y + F * 0.22, WW - F * 0.44, HH - F * 0.44, R0 * 0.85); ctx.stroke();
    // sloped inner wall
    var iw = F * 0.42;
    ctx.fillStyle = '#A9A197'; ctx.beginPath(); rr(ctx, x - iw, y - iw, w + 2 * iw, h + 2 * iw, F * 0.75); ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#857D73'; ctx.stroke();
    // parchment (slightly inset, soft curled corners)
    ctx.beginPath(); rr(ctx, x, y, w, h, F * 0.45);
    var pg = ctx.createLinearGradient(x, y, x + w, y + h); pg.addColorStop(0, '#FFFBF3'); pg.addColorStop(0.6, '#FFF8EC'); pg.addColorStop(1, '#F5EAD6');
    ctx.fillStyle = pg; ctx.fill();
    ctx.save(); ctx.clip();
    var sh = ctx.createLinearGradient(0, y, 0, y + Math.min(30, h * 0.08)); sh.addColorStop(0, 'rgba(120,90,50,0.16)'); sh.addColorStop(1, 'rgba(120,90,50,0)');
    ctx.fillStyle = sh; ctx.fillRect(x, y, w, Math.min(30, h * 0.08));
    // parchment fibres + two soft creases
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(190,160,120,0.12)'; ctx.beginPath();
    for (var i = 0; i < 14; i++) { var fx = x + ((i * 0.618) % 1) * w, fy = y + ((i * 0.377 + 0.11) % 1) * h; ctx.moveTo(fx, fy); ctx.lineTo(fx + w * 0.08, fy + h * 0.015); }
    ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(200,175,140,0.14)'; ctx.beginPath(); ctx.moveTo(x + w * 0.33, y); ctx.lineTo(x + w * 0.36, y + h); ctx.moveTo(x, y + h * 0.62); ctx.lineTo(x + w, y + h * 0.58); ctx.stroke();
    ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.moveTo(x + w * 0.33 + 2, y); ctx.lineTo(x + w * 0.36 + 2, y + h); ctx.stroke();
    ctx.restore();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(170,140,100,0.55)'; ctx.beginPath(); rr(ctx, x, y, w, h, F * 0.45); ctx.stroke();
    ctx.restore();
  }
  function drawRack(ctx, rack, opt) {
    if (!rack) return;
    var x = num(rack.x), y = num(rack.y), w = num(rack.w), h = num(rack.h);
    if (!(w > 0 && h > 0)) return;
    var r = Math.min(14, h * 0.18), lw = Math.max(2, Math.min(4, h * 0.035)), i;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.fillStyle = 'rgba(70,45,20,0.15)'; ctx.beginPath(); rr(ctx, x + 4, y + 8, w, h, r); ctx.fill();
    // feet
    ctx.fillStyle = '#8F887E';
    [x + r * 0.8, x + w - r * 0.8].forEach(function (fx) { ctx.beginPath(); rr(ctx, fx - lw * 1.4, y + h - 2, lw * 2.8, lw * 3, lw); ctx.fill(); });
    function wires(p) {
      var gap = Math.max(9, h * 0.13), n = Math.floor((w - 2 * r) / gap);
      for (i = 1; i <= n; i++) { var wx = x + r + (w - 2 * r) * i / (n + 1); p.moveTo(wx, y + lw); p.lineTo(wx, y + h - lw); }
      p.moveTo(x + lw, y + h * 0.36); p.lineTo(x + w - lw, y + h * 0.36);
      p.moveTo(x + lw, y + h * 0.66); p.lineTo(x + w - lw, y + h * 0.66);
    }
    ctx.beginPath(); wires(ctx);
    ctx.save(); ctx.translate(0, 1.5); ctx.lineWidth = lw * 0.9; ctx.strokeStyle = 'rgba(70,60,50,0.35)'; ctx.stroke(); ctx.restore();
    ctx.lineWidth = lw * 0.8; ctx.strokeStyle = '#9E978D'; ctx.stroke();
    ctx.lineWidth = lw * 0.3; ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.stroke();
    ctx.beginPath(); rr(ctx, x, y, w, h, r);
    ctx.save(); ctx.translate(0, 2); ctx.lineWidth = lw * 1.8; ctx.strokeStyle = 'rgba(70,60,50,0.35)'; ctx.stroke(); ctx.restore();
    ctx.lineWidth = lw * 1.6; ctx.strokeStyle = '#8F887E'; ctx.stroke();
    ctx.lineWidth = lw * 0.9; ctx.strokeStyle = '#CFC9C0'; ctx.stroke();
    ctx.lineWidth = lw * 0.3; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.stroke();
    ctx.restore();
  }

  // ================================================================ CHIP, SPRINKLE, PUFF
  function drawChip(ctx, r, opt) {
    r = num(r, 12) || 12; opt = opt || {};
    var q = opt.squash != null ? Math.max(0.3, num(opt.squash, 1)) : 1;
    ctx.save();
    ctx.translate(0, r * (1 - q) * 0.8); ctx.scale(1 + (1 - q) * 0.6, q);
    ctx.fillStyle = 'rgba(60,35,15,0.3)'; ctx.beginPath(); El(ctx, r * 0.12, r * 0.55, r * 1.05, r * 0.5); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-r, r * 0.35);
    ctx.bezierCurveTo(-r * 1.05, -r * 0.35, -r * 0.4, -r * 0.7, r * 0.12, -r * 1.0);
    ctx.quadraticCurveTo(r * 0.3, -r * 1.1, r * 0.3, -r * 0.85);
    ctx.bezierCurveTo(r * 0.8, -r * 0.6, r * 1.08, -r * 0.1, r, r * 0.35);
    ctx.quadraticCurveTo(0, r * 0.75, -r, r * 0.35); ctx.closePath();
    var g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r * 1.2);
    g.addColorStop(0, DOUGH.chipHi); g.addColorStop(0.55, DOUGH.chip); g.addColorStop(1, '#3E271A');
    ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = Math.max(1, r * 0.1); ctx.strokeStyle = '#33201A'; ctx.stroke();
    ctx.fillStyle = 'rgba(255,235,215,0.55)'; ctx.beginPath(); El(ctx, -r * 0.38, -r * 0.2, r * 0.22, r * 0.12, -0.7); ctx.fill();
    ctx.restore();
  }
  function drawSprinkle(ctx, hex, len, rot) {
    var c = pal(hex) || { base: '#FFFFFF', dark: '#C9B89C', light: '#FFFFFF' }, L = num(len, 12) || 12, w = Math.max(1.5, L * 0.32);
    ctx.save(); ctx.rotate(num(rot)); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-L / 2, 0); ctx.lineTo(L / 2, 0);
    ctx.lineWidth = w + 1.4; ctx.strokeStyle = c.dark; ctx.stroke();
    ctx.lineWidth = w; ctx.strokeStyle = c.base; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-L * 0.32, -w * 0.18); ctx.lineTo(L * 0.25, -w * 0.18);
    ctx.lineWidth = w * 0.3; ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.stroke();
    ctx.restore();
  }
  function drawFlourPuff(ctx, r, t) {
    r = num(r, 40) || 40; t = clamp01(t);
    if (t >= 1) return;
    var e = 1 - Math.pow(1 - t, 3), a = Math.pow(1 - t, 1.3);
    ctx.save();
    ctx.fillStyle = 'rgba(255,253,248,' + (0.85 * a).toFixed(3) + ')';
    ctx.beginPath();
    for (var i = 0; i < 8; i++) { var an = i * 0.785 + 0.4, d = r * (0.2 + 0.6 * e), cr = r * (0.36 - 0.12 * t) * (0.8 + 0.25 * (i % 3) / 2); C(ctx, Math.cos(an) * d, Math.sin(an) * d * 0.8 - r * 0.15 * e, cr); }
    C(ctx, 0, -r * 0.1 * e, r * (0.42 - 0.2 * t));
    ctx.fill();
    ctx.fillStyle = 'rgba(230,220,205,' + (0.35 * a).toFixed(3) + ')'; ctx.beginPath();
    for (var j = 0; j < 8; j++) { var an2 = j * 0.785 + 0.4, d2 = r * (0.2 + 0.6 * e); C(ctx, Math.cos(an2) * d2 + r * 0.06, Math.sin(an2) * d2 * 0.8 - r * 0.15 * e + r * 0.1, r * 0.12); }
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,' + (0.9 * a).toFixed(3) + ')'; ctx.beginPath();
    for (var k = 0; k < 10; k++) { var b = k * 0.628 + 0.2, dd = r * (0.5 + 0.75 * e) * (0.85 + 0.3 * (k % 2)); C(ctx, Math.cos(b) * dd, Math.sin(b) * dd * 0.85 - r * 0.2 * e, Math.max(0.8, r * 0.05 * (1 - t))); }
    ctx.fill();
    ctx.restore();
  }

  // ================================================================ ICONS
  function drawIcon(ctx, thing, size) {
    if (!thing) return;
    var s = num(size, 100) || 100, c;
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    switch (thing.kind) {
      case 'blob': {   // a swirl of icing (a dollop)
        c = pal(thing.color) || pal('#FFF3DE');
        var lobes = [[0, s * 0.22, s * 0.36, s * 0.13], [0, s * 0.06, s * 0.28, s * 0.12], [0, -s * 0.08, s * 0.2, s * 0.1], [0, -s * 0.2, s * 0.11, s * 0.08]];
        ctx.fillStyle = 'rgba(80,50,25,0.2)'; ctx.beginPath(); El(ctx, 0, s * 0.33, s * 0.38, s * 0.07); ctx.fill();
        for (var i = 0; i < lobes.length; i++) {
          var q = lobes[i];
          ctx.beginPath(); El(ctx, q[0], q[1], q[2], q[3]);
          ctx.fillStyle = c.base; ctx.fill(); ctx.lineWidth = Math.max(2, s * 0.03); ctx.strokeStyle = c.dark; ctx.stroke();
          ctx.fillStyle = rgba(c.light, 0.85); ctx.beginPath(); El(ctx, q[0] - q[2] * 0.4, q[1] - q[3] * 0.35, q[2] * 0.3, q[3] * 0.25, -0.2); ctx.fill();
        }
        ctx.beginPath(); ctx.moveTo(-s * 0.03, -s * 0.26); ctx.quadraticCurveTo(s * 0.02, -s * 0.38, s * 0.1, -s * 0.36);
        ctx.lineWidth = Math.max(4, s * 0.07); ctx.strokeStyle = c.dark; ctx.stroke(); ctx.lineWidth = Math.max(2.5, s * 0.045); ctx.strokeStyle = c.base; ctx.stroke();
        break;
      }
      case 'shape': {
        c = pal(thing.color);
        if (!c) { drawCookie(ctx, { kind: 'shape', shape: thing.shape }, s * 0.9, { time: 0 }); break; }
        var f = SHAPE_B[thing.shape] || SHAPE_B.circle, k = s * 0.78;
        var p = function (pp) { f(pp, k); };
        ctx.fillStyle = 'rgba(80,50,25,0.2)'; ctx.save(); ctx.translate(0, s * 0.03); fillWith(ctx, p, 'rgba(80,50,25,0.22)'); ctx.restore();
        ctx.beginPath(); p(ctx); ctx.lineWidth = Math.max(4, s * 0.07); ctx.strokeStyle = c.dark; ctx.stroke();
        ctx.fillStyle = c.base; ctx.fill();
        ctx.save(); ctx.clip();
        var hg = ctx.createRadialGradient(-s * 0.16, -s * 0.18, 0, -s * 0.16, -s * 0.18, s * 0.32);
        hg.addColorStop(0, 'rgba(255,255,255,0.55)'); hg.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = hg; ctx.fillRect(-s / 2, -s / 2, s, s);
        ctx.restore();
        break;
      }
      case 'animal': drawCookie(ctx, { kind: 'animal', animal: thing.animal }, s * 0.94, { time: 0 }); break;
      case 'home': drawCookie(ctx, { kind: 'home', home: thing.home }, s * 0.94, { time: 0 }); break;
      case 'number': drawCookie(ctx, { kind: 'glyph', text: String(thing.n) }, s * 0.92, { time: 0 }); break;
      case 'letter': drawCookie(ctx, { kind: 'glyph', text: String(thing.text) }, s * 0.92, { time: 0 }); break;
      case 'size': {
        var small = thing.size === 'small', cs = s * (small ? 0.5 : 0.92);
        ctx.translate(0, small ? s * 0.2 : 0);
        drawCookie(ctx, { kind: thing.animal ? 'animal' : 'round', animal: thing.animal }, cs, { time: 0 });
        break;
      }
      case 'dots': {   // N chocolate chips on a round cookie (or a grid for > 10)
        var n = Math.max(0, Math.min(20, thing.n | 0));
        var per = n <= 3 ? n : n === 4 ? 2 : n <= 6 ? 3 : n <= 8 ? 4 : 5, rows = Math.ceil(n / Math.max(1, per));
        var onCookie = n <= 10, area = onCookie ? s * 0.56 : s * 0.9;
        if (onCookie) drawCookie(ctx, { kind: 'round' }, s * 0.94, { time: 0 });
        var gap = area / Math.max(per, rows, 2), cr = Math.min(gap * 0.36, s * 0.1);
        for (var d = 0; d < n; d++) {
          var row = Math.floor(d / per), inRow = Math.min(per, n - row * per), col = d - row * per;
          ctx.save(); ctx.translate((col - (inRow - 1) / 2) * gap, (row - (rows - 1) / 2) * gap); drawChip(ctx, cr); ctx.restore();
        }
        break;
      }
      case 'cookie': {
        var ck = {}; for (var kk in thing) if (kk !== 'kind') ck[kk] = thing[kk];
        ck.kind = thing.cookieKind || thing.ckKind || (thing.animal ? 'animal' : thing.home ? 'home' : thing.text != null ? 'glyph' : thing.shape ? 'shape' : 'round');
        if (thing.ck) ck = thing.ck;
        drawCookie(ctx, ck, s * 0.92, { time: 0 });
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
    // cuff: Mochi's oatmeal apron cloth with a cream stripe
    ctx.fillStyle = '#E9DFD2'; ctx.strokeStyle = '#8A7A66'; ctx.lineWidth = s * 0.04;
    ctx.beginPath(); rr(ctx, -s * 0.24, s * 0.76, s * 0.44, s * 0.14, s * 0.05); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = EDGE; ctx.stroke();
    ctx.fillStyle = '#FFF6E8'; ctx.fillRect(-s * 0.2, s * 0.81, s * 0.36, s * 0.035);
    ctx.restore();
  }

  IB.CookieArt = {
    drawTray: drawTray, drawRack: drawRack, drawCookie: drawCookie, drawIcingBag: drawIcingBag, drawGuide: drawGuide,
    drawIcing: drawIcing, drawChip: drawChip, drawSprinkle: drawSprinkle, drawIcon: drawIcon, drawGhostHand: drawGhostHand,
    drawFlourPuff: drawFlourPuff,
    pal: pal, arcLengths: arcLengths, clearCache: clearCache,
    PALETTE: FALLBACK_PALETTE, DOUGH: DOUGH, GINGER: GINGER, ICE: ICE, FONT: FONT, BAG_CENTER: BAG_CENTER,
    SHAPES: SHAPES, ANIMALS: ANIMALS, HOMES: HOMES
  };
})(typeof window !== 'undefined' ? (window.IB = window.IB || {}) : (global.IB = global.IB || {}));
