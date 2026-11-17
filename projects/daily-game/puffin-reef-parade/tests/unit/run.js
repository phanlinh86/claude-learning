#!/usr/bin/env node
// Dottie's Reef Parade — headless unit tests for rng / world / weather / bot (node, no deps).
// Run from projects/daily-game/puffin-reef-parade:   node tests/unit/run.js
'use strict';
const assert = require('assert');
const { load } = require('./load');

const RP = load();
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const H = 1 / 120;
const J = v => JSON.parse(JSON.stringify(v));
const near = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, (m || '') + ' got ' + a + ' want ' + b + ' ±' + tol);
const TAU = Math.PI * 2;
const wrap = a => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };

// ---------- helpers ----------
function world(seed, cfg, level) {
  const w = new RP.World({ seed: seed || 1, config: Object.assign({ readyTime: 0 }, cfg) });
  if (level) w.startLevel(level);
  w.update(H * 2);
  assert.strictEqual(w.state, 'playing');
  w.drainEvents();
  return w;
}
function quiet(w) { w.cfg.notesOnField = 0; w.notes.length = 0; w._goldNext = 1e9; w.cfg.goldEvery = 1e9; }
function steps(w, n, each) { for (let i = 0; i < n; i++) { if (each && each(i) === false) return i; w.update(H); } return n; }
function loop(n, fn) { for (let i = 0; i < n; i++) fn(i); }
function run(w, seconds, each) { return steps(w, Math.round(seconds / H), each); }
// append n notes to the train (as if collected) without finishing the song
function grow(w, n, settle) {
  w.songTarget = 999;
  for (let i = 0; i < n; i++) w._pick({ x: w.hero.x, y: w.hero.y, kind: i % 4, gold: false, worth: 1, state: 'idle' });
  w.drainEvents();
  if (settle !== false) for (const t of w.trail) t.join = 1;
}
// move Dottie somewhere and give him a fresh straight path history behind him
function teleport(w, x, y, heading) {
  const s = w.hero; heading = heading || 0;
  s.x = s._px = x; s.y = s._py = y; s.heading = heading; s.turn = 0;
  w._pathLen = 0; w._pathHead = -1;
  for (let k = 200; k >= 0; k--) w._pushPath(x - Math.cos(heading) * k * 3, y - Math.sin(heading) * k * 3);
}
function inside(w, x, y, m) { const A = w.arena; return x >= A.x0 + m - 1e-6 && x <= A.x1 - m + 1e-6 && y >= A.y0 + m - 1e-6 && y <= A.y1 - m + 1e-6; }
function snapshot(w) {
  return J({ g: w.getState(), s: w.hero, trail: w.trail, notes: w.notes, score: w.score, golds: w.golds, missed: w.goldMissed });
}
function playGame(seed, diff, skill, maxS, stopLevel) {
  const w = new RP.World({ seed, config: RP.DIFFICULTY[diff || 'normal'] });
  const bot = new RP.Bot(w, { skill, seed: seed * 3 + 1 });
  let t = 0; maxS = maxS || 600;
  while (w.state !== 'dead' && t < maxS && !(stopLevel !== undefined && w.levelsCleared >= stopLevel)) {
    bot.step(1 / 60); w.update(1 / 60); w.drainEvents(); t += 1 / 60;
  }
  return { w, t, bot };
}

// ---------- RNG ----------
test('rng: deterministic, in range, RP namespace, same API as the sister games', () => {
  const a = new RP.RNG(42), b = new RP.RNG(42), c = new RP.RNG('42x');
  for (let i = 0; i < 200; i++) { const x = a.next(); assert.strictEqual(x, b.next()); assert.ok(x >= 0 && x < 1); }
  for (const f of ['range', 'int', 'pick', 'chance', 'sign', 'gauss', 'fork']) assert.strictEqual(typeof c[f], 'function', f);
  for (let i = 0; i < 200; i++) { const k = c.int(2, 5); assert.ok(k >= 2 && k <= 5 && k === (k | 0)); }
  assert.strictEqual(RP.BIOMES.length, 4);
  assert.ok(RP.DIFFICULTY.easy && RP.DIFFICULTY.normal && RP.DIFFICULTY.hard);
});

// ---------- determinism ----------
test('world: same seed + same inputs → same state (any dt partition, incl. dt = 0.1 × 64)', () => {
  function script(w, t) {
    const k = Math.floor(t * 2 + 1e-9);
    if (k % 3 === 0) w.setDir(Math.cos(k), Math.sin(k)); else { w.setDir(0, 0); w.setTarget(480 + 300 * Math.sin(k), 300 + 150 * Math.cos(k * 1.7)); }
    if (k % 5 === 0) w.action();
  }
  function go(dt, total) {
    const w = new RP.World({ seed: 77 });
    let t = 0;
    while (t < total - 1e-9) { script(w, t); w.update(dt); t += dt; w.drainEvents(); }
    return snapshot(w);
  }
  const a = go(1 / 60, 60), b = go(1 / 30, 60), c = go(0.5, 60);
  assert.deepStrictEqual(a, b); assert.deepStrictEqual(a, c);
  // high game speed: a single huge dt == many small ones (no inputs in between)
  const w1 = new RP.World({ seed: 5 }), w2 = new RP.World({ seed: 5 });
  w1.setTarget(100, 100); w2.setTarget(100, 100);
  w1.update(0.1 * 64);
  for (let i = 0; i < 64; i++) w2.update(0.1);
  assert.deepStrictEqual(snapshot(w1), snapshot(w2));
  assert.ok(w1._acc >= 0 && w1._acc < w1.cfg.step);
});

test('world: _px/_py saved at the start of each step on hero, trail, notes (incl. the golden star)', () => {
  const w = world(3);
  grow(w, 5);
  w.goldNow(); run(w, 1.0);
  assert.ok(w.goldStar() && w.goldStar().state === 'flee');
  const before = { s: [w.hero.x, w.hero.y], t: w.trail.map(t => [t.x, t.y]), n: w.notes.map(n => [n.id, n.x, n.y]) };
  w.update(H);
  assert.deepStrictEqual([w.hero._px, w.hero._py], before.s);
  w.trail.forEach((t, i) => assert.deepStrictEqual([t._px, t._py], before.t[i]));
  for (const n of w.notes) { const b = before.n.find(q => q[0] === n.id); if (b) assert.deepStrictEqual([n._px, n._py], [b[1], b[2]]); }
  const g = w.goldStar(); assert.ok(g._px !== g.x || g._py !== g.y, 'the golden star moved this step');
  // no boss / pillows any more
  assert.strictEqual(w.boss, undefined); assert.strictEqual(w.pillows, undefined);
  for (const k of Object.keys(RP.CONFIG)) assert.ok(!/boss|pillow|dodge/i.test(k), 'stale config key ' + k);
});

// ---------- steering ----------
test('steering: turn rate capped, angular velocity eased (no snap), smooth heading, lean into turns', () => {
  const w = world(1); quiet(w);
  const c = w.cfg, s = w.hero;
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
  const s = w.hero; teleport(w, 300, 300);
  run(w, 0.2, () => { w.setTarget(s.x + 10, s.y + 15); });
  assert.ok(Math.abs(s.turn) < 1e-6 && Math.abs(s.heading) < 1e-6, 'no turn inside the dead zone');
  w.setTarget(300, 480); run(w, 1.5);
  const d = Math.hypot(s.x - 300, s.y - 480);
  assert.ok(d < 120, 'chases the target: ' + d);
});

// ---------- edges ----------
test('edges: 10 min of random steering never leaves the arena and never sticks in a corner', () => {
  const w = world(9); quiet(w);
  const s = w.hero, r = new RP.RNG(4), m = w.cfg.heroR;
  let bounces = 0, win = [], stuck = 0, last = [s.x, s.y];
  const dipOk = [];
  loop(600 * 120, i => {
    if (i % 36 === 0) { if (r.chance(0.5)) w.setDir(r.range(-1, 1), r.range(-1, 1)); else { w.setDir(0, 0); w.setTarget(r.range(-100, 1060), r.range(-100, 640)); } }
    const sp = s.speed;
    w.update(H);
    for (const e of w.drainEvents()) if (e.type === 'bounce') { bounces++; dipOk.push(s.speed < sp); }
    assert.ok(inside(w, s.x, s.y, m), 'inside at step ' + i + ': ' + s.x + ',' + s.y);
    if (i % 360 === 0) {       // every 3 s Dottie has travelled somewhere
      if (Math.hypot(s.x - last[0], s.y - last[1]) < 30) stuck++;
      last = [s.x, s.y];
    }
  });
  assert.ok(bounces > 50, 'bounces happen: ' + bounces);
  assert.ok(dipOk.filter(Boolean).length > bounces * 0.9, 'speed dips on a bounce');
  assert.ok(stuck <= 4, 'never stuck: ' + stuck);   // 200 windows; targetDead 48 (playtest) is no worse across 12 seeds than 24
  assert.strictEqual(w.bonks, 0);
});

test('edges: a head-on or corner hit glances off (never straight back into the trail)', () => {
  for (const [hx, hy, label] of [[-1, 0, 'left'], [0, 1, 'bottom'], [1, -1, 'corner TR'], [-1, 1, 'corner BL'], [-1, 0.05, 'near head-on']]) {
    const w = world(4); quiet(w);
    const s = w.hero, A = w.arena, c = w.cfg;
    const h0 = Math.atan2(hy, hx);
    // start 150 px from the wall/corner, with a long straight trail behind
    const tx = hx < 0 ? A.x0 + c.heroR : hx > 0 ? A.x1 - c.heroR : 480, ty = hy < 0 ? A.y0 + c.heroR : hy > 0 ? A.y1 - c.heroR : 296;
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
    // a kid holding the key into the bush: Dottie slides along it (no loops back into the train)
    if (hx * hy === 0) {
      teleport(w, 480, 296, h0); grow(w, 0); run(w, 0.8);
      w.setDir(hx, hy);
      const d0 = [s.x, s.y];
      run(w, 3);
      assert.strictEqual(w.bonks, 0, label + ': holding into the bush slides without a bonk');
      assert.ok(Math.hypot(s.x - d0[0], s.y - d0[1]) > 200, label + ': slides along');
    }
    assert.ok(inside(w, s.x, s.y, c.heroR));
  }
});

// ---------- trail ----------
test('trail: notes sit at (i+1)·spacing of arc length behind Dottie along his exact path', () => {
  const w = world(5); quiet(w);
  const s = w.hero, c = w.cfg; teleport(w, 200, 296);
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
test('notes: pickup, scoring 10 + 2 × parade, song/index, spawn rules, normal stars never gold', () => {
  const w = world(6);
  const s = w.hero, c = w.cfg;
  w._goldNext = 1e9;
  w.setArena(28, 76, 932, 516, [{ x: 860, y: 450, r: 50 }]);
  assert.strictEqual(w.notes.length, c.notesOnField);
  let got = [];
  for (let k = 0; k < 6; k++) {
    // put a note right in front of Dottie
    const n = w.notes.find(q => !q._g); n.x = s.x + Math.cos(s.heading) * 20; n.y = s.y + Math.sin(s.heading) * 20;
    const len = w.trail.length, sc = w.score;
    let ev = null;
    run(w, 0.05, () => { for (const e of w.drainEvents()) if (e.type === 'note') ev = e; return !ev; });
    assert.ok(ev, 'note event');
    assert.strictEqual(ev.points, 10 + 2 * len); assert.strictEqual(ev.worth, 1); assert.strictEqual(ev.gold, false);
    assert.strictEqual(w.score - sc, ev.points);
    assert.strictEqual(ev.song, len + 1); assert.strictEqual(ev.index, len);
    assert.strictEqual(w.song, w.trail.length); assert.strictEqual(w.trail[len].worth, 1);
    got.push(ev.points);
    run(w, 0.4, () => { w.setTarget(480, 296); });
  }
  assert.deepStrictEqual(got, [10, 12, 14, 16, 18, 20]);
  // spawn rules over many spawns
  const r = new RP.RNG(1);
  for (let k = 0; k < 300; k++) {
    s.x = r.range(60, 900); s.y = r.range(100, 490);
    w.notes.length = 0; w._fillNotes();
    for (const n of w.notes) {
      assert.ok(inside(w, n.x, n.y, c.spawnEdge), 'edge');
      assert.ok(Math.hypot(n.x - s.x, n.y - s.y) >= c.spawnMinDist - 1e-9, 'far from Dottie');
      assert.ok(Math.hypot(n.x - 860, n.y - 450) >= 50 + c.noteR, 'not under the flip button');
      for (const t of w.trail) assert.ok(Math.hypot(n.x - t.x, n.y - t.y) >= c.spawnTrailClear, 'not on the trail');
      assert.strictEqual(n.state, 'spawn');
    }
  }
  // goldChance 0: the golden star is its own twist, normal stars are never gold
  let gold = 0;
  for (let k = 0; k < 500; k++) { w.notes.length = 0; w._fillNotes(); for (const n of w.notes) if (n.gold || n.worth !== 1) gold++; }
  assert.strictEqual(gold, 0);
});

// ---------- bonks ----------
function orbitBonk(w) {
  // tight circle around a point 40 px to the right of Dottie → runs into his own long trail
  const s = w.hero; teleport(w, 480, 296);
  let ev = null;
  run(w, 8, () => { w.setTarget(480 + 6, 296 + 40); for (const e of w.drainEvents()) if (e.type === 'bonk') { ev = e; return false; } });
  return ev;
}
test('self-bonk: −1 heart, cuts the trail at the hit note, cut notes scatter in arcs and can be re-grabbed', () => {
  const w = world(7); quiet(w);
  const c = w.cfg, s = w.hero;
  grow(w, 16);
  const ev = orbitBonk(w);
  assert.ok(ev, 'bonked');
  assert.strictEqual(w.hearts, c.heartsMax - 1); assert.strictEqual(ev.hearts, w.hearts);
  assert.ok(ev.lost > 0 && w.trail.length === 16 - ev.lost && w.trail.length >= c.safeNeck, 'cut at index ≥ safeNeck');
  assert.strictEqual(w.song, w.trail.length);
  assert.ok(s.invuln > c.invulnTime - 0.1 && s.dizzy > 0.5 && s.frame === 'ouch');
  const loose = w.notes.filter(n => n.state === 'loose');
  assert.strictEqual(loose.length, ev.lost);
  assert.ok(loose.every(n => n.vz > 0 && n.life === c.looseLife));
  // ballistic: z goes up then down, a little bounce, then rest; stays in the arena; moves outward
  const n0 = loose[0], x0 = n0.x, y0 = n0.y;
  let maxZ = 0, landed = 0, bounced = false, prevVz = n0.vz;
  w.setDir(0, 0); w.setTarget(null);
  w._collide = function () {};          // watch the flight without Dottie grabbing them
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
    const cfg = Object.assign({}, RP.DIFFICULTY[diff], { trailSpacing: 1.2 });   // squash the train onto Dottie
    let w = world(8, cfg); quiet(w);
    grow(w, w.cfg.safeNeck);
    run(w, 2);
    assert.strictEqual(w.bonks, 0, diff + ': neck is safe');
    w = world(8, cfg); quiet(w);
    grow(w, w.cfg.safeNeck + 1);
    run(w, 0.1);
    assert.strictEqual(w.bonks, 1, diff + ': note at index safeNeck bonks');
  }
  assert.strictEqual(RP.DIFFICULTY.easy.safeNeck, 7); assert.strictEqual(RP.World.CONFIG.safeNeck, 4);
});

// ---------- kickflip ----------
test('kickflip: parabola z, jumps over the trail, recharge + events', () => {
  const w = world(9, { trailSpacing: 3 }); quiet(w);
  const c = w.cfg, s = w.hero;
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
  const s3 = w3.hero;
  grow(w3, 14);
  // lay the trail as a vertical line at x = 600 (fake path: up the line, then a turn toward Dottie)
  w3._pathLen = 0; w3._pathHead = -1;
  for (let k = 0; k <= 140; k++) w3._pushPath(600, 120 + k * 3);
  s3.x = 600; s3.y = 120 + 140 * 3 + 2;  // Dottie at the end of that path
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
  w4.hero.x = 600; w4.hero.y = 542; w4._layoutTrail(0); w4._layoutTrail = function () {};
  w4.hero.x = 450; w4.hero.y = 380; w4.hero.heading = 0; w4.setDir(1, 0);
  run(w4, 2);
  assert.strictEqual(w4.bonks, 1, 'without the hop it bonks');
});

// ---------- golden sea star ----------
test('gold: first at 10 s of play, then 18 s after the previous one is caught or hides; at most one; spawn rules', () => {
  for (const seed of [21, 22, 23]) {
    const w = world(seed);
    const c = w.cfg, s = w.hero;
    w.cfg.notesOnField = 0; w.notes.length = 0; w.songTarget = 999;     // only the golden stars on the sand
    const spawns = [], ends = [];
    let prev = null, maxOut = 0, hideAt = null;
    run(w, 120, () => {
      w.setTarget(480 + 330 * Math.sin(w.time * 0.6), 296 + 160 * Math.cos(w.time * 0.83));
      const gs = w.notes.filter(n => n._g);
      maxOut = Math.max(maxOut, gs.length);
      const g = gs[0] || null;
      if (prev && !g) ends.push(w.levelTime);
      prev = g;
      for (const e of w.drainEvents()) {
        if (e.type === 'goldspawn') {
          const g2 = w.goldStar();
          spawns.push(w.levelTime);
          assert.ok(Math.hypot(g2.x - s.x, g2.y - s.y) >= c.goldMinDist - 1e-9, 'spawns ≥ 160 px from Dottie');
          assert.ok(inside(w, g2.x, g2.y, c.goldR), 'inside');
          assert.ok(g2.gold && g2.worth === 5 && g2.state === 'spawn' && g2.life === c.goldLife);
        }
        if (e.type === 'goldhide') hideAt = w.levelTime;
      }
      if (w.state !== 'playing') return false;
    });
    assert.ok(spawns.length >= 3, 'several golden stars: ' + spawns.length);
    near(spawns[0], c.goldFirst, 2 * H, 'first');
    for (let k = 1; k < spawns.length; k++) {
      const end = ends.filter(t => t < spawns[k] + 1e-9).pop();
      near(spawns[k] - end, c.goldEvery, 2 * H, 'goldEvery after the previous one ended');
    }
    assert.strictEqual(maxOut, 1, 'never two at once');
    assert.ok(hideAt !== null || w.golds > 0);
  }
  // goldNow(): spawns now if none, otherwise returns the live one
  const w = world(24); const g = w.goldNow(); assert.ok(g && g._g); assert.strictEqual(w.goldNow(), g);
  assert.strictEqual(w.notes.filter(n => n._g).length, 1);
  // never during 'ready'
  const w2 = new RP.World({ seed: 25, config: { goldFirst: 0.5 } });
  run(w2, 1.1); assert.strictEqual(w2.goldStar(), null, 'not during ready');
  run(w2, 1.0); assert.ok(w2.goldStar(), 'after go');
});

test('gold: pops out (0.4 s, still), flees, hides after goldLife (11 s on Easy), goldhide + goldMissed, cannot be caught while hiding', () => {
  for (const diff of ['normal', 'easy']) {
    const w = world(26, RP.DIFFICULTY[diff]); quiet(w);
    const c = w.cfg, s = w.hero;
    teleport(w, w.arena.x0 + 30, w.arena.y0 + 30);
    w._stepHero = function () {};                       // Dottie frozen in a corner, far away
    const g = w.goldNow(), x0 = g.x, y0 = g.y;
    run(w, c.goldSpawnTime - 0.02);
    assert.ok(g.state === 'spawn' && g.x === x0 && g.y === y0, 'still while popping out');
    run(w, 0.05); assert.strictEqual(g.state, 'flee');
    let hide = null, events = [];
    run(w, c.goldLife, () => { for (const e of w.drainEvents()) { events.push(e.type); if (e.type === 'goldhide' && hide === null) hide = w.levelTime; } });
    assert.strictEqual(g.state, 'hide'); assert.ok(hide !== null);
    assert.ok(Math.hypot(g.x - x0, g.y - y0) > 40, 'it wandered off');
    // Dottie on top of it while it burrows: no catch
    s.x = g.x; s.y = g.y; w._collide();
    assert.strictEqual(w.golds, 0); assert.ok(w.goldStar() === g);
    run(w, c.goldHideTime + 0.02);
    assert.strictEqual(w.goldStar(), null, 'removed after hiding');
    assert.strictEqual(w.goldMissed, 1);
    assert.strictEqual(c.goldLife, diff === 'easy' ? 11 : 9);
  }
});

test('gold: catch → song +5 (capped), points ×5, a gold star (worth 5) joins the parade, events note+gold', () => {
  const w = world(27); quiet(w);
  const c = w.cfg, s = w.hero;
  teleport(w, 300, 296);
  grow(w, 3);
  w.songTarget = 20;
  const g = w.goldNow(); g.state = 'flee';
  const sc = w.score;
  let note = null, gold = null;
  run(w, 0.5, () => {
    g.x = s.x + Math.cos(s.heading) * 12; g.y = s.y + Math.sin(s.heading) * 12;   // hold it in front of Dottie
    for (const e of w.drainEvents()) { if (e.type === 'note') note = e; if (e.type === 'gold') gold = e; }
    return !gold;
  });
  assert.ok(note && gold, 'note + gold events');
  assert.strictEqual(note.points, (10 + 2 * 3) * 5); assert.strictEqual(gold.points, note.points);
  assert.ok(note.gold && note.worth === 5);
  assert.strictEqual(w.score - sc, 80);
  assert.strictEqual(w.song, 8); assert.strictEqual(w.trail.length, 4);
  const last = w.trail[3]; assert.ok(last.gold && last.worth === 5);
  assert.strictEqual(w.golds, 1); assert.strictEqual(w.goldStar(), null);
  near(w._goldNext, c.goldEvery, 2 * H, 'next one 18 s after the catch');
  // cut off by a bonk it stays gold and keeps its worth; a regrab restores the song (+5) for 5 points
  w._loosen(3, 4, s.x - 50, s.y);
  assert.strictEqual(w.song, 3);
  const loose = w.notes.find(n => n.state === 'loose');
  assert.ok(loose.gold && loose.worth === 5 && !loose._g);
  loose.t = 1; loose.z = 0; loose.x = s.x; loose.y = s.y; w.drainEvents();
  w._collide();
  const ev = w.drainEvents().find(e => e.type === 'note');
  assert.ok(ev.regrab && ev.points === c.regrabPoints && ev.worth === 5);
  assert.strictEqual(w.song, 8);
  assert.strictEqual(w.golds, 1, 'a regrab is not a new golden star');
  // song cap: 2 more needed, the golden star finishes the season and w.song never exceeds the target
  const w2 = world(28); quiet(w2); grow(w2, 0); w2.songTarget = 10;
  for (let i = 0; i < 8; i++) w2._pick({ x: 0, y: 0, kind: 0, gold: false, worth: 1, state: 'idle' });
  w2.drainEvents();
  const g2 = w2.goldNow(); w2._pick(g2);
  const t2 = w2.drainEvents().map(e => e.type);
  assert.strictEqual(w2.song, 10); assert.strictEqual(w2.state, 'cleared');
  assert.ok(t2.includes('gold') && t2.includes('songdone') && t2.includes('cleared'));
});

test('gold: 10 min of random play with a golden star always out — never leaves the arena, never stuck, eased motion', () => {
  const w = world(29); quiet(w);
  const c = w.cfg, s = w.hero, r = new RP.RNG(8);
  w.cfg.goldLife = 1e9;                                 // keep the same star fleeing (stress the motion)
  w.setArena(28, 76, 932, 516, [{ x: 880, y: 470, r: 60 }]);
  let g = w.goldNow(), last = null, win = 0, stuck = 0, loops = 0, path = 0, px0 = g.x, py0 = g.y, maxV = 0, maxW = 0, maxDV = 0, maxDW = 0, pv = 0, pw = 0, caught = 0;
  const vCap = w._baseSpeed * c.goldSpeed * c.goldDart + 1e-6;
  loop(600 * 120, i => {
    if (i % 36 === 0) { if (r.chance(0.5)) w.setDir(r.range(-1, 1), r.range(-1, 1)); else { w.setDir(0, 0); w.setTarget(g.x + r.range(-80, 80), g.y + r.range(-80, 80)); } }
    w.update(H);
    if (!w.goldStar()) { caught++; w.trail.length = 0; w._songSum(); g = w.goldNow(); g.state = 'flee'; last = null; pv = 0; pw = 0; return; }
    if (w.state !== 'playing') { w.state = 'playing'; }
    assert.ok(inside(w, g.x, g.y, c.goldR), 'inside at step ' + i + ': ' + g.x + ',' + g.y);
    assert.ok(Math.hypot(g.x - 880, g.y - 470) >= 60 + c.goldR - 1e-6, 'never under the flip button');
    path += Math.hypot(g.x - px0, g.y - py0); px0 = g.x; py0 = g.y;
    if (g.state === 'flee') {
      maxV = Math.max(maxV, g.speed); maxW = Math.max(maxW, Math.abs(g.turn));
      maxDV = Math.max(maxDV, Math.abs(g.speed - pv)); maxDW = Math.max(maxDW, Math.abs(g.turn - pw));
      pv = g.speed; pw = g.turn;
    }
    if (i % 240 === 0) {                                // every 2 s: really stalled (barely swam) vs looping near Dottie
      if (last && last.id === g.id) { if (path < 30) stuck++; else if (Math.hypot(g.x - last.x, g.y - last.y) < 15) loops++; }
      last = { id: g.id, x: g.x, y: g.y }; win++; path = 0;
    }
  });
  assert.strictEqual(stuck, 0, 'never stuck: ' + stuck + ' of ' + win + ' windows');
  assert.ok(loops <= 6, 'rarely loops back to the same spot: ' + loops);
  assert.ok(maxV <= vCap, 'speed ≤ goldSpeed × level speed × goldDart: ' + maxV);
  assert.ok(maxW <= c.goldTurn * 1.4 + 1e-6, 'turn rate capped: ' + maxW);
  assert.ok(maxDV <= c.goldAccel * H + 1e-6, 'speed eased: ' + maxDV);
  assert.ok(maxDW <= c.goldTurn * 1.4 * (1 - Math.exp(-c.goldTurnEase * H)) * 2 + 1e-6, 'turn eased: ' + maxDW);
  assert.ok(caught > 3, 'random play still catches it now and then: ' + caught);
  console.log('      golden star: caught ' + caught + ' times in 10 min of random play, stalled ' + stuck + ', looped ' + loops + ' of ' + win + ' 2-s windows');
});

test('gold: cornered by Dottie it darts out along a wall; it flees away from her when she is close', () => {
  const w0 = world(30); const A = w0.arena, c = w0.cfg, m = c.goldR;
  for (const [cx, cy] of [[A.x0 + m, A.y0 + m], [A.x1 - m, A.y0 + m], [A.x0 + m, A.y1 - m], [A.x1 - m, A.y1 - m]]) {
    const w = world(30); quiet(w);
    const s = w.hero, ux = cx < 480 ? 1 : -1, uy = cy < 296 ? 1 : -1;
    s.x = cx + ux * 90; s.y = cy + uy * 90; s.heading = Math.atan2(-uy, -ux);
    w._stepHero = function () {};                       // Dottie parked at the corner's mouth
    const g = w.goldNow(); g.x = cx; g.y = cy; g.state = 'flee'; g.heading = Math.atan2(uy, ux) + Math.PI; g.life = 99;
    w._collide = function () {};
    let esc = -1;
    run(w, 4, i => {
      assert.ok(inside(w, g.x, g.y, m));
      if (esc < 0 && Math.hypot(g.x - cx, g.y - cy) > 140) esc = i * H;
    });
    assert.ok(esc > 0 && esc < 3.5, 'escaped the corner (' + cx + ',' + cy + ') in ' + esc + ' s');
    assert.ok(Math.hypot(g.x - s.x, g.y - s.y) > 70, 'slipped past Dottie, not into her');
  }
  // open field: Dottie close behind → it turns away (distance grows while she is parked)
  const w = world(31); quiet(w); w._stepHero = function () {}; w._collide = function () {};
  const g = w.goldNow(); g.state = 'flee'; g.x = 480; g.y = 296; g.life = 99;
  w.hero.x = 400; w.hero.y = 296;
  run(w, 2);
  assert.ok(Math.hypot(g.x - 400, g.y - 296) > 140, 'flees from Dottie: ' + Math.hypot(g.x - 400, g.y - 296));
  assert.ok(g.x > 480, 'away from her side');
});

// ---------- levels ----------
test('song done → cleared (bonus hearts × 100, +1 heart) → next biome; biome cycles + laps', () => {
  const w = world(15); quiet(w);
  const c = w.cfg;
  w.hearts = 2;
  w.songTarget = 10;
  for (let i = 0; i < 9; i++) w._pick({ x: w.hero.x, y: w.hero.y, kind: 0, gold: false, worth: 1, state: 'idle' });
  assert.strictEqual(w.state, 'playing');
  w.drainEvents();
  const sc = w.score;
  w._pick({ x: w.hero.x, y: w.hero.y, kind: 0, gold: false, worth: 1, state: 'idle' });
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
  assert.strictEqual(w.songTarget, 12); assert.strictEqual(w.hearts, 3);
  // hearts capped
  w.hearts = 3; w.state = 'playing'; w.songTarget = 1; w._pick({ x: 0, y: 0, kind: 0, gold: false, worth: 1, state: 'idle' });
  assert.strictEqual(w.hearts, 3);
  // biome cycle + lap
  for (let i = 0; i < 10; i++) {
    w.startLevel(i);
    assert.strictEqual(w.biome, i % 4); assert.strictEqual(w.lap, Math.floor(i / 4));
    assert.strictEqual(w.songTarget, c.songTargets[i % 4] + c.songPerLap * Math.floor(i / 4));
    near(w._baseSpeed, (c.speed0 + c.speedPerBiome * (i % 4)) * Math.pow(c.speedLapMul, Math.floor(i / 4)), 1e-9);
  }
  // reset
  w.reset(); const e2 = w.drainEvents().map(e => e.type);
  assert.deepStrictEqual(J(e2), ['start', 'biome']);
  assert.ok(w.level === 0 && w.score === 0 && w.hearts === c.heartsMax && w.state === 'ready' && w.trail.length === 0);
  near(w.hero.x, 480, 1e-9); near(w.hero.y, 296, 1e-9); assert.strictEqual(w.hero.heading, 0);
  // easy / hard song lengths
  assert.strictEqual(new RP.World({ config: RP.DIFFICULTY.easy }).songTarget, 8);
  assert.strictEqual(new RP.World({ config: RP.DIFFICULTY.hard }).songTarget, 16);
  assert.deepStrictEqual(J(RP.World.CONFIG.songTargets), [10, 12, 14, 16], 'REQUIREMENT: 10 / 12 / 14 / 16 on Normal');
  assert.deepStrictEqual(J(RP.BIOMES), ['Spring Bloom', 'Summer Shallows', 'Autumn Kelp', 'Winter Glow']);
  assert.strictEqual(new RP.World({ config: RP.DIFFICULTY.easy }).hearts, 5);
});

test('dead: last heart → dead {score}, Dottie glides to a stop, no flip', () => {
  const w = world(16); quiet(w);
  w.hearts = 1; grow(w, 16);
  orbitBonk(w);
  assert.strictEqual(w.state, 'dead');
  run(w, 3);
  assert.strictEqual(w.hero.speed, 0);
  assert.ok(!w.action());
});

// ---------- arena ----------
test('setArena at runtime (landscape → portrait 560×1100 → back) keeps everything inside', () => {
  const w = new RP.World({ seed: 17 });
  const bot = new RP.Bot(w, { skill: 1, seed: 2 });
  const check = (label) => {
    const c = w.cfg, s = w.hero;
    assert.ok(inside(w, s.x, s.y, c.heroR), label + ' hero');
    for (const t of w.trail) assert.ok(inside(w, t.x, t.y, c.heroR - 1e-6), label + ' trail ' + t.x + ',' + t.y);
    for (const n of w.notes) assert.ok(inside(w, n.x, n.y, c.noteR), label + ' note');
    const g = w.goldStar(); if (g) assert.ok(inside(w, g.x, g.y, c.goldR - 1e-6), label + ' gold');
  };
  const play = (sec, label) => { let t = 0; while (t < sec) { bot.step(1 / 60); w.update(1 / 60); w.drainEvents(); t += 1 / 60; check(label); } };
  play(14.5, 'landscape');
  assert.ok(w.trail.length > 2);
  w.goldNow();
  const avoid = [{ x: 500, y: 1040, r: 50 }];
  w.setArena(28, 100, 532, 1072, avoid); check('portrait');
  for (const n of w.notes) if (n.state !== 'loose') assert.ok(Math.hypot(n.x - 500, n.y - 1040) > 50, 'not under the button');
  play(25, 'portrait');
  w.setArena(28, 76, 932, 516, []); check('back');
  play(10, 'back');
  w.setArena(28, 76, 932, 516, []); check('same arena is a no-op');
});

// ---------- weather ----------
test('weather: bounded particle counts for every season and canvas size (incl. 720×1600), valid fields, deterministic', () => {
  const sizes = [[960, 540], [560, 1100], [720, 1600], [1280, 540], [320, 480], [960, 960]];
  const sprites = new Set(RP.Weather.SPRITES);
  assert.deepStrictEqual(J(RP.Weather.SPRITES.slice().sort()), ['bubble', 'dot', 'fish', 'jelly', 'kelp', 'ray', 'sand', 'snow', 'sparkle', 'spawn']);
  for (const [W, Hh] of sizes) {
    for (let b = 0; b < 4; b++) {
      const wx = new RP.Weather({ width: W, height: Hh, seed: b + 1 });
      wx.setBiome(b, { instant: true });
      const env = { hero: { x: W / 2, y: Hh / 2, jump: 0.1, turn: 4, heading: 0, z: 10 } };
      let max = 0;
      for (let k = 0; k < 600; k++) {
        if (k % 40 === 0) { wx.burst('bubble', W / 3, Hh / 2, 12); wx.burst('sand', W / 2, Hh / 2, 12); wx.burst('sparkle', W / 2, Hh / 3, 12); }
        if (k === 300) wx.setBiome((b + 1) % 4);
        if (k === 450) wx.setBiome(b);                     // and straight back
        wx.update(1 / 30, env);
        max = Math.max(max, wx.particles.length);
        for (const p of wx.particles) {
          assert.ok(sprites.has(p.sprite), p.sprite);
          assert.ok(p.layer === 'back' || p.layer === 'front');
          assert.ok(p.alpha >= 0 && p.alpha <= 1 && isFinite(p.x) && isFinite(p.y) && isFinite(p.rot) && isFinite(p.flipX) && p.size > 0, 'fields ' + p.kind);
          if (p.sprite === 'dot') assert.ok(/^rgba/.test(p.color));
        }
      }
      assert.ok(max < 160, W + 'x' + Hh + ' season ' + b + ': ' + max);
      assert.ok(wx.particles.length > 10, 'something to see');
      assert.ok(wx.schools.length <= 3, 'schools bounded');
    }
  }
  // resize keeps the bound
  const wx = new RP.Weather({ width: 960, height: 540, seed: 3 }); wx.setBiome(3, { instant: true });
  wx.resize(720, 1600); for (let k = 0; k < 400; k++) wx.update(1 / 30); assert.ok(wx.particles.length < 160);
  wx.resize(960, 540); for (let k = 0; k < 400; k++) wx.update(1 / 30); assert.ok(wx.particles.length < 160);
  // deterministic for any dt partition (JSON-safe particles: no cycles)
  for (let b = 0; b < 4; b++) {
    const A = new RP.Weather({ seed: 9, biome: b }), B = new RP.Weather({ seed: 9, biome: b });
    for (let k = 0; k < 240; k++) A.update(1 / 60);
    for (let k = 0; k < 80; k++) B.update(1 / 20);
    assert.deepStrictEqual(J(A.particles), J(B.particles));
  }
  // ambient tint per season, fog (haze) strongest in winter
  const am = b => { const w2 = new RP.Weather({ seed: 1 }); w2.setBiome(b, { instant: true }); w2.update(0.1); return w2.ambient; };
  for (let b = 0; b < 4; b++) assert.ok(/^rgba/.test(am(b).tint));
  assert.ok(am(3).fog > am(1).fog);
});

test('weather: season content and believable motion (rise, sway, buoyant bubbles, current, 3-layer snow, jelly pulses, schools)', () => {
  const mk = (b, W, Hh) => { const w2 = new RP.Weather({ seed: 4, width: W || 960, height: Hh || 540 }); w2.setBiome(b, { instant: true }); return w2; };
  const track = (wx, kind, secs, fn) => {
    const seen = new Map();
    for (let k = 0; k < Math.round(secs * 60); k++) {
      wx.update(1 / 60);
      for (const p of wx.particles) if (p.kind === kind) { if (!seen.has(p)) seen.set(p, []); seen.get(p).push({ x: p.x, y: p.y, vy: p.vy, size: p.size, flipX: p.flipX, rot: p.rot, alpha: p.alpha }); }
    }
    return [...seen.values()].filter(a => a.length > 30);
  };
  // spring: spawn specks drift UP, swaying sideways; fish schools cross the screen together
  let wx = mk(0);
  const sp = new Set(wx.particles.map(p => p.sprite));
  assert.ok(sp.has('spawn') && sp.has('fish'), [...sp].join());
  let tr = track(wx, 'rise', 3);
  assert.ok(tr.every(a => a[a.length - 1].y < a[0].y || a[0].y < 0), 'specks rise');
  assert.ok(tr.some(a => Math.max(...a.map(q => q.x)) - Math.min(...a.map(q => q.x)) > 3), 'and sway');
  wx = mk(0);
  let fishMoves = [];
  for (let k = 0; k < 60 * 20; k++) {
    wx.update(1 / 60);
    for (const sc of wx.schools) if (sc.wait <= 0 && sc.fish.length) {
      assert.ok(sc.fish.length >= 3 && sc.fish.length <= 6);
      const xs = sc.fish.map(f => f.x), ys = sc.fish.map(f => f.y);
      assert.ok(Math.max(...xs) - Math.min(...xs) < 140 && Math.max(...ys) - Math.min(...ys) < 100, 'school stays together');
      assert.ok(sc.fish.every(f => f.flipX === sc.dir), 'fish face the way they swim');
      fishMoves.push(sc.dir * sc.x);
    }
  }
  assert.ok(fishMoves.length > 100, 'a school crossed');
  // summer: 3–5 light rays near the top, slow sway, low alpha; bubbles rise faster and grow as they rise
  wx = mk(1);
  const rays = wx.particles.filter(p => p.sprite === 'ray');
  assert.ok(rays.length >= 3 && rays.length <= 5, 'rays ' + rays.length);
  tr = track(wx, 'ray', 4);
  for (const a of tr) {
    assert.ok(a.every(q => q.alpha <= 0.21), 'rays are faint');
    for (let i = 1; i < a.length; i++) assert.ok(Math.abs(a[i].x - a[i - 1].x) < 1 && Math.abs(a[i].rot - a[i - 1].rot) < 0.01, 'slow sway');
  }
  wx = mk(1);
  tr = track(wx, 'bubble', 6);
  let faster = 0, grows = 0, n = 0;
  for (const a of tr) {
    const lo = a.findIndex(q => q.y < 400), hi = a.findIndex(q => q.y < 150);
    if (lo < 0 || hi < 0 || hi <= lo + 10) continue;
    n++; if (-a[hi].vy > -a[lo].vy) faster++; if (a[hi].size > a[lo].size) grows++;
  }
  assert.ok(n > 3 && faster === n && grows === n, 'bubbles speed up and grow near the surface: ' + faster + '/' + grows + '/' + n);
  // autumn: kelp leaves move with the current (which changes slowly), tumbling (flipX and rot change)
  wx = mk(2);
  const cur = [];
  tr = track(wx, 'tumble', 8);
  wx = mk(2); for (let k = 0; k < 60 * 120; k++) { wx.update(1 / 60); if (k % 60 === 0) cur.push(wx.current.x); }
  assert.ok(Math.max(...cur) - Math.min(...cur) > 15, 'current strength changes');
  for (let i = 1; i < cur.length; i++) assert.ok(Math.abs(cur[i] - cur[i - 1]) < 4, 'slowly');
  assert.ok(tr.some(a => a.some(q => q.flipX < 0) && a.some(q => q.flipX > 0)), 'leaves tumble over');
  // winter: marine snow in 3 depth layers, nearer = bigger + faster; jellies pulse up
  wx = mk(3);
  const sinks = wx.particles.filter(p => p.kind === 'sink');
  const depths = [...new Set(sinks.map(p => p.depth))].sort();
  assert.strictEqual(depths.length, 3, 'snow in 3 depth layers');
  const avg = (d, k) => { const a = sinks.filter(p => p.depth === d); return a.reduce((s2, p) => s2 + p[k], 0) / a.length; };
  assert.ok(avg(depths[0], 'fall') < avg(depths[1], 'fall') && avg(depths[1], 'fall') < avg(depths[2], 'fall'), 'parallax speed');
  assert.ok(avg(depths[0], 'size0') < avg(depths[2], 'size0'), 'parallax size');
  const jl = wx.particles.filter(p => p.kind === 'jelly');
  assert.ok(jl.length >= 2 && jl.length <= 4);
  tr = track(wx, 'jelly', 8);
  for (const a of tr) {
    assert.ok(a.some(q => q.vy < -10), 'a pulse pushes it up');
    assert.ok(a.some(q => q.flipX < 0.85), 'bell squeezes');
    assert.ok(a.some(q => q.vy > 0), 'then it sinks a little');
  }
  // portrait 720×1600 still has content spread over the full height
  wx = mk(3, 720, 1600); wx.update(2);
  const ys = wx.particles.filter(p => p.kind === 'sink').map(p => p.y);
  assert.ok(Math.max(...ys) > 1200 && Math.min(...ys) < 400, 'covers a tall canvas');
  // Dottie's bubbles while she flips
  wx = mk(0); const n0 = wx.particles.filter(p => p.kind === 'bubblefx').length;
  wx.update(0.5, { hero: { x: 300, y: 300, jump: 0.2, heading: 0, z: 10, turn: 0 } });
  assert.ok(wx.particles.filter(p => p.kind === 'bubblefx').length > n0 + 2, 'bubbles trail Dottie');
});

// ---------- bot ----------
test('bot: skill 1 clears season 1 on normal in > 90 % of 50 seeds; skill 0.4 survives season 1 on easy', () => {
  let ok = 0, times = [];
  for (let k = 0; k < 50; k++) {
    const g = playGame(100 + k * 31, 'normal', 1, 240, 1);
    if (g.w.levelsCleared >= 1) { ok++; times.push(g.t); }
  }
  assert.ok(ok > 45, 'cleared ' + ok + '/50');
  console.log('      season 1 cleared ' + ok + '/50, median ' + times.sort((a, b) => a - b)[times.length >> 1].toFixed(1) + ' s');
  let okE = 0;
  for (let k = 0; k < 20; k++) { const g = playGame(400 + k * 17, 'easy', 0.4, 240, 1); if (g.w.levelsCleared >= 1) okE++; }
  assert.ok(okE >= 19, 'easy, skill 0.4: ' + okE + '/20');
});

test('bot: only uses the input API; 10 minutes simulate in ~2 s', () => {
  const t0 = Date.now();
  const g = playGame(5, 'normal', 1, 600);
  const ms = Date.now() - t0;
  assert.ok(ms < 4000, '10 min sim took ' + ms + ' ms');
  console.log('      10 min (world + bot, 60 fps) in ' + ms + ' ms; level ' + g.w.level + ', bonks ' + g.w.bonks + ', golds ' + g.w.golds + '/' + (g.w.golds + g.w.goldMissed));
  assert.notStrictEqual(g.w.state, 'dead', 'skill-1 bot survives 10 min on normal');
  assert.ok(g.w.golds >= 0.8 * (g.w.golds + g.w.goldMissed), 'bot catches most golden stars');
  assert.ok(g.bot.stats.thinks > 1000 && g.bot.stats.levels === g.w.levelsCleared);
  // high speed: same game at dt 0.1 × 16 still plays
  const w = new RP.World({ seed: 3 }), bot = new RP.Bot(w, { skill: 1, seed: 1 });
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
