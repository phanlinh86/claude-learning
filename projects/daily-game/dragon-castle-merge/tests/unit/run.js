#!/usr/bin/env node
// Ember's Glow Castle — headless unit tests for rng / world / weather / bot (node, no deps).
// Run from projects/daily-game/dragon-castle-merge:   node tests/unit/run.js
'use strict';
const assert = require('assert');
const { load } = require('./load');

const EG = load();
const C = EG.CONFIG;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const H = 1 / 120;
const J = v => v === undefined ? v : JSON.parse(JSON.stringify(v));
// objects made inside the vm sandbox have another realm's prototypes: compare plain JSON copies
const deq = (a, b, m) => assert.deepStrictEqual(J(a), J(b), m);
const ndeq = (a, b, m) => assert.notDeepStrictEqual(J(a), J(b), m);
const near = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, (m || '') + ' got ' + a + ' want ' + b + ' ±' + tol);

// ---------- helpers ----------
function mk(diff, seed, w, h, level) {
  return new EG.World({ seed: seed || 1, difficulty: diff || 'normal', width: w || 960, height: h || 540, level: level || 0 });
}
function run(w, s) { const n = Math.round(s / H); for (let i = 0; i < n; i++) w.update(H); }
/** step until the board is ready for the next drop (or game over) */
function settle(w, max) {
  let t = 0; max = max || 10;
  do { w.update(H); t += H; } while ((w.isBusy() || w.phase !== 'aim') && w.phase !== 'over' && t < max);
  return t;
}
/** hold a given light, drop it into col and let everything resolve; returns the event list */
function dropT(w, col, tier, kind) {
  w.held = { tier: kind === 'pumpkin' ? 0 : tier, kind: kind || 'light' };
  w.drop(col);
  settle(w);
  return w.drainEvents();
}
const types = ev => ev.map(e => e.type);
const of = (ev, t) => ev.filter(e => e.type === t);
function board(w) { return w._tiers(); }
function playBot(diff, seed, skill, maxS, opts) {
  opts = opts || {};
  const w = mk(diff, seed, opts.w, opts.h);
  const bot = new EG.Bot(w, { skill, seed: seed * 3 + 1 });
  const wx = opts.weather ? new EG.Weather({ width: w.layout.width, height: w.layout.height, seed }) : null;
  let t = 0, maxP = 0; const ev = [], dt = opts.dt || 1 / 60;
  while (w.phase !== 'over' && t < maxS) {
    bot.step(dt); w.update(dt);
    for (const x of w.drainEvents()) {
      ev.push(x.type);
      if (wx) {
        if (x.type === 'levelUp') wx.setLevel(x.zone);
        if (x.type === 'merge') wx.burst('sparkle', x.x, x.y, 10, { gravity: 120 });
        if (x.type === 'goal') wx.burst('star', x.x, x.y, 24, { gravity: -60, speed: 220 });
        if (x.type === 'land') wx.burst('dust', x.item.x, x.item.y, 4, { up: 1 });
      }
    }
    if (wx) { wx.update(dt, w.layout); maxP = Math.max(maxP, wx.particles.length); }
    t += dt;
  }
  return { w, t, bot, ev, maxP };
}

// ---------- RNG / layout ----------
test('rng: deterministic, in range, API', () => {
  const a = new EG.RNG(42), b = new EG.RNG(42), c = new EG.RNG('x');
  for (let i = 0; i < 300; i++) { const x = a.next(); assert.strictEqual(x, b.next()); assert.ok(x >= 0 && x < 1); }
  for (const f of ['next', 'range', 'int', 'pick', 'chance', 'gauss', 'sign', 'fork']) assert.strictEqual(typeof c[f], 'function', f);
  for (let i = 0; i < 300; i++) { const m = c.int(2, 5); assert.ok(m >= 2 && m <= 5 && m === (m | 0)); }
});

test('layout: DESIGN §2 numbers (landscape, hard, portrait, iPad)', () => {
  const L = EG.World.computeLayout(960, 540, 5, 7);
  assert.strictEqual(L.cell, 55); assert.strictEqual(L.boardW, 275); assert.strictEqual(L.boardH, 385);
  assert.strictEqual(L.boardY, 133); assert.strictEqual(L.boardX, Math.round((960 - 275) / 2));
  near(L.emberY, 133 - 55 * 0.95, 1e-9); near(L.holdY, L.emberY + 55 * 0.55, 1e-9); near(L.itemSize, 55 * 0.86, 1e-9);
  assert.strictEqual(EG.World.computeLayout(960, 540, 5, 6).cell, 65);
  const P = EG.World.computeLayout(560, 1200, 5, 7);
  assert.ok(P.portrait); assert.strictEqual(P.cell, 104); assert.strictEqual(P.boardY + P.boardH, 1200 - 60);
  const w = mk('normal', 1);
  near(w.colX(0), L.boardX + 27.5, 1e-9); near(w.rowY(0), L.boardY + L.boardH - 27.5, 1e-9);
  assert.strictEqual(mk('hard').rows, 6);
  for (const k of ['width', 'height', 'cols', 'rows', 'cell', 'boardX', 'boardY', 'boardW', 'boardH', 'emberY', 'holdY', 'itemSize', 'portrait']) assert.ok(k in w.layout, k);
});

// ---------- determinism ----------
test('determinism: same seed + same drops → same state (and same board at another frame rate)', () => {
  function play(dt, seed) {
    const w = mk('normal', seed); let k = 0, t = 0;
    while (k < 60 && t < 300 && w.phase !== 'over') {
      if (w.phase === 'aim') { const c = (k * 3 + (w.held.tier || 0)) % 5; if (w.canDrop(c)) w.drop(c); else { for (let j = 0; j < 5; j++) if (w.canDrop(j)) { w.drop(j); break; } } k++; }
      w.update(dt); t += dt;
    }
    settle(w);
    return w;
  }
  const a = play(1 / 60, 7), b = play(1 / 60, 7), c = play(1 / 37, 7), d = play(1 / 60, 8);
  deq(J(a.getState()), J(b.getState()));
  deq(J(a.items.map(i => [i.id, i.x, i.y, i.state])), J(b.items.map(i => [i.id, i.x, i.y, i.state])));
  deq(board(a), board(c), 'board does not depend on frame rate');
  assert.strictEqual(a.score, c.score); deq(a.held, c.held); deq(a.next, c.next);
  ndeq(J(a.getState().board), J(d.getState().board), 'a different seed plays differently');
  assert.ok(a.stats.drops >= 50 && a.stats.merges > 10);
});

// ---------- motion ----------
test('fall: gravity arc, one soft bounce, squash spring, settle time', () => {
  const w = mk('normal', 1); w.drainEvents();
  const L = w.layout, g = C.gravity * L.cell / 55;
  w.held = { tier: 1, kind: 'light' };
  assert.ok(w.drop(2));
  let t = 0, it = null, landT = -1, bounceT = -1, landSpeed = 0, apex = 1e9, sq = 0, monotone = true, lastY = -1e9, sqNeg = false;
  const ty = w.rowY(0);
  while (t < 2) {
    w.update(H); t += H;
    it = it || w.items[0];
    for (const e of w.drainEvents()) {
      if (e.type === 'land') { landT = t; landSpeed = e.speed; }
      if (e.type === 'bounce') bounceT = t;
    }
    if (!it) continue;
    if (landT < 0) { if (it.y < lastY) monotone = false; lastY = it.y; assert.ok(it.prevY <= it.y + 1e-9); }
    else if (bounceT < 0) apex = Math.min(apex, it.y);
    sq = Math.max(sq, it.squash);
    if (it.squash < -0.01) sqNeg = true;
  }
  const d = ty - L.holdY, tFall = Math.sqrt(2 * d / g);
  assert.ok(monotone, 'falls straight down, accelerating');
  near(landT, tFall + H, 0.02, 'land time');
  near(landSpeed, Math.sqrt(2 * g * d), 25, 'impact speed');
  const v2 = landSpeed * C.restitution, hb = v2 * v2 / (2 * g);
  near(ty - apex, hb, 2, 'bounce height ≈ e²·drop');
  near(bounceT - landT, 2 * v2 / g, 0.02, 'bounce duration');
  assert.ok(bounceT < 0.9, 'whole fall + bounce under 0.9 s');
  assert.ok(sq > 0.4 && sq <= C.squashMax + 1e-9, 'landing squash ' + sq);
  assert.ok(sqNeg, 'squash overshoots (spring), then…');
  assert.strictEqual(it.squash, 0, '…settles back to 0');
  assert.strictEqual(it.state, 'rest'); assert.strictEqual(it.y, ty); assert.strictEqual(it.x, w.colX(2));
  assert.strictEqual(w.phase, 'aim');
  // a cascade hop of one row still bounces (tiny); a touch-down slower than bounceMin does not bounce at all
  const w2 = mk('normal', 1); w2.setBoard([[2, 1]]); w2.drainEvents();
  const e2 = dropT(w2, 0, 1);
  deq(types(e2).filter(x => x === 'land' || x === 'bounce'), ['land', 'bounce', 'land', 'bounce', 'land', 'bounce']);
  const w3 = mk('normal', 1); w3.setBoard([[1, 2, 1, 2, 1, 2, 3]]); w3.drainEvents();
  const e3 = dropT(w3, 0, 3);                                   // overflow light: lands at once, no bounce
  deq(types(e3).filter(x => x === 'land' || x === 'bounce'), ['land']);
});

test('ember: critically damped flight to the column, leans with her speed, no overshoot', () => {
  const w = mk('normal', 1); w.drainEvents();
  const tx = w.colX(4); let maxX = 0, maxTilt = 0;
  w.aim(4);
  deq(w.drainEvents(), [{ type: 'aim', col: 4 }]);
  for (let i = 0; i < 60; i++) { w.update(H); maxX = Math.max(maxX, w.ember.x); maxTilt = Math.max(maxTilt, w.ember.tilt); assert.ok(w.ember.prevX <= w.ember.x + 1e-9); }
  near(w.ember.x, tx, 2, 'there in 0.5 s');
  assert.ok(maxX <= tx + 0.5, 'no overshoot');
  assert.ok(maxTilt > 0.15 && maxTilt <= C.emberTiltMax + 1e-9, 'tilt ' + maxTilt);
  run(w, 1); near(w.ember.tilt, 0, 0.01); assert.strictEqual(w.ember.col, 4);
  w.aim(99); assert.strictEqual(w.ember.targetCol, 4, 'clamped');
  w.aim(-3); assert.strictEqual(w.ember.targetCol, 0);
  // drop from far away: released after dropWait at the latest, then the light glides onto its column
  const w2 = mk('normal', 1); w2.held = { tier: 1, kind: 'light' }; w2.drop(0);
  let t = 0; while (!w2.items.length) { w2.update(H); t += H; }
  assert.ok(t <= C.dropWait + 2 * H, 'released by ' + t);
  settle(w2); assert.strictEqual(w2.items[0].x, w2.colX(0));
});

// ---------- merges ----------
test('merge: pair, line of 3, L-shape; points formula; pop + ease-in', () => {
  let w = mk('normal', 1); w.setBoard([[1]]); w.drainEvents();
  let ev = dropT(w, 1, 1);
  let m = of(ev, 'merge');
  assert.strictEqual(m.length, 1);
  deq([m[0].tier, m[0].count, m[0].points, m[0].combo, m[0].cascade], [2, 2, 10, 1, 0]);
  deq(board(w), [[], [2], [], [], []]);
  assert.strictEqual(w.score, 10);

  w = mk('normal', 1); w.setBoard([[1], [], [1]]);
  ev = dropT(w, 1, 1); m = of(ev, 'merge');
  deq([m[0].tier, m[0].count, m[0].points], [2, 3, 15]);
  deq(board(w), [[], [2], [], [], []]);
  assert.strictEqual(w.stats.biggestGroup, 3);

  w = mk('normal', 1); w.setBoard([[1, 1]]);                   // (0,0) (0,1) + landing (1,0) = an L
  ev = dropT(w, 1, 1); m = of(ev, 'merge');
  deq([m[0].tier, m[0].count], [2, 3]);
  deq(board(w), [[], [2], [], [], []]);
  near(m[0].x, w.colX(1), 1e-9); near(m[0].y, w.rowY(0), 1e-9);

  assert.strictEqual(EG.World.points(3, 2, 0), 20);
  assert.strictEqual(EG.World.points(5, 4, 3), Math.round(80 * 2 * 1.3));
  assert.strictEqual(EG.World.points(2, 2, 25), 20, 'combo bonus capped at ×2');

  // animation: members ease in (slow start), new light pops 0.6 → 1.15 → 1
  w = mk('normal', 1); w.setBoard([[2]]); w.held = { tier: 2, kind: 'light' }; w.drop(1);
  let mem = null, x0 = 0, k = 0, popMax = 0, popMin = 9, newIt = null;
  for (let i = 0; i < 400; i++) {
    w.update(H);
    if (!mem) { mem = w.items.find(it => it.col === 0 && it.state === 'merging'); if (mem) { x0 = mem.x; k = 0; } }
    else if (mem.state === 'merging') { k++; if (k === Math.round(C.mergeTime / 2 / H)) { const f = (mem.x - x0) / (w.colX(1) - x0); assert.ok(f > 0.15 && f < 0.4, 'ease-in at half time ' + f); } }
    newIt = newIt || w.items.find(it => it.tier === 3);
    if (newIt) { popMax = Math.max(popMax, newIt.scale); popMin = Math.min(popMin, newIt.scale); }
  }
  assert.ok(popMin < 0.7 && Math.abs(popMax - C.popPeak) < 0.02, 'pop ' + popMin + '..' + popMax);
  assert.strictEqual(newIt.scale, 1); assert.strictEqual(newIt.state, 'rest');
});

test('anchor: the landed light even if another member sits further left; ties → lowest row; full-column overflow → top light', () => {
  let w = mk('normal', 1); w.setBoard([[2, 1], [3]]);
  let ev = dropT(w, 1, 1), m = of(ev, 'merge')[0];
  near(m.x, w.colX(1), 1e-9); near(m.y, w.rowY(1), 1e-9);
  deq(board(w), [[2], [3, 2], [], [], []]);

  w = mk('normal', 1); w.setBoard([[1, 1]]); w.drainEvents();
  for (const it of w.items) it._dirty = true;                  // both just moved: lowest row wins
  w._busy = true; settle(w);
  m = of(w.drainEvents(), 'merge')[0];
  near(m.y, w.rowY(0), 1e-9); deq(board(w)[0], [2]);

  w = mk('normal', 1); w.setBoard([[1, 2, 1, 2, 1, 2, 3]]);
  assert.ok(w.canDrop(0, 3));
  ev = dropT(w, 0, 3); m = of(ev, 'merge')[0];
  assert.strictEqual(m.tier, 4); near(m.y, w.rowY(6), 1e-9);
  deq(board(w)[0], [1, 2, 1, 2, 1, 2, 4]);
  deq(w.grid[0].length, 7);
});

test('cascade: a merge that falls onto its twin merges again; combo counts every merge', () => {
  const w = mk('normal', 1); w.setBoard([[2, 1]]);
  const ev = dropT(w, 0, 1), m = of(ev, 'merge');
  deq(m.map(x => [x.tier, x.combo, x.cascade]), [[2, 1, 0], [3, 2, 1]]);
  deq(board(w)[0], [3]);
  assert.strictEqual(w.score, 10 + 22);
  deq(of(ev, 'combo').map(e => e.combo), [2]);
  assert.strictEqual(w.stats.cascades, 1); assert.strictEqual(w.maxCombo, 2);
  deq(of(ev, 'newTier').map(e => e.tier), [2, 3]);
  // a tall chain: 4,3,2,1 + 1 → 5 in one drop (4 cascades)
  const w2 = mk('easy', 1); w2.setBoard([[4, 3, 2, 1]]);
  const e2 = dropT(w2, 0, 1);
  deq(of(e2, 'merge').map(x => x.tier), [2, 3, 4, 5]);
  assert.strictEqual(w2.combo, 4);
});

test('super moon: two moons touching burst for 2 × value(8) and leave the board', () => {
  const w = mk('normal', 1, 960, 540, 4); w.setBoard([[8], [], [3]]); w._goalDone = true;
  const ev = dropT(w, 1, 8), m = of(ev, 'merge');
  deq(m.map(x => [x.tier, x.count, x.super, x.points]), [[8, 2, true, 2 * EG.World.value(8)]]);
  deq(board(w), [[], [], [3], [], []]);
  assert.strictEqual(of(ev, 'goal').length, 0);
});

test('combo: carries over merging drops, resets (with comboBreak) on a drop that merges nothing', () => {
  const w = mk('normal', 1); w.setBoard([[1]]);
  dropT(w, 1, 1); assert.strictEqual(w.combo, 1);
  let ev = dropT(w, 2, 2); assert.strictEqual(w.combo, 2); deq(of(ev, 'combo'), [{ type: 'combo', combo: 2 }]);
  ev = dropT(w, 4, 4);
  assert.strictEqual(w.combo, 0);
  deq(of(ev, 'comboBreak'), [{ type: 'comboBreak', combo: 2 }]);
  ev = dropT(w, 4, 1);                                          // combo 0 → no second comboBreak
  assert.strictEqual(of(ev, 'comboBreak').length, 0);
});

test('helper: Boo comes at combo 5, carries pumpkins first then the smallest lights, keeps the combo', () => {
  const w = mk('normal', 1); w.setBoard([[1], [], [], [2], [0, 0]]);
  w.combo = 4; w.drainEvents();
  w.held = { tier: 1, kind: 'light' }; w.drop(1);
  let sawHelper = false, booPath = [];
  for (let t = 0; t < 8 && (w.isBusy() || w.phase !== 'aim'); t += H) {
    w.update(H);
    if (w.phase === 'helper') { sawHelper = true; assert.ok(w.boo.active); }
    if (w.boo.active) booPath.push([w.boo.x, w.boo.y]);
  }
  const ev = w.drainEvents();
  assert.ok(sawHelper);
  deq(of(ev, 'helper'), [{ type: 'helper', combo: 5 }]);
  const carried = of(ev, 'helperCarry').map(e => [e.item.kind, e.item.tier, e.item.col, e.item.row]);
  deq(carried, [['pumpkin', 0, 4, 1], ['pumpkin', 0, 4, 0], ['light', 2, 1, 0]]);
  const ti = types(ev);
  assert.ok(ti.indexOf('helperDone') > ti.lastIndexOf('helperCarry'));
  deq(board(w), [[], [], [], [2], []]);
  assert.strictEqual(w.combo, 5, 'Boo does not reset the combo');
  assert.strictEqual(w.stats.boos, 1);
  assert.strictEqual(w.score, EG.World.points(2, 2, 4) + 3 * C.helperPoints);
  run(w, 2); assert.ok(!w.boo.active, 'Boo flew away');
  // Boo flies on curves, not teleports: consecutive positions are close
  assert.ok(booPath.length > 20);
  for (let i = 1; i < booPath.length; i++) assert.ok(Math.hypot(booPath[i][0] - booPath[i - 1][0], booPath[i][1] - booPath[i - 1][1]) < 40);
  // Boo never carries big lights (tier > helperMaxTier)
  const w2 = mk('normal', 2); w2.setBoard([[6], [], [5], [1]]); w2.combo = 4;
  const e2 = dropT(w2, 4, 1);
  assert.ok(of(e2, 'helper').length === 1);
  for (const e of of(e2, 'helperCarry')) assert.ok(e.item.tier <= C.helperMaxTier);
  deq(board(w2), [[6], [], [5], [], []]);
  // nothing small to carry → a friendly fly-by, still helperDone
  const w3 = mk('normal', 3, 960, 540, 3); w3.setBoard([[7], [], [6, 5]]); w3.combo = 9; w3._helperMark = 1;
  const e3 = dropT(w3, 2, 5);                                   // 5+5 → 6, falls onto 6 → 7: combo 11
  deq(board(w3), [[7], [], [7], [], []]);
  assert.strictEqual(of(e3, 'helperCarry').length, 0);
  assert.ok(of(e3, 'helper').length === 1 && of(e3, 'helperDone').length === 1);
});

test('pumpkins: wake when a merge happens next to them, roll off, +10; others keep sleeping', () => {
  const w = mk('normal', 1); w.setBoard([[0], [1], [], [], [0]]);
  const ev = dropT(w, 2, 1);
  const wk = of(ev, 'pumpkinWake');
  assert.strictEqual(wk.length, 1); assert.strictEqual(wk[0].item.col, 0);
  assert.strictEqual(wk[0].item.state, 'rolling'); assert.ok(wk[0].item.vx < 0, 'rolls off the near edge');
  deq(board(w), [[], [], [2], [], [0]]);
  assert.strictEqual(w.score, 10 + C.pumpkinPoints);
  assert.strictEqual(w.stats.pumpkinsWoken, 1);
  run(w, C.rollLife + 0.1);
  assert.ok(!w.items.some(i => i.kind === 'pumpkin' && i.col === 0), 'gone after rolling');
  // a dropped pumpkin: pumpkinDrop event, never merges, resets the combo
  const w2 = mk('normal', 1); w2.setBoard([[0]]); w2.combo = 3;
  const e2 = dropT(w2, 1, 0, 'pumpkin');
  assert.ok(types(e2).includes('pumpkinDrop')); assert.strictEqual(of(e2, 'merge').length, 0);
  assert.strictEqual(w2.combo, 0); deq(board(w2), [[0], [0], [], [], []]);
});

// columns 1..4 full, no groups, tops 1/2 (used by the rise tests)
const FULL = [[1, 3, 1, 2, 1, 2, 1], [2, 1, 2, 1, 2, 1, 2], [1, 2, 1, 2, 1, 2, 1], [2, 1, 2, 1, 2, 1, 2]];

test('night creeps: every riseEvery drops pumpkins rise from the bottom of seeded columns and push them up', () => {
  // easy: pressure-free in the courtyard and cellar
  for (const lv of [0, 1]) assert.strictEqual(mk('easy', 1, 960, 540, lv).riseEvery, 0);
  assert.strictEqual(mk('normal', 1).riseEvery, 0, 'normal level 0 is pressure-free');
  const w = mk('normal', 5, 960, 540, 1);
  assert.strictEqual(w.riseEvery, C.difficulty.normal.riseEvery[1]); assert.strictEqual(w.riseIn, w.riseEvery);
  assert.strictEqual(mk('normal', 1, 960, 540, 7).riseEvery, Math.max(C.riseMin, C.difficulty.normal.riseEvery[3] - 1), 'a loop creeps faster');
  w.setBoard([[3], [5, 1], [], [4], [2, 3]]); w.drainEvents();
  const n = C.difficulty.normal.riseCount[1];
  for (let k = w.riseEvery; k > 1; k--) { dropT(w, 2, 6 + (k % 2)); }   // no merges: 6/7 alternate in column 2
  assert.strictEqual(w.riseIn, 1); assert.strictEqual(w.stats.rises, 0);
  const before = board(w);
  w.held = { tier: 7, kind: 'light' }; w.drop(2);
  let tRise = -1, t = 0, ys = [], pushed = null, riseEv = [];
  while ((w.isBusy() || w.phase !== 'aim') && t < 6) {
    w.update(H); t += H;
    for (const e of w.drainEvents()) if (e.type === 'rise') { riseEv.push(e); tRise = t; }
    if (riseEv.length && !pushed) pushed = w.items.find(i => i.kind === 'light' && i.col === riseEv[0].col && i.row === 1);
    if (pushed && pushed._riseT >= 0) { ys.push(pushed.y); assert.ok(pushed.prevY >= pushed.y - 1e-9, 'moves up smoothly'); }
  }
  assert.strictEqual(riseEv.length, n, n + ' pumpkins rise');
  assert.strictEqual(new Set(riseEv.map(e => e.col)).size, n, 'in distinct columns');
  for (const e of riseEv) { assert.strictEqual(e.item.kind, 'pumpkin'); assert.strictEqual(e.item.row, 0); assert.strictEqual(e.item.alpha, 1); }
  const after = board(w), b2 = J(before); b2[2].push(7);
  for (const e of riseEv) b2[e.col].unshift(0);
  deq(after, b2, 'columns pushed up by one with a pumpkin underneath');
  if (pushed) { assert.ok(ys.length > 10 && ys[ys.length - 1] < ys[0]); assert.strictEqual(pushed.y, w.rowY(1)); }
  assert.strictEqual(w.riseIn, w.riseEvery, 'counter restarts');
  assert.strictEqual(w.stats.rises, n); assert.strictEqual(w.getState().riseIn, w.riseEvery);
});

test('night creeps: the push can cause merges (and wake the riser); full columns are skipped', () => {
  const w = mk('normal', 1, 960, 540, 1);
  w.setBoard([[3]].concat(FULL)); w.drainEvents();
  w.riseIn = 1;
  const ev = dropT(w, 0, 5);                                    // 5 on the 3 → no merge; then col 0 (the only open one) rises
  const r = of(ev, 'rise');
  assert.strictEqual(r.length, 1, 'only one open column'); assert.strictEqual(r[0].col, 0);
  const m = of(ev, 'merge');
  assert.ok(m.length >= 1 && m[0].tier === 4, 'pushed 3 meets the 3 next door');
  assert.ok(of(ev, 'pumpkinWake').some(e => e.item === r[0].item), 'the merge next to it wakes the riser');
  assert.notStrictEqual(w.phase, 'over');
});

test('night creeps: game over when the night must rise but every column is full', () => {
  function setup(riseIn) {
    const w = mk('normal', 1, 960, 540, 1);
    w.setBoard([[2, 1, 2, 1, 2, 1]].concat(FULL)); w.drainEvents();
    w.riseIn = riseIn;
    w.held = { tier: 4, kind: 'light' }; w.next = { tier: 1, kind: 'light' };   // tier 1 could still go onto column 1's top
    w.drop(0); settle(w);
    return { w, ev: w.drainEvents() };
  }
  const a = setup(1);
  assert.strictEqual(a.w.phase, 'over'); assert.ok(types(a.ev).includes('gameOver')); assert.strictEqual(of(a.ev, 'rise').length, 0);
  const b = setup(50);
  assert.strictEqual(b.w.phase, 'aim', 'without the rise the matching top keeps the game going');
});

test('determinism with rises: same seed + same drops from level 1 → same state', () => {
  function play(seed) {
    const w = mk('normal', seed, 960, 540, 1); let k = 0;
    while (k < 40 && w.phase !== 'over') {
      settle(w); if (w.phase !== 'aim') break;
      let c = (k * 2 + w.held.tier) % 5; while (!w.canDrop(c)) c = (c + 1) % 5;
      w.drop(c); k++;
    }
    settle(w); return w;
  }
  const a = play(9), b = play(9);
  assert.ok(a.stats.rises >= 8, 'rises happened: ' + a.stats.rises);
  deq(a.getState(), b.getState());
  deq(a.items.map(i => [i.id, i.x, i.y, i.state]), b.items.map(i => [i.id, i.x, i.y, i.state]));
});

test('refuse: a full column refuses unless its top matches; pumpkins never overflow', () => {
  const w = mk('normal', 1); w.setBoard([[1, 2, 1, 2, 1, 2, 1]]); w.drainEvents();
  w.held = { tier: 2, kind: 'light' };
  assert.ok(!w.canDrop(0)); assert.ok(w.canDrop(0, 1)); assert.ok(!w.canDrop(0, 2)); assert.ok(!w.canDrop(0, 0)); assert.ok(w.canDrop(1));
  const before = J(board(w));
  assert.strictEqual(w.drop(0), false);
  const ev = w.drainEvents();
  deq(ev.filter(e => e.type !== 'aim'), [{ type: 'refuse', col: 0 }]);
  run(w, 0.5);
  deq(board(w), before); assert.strictEqual(w.stats.refused, 1); assert.strictEqual(w.phase, 'aim');
  assert.strictEqual(w.ember.targetCol, 0); assert.strictEqual(w.held.tier, 2, 'keeps the light');
  w.held = { tier: 0, kind: 'pumpkin' }; w.setBoard([[1, 2, 1, 2, 1, 2, 0]]);
  assert.ok(!w.canDrop(0));
});

test('busy: drops during fall/merge are buffered (only the latest one runs)', () => {
  const w = mk('normal', 1); w.drainEvents();
  w.held = { tier: 1, kind: 'light' }; w.next = { tier: 2, kind: 'light' };
  w.drop(2); run(w, 0.1);
  assert.ok(w.isBusy() && w.phase === 'fall');
  assert.strictEqual(w.drop(3), false); assert.strictEqual(w.drop(4), false);
  run(w, 3);
  deq(of(w.drainEvents(), 'drop').map(e => [e.col, e.tier]), [[2, 1], [4, 2]]);
  deq(board(w), [[], [], [1], [], [2]]);
});

test('game over: when nothing can take the held light', () => {
  const w = mk('normal', 1);
  const cols = [];
  for (let c = 0; c < 5; c++) { const a = []; for (let r = 0; r < (c === 4 ? 6 : 7); r++) a.push((c + r) % 2 ? 3 : 4); cols.push(a); }
  w.setBoard(cols); w.drainEvents();
  w.held = { tier: 6, kind: 'light' }; w.next = { tier: 1, kind: 'light' };
  w.drop(4); settle(w);
  const ev = w.drainEvents();
  assert.ok(types(ev).includes('gameOver')); assert.strictEqual(w.phase, 'over');
  assert.strictEqual(of(ev, 'merge').length, 0);
  assert.strictEqual(w.drop(0), false); run(w, 1); assert.strictEqual(w.drainEvents().length, 0, 'input ignored after game over');
  assert.ok(of(ev, 'danger').length === 1 && of(ev, 'danger')[0].level === 1);
});

test('goal: making the goal light → goal (ascends) → levelUp → tidy-up of tier-1 lights', () => {
  const w = mk('normal', 1); w.setBoard([[4], [], [], [2, 1], [1]]); w.drainEvents();
  assert.strictEqual(w.goalTier, 5);
  w.held = { tier: 4, kind: 'light' }; w.drop(1);
  let sawGoalPhase = false, goalItem = null, t = 0, minY = 1e9, tGoal = -1, tUp = -1;
  const evs = [];
  while ((w.isBusy() || w.phase !== 'aim') && t < 6) {
    w.update(H); t += H;
    for (const e of w.drainEvents()) { evs.push(e); if (e.type === 'goal') tGoal = t; if (e.type === 'levelUp') tUp = t; }
    if (w.phase === 'goal') sawGoalPhase = true;
    goalItem = goalItem || w.items.find(i => i.tier === 5);
    if (goalItem && goalItem.state === 'ascending') minY = Math.min(minY, goalItem.y);
  }
  const ev = evs, ti = types(ev);
  assert.ok(sawGoalPhase);
  const g = of(ev, 'goal')[0];
  deq([g.tier, g.bonus], [5, 100]);
  assert.ok(ti.indexOf('goal') < ti.indexOf('levelUp'));
  deq(of(ev, 'levelUp')[0], { type: 'levelUp', level: 1, zone: 1 });
  assert.ok(minY < 0, 'the goal light leaves the top of the screen');
  near(tUp - tGoal, C.goalTime, 0.05, 'level-up after the ascend');
  deq(board(w), [[], [], [], [2], []], 'goal light left the board and tier-1 lights were tidied');
  assert.strictEqual(w.goalTier, 6); assert.strictEqual(w.zone, 1); assert.strictEqual(w.loop, 0);
  assert.strictEqual(w.score, 80 + 100);
  // goal tiers and bonus over the loop
  deq([0, 1, 2, 3, 4, 7, 8].map(EG.World.goalFor), [5, 6, 7, 8, 8, 8, 8]);
  deq([0, 3, 4, 5].map(EG.World.goalBonus), [100, 400, 200, 400]);
  // gotoLevel clears gently and emits levelUp
  w.gotoLevel(3); const e2 = w.drainEvents();
  deq(e2, [{ type: 'levelUp', level: 3, zone: 3 }]);
  deq(board(w), [[], [], [], [], []]); assert.strictEqual(w.goalTier, 8);
});

test('spawns: weights per zone, capped by the board, Easy zone 0 = tiers 1–2 and no pumpkins, never two pumpkins in a row', () => {
  const w = mk('easy', 3);
  const seen = new Set();
  for (let i = 0; i < 3000; i++) { w.held = w.next; w.next = w._spawn(); seen.add(w.next.kind + w.next.tier); }
  deq([...seen].sort(), ['light1', 'light2']);
  const n = mk('normal', 4); n.gotoLevel(3);
  const cnt = (wld, k) => { const s = {}; for (let i = 0; i < k; i++) { wld.held = wld.next; wld.next = wld._spawn(); const key = wld.next.kind === 'pumpkin' ? 'p' : wld.next.tier; s[key] = (s[key] || 0) + 1; } return s; };
  let s = cnt(n, 3000);
  assert.ok(!s[3] && !s[4], 'empty board: never above tier 2');
  n.setBoard([[4]]); s = cnt(n, 3000);
  assert.ok(s[3] > 0 && !s[4], 'board max 4 → up to tier 3');
  n.setBoard([[7]]); s = cnt(n, 6000);
  assert.ok(s[4] > 300 && s.p > 300, 'board max 7 → tier 4 appears, and pumpkins');
  // never two pumpkins in a row
  C.difficulty.normal.pumpkinChance[3] = 0.95;
  let prev = null, twice = 0;
  for (let i = 0; i < 2000; i++) { n.held = n.next; n.next = n._spawn(); if (n.held.kind === 'pumpkin' && n.next.kind === 'pumpkin') twice++; prev = n.next; }
  C.difficulty.normal.pumpkinChance[3] = 0.1;
  assert.strictEqual(twice, 0); void prev;
  // no pumpkins in zone 0 on any difficulty
  for (const d of ['easy', 'normal', 'hard']) assert.strictEqual(C.difficulty[d].pumpkinChance[0], 0);
});

test('simulate: pure (no events, no RNG advance, no state change) and predicts the real outcome', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const { w } = playBot('normal', seed, 0.6, 40 + seed * 20);
    if (w.phase === 'over') continue;
    settle(w); w.drainEvents();
    w.diff = Object.assign({}, w.diff, { riseFrom: 1e9 }); w.riseEvery = 0;   // night pumpkins rise in a seeded column: not predictable
    for (let k = 0; k < 25 && w.phase === 'aim'; k++) {
      const snap = J(w.getState()), rs = w.rng.state, itemsSnap = J(w.items.map(i => [i.id, i.x, i.y, i.state, i.tier]));
      const sims = [0, 1, 2, 3, 4].map(c => w.simulate(c));
      deq(J(w.getState()), snap); assert.strictEqual(w.rng.state, rs);
      deq(J(w.items.map(i => [i.id, i.x, i.y, i.state, i.tier])), itemsSnap);
      assert.strictEqual(w.events.length, 0);
      const ok = sims.map((s, c) => s.ok ? c : -1).filter(c => c >= 0);
      for (let c = 0; c < 5; c++) assert.strictEqual(sims[c].ok, w.canDrop(c));
      const c = ok[(k * 7 + seed) % ok.length], sim = sims[c];
      for (const f of ['ok', 'merges', 'points', 'maxTier', 'heights', 'holes', 'gameOver']) assert.ok(f in sim, f);
      const s0 = w.score, m0 = w.stats.merges;
      w.drop(c); settle(w); w.drainEvents();
      deq(board(w), sim.board, 'board as predicted (seed ' + seed + ')');
      assert.strictEqual(w.score - s0, sim.points, 'points as predicted');
      assert.strictEqual(w.stats.merges - m0, sim.merges);
      assert.strictEqual(w.phase === 'over', sim.gameOver);
    }
  }
});

test('setLayout: every board item snaps to its cell, Ember to her column', () => {
  const w = mk('normal', 1); w.setBoard([[1, 2], [3], [], [4, 1, 2]]);
  w.held = { tier: 5, kind: 'light' }; w.drop(2); run(w, 0.25);       // mid-fall
  w.aim(4);
  w.setLayout(560, 1200);
  assert.strictEqual(w.layout.cell, 104);
  for (const it of w.items) {
    assert.strictEqual(it.x, w.colX(it.col)); assert.strictEqual(it.y, w.rowY(it.row));
    assert.strictEqual(it.prevX, it.x); assert.strictEqual(it.prevY, it.y);
  }
  assert.strictEqual(w.ember.x, w.colX(w.ember.targetCol)); assert.strictEqual(w.ember.y, w.layout.emberY);
  settle(w);
  deq(board(w), [[1, 2], [3], [5], [4, 1, 2], []]);
  w.setLayout(1280, 540); assert.strictEqual(w.items[0].x, w.colX(w.items[0].col));
});

test('getState / events: contract fields present', () => {
  const w = mk('normal', 2), s = w.getState();
  for (const k of ['time', 'phase', 'level', 'zone', 'loop', 'score', 'combo', 'maxCombo', 'difficulty', 'cols', 'rows', 'goalTier', 'maxTier', 'held', 'next', 'stats']) assert.ok(k in s, k);
  for (const k of ['drops', 'merges', 'cascades', 'biggestGroup', 'boos', 'pumpkins', 'pumpkinsWoken', 'refused', 'byTier']) assert.ok(k in s.stats, k);
  for (const k of ['x', 'prevX', 'y', 'prevY', 'vx', 'col', 'targetCol', 'anim', 'animT', 'tilt']) assert.ok(k in w.ember, k);
  for (const k of ['active', 'x', 'y', 'prevX', 'prevY', 'targets', 't', 'state']) assert.ok(k in w.boo, k);
  w.held = { tier: 1, kind: 'light' }; w.drop(2); run(w, 0.05);
  const it = w.items[0];
  for (const k of ['id', 'kind', 'tier', 'col', 'row', 'x', 'y', 'prevX', 'prevY', 'vy', 'state', 't', 'scale', 'squash', 'mergeTo', 'alpha']) assert.ok(k in it, k);
  assert.ok(w.alpha >= 0 && w.alpha < 1);
  deq(of(w.drainEvents(), 'drop'), [{ type: 'drop', col: 2, tier: 1, kind: 'light' }]);
  assert.ok(Array.isArray(w.grid) && w.grid.length === 5 && w.grid[0].length === 7);
});

// ---------- bot ----------
test('bot: survives and reaches level ≥ 1 on Easy across seeds (skill 0.3 and 0.8)', () => {
  for (const skill of [0.3, 0.8]) for (let seed = 1; seed <= 6; seed++) {
    const { w } = playBot('easy', seed, skill, 180);
    assert.notStrictEqual(w.phase, 'over', 'seed ' + seed + ' skill ' + skill);
    assert.ok(w.level >= 1, 'seed ' + seed + ' skill ' + skill + ' level ' + w.level);
  }
});

test('bot: normal skill 0.8 clears the candle and lantern within 3 minutes; respects canDrop', () => {
  for (let seed = 1; seed <= 4; seed++) {
    const { w, bot } = playBot('normal', seed, 0.8, 180);
    assert.ok(w.level >= 2, 'seed ' + seed + ' level ' + w.level);
    assert.strictEqual(bot.stats.refused, 0);
    assert.ok(bot.stats.lookaheads > 0);
  }
});

test('pressure: random play on Normal loses within 10 min; a skilled player lasts longer and goes further', () => {
  const surv = (skill) => { const r = []; for (let seed = 1; seed <= 6; seed++) { const p = playBot('normal', seed, skill, 600); r.push(p); } return r; };
  const rnd = surv(0), good = surv(0.9);
  assert.ok(rnd.filter(p => p.w.phase === 'over').length >= 5, 'random play loses (at least 5 of 6 within 10 min)');
  const mean = (a, f) => a.reduce((x, p) => x + f(p), 0) / a.length;
  assert.ok(mean(good, p => p.t) > mean(rnd, p => p.t) * 1.2, 'skill survives longer');
  assert.ok(mean(good, p => p.w.level) > mean(rnd, p => p.w.level), 'skill goes further');
  assert.ok(good.filter(p => p.w.level >= 4).length >= 2, 'a good player can reach the moon');
});

// ---------- weather ----------
test('weather: bounded particles, per-place kinds, front particles avoid the board band', () => {
  const sizes = [[960, 540], [560, 1000], [720, 1600], [1280, 540]];
  for (const [W, Hh] of sizes) {
    const L = EG.World.computeLayout(W, Hh, 5, 7);
    const wx = new EG.Weather({ width: W, height: Hh, seed: 3 });
    for (let z = 0; z < 4; z++) {
      wx.setLevel(z, { instant: z === 0 });
      const spr = new Set(); let maxP = 0, trail = 0;
      for (let i = 0; i < 60 * 14; i++) {
        if (i % 10 === 0) wx.burst('sparkle', L.boardX + L.boardW / 2, L.boardY + 100, 20, {});
        wx.update(1 / 60, L);
        maxP = Math.max(maxP, wx.particles.length);
        for (const p of wx.particles) {
          spr.add(p.sprite);
          if (p.kind === 'trail') trail++;
          if (p.layer === 'front' && p.kind !== 'burst') {
            const inside = p.x > L.boardX - 30 && p.x < L.boardX + L.boardW + 30 && p.y > L.boardY - 2 * L.cell - 30 && p.y < L.boardY + L.boardH + 30;
            assert.ok(!inside, W + 'x' + Hh + ' zone ' + z + ' ' + p.kind + ' in the calm band at ' + p.x.toFixed(0) + ',' + p.y.toFixed(0));
          }
          assert.ok(p.alpha >= 0 && p.alpha <= 1.0001 && isFinite(p.x) && isFinite(p.y));
          for (const k of ['sprite', 'x', 'y', 'size', 'rot', 'flipX', 'alpha', 'layer']) assert.ok(k in p, k);
        }
      }
      assert.ok(maxP < 140, 'cap ' + maxP);
      const want = [['glow', 'leaf'], ['drip', 'sparkle'], ['dust', 'page'], ['sparkle', 'star']][z];
      for (const s of want) assert.ok(spr.has(s), W + 'x' + Hh + ' zone ' + z + ' has ' + s);
      if (z === 3) assert.ok(trail > 0, 'a shooting star within 14 s');
      if (z === 1) assert.ok(wx.ambient.tint && wx.ambient.glow > 0.4);
    }
    wx.resize(W === 960 ? 560 : 960, 1200); wx.update(1 / 60, EG.World.computeLayout(wx.width, wx.height));
    assert.ok(wx.particles.length < 140);
  }
});

// ---------- long run ----------
test('10 simulated minutes of bot play (+ weather) run in a few seconds', () => {
  const t0 = Date.now();
  const r = playBot('easy', 11, 0.8, 600, { weather: true });   // Easy lasts the full 10 min (Normal now ends in ~5–9)
  const ms = Date.now() - t0;
  assert.ok(ms < 6000, 'took ' + ms + ' ms');
  assert.ok(r.t >= 599 || r.w.phase === 'over');
  assert.ok(r.maxP < 140);
  assert.ok(r.w.level >= 3, 'level ' + r.w.level);
  assert.ok(r.ev.includes('helper') && r.ev.includes('goal') && r.ev.includes('pumpkinWake'));
  assert.ok(r.ev.includes('rise') && r.w.stats.rises > 20);
  const st = r.w.getState();
  assert.ok(st.stats.drops > 200 && st.score > 5000);
  console.log('     (10 min: ' + ms + ' ms, level ' + st.level + ', score ' + st.score + ', drops ' + st.stats.drops + ', boos ' + st.stats.boos + ')');
});

// ---------- run ----------
let pass = 0, fail = 0;
for (const t of tests) {
  try { t.fn(); pass++; console.log('PASS ' + t.name); }
  catch (e) { fail++; console.log('FAIL ' + t.name + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n     ') : e)); }
}
console.log('\n' + pass + '/' + tests.length + ' passed' + (fail ? ', ' + fail + ' FAILED' : ''));
process.exit(fail ? 1 : 0);
