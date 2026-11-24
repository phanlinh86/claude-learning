#!/usr/bin/env node
// LL.LeafArt — headless unit tests (character artist B, Lolo's Jungle Leaf Match). Run from the game folder: node tests/unit/leaf_art.test.js
// Uses a recording mock 2D context: every API and face kind must draw without throwing, never pass NaN/Infinity to the
// canvas, keep save/restore balanced, and obey the colour rules of DESIGN §3.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadArt() {
  const sandbox = { console, Math, Date, JSON };
  sandbox.window = sandbox;   // no document: the module must be node-safe and paint uncached
  vm.createContext(sandbox);
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'game', 'js', 'leaf_art.js'), 'utf8');
  vm.runInContext(src, sandbox, { filename: 'leaf_art.js' });
  return sandbox.LL.LeafArt;
}

// ---------------------------------------------------------------- recording mock context
function mockCtx() {
  const calls = [], bad = [];
  let depth = 0, maxDepth = 0;
  const grad = () => ({ addColorStop(o, c) { if (!(o >= 0 && o <= 1)) bad.push('colorStop offset ' + o); check('addColorStop', [c]); } });
  function check(name, args) {
    args.forEach((a, i) => { if (typeof a === 'number' && !isFinite(a)) bad.push(name + ' arg ' + i + ' = ' + a); });
  }
  const props = { font: '10px sans-serif', globalAlpha: 1 };
  const methods = {
    save() { depth++; maxDepth = Math.max(maxDepth, depth); },
    restore() { depth--; if (depth < 0) bad.push('restore without save'); },
    createLinearGradient: grad, createRadialGradient: grad,
    measureText(t) { const px = parseFloat(String(props.font).replace(/^\D*?(\d+(\.\d+)?)px.*$/, '$1')) || 10; return { width: String(t).length * px * 0.6, actualBoundingBoxAscent: px * 0.7, actualBoundingBoxDescent: px * 0.05 }; },
    getTransform() { return { a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 }; }
  };
  const ctx = new Proxy({}, {
    get(_, k) {
      if (k in methods) return (...a) => { calls.push(k); check(k, a); return methods[k](...a); };
      if (k in props) return props[k];
      return (...a) => { calls.push(k); check(k, a); };
    },
    set(_, k, v) {
      if (typeof v === 'number' && !isFinite(v)) bad.push('set ' + k + ' = ' + v);
      if ((k === 'fillStyle' || k === 'strokeStyle') && typeof v === 'string' && /NaN|undefined/.test(v)) bad.push(k + ' = ' + v);
      props[k] = v; return true;
    }
  });
  return { ctx, calls, bad, depth: () => depth };
}
function run(name, fn) {
  const m = mockCtx();
  fn(m.ctx);
  assert.deepStrictEqual(m.bad, [], name + ': bad canvas args');
  assert.strictEqual(m.depth(), 0, name + ': save/restore unbalanced');
  assert.ok(m.calls.length > 0, name + ': drew nothing');
  return m;
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const LA = loadArt();
const COLS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
const THINGS = ['butterfly', 'balloon', 'flower', 'kite', 'cup', 'boot'];
const FACES = [
  ...THINGS.map(o => ({ kind: 'color', value: 'red', color: 'red', obj: o })),
  ...['circle', 'square', 'triangle', 'star', 'heart', 'rect', 'bogus'].map(s => ({ kind: 'shape', value: s, shape: s, color: 'blue' })),
  ...Array.from({ length: 12 }, (_, i) => ({ kind: 'dots', value: i + 1, n: i + 1 })),
  { kind: 'number', value: 7, n: 7, text: '7' }, { kind: 'number', value: 12, n: 12, text: '12' },
  { kind: 'letter', value: 'A', text: 'A' }, { kind: 'letter', value: 'Đ', text: 'Đ' },
  { kind: 'text', value: '7 + 8', text: '7 + 8' }, { kind: 'text', value: '12 − 5', text: '12 − 5' },
  { kind: 'number', value: 7, n: 7, text: '7', parity: 'odd' }, { kind: 'dots', value: 4, n: 4, parity: 'even' },
  { kind: 'parity', value: 9 }, { kind: 'parity', value: 4, dots: true },
  { kind: 'number', value: 3, n: 3, text: '3', scale: 0.6 }, { kind: 'color', value: 'blue', color: 'blue', obj: 'kite', scale: 1.2 },
  { kind: 'animal', value: 'panda', sprite: 'animal_panda' }, { kind: 'animal', value: 'bee', sprite: 'animal_bee', scale: 0.6 },
  { kind: 'food', value: 'bamboo', sprite: 'food_bamboo', animal: 'panda' }, { kind: 'food', value: 'honey' }
];
const OPENS = [0, 0.001, 0.05, 0.25, 0.3, 0.45, 0.5, 0.55, 0.75, 0.9, 1, 1.05, 1.12, 1.5, -0.2, NaN, undefined];
const sticker = f => f.kind === 'animal' || f.kind === 'food';

// ---------------------------------------------------------------- API surface
test('exports the DESIGN §6.4 API', () => {
  ['drawLeaf', 'drawFace', 'drawTree', 'drawThing', 'drawButterfly', 'drawGarland', 'drawStar', 'geometry', 'vineY', 'clearCache'].forEach(k =>
    assert.strictEqual(typeof LA[k], 'function', k));
  assert.deepStrictEqual(Object.keys(LA.COLORS).sort(), COLS.slice().sort());
  COLS.forEach(k => ['base', 'dark', 'light', 'shade'].forEach(p => assert.match(LA.COLORS[k][p], /^#[0-9A-F]{6}$/, k + '.' + p)));
  assert.strictEqual(LA.COLORS.red.base, '#E84A4A'); assert.strictEqual(LA.COLORS.pink.dark, '#C9558A');
  assert.strictEqual(JSON.stringify(LA.THINGS), JSON.stringify(THINGS));
  assert.strictEqual(JSON.stringify(LA.LEAVES.jungle), JSON.stringify(['#3E9A5E', '#286B40']));
  assert.strictEqual(LA.UNDER.fill, '#F3F6DF'); assert.strictEqual(LA.UNDER.rim, '#C9D9A8'); assert.strictEqual(LA.GOLD, '#FFE08A');
});

test('every face kind × every open value × options draws cleanly (NaN-free, balanced)', () => {
  for (const f of FACES) for (const o of OPENS) {
    let sprites = 0;
    run('leaf ' + f.kind + ' ' + o, ctx => LA.drawLeaf(ctx, 120, 120 / 0.78, f, o, {
      leaf: 'teal', stem: 30, light: 0.6, glow: 0.4, bloom: 1.1, flower: 'blush', bounce: 8, wiggle: 0.1, night: 0.7, alpha: 0.8,
      sprite: (name, x, y, size) => { sprites++; assert.ok(isFinite(x + y + size) && size > 0); assert.match(name, /^(animal|food)_/); }
    }));
    const sx = Math.cos((isFinite(o) ? Math.max(-0.25, Math.min(1.25, o)) : 0) * Math.PI);
    if (sticker(f) && sx < -0.05) assert.ok(sprites > 0, 'sprite callback for ' + f.kind + ' at ' + o);
    if (!sticker(f) || sx >= -0.05) assert.strictEqual(sprites, 0, 'no face unless the underside shows (' + f.kind + ' ' + o + ')');
  }
});

test('leaf options: every leaf colour, hex colours, bad values, tiny and huge sizes', () => {
  const f = { kind: 'color', value: 'red', color: 'red', obj: 'cup' };
  Object.keys(LA.LEAVES).concat(['#336699', 'nope', undefined]).forEach(lc => [0, 0.5, 1].forEach(o =>
    run('leaf ' + lc, ctx => LA.drawLeaf(ctx, 140, 180, f, o, { leaf: lc, leafDark: lc === '#336699' ? '#112233' : undefined, vine: '#557733', flower: '#E3C6F0' }))));
  run('leaf no opt', ctx => LA.drawLeaf(ctx, 120, 154, f, 1));
  run('leaf null face', ctx => LA.drawLeaf(ctx, 120, 154, null, 1, { bloom: 0.5 }));
  run('leaf junk opt', ctx => LA.drawLeaf(ctx, 120, 154, f, 0.7, { stem: NaN, light: 'x', glow: Infinity, bloom: -1, night: NaN, bounce: NaN, wiggle: NaN, alpha: NaN }));
  run('leaf tiny', ctx => LA.drawLeaf(ctx, 2, 2, f, 1, { stem: 1 }));
  run('leaf huge', ctx => LA.drawLeaf(ctx, 900, 1150, f, 0.3, { stem: 200, light: 1, bloom: 1.2 }));
  run('leaf NaN size', ctx => LA.drawLeaf(ctx, NaN, undefined, f, 1));
});

test('food face without sprite name asks for food_<value>; animal for animal_<value>', () => {
  const names = [];
  run('food', ctx => LA.drawLeaf(ctx, 140, 180, { kind: 'food', value: 'honey' }, 1, { sprite: n => names.push(n) }));
  run('animal', ctx => LA.drawLeaf(ctx, 140, 180, { kind: 'animal', value: 'bee' }, 1, { sprite: n => names.push(n) }));
  assert.deepStrictEqual(names, ['food_honey', 'animal_bee']);
});

test('the top side is identical for every face (no memory cue), and no parity colour leaks', () => {
  const trace = (face, open, extra) => {
    const seen = new Set(), m = mockCtx();
    const ctx = new Proxy(m.ctx, { set(t, k, v) { if (k === 'strokeStyle' || k === 'fillStyle') seen.add(v); t[k] = v; return true; } });
    LA.drawLeaf(ctx, 120, 154, face, open, Object.assign({ leaf: 'fern', stem: 30 }, extra || {}));
    return { calls: m.calls.join(','), seen };
  };
  for (const o of [0, 0.2, 0.4, 0.49]) {
    const a = trace(FACES[0], o).calls;
    FACES.forEach(f => assert.strictEqual(trace(f, o).calls, a, 'top side differs at ' + o + ' for ' + JSON.stringify(f)));
    FACES.forEach(f => assert.strictEqual(trace(f, o, { glow: 1 }).calls, trace(FACES[0], o, { glow: 1 }).calls, 'hint differs'));
  }
  const odd = { kind: 'number', value: 7, n: 7, text: '7', parity: 'odd' };
  assert.ok(!trace(odd, 0).seen.has(LA.COLORS.blue.base), 'blue ring leaked on the top side');
  assert.ok(trace(odd, 1).seen.has(LA.COLORS.blue.base), 'odd → blue ring on the underside');
  assert.ok(trace({ kind: 'dots', value: 4, n: 4, parity: 'even' }, 1).seen.has(LA.COLORS.orange.base), 'even → orange ring');
});

test('geometry: picture ≈ 0.68·w on the underside, orchid above the leaf top, pivot at the stem top', () => {
  const w = 120, h = w / 0.78, G = LA.geometry(w, h, 30);
  assert.ok(Math.abs(G.face.w - 0.68 * w) < 1e-9 && G.face.h >= 0.6 * w, 'face box');
  assert.ok(G.face.y > -h / 2 && G.face.y + G.face.h < h / 2, 'face inside the leaf');
  assert.ok(G.orchid.y < G.notch && G.orchid.y > -h / 2 - 30, 'orchid on the stem just above the leaf');
  assert.strictEqual(G.pivot.y, -h / 2 - 30);
});

test('drawFace, drawThing, drawButterfly, drawGarland, drawStar', () => {
  for (const f of FACES) {
    run('face ' + f.kind, ctx => LA.drawFace(ctx, 140, 140, f, { sprite: () => {}, glow: 0.5, bounce: 4, wiggle: -0.1 }));
    run('face plain ' + f.kind, ctx => LA.drawFace(ctx, 100, 100, f, { plain: true }));
  }
  run('face null', ctx => LA.drawFace(ctx, 100, 100, null));
  for (const o of THINGS) for (const c of COLS.concat(['#336699', 'nope'])) for (const s of [20, 70, 240]) run('thing ' + o + c, ctx => LA.drawThing(ctx, o, c, s));
  run('thing unknown', ctx => LA.drawThing(ctx, 'teapot', 'red', 80));
  run('thing NaN', ctx => LA.drawThing(ctx, 'kite', 'red', NaN));
  for (const fl of [0, 0.7, 1.57, 3.14, 99, NaN]) for (const c of COLS.concat(['#5FC7C9'])) run('butterfly', ctx => LA.drawButterfly(ctx, c, 50, fl));
  for (const t of [0, 1.7, 99]) {
    run('garland', ctx => LA.drawGarland(ctx, 0, 0, 600, 20, t));
    run('garland short', ctx => LA.drawGarland(ctx, 0, 0, 30, 0, t));
  }
  run('garland degenerate', ctx => LA.drawGarland(ctx, 5, 5, 5, 5, NaN));
  run('star', ctx => LA.drawStar(ctx, 80, '3'));
  run('star plain', ctx => LA.drawStar(ctx, 40));
});

test('drawTree: every kind × bark × leaf × night × light, rows, bad input', () => {
  const rect = { x: 300, y: 120, w: 760, h: 520, roofH: 51, pad: 36, door: null,
    rows: [{ y: 150, x0: 314, x1: 1046 }, { y: 380, x0: 314, x1: 1046, knots: [420, 600, 780] }] };
  LA.KINDS.concat(['bogus', undefined]).forEach((kind, i) => Object.keys(LA.BARKS).concat(['#7D7266']).forEach((bark, j) => {
    [0, 0.5, 1].forEach(night => run('tree ' + kind + bark + night, ctx => LA.drawTree(ctx, rect,
      { bark, leaf: Object.keys(LA.LEAVES)[(i + j) % 4], moss: '#8DBA6A', vine: '#6E8F3A', flower: 'lilac', kind, seed: i * 7 + j },
      { light: j / 3, t: 2.5, night, sway: 2 })));
  }));
  run('tree portrait', ctx => LA.drawTree(ctx, { x: 40, y: 260, w: 640, h: 1210, roofH: 58, pad: 41, rows: [{ y: 300, x0: 56, x1: 664 }] }, { kind: 'palm' }));
  run('tree minimal', ctx => LA.drawTree(ctx, { x: 0, y: 0, w: 300, h: 300 }, null));
  run('tree null', ctx => LA.drawTree(ctx, null, null, null));
  run('tree junk', ctx => LA.drawTree(ctx, { x: NaN, y: 'a', w: -5, h: 0, rows: [null, { y: NaN }] }, { bark: 'zzz', seed: NaN }, { t: NaN, night: NaN, light: NaN }));
});

test('vineY: sag 0.06 of the length at the middle, knots pin the vine, ends at row.y', () => {
  const row = { y: 100, x0: 0, x1: 600 };
  assert.strictEqual(LA.vineY(row, 0), 100); assert.strictEqual(LA.vineY(row, 600), 100);
  assert.ok(Math.abs(LA.vineY(row, 300) - 136) < 1e-9);
  const k = { y: 100, x0: 0, x1: 600, knots: [200, 400] };
  [0, 200, 400, 600].forEach(x => assert.ok(Math.abs(LA.vineY(k, x) - 100) < 1e-9, 'knot ' + x));
  assert.ok(Math.abs(LA.vineY(k, 100) - 112) < 1e-9);
  assert.ok(isFinite(LA.vineY(row, 50, NaN, NaN, NaN)));
});

// ---------------------------------------------------------------- colour rules (DESIGN §3)
const C = LA._contrast, chroma = LA._chroma, lum = LA._lum;
test('text ink ≥ 4.5:1 on the underside (plain and sunlit)', () => {
  for (const bg of [LA.UNDER.fill, LA.UNDER.fill2, LA.UNDER.lit, LA._mix(LA.UNDER.fill, LA.UNDER.lit, 0.55)]) {
    assert.ok(C(LA.INK.ink, bg) >= 4.5, 'ink on ' + bg + ' = ' + C(LA.INK.ink, bg).toFixed(2));
  }
});
test('answer colours stand out from the cream underside (dark outline ≥ 3:1; yellow ≥ 2.2)', () => {
  COLS.forEach(k => assert.ok(C(LA.COLORS[k].dark, LA.UNDER.fill) >= (k === 'yellow' ? 2.2 : 3), k + ' ' + C(LA.COLORS[k].dark, LA.UNDER.fill).toFixed(2)));
});
test('yellow outline ≥ 3:1 on the plain and the sunlit underside (QA)', () => {
  for (const bg of [LA.UNDER.fill, LA.UNDER.fill2, LA._mix(LA.UNDER.fill, LA.UNDER.lit, 0.55)])
    assert.ok(C(LA.YELLOW_LINE, bg) >= 3, 'yellow line on ' + bg + ' = ' + C(LA.YELLOW_LINE, bg).toFixed(2));
});
test('trunks stay inside the pad on the inner side for every kind, pad and seed (QA)', () => {
  for (const kind of LA.KINDS) for (const pad of [26, 36, 48, 70]) for (let seed = 0; seed < 30; seed++) {
    const rect = { x: 100, y: 100, w: 700, h: 500, roofH: 40, pad };
    const t = LA._trunkInner(rect, { kind, seed });
    assert.ok(t.left <= rect.x + pad - 1, kind + ' left trunk under a leaf: ' + (t.left - rect.x).toFixed(1) + ' > pad ' + pad);
    assert.ok(t.right >= rect.x + rect.w - pad + 1, kind + ' right trunk under a leaf');
  }
});
test('answer green is clearly different from every leaf green (Δ ≥ 40 in RGB)', () => {
  const rgb = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
  const d = (a, b) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));
  Object.values(LA.LEAVES).forEach(([b]) => assert.ok(d(b, LA.COLORS.green.base) >= 40, b + ' vs answer green ' + d(b, LA.COLORS.green.base).toFixed(1)));
});
test('bark calmer than answer colours; orchids pastel (lighter and much paler than the answer purple / pink)', () => {
  const minAnswer = Math.min(...COLS.map(k => chroma(LA.COLORS[k].base)));
  Object.values(LA.BARKS).forEach(([b, d]) => { assert.ok(chroma(b) < minAnswer, b + ' muted'); assert.ok(lum(d) < lum(b)); });
  Object.values(LA.ORCHIDS).forEach(o => {
    COLS.filter(k => k !== 'yellow').forEach(k => assert.ok(lum(o) > lum(LA.COLORS[k].base), o + ' lighter than ' + k));
    ['purple', 'pink'].forEach(k => assert.ok(chroma(o) < chroma(LA.COLORS[k].base) * 0.6, o + ' far less saturated than ' + k));
  });
});

test('caching is node-safe and clearCache works', () => {
  LA.clearCache();
  assert.strictEqual(LA._cacheSize(), 0);   // no canvas in node → nothing cached, everything painted directly
});

// ---------------------------------------------------------------- run
let fail = 0;
for (const t of tests) {
  try { t.fn(); console.log('ok   ' + t.name); } catch (e) { fail++; console.log('FAIL ' + t.name + '\n     ' + (e && e.message)); }
}
console.log(tests.length - fail + '/' + tests.length + ' passed');
if (fail) process.exit(1);
