#!/usr/bin/env node
// Mochi's Fairy Bounce — headless unit tests for rng / world / weather / bot (node, no deps).
// Run from projects/daily-game/panda-fairy-bounce:   node tests/unit/run.js        (add --stats for the bot report)
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { load, JS } = require('./load');

const MFB = load();
const W = MFB.World, C = W.CONFIG, H = C.STEP, DEG = Math.PI / 180;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const near = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, (m || '') + ' got ' + a + ' want ' + b + ' ±' + tol);

// ---------- helpers ----------
function mk(diff, seed, extra) { return new W(Object.assign({ seed: seed || 1, difficulty: diff || 'normal' }, extra || {})); }
/** a world with every block gone (no clear is triggered: that only happens when a hit breaks the last one) */
function empty(diff, seed) { const w = mk(diff, seed); w.debugClear(0); w.boss.nextThrow = 1e9; w.drainEvents(); return w; }
function steps(w, n) { const ev = []; for (let i = 0; i < n; i++) { w.update(H); ev.push(...w.drainEvents()); } return ev; }
function runUntil(w, pred, max) {
  const ev = []; let t = 0; max = max || 10;
  while (t < max) { w.update(H); t += H; const e = w.drainEvents(); ev.push(...e); if (pred(e, w)) break; }
  return { ev, t };
}
const of = (ev, t) => ev.filter(e => e.type === t);
/** put the ball in play at (x, y) with velocity (vx, vy) */
function shoot(w, x, y, vx, vy) {
  w.phase = 'play';
  const b = w.ball || (w.ball = { r: C.BALL_R, spin: 0 });
  Object.assign(b, { x, y, px: x, py: y, vx, vy, onPaddle: false, speed: Math.hypot(vx, vy) });
}
/** back to 'serve' with the auto-serve switched off (the ball stays on the cap) */
function hold(w) { w.phase = 'serve'; w._toServe(); w.serveT = -1e9; }
/** kill every block except `keep` and one spare far away (so breaking `keep` doesn't clear the season) */
function only(w, keep) {
  for (const b of w.bricks) b.alive = false;
  keep.alive = true;
  const spare = w.bricks.find(b => b !== keep && Math.abs(b.x - keep.x) > 4 && b.row <= 1);
  spare.alive = true;
  return spare;
}
/** hold the paddle still at x */
function park(w, x) { w.paddle.x = w.paddle.px = x; w.paddle.vx = 0; w.setPaddleTarget(x); }
/** hit brick k once from below (the ball comes straight up under it) */
function hitOnce(w, k) {
  shoot(w, k.x, k.y - 1, 0, 6);
  const r = runUntil(w, e => e.some(x => x.type === 'brick'), 2);
  return of(r.ev, 'brick')[0];
}
function bounceAt(off, paddleVx) {
  const w = empty('normal', 3); park(w, 8);
  if (paddleVx) { w.paddle.target = null; w.keyDir = 0; }
  const reach = w.paddle.w / 2 + C.BALL_R;
  shoot(w, 8 + off * reach, C.PADDLE_Y + C.BALL_R + 0.3, 0, -7);
  if (paddleVx) w.paddle.vx = paddleVx;
  const r = runUntil(w, e => e.some(x => x.type === 'paddle'), 1);
  assert.ok(of(r.ev, 'paddle').length === 1, 'paddle bounce');
  return { w, b: w.ball, ev: of(r.ev, 'paddle')[0] };
}
function playBot(diff, seed, skill, maxS, opts) {
  opts = opts || {};
  const w = mk(diff, seed, opts.world);
  const bot = new MFB.Bot(w, { skill, seed: seed * 7 + 1 });
  const dt = 1 / 60; let t = 0; const ev = [];
  while (w.phase !== 'over' && t < maxS) {
    bot.step(dt); w.update(dt); t += dt;
    const e = w.drainEvents(); if (opts.keep) for (const x of e) ev.push(x);
    if (opts.onStep) opts.onStep(w, e);
  }
  return { w, t, bot, ev };
}

// ---------- RNG ----------
test('rng: same seed → same sequence, ranges hold', () => {
  const a = new MFB.RNG(42), b = new MFB.RNG(42), c = new MFB.RNG(43);
  const sa = [], sb = [], sc = [];
  for (let i = 0; i < 50; i++) { sa.push(a.next()); sb.push(b.next()); sc.push(c.next()); }
  assert.deepStrictEqual(sa, sb); assert.notDeepStrictEqual(sa, sc);
  const r = new MFB.RNG('x');
  for (let i = 0; i < 2000; i++) {
    const v = r.int(2, 5); assert.ok(v >= 2 && v <= 5 && v === Math.floor(v));
    const f = r.range(-1, 3); assert.ok(f >= -1 && f < 3);
    assert.ok(['a', 'b'].includes(r.pick(['a', 'b'])));
  }
});

test('no Math.random in world.js / bot.js', () => {
  for (const f of ['world.js', 'bot.js']) assert.ok(!/Math\.random/.test(fs.readFileSync(path.join(JS, f), 'utf8')), f);
});

// ---------- layouts & grid ----------
test('layouts: 4 seasons, 5–6 rows × 10, 26–40 blocks, some star and tough blocks', () => {
  assert.strictEqual(W.LAYOUTS.length, 4);
  for (const L of W.LAYOUTS) {
    assert.ok(L.length >= 5 && L.length <= 6);
    for (const row of L) assert.ok(/^[.bts]{10}$/.test(row), row);
    const all = L.join(''), n = all.replace(/\./g, '').length;
    assert.ok(n >= 26 && n <= 40, 'blocks ' + n);
    assert.ok((all.match(/s/g) || []).length >= 2, 'stars');
    assert.ok((all.match(/t/g) || []).length >= 1, 'tough');
  }
});

test('grid: 10 columns of 1.4 u (+0.08 gaps) centred on x 8, top row at y 7.2, rows 0.6 u apart', () => {
  const w = mk('normal', 1);
  const xs = [...new Set(w.bricks.map(b => +b.x.toFixed(3)))].sort((a, b) => a - b);
  const ys = [...new Set(w.bricks.map(b => +b.y.toFixed(3)))].sort((a, b) => b - a);
  const all = [];
  for (let c = 0; c < 10; c++) all.push(8 + (c - 4.5) * 1.48);
  for (const x of xs) assert.ok(all.some(a => Math.abs(a - x) < 1e-6), 'x ' + x);
  near(ys[0], 7.2, 1e-9); near(ys[0] - ys[1], 0.6, 1e-9);
  near(all[0] - 0.7, 0.64, 1e-9); near(all[9] + 0.7, 15.36, 1e-9);
  for (const b of w.bricks) { assert.strictEqual(b.w, 1.4); assert.strictEqual(b.h, 0.5); assert.ok(b.hitT > 10); }
});

test('round 2 (loop ≥ 1) turns some buds tough; same seed → same layout', () => {
  let t0 = 0, t1 = 0;
  for (let s = 1; s <= 8; s++) {
    t0 += mk('normal', s, { level: 0 }).bricks.filter(b => b.kind === 'tough').length;
    t1 += mk('normal', s, { level: 4 }).bricks.filter(b => b.kind === 'tough').length;
  }
  assert.ok(t1 > t0 + 8, 'tough blocks ' + t0 + ' → ' + t1);
  const a = mk('normal', 9, { level: 5 }).bricks.map(b => b.kind).join(), b = mk('normal', 9, { level: 5 }).bricks.map(b => b.kind).join();
  assert.strictEqual(a, b);
});

test('difficulty table: cap width, ball speed, vine saves, pillow interval, sleepy time', () => {
  const exp = { easy: [3.6, 5.4, 8, 35, 1.6], normal: [2.5, 7.6, 1, 30, 2.0], hard: [2.1, 9.0, 0, 25, 2.4] };
  for (const d in exp) {
    const w = mk(d, 1), e = exp[d];
    assert.strictEqual(w.paddle.w, e[0]); assert.strictEqual(w.ball.speed, e[1]); assert.strictEqual(w.net.saves, e[2]);
    assert.strictEqual(w.boss.nextThrow, e[3]); assert.strictEqual(C.DIFF[d].sleepyTime, e[4]);
  }
  assert.strictEqual(C.AUTO_SERVE, 3); assert.strictEqual(C.STEP, 1 / 120);
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
});

// ---------- serve & paddle ----------
test('serve: ball rides the cap, serve() launches upward 8–22° off vertical, auto-serve after 3 s', () => {
  const w = mk('easy', 4);
  assert.strictEqual(w.phase, 'serve'); assert.ok(w.ball.onPaddle);
  w.setPaddleTarget(4); steps(w, 120);
  near(w.ball.x, w.paddle.x, 1e-9); near(w.ball.y, C.PADDLE_Y + C.BALL_R, 1e-9);
  w.paddle.vx = 0;
  assert.strictEqual(w.serve(), true); assert.strictEqual(w.serve(), false);
  const a = Math.abs(Math.atan2(w.ball.vx, w.ball.vy)) / DEG;
  assert.ok(w.ball.vy > 0 && a >= 7.9 && a <= 22.1, 'angle ' + a);
  const w2 = mk('easy', 4);
  const r = runUntil(w2, e => e.some(x => x.type === 'serve'), 5);
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
  w.movePaddle(0); steps(w, 60); near(w.paddle.vx, 0, 0.05);
  w.setPaddleTarget(-5); steps(w, 240); near(w.paddle.x, w.paddle.w / 2, 1e-6, 'clamped to the wall');
  assert.strictEqual(w.paddle.face, 'idle');
});

// ---------- bounce angles & rules ----------
test('cap: a centre hit goes straight up, the edge goes ~60°, combo resets', () => {
  const c = bounceAt(0);
  near(c.b.vx, 0, 1e-9); assert.ok(c.b.vy > 0); near(c.ev.off, 0, 0.02);
  const e = bounceAt(0.999);
  const a = Math.atan2(e.b.vx, e.b.vy) / DEG;
  near(a, 60, 1.5, 'edge angle'); near(e.ev.off, 1, 0.02);
  const l = bounceAt(-0.5); near(Math.atan2(l.b.vx, l.b.vy) / DEG, -30, 1.5, 'half left');
  assert.strictEqual(c.w.combo, 0);
});

test('cap: a moving cap tilts the bounce a little (≤ 12°); a miss beside the cap falls through', () => {
  for (const v of [20, -20, 4]) {
    const w0 = empty('normal', 3); park(w0, 8); w0.movePaddle(Math.sign(v));
    w0.paddle.vx = v;
    shoot(w0, 8 + v * 0.06, C.PADDLE_Y + C.BALL_R + 0.3, 0, -7);
    if (Math.abs(v) < 10) { w0.movePaddle(0); w0.keyDir = 0; }
    const r0 = runUntil(w0, e => e.some(x => x.type === 'paddle'), 1);
    const pe = of(r0.ev, 'paddle')[0]; assert.ok(pe);
    const tilt = Math.atan2(w0.ball.vx, w0.ball.vy) / DEG - pe.off * C.MAX_ANGLE;
    assert.ok(Math.sign(tilt) === Math.sign(v) && Math.abs(tilt) <= C.NUDGE_MAX + 1e-6, 'tilt ' + tilt + ' v ' + v);
  }
  const w = empty('normal', 3); park(w, 8);
  shoot(w, 8 + w.paddle.w / 2 + C.BALL_R + 0.05, 2, 0, -7);
  const r = runUntil(w, e => e.some(x => x.type === 'ballLost'), 2);
  assert.strictEqual(of(r.ev, 'paddle').length, 0);
});

test('|vy| ≥ 0.38·speed after every bounce (walls, blocks, Hoot, cap) in 3 minutes of play', () => {
  const w0 = empty('normal', 2);
  shoot(w0, 15, 3, 7.6, 0.01);
  const r = runUntil(w0, e => e.some(x => x.type === 'wall'), 1);
  assert.ok(Math.abs(w0.ball.vy) >= 0.38 * w0.ball.speed - 1e-9);
  near(Math.hypot(w0.ball.vx, w0.ball.vy), w0.ball.speed, 1e-9);
  void r;
  let n = 0;
  playBot('normal', 3, 0.8, 180, { onStep(w, e) {
    if (!w.ball || w.ball.onPaddle) return;
    if (e.some(x => ['wall', 'brick', 'paddle', 'bossHit', 'net'].includes(x.type))) {
      n++;
      assert.ok(Math.abs(w.ball.vy) >= C.MIN_VY_K * w.ball.speed - 1e-9, 'vy ' + w.ball.vy);
      near(Math.hypot(w.ball.vx, w.ball.vy), w.ball.speed, 1e-6);
    }
  } });
  assert.ok(n > 100, 'bounces ' + n);
});

test('no tunnelling at 16 u/s: a single block is always hit from below, above and the side', () => {
  for (let i = 0; i < 40; i++) {
    const w = mk('normal', 1); w.boss.nextThrow = 1e9;
    const k = w.bricks.find(b => b.kind === 'bud' && b.row === 3 && b.x < 6);
    const spare = only(w, k); spare.x = 15; spare.y = 7.2;
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
    const r = runUntil(w, e => e.some(x => x.type === 'brick'), 0.6);
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
  const w = mk('normal', 1); w.boss.nextThrow = 1e9;
  const row = w.bricks.filter(b => b.row === 4 && b.kind === 'bud').sort((a, b) => a.x - b.x);
  const pair = row.find((b, i) => row[i + 1] && Math.abs(row[i + 1].x - b.x - 1.48) < 1e-6);
  const nb = row[row.indexOf(pair) + 1];
  for (const b of w.bricks) if (b.row < 4) b.alive = false;
  shoot(w, (pair.x + nb.x) / 2, pair.y - 1, 0, 7);
  const r = runUntil(w, e => e.some(x => x.type === 'brick'), 1);
  assert.strictEqual(of(r.ev, 'brick').length, 2);
  assert.ok(w.ball.vy < 0);
});

// ---------- scoring ----------
test('scoring: block 10, tough 2×10, combo +5 from the 3rd block', () => {
  const w = mk('normal', 1); w.boss.nextThrow = 1e9; w.drainEvents();
  const buds = w.bricks.filter(b => b.kind === 'bud' && b.row === 5 || (b.kind === 'bud' && b.row === 4));
  const s0 = w.score;
  const e1 = hitOnce(w, buds[0]); assert.strictEqual(e1.pts, 10); assert.ok(e1.broken); assert.strictEqual(w.score - s0, 10);
  const e2 = hitOnce(w, buds[1]); assert.strictEqual(e2.pts, 10); assert.strictEqual(e2.combo, 2);
  const e3 = hitOnce(w, buds[2]); assert.strictEqual(e3.pts, 15); assert.strictEqual(e3.combo, 3);
  const w2 = empty('normal', 1);
  const tk = w2.bricks.find(b => b.kind === 'tough'); tk.alive = true; tk.hp = 2;
  const keep = w2.bricks.find(b => b !== tk); keep.alive = true; keep.x = 1; keep.y = 7.2;  // so the season isn't cleared
  w2.combo = 0;
  const t1 = hitOnce(w2, tk); assert.strictEqual(t1.broken, false); assert.strictEqual(t1.hp, 1); assert.strictEqual(t1.pts, 10);
  steps(w2, 12); w2.combo = 0;
  const t2 = hitOnce(w2, tk); assert.strictEqual(t2.broken, true); assert.strictEqual(t2.pts, 10); assert.ok(!tk.alive);
});

test('scoring: star block drops a star; caught star +50 (falls ~2.4 u/s with sway and spin)', () => {
  const w = mk('normal', 1); w.boss.nextThrow = 1e9; w.drainEvents();
  const sb = w.bricks.find(b => b.kind === 'star' && b.row >= 2);
  only(w, sb);
  const e = hitOnce(w, sb);
  assert.ok(e && e.kind === 'star' && e.broken);
  assert.strictEqual(w.stars.length, 1);
  hold(w);
  const st = w.stars[0], x0 = st.x;
  park(w, 1.5); w.boss.nextThrow = 1e9;
  let minVy = 0, maxDx = 0, rot0 = st.rot;
  for (let i = 0; i < 120; i++) { w.update(H); minVy = Math.min(minVy, st.vy); maxDx = Math.max(maxDx, Math.abs(st.x - x0)); }
  assert.ok(minVy > -2.41 && minVy < -1.5, 'vy ' + minVy); assert.ok(maxDx > 0.05, 'sway'); assert.ok(st.rot !== rot0, 'spin');
  park(w, st.x); const s0 = w.score;
  const r = runUntil(w, ev => ev.some(x => x.type === 'starCatch'), 4);
  const c = of(r.ev, 'starCatch')[0];
  assert.ok(c); assert.strictEqual(c.pts, 50); assert.strictEqual(w.score - s0, 50); assert.strictEqual(w.starCount, 1);
});

test('scoring: ball hits Hoot +30 (he giggles and gets pushed), 3 hits tickle him for +100', () => {
  const w = empty('normal', 1);
  let pts = 0, giggled = false, pushed = 0;
  for (let i = 0; i < 3; i++) {
    w.boss.state = 'float'; w.boss.stateT = 0;
    shoot(w, w.boss.x - 0.3, 6.8, 0, 7);
    const r = runUntil(w, e => e.some(x => x.type === 'bossHit'), 1);
    const h = of(r.ev, 'bossHit')[0]; assert.ok(h, 'hit ' + i);
    assert.strictEqual(h.pts, 30); assert.strictEqual(h.hits, i + 1);
    giggled = giggled || w.boss.state === 'giggle';
    pts += of(r.ev, 'bossTickled').reduce((s, e) => s + e.pts, 0);
    assert.ok(w.ball.vy < 0, 'bounced off');
    steps(w, 20); pushed = Math.max(pushed, Math.abs(w.boss.off));
    near(w.boss.y, C.BOSS_Y, C.BOSS_BOB + 1e-9);
  }
  assert.ok(giggled); assert.strictEqual(pts, 100); assert.strictEqual(w.stats.tickles, 1);
  assert.ok(pushed > 0.02, 'pushed ' + pushed); near(w.score, 3 * 30 + 100, 0);
  near(C.GIGGLE_T, 1.2, 1e-9);
});

test('season clear: +100 + 20/heart, +1 heart, "clear" for ~2 s, then the next season', () => {
  const w = mk('normal', 1); w.boss.nextThrow = 1e9;
  w.debugClear(1);
  const last = w.bricks.find(b => b.alive);
  if (last.kind === 'tough') last.hp = 1;
  w.combo = 0; const h0 = w.hearts, s0 = w.score;
  const e = hitOnce(w, last); assert.ok(e.broken);
  const ev = w.drainEvents();
  assert.strictEqual(w.phase, 'clear'); assert.strictEqual(w.ball, null);
  assert.strictEqual(w.hearts, h0 + 1);
  assert.strictEqual(w.score - s0, 10 + 100 + 20 * h0);
  void ev;
  const r = runUntil(w, x => x.some(y => y.type === 'levelUp'), 4);
  near(r.t, C.CLEAR_T, 0.02);
  const up = of(r.ev, 'levelUp')[0];
  assert.deepStrictEqual([up.level, up.zone, up.loop], [1, 1, 0]);
  assert.strictEqual(w.phase, 'serve'); assert.ok(w.bricksLeft() >= 26);
  assert.strictEqual(w.net.saves, C.DIFF.normal.netSaves);
  near(w.ball.speed, 7.6 * 1.04, 1e-9, '+4 % per season');
  w.gotoLevel(4); assert.deepStrictEqual([w.zone, w.loop], [0, 1]); near(w.ball.speed, 7.6 * 1.06, 1e-9, '+6 % per round');
});

// ---------- hearts ----------
test('hearts: lose one when the ball is lost (serve again), game over at 0', () => {
  const w = empty('hard', 1);
  assert.strictEqual(w.hearts, 3); assert.strictEqual(w.net.saves, 0);
  park(w, 2);
  shoot(w, 12, 2, 0, -7);
  const r = runUntil(w, e => e.some(x => x.type === 'heartLost'), 2);
  assert.ok(of(r.ev, 'ballLost').length === 1); assert.strictEqual(w.hearts, 2);
  assert.strictEqual(w.phase, 'serve'); assert.strictEqual(w.paddle.face, 'oops');
  for (let i = 0; i < 2; i++) { shoot(w, 12, 2, 0, -7); runUntil(w, e => e.some(x => x.type === 'heartLost'), 2); }
  assert.strictEqual(w.hearts, 0); assert.strictEqual(w.phase, 'over'); assert.strictEqual(w.ball, null);
  const g = steps(w, 2); void g;
  assert.strictEqual(w.serve(), false);
});

test('hearts: the fairy vine saves the ball DIFF.easy.netSaves (8) times per season on Easy (once on Normal)', () => {
  const w = empty('easy', 1); park(w, 2); const N = C.DIFF.easy.netSaves;
  for (let i = 0; i < N; i++) {
    shoot(w, 12, 2, 0, -6.2);
    const r = runUntil(w, e => e.some(x => x.type === 'net' || x.type === 'ballLost'), 2);
    const n = of(r.ev, 'net')[0]; assert.ok(n, 'save ' + i); assert.strictEqual(n.savesLeft, N - 1 - i);
    assert.ok(w.ball.vy > 0); assert.strictEqual(w.hearts, 3);
  }
  shoot(w, 12, 2, 0, -6.2);
  const r = runUntil(w, e => e.some(x => x.type === 'ballLost'), 2);
  assert.strictEqual(of(r.ev, 'ballLost').length, 1); assert.strictEqual(w.hearts, 2);
  assert.strictEqual(mk('normal').net.saves, 1);
});

test('hearts: +1 per 10 stars, max 5', () => {
  const w = empty('normal', 1); park(w, 8);
  w.phase = 'serve'; w._toServe();
  let gains = 0;
  for (let i = 0; i < 40; i++) {
    w._spawnStar(8, 1.5);
    const r = runUntil(w, e => e.some(x => x.type === 'starCatch'), 2);
    gains += of(r.ev, 'heartGain').filter(e => e.why === 'stars').length;
  }
  assert.strictEqual(w.starCount, 40); assert.strictEqual(w.hearts, 5); assert.strictEqual(gains, 2);
});

// ---------- the twist: pillows ----------
test('pillow: thrown every 30 s on Normal, arcs with gravity + drag to ≤ 3.2 u/s, the shadow (landX) is exact', () => {
  const w = mk('normal', 7); park(w, 2); w.hearts = 1e6;   // the parked cap loses every ball: keep playing
  const r = runUntil(w, e => e.some(x => x.type === 'bossThrow'), 40);
  near(r.t, 30, 0.02); assert.strictEqual(w.boss.state, 'throw');
  const pl = w.pillows[0]; assert.ok(pl);
  assert.ok(pl.vy > 0, 'tossed up first');
  park(w, pl.landX < 8 ? 14.5 : 1.5);
  w.setPaddleTarget(w.paddle.x);
  let minVy = 1, landed = null, rot0 = pl.rot;
  for (let i = 0; i < 1200 && !landed; i++) {
    w.update(H); minVy = Math.min(minVy, pl.vy);
    for (const e of w.drainEvents()) if (e.type === 'pillowLand') landed = e;
  }
  assert.ok(landed, 'landed'); near(landed.x, pl.landX, 1e-6);
  assert.ok(minVy < -2.5 && minVy >= -C.PILLOW_TERM - 1e-6, 'terminal ' + minVy);
  assert.ok(pl.rot !== rot0, 'tumbles');
});

test('pillow: it aims near Mochi (never perfectly), a bonk makes him sleepy and never costs a heart', () => {
  let near0 = 0;
  for (let s = 1; s <= 20; s++) {
    const w = empty('normal', s); park(w, 8); w.debugThrow();
    const d = Math.abs(w.pillows[0].landX - 8);
    assert.ok(d >= C.PILLOW_MISS[0] - 0.05 && d <= C.PILLOW_MISS[1] + 0.05, 'miss ' + d);
    if (d < w.paddle.w / 2) near0++;
  }
  assert.ok(near0 >= 5, 'most land on the cap if he stands still: ' + near0);
  const w = empty('normal', 3); park(w, 8); hold(w);
  w.debugThrow(); park(w, w.pillows[0].landX);
  const h0 = w.hearts;
  const r = runUntil(w, e => e.some(x => x.type === 'pillowHit'), 6);
  assert.strictEqual(of(r.ev, 'pillowHit').length, 1);
  near(w.paddle.sleepy, C.DIFF.normal.sleepyTime, 0.02); assert.strictEqual(w.hearts, h0);
  assert.strictEqual(w.paddle.face, 'sleepy');
  w.setPaddleTarget(w.paddle.x > 8 ? 1 : 15);
  let vmax = 0; for (let i = 0; i < 100; i++) { w.update(H); vmax = Math.max(vmax, Math.abs(w.paddle.vx)); }
  assert.ok(vmax <= C.PADDLE_SPEED * C.SLEEPY_SPEED_K + 1e-9, 'sleepy speed ' + vmax);
  steps(w, 240); assert.strictEqual(w.paddle.sleepy, 0); assert.notStrictEqual(w.paddle.face, 'sleepy');
});

test('pillow: the ball pops it (+10) and keeps going', () => {
  const w = empty('normal', 2); park(w, 1.5); w.debugThrow();
  const pl = w.pillows[0];
  steps(w, 60);
  const vx = 0, vy = 7;
  shoot(w, pl.x, pl.y - 1.5, vx, vy);
  const s0 = w.score;
  const r = runUntil(w, e => e.some(x => x.type === 'pillowPop'), 1);
  const p = of(r.ev, 'pillowPop')[0]; assert.ok(p); assert.strictEqual(p.pts, 10);
  assert.strictEqual(w.score - s0, 10); assert.strictEqual(w.pillows.length, 0); assert.ok(w.ball.vy > 0, 'keeps going');
});

test('Hoot: drifts in x 2…14 at y 8.0 ± 0.15, flaps, bobs', () => {
  const w = mk('normal', 11);
  let minX = 99, maxX = -99, flaps = new Set();
  for (let i = 0; i < 120 * 60; i++) {
    w._stepBoss(H); minX = Math.min(minX, w.boss.x); maxX = Math.max(maxX, w.boss.x);
    assert.ok(Math.abs(w.boss.y - 8) <= 0.15 + 1e-9); flaps.add(Math.floor(w.boss.flap * 4));
    w.boss.nextThrow = 1e9;
  }
  assert.ok(minX >= 2 && maxX <= 14 && maxX - minX > 5, minX + '…' + maxX);
  assert.strictEqual(flaps.size, 4);
});

// ---------- anti-stall ----------
test('anti-stall: a ball bouncing straight up and down in an empty column still finds the last block', () => {
  const w = mk('normal', 1); w.boss.nextThrow = 1e9;
  const k = w.bricks.find(b => b.col === 0 || b.col === 9) || w.bricks[0];
  for (const b of w.bricks) if (b !== k) b.alive = false;
  if (k.kind === 'tough') k.hp = 1;
  park(w, 8);
  shoot(w, 8, 4, 0, -7.6);
  const r = runUntil(w, e => e.some(x => x.type === 'brick'), 60);
  assert.ok(of(r.ev, 'brick').length >= 1, 'no hit in 60 s');
});

// ---------- bot ----------
test('bot: skill 1 survives ≥ 3 seasons on Normal in most of 5 seeds', () => {
  let ok = 0;
  for (let s = 1; s <= 5; s++) { const r = playBot('normal', s, 1, 400); if (r.w.level >= 3) ok++; }
  assert.ok(ok >= 4, ok + '/5');
});

test('bot: Easy spring is easy — even a skill-0.3 bot clears it in every seed', () => {
  for (let s = 1; s <= 5; s++) {
    const r = playBot('easy', s, 0.3, 200, { onStep(w) { if (w.level >= 1) w.phase = 'over'; } });
    assert.ok(r.w.level >= 1, 'seed ' + s);
  }
});

test('bot: only uses setPaddleTarget / serve; deterministic', () => {
  const calls = new Set();
  const w = mk('normal', 3);
  for (const m of ['setPaddleTarget', 'serve', 'movePaddle', 'gotoLevel', 'debugClear', 'debugThrow']) {
    const f = w[m].bind(w); w[m] = function () { calls.add(m); return f.apply(null, arguments); };
  }
  const bot = new MFB.Bot(w, { skill: 0.6, seed: 1 });
  for (let i = 0; i < 3600; i++) { bot.step(1 / 60); w.update(1 / 60); }
  assert.deepStrictEqual([...calls].sort(), ['serve', 'setPaddleTarget']);
});

// ---------- weather ----------
test('weather: every season stays ≤ 90 particles (also while crossfading), valid sprites and fields', () => {
  const wx = new MFB.Weather({ width: 1400, height: 800, seed: 3 });
  wx.setGround(760);
  const ok = new Set(['p_petal', 'p_firefly', 'p_butterfly', 'p_leaf', 'p_snow', 'p_sparkle']);
  let peak = 0;
  const seen = [new Set(), new Set(), new Set(), new Set()];
  for (let z = 0; z < 9; z++) {
    wx.setLevel(z % 4, { instant: z === 0 });
    for (let i = 0; i < 60 * 8; i++) {
      wx.update(1 / 60); peak = Math.max(peak, wx.particles.length);
      assert.ok(wx.particles.length <= MFB.Weather.CAP && MFB.Weather.CAP === 90);
      if (i === 60 * 7) for (const p of wx.particles) seen[z % 4].add(p.sprite);
    }
    for (const p of wx.particles) {
      assert.ok(ok.has(p.sprite), p.sprite);
      for (const f of ['x', 'y', 'size', 'rot', 'alpha']) assert.ok(Number.isFinite(p[f]), f);
      assert.ok(p.layer === 'back' || p.layer === 'front'); assert.ok(typeof p.flipX === 'boolean');
      assert.ok(p.alpha >= 0 && p.alpha <= 1);
    }
  }
  assert.deepStrictEqual([...seen[0]].sort(), ['p_petal', 'p_sparkle']);
  assert.deepStrictEqual([...seen[1]].sort(), ['p_butterfly', 'p_firefly']);
  assert.deepStrictEqual([...seen[2]], ['p_leaf']);
  assert.deepStrictEqual([...seen[3]], ['p_snow']);
  assert.ok(peak > 40, 'peak ' + peak);
  wx.resize(960, 540); wx.update(0.1);
});

test('weather: winter snow has 3 depth layers (far small/slow/faint … near big/fast/front)', () => {
  const wx = new MFB.Weather({ width: 960, height: 540, seed: 1 });
  wx.setLevel(3, { instant: true });
  for (let i = 0; i < 120; i++) wx.update(1 / 60);
  const by = k => wx.particles.filter(p => p.kind === k);
  const far = by('snowFar'), mid = by('snowMid'), nr = by('snowNear');
  assert.ok(far.length && mid.length && nr.length);
  const avg = (a, f) => a.reduce((s, p) => s + f(p), 0) / a.length;
  assert.ok(avg(far, p => p.size) < avg(mid, p => p.size) && avg(mid, p => p.size) < avg(nr, p => p.size));
  assert.ok(avg(far, p => p.vy) < avg(mid, p => p.vy) && avg(mid, p => p.vy) < avg(nr, p => p.vy));
  assert.ok(nr.every(p => p.layer === 'front') && far.every(p => p.layer === 'back'));
});

test('weather: crossfade — old season fades out while the new one fades in', () => {
  const wx = new MFB.Weather({ width: 960, height: 540, seed: 2 });
  for (let i = 0; i < 60; i++) wx.update(1 / 60);
  wx.setLevel(2);
  for (let i = 0; i < 30; i++) wx.update(1 / 60);
  const kinds = new Set(wx.particles.map(p => p.sprite));
  assert.ok(kinds.has('p_petal') && kinds.has('p_leaf'), [...kinds].join());
  for (let i = 0; i < 180; i++) wx.update(1 / 60);
  assert.ok(wx.particles.every(p => p.sprite === 'p_leaf'));
});

// ---------- performance ----------
test('10 simulated minutes (world + bot) run in ≈ 2 s', () => {
  const t0 = Date.now();
  const w = mk('normal', 8); w.hearts = w.maxHearts = 1e6;
  const bot = new MFB.Bot(w, { skill: 0.9, seed: 2 });
  for (let i = 0; i < 600 * 60; i++) { bot.step(1 / 60); w.update(1 / 60); w.drainEvents(); }
  const ms = Date.now() - t0;
  assert.ok(ms < 2500, ms + ' ms');
  assert.ok(w.level >= 8, 'level ' + w.level);
});

// ---------- run ----------
let fail = 0;
for (const t of tests) {
  try { t.fn(); console.log('PASS ' + t.name); }
  catch (e) { fail++; console.log('FAIL ' + t.name + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n     ') : e)); }
}

if (process.argv.includes('--stats')) {
  console.log('\nbot report (900 s cap, season times in s):');
  for (const diff of ['easy', 'normal', 'hard']) for (const skill of [0.3, 0.5, 1]) {
    const lv = [], tm = [];
    for (let s = 1; s <= 5; s++) { const r = playBot(diff, s, skill, 900); lv.push(r.w.level); tm.push(...r.w.stats.seasonTimes); }
    const avg = tm.length ? (tm.reduce((a, b) => a + b, 0) / tm.length).toFixed(0) : '-';
    console.log(`  ${diff.padEnd(6)} skill ${skill}: seasons ${lv.join(',')}  avg season ${avg} s`);
  }
}
console.log(`\n${tests.length - fail}/${tests.length} passed`);
process.exit(fail ? 1 : 0);
