#!/usr/bin/env node
// Clover's Farm Hop — headless unit tests for rng / world / weather / bot (node, no deps).
// Run from projects/daily-game/frog-farm-hop:   node tests/unit/run.js
'use strict';
const assert = require('assert');
const { load } = require('./load');

const FH = load();
const C = FH.World.CONFIG;
const H = C.step;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const near = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, (m || '') + ' got ' + a + ' want ' + b + ' ±' + tol);

// ---------- helpers ----------
function mk(diff, seed, extra) { return new FH.World(Object.assign({ seed: seed || 1, difficulty: diff || 'normal' }, extra || {})); }
/** a world with no generated platforms / fireflies and no wind, Clover already hopping */
function clean(diff, seed) {
  const w = mk(diff, seed);
  w.platforms.length = 0; w.fireflies.length = 0; w._gen.top = 1e12;
  w.hero.started = true; w.wind.next = 1e12; w.time = 1; w.drainEvents();
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
  const bot = new FH.Bot(w, { skill, seed: seed * 7 + 1 });
  const dt = 1 / 60; let t = 0, last = 0; const lv = [];
  while (w.phase === 'play' && t < maxS) {
    bot.step(dt); w.update(dt); t += dt;
    for (const e of w.drainEvents()) if (e.type === 'levelUp') { lv.push(t - last); last = t; }
  }
  return { w, t, lv, bot };
}
/** independent numeric reach: simulate a hop (exact parabola) steering full from vx = 0, return x when the
 *  feet come down through dy above the launch point */
function simReach(dy) {
  let y = 0, vy = C.bounceV, x = 0, vx = 0, t = 0;
  const dt = 1 / 600;
  while (t < 3) {
    const v0 = vy; vy = Math.max(-C.maxFall, vy - C.g * dt); const y1 = y + 0.5 * (v0 + vy) * dt;
    vx = Math.min(C.maxVx, vx + C.accel * dt); x += vx * dt; t += dt;
    if (vy < 0 && y >= dy && y1 <= dy) return x;
    y = y1;
    if (vy < 0 && y < dy) return 0;
  }
  return 0;
}

// ---------- RNG ----------
test('rng: API and determinism', () => {
  const a = new FH.RNG(42), b = new FH.RNG(42);
  for (let i = 0; i < 200; i++) { const x = a.next(); assert.strictEqual(x, b.next()); assert.ok(x >= 0 && x < 1); }
  for (const f of ['next', 'range', 'int', 'pick', 'chance', 'gauss', 'sign', 'fork']) assert.strictEqual(typeof a[f], 'function', f);
});

// ---------- API surface (the integrator codes against these names) ----------
test('world: API, CONFIG and state field names (DESIGN §5.1)', () => {
  const w = mk('easy');
  for (const f of ['reset', 'update', 'steer', 'setX', 'drainEvents', 'gotoLevel', 'getState', 'spawn', 'gust', 'setLayout'])
    assert.strictEqual(typeof w[f], 'function', f);
  for (const k of ['step', 'COLW', 'g', 'bounceV', 'springK', 'rescueK', 'maxFall', 'maxVx', 'accel', 'drag', 'camLead', 'camRate',
    'genAhead', 'catchR', 'lanternSize', 'firstGust', 'goal', 'difficulty', 'zones']) assert.ok(k in C, 'CONFIG.' + k);
  for (const d of ['easy', 'normal', 'hard']) for (const k of ['hearts', 'gap', 'maxDx', 'widthK', 'windK', 'warnT', 'cartSpeed'])
    assert.ok(k in C.difficulty[d], d + '.' + k);
  for (const z of C.zones) for (const k of ['kinds', 'wind', 'cartSpeed']) assert.ok(k in z, 'zone.' + k);
  for (const k of ['time', 'phase', 'level', 'zone', 'loop', 'camY', 'prevCamY', 'maxY', 'levelY0', 'goal', 'progress', 'score',
    'fireflies', 'lantern', 'hearts', 'maxHearts', 'difficulty', 'hero', 'platforms', 'wind', 'stats', 'alpha']) assert.ok(k in w, 'world.' + k);
  for (const k of ['x', 'prevX', 'y', 'prevY', 'vx', 'vy', 'dir', 'face', 'squash', 'stretch', 'tilt', 'mood', 'moodT', 'airT', 'lastPlat', 'invuln', 'rescueT'])
    assert.ok(k in w.hero, 'hero.' + k);
  const p = w.platforms[1];
  for (const k of ['id', 'kind', 'x', 'prevX', 'y', 'w', 'spring', 'springT', 'vx', 'x0', 'x1', 'state', 't', 'bounces']) assert.ok(k in p, 'platform.' + k);
  const f = w.fireflies[0];
  for (const k of ['id', 'x', 'prevX', 'y', 'prevY', 'bx', 'by', 'ph', 'state', 't']) assert.ok(k in f, 'firefly.' + k);
  for (const k of ['state', 'dir', 't', 'dur', 'strength', 'next', 'count']) assert.ok(k in w.wind, 'wind.' + k);
  for (const k of ['fireflies', 'bounces', 'springs', 'puffs', 'falls', 'rescues', 'gusts', 'levels', 'maxY', 'time', 'lanterns']) assert.ok(k in w.stats, 'stats.' + k);
  assert.strictEqual(w.platforms[0].kind, 'ground');
  assert.strictEqual(w.hearts, 5); assert.strictEqual(mk('normal').hearts, 3); assert.strictEqual(mk('hard').hearts, 3);
  assert.ok(Array.isArray(w.fireflies) && w.fireflies.length > 0, 'fireflies[] is the live array');
  assert.strictEqual(+w.fireflies, 0, 'fireflies reads as the caught count'); assert.strictEqual(String(w.fireflies), '0');
  JSON.stringify(w.getState());
});

test('world: determinism (same seed + inputs → same state; another seed differs)', () => {
  function go(seed) {
    const w = mk('normal', seed);
    for (let i = 0; i < 120 * 40; i++) { w.steer(Math.sin(i / 70) > 0.2 ? 1 : Math.sin(i / 70) < -0.2 ? -1 : 0); w.update(H); w.drainEvents(); }
    return JSON.stringify(w.getState()) + JSON.stringify(w.platforms.map(p => [p.kind, p.x, p.y]));
  }
  assert.strictEqual(go(5), go(5));
  assert.notStrictEqual(go(5), go(6));
  // variable frame dt still gives the same result (fixed sub-steps)
  const a = mk('easy', 3), b = mk('easy', 3);
  for (let i = 0; i < 600; i++) { a.update(1 / 60); }
  for (let i = 0; i < 1200; i++) { b.update(1 / 120); }
  near(a.hero.y, b.hero.y, 1e-9); near(a.time, b.time, 1e-9);
});

// ---------- bounce physics ----------
test('bounce: apex ≈ 2.96 u, rise ≈ 0.48 s, hop ≈ 0.95 s, squash on landing', () => {
  const w = clean('normal');
  w.spawn('hay', 6, 0, { w: 6 }); w.hero.x = 6; w.hero.y = 0.5; w.hero.vy = 0;
  const b = [];
  let apex = -1, tApex = 0, t = 0;
  for (let i = 0; i < 120 * 4; i++) {
    w.update(H); t += H;
    for (const e of w.drainEvents()) if (e.type === 'bounce') { b.push(t); if (b.length === 1) assert.strictEqual(w.hero.squash > 0.9, true, 'squash'); }
    if (b.length === 1 && w.hero.y > apex) { apex = w.hero.y; tApex = t - b[0]; }
  }
  near(apex, C.bounceV * C.bounceV / (2 * C.g), 0.01, 'apex');
  near(apex, 3.0, 0.1, 'apex ≈ 3 u');
  near(tApex, C.bounceV / C.g, 0.02, 'rise time');
  near(b[2] - b[1], 2 * C.bounceV / C.g, 0.02, 'air time');
});

test('spring: apex ≈ 7.6 u at the centre, plain bounce off-centre', () => {
  const w = clean('normal');
  const p = w.spawn('hay', 6, 0, { w: 6, spring: true }); w.hero.x = 6; w.hero.y = 0.3; w.hero.vy = 0;
  const ev = runUntil(w, e => of(e, 'bounce').length > 0, 2).ev;
  assert.ok(of(ev, 'bounce')[0].spring, 'spring flag');
  assert.strictEqual(p.springT < 0.05, true);
  let apex = 0; for (let i = 0; i < 120 * 1.5; i++) { w.update(H); apex = Math.max(apex, w.hero.y); }
  near(apex, Math.pow(C.bounceV * C.springK, 2) / (2 * C.g), 0.02); near(apex, 7.6, 0.2);
  const w2 = clean('normal'); w2.spawn('hay', 6, 0, { w: 6, spring: true }); w2.hero.x = 7.2; w2.hero.y = 0.3; w2.hero.vy = 0;
  const e2 = runUntil(w2, e => of(e, 'bounce').length > 0, 2).ev;
  assert.strictEqual(of(e2, 'bounce')[0].spring, false);
});

test('platforms are one-way (pass through from below, land from above)', () => {
  const w = clean('normal');
  w.spawn('plank', 6, 0, { w: 4 }); const up = w.spawn('plank', 6, 1.6, { w: 4 });
  w.hero.x = 6; w.hero.y = 0.2; w.hero.vy = 0;
  const ev = [];
  for (let i = 0; i < 120 * 2; i++) { w.update(H); for (const e of w.drainEvents()) if (e.type === 'bounce') ev.push({ id: e.p.id, vyBefore: w.hero.prevY }); }
  assert.ok(ev.length >= 2);
  assert.notStrictEqual(ev[0].id, up.id, 'first landing is the low plank');
  assert.strictEqual(ev[1].id, up.id, 'rising through the upper plank, then landing on it');
  // outside the landing width → no landing
  const w2 = clean('normal'); w2.spawn('plank', 6, 0, { w: 1.7 }); w2.hero.x = 6 + 0.85 + 0.3; w2.hero.y = 0.5;
  const e2 = run(w2, 1.0);
  assert.strictEqual(of(e2, 'bounce').length, 0);
});

test('steering: accel to maxVx in ≈ 0.19 s, capped, drag on release; tilt eases', () => {
  const w = clean('normal'); w.spawn('hay', 6, 0, { w: 14 }); w.hero.x = 3; w.hero.y = 0; w.hero.vy = 0;   // hopping on a wide bale
  w.steer(1); run(w, 0.1);
  near(w.hero.vx, C.accel * 0.1, 0.05, 'linear accel');
  run(w, 0.15); near(w.hero.vx, C.maxVx, 1e-9, 'at max');
  assert.ok(w.hero.face === 1 && w.hero.tilt > 0.1 && w.hero.tilt <= C.tiltMax + 1e-9, 'tilt ' + w.hero.tilt);
  run(w, 0.3); assert.ok(w.hero.vx <= C.maxVx + 1e-9);
  w.steer(0); run(w, 0.25);
  near(w.hero.vx, C.maxVx * Math.exp(-C.drag * 0.25), 0.05, 'drag');
  run(w, 0.4); assert.ok(Math.abs(w.hero.vx) < 0.3);
  w.steer(-1); run(w, 0.05); assert.strictEqual(w.hero.face, -1);
});

test('walls: clamped at the fence posts, bounce back, event wall', () => {
  const w = clean('normal'); w.spawn('hay', 6, 0, { w: 14 }); w.hero.x = 9; w.hero.y = 0;
  w.steer(1);
  let ev = [], minX = 99, maxX = -99, bounced = false;
  for (let i = 0; i < 120 * 2; i++) {
    const vx0 = w.hero.vx; w.update(H); const e = w.drainEvents(); ev.push(...e);
    maxX = Math.max(maxX, w.hero.x);
    if (of(e, 'wall').length) { assert.strictEqual(e.find(q => q.type === 'wall').side, 1); bounced = bounced || w.hero.vx < 0 && vx0 > 0; }
  }
  near(maxX, C.COLW - 0.55, 1e-9); assert.ok(of(ev, 'wall').length >= 1); assert.ok(bounced, 'vx reversed');
  w.steer(-1); for (let i = 0; i < 120 * 3; i++) { w.update(H); minX = Math.min(minX, w.hero.x); }
  near(minX, 0.55, 1e-9);
});

// ---------- generation ----------
test('generation: every path gap reachable (all difficulties, 2000 u)', () => {
  for (const d of ['easy', 'normal', 'hard']) for (const seed of [1, 2, 3]) {
    const w = mk(d, seed), D = C.difficulty[d];
    const path = [], seen = new Set(), all = [];
    const grab = () => { for (const p of w.platforms) if (!seen.has(p.id)) { seen.add(p.id); all.push(p); if (p.path) path.push(p); } };
    grab();
    while (w.camY < 2000) { w.camY += 1; w.maxY = w.camY; w._stepScore(); w._generate(); grab(); w._cleanup(); w.drainEvents(); }
    assert.ok(w.level >= 10, 'levels advanced: ' + w.level);
    let prev = { x: 6, y: 0, w: C.COLW + 2, hr: 0, kind: 'ground' };
    for (const p of path) {
      const dy = p.y - prev.y;
      assert.ok(dy > 0.5 && dy <= C.maxGap + 1e-9, d + ' gap ' + dy);
      const worst = Math.abs(p.xm - prev.xm || p.x - prev.x) + (p.hr || 0) + (prev.hr || 0);
      const xm = p.kind === 'cart' ? p.xm : p.x, pxm = prev.kind === 'cart' ? prev.xm : prev.x;
      const worstDx = Math.abs(xm - pxm) + (p.hr || 0) + (prev.hr || 0);
      const need = Math.max(0, worstDx - (prev.w / 2 + C.landPad) - (p.w / 2 + C.landPad));
      assert.ok(need <= simReach(dy) * 0.95, d + ' unreachable: need ' + need + ' reach ' + simReach(dy) + ' dy ' + dy);
      assert.ok(Math.abs(xm - pxm) <= D.maxDx + 1e-9, 'maxDx');
      const lo = p.w / 2 + 0.3 - 1e-9, hi = C.COLW - p.w / 2 - 0.3 + 1e-9;
      assert.ok(xm - (p.hr || 0) >= lo && xm + (p.hr || 0) <= hi, 'inside the column');
      assert.ok(!(p.kind === 'puff' && prev.kind === 'puff'), 'two puffs in a row');
      void worst;
      prev = p;
    }
    for (const p of all) {
      if (p.spring) assert.ok(p.kind === 'hay' && p.y > C.springFrom, 'spring placement');
      if (p.lvl % 4 === 0) assert.ok(p.kind === 'hay' || p.kind === 'plank' || p.kind === 'ground', 'sunny kinds only: ' + p.kind);
    }
    const kinds = new Set(all.map(p => p.kind));
    for (const k of ['hay', 'plank', 'cart', 'puff']) assert.ok(kinds.has(k), 'kind ' + k);
  }
});

test('generation: widths by difficulty, side platforms, fireflies in arcs, cleanup bounded', () => {
  const e = mk('easy', 4), h = mk('hard', 4);
  const he = e.platforms.find(p => p.kind === 'hay'), hh = h.platforms.find(p => p.kind === 'hay');
  near(he.w, 2.4 * C.difficulty.easy.widthK, 1e-9); near(hh.w, 2.4 * C.difficulty.hard.widthK, 1e-9);
  assert.ok(C.difficulty.easy.widthK > 1.2 && C.difficulty.hard.widthK < 1);
  assert.ok(e.platforms.some(p => !p.path && p.kind !== 'ground'), 'side platforms');
  assert.ok(e.fireflies.length >= 6 && e.fireflies.length > h.fireflies.length - 6);
  // a long bot run keeps arrays small
  const r = play('normal', 2, 1, 120, { immortal: true });
  assert.ok(r.w.platforms.length < 40, 'platforms ' + r.w.platforms.length);
  assert.ok(r.w.fireflies.length < 60, 'fireflies ' + r.w.fireflies.length);
  assert.ok(!r.w.platforms.some(p => p.kind === 'ground'), 'ground removed');
});

// ---------- special platforms ----------
test('puff: poofs after one bounce, gone after 0.35 s, grows back later', () => {
  const w = clean('normal'); const p = w.spawn('puff', 6, 0, { w: 3 }); w.spawn('hay', 6, -0.6, { w: 14 }); w.hero.x = 6; w.hero.y = 0.3;
  const ev = runUntil(w, e => of(e, 'poof').length > 0, 2).ev;
  assert.strictEqual(of(ev, 'bounce').length, 1); assert.strictEqual(of(ev, 'poof')[0].p, p);
  assert.strictEqual(p.state, 'poof');
  run(w, 0.3); assert.ok(w.platforms.includes(p));
  run(w, 0.1); assert.ok(!w.platforms.includes(p) && p.state === 'gone');
  let np = null; runUntil(w, () => (np = w.platforms.find(q => q.kind === 'puff')), C.puffRegrow + 0.1);
  assert.ok(np && np.state === 'live' && np.id !== p.id && np.x === 6, 'regrown');
  assert.ok(Math.abs(w.time - 1 - C.puffRegrow) < 0.6, 'after ≈ puffRegrow s');
});

test('cart: sine back-and-forth inside x0..x1, eased at the ends', () => {
  const w = clean('normal'); const p = w.spawn('cart', 6, 3, { x0: 4.8, x1: 7.2, speed: 1.2 });
  let mn = 99, mx = -99, vmax = 0, vEnd = 99;
  for (let i = 0; i < 120 * 12; i++) {
    w.update(H); mn = Math.min(mn, p.x); mx = Math.max(mx, p.x); vmax = Math.max(vmax, Math.abs(p.vx));
    if (Math.abs(p.x - 7.2) < 0.02) vEnd = Math.min(vEnd, Math.abs(p.vx));
  }
  assert.ok(mn >= 4.8 - 1e-9 && mx <= 7.2 + 1e-9); near(mn, 4.8, 0.02); near(mx, 7.2, 0.02);
  near(vmax, 1.2, 0.02); assert.ok(vEnd < 0.3, 'slow at the ends ' + vEnd);
  const r = mk('normal', 1); assert.ok(r._cartSpeed(2) > r._cartSpeed(1));
  near(mk('easy')._cartSpeed(1) / r._cartSpeed(1), 0.7, 1e-9);
});

// ---------- fireflies, lantern ----------
test('fireflies: caught near her body (+10, lantern), figure-eight bob, lantern full → heart', () => {
  const w = clean('easy'); w.spawn('hay', 6, 0, { w: 6 }); w.hero.x = 6; w.hero.y = 0; w.hero.vy = 0.01;
  const f = w.spawn('firefly', 6, 2.0); const far = w.spawn('firefly', 1, 9);
  let ev = runUntil(w, e => of(e, 'firefly').length > 0, 2).ev;
  const e = of(ev, 'firefly')[0]; assert.ok(e && e.f === f && e.combo === 1);
  assert.strictEqual(w.score >= 10, true); assert.strictEqual(w.lantern, 1); assert.strictEqual(+w.fireflies, 1);
  assert.strictEqual(f.state, 'taken'); run(w, 0.5); assert.ok(!w.fireflies.includes(f));
  // bob: stays within amp around home, both axes move (1:2 Lissajous)
  let xs = [], ys = []; for (let i = 0; i < 240; i++) { w.update(H); xs.push(far.x); ys.push(far.y); }
  const rx = Math.max(...xs) - Math.min(...xs), ry = Math.max(...ys) - Math.min(...ys);
  assert.ok(rx > 0.2 && rx <= 0.31 && ry > 0.1 && ry <= 0.19, 'bob ' + rx + ' ' + ry);
  // lantern
  w.hearts = w.maxHearts - 1; w.lantern = C.lanternSize - 1;
  w.spawn('firefly', w.hero.x, w.hero.y + 0.55);
  ev = run(w, 0.05);
  assert.strictEqual(of(ev, 'lantern').length, 1); assert.strictEqual(of(ev, 'heartGain').length, 1);
  assert.strictEqual(w.hearts, w.maxHearts); assert.strictEqual(w.lantern, 0); assert.strictEqual(w.stats.lanterns, 1);
});

test('fireflies drift with the wind and drift back home', () => {
  const w = clean('normal'); const f = w.spawn('firefly', 6, 30); w.gust(1);
  run(w, C.difficulty.normal.warnT + 1.5);
  assert.ok(f.x - f.bx > 0.4, 'pushed ' + (f.x - f.bx));
  run(w, 12); assert.ok(Math.abs(f.x - f.bx) < 0.25, 'home again');
});

// ---------- falls ----------
test('fall: heart lost, rescue trampoline throws her back into play', () => {
  const w = clean('normal'); w.camY = 50; w.hero.y = 51; w.hero.x = 0.8; w.hero.vy = 0;
  const r = runUntil(w, e => of(e, 'fall').length > 0, 3);
  assert.strictEqual(of(r.ev, 'fall')[0].hearts, 2); assert.strictEqual(w.hearts, 2);
  assert.strictEqual(of(r.ev, 'rescue').length, 1);
  const tr = w.platforms.find(p => p.kind === 'rescue');
  assert.ok(tr && tr.x === 1.6 && Math.abs(tr.y - (w.camY + 0.6)) < 1e-9 && tr.w === 3);
  near(w.hero.vy, C.bounceV * C.rescueK, 0.3); assert.ok(w.hero.rescueT > 1 && w.hero.invuln > 1);
  assert.strictEqual(w.hero.mood, 'ouch');
  w.steer(1);                                         // steering is ignored while the trampoline lines her up
  const r2 = runUntil(w, e => of(e, 'bounce').length > 0, 3);
  assert.strictEqual(of(r2.ev, 'bounce')[0].kind, 'rescue');
  run(w, 0.6);
  assert.ok(!w.platforms.some(p => p.kind === 'rescue'), 'trampoline removed after its bounce');
  assert.strictEqual(w.phase, 'play'); assert.ok(w.hero.y > w.camY + 2);
  assert.strictEqual(w.stats.falls, 1); assert.strictEqual(w.stats.rescues, 1);
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

// ---------- wind ----------
test('wind: calm → warn → blow → calm, eased strength, first gust ≈ 6 s', () => {
  const w = mk('normal', 3); w.hearts = w.maxHearts = 1e6; const D = C.difficulty.normal, Z = C.zones[0].wind;
  const seq = []; let tWarn = 0, tStart = 0, tEnd = 0, t = 0, sEarly = -1, sMid = -1;
  while (t < 40 && seq.length < 6) {
    w.update(H); t += H;
    for (const e of w.drainEvents()) {
      if (e.type === 'windWarn') { seq.push('warn'); tWarn = t; assert.ok(e.dir === 1 || e.dir === -1); }
      if (e.type === 'windStart') { seq.push('start'); tStart = t; }
      if (e.type === 'windEnd') {
        seq.push('end'); tEnd = t;
        assert.ok(tEnd - tStart >= Z.blow[0] - 0.02 && tEnd - tStart <= Z.blow[1] + 0.02, 'blow dur');
        assert.strictEqual(w.wind.state, 'calm'); assert.ok(w.wind.next >= Z.every[0] - 0.02 && w.wind.next <= Z.every[1], 'next ' + w.wind.next);
      }
    }
    if (w.wind.state === 'blow' && sEarly < 0 && w.wind.t >= 0.1) sEarly = w.wind.strength;
    if (w.wind.state === 'blow' && sMid < 0 && w.wind.t >= 1.0) sMid = w.wind.strength;
    if (seq.length === 1) near(tWarn, C.firstGust, 0.02, 'first gust');
    if (seq.length === 2) near(tStart - tWarn, D.warnT, 0.02, 'warn time');
  }
  assert.deepStrictEqual(seq, ['warn', 'start', 'end', 'warn', 'start', 'end']);
  assert.ok(sEarly > 0 && sEarly < 0.4, 'eases in ' + sEarly); near(sMid, 1, 1e-9);
  assert.strictEqual(w.wind.count, 2); assert.strictEqual(w.stats.gusts, 2);
});

test('wind: directions flip sometimes (≈ 70 %), not always', () => {
  const w = clean('normal'); w.spawn('hay', 6, 0, { w: 14 }); w.hero.y = 0; w.wind.next = 0.01; w.level = 2; w.zone = 2;
  const dirs = [];
  run(w, 600, e => { if (e.type === 'windWarn') dirs.push(e.dir); });
  assert.ok(dirs.length > 40, 'gusts ' + dirs.length);
  let flips = 0; for (let i = 1; i < dirs.length; i++) if (dirs[i] !== dirs[i - 1]) flips++;
  const k = flips / (dirs.length - 1);
  assert.ok(k > 0.5 && k < 0.9, 'flip share ' + k);
  // gust(dir) hook starts a warning now
  const ev = []; w.wind.state = 'calm'; w.gust(-1); ev.push(...w.drainEvents());
  assert.strictEqual(ev[0].type, 'windWarn'); assert.strictEqual(ev[0].dir, -1); assert.strictEqual(w.wind.state, 'warn');
});

test('wind: actually pushes Clover (acceleration, may exceed maxVx a little), scales by zone/difficulty', () => {
  function drift(diff, zone, steer) {
    const w = clean(diff); w.zone = zone; w.level = zone; w.hero.x = 3; w.hero.y = 60; w.camY = 30; w.hero.vy = 0;
    w.gust(1); w.steer(steer || 0);
    let vmax = 0; run(w, C.difficulty[diff].warnT + 3.0, () => {});
    const w2 = clean(diff); w2.zone = zone; w2.level = zone; w2.hero.x = 3; w2.hero.y = 60; w2.camY = 30; w2.gust(1); w2.steer(steer || 0);
    for (let i = 0; i < Math.round((C.difficulty[diff].warnT + 3.0) / H); i++) { w2.update(H); vmax = Math.max(vmax, w2.hero.vx); }
    return { dx: w.hero.x - 3, vmax };
  }
  const n = drift('normal', 2), e = drift('easy', 2), s = drift('normal', 0);
  assert.ok(n.dx > 1.5, 'wind zone pushes ' + n.dx);
  assert.ok(e.dx < n.dx && s.dx < n.dx, 'weaker on easy / sunny');
  const st = drift('normal', 2, 1);
  assert.ok(st.vmax > C.maxVx + 0.5 && st.vmax <= C.maxVx + C.zones[2].wind.ax * C.windOverK + 1e-6, 'over max ' + st.vmax);
  // counter-steering still wins against the strongest wind (hard, wind zone, loop 1)
  const w = clean('hard'); w.zone = 2; w.level = 6; w.loop = 1; w.hero.y = 60; w.camY = 30; w.hero.x = 8; w.gust(1);
  run(w, C.difficulty.hard.warnT + 0.6); w.steer(-1); const x0 = w.hero.x; run(w, 1.0); assert.ok(w.hero.x < x0 - 2);
});

// ---------- levels, score ----------
test('level up at the goal: bonus, +1 heart, happy, loop scaling', () => {
  const w = clean('normal'); w.hearts = 2; w.spawn('hay', 6, 139.5, { w: 6 }); w.camY = 135; w.hero.y = 140.2; w.hero.vy = 1; w.maxY = 139.9;
  const s0 = w.score;
  const ev = run(w, 0.05);
  const lu = of(ev, 'levelUp')[0];
  assert.ok(lu && lu.level === 1 && lu.zone === 1 && lu.bonus === 100);
  assert.strictEqual(w.hearts, 3); assert.strictEqual(of(ev, 'heartGain').length, 1);
  assert.ok(w.score >= s0 + 100); assert.strictEqual(w.hero.mood, 'happy');
  near(w.levelY0, 140, 0.3); assert.strictEqual(w.goal, 140);
  w.gotoLevel(3); let e2 = w.drainEvents(); assert.strictEqual(of(e2, 'levelUp')[0].zone, 3);
  w.maxY = w.levelY0 + 140.01; w.hero.y = w.maxY + 0.1; w.hero.vy = 1;
  e2 = run(w, 0.02); const l4 = of(e2, 'levelUp')[0];
  assert.ok(l4 && l4.level === 4 && l4.zone === 0 && l4.bonus === 400, JSON.stringify(l4));
  assert.strictEqual(w.loop, 1); near(w.goal, 154, 1e-9);
  assert.deepStrictEqual([mk('easy').goal, mk('normal').goal, mk('hard').goal], [C.goal.easy, C.goal.normal, C.goal.hard]);
  const lv5 = mk('normal', 1, { level: 5 }); assert.strictEqual(lv5.zone, 1); assert.strictEqual(lv5.loop, 1);
  const bonusL5 = C.levelBonus * (lv5.zone + 1) * (lv5.loop + 1); assert.strictEqual(bonusL5, 400);
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
  const r = runUntil(w, () => false, 0.6); void r;
  let prev = w.camY, down = false;
  for (let i = 0; i < 120; i++) { w.update(H); if (w.camY < prev - 1e-12) down = true; prev = w.camY; assert.ok(w.prevCamY <= w.camY); }
  assert.ok(!down, 'never down');
});

test('pose: squash/stretch/tilt ranges and mood sequence crouch → up → fall', () => {
  const w = clean('normal'); w.spawn('hay', 6, 0, { w: 14 }); w.hero.x = 6; w.hero.y = 0.5;
  const moods = [];
  for (let i = 0; i < 120 * 3; i++) {
    w.steer(i % 200 < 100 ? 1 : -1); w.update(H);
    const h = w.hero;
    assert.ok(h.squash >= 0 && h.squash <= 1 && h.stretch >= 0 && h.stretch <= 1 && Math.abs(h.tilt) <= C.tiltMax + 1e-9);
    if (moods[moods.length - 1] !== h.mood) moods.push(h.mood);
  }
  const s = moods.join(',');
  assert.ok(s.includes('crouch,up,fall,crouch'), s);
  const w2 = mk('easy'); assert.strictEqual(w2.hero.mood, 'idle'); run(w2, 0.3); assert.strictEqual(w2.hero.mood, 'idle');
  const e = run(w2, 0.5); assert.strictEqual(of(e, 'bounce')[0].kind, 'ground');
});

test('setX, spawn, alpha and prev* for interpolation', () => {
  const w = clean('normal'); w.setX(3.3); assert.strictEqual(w.hero.x, 3.3); assert.strictEqual(w.hero.prevX, 3.3);
  w.setX(-5); assert.strictEqual(w.hero.x, 0.55);
  w.update(H * 2.5); near(w.alpha, 0.5, 1e-6);
  assert.ok(w.hero.prevY !== w.hero.y);
  const p = w.spawn('plank', 5, 5); assert.ok(p.id && w.platforms.includes(p) && p.w === 1.7);
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
  }
});

test('bot: casual skills are slower and fall sometimes; Easy level 1 ≈ 50–90 s', () => {
  const lv = [], fpm = [];
  for (const s of [0.5, 0.7]) for (const seed of [1, 2, 3]) {
    const r = play('easy', seed, s, 200, { immortal: true });
    lv.push(r.lv[0]); fpm.push(r.w.stats.falls / (r.t / 60));
  }
  for (const t of lv) assert.ok(t > 40 && t < 110, 'level 1 time ' + t);
  const avg = lv.reduce((a, b) => a + b, 0) / lv.length;
  assert.ok(avg > 50 && avg < 85, 'avg ' + avg);
  assert.ok(Math.max(...fpm) < 4, 'falls/min ' + fpm);
  const r = play('easy', 1, 0.5, 120, { immortal: true });
  assert.ok(r.bot.stats.badPicks > 0 && r.bot.stats.decisions > 1000);
});

// ---------- weather ----------
test('weather: bounded counts (< 180), finite values, every level + wind + bursts, 3 screens', () => {
  for (const [W, Hh] of [[960, 540], [1280, 540], [720, 1600]]) {
    const wx = new FH.Weather({ width: W, height: Hh, seed: 3 }); let mx = 0;
    for (let z = 0; z < 4; z++) {
      wx.setLevel(z);
      const sprites = new Set();
      for (let i = 0; i < 60 * 12; i++) {
        const blow = i % 360 > 120 && i % 360 < 320;
        wx.setWind(i % 720 < 360 ? 1 : -1, blow ? 1 : 0);
        wx.update(1 / 60, i % 200 < 100 ? 400 : 0);
        if (i % 40 === 0) wx.burst('sparkle', 100, 100, 14, { up: true });
        mx = Math.max(mx, wx.particles.length);
        for (const p of wx.particles) sprites.add(p.sprite);
      }
      for (const p of wx.particles) {
        assert.ok(isFinite(p.x) && isFinite(p.y) && isFinite(p.size) && isFinite(p.rot) && p.alpha >= 0 && p.alpha <= 1, JSON.stringify(p));
        assert.ok(p.layer === 'back' || p.layer === 'front');
        if (p.layer === 'front' && p.kind !== 'burst') assert.ok(p.alpha <= 0.5 + 1e-9);
      }
      const want = [['butterfly', 'petal'], ['raindrop', 'splash'], ['leaf', 'gust'], ['snowflake', 'gust']][z];
      for (const s of want) assert.ok(sprites.has(s), 'zone ' + z + ' has ' + s);
    }
    assert.ok(mx < 180, 'max particles ' + mx);
    wx.burst('puff', 10, 10, 500); assert.ok(wx.particles.length < 180);
  }
});

test('weather: crossfade on setLevel, instant swap, rain slants with the wind, snow has 3 depths', () => {
  const wx = new FH.Weather({ width: 960, height: 540, seed: 1 });
  wx.setLevel(1, { instant: true }); assert.ok(wx.particles.every(p => p.sprite !== 'butterfly' && p.sprite !== 'petal'));
  wx.setWind(1, 1); for (let i = 0; i < 30; i++) wx.update(1 / 60, 0);
  const drops = wx.particles.filter(p => p.sprite === 'raindrop');
  assert.ok(drops.length > 40 && drops.filter(p => p.age > 0.02).every(p => p.rot < -0.1), 'slanted by the wind');
  wx.setLevel(3);
  const dying = wx.particles.filter(p => p.dying).length; assert.ok(dying > 40, 'old ones fade out');
  for (let i = 0; i < 120; i++) wx.update(1 / 60, 0);
  assert.ok(!wx.particles.some(p => p.sprite === 'raindrop'), 'faded');
  const depths = new Set(wx.particles.filter(p => p.sprite === 'snowflake').map(p => p.depth));
  assert.strictEqual(depths.size, 3);
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
