#!/usr/bin/env node
// Tofu's Volcano Melody — unit tests for rng.js, world.js, weather.js, bot.js (no DOM).
// Run: node tests/unit/run.js     (prints PASS/FAIL per test, exits 1 on any failure)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS = path.join(__dirname, '..', '..', 'game', 'js');
function load() {
  const ctx = { console, Math, Date, JSON };
  ctx.window = ctx;                                   // window === global, like a browser
  vm.createContext(ctx);
  for (const f of ['rng.js', 'world.js', 'weather.js', 'bot.js']) {
    vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f });
  }
  return ctx.PVM;
}
const PVM = load();
const C = PVM.CONFIG, A = PVM.ARENA;

/* ---------------- tiny harness ---------------- */
let pass = 0, fail = 0;
function test(name, fn) {
  const t0 = Date.now();
  try { const info = fn(); pass++; console.log('PASS ' + name + (info ? '  — ' + info : '') + '  (' + (Date.now() - t0) + ' ms)'); }
  catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n     ') : e)); }
}
function ok(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) { if (a !== b) throw new Error((msg || 'expected equal') + ': got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b)); }
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || 'expected near') + ': got ' + a + ', want ' + b + ' ±' + tol); }

/* ---------------- helpers ---------------- */
const DT = 1 / 60;
const hyp = (x, y) => Math.sqrt(x * x + y * y);
function world(o) { return new PVM.World(Object.assign({ seed: 42, difficulty: 'easy' }, o || {})); }
function run(w, secs, dt, onStep) { dt = dt || DT; const n = Math.round(secs / dt); for (let i = 0; i < n; i++) { w.update(dt); if (onStep && onStep(w) === false) return; } }
function runUntil(w, pred, maxT, dt) { dt = dt || DT; let t = 0; while (!pred(w)) { w.update(dt); t += dt; if (t > maxT) throw new Error('timeout waiting'); } return t; }
function toPlaying(w) { runUntil(w, x => x.phase === 'playing', 5); w.drainEvents(); }
/* Silence every spawner so a test controls the field. */
function quiet(w) { w._popTimer = 1e9; w.volcano.next = 1e9; w._crabsLeft = 0; w._mangoT = 1e9; }
function addNote(w, x, y, extra) {
  const n = Object.assign({ id: ++w._nid, kind: 1, x, y, z: 0, vx: 0, vy: 0, vz: 0, prevX: x, prevY: y, prevZ: 0, state: 'ground', age: 0, life: 99, src: 'pop' }, extra || {});
  w.notes.push(n); return n;
}
function insideAny(w, x, y, r, tol) {
  for (const o of w.obstacles) if (hyp(x - o.cx, y - o.cy) < o.r + r - (tol || 0.01)) return o;
  return null;
}
function inArena(x, y, r) { return x >= A.x + r - 0.01 && x <= A.x + A.w - r + 0.01 && y >= A.y + r - 0.01 && y <= A.y + A.h - r + 0.01; }
function types(ev) { return ev.map(e => e.type); }

/* ================================ RNG ================================ */
test('rng: deterministic, ranges, fork independent', () => {
  const a = PVM.RNG(7), b = new PVM.RNG(7);
  for (let i = 0; i < 100; i++) eq(a.next(), b.next());
  const r = PVM.RNG(3);
  for (let i = 0; i < 2000; i++) { const x = r.next(); ok(x >= 0 && x < 1); const n = r.int(2, 5); ok(n >= 2 && n <= 5 && n === Math.floor(n)); }
  ok(PVM.RNG(3).fork('a').next() !== PVM.RNG(3).fork('b').next(), 'forks differ');
});

/* ================================ layout ================================ */
test('levels: 3–5 props per season, spacing rules, every part of the meadow reachable', () => {
  eq(PVM.LEVELS.length, 4);
  const V = PVM.VOLCANO_COLLIDER;
  for (let s = 0; s < 4; s++) {
    const L = PVM.LEVELS[s];
    eq(L.season, PVM.SEASONS[s]);
    ok(L.props.length >= 3 && L.props.length <= 5, 'prop count');
    const obs = PVM.buildObstacles(s);
    eq(obs[0].kind, 'volcano');
    eq(obs.length, L.props.length + 1);
    for (const o of obs.slice(1)) {
      ok(o.cx - o.r >= A.x + 44 && o.cx + o.r <= A.x + A.w - 44 && o.cy - o.r >= A.y + 44 && o.cy + o.r <= A.y + A.h - 44, s + ' ' + o.kind + ' margin to the arena edge');
      ok(hyp(o.cx - V.x, o.cy - V.y) - V.r >= 110, s + ' ' + o.kind + ' ≥ 110 px from the volcano circle');
      ok(hyp(o.x - PVM.SPAWN.x, o.y - PVM.SPAWN.y) >= 110, 'away from SPAWN');
      if (o.kind === 'palm') ok(o.y >= 190, 'palm crown under the HUD');
      for (const p of obs.slice(1)) if (p !== o) ok(hyp(o.x - p.x, o.y - p.y) >= 110, 'props ≥ 110 apart');
    }
    // flood fill on a 6 px grid of Tofu centres from SPAWN: every free cell must be reached
    const R = C.tofuR, step = 6, cols = Math.floor((A.w - 2 * R) / step) + 1, rows = Math.floor((A.h - 2 * R) / step) + 1;
    const free = (i, j) => { const x = A.x + R + i * step, y = A.y + R + j * step; return !obs.some(o => hyp(x - o.cx, y - o.cy) < o.r + R); };
    const seen = new Uint8Array(cols * rows);
    const si = Math.round((PVM.SPAWN.x - A.x - R) / step), sj = Math.round((PVM.SPAWN.y - A.y - R) / step);
    ok(free(si, sj), 'spawn free');
    const q = [[si, sj]]; seen[sj * cols + si] = 1; let reached = 0;
    while (q.length) {
      const [i, j] = q.pop(); reached++;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= cols || b >= rows || seen[b * cols + a] || !free(a, b)) continue;
        seen[b * cols + a] = 1; q.push([a, b]);
      }
    }
    let total = 0; for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) if (free(i, j)) total++;
    eq(reached, total, 'season ' + s + ' reachable cells');
  }
});

/* ================================ determinism ================================ */
test('determinism: same seed → same event stream and state; different seed differs', () => {
  function play(seed) {
    const w = world({ seed, difficulty: 'normal' }), bot = new PVM.Bot(w, { skill: 0.7, seed: 5 });
    const ev = [];
    for (let i = 0; i < 60 * 90; i++) { bot.step(DT); w.update(DT); ev.push(...w.drainEvents()); }
    return { ev: JSON.stringify(ev), score: w.score, x: w.tofu.x, n: ev.length };
  }
  const a = play(11), b = play(11), c = play(12);
  ok(a.ev === b.ev, 'event streams differ'); eq(a.score, b.score); eq(a.x, b.x);
  ok(a.n > 300, 'events happened');
  ok(a.ev !== c.ev, 'different seed → different game');
});

test('state: getState is plain JSON without internals; prev* saved; alpha in [0,1)', () => {
  const w = world();
  toPlaying(w); run(w, 3);
  const s = w.getState();
  ok(JSON.stringify(s).indexOf('"_') < 0, 'no underscore keys');
  for (const k of ['t', 'level', 'season', 'loop', 'phase', 'phaseT', 'score', 'hearts', 'maxHearts', 'got', 'goal', 'combo', 'comboT', 'comboWindow', 'invulnT', 'tofu', 'crabs', 'notes', 'mango', 'coco', 'volcano', 'stats', 'obstacles']) ok(k in s, 'has ' + k);
  for (const k of ['x', 'y', 'prevX', 'prevY', 'vx', 'vy', 'face', 'state', 'stateT', 'walk', 'r']) ok(k in s.tofu, 'tofu.' + k);
  for (const k of ['notes', 'volcanoNotes', 'cocoNotes', 'pinches', 'mangoes', 'levelsCleared', 'perfectLevels', 'bestCombo', 'distance']) ok(k in s.stats, 'stats.' + k);
  for (const k of ['rumbleT', 'next', 'puffT']) ok(k in s.volcano);
  w.setAxis(1, 0); w.update(C.step * 2.5);
  ok(w.alpha >= 0 && w.alpha < 1, 'alpha');
  near(w.alpha, 0.5, 1e-6, 'leftover half step');
  ok(w.tofu.prevX < w.tofu.x, 'prevX is the position at the start of the last step');
  for (const n of w.notes) ok('prevZ' in n && 'prevX' in n);
});

test('intro: banner time, only Tofu moves; go after introTime', () => {
  const w = world();
  const ev0 = w.drainEvents();
  eq(ev0[0].type, 'intro'); eq(ev0[0].level, 0); eq(ev0[0].season, 0);
  w.setAxis(1, 0);
  run(w, 1.0);
  eq(w.phase, 'intro'); eq(w.notes.length, 0); eq(w.crabs.length, 0);
  ok(w.tofu.x > PVM.SPAWN.x + 100, 'Tofu may walk during the intro');
  const t = runUntil(w, x => x.phase === 'playing', 1);
  near(1.0 + t, C.introTime, 0.03);
  ok(types(w.drainEvents()).indexOf('go') >= 0, 'go event');
});

/* ================================ Tofu motion ================================ */
test('tofu: accelerates over ~0.12 s, caps at max speed, brakes without an instant stop', () => {
  const w = world(); quiet(w);
  w.tofu.x = 480; w.tofu.y = 470;
  const sp = w.diff.speed;
  w.setAxis(1, 0);
  w.update(C.step);
  ok(hyp(w.tofu.vx, w.tofu.vy) < 30, 'not instant: ' + w.tofu.vx);
  let t = C.step, maxV = 0;
  while (w.tofu.vx < 0.95 * sp) { w.update(C.step); t += C.step; }
  ok(t > 0.09 && t < 0.14, '95 % of max speed after ' + t.toFixed(3) + ' s');
  run(w, 0.5, C.step, x => { maxV = Math.max(maxV, hyp(x.tofu.vx, x.tofu.vy)); });
  ok(maxV <= sp + 1e-6, 'never above max speed');
  // release: decelerates over ~0.12 s
  w.setAxis(0, 0);
  const x0 = w.tofu.x; let tb = 0;
  w.update(C.step); ok(w.tofu.vx > sp * 0.8, 'no instant stop');
  while (w.tofu.vx > 0) { w.update(C.step); tb += C.step; }
  ok(tb > 0.08 && tb < 0.16, 'stops in ' + tb.toFixed(3) + ' s');
  ok(w.tofu.x - x0 < 25, 'short slide ' + (w.tofu.x - x0).toFixed(1));
  // diagonals are not faster
  w.tofu.x = 300; w.tofu.y = 300; w.tofu.vx = w.tofu.vy = 0;
  w.setAxis(1, 1); run(w, 0.4);
  near(hyp(w.tofu.vx, w.tofu.vy), sp, 1, 'diagonal speed');
  // facing follows vx with a dead zone
  w.setAxis(-1, 0); run(w, 0.3); eq(w.tofu.face, -1);
  w.setAxis(0, 1); run(w, 0.3); eq(w.tofu.face, -1, 'walking straight down keeps the facing');
  return 'accel ' + t.toFixed(3) + ' s, brake ' + tb.toFixed(3) + ' s';
});

test('tofu: arrive at the finger without overshoot; axis wins over target; footfalls', () => {
  const w = world(); quiet(w);
  w.tofu.x = 200; w.tofu.y = 470;
  w.setTarget(600, 470);
  let maxX = 0, steps = 0;
  run(w, 3, DT, x => { maxX = Math.max(maxX, x.tofu.x); });
  for (const e of w.drainEvents()) if (e.type === 'step') steps++;
  ok(Math.abs(w.tofu.x - 600) <= C.arriveR + 1, 'arrived at ' + w.tofu.x);
  ok(maxX <= 600 + 2, 'no overshoot (max ' + maxX.toFixed(2) + ')');
  near(hyp(w.tofu.vx, w.tofu.vy), 0, 1e-6, 'at rest');
  eq(w.tofu.state, 'idle');
  ok(steps >= 4 && steps <= 9, 'footfalls every ~0.26 s: ' + steps);
  w.setTarget(100, 470); w.setAxis(0, -1); run(w, 0.4);
  ok(w.tofu.y < 440 && Math.abs(w.tofu.x - 600) < 8, 'axis wins');
  w.setAxis(0, 0); run(w, 3);
  ok(Math.abs(w.tofu.x - 100) < C.arriveR + 1 && Math.abs(w.tofu.y - 470) < C.arriveR + 1, 'target resumes when the axis is released');
});

test('tofu: slides around obstacles and arena edges, never inside a collider', () => {
  for (let lv = 0; lv < 4; lv++) {
    const w = world({ level: lv, seed: lv + 1 }); quiet(w);
    const r = PVM.RNG(lv + 9);
    let worst = 0;
    for (let k = 0; k < 600; k++) {                       // 60 s of random keyboard mashing
      if (k % 6 === 0) w.setAxis(r.range(-1, 1), r.range(-1, 1));
      run(w, 0.1, DT, x => {
        const T = x.tofu;
        for (const o of x.obstacles) worst = Math.max(worst, o.r + T.r - hyp(T.x - o.cx, T.y - o.cy));
        ok(inArena(T.x, T.y, T.r), 'inside arena');
      });
      if (w.phase !== 'intro' && w.phase !== 'playing') break;
    }
    ok(worst <= 0.01, 'level ' + lv + ' penetration ' + worst);
  }
  // pushing straight into the volcano stops at its surface; at an angle he slides round it
  const w = world(); quiet(w);
  w.tofu.x = 480; w.tofu.y = 470; w.setAxis(0, -1); run(w, 1.5);
  near(hyp(w.tofu.x - 480, w.tofu.y - 305), 78 + C.tofuR, 0.05, 'rests on the volcano');
  w.tofu.x = 470; w.tofu.y = 470; w.setAxis(0, -1); run(w, 3);
  ok(w.tofu.y < 305, 'slid round the volcano (y=' + w.tofu.y.toFixed(0) + ')');
  // arena edge: hold left → pinned at the edge, vx = 0, sliding up still works
  w.tofu.x = 200; w.tofu.y = 160; w.setAxis(-1, -1); run(w, 2);
  near(w.tofu.x, A.x + C.tofuR, 1e-6); near(w.tofu.y, A.y + C.tofuR, 1e-6); eq(w.tofu.vx, 0);
});

test('tofu: holding a finger behind the volcano walks around it', () => {
  const w = world(); quiet(w);
  w.setTarget(480, 140);                                // straight through the volcano from SPAWN
  const t = runUntil(w, x => hyp(x.tofu.x - 480, x.tofu.y - 140) < C.arriveR + 1, 5);
  ok(t < 2.6, 'reached in ' + t.toFixed(2) + ' s');
  return 'around the volcano in ' + t.toFixed(2) + ' s';
});

/* ================================ notes ================================ */
test('volcano notes: ballistic arc, land in ARENA off obstacles, one small bounce, then rest', () => {
  let count = 0, bounceMax = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const w = world({ seed, level: seed % 4 }); toPlaying(w); quiet(w);
    w._pickups = function () {};                          // Tofu must not catch them for this test
    w._eruptN = 5; w._erupt();
    const ev = w.drainEvents(); eq(ev[0].type, 'erupt');
    const ns = w.notes.filter(n => n.src === 'volcano');
    eq(ns.length, ev[0].n);
    ok(ns.length >= 3, 'eruption made ' + ns.length);
    const track = ns.map(n => ({ n, z: [n.z], lands: 0, peak2: 0, landX: n.landX, landY: n.landY }));
    for (let i = 0; i < 300; i++) {
      w.update(C.step);
      for (const e of w.drainEvents()) if (e.type === 'land') { const tr = track.find(t => t.n.id === e.id); tr.lands++; tr.lx = e.x; tr.ly = e.y; }
      for (const tr of track) { tr.z.push(tr.n.z); if (tr.lands === 1) tr.peak2 = Math.max(tr.peak2, tr.n.z); }
    }
    for (const tr of track) {
      const n = tr.n; count++;
      eq(tr.lands, 1, 'exactly one land event');
      eq(n.state, 'ground'); eq(n.z, 0);
      // z is a parabola until the first touchdown: constant second difference = −g·dt²
      for (let i = 2; i < tr.z.length && tr.z[i] > 0; i++) near(tr.z[i] - 2 * tr.z[i - 1] + tr.z[i - 2], -C.g * C.step * C.step, 1e-6, 'z″');
      ok(Math.max.apply(null, tr.z) > C.craterZ + 40, 'rises above the crater first');
      const d = hyp(tr.lx - PVM.VOLCANO.x, tr.ly - PVM.VOLCANO.y);
      ok(d >= C.landMin - 4 && d <= C.landMax + 4, 'landing distance ' + d);
      ok(tr.peak2 > 5 && tr.peak2 < 40, 'one small bounce: ' + tr.peak2);
      bounceMax = Math.max(bounceMax, tr.peak2);
      near(n.x, tr.landX, 3, 'rest x as planned'); near(n.y, tr.landY, 3, 'rest y');
      for (const [x, y] of [[tr.lx, tr.ly], [n.x, n.y]]) {
        ok(x >= A.x + 20 && x <= A.x + A.w - 20 && y >= C.noteTop - 3 && y <= A.y + A.h - 20, 'inside ARENA ' + x + ',' + y);
        ok(!insideAny(w, x, y, C.noteObsPad - 4), 'off obstacles');
      }
      ok(n.y >= 92, 'not behind the HUD');
    }
  }
  return count + ' notes, highest bounce ' + bounceMax.toFixed(1) + ' px';
});

test('pop notes: small hop then rest; catch only low; fade after life', () => {
  const w = world(); toPlaying(w);
  w._popTimer = 0; w.update(C.step);
  const ev = w.drainEvents().filter(e => e.type === 'pop');
  eq(ev.length, 1);
  const n = w.notes[0]; quiet(w);
  let peak = 0; run(w, 0.6, C.step, () => { peak = Math.max(peak, n.z); });
  ok(peak > 10 && peak < 25, 'hop ' + peak); eq(n.state, 'ground');
  // a high note is not catchable
  const hi = addNote(w, w.tofu.x, w.tofu.y, { z: 50, state: 'fly', vz: 0 });
  w._updateNotes = function () {};                      // freeze note physics for this check
  w.update(C.step);
  ok(w.notes.indexOf(hi) >= 0, 'z ≥ catchZ is not caught');
  delete w._updateNotes;
  // expiry
  const w2 = world(); toPlaying(w2); quiet(w2);
  const m = addNote(w2, 800, 450, { life: 1 });
  run(w2, 1.1);
  ok(w2.notes.indexOf(m) < 0); ok(w2.drainEvents().some(e => e.type === 'fade' && e.id === m.id), 'fade event');
});

test('scoring: 10 + 2·min(10, combo), chain window, chain reset → comboEnd', () => {
  const w = world({ difficulty: 'normal' }); toPlaying(w); quiet(w);
  w.goal = 99;
  const got = [];
  for (let i = 0; i < 13; i++) {
    addNote(w, w.tofu.x, w.tofu.y); w.update(C.step);
    const e = w.drainEvents().filter(x => x.type === 'note');
    eq(e.length, 1); got.push(e[0].score);
    eq(e[0].combo, i + 1); eq(e[0].idx, i); eq(e[0].byCoco, false);
    run(w, 0.3);
    w.drainEvents();
    if (w.coco) w.coco = null;                          // keep Coco out of this test
  }
  eq(got.join(), '12,14,16,18,20,22,24,26,28,30,30,30,30');
  eq(w.score, got.reduce((a, b) => a + b, 0));
  eq(w.comboWindow, PVM.DIFFICULTY.normal.comboWindow);
  // let the window expire → comboEnd { n: 13 }, next note restarts at 12
  run(w, w.comboWindow + 0.1);
  const ce = w.drainEvents().filter(e => e.type === 'comboEnd');
  eq(ce.length, 1); eq(ce[0].n, 13); eq(w.combo, 0); eq(w.comboT, 0);
  addNote(w, w.tofu.x, w.tofu.y); w.update(C.step);
  eq(w.drainEvents().filter(e => e.type === 'note')[0].score, 12);
  eq(w.stats.bestCombo, 13); eq(w.got, 14);
  eq(w.tofu.state, 'happy');
});

/* ================================ Coco ================================ */
test('coco: arrives at combo 5, collects nearby notes (byCoco), scares crabs, leaves after helperTime', () => {
  const w = world(); toPlaying(w); quiet(w);
  w.goal = 99;
  const crab = w._spawnCrab(); crab.x = 150; crab.y = 300; crab.state = 'chase'; crab.stateT = 0; crab._modeT = 99;
  for (let i = 0; i < 5; i++) { addNote(w, w.tofu.x, w.tofu.y); w.update(C.step); }
  let ev = w.drainEvents();
  eq(ev.filter(e => e.type === 'helperIn').length, 1, 'helperIn once');
  ok(w.coco && w.coco.state === 'in');
  ok(w.coco.x < -20 || w.coco.x > 980, 'flies in from off-screen');
  run(w, 2); eq(w.coco.state, 'help'); eq(crab.state, 'scared', 'crabs scuttle away while she helps');
  const dBefore = hyp(crab.x - w.tofu.x, crab.y - w.tofu.y);
  // a note 160 px from Tofu (inside cocoSeekR): Coco swoops for it
  const n = addNote(w, w.tofu.x + 160, w.tofu.y - 40);
  let byCoco = null;
  run(w, 3, DT, x => { for (const e of x.drainEvents()) if (e.type === 'note') byCoco = e; if (byCoco) return false; });
  ok(byCoco && byCoco.byCoco === true && byCoco.id === n.id, 'collected by Coco');
  eq(w.stats.cocoNotes, 1);
  ok(byCoco.combo === 6, 'counts for the combo');
  ok(hyp(crab.x - w.tofu.x, crab.y - w.tofu.y) >= dBefore - 5, 'scared crab did not come closer');
  // she circles Tofu at about cocoZ
  run(w, 1.5);
  near(w.coco.z, C.cocoZ, 12, 'orbit height');
  ok(hyp(w.coco.x - w.tofu.x, w.coco.y - w.tofu.y) < C.cocoOrbitR + 40, 'stays near Tofu');
  // leaves after helperTime
  runUntil(w, x => x.coco && x.coco.state === 'out', C.helperTime + 1);
  ok(w.drainEvents().some(e => e.type === 'helperOut'), 'helperOut');
  runUntil(w, x => !x.coco, 6);
  run(w, 0.2); ok(crab.state !== 'scared', 'crab back to normal');
});

test('coco: one at a time; reaching combo 5 again while she helps refreshes her timer', () => {
  const w = world(); toPlaying(w); quiet(w); w.goal = 99;
  for (let i = 0; i < 5; i++) { addNote(w, w.tofu.x, w.tofu.y); w.update(C.step); }
  run(w, 3.5); ok(w.coco.state === 'help' && w.coco.t > 1.5, 'helping for a while');
  w.comboT = Math.min(w.comboT, 0.5); run(w, 0.6);   // let the chain run out (Easy's window is long) eq(w.combo, 0, 'chain broke');
  w.drainEvents();
  for (let i = 0; i < 5; i++) { addNote(w, w.tofu.x, w.tofu.y); w.update(C.step); }
  ok(w.coco.t < 0.1, 'timer refreshed');
  eq(w.drainEvents().filter(e => e.type === 'helperIn').length, 0, 'no second Coco');
  // combo 10 in the same chain does not summon again
  for (let i = 0; i < 5; i++) { addNote(w, w.tofu.x, w.tofu.y); w.update(C.step); }
  eq(w.combo, 10); ok(w.coco.t > 0, 'combo 10 does not refresh');
});

/* ================================ crabs ================================ */
test('crab pinch: heart −1, invulnerability, knock-back, crab dizzy, chain ends, game over at 0', () => {
  const w = world({ difficulty: 'normal' }); toPlaying(w); quiet(w); w.goal = 99;
  addNote(w, w.tofu.x, w.tofu.y); w.update(C.step); addNote(w, w.tofu.x, w.tofu.y); w.update(C.step);
  eq(w.combo, 2); w.drainEvents();
  const T = w.tofu; T.x = 600; T.y = 450; T.vx = T.vy = 0;
  const k = w._spawnCrab(); k.x = 580; k.y = 450; k.state = 'chase'; k._modeT = 99; k.stateT = 0;
  w.update(C.step);
  const ev = w.drainEvents();
  const p = ev.find(e => e.type === 'pinch');
  ok(p, 'pinch event'); eq(p.hearts, 2); eq(w.hearts, 2);
  ok(ev.some(e => e.type === 'comboEnd' && e.n === 2), 'chain ended'); eq(w.combo, 0);
  near(w.invulnT, C.invulnTime, 0.02); eq(T.state, 'hurt'); eq(k.state, 'dizzy');
  ok(T.vx > 200, 'knocked away from the crab');
  const x0 = T.x; run(w, 0.8);
  ok(T.x - x0 > 25 && T.x - x0 < 70, 'knock-back slide with friction: ' + (T.x - x0).toFixed(1));
  near(hyp(T.vx, T.vy), 0, 1e-6, 'friction stopped him');
  // no second pinch while blinking, even overlapping a chasing crab
  k.state = 'chase'; k.x = T.x - 10; k.y = T.y; w.update(C.step);
  eq(w.hearts, 2, 'safe while invulnerable');
  ok(hyp(k.x - T.x, k.y - T.y) >= T.r + k.r - 0.01, 'crab nudged out, no overlap');
  k.state = 'dizzy'; k.stateT = -99; run(w, C.invulnTime); eq(w.invulnT, 0);
  eq(w.stats.pinches, 1);
  // last heart → over
  w.hearts = 1; w.drainEvents(); k.state = 'chase'; k._modeT = 99; k.x = T.x + 10; k.y = T.y; w.update(C.step);
  eq(w.phase, 'over'); eq(w.hearts, 0); eq(T.state, 'sleep');
  const go = w.drainEvents().find(e => e.type === 'gameOver'); ok(go && go.score === w.score);
  run(w, 0.5); w.setAxis(1, 0); const xs = T.x; run(w, 1); near(T.x, xs, 1e-6, 'no input once over (after the knock-back slide)');
});

test('crabs: enter from the edge, mix chase and wander, slide round obstacles, keep apart, stay slow', () => {
  const counts = { enter: 0, chase: 0, wander: 0, dizzy: 0, scared: 0 };
  let minSep = 1e9, worst = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const w = world({ seed, difficulty: 'hard', level: 3 });
    const bot = new PVM.Bot(w, { skill: 0.6, seed });
    const ins = [];
    for (let i = 0; i < 60 * 60 && w.phase !== 'over'; i++) {
      bot.step(DT); w.update(DT);
      for (const e of w.drainEvents()) if (e.type === 'crabIn') ins.push(e.id);
      for (const k of w.crabs) {
        counts[k.state]++;
        for (const o of w.obstacles) worst = Math.max(worst, o.r + k.r - hyp(k.x - o.cx, k.y - o.cy));
        ok(inArena(k.x, k.y, k.r), 'crab inside arena');
        ok(hyp(k.vx, k.vy) <= Math.max(C.crabKnock, w.crabSpeed * C.scaredMul) + 1e-6, 'speed cap');
        for (const j of w.crabs) if (j !== k) minSep = Math.min(minSep, hyp(j.x - k.x, j.y - k.y));
      }
      if (w.level > 3) break;
    }
    ok(ins.length >= 2, 'crabIn events');
  }
  ok(worst <= 0.01, 'never inside a collider (' + worst + ')');
  ok(minSep >= 2 * C.crabR - 3, 'crabs keep apart (' + minSep.toFixed(1) + ')');
  ok(counts.chase > 0 && counts.wander > 0 && counts.enter > 0, 'mix of moods ' + JSON.stringify(counts));
  ok(counts.chase > counts.wander * 0.8, 'hard crabs chase more than they wander');
  // speed ratio: Easy spring crab ≈ 36 px/s vs Tofu 230
  const e = world({ difficulty: 'easy' });
  eq(e.crabSpeed, 36); eq(e.diff.speed, 230); eq(e.diff.crabs[0], 1); eq(e.goal, 12);
  return JSON.stringify(counts);
});

test('crabs: a chasing crab goes round the volcano to reach Tofu, with a sideways scuttle', () => {
  const w = world({ difficulty: 'normal' }); toPlaying(w); quiet(w);
  w.invulnT = 1e9;                                         // just watch it come
  w.tofu.x = 480; w.tofu.y = 470;
  const k = w._spawnCrab(); k.x = 480; k.y = 140; k.state = 'chase'; k._modeT = 1e9; k.stateT = 0;
  let lateral = 0, minD = 1e9, t = 0;
  while (t < 12) {
    w.update(DT); t += DT;
    minD = Math.min(minD, hyp(k.x - w.tofu.x, k.y - w.tofu.y));
    lateral = Math.max(lateral, Math.abs(k.x - 480));
    if (minD < 40) break;
  }
  ok(minD < 40, 'reached Tofu (closest ' + minD.toFixed(0) + ')');
  ok(lateral > 78, 'went around the volcano');
  return 'took ' + t.toFixed(1) + ' s';
});

/* ================================ levels ================================ */
test('level clear: +50 / +100 perfect, clear phase, then the next season', () => {
  const w = world(); toPlaying(w); quiet(w);
  w.got = w.goal - 1; const s0 = w.score;
  addNote(w, w.tofu.x, w.tofu.y); w.update(C.step);
  let ev = w.drainEvents();
  const lc = ev.find(e => e.type === 'levelClear');
  ok(lc && lc.perfect === true && lc.bonus === 100 && lc.level === 0, JSON.stringify(lc));
  eq(w.score, s0 + 12 + 100); eq(w.phase, 'clear');
  eq(w.stats.levelsCleared, 1); eq(w.stats.perfectLevels, 1);
  addNote(w, 300, 200);
  run(w, 1.5);
  eq(w.notes.length, 0, 'leftover notes flew to Tofu');
  eq(w.tofu.state, 'happy');
  run(w, C.clearTime - 1.5 + 0.05);
  ev = w.drainEvents();
  const lu = ev.find(e => e.type === 'levelUp'), it = ev.find(e => e.type === 'intro');
  ok(lu && lu.level === 1 && lu.season === 1, 'levelUp'); ok(it && it.season === 1, 'intro');
  eq(w.phase, 'intro'); eq(w.season, 1); eq(w.got, 0); eq(w.goal, PVM.DIFFICULTY.easy.goal[1]);
  eq(w.obstacles.length, PVM.LEVELS[1].props.length + 1);
  // not perfect after a pinch
  toPlaying(w); quiet(w);
  const k = w._spawnCrab(); k.x = w.tofu.x + 10; k.y = w.tofu.y; k.state = 'chase'; k._modeT = 99;
  w.update(C.step); eq(w.hearts, PVM.DIFFICULTY.easy.hearts - 1);
  w.got = w.goal - 1; w.tofu.state = 'idle';
  addNote(w, w.tofu.x, w.tofu.y); w.update(C.step);
  const lc2 = w.drainEvents().find(e => e.type === 'levelClear');
  ok(lc2 && lc2.perfect === false && lc2.bonus === 50);
});

test('seasons and loops: crabs, speed and song grow; loop scaling capped', () => {
  for (const d of ['easy', 'normal', 'hard']) {
    const D = PVM.DIFFICULTY[d];
    for (let s = 1; s < 4; s++) {
      ok(D.crabs[s] >= D.crabs[s - 1] && D.crabSpeed[s] > D.crabSpeed[s - 1] && D.goal[s] > D.goal[s - 1], d + ' grows ' + s);
    }
  }
  eq(PVM.DIFFICULTY.easy.hearts, 5); eq(PVM.DIFFICULTY.normal.hearts, 3); eq(PVM.DIFFICULTY.hard.hearts, 3);
  const w = world({ difficulty: 'normal' });
  w.gotoLevel(4); eq(w.season, 0); eq(w.loop, 1); eq(w.goal, PVM.DIFFICULTY.normal.goal[0] + 2);
  near(w.crabSpeed, PVM.DIFFICULTY.normal.crabSpeed[0] * 1.1, 1e-9);
  w.gotoLevel(40); near(w.crabSpeed, Math.min(PVM.DIFFICULTY.normal.crabSpeed[0] * 1.35, C.crabCapFrac * 230), 1e-9, 'capped at ×1.35');
  ok(w.crabSpeed <= 0.5 * w.diff.speed + 1e-9, 'always ≤ half Tofu speed');
  const ev = w.drainEvents().filter(e => e.type === 'intro'); eq(ev[ev.length - 1].level, 40);
});

/* ================================ spawning ================================ */
test('spawning: pop-ups never in obstacles / HUD / near Tofu; never more than needed + 4', () => {
  let pops = 0, erupts = 0, rumbles = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const w = world({ seed, difficulty: seed % 2 ? 'normal' : 'hard' }), bot = new PVM.Bot(w, { skill: 0.9, seed });
    let rumbleAt = -1;
    for (let i = 0; i < 60 * 120 && w.phase !== 'over'; i++) {
      bot.step(DT); w.update(DT);
      for (const e of w.drainEvents()) {
        if (e.type === 'pop') {
          pops++;
          ok(!insideAny(w, e.x, e.y, C.noteFromObstacle * 0.6 - 0.5), 'pop clear of obstacles');
          ok(e.y >= C.noteTop && e.x >= A.x + C.noteEdge && e.x <= A.x + A.w - C.noteEdge && e.y <= A.y + A.h - C.noteEdge, 'pop in play rect');
          ok(hyp(e.x - w.tofu.x, e.y - w.tofu.y) >= C.noteFromTofu * 0.6 - 1, 'not under Tofu');
          for (const k of w.crabs) ok(hyp(e.x - k.x, e.y - k.y) >= C.noteFromCrab * 0.6 - 1, 'not on a crab');
        }
        if (e.type === 'rumble') { rumbles++; rumbleAt = w.t; }
        if (e.type === 'erupt') { erupts++; near(w.t - rumbleAt, C.rumbleTime, 0.02, 'rumble lasts'); ok(e.n >= 1 && e.n <= 5); }
      }
      if (w.phase === 'playing') {
        ok(w.notes.length <= w.goal - w.got + C.extraNotes, 'note cap');
        ok(w.notes.filter(n => n.src === 'pop').length <= w.diff.notesOnField, 'pop cap');
      }
      if (w.mango) ok(w.hearts < w.maxHearts || w.mango.age > 0, 'mango only when hurt');
    }
  }
  ok(pops > 200 && erupts > 20 && rumbles >= erupts, pops + ' pops, ' + erupts + ' eruptions');
  return pops + ' pops, ' + erupts + ' eruptions';
});

test('mango: appears only with a heart missing, restores one', () => {
  const w = world({ difficulty: 'normal' }); toPlaying(w);
  w._mangoT = 0; w.update(C.step);
  eq(w.mango, null, 'full hearts → no mango');
  w.hearts = 2; w._mangoT = 0; w.update(C.step);
  ok(w.mango, 'mango popped');
  const ev = w.drainEvents().find(e => e.type === 'mangoPop'); ok(ev);
  run(w, 0.6); eq(w.mango.z, 0);
  w.tofu.x = w.mango.x; w.tofu.y = w.mango.y; w.update(C.step);
  eq(w.hearts, 3); eq(w.mango, null); eq(w.stats.mangoes, 1);
  ok(w.drainEvents().some(e => e.type === 'mango' && e.hearts === 3));
});

/* ================================ weather ================================ */
test('weather: every season sparse and bounded (≤ 260) even under heavy bursts; layers valid', () => {
  const info = [];
  for (let s = 0; s < 4; s++) {
    const wx = new PVM.Weather({ width: 960, height: 540, seed: s + 1 });
    wx.setLevel(s, { instant: true });
    let maxN = 0, maxAmb = 0, smoke = 0;
    for (let i = 0; i < 60 * 60; i++) {
      wx.update(DT);
      if (i % 30 === 0) { wx.burst('confetti', 480, 300, 70); wx.burst('sparkle', 300, 300); wx.burst('spark', 600, 200); wx.burst('stars', 480, 400); }
      if (i % 15 === 0) { wx.dust(400, 450); wx.ripple(500, 400); }
      maxN = Math.max(maxN, wx.particles.length);
      let amb = 0;
      for (const p of wx.particles) {
        ok(['ground', 'air', 'front'].indexOf(p.layer) >= 0, 'layer ' + p.layer);
        ok(Math.abs(p.flipX) >= 0.2 - 1e-9 && Math.abs(p.flipX) <= 1 + 1e-9, 'flipX');
        ok(p.alpha >= 0 && p.alpha <= 1 + 1e-9 && p.size > 0 && isFinite(p.x) && isFinite(p.y), 'finite');
        if (p.sprite === 'confetti') ok(typeof p.color === 'string');
        if (p.ambient) amb++;
        if (p.fx === 'smoke') smoke++;
        if (p.fx === 'dust' || p.fx === 'ripple') eq(p.layer, 'ground');
      }
      maxAmb = Math.max(maxAmb, amb);
    }
    ok(maxN <= 260, 'cap: ' + maxN);
    ok(maxAmb >= 10 && maxAmb <= 45, 'sparse ambience: ' + maxAmb);
    ok(smoke > 0, 'crater smoke');
    info.push(PVM.SEASONS[s] + ' ' + maxAmb);
  }
  // quiet run (no bursts): low count; season change fades the old ambience out
  const wx = new PVM.Weather({ seed: 3 });
  for (let i = 0; i < 600; i++) wx.update(DT);
  ok(wx.particles.length < 40, 'quiet spring ' + wx.particles.length);
  ok(wx.particles.some(p => p.sprite === 'blossom'));
  wx.setLevel(3);
  for (let i = 0; i < 60 * 4; i++) wx.update(DT);
  ok(!wx.particles.some(p => p.sprite === 'blossom'), 'petals gone after the fade');
  ok(wx.particles.filter(p => p.sprite === 'snowflake').length > 10, 'snow arrived');
  const sizes = {}; for (const p of wx.particles) if (p.sprite === 'snowflake') { const e = p.ei; (sizes[e] = sizes[e] || []).push(p.size); }
  ok(Object.keys(sizes).length === 3, 'three snow depth layers');
  const summer = new PVM.Weather({ seed: 4, season: 1 });
  eq(summer.particles.filter(p => p.sprite === 'butterfly').length, 2, 'two butterflies');
  return info.join(', ');
});

test('weather: deterministic from the seed', () => {
  const a = new PVM.Weather({ seed: 9 }), b = new PVM.Weather({ seed: 9 });
  for (let i = 0; i < 300; i++) { a.update(DT); b.update(DT); if (i === 100) { a.burst('confetti', 1, 2, 30); b.burst('confetti', 1, 2, 30); } }
  eq(JSON.stringify(a.particles), JSON.stringify(b.particles));
});

/* ================================ bot ================================ */
test('bot: skill 1 clears the first year (4 seasons) on Normal in most seeds', () => {
  let wins = 0; const times = [];
  for (let seed = 1; seed <= 10; seed++) {
    const w = world({ seed, difficulty: 'normal' }), bot = new PVM.Bot(w, { skill: 1, seed });
    let t = 0;
    while (t < 400 && w.phase !== 'over' && w.level < 4) { bot.step(DT); w.update(DT); w.drainEvents(); t += DT; }
    if (w.level >= 4) { wins++; times.push(t); }
  }
  ok(wins >= 8, 'wins ' + wins + '/10');
  return wins + '/10, year in ' + (times.reduce((a, b) => a + b, 0) / times.length).toFixed(0) + ' s avg';
});

test('bot: title skill 0.8 survives a while; skill 0 is clearly worse at dodging', () => {
  let survived = 0, pinch0 = 0, pinch8 = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const w = world({ seed: seed + 99, difficulty: 'normal' }), bot = new PVM.Bot(w, { skill: 0.8, seed: 3 });
    for (let i = 0; i < 60 * 70 && w.phase !== 'over'; i++) { bot.step(DT); w.update(DT); w.drainEvents(); }
    if (w.phase !== 'over') survived++;
    // same hard autumn field, two skills
    for (const [skill, add] of [[0, n => { pinch0 += n; }], [0.8, n => { pinch8 += n; }]]) {
      const v = world({ seed: seed + 99, difficulty: 'hard', level: 2 }), b = new PVM.Bot(v, { skill, seed: 3 });
      for (let i = 0; i < 60 * 40 && v.phase !== 'over'; i++) { b.step(DT); v.update(DT); v.drainEvents(); }
      add(v.stats.pinches);
    }
  }
  ok(survived >= 7, 'survived 70 s: ' + survived + '/8');
  ok(pinch0 > pinch8, 'skill 0 pinched more (' + pinch0 + ' vs ' + pinch8 + ')');
  return survived + '/8 survived 70 s on Normal; hard-autumn pinches: skill 0 = ' + pinch0 + ', skill 0.8 = ' + pinch8;
});

/* A "typical small kid" model: sloppy skill-0 aim, only touching the screen 2 s out of every 4.5 s. */
test('pacing: Easy spring is short and never lost by a crab-ignoring small kid; perfect bot faster', () => {
  const kid = [], pro = [];
  let kidLost = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const w = world({ seed, difficulty: 'easy' }), bot = new PVM.Bot(w, { skill: 0, seed });
    let t = 0;
    while (t < 300 && w.phase !== 'clear' && w.phase !== 'over') {
      if ((t % 4.5) < 2) bot.step(DT); else w.clearTarget();
      w.update(DT); w.drainEvents(); t += DT;
    }
    if (w.phase === 'over') kidLost++;
    kid.push(t);
    const w2 = world({ seed, difficulty: 'easy' }), b2 = new PVM.Bot(w2, { skill: 1, seed });
    let t2 = 0; while (t2 < 300 && w2.phase !== 'clear') { b2.step(DT); w2.update(DT); w2.drainEvents(); t2 += DT; }
    pro.push(t2);
  }
  kid.sort((a, b) => a - b); pro.sort((a, b) => a - b);
  const km = kid[kid.length >> 1], pm = pro[pro.length >> 1];
  eq(kidLost, 0, 'a small kid never loses Easy spring');
  ok(km >= 20 && km <= 100, 'kid median ' + km.toFixed(0) + ' s');
  ok(pm < km, 'pro faster');
  return 'kid median ' + km.toFixed(0) + ' s (' + kid[0].toFixed(0) + '–' + kid[kid.length - 1].toFixed(0) + '), perfect bot ' + pm.toFixed(0) + ' s';
});

/* ================================ performance ================================ */
test('performance: 10 simulated minutes (world + bot + weather) in ~2 s', () => {
  const w = world({ seed: 5, difficulty: 'hard' }), bot = new PVM.Bot(w, { skill: 0.8, seed: 2 });
  const wx = new PVM.Weather({ seed: 1 });
  const t0 = Date.now();
  for (let i = 0; i < 60 * 600; i++) {
    bot.step(DT); w.update(DT); wx.update(DT);
    for (const e of w.drainEvents()) {
      if (e.type === 'note') wx.burst('sparkle', e.x, e.y, 8);
      if (e.type === 'step') wx.dust(e.x, e.y);
      if (e.type === 'levelUp') wx.setLevel(e.season);
    }
    if (w.phase === 'over') { w.reset(); }
  }
  const ms = Date.now() - t0;
  ok(ms < 4000, ms + ' ms');
  return ms + ' ms';
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
