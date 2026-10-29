#!/usr/bin/env node
// Foxy's Reef Memory — headless unit tests for rng / world / weather / bot.
// Run from projects/daily-game/foxy-reef-memory:   node tests/unit/run.js
'use strict';
const assert = require('assert');
const { load } = require('./load');

const RF = load();
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const H = 1 / 120;
// objects from the vm realm have a different Object.prototype → compare as plain JSON
const J = v => JSON.parse(JSON.stringify(v));
assert.deepStrictEqual = ((orig) => (a, b, m) => orig(J(a), J(b), m))(assert.deepStrictEqual);
assert.notDeepStrictEqual = ((orig) => (a, b, m) => orig(J(a), J(b), m))(assert.notDeepStrictEqual);

// ---------- helpers ----------
function run(w, seconds, dt, onStep) {
  dt = dt || 1 / 60;
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) { if (onStep && onStep(i) === false) return; w.update(dt); }
}
function untilPlaying(w, max) {
  let t = 0; max = max || 10;
  while (w.state !== 'playing' && t < max) { w.update(H); t += H; }
  assert.strictEqual(w.state, 'playing', 'reached playing');
  return t;
}
function playing(seed, cfg, level) {
  const w = new RF.World({ seed: seed || 1, config: Object.assign({ introDelay: 0 }, cfg) });   // intro banner pause tested separately
  if (level) w.startLevel(level);
  untilPlaying(w);
  w.drainEvents();
  return w;
}
function live(w) { return w.cards.filter(c => c.state !== 'gone'); }
function pairOf(w, card) { return w.cards.find(k => k !== card && k.face === card.face && k.state !== 'gone'); }
function nonPair(w, card) { return w.cards.find(k => k !== card && k.face !== card.face && k.state === 'down'); }
function idle(w, max) {   // run until no card is animating/travelling and nothing is open
  let t = 0; max = max || 5;
  while (t < max) {
    const busy = w.cards.some(c => c.state === 'matched' || c.moving || c.settling || (c.state !== 'gone' && c.flip !== Math.round(c.flip)));
    if (!busy && !w._mismatch && w.open.length === 0) return t;
    w.update(H); t += H;
  }
  return t;
}
function events(w) { return w.drainEvents(); }
function overlaps(w) {
  const L = live(w), c = w.cfg;
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
    if (Math.abs(L[i].x - L[j].x) < c.cardW - 1 && Math.abs(L[i].y - L[j].y) < c.cardH - 1) return [L[i].id, L[j].id];
  }
  return null;
}
const VALID_SPRITES = ['bubble', 'plankton', 'fish_a', 'fish_b', 'kelp_bit', 'kelp', 'jelly_a', 'jelly_b', 'sparkle', 'snow', 'dot'];

// ---------- RNG ----------
test('rng: deterministic and in range', () => {
  const a = new RF.RNG(42), b = new RF.RNG(42), c = new RF.RNG(43);
  const sa = [], sb = [], sc = [];
  for (let i = 0; i < 500; i++) { sa.push(a.next()); sb.push(b.next()); sc.push(c.next()); }
  assert.deepStrictEqual(sa, sb);
  assert.notDeepStrictEqual(sa, sc);
  assert.ok(sa.every(v => v >= 0 && v < 1));
  const r = new RF.RNG(1);
  for (let i = 0; i < 300; i++) { const x = r.int(2, 5); assert.ok(x >= 2 && x <= 5 && Number.isInteger(x)); }
});

// ---------- World: contract ----------
test('world: initial state, layout and contract fields', () => {
  const w = new RF.World({ seed: 1234, config: { introDelay: 0 } });
  assert.strictEqual(w.state, 'ready');
  assert.strictEqual(w.level, 0); assert.strictEqual(w.season, 0); assert.strictEqual(w.lap, 0);
  assert.strictEqual(w.score, 0); assert.strictEqual(w.air, w.airMax); assert.strictEqual(w.airMax, 60);
  for (const k of ['time', 'levelTime', 'combo', 'bestCombo', 'matches', 'mistakes', 'cupcakesEaten', 'cols', 'rows', 'tray', 'cursor', 'gravity', 'cfg', '_acc'])
    assert.ok(k in w, k);
  assert.ok(Array.isArray(w.cupcakes));
  assert.strictEqual(w.cfg.step, 1 / 120);
  assert.deepStrictEqual([w.cols, w.rows], [4, 3]);
  assert.strictEqual(w.cards.length, 12);
  assert.deepStrictEqual(w.gravity, { x: 0, y: -1 });
  const c0 = w.cards[0];
  for (const k of ['id', 'face', 'col', 'row', 'x', 'y', 'vx', 'vy', 'flip', 'state', 'wiggle', 'glow', 'scale', 'alpha', '_px', '_py', 'moving'])
    assert.ok(k in c0, 'card.' + k);
  for (const k of ['x', 'y', 'vx', 'vy', 'angle', 'flipX', 'frame', 'mood', 'bob', '_px', '_py']) assert.ok(k in w.fox, 'fox.' + k);
  // grid centred on the tray centre, 94 px pitch horizontally, 108 vertically
  const ps = [];
  for (let r = 0; r < w.rows; r++) for (let c = 0; c < w.cols; c++) ps.push(w.cellPos(c, r));
  const cx = (Math.min(...ps.map(p => p.x)) + Math.max(...ps.map(p => p.x))) / 2;
  const cy = (Math.min(...ps.map(p => p.y)) + Math.max(...ps.map(p => p.y))) / 2;
  assert.ok(Math.abs(cx - 585) < 1e-9 && Math.abs(cy - w.cfg.trayY) < 1e-9);
  assert.strictEqual(w.cellPos(1, 0).x - w.cellPos(0, 0).x, w.cfg.cardW + w.cfg.cardGap);
  assert.strictEqual(w.cellPos(0, 1).y - w.cellPos(0, 0).y, w.cfg.cardH + w.cfg.cardGap);
  // every level's tray fits in the max tray
  const expect = [[4, 3], [4, 4], [5, 4], [6, 4]];
  const grav = [{ x: 0, y: -1 }, { x: 0, y: 0 }, null, { x: 0, y: 1 }];
  for (let i = 0; i < 4; i++) {
    w.startLevel(i);
    assert.deepStrictEqual([w.cols, w.rows], expect[i]);
    assert.strictEqual(w.cards.length, expect[i][0] * expect[i][1]);
    assert.ok(w.tray.w <= 590 && w.tray.h <= 430, 'tray ' + w.tray.w + 'x' + w.tray.h);
    if (grav[i]) assert.deepStrictEqual(w.gravity, grav[i]);
    else assert.ok(Math.abs(w.gravity.x) === 1 && w.gravity.y === 0, 'autumn sideways');
  }
});

test('world: intro pause — the season banner shows on an empty tray before the deal', () => {
  const w = new RF.World({ seed: 2 });
  run(w, w.cfg.introDelay - 0.05, H);
  assert.ok(w.cards.every(c => (c.alpha || 0) === 0), 'cards hidden during the intro');
  run(w, 2, H);
  assert.strictEqual(w.state, 'playing');
});

test('mismatch penalty: free when both cards are new, costs air when a seen card is re-flipped', () => {
  const w = new RF.World({ seed: 5, config: { introDelay: 0, peekTime: 0 } });
  run(w, 3, H);
  const pick = () => w.cards.filter(c => c.state === 'down');
  const a = pick()[0], b = pick().find(c => c.face !== a.face);
  const air0 = w.air;
  w.select(a.id); w.select(b.id); run(w, 1.2, H);
  assert.ok(w.air > air0 - 1.25 - 0.05, 'first look is free (only normal drain)');
  const c2 = pick().find(c => c.id !== a.id && c.id !== b.id && c.face !== a.face);
  const air1 = w.air;
  w.select(a.id); w.select(c2.id); events(w); run(w, 0.3, H);
  assert.ok(w.air < air1 - 0.3 - w.cfg.mismatchPenalty + 0.05, 'seen card costs ' + w.cfg.mismatchPenalty + ' s');
});

test('world: faces are random pairs from the 12, seeded', () => {
  for (const seed of [1, 2, 3]) {
    const w = new RF.World({ seed, config: { introDelay: 0 } });
    for (let lv = 0; lv < 4; lv++) {
      w.startLevel(lv);
      const counts = {};
      for (const c of w.cards) { assert.ok(c.face >= 0 && c.face < 12); counts[c.face] = (counts[c.face] || 0) + 1; }
      assert.ok(Object.values(counts).every(n => n === 2), 'pairs');
      assert.strictEqual(Object.keys(counts).length, w.cards.length / 2);
    }
  }
  const a = new RF.World({ seed: 9 }).cards.map(c => c.face), b = new RF.World({ seed: 9 }).cards.map(c => c.face);
  const c = new RF.World({ seed: 10 }).cards.map(c => c.face);
  assert.deepStrictEqual(a, b); assert.notDeepStrictEqual(a, c);
});

test('world: deal animation (from below, staggered, ~0.9 s) then playing; no select while dealing', () => {
  const w = new RF.World({ seed: 2, config: { introDelay: 0 } });
  const evs = events(w);
  assert.ok(evs.some(e => e.type === 'deal') && evs.some(e => e.type === 'season' && e.season === 0));
  assert.ok(w.cards.every(c => c.y > 540), 'start below the screen');
  assert.strictEqual(w.select(w.cards[0].id), false);
  run(w, 0.5, H);
  const first = w.cards[0], last = w.cards[w.cards.length - 1];
  const pf = w.cellPos(first.col, first.row), pl = w.cellPos(last.col, last.row);
  assert.ok(Math.abs(first.y - pf.y) < Math.abs(last.y - pl.y), 'stagger: first card is closer to home');
  const t = 0.5 + untilPlaying(w);
  assert.ok(t >= 0.88 && t <= 0.95, 'playing after ' + t);
  assert.ok(events(w).some(e => e.type === 'play'));
  for (const c of w.cards) { const p = w.cellPos(c.col, c.row); assert.ok(c.x === p.x && c.y === p.y && c.alpha === 1 && c.flip === 0); }
  assert.strictEqual(w.air, w.airMax, 'no air used during the deal');
});

test('world: Easy peek shows all faces for peekTime, then hides them', () => {
  const w = new RF.World({ seed: 3, config: Object.assign({ introDelay: 0 }, RF.DIFFICULTY.easy) });
  run(w, 0.9 + 0.18 + 1.0, H);
  assert.strictEqual(w.state, 'ready'); assert.strictEqual(w.peeking, true);
  assert.ok(w.cards.every(c => c.flip === 1), 'all faces up');
  assert.strictEqual(w.select(w.cards[0].id), false);
  const t = 2.08 + untilPlaying(w);
  assert.ok(t >= 0.9 + 0.18 + 2 + 0.18 - 0.02 && t < 3.4, 'peek total ' + t);
  assert.ok(w.cards.every(c => c.flip === 0 && c.state === 'down'));
  assert.strictEqual(w.air, w.airMax);
});

test('world: determinism — same seed + inputs = same state, any dt partition', () => {
  function play(seed, dts) {
    const w = new RF.World({ seed }), bot = new RF.Bot(w, { skill: 0.7, seed });
    const evs = [];
    for (let i = 0; i < 3000; i++) { const dt = dts[i % dts.length]; bot.step(dt); w.update(dt); evs.push(...w.drainEvents().map(e => e.type)); }
    return { snap: w.snapshot(), evs };
  }
  const a = play(77, [1 / 60]), b = play(77, [1 / 60]);
  assert.deepStrictEqual(a.snap, b.snap);
  assert.deepStrictEqual(a.evs, b.evs);
  assert.notDeepStrictEqual(a.snap.cards, play(78, [1 / 60]).snap.cards);
  const w1 = new RF.World({ seed: 5 }), w2 = new RF.World({ seed: 5 });
  w1.update(3);
  for (let i = 0; i < 360; i++) w2.update(H);
  assert.deepStrictEqual(w1.snapshot(), w2.snapshot());
  assert.ok(w1._acc >= 0 && w1._acc < w1.cfg.step);
});

test('world: flip + match → glow, pop, gone, points, combo, air refill, cupcake', () => {
  const w = playing(4);
  run(w, 10, H);                            // spend some air so the refill is visible
  const a = w.cards[0], b = pairOf(w, a), air0 = w.air;
  assert.ok(w.select(a.id)); assert.strictEqual(a.state, 'up');
  assert.strictEqual(w.select(a.id), false, 'up card not selectable');
  assert.ok(w.select(b.id));
  let ev = events(w);
  assert.deepStrictEqual(ev.filter(e => e.type === 'flip').map(e => e.id), [a.id, b.id]);
  run(w, 0.17, H);
  assert.ok(a.flip > 0.9 && a.flip < 1 && a.state === 'up', 'flip in progress');
  run(w, 0.02, H);
  ev = events(w);
  const m = ev.find(e => e.type === 'match');
  assert.ok(m, 'match after the flip completes');
  assert.deepStrictEqual(m.ids, [a.id, b.id]);
  assert.strictEqual(m.points, 10); assert.strictEqual(m.combo, 1);
  assert.ok(Math.abs(m.x - (a.x + b.x) / 2) < 1e-9 && Math.abs(m.y - (a.y + b.y) / 2) < 1e-9);
  assert.strictEqual(w.score, 10); assert.strictEqual(w.matches, 1);
  assert.ok(Math.abs(w.air - Math.min(w.airMax, air0 - 0.19 + w.cfg.airPerMatch)) < 0.02, 'air refill');
  assert.strictEqual(a.state, 'matched');
  run(w, 0.24, H);
  assert.ok(a.glow > 0.9 && a.scale > 1, 'glowing');
  run(w, 0.07, H);
  assert.ok(a.scale > 1.1, 'pop up first');
  run(w, 0.33, H);
  assert.strictEqual(a.state, 'gone'); assert.strictEqual(b.state, 'gone');
  ev = events(w);
  const cup = ev.filter(e => e.type === 'cupcake');
  assert.strictEqual(cup.length, 1, 'one cupcake per pair');
  assert.ok(Math.abs(cup[0].x - m.x) < 1e-9 && Math.abs(cup[0].y - m.y) < 1e-9, 'from the pair midpoint');
  assert.strictEqual(w.cupcakes.length, 1);
  // air capped at airMax
  const w2 = playing(4); const a2 = w2.cards[0];
  w2.select(a2.id); w2.select(pairOf(w2, a2).id); run(w2, 0.3, H);
  assert.ok(w2.air <= w2.airMax);
});

test('world: combo multiplier 10,20,30,40,50,50 and reset on mismatch', () => {
  const w = playing(5, null, 3);   // winter, 12 pairs
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = w.cards.find(c => c.state === 'down' && !c.moving), b = pairOf(w, a);
    while (!w.isSelectable(b)) w.update(H);
    w.select(a.id); w.select(b.id); run(w, 0.25, H);
    pts.push(...events(w).filter(e => e.type === 'match').map(e => e.points));
    idle(w);
  }
  assert.deepStrictEqual(pts, [10, 20, 30, 40, 50, 50]);
  assert.strictEqual(w.bestCombo, 6);
  const a = w.cards.find(c => c.state === 'down'), x = nonPair(w, a);
  w.select(a.id); w.select(x.id); run(w, 0.25, H);
  assert.strictEqual(w.combo, 0); assert.strictEqual(w.mistakes, 1);
});

test('world: mismatch wiggles, shows ~0.8 s, flips back; Foxy says oops', () => {
  const w = playing(6);
  const a = w.cards[0], b = nonPair(w, a), c = w.cards.find(k => k !== a && k !== b && k.state === 'down');
  w.select(a.id); w.select(b.id);
  assert.strictEqual(w.select(c.id), false, 'no 3rd card while the pair is still flipping');
  run(w, 0.19, H);
  const ev = events(w);
  assert.ok(ev.some(e => e.type === 'mismatch' && e.ids[0] === a.id && e.ids[1] === b.id));
  run(w, 0.05, H);
  assert.ok(a.wiggle > 0.5 && a.rot !== 0, 'wiggling');
  assert.strictEqual(w.fox.frame, 'oops');
  run(w, 0.4, H);
  assert.strictEqual(a.wiggle, 0);
  run(w, 0.3, H);
  assert.strictEqual(a.state, 'up', 'faces stay visible mismatchShow (0.8 s) after both are fully shown');
  run(w, 0.06, H);
  assert.strictEqual(a.state, 'down'); assert.strictEqual(b.state, 'down');
  assert.ok(events(w).some(e => e.type === 'unflip'));
  run(w, 0.2, H);
  assert.strictEqual(a.flip, 0); assert.strictEqual(w.open.length, 0);
});

test('world: 3rd tap during mismatch display closes the pair at once and flips the new card', () => {
  const w = playing(7);
  const a = w.cards[0], b = nonPair(w, a), c = w.cards.find(k => k !== a && k !== b && k.state === 'down');
  w.select(a.id); w.select(b.id); run(w, 0.25, H); events(w);
  assert.ok(w.select(c.id), '3rd tap accepted');
  assert.strictEqual(a.state, 'down'); assert.strictEqual(b.state, 'down');
  assert.strictEqual(c.state, 'up');
  assert.deepStrictEqual(w.open, [c.id]);
  const ev = events(w).map(e => e.type);
  assert.deepStrictEqual(ev, ['unflip', 'flip']);
  // tapping one of the mismatched cards just closes the pair
  const w2 = playing(7);
  const a2 = w2.cards[0], b2 = nonPair(w2, a2);
  w2.select(a2.id); w2.select(b2.id); run(w2, 0.25, H);
  assert.strictEqual(w2.select(a2.id), false);
  assert.strictEqual(a2.state, 'down'); assert.strictEqual(w2.open.length, 0);
});

// ---------- gravity slides ----------
function lineKey(w, c) { return w.gravity.y ? c.col : c.row; }
function along(w, c) { return w.gravity.y ? c.row : c.col; }
function checkPacked(w) {
  const g = w.gravity, L = live(w), lines = {};
  const cells = new Set();
  for (const c of L) {
    const k = c.col + ',' + c.row;
    assert.ok(!cells.has(k), 'two cards in cell ' + k); cells.add(k);
    assert.ok(c.col >= 0 && c.col < w.cols && c.row >= 0 && c.row < w.rows);
    (lines[lineKey(w, c)] = lines[lineKey(w, c)] || []).push(along(w, c));
  }
  const len = g.y ? w.rows : w.cols, toEnd = g.y ? g.y > 0 : g.x > 0;
  for (const k in lines) {
    const idx = lines[k].sort((a, b) => a - b);
    const want = idx.map((_, j) => toEnd ? len - idx.length + j : j);
    assert.deepStrictEqual(idx, want, 'line ' + k + ' packed toward gravity');
  }
}
function slideScenario(seed, level, cfg) {
  const w = playing(seed, cfg, level);
  let slides = 0, maxOneCell = 0;
  let guard = 0;
  while (live(w).length > 2 && guard++ < 40) {
    // pick a pair (prefer cards not at the gravity edge so things move)
    const cand = w.cards.filter(c => c.state === 'down');
    const a = cand[(guard * 7) % cand.length], b = pairOf(w, a);
    // order-preservation snapshot: per line, the sequence of ids along the axis
    const before = {};
    for (const c of live(w)) if (c !== a && c !== b) (before[lineKey(w, c)] = before[lineKey(w, c)] || []).push([along(w, c), c.id]);
    const prevCell = {};
    for (const c of live(w)) prevCell[c.id] = [c.col, c.row];
    w.select(a.id); w.select(b.id);
    let t = 0, slideAt = null, moves = null;
    const doneAt = {};
    while (t < 3) {
      w.update(H); t += H;
      const ov = overlaps(w); assert.ok(!ov, 'overlap ' + ov + ' level ' + level);
      for (const e of w.drainEvents()) if (e.type === 'slide') { slides++; slideAt = t; moves = e.moves; }
      if (moves) {
        for (const m of moves) {
          const c = w.card(m.id);
          if (c.moving) assert.strictEqual(w.isSelectable(c), false, 'moving card not selectable');
          if (!c.moving && doneAt[m.id] === undefined) doneAt[m.id] = t - slideAt;
        }
      }
      if (t > 0.7 && !w.cards.some(c => c.moving || c.settling || c.state === 'matched')) break;
    }
    if (moves) {
      for (const m of moves) {
        const d = Math.abs(m.col - m.fromCol) + Math.abs(m.row - m.fromRow);
        assert.deepStrictEqual(prevCell[m.id], [m.fromCol, m.fromRow]);
        if (d === 1) maxOneCell = Math.max(maxOneCell, doneAt[m.id]);
        assert.ok(doneAt[m.id] < 1.15, 'travel time ' + doneAt[m.id] + ' for ' + d + ' cells');
      }
    }
    // settled exactly on cells, order preserved, packed
    for (const c of live(w)) {
      const p = w.cellPos(c.col, c.row);
      assert.ok(c.x === p.x && c.y === p.y && !c.moving && !c.settling, 'settled');
    }
    for (const k in before) {
      const ids = before[k].sort((x, y) => x[0] - y[0]).map(x => x[1]);
      const now = live(w).filter(c => lineKey(w, c) === +k).sort((x, y) => along(w, x) - along(w, y)).map(c => c.id);
      assert.deepStrictEqual(now, ids, 'order preserved in line ' + k);
    }
    checkPacked(w);
  }
  return { w, slides, maxOneCell };
}

test('slide: spring floats UP — packed, ordered, no overlaps, settles, 1-cell < 0.7 s', () => {
  for (const seed of [1, 2, 3]) {
    const r = slideScenario(seed, 0);
    assert.ok(r.slides >= 2, 'slides happened ' + r.slides);
    assert.ok(r.maxOneCell > 0.3 && r.maxOneCell < 0.7, '1-cell slide ' + r.maxOneCell);
  }
});
test('slide: winter sinks DOWN', () => {
  for (const seed of [1, 2, 3]) { const r = slideScenario(seed, 3); assert.ok(r.slides >= 2); assert.ok(r.maxOneCell < 0.7); }
});
test('slide: autumn pushes SIDEWAYS (both directions over seeds/laps)', () => {
  const dirs = new Set();
  for (const seed of [1, 2, 3, 4]) for (const lv of [2, 6]) {
    const r = slideScenario(seed, lv);
    dirs.add(r.w.gravity.x);
    assert.ok(r.slides >= 2); assert.ok(r.maxOneCell < 0.7);
  }
  assert.deepStrictEqual([...dirs].sort(), [-1, 1]);
  // laps alternate direction for one seed
  const w = new RF.World({ seed: 1 }); w.startLevel(2); const g0 = w.gravity.x; w.startLevel(6);
  assert.strictEqual(w.gravity.x, -g0);
});
test('slide: summer still water — nothing moves', () => {
  const w = playing(3, null, 1);
  const cells = w.cards.map(c => [c.col, c.row]);
  for (let i = 0; i < 4; i++) {
    const a = w.cards.find(c => c.state === 'down'); w.select(a.id); w.select(pairOf(w, a).id); run(w, 1, H);
    assert.ok(!events(w).some(e => e.type === 'slide'));
  }
  w.cards.forEach((c, i) => assert.deepStrictEqual([c.col, c.row], cells[i]));
});
test('slide: overshoot is small and the settle bob is selectable', () => {
  const w = playing(3, null, 3);
  const col = w.cards.filter(c => c.col === 0).sort((a, b) => a.row - b.row);
  const a = col[3], b = pairOf(w, a);
  w.select(a.id); w.select(b.id);
  const mover = col[2];
  let maxOver = 0, sawSettle = false;
  run(w, 2.5, H, () => {
    const p = w.cellPos(mover.col, mover.row);
    if (mover.row === 3) maxOver = Math.max(maxOver, mover.y - p.y);
    if (mover.settling) { sawSettle = true; assert.ok(w.isSelectable(mover) || w.open.length > 0); }
  });
  assert.ok(sawSettle);
  assert.ok(maxOver > 0.3 && maxOver < 5, 'overshoot ' + maxOver);
});

// ---------- hit testing & keyboard ----------
test('cardAt: centres, edges, gaps, and animated positions during a slide', () => {
  const w = playing(8);
  for (const c of w.cards) assert.strictEqual(w.cardAt(c.x, c.y), c.id);
  const c0 = w.card(w.cards[0].id);
  assert.strictEqual(w.cardAt(c0.x + w.cfg.cardW / 2 - 0.1, c0.y + w.cfg.cardH / 2 - 0.1), c0.id);
  assert.strictEqual(w.cardAt(c0.x + w.cfg.cardW / 2 + w.cfg.cardGap / 2, c0.y), null, 'gap between cards');
  assert.strictEqual(w.cardAt(100, 100), null);
  // spring: remove a top-row pair so cards below slide up; mid-slide hit test follows x,y
  const w2 = playing(8);
  const top = w2.cards.find(c => c.row === 0 && w2.cards.some(k => k.col === c.col && k.row === 2 && k.face !== c.face));
  w2.select(top.id); w2.select(pairOf(w2, top).id);
  let checked = 0;
  run(w2, 2, H, () => {
    for (const c of w2.cards) if (c.moving) {
      assert.strictEqual(w2.cardAt(c.x, c.y), c.id); checked++;
      assert.strictEqual(w2.select(c.id), false, 'moving cards cannot be flipped');
    }
  });
  assert.ok(checked > 10);
  for (const c of live(w2)) assert.strictEqual(w2.cardAt(w2.cellPos(c.col, c.row).x, w2.cellPos(c.col, c.row).y), c.id);
  const gone = w2.cards.find(c => c.state === 'gone');
  assert.ok(gone);
  assert.ok(w2.cards.filter(c => c.state === 'gone').every(g => w2.cardAt(g.x, g.y) !== g.id));
});

test('keyboard cursor: moves, clamps at edges, skips gone cards, selects', () => {
  const w = playing(9, null, 1);       // summer: no slides → holes stay
  assert.deepStrictEqual(w.cursor, { col: 0, row: 0 });
  w.moveCursor(-1, 0); assert.deepStrictEqual(w.cursor, { col: 0, row: 0 }, 'clamped');
  w.moveCursor(1, 0); w.moveCursor(1, 0); assert.deepStrictEqual(w.cursor, { col: 2, row: 0 });
  w.moveCursor(0, 1); assert.deepStrictEqual(w.cursor, { col: 2, row: 1 });
  for (let i = 0; i < 9; i++) w.moveCursor(1, 0);
  assert.deepStrictEqual(w.cursor, { col: 3, row: 1 });
  // remove the pair at (1,0) → moving from (0,0) right skips the hole
  const hole = w.cards.find(c => c.col === 1 && c.row === 0);
  w.select(hole.id); w.select(pairOf(w, hole).id); run(w, 1, H);
  const partner = w.cards.find(c => c.face === hole.face && c !== hole);
  w.cursor.col = 0; w.cursor.row = 0;
  if (!(partner.col === 0 && partner.row === 0)) {
    w.moveCursor(1, 0);
    const exp = partner.col === 2 && partner.row === 0 ? 3 : 2;
    assert.deepStrictEqual(w.cursor, { col: exp, row: 0 }, 'skipped gone card(s)');
  }
  const under = w.cards.find(c => c.state !== 'gone' && c.col === w.cursor.col && c.row === w.cursor.row);
  assert.ok(w.selectCursor()); assert.strictEqual(under.state, 'up');
  // cursor on a removed card snaps to a live neighbour
  w.cursor.col = hole.col; w.cursor.row = hole.row;
  w._fixCursor();
  assert.ok(w.cards.some(c => c.state !== 'gone' && c.col === w.cursor.col && c.row === w.cursor.row));
});

// ---------- air ----------
test('air: drains 1/s only while playing, airlow once at 25 %, dead at 0', () => {
  const w = new RF.World({ seed: 10 });
  run(w, 0.9, H);
  assert.strictEqual(w.air, w.airMax, 'no drain during the deal');
  untilPlaying(w); events(w);
  const a0 = w.air; run(w, 5, H);
  assert.ok(Math.abs(a0 - w.air - 5) < 0.02, 'drain 1/s');
  let lows = 0, deadEv = null, t = 5;
  while (w.state === 'playing' && t < 200) {
    w.update(1 / 30); t += 1 / 30;
    for (const e of events(w)) { if (e.type === 'airlow') { lows++; assert.ok(Math.abs(w.air - 0.25 * w.airMax) < 0.1); } if (e.type === 'dead') deadEv = e; }
  }
  assert.strictEqual(lows, 1);
  assert.strictEqual(w.state, 'dead'); assert.strictEqual(w.air, 0);
  assert.ok(deadEv && deadEv.score === w.score);
  assert.strictEqual(w.fox.mood, 'surface');
  assert.strictEqual(w.select(w.cards[0].id), false, 'no input when dead');
  const y0 = w.fox.y; run(w, 3, H); assert.ok(w.fox.y < y0 || w.fox.y === w.cfg.foxBounds.y0, 'Foxy floats up');
  w.reset(); assert.strictEqual(w.state, 'ready'); assert.strictEqual(w.score, 0); assert.strictEqual(w.air, w.airMax);
});

test('air: airlow re-arms only after refilling above 40 %', () => {
  const w = playing(11, { airMax: [20, 20, 20, 20], airPerMatch: 5 });
  let lows = 0;
  run(w, 15.5, H, () => { lows += events(w).filter(e => e.type === 'airlow').length; });
  assert.strictEqual(lows, 1);
  // two quick matches → 4.5 + 10 = 14.5 s > 40 %; then drain again → second airlow
  for (let i = 0; i < 2; i++) { const a = w.cards.find(c => c.state === 'down' && !c.moving); const b = pairOf(w, a); while (!w.isSelectable(b)) w.update(H); w.select(a.id); w.select(b.id); run(w, 0.2, H); }
  assert.ok(w.air > 8);
  run(w, 12, H, () => { lows += events(w).filter(e => e.type === 'airlow').length; });
  assert.strictEqual(lows, 2);
});

// ---------- level flow ----------
function clearLevel(w) {
  let guard = 0;
  while (w.state === 'playing' && guard++ < 200) {
    const a = w.cards.find(c => c.state === 'down' && !c.moving);
    if (!a) { w.update(H); continue; }
    const b = pairOf(w, a);
    while (!w.isSelectable(b) && w.state === 'playing') w.update(H);
    w.select(a.id); w.select(b.id); run(w, 0.2, H);
  }
  let t = 0; while (w.state === 'playing' && t < 3) { w.update(H); t += H; }
}
test('level: clear → bonus = round(air)×airBonusPerSec → cleared 2.5 s → next season; lap after winter', () => {
  const w = playing(12);
  const evs = [];
  clearLevel(w);
  evs.push(...events(w));
  assert.strictEqual(w.state, 'cleared');
  const cl = evs.find(e => e.type === 'cleared');
  assert.ok(cl && cl.level === 0);
  assert.strictEqual(cl.bonus, Math.round(cl.air) * w.cfg.airBonusPerSec);
  assert.strictEqual(w.score, 6 * 10 + 10 + 20 + 30 + 40 + 50 + 50 - 60 + cl.bonus);  // 10..50 capped combo
  assert.strictEqual(w.fox.frame, 'cheer');
  const airFrozen = w.air; run(w, 1, H); assert.strictEqual(w.air, airFrozen, 'no drain while celebrating');
  run(w, 1.49, H); assert.strictEqual(w.state, 'cleared');
  run(w, 0.02, H);
  assert.strictEqual(w.level, 1); assert.strictEqual(w.season, 1); assert.strictEqual(w.state, 'ready');
  assert.ok(events(w).some(e => e.type === 'season' && e.season === 1 && e.level === 1));
  assert.strictEqual(w.air, w.cfg.airMax[1]);
  // through autumn and winter → lap 1 spring with less air
  for (let lv = 1; lv < 4; lv++) { untilPlaying(w); clearLevel(w); run(w, 2.6, H); }
  assert.strictEqual(w.level, 4); assert.strictEqual(w.season, 0); assert.strictEqual(w.lap, 1);
  assert.ok(Math.abs(w.airMax - w.cfg.airMax[0] * w.cfg.lapAirMul) < 1e-9);
  assert.ok(Math.abs(w.airPerMatch - w.cfg.airPerMatch * w.cfg.lapAirMul) < 1e-9);
  assert.deepStrictEqual([w.cols, w.rows], [4, 3]);
  assert.strictEqual(w.levelsCleared, 4);
});

test('level: air stops once the last pair is matched (no unfair death during the pop)', () => {
  const w = playing(13, { airMax: [8, 8, 8, 8], airPerMatch: 0 });
  // match 5 pairs fast, then let air get very low, then match the last pair
  for (let i = 0; i < 5; i++) { const a = w.cards.find(c => c.state === 'down' && !c.moving); const b = pairOf(w, a); while (!w.isSelectable(b)) w.update(H); w.select(a.id); w.select(b.id); run(w, 0.2, H); }
  while (w.air > 0.4) w.update(H);
  const a = w.cards.find(c => c.state === 'down' && !c.moving); const b = pairOf(w, a);
  while (!w.isSelectable(a) || !w.isSelectable(b)) w.update(H);
  w.select(a.id); w.select(b.id);
  run(w, 1.5, H);
  assert.strictEqual(w.state, 'cleared');
});

// ---------- Foxy & cupcakes ----------
test('foxy: swims to the cupcake smoothly, eats it, faces travel direction', () => {
  const w = playing(14);
  const a = w.cards[0]; w.select(a.id); w.select(pairOf(w, a).id);
  run(w, 0.8, H);
  assert.ok(events(w).some(e => e.type === 'cupcake'));
  const cup = w.cupcakes[0], y0 = cup.y;
  let eatEv = null, t = 0, maxStep = 0, sawEat = false, flipRight = false;
  while (!eatEv && t < 8) {
    const px = w.fox.x, py = w.fox.y;
    w.update(H); t += H;
    maxStep = Math.max(maxStep, Math.hypot(w.fox.x - px, w.fox.y - py));
    if (w.fox.vx > 30) flipRight = flipRight || w.fox.flipX === 1;
    for (const e of events(w)) if (e.type === 'eat') eatEv = e;
  }
  assert.ok(eatEv, 'eaten within 8 s (t=' + t.toFixed(2) + ')');
  assert.ok(t < 4, 'Foxy is quick enough: ' + t.toFixed(2));
  assert.ok(flipRight, 'faces right while swimming right');
  assert.ok(maxStep <= w.cfg.foxFetchSpeed * H + 1e-6, 'no teleport');
  assert.strictEqual(w.cupcakesEaten, 1);
  assert.strictEqual('× ' + w.cupcakes, '× 1', 'array prints as the eaten counter');
  assert.strictEqual(`${w.cupcakes}`, '1');
  assert.strictEqual(w.fox.frame, 'eat'); sawEat = true;
  assert.ok(cup.alive === false);
  run(w, 0.5, H);
  assert.strictEqual(w.cupcakes.length, 0, 'eaten cupcake removed after shrinking');
  assert.ok(w.fox.frame.startsWith('swim') || w.fox.frame === 'cheer' || w.fox.frame === 'oops');
  assert.ok(sawEat && y0 !== undefined);
  // cupcake floats UP and drifts LEFT toward Foxy if she cannot reach it (fox disabled by huge eat radius 0)
  const w2 = playing(14, { foxFetchSpeed: 0.001, foxIdleSpeed: 0.001 });
  const b = w2.cards[0]; w2.select(b.id); w2.select(pairOf(w2, b).id); run(w2, 0.8, H);
  const c2 = w2.cupcakes[0], x1 = c2.x, y1 = c2.y;
  run(w2, 2, H);
  assert.ok(c2.y < y1 - 20 && c2.x < x1 - 20, 'rises and drifts toward Foxy');
});

test('foxy: idle wander stays in her zone, swim frames cycle, cheer on combo ≥ 3', () => {
  const w = playing(15, { airMax: [500, 500, 500, 500] });
  const Z = w.cfg.foxZone, frames = new Set();
  let prevAngle = w.fox.angle, prevFlip = w.fox.flipX, maxDA = 0;
  run(w, 60, 1 / 60, () => {
    frames.add(w.fox.frame);
    if (w.fox.flipX !== prevFlip) { prevFlip = w.fox.flipX; prevAngle = w.fox.angle; }
    assert.ok(w.fox.x >= Z.x0 && w.fox.x <= Z.x1 && w.fox.y >= Z.y0 && w.fox.y <= Z.y1, 'in zone ' + w.fox.x + ',' + w.fox.y);
    maxDA = Math.max(maxDA, Math.abs(w.fox.angle - prevAngle)); prevAngle = w.fox.angle;
    assert.ok(Math.abs(w.fox.angle) <= w.cfg.foxMaxTilt + 1e-9);
  });
  for (const f of ['swim1', 'swim2', 'swim3']) assert.ok(frames.has(f), f);
  assert.ok(maxDA < 0.05, 'smooth tilt ' + maxDA);
  let cheer = false;
  for (let i = 0; i < 3; i++) {
    const a = w.cards.find(c => c.state === 'down' && !c.moving); const b = pairOf(w, a);
    while (!w.isSelectable(b)) w.update(H);
    w.select(a.id); w.select(b.id); run(w, 0.2, H, () => { cheer = cheer || w.fox.frame === 'cheer'; });
  }
  assert.ok(cheer, 'cheer at combo 3');
});

test('render interpolation: _px/_py are the previous sub-step positions', () => {
  const w = new RF.World({ seed: 16 });
  run(w, 0.3, H);
  const c = w.cards[w.cards.length - 1];
  const x = c.x, y = c.y, fx = w.fox.x;
  w.update(H);
  assert.strictEqual(c._px, x); assert.strictEqual(c._py, y);
  assert.strictEqual(w.fox._px, fx);
  w.update(H * 0.4);
  assert.ok(Math.abs(w._acc - H * 0.4) < 1e-12);
});

// ---------- bot ----------
test('bot: skill 1 clears 4 levels on several seeds without dying (Normal)', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const w = new RF.World({ seed }), bot = new RF.Bot(w, { skill: 1, seed });
    let t = 0;
    while (w.level < 4 && w.state !== 'dead' && t < 600) { bot.step(1 / 60); w.update(1 / 60); t += 1 / 60; }
    assert.strictEqual(w.level, 4, 'seed ' + seed + ' reached level ' + w.level + ' state ' + w.state);
    assert.strictEqual(bot.stats.deaths, 0);
    assert.strictEqual(bot.stats.forgotten, 0); assert.strictEqual(bot.stats.lostTrack, 0);
    // perfect memory ≈ optimal: ~1.6 moves per pair (36 pairs in 4 levels)
    assert.ok(bot.stats.moves <= 36 * 2.0, 'moves ' + bot.stats.moves);
    assert.strictEqual(bot.stats.matches, 36);
  }
});

test('bot: skill 0.3 sometimes runs out of air in endless play; worse memory = more moves', () => {
  let died = 0, moves03 = 0, moves1 = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const w = new RF.World({ seed }), bot = new RF.Bot(w, { skill: 0.3, seed });
    let t = 0;
    while (w.state !== 'dead' && w.level < 40 && t < 2400) { bot.step(1 / 30); w.update(1 / 30); t += 1 / 30; }
    if (w.state === 'dead') died++;
    assert.ok(bot.stats.lostTrack > 0 && bot.stats.forgotten > 0);
    const w1 = new RF.World({ seed }), b1 = new RF.Bot(w1, { skill: 1, seed }), b3 = new RF.Bot(new RF.World({ seed }), { skill: 0.3, seed });
    for (let i = 0; i < 30 * 120; i++) { b1.step(1 / 30); w1.update(1 / 30); b3.step(1 / 30); b3.world.update(1 / 30); }
    moves1 += b1.stats.moves / Math.max(1, b1.stats.matches); moves03 += b3.stats.moves / Math.max(1, b3.stats.matches);
  }
  assert.ok(died >= 1, 'died in ' + died + '/6');
  assert.ok(moves03 > moves1 * 1.15, 'moves per pair ' + (moves03 / 6).toFixed(2) + ' vs ' + (moves1 / 6).toFixed(2));
});

test('difficulty: a slow child-like player (skill 0.5, 1.2–2.4 s per pick) clears Spring on Normal', () => {
  let ok = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const w = new RF.World({ seed }), bot = new RF.Bot(w, { skill: 0.5, seed, thinkMin: 1.2, thinkMax: 2.4 });
    let t = 0;
    while (w.level < 1 && w.state !== 'dead' && t < 300) { bot.step(1 / 30); w.update(1 / 30); t += 1 / 30; }
    if (w.level === 1) ok++;
  }
  assert.strictEqual(ok, 8);
});

// ---------- weather ----------
test('weather: per-season counts bounded (40–90) over 60 s, valid sprites, layers', () => {
  for (let s = 0; s < 4; s++) {
    const wx = new RF.Weather({ seed: 3 + s });
    wx.setSeason(s, { instant: true });
    let mn = 1e9, mx = 0;
    for (let i = 0; i < 3600; i++) {
      wx.update(1 / 60, {});
      if (i > 120) { mn = Math.min(mn, wx.particles.length); mx = Math.max(mx, wx.particles.length); }
      if (i % 60 === 0) for (const p of wx.particles) {
        assert.ok(VALID_SPRITES.includes(p.sprite), 'sprite ' + p.sprite);
        assert.ok(p.layer === 'back' || p.layer === 'front');
        for (const k of ['x', 'y', 'size', 'rot', 'flipX', 'alpha']) assert.ok(Number.isFinite(p[k]), k + ' ' + p.kind);
        assert.ok(p.alpha >= 0 && p.alpha <= 1);
        if (p.sprite === 'dot') assert.ok(p.color);
        if (p.layer === 'front') assert.ok(p.alpha <= 0.6, 'front layer stays translucent');
      }
    }
    assert.ok(mn >= 40 && mx <= 90, 'season ' + s + ' count ' + mn + '..' + mx);
    const front = wx.particles.filter(p => p.layer === 'front').length;
    assert.ok(front <= 12, 'front sparse ' + front);
    const st = wx.stats().bySprite;
    if (s === 0) assert.ok(st.plankton > 10 && st.bubble > 5 && (st.fish_a || 0) + (st.fish_b || 0) >= 5);
    if (s === 1) { assert.ok(wx.schools.length === 2 && st.bubble > 10); assert.ok(Math.abs(wx.ambient.rays - 0.35) < 1e-9); }
    if (s === 2) { assert.ok(st.kelp > 10 && wx.current > 25, 'kelp in a current'); }
    if (s === 3) { assert.ok(st.dot > 30 && st.snow > 5 && (st.jelly_a || 0) + (st.jelly_b || 0) === 4); assert.ok(wx.ambient.fog > 0.25 && wx.ambient.tint); }
  }
});

test('weather: motion models — bubbles rise & grow, snow sinks, kelp drifts with current, jellies pulse', () => {
  const wx = new RF.Weather({ seed: 1 });
  const b = wx.particles.find(p => p.kind === 'bubble' && p.y > 300);
  const y0 = b.y, s0 = b.size; wx.update(2, {});
  assert.ok(b.y < y0 - 40 && b.size > s0, 'bubble rises & grows');
  const w3 = new RF.Weather({ seed: 2, season: 3 });
  const sn = w3.particles.find(p => p.kind === 'seasnow' && p.y < 300), sy = sn.y;
  const j = w3.particles.find(p => p.kind === 'jelly'), sprites = new Set();
  for (let i = 0; i < 180; i++) { w3.update(1 / 60, {}); sprites.add(j.sprite); }
  assert.ok(sn.y > sy + 10, 'snow sinks');
  assert.ok(sprites.has('jelly_a') && sprites.has('jelly_b'), 'jelly pulse frames');
  const w2 = new RF.Weather({ seed: 3, season: 2 });
  const k = w2.particles.find(p => p.kind === 'kelp' && p.x > 100 && p.x < 700), kx = k.x;
  w2.update(2, {});
  assert.ok(Math.sign(k.x - kx) === Math.sign(w2.current) && Math.abs(k.x - kx) > 30, 'kelp drifts');
  const w1 = new RF.Weather({ seed: 4, season: 1 });
  const f = w1.particles.find(p => p.kind === 'fish'), fr = new Set();
  for (let i = 0; i < 60; i++) { w1.update(1 / 60, {}); fr.add(f.sprite); }
  assert.ok(fr.has('fish_a') && fr.has('fish_b'));
  const sch = w1.schools.find(s => s.id === f.school);
  assert.strictEqual(f.flipX, Math.sign(sch.vx), 'fish face the school direction');
});

test('weather: smooth season hand-over (~2 s), bounded, deterministic', () => {
  const wx = new RF.Weather({ seed: 11 });
  for (let cycle = 0; cycle < 6; cycle++) {
    const next = (wx.season + 1) % 4;
    wx.setSeason(next);
    let mx = 0;
    wx.update(0.3, {});
    const fresh = wx.particles.filter(p => p.season === next && p.kind !== 'fish');
    assert.ok(fresh.every(p => p.alpha < 0.45), 'new particles fade in');
    for (let i = 0; i < 60 * 4; i++) { wx.update(1 / 60, {}); mx = Math.max(mx, wx.particles.length); }
    assert.ok(mx <= 150, 'bounded during transition ' + mx);
    const old = wx.particles.filter(p => p.season !== next).length;
    assert.strictEqual(old, 0, 'old season gone after ~4 s');
  }
  const a = new RF.Weather({ seed: 5 }), b = new RF.Weather({ seed: 5 });
  for (let i = 0; i < 900; i++) {
    if (i === 300) { a.setSeason(2); b.setSeason(2); }
    if (i === 600) { a.setSeason(3); b.setSeason(3); }
    a.update(1 / 60, { current: 5 }); b.update(1 / 60, { current: 5 });
  }
  assert.deepStrictEqual(JSON.parse(JSON.stringify(a.particles)), JSON.parse(JSON.stringify(b.particles)));
});

// ---------- performance ----------
test('performance: 10 minutes of game time (world + bot + weather) runs fast', () => {
  const t0 = process.hrtime.bigint();
  const w = new RF.World({ seed: 31 });
  const bot = new RF.Bot(w, { skill: 0.8, seed: 31 });
  const wx = new RF.Weather({ seed: 31 });
  let maxP = 0;
  for (let i = 0; i < 60 * 600; i++) {
    bot.step(1 / 60); w.update(1 / 60);
    for (const e of w.drainEvents()) if (e.type === 'season') wx.setSeason(e.season);
    wx.update(1 / 60, {});
    maxP = Math.max(maxP, wx.particles.length);
    if (w.state === 'dead') w.reset();
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(w.cupcakes.length <= 6, 'cupcakes bounded');
  assert.ok(maxP <= 150);
  assert.ok(ms < 8000, 'took ' + ms.toFixed(0) + ' ms');
  console.log('      10 min sim in ' + ms.toFixed(0) + ' ms; level ' + w.level + ', score ' + w.score + ', max particles ' + maxP);
});

// ---------- runner ----------
let pass = 0, fail = 0;
for (const t of tests) {
  try { t.fn(); pass++; console.log('  ok   ' + t.name); }
  catch (e) { fail++; console.log('  FAIL ' + t.name + '\n       ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n       ') : e)); }
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
