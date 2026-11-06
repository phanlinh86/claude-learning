#!/usr/bin/env node
// Nimbus's Bubble Garden — headless unit tests for rng / world / weather / bot (node, no deps).
// Run from projects/daily-game/cloud-bubble-garden:   node tests/unit/run.js
'use strict';
const assert = require('assert');
const { load } = require('./load');

const NB = load();
const C = NB.World.CONFIG;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const H = C.step;
const J = v => v === undefined ? v : JSON.parse(JSON.stringify(v));
const deq = (a, b, m) => assert.deepStrictEqual(J(a), J(b), m);
const near = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, (m || '') + ' got ' + a + ' want ' + b + ' ±' + tol);

// ---------- helpers ----------
function mk(diff, seed, w, h, level) {
  return new NB.World({ seed: seed || 1, difficulty: diff || 'normal', width: w || 960, height: h || 540, level: level || 0 });
}
/** no spawns, no wind: a lab garden */
function calm(w) {
  w._spawnT = 1e9; w._burrT = 1e9; w.wind.x = w.wind.target = 0; w.wind.t = 1e9;
  w.bubbles.length = 0; w.burrs.length = 0; w.drainEvents();
  return w;
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
const of = (ev, t) => ev.filter(e => e.type === t);
function parkHero(w, x, y) {
  const h = w.hero; h.x = h.prevX = h.tx = x; h.y = h.prevY = h.ty = y; h.vx = h.vy = 0;
}
function inBox(w) {
  const h = w.hero, L = w.layout, e = 1e-6;
  return h.x >= h.r - e && h.x <= L.width - h.r + e && h.y >= L.minY + h.r - e && h.y <= L.maxY - h.r + e;
}

function playBot(diff, seed, skill, maxS, opts) {
  opts = opts || {};
  const w = mk(diff, seed, opts.w, opts.h, opts.level);
  if (opts.immortal) w.hearts = w.maxHearts = 1e6;
  const bot = new NB.Bot(w, { skill, seed: seed * 7 + 1 });
  const wx = opts.weather ? new NB.Weather({ width: w.layout.width, height: w.layout.height, seed }) : null;
  if (wx) wx.setGround(w.layout.groundY, w.layout.unit);
  let t = 0, maxP = 0, last = 0, maxB = 0, maxR = 0, k = 0; const ev = [], levelT = [], dt = opts.dt || 1 / 60;
  while ((w.phase !== 'over' || opts.untilT) && t < maxS) {
    if (opts.resize && t >= opts.resize.every * (k + 1)) {
      k++; const s = opts.resize.sizes[k % opts.resize.sizes.length];
      w.setLayout(s[0], s[1]); if (wx) { wx.resize(s[0], s[1]); wx.setGround(w.layout.groundY, w.layout.unit); }
      if (opts.onResize) opts.onResize(w);
    }
    bot.step(dt); w.update(dt);
    for (const x of w.drainEvents()) {
      ev.push(x.type);
      if (x.type === 'levelUp') { levelT.push(t - last); last = t; if (wx) wx.setLevel(x.zone); }
      if (wx) {
        if (x.type === 'pop') { wx.burst('shard', x.x, x.y, 8, { speed: 180 }); wx.burst('sparkle', x.x, x.y, 4, {}); }
        if (x.type === 'shower') wx.setShower(true, w.hero.x, w.hero.y);
        if (x.type === 'showerEnd') wx.setShower(false);
        if (x.type === 'land') wx.burst('puff', x.burr.x, w.layout.groundY, 5, { up: 1, gravity: 60 });
        if (x.type === 'bump') wx.burst('star', x.x, x.y, 10, {});
        if (x.type === 'spawn') wx.burst('ripple', x.b.x, w.layout.groundY, 1, { speed: 0 });
      }
    }
    if (wx) {
      if (w.hero.rainT > 0) { wx.setShower(true, w.hero.x, w.hero.y + w.hero.r * 0.6); wx.burst('drop', w.hero.x, w.hero.y, 2, { gravity: 600 }); }
      wx.update(dt, w.wind.x); maxP = Math.max(maxP, wx.particles.length);
    }
    maxB = Math.max(maxB, w.bubbles.length); maxR = Math.max(maxR, w.burrs.length);
    t += dt;
  }
  return { w, t, bot, ev, maxP, maxB, maxR, levelT, wx };
}

// ---------- RNG / layout ----------
test('rng: NB namespace, deterministic, in range, API', () => {
  const a = new NB.RNG(42), b = new NB.RNG(42), c = new NB.RNG('x');
  for (let i = 0; i < 300; i++) { const x = a.next(); assert.strictEqual(x, b.next()); assert.ok(x >= 0 && x < 1); }
  for (const f of ['next', 'range', 'int', 'pick', 'chance', 'gauss', 'sign', 'fork']) assert.strictEqual(typeof c[f], 'function', f);
  for (const k of ['World', 'Weather', 'Bot']) assert.strictEqual(typeof NB[k], 'function', k);
});

test('layout: DESIGN §2 at 960×540, 1280×540, 720×1280, 560×1000', () => {
  let L = NB.World.computeLayout(960, 540);
  assert.ok(!L.portrait); assert.strictEqual(L.unit, 100);
  near(L.groundY, 445, 1e-9); near(L.topY, 85, 1e-9); near(L.minY, 85, 1e-9); near(L.maxY, 435, 1e-9);
  L = NB.World.computeLayout(1280, 540);
  assert.ok(!L.portrait); near(L.unit, 100, 1e-9); near(L.groundY, 445, 1e-9); assert.strictEqual(L.width, 1280);
  L = NB.World.computeLayout(720, 1280);
  assert.ok(L.portrait); near(L.unit, 120, 1e-9); near(L.groundY, 1280 - 114, 1e-9); near(L.topY, 102, 1e-9); near(L.maxY, 1166 - 12, 1e-9);
  L = NB.World.computeLayout(560, 1000);
  assert.ok(L.portrait); near(L.unit, 560 / 6, 1e-9); near(L.groundY, 1000 - 0.95 * 560 / 6, 1e-9);
  for (const [W, Hh] of [[960, 540], [1280, 540], [720, 1280], [560, 1000]]) {
    const w = mk('easy', 3, W, Hh);
    assert.ok(inBox(w), 'hero starts in the box ' + W + 'x' + Hh);
    const b = w.spawnBubble();
    assert.ok(b.x > 0 && b.x < W && b.y > w.layout.groundY && b.y < Hh, 'bubble born in a puddle');
  }
  // landscape puddles: (120 + 240 i)·k
  const w = mk('normal', 1); const P = w._puddles();
  deq(P, [120, 360, 600, 840]);
  assert.strictEqual(mk('normal', 1, 1280, 540)._puddles().length, 5);
});

test('config: every DESIGN key is present, with sane values', () => {
  for (const k of ['step', 'heroR', 'growK', 'gemsPerSize', 'heroOmega', 'heroZeta', 'heroMax', 'keySpeed', 'touchLift', 'g',
    'showerTime', 'comboWindow', 'maxBubbles', 'maxBurrs', 'goal', 'difficulty', 'zones']) assert.ok(C[k] !== undefined, k);
  near(C.step, 1 / 120, 1e-12); assert.strictEqual(C.gemsPerSize, 4); near(C.touchLift, 0.7, 1e-9); near(C.showerTime, 2.5, 1e-9);
  for (const d of ['easy', 'normal', 'hard'])
    for (const k of ['hearts', 'rise', 'spawn', 'burrEvery', 'hangTime', 'burrR', 'popK']) assert.ok(isFinite(C.difficulty[d][k]), d + '.' + k);
  assert.strictEqual(C.zones.length, 4);
  for (const z of C.zones) for (const k of ['rise', 'spawn', 'burrEvery', 'windMax']) assert.ok(isFinite(z[k]));
  const w = mk('normal'); near(w.rFor(1), 34, 1e-9); near(w.rFor(5), 68, 1e-9);
  assert.strictEqual(mk('easy').hearts, 5); assert.strictEqual(mk('normal').hearts, 3); assert.strictEqual(mk('hard').maxHearts, 3);
  // first level, Easy: a burr every ~10.8 s with a 1.6 s dangle (playtest tuning)
  const e = mk('easy'); near(e.burrInterval(), 10.8, 1e-9); near(e.D.hangTime, 1.6, 1e-9);
  assert.ok(e.riseSpeed() < mk('normal').riseSpeed(), 'easy bubbles are slower');
});

// ---------- determinism ----------
test('determinism: same seed + same inputs → identical state', () => {
  function script(dt, seed) {
    const w = mk('normal', seed); const r = new NB.RNG(5); let t = 0;
    while (t < 40) {
      if (r.chance(0.05)) w.setTarget(r.range(0, 960), r.range(0, 540));
      if (r.chance(0.01)) w.setMove(r.int(-1, 1), r.int(-1, 1));
      w.update(dt); w.drainEvents(); t += dt;
    }
    return { st: w.getState(), b: w.bubbles.map(b => [b.x, b.y, b.r, b.gem]), c: w.burrs.map(c => [c.x, c.y, c.state, c.rot]) };
  }
  deq(script(1 / 60, 9), script(1 / 60, 9));
  assert.notDeepStrictEqual(J(script(1 / 60, 9).b), J(script(1 / 60, 10).b), 'different seeds differ');
  // frame-rate independence with a fixed target: 30 / 60 / 144 fps end in the same fixed steps
  function fixed(dt) { const w = mk('easy', 4); w.setTarget(700, 300); let t = 0; while (t < 20 - 1e-9) { w.update(dt); t += dt; } return w; }
  const a = fixed(1 / 30), b = fixed(1 / 60), c = fixed(1 / 144);
  for (const w of [b, c]) {
    assert.ok(Math.abs(w.time - a.time) <= H + 1e-9);
    if (Math.abs(w.time - a.time) < 1e-9) deq(w.getState().stats, a.getState().stats);
    assert.ok(w.alpha >= 0 && w.alpha <= 1);
  }
});

// ---------- hero motion ----------
test('hero: spring reaches the target with a slight overshoot and a speed cap', () => {
  const w = calm(mk('normal')); const u = w.layout.unit;
  parkHero(w, 300, 260); w.setTarget(600, 260);
  let maxX = 0, maxV = 0, t90 = null, t = 0;
  while (t < 3) { w.update(H); t += H; maxX = Math.max(maxX, w.hero.x); maxV = Math.max(maxV, Math.hypot(w.hero.vx, w.hero.vy));
    if (t90 === null && w.hero.x >= 570) t90 = t; }
  near(w.hero.x, 600, 1, 'settles');
  assert.ok(maxX > 600.5 && maxX < 600 + 0.06 * 300, 'mild overshoot ' + (maxX - 600).toFixed(2) + ' px');
  assert.ok(maxV <= C.heroMax * u + 1e-6, 'speed cap');
  assert.ok(t90 > 0.3 && t90 < 1.0, 'floaty but responsive: 90 % in ' + t90.toFixed(2) + ' s');
  // a long trip hits the cap
  parkHero(w, 60, 260); w.setTarget(900, 260); let capV = 0;
  run(w, 1, () => {}); for (let i = 0; i < 10; i++) { w.update(H); capV = Math.max(capV, Math.abs(w.hero.vx)); }
  near(capV, C.heroMax * u, 1, 'cruises at heroMax');
  // tilt leans into the motion and stays bounded
  assert.ok(w.hero.tilt > 0.1 && w.hero.tilt <= C.tiltMax + 1e-9);
});

test('hero: bigger = slower (floatier), r eases to rFor(size), bob only when slow, box clamp', () => {
  function t90(size) {
    const w = calm(mk('normal')); w.hero.size = size; w.hero.r = w.hero.prevR = w.rFor(size);
    parkHero(w, 300, 260); w.setTarget(500, 260);
    const r = runUntil(w, (e, ww) => ww.hero.x >= 480, 5); return r.t;
  }
  const a = t90(1), b = t90(3), c = t90(5);
  assert.ok(a < b && b < c, 'size 1 ' + a.toFixed(2) + ' < 3 ' + b.toFixed(2) + ' < 5 ' + c.toFixed(2));
  const w = calm(mk('normal')); w.hero.size = 4; w.drainEvents();
  run(w, 0.35); assert.ok(Math.abs(w.hero.r - w.rFor(4)) < 0.06 * (w.rFor(4) - w.rFor(1)), 'puffed up in ~0.35 s');
  // idle bob: ±0.04 u while still
  parkHero(w, 480, 260); let lo = 1e9, hi = -1e9;
  run(w, 2); for (let i = 0; i < 240; i++) { w.update(H); lo = Math.min(lo, w.hero.y); hi = Math.max(hi, w.hero.y); }
  assert.ok(hi - lo > 0.04 * 100 && hi - lo < 0.1 * 100, 'bob ' + (hi - lo).toFixed(1));
  // target clamp: can't leave the box
  w.setTarget(-500, -500); run(w, 2); assert.ok(inBox(w)); near(w.hero.x, w.hero.r * C.boxK, 2); near(w.hero.y, w.layout.minY + w.hero.r * C.boxK, 6);
  w.setTarget(5000, 5000); run(w, 2); assert.ok(inBox(w));
});

test('hero: keyboard setMove moves the target from the hero, mixes with the pointer', () => {
  const w = calm(mk('normal')); parkHero(w, 300, 260); w.setTarget(800, 400);   // an old pointer target
  w.setMove(1, 0); w.update(H);
  assert.ok(Math.abs(w.hero.tx - 300) < 10, 'target reset to the hero when keys start');
  run(w, 1);
  assert.ok(w.hero.x > 300 + 3 * 100 && w.hero.x < 300 + 6 * 100, 'moved right ' + w.hero.x);
  assert.ok(Math.abs(w.hero.tx - w.hero.x) <= C.keyLead * 100 + 1e-6, 'target leads at most keyLead');
  w.setMove(0, 0); const x0 = w.hero.x; run(w, 1.5);
  assert.ok(w.hero.x - x0 < C.keyLead * 100 + 5, 'stops soon after release');
  w.setMove(-1, -1); run(w, 0.5); assert.ok(w.hero.x < w.hero.prevX + 1e-9 || w.hero.x <= w.hero.r + 1e-6);
  w.setMove(0, 0); w.setTarget(500, 300); run(w, 2); near(w.hero.x, 500, 3, 'pointer works again');
});

// ---------- bubbles ----------
test('bubbles: buoyant rise to terminal speed, wobble, wind drift, escape resets combo', () => {
  const w = calm(mk('normal')); parkHero(w, 60, 140);
  const b = w.spawnBubble(480, 2); assert.strictEqual(b.gem, 2); assert.strictEqual(b.state, 'rise');
  assert.ok(b.r >= 0.30 * 100 - 1e-9 && b.r <= 0.42 * 100 + 1e-9);
  const vy0 = b.vy; run(w, 0.25); assert.ok(b.vy < vy0, 'accelerates upward');
  let xs = [];
  run(w, 2.5, () => {}); for (let i = 0; i < 240; i++) { w.update(H); xs.push(b.x); }
  near(b.vy, -b.rise, 0.03 * b.rise, 'terminal speed');
  const amp = (Math.max(...xs) - Math.min(...xs)) / 2;
  assert.ok(amp > 0.08 * 100 && amp < 0.45 * 100, 'wobble amplitude ' + amp.toFixed(1));
  // smaller bubbles rise faster on average
  const s = [], l = [];
  for (let i = 0; i < 300; i++) { const q = w.spawnBubble(480); (q.r < 36 ? s : l).push(q.rise); }
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(avg(s) > avg(l), 'small ones are faster'); assert.ok(s.length < l.length, 'small ones are rarer');
  const gems = new Set(); for (const q of w.bubbles) gems.add(q.gem); assert.strictEqual(gems.size, 5);
  // wind drift: 80 % of the wind
  const v = calm(mk('normal')); parkHero(v, 60, 140); v.wind.x = v.wind.target = 30;
  const q = v.spawnBubble(300); let sum = 0, n = 0; run(v, 1); const x0 = q.x;
  for (let i = 0; i < 2 * 120; i++) { v.update(H); sum += q.vx; n++; }
  near(sum / n, 24, 6, 'mean drift'); assert.ok(q.x > x0);
  // escape
  v.combo = 4; const r = runUntil(v, e => of(e, 'escape').length > 0, 15);
  assert.ok(of(r.ev, 'escape').length === 1 && v.combo === 0 && v.stats.escaped === 1);
  assert.strictEqual(v.bubbles.indexOf(q), -1, 'removed');
});

test('bubbles: overlapping ones push apart without popping; spawns are capped', () => {
  const w = calm(mk('normal')); parkHero(w, 60, 140);
  const a = w.spawnBubble(480), b = w.spawnBubble(485);
  run(w, 1.5);
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > (a.r + b.r) * 0.9, 'apart'); assert.ok(a.state === 'rise' && b.state === 'rise');
  const v = mk('easy', 2); v._spawnT = 0; v.hero.x = v.hero.tx = 30;
  v.Z = Object.assign({}, v.Z, { spawn: 40 });   // a flood
  let mx = 0; for (let i = 0; i < 600; i++) { v.update(H); v.drainEvents(); mx = Math.max(mx, v.bubbles.length); }
  assert.ok(mx <= C.maxBubbles, 'cap ' + mx);
});

// ---------- popping / growing / shower ----------
test('pop: 10 × size points, gem count, combo window, grow every gemsPerSize gems', () => {
  const w = calm(mk('normal')); const h = w.hero; parkHero(w, 480, 300);
  h.size = 3; h.r = w.rFor(3);
  const b = w.spawnBubble(480, 4); b.y = b.prevY = 300;
  let ev = run(w, H); const p = of(ev, 'pop')[0];
  assert.ok(p, 'popped'); assert.strictEqual(p.points, 30); assert.strictEqual(p.size, 3); assert.strictEqual(p.gem, 4);
  assert.strictEqual(p.by, 'hero'); assert.strictEqual(p.b, b); assert.strictEqual(w.score, 30); assert.strictEqual(w.gems, 1);
  near(h.grow, 0.25, 1e-9); assert.strictEqual(p.combo, 1); assert.strictEqual(h.mood, 'happy');
  assert.strictEqual(w.bubbles.length, 0, 'removed');
  // pop radius: dist < hero.r + b.r·0.85·popK
  const q = w.spawnBubble(480); q.y = 300; q.x = 480 + h.r + q.r * 0.85 + 2; q.vx = 0; w._bubbles = () => {};
  ev = run(w, H); assert.strictEqual(of(ev, 'pop').length, 0, 'just out of reach');
  q.x -= 4; ev = run(w, H); assert.strictEqual(of(ev, 'pop').length, 1, 'just in reach');
  // three more: size 4, combo 3 → combo event
  const all = [];
  for (let i = 0; i < 2; i++) { const c = w.spawnBubble(480); c.y = 300; c.x = 480; all.push(...run(w, 0.2)); }
  assert.strictEqual(of(all, 'grow').length, 1); assert.strictEqual(of(all, 'grow')[0].size, 4); near(h.grow, 0, 1e-9);
  assert.strictEqual(w.combo, 4); assert.ok(of(all, 'combo').some(e => e.combo === 3));
  run(w, 1.3); const c = w.spawnBubble(480); c.y = 300; c.x = 480;
  ev = run(w, H); assert.strictEqual(of(ev, 'pop')[0].combo, 1, 'streak broken after comboWindow');
  assert.strictEqual(w.maxCombo, 4);
  // easy is more forgiving
  assert.ok(C.difficulty.easy.popK > C.difficulty.normal.popK);
});

test('shower: at size 5 the 4th gem rains, pops every bubble, washes hanging burrs, resets size', () => {
  const w = calm(mk('normal', 1, 960, 540, 2)); const h = w.hero; parkHero(w, 480, 300);
  h.size = 5; h.r = w.rFor(5); h.gemsInSize = 3; h.grow = 0.75;
  const others = [];
  for (const x of [100, 250, 700, 850]) { const b = w.spawnBubble(x); b.y = 200; others.push(b); }
  const burr = w.spawnBurr(800);
  w._bubbles = function () {};           // freeze the others in place
  const b = w.spawnBubble(480); b.y = 300;
  const s0 = w.score;
  let ev = run(w, H);
  assert.strictEqual(of(ev, 'shower').length, 1); assert.strictEqual(h.mood, 'rain'); near(h.rainT, C.showerTime - H, 1e-6);
  assert.strictEqual(of(ev, 'grow').length, 0); assert.strictEqual(h.size, 5); assert.strictEqual(w.stats.showers, 1);
  assert.strictEqual(burr.state, 'gone'); assert.ok(burr.washed);
  ev = ev.concat(run(w, C.showerTime + 0.1));
  const rain = of(ev, 'pop').filter(e => e.by === 'rain');
  assert.strictEqual(rain.length, 4, 'every bubble popped by the rain');
  for (const e of rain) assert.strictEqual(e.points, 50);
  const gaps = rain.slice(1).map((e, i) => 0); void gaps;
  assert.strictEqual(of(ev, 'showerEnd').length, 1); assert.deepStrictEqual(of(ev, 'shrink').map(e => e.size), [1]);
  assert.strictEqual(h.size, 1); near(h.grow, 0, 1e-9);
  assert.strictEqual(w.score - s0, 50 + 4 * 50 + 50 * (2 + 1), 'gem + rain gems + shower bonus');
  assert.ok(!w.burrs.includes(burr), 'washed burr faded and removed');
  // invulnerable during the shower
  const v = calm(mk('normal')); parkHero(v, 480, 300); v.hero.rainT = 2; v.hero.invuln = 2;
  const c = v.spawnBurr(480); c.state = 'fall'; c.y = 300; c.vy = 300;
  assert.strictEqual(of(run(v, 0.05), 'bump').length, 0);
});

// ---------- burrs ----------
test('burr: hang → drop (gravity arc + spin) → one soft bounce → roll → gone', () => {
  const w = calm(mk('normal')); parkHero(w, 60, 300); const u = w.layout.unit;
  const c = w.spawnBurr(600); let ev = w.drainEvents();
  near(c.y, w.layout.topY + 0.15 * u, 1e-9); assert.strictEqual(c.state, 'hang'); near(c.r, 0.24 * u, 1e-9);
  ev = run(w, C.difficulty.normal.hangTime - 0.05); assert.strictEqual(c.state, 'hang'); assert.strictEqual(of(ev, 'drop').length, 0);
  ev = run(w, 0.1); assert.strictEqual(of(ev, 'drop').length, 1); assert.strictEqual(c.state, 'fall');
  const y0 = c.y, t0 = c.t, rot0 = c.rot; run(w, 0.3);
  const tt = c.t - t0 + 0, drop = c.y - y0; const ideal = 0.5 * C.g * u * (c.t * c.t - t0 * t0);
  near(drop, ideal, 0.04 * ideal, 'free fall ½gt²'); void tt;
  assert.ok(Math.abs(c.rot - rot0) > 0.4, 'spins');
  let vyLand = 0; const r = runUntil(w, (e, ww) => { if (c.state === 'fall') vyLand = c.vy; return e.some(x => x.type === 'land'); }, 3);
  assert.ok(r.ev.some(x => x.type === 'land' && x.burr === c));
  near(c.vy, -C.bounce * vyLand, 0.05 * vyLand + 30, 'soft bounce'); assert.strictEqual(c.state, 'roll'); assert.ok(c.bounced);
  near(Math.abs(c.vx), C.rollSpeed * u, 1e-6, 'rolls'); assert.ok(c.vx > 0, 'rolls away from Nimbus');
  let peak = c.y; const restY = w.layout.groundY - C.burrRest * u;
  const rr = runUntil(w, () => { peak = Math.min(peak, c.y); return c.state === 'gone'; }, 3);
  assert.ok(restY - peak > 0.15 * u && restY - peak < 0.8 * u, 'bounce height ' + (restY - peak).toFixed(0));
  near(rr.t, C.rollLife, 0.05, 'fades out after 1.2 s'); assert.ok(!w.burrs.includes(c), 'removed');
  // easy hit radius ×0.75
  const e = calm(mk('easy')); near(e.spawnBurr(500).r, 0.24 * 0.75 * 100, 1e-9);
});

test('burr: only FALLING burrs hurt (not hanging, not rolling, not after a hit)', () => {
  // Nimbus pressed up against a hanging burr: no bump while it dangles, bump once it drops
  const w = calm(mk('normal')); const u = w.layout.unit;
  parkHero(w, 500, w.layout.minY + w.hero.r); const c = w.spawnBurr(500);
  let ev = run(w, C.difficulty.normal.hangTime - 0.02);
  assert.strictEqual(of(ev, 'bump').length, 0, 'hanging is harmless');
  ev = run(w, 0.3); assert.strictEqual(of(ev, 'bump').length, 1, 'falling hurts'); assert.ok(c.hit);
  // rolling burr straight through her
  const v = calm(mk('normal')); parkHero(v, 500, v.layout.maxY - v.hero.r);
  const q = v.spawnBurr(300); q.state = 'roll'; q.bounced = true; q.y = v.hero.y; q.vx = 3 * u; q.t = 0;
  ev = run(v, 1); assert.strictEqual(of(ev, 'bump').length, 0, 'rolling is harmless');
});

test('bump: one heart, shrink one size, knock-back away, 1.5 s invuln, burr bounces off', () => {
  const w = calm(mk('normal')); const h = w.hero, u = w.layout.unit; parkHero(w, 500, 300);
  h.size = 3; h.r = w.rFor(3); h.gemsInSize = 2; h.grow = 0.5;
  const c = w.spawnBurr(470); c.state = 'fall'; c.y = 300 - h.r; c.vy = 400; c.t = 0.5;
  const ev = run(w, H);
  const b = of(ev, 'bump')[0]; assert.ok(b, 'bump'); assert.strictEqual(b.burr, c); assert.ok(isFinite(b.x) && isFinite(b.y));
  assert.deepStrictEqual(of(ev, 'heartLost').map(e => e.hearts), [2]); assert.strictEqual(w.hearts, 2);
  assert.deepStrictEqual(of(ev, 'shrink').map(e => e.size), [2]); assert.strictEqual(h.size, 2); near(h.grow, 0, 1e-9);
  assert.ok(h.vx > 0.5 * C.knockSpeed * u, 'knocked right (away from the burr)'); assert.ok(h.vy > 0, 'and down');
  assert.strictEqual(h.mood, 'ouch'); near(h.invuln, C.invuln - H, 1e-6); assert.ok(c.hit && c.vy < 0 && c.vx < 0);
  // knock-back is visible: she travels away before the spring brings her back
  let far = 0; for (let i = 0; i < 60; i++) { w.update(H); far = Math.max(far, Math.hypot(h.x - 500, h.y - 300)); }
  assert.ok(far > 0.3 * u && far < 1.2 * u, 'knock-back travel ' + far.toFixed(0));
  // a second burr during invuln does nothing
  const d = w.spawnBurr(h.x); d.state = 'fall'; d.y = h.y; d.vy = 300;
  assert.strictEqual(of(run(w, 0.1), 'bump').length, 0);
  // size 1 stays 1, no shrink event
  const v = calm(mk('normal')); parkHero(v, 500, 300);
  const e = v.spawnBurr(500); e.state = 'fall'; e.y = 290; e.vy = 300;
  const ev2 = run(v, H); assert.strictEqual(of(ev2, 'bump').length, 1); assert.strictEqual(of(ev2, 'shrink').length, 0);
});

test('hearts: losing the last one → game over; bubbles keep rising, no more spawns', () => {
  const w = mk('normal', 5); w.hearts = 1; parkHero(w, 500, 300);
  run(w, 3); const c = w.spawnBurr(500); c.state = 'fall'; c.y = 300; c.vy = 300;
  const ev = run(w, H);
  assert.strictEqual(of(ev, 'gameOver').length, 1); assert.strictEqual(w.phase, 'over'); assert.strictEqual(w.hearts, 0);
  const b = w.bubbles.find(q => q.state === 'rise'); assert.ok(b); const y0 = b.y;
  const after = run(w, 5); assert.ok(b.y < y0 || !w.bubbles.includes(b), 'still rising');
  assert.strictEqual(of(after, 'spawn').length + of(after, 'hang').length + of(after, 'pop').length, 0);
  assert.strictEqual(of(after, 'gameOver').length, 0, 'only once');
});

// ---------- levels ----------
test('levels: levelUp at goal with bonus and +1 heart; loops add +2 gems; gotoLevel', () => {
  const w = calm(mk('normal')); parkHero(w, 480, 300);
  assert.strictEqual(w.goal, C.goal.normal); w.gems = w.goal - 1; w.hearts = 2;
  const b = w.spawnBubble(480); b.y = 300; const s0 = w.score;
  const ev = run(w, H); const lu = of(ev, 'levelUp')[0];
  assert.ok(lu); assert.deepStrictEqual([lu.level, lu.zone, lu.bonus], [1, 1, 100]);
  assert.deepStrictEqual(of(ev, 'heartGain').map(e => e.hearts), [3]);
  assert.strictEqual(w.gems, 0); assert.strictEqual(w.level, 1); assert.strictEqual(w.score - s0, 10 + 100);
  assert.strictEqual(w.stats.levels, 1); near(w.progress, 0, 1e-9);
  // full hearts: no heartGain; bonus 100·(zone+1)·(loop+1)
  const v = calm(mk('easy', 1, 960, 540, 7)); parkHero(v, 480, 300);
  assert.strictEqual(v.zone, 3); assert.strictEqual(v.loop, 1); assert.strictEqual(v.goal, C.goal.easy + 2);
  v.gems = v.goal - 1; const q = v.spawnBubble(480); q.y = 300; const ev2 = run(v, H);
  assert.strictEqual(of(ev2, 'levelUp')[0].bonus, 100 * 4 * 2); assert.strictEqual(of(ev2, 'heartGain').length, 0);
  assert.strictEqual(v.zone, 0); assert.strictEqual(v.loop, 2);
  // progress
  const p = calm(mk('normal')); parkHero(p, 480, 300); const z = p.spawnBubble(480); z.y = 300; run(p, H); near(p.progress, 1 / p.goal, 1e-9);
  // gotoLevel
  p.spawnBurr(300); p.drainEvents(); p.gotoLevel(6);
  const g = p.drainEvents(); assert.deepStrictEqual(J(g), [{ type: 'levelUp', level: 6, zone: 2, bonus: 0 }]);
  assert.strictEqual(p.burrs.length, 0); assert.strictEqual(p.gems, 0);
  // later zones / loops are harder
  assert.ok(mk('normal', 1, 960, 540, 4).riseSpeed() > mk('normal').riseSpeed());
  assert.ok(mk('hard', 1, 960, 540, 3).burrInterval() < 2.6 && mk('hard', 1, 960, 540, 3).burrInterval() > 2.3, 'night hard ≈ 2.5 s');
});

test('wind: changes every 4–8 s, bounded by the zone windMax, moves bubbles & burrs (not Nimbus)', () => {
  for (let z = 0; z < 4; z++) {
    const w = calm(mk('normal', 3, 960, 540, z)); w.wind.t = 0; const lim = C.zones[z].windMax * 100;
    let changes = 0, last = w.wind.target, mx = 0;
    for (let i = 0; i < 120 * 120; i++) { w.update(H); mx = Math.max(mx, Math.abs(w.wind.x)); if (w.wind.target !== last) { changes++; last = w.wind.target; } }
    assert.ok(mx <= lim + 1e-9, 'bounded ' + mx + ' ≤ ' + lim); assert.ok(mx > 0.3 * lim, 'it blows');
    assert.ok(changes >= 120 / 8 - 1 && changes <= 120 / 4 + 1, 'changes ' + changes);
  }
  const w = calm(mk('normal', 1, 960, 540, 2)); parkHero(w, 480, 300); w.wind.x = w.wind.target = 60;
  run(w, 2); near(w.hero.x, 480, 1, 'Nimbus is not blown');
  const c = w.spawnBurr(300); c.state = 'fall'; c.t = 0; run(w, 0.5); assert.ok(c.vx > 5 && c.vx < 30, 'burr drifts a little');
});

test('burr spawns: dawn Easy every ~9 s, never above Nimbus, at most maxBurrs', () => {
  const w = mk('easy', 8); w.hearts = w.maxHearts = 1e6; const u = w.layout.unit; let n = 0, t = 0, first = null;
  const r = new NB.RNG(3);
  while (t < 300) {
    if (r.chance(0.02)) w.setTarget(r.range(0, 960), r.range(100, 430));
    w.update(H); t += H; w.gems = 0;     // stay at dawn
    for (const e of w.drainEvents()) if (e.type === 'hang') {
      n++; if (first === null) first = t;
      assert.ok(Math.abs(e.burr.x - w.hero.x) >= 1.3 * u - 1e-6, 'not above Nimbus');
    }
    assert.ok(w.burrs.filter(c => c.state !== 'gone').length <= C.maxBurrs);
  }
  const every = (t - first) / (n - 1);
  assert.ok(every > 9.8 && every < 11.8, 'every ' + every.toFixed(1) + ' s'); assert.ok(first >= C.burrBreather);
  // narrow portrait screen still keeps the distance
  const p = mk('easy', 2, 560, 1000); parkHero(p, 280, 500);
  for (let i = 0; i < 50; i++) { const c = p.spawnBurr(); assert.ok(Math.abs(c.x - 280) >= 1.3 * p.layout.unit - 1e-6); p.burrs.length = 0; }
});

// ---------- resize / rotate ----------
test('setLayout: re-anchors proportionally; nothing out of bounds after rotate', () => {
  const sizes = [[960, 540], [560, 1000], [1280, 540], [720, 1280], [1024, 768], [375, 667]];
  for (const diff of ['easy', 'hard']) {
    const r = playBot(diff, 4, 0.7, 120, { immortal: true, resize: { every: 7, sizes }, onResize: w => {
      const L = w.layout, u = L.unit;
      assert.ok(inBox(w), 'hero in box');
      near(w.hero.r, w.rFor(w.hero.size), 1e-9);
      for (const b of w.bubbles) { assert.ok(b.x >= 0 && b.x <= L.width && isFinite(b.y)); assert.ok(b.r >= 0.29 * u && b.r <= 0.43 * u); }
      for (const c of w.burrs) {
        assert.ok(c.x >= 0 && c.x <= L.width && c.y <= L.groundY - C.burrRest * u + 1e-6);
        if (c.state === 'hang') near(c.y, L.topY + 0.15 * u, 1e-9);
      }
      assert.ok(Math.abs(w.wind.x) <= C.zones[w.zone].windMax * u + 1e-6);
    } });
    assert.ok(r.w.stats.pops > 50);
  }
  // proportional: a point at mid-play-area stays at mid-play-area
  const w = calm(mk('normal')); parkHero(w, 480, 260);
  w.setLayout(560, 1000); const L = w.layout;
  near(w.hero.x, 280, 1e-6); near((w.hero.y - L.topY) / (L.groundY - L.topY), (260 - 85) / 360, 1e-6);
  near(w.hero.prevX, w.hero.x, 0); near(w.hero.prevR, w.hero.r, 0);
});

// ---------- weather ----------
test('weather: zones, depth rain, splashes, shower, bounded < 180 at every size', () => {
  for (const [W, Hh] of [[960, 540], [560, 1000], [720, 1600], [1280, 540]]) {
    const L = NB.World.computeLayout(W, Hh);
    const wx = new NB.Weather({ width: W, height: Hh, seed: 3 }); wx.setGround(L.groundY, L.unit);
    for (let z = 0; z < 4; z++) {
      wx.setLevel(z);
      let maxN = 0, splash = 0;
      for (let i = 0; i < 60 * 20; i++) {
        const shower = i > 600 && i < 800;
        wx.setShower(shower, W / 2, L.groundY - 2 * L.unit);
        wx.update(1 / 60, (z === 2 ? 60 : 20) * Math.sin(i / 100));
        if (i % 15 === 0) wx.burst('shard', W / 3, Hh / 2, 25, { speed: 200 });
        maxN = Math.max(maxN, wx.particles.length);
        for (const p of wx.particles) {
          assert.ok(isFinite(p.x) && isFinite(p.y) && isFinite(p.size) && isFinite(p.rot) && p.alpha >= 0 && p.alpha <= 1, 'finite ' + p.kind);
          assert.ok(p.layer === 'back' || p.layer === 'front');
          if (p.kind !== 'burst' && p.layer === 'front') assert.ok(p.alpha <= 0.35 + 1e-9 && p.size < 40 * L.unit / 100, 'soft front ' + p.kind);
          if (p.kind === 'star') assert.ok(p.y <= 0.35 * Hh + 1e-9, 'star in the sky');
          if (p.kind !== 'burst') assert.ok(p.x > -300 && p.x < W + 300, 'on screen ' + p.kind);
          if (p.kind === 'splash') splash++;
        }
        if (shower) assert.strictEqual(wx.ambient.rain, 1);
      }
      assert.ok(maxN < 180, 'cap ' + maxN);
      assert.ok(splash > 0, 'rain splashes');
      const kinds = new Set(wx.particles.map(p => p.kind));
      for (const k of [['drops', 'mist'], ['drops', 'sparkle'], ['drops', 'leaf'], ['drops', 'glow', 'star']][z]) assert.ok(kinds.has(k), 'zone ' + z + ' has ' + k);
      assert.strictEqual(wx.particles.filter(p => p.kind === 'splash').length <= 10, true);
      const drops = wx.particles.filter(p => p.kind === 'drops');
      assert.ok(drops.some(p => p.layer === 'front') && drops.filter(p => p.layer === 'front').length < drops.length / 3, 'mostly back');
      for (const p of drops) assert.ok(Math.abs(p.aspect - 1 / 6) < 1e-9 && p.sprite === 'streak');
    }
    wx.resize(Hh, W); wx.update(1 / 60, 0); assert.ok(wx.particles.length < 180);
  }
  // depth: near drops are faster and longer than far ones
  const wx = new NB.Weather({ width: 960, height: 540, seed: 1 }); wx.setLevel(3, { instant: true });
  const d = wx.particles.filter(p => p.kind === 'drops').sort((a, b) => a.d - b.d);
  assert.ok(d[0].vy < d[d.length - 1].vy && d[0].landY < d[d.length - 1].landY);
  // rain slants with the wind
  wx.update(0.05, 60); const s = wx.particles.find(p => p.kind === 'drops'); assert.ok(s.vx > 0 && s.rot < 0);
  // leaves: pendulum (tilt follows the swing) or tumble; they fall
  wx.setLevel(2, { instant: true }); const lf = wx.particles.filter(p => p.kind === 'leaf'); const y0 = lf.map(p => p.y);
  wx.update(0.5, 0); assert.ok(lf.filter((p, i) => p.y > y0[i]).length >= lf.length - 2);
  assert.ok(lf.some(p => p.tumble) || lf.length < 4);
  assert.ok(new NB.Weather({ width: 960, height: 540 }).ambient.tint !== undefined);
  // rain strength crossfades between zones
  const c = new NB.Weather({ width: 960, height: 540, seed: 2 }); c.setLevel(1, { instant: true }); near(c.ambient.rain, 0.25, 1e-9);
  c.setLevel(3); for (let i = 0; i < 60; i++) c.update(1 / 60, 0); assert.ok(c.ambient.rain > 0.25 && c.ambient.rain < 0.45);
});

// ---------- bot ----------
test('bot: skill 0.9 survives 3 minutes on Easy and Normal', () => {
  for (const diff of ['easy', 'normal']) for (const seed of [1, 2, 3, 4]) {
    const r = playBot(diff, seed, 0.9, 180);
    assert.strictEqual(r.w.phase, 'play', diff + ' seed ' + seed + ' died, bumps ' + r.w.stats.bumps);
    assert.ok(r.w.stats.pops > 100 && r.levelT.length >= 2, diff + ' plays: pops ' + r.w.stats.pops);
    assert.ok(r.bot.stats.dodges > 0 || r.w.stats.bumps === 0);
  }
});

test('bot: pacing — Dawn Easy first level 45–90 s for a casual player, levels 45–90 s', () => {
  const lv = [], hits = [];
  for (const seed of [1, 2, 3]) {
    const r = playBot('easy', seed, 0.5, 300);
    assert.ok(r.levelT[0] >= 40 && r.levelT[0] <= 90, 'first level ' + r.levelT[0].toFixed(1));
    lv.push(...r.levelT); hits.push(r.w.stats.bumps / r.t * 60);
  }
  for (const t of lv) assert.ok(t >= 40 && t <= 95, 'level ' + t.toFixed(1));
  assert.ok(Math.max(...hits) < 2, 'casual hits/min on Easy ' + hits.map(h => h.toFixed(2)));
  // a skilled player is a bit faster on Normal, and Hard is the slowest
  const n9 = playBot('normal', 1, 0.9, 200).levelT, h5 = playBot('hard', 1, 0.5, 200, { immortal: true }).levelT;
  assert.ok(n9[0] < h5[0]);
});

test('fuzz: random input, resizes, gotoLevel — no NaN, invariants hold, bounded counts', () => {
  const sizes = [[960, 540], [560, 1000], [1280, 540], [720, 1600], [1024, 768]];
  for (const diff of ['easy', 'normal', 'hard']) {
    const w = mk(diff, 21); w.hearts = w.maxHearts = 1e6;
    const r = new NB.RNG(diff); let t = 0;
    while (t < 240) {
      if (r.chance(0.05)) w.setTarget(r.range(-100, 1400), r.range(-100, 1700));
      if (r.chance(0.01)) w.setMove(r.int(-1, 1), r.int(-1, 1));
      if (r.chance(0.002)) { const s = r.pick(sizes); w.setLayout(s[0], s[1]); }
      if (r.chance(0.0005)) w.gotoLevel(r.int(0, 9));
      w.update(r.range(0.005, 0.05)); t += 0.03; w.drainEvents();
      const h = w.hero;
      for (const v of [h.x, h.y, h.vx, h.vy, h.r, h.tilt, h.squash, w.score, w.wind.x]) assert.ok(isFinite(v), 'finite');
      assert.ok(inBox(w), 'in box');
      assert.ok(h.size >= 1 && h.size <= 5 && h.grow >= 0 && h.grow <= 1 && w.progress >= 0 && w.progress <= 1);
      assert.ok(h.blink >= 0 && h.blink <= 1 && h.squash >= 0 && h.squash <= 1 && w.alpha >= 0 && w.alpha <= 1);
      assert.ok(w.bubbles.length <= C.maxBubbles + 1 && w.burrs.length <= C.maxBurrs + 3, 'bounded');
      for (const b of w.bubbles) assert.ok(isFinite(b.x) && isFinite(b.y) && b.state === 'rise');
      for (const c of w.burrs) assert.ok(isFinite(c.x) && isFinite(c.y) && isFinite(c.rot) && c.fade >= 0 && c.fade <= 1);
      assert.ok(['idle', 'happy', 'ouch', 'rain'].includes(h.mood));
    }
    assert.ok(w.stats.pops > 20 && w.stats.bumps > 0);
  }
});

// ---------- long run ----------
test('10 simulated minutes of bot play (+ weather) run in ≈2 s', () => {
  const t0 = Date.now();
  const r = playBot('normal', 11, 0.9, 600, { weather: true });
  const ms = Date.now() - t0;
  assert.ok(ms < 3500, 'took ' + ms + ' ms');
  assert.ok(r.t >= 599 || r.w.phase === 'over');
  assert.ok(r.maxP < 180, 'particles ' + r.maxP);
  assert.ok(r.maxB <= C.maxBubbles + 1 && r.maxR <= C.maxBurrs + 3, 'entities ' + r.maxB + ' / ' + r.maxR);
  for (const e of ['spawn', 'pop', 'grow', 'shower', 'showerEnd', 'shrink', 'hang', 'drop', 'land', 'combo', 'levelUp', 'escape']) assert.ok(r.ev.includes(e), e);
  const st = r.w.getState();
  assert.ok(st.level >= 7 && st.score > 5000, 'level ' + st.level + ' score ' + st.score);
  console.log('     (10 min: ' + ms + ' ms, level ' + st.level + ', score ' + st.score + ', pops ' + st.stats.pops +
    ', showers ' + st.stats.showers + ', bumps ' + st.stats.bumps + ', max particles ' + r.maxP + ')');
});

// ---------- run ----------
let pass = 0, fail = 0;
for (const t of tests) {
  try { t.fn(); pass++; console.log('PASS ' + t.name); }
  catch (e) { fail++; console.log('FAIL ' + t.name + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n     ') : e)); }
}
console.log('\n' + pass + '/' + tests.length + ' passed' + (fail ? ', ' + fail + ' FAILED' : ''));
process.exit(fail ? 1 : 0);
