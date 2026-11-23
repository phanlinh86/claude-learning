// Nuka's Snow Dig — NK.DigArt smoke test: loads game/js/dig_art.js in a node vm sandbox (no DOM) with a fake recording 2D
// context, checks every API exists and draws without throwing for every kind / shape / animal / colour / dig value, both
// without Path2D (paths rebuilt on the ctx) and with a fake Path2D (cached paths).
// Usage: node tests/unit/dig_art.test.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'game', 'js', 'dig_art.js'), 'utf8');

const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
const SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'rect', 'diamond', 'oval'];
const ANIMALS = ['fox', 'hare', 'reindeer', 'walrus', 'whale', 'dog', 'goose', 'owl'];

function fakeCtx() {
  const calls = {};
  const grad = { addColorStop() {} };
  const target = {
    _calls: calls, _save: 0,
    createLinearGradient: () => grad, createRadialGradient: () => grad,
    measureText: (t) => ({ width: String(t).length * 20 }),
    save() { this._save++; }, restore() { this._save--; }
  };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) { if (typeof t[k] === 'function') calls[k] = (calls[k] || 0) + 1; return t[k]; }
      if (typeof k === 'symbol') return undefined;
      return (...args) => {
        calls[k] = (calls[k] || 0) + 1;
        for (const a of args) if (typeof a === 'number' && !Number.isFinite(a)) throw new Error('non-finite arg to ' + String(k) + ': ' + args.join(','));
      };
    },
    set(t, k, v) { t[k] = v; return true; }
  });
}
class FakePath2D { constructor() { this.n = 0; } }
['moveTo', 'lineTo', 'bezierCurveTo', 'quadraticCurveTo', 'arc', 'arcTo', 'ellipse', 'rect', 'closePath'].forEach(m => {
  FakePath2D.prototype[m] = function (...a) {
    for (const v of a) if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('non-finite Path2D.' + m);
    this.n++;
  };
});

function load(withPath2D) {
  const sb = { console, Math, Date, JSON };
  sb.window = sb;
  if (withPath2D) sb.Path2D = FakePath2D;
  vm.createContext(sb);
  vm.runInContext(SRC, sb, { filename: 'dig_art.js' });   // must not touch the DOM at load
  return sb.NK;
}

let checks = 0;
function run(withPath2D) {
  const NK = load(withPath2D), A = NK.DigArt;
  assert.ok(A, 'NK.DigArt exists');
  for (const f of ['drawThing', 'thingBox', 'drawMound', 'drawHoleBack', 'drawShovel', 'drawSandBit', 'drawShelf', 'drawIcon', 'drawGhostHand',
    'moundGeom', 'moundSurface', 'clipBuried', 'pal', 'clearCache', 'drawPaw', 'drawSnowBit', 'drawAurora']) assert.strictEqual(typeof A[f], 'function', f + ' is a function');
  for (const c of COLORS) { const p = A.pal(c); assert.ok(p && /^#[0-9A-F]{6}$/i.test(p.base) && p.dark && p.light, 'pal ' + c); }
  assert.strictEqual(A.PALETTE.red.base, '#E84A4A'); assert.strictEqual(A.PALETTE.pink.light, '#FFCCE2');
  assert.strictEqual(A.SNOW.base, '#F4F8FC'); assert.strictEqual(A.SNOW.hole, '#9DBCD6'); assert.strictEqual(A.SNOW.holeDeep, '#5F86A8');
  assert.strictEqual(A.SAND, A.SNOW, 'SAND kept as an alias of SNOW'); assert.strictEqual(A.FISH.base, '#9FB9CF');

  const things = [];
  for (const c of COLORS) things.push({ kind: 'hat', color: c });
  for (const s of SHAPES) { things.push({ kind: 'gem', shape: s }); for (const c of COLORS) things.push({ kind: 'gem', shape: s, color: c }); }
  for (const a of ANIMALS) things.push({ kind: 'toy', animal: a });
  things.push({ kind: 'fish' }, { kind: 'hat' }, { kind: 'hat', color: '#123456' }, { kind: 'toy', animal: 'unicorn' }, { kind: 'gem', shape: 'blob' }, { kind: 'mystery' });
  // removed base kinds must still draw a harmless fallback (never throw)
  things.push({ kind: 'egg', color: 'red' }, { kind: 'eggTop' }, { kind: 'eggBottom' }, { kind: 'dino', color: 'green' }, { kind: 'bone' }, { kind: 'stone', shape: 'star' });
  for (const t of ['A', 'b', 'Đ', '7', '12', '2+3', '']) things.push({ kind: 'tablet', text: t });
  things.push({ kind: 'tablet', n: 9 });

  const opts = [{}, { wob: 6, glow: 1, dim: 1, night: 1, time: 1.2, shadow: true }, { night: 0.4, dim: 0.35 }];
  for (const t of things) for (const size of [64, 112, 336]) for (const o of opts) {
    const ctx = fakeCtx();
    A.drawThing(ctx, t, size, o);
    assert.strictEqual(ctx._save, 0, 'save/restore balanced for ' + JSON.stringify(t));
    const b = A.thingBox(t, size);
    assert.ok(b.w > 0 && b.h > 0 && b.top < b.bottom && b.h <= size * 1.001, 'thingBox ' + JSON.stringify(t));
    checks++;
  }
  // shape proportions the game depends on
  const box = s => A.thingBox({ kind: 'gem', shape: s }, 100);
  assert.ok(box('rect').w / box('rect').h >= 1.45, 'rect clearly wider than tall');
  assert.ok(box('oval').h / box('oval').w >= 1.3, 'oval taller than wide');
  const hb = A.thingBox({ kind: 'hat', color: 'red' }, 100);
  assert.ok(Math.abs(hb.w - 90) < 0.01 && Math.abs(hb.h - 100) < 0.01, 'hat ≈ 0.9 size wide, size tall');
  for (const k of ['fish', 'tablet']) { const b = A.thingBox({ kind: k }, 110); assert.ok(b.w > 40 && b.w < 110 && Math.abs(b.h - 110) < 0.01, k + ' box'); }
  for (const a of ANIMALS) { const b = A.thingBox({ kind: 'toy', animal: a }, 100); assert.ok(b.w >= 60 && b.w <= 90 && b.h === 100, 'toy box ' + a); }
  const fb = A.thingBox({ kind: 'egg' }, 100); assert.ok(fb.w > 0 && fb.h > 0 && fb.h <= 100, 'fallback box sane');

  for (const dig of [0, 0.1, 0.3, 0.31, 0.33, 0.5, 0.66, 0.9, 1]) for (const o of [{}, { glow: 1, wob: -5, pop: 0.4, night: 1, sparkle: 1, time: 3 }, { pop: 0 }, { pop: 1.15 }]) {
    const m = { id: 'm' + dig, w: 174, h0: 69, dig };
    const c1 = fakeCtx(), c2 = fakeCtx(), c3 = fakeCtx();
    A.drawHoleBack(c1, m, o); A.drawMound(c2, m, o); A.clipBuried(c3, m, o);
    assert.strictEqual(c1._save, 0); assert.strictEqual(c2._save, 0);
    const g = A.moundGeom(m);
    assert.ok(Math.abs(g.pileTop + 69 * (1 - dig)) < 1e-9, 'pileTop');
    if (dig > 0.3) assert.ok(g.hole && Math.abs(g.hole.cy + g.hole.ry - (g.pileTop + 4)) < 1e-9, 'hole front lip at the clip line');
    else assert.strictEqual(g.hole, null);
    for (const x of [-90, -40, 0, 40, 90]) assert.ok(Number.isFinite(A.moundSurface(m, x)));
    checks++;
  }
  A.drawMound(fakeCtx(), {}, {}); A.drawHoleBack(fakeCtx(), { dig: 1 }); A.drawMound(fakeCtx(), null); A.drawThing(fakeCtx(), null, 50);

  for (const a of [0, 0.7, -1.2, Math.PI]) for (const s of [0, 0.5, 1]) { const c = fakeCtx(); A.drawShovel(c, a, 150, { sand: s, night: s }); assert.strictEqual(c._save, 0); checks++; }
  for (const r of [0, 3, 12]) A.drawSandBit(fakeCtx(), r, 1, { night: 1, alpha: 0.5, seed: 0.2 });
  const shelf = { x: 24, y: 152, w: 900, h: 92, size: 64, slots: [{ x: 100, y: 214 }, { x: 176, y: 214 }] };
  for (const o of [{}, { night: 1, slots: true }, { t: 3.3, n: 4 }, { t: 12, n: 12, ripple: 1, night: 1, alpha: 0.6, glow: 1 }, { n: 40, alpha: 0 }, { slots: false }]) {
    const c = fakeCtx(); A.drawShelf(c, shelf, o); assert.strictEqual(c._save, 0, 'aurora ' + JSON.stringify(o)); checks++;
  }
  A.drawShelf(fakeCtx(), null); A.drawShelf(fakeCtx(), { x: 0, y: 0, w: 0, h: 0 });

  const icons = [{ kind: 'blob', color: 'red' }, { kind: 'fish' }, { kind: 'number', n: 7 }, { kind: 'letter', text: 'Ă' }, { kind: 'tablet', text: 'K' }, { kind: 'nope' }, { kind: 'egg', color: 'red' }];
  for (const c of COLORS) icons.push({ kind: 'hat', color: c }, { kind: 'blob', color: c }, { kind: 'size', size: 'big', of: 'hat', color: c });
  for (const s of SHAPES) icons.push({ kind: 'gem', shape: s, color: 'blue' });
  for (const a of ANIMALS) icons.push({ kind: 'toy', animal: a }, { kind: 'size', size: 'small', of: 'toy', animal: a });
  for (let n = 0; n <= 12; n++) icons.push({ kind: 'dots', n });
  for (const sz of ['big', 'small']) for (const of of ['fish', 'hat', undefined]) icons.push({ kind: 'size', size: sz, of });
  for (const t of icons) { const c = fakeCtx(); A.drawIcon(c, t, 120); assert.strictEqual(c._save, 0, 'icon ' + JSON.stringify(t)); checks++; }
  A.drawIcon(fakeCtx(), null, 100);

  for (const t of [0, 0.1, 0.5, 0.9, 1.3, -0.2]) for (const o of [undefined, {}, { rub: true }]) { const c = fakeCtx(); A.drawGhostHand(c, 110, t, o); assert.strictEqual(c._save, 0); checks++; }
  A.clearCache();
}

run(false);
run(true);
console.log('dig_art.test.js: OK (' + checks + ' draw checks, with and without Path2D)');
