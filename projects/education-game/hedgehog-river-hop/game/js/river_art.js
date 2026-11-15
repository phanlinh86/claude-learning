/* NH.RiverArt (Nim's River Hop) — the woodland brook and its two grassy banks, pure canvas code (DESIGN §3, §4.4).
 *
 *   NH.RiverArt.drawRiver(ctx, layout, t, season, opt)  the water in layout.river: a teal-slate depth gradient across the stream
 *       (shallow #7FB8B4 at the banks → deep #4E8E95 in the middle; winter #8FB3BF → #5F8794), soft light streaks flowing
 *       along flowDir at ≈ 40 px/s (slower near the banks), tiny twinkling sparkles (more in summer), a wet shadow under the
 *       bank edges, winter ice rims. Landscape: the brook narrows a little towards the top and starts at y = play.y0 − 30,
 *       where drawBanks lays a grassy lip (+ bushes) so it comes out from under the far tree line.
 *       opt = { quality 0.5..1 (streak / sparkle count), wind (autumn gusts, px/s, nudges the streaks), alpha }
 *   NH.RiverArt.drawBanks(ctx, layout, season, opt)     near + far banks: grass with a wavy earth lip at the water, pebbles,
 *       grass patches / tufts (autumn rust leaves, spring petals), seeded env/* decorations (bush, reeds, rock, flowers) kept
 *       away from nimHome (±110), goal (±120, + the 90 px roll), HUD, speech bubble and the water; the far bank gets
 *       env/tree_<m> by the goal. opt = { alpha, decor (default true), tree (default true), dpr }
 *   NH.RiverArt.drawTree(ctx, layout, season, opt)      only the far-bank tree (when the renderer wants it in a later pass:
 *       then call drawBanks with opt.tree = false)
 *   NH.RiverArt.flowDir(layout)  → {x, y} unit flow direction (landscape {0, 1} downwards, portrait {1, 0} left → right)
 *   NH.RiverArt.across(layout, a) → [lo, hi]: the water's across-stream extent (screen x in landscape, y in portrait) at
 *       along-stream position a (y in landscape, x in portrait) — for leaves / petals floating inside the water. The returned
 *       array is reused: copy it if you keep it.
 *   NH.RiverArt.treeRect(layout) → {x, y, w, h, k} of the far-bank tree (the fruit hangs under its canopy).
 *   NH.RiverArt.decorRects(layout) → [{key, x, y, w, h}] of the placed decorations (tests / debug).
 *   NH.RiverArt.SPRITES — the asset keys this module asks NH.Assets for (see docs/reports/art_env.md).
 *
 * season: 'spring'|'summer'|'autumn'|'winter' or 0..3. Everything geometric (edges, Path2D shapes, gradients, decoration
 * placement) is cached per layout (W, H, rects) and season; a frame only strokes the moving streaks and sparkles.
 * Node-safe at load (no DOM access until drawing; works without Path2D by tracing the cached points).
 */
(function (NH) {
  'use strict';
  const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
  const sIndex = s => (typeof s === 'number' ? ((Math.round(s) % 4) + 4) % 4 : Math.max(0, SEASONS.indexOf(s)));
  // ---- palette (DESIGN §3; BANK / EARTH mirror tools/art_env.js) ----
  const WATER = [
    { shallow: '#7FB8B4', mid: '#67A3A3', deep: '#4E8E95', shade: 'rgba(30,58,64,', light: '#D9F0EC' },
    { shallow: '#7FB8B4', mid: '#67A3A3', deep: '#4E8E95', shade: 'rgba(30,58,64,', light: '#D9F0EC' },
    { shallow: '#7FB8B4', mid: '#67A3A3', deep: '#4E8E95', shade: 'rgba(30,58,64,', light: '#D9F0EC' },
    { shallow: '#8FB3BF', mid: '#779DAA', deep: '#5F8794', shade: 'rgba(40,60,72,', light: '#EAF4F7' },
  ];
  const BANK = [
    { grass: '#9CC98A', light: '#B4D8A2', dark: '#82B272', tuft: '#74A565', bits: ['#F4D3DD', '#FBEFF3'] },
    { grass: '#86B86E', light: '#9FCA88', dark: '#6FA25A', tuft: '#62944F', bits: ['#F7F3E6', '#EDE7C8'] },
    { grass: '#B9A764', light: '#CDBD7E', dark: '#A08E52', tuft: '#8F7E47', bits: ['#C47E55', '#A8633F', '#D9A06A'] },
    { grass: '#F1F4F8', light: '#FFFFFF', dark: '#C9D4E2', tuft: '#A39578', bits: ['#FFFFFF'] },
  ];
  const EARTH = { base: '#9A7B58', dark: '#6E5640', light: '#B39470', snow: '#E4EAF1' };
  const PEB = { body: '#B5AEA2', ol: '#7E776C', hi: '#D8D2C7' };
  // sprite table: [w, h, anchorX, anchorY] (viewBox, bottom-centre anchors) — tools/art_env.js SPRITES
  const SP = { bush: [200, 140, 100, 136], reeds: [120, 160, 60, 156], rock: [120, 80, 60, 76], flowers: [140, 70, 70, 68], tree: [260, 360, 130, 354] };
  const KEYS = [];
  const keyOf = {};
  for (const k of ['bush', 'reeds', 'flowers', 'tree']) { keyOf[k] = SEASONS.map(m => 'env/' + k + '_' + m); KEYS.push(...keyOf[k]); }
  keyOf.rock = SEASONS.map(() => 'env/rock'); KEYS.push('env/rock');

  // ---- small helpers ----
  function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const hasP2D = () => typeof Path2D !== 'undefined';
  /** a cached shape: flat point list (+ Path2D when the browser has it) */
  function shape(pts, closed) {
    const o = { pts, closed, p: null };
    if (hasP2D()) { const p = new Path2D(); for (let i = 0; i < pts.length; i += 2) i ? p.lineTo(pts[i], pts[i + 1]) : p.moveTo(pts[i], pts[i + 1]); if (closed) p.closePath(); o.p = p; }
    return o;
  }
  function trace(ctx, o) { ctx.beginPath(); const q = o.pts; for (let i = 0; i < q.length; i += 2) i ? ctx.lineTo(q[i], q[i + 1]) : ctx.moveTo(q[i], q[i + 1]); if (o.closed) ctx.closePath(); }
  function fillS(ctx, o) { if (o.p) ctx.fill(o.p); else { trace(ctx, o); ctx.fill(); } }
  function strokeS(ctx, o) { if (o.p) ctx.stroke(o.p); else { trace(ctx, o); ctx.stroke(); } }
  /** batched ellipses [x, y, rx, ry, rot]… as one cached path */
  function blobs(list) {
    const o = { list, p: null };
    if (hasP2D()) { const p = new Path2D(); for (const e of list) { p.moveTo(e[0] + e[2] * Math.cos(e[4]), e[1] + e[2] * Math.sin(e[4])); p.ellipse(e[0], e[1], e[2], e[3], e[4], 0, Math.PI * 2); } o.p = p; }
    return o;
  }
  function traceBlobs(ctx, o) { ctx.beginPath(); for (const e of o.list) { ctx.moveTo(e[0] + e[2] * Math.cos(e[4]), e[1] + e[2] * Math.sin(e[4])); ctx.ellipse(e[0], e[1], e[2], e[3], e[4], 0, Math.PI * 2); } }
  function fillB(ctx, o) { if (!o.list.length) return; if (o.p) ctx.fill(o.p); else { traceBlobs(ctx, o); ctx.fill(); } }
  function strokeB(ctx, o) { if (!o.list.length) return; if (o.p) ctx.stroke(o.p); else { traceBlobs(ctx, o); ctx.stroke(); } }
  /** batched open polylines [[x0,y0,x1,y1,…], …] */
  function lines(list) {
    const o = { list, p: null };
    if (hasP2D()) { const p = new Path2D(); for (const q of list) for (let i = 0; i < q.length; i += 2) i ? p.lineTo(q[i], q[i + 1]) : p.moveTo(q[i], q[i + 1]); o.p = p; }
    return o;
  }
  function strokeL(ctx, o) { if (!o.list.length) return; if (o.p) { ctx.stroke(o.p); return; } ctx.beginPath(); for (const q of o.list) for (let i = 0; i < q.length; i += 2) i ? ctx.lineTo(q[i], q[i + 1]) : ctx.moveTo(q[i], q[i + 1]); ctx.stroke(); }
  const rectHit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  // =================================================================================================================
  // geometry (cached per layout)
  // =================================================================================================================
  let G = null;
  const SIG = ['W', 'H'];
  function sigOf(L) {
    const r = L.river || {}, n = L.near || {}, f = L.far || {}, p = L.play || {}, h = L.hud || {}, b = L.bubble || {}, nh = L.nimHome || {}, g = L.goal || {};
    return [L.W, L.H, L.portrait ? 1 : 0, r.x, r.y, r.w, r.h, n.x, n.y, n.w, n.h, f.x, f.y, f.w, f.h, p.y0, h.x, h.y, h.w, b.x, b.y, b.w, b.h, nh.x, nh.y, g.x, g.y];
  }
  function same(L) {
    if (!G) return false;
    const s = G.sig;
    // cheap compare without allocating: walk the same fields as sigOf
    const r = L.river || 0, n = L.near || 0, f = L.far || 0, p = L.play || 0, h = L.hud || 0, b = L.bubble || 0, nh = L.nimHome || 0, g = L.goal || 0;
    return s[0] === L.W && s[1] === L.H && s[2] === (L.portrait ? 1 : 0) && s[3] === r.x && s[4] === r.y && s[5] === r.w && s[6] === r.h &&
      s[7] === n.x && s[8] === n.y && s[9] === n.w && s[10] === n.h && s[11] === f.x && s[12] === f.y && s[13] === f.w && s[14] === f.h &&
      s[15] === p.y0 && s[16] === h.x && s[17] === h.y && s[18] === h.w && s[19] === b.x && s[20] === b.y && s[21] === b.w && s[22] === b.h &&
      s[23] === nh.x && s[24] === nh.y && s[25] === g.x && s[26] === g.y;
  }
  void SIG;

  /** the river's along / across frame for a layout */
  function frame(L) {
    const W = L.W, H = L.H, P = !!L.portrait;
    const play = L.play || { x0: 0, y0: 0, x1: W, y1: H };
    const near = L.near, far = L.far;
    const river = L.river || (P ? { x: 0, y: far.y + far.h, w: W, h: near.y - far.y - far.h } : { x: near.x + near.w, y: play.y0, w: far.x - near.x - near.w, h: H - play.y0 });
    if (!P) {
      // landscape: along = y (flow down), across = x. lo bank = near (left), hi bank = far (right)
      return { P, W, H, play, near, far, river, loBase: river.x, hiBase: river.x + river.w, a0: play.y0 - 30, a1: H + 12, bankTop: play.y0 - 40, bStart: play.y0 - 40, len: H - play.y0 + 40 };
    }
    // portrait: along = x (flow right), across = y. lo bank = far (top), hi bank = near (bottom)
    return { P, W, H, play, near, far, river, loBase: river.y, hiBase: river.y + river.h, a0: -14, a1: W + 14, bankTop: far.y - 6, bStart: -14, len: W };
  }
  function build(L, dpr) {
    const F = frame(L);
    const rnd = rng(0x5eed + Math.round(F.W) * 7 + Math.round(F.H) * 13 + (F.P ? 1 : 0));
    const ph = []; for (let i = 0; i < 8; i++) ph.push(rnd() * 6.283);
    const riverW = F.hiBase - F.loBase;
    const tipZone = F.P ? 0 : 70, tipEnd = F.P ? -1e9 : F.play.y0 + 40;
    const taper = a => (F.P ? 0 : Math.pow(clamp((tipEnd - a) / tipZone, 0, 1), 1.4) * Math.min(60, 0.07 * riverW));
    // wavy bank edges: inside the bank by ≈ 8 px on average, ±9 px organic wave (never more than ≈ 1 px into the river rect)
    const wLo = a => 5 * Math.sin(a / 57 + ph[0]) + 2.6 * Math.sin(a / 23 + ph[1]) + 1.4 * Math.sin(a / 9.5 + ph[2]);
    const wHi = a => 5 * Math.sin(a / 61 + ph[3]) + 2.6 * Math.sin(a / 21 + ph[4]) + 1.4 * Math.sin(a / 10.5 + ph[5]);
    const lo = a => F.loBase - 9 + wLo(a) + taper(a);
    const hi = a => F.hiBase + 9 + wHi(a) - taper(a);
    // lip (earth face) width per bank: landscape both ≈ 10…17 (wider lower = nearer the viewer); portrait far (faces the viewer) 22, near 8
    const lipLo = a => (F.P ? 22 + 2 * Math.sin(a / 37 + ph[6]) : 10 + 7 * clamp((a - F.a0) / (F.H - F.a0), 0, 1));
    const lipHi = a => (F.P ? 8 : 10 + 7 * clamp((a - F.a0) / (F.H - F.a0), 0, 1));
    const STEP = 8;
    const xy = (a, c, out) => { if (F.P) out.push(a, c); else out.push(c, a); };
    const along = []; for (let a = Math.min(F.a0, F.bStart) - STEP; a <= F.a1 + STEP; a += STEP) along.push(a);
    const alongW = along.filter(a => a >= F.a0);
    if (alongW[0] !== F.a0) alongW.unshift(F.a0);
    const polyline = (arr, fn) => { const o = []; for (const a of arr) xy(a, fn(a), o); return o; };
    const g = { F, sig: sigOf(L), dpr, lo, hi, lipLo, lipHi, grads: [], streaks: null, sparkles: null };
    // ---- water polygon (pushed 22 px under both banks)
    const wp = polyline(alongW, a => lo(a) - 22);
    for (let i = alongW.length - 1; i >= 0; i--) xy(alongW[i], hi(alongW[i]) + 22, wp);
    g.water = shape(wp, true);
    g.edgeLo = shape(polyline(alongW, lo), false);
    g.edgeHi = shape(polyline(alongW, hi), false);
    g.shallowLo = shape(polyline(alongW, a => lo(a) + lipLo(a) + 14), false);
    g.shallowHi = shape(polyline(alongW, a => hi(a) - lipHi(a) - 14), false);
    // ---- winter ice rims (a shelf from the lip into the water, bumpy)
    const iceW = (a, k) => 14 + 5 * Math.sin(a / 31 + ph[k]) + 10 * Math.max(0, Math.sin(a / 83 + ph[k + 1])) + 2 * Math.sin(a / 7 + ph[k]);
    const iceLo = polyline(alongW, a => lo(a) + lipLo(a) - 2); for (let i = alongW.length - 1; i >= 0; i--) xy(alongW[i], lo(alongW[i]) + lipLo(alongW[i]) + iceW(alongW[i], 0), iceLo);
    const iceHi = polyline(alongW, a => hi(a) - lipHi(a) + 2); for (let i = alongW.length - 1; i >= 0; i--) xy(alongW[i], hi(alongW[i]) - lipHi(alongW[i]) - iceW(alongW[i], 2), iceHi);
    g.iceLo = shape(iceLo, true); g.iceHi = shape(iceHi, true);
    g.iceLoEdge = shape(polyline(alongW, a => lo(a) + lipLo(a) + iceW(a, 0)), false);
    g.iceHiEdge = shape(polyline(alongW, a => hi(a) - lipHi(a) - iceW(a, 2)), false);
    // ---- banks: grass polygons + earth polygons (lip) + waterline / foam lines
    const outerLo = F.P ? F.bankTop : -12, outerHi = F.P ? F.H + 12 : F.W + 12;
    const bankPoly = (fn, outer, arr) => { const o = polyline(arr, fn); xy(arr[arr.length - 1], outer, o); xy(arr[0], outer, o); return o; };
    const arrB = along.filter(a => a >= F.bStart - STEP);
    g.grassLo = shape(bankPoly(lo, outerLo, arrB), true);
    g.grassHi = shape(bankPoly(hi, outerHi, arrB), true);
    g.earthLo = shape(bankPoly(a => lo(a) + lipLo(a), outerLo, arrB), true);
    g.earthHi = shape(bankPoly(a => hi(a) - lipHi(a), outerHi, arrB), true);
    g.waterLo = shape(polyline(arrB, a => lo(a) + lipLo(a)), false);
    g.waterHi = shape(polyline(arrB, a => hi(a) - lipHi(a)), false);
    g.foamLo = shape(polyline(alongW, a => lo(a) + lipLo(a) + 5), false);
    g.foamHi = shape(polyline(alongW, a => hi(a) - lipHi(a) - 5), false);
    g.rimLo = shape(polyline(arrB, a => lo(a) - 3), false);
    g.rimHi = shape(polyline(arrB, a => hi(a) + 3), false);
    g.slopeLo = shape(polyline(arrB, a => lo(a) - 11), false);
    g.slopeHi = shape(polyline(arrB, a => hi(a) + 11), false);
    g.midLo = shape(polyline(arrB, a => lo(a) + lipLo(a) * 0.5), false);
    g.midHi = shape(polyline(arrB, a => hi(a) - lipHi(a) * 0.5), false);
    // ---- landscape: the grassy lip across the brook's source (it comes out from under the tree line)
    if (!F.P) {
      const yT = F.bankTop - 6, yB = a => F.a0 + 16 + 3 * Math.sin(a / 19 + ph[7]) + 2 * Math.sin(a / 7 + ph[2]);
      const x0 = lo(F.a0) - 30, x1 = hi(F.a0) + 30, src = [x0, yT], srcE = [], srcW = [];
      for (let x = x0; x <= x1; x += 8) { src.push(x, yB(x) + 10); srcE.push(x, yB(x) + 10); srcW.push(x, yB(x)); }
      src.push(x1, yT);
      g.srcEarth = shape(src, true);
      const sg = [x0, yT]; for (let x = x0; x <= x1; x += 8) sg.push(x, yB(x)); sg.push(x1, yT);
      g.srcGrass = shape(sg, true);
      g.srcLine = shape(srcE, false); g.srcRim = shape(srcW.map((v, i) => (i % 2 ? v - 3 : v)), false);
      g.srcBox = { x0, x1, y: F.a0 + 16 };
    }
    // ---- bank texture (patches, tufts, bits, pebbles), cached per season (bits differ)
    const T = rng(0xba4c + Math.round(F.W + F.H * 3));
    const inBank = (side, a, d) => (side ? hi(a) + d : lo(a) - d);   // d = distance from the grass edge into the bank
    const bankDepth = side => (F.P ? (side ? F.H - F.hiBase : F.loBase - F.bankTop) : (side ? F.W - F.hiBase : F.loBase));
    const patchesL = [], patchesD = [], tufts = [], pebbles = [], pebHi = [], bits = [[], [], [], []];
    for (let side = 0; side < 2; side++) {
      const depth = Math.max(40, bankDepth(side) + 10);
      const area = depth * F.len, nP = Math.round(area / 8000);
      for (let i = 0; i < nP; i++) {
        const a = F.bStart + T() * (F.a1 - F.bStart), d = 14 + T() * (depth - 14), c = inBank(side, a, d);
        const o = []; xy(a, c, o);
        const r = 10 + T() * 22;
        (T() < 0.5 ? patchesL : patchesD).push([o[0], o[1], r, r * 0.42, F.P ? 0 : 1.2 + (T() - 0.5) * 0.4]);
        if (T() < 0.55) { const s = 4 + T() * 4; tufts.push([o[0] - s, o[1], o[0] - s * 1.3, o[1] - s * 1.5, o[0], o[1], o[0], o[1] - s * 1.9, o[0], o[1], o[0] + s * 1.3, o[1] - s * 1.4]); }
        for (let q = 0; q < 1; q++) {
          const o2 = []; xy(a + (T() - 0.5) * 60, inBank(side, a, 10 + T() * (depth - 10)), o2);
          for (let si = 0; si < 4; si++) { const n = BANK[si].bits.length; if (si === 3 && T() < 0.5) continue; bits[si].push([o2[0], o2[1], si === 2 ? 4.5 : 2.2, si === 2 ? 2.4 : 2.2, T() * 3.14, (T() * n) | 0]); }
        }
      }
      // pebbles along the lip / waterline and a few on the grass by the edge
      for (let a = F.a0 + 10; a < F.a1; a += 22) {
        if (T() < 0.42) continue;
        const lip = side ? lipHi(a) : lipLo(a), onLip = T() < 0.72;
        const dd = onLip ? lip * (0.55 + T() * 0.55) : -(4 + T() * 16);
        const c = side ? hi(a) - dd : lo(a) + dd, r = (onLip ? 3.2 : 2.6) + T() * (onLip ? 5 : 3);
        const o = []; xy(a, c, o);
        pebbles.push([o[0], o[1], r, r * 0.66, (T() - 0.5) * 0.6]);
        pebHi.push([o[0] - r * 0.3, o[1] - r * 0.25, r * 0.38, r * 0.2, -0.4]);
      }
    }
    g.patchL = blobs(patchesL); g.patchD = blobs(patchesD); g.tufts = lines(tufts); g.pebbles = blobs(pebbles); g.pebHi = blobs(pebHi);
    g.bits = bits.map(list => { const n = Math.max(...BANK.map(b => b.bits.length)); const by = []; for (let k = 0; k < n; k++) by.push(blobs(list.filter(e => e[5] === k))); return by; });
    // ---- decorations
    placeDecor(g, L, F);
    return g;
  }

  // ---- decoration placement (seeded, deterministic per layout) ----
  function placeDecor(g, L, F) {
    const ins = L.ins || { top: 0, left: 0, right: 0, bottom: 0 };
    const nimH = L.nimH || 190, ax = L.ax || (F.P ? { x: 0, y: -1 } : { x: 1, y: 0 });
    const keep = [];
    const pad = (r, m) => (r ? { x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m } : null);
    if (L.hud) keep.push(pad(L.hud, 12));
    if (L.bubble) keep.push(pad(L.bubble, 12));
    const nh = L.nimHome, gl = L.goal;
    if (nh) keep.push({ x: nh.x - 110, y: nh.y - nimH - 24, w: 220, h: nimH + 24 + 110 });
    if (gl) {
      const r = { x: gl.x - 120, y: gl.y - nimH - 24, w: 240, h: nimH + 24 + 120 };
      if (ax.x > 0) r.w += 90; if (ax.x < 0) { r.x -= 90; r.w += 90; } if (ax.y < 0) { r.y -= 90; r.h += 90; } if (ax.y > 0) r.h += 90;
      keep.push(r);
    }
    const rv = F.river, water = F.P ? { x: -50, y: F.loBase + 6, w: F.W + 100, h: F.hiBase - F.loBase - 12 } : { x: F.loBase + 6, y: -50, w: F.hiBase - F.loBase - 12, h: F.H + 100 };
    void rv;
    const tr = treePlace(L, F);
    g.tree = tr;
    const placed = [];
    if (tr) placed.push({ x: tr.x + tr.w * 0.25, y: tr.y + tr.h * 0.5, w: tr.w * 0.5, h: tr.h * 0.5 });
    const R = rng(0xdec0 + Math.round(F.W) * 3 + Math.round(F.H));
    const K = F.P ? { bush: 0.62, reeds: 0.62, rock: 0.55, flowers: 0.72 } : { bush: 0.62, reeds: 0.6, rock: 0.52, flowers: 0.7 };
    const list = [];
    const tryPut = (kind, x, y) => {
      const s = SP[kind], k = K[kind] * (0.9 + R() * 0.2);
      const r = { x: x - s[2] * k, y: y - s[3] * k, w: s[0] * k, h: s[1] * k };
      if (rectHit(r, water)) return false;
      for (const q of keep) if (rectHit(r, q)) return false;
      for (const q of placed) { const sh = { x: q.x + q.w * 0.15, y: q.y + q.h * 0.15, w: q.w * 0.7, h: q.h * 0.7 }; if (rectHit({ x: r.x + r.w * 0.15, y: r.y + r.h * 0.15, w: r.w * 0.7, h: r.h * 0.7 }, sh)) return false; }
      if (r.y + r.h > F.H + 4 || r.x + r.w < 0 || r.x > F.W) return false;
      if (r.y < (F.P ? F.bankTop - 30 : F.play.y0 - 60)) return false;
      placed.push(r);
      list.push({ kind, keys: keyOf[kind], x: r.x, y: r.y, w: r.w, h: r.h, by: y });
      return true;
    };
    const KINDS = ['bush', 'flowers', 'rock', 'flowers', 'bush', 'reeds'];
    for (let side = 0; side < 2; side++) {
      const fn = side ? g.hi : g.lo;
      let n = 0;
      const maxN = Math.round(F.len / (F.P ? 160 : 105));
      for (let i = 0; i < 60 && n < maxN; i++) {
        const a = (F.P ? 10 : F.play.y0 - 10) + R() * (F.a1 - (F.P ? 10 : F.play.y0 - 10));
        let kind = KINDS[(R() * KINDS.length) | 0];
        let d;   // depth into the bank from the grass edge
        if (kind === 'reeds') d = F.P ? 14 + R() * 10 : 40;
        else d = 30 + R() * 160;
        const cc = side ? fn(a) + d : fn(a) - d;   // lo bank → lo(a) − d, hi bank → hi(a) + d
        let x, y;
        if (F.P) { x = a; y = cc; } else { x = cc; y = a; }
        // in landscape the sprite's base is y; in portrait the base is y too (sprites stand upright)
        if (kind === 'reeds' && !F.P) { x = side ? fn(a) + 40 : fn(a) - 40; }
        if (F.P && side === 0) { y = Math.min(y, fn(a) - 8); }                  // far bank (top): base above the edge
        if (F.P && side === 1) { const s = SP[kind], k = K[kind]; y = Math.max(y, fn(a) + s[3] * k * 0.98 + 4); }   // near bank: whole sprite below the edge
        if (tryPut(kind, x, y)) n++;
      }
    }
    list.sort((p, q) => p.by - q.by);
    g.decor = list;
    // landscape source: 3 bushes on the lip across the tip (they hide the brook's start under the trees)
    g.srcDecor = [];
    if (!F.P && g.srcBox) {
      const sb = g.srcBox, n = Math.max(2, Math.round((sb.x1 - sb.x0) / 300));
      for (let i = 0; i < n; i++) {
        const k = 0.5 + R() * 0.12, s = SP.bush, x = sb.x0 + 40 + (i + 0.5) / n * (sb.x1 - sb.x0 - 80) + (R() - 0.5) * 60;
        const r = { x: x - s[2] * k, y: sb.y + 2 - s[3] * k, w: s[0] * k, h: s[1] * k };
        let ok = true; for (const q of keep) if (rectHit(r, q)) ok = false;
        if (ok) g.srcDecor.push({ kind: 'bush', keys: keyOf.bush, x: r.x, y: r.y, w: r.w, h: r.h, by: sb.y });
      }
    }
  }
  function treePlace(L, F) {
    const gl = L.goal; if (!gl) return null;
    const s = SP.tree, lim = [];
    if (L.hud) lim.push(L.hud); if (L.bubble) lim.push(L.bubble);
    let x, base, kmax;
    if (!F.P) { base = gl.y - 64; x = gl.x + 6; kmax = 0.78; }
    else { base = F.far.y + F.far.h * 0.74; x = gl.x + 175; kmax = 0.62; }
    // top limit: below the HUD / bubble boxes that overlap horizontally (+ 8)
    let k = kmax;
    for (let it = 0; it < 3; it++) {
      const w = s[0] * k; let top = -1e9;
      for (const r of lim) if (x + w / 2 > r.x && x - w / 2 < r.x + r.w) top = Math.max(top, r.y + r.h + 8);
      const avail = base - top;
      k = clamp(Math.min(kmax, avail / s[1]), 0.3, kmax);
    }
    const w = s[0] * k, h = s[1] * k;
    // keep the trunk on the bank: the canopy may overhang the grass edge by ≤ 12 px, and inside the screen
    if (!F.P) x = clamp(x, F.hiBase + 9 + w / 2 - 12, F.W - (L.ins ? L.ins.right : 0) - w * 0.32);
    else x = clamp(x, w * 0.5 + 6, F.W - (L.ins ? L.ins.right : 0) - w * 0.42);
    return { x: x - s[2] * k, y: base - s[3] * k, w, h, k, base, keys: keyOf.tree };
  }
  function geom(L, opt) {
    if (same(L)) return G;
    const dpr = (opt && opt.dpr) || (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    G = build(L, dpr);
    return G;
  }

  // =================================================================================================================
  // drawing
  // =================================================================================================================
  function sprite(key, wpx, hpx, dpr) {
    const A = NH.Assets; if (!A) return null;
    if (A.sprite) { const s = A.sprite(key, Math.max(wpx, hpx) * dpr); if (s) return s; }
    return A.img ? A.img(key) : null;
  }
  function drawDecor(ctx, d, si, dpr) {
    const im = sprite(d.keys[si], d.w, d.h, dpr);
    if (im) ctx.drawImage(im, d.x, d.y, d.w, d.h);
  }
  function waterGrad(ctx, g, si) {
    let gr = g.grads[si];
    if (gr) return gr;
    const F = g.F, w = WATER[si];
    const c0 = F.loBase - 6, c1 = F.hiBase + 6;
    gr = F.P ? ctx.createLinearGradient(0, c0, 0, c1) : ctx.createLinearGradient(c0, 0, c1, 0);
    gr.addColorStop(0, w.shallow); gr.addColorStop(0.16, w.mid); gr.addColorStop(0.5, w.deep); gr.addColorStop(0.84, w.mid); gr.addColorStop(1, w.shallow);
    // along-stream light: landscape — the far end (top) reflects the sky a little
    let ov = null;
    if (!F.P) { ov = ctx.createLinearGradient(0, F.a0, 0, F.a0 + 260); ov.addColorStop(0, 'rgba(236,244,240,0.42)'); ov.addColorStop(1, 'rgba(236,244,240,0)'); }
    // a soft darkening right at the source (under the trees)
    let src = null;
    if (!F.P) { src = ctx.createLinearGradient(0, F.a0, 0, F.a0 + 70); src.addColorStop(0, w.shade + '0.35)'); src.addColorStop(1, w.shade + '0)'); }
    g.grads[si] = gr = { gr, ov, src };
    return gr;
  }
  function makeFlow(g) {
    const F = g.F, R = rng(0xf10 + Math.round(F.W * 5 + F.H));
    const area = (F.hiBase - F.loBase) * (F.a1 - F.a0);
    const nS = clamp(Math.round(area / 11000), 18, 90), nK = clamp(Math.round(area / 16000), 12, 60);
    const st = new Float32Array(nS * 6), sk = new Float32Array(nK * 5);
    for (let i = 0; i < nS; i++) { st[i * 6] = 0.06 + R() * 0.88; st[i * 6 + 1] = R(); st[i * 6 + 2] = 34 + R() * 80; st[i * 6 + 3] = 2.2 + R() * 3; st[i * 6 + 4] = 0.85 + R() * 0.3; st[i * 6 + 5] = R() * 6.28; }
    for (let i = 0; i < nK; i++) { sk[i * 5] = 0.08 + R() * 0.84; sk[i * 5 + 1] = R(); sk[i * 5 + 2] = 1.2 + R() * 2.2; sk[i * 5 + 3] = R() * 6.28; sk[i * 5 + 4] = 2.2 + R() * 2.2; }
    g.streaks = st; g.nS = nS; g.sparkles = sk; g.nK = nK;
  }

  function drawRiver(ctx, layout, t, season, opt) {
    if (!ctx || !layout || !layout.near || !layout.far) return;
    opt = opt || {};
    const g = geom(layout, opt), F = g.F, si = sIndex(season), w = WATER[si];
    t = +t || 0;
    const q = clamp(opt.quality == null ? 1 : opt.quality, 0.3, 1);
    ctx.save();
    if (opt.alpha != null) ctx.globalAlpha *= opt.alpha;
    const a0 = ctx.globalAlpha;
    const gg = waterGrad(ctx, g, si);
    ctx.fillStyle = gg.gr; fillS(ctx, g.water);
    if (gg.ov) { ctx.fillStyle = gg.ov; fillS(ctx, g.water); }
    // shallow light bands just off the banks
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = w.light; ctx.globalAlpha = a0 * 0.16; ctx.lineWidth = 16; strokeS(ctx, g.shallowLo); strokeS(ctx, g.shallowHi);
    // ---- flowing streaks
    if (!g.streaks) makeFlow(g);
    const st = g.streaks, sk = g.sparkles, span = F.a1 - F.a0, wind = clamp(+opt.wind || 0, -80, 80);
    const nS = Math.round(g.nS * q);
    ctx.strokeStyle = w.light;
    for (let i = 0; i < nS; i++) {
      const o = i * 6, cf = st[o], len = st[o + 2], lw = st[o + 3], sp = st[o + 4], wp = st[o + 5];
      const edgeSlow = 0.6 + 0.4 * Math.sin(Math.PI * cf);
      const cyc = span + len;
      let u = (st[o + 1] * cyc + t * 40 * sp * edgeSlow) % cyc;
      const a = F.a0 - len + u, am = a + len * 0.5;
      const loA = g.lo(am), hiA = g.hi(am);
      const c = loA + (hiA - loA) * cf + 4 * Math.sin(t * 0.7 + wp) + wind * 0.08;
      const f = u / cyc, fade = Math.min(1, f * 7, (1 - f) * 7);
      const persp = F.P ? 1 : 0.55 + 0.45 * clamp((am - F.a0) / (F.H - F.a0), 0, 1);
      const al = 0.5 * (0.5 + 0.5 * Math.sin(t * 0.9 + wp * 2)) * fade * (si === 3 ? 0.8 : 1);
      if (al < 0.02) continue;
      ctx.globalAlpha = a0 * al;
      ctx.lineWidth = lw * persp;
      const bend = 3.5 * Math.sin(t * 1.3 + wp);
      ctx.beginPath();
      if (F.P) { ctx.moveTo(a, c); ctx.quadraticCurveTo(a + len * 0.5, c + bend, a + len * persp, c); }
      else { ctx.moveTo(c, a); ctx.quadraticCurveTo(c + bend, a + len * 0.5 * persp, c, a + len * persp); }
      ctx.stroke();
    }
    // ---- sparkles (4-point twinkles; summer: more and brighter sun glints)
    const nK = Math.round(g.nK * q * (si === 1 ? 1 : si === 3 ? 0.55 : 0.7));
    ctx.fillStyle = '#FFFFFF';
    for (let i = 0; i < nK; i++) {
      const o = i * 5, cf = sk[o], sz = sk[o + 2] * (si === 1 ? 1.35 : 1), wp = sk[o + 3], fr = sk[o + 4];
      const tw = Math.sin(t * fr + wp); if (tw < 0.55) continue;
      const al = Math.pow((tw - 0.55) / 0.45, 2) * (si === 1 ? 0.95 : 0.75);
      const u = (sk[o + 1] * span + t * 40 * (0.6 + 0.4 * Math.sin(Math.PI * cf))) % span;
      const a = F.a0 + u, loA = g.lo(a), hiA = g.hi(a), c = loA + (hiA - loA) * cf;
      const x = F.P ? a : c, y = F.P ? c : a, r = sz * (2.2 + 1.2 * al);
      ctx.globalAlpha = a0 * al;
      ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.22, y - r * 0.22); ctx.lineTo(x + r, y); ctx.lineTo(x + r * 0.22, y + r * 0.22);
      ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.22, y + r * 0.22); ctx.lineTo(x - r, y); ctx.lineTo(x - r * 0.22, y - r * 0.22); ctx.closePath(); ctx.fill();
    }
    // ---- wet shadow under the bank edges + the source shade
    ctx.globalAlpha = a0;
    ctx.strokeStyle = w.shade + '0.16)'; ctx.lineWidth = 64; strokeS(ctx, g.edgeLo); strokeS(ctx, g.edgeHi);
    ctx.strokeStyle = w.shade + '0.2)'; ctx.lineWidth = 34; strokeS(ctx, g.edgeLo); strokeS(ctx, g.edgeHi);
    if (gg.src) { ctx.fillStyle = gg.src; fillS(ctx, g.water); }
    // ---- winter ice rims
    if (si === 3) {
      ctx.fillStyle = '#EAF4F7'; ctx.globalAlpha = a0 * 0.95; fillS(ctx, g.iceLo); fillS(ctx, g.iceHi);
      ctx.strokeStyle = '#B9D2DB'; ctx.lineWidth = 2.5; ctx.globalAlpha = a0 * 0.9; strokeS(ctx, g.iceLoEdge); strokeS(ctx, g.iceHiEdge);
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 5; ctx.globalAlpha = a0 * 0.5; strokeS(ctx, g.foamLo); strokeS(ctx, g.foamHi);
    }
    ctx.restore();
  }

  function drawBanks(ctx, layout, season, opt) {
    if (!ctx || !layout || !layout.near || !layout.far) return;
    opt = opt || {};
    const g = geom(layout, opt), F = g.F, si = sIndex(season), B = BANK[si], win = si === 3;
    ctx.save();
    if (opt.alpha != null) ctx.globalAlpha *= opt.alpha;
    const a0 = ctx.globalAlpha;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // ---- earth lips (+ waterline, foam), then grass
    const earthTop = win ? '#A88F74' : EARTH.base;
    ctx.fillStyle = earthTop; fillS(ctx, g.earthLo); fillS(ctx, g.earthHi);
    if (g.srcEarth) fillS(ctx, g.srcEarth);
    ctx.strokeStyle = EARTH.dark; ctx.globalAlpha = a0 * 0.45; ctx.lineWidth = F.P ? 7 : 5; strokeS(ctx, g.midLo); if (!F.P) strokeS(ctx, g.midHi);
    ctx.globalAlpha = a0; ctx.lineWidth = 3.5; strokeS(ctx, g.waterLo); strokeS(ctx, g.waterHi); if (g.srcLine) strokeS(ctx, g.srcLine);
    if (!win) { ctx.strokeStyle = WATER[si].light; ctx.globalAlpha = a0 * 0.4; ctx.lineWidth = 2.5; strokeS(ctx, g.foamLo); strokeS(ctx, g.foamHi); }
    ctx.globalAlpha = a0;
    ctx.fillStyle = B.grass; fillS(ctx, g.grassLo); fillS(ctx, g.grassHi); if (g.srcGrass) fillS(ctx, g.srcGrass);
    // slope shade + lit rim along the grass edge
    ctx.strokeStyle = B.dark; ctx.globalAlpha = a0 * (win ? 0.5 : 0.38); ctx.lineWidth = 14; strokeS(ctx, g.slopeLo); strokeS(ctx, g.slopeHi);
    ctx.strokeStyle = B.light; ctx.globalAlpha = a0 * 0.85; ctx.lineWidth = 3.5; strokeS(ctx, g.rimLo); strokeS(ctx, g.rimHi); if (g.srcRim) strokeS(ctx, g.srcRim);
    // ---- texture
    ctx.globalAlpha = a0 * (win ? 0.55 : 0.45); ctx.fillStyle = B.light; fillB(ctx, g.patchL);
    ctx.globalAlpha = a0 * (win ? 0.3 : 0.3); ctx.fillStyle = B.dark; fillB(ctx, g.patchD);
    ctx.globalAlpha = a0 * (win ? 0.55 : 0.8); ctx.strokeStyle = B.tuft; ctx.lineWidth = 2; strokeL(ctx, g.tufts);
    const bits = g.bits[si];
    for (let k = 0; k < B.bits.length; k++) { ctx.globalAlpha = a0 * (si === 2 ? 0.9 : 0.8); ctx.fillStyle = B.bits[k]; fillB(ctx, bits[k]); }
    // ---- pebbles
    ctx.globalAlpha = a0; ctx.fillStyle = PEB.body; ctx.strokeStyle = PEB.ol; ctx.lineWidth = 1.6; fillB(ctx, g.pebbles); strokeB(ctx, g.pebbles);
    ctx.fillStyle = win ? '#FFFFFF' : PEB.hi; fillB(ctx, g.pebHi);
    // ---- decorations (+ the source bushes) and the tree
    if (opt.decor !== false) {
      const dpr = g.dpr;
      for (const d of g.srcDecor) drawDecor(ctx, d, si, dpr);
      for (const d of g.decor) drawDecor(ctx, d, si, dpr);
    }
    if (opt.tree !== false && g.tree) drawDecor(ctx, g.tree, si, g.dpr);
    ctx.restore();
  }
  function drawTree(ctx, layout, season, opt) {
    if (!ctx || !layout || !layout.near || !layout.far) return;
    const g = geom(layout, opt || {}); if (!g.tree) return;
    ctx.save(); if (opt && opt.alpha != null) ctx.globalAlpha *= opt.alpha;
    drawDecor(ctx, g.tree, sIndex(season), g.dpr); ctx.restore();
  }
  const FL = { x: 0, y: 1 }, FP = { x: 1, y: 0 };
  function flowDir(layout) { return layout && (layout.portrait || (layout.ax && layout.ax.y !== 0)) ? FP : FL; }
  const ACR = [0, 0];
  function across(layout, a) { if (!layout || !layout.near) return ACR; const g = geom(layout); ACR[0] = g.lo(a) + g.lipLo(a); ACR[1] = g.hi(a) - g.lipHi(a); return ACR; }
  function treeRect(layout) { if (!layout || !layout.near) return null; const t = geom(layout).tree; return t ? { x: t.x, y: t.y, w: t.w, h: t.h, k: t.k } : null; }
  function decorRects(layout) { if (!layout || !layout.near) return []; const g = geom(layout); return g.decor.concat(g.srcDecor).map(d => ({ key: d.keys[0], kind: d.kind, x: d.x, y: d.y, w: d.w, h: d.h })); }

  NH.RiverArt = { drawRiver, drawBanks, drawTree, flowDir, across, treeRect, decorRects, SPRITES: KEYS, SEASONS, WATER, BANK, EARTH, _reset() { G = null; } };
})(typeof window !== 'undefined' ? (window.NH = window.NH || {}) : (globalThis.NH = globalThis.NH || {}));
