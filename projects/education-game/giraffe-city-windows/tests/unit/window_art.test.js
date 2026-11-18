#!/usr/bin/env node
// GW.WindowArt — headless unit tests (character artist B). Run from the game folder: node tests/unit/window_art.test.js
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
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'game', 'js', 'window_art.js'), 'utf8');
  vm.runInContext(src, sandbox, { filename: 'window_art.js' });
  return sandbox.GW.WindowArt;
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
const WA = loadArt();
const COLS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
const FACES = [
  ...['umbrella', 'balloon', 'car', 'kite', 'cup', 'boot'].map(o => ({ kind: 'color', value: 'red', color: 'red', obj: o })),
  ...['circle', 'square', 'triangle', 'star', 'heart', 'rect', 'bogus'].map(s => ({ kind: 'shape', value: s, shape: s, color: 'blue' })),
  ...Array.from({ length: 12 }, (_, i) => ({ kind: 'dots', value: i + 1, n: i + 1 })),
  { kind: 'number', value: 7, n: 7, text: '7' }, { kind: 'number', value: 12, n: 12, text: '12' },
  { kind: 'letter', value: 'A', text: 'A' }, { kind: 'letter', value: 'Đ', text: 'Đ' },
  { kind: 'text', value: '7 + 8', text: '7 + 8' }, { kind: 'text', value: '12 − 5', text: '12 − 5' },
  { kind: 'number', value: 7, n: 7, text: '7', parity: 'odd' }, { kind: 'dots', value: 4, n: 4, parity: 'even' },
  { kind: 'parity', value: 9 }, { kind: 'parity', value: 4, dots: true },
  { kind: 'animal', value: 'dog', sprite: 'animal_dog' }, { kind: 'animal', value: 'dog', sprite: 'animal_dog', scale: 0.6 },
  { kind: 'home', value: 'kennel', sprite: 'home_kennel', animal: 'dog' }, { kind: 'home', value: 'nest' }
];

// ---------------------------------------------------------------- API surface
test('exports the DESIGN §6.4 API', () => {
  ['drawWindow', 'drawFace', 'drawBuilding', 'drawThing', 'drawBunting', 'drawBalloon', 'drawStar', 'geometry'].forEach(k =>
    assert.strictEqual(typeof WA[k], 'function', k));
  assert.deepStrictEqual(Object.keys(WA.COLORS).sort(), COLS.slice().sort());
  COLS.forEach(k => ['base', 'dark', 'light', 'shade'].forEach(p => assert.match(WA.COLORS[k][p], /^#[0-9A-F]{6}$/, k + '.' + p)));
  assert.strictEqual(WA.COLORS.red.base, '#E84A4A'); assert.strictEqual(WA.COLORS.pink.dark, '#C9558A');
});

test('every face kind × open states × options draws cleanly', () => {
  const opens = [0, 0.001, 0.05, 0.3, 0.5, 0.8, 1, 1.12, 1.5, -0.2];
  for (const f of FACES) for (const o of opens) {
    let sprites = 0;
    run('window ' + f.kind + ' ' + o, ctx => WA.drawWindow(ctx, 120, 120 / 0.78, f, o, {
      shutter: 'teal', light: 0.6, glow: 0.4, bloom: 1.1, bloomColor: 'mixed', bounce: 8, wiggle: 0.1, rain: 0.7, t: 3.3, seed: 5,
      alpha: 0.8, sprite: (name, x, y, size) => { sprites++; assert.ok(isFinite(x + y + size) && size > 0); assert.match(name, /^(animal|home)_/); }
    }));
    if ((f.kind === 'animal' || f.kind === 'home') && o > 0.05) assert.ok(sprites > 0, 'sprite callback for ' + f.kind);
    if (!(f.kind === 'animal' || f.kind === 'home')) assert.strictEqual(sprites, 0);
  }
});

test('home face without sprite name asks for home_<value>', () => {
  const names = [];
  run('home', ctx => WA.drawWindow(ctx, 140, 180, { kind: 'home', value: 'nest' }, 1, { sprite: n => names.push(n) }));
  assert.deepStrictEqual(names, ['home_nest']);
});

test('closed window never draws the face (no peeking) and has no sprite call', () => {
  let n = 0;
  run('closed', ctx => WA.drawWindow(ctx, 120, 154, { kind: 'animal', value: 'cat' }, 0, { sprite: () => n++ }));
  assert.strictEqual(n, 0);
});

test('parity colour is not visible on a closed window (no memory cue)', () => {
  const strokes = (face, open) => {
    const seen = new Set(); const m = mockCtx();
    const ctx = new Proxy(m.ctx, { set(t, k, v) { if (k === 'strokeStyle' || k === 'fillStyle') seen.add(v); t[k] = v; return true; } });
    WA.drawWindow(ctx, 120, 154, face, open, { shutter: 'olive' });
    return seen;
  };
  const odd = { kind: 'number', value: 7, n: 7, text: '7', parity: 'odd' };
  assert.ok(!strokes(odd, 0).has(WA.COLORS.blue.base), 'blue frame leaked on a closed window');
  assert.ok(strokes(odd, 1).has(WA.COLORS.blue.base), 'odd → blue when open');
  assert.ok(strokes({ kind: 'dots', value: 4, n: 4, parity: 'even' }, 1).has(WA.COLORS.orange.base), 'even → orange when open');
});

test('drawFace, drawThing, props and star', () => {
  for (const f of FACES) {
    run('face ' + f.kind, ctx => WA.drawFace(ctx, 140, 140, f, { sprite: () => {}, glow: 0.5, bounce: 4, wiggle: -0.1 }));
    run('face plain ' + f.kind, ctx => WA.drawFace(ctx, 100, 100, f, { plain: true }));
  }
  run('face null', ctx => WA.drawFace(ctx, 100, 100, null));
  for (const o of WA.THINGS) for (const c of COLS.concat(['#336699', 'nope'])) for (const s of [20, 80, 240]) run('thing ' + o + c, ctx => WA.drawThing(ctx, o, c, s));
  run('thing unknown', ctx => WA.drawThing(ctx, 'teapot', 'red', 80));
  for (const t of [0, 1.7, 99]) {
    run('bunting', ctx => WA.drawBunting(ctx, 0, 0, 600, 20, t));
    run('bunting short', ctx => WA.drawBunting(ctx, 0, 0, 30, 0, t));
    COLS.forEach(c => run('balloon', ctx => WA.drawBalloon(ctx, c, 70, t)));
  }
  run('star', ctx => WA.drawStar(ctx, 80, '3'));
  run('star plain', ctx => WA.drawStar(ctx, 40));
});

test('drawBuilding: every facade × roof × shutter, with and without options', () => {
  const roofs = ['flat', 'gable', 'arch', undefined];
  const facs = Object.keys(WA.FACADES).concat(['#E6B8A2', 'Brick-Rose', 'sky grey', 'unknown']);
  facs.forEach((fac, i) => roofs.forEach((roof, j) => {
    const sh = Object.keys(WA.SHUTTERS)[(i + j) % 4];
    run('building ' + fac + roof, ctx => WA.drawBuilding(ctx, { x: 40, y: 120, w: 620, h: 500, roofH: 40 },
      { facade: fac, shutter: sh, roof, seed: i * 7 + j }, { doorX: 140, light: j / 3, bands: [300], pipeX: 640 }));
  }));
  run('building minimal', ctx => WA.drawBuilding(ctx, { x: 0, y: 0, w: 300, h: 300 }, null));
  run('building tiny', ctx => WA.drawBuilding(ctx, { x: 0, y: 0, w: 60, h: 40, roofH: 4 }, { roof: 'gable' }, { cache: false }));
});

test('geometry: window aspect 0.78, readable at 120 px, flower box fits the gap', () => {
  const w = 120, h = w / 0.78, G = WA.geometry(w, h);
  assert.ok(G.opening.w >= 0.72 * w && G.opening.h >= 0.65 * h, 'opening big enough');
  assert.ok(G.content.w >= 70 && G.content.h >= 85, 'content box ≥ 70×85 at 120 px');
  assert.ok(G.sill.y + G.sill.h <= h / 2 + 1e-9 && G.cap.y >= -h / 2 - 1e-9, 'frame inside the cell');
  assert.ok(G.box.y + G.box.h - h / 2 <= Math.max(18, 0.16 * w) + 1e-9, 'flower box hangs at most one gap below');
  assert.ok(G.opening.y > G.cap.y && G.opening.y + G.opening.h < G.sill.y + 1e-9);
});

// ---------------------------------------------------------------- colour rules (DESIGN §3)
const C = WA._contrast;
test('text ink ≥ 4.5:1 on the window interior (unlit and lit) and on the face tile', () => {
  for (const bg of [WA.ROOM.wall, WA.ROOM.wall2, WA.ROOM.lit, WA.ROOM.lit2, WA.ROOM.floor]) {
    assert.ok(C(WA.ROOM.ink, bg) >= 4.5, 'ink on ' + bg + ' = ' + C(WA.ROOM.ink, bg).toFixed(2));
  }
});
test('every answer colour has a dark outline that separates it from the interior (≥ 3:1; yellow ≥ 2.2)', () => {
  // yellow's dark #C99A12 is fixed by DESIGN §3; yellow things also carry a white highlight + darker cel shade
  COLS.forEach(k => assert.ok(C(WA.COLORS[k].dark, WA.ROOM.wall) >= (k === 'yellow' ? 2.2 : 3), k + ' dark on wall ' + C(WA.COLORS[k].dark, WA.ROOM.wall).toFixed(2)));
});
test('buildings are calmer than answer colours; shutters darker than every facade', () => {
  const sat = WA._chroma, lum = WA._lum;   // chroma = max−min channel (HSL saturation inflates pastels)
  const minAnswerSat = Math.min(...COLS.map(k => sat(WA.COLORS[k].base)));
  Object.entries(WA.FACADES).forEach(([k, f]) => {
    assert.ok(sat(f) < minAnswerSat, k + ' facade less saturated than any answer colour');
    COLS.forEach(a => assert.ok(lum(f) > lum(WA.COLORS[a].base) || a === 'yellow', k + ' lighter than ' + a));
  });
  const maxShutterLum = Math.max(...Object.values(WA.SHUTTERS).map(lum));
  const minFacadeLum = Math.min(...Object.values(WA.FACADES).map(lum));
  assert.ok(maxShutterLum < minFacadeLum, 'shutters darker than facades');
  Object.values(WA.SHUTTERS).forEach(s => assert.ok(sat(s) < minAnswerSat, s + ' muted'));
});
test('shutter colour does not depend on the face (identical windows when closed)', () => {
  const trace = face => { const m = mockCtx(); WA.drawWindow(m.ctx, 120, 154, face, 0, { shutter: 'teal' }); return m.calls.join(','); };
  const a = trace({ kind: 'color', value: 'red', color: 'red', obj: 'cup' });
  FACES.forEach(f => assert.strictEqual(trace(f), a, 'closed window differs for ' + JSON.stringify(f)));
});

test('caching is node-safe and clearCache works', () => {
  WA.clearCache();
  assert.strictEqual(WA._cacheSize(), 0);   // no canvas in node → nothing cached, everything painted directly
});

// ---------------------------------------------------------------- run
let fail = 0;
for (const t of tests) {
  try { t.fn(); console.log('ok   ' + t.name); } catch (e) { fail++; console.log('FAIL ' + t.name + '\n     ' + (e && e.message)); }
}
console.log(tests.length - fail + '/' + tests.length + ' passed');
if (fail) process.exit(1);
