#!/usr/bin/env node
// Puff's Volcano Catch — headless unit tests for rng / world / weather / bot.
// Run from projects/daily-game/puff-volcano-catch:   node tests/unit/run.js
'use strict';
const assert = require('assert');
const { load } = require('./load');

const VC = load();
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const H = 1 / 120;
const J = v => JSON.parse(JSON.stringify(v));
const deq = (a, b, m) => assert.deepStrictEqual(J(a), J(b), (m ? m + ": " : "") + JSON.stringify(a) + " vs " + JSON.stringify(b));
const near = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, (m || '') + ' got ' + a + ' want ' + b + ' ±' + tol);

// ---------- helpers ----------
function world(seed, cfg, level) {
  const w = new VC.World({ seed: seed || 1, config: Object.assign({ introDelay: 0 }, cfg) });
  if (level) w.startLevel(level);
  w.update(H * 2);
  assert.strictEqual(w.state, 'playing');
  w.drainEvents();
  return w;
}
function quiet(w) { w._nextLaunch = 1e9; w._rumbling = false; w.items.length = 0; }   // no eruptions
function run(w, seconds, dt, each) {
  dt = dt || 1 / 60;
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) { if (each && each(i) === false) return; w.update(dt); }
}
// put an item on a solved arc (as _launch does) — returns it
function addItem(w, kind, tx, Hap, metal) {
  const s = w.solveArc(tx, Hap || 160), c = w.cfg;
  const it = { id: w._nextId++, kind, metal: kind === 'coin' ? (metal || 'copper') : null, value: kind === 'coin' ? c.coinValue[metal || 'copper'] : 0,
    x: c.crater.x, y: c.crater.y, vx: s.vx, vy: s.vy, _px: c.crater.x, _py: c.crater.y, rot: 0, spin: 0,
    r: kind === 'coin' ? c.coinR[metal || 'copper'] : c.rockR, state: 'fly', t: 0, alpha: 1, tx, tCross: w.time + s.T, _w: 3, _bounces: 0, _off: 0 };
  w.items.push(it);
  return it;
}
// item placed just above the rim line, falling straight down at x
function dropAt(w, kind, x, vy) {
  const c = w.cfg;
  const it = { id: w._nextId++, kind, metal: kind === 'coin' ? 'copper' : null, value: kind === 'coin' ? 1 : 0, x, y: c.rimY - 1.5, vx: 0, vy: vy === undefined ? 300 : vy,
    _px: x, _py: c.rimY - 1.5, rot: 0, spin: 0, r: kind === 'coin' ? 14 : 17, state: 'fly', t: 0, alpha: 1, tx: x, tCross: 0, _w: 0, _bounces: 0, _off: 0 };
  w.items.push(it);
  return it;
}
function hold(w, x) { w.puff.x = w.puff._px = w.puff.rimX = x; w.puff.vx = 0; w.puff.swing = w.puff.swingV = 0; w.setTarget(x); }
function playGame(seed, diff, skill, maxS, stopLevel) {
  const w = new VC.World({ seed, config: VC.DIFFICULTY[diff || 'normal'] });
  const bot = new VC.Bot(w, { skill, seed: seed * 3 + 1 });
  let t = 0; maxS = maxS || 1200;
  while (w.state !== 'dead' && t < maxS && !(stopLevel !== undefined && w.level >= stopLevel)) {
    bot.step(1 / 60); w.update(1 / 60); w.drainEvents(); t += 1 / 60;
  }
  return { w, t, bot };
}

// ---------- RNG ----------
test('rng: deterministic, in range, same API as the sister games', () => {
  const a = new VC.RNG(42), b = new VC.RNG(42), c = new VC.RNG(43);
  const sa = [], sb = [], sc = [];
  for (let i = 0; i < 500; i++) { sa.push(a.next()); sb.push(b.next()); sc.push(c.next()); }
  deq(sa, sb); assert.notDeepStrictEqual(sa, sc);
  assert.ok(sa.every(v => v >= 0 && v < 1));
  for (const k of ['range', 'int', 'pick', 'chance', 'sign', 'gauss', 'fork']) assert.strictEqual(typeof a[k], 'function', k);
  for (let i = 0; i < 200; i++) { const v = a.int(2, 4); assert.ok(v >= 2 && v <= 4 && v === Math.floor(v)); }
});

// ---------- contract ----------
test('world: initial state and DESIGN §5.1 contract fields', () => {
  const w = new VC.World({ seed: 5 });
  assert.strictEqual(w.state, 'ready');
  for (const k of ['level', 'zone', 'lap', 'time', 'levelTime', 'score', 'hearts', 'heartsMax', 'combo', 'mult', 'bestCombo', 'pouch', 'pouchTarget',
    'coinsTotal', 'rocksCaught', 'steamed', 'missed', 'rain', 'volcano', 'puff', 'items', 'cfg', '_acc']) assert.ok(k in w, k);
  deq([w.level, w.zone, w.lap, w.score, w.hearts, w.heartsMax, w.combo, w.mult, w.pouch, w.pouchTarget], [0, 0, 0, 0, 3, 3, 0, 1, 0, 20]);
  for (const k of ['charge', 'active', 'x', 'w']) assert.ok(k in w.rain, 'rain.' + k);
  for (const k of ['rumble', 'glow', 'shake']) assert.ok(k in w.volcano, 'volcano.' + k);
  for (const k of ['x', 'y', 'vx', 'tilt', 'bob', 'swing', 'rimX', 'rimY', 'frame', 'invuln', 'squash', '_px', '_py']) assert.ok(k in w.puff, 'puff.' + k);
  deq([w.puff.y, w.puff.rimY, w.rain.charge, w.rain.w], [392, 446, 1, 130]);
  deq(w.drainEvents().map(e => e.type), ['start', 'zone']);
  assert.strictEqual(w.cfg.step, 1 / 120);
  assert.ok(VC.DIFFICULTY.easy && VC.DIFFICULTY.normal && VC.DIFFICULTY.hard && VC.CONFIG.gravity === 520);
  const e = new VC.World({ config: VC.DIFFICULTY.easy });
  deq([e.hearts, e.pouchTarget, e.cfg.rainRecharge], [5, 16, 5]);
  // items carry every contract field
  const w2 = world(3); run(w2, 4);
  assert.ok(w2.items.length > 0);
  for (const it of w2.items) for (const k of ['id', 'kind', 'metal', 'value', 'x', 'y', 'vx', 'vy', 'rot', 'spin', 'r', 'state', 't', 'alpha', '_px', '_py']) assert.ok(k in it, 'item.' + k);
});

test('world: ~1.4 s intro without eruptions, then go; each burst is telegraphed 0.5–0.7 s by a rumble', () => {
  const w = new VC.World({ seed: 3 });
  w.drainEvents();
  run(w, 1.35);
  assert.strictEqual(w.state, 'ready'); assert.strictEqual(w.items.length, 0);
  run(w, 0.1);
  assert.strictEqual(w.state, 'playing');
  assert.ok(w.drainEvents().some(e => e.type === 'go'));
  let rumbleAt = -1, maxRumble = 0, bursts = 0;
  run(w, 60, H, () => {
    for (const e of w.drainEvents()) {
      if (e.type === 'rumble') { assert.strictEqual(rumbleAt, -1, 'one rumble per burst'); rumbleAt = w.time; assert.ok(e.n >= 1 && e.n <= 3); }
      if (e.type === 'erupt') {
        assert.ok(rumbleAt >= 0, 'erupt without rumble');
        const lead = w.time - rumbleAt;
        assert.ok(lead >= 0.49 && lead <= 0.72, 'telegraph ' + lead);
        assert.ok(maxRumble > 0.9, 'rumble builds to ~1');
        rumbleAt = -1; maxRumble = 0; bursts++;
      }
    }
    if (rumbleAt >= 0) maxRumble = Math.max(maxRumble, w.volcano.rumble);
  });
  assert.ok(bursts >= 15, 'bursts ' + bursts);
});

test('world: deterministic for any dt partition', () => {
  function script(dt) {
    const w = new VC.World({ seed: 77 });
    const R = new VC.RNG(9), plan = [];
    for (let k = 0; k < 80; k++) plan.push({ mx: R.range(-1, 1), act: R.chance(0.3), tgt: R.chance(0.4) ? R.range(60, 900) : null });
    let k = -1;
    const total = Math.round(60 / dt);
    for (let i = 0; i < total; i++) {
      const seg = Math.floor(w.steps / 60);
      if (seg !== k && w.steps % 60 === 0) {
        k = seg; const p = plan[seg % plan.length];
        if (p.tgt !== null) { w.setMove(0); w.setTarget(p.tgt); } else { w.setTarget(null); w.setMove(p.mx); }
        if (p.act) w.action();
      }
      w.update(dt);
    }
    return { snap: w.snapshot(), puff: [w.puff.x, w.puff.vx, w.puff.swing, w.puff.tilt], items: w.items.map(i => [i.id, i.x, i.y, i.state]), steps: w.steps };
  }
  const a = script(1 / 60), b = script(1 / 120), c = script(1 / 30), d = script(1 / 40);
  deq(a, b); deq(a, c); deq(a, d);
  assert.ok(a.steps === 7200);
});

// ---------- physics ----------
test('arcs: every launched item crosses the catch line at its solved x (±1 px); level 1 flights 1.6–2.4 s', () => {
  const w = world(11); hold(w, 480);
  const seen = new Map(); let n = 0;
  const flights = [];
  run(w, 90, H, () => {
    for (const it of w.items) {
      if (!seen.has(it.id)) { seen.set(it.id, { tx: it.tx, t0: w.time, T: it.tCross - w.time, done: false }); flights.push(it.tCross - w.time); }
      const s = seen.get(it.id);
      if (!s.done && it.state === 'fly' && it._py < w.cfg.rimY && it.y >= w.cfg.rimY) {
        const f = (w.cfg.rimY - it._py) / (it.y - it._py), cx = it._px + (it.x - it._px) * f;
        near(cx, s.tx, 1, 'crossing x'); s.done = true; n++;
      }
    }
    w.setTarget(20);   // stay away: let everything fly to the line
    hold(w, 70);
  });
  assert.ok(n >= 20, 'crossings checked ' + n);
  const T = flights.map(t => t + H);   // first seen one step after launch
  assert.ok(Math.min(...T) >= 1.6 && Math.max(...T) <= 2.45, 'flight ' + Math.min(...T).toFixed(2) + '..' + Math.max(...T).toFixed(2));
  // the solver itself
  const s = w.solveArc(800, 180);
  near(w.cfg.crater.x + s.vx * s.T, 800, 1e-9);
  const y = w.cfg.crater.y + s.vy * s.T + 0.5 * w.gEff * s.T * s.T;
  near(y, w.cfg.rimY, 1e-6);
  near(s.vy + w.gEff * s.ta, 0, 1e-9, 'apex at ta');
});

test('items: coins spin, rocks tumble; a coin bounces once (restitution) then fades; a rock thuds and fizzles', () => {
  const w = world(2); quiet(w); hold(w, 70);
  const coin = addItem(w, 'coin', 700, 160), rock = addItem(w, 'rock', 300, 160);
  const s0 = coin.spin, r0 = rock.rot;
  let vImpact = 0, apexAfter = 1e9, missEv = 0, rockEv = 0, coinGone = -1, rockGone = -1;
  run(w, 5, H, (i) => {
    hold(w, 70);
    if (coin.state === 'fly') vImpact = coin.vy;
    if (coin.state === 'ground' && coin._rest === undefined) apexAfter = Math.min(apexAfter, coin.y);
    for (const e of w.drainEvents()) { if (e.type === 'miss') missEv++; if (e.type === 'rockland') rockEv++; }
    if (coinGone < 0 && !w.items.includes(coin)) coinGone = w.time;
    if (rockGone < 0 && !w.items.includes(rock)) rockGone = w.time;
  });
  assert.ok(coin.spin !== s0 && rock.rot !== r0);
  assert.strictEqual(missEv, 1); assert.strictEqual(rockEv, 1);
  const gy = w.cfg.groundY - coin.r * 0.6, hBounce = gy - apexAfter, expect = Math.pow(vImpact * 0.35, 2) / (2 * w.gEff);
  near(hBounce, expect, 3, 'bounce height');
  assert.ok(coinGone > 0 && rockGone > 0, 'both removed after fading');
});

test('puff: keys accelerate smoothly to max speed; brakes; clamps to 70..890', () => {
  const w = world(1); quiet(w); w.setMove(1);
  run(w, 0.1, H);
  assert.ok(w.puff.vx > 150 && w.puff.vx < 400, 'ramping ' + w.puff.vx);
  run(w, 0.2, H); near(w.puff.vx, 400, 1e-6);
  w.setMove(0); const x0 = w.puff.x; run(w, 0.5, H);
  assert.strictEqual(w.puff.vx, 0); assert.ok(w.puff.x - x0 < 40, 'drift ' + (w.puff.x - x0));
  w.setMove(1); run(w, 3, H); assert.strictEqual(w.puff.x, 890);
  w.setMove(-1); run(w, 4, H); assert.strictEqual(w.puff.x, 70);
});

test('puff: pointer-follow spring reaches the target, stops within 3 px, overshoots < 3 px', () => {
  const w = world(1); quiet(w);
  for (const [from, to] of [[100, 860], [860, 120], [480, 520], [300, 310]]) {
    w.puff.x = from; w.puff.vx = 0; w.setMove(0); w.setTarget(to);
    let over = 0, vmax = 0; const dir = Math.sign(to - from);
    run(w, 3, H, () => { over = Math.max(over, (w.puff.x - to) * dir); vmax = Math.max(vmax, Math.abs(w.puff.vx)); });
    assert.ok(Math.abs(w.puff.x - to) <= 3, 'arrive ' + w.puff.x + ' → ' + to);
    assert.ok(over < 3, 'overshoot ' + over);
    assert.ok(vmax <= 400 + 1e-9);
    assert.ok(Math.abs(w.puff.vx) < 1);
  }
});

test('puff: tilt leans into motion (+vx → +tilt, ≤ 0.28 rad, eased); basket pendulum lags, swings and settles', () => {
  const w = world(1); quiet(w); w.puff.x = 100;
  w.setMove(1);
  let minSwing = 0, tilt1 = 0;
  run(w, 0.03, H); tilt1 = w.puff.tilt;
  run(w, 0.6, H, () => { minSwing = Math.min(minSwing, w.puff.swing); });
  assert.ok(tilt1 > 0 && tilt1 < 0.2, 'eased tilt ' + tilt1);
  assert.ok(w.puff.tilt > 0.25 && w.puff.tilt <= 0.28 + 1e-9, 'tilt ' + w.puff.tilt);
  assert.ok(minSwing < -0.15, 'basket lags behind when starting right: ' + minSwing);
  w.setMove(0);
  let maxSwing = 0, signChanges = 0, last = 0;
  run(w, 3, H, () => {
    const s = w.puff.swing; maxSwing = Math.max(maxSwing, s);
    if (Math.abs(s) > 0.01 && Math.sign(s) !== Math.sign(last) && last !== 0) signChanges++;
    if (Math.abs(s) > 0.01) last = s;
    assert.ok(Math.abs(s) <= 0.35 + 1e-9);
    near(w.puff.rimX, w.puff.x + Math.sin(s) * 50, 1e-9);
  });
  assert.ok(maxSwing > 0.1, 'swings forward on the stop ' + maxSwing);
  assert.ok(signChanges >= 1, 'oscillates');
  assert.ok(Math.abs(w.puff.swing) < 0.01 && Math.abs(w.puff.tilt) < 0.01, 'settles');
});

// ---------- rules ----------
test('catch: inside the zone caught, outside missed, moving-up items never caught', () => {
  const w = world(4); quiet(w); hold(w, 400);
  const c = w.cfg, lim = c.catchHalfW + 14 * c.catchRFrac;
  const a = dropAt(w, 'coin', 400 + lim - 1), b = dropAt(w, 'coin', 400 - lim + 1), o = dropAt(w, 'coin', 400 + lim + 2);
  const up = dropAt(w, 'coin', 400, -300); up.y = c.rimY + 4; up._py = up.y;
  w.update(H);
  assert.strictEqual(a.state, 'caught'); assert.strictEqual(b.state, 'caught');
  assert.strictEqual(o.state, 'fly'); assert.strictEqual(up.state, 'fly');
  for (let i = 0; i < 20; i++) { hold(w, 400); w.update(H); }
  assert.strictEqual(up.state, 'fly', 'still rising, not caught');
  const ev = w.drainEvents();
  const catches = ev.filter(e => e.type === 'catch');
  assert.strictEqual(catches.length, 2);
  deq([catches[0].points, catches[0].combo, catches[0].mult, catches[0].metal], [10, 1, 1, 'copper']);
  deq([w.combo, w.coinsTotal, w.pouch, w.missed], [0, 2, 2, 1], 'the outside coin landed → combo reset');
  assert.ok(ev.some(e => e.type === 'miss' && e.combo === 2));
  // caught coins sink into the basket over 0.25 s and are removed
  run(w, 0.3, H, () => hold(w, 400));
  assert.ok(!w.items.includes(a) && !w.items.includes(b));
  assert.strictEqual(w.puff.frame === 'happy' || w.puff.frame === 'idle', true);
});

test('combo: thresholds [0,5,12,22,35] → ×1..×5 with multup events; a miss resets combo and mult', () => {
  const w = world(4, { pouchTargets: [999, 999, 999, 999] }); quiet(w); hold(w, 480);
  const mults = [], ups = [];
  for (let k = 1; k <= 36; k++) {
    dropAt(w, 'coin', 480); w.update(H);
    for (const e of w.drainEvents()) { if (e.type === 'catch') mults.push(e.mult); if (e.type === 'multup') ups.push([k, e.mult]); }
  }
  deq(ups, [[5, 2], [12, 3], [22, 4], [35, 5]]);
  assert.strictEqual(mults[3], 1); assert.strictEqual(mults[4], 2); assert.strictEqual(mults[35], 5);
  assert.strictEqual(w.bestCombo, 36);
  const s0 = w.score; dropAt(w, 'coin', 480); w.update(H); assert.strictEqual(w.score - s0, 10 * 5);
  dropAt(w, 'coin', 800, 300); w.items[w.items.length - 1].y = w.cfg.groundY - 20;
  run(w, 0.2, H, () => hold(w, 480));
  const ev = w.drainEvents();
  assert.ok(ev.some(e => e.type === 'miss' && e.combo === 37));
  deq([w.combo, w.mult, w.bestCombo, w.missed], [0, 1, 37, 1]);
});

test('rock: costs a heart + combo + 1.2 s invuln (ouch); a rock during invuln fizzles; 0 hearts → dead', () => {
  const w = world(6); quiet(w); hold(w, 480);
  for (let k = 0; k < 6; k++) { dropAt(w, 'coin', 480); w.update(H); }
  assert.strictEqual(w.mult, 2);
  dropAt(w, 'rock', 480); w.update(H);
  let ev = w.drainEvents();
  assert.ok(ev.some(e => e.type === 'ouch' && e.hearts === 2));
  deq([w.hearts, w.combo, w.mult, w.rocksCaught], [2, 0, 1, 1]);
  near(w.puff.invuln, 1.2, H * 1.5); assert.strictEqual(w.puff.frame, 'ouch');
  dropAt(w, 'rock', 480); w.update(H);
  ev = w.drainEvents();
  assert.ok(!ev.some(e => e.type === 'ouch') && ev.some(e => e.type === 'steam' && e.points === 0), 'fizzled');
  assert.strictEqual(w.hearts, 2);
  run(w, 1.3, H, () => hold(w, 480));
  dropAt(w, 'rock', 480); w.update(H); run(w, 1.3, H, () => hold(w, 480));
  dropAt(w, 'rock', 480); w.update(H);
  ev = w.drainEvents();
  assert.strictEqual(w.hearts, 0); assert.strictEqual(w.state, 'dead');
  assert.ok(ev.some(e => e.type === 'dead' && e.score === w.score));
  dropAt(w, 'coin', 480); w.update(H); assert.strictEqual(w.coinsTotal, 6, 'no catching when dead');
});

test('Cool Rain: steams rocks in the column above Puff only (+5), follows Puff, recharges in rainRecharge s', () => {
  const w = world(7); quiet(w); hold(w, 400);
  const c = w.cfg;
  const inCol = dropAt(w, 'rock', 440); inCol.y = inCol._py = 250; inCol.vy = 0;
  const outCol = dropAt(w, 'rock', 400 + 65 + 17); outCol.y = outCol._py = 250; outCol.vy = 0;
  const below = dropAt(w, 'rock', 400); below.y = below._py = 420; below.vy = -50;
  const coin = dropAt(w, 'coin', 400); coin.y = coin._py = 250; coin.vy = 0;
  assert.strictEqual(w.action(), true);
  assert.strictEqual(w.action(), false, 'not while raining');
  w.update(H);
  deq([inCol.state, outCol.state, below.state, coin.state], ['steam', 'fly', 'fly', 'fly']);
  assert.strictEqual(w.steamed, 1); assert.strictEqual(w.score, 5);
  const ev = w.drainEvents();
  assert.ok(ev.some(e => e.type === 'rain' && e.x === 400) && ev.some(e => e.type === 'steam' && e.points === 5));
  assert.strictEqual(w.puff.frame, 'blow');
  // column follows Puff
  w.items.length = 0; w.setTarget(700); run(w, 0.5, H);
  near(w.rain.x, w.puff.x, 1e-9);
  while (w.rain.active > 0) w.update(H);
  assert.strictEqual(w.rain.charge, 0);
  let chargedAt = -1; const t0 = w.time;
  run(w, c.rainRecharge + 0.5, H, () => { for (const e of w.drainEvents()) if (e.type === 'raincharged') chargedAt = w.time; });
  near(chargedAt - t0, c.rainRecharge, 0.02, 'recharge time');
  assert.strictEqual(w.rain.charge, 1);
});

test('pouch full → pouchfull, rocks auto-steam, cleared (+hearts×100), next zone after ~2.2 s, score/hearts/combo kept', () => {
  const w = world(8); quiet(w); hold(w, 480);
  w.pouch = w.pouchTarget - 1;
  const rock = addItem(w, 'rock', 200, 160); rock.y = 300;
  dropAt(w, 'coin', 480); w.update(H);
  const ev = w.drainEvents().map(e => e.type);
  for (const k of ['catch', 'pouchfull', 'steam', 'cleared']) assert.ok(ev.includes(k), k);
  assert.ok(ev.indexOf('pouchfull') < ev.indexOf('cleared'));
  assert.strictEqual(w.state, 'cleared'); assert.strictEqual(rock.state, 'steam');
  assert.strictEqual(w.score, 10 + 5 + 3 * 100);
  const combo = w.combo, score = w.score;
  let zoneEv = null;
  run(w, 2.1, H, () => { for (const e of w.drainEvents()) if (e.type === 'zone') zoneEv = e; assert.ok(!w.items.some(i => i.state === 'fly' && i.kind === 'rock')); });
  assert.strictEqual(zoneEv, null, 'still celebrating at 2.1 s');
  run(w, 0.2, H, () => { for (const e of w.drainEvents()) if (e.type === 'zone') zoneEv = e; });
  deq(zoneEv, { type: 'zone', zone: 1, level: 1, lap: 0 });
  deq([w.level, w.zone, w.state, w.pouch, w.pouchTarget, w.combo, w.score, w.items.length], [1, 1, 'playing', 0, 25, combo, score, 0]);   // introDelay 0 in this test world
});

test('levels: zone = i % 4, lap ramp (+8 % speed, more rocks, shorter interval, capped), pouch 20/25/30/35', () => {
  const w = new VC.World({ seed: 1 });
  deq([0, 1, 2, 3].map(i => w.levelInfo(i).pouchTarget), [20, 25, 30, 35]);
  const a = w.levelInfo(0), b = w.levelInfo(4), z = w.levelInfo(40);
  deq([b.zone, b.lap], [0, 1]);
  near(b.speed / a.speed, 1.08, 1e-9);
  assert.ok(b.rockChance > a.rockChance && b.interval < a.interval);
  assert.strictEqual(a.rockDelay, 20); assert.strictEqual(b.rockDelay, 0);
  assert.ok(z.speed <= w.cfg.speedCap && z.rockChance <= w.cfg.rockCap && z.interval >= w.cfg.intervalMin);
  w.startLevel(5);
  deq([w.level, w.zone, w.lap], [5, 1, 1]);
  near(w.gEff, 520 * Math.pow(1.06 * 1.08, 2), 1e-6);
  const e = new VC.World({ config: VC.DIFFICULTY.easy });
  deq([0, 1, 2, 3].map(i => e.levelInfo(i).pouchTarget), [16, 20, 24, 28]);
  assert.ok(e.levelInfo(0).speed < a.speed);
});

test('fairness: no rocks in the first 20 s of the beach; coins chainable at fairSpeed; rocks keep clear of coins', () => {
  let coins = 0, unfair = 0, rocksEarly = 0, conflicts = 0, multi = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const w = world(seed, { pouchTargets: [999, 999, 999, 999] });
    for (const lv of [0, 1, 2, 3]) {
      w.startLevel(lv); w.update(1.5); w.drainEvents();
      const placed = [];
      run(w, 60, 1 / 60, () => {
        hold(w, 70);
        for (const it of w.items) if (it.t === 0 || (it.state === 'fly' && !placed.some(p => p.id === it.id))) {
          if (placed.some(p => p.id === it.id)) continue;
          placed.push({ id: it.id, kind: it.kind, x: it.tx, t: it.tCross, born: w.levelTime });
          if (it.kind === 'rock' && lv === 0 && w.levelTime < 20) rocksEarly++;
        }
        for (const e of w.drainEvents()) if (e.type === 'erupt' && e.n > 1) multi++;
      });
      const cs = placed.filter(p => p.kind === 'coin').sort((a, b) => a.t - b.t), rs = placed.filter(p => p.kind === 'rock');
      coins += cs.length;
      for (let i = 1; i < cs.length; i++) if (Math.abs(cs[i].x - cs[i - 1].x) > w.cfg.fairSlack + w.cfg.fairSpeed * (cs[i].t - cs[i - 1].t) + 1e-6) unfair++;
      for (const r of rs) for (const c of cs) if (Math.abs(r.t - c.t) < w.cfg.rockCoinDt && Math.abs(r.x - c.x) < w.cfg.rockCoinDx - 1e-6) conflicts++;
    }
  }
  assert.strictEqual(rocksEarly, 0);
  assert.ok(multi > 50, 'multi-item bursts happen');
  assert.ok(unfair / coins < 0.01, 'unfair coin pairs ' + unfair + '/' + coins);
  assert.ok(conflicts <= 2, 'rock-coin conflicts ' + conflicts);
});

test('bot: skill 1 clears level 1 (Normal) nearly always; skill 0.4 usually; plays only through the input API', () => {
  let ok1 = 0, ok4 = 0, hearts1 = 0;
  const N = 30;
  for (let s = 1; s <= N; s++) {
    const a = playGame(s, 'normal', 1, 300, 1);
    if (a.w.level >= 1) ok1++;
    hearts1 += a.w.hearts;
    if (playGame(s + 100, 'normal', 0.4, 300, 1).w.level >= 1) ok4++;
  }
  assert.ok(ok1 >= N - 1, 'skill 1 cleared ' + ok1 + '/' + N);
  assert.ok(ok4 >= N * 0.85, 'skill 0.4 cleared ' + ok4 + '/' + N);
  const r = playGame(3, 'normal', 1, 200);
  for (const k of ['decisions', 'catches', 'misses', 'ouches', 'rains', 'steamed', 'levels', 'deaths', 'maxLevel']) assert.ok(k in r.bot.stats, k);
  assert.ok(r.bot.stats.catches > 40 && r.bot.stats.catches / (r.bot.stats.catches + r.bot.stats.misses) > 0.85);
  console.log('      level 1 cleared: skill 1 ' + ok1 + '/' + N + ', skill 0.4 ' + ok4 + '/' + N + ', avg hearts left ' + (hearts1 / N).toFixed(2));
});

test('bot: idle bot loses only combos (no rocks reached it early) and an always-still Puff still dies eventually', () => {
  // a player that never moves from the middle: catches the odd coin, eventually hit by rocks
  const w = new VC.World({ seed: 21 }); let t = 0;
  while (w.state !== 'dead' && t < 1800) { w.setTarget(480); w.update(1 / 30); t += 1 / 30; }
  assert.strictEqual(w.state, 'dead', 'standing still must not survive forever');
  assert.ok(w.missed > w.coinsTotal, 'standing still misses most coins');
});

// ---------- interpolation / robustness ----------
test('interpolation: _px/_py saved at the start of each sub-step for puff and items', () => {
  const w = world(9); hold(w, 480); run(w, 3);
  w.setTarget(800);
  const x0 = w.puff.x, ys = w.items.map(i => [i, i.y]);
  w.update(H);
  assert.strictEqual(w.puff._px, x0);
  for (const [i, y] of ys) if (w.items.includes(i)) assert.strictEqual(i._py, y);
  assert.ok(w._acc >= 0 && w._acc < w.cfg.step);
});

// ---------- weather ----------
test('weather: every zone has its ambient life; smoke rises + expands; bounded < 160 with rumble + rain', () => {
  const need = [['sparkle'], ['leaf', 'butterfly'], ['ash'], ['ember', 'firefly', 'star']];
  for (let z = 0; z < 4; z++) {
    const wx = new VC.Weather({ seed: z + 1 });
    wx.setZone(z, { instant: true });
    let maxN = 0;
    for (let k = 0; k < 600; k++) {
      const env = { volcano: { rumble: (k % 120) / 120, glow: (k % 120) < 3 ? 1 : 0.3, shake: 0 }, rain: { active: (k % 200) < 70 ? 1 : 0, x: 300, w: 130 } };
      wx.update(1 / 60, env); maxN = Math.max(maxN, wx.particles.length);
    }
    assert.ok(maxN < 160, 'zone ' + z + ' max ' + maxN);
    const sprites = new Set(wx.particles.map(p => p.sprite));
    for (const s of need[z].concat(['smoke'])) assert.ok(sprites.has(s), 'zone ' + z + ' has ' + s);
    for (const p of wx.particles) {
      for (const k of ['sprite', 'x', 'y', 'size', 'rot', 'flipX', 'alpha', 'layer']) assert.ok(k in p && (typeof p[k] === 'string' || isFinite(p[k])), k);
      assert.ok(p.layer === 'back' || p.layer === 'front');
      assert.ok(p.alpha >= 0 && p.alpha <= 1);
    }
    assert.ok(typeof wx.ambient.fog === 'number');
  }
  // smoke physics
  const wx = new VC.Weather({ seed: 3 });
  wx.update(0.5, {});
  const p = wx.particles.find(q => q.kind === 'smoke');
  assert.ok(p, 'smoke exists'); const y0 = p.y, s0 = p.size;
  wx.update(1, {});
  assert.ok(p.y < y0 - 15 && p.size > s0, 'rises and expands');
  // rumble → more smoke, darker
  const a = new VC.Weather({ seed: 4 }), b = new VC.Weather({ seed: 4 });
  a.update(2, { volcano: { rumble: 0, glow: 0.2 } }); b.update(2, { volcano: { rumble: 1, glow: 0.75 } });
  const ns = w => w.particles.filter(q => q.kind === 'smoke');
  assert.ok(ns(b).length > ns(a).length * 2, 'more smoke while rumbling');
  assert.ok(ns(b).some(q => q.dark > 0.5));
  // rain streaks only inside the column
  const r = new VC.Weather({ seed: 5 }); r.update(0.5, { rain: { active: 1, x: 300, w: 130 } });
  const rain = r.particles.filter(q => q.kind === 'rain');
  assert.ok(rain.length > 5 && rain.every(q => Math.abs(q.x - 300) <= 70 && q.layer === 'front'));
});

test('weather: leaves sway like a pendulum + tumble; ash has depth layers drifting with the wind; butterflies flap', () => {
  const wx = new VC.Weather({ seed: 2 }); wx.setZone(1, { instant: true });
  const leaf = wx.particles.find(p => p.sprite === 'leaf'), xs = [], rots = [];
  const bf = wx.particles.find(p => p.sprite === 'butterfly'); const flaps = new Set();
  for (let k = 0; k < 240; k++) { wx.update(1 / 60); xs.push(leaf.x - leaf.x0); rots.push(leaf.rot); flaps.add(Math.round(Math.abs(bf.flipX) * 4)); }
  assert.ok(Math.max(...xs) > 8 && Math.min(...xs) < -8, 'sways both ways');
  assert.ok(Math.max(...rots) > 0.3 && Math.min(...rots) < -0.3, 'tilts with the swing');
  assert.ok(flaps.size >= 3, 'wing flap');
  const ash = new VC.Weather({ seed: 3 }); ash.setZone(2, { instant: true });
  const depths = new Set(ash.particles.filter(p => p.kind === 'fall').map(p => p.depth));
  assert.ok(depths.size >= 3, 'depth layers');
  const fl = ash.particles.find(p => p.sprite === 'ash' && p.layer === 'front'), x0 = fl.x;
  ash.update(1); assert.ok(fl.x - x0 > 10, 'wind pushes right');
  const night = new VC.Weather({ seed: 3 }); night.setZone(3, { instant: true });
  assert.ok(night.particles.filter(p => p.sprite === 'star').every(p => p.y < 200 && p.layer === 'back'));
});

test('weather: smooth zone hand-over, setSeason alias, deterministic for any dt partition', () => {
  const wx = new VC.Weather({ seed: 2 });
  wx.update(1);
  wx.setSeason(3);
  wx.update(0.5);
  const mix = new Set(wx.particles.filter(p => p.zone >= 0).map(p => p.zone));
  assert.ok(mix.has(0) && mix.has(3), 'both during hand-over');
  wx.update(4);
  assert.ok(wx.particles.every(p => p.zone === 3 || p.zone === -1), 'old zone gone');
  assert.strictEqual(wx.zone, 3); assert.strictEqual(wx.season, 3);
  const sim = (k) => {
    const a = new VC.Weather({ seed: 5 }); let step = 0;
    while (step < 900) {
      if (step === 300) a.setZone(1); if (step === 600) a.setZone(2);
      const env = { volcano: { rumble: Math.floor(step / 60) % 2, glow: Math.floor(step / 60) % 3 === 0 ? 1 : 0.3 }, rain: { active: step >= 405 && step < 465 ? 1 : 0, x: 500, w: 130 } };
      a.update(k / 60, env); step += k;
    }
    return a.particles;
  };
  deq(sim(1), sim(3)); deq(sim(1), sim(5));
});

// ---------- performance ----------
test('performance: 10 minutes of game time (world + bot + weather) in ~2 s, bounded, no NaN', () => {
  const t0 = process.hrtime.bigint();
  const w = new VC.World({ seed: 31 });
  const bot = new VC.Bot(w, { skill: 0.8, seed: 31 });
  const wx = new VC.Weather({ seed: 31 });
  let maxP = 0, maxI = 0, games = 1;
  for (let i = 0; i < 60 * 600; i++) {
    bot.step(1 / 60); w.update(1 / 60);
    for (const e of w.drainEvents()) if (e.type === 'zone') wx.setZone(e.zone);
    wx.update(1 / 60, { volcano: w.volcano, rain: w.rain });
    maxP = Math.max(maxP, wx.particles.length); maxI = Math.max(maxI, w.items.length);
    const p = w.puff;
    for (const v of [p.x, p.vx, p.tilt, p.swing, p.rimX, p.y, w.score, w.volcano.glow, w.volcano.shake, w.rain.charge]) assert.ok(isFinite(v), 'NaN');
    if (i % 60 === 0) for (const it of w.items) assert.ok(isFinite(it.x + it.y + it.vx + it.vy + it.alpha + it.rot + it.spin), 'item NaN');
    if (w.state === 'dead') { w.reset(); games++; }
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(maxP < 160 && maxI <= 14, 'bounded p' + maxP + ' items' + maxI);
  assert.ok(ms < 5000, 'took ' + ms.toFixed(0) + ' ms');
  console.log('      10 min sim in ' + ms.toFixed(0) + ' ms; games ' + games + ', level ' + w.level + ', max particles ' + maxP + ', items ' + maxI);
});

// ---------- runner ----------
let pass = 0, fail = 0;
const only = process.argv[2];
for (const t of tests) {
  if (only && !t.name.includes(only)) continue;
  try { t.fn(); pass++; console.log('  PASS ' + t.name); }
  catch (e) { fail++; console.log('  FAIL ' + t.name + '\n       ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n       ') : e)); }
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
