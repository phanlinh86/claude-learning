// Nim's River Hop — unit test for NH.StoneArt (game/js/stone_art.js), plain node, no browser, no deps.
// A recording mock 2D context checks every call; Path2D is stubbed. Checks: public API, exact palette, outline contrast
// on the grey stone, every thing kind / obj / colour / shape / dots n 1–12 (± numeral) / tile / animal / fruit / icon / option
// draws without throwing and actually draws, no NaN / undefined reaches the context, save/restore balanced, dot layouts
// separate + inside the sign, Path2D cache reused, animal images via NH.Assets, node-safe load.
// Run: node tests/unit/stone_art.test.js   (exit code 1 on any failure)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

let fails = 0, passes = 0;
function ok(cond, msg) { if (cond) passes++; else { fails++; console.error('FAIL', msg); } }

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'game', 'js', 'stone_art.js'), 'utf8');

function mockCtx() {
  const calls = [], bad = [], images = [];
  const grad = () => ({ addColorStop(o, c) { if (!(o >= 0 && o <= 1)) bad.push('stop ' + o); if (/NaN|undefined/.test(c)) bad.push('colour ' + c); } });
  const state = { globalAlpha: 1, lineWidth: 1, fillStyle: '#000', strokeStyle: '#000', font: '10px x', textAlign: 'left', lineDashOffset: 0,
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
        if (a.some(v => (typeof v === 'number' && !isFinite(v)) || v === undefined && k !== 'fill' && k !== 'stroke' && k !== 'clip')) bad.push(k + '(' + a.join(',') + ')');
        if ((k === 'arc' && a[2] < 0) || (k === 'ellipse' && (a[2] < 0 || a[3] < 0))) bad.push(k + ' negative radius ' + a.join(','));
        if (k === 'fillText' && /undefined|NaN/.test(String(a[0]))) bad.push('fillText ' + a[0]);
      };
    },
    set(t, k, v) {
      if (typeof v === 'number' && !isFinite(v)) bad.push('set ' + String(k) + ' NaN');
      if (v === undefined || (typeof v === 'string' && /NaN|undefined/.test(v))) bad.push('set ' + String(k) + ' ' + v);
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
  vm.runInContext(SRC, sb, { filename: 'stone_art.js' });
  return sb;
}
function run(f) { const m = mockCtx(); let err = null; try { f(m); } catch (e) { err = e; } return { m, err }; }

// node-safe load: no window / document (plain global), keeps an existing NH, no DOM touched at load
try {
  const sb = { console, Math }; sb.global = sb; vm.createContext(sb); vm.runInContext(SRC, sb);
  ok(sb.NH && sb.NH.StoneArt, 'loads with no window (global fallback)');
  const sb2 = load(false, { NH: { keep: 1 } });
  ok(sb2.NH.keep === 1 && sb2.NH.StoneArt, 'keeps an existing NH namespace');
  let touched = false;
  const sb3 = { console, Math }; sb3.window = sb3;
  Object.defineProperty(sb3, 'document', { get() { touched = true; return undefined; } });
  vm.createContext(sb3); vm.runInContext(SRC, sb3);
  ok(!touched, 'no document access at load');
} catch (e) { ok(false, 'node-safe load threw: ' + e.message); }

const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
for (const withP2D of [false, true]) {
  const sb = load(withP2D), NH = sb.NH, A = NH && NH.StoneArt, tag = withP2D ? '[Path2D] ' : '[no Path2D] ';
  ok(!!A, tag + 'NH.StoneArt exists');
  if (!A) continue;
  ['drawStone', 'drawRipple', 'drawDrop', 'drawThing', 'drawFruit', 'drawHomeBadge', 'drawSnowflake', 'drawIcon', 'drawHintHand', 'drawLilyPad',
    'dotLayout', 'thingTop', 'pal', 'lineOf', 'contrast', 'thingKey', 'clearCache'].forEach(f => ok(typeof A[f] === 'function', tag + 'function ' + f));
  const want = { red: '#E84A4A/#A8282E/#F7A0A0', blue: '#3C8DE8/#1F5BA8/#A6CCF5', yellow: '#FFD23F/#C99A12/#FFEB9C',
    green: '#4CC26B/#2A8343/#A8E6B8', orange: '#FF9A2E/#C4650C/#FFCB8E', purple: '#8E44AD/#6840A8/#D2BDF3', pink: '#FF8FC0/#C9558A/#FFCCE2' };
  COLORS.forEach(c => { const p = A.PALETTE[c]; ok(p && [p.base, p.dark, p.light].join('/') === want[c], tag + 'palette ' + c); });
  ok(A.STONE.top === '#B9B2A6' && A.STONE.side === '#8E877C' && A.STONE.line === '#6C665D' && A.STONE.hl === '#D8D2C7', tag + 'stone hex (DESIGN §3)');
  ok(A.GOLD.top === '#E9B860' && A.GOLD.side === '#B98A3A', tag + 'golden stone hex (amber, fix round 1: further from answer yellow)');
  ok(A.SIGN.base === '#F3E6CC' && A.SIGN.line === '#9C7A5A' && A.INK === '#3A3640', tag + 'sign + dot hex');
  ok(A.OBJS.join() === 'flower,mushroom,leaf,ball,duck', tag + 'objs');
  ok(A.SHAPES.join() === 'circle,square,triangle,star,heart,oval,rect,diamond', tag + 'shapes');
  ok(A.FRUITS.join() === 'apple,pear,strawberry,mushroom,acorn', tag + 'fruits');
  ok(A.HOMES.join() === 'farm,sea,ice,jungle,savanna', tag + 'homes');
  ok(A.KINDS.join() === 'obj,shape,dots,tile,animal', tag + 'kinds');
  ok(A.SMALL === 0.6, tag + 'small = 0.6');
  ok(A.pal('red').base === '#E84A4A' && A.pal('nope') === null, tag + 'pal lookup (fallback while NH.PALETTE is undefined)');
  NH.PALETTE = { red: { base: '#123456', dark: '#000000', light: '#FFFFFF' }, blue: { base: 'oops' } };
  ok(A.pal('red').base === '#123456' && A.pal('blue').base === '#3C8DE8', tag + 'NH.PALETTE used when valid, fallback when broken');
  delete NH.PALETTE;
  // every answer colour's outline reads on the grey stone top (≥ 3:1), and is still a dark tone of that colour
  COLORS.forEach(c => { const l = A.lineOf(c), k = A.contrast(l, A.STONE.top); ok(k >= 3, tag + 'outline contrast ' + c + ' ' + l + ' ' + k.toFixed(2) + ':1'); });
  ok(A.contrast('#FFFFFF', '#000000') > 20.9, tag + 'contrast formula');

  const things = [].concat(
    ...A.OBJS.map(o => COLORS.map(c => ({ kind: 'obj', obj: o, color: c }))),
    [{ kind: 'obj' }, { kind: 'obj', obj: 'rocket', color: 'mauve' }],
    ...A.SHAPES.map(s => COLORS.map(c => ({ kind: 'shape', shape: s, color: c }))), [{ kind: 'shape', shape: 'blob' }],
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 0, 13, -2, NaN].map(n => ({ kind: 'dots', n })),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => ({ kind: 'dots', n, numeral: true })),
    ['A', 'a', 'Đ', '3+2', '7−4', '7-4', '10+10', '12−5', '20', '9', '', 'WWWWWWWW'].map(text => ({ kind: 'tile', text })), [{ kind: 'tile', n: 15 }, { kind: 'tile' }],
    A.ANIMALS.concat(['dragon']).map(a => ({ kind: 'animal', animal: a })),
    [{ kind: 'obj', obj: 'duck', color: 'green', big: false }, { kind: 'animal', animal: 'sheep', big: false }, { kind: 'dots', n: 3, big: false }, { kind: 'mystery' }]
  );
  const opts = [{}, { glow: 1 }, { glow: 0.4, wiggle: -1 }, { wiggle: 0.5, rot: 0.1 }, { alpha: 0.5 }, { count: 0 }, { count: 3 }, { count: 99 }, { shadow: false },
    { direct: true }, { glow: NaN, wiggle: 'x', count: 'y', alpha: NaN, rot: NaN }];
  for (const t of things) {
    for (const o of opts) {
      const { m, err } = run(m => A.drawThing(m.ctx, t, 93, o));
      if (err) { ok(false, tag + 'drawThing threw ' + JSON.stringify(t) + ' ' + JSON.stringify(o) + ': ' + err.stack); continue; }
      ok(m.bad.length === 0, tag + 'clean calls ' + JSON.stringify(t) + ' ' + JSON.stringify(o) + ' ' + m.bad.slice(0, 3).join(' | '));
      ok(m.depth() === 0, tag + 'save/restore balanced ' + JSON.stringify(t));
      ok(m.calls.filter(c => c === 'fill').length >= 2, tag + 'draws something ' + JSON.stringify(t) + ' ' + JSON.stringify(o));
    }
    const h = A.thingTop(t, 93);
    ok(h > 40 && h < (t.kind === 'dots' && t.n >= 7 && !t.numeral ? 160 : 120), tag + 'thingTop sane ' + JSON.stringify(t) + ' ' + h);
  }
  const count = (f, what) => { const { m } = run(f); return what ? m.calls.filter(c => c === what).length : m.calls.length; };
  ok(count(m => A.drawThing(m.ctx, { kind: 'dots', n: 4 }, 93, { count: 4 })) > count(m => A.drawThing(m.ctx, { kind: 'dots', n: 4 }, 93, {})), tag + 'count rings dots');
  ok(count(m => A.drawThing(m.ctx, { kind: 'obj', obj: 'duck', color: 'red' }, 93, { glow: 1 })) > count(m => A.drawThing(m.ctx, { kind: 'obj', obj: 'duck', color: 'red' }, 93, {})), tag + 'glow adds a halo');
  ok(count(m => A.drawThing(m.ctx, { kind: 'tile', text: 'A' }, 93, {}), 'fillText') >= 1, tag + 'tile draws its text');
  ok(count(m => A.drawThing(m.ctx, { kind: 'dots', n: 3, numeral: true }, 93, {}), 'fillText') === 1 && count(m => A.drawThing(m.ctx, { kind: 'dots', n: 3 }, 93, {}), 'fillText') === 0, tag + 'numeral only when asked');
  ok(count(m => A.drawThing(m.ctx, { kind: 'obj', obj: 'ball' }, 93, {})) > count(m => A.drawThing(m.ctx, { kind: 'obj', obj: 'ball' }, 93, { shadow: false })), tag + 'contact shadow on by default');
  { // small = ×0.6, wiggle rotates ±0.3 about the base, things stand on the origin (drawn above it)
    const sc = [], rot = [], ys = [];
    const { m } = run(() => {});
    const px = new Proxy(m.ctx, { get(t, k) { if (k === 'scale') return (x) => { sc.push(x); }; if (k === 'rotate') return (a) => { rot.push(a); }; if (k === 'translate') return (x, y) => { ys.push(y); }; return t[k]; }, set(t, k, v) { t[k] = v; return true; } });
    A.drawThing(px, { kind: 'obj', obj: 'ball', color: 'red', big: false }, 100, {});
    ok(Math.abs(sc[0] - 0.6) < 1e-9, tag + 'big:false scales by 0.6 (' + sc[0] + ')');
    ok(ys[0] < -40, tag + 'thing shifted up so its foot sits on the origin (' + ys[0] + ')');
    A.drawThing(px, { kind: 'obj', obj: 'ball', color: 'red' }, 100, { wiggle: 1 });
    ok(rot.some(a => Math.abs(a - 0.3) < 1e-9), tag + 'wiggle 1 rotates 0.3 rad');
  }

  // dot layouts: n dots, clearly separate (gap ≥ 0.6 r), inside the sign, readable on a phone
  for (let n = 1; n <= 12; n++) {
    for (const numeral of [false, true]) {
      const L = A.dotLayout(n, numeral);
      ok(L.n === n && L.pts.length === n, tag + 'dot layout n=' + n);
      let gap = 1e9;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) gap = Math.min(gap, Math.hypot(L.pts[i][0] - L.pts[j][0], L.pts[i][1] - L.pts[j][1]) - 2 * L.rs);
      ok(n === 1 || gap >= 0.6 * L.rs, tag + 'dots separate n=' + n + (numeral ? ' +N' : '') + ' gap ' + gap.toFixed(2));
      if (!numeral) ok(L.pts.every(p => Math.hypot(p[0], p[1] + 59) + L.rs <= 35), tag + 'dots inside the disc n=' + n);
      else ok(L.pts.every(p => Math.abs(p[0]) + L.rs <= 37 && p[1] - L.rs >= -60 && p[1] + L.rs <= -21), tag + 'dots inside the tablet n=' + n);
      // phone: itemH 93 logical → ×0.93; dot diameter ≥ 10 logical px
      ok(2 * L.rs * 0.93 >= (numeral && n > 8 ? 9 : 10),   // numeral signs carry n ≤ 6 in the game (countSeq)
         tag + 'dots readable n=' + n + (numeral ? ' +N' : '') + ' d ' + (2 * L.rs * 0.93).toFixed(1));
      for (let i = 1; i < n; i++) ok(L.pts[i][1] > L.pts[i - 1][1] - 1e-6 || L.pts[i][0] > L.pts[i - 1][0], tag + 'reading order n=' + n);
    }
  }

  // stones: every option and the 8 shape variants
  const sopts = [{}, { seed: 3 }, { seed: 0.734 }, { seed: -17 }, { tilt: 0.14 }, { tilt: -0.14, dip: 1 }, { dip: 0.5 }, { gold: 0.3 }, { gold: 1, dip: 0.6 },
    { glow: 1 }, { glow: 0.5, active: 1 }, { active: 0.5, t: 3.2 }, { snow: 1 }, { snow: 0.5, gold: 1 }, { wet: 1 }, { wet: 0.5, snow: 1 }, { alpha: 0.5 },
    { seed: NaN, tilt: NaN, dip: 'x', gold: NaN, glow: undefined, snow: NaN, wet: 'y', alpha: NaN, active: NaN, t: NaN }];
  for (const o of sopts) for (const S of [150, 116, 450, 20]) {
    const { m, err } = run(m => A.drawStone(m.ctx, S, o));
    ok(!err, tag + 'drawStone threw ' + JSON.stringify(o) + (err ? err.stack : ''));
    ok(m.bad.length === 0 && m.depth() === 0 && m.calls.length > 10, tag + 'drawStone clean ' + S + ' ' + JSON.stringify(o) + ' ' + m.bad.slice(0, 3).join(' | '));
  }
  for (let v = 0; v < 12; v++) { const { m, err } = run(m => A.drawStone(m.ctx, 150, { seed: v })); ok(!err && m.bad.length === 0 && m.depth() === 0, tag + 'stone variant ' + v); }
  ok(A.variant(3) === A.variant(11) && A.variant(3) !== A.variant(4) && A.variant(0.5) >= 0 && A.variant(0.5) < 8, tag + 'variant mapping');
  ok(count(m => A.drawStone(m.ctx, 150, { gold: 1 })) > count(m => A.drawStone(m.ctx, 150, {})), tag + 'gold adds an overlay');
  ok(count(m => A.drawStone(m.ctx, 150, { glow: 1 })) > count(m => A.drawStone(m.ctx, 150, {})), tag + 'glow adds an outline');
  ok(count(m => A.drawStone(m.ctx, 150, { active: 1 })) > count(m => A.drawStone(m.ctx, 150, {})), tag + 'active adds a ring');
  ok(count(m => A.drawStone(m.ctx, 150, { snow: 1 })) > count(m => A.drawStone(m.ctx, 150, {})), tag + 'snow adds a cap');
  ok(count(m => A.drawStone(m.ctx, 150, { alpha: 0 })) === 0 && count(m => A.drawStone(m.ctx, 0, {})) === 0, tag + 'alpha 0 / S 0 draws nothing');

  // scene pieces
  const scene = [
    ['drawRipple', m => [[10, 1, 0.38], [60, 0.5], [200, 0.2, 0.5], [30, 1, NaN]].forEach(q => A.drawRipple(m.ctx, 10, 20, q[0], q[1], q[2]))],
    ['drawDrop', m => [1, 4, 8].forEach(r => A.drawDrop(m.ctx, 10, 20, r, 0.7))],
    ['drawFruit', m => A.FRUITS.concat(['banana']).forEach(f => [{}, { rot: 0.4, alpha: 0.5 }, { glow: 1 }, { direct: true }, { rot: NaN, glow: NaN }].forEach(o => A.drawFruit(m.ctx, f, 60, o)))],
    ['drawLilyPad', m => [[40, 0], [20, 2], [80, -1, { flat: 0.6, alpha: 0.5 }], [30, NaN]].forEach(q => A.drawLilyPad(m.ctx, q[0], q[1], q[2]))],
    ['drawSnowflake', m => [10, 40].forEach(r => A.drawSnowflake(m.ctx, r, 0.4, 0.8))],
    ['drawHomeBadges', m => A.HOMES.concat(['moon']).forEach(h => A.drawHomeBadge(m.ctx, h, 46, { a: 0.7, pop: 0.5 }))],
    ['drawHomeBadge default', m => A.drawHomeBadge(m.ctx, 'sea')],
    ['drawIcon color', m => COLORS.concat(['mauve']).forEach(c => A.drawIcon(m.ctx, { kind: 'color', color: c }, 120))],
    ['drawIcon number', m => [0, 1, 3, 5, 6, 10, 12, 20].forEach(n => A.drawIcon(m.ctx, { kind: 'number', n }, 120))],
    ['drawIcon home', m => A.HOMES.forEach(h => A.drawIcon(m.ctx, { kind: 'home', home: h }, 120))],
    ['drawIcon size', m => { A.drawIcon(m.ctx, { kind: 'size', big: true }, 120); A.drawIcon(m.ctx, { kind: 'size', big: false }, 120); A.drawIcon(m.ctx, { kind: 'size', big: false, thing: { kind: 'animal', animal: 'pig' } }, 120); }],
    ['drawIcon letter', m => A.drawIcon(m.ctx, { kind: 'letter', text: 'Q' }, 120)],
    ['drawIcon fruit', m => A.FRUITS.forEach(f => A.drawIcon(m.ctx, { kind: 'fruit', fruit: f }, 120))],
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
  ok(count(m => { A.drawHintHand(m.ctx, 0, 0, 0, 0); A.drawDrop(m.ctx, 0, 0, 3, 0); A.drawRipple(m.ctx, 0, 0, 10, 0); A.drawSnowflake(m.ctx, 20, 0, 0); A.drawHomeBadge(m.ctx, 'farm', 40, { a: 0 }); A.drawThing(m.ctx, { kind: 'obj' }, 0); A.drawThing(m.ctx, { kind: 'obj' }, 90, { alpha: 0 }); A.drawFruit(m.ctx, 'apple', 0); A.drawLilyPad(m.ctx, 0, 0); }) === 0, tag + 'alpha 0 / size 0 draws nothing');
  try { A.drawThing(null, { kind: 'obj' }, 90); A.drawThing(mockCtx().ctx, null, 90); A.drawStone(null, 150); A.drawRipple(null); A.drawFruit(null, 'apple', 40);
    A.drawHomeBadge(null); A.drawIcon(null); A.drawIcon(mockCtx().ctx, null); A.drawHintHand(null); A.drawDrop(null); A.drawSnowflake(null); A.drawLilyPad(null); ok(true, ''); }
  catch (e) { ok(false, tag + 'null args threw ' + e.message); }
  ok(A.thingKey({ kind: 'obj', obj: 'duck', color: 'red' }) !== A.thingKey({ kind: 'obj', obj: 'duck', color: 'blue' }), tag + 'thingKey distinct colour');
  ok(A.thingKey({ kind: 'dots', n: 2 }) !== A.thingKey({ kind: 'dots', n: 3 }) && A.thingKey({ kind: 'dots', n: 2 }) !== A.thingKey({ kind: 'dots', n: 2, numeral: true }), tag + 'thingKey distinct n / numeral');
  ok(A.thingKey({ kind: 'obj', obj: 'ball', color: 'red', big: false }) !== A.thingKey({ kind: 'obj', obj: 'ball', color: 'red' }), tag + 'thingKey distinct size');

  if (withP2D) {
    A.clearCache();
    const t = { kind: 'obj', obj: 'flower', color: 'green' };
    const before = p2dCount; A.drawThing(mockCtx().ctx, t, 90, { glow: 0.5 }); A.drawStone(mockCtx().ctx, 150, { seed: 2, snow: 1 }); const first = p2dCount - before;
    const mid = p2dCount; for (let i = 0; i < 5; i++) { A.drawThing(mockCtx().ctx, t, 90 + i * 7, { wiggle: i / 5 }); A.drawStone(mockCtx().ctx, 150 + i, { seed: 2, snow: 1, dip: i / 5 }); } const again = p2dCount - mid;
    ok(first > 0 && again === 0, tag + 'Path2D cache reused (first ' + first + ', again ' + again + ')');
    A.clearCache();
  }

  // animal images via NH.Assets: feet at the origin
  const imgCow = { tag: 'cow' };
  NH.Assets = { has: k => k === 'animals/cow', sprite: () => imgCow, img: () => null };
  { const { m } = run(m => A.drawThing(m.ctx, { kind: 'animal', animal: 'cow' }, 90, {})); ok(m.images[0] === imgCow, tag + 'animal uses NH.Assets image'); }
  { const { m } = run(m => A.drawThing(m.ctx, { kind: 'animal', animal: 'pig' }, 90, {})); ok(m.images.length === 0 && m.calls.filter(c => c === 'fill').length > 3, tag + 'missing image → placeholder'); }
  NH.Assets = { img: k => (k === 'animals/lion' ? imgCow : null) };
  { const { m } = run(m => A.drawThing(m.ctx, { kind: 'animal', animal: 'lion' }, 90, { glow: 1 })); ok(m.images[0] === imgCow && m.bad.length === 0 && m.depth() === 0, tag + 'NH.Assets.img() fallback'); }
  NH.Assets = { has() { throw new Error('boom'); } };
  { const { m } = run(m => A.drawThing(m.ctx, { kind: 'animal', animal: 'duck' }, 90, {})); ok(m.depth() === 0 && m.calls.length > 10, tag + 'broken NH.Assets → placeholder'); }
  delete NH.Assets;
  A.clearCache();
}

console.log((fails ? 'FAILED ' : 'ok ') + passes + ' passed, ' + fails + ' failed (stone_art)');
process.exit(fails ? 1 : 0);
