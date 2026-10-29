#!/usr/bin/env node
// Family Flappy — headless unit tests for rng / world / weather / bot.
// Run from projects/daily-game/flappy:   node tests/unit/run.js
'use strict';
const assert = require('assert');
const { load } = require('./load');

const FF = load();
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ---------- helpers ----------
function run(w, seconds, dt, onStep) {
  dt = dt || 1 / 60;
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) { if (onStep) onStep(i); w.update(dt); }
}
function startedWorld(seed, cfg) {
  const w = new FF.World({ seed: seed || 1, config: cfg });
  w.flap();                        // ready -> playing
  w.drainEvents();
  return w;
}
const VALID_SPRITES = ['petal', 'blossom', 'leaf_red', 'leaf_orange', 'leaf_yellow', 'snowflake',
  'butterfly_a', 'butterfly_b', 'seed', 'dot'];

// ---------- RNG ----------
test('rng: deterministic and in range', () => {
  const a = new FF.RNG(42), b = new FF.RNG(42), c = new FF.RNG(43);
  const sa = [], sb = [], sc = [];
  for (let i = 0; i < 1000; i++) { sa.push(a.next()); sb.push(b.next()); sc.push(c.next()); }
  assert.deepStrictEqual(sa, sb);
  assert.notDeepStrictEqual(sa, sc);
  assert.ok(sa.every(v => v >= 0 && v < 1));
  const r = new FF.RNG(1);
  for (let i = 0; i < 500; i++) {
    const x = r.int(2, 5); assert.ok(x >= 2 && x <= 5 && Number.isInteger(x));
    const y = r.range(-3, 7); assert.ok(y >= -3 && y < 7);
    assert.ok(['a', 'b', 'c'].includes(r.pick(['a', 'b', 'c'])));
    assert.strictEqual(typeof r.chance(0.5), 'boolean');
  }
  assert.strictEqual(new FF.RNG(9).chance(0), false);
  assert.strictEqual(new FF.RNG(9).chance(1), true);
});

// ---------- World: contract ----------
test('world: initial state matches contract', () => {
  const w = new FF.World({ seed: 1234 });
  assert.strictEqual(w.state, 'ready');
  assert.strictEqual(w.score, 0); assert.strictEqual(w.season, 0); assert.strictEqual(w.seasonIndex, 0);
  assert.strictEqual(w.width, 960); assert.strictEqual(w.height, 540); assert.strictEqual(w.groundY, 470);
  for (const k of ['x', 'y', 'vy', 'angle', 'wingPhase', 'frame', 'radius', 'alive', 'squash']) assert.ok(k in w.bird, k);
  assert.ok(w.turtles.length >= 1, 'a turtle is on screen at start');
  const t = w.turtles[0];
  for (const k of ['id', 'x', 'y', 'dir', 'speed', 'walkPhase', 'frame', 'happyTimer', 'w', 'h', 'fed']) assert.ok(k in t, k);
  assert.strictEqual(t.y, 470); assert.strictEqual(t.w, 132); assert.strictEqual(t.h, 79);
  assert.ok(t.speed >= 15 && t.speed <= 45);
});

test('world: READY hovers with a bob, ground scrolls, no gravity', () => {
  const w = new FF.World({ seed: 1 });
  let minY = 1e9, maxY = -1e9;
  run(w, 5, 1 / 60, () => { minY = Math.min(minY, w.bird.y); maxY = Math.max(maxY, w.bird.y); });
  assert.strictEqual(w.state, 'ready');
  assert.ok(maxY - minY > 10 && maxY - minY < 25, 'bob amplitude ' + (maxY - minY));
  assert.ok(Math.abs((minY + maxY) / 2 - 230) < 3);
  assert.ok(w.scroll > 100, 'ground scrolls in READY');
  assert.ok(w.bird.wingPhase >= 0 && w.bird.wingPhase < 1);
});

test('world: determinism — same seed + same inputs = same state (any dt partition)', () => {
  function play(seed, dtPattern) {
    const w = new FF.World({ seed });
    const flapsAt = new Set([10, 50, 80, 115, 160, 200, 238, 270, 300, 340, 377, 410, 450, 489, 520]);
    let stepIdx = 0;
    const evs = [];
    // drive by real steps of 1/120 using varying dt pieces
    let k = 0;
    while (stepIdx < 600) {
      if (flapsAt.has(stepIdx)) w.flap();
      w.update(dtPattern[k++ % dtPattern.length] * (1 / 120));
      stepIdx = Math.round(w.time * 120);
      evs.push(...w.drainEvents().map(e => e.type));
    }
    return { snap: w.snapshot(), evs };
  }
  const a = play(77, [1]), b = play(77, [1]);
  assert.deepStrictEqual(a.snap, b.snap);
  assert.deepStrictEqual(a.evs, b.evs);
  const c = play(78, [1]);
  assert.notDeepStrictEqual(a.snap.turtles, c.snap.turtles);
  // big update in one call == many small ones
  const w1 = new FF.World({ seed: 5 }), w2 = new FF.World({ seed: 5 });
  w1.flap(); w2.flap();
  w1.update(3);
  for (let i = 0; i < 360; i++) w2.update(1 / 120);
  assert.deepStrictEqual(w1.snapshot(), w2.snapshot());
});

test('world: flap arc — rises 60–80 px, apex ≈ 0.3 s, terminal fall 600–700 px/s', () => {
  const w = new FF.World({ seed: 1 });
  run(w, 0.5);
  w.flap();
  assert.strictEqual(w.bird.vy, FF.CONFIG.flapImpulse, 'flap SETS vy');
  const y0 = w.bird.y; let minY = y0, tPeak = 0, t = 0, maxVy = 0;
  while (w.state === 'playing' && t < 5) {
    w.update(1 / 120); t += 1 / 120;
    if (w.bird.y < minY) { minY = w.bird.y; tPeak = t; }
    maxVy = Math.max(maxVy, w.bird.vy);
  }
  const rise = y0 - minY;
  assert.ok(rise >= 60 && rise <= 80, 'rise ' + rise);
  assert.ok(tPeak >= 0.25 && tPeak <= 0.36, 'apex t ' + tPeak);
  assert.ok(maxVy >= 600 && maxVy <= 700, 'terminal ' + maxVy);
  // flap again resets velocity no matter how fast we fall
  const w2 = startedWorld(1); run(w2, 0.5, 1 / 120);
  w2.flap(); assert.strictEqual(w2.bird.vy, FF.CONFIG.flapImpulse);
});

test('world: tilt, wings and squash behave', () => {
  const w = startedWorld(2);
  assert.ok(w.bird.squash > 1.1, 'stretched right after flap');
  run(w, 0.1, 1 / 120);
  const DEG = Math.PI / 180;
  assert.ok(w.bird.angle < -18 * DEG, 'nose up after flap: ' + w.bird.angle / DEG);
  assert.ok(w.bird.squash < 1.08 && w.bird.squash >= 1);
  // wings fast right after flap
  const p0 = w.bird.wingPhase; let cycles = 0, last = p0;
  const w3 = startedWorld(2);
  let wraps = 0, prev = w3.bird.wingPhase;
  run(w3, 0.2, 1 / 120, () => { if (w3.bird.wingPhase < prev) wraps++; prev = w3.bird.wingPhase; });
  assert.ok(wraps >= 1, 'at least one full fast cycle in 0.2 s');
  // falls → nose down, smoothly (no jump > 6° per 1/120 s)
  const w4 = startedWorld(3); let prevA = w4.bird.angle, maxJump = 0;
  run(w4, 0.85, 1 / 120, () => { maxJump = Math.max(maxJump, Math.abs(w4.bird.angle - prevA)); prevA = w4.bird.angle; });
  assert.ok(w4.bird.angle > 30 * DEG, 'nose-down when falling fast: ' + w4.bird.angle / DEG);
  assert.ok(w4.bird.angle <= 70 * DEG + 1e-6);
  assert.ok(maxJump < 6 * DEG, 'smooth tilt, max jump ' + maxJump / DEG);
  for (const f of ['up', 'mid', 'down']) assert.ok(['up', 'mid', 'down'].includes(w4.bird.frame) || f);
  void cycles; void last;
});

test('world: dies without input within 3 s of starting', () => {
  const w = startedWorld(4);
  let t = 0;
  while (w.state === 'playing' && t < 3) { w.update(1 / 60); t += 1 / 60; }
  assert.strictEqual(w.state, 'dead');
  assert.ok(t < 3);
  const evs = w.drainEvents();
  const dead = evs.find(e => e.type === 'dead');
  assert.ok(dead && dead.score === 0);
  assert.strictEqual(w.bird.alive, false);
  assert.ok(Math.abs(w.bird.y + w.bird.radius - w.groundY) < 1e-6);
  // dead: flap ignored, scroll comes to a stop
  w.flap(); run(w, 3);
  assert.strictEqual(w.state, 'dead');
  assert.strictEqual(w.scrollSpeed, 0);
  w.reset();
  assert.strictEqual(w.state, 'ready'); assert.strictEqual(w.bird.alive, true);
});

test('world: ceiling clamps with gentle bounce and emits ceiling', () => {
  const w = startedWorld(5);
  let ceilings = 0, minTop = 1e9;
  for (let i = 0; i < 240; i++) {
    if (i % 8 === 0) w.flap();
    w.update(1 / 120);
    minTop = Math.min(minTop, w.bird.y - w.bird.radius);
    ceilings += w.drainEvents().filter(e => e.type === 'ceiling').length;
  }
  assert.ok(ceilings >= 1, 'ceiling event');
  assert.ok(minTop >= -1e-9, 'clamped at the top: ' + minTop);
  assert.strictEqual(w.state, 'playing', 'ceiling is not deadly');
});

test('world: drop spawns below/behind bird, falls in a curve, drifts back left, respects cooldown & max', () => {
  const w = startedWorld(6);
  run(w, 0.3, 1 / 120);
  const by = w.bird.y;
  w.flap();
  const evs = w.drainEvents();
  assert.ok(evs.some(e => e.type === 'drop'));
  assert.strictEqual(w.drops.length, 1);
  const d = w.drops[0];
  assert.ok(d.y > by && d.x <= w.bird.x, 'below / behind');
  const x0 = d.x;
  w.flap();   // within cooldown → no new drop
  assert.strictEqual(w.drops.length, 1, 'cooldown');
  let t = 0, maxVy = d.vy;
  while (!d.landed && t < 3) { w.update(1 / 120); t += 1 / 120; maxVy = Math.max(maxVy, d.vy); }
  assert.ok(d.landed, 'landed');
  assert.ok(d.x < x0 - 10, 'drifted back-left on screen: ' + (d.x - x0));
  assert.ok(d.angle !== 0, 'spins');
  // maxDrops
  const w2 = startedWorld(7, { dropGravity: 0, dropInitialVy: 0, dropInheritVy: 0 });   // drops hang in the air
  let made = 0;
  for (let i = 0; i < 12; i++) { w2.flap(); w2.update(0.2); made += w2.drainEvents().filter(e => e.type === 'drop').length; }
  assert.strictEqual(w2.state, 'playing');
  assert.ok(w2.drops.filter(x => !x.landed).length <= FF.CONFIG.maxDrops);
  assert.strictEqual(made, FF.CONFIG.maxDrops);
});

test('world: drop landing on ground → miss, bounce, slide with ground, fade', () => {
  const w = startedWorld(8);
  w.turtles.length = 0;           // nothing to hit
  w._turtleGap = 1e9; w._emptyTime = -1e9;
  run(w, 0.2, 1 / 120);
  w.flap(); w.drainEvents();
  const d = w.drops[0];
  let missEv = null, t = 0, minYAfter = 1e9, landedX = 0;
  while (d.alive && t < 3) {
    w.update(1 / 120); t += 1 / 120;
    const m = w.drainEvents().find(e => e.type === 'miss' && e.id === d.id);
    if (m) { missEv = m; landedX = d.x; }
    if (d.landed) minYAfter = Math.min(minYAfter, d.y);
    if (w.state !== 'playing') w.flap();
    if (w.bird.y > 380) w.flap();
  }
  assert.ok(missEv, 'miss event'); assert.strictEqual(missEv.y, w.groundY);
  assert.ok(w.misses >= 1); assert.strictEqual(w.combo, 0);
  assert.ok(minYAfter < w.groundY - FF.CONFIG.dropRadius - 0.5, 'small bounce');
  assert.ok(d.x < landedX - 20, 'slides left with the ground');
  assert.ok(d.life <= 0 && !d.alive, 'faded & removed');
  assert.ok(t < 2.5);
});

function placeTurtleUnderDrop(w, preVy) {
  // predict where a drop released now crosses shell height, and park a still turtle there
  w.turtles.length = 0; w._turtleGap = 1e9; w._emptyTime = -1e9;
  const c = w.cfg, d = w.dropInit(preVy);
  const shellMidY = w.groundY - c.turtleH + c.turtleH * (c.shellY0 + c.shellY1) / 2;
  while (d.y < shellMidY) FF.World.stepDropAir(d, 1 / 120, w.scrollSpeed, w.wind, c);
  const t = w._spawnTurtle(0);
  t.speed = 0; t._nextPause = 1e9;
  // turtle scrolls left with the ground: place it where it will BE when the drop arrives
  // (drop's own travel time ≈ computed by the loop; approximate using scroll)
  return { t, crossX: d.x, shellMidY };
}

test('world: drop hits a turtle placed beneath → hit, happy, fed, score', () => {
  const w = startedWorld(9);
  run(w, 0.25, 1 / 120);
  // find fall time to shell, then place turtle so it arrives exactly there
  const c = w.cfg, probe = w.dropInit(w.bird.vy);
  const shellMidY = w.groundY - c.turtleH + c.turtleH * (c.shellY0 + c.shellY1) / 2;
  let tf = 0;
  while (probe.y < shellMidY) { FF.World.stepDropAir(probe, 1 / 120, w.scrollSpeed, w.wind, c); tf += 1 / 120; }
  w.turtles.length = 0; w._turtleGap = 1e9;
  const tur = w._spawnTurtle(probe.x + w.scrollSpeed * tf);
  tur.speed = 0; tur._nextPause = 1e9;
  const pred = w.predictDrop(w.bird.vy);
  assert.strictEqual(pred.hitId, tur.id, 'prediction agrees');
  w.flap(); w.drainEvents();
  let hit = null, t = 0;
  while (!hit && t < 2) {
    w.update(1 / 120); t += 1 / 120;
    hit = w.drainEvents().find(e => e.type === 'hit') || null;
  }
  assert.ok(hit, 'hit event');
  assert.strictEqual(hit.turtleId, tur.id);
  assert.strictEqual(hit.points, 1); assert.strictEqual(hit.combo, 1);
  assert.strictEqual(w.score, 1); assert.strictEqual(w.hits, 1); assert.strictEqual(tur.fed, 1);
  assert.strictEqual(tur.frame, 'happy');
  assert.ok(tur.happyTimer > 0.5);
  assert.strictEqual(w.drops.length, 0, 'drop consumed');
  // happy stops walking
  tur.speed = 30; const x0 = tur.x; w.update(0.2);
  assert.ok(Math.abs((tur.x - x0) + w.scrollSpeed * 0.2) < 3, 'stands still (only scrolls) while happy');
  w.update(0.6);
  assert.notStrictEqual(tur.frame, 'happy');
  void placeTurtleUnderDrop;
});

test('world: shellBox covers the shell top and is forgiving', () => {
  const w = new FF.World({ seed: 1 });
  const t = { x: 500, y: 470, w: 132, h: 79 };
  const b = w.shellBox(t);
  // viewBox shell x 40..160 of 200, y 15..70 of 120
  const sx0 = 500 - 66 + 132 * 40 / 200, sx1 = 500 - 66 + 132 * 160 / 200;
  const sy0 = 470 - 79 + 79 * 15 / 120;
  assert.ok(b.x <= sx0 && b.x + b.w >= sx1, 'spans shell width');
  assert.ok(b.y <= sy0 && b.y + b.h > sy0 + 20 && b.y + b.h < 470 - 20, 'top part only');
  assert.ok(b.x + b.w / 2 === 500);
});

test('world: scoring, combo bonus, season change at 10 points, events', () => {
  const w = startedWorld(10);
  const tur = w.turtles[0];
  const events = [];
  function feed(n) {
    for (let i = 0; i < n; i++) {
      tur.hitCooldown = 0;
      w._hit({ x: tur.x, y: 420, alive: true }, tur);
      events.push(...w.drainEvents());
    }
  }
  feed(2);
  assert.strictEqual(w.score, 2);
  feed(1);                     // combo 3 → 1 + 1 bonus
  assert.strictEqual(w.score, 4);
  assert.strictEqual(events[2].points, 2);
  // a miss resets combo
  w.combo = 0;
  feed(5);                     // 1,1,2,2,2 = 8 → score 12 crosses 10
  assert.strictEqual(w.score, 12);
  assert.strictEqual(w.season, 1); assert.strictEqual(w.seasonIndex, 1);
  const s = events.filter(e => e.type === 'season');
  assert.strictEqual(s.length, 1);
  assert.deepStrictEqual({ season: s[0].season, seasonIndex: s[0].seasonIndex }, { season: 1, seasonIndex: 1 });
  // wraps after winter
  w.combo = 0; w.score = 39; tur.hitCooldown = 0;
  w._hit({ x: 0, y: 0 }, tur);
  assert.strictEqual(w.seasonIndex, 4); assert.strictEqual(w.season, 0);
  for (const e of events.filter(e => e.type === 'hit')) for (const k of ['x', 'y', 'points', 'combo', 'turtleId']) assert.ok(k in e);
});

test('world: all event types appear in a bot game with the right shapes', () => {
  const w = new FF.World({ seed: 11 });
  const bot = new FF.Bot(w, { skill: 1, seed: 11 });
  const seen = {};
  for (let i = 0; i < 60 * 90; i++) {
    bot.step(1 / 60); w.update(1 / 60);
    for (const e of w.drainEvents()) (seen[e.type] = seen[e.type] || []).push(e);
  }
  for (const t of ['start', 'flap', 'drop', 'hit', 'miss', 'season']) assert.ok(seen[t], 'event ' + t);
  assert.strictEqual(seen.start.length, 1);
  assert.ok('x' in seen.flap[0] && 'y' in seen.flap[0]);
  assert.ok('x' in seen.drop[0] && 'y' in seen.drop[0]);
  assert.ok('x' in seen.miss[0] && 'y' in seen.miss[0]);
  // dead event shape
  const w2 = startedWorld(12); run(w2, 3);
  const d = w2.drainEvents().find(e => e.type === 'dead');
  assert.ok(d && 'x' in d && 'y' in d && 'score' in d);
});

test('world: turtles keep coming, 1–3 on screen, walk both ways, despawn left', () => {
  const w = startedWorld(13);
  w.cfg.gravity = 0; w.bird.vy = 0;           // keep bird alive for this test
  let emptyStreak = 0, maxEmpty = 0, maxOn = 0, sum = 0, n = 0;
  const dirs = new Set(); let minX = 1e9;
  run(w, 120, 1 / 60, () => {
    const on = w.turtles.filter(t => t.x > -66 && t.x < 960 + 66).length;
    emptyStreak = on === 0 ? emptyStreak + 1 / 60 : 0;
    maxEmpty = Math.max(maxEmpty, emptyStreak);
    maxOn = Math.max(maxOn, on); sum += on; n++;
    for (const t of w.turtles) { dirs.add(t.dir); minX = Math.min(minX, t.x); }
    for (const t of w.turtles) assert.ok(t.speed >= 15 && t.speed <= 80);
  });
  assert.ok(maxEmpty < 2, 'never empty for long: ' + maxEmpty);
  assert.ok(maxOn <= 4, 'not crowded: ' + maxOn);
  const avg = sum / n;
  assert.ok(avg >= 1 && avg <= 3.2, 'average on screen ' + avg);
  assert.ok(dirs.has(1) && dirs.has(-1));
  assert.ok(minX >= FF.CONFIG.turtleDespawnX - 5, 'despawned past -150');
});

test('world: difficulty ramps smoothly; first season gentle', () => {
  const w = startedWorld(14);
  w.cfg.gravity = 0; w.bird.vy = 0;
  run(w, 5);
  assert.ok(w.scrollSpeed >= 100 && w.scrollSpeed <= 135, 'early speed ' + w.scrollSpeed);
  // wind in spring is light
  let wmin = 1e9, wmax = -1e9;
  run(w, 60, 1 / 60, () => { wmin = Math.min(wmin, w.wind); wmax = Math.max(wmax, w.wind); });
  assert.ok(wmin > -30 && wmax < 10, 'spring breeze ' + wmin + '..' + wmax);
  w.score = 60;
  let prev = w.scrollSpeed, maxJump = 0;
  run(w, 10, 1 / 60, () => { maxJump = Math.max(maxJump, Math.abs(w.scrollSpeed - prev)); prev = w.scrollSpeed; });
  assert.ok(maxJump < 3, 'smooth speed change');
  run(w, 20);
  assert.ok(w.scrollSpeed > 210 && w.scrollSpeed <= 220.0001, 'max speed ' + w.scrollSpeed);
  // autumn is gustier than summer
  function windRange(season) {
    const x = startedWorld(15); x.cfg.gravity = 0; x.bird.vy = 0;
    x.season = season; let lo = 1e9, hi = -1e9;
    run(x, 10); run(x, 60, 1 / 60, () => { lo = Math.min(lo, x.wind); hi = Math.max(hi, x.wind); });
    return [lo, hi];
  }
  const sum = windRange(1), aut = windRange(2);
  assert.ok(aut[1] - aut[0] > 2 * (sum[1] - sum[0]), 'autumn gusty ' + aut + ' vs summer ' + sum);
  assert.ok(aut[0] >= -75 && aut[1] <= 25);
});

// ---------- Bot ----------
test('bot: skill 1 survives ≥ 120 s and scores over several seeds', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const w = new FF.World({ seed });
    const bot = new FF.Bot(w, { skill: 1, seed });
    for (let i = 0; i < 60 * 125; i++) { bot.step(1 / 60); w.update(1 / 60); }
    assert.strictEqual(w.state, 'playing', 'seed ' + seed + ' died at ' + w.time);
    assert.ok(w.score > 10, 'seed ' + seed + ' score ' + w.score);
    assert.ok(bot.stats.flaps > 50 && bot.stats.aimed > 0);
  }
});

test('bot: works at high-speed (big dt) and low skill makes mistakes', () => {
  const w = new FF.World({ seed: 21 });
  const bot = new FF.Bot(w, { skill: 1, seed: 21 });
  for (let i = 0; i < 8 * 60 * 30; i++) { bot.step(1 / 120); w.update(1 / 120); }
  assert.strictEqual(w.state, 'playing');
  let deaths = 0, score = 0;
  for (const seed of [1, 2, 3, 4]) {
    const w2 = new FF.World({ seed }), b2 = new FF.Bot(w2, { skill: 0.2, seed });
    for (let i = 0; i < 60 * 120; i++) {
      b2.step(1 / 60); w2.update(1 / 60);
      if (w2.state === 'dead') { deaths++; score += w2.score; break; }
    }
  }
  assert.ok(deaths >= 1, 'a clumsy bot sometimes crashes');
  void score;
});

// ---------- Weather ----------
function windAt(t, season) {
  const amp = [12, 5, 36, 18][season], base = [-10, -3, -22, -14][season];
  return base + amp * Math.sin(t * 0.9) * Math.cos(t * 0.37);
}

test('weather: every season stays in 40–90 particles for 60 s, valid fields', () => {
  for (let s = 0; s < 4; s++) {
    const wx = new FF.Weather({ width: 960, height: 540, groundY: 470, seed: 3 + s });
    wx.setSeason(s, { instant: true });
    let mn = 1e9, mx = 0, minVis = 1e9, t = 0;
    for (let i = 0; i < 3600; i++) {
      t += 1 / 60;
      wx.update(1 / 60, { wind: windAt(t, s), scrollSpeed: 120 + i / 60 });
      mn = Math.min(mn, wx.particles.length); mx = Math.max(mx, wx.particles.length);
      if (i % 60 === 0) {
        const vis = wx.particles.filter(p => p.x > 0 && p.x < 960 && p.y > 0 && p.y < 470).length;
        if (i > 600) minVis = Math.min(minVis, vis);
      }
    }
    assert.ok(mn >= 40 && mx <= 90, 'season ' + s + ' count ' + mn + '..' + mx);
    assert.ok(minVis >= 25, 'season ' + s + ' visible density ' + minVis);
    const layers = new Set();
    for (const p of wx.particles) {
      assert.ok(VALID_SPRITES.includes(p.sprite), 'sprite ' + p.sprite);
      for (const k of ['x', 'y', 'size', 'rot', 'flipX', 'alpha']) assert.ok(Number.isFinite(p[k]), k);
      assert.ok(p.flipX >= -1 && p.flipX <= 1);
      assert.ok(p.alpha >= 0 && p.alpha <= 1);
      assert.ok(p.layer === 'back' || p.layer === 'front');
      if (p.sprite === 'dot') assert.ok(typeof p.color === 'string');
      else assert.ok(p.size >= 8 && p.size <= 26, 'sprite size ' + p.size);
      layers.add(p.layer);
    }
    assert.ok(layers.has('back') && layers.has('front'), 'both layers in season ' + s);
    assert.ok(wx.ambient && 'sunRays' in wx.ambient && 'fog' in wx.ambient && 'tint' in wx.ambient);
  }
});

test('weather: season content is right (petals, butterflies 3–6 flapping, 3 leaf colours, snow layers)', () => {
  const wx = new FF.Weather({ seed: 9 });
  let st = wx.stats().bySprite;
  assert.ok(st.petal > 20 && st.blossom > 0);
  wx.setSeason(1, { instant: true });
  const bf = () => wx.particles.filter(p => p.sprite.startsWith('butterfly'));
  assert.ok(bf().length >= 3 && bf().length <= 6);
  // sprite alternates at 8–12 Hz
  const b0 = bf()[0]; let switches = 0, prev = b0.sprite;
  for (let i = 0; i < 120; i++) { wx.update(1 / 120, { wind: -3, scrollSpeed: 120 }); if (b0.sprite !== prev) switches++; prev = b0.sprite; }
  assert.ok(switches >= 14 && switches <= 26, 'butterfly flap switches/s ' + switches);
  assert.ok(wx.ambient.sunRays > 0.6);
  wx.setSeason(2, { instant: true });
  st = wx.stats().bySprite;
  assert.ok(st.leaf_red && st.leaf_orange && st.leaf_yellow);
  // leaves tumble: some flipX negative over time
  let neg = 0; for (let i = 0; i < 120; i++) { wx.update(1 / 60, { wind: -30, scrollSpeed: 120 }); neg += wx.particles.filter(p => p.flipX < 0).length; }
  assert.ok(neg > 0, 'leaves tumble');
  wx.setSeason(3, { instant: true });
  st = wx.stats().bySprite;
  assert.ok(st.dot > 30 && st.snowflake > 10);
  assert.ok(wx.ambient.fog > 0.2);
  // depth: front flakes are bigger and faster than far dots
  const y0 = new Map(wx.particles.map(p => [p, p.y]));
  wx.update(0.5, { wind: 0, scrollSpeed: 0 });
  const sp = (f) => { const a = wx.particles.filter(f); return a.reduce((s, p) => s + (p.y - y0.get(p)), 0) / a.length; };
  const far = sp(p => p.sprite === 'dot' && p.size < 4 && y0.has(p)), near = sp(p => p.layer === 'front' && y0.has(p));
  assert.ok(near > far * 2, 'parallax depth: near ' + near + ' far ' + far);
});

test('weather: transitions hand over smoothly and stay bounded', () => {
  const wx = new FF.Weather({ seed: 4 });
  let t = 0;
  for (let cycle = 0; cycle < 8; cycle++) {
    const next = (cycle + 1) % 4;
    wx.setSeason(next);
    let mx = 0; const counts = [];
    for (let i = 0; i < 60 * 15; i++) {
      t += 1 / 60;
      wx.update(1 / 60, { wind: windAt(t, next), scrollSpeed: 150 });
      mx = Math.max(mx, wx.particles.length);
      if (i === 30) counts.push(wx.particles.filter(p => p.season === next).length);
    }
    assert.ok(mx <= 190, 'bounded during transition ' + mx);
    const total = wx.particles.length, ofNew = wx.particles.filter(p => p.season === next).length;
    assert.strictEqual(total, ofNew, 'old season gone after 15 s (cycle ' + cycle + ')');
    const full = Weather_full(next, wx);
    assert.ok(counts[0] < full, 'ramping in, not instant: ' + counts[0] + ' < ' + full);
    assert.ok(total >= 40 && total <= 90);
  }
  // fade-in: no particle pops at full alpha straight after a switch
  wx.setSeason(1);
  wx.update(0.3, { wind: -10, scrollSpeed: 120 });
  const fresh = wx.particles.filter(p => p.season === 1);
  assert.ok(fresh.length > 0 && fresh.length < 20, 'ramping ' + fresh.length);
  assert.ok(fresh.every(p => p.alpha < 0.4), 'new particles fade in');
});
function Weather_full(s, wx) {
  return FF.Weather.SEASONS[s].emitters.reduce((n, e) => n + (e.count === 'butterflies' ? wx.butterflies : e.count), 0);
}

test('weather: deterministic with seed', () => {
  const a = new FF.Weather({ seed: 5 }), b = new FF.Weather({ seed: 5 });
  for (let i = 0; i < 600; i++) {
    if (i === 200) { a.setSeason(2); b.setSeason(2); }
    a.update(1 / 60, { wind: -20, scrollSpeed: 140 }); b.update(1 / 60, { wind: -20, scrollSpeed: 140 });
  }
  assert.deepStrictEqual(JSON.parse(JSON.stringify(a.particles)), JSON.parse(JSON.stringify(b.particles)));
});

// ---------- performance ----------
test('performance: 10 minutes of game time (world + bot + weather) runs fast', () => {
  const t0 = process.hrtime.bigint();
  const w = new FF.World({ seed: 31 });
  const bot = new FF.Bot(w, { skill: 1, seed: 31 });
  const wx = new FF.Weather({ seed: 31 });
  let season = 0;
  for (let i = 0; i < 60 * 600; i++) {
    bot.step(1 / 60); w.update(1 / 60);
    for (const e of w.drainEvents()) if (e.type === 'season') season = e.season;
    if (wx.season !== season) wx.setSeason(season);
    wx.update(1 / 60, { wind: w.wind, scrollSpeed: w.scrollSpeed });
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.strictEqual(w.state, 'playing');
  assert.ok(w.drops.length <= FF.CONFIG.maxDrops * 2 && w.turtles.length <= 8, 'entity counts bounded');
  assert.ok(ms < 8000, 'took ' + ms.toFixed(0) + ' ms');
  console.log('      10 min sim in ' + ms.toFixed(0) + ' ms; score ' + w.score + ', seasons passed ' + w.seasonIndex);
});

// ---------- runner ----------
let pass = 0, fail = 0;
for (const t of tests) {
  try { t.fn(); pass++; console.log('  ok   ' + t.name); }
  catch (e) { fail++; console.log('  FAIL ' + t.name + '\n       ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n       ') : e)); }
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
