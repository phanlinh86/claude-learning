#!/usr/bin/env node
// Mossy's Egg Grove — headless unit tests for rng / world / weather / bot (node, no deps).
// Run from anywhere:   node tests/unit/run.js        (prints PASS/FAIL per test, exits 1 on any failure)
'use strict';
const assert = require('assert');
const { load } = require('./load');

const MEG = load();
const W = MEG.World, C = W.CONFIG, H = C.STEP;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const deq = (a, b, m) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), m);   // vm-realm arrays
const near = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, (m || '') + ' got ' + a + ' want ' + b + ' ±' + tol);

// ---------- helpers ----------
function mk(diff, seed, extra) { return new W(Object.assign({ seed: seed || 1, difficulty: diff || 'normal' }, extra || {})); }
/** a fresh world with no events and the wind held calm */
function calm(diff, seed) { const w = mk(diff, seed); w.setWind(0, null, 1e6); w.drainEvents(); return w; }
function steps(w, n) { const ev = []; for (let i = 0; i < n; i++) { w.update(H); ev.push(...w.drainEvents()); } return ev; }
function secs(w, s) { return steps(w, Math.round(s / H)); }
const of = (ev, t) => ev.filter(e => e.type === t);
function maxOverlap(w) {
  let ov = 0;
  for (const a of w.eggs) for (const b of w.eggs) if (a.id < b.id) ov = Math.max(ov, a.r + b.r - Math.hypot(a.x - b.x, a.y - b.y));
  return ov;
}
function inside(w) { return w.eggs.every(e => e.x >= e.r - 1e-6 && e.x <= C.NEST_W - e.r + 1e-6 && e.y >= e.r - 1e-6 && isFinite(e.x + e.y + e.vx + e.vy + e.w)); }
function playBot(w, skill, seconds, seed, onStep) {
  const bot = new MEG.Bot(w, { skill, seed: seed || 5 });
  const ev = [], dt = 1 / 60;
  for (let t = 0; t < seconds && w.phase === 'play'; t += dt) {
    bot.step(dt); w.update(dt); ev.push(...w.drainEvents());
    if (onStep) onStep(w);
  }
  return ev;
}
/** stack random eggs (dropped from the top, merges allowed) until the settled pile reaches `top` u with ≥ minN eggs */
function fillNest(w, top, seed, minN) {
  const r = new MEG.RNG(seed || 5);
  const settled = () => w.eggs.filter(e => !e.falling && e.age > 0.5 && Math.hypot(e.vx, e.vy) < 0.5);
  const pileTop = () => Math.max(0, ...settled().map(e => e.y + e.r));
  for (let i = 0; i < 300 && (pileTop() < top || w.eggs.length < (minN || 12)); i++) {
    if (pileTop() > C.DANGER_Y - 1.2) break;
    w.spawnEgg(r.int(1, 5), r.range(0.5, 8.5), 10.5, { falling: true }); steps(w, 60);
  }
  steps(w, 240); w.drainEvents();
}

// ---------- RNG ----------
test('rng: same seed → same sequence; fork independent', () => {
  const a = new MEG.RNG(42), b = new MEG.RNG(42);
  for (let i = 0; i < 100; i++) assert.strictEqual(a.next(), b.next());
  const c = new MEG.RNG(42).fork('x'), d = new MEG.RNG(42).fork('y');
  assert.notStrictEqual(c.next(), d.next());
});

// ---------- contract ----------
test('statics + state fields per DESIGN §5', () => {
  assert.strictEqual(W.KINDS.length, 8);
  deq(W.KINDS.map(k => k.r), [0.50, 0.66, 0.84, 1.04, 1.26, 1.50, 1.78, 2.10]);
  deq(W.KINDS.map(k => k.points), [1, 3, 6, 10, 15, 21, 28, 36]);
  assert.strictEqual(W.LEVELS.length, 4);
  deq(W.LEVELS.map(l => l.wind), [2, 3, 4, 5]);
  for (const d of ['easy', 'normal', 'hard']) assert.ok(W.DIFF[d]);
  assert.strictEqual(C.STEP, 1 / 120); assert.strictEqual(C.NEST_W, 9); assert.strictEqual(C.DANGER_Y, 9.8); assert.strictEqual(C.HOLD_Y, 11.3);
  const w = mk(); w.spawnEgg(3, 4, 1); secs(w, 0.1);
  const s = w.getState();
  for (const k of ['phase', 'time', 'mossy', 'held', 'next', 'canDrop', 'cooldown', 'eggs', 'wind', 'danger', 'rescues', 'maxRescues', 'score', 'level', 'zone',
    'loop', 'difficulty', 'combo', 'comboT', 'bestCombo', 'maxKind', 'merges', 'drops', 'stats', 'levelGoal', 'levelStart']) assert.ok(k in s, 'state.' + k);
  for (const k of ['x', 'px', 'vx', 'tx', 'mood', 'moodT', 'flap']) assert.ok(k in s.mossy, 'mossy.' + k);
  for (const k of ['id', 'kind', 'r', 'x', 'y', 'px', 'py', 'vx', 'vy', 'rot', 'prot', 'w', 'falling', 'age', 'born', 'over']) assert.ok(k in s.eggs[0], 'egg.' + k);
  for (const k of ['dir', 'phase', 't', 'dur', 'strength', 'force', 'nextDir']) assert.ok(k in s.wind, 'wind.' + k);
  for (const k of ['drops', 'merges', 'maxKind', 'hatches', 'maxCombo', 'rescues', 'windDrops', 'kinds']) assert.ok(k in s.stats, 'stats.' + k);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(s)), JSON.parse(JSON.stringify(JSON.parse(JSON.stringify(s)))), 'JSON-able');
  assert.ok(w.getState().eggs !== w.eggs, 'a copy');
  assert.strictEqual(s.levelGoal, 150); assert.strictEqual(s.levelStart, 0);
});

test('drop → falls from (mossy.x, HOLD_Y); cooldown → ready with the next kind', () => {
  const w = calm();
  w.moveTo(2); secs(w, 1.5);
  near(w.mossy.x, 2, 0.01, 'Mossy arrived');
  const held = w.held, next = w.next;
  assert.ok(w.canDrop && w.drop());
  const ev = w.drainEvents(), d = of(ev, 'drop')[0];
  assert.ok(d && d.kind === held); near(d.x, 2, 0.01);
  assert.strictEqual(w.held, 0); assert.strictEqual(w.canDrop, false); assert.strictEqual(w.drop(), false, 'no double drop');
  const e = w.eggs[0]; near(e.y, C.HOLD_Y, 1e-9); assert.ok(e.falling);
  const ev2 = secs(w, C.DROP_COOLDOWN + 0.05), rd = of(ev2, 'ready')[0];
  assert.ok(rd && rd.kind === next && w.held === next && w.canDrop);
  const ev3 = secs(w, 1.2); assert.strictEqual(of(ev2.concat(ev3), 'land').length, 1, 'one land event');
});

test('Mossy: critically damped, ≤ MOSSY_VMAX, clamped for the held egg', () => {
  const w = calm(); let vmax = 0, over = 0;
  w.moveTo(100);
  for (let i = 0; i < 240; i++) { w.update(H); vmax = Math.max(vmax, Math.abs(w.mossy.vx)); over = Math.max(over, w.mossy.x - w.mossy.tx); }
  assert.ok(vmax <= C.MOSSY_VMAX + 1e-9, 'vmax ' + vmax);
  assert.ok(over < 0.01, 'no overshoot ' + over);
  near(w.mossy.x, C.NEST_W - W.KINDS[w.held - 1].r, 1e-3);
});

test('drop pool: deterministic, only kinds 1–2 at first, never above the difficulty range', () => {
  const kinds = d => { const w = mk(d, 9); const out = [w.held, w.next]; for (let i = 0; i < 40; i++) out.push(w._draw()); return out; };
  deq(kinds('normal'), kinds('normal'));
  assert.ok(kinds('hard').every(k => k <= 2), 'maxKind 1 → only 1–2');
  const w = mk('easy', 3); w.maxKind = 8; const ks = []; for (let i = 0; i < 400; i++) ks.push(w._draw());
  assert.ok(Math.max(...ks) === 3 && Math.min(...ks) === 1, 'easy 1–3');
  const h = mk('hard', 3); h.maxKind = 8; const hs = []; for (let i = 0; i < 400; i++) hs.push(h._draw());
  assert.strictEqual(Math.max(...hs), 5, 'hard up to 5');
  const n = mk('normal', 3); n.maxKind = 4; const ns = []; for (let i = 0; i < 400; i++) ns.push(n._draw());
  assert.strictEqual(Math.max(...ns), 3, 'never more than maxKind − 1');
});

// ---------- determinism ----------
test('determinism: same seed + bot → identical state after 3 min; another seed differs', () => {
  const run = seed => { const w = mk('normal', seed); w.rescues = 99; playBot(w, 0.8, 180, 3); return JSON.stringify(w.getState()); };
  const a = run(7), b = run(7), c = run(8);
  assert.strictEqual(a, b);
  assert.notStrictEqual(a, c);
});

// ---------- merges ----------
test('merge: two kind-1 eggs touching → one kind-2, 3 points, pop-in grows smoothly', () => {
  const w = calm();
  w.spawnEgg(1, 4, 0.5); w.spawnEgg(1, 5.005, 0.5);
  const ev = steps(w, 2), m = of(ev, 'merge');
  assert.strictEqual(m.length, 1); assert.strictEqual(m[0].kind, 2); assert.strictEqual(m[0].points, 3); assert.strictEqual(m[0].combo, 1);
  assert.strictEqual(w.eggs.length, 1); assert.strictEqual(w.eggs[0].kind, 2); assert.strictEqual(w.score, 3);
  assert.strictEqual(m[0].id, w.eggs[0].id);
  const e = w.eggs[0]; assert.ok(e.born < 0.02 && e.r < W.KINDS[1].r, 'starts small');
  let last = e.r;
  for (let i = 0; i < 60; i++) { w.update(H); assert.ok(e.r >= last - 1e-12, 'radius grows monotonically'); last = e.r; }
  near(e.r, W.KINDS[1].r, 1e-9);
  assert.ok(of(ev, 'newKind').some(n => n.kind === 2));
  assert.strictEqual(w.stats.merges, 1); assert.strictEqual(w.stats.kinds[2], 1);
  secs(w, 1); assert.ok(e.vy * e.vy + e.vx * e.vx < 0.01, 'settles');
});

test('merge pops gently inside a full nest (no explosion)', () => {
  const w = calm('normal', 4); fillNest(w, 8, 11); secs(w, 2);
  // a pair of equal eggs pressed into the pile from the top
  const before = new Set(w.eggs.map(e => e.id));
  const top = Math.max(...w.eggs.map(e => e.y + e.r));
  w.spawnEgg(4, 3, top + 1.1); w.spawnEgg(4, 5.1, top + 1.1);
  let vmax = 0, merged = false;
  for (let i = 0; i < 240; i++) {
    w.update(H); const ev = w.drainEvents(); if (of(ev, 'merge').length) merged = true;
    for (const e of w.eggs) if (before.has(e.id)) vmax = Math.max(vmax, Math.hypot(e.vx, e.vy));
  }
  assert.ok(merged, 'merged');
  assert.ok(w.eggs.length >= 10, 'pile ' + w.eggs.length);
  assert.ok(vmax < 6, 'pile eggs stay calm, max ' + vmax.toFixed(2) + ' u/s');
  assert.ok(inside(w));
});

test('chain combo: kind-1 pair under a kind-2 → kind 2 then kind 3 within COMBO_T, combo 2, bonus +1', () => {
  const w = calm();
  w.spawnEgg(1, 3.5, 0.5); w.spawnEgg(1, 4.5, 0.5); w.spawnEgg(2, 4, 0.5 + Math.sqrt(1.16 * 1.16 - 0.25) + 0.001);
  const ev = secs(w, 0.5), m = of(ev, 'merge');
  assert.strictEqual(m.length, 2, JSON.stringify(m));
  deq(m.map(e => e.kind), [2, 3]);
  deq(m.map(e => e.combo), [1, 2]);
  deq(m.map(e => e.points), [3, 7]);
  assert.ok(of(ev, 'combo').some(c => c.n === 2));
  assert.strictEqual(w.score, 10); assert.strictEqual(w.bestCombo, 2); assert.strictEqual(w.stats.maxCombo, 2);
  assert.strictEqual(w.eggs.length, 1);
  secs(w, 1); w.spawnEgg(1, 7, 0.5); w.spawnEgg(1, 8, 0.5);
  const m2 = of(secs(w, 0.2), 'merge'); assert.strictEqual(m2[0].combo, 1, 'combo resets after COMBO_T');
});

test('hatch: two Golden Dragon eggs touching → both leave, +100, hatch event', () => {
  const w = calm();
  w.spawnEgg(8, 2.1, 2.1); w.spawnEgg(8, 6.305, 2.1);
  const ev = steps(w, 3), h = of(ev, 'hatch');
  assert.strictEqual(h.length, 1); assert.strictEqual(h[0].points, 100);
  near(h[0].x, 4.2, 0.05);
  assert.strictEqual(w.eggs.length, 0); assert.strictEqual(w.score, 100); assert.strictEqual(w.stats.hatches, 1);
  assert.strictEqual(of(ev, 'merge').length, 0);
});

// ---------- stability ----------
test('eggs never leave the nest; overlap < 0.03 u after settling (bot game, 3 min, 3 seeds)', () => {
  for (const seed of [1, 2, 3]) {
    const w = mk('easy', seed); w.rescues = 99; let ok = true;
    playBot(w, 0.5, 180, seed, ww => { if (!inside(ww)) ok = false; });
    assert.ok(ok, 'inside, seed ' + seed);
    w.canDrop = false; w.cooldown = 1e9; secs(w, 3);
    const ov = maxOverlap(w);
    assert.ok(ov < 0.03, 'overlap ' + ov.toFixed(4) + ' seed ' + seed);
  }
});

test('a full nest stays still: max speed < 0.05 u/s over 5 s after settling (4 piles, incl. 16× frame slices)', () => {
  for (const seed of [9, 13, 15, 20]) {
    const w = calm('hard', 3); fillNest(w, 8.5, seed);
    // settled = every egg slower than 0.1 u/s for 3 s (a perched egg may take a while to roll off its support)
    for (let t = 0, calmT = 0; t < 40 && calmT < 3; t += 0.1) { secs(w, 0.1); calmT = w.eggs.every(e => Math.hypot(e.vx, e.vy) < 0.1) ? calmT + 0.1 : 0; }
    let vmax = 0; const x0 = w.eggs.map(e => [e.x, e.y]);
    // 16× speed: the game calls update(1/60) 16 times per frame
    for (let f = 0; f < 5 * 60 / 16; f++) {
      for (let i = 0; i < 16; i++) w.update(1 / 60);
      for (const e of w.eggs) vmax = Math.max(vmax, Math.hypot(e.vx, e.vy));
    }
    const moved = Math.max(...w.eggs.map((e, i) => Math.hypot(e.x - x0[i][0], e.y - x0[i][1])));
    assert.ok(w.eggs.length >= 10 && Math.max(...w.eggs.map(e => e.y + e.r)) > 7.5, 'a real pile (' + w.eggs.length + ')');
    assert.ok(vmax < 0.05, 'seed ' + seed + ' max speed ' + vmax.toFixed(4));
    assert.ok(moved < 0.05, 'seed ' + seed + ' moved ' + moved.toFixed(4));
    assert.ok(maxOverlap(w) < 0.03);
  }
});

test('update(): big slices are capped and equal to many small ones', () => {
  const a = calm('normal', 2), b = calm('normal', 2);
  a.spawnEgg(5, 3, 6); b.spawnEgg(5, 3, 6);
  for (let i = 0; i < 60; i++) a.update(1 / 60);
  for (let i = 0; i < 120; i++) b.update(1 / 120);
  near(a.eggs[0].y, b.eggs[0].y, 1e-9); near(a.time, 1, 1e-9);
  const c = calm(); c.update(5); assert.ok(c.time <= C.MAX_DT + 1e-9, 'MAX_DT');
  assert.ok(a.alpha >= 0 && a.alpha < 1);
});

test('rolling: an egg rolling right spins clockwise (w < 0) and eggs come to rest', () => {
  const w = calm();
  const e = w.spawnEgg(3, 1, 0.84, { vx: 4 });
  secs(w, 0.4);
  assert.ok(e.vx > 0 && e.w < -0.5, 'w ' + e.w);
  near(e.w * e.r, -e.vx, 0.5, 'near rolling without slipping');
  secs(w, 6);
  assert.ok(Math.abs(e.vx) < 0.01 && Math.abs(e.w) < 0.05, 'stops: vx ' + e.vx + ' w ' + e.w);
  const b = calm(); const big = b.spawnEgg(6, 4.5, 1.5); const s = b.spawnEgg(1, 4.8, 4.5, { falling: true });
  secs(b, 0.6);
  assert.ok(s.x > 5 && s.w < 0, 'rolls off to the right, spinning clockwise');
  assert.ok(Math.abs(big.x - 4.5) < 0.2);
});

test('a dropped egg bounces only a little (restitution ≈ 0.15)', () => {
  const w = calm(); const e = w.spawnEgg(2, 4.5, 8, { falling: true });
  let landed = false, peak = 0;
  for (let i = 0; i < 240; i++) { w.update(H); const ev = w.drainEvents(); if (of(ev, 'land').length) landed = true; else if (landed) peak = Math.max(peak, e.y - e.r); }
  assert.ok(landed && peak > 0.005 && peak < 0.2, 'bounce height ' + peak.toFixed(3));
});

// ---------- wind ----------
test('first 8 s of a game are always calm (30 seeds × 3 difficulties)', () => {
  for (const d of ['easy', 'normal', 'hard']) for (let s = 1; s <= 30; s++) {
    const w = mk(d, s);
    for (let i = 0; i < 8 / H; i++) { w.update(H); assert.strictEqual(w.wind.force, 0); }
    assert.strictEqual(of(w.drainEvents(), 'gust').length, 0);
  }
});

test('warning before every gust; directions change; force eases in/out; strength per season × difficulty', () => {
  const w = mk('normal', 4); let warnAt = null, warnDir = 0; const dirs = [];
  let lastF = 0, maxJump = 0;
  for (let i = 0; i < 240 / H; i++) {
    w.update(H);
    maxJump = Math.max(maxJump, Math.abs(w.wind.force - lastF)); lastF = w.wind.force;
    for (const e of w.drainEvents()) {
      if (e.type === 'windWarn') { warnAt = w.time; warnDir = e.dir; }
      if (e.type === 'gust') {
        assert.ok(warnAt !== null, 'warned'); near(w.time - warnAt, C.WARN_T, 2 * H, 'warn 1.5 s before');
        assert.strictEqual(e.dir, warnDir, 'same direction as warned'); near(e.strength, 2.0, 1e-9, 'spring, normal');
        dirs.push(e.dir); warnAt = null;
      }
    }
  }
  assert.ok(dirs.length >= 10, 'gusts in 4 min: ' + dirs.length);
  let changes = 0; for (let i = 1; i < dirs.length; i++) if (dirs[i] !== dirs[i - 1]) changes++;
  assert.ok(changes >= dirs.length * 0.4, 'direction changes ' + changes + '/' + dirs.length);
  assert.ok(maxJump < 2 * 2.0 * H / C.EASE_IN, 'eased force, max jump ' + maxJump);
  const hd = mk('hard', 1); hd.gotoLevel(3); assert.ok(Math.abs(hd._windStrength() - 5 * 1.25) < 1e-9);
  const ez = mk('easy', 1); ez.gotoLevel(5); assert.ok(Math.abs(ez._windStrength() - 5 * 0.6 * 1.3) < 1e-9, 'loop +15 %');
});

test('wind moves only falling eggs', () => {
  const w = calm(); const rest = w.spawnEgg(4, 2, 1.04); secs(w, 0.5);
  const x0 = rest.x, y0 = rest.y;
  w.setWind(1, 5, 10); w.drainEvents(); w.moveTo(6); secs(w, 1);
  w.drop(); const ev = secs(w, 2);
  near(rest.x, x0, 1e-6, 'resting egg x'); near(rest.y, y0, 1e-6, 'resting egg y');
  const land = of(ev, 'land')[0];
  assert.ok(land && land.x > 6.8, 'falling egg pushed right: ' + (land && land.x));
  const c = calm(); c.moveTo(6); secs(c, 1); c.drop(); const lc = of(secs(c, 2), 'land')[0];
  near(lc.x, 6, 0.01, 'calm drop falls straight');
  const l = calm(); l.setWind(-1, 5, 10); l.moveTo(6); secs(l, 1); l.drop(); assert.ok(of(secs(l, 2), 'land')[0].x < 5.2, 'left gust');
});

test('predictDrop lands within 0.25 u of the real drop (calm and in a gust, on a real pile)', () => {
  for (const gust of [0, 1, -1]) for (const seed of [1, 2]) {
    const base = mk('normal', seed); base.rescues = 99;
    playBot(base, 0.6, 60, seed);
    base.canDrop = false; base.cooldown = 1e9; secs(base, 3);
    base.cooldown = 0; base.canDrop = true; base.held = base.held || base.next;
    if (gust) base.setWind(gust, 4, 100); else base.setWind(0, null, 100);
    for (const x of [1.2, 3, 4.5, 6, 7.8]) {
      const w = base;                                // reuse: predict, drop, check, remove the egg again
      w.moveTo(x); secs(w, 1.2);
      const p = w.predictDrop();
      assert.ok(p.path.length > 3 && p.path[0].y === C.HOLD_Y);
      const ids = new Set(w.eggs.map(e => e.id));
      const dropped = w.drop(); let land = null; const seen = [];
      for (let i = 0; i < 400 && !land; i++) { w.update(H); const ev = w.drainEvents(); seen.push(...ev.map(e => e.type)); land = of(ev, 'land')[0] || null; }
      assert.ok(land, 'landed (gust ' + gust + ' seed ' + seed + ' x ' + x + ' dropped ' + dropped + ' phase ' + w.phase + ' ' + seen.join(',') + ')');
      const err = Math.hypot(land.x - p.landX, land.y - p.landY);
      assert.ok(err < 0.25, `gust ${gust} seed ${seed} x ${x}: predicted (${p.landX.toFixed(2)}, ${p.landY.toFixed(2)}) real (${land.x.toFixed(2)}, ${land.y.toFixed(2)})`);
      w.eggs = w.eggs.filter(e => ids.has(e.id)); w._order.length = 0;
      w.cooldown = 1e9; w.canDrop = false; secs(w, 3);              // let the pile settle again
      w.cooldown = 0; w.canDrop = true; w.held = w.held || w.next; w.phase = 'play';
    }
  }
});

test('predictDrop uses the shared step function (free fall matches integrateEgg exactly)', () => {
  const w = calm(); w.setWind(1, 3, 100);
  const p = w.predictDrop(2, 0);
  const e = { x: 2, y: C.HOLD_Y, vx: 0, vy: 0, w: 0, rot: 0, r: W.KINDS[w.held - 1].r, falling: true };
  for (let i = 0; i < 6; i++) W.integrateEgg(e, H, w.wind.force);
  near(p.path[1].x, e.x, 1e-12); near(p.path[1].y, e.y, 1e-12);
});

// ---------- danger, rescue, game over ----------
function overfill(diff) {
  const w = calm(diff, 2), r = new MEG.RNG(3), order = [];
  const kinds = [7, 6, 5, 7, 6, 5, 4];
  for (let t = 0, i = 0; t < 200 && w.phase === 'play'; t += 0.5) {
    const top = Math.max(0, ...w.eggs.map(e => e.y + e.r));
    if (top < C.DANGER_Y + 1) w.spawnEgg(kinds[i++ % kinds.length], r.range(1.5, 7.5), 11, { falling: true });
    for (const e of secs(w, 0.5)) if (['warnOn', 'rescue', 'gameOver'].includes(e.type)) order.push(e.type);
  }
  return { w, order };
}
test('danger → rescue → game over, per difficulty (Easy 2, Normal 1, Hard 0 rescues)', () => {
  const want = { easy: 2, normal: 1, hard: 0 };
  for (const d of ['easy', 'normal', 'hard']) {
    const { w, order } = overfill(d);
    assert.strictEqual(w.phase, 'over', d + ' ends');
    const ends = order.filter(t => t !== 'warnOn');
    deq(ends, Array(want[d]).fill('rescue').concat(['gameOver']), d + ': ' + order.join(','));
    // every rescue / game over is preceded by a warning
    for (let i = 0; i < order.length; i++) if (order[i] !== 'warnOn') assert.strictEqual(order[i - 1], 'warnOn', d + ' warned first');
    assert.strictEqual(w.rescues, 0); assert.strictEqual(w.stats.rescues, want[d]);
    assert.strictEqual(w.drop(), false, 'no drops after game over');
  }
});

test('rescue removes the 4 highest eggs; a short bounce over the line is forgiven', () => {
  const { w } = (() => { const w = calm('normal', 5); return { w }; })();
  w.spawnEgg(8, 2.1, 2.1); w.spawnEgg(7, 6.5, 1.78); w.spawnEgg(6, 2.1, 5.7); w.spawnEgg(5, 6.5, 4.9); w.spawnEgg(4, 2.1, 8.3); w.spawnEgg(3, 6.5, 7.5);
  w.spawnEgg(2, 2.1, 10.2); w.spawnEgg(1, 6.5, 9.8);
  const ev = secs(w, 5), rs = of(ev, 'rescue');
  assert.strictEqual(rs.length, 1); assert.strictEqual(rs[0].ids.length, 4);
  assert.ok(w.eggs.every(e => e.kind >= 6 || e.kind === 5), 'the low big eggs stay: ' + w.eggs.map(e => e.kind));
  const f = calm('hard', 1); const e = f.spawnEgg(2, 4, 9.6); secs(f, 1.2);
  e.y = 10.4; e.vy = 0; secs(f, 1.0); // pushed over the line briefly (it falls back)
  assert.strictEqual(f.phase, 'play');
});

test('drop refused while the pile reaches the claws; the vine timer still leads to rescue / game over; bot copes', () => {
  for (const d of ['normal', 'hard']) {
    const w = calm(d, 3);
    // a tower right under Mossy up to the claws
    w.spawnEgg(8, 4.5, 2.1); w.spawnEgg(7, 4.5, 6.0); w.spawnEgg(6, 4.5, 9.3);
    secs(w, 1.5);
    w.held = 3; w.moveTo(4.5); secs(w, 0.8);
    const held = w.held, n = w.eggs.length;
    assert.ok(w.dropBlocked(4.5), 'blocked at the tower');
    assert.strictEqual(w.drop(), false);
    const ev = w.drainEvents(), b = of(ev, 'blocked');
    assert.strictEqual(b.length, 1); near(b[0].x, 4.5, 0.01);
    assert.strictEqual(w.held, held, 'egg stays held'); assert.ok(w.canDrop); assert.strictEqual(w.eggs.length, n);
    assert.ok(!w.dropBlocked(0.6) || !w.dropBlocked(8.4), 'the sides are free');
    const ev2 = secs(w, 4), want = d === 'hard' ? 'gameOver' : 'rescue';
    assert.ok(of(ev2, want).length === 1, d + ': ' + want + ' still happens');
  }
  // the bot never stalls on a blocked spot: it drops elsewhere
  const w = calm('hard', 4);
  w.spawnEgg(8, 4.5, 2.1); w.spawnEgg(7, 4.5, 6.0); w.spawnEgg(6, 4.5, 9.3); secs(w, 1.5);
  const bot = new MEG.Bot(w, { skill: 1, seed: 2 }); let drops = 0, blocked = 0;
  for (let i = 0; i < 120; i++) { bot.step(1 / 60); w.update(1 / 60); for (const e of w.drainEvents()) { if (e.type === 'drop') drops++; if (e.type === 'blocked') blocked++; } }
  assert.ok(drops >= 1, 'bot dropped beside the tower'); assert.strictEqual(blocked, 0, 'bot avoids blocked spots');
  // every spot blocked: the bot just waits (no loop, no drop)
  const f = calm('hard', 5); for (const x of [1.1, 3.3, 5.5, 7.7]) f.spawnEgg(1, x, C.HOLD_Y); 
  for (const e of f.eggs) e.falling = false;
  const fb = new MEG.Bot(f, { skill: 1, seed: 1 });
  const realDrop = f.drop.bind(f); let calls = 0; f.drop = () => { calls++; return realDrop(); };
  f.dropBlocked = () => true;
  for (let i = 0; i < 60; i++) fb.step(1 / 60);
  assert.ok(calls <= 2, 'bot does not hammer drop() when everything is blocked (' + calls + ')');
});

// ---------- seasons ----------
test('level up by score keeps the eggs; goals per difficulty; gotoLevel hook', () => {
  const w = calm('normal', 3);
  w.spawnEgg(5, 2, 1.26); w.spawnEgg(6, 7, 1.5); secs(w, 0.5);
  w.score = w.levelGoal - 2;
  w.spawnEgg(1, 4, 0.5); w.spawnEgg(1, 5.005, 0.5);
  const ev = steps(w, 2), lu = of(ev, 'levelUp');
  assert.strictEqual(lu.length, 1); deq([lu[0].zone, lu[0].level, lu[0].loop], [1, 1, 0]);
  assert.strictEqual(w.eggs.length, 3, 'eggs kept');
  assert.strictEqual(w.levelStart, 150); assert.strictEqual(w.levelGoal, 400);
  w.gotoLevel(4); deq([w.zone, w.loop, w.levelStart, w.levelGoal], [3, 1, 1250, 1750]);
  assert.ok(w.score >= 1250); assert.strictEqual(w.eggs.length, 3);
  deq([0, 1, 2, 3].map(i => W.goalOf(i, W.DIFF.easy.goal)), [115, 300, 565, 940]);
  deq([0, 1, 2].map(i => W.goalOf(i, W.DIFF.hard.goal)), [180, 480, 900]);
});

// ---------- bot ----------
test('bot at skill 1 survives and scores (Normal, 3 games)', () => {
  for (const seed of [1, 2, 3]) {
    const w = mk('normal', seed); playBot(w, 1, 900, seed);
    assert.ok(w.drops >= 60, 'drops ' + w.drops);
    assert.ok(w.score >= 400 && w.level >= 1, 'score ' + w.score + ' level ' + w.level);
  }
});

test('bot drops on a twin when it can', () => {
  const w = calm(); w.spawnEgg(1, 1, 0.5); w.spawnEgg(2, 3, 0.66); w.spawnEgg(3, 5.5, 0.84); w.spawnEgg(4, 7.9, 1.04); secs(w, 0.5);
  w.held = 3; const bot = new MEG.Bot(w, { skill: 1, seed: 1 });
  let merge = null;
  for (let i = 0; i < 300 && !merge; i++) { bot.step(1 / 60); w.update(1 / 60); merge = of(w.drainEvents(), 'merge')[0] || null; }
  assert.ok(merge && merge.kind === 4, 'merged with the kind-3 egg');
});

test('10 minutes of play simulated in ≈ 2 s', () => {
  const w = mk('easy', 6); w.rescues = 1e6;
  const t0 = Date.now(); playBot(w, 0.8, 600, 4); const ms = Date.now() - t0;
  near(w.time, 600, 0.05);
  console.log('      (10 min sim: ' + ms + ' ms, ' + w.drops + ' drops, ' + w.eggs.length + ' eggs in the nest)');
  assert.ok(ms < 4000, ms + ' ms');
});

// ---------- weather ----------
test('weather: bounded particles, valid sprites, wind drift + streaks only in gusts', () => {
  const OK = new Set(['sparkle', 'star', 'glow', 'petal', 'leafbit', 'snow', 'firefly', 'streak', 'puff', 'shellbit', 'heart']);
  for (const [vw, vh] of [[960, 540], [2732, 2048], [375, 667]]) {
    const wx = new MEG.Weather({ width: vw, height: vh, seed: 3 });
    for (let z = 0; z < 4; z++) {
      wx.setLevel(z, { instant: z === 0 });
      let maxN = 0, maxAmb = 0, streaksCalm = 0, streaksGust = 0;
      for (let i = 0; i < 60 * 20; i++) {
        const t = i / 60, gust = t > 8 && t < 14 ? (t < 11 ? 5 : -5) : 0;
        wx.setWind(gust);
        if (i % 3 === 0) wx.burst(['merge', 'hatch', 'land', 'rescue', 'level'][i % 5], vw / 2, vh / 2, 0, { color: '#ff88aa' });
        wx.update(1 / 60);
        maxN = Math.max(maxN, wx.particles.length); maxAmb = Math.max(maxAmb, wx.ambientCount());
        const st = wx.particles.filter(p => p.name === 'streak').length;
        if (gust) streaksGust = Math.max(streaksGust, st); else if (t > 7 && t < 8) streaksCalm = Math.max(streaksCalm, st);
        if (i % 50 === 0) for (const p of wx.particles) {
          assert.ok(OK.has(p.name) && p.sprite === 'p_' + p.name, 'sprite ' + p.sprite);
          assert.ok(isFinite(p.x + p.y + p.size + p.rot + p.alpha) && p.alpha >= 0 && p.alpha <= 1, 'finite');
          assert.ok(['sky', 'back', 'front'].includes(p.layer));
        }
      }
      assert.ok(maxN <= 160, 'cap ' + maxN); assert.ok(maxAmb <= 120, 'ambient ' + maxAmb);
      assert.ok(wx.ambientCount() >= 10, 'ambient present in zone ' + z);
      assert.strictEqual(streaksCalm, 0); assert.ok(streaksGust >= 2, 'streaks in a gust');
    }
  }
  // drift: under a right gust the snow moves right on average
  const wx = new MEG.Weather({ width: 960, height: 540, seed: 1 }); wx.setLevel(3, { instant: true });
  const amb = wx.particles.filter(p => p.amb), x0 = amb.map(p => p.x0);
  wx.setWind(5); for (let i = 0; i < 60; i++) wx.update(1 / 60);
  const dxs = amb.map((p, i) => p.x0 - x0[i]).sort((a, b) => a - b), dx = dxs[dxs.length >> 1];   // median: respawns / wraps jump
  assert.ok(dx > 20, 'drift ' + dx.toFixed(1) + ' px');
  assert.ok(new Set(amb.map(p => p.layer)).size === 3, 'snow in 3 depth layers');
  const lv = new MEG.Weather({ width: 960, height: 540, seed: 1 }); lv.setLevel(2, { instant: true });
  const leaf = lv.particles.find(p => p.name === 'leafbit'); const r0 = leaf.rot; lv.update(0.5);
  assert.ok(leaf.rot !== r0, 'leaves spin');
});

// ---------- run ----------
let pass = 0, fail = 0; const t0 = Date.now();
for (const t of tests) {
  const s = Date.now();
  try { t.fn(); pass++; console.log('PASS  ' + t.name + '  (' + (Date.now() - s) + ' ms)'); }
  catch (e) { fail++; console.log('FAIL  ' + t.name + '\n      ' + (e && e.message || e)); }
}
console.log('\n' + pass + '/' + tests.length + ' passed in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
process.exit(fail ? 1 : 0);
