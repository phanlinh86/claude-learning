// Tibo's Dino Lake Fishing — unit test for TL.FishArt (game/js/fish_art.js), plain node, no browser.
// A mock 2D context records every call; Path2D is stubbed (and absent in the fallback run); a mock canvas factory exercises
// the body-bitmap cache. Checks: node-safe load, public API, exact palette, every kind × colour × mark × shape × n × text ×
// animal × size × option draws without throwing / NaN / unbalanced save-restore, bitmap cache reuse (same bitmap per
// thing + px bucket + night bucket + mirror), wriggle strips, mirrored marks, drawRod's tip formula, spot layouts
// (separate, inside the body, clear of the eye), guest images through TL.Assets, every lake / UI piece.
// Run: node tests/unit/fish_art.test.js   (exit code 1 on any failure)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

let fails = 0, passes = 0;
function ok(cond, msg) { if (cond) passes++; else { fails++; console.error('FAIL', msg); } }

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'game', 'js', 'fish_art.js'), 'utf8');

function mockCtx(matrix) {
  const calls = [], bad = [], images = [], fonts = [], texts = [];
  const grad = () => ({ addColorStop(o, c) { if (!(o >= 0 && o <= 1)) bad.push('stop ' + o); if (/NaN|undefined/.test(c)) bad.push('colour ' + c); } });
  const state = { globalAlpha: 1, lineWidth: 1, fillStyle: '#000', strokeStyle: '#000', font: '10px x', textAlign: 'left',
    textBaseline: 'alphabetic', lineJoin: 'miter', lineCap: 'butt', shadowColor: '', shadowBlur: 0, shadowOffsetY: 0, globalCompositeOperation: 'source-over' };
  const stack = [];
  let M = matrix ? Object.assign({}, matrix) : null;
  const ctx = new Proxy(state, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'save') return () => { calls.push('save'); stack.push([Object.assign({}, t), M && Object.assign({}, M)]); };
      if (k === 'restore') return () => { calls.push('restore'); const s = stack.pop(); if (!s) bad.push('restore without save'); else { Object.assign(t, s[0]); M = s[1]; } };
      if (k === 'getTransform') return M ? () => Object.assign({}, M) : undefined;
      if (k === 'scale') return (x, y) => { calls.push('scale'); if (!isFinite(x) || !isFinite(y)) bad.push('scale NaN'); if (M) { M.a *= x; M.b *= x; M.c *= y; M.d *= y; } };
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return (...a) => { if (a.some(v => !isFinite(v))) bad.push(k + ' NaN'); if (k === 'createRadialGradient' && (a[2] < 0 || a[5] < 0)) bad.push('gradient r<0'); calls.push(k); return grad(); };
      if (k === 'measureText') return (s) => ({ width: String(s).length * 50 });
      if (k === 'setLineDash') return () => {};
      if (k === 'drawImage') return (...a) => { calls.push('drawImage'); images.push(a[0]); if (a.slice(1).some(v => !isFinite(v))) bad.push('drawImage NaN'); };
      return (...a) => {
        calls.push(k);
        if (a.some(v => typeof v === 'number' && !isFinite(v))) bad.push(k + '(' + a.join(',') + ')');
        if ((k === 'arc' && a[2] < 0) || (k === 'ellipse' && (a[2] < 0 || a[3] < 0))) bad.push(k + ' negative radius ' + a.join(','));
        if (k === 'fillText') { if (/undefined|NaN|null/.test(String(a[0]))) bad.push('fillText ' + a[0]); fonts.push(t.font); texts.push(String(a[0])); }
      };
    },
    set(t, k, v) {
      if (typeof v === 'number' && !isFinite(v)) bad.push('set ' + String(k) + ' NaN');
      if (typeof v === 'string' && /NaN|undefined/.test(v)) bad.push('set ' + String(k) + ' ' + v);
      t[k] = v; return true;
    }
  });
  return { ctx, calls, bad, images, fonts, texts, depth: () => stack.length };
}
// a mock canvas for the bitmap cache: getContext returns a recording mock ctx
let canvasN = 0;
const canvasLog = [];
function mockCanvas(w, h) {
  const m = mockCtx(); canvasN++;
  const c = { width: w, height: h, _m: m, getContext: () => m.ctx };
  canvasLog.push(c);
  return c;
}

let p2dCount = 0;
function load(withPath2D, extra) {
  const sb = Object.assign({ console, Math }, extra || {});
  sb.window = sb;
  if (withPath2D) sb.Path2D = function () { p2dCount++; const p = this; ['moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'arc', 'ellipse', 'closePath', 'rect'].forEach(m => { p[m] = () => {}; }); };
  vm.createContext(sb);
  vm.runInContext(SRC, sb, { filename: 'fish_art.js' });
  return sb;
}

// node-safe load without window (plain global) and with a pre-existing TL
try {
  const sb = { console, Math }; sb.global = sb; vm.createContext(sb); vm.runInContext(SRC, sb);
  ok(sb.TL && sb.TL.FishArt, 'loads with no window (global fallback)');
  const sb2 = load(false, { TL: { keep: 1 } });
  ok(sb2.TL.keep === 1 && sb2.TL.FishArt, 'keeps an existing TL namespace');
} catch (e) { ok(false, 'node-safe load threw: ' + e.message); }

const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
const SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'oval', 'rect', 'diamond'];
const ANIMALS = ['bunny', 'fox', 'deer', 'squirrel', 'owl', 'raccoon', 'mouse', 'hedgehog', 'penguin', 'crab', 'goldfish', 'camel', 'lion'];
const TEXTS = ['A', 'Z', 'b', 'd', 'g', 'Đ', '3+2', '7−4', '7-4', '10+10', '12−5', '20', '12', '9', '', 'WWWWWWWW'];
const SCALE = { a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 }, MIRROR = { a: -2, b: 0, c: 0, d: 2, e: 0, f: 0 };

for (const withP2D of [false, true]) {
  const sb = load(withP2D), TL = sb.TL, A = TL && TL.FishArt, tag = withP2D ? '[Path2D] ' : '[no Path2D] ';
  ok(!!A, tag + 'TL.FishArt exists');
  if (!A) continue;
  ['drawThing', 'bodyBox', 'drawWater', 'drawSurfaceFront', 'waveY', 'drawRod', 'drawLine', 'drawHook', 'drawFloat', 'drawRipple',
    'drawSplash', 'drawBubbleDot', 'drawLily', 'drawHomeBadge', 'drawIcon', 'drawHintHand', 'drawSparkle', 'spotLayout', 'spotPos',
    'thingKey', 'pal', 'bodyBitmap', 'setCanvasFactory', 'stats', 'clearCache'].forEach(f => ok(typeof A[f] === 'function', tag + 'function ' + f));
  const want = { red: '#E84A4A/#A8282E/#F7A0A0', blue: '#3C8DE8/#1F5BA8/#A6CCF5', yellow: '#FFD23F/#C99A12/#FFEB9C',
    green: '#4CC26B/#2A8343/#A8E6B8', orange: '#FF9A2E/#C4650C/#FFCB8E', purple: '#8E44AD/#6840A8/#D2BDF3', pink: '#FF8FC0/#C9558A/#FFCCE2' };
  COLORS.forEach(c => { const p = A.PALETTE[c]; ok(p && [p.base, p.dark, p.light].join('/') === want[c], tag + 'palette ' + c); });
  ok(A.NEUTRAL.base === '#FFF4DE' && A.NEUTRAL.shade === '#E9D3AE' && A.NEUTRAL.line === '#B08E62' && A.NEUTRAL.fin === '#F7CBA8', tag + 'neutral fish hex');
  ok(A.INK === '#5A3B26' && A.LAKE.pad === '#9CC08A' && A.LAKE.padEdge === '#6F9361' && A.LAKE.petal === '#FFF8EE' && A.LAKE.gold === '#FFD86B', tag + 'ink / lily hex');
  ok(A.LAKE.bamboo === '#D9B66E' && A.LAKE.node === '#A9853E' && A.LAKE.line === '#FFF8E6' && A.LAKE.float === '#6FB7B0', tag + 'rod / line / float hex');
  const MW = { morning: '#9FD9D6/#5FAFB4', noon: '#8FD6DA/#4E9FB0', sunset: '#B9C6C4/#6E8C9A', night: '#3D5677/#22344F' };
  Object.keys(MW).forEach(m => ok(A.MOODS[m].top + '/' + A.MOODS[m].deep === MW[m], tag + 'water ' + m));
  ok(SHAPES.every(s => A.SHAPES.indexOf(s) >= 0) && ANIMALS.every(a => A.ANIMALS.indexOf(a) >= 0), tag + 'shape / animal lists');
  ok(['sea', 'ice', 'forest', 'desert', 'savanna'].every(h => A.HOMES.indexOf(h) >= 0), tag + 'homes');
  ok(A.pal('red').base === '#E84A4A' && A.pal('nope') === null, tag + 'pal lookup');
  TL.PALETTE = { red: { base: '#123456', dark: '#000000', light: '#FFFFFF' }, blue: { base: 'oops' } };
  ok(A.pal('red').base === '#123456' && A.pal('blue').base === '#3C8DE8', tag + 'TL.PALETTE used when valid');
  delete TL.PALETTE;

  const things = [].concat(
    COLORS.map(c => ({ kind: 'fish', color: c })), [{ kind: 'fish' }, { kind: 'fish', color: 'mauve' }, { kind: 'fish', color: '#7A55C0' }],
    ...SHAPES.map(s => COLORS.map(c => ({ kind: 'fish', mark: { shape: s, color: c } }))), [{ kind: 'fish', mark: { shape: 'blob' } }],
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, -2, NaN].map(n => ({ kind: 'fish', mark: { n } })),
    TEXTS.map(text => ({ kind: 'fish', mark: { text } })), [{ kind: 'fish', mark: {} }, { kind: 'fish', mark: 'x' }],
    ANIMALS.concat(['dragon']).map(a => ({ kind: 'bubble', animal: a })),
    [{ kind: 'fish', color: 'green', big: false }, { kind: 'fish', mark: { n: 3 }, big: false }, { kind: 'bubble', animal: 'fox', big: false }, { kind: 'mystery' }]
  );
  const opts = [{}, { t: 1.3, wag: 1 }, { wag: 0 }, { wriggle: 1, t: 0.4 }, { wriggle: 0.5, glow: 1, t: 2 }, { glow: 0.4, night: 1 }, { night: 1 },
    { count: 0 }, { count: 3 }, { count: 99 }, { count: -1 }, { blink: 1 }, { mouth: 'o' }, { face: -1 }, { wriggle: 1, count: 4, night: 0.6, face: -1 },
    { glow: NaN, wag: 'x', wriggle: NaN, count: 'y', night: 'z', t: NaN, blink: NaN }];
  for (const t of things) {
    for (const size of [104, 312, 60]) {
      const b = A.bodyBox(t, size);
      ok(b.w > 0 && b.h > 0 && b.r > 0, tag + 'bodyBox ' + JSON.stringify(t) + ' ' + size);
      const m = mockCtx();
      try { A.drawThing(m.ctx, t, size, {}); ok(m.bad.length === 0 && m.depth() === 0, tag + 'size ' + size + ' ' + JSON.stringify(t)); }
      catch (e) { ok(false, tag + 'drawThing threw at size ' + size + ' ' + JSON.stringify(t) + ': ' + e.message); }
    }
    for (const o of opts) {
      for (const mat of [null, SCALE, MIRROR]) {
        if (mat) A.setCanvasFactory(mockCanvas); else A.setCanvasFactory(null);
        const m = mockCtx(mat);
        try { A.drawThing(m.ctx, t, 104, o); } catch (e) { ok(false, tag + 'drawThing threw ' + JSON.stringify(t) + ' ' + JSON.stringify(o) + ': ' + e.stack); continue; }
        ok(m.bad.length === 0, tag + 'clean calls ' + JSON.stringify(t) + ' ' + JSON.stringify(o) + ' ' + m.bad.slice(0, 3).join(' | '));
        ok(m.depth() === 0, tag + 'save/restore balanced ' + JSON.stringify(t));
        ok(m.calls.filter(c => c === 'fill' || c === 'drawImage').length > 2, tag + 'draws something ' + JSON.stringify(t) + ' ' + JSON.stringify(o));
      }
    }
  }
  // the bitmaps drawn into must be clean too
  ok(canvasLog.every(c => c._m.bad.length === 0 && c._m.depth() === 0), tag + 'bitmap contexts clean + balanced');
  A.setCanvasFactory(null);

  const count = (t, o, f, mat) => { const m = mockCtx(mat); A.drawThing(m.ctx, t, 104, o); return f ? m.calls.filter(c => c === f).length : m.calls.length; };
  ok(count({ kind: 'fish', mark: { n: 4 } }, { count: 4 }) > count({ kind: 'fish', mark: { n: 4 } }, { count: 0 }), tag + 'count highlights spots');
  ok(count({ kind: 'fish', mark: { n: 12 } }, {}) > count({ kind: 'fish', mark: { n: 1 } }, {}), tag + 'more spots draw more');
  ok(count({ kind: 'fish', color: 'red' }, { glow: 1 }) > count({ kind: 'fish', color: 'red' }, {}), tag + 'glow adds a halo');
  ok(count({ kind: 'fish', color: 'red' }, { night: 1 }) > count({ kind: 'fish', color: 'red' }, {}), tag + 'night adds the rim glow');
  ok(count({ kind: 'bubble', animal: 'fox' }, { night: 1 }) > count({ kind: 'bubble', animal: 'fox' }, {}), tag + 'bubble night glow');
  // night never darkens: no dark translucent overlay is set as fill at night
  { const m = mockCtx(); const fills = []; A.drawThing(new Proxy(m.ctx, { get(t, k) { return t[k]; }, set(t, k, v) { if (k === 'fillStyle') fills.push(v); t[k] = v; return true; } }), { kind: 'fish', color: 'blue' }, 104, { night: 1 });
    ok(!fills.some(f => /^rgba\((\d+),(\d+),(\d+)/.test(f) && (+RegExp.$1 + +RegExp.$2 + +RegExp.$3) < 200), tag + 'night adds no dark overlay'); }
  // glyph font + real minus + text
  { const m = mockCtx(); A.drawThing(m.ctx, { kind: 'fish', mark: { text: '7-4' } }, 104, {});
    ok(m.fonts.length >= 2 && m.fonts.every(f => /^bold [\d.]+px ui-rounded, "Arial Rounded MT Bold", system-ui/.test(f)), tag + 'glyph font ' + m.fonts[0]);
    ok(m.texts.indexOf('7−4') >= 0, tag + 'text mark shows a real minus sign'); }
  { const m = mockCtx(); m.ctx.measureText = undefined; A.drawThing(m.ctx, { kind: 'fish', mark: { text: 'A' } }, 104, {});
    const big = parseFloat(m.fonts[0].split(' ')[1]); ok(big > 50, tag + 'single glyph is big (' + big + 'px in the 100 box)'); }
  // big:false scales by 0.6
  { const m = mockCtx(); const sc = []; A.drawThing(new Proxy(m.ctx, { get(t, k) { if (k === 'scale') return (x) => { sc.push(x); }; return t[k]; }, set(t, k, v) { t[k] = v; return true; } }), { kind: 'fish', color: 'red', big: false }, 100, {});
    ok(Math.abs(sc[0] - 0.6) < 1e-9, tag + 'big:false scales by 0.6 (' + sc[0] + ')'); }
  ok(Math.abs(A.bodyBox({ kind: 'fish', big: false }, 100).h - 60) < 1e-9 && Math.abs(A.bodyBox({ kind: 'fish' }, 100).w - 150) < 1e-9, tag + 'bodyBox: length 1.5 × size, small 0.6');
  ok(Math.abs(A.bodyBox({ kind: 'bubble' }, 100).w - 125) < 1e-9, tag + 'bubble diameter 1.25 × size');

  // ---- bitmap cache
  A.clearCache(); A.setCanvasFactory(mockCanvas);
  { const th = { kind: 'fish', color: 'purple' }, b1 = A.bodyBitmap(th, 208, 0), b2 = A.bodyBitmap(th, 206, 0.05), b3 = A.bodyBitmap({ kind: 'fish', color: 'purple' }, 208, 0);
    ok(b1 && b1 === b2 && b1 === b3, tag + 'bodyBitmap: same thing + px bucket + night bucket → the same bitmap');
    ok(A.bodyBitmap(th, 208, 1) !== b1, tag + 'night bucket → its own bitmap');
    ok(A.bodyBitmap(th, 208, 0, true) !== b1, tag + 'mirrored → its own bitmap');
    ok(A.bodyBitmap(th, 312, 0) !== b1, tag + 'size bucket → its own bitmap');
    ok(A.bodyBitmap({ kind: 'fish', color: 'red' }, 208, 0) !== b1, tag + 'colour → its own bitmap');
    ok(b1.width >= 280 && b1.height >= 280, tag + 'bitmap sized to the px bucket (' + b1.width + '×' + b1.height + ')'); }
  { A.clearCache(); const th = { kind: 'fish', mark: { n: 7 } };
    const m1 = mockCtx(SCALE); A.drawThing(m1.ctx, th, 104, { t: 0.1, wag: 1 }); const built = A.stats().built;
    for (let i = 0; i < 20; i++) { const m = mockCtx(SCALE); A.drawThing(m.ctx, th, 104, { t: i * 0.1, wag: 1, count: i % 8, blink: i % 2 }); }
    ok(built === 1 && A.stats().built === 1 && A.stats().hits >= 20, tag + 'drawThing reuses the cached body (built ' + A.stats().built + ', hits ' + A.stats().hits + ')');
    const bmp = A.bodyBitmap(th, 208, 0);
    ok(m1.images.length === 1 && m1.images[0] === bmp, tag + 'drawThing draws the cached bitmap');
    const mw = mockCtx(SCALE); A.drawThing(mw.ctx, th, 104, { wriggle: 1, t: 0.3 });
    ok(mw.images.length >= 8 && mw.images.every(i => i === bmp) && A.stats().built === 1, tag + 'wriggle bends the same bitmap in strips (' + mw.images.length + ')');
    const mn = mockCtx(SCALE); A.drawThing(mn.ctx, th, 104, { night: 0.5 }); ok(A.stats().built === 2, tag + 'a new night bucket builds once');
    // mirrored transform: the mark is un-mirrored inside the bitmap (scale(-1,1) before the glyph)
    A.clearCache(); canvasLog.length = 0;
    const mm = mockCtx(MIRROR); A.drawThing(mm.ctx, { kind: 'fish', mark: { text: 'b' } }, 104, {});
    const bm = canvasLog[canvasLog.length - 1];
    ok(bm && bm._m.calls.indexOf('scale') >= 0 && bm._m.texts.indexOf('b') >= 0, tag + 'mirrored fish: mark drawn un-mirrored in its own bitmap');
  }
  A.setCanvasFactory(null); A.clearCache();
  { const m = mockCtx(SCALE); A.drawThing(m.ctx, { kind: 'fish', color: 'red' }, 104, {}); ok(m.images.length === 0 && m.calls.filter(c => c === 'fill').length > 5, tag + 'no canvas (node) → vector drawing'); }

  // body outline as a polygon (same beziers as fBody) for the inside test
  const BODY = (() => { const pts = [], cub = (p0, p1, p2, p3) => { for (let i = 1; i <= 24; i++) { const t = i / 24, u = 1 - t; pts.push([u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0], u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1]]); } };
    cub([60, 4], [60, -30], [34, -48], [2, -48]); cub([2, -48], [-26, -48], [-44, -30], [-50, -12]); pts.push([-52, 0]); cub([-50, 12], [-44, 32], [-26, 48], [2, 48]); cub([2, 48], [34, 48], [60, 34], [60, 4]); return pts; })();
  function insideBody(x, y, margin) {
    let inside = false;
    for (let i = 0, j = BODY.length - 1; i < BODY.length; j = i++) { const a = BODY[i], b = BODY[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside; }
    if (!inside) return false;
    for (let i = 0, j = BODY.length - 1; i < BODY.length; j = i++) { const a = BODY[i], b = BODY[j], dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy))); if (Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy) < margin) return false; }
    return true;
  }
  // ---- spot layouts: n spots, separate, inside the body, clear of the eye
  const E = A.EYE;
  for (let n = 1; n <= 12; n++) {
    const L = A.spotLayout(n);
    ok(L.n === n && L.pts.length === n, tag + 'spot layout n=' + n);
    let minGap = 1e9;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) minGap = Math.min(minGap, Math.hypot(L.pts[i][0] - L.pts[j][0], L.pts[i][1] - L.pts[j][1]) - 2 * L.r);
    ok(n === 1 || minGap >= 4, tag + 'spots clearly separate n=' + n + ' gap ' + minGap.toFixed(2));
    ok(L.pts.every(p => insideBody(p[0], p[1], L.r + 2)), tag + 'spots inside the body (≥ 2 units from the outline) n=' + n);
    ok(L.pts.every(p => Math.hypot(p[0] - E.x, p[1] - E.y) >= E.r + L.r + 1), tag + 'spots clear of the eye n=' + n);
    ok(L.r >= 6, tag + 'spots readable n=' + n + ' r ' + L.r);
    const p0 = A.spotPos({ kind: 'fish', mark: { n } }, 0, 100), p0m = A.spotPos({ kind: 'fish', mark: { n } }, 0, 100, true);
    ok(Math.abs(p0.x - L.pts[0][0]) < 1e-9 && Math.abs(p0.y - L.pts[0][1]) < 1e-9 && Math.abs((p0.x + p0m.x) / 2 - L.cx) < 1e-9, tag + 'spotPos n=' + n);
  }

  // ---- drawRod tip formula: tip = base + len·(cos(angle + 0.5·bend), sin(angle + 0.5·bend))
  for (const [ang, bend, len] of [[-1.05, 0, 170], [-1.05, 0.8, 170], [-1.05, -0.4, 150], [-0.6, 1, 120], [-1.45, 0.3, 200]]) {
    const base = { x: 110, y: 300 }, m = mockCtx(), tip = A.drawRod(m.ctx, base, len, ang, bend);
    const want = { x: base.x + len * Math.cos(ang + 0.5 * bend), y: base.y + len * Math.sin(ang + 0.5 * bend) };
    ok(Math.abs(tip.x - want.x) < 1e-9 && Math.abs(tip.y - want.y) < 1e-9, tag + 'drawRod tip formula a ' + ang + ' b ' + bend);
    ok(m.bad.length === 0 && m.depth() === 0 && m.calls.filter(c => c === 'stroke').length > 10, tag + 'drawRod draws cleanly');
  }
  { const t0 = A.drawRod(null, { x: 0, y: 0 }, 100, -1, 0), t1 = A.drawRod(null, { x: 0, y: 0 }, 100, -1, 0.8); ok(t1.y > t0.y, tag + 'bend > 0 pulls the tip down'); }
  { const t = A.drawRod(mockCtx().ctx, null, NaN, NaN, NaN); ok(isFinite(t.x) && isFinite(t.y), tag + 'drawRod defaults'); }
  { const a = A.waveY({ surfaceY: 300 }, 100, 0), b = A.waveY({ surfaceY: 300 }, 100, 1); ok(Math.abs(a - 300) < 5 && a !== b, tag + 'waveY moves around surfaceY'); }

  // ---- lake + UI pieces
  const lay = { W: 1556, H: 720, surfaceY: 288 };
  const scene = [
    ['drawWater moods', m => ['morning', 'noon', 'sunset', 'night'].forEach((mood, i) => A.drawWater(m.ctx, lay, i * 1.3, { mood, night: mood === 'night' ? 1 : 0, sunX: 400 }))],
    ['drawWater amb colours', m => A.drawWater(m.ctx, lay, 2, { waterTop: '#9FD9D6', waterDeep: '#5FAFB4', moodIndex: 2, glint: 0.5 })],
    ['drawWater defaults', m => A.drawWater(m.ctx, {}, NaN, null)],
    ['drawSurfaceFront', m => A.drawSurfaceFront(m.ctx, lay, 1, { mood: 'sunset' })],
    ['drawLine + float', m => { A.drawLine(m.ctx, { x: 300, y: 100 }, { x: 420, y: 500 }, 20, 1, 288); A.drawLine(m.ctx, { x: 300, y: 100 }, { x: 310, y: 160 }, 4, 0); }],
    ['drawLine defaults', m => A.drawLine(m.ctx, {}, {}, NaN, NaN)],
    ['drawHook', m => { A.drawHook(m.ctx, 100, 200, 1.2); A.drawHook(m.ctx, 100, 200, 1, true); A.drawFloat(m.ctx, 5, 5, 1, 0.2); }],
    ['drawRipple', m => [5, 30, 80].forEach(r => A.drawRipple(m.ctx, 100, 300, r, 0.7))],
    ['drawSplash', m => [0, 0.1, 0.3, 0.5, 0.8, 0.99].forEach(u => A.drawSplash(m.ctx, 400, 288, 1.2, u))],
    ['drawBubbleDot', m => [2, 6, 12].forEach(r => A.drawBubbleDot(m.ctx, 50, 400, r, 0.8))],
    ['drawLily', m => [-1, 0, 0.05, 0.3, 0.7, 1, 1.3, NaN].forEach((o, i) => A.drawLily(m.ctx, 600 + i * 90, 294, 1, o, [null, 'red', 'blue', '#7A55C0', 'mauve'][i % 5], i))],
    ['drawHomeBadges', m => ['sea', 'ice', 'forest', 'desert', 'savanna', 'moon'].forEach(h => A.drawHomeBadge(m.ctx, h, 46, { a: 0.7, pop: 0.5 }))],
    ['drawIcon color', m => COLORS.forEach(c => A.drawIcon(m.ctx, { kind: 'color', color: c }, 120))],
    ['drawIcon number', m => [0, 1, 3, 5, 6, 10, 12, 20].forEach(n => A.drawIcon(m.ctx, { kind: 'number', n }, 120))],
    ['drawIcon home', m => ['sea', 'ice', 'forest', 'desert', 'savanna'].forEach(h => A.drawIcon(m.ctx, { kind: 'home', home: h }, 120))],
    ['drawIcon size', m => { A.drawIcon(m.ctx, { kind: 'size', big: true }, 120); A.drawIcon(m.ctx, { kind: 'size', big: false, thing: { kind: 'bubble', animal: 'owl' } }, 120); }],
    ['drawIcon letter', m => A.drawIcon(m.ctx, { kind: 'letter', text: 'Q' }, 120)],
    ['drawIcon things', m => things.forEach(t => A.drawIcon(m.ctx, t, 120))],
    ['drawIcon unknown', m => A.drawIcon(m.ctx, { kind: '??' }, 120)],
    ['drawHintHand', m => [0, 0.5, 1].forEach(p => A.drawHintHand(m.ctx, 100, 200, p, 1))],
    ['drawHintHand alpha', m => A.drawHintHand(m.ctx, 100, 200, 0.3, 0.5, 80)],
    ['drawSparkle', m => [0, 0.5, 2].forEach(r => A.drawSparkle(m.ctx, 50, 60, 10, 0.7, r))]
  ];
  for (const [n, f] of scene) {
    for (const mat of [null, SCALE]) {
      A.setCanvasFactory(mat ? mockCanvas : null);
      const m = mockCtx(mat);
      try { f(m); ok(m.bad.length === 0, tag + n + ' clean ' + m.bad.slice(0, 3).join(' | ')); ok(m.depth() === 0, tag + n + ' balanced'); ok(m.calls.length > 0, tag + n + ' draws'); }
      catch (e) { ok(false, tag + n + ' threw: ' + e.stack); }
    }
  }
  A.setCanvasFactory(null);
  { const a = mockCtx(), b = mockCtx(); A.drawLine(a.ctx, { x: 0, y: 0 }, { x: 10, y: 300 }, 0, 0); A.drawLine(b.ctx, { x: 0, y: 0 }, { x: 10, y: 300 }, 0, 0, 100);
    ok(b.calls.length > a.calls.length, tag + 'drawLine puts the float on the surface when the hook is under water'); }
  { const a = mockCtx(), b = mockCtx(); A.drawLily(a.ctx, 0, 0, 1, -1, null, 0); A.drawLily(b.ctx, 0, 0, 1, 1, 'red', 0); ok(b.calls.length > a.calls.length * 2, tag + 'an open lily draws its flower'); }
  { const m = mockCtx(); A.drawHintHand(m.ctx, 0, 0, 0, 0); A.drawSparkle(m.ctx, 0, 0, 10, 0); A.drawHomeBadge(m.ctx, 'sea', 40, { a: 0 }); A.drawThing(m.ctx, { kind: 'fish' }, 0);
    A.drawRipple(m.ctx, 0, 0, 10, 0); A.drawSplash(m.ctx, 0, 0, 1, 1); A.drawBubbleDot(m.ctx, 0, 0, 4, 0); A.drawLily(m.ctx, 0, 0, 0); ok(m.calls.length === 0, tag + 'alpha 0 / size 0 / u 1 draws nothing'); }
  try { A.drawThing(null, { kind: 'fish' }, 120); A.drawThing(mockCtx().ctx, null, 120); A.drawWater(null); A.drawWater(mockCtx().ctx, null); A.drawSurfaceFront(null); A.drawLine(null); A.drawHook(null);
    A.drawRipple(null); A.drawSplash(null); A.drawBubbleDot(null); A.drawLily(null); A.drawHomeBadge(null); A.drawIcon(null); A.drawIcon(mockCtx().ctx, null); A.drawHintHand(null); A.drawSparkle(null); ok(true, ''); }
  catch (e) { ok(false, tag + 'null args threw ' + e.message); }
  ok(A.thingKey({ kind: 'fish', color: 'red' }) !== A.thingKey({ kind: 'fish', color: 'blue' }), tag + 'thingKey distinct colour');
  ok(A.thingKey({ kind: 'fish', mark: { n: 2 } }) !== A.thingKey({ kind: 'fish', mark: { n: 3 } }), tag + 'thingKey distinct n');
  ok(A.thingKey({ kind: 'fish', mark: { shape: 'star', color: 'red' } }) !== A.thingKey({ kind: 'fish', mark: { shape: 'star', color: 'blue' } }), tag + 'thingKey distinct mark colour');
  ok(A.thingKey({ kind: 'fish', color: 'red', big: false }) !== A.thingKey({ kind: 'fish', color: 'red' }), tag + 'thingKey distinct size');

  if (withP2D) {
    A.clearCache();
    const t = { kind: 'fish', color: 'green' };
    const before = p2dCount; A.drawThing(mockCtx().ctx, t, 104, { glow: 0.5 }); const first = p2dCount - before;
    const mid = p2dCount; for (let i = 0; i < 5; i++) A.drawThing(mockCtx().ctx, t, 104 + i * 7, { glow: 0.5 }); const again = p2dCount - mid;
    ok(first > 0 && again === 0, tag + 'Path2D cache reused (first ' + first + ', again ' + again + ')');
    A.clearCache();
  }

  // guest images via TL.Assets
  const imgB = { tag: 'bunny' };
  TL.Assets = { has: k => k === 'guests/bunny', sprite: () => imgB, img: () => null };
  { const m = mockCtx(); A.drawThing(m.ctx, { kind: 'bubble', animal: 'bunny' }, 104, {}); ok(m.images[0] === imgB, tag + 'bubble uses the TL.Assets guest image'); }
  { const m = mockCtx(); A.drawThing(m.ctx, { kind: 'bubble', animal: 'fox' }, 104, {}); ok(m.images.length === 0 && m.calls.filter(c => c === 'fill').length > 5, tag + 'missing image → placeholder'); }
  TL.Assets = { img: k => (k === 'guests/lion' ? imgB : null) };
  { const m = mockCtx(); A.drawThing(m.ctx, { kind: 'bubble', animal: 'lion' }, 104, { glow: 1, night: 1, wriggle: 1 }); ok(m.images[0] === imgB && m.bad.length === 0 && m.depth() === 0, tag + 'TL.Assets.img() fallback'); }
  TL.Assets = { has() { throw new Error('boom'); } };
  { const m = mockCtx(); A.drawThing(m.ctx, { kind: 'bubble', animal: 'owl' }, 104, {}); ok(m.depth() === 0 && m.calls.length > 10, tag + 'broken TL.Assets → placeholder'); }
  delete TL.Assets;
  A.clearCache();
}

console.log((fails ? 'FAILED ' : 'ok ') + passes + ' passed, ' + fails + ' failed (fish_art)');
process.exit(fails ? 1 : 0);
