#!/usr/bin/env node
// Tuk's Ice Match — unit tests for game/js/ice_art.js (IM.IceArt). Headless: no DOM, a recording mock 2D context.
// Run from the game folder:   node tests/unit/ice_art.test.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', '..', 'game', 'js', 'ice_art.js');
function loadIceArt() {
  const sb = { console, Math, Date, JSON };
  sb.window = sb;                      // like a browser window, but no document / OffscreenCanvas
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(SRC, 'utf8'), sb, { filename: 'ice_art.js' });
  return sb.IM;
}

// recording mock context: every method call is logged as "name(args)"; unknown methods are no-ops
function mockCtx() {
  const log = [], props = { globalAlpha: 1, globalCompositeOperation: 'source-over', font: '10px sans-serif' };
  const grad = () => ({ addColorStop() {} });
  const special = {
    createLinearGradient: grad, createRadialGradient: grad,
    measureText: (t) => ({ width: String(t).length * (parseFloat(String(props.font).match(/([\d.]+)px/)[1]) * 0.6) }),
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })
  };
  const r2 = v => typeof v === 'number' ? Math.round(v * 100) / 100 : typeof v === 'string' ? v : typeof v;
  const ctx = new Proxy({}, {
    get(_, k) {
      if (k === '_log') return log;
      if (k in props) return props[k];
      return function (...a) {
        a.forEach(v => { if (typeof v === 'number') assert.ok(Number.isFinite(v), k + ' got a non-finite number'); });
        log.push(k + '(' + a.map(r2).join(',') + ')');
        return special[k] ? special[k](...a) : undefined;
      };
    },
    set(_, k, v) { props[k] = v; log.push(k + '=' + (typeof v === 'string' ? v : typeof v === 'number' ? Math.round(v * 1000) / 1000 : typeof v)); return true; }
  });
  return ctx;
}

const IM = loadIceArt();
const A = IM.IceArt;
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('loads without a DOM and exposes IM.IceArt + the IM.CardArt alias', () => {
  assert.ok(A, 'IM.IceArt');
  assert.strictEqual(IM.CardArt, A);
});

test('API of DESIGN §5.6 plus the Dee-compatible names', () => {
  ['drawBlock', 'drawFrost', 'drawFace', 'drawBack', 'drawFront', 'drawFish', 'drawSculpture', 'drawStar', 'drawShard', 'drawHole',
    'drawIce', 'drawGlaze', 'drawGlow', 'topFace', 'sideOf', 'sculptureTop', 'sculptureBottom',
    'drawCard', 'drawCardGlow', 'drawButterfly', 'drawLantern', 'lanternTop', 'drawAcorn', 'traceShape', 'clearCache']
    .forEach(f => assert.strictEqual(typeof A[f], 'function', f));
  assert.strictEqual(A.drawLantern, A.drawSculpture);
  assert.deepStrictEqual(Array.from(A.SHAPES), ['circle', 'square', 'triangle', 'star', 'heart', 'rect']);
});

test('COLORS keys and hex match the DESIGN §3 answer palette', () => {
  const DESIGN = {
    red: ['#E84A4A', '#A8282E'], blue: ['#3C8DE8', '#1F5BA8'], yellow: ['#FFD23F', '#C99A12'], green: ['#4CC26B', '#2A8343'],
    orange: ['#FF9A2E', '#C4650C'], purple: ['#9B6BE0', '#6840A8'], pink: ['#FF8FC0', '#C9558A']
  };
  assert.deepStrictEqual(Object.keys(A.COLORS).sort(), Object.keys(DESIGN).sort());
  for (const k of Object.keys(DESIGN)) {
    assert.strictEqual(A.COLORS[k].base, DESIGN[k][0], k + ' base');
    assert.strictEqual(A.COLORS[k].dark, DESIGN[k][1], k + ' dark');
    assert.match(A.COLORS[k].light, /^#[0-9A-F]{6}$/, k + ' light');
  }
});

test('ice colours match DESIGN §3', () => {
  assert.strictEqual(A.ICE.top, '#DDF1FB'); assert.strictEqual(A.ICE.top2, '#BFE3F5'); assert.strictEqual(A.ICE.bevel, '#F4FBFF');
  assert.strictEqual(A.ICE.line, '#6FA7C8'); assert.strictEqual(A.ICE.side, '#9CCBE3');
  assert.strictEqual(A.ICE.frost, '#F2F8FC'); assert.strictEqual(A.ICE.frost2, '#DCEAF3'); assert.strictEqual(A.ICE.crystal, '#C4DCEB');
});

test('text contrast ≥ 4.5:1 (numerals on glazed ice, text on the star)', () => {
  const inkGlazed = A._mix(A.ICE.ink, '#FFFFFF', A.GLAZE);
  for (const bg of [A.ICE.top, A.ICE.top2, A._mix(A.ICE.top2, '#FFFFFF', A.GLAZE)]) {
    assert.ok(A._contrast(inkGlazed, bg) >= 4.5, 'ink on ' + bg + ' = ' + A._contrast(inkGlazed, bg).toFixed(2));
  }
  for (const bg of ['#FFF0A8', '#FFD54A', '#F5B02E']) assert.ok(A._contrast(A.STAR_INK, bg) >= 4.5, 'star ink on ' + bg);
});

test('block geometry: ≈ 10 px side face at 104 px, top face above it', () => {
  assert.strictEqual(A.sideOf(104), 10);
  const T = A.topFace(104, 104 / 0.9);
  assert.ok(Math.abs(T.y + 104 / 0.9 / 2) < 1e-9);
  assert.ok(Math.abs(T.h + 10 - 104 / 0.9) < 1e-9);
});

// every face kind content.js produces (+ home, parity)
const FACES = [];
Object.keys(A.COLORS).forEach(c => FACES.push({ kind: 'color', value: c, color: c }));
A.SHAPES.forEach((s, i) => FACES.push({ kind: 'shape', value: s, shape: s, color: Object.keys(A.COLORS)[i % 7] }));
for (let n = 1; n <= 12; n++) FACES.push({ kind: 'dots', value: n, n });
FACES.push({ kind: 'number', value: 7, n: 7, text: '7', parity: 'odd' }, { kind: 'number', value: 12, n: 12, text: '12' },
  { kind: 'letter', value: 'Đ', text: 'Đ' }, { kind: 'text', value: '12 − 7', text: '12 − 7' },
  { kind: 'parity', value: 8, n: 8 }, { kind: 'parity', value: 9, n: 9, dots: true },
  { kind: 'animal', value: 'seal', sprite: 'animal_seal', scale: 1 }, { kind: 'animal', value: 'bear', sprite: 'animal_bear', scale: 0.6, size: 'small' },
  { kind: 'home', value: 'den', sprite: 'home_den' }, { kind: 'home', value: 'floe' });

test('every face kind draws at 104 and 160 px, clear, half frosted and cracking', () => {
  for (const f of FACES) for (const w of [104, 160]) for (const [fr, cr] of [[0, 0], [0.5, 0], [1, 0.5], [0.4, 1]]) {
    const ctx = mockCtx(), sprites = [];
    A.drawIce(ctx, w, w / 0.9, f, fr, { crack: cr, seed: 5, sprite: (n, x, y, s) => sprites.push([n, x, y, s]) });
    assert.ok(ctx._log.length > 10, 'drew something');
    if ((f.kind === 'animal' || f.kind === 'home') && fr < 1) {
      assert.strictEqual(sprites.length, 1, 'sprite called for ' + f.kind);
      assert.ok(f.kind !== 'home' || sprites[0][0].indexOf('home_') === 0, 'home sprite name');
      assert.ok(sprites[0][3] > 0.55 * w * (f.scale || 1), 'sprite large enough');
    }
  }
});

test('all frosted blocks look identical (no cue): same drawing for any face / seed', () => {
  const draw = (f, seed) => { const c = mockCtx(); A.drawIce(c, 104, 104 / 0.9, f, 1, { seed, sprite() {} }); return c._log.join(';'); };
  const ref = draw(FACES[0], 1);
  for (let i = 0; i < FACES.length; i++) assert.strictEqual(draw(FACES[i], 1000 + i * 77), ref, 'face ' + i);
  const back = mockCtx(); A.drawBack(back, 104, 104 / 0.9, {});
  assert.strictEqual(back._log.join(';'), ref, 'drawBack = drawIce(frost 1)');
});

test('cracks and the clearing are deterministic per seed', () => {
  const j = v => JSON.stringify(v);
  assert.strictEqual(j(A._crackLines(104, 115, 42)), j(A._crackLines(104, 115, 42)));
  assert.notStrictEqual(j(A._crackLines(104, 115, 42)), j(A._crackLines(104, 115, 43)));
  assert.strictEqual(j(A._holePoints(104, 115, 0.5, 0, 9)), j(A._holePoints(104, 115, 0.5, 0, 9)));
  const r = p => Math.max(...p.map(q => Math.hypot(q[0], q[1] - A.topFace(104, 115).cy)));
  assert.ok(r(A._holePoints(104, 115, 0.2, 0, 9)) > r(A._holePoints(104, 115, 0.8, 0, 9)), 'more frost → smaller clearing');
});

test('drawCard (Dee-compatible) maps flip to frost', () => {
  const a = mockCtx(), b = mockCtx();
  A.drawCard(a, 104, 115, FACES[0], 0.3, { seed: 2 }); A.drawIce(b, 104, 115, FACES[0], 0.7, { seed: 2 });
  assert.strictEqual(a._log.join(';'), b._log.join(';'));
});

test('rewards and particles draw with finite numbers', () => {
  const ctx = mockCtx();
  Object.keys(A.COLORS).forEach(c => [0, 0.25, 0.5, 0.75].forEach(wg => A.drawFish(ctx, c, 90, wg)));
  A.SHAPES.forEach(s => A.drawSculpture(ctx, s, 'blue', 80, 1));
  A.drawStar(ctx, 100); A.drawStar(ctx, 100, 'A', { twinkle: 1 });
  for (let i = 0; i < 3; i++) A.drawShard(ctx, 30, i, { variant: i });
  [0, 0.1, 0.5, 1].forEach(t => A.drawHole(ctx, 110, 60, t));
  A.drawButterfly(ctx, 'red', 40, 0.5); A.drawAcorn(ctx, 20); A.drawGlow(ctx, 104, 115, 1);
  assert.ok(A.sculptureTop('star', 80) < 0 && A.sculptureBottom('star', 80) > 0);
});

let fail = 0;
for (const t of tests) {
  try { t.fn(); console.log('ok   ' + t.name); } catch (e) { fail++; console.log('FAIL ' + t.name + '\n     ' + (e && e.stack || e)); }
}
console.log(`\n${tests.length - fail}/${tests.length} ice_art tests passed`);
process.exit(fail ? 1 : 0);
