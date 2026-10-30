#!/usr/bin/env node
// Pip's Candy Dash — headless unit tests for rng / world / weather / bot.
// Run from projects/daily-game/penguin-candy-dash:   node tests/unit/run.js
'use strict';
const assert = require('assert');
const { load } = require('./load');

const CD = load();
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const H = 1 / 120;
const J = v => JSON.parse(JSON.stringify(v));
assert.deepStrictEqual = ((orig) => (a, b, m) => orig(J(a), J(b), m))(assert.deepStrictEqual);
assert.notDeepStrictEqual = ((orig) => (a, b, m) => orig(J(a), J(b), m))(assert.notDeepStrictEqual);
const hyp = (x, y) => Math.sqrt(x * x + y * y);

// ---------- helpers ----------
const NOBEARS = { bearCounts: [0, 0, 0, 0], bearsPerLap: 0 };
function world(seed, cfg, level) {
  const w = new CD.World({ seed: seed || 1, config: Object.assign({ introDelay: 0 }, cfg) });
  if (level) w.startLevel(level);
  w.update(H * 2);
  assert.strictEqual(w.state, 'playing');
  for (const b of w.bears) b.spawnT = 1;     // bears faded in (fade-in tested in the intro test)
  w.drainEvents();
  return w;
}
function run(w, seconds, dt, each) {
  dt = dt || 1 / 60;
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) { if (each && each(i) === false) return; w.update(dt); }
}
function speed(e) { return hyp(e.vx, e.vy); }
function clearGems(w) { w.gems.length = 0; w.gemsWanted = 0; }
function randomPlayer(w, rng) {
  let t = 0, mx = 0, my = 0;
  return dt => {
    t -= dt;
    if (t <= 0) { const a = rng.range(0, Math.PI * 2); mx = Math.cos(a); my = Math.sin(a); t = rng.range(0.3, 1.0); }
    w.setMove(mx, my);
    if (rng.chance(0.03)) w.action();
  };
}
function playGame(seed, diff, player, maxS) {
  const w = new CD.World({ seed, config: CD.DIFFICULTY[diff || 'normal'] });
  const bot = player === 'random' ? null : new CD.Bot(w, { skill: player, seed });
  const rp = player === 'random' ? randomPlayer(w, new CD.RNG(seed * 7 + 3)) : null;
  let t = 0; maxS = maxS || 1800;
  while (w.state !== 'dead' && t < maxS) {
    if (bot) bot.step(1 / 60); else rp(1 / 60);
    w.update(1 / 60); w.drainEvents(); t += 1 / 60;
  }
  return { w, t, bot };
}

// ---------- RNG ----------
test('rng: deterministic and in range', () => {
  const a = new CD.RNG(42), b = new CD.RNG(42), c = new CD.RNG(43);
  const sa = [], sb = [], sc = [];
  for (let i = 0; i < 500; i++) { sa.push(a.next()); sb.push(b.next()); sc.push(c.next()); }
  assert.deepStrictEqual(sa, sb);
  assert.notDeepStrictEqual(sa, sc);
  assert.ok(sa.every(v => v >= 0 && v < 1));
});

// ---------- contract ----------
test('world: initial state and DESIGN §5.1 contract fields', () => {
  const w = new CD.World({ seed: 5 });
  assert.strictEqual(w.state, 'ready');
  for (const k of ['level', 'biome', 'lap', 'time', 'levelTime', 'score', 'hearts', 'heartsMax', 'size', 'sizeMax', 'jar', 'jarTarget',
    'gemsTotal', 'pops', 'bumps', 'arena', 'zones', 'gate', 'pip', 'bears', 'gems', 'cfg', '_acc']) assert.ok(k in w, k);
  assert.deepStrictEqual([w.level, w.biome, w.lap, w.score, w.size, w.sizeMax, w.hearts, w.heartsMax], [0, 0, 0, 0, 1, 5, 3, 3]);
  assert.deepStrictEqual(w.arena, { x: 40, y: 84, w: 880, h: 432 });
  assert.deepStrictEqual(w.zones, []);
  for (const k of ['x', 'y', 'vx', 'vy', 'facing', 'frame', 'scale', 'radius', 'invuln', 'dashCd', 'sliding', 'squash', '_px', '_py']) assert.ok(k in w.pip, 'pip.' + k);
  assert.strictEqual(w.bears.length, 2);
  for (const b of w.bears) for (const k of ['id', 'kind', 'x', 'y', 'vx', 'vy', 'facing', 'frame', 'stun', 'radius', 'spawnT', '_px', '_py']) assert.ok(k in b, 'bear.' + k);
  assert.ok(w.gems.length >= 3);
  for (const g of w.gems) for (const k of ['id', 'color', 'x', 'y', 'vx', 'vy', 'appear', 'loose', 'life', '_px', '_py']) assert.ok(k in g, 'gem.' + k);
  assert.deepStrictEqual([w.gate.x, w.gate.y, w.gate.open], [900, 300, false]);
  const ev = w.drainEvents().map(e => e.type);
  assert.deepStrictEqual(ev, ['start', 'biome']);
  assert.strictEqual(w.cfg.step, 1 / 120);
  assert.ok(CD.DIFFICULTY.easy && CD.DIFFICULTY.normal && CD.DIFFICULTY.hard);
});

test('world: intro ~1.4 s ready, input ignored, then playing + go event', () => {
  const w = new CD.World({ seed: 3 });
  w.drainEvents();
  w.setMove(1, 0); w.action();
  run(w, 1.3);
  assert.strictEqual(w.state, 'ready');
  assert.ok(Math.abs(w.pip.x - w.cfg.pipStart.x) < 1e-9, 'no movement in ready');
  assert.ok(w.gems.every(g => g.appear >= 1), 'gems telegraphed during the intro');
  assert.ok(w.bears.every(b => b.spawnT >= 1), 'bears faded in during the intro');
  run(w, 0.2);
  assert.strictEqual(w.state, 'playing');
  assert.ok(w.drainEvents().some(e => e.type === 'go'));
});

test('world: deterministic for any dt partition', () => {
  function script(dt) {
    const w = new CD.World({ seed: 77 });
    const R = new CD.RNG(9), plan = [];
    for (let k = 0; k < 80; k++) plan.push({ mx: R.range(-1, 1), my: R.range(-1, 1), act: R.chance(0.3), tgt: R.chance(0.3) ? [R.range(60, 900), R.range(100, 500)] : null });
    let k = -1;
    const total = Math.round(40 / dt);
    for (let i = 0; i < total; i++) {
      const seg = Math.floor(w.steps / 60);           // input changes every 0.5 s (60 sub-steps)
      if (seg !== k && w.steps % 60 === 0) {
        k = seg; const p = plan[seg % plan.length];
        if (p.tgt) { w.setMove(0, 0); w.setTarget(p.tgt[0], p.tgt[1]); } else { w.setTarget(null); w.setMove(p.mx, p.my); }
        if (p.act) w.action();
      }
      w.update(dt);
    }
    return { snap: w.snapshot(), pip: [w.pip.x, w.pip.y, w.pip.vx], bears: w.bears.map(b => [b.x, b.y]), gems: w.gems.map(g => [g.id, g.x, g.y]), steps: w.steps };
  }
  const a = script(1 / 60), b = script(1 / 120), c = script(1 / 30), d = script(1 / 40);
  assert.deepStrictEqual(a, b); assert.deepStrictEqual(a, c); assert.deepStrictEqual(a, d);
  // and a random partition with constant input
  const run2 = (rand) => {
    const w = new CD.World({ seed: 4 }); w.setMove(0.6, 0.8);
    const R = new CD.RNG(1); let t = 0;
    while (w.steps < 2400) { const s = Math.min(2400 - w.steps, rand ? R.int(1, 7) : 2); w.update(s * H); t++; }
    return [w.pip.x, w.pip.y, w.bears.map(b => b.x), w.score, w.hearts];
  };
  assert.deepStrictEqual(run2(true), run2(false));
  assert.notDeepStrictEqual(script(1 / 60).bears, new CD.World({ seed: 78 }).bears.map(b => [b.x, b.y]));
});

// ---------- movement ----------
test('movement: max speed falls with size (210 → 165) and acceleration is lazier when big', () => {
  const res = {};
  for (const s of [1, 3, 5]) {
    const w = world(1, NOBEARS); clearGems(w);
    w.pip.x = 100; w.pip.y = 300; w.size = s;
    w.setMove(1, 0);
    let t90 = null, t = 0;
    while (t < 2) { w.update(H); t += H; if (t90 === null && w.pip.vx >= 0.9 * w.pipMaxSpeed(s)) t90 = t; }
    res[s] = { v: w.pip.vx, t90 };
  }
  assert.ok(Math.abs(res[1].v - 210) < 0.5, 'size 1 ' + res[1].v);
  assert.ok(Math.abs(res[3].v - 187.5) < 0.5, 'size 3 ' + res[3].v);
  assert.ok(Math.abs(res[5].v - 165) < 0.5, 'size 5 ' + res[5].v);
  assert.ok(res[1].t90 > 0.08 && res[1].t90 < 0.2, 'momentum, not instant: ' + res[1].t90);
  assert.ok(res[5].t90 > res[1].t90 * 1.1, 'big Pip accelerates slower');
  // stopping drift: a little ice-slide, never slippery
  const w = world(1, NOBEARS); clearGems(w); w.pip.x = 100; w.pip.y = 300;
  w.setMove(1, 0); run(w, 1, H); const x0 = w.pip.x; w.setMove(0, 0); run(w, 1, H);
  const drift = w.pip.x - x0;
  assert.ok(drift > 8 && drift < 30, 'drift ' + drift.toFixed(1));
  assert.ok(speed(w.pip) < 0.01);
});

test('movement: diagonal input is not faster; frames waddle by distance, idle when still', () => {
  const w = world(1, NOBEARS); clearGems(w); w.pip.x = 200; w.pip.y = 200;
  w.setMove(1, 1); run(w, 1, H);
  assert.ok(speed(w.pip) <= 210.01);
  const frames = new Set();
  run(w, 1, H, () => { frames.add(w.pip.frame); });
  assert.ok(frames.has('walk1') && frames.has('walk2'));
  w.setMove(0, 0); run(w, 1);
  assert.strictEqual(w.pip.frame, 'idle');
});

test('movement: pointer-follow arrives and stops within 6 px (no big overshoot)', () => {
  for (const s of [1, 5]) {
    const w = world(2, NOBEARS); clearGems(w); w.size = s; w.pip.x = 120; w.pip.y = 300;
    w.setTarget(700, 420);
    let maxPast = 0;
    run(w, 4, 1 / 60, () => { const along = (w.pip.x - 700) * (580 / hyp(580, 120)) + (w.pip.y - 420) * (120 / hyp(580, 120)); maxPast = Math.max(maxPast, along); });
    const d = hyp(w.pip.x - 700, w.pip.y - 420);
    assert.ok(d <= 6.5, 'size ' + s + ' stopped ' + d.toFixed(2) + ' px away');
    assert.ok(speed(w.pip) < 2, 'at rest');
    assert.ok(maxPast < 4, 'overshoot ' + maxPast.toFixed(2));
    w.setTarget(null);
  }
  // keys override the pointer
  const w = world(2, NOBEARS); clearGems(w); w.setTarget(900, 300); w.setMove(-1, 0); w.pip.x = 400; run(w, 0.5);
  assert.ok(w.pip.vx < 0);
});

test('movement: soft arena clamp keeps Pip inside and does not stick', () => {
  const w = world(3, NOBEARS); clearGems(w);
  const a = w.arena;
  for (const [mx, my] of [[-1, -1], [1, 1], [1, -1], [-1, 1]]) {
    w.setMove(mx, my);
    run(w, 4, 1 / 60, () => {
      const p = w.pip;
      assert.ok(p.x >= a.x && p.x <= a.x + a.w && p.y >= a.y && p.y <= a.y + a.h, 'inside ' + p.x + ',' + p.y);
    });
  }
  w.setMove(0, 1); run(w, 1); w.setMove(0, -1); run(w, 0.5);
  assert.ok(w.pip.vy < -150, 'leaves the wall freely');
});

test('movement: facing has hysteresis', () => {
  const w = world(1, NOBEARS); clearGems(w); w.pip.x = 400; w.pip.y = 300;
  w.setMove(1, 0); run(w, 0.5); assert.strictEqual(w.pip.facing, 1);
  w.setMove(-0.08, 1); run(w, 1);                 // tiny leftward drift (≈ −17 px/s) keeps facing
  assert.ok(w.pip.vx < 0 && w.pip.vx > -25);
  assert.strictEqual(w.pip.facing, 1);
  w.setMove(-1, 0); run(w, 0.3); assert.strictEqual(w.pip.facing, -1);
});

// ---------- gems ----------
test('gems: telegraph, collect, points = 10 × size, grow, maxsize, smoothed scale', () => {
  const w = world(4, NOBEARS);
  const n = w.gems.length;
  assert.ok(n >= 3 && n <= 5);
  const g = w.gems[0];
  // a telegraphing gem can't be collected
  g.appear = 0.5; w.pip.x = g.x; w.pip.y = g.y; w.update(H);
  assert.ok(w.gems.includes(g), 'not collectable while appearing');
  run(w, 0.4, H);
  assert.ok(!w.gems.includes(g), 'collected once appear reached 1');
  let ev = w.drainEvents();
  const ge = ev.find(e => e.type === 'gem');
  assert.ok(ge && ge.points === 10 && ge.size === 1);
  assert.ok(ev.some(e => e.type === 'grow' && e.size === 2));
  assert.strictEqual(w.size, 2); assert.strictEqual(w.jar, 1); assert.strictEqual(w.score, 10);
  assert.ok(Math.abs(w.pip.radius - 16 * 1.15) < 1e-9);
  assert.ok(w.pip.squash !== 0, 'squash on grow');
  // feed to max size
  for (let k = 0; k < 4; k++) { const h = w._spawnGem(); h.appear = 1; w.pip.x = h.x; w.pip.y = h.y; w.update(H); }
  ev = w.drainEvents();
  assert.strictEqual(w.size, 5);
  assert.ok(ev.some(e => e.type === 'maxsize'));
  assert.deepStrictEqual(ev.filter(e => e.type === 'gem').map(e => e.points), [20, 30, 40, 50]);
  assert.strictEqual(w.score, 150);
  run(w, 1);
  assert.ok(Math.abs(w.pip.scale - 1.6) < 0.01, 'visual scale → 1.6: ' + w.pip.scale);
  // replacements spawn with a telegraph, away from Pip
  run(w, 1.5);
  const live = w.gems.filter(q => !q.loose);
  assert.strictEqual(live.length, w.gemsWanted);
  assert.ok(live.every(q => q.y >= w.arena.y && q.x >= w.arena.x && q.x <= w.arena.x + w.arena.w));
});

test('gems: spawn away from Pip, bears, gate and the HUD; expire and respawn', () => {
  for (let s = 1; s <= 30; s++) {
    const w = new CD.World({ seed: s });
    for (const g of w.gems) {
      assert.ok(hyp(g.x - w.pip.x, g.y - w.pip.y) >= 70, 'far from Pip');
      assert.ok(hyp(g.x - 900, g.y - 300) >= 50, 'not on the gate');
      assert.ok(g.y > 84 + 10);
      assert.ok(!(g.x > 790 && g.y < 144), 'not under the jar');
    }
  }
  const w = world(5, NOBEARS);
  const ids = w.gems.map(g => g.id);
  w.pip.x = 60; w.pip.y = 500;
  run(w, w.cfg.gemLife + 3);
  assert.ok(ids.every(id => !w.gems.some(g => g.id === id)), 'old gems expired');
  assert.strictEqual(w.gems.length, w.gemsWanted);
});

// ---------- dash & pop ----------
test('dash: ~2.2× burst for 0.25 s, 1.2 s cooldown, slide frame, then back to normal speed', () => {
  const w = world(6, NOBEARS); clearGems(w); w.pip.x = 100; w.pip.y = 300;
  w.setMove(1, 0); run(w, 0.5, H);
  assert.strictEqual(w.action(), 'dash');
  w.update(H);
  assert.ok(Math.abs(w.pip.vx - 210 * 2.2) < 1, 'dash speed ' + w.pip.vx);
  assert.ok(w.pip.sliding && w.pip.frame === 'slide');
  assert.strictEqual(w.action(), null, 'cooldown');
  run(w, 0.26, H);
  assert.ok(!w.pip.sliding);
  run(w, 0.6, H);
  assert.ok(Math.abs(w.pip.vx - 210) < 1, 'back to max speed');
  assert.strictEqual(w.action(), null, 'still cooling at 0.9 s');
  run(w, 0.35, H);
  assert.strictEqual(w.action(), 'dash');
  assert.strictEqual(w.drainEvents().filter(e => e.type === 'dash').length, 2);
  // with no input it dashes the way Pip faces
  const v = world(6, NOBEARS); clearGems(v); v.pip.x = 500; v.pip.facing = -1; v.action(); v.update(H);
  assert.ok(v.pip.vx < -400);
});

test('pop: only at max size; size → 1, +50 +10 per bear within 160 px, stun 2.5 s, stunned bears harmless', () => {
  const w = world(7, { bearCounts: [3, 3, 3, 3] }); clearGems(w);
  w.pip.x = 400; w.pip.y = 300;
  const [b1, b2, b3] = w.bears;
  b1.x = 480; b1.y = 300; b2.x = 400; b2.y = 440; b3.x = 700; b3.y = 300;   // 80, 140 in; 300 out
  assert.strictEqual(w.action(), 'dash', 'not max size → dash');
  w.pip.dashT = 0; w.pip.sliding = false; w.pip.vx = w.pip.vy = 0; w.pip.x = 400; w.pip.y = 300;
  b1.x = 480; b1.y = 300; b2.x = 400; b2.y = 440;
  w.size = 5; w.drainEvents();
  assert.strictEqual(w.action(), 'pop');
  const ev = w.drainEvents(), pe = ev.find(e => e.type === 'pop');
  assert.ok(pe && pe.stunned === 2 && pe.points === 70);
  assert.strictEqual(w.size, 1); assert.strictEqual(w.score, 70); assert.strictEqual(w.pops, 1);
  assert.ok(b1.stun === 2.5 && b2.stun === 2.5 && b3.stun === 0);
  // a stunned bear touching Pip does nothing
  w.update(H); b1.x = w.pip.x + 5; b1.y = w.pip.y;
  run(w, 0.5, H, () => { b1.x = w.pip.x + 5; b1.y = w.pip.y; b3.x = 880; b3.y = 120; });
  assert.strictEqual(w.hearts, 3);
  assert.strictEqual(b1.frame, 'stun');
  run(w, 2.2, H, () => { b3.x = 880; b3.y = 120; b1.x = 880; b1.y = 500; b2.x = 60; b2.y = 500; });
  assert.ok(b1.stun === 0, 'stun wears off');
});

// ---------- bears ----------
test('bears: wanderer, follower and guard behave distinctly', () => {
  const w = world(8, { bearCounts: [3, 3, 3, 3] });
  const red = w.bears.find(b => b.kind === 'red'), green = w.bears.find(b => b.kind === 'green'), orange = w.bears.find(b => b.kind === 'orange');
  assert.ok(red && green && orange);
  w.pip.x = 120; w.pip.y = 460;  // Pip parked away from every gem
  const gem = w.gems[0]; for (const g of w.gems) { g.life = 1e9; }
  w.gemsWanted = w.gems.length;
  const modes = { red: new Set(), green: new Set(), orange: new Set() };
  let greenMin = 1e9, orangeGemDist = [], redPath = 0, lx = red.x, ly = red.y;
  run(w, 20, 1 / 60, () => {
    w.pip.invuln = 5;                       // keep Pip alive; positions are what we test
    w.pip.x = 120; w.pip.y = 460; w.pip.vx = w.pip.vy = 0;
    for (const b of w.bears) modes[b.kind] && modes[b.kind].add(b.mode);
    greenMin = Math.min(greenMin, hyp(green.x - 120, green.y - 460));
    const og = w.gems.find(g => g.id === orange._gem);
    if (og) orangeGemDist.push(hyp(orange.x - og.x, orange.y - og.y));
    redPath += hyp(red.x - lx, red.y - ly); lx = red.x; ly = red.y;
  });
  assert.ok(modes.green.has('follow') && !modes.green.has('orbit'));
  assert.ok(modes.orange.has('orbit'));
  assert.ok(modes.red.has('wander'));
  assert.ok(greenMin < 50, 'follower reaches a parked Pip: ' + greenMin.toFixed(0));
  const late = orangeGemDist.slice(-600), avg = late.reduce((a, b) => a + b, 0) / late.length;
  assert.ok(avg > 35 && avg < 95, 'guard orbits its gem at ~62 px: ' + avg.toFixed(1));
  assert.ok(redPath > 600, 'wanderer roams');
  void gem;
});

test('bears: guard charges when Pip comes near its gem, then gives up', () => {
  const w = world(9, { bearCounts: [0, 0, 0, 0] }); w.gemsWanted = 1; w.gems.length = 1;
  const g = w.gems[0]; g.x = 500; g.y = 300; g.life = 1e9;
  const b = w._spawnBear('orange', 0); b.spawnT = 1; b.x = 560; b.y = 300;
  w.pip.x = 140; w.pip.y = 300;
  run(w, 2);
  assert.strictEqual(b.mode, 'orbit');
  w.pip.x = 420; w.pip.y = 300; w.pip.invuln = 0;   // (a guard never charges a blinking, invulnerable Pip)
  let charged = false;
  run(w, 0.5, 1 / 60, () => { if (b.mode === 'charge') charged = true; });
  assert.ok(charged);
  w.pip.x = 100; w.pip.y = 480;
  run(w, 3, 1 / 60, () => { w.pip.x = 100; w.pip.y = 480; });
  assert.strictEqual(b.mode, 'orbit', 'returns to guarding');
});

test('bears: never faster than 0.75 × Pip max speed (any size, any terrain), never stack, spawn away from Pip', () => {
  for (const level of [0, 1, 2, 3, 7, 12]) {
    const w = new CD.World({ seed: 10 + level, config: CD.DIFFICULTY.hard });
    w.startLevel(level);
    assert.ok(w.bears.every(b => hyp(b.x - w.pip.x, b.y - w.pip.y) >= 300), 'spawn far from Pip');
    assert.ok(w.bears.every(b => b.spawnT === 0));
    const bot = new CD.Bot(w, { skill: 0.6, seed: level });
    let worst = 0, minPair = 1e9;
    for (let i = 0; i < 60 * 40 && w.state !== 'dead'; i++) {
      bot.step(1 / 60); w.update(1 / 60); w.drainEvents();
      // Pip may have grown in this frame after the bears moved: they are re-capped on the next sub-step
      const cap = w.cfg.bearCapFrac * w.pipMaxSpeed(Math.max(1, w.size - 1));
      for (const b of w.bears) {
        const ter = w.terrainAt(b._px, b._py), v = speed(b);   // terrain at the start of the step
        if (b._kb <= 0) worst = Math.max(worst, v / (cap * 1.0));
        assert.ok(v <= w.pipMaxSpeed(5) + 1e-6, 'always slower than Pip');
        if (ter.slow && b._kb <= 0) assert.ok(v <= cap * w.cfg.slowMul + 1e-6 || b._kb > 0);
      }
      for (let a = 0; a < w.bears.length; a++) for (let c = a + 1; c < w.bears.length; c++)
        minPair = Math.min(minPair, hyp(w.bears[a].x - w.bears[c].x, w.bears[a].y - w.bears[c].y));
    }
    assert.ok(worst <= 1 + 1e-6, 'level ' + level + ' speed ratio ' + worst.toFixed(3));
    if (w.bears.length > 1) assert.ok(minPair > 30, 'bears stacked: ' + minPair.toFixed(1));
  }
  // counts by level and lap
  const w = new CD.World({ seed: 1 });
  assert.deepStrictEqual([0, 1, 2, 3, 4, 7, 40].map(i => w.levelInfo(i).bears), [2, 3, 3, 4, 3, 5, 8]);
});

// ---------- bump ----------
test('bump: −1 heart, −1 size, drops 2 re-collectable gems, knock-back, invuln 1.5 s', () => {
  const w = world(11, { bearCounts: [1, 1, 1, 1] });
  clearGems(w);
  const b = w.bears[0];
  w.size = 3; w.jar = 5; w.pip.x = 400; w.pip.y = 300; w.pip.vx = w.pip.vy = 0;
  b.x = 420; b.y = 300; b.vx = b.vy = 0;
  w.update(H);
  const ev = w.drainEvents();
  const be = ev.find(e => e.type === 'bump');
  assert.ok(be && be.hearts === 2);
  assert.ok(ev.some(e => e.type === 'shrink' && e.size === 2));
  assert.ok(ev.some(e => e.type === 'drop' && e.n === 2));
  assert.strictEqual(w.hearts, 2); assert.strictEqual(w.size, 2); assert.strictEqual(w.jar, 3); assert.strictEqual(w.bumps, 1);
  assert.ok(w.pip.vx < -200, 'knocked back away from the bear');
  assert.ok(Math.abs(w.pip.invuln - 1.5) < 0.02);
  assert.strictEqual(w.pip.frame, 'hurt');
  const loose = w.gems.filter(g => g.loose);
  assert.strictEqual(loose.length, 2);
  assert.ok(loose.every(g => speed(g) > 100), 'scatter with velocity');
  // invulnerable: no second bump
  run(w, 1.0, H, () => { b.x = w.pip.x + 10; b.y = w.pip.y; });
  assert.strictEqual(w.hearts, 2);
  assert.ok(w.gems.filter(g => g.loose).every(g => speed(g) < 20), 'loose gems settle');
  // re-collect one
  b.x = 880; b.y = 500; b.rest = 9;
  const lg = w.gems.find(g => g.loose), jar0 = w.jar;
  assert.ok(lg, 'a loose gem is left');
  w.pip.x = lg.x; w.pip.y = lg.y; w.update(H);
  assert.strictEqual(w.jar, jar0 + 1, 're-collected into the jar');
  // any loose gem left expires after 6 s
  w.gems.push(Object.assign({}, lg, { id: 999, life: w.cfg.looseLife }));
  w.pip.x = 60; w.pip.y = 100;
  run(w, 6, 1 / 60, () => { b.x = 880; b.y = 500; b.rest = 9; });
  assert.strictEqual(w.gems.filter(g => g.loose).length, 0);
  assert.ok(w.drainEvents().some(e => e.type === 'gemgone' && e.loose));
});

test('bump: size never below 1; 0 hearts → dead (+ event), game freezes', () => {
  const w = world(12, { bearCounts: [1, 1, 1, 1] }); clearGems(w);
  const b = w.bears[0];
  for (let k = 0; k < 3; k++) { w.pip.invuln = 0; b.stun = 0; b.x = w.pip.x + 5; b.y = w.pip.y; w.update(H); }
  assert.strictEqual(w.size, 1);
  assert.strictEqual(w.hearts, 0);
  assert.strictEqual(w.state, 'dead');
  const d = w.drainEvents().find(e => e.type === 'dead');
  assert.ok(d && d.score === w.score);
  assert.strictEqual(w.action(), null);
  run(w, 2);
  assert.strictEqual(w.state, 'dead');
});

// ---------- terrain zones ----------
test('zones: river slows everyone ×0.55, but not on the wafer bridges or the gate landing (x ≥ 850)', () => {
  const w = world(13, NOBEARS, 1); clearGems(w);
  assert.strictEqual(w.biome, 1);
  assert.ok(w.zones.length === 3 && w.zones.every(z => z.type === 'slow' && z.shape === 'rect' && z.y === 270 && z.h === 80));
  assert.ok(w.zones.every(z => z.x + z.w <= 850 || z.x >= 850), 'x > 850 is never slow');
  assert.ok(!w.terrainAt(330, 310).slow && !w.terrainAt(670, 310).slow && !w.terrainAt(880, 310).slow);
  assert.ok(w.terrainAt(200, 310).slow && w.terrainAt(500, 310).slow && w.terrainAt(800, 310).slow);
  assert.ok(!w.terrainAt(500, 260).slow);
  const sp = (x) => { const v = world(13, NOBEARS, 1); clearGems(v); v.pip.x = x; v.pip.y = 140; v.setMove(0, 1); run(v, 0.95, H); return { vy: v.pip.vy, y: v.pip.y }; };
  const inBand = sp(500), onBridge = sp(330), landing = sp(880);
  assert.ok(inBand.y > 280 && inBand.y < 345, 'in the band ' + inBand.y);
  assert.ok(Math.abs(inBand.vy - 210 * 0.55) < 2, 'slowed: ' + inBand.vy);
  assert.ok(Math.abs(onBridge.vy - 210) < 1 && Math.abs(landing.vy - 210) < 1, 'bridges are full speed');
  // bears are slowed too
  const v = world(14, { bearCounts: [0, 1, 1, 1] }, 1); clearGems(v);
  const b = v.bears[0]; b.spawnT = 1; b.x = 500; b.y = 310;
  v.pip.x = 500; v.pip.y = 500; v.pip.invuln = 9;
  run(v, 1, 1 / 60, () => { b.y = 310; b.vy = 0; v.pip.x = b.x + 300 > 900 ? 100 : b.x + 300; v.pip.y = 310; });
  assert.ok(speed(b) <= v.bearCap() * 0.55 + 1e-6);
  assert.deepStrictEqual(w.bridges.map(r => r.x), [300, 640, 850]);
});

test('zones: glacier ice keeps momentum (friction ×0.25)', () => {
  const stop = (x, y) => {
    const w = world(15, NOBEARS, 3); clearGems(w);
    w.pip.x = x; w.pip.y = y; w.pip.vx = 200; w.pip.vy = 0;
    const x0 = w.pip.x; let t = 0;
    while (speed(w.pip) > 1 && t < 5) { w.update(H); t += H; }
    return { d: w.pip.x - x0, t, frame: w.pip.frame };
  };
  const w = world(15, NOBEARS, 3);
  assert.deepStrictEqual(w.zones.map(z => [z.type, z.x, z.y, z.w, z.h]), [['ice', 160, 140, 260, 140], ['ice', 560, 320, 280, 150]]);
  const ice = stop(170, 210), snow = stop(470, 450);
  assert.ok(ice.d > snow.d * 3, 'ice slide ' + ice.d.toFixed(0) + ' vs ' + snow.d.toFixed(0));
  // coasting on ice shows the slide frame
  const v = world(15, NOBEARS, 3); clearGems(v); v.pip.x = 170; v.pip.y = 210; v.pip.vx = 200; v.update(H * 4);
  assert.strictEqual(v.pip.frame, 'slide'); assert.ok(v.pip.onIce);
});

test('zones: cloud puffs push out springily (bounce event + hop), meadow has no zones', () => {
  const w = world(16, NOBEARS, 2); clearGems(w);
  assert.deepStrictEqual(w.zones.map(z => [z.type, z.shape, z.x, z.y, z.r]), [['bouncy', 'circle', 300, 200, 70], ['bouncy', 'circle', 640, 380, 80], ['bouncy', 'circle', 760, 170, 60]]);
  // resting inside near the edge: pushed outward
  w.pip.x = 300 + 50; w.pip.y = 200; w.pip.vx = 0; w.pip._puff = 0;
  run(w, 1, H);
  assert.ok(hyp(w.pip.x - 300, w.pip.y - 200) > 66, 'pushed out: ' + w.pip.x.toFixed(1));
  // walking in: kick back + bounce event + hop
  const v = world(16, NOBEARS, 2); clearGems(v);
  v.pip.x = 180; v.pip.y = 200; v.setMove(1, 0);
  let maxZ = 0, ev = [];
  run(v, 0.8, H, () => { maxZ = Math.max(maxZ, v.pip.z); ev = ev.concat(v.drainEvents()); });
  assert.ok(ev.some(e => e.type === 'bounce' && e.who === 'pip'));
  assert.ok(maxZ > 8 && maxZ < 20, 'hop ' + maxZ.toFixed(1));
  // still possible to push through with effort (not a wall)
  v.setMove(1, 0); run(v, 3, H);
  assert.ok(v.pip.x > 380, 'can cross a puff: ' + v.pip.x.toFixed(0));
  const m = world(16, NOBEARS, 0);
  assert.deepStrictEqual(m.zones, []);
  assert.ok(!m.terrainAt(300, 200).ice && m.terrainAt(300, 200).speedMul === 1);
});

// ---------- jar, gate, levels ----------
test('jar → gate → cleared (bonus hearts × 100, heal) → next biome; laps get harder', () => {
  const w = world(17, NOBEARS);
  assert.strictEqual(w.jarTarget, 12);
  w.jar = 11;
  const g = w.gems[0]; g.appear = 1; w.pip.x = g.x; w.pip.y = g.y; w.update(H);
  let ev = w.drainEvents().map(e => e.type);
  assert.ok(ev.includes('jarfull') && ev.includes('gateopen'));
  assert.ok(w.gate.open);
  const n = w.gems.length;
  run(w, 3);
  assert.ok(w.gems.length <= n, 'no new gems once the gate is open');
  assert.strictEqual(w.gate.t, 1);
  w.hearts = 2;
  const s0 = w.score;
  w.pip.x = 880; w.pip.y = 300; w.update(H);
  const ce = w.drainEvents();
  assert.strictEqual(w.state, 'cleared');
  assert.ok(ce.some(e => e.type === 'cleared' && e.bonus === 200 && e.level === 0));
  assert.ok(ce.some(e => e.type === 'heal' && e.hearts === 3));
  assert.strictEqual(w.score, s0 + 200);
  run(w, 1.9);
  assert.strictEqual(w.level, 0);
  run(w, 0.2);
  assert.strictEqual(w.level, 1); assert.strictEqual(w.biome, 1); assert.notStrictEqual(w.state, 'cleared');
  assert.strictEqual(w.size, 1); assert.strictEqual(w.jar, 0); assert.strictEqual(w.jarTarget, 15);
  assert.ok(w.drainEvents().some(e => e.type === 'biome' && e.biome === 1 && e.level === 1));
  // lap 2 (level 4): meadow again, more bears / gems, bigger jar, faster bears, shorter follow lag
  const L = new CD.World({ seed: 1 }), a = L.levelInfo(0), b = L.levelInfo(4);
  assert.strictEqual(b.biome, 0); assert.strictEqual(b.lap, 1);
  assert.ok(b.jarTarget > a.jarTarget && b.bears > a.bears && b.gems > a.gems && b.bearMul > a.bearMul && b.followLag < a.followLag);
  w.startLevel(5); assert.deepStrictEqual([w.biome, w.lap], [1, 1]);
});

test('gate: closed gate does nothing; bears slow when it opens', () => {
  const w = world(18, { bearCounts: [1, 1, 1, 1] }); clearGems(w);
  w.pip.x = 900; w.pip.y = 300; run(w, 0.5, 1 / 60, () => { w.bears[0].x = 100; w.bears[0].y = 500; });
  assert.strictEqual(w.state, 'playing');
  const v = (open) => {
    const u = world(19, { bearCounts: [1, 1, 1, 1] }); clearGems(u); u.gate.open = open; u.gate.t = 1;
    u.pip.x = 120; u.pip.y = 460; u.pip.invuln = 99;
    const b = u.bears[0]; let m = 0;
    run(u, 4, 1 / 60, () => { m = Math.max(m, speed(b)); u.pip.x = 120; u.pip.y = 460; });
    return m;
  };
  assert.ok(v(true) < v(false) * 0.8);
});

test('difficulty presets: easy 5 hearts, smaller jars, slower bears, longer invuln; hard tougher', () => {
  const e = new CD.World({ seed: 1, config: CD.DIFFICULTY.easy }), n = new CD.World({ seed: 1 }), h = new CD.World({ seed: 1, config: CD.DIFFICULTY.hard });
  assert.deepStrictEqual([e.hearts, n.hearts, h.hearts], [5, 3, 3]);
  assert.ok(e.jarTarget < n.jarTarget && n.jarTarget < h.jarTarget);
  assert.ok(e.levelInfo(0).bearMul < n.levelInfo(0).bearMul && n.levelInfo(0).bearMul < h.levelInfo(0).bearMul);
  assert.ok(e.cfg.invulnTime > n.cfg.invulnTime && n.cfg.invulnTime > h.cfg.invulnTime);
  assert.ok(e.bears.length <= n.bears.length && n.bears.length < h.bears.length);
});

// ---------- bot & skill ----------
test('bot: skill 1 clears all 4 biomes on Normal (several seeds), and the endless run ends', () => {
  const out = [];
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const { w, t, bot } = playGame(seed, 'normal', 1, 1800);
    out.push(w.level);
    assert.ok(bot.stats.levels >= 4, 'seed ' + seed + ' cleared ' + bot.stats.levels);
    assert.ok(w.state === 'dead', 'seed ' + seed + ' never died in 30 min (level ' + w.level + ', ' + (t / 60).toFixed(1) + ' min)');
    assert.ok(bot.stats.gems > 0 && bot.stats.pops > 0 && bot.stats.decisions > 0);
  }
  console.log('      skill-1 bot death levels (Normal): ' + out.join(', '));
});

test('first level is very winnable: a weak bot (skill 0.3) clears the meadow on Normal and Easy', () => {
  for (const diff of ['normal', 'easy']) {
    let ok = 0;
    for (let s = 1; s <= 10; s++) { const { w } = playGame(100 + s, diff, 0.3, 240); if (w.level >= 1 || w.levelsCleared >= 1) ok++; }
    assert.ok(ok >= 9, diff + ': ' + ok + '/10');
  }
});

test('skill beats spam: random input scores far less and rarely clears biome 2', () => {
  let rScore = 0, rRiver = 0, bScore = 0;
  const N = 20;
  for (let s = 1; s <= N; s++) {
    const r = playGame(200 + s, 'normal', 'random', 900);
    rScore += r.w.score; if (r.w.levelsCleared >= 2) rRiver++;
  }
  for (let s = 1; s <= 4; s++) bScore += playGame(200 + s, 'normal', 1, 900).w.score;
  rScore /= N; bScore /= 4;
  assert.ok(rScore * 10 < bScore, 'random avg ' + rScore.toFixed(0) + ' vs bot ' + bScore.toFixed(0));
  assert.ok(rRiver <= 1, 'random cleared the river ' + rRiver + '/' + N);
  // even on Easy, random play never gets through the first lap
  let easyLap = 0;
  for (let s = 1; s <= 10; s++) if (playGame(300 + s, 'easy', 'random', 900).w.levelsCleared >= 4) easyLap++;
  assert.strictEqual(easyLap, 0);
  console.log('      random avg score ' + rScore.toFixed(0) + ', bot avg ' + bScore.toFixed(0) + ' (15 min cap)');
});

// ---------- weather ----------
const VALID = CD.Weather.SPRITES;
test('weather: counts 30–80 per biome, valid sprites/layers, ripples on the river (not bridges)', () => {
  for (let b = 0; b < 4; b++) {
    const wx = new CD.Weather({ seed: 3 });
    wx.setSeason(b, { instant: true });
    const full = wx.fullCount(b);
    assert.ok(full >= 30 && full <= 80, 'biome ' + b + ' count ' + full);
    let maxN = 0;
    for (let i = 0; i < 60 * 20; i++) {
      wx.update(1 / 60, {});
      maxN = Math.max(maxN, wx.particles.length);
      if (i % 30 === 0) for (const p of wx.particles) {
        assert.ok(VALID.includes(p.sprite), p.sprite);
        assert.ok(p.layer === 'back' || p.layer === 'front');
        assert.ok(isFinite(p.x) && isFinite(p.y) && p.size > 0 && p.alpha >= 0 && p.alpha <= 1);
        if (p.sprite === 'dot') assert.ok(typeof p.color === 'string');
        if (p.kind === 'ripple') {
          assert.ok(p.y >= 270 && p.y <= 350, 'ripple on band');
          assert.ok(!(p.x > 300 && p.x < 360) && !(p.x > 640 && p.x < 700) && p.x < 850, 'not on bridges ' + p.x);
          assert.strictEqual(p.layer, 'back');
        }
      }
    }
    assert.ok(maxN <= full + 2, 'bounded ' + maxN);
    const kinds = new Set(wx.particles.map(p => p.sprite));
    const need = [['sparkle', 'floss'], ['ripple', 'sparkle'], ['floss', 'dot'], ['sprinkle_pink', 'sprinkle_blue', 'sprinkle_yellow', 'snowflake']][b];
    for (const k of need) assert.ok(kinds.has(k), 'biome ' + b + ' has ' + k);
    assert.ok(typeof wx.ambient.tint === 'string' && wx.ambient.fog >= 0);
  }
  const g = new CD.Weather({ seed: 1 }); g.setSeason(3, { instant: true }); g.update(1);
  assert.ok(g.particles.some(p => p.sprite.startsWith('sprinkle') && p.flipX < 0.5), 'sprinkles tumble');
});

test('weather: smooth biome hand-over, setBiome alias, deterministic for any dt partition', () => {
  const wx = new CD.Weather({ seed: 2 });
  wx.update(1);
  wx.setBiome(3);
  wx.update(0.5);
  const mix = new Set(wx.particles.map(p => p.biome));
  assert.ok(mix.has(0) && mix.has(3), 'both during hand-over');
  wx.update(4);
  assert.ok(wx.particles.every(p => p.biome === 3), 'old biome gone after ~4 s');
  assert.ok(wx.particles.length <= wx.fullCount(3));
  const sim = (dt) => {
    const a = new CD.Weather({ seed: 5 }); let t = 0, step = 0;
    while (step < 900) {
      if (step === 300) a.setSeason(1); if (step === 600) a.setSeason(2);
      const k = Math.min(900 - step, dt); a.update(k / 60); step += k; t++;
      if ((step < 300 && step + k > 300) || (step < 600 && step + k > 600)) throw new Error('partition must hit the switch steps');
    }
    return a.particles;
  };
  assert.deepStrictEqual(sim(1), sim(3));
  assert.deepStrictEqual(sim(1), sim(5));
});

// ---------- performance ----------
test('performance: 10 minutes of game time (world + bot + weather) runs fast and stays bounded', () => {
  const t0 = process.hrtime.bigint();
  const w = new CD.World({ seed: 31 });
  const bot = new CD.Bot(w, { skill: 0.8, seed: 31 });
  const wx = new CD.Weather({ seed: 31 });
  let maxP = 0, maxG = 0, maxB = 0, games = 1;
  for (let i = 0; i < 60 * 600; i++) {
    bot.step(1 / 60); w.update(1 / 60);
    for (const e of w.drainEvents()) if (e.type === 'biome') wx.setSeason(e.biome);
    wx.update(1 / 60, {});
    maxP = Math.max(maxP, wx.particles.length); maxG = Math.max(maxG, w.gems.length); maxB = Math.max(maxB, w.bears.length);
    for (const v of [w.pip.x, w.pip.y, w.score]) assert.ok(isFinite(v));
    if (w.state === 'dead') { w.reset(); games++; }
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(maxP <= 130 && maxG <= 12 && maxB <= 8, 'bounded p' + maxP + ' g' + maxG + ' b' + maxB);
  assert.ok(ms < 8000, 'took ' + ms.toFixed(0) + ' ms');
  console.log('      10 min sim in ' + ms.toFixed(0) + ' ms; games ' + games + ', level ' + w.level + ', max particles ' + maxP + ', gems ' + maxG);
});

// ---------- runner ----------
let pass = 0, fail = 0;
for (const t of tests) {
  try { t.fn(); pass++; console.log('  ok   ' + t.name); }
  catch (e) { fail++; console.log('  FAIL ' + t.name + '\n       ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n       ') : e)); }
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
