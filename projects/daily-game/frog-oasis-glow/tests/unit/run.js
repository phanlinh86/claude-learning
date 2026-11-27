#!/usr/bin/env node
// Pip's Oasis Glow — headless unit tests for rng / world / weather / bot (node, no deps).
// Run from projects/daily-game/frog-oasis-glow:   node tests/unit/run.js        (add --stats for the bot sweep)
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ---------- load the classic browser scripts into a vm with a fake window ----------
const JS = path.join(__dirname, '..', '..', 'game', 'js');
function load() {
  const sandbox = { console };
  sandbox.window = sandbox;            // window === global, like a browser
  vm.createContext(sandbox);
  for (const f of ['rng.js', 'world.js', 'weather.js', 'bot.js']) {
    vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), sandbox, { filename: f });
  }
  return sandbox.POG;
}
const POG = load();
const W = POG.World, C = W.CONFIG, H = C.STEP, HOME = C.HOME;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const near = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, (m || '') + ' got ' + a + ' want ' + b + ' ±' + tol);

// ---------- helpers ----------
function mk(diff, seed, extra) { return new W(Object.assign({ seed: seed || 1, difficulty: diff || 'normal' }, extra || {})); }
/** a world with spawning switched off (tests place friends with debugSpawn) */
function quiet(diff, seed) {
  const w = mk(diff, seed);
  w._quiet = true; hold(w); w.drainEvents();
  return w;
}
function hold(w) { w.spawnT = 1e9; w.noFireflyT = -1e9; }
function tick(w) { if (w._quiet) hold(w); w.update(H); }
function steps(w, n, each) { const ev = []; for (let i = 0; i < n; i++) { tick(w); const e = w.drainEvents(); ev.push(...e); if (each) each(w, e); } return ev; }
function secs(w, s, each) { return steps(w, Math.round(s / H), each); }
function runUntil(w, pred, max) {
  const ev = []; let t = 0; max = max || 10;
  while (t < max) { tick(w); t += H; const e = w.drainEvents(); ev.push(...e); if (pred(e, w)) break; }
  return { ev, t };
}
const of = (ev, t) => ev.filter(e => e.type === t);
/** pop a friend and let it rise fully */
function popUp(w, i, type) { const c = w.debugSpawn(i, type || 'firefly'); secs(w, 0.3); return c; }
/** wait until Pip sits at home again */
function settle(w) { runUntil(w, (e, w) => w.pip.state === 'home' && !w._fl, 3); }
function playBot(diff, seed, skill, maxS, opts) {
  opts = opts || {};
  const w = mk(diff, seed);
  if (opts.immortal) w.leaves = w.maxLeaves = 1e6;
  const bot = new POG.Bot(w, { skill, seed: seed * 7 + 1 });
  const dt = 1 / 60; let t = 0; const ev = [];
  while (w.phase !== 'over' && t < maxS) {
    bot.step(dt); w.update(dt); t += dt;
    const e = w.drainEvents(); if (opts.keep) for (const x of e) ev.push(x);
  }
  return { w, t, bot, ev };
}

// ---------- RNG ----------
test('rng: same seed → same sequence, ranges hold', () => {
  const a = new POG.RNG(42), b = new POG.RNG(42), c = new POG.RNG(43);
  const sa = [], sb = [], sc = [];
  for (let i = 0; i < 50; i++) { sa.push(a.next()); sb.push(b.next()); sc.push(c.next()); }
  assert.deepStrictEqual(sa, sb); assert.notDeepStrictEqual(sa, sc);
  const r = new POG.RNG('x');
  for (let i = 0; i < 2000; i++) {
    const v = r.next(); assert.ok(v >= 0 && v < 1);
    const k = r.int(2, 5); assert.ok(k >= 2 && k <= 5 && k === Math.floor(k));
    const f = r.range(-3, 3); assert.ok(f >= -3 && f < 3);
  }
  assert.ok([1, 2, 3].includes(r.pick([1, 2, 3])));
});

// ---------- determinism / snapshot ----------
test('determinism: same seed + same taps → identical event log (bot and scripted taps); another seed differs', () => {
  const log = seed => JSON.stringify(playBot('normal', seed, 0.6, 60, { keep: true }).ev);
  assert.strictEqual(log(5), log(5));
  assert.notStrictEqual(log(5), log(6));
  // scripted: tap the centre of every hole in turn every 0.37 s, uneven frame times
  const scripted = seed => {
    const w = mk('easy', seed), ev = []; let t = 0, next = 0.37, k = 0;
    const dts = [1 / 60, 1 / 30, 1 / 144, 0.021];
    while (t < 40) {
      const dt = dts[k % 4]; w.update(dt); t += dt;
      if (t >= next) { const h = w.holes[k % w.holes.length]; ev.push(w.tapAt(h.x, h.y - 45 * h.s)); next += 0.37; }
      k++; ev.push(...w.drainEvents());
    }
    return JSON.stringify(ev) + JSON.stringify(w.getState());
  };
  assert.strictEqual(scripted(9), scripted(9));
});

test('contract: statics, initial state and a JSON-able getState()', () => {
  assert.deepStrictEqual(Array.from(W.BIOMES), ['spring', 'palms', 'dunes', 'night']);
  assert.deepStrictEqual(Array.from(W.BIOME_NAMES), ['The Morning Spring', 'The Palm Grove', 'The Sunset Dunes', 'The Starlit Oasis']);
  assert.deepStrictEqual(Array.from(W.KINDS), ['fennec', 'jerboa', 'tortoise']);
  assert.deepStrictEqual(Array.from(W.LAYOUTS.map(l => l.length)), [6, 8, 9, 9]);
  assert.deepStrictEqual(Object.assign({}, W.LAYOUTS[1][4]), { x: 165, y: 460, s: 1 });
  assert.ok(C.STEP <= 1 / 120 + 1e-12);
  assert.strictEqual(JSON.stringify(HOME), JSON.stringify({ x: 480, y: 132 }));
  const w = mk('easy', 3); secs(w, 3);
  const s = w.getState();
  assert.strictEqual(JSON.stringify(JSON.parse(JSON.stringify(s))), JSON.stringify(s));
  for (const k of ['phase', 'time', 'score', 'leaves', 'maxLeaves', 'level', 'zone', 'loop', 'levelBoops', 'levelGoal', 'combo',
    'mult', 'boops', 'golds', 'holes', 'pip', 'stats']) assert.ok(k in s, 'missing ' + k);
  for (const k of ['colour', 'colours', 'colourWarn', 'graceT', 'zippy']) assert.ok(!(k in s), 'left over ' + k);
  for (const k of ['x', 'y', 'px', 'py', 'vx', 'vy', 'tilt', 'face', 'state', 't', 'target', 'squash']) assert.ok(k in s.pip, 'pip.' + k);
  for (const k of ['boops', 'golds', 'wrong', 'missed', 'bestCombo', 'leavesGained']) assert.ok(k in s.stats, 'stats.' + k);
  const c = s.holes.find(h => h.critter).critter;
  for (const k of ['kind', 'type', 'state', 'h', 'hPrev', 't', 'upFor', 'id']) assert.ok(k in c, 'critter.' + k);
  assert.ok(['firefly', 'gold', 'sleepy'].includes(c.type) && W.KINDS.includes(c.kind));
  assert.strictEqual(s.phase, 'play'); assert.strictEqual(s.leaves, 4); assert.strictEqual(s.maxLeaves, 5);
  assert.strictEqual(s.levelGoal, 15);
  assert.strictEqual(s.pip.state, 'home'); assert.strictEqual(s.pip.x, 480); assert.strictEqual(s.pip.y, 132);
  // debugSpawn types
  const q = quiet('easy');
  assert.strictEqual(q.debugSpawn(0, 'gold').type, 'gold'); assert.strictEqual(q.debugSpawn(1, 'sleepy').type, 'sleepy');
  assert.strictEqual(q.debugSpawn(2).type, 'firefly'); assert.strictEqual(q.debugSpawn(99), null);
  const pops = of(q.drainEvents(), 'pop');
  assert.deepStrictEqual(Array.from(pops, e => e.critterType), ['gold', 'sleepy', 'firefly']);
  assert.ok(pops.every(e => e.type === 'pop' && typeof e.hole === 'number' && W.KINDS.includes(e.kind)));
});

// ---------- pop motion ----------
test('pop: rise spring overshoots ≈1.08 (bounded), settles at 1, hPrev trails h', () => {
  const w = quiet('easy');
  const c = w.debugSpawn(2);
  let peak = 0, peakT = 0, t = 0, upAt = -1;
  for (let i = 0; i < Math.round(0.4 / H); i++) {
    const before = c.h; tick(w); t += H;
    assert.strictEqual(c.hPrev, before);
    if (c.h > peak) { peak = c.h; peakT = t; }
    if (upAt < 0 && c.state === 'up') upAt = t;
  }
  assert.ok(peak > 1.04 && peak < 1.12, 'peak ' + peak);
  assert.ok(peakT > 0.06 && peakT < 0.16, 'peak at ' + peakT);
  near(upAt, C.RISE_T, 2 * H, 'rise→up');
  near(c.h, 1, 0.01, 'settled');
});

test('pop: up holds for upFor then sinks in 0.2 s; booped bounces when Pip lands, sinks BOOP_AFTER later; wow holds 0.4 s', () => {
  const w = quiet('easy');
  const c = w.debugSpawn(0, 'sleepy');
  const r = runUntil(w, () => c.state === 'sink', 10);
  near(r.t, C.RISE_T + c.upFor, 3 * H, 'sink start');
  const r2 = runUntil(w, (e, w) => w.holes[0].critter === null, 2);
  near(r2.t, C.SINK_T, 2 * H, 'sink time');
  // booped
  const b = popUp(w, 4);
  assert.strictEqual(w.tapHole(4), 'match');
  const T = w._fl.T;
  let maxH = 0, landT = -1, t = 0;
  runUntil(w, (e) => { t += 0; maxH = Math.max(maxH, b.h); if (landT < 0 && of(e, 'pipLand').length) landT = b.t; return b.state === 'sink'; }, 3);
  near(landT, T, 2 * H, 'lands at T');
  assert.ok(maxH > 1.03 && maxH < 1.12, 'happy bounce ' + maxH);
  // wow
  settle(w);
  const o = popUp(w, 2, 'sleepy');
  assert.strictEqual(w.tapHole(2), 'wrong'); assert.strictEqual(o.state, 'wow');
  const rw = runUntil(w, () => o.state === 'sink', 2);
  near(rw.t, C.WOW_HOLD, 2 * H, 'wow hold');
});

// ---------- Pip: ballistic motion ----------
test('pip: a hop is an exact gravity parabola (g = CONFIG.G) that lands on the head point at T = clamp(0.30 + 0.00035·dist)', () => {
  for (let L = 0; L < 4; L++) {
    for (let hi = 0; hi < W.LAYOUTS[L].length; hi++) {
      const w = quiet('easy'); w.gotoLevel(L); hold(w); w.drainEvents();
      popUp(w, hi);
      const h = w.holes[hi], tx = h.x, ty = h.y - 112 * h.s;
      const dist = Math.hypot(tx - HOME.x, ty - HOME.y), Tf = Math.min(0.48, Math.max(0.30, 0.30 + 0.00035 * dist));
      // T = the DESIGN formula, stretched just enough for a ≥ HOP_LIFT px rise (capped at HOP_LIFT_MAX)
      const vl = Math.sqrt(2 * C.G * Math.min(C.HOP_LIFT, HOME.y - C.SKY_Y)), Tl = (vl + Math.sqrt(vl * vl + 2 * C.G * (ty - HOME.y))) / C.G;
      const Tw = Math.max(Tf, Math.min(C.HOP_LIFT_MAX, Tl));
      assert.ok(Tw <= C.HOP_LIFT_MAX + 1e-9 && Tw >= 0.30);
      assert.strictEqual(w.tapHole(hi), 'match');
      const ev0 = w.drainEvents(), L0 = of(ev0, 'pipLaunch')[0];
      assert.ok(L0 && L0.x === HOME.x && L0.y === HOME.y && L0.tx === tx && L0.ty === ty, 'pipLaunch from the pad');
      const f = w._fl; near(f.T, Tw, 1e-9, 'flight time');
      near(f.vx0, (tx - HOME.x) / Tw, 1e-6, 'vx'); near(f.vy0, (ty - HOME.y - 0.5 * C.G * Tw * Tw) / Tw, 1e-6, 'vy');
      const pts = []; let t = 0, land = null, maxTilt = 0;
      while (t < 1 && !land) {
        tick(w); t += H; const e = w.drainEvents(); land = of(e, 'pipLand')[0];
        if (!land) { pts.push([t, w.pip.x, w.pip.y]); maxTilt = Math.max(maxTilt, Math.abs(w.pip.tilt)); }
        if (!land) assert.strictEqual(w.pip.state, 'hop');
      }
      assert.ok(land, 'landed'); near(t, Tw, 1.5 * H, 'lands at T');
      near(land.x, tx, 1e-9); near(land.y, ty, 1e-9);
      near(w.pip.x, tx, 1e-9); near(w.pip.y, ty, 1e-6);
      assert.strictEqual(w.pip.state, 'boop'); near(w.pip.squash, 1, 0.12, 'landing squash');
      // every sample on the parabola, constant vertical acceleration g, constant vx
      for (const [ti, x, y] of pts) {
        near(x, HOME.x + f.vx0 * ti, 1e-6, 'x(t)');
        near(y, HOME.y + f.vy0 * ti + 0.5 * C.G * ti * ti, 1e-6, 'y(t)');
      }
      for (let k = 2; k < pts.length; k++) near((pts[k][2] - 2 * pts[k - 1][2] + pts[k - 2][2]) / (H * H), C.G, 1e-3, 'ÿ = g');
      assert.ok(maxTilt <= C.TILT_MAX + 1e-12, 'tilt clamp');
      if (Math.abs(tx - HOME.x) > 1) assert.strictEqual(w.pip.face, Math.sign(tx - HOME.x), 'face = sign Δx');
      const minY = Math.min(...pts.map(p => p[2]));
      assert.ok(f.vy0 < 0 && minY < HOME.y - 8, 'a real leap: rises off the pad (' + (HOME.y - minY).toFixed(0) + ' px)');
    }
  }
});

test('pip: boop 0.18 s on the head, then a higher, slower return hop home (apex above both ends), pipHome + squash', () => {
  for (const hi of [0, 2, 4]) {
    const w = quiet('easy'); popUp(w, hi);
    w.tapHole(hi); const hopT = w._fl.T;
    runUntil(w, e => of(e, 'pipLand').length > 0, 1);
    const head = { x: w.pip.x, y: w.pip.y };
    const rb = runUntil(w, (e, w) => w.pip.state === 'return', 1);
    near(rb.t, C.BOOP_T, 2 * H, 'boop time');
    const ev = rb.ev, L1 = of(ev, 'pipLaunch').pop();
    assert.ok(L1 && L1.kind === 'return' && L1.tx === HOME.x && L1.ty === HOME.y);
    const f = w._fl, start = { x: f.x0, y: f.y0 };
    near(start.y, head.y, 12, 'starts from the (bouncing) head');
    assert.ok(f.T >= C.RET_MIN - 1e-9 && f.T <= C.RET_MAX + 1e-9 && f.T > hopT, 'return T ' + f.T + ' vs hop ' + hopT);
    let minY = 1e9, t = 0, home = null; const pts = [];
    while (t < 1.5 && !home) { tick(w); t += H; const e = w.drainEvents(); home = of(e, 'pipHome')[0]; if (!home) { minY = Math.min(minY, w.pip.y); pts.push([t, w.pip.y]); } }
    assert.ok(home, 'pipHome'); near(t, f.T, 1.5 * H);
    near(home.x, HOME.x, 1e-9); near(home.y, HOME.y, 1e-9);
    assert.ok(minY < HOME.y - 25 && minY < start.y - 90, 'apex well above both ends: ' + minY);
    assert.ok(minY >= C.SKY_Y - 2, 'stays on the stage: ' + minY);
    for (const [ti, y] of pts) near(y, f.y0 + f.vy0 * ti + 0.5 * C.G * ti * ti, 1e-6, 'return parabola');
    assert.strictEqual(w.pip.state, 'home'); near(w.pip.squash, 1, 0.12);
    secs(w, 0.5); assert.ok(w.pip.squash < 0.01, 'squash decays'); assert.strictEqual(w.pip.x, HOME.x); assert.strictEqual(w.pip.y, HOME.y);
    assert.ok(Math.abs(w.pip.tilt) < 0.05, 'level at rest');
  }
  // the return T is longer for a deeper start
  assert.ok(W.returnT(348, 132) > W.returnT(197, 132));
});

test('pip: a tap mid-hop re-aims from the current point (never blocked); px/py trail x/y; tilt eased and bounded', () => {
  const w = quiet('easy');
  popUp(w, 0); popUp(w, 5);
  assert.strictEqual(w.tapHole(0), 'match');
  secs(w, 0.12);
  const at = { x: w.pip.x, y: w.pip.y };
  assert.strictEqual(w.pip.state, 'hop');
  assert.strictEqual(w.tapHole(5), 'match');
  const f = w._fl;
  assert.strictEqual(f.x0, at.x); assert.strictEqual(f.y0, at.y);
  assert.strictEqual(w.pip.target.hole, 5);
  const px = w.pip.x; tick(w); assert.strictEqual(w.pip.px, px);
  near(Math.hypot(w.pip.x - at.x, w.pip.y - at.y), 0, 20, 'no teleport');
  let maxTilt = 0;
  const r = runUntil(w, (e, w) => { maxTilt = Math.max(maxTilt, Math.abs(w.pip.tilt)); return of(e, 'pipLand').length > 0; }, 1);
  const h5 = w.holes[5]; near(w.pip.x, h5.x, 1e-6); near(w.pip.y, h5.y - 112 * h5.s, 1e-6);
  assert.ok(r.t <= C.HOP_LIFT_MAX + 2 * H);
  assert.ok(maxTilt > 0.05 && maxTilt <= C.TILT_MAX + 1e-12, 'tilt ' + maxTilt);
  // a tap while he is on a head or flying home is taken too
  popUp(w, 1); assert.strictEqual(w.tapHole(1), 'match'); assert.strictEqual(w.pip.state, 'hop');
  runUntil(w, (e, w) => w.pip.state === 'return', 2); secs(w, 0.1);
  popUp(w, 3); assert.strictEqual(w.tapHole(3), 'match'); assert.strictEqual(w.pip.target.hole, 3);
});

test('pip: in long bot games his feet stay between SKY_Y and the front heads, never NaN', () => {
  for (const [diff, skill] of [['easy', 0.3], ['hard', 1]]) {
    const w = mk(diff, 5); w.leaves = w.maxLeaves = 1e6;
    const bot = new POG.Bot(w, { skill, seed: 3 }); let lo = 1e9, hi = -1e9;
    for (let i = 0; i < 60 * 120; i++) { bot.step(1 / 60); w.update(1 / 60); w.drainEvents(); lo = Math.min(lo, w.pip.y); hi = Math.max(hi, w.pip.y); assert.ok(isFinite(w.pip.x + w.pip.y + w.pip.tilt)); }
    assert.ok(lo >= C.SKY_Y - 2 && hi <= 480 - 112 + 1, diff + ' y ' + lo + '..' + hi);
  }
});

// ---------- scoring ----------
test('scoring: 10 × mult, ×2 from combo 5, ×3 from combo 10; gold 5 × 10 × mult and counts 1; combo events; +1 heart every 12', () => {
  const w = quiet('normal');
  const pts = [], combos = [], gained = [], golds = [];
  for (let k = 0; k < 13; k++) {
    const i = k % 6, type = k === 2 || k === 11 ? 'gold' : 'firefly';
    popUp(w, i, type);
    assert.strictEqual(w.tapHole(i), 'match');
    const ev = w.drainEvents(), b = of(ev, 'boop')[0];
    pts.push(b.points); golds.push(b.gold); combos.push(...of(ev, 'combo').map(e => e.n)); gained.push(...of(ev, 'leafGained'));
    near(b.x, w.holes[i].x, 1e-9); near(b.y, w.holes[i].y - 31 * w.holes[i].s, 1e-9, 'firefly point');
    secs(w, 0.8);
  }
  assert.deepStrictEqual(pts, [10, 10, 50, 10, 20, 20, 20, 20, 20, 30, 30, 150, 30]);
  assert.deepStrictEqual(golds, [false, false, true, false, false, false, false, false, false, false, false, true, false]);
  assert.deepStrictEqual(combos, [5, 10]);
  assert.strictEqual(gained.length, 1); assert.strictEqual(gained[0].leaves, 5); assert.strictEqual(w.leaves, 5);
  assert.strictEqual(w.score, pts.reduce((a, b) => a + b, 0));
  assert.strictEqual(w.boops, 13); assert.strictEqual(w.levelBoops, 13); assert.strictEqual(w.golds, 2); assert.strictEqual(w.stats.golds, 2);
  assert.strictEqual(w.stats.bestCombo, 13); assert.strictEqual(w.mult, 3);
  // never above 5 hearts
  for (let k = 0; k < 12; k++) { w.levelBoops = 0; popUp(w, k % 6); w.tapHole(k % 6); secs(w, 0.8); }
  assert.strictEqual(w.leaves, 5);
});

test('sleepy = wrong: −1 heart, combo resets, friend says wow, Pip dizzy ≈0.6 s; busy only for the first 0.35 s', () => {
  const w = quiet('normal');
  for (let k = 0; k < 3; k++) { popUp(w, k); w.tapHole(k); secs(w, 0.8); }
  settle(w);
  assert.strictEqual(w.combo, 3);
  popUp(w, 3, 'sleepy'); popUp(w, 4); w.drainEvents();
  assert.strictEqual(w.tapHole(3), 'wrong');
  const ev = w.drainEvents();
  const wr = of(ev, 'wrong')[0];
  assert.ok(wr && wr.hole === 3); near(wr.y, w.holes[3].y - 31 * w.holes[3].s, 1e-9);
  assert.strictEqual(of(ev, 'leafLost')[0].leaves, 3); assert.strictEqual(of(ev, 'boop').length, 0);
  assert.strictEqual(w.leaves, 3); assert.strictEqual(w.combo, 0); assert.strictEqual(w.mult, 1);
  assert.strictEqual(w.pip.state, 'dizzy'); assert.strictEqual(w.stats.wrong, 1);
  secs(w, 0.2); assert.strictEqual(w.tapHole(4), 'busy');
  secs(w, 0.17); assert.strictEqual(w.tapHole(4), 'match');
  assert.strictEqual(w.pip.state, 'hop');
  // dizzy on the pad → home on its own after DIZZY_T, with a wobble
  const w2 = quiet('normal'); popUp(w2, 0, 'sleepy');
  w2.tapHole(0); let maxTilt = 0;
  const r = runUntil(w2, (e, w) => { maxTilt = Math.max(maxTilt, Math.abs(w.pip.tilt)); return w.pip.state !== 'dizzy'; }, 2);
  near(r.t, C.DIZZY_T, 2 * H); assert.ok(maxTilt > 0.1 && maxTilt <= C.TILT_MAX + 1e-12, 'wobble ' + maxTilt);
  assert.strictEqual(w2.pip.state, 'home'); assert.strictEqual(w2.pip.x, HOME.x);
  // dizzy while standing on a head → hops home dazed
  const w3 = quiet('normal'); popUp(w3, 4); popUp(w3, 0, 'sleepy');
  w3.tapHole(4); runUntil(w3, e => of(e, 'pipLand').length > 0, 1); secs(w3, 0.36);
  assert.strictEqual(w3.tapHole(0), 'wrong');
  const r3 = runUntil(w3, e => of(e, 'pipHome').length > 0, 2);
  assert.ok(r3.t < 0.8); settle(w3); assert.strictEqual(w3.pip.state, 'home');
});

test('taps: empty hole / sinking friend → empty (no penalty); outside every zone → none', () => {
  const w = quiet('normal');
  assert.strictEqual(w.tapHole(0), 'empty'); assert.strictEqual(of(w.drainEvents(), 'empty').length, 1);
  const c = popUp(w, 1, 'sleepy'); c.state = 'sink'; c.t = 0; c.h0 = 1;
  assert.strictEqual(w.tapHole(1), 'empty');
  assert.strictEqual(w.tapAt(10, 10), 'none'); assert.strictEqual(w.tapHole(42), 'none');
  assert.strictEqual(w.leaves, 4); assert.strictEqual(w.stats.wrong, 0);
  // too low in the rise (h < 0.25) does not count yet
  secs(w, 1.2);
  w.debugSpawn(2); tick(w);
  assert.ok(w.holes[2].critter.h < C.HIT_MIN_H); assert.strictEqual(w.tapHole(2), 'empty');
});

test('miss rule: a firefly holder (gold too) ducking un-booped costs a heart on Normal/Hard, not on Easy; sleepers never miss', () => {
  for (const [diff, cost] of [['easy', 0], ['normal', 1], ['hard', 1]]) {
    for (const type of ['firefly', 'gold']) {
      const w = quiet(diff); w.combo = 4;
      w.debugSpawn(0, type);
      const ev = runUntil(w, e => e.some(x => x.type === 'miss'), 6).ev;
      const m = of(ev, 'miss');
      assert.strictEqual(m.length, 1, diff); assert.strictEqual(m[0].hole, 0);
      assert.strictEqual(of(ev, 'leafLost').length, cost, diff); assert.strictEqual(w.leaves, 4 - cost, diff);
      assert.strictEqual(w.combo, cost ? 0 : 4, diff); assert.strictEqual(w.stats.missed, 1);
      w.debugSpawn(1, 'sleepy');
      assert.strictEqual(of(secs(w, 5), 'miss').length, 0);
    }
  }
});

test('mash guard: 3 empty taps within 1 s → Pip naps 1.5 s (busy, nap event), no heart lost; slow taps never nap', () => {
  const w = quiet('easy');
  const l0 = w.leaves; let ev = [];
  for (let k = 0; k < 3; k++) { assert.strictEqual(w.tapHole(k), 'empty'); ev.push(...w.drainEvents()); ev.push(...secs(w, 0.1)); }
  assert.strictEqual(of(ev, 'nap').length, 1);
  assert.ok(w.napT > 1.2, 'nap ' + w.napT); assert.strictEqual(w.leaves, l0); assert.strictEqual(w.pip.state, 'dizzy');
  popUp(w, 4); assert.strictEqual(w.tapHole(4), 'busy');
  secs(w, 1.5); popUp(w, 5); assert.strictEqual(w.tapHole(5), 'match');
  const w2 = quiet('easy');
  for (let k = 0; k < 6; k++) { w2.tapHole(k % 6); secs(w2, 0.6); }
  assert.strictEqual(w2.napT, 0);
});

// ---------- spawning / fairness ----------
test('spawning: never into an occupied burrow, avoids the one just vacated, respects max up, sleepers are a real choice', () => {
  for (const diff of ['easy', 'normal', 'hard']) {
    for (let L = 0; L < 4; L++) {
      const w = mk(diff, 11 + L); w.gotoLevel(L); w.leaves = 1e6; w.drainEvents();
      let pre = w.holes.map(h => h.critter && h.critter.id), lastVac = -1, pops = 0, fly = 0, freeOther = 0;
      const max = C.DIFFICULTY[diff].maxUp[L];
      for (let i = 0; i < Math.round(120 / H); i++) {
        w.update(H);
        for (const e of w.drainEvents()) {
          if (e.type !== 'pop') continue;
          pops++; if (e.critterType !== 'sleepy') fly++;
          assert.ok(!pre[e.hole], 'spawned into an occupied burrow');
          if (e.hole === lastVac && pre.filter((x, k) => !x && k !== lastVac).length) freeOther++;
        }
        let live = 0;
        w.holes.forEach((h, k) => { if (pre[k] && !h.critter) lastVac = k; if (h.critter && h.critter.state !== 'sink') live++; });
        assert.ok(live <= max + 1, 'max up ' + live + '>' + (max + 1));
        pre = w.holes.map(h => h.critter && h.critter.id);
      }
      assert.strictEqual(freeOther, 0, 'spawned into the just-vacated burrow while others were free');
      const frac = fly / pops;
      assert.ok(pops > 40 && frac > 0.45 && frac < 0.85, diff + ' L' + L + ' firefly share ' + frac.toFixed(2) + ' of ' + pops);
    }
  }
});

test('fairness: a firefly holder is visible again within ≈2 s (no taps, every difficulty and chapter)', () => {
  for (const diff of ['easy', 'normal', 'hard']) {
    for (let L = 0; L < 4; L++) {
      const w = mk(diff, 21 + L); w.gotoLevel(L); w.leaves = 1e6; w.drainEvents();
      let since = 0, worst = 0;
      for (let i = 0; i < Math.round(120 / H); i++) {
        w.update(H); w.drainEvents();
        const vis = w.holes.some(h => h.critter && (h.critter.state === 'rise' || h.critter.state === 'up') && h.critter.type !== 'sleepy');
        since = vis ? 0 : since + H;
        if (w.time > C.START_DELAY + 0.5) worst = Math.max(worst, since);
      }
      assert.ok(worst <= C.FAIR_T + C.FAIR_HURRY + 0.05, diff + ' L' + L + ' worst gap ' + worst.toFixed(2));
    }
  }
});

test('first pop of every chapter holds a (plain) firefly; gold never before the 4th pop; gold ≈ GOLD_P of later firefly pops', () => {
  let firsts = 0, early = 0, later = 0, laterGold = 0;
  for (const diff of ['easy', 'normal', 'hard']) {
    for (let seed = 1; seed <= 40; seed++) {
      const w = mk(diff, seed); w.leaves = 1e6;
      const bot = new POG.Bot(w, { skill: 1, seed });
      let idx = 0;
      for (let i = 0; i < 60 * 70; i++) {
        bot.step(1 / 60); w.update(1 / 60);
        for (const e of w.drainEvents()) {
          if (e.type === 'levelUp') idx = 0;
          if (e.type !== 'pop') continue;
          if (idx === 0) { firsts++; assert.strictEqual(e.critterType, 'firefly', diff + ' seed ' + seed + ' first pop'); }
          if (idx < C.GOLD_AFTER && e.critterType === 'gold') early++;
          if (idx >= C.GOLD_AFTER && e.critterType !== 'sleepy') { later++; if (e.critterType === 'gold') laterGold++; }
          idx++;
        }
      }
    }
  }
  assert.ok(firsts > 300, 'chapters seen ' + firsts);
  assert.strictEqual(early, 0, 'gold in the first 3 pops');
  const p = laterGold / later;
  assert.ok(p > 0.045 && p < 0.095, 'gold share ' + p.toFixed(3) + ' of ' + later);
  // a gold stays up × 0.75
  const w = quiet('easy'), a = w.debugSpawn(0, 'firefly'), g = w.debugSpawn(1, 'gold');
  near(g.upFor / a.upFor, 0.75, 0.75 * 0.25, 'gold up ratio');
  const base = C.DIFFICULTY.easy.up;
  assert.ok(g.upFor >= 0.75 * base * 0.88 - 1e-9 && g.upFor <= 0.75 * base * 1.12 + 1e-9);
});

test('chapter 1 on Easy is gentle: ≈2.8 s up time, ≤ 2 up, 75 % fireflies, first pop a firefly, misses free', () => {
  const w = mk('easy', 9); w.drainEvents();
  const ev = secs(w, 2.0);
  const first = of(ev, 'pop')[0];
  assert.ok(first && first.critterType === 'firefly', 'first pop holds a firefly');
  const up = w.holes.find(h => h.critter).critter.upFor;
  assert.ok(up > 2.4 && up < 3.2, 'upFor ' + up);
  assert.strictEqual(C.DIFFICULTY.easy.maxUp[0], 2); near(C.DIFFICULTY.easy.fireflyP, 0.75, 0.001);
  assert.strictEqual(C.DIFFICULTY.easy.missCosts, false);
});

// ---------- level flow ----------
test('level: 15 fireflies → levelClear (+50), field clears for 1.2 s with no pops, levelUp swaps in the next layout', () => {
  const w = mk('normal', 2); w.leaves = 1e6;
  const bot = new POG.Bot(w, { skill: 1, seed: 3 });
  let ev = [];
  for (let i = 0; i < 120 * 60 && !of(ev, 'levelClear').length; i++) { bot.step(1 / 60); w.update(1 / 60); ev = w.drainEvents(); }
  const lc = of(ev, 'levelClear')[0];
  assert.ok(lc, 'cleared'); assert.strictEqual(lc.level, 0); assert.strictEqual(lc.bonus, 50);
  assert.strictEqual(w.levelBoops, 15); assert.ok(w.clearing);
  const before = w.score;
  assert.strictEqual(w.tapHole(0), 'busy');
  const after = [];
  const r = runUntil(w, e => { after.push(...e); return e.some(x => x.type === 'levelUp'); }, 3);
  near(r.t, C.CLEAR_T, 2 * H);
  assert.strictEqual(of(after, 'pop').length, 0, 'no pops while clearing');
  assert.strictEqual(of(after, 'miss').length, 0, 'clearing sinks are not misses');
  const lu = of(after, 'levelUp')[0];
  assert.deepStrictEqual({ level: lu.level, zone: lu.zone, loop: lu.loop, name: lu.name }, { level: 1, zone: 1, loop: 0, name: 'The Palm Grove' });
  assert.strictEqual(w.holes.length, 8); assert.strictEqual(w.holes[0].x, 225);
  assert.ok(w.holes.every(h => !h.critter)); assert.strictEqual(w.levelBoops, 0); assert.strictEqual(w.score, before);
  assert.strictEqual(w.stats.levelTimes.length, 1);
  const more = secs(w, 3);
  assert.strictEqual(w.pip.state, 'home', 'Pip back on the pad'); assert.ok(of(more, 'pop').length >= 1, 'play resumes');
  // a gold counts 1 toward the goal
  const q = quiet('easy'); q.levelBoops = 14; popUp(q, 0, 'gold'); q.tapHole(0);
  assert.strictEqual(q.levelBoops, 15); assert.strictEqual(of(q.drainEvents(), 'levelClear').length, 1);
});

test('level: loops after the night (level 4 = spring loop 1) and every chapter / loop is faster', () => {
  const w = mk('normal', 1);
  const ups = [];
  for (const L of [0, 1, 2, 3, 4, 8]) { w.gotoLevel(L); ups.push(C.DIFFICULTY.normal.up / w.speed()); }
  for (let i = 1; i < 4; i++) assert.ok(ups[i] < ups[i - 1], 'each chapter faster ' + ups);
  assert.ok(ups[4] < ups[0] && ups[5] < ups[4], 'loops faster');
  w.gotoLevel(4);
  assert.strictEqual(w.zone, 0); assert.strictEqual(w.loop, 1); assert.strictEqual(w.holes.length, 6);
  const ev = w.drainEvents();
  assert.strictEqual(of(ev, 'levelUp').length, 1); assert.strictEqual(of(ev, 'levelUp')[0].name, 'The Morning Spring');
});

test('game over: hearts hit 0 → phase over, gameOver once, no more scoring', () => {
  const w = quiet('normal');
  const all = [];
  for (let k = 0; k < C.START_LEAVES; k++) {
    settle(w); secs(w, 0.4);
    popUp(w, k, 'sleepy'); assert.strictEqual(w.tapHole(k), 'wrong'); all.push(...w.drainEvents());
  }
  assert.strictEqual(w.phase, 'over'); assert.strictEqual(w.leaves, 0);
  popUp(w, 4);
  const score = w.score;
  assert.strictEqual(w.tapHole(4), 'none');
  all.push(...secs(w, 10));
  assert.strictEqual(of(all, 'gameOver').length, 1); assert.strictEqual(of(all, 'gameOver')[0].score, score);
  assert.strictEqual(w.score, score); assert.strictEqual(of(all, 'pop').length, 0);
  assert.strictEqual(of(all, 'leafLost').length, C.START_LEAVES);
});

// ---------- hit zone ----------
test('hit zone: circle (bx, by−45s) r 88s, nearest wins; tapAt routes to tapHole', () => {
  const w = quiet('normal');
  for (let L = 0; L < 4; L++) {
    w.gotoLevel(L); hold(w);
    w.holes.forEach((h, i) => {
      const cy = h.y - 45 * h.s;
      assert.strictEqual(w.holeAt(h.x, cy), i);
      assert.strictEqual(w.holeAt(h.x + 87 * h.s, cy), i);
      assert.strictEqual(w.holeAt(h.x - 87 * h.s, cy), i);
      assert.ok(w.holeAt(h.x - 89 * h.s, cy) !== i && w.holeAt(h.x + 89 * h.s, cy) !== i, 'outside the circle');
    });
  }
  w.holes = [{ x: 100, y: 300, s: 1, critter: null }, { x: 200, y: 300, s: 1, critter: null }];
  assert.strictEqual(w.holeAt(140, 255), 0); assert.strictEqual(w.holeAt(160, 255), 1);
  assert.strictEqual(w.holeAt(500, 100), -1);
  w.gotoLevel(0); hold(w);
  popUp(w, 4);
  assert.strictEqual(w.tapAt(480 + 30, 460 - 45 - 50), 'match');
});

// ---------- weather ----------
test('weather: every chapter stays ≤ 60 particles / ≤ 12 ripples with the right sprites and layers; bursts bounded', () => {
  const sprites = POG.Weather.SPRITES, extra = ['sparkle', 'star_tw'];
  for (let z = 0; z < 4; z++) {
    const wx = new POG.Weather({ width: 960, height: 540, seed: z + 1 });
    wx.setLevel(z, { instant: true });
    const seen = new Set();
    for (let i = 0; i < 60 * 40; i++) {
      wx.update(1 / 60);
      if (i % 10 === 0) wx.burst(['sparkle', 'gold', 'ripple'][i % 3], 480, 300);
      assert.ok(wx.particles.length <= 60, 'cap ' + wx.particles.length);
      assert.ok(wx.ripples.length <= 12, 'ripple cap ' + wx.ripples.length);
      for (const p of wx.particles) seen.add(p.sprite);
    }
    for (const p of wx.particles) {
      for (const k of ['sprite', 'x', 'y', 'size', 'rot', 'flipX', 'alpha', 'layer']) assert.ok(k in p, k);
      assert.ok(isFinite(p.x) && isFinite(p.y) && isFinite(p.rot) && p.size > 0 && p.alpha >= 0 && p.alpha <= 1);
      assert.ok(p.layer === 'back' || p.layer === 'front');
    }
    for (const s of seen) assert.ok(sprites[z].includes(s) || extra.includes(s), z + ' unexpected ' + s);
    for (const s of sprites[z]) assert.ok(seen.has(s), z + ' has ' + s);
    for (const q of wx.ripples) for (const k of ['x', 'y', 'r', 'alpha']) assert.ok(isFinite(q[k]), 'ripple.' + k);
    if (z === 2) assert.ok(wx.particles.filter(p => p.sprite === 'sandwisp' || p.sprite === 'tumbleweed').every(p => p.layer === 'back'));
    if (z === 3) assert.ok(wx.particles.filter(p => p.kind === 'star').every(p => p.y < 200), 'stars in the sky band');
  }
  const wx = new POG.Weather({ seed: 3 });
  for (let i = 0; i < 20; i++) { wx.burst('gold', 100, 100); wx.burst('ripple', 480, 136); }
  assert.ok(wx.particles.length <= 60 && wx.ripples.length <= 12);
  for (let i = 0; i < 90; i++) wx.update(1 / 60);
  assert.ok(wx.particles.every(p => p.kind !== 'sparkle'), 'sparkles die');
  for (let i = 0; i < 60; i++) wx.update(1 / 60);
  assert.ok(wx.ripples.length <= 2, 'ripples die');
});

test('weather: motion — dragonfly hover/dash, petal pendulum, butterfly flaps, glow blink, star twinkle, ripples ease out', () => {
  const run = (z, s, fn) => { const wx = new POG.Weather({ seed: 4 }); wx.setLevel(z, { instant: true }); for (let i = 0; i < s * 60; i++) { wx.update(1 / 60); fn(wx); } return wx; };
  let slow = 0, fast = 0;
  run(0, 20, wx => wx.particles.filter(p => p.kind === 'dragonfly').forEach(p => { const v = Math.hypot(p.vx, p.vy); if (v < 120) slow++; if (v > 250) fast++; }));
  assert.ok(slow > 100 && fast > 30, 'hover ' + slow + ' dash ' + fast);
  let rmin = 9, rmax = -9;
  run(0, 10, wx => wx.particles.filter(p => p.kind === 'petal').forEach(p => { rmin = Math.min(rmin, p.rot); rmax = Math.max(rmax, p.rot); }));
  assert.ok(rmin < -0.4 && rmax > 0.4 && rmin > -1.6 && rmax < 1.6, 'petal rot ' + rmin + '..' + rmax);
  let f0 = 0, f1 = 0, off = 0;
  run(1, 20, wx => wx.particles.filter(p => p.kind === 'butterfly').forEach(p => { if (p.sprite === 'butterfly_0') f0++; else f1++; if (p.x < -120 || p.x > 1080 || p.y < -60 || p.y > 600) off++; }));
  assert.ok(f0 > 100 && f1 > 100 && off === 0, f0 + '/' + f1 + ' off ' + off);
  let amin = 1, amax = 0, smin = 1, smax = 0;
  run(3, 8, wx => wx.particles.forEach(p => {
    if (p.kind === 'glow') { amin = Math.min(amin, p.alpha); amax = Math.max(amax, p.alpha); }
    if (p.kind === 'star') { smin = Math.min(smin, p.alpha); smax = Math.max(smax, p.alpha); }
  }));
  assert.ok(amin < 0.3 && amax > 0.9, 'blink ' + amin + '..' + amax);
  assert.ok(smin < 0.4 && smax > 0.9, 'twinkle ' + smin + '..' + smax);
  // sand wisps breathe
  let wa = 1, wb = 0;
  run(2, 20, wx => wx.particles.filter(p => p.kind === 'sandwisp').forEach(p => { wa = Math.min(wa, p.alpha); wb = Math.max(wb, p.alpha); }));
  assert.ok(wb - wa > 0.1, 'wisp alpha ' + wa + '..' + wb);
  // ripples: radius grows monotonically and decelerates, alpha falls
  const wx = new POG.Weather({ seed: 1 }); wx.setLevel(1, { instant: true }); wx.burst('ripple', 480, 136);
  const q = wx.ripples[0]; let lastR = q.r, lastDr = Infinity, lastA = q.alpha;
  for (let i = 0; i < 70; i++) { wx.update(1 / 60); const dr = q.r - lastR; assert.ok(dr >= 0 && dr <= lastDr + 1e-9); assert.ok(q.alpha <= lastA + 1e-9); lastDr = dr; lastR = q.r; lastA = q.alpha; }
  assert.ok(q.r > 20);
  // ambient ripples on the pool in spring and night only
  for (const [z, want] of [[0, true], [1, false], [2, false], [3, true]]) {
    let any = false; run(z, 10, wx => { if (wx.ripples.length) any = true; });
    assert.strictEqual(any, want, 'zone ' + z + ' ripples');
  }
});

test('weather: tumbleweed rolls without slipping (rot = distance / r) and hops under gravity; one at a time', () => {
  const wx = new POG.Weather({ seed: 6 }); wx.setLevel(2, { instant: true });
  const T = POG.Weather.TUMBLE; let seen = 0, hops = 0, accOk = 0, maxN = 0, prev = null;
  for (let i = 0; i < 60 * 90; i++) {
    wx.update(1 / 60);
    const tw = wx.particles.filter(p => p.kind === 'tumbleweed'); maxN = Math.max(maxN, tw.length);
    const p = tw[0];
    if (!p) { prev = null; continue; }
    seen++;
    near(p.rot * p.r, p.x - p.x0, 1e-6, 'no slip');
    assert.ok(p.y <= T.ground - p.r + 1e-9, 'never below the ground line');
    if (prev && prev.air && p.air && prev.id === p && p.y < T.ground - p.r - 1e-9) {
      near((p.vy - prev.vy) * 60, T.g, 1e-6, 'gravity'); accOk++;
    }
    if (p.air && !(prev && prev.air)) hops++;
    prev = { air: p.air, vy: p.vy, id: p };
  }
  assert.ok(seen > 300, 'tumbleweeds seen ' + seen);
  assert.ok(hops >= 3 && accOk > 20, 'hops ' + hops + ' acc ' + accOk);
  assert.strictEqual(maxN, 1);
});

test('weather: setLevel crossfades — old particles fade out, new ones fade in, cap holds', () => {
  const wx = new POG.Weather({ width: 960, height: 540, seed: 2 });
  wx.setLevel(3, { instant: true });
  for (let i = 0; i < 60; i++) wx.update(1 / 60);
  wx.setLevel(1);
  for (let i = 0; i < 20; i++) wx.update(1 / 60);
  const sp = new Set(wx.particles.map(p => p.sprite));
  assert.ok(sp.has('glow') && sp.has('petal'), [...sp].join());
  assert.ok(wx.particles.filter(p => p.sprite === 'glow').every(p => p.alpha < 0.9), 'fading');
  assert.ok(wx.particles.length <= 60);
  for (let i = 0; i < 90; i++) wx.update(1 / 60);
  assert.ok(wx.particles.every(p => POG.Weather.SPRITES[1].includes(p.sprite)), 'old gone');
});

// ---------- bot ----------
test('bot: survives on Easy (skill 0.3, 5 min, 5 seeds) and skill 1 survives ≥ 5 min on Normal (3 seeds)', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const r = playBot('easy', seed, 0.3, 300);
    assert.ok(r.w.phase === 'play', 'easy seed ' + seed + ' died at ' + r.t.toFixed(0) + ' s');
  }
  for (const seed of [1, 2, 3]) {
    const r = playBot('normal', seed, 1, 300);
    assert.ok(r.w.phase === 'play' && r.t >= 299.9, 'seed ' + seed + ' died at ' + r.t.toFixed(0) + ' s');
    assert.ok(r.w.level >= 6, 'level ' + r.w.level);
  }
});

test('bot: a kid (skill 0.3) clears chapter 1 on Easy most of the time', () => {
  let ok = 0;
  for (let seed = 1; seed <= 10; seed++) if (playBot('easy', seed, 0.3, 240).w.level >= 1) ok++;
  assert.ok(ok >= 8, ok + '/10');
});

test('bot: low skill reacts slower and taps more sleepers than high skill; prefers gold', () => {
  const lo = playBot('easy', 4, 0.1, 200, { immortal: true }).w.stats, hi = playBot('easy', 4, 1, 200, { immortal: true }).w.stats;
  assert.ok(lo.wrong > hi.wrong, lo.wrong + ' vs ' + hi.wrong);
  assert.ok(lo.boops < hi.boops);
  // two ready at once: the gold is tapped first
  const w = quiet('easy'); w.debugSpawn(0, 'firefly'); secs(w, 0.05); w.debugSpawn(5, 'gold');
  const bot = new POG.Bot(w, { skill: 1, seed: 1 });
  bot.seen = {}; secs(w, 0.3);
  let first = -1;
  for (let i = 0; i < 120 && first < 0; i++) { bot.step(H); tick(w); for (const e of w.drainEvents()) if (e.type === 'boop' && first < 0) first = e.hole; }
  assert.strictEqual(first, 5);
});

// ---------- performance ----------
test('10 simulated minutes (world + bot) run in ≈ 2 s', () => {
  const t0 = Date.now();
  const w = mk('normal', 8); w.leaves = w.maxLeaves = 1e6;
  const bot = new POG.Bot(w, { skill: 0.9, seed: 2 });
  for (let i = 0; i < 600 * 60; i++) { bot.step(1 / 60); w.update(1 / 60); w.drainEvents(); }
  const ms = Date.now() - t0;
  assert.ok(ms < 2500, ms + ' ms');
  assert.ok(w.level >= 10, 'level ' + w.level);
});

// ---------- run ----------
let fail = 0;
for (const t of tests) {
  try { t.fn(); console.log('PASS ' + t.name); }
  catch (e) { fail++; console.log('FAIL ' + t.name + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n     ') : e)); }
}

if (process.argv.includes('--stats')) {
  const N = 20, CAP = 900;
  console.log(`\nbot sweep (${N} seeds, ${CAP} s cap; level = chapters cleared; times in s):`);
  for (const diff of ['easy', 'normal', 'hard']) for (const skill of [0.3, 0.5, 0.8, 1]) {
    const lv = [], surv = [], per = [[], [], [], []]; let l0 = 0;
    for (let s = 1; s <= N; s++) {
      const r = playBot(diff, s, skill, CAP);
      lv.push(r.w.level); surv.push(r.t); if (r.w.level >= 1) l0++;
      r.w.stats.levelTimes.forEach((x, i) => per[Math.min(i, 3)].push(x));
    }
    const med = a => { const b = [...a].sort((x, y) => x - y); return b[b.length >> 1]; };
    const avg = a => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(0) : '-';
    console.log(`  ${diff.padEnd(6)} skill ${String(skill).padEnd(3)}: ch.1 cleared ${String(l0).padStart(2)}/${N}  median survival ${med(surv).toFixed(0).padStart(3)} s` +
      `  median chapters ${String(med(lv)).padStart(2)}  avg chapter time 1/2/3/4+ ${per.map(avg).join('/')}`);
  }
}
console.log(`\n${tests.length - fail}/${tests.length} passed`);
process.exit(fail ? 1 : 0);
