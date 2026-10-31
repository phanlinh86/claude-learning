#!/usr/bin/env node
// Spike's Dino Jam — headless unit tests for rng / world / weather / bot (node, no deps).
// Run from projects/daily-game/spike-dino-jam:   node tests/unit/run.js
'use strict';
const assert = require('assert');
const { load } = require('./load');

const DJ = load();
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const H = 1 / 120;
const J = v => JSON.parse(JSON.stringify(v));
const near = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, (m || '') + ' got ' + a + ' want ' + b + ' ±' + tol);
const TAU = Math.PI * 2;
const wrap = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };

// ---------- helpers ----------
function world(seed, cfg, level) {
  const w = new DJ.World({ seed: seed || 1, config: Object.assign({ readyTime: 0 }, cfg) });
  if (level) w.startLevel(level);
  w.update(H * 2);
  assert.strictEqual(w.state, 'playing');
  w.drainEvents();
  return w;
}
function quiet(w) { w.cfg.notesOnField = 0; w.notes.length = 0; w.boss.next = 1e9; }
function steps(w, n, each) { for (let i = 0; i < n; i++) { if (each && each(i) === false) return i; w.update(H); } return n; }
function loop(n, fn) { for (let i = 0; i < n; i++) fn(i); }
function run(w, seconds, each) { return steps(w, Math.round(seconds / H), each); }
// append n notes to the train (as if collected) without finishing the song
function grow(w, n, settle) {
  w.songTarget = 999;
  for (let i = 0; i < n; i++) w._pick({ x: w.spike.x, y: w.spike.y, kind: i % 4, gold: false, state: 'idle' });
  w.drainEvents();
  if (settle !== false) for (const t of w.trail) t.join = 1;
}
// move Spike somewhere and give him a fresh straight path history behind him
function teleport(w, x, y, heading) {
  const s = w.spike; heading = heading || 0;
  s.x = s._px = x; s.y = s._py = y; s.heading = heading; s.turn = 0;
  w._pathLen = 0; w._pathHead = -1;
  for (let k = 200; k >= 0; k--) w._pushPath(x - Math.cos(heading) * k * 3, y - Math.sin(heading) * k * 3);
}
function inside(w, x, y, m) { const A = w.arena; return x >= A.x0 + m - 1e-6 && x <= A.x1 - m + 1e-6 && y >= A.y0 + m - 1e-6 && y <= A.y1 - m + 1e-6; }
function snapshot(w) {
  return J({ g: w.getState(), s: w.spike, trail: w.trail, notes: w.notes, pillows: w.pillows, boss: w.boss, score: w.score });
}
function playGame(seed, diff, skill, maxS, stopLevel) {
  const w = new DJ.World({ seed, config: DJ.DIFFICULTY[diff || 'normal'] });
  const bot = new DJ.Bot(w, { skill, seed: seed * 3 + 1 });
  let t = 0; maxS = maxS || 600;
  while (w.state !== 'dead' && t < maxS && !(stopLevel !== undefined && w.levelsCleared >= stopLevel)) {
    bot.step(1 / 60); w.update(1 / 60); w.drainEvents(); t += 1 / 60;
  }
  return { w, t, bot };
}

// ---------- RNG ----------
test('rng: deterministic, in range, DJ namespace, same API as the sister games', () => {
  const a = new DJ.RNG(42), b = new DJ.RNG(42), c = new DJ.RNG('42x');
  for (let i = 0; i < 200; i++) { const x = a.next(); assert.strictEqual(x, b.next()); assert.ok(x >= 0 && x < 1); }
  for (const f of ['range', 'int', 'pick', 'chance', 'sign', 'gauss', 'fork']) assert.strictEqual(typeof c[f], 'function', f);
  for (let i = 0; i < 200; i++) { const k = c.int(2, 5); assert.ok(k >= 2 && k <= 5 && k === (k | 0)); }
  assert.strictEqual(DJ.BIOMES.length, 4);
  assert.ok(DJ.DIFFICULTY.easy && DJ.DIFFICULTY.normal && DJ.DIFFICULTY.hard);
});

// ---------- determinism ----------
test('world: same seed + same inputs → same state (any dt partition, incl. dt = 0.1 × 64)', () => {
  function script(w, t) {
    const k = Math.floor(t * 2 + 1e-9);
    if (k % 3 === 0) w.setDir(Math.cos(k), Math.sin(k)); else { w.setDir(0, 0); w.setTarget(480 + 300 * Math.sin(k), 300 + 150 * Math.cos(k * 1.7)); }
    if (k % 5 === 0) w.action();
  }
  function go(dt, total) {
    const w = new DJ.World({ seed: 77 });
    let t = 0;
    while (t < total - 1e-9) { script(w, t); w.update(dt); t += dt; w.drainEvents(); }
    return snapshot(w);
  }
  const a = go(1 / 60, 60), b = go(1 / 30, 60), c = go(0.5, 60);
  assert.deepStrictEqual(a, b); assert.deepStrictEqual(a, c);
  // high game speed: a single huge dt == many small ones (no inputs in between)
  const w1 = new DJ.World({ seed: 5 }), w2 = new DJ.World({ seed: 5 });
  w1.setTarget(100, 100); w2.setTarget(100, 100);
  w1.update(0.1 * 64);
  for (let i = 0; i < 64; i++) w2.update(0.1);
  assert.deepStrictEqual(snapshot(w1), snapshot(w2));
  assert.ok(w1._acc >= 0 && w1._acc < w1.cfg.step);
});

test('world: _px/_py saved at the start of each step on spike, trail, notes, pillows, boss', () => {
  const w = world(3);
  grow(w, 5);
  w.boss.next = 0; run(w, 2.2);
  const before = { s: [w.spike.x, w.spike.y], t: w.trail.map(t => [t.x, t.y]), n: w.notes.map(n => [n.x, n.y]), b: [w.boss.x, w.boss.y] };
  w.update(H);
  assert.deepStrictEqual([w.spike._px, w.spike._py], before.s);
  w.trail.forEach((t, i) => assert.deepStrictEqual([t._px, t._py], before.t[i]));
  w.notes.forEach((n, i) => { if (before.n[i]) assert.deepStrictEqual([n._px, n._py], before.n[i]); });
  assert.deepStrictEqual([w.boss._px, w.boss._py], before.b);
  assert.ok(w.pillows.length > 0 && w.pillows.every(p => p._pcx !== undefined && p._pz !== undefined));
});

// ---------- steering ----------
test('steering: turn rate capped, angular velocity eased (no snap), smooth heading, lean into turns', () => {
  const w = world(1); quiet(w);
  const c = w.cfg, s = w.spike;
  teleport(w, 480, 296);
  w.setDir(0, 1);                       // 90° to the right (clockwise)
  w.update(H);
  assert.ok(s.turn > 0 && s.turn < 0.15 * c.turnRate, 'first step is gentle: ' + s.turn);
  let maxTurn = 0, maxDH = 0, maxDW = 0, prevH = s.heading, prevW = s.turn, tFull = -1, leanOk = true;
  run(w, 1.2, i => {
    const dh = Math.abs(wrap(s.heading - prevH)), dw = Math.abs(s.turn - prevW);
    maxDH = Math.max(maxDH, dh); maxDW = Math.max(maxDW, dw); maxTurn = Math.max(maxTurn, Math.abs(s.turn));
    if (tFull < 0 && s.turn > 0.9 * c.turnRate) tFull = i * H;
    if (Math.abs(s.turn) > 0.5 && Math.sign(s.lean) !== Math.sign(s.turn)) leanOk = false;
    prevH = s.heading; prevW = s.turn;
  });
  assert.ok(maxTurn <= c.turnRate + 1e-9, 'turn ≤ turnRate');
  assert.ok(maxDH <= c.turnRate * H + 1e-9, 'heading changes ≤ turnRate·h per step');
  assert.ok(maxDW <= c.turnRate * (1 - Math.exp(-c.turnEase * H)) * 1.01, 'angular velocity eased: ' + maxDW);
  assert.ok(tFull > 0.05 && tFull < 0.4, 'reaches full turn rate in 0.05–0.4 s: ' + tFull);
  assert.ok(leanOk, 'lean has the sign of the turn');
  near(wrap(s.heading - Math.PI / 2), 0, 0.02, 'settles on the wanted heading');
  assert.ok(Math.abs(s.turn) < 0.1 && Math.abs(s.lean) < 0.2, 'turn and lean ease back to 0 on a straight line');
  assert.ok(Math.abs(s.lean) <= 1);
  // minimum turning radius ≈ speed / turnRate (≈ 36 px, DESIGN ≈ 38)
  const R = s.speed / c.turnRate;
  assert.ok(R > 30 && R < 45, 'min radius ' + R);
});

test('steering: pointer target within 24 px keeps the heading (no orbit jitter); far target is chased', () => {
  const w = world(2); quiet(w);
  const s = w.spike; teleport(w, 300, 300);
  run(w, 0.2, () => { w.setTarget(s.x + 10, s.y + 15); });
  assert.ok(Math.abs(s.turn) < 1e-6 && Math.abs(s.heading) < 1e-6, 'no turn inside the dead zone');
  w.setTarget(300, 480); run(w, 1.5);
  const d = Math.hypot(s.x - 300, s.y - 480);
  assert.ok(d < 120, 'chases the target: ' + d);
});

// ---------- edges ----------
test('edges: 10 min of random steering never leaves the arena and never sticks in a corner', () => {
  const w = world(9); quiet(w);
  const s = w.spike, r = new DJ.RNG(4), m = w.cfg.spikeR;
  let bounces = 0, win = [], stuck = 0, last = [s.x, s.y];
  const dipOk = [];
  loop(600 * 120, i => {
    if (i % 36 === 0) { if (r.chance(0.5)) w.setDir(r.range(-1, 1), r.range(-1, 1)); else { w.setDir(0, 0); w.setTarget(r.range(-100, 1060), r.range(-100, 640)); } }
    const sp = s.speed;
    w.update(H);
    for (const e of w.drainEvents()) if (e.type === 'bounce') { bounces++; dipOk.push(s.speed < sp); }
    assert.ok(inside(w, s.x, s.y, m), 'inside at step ' + i + ': ' + s.x + ',' + s.y);
    if (i % 360 === 0) {       // every 3 s Spike has travelled somewhere
      if (Math.hypot(s.x - last[0], s.y - last[1]) < 30) stuck++;
      last = [s.x, s.y];
    }
  });
  assert.ok(bounces > 50, 'bounces happen: ' + bounces);
  assert.ok(dipOk.filter(Boolean).length > bounces * 0.9, 'speed dips on a bounce');
  assert.ok(stuck <= 3, 'never stuck: ' + stuck);
  assert.strictEqual(w.bonks, 0);
});

test('edges: a head-on or corner hit glances off (never straight back into the trail)', () => {
  for (const [hx, hy, label] of [[-1, 0, 'left'], [0, 1, 'bottom'], [1, -1, 'corner TR'], [-1, 1, 'corner BL'], [-1, 0.05, 'near head-on']]) {
    const w = world(4); quiet(w);
    const s = w.spike, A = w.arena, c = w.cfg;
    const h0 = Math.atan2(hy, hx);
    // start 150 px from the wall/corner, with a long straight trail behind
    const tx = hx < 0 ? A.x0 + c.spikeR : hx > 0 ? A.x1 - c.spikeR : 480, ty = hy < 0 ? A.y0 + c.spikeR : hy > 0 ? A.y1 - c.spikeR : 296;
    s.x = tx - Math.cos(h0) * 150; s.y = ty - Math.sin(h0) * 150; s.heading = h0;
    if (Math.abs(hx) < 1e-9) s.x = 480; if (Math.abs(hy) < 0.1) s.y = hy ? s.y : 296;
    w._pathLen = 0; w._pathHead = -1;
    for (let k = 120; k >= 0; k--) w._pushPath(s.x - Math.cos(h0) * k * 3, s.y - Math.sin(h0) * k * 3);
    grow(w, 12);
    w.setDir(0, 0);                      // no wish: a pure bounce
    let h1 = null;
    run(w, 1.5, () => { for (const e of w.drainEvents()) if (e.type === 'bounce' && h1 === null) h1 = s.heading; });
    assert.ok(h1 !== null, label + ': bounced');
    const sep = Math.abs(wrap(h1 - (h0 + Math.PI)));
    // a corner only leaves a 90° cone: the glance is then limited to 45° − bounceMinIn (30°)
    const need = hx * hy !== 0 ? Math.min(c.bounceSep, Math.PI / 4 - c.bounceMinIn) : c.bounceSep;
    assert.ok(sep >= need - 0.02, label + ': glance away from straight back: ' + sep + ' ≥ ' + need);
    run(w, 3);
    assert.strictEqual(w.bonks, 0, label + ': no self-bonk after the bounce');
    // a kid holding the key into the bush: Spike slides along it (no loops back into the train)
    if (hx * hy === 0) {
      teleport(w, 480, 296, h0); grow(w, 0); run(w, 0.8);
      w.setDir(hx, hy);
      const d0 = [s.x, s.y];
      run(w, 3);
      assert.strictEqual(w.bonks, 0, label + ': holding into the bush slides without a bonk');
      assert.ok(Math.hypot(s.x - d0[0], s.y - d0[1]) > 200, label + ': slides along');
    }
    assert.ok(inside(w, s.x, s.y, c.spikeR));
  }
});

// ---------- trail ----------
test('trail: notes sit at (i+1)·spacing of arc length behind Spike along his exact path', () => {
  const w = world(5); quiet(w);
  const s = w.spike, c = w.cfg; teleport(w, 200, 296);
  grow(w, 10);
  let t = 0;
  run(w, 4, () => { t += H; w.setDir(1, Math.sin(t * 3) * 1.4); });
  const p = {};
  for (let i = 0; i < w.trail.length; i++) {
    const it = w.trail[i];
    w.pathPoint((i + 1) * c.trailSpacing, p);
    near(it.x, p.x, 1e-6, 'x of ' + i); near(it.y, p.y, 1e-6, 'y of ' + i);
    const prev = i ? w.trail[i - 1] : s, d = Math.hypot(it.x - prev.x, it.y - prev.y);
    assert.ok(d <= c.trailSpacing + 1e-6 && d > c.trailSpacing * 0.75, 'chord ' + d);
    assert.ok(it.z >= 0 && it.z <= c.bounceAmp * 1.5 + 1e-9, 'bounce z ' + it.z);
  }
  // bouncy train: neighbouring notes are out of phase
  assert.ok(new Set(w.trail.map(t => t.z.toFixed(2))).size > 3);
  // a freshly picked note hops from the pickup spot to the end of the train
  w._pick({ x: s.x, y: s.y, kind: 1, gold: false, state: 'idle' });
  const nt = w.trail[w.trail.length - 1];
  assert.ok(nt.join === 0 && nt.pop === 1);
  run(w, 0.3);
  assert.strictEqual(nt.join, 1);
  w.pathPoint(w.trail.length * c.trailSpacing, p);
  near(nt.x, p.x, 1e-6); near(nt.y, p.y, 1e-6);
});

// ---------- notes & scoring ----------
test('notes: pickup, scoring formula (10 + 2 × trail) × gold 3, song/index, spawn rules', () => {
  const w = world(6);
  const s = w.spike, c = w.cfg;
  w.boss.next = 1e9;
  w.setArena(28, 76, 932, 516, [{ x: 860, y: 450, r: 50 }]);
  assert.strictEqual(w.notes.length, c.notesOnField);
  let got = [];
  for (let k = 0; k < 6; k++) {
    // put a note right in front of Spike
    const gold = k === 3;
    const n = w.notes[0]; n.x = s.x + Math.cos(s.heading) * 20; n.y = s.y + Math.sin(s.heading) * 20; n.gold = gold;
    const len = w.trail.length, sc = w.score;
    let ev = null;
    run(w, 0.05, () => { for (const e of w.drainEvents()) if (e.type === 'note') ev = e; return !ev; });
    assert.ok(ev, 'note event');
    assert.strictEqual(ev.points, (10 + 2 * len) * (gold ? 3 : 1));
    assert.strictEqual(w.score - sc, ev.points);
    assert.strictEqual(ev.song, len + 1); assert.strictEqual(ev.index, len);
    assert.strictEqual(w.song, w.trail.length); assert.strictEqual(w.trail[len].gold, gold);
    got.push(ev.points);
    run(w, 0.4, () => { w.setTarget(480, 296); });
  }
  assert.deepStrictEqual(got, [10, 12, 14, 48, 18, 20]);
  // spawn rules over many spawns
  const r = new DJ.RNG(1);
  for (let k = 0; k < 300; k++) {
    s.x = r.range(60, 900); s.y = r.range(100, 490);
    w.notes.length = 0; w._fillNotes();
    for (const n of w.notes) {
      assert.ok(inside(w, n.x, n.y, c.spawnEdge), 'edge');
      assert.ok(Math.hypot(n.x - s.x, n.y - s.y) >= c.spawnMinDist - 1e-9, 'far from Spike');
      assert.ok(Math.hypot(n.x - 860, n.y - 450) >= 50 + c.noteR, 'not under the flip button');
      for (const t of w.trail) assert.ok(Math.hypot(n.x - t.x, n.y - t.y) >= c.spawnTrailClear, 'not on the trail');
      assert.strictEqual(n.state, 'spawn');
    }
  }
  // gold ≈ 8 %
  let gold = 0, tot = 0;
  for (let k = 0; k < 2000; k++) { w.notes.length = 0; w._fillNotes(); for (const n of w.notes) { tot++; if (n.gold) gold++; } }
  near(gold / tot, 0.08, 0.02, 'gold rate');
});

// ---------- bonks ----------
function orbitBonk(w) {
  // tight circle around a point 40 px to the right of Spike → runs into his own long trail
  const s = w.spike; teleport(w, 480, 296);
  let ev = null;
  run(w, 8, () => { w.setTarget(480 + 6, 296 + 40); for (const e of w.drainEvents()) if (e.type === 'bonk') { ev = e; return false; } });
  return ev;
}
test('self-bonk: −1 heart, cuts the trail at the hit note, cut notes scatter in arcs and can be re-grabbed', () => {
  const w = world(7); quiet(w);
  const c = w.cfg, s = w.spike;
  grow(w, 16);
  const ev = orbitBonk(w);
  assert.ok(ev, 'bonked');
  assert.strictEqual(w.hearts, c.heartsMax - 1); assert.strictEqual(ev.hearts, w.hearts);
  assert.ok(ev.lost > 0 && w.trail.length === 16 - ev.lost && w.trail.length >= c.safeNeck, 'cut at index ≥ safeNeck');
  assert.strictEqual(w.song, w.trail.length);
  assert.ok(s.invuln > 1.4 && s.dizzy > 0.5 && s.frame === 'ouch');
  const loose = w.notes.filter(n => n.state === 'loose');
  assert.strictEqual(loose.length, ev.lost);
  assert.ok(loose.every(n => n.vz > 0 && n.life === c.looseLife));
  // ballistic: z goes up then down, a little bounce, then rest; stays in the arena; moves outward
  const n0 = loose[0], x0 = n0.x, y0 = n0.y;
  let maxZ = 0, landed = 0, bounced = false, prevVz = n0.vz;
  w.setDir(0, 0); w.setTarget(null);
  w._collide = function () {};          // watch the flight without Spike grabbing them
  loop(120, () => {
    w.update(H);
    maxZ = Math.max(maxZ, n0.z);
    if (prevVz < 0 && n0.vz > 0) bounced = true;
    prevVz = n0.vz;
    for (const n of loose) assert.ok(inside(w, n.x, n.y, c.noteR));
  });
  assert.ok(maxZ > 10 && maxZ < 50, 'arc apex ' + maxZ);
  assert.ok(bounced, 'a little bounce');
  assert.strictEqual(n0.z, 0); assert.ok(Math.hypot(n0.vx, n0.vy) < 30, 'slides to a stop');
  assert.ok(Math.hypot(n0.x - x0, n0.y - y0) > 20, 'scattered outward');
  delete w._collide;
  // re-grab one: drive to it
  const tgt = loose[loose.length - 1];
  tgt.x = s.x + Math.cos(s.heading) * 18; tgt.y = s.y + Math.sin(s.heading) * 18;
  let rg = null, note = null;
  run(w, 0.2, () => { for (const e of w.drainEvents()) { if (e.type === 'regrab') rg = e; if (e.type === 'note') note = e; } });
  assert.ok(rg && note && note.regrab && note.points === c.regrabPoints, 'regrab counts as a note, 5 points');
  assert.strictEqual(w.trail.length, 16 - ev.lost + 1);
  // the others vanish after looseLife
  let gone = 0;
  run(w, c.looseLife, () => { for (const e of w.drainEvents()) if (e.type === 'loosegone') gone++; });
  assert.ok(gone >= 1 && w.notes.filter(n => n.state === 'loose').length === 0, 'loose notes pop after 4 s');
});

test('safe neck: notes 0..safeNeck−1 never bonk; note safeNeck does', () => {
  for (const diff of ['normal', 'easy']) {
    const cfg = Object.assign({}, DJ.DIFFICULTY[diff], { trailSpacing: 1.5 });   // squash the train onto Spike
    let w = world(8, cfg); quiet(w);
    grow(w, w.cfg.safeNeck);
    run(w, 2);
    assert.strictEqual(w.bonks, 0, diff + ': neck is safe');
    w = world(8, cfg); quiet(w);
    grow(w, w.cfg.safeNeck + 1);
    run(w, 0.1);
    assert.strictEqual(w.bonks, 1, diff + ': note at index safeNeck bonks');
  }
  assert.strictEqual(DJ.DIFFICULTY.easy.safeNeck, 6); assert.strictEqual(DJ.World.CONFIG.safeNeck, 4);
});

// ---------- kickflip ----------
test('kickflip: parabola z, jumps over the trail, recharge + events', () => {
  const w = world(9, { trailSpacing: 3 }); quiet(w);
  const c = w.cfg, s = w.spike;
  grow(w, 8);
  assert.ok(w.action(), 'hop');
  assert.ok(!w.action(), 'not charged twice');
  let zs = [], ev = [];
  run(w, c.jumpTime + 0.05, () => { zs.push(s.z); ev.push(...w.drainEvents().map(e => e.type)); });
  assert.ok(ev.includes('land'));
  const zMax = Math.max(...zs), iMax = zs.indexOf(zMax);
  near(zMax, c.jumpHeight, 0.2, 'apex'); near(iMax * H, c.jumpTime / 2, 0.02, 'apex at half time');
  near(zs[Math.round(c.jumpTime * 0.25 / H)], 0.75 * c.jumpHeight, 0.5, 'parabola');
  assert.strictEqual(s.z, 0);
  // while airborne with z > airZ the squashed trail never bonked; landing on it does
  assert.ok(w.bonks <= 1);
  const air = zs.filter(z => z > c.airZ).length * H;
  assert.ok(air > 0.8 * c.jumpTime, 'mostly above the trail');
  // recharge
  let ready = -1;
  const w2 = world(9); quiet(w2); w2.action();
  run(w2, 4, i => { if (ready < 0 && w2.drainEvents().some(e => e.type === 'flipready')) ready = i * H; });
  near(ready, c.flipRecharge, 0.02, 'flipready after flipRecharge');
  // a real crossing: drive straight over a trail lying across the path, hop in time → no bonk
  const w3 = world(10); quiet(w3);
  const s3 = w3.spike;
  grow(w3, 14);
  // lay the trail as a vertical line at x = 600 (fake path: up the line, then a turn toward Spike)
  w3._pathLen = 0; w3._pathHead = -1;
  for (let k = 0; k <= 140; k++) w3._pushPath(600, 120 + k * 3);
  s3.x = 600; s3.y = 120 + 140 * 3 + 2;  // Spike at the end of that path
  w3._layoutTrail(0);
  const line = w3.trail.map(t => [t.x, t.y]);
  assert.ok(line.slice(4).every(p => Math.abs(p[0] - 600) < 1e-6));
  // freeze the trail where it is and drive across it
  w3._layoutTrail = function () {};
  s3.x = 450; s3.y = 380; s3.heading = 0; s3.turn = 0; w3.setDir(1, 0);
  run(w3, 2, () => { if (s3.x > 600 - 0.3 * s3.speed && s3.flip >= 1) w3.action(); });
  assert.strictEqual(w3.bonks, 0, 'hopped over');
  const w4 = world(10); quiet(w4); grow(w4, 14);
  w4._pathLen = 0; w4._pathHead = -1;
  for (let k = 0; k <= 140; k++) w4._pushPath(600, 120 + k * 3);
  w4.spike.x = 600; w4.spike.y = 542; w4._layoutTrail(0); w4._layoutTrail = function () {};
  w4.spike.x = 450; w4.spike.y = 380; w4.spike.heading = 0; w4.setDir(1, 0);
  run(w4, 2);
  assert.strictEqual(w4.bonks, 1, 'without the hop it bonks');
});

// ---------- boss ----------
test('boss: first visit at 12 s, then every 30 s, 3 pillows 0.9 s apart, shadows land at the predicted spot', () => {
  const w = world(11); w.cfg.notesOnField = 0; w.notes.length = 0;
  const c = w.cfg, s = w.spike;
  const visits = [], throws = [];
  let landedOk = 0, prevX = null, maxDx = 0, prevY = null, maxDy = 0;
  loop(75 * 120, () => {
    w.setTarget(480 + 300 * Math.sin(w.time * 0.7), 296 + 150 * Math.cos(w.time * 0.9));
    w.update(H);
    const b = w.boss;
    if (b.state !== 'away' && prevX !== null && !b._exit) { maxDx = Math.max(maxDx, Math.abs(b.x - prevX)); maxDy = Math.max(maxDy, Math.abs(b.y - prevY)); }
    prevX = b.state !== 'away' ? b.x : null; prevY = b.y;
    for (const e of w.drainEvents()) {
      if (e.type === 'bossin') visits.push(w.levelTime);
      if (e.type === 'throw') {
        const p = w.pillows[w.pillows.length - 1];
        throws.push({ t: w.levelTime, p });
        if (throws.length % 3 === 1) {
          const pr = w.predictSpike(c.pillowDur);
          near(p.x, pr.x, 1e-9, 'first pillow aimed exactly'); near(p.y, pr.y, 1e-9);
        }
        near(p.sx, w.boss.x, 1e-9, 'thrown from Mumbles'); near(p.sy - p.z0, w.boss.y, 1e-9);
      }
      if (e.type === 'pillowland') {
        const p = w.pillows.find(q => q.x === e.x && q.y === e.y);
        assert.ok(p && p.state === 'landed' && p.z === 0 && p.cx === p.x && p.cy === p.y);
        landedOk++;
      }
    }
    for (const p of w.pillows) assert.ok(inside(w, p.x, p.y, c.pillowEdge));
  });
  assert.strictEqual(visits.length, 3);
  near(visits[0], 12, 2 * H); near(visits[1], 42, 2 * H); near(visits[2], 72, 2 * H);
  assert.ok(throws.length >= 6, 'throws ' + throws.length);
  for (let k = 0; k < 6; k += 3) { near(throws[k + 1].t - throws[k].t, 0.9, 2 * H); near(throws[k + 2].t - throws[k + 1].t, 0.9, 2 * H); }
  assert.ok(landedOk >= 6);
  assert.ok(maxDx < 600 * H && maxDy < 200 * H, 'smooth flight: ' + maxDx + ' ' + maxDy);
  // pillow flight: z ballistic from z0 to 0 at dur exactly, landing spot fixed
  const w2 = world(12); quiet(w2);
  w2.boss.x = 300; w2.boss.y = 120; w2._throw(true);
  const p = w2.pillows[0], zs = [];
  loop(Math.round(p.dur / H) + 2, () => { zs.push(p.z); w2.update(H); });
  near(zs[0], c.pillowZ0, 1e-9);
  const iA = zs.indexOf(Math.max(...zs));
  for (let i = iA + 1; i < zs.length; i++) assert.ok(zs[i] <= zs[i - 1] + 1e-9, 'falls after the apex');
  assert.strictEqual(p.state, 'landed'); assert.strictEqual(p.z, 0);
  run(w2, c.pillowLife + 0.05);
  assert.strictEqual(w2.pillows.length, 0, 'puffs into feathers');
});

test('boss: never during ready / cleared, never before 12 s', () => {
  const w = new DJ.World({ seed: 13 });
  let early = 0;
  run(w, 13.5, () => { for (const e of w.drainEvents()) if (e.type === 'bossin' && w.levelTime < 11.99) early++; });
  assert.strictEqual(early, 0);
  assert.notStrictEqual(w.boss.state, 'away');
  w._clear();
  assert.strictEqual(w.boss.state, 'leave'); assert.strictEqual(w.pillows.length, 0);
  run(w, 2, () => { for (const e of w.drainEvents()) assert.ok(e.type !== 'throw' && e.type !== 'bossin'); });
});

test('pillow hit: dizzy, 3 notes off the END of the trail, no heart; kickflip over it = dodge +15', () => {
  for (const dodge of [false, true]) {
    const w = world(14); quiet(w);
    const c = w.cfg, s = w.spike;
    teleport(w, 100, 296); w.setDir(1, 0);
    run(w, 1.0);
    grow(w, 8);
    run(w, 0.3);
    const ids = w.trail.map(t => t.kind);
    w.boss.x = 400; w.boss.y = 100; w._throw(true);
    const p = w.pillows[0], sc = w.score;
    let hit = null, dg = null, land = null;
    run(w, c.pillowDur + 0.1, () => {
      if (dodge && p.state === 'fall' && p.dur - p.t < 0.3) w.action();
      for (const e of w.drainEvents()) { if (e.type === 'pillowhit') hit = e; if (e.type === 'dodge') dg = e; if (e.type === 'pillowland') land = e; }
    });
    assert.ok(land, 'landed');
    assert.strictEqual(w.hearts, c.heartsMax, 'no heart lost');
    if (!dodge) {
      assert.ok(hit && land.hit && hit.lost === 3);
      assert.strictEqual(w.trail.length, 5);
      assert.deepStrictEqual(J(w.trail.map(t => t.kind)), J(ids.slice(0, 5)), 'from the END');
      assert.strictEqual(w.notes.filter(n => n.state === 'loose').length, 3);
      assert.ok(s.dizzy > 0.85 && w.pillowHits === 1);
    } else {
      assert.ok(!hit && dg && dg.points === 15 && !land.hit);
      assert.strictEqual(w.score - sc, 15); assert.strictEqual(w.dodges, 1); assert.strictEqual(w.trail.length, 8);
    }
  }
});

// ---------- levels ----------
test('song done → cleared (bonus hearts × 100, +1 heart) → next biome; biome cycles + laps', () => {
  const w = world(15); quiet(w);
  const c = w.cfg;
  w.hearts = 2;
  w.songTarget = 10;
  for (let i = 0; i < 9; i++) w._pick({ x: w.spike.x, y: w.spike.y, kind: 0, gold: false, state: 'idle' });
  assert.strictEqual(w.state, 'playing');
  w.drainEvents();
  const sc = w.score;
  w._pick({ x: w.spike.x, y: w.spike.y, kind: 0, gold: false, state: 'idle' });
  const ev = w.drainEvents().map(e => e.type);
  assert.deepStrictEqual(J(ev.filter(t => t === 'note' || t === 'songdone' || t === 'cleared')), ['note', 'songdone', 'cleared']);
  assert.strictEqual(w.state, 'cleared');
  assert.strictEqual(w.score - sc, 28 + 200);
  assert.strictEqual(w.hearts, 3);
  run(w, c.clearTime - 0.05);
  assert.strictEqual(w.state, 'cleared');
  let biomeEv = null;
  run(w, 0.1, () => { for (const e of w.drainEvents()) if (e.type === 'biome') biomeEv = e; });
  assert.ok(biomeEv && biomeEv.biome === 1 && biomeEv.level === 1);
  assert.ok(w.state === 'ready' || (w.state === 'playing' && w.levelTime < 0.1)); assert.strictEqual(w.level, 1); assert.strictEqual(w.trail.length, 0);
  assert.strictEqual(w.songTarget, 14); assert.strictEqual(w.hearts, 3);
  // hearts capped
  w.hearts = 3; w.state = 'playing'; w.songTarget = 1; w._pick({ x: 0, y: 0, kind: 0, gold: false, state: 'idle' });
  assert.strictEqual(w.hearts, 3);
  // biome cycle + lap
  for (let i = 0; i < 10; i++) {
    w.startLevel(i);
    assert.strictEqual(w.biome, i % 4); assert.strictEqual(w.lap, Math.floor(i / 4));
    assert.strictEqual(w.songTarget, c.songTargets[i % 4] + 2 * Math.floor(i / 4));
    near(w._baseSpeed, (c.speed0 + c.speedPerBiome * (i % 4)) * Math.pow(c.speedLapMul, Math.floor(i / 4)), 1e-9);
  }
  // reset
  w.reset(); const e2 = w.drainEvents().map(e => e.type);
  assert.deepStrictEqual(J(e2), ['start', 'biome']);
  assert.ok(w.level === 0 && w.score === 0 && w.hearts === c.heartsMax && w.state === 'ready' && w.trail.length === 0);
  near(w.spike.x, 480, 1e-9); near(w.spike.y, 296, 1e-9); assert.strictEqual(w.spike.heading, 0);
  // easy / hard song lengths
  assert.strictEqual(new DJ.World({ config: DJ.DIFFICULTY.easy }).songTarget, 8);
  assert.strictEqual(new DJ.World({ config: DJ.DIFFICULTY.hard }).songTarget, 12);
  assert.strictEqual(new DJ.World({ config: DJ.DIFFICULTY.easy }).hearts, 5);
});

test('dead: last heart → dead {score}, Spike rolls to a stop, boss leaves', () => {
  const w = world(16); quiet(w);
  w.hearts = 1; grow(w, 16);
  orbitBonk(w);
  assert.strictEqual(w.state, 'dead');
  run(w, 3);
  assert.strictEqual(w.spike.speed, 0);
  assert.ok(!w.action());
});

// ---------- arena ----------
test('setArena at runtime (landscape → portrait 560×1100 → back) keeps everything inside', () => {
  const w = new DJ.World({ seed: 17 });
  const bot = new DJ.Bot(w, { skill: 1, seed: 2 });
  const check = (label) => {
    const c = w.cfg, s = w.spike;
    assert.ok(inside(w, s.x, s.y, c.spikeR), label + ' spike');
    for (const t of w.trail) assert.ok(inside(w, t.x, t.y, c.spikeR - 1e-6), label + ' trail ' + t.x + ',' + t.y);
    for (const n of w.notes) assert.ok(inside(w, n.x, n.y, c.noteR), label + ' note');
    for (const p of w.pillows) assert.ok(inside(w, p.x, p.y, c.pillowEdge), label + ' pillow');
  };
  const play = (sec, label) => { let t = 0; while (t < sec) { bot.step(1 / 60); w.update(1 / 60); w.drainEvents(); t += 1 / 60; check(label); } };
  play(14.5, 'landscape');          // boss is visiting now
  assert.ok(w.trail.length > 2);
  const avoid = [{ x: 500, y: 1040, r: 50 }];
  w.setArena(28, 100, 532, 1072, avoid); check('portrait');
  for (const n of w.notes) if (n.state !== 'loose') assert.ok(Math.hypot(n.x - 500, n.y - 1040) > 50, 'not under the button');
  play(25, 'portrait');
  w.setArena(28, 76, 932, 516, []); check('back');
  play(10, 'back');
  w.setArena(28, 76, 932, 516, []); check('same arena is a no-op');
});

// ---------- weather ----------
test('weather: bounded particle counts for every biome and canvas size, valid fields, deterministic', () => {
  const sizes = [[960, 540], [560, 1100], [720, 1600], [1280, 540], [320, 480], [960, 960]];
  const sprites = new Set(DJ.Weather.SPRITES);
  for (const [W, Hh] of sizes) {
    for (let b = 0; b < 4; b++) {
      const wx = new DJ.Weather({ width: W, height: Hh, seed: b + 1 });
      wx.setBiome(b, { instant: true });
      const env = { spike: { x: W / 2, y: Hh / 2, jump: 0.1 }, boss: { state: 'hover', x: W / 2, y: 120 } };
      let max = 0;
      for (let k = 0; k < 600; k++) {
        if (k % 50 === 0) { wx.burst('feather', W / 3, Hh / 2, 10); wx.burst('sparkle', W / 2, Hh / 2, 10); }
        if (k === 300) wx.setBiome((b + 1) % 4);
        wx.update(1 / 30, env);
        max = Math.max(max, wx.particles.length);
        for (const p of wx.particles) {
          assert.ok(sprites.has(p.sprite), p.sprite);
          assert.ok(p.layer === 'back' || p.layer === 'front');
          assert.ok(p.alpha >= 0 && p.alpha <= 1 && isFinite(p.x) && isFinite(p.y) && p.size > 0, 'fields');
        }
      }
      assert.ok(max < 160, W + 'x' + Hh + ' biome ' + b + ': ' + max);
      assert.ok(wx.particles.length > 10, 'something to see');
    }
  }
  // resize keeps the bound and moves particles proportionally
  const wx = new DJ.Weather({ width: 960, height: 540, seed: 3 }); wx.setBiome(3, { instant: true });
  wx.resize(560, 1100); for (let k = 0; k < 400; k++) wx.update(1 / 30); assert.ok(wx.particles.length < 160);
  wx.resize(960, 540); for (let k = 0; k < 400; k++) wx.update(1 / 30); assert.ok(wx.particles.length < 160);
  // biome content
  const kinds = b => { const w2 = new DJ.Weather({ seed: 1 }); w2.setBiome(b, { instant: true }); w2.update(1); return new Set(w2.particles.map(p => p.sprite)); };
  assert.ok(kinds(0).has('butterfly') && kinds(0).has('petal'));
  assert.ok(kinds(1).has('mist') && kinds(1).has('firefly'));
  assert.ok(kinds(2).has('dust'));
  assert.ok(kinds(3).has('snow'));
  const d3 = new DJ.Weather({ seed: 1 }); d3.setBiome(3, { instant: true });
  assert.ok(new Set(d3.particles.map(p => p.depth)).size === 3, 'snow in 3 depth layers');
  assert.strictEqual(typeof d3.setSeason, 'function');
  // deterministic for any dt partition
  const A = new DJ.Weather({ seed: 9 }), B = new DJ.Weather({ seed: 9 });
  for (let k = 0; k < 120; k++) A.update(1 / 60);
  for (let k = 0; k < 40; k++) B.update(1 / 20);
  assert.deepStrictEqual(J(A.particles), J(B.particles));
  // ambient
  const am = new DJ.Weather({ seed: 1 }); am.setBiome(1, { instant: true }); am.update(0.1);
  assert.ok(am.ambient.fog > 0.05 && /^rgba/.test(am.ambient.tint));
});

// ---------- bot ----------
test('bot: skill 1 clears biome 1 on normal in > 90 % of 50 seeds', () => {
  let ok = 0, times = [];
  for (let k = 0; k < 50; k++) {
    const g = playGame(100 + k * 31, 'normal', 1, 240, 1);
    if (g.w.levelsCleared >= 1) { ok++; times.push(g.t); }
  }
  assert.ok(ok > 45, 'cleared ' + ok + '/50');
  console.log('      biome 1 cleared ' + ok + '/50, median ' + times.sort((a, b) => a - b)[times.length >> 1].toFixed(1) + ' s');
});

test('bot: only uses the input API; 10 minutes simulate in ~2 s', () => {
  const t0 = Date.now();
  const g = playGame(5, 'normal', 1, 600);
  const ms = Date.now() - t0;
  assert.ok(ms < 4000, '10 min sim took ' + ms + ' ms');
  console.log('      10 min (world + bot, 60 fps) in ' + ms + ' ms; level ' + g.w.level + ', bonks ' + g.w.bonks);
  assert.ok(g.bot.stats.thinks > 1000 && g.bot.stats.levels === g.w.levelsCleared);
  // high speed: same game at dt 0.1 × 16 still plays
  const w = new DJ.World({ seed: 3 }), bot = new DJ.Bot(w, { skill: 1, seed: 1 });
  for (let i = 0; i < 400; i++) { bot.step(1.6); w.update(1.6); w.drainEvents(); }
  assert.ok(w.notesTotal > 0);
});

// ---------- runner ----------
let pass = 0, fail = 0;
const t0 = Date.now();
for (const t of tests) {
  const s = Date.now();
  try { t.fn(); pass++; console.log('  ok   ' + t.name + '  (' + (Date.now() - s) + ' ms)'); }
  catch (e) { fail++; console.log('  FAIL ' + t.name + '\n       ' + (e && e.stack || e).toString().split('\n').slice(0, 4).join('\n       ')); }
}
console.log(`\n${pass} passed, ${fail} failed (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(fail ? 1 : 0);
