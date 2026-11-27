#!/usr/bin/env node
// Pip's Oasis Glow — high-speed playtest (REPORT-ONLY: never edits game/js). Builds on tests/sim/harness.js
// (same vm loader + kid/parent/exploit models) and adds: gold metrics, heart-loss causes, double-tap kids, a gold-only
// greedy player, an empty-hole tapper, taps during Pip's hop, late-game (loop 2+) starts and a CONFIG patch A/B.
// Run from projects/daily-game/frog-oasis-glow:
//   node tests/sim/playtest.js                 → base only
//   node tests/sim/playtest.js base rec        → named PATCHES side by side      (--quick = ¼ seeds)
// JSON goes to tests/sim/out/playtest-<patch>.json (gitignored).
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('./harness');
const { pct, mean, f0, f1 } = H;

const PATCHES = {
  base: null,
  gold10: { GOLD_P: 0.10 },
  gold12: { GOLD_P: 0.12 },
  goldUp: { GOLD_P: 0.10, GOLD_UP_K: 0.9 },
  leaf8: { LEAF_EVERY: 8 },
  leaf10: { LEAF_EVERY: 10 },
  start5: { START_LEAVES: 5 },
  easyFly80: { DIFFICULTY: { easy: { fireflyP: 0.8 } } },
  goal18: { LEVEL_GOAL: 18 },
  mash4: { MASH_N: 4 },
  rec: { GOLD_P: 0.10, GOLD_UP_K: 0.9, START_LEAVES: 5 },                     // recommended
  recLeaf: { GOLD_P: 0.10, GOLD_UP_K: 0.9, START_LEAVES: 5, LEAF_EVERY: 10 },
};

const QUICK = process.argv.includes('--quick');
const K = QUICK ? 0.25 : 1;
const n = x => Math.max(10, Math.round(x * K));
const live = c => c && (c.state === 'rise' || c.state === 'up');

// ------------------------------------------------------------------ extra player models
/** greedy: taps ONLY golden fireflies, adult reaction */
class GoldOnly {
  constructor(w, r) { this.w = w; this.r = r; this.t = 0; this.due = {}; }
  step(dt) {
    const w = this.w; this.t += dt; if (w.phase !== 'play') return;
    for (let i = 0; i < w.holes.length; i++) {
      const c = w.holes[i].critter;
      if (!live(c) || c.h < 0.25 || c.type !== 'gold') continue;
      if (this.due[c.id] === undefined) this.due[c.id] = this.t + this.r.range(0.4, 0.7);
      if (this.t >= this.due[c.id] && this.due[c.id] > 0) { if (w.tapHole(i) !== 'busy') this.due[c.id] = -1; }
    }
  }
}
/** wraps a player: after every tap, with probability p, taps the same burrow again 0.08–0.30 s later (a kid's double tap) */
class DoubleTap {
  constructor(w, r, inner, p) {
    this.w = w; this.r = r; this.inner = inner; this.p = p; this.t = 0; this.q = []; this.inTap = false;
    const self = this, orig = w.tapHole.bind(w);
    w.tapHole = function (i) {
      const res = orig(i);
      if (!self.inTap && res !== 'busy' && self.r.chance(self.p)) self.q.push({ at: self.t + self.r.range(0.08, 0.3), i });
      return res;
    };
  }
  step(dt) {
    this.t += dt; this.inner.step(dt);
    for (let k = this.q.length - 1; k >= 0; k--) if (this.t >= this.q[k].at) {
      const { i } = this.q[k]; this.q.splice(k, 1); this.inTap = true; this.w.tapHole(i); this.inTap = false;
    }
  }
}
/** parent who also pokes a random EMPTY burrow every 0.6–1.4 s (bored / fidgeting / "pre-tapping") */
class Fidget {
  constructor(w, r) { this.w = w; this.r = r; this.inner = new H_Human(w, r, H.PARENT); this.t = 0; this.next = 1; }
  step(dt) {
    this.t += dt; this.inner.step(dt); const w = this.w; if (w.phase !== 'play') return;
    if (this.t >= this.next) {
      this.next = this.t + this.r.range(0.6, 1.4);
      const free = []; for (let i = 0; i < w.holes.length; i++) if (!w.holes[i].critter) free.push(i);
      if (free.length) w.tapHole(this.r.pick(free));
    }
  }
}
/** instant adult who ALSO re-taps every firefly holder while Pip is airborne (hop-spam: can re-aims farm points?) */
class HopSpam {
  constructor(w, r) { this.w = w; this.r = r; this.inner = new H_Human(w, r, H.PARENT); }
  step(dt) {
    this.inner.step(dt); const w = this.w; if (w.phase !== 'play') return;
    if (w.pip.state !== 'hop' && w.pip.state !== 'return') return;
    for (let i = 0; i < w.holes.length; i++) w.tapHole(i);   // hammer every burrow mid-flight
  }
}
// harness's Human class is not exported; rebuild it through MODELS
function H_Human(w, r, p) {
  const proto = H.MODELS.kid4(w, r).constructor;   // the Human class
  return new proto(w, r, p);
}
const KID4_MILD = Object.assign({}, H.KID4, { impulse: 0.35, farImpulse: 0.1 });   // sensitivity: a less impulsive 4-year-old

const MODELS = Object.assign({}, H.MODELS, {
  goldOnly: (w, r) => new GoldOnly(w, r),
  kid4dbl: (w, r) => new DoubleTap(w, r, H.MODELS.kid4(w, r), 0.5),
  kid3dbl: (w, r) => new DoubleTap(w, r, H.MODELS.kid3(w, r), 0.5),
  kid4mild: (w, r) => H_Human(w, r, KID4_MILD),
  fidget: (w, r) => new Fidget(w, r),
  hopSpam: (w, r) => new HopSpam(w, r),
});

// ------------------------------------------------------------------ one run (richer than harness.run)
function run(Z, o) {
  const w = new Z.World({ seed: o.seed, difficulty: o.diff, level: o.level || 0 });
  const prng = new Z.RNG('player-' + o.seed);
  const pl = o.model === 'bot' ? new (class { constructor() { this.b = new Z.Bot(w, { skill: o.skill, seed: o.seed * 7 + 1 }); } step(dt) { this.b.step(dt); } })()
    : MODELS[o.model](w, prng);
  const taps = { match: 0, wrong: 0, empty: 0, busy: 0, none: 0 }, airTaps = { match: 0, wrong: 0, empty: 0, busy: 0 };
  const orig = w.tapHole.bind(w);
  w.tapHole = function (i) {
    const air = w.pip.state === 'hop' || w.pip.state === 'return';
    const r = orig(i); taps[r] = (taps[r] || 0) + 1; if (air) airTaps[r] = (airTaps[r] || 0) + 1; return r;
  };
  const dt = 1 / 60, cap = o.cap || 300;
  let t = 0, firstBoop = -1, lastPop = 0, maxPopGap = 0, maxNoFF = 0, nan = false, naps = 0;
  const goldHole = {}; let goldPops = 0, goldCaught = 0, goldMissed = 0; const goldUp = [];
  const chGold = []; let curGold = 0;           // gold pops per finished chapter
  let lostWrong = 0, lostMiss = 0, gameOverCause = null, lastLossCause = null;
  let lastProgressT = 0, maxNoProgress = 0;     // longest stretch without a boop while the player taps (stall check)
  let pops = 0, sleepPops = 0;
  while (w.phase !== 'over' && t < cap) {
    pl.step(dt); w.update(dt); t += dt;
    for (const e of w.drainEvents()) {
      switch (e.type) {
        case 'pop':
          pops++; if (!w.clearing) maxPopGap = Math.max(maxPopGap, t - lastPop); lastPop = t;
          if (e.critterType === 'sleepy') sleepPops++;
          if (e.critterType === 'gold') { goldPops++; curGold++; goldHole[e.hole] = true; const c = w.holes[e.hole].critter; if (c) goldUp.push(c.upFor); }
          else delete goldHole[e.hole];
          break;
        case 'boop': if (firstBoop < 0) firstBoop = t; lastProgressT = t; if (e.gold) goldCaught++; delete goldHole[e.hole]; break;
        case 'miss': if (goldHole[e.hole]) { goldMissed++; delete goldHole[e.hole]; } break;
        case 'wrong': lastLossCause = 'wrong'; break;
        case 'leafLost': if (lastLossCause === 'wrong') lostWrong++; else lostMiss++; gameOverCause = lastLossCause || 'miss'; lastLossCause = null; break;
        case 'levelClear': chGold.push(curGold); curGold = 0; break;
        case 'levelUp': lastPop = t; break;
        case 'nap': naps++; break;
      }
    }
    // misses on Normal/Hard emit miss→leafLost with no 'wrong' first
    if (w.phase === 'play' && !w.clearing) maxNoFF = Math.max(maxNoFF, w.noFireflyT);
    maxNoProgress = Math.max(maxNoProgress, t - lastProgressT);
    if (!isFinite(w.pip.x) || !isFinite(w.pip.y)) nan = true;
    if (o.stopAtLevel !== undefined && w.level >= o.stopAtLevel) break;
  }
  return {
    t, over: w.phase === 'over', score: w.score, level: w.level - (o.level || 0), boops: w.boops, golds: w.golds,
    levelTimes: w.stats.levelTimes.slice(), firstBoop, taps, airTaps, maxPopGap, maxNoFF, nan, naps,
    goldPops, goldCaught, goldMissed, goldUp, chGold, lostWrong, lostMiss, cause: w.phase === 'over' ? gameOverCause : null,
    pops, sleepPops, maxNoProgress, wrong: w.stats.wrong
  };
}

function cell(Z, model, diff, N, cap, extra) {
  const rs = [];
  for (let s = 1; s <= N; s++) rs.push(run(Z, Object.assign({ model, diff, seed: s, cap }, extra || {})));
  const sum = k => rs.reduce((a, r) => a + (typeof k === 'function' ? k(r) : r[k]), 0);
  const lt = [[], [], [], []]; rs.forEach(r => r.levelTimes.forEach((x, i) => lt[Math.min(i, 3)].push(x)));
  const allLt = rs.flatMap(r => r.levelTimes);
  const chG = rs.flatMap(r => r.chGold);
  const M = sum(r => r.taps.match), W = sum(r => r.taps.wrong);
  return {
    model, diff, N, cap, skill: extra && extra.skill, level: extra && extra.level,
    alive: rs.filter(r => !r.over).length / N,
    surv: [.1, .5, .9].map(q => pct(rs.map(r => r.t), q)),
    score: [.1, .5, .9].map(q => pct(rs.map(r => r.score), q)),
    chapters: pct(rs.map(r => r.level), .5), ch1: rs.filter(r => r.level >= 1).length / N,
    firstBoop: [pct(rs.map(r => r.firstBoop).filter(x => x >= 0), .5), pct(rs.map(r => r.firstBoop).filter(x => x >= 0), .9)],
    lt: lt.map(mean), ltAll: [pct(allLt, .1), pct(allLt, .5), pct(allLt, .9)],
    wrongShare: W / Math.max(1, W + M), ppm: mean(rs.map(r => r.score / (r.t / 60))),
    goldPerCh: mean(chG), goldZeroCh: chG.filter(x => x === 0).length / Math.max(1, chG.length),
    goldCatch: sum('goldCaught') / Math.max(1, sum('goldCaught') + sum('goldMissed')), goldUp: mean(rs.flatMap(r => r.goldUp)),
    goldShare: sum('goldPops') / Math.max(1, sum('pops')),
    wrongPerMin: sum('wrong') / (sum('t') / 60), lostWrong: sum('lostWrong'), lostMiss: sum('lostMiss'),
    causeWrong: rs.filter(r => r.cause === 'wrong').length, causeMiss: rs.filter(r => r.cause === 'miss').length,
    naps: sum('naps') / (sum('t') / 60), taps: ['match', 'wrong', 'empty', 'busy'].map(k => sum(r => r.taps[k] || 0)),
    air: ['match', 'wrong', 'empty', 'busy'].map(k => sum(r => r.airTaps[k] || 0)),
    maxPopGap: Math.max(...rs.map(r => r.maxPopGap)), maxNoFF: Math.max(...rs.map(r => r.maxNoFF)), nan: rs.some(r => r.nan),
    maxNoProgress: Math.max(...rs.map(r => r.maxNoProgress))
  };
}

function kidClear(Z, model, N) {
  let ok = 0; const tt = [], fb = [], gc = []; let gp = 0, gcat = 0, gmiss = 0;
  for (let s = 1; s <= N; s++) {
    const r = run(Z, { model, diff: 'easy', seed: 100000 + s, cap: 300, stopAtLevel: 1 });
    if (r.level >= 1) { ok++; tt.push(r.levelTimes[0]); gc.push(r.chGold[0]); }
    if (r.firstBoop >= 0) fb.push(r.firstBoop);
    gp += r.goldPops; gcat += r.goldCaught; gmiss += r.goldMissed;
  }
  return { model, N, rate: ok / N, t: [.1, .5, .9].map(q => pct(tt, q)), firstBoop: [pct(fb, .5), pct(fb, .9)],
    goldPerCh: mean(gc), goldZero: gc.filter(x => !x).length / Math.max(1, gc.length), goldCatch: gcat / Math.max(1, gcat + gmiss) };
}

function sweep(name) {
  const Z = H.load(PATCHES[name]);
  const o = { patch: name, config: PATCHES[name], kids: [], main: [], exploits: [], late: [], idle: [] };
  const t0 = Date.now();
  for (const m of ['kid3', 'kid4', 'kid5', 'kid4mild', 'kid4dbl', 'kid3dbl']) o.kids.push(kidClear(Z, m, n(1000)));
  for (const d of ['easy', 'normal', 'hard']) {
    for (const sk of [0.3, 0.5, 0.8, 1]) o.main.push(cell(Z, 'bot', d, n(80), 600, { skill: sk }));
    for (const m of ['kid3', 'kid4', 'kid5', 'kid4mild', 'parent']) o.main.push(cell(Z, m, d, n(150), 600));
    for (const m of ['mash', 'tapAll', 'smartSpam', 'goldOnly', 'fidget', 'hopSpam', 'kid4dbl']) o.exploits.push(cell(Z, m, d, n(60), 600));
    o.idle.push(cell(Z, 'idle', d, n(20), 900));
  }
  // late game: start at loop 2 (level 8) and loop 4 (level 16, speed cap)
  for (const lv of [8, 16]) for (const d of ['easy', 'normal', 'hard']) {
    for (const [m, sk] of [['parent'], ['kid5'], ['bot', 0.5], ['bot', 1]]) o.late.push(cell(Z, m, d, n(60), 300, Object.assign({ level: lv }, sk === undefined ? {} : { skill: sk })));
  }
  o.ms = Date.now() - t0;
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', 'playtest-' + name + '.json'), JSON.stringify(o, null, 1));
  return o;
}

const lab = c => (c.model === 'bot' ? 'bot ' + c.skill : c.model);
const pc = x => f0(100 * x) + '%';
function tables(o) {
  const L = [`\n### patch: ${o.patch} ${o.config ? JSON.stringify(o.config) : '(shipped CONFIG)'}  — ${(o.ms / 1000).toFixed(0)} s CPU\n`];
  L.push('**Chapter 1 on Easy (stop at clear, 300 s cap)**\n\n| kid | N | cleared | clear s p10/p50/p90 | 1st boop p50/p90 s | gold/ch | ch with 0 gold | gold catch |\n|---|---|---|---|---|---|---|---|');
  for (const k of o.kids) L.push(`| ${k.model} | ${k.N} | ${pc(k.rate)} | ${k.t.map(f0).join('/')} | ${k.firstBoop.map(f1).join('/')} | ${f1(k.goldPerCh)} | ${pc(k.goldZero)} | ${pc(k.goldCatch)} |`);
  L.push('\n**Players (600 s cap)**\n\n| player | diff | N | alive | surv p10/p50/p90 | score p10/p50/p90 | ch p50 | ch1 | 1st boop | s/ch 1/2/3/4+ | wrong | wrong/min | hearts lost wrong/miss | gold/ch | gold catch | pts/min |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const c of o.main) L.push(`| ${lab(c)} | ${c.diff} | ${c.N} | ${pc(c.alive)} | ${c.surv.map(f0).join('/')} | ${c.score.map(f0).join('/')} | ${c.chapters} | ${pc(c.ch1)} | ${f1(c.firstBoop[0])} | ${c.lt.map(f0).join('/')} | ${pc(c.wrongShare)} | ${f1(c.wrongPerMin)} | ${c.lostWrong}/${c.lostMiss} | ${f1(c.goldPerCh)} | ${pc(c.goldCatch)} | ${f0(c.ppm)} |`);
  L.push('\n**Exploits / odd players (600 s cap)**\n\n| player | diff | alive | surv p50 | score p50 | ch p50 | pts/min | taps match/wrong/empty/busy | taps while Pip airborne m/w/e/b | naps/min |\n|---|---|---|---|---|---|---|---|---|---|');
  for (const c of o.exploits) L.push(`| ${lab(c)} | ${c.diff} | ${pc(c.alive)} | ${f0(c.surv[1])} | ${f0(c.score[1])} | ${c.chapters} | ${f0(c.ppm)} | ${c.taps.join('/')} | ${c.air.join('/')} | ${f1(c.naps)} |`);
  L.push('\n**Idle (never taps, 900 s)**\n\n| diff | game over | surv p50 | sleeper share | gold share | max pop gap |\n|---|---|---|---|---|---|');
  for (const c of o.idle) L.push(`| ${c.diff} | ${pc(1 - c.alive)} | ${f0(c.surv[1])} | – | ${f1(100 * c.goldShare)}% | ${f1(c.maxPopGap)} |`);
  L.push('\n**Late game (start at level 8 = loop 2, level 16 = loop 4 / speed cap; 300 s cap)**\n\n| start | player | diff | alive @300 | surv p50 | ch p50 | s/ch p50 | wrong |\n|---|---|---|---|---|---|---|---|');
  for (const c of o.late) L.push(`| ${c.level} | ${lab(c)} | ${c.diff} | ${pc(c.alive)} | ${f0(c.surv[1])} | ${c.chapters} | ${f0(c.ltAll[1])} | ${pc(c.wrongShare)} |`);
  const all = [...o.main, ...o.exploits, ...o.idle, ...o.late];
  L.push(`\nStall check: max pop gap ${f1(Math.max(...all.map(c => c.maxPopGap)))} s; max no-firefly-visible ${f1(Math.max(...all.map(c => c.maxNoFF)))} s; ` +
    `max time without a boop (bot 1, any diff) ${f1(Math.max(...o.main.filter(c => c.model === 'bot' && c.skill === 1).map(c => c.maxNoProgress)))} s; NaN: ${all.some(c => c.nan) ? 'YES' : 'none'}`);
  return L.join('\n');
}

const which = process.argv.slice(2).filter(a => !a.startsWith('--'));
for (const name of which.length ? which : ['base']) console.log(tables(sweep(name)));
