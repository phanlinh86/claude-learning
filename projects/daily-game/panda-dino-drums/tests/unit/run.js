#!/usr/bin/env node
// Momo's Dino Drums — headless unit tests for rng / world / weather / bot (node, no deps).
// Run from projects/daily-game/panda-dino-drums:   node tests/unit/run.js
'use strict';
const assert = require('assert');
const { load } = require('./load');

const DD = load();
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const H = 1 / 120;
const J = v => JSON.parse(JSON.stringify(v));
const near = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, (m || '') + ' got ' + a + ' want ' + b + ' ±' + tol);
const DIFFS = ['easy', 'normal', 'hard'];
const mean = a => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);

// ---------- helpers ----------
function mk(diff, seed, extra) {
  return new DD.World({ seed: seed || 1, config: Object.assign({}, DD.DIFFICULTY[diff || 'normal'], extra || {}) });
}
function run(w, seconds, each) {
  const n = Math.round(seconds / H);
  for (let i = 0; i < n; i++) { if (each && each(i) === false) return i; w.update(H); }
  return n;
}
function untilPlaying(w) { let k = 0; while (w.state === 'ready' && k++ < 10000) w.update(H); assert.strictEqual(w.state, 'playing'); }
// a playing world whose chart is replaced by the given notes (time in s), Pip away
function custom(diff, list, extra) {
  const w = mk(diff, 5, Object.assign({ readyBeats: 0 }, extra));
  let id = 1000;
  w.notes = list.map(n => Object.assign({ id: id++, lane: 0, kind: 'gem', pitch: 0, state: 'live', judge: null, err: 0, tDone: 0, beat: n.time / w.beatLen }, n));
  w._first = 0; w._songEnd = 1e9; w.songLen = 1e9;
  w.drainEvents();
  return w;
}
function tapAt(w, lane, t) { return w.tap(lane, t - (w.songTime + w._acc)); }
function playGame(diff, seed, skill, maxS, stopLevels, withWeather) {
  const w = mk(diff, seed);
  const bot = new DD.Bot(w, { skill, seed: seed * 3 + 1 });
  const wx = withWeather ? new DD.Weather({ width: 960, height: 540, seed }) : null;
  let t = 0, ev = [], dt = 1 / 60;
  maxS = maxS || 600;
  while (w.state !== 'dead' && t < maxS && !(stopLevels !== undefined && w.levelsCleared >= stopLevels)) {
    bot.step(dt); w.update(dt);
    const e = w.drainEvents(); for (const x of e) ev.push(x);
    if (wx) { for (const x of e) { if (x.type === 'level') wx.setLevel(x.tod); if (x.type === 'hit') wx.burst('sparkle', 200, 300, 6); if (x.type === 'helpersave') wx.burst('feather', 200, 300, 8); } wx.update(dt, { beat: w.beat, kitX: 190, kitY: 300 }); }
    t += dt;
  }
  return { w, t, bot, ev };
}
function charts(diff, seed, levels) {
  const w = mk(diff, seed), out = [];
  for (const L of levels) { w.startLevel(L); out.push({ L, notes: J(w.notes), songLen: w.songLen, bars: w.bars, beatLen: w.beatLen, cfg: w.cfg }); }
  return out;
}

// ---------- RNG / tables ----------
test('rng: deterministic, in range, API', () => {
  const a = new DD.RNG(42), b = new DD.RNG(42), c = new DD.RNG('x');
  for (let i = 0; i < 300; i++) { const x = a.next(); assert.strictEqual(x, b.next()); assert.ok(x >= 0 && x < 1); }
  for (const f of ['next', 'range', 'int', 'pick', 'chance', 'gauss', 'fork']) assert.strictEqual(typeof c[f], 'function', f);
  for (let i = 0; i < 300; i++) { const k = c.int(4); assert.ok(k >= 0 && k < 4 && k === (k | 0)); const m = c.int(2, 5); assert.ok(m >= 2 && m <= 5); }
  let s = 0, s2 = 0; for (let i = 0; i < 4000; i++) { const g = c.gauss(); s += g; s2 += g * g; }
  near(s / 4000, 0, 0.08, 'gauss mean'); near(Math.sqrt(s2 / 4000), 1, 0.08, 'gauss sd');
});

test('tables: CONFIG (helper keys in, boss keys out), DIFFICULTY (easy one-button, helperCombo 4), LEVELS', () => {
  assert.ok(DD.CONFIG && DD.CONFIG.step <= 1 / 120 + 1e-12);
  assert.strictEqual(DD.DIFFICULTY.easy.oneButton, true);
  assert.ok(DD.DIFFICULTY.normal && DD.DIFFICULTY.hard);
  assert.deepStrictEqual(J(DD.LEVELS), [{ key: 'river', name: 'Riverbank', floor: 1, bpm: 84 }, { key: 'ferns', name: 'Fern Canopy', floor: 2, bpm: 96 },
    { key: 'nests', name: 'Nest Ledge', floor: 3, bpm: 104 }, { key: 'sky', name: 'Sky Roof', floor: 4, bpm: 112 }]);
  const C = DD.CONFIG;
  assert.deepStrictEqual([C.helperCombo, C.helperEnter, C.helperStay, C.helperCooldown, C.helperMult, C.helperSaveTime], [5, 1.0, 20, 6, 2, 0.6]);
  assert.strictEqual(mk('easy').cfg.helperCombo, 4);
  for (const k of Object.keys(C)) assert.ok(!/boss|pillow|poof|bounce|oof|throw/i.test(k), 'old boss key ' + k);
  for (const d of DIFFS) for (const k of Object.keys(DD.DIFFICULTY[d])) assert.ok(k in C, d + ' overrides unknown key ' + k);
  const n = mk('normal'), e = mk('easy'), h = mk('hard');
  assert.strictEqual([n.cfg.perfectWin, n.cfg.goodWin, n.cfg.earlyWin].join(), '0.075,0.17,0.34');
  assert.strictEqual(n.cfg.wrongLaneMiss, true); assert.strictEqual(new DD.World({ seed: 1, config: DD.DIFFICULTY.easy }).cfg.wrongLaneMiss, false);
  assert.strictEqual(new DD.World({ seed: 1, config: DD.DIFFICULTY.easy }).cfg.maxDensity, 4, 'easy maxDensity applies');
  assert.strictEqual([e.cfg.perfectWin, e.cfg.goodWin, e.cfg.earlyWin].join(), '0.1,0.22,0.34');
  assert.strictEqual([h.cfg.perfectWin, h.cfg.goodWin, h.cfg.earlyWin].join(), '0.055,0.09,0.28');   // playtest tuning
  assert.deepStrictEqual([h.cfg.missCost, h.cfg.helperCooldown, n.cfg.helperCooldown, e.cfg.helperCooldown], [0.13, 12, 6, 6], 'Hard: dearer misses, Pip less often');
  assert.strictEqual(n.cfg.densStart.join(), '1.5,1.8,2.3,2.9', 'Normal: gentler floors 2–3');
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
    return { score: w.score, groove: w.groove, ev: J(ev), notes: J(w.notes), kit: J(w.kit), helper: J(w.helper), st: w.state, stats: J(w.stats) };
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
      assert.ok(['gem', 'gold'].includes(n.kind), n.kind);
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
    assert.strictEqual(N.filter(n => n.beat >= (c.bars - 1) * 4).length, 1, tag + ' last bar single gem');
    near(c.songLen, last.time + bl, 1e-9);
    const bar = b => N.filter(n => Math.floor(n.beat / 4) === b).length;
    assert.strictEqual(bar(0), 1, tag + ' bar 0');
    assert.ok(bar(1) <= 3, tag + ' bar 1');
    if (c.L === 0) assert.strictEqual(bar(1), 2, tag + ' level 1 bar 1 = two gems');
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
      for (const n of c.notes) { if (n.kind === 'gold') gold++; coins++; }
      const half = c.notes.filter(n => n.time < c.songLen / 2).length;
      const half2 = c.notes.filter(n => n.time >= c.songLen / 2).length;
      assert.ok(half2 >= half * 0.95 || d === 'easy', 'ramps within the song ' + d + ' L' + c.L + ' ' + half + '/' + half2);
    });
    for (let L = 1; L < 4; L++) assert.ok(avg[d][L] > avg[d][L - 1] - 0.15, d + ' density by level ' + avg[d]);
    assert.ok(avg[d][3] > avg[d][0] + 0.4, d + ' sky roof denser than riverbank');
  }
  for (let L = 0; L < 4; L++) assert.ok(avg.easy[L] <= avg.normal[L] + 0.05 && avg.normal[L] < avg.hard[L], 'by difficulty ' + L);
  assert.ok(avg.normal[0] < 2.4, 'level 1 normal sparse: ' + avg.normal[0].toFixed(2) + ' notes/bar');
  const g = gold / coins; assert.ok(g > 0.03 && g < 0.09, 'gold ' + g);
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
  // …but a wrong-lane tap with the other lane's note outside goodWin is still empty, no miss (floor 2: no empty-tap cost)
  w = custom('normal', [{ time: 2, lane: 0 }]); w.level = 1; run(w, 1.5); g = w.groove;
  assert.strictEqual(tapAt(w, 1, 1.6).type, 'empty'); assert.strictEqual(w.groove, g); assert.strictEqual(w.notes[0].state, 'live');
  // with wrongLaneMiss off: empty, no penalty
  w = new DD.World({ seed: 1, config: { wrongLaneMiss: false } }); w = custom('normal', [{ time: 2, lane: 0 }]); w.cfg.wrongLaneMiss = false; w.level = 1;
  run(w, 1.9); g = w.groove;
  assert.strictEqual(tapAt(w, 1, 2).type, 'empty'); assert.strictEqual(w.groove, g);
  // Normal floor 1 only (playtest §7, anti-metronome): an empty tap costs emptyCost × firstLevelCostMul; Easy / Hard / floor 2 nothing
  w = custom('normal', [{ time: 2, lane: 0 }]); run(w, 1.5); g = w.groove;
  assert.strictEqual(tapAt(w, 1, 1.6).type, 'empty'); near(g - w.groove, w.cfg.emptyCost * w.cfg.firstLevelCostMul, 1e-9, 'floor-1 empty tap cost');
  assert.ok(w.cfg.emptyCost > 0 && w.cfg.emptyCost <= 0.02);
  for (const d of ['easy', 'hard']) { w = custom(d, [{ time: 2, lane: 0 }]); run(w, 1.5); g = w.groove; tapAt(w, 1, 1.0); assert.strictEqual(w.groove, g, d + ': empty tap free'); }
  // chord exploit (both lanes on the beat) only catches one and misses nothing extra when a note is there; the second tap is empty
  w = custom('normal', [{ time: 2, lane: 1 }]); run(w, 1.9);
  assert.strictEqual(tapAt(w, 0, 2).type, 'miss', 'upper tap on a lower gem = wrong rail');
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

// ---------- groove / combo / score ----------
test('groove, combo, multiplier, score rules', () => {
  const times = []; for (let i = 0; i < 45; i++) times.push({ time: 1 + i * 0.5, lane: i % 2, kind: i === 12 ? 'gold' : 'gem' });
  const w = custom('normal', times, { helperCombo: 1e9 }); w.level = 1;   // Pip has its own tests
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
  w.notes.push({ id: 9999, lane: 0, kind: 'gem', pitch: 0, state: 'live', judge: null, err: 0, tDone: 0, time: w.songTime + 1, beat: 0 });
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
  run(h, 1.5); near(h.groove, 0.37, 1e-9);   // Hard missCost 0.13 (playtest)
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
  const bot = new DD.Bot(w, { skill: 1 }); let cl = null, lv = null, sd = 0, tClear = 0;
  for (let i = 0; i < 120 * 90 && !lv; i++) {
    bot.step(H); w.update(H);
    for (const e of w.drainEvents()) { if (e.type === 'cleared') { cl = e; tClear = w.time; } if (e.type === 'songdone') sd++; if (e.type === 'level' && cl) lv = e; }
  }
  assert.ok(cl && lv && sd === 1);
  assert.strictEqual(cl.bonus, 1000, 'full groove bonus');
  near(w.time - tClear, 2.6, 0.02, 'cleared lasts 2.6 s');
  assert.strictEqual([lv.level, lv.tod, lv.name, lv.bpm, lv.lap].join(), '1,1,Fern Canopy,96,0');
  assert.strictEqual(w.state, 'ready');
  w.startLevel(5); assert.strictEqual(w.bpm, 104); assert.strictEqual(w.lap, 1); assert.strictEqual(w.tod, 1);
});

// ---------- bots ----------
test('bot skill 1 clears 8 levels with all perfects (easy / normal / hard)', () => {
  for (const d of DIFFS) {
    const r = playGame(d, 11, 1, 900, 8);
    assert.strictEqual(r.w.levelsCleared, 8, d);
    const s = r.w.stats;
    assert.strictEqual(s.miss + s.good + s.saved, 0, d + ' ' + JSON.stringify(s));
    assert.ok(s.perfect > 300 && s.helpers >= 8, d + ' Pip visits every song ' + JSON.stringify(s));
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

// ---------- Momo motion ----------
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
    const w = new DD.World({ seed, config: DD.DIFFICULTY[d] }); w.reset(); w.startLevel(L);
    const ns = w.notes;
    for (let i = 1; i < ns.length; i++) {
      const gap = ns[i].time - ns[i - 1].time;
      if (gap < w.beatLen * 0.75 && ns[i].lane !== ns[i - 1].lane) jumps++;
      checked++;
    }
  }
  assert.ok(checked > 1000); assert.strictEqual(jumps, 0, 'fast cross-lane jumps: ' + jumps);
  const w = mk('normal', 3); assert.strictEqual(w.deadT, -1); w._die(); assert.strictEqual(w.deadT, 0); w.update(0.5); assert.ok(w.deadT > 0.45);
});

// ---------- Pip the helper ----------
// a regular stream of gems every `gap` s from t = 1, alternating lanes
function stream(diff, count, gap, extra) {
  const list = []; for (let i = 0; i < count; i++) list.push({ time: 1 + i * gap, lane: i % 2 });
  return custom(diff, list, extra);
}
// perfectly catch note i (advance to just before it, tap on time); returns [tapResult, events]
function catchNote(w, i, off) {
  const n = w.notes[i];
  run(w, n.time - (w.songTime + w._acc) - 0.02);
  const e = tapAt(w, n.lane, n.time + (off || 0));
  return [e, w.drainEvents()];
}
function skipNote(w, i) { const n = w.notes[i]; run(w, n.time + w.cfg.goodWin + 0.03 - w.songTime); return w.drainEvents(); }

test('helper: Pip comes at combo 5 (easy 4), not before; helperin once; stats.helpers', () => {
  for (const [d, need] of [['normal', 5], ['hard', 5], ['easy', 4]]) {
    const w = stream(d, 12, 0.6);
    for (let i = 0; i < need - 1; i++) { const [e, ev] = catchNote(w, i); assert.strictEqual(e.type, 'hit'); assert.strictEqual(e.helper, false); assert.ok(!ev.some(x => x.type === 'helperin')); }
    assert.strictEqual(w.helper.state, 'away', d);
    const [e5, ev5] = catchNote(w, need - 1);
    assert.strictEqual(e5.helper, false, d + ' the calling catch is not doubled');
    assert.strictEqual(ev5.filter(x => x.type === 'helperin').length, 1, d);
    assert.strictEqual(w.helper.state, 'enter'); assert.strictEqual(w.stats.helpers, 1);
    near(w.helper.left, 20, 1e-9);
    assert.strictEqual(w.helper.frame, 'fly');
    catchNote(w, need); catchNote(w, need + 1);       // 1.2 s later: perched
    assert.strictEqual(w.helper.state, 'with', d); assert.strictEqual(w.helper.frame, 'cheer');
  }
});

test('helper: doubles points while entering and perched (hit.helper), stacks with mult and gold', () => {
  const list = []; for (let i = 0; i < 14; i++) list.push({ time: 1 + i * 0.5, lane: 0, kind: i === 6 ? 'gold' : 'gem' });
  const w = custom('normal', list);
  const pts = [];
  for (let i = 0; i < 14; i++) { const [e] = catchNote(w, i); pts.push([e.points, e.helper, w.helper.state]); }
  assert.deepStrictEqual(pts.slice(0, 5).map(p => p[0]), [100, 100, 100, 100, 100]);
  assert.strictEqual(pts[5][2], 'enter'); assert.deepStrictEqual(pts[5].slice(0, 2), [200, true], 'doubled while entering');
  assert.deepStrictEqual(pts[6].slice(0, 2), [600, true], 'gold ×3 × Pip ×2');
  assert.strictEqual(pts[8][2], 'with'); assert.strictEqual(pts[8][0], 200);
  assert.deepStrictEqual(pts[10].slice(0, 2), [400, true], 'mult ×2 (combo 11) × Pip ×2');
});

test('helper: saves exactly one late miss — no groove loss, combo kept, no break — then swoops and leaves', () => {
  const w = stream('normal', 20, 0.6); w.level = 1;
  for (let i = 0; i < 7; i++) catchNote(w, i);
  assert.strictEqual(w.helper.state, 'with');
  const g = w.groove, combo = w.combo, score = w.score;
  const ev = skipNote(w, 7);
  const sv = ev.filter(x => x.type === 'helpersave');
  assert.strictEqual(sv.length, 1, JSON.stringify(ev.map(x => x.type)));
  const n = w.notes.find(x => x.id === sv[0].id);
  assert.strictEqual(n.state, 'saved'); assert.strictEqual(sv[0].lane, n.lane);
  assert.ok(!ev.some(x => x.type === 'miss' || x.type === 'combobreak'));
  assert.strictEqual(w.notes.filter(x => x.state === 'saved').length, 1);
  assert.strictEqual(w.groove, g); assert.strictEqual(w.combo, combo); assert.strictEqual(w.score, score);
  assert.strictEqual(w.stats.saved, 1); assert.strictEqual(w.stats.miss, 0);
  assert.strictEqual(w.helper.state, 'save'); assert.strictEqual(w.helper.saveLane, n.lane);
  // during the swoop Pip does not double and cannot save again
  const k = w.notes.findIndex(x => x.state === 'live');
  const ev2 = skipNote(w, k);
  assert.ok(ev2.some(x => x.type === 'miss'), 'second miss is a real miss');
  assert.strictEqual(w.stats.saved, 1); assert.strictEqual(w.combo, 0);
  // swoop 0.6 s → leave (helperout) → 1 s → away with cooldown 6
  const outs = []; let tLeave = -1, tAway = -1;
  run(w, 2, () => { for (const e of w.drainEvents()) if (e.type === 'helperout') outs.push(w.time); if (tLeave < 0 && w.helper.state === 'leave') tLeave = w.time - w.helper.t; if (tAway < 0 && w.helper.state === 'away') tAway = w.time; });
  const outsAll = outs.length + ev2.filter(x => x.type === 'helperout').length;
  assert.strictEqual(outsAll, 1, 'helperout once');
  assert.ok(tAway > 0); near(tAway - tLeave, 1.0, 0.02, 'leave lasts 1 s');
  assert.ok(w.helper.cool > 4.5 && w.helper.cool <= 6);
});

test('helper: an early miss (anti-spam) is saved too; tap returns the helpersave event', () => {
  const w = stream('normal', 10, 0.6);
  for (let i = 0; i < 5; i++) catchNote(w, i);
  assert.strictEqual(w.helper.state, 'enter');
  const n = w.notes[5]; run(w, n.time - w.songTime - 0.4);
  const e = tapAt(w, n.lane, n.time - 0.25);
  assert.strictEqual(e.type, 'helpersave'); assert.strictEqual(e.early, true); assert.strictEqual(n.state, 'saved');
  assert.strictEqual(w.stats.early, 0); assert.strictEqual(w.combo, 5);
});

test('helper: cooldown respected; a running streak calls Pip again after it; stay limit 20 s', () => {
  const w = stream('normal', 140, 0.5);
  const log = []; let prev = 'away';
  for (let i = 0; i < 140; i++) {
    catchNote(w, i);
    if (w.helper.state !== prev) { log.push([w.helper.state, +w.songTime.toFixed(2), w.helper.cool]); prev = w.helper.state; }
    if (w.helper.state === 'enter' || w.helper.state === 'with') assert.strictEqual(w.helper.cool, 0);
  }
  const ins = log.filter(l => l[0] === 'enter'), aways = log.filter(l => l[0] === 'away');
  assert.ok(ins.length >= 3, JSON.stringify(log));
  // stay: enter (1 s) + with 20 s ≈ 21 s (± one note gap of sampling)
  const lv = log.find(l => l[0] === 'leave'); near(lv[1] - ins[0][1], 21, 0.55, 'stay 20 s');
  // after each away, the next enter comes no earlier than the 6 s cooldown
  for (let k = 0; k < aways.length && k + 1 < ins.length; k++) assert.ok(ins[k + 1][1] - aways[k][1] >= 6 - 0.51, 'cooldown ' + JSON.stringify(log));
  assert.strictEqual(w.stats.helpers, ins.length);
});

test('helper: after a broken streak Pip needs 5 new catches; never during the last 4 s', () => {
  const w = stream('normal', 30, 0.6);
  for (let i = 0; i < 3; i++) catchNote(w, i);
  skipNote(w, 3);                                     // miss (Pip away) → combo 0
  assert.strictEqual(w.combo, 0);
  for (let i = 4; i < 8; i++) catchNote(w, i);
  assert.strictEqual(w.helper.state, 'away');
  catchNote(w, 8); assert.strictEqual(w.helper.state, 'enter');
  // song nearly over → no call
  const v = stream('normal', 10, 0.6); v.songLen = 1 + 5 * 0.6 + 3;
  for (let i = 0; i < 5; i++) catchNote(v, i);
  assert.strictEqual(v.helper.state, 'away', 'only ' + (v.songLen - v.songTime).toFixed(2) + ' s left');
});

test('helper: leaves at song end and on death; never present in ready; resets on startLevel', () => {
  // real songs with a perfect bot: Pip visits each song, is gone before the next count-in
  const w = mk('normal', 31); const bot = new DD.Bot(w, { skill: 1 });
  let outAtEnd = 0, readyBad = 0, prevState = w.state;
  for (let i = 0; i < 120 * 300 && w.levelsCleared < 4; i++) {
    bot.step(H); w.update(H);
    const ev = w.drainEvents();
    const sd = ev.findIndex(e => e.type === 'songdone');
    if (sd >= 0) { assert.ok(ev.slice(0, sd).some(e => e.type === 'helperout') || w.helper.state === 'away' || w.helper.state === 'leave'); if (w.helper.state === 'leave') outAtEnd++; }
    if (w.state === 'ready' && w.helper.state !== 'away') readyBad++;
    if (w.state === 'cleared') assert.ok(w.helper.state === 'leave' || w.helper.state === 'away');
    prevState = w.state;
  }
  assert.strictEqual(w.levelsCleared, 4); assert.strictEqual(readyBad, 0);
  assert.ok(outAtEnd >= 1, 'Pip was there at a song end at least once');
  // death
  const d = stream('normal', 12, 0.6);
  for (let i = 0; i < 6; i++) catchNote(d, i);
  assert.notStrictEqual(d.helper.state, 'away');
  d._die(); const ev = d.drainEvents();
  assert.ok(ev.some(e => e.type === 'helperout')); assert.strictEqual(d.helper.state, 'leave');
  run(d, 1.2); assert.strictEqual(d.helper.state, 'away');
  // startLevel mid-visit
  const s = stream('normal', 12, 0.6); for (let i = 0; i < 6; i++) catchNote(s, i);
  s.startLevel(2); assert.strictEqual(s.helper.state, 'away'); assert.ok(s.drainEvents().some(e => e.type === 'helperout'));
  const r = mk('normal', 3); r.startLevel(1); assert.strictEqual(r.state, 'ready');
  assert.strictEqual(r.helperNow(), false, 'helperNow is ignored in ready');
  untilPlaying(r); assert.strictEqual(r.helperNow(), true); assert.strictEqual(r.helper.state, 'enter'); assert.strictEqual(r.helperNow(), false);
});

test('helper motion: smooth arc in, bob on the beat while perched, swoop to the lane drum and back, _px01/_py01', () => {
  for (const lane of [0, 1]) {
    const w = stream('normal', 30, 0.6);
    for (let i = 0; i < 5; i++) catchNote(w, i);
    let prev = [w.helper.x01, w.helper.y01], maxD = 0, minY = 9, maxY = -9, onBeat = [], deepest = null, sawSave = false;
    const A = DD.World.HELPER;
    let k = w.notes.findIndex(n => n.state === 'live' && n.lane === lane && n.time > w.songTime + 4);
    for (let i = 0; i < 120 * 12; i++) {
      // catch everything except note k (it will be saved)
      const nx = w.notes.find(n => n.state === 'live' && n.time <= w.songTime + 1.5 * H && n.time > w.songTime - 0.05);
      if (nx && w.notes.indexOf(nx) !== k) tapAt(w, nx.lane, nx.time);
      w.update(H); w.drainEvents();
      const hp = w.helper;
      assert.strictEqual(hp._px01, prev[0]); assert.strictEqual(hp._py01, prev[1]);
      if (hp.state !== 'away') maxD = Math.max(maxD, Math.hypot(hp.x01 - prev[0], hp.y01 - prev[1]));
      if (hp.state === 'with' && hp.t > 0.35) {
        minY = Math.min(minY, hp.y01); maxY = Math.max(maxY, hp.y01);
        const fb = w.beat - Math.round(w.beat); if (Math.abs(fb) < 0.01) onBeat.push(hp.y01);
        near(hp.x01, A.perch[0], 1e-9);
      }
      if (hp.state === 'save') { sawSave = true; assert.strictEqual(hp.saveLane, lane); if (!deepest || hp.y01 > deepest[1]) deepest = [hp.x01, hp.y01]; }
      prev = [hp.x01, hp.y01];
      if (sawSave && hp.state === 'away') break;
    }
    assert.ok(sawSave, 'lane ' + lane + ' saved');
    assert.ok(maxD < 0.06, 'smooth path, max step ' + maxD);
    assert.ok(maxY <= A.perch[1] + 1e-9 && minY < A.perch[1] - 0.025, 'bob ' + minY + '..' + maxY);
    assert.ok(onBeat.length > 5 && onBeat.every(y => Math.abs(y - A.perch[1]) < 0.003), 'lands on the beat');
    near(deepest[1], A.drumY[lane], 0.02, 'swoop reaches the lane ' + lane + ' drum');
    assert.ok(deepest[0] < 0.2);
    assert.ok(w.helper.x01 === DD.World.HELPER.away[0] && w.helper.y01 === DD.World.HELPER.away[1] && w.helper.y01 <= -1, 'gone off the top edge (away anchor)');
  }
});

test('helper: deterministic; Easy level 1 still cannot be lost with Pip around', () => {
  function go() { const r = playGame('normal', 41, 0.75, 140); return J([r.w.score, r.w.stats, r.w.helper, r.ev.filter(e => /helper/.test(e.type))]); }
  assert.deepStrictEqual(go(), go());
  for (let seed = 1; seed <= 3; seed++) {
    const r = playGame('easy', seed, 0.1, 120, 1);
    assert.strictEqual(r.w.levelsCleared, 1); assert.ok(r.w.stats.helpers >= 0);
  }
  const r = playGame('normal', 7, 0.7, 300, 3);
  assert.ok(r.w.stats.helpers >= 2 && r.w.stats.saved >= 1, 'a skill-0.7 player meets Pip and gets saved: ' + JSON.stringify(r.w.stats));
});

// ---------- weather ----------
test('weather: bounded particle counts for all levels, sizes, hand-overs and burst spam; valid fields', () => {
  const sizes = [[960, 540], [1280, 540], [560, 1600], [720, 1600], [960, 960], [320, 480]];
  for (const [W, Hh] of sizes) {
    const wx = new DD.Weather({ width: W, height: Hh, seed: 3 });
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
          assert.ok(DD.Weather.SPRITES.includes(p.sprite), p.sprite);
        }
      }
      const amb = wx.particles.filter(p => !p.fx).length;
      assert.ok(amb > 8, W + 'x' + Hh + ' L' + L + ' has ambient particles: ' + amb);
    }
    assert.ok(max < 140, W + 'x' + Hh + ' max ' + max);
  }
  const wx = new DD.Weather({ seed: 1 });
  wx.setLevel(3, { instant: true }); wx.update(0.1);
  assert.strictEqual(wx.ambient.glow, 1); assert.ok(/rgba/.test(wx.ambient.tint));
  wx.setLevel(0); for (let i = 0; i < 200; i++) wx.update(1 / 60);
  assert.strictEqual(wx.ambient.glow, 0); assert.strictEqual(wx.ambient.shafts.length, 3);
  assert.ok(wx.particles.filter(p => !p.fx && p.sprite === 'star').length === 0, 'sky roof stars faded out');
});

test('weather: deterministic for any dt partition; pulse swells particles', () => {
  function go(dt) { const wx = new DD.Weather({ seed: 9 }); for (let i = 0, n = Math.round(5 / dt); i < n; i++) wx.update(dt, { kitX: 190, kitY: 300 }); return J(wx.particles); }
  const a = go(1 / 60), b = go(1 / 30), c = go(1 / 120);
  assert.deepStrictEqual(a.length, b.length);
  assert.deepStrictEqual(a, c);
  const wx = new DD.Weather({ seed: 2 }); wx.setLevel(3, { instant: true }); wx.update(1 / 60);
  const s0 = wx.particles.map(p => p.size); wx.pulse(); wx.update(1 / 60);
  const s1 = wx.particles.map(p => p.size); let bigger = 0;
  for (let i = 0; i < s0.length; i++) if (s1[i] > s0[i] * 1.05) bigger++;
  assert.ok(bigger > s0.length * 0.6, 'pulse: ' + bigger + '/' + s0.length);
});

test('weather: per-floor ambient physics (leaves tumble, butterflies flap sx, fluff falls & sways in 2 layers, fireflies blink, stars twinkle)', () => {
  const kinds = { 0: ['mote', 'leaf'], 1: ['butterfly', 'drift'], 2: ['fluff'], 3: ['star', 'firefly'] };
  for (const [W, Hh] of [[960, 540], [560, 1600]]) for (let L = 0; L < 4; L++) {
    const wx = new DD.Weather({ width: W, height: Hh, seed: 5 + L }); wx.setLevel(L, { instant: true });
    for (const k of kinds[L]) assert.ok(wx.particles.some(p => p.kind === k), 'floor ' + L + ' has ' + k);
    const track = {}; wx.particles.forEach((p, i) => { p._id = i; track[i] = { p, y0: p.y, x0: p.x, rots: [], sxs: [], as: [] }; });
    for (let i = 0; i < 60 * 4; i++) { wx.update(1 / 60); for (const p of wx.particles) if (track[p._id] && track[p._id].p === p) { const t = track[p._id]; t.rots.push(p.rot); if (p.sx !== undefined) t.sxs.push(p.sx); t.as.push(p.alpha); t.y1 = p.y; t.x1 = p.x; } }
    const alive = Object.values(track).filter(t => t.p.fade === 1 && wx.particles.includes(t.p) && t.y1 !== undefined);
    const of = k => alive.filter(t => t.p.kind === k);
    const spread = a => Math.max(...a) - Math.min(...a);
    if (L === 0) { const lv = of('leaf'); assert.ok(lv.length); for (const t of lv) { assert.ok(t.y1 > t.y0 + 20, 'leaf falls'); assert.ok(spread(t.rots) > 0.6, 'leaf tumbles'); } }
    if (L === 1) for (const t of of('butterfly')) {
      assert.ok(t.sxs.every(s => s >= 0.2 && s <= 1) && spread(t.sxs) > 0.6, 'flaps');
      assert.ok(Math.hypot(t.x1 - t.x0, t.y1 - t.y0) > 30, 'flies');
      assert.ok(t.x1 > -41 && t.x1 < W + 41 && t.y1 > -41 && t.y1 < Hh + 41);
    }
    if (L === 2) {
      const fl = of('fluff'); assert.ok(fl.some(t => t.p.layer === 'back') && fl.some(t => t.p.layer === 'front'), 'two depth layers');
      for (const t of fl) { const vy = (t.y1 - t.y0) / 4; assert.ok(vy > 5 && vy < 40, 'slow fall ' + vy); assert.ok(spread(t.rots) > 0.3, 'sway tilt'); }
      const vb = mean(fl.filter(t => t.p.layer === 'back').map(t => t.y1 - t.y0)), vf = mean(fl.filter(t => t.p.layer === 'front').map(t => t.y1 - t.y0));
      assert.ok(vf > vb, 'near fluff falls faster (parallax) ' + vf + ' > ' + vb);
    }
    if (L === 3) {
      for (const t of of('firefly')) assert.ok(spread(t.as) > 0.3, 'firefly blinks');
      for (const t of of('star')) assert.ok(spread(t.as) > 0.05 && Math.abs(t.y1 - t.y0) < 4, 'star twinkles in place');
    }
  }
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
