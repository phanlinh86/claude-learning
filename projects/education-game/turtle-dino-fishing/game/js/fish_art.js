/* Tibo's Dino Lake Fishing — TL.FishArt (character artist B), DESIGN §3 / §4.2. Everything here is canvas code.
 *
 *   drawThing(ctx, thing, size, opt)   origin = the fish body CENTRE, the fish faces RIGHT (+x); size = body height box
 *                                      (fish length ≈ 1.5 × size). The caller sets the transform (translate, sx < 0 to face
 *                                      left, rotate). Marks (text, shapes, spots) are automatically un-mirrored when the
 *                                      current transform is mirrored (det < 0) or opt.face < 0, so "b"/"d", "3" read right.
 *       thing = { kind 'fish'|'bubble', color?, mark?, animal?, big? }
 *         fish   color → colour fish (answer colour body, cream belly, darker fins); no color → neutral pearly fish.
 *                mark = null | {shape, color} | {n} 1–12 cocoa spots | {text} "A", "3+2", "7−4", "12"
 *         bubble a clear soap bubble (diameter size × 1.25) with TL.Assets 'guests/<animal>' inside (placeholder if absent)
 *         big: false → drawn at size × 0.6
 *       opt = { t, wag 0..1, wriggle 0..1, glow 0..1, night 0..1, count -1..n, blink 0|1, mouth 'smile'|'o', face ±1 }
 *   Fish are designed in a 100-unit box (body x −52..60, y −48..48, tail to x ≈ −84); the ctx is scaled by size / 100.
 *   PERFORMANCE: the fish body (dorsal fin, body, belly, scales, gill, cheek, mark, night rim glow) is rasterised ONCE per
 *   thing + device-px bucket (8 px) + night bucket (quarters) + mirror into an offscreen canvas; per frame only the tail,
 *   the ventral fin, the eye, the mouth, count rings and the glow are vector-drawn. Wriggle bends that bitmap in 12 vertical
 *   strips (S-wave), the tail, eye and rings follow the same wave. Without a canvas (node) everything is drawn as vectors.
 *
 *   Lake:  drawWater(ctx, layout, t, amb)  drawSurfaceFront(ctx, layout, t, amb)  waveY(layout, x, t)
 *          drawRod(ctx, base, len, angle, bend) → tip {x, y}   (tip = base + len·(cos(angle + 0.5 bend), sin(angle + 0.5 bend)))
 *          drawLine(ctx, tip, hook, slack, night, surfaceY?)   (with surfaceY and the hook under water: the float sits on the
 *                                                               surface where the line crosses it → call drawHook(.., true))
 *          drawHook(ctx, x, y, s, noFloat)   (x, y) = the eye where the line ties; the bend hangs ≈ 13·s below;
 *                                            the float rides 24·s above unless noFloat
 *          drawRipple(ctx, x, y, r, alpha)  drawSplash(ctx, x, y, s, u)  drawBubbleDot(ctx, x, y, r, alpha)
 *          drawLily(ctx, x, y, s, open, color, t)   (x, y) = pad centre on the surface; s 1 ≈ 84 px pad; open 0 = pad + bud,
 *                                                   open < 0 = pad only, > 1 overshoot ok
 *   UI:    drawHomeBadge(ctx, home, r, opt)  drawIcon(ctx, choice, size)  drawHintHand(ctx, x, y, press, alpha, size?)
 *          drawSparkle(ctx, x, y, r, alpha, rot)
 *   Helpers: bodyBox, spotLayout(n), spotPos(thing, i, size, mirrored), thingKey, pal, clearCache, setCanvasFactory,
 *            bodyBitmap(thing, px, night, mirrored) (the cache), stats().
 * Node-safe at load (no DOM). Offscreen canvases are created lazily.
 */
(function (G) {
  'use strict';
  var TL = G.TL = G.TL || {};

  var TAU = Math.PI * 2, LW = 3.6;
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
  var NEUTRAL = { base: '#FFF4DE', shade: '#E9D3AE', line: '#B08E62', fin: '#F7CBA8', finLine: '#C98F66' };
  var INK = '#5A3B26', EYE = '#2F2A3A', CREAM = '#FFF4DE', CHEEK = '#F2A99A';
  var LAKE = {
    pad: '#9CC08A', padEdge: '#6F9361', petal: '#FFF8EE', gold: '#FFD86B',
    bamboo: '#D9B66E', node: '#A9853E', line: '#FFF8E6', float: '#6FB7B0', hook: '#C9D2DA'
  };
  var MOODS = {
    morning: { top: '#9FD9D6', deep: '#5FAFB4', glint: '#FFFFFF', sunX: 0.22, glintA: 0.7, shaft: 0.10 },
    noon:    { top: '#8FD6DA', deep: '#4E9FB0', glint: '#FFFFFF', sunX: 0.52, glintA: 1.0, shaft: 0.12 },
    sunset:  { top: '#B9C6C4', deep: '#6E8C9A', glint: '#FFC9A0', sunX: 0.80, glintA: 0.9, shaft: 0.08 },
    night:   { top: '#3D5677', deep: '#22344F', glint: '#DDE6FF', sunX: 0.74, glintA: 0.55, shaft: 0.04 }
  };
  var MOOD_NAMES = ['morning', 'noon', 'sunset', 'night'];
  var SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'oval', 'rect', 'diamond'];
  var ANIMALS = ['bunny', 'fox', 'deer', 'squirrel', 'owl', 'raccoon', 'mouse', 'hedgehog', 'penguin', 'crab', 'goldfish', 'camel', 'lion'];
  var HOMES = ['sea', 'ice', 'forest', 'desert', 'savanna'];
  var KINDS = ['fish', 'bubble'];
  var SMALL = 0.6;
  var MX = -11, MY = 4;                       // mark centre on the fish side
  var EYE_X = 37, EYE_Y = -15, EYE_R = 13;
  var TAIL_X = -47;
  var BOX = { x: -66, y: -80, w: 140, h: 144 };   // body bitmap bounds (body, dorsal fin, ventral, rim glow)

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
    var P = TL.PALETTE, c = P && P[name] && HEX.test(P[name].base || '') && HEX.test(P[name].dark || '') && HEX.test(P[name].light || '') ? P[name] : FALLBACK[name];
    return c || null;
  }
  function colOf(name) {
    if (name && HEX.test(name)) return { base: name, dark: mix(name, '#2F2A3A', 0.38), light: mix(name, '#FFFFFF', 0.5) };
    return pal(name);
  }
  function lineOf(c) { return c.base === '#FFD23F' ? '#B0850A' : c.base === '#FF8FC0' ? '#B84A7E' : c.base === '#4CC26B' ? '#2A7A3E' : c.dark; }
  function shadeOf(c) { return mix(c.base, c.dark, 0.32); }

  // ---------------------------------------------------------------- path helpers + Path2D cache
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
  function hasP2D() { return typeof Path2D !== 'undefined'; }
  var pcache = {}, pN = 0;
  function P(key, build) {
    if (!hasP2D()) return build;
    var p = pcache[key];
    if (!p) { if (pN > 2000) { pcache = {}; pN = 0; } p = pcache[key] = new Path2D(); build(p); pN++; }
    return p;
  }
  function fillP(ctx, p) { if (typeof p === 'function') { ctx.beginPath(); p(ctx); ctx.fill(); } else ctx.fill(p); }
  function strokeP(ctx, p) { if (typeof p === 'function') { ctx.beginPath(); p(ctx); ctx.stroke(); } else ctx.stroke(p); }
  function clipP(ctx, p) { if (typeof p === 'function') { ctx.beginPath(); p(ctx); ctx.clip(); } else ctx.clip(p); }
  function dot(ctx, x, y, r, col) { ctx.fillStyle = col; ctx.beginPath(); circ(ctx, x, y, r); ctx.fill(); }
  function oval(ctx, x, y, rx, ry, rot, col) { ctx.fillStyle = col; ctx.beginPath(); ell(ctx, x, y, rx, ry, rot); ctx.fill(); }
  function twinkle(ctx, x, y, r, col) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r); ctx.closePath(); ctx.fill();
  }
  function hash(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  // ================================================================= FISH GEOMETRY (100-unit box, centre origin)
  var fBody = function (t) {
    t.moveTo(60, 4);
    t.bezierCurveTo(60, -30, 34, -48, 2, -48);
    t.bezierCurveTo(-26, -48, -44, -30, -50, -12);
    t.quadraticCurveTo(-54, 0, -50, 12);
    t.bezierCurveTo(-44, 32, -26, 48, 2, 48);
    t.bezierCurveTo(34, 48, 60, 34, 60, 4);
    t.closePath();
  };
  var fDorsal = function (t) {
    t.moveTo(-28, -40); t.bezierCurveTo(-28, -58, -12, -70, 4, -66);
    t.bezierCurveTo(16, -63, 24, -56, 26, -44); t.closePath();
  };
  var fBelly = function (t) { t.moveTo(-30, 40); t.bezierCurveTo(-12, 26, 30, 22, 58, 22); t.lineTo(64, 60); t.lineTo(-30, 60); t.closePath(); };
  var fGill = function (t) { t.moveTo(20, -30); t.quadraticCurveTo(29, -8, 21, 16); };
  var fSil = function (t) { fBody(t); fDorsal(t); };

  // tail (local: attach at origin, the fan spreads to −x); flexed per frame so it whips
  var TAIL = [['M', 7, -14], ['C', -4, -22, -18, -38, -30, -37], ['C', -40, -36, -41, -21, -34, -10], ['Q', -29, 0, -34, 10],
    ['C', -41, 21, -40, 36, -30, 37], ['C', -18, 38, -4, 22, 7, 14], ['Z']];
  var TAIL_RAYS = [[-27, -26], [-29, -9], [-29, 9], [-27, 26]];
  var VENTRAL = [['M', 10, -6], ['C', 7, 10, -4, 22, -19, 21], ['C', -15, 10, -10, 0, -4, -6], ['Z']];

  function shapePath(s) {
    switch (s) {
      case 'square': return function (t) { rrect(t, -25, -25, 50, 50, 7); };
      case 'triangle': return function (t) { rpoly(t, [[0, -31], [29, 23], [-29, 23]], [7, 6, 6]); };
      case 'star': return function (t) { rpoly(t, starPts(0, 3, 33, 14.5), [3, 2, 3, 2, 3, 2, 3, 2, 3, 2]); };
      case 'heart': return heartAt(0, 1, 60, 54);
      case 'oval': return function (t) { ell(t, 0, 0, 18, 29, 0); };
      case 'rect': return function (t) { rrect(t, -29, -17, 58, 34, 7); };
      case 'diamond': return function (t) { rpoly(t, [[0, -31], [23, 0], [0, 31], [-23, 0]], [5, 4, 5, 4]); };
      default: return function (t) { circ(t, 0, 0, 27); };
    }
  }
  var SHAPE_P = {};
  SHAPES.forEach(function (s) { SHAPE_P[s] = shapePath(s); });

  // spots: dice for 1–5, rows above; mark-local coordinates (centre MX, MY), reading order
  var SPOT_R = { 1: 12, 2: 10, 3: 9.5, 4: 9, 5: 8.6, 6: 8, 7: 6.8, 8: 6.8, 9: 7, 10: 6.6, 11: 6.4, 12: 6.4 };
  var SPOT_ROWS = { 6: [3, 3], 7: [4, 3], 8: [4, 4], 9: [3, 3, 3], 10: [3, 4, 3], 11: [4, 3, 4], 12: [4, 4, 4] };
  var scache = {};
  function spotLayout(n) {
    n = Math.max(1, Math.min(12, Math.round(num(n, 3))));
    if (scache[n]) return scache[n];
    var r = SPOT_R[n], pts;
    if (n === 1) pts = [[0, 0]];
    else if (n === 2) pts = [[-14, -11], [14, 11]];
    else if (n === 3) pts = [[-21, -16], [0, 0], [21, 16]];
    else if (n === 4) pts = [[-15, -14], [15, -14], [-15, 14], [15, 14]];
    else if (n === 5) pts = [[-20, -17], [20, -17], [0, 0], [-20, 17], [20, 17]];
    else {
      var rows = SPOT_ROWS[n], nr = rows.length, sx = 2 * r + (Math.max.apply(null, rows) >= 4 ? 4.6 : 5.4), sy = nr === 3 ? 2 * r + 4.8 : 2 * r + 9;
      pts = [];
      rows.forEach(function (cnt, ri) {
        for (var i = 0; i < cnt; i++) pts.push([(i - (cnt - 1) / 2) * sx + (ri === nr - 1 && cnt === 4 ? (nr === 2 ? 1.8 : 2.4) : nr === 2 ? 0.2 : 0.3), (ri - (nr - 1) / 2) * sy + (nr === 2 ? 3 : -0.8)]);
      });
    }
    return (scache[n] = { n: n, r: r, pts: pts });
  }

  // ---------------------------------------------------------------- mark text
  function markText(m) {
    var s = m.text != null ? String(m.text) : '?';
    s = s.replace(/-/g, '−');
    return s.length ? s.slice(0, 6) : '?';
  }
  function glyphFont(px) { return 'bold ' + Math.round(px * 10) / 10 + 'px ' + FONT; }
  function signText(ctx, txt, x, y, maxW, maxH, col, minPx) {
    var px = maxH * 1.36, cx = 1;
    ctx.font = glyphFont(px);
    var m = ctx.measureText ? ctx.measureText(txt) : null, w = m && m.width > 0 ? m.width : px * 0.62 * txt.length;
    if (w > maxW) {
      var fit = px * maxW / w;
      if (minPx && fit < minPx) { cx = fit / minPx; fit = minPx; }
      px = fit; ctx.font = glyphFont(px); m = ctx.measureText ? ctx.measureText(txt) : null;
    }
    ctx.save(); ctx.translate(x, 0); ctx.scale(cx, 1);
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    var asc = m && m.actualBoundingBoxAscent > 0 ? m.actualBoundingBoxAscent : px * 0.72,
      desc = m && m.actualBoundingBoxDescent >= 0 && m.actualBoundingBoxAscent > 0 ? m.actualBoundingBoxDescent : 0;
    var by = y + (asc - desc) / 2;
    ctx.lineJoin = 'round';
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fillText(txt, 1, by + 1.6);
    ctx.fillStyle = col; ctx.fillText(txt, 0, by);
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.6, px * 0.05); if (ctx.strokeText) ctx.strokeText(txt, 0, by);
    ctx.restore();
  }

  // ---------------------------------------------------------------- the fish colours
  function fishCols(th) {
    var c = th.color ? colOf(th.color) : null;
    if (!c) return { neutral: true, base: NEUTRAL.base, shade: NEUTRAL.shade, line: NEUTRAL.line, light: '#FFFFFF',
      fin: NEUTRAL.fin, finShade: mix(NEUTRAL.fin, NEUTRAL.finLine, 0.35), finLine: NEUTRAL.finLine, finRay: '#FFE7D2', belly: '#FFFBF1' };
    return { neutral: false, c: c, base: c.base, shade: shadeOf(c), line: lineOf(c), light: c.light,
      fin: mix(c.base, c.dark, 0.5), finShade: c.dark, finLine: lineOf(c), finRay: rgba(c.light, 0.85), belly: '#FFF1D8' };
  }
  function markOf(th) {
    var m = th.mark;
    if (!m || typeof m !== 'object') return null;
    if (m.shape != null) return { type: 'shape', shape: SHAPE_P[m.shape] ? m.shape : 'circle', color: m.color || 'red' };
    if (m.n != null) return { type: 'spots', n: Math.max(1, Math.min(12, Math.round(num(m.n, 1)))) };
    if (m.text != null) return { type: 'text', text: markText(m) };
    return null;
  }
  function kindOf(th) { return KINDS.indexOf(th && th.kind) >= 0 ? th.kind : 'fish'; }
  function thingKey(t) {
    if (!t) return '?';
    var m = t.mark || {};
    return [kindOf(t), t.color || '', m.shape || '', m.shape ? (m.color || '') : '', m.n != null ? m.n : '', m.text != null ? m.text : '', t.animal || '', t.big === false ? 's' : ''].join(':');
  }
  function bodyBox(thing, size) {
    size = num(size, 104);
    var s = thing && thing.big === false ? SMALL : 1, h = size * s;
    if (kindOf(thing || {}) === 'bubble') return { w: h * 1.25, h: h * 1.25, cx: 0, cy: 0, r: h * 0.625 };
    return { w: h * 1.5, h: h, cx: -h * 0.12, cy: 0, r: h * 0.6 };
  }

  // ---------------------------------------------------------------- the static body (cached as a bitmap)
  function drawBody(g, th, night, mir, blurK) {
    var F = fishCols(th), mk = markOf(th);
    g.lineJoin = 'round'; g.lineCap = 'round';
    if (night > 0.01) {     // pale rim glow, never darkens
      g.save();
      if (blurK > 0) { g.shadowColor = rgba('#FFF2CF', 0.95 * night); g.shadowBlur = 11 * blurK; }
      g.fillStyle = rgba('#FFF6DC', 0.9 * night); fillP(g, P('f.sil', fSil));
      g.restore();
      g.strokeStyle = rgba('#FFF6DC', 0.85 * night); g.lineWidth = LW + 6; strokeP(g, P('f.sil', fSil));
    }
    // dorsal fin
    g.fillStyle = F.fin; fillP(g, P('f.dorsal', fDorsal));
    g.save(); clipP(g, P('f.dorsal', fDorsal));
    g.strokeStyle = F.finRay; g.lineWidth = 2.4;
    g.beginPath(); [[-18, -62], [-6, -67], [7, -65], [17, -58]].forEach(function (q) { g.moveTo(q[0] * 0.25, -42); g.lineTo(q[0], q[1]); }); g.stroke();
    g.restore();
    g.strokeStyle = F.finLine; g.lineWidth = LW * 0.9; strokeP(g, P('f.dorsal', fDorsal));
    // body: base, one-step shade lower-right, belly, highlight
    var body = P('f.body', fBody);
    g.fillStyle = F.base; fillP(g, body);
    g.save(); clipP(g, body);
    g.fillStyle = F.shade; g.fillRect(-60, -55, 130, 110);
    g.translate(-4, -6); g.fillStyle = F.base; fillP(g, body); g.translate(4, 6);
    if (F.neutral) {   // pearly sheen: soft pink / mint tints
      var pg = g.createLinearGradient(-50, -40, 50, 30);
      pg.addColorStop(0, 'rgba(255,214,226,0.32)'); pg.addColorStop(0.5, 'rgba(255,255,255,0)'); pg.addColorStop(1, 'rgba(196,236,226,0.32)');
      g.fillStyle = pg; g.fillRect(-60, -55, 130, 110);
    } else {           // soft scallop scales on the back
      g.strokeStyle = rgba(F.c.light, 0.55); g.lineWidth = 2.2;
      g.beginPath();
      [[-38, -18], [-28, -32], [-24, -6], [-14, -22], [-36, 6], [-4, -36], [-10, 8]].forEach(function (q) { g.moveTo(q[0] + 6, q[1] - 5); g.arc(q[0], q[1], 7.8, -0.7, 0.7 + Math.PI * 0.35); });
      g.stroke();
    }
    g.fillStyle = F.belly; fillP(g, P('f.belly', fBelly));
    g.strokeStyle = F.neutral ? 'rgba(233,211,174,0.8)' : rgba(F.line, 0.25); g.lineWidth = 2;
    strokeP(g, P('f.belly', fBelly));
    g.fillStyle = rgba(mix(F.light, '#FFFFFF', 0.5), F.neutral ? 0.9 : 0.75);
    g.beginPath(); ell(g, -2, -33, 22, 7, -0.18); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); ell(g, -26, -27, 4.6, 3, -0.6); g.fill();
    g.restore();
    // gill + cheek
    if (!(F.neutral && mk)) { g.strokeStyle = F.neutral ? rgba(NEUTRAL.line, 0.45) : rgba(F.line, 0.5); g.lineWidth = 2.4; strokeP(g, P('f.gill', fGill)); }
    oval(g, 33, 6, 7, 4.4, 0, rgba(CHEEK, F.neutral ? 0.75 : 0.7));
    g.strokeStyle = F.line; g.lineWidth = LW; strokeP(g, body);
    // the mark
    if (mk) {
      g.save(); g.translate(MX - (mk.type === 'text' && mk.text.length >= 3 ? 4 : 0), MY); if (mir) g.scale(-1, 1);
      if (mk.type === 'shape') drawShapeMark(g, mk);
      else if (mk.type === 'spots') drawSpots(g, mk.n);
      else signText(g, mk.text, 0, 0, mk.text.length <= 1 ? 60 : mk.text.length <= 2 ? 58 : 54, mk.text.length <= 1 ? 46 : mk.text.length <= 2 ? 38 : 30, INK, mk.text.length >= 4 ? 24 : 0);
      g.restore();
    }
  }
  function drawShapeMark(g, mk) {
    var c = colOf(mk.color) || FALLBACK.red, key = 'sh.' + mk.shape, p = P(key, SHAPE_P[mk.shape]);
    g.save(); g.translate(1, 2.4); g.fillStyle = 'rgba(176,142,98,0.35)'; fillP(g, p); g.restore();   // soft drop
    g.strokeStyle = '#FFFFFF'; g.lineWidth = 7; strokeP(g, p);                                        // white sticker edge
    g.fillStyle = c.base; fillP(g, p);
    g.save(); clipP(g, p);
    g.fillStyle = shadeOf(c); g.fillRect(-40, -40, 80, 80);
    g.translate(-2.4, -2.8); g.fillStyle = c.base; fillP(g, p); g.translate(2.4, 2.8);
    g.fillStyle = rgba(mix(c.light, '#FFFFFF', 0.45), 0.9); g.beginPath(); ell(g, -10, -14, 7, 4, -0.6); g.fill();
    g.restore();
    g.strokeStyle = lineOf(c); g.lineWidth = 3.2; strokeP(g, p);
  }
  function drawSpots(g, n) {
    var L = spotLayout(n);
    for (var i = 0; i < L.pts.length; i++) {
      var x = L.pts[i][0], y = L.pts[i][1], r = L.r;
      dot(g, x, y, r + 1.6, 'rgba(255,255,255,0.9)');
      dot(g, x, y, r, INK);
      dot(g, x - r * 0.35, y - r * 0.38, Math.max(1.1, r * 0.26), 'rgba(255,255,255,0.75)');
    }
  }

  // ---------------------------------------------------------------- bitmap cache
  var canvasFactory = null, bcache = {}, bkeys = [], BMAX = 64, stat = { built: 0, hits: 0 };
  function makeCanvas(w, h) {
    try {
      if (canvasFactory) return canvasFactory(w, h);
      if (typeof document !== 'undefined' && document.createElement) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
    } catch (e) { /* vector fallback */ }
    return null;
  }
  function canBitmap() { return !!canvasFactory || (typeof document !== 'undefined' && !!document.createElement); }
  function bucketPx(px) { return Math.max(16, Math.min(640, Math.ceil(px / 8) * 8)); }
  function bodyBitmap(th, px, night, mir) {
    var b = bucketPx(num(px, 104)), nb = Math.round(clamp01(night) * 4) / 4;
    var key = thingKey(th) + '|' + b + '|' + nb + '|' + (mir ? 'm' : '');
    var c = bcache[key];
    if (c) { stat.hits++; return c; }
    var k = b / 100, W = Math.ceil(BOX.w * k), H = Math.ceil(BOX.h * k);
    c = makeCanvas(W, H);
    if (!c) return null;
    var g = c.getContext && c.getContext('2d');
    if (!g) return null;
    g.setTransform(k, 0, 0, k, -BOX.x * k, -BOX.y * k);
    drawBody(g, th, nb, mir, k);
    g.setTransform(1, 0, 0, 1, 0, 0);
    bcache[key] = c; bkeys.push(key); stat.built++;
    while (bkeys.length > BMAX) delete bcache[bkeys.shift()];
    return c;
  }
  function devScale(ctx) {
    var m = null;
    try { m = ctx.getTransform ? ctx.getTransform() : null; } catch (e) { m = null; }
    if (!m || !isFinite(m.a)) return { k: 0, mir: false };
    return { k: Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)), mir: m.a * m.d - m.b * m.c < 0 };
  }

  // ---------------------------------------------------------------- live parts
  function flexPath(ctx, segs, ox, oy, a0, a1, reach) {
    ctx.beginPath();
    var tr = function (x, y) {
      var f = Math.max(0, Math.min(1, -x / reach)), a = a0 + (a1 - a0) * f, c = Math.cos(a), s = Math.sin(a);
      return [ox + x * c - y * s, oy + x * s + y * c];
    };
    for (var i = 0; i < segs.length; i++) {
      var q = segs[i], p, p2, p3;
      if (q[0] === 'M') { p = tr(q[1], q[2]); ctx.moveTo(p[0], p[1]); }
      else if (q[0] === 'C') { p = tr(q[1], q[2]); p2 = tr(q[3], q[4]); p3 = tr(q[5], q[6]); ctx.bezierCurveTo(p[0], p[1], p2[0], p2[1], p3[0], p3[1]); }
      else if (q[0] === 'Q') { p = tr(q[1], q[2]); p2 = tr(q[3], q[4]); ctx.quadraticCurveTo(p[0], p[1], p2[0], p2[1]); }
      else ctx.closePath();
    }
    return tr;
  }
  function drawTail(ctx, F, ox, oy, a0, a1, night) {
    var tr = flexPath(ctx, TAIL, ox, oy, a0, a1, 34);
    if (night > 0.01) { ctx.strokeStyle = rgba('#FFF6DC', 0.85 * night); ctx.lineWidth = LW + 7; ctx.stroke(); }
    ctx.fillStyle = F.fin; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = F.finRay; ctx.lineWidth = 2.6;
    ctx.beginPath();
    for (var i = 0; i < TAIL_RAYS.length; i++) { var p0 = tr(-3, TAIL_RAYS[i][1] * 0.15), p1 = tr(TAIL_RAYS[i][0], TAIL_RAYS[i][1]); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); }
    ctx.stroke();
    ctx.restore();
    flexPath(ctx, TAIL, ox, oy, a0, a1, 34);
    ctx.strokeStyle = F.finLine; ctx.lineWidth = LW * 0.9; ctx.stroke();
  }
  function drawVentral(ctx, F, ox, oy, a, night) {
    flexPath(ctx, VENTRAL, ox, oy, a, a * 1.6, 16);
    if (night > 0.01) { ctx.strokeStyle = rgba('#FFF6DC', 0.85 * night); ctx.lineWidth = LW + 6; ctx.stroke(); }
    ctx.fillStyle = F.fin; ctx.fill();
    ctx.strokeStyle = F.finLine; ctx.lineWidth = LW * 0.85; ctx.stroke();
  }
  function drawFace(ctx, F, dyE, dyM, o) {
    var ex = EYE_X, ey = EYE_Y + dyE;
    if (o.blink) {    // happy closed eye
      ctx.strokeStyle = EYE; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(ex, ey + 3, 8.5, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke();
    } else {
      ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); circ(ctx, ex, ey, EYE_R); ctx.fill();
      ctx.strokeStyle = F.neutral ? NEUTRAL.line : F.line; ctx.lineWidth = 2.6; ctx.stroke();
      dot(ctx, ex + 2.6, ey + 1, 8.8, EYE);
      dot(ctx, ex - 0.4, ey - 3.4, 3.6, '#FFFFFF');
      dot(ctx, ex + 5.4, ey + 4.4, 1.6, '#FFFFFF');
    }
    var mx = 52, my = 13 + dyM;
    if (o.mouth === 'o') {
      oval(ctx, mx + 1, my, 5.8, 7, 0, '#7A3A3A');
      oval(ctx, mx + 1, my + 3, 3.6, 2.8, 0, '#F08C8C');
      ctx.strokeStyle = F.neutral ? NEUTRAL.line : F.line; ctx.lineWidth = 2.2; ctx.beginPath(); ell(ctx, mx + 1, my, 5.8, 7, 0); ctx.stroke();
    } else {
      ctx.strokeStyle = mix(F.neutral ? NEUTRAL.line : F.line, EYE, 0.45); ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(44, my - 1); ctx.quadraticCurveTo(50, my + 6, 57.5, my - 3); ctx.stroke();
    }
  }
  function drawCountRings(ctx, n, count, mir, wave) {
    var L = spotLayout(n), c = Math.min(L.n, Math.round(count));
    for (var i = 0; i < c; i++) {
      var x = MX + (mir ? -1 : 1) * L.pts[i][0], y = MY + L.pts[i][1] + wave(x), r = L.r;
      var g = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 2.1);
      g.addColorStop(0, 'rgba(255,236,150,0.95)'); g.addColorStop(1, 'rgba(255,220,110,0)');
      ctx.fillStyle = g; ctx.beginPath(); circ(ctx, x, y, r * 2.1); ctx.fill();
      var rr = Math.min(r * 1.62, r + 3.4), lw = Math.max(2.2, Math.min(r * 0.42, 3.4));
      ctx.strokeStyle = '#F2A922'; ctx.lineWidth = lw; ctx.beginPath(); circ(ctx, x, y, rr); ctx.stroke();
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = Math.max(1.6, lw * 0.7); ctx.beginPath(); circ(ctx, x, y, rr - lw * 0.75); ctx.stroke();
      dot(ctx, x, y, r * 1.12, INK);
      dot(ctx, x - r * 0.36, y - r * 0.4, r * 0.34, '#FFFFFF');
      twinkle(ctx, x + r * 1.2, y - r * 1.2, r * 0.7, '#FFFFFF');
    }
  }
  function halo(ctx, glow, R, t) {
    var pulse = 0.85 + 0.15 * Math.sin(num(t, 0) * 6);
    var g = ctx.createRadialGradient(0, 0, R * 0.3, 0, 0, R);
    g.addColorStop(0, 'rgba(255,236,150,' + (0.75 * glow * pulse).toFixed(3) + ')');
    g.addColorStop(0.6, 'rgba(255,218,110,' + (0.42 * glow * pulse).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(255,214,100,0)');
    ctx.fillStyle = g; ctx.beginPath(); circ(ctx, 0, 0, R); ctx.fill();
    return pulse;
  }

  // ================================================================= PUBLIC: drawThing
  function drawThing(ctx, thing, size, opt) {
    if (!ctx || !thing) return;
    size = num(size, 104); if (!(size > 0)) return;
    var o = opt || {}, sc = thing.big === false ? SMALL : 1, s = size / 100 * sc;
    ctx.save();
    ctx.scale(s, s);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (kindOf(thing) === 'bubble') drawBubble(ctx, thing, o, size * sc);
    else drawFish(ctx, thing, o);
    ctx.restore();
  }

  function drawFish(ctx, th, o) {
    var t = num(o.t, 0), wag = clamp01(o.wag == null ? 0.3 : o.wag), wr = clamp01(o.wriggle), glow = clamp01(o.glow), night = clamp01(o.night);
    var F = fishCols(th), mk = markOf(th), ds = devScale(ctx), mir = ds.mir || num(o.face, 1) < 0;
    var amp = 6.5 * wr, kw = TAU / 150, ph = t * TAU * 2.4;
    var wave = function (x) { return amp * Math.sin(x * kw + ph); };
    var slope = function (x) { return amp * kw * Math.cos(x * kw + ph); };
    if (glow > 0.01) {
      halo(ctx, glow, 92 + 14 * glow, t);
      ctx.save(); ctx.translate(0, wave(0));
      ctx.strokeStyle = 'rgba(255,240,170,' + (0.95 * glow).toFixed(3) + ')'; ctx.lineWidth = LW + 8 + 6 * glow;
      strokeP(ctx, P('f.sil', fSil)); ctx.restore();
    }
    // tail + ventral fin behind the body
    var w2 = Math.max(wag, wr), A = 0.12 + 0.36 * w2, phT = t * TAU * (1.4 + 2.2 * w2);
    var base = Math.atan(slope(TAIL_X)), a0 = base + A * Math.sin(phT), a1 = base + A * 1.35 * Math.sin(phT - 0.95);
    drawTail(ctx, F, TAIL_X, wave(TAIL_X), a0, a1, night);
    var vf = 0.22 * Math.sin(t * TAU * 1.1 + 1.2) + 0.1 * w2 * Math.sin(phT);
    drawVentral(ctx, F, 8, 45 + wave(8), vf, night);
    // the body bitmap (or vectors)
    var bmp = ds.k > 0 && canBitmap() ? bodyBitmap(th, ds.k * 100, night, mir) : null;
    if (bmp) {
      var bw = bmp.width, bh = bmp.height;
      if (wr > 0.01) {
        // piecewise-linear S-bend: each segment is sheared so neighbours meet exactly (no steps, no gaps)
        var N = 10, sw = BOX.w / N;
        for (var i = 0; i < N; i++) {
          var xa = BOX.x + i * sw, xb = xa + sw, ya = wave(xa), m = (wave(xb) - ya) / sw;
          var sx0 = Math.floor(bw * i / N), sx1 = Math.min(bw, Math.ceil(bw * (i + 1) / N) + 1), dx0 = BOX.x + sx0 * BOX.w / bw;
          ctx.save(); ctx.transform(1, m, 0, 1, 0, ya - xa * m);
          ctx.drawImage(bmp, sx0, 0, sx1 - sx0, bh, dx0, BOX.y, (sx1 - sx0) * BOX.w / bw, BOX.h);
          ctx.restore();
        }
      } else ctx.drawImage(bmp, 0, 0, bw, bh, BOX.x, BOX.y, BOX.w, BOX.h);
    } else {
      ctx.save(); if (wr > 0.01) ctx.transform(1, slope(0), 0, 1, 0, wave(0)); drawBody(ctx, th, night, mir, 0); ctx.restore();
    }
    drawFace(ctx, F, wave(EYE_X), wave(50), o);
    if (mk && mk.type === 'spots' && num(o.count, -1) > 0) drawCountRings(ctx, mk.n, num(o.count, -1), mir, wave);
  }

  // ================================================================= BUBBLE (clear soap bubble with a guest inside)
  var GC = {
    bunny: ['#EDE4DA', '#9C8C7E'], fox: ['#D58A52', '#8E5430'], deer: ['#C49A6C', '#7E5C3A'], squirrel: ['#B9784A', '#74472A'],
    owl: ['#A88B6A', '#6A5238'], raccoon: ['#A8A4A0', '#5E5A58'], mouse: ['#C9BFB6', '#7E7268'], hedgehog: ['#9C7E62', '#5E4A36'],
    penguin: ['#4A5268', '#2A3042'], crab: ['#E08A6E', '#9A4E3A'], goldfish: ['#F2B36E', '#B0702E'], camel: ['#D8B67E', '#8E7040'],
    lion: ['#E2B46E', '#9A7038']
  };
  function animalOf(th) { return GC[th.animal] ? th.animal : 'bunny'; }
  function assetImg(key, px) {
    var A = TL.Assets;
    if (!A) return null;
    try {
      if (typeof A.has === 'function' && typeof A.sprite === 'function' && A.has(key)) { var s = A.sprite(key, px); if (s) return s; }
      if (typeof A.img === 'function') { var i = A.img(key); if (i) return i; }
      if (A.images && A.images[key]) return A.images[key];
    } catch (e) { /* placeholder */ }
    return null;
  }
  var BR = 62.5;
  function drawBubble(ctx, th, o, sizePx) {
    var t = num(o.t, 0), glow = clamp01(o.glow), night = clamp01(o.night), wr = clamp01(o.wriggle), a = animalOf(th);
    var ds = devScale(ctx), k = ds.k > 0 ? ds.k : sizePx / 100 * (G.devicePixelRatio || 1);
    var wob = (0.022 + 0.07 * wr) * Math.sin(t * TAU * (0.45 + 1.4 * wr)), bob = 2.6 * Math.sin(t * TAU * 0.35 + 0.8);
    if (glow > 0.01) halo(ctx, glow, BR * 1.42 + 10 * glow, t);
    ctx.save(); ctx.scale(1 + wob, 1 - wob);
    if (night > 0.01) {
      var ng = ctx.createRadialGradient(0, 0, BR * 0.85, 0, 0, BR * 1.22);
      ng.addColorStop(0, 'rgba(255,246,214,0)'); ng.addColorStop(0.35, rgba('#FFF6DC', 0.55 * night)); ng.addColorStop(1, 'rgba(255,246,214,0)');
      ctx.fillStyle = ng; ctx.beginPath(); circ(ctx, 0, 0, BR * 1.22); ctx.fill();
    }
    // inside: milky edge so the bubble reads on any water
    var ig = ctx.createRadialGradient(-BR * 0.2, -BR * 0.25, BR * 0.1, 0, 0, BR);
    ig.addColorStop(0, 'rgba(255,255,255,0.10)'); ig.addColorStop(0.72, 'rgba(235,250,255,0.16)'); ig.addColorStop(1, 'rgba(240,252,255,0.55)');
    ctx.fillStyle = ig; ctx.beginPath(); circ(ctx, 0, 0, BR); ctx.fill();
    // the guest
    ctx.save(); ctx.beginPath(); circ(ctx, 0, 0, BR - 2); ctx.clip();
    var img = assetImg('guests/' + a, 96 * k);
    if (img) ctx.drawImage(img, -52, -54 + bob, 104, 104);
    else drawPlaceholder(ctx, a, bob);
    ctx.fillStyle = 'rgba(214,240,255,0.10)'; ctx.fillRect(-BR, -BR, BR * 2, BR * 2);
    ctx.restore();
    // iridescent rim + white rim
    var rg = ctx.createLinearGradient(-BR, -BR, BR, BR);
    rg.addColorStop(0, 'rgba(255,170,220,0.75)'); rg.addColorStop(0.3, 'rgba(255,236,150,0.65)');
    rg.addColorStop(0.6, 'rgba(150,240,220,0.7)'); rg.addColorStop(1, 'rgba(190,170,255,0.75)');
    ctx.strokeStyle = rg; ctx.lineWidth = 5; ctx.beginPath(); circ(ctx, 0, 0, BR - 3.4); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3; ctx.beginPath(); circ(ctx, 0, 0, BR); ctx.stroke();
    ctx.strokeStyle = 'rgba(60,110,130,0.28)'; ctx.lineWidth = 1.4; ctx.beginPath(); circ(ctx, 0, 0, BR + 2); ctx.stroke();
    // glossy highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.92)'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, 0, BR * 0.78, Math.PI * 1.1, Math.PI * 1.38); ctx.stroke();
    dot(ctx, -BR * 0.3, -BR * 0.76, 4.2, 'rgba(255,255,255,0.95)');
    oval(ctx, -BR * 0.5, -BR * 0.46, 9, 5, -0.8, 'rgba(255,255,255,0.35)');
    ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 3.4;
    ctx.beginPath(); ctx.arc(0, 0, BR * 0.82, Math.PI * 0.12, Math.PI * 0.34); ctx.stroke();
    ctx.restore();
    if (glow > 0.01) { ctx.strokeStyle = 'rgba(255,236,150,' + (0.9 * glow).toFixed(3) + ')'; ctx.lineWidth = 3 + 3 * glow; ctx.beginPath(); circ(ctx, 0, 0, BR + 4); ctx.stroke(); }
  }
  function drawPlaceholder(ctx, a, bob) {
    var c = GC[a];
    ctx.save(); ctx.translate(0, bob);
    ctx.fillStyle = c[0]; ctx.strokeStyle = c[1]; ctx.lineWidth = 2.6;
    ctx.beginPath(); circ(ctx, -15, -28, 8); circ(ctx, 15, -28, 8); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ell(ctx, 0, 26, 26, 20, 0); ctx.fill(); ctx.stroke();
    ctx.beginPath(); circ(ctx, 0, -6, 24); ctx.fill(); ctx.stroke();
    oval(ctx, -8, -8, 3.4, 4, 0, EYE); oval(ctx, 8, -8, 3.4, 4, 0, EYE);
    dot(ctx, -9, -9.4, 1.3, '#FFFFFF'); dot(ctx, 7, -9.4, 1.3, '#FFFFFF');
    oval(ctx, -15, 0, 3.6, 2.2, 0, rgba(CHEEK, 0.85)); oval(ctx, 15, 0, 3.6, 2.2, 0, rgba(CHEEK, 0.85));
    ctx.beginPath(); ctx.arc(0, 0, 4, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
    ctx.restore();
  }

  // ================================================================= WATER
  function moodOf(amb) {
    amb = amb || {};
    var m = MOODS[amb.mood] || MOODS[MOOD_NAMES[amb.moodIndex]] || (num(amb.night, 0) > 0.5 ? MOODS.night : MOODS.noon);
    return m;
  }
  function waveY(layout, x, t) {
    var sy = num(layout && layout.surfaceY, 300);
    return sy + 2.6 * Math.sin(x * 0.021 + t * 1.3) + 1.6 * Math.sin(x * 0.047 - t * 2.0 + 1.3);
  }
  /** the water body from y0 down to H: depth gradient (from the surface sy) + soft light shafts */
  function waterBody(g, W, H, y0, sy, top, deep, shaftA) {
    var gr = g.createLinearGradient(0, sy - 6, 0, H);
    gr.addColorStop(0, top); gr.addColorStop(0.38, mix(top, deep, 0.55)); gr.addColorStop(1, deep);
    g.fillStyle = gr; g.fillRect(0, y0, W, H - y0);
    var depth = H - sy;
    for (var i = 0; i < 5; i++) {
      var sxp = ((i + 0.3) / 5) * W + (hash(i + 3) - 0.5) * 60, wd = 50 + hash(i) * 60;
      var sg = g.createLinearGradient(0, sy, 0, sy + depth * 0.85);
      sg.addColorStop(0, 'rgba(255,255,255,' + (shaftA * (0.6 + 0.4 * hash(i + 9))).toFixed(3) + ')'); sg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = sg; g.beginPath();
      g.moveTo(sxp - wd / 2, Math.max(sy, y0)); g.lineTo(sxp + wd / 2, Math.max(sy, y0)); g.lineTo(sxp + wd / 2 + depth * 0.35, sy + depth * 0.85); g.lineTo(sxp - wd / 2 + depth * 0.25, sy + depth * 0.85); g.closePath(); g.fill();
    }
  }
  var wcache = { key: '', c: null, t: -1e9 };
  function cdist(a, b) { var A = rgb(a), B = rgb(b); return Math.abs(A[0] - B[0]) + Math.abs(A[1] - B[1]) + Math.abs(A[2] - B[2]); }
  function waterBitmap(W, H, sy, top, deep, shaftA, k, t) {
    k = Math.min(3, Math.round(k * 4) / 4);
    var key = [W, H, sy, top, deep, shaftA.toFixed(3), k].join('|');
    var near = wcache.c && wcache.W === W && wcache.H === H && wcache.sy === sy && wcache.k === k && Math.abs(t - wcache.t) < 0.12 &&
      cdist(wcache.top, top) + cdist(wcache.deep, deep) < 36;   // small crossfade steps: keep the last bitmap for ≤ 0.12 s
    if (wcache.c && (wcache.key === key || near)) { stat.hits++; return wcache.c; }
    var y0 = sy + 7.5, w = Math.ceil(W * k), h = Math.max(1, Math.ceil((H - y0) * k));
    var c = wcache.c && wcache.c.width === w && wcache.c.height === h ? wcache.c : makeCanvas(w, h);
    var g = c && c.getContext ? c.getContext('2d') : null;
    if (!g) return null;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h);
    g.setTransform(k, 0, 0, k, 0, -y0 * k);
    waterBody(g, W, H, y0, sy, top, deep, shaftA);
    g.setTransform(1, 0, 0, 1, 0, 0);
    wcache = { key: key, c: c, t: t, W: W, H: H, sy: sy, k: k, top: top, deep: deep }; stat.built++;
    return c;
  }
  function drawWater(ctx, layout, t, amb) {
    if (!ctx || !layout) return;
    amb = amb || {}; t = num(t, 0);
    var M = moodOf(amb), W = num(layout.W, 1280), H = num(layout.H, 720), sy = num(layout.surfaceY, H * 0.4);
    var top = HEX.test(amb.waterTop || '') ? amb.waterTop : M.top, deep = HEX.test(amb.waterDeep || '') ? amb.waterDeep : M.deep;
    var night = clamp01(amb.night != null ? amb.night : (M === MOODS.night ? 1 : 0));
    var glintA = amb.glint != null ? clamp01(amb.glint) : M.glintA;
    var sunX = num(night > 0.5 ? (amb.moonX != null ? amb.moonX : amb.sunX) : amb.sunX, M.sunX * W);
    var lay = { surfaceY: sy }, step = 16;
    var shaftA = M.shaft * (1 - 0.5 * night), depth = H - sy;
    ctx.save();
    // the static water body (depth gradient + light shafts) is cached as one bitmap per size + colours (rebuilt at most
    // every 0.12 s while the weather crossfades); only the wave band on top is vector
    var ds = devScale(ctx), wb = ds.k > 0 && canBitmap() ? waterBitmap(W, H, sy, top, deep, shaftA, ds.k, t) : null;
    var band = 8;
    if (wb) ctx.drawImage(wb, 0, 0, wb.width, wb.height, 0, sy + band - 0.5, W, H - sy - band + 0.5);
    else waterBody(ctx, W, H, sy + band - 0.5, sy, top, deep, shaftA);
    ctx.beginPath(); ctx.moveTo(0, sy + band);
    for (var x = 0; x <= W + step; x += step) ctx.lineTo(x, waveY(lay, x, t));
    ctx.lineTo(W + step, sy + band); ctx.closePath();
    ctx.fillStyle = mix(top, deep, 0.02); ctx.fill();
    // caustics: wobbly light rings, fading with depth
    ctx.lineWidth = 2; ctx.lineCap = 'round';
    var cell = 118, rows = 3;
    for (var r = 0; r < rows; r++) {
      var cy0 = sy + 22 + r * 42, a = (0.16 - r * 0.045) * (1 - 0.55 * night);
      ctx.strokeStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
      ctx.beginPath();
      for (var c = 0; c * cell < W + cell; c++) {
        var cx = c * cell + (r % 2 ? cell / 2 : 0) + Math.sin(t * 0.5 + c * 1.7 + r) * 14, cyy = cy0 + Math.sin(t * 0.7 + c) * 5;
        var rx = 26 + 8 * hash(c + r * 31), ry = 7 + 2 * hash(c * 3 + r);
        for (var j = 0; j <= 8; j++) {
          var an = j / 8 * TAU, wob = 1 + 0.22 * Math.sin(an * 3 + t * 1.6 + c);
          var px = cx + Math.cos(an) * rx * wob, py = cyy + Math.sin(an) * ry * wob;
          if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
      }
      ctx.stroke();
    }
    // surface sheen band
    var sh = ctx.createLinearGradient(0, sy - 4, 0, sy + 22);
    sh.addColorStop(0, 'rgba(255,255,255,' + (0.4 - 0.18 * night).toFixed(3) + ')'); sh.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sh; ctx.fillRect(0, sy + 3, W, 24);
    // glints (sun / moon reflection)
    var gc = night > 0.5 ? M.glint : (amb.mood === 'sunset' ? MOODS.sunset.glint : M.glint);
    for (var k = 0; k < 24; k++) {
      var gx = sunX + (hash(k + 5) - 0.5) * (120 + k * 9), gy = sy + 4 + hash(k + 11) * 46 * (0.4 + k / 18);
      var ga = glintA * (0.35 + 0.65 * Math.max(0, Math.sin(t * 2.6 + k * 1.9))) * (1 - k / 30);
      if (ga < 0.03) continue;
      var gl = 14 + hash(k) * 28;
      ctx.strokeStyle = rgba(gc, ga); ctx.lineWidth = 3.2;
      ctx.beginPath(); ctx.moveTo(gx - gl / 2, gy); ctx.lineTo(gx + gl / 2, gy); ctx.stroke();
    }
    // the surface line
    ctx.strokeStyle = rgba('#FFFFFF', 0.8 - 0.25 * night); ctx.lineWidth = 2.6;
    ctx.beginPath(); for (var x2 = 0; x2 <= W + step; x2 += step) { var y2 = waveY(lay, x2, t); if (x2 === 0) ctx.moveTo(x2, y2); else ctx.lineTo(x2, y2); } ctx.stroke();
    ctx.strokeStyle = rgba('#FFFFFF', 0.28 - 0.1 * night); ctx.lineWidth = 1.6;
    ctx.beginPath(); for (var x3 = 0; x3 <= W + step; x3 += step) { var y3 = waveY(lay, x3 + 30, t * 0.8) + 7; if (x3 === 0) ctx.moveTo(x3, y3); else ctx.lineTo(x3, y3); } ctx.stroke();
    ctx.restore();
  }
  function drawSurfaceFront(ctx, layout, t, amb) {
    if (!ctx || !layout) return;
    amb = amb || {}; t = num(t, 0);
    var M = moodOf(amb), W = num(layout.W, 1280), sy = num(layout.surfaceY, 300), step = 16, lay = { surfaceY: sy };
    var top = HEX.test(amb.waterTop || '') ? amb.waterTop : M.top;
    ctx.save();
    ctx.beginPath();
    for (var x = 0; x <= W + step; x += step) { var y = waveY(lay, x, t); if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    for (var x2 = W + step; x2 >= 0; x2 -= step) ctx.lineTo(x2, waveY(lay, x2, t) + 9);
    ctx.closePath();
    ctx.fillStyle = rgba(top, 0.42); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2;
    ctx.beginPath(); for (var x3 = 0; x3 <= W + step; x3 += step) { var y3 = waveY(lay, x3, t); if (x3 === 0) ctx.moveTo(x3, y3); else ctx.lineTo(x3, y3); } ctx.stroke();
    ctx.restore();
  }

  // ================================================================= ROD, LINE, HOOK, FLOAT
  function drawRod(ctx, base, len, angle, bend) {
    var bx = num(base && base.x, 0), by = num(base && base.y, 0), L = num(len, 170), an = num(angle, -1.05), b = Math.max(-1, Math.min(1, num(bend, 0)));
    var ta = an + 0.5 * b, tip = { x: bx + L * Math.cos(ta), y: by + L * Math.sin(ta) };
    if (!ctx) return tip;
    // quadratic: leaves the grip along the rest direction, bulges with the bend
    var cx = bx + L * 0.55 * Math.cos(an), cy = by + L * 0.55 * Math.sin(an);
    var pt = function (u) { var v = 1 - u; return [v * v * bx + 2 * v * u * cx + u * u * tip.x, v * v * by + 2 * v * u * cy + u * u * tip.y]; };
    var tan = function (u) { var dx = 2 * (1 - u) * (cx - bx) + 2 * u * (tip.x - cx), dy = 2 * (1 - u) * (cy - by) + 2 * u * (tip.y - cy), d = Math.hypot(dx, dy) || 1; return [dx / d, dy / d]; };
    var N = 12, wid = function (u) { return 8.5 - 5.5 * u; };
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var seg = function (col, extra) {
      for (var i = 0; i < N; i++) {
        var p0 = pt(i / N), p1 = pt((i + 1) / N);
        ctx.strokeStyle = col; ctx.lineWidth = wid((i + 0.5) / N) + extra;
        ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
      }
    };
    seg('#7E5F2C', 3.2);
    seg(LAKE.bamboo, 0);
    // highlight stripe
    ctx.strokeStyle = 'rgba(255,240,200,0.85)'; ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (var i = 1; i <= N; i++) { var u = i / N, p = pt(u), n = tan(u), o = -wid(u) * 0.22; if (i === 1) ctx.moveTo(p[0] + n[1] * o, p[1] - n[0] * o); else ctx.lineTo(p[0] + n[1] * o, p[1] - n[0] * o); }
    ctx.stroke();
    // bamboo nodes
    [0.3, 0.52, 0.72, 0.88].forEach(function (u) {
      var p = pt(u), n = tan(u), w = wid(u) / 2 + 1.6;
      ctx.strokeStyle = LAKE.node; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(p[0] - n[1] * w, p[1] + n[0] * w); ctx.lineTo(p[0] + n[1] * w, p[1] - n[0] * w); ctx.stroke();
    });
    // grip wrap
    for (var j = 0; j < 4; j++) {
      var uu = 0.02 + j * 0.03, pp = pt(uu), nn = tan(uu), ww = wid(uu) / 2 + 2;
      ctx.strokeStyle = j % 2 ? '#F3E2B8' : '#8C5A3C'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(pp[0] - nn[1] * ww, pp[1] + nn[0] * ww); ctx.lineTo(pp[0] + nn[1] * ww, pp[1] - nn[0] * ww); ctx.stroke();
    }
    // tip ring
    ctx.strokeStyle = '#7E5F2C'; ctx.lineWidth = 1.6; ctx.fillStyle = '#FFF8E6';
    ctx.beginPath(); circ(ctx, tip.x, tip.y, 2.6); ctx.fill(); ctx.stroke();
    ctx.restore();
    return tip;
  }
  function drawFloat(ctx, x, y, s, rock) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(num(rock, 0)); ctx.scale(s, s);
    ctx.strokeStyle = '#3E6E6A'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(0, -12); ctx.stroke();
    ctx.fillStyle = LAKE.float; ctx.beginPath(); ctx.moveTo(-6.5, 0); ctx.bezierCurveTo(-6.5, -5, -3, -7.5, 0, -7.5); ctx.bezierCurveTo(3, -7.5, 6.5, -5, 6.5, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#FFF8E6'; ctx.beginPath(); ctx.moveTo(-6.5, 0); ctx.bezierCurveTo(-6.5, 5, -3, 8, 0, 8); ctx.bezierCurveTo(3, 8, 6.5, 5, 6.5, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#3E6E6A'; ctx.lineWidth = 1.6; ctx.beginPath(); ell(ctx, 0, 0.2, 6.5, 7.8, 0); ctx.stroke();
    dot(ctx, -2.4, -3.6, 1.5, 'rgba(255,255,255,0.9)');
    ctx.restore();
  }
  function drawLine(ctx, tip, hook, slack, night, surfaceY) {
    if (!ctx || !tip || !hook) return;
    var tx = num(tip.x, 0), ty = num(tip.y, 0), hx = num(hook.x, tx), hy = num(hook.y, ty + 40), sl = num(slack, 0), nt = clamp01(night);
    var cx = (tx + hx) / 2, cy = (ty + hy) / 2 + sl;
    ctx.save(); ctx.lineCap = 'round';
    ctx.strokeStyle = rgba('#3A3550', 0.28 + 0.4 * nt); ctx.lineWidth = 3.6;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.quadraticCurveTo(cx, cy, hx, hy); ctx.stroke();
    ctx.strokeStyle = LAKE.line; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.quadraticCurveTo(cx, cy, hx, hy); ctx.stroke();
    var sy = num(surfaceY, NaN);
    if (isFinite(sy) && hy > sy + 6 && ty < sy) {   // float on the surface where the line crosses it
      var lo = 0, hi = 1;
      for (var i = 0; i < 18; i++) { var u = (lo + hi) / 2, v = 1 - u, y = v * v * ty + 2 * v * u * cy + u * u * hy; if (y < sy) lo = u; else hi = u; }
      var uu = (lo + hi) / 2, vv = 1 - uu, fx = vv * vv * tx + 2 * vv * uu * cx + uu * uu * hx;
      drawFloat(ctx, fx, sy - 1, 1.15, 0);
    }
    ctx.restore();
  }
  function drawHook(ctx, x, y, s, noFloat) {
    if (!ctx) return;
    x = num(x, 0); y = num(y, 0); s = num(s, 1); if (!(s > 0)) return;
    ctx.save(); ctx.translate(x, y); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (!noFloat) drawFloat(ctx, 0, -24 * s, s, 0);
    ctx.scale(s, s);
    var hookP = function (q) { q.moveTo(0, 2); q.lineTo(0, 10); q.bezierCurveTo(0, 17, 9, 17, 9, 10); q.lineTo(9, 7); };
    ctx.strokeStyle = '#5E6A76'; ctx.lineWidth = 4.6; ctx.beginPath(); hookP(ctx); ctx.stroke();
    ctx.strokeStyle = LAKE.hook; ctx.lineWidth = 2.6; ctx.beginPath(); hookP(ctx); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-0.6, 4); ctx.lineTo(-0.6, 10); ctx.stroke();
    dot(ctx, 9, 6.6, 2.4, '#5E6A76'); dot(ctx, 9, 6.6, 1.6, LAKE.hook);        // round, kid-safe tip
    ctx.strokeStyle = '#5E6A76'; ctx.lineWidth = 1.6; ctx.fillStyle = LAKE.hook;    // the eye
    ctx.beginPath(); circ(ctx, 0, 0, 2.4); ctx.stroke();
    ctx.restore();
  }

  // ================================================================= RIPPLES, SPLASH, BUBBLES
  function drawRipple(ctx, x, y, r, alpha) {
    if (!ctx) return;
    var a = alpha == null ? 1 : clamp01(alpha); r = num(r, 20);
    if (a <= 0.001 || !(r > 0)) return;
    ctx.save(); ctx.translate(num(x, 0), num(y, 0));
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.85 * a).toFixed(3) + ')'; ctx.lineWidth = Math.max(1.2, 3 * a);
    ctx.beginPath(); ell(ctx, 0, 0, r, r * 0.3, 0); ctx.stroke();
    if (r > 10) { ctx.strokeStyle = 'rgba(255,255,255,' + (0.45 * a).toFixed(3) + ')'; ctx.lineWidth = 1.4; ctx.beginPath(); ell(ctx, 0, 0, r * 0.62, r * 0.62 * 0.3, 0); ctx.stroke(); }
    ctx.restore();
  }
  function drawSplash(ctx, x, y, s, u) {
    if (!ctx) return;
    s = num(s, 1); u = clamp01(u); if (!(s > 0) || u >= 1) return;
    ctx.save(); ctx.translate(num(x, 0), num(y, 0)); ctx.scale(s, s); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    var a = 1 - u * u;
    // foam ring
    ctx.fillStyle = 'rgba(255,255,255,' + (0.55 * (1 - u)).toFixed(3) + ')'; ctx.beginPath(); ell(ctx, 0, 0, 24 + 36 * u, (24 + 36 * u) * 0.28, 0); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.8 * (1 - u)).toFixed(3) + ')'; ctx.lineWidth = 2.4; ctx.beginPath(); ell(ctx, 0, 0, 30 + 44 * u, (30 + 44 * u) * 0.3, 0); ctx.stroke();
    // crown
    var hC = 58 * Math.sin(Math.PI * Math.min(1, u / 0.75)) * (1 - 0.3 * u), wC = 26 + 18 * u, N = 7;
    if (hC > 1) {
      // a cup-shaped water wall with a ring of spikes on its rim (each spike will shed a droplet)
      var gap = 2 * wC / (N - 1);
      ctx.beginPath(); ctx.moveTo(-wC - 8, 3); ctx.quadraticCurveTo(-wC - 4, -hC * 0.2, -wC - gap * 0.3, -hC * 0.42);
      for (var i = 0; i < N; i++) {
        var f = i / (N - 1), sx = -wC + 2 * wC * f, hh = hC * (0.72 + 0.28 * Math.sin(f * Math.PI)) * (i % 2 ? 0.84 : 1), lean = (f - 0.5) * 18 * (0.5 + u);
        ctx.quadraticCurveTo(sx - gap * 0.12 + lean * 0.5, -hh * 0.7, sx + lean, -hh);
        if (i < N - 1) ctx.quadraticCurveTo(sx + gap * 0.18 + lean * 0.5, -hh * 0.62, sx + gap * 0.5, -hC * (0.46 + 0.1 * Math.sin(f * Math.PI)));
      }
      ctx.quadraticCurveTo(wC + gap * 0.2, -hC * 0.4, wC + 4, -hC * 0.2); ctx.quadraticCurveTo(wC + 6, -2, wC + 8, 3); ctx.closePath();
      var cgr = ctx.createLinearGradient(0, -hC, 0, 2); cgr.addColorStop(0, 'rgba(236,251,252,' + (0.96 * a).toFixed(3) + ')'); cgr.addColorStop(1, 'rgba(160,220,228,' + (0.92 * a).toFixed(3) + ')');
      ctx.fillStyle = cgr; ctx.fill();
      ctx.strokeStyle = 'rgba(70,150,170,' + (0.85 * a).toFixed(3) + ')'; ctx.lineWidth = 2.4; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,' + (0.9 * a).toFixed(3) + ')'; ctx.beginPath(); ell(ctx, -wC * 0.4, -hC * 0.35, 3, hC * 0.18, 0.2); ctx.fill();
    }
    // droplets (ballistic)
    for (var k = 0; k < 11; k++) {
      var an = Math.PI * (0.12 + 0.76 * (k / 10)) + (hash(k) - 0.5) * 0.18, v = 190 + hash(k + 7) * 110, tt = u * 0.95;
      var dx = -Math.cos(an) * v * 0.55 * tt, dy = -Math.sin(an) * v * tt + 330 * tt * tt;
      if (dy > 4 || tt < 0.04) continue;
      var vx = -Math.cos(an) * v * 0.55, vy = -Math.sin(an) * v + 660 * tt, ang = Math.atan2(vy, vx), rr = 4 + hash(k + 3) * 3;
      ctx.save(); ctx.translate(dx, dy); ctx.rotate(ang + Math.PI / 2);
      ctx.fillStyle = 'rgba(206,240,245,' + (0.95 * a).toFixed(3) + ')';
      ctx.beginPath(); ctx.moveTo(0, -rr * 2); ctx.quadraticCurveTo(rr, -rr * 0.4, rr, 0); ctx.arc(0, 0, rr, 0, Math.PI); ctx.quadraticCurveTo(-rr, -rr * 0.4, 0, -rr * 2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(70,150,170,' + (0.8 * a).toFixed(3) + ')'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
  function drawBubbleDot(ctx, x, y, r, alpha) {
    if (!ctx) return;
    var a = alpha == null ? 1 : clamp01(alpha); r = num(r, 5);
    if (a <= 0.001 || !(r > 0)) return;
    x = num(x, 0); y = num(y, 0);
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,' + (0.2 * a).toFixed(3) + ')'; ctx.beginPath(); circ(ctx, x, y, r); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.85 * a).toFixed(3) + ')'; ctx.lineWidth = Math.max(1, r * 0.2); ctx.stroke();
    dot(ctx, x - r * 0.35, y - r * 0.38, Math.max(0.8, r * 0.26), 'rgba(255,255,255,' + (0.95 * a).toFixed(3) + ')');
    ctx.restore();
  }

  // ================================================================= WATER LILY
  var lilyPad = function (q) {   // flattened pad with a notch toward the viewer-right
    q.moveTo(0, 0); q.lineTo(40, 4.5);
    q.ellipse(0, 0, 42, 15, 0, 0.36, TAU - 0.06);
    q.closePath();
  };
  function petalPath(ctx, len, wid) {
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.bezierCurveTo(wid, -len * 0.18, wid * 0.85, -len * 0.74, 0, -len);
    ctx.bezierCurveTo(-wid * 0.85, -len * 0.74, -wid, -len * 0.18, 0, 0); ctx.closePath();
  }
  function drawPetal(ctx, ang, len, wid, fill, line, tip) {
    ctx.save(); ctx.rotate(ang);
    petalPath(ctx, len, wid); ctx.fillStyle = fill; ctx.fill();
    if (tip) { ctx.save(); ctx.clip(); ctx.fillStyle = tip; ctx.beginPath(); ell(ctx, 0, -len, wid * 0.9, len * 0.34, 0); ctx.fill(); ctx.restore(); }
    petalPath(ctx, len, wid); ctx.strokeStyle = line; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.strokeStyle = 'rgba(234,223,207,0.9)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, -len * 0.15); ctx.lineTo(0, -len * 0.75); ctx.stroke();
    ctx.restore();
  }
  function drawLily(ctx, x, y, s, open, color, t) {
    if (!ctx) return;
    s = num(s, 1); if (!(s > 0)) return;
    var op = num(open, 0), tt = num(t, 0), X = num(x, 0), Y = num(y, 0);
    ctx.save(); ctx.translate(X, Y + Math.sin(tt * 1.3 + X * 0.02) * 1.5 * s); ctx.scale(s, s);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.rotate(Math.sin(tt * 1.1 + X * 0.01) * 0.03);
    // pad + its shadow on the water
    oval(ctx, 3, 4, 44, 14, 0, 'rgba(30,70,80,0.18)');
    ctx.fillStyle = LAKE.pad; fillP(ctx, P('lily.pad', lilyPad));
    ctx.save(); clipP(ctx, P('lily.pad', lilyPad));
    ctx.fillStyle = mix(LAKE.pad, LAKE.padEdge, 0.45); ctx.fillRect(-45, 4, 90, 14);
    ctx.fillStyle = 'rgba(214,234,196,0.75)'; ctx.beginPath(); ell(ctx, -12, -6, 20, 4.4, -0.05); ctx.fill();
    ctx.strokeStyle = rgba(LAKE.padEdge, 0.55); ctx.lineWidth = 1.4; ctx.beginPath();
    for (var v = 0; v < 7; v++) { var va = 0.6 + v * 0.8; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(va) * 36, Math.sin(va) * 12.5); }
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = LAKE.padEdge; ctx.lineWidth = 2.6; strokeP(ctx, P('lily.pad', lilyPad));
    if (op >= 0) {
      var o = Math.max(0, Math.min(1.35, op)), oc = Math.min(1, o), pop = 1 + Math.max(0, o - 1) * 0.5;
      var c = color ? colOf(color) : null, tint = c ? mix(c.base, LAKE.gold, 0.15) : LAKE.gold;
      ctx.save(); ctx.translate(0, -3); ctx.scale(pop, pop);
      if (oc < 0.08) {   // closed bud
        drawPetal(ctx, 0, 30, 10, LAKE.petal, '#C9B9A2', c ? rgba(c.light, 0.6) : 'rgba(255,214,200,0.6)');
      } else {
        var back = 7, front = 5, L1 = 26 + 9 * oc, L2 = 21 + 6 * oc;
        for (var i = 0; i < back; i++) { var f = i / (back - 1) - 0.5; drawPetal(ctx, f * (0.5 + 2.1 * oc), L1, 10, '#F6EEE2', '#C9B9A2', c ? rgba(c.light, 0.6) : 'rgba(255,226,150,0.45)'); }
        // centre
        ctx.save(); ctx.translate(0, -6 * oc); ctx.scale(1, 0.6);
        var cg = ctx.createRadialGradient(0, -8, 1, 0, -8, 16 * oc + 2);
        cg.addColorStop(0, mix(tint, '#FFFFFF', 0.35)); cg.addColorStop(1, tint);
        ctx.fillStyle = cg; ctx.beginPath(); circ(ctx, 0, -8, 14 * oc + 2); ctx.fill();
        ctx.strokeStyle = c ? lineOf(c) : '#C99A12'; ctx.lineWidth = 1.8; ctx.stroke();
        ctx.restore();
        for (var d = 0; d < 6; d++) dot(ctx, (d - 2.5) * 4 * oc, -6 - 4 * oc + Math.abs(d - 2.5) * 0.8, 1.8, '#FFF1B8');
        ctx.save(); ctx.translate(0, 5); for (var j = 0; j < front; j++) { var g2 = j / (front - 1) - 0.5; drawPetal(ctx, g2 * (0.9 + 2.3 * oc), L2 * (0.8 - 0.12 * oc), 9, LAKE.petal, '#C9B9A2', null); } ctx.restore();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  // ================================================================= SPARKLE
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
      x.fillStyle = '#5E8A50'; x.strokeStyle = '#3E6034'; x.lineWidth = 2.4;
      x.beginPath(); x.moveTo(-26, -34); x.lineTo(-8, 4); x.lineTo(-44, 4); x.closePath(); x.fill(); x.stroke();
      x.beginPath(); x.moveTo(-26, -18); x.lineTo(-4, 20); x.lineTo(-48, 20); x.closePath(); x.fill(); x.stroke();
      x.fillStyle = '#7A5130'; x.fillRect(-29, 20, 6, 10);
      x.fillStyle = '#7A5130'; x.fillRect(18, 4, 7, 26);
      x.fillStyle = '#7FA65E'; x.strokeStyle = '#4E7038'; x.beginPath(); circ(x, 21, -6, 18); x.fill(); x.stroke();
      oval(x, 15, -12, 6, 4, -0.5, '#A6C584');
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
    oval(ctx, 2, 4, 52, 52, 0, 'rgba(40,50,60,0.22)');
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
  function card(ctx) {
    ctx.fillStyle = '#FFF8EA'; ctx.beginPath(); rrect(ctx, -45, -47, 90, 94, 18); ctx.fill();
    ctx.save(); ctx.beginPath(); rrect(ctx, -45, -47, 90, 94, 18); ctx.clip(); ctx.fillStyle = '#F0E2C6'; ctx.fillRect(-46, 36, 92, 12); ctx.restore();
    ctx.strokeStyle = '#B89B72'; ctx.lineWidth = 3; ctx.beginPath(); rrect(ctx, -45, -47, 90, 94, 18); ctx.stroke();
  }
  function drawIcon(ctx, choice, size) {
    if (!ctx || !choice) return;
    size = num(size, 100); if (!(size > 0)) return;
    var t = choice, k = t.kind;
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (k === 'fish') {
      var sm = t.big === false ? SMALL : 1;
      ctx.translate(size * 0.05 * sm, 0);
      drawThing(ctx, t, size * 0.6, { wag: 0.3, t: 0.2 });
    } else if (k === 'bubble') {
      drawThing(ctx, t, size * 0.74, {});
    } else if (k === 'letter') {
      var s0 = size / 100; ctx.scale(s0, s0); card(ctx); signText(ctx, String(t.text == null ? '?' : t.text).slice(0, 4), 0, 0, 70, 52, INK);
    } else if (k === 'number') {
      var n = Math.round(num(t.n != null ? t.n : t.text, 1)), s1 = size / 100;
      ctx.scale(s1, s1);
      var dots = n >= 1 && n <= 10;
      card(ctx);
      signText(ctx, String(n), 0, dots ? -13 : 0, 70, dots ? 38 : 56, INK);
      if (dots) {
        var rows = n <= 5 ? [n] : [5, n - 5];
        rows.forEach(function (cnt, ri) {
          for (var i = 0; i < cnt; i++) dot(ctx, (i - (cnt - 1) / 2) * 14, rows.length === 1 ? 28 : 22 + ri * 13, 5, INK);
        });
      }
    } else if (k === 'color') {
      var c = pal(t.color) || FALLBACK.red, s2 = size / 100;
      ctx.scale(s2, s2);
      ctx.beginPath(); ctx.moveTo(40, 0);
      for (var j = 1; j <= 9; j++) { var a = j * TAU / 9, am = a - TAU / 18, ro = j % 2 ? 43 : 38; ctx.quadraticCurveTo(Math.cos(am) * 47, Math.sin(am) * 45, Math.cos(a) * ro, Math.sin(a) * ro * 0.95); }
      ctx.closePath();
      ctx.fillStyle = c.base; ctx.fill(); ctx.strokeStyle = lineOf(c); ctx.lineWidth = 3.4; ctx.stroke();
      oval(ctx, -16, -18, 10, 6, -0.6, rgba(mix(c.light, '#FFFFFF', 0.45), 0.85));
      dot(ctx, 30, 35, 6, c.base); ctx.strokeStyle = lineOf(c); ctx.lineWidth = 2.4; ctx.beginPath(); circ(ctx, 30, 35, 6); ctx.stroke();
    } else if (k === 'home') {
      drawHomeBadge(ctx, t.home, size * 0.46, {});
    } else if (k === 'size') {
      var inner = t.thing && KINDS.indexOf(t.thing.kind) >= 0 ? Object.assign({}, t.thing) : { kind: 'fish', color: t.color || 'orange' };
      var big = t.big === true || t.size === 'big';
      inner.big = big;
      if (!big) {
        ctx.strokeStyle = 'rgba(80,100,110,0.35)'; if (ctx.setLineDash) ctx.setLineDash([5, 5]); ctx.lineWidth = 2;
        ctx.beginPath(); rrect(ctx, -size * 0.44, -size * 0.44, size * 0.88, size * 0.88, size * 0.12); ctx.stroke(); if (ctx.setLineDash) ctx.setLineDash([]);
      }
      ctx.translate(size * 0.05, 0);
      drawThing(ctx, inner, size * 0.6, { t: 0.2 });
    } else {
      dot(ctx, 0, 0, size * 0.35, '#E9D7B9'); ctx.strokeStyle = '#A8875E'; ctx.lineWidth = 3; ctx.beginPath(); circ(ctx, 0, 0, size * 0.35); ctx.stroke();
    }
    ctx.restore();
  }

  // ================================================================= HINT HAND (fingertip at (x, y), points UP-LEFT)
  var scratch = null;
  function layer(ctx, x0, y0, w, h, alpha, fn) {
    var ds = devScale(ctx), k = Math.min(6, ds.k);
    var sc = k > 0 && w * k <= 2048 && h * k <= 2048 ? (scratch || (scratch = makeCanvas(2, 2))) : null;
    var g = sc && sc.getContext ? sc.getContext('2d') : null;
    if (!g) { ctx.save(); ctx.globalAlpha *= alpha; fn(ctx); ctx.restore(); return; }
    var W = Math.ceil(w * k), H = Math.ceil(h * k);
    if (sc.width < W || sc.height < H) { sc.width = Math.max(sc.width, W); sc.height = Math.max(sc.height, H); }
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W + 1, H + 1);
    g.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
    g.lineJoin = 'round'; g.lineCap = 'round';
    fn(g);
    g.setTransform(1, 0, 0, 1, 0, 0);
    ctx.save(); ctx.globalAlpha *= alpha;
    ctx.drawImage(sc, 0, 0, W, H, x0, y0, W / k, H / k);
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
    // cuff: straw weave like Tibo's sun hat, with the teal ribbon
    ctx.fillStyle = '#EBD39A'; ctx.strokeStyle = '#B89A5A'; ctx.lineWidth = s * 0.03;
    ctx.beginPath(); rrect(ctx, -s * 0.26, s * 0.76, s * 0.48, s * 0.16, s * 0.07); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#6FB7B0'; ctx.fillRect(-s * 0.24, s * 0.82, s * 0.44, s * 0.04);
    ctx.strokeStyle = 'rgba(201,174,110,0.9)'; ctx.lineWidth = s * 0.012;
    ctx.beginPath(); for (var i = 0; i < 6; i++) { var kx = -s * 0.2 + i * s * 0.075; ctx.moveTo(kx, s * 0.78); ctx.lineTo(kx + s * 0.02, s * 0.81); ctx.moveTo(kx, s * 0.87); ctx.lineTo(kx + s * 0.02, s * 0.9); } ctx.stroke();
    ctx.restore();
  }

  // ================================================================= misc public helpers
  function spotPos(thing, i, size, mirrored) {
    var mk = markOf(thing || {}), sc = (thing && thing.big === false ? SMALL : 1) * num(size, 104) / 100;
    if (!mk || mk.type !== 'spots') return { x: MX * sc, y: MY * sc };
    var L = spotLayout(mk.n), p = L.pts[Math.max(0, Math.min(L.n - 1, Math.round(num(i, 0))))];
    return { x: (MX + (mirrored ? -p[0] : p[0])) * sc, y: (MY + p[1]) * sc, r: L.r * sc };
  }
  function clearCache() { wcache = { key: '', c: null, t: -1e9 }; pcache = {}; pN = 0; bcache = {}; bkeys = []; scache = {}; stat.built = 0; stat.hits = 0; }

  TL.FishArt = {
    drawThing: drawThing, bodyBox: bodyBox,
    drawWater: drawWater, drawSurfaceFront: drawSurfaceFront, waveY: waveY,
    drawRod: drawRod, drawLine: drawLine, drawHook: drawHook, drawFloat: function (ctx, x, y, s, rock) { if (ctx) drawFloat(ctx, num(x, 0), num(y, 0), num(s, 1), rock); },
    drawRipple: drawRipple, drawSplash: drawSplash, drawBubbleDot: drawBubbleDot, drawLily: drawLily,
    drawHomeBadge: drawHomeBadge, drawIcon: drawIcon, drawHintHand: drawHintHand, drawSparkle: drawSparkle,
    spotLayout: function (n) { var L = spotLayout(n); return { n: L.n, r: L.r, cx: MX, cy: MY, pts: L.pts.map(function (p) { return [MX + p[0], MY + p[1]]; }) }; },
    spotPos: spotPos, thingKey: thingKey, pal: function (n) { return pal(n) || null; },
    bodyBitmap: function (thing, px, night, mirrored) { return bodyBitmap(thing || {}, px, night, !!mirrored); },
    setCanvasFactory: function (fn) { canvasFactory = typeof fn === 'function' ? fn : null; bcache = {}; bkeys = []; scratch = null; },
    stats: function () { return { built: stat.built, hits: stat.hits, cached: bkeys.length }; },
    clearCache: clearCache,
    PALETTE: FALLBACK, NEUTRAL: NEUTRAL, LAKE: LAKE, MOODS: MOODS, FONT: FONT, INK: INK,
    SHAPES: SHAPES, ANIMALS: ANIMALS, HOMES: HOMES, KINDS: KINDS, SMALL: SMALL,
    MARK: { x: MX, y: MY }, EYE: { x: EYE_X, y: EYE_Y, r: EYE_R }, MOUTH: { x: 56, y: 12 }, BUBBLE_R: BR / 100
  };
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
