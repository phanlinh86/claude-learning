#!/usr/bin/env node
// Finn's Island Fling — headless unit tests for rng / world / weather / bot (node, no deps).
// Run from projects/daily-game/fox-island-fling:   node tests/unit/run.js        (add --stats for the long report)
'use strict';
const assert = require('assert');
const { load } = require('./load');

const FIF = load();
const W = FIF.World, C = W.CONFIG, H = C.STEP, DEG = Math.PI / 180;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const near = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, (m || '') + ' got ' + a + ' want ' + b + ' ±' + tol);

// ---------- helpers ----------
function mk(diff, seed, extra) { return new W(Object.assign({ seed: seed || 1, difficulty: diff || 'normal' }, extra || {})); }
/** a world with no leaves / gulls on the field */
function clean(diff, seed, extra) { const w = mk(diff, seed, extra); w.leaves.length = 0; w.gulls.length = 0; w.drainEvents(); return w; }
function steps(w, n) { const ev = []; for (let i = 0; i < n; i++) { w.update(H); ev.push(...w.drainEvents()); } return ev; }
function runUntil(w, pred, max) {
  const ev = []; let t = 0; max = max || 10;
  while (t < max) { w.update(H); t += H; const e = w.drainEvents(); ev.push(...e); if (pred(e, w)) break; }
  return { ev, t };
}
const of = (ev, t) => ev.filter(e => e.type === t);
const types = ev => ev.map(e => e.type);
/** the exact pull that lands the fox at raft x X (angle a°) */
function pullTo(X, a) { const s = W.solveSpeed((a || 48) * DEG, X, C.RAFT_TOP + C.FOOT); assert.ok(s && s.pull, 'solvable'); return s.pull; }
function shoot(w, pull) { w.aim(pull.x, pull.y); assert.ok(w.release(), 'released'); }
function playBot(diff, seed, skill, maxS, opts) {
  opts = opts || {};
  const w = mk(diff, seed, opts.world);
  if (opts.immortal) w.hearts = w.maxHearts = 1e6;
  const bot = new FIF.Bot(w, { skill, seed: seed * 7 + 1 });
  const dt = 1 / 60; let t = 0, last = 0; const lv = [], ev = [];
  while (w.phase !== 'over' && t < maxS) {
    bot.step(dt); w.update(dt); t += dt;
    for (const e of w.drainEvents()) { if (opts.keep) ev.push(e); if (e.type === 'levelUp') { lv.push(t - last); last = t; } }
  }
  return { w, t, lv, bot, ev };
}

// ---------- casual kid model ----------
// A 4–6-year-old: thinks 1.5–3.5 s, picks a random-ish angle (28°–62°), drags until the visible preview "points at"
// the raft where it is NOW (no lead for drift), with hand error σ = KID_SIG u in the target point plus a power error
// that grows when the preview is too short to show the landing; shots 1 and 2 are clumsier (×1.7, ×1.3). It taps
// (flutter) at a random moment in 25 % of the flights.
const KID_SIG = 0.9;
function kidPull(w, r, shot) {
  const learn = shot === 0 ? 1.7 : shot === 1 ? 1.3 : 1;
  const ang = r.range(28, 62) * DEG, target = w.raft.x + r.gauss() * KID_SIG * learn;
  const landAt = L => {
    const p = { x: -Math.cos(ang) * L, y: -Math.sin(ang) * L }, v = w.launchVelocity(p.x, p.y);
    const x0 = C.SLING.x + p.x, y0 = C.SLING.y + p.y, yc = C.RAFT_TOP + C.FOOT;
    const T = (v.vy + Math.sqrt(v.vy * v.vy + 2 * C.G * (y0 - yc))) / C.G;
    return { x: x0 + v.vx * T, T };
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
  const r = new FIF.RNG(seed * 13 + 5), dt = 1 / 60;
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
    } else if (w.phase === 'fly') { tt += dt; if (fl > 0 && tt >= fl) w.flutter(); }
    else if (st !== 'think') { st = 'think'; tt = 0; think = r.range(1.5, 3.5); drag = r.range(0.7, 1.4); }
    w.update(dt); t += dt;
    for (const e of w.drainEvents()) {
      if (e.type === 'land' || e.type === 'splash' || e.type === 'flop') { res.push({ shot, land: e.type === 'land', level: w.level }); shot++; }
      if (e.type === 'levelUp') { lv.push({ level: e.level - 1, t: t - last }); last = t; }
    }
  }
  return { res, lv, w };
}

// ================= tests =================
test('rng: deterministic, ranges', () => {
  const a = new FIF.RNG(42), b = new FIF.RNG(42);
  for (let i = 0; i < 100; i++) assert.strictEqual(a.next(), b.next());
  const r = new FIF.RNG('x');
  for (let i = 0; i < 500; i++) { const v = r.int(3, 5); assert.ok(v >= 3 && v <= 5); }
});

test('determinism: same seed → same states and events; another seed differs', () => {
  const sig = seed => { const { w, ev } = playBot('normal', seed, 0.7, 90, { keep: true }); return JSON.stringify(w.getState()) + JSON.stringify(ev); };
  assert.strictEqual(sig(5), sig(5));
  assert.notStrictEqual(sig(5), sig(6));
  const w1 = mk('easy', 9), w2 = mk('easy', 9);
  assert.strictEqual(JSON.stringify(w1.getState()), JSON.stringify(w2.getState()));
});

test('launch velocity: v = −pull/PULL_MAX·VMAX, clamps', () => {
  const w = mk();
  const v = w.launchVelocity(-0.9, -0.6);
  near(v.vx, 0.9 / C.PULL_MAX * C.VMAX, 1e-9); near(v.vy, 0.6 / C.PULL_MAX * C.VMAX, 1e-9);
  const big = w.launchVelocity(-5, -1);                                   // clamped to PULL_MAX length
  near(Math.hypot(big.vx, big.vy), C.VMAX, 1e-9);
  const low = w.launchVelocity(-0.5, -3);                                 // fox never below sling.y − 1.4
  near(low.vy, C.PULL_DOWN / C.PULL_MAX * C.VMAX, 1e-9);
  const fwd = w.launchVelocity(1, -1);                                    // can't pull in front of the fork
  assert.ok(fwd.vx >= 0);
  w.aim(-5, -5); assert.ok(Math.hypot(w.pull.x, w.pull.y) <= C.PULL_MAX + 1e-9); assert.ok(w.pull.y >= -C.PULL_DOWN - 1e-9);
  near(w.fox.x, C.SLING.x, 1e-9); steps(w, 1); near(w.fox.x, C.SLING.x + w.pull.x, 1e-9); assert.strictEqual(w.fox.state, 'pull');
});

test('aim: first call emits pull; tiny pull release cancels; cancelAim', () => {
  const w = clean();
  w.aim(-0.1, -0.1); w.aim(-0.15, -0.1);
  assert.strictEqual(types(w.drainEvents()).join(), 'pull');
  assert.strictEqual(w.release(), false); assert.strictEqual(w.pull, null); assert.strictEqual(w.phase, 'aim');
  w.aim(-1, -1); w.cancelAim(); assert.strictEqual(w.pull, null); assert.strictEqual(w.previewCount(), 0);
});

test('preview matches the real flight point for point', () => {
  const w = clean('normal', 3);
  const p = pullTo(w.raft.x, 50); w.aim(p.x, p.y);
  const dt = 5 * H, pts = w.preview(60, dt);
  assert.ok(pts.length > 10);
  w.release(); const got = [];
  for (let i = 0; i < pts.length && w.phase === 'fly'; i++) { steps(w, 5); if (w.phase === 'fly') got.push({ x: w.fox.x, y: w.fox.y }); }
  assert.ok(got.length >= pts.length - 2);
  for (let i = 0; i < got.length; i++) { near(got[i].x, pts[i].x, 1e-6, 'x' + i); near(got[i].y, pts[i].y, 1e-6, 'y' + i); }
  // previewCount: per level, shorter on later islands
  const a = mk('normal', 1, { level: 0 }), b = mk('normal', 1, { level: 3 });
  a.aim(-1, -1); b.aim(-1, -1);
  assert.ok(a.previewCount() > b.previewCount());
  assert.strictEqual(a.previewCount(), Math.round(W.LEVELS[0].PREVIEW));
});

test('ballistic arc = analytic parabola; solveSpeed lands where it says', () => {
  for (const ang of [32, 45, 60]) {
    const w = clean('normal', 4);
    w.raft.amp = 0;
    const X = w.raft.x, s = W.solveSpeed(ang * DEG, X, C.RAFT_TOP + C.FOOT);
    shoot(w, s.pull);
    let t = 0, maxErr = 0;
    while (w.phase === 'fly') {
      steps(w, 1); t += H;
      if (w.phase !== 'fly') break;
      const ex = s.x0 + s.vx * t, ey = s.y0 + s.vy * t - 0.5 * C.G * t * t;
      maxErr = Math.max(maxErr, Math.hypot(w.fox.x - ex, w.fox.y - ey));
    }
    assert.ok(maxErr < 1e-6, 'arc error ' + maxErr);
    near(t, s.T, 2 * H, 'flight time');
    assert.strictEqual(w.phase, 'land');
    near(w.fox.x, X, 0.12, 'lands on the aimed spot');
  }
  // flights are 1.4–2.2 s on the generated solution arcs
  const Ts = [];
  for (let seed = 1; seed < 80; seed++) { const w = mk('normal', seed, { level: seed % 4 }); if (w.solution) Ts.push(w.solution.T); }
  const mean = Ts.reduce((a, b) => a + b, 0) / Ts.length;
  assert.ok(mean > 1.3 && mean < 2.2, 'mean flight ' + mean);
});

test('leaf pickup: on the path is collected (value, count), just outside is not', () => {
  const w = clean('normal', 5);
  const s = W.solveSpeed(48 * DEG, w.raft.x, C.RAFT_TOP + C.FOOT), t = 0.6;
  const x = s.x0 + s.vx * t, y = s.y0 + s.vy * t - 0.5 * C.G * t * t;
  const vy = s.vy - C.G * t, vl = Math.hypot(s.vx, vy), nx = -vy / vl, ny = s.vx / vl;
  const R = C.R_FOX + C.R_LEAF;
  w.leaves.push({ id: 900, x: x + nx * (R - 0.05), y: y + ny * (R - 0.05), y0: y + ny * (R - 0.05), px: 0, py: 0, kind: 'leaf', value: 1, taken: false, t: 0, ph: -Math.PI / 2 * 0 });
  w.leaves.push({ id: 901, x: x - nx * (R + 0.12), y: y - ny * (R + 0.12), y0: y - ny * (R + 0.12), px: 0, py: 0, kind: 'leaf', value: 1, taken: false, t: 0, ph: 0 });
  w.leaves.forEach(l => { l.y0 = l.y; l.ph = Math.PI; });                // sin(π) = 0 at t = 0; bob ≤ 0.06 u
  shoot(w, s.pull);
  const { ev } = runUntil(w, () => w.phase !== 'fly', 5);
  const lv = of(ev, 'leaf');
  assert.strictEqual(lv.length, 1); assert.strictEqual(lv[0].id, 900); assert.strictEqual(lv[0].value, 1); assert.strictEqual(lv[0].count, 1);
  assert.strictEqual(w.leafCount, 1); assert.strictEqual(w.leaves.length, 1);
});

test('landing / bullseye / streak points', () => {
  const w = clean('normal', 6); w.raft.amp = 0;
  shoot(w, pullTo(w.raft.x));
  let { ev } = runUntil(w, () => w.phase !== 'fly', 5);
  let l = of(ev, 'land')[0];
  assert.ok(l && l.bull, 'bullseye'); assert.strictEqual(l.points, C.POINTS.land + C.POINTS.bull); assert.strictEqual(l.streak, 1);
  assert.strictEqual(w.score, 5); assert.strictEqual(w.fox.state, 'land');
  // stays on the deck while riding the raft
  for (let i = 0; i < 100; i++) { steps(w, 1); if (w.phase === 'land') assert.ok(Math.abs(w.fox.x - w.raft.x) <= w.raft.hw); }
  runUntil(w, e => e.some(x => x.type === 'newShot'), 3);
  // edge landing: no bull; streak 2 → +1
  w.leaves.length = 0; w.gulls.length = 0; w.raft.amp = 0; steps(w, 120);
  shoot(w, pullTo(w.raft.x + w.raft.hw * 0.85));
  ev = runUntil(w, () => w.phase !== 'fly', 5).ev; l = of(ev, 'land')[0];
  assert.ok(l && !l.bull); assert.strictEqual(l.streak, 2); assert.strictEqual(l.points, C.POINTS.land + 1);
  // streak bonus caps at +4
  w.streak = 10; runUntil(w, e => e.some(x => x.type === 'newShot'), 3); w.leaves.length = 0; w.gulls.length = 0; w.raft.amp = 0; steps(w, 120);
  shoot(w, pullTo(w.raft.x + w.raft.hw * 0.85)); ev = runUntil(w, () => w.phase !== 'fly', 5).ev;
  assert.strictEqual(of(ev, 'land')[0].points, C.POINTS.land + C.POINTS.streakMax);
});

test('splash → heart lost, fox sinks to the water line, next shot', () => {
  const w = clean('normal', 7); w.raft.amp = 0;
  const h0 = w.hearts;
  shoot(w, pullTo(w.raft.x - w.raft.hw - 1.2));
  let { ev } = runUntil(w, () => w.phase !== 'fly', 5);
  assert.strictEqual(types(ev).slice(-2).join(), 'splash,heartLost');
  assert.strictEqual(w.hearts, h0 - 1); assert.strictEqual(of(ev, 'heartLost')[0].hearts, h0 - 1);
  assert.strictEqual(w.fox.state, 'splash'); assert.strictEqual(w.streak, 0);
  steps(w, 100); near(w.fox.y, C.SEA_Y + C.SPLASH_SINK, 0.02, 'sunk');
  ev = runUntil(w, e => e.some(x => x.type === 'newShot'), 3).ev;
  assert.strictEqual(w.phase, 'aim'); near(w.fox.x, C.SLING.x, 1e-9);
  // flying off the right edge is a splash too
  const w2 = clean('normal', 7); shoot(w2, { x: -1.8, y: -0.5 });
  ev = runUntil(w2, () => w2.phase !== 'fly', 6).ev; assert.ok(of(ev, 'splash').length === 1);
});

test('weak fling onto the beach rock = flop (no heart lost, retry)', () => {
  const w = clean('normal', 8), h0 = w.hearts;
  shoot(w, { x: -0.35, y: -0.1 });
  const { ev } = runUntil(w, () => w.phase !== 'fly', 4);
  assert.strictEqual(of(ev, 'flop').length, 1); assert.strictEqual(w.hearts, h0);
  const r = runUntil(w, e => e.some(x => x.type === 'newShot'), 3); assert.ok(r.t <= C.FLOP_T + 0.05);
});

test('flutter: once per flight, vy = max(vy,0) + FLUTTER_VY, extends the flight', () => {
  const w = clean('normal', 9); w.raft.amp = 0;
  const p = pullTo(w.raft.x - w.raft.hw - 1.5);
  const short = w.predictShot(p, 0);
  shoot(w, p); steps(w, Math.round(0.9 / H));
  const vy0 = w.fox.vy; assert.ok(w.flutter()); near(w.fox.vy, Math.max(vy0, 0) + C.FLUTTER_VY, 1e-9);
  assert.strictEqual(w.flutter(), false);
  assert.strictEqual(w.fox.state, 'flutter');
  const ev = runUntil(w, () => w.phase !== 'fly', 5).ev;
  assert.strictEqual(of(ev, 'flutter').length, 1);
  assert.ok(w.fox.x > short.x + 1.5, 'flutter carried further: ' + w.fox.x + ' vs ' + short.x);
});

test('gull bump: circle bounce, tumble, then nose follows velocity', () => {
  const w = clean('normal', 10); w.raft.amp = 0;
  const s = W.solveSpeed(50 * DEG, w.raft.x, C.RAFT_TOP + C.FOOT), t = 0.5;
  const gx = s.x0 + s.vx * t, gy = s.y0 + s.vy * t - 0.5 * C.G * t * t;
  w.gulls.push({ id: 77, x0: gx, vx: 0, baseY: gy, ph: Math.PI, t: 0, r: C.GULL_R, flap: 0, x: gx, y: gy, px: gx, py: gy });
  W.CONFIG.GULL_BOB_SAVE = C.GULL_BOB; C.GULL_BOB = 0;
  try {
    shoot(w, s.pull);
    const pre = { vx: w.fox.vx };
    const { ev } = runUntil(w, e => e.some(x => x.type === 'bump'), 2);
    const b = of(ev, 'bump')[0]; assert.ok(b, 'bumped');
    assert.strictEqual(w.fox.state, 'bonk');
    const gl = w.gulls[0];
    assert.ok(Math.hypot(w.fox.x - gl.x, w.fox.y - gl.y) >= C.R_FOX + C.GULL_R - 0.05, 'pushed out');
    assert.ok(w.fox.vx < pre.vx, 'velocity reflected');
    steps(w, Math.round(C.BONK_T / H) + 40);
    if (w.phase === 'fly') {
      const target = Math.atan2(w.fox.vy, w.fox.vx);
      let d = w.fox.rot - target; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      assert.ok(Math.abs(d) < 0.5, 'rot eased back toward velocity ' + d);
    }
    assert.ok(w.stats.bumps === 1);
  } finally { C.GULL_BOB = W.CONFIG.GULL_BOB_SAVE; delete W.CONFIG.GULL_BOB_SAVE; }
});

test('fox rotation eases toward the flight angle', () => {
  const w = clean('normal', 11); shoot(w, pullTo(w.raft.x, 55));
  steps(w, 60);
  const target = Math.atan2(w.fox.vy, w.fox.vx);
  assert.ok(Math.abs(w.fox.rot - target) < 0.2, 'rot ' + w.fox.rot + ' vs ' + target);
  assert.ok(Math.abs(w.fox.rot - w.fox.prot) < 0.1, 'smooth per step');
});

test('raft: drifts smoothly, stays in range, ≥ 5 u from the sling', () => {
  for (const diff of ['easy', 'normal', 'hard']) for (let lv = 0; lv < 8; lv++) {
    const x = mk(diff, 20 + lv, { level: lv }); x.hearts = 1e6;
    const P = x.levelParams(lv);
    const bot = new FIF.Bot(x, { skill: 0.6, seed: lv });
    for (let i = 0; i < 60 * 40; i++) {
      bot.step(1 / 60); x.update(1 / 60); x.drainEvents();
      if (x.level !== lv) break;
      const r = x.raft;
      assert.ok(r.x >= P.xmin - 1e-6 && r.x <= P.xmax + 1e-6, diff + ' L' + lv + ' raft x ' + r.x + ' ∉ [' + P.xmin + ',' + P.xmax + ']');
      assert.ok(r.x - C.SLING.x >= C.MIN_RAFT_DX - 1e-6);
      assert.ok(r.x + r.hw <= C.FIELD_W);
      assert.ok(Math.abs(r.x - r.px) < 0.1, 'smooth (< 12 u/s, glide included)');
    }
  }
  const w = mk('normal', 1, { level: 1 }); assert.ok(w.raft.amp > 0, 'jungle drifts');
  assert.strictEqual(mk('normal', 1, { level: 0 }).raft.amp, 0, 'cove still');
});

test('leaves: on a solution arc that lands on the raft, inside the safe band', () => {
  let n = 0;
  for (let seed = 1; seed <= 120; seed++) {
    const w = mk(['easy', 'normal', 'hard'][seed % 3], seed, { level: seed % 8 });
    const L = w.leaves;
    assert.ok(L.length >= 3 && L.length <= 7, 'count ' + L.length);
    for (const l of L) {
      assert.ok(l.y >= C.LEAF_Y[0] - C.LEAF_BOB && l.y <= C.LEAF_Y[1] + C.LEAF_BOB, 'y ' + l.y);
      assert.ok(l.x >= C.LEAF_MIN_X && l.x <= C.FIELD_W, 'x ' + l.x);
      assert.ok(!(l.x < C.ROCK_X + 0.5 && l.y < C.SLING.y + 1.5) || l.x >= C.LEAF_MIN_X, 'not in the sling area');
      assert.strictEqual(l.kind, 'leaf'); assert.strictEqual(l.value, 1);
    }
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) assert.ok(Math.hypot(L[i].x - L[j].x, L[i].y0 - L[j].y0) >= C.LEAF_GAP - 1e-9);
    const arc = L.filter(l => !l.bonus).length;
    assert.ok(arc >= 3, 'arc leaves ' + arc);
    // the perfect solution shot (still raft) collects every arc leaf and lands
    w.gulls.length = 0; w.raft.amp = 0; w.raft.x = w.raft.baseX;
    const pr = w.predictShot(w.solution.pull, 0);
    assert.strictEqual(pr.type, 'land', 'solution lands (seed ' + seed + ')');
    assert.ok(pr.leaves >= arc, 'solution collects ' + pr.leaves + ' / ' + arc);
    n++;
  }
  assert.strictEqual(n, 120);
});

test('gulls: per level count, y band, never on the sling, slow drift with wrap', () => {
  assert.strictEqual(mk('normal', 1, { level: 0 }).gulls.length, 0);
  assert.strictEqual(mk('normal', 1, { level: 2 }).gulls.length, 1);
  assert.strictEqual(mk('normal', 1, { level: 3 }).gulls.length, 2);
  const w = mk('normal', 2, { level: 3 }); w.hearts = 1e6;
  let wrapped = false;
  for (let i = 0; i < 60 / H; i++) {
    w.update(H); w.drainEvents();
    if (w.phase !== 'aim') { w.phase = 'aim'; }
    for (const g of w.gulls) {
      assert.ok(g.y >= C.GULL_Y[0] - C.GULL_BOB - 1e-9 && g.y <= C.GULL_CLEAR_Y + C.GULL_BOB + 1e-9, 'gull y ' + g.y);
      if (g.x < C.SLING.x + 1.5) assert.ok(g.y - C.SLING.y > 2, 'above the sling: ' + g.y);
      assert.ok(g.y - C.RAFT_TOP > 2, 'never on the raft');
      if (Math.abs(g.x - g.px) > 5) wrapped = true; else assert.ok(Math.abs(g.x - g.px) < 1.0 * H * 1.3 + 1e-6, 'slow');
    }
  }
  assert.ok(wrapped, 'gulls wrap around');
});

test('level up after 5 landings (after the land phase, before newShot); zones and loops', () => {
  const w = mk('normal', 12); w.hearts = 1e6;
  const bot = new FIF.Bot(w, { skill: 1, seed: 2 }); const ev = [];
  for (let i = 0; i < 60 * 60 && w.level === 0; i++) { bot.step(1 / 60); w.update(1 / 60); ev.push(...w.drainEvents()); }
  assert.strictEqual(w.level, 1); assert.strictEqual(w.zone, 1); assert.strictEqual(w.levelLandings, 0);
  const lands = of(ev, 'land'); assert.strictEqual(lands.length, 5);
  const t = types(ev), iu = t.indexOf('levelUp');
  assert.strictEqual(t[iu + 1], 'newShot'); assert.strictEqual(t.lastIndexOf('land'), t.lastIndexOf('land', iu));
  assert.strictEqual(JSON.stringify(ev[iu]), JSON.stringify({ type: 'levelUp', zone: 1, level: 1, loop: 0 }));
  // loops: harder but capped
  const g = mk('normal', 1); g.drainEvents(); g.gotoLevel(4);
  assert.strictEqual(types(g.drainEvents()).join(), 'levelUp,newShot');
  assert.strictEqual(g.zone, 0); assert.strictEqual(g.loop, 1);
  const p0 = g.levelParams(0), p4 = g.levelParams(4), p12 = g.levelParams(12), p16 = g.levelParams(16), p15 = g.levelParams(15), p3 = g.levelParams(3);
  assert.ok(p4.hw < p0.hw && p4.preview < p0.preview && p4.amp > p0.amp);
  assert.strictEqual(JSON.stringify(p16), JSON.stringify(p12), 'capped after LOOP_CAP');
  assert.ok(p15.hw < p3.hw && p15.hw > 0.8 && p15.preview >= 8);
});

test('day cycle: smooth light curve, night/dawn once per transition, start from opts.day', () => {
  let prev = W.lightAt(0), maxJump = 0;
  for (let i = 1; i <= 1000; i++) {
    const L = W.lightAt(i / 1000); maxJump = Math.max(maxJump, Math.abs(L - prev)); prev = L;
    assert.ok(L >= C.NIGHT_LIGHT - 1e-9 && L <= 1 + 1e-9);
  }
  assert.ok(maxJump < 0.02, 'smooth ' + maxJump);
  near(W.lightAt(0.3), 1, 1e-9); near(W.lightAt(0.85), C.NIGHT_LIGHT, 1e-9); near(W.lightAt(0), W.lightAt(0.9999), 1e-3);
  const w = mk('normal', 1); w.hearts = 1e6;
  assert.strictEqual(w.dayT, C.DAY_START); assert.strictEqual(w.light, 1); assert.strictEqual(w.isNight, false);
  const ev = [];
  for (let i = 0; i < C.DAY_LEN / H; i++) { w.update(H); ev.push(...w.drainEvents()); if (w.phase !== 'aim') w.phase = 'aim'; }
  assert.strictEqual(of(ev, 'night').length, 1); assert.strictEqual(of(ev, 'dawn').length, 1);
  assert.ok(t2i(ev, 'night') < t2i(ev, 'dawn'));
  near(w.dayT, C.DAY_START, 1e-6);
  // a night start: moon leaves worth 2, shorter preview
  const n = mk('normal', 3, { day: 0.85 });
  assert.ok(n.isNight); near(n.light, C.NIGHT_LIGHT, 1e-9);
  assert.ok(n.leaves.length && n.leaves.every(l => l.kind === 'moon' && l.value === 2));
  const d = mk('normal', 3, { day: 0.3 }); n.aim(-1, -1); d.aim(-1, -1);
  assert.strictEqual(n.previewCount(), Math.round(d.previewCount() * C.NIGHT_PREVIEW));
  n.setDay(0.3); assert.strictEqual(types(n.drainEvents()).join(), 'pull,dawn');
  function t2i(e, t) { return e.findIndex(x => x.type === t); }
});

test('moon leaf scores 2', () => {
  const { w } = playBot('normal', 4, 1, 60, { world: { day: 0.8 } });
  assert.ok(w.stats.moonLeaves > 0); assert.ok(w.score >= w.stats.moonLeaves * 2);
});

test('a heart back every 20 leaves (capped at maxHearts)', () => {
  const w = mk('easy', 13); w.hearts = 2;
  const bot = new FIF.Bot(w, { skill: 1, seed: 4 }); const ev = [];
  for (let i = 0; i < 60 * 120 && w.leafCount < 41; i++) { bot.step(1 / 60); w.update(1 / 60); ev.push(...w.drainEvents()); }
  const g = of(ev, 'heartGain');
  assert.ok(g.length >= 2, 'gains ' + g.length);
  const idx = ev.indexOf(g[0]); assert.strictEqual(ev[idx - 1].type, 'leaf'); assert.strictEqual(ev[idx - 1].count, 20);
  assert.strictEqual(g[0].hearts, 3);
  const f = mk('easy', 13); f._hit('leaf', { x: 0, y: 0, value: 1, kind: 'leaf' }); f.leafCount = 19; f.drainEvents();
  f._hit('leaf', { x: 0, y: 0, value: 1, kind: 'leaf' }); assert.strictEqual(of(f.drainEvents(), 'heartGain').length, 0, 'full hearts: no gain');
  assert.strictEqual(f.hearts, f.maxHearts);
});

test('game over after the last heart; the world freezes', () => {
  for (const diff of ['easy', 'normal', 'hard']) {
    const w = clean(diff, 14); const ev = [];
    assert.strictEqual(w.hearts, W.DIFF[diff].hearts);
    for (let s = 0; s < 10 && w.phase !== 'over'; s++) {
      runUntil(w, () => w.phase === 'aim', 3); if (w.phase === 'over') break;
      w.gulls.length = 0; shoot(w, { x: -1.8, y: -0.4 });                    // far too long
      ev.push(...runUntil(w, () => w.phase === 'aim' || w.phase === 'over', 6).ev);
    }
    assert.strictEqual(w.phase, 'over'); assert.strictEqual(w.hearts, 0);
    assert.strictEqual(of(ev, 'splash').length, W.DIFF[diff].hearts);
    const go = of(ev, 'gameOver'); assert.strictEqual(go.length, 1); assert.strictEqual(go[0].score, w.score);
    const s = JSON.stringify(w.getState()); steps(w, 240); assert.strictEqual(JSON.stringify(w.getState()), s);
    w.aim(-1, -1); assert.strictEqual(w.pull, null);
  }
});

test('update(): fixed steps with accumulator, alpha, prev positions', () => {
  const w = clean(); shoot(w, pullTo(w.raft.x));
  w.update(H * 2.5); near(w.alpha, 0.5, 1e-6);
  assert.ok(w.fox.px !== w.fox.x);
  const a = clean('normal', 2), b = clean('normal', 2); shoot(a, pullTo(a.raft.x)); shoot(b, pullTo(b.raft.x));
  for (let i = 0; i < 120; i++) a.update(1 / 60);
  for (let i = 0; i < 240; i++) b.update(1 / 120);
  near(a.fox.x, b.fox.x, 1e-9); near(a.fox.y, b.fox.y, 1e-9);
  const st = a.getState(); assert.strictEqual(JSON.stringify(JSON.parse(JSON.stringify(st))), JSON.stringify(st));
  for (const k of ['phase', 'fox', 'raft', 'leaves', 'gulls', 'score', 'hearts', 'dayT', 'light', 'isNight', 'stats', 'level', 'zone', 'loop']) assert.ok(k in st, k);
});

test('bot: skill 1 lands ≥ 95 %, skill 0.85 lands 80–90 %', () => {
  const rate = (skill, diff) => { let l = 0, s = 0; for (let seed = 1; seed <= 5; seed++) { const { w } = playBot(diff, seed, skill, 200, { immortal: true }); l += w.stats.landings; s += w.stats.shots; } return l / s; };
  const r1 = rate(1, 'normal'), r1h = rate(1, 'hard'), r85 = rate(0.85, 'normal');
  console.log('      bot land rate: skill 1 normal ' + (100 * r1).toFixed(1) + ' %, hard ' + (100 * r1h).toFixed(1) + ' %; skill 0.85 normal ' + (100 * r85).toFixed(1) + ' %');
  assert.ok(r1 >= 0.95 && r1h >= 0.95, 'skill 1: ' + r1 + ' / ' + r1h);
  assert.ok(r85 >= 0.8 && r85 <= 0.9, 'skill 0.85: ' + r85);
});

test('bot: thinks, animates the pull over ~0.5 s, then releases', () => {
  const w = mk('normal', 15), bot = new FIF.Bot(w, { skill: 1, seed: 1 }); const dt = 1 / 60;
  let t = 0, firstPull = -1, launch = -1;
  while (t < 3 && launch < 0) {
    bot.step(dt); w.update(dt); t += dt;
    for (const e of w.drainEvents()) { if (e.type === 'pull') firstPull = t; if (e.type === 'launch') launch = t; }
  }
  assert.ok(firstPull >= FIF.Bot.THINK[0] && firstPull <= FIF.Bot.THINK[1] + 0.05, 'think ' + firstPull);
  near(launch - firstPull, FIF.Bot.AIM_T, 0.05, 'aim time');
});

test('casual kid model: Sunny Cove (easy) lands 70–85 % from shot 3', () => {
  let L = 0, N = 0; const by = [[0, 0], [0, 0], [0, 0]];
  for (let s = 1; s <= 200; s++) {
    for (const x of playKid(s, 'easy', 0, 40).res) {
      if (x.level !== 0) continue;
      const i = Math.min(2, x.shot); by[i][0] += x.land; by[i][1]++;
      if (x.shot >= 2) { L += x.land; N++; }
    }
  }
  const r = L / N;
  console.log('      kid on Sunny Cove easy: shot 1 ' + (100 * by[0][0] / by[0][1]).toFixed(0) + ' %, shot 2 ' + (100 * by[1][0] / by[1][1]).toFixed(0) + ' %, shot 3+ ' + (100 * r).toFixed(1) + ' %');
  assert.ok(r >= 0.7 && r <= 0.85, 'kid rate ' + r);
});

test('weather: bounded ≤ 160, deterministic, sprites, layers, burst physics', () => {
  const run = seed => {
    const wx = new FIF.Weather({ width: 1280, height: 720, seed }); let max = 0; const sprites = new Set();
    for (let z = 0; z < 8; z++) {
      wx.setLevel(z % 4, { instant: z === 0 });
      for (let i = 0; i < 600; i++) {
        wx.setLight(W.lightAt(i / 600));
        if (i % 7 === 0) for (const k of ['splash', 'leaf', 'land', 'bump', 'flutter']) wx.burst(k, 300 + i, 400, 12);
        wx.update(1 / 60);
        max = Math.max(max, wx.particles.length);
        for (const p of wx.particles) {
          sprites.add(p.sprite);
          assert.ok(p.alpha >= -1e-9 && p.alpha <= 1 + 1e-9, 'alpha ' + p.alpha + ' ' + p.kind);
          assert.ok(['sky', 'back', 'front'].includes(p.layer));
          const u = 720 / 9;                                              // ambient sprites ≤ 0.5 u; puffs/ripples grow to ≤ 1.2 u
          assert.ok(isFinite(p.x) && isFinite(p.y) && p.size > 0 && p.size <= (p.burst ? 1.2 : 0.5) * u + 1e-9, p.kind + ' size ' + p.size);
          if (p.kind === 'star' && !p.burst) assert.strictEqual(p.layer, 'sky');
        }
      }
    }
    wx.resize(700, 1200); wx.update(1 / 60);
    return { max, sprites, sig: JSON.stringify(wx.particles.slice(0, 20)) };
  };
  const a = run(3), b = run(3);
  assert.ok(a.max <= FIF.Weather.CAP, 'max ' + a.max); assert.strictEqual(a.sig, b.sig);
  const known = ['sparkle', 'bubble', 'drop', 'ripple', 'star', 'firefly', 'petal', 'butterfly', 'puff', 'leafbit', 'glow'].map(s => 'p_' + s);
  for (const s of a.sprites) assert.ok(known.includes(s), 'sprite ' + s);
  // night adds stars + fireflies on every island
  const wx = new FIF.Weather({ width: 960, height: 540, seed: 1 }); wx.setLevel(0, { instant: true });
  const cnt = k => wx.particles.filter(p => p.kind === k && !p.dying).length;
  assert.strictEqual(cnt('star'), 0); assert.ok(cnt('glint') > 0);
  wx.setLight(0.3); for (let i = 0; i < 120; i++) wx.update(1 / 60);
  assert.ok(cnt('star') > 20 && cnt('firefly') > 5);
  // splash drops arc with gravity, ripples grow and fade
  const s = new FIF.Weather({ width: 960, height: 540, seed: 2 }); s.particles.length = 0; s._topUp = () => {};
  s.burst('splash', 480, 400, 6);
  const drop = s.particles.find(p => p.kind === 'drop'), rip = s.particles.find(p => p.kind === 'ripple');
  const vy0 = drop.vy; s.update(0.1); assert.ok(drop.vy > vy0, 'gravity');
  const sz = rip.size, al = rip.alpha; s.update(0.2); assert.ok(rip.size > sz && rip.alpha < al, 'ripple grows and fades');
  for (let i = 0; i < 30; i++) s.update(0.1);
  assert.strictEqual(s.particles.length, 0, 'bursts end');
  // jungle petals sway (rot swings both ways), lagoon bubbles rise
  const j = new FIF.Weather({ width: 960, height: 540, seed: 4 }); j.setLevel(1, { instant: true });
  const pet = j.particles.find(p => p.kind === 'petal'); let mn = 9, mx = -9;
  for (let i = 0; i < 180; i++) { j.update(1 / 60); mn = Math.min(mn, pet.rot); mx = Math.max(mx, pet.rot); }
  assert.ok(mn < -0.3 && mx > 0.3, 'pendulum sway');
  const l = new FIF.Weather({ width: 960, height: 540, seed: 4 }); l.setLevel(2, { instant: true });
  const bub = l.particles.find(p => p.kind === 'bubble'), y0 = bub.y; l.update(0.1); assert.ok(bub.y < y0 || bub.y > 500, 'bubble rises');
});

test('10 simulated minutes (bot + world + weather) in ~2 s', () => {
  const t0 = Date.now();
  const w = mk('normal', 16); w.hearts = w.maxHearts = 1e6;
  const bot = new FIF.Bot(w, { skill: 0.85, seed: 1 }), wx = new FIF.Weather({ width: 960, height: 540, seed: 1 });
  for (let i = 0; i < 600 * 60; i++) {
    bot.step(1 / 60); w.update(1 / 60); wx.setLight(w.light); wx.update(1 / 60);
    for (const e of w.drainEvents()) if (e.type === 'leaf') wx.burst('leaf', 400, 200, 6); else if (e.type === 'levelUp') wx.setLevel(e.zone);
  }
  const ms = Date.now() - t0;
  console.log('      10 min simulated in ' + ms + ' ms; level ' + w.level + ', landings ' + w.stats.landings + '/' + w.stats.shots);
  assert.ok(ms < 3000, ms + ' ms'); assert.ok(w.level >= 8);
});

// ---------- long report (--stats) ----------
function report() {
  console.log('\n--- stats ---');
  for (const skill of [1, 0.85, 0.6]) for (const diff of ['easy', 'normal', 'hard']) {
    let l = 0, s = 0, lv = [], leaves = 0, bumps = 0, fl = 0;
    for (let seed = 1; seed <= 6; seed++) { const r = playBot(diff, seed, skill, 300, { immortal: true }); l += r.w.stats.landings; s += r.w.stats.shots; lv.push(...r.lv); leaves += r.w.stats.leaves; bumps += r.w.stats.bumps; fl += r.w.stats.flutters; }
    console.log(`bot ${skill} ${diff}: land ${(100 * l / s).toFixed(1)} %, leaves/shot ${(leaves / s).toFixed(2)}, bumps/shot ${(bumps / s).toFixed(2)}, flutters/shot ${(fl / s).toFixed(2)}, s/level ${(lv.reduce((a, b) => a + b, 0) / lv.length).toFixed(1)}`);
  }
  for (const diff of ['easy', 'normal', 'hard']) {
    const per = [[], [], [], []], land = [[0, 0], [0, 0], [0, 0], [0, 0]];
    for (let s = 1; s <= 60; s++) { const { lv, res } = playKid(s, diff, 0, 600); for (const x of lv) per[x.level % 4].push(x.t); for (const x of res) { land[x.level % 4][0] += x.land; land[x.level % 4][1]++; } }
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
