// Bo's Farm Parade — unit test for FP.ParadeArt (game/js/parade_art.js), plain node, no browser.
// A mock 2D context records every call; Path2D is stubbed. Checks: public API exists, exact palette, every kind / colour /
// shape / n / text / option draws without throwing and actually draws, no NaN reaches the context, save/restore balanced,
// the Path2D cache is reused, animal images are used when FP.Assets has them, node-safe load.
// Run: node tests/unit/parade_art.test.js   (exit code 1 on any failure)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

let fails = 0, passes = 0;
function ok(cond, msg) { if (cond) passes++; else { fails++; console.error('FAIL', msg); } }

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'game', 'js', 'parade_art.js'), 'utf8');

function mockCtx() {
  const calls = [], bad = [], images = [];
  const grad = () => ({ addColorStop(o, c) { if (!(o >= 0 && o <= 1)) bad.push('stop ' + o); if (/NaN/.test(c)) bad.push('colour ' + c); } });
  const state = { globalAlpha: 1, lineWidth: 1, fillStyle: '#000', strokeStyle: '#000', font: '10px x', textAlign: 'left',
    textBaseline: 'alphabetic', lineJoin: 'miter', lineCap: 'butt', shadowColor: '', shadowBlur: 0, shadowOffsetY: 0 };
  const stack = [];
  const ctx = new Proxy(state, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'save') return () => { calls.push('save'); stack.push(Object.assign({}, t)); };
      if (k === 'restore') return () => { calls.push('restore'); const s = stack.pop(); if (!s) bad.push('restore without save'); else Object.assign(t, s); };
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return (...a) => { if (a.some(v => !isFinite(v))) bad.push(k + ' NaN'); calls.push(k); return grad(); };
      if (k === 'measureText') return (s) => ({ width: String(s).length * 50 });
      if (k === 'setLineDash') return () => {};
      if (k === 'drawImage') return (...a) => { calls.push('drawImage'); images.push(a[0]); if (a.slice(1).some(v => !isFinite(v))) bad.push('drawImage NaN'); };
      return (...a) => {
        calls.push(k);
        if (a.some(v => typeof v === 'number' && !isFinite(v))) bad.push(k + '(' + a.join(',') + ')');
        if ((k === 'arc' && a[2] < 0) || (k === 'ellipse' && (a[2] < 0 || a[3] < 0))) bad.push(k + ' negative radius ' + a.join(','));
        if (k === 'fillText' && /undefined|NaN/.test(String(a[0]))) bad.push('fillText ' + a[0]);
      };
    },
    set(t, k, v) {
      if (typeof v === 'number' && !isFinite(v)) bad.push('set ' + String(k) + ' NaN');
      if (typeof v === 'string' && /NaN|undefined/.test(v)) bad.push('set ' + String(k) + ' ' + v);
      t[k] = v; return true;
    }
  });
  return { ctx, calls, bad, images, depth: () => stack.length };
}

let p2dCount = 0;
function load(withPath2D, extra) {
  const sb = Object.assign({ console, Math }, extra || {});
  sb.window = sb;
  if (withPath2D) sb.Path2D = function () { p2dCount++; const p = this; ['moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'arc', 'ellipse', 'closePath', 'rect'].forEach(m => { p[m] = () => {}; }); };
  vm.createContext(sb);
  vm.runInContext(SRC, sb, { filename: 'parade_art.js' });
  return sb;
}

// node-safe load without window (plain global) and with a pre-existing FP
try {
  const sb = { console, Math }; sb.global = sb; vm.createContext(sb); vm.runInContext(SRC, sb);
  ok(sb.FP && sb.FP.ParadeArt, 'loads with no window (global fallback)');
  const sb2 = load(false, { FP: { keep: 1 } });
  ok(sb2.FP.keep === 1 && sb2.FP.ParadeArt, 'keeps an existing FP namespace');
} catch (e) { ok(false, 'node-safe load threw: ' + e.message); }

const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
for (const withP2D of [false, true]) {
  const sb = load(withP2D), FP = sb.FP, A = FP && FP.ParadeArt, tag = withP2D ? '[Path2D] ' : '[no Path2D] ';
  ok(!!A, tag + 'FP.ParadeArt exists');
  if (!A) continue;
  ['drawMember', 'bodyBox', 'drawWagon', 'drawStage', 'stageDip', 'drawHomeBadge', 'drawIcon', 'drawHintHand', 'drawDust',
    'pal', 'thingKey', 'clearCache', 'appleLayout'].forEach(f => ok(typeof A[f] === 'function', tag + 'function ' + f));
  // exact palette (DESIGN §3)
  const want = { red: '#E84A4A/#A8282E/#F7A0A0', blue: '#3C8DE8/#1F5BA8/#A6CCF5', yellow: '#FFD23F/#C99A12/#FFEB9C',
    green: '#4CC26B/#2A8343/#A8E6B8', orange: '#FF9A2E/#C4650C/#FFCB8E', purple: '#8E44AD/#6840A8/#D2BDF3', pink: '#FF8FC0/#C9558A/#FFCCE2' };
  COLORS.forEach(c => { const p = A.PALETTE[c]; ok(p && [p.base, p.dark, p.light].join('/') === want[c], tag + 'palette ' + c); });
  ok(A.WOOD.base === '#B98552' && A.WOOD.dark === '#7A5130' && A.WOOD.light === '#DDB07E', tag + 'wood hex');
  ok(A.HAY.base === '#E9C46A' && A.HAY.dark === '#B8913A' && A.HAY.light === '#F6E2A6', tag + 'hay hex');
  ok(A.APPLE.base === '#D9483B' && A.METAL.base === '#9AA4AE' && A.METAL.dark === '#636C75', tag + 'apple / metal hex');
  ok(A.OBJECTS.join() === 'bucket,boot,can,tractor,flower', tag + 'objects');
  ok(A.SHAPES.length === 8 && ['circle', 'square', 'triangle', 'star', 'heart', 'oval', 'rect', 'diamond'].every(s => A.SHAPES.indexOf(s) >= 0), tag + 'shapes');
  ok(A.HOMES.join() === 'farm,sea,ice,jungle,savanna', tag + 'homes');
  ok(A.pal('red').base === '#E84A4A' && A.pal('nope') === null, tag + 'pal lookup');
  // FP.PALETTE from content.js is used when valid, ignored when broken
  FP.PALETTE = { red: { base: '#123456', dark: '#000000', light: '#FFFFFF' }, blue: { base: 'oops' } };
  ok(A.pal('red').base === '#123456' && A.pal('blue').base === '#3C8DE8', tag + 'FP.PALETTE used when valid');
  delete FP.PALETTE;

  const things = [].concat(
    ...A.OBJECTS.map(o => COLORS.map(c => ({ kind: 'obj', obj: o, color: c }))),
    [{ kind: 'obj' }, { kind: 'obj', obj: 'spaceship', color: 'mauve' }],
    ...A.SHAPES.map(s => COLORS.map(c => ({ kind: 'block', shape: s, color: c }))), [{ kind: 'block', shape: 'blob' }],
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, -2, NaN].map(n => ({ kind: 'crate', n })),
    ['A', 'g', 'Đ', '3+2', '7−4', '7-4', '10+10', '12−5', '20', '9', '', 'WWWWWWWW'].map(text => ({ kind: 'tile', text })), [{ kind: 'tile', n: 15 }, { kind: 'tile' }],
    ['cow', 'pig', 'sheep', 'duck', 'hen', 'horse', 'goat', 'crab', 'penguin', 'lion', 'monkey', 'fishbowl', 'dragon'].map(a => ({ kind: 'animal', animal: a })),
    [{ kind: 'obj', obj: 'can', color: 'green', big: false }, { kind: 'animal', animal: 'sheep', big: false }, { kind: 'mystery' }]
  );
  const opts = [{}, { glow: 1 }, { glow: 0.4, night: 1 }, { dim: 1 }, { dim: 0.5, glow: 0.5 }, { wheel: 2.3 }, { step: 1 }, { night: 1 },
    { count: 0 }, { count: 3 }, { count: 99 }, { count: -1 }, { glow: NaN, dim: 'x', wheel: NaN, count: 'y' }];
  for (const t of things) {
    for (const size of [120, 360, 60]) {
      const b = A.bodyBox(t, size);
      ok(b.w > 0 && b.h > 0 && b.h <= size + 1e-9 && b.cy < 0 && b.cy > -b.h, tag + 'bodyBox ' + JSON.stringify(t) + ' ' + size + ' → ' + JSON.stringify(b));
    }
    for (const o of opts) {
      const m = mockCtx();
      try { A.drawMember(m.ctx, t, 120, o); } catch (e) { ok(false, tag + 'drawMember threw ' + JSON.stringify(t) + ' ' + JSON.stringify(o) + ': ' + e.stack); continue; }
      ok(m.bad.length === 0, tag + 'clean calls ' + JSON.stringify(t) + ' ' + JSON.stringify(o) + ' ' + m.bad.slice(0, 3).join(' | '));
      ok(m.depth() === 0, tag + 'save/restore balanced ' + JSON.stringify(t));
      ok(m.calls.filter(c => c === 'fill').length > 3, tag + 'draws something ' + JSON.stringify(t) + ' ' + JSON.stringify(o));
    }
  }
  // options and content change the drawing
  const count = (t, o, f) => { const m = mockCtx(); A.drawMember(m.ctx, t, 120, o); return f ? m.calls.filter(c => c === f).length : m.calls.length; };
  ok(count({ kind: 'crate', n: 4 }, { count: 4 }) > count({ kind: 'crate', n: 4 }, { count: 0 }), tag + 'count highlights apples');
  ok(count({ kind: 'crate', n: 12 }, {}) > count({ kind: 'crate', n: 1 }, {}), tag + 'more apples draw more');
  ok(count({ kind: 'obj', obj: 'boot', color: 'red' }, { glow: 1 }) > count({ kind: 'obj', obj: 'boot', color: 'red' }, {}), tag + 'glow adds a halo');
  // the cream sticker outline is always there (day and night: only its colour turns warm), so night draws as much as day
  ok(count({ kind: 'block', shape: 'star', color: 'red' }, { night: 1 }) >= count({ kind: 'block', shape: 'star', color: 'red' }, {}), tag + 'night keeps the rim');
  ok(count({ kind: 'animal', animal: 'cow', letter: 'C' }, { pennant: 'C' }, 'fillText') > count({ kind: 'animal', animal: 'cow' }, {}, 'fillText'), tag + 'pennant draws its letter');
  ok(count({ kind: 'obj', obj: 'boot', color: 'red' }, { pennant: 'B', face: -1 }) > count({ kind: 'obj', obj: 'boot', color: 'red' }, {}), tag + 'pennant (mirrored member)');
  ok(count({ kind: 'crate', n: 2 }, { appleN: 8 }) === count({ kind: 'crate', n: 2 }, {}), tag + 'appleN keeps the apple count');
  ok(A.appleLayout(8).r < A.appleLayout(2).r, tag + 'appleN: the round max gives the smaller radius');
  ok(count({ kind: 'tile', text: 'A' }, {}, 'fillText') >= 2, tag + 'tile draws its text');
  { const m = mockCtx(); A.drawMember(m.ctx, { kind: 'tile', text: '7-4' }, 120, {}); ok(true, ''); }
  // small = ×0.62 about the feet
  { const m = mockCtx(); const sc = []; const c = m.ctx; const orig = c.scale; A.drawMember(new Proxy(c, { get(t, k) { if (k === 'scale') return (x, y) => { sc.push(x); }; return t[k]; }, set(t, k, v) { t[k] = v; return true; } }), { kind: 'obj', obj: 'bucket', color: 'red', big: false }, 100, {});
    ok(Math.abs(sc[0] - 0.62) < 1e-9, tag + 'big:false scales by 0.62 (' + sc[0] + ')'); }
  ok(Math.abs(A.bodyBox({ kind: 'obj', big: false }, 100).h - 62) < 1e-9, tag + 'small bodyBox 0.62');

  // apple layouts: n apples, all inside the crate interior, no two overlapping (clearly separate)
  for (let n = 1; n <= 12; n++) {
    const L = A.appleLayout(n);
    ok(L.n === n && L.pts.length === n, tag + 'apple layout n=' + n);
    let minGap = 1e9;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) minGap = Math.min(minGap, Math.hypot(L.pts[i][0] - L.pts[j][0], L.pts[i][1] - L.pts[j][1]) - 2 * L.r * 1.04);
    ok(n === 1 || minGap > 1, tag + 'apples separate n=' + n + ' gap ' + minGap.toFixed(2));
    ok(L.pts.every(p => p[0] - L.r >= -41 && p[0] + L.r <= 41 && p[1] - L.r >= -95 && p[1] + L.r <= -33), tag + 'apples inside crate n=' + n);
    ok(L.r >= 7.5, tag + 'apples readable n=' + n + ' r ' + L.r.toFixed(2));
  }

  // scene pieces
  const scene = [
    ['drawWagon', m => A.drawWagon(m.ctx, 120, 1.2)],
    ['drawWagon default', m => A.drawWagon(m.ctx)],
    ['drawStage', m => A.drawStage(m.ctx, 0.9, { pop: 0.7, night: 1 })],
    ['drawStage plain', m => A.drawStage(m.ctx, 1)],
    ['drawHomeBadges', m => A.HOMES.concat(['moon']).forEach(h => A.drawHomeBadge(m.ctx, h, 46, { a: 0.7, pop: 0.5 }))],
    ['drawHomeBadge default', m => A.drawHomeBadge(m.ctx, 'sea')],
    ['drawIcon color', m => COLORS.forEach(c => A.drawIcon(m.ctx, { kind: 'color', color: c }, 120))],
    ['drawIcon number', m => [0, 1, 3, 5, 6, 10, 12, 20].forEach(n => A.drawIcon(m.ctx, { kind: 'number', n }, 120))],
    ['drawIcon home', m => A.HOMES.forEach(h => A.drawIcon(m.ctx, { kind: 'home', home: h }, 120))],
    ['drawIcon size', m => { A.drawIcon(m.ctx, { kind: 'size', big: true }, 120); A.drawIcon(m.ctx, { kind: 'size', big: false, thing: { kind: 'animal', animal: 'pig' } }, 120); }],
    ['drawIcon letter', m => A.drawIcon(m.ctx, { kind: 'letter', text: 'Q' }, 120)],
    ['drawIcon members', m => things.forEach(t => A.drawIcon(m.ctx, t, 120))],
    ['drawIcon unknown', m => A.drawIcon(m.ctx, { kind: '??' }, 120)],
    ['drawHintHand', m => [0, 0.5, 1].forEach(p => A.drawHintHand(m.ctx, 100, 200, p, 1))],
    ['drawHintHand alpha', m => A.drawHintHand(m.ctx, 100, 200, 0.3, 0.5, 80)],
    ['drawDust', m => A.drawDust(m.ctx, 50, 60, 14, 0.7)]
  ];
  for (const [n, f] of scene) {
    const m = mockCtx();
    try { f(m); ok(m.bad.length === 0, tag + n + ' clean ' + m.bad.slice(0, 3).join(' | ')); ok(m.depth() === 0, tag + n + ' balanced'); ok(m.calls.length > 0, tag + n + ' draws'); }
    catch (e) { ok(false, tag + n + ' threw: ' + e.stack); }
  }
  { const m = mockCtx(); A.drawHintHand(m.ctx, 0, 0, 0, 0); A.drawDust(m.ctx, 0, 0, 10, 0); A.drawHomeBadge(m.ctx, 'farm', 40, { a: 0 }); A.drawMember(m.ctx, { kind: 'obj' }, 0); ok(m.calls.length === 0, tag + 'alpha 0 / size 0 draws nothing'); }
  ok(A.stageDip(1, 0) === 0 && A.stageDip(1, 1) > 0 && A.stageDip(2, 1) > A.stageDip(1, 1), tag + 'stageDip');
  // null-safety
  try { A.drawMember(null, { kind: 'obj' }, 120); A.drawMember(mockCtx().ctx, null, 120); A.drawStage(null); A.drawHomeBadge(null); A.drawIcon(null); A.drawIcon(mockCtx().ctx, null); A.drawWagon(null); A.drawHintHand(null); A.drawDust(null); ok(true, ''); }
  catch (e) { ok(false, tag + 'null args threw ' + e.message); }
  ok(A.thingKey({ kind: 'obj', obj: 'boot', color: 'red' }) !== A.thingKey({ kind: 'obj', obj: 'boot', color: 'blue' }), tag + 'thingKey distinct colour');
  ok(A.thingKey({ kind: 'crate', n: 2 }) !== A.thingKey({ kind: 'crate', n: 3 }), tag + 'thingKey distinct n');
  ok(A.thingKey({ kind: 'obj', obj: 'boot', color: 'red', big: false }) !== A.thingKey({ kind: 'obj', obj: 'boot', color: 'red' }), tag + 'thingKey distinct size');

  // Path2D cache: drawing the same thing again builds no new paths
  if (withP2D) {
    A.clearCache();
    const t = { kind: 'obj', obj: 'tractor', color: 'green' };
    const before = p2dCount; A.drawMember(mockCtx().ctx, t, 120, { glow: 0.5 }); const first = p2dCount - before;
    const mid = p2dCount; for (let i = 0; i < 5; i++) A.drawMember(mockCtx().ctx, t, 120 + i * 7, { wheel: i, glow: 0.5 }); const again = p2dCount - mid;
    ok(first > 0 && again === 0, tag + 'Path2D cache reused (first ' + first + ', again ' + again + ')');
    A.drawMember(mockCtx().ctx, { kind: 'crate', n: 7 }, 120, {}); const c1 = p2dCount; A.drawMember(mockCtx().ctx, { kind: 'crate', n: 7 }, 120, {});
    ok(p2dCount === c1, tag + 'crate paths cached');
    A.clearCache();
  }

  // animal images via FP.Assets
  const imgCow = { tag: 'cow' }, imgStep = { tag: 'cow_step' };
  FP.Assets = { has: k => k === 'animals/cow' || k === 'animals/cow_step', sprite: k => (k === 'animals/cow' ? imgCow : imgStep), img: () => null };
  { const m = mockCtx(); A.drawMember(m.ctx, { kind: 'animal', animal: 'cow' }, 120, {}); ok(m.images[0] === imgCow, tag + 'animal uses FP.Assets image'); }
  { const m = mockCtx(); A.drawMember(m.ctx, { kind: 'animal', animal: 'cow' }, 120, { step: 1 }); ok(m.images[0] === imgStep, tag + 'animal step frame'); }
  { const m = mockCtx(); A.drawMember(m.ctx, { kind: 'animal', animal: 'pig' }, 120, {}); ok(m.images.length === 0 && m.calls.filter(c => c === 'fill').length > 3, tag + 'missing image → placeholder'); }
  FP.Assets = { img: k => (k === 'animals/lion' ? imgCow : null) };
  { const m = mockCtx(); A.drawMember(m.ctx, { kind: 'animal', animal: 'lion' }, 120, { glow: 1, night: 1, dim: 0.5 }); ok(m.images[0] === imgCow && m.bad.length === 0 && m.depth() === 0, tag + 'FP.Assets.img() fallback'); }
  FP.Assets = { has() { throw new Error('boom'); } };
  { const m = mockCtx(); A.drawMember(m.ctx, { kind: 'animal', animal: 'duck' }, 120, {}); ok(m.depth() === 0 && m.calls.length > 10, tag + 'broken FP.Assets → placeholder'); }
  delete FP.Assets;
  A.clearCache();
}

console.log((fails ? 'FAILED ' : 'ok ') + passes + ' passed, ' + fails + ' failed (parade_art)');
process.exit(fails ? 1 : 0);
