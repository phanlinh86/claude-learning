#!/usr/bin/env node
// Nubi's Farm Fling — headless unit tests for rng / world / weather / bot (node, no deps).
// Run from projects/daily-game/cloud-farm-fling:   node tests/unit/run.js        (add --stats for the long report)
'use strict';
const assert = require('assert');
const { load } = require('./load');

const CFF = load();
const W = CFF.World, C = W.CONFIG, H = C.STEP, DEG = Math.PI / 180;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const near = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, (m || '') + ' got ' + a + ' want ' + b + ' ±' + tol);

// ---------- helpers ----------
function mk(diff, seed, extra) { return new W(Object.assign({ seed: seed || 1, difficulty: diff || 'normal' }, extra || {})); }
/** a world with no fireflies / crows on the field (optionally at size s) */
function clean(diff, seed, extra, s) {
  const w = mk(diff, seed, extra); if (s) w.setSize(s);
  w.flies.length = 0; w.crows.length = 0; w.drainEvents(); return w;
}
function steps(w, n) { const ev = []; for (let i = 0; i < n; i++) { w.update(H); ev.push(...w.drainEvents()); } return ev; }
function runUntil(w, pred, max) {
  const ev = []; let t = 0; max = max || 10;
  while (t < max) { w.update(H); t += H; const e = w.drainEvents(); ev.push(...e); if (pred(e, w)) break; }
  return { ev, t };
}
const of = (ev, t) => ev.filter(e => e.type === t);
const types = ev => ev.map(e => e.type);
/** the exact pull (released now, current size) that lands Nubi at x X (angle a°) */
function pullTo(w, X, a) {
  const s = W.solveSpeed((a || 48) * DEG, X, w.wagon.top, w.nubi.size, w.nubi.goal);
  assert.ok(s && s.pull, 'solvable'); return s.pull;
}
function shoot(w, pull) { w.aim(pull.x, pull.y); assert.ok(w.release(), 'released'); }
function fly(id, x, y, kind) { return { id, x, y, y0: y, px: x, py: y, kind: kind || 'fly', value: kind === 'gold' ? 3 : 1, taken: false, t: 0, ph: Math.PI, bonus: false }; }
function playBot(diff, seed, skill, maxS, opts) {
  opts = opts || {};
  const w = mk(diff, seed, opts.world);
  if (opts.immortal) w.hearts = w.maxHearts = 1e6;
  const bot = new CFF.Bot(w, { skill, seed: seed * 7 + 1 });
  const dt = 1 / 60; let t = 0, last = 0; const lv = [], ev = [], res = [];
  while (w.phase !== 'over' && t < maxS && (opts.untilLevel === undefined || w.level < opts.untilLevel)) {
    bot.step(dt); w.update(dt); t += dt;
    for (const e of w.drainEvents()) {
      if (opts.keep) ev.push(e);
      if (e.type === 'levelUp') { lv.push(t - last); last = t; }
      if (e.type === 'land' || e.type === 'plop' || e.type === 'flop') res.push({ land: e.type === 'land', level: w.level });
    }
  }
  return { w, t, lv, bot, ev, res };
}

// ---------- casual kid model ----------
// A 4–6-year-old: thinks 1.5–3.5 s, picks a random-ish angle (28°–62°), drags until the visible (size-aware)
// preview "points at" the wagon where it is NOW (no lead for rolling), with hand error σ = KID_SIG u in the target
// point plus a power error that grows when the preview is too short to show the landing; shots 1 and 2 are
// clumsier (×1.7, ×1.3). It taps (puff) at a random moment in 25 % of the flights.
const KID_SIG = 0.9;
function kidPull(w, r, shot) {
  const learn = shot === 0 ? 1.7 : shot === 1 ? 1.3 : 1;
  const ang = r.range(28, 62) * DEG, target = w.wagon.x + r.gauss() * KID_SIG * learn;
  const landAt = L => {
    const p = { x: -Math.cos(ang) * L, y: -Math.sin(ang) * L }, v = w.launchVelocity(p.x, p.y);
    return W.bodyLand(w.nubi.size, w.nubi.goal, C.SLING.x + p.x, C.SLING.y + p.y, v.vx, v.vy, w.wagon.top);
  };
  let lo = C.PULL_MIN, hi = C.PULL_MAX;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (landAt(m).x < target) lo = m; else hi = m; }
  let L = (lo + hi) / 2;
  w.aim(-Math.cos(ang) * L, -Math.sin(ang) * L); const seen = Math.min(1, w.previewCount() * C.PREVIEW_DT / landAt(L).T); w.cancelAim();
  L *= 1 + r.gauss() * (0.03 + 0.10 * (1 - seen)) * learn;
  const a2 = ang + r.gauss() * 3 * DEG * learn;
  return { x: -Math.cos(a2) * L, y: -Math.sin(a2) * L };
}
function playKid(seed, diff, level, maxT) {
  const w = mk(diff, seed, { level }); w.hearts = w.maxHearts = 1e6;
  const r = new CFF.RNG(seed * 13 + 5), dt = 1 / 60;
  let t = 0, st = 'think', tt = 0, think = r.range(1.5, 3.5), drag = r.range(0.7, 1.4), pull = null, shot = 0, fl = -1, last = 0;
  const res = [], lv = [];
  while (t < maxT) {
    if (w.phase === 'aim') {
      tt += dt;
      if (st === 'think' && tt >= think) { pull = kidPull(w, r, shot); st = 'drag'; tt = 0; }
      if (st === 'drag') {
        const k = Math.min(1, tt / drag); w.aim(pull.x * k, pull.y * k);
        if (k >= 1) { w.release(); st = 'fly'; tt = 0; fl = r.chance(0.25) ? r.range(0.3, 1.4) : -1; }
      }
    } else if (w.phase === 'fly') { tt += dt; if (fl > 0 && tt >= fl) w.puff(); }
    else if (st !== 'think') { st = 'think'; tt = 0; think = r.range(1.5, 3.5); drag = r.range(0.7, 1.4); }
    w.update(dt); t += dt;
    for (const e of w.drainEvents()) {
      if (e.type === 'land' || e.type === 'plop' || e.type === 'flop') { res.push({ shot, land: e.type === 'land', level: w.level }); shot++; }
      if (e.type === 'levelUp') { lv.push({ level: e.level - 1, t: t - last }); last = t; }
    }
  }
  return { res, lv, w };
}

// ================= tests =================
test('rng: deterministic, ranges', () => {
  const a = new CFF.RNG(42), b = new CFF.RNG(42);
  for (let i = 0; i < 100; i++) assert.strictEqual(a.next(), b.next());
  const r = new CFF.RNG('x');
  for (let i = 0; i < 500; i++) { const v = r.int(3, 5); assert.ok(v >= 3 && v <= 5); }
});

test('determinism: same seed → same states and events; another seed differs', () => {
  const sig = seed => { const { w, ev } = playBot('normal', seed, 0.7, 90, { keep: true }); return JSON.stringify(w.getState()) + JSON.stringify(ev); };
  assert.strictEqual(sig(5), sig(5));
  assert.notStrictEqual(sig(5), sig(6));
  const w1 = mk('easy', 9, { size: 1.3 }), w2 = mk('easy', 9, { size: 1.3 });
  assert.strictEqual(JSON.stringify(w1.getState()), JSON.stringify(w2.getState()));
});

test('contract: LEVELS, wagon top, names, no day–night left', () => {
  assert.strictEqual(W.LEVELS.map(l => l.key).join(), 'spring,summer,autumn,winter');
  assert.strictEqual(W.LEVELS.map(l => l.name).join(), 'Spring Sprouts,Sunflower Summer,Pumpkin Autumn,Snowy Winter');
  assert.strictEqual(C.GROUND_Y, 0); assert.strictEqual(C.WAGON_TOP, 0.55); assert.strictEqual(C.BALE_X, 4.6);
  const w = mk('normal', 1, { level: 2 }), st = w.getState();
  assert.strictEqual(w.wagon.top, 0.55);
  for (const k of ['nubi', 'wagon', 'flies', 'crows', 'sling', 'pull', 'puffed', 'score', 'hearts', 'maxHearts', 'flyCount', 'landings',
    'levelLandings', 'shots', 'streak', 'bestStreak', 'level', 'zone', 'loop', 'difficulty', 'stats', 'time', 'alpha', 'phase', 'phaseT']) assert.ok(k in w, 'world.' + k);
  for (const k of ['x', 'y', 'vx', 'vy', 'px', 'py', 'rot', 'prot', 'state', 'size', 'psize']) assert.ok(k in w.nubi, 'nubi.' + k);
  for (const k of ['x', 'px', 'top', 'hw', 'bull', 'baseX', 'amp', 'period', 't']) assert.ok(k in w.wagon, 'wagon.' + k);
  for (const k of ['id', 'x', 'y', 'px', 'py', 'kind', 'value', 't']) assert.ok(k in w.flies[0], 'fly.' + k);
  for (const k of ['id', 'x', 'y', 'px', 'py', 'vx', 'r', 'flap']) assert.ok(k in w.crows[0], 'crow.' + k);
  for (const k of ['flies', 'goldFlies', 'landings', 'bulls', 'bigShowers', 'plops', 'puffs', 'bumps', 'hearts', 'shots', 'maxStreak', 'maxSize']) assert.ok(k in w.stats, 'stats.' + k);
  for (const k of ['dayT', 'light', 'isNight']) { assert.ok(!(k in w), 'no ' + k); assert.ok(!(k in st), 'no state.' + k); }
  assert.ok(!('NIGHT_PREVIEW' in C) && !('DAY_LEN' in C));
  assert.strictEqual(w.flutter, w.puff, 'flutter = alias of puff');
  // easy has the wider wagon
  assert.ok(mk('easy', 1).wagon.hw > mk('normal', 1).wagon.hw && mk('normal', 1).wagon.hw > mk('hard', 1).wagon.hw);
});

test('launch velocity: v = −pull/PULL_MAX·VMAX, clamps', () => {
  const w = mk();
  const v = w.launchVelocity(-0.9, -0.6);
  near(v.vx, 0.9 / C.PULL_MAX * C.VMAX, 1e-9); near(v.vy, 0.6 / C.PULL_MAX * C.VMAX, 1e-9);
  const big = w.launchVelocity(-5, -1);
  near(Math.hypot(big.vx, big.vy), C.VMAX, 1e-9);
  const low = w.launchVelocity(-0.5, -3);
  near(low.vy, C.PULL_DOWN / C.PULL_MAX * C.VMAX, 1e-9);
  assert.ok(w.launchVelocity(1, -1).vx >= 0);
  w.aim(-5, -5); assert.ok(Math.hypot(w.pull.x, w.pull.y) <= C.PULL_MAX + 1e-9); assert.ok(w.pull.y >= -C.PULL_DOWN - 1e-9);
  near(w.nubi.x, C.SLING.x, 1e-9); steps(w, 1); near(w.nubi.x, C.SLING.x + w.pull.x, 1e-9); assert.strictEqual(w.nubi.state, 'pull');
});

test('aim: first call emits pull; tiny pull release cancels; cancelAim', () => {
  const w = clean();
  w.aim(-0.1, -0.1); w.aim(-0.15, -0.1);
  assert.strictEqual(types(w.drainEvents()).join(), 'pull');
  assert.strictEqual(w.release(), false); assert.strictEqual(w.pull, null); assert.strictEqual(w.phase, 'aim');
  w.aim(-1, -1); w.cancelAim(); assert.strictEqual(w.pull, null); assert.strictEqual(w.previewCount(), 0);
});

test('preview == actual flight point for point (size 1 and 1.7, and with firefly pickups on the way)', () => {
  const check = (w, pull, label) => {
    w.aim(pull.x, pull.y);
    const dt = 5 * H, pts = w.preview(80, dt);
    assert.ok(pts.length > 10, label + ' pts ' + pts.length);
    w.release(); const got = [];
    for (let i = 0; i < pts.length && w.phase === 'fly'; i++) { steps(w, 5); if (w.phase === 'fly') got.push({ x: w.nubi.x, y: w.nubi.y, s: w.nubi.size }); }
    assert.ok(got.length >= pts.length - 2, label + ' ' + got.length + ' / ' + pts.length);
    for (let i = 0; i < got.length; i++) {
      near(got[i].x, pts[i].x, 1e-9, label + ' x' + i); near(got[i].y, pts[i].y, 1e-9, label + ' y' + i); near(got[i].s, pts[i].size, 1e-12, label + ' s' + i);
    }
  };
  for (const s of [1, 1.7]) { const w = clean('normal', 3, null, s); check(w, pullTo(w, w.wagon.x, 50), 'size ' + s); }
  const w = mk('normal', 4, { level: 2, size: 1.3 });              // real fireflies + a crow: preview is still exact
  const flies0 = w.flies.length; check(w, w.solution.pull, 'flies');
  assert.ok(w.flyCount > 0 && w.flies.length < flies0, 'collected on the way');
  // previewCount: per level, shorter in later seasons
  const a = mk('normal', 1, { level: 0 }), b = mk('normal', 1, { level: 3 });
  a.aim(-1, -1); b.aim(-1, -1);
  assert.ok(a.previewCount() > b.previewCount());
  assert.strictEqual(a.previewCount(), Math.round(W.LEVELS[0].PREVIEW));
});

test('size 1 flight = analytic parabola; solveSpeed lands where it says (sizes 1 and 1.7)', () => {
  for (const ang of [32, 45, 60]) {
    const w = clean('normal', 4);
    const X = w.wagon.x, s = W.solveSpeed(ang * DEG, X, w.wagon.top, 1, 1);
    w.nubi.goal = w.nubi.size = 1; W.CONFIG.GROW_RATE_SAVE = C.GROW_RATE; C.GROW_RATE = 0;   // no growth: pure parabola
    try {
      const s0 = W.solveSpeed(ang * DEG, X, w.wagon.top, 1, 1);
      shoot(w, s0.pull);
      let t = 0, maxErr = 0;
      while (w.phase === 'fly') {
        steps(w, 1); t += H; if (w.phase !== 'fly') break;
        const ex = s0.x0 + s0.vx * t, ey = s0.y0 + s0.vy * t - 0.5 * C.G * t * t;
        maxErr = Math.max(maxErr, Math.hypot(w.nubi.x - ex, w.nubi.y - ey));
      }
      assert.ok(maxErr < 1e-6, 'arc error ' + maxErr);
      near(t, s0.T, 2 * H, 'flight time');
      assert.strictEqual(w.phase, 'land'); near(w.nubi.x, X, 0.02, 'lands on the aimed spot');
    } finally { C.GROW_RATE = W.CONFIG.GROW_RATE_SAVE; delete W.CONFIG.GROW_RATE_SAVE; }
    assert.ok(s && s.pull);
  }
  for (const sz of [1, 1.35, 1.7]) for (const ang of [36, 48, 56]) {           // with growth in flight + drag
    const w = clean('normal', 5, null, sz), X = w.wagon.x;
    shoot(w, pullTo(w, X, ang)); runUntil(w, () => w.phase !== 'fly', 6);
    assert.strictEqual(w.phase, 'land', 'size ' + sz + ' ' + ang + '°'); near(w.nubi.x, X, 0.02, 'size ' + sz + ' lands on target');
  }
  // flights are 1.3–2.3 s on the generated solution arcs
  const Ts = [];
  for (let seed = 1; seed < 80; seed++) { const w = mk('normal', seed, { level: seed % 4, size: 1 + (seed % 7) * 0.1 }); if (w.solution) Ts.push(w.solution.T); }
  const mean = Ts.reduce((a, b) => a + b, 0) / Ts.length;
  assert.ok(mean > 1.3 && mean < 2.3, 'mean flight ' + mean);
});

test('buoyancy + drag: bigger Nubi flies a SHORTER, floatier arc for the same pull', () => {
  near(W.gravityAt(1), C.G, 1e-12); near(W.gravityAt(1.7), C.G * (1 - C.BUOY * 0.7), 1e-12);
  assert.strictEqual(W.dragAt(1), 0); near(W.dragAt(1.7), C.DRAG * 0.7, 1e-12);
  for (const L of [0.8, 1.0, 1.2, 1.4]) for (const a of [35, 45, 55]) {
    const p = { x: -Math.cos(a * DEG) * L, y: -Math.sin(a * DEG) * L }, res = [];
    for (const s of [1, 1.35, 1.7]) {
      const w = clean('normal', 6, null, s); w.wagon.x = 40;                // wagon out of the way: land on the grass
      shoot(w, p); runUntil(w, () => w.phase !== 'fly', 9); res.push({ x: w.nubi.x, t: w.time });
    }
    assert.ok(res[0].x < 16, 'stays on the field');
    assert.ok(res[0].x > res[1].x && res[1].x > res[2].x, 'shorter when bigger L' + L + ' ' + a + '°: ' + res.map(r => r.x.toFixed(2)));
    assert.ok(res[2].x / res[2].t < res[0].x / res[0].t, 'drifts slower (floatier) when big');
  }
  // a medium pull: about 1 u shorter at full size (noticeable, not crippling)
  const v = new W({}).launchVelocity(-1.1 * Math.cos(45 * DEG), -1.1 * Math.sin(45 * DEG));
  const x0 = C.SLING.x - 1.1 * Math.cos(45 * DEG), y0 = C.SLING.y - 1.1 * Math.sin(45 * DEG);
  const d = W.bodyLand(1, 1, x0, y0, v.vx, v.vy, C.WAGON_TOP).x - W.bodyLand(1.7, 1.7, x0, y0, v.vx, v.vy, C.WAGON_TOP).x;
  assert.ok(d > 0.6 && d < 1.6, 'medium shot shortening ' + d);
  assert.ok(W.bodyLand(1.7, 1.7, x0, y0, v.vx, v.vy, C.WAGON_TOP).T > W.bodyLand(1, 1, x0, y0, v.vx, v.vy, C.WAGON_TOP).T, 'medium shot hangs longer');
});

test('max size: a full pull still reaches the farthest wagon (every level / difficulty)', () => {
  let xmax = 0;
  for (const diff of ['easy', 'normal', 'hard']) for (let l = 0; l < 16; l++) xmax = Math.max(xmax, mk(diff, 1).levelParams(l).xmax);
  let best = 0;
  for (let a = 25; a <= 65; a++) {
    const p = { x: -Math.cos(a * DEG) * C.PULL_MAX, y: -Math.sin(a * DEG) * C.PULL_MAX };
    if (p.y < -C.PULL_DOWN) continue;
    const v = new W({}).launchVelocity(p.x, p.y);
    best = Math.max(best, W.bodyLand(C.SIZE_MAX, C.SIZE_MAX, C.SLING.x + p.x, C.SLING.y + p.y, v.vx, v.vy, C.WAGON_TOP).x);
  }
  assert.ok(best >= xmax + 1, 'reach ' + best.toFixed(2) + ' vs farthest wagon ' + xmax);
  // and a real shot: max-size Nubi at the far end of winter (hard) lands
  const w = clean('hard', 7, { level: 3 }, C.SIZE_MAX); w.wagon.x = w.wagon.baseX = w.wagon.fromX = w.P.xmax; w.wagon.amp = 0;
  const s = W.solveSpeed(42 * DEG, w.P.xmax, w.wagon.top, C.SIZE_MAX, C.SIZE_MAX);
  assert.ok(s && s.pull && s.v <= C.VMAX, 'solvable at max size'); shoot(w, s.pull);
  runUntil(w, () => w.phase !== 'fly', 8); assert.strictEqual(w.phase, 'land');
});

test('growth: slow growth while aiming/flying, eased, capped, grow/big events, setSize + size option', () => {
  const w = clean('normal', 8);
  assert.strictEqual(w.nubi.size, 1);
  steps(w, Math.round(10 / H));
  near(w.nubi.size, 1 + 10 * C.GROW_RATE, 0.003, 'grows ≈ GROW_RATE·t while aiming');
  assert.strictEqual(w.nubi.psize <= w.nubi.size, true);
  // crossing 1.4 → grow {size 1.4} + big (once)
  w.setSize(1.39); w.nubi.goal = 1.42; w.drainEvents();   // (mist stops at MIST_CAP, so push the goal like a firefly would)
  const ev = steps(w, Math.round(3 / H));
  assert.strictEqual(of(ev, 'grow').map(e => e.size).join(), '1.4'); assert.strictEqual(of(ev, 'big').length, 1);
  // cap
  w.setSize(1.25); steps(w, Math.round(30 / H)); near(w.nubi.size, C.MIST_CAP, 1e-6, 'mist growth stops at MIST_CAP');
  w.setSize(1.69); steps(w, Math.round(5 / H)); near(w.nubi.size, 1.69, 1e-9, 'no mist growth above MIST_CAP');
  w.setSize(5); assert.strictEqual(w.nubi.size, C.SIZE_MAX); w.setSize(0.2); assert.strictEqual(w.nubi.size, 1);
  assert.strictEqual(mk('normal', 1, { size: 1.5 }).nubi.size, 1.5);
  assert.strictEqual(mk('normal', 1, { size: 9 }).nubi.size, C.SIZE_MAX);
  // a firefly: goal += GROW_FLY, size eases there smoothly (no pops), gold gives GROW_GOLD
  for (const kind of ['fly', 'gold']) {
    const g = clean('normal', 9); const p = pullTo(g, g.wagon.x, 50);
    const pr = g.predictShot(p, 0);
    g.aim(p.x, p.y); const pts = g.preview(40, 0.3 / 4); const at = pts[3];          // where Nubi is at t = 0.3 s
    g.flies.push(fly(500, at.x, at.y, kind)); g.release();
    let maxJump = 0, got = null;
    while (g.phase === 'fly') {
      const ev2 = steps(g, 1); maxJump = Math.max(maxJump, Math.abs(g.nubi.size - g.nubi.psize));
      const f = of(ev2, 'fly')[0]; if (f) got = { e: f, goal: g.nubi.goal, t: g.nubi.flightT };
    }
    assert.ok(got, 'picked'); assert.strictEqual(got.e.kind, kind); assert.strictEqual(got.e.value, kind === 'gold' ? 3 : 1);
    near(got.goal, 1 + got.t * C.GROW_RATE + (kind === 'gold' ? C.GROW_GOLD : C.GROW_FLY), 1e-3, kind + ' growth');
    assert.ok('size' in got.e && 'count' in got.e && 'x' in got.e);
    assert.ok(maxJump < 0.004, 'eased, max per-step change ' + maxJump);
    assert.ok(pr.size < g.stats.maxSize, 'bigger than without the firefly');
  }
});

test('shrink: landing rains water away (RAIN_KEEP, eased), plop squeezes PLOP_LOSS; level up keeps size', () => {
  const w = clean('normal', 10, null, 1.5);
  shoot(w, pullTo(w, w.wagon.x));
  const { ev } = runUntil(w, () => w.phase !== 'fly', 6);
  const l = of(ev, 'land')[0]; assert.ok(l, 'landed');
  assert.ok(l.size >= 1.5 && l.big, 'big landing'); near(l.shrinkTo, 1 + (w.nubi.goal - 1), 1e-12);
  near(l.shrinkTo, 1 + (l.size - 1) * C.RAIN_KEEP, 0.01);
  assert.strictEqual(w.nubi.state, 'rain');
  let prev = w.nubi.size, maxJump = 0;
  for (let i = 0; i < Math.round(1.1 / H); i++) { steps(w, 1); if (w.phase !== 'land') break; maxJump = Math.max(maxJump, prev - w.nubi.size); prev = w.nubi.size;
    near(w.nubi.y - C.FOOT * w.nubi.size, w.wagon.top, 1e-9, 'bottom on the soil'); }
  assert.ok(maxJump < 0.02, 'smooth shrink ' + maxJump);
  near(w.nubi.size, l.shrinkTo, 0.06, 'mostly shrunk by the end of the rain');
  // plop
  const p = clean('normal', 11, null, 1.5); const g0 = p.nubi.goal;
  shoot(p, pullTo(p, p.wagon.x - p.wagon.hw - 2));
  runUntil(p, () => p.phase !== 'fly', 6); assert.strictEqual(p.phase, 'plop');
  near(p.nubi.goal, Math.max(1, g0 + p.nubi.flightT * C.GROW_RATE - C.PLOP_LOSS), 0.01);
  const q = clean('normal', 11, null, 1.08); shoot(q, pullTo(q, q.wagon.x - q.wagon.hw - 2)); runUntil(q, () => q.phase !== 'fly', 6);
  assert.strictEqual(q.nubi.goal, 1, 'never below 1');
  // level up keeps the size
  const u = mk('normal', 12, { size: 1.45 }); const s0 = u.nubi.size; u.drainEvents(); u.gotoLevel(1);
  assert.strictEqual(u.nubi.size, s0);
});

test('firefly pickup: radius R_NUBI·s + R_FLY (bigger Nubi catches from further away)', () => {
  for (const s of [1, 1.6]) {
    const w = clean('normal', 13, null, s);
    const p = pullTo(w, w.wagon.x, 48); w.aim(p.x, p.y);
    const pts = w.preview(40, 0.05), a = pts[12], b = pts[13];
    const vx = b.x - a.x, vy = b.y - a.y, vl = Math.hypot(vx, vy), nx = -vy / vl, ny = vx / vl;
    const R1 = C.R_NUBI * 1 + C.R_FLY, R16 = C.R_NUBI * 1.6 + C.R_FLY, mid = (R1 + R16) / 2;
    w.flies.push(fly(900, a.x + nx * (R1 - 0.06), a.y + ny * (R1 - 0.06)));          // inside for both sizes
    w.flies.push(fly(901, a.x - nx * mid, a.y - ny * mid));                          // only the big Nubi reaches
    w.flies.push(fly(902, a.x + nx * (R16 + 0.25), a.y + ny * (R16 + 0.25)));        // nobody
    w.release();
    const { ev } = runUntil(w, () => w.phase !== 'fly', 6);
    const ids = of(ev, 'fly').map(e => e.id).sort();
    assert.strictEqual(ids.join(), (s === 1 ? [900] : [900, 901]).join(), 'size ' + s + ' → ' + ids);
    assert.strictEqual(w.flyCount, ids.length);
  }
});

test('landing / bullseye / streak / big points; rain pad grows with size', () => {
  const w = clean('normal', 14);
  shoot(w, pullTo(w, w.wagon.x));
  let { ev } = runUntil(w, () => w.phase !== 'fly', 6);
  let l = of(ev, 'land')[0];
  assert.ok(l && l.bull && !l.big, 'bullseye'); assert.strictEqual(l.points, C.POINTS.land + C.POINTS.bull); assert.strictEqual(l.streak, 1);
  assert.strictEqual(w.score, 5);
  for (let i = 0; i < 100; i++) { steps(w, 1); if (w.phase === 'land') assert.ok(Math.abs(w.nubi.x - w.wagon.x) <= w.wagon.hw); }
  runUntil(w, e => e.some(x => x.type === 'newShot'), 3);
  w.flies.length = 0; w.crows.length = 0; steps(w, 120);
  shoot(w, pullTo(w, w.wagon.x + w.wagon.hw * 0.85));
  ev = runUntil(w, () => w.phase !== 'fly', 6).ev; l = of(ev, 'land')[0];
  assert.ok(l && !l.bull); assert.strictEqual(l.streak, 2); assert.strictEqual(l.points, C.POINTS.land + 1);
  // big shower
  w.streak = 10; runUntil(w, e => e.some(x => x.type === 'newShot'), 3); w.flies.length = 0; w.crows.length = 0; w.setSize(1.5); w.flies.length = 0; steps(w, 120);
  shoot(w, pullTo(w, w.wagon.x + w.wagon.hw * 0.85)); ev = runUntil(w, () => w.phase !== 'fly', 6).ev;
  l = of(ev, 'land')[0]; assert.ok(l.big);
  assert.strictEqual(l.points, C.POINTS.land + C.POINTS.big + C.POINTS.streakMax); assert.strictEqual(w.stats.bigShowers, 1);
  // rain pad: just past the edge plops at size 1 but lands at size 1.6
  for (const [s, want] of [[1, 'plop'], [1.6, 'land']]) {
    const g = clean('normal', 15, null, s), X = g.wagon.x + g.wagon.hw + W.padAt(1) + 0.12;
    shoot(g, pullTo(g, X, 45)); runUntil(g, () => g.phase !== 'fly', 6);
    assert.strictEqual(g.phase, want, 'size ' + s);
  }
});

test('plop → heart lost, Nubi settles on the grass, next shot; off the field is a plop too', () => {
  const w = clean('normal', 16);
  const h0 = w.hearts;
  shoot(w, pullTo(w, w.wagon.x - w.wagon.hw - 1.2));
  let { ev } = runUntil(w, () => w.phase !== 'fly', 6);
  assert.strictEqual(types(ev).slice(-2).join(), 'plop,heartLost');
  assert.strictEqual(w.hearts, h0 - 1); assert.strictEqual(of(ev, 'heartLost')[0].hearts, h0 - 1);
  assert.strictEqual(w.nubi.state, 'plop'); assert.strictEqual(w.streak, 0); assert.strictEqual(w.stats.plops, 1);
  steps(w, 100); near(w.nubi.y, C.GROUND_Y + C.FOOT * w.nubi.size * C.PLOP_SQUASH, 0.02, 'settled');
  ev = runUntil(w, e => e.some(x => x.type === 'newShot'), 3).ev;
  assert.strictEqual(of(ev, 'newShot')[0].retry, false);
  assert.strictEqual(w.phase, 'aim'); near(w.nubi.x, C.SLING.x, 1e-9);
  const w2 = clean('normal', 16); shoot(w2, { x: -1.8, y: -0.5 });
  ev = runUntil(w2, () => w2.phase !== 'fly', 6).ev; assert.ok(of(ev, 'plop').length === 1);
});

test('weak fling onto the hay bale = flop: no heart lost, the SAME shot is retried', () => {
  const w = mk('normal', 17), h0 = w.hearts, base = w.wagon.baseX, ids = w.flies.map(f => f.id).join();
  shoot(w, { x: -0.35, y: -0.1 });
  const { ev } = runUntil(w, () => w.phase !== 'fly', 4);
  assert.strictEqual(of(ev, 'flop').length, 1); assert.strictEqual(w.hearts, h0);
  const r = runUntil(w, e => e.some(x => x.type === 'newShot'), 3); assert.ok(r.t <= C.FLOP_T + 0.05);
  assert.strictEqual(of(r.ev, 'newShot')[0].retry, true);
  assert.strictEqual(w.wagon.baseX, base); assert.strictEqual(w.flies.map(f => f.id).join(), ids, 'same fireflies');
});

test('puff: once per flight, only when vy ≤ PUFF_VY, then vy = PUFF_VY; extends the flight', () => {
  const w = clean('normal', 18);
  const p = pullTo(w, w.wagon.x - w.wagon.hw - 1.5);
  const short = w.predictShot(p, 0);
  shoot(w, p);
  steps(w, 2); if (w.nubi.vy > C.PUFF_VY) { assert.strictEqual(w.puff(), false, 'ignored while shooting up'); assert.strictEqual(w.puffed, false); }
  steps(w, Math.round(0.9 / H));
  assert.ok(w.nubi.vy <= C.PUFF_VY); assert.ok(w.puff()); near(w.nubi.vy, C.PUFF_VY, 1e-12);
  assert.strictEqual(w.puff(), false); assert.strictEqual(w.flutter(), false);
  assert.strictEqual(w.nubi.state, 'puff');
  const ev = runUntil(w, () => w.phase !== 'fly', 6).ev;
  assert.strictEqual(of(ev, 'puff').length, 1); assert.strictEqual(w.stats.puffs, 1);
  assert.ok(w.nubi.x > short.x + 1.0, 'puff carried further: ' + w.nubi.x + ' vs ' + short.x);
});

test('crow bump: circle bounce (radius grows with size), tumble, then tilt follows velocity', () => {
  const w = clean('normal', 19, null, 1.4);
  const p = pullTo(w, w.wagon.x, 50); w.aim(p.x, p.y); const pt = w.preview(20, 0.05)[9];
  w.crows.push({ id: 77, x0: pt.x, vx: 0, baseY: pt.y, ph: Math.PI, t: 0, r: C.CROW_R, flap: 0, x: pt.x, y: pt.y, px: pt.x, py: pt.y });
  C.CROW_BOB_SAVE = C.CROW_BOB; C.CROW_BOB = 0;
  try {
    const pre = w.launchVelocity(p.x, p.y); w.release();
    const { ev } = runUntil(w, e => e.some(x => x.type === 'bump'), 2);
    assert.ok(of(ev, 'bump')[0], 'bumped'); assert.strictEqual(w.nubi.state, 'bonk');
    const g = w.crows[0];
    assert.ok(Math.hypot(w.nubi.x - g.x, w.nubi.y - g.y) >= C.R_NUBI * w.nubi.size + C.CROW_R - 0.02, 'pushed out');
    assert.ok(w.nubi.vx < pre.vx, 'velocity reflected');
    steps(w, Math.round(C.BONK_T / H) + 40);
    if (w.phase === 'fly') assert.ok(Math.abs(w.nubi.rot - Math.atan2(w.nubi.vy, Math.abs(w.nubi.vx)) * C.TILT) < 0.3, 'tilt eased back');
    assert.strictEqual(w.stats.bumps, 1);
  } finally { C.CROW_BOB = C.CROW_BOB_SAVE; delete C.CROW_BOB_SAVE; }
});

test('wagon: rolls smoothly, stays in range, ≥ 5 u from the sling', () => {
  for (const diff of ['easy', 'normal', 'hard']) for (let lv = 0; lv < 8; lv++) {
    const x = mk(diff, 20 + lv, { level: lv }); x.hearts = 1e6;
    const P = x.levelParams(lv), bot = new CFF.Bot(x, { skill: 0.6, seed: lv });
    for (let i = 0; i < 60 * 30; i++) {
      bot.step(1 / 60); x.update(1 / 60); x.drainEvents();
      if (x.level !== lv) break;
      const r = x.wagon;
      assert.ok(r.x >= P.xmin - 1e-6 && r.x <= P.xmax + 1e-6, diff + ' L' + lv + ' wagon x ' + r.x);
      assert.ok(r.x - C.SLING.x >= C.MIN_WAGON_DX - 1e-6); assert.ok(r.x + r.hw <= C.FIELD_W);
      assert.ok(Math.abs(r.x - r.px) < 0.1, 'smooth');
    }
  }
  assert.ok(mk('normal', 1, { level: 1 }).wagon.amp > 0, 'summer rolls');
  assert.strictEqual(mk('normal', 1, { level: 0 }).wagon.amp, 0, 'spring parked');
});

test('fireflies: on a solution arc FOR THE CURRENT SIZE (perfect shot gets them all and lands), gold ≈ 1 in 8', () => {
  let n = 0, gold = 0, all = 0;
  for (let seed = 1; seed <= 120; seed++) {
    const size = [1, 1.35, 1.7][seed % 3];
    const w = mk(['easy', 'normal', 'hard'][(seed >> 1) % 3], seed, { level: seed % 8, size });
    const L = w.flies;
    assert.ok(L.length >= 4 && L.length <= 7, 'count ' + L.length);
    for (const l of L) {
      assert.ok(l.y >= C.FLY_Y[0] - C.FLY_BOB && l.y <= C.FLY_Y[1] + C.FLY_BOB, 'y ' + l.y);
      assert.ok(l.x >= C.FLY_MIN_X && l.x <= C.FIELD_W, 'x ' + l.x);
      assert.ok(l.kind === 'fly' ? l.value === 1 : l.kind === 'gold' && l.value === 3);
      all++; if (l.kind === 'gold') gold++;
    }
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) assert.ok(Math.hypot(L[i].x - L[j].x, L[i].y0 - L[j].y0) >= C.FLY_GAP - 1e-9);
    const arc = L.filter(l => !l.bonus).length;
    assert.ok(arc >= 3, 'arc flies ' + arc);
    w.crows.length = 0; w.wagon.amp = 0; w.wagon.x = w.wagon.fromX = w.wagon.baseX;
    const pr = w.predictShot(w.solution.pull, w.solution.wait);
    assert.strictEqual(pr.type, 'land', 'solution lands (seed ' + seed + ', size ' + size + ')');
    assert.ok(pr.flies >= arc, 'solution collects ' + pr.flies + ' / ' + arc + ' (seed ' + seed + ')');
    n++;
  }
  assert.strictEqual(n, 120);
  const gp = gold / all; assert.ok(gp > 0.07 && gp < 0.19, 'gold share ' + gp);
});

test('crows: per level count, y band, never on the sling, slow drift with wrap', () => {
  assert.strictEqual(mk('normal', 1, { level: 0 }).crows.length, 0);
  assert.strictEqual(mk('normal', 1, { level: 2 }).crows.length, 1);
  assert.strictEqual(mk('normal', 1, { level: 3 }).crows.length, 2);
  const w = mk('normal', 2, { level: 3 }); w.hearts = 1e6;
  let wrapped = false;
  for (let i = 0; i < 60 / H; i++) {
    w.update(H); w.drainEvents();
    for (const g of w.crows) {
      assert.ok(g.y >= C.CROW_Y[0] - C.CROW_BOB - 1e-9 && g.y <= C.CROW_CLEAR_Y + C.CROW_BOB + 1e-9, 'crow y ' + g.y);
      if (g.x < C.SLING.x + 1.5) assert.ok(g.y - C.SLING.y > 2, 'above the sling: ' + g.y);
      if (Math.abs(g.x - g.px) > 5) wrapped = true; else assert.ok(Math.abs(g.x - g.px) < 1.0 * H * 1.3 + 1e-6, 'slow');
    }
  }
  assert.ok(wrapped, 'crows wrap around');
});

test('level up after DIFF.landings landings (after the rain phase, before newShot); zones and loops', () => {
  const w = mk('normal', 12); w.hearts = 1e6;
  const bot = new CFF.Bot(w, { skill: 1, seed: 2 }); const ev = [];
  for (let i = 0; i < 60 * 160 && w.level === 0; i++) { bot.step(1 / 60); w.update(1 / 60); ev.push(...w.drainEvents()); }
  assert.strictEqual(w.level, 1); assert.strictEqual(w.zone, 1); assert.strictEqual(w.levelLandings, 0);
  assert.strictEqual(of(ev, 'land').length, W.DIFF.normal.landings);
  const t = types(ev), iu = t.indexOf('levelUp');
  assert.strictEqual(t[iu + 1], 'newShot');
  assert.strictEqual(JSON.stringify(ev[iu]), JSON.stringify({ type: 'levelUp', zone: 1, level: 1, loop: 0 }));
  const g = mk('normal', 1); g.drainEvents(); g.gotoLevel(4);
  assert.strictEqual(types(g.drainEvents()).join(), 'levelUp,newShot');
  assert.strictEqual(g.zone, 0); assert.strictEqual(g.loop, 1);
  const p0 = g.levelParams(0), p4 = g.levelParams(4), p12 = g.levelParams(12), p16 = g.levelParams(16), p15 = g.levelParams(15), p3 = g.levelParams(3);
  assert.ok(p4.hw < p0.hw && p4.preview < p0.preview && p4.amp > p0.amp);
  assert.strictEqual(JSON.stringify(p16), JSON.stringify(p12), 'capped after LOOP_CAP');
  assert.ok(p15.hw < p3.hw && p15.hw > 0.8 && p15.preview >= 8);
});

test('a heart back every heartEvery fireflies (easy 12; capped at maxHearts)', () => {
  const w = mk('easy', 13); w.hearts = 2;
  const bot = new CFF.Bot(w, { skill: 1, seed: 4 }); const ev = [];
  for (let i = 0; i < 60 * 150 && w.flyCount < 25; i++) { bot.step(1 / 60); w.update(1 / 60); ev.push(...w.drainEvents()); }
  const g = of(ev, 'heartGain');
  assert.ok(g.length >= 2, 'gains ' + g.length);
  const idx = ev.indexOf(g[0]); assert.strictEqual(ev[idx - 1].type, 'fly'); assert.strictEqual(ev[idx - 1].count, W.DIFF.easy.heartEvery);
  assert.strictEqual(g[0].hearts, 3);
  const f = mk('easy', 13); f.flyCount = W.DIFF.easy.heartEvery - 1; f.drainEvents();
  f._hit('fly', { x: 0, y: 0, value: 1, kind: 'fly' }); assert.strictEqual(of(f.drainEvents(), 'heartGain').length, 0, 'full hearts: no gain');
  assert.strictEqual(f.hearts, f.maxHearts);
  assert.deepStrictEqual([W.DIFF.easy.heartEvery, W.DIFF.normal.heartEvery, W.DIFF.hard.heartEvery], [12, 20, 25]);
});

test('game over after the last heart; the world freezes', () => {
  for (const diff of ['easy', 'normal', 'hard']) {
    const w = clean(diff, 14); const ev = [];
    assert.strictEqual(w.hearts, W.DIFF[diff].hearts);
    for (let s = 0; s < 10 && w.phase !== 'over'; s++) {
      runUntil(w, () => w.phase === 'aim', 3); if (w.phase === 'over') break;
      w.crows.length = 0; shoot(w, { x: -1.8, y: -1.0 });                    // far too long (off the field)
      ev.push(...runUntil(w, () => w.phase === 'aim' || w.phase === 'over', 9).ev);
    }
    assert.strictEqual(w.phase, 'over'); assert.strictEqual(w.hearts, 0);
    assert.strictEqual(of(ev, 'plop').length, W.DIFF[diff].hearts);
    const go = of(ev, 'gameOver'); assert.strictEqual(go.length, 1); assert.strictEqual(go[0].score, w.score);
    const s = JSON.stringify(w.getState()); steps(w, 240); assert.strictEqual(JSON.stringify(w.getState()), s);
    w.aim(-1, -1); assert.strictEqual(w.pull, null);
  }
});

test('update(): fixed steps with accumulator, alpha, prev positions', () => {
  const w = clean(); shoot(w, pullTo(w, w.wagon.x));
  w.update(H * 2.5); near(w.alpha, 0.5, 1e-6);
  assert.ok(w.nubi.px !== w.nubi.x);
  const a = clean('normal', 2), b = clean('normal', 2); shoot(a, pullTo(a, a.wagon.x)); shoot(b, pullTo(b, b.wagon.x));
  for (let i = 0; i < 120; i++) a.update(1 / 60);
  for (let i = 0; i < 240; i++) b.update(1 / 120);
  near(a.nubi.x, b.nubi.x, 1e-9); near(a.nubi.y, b.nubi.y, 1e-9); near(a.nubi.size, b.nubi.size, 1e-12);
  const st = a.getState(); assert.strictEqual(JSON.stringify(JSON.parse(JSON.stringify(st))), JSON.stringify(st));
  for (const k of ['phase', 'nubi', 'wagon', 'flies', 'crows', 'score', 'hearts', 'stats', 'level', 'zone', 'loop', 'flyCount']) assert.ok(k in st, k);
});

const BOT = {};
test('bot: skill 1 lands ≥ 95 % on every difficulty; skill 0.85 ≈ 85 % (mean 80–90 %, each 72–95 %)', () => {
  const rate = (skill, diff) => { let l = 0, s = 0; for (let seed = 1; seed <= 4; seed++) { const { w } = playBot(diff, seed, skill, 200, { immortal: true }); l += w.stats.landings; s += w.stats.shots; } return l / s; };
  const line = [];
  for (const diff of ['easy', 'normal', 'hard']) {
    const r1 = rate(1, diff), r85 = rate(0.85, diff); BOT[diff] = { r1, r85 };
    line.push(diff + ' ' + (100 * r1).toFixed(1) + ' / ' + (100 * r85).toFixed(1) + ' %');
    assert.ok(r1 >= 0.95, diff + ' skill 1: ' + r1);
    assert.ok(r85 >= 0.72 && r85 <= 0.95, diff + ' skill 0.85: ' + r85);
  }
  const mean = (BOT.easy.r85 + BOT.normal.r85 + BOT.hard.r85) / 3;
  assert.ok(mean >= 0.8 && mean <= 0.9, 'skill 0.85 mean ' + mean);
  console.log('      bot land rate (skill 1 / 0.85): ' + line.join(', '));
});

test('bot: thinks, animates the pull over ~0.5 s, then releases', () => {
  const w = mk('normal', 15), bot = new CFF.Bot(w, { skill: 1, seed: 1 }); const dt = 1 / 60;
  let t = 0, firstPull = -1, launch = -1;
  while (t < 3 && launch < 0) {
    bot.step(dt); w.update(dt); t += dt;
    for (const e of w.drainEvents()) { if (e.type === 'pull') firstPull = t; if (e.type === 'launch') launch = t; }
  }
  assert.ok(firstPull >= CFF.Bot.THINK[0] && firstPull <= CFF.Bot.THINK[1] + 0.05, 'think ' + firstPull);
  near(launch - firstPull, CFF.Bot.AIM_T, 0.05, 'aim time');
});

test('first level is easy: casual kid model and a skill-0.5 bot land most Spring shots from attempt 3', () => {
  let L = 0, N = 0; const by = [[0, 0], [0, 0], [0, 0]];
  for (let s = 1; s <= 150; s++) {
    for (const x of playKid(s, 'easy', 0, 40).res) {
      if (x.level !== 0) continue;
      const i = Math.min(2, x.shot); by[i][0] += x.land; by[i][1]++;
      if (x.shot >= 2) { L += x.land; N++; }
    }
  }
  const r = L / N;
  let bl = 0, bn = 0;
  for (let s = 1; s <= 30; s++) { const { res } = playBot('easy', s, 0.5, 60, { immortal: true, untilLevel: 1 }); res.slice(2).forEach(x => { bl += x.land; bn++; }); }
  console.log('      kid on Spring easy: shot 1 ' + (100 * by[0][0] / by[0][1]).toFixed(0) + ' %, shot 2 ' + (100 * by[1][0] / by[1][1]).toFixed(0) +
    ' %, shot 3+ ' + (100 * r).toFixed(1) + ' %; bot 0.5 shot 3+ ' + (100 * bl / bn).toFixed(1) + ' %');
  assert.ok(r >= 0.7 && r <= 0.95, 'kid rate ' + r);
  assert.ok(bl / bn > 0.5, 'bot 0.5 rate ' + bl / bn);
});

test('weather: bounded ≤ 160, deterministic, sprites, layers, burst physics, season ambients', () => {
  const run = seed => {
    const wx = new CFF.Weather({ width: 1280, height: 720, seed }); let max = 0; const sprites = new Set();
    for (let z = 0; z < 8; z++) {
      wx.setLevel(z % 4, { instant: z === 0 });
      for (let i = 0; i < 600; i++) {
        if (i % 7 === 0) for (const k of ['plop', 'fly', 'land', 'bump', 'puff', 'grow']) wx.burst(k, 300 + i, 400, 12, { width: 120 });
        wx.update(1 / 60);
        max = Math.max(max, wx.particles.length);
        for (const p of wx.particles) {
          sprites.add(p.sprite);
          assert.ok(p.alpha >= -1e-9 && p.alpha <= 1 + 1e-9, 'alpha ' + p.alpha + ' ' + p.kind);
          assert.ok(['sky', 'back', 'front'].includes(p.layer));
          const u = 720 / 9;
          assert.ok(isFinite(p.x) && isFinite(p.y) && p.size > 0 && p.size <= (p.burst ? 1.2 : 0.5) * u + 1e-9, p.kind + ' size ' + p.size);
        }
      }
    }
    wx.resize(700, 1200); wx.update(1 / 60);
    return { max, sprites, sig: JSON.stringify(wx.particles.slice(0, 20)) };
  };
  const a = run(3), b = run(3);
  assert.ok(a.max <= CFF.Weather.CAP, 'max ' + a.max); assert.strictEqual(a.sig, b.sig);
  const known = ['sparkle', 'drop', 'snow', 'ripple', 'star', 'firefly', 'petal', 'butterfly', 'puff', 'leafbit', 'glow'].map(s => 'p_' + s);
  for (const s of a.sprites) assert.ok(known.includes(s), 'sprite ' + s);
  for (const s of known) assert.ok(a.sprites.has(s), 'used ' + s);
  // season ambients + tiny fireflies everywhere (layer back)
  const has = (z, kinds) => { const wx = new CFF.Weather({ width: 960, height: 540, seed: 1 }); wx.setLevel(z, { instant: true }); for (let i = 0; i < 30; i++) wx.update(1 / 60);
    for (const k of kinds) assert.ok(wx.particles.some(p => p.kind === k), 'zone ' + z + ' has ' + k);
    assert.ok(wx.particles.filter(p => p.kind === 'firefly').every(p => p.layer === 'back')); return wx; };
  has(0, ['petal', 'butterfly', 'firefly']); has(1, ['butterfly', 'sparkle', 'firefly']); has(2, ['leaf', 'firefly']);
  const wn = has(3, ['snowFar', 'snowMid', 'snowNear', 'firefly']);
  const sp = k => wn.particles.filter(p => p.kind === k).reduce((s, p) => s + p.vy, 0) / wn.particles.filter(p => p.kind === k).length;
  assert.ok(sp('snowFar') < sp('snowMid') && sp('snowMid') < sp('snowNear'), 'parallax: near flakes fall faster');
  assert.ok(wn.particles.filter(p => p.kind === 'snowFar').every(p => p.layer === 'sky') && wn.particles.filter(p => p.kind === 'snowNear').every(p => p.layer === 'front'));
  // autumn leaves: pendulum (rot swings + spin), sideways speed slows at the swing ends
  const au = new CFF.Weather({ width: 960, height: 540, seed: 4 }); au.setLevel(2, { instant: true });
  const lf = au.particles.find(p => p.kind === 'leaf'); let xs = [];
  for (let i = 0; i < 240; i++) { const x0 = lf.x; au.update(1 / 60); xs.push((lf.x - x0) * 60); }
  assert.ok(Math.max(...xs) - Math.min(...xs) > 20, 'sway speed varies ' + (Math.max(...xs) - Math.min(...xs)));
  assert.ok(Math.min(...xs) < 0 || lf.vx > 0, 'swings');
  // rain shower: drops fall with gravity and end in ripples on the soil; winter snows instead
  const s = new CFF.Weather({ width: 960, height: 540, seed: 2 }); s.particles.length = 0; s._topUp = () => {};
  s.burst('land', 480, 300, 10, { width: 200, fall: 60 });
  const drops = s.particles.filter(p => p.kind === 'drop'); assert.strictEqual(drops.length, 10);
  const xsD = drops.map(p => p.x); assert.ok(Math.max(...xsD) - Math.min(...xsD) > 150, 'spread over the width');
  const d0 = drops[0], vy0 = d0.vy; d0.delay = 0; s.update(0.05); assert.ok(d0.vy > vy0, 'gravity');
  let ripples = 0; for (let i = 0; i < 40; i++) { s.update(0.05); ripples = Math.max(ripples, s.particles.filter(p => p.kind === 'ripple').length); }
  assert.ok(ripples > 0, 'ripples'); assert.ok(s.particles.every(p => p.y <= 362), 'nothing falls through the soil');
  for (let i = 0; i < 30; i++) s.update(0.1);
  assert.strictEqual(s.particles.length, 0, 'bursts end');
  const sn = new CFF.Weather({ width: 960, height: 540, seed: 2 }); sn.setLevel(3, { instant: true }); sn.particles.length = 0; sn._topUp = () => {};
  sn.burst('land', 480, 300, 6, { width: 100 }); assert.ok(sn.particles.every(p => p.sprite === 'p_snow'), 'winter snows');
  sn.particles.length = 0; sn.burst('grow', 480, 300, 8, { r: 40 });
  const g = sn.particles; const r0 = g.map(p => Math.hypot(p.x - 480, p.y - 300)); sn.update(0.1);
  assert.ok(g.every((p, i) => Math.hypot(p.x - 480, p.y - 300) > r0[i]), 'grow ring expands');
});

test('10 simulated minutes (bot + world + weather) in ~2 s', () => {
  const t0 = Date.now();
  const w = mk('normal', 16); w.hearts = w.maxHearts = 1e6;
  const bot = new CFF.Bot(w, { skill: 0.85, seed: 1 }), wx = new CFF.Weather({ width: 960, height: 540, seed: 1 });
  for (let i = 0; i < 600 * 60; i++) {
    bot.step(1 / 60); w.update(1 / 60); wx.update(1 / 60);
    for (const e of w.drainEvents()) {
      if (e.type === 'fly') wx.burst('fly', 400, 200, 6); else if (e.type === 'land') wx.burst('land', 500, 300, 8, { width: 100 });
      else if (e.type === 'levelUp') wx.setLevel(e.zone);
    }
    if (i % 2 === 0 && w.phase === 'aim' && w.pull) w.preview();
  }
  const ms = Date.now() - t0;
  console.log('      10 min simulated in ' + ms + ' ms; level ' + w.level + ', landings ' + w.stats.landings + '/' + w.stats.shots + ', max size ' + w.stats.maxSize.toFixed(2));
  assert.ok(ms < 3000, ms + ' ms'); assert.ok(w.level >= 8);
});

// ---------- long report (--stats) ----------
function report() {
  console.log('\n--- stats ---');
  for (const skill of [1, 0.85, 0.6, 0.5]) for (const diff of ['easy', 'normal', 'hard']) {
    let l = 0, s = 0, lv = [], flies = 0, bumps = 0, pf = 0, big = 0, ms = 0;
    for (let seed = 1; seed <= 6; seed++) { const r = playBot(diff, seed, skill, 300, { immortal: true }); l += r.w.stats.landings; s += r.w.stats.shots; lv.push(...r.lv); flies += r.w.stats.flies; bumps += r.w.stats.bumps; pf += r.w.stats.puffs; big += r.w.stats.bigShowers; ms += r.w.stats.maxSize; }
    console.log(`bot ${skill} ${diff}: land ${(100 * l / s).toFixed(1)} %, flies/shot ${(flies / s).toFixed(2)}, bumps/shot ${(bumps / s).toFixed(2)}, puffs/shot ${(pf / s).toFixed(2)}, big/landing ${(big / l).toFixed(2)}, max size ${(ms / 6).toFixed(2)}, s/level ${(lv.reduce((a, b) => a + b, 0) / lv.length).toFixed(1)}`);
  }
  for (const diff of ['easy', 'normal', 'hard']) {
    const per = [[], [], [], []], land = [[0, 0], [0, 0], [0, 0], [0, 0]];
    for (let s = 1; s <= 40; s++) { const { lv, res } = playKid(s, diff, 0, 600); for (const x of lv) per[x.level % 4].push(x.t); for (const x of res) { land[x.level % 4][0] += x.land; land[x.level % 4][1]++; } }
    console.log('kid ' + diff + ': ' + per.map((a, i) => W.LEVELS[i].key + ' ' + (a.reduce((p, q) => p + q, 0) / a.length).toFixed(0) + ' s (land ' + (100 * land[i][0] / land[i][1]).toFixed(0) + ' %)').join(' | '));
  }
}

// ---------- run ----------
let fail = 0; const T0 = Date.now();
for (const t of tests) {
  const t1 = Date.now();
  try { t.fn(); console.log('PASS  ' + t.name + '  (' + (Date.now() - t1) + ' ms)'); }
  catch (e) { fail++; console.log('FAIL  ' + t.name + '\n      ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n      ') : e)); }
}
console.log('\n' + (tests.length - fail) + '/' + tests.length + ' passed in ' + (Date.now() - T0) + ' ms');
if (process.argv.includes('--stats')) report();
process.exit(fail ? 1 : 0);
