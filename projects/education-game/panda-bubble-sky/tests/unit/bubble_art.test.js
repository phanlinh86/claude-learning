// Bao's Bubble Sky — unit test for PB.BubbleArt (game/js/bubble_art.js), plain node, no browser, no deps.
// A mock 2D context records every call; Path2D is stubbed. Checks: public API, exact palette, every thing kind / colour /
// toy / shape / n 1–12 / tile / animal / option draws without throwing and actually draws, no NaN reaches the context,
// save/restore balanced, Path2D cache reused, star layouts separate + inside the box, animal images via PB.Assets, node-safe.
// Run: node tests/unit/bubble_art.test.js   (exit code 1 on any failure)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

let fails = 0, passes = 0;
function ok(cond, msg) { if (cond) passes++; else { fails++; console.error('FAIL', msg); } }

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'game', 'js', 'bubble_art.js'), 'utf8');

function mockCtx() {
  const calls = [], bad = [], images = [];
  const grad = () => ({ addColorStop(o, c) { if (!(o >= 0 && o <= 1)) bad.push('stop ' + o); if (/NaN|undefined/.test(c)) bad.push('colour ' + c); } });
  const state = { globalAlpha: 1, lineWidth: 1, fillStyle: '#000', strokeStyle: '#000', font: '10px x', textAlign: 'left',
    textBaseline: 'alphabetic', lineJoin: 'miter', lineCap: 'butt', shadowColor: '', shadowBlur: 0, shadowOffsetY: 0, globalCompositeOperation: 'source-over' };
  const stack = [];
  const ctx = new Proxy(state, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'save') return () => { calls.push('save'); stack.push(Object.assign({}, t)); };
      if (k === 'restore') return () => { calls.push('restore'); const s = stack.pop(); if (!s) bad.push('restore without save'); else Object.assign(t, s); };
      if (k === 'createRadialGradient' || k === 'createLinearGradient' || k === 'createConicGradient') return (...a) => {
        if (a.some(v => !isFinite(v))) bad.push(k + ' NaN'); if (k === 'createRadialGradient' && (a[2] < 0 || a[5] < 0)) bad.push('radial negative r'); calls.push(k); return grad(); };
      if (k === 'measureText') return (s) => ({ width: String(s).length * 50 });
      if (k === 'setLineDash') return (a) => { if (a.some(v => !isFinite(v) || v < 0)) bad.push('dash ' + a); };
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
      if (k === 'globalAlpha' && (v < 0 || v > 1)) bad.push('globalAlpha ' + v);
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
  vm.runInContext(SRC, sb, { filename: 'bubble_art.js' });
  return sb;
}
function run(f) { const m = mockCtx(); let err = null; try { f(m); } catch (e) { err = e; } return { m, err }; }

// node-safe load without window (plain global) and with a pre-existing PB
try {
  const sb = { console, Math }; sb.global = sb; vm.createContext(sb); vm.runInContext(SRC, sb);
  ok(sb.PB && sb.PB.BubbleArt, 'loads with no window (global fallback)');
  const sb2 = load(false, { PB: { keep: 1 } });
  ok(sb2.PB.keep === 1 && sb2.PB.BubbleArt, 'keeps an existing PB namespace');
} catch (e) { ok(false, 'node-safe load threw: ' + e.message); }

const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
for (const withP2D of [false, true]) {
  const sb = load(withP2D), PB = sb.PB, A = PB && PB.BubbleArt, tag = withP2D ? '[Path2D] ' : '[no Path2D] ';
  ok(!!A, tag + 'PB.BubbleArt exists');
  if (!A) continue;
  ['drawBubble', 'drawThing', 'drawRainbow', 'rainbowPoint', 'drawDrop', 'drawMiniBubble', 'drawHomeBadge', 'drawSnowflake', 'drawIcon',
    'drawHintHand', 'starLayout', 'pal', 'thingKey', 'clearCache'].forEach(f => ok(typeof A[f] === 'function', tag + 'function ' + f));
  const want = { red: '#E84A4A/#A8282E/#F7A0A0', blue: '#3C8DE8/#1F5BA8/#A6CCF5', yellow: '#FFD23F/#C99A12/#FFEB9C',
    green: '#4CC26B/#2A8343/#A8E6B8', orange: '#FF9A2E/#C4650C/#FFCB8E', purple: '#8E44AD/#6840A8/#D2BDF3', pink: '#FF8FC0/#C9558A/#FFCCE2' };
  COLORS.forEach(c => { const p = A.PALETTE[c]; ok(p && [p.base, p.dark, p.light].join('/') === want[c], tag + 'palette ' + c); });
  ok(A.STAR.base === '#FFC23A' && A.STAR.dark === '#C98A12', tag + 'star gold hex');
  ok(A.RAINBOW.join(' ') === '#F6A6A6 #F8C49A #F7E19A #B9E3A8 #A9D2F2 #B9B2EE #E2B6E8', tag + 'rainbow bands');
  ok(A.TOYS.join() === 'ball,duck,umbrella,kite,car', tag + 'toys');
  ok(A.SHAPES.join() === 'circle,square,triangle,star,heart,oval,rect,diamond', tag + 'shapes');
  ok(A.HOMES.join() === 'farm,sea,ice,jungle,savanna', tag + 'homes');
  ok(A.SMALL === 0.6, tag + 'small = 0.6');
  ok(A.pal('red').base === '#E84A4A' && A.pal('nope') === null, tag + 'pal lookup');
  PB.PALETTE = { red: { base: '#123456', dark: '#000000', light: '#FFFFFF' }, blue: { base: 'oops' } };
  ok(A.pal('red').base === '#123456' && A.pal('blue').base === '#3C8DE8', tag + 'PB.PALETTE used when valid, fallback when broken');
  delete PB.PALETTE;

  const things = [].concat(
    ...A.TOYS.map(o => COLORS.map(c => ({ kind: 'toy', obj: o, color: c }))),
    [{ kind: 'toy' }, { kind: 'toy', obj: 'rocket', color: 'mauve' }],
    ...A.SHAPES.map(s => COLORS.map(c => ({ kind: 'shape', shape: s, color: c }))), [{ kind: 'shape', shape: 'blob' }],
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 0, 13, -2, NaN].map(n => ({ kind: 'stars', n })),
    ['A', 'a', 'Đ', '3+2', '7−4', '7-4', '10+10', '12−5', '20', '9', '', 'WWWWWWWW'].map(text => ({ kind: 'tile', text })), [{ kind: 'tile', n: 15 }, { kind: 'tile' }],
    A.ANIMALS.concat(['dragon']).map(a => ({ kind: 'animal', animal: a })),
    [{ kind: 'toy', obj: 'car', color: 'green', big: false }, { kind: 'animal', animal: 'sheep', big: false }, { kind: 'stars', n: 3, big: false }, { kind: 'mystery' }]
  );
  const opts = [{}, { glow: 1 }, { glow: 0.4, wiggle: -1 }, { wiggle: 0.5 }, { night: 1 }, { count: 0 }, { count: 3 }, { count: 99 }, { maxN: 12 }, { maxN: 5, count: 2 },
    { direct: true }, { glow: NaN, wiggle: 'x', count: 'y', maxN: NaN }];
  for (const t of things) {
    for (const o of opts) {
      const { m, err } = run(m => A.drawThing(m.ctx, t, 90, o));
      if (err) { ok(false, tag + 'drawThing threw ' + JSON.stringify(t) + ' ' + JSON.stringify(o) + ': ' + err.stack); continue; }
      ok(m.bad.length === 0, tag + 'clean calls ' + JSON.stringify(t) + ' ' + JSON.stringify(o) + ' ' + m.bad.slice(0, 3).join(' | '));
      ok(m.depth() === 0, tag + 'save/restore balanced ' + JSON.stringify(t));
      ok(m.calls.filter(c => c === 'fill').length >= 2, tag + 'draws something ' + JSON.stringify(t) + ' ' + JSON.stringify(o));
    }
  }
  const count = (f, what) => { const { m } = run(f); return what ? m.calls.filter(c => c === what).length : m.calls.length; };
  ok(count(m => A.drawThing(m.ctx, { kind: 'stars', n: 4 }, 90, { count: 4 })) > count(m => A.drawThing(m.ctx, { kind: 'stars', n: 4 }, 90, {})), tag + 'count lights stars');
  ok(count(m => A.drawThing(m.ctx, { kind: 'toy', obj: 'duck', color: 'red' }, 90, { glow: 1 })) > count(m => A.drawThing(m.ctx, { kind: 'toy', obj: 'duck', color: 'red' }, 90, {})), tag + 'glow adds a halo');
  ok(count(m => A.drawThing(m.ctx, { kind: 'tile', text: 'A' }, 90, {}), 'fillText') >= 1, tag + 'tile draws its text');
  { // small = ×0.6, wiggle rotates
    const sc = [], rot = [];
    const { m } = run(() => {});
    const px = new Proxy(m.ctx, { get(t, k) { if (k === 'scale') return (x) => { sc.push(x); }; if (k === 'rotate') return (a) => { rot.push(a); }; return t[k]; }, set(t, k, v) { t[k] = v; return true; } });
    A.drawThing(px, { kind: 'toy', obj: 'ball', color: 'red', big: false }, 100, {});
    ok(Math.abs(sc[0] - 0.6) < 1e-9, tag + 'big:false scales by 0.6 (' + sc[0] + ')');
    A.drawThing(px, { kind: 'toy', obj: 'ball', color: 'red' }, 100, { wiggle: 1 });
    ok(rot.some(a => Math.abs(a - 0.35) < 1e-9), tag + 'wiggle 1 rotates 0.35 rad');
  }

  // star layouts: n stars, separate, inside the 100 box (r ≤ 48 from the centre), readable
  for (let n = 1; n <= 12; n++) {
    for (const maxN of [undefined, 5, 12]) {
      const L = A.starLayout(n, maxN);
      ok(L.n === n && L.pts.length === n, tag + 'star layout n=' + n);
      // real star outlines (10-point polygons, edges sampled): the closest points of two stars must stay apart
      const poly = (p) => { const v = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? L.rs * 0.5 : L.rs; v.push([p[0] + Math.cos(a) * r, p[1] + L.rs * 0.06 + Math.sin(a) * r]); }
        const out = []; for (let i = 0; i < 10; i++) { const q = v[i], w = v[(i + 1) % 10]; for (let t = 0; t < 1; t += 0.125) out.push([q[0] + (w[0] - q[0]) * t, q[1] + (w[1] - q[1]) * t]); } return out; };
      const P = L.pts.map(poly);
      let minGap = 1e9;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (const a of P[i]) for (const b of P[j]) minGap = Math.min(minGap, Math.hypot(a[0] - b[0], a[1] - b[1]));
      ok(n === 1 || minGap > 0.25 * L.rs, tag + 'stars separate n=' + n + ' maxN ' + maxN + ' gap ' + minGap.toFixed(2));
      ok(L.pts.every(p => Math.hypot(p[0], p[1]) + L.rs <= 50), tag + 'stars inside n=' + n);
      ok(L.rs >= 8, tag + 'stars readable n=' + n + ' rs ' + L.rs.toFixed(2));
    }
  }
  { const a = A.starLayout(7, 12).rs, b = A.starLayout(9, 12).rs; ok(Math.abs(a - b) < 1e-9, tag + 'maxN: same star size among big counts (' + a + ' / ' + b + ')'); }
  ok(A.starLayout(2, 5).rs === A.starLayout(2).rs && A.starLayout(6, 12).rs === A.starLayout(6).rs, tag + 'maxN never shrinks n ≤ 6');
  { // iPhone target (visual QA): thing box 1.55·r with r = 45 px → n = 12 stars ≥ 14 px across with ≥ 3 px gaps
    const k = 1.55 * 45 / 100, L = A.starLayout(12, 12);
    const poly = (p) => { const v = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? L.rs * 0.5 : L.rs; v.push([p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r]); }
      const out = []; for (let i = 0; i < 10; i++) { const q = v[i], w = v[(i + 1) % 10]; for (let t = 0; t < 1; t += 0.125) out.push([q[0] + (w[0] - q[0]) * t, q[1] + (w[1] - q[1]) * t]); } return out; };
    const P = L.pts.map(poly); let gap = 1e9;
    for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) for (const a of P[i]) for (const b of P[j]) gap = Math.min(gap, Math.hypot(a[0] - b[0], a[1] - b[1]));
    ok(2 * L.rs * k >= 14, tag + 'n=12 stars ≥ 14 px on iPhone (' + (2 * L.rs * k).toFixed(1) + ')');
    ok(gap * k >= 3, tag + 'n=12 star gaps ≥ 3 px on iPhone (' + (gap * k).toFixed(2) + ')');
  }

  // bubbles: every option
  const bopts = [{}, { wob: 0.3, wobA: 1 }, { wob: -0.2 }, { t: 12.3 }, { glow: 1, t: 2 }, { frost: 1 }, { alpha: 0.5 }, { grow: 0 }, { grow: 0.5 },
    { pop: 0.01 }, { pop: 0.3 }, { pop: 0.99 }, { part: 'back', glow: 1 }, { part: 'front', frost: 0.7, glow: 0.5 }, { wob: NaN, t: NaN, glow: 'x', alpha: NaN }];
  for (const o of bopts) for (const r of [75, 20, 300]) {
    const { m, err } = run(m => A.drawBubble(m.ctx, r, o));
    ok(!err, tag + 'drawBubble threw ' + JSON.stringify(o) + (err ? err.stack : ''));
    ok(m.bad.length === 0 && m.depth() === 0 && m.calls.length > 3, tag + 'drawBubble clean ' + r + ' ' + JSON.stringify(o) + ' ' + m.bad.slice(0, 3).join(' | '));
  }
  ok(count(m => A.drawBubble(m.ctx, 75, { pop: 1 })) <= 2, tag + 'pop 1 draws nothing');
  ok(count(m => A.drawBubble(m.ctx, 75, { alpha: 0 })) === 0 && count(m => A.drawBubble(m.ctx, 0, {})) === 0, tag + 'alpha 0 / r 0 draws nothing');
  ok(count(m => A.drawBubble(m.ctx, 75, { frost: 1 })) > count(m => A.drawBubble(m.ctx, 75, {})), tag + 'frost adds sparkles');

  // rainbow
  const rb = { cx: 500, cy: 700, r: 300, w: 52 };
  for (const k of [1, 2, 3]) for (const f of [0, 0.5, 1, 1.4, 2, 2.5, 3, 4, -1, NaN]) for (const o of [{}, { shine: 0.5 }, { alpha: 0.4, guide: 0 }]) {
    const { m, err } = run(m => A.drawRainbow(m.ctx, rb, k, f, o));
    ok(!err && m.bad.length === 0 && m.depth() === 0, tag + 'drawRainbow k' + k + ' f' + f + ' ' + JSON.stringify(o) + (err ? err.stack : m.bad.slice(0, 2).join(' | ')));
  }
  ok(count(m => A.drawRainbow(m.ctx, rb, 3, 2.5, {}), 'fill') > count(m => A.drawRainbow(m.ctx, rb, 3, 0, {}), 'fill'), tag + 'filling paints bands');
  { const p0 = A.rainbowPoint(rb, 3, 0), p3 = A.rainbowPoint(rb, 3, 3), p15 = A.rainbowPoint(rb, 3, 1.5);
    ok(p0.x < rb.cx && p3.x > rb.cx && Math.abs(p0.y - rb.cy) < 1e-6 && Math.abs(p15.x - rb.cx) < 1e-6 && p15.y < rb.cy - 200, tag + 'rainbowPoint left foot → top → right foot'); }

  // scene pieces
  const scene = [
    ['drawDrop', m => [1, 4, 8].forEach(r => A.drawDrop(m.ctx, 10, 20, r, 0.7))],
    ['drawMiniBubble', m => [4, 10, 24].forEach(r => A.drawMiniBubble(m.ctx, 10, 20, r, 1))],
    ['drawSnowflake', m => [10, 40].forEach(r => A.drawSnowflake(m.ctx, r, 0.4, 0.8))],
    ['drawHomeBadges', m => A.HOMES.concat(['moon']).forEach(h => A.drawHomeBadge(m.ctx, h, 46, { a: 0.7, pop: 0.5 }))],
    ['drawHomeBadge default', m => A.drawHomeBadge(m.ctx, 'sea')],
    ['drawIcon color', m => COLORS.concat(['mauve']).forEach(c => A.drawIcon(m.ctx, { kind: 'color', color: c }, 120))],
    ['drawIcon number', m => [0, 1, 3, 5, 6, 10, 12, 20].forEach(n => A.drawIcon(m.ctx, { kind: 'number', n }, 120))],
    ['drawIcon home', m => A.HOMES.forEach(h => A.drawIcon(m.ctx, { kind: 'home', home: h }, 120))],
    ['drawIcon size', m => { A.drawIcon(m.ctx, { kind: 'size', big: true }, 120); A.drawIcon(m.ctx, { kind: 'size', big: false }, 120); A.drawIcon(m.ctx, { kind: 'size', big: false, thing: { kind: 'animal', animal: 'pig' } }, 120); }],
    ['drawIcon letter', m => A.drawIcon(m.ctx, { kind: 'letter', text: 'Q' }, 120)],
    ['drawIcon things', m => things.forEach(t => A.drawIcon(m.ctx, t, 120))],
    ['drawIcon unknown', m => A.drawIcon(m.ctx, { kind: '??' }, 120)],
    ['drawHintHand', m => [0, 0.5, 1].forEach(p => A.drawHintHand(m.ctx, 100, 200, p, 1))],
    ['drawHintHand alpha', m => A.drawHintHand(m.ctx, 100, 200, 0.3, 0.5, 80)]
  ];
  for (const [n, f] of scene) {
    const { m, err } = run(f);
    ok(!err, tag + n + ' threw ' + (err && err.stack));
    ok(m.bad.length === 0, tag + n + ' clean ' + m.bad.slice(0, 3).join(' | ')); ok(m.depth() === 0, tag + n + ' balanced'); ok(m.calls.length > 0, tag + n + ' draws');
  }
  ok(count(m => { A.drawHintHand(m.ctx, 0, 0, 0, 0); A.drawDrop(m.ctx, 0, 0, 3, 0); A.drawMiniBubble(m.ctx, 0, 0, 6, 0); A.drawSnowflake(m.ctx, 20, 0, 0); A.drawHomeBadge(m.ctx, 'farm', 40, { a: 0 }); A.drawThing(m.ctx, { kind: 'toy' }, 0); }) === 0, tag + 'alpha 0 / size 0 draws nothing');
  try { A.drawThing(null, { kind: 'toy' }, 90); A.drawThing(mockCtx().ctx, null, 90); A.drawBubble(null, 50); A.drawRainbow(null, rb, 3, 1); A.drawRainbow(mockCtx().ctx, null, 3, 1);
    A.drawHomeBadge(null); A.drawIcon(null); A.drawIcon(mockCtx().ctx, null); A.drawHintHand(null); A.drawDrop(null); A.drawMiniBubble(null); A.drawSnowflake(null); ok(true, ''); }
  catch (e) { ok(false, tag + 'null args threw ' + e.message); }
  ok(A.thingKey({ kind: 'toy', obj: 'duck', color: 'red' }) !== A.thingKey({ kind: 'toy', obj: 'duck', color: 'blue' }), tag + 'thingKey distinct colour');
  ok(A.thingKey({ kind: 'stars', n: 2 }) !== A.thingKey({ kind: 'stars', n: 3 }), tag + 'thingKey distinct n');
  ok(A.thingKey({ kind: 'toy', obj: 'car', color: 'red', big: false }) !== A.thingKey({ kind: 'toy', obj: 'car', color: 'red' }), tag + 'thingKey distinct size');

  if (withP2D) {
    A.clearCache();
    const t = { kind: 'toy', obj: 'car', color: 'green' };
    const before = p2dCount; A.drawThing(mockCtx().ctx, t, 90, { glow: 0.5 }); const first = p2dCount - before;
    const mid = p2dCount; for (let i = 0; i < 5; i++) A.drawThing(mockCtx().ctx, t, 90 + i * 7, { wiggle: i / 5 }); const again = p2dCount - mid;
    ok(first > 0 && again === 0, tag + 'Path2D cache reused (first ' + first + ', again ' + again + ')');
    A.clearCache();
  }

  // animal images via PB.Assets
  const imgCow = { tag: 'cow' };
  PB.Assets = { has: k => k === 'animals/cow', sprite: () => imgCow, img: () => null };
  { const { m } = run(m => A.drawThing(m.ctx, { kind: 'animal', animal: 'cow' }, 90, {})); ok(m.images[0] === imgCow, tag + 'animal uses PB.Assets image'); }
  { const { m } = run(m => A.drawThing(m.ctx, { kind: 'animal', animal: 'pig' }, 90, {})); ok(m.images.length === 0 && m.calls.filter(c => c === 'fill').length > 3, tag + 'missing image → placeholder'); }
  PB.Assets = { img: k => (k === 'animals/lion' ? imgCow : null) };
  { const { m } = run(m => A.drawThing(m.ctx, { kind: 'animal', animal: 'lion' }, 90, { glow: 1 })); ok(m.images[0] === imgCow && m.bad.length === 0 && m.depth() === 0, tag + 'PB.Assets.img() fallback'); }
  PB.Assets = { has() { throw new Error('boom'); } };
  { const { m } = run(m => A.drawThing(m.ctx, { kind: 'animal', animal: 'duck' }, 90, {})); ok(m.depth() === 0 && m.calls.length > 10, tag + 'broken PB.Assets → placeholder'); }
  delete PB.Assets;
  A.clearCache();
}

console.log((fails ? 'FAILED ' : 'ok ') + passes + ' passed, ' + fails + ' failed (bubble_art)');
process.exit(fails ? 1 : 0);
