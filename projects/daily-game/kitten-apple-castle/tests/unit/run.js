#!/usr/bin/env node
// Ziggy's Apple Castle — headless unit tests for rng / world / weather / bot (node, no deps).
// Run from projects/daily-game/kitten-apple-castle:   node tests/unit/run.js
'use strict';
const assert = require('assert');
const { load } = require('./load');

const AC = load();
const C = AC.World.CONFIG;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const H = 1 / 120;
const J = v => v === undefined ? v : JSON.parse(JSON.stringify(v));
const deq = (a, b, m) => assert.deepStrictEqual(J(a), J(b), m);
const near = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, (m || '') + ' got ' + a + ' want ' + b + ' ±' + tol);

// ---------- helpers ----------
function mk(diff, seed, w, h, level) {
  return new AC.World({ seed: seed || 1, difficulty: diff || 'normal', width: w || 960, height: h || 540, level: level || 0 });
}
function run(w, s, onEv) {
  const n = Math.round(s / H), ev = [];
  for (let i = 0; i < n; i++) { w.update(H); for (const e of w.drainEvents()) { ev.push(e); if (onEv) onEv(e, w); } }
  return ev;
}
/** release the held crate so that it touches the top surface at rest offset dx (no sideways speed, no sway) */
function dropAt(w, dx) {
  w.tower.sway = w.tower.swayV = 0;
  w.held.x = w.tower.topX + dx; w.held.hvx = 0;
  w.saucer.vx = 0;
  assert.ok(w.drop(), 'drop accepted');
}
/** run until the next crate is held (or game over / goal), returning the events */
function resolve(w, max) {
  const ev = []; let t = 0; max = max || 6;
  do { w.update(H); t += H; ev.push(...w.drainEvents()); } while (!(w.phase === 'swing' && w.held && w.held.t === 0 && t > 0.05) && w.phase !== 'over' && w.phase !== 'goal' && t < max);
  return ev;
}
const types = ev => ev.map(e => e.type);
const of = (ev, t) => ev.filter(e => e.type === t);
function playBot(diff, seed, skill, maxS, opts) {
  opts = opts || {};
  const w = mk(diff, seed, opts.w, opts.h);
  const bot = new AC.Bot(w, { skill, seed: seed * 3 + 1 });
  const wx = opts.weather ? new AC.Weather({ width: w.layout.width, height: w.layout.height, seed }) : null;
  let t = 0, maxP = 0, firstLevel = null, camBad = 0, lightBad = 0; const ev = [], dt = opts.dt || 1 / 60, lightTrack = {};
  while (w.phase !== 'over' && t < maxS) {
    bot.step(dt); w.update(dt);
    if (!(w.light >= C.nightEnd - 1e-9 && w.light <= 1 + 1e-9) || !(w.dayT >= 0 && w.dayT <= 4 + 1e-9)) lightBad++;
    if (opts.lightCheck) (lightTrack[w.level] = lightTrack[w.level] || []).push(w.light);
    for (const x of w.drainEvents()) {
      ev.push(x.type);
      if (x.type === 'levelUp' && firstLevel === null) firstLevel = t;
      if (wx) {
        if (x.type === 'levelUp') wx.setLevel(x.zone);
        if (x.type === 'perfect') wx.burst('star', x.crate.x, x.crate.y, 12, { speed: 220 });
        if (x.type === 'land') wx.burst('puff', x.crate.x, x.crate.y + x.crate.h / 2, 6, { up: 1, gravity: 60 });
        if (x.type === 'goal') wx.burst('sparkle', x.x, x.y, 30, { speed: 260, gravity: -40 });
        if (x.type === 'apple') wx.burst('applebit', x.x, x.y, 8, {});
        if (x.type === 'lantern') wx.burst('spark', x.crate.x, x.crate.y, 8, { glow: true });
      }
    }
    if (opts.camCheck && (w.phase === 'swing' || w.phase === 'fall' || w.phase === 'settle')) {
      if (w.tower.topY - w.cam.y < w.layout.topLine - 1) camBad++;
    }
    if (wx) { wx.update(dt, w.cam.y); maxP = Math.max(maxP, wx.particles.length); }
    t += dt;
  }
  return { w, t, bot, ev, maxP, firstLevel, camBad, lightBad, lightTrack };
}

// ---------- RNG / layout ----------
test('rng: deterministic, in range, API', () => {
  const a = new AC.RNG(42), b = new AC.RNG(42), c = new AC.RNG('x');
  for (let i = 0; i < 300; i++) { const x = a.next(); assert.strictEqual(x, b.next()); assert.ok(x >= 0 && x < 1); }
  for (const f of ['next', 'range', 'int', 'pick', 'chance', 'gauss', 'sign', 'fork']) assert.strictEqual(typeof c[f], 'function', f);
});

test('layout: DESIGN §2 numbers (landscape, portrait, wide)', () => {
  const L = AC.World.computeLayout(960, 540);
  assert.strictEqual(L.unit, 100); assert.strictEqual(L.groundY, 400); assert.strictEqual(L.cx, 480);
  near(L.saucerScreenY, 172, 1e-9); near(L.topLine, 362, 1e-9);   // QA 2026-11-19: Ziggy below the HUD, apple band kept
  // the apple band (topLine − saucer − 1.65 unit) stays open in landscape, and 4:3 iPads get the full 1.95-unit clearance
  for (const [vw, vh] of [[960, 540], [1280, 720], [844, 390], [1366, 1024], [1024, 768], [1180, 820]]) {
    const Q = AC.World.computeLayout(vw, vh);
    assert.ok(Q.topLine - Q.saucerScreenY - 1.65 * Q.unit >= 0.25 * Q.unit - 1e-9, vw + 'x' + vh + ' apple band');
    assert.ok(Q.saucerScreenY >= 1.72 * Q.unit - 1e-9 && Q.saucerScreenY >= 0.17 * vh + 34 - 1e-9, vw + 'x' + vh + ' below the HUD');
  }
  near(AC.World.computeLayout(1366, 1024).saucerScreenY, 1.95 * (1366 / 9.6), 1e-9); near(AC.World.computeLayout(1366, 1024).topLine, 0.6 * 1024, 1e-9); near(L.crateW0, 110, 1e-9); near(L.crateH0, 110 * 2 / 3, 1e-9);
  near(L.swingA, 288, 1e-9); assert.ok(!L.portrait);
  const P = AC.World.computeLayout(560, 1000);
  assert.ok(P.portrait); near(P.unit, 560 / 6, 1e-9); near(P.topLine, 560, 1e-9); near(P.swingA, 0.34 * 560, 1e-9);
  near(AC.World.computeLayout(1280, 540).swingA, 300, 1e-9);
  const w = mk(); near(w.base.w, 240, 1e-9); near(w.base.h, 64, 1e-9); near(w.base.top, 400 - 64 + 4, 1e-9);
});

// ---------- determinism ----------
test('determinism: same seed + same inputs → same state; different seed differs', () => {
  const sim = (seed) => {
    const w = mk('normal', seed); const drops = [0.9, 2.3, 4.1, 5.0, 7.7, 9.2, 11.5, 13.0, 15.2, 18.8];
    let t = 0, k = 0;
    while (t < 22) { if (k < drops.length && t >= drops[k]) { w.drop(); k++; } w.update(1 / 60); t += 1 / 60; }
    return w;
  };
  const a = sim(5), b = sim(5), c = sim(6);
  deq(a.getState(), b.getState());
  assert.ok(a.stats.drops >= 3, 'drops ' + a.stats.drops);
  assert.notDeepStrictEqual(J(a.getState()), J(c.getState()));
  // frame-rate independence: 1/60 frames vs 1/30 frames with the same press times (on step boundaries)
  const f = (dt) => { const w = mk('easy', 9); let t = 0; const press = [1, 3, 5]; let k = 0;
    while (t < 8 - 1e-9) { if (k < press.length && t >= press[k] - 1e-9) { w.drop(); k++; } w.update(dt); t += dt; } return w; };
  deq(f(1 / 60).getState(), f(1 / 30).getState());
});

// ---------- saucer ----------
test('saucer: x = cx + swingA·sin(phase), eases at the edges, held crate lags on a spring', () => {
  const w = mk('normal'); const L = w.layout, W = w.planet.swingW;
  let minX = 1e9, maxX = -1e9, maxLag = 0, edgeV = 1e9, midV = 0;
  for (let i = 0; i < 120 * 8; i++) {
    w.update(H);
    near(w.saucer.x, L.cx + L.swingA * Math.sin(w.saucer.phase), 1e-6);
    minX = Math.min(minX, w.saucer.x); maxX = Math.max(maxX, w.saucer.x);
    const v = Math.abs(w.saucer.vx);
    if (Math.abs(w.saucer.x - L.cx) > 0.98 * L.swingA) edgeV = Math.min(edgeV, v);
    if (Math.abs(w.saucer.x - L.cx) < 0.05 * L.swingA) midV = Math.max(midV, v);
    maxLag = Math.max(maxLag, Math.abs(w.held.x - w.saucer.x));
    near(w.held.y, w.saucer.y + C.emitterDY * L.unit + C.beamGap * L.unit + w.held.h / 2, 1e-6);
    assert.strictEqual(w.saucer.scale, 1);
  }
  near(maxX - L.cx, L.swingA, 2); near(L.cx - minX, L.swingA, 2);
  near(midV, L.swingA * W, 1, 'peak speed at the centre');
  assert.ok(edgeV < 0.25 * midV, 'slow at the edges ' + edgeV);
  assert.ok(maxLag > 2 && maxLag < 0.4 * w.held.w, 'spring lag ' + maxLag);
  // Easy swings slower than Normal, later loops faster
  assert.ok(mk('easy').planet.swingW < W && mk('normal', 1, 960, 540, 4).planet.swingW > W);
  assert.ok(Math.abs(w.saucer.tilt) <= C.tiltMax + 1e-9);
});

// ---------- falling ----------
test('fall: parabolic y(t) = ½gt², keeps inherit·vx, small spin (dawn: no drag)', () => {
  const w = mk('normal');
  w.update(0.4);                            // saucer moving
  const vx0 = w.saucer.vx; assert.ok(Math.abs(vx0) > 100);
  const c = w.held, x0 = c.x, y0 = c.y;
  w.drainEvents(); w.drop();
  const ev = w.drainEvents(); assert.strictEqual(ev[0].type, 'drop'); near(ev[0].vx, C.inherit * vx0, 1e-9);
  const g = w.planet.g * w.layout.unit / 100;
  let t = 0;
  while (c.state === 'falling') {
    w.update(H); t += H;
    if (c.state !== 'falling') break;
    near(c.y - y0, 0.5 * g * t * t, 1e-6, 'y at ' + t.toFixed(3));
    near(c.x - x0, C.inherit * vx0 * t, 1e-6, 'x at ' + t.toFixed(3));
  }
  assert.ok(t > 0.3 && t < 1.2, 'fall time ' + t);
  // drag zones slow the drift (noon breeze)
  const d = mk('normal', 1, 960, 540, 1); d.update(0.4); const vxd = d.saucer.vx, x1 = d.held.x; d.drop();
  d.update(0.3); assert.ok(Math.abs(d.held === null && d.falling ? d.falling.x - x1 : 0) < Math.abs(C.inherit * vxd * 0.3));
});

test('predictLanding: pure and matches the real landing (with sway and sideways speed)', () => {
  const w = mk('normal', 3);
  w.setTower([0, 10, 0]); w.tower.swayV = 60;
  w.update(0.37);
  const before = J(w.getState());
  const p = w.predictLanding();
  deq(w.getState(), before, 'pure');
  assert.ok(p && 'x' in p && 'dx' in p && 'perfect' in p && 'ok' in p && 'landY' in p && 'lit' in p);
  assert.ok(p.lit >= w.light - 1e-9 && p.lit <= 1);
  w.drop();
  const ev = resolve(w);
  const land = of(ev, 'land')[0] || null;
  if (p.ok) { assert.ok(land); near(land.dx, p.dx, 1e-6); assert.strictEqual(land.perfect, p.perfect); }
  else assert.ok(of(ev, 'miss').length === 1);
  assert.strictEqual(mk().predictLanding() !== null, true);
});

// ---------- landing rules ----------
test('perfect: within perfectTol·w snaps to the top centre, combo +1, light sway, squash', () => {
  const w = mk('normal');
  dropAt(w, 0.1 * w.held.w);
  const ev = resolve(w);
  const p = of(ev, 'perfect')[0]; assert.ok(p, types(ev).join(','));
  assert.strictEqual(p.combo, 1);
  const c = p.crate;
  assert.strictEqual(c.state, 'placed'); assert.ok(c.perfect);
  near(c.x, w.base.x, 0.05, 'snapped');
  near(c.y, w.base.top - c.h / 2, 1e-9);
  assert.strictEqual(w.placed, 1);
  assert.ok(Math.abs(w.tower.sway) < 4, 'perfect drops barely sway');
  const land = of(ev, 'land')[0]; assert.ok(land.speed > 0 && land.perfect);
  // squash decays
  const w2 = mk('normal'); dropAt(w2, 0); let sq = 0;
  for (let i = 0; i < 240 && !sq; i++) { w2.update(H); const c2 = w2.crates.find(k => k.state === 'placed'); if (c2) sq = c2.squash; }
  assert.ok(sq >= C.squashMin, 'squash ' + sq);
});

test('edge: off-centre but centre over the top → stays, combo breaks, tower sways (assist on Easy)', () => {
  const w = mk('hard');                    // hard: a small beam assist → stays near where it touched
  dropAt(w, 0); resolve(w);
  dropAt(w, 0); resolve(w);
  const top = w.tower.topX, dx = 0.38 * w.held.w;
  dropAt(w, dx);
  const ev = resolve(w);
  const e = of(ev, 'edge')[0]; assert.ok(e, types(ev).join(','));
  near(e.dx, dx, 1e-6);
  assert.ok(of(ev, 'comboBreak').length === 1 && w.combo === 0);
  const c = e.crate; near(c.tx, top + dx * (1 - C.difficulty.hard.assist), 1e-6); near(c.x, c.tx, 0.1); assert.strictEqual(c.state, 'placed');
  let maxS = 0; for (let i = 0; i < 240; i++) { w.update(H); maxS = Math.max(maxS, Math.abs(w.tower.sway)); }
  assert.ok(maxS > 5, 'sways ' + maxS);
  // Easy: the beam pulls it 40 % back to the centre (smoothly)
  const e2 = mk('easy'); const dx2 = 0.35 * e2.held.w; dropAt(e2, dx2);
  let jumps = 0, last = null;
  for (let i = 0; i < 120; i++) { e2.update(H); const c2 = e2.tower.list[0]; if (c2) { if (last !== null && Math.abs(c2.x - last) > 0.3 * dx2) jumps++; last = c2.x; } }
  near(e2.tower.list[0].x, e2.base.x + dx2 * (1 - C.difficulty.easy.assist), 0.1); assert.strictEqual(jumps, 0);
});

test('miss: centre past the edge → pivots on the corner, tumbles to the ground, gone; heart lost', () => {
  const w = mk('normal');
  dropAt(w, 0); resolve(w);
  const h0 = w.hearts, top = w.tower.list[0], c = w.held, dx = 0.72 * c.w;
  dropAt(w, dx);
  const ev = [];
  let maxRot = 0, minX = 1e9, grounded = false, wentAway = false, pivotTrack = [];
  for (let i = 0; i < 120 * 5; i++) {
    w.update(H); ev.push(...w.drainEvents());
    if (c.state === 'toppling') {
      maxRot = Math.max(maxRot, c.rot);
      if (c.pivot) pivotTrack.push(Math.hypot(c.x - (top.x + top.w / 2), c.y - (top.y - top.h / 2)));
      if (c.onGround) grounded = true;
      if (c.x > top.x + top.w / 2 + c.w / 2) wentAway = true;
      minX = Math.min(minX, c.x);
    }
    if (c.state === 'gone') break;
  }
  assert.ok(of(ev, 'miss').length === 1, types(ev).join(','));
  assert.strictEqual(w.hearts, h0 - 1); assert.ok(of(ev, 'heartLost').length === 1);
  assert.ok(pivotTrack.length > 3, 'pivoted for a while');
  const r0 = pivotTrack[0]; for (const r of pivotTrack) near(r, r0, 0.01, 'rigid rotation about the corner');
  assert.ok(maxRot > 1.0, 'tumbles (rot ' + maxRot.toFixed(2) + ')');
  assert.ok(wentAway && grounded, 'falls beside the tower to the ground');
  assert.strictEqual(c.state, 'gone'); assert.ok(!w.crates.includes(c));
  assert.strictEqual(w.placed, 1);
  // a crate that misses the tower completely also counts as a miss
  const w2 = mk('normal'); dropAt(w2, 2.5 * w2.held.w); const ev2 = resolve(w2);
  assert.ok(of(ev2, 'miss').length === 1 && of(ev2, 'land').length === 0);
});

test('centre of mass: a leaning tower topples its top part off the heavier side (one heart)', () => {
  const w = mk('hard', 1);
  w.setTower([0, 30, 60]);                // each crate's centre is over the one below; COMs still inside
  assert.strictEqual(w.placed, 3);
  const h0 = w.hearts, wc = w.held.w;
  const above = w.tower.list.slice(1);
  dropAt(w, 35);                           // x = cx + 95: COM of the 3 crates above the bottom one = cx + 61.7 > its edge (55)
  const ev = [];
  for (let i = 0; i < 120 * 3; i++) { w.update(H); ev.push(...w.drainEvents()); }
  const tp = of(ev, 'topple')[0]; assert.ok(tp, types(ev).join(','));
  assert.strictEqual(tp.count, 3);
  assert.strictEqual(w.tower.list.length, 1); assert.strictEqual(w.placed, 1);
  assert.strictEqual(w.hearts, h0 - 1);
  assert.strictEqual(of(ev, 'heartLost').length, 1);
  for (const c of above) assert.ok(c.state === 'toppling' || c.state === 'gone');
  assert.ok(above.every(c => c.x > w.layout.cx + 55 || c.state === 'gone'), 'fell to the right (heavier side)');
  assert.ok(above.some(c => c.rot > 0.5 || c.state === 'gone'), 'rotated clockwise');
  assert.ok(wc > 0);
  // a stable lean does not topple
  const s = mk('hard'); s.setTower([0, 30, 60]); dropAt(s, -20); const ev2 = resolve(s);
  assert.strictEqual(of(ev2, 'topple').length, 0); assert.strictEqual(s.placed, 4);
});

test('scoring: +10 per crate, perfect +10×combo (cap 5), apple +5 / +10 glow, goal bonus', () => {
  const w = mk('normal'); w.planet.appleChance = 0; w.appleList.length = 0;
  {
  for (let i = 0; i < 3; i++) { dropAt(w, 0); resolve(w); }
  assert.strictEqual(w.score, 3 * 10 + 10 * (1 + 2 + 3)); assert.strictEqual(w.combo, 3); assert.strictEqual(w.maxCombo, 3);
  for (let i = 0; i < 3; i++) { dropAt(w, 0); resolve(w); }
  assert.strictEqual(w.score, 6 * 10 + 10 * (1 + 2 + 3 + 4 + 5 + 5), 'combo multiplier capped at 5');
  const s0 = w.score; dropAt(w, 0.4 * w.held.w); resolve(w);
  assert.strictEqual(w.score, s0 + 10); assert.strictEqual(w.combo, 0);
  }
  // an apple (daylight +5, dark +10), then the goal bonus = 100 × (zone + 1) × (loop + 1)
  const s1 = w.score; w._collectApples({ x: 0, y: 0, w: 0, h: 0 });
  w.appleList.push(w._newApple(0, 0, 0)); w.appleList[0].y = 0; w._collectApples({ x: 0, y: 0, w: 2, h: 2 });
  assert.strictEqual(w.score, s1 + C.applePoints);
  // glow apples need the dark of a darkening time of day (sunset/night): a looped Dawn's sunrise from Night's
  // darkness is not "dark" (functional QA 2026-11-19 P3-2)
  w.light = 0.3; w.appleList.push(w._newApple(0, 0, 0)); w.appleList[1].y = 0;
  const s1a = w.score; w._collectApples({ x: 0, y: 0, w: 2, h: 2 });
  assert.strictEqual(w.score, s1a + C.applePoints, 'dawn sunrise at light 0.3: a plain apple');
  const n = mk('normal', 1, 960, 540, 3); n.planet.appleChance = 0; n.appleList.length = 0;
  n.appleList.push(n._newApple(0, 0, 0)); n.appleList[0].y = 0; assert.ok(n.light < C.glowBelow && n.appleList[0].glow);
  const s1b = n.score; n._collectApples({ x: 0, y: 0, w: 2, h: 2 });
  assert.strictEqual(n.score, s1b + C.appleGlowPoints);
  const dw = mk('normal', 1, 960, 540, 3); dw._startLevel(4, true, false);   // loop: Dawn 2 starts in Night's light
  assert.ok(dw.light < C.glowBelow && !dw._dark(), 'looped dawn sunrise is not glow time');
  const g = mk('normal', 1, 960, 540, 6); g.planet.appleChance = 0; g.appleList.length = 0; g.setTower(new Array(g.goal - 1).fill(0));
  dropAt(g, 0); const s2 = g.score; const ev = run(g, 1.5);
  assert.strictEqual(of(ev, 'goal')[0].bonus, 100 * 3 * 2); assert.strictEqual(g.score, s2 + 20 + 600);
});

function putApple(w, x, y) {
  const a = w._newApple(x, y - w._camTarget(), 0); a.baseY = a.y = y; w.appleList.push(a); return a;
}

test('apples: collected by a falling crate (+5, event, total), at most 3 alive, in the fall band, flutter + rock', () => {
  const w = mk('normal', 2);
  let maxAlive = 0, frames = new Set(), maxRot = 0;
  const sim = mk('normal', 4); const bot = new AC.Bot(sim, { skill: 1, seed: 1 });
  for (let i = 0; i < 60 * 60; i++) {
    bot.step(1 / 60); sim.update(1 / 60);
    const fl = sim.appleList.filter(c => c.state === 'float');
    maxAlive = Math.max(maxAlive, fl.length);
    for (const c of fl) {
      assert.ok(c.y > sim.saucer.y + 0.5 * sim.layout.unit && c.y < sim.tower.topY, 'in the fall band');
      assert.ok(Math.abs(c.x - sim.layout.cx) <= sim.layout.swingA + 1e-6);
      for (const k of ['id', 'x', 'y', 'prevX', 'prevY', 'r', 't', 'frame', 'rot', 'state', 'glow']) assert.ok(k in c, k);
      frames.add(c.frame); maxRot = Math.max(maxRot, Math.abs(c.rot));
      assert.strictEqual(c.glow, sim._dark());
    }
  }
  assert.ok(maxAlive >= 1 && maxAlive <= 3, 'alive ' + maxAlive);
  assert.ok(sim.stats.apples > 0, 'the bot picked some up');
  assert.ok(frames.has(0) && frames.has(1), 'leaf flutter frames');
  assert.ok(maxRot > 0.05 && maxRot <= C.apples.rock + 1e-9, 'rock ' + maxRot);
  // an apple right in the path is collected
  const c = w.held; w.appleList.length = 0;
  putApple(w, w.tower.topX, c.y + 60);
  const s0 = w.score;
  dropAt(w, 0);
  const ev = resolve(w);
  const ce = of(ev, 'apple')[0]; assert.ok(ce, types(ev).join(','));
  assert.strictEqual(ce.total, 1); assert.strictEqual(w.apples, 1); assert.strictEqual(ce.apple.state !== 'float', true);
  assert.strictEqual(ce.points, 5); assert.strictEqual(ce.glow, false);
  assert.strictEqual(w.score, s0 + 5 + 20);
  // in the dark the same apple is a glow apple worth 10
  const d = mk('normal', 2, 960, 540, 3); d.appleList.length = 0;
  assert.ok(d.light < C.glowBelow);
  putApple(d, d.tower.topX, d.held.y + 60);
  dropAt(d, 0); const ev2 = resolve(d); const ge = of(ev2, 'apple')[0];
  assert.ok(ge && ge.glow && ge.points === C.appleGlowPoints, JSON.stringify(ge && { p: ge.points, g: ge.glow }));
});

test('pie: every 5 apples Granny Boo bakes a pie → +1 heart (up to max)', () => {
  const w = mk('normal', 2);
  w.hearts = 2; w.pieApples = 4; w.appleList.length = 0;
  putApple(w, w.tower.topX, w.held.y + 60);
  dropAt(w, 0);
  const ev = resolve(w);
  const p = of(ev, 'pie')[0]; assert.ok(p, types(ev).join(','));
  assert.strictEqual(p.gained, true); assert.strictEqual(p.hearts, 3); assert.strictEqual(w.hearts, 3);
  assert.strictEqual(w.pieApples, 0); assert.strictEqual(w.stats.pies, 1);
  // full hearts: the pie still comes, no heart gained
  w.pieApples = 4; w.appleList.length = 0; w._collectApples({ x: 0, y: 0, w: 0, h: 0 });
  putApple(w, 0, 0).y = 0; const e2 = []; w._collectApples({ x: 0, y: 0, w: 2, h: 2 }); e2.push(...w.drainEvents());
  const p2 = of(e2, 'pie')[0]; assert.ok(p2 && p2.gained === false && w.hearts === w.maxHearts);
  assert.strictEqual(w.saucer.scale, 1, 'no grow/shrink any more');
  assert.ok(!('grow' in w), 'no grow field');
});

test('light: zone light → next zone light with tower progress (smoothstep, eased), in range, monotonic within a level', () => {
  for (let z = 0; z < 4; z++) {
    const w = mk('normal', 1, 960, 540, z);
    const Z = C.zones[z], end = z === 3 ? C.nightEnd : C.zones[z + 1].light;
    near(w.light, Z.light, 1e-9, 'starts at the zone light');
    assert.strictEqual(w.lightTint, Z.key); near(w.dayT, z, 1e-9);
    let prev = w.light; const dir = Math.sign(end - Z.light);
    for (let n = 1; n <= w.goal - 1; n++) {
      w.setTower(new Array(n).fill(0));
      for (let i = 0; i < 120 * 2; i++) {
        w.update(H);
        assert.ok(dir * (w.light - prev) >= -1e-9, 'monotonic ' + z + ' n' + n);
        prev = w.light;
      }
      const s = n / w.goal, target = Z.light + (end - Z.light) * s * s * (3 - 2 * s);
      assert.ok(Math.abs(w.light - target) < 0.02, 'eased toward the target ' + w.light + ' ' + target);
      assert.ok(w.dayT > z && w.dayT < z + 1);
    }
    // a topple never brings the light back
    const before = w.light; w.setTower([0]); run(w, 2);
    assert.ok(dir * (w.light - before) >= -1e-9, 'progress is a high-water mark');
  }
  // played: light in [nightEnd, 1] and monotonic within each level (small tolerance for the ease at level change)
  const r = playBot('normal', 5, 1, 260, { lightCheck: true });
  assert.ok(r.w.level >= 4, 'level ' + r.w.level); assert.strictEqual(r.lightBad, 0);
  for (const [lv, arr] of Object.entries(r.lightTrack)) {
    const z = lv % 4, end = z === 3 ? C.nightEnd : C.zones[z + 1].light, dir = Math.sign(end - C.zones[z].light);
    for (let i = 1; i < arr.length; i++) assert.ok(dir * (arr[i] - arr[i - 1]) >= -1e-3, 'level ' + lv + ' step ' + i + ': ' + arr[i - 1] + ' → ' + arr[i]);
  }
  // after Night the next Dawn eases up from the dark (no jump)
  const lv4 = r.lightTrack[4]; assert.ok(lv4 && lv4[0] < 0.4 && lv4[lv4.length - 1] > 0.8, 'sunrise ' + (lv4 && lv4[0]));
  for (let i = 1; i < lv4.length; i++) assert.ok(Math.abs(lv4[i] - lv4[i - 1]) < 0.01, 'eases');
});

test('lanterns: a perfect landing hangs a lantern (alternating sides, swings on its hook), event lantern', () => {
  const w = mk('normal');
  dropAt(w, 0); const ev = resolve(w);
  const le = of(ev, 'lantern')[0]; assert.ok(le, types(ev).join(','));
  const c1 = le.crate; assert.ok(c1.lantern && Math.abs(c1.lanternSide) === 1);
  dropAt(w, 0); const c2 = of(resolve(w), 'lantern')[0].crate;
  assert.strictEqual(c2.lanternSide, -c1.lanternSide, 'alternates');
  assert.strictEqual(w.getState().lanterns, 2); assert.strictEqual(w.lanterns, 2);
  // an edge landing does not
  dropAt(w, 0.4 * w.held.w); const ev3 = resolve(w); assert.strictEqual(of(ev3, 'lantern').length, 0);
  assert.strictEqual(of(ev3, 'edge')[0].crate.lantern, false);
  // the pendulum: kicked when hung, driven by sway, damped, bounded
  let maxR = 0; for (let i = 0; i < 120; i++) { w.update(H); maxR = Math.max(maxR, Math.abs(c1.lanternRot)); }
  assert.ok(maxR > 0.05 && maxR <= C.lantern.maxRot + 1e-9, 'swings ' + maxR);
  run(w, 8); assert.ok(Math.abs(c2.lanternRot) < 0.05, 'settles ' + c2.lanternRot);
  const lp = w.lanternPos(c1);
  assert.ok(Math.abs(lp.x - (c1.x + w.swayOffset(c1.y) + c1.lanternSide * (c1.w / 2 - C.lantern.hookIn * w.layout.unit))) < 0.5);
  assert.ok(lp.ly > lp.y && lp.y > c1.y - c1.h / 2, 'hangs below the hook on the crate face');
});

test('lights(): pure list — Ziggy, held crate, top 10 lanterns, glow apples when dark, flag; lit at the top', () => {
  const w = mk('normal', 1, 960, 540, 3);
  const U = w.layout.unit;
  const st = J(w.getState()); const L0 = w.lights(); deq(w.getState(), st, 'pure');
  deq(J(w.lights()), J(L0), 'repeatable');
  const z = L0.find(l => l.kind === 'ziggy'); assert.ok(z); near(z.r, 2.0 * U, 1e-9); near(z.a, 1, 1e-9);
  near(z.x, w.saucer.x, 1e-9); near(z.y, w.saucer.y + C.emitterDY * U, 1e-9);
  const hl = L0.find(l => l.kind === 'held'); assert.ok(hl); near(hl.r, 1.1 * U, 1e-9); near(hl.a, 0.6, 1e-9);
  for (const l of L0) for (const k of ['x', 'y', 'r', 'a']) assert.ok(isFinite(l[k]), k);
  // lanterns: only the top 10
  const litBare = w.predictLanding().lit;
  w.setTower(new Array(14).fill(0), { lanterns: true });
  const lan = w.lights().filter(l => l.kind === 'lantern');
  assert.strictEqual(lan.length, 10); near(lan[0].r, 1.5 * U, 1e-9); near(lan[0].a, 0.9, 1e-9);
  const topY = w.tower.topY; assert.ok(lan.every(l => l.y > topY - 1 && l.y < topY + 10.5 * w.held.h), 'the top ones');
  const litLan = w.predictLanding().lit;
  w.setTower(new Array(14).fill(0)); const litNone = w.predictLanding().lit;
  assert.ok(litLan > litNone + 0.2, 'lanterns light the top: ' + litNone + ' → ' + litLan);
  near(litNone, w.light, 1e-9, 'unlit top = ambient'); assert.ok(litBare >= w.light);
  // glow apples only when dark
  w.appleList.length = 0; putApple(w, w.layout.cx, w.held.y + 60);
  assert.strictEqual(w.lights().filter(l => l.kind === 'apple').length, 1);
  w.light = 0.9; assert.strictEqual(w.lights().filter(l => l.kind === 'apple').length, 0);
  // the flag lantern during the goal
  const g = mk('normal'); g.setTower(new Array(g.goal - 1).fill(0)); dropAt(g, 0); run(g, 1.2);
  assert.strictEqual(g.phase, 'goal'); const fl = g.lights().find(l => l.kind === 'flag'); assert.ok(fl); near(fl.r, 1.2 * g.layout.unit, 1e-9);
});

test('goal → flag → Granny Boo floats in (ease-out arc), hovers + waves, floats up in travel → levelUp', () => {
  const w = mk('normal', 1);
  w.setTower(new Array(w.goal - 1).fill(0));
  w.hearts = 2;
  dropAt(w, 0);
  const ev = []; const at = {}; let t = 0, home = null; const path = [], hov = [], out = []; let waved = false;
  for (let i = 0; i < 120 * 7; i++) {
    w.update(H); t += H;
    for (const e of w.drainEvents()) { ev.push(e); if (!(e.type in at)) at[e.type] = t; }
    const g = w.ghost;
    if (g) {
      for (const k of ['x', 'y', 'prevX', 'prevY', 'state', 't', 'wave']) assert.ok(k in g, k);
      if (g.state === 'in') path.push([g.x, g.y]);
      if (g.state === 'hover') { hov.push([g.x, g.y]); if (!home) home = w._ghostHome(g.side); if (g.wave) waved = true; }
      if (g.state === 'out') out.push([g.x, g.y, w.cam.y]);
    }
    if (w.level === 1 && w.phase === 'swing' && t > at.levelUp) break;
  }
  const seq = types(ev).filter(x => ['land', 'goal', 'ghost', 'levelUp'].includes(x));
  deq(seq, ['land', 'goal', 'ghost', 'levelUp']);
  const goal = of(ev, 'goal')[0]; assert.strictEqual(goal.bonus, 100);
  assert.ok(Math.abs(at.ghost - at.goal - C.ghostArrive) < 0.1, 'ghost after ' + (at.ghost - at.goal));
  assert.ok(Math.abs(at.levelUp - at.goal - C.goalTime - C.travelTime) < 0.1, 'levelUp after ' + (at.levelUp - at.goal));
  // arc: starts off-screen at the side, x approaches monotonically and decelerates, y descends; arrives without a jump
  assert.ok(path.length > 30);
  assert.ok(path[0][0] > w.layout.width, 'starts off-screen right');
  for (let i = 1; i < path.length; i++) { assert.ok(path[i][0] <= path[i - 1][0] + 1e-9, 'x monotonic'); assert.ok(path[i][1] >= path[i - 1][1] - 1e-9, 'y floats down'); }
  const vEnd = Math.hypot(path[path.length - 1][0] - path[path.length - 2][0], path[path.length - 1][1] - path[path.length - 2][1]) / H;
  const vMax = Math.max(...path.slice(1).map((p, i) => Math.hypot(p[0] - path[i][0], p[1] - path[i][1]) / H));
  assert.ok(vEnd < 0.1 * vMax, 'eases out: ' + vEnd.toFixed(1) + ' / ' + vMax.toFixed(1));
  // hover beside the tower top with a gentle bob, then waves
  assert.ok(hov.length > 100 && waved);
  for (const [x, y] of hov) { near(x, home.x, 1e-6); assert.ok(Math.abs(y - home.y) <= C.ghostBob * w.layout.unit + 1e-6); }
  assert.ok(Math.abs(home.x - w.layout.cx) > 1.0 * w.layout.unit, 'beside the tower');
  // out: floats up (and away), accelerating
  assert.ok(out.length > 10); assert.ok(out[out.length - 1][1] < out[0][1] - 50, 'rises');
  const lu = of(ev, 'levelUp')[0]; assert.strictEqual(lu.level, 1); assert.strictEqual(lu.zone, 1);
  assert.strictEqual(w.level, 1); assert.strictEqual(w.zone, 1); assert.strictEqual(w.placed, 0); assert.strictEqual(w.tower.list.length, 0);
  assert.strictEqual(w.goal, 12); assert.strictEqual(w.hearts, 3); assert.ok(w.held && w.phase === 'swing');
  assert.strictEqual(w.flag, null); assert.strictEqual(w.ghost, null);
  assert.ok(Math.abs(w.cam.y) < 80, 'camera back near the ground ' + w.cam.y);
  assert.ok(of(ev, 'spawn').length >= 1);
  // gotoLevel jumps and emits levelUp; loops
  w.gotoLevel(5); const e2 = w.drainEvents(); assert.strictEqual(of(e2, 'levelUp')[0].level, 5);
  assert.strictEqual(w.zone, 1); assert.strictEqual(w.loop, 1); assert.strictEqual(w.goal, C.zones[1].goal + C.loopGoal);
});

test('levels: goal show through dawn → noon → sunset → night → dawn (loop), zone keys and light continuity', () => {
  const w = mk('easy', 3);
  const keys = [], lightAt = [];
  for (let lv = 0; lv < 5; lv++) {
    assert.strictEqual(w.level, lv); assert.strictEqual(w.zone, lv % 4); assert.strictEqual(w.planet.key, ['dawn', 'noon', 'sunset', 'night'][lv % 4]);
    keys.push(w.planet.key);
    w.setTower(new Array(w.goal - 1).fill(0)); dropAt(w, 0);
    let before = null, guard = 0;
    while (w.level === lv && guard++ < 120 * 8) { before = w.light; w.update(H); }
    lightAt.push([before, w.light]);
    const ev = w.drainEvents(); assert.ok(of(ev, 'levelUp').length === 1);
  }
  deq(keys, ['dawn', 'noon', 'sunset', 'night', 'dawn']);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(lightAt[i][1] - lightAt[i][0]) < 1e-3, 'continuous at levelUp ' + i);
  near(lightAt[3][0], C.nightEnd, 0.01, 'night ends at nightEnd');
  assert.ok(lightAt[3][1] < 0.3, 'dawn after night starts from the dark, then eases up');
  assert.strictEqual(w.loop, 1); assert.ok(w.planet.swingW > C.zones[0].swingW * C.difficulty.easy.swing);
});

test('game over at 0 hearts (after the tumble), input ignored afterwards', () => {
  const w = mk('normal'); w.hearts = 1;
  dropAt(w, 3 * w.held.w);
  const ev = []; for (let i = 0; i < 120 * 3; i++) { w.update(H); ev.push(...w.drainEvents()); }
  deq(types(ev).filter(t => ['miss', 'heartLost', 'gameOver'].includes(t)), ['miss', 'heartLost', 'gameOver']);
  assert.strictEqual(w.phase, 'over'); assert.strictEqual(w.hearts, 0);
  assert.strictEqual(w.drop(), false); run(w, 1); assert.strictEqual(w.stats.drops, 1);
  assert.strictEqual(mk('easy').hearts, C.difficulty.easy.hearts); assert.strictEqual(mk('hard').maxHearts, 3);
});

test('drop buffer: a press during settle (≤ 0.25 s before the spawn) drops the next crate; older presses are ignored', () => {
  const w = mk('normal'); dropAt(w, 0);
  let t = 0; while (w.phase !== 'settle') { w.update(H); t += H; }
  run(w, C.settleTime - 0.15); w.drop(); run(w, 0.3);
  assert.strictEqual(w.stats.drops, 2, 'buffered press used');
  const v = mk('normal'); dropAt(v, 0);
  while (v.phase !== 'settle') v.update(H);
  v.drop(); run(v, C.settleTime + 0.2);
  assert.strictEqual(v.stats.drops, 1, 'stale press ignored'); assert.ok(v.held);
});

test('sway: damped spring — kicked by off-centre landings, decays, never overshoots wildly', () => {
  const w = mk('hard'); w.setTower([0, 0, 0, 0, 0]);
  w.tower.swayV = 150;
  const peaks = []; let last = 0, lastV = 1, maxAbs = 0;
  for (let i = 0; i < 120 * 6; i++) {
    w.update(H);
    const s = w.tower.sway; maxAbs = Math.max(maxAbs, Math.abs(s));
    if (Math.sign(w.tower.swayV) !== Math.sign(lastV)) peaks.push(Math.abs(s));
    lastV = w.tower.swayV; last = s;
  }
  assert.ok(maxAbs <= C.swayMax * w.layout.unit + 1e-9);
  assert.ok(peaks.length >= 3);
  for (let i = 1; i < peaks.length; i++) assert.ok(peaks[i] < peaks[i - 1] * 0.45, 'each swing smaller ' + peaks.map(p => p.toFixed(1)));
  assert.ok(Math.abs(last) < 0.5, 'settles');
  // swayOffset shape and lerp
  w.tower.sway = 20; w.tower.prevSway = 10;
  near(w.swayOffset(w.tower.topY), 20, 1e-9); near(w.swayOffset(w.layout.groundY), 0, 1e-9);
  const mid = w.layout.groundY - w.tower.height / 2; near(w.swayOffset(mid), 20 * Math.pow(0.5, 1.5), 1e-9);
  near(w.swayOffsetLerp(w.tower.topY, 0.5), 15, 1e-9);
});

// ---------- layout changes / camera ----------
test('setLayout: 960×540 → 560×1000 → 1280×540 re-anchors tower, rocket, apples and camera', () => {
  const w = mk('normal', 7);
  w.setTower([0, 20, 10, -10, 0, 15, 5]);
  const rel = (W) => W.tower.list.map(c => [(c.x - W.layout.cx) / W.layout.unit, (W.layout.groundY - c.y) / W.layout.unit, c.w / W.layout.unit]);
  const r0 = rel(w);
  for (const [W, Hh] of [[560, 1000], [1280, 540], [960, 540]]) {
    w.setLayout(W, Hh);
    const L = w.layout; assert.strictEqual(L.width, W); assert.strictEqual(L.height, Hh);
    const r = rel(w);
    for (let i = 0; i < r.length; i++) for (let k = 0; k < 3; k++) near(r[i][k], r0[i][k], 1e-9, W + 'x' + Hh + ' crate ' + i);
    near(w.base.x, L.cx, 1e-9); near(w.base.top, L.groundY - 0.64 * L.unit + 0.04 * L.unit, 1e-9);
    assert.ok(w.tower.topY - w.cam.y >= L.topLine - 1e-6, 'top below topLine');
    assert.ok(w.cam.y <= 0);
    near(w.saucer.y - w.cam.y, L.saucerScreenY, 0.05 * L.unit);
    assert.ok(Math.abs(w.saucer.x - L.cx) <= L.swingA + 1e-6);
    for (const c of w.appleList) assert.ok(c.x >= 0 && c.x <= W);
    run(w, 1);
  }
  // still plays after resizing
  dropAt(w, 0); const ev = resolve(w); assert.ok(of(ev, 'perfect').length === 1);
});

test('camera: critically damped, keeps the tower top at or below topLine, returns to the ground on a new time of day', () => {
  for (const [W, Hh] of [[960, 540], [560, 1000], [720, 1600]]) {
    const r = playBot('normal', 2, 1, 70, { w: W, h: Hh, camCheck: true });
    assert.strictEqual(r.camBad, 0, W + 'x' + Hh);
    assert.ok(r.w.level >= 1);
  }
  // no overshoot: after a tall tower appears the camera approaches monotonically
  const w = mk('normal'); w.setTower(new Array(8).fill(0)); w.cam.y = 0; w.cam.v = 0;
  let prev = 0, mono = true; for (let i = 0; i < 400; i++) { w.update(H); if (w.cam.y > prev + 1e-9) mono = false; prev = w.cam.y; }
  assert.ok(mono); near(w.cam.y, w._camTarget(), 0.5);
});

// ---------- weather ----------
test('weather: bounded particles for every zone and size, right sprites, glow at night, front ambient avoids the tower column', () => {
  const sizes = [[960, 540], [560, 1000], [720, 1600], [1280, 540]];
  const SPR = new Set(['bat_0', 'bat_1', 'firefly', 'wisp', 'petal', 'leaf', 'mist', 'sparkle', 'star', 'puff', 'heart', 'spark', 'applebit']);
  for (const [W, Hh] of sizes) {
    const L = AC.World.computeLayout(W, Hh);
    const wx = new AC.Weather({ width: W, height: Hh, seed: 3 });
    for (let z = 0; z < 4; z++) {
      wx.setLevel(z, { instant: z === 0 });
      const spr = new Set(); let maxP = 0, trail = 0, cam = 0, glowN = 0;
      for (let i = 0; i < 60 * 14; i++) {
        cam -= 0.8;                                                // camera rising
        if (i % 8 === 0) wx.burst(['puff', 'spark', 'applebit', 'heart'][i % 4], L.cx, L.groundY - 200 + cam, 24, { speed: 240 });
        wx.update(1 / 60, cam);
        maxP = Math.max(maxP, wx.particles.length);
        for (const p of wx.particles) {
          spr.add(p.sprite);
          assert.ok(SPR.has(p.sprite), 'sprite name ' + p.sprite);
          if (p.kind === 'trail') trail++;
          if (p.glow && p.kind !== 'burst') glowN++;
          if (p.kind === 'burst') assert.strictEqual(p.world, true);
          else assert.ok(!p.world);
          if (p.layer === 'front' && p.kind !== 'burst') {
            assert.ok(Math.abs(p.x - L.cx) >= 1.6 * L.unit - 1e-6, W + 'x' + Hh + ' zone ' + z + ' ' + p.kind + ' in the column at ' + p.x.toFixed(0));
          }
          assert.ok(p.alpha >= 0 && p.alpha <= 1.0001 && isFinite(p.x) && isFinite(p.y) && isFinite(p.rot));
          for (const k of ['sprite', 'x', 'y', 'size', 'rot', 'flipX', 'alpha', 'layer', 'glow']) assert.ok(k in p, k);
        }
      }
      assert.ok(maxP < 140, 'cap ' + maxP);
      const want = [['mist', 'petal'], ['leaf', 'sparkle'], ['bat_0', 'bat_1', 'leaf'], ['firefly', 'sparkle', 'star', 'wisp']][z];
      for (const s of want) assert.ok(spr.has(s), W + 'x' + Hh + ' zone ' + z + ' has ' + s);
      if (z === 3) { assert.ok(trail > 0, 'a shooting star within 14 s'); assert.ok(glowN > 0, 'glow particles at night'); }
      if (z < 2) assert.strictEqual(glowN, 0, 'no glow particles in daylight');
      assert.ok(wx.ambient.tint);
      const amb = wx.particles.filter(p => !['burst', 'trail', 'shoot', 'glint', 'wisp'].includes(p.kind));
      assert.ok(amb.length >= 15, 'ambient present ' + amb.length);
      assert.ok(amb.filter(p => p.layer === 'front').length > 0, 'some front particles');
      if (z === 3) assert.ok(wx.particles.filter(p => p.kind === 'firefly').every(p => p.glow));
    }
    wx.resize(W === 960 ? 560 : 960, 1200); wx.update(1 / 60, 0);
    assert.ok(wx.particles.length < 140);
  }
});

test('weather motion: petals swing like pendulums, leaves tumble, bats flap when climbing, fireflies wander smoothly and blink', () => {
  const wx = new AC.Weather({ width: 960, height: 540, seed: 5 });
  const dt = 1 / 60;
  // dawn petals: tilt follows the sideways velocity (rot ∝ cos φ ∝ dx/dt) and they sink
  wx.setLevel(0, { instant: true });
  const pe = wx.particles.find(p => p.kind === 'petal');
  let agree = 0, n = 0, x0 = pe.x, y0 = pe.by;
  for (let i = 0; i < 240; i++) { const px = pe.x; wx.update(dt, 0); const vx = (pe.x - px) / dt - pe.vx; if (Math.abs(vx) > 5) { n++; if (Math.sign(vx) === Math.sign(pe.rot)) agree++; } }
  assert.ok(n > 50 && agree / n > 0.9, 'tilt with the swing ' + agree + '/' + n);
  assert.ok(pe.by > y0 + 20, 'sinks'); assert.ok(isFinite(x0));
  // noon leaves: rotate continuously
  wx.setLevel(1, { instant: true });
  const lf = wx.particles.find(p => p.kind === 'leaf'); const r0 = lf.rot;
  run2(wx, 2); assert.ok(Math.abs(lf.rot - r0) > 2, 'tumbles ' + (lf.rot - r0));
  // sunset bats: wings flap faster while climbing than while dipping
  wx.setLevel(2, { instant: true });
  let up = 0, upN = 0, dn = 0, dnN = 0;
  const bats = wx.particles.filter(p => p.kind === 'bat'); assert.ok(bats.length >= 5);
  const last = bats.map(b => [b.sprite, b.y]);
  for (let i = 0; i < 600; i++) {
    wx.update(dt, 0);
    bats.forEach((b, k) => { const vy = b.y - last[k][1]; const fl = b.sprite !== last[k][0] ? 1 : 0;
      if (vy < -0.2) { up += fl; upN++; } else if (vy > 0.2) { dn += fl; dnN++; } last[k] = [b.sprite, b.y]; });
  }
  assert.ok(upN > 50 && dnN > 50 && up / upN > 2 * (dn / dnN), 'flap rate climbing ' + (up / upN).toFixed(3) + ' vs dipping ' + (dn / dnN).toFixed(3));
  assert.ok(bats.every(b => b.flipX === (b.vx < 0)), 'face the flight direction');
  // night fireflies: smooth path (no jumps), blink between dim and bright
  wx.setLevel(3, { instant: true });
  const ff = wx.particles.find(p => p.kind === 'firefly'); let maxStep = 0, lo = 1, hi = 0, px = ff.x, py = ff.y;
  for (let i = 0; i < 600; i++) { wx.update(dt, 0); maxStep = Math.max(maxStep, Math.hypot(ff.x - px, ff.y - py)); px = ff.x; py = ff.y; if (i > 60) { lo = Math.min(lo, ff.alpha); hi = Math.max(hi, ff.alpha); } }
  assert.ok(maxStep < 3, 'smooth wander ' + maxStep);
  assert.ok(hi > 0.6 && lo < 0.25, 'blinks ' + lo.toFixed(2) + '..' + hi.toFixed(2));
});
function run2(wx, s) { for (let i = 0; i < s * 60; i++) wx.update(1 / 60, 0); }

// ---------- bot ----------
test('bot: skill 1 clears dawn on every difficulty and survives long (perfect most of the time)', () => {
  for (const d of ['easy', 'normal', 'hard']) {
    const r = playBot(d, 3, 1, 240);
    assert.ok(r.firstLevel !== null && r.firstLevel < 60, d + ' cleared dawn in ' + r.firstLevel);
    assert.ok(r.w.phase !== 'over', d + ' survives 4 min');
    assert.ok(r.w.level >= 4, d + ' level ' + r.w.level);
    assert.ok(r.w.stats.perfect / r.w.stats.drops > 0.85, d + ' perfect ' + r.w.stats.perfect + '/' + r.w.stats.drops);
  }
});

test('first level (dawn) is easy: Easy + bot skill 0.35 (≈ a 6-year-old) clears it most of the time, in a casual pace', () => {
  let clear = 0, sum = 0; const N = 20;
  for (let seed = 1; seed <= N; seed++) {
    const r = playBot('easy', seed, 0.35, 150);
    if (r.firstLevel !== null) { clear++; sum += r.firstLevel; }
  }
  assert.ok(clear >= 0.8 * N, 'cleared ' + clear + '/' + N);
  const avg = sum / clear;
  assert.ok(avg > 20 && avg < 90, 'avg ' + avg.toFixed(1));
  console.log('     (Easy dawn, skill 0.35: cleared ' + clear + '/' + N + ', avg ' + avg.toFixed(1) + ' s)');
  // skill matters: Normal is harder than Easy for the same player
  let missE = 0, dE = 0, missN = 0, dN = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const a = playBot('easy', seed, 0.5, 120).w, b = playBot('normal', seed, 0.5, 120).w;
    missE += a.stats.misses + a.stats.topples; dE += a.stats.drops; missN += b.stats.misses + b.stats.topples; dN += b.stats.drops;
  }
  assert.ok(missN / dN > missE / dE, 'normal harder');
});

// ---------- long run ----------
test('10 simulated minutes of bot play (+ weather) run in ≈2 s', () => {
  const t0 = Date.now();
  const r = playBot('easy', 11, 0.9, 600, { weather: true });
  const ms = Date.now() - t0;
  assert.ok(ms < 3000, 'took ' + ms + ' ms');
  assert.ok(r.t >= 599 || r.w.phase === 'over');
  assert.ok(r.maxP < 140); assert.strictEqual(r.lightBad, 0);
  assert.ok(r.w.level >= 6, 'level ' + r.w.level);
  for (const e of ['drop', 'land', 'perfect', 'lantern', 'apple', 'pie', 'goal', 'ghost', 'levelUp', 'spawn']) assert.ok(r.ev.includes(e), e);
  const st = r.w.getState();
  assert.ok(st.stats.drops > 100 && st.score > 3000);
  console.log('     (10 min: ' + ms + ' ms, level ' + st.level + ', score ' + st.score + ', drops ' + st.stats.drops + ', apples ' + st.apples + ', pies ' + st.stats.pies + ', lanterns placed ' + st.stats.lanterns + ')');
});

// ---------- run ----------
let pass = 0, fail = 0;
for (const t of tests) {
  try { t.fn(); pass++; console.log('PASS ' + t.name); }
  catch (e) { fail++; console.log('FAIL ' + t.name + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n     ') : e)); }
}
console.log('\n' + pass + '/' + tests.length + ' passed' + (fail ? ', ' + fail + ' FAILED' : ''));
process.exit(fail ? 1 : 0);
