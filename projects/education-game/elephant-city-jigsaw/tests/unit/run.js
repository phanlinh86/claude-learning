#!/usr/bin/env node
// Pom's Puzzle Town — headless unit tests for rng / content / world / weather / bot.
// Run from the game folder:   node tests/unit/run.js [name part]      (exit 1 on any failure)
// (tests/unit/i18n_voice.test.js and puzzle_art.test.js are the other engineers' suites and run on their own.)
'use strict';
const assert = require('assert');
const { load } = require('./load');

const PZ = load();
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const H = 1 / 120;
const AGES = [3, 4, 5, 6, 7];
const C = PZ.Content;
const CFG = PZ.CONFIG;
const TOPICS = C.TOPICS;
const J = v => JSON.parse(JSON.stringify(v));   // objects from the vm sandbox have other prototypes
assert.deepStrictEqual = ((orig) => (a, b, m) => orig(J(a), J(b), m))(assert.deepStrictEqual);

// independent copies of the DESIGN tables (§3, §5.1)
const AGE_TOPICS = { 3: ['colors', 'shapes', 'size', 'animals'], 4: ['colors', 'shapes', 'count', 'animals'],
  5: ['shapes', 'count', 'letters', 'animals'], 6: ['lower', 'initial', 'add', 'count'], 7: ['initial', 'add', 'sub', 'oddeven'] };
const SCENES = { colors: 'street', shapes: 'shapes', size: 'size', count: 'balloons', animals: 'park', letters: 'letters',
  lower: 'letters', initial: 'park', add: 'letters', sub: 'letters', oddeven: 'letters' };
const CLASH = [['blue', 'purple'], ['red', 'green'], ['yellow', 'orange'], ['green', 'orange'], ['red', 'orange']];
const HEX = { red: '#E84A4A', blue: '#3C8DE8', yellow: '#FFD23F', green: '#4CC26B', orange: '#FF9A2E', purple: '#8E44AD', pink: '#FF8FC0' };
const SKY = { spring: ['#BFE3F5', '#FDEFF4'], summer: ['#79C6EF', '#D3F0FB'], autumn: ['#F3C08E', '#FCE7C8'], winter: ['#B9C8DC', '#EDF1F6'] };
// DESIGN §4.3 particle files (particles/<name>.svg)
const SPRITES = ['petal', 'leaf_a', 'leaf_b', 'snow', 'mote', 'sparkle', 'star', 'confetti_a', 'confetti_b', 'dot', 'feather', 'dust'];
const ICON_KINDS = ['obj', 'shape', 'bunch', 'dots', 'animal', 'glyph', 'number', 'color', 'size'];
const ITEM = { 3: 112, 4: 112, 5: 112, 6: 104, 7: 104 }, ITEM_MIN = { 3: 112, 4: 112, 5: 104, 6: 96, 7: 96 };
const MAXSLOTS = { 3: 2, 4: 3, 5: 4, 6: 4, 7: 4 }, MAXPIECES = { 3: 3, 4: 4, 5: 5, 6: 5, 7: 5 };
const VIEWPORTS = [
  { W: 1556, H: 720, ins: null, name: 'iPhone landscape' },
  { W: 1556, H: 720, ins: { top: 0, right: 108, bottom: 38, left: 108 }, name: 'iPhone landscape notch' },
  { W: 720, H: 1556, ins: null, name: 'iPhone portrait' },
  { W: 720, H: 1556, ins: { top: 108, right: 0, bottom: 62, left: 0 }, name: 'iPhone portrait notch' },
  { W: 960, H: 720, ins: null, name: 'iPad landscape 4:3' },
  { W: 960, H: 720, ins: { top: 32, right: 0, bottom: 27, left: 0 }, name: 'iPad landscape insets' },
  { W: 720, H: 960, ins: null, name: 'iPad portrait' },
  { W: 720, H: 960, ins: { top: 32, right: 0, bottom: 27, left: 0 }, name: 'iPad portrait insets' },
  { W: 1036, H: 720, ins: null, name: 'iPad Air landscape' },
  { W: 1036, H: 720, ins: { top: 18, right: 0, bottom: 14, left: 0 }, name: 'iPad Air 1180×820' },
  { W: 720, H: 1036, ins: null, name: 'iPad Air portrait' },
  { W: 720, H: 1036, ins: { top: 20, right: 0, bottom: 18, left: 0 }, name: 'iPad 820×1180 portrait' },
  { W: 1280, H: 720, ins: null, name: '16:9' },
  { W: 1600, H: 720, ins: null, name: '1600×720' },
  { W: 720, H: 1600, ins: { top: 44, right: 0, bottom: 34, left: 0 }, name: '720×1600 tall insets' },
  { W: 720, H: 1280, ins: { top: 37, right: 0, bottom: 0, left: 0 }, name: 'iPhone SE portrait' },
  { W: 1280, H: 720, ins: { top: 0, right: 37, bottom: 21, left: 37 }, name: 'iPhone SE landscape' }
];
const VP = VIEWPORTS[4];

// ---------- helpers ----------
function mkWorld(o) {
  o = o || {};
  const cfg = Object.assign(o.surprise ? {} : { surpriseTypes: [] }, o.config || {});
  const w = new PZ.World({ seed: o.seed || 1, age: o.age || 4, lang: o.lang || 'en', config: cfg });
  const v = o.vp || VP;
  w.setViewport(v.W, v.H, v.ins);
  w.newSession(); w.drainEvents();
  return w;
}
/** Starts round `ri` of `topic` in chapter `level` directly (skips the intro) and runs to the first ask. */
function roundOf(w, topic, ri, o) {
  o = o || {};
  w.levels = [topic, topic, topic, topic];
  w.startLevel(o.level === undefined ? 1 : o.level); w.round = ri || 0;
  w._surpriseRound = ri || 0; w.cfg.surpriseTypes = o.surprise ? [o.surprise] : [];
  w._beginRound();
  until(w, () => w.interactive);
  return w;
}
function roundWhere(o, topic, ri, pred, ro) {
  for (let s = 1; s < 400; s++) {
    const w = mkWorld(Object.assign({}, o, { seed: s }));
    roundOf(w, topic, ri, ro);
    if (pred(w.cur, w)) return w;
  }
  throw new Error('no round found for ' + topic);
}
function run(w, s, each) { const n = Math.round(s / H); for (let i = 0; i < n; i++) { if (each) each(i); w.update(H); } }
function until(w, fn, max) { let n = 0; while (!fn() && n++ < (max || 36000)) w.update(H); assert.ok(fn(), 'condition not reached (now ' + w.state + '/' + w.phase + ')'); }
function evs(w) { return w.drainEvents(); }
function types(e) { return e.map(x => x.type); }
/** A real drag through the input API: press the piece's centre, 10 moves over 0.4 s to (tx, ty), hold `hold` s, let go there. */
function drag(w, id, tx, ty, o) {
  o = o || {};
  const h = w.pieceHit(id), x0 = o.px !== undefined ? o.px : h.x, y0 = o.py !== undefined ? o.py : h.y;
  const d = w.pointerDown(x0, y0);
  if (d !== 'grab') return 'down:' + d;
  for (let k = 1; k <= 10; k++) { w.pointerMove(x0 + (tx - x0) * k / 10, y0 + (ty - y0) * k / 10); run(w, 0.04, o.each); }
  run(w, o.hold === undefined ? 0.3 : o.hold, o.each);
  return w.pointerUp(tx, ty);
}
function tapPiece(w, id) { const h = w.pieceHit(id); w.pointerDown(h.x, h.y); run(w, 0.1); return w.pointerUp(h.x + 3, h.y + 2); }
function placeRight(w) {
  const a = w.answer(); assert.ok(a, 'an answer');
  const s = w.slotDrop(a.slot), r = drag(w, a.piece, s.x, s.y);
  assert.strictEqual(r, 'snap');
  const out = [];
  until(w, () => { out.push(...evs(w)); return w.pieceById(a.piece).state === 'placed'; });
  return out;
}
function solveRound(w) {
  for (let k = 0; k < 40 && w.state === 'round'; k++) {
    if (w.interactive) placeRight(w); else w.update(H);
    until(w, () => w.interactive || w.state !== 'round');
  }
}
/** A board point outside every unfilled slot's zone (for near misses / wrong drops). */
function freeBoardPoint(w, avoid) {
  const B = w.layout.board;
  for (let k = 0; k < 400; k++) {
    const x = B.x + 10 + (k * 37 % Math.max(1, Math.floor(B.w - 20))), y = B.y + 10 + (k * 53 % Math.max(1, Math.floor(B.h - 20)));
    if (!w.slots.some(s => inside(w.slotZone(s.id), x, y, 14))) return { x, y };
  }
  return null;
}
function inside(b, x, y, pad) { pad = pad || 0; return x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad; }
function overlap(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
function rectDist(a, b) {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w)), dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
  return Math.hypot(dx, dy);
}
function circleBox(c, b) { const nx = Math.max(b.x, Math.min(c.x, b.x + b.w)), ny = Math.max(b.y, Math.min(c.y, b.y + b.h)); return Math.hypot(c.x - nx, c.y - ny) < c.r; }
/** Independent matcher (DESIGN §5.1): does piece thing `t` answer step `s` of round r? */
function myMatch(r, s, t) {
  const p = s.params;
  switch (r.topic) {
    case 'colors': return t.kind === 'obj' && t.color === p.color;
    case 'shapes': return t.kind === 'shape' && t.shape === p.shape && (r.age < 5 || t.color === p.color);
    case 'size': return t.obj === p.obj && t.size === p.size;
    case 'animals': return t.animal === p.animal;
    case 'initial': return C.initialOf(t.animal, r.lang) === p.letter;
    case 'count': return t.n === p.n;
    case 'letters': return t.text === p.letter;
    case 'lower': return t.text === p.small && p.letter === p.small.toUpperCase();
    case 'add': return t.n === p.a + p.b;
    case 'sub': return t.n === p.a - p.b;
    case 'oddeven': return (t.n % 2 ? 'odd' : 'even') === p.parity;
  }
}

// =====================================================================================================================
test('rng: deterministic, ranges, fork', () => {
  const a = new PZ.RNG(42), b = new PZ.RNG(42);
  for (let i = 0; i < 100; i++) assert.strictEqual(a.next(), b.next());
  const r = new PZ.RNG('x');
  for (let i = 0; i < 1000; i++) { const v = r.int(2, 5); assert.ok(v >= 2 && v <= 5); const f = r.float(1, 2); assert.ok(f >= 1 && f < 2); }
  assert.strictEqual(new PZ.RNG(1).sample([1, 2, 3, 4], 3).length, 3);
  assert.notStrictEqual(new PZ.RNG(7).fork(1).next(), new PZ.RNG(7).fork(2).next());
});

test('logical size: short side 720, long side clamped 960–1600', () => {
  const L = PZ.World.logicalSize;
  assert.deepStrictEqual(L(1024, 768), { W: 960, H: 720 });
  assert.deepStrictEqual(L(852, 393), { W: 1561, H: 720 });
  assert.deepStrictEqual(L(393, 852), { W: 720, H: 1561 });
  assert.deepStrictEqual(L(3000, 500), { W: 1600, H: 720 });
  assert.deepStrictEqual(L(768, 1024), { W: 720, H: 960 });
  assert.deepStrictEqual(L(1180, 820), { W: 1036, H: 720 });
});

// ---------------------------------------------------------------- layout
test('layout: DESIGN §2 boxes (ground, bubble, HUD, Pom, board, tray, item size) on every viewport × age', () => {
  for (const v of VIEWPORTS) for (const age of AGES) {
    const L = PZ.World.computeLayout(v.W, v.H, v.ins, null, age), ins = L.ins, P = v.H > v.W;
    assert.strictEqual(L.portrait, P);
    assert.strictEqual(L.groundY, v.H - ins.bottom - (P ? 26 : 14));
    assert.strictEqual(L.bubble.x, ins.left + 24);
    if (P) { assert.strictEqual(L.bubble.y, ins.top + 110); assert.strictEqual(L.bubble.h, 124); }
    else { assert.strictEqual(L.bubble.y, ins.top + 18); assert.strictEqual(L.bubble.h, 134); assert.ok(L.bubble.w <= 560); }
    assert.strictEqual(L.hud.x, v.W - ins.right - 160);
    assert.strictEqual(L.pom.x, ins.left + (P ? 104 : 118)); assert.strictEqual(L.pom.y, L.groundY - 4); assert.strictEqual(L.pom.h, P ? 200 : 230);
    const phone = (P ? v.H / v.W : v.W / v.H) > 1.9, tall = v.H / v.W > 1.6;
    assert.strictEqual(L.phone, phone); assert.strictEqual(L.tall, tall);
    const base = ITEM[age];
    assert.ok([base, Math.round(base * 1.2), ITEM_MIN[age]].includes(L.item), v.name + ' item ' + L.item);
    if (!phone && !tall) assert.ok(L.item === base || L.item === ITEM_MIN[age], v.name + ': base item');
    if ((phone || tall) && !v.ins) assert.strictEqual(L.item, Math.round(base * 1.2), v.name + ' age ' + age + ': big item ' + L.item);
    assert.ok(L.fits, v.name + ' age ' + age + ' fits');
    assert.strictEqual(L.frame, 22); assert.strictEqual(L.board.r, 26); assert.strictEqual(L.slotScale, 1);
    const B = L.board;
    if (!P) {
      const x0 = ins.left + 250, x1 = v.W - ins.right - 30;
      const maxS = age <= 4 ? L.item * 1.25 : L.item;
      assert.ok(Math.abs(L.tray.y - Math.min(v.H - ins.bottom - L.item - (phone ? 76 : 96), L.groundY - 8 - 44 - maxS)) < 1e-9, 'tray y');
      assert.ok(L.tray.rows[0].y <= L.groundY - 8 + 1e-9, 'ledge above the home indicator');
      assert.ok(Math.abs(B.y - Math.max(ins.top + 152, L.bubble.y + L.bubble.h + 30)) < 1e-9, 'board y');
      assert.ok(Math.abs(B.y + B.h - (L.tray.y - 30)) < 1e-9, 'board bottom = tray − 30');
      assert.ok(Math.abs(B.w - Math.min(x1 - x0, (phone ? 2.5 : 1.75) * B.h)) < 1e-9, 'board w');
      assert.ok(Math.abs(B.x + B.w / 2 - (x0 + x1) / 2) < 1e-9, 'board centred');
      assert.strictEqual(L.tray.rows.length, 1);
    } else {
      assert.strictEqual(B.x, ins.left + 24); assert.strictEqual(B.w, v.W - 48 - ins.left - ins.right);
      assert.ok(B.y >= L.bubble.y + L.bubble.h + 34 - 1e-9, 'board under the bubble');
      assert.ok(B.h <= 0.78 * B.w + 1e-9 && B.y + B.h <= L.tray.y - 30 + 1e-9, 'board height');
    }
  }
});

/** Every safety rule of DESIGN §2 + the skill for one layout: board / tray / slots / pieces on screen, clear of Pom, HUD, bubble;
 *  pieces ≥ 1.3 item apart; ≥ 44 px between resting pieces and every drop zone; slots ≥ 1.25 item apart inside the board. */
function checkLayout(L, age, label, seeds) {
  const ins = L.ins, safe = { x: ins.left, y: ins.top, w: L.W - ins.left - ins.right, h: L.H - ins.top - ins.bottom }, B = L.board;
  const pomBox = L.pomBox, keep = L.keep;
  const within = (b, S) => b.x >= S.x - 1e-6 && b.y >= S.y - 1e-6 && b.x + b.w <= S.x + S.w + 1e-6 && b.y + b.h <= S.y + S.h + 1e-6;
  const frame = { x: B.x - L.frame, y: B.y - L.frame, w: B.w + 2 * L.frame, h: B.h + 2 * L.frame };
  assert.ok(within(frame, { x: 0, y: 0, w: L.W, h: L.H }), label + ': the framed board on screen');
  assert.ok(within(B, safe), label + ': board inside the safe area');
  assert.ok(!overlap(frame, pomBox), label + ': board clear of Pom');
  for (const K of keep) assert.ok(!overlap(B, K), label + ': board under the ' + K.kind);
  assert.ok(B.h >= 2 * 0.6 * L.item, label + ': board tall enough');
  const zoneBoard = { x: B.x - 30, y: B.y - 30, w: B.w + 60, h: B.h + 60 };
  const sizesFor = big => big ? [L.item * 1.25, L.item * 0.8] : null;
  for (const big of age <= 4 ? [false, true] : [false]) {
    const maxS = big ? L.item * 1.25 : L.item;
    for (let n = 2; n <= MAXPIECES[age]; n++) {
      const spots = PZ.World.traySpots(L, n, maxS, null);
      assert.strictEqual(spots.length, n, label + ' spots');
      const boxes = spots.map((s, i) => { const sz = big && i === 0 ? maxS : L.item; return { x: s.x - sz / 2, y: s.y - sz, w: sz, h: sz, c: { x: s.x, y: s.y - sz / 2, r: 0.6 * sz + 26 } }; });
      boxes.forEach((b, i) => {
        assert.ok(within(b, safe), `${label} n ${n}: piece ${i} inside the safe area (${b.x.toFixed(0)},${b.y.toFixed(0)})`);
        assert.ok(b.y + b.h <= L.groundY + 1e-6, label + ': piece above the ground line');
        assert.ok(!overlap(b, pomBox), `${label} n ${n}: piece ${i} over Pom`);
        for (const K of keep) assert.ok(!overlap(b, K), label + ': piece under the ' + K.kind);
        assert.ok(rectDist(b, zoneBoard) >= 44 - 1e-6, `${label} n ${n}: piece ${i} only ${rectDist(b, zoneBoard).toFixed(1)} px from the board drop zone`);
        for (let j = 0; j < i; j++) assert.ok(Math.hypot(b.c.x - boxes[j].c.x, b.c.y - boxes[j].c.y) >= 1.3 * L.item - 1e-6, `${label} n ${n}: pieces ${j},${i} too close`);
      });
    }
  }
  for (let n = 2; n <= MAXSLOTS[age]; n++) for (const s of seeds) {
    const sizes = Array(n).fill(L.item), res = PZ.World.placeSlots(B, sizes, L.item, null, s);
    assert.ok(res.score >= -1e-6, `${label}: ${n} slots seed ${s} too close (${res.score.toFixed(1)})`);
    for (const p of res.pts) assert.ok(inside({ x: B.x + L.item / 2, y: B.y + L.item / 2, w: B.w - L.item, h: B.h - L.item }, p.x, p.y, 1e-6), label + ': slot inside the board');
  }
  if (age <= 4) for (const s of seeds) { const r2 = PZ.World.placeSlots(B, sizesFor(true), L.item, null, s); assert.ok(r2.score >= 0, label + ': big & small slots'); }
}
test('layout: every viewport × age — board, tray spots, slots on screen, clear of Pom / HUD / bubble, ≥ 44 px from drop zones, spaced', () => {
  for (const v of VIEWPORTS) for (const age of AGES) checkLayout(PZ.World.computeLayout(v.W, v.H, v.ins, null, age), age, `${v.name} age ${age}`, [1, 2, 3, 77, 991]);
});

test('layout: fuzz 400 random aspects + device-like safe insets + measured HUD boxes', () => {
  const r = new PZ.RNG(5);
  for (let i = 0; i < 400; i++) {
    const land = r.chance(0.5), long = r.int(960, 1600);
    const W = land ? long : 720, H = land ? 720 : long;
    const ins = land ? (long >= 1400 ? { top: r.int(0, 20), right: r.int(0, 110), bottom: r.int(0, 40), left: r.int(0, 110) } : { top: r.int(0, 32), right: 0, bottom: r.int(0, 27), left: 0 })
      : long >= 1400 ? { top: r.int(0, 110), right: 0, bottom: r.int(0, 62), left: 0 } : { top: r.int(0, 40), right: 0, bottom: r.int(0, 34), left: 0 };
    const age = r.pick(AGES);
    const hk = r.chance(0.3) ? [{ x: W - ins.right - 150, y: ins.top + 4, w: 140, h: 60 }] : null;
    const L = PZ.World.computeLayout(W, H, ins, null, age, hk);
    assert.ok(L.fits || !L.portrait, `fuzz ${W}x${H} ${JSON.stringify(ins)} age ${age}: does not fit`);
    if (L.fits) checkLayout(L, age, `fuzz ${W}x${H} ${JSON.stringify(ins)} age ${age}`, [i + 1]);
  }
});

test('layout: the measured HUD pushes the portrait bubble and the board below it; landscape bubble narrows', () => {
  for (const c of [{ W: 720, H: 1561, ins: { top: 86, right: 0, bottom: 62, left: 0 }, hud: 214 }, { W: 720, H: 1280, ins: { top: 37, right: 0, bottom: 0, left: 0 }, hud: 173 },
    { W: 720, H: 960, ins: { top: 32, right: 0, bottom: 27, left: 0 }, hud: 110 }]) for (const age of AGES) {
    const hk = [{ x: c.W - 330, y: 0, w: 330, h: c.hud }];
    const L = PZ.World.computeLayout(c.W, c.H, c.ins, null, age, hk);
    assert.strictEqual(L.bubble.y, Math.max(c.ins.top + 110, c.hud + 8));
    assert.ok(L.board.y >= L.bubble.y + L.bubble.h + 34 - 1e-9);
    checkLayout(L, age, `HUD ${c.W}x${c.H} age ${age}`, [3]);
  }
  const L2 = PZ.World.computeLayout(960, 720, null, null, 4, [{ x: 960 - 420, y: 0, w: 420, h: 100 }]);
  assert.ok(L2.bubble.x + L2.bubble.w <= 960 - 420 - 12 + 1e-9 && L2.bubble.w >= 220);
});

test('layout: slot placement deterministic per seed, spread (farthest point), stored as (u, v) of the board', () => {
  const L = PZ.World.computeLayout(960, 720, null, null, 5);
  const a = PZ.World.placeSlots(L.board, [104, 104, 104, 104], 104, null, 9), b = PZ.World.placeSlots(L.board, [104, 104, 104, 104], 104, null, 9);
  assert.deepStrictEqual(a, b);
  assert.notDeepStrictEqual(J(a.pts), J(PZ.World.placeSlots(L.board, [104, 104, 104, 104], 104, null, 10).pts));
  const w = roundOf(mkWorld({ age: 5 }), 'animals', 2);
  for (const s of w.slots) {
    assert.ok(Math.abs(s.x - (w.layout.board.x + s.u * w.layout.board.w)) < 1e-6 && Math.abs(s.y - (w.layout.board.y + s.v * w.layout.board.h)) < 1e-6);
    assert.ok(s.u > 0 && s.u < 1 && s.v > 0 && s.v < 1);
  }
});

test('layout: piece hit circle r = 0.6 × size + 26, nearest centre wins, tray pieces only; Pom is not a piece', () => {
  for (const v of VIEWPORTS) {
    const w = roundOf(mkWorld({ vp: v, age: 5 }), 'letters', 2);
    for (const p of w.pieces) {
      const h = w.pieceHit(p.id);
      assert.ok(Math.abs(h.r - (0.6 * p.size + 26)) < 1e-9);
      assert.strictEqual(w._pieceAt(h.x, h.y), p, v.name + ': centre hits ' + p.id);
      for (let k = 0; k < 8; k++) {   // the edge of the circle: this piece, unless a neighbour's centre is nearer (circles may overlap; nearest wins)
        const ex = h.x + Math.cos(k * Math.PI / 4) * (h.r - 2), ey = h.y + Math.sin(k * Math.PI / 4) * (h.r - 2), q = w._pieceAt(ex, ey);
        assert.ok(q === p || (q && Math.hypot(ex - q.x, ey - q.y) < h.r - 2), 'edge of the circle');
      }
      assert.strictEqual(w._pieceAt(h.x, h.y - 0.5 * p.size), p, 'top of the piece');
      assert.ok(h.x - h.r >= -1 && h.x + h.r <= v.W + 1);
    }
    const b = w.pomHit();
    assert.strictEqual(w._pieceAt(b.x, b.y), null, 'Pom is not a piece');
    for (const s of w.slots) assert.strictEqual(w._pieceAt(s.x, s.y), null, 'a slot is not a tray piece');
  }
});

// ---------------------------------------------------------------- content
test('content: tables (palette hex, topics per age, scenes, shapes, animals, objects)', () => {
  for (const c in HEX) assert.strictEqual(PZ.PALETTE[c].base, HEX[c]);
  assert.deepStrictEqual(PZ.COLORS, ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink']);
  assert.deepStrictEqual(PZ.SHAPES, ['circle', 'square', 'triangle', 'star', 'heart', 'rect', 'diamond', 'oval']);
  assert.deepStrictEqual(PZ.ANIMALS, ['duck', 'cat', 'dog', 'cow', 'pig', 'frog', 'lion', 'rabbit']);
  assert.deepStrictEqual(PZ.OBJECTS, ['car', 'bus', 'balloon', 'kite', 'umbrella', 'house', 'flower', 'hat']);
  assert.deepStrictEqual(PZ.SCENES, SCENES);
  for (const a of AGES) { assert.deepStrictEqual(PZ.AGE_TOPICS[a], AGE_TOPICS[a]); assert.deepStrictEqual(C.topicsFor(a), AGE_TOPICS[a]); }
  for (const a of AGES) for (const t of PZ.AGE_TOPICS[a]) assert.ok(PZ.AGE_POOLS[a].includes(t));
  assert.strictEqual(C.maxSafe(4), 3);
});

test('content: every topic × age 3–7 × 160 seeds × rounds 0–3 × level 0/1 × EN/VI (≈ 35 000 rounds) is valid and completable', () => {
  let n = 0;
  for (const topic of TOPICS) for (const age of AGES) for (let s = 1; s <= 160; s++) for (let ri = 0; ri < 4; ri++) for (const level of [0, 1]) {
    const lang = s % 2 ? 'vi' : 'en', short = ri >= 2 && s % 7 === 0;
    const r = C.makeRound(topic, { age, lang, rng: new PZ.RNG(s * 31 + ri * 7 + level), roundIndex: ri, level, short });
    n++;
    const err = C.validate(r);
    assert.strictEqual(err, null, `${topic} age ${age} seed ${s} round ${ri}: ${err}`);
    assert.strictEqual(r.scene, SCENES[topic]);
    const real = r.pieces.filter(p => p.slot), extra = r.pieces.filter(p => !p.slot);
    assert.strictEqual(real.length, r.slots.length);
    if (PZ.AGE_POOLS[age].includes(topic)) assert.ok(r.pieces.length <= MAXPIECES[age] && r.slots.length <= MAXSLOTS[age], `${topic} age ${age}: counts fit the layout tables`);
    assert.ok(r.pieces.length <= 5);
    if (ri === 0 && topic !== 'oddeven') assert.ok(r.slots.length === 2 && !extra.length, 'warm-up 2 slots, no distractor');
    if (r.short && topic !== 'oddeven') assert.strictEqual(r.slots.length, 2);
    // simulate the round: at every find step exactly one still-unplaced piece answers (independent matcher)
    const placed = new Set();
    for (const st of r.steps) {
      const hits = r.pieces.filter(p => !placed.has(p.id) && myMatch(r, st, p.thing)).map(p => p.id);
      if (st.mode === 'find') assert.deepStrictEqual(hits, st.targets, `${topic} age ${age}: ${JSON.stringify(st.params)} → ${hits}`);
      else assert.deepStrictEqual(hits.sort(), st.targets.slice().sort());
      st.targets.forEach(id => placed.add(id));
    }
    assert.strictEqual(placed.size, r.slots.length, 'every slot gets filled');
    const cs = [...new Set(r.pieces.map(p => p.thing.color).filter(Boolean))];
    if (age < 5) { for (const [a, b] of CLASH) assert.ok(!(cs.includes(a) && cs.includes(b)), 'clash ' + a + '+' + b); assert.ok(!cs.includes('pink')); }
  }
  assert.ok(n > 30000);
});

test('content: slots / distractors per age as DESIGN §5.1 (later rounds)', () => {
  const want = { 3: [2, 2], 4: [3, 3], 5: [3, 4], 6: [4, 4], 7: [4, 4] };
  for (const age of AGES) for (const topic of ['animals', 'letters']) for (let s = 1; s < 60; s++) {
    if (topic === 'letters' && age < 5) continue;
    const r1 = C.makeRound(topic, { age, rng: new PZ.RNG(s), roundIndex: 2, level: 1 });
    assert.ok(r1.slots.length >= want[age][0] && r1.slots.length <= want[age][1], `age ${age} ${topic}: ${r1.slots.length} slots`);
    assert.strictEqual(r1.pieces.length - r1.slots.length, 1, 'one distractor from round 2');
    const r0 = C.makeRound(topic, { age, rng: new PZ.RNG(s), roundIndex: 1, level: 0 });
    if (age <= 4) assert.strictEqual(r0.pieces.length, r0.slots.length, 'first chapter at ages ≤ 4: no distractor');
  }
  // age 4 colours: only 3 clash-free colours fit → 2 slots + 1 distractor (first chapter 3 + 0)
  for (let s = 1; s < 40; s++) {
    const r = C.makeRound('colors', { age: 4, rng: new PZ.RNG(s), roundIndex: 2, level: 1 });
    assert.strictEqual(r.slots.length, 2); assert.strictEqual(r.pieces.length, 3);
    assert.strictEqual(C.makeRound('colors', { age: 4, rng: new PZ.RNG(s), roundIndex: 2, level: 0 }).slots.length, 3);
  }
  for (let s = 1; s < 40; s++) {   // age 3 distractor from round index 2, not in the first chapter
    assert.strictEqual(C.makeRound('animals', { age: 3, rng: new PZ.RNG(s), roundIndex: 1, level: 1 }).pieces.length, 2);
    assert.strictEqual(C.makeRound('animals', { age: 3, rng: new PZ.RNG(s), roundIndex: 2, level: 1 }).pieces.length, 3);
  }
});

test('content: deterministic per seed; variety; topic rules (count n, dots neighbours, lower b/d/p/q, size pair, shapes5)', () => {
  for (const topic of TOPICS) {
    const a = C.makeRound(topic, { age: 6, rng: new PZ.RNG(5), roundIndex: 2 }), b = C.makeRound(topic, { age: 6, rng: new PZ.RNG(5), roundIndex: 2 });
    assert.deepStrictEqual(a, b, topic);
  }
  for (const age of [3, 4, 5]) for (const topic of PZ.AGE_POOLS[age]) {
    const keys = new Set();
    for (let s = 0; s < 80; s++) keys.add(C.makeRound(topic, { age, rng: new PZ.RNG(s), roundIndex: 2 }).key);
    assert.ok(keys.size >= 12, `${topic} age ${age}: only ${keys.size} different sets`);
  }
  for (let s = 0; s < 200; s++) {
    const c0 = C.makeRound('count', { age: 4, rng: new PZ.RNG(s), roundIndex: 0 });
    assert.deepStrictEqual(c0.pieces.map(p => p.thing.n).sort(), [1, 2], 'warm-up 1 vs 2 balloons');
    assert.ok(c0.pieces.every(p => p.thing.kind === 'bunch'));
    const c5 = C.makeRound('count', { age: 5, rng: new PZ.RNG(s), roundIndex: 2 }), ns = c5.pieces.map(p => p.thing.n);
    for (let i = 0; i < ns.length; i++) for (let j = 0; j < i; j++) assert.ok(Math.abs(ns[i] - ns[j]) > 1, 'age 5 no neighbours ' + ns);
    assert.ok(c5.pieces.every(p => p.thing.kind === 'dots' && p.thing.n <= 10));
    assert.strictEqual(c5.steps[0].params.kind, 'dots');
    const lw = C.makeRound('lower', { age: 6, rng: new PZ.RNG(s), roundIndex: 2 }), tx = lw.pieces.map(p => p.thing.text);
    assert.ok(tx.filter(c => 'bdpq'.includes(c)).length <= 1, 'b/d/p/q ' + tx);
    assert.ok(!tx.includes('l') && !tx.includes('i'));
    const sz = C.makeRound('size', { age: 3, rng: new PZ.RNG(s), roundIndex: 2, level: 1 }), re = sz.pieces.filter(p => p.slot).map(p => p.thing);
    assert.strictEqual(re.length, 2); assert.strictEqual(re[0].obj, re[1].obj); assert.deepStrictEqual(re.map(t => t.size).sort(), ['big', 'small']);
    assert.ok(re.every(t => t.big === (t.size === 'big')));
    assert.ok(sz.steps.every(st => st.promptKey === 'p.size' && st.params.obj === re[0].obj));
    const s5 = C.makeRound('shapes', { age: 5, rng: new PZ.RNG(s), roundIndex: 2 });
    assert.ok(s5.steps.every(st => st.promptKey === 'p.shapes5' && st.params.color && st.params.shape));
    const oe = C.makeRound('oddeven', { age: 7, rng: new PZ.RNG(s), roundIndex: s % 3 });
    assert.strictEqual(oe.steps.length, 1); assert.strictEqual(oe.steps[0].mode, 'findAll');
    assert.ok(oe.steps[0].need >= 2 && oe.steps[0].need <= 3 && oe.pieces.length - oe.slots.length >= 1);
  }
});

test('content: Talk time for every topic × age (picture choices, the answer among them, 2 choices at age 3)', () => {
  for (const topic of TOPICS) for (const age of AGES) for (let s = 0; s < 40; s++) {
    const t = C.makeTalk(topic, { age, lang: s % 2 ? 'vi' : 'en', rng: new PZ.RNG(s) });
    assert.strictEqual(t.promptKey, 'talk.' + topic);
    assert.ok(t.choices.length >= 2 && t.choices.length <= 3);
    if (age === 3 && ['colors', 'shapes', 'animals', 'count', 'size'].includes(topic)) assert.strictEqual(t.choices.length, 2);
    assert.ok(t.choices.some(c => c.id === t.answer)); assert.strictEqual(t.answerId, t.answer);
    for (const c of t.choices) assert.ok(ICON_KINDS.includes(c.thing.kind), 'icon ' + c.thing.kind);
    if (t.show) assert.ok(ICON_KINDS.includes(t.show.kind));
    assert.strictEqual(new Set(t.choices.map(c => JSON.stringify(c.thing))).size, t.choices.length, 'choices differ');
  }
});

test('content: chapter topics rotate between sessions (the left-out topic comes back next session), always easiest first', () => {
  for (const age of AGES) {
    const r = new PZ.RNG(age), pool = PZ.AGE_POOLS[age];
    let prev = C.topicsFor(age, r, null);
    for (let k = 0; k < 6; k++) {
      const next = C.topicsFor(age, r, prev), left = pool.filter(t => !prev.includes(t));
      assert.ok(next.includes(left[0]), `age ${age}: the left-out topic ${left[0]} is played next session`);
      assert.strictEqual(new Set(next).size, 4);
      for (let i = 1; i < 4; i++) assert.ok(pool.indexOf(next[i - 1]) < pool.indexOf(next[i]), `age ${age}: ${next.join(' > ')} in difficulty order`);
      prev = next;
    }
  }
});

// ---------------------------------------------------------------- world: enter
test('world: enter — the board slides in on a spring (small overshoot), pieces drop + bounce into the tray, then the ask', () => {
  const w = mkWorld({ age: 4 });
  w.levels = ['animals', 'animals', 'animals', 'animals']; w.startLevel(1); w.round = 2; w._beginRound();
  let e = evs(w);
  assert.deepStrictEqual(types(e).filter(t => t !== 'level').slice(0, 2), ['round', 'boardIn']);
  const L = w.layout, ox0 = w.board.ox;
  assert.ok(ox0 >= L.W - L.board.x, 'the board starts off screen right');
  let minOx = 1e9, maxTilt = 0, lands = [], bounced = {}, prevVy = {};
  until(w, () => {
    minOx = Math.min(minOx, w.board.ox); maxTilt = Math.max(maxTilt, Math.abs(w.board.tilt));
    for (const p of w.pieces) { if (p.state === 'drop' && prevVy[p.id] > 0 && p.vy < 0) bounced[p.id] = true; prevVy[p.id] = p.vy; }
    for (const x of evs(w)) { if (x.type === 'pieceLand') lands.push(x); if (x.type === 'ask') e = x; }
    return w.phase === 'play';
  });
  assert.ok(minOx < 0 && minOx > -0.1 * ox0, 'a slight overshoot ' + minOx.toFixed(1));
  assert.ok(maxTilt > 0.005 && maxTilt <= 0.06 + 1e-9, 'tilt while sliding');
  assert.strictEqual(lands.length, w.pieces.length);
  assert.ok(lands.every(x => Number.isFinite(x.x) && Number.isFinite(x.y)));
  assert.strictEqual(Object.keys(bounced).length, w.pieces.length, 'every piece bounces');
  for (let i = 1; i < lands.length; i++) assert.ok(lands[i - 1].i !== lands[i].i);
  assert.strictEqual(e.type, 'ask'); assert.ok(e.first && e.promptKey === 'p.animals');
  assert.ok(w.phaseTime < 0.05 && w.time - w.levelStartTime < 2.5 + 2.0, 'enter ≈ 1.1–1.6 s');
  run(w, 1.0);
  assert.ok(Math.abs(w.board.ox) < 2, 'board settled');
  for (const p of w.pieces) { assert.strictEqual(p.state, 'rest'); assert.ok(Math.abs(p.rot - p.homeRot) < 0.02 && Math.abs(p.homeRot) <= 0.14 + 1e-9, 'rest tilt ±8°'); assert.ok(p.pop === 1); }
});

test('world: a press during enter is soft {kind:"early"}; pieces are not grabbable until the ask', () => {
  const w = mkWorld({ age: 4 });
  w.levels = ['animals', 'animals', 'animals', 'animals']; w.startLevel(1); w.round = 1; w._beginRound(); evs(w);
  run(w, 0.9);
  const p = w.pieces[0];
  assert.strictEqual(w.pointerDown(p.homeX, p.homeY), 'early');
  assert.ok(evs(w).some(x => x.type === 'soft' && x.kind === 'early'));
  assert.strictEqual(w.held, null);
});

// ---------------------------------------------------------------- world: drag + drops
test('world: drag — pickup, lift 0 → 1 (scale 1.12), spring follow with lag, pendulum tilt against the motion (≤ 0.35 rad)', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'animals', 2), p = w.pieces[0], h = w.pieceHit(p.id);
  assert.strictEqual(w.pointerDown(h.x + 5, h.y - 4), 'grab');
  const e = evs(w).find(x => x.type === 'pickup'); assert.ok(e && e.id === p.id && e.thing === p.thing && Number.isFinite(e.x));
  run(w, 0.4);
  assert.ok(p.lift > 0.95 && Math.abs(p.sx - 1.12) < 0.02 && Math.abs(p.sy - 1.12) < 0.02, 'lift scale');
  assert.ok(Math.abs(p.x - (h.x)) < 2 && Math.abs(p.y - (h.y - 8)) < 2, 'held where it was pressed (+ 8 px lift)');
  let minRot = 0, maxRot = 0, lag = 0;
  for (let k = 1; k <= 20; k++) {   // a fast swipe to the right
    w.pointerMove(h.x + 5 + 20 * k, h.y - 4);
    run(w, 1 / 60);
    lag = Math.max(lag, (h.x + 5 + 20 * k) - 5 - p.x);
    minRot = Math.min(minRot, p.rot); maxRot = Math.max(maxRot, p.rot);
  }
  assert.ok(minRot < -0.15 && minRot >= -0.35 - 1e-9, 'tilts back against the motion ' + minRot.toFixed(3));
  assert.ok(lag > 5, 'spring lag');
  let swing = 0;
  run(w, 0.8, () => { swing = Math.max(swing, p.rot); });
  assert.ok(swing > 0.01, 'swings past upright when the finger stops (pendulum)');
  assert.ok(Math.abs(p.rot) < 0.05, 'and settles');
  const ws = w.pieces.map(q => q.id);
  assert.strictEqual(w.pieces[w.pieces.length - 1], p, 'the held piece is drawn last'); void ws;
  w.cancelDrag(); until(w, () => p.state === 'rest');
  assert.ok(Math.abs(p.x - p.homeX) < 1e-6 && Math.abs(p.y - p.homeY) < 3);
});

test('world: correct drop → magnet snap (0.16 s ease-out-back) → placed (squash 1.15 / 0.85, board jiggle) → stepDone → next ask 1.0 s later', () => {
  const w = roundWhere({ age: 4 }, 'animals', 2, r => r.steps.length >= 2);
  const a = w.answer(), s = w.slotDrop(a.slot), p = w.pieceById(a.piece);
  assert.strictEqual(drag(w, a.piece, s.x + 20, s.y - 15), 'snap');
  assert.strictEqual(p.state, 'snap'); assert.strictEqual(w.interactive, false);
  let over = 0, seen = [];
  const sl = w.slotById(a.slot), d0 = Math.hypot(p.x - sl.x, p.y - sl.y);
  until(w, () => { if (p.state === 'snap') over = Math.max(over, -((p.x - sl.x) * (20) + (p.y - sl.y) * (-15)) / 25); seen.push(...evs(w)); return p.state === 'placed'; });
  assert.ok(d0 > 3, 'released away from the centre');
  assert.ok(over > 0.3, 'eases past the centre (ease-out-back)');
  const tSnap = w.time;
  assert.ok(Math.abs(p.sx - 1.15) < 0.03 && Math.abs(p.sy - 0.85) < 0.03, 'landing squash ' + p.sx.toFixed(3) + '/' + p.sy.toFixed(3));
  assert.strictEqual(p.rot, 0); assert.ok(sl.filled);
  const pl = seen.find(x => x.type === 'placed'), sd = seen.find(x => x.type === 'stepDone');
  assert.ok(pl && pl.id === p.id && pl.slot === a.slot && pl.thing === p.thing && pl.x === sl.x && pl.y === sl.y);
  assert.ok(sd && sd.step === 0 && !sd.last);
  let jig = 0;
  const e2 = [];
  until(w, () => { jig = Math.max(jig, Math.abs(w.board.jig)); e2.push(...evs(w)); return e2.some(x => x.type === 'ask'); });
  assert.ok(jig > 1 && jig < 3, 'board jiggles ≈ 2 px');
  assert.ok(Math.abs(w.time - tSnap - CFG.askGap) < 0.02, 'next ask after askGap'); assert.strictEqual(CFG.askGap, 1.0);
  assert.ok(Math.abs(p.sx - 1) < 0.02, 'squash springs back');
  assert.strictEqual(w.step, 1); assert.strictEqual(w.misses, 0);
});

test('world: drop zone = piece box +30 px sides / down, +90 px up; the finger point OR the piece centre counts', () => {
  const cases = [[0, -1, 85, 'snap'], [1, 0, 25, 'snap'], [-1, 0, 25, 'snap'], [0, 1, 25, 'snap'], [0, -1, 105, 'nearMiss'], [1, 0, 45, 'nearMiss']];
  for (const [dx, dy, pad, want] of cases) {
    const w = roundWhere({ age: 4 }, 'animals', 2, (r, ww) => { const s = ww.slotById(ww.answer().slot), B = ww.layout.board; return s.y - B.y > 160 && B.x + B.w - s.x > 140 && s.x - B.x > 140 && B.y + B.h - s.y > 100; });
    const a = w.answer(), s = w.slotById(a.slot), z = w.slotZone(a.slot), half = s.size / 2;
    assert.ok(Math.abs(z.y - (s.y - half - 90)) < 1e-9 && Math.abs(z.x - (s.x - half - 30)) < 1e-9 && Math.abs(z.y + z.h - (s.y + half + 30)) < 1e-9);
    const tx = s.x + dx * (half + pad), ty = s.y + dy * (half + pad) + (dy < 0 ? 8 : 0);   // + 8: the held piece floats 8 px above the finger
    assert.strictEqual(drag(w, a.piece, tx, ty), want, `dx ${dx} dy ${dy} pad ${pad}`);
  }
  // finger inside the zone, piece centre outside (pressed at the piece's edge) → snap
  const w = roundWhere({ age: 4 }, 'animals', 2, (r, ww) => { const s = ww.slotById(ww.answer().slot), B = ww.layout.board; return s.y - B.y > 160 && B.y + B.h - s.y > 100; });
  const a = w.answer(), s = w.slotById(a.slot), h = w.pieceHit(a.piece);
  assert.strictEqual(drag(w, a.piece, s.x, s.y + s.size / 2 + 25, { px: h.x, py: h.y - 60 }), 'snap');
});

test('world: near miss — the asked piece on the board outside its zone glides home, its shadow pulses, magnet: the next drop anywhere on the board snaps; no miss', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'animals', 2), a = w.answer(), p = w.pieceById(a.piece), fp = freeBoardPoint(w);
  assert.strictEqual(drag(w, a.piece, fp.x, fp.y), 'nearMiss');
  const e = evs(w).find(x => x.type === 'nearMiss');
  assert.ok(e && e.id === p.id && e.slot === a.slot && Number.isFinite(e.x));
  assert.strictEqual(p.state, 'home'); assert.ok(w.magnet); assert.strictEqual(w.misses, 0);
  let glow = 0; until(w, () => { glow = Math.max(glow, w.slotById(a.slot).glow); return p.state === 'rest'; });
  assert.ok(glow > 0.5, 'shadow pulses');
  assert.ok(Math.abs(p.x - p.homeX) < 1e-6, 'home');
  run(w, 0.2);
  assert.strictEqual(drag(w, a.piece, fp.x + 7, fp.y + 3), 'snap', 'magnet');
  until(w, () => p.state === 'placed');
  assert.strictEqual(w.misses, 0);
});

test('world: wrong piece on the board — shake ±10 px (0.4 s) then a ballistic arc home (apex 120 px above the higher end), a miss; stars 3 / 2 / 1', () => {
  const w = roundWhere({ age: 4 }, 'animals', 2, r => r.pieces.length >= 3), a = w.answer();
  const other = w.pieces.find(p => p.id !== a.piece && p.state === 'rest'), fp = freeBoardPoint(w);
  assert.strictEqual(drag(w, other.id, fp.x, fp.y), 'wrong');
  const e = evs(w).find(x => x.type === 'wrong');
  assert.ok(e && e.id === other.id && e.got.nameKind === other.thing.nameKind && e.got.nameValue === other.thing.nameValue);
  assert.strictEqual(e.want.promptKey, w.stepInfo.promptKey); assert.strictEqual(e.streak, 1); assert.ok(Number.isFinite(e.x));
  assert.strictEqual(w.misses, 1); assert.strictEqual(other.state, 'wrong');
  const x0 = other.x, y0 = other.y;
  let maxDx = 0, minY = 1e9, t = 0;
  until(w, () => { t += H; if (t < 0.4) maxDx = Math.max(maxDx, Math.abs(other.x - x0)); else minY = Math.min(minY, other.y); return other.state === 'rest'; });
  assert.ok(maxDx > 5 && maxDx <= 10.5, 'shake ' + maxDx.toFixed(1));
  const apex = Math.min(y0, other.homeY) - minY;
  assert.ok(apex > 100 && apex < 125, 'apex ' + apex.toFixed(0));
  assert.ok(t > 0.9 && t < 1.4, 'shake + flight ' + t.toFixed(2));
  assert.ok(other.qv !== 0 || other.q !== 0, 'landing squash');
  // stars: 1 miss → 2 stars
  solveRound(w);
  const rd = evs(w).find(x => x.type === 'roundDone'); assert.ok(rd && rd.stars === 2 && rd.misses === 1);
  const w0 = roundOf(mkWorld({ age: 4, seed: 3 }), 'animals', 2); solveRound(w0); assert.strictEqual(evs(w0).find(x => x.type === 'roundDone').stars, 3);
  assert.strictEqual(w0._starsFor(2), 1); assert.strictEqual(w0._starsFor(5), 1);
});

test('world: let go outside the board → glides home quietly (home event, no miss, no line); a tap = hop + name, never a drop', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'animals', 2), a = w.answer(), p = w.pieceById(a.piece), L = w.layout;
  const out = L.portrait ? { x: L.W - 40, y: L.board.y + L.board.h + 36 } : { x: L.ins.left + 60, y: L.board.y + 40 };
  assert.ok(!inside(w.boardZone(), out.x, out.y));
  assert.strictEqual(drag(w, a.piece, out.x, out.y), 'home');
  let e = evs(w); assert.ok(e.some(x => x.type === 'home') && !e.some(x => x.type === 'wrong' || x.type === 'nearMiss'));
  until(w, () => p.state === 'rest'); assert.strictEqual(w.misses, 0);
  // tap
  let top = 1e9;
  assert.strictEqual(tapPiece(w, a.piece), 'tap');
  e = evs(w).find(x => x.type === 'tapPiece'); assert.ok(e && e.id === p.id && e.thing === p.thing);
  until(w, () => { top = Math.min(top, p.y); return p.state === 'rest'; });
  assert.ok(p.homeY - top > 30 && p.homeY - top < 50, 'hop ≈ 40 px');
  assert.strictEqual(w.misses, 0); assert.strictEqual(p.state, 'rest');
  // a slow press (> 0.35 s) without moving is a drag that ends in the tray → home (not a tap)
  const h = w.pieceHit(p.id); w.pointerDown(h.x, h.y); run(w, 0.5);
  assert.strictEqual(w.pointerUp(h.x, h.y), 'home');
  // a quick tap at a piece whose shadow is right above never snaps
  const s = w.slotById(a.slot); void s;
  assert.strictEqual(CFG.tapMovePx, 24); assert.strictEqual(CFG.tapTime, 0.35);
});

test('world: a release during the gap after a fit starts the next step (its ask) and is judged against it', () => {
  const w = roundWhere({ age: 4 }, 'animals', 2, r => r.steps.length >= 2);
  placeRight(w); evs(w);
  assert.ok(w._stepDone && w._waitAsk > 0);
  const nextT = w.cur.steps[1].targets[0], s = w.slotDrop(w.pieceById(nextT).slot);
  const h = w.pieceHit(nextT);
  assert.strictEqual(w.pointerDown(h.x, h.y), 'grab');
  w.pointerMove(s.x, s.y); run(w, 0.05);
  assert.strictEqual(w.pointerUp(s.x, s.y), 'snap');
  const e = evs(w); assert.ok(e.some(x => x.type === 'ask' && x.step === 1));
});

// ---------------------------------------------------------------- world: help
test('world: 2 misses → hint (piece glows, ghost hand piece → slot); cooldown 6 s; no new hint while one shows', () => {
  const w = roundWhere({ age: 5 }, 'animals', 2, r => r.pieces.length >= 4), a = w.answer();
  const others = w.pieces.filter(p => p.id !== a.piece), fp = freeBoardPoint(w);
  drag(w, others[0].id, fp.x, fp.y); until(w, () => others[0].state === 'rest');
  assert.ok(!evs(w).some(x => x.type === 'hint'));
  drag(w, others[1].id, fp.x, fp.y);
  const hi = evs(w).find(x => x.type === 'hint');
  assert.ok(hi && hi.id === a.piece && hi.slot === a.slot && Number.isFinite(hi.x) && Number.isFinite(hi.toX));
  const H2 = w.hintHand; assert.ok(H2 && H2.id === a.piece);
  let nearPiece = false, nearSlot = false, glow = 0;
  const p = w.pieceById(a.piece), sl = w.slotById(a.slot);
  run(w, 1.6, () => { if (!w.hintHand) return; const hh = w.hintHand; glow = Math.max(glow, p.glow); if (Math.hypot(hh.x - p.homeX, hh.y - p.homeY) < 16) nearPiece = true; if (Math.hypot(hh.x - sl.x, hh.y - sl.y) < 16) nearSlot = true; });
  assert.ok(nearPiece && nearSlot && glow > 0.8, 'the hand goes from the piece to the slot, the piece glows');
  assert.ok(Number.isFinite(H2.x0) && Number.isFinite(H2.y1) && H2.press >= 0 && H2.alpha >= 0);
  until(w, () => others[1].state === 'rest');
  drag(w, others[2].id, fp.x, fp.y);
  assert.ok(!evs(w).some(x => x.type === 'hint'), 'cooldown');
  assert.strictEqual(CFG.hintCooldown, 6);
});

test('world: idle nudges at 12 → 18 → 27 → 30 → 30 s; the 2nd idle also hints; a press resets them', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'animals', 2), t0 = w.time, at = [];
  run(w, 120, () => { for (const e of w.drainEvents()) if (e.type === 'idle') at.push(+(w.time - t0).toFixed(1)); else if (e.type === 'hint') at.push('hint'); });
  const nums = at.filter(x => x !== 'hint');
  assert.deepStrictEqual(nums.slice(0, 5), [12, 30, 57, 87, 117]);
  assert.strictEqual(at[2], 'hint', 'the 2nd idle hints');
  assert.strictEqual(w.state, 'round', 'no fail state, no auto-play');
});

test('world: soft presses (empty space / board) count as no progress → hint at 2; assist at 6 (ages ≤ 4: 3) — the next grab of ANY piece gives the asked one; taps never hint, tapping the asked piece glides it in', () => {
  const w = roundWhere({ age: 5 }, 'animals', 2, r => r.pieces.length >= 3), a = w.answer(), L = w.layout, fp = freeBoardPoint(w);
  for (let k = 0; k < 6; k++) { assert.strictEqual(w.pointerDown(fp.x, fp.y), 'soft'); w.pointerUp(fp.x, fp.y); if (k === 1) assert.ok(evs(w).some(x => x.type === 'hint')); run(w, 0.3); }
  const e = evs(w); assert.ok(e.filter(x => x.type === 'soft').length >= 4 && e.every(x => x.type !== 'wrong'));
  const other = w.pieces.find(p => p.id !== a.piece && p.state === 'rest'), h = w.pieceHit(other.id);
  assert.strictEqual(w.pointerDown(h.x, h.y), 'grab');
  const as = evs(w).find(x => x.type === 'assist'); assert.ok(as && as.id === a.piece && as.from === other.id);
  assert.strictEqual(w.held, a.piece, 'the asked piece flies into the finger');
  const s = w.slotDrop(a.slot);
  for (let k = 1; k <= 8; k++) { w.pointerMove(h.x + (s.x - h.x) * k / 8, h.y + (s.y - h.y) * k / 8); run(w, 0.05); }
  assert.strictEqual(w.pointerUp(s.x, s.y), 'snap'); void L;
  // a 4-year-old who only presses the board: the 4th press (after 3 without progress) flies the asked piece in by itself
  const w2 = roundOf(mkWorld({ age: 4, seed: 4 }), 'animals', 2), a2 = w2.answer(), fp2 = freeBoardPoint(w2);
  for (let k = 0; k < 3; k++) { w2.pointerDown(fp2.x, fp2.y); w2.pointerUp(fp2.x, fp2.y); run(w2, 0.3); }
  assert.ok(!evs(w2).some(x => x.type === 'assist'));
  w2.pointerDown(fp2.x, fp2.y); w2.pointerUp(fp2.x, fp2.y);
  until(w2, () => w2.pieceById(a2.piece).state === 'placed');
  assert.ok(evs(w2).some(x => x.type === 'assist' && x.from === null));
  assert.strictEqual(CFG.assistAfter, 6); assert.strictEqual(CFG.assistAfterYoung, 3);
  // a child who only taps pieces: the 6th tap's grab is swapped and its tap glides the asked piece in
  const w3 = roundWhere({ age: 4, seed: 5 }, 'animals', 2, r => r.pieces.length >= 3), a3 = w3.answer();
  const o3 = w3.pieces.find(p => p.id !== a3.piece);
  for (let k = 0; k < 8 && w3.pieceById(a3.piece).state !== 'placed' && w3.pieceById(a3.piece).state !== 'snap'; k++) { until(w3, () => o3.state === 'rest' && w3.interactive); tapPiece(w3, o3.id); run(w3, 0.2); }
  until(w3, () => w3.pieceById(a3.piece).state === 'placed');
  // curious taps never light the 2-miss hint (wrong drops / drops off the board still do)
  const w4 = roundWhere({ age: 4, seed: 6 }, 'animals', 2, r => r.pieces.length >= 3), a4 = w4.answer(), o4 = w4.pieces.find(p => p.id !== a4.piece);
  for (let k = 0; k < 2; k++) { until(w4, () => o4.state === 'rest'); tapPiece(w4, o4.id); run(w4, 0.2); }
  assert.ok(!evs(w4).some(x => x.type === 'hint'), 'two taps: no hint');
  // a child who taps only the RIGHT piece (cannot drag yet): after the assist threshold the tap glides it in (playtest P1)
  for (const age of [3, 4, 5, 7]) {
    const w5 = roundWhere({ age, seed: 8 }, 'animals', 2, r => r.pieces.length >= 2), a5 = w5.answer(), n = age <= 4 ? 3 : 6;
    for (let k = 0; k < n; k++) {
      until(w5, () => w5.pieceById(a5.piece).state === 'rest' && w5.interactive);
      tapPiece(w5, a5.piece); run(w5, 0.2);
      assert.notStrictEqual(w5.pieceById(a5.piece).state, 'placed', `age ${age}: tap ${k + 1} only names it`);
    }
    until(w5, () => w5.pieceById(a5.piece).state === 'rest' && w5.interactive);
    tapPiece(w5, a5.piece);
    until(w5, () => w5.pieceById(a5.piece).state === 'placed', 300);
    assert.ok(evs(w5).some(x => x.type === 'assist' && x.id === a5.piece && x.from === a5.piece), `age ${age}: assist on the asked piece`);
  }
});

test('world: pokePom repeats the prompt; hint() manual; prompt() during enter / play', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'colors', 2), b = w.pomHit();
  assert.strictEqual(w.pointerDown(b.x, b.y), 'pom');
  assert.strictEqual(w.pointerUp(b.x, b.y), 'pokePom');
  const e = evs(w).find(x => x.type === 'pokePom'); assert.ok(e && e.promptKey === 'p.colors' && Number.isFinite(e.x));
  const hh = w.hint(); assert.ok(hh && hh.piece === w.answer().piece);
  assert.deepStrictEqual(w.hint(), hh);
  const pr = w.prompt(); assert.ok(pr && pr.promptKey === 'p.colors' && pr.step === 0 && pr.nameKind === 'color');
});

// ---------------------------------------------------------------- world: alive + turn
test('world: picture complete → roundDone (stars), shine 0 → 1, alive motions per piece kind, toot at 1.2 s, distractors poof; turn → boardOut, pictures', () => {
  for (const [topic, age] of [['colors', 5], ['animals', 5], ['count', 4], ['shapes', 4], ['letters', 5]]) {
    const w = roundWhere({ age }, topic, 2, r => r.pieces.length > r.slots.length);
    const distractor = w.pieces.find(p => !p.slot), nSlots = w.slots.length;
    solveRound(w);
    assert.strictEqual(w.state, 'roundDone'); assert.strictEqual(w.phase, 'alive');
    let e = evs(w); const rd = e.find(x => x.type === 'roundDone'); assert.ok(rd && rd.stars === 3 && Number.isFinite(rd.x));
    const motion = {}, seen = [];
    let shine05 = null;
    until(w, () => {
      if (w.phase === 'alive' && Math.abs(w.phaseTime - 0.35) < H / 2) shine05 = w.board.shine;
      for (const p of w.pieces) if (p.state === 'placed') motion[p.id] = Math.max(motion[p.id] || 0, Math.abs(p.ax) + Math.abs(p.ay) + Math.abs(p.arot) * 100);
      for (const x of evs(w)) seen.push(Object.assign({ at: +(w.phaseTime).toFixed(2), ph: w.phase }, x));
      return w.phase === 'turn';
    });
    assert.ok(shine05 > 0.4 && shine05 < 0.6, 'shine sweeps over 0.7 s');
    assert.strictEqual(w.board.alive, 1);
    for (const id in motion) assert.ok(motion[id] > 4, `${topic}: piece ${id} comes alive (${motion[id].toFixed(1)})`);
    const toot = seen.find(x => x.type === 'toot'); assert.ok(toot && Math.abs(toot.at - 1.2) < 0.02);
    assert.ok(seen.some(x => x.type === 'alive'));
    const poof = seen.find(x => x.type === 'poof'); assert.ok(poof && poof.id === distractor.id && Number.isFinite(poof.x));
    assert.strictEqual(distractor.state, 'gone'); assert.strictEqual(distractor.pop, 0);
    assert.ok(seen.some(x => x.type === 'boardOut'));
    let turnMid = null;
    until(w, () => { if (w.phase === 'turn' && Math.abs(w.phaseTime - 0.4) < H / 2) turnMid = w.board.turn; return w.state !== 'roundDone'; });
    assert.ok(turnMid > 0.1 && turnMid < 0.5, 'the page turn eases in');
    const pic = w.pictures[w.pictures.length - 1];
    assert.ok(pic && pic.scene === SCENES[topic] && pic.season === 1 && pic.pieces.length === nSlots && pic.pieces.every(q => q.u > 0 && q.u < 1 && q.thing));
    assert.strictEqual(w.state, 'round'); assert.strictEqual(w.phase, 'enter');
  }
});

test('world: counting — a placed balloon bunch lights 1..n (count events, 0.5 s each), placed carries count {n}; the next ask waits for it', () => {
  const w = roundWhere({ age: 4 }, 'count', 2, (r, ww) => ww.pieceById(ww.answer().piece).thing.n >= 3 && r.steps.length >= 2);
  const a = w.answer(), n = w.pieceById(a.piece).thing.n, s = w.slotDrop(a.slot);
  evs(w);
  const res = drag(w, a.piece, s.x, s.y);
  const counts = [], p = w.pieceById(a.piece); let placed = null, ask = null, tP = 0;
  assert.strictEqual(res, 'snap', 'drop result ' + res + ' ' + JSON.stringify(types(w.events)));
  until(w, () => { for (const e of evs(w)) { if (e.type === 'placed') { placed = e; tP = w.time; } if (e.type === 'count') counts.push(e.i); if (e.type === 'ask') ask = w.time; } return ask !== null; });
  assert.deepStrictEqual(placed.count, { n });
  assert.deepStrictEqual(counts, Array.from({ length: n }, (_, i) => i + 1));
  assert.ok(ask - tP >= 0.6 + n * 0.5 - 0.02, 'the ask waits for the counting');
  until(w, () => p.count === -1);
});

test('world: findAll (odd / even) — every right number in its own slot; a wrong parity on the board is a mistake', () => {
  const w = roundWhere({ age: 7 }, 'oddeven', 2, r => r.steps[0].need === 3);
  const st = w.stepInfo, wrong = w.pieces.find(p => !p.slot), fp = freeBoardPoint(w);
  assert.strictEqual(drag(w, wrong.id, fp.x, fp.y), 'wrong'); until(w, () => wrong.state === 'rest');
  for (let k = 0; k < 3; k++) { const pid = st.targets[k], s = w.slotDrop(w.pieceById(pid).slot); assert.strictEqual(drag(w, pid, s.x, s.y), 'snap'); until(w, () => w.pieceById(pid).state === 'placed'); }
  until(w, () => w.state === 'roundDone');
  assert.strictEqual(w.roundStars, 2);
});

// ---------------------------------------------------------------- world: surprises
test('world: pigeon — lands on its ledge (top of the board frame / the bubble / Pom\'s head) 3–8 s after the ask, never over the tray, waddles + pecks, tap → pigeonTap (flaps up, lands)', () => {
  for (const v of [VIEWPORTS[4], VIEWPORTS[2], VIEWPORTS[0], VIEWPORTS[6], VIEWPORTS[9]]) {
    const w = roundOf(mkWorld({ vp: v, age: 4, surprise: true }), 'animals', 1, { surprise: 'pigeon' }), t0 = w.time;
    let pe = null;
    until(w, () => { for (const e of evs(w)) if (e.type === 'pigeon') pe = e; return !!pe; });
    const dt = w.time - t0; assert.ok(dt >= 3 && dt <= 8.1, 'pigeon after ' + dt.toFixed(1));
    const g = w.pigeon; assert.ok(g && g.state === 'land' && g.dir === -1);
    until(w, () => g.state === 'walk');
    const pr = w._perch(), L = w.layout;
    assert.ok(Math.abs(g.y - pr.y) < 1e-6, v.name + ': on its ledge');
    assert.ok(g.y < L.tray.y - 30, v.name + ': above the tray, never over the pieces');
    if (!pr.pom) assert.ok(g.x >= L.board.x - 1 || g.x >= L.bubble.x, v.name + ': on the frame / bubble');
    for (const K of L.keep.filter(k => k.kind === 'hud')) assert.ok(!(g.x + 40 > K.x && g.y - 84 < K.y + K.h && g.y > K.y), v.name + ': not under the HUD');
    let steps = 0, last = g.step;
    until(w, () => { if (g.step !== last) steps++; last = g.step; return g.stopT > 0.5; });
    assert.ok(steps > 2 || pr.hi - pr.lo < 60, v.name + ': waddles');
    assert.ok(g.x >= pr.lo - 1e-6 && g.x <= pr.hi + 1e-6, 'stops on its ledge');
    const c = w.pigeonHit(); assert.ok(c, v.name + ': tappable');
    for (const p of w.pieces) if (p.state === 'rest') assert.ok(!w._pieceAt(c.x, c.y), 'not under a piece');
    assert.strictEqual(w.pointerDown(c.x, c.y), 'pigeon');
    assert.ok(evs(w).some(x => x.type === 'pigeonTap'));
    let top = 0; until(w, () => { top = Math.max(top, g.hop); return g.state === 'walk'; });
    assert.ok(top > 50, 'flaps up');
    until(w, () => !w.pigeon, 3000);
    assert.strictEqual(g.state, 'fly', 'flies off at the end of its ledge');
  }
});

test('world: bubbles — 4–6 rise right of the board (or over it), never over the tray, wobble; tap → bubblePop', () => {
  for (const v of [VIEWPORTS[0], VIEWPORTS[4], VIEWPORTS[6]]) {
    const w = roundOf(mkWorld({ vp: v, age: 4, surprise: true }), 'animals', 1, { surprise: 'bubbles' });
    let be = null, maxN = 0, xs = new Set(), trayHit = false;
    until(w, () => { for (const e of evs(w)) if (e.type === 'bubbles') be = e; return !!be; });
    assert.ok(be.n >= 4 && be.n <= 6);
    run(w, 4, () => {
      maxN = Math.max(maxN, w.bubbles.length);
      for (const b of w.bubbles) { xs.add(Math.round(b.x)); for (const p of w.pieces) if (Math.hypot(b.x - p.homeX, b.y - p.homeY) < b.r + 0.6 * p.size + 14) trayHit = true; }
    });
    assert.ok(maxN >= 3 && xs.size > 20, 'several rising, wobbling');
    assert.ok(!trayHit, v.name + ': never over the tray pieces');
    const bh = w.bubbleHit(); assert.ok(bh, 'tappable');
    assert.strictEqual(w.pointerDown(bh.x, bh.y), 'bubble');
    assert.ok(evs(w).some(x => x.type === 'bubblePop' && Number.isFinite(x.x)));
  }
});

// ---------------------------------------------------------------- world: rotation, chapter, determinism
test('world: rotation mid-drag — the drag is cancelled (glides home), slots re-placed from (u, v), placed pieces follow, everything stays valid', () => {
  const w = roundWhere({ age: 5, vp: VIEWPORTS[4] }, 'animals', 2, r => r.steps.length >= 3);
  placeRight(w); until(w, () => w.interactive);
  const a = w.answer(), h = w.pieceHit(a.piece);
  w.pointerDown(h.x, h.y); w.pointerMove(h.x - 40, h.y - 120); run(w, 0.2);
  const uv = w.slots.map(s => [s.u, s.v]);
  w.setViewport(720, 1556, { top: 108, right: 0, bottom: 62, left: 0 });
  assert.strictEqual(w.held, null); assert.strictEqual(w.pieceById(a.piece).state, 'home');
  const B = w.layout.board;
  w.slots.forEach((s, i) => {
    assert.ok(inside(B, s.x, s.y), 'slot on the new board');
    if (Math.abs(s.u - uv[i][0]) > 1e-6) assert.ok(true);
  });
  for (let i = 0; i < w.slots.length; i++) for (let j = 0; j < i; j++) assert.ok(Math.hypot(w.slots[i].x - w.slots[j].x, w.slots[i].y - w.slots[j].y) >= 1.25 * w.layout.item - 1e-6);
  for (const p of w.pieces) {
    if (p.state === 'placed') { const s = w.slotById(p.slot); assert.ok(p.x === s.x && p.y === s.y, 'placed follows its slot'); }
    else if (p.state === 'rest') assert.ok(p.x === p.homeX && p.y === p.homeY);
  }
  until(w, () => w.pieceById(a.piece).state === 'rest');
  solveRound(w);
  assert.strictEqual(w.state, 'roundDone');
});

test('world: chapter time limit — Talk time after round 3 once the chapter passed 75 s; Talk re-asks, glows, Pom answers herself', () => {
  const w = mkWorld({ age: 4 });
  w.levels = ['animals', 'animals', 'animals', 'animals']; w.startLevel(0);
  until(w, () => w.interactive);
  for (let r = 0; r < 3; r++) { until(w, () => w.interactive); run(w, 22); solveRound(w); until(w, () => w.state !== 'roundDone'); }
  assert.strictEqual(w.state, 'talk', 'talk after 3 long rounds');
  assert.strictEqual(w.roundsPerLevel, 3);
  const asks = [];
  run(w, 50, () => { for (const e of evs(w)) if (e.type === 'talkAsk' || e.type === 'talkResult') asks.push(e); });
  assert.deepStrictEqual(asks.filter(e => e.type === 'talkAsk').map(e => e.n), [1, 2, 3]);
  assert.ok(asks.find(e => e.n === 2).glowAnswer);
  const res = asks.find(e => e.type === 'talkResult'); assert.ok(res && res.auto && !res.correct);
});

test('world: short rounds — a round starting late in the chapter has 2 slots', () => {
  const w = mkWorld({ age: 5 });
  w.levels = ['animals', 'animals', 'animals', 'animals']; w.startLevel(1); w.round = 2; w.levelStartTime = w.time - 60;
  w._beginRound();
  assert.ok(w.cur.short); assert.strictEqual(w.slots.length, 2);
});

test('world: interpolation twins + fixed sub-steps ≤ 1/120 s; alpha in [0, 1); render fields finite', () => {
  assert.ok(CFG.step <= 1 / 120 + 1e-12);
  const w = roundOf(mkWorld({ age: 4 }), 'colors', 1), a = w.answer(), h = w.pieceHit(a.piece), s = w.slotDrop(a.slot);
  w.pointerDown(h.x, h.y);
  for (let i = 0; i < 260; i++) {
    if (i < 30) w.pointerMove(h.x + (s.x - h.x) * i / 30, h.y + (s.y - h.y) * i / 30);
    if (i === 40) w.pointerUp(s.x, s.y);
    w.update(1 / 47);
    assert.ok(w.alpha >= 0 && w.alpha < 1);
    for (const p of w.pieces) for (const k of ['x', 'y', 'rot', 'sx', 'sy', 'lift', 'glow', 'ax', 'ay', 'arot', 'pop', '_px', '_py', '_prot', '_psx', '_psy', '_plift', '_pax', '_pay', '_parot']) assert.ok(Number.isFinite(p[k]), k);
    for (const k of ['ox', '_pox', 'tilt', '_ptilt', 'jig', 'shine', 'alive', 'turn', '_pturn']) assert.ok(Number.isFinite(w.board[k]), k);
    for (const sl of w.slots) for (const k of ['x', 'y', 'u', 'v', 'size', 'glow']) assert.ok(Number.isFinite(sl[k]));
  }
  for (const k of ['mood', 'moodT', 'blink', 'look', 'hop']) assert.ok(w.pom[k] !== undefined, 'pom.' + k);
  for (const k of ['x', 'y', 'w', 'h', 'r', 'scene', 'season']) assert.ok(w.board[k] !== undefined, 'board.' + k);
});

function eventLog(seed, age, frame, secs) {
  const w = new PZ.World({ seed, age }); w.setViewport(1280, 720, null);
  const b = new PZ.Bot(w, { skill: 0.7, seed: seed + 1 });
  w.newSession();
  const log = []; let t = 0, stepT = 0;
  // the bot acts on a 1/60 s clock whatever the render frame (like main.js with a fixed input step)
  while (t < secs && w.state !== 'sessionDone') {
    w.update(frame); t += frame; stepT += frame;
    while (stepT >= 1 / 60 - 1e-9) { stepT -= 1 / 60; b.step(1 / 60); }
    for (const e of w.drainEvents()) log.push(e.type + ':' + (e.id || '') + ':' + Math.round(w.time * 120));
  }
  return log;
}
test('world: deterministic — same seed + same inputs → the same events at any frame size', () => {
  for (const age of [3, 5, 7]) {
    const a = eventLog(10 + age, age, 1 / 60, 120), b = eventLog(10 + age, age, 1 / 60, 120);
    assert.deepStrictEqual(a, b);
    assert.ok(a.length > 80);
  }
  const w1 = new PZ.World({ seed: 5, age: 4 }), w2 = new PZ.World({ seed: 5, age: 4 });
  w1.setViewport(960, 720); w2.setViewport(960, 720); w1.newSession(); w2.newSession();
  for (let i = 0; i < 600; i++) w1.update(1 / 30);
  for (let i = 0; i < 2400; i++) w2.update(1 / 120);
  assert.deepStrictEqual(types(w1.drainEvents()), types(w2.drainEvents()));
  assert.strictEqual(w1.cur.key, w2.cur.key);
});

test('world: the next round does not open with the answer asked last; never the same set twice in a chapter', () => {
  for (const [topic, age] of [['colors', 3], ['animals', 4], ['shapes', 4], ['letters', 5], ['initial', 6]]) {
    const w = mkWorld({ age, seed: 9 });
    w.levels = [topic, topic, topic, topic]; w.startLevel(1);
    let last = null, rep = 0;
    const keys = [];
    for (let r = 0; r < 4; r++) {
      until(w, () => w.interactive);
      if (last !== null && String(w.stepInfo.nameValue) === String(last)) rep++;
      keys.push(w.cur.key);
      solveRound(w); last = w._prevAns;
      until(w, () => w.state !== 'roundDone');
    }
    assert.strictEqual(rep, 0, topic + ' repeated its answer');
    assert.strictEqual(new Set(keys).size, keys.length, topic + ' repeated a set');
  }
});

test('world: every topic × age round is completable through the input API (independent of which piece is asked)', () => {
  for (const topic of TOPICS) for (const age of AGES) for (const ri of [0, 2]) {
    const w = roundOf(mkWorld({ age, seed: 3 + age, vp: VIEWPORTS[(age + ri) % VIEWPORTS.length] }), topic, ri);
    solveRound(w);
    assert.strictEqual(w.state, 'roundDone', `${topic} age ${age} round ${ri}`);
    assert.ok(w.slots.every(s => s.filled));
  }
});

// ---------------------------------------------------------------- bot
test('bot: full sessions per age 3–7 × viewport finish (bot-only through the input API), no stuck round, no NaN', () => {
  for (const age of AGES) for (const v of [VIEWPORTS[0], VIEWPORTS[3], VIEWPORTS[4], VIEWPORTS[7], VIEWPORTS[9]]) for (const skill of [0.5, 0.9]) {
    const w = new PZ.World({ seed: age * 13 + skill * 10, age, lang: age % 2 ? 'vi' : 'en' });
    w.setViewport(v.W, v.H, v.ins);
    const b = new PZ.Bot(w, { skill, seed: age });
    w.newSession();
    let t = 0, rT = 0, maxR = 0, rounds = 0, nan = false;
    while (w.state !== 'sessionDone' && t < 1200) {
      b.step(1 / 30); w.update(1 / 30); t += 1 / 30;
      for (const e of w.drainEvents()) { b.onEvent(e); if (e.type === 'round') rT = w.time; if (e.type === 'roundDone') { rounds++; maxR = Math.max(maxR, w.time - rT); } }
      if (!w.pieces.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.rot)) || !Number.isFinite(w.board.ox)) { nan = true; break; }
    }
    assert.ok(!nan, 'NaN');
    assert.strictEqual(w.state, 'sessionDone', `age ${age} ${v.name} skill ${skill}: ${w.state}/${w.phase} after ${t.toFixed(0)} s`);
    assert.ok(maxR < 90, `a round took ${maxR.toFixed(0)} s`);
    assert.ok(rounds >= 12 && rounds <= 16);
    assert.ok(b.stats.placed >= 2 * rounds && b.stats.talks === 4 && b.stats.drags > rounds);
    assert.ok(w.stars >= rounds);
    assert.strictEqual(w.pictures.length, rounds);
  }
});

// ---------------------------------------------------------------- weather
test('weather: seasons, crossfade, ambient fields, clouds, particle sprites (DESIGN §4.3 names), cap 120, headless', () => {
  const wx = new PZ.Weather({ width: 1280, height: 720, groundY: 706, seed: 3 });
  const a = wx.ambient;
  assert.strictEqual(a.mood, 'spring'); assert.strictEqual(a.skyTop, SKY.spring[0]); assert.strictEqual(a.skyBottom, SKY.spring[1]);
  for (const k of ['skyTop', 'skyBottom', 'tint', 'light', 'sunX', 'sunY', 'sunA', 'mood', 'snow']) assert.ok(a[k] !== undefined, k);
  wx.update(3);
  assert.ok(wx.particles.some(p => p.sprite === 'petal'), 'spring petals');
  wx.setWeather(3);
  wx.update(1.0); assert.ok(a.envMix > 0.2 && a.envMix < 0.8, 'crossfading');
  for (let i = 0; i < 8; i++) wx.update(0.5);
  assert.strictEqual(a.skyTop, SKY.winter[0]); assert.strictEqual(a.skyBottom, SKY.winter[1]); assert.strictEqual(a.snow, 1);
  assert.ok(wx.particles.filter(p => p.sprite === 'snow').length > 15, 'snowflakes');
  const ys = wx.particles.filter(p => p.sprite === 'snow').map(p => p.y); wx.update(1);
  const ys2 = wx.particles.filter(p => p.sprite === 'snow').map(p => p.y);
  assert.ok(ys2.length && ys.length, 'still snowing');
  wx.setWeather(2, { instant: true }); assert.strictEqual(a.skyTop, SKY.autumn[0]); wx.update(3);
  assert.ok(wx.particles.some(p => p.sprite === 'leaf_a' || p.sprite === 'leaf_b'), 'autumn leaves');
  wx.setWeather(1, { instant: true }); assert.strictEqual(a.skyTop, SKY.summer[0]);
  wx.update(5);
  assert.ok(wx.clouds.length === 6 && wx.clouds.filter(c => c.alpha > 0.5).length >= 4, 'puffy summer clouds');
  assert.ok(a.sunY < 120 && a.sunA === 1, 'sun high');
  for (const c of wx.clouds) assert.ok(['cloud_a', 'cloud_b'].includes(c.type) && Number.isFinite(c.x) && Number.isFinite(c.y));
  wx.setParty(true);
  for (let i = 0; i < 20; i++) {
    wx.burst(600, 400, { kind: 'confetti', n: 20 }); wx.addDust(300, 600, 6); wx.burst(400, 300, { kind: 'feathers', n: 6 });
    wx.burst(500, 300, { kind: 'stars', n: 6 }); wx.burst(500, 300, { kind: 'sparkle', n: 6 }); wx.burst(500, 300, { kind: 'petals', n: 3 }); wx.update(0.1);
  }
  assert.ok(wx.particles.length <= 120);
  for (const p of wx.particles) { assert.ok(SPRITES.includes(p.sprite), 'sprite ' + p.sprite); assert.strictEqual(p.type, p.sprite); for (const k of ['x', 'y', 'r', 'rot', 'alpha', 'size']) assert.ok(Number.isFinite(p[k]), k); }
  wx.resize(720, 1556, 1500); wx.update(1);
  for (const p of wx.particles) assert.ok(Number.isFinite(p.x));
  for (let m = 0; m < 4; m++) { wx.setWeather(m, { instant: true }); wx.update(2); assert.strictEqual(wx.ambient.mood, ['spring', 'summer', 'autumn', 'winter'][m]); }
  assert.deepStrictEqual(PZ.Weather.SPRITES.slice().sort(), SPRITES.slice().sort());
});

// =====================================================================================================================
const only = process.argv[2];
let pass = 0, fail = 0;
const t0 = Date.now();
for (const t of tests) {
  if (only && !t.name.includes(only)) continue;
  const s = Date.now();
  try { t.fn(); pass++; console.log(`ok    ${t.name} (${Date.now() - s} ms)`); }
  catch (e) { fail++; console.log(`FAIL  ${t.name}\n      ${(e.stack || e).toString().split('\n').slice(0, 4).join('\n      ')}`); }
}
console.log(`\n${pass} passed, ${fail} failed (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(fail ? 1 : 0);
