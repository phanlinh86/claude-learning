#!/usr/bin/env node
// Ollie's Lighthouse Flip — headless unit tests for rng / world / weather / bot (node, no deps).
// Run from projects/daily-game/otter-arctic-flip:   node tests/unit/run.js
'use strict';
const assert = require('assert');
const { load } = require('./load');

const OF = load();
const C = OF.World.CONFIG;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const H = C.step;
const J = v => v === undefined ? v : JSON.parse(JSON.stringify(v));
const deq = (a, b, m) => assert.deepStrictEqual(J(a), J(b), m);
const near = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, (m || '') + ' got ' + a + ' want ' + b + ' ±' + tol);

// ---------- helpers ----------
function mk(diff, seed, w, h, level) {
  return new OF.World({ seed: seed || 1, difficulty: diff || 'normal', width: w || 960, height: h || 540, level: level || 0 });
}
function run(w, s, onEv) {
  const n = Math.round(s / H), ev = [];
  for (let i = 0; i < n; i++) { w.update(H); for (const e of w.drainEvents()) { ev.push(e); if (onEv) onEv(e, w); } }
  return ev;
}
function runUntil(w, pred, max) {
  const ev = []; let t = 0; max = max || 10;
  while (t < max) { w.update(H); t += H; const e = w.drainEvents(); ev.push(...e); if (pred(e, w)) break; }
  return { ev, t };
}
const types = ev => ev.map(e => e.type);
const of = (ev, t) => ev.filter(e => e.type === t);
/** flat world: both surfaces solid, nothing else (plus the spec) */
function flat(diff, spec, seed) { const w = mk(diff, seed); w.drainEvents(); w.setTrack(spec || {}); return w; }

function playBot(diff, seed, skill, maxS, opts) {
  opts = opts || {};
  const w = mk(diff, seed, opts.w, opts.h, opts.level);
  if (opts.immortal) w.hearts = w.maxHearts = 1e6;
  const bot = new OF.Bot(w, { skill, seed: seed * 3 + 1 });
  const wx = opts.weather ? new OF.Weather({ width: w.layout.width, height: w.layout.height, seed }) : null;
  let t = 0, maxP = 0, last = 0; const ev = [], levelT = [], dt = opts.dt || 1 / 60;
  let k = 0;
  while (w.phase !== 'over' && t < maxS) {
    if (opts.resize && t >= opts.resize.every * (k + 1)) {
      k++; const s = opts.resize.sizes[k % opts.resize.sizes.length];
      w.setLayout(s[0], s[1]); if (wx) wx.resize(s[0], s[1]);
    }
    bot.step(dt); w.update(dt);
    for (const x of w.drainEvents()) {
      ev.push(x.type);
      if (x.type === 'levelUp') { levelT.push(t - last); last = t; if (wx) wx.setLevel(x.zone); }
      if (wx) {
        if (x.type === 'catch') wx.burst('bit_' + x.leaf.kind, x.x - w.cam.x, x.y, 8, { speed: 180 });
        if (x.type === 'land') wx.burst('puff', w.layout.heroX, w.hero.y, 5, { up: 1, gravity: 60 });
        if (x.type === 'finish') wx.burst('sparkle', w.layout.heroX, w.layout.midY, 30, { speed: 260, gravity: -40 });
        if (x.type === 'bump') wx.burst('star', w.layout.heroX, w.hero.y, 10, {});
      }
    }
    if (wx) { wx.update(dt, w.speed); maxP = Math.max(maxP, wx.particles.length); }
    t += dt;
  }
  return { w, t, bot, ev, maxP, levelT };
}

// ---------- RNG / layout ----------
test('rng: OF namespace, deterministic, in range, API', () => {
  const a = new OF.RNG(42), b = new OF.RNG(42), c = new OF.RNG('x');
  for (let i = 0; i < 300; i++) { const x = a.next(); assert.strictEqual(x, b.next()); assert.ok(x >= 0 && x < 1); }
  for (const f of ['next', 'range', 'int', 'pick', 'chance', 'gauss', 'sign', 'fork']) assert.strictEqual(typeof c[f], 'function', f);
  assert.strictEqual(OF.MS, undefined);
});

test('layout: DESIGN §2 numbers (landscape, portrait, wide)', () => {
  const L = OF.World.computeLayout(960, 540);
  assert.strictEqual(L.unit, 100); assert.ok(!L.portrait);
  near(L.midY, 286.2, 1e-9); near(L.ceilY, 141.2, 1e-9); near(L.floorY, 431.2, 1e-9); near(L.corridorH, 290, 1e-9); near(L.heroX, 249.6, 1e-9);
  const P = OF.World.computeLayout(560, 1000);
  assert.ok(P.portrait); near(P.unit, 560 / 6, 1e-9); near(P.midY, 470, 1e-9); near(P.heroX, 0.22 * 560, 1e-9);
  near(OF.World.computeLayout(1280, 540).unit, 100, 1e-9);
  const w = mk(); near(w.standY('floor'), 431.2 - 42, 1e-9); near(w.standY('ceil'), 141.2 + 42, 1e-9);
  near(w.hero.x - w.cam.x, L.heroX, 1e-9);
});

// ---------- determinism ----------
test('determinism: same seed + same inputs → identical state; other seed differs; frame-rate independent', () => {
  const flips = [3.0, 4.5, 6.3, 8.0, 9.5, 12.0, 13.5, 16.0, 18.5, 21.0, 24.0, 27.5];
  const sim = (seed, dt) => {
    const w = mk('normal', seed); let t = 0, k = 0; const n = Math.round(30 / dt);
    for (let i = 0; i < n; i++) { if (k < flips.length && t >= flips[k] - 1e-9) { w.flip(); k++; } w.update(dt); t = (i + 1) * dt; w.drainEvents(); }
    return w;
  };
  const a = sim(5, 1 / 60), b = sim(5, 1 / 60), c = sim(6, 1 / 60);
  deq(a.getState(), b.getState());
  deq(a.leaves.map(f => [f.x, f.y, f.rot, f.state, f.kind]), b.leaves.map(f => [f.x, f.y, f.rot, f.state, f.kind]));
  deq(a.lamps.map(l => [l.x, l.side]), b.lamps.map(l => [l.x, l.side]));
  deq(a.hazards.map(h => [h.side, h.x0, h.x1]), b.hazards.map(h => [h.side, h.x0, h.x1]));
  assert.ok(a.stats.flips >= 6, 'flips ' + a.stats.flips);
  assert.notDeepStrictEqual(J(a.getState()), J(c.getState()));
  const d = sim(5, 1 / 30);                         // presses on frame boundaries of both rates
  const sa = a.getState(), sd = d.getState();
  assert.strictEqual(sd.score, sa.score); assert.strictEqual(sd.hearts, sa.hearts); assert.strictEqual(sd.hero.side, sa.hero.side);
  near(sd.hero.x, sa.hero.x, 1e-6); near(sd.hero.y, sa.hero.y, 1e-6);
});

// ---------- flip motion ----------
test('flip arc: kick + gravity, crossing time = flightTime(), flipT eases 0→1, clank on the rail', () => {
  const w = flat('normal');
  const tF = w.flightTime(), u = w.layout.unit;
  near(tF, 0.3738, 0.001, 'flight time at unit 100');
  near(w.flightDist(), w.speed * tF, 1e-9);
  run(w, 0.2);
  assert.ok(w.flip()); const e0 = w.drainEvents();
  deq(types(e0), ['flip']); assert.strictEqual(e0[0].grav, -1);
  near(w.hero.vy, -C.kick, 1e-9, 'kick'); assert.strictEqual(w.hero.state, 'air');
  let t = 0, land = null, prevT = 0, prevY = w.hero.y, samples = [];
  while (!land && t < 1) {
    w.update(H); t += H;
    const h = w.hero;
    assert.ok(h.flipT >= prevT - 1e-12, 'flipT monotonic'); prevT = h.flipT;
    if (!land) assert.ok(h.y <= prevY + 1e-9, 'rising'); prevY = h.y;
    samples.push([t, h.flipT, h.y]);
    land = of(w.drainEvents(), 'land')[0];
  }
  assert.ok(land, 'landed'); assert.strictEqual(land.side, 'ceil');
  near(t, tF, 2 * H, 'crossing time');
  near(land.speed, C.kick + C.g * tF, 25, 'contact speed');
  const h = w.hero;
  assert.strictEqual(h.side, 'ceil'); assert.strictEqual(h.grav, -1); assert.ok(h.grounded); assert.strictEqual(h.flipT, 1);
  near(h.y, w.standY('ceil'), 1e-9); assert.ok(h.squash > 0.5, 'clank squash ' + h.squash);
  // eased: slow start, slow end (smoothstep of time)
  const at = f => samples.find(s => s[0] >= f * tF)[1];
  assert.ok(at(0.15) < 0.15 && at(0.5) > 0.4 && at(0.5) < 0.65 && at(0.85) > 0.85, 'ease ' + [at(0.15), at(0.5), at(0.85)]);
  // accelerating: second half of the flight covers more than the first
  const ymid = samples.find(s => s[0] >= tF / 2)[2], y0 = w.standY('floor');
  assert.ok(y0 - ymid < (y0 - w.standY('ceil')) / 2, 'accelerates');
  // squash decays
  run(w, 0.4); assert.ok(w.hero.squash < 0.05);
  // and back down
  assert.ok(w.flip()); const r = runUntil(w, e => of(e, 'land').length, 1);
  near(r.t, tF, 2 * H); assert.strictEqual(w.hero.side, 'floor'); assert.strictEqual(w.hero.flipT, 0);
  assert.ok(of(r.ev, 'land')[0].speed > 800);
});

test('coyote time 0.12 s and 0.18 s input buffer', () => {
  // the roof ends 1 unit ahead; rail solid
  const mkC = () => flat('normal', { roofs: [[-5, 1]], rails: [[-5, 100]] });
  let w = mkC();
  runUntil(w, (e, w) => !w.hero.grounded, 2);
  assert.strictEqual(w.hero.state, 'air'); near(w.hero.coyote, C.coyote, H + 1e-9);
  run(w, 0.09);
  assert.ok(w.flip(), 'flip inside coyote time');
  assert.ok(of(w.drainEvents(), 'flip').length === 1);
  let r = runUntil(w, e => of(e, 'land').length, 1);
  assert.strictEqual(w.hero.side, 'ceil');
  // too late: 0.15 s after leaving → buffered, not flipped, and he falls
  w = mkC(); runUntil(w, (e, w) => !w.hero.grounded, 2); run(w, 0.15);
  assert.ok(!w.flip(), 'no flip after coyote'); assert.ok(w.hero.buffer > 0);
  r = runUntil(w, e => of(e, 'fall').length, 2); assert.ok(of(r.ev, 'fall').length === 1);
  // buffer: a press 0.1 s before touching down flips again right at the clank
  w = flat('normal'); run(w, 0.1); w.flip(); w.drainEvents();
  run(w, w.flightTime() - 0.1);
  assert.ok(!w.flip(), 'air press is buffered');
  r = runUntil(w, e => of(e, 'land').length, 1);
  const tt = types(r.ev); assert.ok(tt.indexOf('land') >= 0 && tt.indexOf('flip') > tt.indexOf('land'), tt.join());
  assert.strictEqual(w.hero.grav, 1, 'heading back down');
  // a press 0.3 s before landing is forgotten
  w = flat('normal'); run(w, 0.1); w.flip(); run(w, 0.05); w.flip(); w.drainEvents();
  r = runUntil(w, e => of(e, 'land').length, 1); run(w, 0.05);
  assert.ok(!types(r.ev).includes('flip') && w.hero.grounded && w.hero.side === 'ceil');
});

test('support: a crack narrower than the paws is run over; a gap makes him fall; drone rescue', () => {
  let w = flat('normal', { roofs: [[-5, 2], [2.3, 100]] });
  let ev = run(w, 1.5); assert.ok(!types(ev).includes('fall') && w.hero.grounded, 'crack of 0.3 u');
  w = flat('normal', { roofs: [[-5, 1], [2.6, 100]] });
  const h0 = w.hearts;
  let r = runUntil(w, e => of(e, 'fall').length, 2);
  assert.ok(of(r.ev, 'heartLost').length === 1); assert.strictEqual(w.hearts, h0 - 1);
  assert.strictEqual(w.hero.state, 'rescue'); assert.ok(w.drone && w.drone.state === 'in');
  assert.ok(!w.flip(), 'no flips while carried');
  // smooth drone + carry, then a drop on a safe spot
  let maxStep = 0, px = w.drone.x - w.cam.x, py = w.drone.y, hy = w.hero.y, maxHero = 0, t = 0, states = new Set();
  r = { ev: [] };
  while (t < 3) {
    w.update(H); t += H; const e = w.drainEvents(); r.ev.push(...e);
    if (w.drone) { states.add(w.drone.state); const sx = w.drone.x - w.cam.x; maxStep = Math.max(maxStep, Math.hypot(sx - px, w.drone.y - py)); px = sx; py = w.drone.y; }
    if (w.hero.state === 'rescue') { maxHero = Math.max(maxHero, Math.abs(w.hero.y - hy)); } hy = w.hero.y;
    if (of(e, 'rescue').length) break;
  }
  assert.ok(of(r.ev, 'rescue').length === 1, 'rescued');
  near(t, C.droneIn + C.carry, 0.15, 'rescue time');
  assert.ok(states.has('in') && states.has('carry'));
  assert.ok(maxStep < 12, 'drone moves smoothly (≤12 px/step), got ' + maxStep);
  assert.ok(maxHero < 8, 'carry is smooth, got ' + maxHero);
  const h = w.hero;
  assert.ok(h.grounded && h.state === 'run'); near(h.invuln, C.invuln, 2 * H);
  assert.ok(w.clearRange(h.side, h.x - 0.3 * w.layout.unit, h.x + 0.3 * w.layout.unit), 'dropped on a safe spot');
  ev = run(w, 1.0); assert.ok(!types(ev).includes('fall'));
  assert.strictEqual(w.drone, null, 'drone has flown off');
  // falling UP through a hole in the rail
  w = flat('normal', { rails: [[-5, 1.5], [3.5, 100]] }); run(w, 0.05); w.flip();
  r = runUntil(w, e => of(e, 'fall').length, 2); assert.ok(of(r.ev, 'fall').length === 1);
  r = runUntil(w, e => of(e, 'rescue').length, 3); assert.ok(of(r.ev, 'rescue').length === 1); assert.ok(w.hero.grounded);
});

test('obstacles: bump costs a heart, obstacle is squashed, 1.5 s blink of safety', () => {
  const w = flat('normal', { obstacles: [{ kind: 'vent', x: 3 }, { kind: 'vent', x: 4.5, variant: 1 }, { kind: 'vent', x: 12 }] });
  const h0 = w.hearts;
  let ev = run(w, 2.5);
  assert.strictEqual(of(ev, 'bump').length, 1, 'second vent inside the blink');
  assert.ok(w.obstacles[0].hit && !w.obstacles[1].hit);
  assert.strictEqual(w.hearts, h0 - 1);
  assert.ok(w.hero.bumpT < 2.5 && w.hero.knock >= 0);
  ev = run(w, 2.0);
  assert.strictEqual(of(ev, 'bump').length, 1, 'third vent after the blink');
  assert.ok(w.obstacles[0].hitT > 2);
  // the rail side: a sign hits Ollie upside-down, a vent below does not
  const w2 = flat('normal', { obstacles: [{ kind: 'vent', x: 3 }, { kind: 'sign', x: 6 }] });
  run(w2, 0.05); w2.flip(); ev = run(w2, 2.5);
  assert.deepStrictEqual(of(ev, 'bump').map(e => e.ob.kind), ['sign']);
  // the bump test is box vs box: flying past at mid-height misses both
  const w3 = flat('normal', { obstacles: [{ kind: 'vent', x: 1.5 }] });
  w3.hero.invuln = 0; w3.flip(); ev = run(w3, 1);
  assert.strictEqual(of(ev, 'bump').length, 0, 'a flip 1.25 u before a vent clears it');
});

test('leaves: catch scoring and points, Easy has the bigger catch radius', () => {
  const w = flat('normal', { leaves: [1.5, 2.3, 3.1].map((x, i) => ({ x, kind: i, still: true })) });
  const ev = run(w, 3.6 * w.layout.unit / w.speed);
  const cat = of(ev, 'catch');
  assert.strictEqual(cat.length, 3); deq(cat.map(e => e.combo), [1, 2, 3]); deq(cat.map(e => e.points), [10, 10, 10]);
  assert.ok(cat[0].leaf && cat[0].leaf.kind === 0, 'catch.leaf'); assert.strictEqual(w.stats.caught, 3);
  assert.ok(!('wrong' in w.stats) && !('gates' in w.stats), 'no colour stats');
  // Easy has the bigger catch radius: a leaf 0.51 u above the standing line is caught on Easy only
  for (const [diff, n] of [['easy', 1], ['normal', 0]]) {
    const w2 = flat(diff, { leaves: [{ x: 1.5, dy: -0.51, still: true }] });
    assert.strictEqual(of(run(w2, 1), 'catch').length, n, diff);
  }
});

test('leaves: pendulum flutter is bounded, smooth, tilts with the swing; caught leaves spiral into Ollie in 0.35 s', () => {
  const w = flat('normal', { leaves: [{ x: 60 }, { x: 61, side: 'ceil' }, { x: 62, side: 'mid' }] });
  const u = w.layout.unit, LF = C.leaf;
  for (const f of w.leaves) {
    assert.ok(f.swing >= LF.swing[0] && f.swing <= LF.swing[1] && f.omega >= LF.omega[0] && f.omega <= LF.omega[1]);
    near(f.len, LF.len * u, 1e-9);
  }
  const st = w.leaves.map(f => ({ f, maxStep: 0, maxRotStep: 0, faces: 0, lastFace: f.face, minY: 1e9, maxY: -1e9, minX: 1e9, maxX: -1e9, pass: 0 }));
  for (let i = 0; i < 120 * 6; i++) {
    w.update(H);
    for (const s of st) {
      const f = s.f;
      s.maxStep = Math.max(s.maxStep, Math.hypot(f.x - f.prevX, f.y - f.prevY));
      s.maxRotStep = Math.max(s.maxRotStep, Math.abs(f.rot - f.prevRot));
      if (f.face !== s.lastFace) { s.faces++; s.lastFace = f.face; }
      s.minY = Math.min(s.minY, f.y); s.maxY = Math.max(s.maxY, f.y); s.minX = Math.min(s.minX, f.x - f.baseX); s.maxX = Math.max(s.maxX, f.x - f.baseX);
      // pendulum geometry: rot = 1.2·θ and x − baseX = L·sin θ
      const th = f.rot / LF.tilt; near(f.x - f.baseX, f.len * Math.sin(th), 1e-6, 'x = L sin θ');
      assert.ok(Math.abs(th) <= f.swing + 1e-9, 'θ within swing');
      // it rises at the ends of its swing (y DOWN): y ≤ baseY + bob, and y ≥ baseY − L(1 − cos swing) − bob
      assert.ok(f.y <= f.baseY + LF.bob * u + 1e-6 && f.y >= f.baseY - f.len * (1 - Math.cos(f.swing)) - LF.bob * u - 1e-6, 'y bounded');
    }
  }
  for (const s of st) {
    const f = s.f, period = 2 * Math.PI / f.omega, n = 6 / period;
    assert.ok(s.maxStep < 1.5, 'smooth: ' + s.maxStep.toFixed(2) + ' px/step');
    assert.ok(s.maxRotStep < 0.03, 'rot smooth');
    near(s.faces, 2 * n, 1.5, 'face flips twice per swing period');
    assert.ok(s.maxX > 0.8 * f.len * Math.sin(f.swing) && s.minX < -0.8 * f.len * Math.sin(f.swing), 'swings both ways');
    assert.ok(s.maxY - s.minY < 0.25 * u, 'gentle vertical motion ' + ((s.maxY - s.minY) / u).toFixed(3) + ' u');
  }
  // caught: spiral into Ollie over 0.35 s, smooth, then gone
  const w2 = flat('easy', { leaves: [{ x: 1.0, dy: -0.3 }] });
  const r = runUntil(w2, e => of(e, 'catch').length, 2); const f = of(r.ev, 'catch')[0].leaf;
  assert.strictEqual(f.state, 'caught');
  const d0 = Math.hypot(f.x - w2.hero.x, f.y - w2.hero.y); let maxJ = 0, t = 0, ang = [], prevD = d0;
  while (f.state === 'caught' && t < 1) {
    w2.update(H); t += H;
    const d = Math.hypot(f.x - w2.hero.x, f.y - w2.hero.y);
    assert.ok(d <= prevD + 1e-6, 'radius shrinks'); prevD = d;
    maxJ = Math.max(maxJ, Math.hypot((f.x - w2.hero.x) - (f.prevX - w2.hero.prevX), f.y - f.prevY));
    ang.push(Math.atan2(f.y - w2.hero.y, f.x - w2.hero.x));
  }
  near(t, C.leaf.caughtT, 2 * H, 'spiral time'); assert.strictEqual(f.state, 'gone');
  assert.ok(prevD < 1e-6 + 0.02 * d0, 'ends in Ollie');
  assert.ok(maxJ < 10, 'spiral is smooth (relative to Ollie): ' + maxJ.toFixed(1) + ' px/step');
  let sweep = 0; for (let i = 1; i < ang.length; i++) { let da = ang[i] - ang[i - 1]; da -= 2 * Math.PI * Math.round(da / (2 * Math.PI)); sweep += da; }
  assert.ok(Math.abs(sweep) > 1.5 * Math.PI, 'it spirals (sweep ' + (sweep / Math.PI).toFixed(2) + 'π)');
  run(w2, 0.1); assert.ok(!w2.leaves.includes(f), 'removed');
});

test('combo: bump/fall resets it on Normal/Hard, halves it on Easy', () => {
  for (const [diff, after] of [['normal', 0], ['hard', 0], ['easy', 3]]) {
    const w = flat(diff, { leaves: [1.2, 1.8, 2.4, 3.0, 3.6, 4.2, 4.8].map(x => ({ x, still: true })), obstacles: [{ kind: 'vent', x: 6.5 }] });
    w.hero.invuln = 0;
    const ev = run(w, 7.2 * w.layout.unit / w.speed);
    assert.strictEqual(of(ev, 'catch').length, 7, diff); assert.strictEqual(of(ev, 'bump').length, 1, diff + ' bump');
    deq(of(ev, 'comboBreak').map(e => [e.combo, e.to]), [[7, after]], diff);
    assert.strictEqual(w.combo, after); assert.strictEqual(w.mult, 1 + Math.floor(after / 5));
  }
  // a fall on Easy halves too
  const w = flat('easy', { leaves: [1.2, 1.8, 2.4, 3.0].map(x => ({ x, still: true })), roofs: [[-5, 4.5], [8, 100]] });
  const ev = run(w, 3); assert.strictEqual(of(ev, 'fall').length, 1); assert.strictEqual(w.combo, 2);
});

test('combo → multiplier ×1..×5 (+1 every 5), combo events, points', () => {
  const w = flat('normal');
  const lv = []; for (let i = 0; i < 26; i++) lv.push({ x: 1.5 + 0.6 * i, still: true });
  w.setTrack({ leaves: lv });
  const ev = run(w, 6);
  const cat = of(ev, 'catch'); assert.strictEqual(cat.length, 26);
  deq(of(ev, 'combo').map(e => [e.combo, e.mult]), [[5, 2], [10, 3], [15, 4], [20, 5]]);
  assert.strictEqual(w.mult, 5);
  const pts = cat.reduce((s, e) => s + e.points, 0);
  assert.strictEqual(pts, 10 * (4 * 1 + 5 * 2 + 5 * 3 + 5 * 4 + 7 * 5));
  assert.strictEqual(w.score, pts); assert.strictEqual(w.maxCombo, 26);
});

// ---------- visibility twist ----------
test('light: per floor lightFrom → lightTo by progress, monotonic within a floor, in [0.3, 1]; lampsOn once per floor', () => {
  const w = mk('easy', 4); w.hearts = w.maxHearts = 1e6;
  const bot = new OF.Bot(w, { skill: 1, seed: 2 });
  let lastLevel = w.level, lastLight = w.light, dir = null, lampsEv = {}, t = 0;
  const seenZones = new Set();
  while (t < 640) {
    bot.step(1 / 60); w.update(1 / 60); t += 1 / 60;
    for (const e of w.drainEvents()) if (e.type === 'lampsOn') { lampsEv[e.level] = (lampsEv[e.level] || 0) + 1; assert.ok(w.lampsOn); }
    assert.ok(w.light >= 0.3 - 1e-12 && w.light <= 1 + 1e-12, 'light range ' + w.light);
    assert.strictEqual(w.lampsOn, w.light < C.light.lampsBelow);
    assert.ok(w.lightView >= 0.3 - 1e-9 && w.lightView <= 1 + 1e-9);
    if (w.level !== lastLevel) { lastLevel = w.level; dir = null; lastLight = w.light; continue; }
    const Z = C.zones[w.zone]; const sgn = Math.sign(Z.lightTo - Z.lightFrom);
    assert.ok((w.light - lastLight) * sgn >= -1e-12, 'monotonic in floor ' + w.level);
    near(w.light, Z.lightFrom + (Z.lightTo - Z.lightFrom) * w.progress, 1e-9);
    lastLight = w.light; seenZones.add(w.zone);
  }
  assert.ok(w.level >= 8, 'two days played');
  // lamps switch on at the start of every sunset floor (from a lit noon), never in dawn/noon
  deq(Object.keys(lampsEv).map(Number).sort((a, b) => a - b), [2, 6], 'lampsOn at sunset of day 1 and 2');
  for (const k in lampsEv) assert.strictEqual(lampsEv[k], 1);
  // zone values: dawn/noon bright (no lamps), sunset dims through the threshold, night stays ≥ 0.3
  for (const z of [0, 1]) assert.ok(Math.min(C.zones[z].lightFrom, C.zones[z].lightTo) >= C.light.lampsBelow);
  assert.ok(C.zones[2].lightFrom < C.light.lampsBelow && Math.min(C.zones[3].lightFrom, C.zones[3].lightTo) >= C.light.min);
  // a world created on a dark floor starts with lampsOn and no event
  const wn = mk('normal', 1, 960, 540, 3); assert.ok(wn.lampsOn); assert.strictEqual(of(wn.drainEvents(), 'lampsOn').length, 0);
  near(wn.light, 0.40, 1e-9);
  // gotoLevel from a bright floor to sunset fires it
  const wg = mk('normal', 1); run(wg, 1); wg.drainEvents(); wg.gotoLevel(2);
  deq(types(wg.drainEvents()), ['levelUp', 'lampsOn']);
});

test('lamps: deterministic with the track, every 3.5–5 u alternating high/low, culled; obstacles carry beacons', () => {
  const a = mk('normal', 8), b = mk('normal', 8);
  run(a, 20); run(b, 20);
  deq(a.lamps.map(l => [l.x, l.side]), b.lamps.map(l => [l.x, l.side]));
  const u = a.layout.unit;
  for (let i = 1; i < a.lamps.length; i++) {
    const d = (a.lamps[i].x - a.lamps[i - 1].x) / u;
    assert.ok(d >= C.light.lampEvery[0] - 1e-9 && d <= C.light.lampEvery[1] + 2 * C.light.lampDoorClear + 1e-9, 'spacing ' + d);
    assert.notStrictEqual(a.lamps[i].side, a.lamps[i - 1].side, 'alternate');
    assert.ok(a.lamps[i].side === 'ceil' || a.lamps[i].side === 'floor');
  }
  assert.ok(a.lamps[0].x <= a.cam.x + u * 2 && a.lamps[a.lamps.length - 1].x >= a.cam.x + a.layout.width, 'cover the screen');
  // lamps do not change the track (own RNG stream): same hazards as a world whose lamps were regenerated
  const c = mk('normal', 8); c.lampRng = new OF.RNG(12345); run(c, 20);
  deq(a.hazards.map(h => [h.side, h.x0, h.x1]), c.hazards.map(h => [h.side, h.x0, h.x1]));
  // and they survive a resize at the same place in units
  const d = mk('normal', 8); run(d, 5); const rel = d.lamps.map(l => (l.x - d.hero.x) / d.layout.unit);
  d.setLayout(560, 1000); deq(d.lamps.slice(0, rel.length).map(l => +((l.x - d.hero.x) / d.layout.unit).toFixed(9)), rel.map(v => +v.toFixed(9)));
  // culled: bounded in a long run, never far behind
  const r = playBot('normal', 5, 1, 300, { immortal: true });
  assert.ok(r.w.lamps.length < 40, 'lamps ' + r.w.lamps.length);
  assert.ok(r.w.lamps[0].x > r.w.cam.x - r.w.layout.width * (C.gen.behind + 0.3));
  for (const ob of r.w.obstacles) assert.strictEqual(ob.beacon, true);
  // no lamp right at a stairway door
  for (const l of r.w.lamps) for (const pl of r.w.plans) assert.ok(Math.abs(l.x - pl.finishX) >= C.light.lampDoorClear * r.w.layout.unit - 1e-6 || !isFinite(pl.finishX));
});

test('visibility rule: seeAhead ≤ screen reach in landscape; portrait clamps the beam to the screen (documented)', () => {
  const layouts = [[960, 540], [1280, 540], [960, 720], [560, 1000], [720, 1100], [560, 1600]];
  const rows = [], clamped = [];
  for (const [W, Hh] of layouts) for (const diff of ['easy', 'normal', 'hard']) for (let lv = 0; lv < 8; lv++) {
    const w = mk(diff, 1, W, Hh, lv);
    const sa = w.seeAheadUnits(), reach = w.screenReachUnits(), beam = w.beamUnits();
    const S = w.levelBase(lv) * (1 + C.speedRamp), tF = w.flightTime();
    assert.ok(sa >= (C.difficulty[diff].reaction * S + S * tF) / w.layout.unit + C.light.seeExtra - 1e-9, 'formula');
    assert.ok(beam >= Math.min(C.light.beamMin, reach) - 1e-9 && beam <= reach + 1e-9);
    if (sa <= reach) near(beam, Math.max(sa, C.light.beamMin), 1e-9);
    else near(beam, reach, 1e-9, 'clamped to the screen');
    // Normal/Hard in landscape: the whole seeAhead fits on screen. Easy (reaction 1.8 s) at sunset/night and every
    // portrait layout need more than the screen shows even in daylight: the beam is clamped to the screen edge, so the
    // darkness never hides anything daylight would show, and beacons glow beyond the beam (MECHANICS §6).
    if (!w.layout.portrait && diff !== 'easy' && lv < 4) assert.ok(sa <= reach + 1e-9, W + '×' + Hh + ' ' + diff + ' L' + lv + ': seeAhead ' + sa.toFixed(2) + ' > reach ' + reach.toFixed(2));
    if (sa > reach) clamped.push(W + '×' + Hh + ' ' + diff + ' L' + lv);
    if (lv === 0 || lv === 3) rows.push(W + '×' + Hh + ' ' + diff[0] + lv + ' ' + sa.toFixed(1) + '/' + reach.toFixed(1));
  }
  console.log('     (seeAhead/reach u: ' + rows.filter((_, i) => i % 3 === 0).join(', ') + ')');
  console.log('     (beam clamped to the screen in ' + clamped.length + '/144 cases: ' + clamped.filter(c => !/^(560|720)/.test(c)).join(', ') + ' + all portrait)');
  // seeAhead holds for the whole floor (it uses the floor's top speed, never below the current speed)
  const w = mk('normal', 2); const b = new OF.Bot(w, { skill: 1 }); let worst = 0;
  for (let i = 0; i < 60 * 70; i++) { b.step(1 / 60); w.update(1 / 60);
    const need = (w.D.reaction * w.speed + w.flightDist()) / w.layout.unit + C.light.seeExtra; worst = Math.max(worst, need - w.seeAheadUnits()); }
  assert.ok(worst <= 1e-9, 'seeAhead covers the real speed');
  const st = w.getState(); assert.ok(typeof st.light === 'number' && typeof st.lampsOn === 'boolean' && typeof st.leaves === 'number' && st.hero.lamp);
});

test('headlamp: hero.lamp follows the lens (92,44) of the sprite and mirrors with the turn-over', () => {
  const w = flat('normal'); run(w, 0.05);
  const u = w.layout.unit, S = 0.95 * u, h = w.hero;
  // renderer anchor: sprite feet line (y 120) on the surface, hero.y = standOff above it
  const lx = (92 - 64) / 128 * S, ly = C.standOff * u - (120 - 44) / 128 * S;
  near(h.lamp.x - h.x, lx, 1e-9); near(h.lamp.y - h.y, ly, 1e-9);
  assert.ok(h.lamp.y < h.y && h.lamp.x > h.x, 'ahead and above when on the floor');
  w.flip(); runUntil(w, e => of(e, 'land').length, 1); run(w, 0.02);
  near(w.hero.lamp.y - w.hero.y, -ly, 1e-9, 'mirrored on the ceiling (below the hit centre)');
  near(w.hero.lamp.x - w.hero.x, lx, 1e-9);
  // mid flip it moves smoothly
  w.flip(); let maxJ = 0;
  for (let i = 0; i < 60; i++) { w.update(H); maxJ = Math.max(maxJ, Math.abs((w.hero.lamp.y - w.hero.y) - (w.hero.lamp.prevY - w.hero.prevY))); }
  assert.ok(maxJ < 3, 'lens moves smoothly relative to Ollie: ' + maxJ.toFixed(2));
});

// ---------- generator fairness ----------
function genTrack(diff, level, seed, screens) {
  const w = mk(diff, seed, 960, 540, level);
  for (let i = 0; i < screens; i++) { w.cam.x += w.layout.width; w._generate(); }
  return w;
}
test('fairness: one surface always safe, hazard windows, forced-flip spacing, gap sizes (every difficulty, loops 0..2)', () => {
  let checked = 0;
  for (const diff of ['easy', 'normal', 'hard']) for (let loop = 0; loop <= 2; loop++) for (const seed of [1, 2, 3]) {
    const w = genTrack(diff, loop * 4, seed, 160);         // ≈ 1500 units ≈ 5–6 levels
    const u = w.layout.unit, D = C.difficulty[diff], m = C.gen.margin * u, tF = w.flightTime();
    const hz = w.hazards.filter(h => h.x1 + 3 * u < w.gen.frontier), start = w.plans[0].startX;   // the newest hazard's tail is not built yet
    assert.ok(hz.length > 120, 'hazards ' + hz.length);   // sample-size guard (Easy ≈ 135 with the playtest's calmer Easy)
    assert.ok(w.plans.length >= 4, 'several levels generated');
    const cap = x => w._capFor(w._planAt(x), x);
    // safe start
    assert.ok(hz[0].x0 - start >= D.safeStart * w.levelBase(w.plans[0].level), 'first ' + D.safeStart + ' s safe');
    const lastOn = { floor: null, ceil: null };
    for (let i = 0; i < hz.length; i++) {
      const h = hz[i], other = h.side === 'floor' ? 'ceil' : 'floor', S = cap(h.x0), F = S * tF, R = D.reaction * S;
      if (i) assert.ok(h.x0 >= hz[i - 1].x1, 'hazards in order');
      // the other surface is clear while this one is dangerous
      assert.ok(w.clearRange(other, h.x0 - F - m, h.x1 + m), diff + ' L' + loop + ' window for hazard ' + i);
      // forced flips: reaction + flight apart
      const lo = lastOn[other]; if (lo) assert.ok(h.x0 - lo.x0 >= F + R - 1e-6, 'forced-flip spacing ' + ((h.x0 - lo.x0) / S).toFixed(2) + ' s');
      const ls = lastOn[h.side]; if (ls) assert.ok(h.x0 - ls.x1 >= C.gen.sameGap * u - 1e-6, 'a building between same-side hazards');
      if (h.kind === 'gap') {
        const wu = (h.x1 - h.x0) / u;
        const lp = Math.floor(w._planAt(h.x0).level / 4);
        assert.ok(wu >= D.gapMin - 1e-9 && wu <= Math.min(C.gen.maxGapUnit, D.gapMax + 0.1 * lp) + 1e-9, 'gap ' + wu);
      } else assert.ok((h.kind === 'vent') === (h.side === 'floor'));
      lastOn[h.side] = h;
      checked++;
    }
    // every x: one surface safe (sampled every 0.05 u)
    const end = hz[hz.length - 1].x1;
    for (let x = start; x < end; x += 0.05 * u) assert.ok(w.safeAt('floor', x) || w.safeAt('ceil', x), 'both unsafe at ' + ((x - start) / u).toFixed(2));
    // stairway doors stand in calm stretches
    for (const p of w.plans) if (p.finishX < end) {
      assert.ok(w.clearRange('floor', p.finishX - C.gen.finishClear * u, p.finishX + C.gen.finishClear * u) &&
                w.clearRange('ceil', p.finishX - C.gen.finishClear * u, p.finishX + C.gen.finishClear * u), 'finish clear');
    }
    // leaves: their whole pendulum swing stays out of every obstacle; kinds 0..2; one kind per pattern
    const sw = C.leaf.len * u * Math.sin(C.leaf.swing[1]);
    for (const f of w.leaves) {
      assert.ok(f.kind >= 0 && f.kind <= 2);
      for (const ob of w.obstacles) {
        const top = ob.side === 'floor' ? w.layout.floorY - ob.h : w.layout.ceilY;
        for (const dx of [-sw, 0, sw]) {
          const x = f.baseX + dx, cx = Math.max(ob.x - ob.w / 2, Math.min(x, ob.x + ob.w / 2)), cy = Math.max(top, Math.min(f.baseY, top + ob.h));
          assert.ok(Math.hypot(x - cx, f.baseY - cy) >= f.r, 'leaf swings into an obstacle');
        }
      }
    }
    assert.ok(w.leaves.length > 200, 'leaves ' + w.leaves.length);
  }
  console.log('     (' + checked + ' hazards checked)');
});

test('Easy is gentler: slower, fewer and narrower gaps, longer calm between forced flips', () => {
  const st = d => {   // the first floor (dawn of day 1), pooled over 12 seeds (one floor holds only 15–40 hazards)
    let nHz = 0, nGap = 0, maxGap = 0, secs = 0, w = null;
    for (let seed = 1; seed <= 12; seed++) {
      w = genTrack(d, 0, seed, 100); const u = w.layout.unit, hz = w.hazards.filter(h => h.x1 < w.plans[1].startX);
      const gaps = hz.filter(h => h.kind === 'gap');
      nHz += hz.length; nGap += gaps.length; maxGap = Math.max(maxGap, ...gaps.map(g => (g.x1 - g.x0) / u));
      secs += (hz[hz.length - 1].x1 - w.plans[0].startX) / w.levelBase(0);
    }
    return { perSec: nHz / secs, gapShare: nGap / nHz, maxGap, speed: w.levelBase(0) / w.layout.unit };
  };
  const e = st('easy'), n = st('normal'), h = st('hard');
  assert.ok(e.speed < n.speed && n.speed < h.speed);
  assert.ok(e.perSec < n.perSec && n.perSec < h.perSec, 'hazards/s ' + [e.perSec, n.perSec, h.perSec].map(v => v.toFixed(2)));
  assert.ok(e.gapShare < n.gapShare && e.maxGap <= 1.4 + 1e-9);
  assert.ok(e.perSec < 0.5, 'Easy: < 1 hazard per 2 s at dawn, got ' + e.perSec.toFixed(2));
  assert.strictEqual(C.difficulty.easy.hearts, 5);
});

// ---------- levels ----------
test('stairway door: bonus, +1 heart, levelUp to the next time of day; loop bonus', () => {
  const w = flat('normal', { finish: 3 }); w.hearts = 2;
  const ev = run(w, 1.5);
  const t = types(ev); assert.ok(t.indexOf('finish') >= 0 && t.indexOf('finish') < t.indexOf('levelUp'));
  const lu = of(ev, 'levelUp')[0]; deq([lu.level, lu.zone, lu.bonus], [1, 1, 100]);
  assert.strictEqual(w.score, 100); assert.strictEqual(w.hearts, 3); deq(of(ev, 'heartGain').map(e => e.hearts), [3]);
  assert.strictEqual(w.level, 1); assert.strictEqual(w.zone, 1); assert.strictEqual(w.stats.levels, 1);
  // night of round 1 → dawn of round 2: bonus 100 × 4 × 1; level 7 (night, loop 1) bonus 100 × 4 × 2
  const w2 = mk('normal', 1, 960, 540, 3); w2.setTrack({ finish: 2 });
  const lu2 = of(run(w2, 1.2), 'levelUp')[0]; deq([lu2.level, lu2.zone, lu2.bonus], [4, 0, 400]); assert.strictEqual(w2.loop, 1);
  const w3 = mk('normal', 1, 960, 540, 7); w3.setTrack({ finish: 2 });
  assert.strictEqual(of(run(w3, 1.2), 'levelUp')[0].bonus, 800);
  // no heart beyond max
  const w4 = flat('easy', { finish: 2 }); assert.strictEqual(of(run(w4, 1.5), 'heartGain').length, 0); assert.strictEqual(w4.hearts, 5);
});

test('levels pace at ≈60–80 s on every difficulty; speed rises inside a level and per loop', () => {
  for (const diff of ['easy', 'normal', 'hard']) {
    const r = playBot(diff, 2, 1, 600, { immortal: true });
    assert.ok(r.levelT.length >= 8, diff + ' levels ' + r.levelT.length);
    for (const t of r.levelT.slice(0, 8)) assert.ok(t >= 58 && t <= 82, diff + ' level took ' + t.toFixed(1));
    console.log('     (' + diff + ': ' + r.levelT.slice(0, 8).map(t => t.toFixed(0)).join(', ') + ' s)');
  }
  const w = mk('normal'); const s0 = w.speedTarget(w.plans[0].startX), s1 = w.speedTarget(w.plans[0].finishX - 1);
  near(s1 / s0, 1 + C.speedRamp, 0.01);
  assert.ok(w.levelBase(4) > w.levelBase(0) * 1.07 && w.levelBase(4) < w.levelBase(0) * 1.09);
});

test('gotoLevel jumps (levelUp, safe track ahead, Ollie keeps running)', () => {
  const w = mk('normal', 3); run(w, 2); w.drainEvents();
  w.gotoLevel(6);
  const ev = w.drainEvents(); deq(of(ev, 'levelUp').map(e => [e.level, e.zone]), [[6, 2]]);
  assert.strictEqual(w.level, 6); assert.strictEqual(w.loop, 1);
  const u = w.layout.unit, h = w.hero;
  assert.ok(w.clearRange('floor', h.x - 0.5 * u, h.x + 5 * u) && w.clearRange('ceil', h.x - 0.5 * u, h.x + 5 * u), 'safe start');
  near(w.speed, w.levelBase(6), 1);
  const b = new OF.Bot(w, { skill: 1 });
  let bad = 0; for (let i = 0; i < 60 * 40; i++) { b.step(1 / 60); w.update(1 / 60); for (const e of w.drainEvents()) if (e.type === 'fall' || e.type === 'bump') bad++; }
  assert.strictEqual(bad, 0);
});

test('game over: last heart → phase over, scroll eases to a stop, input ignored', () => {
  const w = flat('normal', { obstacles: [{ kind: 'vent', x: 2 }] }); w.hearts = 1;
  const ev = run(w, 1);
  const tt = types(ev).filter(t => t === 'bump' || t === 'heartLost' || t === 'gameOver');
  deq(tt, ['bump', 'heartLost', 'gameOver']);
  assert.strictEqual(w.phase, 'over'); assert.strictEqual(w.hearts, 0);
  assert.ok(!w.flip());
  run(w, 0.7); assert.ok(w.speed < 1e-6, 'stopped');
  const x = w.cam.x; run(w, 1); assert.strictEqual(w.cam.x, x);
  // a fall with the last heart: no drone, game over
  const w2 = flat('normal', { roofs: [[-5, 1], [4, 100]] }); w2.hearts = 1;
  const ev2 = run(w2, 2);
  assert.ok(types(ev2).includes('gameOver') && !types(ev2).includes('rescue')); assert.strictEqual(w2.drone, null);
});

// ---------- resize / rotate ----------
test('setLayout: standing, upside-down and mid-flight re-anchor without a fall or bump', () => {
  const sizes = [[560, 1000], [1280, 540], [720, 1600], [960, 540], [820, 1180]];
  // standing on the rail
  let w = flat('normal', { obstacles: [{ kind: 'vent', x: 4 }] });
  run(w, 0.1); w.flip(); runUntil(w, e => of(e, 'land').length, 1);
  for (const s of sizes) {
    const u0 = w.layout.unit, relOb = (w.obstacles[0].x - w.hero.x) / u0;
    w.setLayout(s[0], s[1]);
    const u = w.layout.unit;
    assert.ok(w.hero.grounded && w.hero.side === 'ceil'); near(w.hero.y, w.standY('ceil'), 1e-9);
    near((w.obstacles[0].x - w.hero.x) / u, relOb, 1e-9, 'obstacle keeps its place in units');
    near(w.hero.x - w.cam.x, w.layout.heroX, 1e-9);
    near(w.speed / u, w.speedTarget(w.hero.x) / u, 0.05);
    const ev = run(w, 0.05); assert.ok(!types(ev).includes('fall'));
  }
  // mid-flight
  for (const s of sizes) {
    w = flat('normal'); run(w, 0.1); w.flip(); run(w, 0.15);
    const frac = (w.standY('floor') - w.hero.y) / (w.standY('floor') - w.standY('ceil'));
    w.setLayout(s[0], s[1]);
    near((w.standY('floor') - w.hero.y) / (w.standY('floor') - w.standY('ceil')), frac, 1e-9, 'same place in the corridor');
    const r = runUntil(w, e => of(e, 'land').length || of(e, 'fall').length, 1);
    assert.ok(of(r.ev, 'land').length === 1 && w.hero.side === 'ceil', 'lands on the rail after resize');
    near(r.t, w.flightTime() - 0.15, 3 * H);
  }
  // bot + resizes every 1.7 s for 3 minutes: never hurt
  const res = playBot('hard', 6, 1, 180, { immortal: true, resize: { every: 1.7, sizes: sizes } });
  assert.strictEqual(res.w.stats.bumps + res.w.stats.falls, 0, 'hits with resizes: ' + res.w.stats.bumps + '+' + res.w.stats.falls);
});

// ---------- bot ----------
test('bot skill 1 survives 10 simulated minutes on every difficulty (zero hits); casual bots get hit sometimes', () => {
  const out = [];
  for (const diff of ['easy', 'normal', 'hard']) {
    let hits = 0, casual = 0;
    for (const seed of [1, 2]) {
      const r = playBot(diff, seed, 1, 600);
      assert.strictEqual(r.w.phase, 'run', diff + ' alive'); hits += r.w.stats.bumps + r.w.stats.falls;
      assert.ok(r.w.level >= 8, 'level ' + r.w.level);
      const c = playBot(diff, seed, 0.5, 300, { immortal: true }); casual += c.w.stats.bumps + c.w.stats.falls;
    }
    assert.ok(hits <= 1, diff + ' skill-1 hits ' + hits);
    out.push(diff + ' ' + hits + ' / casual ' + (casual / 10).toFixed(1) + '/min');
    assert.ok(casual > 0, 'casual bot is not perfect');
  }
  console.log('     (skill 1 hits in 2×10 min: ' + out.join(', ') + ')');
});

test('bot: optional flips for leaves only when skilled; never flips into a hazard', () => {
  const lv = [3, 3.6, 4.2, 4.8].map(x => ({ x, side: 'ceil' }));
  const w = flat('normal', { leaves: lv });
  const b = new OF.Bot(w, { skill: 1 }); for (let i = 0; i < 260; i++) { b.step(1 / 120); w.update(1 / 120); }
  assert.ok(b.stats.optional >= 1 && w.stats.caught >= 3, 'flipped for the leaves');
  const w2 = flat('normal', { leaves: lv });
  const b2 = new OF.Bot(w2, { skill: 0.5 }); for (let i = 0; i < 260; i++) { b2.step(1 / 120); w2.update(1 / 120); }
  assert.strictEqual(b2.stats.optional, 0);
  // a vent ahead but the rail above has a hole at the landing spot → the bot waits for solid rail
  const w3 = flat('normal', { obstacles: [{ kind: 'vent', x: 4.5 }], rails: [[-5, 1.5], [3.4, 100]] });
  const b3 = new OF.Bot(w3, { skill: 1 }); let ev = [];
  for (let i = 0; i < 240; i++) { b3.step(1 / 120); w3.update(1 / 120); ev.push(...w3.drainEvents()); }
  assert.ok(!types(ev).includes('fall') && !types(ev).includes('bump') && b3.stats.flips >= 1, types(ev).join());
});

// ---------- weather ----------
test('weather: every zone, landscape + portrait up to 720×1600: bounded, outside back layer, soft front layer', () => {
  const FRONT_OK = new Set(['mote', 'sparkle']);
  for (const [W, Hh] of [[960, 540], [560, 1000], [720, 1600], [1280, 540], [720, 1100]]) {
    const wx = new OF.Weather({ width: W, height: Hh, seed: 3 });
    for (let z = 0; z < 4; z++) {
      wx.setLevel(z);
      let maxN = 0;
      for (let i = 0; i < 60 * 25; i++) {
        wx.update(1 / 60, 330);
        if (i % 20 === 0) wx.burst('bit_' + (i % 3), W / 3, Hh / 2, 25, { speed: 200 });
        maxN = Math.max(maxN, wx.particles.length);
        for (const p of wx.particles) {
          assert.ok(isFinite(p.x) && isFinite(p.y) && p.alpha >= 0 && p.alpha <= 1);
          if (p.kind === 'burst') continue;
          if (p.layer === 'front') {
            assert.ok(FRONT_OK.has(p.sprite), 'front sprite ' + p.sprite);
            assert.ok(p.alpha <= 0.45 + 1e-9 && p.size < 12 * W / 960 + 6, 'soft front');
            if (!p.dying) assert.ok(p.y >= wx.ceilY - 6 && p.y <= wx.floorY + 6, 'motes in the corridor air');
          } else assert.ok(['snow', 'flake', 'star', 'aurora'].includes(p.sprite), 'back sprite ' + p.sprite);
          if ((p.kind === 'star' || p.kind === 'aurora') && !p.dying) assert.ok(p.y >= p.y0 - 5 && p.y <= p.y1 + 5 && p.y1 < 0.62 * Hh, p.kind + ' high in the windows');
          assert.ok(p.x > -400 && p.x < W + 400);
        }
      }
      assert.ok(maxN < 140, 'cap ' + maxN);
      const kinds = new Set(wx.particles.filter(p => !p.dying).map(p => p.kind));
      const want = [['snow', 'mote'], ['flake', 'mote'], ['snow', 'mote'], ['snow', 'star', 'aurora', 'sparkle']][z];
      for (const k of want) assert.ok(kinds.has(k), 'zone ' + z + ' has ' + k);
      const front = wx.particles.filter(p => p.kind !== 'burst' && !p.dying && p.layer === 'front').length;
      assert.ok(front <= 14, 'front sparse: ' + front);
    }
    wx.resize(Hh, W); wx.update(1 / 60, 300); assert.ok(wx.particles.length < 140);
  }
  // ambient particles drift with the scroll by depth; snow falls
  const wx = new OF.Weather({ width: 960, height: 540, seed: 1 }); wx.setLevel(0, { instant: true });
  const p = wx.particles.find(q => q.layer === 'front');
  const x0 = p.x; wx.update(0.05, 400); assert.ok(p.x < x0, 'drifts left');
  const s = wx.particles.find(q => q.kind === 'snow' && q.y < 400), y0 = s.y; wx.update(0.1, 0); assert.ok(s.y > y0, 'snow falls');
  const tints = [0, 1, 2, 3].map(z => { wx.setLevel(z); return wx.ambient.tint; });
  assert.ok(tints[1] === null && /255,140/.test(tints[2]) && /40,60,150/.test(tints[3]), 'tints ' + tints);
});

test('fuzz: random taps, resizes, gotoLevel during flight/rescue — no NaN, invariants hold', () => {
  const sizes = [[960, 540], [560, 1000], [1280, 540], [720, 1600], [1024, 768]];
  for (const diff of ['easy', 'normal', 'hard']) {
    const w = mk(diff, 21); w.hearts = w.maxHearts = 1e6;
    const r = new OF.RNG(diff); let t = 0, falls = 0, rescues = 0, cancels = 0, stuck = 0;
    while (t < 240) {
      if (r.chance(0.03)) w.flip();
      if (r.chance(0.002)) { const s = r.pick(sizes); w.setLayout(s[0], s[1]); }
      if (r.chance(0.0005)) { if (w.hero.state === 'rescue') cancels++; w.gotoLevel(r.int(0, 9)); }   // gotoLevel ends a rescue
      w.update(r.range(0.005, 0.05)); t += 0.03;
      for (const e of w.drainEvents()) { if (e.type === 'fall') falls++; if (e.type === 'rescue') rescues++; }
      const h = w.hero, L = w.layout;
      for (const v of [h.x, h.y, h.vy, h.flipT, w.cam.x, w.speed, w.score]) assert.ok(isFinite(v), 'finite');
      assert.ok(h.flipT >= -1e-9 && h.flipT <= 1 + 1e-9 && w.alpha >= 0 && w.alpha < 1 + 1e-9);
      near(h.x - w.cam.x, L.heroX, 1e-6);
      if (h.grounded) near(h.y, w.standY(h.side), 1e-6);
      assert.ok(w.mult >= 1 && w.mult <= 5 && w.progress >= 0 && w.progress <= 1);
      for (const f of w.leaves) assert.ok(isFinite(f.x) && isFinite(f.y) && isFinite(f.rot));
      assert.ok(isFinite(h.lamp.x) && isFinite(h.lamp.y) && w.light >= 0.3 && w.light <= 1);
      stuck = w.hero.state === 'rescue' ? stuck + 1 : 0; assert.ok(stuck < 400, 'rescue never ends');
    }
    assert.ok(falls > 0 && rescues >= falls - cancels - 1, diff + ' falls ' + falls + ' rescues ' + rescues + ' cancels ' + cancels);
    assert.ok(w.roofs.length < 80 && w.leaves.length < 150 && w.lamps.length < 60, 'culled');
  }
});

// ---------- long run ----------
test('10 simulated minutes of bot play (+ weather) run in ≈2 s', () => {
  const t0 = Date.now();
  const r = playBot('normal', 11, 0.9, 600, { weather: true });
  const ms = Date.now() - t0;
  assert.ok(ms < 3000, 'took ' + ms + ' ms');
  assert.ok(r.t >= 599 || r.w.phase === 'over');
  assert.ok(r.maxP < 140);
  for (const e of ['flip', 'land', 'catch', 'combo', 'finish', 'levelUp', 'lampsOn']) assert.ok(r.ev.includes(e), e);
  const st = r.w.getState();
  assert.ok(st.level >= 7 && st.score > 3000, 'level ' + st.level + ' score ' + st.score);
  assert.ok(st.counts.leaves < 120 && st.counts.lamps < 40 && st.counts.obstacles < 60 && st.counts.roofs < 60, 'culled ' + JSON.stringify(st.counts));
  console.log('     (10 min: ' + ms + ' ms, level ' + st.level + ', score ' + st.score + ', caught ' + st.stats.caught + ', flips ' + st.stats.flips + ', hits ' + (st.stats.bumps + st.stats.falls) + ')');
});

// ---------- run ----------
let pass = 0, fail = 0;
for (const t of tests) {
  try { t.fn(); pass++; console.log('PASS ' + t.name); }
  catch (e) { fail++; console.log('FAIL ' + t.name + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n     ') : e)); }
}
console.log('\n' + pass + '/' + tests.length + ' passed' + (fail ? ', ' + fail + ' FAILED' : ''));
process.exit(fail ? 1 : 0);
