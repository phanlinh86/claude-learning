#!/usr/bin/env node
// Pebble's Oasis Run — headless unit tests for rng / world / weather / bot (node, no deps).
// Run from projects/daily-game/robot-oasis-run:   node tests/unit/run.js
'use strict';
const assert = require('assert');
const { load } = require('./load');

const PO = load();
const C = PO.World.CONFIG;
const H = C.step;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const near = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, (m || '') + ' got ' + a + ' want ' + b + ' ±' + tol);

// ---------- helpers ----------
function mk(diff, seed, extra) { return new PO.World(Object.assign({ seed: seed || 1, difficulty: diff || 'normal' }, extra || {})); }
/** a world with an empty track and no boss (for controlled experiments), at cruising speed */
function clean(diff, seed) {
  const w = mk(diff, seed);
  w._gen.nextS = 1e12; w.objects.length = 0; w.boss.nextT = 1e9;
  w.speed = w._targetSpeed(); w.drainEvents();
  return w;
}
function steps(w, n, onEv) { const ev = []; for (let i = 0; i < n; i++) { w.update(H); for (const e of w.drainEvents()) { ev.push(e); if (onEv) onEv(e, w); } } return ev; }
function run(w, s, onEv) { return steps(w, Math.round(s / H), onEv); }
function runUntil(w, pred, max) {
  const ev = []; let t = 0; max = max || 10;
  while (t < max) { w.update(H); t += H; const e = w.drainEvents(); ev.push(...e); if (pred(e, w)) break; }
  return { ev, t };
}
const of = (ev, t) => ev.filter(e => e.type === t);
function play(diff, seed, skill, maxS, opts) {
  opts = opts || {};
  const w = mk(diff, seed, opts.world);
  if (opts.immortal) w.hearts = w.maxHearts = 1e6;
  const bot = skill === null ? null : new PO.Bot(w, { skill, seed: seed * 7 + 1 });
  const dt = 1 / 60; let t = 0, last = 0, hits = 0, maxObj = 0;
  const ch = [], ev = [];
  while (w.phase === 'play' && t < maxS && (!opts.chapters || ch.length < opts.chapters)) {
    if (bot) bot.step(dt);
    w.update(dt); t += dt;
    maxObj = Math.max(maxObj, w.objects.length);
    for (const e of w.drainEvents()) {
      if (opts.onEv) opts.onEv(e, w);
      if (opts.keep) ev.push(e);
      if (e.type === 'bump') hits++;
      if (e.type === 'levelUp') { ch.push({ t: t - last, hits }); last = t; hits = 0; }
    }
  }
  return { w, t, ch, ev, maxObj, bot };
}

// ---------- RNG ----------
test('rng: API unchanged and deterministic', () => {
  const a = new PO.RNG(42), b = new PO.RNG(42);
  for (let i = 0; i < 200; i++) { const x = a.next(); assert.strictEqual(x, b.next()); assert.ok(x >= 0 && x < 1); }
  for (const f of ['next', 'range', 'int', 'pick', 'chance', 'gauss', 'sign', 'fork']) assert.strictEqual(typeof a[f], 'function', f);
});

// ---------- API surface ----------
test('world: API surface + CONFIG keys (DESIGN §5.1)', () => {
  const w = mk();
  for (const f of ['reset', 'update', 'move', 'jump', 'setLane', 'drainEvents', 'setLayout', 'gotoLevel', 'getState', 'spawn', 'summonBoss'])
    assert.strictEqual(typeof w[f], 'function', f);
  for (const k of ['step', 'stride', 'laneOmega', 'laneZeta', 'jumpV', 'g', 'jumpBuffer', 'spawnAhead', 'maxSpeed', 'bossEvery',
    'bossEnterT', 'bossLeaveT', 'goal', 'difficulty', 'zones']) assert.ok(C[k] !== undefined, k);
  for (const d of ['easy', 'normal', 'hard']) for (const k of ['hearts', 'speed', 'react', 'pillows', 'pillowEvery', 'zLand', 'flightT', 'aimRandom'])
    assert.ok(C.difficulty[d][k] !== undefined, d + '.' + k);
  w.setLayout(960, 540);
  assert.strictEqual(w.hearts, 3); assert.strictEqual(mk('easy').hearts, 5);
  w.update(0.0123); assert.ok(w.alpha >= 0 && w.alpha < 1);
  const s = w.getState();
  for (const k of ['time', 'phase', 'level', 'zone', 'loop', 'dist', 'levelDist', 'goal', 'progress', 'speed', 'score', 'shells', 'hearts',
    'maxHearts', 'difficulty', 'combo', 'maxCombo', 'hero', 'boss', 'stats']) assert.ok(s[k] !== undefined, k);
  JSON.stringify(s);
  for (const o of w.objects) for (const k of ['id', 'kind', 's', 'z', 'prevZ', 'x', 'prevX', 'y', 'prevY', 'vx', 'vy', 'rot', 'prevRot', 'h', 'w', 'd', 'variant', 'state', 't', 'landX', 'landS'])
    assert.ok(o[k] !== undefined, o.kind + '.' + k);
});

// ---------- determinism ----------
function scripted(seed) {
  const w = mk('normal', seed); w.hearts = w.maxHearts = 99;
  const plan = [[0.5, 'm', 1], [1.3, 'j'], [2.0, 'm', -1], [2.05, 'm', -1], [4.4, 'j'], [7, 'm', 1], [9.1, 'j'], [12, 'm', 1], [31, 'j'], [33, 'm', -1]];
  let k = 0;
  for (let i = 0; i < 60 * 120; i++) {
    const t = i * H;
    while (k < plan.length && plan[k][0] <= t) { const p = plan[k++]; if (p[1] === 'm') w.move(p[2]); else w.jump(); }
    w.update(i % 3 === 0 ? H * 1.5 : H * 0.75);       // uneven frames; the fixed sub-steps make it the same
    w.drainEvents();
  }
  const st = w.getState();
  st.objs = w.objects.map(o => [o.id, o.kind, +o.s.toFixed(9), +o.x.toFixed(9), +o.y.toFixed(9), o.state]);
  return JSON.stringify(st);
}
test('determinism: same seed + inputs → same state after 60 s; other seed differs', () => {
  const a = scripted(7), b = scripted(7), c = scripted(8);
  assert.strictEqual(a, b);
  assert.notStrictEqual(a, c);
});

// ---------- lane change ----------
test('lane change: arrives in < 0.22 s, overshoot ≤ 0.05 u, leans into the move', () => {
  const w = clean(); w.setLane(0);
  w.move(1);
  let t = 0, arrived = -1, maxX = 0, maxTilt = 0;
  for (let i = 0; i < 120; i++) {
    w.update(H); t += H; maxX = Math.max(maxX, w.hero.x); maxTilt = Math.max(maxTilt, w.hero.tilt);
    if (arrived < 0 && Math.abs(w.hero.x - 1) < 0.05) arrived = t;
  }
  assert.ok(arrived > 0 && arrived < 0.22, 'arrived ' + arrived);
  assert.ok(maxX - 1 <= 0.05, 'overshoot ' + (maxX - 1));
  assert.ok(maxTilt > 0.1 && maxTilt <= C.tiltMax + 1e-9, 'tilt ' + maxTilt);
  near(w.hero.x, 1, 1e-3); near(w.hero.tilt, 0, 0.01, 'tilt settles');
  const ev = w.drainEvents(); assert.ok(of(ev, 'lane').length === 1 && of(ev, 'lane')[0].from === 0 && of(ev, 'lane')[0].to === 1);
  assert.strictEqual(w.move(1), false, 'clamped at the edge');
});

test('lane change: two quick moves → two lanes (one queued); a swipe back reverses at once', () => {
  const w = clean(); w.setLane(-1);
  w.move(1); w.update(H * 2); w.move(1);
  assert.strictEqual(w.hero.queued, 1, 'second move queued'); assert.strictEqual(w.hero.lane, 0);
  run(w, 0.5);
  assert.strictEqual(w.hero.lane, 1); near(w.hero.x, 1, 0.01);
  const w2 = clean(); w2.setLane(0);
  w2.move(1); w2.update(H * 3); w2.move(-1);
  assert.strictEqual(w2.hero.lane, 0, 'reversed immediately'); assert.strictEqual(w2.hero.queued, 0);
  run(w2, 0.4); near(w2.hero.x, 0, 0.01);
  // three quick moves: only one queued slot (last one wins)
  const w3 = clean(); w3.setLane(-1); w3.move(1); w3.move(1); w3.move(1); run(w3, 0.6);
  assert.strictEqual(w3.hero.lane, 1);
});

// ---------- jump ----------
test('jump: real gravity arc, apex ≈ 1 u, airtime ≈ 0.65 s, lands exactly on y = 0, squash/stretch', () => {
  const w = clean();
  assert.ok(w.jump());
  assert.ok(w.hero.stretch > 0.99);
  let apex = 0, t = 0, ys = [];
  const r = runUntil(w, (ev, ww) => { apex = Math.max(apex, ww.hero.y); ys.push(ww.hero.y); t += H; return of(ev, 'land').length > 0; }, 2);
  near(apex, 1.0, 0.03, 'apex'); near(r.t, 0.65, 0.02, 'airtime');
  assert.strictEqual(w.hero.y, 0); assert.ok(w.hero.onGround);
  assert.ok(w.hero.squash > 0.5, 'squash on land'); assert.ok(of(r.ev, 'land')[0].hard);
  // constant second difference = −g·dt² (a parabola)
  for (let i = 2; i < ys.length - 2; i++) near(ys[i] - 2 * ys[i - 1] + ys[i - 2], -C.g * H * H, 1e-9, 'second diff');
  assert.strictEqual(w.hero.mood, 'run');
  run(w, 1); assert.ok(w.hero.squash < 0.01 && w.hero.stretch < 0.01, 'envelopes decay');
});

test('jump: buffered press fires on landing; too-early press does not', () => {
  const w = clean(); w.jump();
  runUntil(w, (ev, ww) => ww.hero.vy < 0 && ww.hero.y < 0.25, 2);
  assert.strictEqual(w.jump(), false, 'buffered');
  const r = runUntil(w, ev => of(ev, 'land').length > 0, 1);
  assert.ok(of(r.ev, 'jump').length === 1, 'jumped again on landing'); assert.ok(!w.hero.onGround && w.hero.vy > 0);
  run(w, 1); w.drainEvents();
  const w2 = clean(); w2.jump(); run(w2, 0.25); w2.jump();       // 0.4 s before landing → expires
  const r2 = runUntil(w2, ev => of(ev, 'land').length > 0, 1);
  assert.strictEqual(of(r2.ev, 'jump').length, 0); assert.ok(w2.hero.onGround);
  assert.ok(of(steps(w2, 30), 'jump').length === 0);
});

// ---------- collisions ----------
test('collisions: pots always hit in-lane (even mid-jump), never in the next lane', () => {
  for (const jumpAt of [null, 0.4, 1.2, 2.5]) {
    const w = clean(); w.spawn('pots', 0, 6); let jumped = false;
    const r = runUntil(w, (ev, ww) => {
      const o = ww.objects[0];
      if (jumpAt !== null && !jumped && o.z < jumpAt) { ww.jump(); jumped = true; }
      return of(ev, 'bump').length > 0 || o.z < -1;
    }, 3);
    assert.strictEqual(of(r.ev, 'bump').length, 1, 'jumpAt ' + jumpAt);
    assert.strictEqual(w.hearts, 2);
  }
  const w = clean(); w.spawn('pots', 1, 6); run(w, 1.5);
  assert.strictEqual(w.hearts, 3);
});

test('collisions: a log is cleared by a jump and hits when not jumping', () => {
  const w = clean(); w.spawn('log', 0, 6); run(w, 1.5); assert.strictEqual(w.hearts, 2, 'no jump → hit');
  const w2 = clean(); w2.spawn('log', 0, 8);
  const lead = w2.speed * 0.28 + 0.6;
  runUntil(w2, (ev, ww) => ww.objects[0].z < lead, 3); w2.jump();
  run(w2, 1.5); assert.strictEqual(w2.hearts, 3, 'jumped over');
  // a resting pillow and a tumbleweed are jumpable too
  for (const k of ['pillow', 'tumble']) {
    const w3 = clean(); w3.spawn(k, 0, 8); runUntil(w3, (ev, ww) => ww.objects[0].z < lead, 3); w3.jump(); run(w3, 1.5);
    assert.strictEqual(w3.hearts, 3, k);
    const w4 = clean(); w4.spawn(k, 0, 8); run(w4, 2); assert.strictEqual(w4.hearts, 2, k + ' hits');
  }
});

test('collisions: knocked-aside objects get velocity; pots wobble and are passed through', () => {
  const w = clean(); const o = w.spawn('log', 0, 3);
  runUntil(w, ev => of(ev, 'bump').length > 0, 2);
  assert.strictEqual(o.state, 'hit'); assert.ok(Math.abs(o.vx) > 1.5 && o.vy > 0 && o.vs > 0);
  const x0 = o.x; run(w, 0.3); assert.ok(Math.abs(o.x - x0) > 0.3, 'slides aside'); assert.ok(o.y >= 0);
  const w2 = clean(); const p = w2.spawn('pots', 0, 3);
  runUntil(w2, ev => of(ev, 'bump').length > 0, 2); run(w2, 0.1);
  assert.strictEqual(p.state, 'hit'); assert.strictEqual(p.x, 0); assert.ok(Math.abs(p.rot) > 0.01, 'wobbles');
});

test('shells: collected on the ground, in a jump arc, missed when jumping over a ground shell; combo reset', () => {
  const w = clean();
  for (let i = 0; i < 5; i++) w.spawn('shell', 0, 4 + i * 1.2);
  const ev = run(w, 2);
  assert.strictEqual(of(ev, 'shell').length, 5); assert.strictEqual(w.score, 50); assert.strictEqual(w.combo, 5);
  assert.strictEqual(of(ev, 'shell')[0].points, 10);
  // arc over a log
  const w2 = clean(), items = [], v = w2.speed;
  w2._arc(items, 0, w2.dist + 10, v, 1, 6);
  w2.spawn('log', 0, 10);
  for (const it of items) w2.spawn('shell', 0, it[2] - w2.dist, it[3]);
  const s0 = w2.dist + 10 - v * (2 * C.jumpV / C.g) / 2;
  runUntil(w2, (e, ww) => ww.dist >= s0, 3); w2.jump();
  run(w2, 1.5);
  assert.strictEqual(w2.shells, 6, 'all arc shells'); assert.strictEqual(w2.hearts, 3);
  // jumping over a ground shell misses it
  const w3 = clean(); w3.spawn('shell', 0, 6);
  runUntil(w3, (e, ww) => ww.objects[0].z < ww.speed * 0.33, 2); w3.jump();
  assert.strictEqual(of(run(w3, 1), 'shell').length, 0);
  // missing a shell of a row you were collecting resets combo
  const w4 = clean(), grp = { n: 2, taken: 0 };
  w4.combo = 4; w4.spawn('shell', 0, 4, { grp }); w4.spawn('shell', 1, 5.2, { grp });
  run(w4, 0.75); assert.strictEqual(w4.combo, 5); run(w4, 1.5);
  assert.strictEqual(w4.combo, 0, 'combo reset'); assert.strictEqual(w4.maxCombo, 5);
  // skipping a whole row (taking none of it) keeps the combo
  const w6 = clean(); w6.combo = 3; w6.spawn('shell', 1, 4, { grp: { n: 1, taken: 0 } }); run(w6, 1.5); assert.strictEqual(w6.combo, 3);
  // combo event at 10
  const w5 = clean(); for (let i = 0; i < 10; i++) w5.spawn('shell', 0, 3 + i * 1.2);
  assert.strictEqual(of(run(w5, 3), 'combo').length, 1);
});

test('invulnerability after a hit; stumble slows; hearts → game over → eases to a stop', () => {
  const w = clean(); const v0 = w.speed;
  w.spawn('pots', 0, 3); w.spawn('pots', 0, 5);
  const ev = run(w, 0.6);
  assert.strictEqual(of(ev, 'bump').length, 1, 'second pot during invuln is free'); assert.strictEqual(w.hearts, 2);
  assert.ok(w.speed < v0 * 0.8, 'stumble slows'); assert.strictEqual(w.hero.mood, 'ouch');
  run(w, 1.4); assert.strictEqual(w.hero.invuln, 0);
  w.spawn('pots', 0, 3); const e2 = run(w, 1.2); assert.strictEqual(of(e2, 'heartLost')[0].hearts, 1);
  run(w, 1.7); w.spawn('pots', 0, 3);
  const e3 = run(w, 1.0);
  assert.strictEqual(of(e3, 'gameOver').length, 1); assert.strictEqual(w.phase, 'over'); assert.strictEqual(w.hearts, 0);
  const vOver = w.speed; assert.ok(vOver > 0, 'does not freeze');
  run(w, 1.1); assert.strictEqual(w.speed, 0);
  assert.strictEqual(w.move(1), false); assert.strictEqual(w.jump(), false);
});

// ---------- chapters ----------
test('chapters: progression, bonus 100·(zone+1)·(loop+1), heart regained, goal ×1.1 per loop, gotoLevel', () => {
  const w = clean(); w.hearts = 2;
  const levels = [];
  for (let i = 0; i < 5; i++) {
    w.levelDist = w.goal - 0.01;
    const ev = steps(w, 2);
    const lu = of(ev, 'levelUp'); assert.strictEqual(lu.length, 1);
    levels.push(lu[0]);
    if (i === 0) { assert.strictEqual(of(ev, 'heartGain').length, 1); assert.strictEqual(w.hearts, 3); assert.strictEqual(w.hero.mood, 'happy'); }
    else assert.strictEqual(of(ev, 'heartGain').length, 0, 'max hearts');
  }
  assert.deepStrictEqual(levels.map(l => l.zone), [1, 2, 3, 0, 1]);
  assert.deepStrictEqual(levels.map(l => l.bonus), [100, 200, 300, 400, 200]);
  assert.strictEqual(w.loop, 1); near(w.goal, C.goal.normal * 1.1, 1e-9);
  assert.strictEqual(w.score, 1200); assert.strictEqual(w.stats.levels, 5);
  const w2 = mk(); w2.drainEvents(); w2.gotoLevel(2);
  const e = of(w2.drainEvents(), 'levelUp')[0]; assert.strictEqual(e.zone, 2); assert.strictEqual(e.bonus, 0);
  assert.strictEqual(w2.zone, 2); assert.strictEqual(w2.levelDist, 0);
  const w3 = mk('easy', 1, { level: 3 }); assert.strictEqual(w3.zone, 3);
});

test('running: Easy chapter 1 ≈ 5.5 u/s, +6 % per chapter, +8 % ramp, leg cycle follows distance', () => {
  const w = clean('easy'); run(w, 3);
  near(w.speed, 5.5 * (1 + 0.08 * w.progress), 0.05);
  const r0 = w.hero.run, d0 = w.dist; run(w, 1);
  near((w.hero.run - r0) * C.stride, w.dist - d0, 1e-6);
  const w2 = clean('normal'); w2.gotoLevel(3); w2._gen.nextS = 1e12; w2.objects.length = 0; run(w2, 4); near(w2.speed, 7 * 1.18 * (1 + 0.08 * w2.progress), 0.06);
  const w3 = clean('hard'); w3.gotoLevel(40); w3._gen.nextS = 1e12; w3.objects.length = 0; run(w3, 4); assert.ok(w3.speed <= C.maxSpeed + 1e-9);
});

// ---------- boss ----------
test('boss: first visit at ~30 s, every 30 s, enter → hover → leave, pillows per visit', () => {
  const w = mk('normal', 3); w._gen.nextS = 1e12; w.objects.length = 0;
  const enters = [], leaves = [], throws = [];
  run(w, 100, (e, ww) => {
    ww.hero.invuln = 1;   // keep him safe: we only time the boss here
    if (e.type === 'bossEnter') enters.push(ww.time);
    if (e.type === 'bossLeave') leaves.push(ww.time);
    if (e.type === 'throw') throws.push(ww.time);
  });
  assert.strictEqual(enters.length, 3, 'visits at 30, 60, 90');
  near(enters[0], 30, 0.05); near(enters[1] - enters[0], 30, 0.05); near(enters[2] - enters[1], 30, 0.05);
  assert.ok(leaves.length >= 2 && leaves[0] > enters[0] && leaves[0] < enters[1]);
  assert.strictEqual(throws.filter(t => t < enters[1]).length, C.difficulty.normal.pillows);
  near(throws[1] - throws[0], C.difficulty.normal.pillowEvery, 0.02);
  assert.ok(throws[0] - enters[0] >= C.bossEnterT, 'throws only while hovering');
  assert.strictEqual(w.stats.bossVisits, 3);
});

test('boss: hover sway x = 1.1·sin(0.9 t), z ≈ 11, y ≈ 2.4; windup before each throw', () => {
  const w = clean(); w.summonBoss(); assert.strictEqual(w.boss.state, 'enter');
  run(w, C.bossEnterT + 0.01); assert.strictEqual(w.boss.state, 'hover');
  let maxX = 0, sawWind = false;
  run(w, 3, (e, ww) => { ww.hero.invuln = 1; });
  for (let i = 0; i < 200; i++) {
    w.update(H); w.hero.invuln = 1; maxX = Math.max(maxX, Math.abs(w.boss.x));
    near(w.boss.z, 11, 1e-9); near(w.boss.y, 2.4, 0.13);
    if (w.boss.windup > 0.5 && w.boss.mood === 'throw') sawWind = true;
  }
  assert.ok(maxX <= 1.1 + 1e-9);
  assert.ok(sawWind || w.boss.thrown === w.boss.toThrow);
});

test('pillow: true ballistic arc (y ≥ 0, constant 2nd difference), lands within 0.05 u of landS/landX, spins, then rests', () => {
  for (const diff of ['easy', 'normal', 'hard']) {
    const w = clean(diff); w.summonBoss(); w.setLane(1);
    let p = null;
    runUntil(w, ev => { const t = of(ev, 'throw')[0]; if (t) p = t.o; return !!p; }, 5);
    const D = C.difficulty[diff];
    assert.strictEqual(p.state, 'fly'); near(p.T, D.flightT, 1e-9);
    const ys = [], rot0 = p.rot; let landed = null, prevS = p.s, prevX = p.x;
    runUntil(w, (ev, ww) => {
      ww.hero.invuln = 1;
      if (p.state === 'fly') { ys.push(p.y); assert.ok(p.y >= 0); prevS = p.s; prevX = p.x; }
      const l = of(ev, 'pillowLand').find(e => e.o === p); if (l) landed = ww.time;
      return !!landed;
    }, 3);
    assert.ok(landed, 'landed');
    for (let i = 2; i < ys.length; i++) near(ys[i] - 2 * ys[i - 1] + ys[i - 2], -C.g * H * H, 1e-9, 'parabola');
    assert.ok(Math.max(...ys) > p.h0 + 0.5, 'goes up first');
    near(prevS, p.landS, 0.05 + w.speed * 0 + Math.abs(p.landS - p.s0) * H / p.T + 1e-9, 'last flight s');
    near(prevX, p.landX, 0.05, 'last flight x');
    near(p.s, p.landS, 1e-9); near(p.x, p.landX, 1e-9); assert.strictEqual(p.y, 0);
    near(p.z, D.zLand, 0.8, 'lands zLand ahead');
    assert.ok(Math.abs(p.rot - rot0) > 5, 'spun'); near(Math.cos(p.rot), 1, 1e-9, 'lands upright');
    assert.strictEqual(p.state, 'live');
    run(w, 0.5, (e, ww) => { ww.hero.invuln = 1; }); assert.ok(p.y >= 0);
    // warning time: shadow from throw to reaching Pebble
    if (diff === 'easy') assert.ok(D.flightT + D.zLand / w.speed > 2.5, 'long shadow warning on Easy');
  }
});

test('pillows: Easy aims mostly at a random lane (aimRandom 0.7), Normal at Pebble\'s lane', () => {
  const count = (diff) => {
    let hits = 0, n = 0;
    for (let s = 1; s <= 40; s++) {
      const w = clean(diff, s); w.setLane(-1); w.summonBoss();
      run(w, 8, (e, ww) => { ww.hero.invuln = 1; if (e.type === 'throw') { n++; if (e.o.landX === -1) hits++; } });
    }
    return hits / n;
  };
  const e = count('easy'), nn = count('normal');
  assert.ok(e > 0.38 && e < 0.72, 'easy aimed share ' + e);    // 30 % aimed + 1/3 of the random ones ≈ 0.53
  assert.strictEqual(nn, 1);
});

test('boss: perfect dodge bonus 50·(level+1) and "hmph"; hits → no bonus', () => {
  // the bot dodges every pillow on an empty track
  const w = clean('normal', 2); w.gotoLevel(1); w.drainEvents(); w._gen.nextS = 1e12; w.objects.length = 0;
  const bot = new PO.Bot(w, { skill: 1, seed: 1 }); w.summonBoss();
  let leave = null; const s0 = w.score;
  for (let i = 0; i < 60 * 12 && !leave; i++) { bot.step(1 / 60); w.update(1 / 60); leave = of(w.drainEvents(), 'bossLeave')[0] || null; }
  assert.ok(leave && leave.perfect, 'perfect'); assert.strictEqual(leave.bonus, 100); assert.strictEqual(w.boss.mood, 'hmph');
  assert.strictEqual(w.score - s0, 100); assert.strictEqual(w.stats.bossPerfect, 1);
  assert.ok(w.stats.pillowsDodged >= C.difficulty.normal.pillows);
  // standing still: a pillow hits
  const w2 = clean('normal', 2); w2.summonBoss(); let l2 = null;
  for (let i = 0; i < 120 * 15 && !l2; i++) { w2.update(H); l2 = of(w2.drainEvents(), 'bossLeave')[0] || null; }
  assert.ok(l2 && !l2.perfect && l2.bonus === 0); assert.ok(w2.stats.pillowHits >= 1); assert.ok(w2.boss.hits >= 1);
});

test('boss: game over sends Fizz away; boss returns to away and keeps ≥ 12 s gap', () => {
  const w = clean(); w.summonBoss(); run(w, 2, (e, ww) => { ww.hero.invuln = 1; });
  w.hearts = 1; w.hero.invuln = 0; w.spawn('pots', w.hero.lane, 2);
  run(w, 1); assert.strictEqual(w.phase, 'over'); assert.notStrictEqual(w.boss.state, 'hover');
  run(w, 2); assert.strictEqual(w.boss.state, 'away'); assert.ok(w.boss.nextT >= 10);
});

// ---------- tumbleweed ----------
test('tumbleweed: rolls across (rot = distance / radius), hops, bounces off an edge once', () => {
  const w = clean(); const o = w.spawn('tumble', 1.9, 30, { vx: -1.5 }); w.hero.invuln = 1e9;
  const ev = []; let minX = 9, maxY = 0, rolled = 0;
  for (let i = 0; i < 120 * 4; i++) {
    const x0 = o.x, r0 = o.rot; w.update(H); ev.push(...w.drainEvents());
    near(o.rot - r0, (o.x - x0) / C.kinds.tumble.r, 1e-9); rolled += Math.abs(o.x - x0);
    minX = Math.min(minX, o.x); maxY = Math.max(maxY, o.y);
  }
  assert.strictEqual(of(ev, 'tumbleBounce').length, 1);
  assert.ok(minX < -1.4 && minX > -1.7, 'reached the far edge ' + minX);
  assert.ok(maxY > 0.04 && maxY < 0.2, 'little hops ' + maxY);
  assert.ok(o.vx > 0, 'rolling back after the bounce'); assert.ok(rolled > 4);
  // a generated (sleeping) tumbleweed wakes up when Pebble gets near
  const w2 = clean(); const t2 = w2.spawn('tumble', -1.9, 30, { wake: 2 }); t2.vx = 1.4;
  run(w2, 1); assert.strictEqual(t2.awake, false); near(t2.x, -1.9, 1e-9);
  run(w2, 3); assert.ok(t2.awake && t2.x > -1.9);
});

// ---------- fairness ----------
function fair(diff) {
  const w = mk(diff, 11, { recordRows: true }); w.hearts = w.maxHearts = 1e9;
  const bot = new PO.Bot(w, { skill: 0.9, seed: 5 });
  const pots = new Map(), pillows = [];
  const dt = 1 / 30;
  for (let t = 0; t < 20 * 60; t += dt) {
    bot.step(dt); w.update(dt);
    for (const e of w.drainEvents()) if (e.type === 'throw') pillows.push({ x: e.o.landX, s: e.o.landS });
    for (const o of w.objects) if (o.kind === 'pots' && !pots.has(o.id)) pots.set(o.id, { x: o.x, s: o.s });
  }
  return { w, rows: w.rowLog, pots: [...pots.values()].sort((a, b) => a.s - b.s), pillows };
}
test('fairness: 20 min of track per difficulty — never 3 tall lanes, gaps ≥ rule, a reachable free lane, zone rules', () => {
  for (const diff of ['easy', 'normal', 'hard']) {
    const { w, rows, pots, pillows } = fair(diff);
    assert.ok(w.time > 1199 && w.stats.levels >= 8, diff + ' covered ' + w.stats.levels + ' chapters');
    // object level: tall obstacles within any 2 u window never cover all 3 lanes
    for (let i = 0; i < pots.length; i++) {
      const lanes = new Set();
      for (let j = i; j < pots.length && pots[j].s - pots[i].s < 2; j++) lanes.add(pots[j].x);
      assert.ok(lanes.size < 3, diff + ' 3 tall lanes at s=' + pots[i].s);
    }
    let prev = null, zone0 = 0, heavyBoss = 0;
    const obst = rows.filter(r => r.obstS !== null);
    for (const r of rows) {
      assert.ok(r.tall.length <= 2);
      if (r.zone === 0) { zone0++; assert.ok(/^(pots1|pots2|shellLine|shellZig)$/.test(r.pattern), 'zone 0 has ' + r.pattern); }
      if (r.boss && /^(pots2|log3|tumble)$/.test(r.pattern)) heavyBoss++;
      if (diff === 'easy' && r.zone < 2) assert.notStrictEqual(r.pattern, 'log3');
    }
    assert.strictEqual(heavyBoss, 0, 'light rows while Fizz visits');
    assert.ok(zone0 > 10);
    let lastTall = null;
    for (const r of obst) {
      if (prev) assert.ok(r.obstS - prev.obstS >= r.minGap - 1e-6, diff + ' gap ' + (r.obstS - prev.obstS).toFixed(2) + ' < ' + r.minGap.toFixed(2));
      if (r.tall.length) {
        const free = [-1, 0, 1].filter(l => r.tall.indexOf(l) < 0);
        assert.ok(free.length >= 1);
        if (lastTall) {
          const pf = [-1, 0, 1].filter(l => lastTall.tall.indexOf(l) < 0);
          let k = 9; for (const a of pf) for (const b of free) k = Math.min(k, Math.abs(a - b));
          const time = (r.obstS - lastTall.obstS) / r.vEst;
          if (diff !== 'hard') assert.ok(k < 2 || time >= 0.5, 'two-lane switch in ' + time.toFixed(2) + ' s');
          assert.ok(time >= 0.12 * k + 0.25, diff + ' reachable');
        }
        lastTall = r;
      }
      prev = r;
    }
    // pillows never land on a pot stack
    for (const p of pillows) for (const q of pots) if (q.x === p.x) assert.ok(Math.abs(q.s - p.s) >= 1.2 || true);
    for (const p of pillows) { const bad = pots.find(q => q.x === p.x && Math.abs(q.s - p.s) < 1.2); assert.ok(!bad, 'pillow on pots'); }
  }
});

// ---------- bot ----------
test('bot: skill 1 on Normal clears ≥ 3 chapters with ≤ 1 hit per chapter (4 seeds)', () => {
  let chapters = 0, hits = 0;
  for (let s = 1; s <= 4; s++) {
    const r = play('normal', s, 1, 400, { chapters: 4 });
    assert.ok(r.ch.length >= 3, 'seed ' + s + ' chapters ' + r.ch.length);
    chapters += r.ch.length; hits += r.ch.reduce((a, c) => a + c.hits, 0);
  }
  assert.ok(hits / chapters <= 1, 'hits/chapter ' + hits / chapters);
  console.log('      skill 1 normal: ' + chapters + ' chapters, ' + hits + ' hits');
});

test('bot: skill 0.5 ≈ casual (some hits, but gets through chapter 1 on Easy)', () => {
  let hits = 0, ch = 0;
  for (let s = 1; s <= 4; s++) { const r = play('easy', s, 0.5, 200, { chapters: 2 }); assert.ok(r.ch.length >= 1); ch += r.ch.length; hits += r.w.stats.bumps; }
  const r = play('normal', 2, 0.5, 300, { immortal: true });
  assert.ok(r.w.stats.bumps >= 1, 'a casual player does get bumped sometimes');
  assert.ok(hits / ch < 2.5, 'easy hits/chapter ' + hits / ch);
});

// ---------- bounded counts & performance ----------
test('bounded: objects stay small; 10 minutes simulated in ≈ 2 s', () => {
  const t0 = Date.now();
  const r = play('hard', 9, 0.9, 600, { immortal: true });
  const ms = Date.now() - t0;
  assert.ok(r.maxObj < 90, 'max objects ' + r.maxObj);
  assert.ok(ms < 4000, '10 min took ' + ms + ' ms');
  console.log('      10 min (hard, bot): ' + ms + ' ms, max objects ' + r.maxObj);
});

// ---------- weather ----------
test('weather: every chapter, landscape & portrait, bursts — < 160 particles, stars above the horizon, pale front layer', () => {
  for (const [W, Hh] of [[1280, 540], [960, 540], [560, 1600], [720, 1000]]) {
    const wx = new PO.Weather({ width: W, height: Hh, seed: 3 });
    const hz = Math.round(Hh * (Hh > W ? 0.36 : 0.40)); wx.setHorizon(hz);
    let maxN = 0;
    for (let z = 0; z < 4; z++) {
      wx.setLevel(z, { instant: z === 0 });
      for (let i = 0; i < 60 * 12; i++) {
        if (i % 7 === 0) wx.burst('dust', W / 2, Hh * 0.8, 6, { up: 1, gravity: 60 });
        if (i % 30 === 0) wx.burst('sparkle', W / 2, Hh * 0.6, 30, { speed: 260 });
        wx.update(1 / 60, 8);
        maxN = Math.max(maxN, wx.particles.length);
        for (const p of wx.particles) {
          assert.ok(isFinite(p.x) && isFinite(p.y) && isFinite(p.alpha) && p.size > 0, p.kind);
          if (p.kind === 'star') assert.ok(p.y < hz, 'star below horizon');
          if (p.layer === 'front' && p.kind !== 'burst') {
            assert.ok(p.alpha <= 0.55 + 1e-9);
            if (p.y > hz + 0.5 * (Hh - hz) && Math.abs(p.x - W / 2) < 0.25 * W) assert.ok(p.alpha < 0.05, 'front particle in the lane band');
          }
        }
      }
      const kinds = new Set(wx.particles.filter(p => p.kind !== 'burst' && !p.dying).map(p => p.kind));
      assert.ok(kinds.size >= 2, 'zone ' + z + ' kinds ' + [...kinds]);
      assert.ok(wx.particles.length >= 15, 'zone ' + z + ' has ambient particles');
    }
    assert.ok(maxN < 160, 'max ' + maxN);
    wx.setLevel(1, {}); assert.strictEqual(wx.ambient.shimmer, 0.5);
    wx.resize(Hh, W); wx.update(1 / 60, 5); assert.ok(wx.particles.length < 160);
  }
});

// ---------- run ----------
let fails = 0;
const t0 = Date.now();
for (const t of tests) {
  const s = Date.now();
  try { t.fn(); console.log('PASS ' + t.name + ' (' + (Date.now() - s) + ' ms)'); }
  catch (e) { fails++; console.log('FAIL ' + t.name + '\n      ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n      ') : e)); }
}
console.log('\n' + (tests.length - fails) + '/' + tests.length + ' passed in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
process.exit(fails ? 1 : 0);
