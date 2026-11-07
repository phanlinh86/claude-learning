#!/usr/bin/env node
// Nini's Sea Painting — SP.Pictures unit tests (character artist B). Run from the game folder root:
//   node tests/unit/pictures.test.js      (exit 1 on any failure)
'use strict';
const assert = require('assert');
const path = require('path');
const { load } = require('./load');

const SP = load(['pictures.js']);
const P = SP.Pictures;
const PAD = 14;   // CONFIG.hitPad (DESIGN §2)
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const J = v => JSON.parse(JSON.stringify(v));

// every valid opt per kind
function optsFor(kind, id) {
  const t = P.TEMPLATES[id];
  if (kind === 'parts') return [{}];
  if (kind === 'shapes') {
    const out = [];
    for (let n = 1; n <= t.maxSlots; n++) for (let s = 0; s < SP.SHAPES.length; s++)
      out.push({ shapes: Array.from({ length: n }, (_, i) => SP.SHAPES[(s + i * 3) % SP.SHAPES.length]) });
    return out;
  }
  if (kind === 'count') { const out = []; for (let n = 1; n <= 12; n++) for (const seed of [1, 2, 7, 42, 'abc', 99991]) out.push({ n, seed }); return out; }
  if (kind === 'scene') {
    const A = SP.SEA_ANIMALS, out = [];
    for (let n = 1; n <= 4; n++) for (let s = 0; s < A.length; s++) out.push({ animals: Array.from({ length: n }, (_, i) => A[(s + i * 3) % A.length]) });
    for (const a of A) { out.push({ animals: [a, a], sizes: ['big', 'small'] }); out.push({ animals: [a, a], sizes: ['small', 'big'] }); }
    return out;
  }
  if (kind === 'labels') {
    const out = [];
    for (let n = 2; n <= 5; n++) {
      out.push({ labels: 'ABCDE'.slice(0, n).split(''), kind: 'letter' });
      out.push({ labels: ['12', '7', '20', '3', '9'].slice(0, n), kind: 'number' });
      out.push({ labels: ['b', 'd', 'q', 'm', 'w'].slice(0, n), kind: 'letter' });
    }
    return out;
  }
  return [];
}
const KINDS = ['parts', 'shapes', 'count', 'scene', 'labels'];
function each(fn) { for (const k of KINDS) for (const id of P.list(k)) for (const o of optsFor(k, id)) fn(k, id, o, P.build(id, o)); }

test('exports', () => {
  assert.deepStrictEqual(J(SP.SHAPES), ['circle', 'square', 'triangle', 'star', 'heart', 'rect', 'diamond', 'oval']);
  assert.deepStrictEqual(J(SP.SEA_ANIMALS), ['fish', 'crab', 'octopus', 'starfish', 'jellyfish', 'seahorse', 'whale', 'dolphin']);
  assert.ok(Array.isArray(SP.PART_NAMES) && SP.PART_NAMES.length >= 10);
  for (const f of ['list', 'build', 'hit', 'validate']) assert.strictEqual(typeof P[f], 'function');
});
test('template counts per kind (DESIGN §4.2)', () => {
  assert.ok(P.list('parts').length >= 10); assert.ok(P.list('shapes').length >= 4); assert.ok(P.list('count').length >= 4);
  assert.ok(P.list('scene').length >= 3); assert.ok(P.list('labels').length >= 2);
  for (const k of KINDS) for (const id of P.list(k)) assert.strictEqual(P.TEMPLATES[id].kind, k);
});
test('every template builds for every valid opt and validates', () => {
  let n = 0;
  each((k, id, o, pic) => { n++; const r = P.validate(pic); assert.strictEqual(r, null, id + ' ' + JSON.stringify(o) + ': ' + r); assert.strictEqual(pic.kind, k); });
  assert.ok(n > 500, 'built ' + n);
});
test('parts are inside the 600 × 400 box, sized for small fingers, with good fields', () => {
  each((k, id, o, pic) => {
    assert.strictEqual(pic.w, 600); assert.strictEqual(pic.h, 400);
    assert.ok(['swim', 'scuttle', 'sail', 'bob', 'float'].includes(pic.alive));
    assert.ok(pic.parts.length >= 1 && pic.parts.length <= 14);
    for (const p of pic.parts) {
      const [x0, y0, x1, y1] = p.bbox;
      assert.ok(x0 >= 0 && y0 >= 0 && x1 <= 600 && y1 <= 400, id + '/' + p.id + ' outside');
      const min = p.role === 'label' ? 104 : p.role === 'spot' || p.role === 'shape' ? 60 : 70;
      if (p.role === 'spot') assert.ok(p.hit.rx * 2 >= min, id + '/' + p.id + ' spot too small');
      else assert.ok(x1 - x0 >= min && y1 - y0 >= min, id + '/' + p.id + ' too small');
      assert.ok(/^#[0-9A-Fa-f]{6}$/.test(p.def), id + '/' + p.id + ' def');
      assert.ok(typeof p.d === 'string' && /^M /.test(p.d));
      assert.ok(p.area > 0);
      assert.ok(['part', 'shape', 'spot', 'animal', 'label'].includes(p.role));
      if (k === 'parts') assert.ok(SP.PART_NAMES.includes(p.nameValue), id + '/' + p.id + ' name');
      if (k === 'shapes' && p.role === 'shape') assert.ok(SP.SHAPES.includes(p.nameValue) && p.nameKind === 'shape');
      if (k === 'count' && p.role === 'spot') assert.strictEqual(p.nameKind, 'spot');
      if (k === 'scene' && p.role === 'animal') assert.ok(SP.SEA_ANIMALS.includes(p.nameValue));
    }
    for (let i = 1; i < pic.parts.length; i++) assert.ok(pic.parts[i - 1].area >= pic.parts[i].area, 'sorted by area');
    for (const d of pic.deco) assert.ok(typeof d.d === 'string' && (d.fill || d.stroke));
  });
});
test('the safe tap point (cx, cy) hits that part — with and without the hit pad', () => {
  each((k, id, o, pic) => {
    for (const p of pic.parts) {
      assert.strictEqual(P.hit(pic, p.cx, p.cy, 0), p.id, id + '/' + p.id + ' pad 0');
      assert.strictEqual(P.hit(pic, p.cx, p.cy, PAD), p.id, id + '/' + p.id + ' pad ' + PAD);
      for (const [dx, dy] of [[6, 0], [-6, 0], [0, 6], [0, -6]]) assert.strictEqual(P.hit(pic, p.cx + dx, p.cy + dy, PAD), p.id, id + '/' + p.id + ' jitter');
    }
  });
});
test('hit: empty canvas → null; pad catches near misses; smallest area wins', () => {
  const fish = P.build('fish');
  assert.strictEqual(P.hit(fish, 590, 390, 0), null);
  assert.strictEqual(P.hit(fish, 590, 390, PAD), null);
  const body = fish.parts.find(p => p.id === 'body');   // ellipse hit
  assert.strictEqual(body.hit.type, 'ellipse');
  const x = body.hit.cx + body.hit.rx + 8, y = body.hit.cy;
  assert.strictEqual(P.hit(fish, x, y, 0), null);
  assert.strictEqual(P.hit(fish, x, y, PAD), 'body');
  const star = P.build('starfish'), spots = star.parts.find(p => p.id === 'spots');
  assert.strictEqual(P.hit(star, spots.cx, spots.cy, PAD), 'spots');   // spots sit on the star: the smaller part wins
  const claws = P.build('crab').parts.find(p => p.id === 'claws');
  assert.strictEqual(claws.hit.type, 'multi');
  for (const h of claws.hit.list) { const q = h.pts[0]; void q; }
});
test('deterministic: same id + opt → identical pic; count seeds change the layout', () => {
  each((k, id, o, pic) => assert.deepStrictEqual(J(P.build(id, o)), J(pic)));
  for (const id of P.list('count')) {
    const a = J(P.build(id, { n: 6, seed: 1 })), b = J(P.build(id, { n: 6, seed: 2 }));
    assert.notDeepStrictEqual(a.parts.map(p => [p.cx, p.cy]), b.parts.map(p => [p.cx, p.cy]), id + ' seeds');
    assert.ok(P.TEMPLATES[id].spotName && a.spotName === P.TEMPLATES[id].spotName);
  }
});
test('count: exactly n non-overlapping spots, r ≥ 30, plus one figure', () => {
  for (const id of P.list('count')) for (let n = 1; n <= 12; n++) for (const seed of [3, 11, 'x']) {
    const pic = P.build(id, { n, seed }), spots = pic.parts.filter(p => p.role === 'spot');
    assert.strictEqual(spots.length, n);
    assert.strictEqual(pic.parts.filter(p => p.role === 'part').length, 1);
    for (const s of spots) assert.ok(s.hit.rx >= 30);
    for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) {
      const a = spots[i].hit, b = spots[j].hit;
      assert.ok(Math.hypot(a.cx - b.cx, a.cy - b.cy) >= a.rx + b.rx + 6, id + ' spots overlap');
    }
  }
  assert.throws(() => P.build('whale_bubbles', { n: 13 }));
  assert.throws(() => P.build('whale_bubbles', { n: 0 }));
});
test('shapes: every shape at every slot of every template', () => {
  for (const id of P.list('shapes')) {
    const max = P.TEMPLATES[id].maxSlots;
    assert.ok(max >= 3 && max <= 5, id + ' slots');
    for (let slot = 0; slot < max; slot++) for (const sh of SP.SHAPES) {
      const shapes = Array.from({ length: max }, (_, i) => SP.SHAPES[(i * 5 + 1) % 8]); shapes[slot] = sh;
      const pic = P.build(id, { shapes });
      assert.strictEqual(P.validate(pic), null, id + ' ' + shapes.join(','));
      const p = pic.parts.find(q => q.id === 's' + slot);
      assert.strictEqual(p.nameValue, sh); assert.strictEqual(P.hit(pic, p.cx, p.cy, PAD), p.id);
    }
    assert.strictEqual(P.build(id, { shapes: ['circle', 'star'] }).parts.filter(p => p.role === 'part').length, 1, id + ' body part');
  }
  assert.throws(() => P.build('sub_windows', { shapes: ['circle', 'blob'] }));
});
test('scene: big ≈ 1.6 × small, animals do not overlap', () => {
  for (const id of P.list('scene')) for (const a of SP.SEA_ANIMALS) {
    const pic = P.build(id, { animals: [a, a], sizes: ['big', 'small'] });
    const big = pic.parts.find(p => p.size === 'big'), small = pic.parts.find(p => p.size === 'small');
    const r = (big.bbox[2] - big.bbox[0]) / (small.bbox[2] - small.bbox[0]);
    assert.ok(r > 1.45 && r < 1.8, id + ' ' + a + ' ratio ' + r);
    assert.ok(small.bbox[2] - small.bbox[0] >= 110 || small.bbox[3] - small.bbox[1] >= 110, id + ' ' + a + ' small readable');
  }
});
test('labels: text, nameKind from opt.kind, numbers as numbers, r ≥ 52', () => {
  for (const id of P.list('labels')) {
    const pic = P.build(id, { labels: ['3', '12', '7'], kind: 'number' }), L = pic.parts.filter(p => p.role === 'label');
    assert.strictEqual(L.length, 3);
    assert.deepStrictEqual(J(L.map(p => p.nameValue).sort((a, b) => a - b)), [3, 7, 12]);
    for (const p of L) { assert.strictEqual(p.nameKind, 'number'); assert.ok(p.hit.rx >= 52); assert.ok(['3', '12', '7'].includes(p.text)); }
    const q = P.build(id, { labels: ['B', 'D', 'P', 'R'] });
    assert.ok(q.parts.filter(p => p.role === 'label').every(p => p.nameKind === 'letter' && p.text === p.nameValue));
  }
});
test('validate catches broken pics', () => {
  const pic = J(P.build('fish'));
  assert.strictEqual(P.validate(null), 'no parts');
  const a = J(pic); a.parts[0].def = 'blue'; assert.ok(P.validate(a));
  const b = J(pic); b.parts[0].cx = 2; b.parts[0].cy = 2; assert.ok(P.validate(b));
  const c = J(pic); c.parts[1].id = c.parts[0].id; assert.ok(P.validate(c));
  const d = J(P.build('reef', { animals: ['fish', 'crab'] })); d.parts[1].hit = d.parts[0].hit; d.parts[1].cx = d.parts[0].cx; d.parts[1].cy = d.parts[0].cy;
  assert.ok(P.validate(d));
});
test('loads in plain node with global (no window)', () => {
  const g = global; delete g.SP;
  require(path.join(__dirname, '..', '..', 'game', 'js', 'pictures.js'));
  assert.ok(g.SP && g.SP.Pictures && g.SP.Pictures.list('parts').length >= 10);
  delete g.SP;
});
test('paint_art loads headless (no DOM) and exposes the API', () => {
  const S2 = load(['pictures.js', 'paint_art.js']);
  for (const f of ['drawCanvasFrame', 'drawPicture', 'drawPaintShell', 'drawBrush', 'drawSplash', 'drawIcon', 'drawGhostHand'])
    assert.strictEqual(typeof S2.PaintArt[f], 'function', f);
  assert.strictEqual(S2.PaintArt.pal('red').base, '#E84A4A');
  assert.strictEqual(S2.PaintArt.pal('#123456').base, '#123456');
  assert.strictEqual(S2.PaintArt.pal('nope'), null);
});

let fail = 0;
const only = process.argv[2];
for (const t of tests) {
  if (only && !t.name.includes(only)) continue;
  try { t.fn(); console.log('ok   ' + t.name); } catch (e) { fail++; console.log('FAIL ' + t.name + '\n     ' + (e && e.message)); }
}
console.log(fail ? fail + ' failed' : 'all pictures tests passed');
process.exit(fail ? 1 : 0);
