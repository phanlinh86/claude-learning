#!/usr/bin/env node
// Zippy's Jungle Boop — headless unit tests for rng / world / weather / bot (node, no deps).
// Run from projects/daily-game/snail-jungle-boop:   node tests/unit/run.js        (add --stats for the bot sweep)
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
  return sandbox.ZJB;
}
const ZJB = load();
const W = ZJB.World, C = W.CONFIG, H = C.STEP;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const near = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, (m || '') + ' got ' + a + ' want ' + b + ' ±' + tol);

// ---------- helpers ----------
function mk(diff, seed, extra) { return new W(Object.assign({ seed: seed || 1, difficulty: diff || 'normal' }, extra || {})); }
/** a world with spawning switched off (tests place critters with debugSpawn) */
function quiet(diff, seed) {
  const w = mk(diff, seed);
  w.spawnT = 1e9; w.noMatchT = -1e9; w._quiet = true; w.drainEvents();
  return w;
}
function hold(w) { w.spawnT = 1e9; w.noMatchT = -1e9; }
function steps(w, n, each) { const ev = []; for (let i = 0; i < n; i++) { hold0(w); w.update(H); const e = w.drainEvents(); ev.push(...e); if (each) each(w, e); } return ev; }
function hold0(w) { if (w._quiet) hold(w); }
function secs(w, s, each) { return steps(w, Math.round(s / H), each); }
function runUntil(w, pred, max) {
  const ev = []; let t = 0; max = max || 10;
  while (t < max) { hold0(w); w.update(H); t += H; const e = w.drainEvents(); ev.push(...e); if (pred(e, w)) break; }
  return { ev, t };
}
const of = (ev, t) => ev.filter(e => e.type === t);
/** pop a critter and let it rise fully */
function popUp(w, i, colour) { const c = w.debugSpawn(i, colour); secs(w, 0.3); return c; }
function playBot(diff, seed, skill, maxS, opts) {
  opts = opts || {};
  const w = mk(diff, seed);
  if (opts.immortal) w.leaves = w.maxLeaves = 1e6;
  const bot = new ZJB.Bot(w, { skill, seed: seed * 7 + 1 });
  const dt = 1 / 60; let t = 0; const ev = [];
  while (w.phase !== 'over' && t < maxS) {
    bot.step(dt); w.update(dt); t += dt;
    const e = w.drainEvents(); if (opts.keep) for (const x of e) ev.push(x);
  }
  return { w, t, bot, ev };
}

// ---------- RNG ----------
test('rng: same seed → same sequence, ranges hold', () => {
  const a = new ZJB.RNG(42), b = new ZJB.RNG(42), c = new ZJB.RNG(43);
  const sa = [], sb = [], sc = [];
  for (let i = 0; i < 50; i++) { sa.push(a.next()); sb.push(b.next()); sc.push(c.next()); }
  assert.deepStrictEqual(sa, sb); assert.notDeepStrictEqual(sa, sc);
  const r = new ZJB.RNG('x');
  for (let i = 0; i < 2000; i++) {
    const v = r.next(); assert.ok(v >= 0 && v < 1);
    const k = r.int(2, 5); assert.ok(k >= 2 && k <= 5 && k === Math.floor(k));
    const f = r.range(-3, 3); assert.ok(f >= -3 && f < 3);
  }
  assert.ok([1, 2, 3].includes(r.pick([1, 2, 3])));
});

// ---------- determinism / snapshot ----------
test('world: same seed (+ same bot) → identical event log; another seed differs', () => {
  const log = seed => JSON.stringify(playBot('normal', seed, 0.6, 60, { keep: true }).ev);
  assert.strictEqual(log(5), log(5));
  assert.notStrictEqual(log(5), log(6));
});

test('world: contract statics, initial state and a JSON-able getState()', () => {
  assert.deepStrictEqual(Array.from(W.BIOMES), ['riverbank', 'bamboo', 'canopy', 'ruins']);
  assert.deepStrictEqual(Array.from(W.KINDS), ['monkey', 'frog', 'toucan']);
  assert.strictEqual(W.BIOME_NAMES[3], 'Waterfall Ruins');
  assert.deepStrictEqual(Array.from(W.LAYOUTS.map(l => l.length)), [6, 8, 9, 9]);
  assert.deepStrictEqual(Object.assign({}, W.LAYOUTS[1][4]), { x: 165, y: 460, s: 1 });
  assert.ok(C.STEP <= 1 / 120 + 1e-12);
  const w = mk('easy', 3); secs(w, 3);
  const s = w.getState();
  assert.strictEqual(JSON.stringify(JSON.parse(JSON.stringify(s))), JSON.stringify(s));
  for (const k of ['phase', 'time', 'score', 'leaves', 'maxLeaves', 'level', 'zone', 'loop', 'levelBoops', 'levelGoal', 'combo',
    'mult', 'boops', 'colour', 'colours', 'nextColourIn', 'colourWarn', 'graceColour', 'graceT', 'holes', 'zippy', 'stats']) {
    assert.ok(k in s, 'missing ' + k);
  }
  for (const k of ['x', 'y', 'px', 'py', 'vx', 'vy', 'tilt', 'face', 'state', 't', 'target']) assert.ok(k in s.zippy, 'zippy.' + k);
  for (const k of ['boops', 'wrong', 'missed', 'bestCombo', 'byColour', 'leavesGained']) assert.ok(k in s.stats, 'stats.' + k);
  const c = s.holes.find(h => h.critter).critter;
  for (const k of ['kind', 'colour', 'state', 'h', 'hPrev', 't', 'upFor', 'id']) assert.ok(k in c, 'critter.' + k);
  assert.strictEqual(s.phase, 'play'); assert.strictEqual(s.leaves, 3); assert.strictEqual(s.maxLeaves, 5);
  assert.strictEqual(s.levelGoal, 15); assert.strictEqual(s.colours.length, 2);
});

// ---------- pop motion ----------
test('pop: rise spring overshoots ≈1.08 (bounded), settles at 1, hPrev trails h', () => {
  const w = quiet('easy'); w._quiet = true;
  const c = w.debugSpawn(2, 0);
  let peak = 0, peakT = 0, t = 0, upAt = -1;
  for (let i = 0; i < Math.round(0.4 / H); i++) {
    const before = c.h; w.update(H); t += H;
    assert.strictEqual(c.hPrev, before);
    if (c.h > peak) { peak = c.h; peakT = t; }
    if (upAt < 0 && c.state === 'up') upAt = t;
  }
  assert.ok(peak > 1.04 && peak < 1.12, 'peak ' + peak);
  assert.ok(peakT > 0.06 && peakT < 0.16, 'peak at ' + peakT);
  near(upAt, C.RISE_T, 2 * H, 'rise→up');
  near(c.h, 1, 0.01, 'settled');
  assert.ok(c.h >= 0 && c.h <= 1.12);
});

test('pop: up holds for upFor, then sinks in ≈0.2 s; booped bounces then sinks after 0.45 s; wow holds 0.4 s', () => {
  const w = quiet('easy'); w._quiet = true;
  const c = w.debugSpawn(0, 1);
  const r = runUntil(w, () => c.state === 'sink', 10);
  near(r.t, C.RISE_T + c.upFor, 3 * H, 'sink start');
  const r2 = runUntil(w, (e, w) => w.holes[0].critter === null, 2);
  near(r2.t, C.SINK_T, 2 * H, 'sink time');
  // booped
  const b = popUp(w, 1, w.colour);
  assert.strictEqual(w.tapHole(1), 'match');
  let maxH = 0; const rb = runUntil(w, () => { maxH = Math.max(maxH, b.h); return b.state === 'sink'; }, 2);
  near(rb.t, C.BOOP_HOLD, 2 * H, 'booped hold'); assert.ok(maxH > 1.03 && maxH < 1.12, 'happy bounce ' + maxH);
  // wow
  const o = popUp(w, 2, w.colours.find(x => x !== w.colour));
  w.zippy.state = 'home';
  assert.strictEqual(w.tapHole(2), 'wrong'); assert.strictEqual(o.state, 'wow');
  const rw = runUntil(w, () => o.state === 'sink', 2);
  near(rw.t, C.WOW_HOLD, 2 * H, 'wow hold');
});

// ---------- Zippy ----------
test('zippy: launches on tap, arcs to (bx, by−120s) in 0.18–0.3 s, boops 0.18 s, returns home; tilt bounded', () => {
  for (const hi of [0, 3, 5]) {
    const w = quiet('easy'); w._quiet = true;
    popUp(w, hi, w.colour);
    const h = w.holes[hi], tx = h.x, ty = h.y - 120 * h.s;
    assert.strictEqual(w.tapHole(hi), 'match');
    w.update(H); const vy0 = w.zippy.vy;
    const ev0 = w.drainEvents(); const L = of(ev0, 'zippyLaunch')[0];
    assert.ok(L && L.x === tx && L.y === ty);
    let maxTilt = 0, minY = 1e9, faceOk = true;
    const r = runUntil(w, (e, w) => {
      const z = w.zippy; maxTilt = Math.max(maxTilt, Math.abs(z.tilt)); minY = Math.min(minY, z.y);
      if (z.state === 'fly' && Math.abs(z.vx) > 30 && z.face !== Math.sign(z.vx)) faceOk = false;
      return e.some(x => x.type === 'zippyArrive');
    }, 1);
    assert.ok(r.t >= 0.17 && r.t <= 0.31, 'flight ' + r.t);
    near(w.zippy.x, tx, 0.5); near(w.zippy.y, ty, 0.5);
    assert.ok(vy0 < 0, 'jetpack lift: starts upward, vy0 ' + vy0);
    assert.ok(maxTilt <= C.TILT_MAX + 1e-9 && maxTilt > 0.05, 'tilt ' + maxTilt);
    assert.ok(faceOk, 'face follows vx');
    const rb = runUntil(w, (e, w) => w.zippy.state === 'return', 1);
    near(rb.t, C.BOOP_T, 2 * H, 'boop squash');
    const rh = runUntil(w, (e, w) => { maxTilt = Math.max(maxTilt, Math.abs(w.zippy.tilt)); return w.zippy.state === 'home'; }, 2);
    assert.ok(rh.t <= C.RETURN_MAX + 2 * H, 'return ' + rh.t);
    assert.ok(maxTilt <= C.TILT_MAX + 1e-9);
    near(w.zippy.x, C.HOME.x, 0.5); near(w.zippy.y, C.HOME.y, C.BOB_A + 0.5);
    // hover bob at home
    let lo = 1e9, hi2 = -1e9; secs(w, 1.5, w => { lo = Math.min(lo, w.zippy.y); hi2 = Math.max(hi2, w.zippy.y); });
    assert.ok(hi2 - lo > C.BOB_A, 'bobs'); assert.strictEqual(w.zippy.x, C.HOME.x);
  }
});

test('zippy: a second tap mid-flight retargets him smoothly (never blocked); px/py trail x/y', () => {
  const w = quiet('easy'); w._quiet = true;
  popUp(w, 0, w.colour); popUp(w, 5, w.colour);
  assert.strictEqual(w.tapHole(0), 'match');
  secs(w, 0.08);
  const vBefore = [w.zippy.vx, w.zippy.vy];
  assert.strictEqual(w.tapHole(5), 'match');
  const z = w.zippy;
  assert.deepStrictEqual([z.vx, z.vy].map(v => Math.round(v)), vBefore.map(v => Math.round(v)), 'velocity continuous');
  const px = z.x; w.update(H); assert.strictEqual(z.px, px);
  const r = runUntil(w, e => e.some(x => x.type === 'zippyArrive'), 1);
  near(z.x, w.holes[5].x, 0.5); assert.strictEqual(z.target.hole, 5); assert.ok(r.t < 0.31);
});

// ---------- scoring ----------
test('scoring: 10 × mult, ×2 from combo 5, ×3 from combo 10; combo events; +1 leaf every 12 boops', () => {
  const w = quiet('normal'); w._quiet = true;
  const pts = [], combos = [], gained = [];
  for (let k = 0; k < 13; k++) {
    w.nextColourIn = 99; w.sinceBoop = 0;
    const i = k % 6; popUp(w, i, w.colour);
    assert.strictEqual(w.tapHole(i), 'match');
    const ev = w.drainEvents();
    pts.push(of(ev, 'boop')[0].points); combos.push(...of(ev, 'combo').map(e => e.n)); gained.push(...of(ev, 'leafGained'));
    secs(w, 0.8);
  }
  assert.deepStrictEqual(pts, [10, 10, 10, 10, 20, 20, 20, 20, 20, 30, 30, 30, 30]);
  assert.deepStrictEqual(combos, [5, 10]);
  assert.strictEqual(gained.length, 1); assert.strictEqual(gained[0].leaves, 4); assert.strictEqual(w.leaves, 4);
  assert.strictEqual(w.score, 10 * 4 + 20 * 5 + 30 * 4);
  assert.strictEqual(w.stats.bestCombo, 13); assert.strictEqual(w.mult, 3);
  assert.strictEqual(w.stats.byColour.reduce((a, b) => a + b, 0), 13);
});

test('wrong tap: −1 leaf, combo resets, critter says wow, Zippy dizzy 0.6 s; taps busy only for the first 0.35 s', () => {
  const w = quiet('normal'); w._quiet = true;
  for (let k = 0; k < 3; k++) { popUp(w, k, w.colour); w.tapHole(k); secs(w, 0.8); }
  assert.strictEqual(w.combo, 3);
  const bad = w.colours.find(x => x !== w.colour);
  popUp(w, 3, bad); popUp(w, 4, w.colour); w.drainEvents();
  assert.strictEqual(w.tapHole(3), 'wrong');
  const ev = w.drainEvents();
  assert.strictEqual(of(ev, 'wrong').length, 1); assert.strictEqual(of(ev, 'leafLost')[0].leaves, 2);
  assert.strictEqual(w.leaves, 2); assert.strictEqual(w.combo, 0); assert.strictEqual(w.mult, 1);
  assert.strictEqual(w.zippy.state, 'dizzy'); assert.strictEqual(w.stats.wrong, 1);
  secs(w, 0.2); assert.strictEqual(w.tapHole(4), 'busy');
  secs(w, 0.17); assert.strictEqual(w.tapHole(4), 'match');
  assert.strictEqual(w.zippy.state, 'fly');
  // dizzy → return home on its own
  const w2 = quiet('normal'); w2._quiet = true; popUp(w2, 0, bad === w2.colour ? w2.colours.find(x => x !== bad) : bad);
  w2.tapHole(0); let maxTilt = 0;
  const r = runUntil(w2, (e, w) => { maxTilt = Math.max(maxTilt, Math.abs(w.zippy.tilt)); return w.zippy.state !== 'dizzy'; }, 2);
  near(r.t, C.DIZZY_T, 2 * H); assert.ok(maxTilt > 0.1 && maxTilt <= C.TILT_MAX + 1e-9, 'wobble ' + maxTilt);
});

test('taps: empty hole / sinking critter → empty (no penalty); outside every zone → none', () => {
  const w = quiet('normal'); w._quiet = true;
  assert.strictEqual(w.tapHole(0), 'empty'); assert.strictEqual(of(w.drainEvents(), 'empty').length, 1);
  const c = popUp(w, 1, w.colours.find(x => x !== w.colour)); c.state = 'sink'; c.t = 0; c.h0 = 1;
  assert.strictEqual(w.tapHole(1), 'empty');
  assert.strictEqual(w.tapAt(10, 10), 'none'); assert.strictEqual(w.tapHole(42), 'none');
  assert.strictEqual(w.leaves, 3); assert.strictEqual(w.stats.wrong, 0);
  // too low in the rise (h < 0.25) does not count yet
  w.debugSpawn(2, w.colour); w.update(H);
  assert.ok(w.holes[2].critter.h < C.HIT_MIN_H); assert.strictEqual(w.tapHole(2), 'empty');
});

test('miss rule: a matching critter ducking un-booped costs a leaf on Normal/Hard, not on Easy', () => {
  for (const [diff, cost] of [['easy', 0], ['normal', 1], ['hard', 1]]) {
    const w = quiet(diff); w._quiet = true; w.combo = 4;
    w.debugSpawn(0, w.colour);
    const ev = runUntil(w, e => e.some(x => x.type === 'miss'), 6).ev;
    assert.strictEqual(of(ev, 'miss').length, 1, diff);
    assert.strictEqual(of(ev, 'leafLost').length, cost, diff); assert.strictEqual(w.leaves, 3 - cost, diff);
    assert.strictEqual(w.combo, cost ? 0 : 4, diff); assert.strictEqual(w.stats.missed, 1);
    // a decoy ducking is never a miss
    w.debugSpawn(1, w.colours.find(x => x !== w.colour));
    assert.strictEqual(of(secs(w, 5), 'miss').length, 0);
  }
});

// ---------- colour cadence ----------
test('colour: changes after 6 boops with a 1 s colourWarn; old colour accepted for 0.8 s grace', () => {
  const w = quiet('normal'); w._quiet = true;
  const c0 = w.colour;
  for (let k = 0; k < 6; k++) { assert.strictEqual(w.nextColourIn, 6 - k); popUp(w, k, w.colour); w.tapHole(k); secs(w, 0.7); }
  // the warning started when the 6th boop landed (≈0.7 s + pop time ago)
  let ev = w.drainEvents();
  const r = runUntil(w, e => e.some(x => x.type === 'colour'), 2);
  ev = r.ev;
  const ch = of(ev, 'colour')[0];
  assert.ok(ch && ch.from === c0 && ch.to !== c0 && w.colour === ch.to);
  assert.strictEqual(w.nextColourIn, 6); assert.strictEqual(w.colourWarn, false);
  assert.strictEqual(w.graceColour, c0);
  // grace
  w.debugSpawn(0, c0); secs(w, 0.25);
  assert.strictEqual(w.tapHole(0), 'match', 'old colour inside grace');
  w.debugSpawn(1, c0); secs(w, 0.6);
  assert.strictEqual(w.graceColour, -1);
  w.zippy.state = 'home';
  assert.strictEqual(w.tapHole(1), 'wrong', 'old colour after grace');
  // warn timing on a fresh world: warn exactly 1 s before the change
  const w2 = quiet('normal'); w2._quiet = true;
  let warnT = -1, chT = -1, t = 0;
  for (let k = 0; k < 6; k++) { popUp(w2, k, w2.colour); w2.tapHole(k); }
  while (t < 3 && chT < 0) { w2.update(H); t += H; for (const e of w2.drainEvents()) { if (e.type === 'colourWarn') warnT = t; if (e.type === 'colour') chT = t; } }
  assert.ok(warnT >= 0 && chT > warnT); near(chT - warnT, C.COLOUR_WARN, 2 * H);
});

test('colour: changes after 14 s without a boop (warn at 13 s)', () => {
  const w = quiet('easy'); w._quiet = true;
  const c0 = w.colour; let warnT = -1, chT = -1, t = 0;
  while (t < 16 && chT < 0) { w.update(H); t += H; for (const e of w.drainEvents()) { if (e.type === 'colourWarn') warnT = t; if (e.type === 'colour') chT = t; } }
  near(warnT, C.COLOUR_TIME - C.COLOUR_WARN, 2 * H); near(chT, C.COLOUR_TIME, 2 * H);
  assert.notStrictEqual(w.colour, c0);
});

test('colours per biome: L0 2, L1 3, L2 3, L3 4 (fixed ids), current colour always one of them', () => {
  const w = mk('normal', 4);
  const want = [[0, 1], [0, 1, 2], [1, 2, 3], [0, 1, 2, 3]];
  for (let L = 0; L < 8; L++) {
    w.gotoLevel(L);
    assert.deepStrictEqual(Array.from(w.colours), want[L % 4]);
    assert.ok(w.colours.includes(w.colour));
  }
});

// ---------- spawning / fairness ----------
test('spawning: never into an occupied burrow, avoids the one just vacated, respects max up, decoys are a real choice', () => {
  for (const diff of ['easy', 'normal', 'hard']) {
    for (let L = 0; L < 4; L++) {
      const w = mk(diff, 11 + L); w.gotoLevel(L); w.leaves = 1e6; w.drainEvents();
      let pre = w.holes.map(h => h.critter && h.critter.id), lastVac = -1, pops = 0, match = 0, intoVac = 0, freeOther = 0;
      const max = C.DIFFICULTY[diff].maxUp[L];
      for (let i = 0; i < Math.round(120 / H); i++) {
        w.update(H);
        for (const e of w.drainEvents()) {
          if (e.type !== 'pop') continue;
          pops++; if (e.colour === w.colour) match++;
          assert.ok(!pre[e.hole], 'spawned into an occupied burrow');
          if (e.hole === lastVac) { intoVac++; if (pre.filter((x, k) => !x && k !== lastVac).length) freeOther++; }
        }
        let live = 0;
        w.holes.forEach((h, k) => { if (pre[k] && !h.critter) lastVac = k; if (h.critter && h.critter.state !== 'sink') live++; });
        assert.ok(live <= max + 1, 'max up ' + live + '>' + (max + 1));
        pre = w.holes.map(h => h.critter && h.critter.id);
      }
      assert.strictEqual(freeOther, 0, 'spawned into the just-vacated burrow while others were free');
      const frac = match / pops;
      assert.ok(pops > 40 && frac > 0.35 && frac < 0.85, diff + ' L' + L + ' matching fraction ' + frac.toFixed(2) + ' of ' + pops);
    }
  }
});

test('fairness: a matching critter is visible again within ≈2 s (no taps, every difficulty and biome)', () => {
  for (const diff of ['easy', 'normal', 'hard']) {
    for (let L = 0; L < 4; L++) {
      const w = mk(diff, 21 + L); w.gotoLevel(L); w.leaves = 1e6; w.drainEvents();
      let since = 0, worst = 0;
      for (let i = 0; i < Math.round(120 / H); i++) {
        w.update(H); w.drainEvents();
        const vis = w.holes.some(h => h.critter && (h.critter.state === 'rise' || h.critter.state === 'up') && h.critter.colour === w.colour);
        since = vis ? 0 : since + H;
        if (w.time > C.START_DELAY + 0.5) worst = Math.max(worst, since);
      }
      assert.ok(worst <= C.FAIR_T + C.FAIR_HURRY + 0.05, diff + ' L' + L + ' worst gap ' + worst.toFixed(2));
    }
  }
});

test('level 0 on Easy is gentle: ≈2.6 s up time, ≤ 2 up, ≈65 % matching, first pop matches, misses free', () => {
  const w = mk('easy', 9); w.drainEvents();
  const ev = secs(w, 2.0);
  const first = of(ev, 'pop')[0];
  assert.ok(first && first.colour === w.colour, 'first pop matches');
  const up = w.holes.find(h => h.critter).critter.upFor;
  assert.ok(up > 2.2 && up < 3.0, 'upFor ' + up);
  assert.strictEqual(C.DIFFICULTY.easy.maxUp[0], 2); near(C.DIFFICULTY.easy.matchP, 0.65, 0.001);
  assert.strictEqual(C.DIFFICULTY.easy.missCosts, false);
});

// ---------- level flow ----------
test('level: 15 boops → levelClear (+50), field clears for 1.2 s with no pops, levelUp swaps in the next layout', () => {
  const w = mk('normal', 2); w.leaves = 1e6;
  const bot = new ZJB.Bot(w, { skill: 1, seed: 3 });
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
  assert.deepStrictEqual({ level: lu.level, zone: lu.zone, loop: lu.loop, name: lu.name }, { level: 1, zone: 1, loop: 0, name: 'Bamboo Grove' });
  assert.strictEqual(w.holes.length, 8); assert.strictEqual(w.holes[0].x, 225);
  assert.ok(w.holes.every(h => !h.critter)); assert.strictEqual(w.levelBoops, 0); assert.strictEqual(w.score, before);
  assert.strictEqual(w.stats.levelTimes.length, 1);
  const more = secs(w, 3); assert.ok(of(more, 'pop').length >= 1, 'play resumes');
});

test('level: loops after the ruins (level 4 = riverbank loop 1) and every loop is faster', () => {
  const w = mk('normal', 1);
  const ups = [];
  for (const L of [0, 1, 2, 3, 4, 8]) { w.gotoLevel(L); ups.push(C.DIFFICULTY.normal.up / w.speed()); }
  for (let i = 1; i < 4; i++) assert.ok(ups[i] < ups[i - 1], 'each biome faster ' + ups);
  assert.ok(ups[4] < ups[0] && ups[5] < ups[4], 'loops faster');
  w.gotoLevel(4);
  assert.strictEqual(w.zone, 0); assert.strictEqual(w.loop, 1); assert.strictEqual(w.holes.length, 6);
  const ev = w.drainEvents(); // gotoLevel drains earlier events then emits levelUp
  assert.strictEqual(of(ev, 'levelUp').length, 1);
});

test('game over: leaves hit 0 → phase over, gameOver once, no more scoring', () => {
  const w = quiet('normal'); w._quiet = true;
  const bad = w.colours.find(x => x !== w.colour);
  const all = [];
  for (let k = 0; k < 3; k++) { popUp(w, k, bad); w.zippy.state = 'home'; assert.strictEqual(w.tapHole(k), 'wrong'); all.push(...w.drainEvents()); }
  assert.strictEqual(w.phase, 'over'); assert.strictEqual(w.leaves, 0);
  popUp(w, 4, w.colour);
  const score = w.score;
  assert.strictEqual(w.tapHole(4), 'none');
  all.push(...secs(w, 10));
  assert.strictEqual(of(all, 'gameOver').length, 1); assert.strictEqual(of(all, 'gameOver')[0].score, score);
  assert.strictEqual(w.score, score); assert.strictEqual(of(all, 'pop').length, 0);
  assert.strictEqual(of(all, 'leafLost').length, 3);
});

// ---------- hit zone ----------
test('hit zone: circle (bx, by−45s) r 88s, nearest wins; tapAt routes to tapHole', () => {
  const w = quiet('normal'); w._quiet = true;
  for (let L = 0; L < 4; L++) {
    w.gotoLevel(L); hold(w);
    w.holes.forEach((h, i) => {
      const cy = h.y - 45 * h.s;
      assert.strictEqual(w.holeAt(h.x, cy), i);
      assert.strictEqual(w.holeAt(h.x + 87 * h.s, cy), i);
      assert.strictEqual(w.holeAt(h.x - 87 * h.s, cy), i);
      assert.ok(w.holeAt(h.x - 89 * h.s, cy) !== i && w.holeAt(h.x + 89 * h.s, cy) !== i, 'outside the circle');
      // the hole whose zone contains a point is always the nearest one (rows overlap a little)
      for (let k = 0; k < 40; k++) {
        const x = h.x + (k % 8 - 3.5) * 25 * h.s, y = cy + (Math.floor(k / 8) - 2) * 40 * h.s, got = w.holeAt(x, y);
        if (got < 0) continue;
        const d = j => Math.hypot(x - w.holes[j].x, y - (w.holes[j].y - 45 * w.holes[j].s));
        w.holes.forEach((o, j) => { if (d(j) <= 88 * o.s) assert.ok(d(got) <= d(j) + 1e-9); });
      }
    });
  }
  // nearest wins when zones overlap
  w.holes = [{ x: 100, y: 300, s: 1, critter: null }, { x: 200, y: 300, s: 1, critter: null }];
  assert.strictEqual(w.holeAt(140, 255), 0); assert.strictEqual(w.holeAt(160, 255), 1);
  assert.strictEqual(w.holeAt(500, 100), -1);
  w.gotoLevel(0); hold(w);
  popUp(w, 4, w.colour);
  assert.strictEqual(w.tapAt(480 + 30, 460 - 45 - 50), 'match');
});

// ---------- weather ----------
test('weather: every biome stays ≤ 60 particles with the right sprites and layers; bursts are bounded', () => {
  const sprites = { 0: ['dragonfly', 'leaf'], 1: ['leaf'], 2: ['butterfly_0', 'butterfly_1', 'leaf'], 3: ['firefly', 'mist', 'drop'] };
  for (let z = 0; z < 4; z++) {
    const wx = new ZJB.Weather({ width: 960, height: 540, seed: z + 1 });
    wx.setLevel(z, { instant: true });
    for (let i = 0; i < 60 * 30; i++) {
      wx.update(1 / 60);
      if (i % 10 === 0) wx.burst('sparkle', 480, 300);
      assert.ok(wx.particles.length <= 60, 'cap ' + wx.particles.length);
    }
    for (const p of wx.particles) {
      for (const k of ['sprite', 'x', 'y', 'size', 'rot', 'flipX', 'alpha', 'layer']) assert.ok(k in p, k);
      assert.ok(isFinite(p.x) && isFinite(p.y) && isFinite(p.rot) && p.alpha >= 0 && p.alpha <= 1);
      assert.ok(p.layer === 'back' || p.layer === 'front');
      assert.ok(sprites[z].includes(p.sprite) || p.sprite === 'sparkle', z + ' ' + p.sprite);
    }
    for (const s of sprites[z]) assert.ok(wx.particles.some(p => p.sprite === s), z + ' has ' + s);
    if (z === 3) assert.ok(wx.particles.filter(p => p.sprite === 'mist').every(p => p.layer === 'back'));
  }
  const wx = new ZJB.Weather({ seed: 3 });
  for (let i = 0; i < 20; i++) wx.burst('sparkle', 100, 100);
  assert.ok(wx.particles.length <= 60);
  const sp = wx.particles.filter(p => p.sprite === 'sparkle');
  assert.ok(sp.length > 0);
  for (let i = 0; i < 60; i++) wx.update(1 / 60);
  assert.ok(wx.particles.every(p => p.sprite !== 'sparkle'), 'sparkles die');
});

test('weather: motion feels alive — dragonfly hover-and-dash, leaf pendulum, butterfly flaps, firefly blink', () => {
  const run = (z, s, fn) => { const wx = new ZJB.Weather({ seed: 4 }); wx.setLevel(z, { instant: true }); for (let i = 0; i < s * 60; i++) { wx.update(1 / 60); fn(wx); } };
  // dragonflies: both slow (hover) and fast (dash) moments
  let slow = 0, fast = 0;
  run(0, 20, wx => wx.particles.filter(p => p.kind === 'dragonfly').forEach(p => { const v = Math.hypot(p.vx, p.vy); if (v < 120) slow++; if (v > 250) fast++; }));
  assert.ok(slow > 100 && fast > 30, 'hover ' + slow + ' dash ' + fast);
  // leaves: rotation swings both ways and stays bounded, x oscillates around the fall line
  let rmin = 9, rmax = -9;
  run(1, 10, wx => wx.particles.forEach(p => { rmin = Math.min(rmin, p.rot); rmax = Math.max(rmax, p.rot); }));
  assert.ok(rmin < -0.4 && rmax > 0.4 && rmin > -1.6 && rmax < 1.6, 'leaf rot ' + rmin + '..' + rmax);
  // butterflies swap frames and stay roughly on screen
  let f0 = 0, f1 = 0, off = 0;
  run(2, 20, wx => wx.particles.filter(p => p.kind === 'butterfly').forEach(p => { if (p.sprite === 'butterfly_0') f0++; else f1++; if (p.x < -120 || p.x > 1080 || p.y < -60 || p.y > 600) off++; }));
  assert.ok(f0 > 100 && f1 > 100 && off === 0, f0 + '/' + f1 + ' off ' + off);
  // fireflies blink (alpha range wide)
  let amin = 1, amax = 0;
  run(3, 8, wx => wx.particles.filter(p => p.kind === 'firefly').forEach(p => { amin = Math.min(amin, p.alpha); amax = Math.max(amax, p.alpha); }));
  assert.ok(amin < 0.3 && amax > 0.9, 'blink ' + amin + '..' + amax);
});

test('weather: setLevel crossfades — old particles fade out, new ones fade in, cap holds', () => {
  const wx = new ZJB.Weather({ width: 960, height: 540, seed: 2 });
  wx.setLevel(3, { instant: true });
  for (let i = 0; i < 60; i++) wx.update(1 / 60);
  wx.setLevel(1);
  for (let i = 0; i < 20; i++) wx.update(1 / 60);
  const sp = new Set(wx.particles.map(p => p.sprite));
  assert.ok(sp.has('firefly') && sp.has('leaf'), [...sp].join());
  assert.ok(wx.particles.filter(p => p.sprite === 'firefly').every(p => p.alpha < 0.9), 'fading');
  assert.ok(wx.particles.length <= 60);
  for (let i = 0; i < 90; i++) wx.update(1 / 60);
  assert.ok(wx.particles.every(p => p.sprite === 'leaf'), 'old gone');
});

// ---------- bot ----------
test('bot: skill 1 survives ≥ 5 min on Normal (3 seeds)', () => {
  for (const seed of [1, 2, 3]) {
    const r = playBot('normal', seed, 1, 300);
    assert.ok(r.w.phase === 'play' && r.t >= 299.9, 'seed ' + seed + ' died at ' + r.t.toFixed(0) + ' s');
    assert.ok(r.w.level >= 6, 'level ' + r.w.level);
  }
});

test('bot: a kid (skill 0.3) clears Level 0 on Easy most of the time', () => {
  let ok = 0;
  for (let seed = 1; seed <= 10; seed++) if (playBot('easy', seed, 0.3, 240).w.level >= 1) ok++;
  assert.ok(ok >= 8, ok + '/10');
});

test('bot: low skill reacts slower and makes more wrong taps than high skill', () => {
  const lo = playBot('easy', 4, 0.1, 200, { immortal: true }).w.stats, hi = playBot('easy', 4, 1, 200, { immortal: true }).w.stats;
  assert.ok(lo.wrong > hi.wrong, lo.wrong + ' vs ' + hi.wrong);
  assert.ok(lo.boops < hi.boops);
});

// ---------- performance ----------
test('10 simulated minutes (world + bot) run in ≈ 2 s', () => {
  const t0 = Date.now();
  const w = mk('normal', 8); w.leaves = w.maxLeaves = 1e6;
  const bot = new ZJB.Bot(w, { skill: 0.9, seed: 2 });
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
  console.log(`\nbot sweep (${N} seeds, ${CAP} s cap; level = levels cleared; times in s):`);
  for (const diff of ['easy', 'normal', 'hard']) for (const skill of [0.3, 0.5, 0.8, 1]) {
    const lv = [], surv = [], per = [[], [], [], []]; let l0 = 0;
    for (let s = 1; s <= N; s++) {
      const r = playBot(diff, s, skill, CAP);
      lv.push(r.w.level); surv.push(r.t); if (r.w.level >= 1) l0++;
      r.w.stats.levelTimes.forEach((x, i) => per[Math.min(i, 3)].push(x));
    }
    const med = a => { const b = [...a].sort((x, y) => x - y); return b[b.length >> 1]; };
    const avg = a => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(0) : '-';
    console.log(`  ${diff.padEnd(6)} skill ${String(skill).padEnd(3)}: L0 cleared ${String(l0).padStart(2)}/${N}  median survival ${med(surv).toFixed(0).padStart(3)} s` +
      `  median levels ${String(med(lv)).padStart(2)}  avg level time L0/L1/L2/L3+ ${per.map(avg).join('/')}`);
  }
}
console.log(`\n${tests.length - fail}/${tests.length} passed`);
process.exit(fail ? 1 : 0);
