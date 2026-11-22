#!/usr/bin/env node
// Otto's Playroom Dash — headless unit tests for rng / world / weather / bot (node, no deps).
// Run from projects/daily-game/otter-toyroom-run:   node tests/unit/run.js
'use strict';
const assert = require('assert');
const { load } = require('./load');

const OD = load();
const C = OD.World.CONFIG;
const H = C.step;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const near = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, (m || '') + ' got ' + a + ' want ' + b + ' ±' + tol);

// DESIGN §5.1 targets per biome: [gk, apex u, airtime s]
const TARGETS = [[1.0, 1.0, 0.65], [0.7, 1.1, 0.85], [1.25, 0.95, 0.57], [0.5, 1.25, 1.05]];

// ---------- helpers ----------
function mk(diff, seed, extra) { return new OD.World(Object.assign({ seed: seed || 1, difficulty: diff || 'normal' }, extra || {})); }
/** a world with an empty track (for controlled experiments), at cruising speed; optional biome (gravity snapped) */
function clean(diff, seed, level) {
  const w = mk(diff, seed);
  if (level) w.gotoLevel(level);
  w._gen.nextS = 1e12; w.objects.length = 0;
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
  const bot = skill === null ? null : new OD.Bot(w, { skill, seed: seed * 7 + 1 });
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
      if (e.type === 'levelUp') { ch.push({ t: t - last, hits, zone: e.zone }); last = t; hits = 0; }
    }
  }
  return { w, t, ch, ev, maxObj, bot };
}
/** one jump in world w: {apex, air, ys} */
function measureJump(w) {
  assert.ok(w.jump());
  let apex = 0; const ys = [];
  const r = runUntil(w, (ev, ww) => { apex = Math.max(apex, ww.hero.y); ys.push(ww.hero.y); return of(ev, 'land').length > 0; }, 3);
  return { apex, air: r.t, ys, ev: r.ev };
}

// ---------- RNG ----------
test('rng: API unchanged and deterministic', () => {
  const a = new OD.RNG(42), b = new OD.RNG(42);
  for (let i = 0; i < 200; i++) { const x = a.next(); assert.strictEqual(x, b.next()); assert.ok(x >= 0 && x < 1); }
  for (const f of ['next', 'range', 'int', 'pick', 'chance', 'gauss', 'sign', 'fork']) assert.strictEqual(typeof a[f], 'function', f);
});

// ---------- API surface ----------
test('world: API surface, CONFIG keys, state & object fields (DESIGN §5.1), no boss left', () => {
  const w = mk();
  for (const f of ['reset', 'update', 'move', 'jump', 'setLane', 'drainEvents', 'setLayout', 'gotoLevel', 'getState', 'spawn'])
    assert.strictEqual(typeof w[f], 'function', f);
  assert.strictEqual(w.summonBoss, undefined); assert.strictEqual(w.boss, undefined);
  for (const k of ['step', 'stride', 'laneOmega', 'laneZeta', 'jumpV', 'g', 'jumpVexp', 'gravEase', 'hang', 'jumpBuffer', 'spawnAhead',
    'maxSpeed', 'goal', 'difficulty', 'zones', 'acornPoints', 'acornY', 'ballV', 'ballRest']) assert.ok(C[k] !== undefined, k);
  assert.strictEqual(JSON.stringify(C.zones.map(z => z.gk)), '[1,0.7,1.25,0.5]');
  assert.strictEqual(Object.keys(C.kinds).sort().join(), 'acorn,ball,blocks,tower');
  for (const d of ['easy', 'normal', 'hard']) for (const k of ['hearts', 'speed', 'react']) assert.ok(C.difficulty[d][k] !== undefined, d + '.' + k);
  w.setLayout(960, 540);
  assert.strictEqual(w.hearts, 3); assert.strictEqual(mk('easy').hearts, 5);
  w.update(0.0123); assert.ok(w.alpha >= 0 && w.alpha < 1);
  const s = w.getState();
  for (const k of ['time', 'phase', 'level', 'zone', 'loop', 'dist', 'levelDist', 'goal', 'progress', 'endS', 'speed', 'score', 'acorns', 'hearts',
    'maxHearts', 'difficulty', 'combo', 'maxCombo', 'gk', 'gTarget', 'g', 'jumpV', 'hero', 'stats']) assert.ok(s[k] !== undefined, k);
  assert.strictEqual(s.boss, undefined); assert.strictEqual(s.shells, undefined);
  assert.strictEqual(Object.keys(s.stats).sort().join(), 'acorns,bumps,dist,jumps,lanes,levels,maxAir,maxApex,time');
  near(w.g, C.g, 1e-12); near(w.jumpV, C.jumpV, 1e-12);
  JSON.stringify(s);
  const w2 = mk('normal', 3, { level: 3 });
  for (const o of w.objects.concat(w2.objects)) {
    for (const k of ['id', 'kind', 's', 'z', 'prevZ', 'x', 'prevX', 'y', 'prevY', 'vx', 'vy', 'rot', 'prevRot', 'h', 'w', 'd', 'variant', 'state', 't'])
      assert.ok(o[k] !== undefined, o.kind + '.' + k);
    assert.ok(/^(tower|blocks|ball|acorn)$/.test(o.kind), o.kind);
    if (o.kind === 'acorn') assert.ok(o.variant >= 0 && o.variant <= 2);
    if (o.kind === 'tower') assert.ok(o.variant === 0 || o.variant === 1);
  }
});

// ---------- determinism ----------
function scripted(seed) {
  const w = mk('normal', seed); w.hearts = w.maxHearts = 99;
  const plan = [[0.5, 'm', 1], [1.3, 'j'], [2.0, 'm', -1], [2.05, 'm', -1], [4.4, 'j'], [7, 'm', 1], [9.1, 'j'], [12, 'm', 1], [31, 'j'], [33, 'm', -1], [80, 'j'], [81, 'm', 1]];
  let k = 0;
  for (let i = 0; i < 90 * 120; i++) {
    const t = i * H;
    while (k < plan.length && plan[k][0] <= t) { const p = plan[k++]; if (p[1] === 'm') w.move(p[2]); else w.jump(); }
    w.update(i % 3 === 0 ? H * 1.5 : H * 0.75);       // uneven frames; the fixed sub-steps make it the same
    w.drainEvents();
  }
  const st = w.getState();
  st.objs = w.objects.map(o => [o.id, o.kind, +o.s.toFixed(9), +o.x.toFixed(9), +o.y.toFixed(9), o.state]);
  return JSON.stringify(st);
}
test('determinism: same seed + inputs → same state after 90 s (crosses a biome + gravity ease); other seed differs', () => {
  const a = scripted(7), b = scripted(7), c = scripted(8);
  assert.strictEqual(a, b);
  assert.notStrictEqual(a, c);
  assert.ok(JSON.parse(a).level >= 1, 'reached biome 2');
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
  const w3 = clean(); w3.setLane(-1); w3.move(1); w3.move(1); w3.move(1); run(w3, 0.6);
  assert.strictEqual(w3.hero.lane, 1);
});

// ---------- jump ----------
test('jump (biome 1): real gravity arc, apex ≈ 1 u, airtime ≈ 0.65 s, lands exactly on y = 0, squash/stretch', () => {
  const w = clean();
  const j = measureJump(w);
  assert.ok(of(j.ev, 'land').length === 1);
  near(j.apex, 1.0, 0.03, 'apex'); near(j.air, 0.65, 0.02, 'airtime');
  assert.strictEqual(w.hero.y, 0); assert.ok(w.hero.onGround);
  assert.ok(w.hero.squash > 0.5, 'squash on land'); assert.ok(of(j.ev, 'land')[0].hard);
  // gk 1 → no hang: constant second difference = −g·dt² (a parabola)
  for (let i = 2; i < j.ys.length - 2; i++) near(j.ys[i] - 2 * j.ys[i - 1] + j.ys[i - 2], -C.g * H * H, 1e-9, 'second diff');
  assert.strictEqual(w.hero.mood, 'run');
  near(w.stats.maxAir, j.air, H + 1e-9); near(w.stats.maxApex, j.apex, 1e-9);
  run(w, 1); assert.ok(w.hero.squash < 0.01 && w.hero.stretch < 0.01, 'envelopes decay');
});

test('jump per biome: apex / airtime hit the DESIGN targets; jump event carries gk; apex hang only below gk 1', () => {
  for (let z = 0; z < 4; z++) {
    const [gk, apexT, airT] = TARGETS[z];
    const w = clean('normal', 1, z);
    near(w.gk, gk, 1e-12, 'snapped gk'); near(w.g, C.g * gk, 1e-9); near(w.jumpV, C.jumpV * Math.pow(gk, C.jumpVexp), 1e-9);
    const j = measureJump(w);
    assert.strictEqual(of(j.ev, 'jump')[0].gk, gk);
    near(j.apex, apexT, 0.05, 'zone ' + z + ' apex'); near(j.air, airT, 0.03, 'zone ' + z + ' airtime');
    const p = OD.World.jumpProfile(gk); near(p.air, j.air, H + 1e-9); near(p.apex, j.apex, 1e-9);
    assert.ok(j.apex <= 1.6, 'apex stays on screen');
    assert.ok(j.apex > C.kinds.blocks.h + 0.4, 'clears foam blocks with room');
    // hang: |second difference| at the apex is smaller than −g·dt² below gk 1
    const top = j.ys.indexOf(Math.max(...j.ys));
    const d2 = j.ys[top + 1] - 2 * j.ys[top] + j.ys[top - 1];
    if (gk < 1) assert.ok(-d2 < 0.85 * w.g * H * H, 'hang at apex z' + z); else near(-d2, w.g * H * H, 1e-9);
  }
  // the order of the feel: moon > floaty > normal > heavy
  const air = TARGETS.map(t => OD.World.jumpProfile(t[0]).air);
  assert.ok(air[3] > air[1] && air[1] > air[0] && air[0] > air[2]);
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

// ---------- gravity ease ----------
test('gravity: levelUp eases gk smoothly over gravEase (gravity event, no jolt); a jump keeps its take-off gravity', () => {
  for (const [fromZ, toZ] of [[0, 1], [1, 2], [2, 3], [3, 0]]) {
    const w = clean('normal', 2, fromZ);
    w.levelDist = w.goal - 0.01;
    const ev = steps(w, 2);
    const lu = of(ev, 'levelUp')[0], gv = of(ev, 'gravity')[0];
    assert.ok(lu && gv, 'events');
    assert.strictEqual(lu.gk, C.zones[toZ].gk); assert.strictEqual(lu.zone, toZ);
    assert.strictEqual(gv.from, C.zones[fromZ].gk); assert.strictEqual(gv.to, C.zones[toZ].gk); assert.strictEqual(gv.gk, gv.to);
    assert.strictEqual(w.gTarget, gv.to);
    const ks = [w.gk]; let t = 0;
    while (t < C.gravEase + 0.2) { w.update(H); t += H; ks.push(w.gk); near(w.g, C.g * w.gk, 1e-9); }
    near(w.gk, gv.to, 1e-12, 'arrived');
    const dk = Math.abs(gv.to - gv.from), maxRate = 1.5 * dk / C.gravEase;     // smoothstep peak rate = 1.5·Δ/T
    for (let i = 1; i < ks.length; i++) {
      assert.ok(Math.abs(ks[i] - ks[i - 1]) <= maxRate * H + 1e-9, 'no jump in gk');
      assert.ok((ks[i] - ks[i - 1]) * (gv.to - gv.from) >= -1e-12, 'monotonic');
    }
    // the rate starts near 0 (ease in) → no jolt
    assert.ok(Math.abs(ks[2] - ks[1]) < 0.1 * maxRate * H + 1e-9, 'eases in');
  }
  // a jump in flight while the ease runs: exact take-off gravity parabola, lands with the old airtime
  const w = clean('normal', 2, 0); const prof = OD.World.jumpProfile(1);
  w.jump(); run(w, 0.1);
  w.levelDist = w.goal - 0.01;
  const ys = [w.hero.y]; let t = 0.1;
  const r = runUntil(w, (ev, ww) => { ys.push(ww.hero.y); t += H; return of(ev, 'land').length > 0; }, 2);
  assert.ok(w.gk < 1 && w.gk > 0.7 - 1e-9);
  near(t, prof.air, 2 * H + 1e-9, 'airtime unchanged mid-ease');
  for (let i = 2; i < ys.length - 2; i++) near(ys[i] - 2 * ys[i - 1] + ys[i - 2], -C.g * H * H, 1e-9, 'take-off gravity');
  void r;
  // gotoLevel snaps (and reports it)
  const w2 = mk(); w2.drainEvents(); w2.gotoLevel(3);
  const ev2 = w2.drainEvents();
  assert.strictEqual(w2.gk, 0.5); assert.strictEqual(of(ev2, 'levelUp')[0].gk, 0.5); assert.strictEqual(of(ev2, 'gravity')[0].from, 1);
  const w3 = mk('easy', 1, { level: 2 }); assert.strictEqual(w3.gk, 1.25); assert.strictEqual(w3.zone, 2);
});

// ---------- collisions ----------
test('collisions: towers always hit in-lane (even mid-jump, every gravity), never in the next lane', () => {
  for (const z of [0, 3]) for (const jumpAt of [null, 0.4, 1.2, 2.5]) {
    const w = clean('normal', 1, z); w.spawn('tower', 0, 6); let jumped = false;
    const r = runUntil(w, (ev, ww) => {
      const o = ww.objects[0];
      if (jumpAt !== null && !jumped && o.z < jumpAt) { ww.jump(); jumped = true; }
      return of(ev, 'bump').length > 0 || o.z < -1;
    }, 3);
    assert.strictEqual(of(r.ev, 'bump').length, 1, 'jumpAt ' + jumpAt);
    assert.strictEqual(of(r.ev, 'bump')[0].kind, 'tower');
    assert.strictEqual(w.hearts, 2);
  }
  const w = clean(); w.spawn('tower', 1, 6); run(w, 1.5);
  assert.strictEqual(w.hearts, 3);
});

test('collisions: foam blocks are cleared by a well-timed jump in every biome and hit when not jumping', () => {
  for (let z = 0; z < 4; z++) {
    const w = clean('normal', 1, z); w.spawn('blocks', 0, 6); run(w, 1.5); assert.strictEqual(w.hearts, 2, 'no jump → hit z' + z);
    const w2 = clean('normal', 1, z); w2.spawn('blocks', 0, 12);
    const lead = w2.speed * OD.World.jumpProfile(w2.gk).air / 2;      // apex over the blocks
    runUntil(w2, (ev, ww) => ww.objects[0].z < lead, 3); w2.jump();
    run(w2, 2); assert.strictEqual(w2.hearts, 3, 'jumped over z' + z);
  }
});

test('ball: rolls (rot = distance / r), bounces under the current g with restitution, one wall bounce, hop height ∝ 1/gk', () => {
  const peaks = [];
  for (let z = 0; z < 4; z++) {
    const w = clean('normal', 1, z); w.hero.invuln = 1e9;
    const o = w.spawn('ball', 1.9, 30, { vx: -1.5 });
    const ev = []; let minX = 9, rolled = 0, lastPeak = 0, curPeak = 0, prevVy = o.vy;
    const peaksZ = [];
    for (let i = 0; i < 120 * 4; i++) {
      const x0 = o.x, r0 = o.rot; w.update(H); w.hero.invuln = 1e9; ev.push(...w.drainEvents());
      near(o.rot - r0, (o.x - x0) / C.kinds.ball.r, 1e-9); rolled += Math.abs(o.x - x0);
      minX = Math.min(minX, o.x); curPeak = Math.max(curPeak, o.y); assert.ok(o.y >= 0);
      if (prevVy < 0 && o.vy > 0) { peaksZ.push(curPeak); lastPeak = curPeak; curPeak = 0; }
      prevVy = o.vy;
    }
    const wall = of(ev, 'ballBounce').filter(e => e.wall), floor = of(ev, 'ballBounce').filter(e => !e.wall);
    assert.strictEqual(wall.length, 1, 'one wall bounce');
    assert.ok(floor.length >= 3, 'floor bounces ' + floor.length);
    assert.ok(minX < -1.4 && minX > -1.7, 'reached the far edge ' + minX);
    assert.ok(o.vx > 0 && rolled > 4);
    const steady = C.ballV * C.ballV / (2 * C.g * C.zones[z].gk);
    near(lastPeak, steady, 0.02, 'steady hop z' + z);
    peaks.push(lastPeak);
    // a real bounce: the first hop is higher, restitution shrinks it toward the floor
    if (peaksZ.length > 2) assert.ok(peaksZ[0] >= peaksZ[peaksZ.length - 1] - 1e-9);
  }
  assert.ok(peaks[3] > peaks[1] && peaks[1] > peaks[0] && peaks[0] > peaks[2], 'moon hops highest');
  // a sleeping ball waits at the roadside and wakes when Otto gets near
  const w2 = clean(); const t2 = w2.spawn('ball', -1.9, 30, { wake: 2 }); t2.vx = 1.4;
  run(w2, 1); assert.strictEqual(t2.awake, false); near(t2.x, -1.9, 1e-9);
  run(w2, 3); assert.ok(t2.awake && t2.x > -1.9);
});

test('ball: a hit needs real vertical overlap — never under a held-high ball, every moon phase jumpable', () => {
  // a ball held high above Otto (bottom above heroH) in his lane: no hit
  const w = clean('normal', 1, 3); const o = w.spawn('ball', 0, 0.2, { awake: true, vx: 0 });
  o.awake = true; o.y = C.heroH + 0.1; o.vy = 0; w.g = 0;            // freeze it there for one step
  w._collide(); assert.strictEqual(w.hearts, 3, 'under it');
  o.y = 0.3; w._collide(); assert.strictEqual(w.hearts, 2, 'overlaps');
  // on the moon every bounce phase of a ball rolling through Otto's lane can be jumped (playtest 2026-11-22)
  let phases = 0, jumpable = 0;
  for (let k = 0; k < 13; k++) {
    phases++;
    for (let lead = 0.1; lead <= 1.4; lead += 0.05) {
      const w2 = clean('normal', 1, 3); w2.setLane(0);
      const b = w2.spawn('ball', 0, 6 + k * 0.17, { vx: 0.001 });
      b.y = 0; b.vy = C.ballV * C.ballKick;
      runUntil(w2, () => b.z < w2.speed * lead, 3); w2.jump(); run(w2, 2);
      if (w2.hearts === 3) { jumpable++; break; }
    }
  }
  assert.strictEqual(jumpable, phases, 'moon: every phase jumpable (' + jumpable + '/' + phases + ')');
  // heavy gravity: the ball stays low → always a hit if you just run, but a jump clears it
  let ran = 0, cleared = 0;
  for (let k = 0; k < 16; k++) {
    const w3 = clean('normal', 1, 2); const b3 = w3.spawn('ball', 0, 12, { vx: 0.001 }); b3.y = 0; b3.vy = C.ballV;
    w3.spawn('ball', 0, 12).state = 'gone';
    run(w3, 1.6); if (w3.hearts === 2) ran++;
    const w4 = clean('normal', 1, 2); const b4 = w4.spawn('ball', 0, 12, { vx: 0.001 }); b4.y = 0; b4.vy = C.ballV;
    const lead = w4.speed * (0.25 + k * 0.02);
    runUntil(w4, (e, ww) => b4.z < lead, 3); w4.jump(); run(w4, 1.5);
    if (w4.hearts === 3) cleared++;
  }
  assert.strictEqual(ran, 16, 'heavy: a low bounce always hits a runner');
  assert.ok(cleared >= 3, 'heavy: some jump timings clear it (' + cleared + '/16)');
});

test('collisions: knocked-aside objects get velocity; towers wobble and are passed through', () => {
  const w = clean(); const o = w.spawn('blocks', 0, 3);
  runUntil(w, ev => of(ev, 'bump').length > 0, 2);
  assert.strictEqual(o.state, 'hit'); assert.ok(Math.abs(o.vx) > 1.5 && o.vy > 0 && o.vs > 0);
  const x0 = o.x; run(w, 0.3); assert.ok(Math.abs(o.x - x0) > 0.3, 'slides aside'); assert.ok(o.y >= 0);
  const w2 = clean(); const p = w2.spawn('tower', 0, 3);
  runUntil(w2, ev => of(ev, 'bump').length > 0, 2); run(w2, 0.1);
  assert.strictEqual(p.state, 'hit'); assert.strictEqual(p.x, 0); assert.ok(Math.abs(p.rot) > 0.01, 'wobbles');
});

// ---------- acorns & scoring ----------
test('acorns: collected on the ground, all of an arc in every gravity, missed when jumping over; combo rules', () => {
  const w = clean();
  for (let i = 0; i < 5; i++) w.spawn('acorn', 0, 4 + i * 1.2);
  const ev = run(w, 2);
  assert.strictEqual(of(ev, 'acorn').length, 5); assert.strictEqual(w.score, 50); assert.strictEqual(w.combo, 5);
  assert.strictEqual(w.acorns, 5); assert.strictEqual(w.stats.acorns, 5);
  const a0 = of(ev, 'acorn')[0];
  for (const k of ['o', 'x', 'y', 'z', 'variant', 'points', 'combo']) assert.ok(a0[k] !== undefined, k);
  assert.strictEqual(a0.points, 10);
  // arcs over blocks, built from the biome's jump path: one jump at arcS grabs them all
  for (let z = 1; z < 4; z++) {
    const w2 = clean('normal', 1, z), items = [], v = w2.speed, prof = OD.World.jumpProfile(w2.gk);
    w2._arc(items, 0, w2.dist + 14, v, prof, 1, 6);
    w2.spawn('blocks', 0, 14);
    for (const it of items) w2.spawn('acorn', 0, it[2] - w2.dist, it[3]);
    const s0 = items[0][3].arcS;
    near(s0, w2.dist + 14 - v * prof.air / 2, 1e-9);
    runUntil(w2, (e, ww) => ww.dist >= s0, 3); w2.jump();
    run(w2, 2);
    assert.strictEqual(w2.acorns, 6, 'all arc acorns z' + z); assert.strictEqual(w2.hearts, 3);
  }
  // jumping over a ground acorn misses it
  const w3 = clean(); w3.spawn('acorn', 0, 6);
  runUntil(w3, (e, ww) => ww.objects[0].z < ww.speed * 0.33, 2); w3.jump();
  assert.strictEqual(of(run(w3, 1), 'acorn').length, 0);
  // missing an acorn of a row you were collecting resets combo
  const w4 = clean(), grp = { n: 2, taken: 0 };
  w4.combo = 4; w4.spawn('acorn', 0, 4, { grp }); w4.spawn('acorn', 1, 5.2, { grp });
  run(w4, 0.75); assert.strictEqual(w4.combo, 5); run(w4, 1.5);
  assert.strictEqual(w4.combo, 0, 'combo reset'); assert.strictEqual(w4.maxCombo, 5);
  const w6 = clean(); w6.combo = 3; w6.spawn('acorn', 1, 4, { grp: { n: 1, taken: 0 } }); run(w6, 1.5); assert.strictEqual(w6.combo, 3);
  const w5 = clean(); for (let i = 0; i < 10; i++) w5.spawn('acorn', 0, 3 + i * 1.2);
  assert.strictEqual(of(run(w5, 3), 'combo').length, 1);
});

test('invulnerability after a hit; stumble slows; hearts → game over → eases to a stop', () => {
  const w = clean(); const v0 = w.speed;
  w.spawn('tower', 0, 3); w.spawn('tower', 0, 5);
  const ev = run(w, 0.6);
  assert.strictEqual(of(ev, 'bump').length, 1, 'second tower during invuln is free'); assert.strictEqual(w.hearts, 2);
  assert.ok(w.speed < v0 * 0.8, 'stumble slows'); assert.strictEqual(w.hero.mood, 'ouch');
  run(w, 1.4); assert.strictEqual(w.hero.invuln, 0);
  w.spawn('tower', 0, 3); const e2 = run(w, 1.2); assert.strictEqual(of(e2, 'heartLost')[0].hearts, 1);
  run(w, 1.7); w.spawn('tower', 0, 3);
  const e3 = run(w, 1.0);
  assert.strictEqual(of(e3, 'gameOver').length, 1); assert.strictEqual(w.phase, 'over'); assert.strictEqual(w.hearts, 0);
  assert.ok(w.speed > 0, 'does not freeze');
  run(w, 1.1); assert.strictEqual(w.speed, 0);
  assert.strictEqual(w.move(1), false); assert.strictEqual(w.jump(), false);
});

// ---------- biomes ----------
test('biomes: progression, bonus 100·(zone+1)·(loop+1), heart regained, goal ×1.1 per loop, gotoLevel', () => {
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
  assert.deepStrictEqual(levels.map(l => l.gk), [0.7, 1.25, 0.5, 1.0, 0.7]);
  assert.strictEqual(w.loop, 1); near(w.goal, C.goal.normal * 1.1, 1e-9);
  assert.strictEqual(w.score, 1200); assert.strictEqual(w.stats.levels, 5);
  const w2 = mk(); w2.drainEvents(); w2.gotoLevel(2);
  const e = of(w2.drainEvents(), 'levelUp')[0]; assert.strictEqual(e.zone, 2); assert.strictEqual(e.bonus, 0);
  assert.strictEqual(w2.zone, 2); assert.strictEqual(w2.levelDist, 0);
  const w3 = mk('easy', 1, { level: 3 }); assert.strictEqual(w3.zone, 3);
});

test('running: Easy biome 1 ≈ 5.5 u/s, +6 % per biome, +8 % ramp, leg cycle follows distance', () => {
  const w = clean('easy'); run(w, 3);
  near(w.speed, 5.5 * (1 + 0.08 * w.progress), 0.05);
  const r0 = w.hero.run, d0 = w.dist; run(w, 1);
  near((w.hero.run - r0) * C.stride, w.dist - d0, 1e-6);
  const w2 = clean('normal', 1, 3); run(w2, 4); near(w2.speed, 7 * 1.18 * (1 + 0.08 * w2.progress), 0.06);
  const w3 = clean('hard', 1, 40); run(w3, 4); assert.ok(w3.speed <= C.maxSpeed + 1e-9);
});

// ---------- fairness ----------
function fairRun(OD2, diff, seed, minutes) {
  const w = new OD2.World({ seed, difficulty: diff, recordRows: true }); w.hearts = w.maxHearts = 1e9;
  const towers = new Map(), lows = new Map();
  const dt = 1 / 30;
  // no player: the world just runs (stats.levels advance with distance); rows are what we check
  for (let t = 0; t < minutes * 60; t += dt) {
    w.update(dt); w.drainEvents(); w.hero.invuln = 1;
    for (const o of w.objects) {
      if (o.kind === 'tower' && !towers.has(o.id)) towers.set(o.id, { x: o.x, s: o.s });
    }
  }
  void lows;
  return { w, rows: w.rowLog, towers: [...towers.values()].sort((a, b) => a.s - b.s) };
}
function checkRows(OD2, diff, rows, towers, label) {
  const CC = OD2.World.CONFIG;
  for (let i = 0; i < towers.length; i++) {
    const lanes = new Set();
    for (let j = i; j < towers.length && towers[j].s - towers[i].s < 2; j++) lanes.add(towers[j].x);
    assert.ok(lanes.size < 3, label + ' 3 tall lanes at s=' + towers[i].s);
  }
  let prev = null, lastTall = null, lastLow = null, zone0 = 0;
  for (const r of rows) {
    assert.ok(r.tall.length <= 2);
    if (r.zone === 0) { zone0++; assert.ok(/^(tower1|tower2|acornLine|acornZig)$/.test(r.pattern), label + ' zone 0 has ' + r.pattern); }
    if (diff === 'easy' && r.zone < 2) assert.notStrictEqual(r.pattern, 'blocks3');
    if (r.pattern === 'ball') assert.ok(r.zone >= 2, 'balls from biome 3');
    if (r.easing) assert.notStrictEqual(r.pattern, 'acornArc');
    // the jump at this row's gravity (and the previous biome's, near a biome start) is accounted for
    const air = Math.max(OD2.World.jumpProfile(r.gk).air, r.easing ? OD2.World.jumpProfile(r.gkPrev).air : 0);
    near(r.air, air, 1e-9, label + ' air');
    near(r.minGap, r.vEst * (CC.difficulty[diff].react + 0.5 * r.airGap) + 2.5, 1e-9);
    assert.ok(r.airGap >= r.air);
    if (r.obstS === null) continue;
    if (prev) {
      const gap = r.obstS - prev.obstS;
      // landing from a jump over the previous row leaves ≥ react seconds before this row
      assert.ok(gap >= r.minGap - 1e-6, label + ' gap ' + gap.toFixed(2) + ' < ' + r.minGap.toFixed(2));
      const tLeft = (gap - 0.5 * r.vEst * prev.air - 2.5) / r.vEst;
      assert.ok(tLeft >= CC.difficulty[diff].react - 1e-6, label + ' reaction after landing ' + tLeft.toFixed(2));
    }
    if (r.low.length && lastLow && (r.lowAll || lastLow.lowAll)) {
      // two must-jump rows: one jump clears the first, Otto lands, and can take off again for the second
      const gap = r.obstS - lastLow.obstS, airMax = Math.max(r.air, lastLow.air, prev.air);
      assert.ok(gap >= r.vEst * airMax + 2.0 - 1e-6, label + ' low-low gap ' + gap.toFixed(2));
    }
    if (r.tall.length) {
      const free = [-1, 0, 1].filter(l => r.tall.indexOf(l) < 0);
      assert.ok(free.length >= 1);
      if (lastTall) {
        const pf = [-1, 0, 1].filter(l => lastTall.tall.indexOf(l) < 0);
        let k = 9; for (const a of pf) for (const b of free) k = Math.min(k, Math.abs(a - b));
        const time = (r.obstS - lastTall.obstS) / r.vEst;
        if (diff !== 'hard') assert.ok(k < 2 || time >= 0.5, label + ' two-lane switch in ' + time.toFixed(2) + ' s');
        assert.ok(time >= 0.12 * k + 0.25, label + ' reachable');
      }
      lastTall = r;
    }
    if (r.low.length) lastLow = r;
    prev = r;
  }
  return zone0;
}
test('fairness: 20 min of track per difficulty — never 3 tall lanes, airtime-scaled gaps, a reachable free lane, zone rules', () => {
  for (const diff of ['easy', 'normal', 'hard']) {
    const { w, rows, towers } = fairRun(OD, diff, 11, 20);
    assert.ok(w.stats.levels >= 8, diff + ' covered ' + w.stats.levels + ' biomes');
    const zone0 = checkRows(OD, diff, rows, towers, diff);
    assert.ok(zone0 > 10);
    assert.ok(rows.some(r => r.easing), 'biome starts are treated as gravity transitions');
    assert.ok(rows.some(r => r.pattern === 'acornArc') && rows.some(r => r.pattern === 'ball'));
  }
});
test('fairness: under EVERY gravity (all biomes forced to gk 0.5 / 0.7 / 1 / 1.25) every row stays avoidable', () => {
  for (const gk of [0.5, 0.7, 1.0, 1.25]) {
    const OD2 = load();
    OD2.World.CONFIG.zones.forEach(z => { z.gk = gk; });
    for (const diff of ['easy', 'hard']) {
      const { rows, towers } = fairRun(OD2, diff, 5, 8);
      checkRows(OD2, diff, rows, towers, diff + ' gk ' + gk);
      // a skill-1 bot really gets through those rows (≤ 1 bump per 2 minutes)
    }
    const r = (function () {
      const w = new OD2.World({ seed: 4, difficulty: 'normal' }); w.hearts = w.maxHearts = 1e6;
      const bot = new OD2.Bot(w, { skill: 1, seed: 3 });
      for (let t = 0; t < 240; t += 1 / 60) { bot.step(1 / 60); w.update(1 / 60); w.drainEvents(); }
      return w;
    })();
    assert.ok(r.stats.bumps <= 2, 'gk ' + gk + ': skill-1 bot bumps ' + r.stats.bumps + ' in 4 min');
  }
});

// ---------- bot ----------
test('bot: skill 1 on Normal clears all 4 biomes (every gravity) with ≤ 1 hit per biome (4 seeds)', () => {
  let chapters = 0, hits = 0; const zones = new Set();
  for (let s = 1; s <= 4; s++) {
    const r = play('normal', s, 1, 400, { chapters: 4 });
    assert.ok(r.ch.length >= 4, 'seed ' + s + ' biomes ' + r.ch.length + ' (hearts ' + r.w.hearts + ')');
    r.ch.forEach(c => zones.add(c.zone));
    chapters += r.ch.length; hits += r.ch.reduce((a, c) => a + c.hits, 0);
    assert.ok(r.w.stats.maxAir > 1.0 && r.w.stats.maxApex > 1.2, 'used moon jumps');
  }
  assert.ok(hits / chapters <= 1, 'hits/biome ' + hits / chapters);
  console.log('      skill 1 normal: ' + chapters + ' biomes, ' + hits + ' hits');
});

test('bot: skill 1 on Hard from the moon biome; skill 0.5 ≈ casual (some hits, but gets through biome 1 on Easy)', () => {
  let hits = 0;
  for (let s = 1; s <= 3; s++) { const r = play('hard', s, 1, 200, { world: { level: 3 }, chapters: 2, immortal: true }); hits += r.w.stats.bumps; assert.ok(r.ch.length >= 2); }
  assert.ok(hits <= 3, 'hard skill-1 hits ' + hits);
  let h2 = 0, ch = 0;
  for (let s = 1; s <= 4; s++) { const r = play('easy', s, 0.5, 200, { chapters: 2 }); assert.ok(r.ch.length >= 1); ch += r.ch.length; h2 += r.w.stats.bumps; }
  const r = play('normal', 2, 0.5, 300, { immortal: true });
  assert.ok(r.w.stats.bumps >= 1, 'a casual player does get bumped sometimes');
  assert.ok(h2 / ch < 2.5, 'easy hits/biome ' + h2 / ch);
});

test('first biome is easy for a 6-year-old: Easy 5.5 u/s, 5 hearts, only towers + acorns, ≥ 1.5 s between obstacle rows', () => {
  const w = mk('easy', 3, { recordRows: true });
  assert.strictEqual(w.maxHearts, 5); assert.strictEqual(C.difficulty.easy.speed, 5.5);
  while (w.level === 0) { w.update(1 / 30); w.drainEvents(); w.hero.invuln = 1; }
  const obst = w.rowLog.filter(r => r.zone === 0 && r.obstS !== null);
  assert.ok(obst.length > 10);
  for (let i = 1; i < obst.length; i++) assert.ok((obst[i].obstS - obst[i - 1].obstS) / obst[i].vEst >= 1.5, 'row every ≥ 1.5 s');
  assert.ok(obst.every(r => /^tower/.test(r.pattern)));
});

// ---------- bounded counts & performance ----------
test('bounded: objects stay small; 10 minutes simulated in ≈ 2 s', () => {
  const t0 = Date.now();
  const r = play('hard', 9, 0.9, 600, { immortal: true });
  const ms = Date.now() - t0;
  assert.ok(r.maxObj < 90, 'max objects ' + r.maxObj);
  assert.ok(ms < 4000, '10 min took ' + ms + ' ms');
  assert.ok(r.w.stats.levels >= 6);
  console.log('      10 min (hard, bot 0.9): ' + ms + ' ms, max objects ' + r.maxObj + ', bumps ' + r.w.stats.bumps);
});

// ---------- weather ----------
const SPRITES = new Set(['dust', 'sparkle', 'butterfly', 'feather', 'confetti', 'leaf', 'star', 'firefly', 'puff', 'ring']);
const BIOME_KINDS = [['butterfly', 'dust'], ['feather'], ['confetti', 'leaf'], ['star', 'firefly']];
test('weather: every biome, landscape & portrait, bursts — < 160 particles, DESIGN sprites, stars above the horizon, pale front layer', () => {
  for (const [W, Hh] of [[1280, 540], [960, 540], [560, 1600], [720, 1000]]) {
    const wx = new OD.Weather({ width: W, height: Hh, seed: 3 });
    const hz = Math.round(Hh * (Hh > W ? 0.36 : 0.40)); wx.setHorizon(hz);
    let maxN = 0;
    for (let z = 0; z < 4; z++) {
      wx.setLevel(z, { instant: z === 0 }); wx.setGravity(C.zones[z].gk);
      for (let i = 0; i < 60 * 12; i++) {
        if (i % 7 === 0) wx.burst('dust', W / 2, Hh * 0.8, 6, { up: 1, gravity: 60 });
        if (i % 30 === 0) wx.burst('sparkle', W / 2, Hh * 0.6, 30, { speed: 260 });
        if (i % 45 === 0) wx.burst('ring', W / 2, Hh * 0.6, 1, { speed: 0 });
        wx.update(1 / 60, 8);
        maxN = Math.max(maxN, wx.particles.length);
        for (const p of wx.particles) {
          assert.ok(isFinite(p.x) && isFinite(p.y) && isFinite(p.alpha) && p.size > 0, p.kind);
          assert.ok(SPRITES.has(p.sprite), 'sprite ' + p.sprite);
          if (p.kind === 'star') assert.ok(p.y < hz, 'star below horizon');
          if (p.layer === 'front' && p.kind !== 'burst') {
            assert.ok(p.alpha <= 0.55 + 1e-9);
            if (p.y > hz + 0.5 * (Hh - hz) && Math.abs(p.x - W / 2) < 0.25 * W) assert.ok(p.alpha < 0.05, 'front particle in the lane band');
          }
        }
      }
      const kinds = new Set(wx.particles.filter(p => p.kind !== 'burst' && !p.dying).map(p => p.kind));
      for (const k of BIOME_KINDS[z]) assert.ok(kinds.has(k), 'zone ' + z + ' has ' + k + ' (' + [...kinds] + ')');
      assert.ok(wx.particles.length >= 15, 'zone ' + z + ' has ambient particles');
    }
    assert.ok(maxN < 160, 'max ' + maxN);
    wx.resize(Hh, W); wx.update(1 / 60, 5); assert.ok(wx.particles.length < 160);
  }
});

test('weather: setGravity — feathers / confetti / stars fall slower on the moon, faster when heavy (eased)', () => {
  function fallRate(zone, gk, kind) {
    const wx = new OD.Weather({ width: 960, height: 540, seed: 5 }); wx.setHorizon(216);
    wx.setLevel(zone, { instant: true }); wx.setGravity(gk, { instant: true });
    const ps = wx.particles.filter(p => p.kind === kind);
    const y0 = new Map(ps.map(p => [p, p.y]));
    for (let i = 0; i < 30; i++) wx.update(1 / 60, 0);
    let s = 0, n = 0; for (const p of ps) if (wx.particles.includes(p) && p.y > y0.get(p)) { s += p.y - y0.get(p); n++; }
    return s / Math.max(1, n);
  }
  for (const [zone, kind] of [[1, 'feather'], [2, 'confetti'], [3, 'star']]) {
    const lo = fallRate(zone, 0.5, kind), mid = fallRate(zone, 1, kind), hi = fallRate(zone, 1.25, kind);
    assert.ok(lo < mid * 0.75 && hi > mid * 1.1, kind + ' fall ' + lo.toFixed(2) + ' / ' + mid.toFixed(2) + ' / ' + hi.toFixed(2));
  }
  const wx = new OD.Weather({}); wx.setGravity(0.5); const f0 = wx.fk;
  wx.update(1 / 60, 0); assert.ok(wx.fk < f0 && wx.fk > 0.95, 'eases, no snap');
  for (let i = 0; i < 180; i++) wx.update(1 / 60, 0);
  near(wx.fk, Math.pow(0.5, 0.75), 0.01);
  assert.strictEqual(typeof wx.setLevel, 'function'); assert.ok(wx.ambient && 'tint' in wx.ambient && 'shimmer' in wx.ambient);
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
