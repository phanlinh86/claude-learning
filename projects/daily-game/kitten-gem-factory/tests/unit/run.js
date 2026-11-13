#!/usr/bin/env node
// Comet's Gem Factory — unit tests for rng.js, world.js, weather.js, bot.js (no DOM).
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
  return ctx.CGF;
}
const CGF = load();
const C = CGF.CONFIG;

/* ---------------- tiny harness ---------------- */
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('PASS ' + name); }
  catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n     ') : e)); }
}
function ok(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) { if (a !== b) throw new Error((msg || 'expected equal') + ': got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b)); }
function near(a, b, tol, msg) { if (!(Math.abs(a - b) <= tol)) throw new Error((msg || 'expected near') + ': got ' + a + ', want ' + b + ' ±' + tol); }

/* ---------------- helpers ---------------- */
const DT = 1 / 60;
function world(o) { return new CGF.World(Object.assign({ seed: 42, difficulty: 'easy' }, o || {})); }
function run(w, secs, dt, onStep) { dt = dt || DT; const n = Math.round(secs / dt); for (let i = 0; i < n; i++) { w.update(dt); if (onStep) onStep(w); } }
function runUntil(w, pred, maxT, dt) { dt = dt || DT; let t = 0; while (!pred(w)) { w.update(dt); t += dt; if (t > maxT) throw new Error('timeout waiting'); } return t; }
function toPlaying(w) { runUntil(w, x => x.phase === 'playing', 30); run(w, 0.3); w.drainEvents(); }   // + let the peek cards flip down
function byKind(w) { const m = {}; w.cards.forEach((k, i) => { if (k.state === 'down') (m[k.kind] = m[k.kind] || []).push(i); }); return m; }
function pairIdx(w, n) { const m = byKind(w); return Object.keys(m).sort().filter(k => m[k].length === 2).map(k => m[k]).slice(0, n || 99); }
function wrongPair(w, avoidSeen) {
  const d = w.cards.map((k, i) => i).filter(i => w.cards[i].state === 'down' && (!avoidSeen || !w.cards[i].seen));
  for (const a of d) for (const b of d) if (a !== b && w.cards[a].kind !== w.cards[b].kind) return [a, b];
  throw new Error('no wrong pair');
}
function tapPair(w, a, b) { ok(w.tap(a), 'tap a'); ok(w.tap(b), 'tap b'); run(w, C.flipTime + 0.05); }
function clearLevel(w) { for (const [a, b] of pairIdx(w)) tapPair(w, a, b); }

/* ================================ RNG ================================ */
test('rng: deterministic, ranges, shuffle is a permutation', () => {
  const a = CGF.RNG(7), b = new CGF.RNG(7);
  for (let i = 0; i < 100; i++) eq(a.next(), b.next());
  const r = CGF.RNG(3);
  for (let i = 0; i < 2000; i++) {
    const x = r.next(); ok(x >= 0 && x < 1);
    const n = r.int(2, 5); ok(n >= 2 && n <= 5 && n === Math.floor(n));
    const f = r.range(-3, 4); ok(f >= -3 && f < 4);
  }
  const arr = [1, 2, 3, 4, 5, 6, 7, 8], s = r.shuffle(arr);
  ok(s === arr, 'in place'); eq(arr.slice().sort().join(), '1,2,3,4,5,6,7,8');
  ok(['a', 'b'].indexOf(r.pick(['a', 'b'])) >= 0);
  eq(typeof r.chance(0.5), 'boolean');
});

/* ================================ World ================================ */
test('determinism: same seed → same deck and same event stream', () => {
  function play(seed) {
    const w = world({ seed, difficulty: 'normal' }), bot = new CGF.Bot(w, { skill: 0.7, seed: 5 });
    const deck = w.cards.map(k => k.kind).join();
    const ev = [];
    for (let i = 0; i < 60 * 90; i++) { bot.step(DT); w.update(DT); ev.push(...w.drainEvents()); }
    return { deck, ev: JSON.stringify(ev), score: w.score, cx: w.comet.x };
  }
  const a = play(11), b = play(11), c = play(12);
  eq(a.deck, b.deck, 'deck'); ok(a.ev === b.ev, 'event streams differ'); eq(a.score, b.score); eq(a.cx, b.cx);
  ok(a.ev.length > 1000, 'events happened');
  ok(a.deck !== c.deck, 'different seed → different deck');
});

test('deck: exactly 2 of each kind, pairs = cols*rows/2, custom gem', () => {
  for (let lv = 0; lv < 8; lv++) {
    const w = world({ seed: 100 + lv, level: lv, customGem: lv % 2 === 1 });
    const L = CGF.LEVELS[lv % 4];
    eq(w.cards.length, L.cols * L.rows); eq(w.pairs, L.cols * L.rows / 2); eq(w.pairsLeft, w.pairs);
    const n = {}; w.cards.forEach(k => n[k.kind] = (n[k.kind] || 0) + 1);
    eq(Object.keys(n).length, w.pairs, 'distinct kinds');
    Object.keys(n).forEach(k => { eq(n[k], 2, k); ok(k === 'custom' || CGF.GEMS.indexOf(k) >= 0, k); });
    eq(!!n.custom, lv % 2 === 1, 'custom pair');
    eq(w.season, lv % 4); eq(w.loop, Math.floor(lv / 4));
  }
});

test('layout: cards inside BOARD, no overlaps, gap ≥ 12, aspect 0.8–1.0, h ≤ 124', () => {
  const B = C.BOARD;
  for (let s = 0; s < 4; s++) {
    const w = world({ level: s }), cs = w.cards;
    for (const k of cs) {
      ok(k.x >= B.x && k.y >= B.y && k.x + k.w <= B.x + B.w && k.y + k.h <= B.y + B.h, 'inside board ' + JSON.stringify([k.x, k.y, k.w, k.h]));
      const a = k.w / k.h; ok(a >= 0.8 - 1e-9 && a <= 1.0 + 1e-9, 'aspect ' + a);
      ok(k.h <= 124, 'max h');
      near(k.cx, k.x + k.w / 2, 1e-9); near(k.cy, k.y + k.h / 2, 1e-9);
    }
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
      const a = cs[i], b = cs[j];
      const gx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w)), gy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
      ok(Math.max(gx, gy) >= 12 - 1e-9, 'overlap/gap ' + i + ',' + j);
    }
    // centred in the board (±1 px rounding)
    const minX = Math.min(...cs.map(k => k.x)), maxX = Math.max(...cs.map(k => k.x + k.w));
    near((minX + maxX) / 2, B.x + B.w / 2, 1);
    eq(w.cardAt(cs[3].cx, cs[3].cy), 3); eq(w.cardAt(5, 5), -1);
  }
});

test('deal: slides in from the right, small overshoot, column stagger, ~1 s, then peek', () => {
  const w = world({ level: 3 });
  const k0 = w.cards[0], kLast = w.cards[5];               // col 0 and col 5 of row 0
  ok(k0.dealX > 600, 'starts off the right edge');
  ok(k0.dealT < kLast.dealT, 'left column first');
  let minX = 0, prev = k0.dealX, maxJump = 0;
  const t = runUntil(w, x => x.phase !== 'deal', 3, 1 / 120);
  // re-run with sampling for the curve
  const w2 = world({ level: 3 }); const c = w2.cards[0];
  for (let i = 0; i < 240; i++) { w2.update(1 / 120); minX = Math.min(minX, c.dealX); maxJump = Math.max(maxJump, Math.abs(c.dealX - prev)); prev = c.dealX; }
  ok(minX < -C.dealOvershoot * 0.95 && minX >= -C.dealOvershoot - 1e-6, 'overshoot ' + minX);
  eq(c.dealX, 0); eq(c.dealT, 0);
  ok(t >= 0.8 && t <= 1.15, 'deal time ' + t);
  ok(maxJump < 70, 'no teleport: ' + maxJump);   // ≤ 8400 px/s: a fast slide, never a jump
  const ev = w.drainEvents().map(e => e.type);
  eq(ev[0], 'deal'); ok(ev.indexOf('peekStart') > 0);
});

test('flip timing: eased flip ≈ flipTime with a small lift', () => {
  const w = world(); toPlaying(w);
  ok(w.tap(0));
  const ev = w.drainEvents(); eq(ev[0].type, 'flip'); eq(ev[0].id, 0); near(ev[0].x, w.cards[0].cx, 1e-9);
  const k = w.cards[0]; let t = 0, quarter = null, maxLift = 0;
  while (k.flip < 1) { w.update(1 / 120); t += 1 / 120; if (quarter === null && t >= C.flipTime / 4) quarter = k.flip; maxLift = Math.max(maxLift, k.lift); }
  near(t, C.flipTime, 1 / 120 + 1e-9, 'flip time');
  ok(quarter < 0.15, 'ease-in (slow start) ' + quarter);
  near(maxLift, C.flipLift, 0.2, 'lift');
  eq(k.lift < 1e-9, true, 'no lift at rest');
  eq(k.state, 'up');
});

test('match → score 10×mult, flyers, matched → gone after popTime, timeBonus', () => {
  const w = world(); toPlaying(w);
  const [a, b] = pairIdx(w, 1)[0];
  const tl = w.timeLeft;
  tapPair(w, a, b);
  const ev = w.drainEvents(), m = ev.find(e => e.type === 'match');
  ok(m, 'match event'); eq(m.score, 10); eq(m.mult, 1); eq(w.score, 10); eq(m.kind, w.cards[a].kind);
  eq(JSON.stringify(m.ids), JSON.stringify([a, b]));
  ok(ev.find(e => e.type === 'timeBonus' && e.s === CGF.DIFFICULTY.easy.matchBonus));
  near(w.timeLeft, Math.min(w.timeLimit, tl - (C.flipTime + 0.05) + 4), 0.1, 'time refuel');
  eq(w.cards[a].state, 'matched'); eq(w.pairsLeft, w.pairs - 1);
  run(w, C.popTime);
  eq(w.cards[a].state, 'gone'); eq(w.cards[b].state, 'gone');
  eq(w.stats.matches, 1);
});

test('streak / mult grows to 5 and caps; comboUp events', () => {
  const w = world({ level: 1 }); toPlaying(w);
  const mults = [], ups = [];
  for (const [a, b] of pairIdx(w, 7)) {
    tapPair(w, a, b);
    w.drainEvents().forEach(e => { if (e.type === 'match') mults.push(e.mult); if (e.type === 'comboUp') ups.push(e.mult); });
  }
  eq(mults.join(), '1,2,3,4,5,5,5');
  eq(ups.join(), '2,3,4,5');
  eq(w.score, 10 * (1 + 2 + 3 + 4 + 5 + 5 + 5));
  eq(w.streak, 7); eq(w.mult, 5); eq(w.combo01, 1); eq(w.stats.bestStreak, 7);
});

test('miss with unseen cards does not break the combo', () => {
  const w = world({ level: 1 }); toPlaying(w);
  for (const [a, b] of pairIdx(w, 2)) tapPair(w, a, b);
  w.drainEvents(); eq(w.streak, 2);
  const [a, b] = wrongPair(w, true);
  tapPair(w, a, b);
  const m = w.drainEvents().find(e => e.type === 'miss');
  ok(m && m.broke === false, 'broke false'); eq(w.streak, 2); eq(w.mult, 2);
  eq(w.stats.misses, 1); eq(w.stats.brokenMisses, 0);
  ok(w.cards[a].wiggleT > 0, 'wiggling');
});

test('miss with a seen card breaks the combo per difficulty (easy −1, normal −2, hard 0)', () => {
  const expect = { easy: 3, normal: 2, hard: 0 };
  for (const d of ['easy', 'normal', 'hard']) {
    const w = world({ level: 2, difficulty: d }); toPlaying(w);
    for (const [a, b] of pairIdx(w, 4)) tapPair(w, a, b);
    eq(w.streak, 4);
    const [a, b] = wrongPair(w, true);
    tapPair(w, a, b); run(w, 1.2);                          // unseen miss, flips back
    w.drainEvents(); eq(w.streak, 4, d + ' unseen');
    // now a (seen) with a fresh card of another kind
    const fresh = w.cards.findIndex((k, i) => k.state === 'down' && !k.seen && k.kind !== w.cards[a].kind);
    tapPair(w, a, fresh);
    const ev = w.drainEvents(), m = ev.find(e => e.type === 'miss');
    ok(m && m.broke === true, d + ' broke');
    eq(w.streak, expect[d], d + ' streak'); eq(w.mult, Math.max(1, expect[d]));
    ok(ev.find(e => e.type === 'comboDown'), d + ' comboDown');
    eq(w.stats.brokenMisses, 1);
    eq(w.comet.state, 'oops');
  }
});

test('wrong pair: wiggle is a damped sine (±wiggleAmp px), flips back after missDelay', () => {
  const w = world(); toPlaying(w);
  const [a, b] = wrongPair(w, true);
  ok(w.tap(a)); ok(w.tap(b));
  runUntil(w, x => x.cards[a].wiggleT > 0, 1, 1 / 120);
  let maxW = 0, signs = 0, prevS = 0, t = 0, early = 0, late = 0;
  while (w.cards[a].wiggleT > 0) {
    w.update(1 / 120); t += 1 / 120;
    const x = w.cards[a].wiggleX; maxW = Math.max(maxW, Math.abs(x));
    if (t < 0.1) early = Math.max(early, Math.abs(x)); if (t > 0.3) late = Math.max(late, Math.abs(x));
    const s = Math.sign(x); if (s && prevS && s !== prevS) signs++; if (s) prevS = s;
  }
  ok(maxW <= C.wiggleAmp + 1e-9 && maxW > C.wiggleAmp * 0.5, 'amplitude ' + maxW);
  ok(signs >= 4, 'oscillates ' + signs);
  ok(late < early * 0.4, 'decays');
  eq(w.cards[a].wiggleX, 0);
  eq(w.cards[a].state, 'up', 'still visible after the wiggle');
  run(w, CGF.DIFFICULTY.easy.missDelay - C.wiggleTime + 0.02);
  eq(w.cards[a].state, 'down');
  ok(w.drainEvents().find(e => e.type === 'flipBack'));
});

test('3rd tap closes a wrong pair immediately (after missLock) and still counts', () => {
  const w = world({ difficulty: 'normal' }); toPlaying(w);
  const [a, b] = wrongPair(w, true);
  tapPair(w, a, b); w.drainEvents();
  eq(w.cards[a].state, 'up');
  const c = w.cards.findIndex((k, i) => k.state === 'down' && i !== a && i !== b);
  ok(!w.tap(c), 'mashing a 3rd card during missLock is ignored');
  run(w, CGF.DIFFICULTY.normal.missLock + 0.05);
  eq(w.cards[a].state, 'up');
  ok(w.tap(c), '3rd tap accepted');
  eq(w.cards[a].state, 'down'); eq(w.cards[b].state, 'down'); eq(w.cards[c].state, 'up');
  eq(w.cards[a].wiggleT, 0);
  const ev = w.drainEvents().map(e => e.type);
  ok(ev.indexOf('flipBack') >= 0 && ev.indexOf('flip') > ev.indexOf('flipBack'), ev.join());
  ok(w.tap(a), 'a card still flipping back can be tapped: it turns back up');
  eq(w.cards[a].state, 'up');
});

test('taps ignored outside playing (deal, peek, clear, over) and on bad cards', () => {
  const w = world();
  eq(w.phase, 'deal'); ok(!w.tap(0)); ok(!w.tapAt(w.cards[0].cx, w.cards[0].cy));
  runUntil(w, x => x.phase === 'peek', 3); ok(!w.tap(0));
  runUntil(w, x => x.phase === 'playing', 10);
  ok(w.tap(0), 'a tap right on "Go!" works (the closing card turns back up)');
  run(w, 2.5);
  ok(!w.tap(-1)); ok(!w.tap(999));
  ok(!w.tap(0), 'same card twice');
  w.tap(1); ok(!w.tap(2), 'pair being judged');
  run(w, 1.5);
  clearLevel(w); run(w, 0.4);
  eq(w.phase, 'clear'); ok(!w.tap(0));
  const w2 = world(); toPlaying(w2); w2.timeLeft = 0.05; run(w2, 0.1);
  eq(w2.phase, 'over'); ok(!w2.tap(0)); eq(w2.stats.flips, 0);
});

test('timer only counts down in playing', () => {
  const w = world();
  runUntil(w, x => x.phase === 'playing', 10);
  eq(w.timeLeft, w.timeLimit, 'full during deal + peek');
  run(w, 3);
  near(w.timeLeft, w.timeLimit - 3, 0.02);
  clearLevel(w); const tl = w.timeLeft; run(w, 1);
  eq(w.phase, 'clear'); eq(w.timeLeft, tl, 'frozen in clear');
});

test('time-out → over + gameOver event, hurry once, ticks 5…1', () => {
  const w = world(); toPlaying(w);
  const ev = [];
  runUntil(w, x => { ev.push(...x.drainEvents()); return x.phase === 'over'; }, 200);
  ev.push(...w.drainEvents());
  const types = ev.map(e => e.type);
  eq(types.filter(t => t === 'hurry').length, 1);
  eq(ev.filter(e => e.type === 'tick').map(e => e.s).join(), '5,4,3,2,1');
  const go = ev.find(e => e.type === 'gameOver'); ok(go); eq(go.score, w.score);
  eq(w.timeLeft, 0);
  run(w, 2);
  eq(w.gizmo.state, 'sleep'); eq(w.comet.state, 'sleep'); ok(w.comet.flame < 0.05, 'flame out');
  near(w.comet.x, C.cometSleep.x, 3); near(w.comet.y, C.cometSleep.y, 3);
});

test('clear bonus (5 × ceil(timeLeft)) + perfect bonus (+50)', () => {
  const w = world(); toPlaying(w);
  let ev = [];
  for (const [a, b] of pairIdx(w)) { tapPair(w, a, b); ev.push(...w.drainEvents()); }
  const tl = w.timeLeft, before = 10 * (1 + 2 + 3 + 4 + 5 + 5);
  const lc = ev.find(e => e.type === 'levelClear');
  ok(lc && lc.perfect === true); eq(lc.level, 0);
  eq(lc.bonus, 5 * Math.ceil(tl) + 50);
  eq(w.score, before + lc.bonus);
  eq(w.stats.perfectLevels, 1); eq(w.stats.levelsCleared, 1);
  // not perfect after a broken miss
  const w2 = world(); toPlaying(w2);
  const [a, b] = wrongPair(w2, true); tapPair(w2, a, b); run(w2, 1.2);
  tapPair(w2, a, w2.cards.findIndex(k => k.state === 'down' && k.kind !== w2.cards[a].kind && k.id !== a)); run(w2, 1.2);
  ev = [];
  for (const [x, y] of pairIdx(w2)) { tapPair(w2, x, y); ev.push(...w2.drainEvents()); }
  const lc2 = ev.find(e => e.type === 'levelClear');
  ok(lc2 && lc2.perfect === false); const acc = Math.min(1, w2.pairs / (w2.stats.flips / 2)); ok(acc < 1, 'misses lower accuracy'); eq(lc2.bonus, Math.round(5 * Math.ceil(w2.timeLeft) * acc));
});

test('level progression: spring → winter, then next year with the loop factor', () => {
  const w = world({ difficulty: 'normal' });
  const seen = [];
  for (let lv = 0; lv < 5; lv++) {
    toPlaying(w);
    seen.push([w.level, w.season, w.cols, w.rows, Math.round(w.timeLimit * 1000) / 1000]);
    if (lv === 4) break;
    clearLevel(w); const ev = [];
    runUntil(w, x => { ev.push(...x.drainEvents()); return x.phase === 'deal'; }, 5);
    ev.push(...w.drainEvents());
    const up = ev.find(e => e.type === 'levelUp'); ok(up, 'levelUp'); eq(up.level, lv + 1); eq(up.season, (lv + 1) % 4);
    ok(ev.find(e => e.type === 'deal' && e.level === lv + 1));
  }
  const T = CGF.DIFFICULTY.normal.time;
  eq(JSON.stringify(seen.map(s => s.slice(0, 4))), JSON.stringify([[0, 0, 4, 3], [1, 1, 4, 4], [2, 2, 5, 4], [3, 3, 6, 4], [4, 0, 4, 3]]));
  near(seen[3][4], T[3], 1e-9); near(seen[4][4], T[0] * CGF.DIFFICULTY.normal.loopMul, 1e-3);
  eq(w.loop, 1);
  near(w.loopFactor(8), 0.5, 1e-9); near(w.loopFactor(40), 0.5, 1e-9);
  const w2 = world({ level: 12 }); near(w2.timeLimit, CGF.DIFFICULTY.easy.time[0] * Math.max(0.75, Math.pow(0.9, 3)), 1e-9);
  w2.gotoLevel(3); eq(w2.season, 3); eq(w2.phase, 'deal');
});

test('flyers: ballistic arc with spin, apex above start, land at HOPPER at t = T; Gizmo eats', () => {
  for (const lv of [0, 3]) {
    const w = world({ level: lv }); toPlaying(w);
    const pairs = pairIdx(w);
    // pick the top-row and the bottom-row pair if possible
    for (const [a, b] of [pairs[0], pairs[pairs.length - 1]]) {
      w.flyers.length = 0;
      tapPair(w, a, b); w.drainEvents();
      run(w, 0, 1); runUntil(w, x => x.flyers.length >= 1, 1, 1 / 120);
      const f = w.flyers[0];
      const y0 = f.y0, x0 = f.x0;
      near(x0, w.cards[a].cx, 1e-9); near(y0, w.cards[a].cy, 1e-9);
      let minY = Infinity, t = f.t, rot0 = f.rot, maxErr = 0, landed = null, steps = 0;
      while (w.flyers.indexOf(f) >= 0) {
        w.update(1 / 120); t += 1 / 120; steps++;
        if (w.flyers.indexOf(f) >= 0) {
          minY = Math.min(minY, f.y);
          const ex = x0 + f.vx0 * f.t, ey = y0 + f.vy0 * f.t + 0.5 * C.flyG * f.t * f.t;
          maxErr = Math.max(maxErr, Math.hypot(f.x - ex, f.y - ey));
          ok(Math.abs(f.prevX + f.vx0 / 120 - f.x) < 1e-6, 'prevX stored each step');
        } else landed = w.drainEvents().find(e => e.type === 'gemLand');
        ok(steps < 400, 'lands');
      }
      ok(maxErr < 1e-6, 'follows the parabola');
      near(f.x, C.HOPPER.x, 1); near(f.y, C.HOPPER.y, 1);
      near(f.t, f.T, 1e-9); near(t, f.T, 1 / 120 + 1e-9, 'flight time');
      ok(f.T >= 0.6 && f.T <= 1.3, 'T ' + f.T);
      ok(minY < y0 - 5, 'apex above start ' + minY + ' vs ' + y0);
      ok(Math.abs(f.rot - rot0) > 2, 'spins');
      ok(landed && landed.kind === w.cards[a].kind, 'gemLand');
      eq(w.gizmo.state, 'eat');
      runUntil(w, x => x.flyers.length === 0, 2);
      run(w, C.gizmoEatTime + 0.05);
    }
    eq(w.gizmo.eaten, 4);
  }
  // twin is staggered
  const w = world(); toPlaying(w);
  const [a, b] = pairIdx(w, 1)[0]; tapPair(w, a, b);
  runUntil(w, x => x.flyers.length === 2, 1);
  ok(w.flyers[0].t - w.flyers[1].t > C.flyStagger * 0.8, 'stagger');
});

test('comet: spring flight to the tapped card, HOME after idle, no teleport, no jitter at rest', () => {
  const w = world({ level: 3 }); toPlaying(w);
  run(w, 3);
  const m = w.comet;
  near(m.x, C.HOME.x, 2); near(m.y, C.HOME.y, C.cometBobAmp + 2);
  const i = 5, k = w.cards[i];                                // far right, top row
  ok(w.tap(i));
  let t = 0, maxStep = 0, px = m.x, py = m.y;
  w.update(1 / 120);
  near(m.tx, k.cx < 540 ? k.x + k.w + 6 : k.x - 6, 1e-9, 'target x = gutter corner beside the card'); ok(m.tx >= k.x + k.w || m.tx <= k.x || m.ty < k.y + 2, 'target beside the card, not over its gem');
  while (Math.hypot(m.x - m.tx, m.y - m.ty) > 4) {
    w.update(1 / 120); t += 1 / 120;
    maxStep = Math.max(maxStep, Math.hypot(m.x - px, m.y - py)); px = m.x; py = m.y;
    ok(t < 2, 'reaches the card');
  }
  ok(t > 0.4 && t < 1.8, 'travel time ' + t.toFixed(2));
  ok(maxStep <= C.cometMaxSpeed / 120 + 1e-6, 'no teleport ' + maxStep);
  // returns HOME after the idle time
  run(w, C.cometIdle + 2);
  near(m.x, C.HOME.x, 3); near(m.y, C.HOME.y, C.cometBobAmp + 3);
  // at rest: smooth bob only (2nd difference small, no high-frequency jitter)
  let p2 = null, p1 = null, maxAcc = 0, minY = 1e9, maxY = -1e9;
  for (let s = 0; s < 240; s++) {
    w.update(1 / 120);
    if (p2 !== null) maxAcc = Math.max(maxAcc, Math.abs(m.y - 2 * p1 + p2) * 120 * 120);
    p2 = p1; p1 = m.y; minY = Math.min(minY, m.y); maxY = Math.max(maxY, m.y);
  }
  const bobAcc = C.cometBobAmp * Math.pow(2 * Math.PI * C.cometBobFreq, 2);
  ok(maxAcc < bobAcc * 2, 'no jitter: acc ' + maxAcc.toFixed(1) + ' vs bob ' + bobAcc.toFixed(1));
  ok(maxY - minY > C.cometBobAmp, 'gentle bob ' + (maxY - minY));
  ok(Math.abs(m.rot) < 0.02, 'level at rest');
});

test('comet: happy loop on a match, banking bounded (|rot| ≤ 0.35) over long bot play', () => {
  const w = world({ difficulty: 'normal' }); toPlaying(w);
  run(w, 3);
  const [a, b] = pairIdx(w, 1)[0]; tapPair(w, a, b);
  eq(w.comet.state, 'happy');
  let minY = 1e9, maxY = -1e9, minX = 1e9, maxX = -1e9; const y0 = w.comet.y;
  for (let s = 0; s < 100; s++) { w.update(1 / 120); const m = w.comet; minY = Math.min(minY, m.y); maxY = Math.max(maxY, m.y); minX = Math.min(minX, m.x); maxX = Math.max(maxX, m.x); }
  ok(maxY - minY > C.cometLoopR && maxX - minX > C.cometLoopR, 'traces a loop ' + [maxX - minX, maxY - minY]);
  ok(minY < y0 - C.cometLoopR || maxY > y0 + C.cometLoopR, 'loops');
  run(w, 1); eq(w.comet.state, 'fly');
  const w2 = world({ seed: 9, difficulty: 'normal' }), bot = new CGF.Bot(w2, { skill: 0.6, seed: 2 });
  let maxRot = 0, banked = 0;
  for (let i = 0; i < 60 * 300; i++) { bot.step(DT); w2.update(DT); const r = Math.abs(w2.comet.rot); maxRot = Math.max(maxRot, r); if (r > 0.1) banked++; if (w2.phase === 'over') w2.reset(); }
  ok(maxRot <= C.cometRotMax + 1e-9, 'rot ' + maxRot);
  ok(banked > 100, 'it does bank when flying');
});

test('gizmo: eat on gemLand, happy on clear, sleep on over', () => {
  const w = world(); toPlaying(w);
  clearLevel(w);
  eq(w.phase, 'clear');
  runUntil(w, x => x.flyers.length === 0 && x._pendingFly.length === 0, 3);
  run(w, C.gizmoEatTime + 0.05);
  eq(w.gizmo.state, 'happy'); eq(w.gizmo.eaten, 12);
  runUntil(w, x => x.phase === 'deal', 4); eq(w.gizmo.state, 'idle');
  toPlaying(w); w.timeLeft = 0.01; run(w, 0.05); eq(w.gizmo.state, 'sleep');
});

test('keyboard cursor and tapAt', () => {
  const w = world(); toPlaying(w);
  w.moveCursor(1, 0); eq(w.cursorOn, true); eq(w.cursor, 0, 'first press only shows');
  w.moveCursor(1, 0); eq(w.cursor, 1); w.moveCursor(0, 1); eq(w.cursor, 5);
  w.moveCursor(9, 9); eq(w.cursor, 11); w.moveCursor(-9, -9); eq(w.cursor, 0);
  ok(w.tapCursor()); eq(w.cards[0].state, 'up');
  const k = w.cards[1];
  ok(w.tapAt(k.x + k.w - 1, k.y + 1)); eq(w.cursorOn, false);
  ok(!w.tapAt(20, 20));
});

test('fixed step: alpha in [0,1), prevX/prevRot stored, update(0) harmless, big dt capped', () => {
  const w = world();
  w.update(0.0123); ok(w.alpha >= 0 && w.alpha < 1);
  near(w.alpha, (0.0123 % C.step) / C.step, 1e-6);
  w.update(0); w.update(NaN); w.update(-1);
  const t0 = w.t; w.update(100); ok(w.t - t0 <= C.maxSteps * C.step + 1e-9, 'big dt capped');
  const s = w.getState();
  ['t', 'level', 'season', 'loop', 'phaseT', 'peekT', 'timeLeft', 'timeLimit', 'score', 'streak', 'mult', 'combo01', 'pairs', 'pairsLeft', 'cols', 'rows', 'cursor', 'cursorOn']
    .forEach(f => ok(f in s, 'state.' + f));
  ['id', 'kind', 'col', 'row', 'x', 'y', 'w', 'h', 'state', 'flip', 'seen', 'wiggleT', 'popT', 'dealT', 'dealX'].forEach(f => ok(f in s.cards[0], 'card.' + f));
  ['x', 'y', 'prevX', 'prevY', 'vx', 'vy', 'rot', 'prevRot', 'flame', 'state', 'stateT'].forEach(f => ok(f in s.comet, 'comet.' + f));
  ['state', 'stateT', 'eaten'].forEach(f => ok(f in s.gizmo, 'gizmo.' + f));
  ['flips', 'matches', 'misses', 'brokenMisses', 'levelsCleared', 'perfectLevels', 'bestStreak', 'timeBonus'].forEach(f => ok(f in s.stats, 'stats.' + f));
});

test('easy spring peek ≈ 2.5 s, missDelay ≈ 1.0 s; peek grows with board size', () => {
  const w = world();
  near(w.peekT, 2.5, 1e-9); eq(CGF.DIFFICULTY.easy.missDelay, 1.0);
  const w3 = world({ level: 3 }); ok(w3.peekT > w.peekT);
  // real peek: from peekStart to peekEnd
  let a = null, b = null, t = 0;
  while (b === null) { w.update(1 / 120); t += 1 / 120; w.drainEvents().forEach(e => { if (e.type === 'peekStart') a = t; if (e.type === 'peekEnd') b = t; }); }
  near(b - a, 2.5 + C.flipTime, 0.02);
});

/* ================================ Weather ================================ */
test('weather: particle fields valid, count bounded over 10 minutes per season (with bursts + steam)', () => {
  const sprites = new Set(['blossom', 'sunmote', 'butterfly', 'leaf', 'snowflake', 'steam', 'sparkle', 'spark', 'confetti']);
  const layers = new Set(['outside', 'room', 'front']);
  for (let s = 0; s < 4; s++) {
    const wx = new CGF.Weather({ width: 960, height: 540, seed: 3 + s });
    wx.setLevel(s, { instant: true });
    wx.setVents([{ x: 300, y: 88 }, { x: 760, y: 88 }]);
    let max = 0, min = 1e9, kinds = new Set();
    const dt = 1 / 30;
    for (let i = 0; i < 600 * 30; i++) {
      if (i % 90 === 0) wx.burst('sparkle', 500, 250, 12);
      if (i % 90 === 45) wx.burst('spark', 400, 200, 14);
      if (i % 900 === 0) wx.burst('confetti', 480, 300, 90);
      wx.update(dt);
      max = Math.max(max, wx.particles.length);
      if (i > 300) min = Math.min(min, wx.particles.filter(p => p.layer !== 'front').length);
      if (i % 300 === 0) for (const p of wx.particles) {
        ok(sprites.has(p.sprite), 'sprite ' + p.sprite); ok(layers.has(p.layer), 'layer ' + p.layer);
        ok(isFinite(p.x) && isFinite(p.y) && p.size > 0 && isFinite(p.rot) && p.alpha >= 0 && p.alpha <= 1, 'fields ' + JSON.stringify(p));
        ok(Math.abs(p.flipX) >= 0.2 - 1e-9 && Math.abs(p.flipX) <= 1 + 1e-9, 'flipX ' + p.flipX);
        if (p.sprite === 'confetti') ok(typeof p.color === 'string');
        kinds.add(p.sprite);
      }
    }
    ok(max <= 260, 'cap ' + max);
    ok(min >= 20, 'ambience never empties ' + min);
    const want = [['blossom'], ['sunmote', 'butterfly'], ['leaf'], ['snowflake']][s];
    want.concat(['steam']).forEach(k => ok(kinds.has(k), 'season ' + s + ' has ' + k));
  }
});

test('weather: season change fades the old season out and the new one in; deterministic', () => {
  const a = new CGF.Weather({ seed: 8 }), b = new CGF.Weather({ seed: 8 });
  for (const wx of [a, b]) { wx.setLevel(0, { instant: true }); for (let i = 0; i < 60; i++) wx.update(1 / 60); wx.setLevel(3); }
  ok(a.particles.some(p => p.sprite === 'blossom'), 'old season still there right after the change');
  for (const wx of [a, b]) for (let i = 0; i < 60 * 4; i++) wx.update(1 / 60);
  ok(!a.particles.some(p => p.sprite === 'blossom'), 'blossoms gone');
  ok(a.particles.filter(p => p.sprite === 'snowflake').length > 40, 'snow in');
  eq(JSON.stringify(a.particles.map(p => [p.x, p.y])), JSON.stringify(b.particles.map(p => [p.x, p.y])));
  const snow = a.particles.filter(p => p.sprite === 'snowflake');
  const small = snow.filter(p => p.size < 7), big = snow.filter(p => p.size > 12);
  ok(small.length && big.length, '3 depth layers');
  ok(Math.max(...small.map(p => p.vy)) < Math.min(...big.map(p => p.vy)), 'parallax: far snow is slower');
});

/* ================================ Bot ================================ */
function botGame(o) {
  const w = world({ seed: o.seed, difficulty: o.diff }), bot = new CGF.Bot(w, { skill: o.skill, seed: o.seed * 7 + 1 });
  const dt = 1 / 30;
  for (let i = 0; i < o.secs / dt; i++) {
    bot.step(dt); w.update(dt);
    if (w.phase === 'over' || w.stats.levelsCleared >= o.levels) break;
  }
  return w;
}

test('bot skill 1 clears the 4 seasons on normal', () => {
  const times = [];
  for (let seed = 1; seed <= 10; seed++) {
    const w = botGame({ seed, diff: 'normal', skill: 1, secs: 600, levels: 4 });
    eq(w.stats.levelsCleared, 4, 'seed ' + seed + ' phase ' + w.phase + ' level ' + w.level);
    times.push(w.t);
  }
  console.log('     skill 1 normal: year cleared in ' + Math.min(...times).toFixed(0) + '–' + Math.max(...times).toFixed(0) + ' s');
});

test('bot skill 0.3 clears Spring on easy most of the time', () => {
  let ok1 = 0; const t = [];
  for (let seed = 1; seed <= 30; seed++) {
    const w = botGame({ seed, diff: 'easy', skill: 0.3, secs: 300, levels: 1 });
    if (w.stats.levelsCleared >= 1) { ok1++; t.push(w.t - 3.9); }
  }
  console.log('     skill 0.3 easy spring: ' + ok1 + '/30 cleared, ~' + (t.reduce((a, b) => a + b, 0) / t.length).toFixed(0) + ' s of play');
  ok(ok1 >= 24, 'cleared ' + ok1 + '/30');
});

test('typical young player (skill 0.3, ~2 s/tap) spends ~45–90 s on spring and clears the easy year', () => {
  const per = [0, 0, 0, 0], n = [0, 0, 0, 0]; let lost = 0;
  for (let seed = 1; seed <= 8; seed++) {
    // a 4–6-year-old: ≈ 2 s per tap, poor memory (skill 0.3 ≈ 2.0–2.4 attempts per pair, see MECHANICS.md)
    const w = world({ seed, difficulty: 'easy' }), bot = new CGF.Bot(w, { skill: 0.3, seed });
    bot.delay = function () { return 2.0 * this.rng.range(0.75, 1.25); };
    let lv = 0, start = null;
    for (let i = 0; i < 1200 * 30 && lv < 4 && w.phase !== 'over'; i++) {
      bot.step(1 / 30); w.update(1 / 30);
      if (w.phase === 'playing' && start === null) start = w.t;
      if (w.phase === 'clear' && start !== null) { per[lv] += w.t - start; n[lv]++; lv++; start = null; }
    }
    if (lv < 4) lost++;
  }
  const avg = per.map((s, i) => s / n[i]);
  console.log('     2 s/tap kid, easy, s per level: ' + avg.map(x => x.toFixed(0)).join(' / '));
  ok(avg[0] >= 40 && avg[0] <= 90, 'spring ' + avg[0]);
  eq(n[0], 8, 'every kid clears spring');
  ok(lost <= 1, 'kids that ran out of time in the year: ' + lost);
});

test('performance: 10 simulated minutes (world + bot + weather) in ~2 s', () => {
  const w = world({ difficulty: 'normal' }), bot = new CGF.Bot(w, { skill: 0.8, seed: 3 });
  const wx = new CGF.Weather({ seed: 1 });
  const t0 = Date.now();
  for (let i = 0; i < 600 * 60; i++) {
    bot.step(DT); w.update(DT); wx.update(DT);
    for (const e of w.drainEvents()) { if (e.type === 'match') wx.burst('sparkle', e.x, e.y, 10); if (e.type === 'levelClear') wx.burst('confetti', 480, 300, 80); if (e.type === 'deal') wx.setLevel(e.season); }
    if (w.phase === 'over') w.reset();
  }
  const ms = Date.now() - t0;
  console.log('     10 min simulated in ' + ms + ' ms (levels cleared: ' + w.stats.levelsCleared + ')');
  ok(ms < 4000, 'too slow: ' + ms + ' ms');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
