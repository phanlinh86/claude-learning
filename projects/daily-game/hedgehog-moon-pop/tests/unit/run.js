#!/usr/bin/env node
// Bristle's Moon Pop — headless unit tests for rng / world / weather / bot.
// Run from projects/daily-game/hedgehog-moon-pop:   node tests/unit/run.js [filter]
'use strict';
const assert = require('assert');
const { load } = require('./load');

const MP = load();
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const H = 1 / 120;
const J = v => JSON.parse(JSON.stringify(v));
const deq = (a, b, m) => assert.deepStrictEqual(J(a), J(b), (m ? m + ': ' : '') + JSON.stringify(a) + ' vs ' + JSON.stringify(b));
const near = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, (m || '') + ' got ' + a + ' want ' + b + ' ±' + tol);
const C = MP.CONFIG;

// ---------- helpers ----------
function world(seed, cfg, level) {
  const w = new MP.World({ seed: seed || 1, config: Object.assign({ introDelay: 0 }, cfg) });
  if (level) w.startLevel(level);
  w.update(H * 2);
  assert.strictEqual(w.state, 'playing');
  w.drainEvents();
  return w;
}
function quiet(w) { w._nextSpawn = 1e9; w._nextPebble = 1e9; w._magnetAt = 1e9; w.items.length = 0; }   // no spawns
function run(w, seconds, dt, each) {
  dt = dt || 1 / 60;
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) { if (each && each(i) === false) return; w.update(dt); }
}
// a rising bubble at (x, y) with velocity (vx, vy)
function bubbleAt(w, x, y, kind, vx, vy) {
  const n0 = w.items.length;
  w._spawnBubble();
  const it = w.items[w.items.length - 1];
  assert.ok(w.items.length === n0 + 1, 'spawned');
  it.kind = kind || 'cupcake';
  it.state = 'rise'; it.t = 1; it.alpha = 1; it.r = it._R;
  it.x = it._px = x; it.y = it._py = y; it.vx = vx || 0; it.vy = vy === undefined ? -it._vR : vy;
  w.vents.forEach(v => { v.cool = 0; });
  return it;
}
function pebbleAt(w, x, y, vy) {
  const it = w._newPebble(x);
  it._A = 0; it._bx = x; it.x = it._px = x; it.y = it._py = y; it.vy = vy === undefined ? 190 : vy;
  w._predictLand(it);
  w.items.push(it);
  return it;
}
function hold(w, x) { const s = w.hog; s.x = s._px = s.board.x = x; s.vx = 0; w.setMove(0); w.setTarget(x); }
function types(evts) { return evts.map(e => e.type); }
function playGame(seed, diff, skill, maxS, stopLevel) {
  const w = new MP.World({ seed, config: MP.DIFFICULTY[diff || 'normal'] });
  const bot = new MP.Bot(w, { skill, seed: seed * 3 + 1 });
  let t = 0; maxS = maxS || 1200;
  const seen = {};
  while (w.state !== 'dead' && t < maxS && !(stopLevel !== undefined && w.level >= stopLevel)) {
    bot.step(1 / 60); w.update(1 / 60); for (const e of w.drainEvents()) seen[e.type] = (seen[e.type] || 0) + 1; t += 1 / 60;
  }
  bot.step(1 / 60);
  return { w, t, bot, seen };
}

// ---------- RNG ----------
test('rng: deterministic, in range, same API as the sister games', () => {
  const a = new MP.RNG(42), b = new MP.RNG(42), c = new MP.RNG(43);
  const sa = [], sb = [], sc = [];
  for (let i = 0; i < 500; i++) { sa.push(a.next()); sb.push(b.next()); sc.push(c.next()); }
  deq(sa, sb); assert.notDeepStrictEqual(sa, sc);
  assert.ok(sa.every(v => v >= 0 && v < 1));
  for (const k of ['range', 'int', 'pick', 'chance', 'sign', 'gauss', 'fork']) assert.strictEqual(typeof a[k], 'function', k);
});

// ---------- contract ----------
test('world: initial state and every DESIGN §5.1 field / method', () => {
  const w = new MP.World({ seed: 5 });
  assert.strictEqual(w.state, 'ready');
  deq(MP.ZONES, ['dawn', 'noon', 'sunset', 'night']);
  for (const m of ['reset', 'startLevel', 'levelInfo', 'setMove', 'setTarget', 'setPlayRange', 'action', 'update', 'drainEvents', 'snapshot']) assert.strictEqual(typeof w[m], 'function', m);
  for (const k of ['state', 'level', 'zone', 'lap', 'time', 'levelTime', 'score', 'hearts', 'heartsMax', 'combo', 'mult', 'bestCombo', 'chain', 'bestChain',
    'box', 'boxTarget', 'popsTotal', 'airPops', 'skyPops', 'bonks', 'escaped', 'magnets', 'magnet', 'vents', 'hog', 'items', 'cfg', '_acc']) assert.ok(k in w, k);
  for (const k of ['t', 'dur', 'r']) assert.ok(k in w.magnet, 'magnet.' + k);
  for (const k of ['x', 'y', 'vx', 'vy', 'air', 'lift', 'tilt', 'face', 'frame', 'spin', 'curl', 'invuln', 'squash', 'board', 'wheel', '_px', '_py']) assert.ok(k in w.hog, 'hog.' + k);
  for (const k of ['x', 'y', 'rot', '_px', '_py']) assert.ok(k in w.hog.board, 'board.' + k);
  deq([w.level, w.zone, w.lap, w.score, w.hearts, w.heartsMax, w.combo, w.mult, w.box, w.boxTarget], [0, 0, 0, 0, 3, 3, 0, 1, 0, C.boxTargets[0]]);
  deq([w.hog.x, w.hog.y, w.hog.lift, w.hog.face, w.hog.frame, w.hog.air, w.hog.board.y], [480, 446, 0, 1, 'skate', false, 484]);
  deq(types(w.drainEvents()), ['start', 'zone']);
  const c = w.cfg;
  deq([c.step, c.floorY, c.hogRestY, c.escapeY, c.puffTime, c.lengthK, c.heartsMax], [1 / 120, 492, 446, 60, 0.8, 1, 3]);
  assert.ok(w.vents.length === 3 && w.vents.every(v => 'x' in v && 'puff' in v && 'cool' in v));
  const info = w.levelInfo(5);
  for (const k of ['zone', 'lap', 'boxTarget', 'vents']) assert.ok(k in info, 'levelInfo.' + k);
  deq([info.zone, info.lap], [1, 1]);
});

test('config: DIFFICULTY overrides + lengthK scale the box (and main.js post-scaling is skipped)', () => {
  const e = new MP.World({ config: MP.DIFFICULTY.easy }), hd = new MP.World({ config: MP.DIFFICULTY.hard });
  deq([e.hearts, e.boxTarget, e.cfg.puffTime, e.cfg.magnetDur, hd.boxTarget, hd.cfg.magnetDur], [5, 14, 1.1, 9, 26, 6]);
  const L = new MP.World({ config: Object.assign({}, MP.DIFFICULTY.normal, { lengthK: 1.4 }) });
  assert.strictEqual(L.boxTarget, Math.round(C.boxTargets[0] * 1.4));
  assert.strictEqual(L._lenLevel, 0, 'marks the level so the sister main.js applyLength() is a no-op');
  L.startLevel(3); assert.strictEqual(L.boxTarget, Math.round(C.boxTargets[3] * 1.4)); assert.strictEqual(L._lenLevel, 3);
  const S = new MP.World({ config: { lengthK: 0.1 } });
  assert.strictEqual(S.boxTarget, C.boxMin);
  const N = new MP.World({});
  assert.strictEqual(N._lenLevel, undefined, 'no lengthK in config: main.js may scale it');
  N.jarTarget = 7; assert.strictEqual(N.boxTarget, 7, 'jar/jarTarget alias');
  assert.notStrictEqual(MP.CONFIG.heartsMax, 5, 'overrides never mutate CONFIG');
});

// ---------- determinism ----------
test('determinism: same seed + inputs → same snapshot; any dt partition', () => {
  const play = (dtFn) => {
    const w = new MP.World({ seed: 77 });
    const bot = new MP.Bot(w, { skill: 0.7, seed: 3 });
    let t = 0, k = 0;
    while (t < 90) { const dt = dtFn(k++); bot.step(dt); w.update(dt); w.drainEvents(); t += dt; }
    return w.snapshot();
  };
  deq(play(() => 1 / 60), play(() => 1 / 60));
  // no input: the sub-stepping makes the result independent of the frame partition
  const a = new MP.World({ seed: 9 }), b = new MP.World({ seed: 9 });
  for (let i = 0; i < 60 * 40; i++) a.update(1 / 60);
  for (let i = 0; i < 20 * 40; i++) { b.update(1 / 30); b.update(1 / 60); }
  deq(a.snapshot(), b.snapshot());
  assert.ok(a.spawned > 10);
});

// ---------- skating ----------
test('skating: accel to 380 px/s, ~0.25 s coast, precise pointer-follow, air control ×0.6', () => {
  const w = world(1); quiet(w); hold(w, 200); w.setTarget(null);
  w.setMove(1); run(w, 0.15, H); const v15 = w.hog.vx; run(w, 0.5, H);
  near(w.hog.vx, 380, 0.01, 'max speed'); assert.ok(v15 > 200 && v15 < 330, 'eases in ' + v15);
  w.setMove(0); const x0 = w.hog.x; let t = 0;
  while (w.hog.vx > 0) { w.update(H); t += H; }
  near(t, 0.25, 0.03, 'coast time'); near(w.hog.x - x0, 48, 8, 'coast distance');
  // pointer follow: stops within 4 px, overshoot < 6 px
  for (const [from, to] of [[200, 700], [700, 150], [480, 520]]) {
    hold(w, from); w.setTarget(to); let over = 0;
    run(w, 3, H, () => { over = Math.max(over, (w.hog.x - to) * Math.sign(to - from)); });
    near(w.hog.x, to, 4, 'follow'); assert.ok(over < 6, 'overshoot ' + over);
    assert.strictEqual(Math.abs(w.hog.vx) < 1, true);
  }
  // tilt leans into the motion (max 0.2) and face follows with a dead zone
  hold(w, 200); w.setTarget(null); w.setMove(1); run(w, 1, H);
  assert.ok(w.hog.tilt > 0.15 && w.hog.tilt <= 0.2 + 1e-9 && w.hog.face === 1);
  w.setMove(-1); run(w, 1, H); assert.ok(w.hog.face === -1 && w.hog.tilt < -0.15);
  // the wheels roll distance / 5 px
  const wh = w.hog.wheel, xx = w.hog.x; run(w, 0.5, H); near(w.hog.wheel - wh, (w.hog.x - xx) / 5, 1e-6);
  // air control: slower speed change in the air
  hold(w, 300); w.setTarget(null); w.setMove(0); w.action(); w.setMove(1); run(w, 0.1, H); const airV = w.hog.vx;
  run(w, 2, H); hold(w, 300); w.setTarget(null); w.setMove(1); run(w, 0.1, H);
  near(airV / w.hog.vx, 0.6, 0.05, 'air control');
  // 'push' frame alternates with 'skate' while accelerating on the floor
  hold(w, 100); w.setTarget(null); w.setMove(1); const frames = new Set();
  run(w, 0.4, H, () => { frames.add(w.hog.frame); });
  assert.ok(frames.has('push') && frames.has('skate'), [...frames].join());
});

// ---------- jump ----------
test('jump: Moon arc apex ≈ 200 px, air ≈ 1.4 s, curl → ball, board kick-flip, land squash', () => {
  const w = world(2); quiet(w); hold(w, 480);
  assert.strictEqual(w.action(), true);
  deq(types(w.drainEvents()), ['jump']);
  let apex = 0, t = 0, ballAt = null, maxRot = 0, landed = null;
  while (t < 3 && landed === null) {
    w.update(H); t += H;
    apex = Math.max(apex, w.hog.lift);
    if (ballAt === null && w.hog.frame === 'ball') ballAt = t;
    maxRot = Math.max(maxRot, Math.abs(w.hog.board.rot));
    for (const e of w.drainEvents()) if (e.type === 'land') landed = { t, e };
  }
  near(apex, 200, 2, 'apex'); near(landed.t, 1.4, 0.03, 'air time');
  assert.ok(ballAt > C.curlDelay && ballAt < 0.3, 'curls into a ball ' + ballAt);
  assert.ok(maxRot > 3, 'kick-flip ' + maxRot);
  assert.ok(landed.e.vy > 500, 'land vy');
  assert.strictEqual(w.hog.air, false); assert.strictEqual(w.hog.y, 446);
  assert.ok(w.hog.squash > 0.5, 'landing squash');
  near(w.hog.board.rot, w.hog.tilt, 1e-9, 'board flat at landing'); assert.strictEqual(w.hog.board.y, 484);
  assert.ok(w.hog.spin !== 0 || w.hog.curl < 0.02);
  run(w, 0.5, H); assert.strictEqual(w.hog.curl, 0); assert.strictEqual(w.hog.frame, 'skate');
  // spin follows the facing direction
  w.setTarget(null); w.setMove(-1); run(w, 0.3, H); w.action(); const sp0 = w.hog.spin; run(w, 0.4, H);
  assert.ok(w.hog.spin < sp0, 'spins left when facing left');
  // jump buffer: a press 0.1 s before landing jumps on touch-down; 0.2 s is too early
  run(w, 3, H); w.drainEvents();
  const pressBefore = (dt) => {
    hold(w, 480); w.action(); w.drainEvents();
    while (true) { const tl = (446 - w.hog.y) > 0 && w.hog.vy > 0 ? w.hog.vy : 0; if (tl && (446 - w.hog.y) < w.hog.vy * dt) break; w.update(H); }
    w.action(); let jumps = 0; run(w, 0.4, H, () => { for (const e of w.drainEvents()) if (e.type === 'jump') jumps++; });
    run(w, 3, H); w.drainEvents(); return jumps;
  };
  // landing recovery: a press right on touch-down waits landLag (0.1 s), then jumps
  hold(w, 480); w.action(); run(w, 1.45, H); assert.strictEqual(w.hog.air, false); w.drainEvents();
  assert.strictEqual(w.action(), false, 'board still settling');
  let jt = null; const tl0 = w.time; run(w, 0.3, H, () => { for (const e of w.drainEvents()) if (e.type === 'jump' && jt === null) jt = w.time - tl0; });
  assert.ok(jt !== null && jt <= C.landLag + 0.02, 'fires after the lag ' + jt);
  run(w, 3, H); w.drainEvents();
  assert.strictEqual(pressBefore(0.1), 1, 'buffered');
  assert.strictEqual(pressBefore(0.2), 0, 'too early');
  // soft ceiling: chained bounces never fly him above y 110
  hold(w, 480); w.action(); let minY = 1e9;
  run(w, 4, H, () => { if (w.hog.air && w.hog.vy > -C.popBounce) w.hog.vy = -C.popBounce; minY = Math.min(minY, w.hog.y); });
  assert.ok(minY >= C.ceilY - 1e-9, 'ceiling ' + minY);
});

// ---------- popping ----------
test('pop: hit radius, tiers, points, ground pop vs air pop', () => {
  const w = world(3); quiet(w); hold(w, 480);
  const R = C.bubbleR + C.hogR;
  bubbleAt(w, 480 + R + 2, 446, 'cupcake', 0, 0); w.update(H);
  assert.ok(!types(w.drainEvents()).includes('pop'), 'just outside');
  w.items.length = 0;
  bubbleAt(w, 480 + R - 2, 446, 'cupcake', 0, 0); w.update(H);
  let ev = w.drainEvents().filter(e => e.type === 'pop');
  assert.strictEqual(ev.length, 1);
  deq([ev[0].tier, ev[0].points, ev[0].combo, ev[0].mult, ev[0].chain, ev[0].air, w.box, w.score], [1, 10, 1, 1, 0, false, 1, 10]);
  for (const k of ['id', 'x', 'y', 'kind', 'color', 'tier', 'points', 'combo', 'mult', 'chain', 'air']) assert.ok(k in ev[0], 'pop.' + k);
  assert.strictEqual(w.hog.frame, 'happy');
  assert.strictEqual(w._tier(361), 1); assert.strictEqual(w._tier(360), 2); assert.strictEqual(w._tier(241), 2); assert.strictEqual(w._tier(240), 3);
  // pebbles never pop bubbles
  w.items.length = 0; const b = bubbleAt(w, 300, 300, 'cupcake', 0, 0); pebbleAt(w, 300, 300, 0); w.update(H);
  assert.strictEqual(b.state, 'rise');
  // popped bubble fades and is removed
  w.items.length = 0; const p = bubbleAt(w, 480, 440, 'cupcake', 0, 0); w.update(H); assert.strictEqual(p.state, 'pop');
  run(w, C.popTime + 0.05, H); assert.ok(!w.items.includes(p));
});

test('air chain: each air pop bounces (vy ≤ −400), chain bonus points, chain event, reset on landing', () => {
  const w = world(4); quiet(w); hold(w, 480); w.action(); run(w, 0.5, H); w.drainEvents();
  assert.ok(w.hog.air && w.hog.vy > -400);
  const s = w.hog;
  bubbleAt(w, s.x, s.y - 20, 'cupcake', 0, 0); w.update(H);
  let ev = w.drainEvents();
  let pop = ev.find(e => e.type === 'pop');
  assert.ok(pop.air && pop.chain === 1 && w.hog.vy <= -400 + C.gravity * H + 1e-6, 'bounce ' + w.hog.vy);
  assert.strictEqual(pop.points, 10 * pop.tier);
  assert.ok(!types(ev).includes('chain'));
  run(w, 0.1, H); w.drainEvents();
  bubbleAt(w, s.x, s.y - 20, 'cupcake', 0, 0); w.update(H);
  ev = w.drainEvents(); pop = ev.find(e => e.type === 'pop');
  deq([pop.chain, pop.points], [2, 10 * pop.tier * pop.mult + 10]);
  const ch = ev.find(e => e.type === 'chain'); assert.ok(ch && ch.n === 2);
  bubbleAt(w, s.x, s.y - 20, 'cupcake', 0, 0); w.update(H);
  pop = w.drainEvents().find(e => e.type === 'pop'); assert.strictEqual(pop.points, 10 * pop.tier * pop.mult + 20);
  deq([w.chain, w.bestChain, w.airPops], [3, 3, 3]);
  assert.ok(w.skyPops >= 0);
  run(w, 3, H); assert.strictEqual(w.hog.air, false); assert.strictEqual(w.chain, 0); assert.strictEqual(w.bestChain, 3);
  // a ground pop never counts as a chain
  bubbleAt(w, s.x, 440, 'cupcake', 0, 0); w.update(H);
  pop = w.drainEvents().find(e => e.type === 'pop'); deq([pop.chain, pop.air], [0, false]);
});

test('streak: ×2 at 8, ×3 at 20 (multup); a cupcake escape resets, a magnet escape does not', () => {
  const w = world(5); quiet(w); w.boxTarget = 999; hold(w, 480);
  const ups = [];
  for (let i = 1; i <= 21; i++) {
    bubbleAt(w, 480, 440, 'cupcake', 0, 0); w.update(H);
    for (const e of w.drainEvents()) if (e.type === 'multup') ups.push([i, e.mult]);
    if (i === 7) assert.strictEqual(w.mult, 1);
  }
  deq(ups, [[8, 2], [20, 3]]); deq([w.combo, w.mult, w.bestCombo], [21, 3, 21]);
  w.items.length = 0;
  bubbleAt(w, 200, C.escapeY + 1, 'magnet', 0, -80); run(w, 0.1, H);
  let ev = w.drainEvents().filter(e => e.type === 'escape');
  assert.strictEqual(ev.length, 1); deq([w.combo, w.mult, w.escaped], [21, 3, 0]);
  bubbleAt(w, 200, C.escapeY + 1, 'cupcake', 0, -80); run(w, 0.1, H);
  ev = w.drainEvents().filter(e => e.type === 'escape');
  assert.strictEqual(ev.length, 1); assert.strictEqual(ev[0].combo, 21);
  deq([w.combo, w.mult, w.escaped], [0, 1, 1]);
  // the escaping bubble rises + fades, then is removed
  const it = w.items.find(i => i.state === 'escape'); const y0 = it.y;
  run(w, 0.25, H); assert.ok(it.y < y0 && it.alpha < 0.6 && it.alpha > 0);
  run(w, 0.4, H); assert.ok(!w.items.includes(it));
});

// ---------- bubbles ----------
test('bubbles: puff telegraph → emerge at (vent.x, 470), buoyant rise to terminal speed, sway, repulsion', () => {
  const w = world(6); quiet(w); hold(w, 60);
  w._nextSpawn = 0; w.update(H); w._nextSpawn = 1e9;
  let ev = w.drainEvents(); const puff = ev.find(e => e.type === 'puff'); assert.ok(puff);
  const it = w.items[0], v = w.vents[it.vent];
  hold(w, v.x < 480 ? 900 : 60); w.setTarget(null);        // far away: don't pop it
  deq([it.state, it.x, it.y], ['puff', v.x, 470]);
  run(w, 0.4, H); near(v.puff, 0.5, 0.03, 'vent glow');
  let em = null; run(w, 0.5, H, () => { for (const e of w.drainEvents()) if (e.type === 'emerge') em = e; });
  assert.ok(em && em.id === it.id && it.state === 'rise');
  run(w, 2.5, H);
  near(it.vy, -C.rise[0], 1.5, 'terminal rise');
  // ≈ 6 s from the vent to the escape line on dawn
  let tEsc = 0; const t0 = w.time;
  run(w, 10, H, () => { if (!tEsc && it.state === 'escape') tEsc = w.time - t0 + 3.4 - 0.8; });
  assert.ok(tEsc > 5.4 && tEsc < 7.2, 'rise time ' + tEsc);
  // closed-form prediction (bot) matches the integrator
  w.items.length = 0; const b = bubbleAt(w, 400, 460, 'cupcake', 15, -45); b._sw = 1.1;
  const pr = w.bubbleAt(b, 2); run(w, 2, H);
  near(b.x, pr.x, 1.5, 'x'); near(b.y, pr.y, 1.5, 'y');
  // two bubbles pushed together separate softly (never overlapping more than 30 %)
  w.items.length = 0;
  const a1 = bubbleAt(w, 500, 300, 'cupcake', 0, -65), a2 = bubbleAt(w, 505, 302, 'cupcake', 0, -65);
  w.update(H); assert.ok(a1.squish > 0.5 && a2.squish > 0.5, 'bumped films squish');
  let minD = 1e9;
  run(w, 1, H, (i) => { if (i > 0) minD = Math.min(minD, Math.hypot(a1.x - a2.x, a1.y - a2.y)); });
  assert.ok(Math.hypot(a1.x - a2.x, a1.y - a2.y) > 0.95 * (a1.r + a2.r), 'separated');
  assert.ok(minD >= 0.7 * 60 - 1, 'overlap ' + minD);
  // walls: a bubble drifting out of the play range is bounced softly back
  w.items.length = 0; const wb = bubbleAt(w, 880, 400, 'cupcake', 120, -60);
  let maxX = 0; run(w, 2, H, () => { maxX = Math.max(maxX, wb.x); });
  assert.ok(maxX < C.xMax + C.wallPad + 22 && wb.x < C.xMax + C.wallPad + 5, 'wall ' + maxX + ' ' + wb.x);
});

test('magnet: 7 s, a bubble 200 px away reaches Bristle; nothing slingshots', () => {
  const w = world(7); quiet(w); hold(w, 480);
  bubbleAt(w, 480, 430, 'magnet', 0, 0); w.update(H);
  const ev = w.drainEvents();
  assert.ok(types(ev).includes('magnet')); assert.strictEqual(ev.find(e => e.type === 'magnet').dur, 7);
  deq([w.magnet.t > 6.9, w.magnet.dur, w.magnet.r, w.magnets, w.box], [true, 7, 300, 1, 0]);
  // ring of bubbles 200 px away (side, up-side, above) + one far outside the radius
  const ring = [[680, 446], [280, 446], [620, 300], [340, 300], [480, 246]].map(([x, y]) => bubbleAt(w, x, y, 'cupcake', 0, -65));
  const far = bubbleAt(w, 480 - 380, 300, 'cupcake', 0, -65);
  let maxV = 0, popped = 0, tAll = null;
  run(w, 7, H, () => {
    for (const b of ring) if (b.state === 'rise') maxV = Math.max(maxV, Math.hypot(b.vx, b.vy));
    for (const e of w.drainEvents()) if (e.type === 'pop') popped++;
    if (tAll === null && ring.every(b => b.state !== 'rise')) tAll = 7 - w.magnet.t;
  });
  assert.ok(tAll !== null && tAll < 4, 'all reached him in ' + tAll);
  assert.strictEqual(popped, 5);
  assert.ok(maxV <= C.magnetMaxV + 1e-6, 'speed ' + maxV);
  assert.ok(far.state === 'rise' || far.state === 'escape', 'outside the radius: not pulled');
  // ends after 7 s
  let ended = false; run(w, 0.2, H, () => { for (const e of w.drainEvents()) if (e.type === 'magnetend') ended = true; });
  assert.ok(ended && w.magnet.t === 0);
  // magnet bubbles are scheduled: first ≈ 12 s into level 1, never two alive
  const w2 = new MP.World({ seed: 11 }); let firstMag = null, maxAlive = 0, t = 0;
  while (t < 200) { w2.setTarget(480); w2.update(1 / 60); t += 1 / 60;
    for (const e of w2.drainEvents()) if (e.type === 'puff' && e.kind === 'magnet' && firstMag === null) firstMag = w2.levelTime;
    maxAlive = Math.max(maxAlive, w2.items.filter(i => i.kind === 'magnet' && (i.state === 'rise' || i.state === 'puff')).length); }
  assert.ok(firstMag > 12 && firstMag < 18, 'first magnet ' + firstMag);
  assert.strictEqual(maxAlive, 1);
});

// ---------- pebbles ----------
test('pebbles: telegraphed, slow fall (≥ 1.3 s to the hero band), always a gap, Easy never aims at him', () => {
  for (const diff of ['easy', 'normal', 'hard']) {
    let n = 0, minTE = 1e9, viol = 0, near60 = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const w = new MP.World({ seed, config: MP.DIFFICULTY[diff] });
      w.startLevel(3); let t = 0, ph = 0;
      while (t < 150) {
        ph += 1 / 60; w.setTarget(480 + 360 * Math.sin(ph * 0.4)); w.update(1 / 60); t += 1 / 60;
        if (w.state === 'dead') { w.hearts = 3; w.state = 'playing'; }
        for (const e of w.drainEvents()) if (e.type === 'pebblewarn') {
          n++;
          const it = w.items.find(i => i.id === e.id);
          minTE = Math.min(minTE, it.te - w.time);
          const p = w.hog.x + C.pebbleLead * w.hog.vx;
          if (Math.abs(it.lx - Math.max(w.cfg.xMin, Math.min(w.cfg.xMax, p))) < C.pebbleAvoid) near60++;
          for (const o of w.items) if (o !== it && o.kind === 'pebble' && o.state === 'fall' && !o.harmless) {
            if (it.te - C.pebbleSepT < o.lt && o.te - C.pebbleSepT < it.lt && Math.abs(o.lx - it.lx) < C.pebbleSep) viol++;
          }
        }
      }
    }
    assert.ok(n > 20, diff + ' pebbles ' + n);
    assert.ok(minTE >= C.pebbleDodgeT, diff + ' fall time to the hero band ' + minTE);
    assert.strictEqual(viol, 0, diff + ' trap pairs');
    if (diff === 'easy') assert.strictEqual(near60, 0, 'easy aims away');
  }
  // dawn of loop 1: no pebbles in the first 20 s
  const w = new MP.World({ seed: 3 }); let first = null;
  while (w.time < 60 && first === null) { w.update(1 / 60); for (const e of w.drainEvents()) if (e.type === 'pebblewarn') first = w._pebClock; }
  assert.ok(first >= 20, 'dawn grace ' + first);
  // predicted landing x (shadow ring) matches the fall, terminal ≈ 190 px/s, the ring grows
  const w2 = world(9, {}, 2); quiet(w2); hold(w2, 100);
  w2._nextPebble = 0; w2._pebClock = 0; w2.update(H); w2._nextPebble = 1e9;
  const pb = w2.items.find(i => i.kind === 'pebble'); const lx = pb.lx; let sh0 = pb.shadow, landEv = null, vMax = 0;
  run(w2, 5, H, () => { vMax = Math.max(vMax, pb.vy); for (const e of w2.drainEvents()) if (e.type === 'pebbleland') landEv = e; });
  assert.ok(landEv); near(landEv.x, lx, 1.5, 'landing x'); near(vMax, 190, 8, 'terminal');
  assert.ok(sh0 < 0.1);
  assert.ok(!w2.items.includes(pb), 'rolls and fades away');
});

test('bonk: −1 heart, streak reset, invuln 1.5 s (no double bonk), knock-back, bonk frame, dead at 0', () => {
  const w = world(10); quiet(w); hold(w, 480); w.combo = 9; w.mult = 2;
  pebbleAt(w, 480, 446 - 30, 190); w.update(H);
  let ev = w.drainEvents(); const b = ev.find(e => e.type === 'bonk');
  assert.ok(b); deq([b.hearts, w.hearts, w.combo, w.mult, w.bonks], [2, 2, 0, 1, 1]);
  for (const k of ['x', 'y', 'hearts']) assert.ok(k in b);
  near(w.hog.invuln, 1.5, 0.02); assert.strictEqual(w.hog.frame, 'bonk'); assert.ok(Math.abs(w.hog.vx) > 100, 'knock-back');
  pebbleAt(w, w.hog.x, 446 - 20, 190); run(w, 0.3, H);
  assert.strictEqual(w.hearts, 2, 'invulnerable');
  run(w, 0.4, H); assert.notStrictEqual(w.hog.frame, 'bonk');
  run(w, 1.2, H); w.items.length = 0; hold(w, 480);
  pebbleAt(w, 480, 416, 190); w.update(H); pebbleAt(w, 480, 416, 190);
  assert.strictEqual(w.hearts, 1);
  w.hog.invuln = 0; w.update(H);
  ev = w.drainEvents();
  assert.ok(types(ev).includes('dead')); assert.strictEqual(w.state, 'dead'); assert.strictEqual(w.hog.frame, 'bonk');
  assert.strictEqual(w.action(), false, 'no jumping when dead');
  // a pebble far to the side never bonks
  const w3 = world(11); quiet(w3); hold(w3, 480); pebbleAt(w3, 480 + 18 + 28 * 0.8 + 3, 446, 190); w3.update(H);
  assert.strictEqual(w3.hearts, 3);
});

// ---------- box, levels ----------
test('box: full → boxfull, spawns stop, 1 s grace, cleared (bonus hearts × 100, heal), next zone', () => {
  const w = world(12); hold(w, 480);
  run(w, 3, 1 / 60); w.drainEvents();
  w.box = w.boxTarget - 1; w.hearts = 2;
  bubbleAt(w, 480, 440, 'cupcake', 0, 0); pebbleAt(w, 100, 100, 190);
  w._nextSpawn = 0; w.update(H);
  let ev = w.drainEvents();
  assert.ok(types(ev).includes('boxfull'));
  assert.ok(!w.items.some(i => i.state === 'puff'), 'puffing bubbles cancelled');
  assert.ok(w.items.filter(i => i.kind === 'pebble').every(i => i.harmless), 'pebbles fade');
  const n0 = w.spawned; run(w, 0.9, H); assert.strictEqual(w.spawned, n0, 'no spawns'); assert.strictEqual(w.state, 'playing');
  // bubbles are still poppable in the grace second, but the box stays full
  bubbleAt(w, 480, 440, 'cupcake', 0, 0); w.update(H); assert.ok(types(w.drainEvents()).includes('pop')); assert.strictEqual(w.box, w.boxTarget);
  const score0 = w.score;
  run(w, 0.2, H); ev = w.drainEvents();
  const cl = ev.find(e => e.type === 'cleared'); assert.ok(cl);
  deq([cl.bonus, cl.level, w.state, w.score - score0], [200, 0, 'cleared', 200]);
  assert.strictEqual(w.hearts, 3, 'heal on the first loop');
  run(w, 2.3, H); ev = w.drainEvents();
  const z = ev.find(e => e.type === 'zone'); assert.ok(z); deq([z.zone, z.level, w.level, w.zone, w.box, w.boxTarget], [1, 1, 1, 1, 0, C.boxTargets[1]]);
  assert.ok(types(ev).indexOf('zone') < types(ev).indexOf('go'), 'ready → go');
  assert.strictEqual(w.vents.length, C.vents[1]);
});

test('zones: cycle dawn → noon → sunset → night → dawn (lap 2), harder each loop, capped', () => {
  const w = new MP.World({ seed: 1 });
  const zs = [];
  for (let i = 0; i < 9; i++) { w.startLevel(i); zs.push([w.zone, w.lap]); }
  deq(zs, [[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [0, 2]]);
  const L = i => w.levelInfo(i);
  near(L(0).rise, 65, 1e-9); near(L(3).rise, 95, 1e-9); near(L(4).rise, 65 * 1.06, 1e-9); near(L(40).rise, 65 * C.riseCap, 1e-9);
  assert.ok(L(0).spawnGap > L(3).spawnGap && L(4).spawnGap < L(0).spawnGap && L(80).spawnGap >= C.gapMin);
  assert.ok(L(1).pebbleGap > L(2).pebbleGap && L(5).pebbleGap < L(1).pebbleGap && L(80).pebbleGap >= C.pebbleGap[1] / C.pebbleCap - 1e-9);
  deq([L(0).pebbleDelay, L(1).pebbleDelay, L(4).pebbleDelay], [20, 4, 4]);
  deq([0, 1, 2, 3].map(i => L(i).vents), C.vents);
  // vents: inside the play range, ≥ 120 px apart
  for (let i = 0; i < 40; i++) {
    w.startLevel(i); const xs = w.vents.map(v => v.x);
    assert.ok(xs.every(x => x >= C.xMin + C.ventMargin - 1e-9 && x <= C.xMax - C.ventMargin + 1e-9));
    for (let k = 1; k < xs.length; k++) assert.ok(xs[k] - xs[k - 1] >= C.ventGap - 1e-9);
  }
});

test('setPlayRange: re-places vents inside it, clamps Bristle, bubbles and pebbles', () => {
  const w = world(13, {}, 3); hold(w, 880);
  w._nextSpawn = 0; w.update(H); w._nextSpawn = 1e9;
  const b = bubbleAt(w, 850, 300, 'cupcake', 0, -60), p = pebbleAt(w, 860, 100, 100);
  w.setPlayRange(250, 710);
  const c = w.cfg;
  deq([c.xMin, c.xMax, w.hog.x], [250, 710, 710]);
  assert.ok(w.vents.length >= 3 && w.vents.every(v => v.x >= 250 + c.ventMargin - 1e-9 && v.x <= 710 - c.ventMargin + 1e-9), JSON.stringify(w.vents));
  for (let k = 1; k < w.vents.length; k++) assert.ok(w.vents[k].x - w.vents[k - 1].x >= 89.9);
  const puff = w.items.find(i => i.state === 'puff'); assert.strictEqual(puff.x, w.vents[puff.vent].x, 'puff follows its vent');
  assert.ok(b.x <= 710 + c.wallPad && p._bx <= 700 && p.lx <= 712);
  w.setPlayRange(-100, 2000); deq([c.xMin, c.xMax], [20, 940]);
  w.setPlayRange(470, 490); deq([c.xMin, c.xMax], [360, 600]);   // never narrower than 240 px
  assert.ok(w.vents.length >= 2);
  // spawning only uses the new vents
  const w2 = world(14); w2.setPlayRange(300, 660); let bad = 0;
  run(w2, 30, 1 / 60, () => { for (const e of w2.drainEvents()) if (e.type === 'puff' && (e.x < 300 || e.x > 660)) bad++; });
  assert.strictEqual(bad, 0);
});

// ---------- level 1 for a small kid ----------
test('dawn (Normal) is winnable by just skating to the vents with a 0.5 s reaction (no jumps)', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const w = new MP.World({ seed, config: MP.DIFFICULTY.normal });
    const q = []; let t = 0, cleared = null;
    while (t < 150 && cleared === null && w.state !== 'dead') {
      // decide now, act 0.5 s later: go to the lowest visible bubble / puffing vent nearest to him
      let best = null;
      for (const it of w.items) if (it.kind !== 'pebble' && (it.state === 'puff' || (it.state === 'rise' && it.y > 400))) {
        const d = Math.abs(it.x - w.hog.x); if (!best || d < best.d) best = { x: it.x, d };
      }
      q.push({ at: t + 0.5, x: best ? best.x : null });
      while (q.length && q[0].at <= t) { const d = q.shift(); if (d.x !== null) w.setTarget(d.x); }
      w.update(1 / 60); t += 1 / 60;
      for (const e of w.drainEvents()) if (e.type === 'cleared') cleared = t;
    }
    assert.ok(cleared !== null && cleared < 110, 'seed ' + seed + ' cleared ' + cleared + ' hearts ' + w.hearts);
  }
});

// ---------- weather ----------
test('weather: every zone, bounded particles (< 180) under stress, droplets inherit bubble velocity, deterministic', () => {
  const wx = new MP.Weather({ seed: 3 });
  const w = new MP.World({ seed: 2 }); w.magnet.t = 5;
  for (const z of [0, 1, 2, 3]) {
    wx.setZone(z);
    let max = 0;
    for (let i = 0; i < 600; i++) {
      w.hog.vx = 380; w.hog.air = false;
      if (i % 5 === 0) for (const k of ['pop', 'sparkle', 'dust', 'star', 'spark', 'confetti', 'crumb', 'twinkle']) wx.burst(k, 480, 300, 12);
      wx.wheels(480, 490, 380);
      wx.update(1 / 60, { hog: w.hog, world: w });
      max = Math.max(max, wx.particles.length);
    }
    assert.ok(max < 180, 'zone ' + z + ' max ' + max);
    for (const p of wx.particles) {
      for (const k of ['sprite', 'x', 'y', 'size', 'rot', 'flipX', 'alpha', 'layer']) assert.ok(k in p, k);
      assert.ok(p.layer === 'back' || p.layer === 'front');
      assert.ok(MP.Weather.SPRITES.includes(p.sprite), p.sprite);
      assert.ok(p.alpha >= 0 && p.alpha <= 1 && isFinite(p.x) && isFinite(p.y));
    }
  }
  // steady state of each zone (no fx) and the night glow
  for (const z of [0, 1, 2, 3]) {
    const q = new MP.Weather({ seed: 1, zone: z }); for (let i = 0; i < 600; i++) q.update(1 / 60);
    const st = q.stats(); assert.ok(st.total >= q.fullCount(z) - 2 && st.total <= q.fullCount(z) + 3, 'zone ' + z + ' ' + st.total);
  }
  const night = new MP.Weather({ zone: 3 }); night.update(0.1); assert.ok(night.ambient.glow > 0.9);
  const noon = new MP.Weather({ zone: 1 }); noon.update(0.1); assert.ok(noon.ambient.glow < 0.05 && 'tint' in noon.ambient);
  // shooting stars at night
  const ns = new MP.Weather({ zone: 3, seed: 4 }); let shoot = 0;
  for (let i = 0; i < 60 * 20; i++) { ns.update(1 / 60); shoot = Math.max(shoot, ns.particles.filter(p => p.sprite === 'shoot').length); }
  assert.ok(shoot >= 1);
  // droplets: inherit the bubble's velocity (via opts or looked up from the world)
  const d1 = new MP.Weather({ seed: 5 }); d1.particles.length = 0; d1._nFx = 0;
  d1.burst('pop', 400, 300, 12, { vx: 250, vy: -60 });
  const drops = d1.particles.filter(p => p.sprite === 'droplet');
  assert.strictEqual(drops.length, 12);
  const mvx = drops.reduce((a, p) => a + p.vx, 0) / drops.length; near(mvx, 200, 40, 'inherits vx');
  const ww = world(15); quiet(ww); hold(ww, 480); const bb = bubbleAt(ww, 480, 430, 'cupcake', -150, -60); ww.update(H);
  const d2 = new MP.Weather({ seed: 5 }); d2.update(1 / 60, { world: ww }); d2.particles.length = 0; d2._nFx = 0;
  d2.burst('pop', bb.x, bb.y, 10);
  const m2 = d2.particles.reduce((a, p) => a + p.vx, 0) / d2.particles.length; assert.ok(m2 < -60, 'looked up ' + m2);
  // droplets arc down with Moon gravity and fade in ~0.6 s
  run({ update: dt => d1.update(dt) }, 0.3, 1 / 60);
  assert.ok(d1.particles.some(p => p.sprite === 'droplet' && p.vy > 0));
  run({ update: dt => d1.update(dt) }, 0.6, 1 / 60);
  assert.ok(!d1.particles.some(p => p.sprite === 'droplet'));
  // auto wheel dust only when skating fast on the floor; deterministic
  const mk = () => { const q = new MP.Weather({ seed: 8 }); const hog = { x: 400, y: 446, vx: 380, vy: 0, air: false, board: { x: 400 } };
    for (let i = 0; i < 120; i++) q.update(1 / 60, { hog }); return q; };
  const a = mk(), b = mk();
  assert.ok(a.particles.some(p => p.sprite === 'dust'));
  deq(a.particles.map(p => [p.sprite, +p.x.toFixed(3), +p.y.toFixed(3)]), b.particles.map(p => [p.sprite, +p.x.toFixed(3), +p.y.toFixed(3)]));
  const slow = new MP.Weather({ seed: 8 }); slow.particles = slow.particles.filter(p => p.zone >= 0);
  for (let i = 0; i < 120; i++) slow.update(1 / 60, { hog: { x: 400, y: 446, vx: 100, air: false } });
  assert.ok(!slow.particles.some(p => p.zone < 0));
  // zone hand-over: old particles fade out
  const ho = new MP.Weather({ seed: 2, zone: 3 }); ho.setZone(1);
  for (let i = 0; i < 180; i++) ho.update(1 / 60);
  assert.ok(!ho.particles.some(p => p.zone === 3));
});

// ---------- bot ----------
test('bot: skill 1 clears the first loop on Normal; skill 0.8 clears dawn; uses jumps, chains, magnets', () => {
  let loops = 0, jumps = 0, chains = 0, mags = 0;
  for (const seed of [1, 2, 3]) {
    const r = playGame(seed, 'normal', 1, 400, 4);
    if (r.w.level >= 4) loops++;
    jumps += r.bot.stats.jumps; chains += r.bot.stats.chains; mags += r.bot.stats.magnets;
    assert.ok(r.bot.stats.bonks <= 2, 'skill 1 bonks ' + r.bot.stats.bonks);
  }
  assert.strictEqual(loops, 3, 'first loop cleared');
  assert.ok(jumps > 30 && chains > 3 && mags >= 3, `jumps ${jumps} chains ${chains} magnets ${mags}`);
  for (const seed of [4, 5, 6]) {
    const r = playGame(seed, 'normal', 0.8, 150, 1);
    assert.ok(r.w.level >= 1, 'skill 0.8 clears dawn');
  }
  const r = playGame(7, 'easy', 0.3, 200, 1); assert.ok(r.w.level >= 1, 'skill 0.3 clears dawn on Easy');
});

test('events: a long bot run emits every DESIGN §5.1 event type', () => {
  const seen = {};
  for (const seed of [21, 22]) {
    const r = playGame(seed, 'hard', 0.6, 900);
    Object.assign(seen, r.seen);
  }
  for (const t of ['start', 'zone', 'puff', 'emerge', 'pop', 'multup', 'chain', 'escape', 'magnet', 'magnetend', 'pebblewarn', 'bonk', 'pebbleland', 'jump', 'land', 'boxfull', 'cleared', 'dead']) {
    assert.ok(seen[t] > 0, 'event ' + t);
  }
});

test('speed: 10 simulated minutes (world + bot + weather) in about 2 s', () => {
  const t0 = Date.now();
  const w = new MP.World({ seed: 31 }), bot = new MP.Bot(w, { skill: 0.8, seed: 2 }), wx = new MP.Weather({ seed: 1 });
  for (let i = 0; i < 600 * 60; i++) {
    bot.step(1 / 60); w.update(1 / 60);
    for (const e of w.drainEvents()) { if (e.type === 'pop') wx.burst('pop', e.x, e.y, 10, e); if (e.type === 'zone') wx.setZone(e.zone); }
    wx.update(1 / 60, { world: w });
    if (w.state === 'dead') w.reset();
  }
  const ms = Date.now() - t0;
  console.log('      (10 min in ' + ms + ' ms)');
  assert.ok(ms < 4000, ms + ' ms');
});

// ---------- run ----------
const filter = process.argv[2];
let pass = 0, fail = 0;
for (const t of tests) {
  if (filter && !t.name.includes(filter)) continue;
  try { t.fn(); pass++; console.log('ok   ' + t.name); }
  catch (e) { fail++; console.log('FAIL ' + t.name + '\n     ' + (e && e.stack || e).toString().split('\n').slice(0, 3).join('\n     ')); }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
