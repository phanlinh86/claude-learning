#!/usr/bin/env node
// Kit's Toybox Beat — headless unit tests for rng / world / weather / bot (node, no deps).
// Run from projects/daily-game/kit-toybox-beat:   node tests/unit/run.js
'use strict';
const assert = require('assert');
const { load } = require('./load');

const KB = load();
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const H = 1 / 120;
const J = v => JSON.parse(JSON.stringify(v));
const near = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, (m || '') + ' got ' + a + ' want ' + b + ' ±' + tol);
const DIFFS = ['easy', 'normal', 'hard'];

// ---------- helpers ----------
function mk(diff, seed, extra) {
  return new KB.World({ seed: seed || 1, config: Object.assign({}, KB.DIFFICULTY[diff || 'normal'], extra || {}) });
}
function run(w, seconds, each) {
  const n = Math.round(seconds / H);
  for (let i = 0; i < n; i++) { if (each && each(i) === false) return i; w.update(H); }
  return n;
}
function untilPlaying(w) { let k = 0; while (w.state === 'ready' && k++ < 10000) w.update(H); assert.strictEqual(w.state, 'playing'); }
// a playing world whose chart is replaced by the given notes (time in s), boss away
function custom(diff, list, extra) {
  const w = mk(diff, 5, Object.assign({ readyBeats: 0 }, extra));
  w._visits = [];
  let id = 1000;
  w.notes = list.map(n => Object.assign({ id: id++, lane: 0, kind: 'coin', pitch: 0, state: 'live', judge: null, err: 0, tDone: 0, beat: n.time / w.beatLen }, n));
  w._first = 0; w._songEnd = 1e9;
  w.drainEvents();
  return w;
}
function tapAt(w, lane, t) { return w.tap(lane, t - (w.songTime + w._acc)); }
function playGame(diff, seed, skill, maxS, stopLevels, withWeather) {
  const w = mk(diff, seed);
  const bot = new KB.Bot(w, { skill, seed: seed * 3 + 1 });
  const wx = withWeather ? new KB.Weather({ width: 960, height: 540, seed }) : null;
  let t = 0, ev = [], dt = 1 / 60;
  maxS = maxS || 600;
  while (w.state !== 'dead' && t < maxS && !(stopLevels !== undefined && w.levelsCleared >= stopLevels)) {
    bot.step(dt); w.update(dt);
    const e = w.drainEvents(); for (const x of e) ev.push(x);
    if (wx) { for (const x of e) { if (x.type === 'level') wx.setLevel(x.tod); if (x.type === 'hit') wx.burst('sparkle', 200, 300, 6); if (x.type === 'poof') wx.burst('feather', 200, 300, 8); } wx.update(dt, { beat: w.beat, kitX: 190, kitY: 300 }); }
    t += dt;
  }
  return { w, t, bot, ev };
}
function charts(diff, seed, levels) {
  const w = mk(diff, seed), out = [];
  for (const L of levels) { w.startLevel(L); out.push({ L, notes: J(w.notes), songLen: w.songLen, bars: w.bars, visits: J(w._visits), beatLen: w.beatLen, cfg: w.cfg }); }
  return out;
}

// ---------- RNG / tables ----------
test('rng: deterministic, in range, API', () => {
  const a = new KB.RNG(42), b = new KB.RNG(42), c = new KB.RNG('x');
  for (let i = 0; i < 300; i++) { const x = a.next(); assert.strictEqual(x, b.next()); assert.ok(x >= 0 && x < 1); }
  for (const f of ['next', 'range', 'int', 'pick', 'chance', 'gauss', 'fork']) assert.strictEqual(typeof c[f], 'function', f);
  for (let i = 0; i < 300; i++) { const k = c.int(4); assert.ok(k >= 0 && k < 4 && k === (k | 0)); const m = c.int(2, 5); assert.ok(m >= 2 && m <= 5); }
  let s = 0, s2 = 0; for (let i = 0; i < 4000; i++) { const g = c.gauss(); s += g; s2 += g * g; }
  near(s / 4000, 0, 0.08, 'gauss mean'); near(Math.sqrt(s2 / 4000), 1, 0.08, 'gauss sd');
});

test('tables: CONFIG, DIFFICULTY (easy one-button), LEVELS', () => {
  assert.ok(KB.CONFIG && KB.CONFIG.step <= 1 / 120 + 1e-12);
  assert.strictEqual(KB.DIFFICULTY.easy.oneButton, true);
  assert.ok(KB.DIFFICULTY.normal && KB.DIFFICULTY.hard);
  assert.deepStrictEqual(J(KB.LEVELS.map(l => l.key + l.bpm)), ['dawn84', 'noon96', 'sunset104', 'night112']);
  const n = mk('normal'), e = mk('easy'), h = mk('hard');
  assert.strictEqual([n.cfg.perfectWin, n.cfg.goodWin, n.cfg.earlyWin].join(), '0.075,0.17,0.34');
  assert.strictEqual(n.cfg.wrongLaneMiss, true); assert.strictEqual(new KB.World({ seed: 1, config: KB.DIFFICULTY.easy }).cfg.wrongLaneMiss, false);
  assert.strictEqual(new KB.World({ seed: 1, config: KB.DIFFICULTY.easy }).cfg.maxDensity, 4, 'easy maxDensity applies');
  assert.strictEqual(new KB.World({ seed: 1, config: KB.DIFFICULTY.hard }).cfg.pillowClear, 1.5);
  assert.strictEqual([e.cfg.perfectWin, e.cfg.goodWin, e.cfg.earlyWin].join(), '0.1,0.22,0.34');
  assert.strictEqual([h.cfg.perfectWin, h.cfg.goodWin, h.cfg.earlyWin].join(), '0.055,0.11,0.28');
  near(n.approach, 1.8, 1e-9, 'normal approach at 84 BPM');
  assert.ok(e.approach > n.approach && h.approach < n.approach);
  n.startLevel(3); assert.ok(n.approach < 1.8 && n.approach > 1.4, 'night approach ' + n.approach);
});

// ---------- determinism ----------
test('determinism: same seed + inputs → identical score / events / notes; chart independent of play', () => {
  function go(seed, script) {
    const w = mk('normal', seed); const ev = [];
    for (let i = 0; i < 60 * 70; i++) {
      if (script && i % 23 === 0) w.tap(i % 46 === 0 ? 0 : 1);
      if (script && i % 37 === 5) w.tap(i % 2, 0.01);
      w.update(1 / 60); for (const e of w.drainEvents()) ev.push(e);
    }
    return { score: w.score, groove: w.groove, ev: J(ev), notes: J(w.notes), kit: J(w.kit), boss: J(w.boss), st: w.state };
  }
  const a = go(9, true), b = go(9, true), c = go(10, true);
  assert.deepStrictEqual(a, b);
  assert.notDeepStrictEqual(a.notes.map(n => n.time), c.notes.map(n => n.time));
  // level 3's chart is the same whatever happened before
  const w1 = mk('normal', 21); w1.startLevel(3);
  const w2 = mk('normal', 21); run(w2, 20, i => { if (i % 50 === 0) w2.tap(1); }); w2.startLevel(3);
  assert.deepStrictEqual(w1.notes.map(n => [n.time, n.lane, n.kind, n.pitch]), w2.notes.map(n => [n.time, n.lane, n.kind, n.pitch]));
});

// ---------- chart ----------
test('chart: sorted, minGap, ½-beat grid, sparse start, length 55–75 s, ta-da ending — all diffs × 8 levels × 6 seeds', () => {
  for (const d of DIFFS) for (let seed = 1; seed <= 6; seed++) for (const c of charts(d, seed, [0, 1, 2, 3, 4, 5, 6, 7])) {
    const N = c.notes, bl = c.beatLen, tag = d + ' s' + seed + ' L' + c.L;
    assert.ok(N.length > 10, tag);
    for (let i = 0; i < N.length; i++) {
      const n = N[i];
      assert.ok(Math.abs(n.beat * 2 - Math.round(n.beat * 2)) < 1e-9, tag + ' grid ' + n.beat);
      near(n.time, n.beat * bl, 1e-9, tag);
      assert.ok(n.lane === 0 || n.lane === 1);
      assert.ok(['coin', 'gold', 'pillow'].includes(n.kind));
      assert.ok(n.pitch >= 0 && n.pitch <= 7);
      assert.strictEqual(n.state, 'live');
      if (i) {
        assert.ok(n.time > N[i - 1].time, tag + ' sorted');
        assert.ok(n.time - N[i - 1].time >= c.cfg.minGap - 1e-9, tag + ' minGap ' + (n.time - N[i - 1].time));
      }
    }
    assert.ok(c.songLen >= 55 && c.songLen <= 75, tag + ' songLen ' + c.songLen);
    assert.strictEqual(N[0].beat, 0, tag + ' starts on beat 0');
    const last = N[N.length - 1];
    assert.strictEqual(last.beat, (c.bars - 1) * 4, tag + ' ta-da on the last downbeat');
    assert.strictEqual(N.filter(n => n.beat >= (c.bars - 1) * 4).length, 1, tag + ' last bar single coin');
    near(c.songLen, last.time + bl, 1e-9);
    const bar = b => N.filter(n => n.kind !== 'pillow' && Math.floor(n.beat / 4) === b).length;
    assert.strictEqual(bar(0), 1, tag + ' bar 0');
    assert.ok(bar(1) <= 3, tag + ' bar 1');
    if (c.L === 0) assert.strictEqual(bar(1), 2, tag + ' level 1 bar 1 = two coins');
    if (d === 'easy') assert.ok(N.every(n => n.beat % 1 === 0), tag + ' easy: quarters only');
    if (d === 'normal' && c.L === 0) assert.ok(N.every(n => n.beat % 1 === 0), tag + ' normal level 1: quarters only');
  }
});

test('chart: density ramps per level and per difficulty; gold ≈ 6 %', () => {
  const avg = {}; let gold = 0, coins = 0;
  for (const d of DIFFS) {
    avg[d] = [0, 0, 0, 0];
    for (let seed = 1; seed <= 10; seed++) charts(d, seed, [0, 1, 2, 3]).forEach(c => {
      avg[d][c.L] += c.notes.length / c.bars / 10;
      for (const n of c.notes) { if (n.kind === 'gold') gold++; if (n.kind !== 'pillow') coins++; }
      const half = c.notes.filter(n => n.kind !== 'pillow' && n.time < c.songLen / 2).length;
      const half2 = c.notes.filter(n => n.kind !== 'pillow' && n.time >= c.songLen / 2).length;
      assert.ok(half2 >= half * 0.95 || d === 'easy', 'ramps within the song ' + d + ' L' + c.L + ' ' + half + '/' + half2);
    });
    for (let L = 1; L < 4; L++) assert.ok(avg[d][L] > avg[d][L - 1] - 0.15, d + ' density by level ' + avg[d]);
    assert.ok(avg[d][3] > avg[d][0] + 0.4, d + ' night denser than dawn');
  }
  for (let L = 0; L < 4; L++) assert.ok(avg.easy[L] <= avg.normal[L] + 0.05 && avg.normal[L] < avg.hard[L], 'by difficulty ' + L);
  assert.ok(avg.normal[0] < 2.4, 'level 1 normal sparse: ' + avg.normal[0].toFixed(2) + ' notes/bar');
  const g = gold / coins; assert.ok(g > 0.03 && g < 0.09, 'gold ' + g);
});

test('chart: boss pillows — on beats, 3 per visit, first ≈ 12 s then every 30 s, ≥ 8 s left, coins cleared ±1 beat', () => {
  for (const d of DIFFS) for (let seed = 1; seed <= 6; seed++) for (const c of charts(d, seed, [0, 1, 2, 3, 4, 7])) {
    const tag = d + ' s' + seed + ' L' + c.L, bl = c.beatLen;
    const P = c.notes.filter(n => n.kind === 'pillow');
    assert.ok(c.visits.length >= 1 && c.visits.length <= 2, tag + ' visits ' + c.visits.length);
    assert.strictEqual(P.length, 3 * c.visits.length, tag);
    c.visits.forEach((v, k) => {
      near(v.tEnter, 12 + 30 * k, 1e-9, tag + ' visit start');
      assert.ok(v.tEnter <= c.songLen - 8 + 1e-9);
      assert.strictEqual(v.ids.length, 3);
      const ps = v.ids.map(id => c.notes.find(n => n.id === id));
      for (let j = 0; j < 3; j++) {
        const p = ps[j];
        assert.strictEqual(p.kind, 'pillow');
        assert.ok(Number.isInteger(p.beat), tag + ' pillow on a beat');
        near(p.tThrow, p.time - 2 * bl, 1e-9, 'thrown 2 beats ahead');
        assert.ok(p.tThrow >= v.tHover, tag + ' thrown after he arrived');
        if (j) assert.strictEqual(p.beat - ps[j - 1].beat, 4, 'one bar apart');
        for (const n of c.notes) if (n.kind !== 'pillow') assert.ok(Math.abs(n.beat - p.beat) > 1, tag + ' coin near pillow');
      }
      assert.ok(v.tLeave > ps[2].time && v.tOut <= c.songLen, tag + ' leaves before the end');
    });
  }
});

// ---------- judging ----------
test('judging: perfect / good / early / empty / miss at exact offsets (normal, hard, easy)', () => {
  for (const d of DIFFS) {
    const W = mk(d).cfg;
    const cases = [
      [0, 'hit', 'perfect'], [W.perfectWin - 0.002, 'hit', 'perfect'], [-(W.perfectWin - 0.002), 'hit', 'perfect'],
      [W.perfectWin + 0.003, 'hit', 'good'], [-(W.goodWin - 0.003), 'hit', 'good'], [W.goodWin - 0.003, 'hit', 'good'],
      [-(W.goodWin + 0.01), 'miss', 'early'], [-(W.earlyWin - 0.005), 'miss', 'early'], [-(W.earlyWin + 0.02), 'empty', null]
    ];
    for (const [off, type, judge] of cases) {
      const w = custom(d, [{ time: 2, lane: 1 }]);
      run(w, 1.5);
      const e = tapAt(w, 1, 2 + off);
      assert.strictEqual(e.type, type, d + ' off ' + off);
      if (type === 'hit') { assert.strictEqual(e.judge, judge, d + ' off ' + off); near(e.err, off, 1e-9); assert.strictEqual(w.notes[0].state, 'hit'); }
      if (judge === 'early') { assert.strictEqual(e.early, true); assert.strictEqual(w.notes[0].state, 'miss'); assert.strictEqual(w.stats.early, 1); }
      if (type === 'empty') assert.strictEqual(w.notes[0].state, 'live');
    }
    // not tapped → miss right after time + goodWin
    const w = custom(d, [{ time: 2, lane: 0 }]);
    run(w, 2 + W.goodWin - 0.01);
    assert.strictEqual(w.notes[0].state, 'live');
    run(w, 0.03);
    assert.strictEqual(w.notes[0].state, 'miss');
    assert.ok(w.drainEvents().some(e => e.type === 'miss' && e.early === false));
  }
});

test('judging: lanes, earliest note first, one-button, timing offset', () => {
  // wrong lane inside the good window → that note is missed now (wrongLaneMiss, normal)
  let w = custom('normal', [{ time: 2, lane: 0 }]);
  run(w, 1.9); let g = w.groove;
  let wl = tapAt(w, 1, 2.05); assert.strictEqual(wl.type, 'miss'); assert.strictEqual(w.notes[0].state, 'miss'); assert.ok(w.groove < g);
  // …but a wrong-lane tap with the other lane's note outside goodWin is still empty, no penalty
  w = custom('normal', [{ time: 2, lane: 0 }]); run(w, 1.5); g = w.groove;
  assert.strictEqual(tapAt(w, 1, 1.6).type, 'empty'); assert.strictEqual(w.groove, g); assert.strictEqual(w.notes[0].state, 'live');
  // with wrongLaneMiss off: empty, no penalty
  w = new KB.World({ seed: 1, config: { wrongLaneMiss: false } }); w = custom('normal', [{ time: 2, lane: 0 }]); w.cfg.wrongLaneMiss = false;
  run(w, 1.9); g = w.groove;
  assert.strictEqual(tapAt(w, 1, 2).type, 'empty'); assert.strictEqual(w.groove, g);
  // chord exploit (both lanes on the beat) only catches one and misses nothing extra when a note is there; the second tap is empty
  w = custom('normal', [{ time: 2, lane: 1 }]); run(w, 1.9);
  assert.strictEqual(tapAt(w, 0, 2).type, 'miss', 'upper tap on a lower coin = wrong track');
  // two notes in the window → the earliest
  w = custom('normal', [{ time: 2, lane: 0 }, { time: 2.25, lane: 0 }]);
  run(w, 1.9); let e = tapAt(w, 0, 2.12);
  assert.strictEqual(e.id, w.notes[0].id); assert.strictEqual(e.judge, 'good');
  // lane −1 judges either lane, kit moves to the note's lane
  w = custom('normal', [{ time: 2, lane: 1 }]);
  run(w, 1.9); e = tapAt(w, -1, 2.01); assert.strictEqual(e.judge, 'perfect'); assert.strictEqual(w.kit.lane, 1);
  // easy: every tap is lane −1
  w = custom('easy', [{ time: 2, lane: 1 }]);
  run(w, 1.9); e = tapAt(w, 0, 2.0); assert.strictEqual(e.type, 'hit');
  assert.ok(w.drainEvents().some(x => x.type === 'tap' && x.lane === -1));
  // timing offset: tap at songTime with offset = +0.1 s judges at songTime + 0.1
  w = custom('normal', [{ time: 2, lane: 0 }]);
  run(w, 1.9);
  const now = w.songTime + w._acc;
  e = w.tap(0, 2 - now); assert.strictEqual(e.judge, 'perfect'); near(e.err, 0, 1e-9);
  // taps are ignored when dead / cleared
  w._die(); assert.strictEqual(w.tap(0), null);
});

test('judging: pillow bounce (+250 × mult, boss oof) vs poof (dizzy, groove −poofCost)', () => {
  let w = custom('normal', [{ time: 2, lane: 0, kind: 'pillow', tThrow: 2 - 2 * 60 / 84 }]);
  w.level = 1;   // not the first level (no 0.75 cost scaling)
  run(w, 1.95);
  w.mult = 2;
  let e = tapAt(w, 0, 2.05);
  assert.strictEqual(e.type, 'bounce'); assert.strictEqual(e.points, 500); assert.strictEqual(w.notes[0].state, 'bounced');
  assert.strictEqual(w.stats.bounced, 1); assert.strictEqual(w.combo, 1);
  run(w, 0.05); assert.strictEqual(w.boss.frame, 'oof');
  run(w, 1); assert.notStrictEqual(w.boss.frame, 'oof');
  w = custom('normal', [{ time: 2, lane: 1, kind: 'pillow', tThrow: 1 }]);
  w.level = 1;
  run(w, 1.5); const g = w.groove;
  run(w, 1);
  assert.strictEqual(w.notes[0].state, 'poof');
  near(w.groove, g - w.cfg.poofCost, 1e-9);
  assert.strictEqual(w.kit.frame, 'dizzy'); assert.ok(w.kit.dizzy > 0.2);
  assert.ok(w.drainEvents().some(x => x.type === 'poof'));
  run(w, 1); assert.notStrictEqual(w.kit.frame, 'dizzy');
});

// ---------- groove / combo / score ----------
test('groove, combo, multiplier, score rules', () => {
  const times = []; for (let i = 0; i < 45; i++) times.push({ time: 1 + i * 0.5, lane: i % 2, kind: i === 12 ? 'gold' : 'coin' });
  const w = custom('normal', times); w.level = 1;
  w.groove = 0.3;
  let ev = [], mults = [];
  for (let i = 0; i < 45; i++) {
    run(w, (1 + i * 0.5) - w.songTime - 0.02);
    tapAt(w, i % 2, 1 + i * 0.5 + (i === 3 ? 0.1 : 0));
    for (const e of w.drainEvents()) { ev.push(e); if (e.type === 'multup') mults.push([w.combo, e.mult]); }
  }
  assert.deepStrictEqual(mults, [[10, 2], [20, 3], [30, 4]], 'mult every 10, max 4');
  assert.strictEqual(w.mult, 4); assert.strictEqual(w.combo, 45); assert.strictEqual(w.maxCombo, 45);
  const hits = ev.filter(e => e.type === 'hit');
  assert.strictEqual(hits[0].points, 100); assert.strictEqual(hits[3].judge, 'good'); assert.strictEqual(hits[3].points, 50);
  assert.strictEqual(hits[12].kind, 'gold'); assert.strictEqual(hits[12].points, 100 * 2 * 3);
  assert.strictEqual(hits[40].points, 400);
  assert.strictEqual(w.score, hits.reduce((s, h) => s + h.points, 0));
  
  assert.strictEqual(w.groove, 1, 'groove capped at 1');
  // miss → combo / mult reset with combobreak
  w.notes.push({ id: 9999, lane: 0, kind: 'coin', pitch: 0, state: 'live', judge: null, err: 0, tDone: 0, time: w.songTime + 1, beat: 0 });
  run(w, 1.5);
  assert.ok(w.drainEvents().some(e => e.type === 'combobreak' && e.combo === 45), 'combobreak when combo ≥ 5');
  assert.strictEqual(w.combo, 0); assert.strictEqual(w.mult, 1);
  // costs: level 1 scaled ×0.75, others full; groovelow when crossing 0.25
  const a = custom('normal', [{ time: 1 }, { time: 2 }, { time: 3 }]); a.level = 0; a.groove = 0.27;
  run(a, 1.5); near(a.groove, 0.27 - 0.08 * a.cfg.firstLevelCostMul, 1e-9);
  assert.ok(a.drainEvents().some(e => e.type === 'groovelow'));
  const b = custom('normal', [{ time: 1 }]); b.level = 2; b.groove = 0.5;
  run(b, 1.5); near(b.groove, 0.42, 1e-9);
  const h = custom('hard', [{ time: 1 }]); h.level = 2; h.groove = 0.5;
  run(h, 1.5); near(h.groove, 0.39, 1e-9);
  const e = custom('easy', [{ time: 1 }]); e.level = 2; e.groove = 0.5;
  run(e, 1.5); near(e.groove, 0.46, 1e-9);
});

test('dead: groove 0 → dead once; _die(); normal with no taps dies on level 1', () => {
  const w = mk('normal', 3); let deads = 0, t = 0;
  while (w.state !== 'dead' && t < 80) { w.update(1 / 60); t += 1 / 60; deads += w.drainEvents().filter(e => e.type === 'dead').length; }
  assert.strictEqual(w.state, 'dead'); assert.strictEqual(w.level, 0); assert.strictEqual(deads, 1);
  run(w, 3); assert.strictEqual(w.drainEvents().filter(e => e.type === 'dead').length, 0);
  const v = mk('normal', 4); untilPlaying(v); v.drainEvents(); v._die(); v._die();
  assert.strictEqual(v.state, 'dead'); assert.strictEqual(v.groove, 0);
  assert.strictEqual(v.drainEvents().filter(e => e.type === 'dead').length, 1);
});

test('easy: no taps for a whole level 1 → still alive, cleared, groove ≥ 0.05', () => {
  for (let seed = 1; seed <= 5; seed++) {
    const w = mk('easy', seed); let t = 0, min = 1;
    while (w.levelsCleared < 1 && w.state !== 'dead' && t < 120) { w.update(1 / 30); t += 1 / 30; min = Math.min(min, w.groove); w.drainEvents(); }
    assert.notStrictEqual(w.state, 'dead', 'seed ' + seed);
    assert.strictEqual(w.levelsCleared, 1);
    assert.ok(min >= 0.05 - 1e-9, 'floor ' + min);
  }
});

// ---------- flow ----------
test('flow: count-in 3-2-1-Go, beat events, ready → playing at songTime 0, cleared → auto next level (+8 BPM per lap)', () => {
  const w = mk('normal', 8); const ev = w.drainEvents();
  assert.strictEqual(ev.map(e => e.type).join(), 'start,level');
  assert.strictEqual(w.state, 'ready'); near(w.songTime, -4 * 60 / 84, 1e-9);
  const counts = [], beats = []; let goState = null;
  run(w, 3.8, () => { for (const e of w.drainEvents()) { if (e.type === 'count') { counts.push(e.n); if (e.n === 0) goState = w.state; } if (e.type === 'beat') beats.push([e.beat, e.down]); } });
  assert.deepStrictEqual(counts, [3, 2, 1, 0]);
  assert.strictEqual(goState, 'playing');
  assert.deepStrictEqual(beats.slice(0, 6), [[-4, true], [-3, false], [-2, false], [-1, false], [0, true], [1, false]]);
  // finish with a perfect bot → cleared, bonus, auto-advance
  const bot = new KB.Bot(w, { skill: 1 }); let cl = null, lv = null, sd = 0, tClear = 0;
  for (let i = 0; i < 120 * 90 && !lv; i++) {
    bot.step(H); w.update(H);
    for (const e of w.drainEvents()) { if (e.type === 'cleared') { cl = e; tClear = w.time; } if (e.type === 'songdone') sd++; if (e.type === 'level' && cl) lv = e; }
  }
  assert.ok(cl && lv && sd === 1);
  assert.strictEqual(cl.bonus, 1000, 'full groove bonus');
  near(w.time - tClear, 2.6, 0.02, 'cleared lasts 2.6 s');
  assert.strictEqual([lv.level, lv.tod, lv.name, lv.bpm, lv.lap].join(), '1,1,Noon,96,0');
  assert.strictEqual(w.state, 'ready');
  w.startLevel(5); assert.strictEqual(w.bpm, 104); assert.strictEqual(w.lap, 1); assert.strictEqual(w.tod, 1);
});

// ---------- bots ----------
test('bot skill 1 clears 8 levels with all perfects (easy / normal / hard)', () => {
  for (const d of DIFFS) {
    const r = playGame(d, 11, 1, 900, 8);
    assert.strictEqual(r.w.levelsCleared, 8, d);
    const s = r.w.stats;
    assert.strictEqual(s.miss + s.good + s.poofed, 0, d + ' ' + JSON.stringify(s));
    assert.ok(s.perfect > 300 && s.bounced >= 8 * 3, d + ' ' + JSON.stringify(s));
    assert.strictEqual(r.w.mult, 4);
  }
});

test('spam bot (both lanes every 50 ms) does badly: dies on normal, poor on easy', () => {
  for (const d of ['normal', 'hard']) {
    const w = mk(d, 12); let t = 0, k = 0;
    while (w.state !== 'dead' && t < 120) { if (k++ % 3 === 0) { w.tap(0); w.tap(1); } w.update(1 / 60); t += 1 / 60; w.drainEvents(); }
    assert.strictEqual(w.state, 'dead', d);
    assert.strictEqual(w.level, 0, d);
    assert.ok(w.stats.early > w.stats.perfect, d + ' ' + JSON.stringify(w.stats));
  }
  const e = mk('easy', 12); let t = 0, k = 0;
  while (e.levelsCleared < 1 && e.state !== 'dead' && t < 120) { if (k++ % 3 === 0) e.tap(0); e.update(1 / 60); t += 1 / 60; e.drainEvents(); }
  assert.ok(e.stats.early > e.stats.perfect, 'easy spam ' + JSON.stringify(e.stats));
});

test('kid-like bots: skill 0.5 clears level 1 normal; lower skill → lower score; easy forgiving', () => {
  let wins = 0; const sc = {};
  for (let seed = 1; seed <= 6; seed++) { const r = playGame('normal', seed, 0.5, 200, 1); if (r.w.levelsCleared >= 1) wins++; }
  assert.strictEqual(wins, 6, 'skill 0.5 normal level 1 wins');
  for (const sk of [0.2, 0.6, 0.95]) { sc[sk] = 0; for (let seed = 1; seed <= 3; seed++) sc[sk] += playGame('normal', seed, sk, 200, 1).w.stats.perfect; }
  assert.ok(sc[0.2] < sc[0.6] && sc[0.6] < sc[0.95], JSON.stringify(sc));
  let ewins = 0; for (let seed = 1; seed <= 4; seed++) if (playGame('easy', seed, 0.15, 400, 2).w.levelsCleared >= 2) ewins++;
  assert.ok(ewins >= 3, 'easy skill 0.15 clears 2 levels: ' + ewins + '/4');
});

// ---------- kit / boss motion ----------
test('kit: lane easing quick, smooth, bounded (critically damped, no overshoot)', () => {
  let maxStep = 0, t90 = -1;
  const v = custom('normal', []); v.tap(1);
  for (let i = 0; i < 60; i++) {
    const p0 = v.kit.pos; v.update(H);
    assert.ok(v.kit.pos >= p0 - 1e-12 && v.kit.pos <= 1, 'monotone, ≤ 1');
    assert.strictEqual(v.kit._ppos, p0);
    maxStep = Math.max(maxStep, v.kit.pos - p0);
    if (t90 < 0 && v.kit.pos >= 0.9) t90 = (i + 1) * H;
  }
  assert.ok(t90 > 0.03 && t90 <= 0.08, 'reaches 90 % in ' + t90);
  assert.ok(maxStep < 0.26, 'max step ' + maxStep);
  // frantic alternation stays in [0,1]
  for (let i = 0; i < 600; i++) { if (i % 3 === 0) v.tap(i % 2); v.update(H); assert.ok(v.kit.pos >= 0 && v.kit.pos <= 1); }
  // frames
  const f = custom('normal', [{ time: 1, lane: 0 }]); run(f, 0.98); tapAt(f, 0, 1);
  f.update(H); assert.strictEqual(f.kit.frame, 'reach', 'reach shows first even on a perfect');
  run(f, 0.1); assert.strictEqual(f.kit.frame, 'happy');
  run(f, 0.4); assert.strictEqual(f.kit.frame, 'idle');
  f.tap(1); f.update(H); assert.strictEqual(f.kit.frame, 'reach');
});

test('chart: no 0.25 s cross-lane jump after a bar ending on beat 3.5 (normal/easy); deadT', () => {
  let jumps = 0, checked = 0;
  for (const d of ['normal', 'easy']) for (let seed = 1; seed <= 60; seed++) for (const L of [1, 3, 7]) {
    const w = new KB.World({ seed, config: KB.DIFFICULTY[d] }); w.reset(); w.startLevel(L);
    const ns = w.notes;
    for (let i = 1; i < ns.length; i++) {
      const gap = ns[i].time - ns[i - 1].time;
      if (gap < w.beatLen * 0.75 && ns[i].lane !== ns[i - 1].lane && ns[i].kind !== 'pillow' && ns[i - 1].kind !== 'pillow') jumps++;
      checked++;
    }
  }
  assert.ok(checked > 1000); assert.strictEqual(jumps, 0, 'fast cross-lane jumps: ' + jumps);
  const w = mk('normal', 3); assert.strictEqual(w.deadT, -1); w._die(); assert.strictEqual(w.deadT, 0); w.update(0.5); assert.ok(w.deadT > 0.45);
});

test('boss: away → enter → hover → leave → away; smooth path; throw / bossin / bossout events; next countdown', () => {
  const w = mk('normal', 14); const bot = new KB.Bot(w, { skill: 1 });
  const seq = [], ev = { bossin: 0, bossout: 0, throw: 0 }; let maxD = 0, prev = null, sawThrow = false, minNext = 1e9, onScreenMaxX = 0;
  for (let i = 0; i < 120 * 62; i++) {
    bot.step(H); w.update(H);
    const b = w.boss;
    if (seq[seq.length - 1] !== b.state) seq.push(b.state);
    if (prev && b.state !== 'away' && prev.s !== 'away') maxD = Math.max(maxD, Math.hypot(b.x01 - prev.x, b.y01 - prev.y));
    if (b.state === 'hover') { assert.ok(b.x01 > 0.6 && b.x01 < 0.95 && b.y01 > 0.1 && b.y01 < 0.35, 'hover pos ' + b.x01 + ',' + b.y01); }
    if (b.frame === 'throw') sawThrow = true;
    if (b.state === 'away' && w.state === 'playing') minNext = Math.min(minNext, b.next);
    prev = { x: b.x01, y: b.y01, s: b.state };
    for (const e of w.drainEvents()) if (ev[e.type] !== undefined) ev[e.type]++;
    if (w.state === 'cleared') break;
  }
  assert.deepStrictEqual(seq.slice(0, 9), ['away', 'enter', 'hover', 'leave', 'away', 'enter', 'hover', 'leave', 'away']);
  assert.deepStrictEqual(ev, { bossin: 2, bossout: 2, throw: 6 });
  assert.ok(maxD < 0.02, 'smooth boss path, max step ' + maxD);
  assert.ok(sawThrow);
  assert.ok(minNext < 0.05, 'next counts down to 0');
  // debug poke: boss.next = 0.01 (main.js bossNow) → a real visit with 3 pillows
  const v = mk('normal', 15); untilPlaying(v); run(v, 2); v.drainEvents();
  v.boss.next = 0.01; run(v, 0.1);
  assert.strictEqual(v.boss.state, 'enter');
  assert.strictEqual(v.notes.filter(n => n.kind === 'pillow' && n.time < 12).length, 3);
  for (let i = 1; i < v.notes.length; i++) assert.ok(v.notes[i].time >= v.notes[i - 1].time);
});

// ---------- weather ----------
test('weather: bounded particle counts for all levels, sizes, hand-overs and burst spam; valid fields', () => {
  const sizes = [[960, 540], [1280, 540], [560, 1600], [720, 1600], [960, 960], [320, 480]];
  for (const [W, Hh] of sizes) {
    const wx = new KB.Weather({ width: W, height: Hh, seed: 3 });
    let max = 0;
    for (let L = 0; L < 8; L++) {
      wx.setLevel(L % 4, { instant: L === 0 });
      for (let i = 0; i < 60 * 6; i++) {
        if (i % 7 === 0) wx.burst(['sparkle', 'feather', 'confetti', 'star', 'note', 'dot'][i % 6], W / 2, Hh / 2, 12);
        if (i === 100) wx.resize(Hh, W);
        if (i === 200) wx.resize(W, Hh);
        wx.update(1 / 60, { beat: i / 50, kitX: W * 0.2, kitY: Hh * 0.6 });
        max = Math.max(max, wx.particles.length);
        if (i % 60 === 0) for (const p of wx.particles) {
          assert.ok(isFinite(p.x) && isFinite(p.y) && p.size > 0 && p.alpha >= 0 && p.alpha <= 1 && isFinite(p.rot), JSON.stringify(p));
          assert.ok(p.layer === 'back' || p.layer === 'front');
          assert.ok(KB.Weather.SPRITES.includes(p.sprite), p.sprite);
        }
      }
      const amb = wx.particles.filter(p => !p.fx).length;
      assert.ok(amb > 8, W + 'x' + Hh + ' L' + L + ' has ambient particles: ' + amb);
    }
    assert.ok(max < 140, W + 'x' + Hh + ' max ' + max);
  }
  const wx = new KB.Weather({ seed: 1 });
  wx.setLevel(3, { instant: true }); wx.update(0.1);
  assert.strictEqual(wx.ambient.glow, 1); assert.ok(/rgba/.test(wx.ambient.tint));
  wx.setLevel(0); for (let i = 0; i < 200; i++) wx.update(1 / 60);
  assert.strictEqual(wx.ambient.glow, 0); assert.strictEqual(wx.ambient.shafts.length, 3);
  assert.ok(wx.particles.filter(p => !p.fx && p.sprite === 'star').length === 0, 'night stars faded out');
});

test('weather: deterministic for any dt partition; pulse swells particles', () => {
  function go(dt) { const wx = new KB.Weather({ seed: 9 }); for (let i = 0, n = Math.round(5 / dt); i < n; i++) wx.update(dt, { kitX: 190, kitY: 300 }); return J(wx.particles); }
  const a = go(1 / 60), b = go(1 / 30), c = go(1 / 120);
  assert.deepStrictEqual(a.length, b.length);
  assert.deepStrictEqual(a, c);
  const wx = new KB.Weather({ seed: 2 }); wx.setLevel(3, { instant: true }); wx.update(1 / 60);
  const s0 = wx.particles.map(p => p.size); wx.pulse(); wx.update(1 / 60);
  const s1 = wx.particles.map(p => p.size); let bigger = 0;
  for (let i = 0; i < s0.length; i++) if (s1[i] > s0[i] * 1.05) bigger++;
  assert.ok(bigger > s0.length * 0.6, 'pulse: ' + bigger + '/' + s0.length);
});

// ---------- performance ----------
test('performance: 10 minutes of play (bot + weather) simulate in < 2 s', () => {
  const t0 = Date.now();
  const r = playGame('hard', 21, 0.97, 600, undefined, true);
  const ms = Date.now() - t0;
  assert.ok(r.t >= 599 || r.w.state === 'dead', 't ' + r.t);
  assert.ok(ms < 2000, ms + ' ms');
  console.log('      (10 min sim: ' + ms + ' ms, levels cleared ' + r.w.levelsCleared + ', score ' + r.w.score + ')');
});

// ---------- run ----------
let fail = 0;
for (const t of tests) {
  try { t.fn(); console.log('PASS  ' + t.name); }
  catch (e) { fail++; console.log("FAIL  " + t.name + "\n      " + (e && e.stack ? e.stack.split("\n").slice(0, 14).join('\n      ') : e)); }
}
console.log('\n' + (tests.length - fail) + '/' + tests.length + ' passed');
process.exit(fail ? 1 : 0);
