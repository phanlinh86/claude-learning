#!/usr/bin/env node
// Biscuit's Kitchen Flight — headless unit tests for rng / world / weather / bot (node, no deps).
// Run from projects/daily-game/pup-kitchen-flight:   node tests/unit/run.js   (add --stats for a bot sweep)
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
  return sandbox.BKF;
}
const BKF = load();
const W = BKF.World, C = BKF.CONFIG, H = C.step, G = BKF.GEOM;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const near = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, (m || '') + ' got ' + a + ' want ' + b + ' ±' + tol);
const of = (ev, t) => ev.filter(e => e.type === t);

// ---------- helpers ----------
function mk(diff, seed, config, extra) { return new W(Object.assign({ seed: seed || 1, difficulty: diff || 'normal', config }, extra || {})); }
/** playing world with no generation and the intro leaves removed */
function quiet(diff, config) {
  const w = mk(diff, 1, config, { noSpawn: true });
  w.flap(); w.leaves.length = 0; w.drainEvents();
  return w;
}
function steps(w, n, each) { const ev = []; for (let i = 0; i < n; i++) { if (each) each(w, i); w.update(H); ev.push(...w.drainEvents()); } return ev; }
function secs(w, s, each) { return steps(w, Math.round(s / H), each); }
/** keep Biscuit parked at y (no motion) */
const park = y => w => { w.pup.y = y; w.pup.vy = 0; };
function playBot(diff, seed, skill, maxS, keep) {
  const w = mk(diff, seed);
  const bot = new BKF.Bot(w, { skill, seed: seed * 7 + 1 });
  const dt = 1 / 60; let t = 0; const ev = [];
  while (w.phase !== 'over' && t < maxS) { bot.step(dt); w.update(dt); t += dt; const e = w.drainEvents(); if (keep) ev.push(...e); }
  return { w, t, bot, ev };
}

// ---------- RNG ----------
test('rng: same seed → same sequence; ranges hold', () => {
  const a = new BKF.RNG(42), b = new BKF.RNG(42), c = new BKF.RNG(43);
  const sa = [], sb = [], sc = [];
  for (let i = 0; i < 50; i++) { sa.push(a.next()); sb.push(b.next()); sc.push(c.next()); }
  assert.deepStrictEqual(sa, sb); assert.notDeepStrictEqual(sa, sc);
  const r = new BKF.RNG('2026-11-12');
  for (let i = 0; i < 3000; i++) {
    const v = r.next(); assert.ok(v >= 0 && v < 1);
    const k = r.int(2, 5); assert.ok(k >= 2 && k <= 5 && k === Math.floor(k));
    const f = r.range(-3, 3); assert.ok(f >= -3 && f < 3);
  }
  assert.ok([1, 2, 3].includes(r.pick([1, 2, 3])));
  assert.strictEqual(typeof r.chance(0.5), 'boolean');
});

// ---------- contract ----------
test('contract: CONFIG / DIFFICULTY / state fields', () => {
  assert.strictEqual(C.step, 1 / 120);
  for (const [k, v] of [['counterY', 470], ['railY', 40], ['ceilingY', 24], ['pupX', 260], ['spawnX', 1240], ['despawnX', -200], ['pupR', 28], ['leafR', 22]]) assert.strictEqual(C[k], v, k);
  for (const d of ['easy', 'normal', 'hard']) for (const k in BKF.DIFFICULTY[d]) assert.ok(k in C, d + '.' + k + ' is not a CONFIG key');
  const w = mk('easy', 3);
  const s0 = w.getState(); assert.strictEqual(s0.phase, 'ready');
  const fly = w2 => { if (w2.pup.y > 260 && w2.pup.vy > 0) w2.flap(); };
  w.flap(); secs(w, 2, fly);
  const s = w.getState();
  assert.strictEqual(JSON.stringify(JSON.parse(JSON.stringify(s))), JSON.stringify(s));
  for (const k of ['t', 'scroll', 'scrollSpeed', 'level', 'zone', 'loop', 'levelT', 'levelLen', 'dayT', 'darkness', 'lamp', 'pup', 'batteries',
    'maxBatteries', 'score', 'leafCount', 'passed', 'levelBumps', 'wind', 'obstacles', 'leaves', 'stats', 'phase']) assert.ok(k in s, 'missing ' + k);
  for (const k of ['x', 'y', 'vy', 'prevY', 'rot', 'prevRot', 'prop', 'squash', 'hurtT', 'state']) assert.ok(k in s.pup, 'pup.' + k);
  for (const k of ['gy', 'target', 'warnT', 'dir']) assert.ok(k in s.wind, 'wind.' + k);
  for (const k of ['flaps', 'leaves', 'bumps', 'passed', 'steam', 'cleanLevels', 'bestRun']) assert.ok(k in s.stats, 'stats.' + k);
  for (const k of ['x', 'y', 'r']) assert.ok(k in s.lamp);
  assert.strictEqual(s.maxBatteries, 4); assert.strictEqual(s.batteries, 4);   // easy: 4 (playtest)
  // obstacle / leaf fields once a few beats exist
  secs(w, 12, fly);
  const kinds = {};
  for (const o of w.obstacles) {
    kinds[o.kind] = 1;
    for (const k of ['id', 'kind', 'x', 'prevX', 'passed']) assert.ok(k in o, o.kind + '.' + k);
    if (o.kind === 'hang') { for (const k of ['sprite', 'len', 'ang', 'prevAng', 'angVel']) assert.ok(k in o, 'hang.' + k); assert.ok(G.hang.sprites.includes(o.sprite)); }
    if (o.kind === 'stack') for (const p of o.pieces) { for (const k of ['sprite', 'w', 'h', 'y']) assert.ok(k in p); }
    if (o.kind === 'kettle') for (const k of ['steamH', 'puffT']) assert.ok(k in o);
  }
  for (const l of w.leaves) for (const k of ['id', 'sprite', 'x', 'y', 'prevX', 'prevY', 'rot', 'prevRot', 'phase']) assert.ok(k in l, 'leaf.' + k);
  assert.ok(w.leaves.every(l => ['mint', 'basil', 'bay'].includes(l.sprite)));
  // hitShapes kinds
  for (const s2 of w.hitShapes()) assert.ok(['circle', 'rect', 'seg'].includes(s2.kind));
});

// ---------- determinism / fixed step ----------
test('determinism: same seed + same flap steps → identical state; frame rate does not matter', () => {
  function run(seed, frame) {
    const w = mk('normal', seed, { batteries: 99, maxBatteries: 99 });
    const n = Math.round(90 / frame);
    let t = 0;
    for (let i = 0; i < n; i++) {
      const step = Math.round(t / H);
      if (step % 36 === 0 || (step % 47 === 0 && w.pup.y > 300)) w.flap();
      w.update(frame); t += frame; w.drainEvents();
    }
    return JSON.stringify(w.getState(), (k, v) => (k === 'alpha' ? undefined : typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v));
  }
  const a = run(5, 1 / 60);
  assert.strictEqual(a, run(5, 1 / 60));
  assert.strictEqual(a, run(5, 1 / 120), '120 Hz frames give the same run');
  assert.strictEqual(a, run(5, 1 / 30), '30 Hz frames give the same run');
  assert.notStrictEqual(a, run(6, 1 / 60));
});

test('interpolation: alpha = leftover/step in [0,1); prev* trail current', () => {
  const w = quiet('normal');
  w.update(H * 0.5); near(w.alpha, 0.5, 1e-6);
  w.update(H * 0.75); near(w.alpha, 0.25, 1e-6);
  const y0 = w.pup.y; w.update(H);
  assert.strictEqual(w.pup.prevY, y0);
  assert.ok(w.alpha >= 0 && w.alpha < 1);
});

// ---------- flight ----------
test('flap arc: rise 60–75 px, apex ≈ flapVy/g (≈0.33 s) on every difficulty', () => {
  for (const d of ['easy', 'normal', 'hard']) {
    const w = quiet(d), c = w.cfg;
    secs(w, 0.2);
    w.pup.y = 300; w.pup.vy = 0;
    assert.ok(w.flap());
    const y0 = w.pup.y; let top = y0, apexT = 0, t = 0;
    while (w.pup.vy < 0 && t < 2) { w.update(H); t += H; if (w.pup.y < top) { top = w.pup.y; apexT = t; } }
    const rise = y0 - top;
    assert.ok(rise >= 60 && rise <= 75, d + ' rise ' + rise);
    near(rise, c.flapVy * c.flapVy / (2 * c.gravity), 4, d + ' rise vs v²/2g');
    near(apexT, -c.flapVy / c.gravity, 0.02, d + ' apex');
    // terminal fall
    w.pup.y = 60; w.pup.vy = 0; secs(w, 0.75); assert.ok(w.pup.vy <= c.maxFall + 1e-9 && w.pup.vy > c.maxFall - 5, 'terminal ' + w.pup.vy);
  }
});

test('tilt: nose up fast after a tap, down slowly, always within ±0.45 rad', () => {
  const w = quiet('normal'), c = w.cfg;
  let maxAbs = 0;
  w.pup.y = 120; w.pup.vy = 300; secs(w, 0.4);
  const rotFalling = w.pup.rot; assert.ok(rotFalling > 0.1, 'nose down while falling ' + rotFalling);
  w.flap();
  secs(w, 0.12, w2 => { maxAbs = Math.max(maxAbs, Math.abs(w2.pup.rot)); });
  assert.ok(w.pup.rot < -0.2, 'nose up within 0.12 s ' + w.pup.rot);
  // falling: rotation rate is limited (slow nose-down)
  let maxRate = 0, last = w.pup.rot;
  secs(w, 1.2, w2 => { maxRate = Math.max(maxRate, (w2.pup.rot - last) / H); last = w2.pup.rot; maxAbs = Math.max(maxAbs, Math.abs(w2.pup.rot)); });
  assert.ok(maxRate < 3.5, 'nose-down rate ' + maxRate);
  // long random-ish flight, including bumps
  const w2 = mk('hard', 9, { batteries: 99, maxBatteries: 99 });
  for (let i = 0; i < 120 * 60; i++) {
    if (i % 29 === 0 && w2.pup.y > 200) w2.flap();
    w2.update(H); w2.drainEvents();
    maxAbs = Math.max(maxAbs, Math.abs(w2.pup.rot));
  }
  assert.ok(maxAbs <= c.tiltMax + 1e-9, 'max |rot| ' + maxAbs);
});

test('squash spring and propeller: dip then recover; fast spin for 0.3 s; no frame aliasing', () => {
  const w = quiet('normal', { gravity: 0 });
  secs(w, 1);
  w.pup.y = 300; w.flap();
  let mn = 9, mx = 0, lastProp = w.pup.prop, maxDp = 0;
  const rate0 = [];
  secs(w, 1.0, (w2, i) => {
    mn = Math.min(mn, w2.pup.squash); mx = Math.max(mx, w2.pup.squash);
    if (i === 30) rate0.push(w2.pup.propRate);
    if (i % 2 === 0) { maxDp = Math.max(maxDp, w2.pup.prop - lastProp); lastProp = w2.pup.prop; }
  });
  assert.ok(mn > 0.8 && mn < 0.93, 'squash min ' + mn);
  assert.ok(mx < 1.08, 'overshoot ' + mx);
  near(w.pup.squash, 1, 0.01, 'recovered');
  assert.ok(rate0[0] > w.cfg.propIdle + 2, 'fast after flap ' + rate0[0]);
  near(w.pup.propRate, w.cfg.propIdle, 0.3, 'back to idle');
  assert.ok(maxDp * 3 < 1, 'frame index advances < 1 per 60 fps frame: ' + maxDp);
});

test('ready phase: hover bob, slow background scroll, no obstacles, no clock', () => {
  const w = mk('easy', 1), c = w.cfg;
  let lo = 1e9, hi = -1e9;
  secs(w, 5, w2 => { lo = Math.min(lo, w2.pup.y); hi = Math.max(hi, w2.pup.y); });
  assert.strictEqual(w.phase, 'ready');
  assert.ok(lo >= c.readyY - c.readyBobAmp - 1e-6 && hi <= c.readyY + c.readyBobAmp + 1e-6);
  assert.ok(hi - lo > c.readyBobAmp, 'it bobs');
  near(w.scroll, c.readyScroll * 5, 1);
  assert.strictEqual(w.obstacles.length, 0); assert.strictEqual(w.t, 0); assert.strictEqual(w.levelT, 0);
  assert.ok(w.pup.prop > 10, 'propeller spins');
  assert.ok(w.flap()); const ev = w.drainEvents();
  assert.strictEqual(ev.map(e => e.type).join(), 'start,flap');
  assert.strictEqual(w.phase, 'playing');
  w.update(H); w.flap(); assert.strictEqual(of(w.drainEvents(), 'start').length, 0, 'start only once');
});

test('first 3 s: nothing on screen even on a 2.2:1 phone', () => {
  for (const d of ['easy', 'normal', 'hard']) for (const seed of [1, 2, 3, 4]) {
    const w = mk(d, seed, { gravity: 0 });
    w.flap();
    secs(w, 3, w2 => { for (const o of w2.obstacles) assert.ok(o.x - o.halfW > w2.cfg.visibleRight - 1, d + ' obstacle visible at t=' + w2.t + ' x=' + o.x); });
  }
});

// ---------- collisions ----------
function bumpCase(kind, setup, y, checks) {
  const w = quiet('normal', { gravity: 0, hangDrive: 0 });
  const o = setup(w);
  const hold = w2 => { park(y)(w2); if (o) o.x = o.prevX = o.fixX; };
  if (o) o.fixX = o.x;
  let ev = steps(w, 1, hold);
  const hit = kind === 'counter' ? of(ev, 'counter') : of(ev, 'bump');
  assert.strictEqual(hit.length, 1, kind + ': one hit event, got ' + ev.map(e => e.type));
  assert.strictEqual(w.batteries, 2, kind + ': exactly one battery');
  near(w.pup.hurtT, w.cfg.hurtTime - H, H + 1e-9, kind + ' hurtT');
  assert.strictEqual(w.pup.state, 'hurt');
  if (checks) checks(w, hit[0]);
  // stay inside for 2 s: no further cost (blink + still-overlapping extension)
  if (kind !== 'counter') {
    ev = secs(w, 2.0, hold);
    assert.strictEqual(of(ev, 'bump').length, 0, kind + ': no bump while blinking');
    assert.strictEqual(w.batteries, 2);
    // move it away, wait for the blink to end, then a new touch costs again
    o.fixX = 2000; secs(w, 0.2, hold);   // far right (not despawned)
    assert.ok(w.pup.hurtT <= 0, 'blink ended');
    o.fixX = o.x0; if (o.kind === 'hang') { o.ang = 0; o.angVel = 0; }
    ev = steps(w, 1, hold);
    assert.strictEqual(of(ev, 'bump').length, 1); assert.strictEqual(w.batteries, 1);
    assert.strictEqual(of(ev, 'lowBattery').length, 1);
  } else {
    // keeps bouncing on the counter while blinking, but no cost until the blink ends
    ev = secs(w, 1.3);
    assert.strictEqual(w.batteries, 2);
    assert.ok(of(ev, 'counter').every(e => !e.cost));
  }
  return w;
}
test('collisions: hang head / hang handle / stack piece / kettle / counter cost exactly one battery, 1.5 s blink', () => {
  const X = C.pupX;
  bumpCase('head', w => { const o = w.spawn('hang', { x: X + 10, len: 20, sprite: 'pan', still: true }); o.x0 = o.x; return o; }, 40 + 20 + 144 + 60,
    (w, e) => { assert.strictEqual(e.what, 'pan'); assert.strictEqual(e.part, 'head'); assert.ok(w.pup.vy > 0, 'bounced down from below'); });
  bumpCase('handle', w => { const o = w.spawn('hang', { x: X + 30, len: 20, sprite: 'whisk', still: true }); o.x0 = o.x; return o; }, 120,
    (w, e) => { assert.strictEqual(e.what, 'whisk'); assert.strictEqual(e.part, 'handle'); });
  bumpCase('stack', w => { const o = w.spawn('stack', { x: X + 40, pieces: [{ sprite: 'pot', dx: 0 }, { sprite: 'mug', dx: 0 }] }); o.x0 = o.x; return o; }, 330,
    (w, e) => { assert.strictEqual(e.what, 'mug'); assert.strictEqual(e.kind, 'stack'); });
  bumpCase('stack-top', w => { const o = w.spawn('stack', { x: X, pieces: [{ sprite: 'pot', dx: 0 }] }); o.x0 = o.x; return o; }, 380 + 6 - 20,
    (w, e) => { assert.strictEqual(e.what, 'pot'); assert.ok(w.pup.vy < 0, 'bounced up off the top'); });
  bumpCase('kettle', w => { const o = w.spawn('kettle', { x: X + 50, steamH: 260 }); o.x0 = o.x; return o; }, 380,
    (w, e) => { assert.strictEqual(e.what, 'kettle'); });
  bumpCase('counter', () => null, 445, (w, e) => { assert.ok(e.cost); near(w.pup.vy, w.cfg.counterBounceVy, 30); });
});

test('bump feel: knocked back a little and eased back to PUP_X; hanger swings', () => {
  const w = quiet('normal', { gravity: 0, hangDrive: 0 });
  const o = w.spawn('hang', { x: C.pupX + 40, len: 10, still: true });
  const hd = w.hangHead(o);
  w.pup.y = hd.y + 5; w.pup.vy = 0;
  let minX = 1e9;
  const ev = secs(w, 1.2, w2 => { o.x = C.pupX + 40; minX = Math.min(minX, w2.pup.x); });
  assert.strictEqual(of(ev, 'bump').length, 1);
  assert.ok(C.pupX - minX > 8 && C.pupX - minX < 30, 'knock ' + (C.pupX - minX));
  near(w.pup.x, C.pupX, 1, 'back home');
  assert.ok(Math.abs(o.ang) > 0.02 || Math.abs(o.angVel) > 0.05, 'swung');
  assert.ok(Math.abs(o.ang) <= w.cfg.hangMax + 1e-9);
});

test('pendulum: natural period 2π√(L/g), damped, clamped to small amplitude', () => {
  const w = quiet('normal', { hangDrive: 0, hangDamp: 0 });
  const o = w.spawn('hang', { x: 2000, len: 40, amp: 0.1, still: true }); o.ang = 0.1; o.angVel = 0;
  const L = 40 + w.cfg.hangCom, T = 2 * Math.PI * Math.sqrt(L / w.cfg.hangG);
  let crossings = [], last = o.ang, t = 0;
  steps(w, Math.round(3 * T / H), () => { o.x = 2000; t += H; if (last > 0 && o.ang <= 0) crossings.push(t); last = o.ang; });
  assert.ok(crossings.length >= 2);
  near(crossings[1] - crossings[0], T, T * 0.03, 'period');
  // damping
  const w2 = quiet('normal', { hangDrive: 0 });
  const o2 = w2.spawn('hang', { x: 2000, len: 40, still: true }); o2.ang = 0.2;
  secs(w2, 10, () => { o2.x = 2000; });
  assert.ok(Math.abs(o2.ang) < 0.1, 'decays ' + o2.ang);
  // default drive keeps a gentle sway, never above hangMax
  const w3 = quiet('normal');
  const o3 = w3.spawn('hang', { x: 2000, len: 30 });
  let mx = 0; secs(w3, 20, () => { o3.x = 2000; mx = Math.max(mx, Math.abs(o3.ang)); });
  assert.ok(mx > 0.03 && mx <= w3.cfg.hangMax, 'sway ' + mx);
});

test('steam: lifts Biscuit (overcomes gravity near the spout, fades with height), never hurts', () => {
  const w = quiet('normal', { hangDrive: 0 }), c = w.cfg;
  const k = w.spawn('kettle', { x: C.pupX, steamH: 260 });
  const base = c.counterY - G.kettle.h;
  const s0 = w.steamAt(C.pupX, base - 5);
  assert.ok(s0.inside && -s0.acc > c.gravity, 'near spout lift ' + s0.acc);
  const sMid = w.steamAt(C.pupX, base - 130); near(-sMid.acc, c.steamLift * 0.5, 1);
  assert.ok(!w.steamAt(C.pupX, base - 260 - 40).inside, 'nothing above the column');
  assert.ok(!w.steamAt(C.pupX + 120, base - 50).inside, 'nothing beside it');
  w.pup.y = base - 22; w.pup.vy = 0;
  let minY = 1e9;
  const ev = secs(w, 2.5, w2 => { k.x = C.pupX; minY = Math.min(minY, w2.pup.y); });
  assert.ok(base - 22 - minY > 30, 'lifted ' + (base - 22 - minY));
  assert.strictEqual(of(ev, 'steam').length, 1);
  assert.strictEqual(of(ev, 'bump').length, 0);
  assert.strictEqual(w.batteries, 3);
  assert.strictEqual(w.stats.steam, 1);
  assert.ok(w.pup.y < base - c.pupR, 'floats above the kettle');
  assert.ok(k.puffs >= 10, 'puffs tick ' + k.puffs);
});

test('ceiling only clamps (no damage)', () => {
  const w = quiet('normal'), c = w.cfg;
  let minTop = 1e9;
  const ev = secs(w, 3, (w2, i) => { if (i % 10 === 0) w2.flap(); minTop = Math.min(minTop, w2.pup.y - c.pupR); });
  assert.ok(minTop >= c.ceilingY - 1e-9, 'top ' + minTop);
  near(w.pup.y - c.pupR, c.ceilingY, 25);
  assert.strictEqual(w.batteries, 3); assert.strictEqual(of(ev, 'bump').length, 0);
});

// ---------- scoring ----------
test('scoring: leaf +1, pass +1, clean level +5 (and no bonus after a bump)', () => {
  const w = quiet('normal', { gravity: 0 });
  w.pup.y = 200;
  w.addLeaf(C.pupX + 5, 200, 'basil');
  let ev = steps(w, 1, park(200));
  const lf = of(ev, 'leaf'); assert.strictEqual(lf.length, 1);
  assert.strictEqual(lf[0].sprite, 'basil'); assert.strictEqual(lf[0].score, 1);
  assert.strictEqual(w.score, 1); assert.strictEqual(w.leafCount, 1); assert.strictEqual(w.leaves.length, 0);
  // pass
  w.spawn('stack', { x: C.pupX + 120, pieces: ['bowl'] });
  ev = secs(w, 2.5, park(200));
  assert.strictEqual(of(ev, 'pass').length, 1); assert.strictEqual(w.score, 2); assert.strictEqual(w.passed, 1);
  // clean level
  w.levelT = w.levelLen - 0.005;
  ev = steps(w, 2, park(200));
  const lu = of(ev, 'levelUp'); assert.strictEqual(lu.length, 1);
  assert.strictEqual(lu[0].clean, true); assert.strictEqual(lu[0].level, 1); assert.strictEqual(lu[0].zone, 1);
  assert.strictEqual(w.score, 7); assert.strictEqual(w.stats.cleanLevels, 1);
  // not clean
  w.pup.y = 445; steps(w, 1); assert.strictEqual(w.levelBumps, 1);
  w.levelT = w.levelLen - 0.005;
  ev = steps(w, 2);
  assert.strictEqual(of(ev, 'levelUp')[0].clean, false); assert.strictEqual(w.score, 7);
});

test('batteries: one back every 15 leaves, never above 3', () => {
  const w = quiet('normal', { gravity: 0, leavesPerBattery: 15 });
  w.batteries = 1;
  const got = [];
  for (let i = 0; i < 45; i++) {
    w.addLeaf(C.pupX, 200);
    for (const e of steps(w, 1, park(200))) if (e.type === 'battery') got.push([w.leafCount, e.n]);
  }
  assert.deepStrictEqual(got, [[15, 2], [30, 3]]);
  assert.strictEqual(w.batteries, 3); assert.strictEqual(w.leafCount, 45);
  assert.strictEqual(w.stats.bestRun, 45);
});

test('down → over: propeller stops, gentle parachute float to the counter, then gameOver', () => {
  const w = quiet('normal', { hangDrive: 0 }), c = w.cfg;
  w.batteries = 1;
  const o = w.spawn('stack', { x: C.pupX + 30, pieces: [{ sprite: 'jar', dx: 0 }] });
  w.pup.y = 400; w.pup.vy = 0;
  let ev = steps(w, 1, () => { o.x = C.pupX + 30; });
  assert.ok(of(ev, 'down').length === 1, 'down event: ' + ev.map(e => e.type));
  assert.strictEqual(w.phase, 'down'); assert.strictEqual(w.pup.state, 'sleep');
  assert.ok(!w.flap(), 'no flapping when powered down');
  w.obstacles.length = 0;
  w.pup.y = 150;
  let maxVy = 0, landT = -1, t = 0;
  ev = [];
  while (w.phase !== 'over' && t < 6) {
    w.update(H); t += H; ev.push(...w.drainEvents()); maxVy = Math.max(maxVy, w.pup.vy);
    if (landT < 0 && w.pup.y + c.pupR >= c.counterY - 0.01) landT = t;
  }
  assert.strictEqual(w.phase, 'over');
  assert.ok(maxVy <= c.downMaxFall + 1e-9, 'gentle ' + maxVy);
  assert.ok(landT > 0.8 && landT < 2.6, 'float time ' + landT);
  near(t - landT, c.downRest, 0.05, 'rest');
  const go = of(ev, 'gameOver'); assert.strictEqual(go.length, 1); assert.strictEqual(go[0].score, w.score);
  assert.ok(w.pup.propRate < 0.5, 'propeller stopped ' + w.pup.propRate);
  assert.ok(!w.flap());
  secs(w, 1); assert.strictEqual(w.phase, 'over');
  // landing on a stack top when floating down onto it
  const w2 = quiet('normal', { hangDrive: 0 });
  w2.batteries = 1; w2.pup.y = 445; w2.pup.vy = 0; steps(w2, 1);  // counter costs the last battery
  assert.strictEqual(w2.phase, 'down');
  w2.spawn('stack', { x: C.pupX, pieces: [{ sprite: 'pot', dx: 0 }] }); w2.pup.y = 200; w2.pup.vy = 0; w2.scrollSpeed = 0;
  secs(w2, 3);
  assert.strictEqual(w2.phase, 'over');
  near(w2.pup.y + c.pupR, c.counterY - 90 + G.pieceInsetTop, 1, 'rests on the pot');
});

// ---------- levels, wind, light ----------
test('levels: change every levelLen s, zone cycles, round 2 is ≈8 % faster', () => {
  const w = quiet('normal', { gravity: 0 });
  w.pup.y = 250;
  const ev = secs(w, 4 * 60 + 2, park(250));
  const lu = of(ev, 'levelUp');
  assert.deepStrictEqual(lu.map(e => e.zone), [1, 2, 3, 0]);
  assert.deepStrictEqual(lu.map(e => e.level), [1, 2, 3, 4]);
  assert.strictEqual(w.loop, 1); assert.strictEqual(w.zone, 0);
  near(w._targetSpeed() / w.cfg.scrollSpeed, 1.08, 1e-9);
  near(w.scrollSpeed, w.cfg.scrollSpeed * 1.08, 2);
  const w2 = quiet('easy'); near(w2._targetSpeed(), 140, 1e-9);
  const w3 = quiet('hard'); near(w3._targetSpeed(), 220, 1e-9);
  w.gotoLevel(6); assert.strictEqual(w.zone, 2); assert.strictEqual(w.levelT, 0);
  assert.strictEqual(of(w.drainEvents(), 'levelUp').length, 1);
});

test('zone 2: gusts every 6–9 s with a 1 s warning, ±gustAccel eased in/out, nudge Biscuit', () => {
  const w = quiet('normal', { gravity: 0, hangDrive: 0 }), c = w.cfg;
  w.gotoLevel(2); w.drainEvents();
  let maxGy = 0, maxJump = 0, last = 0, pushed = 0;
  const ev = [];
  let t = 0;
  for (let i = 0; i < Math.round(59 / H); i++) {
    w.pup.y = 250; w.pup.vy = 0;
    w.update(H); t += H;
    for (const e of w.drainEvents()) ev.push(Object.assign({ at: t }, e));
    maxGy = Math.max(maxGy, Math.abs(w.wind.gy));
    maxJump = Math.max(maxJump, Math.abs(w.wind.gy - last)); last = w.wind.gy;
    if (w.wind.gy !== 0) pushed = Math.max(pushed, Math.abs(w.pup.vy));
  }
  const warns = ev.filter(e => e.type === 'gustWarn'), gusts = ev.filter(e => e.type === 'gust'), ends = ev.filter(e => e.type === 'gustEnd');
  assert.ok(gusts.length >= 5 && gusts.length <= 9, 'gusts ' + gusts.length);
  assert.strictEqual(warns.length, gusts.length);
  for (let i = 0; i < gusts.length; i++) {
    near(gusts[i].at - warns[i].at, c.gustWarn, 2 * H, 'warning lead');
    assert.ok(['up', 'down'].includes(gusts[i].dir)); assert.strictEqual(gusts[i].dir, warns[i].dir);
    near(ends[i].at - gusts[i].at, c.gustLen, 2 * H, 'gust length');
    if (i) { const gap = gusts[i].at - gusts[i - 1].at; assert.ok(gap >= 6 - 0.05 && gap <= 9 + 0.05, 'gap ' + gap); }
  }
  assert.ok(gusts[0].at >= 4 && gusts[0].at <= 6 + 0.05, 'first gust ' + gusts[0].at);
  near(maxGy, c.gustAccel, 1); assert.ok(maxGy <= c.gustAccel + 1e-9);
  assert.ok(maxJump < c.gustAccel * 0.05, 'eased (max per-step change ' + maxJump + ')');
  assert.ok(pushed > 0, 'Biscuit is pushed');
  assert.ok(ev.filter(e => e.type === 'gustWarn' || e.type === 'gust').every(e => e.at + c.gustLen < 60), 'no gust over the level end');
  // no gusts outside zone 2
  const w0 = quiet('normal', { gravity: 0 });
  const e0 = secs(w0, 59, park(250));
  assert.strictEqual(of(e0, 'gust').length + of(e0, 'gustWarn').length, 0);
  assert.strictEqual(w0.wind.gy, 0);
});

test('day-night: darkness ≈0 morning, 0.08 rain, 0.25 sunset, 0.62 night, bounded; lamp ahead of the nose', () => {
  const D = W.darknessAt;
  near(D(0.05), 0, 0.005); near(D(0.375), 0.08, 1e-9); near(D(0.625), 0.25, 1e-9); near(D(0.875), 0.62, 1e-9);
  let prev = D(0), maxStep = 0;
  for (let i = 0; i <= 4000; i++) {
    const v = D(i / 4000); assert.ok(v >= 0 && v <= 0.62 + 1e-12, 'bounds at ' + i);
    maxStep = Math.max(maxStep, Math.abs(v - prev)); prev = v;
  }
  assert.ok(maxStep < 0.01, 'smooth curve');
  const w = quiet('normal', { gravity: 0 });
  w.gotoLevel(3); w.levelT = 30; w.update(H);
  near(w.dayT, 0.875, 0.001); near(w.darkness, 0.62, 0.001);
  assert.ok(w.lamp.x > w.pup.x + 40); near(w.lamp.r, w.cfg.lampRadius, 1e-9);
  assert.ok(mk('easy').cfg.lampRadius > mk('normal').cfg.lampRadius && mk('normal').cfg.lampRadius > mk('hard').cfg.lampRadius);
  const w0 = quiet('normal'); assert.ok(w0.darkness < 0.005);
});

test('leaves: bob and spin slowly, drift with the wind and settle', () => {
  const w = quiet('normal', { gravity: 0 }), c = w.cfg;
  const l = w.addLeaf(2000, 250);
  let lo = 1e9, hi = -1e9, r0 = l.rot;
  secs(w, 3, () => { l.x = 2000; lo = Math.min(lo, l.y); hi = Math.max(hi, l.y); });
  assert.ok(hi - lo > c.leafBobAmp && hi - lo <= 2 * c.leafBobAmp + 1e-9, 'bob ' + (hi - lo));
  assert.ok(Math.abs(l.rot - r0) > 0.5 && Math.abs(l.rot - r0) < 3, 'slow spin ' + (l.rot - r0));
  w.wind.target = -200; w.wind.k = 1; w.wind.phase = 'gust'; w.wind.gustT = 1; w.wind.dir = 'up';
  const b0 = l.baseY; secs(w, 1, () => { l.x = 2000; });
  assert.ok(b0 - l.baseY > 10, 'drifts up in an up-gust ' + (b0 - l.baseY));
});

// ---------- generation (long runs) ----------
function clearance(w, h, s) {
  const hx = h.x, hy = w.cfg.railY + h.len + G.hang.headDist; let best = 1e9;
  for (const p of s.pieces) {
    const rx = s.x + p.dx - p.w / 2 + G.pieceInsetX, ry = p.y - p.h + G.pieceInsetTop, rw = p.w - 2 * G.pieceInsetX, rh = p.h - G.pieceInsetTop;
    const qx = Math.max(rx, Math.min(hx, rx + rw)), qy = Math.max(ry, Math.min(hy, ry + rh));
    best = Math.min(best, Math.hypot(hx - qx, hy - qy) - G.hang.headR);
  }
  return best;
}
test('generation: every opening ≥ gapMin, leaves reachable and clear of obstacles, nothing pops in on screen', () => {
  for (const d of ['easy', 'normal', 'hard']) {
    const w = mk(d, 11, { batteries: 1e6, maxBatteries: 1e6, gravity: 0 }), c = w.cfg;
    w.flap();
    const seen = new Set(), kinds = {};
    let gates = 0;
    secs(w, 6 * 60, w2 => {
      w2.pup.y = 250; w2.pup.vy = 0; w2.leaves.forEach(l => { if (l.x < 400) l.x = -300; });   // don't let the parked pup eat leaves
      for (const o of w2.obstacles) {
        if (seen.has(o.id)) continue; seen.add(o.id); kinds[o.kind] = (kinds[o.kind] || 0) + 1;
        assert.ok(o.x - o.halfW > c.visibleRight, d + ' obstacle pops in at ' + o.x);
        if (o.gate) continue;
        if (o.kind === 'hang') assert.ok(c.counterY - (c.railY + o.len + G.hang.headDist + G.hang.headR) >= c.gapMin, d + ' hang gap');
        if (o.kind === 'stack') assert.ok(o.top - c.ceilingY >= c.gapMin, d + ' stack gap ' + (o.top - c.ceilingY));
      }
      const gs = w2.obstacles.filter(o => o.gate && o.kind === 'hang' && !seen.has('g' + o.id));
      for (const h of gs) {
        const s = w2.obstacles.find(o => o.gate && o.kind === 'stack' && Math.abs(o.id - h.id) === 1);
        if (!s) continue;
        seen.add('g' + h.id); gates++;
        assert.ok(clearance(w2, h, s) >= c.gapMin - 1e-6, d + ' gate clearance ' + clearance(w2, h, s));
        assert.ok(c.counterY - (c.railY + h.len + G.hang.headDist + G.hang.headR) >= c.gapMin, 'room under the gate hanger');
        assert.ok(s.top - c.ceilingY >= c.gapMin, 'room over the gate stack');
      }
      for (const l of w2.leaves) {
        if (seen.has('l' + l.id)) continue; seen.add('l' + l.id);
        if (w2.t < 0.01) continue;   // the intro arc
        assert.ok(l.x > c.visibleRight, d + ' leaf pops in at ' + l.x);
        assert.ok(l.baseY >= c.leafYMin && l.baseY <= c.leafYMax, 'leaf in the flyable band');
        assert.ok(w2._leafFree(l.x, l.baseY), d + ' leaf overlaps an obstacle at ' + l.x + ',' + l.baseY);
      }
    });
    assert.ok(kinds.hang > 5 && kinds.stack > 5 && kinds.kettle > 2 && gates > 3, d + ' variety ' + JSON.stringify(kinds) + ' gates ' + gates);
    assert.ok(w.obstacles.length < 20 && w.leaves.length < 60, 'old things despawn');
  }
});

// ---------- weather ----------
test('weather: per-zone particles, fields, ≤ 260 particles over 10 minutes of everything at once', () => {
  const wx = new BKF.Weather({ width: 960, height: 540, seed: 3 });
  const counts = [0, 0, 0, 0];
  let max = 0, t = 0, steamT = 0, burstT = 0, z = 0;
  const dt = 1 / 60;
  for (let i = 0; i < 600 * 60; i++) {
    t += dt;
    const nz = Math.floor(t / 60) % 4;
    if (nz !== z) { z = nz; wx.setLevel(z); }
    if (z === 2) { if (Math.floor(t) % 8 === 0) wx.gust(Math.floor(t / 8) % 2 ? 'up' : 'down'); if (Math.floor(t) % 8 === 3) wx.calm(); }
    steamT += dt; while (steamT > 0.22 / 3) { steamT -= 0.22 / 3; wx.steam(500, 350); }
    burstT += dt; if (burstT > 0.5) { burstT = 0; wx.burst('sparkle', 300, 200, 20); wx.burst('bit', 300, 200, 12); wx.burst('dust', 260, 440, 8); }
    wx.update(dt, 185);
    max = Math.max(max, wx.particles.length);
    if (Math.floor(t) % 60 === 50) counts[z] = Math.max(counts[z], wx.particles.filter(p => p.ambient && !p.dying).length);
  }
  assert.ok(max <= 260, 'max ' + max);
  assert.ok(counts.every(n => n >= 15), 'each zone has ambient particles ' + counts);
  const sprites = new Set(), layers = new Set();
  for (const p of wx.particles) {
    for (const k of ['sprite', 'x', 'y', 'size', 'rot', 'flipX', 'alpha', 'layer']) assert.ok(k in p, 'particle.' + k);
    for (const k of ['x', 'y', 'size', 'rot', 'flipX', 'alpha']) assert.ok(isFinite(p[k]), k + ' finite');
    assert.ok(p.alpha >= 0 && p.alpha <= 1);
    sprites.add(p.sprite); layers.add(p.layer);
  }
  for (const l of layers) assert.ok(['outside', 'room', 'front'].includes(l));
  const all = ['dust', 'raindrop', 'snowflake', 'steam', 'wind', 'sparkle', 'bit', 'outside_leaf'];
  for (const s of sprites) assert.ok(all.includes(s), 'sprite ' + s);
  // instant setLevel fills the zone at once
  const w2 = new BKF.Weather({ seed: 1 }); w2.setLevel(3, { instant: true });
  assert.ok(w2.particles.filter(p => p.sprite === 'snowflake').length >= 70);
  assert.ok(w2.particles.every(p => p.layer === 'outside'));
  // steam puffs rise, grow and fade
  const w3 = new BKF.Weather({ seed: 1 }); w3.setLevel(1, { instant: true }); w3.particles.length = 0;
  const pf = w3.steam(400, 350); const s0 = pf.size;
  for (let i = 0; i < 30; i++) w3.update(1 / 60, 0);
  assert.ok(pf.y < 340 && pf.size > s0 && pf.layer === 'room');
  for (let i = 0; i < 120; i++) w3.update(1 / 60, 0);
  assert.ok(!w3.particles.includes(pf), 'puff fades out');
});

test('weather: deterministic for the same seed', () => {
  const run = () => { const wx = new BKF.Weather({ seed: 9 }); wx.setLevel(2); wx.gust('up'); for (let i = 0; i < 600; i++) wx.update(1 / 60, 150); return JSON.stringify(wx.particles.map(p => [p.sprite, p.x, p.y, p.alpha])); };
  assert.strictEqual(run(), run());
});

// ---------- bot + speed ----------
test('bot: skill 1 survives 10 simulated minutes on normal', () => {
  for (const seed of [1, 2]) {
    const r = playBot('normal', seed, 1, 600);
    assert.notStrictEqual(r.w.phase, 'over', 'seed ' + seed + ' died at ' + r.t.toFixed(1));
    assert.ok(r.w.level >= 9, 'levels ' + r.w.level);
    assert.ok(r.w.leafCount > 200, 'collects leaves ' + r.w.leafCount);
  }
});

test('bot: title-screen skill 0.85 plays a decent demo on easy; skill 0 is clumsy', () => {
  const r = playBot('easy', 4, 0.85, 120);
  assert.ok(r.t > 40, 'demo lasts ' + r.t.toFixed(1));
  assert.ok(r.w.stats.flaps > 30);
  const r0 = playBot('normal', 4, 0, 600);
  assert.ok(r0.t < 600, 'skill 0 eventually loses');
});

test('speed: 10 minutes of world simulated in about 2 s', () => {
  const t0 = Date.now();
  const w = mk('normal', 21, { batteries: 1e6, maxBatteries: 1e6 });
  let t = 0;
  w.flap();
  while (t < 600) { if (w.pup.y > 300 && w.pup.vy > 0) w.flap(); w.update(1 / 60); t += 1 / 60; w.drainEvents(); }
  const ms = Date.now() - t0;
  assert.strictEqual(w.phase, 'playing');
  assert.ok(w.level >= 9, 'level ' + w.level);
  assert.ok(ms < 2000, 'world: ' + ms + ' ms');
  const t1 = Date.now();
  const r = playBot('normal', 3, 1, 600);
  const ms2 = Date.now() - t1;
  assert.ok(ms2 < 4000, 'world + bot: ' + ms2 + ' ms');
  console.log('     (world 10 min: ' + ms + ' ms; with bot: ' + ms2 + ' ms, ' + r.t.toFixed(0) + ' s survived)');
});

// ---------- run ----------
let fail = 0;
const only = process.argv.slice(2).find(a => !a.startsWith('--'));
for (const t of tests) {
  if (only && !t.name.includes(only)) continue;
  const t0 = Date.now();
  try { t.fn(); console.log('PASS ' + t.name + '  (' + (Date.now() - t0) + ' ms)'); }
  catch (e) { fail++; const at = (e && e.stack || '').split('\n').filter(l => l.includes('run.js:')).slice(0, 2).map(l => l.trim()); console.log('FAIL ' + t.name + '\n     ' + String(e && e.message || e).split('\n').slice(0, 3).join(' ') + '\n     ' + at.join('\n     ')); }
}

if (process.argv.includes('--stats')) {
  const N = 10, CAP = 600;
  console.log(`\nbot sweep (${N} seeds, ${CAP} s cap):`);
  for (const diff of ['easy', 'normal', 'hard']) for (const skill of [0.3, 0.5, 0.7, 0.85, 1]) {
    const surv = [], lv = [], lf = [];
    for (let s = 1; s <= N; s++) { const r = playBot(diff, s, skill, CAP); surv.push(r.t); lv.push(r.w.level); lf.push(r.w.leafCount); }
    const med = a => { const b = [...a].sort((x, y) => x - y); return b[b.length >> 1]; };
    console.log(`  ${diff.padEnd(6)} skill ${String(skill).padEnd(4)}: median survival ${med(surv).toFixed(0).padStart(3)} s, median levels ${med(lv)}, median leaves ${med(lf)}`);
  }
}
const ran = only ? tests.filter(t => t.name.includes(only)).length : tests.length;
console.log(`\n${ran - fail}/${ran} passed`);
process.exit(fail ? 1 : 0);
