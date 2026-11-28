// Mit's Treasure Map — TM.PuzzleArt smoke test: loads game/js/puzzle_art.js in a node vm sandbox (no DOM) with a fake
// recording 2D context and checks that every API exists and draws without throwing for every kind / object / colour /
// shape / n (coins, dots) / animal / glyph / scene (+ old scene aliases) / mood, plus chest / scroll / fish, both without Path2D (paths rebuilt on the ctx) and with a fake Path2D
// (cached paths); that save/restore stay balanced; that pieceBox ≤ size with the longest side == size; and the §4.2
// proportions (rect 1.5:1, oval 1:1.35, dots tiles widen with the columns) and that n coins stay n separate discs with
// visible gaps ≥ 6 px at size 112 (so the shadow alone is countable).
// Usage: node tests/unit/puzzle_art.test.js      (exit 1 on any failure)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'game', 'js', 'puzzle_art.js'), 'utf8');

const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
const OBJECTS = ['boat', 'flag', 'pail', 'parasol', 'hat', 'shell', 'kite', 'bottle'];
const SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'rect', 'diamond', 'oval'];
const ANIMALS = ['parrot', 'turtle', 'fish', 'monkey', 'octopus', 'seagull', 'dolphin', 'starfish'];
const SCENES = ['cove', 'sails', 'cave', 'lagoon', 'shore', 'deck'];
const OLD_SCENES = ['street', 'shapes', 'balloons', 'park', 'letters', 'size'];

function fakeCtx() {
  const calls = {};
  const grad = { addColorStop() {} };
  const target = {
    _calls: calls, _save: 0, globalAlpha: 1,
    createLinearGradient: () => grad, createRadialGradient: () => grad,
    measureText: (t) => ({ width: String(t).length * 60 }),
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
    set(t, k, v) {
      if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('non-finite ' + String(k));
      t[k] = v; return true;
    }
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
  vm.runInContext(SRC, sb, { filename: 'puzzle_art.js' });   // must not touch the DOM at load
  return sb.TM;
}

let checks = 0;
function balanced(ctx, what) { assert.strictEqual(ctx._save, 0, 'save/restore balanced: ' + what); }

function run(withPath2D) {
  const TM = load(withPath2D), A = TM.PuzzleArt;
  assert.ok(A, 'TM.PuzzleArt exists');
  for (const f of ['drawPiece', 'drawShadow', 'pieceBox', 'drawBoard', 'drawTray', 'drawBubble', 'drawIcon', 'drawGhostHand', 'drawChest', 'drawScroll', 'drawFish', 'coinSpots', 'sceneBusy', 'pal', 'thingKey', 'clearCache'])
    assert.strictEqual(typeof A[f], 'function', f + ' is a function');
  assert.deepStrictEqual([...A.OBJECTS], OBJECTS); assert.deepStrictEqual([...A.SHAPES], SHAPES); assert.deepStrictEqual([...A.ANIMALS], ANIMALS);
  assert.deepStrictEqual([...A.SCENES], SCENES);
  assert.strictEqual(A.pal('red').base, '#E84A4A'); assert.strictEqual(A.pal('purple').dark, '#6840A8'); assert.strictEqual(A.pal('pink').light, '#FFCCE2');

  const things = [];
  for (const o of OBJECTS) for (const c of COLORS) things.push({ kind: 'obj', obj: o, color: c });
  for (const s of SHAPES) for (const c of COLORS) things.push({ kind: 'shape', shape: s, color: c });
  for (let n = 0; n <= 6; n++) things.push({ kind: 'coins', n }, { kind: 'bunch', n });
  for (let n = 0; n <= 13; n++) things.push({ kind: 'dots', n });
  for (const a of ANIMALS) things.push({ kind: 'animal', animal: a });
  for (const t of ['A', 'b', 'Đ', 'g', '7', '12', 'Ă', '']) things.push({ kind: 'glyph', text: t }, { kind: 'glyph', text: t, color: 'green' });
  things.push({ kind: 'glyph', n: 9 }, { kind: 'obj', obj: 'rocket', color: 'red' }, { kind: 'obj', obj: 'boat' }, { kind: 'obj', obj: 'car', color: 'red' }, { kind: 'coins' }, { kind: 'coins', n: 'x' }, { kind: 'shape', shape: 'blob' },
    { kind: 'animal', animal: 'elephant' }, { kind: 'animal', animal: 'duck' }, { kind: 'animal' }, { kind: 'mystery' }, { kind: 'bunch' }, { kind: 'dots', n: 'x' }, { kind: 'obj', obj: 'boat', color: 'red', big: true });

  const opts = [{}, { glow: 1, lift: 1, dim: 1, count: 3, alive: 1, season: 3, t: 2.5 }, { count: 0, alive: 0.5, season: 1 }, { glow: 0.4, count: 99, season: 7 }];
  for (const t of things) {
    for (const size of [40, 112, 140, 336]) {
      for (const o of opts) { const ctx = fakeCtx(); A.drawPiece(ctx, t, size, o); balanced(ctx, 'piece ' + JSON.stringify(t)); checks++; }
      for (const o of [{}, { glow: 1, alpha: 0.5 }, { alpha: 0 }]) { const ctx = fakeCtx(); A.drawShadow(ctx, t, size, o); balanced(ctx, 'shadow ' + JSON.stringify(t)); checks++; }
      const b = A.pieceBox(t, size);
      assert.ok(b.w > 0 && b.h > 0, 'pieceBox positive ' + JSON.stringify(t));
      assert.ok(b.w <= size * 1.0001 && b.h <= size * 1.0001, 'pieceBox ≤ size ' + JSON.stringify(t) + ' ' + JSON.stringify(b));
      const isCoins = (t.kind === 'coins' || t.kind === 'bunch') && Math.max(1, Math.min(5, Math.round(+t.n || 1))) < 5 && !isNaN(+t.n) && t.n != null;
      if (isCoins) assert.ok(Math.max(b.w, b.h) >= size * 0.3, 'small coins piece still graspable ' + JSON.stringify(t) + ' ' + JSON.stringify(b));
      else if (!(t.kind === 'coins' || t.kind === 'bunch')) assert.ok(Math.abs(Math.max(b.w, b.h) - size) < 1e-6, 'longest side == size ' + JSON.stringify(t));
    }
    const ctx = fakeCtx(); A.drawIcon(ctx, t, 120); balanced(ctx, 'icon ' + JSON.stringify(t)); checks++;
  }
  // a piece and its shadow use the same silhouette (same box), whatever the colour
  for (const o of OBJECTS) assert.deepStrictEqual(A.pieceBox({ kind: 'obj', obj: o, color: 'red' }, 112), A.pieceBox({ kind: 'obj', obj: o, color: 'blue' }, 112));
  // proportions
  const box = (t) => A.pieceBox(t, 100);
  const r = box({ kind: 'shape', shape: 'rect' }), ov = box({ kind: 'shape', shape: 'oval' });
  assert.ok(r.w / r.h > 1.4 && r.w / r.h < 1.6, 'rect ≈ 1.5:1 (' + (r.w / r.h).toFixed(2) + ')');
  assert.ok(ov.h / ov.w > 1.25 && ov.h / ov.w < 1.45, 'oval ≈ 1:1.35 (' + (ov.h / ov.w).toFixed(2) + ')');
  // coins: n separate discs, visible gaps ≥ 6 px at 112 (outline LW≈4 px included), counting order top row first
  for (let n = 1; n <= 5; n++) {
    const sp = A.coinSpots(n, 112);
    assert.strictEqual(sp.length, n, 'coinSpots(' + n + ') has n coins');
    const k = sp[0].r / 20;   // px per design unit
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const gap = Math.hypot(sp[i].x - sp[j].x, sp[i].y - sp[j].y) - sp[i].r - sp[j].r - 3.6 * k;
      assert.ok(gap >= 6, 'coins ' + n + ': visible gap ' + gap.toFixed(1) + ' px ≥ 6');
    }
    for (let i = 1; i < n; i++) assert.ok(sp[i].y > sp[i - 1].y + 1 || (Math.abs(sp[i].y - sp[i - 1].y) < 1 && sp[i].x > sp[i - 1].x), 'coins counting order ' + n);
    assert.deepStrictEqual(A.pieceBox({ kind: 'bunch', n }, 112), A.pieceBox({ kind: 'coins', n }, 112), 'bunch is an alias of coins');
  }
  const cw = [2, 3, 4, 5].map(n => { const b = box({ kind: 'coins', n }); return b.w.toFixed(1) + 'x' + b.h.toFixed(1); });
  assert.strictEqual(new Set(cw).size, 4, 'coin silhouettes 2..5 differ ' + cw);
  // coins: one constant coin radius for every n (a 1-coin piece is NOT one giant coin); n = 5 fills the size box
  const r5 = A.coinSpots(5, 112)[0].r;
  for (let n = 1; n <= 5; n++) assert.ok(Math.abs(A.coinSpots(n, 112)[0].r - r5) < 1e-9, 'coin radius constant for n=' + n);
  assert.ok(r5 >= 17, 'coins not tiny at 112: r=' + r5.toFixed(1));
  const b5 = A.pieceBox({ kind: 'coins', n: 5 }, 112), b1 = A.pieceBox({ kind: 'coins', n: 1 }, 112);
  assert.ok(Math.abs(Math.max(b5.w, b5.h) - 112) < 1e-6, 'coins 5 fills the size box');
  assert.ok(b1.w < b5.w && b1.w > 40, '1-coin piece is one coin-sized box ' + JSON.stringify(b1));
  // dots: one fixed card for every n (ten-frame-like grid), dots r ≥ 9 px at 112
  const d1 = box({ kind: 'dots', n: 1 });
  for (const n of [2, 5, 7, 10, 12]) assert.deepStrictEqual(box({ kind: 'dots', n }), d1, 'dots card same size for n=' + n);
  const dk = A.pieceBox({ kind: 'dots', n: 3 }, 112).w / (102 + 3.6);
  assert.ok(9 * dk >= 9, 'dot radius ≥ 9 px at 112 (' + (9 * dk).toFixed(1) + ')');
  // distinct object silhouettes (aspect ratios not all equal)
  const asp = OBJECTS.map(o => { const b = box({ kind: 'obj', obj: o, color: 'red' }); return (b.w / b.h).toFixed(2); });
  assert.ok(new Set(asp).size >= 6, 'object silhouettes differ: ' + asp);
  const aasp = ANIMALS.map(a => { const b = box({ kind: 'animal', animal: a }); return (b.w / b.h).toFixed(2); });
  assert.ok(new Set(aasp).size >= 7, 'animal silhouettes differ: ' + aasp);
  // the palette is read from TM.PALETTE when it exists at draw time
  TM.PALETTE = { red: { base: '#111111', dark: '#000000', light: '#222222' } };
  assert.strictEqual(A.pal('red').base, '#111111'); assert.strictEqual(A.pal('blue').base, '#3C8DE8');
  delete TM.PALETTE;

  // boards: every scene × season × options, odd sizes
  for (const sc of SCENES.concat(OLD_SCENES, ['nope', undefined])) for (let s = -1; s <= 4; s++) for (const o of [{}, { shine: 0.5, alive: 1, t: 12.3, frame: 22 }, { shine: 1, frame: 0 }]) {
    for (const bd of [{ w: 900, h: 514, r: 26 }, { w: 672, h: 524, r: 26 }, { w: 30, h: 20 }]) {
      const ctx = fakeCtx(); A.drawBoard(ctx, bd, sc, s, o); balanced(ctx, 'board ' + sc + ' ' + s); checks++;
    }
  }
  A.drawBoard(fakeCtx(), null, 'cove', 0); A.drawBoard(fakeCtx(), { w: 0, h: 0 }, 'cove', 0);
  for (const sc of SCENES.concat(OLD_SCENES, ['nope'])) for (const fl of [false, true]) {
    const bz = A.sceneBusy(sc, 900, 514, { flip: fl });
    assert.ok(Array.isArray(bz) && bz.length >= 1, 'sceneBusy ' + sc);
    for (const r of bz) assert.ok([r.x, r.y, r.w, r.h].every(Number.isFinite) && r.w > 0 && r.h > 0, 'sceneBusy box ' + sc);
  }
  // chest / scroll / fish
  for (const sz of [0, 40, 160, 300]) for (const op of [0, 0.25, 0.5, 0.75, 1, -1, 2]) for (const tt of [0, 1.7]) {
    const ctx = fakeCtx(); A.drawChest(ctx, sz, op, tt); balanced(ctx, 'chest'); checks++;
  }
  A.drawChest(fakeCtx()); A.drawChest(null, 100, 1);
  for (const [w, r] of [[0, 0], [300, 20], [900, 40], [50, 2]]) { const ctx = fakeCtx(); A.drawScroll(ctx, w, r); balanced(ctx, 'scroll'); checks++; }
  A.drawScroll(fakeCtx());
  for (const sz of [0, 30, 80]) for (const a of [0, 0.01, 0.5, 1, 3]) { const ctx = fakeCtx(); A.drawFish(ctx, sz, a); balanced(ctx, 'fish'); checks++; }
  A.drawFish(fakeCtx());
  // tray
  const tray = { x: 250, y: 500, w: 1000, h: 208, spots: [{ x: 320, y: 580 }, { x: 470, y: 580 }] };
  for (let s = -1; s < 6; s++) for (const o of [{}, { item: 134, t: 3 }]) { const ctx = fakeCtx(); A.drawTray(ctx, tray, s, o); balanced(ctx, 'tray'); checks++; }
  A.drawTray(fakeCtx(), { x: 0, y: 0, w: 300, h: 150 }, 2); A.drawTray(fakeCtx(), { x: 0, y: 0, w: 60, h: 20, spots: [{ x: 5, y: 5 }] }, 1, { t: 9 }); A.drawTray(fakeCtx(), null, 0);
  // bubbles
  for (const p of [0, 0.01, 0.3, 0.8, 1, 2]) for (const rr of [0, 8, 44]) { const ctx = fakeCtx(); A.drawBubble(ctx, rr, { pop: p, t: p * 3 }); balanced(ctx, 'bubble'); checks++; }
  A.drawBubble(fakeCtx(), 30);
  // icons
  const icons = [{ kind: 'number', n: 7 }, { kind: 'number', n: 12 }, { kind: 'number' }, { kind: 'letter', text: 'Ă' }, { kind: 'nope' },
    { kind: 'size', big: true, obj: 'boat', color: 'red' }, { kind: 'size', big: false, obj: 'kite', color: 'blue' }, { kind: 'size', big: true, animal: 'turtle' }, { kind: 'size', size: 'small' }, { kind: 'coins', n: 3 }];
  for (const c of COLORS.concat(['nope'])) icons.push({ kind: 'color', color: c });
  for (const t of icons) for (const sz of [60, 120]) { const ctx = fakeCtx(); A.drawIcon(ctx, t, sz); balanced(ctx, 'icon ' + JSON.stringify(t)); checks++; }
  A.drawIcon(fakeCtx(), null, 100);
  // ghost hand
  for (const p of [0, 0.3, 1, -1, 2]) { const ctx = fakeCtx(); A.drawGhostHand(ctx, 110, p); balanced(ctx, 'hand'); checks++; }
  A.drawPiece(fakeCtx(), null, 50); A.drawShadow(fakeCtx(), { kind: 'obj', obj: 'boat' }, 0);
  A.clearCache();
  A.drawPiece(fakeCtx(), { kind: 'obj', obj: 'boat', color: 'red' }, 112, {});
}

try {
  run(false);
  run(true);
  console.log('puzzle_art.test.js: OK (' + checks + ' draw checks, with and without Path2D)');
} catch (e) {
  console.error('puzzle_art.test.js: FAIL\n', e && e.stack || e);
  process.exit(1);
}
