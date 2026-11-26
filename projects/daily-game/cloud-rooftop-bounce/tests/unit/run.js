#!/usr/bin/env node
// Wisp's Rooftop Bounce — headless unit tests for rng / world / weather / bot (node, no deps).
// Run from projects/daily-game/cloud-rooftop-bounce:   node tests/unit/run.js        (add --stats for the bot report)
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { load, JS } = require('./load');

const WRB = load();
const W = WRB.World, C = W.CONFIG, H = C.STEP, DEG = Math.PI / 180;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const near = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, (m || '') + ' got ' + a + ' want ' + b + ' ±' + tol);

// ---------- helpers ----------
function mk(diff, seed, extra) { return new W(Object.assign({ seed: seed || 1, difficulty: diff || 'normal' }, extra || {})); }
/** a world with every block gone (no clear is triggered: that only happens when a hit breaks the last one) */
function empty(diff, seed) { const w = mk(diff, seed); w.debugClear(0); w.drainEvents(); return w; }
function steps(w, n) { const ev = []; for (let i = 0; i < n; i++) { w.update(H); ev.push(...w.drainEvents()); } return ev; }
function runUntil(w, pred, max) {
  const ev = []; let t = 0; max = max || 10;
  while (t < max) { w.update(H); t += H; const e = w.drainEvents(); ev.push(...e); if (pred(e, w)) break; }
  return { ev, t };
}
const of = (ev, t) => ev.filter(e => e.type === t);
const has = t => e => e.some(x => x.type === t);
/** put the pearl in play at (x, y) with velocity (vx, vy) */
function shoot(w, x, y, vx, vy) {
  w.phase = 'play';
  const b = w.ball || (w.ball = { r: C.BALL_R, spin: 0 });
  Object.assign(b, { x, y, px: x, py: y, vx, vy, onPaddle: false, stuck: false, stuckT: 0, stuckOff: 0, speed: Math.hypot(vx, vy) });
}
/** back to 'serve' with the auto-serve switched off (the pearl stays on Wisp) */
function hold(w) { w.phase = 'serve'; w._toServe(); w.serveT = -1e9; }
/** kill every block except `keep` and one spare far away (so breaking `keep` doesn't clear the zone) */
function only(w, keep) {
  for (const b of w.bricks) b.alive = false;
  keep.alive = true;
  const spare = w.bricks.find(b => b !== keep && Math.abs(b.x - keep.x) > 4 && b.row <= 1);
  spare.alive = true;
  return spare;
}
/** hold Wisp still at x */
function park(w, x) { w.paddle.x = w.paddle.px = x; w.paddle.vx = 0; w.setPaddleTarget(x); }
/** hit brick k once from below (the pearl comes straight up under it) */
function hitOnce(w, k) {
  shoot(w, k.x, k.y - 1, 0, 6);
  const r = runUntil(w, has('brick'), 2);
  return of(r.ev, 'brick')[0];
}
function bounceAt(off, paddleVx) {
  const w = empty('normal', 3); park(w, 8);
  const reach = w.paddle.w / 2 + C.BALL_R;
  shoot(w, 8 + off * reach, C.PADDLE_Y + C.BALL_R + 0.3, 0, -7);
  if (paddleVx) w.paddle.vx = paddleVx;
  const r = runUntil(w, has('paddle'), 1);
  assert.ok(of(r.ev, 'paddle').length === 1, 'paddle bounce');
  return { w, b: w.ball, ev: of(r.ev, 'paddle')[0] };
}
/** a magnet-on world with the pearl falling onto Wisp at offset `dx` from its centre; returns after the stick */
function stickAt(diff, dx) {
  const w = empty(diff || 'normal', 5); park(w, 8);
  w.debugMagnet(); w.drainEvents();
  shoot(w, 8 + dx, 3, 0, -7);
  const r = runUntil(w, e => e.some(x => x.type === 'stick' || x.type === 'paddle'), 1);
  return { w, r };
}
function playBot(diff, seed, skill, maxS, opts) {
  opts = opts || {};
  const w = mk(diff, seed, opts.world);
  const bot = new WRB.Bot(w, { skill, seed: seed * 7 + 1 });
  const dt = 1 / 60; let t = 0; const ev = [];
  while (w.phase !== 'over' && t < maxS) {
    bot.step(dt); w.update(dt); t += dt;
    const e = w.drainEvents(); if (opts.keep) for (const x of e) ev.push(x);
    if (opts.onStep && opts.onStep(w, e) === false) break;
  }
  return { w, t, bot, ev };
}

// ---------- RNG ----------
test('rng: same seed → same sequence, ranges hold', () => {
  const a = new WRB.RNG(42), b = new WRB.RNG(42), c = new WRB.RNG(43);
  const sa = [], sb = [], sc = [];
  for (let i = 0; i < 50; i++) { sa.push(a.next()); sb.push(b.next()); sc.push(c.next()); }
  assert.deepStrictEqual(sa, sb); assert.notDeepStrictEqual(sa, sc);
  const r = new WRB.RNG('x');
  for (let i = 0; i < 2000; i++) {
    const v = r.int(2, 5); assert.ok(v >= 2 && v <= 5 && v === Math.floor(v));
    const f = r.range(-1, 3); assert.ok(f >= -1 && f < 3);
    assert.ok(['a', 'b'].includes(r.pick(['a', 'b'])));
  }
});

test('no Math.random in world.js / bot.js / weather.js', () => {
  for (const f of ['world.js', 'bot.js', 'weather.js']) assert.ok(!/Math\.random/.test(fs.readFileSync(path.join(JS, f), 'utf8')), f);
});

// ---------- layouts & grid ----------
test('layouts: 4 zones, 6–7 rows × 10 of b/t/g/m, 2–3 magnet blocks, ≥ 2 gem blocks, distinct shapes', () => {
  assert.strictEqual(W.LAYOUTS.length, 4);
  const shapes = new Set();
  for (const L of W.LAYOUTS) {
    assert.ok(L.length >= 6 && L.length <= 7);
    for (const row of L) assert.ok(/^[.btgm]{10}$/.test(row), row);
    const all = L.join(''), n = all.replace(/\./g, '').length;
    assert.ok(n >= 28 && n <= 50, 'blocks ' + n);
    const m = (all.match(/m/g) || []).length; assert.ok(m >= 2 && m <= 3, 'magnets ' + m);
    assert.ok((all.match(/g/g) || []).length >= 2, 'gem blocks');
    shapes.add(all.replace(/[btgm]/g, '#'));
  }
  assert.strictEqual(JSON.stringify(W.ZONES), JSON.stringify(['cloud', 'spires', 'gardens', 'lanes']));
  assert.strictEqual(shapes.size, 4, 'each zone has its own shape');
  assert.ok(!/t/.test(W.LAYOUTS[0].join('')), 'the first zone has no tough blocks (for a 6-year-old)');
});

test('grid: 10 columns of 1.4 u centred on x 8, rows in the band y 4.3…8.0 (top edge 8.0)', () => {
  for (let z = 0; z < 4; z++) {
    const w = mk('normal', 1, { level: z });
    for (const b of w.bricks) {
      assert.strictEqual(b.w, 1.4); assert.strictEqual(b.h, 0.5); assert.ok(b.hitT > 10);
      assert.ok(b.y >= 4.3 && b.y + b.h / 2 <= 8.0 + 1e-9, 'y ' + b.y);
      near(b.x, 8 + (b.col - 4.5) * 1.48, 1e-9);
    }
    const ys = [...new Set(w.bricks.map(b => +b.y.toFixed(4)))].sort((a, b) => a - b);
    near(ys[0], C.BOTTOM_Y, 1e-9, 'bottom-aligned'); near(ys[1] - ys[0], C.ROW_PITCH, 1e-6);
    near(ys[ys.length - 1], C.BOTTOM_Y + (W.LAYOUTS[z].length - 1) * C.ROW_PITCH, 1e-6);
  }
  near(8 - 4.5 * 1.48 - 0.7, 0.64, 1e-9);
});

test('round 2 (loop ≥ 1) turns some blocks tough; same seed → same layout', () => {
  let t0 = 0, t1 = 0;
  for (let s = 1; s <= 8; s++) {
    t0 += mk('normal', s, { level: 1 }).bricks.filter(b => b.kind === 'tough').length;
    t1 += mk('normal', s, { level: 5 }).bricks.filter(b => b.kind === 'tough').length;
  }
  assert.ok(t1 > t0 + 8, 'tough blocks ' + t0 + ' → ' + t1);
  const a = mk('normal', 9, { level: 5 }).bricks.map(b => b.kind).join(), b = mk('normal', 9, { level: 5 }).bricks.map(b => b.kind).join();
  assert.strictEqual(a, b);
});

test('difficulty table: Wisp width, pearl speed, net saves, magnet time (12/10/8 s)', () => {
  const exp = { easy: [3.6, 5.4, 8, 12], normal: [2.5, 7.6, 1, 10], hard: [2.1, 9.0, 0, 8] };
  for (const d in exp) {
    const w = mk(d, 1), e = exp[d];
    assert.strictEqual(w.paddle.w, e[0]); assert.strictEqual(w.ball.speed, e[1]); assert.strictEqual(w.net.saves, e[2]);
    assert.strictEqual(w.magnet.max, e[3]); assert.strictEqual(w.magnet.t, 0);
  }
  assert.strictEqual(C.AUTO_SERVE, 3); assert.strictEqual(C.STEP, 1 / 120); assert.strictEqual(C.CLEAR_T, 2.5);
});

// ---------- determinism, stepping ----------
test('determinism: same seed → same state after 60 s of bot play; another seed differs', () => {
  const st = s => playBot('normal', s, 0.7, 60).w.getState();
  const a = st(5), b = st(5), c = st(6);
  assert.deepStrictEqual(a, b);
  assert.notDeepStrictEqual(a, c);
});

test('fixed 1/120 s sub-steps, px/py from the previous step, alpha in [0,1]', () => {
  const w = mk('normal', 2); w.serve();
  w.update(1 / 60 + 0.002);
  near(w.time, 2 / 120, 1e-9);
  near(w.alpha, 0.24, 1e-6);
  const b = w.ball; near(b.x - b.px, b.vx * H, 1e-9); near(b.y - b.py, b.vy * H, 1e-9);
  w.update(0.001); assert.ok(w.alpha >= 0 && w.alpha <= 1);
  w.debugDrop('gem'); w.update(H);
  const g = w.gems[0]; assert.ok(g.px !== undefined && Math.abs(g.y - g.py) > 0);
});

// ---------- serve & paddle ----------
test('serve: pearl rides Wisp, serve() launches upward 8–22° off vertical, auto-serve after 3 s', () => {
  const w = mk('easy', 4);
  assert.strictEqual(w.phase, 'serve'); assert.ok(w.ball.onPaddle); assert.strictEqual(w.ball.stuck, false);
  w.setPaddleTarget(4); steps(w, 120);
  near(w.ball.x, w.paddle.x, 1e-9); near(w.ball.y, C.PADDLE_Y + C.BALL_R, 1e-9);
  w.paddle.vx = 0;
  assert.strictEqual(w.serve(), true); assert.strictEqual(w.serve(), false);
  const a = Math.abs(Math.atan2(w.ball.vx, w.ball.vy)) / DEG;
  assert.ok(w.ball.vy > 0 && a >= 7.9 && a <= 22.1, 'angle ' + a);
  const w2 = mk('easy', 4);
  const r = runUntil(w2, has('serve'), 5);
  near(r.t, 3, 0.02); assert.strictEqual(w2.phase, 'play');
});

test('paddle: eases to the pointer target without overshoot, max 20 u/s; keys move at max speed', () => {
  const w = mk('normal', 1); park(w, 3);
  w.setPaddleTarget(13);
  let maxV = 0, maxX = 0;
  for (let i = 0; i < 240; i++) { w.update(H); maxV = Math.max(maxV, Math.abs(w.paddle.vx)); maxX = Math.max(maxX, w.paddle.x); }
  assert.ok(maxV <= C.PADDLE_SPEED + 1e-9 && maxV > 0.9 * C.PADDLE_SPEED, 'v ' + maxV);
  assert.ok(maxX <= 13 + 0.01, 'overshoot ' + maxX); near(w.paddle.x, 13, 0.01);
  w.movePaddle(-1); assert.strictEqual(w.paddle.target, null);
  steps(w, 30); near(w.paddle.vx, -C.PADDLE_SPEED, 0.5);
  assert.strictEqual(w.paddle.face, 'left');
  w.movePaddle(0); steps(w, 60); near(w.paddle.vx, 0, 0.05);
  w.setPaddleTarget(-5); steps(w, 240); near(w.paddle.x, w.paddle.w / 2, 1e-6, 'clamped to the wall');
  assert.strictEqual(w.paddle.face, 'idle');
});

// ---------- bounce angles & rules ----------
test('Wisp bounce: centre straight up, edge ~60°, half-left −30°; squash = 1 then decays; combo resets', () => {
  const c = bounceAt(0);
  near(c.b.vx, 0, 1e-9); assert.ok(c.b.vy > 0); near(c.ev.off, 0, 0.02);
  assert.ok(c.w.paddle.squash > 0.9, 'squash ' + c.w.paddle.squash);
  steps(c.w, 30); assert.ok(c.w.paddle.squash > 0 && c.w.paddle.squash < 0.15, 'decayed ' + c.w.paddle.squash);
  steps(c.w, 120); assert.strictEqual(c.w.paddle.squash, 0);
  const e = bounceAt(0.999);
  near(Math.atan2(e.b.vx, e.b.vy) / DEG, 60, 1.5, 'edge angle'); near(e.ev.off, 1, 0.02);
  const l = bounceAt(-0.5); near(Math.atan2(l.b.vx, l.b.vy) / DEG, -30, 1.5, 'half left');
  const q = bounceAt(0.25); near(Math.atan2(q.b.vx, q.b.vy) / DEG, 15, 1.5, 'quarter right');
  assert.strictEqual(c.w.combo, 0);
});

test('Wisp bounce: a moving Wisp tilts the bounce a little (≤ 12°); a miss beside Wisp falls through', () => {
  for (const v of [20, -20, 4]) {
    const w0 = empty('normal', 3); park(w0, 8); w0.movePaddle(Math.sign(v));
    w0.paddle.vx = v;
    shoot(w0, 8 + v * 0.06, C.PADDLE_Y + C.BALL_R + 0.3, 0, -7);
    if (Math.abs(v) < 10) { w0.movePaddle(0); w0.keyDir = 0; }
    const r0 = runUntil(w0, has('paddle'), 1);
    const pe = of(r0.ev, 'paddle')[0]; assert.ok(pe);
    const tilt = Math.atan2(w0.ball.vx, w0.ball.vy) / DEG - pe.off * C.MAX_ANGLE;
    assert.ok(Math.sign(tilt) === Math.sign(v) && Math.abs(tilt) <= C.NUDGE_MAX + 1e-6, 'tilt ' + tilt + ' v ' + v);
  }
  const w = empty('normal', 3); park(w, 8);
  shoot(w, 8 + w.paddle.w / 2 + C.BALL_R + 0.05, 2, 0, -7);
  const r = runUntil(w, has('ballLost'), 2);
  assert.strictEqual(of(r.ev, 'paddle').length, 0);
});

test('|vy| ≥ 0.38·speed after every bounce (walls, blocks, Wisp, net, release) in 3 minutes of play', () => {
  const w0 = empty('normal', 2);
  shoot(w0, 15, 3, 7.6, 0.01);
  runUntil(w0, has('wall'), 1);
  assert.ok(Math.abs(w0.ball.vy) >= 0.38 * w0.ball.speed - 1e-9);
  near(Math.hypot(w0.ball.vx, w0.ball.vy), w0.ball.speed, 1e-9);
  let n = 0;
  playBot('normal', 3, 0.8, 180, { onStep(w, e) {
    if (!w.ball || w.ball.onPaddle) return;
    if (e.some(x => ['wall', 'brick', 'paddle', 'net', 'release'].includes(x.type))) {
      n++;
      assert.ok(Math.abs(w.ball.vy) >= C.MIN_VY_K * w.ball.speed - 1e-9, 'vy ' + w.ball.vy);
      near(Math.hypot(w.ball.vx, w.ball.vy), w.ball.speed, 1e-6);
    }
  } });
  assert.ok(n > 100, 'bounces ' + n);
});

test('no tunnelling at 16 u/s: a single block is always hit from below, above and the side', () => {
  for (let i = 0; i < 40; i++) {
    const w = mk('normal', 1);
    const k = w.bricks.find(b => b.kind === 'block' && b.row === 3 && b.x < 6);
    const spare = only(w, k); spare.x = 15; spare.y = 7.75;
    k.hp = 99;                         // stays solid after the hit, so 'never inside' is meaningful
    w.drainEvents();
    const ang = (-55 + i * 110 / 39) * DEG, s = 16;
    const dir = i % 3;   // 0 from below, 1 from above, 2 from the side
    let x0, y0, vx, vy;
    if (dir === 0) { x0 = k.x - Math.sin(ang) * 1.5; y0 = k.y - 1.5; vx = Math.sin(ang) * s; vy = Math.cos(ang) * s; }
    else if (dir === 1) { x0 = k.x - Math.sin(ang) * 1.0; y0 = k.y + 1.0; vx = Math.sin(ang) * s; vy = -Math.cos(ang) * s; }
    else {   // aim at a point on the block's left side, coming in 22–68° off vertical
      const a2 = (22 + (i % 7) * 7.7) * DEG * (i % 2 ? 1 : -1), tx = k.x - 0.7, ty = k.y + ((i % 5) - 2) * 0.1;
      vx = Math.sin(Math.abs(a2)) * s; vy = Math.cos(a2) * s * Math.sign(a2);
      x0 = tx - vx / s * 1.5; y0 = ty - vy / s * 1.5;
    }
    shoot(w, x0, y0, vx, vy);
    const r = runUntil(w, has('brick'), 0.6);
    assert.strictEqual(of(r.ev, 'brick').length, 1, 'case ' + i + ' dir ' + dir);
    const b = w.ball;
    if (dir === 0) assert.ok(b.vy < 0 && b.y < k.y, 'reflected down ' + i);
    if (dir === 1) assert.ok(b.vy > 0 && b.y > k.y, 'reflected up ' + i);
    for (let j = 0; j < 30; j++) {   // and it never ends up inside the block
      w.update(H);
      assert.ok(!(Math.abs(b.x - k.x) < k.w / 2 && Math.abs(b.y - k.y) < k.h / 2), 'inside ' + i);
    }
  }
});

test('a corner between two neighbours can break both, with a single reflection', () => {
  const w = mk('normal', 1);
  const row = w.bricks.filter(b => b.row === 4 && b.kind === 'block').sort((a, b) => a.x - b.x);
  const pair = row.find((b, i) => row[i + 1] && Math.abs(row[i + 1].x - b.x - 1.48) < 1e-6);
  const nb = row[row.indexOf(pair) + 1];
  for (const b of w.bricks) if (b.row !== 4 || (b !== pair && b !== nb && b.row === 4 && Math.abs(b.x - pair.x) < 3)) b.alive = b.row < 4 && false;
  pair.alive = nb.alive = true;
  const spare = w.bricks.find(b => b.row === 0); spare.alive = true; spare.x = 15;
  shoot(w, (pair.x + nb.x) / 2, pair.y - 1, 0, 7);
  const r = runUntil(w, has('brick'), 1);
  assert.strictEqual(of(r.ev, 'brick').length, 2);
  assert.ok(w.ball.vy < 0);
});

// ---------- scoring ----------
test('scoring: block 10, tough 2×10, combo +5 from the 3rd block', () => {
  const w = mk('normal', 1); w.drainEvents();
  const bl = w.bricks.filter(b => b.kind === 'block' && b.row >= 4);
  const s0 = w.score;
  const e1 = hitOnce(w, bl[0]); assert.strictEqual(e1.pts, 10); assert.ok(e1.broken); assert.strictEqual(w.score - s0, 10);
  const e2 = hitOnce(w, bl[1]); assert.strictEqual(e2.pts, 10); assert.strictEqual(e2.combo, 2);
  const e3 = hitOnce(w, bl[2]); assert.strictEqual(e3.pts, 15); assert.strictEqual(e3.combo, 3);
  const w2 = empty('normal', 1, { level: 1 });
  const tk = w2.bricks.find(b => b.kind === 'tough') || Object.assign(w2.bricks[0], { kind: 'tough' });
  tk.alive = true; tk.hp = 2;
  const keep = w2.bricks.find(b => b !== tk); keep.alive = true; keep.x = 1; keep.y = 7.75;  // so the zone isn't cleared
  w2.combo = 0;
  const t1 = hitOnce(w2, tk); assert.strictEqual(t1.broken, false); assert.strictEqual(t1.hp, 1); assert.strictEqual(t1.pts, 10);
  steps(w2, 12); w2.combo = 0;
  const t2 = hitOnce(w2, tk); assert.strictEqual(t2.broken, true); assert.strictEqual(t2.pts, 10); assert.ok(!tk.alive);
});

test('gem drop rates: block ≈ 25 %, tough ≈ 50 % (on break), gem block 100 %, magnet block → a bubble', () => {
  const rate = { block: [0, 0], tough: [0, 0] };
  for (let s = 1; s <= 600; s++) {
    for (const kind of ['block', 'tough']) {
      const w = empty('normal', s);
      const k = w.bricks[5], spare = w.bricks[0];
      k.alive = spare.alive = true; spare.x = 15; spare.y = 7.75; k.x = 4; k.y = 6;
      k.kind = kind; k.hp = 1;
      w._hitBrick(k);
      rate[kind][0]++; if (w.gems.length) rate[kind][1]++;
      assert.strictEqual(w.powerups.length, 0);
    }
  }
  near(rate.block[1] / rate.block[0], 0.25, 0.05, 'block');
  near(rate.tough[1] / rate.tough[0], 0.5, 0.06, 'tough');
  for (let s = 1; s <= 20; s++) {
    for (const kind of ['gem', 'magnet']) {
      const w = empty('normal', s);
      const k = w.bricks[5], spare = w.bricks[0];
      k.alive = spare.alive = true; spare.x = 15; k.kind = kind; k.hp = 1;
      w._hitBrick(k);
      const ev = w.drainEvents();
      if (kind === 'gem') { assert.strictEqual(w.gems.length, 1); assert.strictEqual(of(ev, 'gemSpawn').length, 1); }
      else { assert.strictEqual(w.powerups.length, 1); assert.strictEqual(w.gems.length, 0); assert.strictEqual(of(ev, 'magnetSpawn').length, 1); }
    }
  }
  // the first hit of a tough block never drops anything
  const w = empty('normal', 1); const k = w.bricks[5]; k.alive = true; k.kind = 'tough'; k.hp = 2; w.bricks[0].alive = true;
  for (let i = 0; i < 1; i++) w._hitBrick(k);
  assert.strictEqual(w.gems.length, 0);
});

test('gems: pop up, fall to ≈ 2.4 u/s with sway + spin, 3 colours; caught in Wisp’s box for +25', () => {
  const colours = new Set();
  for (let s = 1; s <= 30; s++) { const w = empty('normal', s); w._spawnGem(5, 6); colours.add(w.gems[0].color); }
  assert.deepStrictEqual([...colours].sort(), [0, 1, 2]);
  const w = empty('normal', 1); hold(w); park(w, 14);
  w._spawnGem(4, 6.5);
  const g = w.gems[0], x0 = g.x, y0 = g.y;
  assert.ok(g.vy > 1.4, 'pops up');
  let maxY = 0, minVy = 0, maxDx = 0, rot0 = g.rot;
  for (let i = 0; i < 180; i++) { w.update(H); maxY = Math.max(maxY, g.y); minVy = Math.min(minVy, g.vy); maxDx = Math.max(maxDx, Math.abs(g.x - x0)); }
  assert.ok(maxY > y0 + 0.1 && maxY < y0 + 0.4, 'hop ' + (maxY - y0));
  assert.ok(minVy >= -C.GEM_FALL - 1e-6 && minVy < -2.0, 'terminal ' + minVy);
  assert.ok(maxDx > 0.05 && maxDx < 1.2, 'sway ' + maxDx); assert.ok(g.rot !== rot0, 'spin'); assert.strictEqual(g.pulled, false);
  park(w, g.x); const s0 = w.score;
  const r = runUntil(w, has('gemCatch'), 4);
  const c = of(r.ev, 'gemCatch')[0];
  assert.ok(c); assert.strictEqual(c.pts, 25); assert.strictEqual(c.count, 1); assert.ok(c.color >= 0 && c.color <= 2);
  assert.strictEqual(w.score - s0, 25); assert.strictEqual(w.gemCount, 1); assert.strictEqual(w.paddle.face, 'cheer');
  // a gem far from Wisp is missed
  park(w, 14); w._spawnGem(3, 5);
  const m = runUntil(w, has('gemMiss'), 6);
  assert.strictEqual(of(m.ev, 'gemMiss').length, 1); assert.strictEqual(w.stats.gemsMissed, 1);
});

test('magnet bubble: falls slower (≈ 1.8 u/s, wobbles), catch → magnet.t = max (refreshes), a miss is reported', () => {
  const w = empty('easy', 1); hold(w); park(w, 14);
  w._spawnBubble(4, 6.5);
  const u = w.powerups[0]; let minVy = 0, wob0 = u.wob;
  for (let i = 0; i < 300; i++) { w.update(H); minVy = Math.min(minVy, u.vy); }
  assert.ok(minVy >= -C.BUBBLE_FALL - 1e-6 && minVy < -1.6, 'terminal ' + minVy); assert.ok(u.wob !== wob0);
  park(w, u.x);
  const r = runUntil(w, has('magnetGet'), 4);
  const g = of(r.ev, 'magnetGet')[0]; assert.ok(g); near(g.t, 12, 1e-9);
  assert.strictEqual(w.magnet.max, 12); assert.ok(w.magnet.t > 11.9); assert.strictEqual(w.paddle.face, 'magnet');
  steps(w, 240); const t1 = w.magnet.t; assert.ok(t1 < 10.1);
  w.debugDrop('magnet'); runUntil(w, has('magnetGet'), 4); assert.ok(w.magnet.t > 11.5, 'refreshed ' + w.magnet.t);
  assert.strictEqual(w.stats.magnets, 2);
  const w2 = empty('normal', 1); hold(w2); park(w2, 14); w2._spawnBubble(2, 5);
  const m = runUntil(w2, has('magnetMiss'), 8); assert.strictEqual(of(m.ev, 'magnetMiss').length, 1);
});

test('magnet pull: a gem 4 u to the side curves smoothly into Wisp (no teleport); without the magnet it is missed', () => {
  const run = (magnet) => {
    const w = empty('normal', 2); hold(w); park(w, 9);
    if (magnet) w.debugMagnet();
    w.drainEvents();
    w._spawnGem(4.5, 5.0);
    const g = w.gems[0], path = [];
    const r = runUntil(w, e => { path.push([g.x, g.y, g.pulled]); return e.some(x => x.type === 'gemCatch' || x.type === 'gemMiss'); }, 6);
    return { r, path, w };
  };
  const off = run(false); assert.strictEqual(of(off.r.ev, 'gemMiss').length, 1);
  const on = run(true);
  assert.strictEqual(of(on.r.ev, 'gemCatch').length, 1, 'caught');
  assert.ok(on.path.some(p => p[2]), 'pulled');
  let maxStep = 0;
  for (let i = 1; i < on.path.length; i++) maxStep = Math.max(maxStep, Math.hypot(on.path[i][0] - on.path[i - 1][0], on.path[i][1] - on.path[i - 1][1]));
  assert.ok(maxStep <= (C.MAGNET_VMAX + C.GEM_SWAY[1]) * H + 1e-6, 'no teleport, step ' + maxStep);
  // curved: the path bends away from the straight chord start → end
  const a = on.path[0], b = on.path[on.path.length - 1];
  let dev = 0;
  for (const p of on.path) dev = Math.max(dev, Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / Math.hypot(b[0] - a[0], b[1] - a[1]));
  assert.ok(dev > 0.3, 'curve deviation ' + dev);
  near(on.r.t, 1.5, 1.0, 'flies in quickly');
});

test('magnet stick: a falling pearl sticks (offset kept, follows Wisp), serve() releases it at the offset angle', () => {
  const { w, r } = stickAt('normal', 0.6);
  const st = of(r.ev, 'stick')[0]; assert.ok(st, 'stick'); assert.strictEqual(of(r.ev, 'paddle').length, 0);
  const b = w.ball;
  assert.ok(b.stuck && b.onPaddle); near(b.stuckOff, 0.6, 0.05); near(b.stuckT, C.STICK_T, 0.02);
  assert.strictEqual(w.stats.catches, 1); assert.ok(w.paddle.squash > 0.9); assert.strictEqual(w.phase, 'play');
  w.setPaddleTarget(5); steps(w, 40);
  near(b.x, w.paddle.x + b.stuckOff, 1e-9); near(b.y, C.PADDLE_Y + C.BALL_R, 1e-9);
  assert.strictEqual(w.getState().ball.stuck, true);
  park(w, w.paddle.x); steps(w, 2);
  assert.strictEqual(w.serve(), true);
  const ev = w.drainEvents(), rel = of(ev, 'release')[0];
  assert.ok(rel && rel.auto === false);
  assert.ok(!b.stuck && !b.onPaddle && b.vy > 0);
  const reach = w.paddle.w / 2 + C.BALL_R;
  near(Math.atan2(b.vx, b.vy) / DEG, (0.6 / reach) * C.MAX_ANGLE, 1.0, 'angle for its offset');
  near(Math.hypot(b.vx, b.vy), b.speed, 1e-9);
  assert.strictEqual(w.serve(), false, 'nothing to release now');
});

test('magnet stick: auto-release after 1.5 s; release at once when the magnet ends; no sticking in its last 0.3 s', () => {
  const a = stickAt('normal', -0.4).w;
  const r = runUntil(a, has('release'), 3);
  near(r.t, C.STICK_T, 0.02); assert.strictEqual(of(r.ev, 'release')[0].auto, true);
  assert.ok(a.ball.vy > 0 && a.ball.vx < 0, 'left offset goes left');
  // the magnet runs out while stuck
  const b = stickAt('normal', 0.2).w;
  b.magnet.t = 0.5; b.ball.stuckT = 1.4;
  const r2 = runUntil(b, has('release'), 2);
  near(r2.t, 0.5, 0.02); assert.ok(of(r2.ev, 'magnetEnd').length === 1 && of(r2.ev, 'release')[0].auto === true);
  assert.ok(!b.ball.stuck && b.ball.vy > 0); assert.strictEqual(b.magnet.t, 0);
  // the last 0.3 s: a normal bounce
  const c = empty('normal', 5); park(c, 8); c.debugMagnet(); c.magnet.t = 0.29; c.drainEvents();
  shoot(c, 8, 1.75, 0, -7);
  const r3 = runUntil(c, e => e.some(x => x.type === 'stick' || x.type === 'paddle'), 1);
  assert.strictEqual(of(r3.ev, 'paddle').length, 1); assert.strictEqual(of(r3.ev, 'stick').length, 0);
  // a stuck pearl is never lost, however long
  const d = stickAt('easy', 0).w; d.ball.stuckT = 1e9; d.magnet.t = 1e9;
  const r4 = steps(d, 120 * 20); assert.strictEqual(of(r4, 'ballLost').length, 0); assert.ok(d.ball.stuck);
});

test('magnet timer: magnetWarn at 2 s left, magnetEnd at 0, Easy 12 s / Normal 10 s / Hard 8 s', () => {
  for (const [d, T] of [['easy', 12], ['normal', 10], ['hard', 8]]) {
    const w = empty(d, 1); hold(w); w.debugMagnet();
    const ev = w.drainEvents(); assert.strictEqual(of(ev, 'magnetGet')[0].t, T);
    const r1 = runUntil(w, has('magnetWarn'), 20); near(r1.t, T - 2, 0.02);
    const r2 = runUntil(w, has('magnetEnd'), 5); near(r2.t, 2, 0.02);
    assert.strictEqual(w.magnet.t, 0); assert.notStrictEqual(w.paddle.face, 'magnet');
  }
});

test('face priority: oops > cheer > magnet > left/right > idle', () => {
  const w = empty('normal', 1); hold(w); park(w, 8);
  w.debugMagnet(); w.update(H); assert.strictEqual(w.paddle.face, 'magnet');
  w.movePaddle(1); steps(w, 10); assert.strictEqual(w.paddle.face, 'magnet', 'magnet beats moving');
  w.paddle.cheer = 0.5; w.update(H); assert.strictEqual(w.paddle.face, 'cheer');
  w.paddle.oops = 0.5; w.update(H); assert.strictEqual(w.paddle.face, 'oops');
  w.magnet.t = 0; w.paddle.cheer = 0; w.paddle.oops = 0; w.update(H); assert.strictEqual(w.paddle.face, 'right');
});

// ---------- zones ----------
test('zone clear: +100 + 20/heart, +1 heart, "clear" 2.5 s, then levelUp into the next zone (+4 %, +6 %/round)', () => {
  const w = mk('normal', 1);
  w.debugClear(1);
  const last = w.bricks.find(b => b.alive);
  last.hp = 1; last.kind = 'block';
  w.combo = 0; const h0 = w.hearts, s0 = w.score;
  w._spawnGem(8, 3);                                    // a gem still falling stays catchable in 'clear'
  const e = hitOnce(w, last); assert.ok(e.broken);
  assert.strictEqual(w.phase, 'clear'); assert.strictEqual(w.ball, null);
  assert.strictEqual(w.hearts, h0 + 1);
  assert.strictEqual(w.score - s0, 10 + 100 + 20 * h0);
  assert.strictEqual(w.stats.zoneTimes.length, 1); assert.strictEqual(w.paddle.face, 'cheer');
  assert.ok(w.gems.length >= 1);
  const r = runUntil(w, has('levelUp'), 4);
  near(r.t, C.CLEAR_T, 0.02);
  const up = of(r.ev, 'levelUp')[0];
  assert.deepStrictEqual([up.level, up.zone, up.loop], [1, 1, 0]);
  assert.strictEqual(w.phase, 'serve'); assert.strictEqual(w.bricksLeft(), W.LAYOUTS[1].join('').replace(/\./g, '').length);
  assert.strictEqual(w.net.saves, C.DIFF.normal.netSaves); assert.strictEqual(w.gems.length, 0);
  near(w.ball.speed, 7.6 * 1.04, 1e-9, '+4 % per zone');
  w.gotoLevel(4); assert.deepStrictEqual([w.zone, w.loop], [0, 1]); near(w.ball.speed, 7.6 * 1.06, 1e-9, '+6 % per round');
});

// ---------- hearts ----------
test('hearts: lose one when the pearl is lost (serve again), game over at 0', () => {
  const w = empty('hard', 1);
  assert.strictEqual(w.hearts, 3); assert.strictEqual(w.net.saves, 0);
  park(w, 2);
  shoot(w, 12, 2, 0, -7);
  const r = runUntil(w, has('heartLost'), 2);
  assert.ok(of(r.ev, 'ballLost').length === 1); assert.strictEqual(w.hearts, 2);
  assert.strictEqual(w.phase, 'serve'); assert.strictEqual(w.paddle.face, 'oops');
  for (let i = 0; i < 2; i++) { shoot(w, 12, 2, 0, -7); runUntil(w, has('heartLost'), 2); }
  assert.strictEqual(w.hearts, 0); assert.strictEqual(w.phase, 'over'); assert.strictEqual(w.ball, null);
  steps(w, 2);
  assert.strictEqual(w.serve(), false);
});

test('net: the moonbeam saves the pearl 8× per zone on Easy, 1× on Normal, never on Hard', () => {
  for (const [d, N] of [['easy', 8], ['normal', 1], ['hard', 0]]) {
    const w = empty(d, 1); park(w, 2);
    assert.strictEqual(w.net.saves, N);
    for (let i = 0; i < N; i++) {
      shoot(w, 12, 2, 0, -6.2);
      const r = runUntil(w, e => e.some(x => x.type === 'net' || x.type === 'ballLost'), 2);
      const n = of(r.ev, 'net')[0]; assert.ok(n, d + ' save ' + i); assert.strictEqual(n.savesLeft, N - 1 - i);
      assert.ok(w.ball.vy > 0); assert.strictEqual(w.hearts, 3);
    }
    shoot(w, 12, 2, 0, -6.2);
    const r = runUntil(w, has('ballLost'), 2);
    assert.strictEqual(of(r.ev, 'ballLost').length, 1); assert.strictEqual(w.hearts, 2);
    w.gotoLevel(1); assert.strictEqual(w.net.saves, N, 'refilled per zone');
  }
});

test('hearts: +1 per 10 gems, max 5', () => {
  const w = empty('normal', 1); park(w, 8); hold(w);
  let gains = 0;
  for (let i = 0; i < 40; i++) {
    w._spawnGem(8, 1.5);
    const r = runUntil(w, has('gemCatch'), 2);
    gains += of(r.ev, 'heartGain').filter(e => e.why === 'gems').length;
  }
  assert.strictEqual(w.gemCount, 40); assert.strictEqual(w.hearts, 5); assert.strictEqual(gains, 2);
});

// ---------- anti-stall ----------
test('anti-stall: a pearl bouncing straight up and down in an empty column still finds the last block', () => {
  const w = mk('normal', 1);
  const k = w.bricks.find(b => b.col === 0 || b.col === 9) || w.bricks[0];
  for (const b of w.bricks) if (b !== k) b.alive = false;
  k.hp = 1;
  park(w, 8); w.hearts = 1e6;
  shoot(w, 8, 4, 0, -7.6);
  // Wisp follows the pearl perfectly (centre hits only = straight up, the worst case for a stall)
  const r = runUntil(w, (e, w2) => { if (w2.ball) w2.setPaddleTarget(w2.ball.x); return e.some(x => x.type === 'brick'); }, 60);
  assert.ok(of(r.ev, 'brick').length >= 1, 'no hit in 60 s');
});

// ---------- debug hooks & state ----------
test('debug hooks and getState()', () => {
  const w = mk('easy', 3);
  w.debugDrop('gem'); w.debugDrop('magnet');
  assert.strictEqual(w.gems.length, 1); assert.strictEqual(w.powerups.length, 1);
  const g = w.gems[0], u = w.powerups[0];
  for (const f of ['id', 'x', 'y', 'px', 'py', 'vx', 'vy', 'rot', 'spin', 'color', 'pulled']) assert.ok(f in g, 'gem.' + f);
  for (const f of ['id', 'x', 'y', 'px', 'py', 'vx', 'vy', 'wob']) assert.ok(f in u, 'bubble.' + f);
  for (const f of ['x', 'px', 'y', 'w', 'vx', 'target', 'cheer', 'oops', 'squash', 'face']) assert.ok(f in w.paddle, 'paddle.' + f);
  for (const f of ['x', 'y', 'px', 'py', 'vx', 'vy', 'r', 'speed', 'onPaddle', 'stuck', 'stuckT', 'stuckOff']) assert.ok(f in w.ball, 'ball.' + f);
  for (const f of ['bricks', 'gems', 'magnets', 'magnetsMissed', 'catches', 'lost', 'serves', 'paddleHits', 'netSaves', 'maxCombo', 'zoneTimes', 'gemsMissed']) assert.ok(f in w.stats, 'stats.' + f);
  w.debugMagnet(); assert.strictEqual(w.magnet.t, 12);
  const s = w.getState();
  for (const f of ['phase', 'level', 'zone', 'loop', 'score', 'hearts', 'gemCount', 'bricksLeft', 'ball', 'paddle', 'magnet', 'gems', 'powerups', 'time']) assert.ok(f in s, f);
  assert.strictEqual(s.gems, 1); assert.strictEqual(s.powerups, 1); assert.strictEqual(s.magnet, 12);
  w.debugClear(2); assert.strictEqual(w.bricksLeft(), 2);
});

// ---------- bot ----------
test('bot: skill 1 survives ≥ 3 zones on Normal in most of 5 seeds', () => {
  let ok = 0;
  for (let s = 1; s <= 5; s++) { const r = playBot('normal', s, 1, 400); if (r.w.level >= 3) ok++; }
  assert.ok(ok >= 4, ok + '/5');
});

test('bot: Easy Cloud Deck is easy — skill 0.9 and even skill 0.3 clear it in every seed, in 30–120 s', () => {
  for (const skill of [0.9, 0.3]) for (let s = 1; s <= 6; s++) {
    const r = playBot('easy', s, skill, 240, { onStep(w) { if (w.level >= 1) return false; } });
    assert.ok(r.w.level >= 1, 'skill ' + skill + ' seed ' + s);
    assert.ok(r.t > 30 && r.t < 120, 'time ' + r.t.toFixed(1));
  }
});

test('bot: catches magnet bubbles, aims a stuck pearl and releases it itself (mostly before the auto-release)', () => {
  let mags = 0, stick = 0, manual = 0, auto = 0, caught = 0, missed = 0;
  for (let s = 1; s <= 4; s++) {
    const r = playBot('normal', s, 0.9, 240, { keep: true });
    for (const e of r.ev) {
      if (e.type === 'magnetGet') mags++; if (e.type === 'stick') stick++;
      if (e.type === 'release') { if (e.auto) auto++; else manual++; }
    }
    caught += r.w.stats.gems; missed += r.w.stats.gemsMissed;
  }
  assert.ok(mags >= 6, 'magnets ' + mags); assert.ok(stick >= 10, 'sticks ' + stick);
  assert.ok(manual > 2 * auto, 'manual ' + manual + ' auto ' + auto);
  assert.ok(caught > missed, 'gems ' + caught + '/' + missed);
});

test('bot: only uses setPaddleTarget / serve; deterministic', () => {
  const calls = new Set();
  const w = mk('normal', 3);
  for (const m of ['setPaddleTarget', 'serve', 'movePaddle', 'gotoLevel', 'debugClear', 'debugMagnet', 'debugDrop']) {
    const f = w[m].bind(w); w[m] = function () { calls.add(m); return f.apply(null, arguments); };
  }
  const bot = new WRB.Bot(w, { skill: 0.6, seed: 1 });
  for (let i = 0; i < 3600; i++) { bot.step(1 / 60); w.update(1 / 60); }
  assert.deepStrictEqual([...calls].sort(), ['serve', 'setPaddleTarget']);
  const a = playBot('easy', 4, 0.5, 90).w.getState(), b = playBot('easy', 4, 0.5, 90).w.getState();
  assert.deepStrictEqual(a, b);
});

// ---------- weather ----------
const ZONE_SPRITES = [['p_mist', 'p_twinkle'], ['p_shooting', 'p_sparkle', 'p_twinkle'], ['p_firefly', 'p_petal'], ['p_ember', 'p_firefly']];
test('weather: every zone stays ≤ 90 particles (also while crossfading), right sprites per zone, valid fields', () => {
  const wx = new WRB.Weather({ width: 1400, height: 800, seed: 3 });
  wx.setGround(760);
  const ok = new Set(WRB.Weather.SPRITES);
  let peak = 0;
  const seen = [new Set(), new Set(), new Set(), new Set()];
  for (let z = 0; z < 9; z++) {
    wx.setLevel(z % 4, { instant: z === 0 });
    for (let i = 0; i < 60 * 12; i++) {
      wx.update(1 / 60); peak = Math.max(peak, wx.particles.length);
      assert.ok(wx.particles.length <= WRB.Weather.CAP && WRB.Weather.CAP === 90);
      if (i > 60 * 3) for (const p of wx.particles) seen[z % 4].add(p.sprite);
      if (i % 30 === 0) for (const p of wx.particles) {
        assert.ok(ok.has(p.sprite), p.sprite);
        for (const f of ['x', 'y', 'size', 'rot', 'alpha']) assert.ok(Number.isFinite(p[f]), f);
        assert.ok(p.layer === 'back' || p.layer === 'front'); assert.ok(typeof p.flipX === 'boolean');
        assert.ok(p.alpha >= 0 && p.alpha <= 1 && p.size > 0);
      }
    }
  }
  for (let z = 0; z < 4; z++) assert.deepStrictEqual([...seen[z]].sort(), ZONE_SPRITES[z], 'zone ' + z);
  assert.ok(peak > 25, 'peak ' + peak);
  wx.resize(960, 540); wx.update(0.1);
});

test('weather: motion — twinkles stay put and blink, mist drifts, shooting stars every 4–8 s, embers rise, petals fall', () => {
  const wx = new WRB.Weather({ width: 960, height: 540, seed: 4 });
  const tw = wx.particles.find(p => p.kind === 'twinkle'), x0 = tw.x, y0 = tw.y, mist = wx.particles.find(p => p.kind === 'mist'), mx = mist.x;
  let amin = 1, amax = 0;
  for (let i = 0; i < 180; i++) { wx.update(1 / 60); amin = Math.min(amin, tw.alpha); amax = Math.max(amax, tw.alpha); }
  assert.strictEqual(tw.x, x0); assert.strictEqual(tw.y, y0); assert.ok(amax - amin > 0.3, 'blink');
  assert.ok(Math.abs(mist.x - mx) > 10 && Math.abs(mist.x - mx) < 60, 'mist drift ' + (mist.x - mx));
  wx.setLevel(1, { instant: true });
  const times = []; let seen = new Set();
  for (let i = 0; i < 60 * 60; i++) {
    wx.update(1 / 60);
    for (const p of wx.particles) if (p.kind === 'shooting' && !seen.has(p)) {
      seen.add(p); times.push(wx.time);
      const sx = p.x, sy = p.y; wx.update(0.1);
      const d = Math.hypot(p.x - sx, p.y - sy);
      assert.ok(d > 40 && p.y > sy, 'fast and downward ' + d);
      near(Math.atan2(p.y - sy, p.x - sx), p.rot, 1e-6, 'points along its path');
    }
  }
  const gaps = times.slice(1).map((t, i) => t - times[i]);
  assert.ok(gaps.length >= 6 && gaps.every(g => g >= 4 - 0.05 && g <= 8 + 0.15), gaps.map(g => g.toFixed(2)).join());
  wx.setLevel(3, { instant: true });
  const em = wx.particles.filter(p => p.kind === 'ember'), ey = em.map(p => p.y);
  wx.update(0.5);
  assert.ok(em.filter((p, i) => wx.particles.includes(p) && p.y < ey[i]).length >= em.length * 0.7, 'embers rise');
  wx.setLevel(2, { instant: true });
  const pe = wx.particles.filter(p => p.kind === 'petal'), py = pe.map(p => p.y);
  wx.update(0.5);
  assert.ok(pe.filter((p, i) => p.y > py[i]).length === pe.length, 'petals fall');
});

test('weather: crossfade — the old zone fades out while the new one fades in', () => {
  const wx = new WRB.Weather({ width: 960, height: 540, seed: 2 });
  for (let i = 0; i < 60; i++) wx.update(1 / 60);
  wx.setLevel(2);
  for (let i = 0; i < 30; i++) wx.update(1 / 60);
  const kinds = new Set(wx.particles.map(p => p.sprite));
  assert.ok(kinds.has('p_twinkle') && kinds.has('p_petal'), [...kinds].join());
  for (let i = 0; i < 180; i++) wx.update(1 / 60);
  assert.ok(wx.particles.every(p => p.sprite === 'p_petal' || p.sprite === 'p_firefly'));
});

// ---------- performance ----------
test('10 simulated minutes (world + bot) run in ≈ 2 s', () => {
  const t0 = Date.now();
  const w = mk('normal', 8); w.hearts = w.maxHearts = 1e6;
  const bot = new WRB.Bot(w, { skill: 0.9, seed: 2 });
  for (let i = 0; i < 600 * 60; i++) { bot.step(1 / 60); w.update(1 / 60); w.drainEvents(); }
  const ms = Date.now() - t0;
  assert.ok(ms < 2500, ms + ' ms');
  assert.ok(w.level >= 8, 'level ' + w.level);
});

// ---------- run ----------
let fail = 0;
const T0 = Date.now();
for (const t of tests) {
  try { t.fn(); console.log('PASS ' + t.name); }
  catch (e) { fail++; console.log('FAIL ' + t.name + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n     ') : e)); }
}

if (process.argv.includes('--stats')) {
  console.log('\nbot report (900 s cap, zone times in s):');
  for (const diff of ['easy', 'normal', 'hard']) for (const skill of [0.3, 0.6, 0.9]) {
    const lv = [], tm = [];
    for (let s = 1; s <= 5; s++) { const r = playBot(diff, s, skill, 900); lv.push(r.w.level); tm.push(...r.w.stats.zoneTimes); }
    const avg = tm.length ? (tm.reduce((a, b) => a + b, 0) / tm.length).toFixed(0) : '-';
    console.log(`  ${diff.padEnd(6)} skill ${skill}: zones ${lv.join(',')}  avg zone ${avg} s`);
  }
}
console.log(`\n${tests.length - fail}/${tests.length} passed (${((Date.now() - T0) / 1000).toFixed(1)} s)`);
process.exit(fail ? 1 : 0);
