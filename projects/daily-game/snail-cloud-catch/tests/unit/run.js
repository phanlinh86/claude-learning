#!/usr/bin/env node
// Shelly's Sky Catch — headless unit tests for rng / world / weather / bot.
// Run from projects/daily-game/snail-cloud-catch:   node tests/unit/run.js [filter]
'use strict';
const assert = require('assert');
const { load } = require('./load');

const SC = load();
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const H = 1 / 120;
const J = v => JSON.parse(JSON.stringify(v));
const deq = (a, b, m) => assert.deepStrictEqual(J(a), J(b), (m ? m + ': ' : '') + JSON.stringify(a) + ' vs ' + JSON.stringify(b));
const near = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, (m || '') + ' got ' + a + ' want ' + b + ' ±' + tol);

// ---------- helpers ----------
function world(seed, cfg, level) {
  const w = new SC.World({ seed: seed || 1, config: Object.assign({ introDelay: 0 }, cfg) });
  if (level) w.startLevel(level);
  w.update(H * 2);
  assert.strictEqual(w.state, 'playing');
  w.drainEvents();
  return w;
}
function quiet(w) { w._nextDrop = 1e9; w.items.length = 0; }          // no drops
function run(w, seconds, dt, each) {
  dt = dt || 1 / 60;
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) { if (each && each(i) === false) return; w.update(dt); }
}
// a falling item at (x, y) with vy (defaults: just above the rim, falling)
function dropAt(w, kind, x, y, vy) {
  const it = w._newItem(kind || 'star', x);
  it.state = 'fall'; it.t = 0; it.alpha = 1;
  it._A = 0; it._bx = x; it.x = x;
  it.y = it._py = y === undefined ? w.snail.rimY - 0.5 : y;
  it.vy = vy === undefined ? 160 : vy;
  w.items.push(it);
  return it;
}
function hold(w, x) { const s = w.snail; s.x = s._px = s.rimX = s._prx = x; s.vx = s.vc = s.vw = 0; s.sway = s.swayV = 0; w.setMove(0); w.setTarget(x); }
function playGame(seed, diff, skill, maxS, stopLevel) {
  const w = new SC.World({ seed, config: SC.DIFFICULTY[diff || 'normal'] });
  const bot = new SC.Bot(w, { skill, seed: seed * 3 + 1 });
  let t = 0; maxS = maxS || 1200;
  while (w.state !== 'dead' && t < maxS && !(stopLevel !== undefined && w.level >= stopLevel)) {
    bot.step(1 / 60); w.update(1 / 60); w.drainEvents(); t += 1 / 60;
  }
  bot.step(1 / 60);
  return { w, t, bot };
}
const rimRest = () => SC.CONFIG.hoverY - SC.CONFIG.rimOff;

// ---------- RNG ----------
test('rng: deterministic, in range, same API as the sister games', () => {
  const a = new SC.RNG(42), b = new SC.RNG(42), c = new SC.RNG(43);
  const sa = [], sb = [], sc = [];
  for (let i = 0; i < 500; i++) { sa.push(a.next()); sb.push(b.next()); sc.push(c.next()); }
  deq(sa, sb); assert.notDeepStrictEqual(sa, sc);
  assert.ok(sa.every(v => v >= 0 && v < 1));
  for (const k of ['range', 'int', 'pick', 'chance', 'sign', 'gauss', 'fork']) assert.strictEqual(typeof a[k], 'function', k);
});

// ---------- contract ----------
test('world: initial state and every DESIGN §5.1 field / method', () => {
  const w = new SC.World({ seed: 5 });
  assert.strictEqual(w.state, 'ready');
  deq(SC.ZONES, ['sunny', 'rain', 'wind', 'snow']);
  for (const m of ['reset', 'startLevel', 'levelInfo', 'setMove', 'setTarget', 'setPlayRange', 'action', 'update', 'drainEvents', 'snapshot']) assert.strictEqual(typeof w[m], 'function', m);
  for (const k of ['level', 'zone', 'lap', 'time', 'levelTime', 'score', 'hearts', 'heartsMax', 'combo', 'mult', 'bestCombo',
    'jar', 'jarTarget', 'starsTotal', 'goldTotal', 'zaps', 'missed', 'puffsPopped', 'jet', 'wind', 'snail', 'items', 'cfg', '_acc']) assert.ok(k in w, k);
  deq([w.level, w.zone, w.lap, w.score, w.hearts, w.heartsMax, w.combo, w.mult, w.jar, w.jarTarget], [0, 0, 0, 0, 3, 3, 0, 1, 0, 20]);
  for (const k of ['charge', 'air', 'cooldown']) assert.ok(k in w.jet, 'jet.' + k);
  for (const k of ['x', 'target', 'warn', 'nextDir', 't']) assert.ok(k in w.wind, 'wind.' + k);
  for (const k of ['x', 'y', 'vx', 'vy', 'hop', 'tilt', 'face', 'frame', 'invuln', 'squash', 'sway', 'rimX', 'rimY', 'flame', '_px', '_py']) assert.ok(k in w.snail, 'snail.' + k);
  deq([w.snail.x, w.snail.y, w.snail.rimY, w.snail.hop, w.snail.face, w.snail.frame, w.jet.charge, w.jet.air], [480, 430, 384, 0, 1, 'idle', 1, false]);
  deq(w.drainEvents().map(e => e.type), ['start', 'zone']);
  assert.strictEqual(w.cfg.step, 1 / 120);
  const e = new SC.World({ config: SC.DIFFICULTY.easy }), hd = new SC.World({ config: SC.DIFFICULTY.hard });
  deq([e.hearts, e.jarTarget, e.cfg.jetRecharge, e.cfg.peekTime, hd.jarTarget], [5, 14, 2.0, 0.8, 22]);
  const w2 = world(3); run(w2, 6);
  assert.ok(w2.items.length > 0);
  for (const it of w2.items) {
    for (const k of ['id', 'kind', 'color', 'value', 'x', 'y', 'vx', 'vy', 'rot', 'spin', 'sway', 'r', 'state', 't', 'alpha', '_px', '_py']) assert.ok(k in it, 'item.' + k);
    assert.ok(['star', 'gold', 'puff'].includes(it.kind) && ['peek', 'fall', 'caught', 'ground', 'pop'].includes(it.state));
    assert.ok(it.color >= 0 && it.color <= 2);
  }
  const sn = w2.snapshot();
  for (const k of ['state', 'level', 'zone', 'score', 'hearts', 'jar', 'jarTarget', 'snail', 'jet', 'wind', 'time']) assert.ok(k in sn, 'snapshot.' + k);
});

test('world: ~1.4 s intro without drops, then go; each item peeks peekTime (0.6 s; Easy 0.8 s) before it drops', () => {
  for (const [diff, pt] of [['normal', 0.6], ['easy', 0.8]]) {
    const w = new SC.World({ seed: 3, config: SC.DIFFICULTY[diff] });
    w.drainEvents();
    run(w, 1.35);
    assert.strictEqual(w.state, 'ready'); assert.strictEqual(w.items.length, 0);
    run(w, 0.1);
    assert.strictEqual(w.state, 'playing');
    assert.ok(w.drainEvents().some(e => e.type === 'go'));
    const peekAt = {}; let drops = 0;
    run(w, 40, H, () => {
      for (const e of w.drainEvents()) {
        if (e.type === 'peek') { peekAt[e.id] = w.time; assert.ok(e.x >= 80 && e.x <= 880); }
        if (e.type === 'drop') { near(w.time - peekAt[e.id], pt, H * 1.5, 'peek time'); drops++; }
      }
    });
    assert.ok(drops >= 12, 'drops ' + drops);
  }
});

test('world: deterministic for any dt partition', () => {
  function script(dt) {
    const w = new SC.World({ seed: 77 });
    w.startLevel(2);                          // wind level: gusts, jets, everything
    const R = new SC.RNG(9), plan = [];
    for (let k = 0; k < 80; k++) plan.push({ mx: R.range(-1, 1), act: R.chance(0.3), tgt: R.chance(0.4) ? R.range(60, 900) : null });
    let k = -1;
    const total = Math.round(60 / dt);
    for (let i = 0; i < total; i++) {
      const seg = Math.floor(w.steps / 60);
      if (seg !== k && w.steps % 60 === 0) {
        k = seg; const p = plan[seg % plan.length];
        if (p.tgt !== null) { w.setMove(0); w.setTarget(p.tgt); } else { w.setTarget(null); w.setMove(p.mx); }
        if (p.act) w.action();
      }
      w.update(dt);
    }
    const s = w.snail;
    return { snap: w.snapshot(), s: [s.x, s.vx, s.y, s.sway, s.tilt], wind: [w.wind.x, w.wind.target], items: w.items.map(i => [i.id, i.x, i.y, i.state]), steps: w.steps };
  }
  const a = script(1 / 60), b = script(1 / 120), c = script(1 / 30), d = script(1 / 40);
  deq(a, b); deq(a, c); deq(a, d);
  assert.ok(a.steps === 7200);
});

// ---------- fall physics ----------
test('fall: drag + gravity → terminal speed (star ≈ 165, gold 1.5×, puff 0.6×), smooth monotonic speed-up, ~2.2–2.6 s to the rim', () => {
  const w = world(2, { groundY: 4000 }); quiet(w);
  const vT = {}, tRim = {};
  for (const kind of ['star', 'gold', 'puff']) {
    const it = w._newItem(kind, 480); it.state = 'fall'; it.t = 0; w.items.push(it);
    let last = 0, mono = true, t = 0;
    run(w, 5, H, () => {
      if (it.state !== 'fall') return false;
      if (it.vy < last - 1e-9) mono = false; last = it.vy; t += H;
      if (tRim[kind] === undefined && it.y >= rimRest()) tRim[kind] = t;
      hold(w, 70);
    });
    assert.ok(mono, kind + ' speeds up monotonically');
    vT[kind] = last;
    w.items.length = 0;
  }
  near(vT.star, 165, 4, 'star terminal'); near(vT.gold, 165 * 1.5, 8, 'gold terminal'); near(vT.puff, 165 * 0.6, 4, 'puff terminal');
  assert.ok(tRim.star >= 1.9 && tRim.star <= 2.6, 'star to rim ' + tRim.star);
  assert.ok(tRim.gold < tRim.star && tRim.puff > tRim.star + 0.7, 'gold faster, puff slower');
  // weather: rain stars ×1.15, snow ×0.85 with ×1.8 sway
  const r = new SC.World({ seed: 1 });
  r.startLevel(1); const vr = r._phys('star').vT; r.startLevel(3); const ps = r._phys('star'); r.startLevel(0); const p0 = r._phys('star');
  near(vr / p0.vT, 1.15, 1e-9); near(ps.vT / p0.vT, 0.85, 1e-9); near(ps.A / p0.A, 1.8, 1e-9);
});

test('fall: flutter sway around the centre line, spin + wobble; gold spins faster; predict() matches the sim (±2 px, ±0.02 s)', () => {
  const w = world(4); quiet(w); hold(w, 70);
  const it = w._newItem('star', 480); it.state = 'fall'; w.items.push(it);
  const pr = w.predict(it, rimRest());
  let crossT = null, crossX = null, t = 0, dmin = 0, dmax = 0, rot0 = it.rot;
  run(w, 4, H, () => {
    hold(w, 70);
    dmin = Math.min(dmin, it.x - it._bx); dmax = Math.max(dmax, it.x - it._bx);
    if (crossT === null && it.y >= rimRest()) { crossT = t; crossX = it.x; }
    t += H;
  });
  assert.ok(dmax > 8 && dmin < -8 && dmax <= 10.01 && dmin >= -10.01, 'sway ±10 ' + dmin + '..' + dmax);
  assert.ok(it.rot !== rot0);
  near(crossT, pr.t, 0.02, 'predicted time'); near(crossX, pr.x, 2, 'predicted x');
  const g = w._newItem('gold', 300), s = w._newItem('star', 300);
  assert.ok(Math.abs(g.spin) >= 2.4 && Math.abs(s.spin) <= 1.4);
  // in wind, too, and for a peeking item
  const v = world(5, {}, 2); quiet(v); hold(v, 70);
  v.wind.x = v.wind.target = 90; v._windFrom = 90; v._windEase = 1; v._windNext = 1e9;
  const pk = v._newItem('star', 300); v.items.push(pk);
  const pp = v.predict(pk, rimRest());
  t = 0; crossT = null;
  run(v, 4, H, () => { hold(v, 70); if (crossT === null && pk.state === 'fall' && pk.y >= rimRest()) { crossT = t; crossX = pk.x; } t += H; });
  near(crossT, pp.t, 0.03, 'wind: time'); near(crossX, pp.x, 6, 'wind: x (turbulence ±8 %)');
  assert.ok(crossX > 300 + 100, 'blown right ' + crossX);
});

test('items: a missed star bounces once softly then fades (miss); a puff that lands pops (puffland)', () => {
  const w = world(2); quiet(w); hold(w, 70);
  const st = dropAt(w, 'star', 700, 300, 150), pf = dropAt(w, 'puff', 300, 300, 80);
  let apex = 1e9, miss = 0, land = 0, gone = -1;
  run(w, 4, H, () => {
    hold(w, 70);
    if (st.state === 'ground' && !st._rest) apex = Math.min(apex, st.y);
    for (const e of w.drainEvents()) { if (e.type === 'miss') miss++; if (e.type === 'puffland') land++; }
    if (gone < 0 && !w.items.includes(st)) gone = w.time;
  });
  deq([miss, land, w.missed, w.puffsPopped], [1, 1, 1, 1]);
  const gy = w.cfg.groundY - st.r * 0.6;
  assert.ok(gy - apex > 2 && gy - apex < 20, 'soft bounce ' + (gy - apex));
  assert.ok(gone > 0 && !w.items.includes(pf));
});

// ---------- Shelly ----------
test('shelly: keys accelerate to 380 px/s, brake, clamp to 70..890; snow = icy grip (slides ≥ 2.5× further, still controllable)', () => {
  const w = world(1); quiet(w); w.setTarget(null); w.setMove(1);
  run(w, 0.08, H);
  assert.ok(w.snail.vx > 100 && w.snail.vx < 380, 'ramping ' + w.snail.vx);
  run(w, 0.3, H); near(w.snail.vx, 380, 1e-6);
  w.setMove(0); let x0 = w.snail.x; run(w, 0.6, H);
  assert.strictEqual(w.snail.vx, 0); const dry = w.snail.x - x0;
  assert.ok(dry < 35, 'drift ' + dry);
  w.setMove(1); run(w, 3, H); assert.strictEqual(w.snail.x, 890);
  w.setMove(-1); run(w, 4, H); assert.strictEqual(w.snail.x, 70);
  const s = world(1, {}, 3); quiet(s); s.snail.x = 100; s.setTarget(null); s.setMove(1);
  run(s, 0.08, H); const vSnow = s.snail.vx;
  run(s, 1, H); near(s.snail.vx, 380, 1e-6, 'same max speed on snow');
  s.setMove(0); x0 = s.snail.x; run(s, 1.5, H);
  const icy = s.snail.x - x0;
  assert.ok(vSnow < 100, 'slow start on ice ' + vSnow);
  assert.ok(icy > dry * 2.5 && icy < 120, 'slides ' + icy + ' vs ' + dry);
});

test('shelly: pointer-follow reaches the target, stops within 3 px, overshoot < 3 px (dry and icy)', () => {
  for (const lv of [0, 3]) {
    const w = world(1, {}, lv); quiet(w);
    for (const [from, to] of [[100, 860], [860, 120], [480, 520], [300, 310]]) {
      w.snail.x = from; w.snail.vc = w.snail.vx = 0; w.setMove(0); w.setTarget(to);
      let over = 0, vmax = 0; const dir = Math.sign(to - from);
      run(w, 3, H, () => { over = Math.max(over, (w.snail.x - to) * dir); vmax = Math.max(vmax, Math.abs(w.snail.vx)); });
      assert.ok(Math.abs(w.snail.x - to) <= 3, 'arrive ' + w.snail.x + ' → ' + to);
      assert.ok(over < 3, 'overshoot ' + over + ' level ' + lv);
      assert.ok(vmax <= 380 + 1e-9 && Math.abs(w.snail.vx) < 2);
    }
  }
});

test('shelly: tilt eases into motion (≤ 0.22 rad); face has a dead zone; basket sway lags, wobbles and settles (≤ 10 px)', () => {
  const w = world(1); quiet(w); w.snail.x = 100; w.setTarget(null); w.setMove(1);
  let minSway = 0;
  run(w, 0.03, H); const t1 = w.snail.tilt;
  run(w, 0.6, H, () => { minSway = Math.min(minSway, w.snail.sway); });
  assert.ok(t1 > 0 && t1 < 0.15, 'eased tilt ' + t1);
  assert.ok(w.snail.tilt > 0.2 && w.snail.tilt <= 0.22 + 1e-9, 'tilt ' + w.snail.tilt);
  assert.ok(minSway < -4, 'basket lags behind a hard start: ' + minSway);
  assert.strictEqual(w.snail.face, 1);
  w.setMove(0);
  let maxSway = 0, flips = 0, last = 0;
  run(w, 2.5, H, () => {
    const s = w.snail.sway; maxSway = Math.max(maxSway, s);
    if (Math.abs(s) > 0.3 && last !== 0 && Math.sign(s) !== Math.sign(last)) flips++;
    if (Math.abs(s) > 0.3) last = s;
    assert.ok(Math.abs(s) <= 10 + 1e-9);
    near(w.snail.rimX, w.snail.x + s, 1e-9);
  });
  assert.ok(maxSway > 3 && flips >= 1, 'swings forward on the stop and wobbles ' + maxSway + ' / ' + flips);
  assert.ok(Math.abs(w.snail.sway) < 0.2 && Math.abs(w.snail.tilt) < 0.01, 'settles');
  // dead zone: a slow creep left does not flip her
  w.snail.vc = -20; w.update(H); assert.strictEqual(w.snail.face, 1);
  w.setMove(-1); run(w, 0.2, H); assert.strictEqual(w.snail.face, -1);
});

// ---------- rules ----------
test('catch: inside the basket caught, outside missed, rising items never caught; caught stars sink into the basket', () => {
  const w = world(4); quiet(w); hold(w, 400);
  const c = w.cfg, lim = c.catchHalfW + 15 * c.catchRFrac;
  const a = dropAt(w, 'star', 400 + lim - 1), b = dropAt(w, 'star', 400 - lim + 1), o = dropAt(w, 'star', 400 + lim + 2);
  const up = dropAt(w, 'star', 400, w.snail.rimY + 4, -300);
  w.update(H);
  deq([a.state, b.state, o.state, up.state], ['caught', 'caught', 'fall', 'fall']);
  for (let i = 0; i < 20; i++) { hold(w, 400); w.update(H); }
  assert.strictEqual(up.state, 'fall', 'still rising, not caught');
  w.items.splice(w.items.indexOf(up), 1);             // (drag would bring it back down into the basket)
  const ev = w.drainEvents(), catches = ev.filter(e => e.type === 'catch');
  assert.strictEqual(catches.length, 2);
  deq([catches[0].points, catches[0].combo, catches[0].mult, catches[0].kind, catches[0].value], [10, 1, 1, 'star', 1]);
  for (const k of ['x', 'y', 'kind', 'value', 'points', 'combo', 'mult']) assert.ok(k in catches[0], 'catch.' + k);
  run(w, 3, H, () => hold(w, 400));
  assert.ok(w.drainEvents().some(e => e.type === 'miss' && e.combo === 2 && 'x' in e && 'y' in e));
  deq([w.combo, w.starsTotal, w.jar, w.missed], [0, 2, 2, 1], 'outside star landed → combo reset');
  assert.ok(!w.items.includes(a) && !w.items.includes(b), 'removed after sinking');
  assert.strictEqual(w.snail.frame === 'happy' || w.snail.frame === 'idle', true);
});

test('scoring: star 10×mult, gold 50×mult (value 5); streak [0,8,20] → ×1..×3 with multup; a miss resets', () => {
  const w = world(4, { jarTargets: [999, 999, 999, 999] }); quiet(w); hold(w, 480);
  const ups = [], pts = [];
  for (let k = 1; k <= 22; k++) {
    dropAt(w, k === 21 ? 'gold' : 'star', 480); w.update(H);
    for (const e of w.drainEvents()) { if (e.type === 'catch') pts.push(e.points); if (e.type === 'multup') ups.push([k, e.mult]); }
  }
  deq(ups, [[8, 2], [20, 3]]);
  deq([pts[6], pts[7], pts[18], pts[19], pts[20], pts[21]], [10, 20, 20, 30, 150, 30]);
  deq([w.goldTotal, w.starsTotal, w.bestCombo, w.mult], [1, 22, 22, 3]);
  dropAt(w, 'star', 800, w.cfg.groundY - 20, 160);
  run(w, 0.3, H, () => hold(w, 480));
  assert.ok(w.drainEvents().some(e => e.type === 'miss' && e.combo === 22));
  deq([w.combo, w.mult, w.bestCombo], [0, 1, 22]);
});

test('thunder puff: zap costs a heart + streak + 1.2 s invuln; puffs during invuln pop harmlessly; 0 hearts → dead', () => {
  const w = world(6); quiet(w); hold(w, 480);
  for (let k = 0; k < 9; k++) { dropAt(w, 'star', 480); w.update(H); }
  assert.strictEqual(w.mult, 2);
  dropAt(w, 'puff', 480); w.update(H);
  let ev = w.drainEvents();
  assert.ok(ev.some(e => e.type === 'zap' && e.hearts === 2 && 'x' in e));
  deq([w.hearts, w.combo, w.mult, w.zaps], [2, 0, 1, 1]);
  near(w.snail.invuln, 1.2, H * 1.5); assert.strictEqual(w.snail.frame, 'zap');
  dropAt(w, 'puff', 480); w.update(H);
  ev = w.drainEvents();
  assert.ok(!ev.some(e => e.type === 'zap') && ev.some(e => e.type === 'pop'), 'popped harmlessly');
  assert.strictEqual(w.hearts, 2);
  run(w, 1.3, H, () => hold(w, 480));
  dropAt(w, 'puff', 480); w.update(H); run(w, 1.3, H, () => hold(w, 480));
  dropAt(w, 'puff', 480); w.update(H);
  ev = w.drainEvents();
  assert.strictEqual(w.hearts, 0); assert.strictEqual(w.state, 'dead');
  assert.ok(ev.some(e => e.type === 'dead' && e.score === w.score));
  dropAt(w, 'star', 480); w.update(H); assert.strictEqual(w.starsTotal, 9, 'no catching when dead');
  assert.strictEqual(w.action(), false, 'no jet when dead');
});

test('jar full → jarfull, drops stop, puffs pop, 1 s grace for falling stars → cleared (+hearts×100) → next weather after ~2.2 s', () => {
  const w = world(8); quiet(w); hold(w, 480);
  w.hearts = 2;
  w.jar = w.jarTarget - 1;
  const pf = dropAt(w, 'puff', 200, 250, 50), late = dropAt(w, 'star', 480, 300, 165);
  const pk = w._newItem('star', 700); w.items.push(pk);
  dropAt(w, 'star', 480); w.update(H);
  let ev = w.drainEvents().map(e => e.type);
  for (const k of ['catch', 'jarfull']) assert.ok(ev.includes(k), k);
  assert.ok(!ev.includes('cleared'), 'grace first');
  assert.strictEqual(pf.state, 'pop'); assert.ok(!w.items.includes(pk), 'peek removed');
  run(w, 0.95, H, () => hold(w, 480));
  assert.strictEqual(late.state === 'caught' || !w.items.includes(late), true, 'late star caught during the grace');
  assert.strictEqual(w.state, 'playing');
  run(w, 0.1, H, () => hold(w, 480));
  ev = w.drainEvents();
  const cl = ev.find(e => e.type === 'cleared');
  deq([cl.bonus, cl.level, w.state], [200, 0, 'cleared']);
  assert.ok(ev.some(e => e.type === 'heal' && e.hearts === 3), 'heal +1 on the first loop');
  assert.ok(w.score >= 20 + 200);
  const combo = w.combo, score = w.score;
  let zoneEv = null;
  run(w, 2.1, H, () => { for (const e of w.drainEvents()) if (e.type === 'zone') zoneEv = e; });
  assert.strictEqual(zoneEv, null, 'still celebrating at 2.1 s');
  run(w, 0.2, H, () => { for (const e of w.drainEvents()) if (e.type === 'zone') zoneEv = e; });
  deq(zoneEv, { type: 'zone', zone: 1, level: 1, lap: 0 });
  deq([w.level, w.zone, w.jar, w.jarTarget, w.combo, w.score, w.items.length], [1, 1, 0, 22, combo, score, 0]);
});

test('levels: zone = i % 4, jar 20/22/26/30 (easy 14/17/20/23, hard 22/26/30/34), loop ramp (+12 % fall, +0.12 puff; easy +0.06) capped', () => {
  const w = new SC.World({ seed: 1 });
  deq([0, 1, 2, 3].map(i => w.levelInfo(i).jarTarget), [20, 22, 26, 30]);
  deq([0, 1, 2, 3].map(i => w.levelInfo(i).zoneName), SC.ZONES);
  const e = new SC.World({ config: SC.DIFFICULTY.easy }), h = new SC.World({ config: SC.DIFFICULTY.hard });
  deq([0, 1, 2, 3].map(i => e.levelInfo(i).jarTarget), [14, 17, 20, 23]);
  deq([0, 1, 2, 3].map(i => h.levelInfo(i).jarTarget), [22, 26, 30, 34]);
  const a = w.levelInfo(0), b = w.levelInfo(4), z = w.levelInfo(80);
  deq([b.zone, b.lap, a.puffDelay, b.puffDelay], [0, 1, 20, 0]);
  near(b.fall / a.fall, 1.12, 1e-9);
  near(b.puffChance - a.puffChance, 0.12, 1e-9);
  near(e.levelInfo(4).puffChance - e.levelInfo(0).puffChance, 0.06, 1e-9);
  deq([w.cfg.puffCap, e.cfg.puffCap, h.cfg.puffCap, w.cfg.puffAim, h.cfg.puffAim], [0.48, 0.30, 0.52, 0.4, 0.6]);
  deq([z.puffChance, e.levelInfo(80).puffChance, h.levelInfo(80).puffChance], [0.48, 0.30, 0.52]);
  assert.ok(b.puffChance > a.puffChance && b.dropGap < a.dropGap);
  assert.ok(z.fall <= w.cfg.fallCap && z.puffChance <= w.cfg.puffCap && z.dropGap >= w.cfg.gapMin);
  assert.ok(e.levelInfo(0).fall < a.fall && h.levelInfo(0).fall > a.fall);
  w.startLevel(5); deq([w.level, w.zone, w.lap], [5, 1, 1]);
  deq([a.windMax, w.levelInfo(1).windMax > 0, w.levelInfo(2).windMax > 0], [0, false, true]);
});

// ---------- Jet Hop ----------
test('jet hop: impulse + gravity arc (apex ≈ 100 px, air ≈ 0.7 s), ×1.35 side speed, soft landing squash, recharge from landing', () => {
  const w = world(1); quiet(w); hold(w, 300);
  assert.strictEqual(w.action(), true);
  assert.strictEqual(w.action(), false, 'not while airborne');
  let apex = 0, t = 0, landed = -1, vmax = 0, flame = 0, frames = new Set();
  const ev0 = w.drainEvents(); assert.ok(ev0.some(e => e.type === 'jet' && e.x === 300));
  w.setTarget(null); w.setMove(1);
  run(w, 1, H, () => {
    apex = Math.max(apex, w.snail.hop); vmax = Math.max(vmax, w.snail.vx); flame = Math.max(flame, w.snail.flame); frames.add(w.snail.frame);
    near(w.snail.rimY, w.snail.y - 46, 1e-9);
    for (const e of w.drainEvents()) if (e.type === 'jetland') { landed = t; assert.ok(w.snail.squash > 0.6, 'landing squash'); }
    t += H;
  });
  near(apex, 100, 3, 'apex'); near(landed, 0.7, 0.03, 'air time');
  assert.ok(vmax > 380 * 1.3 && vmax <= 380 * 1.35 + 1e-9, 'airborne speed ' + vmax);
  assert.ok(flame > 0.9 && frames.has('jet'));
  near(w.snail.vx, 380, 1e-6, 'back to ground max after landing');
  // recharge 2.5 s from landing (jetcharged), cooldown counts down
  assert.ok(w.jet.charge < 1 && w.jet.cooldown > 0);
  let charged = -1;
  run(w, 2.5, H, () => { for (const e of w.drainEvents()) if (e.type === 'jetcharged') charged = t; t += H; });
  near(charged - landed, 2.5, 0.03, 'recharge');
  deq([w.jet.charge, w.jet.cooldown], [1, 0]);
  const e = world(1, SC.DIFFICULTY.easy); quiet(e); e.action(); run(e, 3, H);
  assert.ok(e.drainEvents().some(x => x.type === 'jetcharged'));
  near(e.jet.charge, 1, 0); assert.strictEqual(e.cfg.jetRecharge, 2.0);
});

test('jet hop: the rim rises with Shelly, so a hop catches a star earlier (higher) than waiting', () => {
  const w = world(3); quiet(w); hold(w, 480);
  const st = dropAt(w, 'star', 480, 240, 165);
  w.action();
  let catchY = null;
  run(w, 1, H, () => { hold(w, 480); for (const e of w.drainEvents()) if (e.type === 'catch') catchY = e.y; });
  assert.ok(catchY !== null && catchY < 384 - 40, 'caught high ' + catchY);
  assert.strictEqual(st.state === 'caught' || !w.items.includes(st), true);
});

// ---------- wind ----------
test('wind: telegraph (gustwarn, ≈1.2 s) before every gust; first after 4 s; every 5–8 s; eased; stars drift, gold less; Shelly nudged ≤ 15 %', () => {
  const w = world(10, {}, 2); quiet(w);
  w._nextDrop = 1e9;
  let warnAt = null, gusts = [], firstWarn = null, maxJump = 0, last = w.wind.x;
  run(w, 60, H, () => {
    quiet(w);
    maxJump = Math.max(maxJump, Math.abs(w.wind.x - last)); last = w.wind.x;
    for (const e of w.drainEvents()) {
      if (e.type === 'gustwarn') { assert.strictEqual(warnAt, null); warnAt = w.levelTime; if (firstWarn === null) firstWarn = w.levelTime; assert.ok(e.dir === 1 || e.dir === -1); assert.strictEqual(w.wind.nextDir, e.dir); }
      if (e.type === 'gust') { assert.ok(warnAt !== null, 'gust without telegraph'); near(w.levelTime - warnAt, 1.2, 0.02, 'telegraph'); gusts.push({ t: w.levelTime, dir: e.dir, s: e.strength }); warnAt = null; assert.ok(Math.sign(w.wind.target) === e.dir); }
    }
    if (warnAt !== null) assert.ok(w.wind.warn > 0);
  });
  assert.ok(firstWarn >= 4 - 0.02 && firstWarn < 4.2, 'first warn ' + firstWarn);
  assert.ok(gusts.length >= 7, 'gusts ' + gusts.length);
  for (let i = 1; i < gusts.length; i++) { const d = gusts[i].t - gusts[i - 1].t; assert.ok(d >= 5 - 0.02 && d <= 8 + 0.02, 'gap ' + d); }
  assert.ok(gusts.some(g => g.s > 60) && new Set(gusts.map(g => g.dir)).size === 2);
  assert.ok(maxJump < 6, 'eased (max change per step ' + maxJump + ')');
  // drift: hold a strong wind, compare star vs gold
  const v = world(11, {}, 2); quiet(v); hold(v, 480);
  v.wind.x = v.wind.target = 100; v._windFrom = 100; v._windEase = 1; v._windNext = 1e9;
  const s = dropAt(v, 'star', 300, 120, 0), g = dropAt(v, 'gold', 300, 120, 0);
  run(v, 1.2, H, () => { v._windNext = 1e9; v.setTarget(70); });
  assert.ok(s.x - 300 > 40 && g.x - 300 > 15 && g.x - 300 < (s.x - 300) * 0.7, 'drift star ' + (s.x - 300) + ' gold ' + (g.x - 300));
  // Shelly nudged a little when not steering, within 15 % of her max speed
  v.setTarget(null); v.setMove(0); v.snail.x = 480; run(v, 2, H, () => { v._windNext = 1e9; });
  assert.ok(v.snail.vx > 20 && v.snail.vx <= 0.15 * 380 + 1e-9, 'nudge ' + v.snail.vx);
  // calm weather has no wind
  const sun = world(1); run(sun, 20, 1 / 60); assert.strictEqual(sun.wind.x, 0);
  assert.ok(!sun.drainEvents().some(e => e.type === 'gust' || e.type === 'gustwarn'));
});

test('wind: stars bounce softly off the play-range sides (they stay where Shelly can reach)', () => {
  const w = world(12, {}, 2); quiet(w); hold(w, 480);
  w.wind.x = w.wind.target = 140; w._windFrom = 140; w._windEase = 1;
  const items = [];
  for (let k = 0; k < 6; k++) items.push(dropAt(w, 'star', 700 + k * 30, 110, 0));
  run(w, 3, H, () => { w._windNext = 1e9; w.setTarget(70); for (const it of items) if (it.state === 'fall') assert.ok(it.x <= 890 + 10.01, 'x ' + it.x); });
});

// ---------- fairness / drops ----------
test('fairness: no puffs in the first 20 s of sunny; star chains reachable at fairSpeed (calm < 1 %, wind < 6 %); puffs keep clear of stars; ≥ 1 gold per level', () => {
  let stars = 0, starsWind = 0, unfairWind = 0, unfair = 0, early = 0, conflicts = 0, noGold = 0, puffs = 0;
  for (let seed = 1; seed <= 10; seed++) {
    for (const lv of [0, 1, 2, 3]) {
      const w = world(seed, {}, lv); hold(w, 480);
      const placed = [];
      run(w, 120, 1 / 60, () => {
        hold(w, w.snail.x);
        // collect every star into the jar instantly (no catching needed for this test)
        for (const e of w.drainEvents()) if (e.type === 'peek') {
          const it = w.items.find(i => i.id === e.id);
          placed.push({ kind: it.kind, x: it.tx, t: it.tCross, born: w.levelTime });
          if (it.kind === 'puff' && lv === 0 && w.levelTime < 20) early++;
          if (it.kind !== 'puff') { w.jar = Math.min(w.jarTarget - 1, w.jar + 1); }
        }
        if (w.state !== 'playing') return false;
      });
      const cs = placed.filter(p => p.kind !== 'puff').sort((a, b) => a.t - b.t), ps = placed.filter(p => p.kind === 'puff');
      if (lv === 2) starsWind += cs.length; else stars += cs.length;
      puffs += ps.length;
      if (!cs.some(p => p.kind === 'gold')) noGold++;
      for (let i = 1; i < cs.length; i++) if (Math.abs(cs[i].x - cs[i - 1].x) > w.cfg.fairSlack + w.cfg.fairSpeed * (cs[i].t - cs[i - 1].t) + 1e-6) { if (lv === 2) unfairWind++; else unfair++; }
      for (const r of ps) for (const c of cs) if (Math.abs(r.t - c.t) < w.cfg.puffKeepDt && Math.abs(r.x - c.x) < w.cfg.puffKeepDx - 1e-6) conflicts++;
    }
  }
  assert.strictEqual(early, 0);
  assert.strictEqual(noGold, 0, 'levels without gold');
  assert.ok(puffs > 40, 'puffs ' + puffs);
  assert.ok(unfair / stars < 0.01, 'unfair star pairs ' + unfair + '/' + stars);
  // in wind a later gust can blow an earlier star off its promised spot (that is what Jet Hop is for)
  assert.ok(unfairWind / starsWind < 0.06, 'wind: unfair star pairs ' + unfairWind + '/' + starsWind);
  assert.ok(conflicts <= 2, 'puff-star conflicts ' + conflicts);
});

test('setPlayRange: drops only where Shelly can reach; peeking items re-aimed; Shelly clamped', () => {
  const w = world(13); hold(w, 480);
  run(w, 3);
  const pk = w._newItem('star', 860); w.items.push(pk);
  w.snail.x = 880;
  w.setPlayRange(250, 710);
  deq([w.cfg.xMin, w.cfg.xMax, w.snail.x], [250, 710, 710]);
  assert.ok(pk.x <= 700 + 1e-9, 'peek re-aimed ' + pk.x);
  for (const it of w.items) if (it.state === 'fall') assert.ok(it._bx >= 250 && it._bx <= 710);
  let n = 0;
  run(w, 60, 1 / 60, () => {
    for (const e of w.drainEvents()) if (e.type === 'peek') { n++; assert.ok(e.x >= 260 - 1e-9 && e.x <= 700 + 1e-9, 'peek x ' + e.x); }
    for (const it of w.items) if (it.state === 'fall') assert.ok(it.x >= 250 - 16 && it.x <= 710 + 16);
    if (w.state !== 'playing') return false;
  });
  assert.ok(n >= 20);
  w.setPlayRange(70, 890); deq([w.cfg.xMin, w.cfg.xMax], [70, 890]);
  w.setPlayRange(400, 420); assert.ok(w.cfg.xMin <= 360 && w.cfg.xMax >= 600, 'minimum width kept');
});

// ---------- bot ----------
test('bot: skill 1 clears the first loop (sunny → snow) on Normal; plays only through the input API', () => {
  let ok = 0, hearts = 0; const N = 10;
  for (let s = 1; s <= N; s++) { const r = playGame(s, 'normal', 1, 600, 4); if (r.w.level >= 4) ok++; hearts += r.w.hearts; }
  assert.ok(ok >= N - 1, 'skill 1 cleared the loop ' + ok + '/' + N);
  const r = playGame(3, 'normal', 1, 200);
  for (const k of ['decisions', 'catches', 'gold', 'misses', 'zaps', 'jets', 'jetCatches', 'levels', 'deaths', 'maxLevel']) assert.ok(k in r.bot.stats, k);
  assert.ok(r.bot.stats.catches > 60 && r.bot.stats.catches / (r.bot.stats.catches + r.bot.stats.misses) > 0.9);
  assert.ok(r.bot.stats.jets > 0 && r.bot.stats.jetCatches > 0, 'uses Jet Hop');
  console.log('      skill 1 Normal loop cleared ' + ok + '/' + N + ', avg hearts ' + (hearts / N).toFixed(1) + '; 200 s: ' + JSON.stringify(r.bot.stats));
});

test('bot: skill 0.5 on Easy clears sunny; a still Shelly misses most stars and eventually loses', () => {
  let ok = 0; const N = 10;
  for (let s = 1; s <= N; s++) if (playGame(s + 50, 'easy', 0.5, 200, 1).w.level >= 1) ok++;
  assert.ok(ok >= N - 1, 'skill 0.5 easy sunny ' + ok + '/' + N);
  const w = new SC.World({ seed: 21 }); let t = 0;
  while (w.state !== 'dead' && t < 3600) { w.setTarget(480); w.update(1 / 30); t += 1 / 30; }
  assert.ok(w.missed > w.starsTotal, 'standing still misses most stars');
  assert.strictEqual(w.state, 'dead', 'standing still must not survive forever (' + t.toFixed(0) + ' s, level ' + w.level + ')');
});

// ---------- interpolation ----------
test('interpolation: _px/_py saved at the start of each sub-step for snail and items', () => {
  const w = world(9); hold(w, 480); run(w, 4);
  w.setTarget(800); w.action();
  const x0 = w.snail.x, y0 = w.snail.y, ys = w.items.map(i => [i, i.y]);
  w.update(H);
  assert.strictEqual(w.snail._px, x0); assert.strictEqual(w.snail._py, y0);
  for (const [i, y] of ys) if (w.items.includes(i)) assert.strictEqual(i._py, y);
  assert.ok(w._acc >= 0 && w._acc < w.cfg.step);
});

// ---------- weather ----------
const ENV = (k) => ({ wind: { x: 90 * Math.sin(k / 200), level: Math.abs(Math.sin(k / 200)), warn: (k % 400) < 70 ? 1 : 0, nextDir: 1 },
  snail: { x: 480, y: 400, vx: 100, vy: -200, face: 1, flame: (k % 90) < 30 ? 1 : 0 } });

test('weather: every zone has its ambient life with §4.3 sprite names; bounded < 180 even with fx spam', () => {
  const need = [['mote', 'sparkle'], ['rain', 'splash'], ['streak', 'petal'], ['snowflake']];
  const ok = new Set(SC.Weather.SPRITES);
  for (let z = 0; z < 4; z++) {
    const wx = new SC.Weather({ seed: z + 1 });
    wx.setZone(z, { instant: true });
    let maxN = 0; const seen = new Set();
    for (let k = 0; k < 900; k++) {
      if (k % 20 === 0) { wx.burst('confetti', 480, 300, 20); wx.burst('sparkle', 300, 380, 12); wx.burst('zap', 400, 380, 8); }
      wx.update(1 / 60, ENV(k)); maxN = Math.max(maxN, wx.particles.length);
      for (const p of wx.particles) seen.add(p.sprite);
    }
    assert.ok(maxN < 180, 'zone ' + z + ' max ' + maxN);
    for (const s of need[z].concat(['puff', 'confetti'])) assert.ok(seen.has(s), 'zone ' + z + ' has ' + s);
    for (const p of wx.particles) {
      for (const k of ['sprite', 'x', 'y', 'size', 'rot', 'flipX', 'alpha', 'layer']) assert.ok(k in p && (typeof p[k] === 'string' || isFinite(p[k])), k);
      assert.ok(ok.has(p.sprite), 'sprite ' + p.sprite);
      assert.ok(p.layer === 'back' || p.layer === 'front');
      assert.ok(p.alpha >= 0 && p.alpha <= 1);
      if (p.sprite === 'confetti') assert.ok(typeof p.color === 'string');
    }
    assert.ok(typeof wx.ambient.fog === 'number');
  }
  // handover between the two busiest zones + fx still bounded
  const wx = new SC.Weather({ seed: 9 }); wx.setZone(3, { instant: true }); wx.update(1); wx.setZone(1);
  let m = 0; for (let k = 0; k < 120; k++) { wx.burst('confetti', 480, 300, 24); wx.update(1 / 60, ENV(k)); m = Math.max(m, wx.particles.length); }
  assert.ok(m < 180, 'handover max ' + m);
});

test('weather: rain in 2 depth layers with a slant + floor splashes; snow in 3 depth layers with pendulum drift', () => {
  const r = new SC.Weather({ seed: 2 }); r.setZone(1, { instant: true });
  const drops = r.particles.filter(p => p.kind === 'rain');
  const back = drops.filter(p => p.layer === 'back'), front = drops.filter(p => p.layer === 'front');
  assert.ok(back.length >= 20 && front.length >= 10);
  assert.ok(Math.max(...back.map(p => p.size)) < Math.min(...front.map(p => p.size)), 'front drops bigger');
  r.update(0.5);
  assert.ok(r.particles.filter(p => p.kind === 'rain').every(p => p.rot < 0), 'slanted');
  const sp = r.particles.filter(p => p.sprite === 'splash');
  assert.ok(sp.length > 0 && sp.every(p => p.y >= 480 && p.y <= 496), 'splashes on the floor');
  const s = new SC.Weather({ seed: 3 }); s.setZone(3, { instant: true });
  const depths = new Set(s.particles.filter(p => p.kind === 'flake').map(p => p.depth));
  assert.strictEqual(depths.size, 3);
  const near1 = s.particles.find(p => p.kind === 'flake' && p.depth === 1 && p.y < 300), far = s.particles.find(p => p.kind === 'flake' && p.depth === 0.3 && p.y < 300);
  const xs = [], y0n = near1.y, y0f = far.y;
  for (let k = 0; k < 300; k++) { s.update(1 / 60); xs.push(near1.x - near1.x0); }
  assert.ok(Math.max(...xs) > 4 && Math.min(...xs) < -4, 'pendulum drift');
  assert.ok(near1.y - y0n > (far.y - y0f) * 1.8, 'near flakes fall faster');
});

test('weather: wind streaks + petals follow wind.x (more when strong, preview during the telegraph); sunny motes wander', () => {
  const wx = new SC.Weather({ seed: 4 }); wx.setZone(2, { instant: true });
  const envR = { wind: { x: 110, level: 1, warn: 0 } };
  wx.update(2, envR);
  const st = wx.particles.filter(p => p.kind === 'streak'), x0 = st.map(p => p.x);
  const pet = wx.particles.filter(p => p.kind === 'petal'), px0 = pet.map(p => p.x0);
  wx.update(1 / 60, envR);
  assert.ok(st.every((p, i) => p.x > x0[i] || p.age < 0.05) && st.every(p => p.flipX === 1), 'streaks blow right');
  const strongA = st.reduce((a, p) => a + p.alpha, 0);
  wx.update(0.5, envR);
  assert.ok(pet.filter((p, i) => wx.particles.includes(p) && p.x0 > px0[i]).length >= pet.length * 0.6, 'petals carried right');
  const calm = new SC.Weather({ seed: 4 }); calm.setZone(2, { instant: true });
  calm.update(2, { wind: { x: 0, level: 0, warn: 0 } });
  const calmA = calm.particles.filter(p => p.kind === 'streak').reduce((a, p) => a + p.alpha, 0);
  assert.ok(strongA > calmA * 2.5, 'streaks show the wind strength ' + strongA.toFixed(2) + ' vs ' + calmA.toFixed(2));
  calm.update(0.3, { wind: { x: 0, level: 0, warn: 1, nextDir: -1 } });
  assert.strictEqual(calm.windDir, -1, 'telegraph previews the new direction');
  const sun = new SC.Weather({ seed: 5 }); sun.setZone(0, { instant: true });
  const m = sun.particles.find(p => p.kind === 'mote'), mx = m.x, my = m.y;
  sun.update(2);
  assert.ok(Math.hypot(m.x - mx, m.y - my) > 2, 'motes wander');
  assert.ok(sun.particles.filter(p => p.layer === 'front').length <= 3, 'sunny is calm');
});

test('weather: jet puffs from the nozzle (auto from snail.flame, or jet()) drift down/back, grow and fade; bursts', () => {
  const wx = new SC.Weather({ seed: 6, autoJet: true });
  wx.update(0.2, { snail: { x: 400, y: 380, vx: 200, vy: -300, face: 1, flame: 1 } });
  const jp = wx.particles.filter(p => p.zone === -1 && p.sprite === 'puff');
  assert.ok(jp.length >= 3, 'auto jet puffs ' + jp.length);
  const p = jp[jp.length - 1], s0 = p.size, y0 = p.y, x0 = p.x;
  assert.ok(Math.abs(x0 - 370) < 30, 'from the nozzle (x − 30) ' + x0);
  wx.update(0.25, {});
  assert.ok(p.size > s0 && p.y > y0, 'grows and drifts down');
  wx.update(1, {});
  assert.ok(!wx.particles.includes(p), 'faded out');
  const b = new SC.Weather({ seed: 7, autoJet: false });
  b.update(0.2, { snail: { x: 400, y: 380, vx: 0, vy: 0, face: 1, flame: 1 } });
  assert.strictEqual(b.particles.filter(q => q.zone === -1).length, 0, 'autoJet:false');
  b.jet(400, 400, 1, { face: -1 });
  assert.ok(b.particles.filter(q => q.sprite === 'puff' && q.vx > 0).length >= 2, 'facing left → exhaust to the right');
  for (const k of ['sparkle', 'twinkle', 'zap', 'puff', 'splash', 'confetti']) {
    const n0 = b.particles.length; b.burst(k, 300, 300, 6); assert.ok(b.particles.length > n0, 'burst ' + k);
  }
});

test('weather: smooth zone hand-over, setSeason alias, deterministic for any dt partition', () => {
  const wx = new SC.Weather({ seed: 2 });
  wx.update(1);
  wx.setSeason(3);
  wx.update(0.5);
  const mix = new Set(wx.particles.filter(p => p.zone >= 0).map(p => p.zone));
  assert.ok(mix.has(0) && mix.has(3), 'both during hand-over');
  wx.update(4);
  assert.ok(wx.particles.every(p => p.zone === 3 || p.zone === -1), 'old zone gone');
  assert.strictEqual(wx.zone, 3); assert.strictEqual(wx.season, 3);
  const sim = (k) => {
    const a = new SC.Weather({ seed: 5 }); let step = 0;
    const env = { wind: { x: 80, level: 0.7, warn: 0 }, snail: { x: 300, y: 390, vx: 50, vy: -100, face: 1, flame: 0.6 } };
    while (step < 900) {
      if (step === 300) a.setZone(1); if (step === 600) a.setZone(2);
      a.update(k / 60, env); step += k;
    }
    return a.particles;
  };
  deq(sim(1), sim(3)); deq(sim(1), sim(5));
});

// ---------- performance ----------
test('performance: 10 minutes of game time (world + bot + weather) in ~2 s, bounded, no NaN', () => {
  const t0 = process.hrtime.bigint();
  const w = new SC.World({ seed: 31 });
  const bot = new SC.Bot(w, { skill: 0.8, seed: 31 });
  const wx = new SC.Weather({ seed: 31 });
  let maxP = 0, maxI = 0, games = 1;
  for (let i = 0; i < 60 * 600; i++) {
    bot.step(1 / 60); w.update(1 / 60);
    for (const e of w.drainEvents()) {
      if (e.type === 'zone') wx.setZone(e.zone);
      else if (e.type === 'catch') wx.burst('sparkle', e.x, e.y, 8);
      else if (e.type === 'zap') wx.burst('zap', e.x, e.y, 8);
      else if (e.type === 'cleared') wx.burst('confetti', 480, 300, 24);
    }
    wx.update(1 / 60, { wind: w.wind, snail: w.snail, world: w });
    maxP = Math.max(maxP, wx.particles.length); maxI = Math.max(maxI, w.items.length);
    const s = w.snail;
    for (const v of [s.x, s.vx, s.y, s.tilt, s.sway, s.rimX, s.rimY, s.flame, w.score, w.wind.x, w.jet.charge]) assert.ok(isFinite(v), 'NaN');
    if (i % 60 === 0) for (const it of w.items) assert.ok(isFinite(it.x + it.y + it.vx + it.vy + it.alpha + it.rot), 'item NaN');
    if (w.state === 'dead') { w.reset(); games++; }
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(maxP < 180 && maxI <= 12, 'bounded p' + maxP + ' items' + maxI);
  assert.ok(ms < 5000, 'took ' + ms.toFixed(0) + ' ms');
  console.log('      10 min sim in ' + ms.toFixed(0) + ' ms; games ' + games + ', level ' + w.level + ', max particles ' + maxP + ', items ' + maxI);
});

// ---------- runner ----------
let pass = 0, fail = 0;
const only = process.argv[2];
for (const t of tests) {
  if (only && !t.name.includes(only)) continue;
  try { t.fn(); pass++; console.log('  PASS ' + t.name); }
  catch (e) { fail++; console.log('  FAIL ' + t.name + '\n       ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n       ') : e)); }
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
