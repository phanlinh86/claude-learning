#!/usr/bin/env node
// Juno's Moon Stack — headless unit tests for rng / world / weather / bot (node, no deps).
// Run from projects/daily-game/fox-moon-stack:   node tests/unit/run.js
'use strict';
const assert = require('assert');
const { load } = require('./load');

const MS = load();
const C = MS.World.CONFIG;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const H = 1 / 120;
const J = v => v === undefined ? v : JSON.parse(JSON.stringify(v));
const deq = (a, b, m) => assert.deepStrictEqual(J(a), J(b), m);
const near = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, (m || '') + ' got ' + a + ' want ' + b + ' ±' + tol);

// ---------- helpers ----------
function mk(diff, seed, w, h, level) {
  return new MS.World({ seed: seed || 1, difficulty: diff || 'normal', width: w || 960, height: h || 540, level: level || 0 });
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
  const bot = new MS.Bot(w, { skill, seed: seed * 3 + 1 });
  const wx = opts.weather ? new MS.Weather({ width: w.layout.width, height: w.layout.height, seed }) : null;
  let t = 0, maxP = 0, firstLevel = null, camBad = 0; const ev = [], dt = opts.dt || 1 / 60;
  while (w.phase !== 'over' && t < maxS) {
    bot.step(dt); w.update(dt);
    for (const x of w.drainEvents()) {
      ev.push(x.type);
      if (x.type === 'levelUp' && firstLevel === null) firstLevel = t;
      if (wx) {
        if (x.type === 'levelUp') wx.setLevel(x.zone);
        if (x.type === 'perfect') wx.burst('star', x.crate.x, x.crate.y, 12, { speed: 220 });
        if (x.type === 'land') wx.burst('puff', x.crate.x, x.crate.y + x.crate.h / 2, 6, { up: 1, gravity: 60 });
        if (x.type === 'goal') wx.burst('sparkle', x.x, x.y, 30, { speed: 260, gravity: -40 });
        if (x.type === 'coin') wx.burst('coinbit', x.x, x.y, 8, {});
      }
    }
    if (opts.camCheck && (w.phase === 'swing' || w.phase === 'fall' || w.phase === 'settle')) {
      if (w.tower.topY - w.cam.y < w.layout.topLine - 1) camBad++;
    }
    if (wx) { wx.update(dt, w.cam.y); maxP = Math.max(maxP, wx.particles.length); }
    t += dt;
  }
  return { w, t, bot, ev, maxP, firstLevel, camBad };
}

// ---------- RNG / layout ----------
test('rng: deterministic, in range, API', () => {
  const a = new MS.RNG(42), b = new MS.RNG(42), c = new MS.RNG('x');
  for (let i = 0; i < 300; i++) { const x = a.next(); assert.strictEqual(x, b.next()); assert.ok(x >= 0 && x < 1); }
  for (const f of ['next', 'range', 'int', 'pick', 'chance', 'gauss', 'sign', 'fork']) assert.strictEqual(typeof c[f], 'function', f);
});

test('layout: DESIGN §2 numbers (landscape, portrait, wide)', () => {
  const L = MS.World.computeLayout(960, 540);
  assert.strictEqual(L.unit, 100); assert.strictEqual(L.groundY, 400); assert.strictEqual(L.cx, 480);
  near(L.saucerScreenY, 0.17 * 540 + 34, 1e-9); near(L.topLine, 324, 1e-9); near(L.crateW0, 110, 1e-9); near(L.crateH0, 110 * 2 / 3, 1e-9);
  near(L.swingA, 288, 1e-9); assert.ok(!L.portrait);
  const P = MS.World.computeLayout(560, 1000);
  assert.ok(P.portrait); near(P.unit, 560 / 6, 1e-9); near(P.topLine, 560, 1e-9); near(P.swingA, 0.34 * 560, 1e-9);
  near(MS.World.computeLayout(1280, 540).swingA, 300, 1e-9);
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
    near(w.held.y, w.saucer.y + C.emitterDY * L.unit * w.saucer.scale + C.beamGap * L.unit + w.held.h / 2, 1e-6);
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
test('fall: parabolic y(t) = ½gt², keeps inherit·vx, small spin (moon: no drag)', () => {
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
  // drag planets slow the drift (dunes)
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
  assert.ok(p && 'x' in p && 'dx' in p && 'perfect' in p && 'ok' in p && 'landY' in p);
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

test('scoring: +10 per crate, perfect +10×combo (cap 5), coin +5, goal bonus', () => {
  const w = mk('normal'); w.planet.coinChance = 0; w.coinList.length = 0;
  {
  for (let i = 0; i < 3; i++) { dropAt(w, 0); resolve(w); }
  assert.strictEqual(w.score, 3 * 10 + 10 * (1 + 2 + 3)); assert.strictEqual(w.combo, 3); assert.strictEqual(w.maxCombo, 3);
  for (let i = 0; i < 3; i++) { dropAt(w, 0); resolve(w); }
  assert.strictEqual(w.score, 6 * 10 + 10 * (1 + 2 + 3 + 4 + 5 + 5), 'combo multiplier capped at 5');
  const s0 = w.score; dropAt(w, 0.4 * w.held.w); resolve(w);
  assert.strictEqual(w.score, s0 + 10); assert.strictEqual(w.combo, 0);
  }
  // a coin, then the goal bonus = 100 × (zone + 1) × (loop + 1)
  const s1 = w.score; w._collectCoins({ x: 0, y: 0, w: 0, h: 0 });
  w.coinList.push({ id: 1, x: 0, y: 0, r: 5, state: 'float', t: 0 }); w._collectCoins({ x: 0, y: 0, w: 2, h: 2 });
  assert.strictEqual(w.score, s1 + 5);
  const g = mk('normal', 1, 960, 540, 6); g.planet.coinChance = 0; g.coinList.length = 0; g.setTower(new Array(g.goal - 1).fill(0));
  dropAt(g, 0); const s2 = g.score; const ev = run(g, 1.5);
  assert.strictEqual(of(ev, 'goal')[0].bonus, 100 * 3 * 2); assert.strictEqual(g.score, s2 + 20 + 600);
});

test('coins: collected by a falling crate (+5, event, total), at most 3 alive, in the fall band', () => {
  const w = mk('normal', 2);
  // stats over many spawns: count and band
  let maxAlive = 0;
  const sim = mk('normal', 4); const bot = new MS.Bot(sim, { skill: 1, seed: 1 });
  for (let i = 0; i < 60 * 60; i++) {
    bot.step(1 / 60); sim.update(1 / 60);
    const fl = sim.coinList.filter(c => c.state === 'float');
    maxAlive = Math.max(maxAlive, fl.length);
    for (const c of fl) {
      assert.ok(c.y > sim.saucer.y + 0.5 * sim.layout.unit && c.y < sim.tower.topY, 'in the fall band');
      assert.ok(Math.abs(c.x - sim.layout.cx) <= sim.layout.swingA + 1e-6);
    }
  }
  assert.ok(maxAlive >= 1 && maxAlive <= 3, 'alive ' + maxAlive);
  assert.ok(sim.stats.coins > 0, 'the bot picked some up');
  // a coin right in the path is collected
  const c = w.held; w.coinList.length = 0;
  w.coinList.push({ id: 999, x: w.tower.topX, y: c.y + 60, prevX: 0, prevY: 0, baseY: c.y + 60, sy: c.y + 60 - w._camTarget(), r: 21, t: 0, spin: 0, state: 'float', life: 0, ph: 0, fade: 1 });
  const s0 = w.score;
  dropAt(w, 0);
  const ev = resolve(w);
  const ce = of(ev, 'coin')[0]; assert.ok(ce, types(ev).join(','));
  assert.strictEqual(ce.total, 1); assert.strictEqual(w.coins, 1); assert.strictEqual(ce.coin.state !== 'float', true);
  assert.strictEqual(w.score, s0 + 5 + 20);
});

test('grow / shrink: every 5 coins Juno and the crates grow (max 5); a miss shrinks one step', () => {
  const w = mk('normal', 2);
  const w0 = w._crateSize().w;
  w.growCoins = 4;
  w.coinList.length = 0;
  w.coinList.push({ id: 999, x: w.tower.topX, y: w.held.y + 60, prevX: 0, prevY: 0, baseY: w.held.y + 60, sy: w.held.y + 60 - w._camTarget(), r: 21, t: 0, spin: 0, state: 'float', life: 0, ph: 0, fade: 1 });
  dropAt(w, 0);
  const ev = resolve(w);
  const g = of(ev, 'grow')[0]; assert.ok(g, types(ev).join(','));
  assert.strictEqual(g.grow, 1); assert.strictEqual(w.growCoins, 0);
  near(w.held.w, w0 * (1 + C.crateGrow), 1e-9, 'next crate bigger');
  run(w, 1.5); near(w.saucer.scale, 1 + C.saucerGrow, 0.01, 'saucer eased to 1.08');
  w.grow = 5; w.growCoins = 4; w._collectCoins({ x: 0, y: 0, w: 0, h: 0 }); assert.strictEqual(w.grow, 5);
  dropAt(w, 3 * w.held.w); const ev2 = resolve(w);
  const sh = of(ev2, 'shrink')[0]; assert.ok(sh); assert.strictEqual(sh.grow, 4); assert.strictEqual(w.grow, 4);
});

test('goal → flag → rocket → travel → levelUp: fresh tower on the next planet, +1 heart', () => {
  const w = mk('normal', 1);
  w.setTower(new Array(w.goal - 1).fill(0));
  w.hearts = 2;
  dropAt(w, 0);
  const ev = []; const at = {}; let t = 0;
  for (let i = 0; i < 120 * 6; i++) { w.update(H); t += H; for (const e of w.drainEvents()) { ev.push(e); if (!(e.type in at)) at[e.type] = t; } if (w.level === 1 && w.phase === 'swing' && t > at.levelUp) break; }
  const seq = types(ev).filter(x => ['land', 'goal', 'rocket', 'levelUp'].includes(x));
  const CFG_ROCKET = MS.World.CONFIG.rocketLand, CFG_LEVELUP = MS.World.CONFIG.goalTime + MS.World.CONFIG.travelTime;   // timings from CONFIG (goal → rocket → travel)
  deq(seq, ['land', 'goal', 'rocket', 'levelUp']);
  const goal = of(ev, 'goal')[0]; assert.strictEqual(goal.bonus, 100);
  assert.ok(Math.abs(at.rocket - at.goal - CFG_ROCKET) < 0.15, 'rocket after ' + (at.rocket - at.goal));
  assert.ok(Math.abs(at.levelUp - at.goal - CFG_LEVELUP) < 0.4, 'levelUp after ' + (at.levelUp - at.goal));
  const lu = of(ev, 'levelUp')[0]; assert.strictEqual(lu.level, 1); assert.strictEqual(lu.zone, 1);
  assert.strictEqual(w.level, 1); assert.strictEqual(w.zone, 1); assert.strictEqual(w.placed, 0); assert.strictEqual(w.tower.list.length, 0);
  assert.strictEqual(w.goal, 12); assert.strictEqual(w.hearts, 3); assert.ok(w.held && w.phase === 'swing');
  assert.strictEqual(w.flag, null); assert.strictEqual(w.rocket, null);
  assert.ok(Math.abs(w.cam.y) < 80, 'camera back near the ground ' + w.cam.y);
  assert.ok(of(ev, 'spawn').length >= 1);
  // gotoLevel jumps and emits levelUp; loops
  w.gotoLevel(5); const e2 = w.drainEvents(); assert.strictEqual(of(e2, 'levelUp')[0].level, 5);
  assert.strictEqual(w.zone, 1); assert.strictEqual(w.loop, 1); assert.strictEqual(w.goal, C.planets[1].goal + C.loopGoal);
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
test('setLayout: 960×540 → 560×1000 → 1280×540 re-anchors tower, saucer, coins and camera', () => {
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
    for (const c of w.coinList) assert.ok(c.x >= 0 && c.x <= W);
    run(w, 1);
  }
  // still plays after resizing
  dropAt(w, 0); const ev = resolve(w); assert.ok(of(ev, 'perfect').length === 1);
});

test('camera: critically damped, keeps the tower top at or below topLine, returns to the ground on a new planet', () => {
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
test('weather: bounded particles for every zone and size, front ambient avoids the tower column, bursts are world-space', () => {
  const sizes = [[960, 540], [560, 1000], [720, 1600], [1280, 540]];
  for (const [W, Hh] of sizes) {
    const L = MS.World.computeLayout(W, Hh);
    const wx = new MS.Weather({ width: W, height: Hh, seed: 3 });
    for (let z = 0; z < 4; z++) {
      wx.setLevel(z, { instant: z === 0 });
      const spr = new Set(); let maxP = 0, trail = 0, cam = 0;
      for (let i = 0; i < 60 * 14; i++) {
        cam -= 0.8;                                                // camera rising
        if (i % 8 === 0) wx.burst('star', L.cx, L.groundY - 200 + cam, 24, { speed: 240 });
        wx.update(1 / 60, cam);
        maxP = Math.max(maxP, wx.particles.length);
        for (const p of wx.particles) {
          spr.add(p.sprite);
          if (p.kind === 'trail') trail++;
          if (p.kind === 'burst') assert.strictEqual(p.world, true);
          else assert.ok(!p.world);
          if (p.layer === 'front' && p.kind !== 'burst') {
            assert.ok(Math.abs(p.x - L.cx) >= 1.6 * L.unit - 1e-6, W + 'x' + Hh + ' zone ' + z + ' ' + p.kind + ' in the column at ' + p.x.toFixed(0));
          }
          assert.ok(p.alpha >= 0 && p.alpha <= 1.0001 && isFinite(p.x) && isFinite(p.y));
          for (const k of ['sprite', 'x', 'y', 'size', 'rot', 'flipX', 'alpha', 'layer']) assert.ok(k in p, k);
        }
      }
      assert.ok(maxP < 140, 'cap ' + maxP);
      const want = [['sparkle', 'puff'], ['dust'], ['ice'], ['snow', 'star', 'sparkle']][z];
      for (const s of want) assert.ok(spr.has(s), W + 'x' + Hh + ' zone ' + z + ' has ' + s);
      if (z === 3) assert.ok(trail > 0, 'a shooting star within 14 s');
      assert.ok(wx.ambient.tint);
      const amb = wx.particles.filter(p => p.kind !== 'burst' && p.kind !== 'trail' && p.kind !== 'shoot');
      assert.ok(amb.length >= 15, 'ambient present ' + amb.length);
      assert.ok(amb.filter(p => p.layer === 'front').length > 0, 'some front particles');
    }
    wx.resize(W === 960 ? 560 : 960, 1200); wx.update(1 / 60, 0);
    assert.ok(wx.particles.length < 140);
  }
});

// ---------- bot ----------
test('bot: skill 1 clears planet 1 on every difficulty and survives long (perfect most of the time)', () => {
  for (const d of ['easy', 'normal', 'hard']) {
    const r = playBot(d, 3, 1, 240);
    assert.ok(r.firstLevel !== null && r.firstLevel < 60, d + ' cleared planet 1 in ' + r.firstLevel);
    assert.ok(r.w.phase !== 'over', d + ' survives 4 min');
    assert.ok(r.w.level >= 4, d + ' level ' + r.w.level);
    assert.ok(r.w.stats.perfect / r.w.stats.drops > 0.85, d + ' perfect ' + r.w.stats.perfect + '/' + r.w.stats.drops);
  }
});

test('first planet is easy: Easy + bot skill 0.35 (≈ a 6-year-old) clears it most of the time, in a casual pace', () => {
  let clear = 0, sum = 0; const N = 20;
  for (let seed = 1; seed <= N; seed++) {
    const r = playBot('easy', seed, 0.35, 150);
    if (r.firstLevel !== null) { clear++; sum += r.firstLevel; }
  }
  assert.ok(clear >= 0.8 * N, 'cleared ' + clear + '/' + N);
  const avg = sum / clear;
  assert.ok(avg > 20 && avg < 90, 'avg ' + avg.toFixed(1));
  console.log('     (Easy planet 1, skill 0.35: cleared ' + clear + '/' + N + ', avg ' + avg.toFixed(1) + ' s)');
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
  assert.ok(r.maxP < 140);
  assert.ok(r.w.level >= 6, 'level ' + r.w.level);
  for (const e of ['drop', 'land', 'perfect', 'coin', 'goal', 'rocket', 'levelUp', 'spawn']) assert.ok(r.ev.includes(e), e);
  const st = r.w.getState();
  assert.ok(st.stats.drops > 100 && st.score > 3000);
  console.log('     (10 min: ' + ms + ' ms, level ' + st.level + ', score ' + st.score + ', drops ' + st.stats.drops + ', coins ' + st.coins + ', grow ' + st.grow + ')');
});

// ---------- run ----------
let pass = 0, fail = 0;
for (const t of tests) {
  try { t.fn(); pass++; console.log('PASS ' + t.name); }
  catch (e) { fail++; console.log('FAIL ' + t.name + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n     ') : e)); }
}
console.log('\n' + pass + '/' + tests.length + ' passed' + (fail ? ', ' + fail + ' FAILED' : ''));
process.exit(fail ? 1 : 0);
