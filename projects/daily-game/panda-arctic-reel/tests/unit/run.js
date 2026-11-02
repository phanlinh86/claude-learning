#!/usr/bin/env node
// Bao's Arctic Reel — headless unit tests for rng / world / weather / bot (node, no deps).
// Run from projects/daily-game/panda-arctic-reel:   node tests/unit/run.js
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
/** a world with an empty, spawn-free sea and the hook resting under the ice */
function quiet(w) {
  w.items.length = 0;
  w._gemT = w._fishT = w._pufT = 1e9;
  w._grace = 1e9;
  run(w, 1.5);
  w.drainEvents();
  return w;
}
function place(w, kind, type, x, y) {
  const r = kind === 'gem' ? w.diff.gemR : kind === 'puffer' ? w.diff.pufferR : 14;
  const it = w._newItem(kind, type, y, 0.0001, -1, r, 0, 0);
  it.x = it.prevX = x; it.vx = 0.0001;
  return it;
}
function hookGem(w, type, y) {
  quiet(w);
  const hk = w.hook;
  hk.y = hk.prevY = y; hk.vy = 0;
  const g = place(w, 'gem', type || 'amethyst', hk.x, y);
  w.update(H);
  assert.strictEqual(w.phase, 'reel', 'gem on the hook starts the reel');
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
    if (wx) { wx.update(dt, { hookX: w.hook.x, hookY: w.hook.y, surfaceY: w.layout.surfaceY, waterTop: w.layout.waterTop }); maxP = Math.max(maxP, wx.particles.length); }
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

test('CONFIG: step, presets, gemsNeeded per difficulty', () => {
  assert.ok(C.step <= 1 / 120 + 1e-12);
  assert.deepStrictEqual(['easy', 'normal', 'hard'].map(d => C.difficulty[d].gemsNeeded), [6, 8, 10]);
  assert.deepStrictEqual(['easy', 'normal', 'hard'].map(d => mk(d).gemsNeeded), [6, 8, 10]);
  assert.deepStrictEqual(J(C.points), { amethyst: 10, emerald: 20, ruby: 30, gold: 50 });
  const e = C.difficulty.easy, n = C.difficulty.normal, h = C.difficulty.hard;
  assert.ok(e.reelWidth > n.reelWidth && n.reelWidth > h.reelWidth, 'green zone narrows with difficulty');
  assert.ok(e.needle < n.needle && n.needle < h.needle, 'needle speeds up with difficulty');
  assert.ok(e.pufferEvery > n.pufferEvery && n.pufferEvery > h.pufferEvery, 'puffers rarer on easy');
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
  const it = w.items.find(i => i.kind === 'gem');
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
  near(w.hook.y, w.layout.minHookY, 0.5, 'floats back to rest under the ice');
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

test('rise: buoyancy is gentler than weight, terminal rise speed, rests under the ice', () => {
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
test('hook → reel: touching a gem hooks it; reel state set up', () => {
  const w = mk(); quiet(w);
  w.press(); w.update(H);
  const hk = w.hook;
  hk.y = hk.prevY = 400;
  const g = place(w, 'gem', 'emerald', hk.x + 20, 400);
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
  assert.strictEqual(w.bao.anim, 'reel');
  // gem slides onto the hook and then rides it
  run(w, 0.3);
  near(g.x, hk.x, 1e-6); near(g.y, hk.y + C.gemHang, 1e-6);
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
  // puffers ignore the hook while reeling
  place(w, 'puffer', 'puffer', hk.x, hk.y);
  run(w, 0.1);
  assert.strictEqual(w.phase, 'reel');
});

test('reel taps: perfect = 2 steps with eased tug, good = 1, slip = ½ step + wobble, zone jumps', () => {
  const w = mk('normal', 2);
  hookGem(w, 'ruby', 470);
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
  assert.ok(Math.abs(g.x - hk.x) > 0.5, 'gem wobbles after a slip');
  assert.deepStrictEqual([w.stats.perfect, w.stats.good, w.stats.slip], [1, 1, 1]);
});

test('escape: 3 slips → gem wriggles free and floats away; must press again to sink', () => {
  const w = mk('normal', 3);
  const g = hookGem(w, 'emerald', 380);
  for (let k = 0; k < 3; k++) tapAt(w, w.reel.zone > 0.5 ? 0 : 1);
  const ev = w.drainEvents();
  assert.ok(ev.some(e => e.type === 'escape' && e.item === g));
  assert.strictEqual(w.phase, 'roam');
  assert.strictEqual(w.hook.holding, false);
  assert.strictEqual(g.state, 'escape');
  assert.strictEqual(w.stats.escapes, 1);
  assert.strictEqual(w.bao.anim, 'oops');
  const x0 = g.x, y0 = g.y;
  run(w, 0.8);
  assert.ok(g.y < y0 - 20 && Math.abs(g.x - x0) > 20, 'floats up and sideways');
  run(w, 3);
  assert.ok(!w.items.includes(g), 'gone');
  assert.strictEqual(w.gemsInZone, 0);
});

test('catch: gold = 50 (+5 per Perfect), event, gem flies to the bucket, hook drops back in', () => {
  const w = mk('normal', 4);
  const g = hookGem(w, 'gold', 300);
  near(w.reel.speed, w.diff.needle * C.goldNeedle, 1e-9, 'needle 15% faster on gold');
  let perf = 0, ev = [], guard = 0;
  while (w.phase === 'reel' && guard++ < 50) { tapAt(w, w.reel.zone); perf++; run(w, 0.3); ev = ev.concat(w.drainEvents()); }
  const c = ev.find(e => e.type === 'catch');
  assert.ok(c && c.item === g && c.points === 50);
  assert.strictEqual(w.score, 50 + 5 * perf);
  assert.deepStrictEqual([w.gemsInZone, w.totalGems, w.stats.catches, w.stats.byType.gold], [1, 1, 1, 1]);
  assert.strictEqual(g.state, 'caught');
  assert.strictEqual(w.bao.anim, 'happy');
  assert.strictEqual(w.hook.holding, false);
  run(w, C.catchFly);
  assert.ok(!w.items.includes(g), 'landed in the bucket');
  let splash = false;
  for (let i = 0; i < 240; i++) { w.update(H); if (w.drainEvents().some(e => e.type === 'splash')) splash = true; }
  assert.ok(splash && w.hook.y >= w.layout.waterTop, 'empty hook drops back in');
  // other gem values
  for (const [t, p] of [['amethyst', 10], ['emerald', 20], ['ruby', 30]]) {
    const v = mk('normal', 5); hookGem(v, t, 230);
    let e2 = [], k = 0;
    while (v.phase === 'reel' && k++ < 50) { tapAt(v, v.reel.zone + v.reel.width * 0.45); run(v, 0.3); e2 = e2.concat(v.drainEvents()); }
    assert.strictEqual(e2.find(e => e.type === 'catch').points, p, t);
    assert.strictEqual(v.score, p, t + ' with Good taps only');
  }
});

test('steps to the surface: deepest gem needs stepsFull good taps', () => {
  for (const d of ['easy', 'normal', 'hard']) {
    const w = mk(d, 6);
    hookGem(w, 'ruby', w.layout.maxHookY);
    let taps = 0;
    while (w.phase === 'reel' && taps < 30) { tapAt(w, w.reel.zone + w.reel.width * 0.45); taps++; run(w, 0.3); }
    assert.strictEqual(taps, C.difficulty[d].stepsFull, d);
  }
});

// ---------- puffers / lines ----------
test('puffer snap: line −1, puff, hook resets after 1 s, invuln, game over at 0 lines', () => {
  const w = mk('normal', 7); quiet(w);
  const hk = w.hook;
  w.press();
  const p = place(w, 'puffer', 'puffer', hk.x, hk.y + 5);
  w.update(H);
  let ev = w.drainEvents();
  assert.ok(ev.some(e => e.type === 'snap') && ev.some(e => e.type === 'puff' && e.item === p));
  assert.deepStrictEqual([w.lines, w.phase, p.state, hk.lost, hk.holding], [2, 'snap', 'puffed', true, false]);
  assert.strictEqual(w.bao.anim, 'oops');
  const px = p.x;
  run(w, 0.2); assert.ok(p.puff > 0.5 && p.r > p.r0, 'inflates');
  run(w, 0.7); assert.strictEqual(w.phase, 'snap');
  run(w, 0.15); assert.strictEqual(w.phase, 'roam', 'new line after 1.0 s');
  assert.ok(hk.y < w.layout.waterTop && !hk.lost);
  assert.ok(Math.abs(p.x - px) > 10, 'puffed puffer drifts away');
  near(w.invuln, C.invuln - 0.05, 0.02, 'invulnerable 1.5 s after the new line');
  run(w, 0.5);
  place(w, 'puffer', 'puffer', hk.x, hk.y);
  run(w, 0.2);
  assert.strictEqual(w.lines, 2, 'no snap while invulnerable');
  w.items.length = 0;
  run(w, 1.2);
  assert.strictEqual(w.invuln, 0);
  place(w, 'puffer', 'puffer', hk.x, hk.y);
  w.update(H);
  assert.strictEqual(w.lines, 1);
  run(w, 2.6); w.items.length = 0; w.drainEvents();
  place(w, 'puffer', 'puffer', hk.x, hk.y);
  w.update(H);
  ev = w.drainEvents();
  assert.deepStrictEqual([w.lines, w.phase], [0, 'over']);
  assert.ok(ev.some(e => e.type === 'gameOver'));
  w.press(); run(w, 1);
  assert.strictEqual(w.phase, 'over', 'stays over');
  assert.strictEqual(w.stats.snaps, 3);
});

test('zone clear: levelUp, +1 line (max 3), puffers swim off harmlessly', () => {
  const w = mk('normal', 8);
  quiet(w);
  w.lines = 2;
  w.gemsInZone = w.gemsNeeded - 1;
  const p = place(w, 'puffer', 'puffer', w.layout.holeX + 200, 300);
  hookGem(w, 'amethyst', 220);
  w.items.push(p);
  let ev = [], k = 0;
  while (w.phase === 'reel' && k++ < 20) { tapAt(w, w.reel.zone); run(w, 0.3); ev = ev.concat(w.drainEvents()); }
  assert.ok(ev.some(e => e.type === 'lineBack'));
  const lu = ev.find(e => e.type === 'levelUp');
  assert.ok(lu && lu.level === 1 && lu.zone === 1);
  assert.deepStrictEqual([w.lines, w.level, w.zone, w.loop, w.gemsInZone], [3, 1, 1, 0, 0]);
  assert.ok(p.leaving && p.vx > 0, 'puffer turns away');
  // full lines: no lineBack
  w.gemsInZone = w.gemsNeeded - 1;
  quiet(w); w.drainEvents();
  hookGem(w, 'amethyst', 220);
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
    assert.strictEqual(w.gemsNeeded, C.difficulty[d].gemsNeeded);
  }
  const g = mk(); g.gotoLevel(5);
  assert.deepStrictEqual([g.level, g.zone, g.loop], [5, 1, 1]);
  assert.ok(g.drainEvents().some(e => e.type === 'levelUp' && e.level === 5));
  // easy zone 0: wide zone, slow needle, few puffers
  const e0 = mk('easy');
  assert.ok(e0._reelWidth >= 0.35 && e0._needle <= 0.5 && e0._pufferMax() === 1);
});

test('spawning: no puffers in the first 10 s of zone 0; puffers later; depth bands decide gem type', () => {
  let pufEarly = 0, pufLater = 0;
  const types = { amethyst: [], emerald: [], ruby: [] };
  for (let s = 1; s <= 8; s++) {
    const w = mk('normal', s);
    for (let i = 0; i < 120 * 60; i++) {
      w.update(H);
      for (const it of w.items) {
        if (it.t === H || it.t < H * 1.5) {
          if (it.kind === 'puffer') { if (w.zoneTime < 10) pufEarly++; else pufLater++; }
          if (it.kind === 'gem' && types[it.type]) types[it.type].push(it.by);
        }
      }
    }
    const L = w.layout;
    for (const y of types.amethyst) assert.ok(y <= L.bands[1] + 1e-9);
    for (const y of types.emerald) assert.ok(y >= L.bands[1] && y <= L.bands[2]);
    for (const y of types.ruby) assert.ok(y >= L.bands[2] && y <= L.bands[3]);
  }
  assert.strictEqual(pufEarly, 0, 'no puffers in the first 10 s');
  assert.ok(pufLater > 8, 'puffers appear later: ' + pufLater);
  assert.ok(types.amethyst.length > types.ruby.length, 'zone 0 is mostly shallow');
  // easy has far fewer puffers than hard
  function puffers(d) { let n = 0; for (let s = 1; s <= 4; s++) { const w = mk(d, s); let seen = new Set(); for (let i = 0; i < 120 * 90; i++) { w.update(H); for (const it of w.items) if (it.kind === 'puffer') seen.add(it.id); } n += seen.size; } return n; }
  const pe = puffers('easy'), ph = puffers('hard');
  assert.ok(pe * 3 < ph, 'easy ' + pe + ' vs hard ' + ph);
});

test('golden gem: ~1 in 12 spawns, never twice in a row, faster, golden event; spawnGold()', () => {
  let gems = 0, gold = 0, twice = 0, events = 0, last = false, vG = 0, vN = 0, nG = 0, nN = 0;
  for (let s = 1; s <= 10; s++) {
    const w = mk('normal', s);
    const seen = new Set();
    for (let i = 0; i < 120 * 300; i++) {
      w.update(H);
      events += w.drainEvents().filter(e => e.type === 'golden').length;
      for (const it of w.items) {
        if (it.kind !== 'gem' || seen.has(it.id)) continue;
        seen.add(it.id); gems++;
        const g = it.type === 'gold';
        if (g) { gold++; if (last) twice++; vG += Math.abs(it.vx); nG++; } else { vN += Math.abs(it.vx); nN++; }
        last = g;
      }
    }
  }
  const rate = gold / gems;
  assert.ok(rate > 0.05 && rate < 0.11, 'gold rate ' + rate.toFixed(3) + ' of ' + gems);
  assert.strictEqual(twice, 0, 'never twice in a row');
  assert.strictEqual(events, gold, 'golden event per golden spawn');
  assert.ok(vG / nG > 1.3 * (vN / nN), 'golden gems drift faster');
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
  assert.strictEqual(w.hook.x, 280);
  assert.ok(w.hook.y >= L.minHookY && w.hook.y <= L.maxHookY);
  for (const it of w.items) if (it.state === 'swim') assert.ok(it.by >= L.minHookY - 1 && it.by <= L.maxHookY + 1, 'item depth mapped');
  run(w, 2);
  assert.ok(w.hook.y <= L.maxHookY);
  // during a reel too
  const v = mk('normal', 10); hookGem(v, 'ruby', 470);
  v.setLayout(720, 1600);
  assert.ok(v.reel.targetY > 1000 && v.hook.y > 1000 && v.reel.steps <= v.diff.stepsFull);
  run(v, 0.5);
  const g = v.items.find(i => i.state === 'hooked');
  near(g.y, v.hook.y + C.gemHang, 1e-6);
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
test('weather: every zone, bursts, portrait 720×1600 — bounded counts, sane fields', () => {
  for (const [W, Hh] of [[960, 540], [1280, 540], [720, 1600], [560, 960]]) {
    const wx = new PR.Weather({ width: W, height: Hh, seed: 3 });
    for (let z = 0; z < 5; z++) {
      wx.setLevel(z, { instant: z === 0 });
      for (let i = 0; i < 60 * 8; i++) {
        if (i % 20 === 0) wx.burst('star', W / 2, 300, 30, { gravity: 300 });
        if (i % 33 === 0) wx.burst('drop', W / 2, 190, 12, { up: 1 });
        wx.update(1 / 60, { hookX: W / 2, hookY: 300 + 200 * Math.sin(i / 20), surfaceY: 150, waterTop: 190 });
        assert.ok(wx.particles.length < 160, 'cap ' + wx.particles.length);
      }
      const spr = new Set(wx.particles.map(p => p.sprite));
      for (const p of wx.particles) {
        assert.ok(['snowflake', 'bubble_s', 'kelp_bit', 'plankton', 'jelly', 'sparkle', 'drop', 'star', 'puff'].includes(p.sprite), p.sprite);
        assert.ok(['sky', 'back', 'front'].includes(p.layer));
        assert.ok(isFinite(p.x) && isFinite(p.y) && p.size > 0 && p.alpha >= 0 && p.alpha <= 1.0001);
        if (p.sprite === 'snowflake' && p.kind !== 'burst') assert.ok(p.y <= 156);
        if (['bubble_s', 'kelp_bit', 'plankton', 'jelly'].includes(p.sprite) && p.kind !== 'burst') assert.ok(p.y >= 180, p.sprite + ' under water ' + p.y);
      }
      const zz = z % 4;
      if (zz === 1) assert.ok(spr.has('kelp_bit'));
      if (zz === 2) assert.ok(spr.has('plankton'));
      if (zz === 3) { assert.ok(spr.has('jelly') && spr.has('sparkle')); assert.ok(wx.ambient.aurora > 0.9 && wx.ambient.glow > 0.7); }
      if (zz === 0) assert.ok(spr.has('snowflake') && spr.has('bubble_s'));
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

// ---------- run ----------
let pass = 0, fail = 0;
for (const t of tests) {
  try { t.fn(); pass++; console.log('PASS ' + t.name); }
  catch (e) { fail++; console.log('FAIL ' + t.name + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n     ') : e)); }
}
console.log('\n' + pass + '/' + tests.length + ' passed' + (fail ? ', ' + fail + ' FAILED' : ''));
process.exit(fail ? 1 : 0);
