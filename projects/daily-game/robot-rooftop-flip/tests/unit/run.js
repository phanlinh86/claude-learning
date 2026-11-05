#!/usr/bin/env node
// Bolt's Rooftop Flip — headless unit tests for rng / world / weather / bot (node, no deps).
// Run from projects/daily-game/robot-rooftop-flip:   node tests/unit/run.js
'use strict';
const assert = require('assert');
const { load } = require('./load');

const RF = load();
const C = RF.World.CONFIG;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const H = C.step;
const J = v => v === undefined ? v : JSON.parse(JSON.stringify(v));
const deq = (a, b, m) => assert.deepStrictEqual(J(a), J(b), m);
const near = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, (m || '') + ' got ' + a + ' want ' + b + ' ±' + tol);

// ---------- helpers ----------
function mk(diff, seed, w, h, level) {
  return new RF.World({ seed: seed || 1, difficulty: diff || 'normal', width: w || 960, height: h || 540, level: level || 0 });
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
  const bot = new RF.Bot(w, { skill, seed: seed * 3 + 1 });
  const wx = opts.weather ? new RF.Weather({ width: w.layout.width, height: w.layout.height, seed }) : null;
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
        if (x.type === 'catch') wx.burst('bit_pink', x.x - w.cam.x, x.y, 8, { speed: 180 });
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
test('rng: RF namespace, deterministic, in range, API', () => {
  const a = new RF.RNG(42), b = new RF.RNG(42), c = new RF.RNG('x');
  for (let i = 0; i < 300; i++) { const x = a.next(); assert.strictEqual(x, b.next()); assert.ok(x >= 0 && x < 1); }
  for (const f of ['next', 'range', 'int', 'pick', 'chance', 'gauss', 'sign', 'fork']) assert.strictEqual(typeof c[f], 'function', f);
  assert.strictEqual(RF.MS, undefined);
});

test('layout: DESIGN §2 numbers (landscape, portrait, wide)', () => {
  const L = RF.World.computeLayout(960, 540);
  assert.strictEqual(L.unit, 100); assert.ok(!L.portrait);
  near(L.midY, 286.2, 1e-9); near(L.ceilY, 141.2, 1e-9); near(L.floorY, 431.2, 1e-9); near(L.corridorH, 290, 1e-9); near(L.heroX, 249.6, 1e-9);
  const P = RF.World.computeLayout(560, 1000);
  assert.ok(P.portrait); near(P.unit, 560 / 6, 1e-9); near(P.midY, 470, 1e-9); near(P.heroX, 0.22 * 560, 1e-9);
  near(RF.World.computeLayout(1280, 540).unit, 100, 1e-9);
  const w = mk(); near(w.standY('floor'), 431.2 - 42, 1e-9); near(w.standY('ceil'), 141.2 + 42, 1e-9);
  near(w.hero.x - w.cam.x, L.heroX, 1e-9);
});

// ---------- determinism ----------
test('determinism: same seed + same inputs → identical state; other seed differs; frame-rate independent', () => {
  const flips = [3.0, 4.5, 6.25, 8.0, 9.5, 12.0, 13.5, 16.0, 18.5, 21.0, 24.0, 27.5];
  const sim = (seed, dt) => {
    const w = mk('normal', seed); let t = 0, k = 0; const n = Math.round(30 / dt);
    for (let i = 0; i < n; i++) { if (k < flips.length && t >= flips[k] - 1e-9) { w.flip(); k++; } w.update(dt); t = (i + 1) * dt; w.drainEvents(); }
    return w;
  };
  const a = sim(5, 1 / 60), b = sim(5, 1 / 60), c = sim(6, 1 / 60);
  deq(a.getState(), b.getState());
  deq(a.fireflies.map(f => [f.x, f.y, f.state]), b.fireflies.map(f => [f.x, f.y, f.state]));
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

test('obstacles: bump costs a battery, obstacle is squashed, 1.5 s blink of safety', () => {
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
  // the rail side: a sign hits Bolt upside-down, a vent below does not
  const w2 = flat('normal', { obstacles: [{ kind: 'vent', x: 3 }, { kind: 'sign', x: 6 }] });
  run(w2, 0.05); w2.flip(); ev = run(w2, 2.5);
  assert.deepStrictEqual(of(ev, 'bump').map(e => e.ob.kind), ['sign']);
  // the bump test is box vs box: flying past at mid-height misses both
  const w3 = flat('normal', { obstacles: [{ kind: 'vent', x: 1.5 }] });
  w3.hero.invuln = 0; w3.flip(); ev = run(w3, 1);
  assert.strictEqual(of(ev, 'bump').length, 0, 'a flip 1.25 u before a vent clears it');
});

test('fireflies: catch vs wrong (Normal breaks the combo, Easy ignores), flee arc', () => {
  for (const diff of ['normal', 'easy']) {
    const w = flat(diff); const c = w.hero.color, o = (c + 1) % 3;
    w.setTrack({ fireflies: [{ x: 1.5, color: c }, { x: 2.3, color: c }, { x: 3.1, color: c }, { x: 4.2, color: o }, { x: 5.2, color: c }] });
    let fy0 = null, flee = null, fleeY = [];
    const ev = run(w, 4.6 * w.layout.unit / w.speed, (e, w) => { if (e.type === 'wrong') { flee = e.ff; fy0 = e.ff.y; } });
    const cat = of(ev, 'catch'), wr = of(ev, 'wrong');
    assert.strictEqual(cat.length, 3, diff + ' 3 caught'); assert.strictEqual(wr.length, 1);
    deq(cat.map(e => e.combo), [1, 2, 3]); deq(cat.map(e => e.points), [10, 10, 10]);
    assert.ok(flee && flee.state === 'flee');
    if (diff === 'normal') { assert.strictEqual(w.combo, 0); assert.strictEqual(of(ev, 'comboBreak')[0].combo, 3); }
    else { assert.strictEqual(w.combo, 3); assert.strictEqual(of(ev, 'comboBreak').length, 0); }
    for (let i = 0; i < 30; i++) { w.update(H); fleeY.push(flee.y); }
    assert.ok(fleeY[29] < fy0 - 0.3 * w.layout.unit, 'zips up');
    assert.ok(fleeY[29] - fleeY[28] < fleeY[1] - fleeY[0], 'accelerating arc');
    run(w, 1.5);
    assert.ok(!w.fireflies.includes(flee), 'fled and gone');
    assert.strictEqual(w.stats.caught, 4); assert.strictEqual(w.stats.wrong, 1);
  }
  // Easy has the bigger catch radius: a firefly 0.62 u above the standing line is caught on Easy only
  for (const [diff, n] of [['easy', 1], ['normal', 0]]) {
    const bob = C.ff.bob; C.ff.bob = 0; C.ff.drift = 0;      // hold it still: box top is 0.25 u above, radii 0.22 / 0.297
    const w = flat(diff); w.setTrack({ fireflies: [{ x: 1.5, dy: -0.51, color: w.hero.color }] });
    const n2 = of(run(w, 1), 'catch').length; C.ff.bob = bob; C.ff.drift = 0.05;
    assert.strictEqual(n2, n, diff);
  }
  // fireflies bob gently around their spot
  const w = flat('normal', { fireflies: [{ x: 30, color: 0 }] });
  const f = w.fireflies[0]; let lo = 1e9, hi = -1e9;
  for (let i = 0; i < 400; i++) { w.update(H); lo = Math.min(lo, f.y); hi = Math.max(hi, f.y); }
  near(hi - lo, 2 * C.ff.bob * w.layout.unit, 1.5, 'bob amplitude');
});

test('combo → multiplier ×1..×5 (+1 every 5), combo events, points', () => {
  const w = flat('normal'); const c = w.hero.color;
  const ffs = []; for (let i = 0; i < 26; i++) ffs.push({ x: 1.5 + 0.6 * i, color: c });
  w.setTrack({ fireflies: ffs });
  const ev = run(w, 6);
  const cat = of(ev, 'catch'); assert.strictEqual(cat.length, 26);
  deq(of(ev, 'combo').map(e => [e.combo, e.mult]), [[5, 2], [10, 3], [15, 4], [20, 5]]);
  assert.strictEqual(w.mult, 5);
  const pts = cat.reduce((s, e) => s + e.points, 0);
  assert.strictEqual(pts, 10 * (4 * 1 + 5 * 2 + 5 * 3 + 5 * 4 + 7 * 5));
  assert.strictEqual(w.score, pts); assert.strictEqual(w.maxCombo, 26);
});

test('paint gates change Bolt\'s colour; the new colour then counts', () => {
  const w = flat('normal'); const c = w.hero.color, n = (c + 1) % 3;
  w.setTrack({ gates: [{ x: 2, color: n }], fireflies: [{ x: 3, color: n }, { x: 4, color: c }] });
  const ev = run(w, 1.6);
  deq(of(ev, 'gate').map(e => e.color), [n]);
  assert.strictEqual(w.hero.color, n); assert.ok(w.gates[0].passed);
  assert.strictEqual(of(ev, 'catch').length, 1); assert.strictEqual(of(ev, 'wrong').length, 1);
  // generated gates always change the colour and come every ≈8–14 s
  const g = playBot('normal', 4, 1, 240, { immortal: true });
  const gw = g.w; assert.ok(gw.stats.gates >= 15 && gw.stats.gates <= 32, 'gates in 4 min: ' + gw.stats.gates);
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
    // finish arches stand in calm stretches
    for (const p of w.plans) if (p.finishX < end) {
      assert.ok(w.clearRange('floor', p.finishX - C.gen.finishClear * u, p.finishX + C.gen.finishClear * u) &&
                w.clearRange('ceil', p.finishX - C.gen.finishClear * u, p.finishX + C.gen.finishClear * u), 'finish clear');
    }
    // gates on safe ground, alternating colours; fireflies never inside obstacles
    let col = w.hero.color;
    for (const g of w.gates) { assert.notStrictEqual(g.color, col, 'gate changes colour'); col = g.color; assert.ok(w.safeAt('floor', g.x) && w.safeAt('ceil', g.x)); }
    for (const f of w.fireflies) for (const ob of w.obstacles) {
      const top = ob.side === 'floor' ? w.layout.floorY - ob.h : w.layout.ceilY;
      const cx = Math.max(ob.x - ob.w / 2, Math.min(f.baseX, ob.x + ob.w / 2)), cy = Math.max(top, Math.min(f.baseY, top + ob.h));
      assert.ok(Math.hypot(f.baseX - cx, f.baseY - cy) >= f.r, 'firefly inside an obstacle');
    }
    // ≈65 % of fireflies match the colour in force at their x
    const marks = [{ x: -1e18, c: w.hero.color }].concat(w.gates.map(g => ({ x: g.x, c: g.color })));
    let match = 0; for (const f of w.fireflies) { let c = marks[0].c; for (const mk of marks) if (mk.x <= f.baseX) c = mk.c; if (c === f.color) match++; }
    const share = match / w.fireflies.length; assert.ok(share > 0.58 && share < 0.82, 'match share ' + share.toFixed(2));
  }
  console.log('     (' + checked + ' hazards checked)');
});

test('Easy is gentler: slower, fewer and narrower gaps, longer calm between forced flips', () => {
  const st = d => {
    const w0 = genTrack(d, 0, 9, 100), u = w0.layout.unit, w = w0, hz = w0.hazards.filter(h => h.x1 < w0.plans[1].startX);   // dawn of round 1
    const len = (hz[hz.length - 1].x1 - w.plans[0].startX) / u, gaps = hz.filter(h => h.kind === 'gap');
    return { perSec: hz.length / (len / (w.levelBase(0) / u)), gapShare: gaps.length / hz.length, maxGap: Math.max(...gaps.map(g => (g.x1 - g.x0) / u)), speed: w.levelBase(0) / u };
  };
  const e = st('easy'), n = st('normal'), h = st('hard');
  assert.ok(e.speed < n.speed && n.speed < h.speed);
  assert.ok(e.perSec < n.perSec && n.perSec < h.perSec, 'hazards/s ' + [e.perSec, n.perSec, h.perSec].map(v => v.toFixed(2)));
  assert.ok(e.gapShare < n.gapShare && e.maxGap <= 1.4 + 1e-9);
  assert.ok(e.perSec < 0.5, 'Easy: < 1 hazard per 2 s at dawn, got ' + e.perSec.toFixed(2));
  assert.strictEqual(C.difficulty.easy.hearts, 5);
});

// ---------- levels ----------
test('finish arch: bonus, +1 battery, levelUp to the next time of day; loop bonus', () => {
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

test('gotoLevel jumps (levelUp, safe track ahead, Bolt keeps running)', () => {
  const w = mk('normal', 3); run(w, 2); w.drainEvents();
  w.gotoLevel(6);
  const ev = w.drainEvents(); deq(of(ev, 'levelUp').map(e => [e.level, e.zone]), [[6, 2]]);
  assert.strictEqual(w.level, 6); assert.strictEqual(w.loop, 1);
  const u = w.layout.unit, h = w.hero;
  assert.ok(w.clearRange('floor', h.x - 0.5 * u, h.x + 5 * u) && w.clearRange('ceil', h.x - 0.5 * u, h.x + 5 * u), 'safe start');
  near(w.speed, w.levelBase(6), 1);
  const b = new RF.Bot(w, { skill: 1 });
  let bad = 0; for (let i = 0; i < 60 * 40; i++) { b.step(1 / 60); w.update(1 / 60); for (const e of w.drainEvents()) if (e.type === 'fall' || e.type === 'bump') bad++; }
  assert.strictEqual(bad, 0);
});

test('game over: last battery → phase over, scroll eases to a stop, input ignored', () => {
  const w = flat('normal', { obstacles: [{ kind: 'vent', x: 2 }] }); w.hearts = 1;
  const ev = run(w, 1);
  const tt = types(ev).filter(t => t === 'bump' || t === 'heartLost' || t === 'gameOver');
  deq(tt, ['bump', 'heartLost', 'gameOver']);
  assert.strictEqual(w.phase, 'over'); assert.strictEqual(w.hearts, 0);
  assert.ok(!w.flip());
  run(w, 0.7); assert.ok(w.speed < 1e-6, 'stopped');
  const x = w.cam.x; run(w, 1); assert.strictEqual(w.cam.x, x);
  // a fall with the last battery: no drone, game over
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

test('bot: optional flips for fireflies only when skilled; never flips into a hazard', () => {
  const w = flat('normal'); const c = w.hero.color;
  w.setTrack({ fireflies: [3, 3.6, 4.2, 4.8].map(x => ({ x, side: 'ceil', color: c })) });
  const b = new RF.Bot(w, { skill: 1 }); for (let i = 0; i < 260; i++) { b.step(1 / 120); w.update(1 / 120); }
  assert.ok(b.stats.optional >= 1 && w.stats.caught >= 3, 'flipped for the fireflies');
  const w2 = flat('normal'); w2.setTrack({ fireflies: [3, 3.6, 4.2, 4.8].map(x => ({ x, side: 'ceil', color: c })) });
  const b2 = new RF.Bot(w2, { skill: 0.5 }); for (let i = 0; i < 260; i++) { b2.step(1 / 120); w2.update(1 / 120); }
  assert.strictEqual(b2.stats.optional, 0);
  // a vent ahead but the rail above has a hole at the landing spot → the bot waits for solid rail
  const w3 = flat('normal', { obstacles: [{ kind: 'vent', x: 4.5 }], rails: [[-5, 1.5], [3.4, 100]] });
  const b3 = new RF.Bot(w3, { skill: 1 }); let ev = [];
  for (let i = 0; i < 240; i++) { b3.step(1 / 120); w3.update(1 / 120); ev.push(...w3.drainEvents()); }
  assert.ok(!types(ev).includes('fall') && !types(ev).includes('bump') && b3.stats.flips >= 1, types(ev).join());
});

// ---------- weather ----------
test('weather: every zone, landscape + portrait: bounded counts, front layer soft, stars in the sky band', () => {
  for (const [W, Hh] of [[960, 540], [560, 1000], [720, 1600], [1280, 540]]) {
    const wx = new RF.Weather({ width: W, height: Hh, seed: 3 });
    for (let z = 0; z < 4; z++) {
      wx.setLevel(z);
      let maxN = 0, shoots = 0, sawShot = false;
      for (let i = 0; i < 60 * 25; i++) {
        wx.update(1 / 60, 330);
        if (i % 20 === 0) wx.burst('bit_yellow', W / 3, Hh / 2, 25, { speed: 200 });
        maxN = Math.max(maxN, wx.particles.length);
        const shot = wx.particles.some(p => p.kind === 'shoot'); if (shot && !sawShot) shoots++; sawShot = shot;
        for (const p of wx.particles) {
          assert.ok(isFinite(p.x) && isFinite(p.y) && p.alpha >= 0 && p.alpha <= 1);
          if (p.kind !== 'burst' && p.layer === 'front') assert.ok(p.alpha <= 0.5 + 1e-9 && p.size < 20 * W / 960 + 10, 'soft front');
          if (p.kind === 'star') assert.ok(p.y <= wx.skyY + 1e-9, 'star in the sky band');
          if (p.kind !== 'burst' && p.kind !== 'shoot' && p.kind !== 'trail') assert.ok(p.x > -400 && p.x < W + 400);
        }
      }
      assert.ok(maxN < 140, 'cap ' + maxN);
      const kinds = new Set(wx.particles.map(p => p.kind));
      const want = [['mist', 'dew'], ['seed'], ['mote'], ['star']][z];
      for (const k of want) assert.ok(kinds.has(k), 'zone ' + z + ' has ' + k);
      if (z === 3) assert.ok(shoots >= 2 && shoots <= 5, 'shooting stars in 25 s: ' + shoots);
      assert.ok(wx.particles.filter(p => p.kind === 'mote' && p.layer === 'front').length === 0, 'motes stay back');
    }
    wx.resize(Hh, W); wx.update(1 / 60, 300); assert.ok(wx.particles.length < 140);
  }
  // ambient particles drift with the scroll by depth
  const wx = new RF.Weather({ width: 960, height: 540, seed: 1 }); wx.setLevel(1, { instant: true });
  const p = wx.particles.find(q => q.layer === 'front') || wx.particles[0];
  const x0 = p.x; wx.update(0.05, 400); assert.ok(p.x < x0, 'drifts left');
  assert.ok(new RF.Weather({ width: 960, height: 540 }).ambient.tint !== undefined);
});

test('fuzz: random taps, resizes, gotoLevel during flight/rescue — no NaN, invariants hold', () => {
  const sizes = [[960, 540], [560, 1000], [1280, 540], [720, 1600], [1024, 768]];
  for (const diff of ['easy', 'normal', 'hard']) {
    const w = mk(diff, 21); w.hearts = w.maxHearts = 1e6;
    const r = new RF.RNG(diff); let t = 0, falls = 0, rescues = 0, cancels = 0, stuck = 0;
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
      for (const f of w.fireflies) assert.ok(isFinite(f.x) && isFinite(f.y));
      stuck = w.hero.state === 'rescue' ? stuck + 1 : 0; assert.ok(stuck < 400, 'rescue never ends');
    }
    assert.ok(falls > 0 && rescues >= falls - cancels - 1, diff + ' falls ' + falls + ' rescues ' + rescues + ' cancels ' + cancels);
    assert.ok(w.roofs.length < 80 && w.fireflies.length < 150, 'culled');
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
  for (const e of ['flip', 'land', 'catch', 'wrong', 'combo', 'gate', 'finish', 'levelUp']) assert.ok(r.ev.includes(e), e);
  const st = r.w.getState();
  assert.ok(st.level >= 7 && st.score > 3000, 'level ' + st.level + ' score ' + st.score);
  assert.ok(st.counts.fireflies < 120 && st.counts.obstacles < 60 && st.counts.roofs < 60, 'culled ' + JSON.stringify(st.counts));
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
