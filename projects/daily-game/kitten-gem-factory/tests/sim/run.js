#!/usr/bin/env node
// Comet's Gem Factory — high-speed playtest harness (headless, no rendering).
// Loads rng.js + world.js + bot.js in a vm with a fake window and plays thousands of rounds with
// fixed steps. Player models: the built-in Bot (skill 0.2/0.5/0.8/1.0) and human-like models
// (4-year-old, 6-year-old, casual adult) plus two exploit models (random spam, unseen-first spam).
//
// Run:  node tests/sim/run.js                       baseline values (game/js/world.js as shipped)
//       node tests/sim/run.js --set proposed        PROPOSED below (diffConfig/config + rule patches)
//       node tests/sim/run.js --set valuesonly      the same numbers using only existing keys
//       node tests/sim/run.js --compare a.json b.json   before → after table from two --json files
//       options: --runs N (default 100)  --models a,b  --diffs easy,normal  --json out.json  --exact
// Nothing in game/ is modified: overrides go through new CGF.World({ diffConfig, config }).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS = path.join(__dirname, '..', '..', 'game', 'js');
function load() {
  const ctx = { console, Math, Date, JSON };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['rng.js', 'world.js', 'bot.js']) vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f });
  return ctx.CGF;
}
const CGF = load();

/* ===================== proposed values (see docs/reports/playtest.md) ===================== */
// New keys (need ~10 lines in world.js, see patchRules below): missLock, loopMul, loopMin, rules.tidyBonus.
const PROPOSED = {
  diff: {
    easy:   { time: [105, 160, 215, 275], matchBonus: 6,   missDelay: 1.0, peek: 2.5, peekPerPair: 0.25, missPenalty: 1,
              missLock: 1.0,  loopMul: 0.9,  loopMin: 0.75 },
    normal: { time: [60, 80, 100, 120],   matchBonus: 1.5, missDelay: 0.8, peek: 1.8, peekPerPair: 0.15, missPenalty: 2,
              missLock: 0.6,  loopMul: 0.6,  loopMin: 0.5 },
    hard:   { time: [22, 28, 35, 42],     matchBonus: 1,   missDelay: 0.6, peek: 1.2, peekPerPair: 0.10, missPenalty: Infinity,
              missLock: 0.45, loopMul: 0.85, loopMin: 0.6 }
  },
  config: {},
  rules: { tidyBonus: true }
};
// Same numbers without any code change (only existing keys; CONFIG.loopMul is global).
const VALUES_ONLY = {
  diff: {
    easy:   { time: [105, 160, 215, 275], matchBonus: 6,   missDelay: 1.0, peek: 2.5, peekPerPair: 0.25, missPenalty: 1 },
    normal: { time: [60, 80, 100, 120],   matchBonus: 1.5, missDelay: 0.8, peek: 1.8, peekPerPair: 0.15, missPenalty: 2 },
    hard:   { time: [22, 28, 35, 42],     matchBonus: 1,   missDelay: 0.6, peek: 1.2, peekPerPair: 0.10, missPenalty: Infinity }
  },
  config: { loopMul: 0.8, loopMin: 0.6 }
};
const SETS = { baseline: null, proposed: PROPOSED, valuesonly: VALUES_ONLY };

/* ============================== args ============================== */
const argv = process.argv.slice(2);
function arg(name, def) { const i = argv.indexOf('--' + name); return i >= 0 ? (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true) : def; }
const RUNS = +arg('runs', 100);
const LEVEL_CAP = 8;                 // two full years (levels 0–7); a run that clears all 8 stops
// High-speed mode: by default the World sub-step is raised from 1/120 s to 1/30 s (≈ 4× faster).
// Rules and timers are unchanged; only event timing is quantised to 33 ms (flip judged ≤ 33 ms
// later). `--exact` keeps 1/120 s; the report shows both agree within noise.
const EXACT = !!arg('exact', false);
const DT = 1 / 30;                   // outer frame (agent decisions)
const FAST = EXACT ? {} : { step: 1 / 30 };
const DIFFS = String(arg('diffs', 'easy,normal,hard')).split(',');

/* ============================== human-like models ============================== */
// Memory: each face-up sighting is encoded with probability p (peek sightings with p·peekAttn).
// An encoded memory is lost after an exponential time with mean tau (s) → "remembers, then decays".
// Recall can land on a neighbouring card (misplace). Distract = taps a random card although a
// known pair/twin exists. Retap = goes back to a card of the pair it just saw miss.
const HUMANS = {
  // calibrated: ≈ 3.5–4 attempts per pair (MECHANICS §6 assumed 2.2, pure random play is ≈ 6 on 4×3)
  '4yo':    { tap: [1.8, 3.0], p: 0.35, tau: 30, peekAttn: 0.35, peekCap: 2, misplace: 0.12, distract: 0.15, retap: 0.10 },
  // the literal brief (fast decay, lots of random taps): plays almost like random → lower bound
  '4yoLow': { tap: [1.8, 3.0], p: 0.35, tau: 12, peekAttn: 0.35, peekCap: 1, misplace: 0.15, distract: 0.25, retap: 0.15 },
  '6yo':    { tap: [1.2, 2.0], p: 0.55, tau: 25, peekAttn: 0.5,  peekCap: 3, misplace: 0.08, distract: 0.12, retap: 0.07 },
  // peekCap: a short peek of 12–24 cards only leaves a few locations in working memory
  'adult':  { tap: [0.7, 1.2], p: 0.80, tau: 60, peekAttn: 0.7,  peekCap: 4, misplace: 0.02, distract: 0.03, retap: 0.01 }
};

function Human(world, prm, seed) {
  this.w = world; this.p = prm; this.rng = CGF.RNG(seed);
  this.mem = {}; this.up = {}; this.t = 0; this.wait = 0; this.level = -1; this.phase = null; this.lastWrong = [];
}
Human.prototype.delay = function () { return this.rng.range(this.p.tap[0], this.p.tap[1]); };
Human.prototype.observe = function () {
  const w = this.w, P = this.p;
  for (const k of w.cards) {
    if (k.state === 'matched' || k.state === 'gone') { delete this.mem[k.id]; continue; }
    const up = k.flip >= 0.5;
    if (up && !this.up[k.id] && w.phase === 'peek' && (this.peekN | 0) >= P.peekCap) { this.up[k.id] = true; continue; }
    if (up && !this.up[k.id]) {
      this.up[k.id] = true;
      const peek = w.phase === 'peek';
      if (peek && (this.peekN | 0) >= P.peekCap) continue;
      const pe = peek ? P.p * P.peekAttn : P.p;
      if (this.rng.chance(pe)) {
        if (peek) this.peekN = (this.peekN | 0) + 1;
        const life = -Math.log(1 - this.rng.next()) * P.tau;
        const old = this.mem[k.id];
        if (!old || old.until < this.t + life) this.mem[k.id] = { kind: k.kind, until: this.t + life };
      }
    } else if (!up) this.up[k.id] = false;
  }
  for (const id in this.mem) if (this.mem[id].until < this.t) delete this.mem[id];
};
Human.prototype.neighbour = function (k) {
  const w = this.w, c = w.cards.filter(o => o.state === 'down' && o.id !== k.id && Math.abs(o.col - k.col) + Math.abs(o.row - k.row) === 1);
  return c.length ? this.rng.pick(c) : k;
};
Human.prototype.recall = function (k) { return this.rng.chance(this.p.misplace) ? this.neighbour(k) : k; };
Human.prototype.choose = function () {
  const w = this.w, P = this.p, down = [], known = {}, unknown = [];
  for (const k of w.cards) {
    if (k.state !== 'down') continue;
    down.push(k);
    const m = this.mem[k.id];
    if (m) (known[m.kind] = known[m.kind] || []).push(k); else unknown.push(k);
  }
  if (!down.length) return null;
  const distracted = this.rng.chance(P.distract);
  const retapC = this.lastWrong.map(id => w.cards[id]).filter(k => k && k.state === 'down');
  if (retapC.length && this.rng.chance(P.retap)) return this.rng.pick(retapC);
  if (w._open.length === 1) {
    const kind = w.cards[w._open[0]].kind;
    if (!distracted && known[kind] && known[kind].length) return this.recall(known[kind][0]);
    return this.rng.pick(distracted || !unknown.length ? down : unknown);
  }
  if (!distracted) for (const kd of Object.keys(known).sort()) if (known[kd].length >= 2) return this.recall(known[kd][0]);
  return this.rng.pick(distracted || !unknown.length ? down : unknown);
};
Human.prototype.step = function (dt) {
  const w = this.w;
  this.t += dt;
  if (w.level !== this.level) { this.level = w.level; this.mem = {}; this.up = {}; this.lastWrong = []; this.peekN = 0; }
  if (w.phase !== this.phase) { if (w.phase === 'playing') this.wait = this.delay(); this.phase = w.phase; }
  this.observe();
  if (w.phase !== 'playing') return;
  if (this.wait > 0) { this.wait -= dt; return; }
  if (w._open.length >= 2) { this.wait = 0.05; return; }
  const pick = this.choose();
  if (!pick) { this.wait = 0.1; return; }
  if (w.tap(pick.id)) {
    this.wait = this.delay();
    if (w._open.length === 2) {           // remember which pair to maybe re-tap after a miss
      const [a, b] = w._open.map(i => w.cards[i]);
      this.lastWrong = a.kind !== b.kind ? [a.id, b.id] : [];
    }
  } else this.wait = 0.1;                 // card still closing: a child just taps again a moment later
};

/* ============================== exploit models ============================== */
// 'spam': taps a random face-down card every ~0.15 s, no memory at all.
// 'spamUnseen': same speed, but only taps cards it has never turned (world-visible "seen" flag
//   ≈ a player who just sweeps the board): exploits "an unseen miss never breaks the combo".
function Spam(world, seed, unseen, gap) { this.w = world; this.rng = CGF.RNG(seed); this.wait = 0; this.unseen = unseen; this.gap = gap || [0.12, 0.18]; }
Spam.prototype.step = function (dt) {
  const w = this.w;
  if (w.phase !== 'playing') return;
  if (this.wait > 0) { this.wait -= dt; return; }
  let down = w.cards.filter(k => k.state === 'down' && !(k.flip >= 0.05 && k._ft !== 0) && !(k.wiggleT > 0));
  if (!down.length || w._open.length >= 2) { this.wait = 0.02; return; }
  if (this.unseen) { const u = down.filter(k => !k.seen); if (u.length) down = u; }
  const k = this.rng.pick(down);
  w.tap(k.id);
  this.wait = this.rng.range(this.gap[0], this.gap[1]);
};

/* ============================== models ============================== */
const MODELS = {
  'bot0.2': { label: 'Bot skill 0.2', make: (w, s) => new CGF.Bot(w, { skill: 0.2, seed: s }) },
  'bot0.5': { label: 'Bot skill 0.5', make: (w, s) => new CGF.Bot(w, { skill: 0.5, seed: s }) },
  'bot0.8': { label: 'Bot skill 0.8', make: (w, s) => new CGF.Bot(w, { skill: 0.8, seed: s }) },
  'bot1.0': { label: 'Bot skill 1.0', make: (w, s) => new CGF.Bot(w, { skill: 1.0, seed: s }) },
  '4yo':    { label: '4-year-old',    make: (w, s) => new Human(w, HUMANS['4yo'], s) },
  '4yoLow': { label: '4-year-old (low memory)', make: (w, s) => new Human(w, HUMANS['4yoLow'], s) },
  '6yo':    { label: '6-year-old',    make: (w, s) => new Human(w, HUMANS['6yo'], s) },
  'adult':  { label: 'casual adult',  make: (w, s) => new Human(w, HUMANS.adult, s) },
  'spam':   { label: 'spam (random, 0.15 s)', make: (w, s) => new Spam(w, s, false) },
  'spamU':  { label: 'spam unseen-first', make: (w, s) => new Spam(w, s, true) },
  'mash':   { label: 'kid mashing (random, 0.4–0.7 s)', make: (w, s) => new Spam(w, s, false, [0.4, 0.7]) }
};
const MODEL_KEYS = String(arg('models', Object.keys(MODELS).join(','))).split(',');

/* ============================== proposed rule tweaks ============================== */
// These need a few lines in world.js; the sim applies them as instance patches (game/ untouched).
//  diff.missLock (s): a wrong pair stays shown at least this long; taps during the lock are ignored
//    (so the 3rd-tap shortcut still helps quick players, but random mashing can't skip the miss).
//  rules.tidyBonus: the clear time bonus is scaled by accuracy = pairs / attempts this level (≤ 1).
//  diff.loopMul / diff.loopMin: per-difficulty next-year factor (falls back to CONFIG.loopMul/loopMin).
function patchRules(w, values) {
  const d = w.diff, rules = (values && values.rules) || {};
  if (d.loopMul !== undefined || d.loopMin !== undefined) {
    const lm = d.loopMul !== undefined ? d.loopMul : w.cfg.loopMul, ln = d.loopMin !== undefined ? d.loopMin : w.cfg.loopMin;
    w.loopFactor = function (level) { return Math.max(ln, Math.pow(lm, Math.floor(level / 4))); };
  }
  if (d.missLock > 0) {
    const tap = w.tap, judge = w._judge;
    w._judge = function () { judge.call(this); if (this._wrong) this._wrongT0 = this._wrong.t; };
    w.tap = function (i) {
      if (this._wrong && this._wrongT0 - this._wrong.t < d.missLock) return false;
      return tap.call(this, i);
    };
  }
  if (rules.tidyBonus) {
    const load = w._loadLevel;
    w._lvFlips0 = w.stats.flips;
    w._loadLevel = function (L) { this._lvFlips0 = this.stats.flips; load.call(this, L); };
    w._clear = function () {
      const c = this.cfg, perfect = !this._broken;
      const attempts = Math.max(1, (this.stats.flips - this._lvFlips0) / 2);
      const acc = Math.min(1, this.pairs / attempts);
      const tb = Math.round(c.clearPerSecond * Math.ceil(Math.max(0, this.timeLeft)) * acc);
      const bonus = tb + (perfect ? c.perfectBonus : 0);
      this.score += bonus; this.stats.levelsCleared++; if (perfect) this.stats.perfectLevels++;
      this.phase = 'clear'; this.phaseT = 0; this._gizmoBase = 'happy';
      if (this.gizmo.state !== 'eat') { this.gizmo.state = 'happy'; this.gizmo.stateT = 0; }
      this._emit({ type: 'levelClear', level: this.level, bonus: bonus, perfect: perfect, timeBonus: tb, perfectBonus: perfect ? c.perfectBonus : 0 });
    };
  }
}

/* ============================== one game ============================== */
function playOne(model, difficulty, seed, values) {
  const opts = { seed: seed, difficulty: difficulty };
  opts.config = Object.assign({}, FAST, values && values.config);
  if (values) opts.diffConfig = values.diff[difficulty];
  const w = new CGF.World(opts);
  patchRules(w, values);
  const agent = MODELS[model].make(w, seed * 7919 + 13);
  const r = { cleared: [], playTime: [], leftFrac: [], leftS: [], hurry: [], maxMult: [], firstMatch: null, score: 0,
    matches: 0, matchesAt5: 0, bestStreak: 0, misses: 0, broken: 0, flips: 0 };
  let playStart = 0, lvMax = 1, hurried = false;
  for (let guard = 0; guard < 30 * 60 * 60; guard++) {        // ≤ 60 min of game time
    agent.step(DT);
    w.update(DT);
    const ev = w.drainEvents();
    let done = false;
    for (const e of ev) {
      if (e.type === 'peekEnd') { playStart = w.t; lvMax = 1; hurried = false; }
      else if (e.type === 'hurry') hurried = true;
      else if (e.type === 'match') {
        r.matches++; if (e.mult >= 5) r.matchesAt5++; if (e.mult > lvMax) lvMax = e.mult;
        if (r.firstMatch === null) r.firstMatch = w.t - playStart;
      } else if (e.type === 'levelClear') {
        r.cleared[e.level] = true; r.playTime[e.level] = w.t - playStart;
        r.leftS[e.level] = w.timeLeft; r.leftFrac[e.level] = w.timeLeft / w.timeLimit;
        r.hurry[e.level] = hurried; r.maxMult[e.level] = lvMax;
        if (e.level + 1 >= LEVEL_CAP) done = true;
      } else if (e.type === 'gameOver') { r.maxMult[w.level] = lvMax; done = true; }
    }
    if (done) break;
  }
  r.score = w.score; r.levels = w.stats.levelsCleared; r.bestStreak = w.stats.bestStreak;
  r.misses = w.stats.misses; r.broken = w.stats.brokenMisses; r.flips = w.stats.flips;
  return r;
}

/* ============================== aggregate ============================== */
function pct(a, q) { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1) + 0.5))]; }
function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
function simulate(model, diff, values) {
  const R = [];
  for (let i = 0; i < RUNS; i++) R.push(playOne(model, diff, 1000 + i, values));
  const lv = [...Array(LEVEL_CAP).keys()];
  const reached = lv.map(L => R.filter(r => r.cleared[L]).length / R.length);          // P(clear level L)
  const time = lv.map(L => mean(R.filter(r => r.cleared[L]).map(r => r.playTime[L])));
  const left = lv.map(L => mean(R.filter(r => r.cleared[L]).map(r => r.leftFrac[L])));
  const leftS = lv.map(L => mean(R.filter(r => r.cleared[L]).map(r => r.leftS[L])));
  const hurry = lv.map(L => { const c = R.filter(r => r.cleared[L]); return c.length ? c.filter(r => r.hurry[L]).length / c.length : NaN; });
  const levelsPlayed = R.reduce((s, r) => s + r.maxMult.filter(x => x !== undefined).length, 0);
  const levelsX5 = R.reduce((s, r) => s + r.maxMult.filter(x => x >= 5).length, 0);
  const dist = lv.concat([LEVEL_CAP]).map(n => R.filter(r => r.levels === n).length / R.length);
  return {
    model, diff, runs: R.length, reached, time, left, leftS, hurry, dist,
    score: [pct(R.map(r => r.score), 0.1), pct(R.map(r => r.score), 0.5), pct(R.map(r => r.score), 0.9)],
    firstMatch: mean(R.filter(r => r.firstMatch !== null).map(r => r.firstMatch)),
    x5Levels: levelsX5 / Math.max(1, levelsPlayed),
    at5: R.reduce((s, r) => s + r.matchesAt5, 0) / Math.max(1, R.reduce((s, r) => s + r.matches, 0)),
    bestStreak: [pct(R.map(r => r.bestStreak), 0.1), pct(R.map(r => r.bestStreak), 0.5), pct(R.map(r => r.bestStreak), 0.9)],
    flipsPerPair: R.reduce((s, r) => s + r.flips, 0) / Math.max(1, R.reduce((s, r) => s + r.matches, 0)) / 2,
    brokenShare: R.reduce((s, r) => s + r.broken, 0) / Math.max(1, R.reduce((s, r) => s + r.misses, 0))
  };
}

/* ============================== printing ============================== */
const P = x => (x == null || isNaN(x)) ? '–' : Math.round(x * 100) + '%';
const S = x => (x == null || isNaN(x)) ? '–' : x.toFixed(0) + ' s';
function table(results, title) {
  const out = ['### ' + title, ''];
  for (const d of DIFFS) {
    const rows = results.filter(r => r.diff === d);
    if (!rows.length) continue;
    out.push('**' + d + '** (' + rows[0].runs + ' runs per model; Sp/Su/Au/Wi = year 1, Y2 = levels 4–7)', '');
    out.push('| model | clear Sp | Su | Au | Wi | Y2 Sp | Y2 Wi | levels p50 | score p10/p50/p90 | avg time Sp/Su/Au/Wi | time left Sp/Wi | hurry Sp/Wi | 1st match | ×5 levels | flips/pair |');
    out.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const r of rows) {
      let acc = 0, med = 0; for (let n = 0; n < r.dist.length; n++) { acc += r.dist[n]; if (acc >= 0.5) { med = n; break; } }
      out.push('| ' + MODELS[r.model].label + ' | ' + r.reached.slice(0, 4).map(P).join(' | ') + ' | ' + P(r.reached[4]) + ' | ' + P(r.reached[7]) +
        ' | ' + med + ' | ' + r.score.join(' / ') + ' | ' + r.time.slice(0, 4).map(x => isNaN(x) ? '–' : x.toFixed(0)).join(' / ') + ' s' +
        ' | ' + S(r.leftS[0]) + ' (' + P(r.left[0]) + ') / ' + S(r.leftS[3]) + ' (' + P(r.left[3]) + ')' +
        ' | ' + P(r.hurry[0]) + ' / ' + P(r.hurry[3]) + ' | ' + (isNaN(r.firstMatch) ? '–' : r.firstMatch.toFixed(1) + ' s') +
        ' | ' + P(r.x5Levels) + ' | ' + r.flipsPerPair.toFixed(2) + ' |');
    }
    out.push('');
  }
  return out.join('\n');
}
function distTable(results, title) {
  const out = ['### ' + title + ' — seasons cleared distribution (share of runs that cleared exactly n levels)', '',
    '| model / diff | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 (cap) | best streak p10/p50/p90 | broken-miss share |', '|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const r of results) out.push('| ' + MODELS[r.model].label + ' / ' + r.diff + ' | ' + r.dist.map(P).join(' | ') + ' | ' + r.bestStreak.join(' / ') + ' | ' + P(r.brokenShare) + ' |');
  return out.join('\n') + '\n';
}
function compare(base, prop, title) {
  const out = ['### Before → after (' + (title || 'baseline → proposed') + ')', '',
    '| model / diff | clear Sp | Su | Au | Wi | Y2 Sp | Y2 Wi | score p50 | avg time Sp | time Wi | left Sp | left Wi |', '|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const b of base) {
    const p = prop.find(x => x.model === b.model && x.diff === b.diff);
    if (!p) continue;
    const f = (i) => P(b.reached[i]) + ' → **' + P(p.reached[i]) + '**';
    out.push('| ' + MODELS[b.model].label + ' / ' + b.diff + ' | ' + [0, 1, 2, 3, 4, 7].map(f).join(' | ') + ' | ' + b.score[1] + ' → ' + p.score[1] +
      ' | ' + S(b.time[0]) + ' → ' + S(p.time[0]) + ' | ' + S(b.time[3]) + ' → ' + S(p.time[3]) +
      ' | ' + P(b.left[0]) + ' → ' + P(p.left[0]) + ' | ' + P(b.left[3]) + ' → ' + P(p.left[3]) + ' |');
  }
  return out.join('\n') + '\n';
}

function runAll(values) {
  const res = [];
  for (const d of DIFFS) for (const m of MODEL_KEYS) res.push(simulate(m, d, values));
  return res;
}

function load_(f) { return JSON.parse(fs.readFileSync(f, 'utf8')); }
if (require.main === module) {
  const t0 = Date.now();
  const cmp = arg('compare', null);
  if (cmp) {                                   // --compare before.json after.json [title]
    const i = argv.indexOf('--compare'), A = load_(argv[i + 1]), B = load_(argv[i + 2]);
    console.log(compare(A.results, B.results, argv[i + 3] || (A.set + ' → ' + B.set)));
    process.exit(0);
  }
  const set = String(arg('set', 'baseline'));
  if (!(set in SETS)) throw new Error('unknown --set ' + set);
  const res = runAll(SETS[set]);
  console.log(table(res, set + ' values') + '\n' + distTable(res, set));
  console.log('(' + RUNS + ' runs per cell, ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
  const jp = arg('json', null);
  if (jp) fs.writeFileSync(jp, JSON.stringify({ set, runs: RUNS, values: SETS[set], results: res }, (k, v) => v === Infinity ? 'Infinity' : v, 1));
}
module.exports = { CGF, playOne, simulate, PROPOSED, VALUES_ONLY, MODELS, HUMANS, FAST, runAll, table, distTable, compare };
