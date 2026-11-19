// Mochi's Icing Bakery — IB.CookieArt unit test (node, headless): the API exists, loads without a DOM, and every
// cookie kind / shape / animal / home / glyph, bag, guide, icing, chip, sprinkle, icon, hand and puff draws on a mock
// 2D context without throwing and without a NaN / Infinity argument. Run twice: without Path2D (paths rebuilt on the
// context) and with a fake Path2D (the cached-path branch).
'use strict';

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n       ') : e)); }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }

function checkArgs(name, args) {
  for (const a of args) {
    if (typeof a === 'number' && !isFinite(a)) throw new Error(name + '(' + args.join(', ') + ') got a non-finite number');
  }
}
/** A recording mock CanvasRenderingContext2D. */
function mockCtx() {
  const calls = { n: 0, byName: {} };
  const grad = () => ({ addColorStop(o, c) { checkArgs('addColorStop', [o]); if (/NaN/.test(String(c))) throw new Error('NaN colour ' + c); } });
  const target = {
    calls, globalAlpha: 1, lineWidth: 1, lineDashOffset: 0, shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0,
    createLinearGradient(...a) { checkArgs('createLinearGradient', a); return grad(); },
    createRadialGradient(...a) { checkArgs('createRadialGradient', a); return grad(); },
    measureText(t) { return { width: String(t).length * 0.6 * 100 }; },
    setLineDash() {}, getLineDash() { return []; }
  };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === 'symbol') return undefined;
      return (...a) => { checkArgs(String(k), a); calls.n++; calls.byName[k] = (calls.byName[k] || 0) + 1; if (k === 'arc') (calls.arcR = calls.arcR || []).push(a[2]); };
    },
    set(t, k, v) {
      if (typeof v === 'number' && !isFinite(v)) throw new Error('set ' + String(k) + ' = ' + v);
      if (typeof v === 'string' && /NaN|undefined/.test(v)) throw new Error('set ' + String(k) + ' = ' + v);
      t[k] = v; return true;
    }
  });
}
class FakePath2D {
  constructor() { this.ops = 0; }
}
['moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse', 'bezierCurveTo', 'quadraticCurveTo', 'closePath', 'rect'].forEach((m) => {
  FakePath2D.prototype[m] = function (...a) { checkArgs('Path2D.' + m, a); this.ops++; };
});

function path(strokes) {
  const S = strokes.map((pts) => { let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return { pts, len, closed: false }; });
  return { strokes: S, len: S.reduce((a, s) => a + s.len, 0) };
}
function line(x0, y0, x1, y1, step) { const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / (step || 4))), o = []; for (let i = 0; i <= n; i++) o.push([x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n]); return o; }

function run(withPath2D) {
  console.log('cookie_art — ' + (withPath2D ? 'with a fake Path2D' : 'no Path2D'));
  const fs = require('fs'), vm = require('vm'), p = require('path');
  const sandbox = { console, Math, Date, JSON };
  sandbox.window = sandbox;
  if (withPath2D) sandbox.Path2D = FakePath2D;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(p.join(__dirname, '..', '..', 'game', 'js', 'cookie_art.js'), 'utf8'), sandbox, { filename: 'cookie_art.js' });
  const A = sandbox.IB && sandbox.IB.CookieArt;

  test('API exists', () => {
    assert(A, 'IB.CookieArt missing');
    ['drawTray', 'drawRack', 'drawCookie', 'drawIcingBag', 'drawGuide', 'drawIcing', 'drawChip', 'drawSprinkle', 'drawIcon', 'drawGhostHand', 'drawFlourPuff']
      .forEach((f) => assert(typeof A[f] === 'function', f + ' missing'));
    assert(A.ANIMALS.length === 10 && A.HOMES.length === 8 && A.SHAPES.length === 8, 'lists');
    assert(typeof A.BAG_CENTER === 'number', 'BAG_CENTER');
  });
  test('dough colours are never an answer colour', () => {
    const answers = Object.values(A.PALETTE).map((c) => c.base.toUpperCase());
    Object.values(A.DOUGH).concat(Object.values(A.GINGER)).forEach((h) => assert(answers.indexOf(h.toUpperCase()) < 0, h));
  });
  test('every cookie kind draws at 116, 330, 74 and 20 px with every state', () => {
    const cks = [{ kind: 'round' }, { kind: 'glyph', text: '7' }, { kind: 'glyph', text: '12' }, { kind: 'glyph', text: 'g' }, { kind: 'glyph', n: 3 }, { kind: 'mystery' }, { kind: 'animal', animal: 'unicorn' }];
    A.SHAPES.forEach((s) => cks.push({ kind: 'shape', shape: s }));
    A.ANIMALS.forEach((a) => cks.push({ kind: 'animal', animal: a }));
    A.HOMES.forEach((h) => cks.push({ kind: 'home', home: h }));
    const opts = [{}, { lift: 1, wob: 6, glow: 1, selected: true, sparkle: 1, time: 1.3 }, { dim: true, squash: 0.7 }, { sx: 1.2, sy: 0.8 }, { squash: 'x', lift: NaN, wob: undefined }];
    for (const ck of cks) for (const size of [116, 330, 74, 20]) for (const o of opts) { const c = mockCtx(); A.drawCookie(c, ck, size, o); assert(c.calls.n > 5, 'nothing drawn for ' + JSON.stringify(ck)); }
  });
  test('cookie with icing + chips (rack) and edge cases', () => {
    const c = mockCtx();
    A.drawCookie(c, { kind: 'round', icing: [{ pts: line(150, 200, 450, 200), hex: 'red' }, { pts: [line(300, 60, 300, 340), line(200, 200, 400, 200)], hex: '#3C8DE8' }, { pts: [], hex: 'blue' }], chips: [{ x: 300, y: 200, r: 15 }, { x: 250, y: 150 }] }, 74, {});
    A.drawCookie(c, null, 100); A.drawCookie(c, { kind: 'round' }, 0); A.drawCookie(c, { kind: 'round' }, NaN);
  });
  test('icing bags: all colours, empty, every option, angles', () => {
    ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink', '#123456', null, 'nope'].forEach((h) => {
      [0, 0.6, -1.2].forEach((ang) => {
        const c = mockCtx();
        A.drawIcingBag(c, h, 120, ang, { squeeze: 1, lift: 0.5, wob: 4, glow: 1, selected: 1, dim: true, center: true, time: 2 });
        A.drawIcingBag(c, h, 120, ang);
        A.drawIcingBag(c, h, 60, ang, { empty: true, squeeze: 0.4 });
        assert(c.calls.n > 20);
      });
    });
  });
  test('guide: number / state done, multi-stroke badges, complete, degenerate', () => {
    const p1 = path([line(150, 200, 450, 200)]), p2 = path([line(300, 80, 220, 240), line(220, 240, 380, 240), line(330, 150, 330, 320)]);
    const c = mockCtx();
    [0, 10, 150, 299, 300, 1e6, -5, NaN].forEach((d) => A.drawGuide(c, p1, d, { pulse: 0.3, glow: 1, alpha: 0.8 }));
    [0, 200, 420, p2.len - 1].forEach((d) => A.drawGuide(c, p2, d, {}));
    A.drawGuide(c, p2, { stroke: 1, done: 40, total: 0.4 }, { time: 3 });
    A.drawGuide(c, p2, { stroke: 2, done: 0 }, {});
    A.drawGuide(c, p2, { complete: true }, {});
    A.drawGuide(c, path([[[300, 200]]]), 0, {});   // a one-point stroke
    A.drawGuide(c, { strokes: [] }, 0); A.drawGuide(c, null, 0);
    assert(c.calls.n > 50);
  });
  test('guide keeps on-screen minimum sizes on a small tray (dots ≥ 11 px, ring ≥ 40 px across)', () => {
    const p1 = path([line(110, 260, 490, 250)]);
    for (const sc of [0.4, 0.55, 1, 2]) {
      const c = mockCtx(); c.getTransform = () => ({ a: sc * 2, b: 0, c: 0, d: sc * 2, e: 0, f: 0 });
      A.drawGuide(c, p1, 0, { pulse: 0, dpr: 2 });
      const R = c.calls.arcR.filter((r) => r > 0);
      const dotR = Math.max(...R.filter((r) => r * sc < 15));   // dot outer radius (largest small circle)
      assert(R.some((r) => r * sc >= 20 - 1e-6), 'start ring too small at scale ' + sc);
      assert(dotR * sc >= 5.5 - 1e-6, 'dots too small at scale ' + sc + ': ' + (dotR * sc).toFixed(2));
      const c2 = mockCtx(); A.drawGuide(c2, p1, 0, { pulse: 0, screenScale: sc });
      assert(c2.calls.arcR.some((r) => r * sc >= 20 - 1e-6), 'screenScale option ignored');
    }
  });
  test('guide skips dots bunched across a sharp corner', () => {
    const zig = path([line(100, 300, 150, 100, 4).concat(line(150, 100, 200, 300, 4).slice(1))]);
    const c = mockCtx(); A.drawGuide(c, zig, 0, { pulse: 0 });
    assert(c.calls.byName.arc > 0);
  });
  test('icing: 1 point, 2 points, 3000 points fast', () => {
    const c = mockCtx();
    A.drawIcing(c, [[10, 10]], 'red', 22); A.drawIcing(c, [[10, 10], [20, 10]], 'green', 22, { wet: 1 });
    A.drawIcing(c, [], 'red', 22); A.drawIcing(c, null, 'red', 22);
    const big = []; for (let i = 0; i < 3000; i++) big.push([100 + (i % 400), 100 + Math.sin(i / 20) * 50]);
    const t0 = Date.now(); for (let k = 0; k < 10; k++) A.drawIcing(mockCtx(), big, 'purple', 22, { wet: 0.5 });
    assert(Date.now() - t0 < 1500, 'icing too slow');
  });
  test('tray, rack, chip, sprinkle, puff, hand', () => {
    const c = mockCtx();
    A.drawTray(c, { x: 100, y: 80, w: 600, h: 400, s: 1 }, { glow: 1, time: 1 }); A.drawTray(c, { x: 0, y: 0, w: 120, h: 80 }); A.drawTray(c, null); A.drawTray(c, { x: 0, y: 0, w: 0, h: 0 });
    A.drawRack(c, { x: 10, y: 10, w: 340, h: 80, slots: [] }); A.drawRack(c, { x: 0, y: 0, w: 60, h: 20 });
    A.drawChip(c, 14); A.drawChip(c, 14, { squash: 0.5 }); A.drawChip(c, NaN);
    A.drawSprinkle(c, 'pink', 12, 1); A.drawSprinkle(c, '#FF0000', 0, 0); A.drawSprinkle(c, null);
    [0, 0.3, 0.99, 1, NaN].forEach((t) => A.drawFlourPuff(c, 40, t));
    [0, 0.5, 1].forEach((p) => A.drawGhostHand(c, 90, p));
    assert(c.calls.n > 50);
  });
  test('Talk icons: every kind', () => {
    const things = [{ kind: 'blob', color: 'red' }, { kind: 'blob' }, { kind: 'shape', shape: 'star', color: 'blue' }, { kind: 'shape', shape: 'heart' }, { kind: 'animal', animal: 'cow' }, { kind: 'home', home: 'nest' },
      { kind: 'number', n: 9 }, { kind: 'letter', text: 'Q' }, { kind: 'dots', n: 0 }, { kind: 'dots', n: 4 }, { kind: 'dots', n: 10 }, { kind: 'dots', n: 20 },
      { kind: 'size', size: 'big' }, { kind: 'size', size: 'small', animal: 'pig' }, { kind: 'cookie', animal: 'duck' }, { kind: 'cookie', ck: { kind: 'shape', shape: 'oval' } }, { kind: 'zzz' }, null];
    things.forEach((t) => { const c = mockCtx(); A.drawIcon(c, t, 100); });
  });
  test('pal(): names, hex, unknown', () => {
    assert(A.pal('red').base === '#E84A4A' && A.pal('#E84A4A').dark === '#A8282E', 'palette');
    assert(A.pal('#102030').dark && A.pal('nope') === null && A.pal(null) === null);
  });
  test('arcLengths + clearCache', () => {
    const st = { pts: line(0, 0, 100, 0) }; const L = A.arcLengths(st);
    assert(Math.abs(L[L.length - 1] - 100) < 1e-6); A.clearCache();
  });
}

run(false);
run(true);
console.log(`\ncookie_art: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
