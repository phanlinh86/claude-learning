#!/usr/bin/env node
// Taffy's Candy Reel — headless unit tests for rng / world / weather / bot (node, no deps).
// Run from projects/daily-game/dragon-candy-reel:   node tests/unit/run.js
'use strict';
const assert = require('assert');
const { load } = require('./load');

const PR = load();
const C = PR.CONFIG;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const H = 1 / 120;
const J = v => JSON.parse(JSON.stringify(v));
const near = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, (m || '') + ' got ' + a + ' want ' + b + ' ±' + tol);

// ---------- helpers ----------
function mk(diff, seed, w, h, level) {
  return new PR.World({ seed: seed || 1, difficulty: diff || 'normal', width: w || 960, height: h || 540, level: level || 0 });
}
function run(w, s) { const n = Math.round(s / H); for (let i = 0; i < n; i++) w.update(H); }
/** no wind at all and no gusts (tests of the hook / reel alone) */
function calm(w) {
  const wd = w.wind; wd.value = wd.target = wd.rate = 0; wd.next = 1e9; wd.warn = 0; wd._mag = 0;
  w.hook.sway = w.hook.swayV = 0; w.hook.x = w.hook.prevX = w.layout.holeX;
  return w;
}
/** a world with an empty, spawn-free, windless lake and the hook resting under the surface */
function quiet(w) {
  calm(w);
  w.items.length = 0;
  w._flakeT = w._fishT = w._gumT = 1e9;
  w._grace = 1e9;
  run(w, 1.5);
  w.drainEvents();
  return w;
}
function place(w, kind, type, x, y) {
  const r = kind === 'flake' ? w.diff.flakeR : kind === 'gummy' ? w.diff.gummyR : 14;
  const it = w._newItem(kind, type, y, 0.0001, -1, r, 0, 0);
  it.x = it.prevX = x; it.vx = 0.0001;
  return it;
}
function hookFlake(w, type, y) {
  quiet(w);
  const hk = w.hook;
  hk.y = hk.prevY = y; hk.vy = 0;
  const g = place(w, 'flake', type || 'berry', hk.x, y);
  w.update(H);
  assert.strictEqual(w.phase, 'reel', 'flake on the hook starts the reel');
  return g;
}
const uFor = n => Math.acos(1 - 2 * n) / Math.PI;   // needle = (1-cos(pi u))/2 → u
function setNeedle(w, n) { w.reel.u = uFor(n); w.reel.needle = n; }
function tapAt(w, n) { setNeedle(w, n); w.press(); w.release(); }
function playBot(diff, seed, skill, maxS, opts) {
  opts = opts || {};
  const w = mk(diff, seed, opts.w, opts.h);
  const bot = new PR.Bot(w, { skill, seed: seed * 3 + 1 });
  const wx = opts.weather ? new PR.Weather({ width: w.layout.width, height: w.layout.height, seed }) : null;
  let t = 0, maxP = 0; const ev = [], dt = opts.dt || 1 / 60;
  while (w.phase !== 'over' && t < maxS && !(opts.stopLevel !== undefined && w.level >= opts.stopLevel)) {
    bot.step(dt); w.update(dt);
    const e = w.drainEvents();
    for (const x of e) {
      ev.push(x.type);
      if (wx) {
        if (x.type === 'levelUp') wx.setLevel(x.zone);
        if (x.type === 'catch') wx.burst('star', x.x, x.y, 14, { gravity: 300 });
        if (x.type === 'snap') wx.burst('puff', x.x, x.y, 10, { gravity: -40 });
        if (x.type === 'splash') wx.burst('drop', x.x, x.y, 8, { up: 1, gravity: 600 });
      }
    }
    if (wx) { wx.update(dt, { hookX: w.hook.x, hookY: w.hook.y, surfaceY: w.layout.surfaceY, waterTop: w.layout.waterTop, wind: w.wind.value }); maxP = Math.max(maxP, wx.particles.length); }
    t += dt;
  }
  return { w, t, bot, ev, maxP };
}

// ---------- RNG / tables ----------
test('rng: deterministic, in range, API', () => {
  const a = new PR.RNG(42), b = new PR.RNG(42), c = new PR.RNG('x');
  for (let i = 0; i < 300; i++) { const x = a.next(); assert.strictEqual(x, b.next()); assert.ok(x >= 0 && x < 1); }
  for (const f of ['next', 'range', 'int', 'pick', 'chance', 'gauss']) assert.strictEqual(typeof c[f], 'function', f);
  for (let i = 0; i < 300; i++) { const m = c.int(2, 5); assert.ok(m >= 2 && m <= 5 && m === (m | 0)); const r = c.range(3, 4); assert.ok(r >= 3 && r < 4); }
  assert.ok(['a', 'b'].includes(c.pick(['a', 'b'])));
  let s = 0, s2 = 0; for (let i = 0; i < 4000; i++) { const g = c.gauss(); s += g; s2 += g * g; }
  near(s / 4000, 0, 0.08, 'gauss mean'); near(Math.sqrt(s2 / 4000), 1, 0.08, 'gauss sd');
});

test('CONFIG: step, presets, flakesNeeded per difficulty', () => {
  assert.ok(C.step <= 1 / 120 + 1e-12);
  assert.deepStrictEqual(['easy', 'normal', 'hard'].map(d => C.difficulty[d].flakesNeeded), [6, 8, 10]);
  assert.deepStrictEqual(['easy', 'normal', 'hard'].map(d => mk(d).flakesNeeded), [6, 8, 10]);
  assert.deepStrictEqual(J(C.points), { berry: 10, lime: 20, grape: 30, gold: 50 });
  const e = C.difficulty.easy, n = C.difficulty.normal, h = C.difficulty.hard;
  assert.ok(e.reelWidth > n.reelWidth && n.reelWidth > h.reelWidth, 'green zone narrows with difficulty');
  assert.ok(e.needle < n.needle && n.needle < h.needle, 'needle speeds up with difficulty');
  assert.ok(e.gummyEvery > n.gummyEvery && n.gummyEvery > h.gummyEvery, 'gummies rarer on easy');
  assert.strictEqual(mk('weird').difficulty, 'normal', 'unknown difficulty → normal');
});

test('layout: §2 numbers for 960×540 and portrait', () => {
  const L = mk().layout;
  assert.deepStrictEqual([L.surfaceY, L.waterTop, L.floorY, L.holeX, L.minHookY, L.maxHookY], [150, 190, 506, 480, 204, 484]);
  near(L.bands[1], 204 + 280 * 0.36, 1e-9); near(L.bands[2], 204 + 280 * 0.68, 1e-9);
  const P = mk('normal', 1, 560, 1200).layout;
  assert.deepStrictEqual([P.holeX, P.floorY, P.maxHookY], [280, 1166, 1144]);
});

// ---------- determinism / stepping ----------
test('determinism: same seed + same inputs → identical state', () => {
  function play(seed) {
    const w = mk('normal', seed);
    const out = [];
    for (let f = 0; f < 60 * 90; f++) {
      if (f % 97 === 10) w.press();
      if (f % 97 === 60) w.release();
      if (w.phase === 'reel' && f % 23 === 0) w.press();
      w.update(1 / 60);
      for (const e of w.drainEvents()) out.push(e.type);
    }
    return JSON.stringify({ s: w.getState(), items: w.items, hook: w.hook, reel: w.reel, stats: w.stats, out });
  }
  assert.strictEqual(play(5), play(5));
  assert.notStrictEqual(play(5), play(6));
  // frame size doesn't matter: 1/60 and 2×1/120 give the same world
  const a = mk('normal', 3), b = mk('normal', 3);
  for (let i = 0; i < 600; i++) { a.update(1 / 60); b.update(1 / 120); b.update(1 / 120); }
  assert.strictEqual(JSON.stringify(a.items), JSON.stringify(b.items));
});

test('fixed steps: prev positions and alpha', () => {
  const w = mk();
  w.update(0.0125);           // 1.5 steps
  near(w.alpha, 0.5, 1e-6, 'alpha = leftover fraction');
  const it = w.items.find(i => i.kind === 'flake');
  assert.ok(it && it.prevX !== it.x, 'swimmer stores prevX');
  assert.ok(w.hook.prevY !== w.hook.y, 'falling hook stores prevY');
  w.update(5); // clamped to maxFrame
  near(w.time, 0.0125 + C.maxFrame, 0.01, 'long frames are clamped');
});

// ---------- hook motion ----------
test('start: the hook drops in from the hole with a splash', () => {
  const w = mk();
  assert.ok(w.hook.y < w.layout.waterTop && w.hook.drop);
  let splash = false;
  for (let i = 0; i < 240; i++) { w.update(H); if (w.drainEvents().some(e => e.type === 'splash')) splash = true; }
  assert.ok(splash, 'splash on entering water');
  assert.strictEqual(w.hook.drop, false);
  near(w.hook.y, w.layout.minHookY, 0.5, 'floats back to rest under the surface');
});

test('sink: accelerates to terminal speed, tilts, stops at the bottom with a small bounce', () => {
  const w = quiet(mk('normal', 1, 960, 1400));
  const d = w.diff, L = w.layout;
  w.press();
  let maxV = 0, v02 = null, bounced = false, prevVy = 0, maxTilt = 0;
  for (let i = 0; i < 120 * 8; i++) {
    w.update(H);
    if (i === 23) v02 = w.hook.vy;
    maxV = Math.max(maxV, w.hook.vy);
    maxTilt = Math.max(maxTilt, w.hook.tilt);
    if (prevVy > 50 && w.hook.vy < 0) bounced = true;
    prevVy = w.hook.vy;
    assert.ok(w.hook.y <= L.maxHookY + 1e-9 && w.hook.y >= L.minHookY - 1e-9);
  }
  assert.ok(v02 > 0.4 * d.sinkTerm && v02 < 0.95 * d.sinkTerm, 'still accelerating at 0.2 s: ' + v02);
  assert.ok(maxV <= d.sinkTerm + 0.5 && maxV > 0.97 * d.sinkTerm, 'terminal sink speed ' + maxV);
  assert.ok(maxTilt > 0.3 && maxTilt <= C.tiltMax * 1.21, 'leans while sinking ' + maxTilt);
  assert.ok(bounced, 'small bounce at the bottom');
  near(w.hook.y, L.maxHookY, 1e-6, 'rests at maxHookY'); near(w.hook.vy, 0, 30);
});

test('rise: buoyancy is gentler than weight, terminal rise speed, rests under the surface', () => {
  const w = quiet(mk('normal', 1, 960, 1400));
  const d = w.diff, L = w.layout;
  w.press(); run(w, 7); w.release();
  let minV = 0, tUp = 0;
  while (w.hook.y > L.minHookY + 0.5 && tUp < 20) { w.update(H); tUp += H; minV = Math.min(minV, w.hook.vy); }
  assert.ok(-minV <= d.riseTerm + 0.5 && -minV > 0.97 * d.riseTerm, 'terminal rise ' + minV);
  assert.ok(d.riseTerm < d.sinkTerm);
  run(w, 1);
  near(w.hook.y, L.minHookY, 1e-6); near(w.hook.vy, 0, 1e-6);
  // turnaround: a released sinking hook decelerates smoothly (no instant reversal)
  w.press(); run(w, 1); const v0 = w.hook.vy; w.release(); w.update(H);
  assert.ok(w.hook.vy > 0 && w.hook.vy < v0, 'momentum carries it a little further');
});

// ---------- reel ----------
test('hook → reel: touching a flake hooks it; reel state set up', () => {
  const w = mk(); quiet(w);
  w.press(); w.update(H);
  const hk = w.hook;
  hk.y = hk.prevY = 400;
  const g = place(w, 'flake', 'lime', hk.x + 20, 400);
  w.update(H);
  const ev = w.drainEvents();
  assert.strictEqual(w.phase, 'reel');
  assert.ok(ev.some(e => e.type === 'hook' && e.item === g));
  assert.strictEqual(g.state, 'hooked');
  assert.strictEqual(hk.holding, false, 'holding cleared');
  const r = w.reel;
  assert.ok(r.active && r.itemId === g.id && r.slips === 0 && r.maxSlips === 3);
  near(r.stepPx, Math.max(C.stepMinPx, (w.layout.maxHookY - w.layout.waterTop) / w.diff.stepsFull), 1e-9);
  assert.strictEqual(r.steps, Math.ceil((hk.y - w.layout.waterTop) / r.stepPx));
  assert.ok(r.zone >= C.zoneStartMin && r.zone + r.width / 2 <= 1);
  near(r.speed, w.diff.needle, 1e-9, 'needle speed level 0');
  assert.strictEqual(w.taffy.anim, 'reel');
  // flake slides onto the hook and then rides it
  run(w, 0.3);
  near(g.x, hk.x, 1e-6); near(g.y, hk.y + C.flakeHang, 1e-6);
  // the needle ping-pongs 0..1 with an eased sweep
  let lo = 1, hi = 0, mid = 0, edge = 1;
  for (let i = 0; i < 400; i++) {
    const n0 = r.needle; w.update(H); const dn = Math.abs(r.needle - n0);
    lo = Math.min(lo, r.needle); hi = Math.max(hi, r.needle);
    if (r.needle > 0.45 && r.needle < 0.55) mid = Math.max(mid, dn);
    if (r.needle < 0.05 || r.needle > 0.95) edge = Math.min(edge, dn);
  }
  assert.ok(lo < 0.01 && hi > 0.99, 'full sweep');
  assert.ok(mid > 3 * edge, 'fast in the middle, slow at the ends (sinusoidal)');
  // gummies ignore the hook while reeling
  place(w, 'gummy', 'gummy', hk.x, hk.y);
  run(w, 0.1);
  assert.strictEqual(w.phase, 'reel');
});

test('reel taps: perfect = 2 steps with eased tug, good = 1, slip = ½ step + wobble, zone jumps', () => {
  const w = mk('normal', 2);
  hookFlake(w, 'grape', 470);
  const r = w.reel, hk = w.hook;
  const y0 = r.targetY, step = r.stepPx;
  let z = r.zone;
  tapAt(w, z);
  let ev = w.drainEvents();
  assert.ok(ev.some(e => e.type === 'reelGood' && e.perfect === true));
  near(r.targetY, y0 - 2 * step, 1e-9, 'perfect = 2 steps');
  assert.strictEqual(w.score, 5, '+5 for a Perfect');
  assert.notStrictEqual(r.zone, z, 'zone jumped');
  near(r.tug, 1, 1e-9);
  // the tug is eased, not a teleport: after one step the hook has moved only part-way
  const yb = hk.y; w.update(H);
  assert.ok(hk.y < yb && hk.y > r.targetY + 1, 'moving up smoothly');
  run(w, C.tugTime);
  near(hk.y, r.targetY, 1e-6, 'arrives');
  // good (inside green, outside gold)
  z = r.zone;
  const y1 = r.targetY;
  tapAt(w, z + (r.width / 2) * 0.9);
  ev = w.drainEvents();
  assert.ok(ev.some(e => e.type === 'reelGood' && e.perfect === false));
  near(r.targetY, y1 - step, 1e-9, 'good = 1 step');
  run(w, 0.3);
  // slip
  z = r.zone;
  const y2 = r.targetY;
  tapAt(w, z > 0.5 ? 0.0 : 1.0);
  ev = w.drainEvents();
  assert.ok(ev.some(e => e.type === 'reelSlip' && e.slips === 1));
  near(r.targetY, y2 + step / 2, 1e-9, 'slip = ½ step down');
  near(hk.wob, 1, 1e-9);
  w.update(H);
  const g = w.items.find(i => i.state === 'hooked');
  run(w, 0.1);
  assert.ok(Math.abs(g.x - hk.x) > 0.5, 'flake wobbles after a slip');
  assert.deepStrictEqual([w.stats.perfect, w.stats.good, w.stats.slip], [1, 1, 1]);
});

test('escape: 3 slips → flake wriggles free and floats away; must press again to sink', () => {
  const w = mk('normal', 3);
  const g = hookFlake(w, 'lime', 380);
  for (let k = 0; k < 3; k++) tapAt(w, w.reel.zone > 0.5 ? 0 : 1);
  const ev = w.drainEvents();
  assert.ok(ev.some(e => e.type === 'escape' && e.item === g));
  assert.strictEqual(w.phase, 'roam');
  assert.strictEqual(w.hook.holding, false);
  assert.strictEqual(g.state, 'escape');
  assert.strictEqual(w.stats.escapes, 1);
  assert.strictEqual(w.taffy.anim, 'oops');
  const x0 = g.x, y0 = g.y;
  run(w, 0.8);
  assert.ok(g.y < y0 - 20 && Math.abs(g.x - x0) > 20, 'floats up and sideways');
  run(w, 3);
  assert.ok(!w.items.includes(g), 'gone');
  assert.strictEqual(w.flakesInZone, 0);
});

test('catch: gold = 50 (+5 per Perfect), event, flake flies to the jar, hook drops back in', () => {
  const w = mk('normal', 4);
  const g = hookFlake(w, 'gold', 300);
  near(w.reel.speed, w.diff.needle * C.goldNeedle, 1e-9, 'needle 15% faster on gold');
  let perf = 0, ev = [], guard = 0;
  while (w.phase === 'reel' && guard++ < 50) { tapAt(w, w.reel.zone); perf++; run(w, 0.3); ev = ev.concat(w.drainEvents()); }
  const c = ev.find(e => e.type === 'catch');
  assert.ok(c && c.item === g && c.points === 50);
  assert.strictEqual(w.score, 50 + 5 * perf);
  assert.deepStrictEqual([w.flakesInZone, w.totalFlakes, w.stats.catches, w.stats.byType.gold], [1, 1, 1, 1]);
  assert.strictEqual(g.state, 'caught');
  assert.strictEqual(w.taffy.anim, 'happy');
  assert.strictEqual(w.hook.holding, false);
  run(w, C.catchFly);
  assert.ok(!w.items.includes(g), 'landed in the jar');
  let splash = false;
  for (let i = 0; i < 240; i++) { w.update(H); if (w.drainEvents().some(e => e.type === 'splash')) splash = true; }
  assert.ok(splash && w.hook.y >= w.layout.waterTop, 'empty hook drops back in');
  // other flake values
  for (const [t, p] of [['berry', 10], ['lime', 20], ['grape', 30]]) {
    const v = mk('normal', 5); hookFlake(v, t, 230);
    let e2 = [], k = 0;
    while (v.phase === 'reel' && k++ < 50) { tapAt(v, v.reel.zone + v.reel.width * 0.45); run(v, 0.3); e2 = e2.concat(v.drainEvents()); }
    assert.strictEqual(e2.find(e => e.type === 'catch').points, p, t);
    assert.strictEqual(v.score, p, t + ' with Good taps only');
  }
});

test('steps to the surface: deepest flake needs stepsFull good taps', () => {
  for (const d of ['easy', 'normal', 'hard']) {
    const w = mk(d, 6);
    hookFlake(w, 'grape', w.layout.maxHookY);
    let taps = 0;
    while (w.phase === 'reel' && taps < 30) { tapAt(w, w.reel.zone + w.reel.width * 0.45); taps++; run(w, 0.3); }
    assert.strictEqual(taps, C.difficulty[d].stepsFull, d);
  }
});

// ---------- gummies / lines ----------
test('gummy snap: line −1, puff, hook resets after 1 s, invuln, game over at 0 lines', () => {
  const w = mk('normal', 7); quiet(w);
  const hk = w.hook;
  w.press();
  const p = place(w, 'gummy', 'gummy', hk.x, hk.y + 5);
  w.update(H);
  let ev = w.drainEvents();
  assert.ok(ev.some(e => e.type === 'snap') && ev.some(e => e.type === 'puff' && e.item === p));
  assert.deepStrictEqual([w.lines, w.phase, p.state, hk.lost, hk.holding], [2, 'snap', 'puffed', true, false]);
  assert.strictEqual(w.taffy.anim, 'oops');
  const px = p.x;
  run(w, 0.2); assert.ok(p.puff > 0.5 && p.r > p.r0, 'inflates');
  run(w, 0.7); assert.strictEqual(w.phase, 'snap');
  run(w, 0.15); assert.strictEqual(w.phase, 'roam', 'new line after 1.0 s');
  assert.ok(hk.y < w.layout.waterTop && !hk.lost);
  assert.ok(Math.abs(p.x - px) > 10, 'puffed gummy drifts away');
  near(w.invuln, C.invuln - 0.05, 0.02, 'invulnerable 1.5 s after the new line');
  run(w, 0.5);
  place(w, 'gummy', 'gummy', hk.x, hk.y);
  run(w, 0.2);
  assert.strictEqual(w.lines, 2, 'no snap while invulnerable');
  w.items.length = 0;
  run(w, 1.2);
  assert.strictEqual(w.invuln, 0);
  place(w, 'gummy', 'gummy', hk.x, hk.y);
  w.update(H);
  assert.strictEqual(w.lines, 1);
  run(w, 2.6); w.items.length = 0; w.drainEvents();
  place(w, 'gummy', 'gummy', hk.x, hk.y);
  w.update(H);
  ev = w.drainEvents();
  assert.deepStrictEqual([w.lines, w.phase], [0, 'over']);
  assert.ok(ev.some(e => e.type === 'gameOver'));
  w.press(); run(w, 1);
  assert.strictEqual(w.phase, 'over', 'stays over');
  assert.strictEqual(w.stats.snaps, 3);
});

test('zone clear: levelUp, +1 line (max 3), gummies swim off harmlessly', () => {
  const w = mk('normal', 8);
  quiet(w);
  w.lines = 2;
  w.flakesInZone = w.flakesNeeded - 1;
  const p = place(w, 'gummy', 'gummy', w.layout.holeX + 200, 300);
  hookFlake(w, 'berry', 220);
  w.items.push(p);
  let ev = [], k = 0;
  while (w.phase === 'reel' && k++ < 20) { tapAt(w, w.reel.zone); run(w, 0.3); ev = ev.concat(w.drainEvents()); }
  assert.ok(ev.some(e => e.type === 'lineBack'));
  const lu = ev.find(e => e.type === 'levelUp');
  assert.ok(lu && lu.level === 1 && lu.zone === 1);
  assert.deepStrictEqual([w.lines, w.level, w.zone, w.loop, w.flakesInZone], [3, 1, 1, 0, 0]);
  assert.ok(p.leaving && p.vx > 0, 'gummy turns away');
  // full lines: no lineBack
  w.flakesInZone = w.flakesNeeded - 1;
  quiet(w); w.drainEvents();
  hookFlake(w, 'berry', 220);
  ev = []; k = 0;
  while (w.phase === 'reel' && k++ < 20) { tapAt(w, w.reel.zone); run(w, 0.3); ev = ev.concat(w.drainEvents()); }
  assert.ok(!ev.some(e => e.type === 'lineBack') && ev.some(e => e.type === 'levelUp'));
  assert.strictEqual(w.lines, 3);
});

test('levels: zone/loop, endless speed-up (+8%/loop, capped), harder reel each zone', () => {
  const n0 = mk('normal', 1, 960, 540, 0), n3 = mk('normal', 1, 960, 540, 3), n4 = mk('normal', 1, 960, 540, 4), n40 = mk('normal', 1, 960, 540, 40);
  assert.deepStrictEqual([n4.zone, n4.loop, n40.zone, n40.loop], [0, 1, 0, 10]);
  near(n4._needle / n0._needle, 1.08, 1e-9);
  near(n40._mult(), C.loopSpeedCap, 1e-9);
  assert.ok(n3._needle > n0._needle && n3._reelWidth < n0._reelWidth);
  for (const d of ['easy', 'normal', 'hard']) {
    const w = mk(d, 1, 960, 540, 2);
    assert.strictEqual(w.flakesNeeded, C.difficulty[d].flakesNeeded);
  }
  const g = mk(); g.gotoLevel(5);
  assert.deepStrictEqual([g.level, g.zone, g.loop], [5, 1, 1]);
  assert.ok(g.drainEvents().some(e => e.type === 'levelUp' && e.level === 5));
  // easy zone 0: wide zone, slow needle, few gummies
  const e0 = mk('easy');
  assert.ok(e0._reelWidth >= 0.35 && e0._needle <= 0.5 && e0._gummyMax() === 1);
});

test('spawning: no gummies in the first 10 s of zone 0; gummies later; depth bands decide flake type', () => {
  let pufEarly = 0, pufLater = 0;
  const types = { berry: [], lime: [], grape: [] };
  for (let s = 1; s <= 8; s++) {
    const w = mk('normal', s);
    for (let i = 0; i < 120 * 60; i++) {
      w.update(H);
      for (const it of w.items) {
        if (it.t === H || it.t < H * 1.5) {
          if (it.kind === 'gummy') { if (w.zoneTime < 10) pufEarly++; else pufLater++; }
          if (it.kind === 'flake' && types[it.type]) types[it.type].push(it.by);
        }
      }
    }
    const L = w.layout;
    for (const y of types.berry) assert.ok(y <= L.bands[1] + 1e-9);
    for (const y of types.lime) assert.ok(y >= L.bands[1] && y <= L.bands[2]);
    for (const y of types.grape) assert.ok(y >= L.bands[2] && y <= L.bands[3]);
  }
  assert.strictEqual(pufEarly, 0, 'no gummies in the first 10 s');
  assert.ok(pufLater > 8, 'gummies appear later: ' + pufLater);
  assert.ok(types.berry.length > types.grape.length, 'zone 0 is mostly shallow');
  // easy has far fewer gummies than hard
  function gummies(d) { let n = 0; for (let s = 1; s <= 4; s++) { const w = mk(d, s); let seen = new Set(); for (let i = 0; i < 120 * 90; i++) { w.update(H); for (const it of w.items) if (it.kind === 'gummy') seen.add(it.id); } n += seen.size; } return n; }
  const pe = gummies('easy'), ph = gummies('hard');
  assert.ok(pe * 3 < ph, 'easy ' + pe + ' vs hard ' + ph);
});

test('golden flake: ~1 in 12 spawns, never twice in a row, faster, golden event; spawnGold()', () => {
  let flakes = 0, gold = 0, twice = 0, events = 0, last = false, vG = 0, vN = 0, nG = 0, nN = 0;
  for (let s = 1; s <= 10; s++) {
    const w = mk('normal', s);
    const seen = new Set();
    for (let i = 0; i < 120 * 300; i++) {
      w.update(H);
      events += w.drainEvents().filter(e => e.type === 'golden').length;
      for (const it of w.items) {
        if (it.kind !== 'flake' || seen.has(it.id)) continue;
        seen.add(it.id); flakes++;
        const g = it.type === 'gold';
        if (g) { gold++; if (last) twice++; vG += Math.abs(it.vx); nG++; } else { vN += Math.abs(it.vx); nN++; }
        last = g;
      }
    }
  }
  const rate = gold / flakes;
  assert.ok(rate > 0.05 && rate < 0.11, 'gold rate ' + rate.toFixed(3) + ' of ' + flakes);
  assert.strictEqual(twice, 0, 'never twice in a row');
  assert.strictEqual(events, gold, 'golden event per golden spawn');
  assert.ok(vG / nG > 1.3 * (vN / nN), 'golden flakes drift faster');
  const w = mk(); w.drainEvents();
  const g = w.spawnGold();
  assert.strictEqual(g.type, 'gold');
  assert.ok(w.drainEvents().some(e => e.type === 'golden' && e.item === g));
  assert.ok(g.vx > 0 && g.x < w.layout.holeX);
});

test('setLayout: landscape → portrait keeps hook and swimmers in bounds', () => {
  const w = mk('normal', 9);
  run(w, 3); w.press(); run(w, 1);
  w.setLayout(560, 1200);
  const L = w.layout;
  assert.strictEqual(L.holeX, 280);
  assert.strictEqual(w.hook.x, 280 + w.hook.sway, 'hook x = holeX + sway');
  assert.ok(Math.abs(w.hook.sway) <= 280 - C.screenPad);
  assert.ok(w.hook.y >= L.minHookY && w.hook.y <= L.maxHookY);
  for (const it of w.items) if (it.state === 'swim') assert.ok(it.by >= L.minHookY - 1 && it.by <= L.maxHookY + 1, 'item depth mapped');
  run(w, 2);
  assert.ok(w.hook.y <= L.maxHookY);
  // during a reel too
  const v = mk('normal', 10); hookFlake(v, 'grape', 470);
  v.setLayout(720, 1600);
  assert.ok(v.reel.targetY > 1000 && v.hook.y > 1000 && v.reel.steps <= v.diff.stepsFull);
  run(v, 0.5);
  const g = v.items.find(i => i.state === 'hooked');
  near(g.y, v.hook.y + C.flakeHang, 1e-6);
});

// ---------- wind (the twist) ----------
/** run a world (no input) and record gust events with times and levels */
function gustLog(diff, seed, level, secs, onStep) {
  const w = mk(diff, seed, 960, 540, level);
  const log = [];
  const n = Math.round(secs / H);
  for (let i = 0; i < n; i++) {
    const v0 = w.wind.value;
    w.update(H);
    if (onStep) onStep(w, v0);
    for (const e of w.drainEvents()) if (e.type === 'gustWarn' || e.type === 'gust') log.push({ type: e.type, dir: e.dir, strength: e.strength, t: w.time, zt: w.zoneTime, target: w.wind.target });
  }
  return { w, log };
}

test('CONFIG wind: presets by difficulty, level strengths, wind level stronger and more frequent', () => {
  const e = C.difficulty.easy, n = C.difficulty.normal, h = C.difficulty.hard;
  assert.deepStrictEqual([e.gustEvery, n.gustEvery, h.gustEvery].map(J), [[11, 15], [8, 12], [6, 10]]);
  assert.deepStrictEqual([e.driftMax, n.driftMax, h.driftMax], [34, 52, 70]);
  assert.deepStrictEqual([e.current, n.current, h.current], [8, 14, 20]);
  assert.deepStrictEqual(J(C.levelStrength), [0.6, 0.8, 1.0, 0.8]);
  assert.strictEqual(C.gustWarnTime, 1.5);
  for (const z of [0, 1, 2, 3]) {
    const w = mk('normal', 1, 960, 540, z);
    assert.strictEqual(w.wind.strength, C.levelStrength[z]);
    near(w.driftMax(), 52 * (z === 2 ? 1.4 : 1), 1e-9); near(w.current(), 14 * (z === 2 ? 1.4 : 1), 1e-9);
  }
  const f = mk('normal', 1); for (const k of ['value', 'target', 'next', 'warn', 'warnDir', 'strength']) assert.ok(k in f.wind, k);
  assert.ok(Math.abs(f.wind.value) > 0 && Math.abs(f.wind.value) < 0.5, 'a light breeze to start');
});

test('determinism with wind: same seed + inputs → identical wind, sway and gust events', () => {
  function play(seed) {
    const w = mk('hard', seed, 960, 540, 2), out = [];
    for (let f = 0; f < 60 * 120; f++) {
      if (f % 97 === 10) w.press();
      if (f % 97 === 60) w.release();
      if (w.phase === 'reel' && f % 23 === 0) w.press();
      w.update(1 / 60);
      for (const e of w.drainEvents()) out.push(e.type + (e.dir || ''));
    }
    assert.ok(w.stats.gusts >= 5, 'gusts happened: ' + w.stats.gusts);
    return JSON.stringify({ wind: w.wind, hook: w.hook, items: w.items, s: w.getState(), out });
  }
  assert.strictEqual(play(3), play(3));
  assert.notStrictEqual(play(3), play(4));
  const a = mk('normal', 8, 960, 540, 2), b = mk('normal', 8, 960, 540, 2);
  for (let i = 0; i < 60 * 40; i++) { a.update(1 / 60); b.update(1 / 120); b.update(1 / 120); }
  assert.strictEqual(JSON.stringify([a.wind, a.hook]), JSON.stringify([b.wind, b.hook]), 'frame size does not matter');
});

test('gusts: gustWarn 1.5 s ahead, same dir; direction flips every gust; first gust ≥ 6 s into every level', () => {
  for (const diff of ['easy', 'normal', 'hard']) for (const lvl of [0, 1, 2, 3]) for (const seed of [1, 2, 3]) {
    const { log } = gustLog(diff, seed, lvl, 90);
    const gusts = log.filter(e => e.type === 'gust');
    assert.ok(gusts.length >= 4, diff + ' L' + lvl + ' gusts ' + gusts.length);
    assert.ok(gusts[0].zt >= C.firstGustMin - 1e-9, 'first gust at ' + gusts[0].zt.toFixed(2));
    let lastDir = null;
    for (let i = 0; i < log.length; i++) {
      const e = log[i];
      if (e.type !== 'gust') continue;
      const wr = log[i - 1];
      assert.ok(wr && wr.type === 'gustWarn' && wr.dir === e.dir, 'warned with the same direction');
      near(e.t - wr.t, 1.5, H + 1e-9, 'warning lead');
      if (lastDir !== null) assert.strictEqual(e.dir, -lastDir, 'flips');
      lastDir = e.dir;
      assert.strictEqual(Math.sign(e.target), e.dir);
      const st = C.levelStrength[lvl];
      assert.ok(e.strength >= C.gustMag[0] * st - 1e-9 && e.strength <= C.gustMag[1] * st + 1e-9, 'strength ' + e.strength);
    }
  }
  // the wind level is the gustiest; easy is calmer than hard
  const rate = (d, l) => { let n = 0; for (let s = 1; s <= 6; s++) n += gustLog(d, s, l, 120).log.filter(e => e.type === 'gust').length; return n; };
  assert.ok(rate('normal', 2) > 1.2 * rate('normal', 1), 'wind level gusts more often');
  assert.ok(rate('easy', 0) < rate('hard', 0), 'easy gusts less often');
  // levelUp cancels a pending warning and restarts the 6 s rule
  const w = mk('normal', 4); calm(w); w.forceGust(1); w.drainEvents(); w.gotoLevel(1); w.drainEvents();
  run(w, 5.9); assert.ok(!w.drainEvents().some(e => e.type === 'gust'), 'no gust in the first 6 s');
});

test('wind value eases (never jumps): max change per step tiny, settles in ≈ 1.2 s, no overshoot', () => {
  let maxStep = 0;
  gustLog('hard', 5, 2, 120, (w, v0) => { maxStep = Math.max(maxStep, Math.abs(w.wind.value - v0)); });
  assert.ok(maxStep < 0.03, 'max Δvalue per 1/120 s step ' + maxStep);
  const w = mk('normal', 2, 960, 540, 2); calm(w);
  w.wind.value = -1; w.forceGust(1, { instant: true });
  const tgt = w.wind.target; let t = 0, settled = -1, over = 0;
  for (let i = 0; i < 400; i++) { w.update(H); t += H; if (settled < 0 && Math.abs(w.wind.value - tgt) < 0.05 * Math.abs(tgt + 1)) settled = t; over = Math.max(over, w.wind.value - tgt); }
  assert.ok(settled > 0.8 && settled < 1.6, 'settle time ' + settled.toFixed(2));
  assert.ok(over < 1e-6, 'critically damped: no overshoot ' + over);
  // forceGust: warning now, gust 1.5 s later
  const g = mk('normal', 3); calm(g); g.drainEvents();
  g.forceGust(-1);
  assert.ok(g.drainEvents().some(e => e.type === 'gustWarn' && e.dir === -1));
  assert.ok(g.wind.warn > 0 && g.wind.warnDir === -1);
  run(g, 1.49); assert.ok(!g.drainEvents().some(e => e.type === 'gust'));
  run(g, 0.03); const ge = g.drainEvents().find(e => e.type === 'gust');
  assert.ok(ge && ge.dir === -1 && g.wind.target < 0 && g.wind.warn === 0);
});

test('sway: grows with depth, lags the wind like a spring (slight overshoot), hook.x = holeX + sway', () => {
  function steady(y) {
    const w = mk('normal', 1, 960, 1000); quiet(w);
    w.wind.value = w.wind.target = 1;
    w.hook.y = w.hook.prevY = y; w.hook.drop = false;
    w.items.length = 0;
    for (let i = 0; i < 120 * 6; i++) { w.hook.y = y; w.hook.vy = 0; w.update(H); }
    return w;
  }
  const L = mk('normal', 1, 960, 1000).layout;
  const ys = [L.minHookY, (L.minHookY + L.maxHookY) / 2, L.maxHookY];
  const sw = ys.map(y => steady(y).hook.sway);
  assert.ok(sw[0] < sw[1] && sw[1] < sw[2], 'deeper = more sway ' + sw.map(v => v.toFixed(1)));
  near(sw[2], 52, 0.5, 'bottom sway = driftMax'); near(sw[1], 52 * (ys[1] - L.waterTop) / (L.maxHookY - L.waterTop), 0.5);
  const w2 = steady(L.maxHookY); assert.strictEqual(w2.hook.x, w2.layout.holeX + w2.hook.sway);
  // step response: lag and a little overshoot
  const w = mk('normal', 1, 960, 1000); quiet(w);
  w.hook.y = L.maxHookY; w.hook.drop = false;
  w.wind.value = w.wind.target = 1; w.wind.rate = 0;
  const series = [];
  for (let i = 0; i < 120 * 5; i++) { w.hook.y = L.maxHookY; w.hook.vy = 0; w.update(H); series.push(w.hook.sway); }
  const at = s => series[Math.round(s / H) - 1];
  assert.ok(at(0.2) < 0.25 * 52, 'lags: ' + at(0.2).toFixed(1) + ' px after 0.2 s');
  assert.ok(at(0.6) > 0.4 * 52, 'gets there');
  const peak = Math.max(...series);
  assert.ok(peak > 52 * 1.01 && peak < 52 * 1.12, 'slight overshoot ' + peak.toFixed(1));
  near(series[series.length - 1], 52, 0.5, 'settles');
  // the hook leans with its sideways speed
  const v = mk('normal', 1, 960, 1000); quiet(v); v.hook.y = L.maxHookY; v.hook.drop = false; v.wind.value = v.wind.target = 1;
  let maxTilt = 0; for (let i = 0; i < 60; i++) { v.hook.y = L.maxHookY; v.hook.vy = 0; v.update(H); maxTilt = Math.max(maxTilt, v.hook.tilt); }
  assert.ok(maxTilt > 0.03, 'leans with the sway ' + maxTilt);
  // while reeling the line is taut: half the sway, and the hooked flake follows hook.x
  const r = mk('normal', 1, 960, 1000); hookFlake(r, 'grape', L.maxHookY - 10);
  r.wind.value = r.wind.target = 1; run(r, 3);
  const f = r.items.find(i => i.state === 'hooked');
  near(r.hook.sway, 0.5 * 52 * r.depthFrac(r.hook.y), 1, 'reel sway ×0.5');
  near(f.x, r.hook.x, 1e-6, 'flake rides the swayed hook');
  // collisions use hook.x: a flake under the swayed hook is hooked, one under the gap is not
  const c = mk('normal', 1, 960, 1000); quiet(c);
  c.hook.y = L.maxHookY; c.hook.drop = false; c.wind.value = c.wind.target = 1;
  for (let i = 0; i < 120 * 5; i++) { c.hook.y = L.maxHookY; c.hook.vy = 0; c.update(H); }
  place(c, 'flake', 'grape', c.layout.holeX, L.maxHookY); c.update(H);
  assert.strictEqual(c.phase, 'roam', 'nothing under the gap column');
  place(c, 'flake', 'grape', c.hook.x, L.maxHookY); c.update(H);
  assert.strictEqual(c.phase, 'reel', 'hooked at the swayed position');
});

test('hook stays on screen (≥ 60 px from the edges) at 560×1600, 1280×540 and a tiny 320×480', () => {
  for (const [Wd, Hh] of [[560, 1600], [1280, 540], [320, 480], [960, 540]]) for (const diff of ['easy', 'hard']) {
    const w = mk(diff, 2, Wd, Hh, 2);
    let minX = 1e9, maxX = -1e9;
    for (let i = 0; i < 120 * 90; i++) {
      if (i % 120 === 0) { w.wind.value = (i / 120) % 2 ? 1 : -1; w.wind.rate = 0; w.wind.target = w.wind.value; }  // brutal flips
      if (w.phase === 'roam' && !w.hook.holding) w.press();
      if (w.phase === 'reel') { w.press(); w.release(); }
      w.update(H);
      minX = Math.min(minX, w.hook.x); maxX = Math.max(maxX, w.hook.x);
    }
    assert.ok(minX >= C.screenPad - 1e-9 && maxX <= Wd - C.screenPad + 1e-9, Wd + 'x' + Hh + ' ' + diff + ': ' + minX.toFixed(1) + '..' + maxX.toFixed(1));
  }
});

test('current: swimmers drift with the wind but never stall or reverse (≥ 40% own speed)', () => {
  let checked = 0, pushed = 0;
  for (const diff of ['easy', 'hard']) for (let seed = 1; seed <= 4; seed++) {
    const w = mk(diff, seed, 960, 540, 2);
    for (let i = 0; i < 120 * 60; i++) {
      if (i % 240 === 0) { w.wind.value = w.wind.target = (i / 240) % 2 ? 1 : -1; w.wind.rate = 0; }
      w.update(H);
      for (const it of w.items) {
        if (it.state !== 'swim' || it.t < H * 1.5 || it.leaving) continue;
        const dx = it.x - it.prevX;
        assert.ok(dx * Math.sign(it.vx) >= C.minOwnSpeed * Math.abs(it.vx) * H - 1e-9, it.kind + ' stalled/reversed');
        if (Math.abs(dx / H - it.vx) > 1) pushed++;
        checked++;
      }
    }
  }
  assert.ok(checked > 10000 && pushed > checked * 0.5, 'the current really pushes: ' + pushed + '/' + checked);
  // the push is weaker deeper down and matches the formula
  const w = mk('normal', 1); calm(w); w.wind.value = 1;
  const top = { vx: 40, y: w.layout.waterTop }, bot = { vx: 40, y: w.layout.maxHookY };
  near(w.effVx(top) - 40, 14, 1e-9); near(w.effVx(bot) - 40, 7, 1e-9);
  near(w.effVx({ vx: 10, y: 300 }), 10 + 14 * (1 - 0.5 * w.depthFrac(300)), 1e-9);
  w.wind.value = -1; near(w.effVx({ vx: 10, y: 200 }), 4, 1e-9, 'clamped at 40% of own speed');
});

test('level 1 on Easy is gentle: soft gusts, small sway, few gummies', () => {
  const w = mk('easy');
  assert.ok(w.diff.driftMax * C.levelStrength[0] <= 21, 'max sway at the bottom ≈ 20 px');
  let maxSway = 0;
  const { log } = gustLog('easy', 3, 0, 120, x => { maxSway = Math.max(maxSway, Math.abs(x.hook.sway)); });
  assert.ok(log.filter(e => e.type === 'gust').length <= 10, 'at most one gust per ~11 s');
  assert.ok(maxSway <= 21, 'sway ' + maxSway);
});

// ---------- bot / long runs ----------
test('bot skill 0.9 survives and clears ≥ 2 zones on normal', () => {
  for (const seed of [1, 2, 3]) {
    const r = playBot('normal', seed, 0.9, 300, { stopLevel: 2 });
    assert.ok(r.w.level >= 2, 'seed ' + seed + ' level ' + r.w.level);
    assert.ok(r.w.phase !== 'over' && r.w.lines >= 1);
    assert.ok(r.t < 240, 'two zones in < 4 min: ' + r.t.toFixed(0));
    assert.ok(r.w.stats.perfect > r.w.stats.slip);
  }
});

test('bot: low skill slips more than high skill; deterministic', () => {
  const lo = playBot('normal', 4, 0.3, 180), hi = playBot('normal', 4, 1, 180);
  const rate = w => w.stats.slip / Math.max(1, w.stats.slip + w.stats.good + w.stats.perfect);
  assert.ok(rate(lo.w) > rate(hi.w) + 0.1, rate(lo.w) + ' vs ' + rate(hi.w));
  assert.ok(hi.w.stats.perfect / Math.max(1, hi.w.stats.perfect + hi.w.stats.good) > 0.9, 'skill 1 ≈ always Perfect');
  const a = playBot('hard', 5, 0.7, 60), b = playBot('hard', 5, 0.7, 60);
  assert.strictEqual(JSON.stringify(a.w.getState()), JSON.stringify(b.w.getState()));
});

test('bot skill 1 survives 10 simulated minutes on Easy and Normal (wind on), with weather', () => {
  for (const diff of ['easy', 'normal']) for (const seed of [1, 2, 3, 4]) {
    const r = playBot(diff, seed, 1, 600, { weather: true });
    assert.ok(r.w.phase !== 'over', diff + ' seed ' + seed + ' game over at level ' + r.w.level);
    assert.ok(r.w.stats.snaps <= 3, diff + ' seed ' + seed + ' snaps ' + r.w.stats.snaps);
    assert.ok(r.w.level >= 6, diff + ' seed ' + seed + ' level ' + r.w.level);
    assert.ok(r.w.stats.gusts > 30, 'gusts ' + r.w.stats.gusts);
    assert.ok(r.maxP < 160);
  }
});

test('10 simulated minutes (world + bot + weather) run in < 2 s', () => {
  const t0 = Date.now();
  const r = playBot('normal', 11, 0.95, 600, { weather: true });
  const ms = Date.now() - t0;
  assert.ok(ms < 2000, ms + ' ms');
  assert.ok(r.t >= 599 || r.w.phase === 'over');
  assert.ok(r.maxP < 160, 'particles ' + r.maxP);
  assert.ok(r.w.items.length < 40, 'items bounded ' + r.w.items.length);
  console.log('      (10 min sim: ' + ms + ' ms, level ' + r.w.level + ', score ' + r.w.score + ', max particles ' + r.maxP + ')');
});

// ---------- weather ----------
const SPRITES = ['snowflake', 'bubble_s', 'sprinkle', 'sprinkle_b', 'sprinkle_y', 'floss', 'wrapper', 'ring', 'sparkle', 'drop', 'star', 'puff'];
const SKY = ['snowflake', 'sprinkle', 'sprinkle_b', 'sprinkle_y', 'floss', 'wrapper'];
test('weather: every level, bursts, all screen sizes, gusty wind — bounded (< 160), sane fields, right sprites', () => {
  for (const [W, Hh] of [[960, 540], [1280, 540], [720, 1600], [560, 1600], [560, 960]]) {
    const wx = new PR.Weather({ width: W, height: Hh, seed: 3 });
    for (let z = 0; z < 5; z++) {
      wx.setLevel(z, { instant: z === 0 });
      const seen = new Set(); let rings = 0;
      for (let i = 0; i < 60 * 8; i++) {
        if (i % 20 === 0) wx.burst('star', W / 2, 300, 30, { gravity: 300 });
        if (i % 33 === 0) wx.burst('drop', W / 2, 190, 12, { up: 1 });
        const wind = Math.sin(i / 60 * 1.3);                         // flipping wind
        wx.update(1 / 60, { hookX: W / 2, hookY: 300 + 200 * Math.sin(i / 20), surfaceY: 150, waterTop: 190, wind });
        assert.ok(wx.particles.length < 160, 'cap ' + wx.particles.length);
        for (const p of wx.particles) { seen.add(p.sprite); if (p.kind === 'ring') rings++; }
      }
      for (const p of wx.particles) {
        assert.ok(SPRITES.includes(p.sprite), p.sprite);
        assert.ok(['sky', 'back', 'front'].includes(p.layer));
        assert.ok(isFinite(p.x) && isFinite(p.y) && isFinite(p.rot) && p.size > 0 && p.alpha >= 0 && p.alpha <= 1.0001);
        if (p.kind === 'burst') continue;
        if (SKY.includes(p.sprite)) assert.ok(p.y <= 196, p.sprite + ' stays above the water ' + p.y);
        if (p.sprite === 'bubble_s' || (p.sprite === 'sparkle' && p.kind === 'glint')) assert.ok(p.y >= 180, p.sprite + ' under water ' + p.y);
        if (p.sprite === 'ring') near(p.y, 192, 1e-9, 'rings at waterTop + 2');
      }
      const zz = z % 4;
      assert.ok(seen.has('bubble_s'), 'soda bubbles in every level');
      if (zz === 0) assert.ok(seen.has('floss') && !seen.has('sprinkle'));
      if (zz === 1) { assert.ok(seen.has('sprinkle') && seen.has('sprinkle_b') && seen.has('sprinkle_y')); assert.ok(rings > 0, 'sprinkles ring the water'); }
      if (zz === 2) assert.ok(seen.has('floss') && seen.has('wrapper'));
      if (zz === 3) { assert.ok(seen.has('snowflake') && seen.has('sparkle')); assert.ok(wx.ambient.glow > 0.7 && wx.ambient.dark > 0.3); }
      assert.ok('tint' in wx.ambient && 'glow' in wx.ambient && 'dark' in wx.ambient);
    }
    wx.resize(W === 960 ? 560 : 960, 1200);
    wx.update(1 / 60, {});
    assert.ok(wx.particles.length < 160);
  }
  // hook trail appears while the hook moves
  const wx = new PR.Weather({ width: 960, height: 540, seed: 1 });
  for (let i = 0; i < 30; i++) wx.update(1 / 60, { hookX: 480, hookY: 220 + i * 4, surfaceY: 150, waterTop: 190 });
  assert.ok(wx.particles.some(p => p.kind === 'trail'));
});

test('weather: the wind pushes light things — floss/snow/sprinkles/bubbles drift with it and turn round after a flip', () => {
  function meanVx(zone, wind, sprites) {
    const wx = new PR.Weather({ width: 960, height: 540, seed: 5 });
    wx.setLevel(zone, { instant: true });
    for (let i = 0; i < 60 * 6; i++) wx.update(1 / 60, { surfaceY: 150, waterTop: 190, wind });
    const ps = wx.particles.filter(p => sprites.includes(p.sprite) && p.kind !== 'burst');
    const x0 = ps.map(p => p.x); wx.update(1 / 60, { surfaceY: 150, waterTop: 190, wind });
    let s = 0, n = 0; ps.forEach((p, i) => { const dx = p.x - x0[i]; if (Math.abs(dx) < 50) { s += dx * 60; n++; } });
    return { v: s / Math.max(1, n), wx };
  }
  for (const [z, spr] of [[0, ['floss']], [1, ['sprinkle', 'sprinkle_b', 'sprinkle_y']], [2, ['floss', 'wrapper']], [3, ['snowflake']], [0, ['bubble_s']]]) {
    const r = meanVx(z, 1, spr).v, l = meanVx(z, -1, spr).v;
    assert.ok(r > 3 && l < -3, 'zone ' + z + ' ' + spr[0] + ': ' + r.toFixed(1) + ' / ' + l.toFixed(1));
  }
  assert.ok(meanVx(2, 1, ['wrapper']).v > 2 * meanVx(0, 1, ['floss']).v, 'wind level tumbles much faster than sunny');
  // inertia: right after a flip the floss is still moving the old way, then turns
  const { wx } = meanVx(2, 1, ['floss']);
  const fl = () => wx.particles.filter(p => p.sprite === 'floss' && !p.dying);
  wx.update(1 / 60, { wind: -1 });
  assert.ok(fl().every(p => p.vx > 0), 'no instant reversal');
  for (let i = 0; i < 60 * 3; i++) wx.update(1 / 60, { wind: -1 });
  assert.ok(fl().every(p => p.vx < 0), 'turned round');
});

// ---------- run ----------
let pass = 0, fail = 0;
test('anti-mash: hammering the button at 10 Hz makes a hooked flake escape (playtest guard)', () => {
  for (const d of ['easy', 'normal', 'hard']) {
    let landed = 0, escaped = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const w = mk(d, seed); quiet(w); hookFlake(w, 'grape', w.layout.bands[2] + 20); w.drainEvents();
      for (let k = 0; k < 60 && w.phase === 'reel'; k++) { w.press(); w.release(); run(w, 0.1); }
      const ev = w.drainEvents().map(e => e.type);
      if (ev.includes('catch')) landed++; if (ev.includes('escape')) escaped++;
    }
    assert.ok(landed <= 3, d + ': mashing landed ' + landed + '/20');
    assert.ok(escaped >= 15, d + ': mashing escaped only ' + escaped + '/20');
  }
});

for (const t of tests) {
  try { t.fn(); pass++; console.log('PASS ' + t.name); }
  catch (e) { fail++; console.log('FAIL ' + t.name + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n     ') : e)); }
}
console.log('\n' + pass + '/' + tests.length + ' passed' + (fail ? ', ' + fail + ' FAILED' : ''));
process.exit(fail ? 1 : 0);
