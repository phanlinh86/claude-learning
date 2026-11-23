#!/usr/bin/env node
// Puddle's Greenhouse Hop — headless unit tests for rng / world / weather / bot (node, no deps).
// Run from projects/daily-game/penguin-greenhouse-hop:   node tests/unit/run.js
'use strict';
const assert = require('assert');
const { load } = require('./load');

const PH = load();
const C = PH.World.CONFIG;
const H = C.step;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const near = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, (m || '') + ' got ' + a + ' want ' + b + ' ±' + tol);

// ---------- helpers ----------
function mk(diff, seed, extra) { return new PH.World(Object.assign({ seed: seed || 1, difficulty: diff || 'normal' }, extra || {})); }
/** a world with no generated platforms / fireflies, Puddle already hopping, growth paused unless `grow` */
function clean(diff, seed, grow) {
  const w = mk(diff, seed);
  w.platforms.length = 0; w.fireflies.length = 0; w._gen.top = 1e12;
  w.hero.started = true; w.time = 1; w.drainEvents();
  if (!grow) w._stepSize = function () {};
  return w;
}
function steps(w, n, onEv) {
  const ev = [];
  for (let i = 0; i < n; i++) { w.update(H); for (const e of w.drainEvents()) { ev.push(e); if (onEv) onEv(e, w); } }
  return ev;
}
const run = (w, s, onEv) => steps(w, Math.round(s / H), onEv);
function runUntil(w, pred, max) {
  const ev = []; let t = 0; max = max || 10;
  while (t < max) { w.update(H); t += H; const e = w.drainEvents(); ev.push(...e); if (pred(e, w)) break; }
  return { ev, t };
}
const of = (ev, t) => ev.filter(e => e.type === t);
function play(diff, seed, skill, maxS, opts) {
  opts = opts || {};
  const w = mk(diff, seed);
  if (opts.immortal) w.hearts = w.maxHearts = 1e6;
  const bot = new PH.Bot(w, { skill, seed: seed * 7 + 1 });
  const dt = 1 / 60; let t = 0, last = 0; const lv = [];
  while (w.phase === 'play' && t < maxS) {
    bot.step(dt); w.update(dt); t += dt;
    for (const e of w.drainEvents()) if (e.type === 'levelUp') { lv.push(t - last); last = t; }
  }
  return { w, t, lv, bot };
}
/** independent numeric reach: simulate a hop (exact parabola) steering full from vx = 0 with steering factor k,
 *  return x when the feet come down through dy above the launch point */
function simReach(dy, k) {
  k = k || 1;
  let y = 0, vy = C.bounceV, x = 0, vx = 0, t = 0;
  const dt = 1 / 600, vm = C.maxVx * k, ac = C.accel * k;
  while (t < 3) {
    const v0 = vy; vy = Math.max(-C.maxFall, vy - C.g * dt); const y1 = y + 0.5 * (v0 + vy) * dt;
    vx = Math.min(vm, vx + ac * dt); x += vx * dt; t += dt;
    if (vy < 0 && y >= dy && y1 <= dy) return x;
    y = y1;
    if (vy < 0 && y < dy) return 0;
  }
  return 0;
}
/** drop the hero onto platform p from height `from` above it at x; returns the first bounce event */
function dropOn(w, p, x, from) {
  w.hero.x = w.hero.prevX = x; w.hero.y = (p.y0 !== undefined ? p.y0 : p.y) + from; w.hero.vy = 0; w.hero.vx = 0;
  const r = runUntil(w, e => of(e, 'bounce').length > 0, 3);
  return { ev: r.ev, b: of(r.ev, 'bounce')[0] };
}
function apexAfter(w) { let a = -1e9; for (let i = 0; i < 120 * 1.2; i++) { w.update(H); a = Math.max(a, w.hero.y); if (w.hero.vy < -1) break; } w.drainEvents(); return a; }

// ---------- RNG ----------
test('rng: API and determinism', () => {
  const a = new PH.RNG(42), b = new PH.RNG(42);
  for (let i = 0; i < 200; i++) { const x = a.next(); assert.strictEqual(x, b.next()); assert.ok(x >= 0 && x < 1); }
  for (const f of ['next', 'range', 'int', 'pick', 'chance', 'gauss', 'sign', 'fork']) assert.strictEqual(typeof a[f], 'function', f);
});

// ---------- API surface (the renderer codes against these names) ----------
test('world: API, CONFIG and state field names (DESIGN §5.1), no wind', () => {
  const w = mk('easy');
  for (const f of ['reset', 'update', 'steer', 'setX', 'drainEvents', 'gotoLevel', 'getState', 'spawn', 'setLayout', 'grow', 'setSize'])
    assert.strictEqual(typeof w[f], 'function', f);
  assert.ok(!('wind' in w) && typeof w.gust === 'undefined', 'wind removed');
  for (const k of ['step', 'COLW', 'g', 'bounceV', 'springK', 'rescueK', 'maxFall', 'maxVx', 'accel', 'drag', 'camLead', 'camRate',
    'genAhead', 'catchR', 'lanternSize', 'goal', 'difficulty', 'zones', 'growRate', 'growPerFirefly', 'maxSize', 'bigAt', 'steerK', 'minVxK',
    'leaf', 'basket', 'shrinkT', 'sizeBonusK']) assert.ok(k in C, 'CONFIG.' + k);
  for (const k of ['k', 'c', 'impulse', 'maxBend', 'flick']) assert.ok(k in C.leaf, 'leaf.' + k);
  for (const k of ['len', 'push']) assert.ok(k in C.basket, 'basket.' + k);
  for (const d of ['easy', 'normal', 'hard']) for (const k of ['hearts', 'gap', 'maxDx', 'widthK', 'maxSize', 'flyEvery'])
    assert.ok(k in C.difficulty[d], d + '.' + k);
  assert.strictEqual(JSON.stringify(C.zones.map(z => z.key)), JSON.stringify(['potting', 'fern', 'balcony', 'roof']));
  for (const z of C.zones) for (const k of ['kinds', 'basketAmp']) assert.ok(k in z, 'zone.' + k);
  assert.strictEqual(JSON.stringify(C.zones[0].kinds), JSON.stringify({ pot: 0.6, shelf: 0.4 }));
  assert.strictEqual(JSON.stringify(C.zones[2].kinds), JSON.stringify({ pot: 0.25, shelf: 0.2, leaf: 0.25, basket: 0.3 }));
  for (const k of ['time', 'phase', 'level', 'zone', 'loop', 'camY', 'prevCamY', 'maxY', 'levelY0', 'goal', 'progress', 'score',
    'fireflies', 'fireflyCount', 'lantern', 'hearts', 'maxHearts', 'difficulty', 'hero', 'platforms', 'stats', 'alpha']) assert.ok(k in w, 'world.' + k);
  for (const k of ['x', 'prevX', 'y', 'prevY', 'vx', 'vy', 'dir', 'face', 'squash', 'stretch', 'tilt', 'mood', 'moodT', 'airT', 'lastPlat',
    'invuln', 'rescueT', 'started', 'size', 'prevSize', 'mass', 'big', 'shrinkT']) assert.ok(k in w.hero, 'hero.' + k);
  const p = w.platforms[1];
  for (const k of ['id', 'kind', 'x', 'prevX', 'y', 'prevY', 'w', 'spring', 'springT', 'state', 't', 'bounces', 'path', 'lvl']) assert.ok(k in p, 'platform.' + k);
  const c = clean('normal');
  const leaf = c.spawn('leaf', 3, 2), bas = c.spawn('basket', 6, 4, { len: 2.5, amp: 0.3 });
  for (const k of ['side', 'bend', 'bendV', 'y0']) assert.ok(k in leaf, 'leaf.' + k);
  for (const k of ['px', 'py', 'len', 'ang', 'angV']) assert.ok(k in bas, 'basket.' + k);
  assert.strictEqual(leaf.side, -1); assert.strictEqual(c.spawn('leaf', 9, 2).side, 1);
  const f = w.fireflies[0];
  for (const k of ['id', 'x', 'prevX', 'y', 'prevY', 'bx', 'by', 'ph', 'state', 't']) assert.ok(k in f, 'firefly.' + k);
  for (const k of ['fireflies', 'bounces', 'springs', 'falls', 'rescues', 'levels', 'maxY', 'time', 'lanterns', 'maxSize', 'bigTime',
    'leafFlicks', 'swings', 'shrinks']) assert.ok(k in w.stats, 'stats.' + k);
  assert.ok(!('gusts' in w.stats) && !('puffs' in w.stats));
  assert.strictEqual(w.platforms[0].kind, 'ground');
  assert.strictEqual(w.hearts, 5); assert.strictEqual(mk('normal').hearts, 3); assert.strictEqual(mk('hard').hearts, 3);
  assert.ok(Array.isArray(w.fireflies) && w.fireflies.length > 0, 'fireflies[] is the live array');
  assert.strictEqual(+w.fireflies, 0, 'fireflies reads as the caught count'); assert.strictEqual(String(w.fireflies), '0');
  const st = w.getState(); JSON.stringify(st);
  assert.ok(st.size === 1 && st.big === false && st.mass === 1 && st.hero.size === 1 && !('wind' in st));
});

test('world: determinism (same seed + inputs → same state; another seed differs; any frame dt)', () => {
  function go(seed) {
    const w = mk('normal', seed);
    for (let i = 0; i < 120 * 40; i++) { w.steer(Math.sin(i / 70) > 0.2 ? 1 : Math.sin(i / 70) < -0.2 ? -1 : 0); w.update(H); w.drainEvents(); }
    return JSON.stringify(w.getState()) + JSON.stringify(w.platforms.map(p => [p.kind, p.x, p.y, p.bend || 0, p.ang || 0]));
  }
  assert.strictEqual(go(5), go(5));
  assert.notStrictEqual(go(5), go(6));
  const a = mk('easy', 3), b = mk('easy', 3);
  for (let i = 0; i < 600; i++) { a.update(1 / 60); }
  for (let i = 0; i < 1200; i++) { b.update(1 / 120); }
  near(a.hero.y, b.hero.y, 1e-9); near(a.time, b.time, 1e-9); near(a.hero.size, b.hero.size, 1e-12);
});

// ---------- bounce physics ----------
test('bounce: apex ≈ 2.96 u, rise ≈ 0.48 s, hop ≈ 0.95 s, squash; size does not change the normal bounce', () => {
  for (const size of [1, 1.6]) {
    const w = clean('normal'); w.setSize(size);
    w.spawn('pot', 6, 0, { w: 6 }); w.hero.x = 6; w.hero.y = 0.5; w.hero.vy = 0;
    const b = [];
    let apex = -1, tApex = 0, t = 0;
    for (let i = 0; i < 120 * 4; i++) {
      w.update(H); t += H;
      for (const e of w.drainEvents()) if (e.type === 'bounce') { b.push(t); assert.strictEqual(e.size, size); if (b.length === 1) assert.ok(w.hero.squash > 0.9, 'squash'); }
      if (b.length === 1 && w.hero.y > apex) { apex = w.hero.y; tApex = t - b[0]; }
    }
    near(apex, C.bounceV * C.bounceV / (2 * C.g), 0.01, 'apex');
    near(apex, 3.0, 0.1, 'apex ≈ 3 u');
    near(tApex, C.bounceV / C.g, 0.02, 'rise time');
    near(b[2] - b[1], 2 * C.bounceV / C.g, 0.02, 'air time');
  }
});

test('mushroom: apex ≈ 7.6 u at the centre of its pot, plain bounce off-centre', () => {
  const w = clean('normal');
  const p = w.spawn('pot', 6, 0, { w: 6, spring: true }); w.hero.x = 6; w.hero.y = 0.3; w.hero.vy = 0;
  assert.strictEqual(p.spring, true); assert.strictEqual(w.spawn('shelf', 1, 9, { spring: true }).spring, false, 'only on pots');
  const ev = runUntil(w, e => of(e, 'bounce').length > 0, 2).ev;
  assert.ok(of(ev, 'bounce')[0].spring, 'spring flag');
  assert.ok(p.springT < 0.05);
  let apex = 0; for (let i = 0; i < 120 * 1.5; i++) { w.update(H); apex = Math.max(apex, w.hero.y); }
  near(apex, Math.pow(C.bounceV * C.springK, 2) / (2 * C.g), 0.02); near(apex, 7.6, 0.2);
  const w2 = clean('normal'); w2.spawn('pot', 6, 0, { w: 6, spring: true }); w2.hero.x = 7.2; w2.hero.y = 0.3; w2.hero.vy = 0;
  assert.strictEqual(of(runUntil(w2, e => of(e, 'bounce').length > 0, 2).ev, 'bounce')[0].spring, false);
});

test('platforms are one-way (pass through from below, land from above); landing pad scales with size', () => {
  const w = clean('normal');
  w.spawn('shelf', 6, 0, { w: 4 }); const up = w.spawn('shelf', 6, 1.6, { w: 4 });
  w.hero.x = 6; w.hero.y = 0.2; w.hero.vy = 0;
  const ev = [];
  for (let i = 0; i < 120 * 2; i++) { w.update(H); for (const e of w.drainEvents()) if (e.type === 'bounce') ev.push(e.p.id); }
  assert.ok(ev.length >= 2);
  assert.notStrictEqual(ev[0], up.id, 'first landing is the low shelf');
  assert.strictEqual(ev[1], up.id, 'rising through the upper shelf, then landing on it');
  // just outside the size-1 pad: no landing at size 1, a landing at size 1.5 (wider feet)
  const off = 0.85 + C.landPad + 0.08;
  for (const [size, want] of [[1, 0], [1.5, 1]]) {
    const w2 = clean('normal'); w2.setSize(size); w2.spawn('shelf', 6, 0, { w: 1.7 }); w2.hero.x = 6 + off; w2.hero.y = 0.5;
    assert.strictEqual(Math.min(1, of(run(w2, 1.0), 'bounce').length), want, 'size ' + size);
  }
});

test('steering at size 1: accel to maxVx in ≈ 0.15 s, capped, drag on release; tilt eases', () => {
  const w = clean('normal'); w.spawn('pot', 6, 0, { w: 14 }); w.hero.x = 3; w.hero.y = 0; w.hero.vy = 0;
  w.steer(1); run(w, 0.1);
  near(w.hero.vx, C.accel * 0.1, 0.05, 'linear accel');
  run(w, 0.15); near(w.hero.vx, C.maxVx, 1e-9, 'at max');
  assert.ok(w.hero.face === 1 && w.hero.tilt > 0.1 && w.hero.tilt <= C.tiltMax + 1e-9, 'tilt ' + w.hero.tilt);
  w.steer(0); run(w, 0.25);
  near(w.hero.vx, C.maxVx * Math.exp(-C.drag * 0.25), 0.05, 'drag');
  run(w, 0.4); assert.ok(Math.abs(w.hero.vx) < 0.3);
  w.steer(-1); run(w, 0.05); assert.strictEqual(w.hero.face, -1);
});

test('weight: top speed, accel and drag lower when big, never below minVxK', () => {
  const F = PH.World.steerF;
  near(F(1), 1, 1e-12);
  near(F(1.6), 1 / (1 + C.steerK * (2.56 - 1)), 1e-12); assert.ok(F(1.6) > 0.7 && F(1.6) < 0.76, 'at 1.6 ≈ 0.73× ' + F(1.6));
  assert.ok(F(1.3) < 1 && F(1.3) > F(1.6));
  near(F(2.5), C.minVxK, 1e-12, 'floor');
  function measure(size) {
    const w = clean('normal'); w.setSize(size); w.spawn('pot', 6, 0, { w: 14 }); w.hero.x = 1; w.hero.y = 0; w.hero.vy = 0;
    w.steer(1); run(w, 0.05); const v05 = w.hero.vx; run(w, 0.6); const top = w.hero.vx;
    w.steer(0); run(w, 0.2); return { v05, top, rel: w.hero.vx / top };
  }
  const s1 = measure(1), s16 = measure(1.6), s25 = measure(2.5);
  near(s1.top, C.maxVx, 1e-9); near(s16.top, C.maxVx * F(1.6), 1e-9);
  assert.ok(s16.v05 < s1.v05 * 0.8, 'accel lower ' + s16.v05 + ' vs ' + s1.v05);
  assert.ok(s16.rel > s1.rel, 'drifts further when heavy');
  near(s25.top, C.maxVx * C.minVxK, 1e-9, 'never below the floor');
  // getting heavier mid-run never snaps the speed: it relaxes down to the new cap
  const w = clean('normal'); w.spawn('pot', 6, 0, { w: 14 }); w.hero.x = 1; w.hero.y = 0; w.steer(1); run(w, 0.4);
  w.setSize(1.6); w.update(H); assert.ok(w.hero.vx > C.maxVx * F(1.6) + 0.5, 'eases'); run(w, 0.2); near(w.hero.vx, C.maxVx * F(1.6), 1e-9);
});

test('walls: clamp at heroR·size, bounce back, event wall', () => {
  for (const size of [1, 1.5]) {
    const w = clean('normal'); w.setSize(size); w.spawn('pot', 6, 0, { w: 14 }); w.hero.x = 9; w.hero.y = 0;
    w.steer(1);
    let ev = [], minX = 99, maxX = -99, bounced = false;
    for (let i = 0; i < 120 * 2; i++) {
      const vx0 = w.hero.vx; w.update(H); const e = w.drainEvents(); ev.push(...e);
      maxX = Math.max(maxX, w.hero.x);
      if (of(e, 'wall').length) { assert.strictEqual(e.find(q => q.type === 'wall').side, 1); bounced = bounced || (w.hero.vx < 0 && vx0 > 0); }
    }
    near(maxX, C.COLW - C.heroR * size, 1e-9); assert.ok(of(ev, 'wall').length >= 1); assert.ok(bounced, 'vx reversed');
    w.steer(-1); for (let i = 0; i < 120 * 4; i++) { w.update(H); minX = Math.min(minX, w.hero.x); }
    near(minX, C.heroR * size, 1e-9);
  }
});

// ---------- growth (the twist) ----------
test('growth: growRate per second while playing, + growPerFirefly, capped per difficulty', () => {
  const w = clean('normal', 1, true); w.spawn('pot', 6, 0, { w: 14 }); w.hero.y = 0;
  run(w, 10); near(w.hero.size, 1 + 10 * C.growRate, 1e-6, 'rate');
  near(w.hero.mass, w.hero.size * w.hero.size, 1e-12);
  const s0 = w.hero.size; w.spawn('firefly', w.hero.x, w.hero.y + 0.6); run(w, H * 2);
  near(w.hero.size - s0, C.growPerFirefly + 2 * H * C.growRate, 1e-6, 'per firefly');
  // not before the first hop
  const w0 = mk('easy'); run(w0, 0.4); assert.strictEqual(w0.hero.size, 1);
  for (const d of ['easy', 'normal', 'hard']) {
    const v = clean(d, 1, true); v.grow(5); assert.strictEqual(v.hero.size, C.difficulty[d].maxSize, d + ' cap');
    run(v, 5); assert.strictEqual(v.hero.size, C.difficulty[d].maxSize);
    assert.strictEqual(v.stats.maxSize, C.difficulty[d].maxSize);
  }
  assert.strictEqual(C.difficulty.easy.maxSize, 1.5); assert.strictEqual(C.difficulty.normal.maxSize, 1.6);
});

test('growth: grow event every 0.1, one big event at bigAt, bigTime counts', () => {
  const w = clean('normal', 1, true); w.spawn('pot', 6, 0, { w: 14 }); w.hero.y = 0;
  const ev = [];
  for (let i = 0; i < 12; i++) { w.grow(0.05); ev.push(...w.drainEvents()); }
  const g = of(ev, 'grow');
  assert.strictEqual(g.map(e => e.step).join(), '1,2,3,4,5,6', 'steps');
  for (const e of g) assert.ok(e.size >= 1 + e.step * 0.1 - 1e-9 && e.size < 1 + e.step * 0.1 + 0.05 + 1e-9);
  const b = of(ev, 'big'); assert.strictEqual(b.length, 1); assert.ok(b[0].size >= C.bigAt - 1e-9 && b[0].size < C.bigAt + 0.06);
  assert.strictEqual(w.hero.big, true);
  run(w, 2); near(w.stats.bigTime, 2, 0.02);
  w.setSize(1.1); assert.strictEqual(w.hero.big, false); assert.strictEqual(w.drainEvents().length, 0, 'setSize is silent');
});

test('growth: metre points ×2 while big', () => {
  const w = clean('easy'); w.camY = 0;
  w.hero.y = 10.4; w.hero.vy = 0.01; run(w, 0.02); assert.strictEqual(w.score, 10);
  w.setSize(1.35); w.hero.y = 15.4; w.hero.vy = 0.01; run(w, 0.02); assert.strictEqual(w.score, 20, '5 m × 2');
});

test('growth: levelUp pays bonus + sizeBonus, then Puddle shrinks to 1.0 over shrinkT', () => {
  const w = clean('normal', 1, true); w.hearts = 2; const G = C.goal.normal;
  w.spawn('pot', 6, G - 0.5, { w: 6 }); w.camY = G - 5; w.hero.y = G + 0.2; w.hero.vy = 1; w.maxY = G - 0.1;
  w.setSize(1.45);
  const s0 = w.score, ev = run(w, 0.05), lu = of(ev, 'levelUp')[0];
  assert.ok(lu && lu.level === 1 && lu.zone === 1 && lu.bonus === 100, JSON.stringify(lu));
  near(lu.size, 1.45, 0.01); assert.strictEqual(lu.sizeBonus, Math.round(C.sizeBonusK * (lu.size - 1)));
  assert.strictEqual(lu.sizeBonus, 90);
  assert.ok(w.score >= s0 + 190);
  assert.ok(w.hero.shrinkT > 0 && w.hero.size < 1.45 && w.hero.size > 1.3, 'shrinking ' + w.hero.size);
  run(w, C.shrinkT / 2 - 0.05); assert.ok(w.hero.size > 1.1 && w.hero.size < 1.35, 'mid ' + w.hero.size);
  let prev = w.hero.size, mono = true;
  while (w.hero.shrinkT > 0) { w.update(H); if (w.hero.size > prev + 1e-12) mono = false; prev = w.hero.size; }
  run(w, 0.05);
  assert.ok(mono, 'eases down monotonically');
  near(w.hero.size, 1 + C.growRate * 0.05, 0.01, 'back to 1.0 (then growing again)');
  assert.strictEqual(w.hero.shrinkT, 0); assert.strictEqual(w.stats.shrinks, 1); assert.strictEqual(w.hero.big, false);
  assert.strictEqual(w.hearts, 3); assert.strictEqual(w.hero.mood, 'happy');
  // no grow events while shrinking; growing again later re-emits from step 1
  const w2 = clean('normal', 1, true); w2.setSize(1.5); w2.gotoLevel(1); let e2 = w2.drainEvents();
  assert.strictEqual(of(e2, 'levelUp')[0].sizeBonus, 0, 'test hook pays nothing');
  e2 = run(w2, C.shrinkT + 0.05); assert.strictEqual(of(e2, 'grow').length, 0);
  w2.grow(0.12); e2 = w2.drainEvents(); assert.strictEqual(of(e2, 'grow').map(e => e.step).join(), '1');
});

test('growth: catch radius grows with size (catchR·(0.75 + 0.25·size))', () => {
  for (const [size, want] of [[1, 0], [1.6, 1]]) {
    const w = clean('easy'); w.setSize(size); w.hero.x = 6; w.hero.y = 20; w.hero.vy = 0; w.camY = 15;
    w.spawn('firefly', 6 + 0.86, 20 + C.bodyY * size).ph = 0;   // 0.86 > 0.8 (size 1) but < 0.92 (size 1.6)
    w._stepFlies(0);
    assert.strictEqual(w.fireflyCount, want, 'size ' + size);
  }
});

// ---------- leaves ----------
function leafPeak(mass, x) {
  const w = clean('normal'); w.setSize(Math.sqrt(mass));
  const p = w.spawn('leaf', 6, 0, { w: 2.6, side: -1 });
  const r = dropOn(w, p, x === undefined ? 6 : x, 3.0);
  let peak = 0; for (let i = 0; i < 120 * 0.4; i++) { w.update(H); peak = Math.max(peak, p.bend); }
  return { peak, ev: r.ev, w, p };
}
test('leaf: bends more with mass (light barely, heavy deeply, never past maxBend), event leafBend', () => {
  const a = leafPeak(1), b = leafPeak(2.56), tip = leafPeak(2.56, 7.2);
  assert.ok(a.peak > 0.03 && a.peak < 0.16, 'light ' + a.peak);
  assert.ok(b.peak > 2 * a.peak && b.peak <= C.leaf.maxBend + 1e-9, 'heavy ' + b.peak);
  assert.ok(tip.peak >= b.peak - 1e-9, 'landing near the tip bends more');
  const lb = of(a.ev, 'leafBend')[0]; assert.ok(lb && lb.p === a.p && lb.depth > 0 && lb.depth <= 1);
  assert.ok(of(b.ev, 'leafBend')[0].depth > lb.depth);
  near(a.p.y, a.p.y0 - (a.p.w / 2) * Math.sin(a.p.bend), 1e-9, 'p.y includes the bend');
});

test('leaf: underdamped — 2–3 visible oscillations, settles in ≈ 1 s', () => {
  const w = clean('normal'); const p = w.spawn('leaf', 6, 50, { w: 2.6 });
  p.bendV = 5; const tr = [];
  for (let i = 0; i < 120 * 2; i++) { w.update(H); tr.push(p.bend); }
  const peak = Math.max(...tr);
  let ext = 0;                                       // extremes bigger than 10 % of the first peak
  for (let i = 1; i < tr.length - 1; i++) if (Math.abs(tr[i]) > 0.1 * peak && Math.abs(tr[i]) >= Math.abs(tr[i - 1]) && Math.abs(tr[i]) > Math.abs(tr[i + 1]) && Math.sign(tr[i]) !== 0) ext++;
  assert.ok(ext >= 4 && ext <= 6, 'visible half-swings ' + ext);   // 4–6 extremes = 2–3 oscillations
  const after = tr.slice(Math.round(1.0 * 120)).map(Math.abs);
  assert.ok(Math.max(...after) < 0.06 * peak, 'settled after 1 s: ' + Math.max(...after) / peak);
  const at05 = Math.max(...tr.slice(60, 70).map(Math.abs)); assert.ok(at05 > 0.03 * peak, 'still moving at 0.5 s');
  const om = Math.sqrt(C.leaf.k), zeta = C.leaf.c / (2 * om); assert.ok(zeta > 0.1 && zeta < 0.3, 'ζ ' + zeta);
});

test('leaf: flick bounce higher when big, capped ×1.15; none when light', () => {
  const apex = mass => { const r = leafPeak(mass); const w = clean('normal'); w.setSize(Math.sqrt(mass)); const p = w.spawn('leaf', 6, 0, { w: 2.6 }); const d = dropOn(w, p, 6, 3); return { a: apexAfter(w) - d.b.y, b: d.b, r }; };
  const light = apex(1), mid = apex(1.3 * 1.3), big = apex(2.56);
  const h0 = C.bounceV * C.bounceV / (2 * C.g);
  near(light.a, h0, 0.02, 'light = normal');
  assert.strictEqual(light.b.flick, 1);
  near(mid.b.flick, 1 + C.leaf.flick * (1.69 - 1), 1e-9); assert.ok(mid.a > h0 + 0.3, 'mid flick');
  near(big.b.flick, C.leaf.flickCap, 1e-9, 'capped'); near(big.a, h0 * C.leaf.flickCap * C.leaf.flickCap, 0.03);
  const w = clean('normal'); w.setSize(1.6); const p = w.spawn('leaf', 6, 0); dropOn(w, p, 6, 3); assert.strictEqual(w.stats.leafFlicks, 1);
});

test('leaf: landing uses the moving (bent) surface at the contact x — no tunnelling', () => {
  let landed = 0, n = 0;
  for (let k = 0; k < 40; k++) {
    const w = clean('normal'); w.setSize(1.6);
    const p = w.spawn('leaf', 6, 0, { w: 2.6, side: k % 2 ? 1 : -1 });
    p.bendV = 6 + (k % 7);                           // oscillating already
    run(w, (k % 9) * 0.03);
    const x = 4.9 + (k % 11) * 0.22;
    w.hero.x = w.hero.prevX = x; w.hero.y = 1.2; w.hero.vy = -9; n++;
    const r = runUntil(w, e => of(e, 'bounce').length > 0, 1);
    const b = of(r.ev, 'bounce')[0];
    if (b) {
      landed++;
      near(b.y, PH.World.surfY(p, b.x, false), 1e-9, 'feet on the bent surface');
      assert.ok(b.y <= p.y0 + 0.01 + 1.3 * Math.sin(C.leaf.maxBend) && b.y >= p.y0 - 2.6 * Math.sin(C.leaf.maxBend) - 1e-9);
    }
  }
  assert.strictEqual(landed, n, 'every drop onto the leaf lands');
  // the surface itself: stem side does not move, tip moves the most
  const w = clean('normal'); const p = w.spawn('leaf', 6, 0, { w: 2.6, side: -1 }); p.bend = 0.3;
  near(PH.World.surfY(p, 6 - 1.3, false), 0, 1e-9, 'stem'); near(PH.World.surfY(p, 7.3, false), -2.6 * Math.sin(0.3), 1e-9, 'tip');
});

// ---------- baskets ----------
test('basket: pendulum period ≈ 2π√(len/g) within 5 %, position = pivot + (sin·len, −cos·len)', () => {
  for (const len of [2.0, 2.6, 3.2]) {
    const w = clean('normal'); const p = w.spawn('basket', 6, 40, { len, amp: 0.3, ph: Math.PI / 2 });
    near(p.ang, 0.3, 1e-9); near(p.py, 40 + len, 1e-9);
    const cross = []; let prev = p.ang;
    for (let i = 0; i < 120 * 12; i++) {
      w.update(H);
      if (prev < 0 && p.ang >= 0) cross.push(w.time);
      prev = p.ang;
      near(p.x, p.px + Math.sin(p.ang) * p.len, 1e-9); near(p.y, p.py - Math.cos(p.ang) * p.len, 1e-9);
    }
    const T = (cross[cross.length - 1] - cross[0]) / (cross.length - 1), T0 = 2 * Math.PI * Math.sqrt(len / C.g);
    assert.ok(Math.abs(T / T0 - 1) < 0.05, 'len ' + len + ' period ' + T + ' vs ' + T0);
    assert.ok(T0 > 1.7 && T0 < 2.25);
  }
});

test('basket: energy conserved (no damping) over 60 s; prevX/prevY kept', () => {
  const w = clean('normal'); const p = w.spawn('basket', 6, 40, { len: 2.6, amp: 0.4, ph: 0.7 });
  const E = () => 0.5 * p.len * p.len * p.angV * p.angV + C.g * p.len * (1 - Math.cos(p.ang));
  const e0 = E(); let mn = e0, mx = e0;
  for (let i = 0; i < 120 * 60; i++) { const x0 = p.x; w.update(H); assert.strictEqual(p.prevX, x0); const e = E(); mn = Math.min(mn, e); mx = Math.max(mx, e); }
  assert.ok((mx - mn) / e0 < 0.005, 'energy drift ' + (mx - mn) / e0);
  near(PH.World.basketAmp(p), 0.4, 0.01, 'amplitude kept');
});

test('basket: a landing nudges it in the hero vx direction ∝ mass, amplitude clamped', () => {
  function nudge(size, vx) {
    const w = clean('normal'); w.setSize(size);
    const p = w.spawn('basket', 6, 0, { len: 2.5, amp: 0.25, ph: 0 });     // at the bottom, swinging right
    p.angV = 0; p.ang = 0; w._placeBasket(p);                             // hold still for a clean measure
    w.hero.x = w.hero.prevX = 6; w.hero.y = 0.4; w.hero.vy = -3; w.hero.vx = vx;
    const r = runUntil(w, e => of(e, 'bounce').length > 0, 1); assert.ok(of(r.ev, 'bounce').length, 'landed');
    return { dv: p.angV, p, w };
  }
  const l = nudge(1, 3), h = nudge(1.5, 3), back = nudge(1.5, -3);
  assert.ok(l.dv > 0 && h.dv > l.dv * 1.8, 'heavier pushes more ' + l.dv + ' ' + h.dv);
  assert.ok(back.dv < 0, 'opposite direction');
  assert.strictEqual(l.w.stats.swings, 1);
  // repeated hard pushes never exceed ampMax
  const w = clean('normal'); w.setSize(1.6); const p = w.spawn('basket', 6, 0, { len: 2.2, amp: 0.3 });
  for (let i = 0; i < 30; i++) { p.prevY = p.y; w.hero.x = w.hero.prevX = p.x; w.hero.y = p.y + 0.05; w.hero.vy = -2; w.hero.vx = p.vx >= 0 ? 5 : -5; w._stepHero(H); w._stepPlatforms(0.37); }
  assert.ok(PH.World.basketAmp(p) <= p.ampMax + 1e-6, 'clamped ' + PH.World.basketAmp(p) + ' ≤ ' + p.ampMax);
  assert.ok(p.ampMax <= C.basket.ampCap + 1e-9);
});

test('basket: platAt predicts the pendulum (bot / generator use it)', () => {
  const w = clean('normal'); const p = w.spawn('basket', 6, 10, { len: 3.0, amp: 0.4, ph: 1 });
  const pred = w.platAt(p, 1.0); run(w, 1.0);
  near(pred.x, p.x, 0.03); near(pred.y, p.y, 0.01);
  near(w.platXAt(p, 0), p.x, 1e-12);
});

// ---------- generation ----------
test('generation: every path gap reachable without mushroom/flick at size 1 AND at max-size steering (2000 u)', () => {
  for (const d of ['easy', 'normal', 'hard']) for (const seed of [1, 2, 3]) {
    const w = mk(d, seed), D = C.difficulty[d], kSlow = PH.World.steerF(D.maxSize);
    const path = [], seen = new Set(), all = [];
    const grab = () => { for (const p of w.platforms) if (!seen.has(p.id)) { seen.add(p.id); all.push(p); if (p.path) path.push(p); } };
    grab();
    while (w.camY < 2000) { w.camY += 1; w.maxY = w.camY; w._stepScore(); w._generate(); grab(); w._cleanup(); w.drainEvents(); }
    assert.ok(w.level >= 10, 'levels advanced: ' + w.level);
    let prev = { x: 6, xm: 6, y: 0, y0: 0, w: C.COLW + 2, hr: 0, rise: 0, kind: 'ground' };
    const yLo = p => p.y0 !== undefined ? p.y0 : p.y, yHi = p => yLo(p) + (p.kind === 'basket' ? p.rise : 0);
    for (const p of path) {
      const dy = yHi(p) - yLo(prev);                 // worst case: B at its highest, A at its lowest
      assert.ok(yLo(p) - yLo(prev) > 0.5 && dy <= C.maxGap + 1e-9, d + ' gap ' + dy);
      const xm = p.kind === 'basket' ? p.xm : p.x, pxm = prev.kind === 'basket' ? prev.xm : prev.x;
      const worstDx = Math.abs(xm - pxm) + (p.hr || 0) + (prev.hr || 0);
      const need = Math.max(0, worstDx - (prev.w / 2 + C.landPad) - (p.w / 2 + C.landPad));
      for (const k of [1, kSlow]) assert.ok(need <= simReach(dy, k) * 0.95, d + ' unreachable k=' + k + ': need ' + need + ' reach ' + simReach(dy, k) + ' dy ' + dy);
      assert.ok(Math.abs(xm - pxm) <= D.maxDx + 1e-9, 'maxDx');
      const lo = p.w / 2 + 0.3 - 1e-9, hi = C.COLW - p.w / 2 - 0.3 + 1e-9;
      assert.ok(xm - (p.hr || 0) >= lo && xm + (p.hr || 0) <= hi, 'inside the column');
      assert.ok(!(p.kind === 'basket' && prev.kind === 'basket'), 'two baskets in a row');
      if (p.kind === 'basket') { assert.ok(p.len >= 2 - 1e-9 && p.len <= 3.2 + 1e-9, 'len'); assert.ok(p.amp0 >= 0.18 && p.ampMax <= 0.5 + 1e-9, 'amp ' + p.amp0); }
      prev = p;
    }
    for (const p of all) {
      if (p.spring) assert.ok(p.kind === 'pot' && p.y > C.springFrom && p.path, 'mushroom placement');
      if (p.lvl % 4 === 0) assert.ok(p.kind === 'pot' || p.kind === 'shelf' || p.kind === 'ground', 'potting kinds only: ' + p.kind);
      if (!p.path) assert.ok(p.kind !== 'basket', 'no side baskets');
      if (p.kind === 'leaf') assert.ok(p.side === -1 || p.side === 1);
    }
    const kinds = new Set(all.map(p => p.kind));
    for (const k of ['pot', 'shelf', 'leaf', 'basket']) assert.ok(kinds.has(k), 'kind ' + k);
    // side platforms are never traps: a path platform within reach at the slowest steering
    for (const s of all) {
      if (s.path || s.kind === 'ground') continue;
      const ok = path.some(p => { const dy = yHi(p) - s.y; if (dy > C.maxGap || dy < -1) return false; const dx = Math.abs((p.xm || p.x) - s.x) + (p.hr || 0) - (s.w / 2 + C.landPad) - (p.w / 2 + C.landPad); return dx <= simReach(Math.max(0, dy), kSlow) * 0.95; });
      assert.ok(ok, d + ' side platform trap at ' + s.x + ',' + s.y);
    }
  }
});

test('generation: widths by difficulty, kind shares per zone, fireflies in arcs, cleanup bounded', () => {
  const e = mk('easy', 4), h = mk('hard', 4);
  const pe = e.platforms.find(p => p.kind === 'pot'), ph = h.platforms.find(p => p.kind === 'pot');
  near(pe.w, 2.4 * C.difficulty.easy.widthK, 1e-9); near(ph.w, 2.4 * C.difficulty.hard.widthK, 1e-9);
  assert.deepStrictEqual([C.widths.pot, C.widths.shelf, C.widths.leaf, C.widths.basket], [2.4, 1.7, 2.2, 2.0]);
  assert.deepStrictEqual([C.difficulty.easy.widthK, C.difficulty.normal.widthK, C.difficulty.hard.widthK], [1.6, 1.2, 0.95]);
  assert.ok(e.platforms.some(p => !p.path && p.kind !== 'ground'), 'side platforms');
  assert.ok(e.fireflies.length >= 6 && e.fireflies.length > h.fireflies.length - 6);
  // balcony shares (path only, many seeds)
  const cnt = {}; let n = 0;
  for (let s = 1; s <= 6; s++) { const w = mk('normal', s, { level: 2 }); while (w.camY < 120) { w.camY += 1; w._generate(); } for (const p of w.platforms) if (p.path && p.lvl === 2) { cnt[p.kind] = (cnt[p.kind] || 0) + 1; n++; } }
  assert.ok(cnt.basket / n > 0.12 && cnt.basket / n < 0.32, 'balcony baskets ' + cnt.basket / n);
  assert.ok(cnt.leaf / n > 0.15 && cnt.leaf / n < 0.35, 'balcony leaves ' + cnt.leaf / n);
  const r = play('normal', 2, 1, 120, { immortal: true });
  assert.ok(r.w.platforms.length < 40, 'platforms ' + r.w.platforms.length);
  assert.ok(r.w.fireflies.length < 60, 'fireflies ' + r.w.fireflies.length);
  assert.ok(!r.w.platforms.some(p => p.kind === 'ground'), 'ground removed');
});

// ---------- fireflies, lantern ----------
test('fireflies: caught near her body (+10, lantern), figure-eight bob, lantern full → heart', () => {
  const w = clean('easy'); w.spawn('pot', 6, 0, { w: 6 }); w.hero.x = 6; w.hero.y = 0; w.hero.vy = 0.01;
  const f = w.spawn('firefly', 6, 2.0); const far = w.spawn('firefly', 1, 9);
  let ev = runUntil(w, e => of(e, 'firefly').length > 0, 2).ev;
  const e = of(ev, 'firefly')[0]; assert.ok(e && e.f === f && e.combo === 1);
  assert.ok(w.score >= 10); assert.strictEqual(w.lantern, 1); assert.strictEqual(+w.fireflies, 1);
  assert.strictEqual(f.state, 'taken'); run(w, 0.5); assert.ok(!w.fireflies.includes(f));
  let xs = [], ys = []; for (let i = 0; i < 240; i++) { w.update(H); xs.push(far.x); ys.push(far.y); }
  const rx = Math.max(...xs) - Math.min(...xs), ry = Math.max(...ys) - Math.min(...ys);
  assert.ok(rx > 0.2 && rx <= 0.31 && ry > 0.1 && ry <= 0.19, 'bob ' + rx + ' ' + ry);
  near(far.x, far.bx + C.flyAmp * Math.sin(far.ph), 1e-9, 'no drift (wind removed)');
  w.hearts = w.maxHearts - 1; w.lantern = C.lanternSize - 1;
  w.spawn('firefly', w.hero.x, w.hero.y + 0.55);
  ev = run(w, 0.05);
  assert.strictEqual(of(ev, 'lantern').length, 1); assert.strictEqual(of(ev, 'heartGain').length, 1);
  assert.strictEqual(w.hearts, w.maxHearts); assert.strictEqual(w.lantern, 0); assert.strictEqual(w.stats.lanterns, 1);
});

// ---------- falls ----------
test('fall: heart lost, rescue umbrella throws her back into play', () => {
  const w = clean('normal'); w.camY = 50; w.hero.y = 51; w.hero.x = 0.8; w.hero.vy = 0;
  const r = runUntil(w, e => of(e, 'fall').length > 0, 3);
  assert.strictEqual(of(r.ev, 'fall')[0].hearts, 2); assert.strictEqual(w.hearts, 2);
  assert.strictEqual(of(r.ev, 'rescue').length, 1);
  const tr = w.platforms.find(p => p.kind === 'rescue');
  assert.ok(tr && tr.x === 1.6 && Math.abs(tr.y - (w.camY + 0.6)) < 1e-9 && tr.w === 3);
  near(w.hero.vy, C.bounceV * C.rescueK, 0.3); assert.ok(w.hero.rescueT > 1 && w.hero.invuln > 1);
  assert.strictEqual(w.hero.mood, 'ouch');
  w.steer(1);
  const r2 = runUntil(w, e => of(e, 'bounce').length > 0, 3);
  assert.strictEqual(of(r2.ev, 'bounce')[0].kind, 'rescue');
  run(w, 0.6);
  assert.ok(!w.platforms.some(p => p.kind === 'rescue'), 'umbrella removed after its bounce');
  assert.strictEqual(w.phase, 'play'); assert.ok(w.hero.y > w.camY + 2);
  assert.strictEqual(w.stats.falls, 1); assert.strictEqual(w.stats.rescues, 1);
  // aimed under a reachable platform
  const w2 = clean('normal'); w2.camY = 50; const q = w2.spawn('shelf', 9.2, 53); w2.hero.y = 51; w2.hero.x = 2; w2.hero.vy = 0;
  runUntil(w2, e => of(e, 'rescue').length > 0, 3); near(w2.platforms.find(p => p.kind === 'rescue').x, q.x, 1e-9);
});

test('game over at 0 hearts; she keeps falling gently, no more events', () => {
  const w = clean('normal'); w.hearts = 1; w.camY = 20; w.hero.y = 20.5; w.hero.vy = 0;
  const r = runUntil(w, e => of(e, 'gameOver').length > 0, 3);
  assert.strictEqual(w.phase, 'over'); assert.strictEqual(w.hearts, 0); assert.strictEqual(of(r.ev, 'rescue').length, 0);
  const y0 = w.hero.y, ev = run(w, 1);
  assert.ok(w.hero.y < y0 - 5, 'falls'); assert.ok(w.hero.vy >= -C.maxFall - 1e-9);
  assert.strictEqual(of(ev, 'fall').length + of(ev, 'gameOver').length, 0);
  w.steer(1); run(w, 0.5); assert.ok(Math.abs(w.hero.vx) < 0.5, 'no steering when over');
});

// ---------- levels, score ----------
test('level up: bonus 100·(zone+1)·(loop+1), +1 heart, loop scaling, gotoLevel', () => {
  const w = clean('normal'); const G = C.goal.normal;
  w.gotoLevel(3); let e2 = w.drainEvents(); assert.strictEqual(of(e2, 'levelUp')[0].zone, 3); assert.strictEqual(of(e2, 'levelUp')[0].bonus, 0);
  w.maxY = w.levelY0 + G + 0.01; w.hero.y = w.maxY + 0.1; w.hero.vy = 1;
  e2 = run(w, 0.02); const l4 = of(e2, 'levelUp')[0];
  assert.ok(l4 && l4.level === 4 && l4.zone === 0 && l4.bonus === 400 && l4.sizeBonus === 0, JSON.stringify(l4));
  assert.strictEqual(w.loop, 1); near(w.goal, G * 1.1, 1e-9);
  assert.deepStrictEqual([mk('easy').goal, mk('normal').goal, mk('hard').goal], [C.goal.easy, C.goal.normal, C.goal.hard]);
  const lv5 = mk('normal', 1, { level: 5 }); assert.strictEqual(lv5.zone, 1); assert.strictEqual(lv5.loop, 1);
});

test('score: +1 per new metre (once), +10 per firefly; meter event every 25 m; progress 0..1', () => {
  const w = clean('easy'); w.camY = 0;
  w.hero.y = 10.4; w.hero.vy = 0.01; run(w, 0.02);
  assert.strictEqual(w.score, 10);
  w.hero.y = 5; w.hero.vy = 0; run(w, 0.02); assert.strictEqual(w.score, 10, 'no points for re-climbing');
  w.spawn('firefly', w.hero.x, w.hero.y + 0.55); run(w, 0.02); assert.strictEqual(w.score, 20);
  const ev = []; w.hero.y = 51; w.hero.vy = 0.01; ev.push(...run(w, 0.02));
  assert.deepStrictEqual(of(ev, 'meter').map(e => e.m), [25, 50]);
  near(w.progress, w.maxY / w.goal, 1e-9);
});

test('camera: follows hero.y − camLead upward only, eased', () => {
  const w = clean('normal'); w.hero.y = 20; w.hero.vy = 0;
  run(w, 0.1); assert.ok(w.camY > 0 && w.camY < 20 - C.camLead, 'eased ' + w.camY);
  let prev = w.camY, down = false;
  for (let i = 0; i < 120; i++) { w.update(H); if (w.camY < prev - 1e-12) down = true; prev = w.camY; assert.ok(w.prevCamY <= w.camY); }
  assert.ok(!down, 'never down');
});

test('pose: squash/stretch/tilt ranges and mood sequence crouch → up → fall', () => {
  const w = clean('normal'); w.spawn('pot', 6, 0, { w: 14 }); w.hero.x = 6; w.hero.y = 0.5;
  const moods = [];
  for (let i = 0; i < 120 * 3; i++) {
    w.steer(i % 200 < 100 ? 1 : -1); w.update(H);
    const h = w.hero;
    assert.ok(h.squash >= 0 && h.squash <= 1 && h.stretch >= 0 && h.stretch <= 1 && Math.abs(h.tilt) <= C.tiltMax + 1e-9);
    if (moods[moods.length - 1] !== h.mood) moods.push(h.mood);
  }
  assert.ok(moods.join(',').includes('crouch,up,fall,crouch'), moods.join(','));
  const w2 = mk('easy'); assert.strictEqual(w2.hero.mood, 'idle'); run(w2, 0.3); assert.strictEqual(w2.hero.mood, 'idle');
  assert.strictEqual(of(run(w2, 0.5), 'bounce')[0].kind, 'ground');
});

test('setX, spawn, setSize, alpha and prev* for interpolation', () => {
  const w = clean('normal'); w.setX(3.3); assert.strictEqual(w.hero.x, 3.3); assert.strictEqual(w.hero.prevX, 3.3);
  w.setX(-5); assert.strictEqual(w.hero.x, 0.55);
  w.setSize(1.4); w.setX(-5); near(w.hero.x, 0.55 * 1.4, 1e-12);
  w.setSize(9); assert.strictEqual(w.hero.size, C.sizeHookMax); w.setSize(0.2); assert.strictEqual(w.hero.size, 1);
  w.update(H * 2.5); near(w.alpha, 0.5, 1e-6);
  assert.ok(w.hero.prevY !== w.hero.y);
  const p = w.spawn('shelf', 5, 5); assert.ok(p.id && w.platforms.includes(p) && Math.abs(p.w - 1.7 * C.difficulty.normal.widthK) < 1e-9);
  for (const k of ['pot', 'shelf', 'leaf', 'basket', 'rescue']) assert.strictEqual(w.spawn(k, 6, 8).kind, k);
  w.setLayout(960, 540);
});

// ---------- bot ----------
test('bot skill 1: survives 10 minutes on Normal and Easy without falling', () => {
  for (const [d, seed] of [['normal', 1], ['normal', 2], ['easy', 3]]) {
    const r = play(d, seed, 1, 600);
    assert.strictEqual(r.w.phase, 'play', d + ' alive');
    assert.strictEqual(r.w.stats.falls, 0, d + ' falls ' + r.w.stats.falls);
    assert.ok(r.w.maxY / r.t > 1.8, 'climbs ' + (r.w.maxY / r.t).toFixed(2) + ' u/s');
    assert.ok(r.w.level >= 8, 'levels ' + r.w.level);
    assert.ok(r.w.stats.swings > 10 && r.w.stats.leafFlicks > 10, 'uses baskets and leaf flicks ' + r.w.stats.swings + ' ' + r.w.stats.leafFlicks);
    assert.ok(r.w.stats.springs > 0 && r.w.stats.shrinks >= 8);
  }
});

test('bot: casual skill 0.5 — Easy floor 1 ≈ 45–90 s, big around the middle, few falls', () => {
  const lv = [], fpm = [], big = [];
  for (const seed of [1, 2, 3, 4]) {
    const w = mk('easy', seed); w.hearts = w.maxHearts = 1e6;
    const bot = new PH.Bot(w, { skill: 0.5, seed: seed * 7 + 1 });
    let t = 0, tb = null, t1 = null;
    while (t < 200 && t1 === null) { bot.step(1 / 60); w.update(1 / 60); t += 1 / 60; for (const e of w.drainEvents()) { if (e.type === 'big' && tb === null) tb = t; if (e.type === 'levelUp') t1 = t; } }
    lv.push(t1); big.push(tb / t1); fpm.push(w.stats.falls / (t / 60));
    if (seed === 1) assert.ok(bot.stats.badPicks > 0 && bot.stats.decisions > 400);
  }
  for (const t of lv) assert.ok(t > 40 && t < 95, 'floor 1 time ' + t);
  for (const b of big) assert.ok(b > 0.3 && b < 0.75, 'big at ' + (b * 100).toFixed(0) + ' % of the floor');
  assert.ok(Math.max(...fpm) < 3, 'falls/min ' + fpm);
});

// ---------- weather ----------
test('weather: bounded counts (< 180), finite values, each floor has its sprites, 3 screens', () => {
  const WANT = [['raindrop', 'drip', 'puff'], ['mist', 'drip', 'leafbit'], ['raindrop', 'splash', 'petal'], ['raindrop', 'sparkle', 'bubble']];
  const ALLOWED = new Set(['raindrop', 'drip', 'splash', 'mist', 'petal', 'leafbit', 'sparkle', 'glow', 'soil', 'puff', 'bubble']);
  for (const [W, Hh] of [[960, 540], [1280, 540], [720, 1600]]) {
    const wx = new PH.Weather({ width: W, height: Hh, seed: 3 }); let mx = 0;
    assert.strictEqual(typeof wx.setWind, 'function'); wx.setWind(1, 1);
    for (let z = 0; z < 4; z++) {
      wx.setLevel(z);
      const sprites = new Set();
      for (let i = 0; i < 60 * 14; i++) {
        wx.update(1 / 60, i % 200 < 100 ? 400 : 0);
        if (i % 40 === 0) wx.burst('sparkle', 100, 100, 14, { up: true });
        mx = Math.max(mx, wx.particles.length);
        for (const p of wx.particles) { sprites.add(p.sprite); assert.ok(ALLOWED.has(p.sprite), p.sprite); }
      }
      for (const p of wx.particles) {
        assert.ok(isFinite(p.x) && isFinite(p.y) && isFinite(p.size) && isFinite(p.rot) && p.alpha >= 0 && p.alpha <= 1, JSON.stringify(p));
        assert.ok(p.layer === 'back' || p.layer === 'front');
        if (p.layer === 'front' && p.kind !== 'burst') assert.ok(p.alpha <= 0.5 + 1e-9);
        if (p.kind !== 'burst') assert.notStrictEqual(p.sprite, 'glow', 'no yellow ambient');
      }
      for (const s of WANT[z]) assert.ok(sprites.has(s), 'zone ' + z + ' has ' + s);
    }
    assert.ok(mx < 180, 'max particles ' + mx);
    wx.burst('puff', 10, 10, 500); assert.ok(wx.particles.length < 180);
  }
});

test('weather: crossfade on setLevel; drips accelerate to terminal; runnels stick-slip; leaves sway with drag', () => {
  const wx = new PH.Weather({ width: 960, height: 540, seed: 1 });
  wx.setLevel(2, { instant: true }); assert.ok(wx.particles.every(p => p.kind !== 'runnel' && p.kind !== 'mote'));
  for (let i = 0; i < 30; i++) wx.update(1 / 60, 0);
  const rain = wx.particles.filter(p => p.kind === 'rainFront' || p.kind === 'rainBack');
  assert.ok(rain.length > 40 && rain.every(p => p.rot < -0.05 && p.rot > -0.3), 'slanted streaks');
  const fr = rain.filter(p => p.layer === 'front'), bk = rain.filter(p => p.layer === 'back');
  assert.ok(fr.length && bk.length && Math.min(...fr.map(p => p.vy)) > Math.max(...bk.map(p => p.vy)), '2 depths: front faster');
  wx.setLevel(0);
  assert.ok(wx.particles.filter(p => p.dying).length > 40, 'old ones fade out');
  for (let i = 0; i < 120; i++) wx.update(1 / 60, 0);
  assert.ok(!wx.particles.some(p => p.kind === 'rainFront' || p.kind === 'rainBack'), 'faded');
  // a drip: from rest, speeds up, approaches terminal speed and never exceeds it
  const d = wx._spawn('drip', true, true); d.y = -2000; const vs = [];
  for (let i = 0; i < 120; i++) { wx._move(d, 1 / 60, wx.k, 960, 1e6); vs.push(d.vy); }
  assert.ok(vs[5] < vs[20] && vs[20] < vs[60], 'accelerates');
  const vt = 620 * wx.k; assert.ok(vs[119] > 0.95 * vt && Math.max(...vs) <= vt + 1e-6, 'terminal ' + vs[119]);
  // a glass runnel spends some time clinging (vy ≈ 0) and some time sliding
  const rn = wx.particles.find(p => p.kind === 'runnel'); let stuck = 0, slid = 0;
  for (let i = 0; i < 600; i++) { wx._move(rn, 1 / 60, wx.k, 960, 1e6); if (rn.vy < 5) stuck++; else if (rn.vy > 30) slid++; }
  assert.ok(stuck > 20 && slid > 100, 'stick-slip ' + stuck + ' / ' + slid);
  // falling leaf bits: rotation sways like a pendulum, horizontal speed changes sign, fall speed bounded
  wx.setLevel(1, { instant: true });
  const lf = wx.particles.find(p => p.kind === 'leafbit'); const rots = [], vxs = [], vys = [];
  for (let i = 0; i < 300; i++) { wx.time += 1 / 60; wx._move(lf, 1 / 60, wx.k, 960, 1e6); rots.push(lf.rot); vxs.push(lf.vx); vys.push(lf.vy); }
  assert.ok(Math.max(...rots) - Math.min(...rots) > 0.6, 'sways');
  assert.ok(Math.max(...vxs) > 0 && Math.min(...vxs) < 0 || Math.abs(lf.drift) > 0, 'glides both ways');
  assert.ok(Math.max(...vys) < 1.5 * lf.fall && Math.min(...vys.slice(60)) > 0.3 * lf.fall, 'drag-limited fall');
  assert.ok(typeof wx.ambient.tint === 'string');
  wx.resize(720, 1280); assert.ok(wx.particles.length < 180);
});

// ---------- speed ----------
test('speed: 10 minutes simulated (world + bot) in ≈ 2 s', () => {
  const t0 = Date.now(); const r = play('normal', 9, 1, 600, { immortal: true }); const ms = Date.now() - t0;
  console.log('      (10 min normal, bot skill 1: ' + ms + ' ms, ' + r.w.level + ' levels, ' + r.w.stats.falls + ' falls)');
  assert.ok(ms < 4000, ms + ' ms');
});

// ---------- runner ----------
let fail = 0;
const t0 = Date.now();
for (const t of tests) {
  try { t.fn(); console.log('PASS  ' + t.name); }
  catch (e) { fail++; console.log('FAIL  ' + t.name + '\n      ' + (e && e.message || e)); }
}
console.log((tests.length - fail) + '/' + tests.length + ' passed in ' + (Date.now() - t0) + ' ms');
process.exit(fail ? 1 : 0);
