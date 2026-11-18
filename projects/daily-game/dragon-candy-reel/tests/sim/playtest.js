#!/usr/bin/env node
// Taffy's Candy Reel — high-speed playtest (report-only). World + player models in a node vm, no browser.
// Run from projects/daily-game/dragon-candy-reel:
//   node tests/sim/playtest.js main    [--n 60] [--min 10] [--set '{...}'] [--tag x]   models × difficulty × size (+ wind off)
//   node tests/sim/playtest.js exploit [--n 60] [--set ...]                            camper depth sweep, tap rhythms
//   node tests/sim/playtest.js level1  [--n 400] [--set ...]                           level 1 only, kid models
// --set takes CONFIG overrides as {"difficulty.normal.gummyMax": 1, "goldChance": 0.1} (applied inside the vm, never on disk).
// Output: tests/sim/results/playtest-<suite>[-tag].md and .json (summaries).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const os = require('os');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const players = require('./players');

const ROOT = path.join(__dirname, '..', '..');
const JS = path.join(ROOT, 'game', 'js');
const OUT = path.join(__dirname, 'results');

function loadPR(set) {
  const sb = { console }; sb.window = sb; vm.createContext(sb);
  for (const f of ['rng.js', 'world.js', 'bot.js']) vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), sb, { filename: f });
  for (const k in set || {}) { const ks = k.split('.'); let o = sb.PR.CONFIG; for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]]; o[ks[ks.length - 1]] = set[k]; }
  return sb.PR;
}

// ------------------------------------------------------------------ extra player models
const SIZES = { land: [960, 540], port: [560, 1212] };

/** kid with hesitant taps: slower looks, and 35% of reel taps wait for one more needle pass
 *  (a finger that hovers, then goes late), 10% are "panic" taps right after the zone moves. */
function makeHesitantKid(PR, w, opts) {
  const p = players.make('kid', PR, w, Object.assign({}, opts, { profile: { react: [0.45, 0.85], tapSd: 0.16, holdBias: 38, idle: 0.05 } }));
  p.reel = function () {
    const r = w.reel;
    if (w.hook.holding) w.release();
    if (r.taps !== this.tapsSeen) {
      this.tapsSeen = r.taps;
      if (this.rng.chance(0.10)) { this.tapAt = this.t + this.rng.range(0.08, 0.2); return; }   // panic tap
      let from = this.react();
      if (this.rng.chance(0.35)) from += 1 / Math.max(0.1, r.speed);                           // hover one pass
      this.tapAt = this.t + players.nextCross(w, from) + this.rng.gauss() * this.o.tapSd;
      if (this.tapAt < this.t + 0.06) this.tapAt = this.t + 0.06;
    }
    if (this.tapAt >= 0 && this.t >= this.tapAt) {
      this.tapAt = -1; this.stats.taps++; w.press(); w.release();
      if (this.rng.chance(this.o.doubleTap)) this.extraTapAt = this.t + this.rng.range(0.08, 0.18);
    }
  };
  return p;
}

/** Adult hook play, but the reel is tapped in a fixed rhythm (hz) ignoring the needle. */
function makeRhythm(PR, w, opts) {
  const p = players.make('adult', PR, w, opts);
  let next = 0;
  p.reel = function () {
    if (w.hook.holding) w.release();
    if (this.t >= next) { next = this.t + 1 / opts.hz; this.stats.taps++; w.press(); w.release(); }
  };
  return p;
}

function makePlayer(job, PR, w) {
  const o = Object.assign({ seed: job.seed * 7 + 3 }, job.opts || {});
  if (job.player === 'kidHesitant') return makeHesitantKid(PR, w, o);
  if (job.player === 'rhythm') return makeRhythm(PR, w, o);
  return players.make(job.player, PR, w, o);
}

// ------------------------------------------------------------------ one round
function playRound(PR, job) {
  const [W, H] = SIZES[job.size || 'land'];
  const w = new PR.World({ seed: job.seed, difficulty: job.diff, width: W, height: H });
  const p = makePlayer(job, PR, w);
  const dt = 1 / 60, maxT = job.maxTime, C = PR.CONFIG;
  const fl = new Map();            // flake id -> {minAct, minNo, hooked}
  let windMiss = 0, windAssist = 0, swaySnap = 0, snaps = 0, escapes = 0, hooks = 0, catches = 0, goldSpawn = 0, goldCatch = 0;
  let escWind = 0;                 // escapes while |wind| > 0.5 (reel under a strong gust)
  const snapLevels = [], firstPoint = { t: null };
  let t = 0;
  const finish = (id) => {
    const s = fl.get(id); if (!s) return;
    if (!s.hooked && s.minNo < 0.85 && s.minAct > 1) windMiss++;   // the straight line would have touched it, the bowed one didn't
    fl.delete(id);
  };
  while (t < maxT && w.phase !== 'over' && w.level < (job.maxLevel || 1e9)) {
    p.step(dt); w.update(dt); t += dt;
    for (const e of w.drainEvents()) {
      if (e.type === 'hook') {
        hooks++; const it = e.item, s = fl.get(it.id); if (s) s.hooked = true;
        const rr = it.r + w.hook.r, dNo = Math.hypot(it.ax0 - w.layout.holeX, it.ay0 - w.hook.y);
        if (dNo > rr * 1.15) windAssist++;
      } else if (e.type === 'catch') { catches++; if (firstPoint.t === null) firstPoint.t = t; if (e.item && e.item.type === 'gold') goldCatch++; }
      else if (e.type === 'reelGood' && e.perfect && firstPoint.t === null) firstPoint.t = t;
      else if (e.type === 'escape') { escapes++; if (Math.abs(w.wind.value) > 0.5) escWind++; }
      else if (e.type === 'golden') goldSpawn++;
      else if (e.type === 'puff') {
        snaps++; snapLevels.push(w.level);
        const g = e.item, dNo = Math.hypot(g.x - w.layout.holeX, g.y - w.hook.y);
        if (dNo > g.r0 + w.hook.r) swaySnap++;
      }
    }
    // wind-miss tracking: only while the player controls a live hook in the water
    const hk = w.hook;
    const live = w.phase === 'roam' && !hk.lost && !hk.drop && hk.y >= w.layout.waterTop;
    const seen = new Set();
    for (const it of w.items) {
      if (it.kind !== 'flake') continue;
      if (it.state !== 'swim') { if (it.state !== 'hooked') finish(it.id); continue; }
      seen.add(it.id);
      let s = fl.get(it.id); if (!s) fl.set(it.id, s = { minAct: 9, minNo: 9, hooked: false });
      if (!live) continue;
      const rr = it.r + hk.r;
      s.minAct = Math.min(s.minAct, Math.hypot(it.x - hk.x, it.y - hk.y) / rr);
      s.minNo = Math.min(s.minNo, Math.hypot(it.x - w.layout.holeX, it.y - hk.y) / rr);
    }
    for (const id of [...fl.keys()]) if (!seen.has(id) && !(w.reel.active && w.reel.itemId === id)) finish(id);
  }
  return { label: job.label, diff: job.diff, size: job.size || 'land', wind: job.windOff ? 'off' : 'on', seed: job.seed,
    time: t, over: w.phase === 'over', level: w.level, score: w.score, flakes: w.totalFlakes, firstPoint: firstPoint.t,
    zoneTimes: w.stats.zoneTimes, hooks, catches, escapes, escWind, snaps, swaySnap, windMiss, windAssist, goldSpawn, goldCatch,
    perfect: w.stats.perfect, good: w.stats.good, slip: w.stats.slip, gusts: w.stats.gusts };
}

// ------------------------------------------------------------------ job lists
const DIFFS = ['easy', 'normal', 'hard'];
const CORE = [
  { label: 'bot 1.00', player: 'bot', opts: { skill: 1 } },
  { label: 'bot 0.75', player: 'bot', opts: { skill: 0.75 } },
  { label: 'bot 0.50', player: 'bot', opts: { skill: 0.5 } },
  { label: 'bot 0.30', player: 'bot', opts: { skill: 0.3 } },
  { label: 'kid 5-6', player: 'kid' },
  { label: 'kid hesitant', player: 'kidHesitant' },
  { label: 'casual adult', player: 'adult' },
];
const EXPLOIT = [
  { label: 'mash 8-10 Hz', player: 'spam' },
  { label: 'mash reel only', player: 'spamReel' },
  { label: 'hold forever', player: 'camper', opts: { depth: 1 } },
  { label: 'never press', player: 'camper', opts: { depth: 0 } },
];
const NOWIND = { 'difficulty.easy.driftMax': 0, 'difficulty.easy.current': 0, 'difficulty.normal.driftMax': 0, 'difficulty.normal.current': 0,
  'difficulty.hard.driftMax': 0, 'difficulty.hard.current': 0 };

function jobs(suite, a) {
  const J = [];
  const add = (m, diff, size, extra) => { for (let s = 1; s <= a.n; s++) J.push(Object.assign({}, m, { diff, size, seed: 7000 + s, maxTime: a.min * 60 }, extra || {})); };
  if (suite === 'main') {
    for (const size of ['land', 'port']) for (const m of CORE.concat(EXPLOIT)) for (const d of DIFFS) add(m, d, size);
    for (const m of CORE) for (const d of DIFFS) add(m, d, 'land', { windOff: true });
  }
  if (suite === 'exploit') {
    for (const d of ['easy', 'normal']) {
      for (const dep of [0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 1]) add({ label: 'camper ' + dep.toFixed(2), player: 'camper', opts: { depth: dep } }, d, 'land');
      for (const hz of [1.5, 2.5, 4]) add({ label: 'rhythm ' + hz + ' Hz', player: 'rhythm', opts: { hz } }, d, 'land');
      add({ label: 'kid mash reel', player: 'kidMash' }, d, 'land');
    }
  }
  if (suite === 'level1') {
    for (const m of [CORE[4], CORE[5], CORE[6]]) for (const d of DIFFS) for (const size of ['land', 'port'])
      for (let s = 1; s <= a.n; s++) J.push(Object.assign({}, m, { diff: d, size, seed: 9000 + s, maxTime: 600, maxLevel: 1 }));
  }
  return J;
}

// ------------------------------------------------------------------ tables
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
const pct = (a, q) => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const f0 = v => isFinite(v) ? v.toFixed(0) : '–', f1 = v => isFinite(v) ? v.toFixed(1) : '–', f2 = v => isFinite(v) ? v.toFixed(2) : '–';
const ppp = (a, f) => `${f(pct(a, 0.1))} / ${f(pct(a, 0.5))} / ${f(pct(a, 0.9))}`;
function group(recs, key) { const g = new Map(); for (const r of recs) { const k = key(r); if (!g.has(k)) g.set(k, []); g.get(k).push(r); } return g; }
const sum = (rs, k) => rs.reduce((s, r) => s + r[k], 0);

function summary(rs) {
  const played = rs.reduce((s, r) => s + r.level + 1, 0), mins = sum(rs, 'time') / 60;
  const zt = [].concat(...rs.map(r => r.zoneTimes.slice(0, 4))), ztAll = [].concat(...rs.map(r => r.zoneTimes));
  const taps = sum(rs, 'perfect') + sum(rs, 'good') + sum(rs, 'slip');
  return {
    n: rs.length, over: rs.filter(r => r.over).length / rs.length,
    surv: rs.map(r => r.time / 60), score: rs.map(r => r.score), first: rs.map(r => r.firstPoint == null ? Infinity : r.firstPoint),
    levels: mean(rs.map(r => r.level)), zt, ztAll, inBand: ztAll.filter(x => x >= 45 && x <= 90).length / Math.max(1, ztAll.length),
    l1: rs.filter(r => r.zoneTimes.length).map(r => r.zoneTimes[0]),
    escLv: sum(rs, 'escapes') / played, snapLv: sum(rs, 'snaps') / played, swaySnap: sum(rs, 'swaySnap') / Math.max(1, sum(rs, 'snaps')),
    escWind: sum(rs, 'escWind') / Math.max(1, sum(rs, 'escapes')),
    windMissLv: sum(rs, 'windMiss') / played, windAssistLv: sum(rs, 'windAssist') / played, catchHook: sum(rs, 'catches') / Math.max(1, sum(rs, 'hooks')),
    goldMin: sum(rs, 'goldSpawn') / mins, goldLv: sum(rs, 'goldSpawn') / played, goldCaught: sum(rs, 'goldCatch') / Math.max(1, sum(rs, 'goldSpawn')),
    perfect: sum(rs, 'perfect') / Math.max(1, taps), fpm: sum(rs, 'catches') / mins,
  };
}

function mainTable(recs) {
  const out = [];
  const head = '| player | diff | game over | survived min p10/p50/p90 | score p10/p50/p90 | first point s p10/p50/p90 | levels cleared (mean) | level s p10/p50/p90 (L1–4) | level s in 45–90 | escapes/level | snaps/level | flakes/min | Perfect % |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|';
  for (const [sz, wd] of [['land', 'on'], ['port', 'on'], ['land', 'off']]) {
    const sub = recs.filter(r => r.size === sz && r.wind === wd); if (!sub.length) continue;
    out.push(`\n#### ${sz === 'land' ? 'landscape 960×540' : 'portrait 560×1212'}, wind ${wd}\n`, head);
    for (const [k, rs] of group(sub, r => r.label + '|' + r.diff)) {
      const [pl, d] = k.split('|'), s = summary(rs);
      out.push(`| ${pl} | ${d} | ${f0(100 * s.over)}% | ${ppp(s.surv, f1)} | ${ppp(s.score, f0)} | ${ppp(s.first, f0)} | ${f1(s.levels)} | ${ppp(s.zt, f0)} | ${f0(100 * s.inBand)}% | ${f2(s.escLv)} | ${f2(s.snapLv)} | ${f1(s.fpm)} | ${f0(100 * s.perfect)} |`);
    }
  }
  return out.join('\n');
}

function windTable(recs) {
  const out = ['| player | diff | snaps/level on → off | escapes/level on → off | level s p50 on → off | game over on → off | snaps where the sway moved the hook into the gummy | escapes during a strong gust (|wind|>0.5) | wind misses / level (straight line would have hooked) | wind assists / level | catch/hook on → off |', '|---|---|---|---|---|---|---|---|---|---|---|'];
  const on = group(recs.filter(r => r.size === 'land' && r.wind === 'on'), r => r.label + '|' + r.diff);
  const off = group(recs.filter(r => r.size === 'land' && r.wind === 'off'), r => r.label + '|' + r.diff);
  for (const [k, rs] of off) {
    const [pl, d] = k.split('|'), a = summary(on.get(k)), b = summary(rs);
    out.push(`| ${pl} | ${d} | ${f2(a.snapLv)} → ${f2(b.snapLv)} | ${f2(a.escLv)} → ${f2(b.escLv)} | ${f0(pct(a.zt, 0.5))} → ${f0(pct(b.zt, 0.5))} | ${f0(100 * a.over)}% → ${f0(100 * b.over)}% | ${f0(100 * a.swaySnap)}% | ${f0(100 * a.escWind)}% | ${f2(a.windMissLv)} | ${f2(a.windAssistLv)} | ${f0(100 * a.catchHook)}% → ${f0(100 * b.catchHook)}% |`);
  }
  return out.join('\n');
}

function goldTable(recs) {
  const out = ['| player | diff | golden / min | golden / level | caught / spawned |', '|---|---|---|---|---|'];
  for (const [k, rs] of group(recs.filter(r => r.size === 'land' && r.wind === 'on'), r => r.label + '|' + r.diff)) {
    const [pl, d] = k.split('|'), s = summary(rs);
    out.push(`| ${pl} | ${d} | ${f2(s.goldMin)} | ${f2(s.goldLv)} | ${f0(100 * s.goldCaught)}% |`);
  }
  return out.join('\n');
}

function levelTable(recs) {   // per-level medians L1..L8 (landscape, wind on)
  const out = ['| player | diff | ' + [1, 2, 3, 4, 5, 6, 7, 8].map(i => 'L' + i).join(' | ') + ' |', '|---|---|' + '---|'.repeat(8)];
  for (const [k, rs] of group(recs.filter(r => r.size === 'land' && r.wind === 'on'), r => r.label + '|' + r.diff)) {
    const [pl, d] = k.split('|'), c = [];
    for (let i = 0; i < 8; i++) { const v = rs.filter(r => r.zoneTimes.length > i).map(r => r.zoneTimes[i]); c.push(v.length >= 3 ? f0(pct(v, 0.5)) + (v.length < rs.length ? '*' : '') : '–'); }
    out.push(`| ${pl} | ${d} | ${c.join(' | ')} |`);
  }
  return out.join('\n');
}

function simpleTable(recs) {
  const out = ['| player | diff | game over | survived min p50 | score p10/p50/p90 | levels cleared | snaps/level | escapes/level | catch/hook | flakes/min |', '|---|---|---|---|---|---|---|---|---|---|'];
  for (const [k, rs] of group(recs, r => r.label + '|' + r.diff)) {
    const [pl, d] = k.split('|'), s = summary(rs);
    out.push(`| ${pl} | ${d} | ${f0(100 * s.over)}% | ${f1(pct(s.surv, 0.5))} | ${ppp(s.score, f0)} | ${f1(s.levels)} | ${f2(s.snapLv)} | ${f2(s.escLv)} | ${f0(100 * s.catchHook)}% | ${f1(s.fpm)} |`);
  }
  return out.join('\n');
}

function level1Table(recs) {
  const out = ['| player | diff | size | clears L1 | L1 s p10/p50/p90 | first point s p50 | lines lost in L1 | escapes in L1 |', '|---|---|---|---|---|---|---|---|'];
  for (const [k, rs] of group(recs, r => r.label + '|' + r.diff + '|' + r.size)) {
    const [pl, d, sz] = k.split('|'), s = summary(rs);
    out.push(`| ${pl} | ${d} | ${sz} | ${f1(100 * s.l1.length / rs.length)}% | ${ppp(s.l1, f0)} | ${f0(pct(s.first, 0.5))} | ${f2(sum(rs, 'snaps') / rs.length)} | ${f2(sum(rs, 'escapes') / rs.length)} |`);
  }
  return out.join('\n');
}

// ------------------------------------------------------------------ runner
function runJobs(J, set) {
  const nW = Math.max(1, Math.min(os.cpus().length, 8));
  const chunks = Array.from({ length: nW }, () => []);
  J.forEach((j, i) => chunks[i % nW].push(j));
  return Promise.all(chunks.map(ch => new Promise((res, rej) => {
    const wk = new Worker(__filename, { workerData: { jobs: ch, set } }); wk.on('message', res); wk.on('error', rej);
  }))).then(p => [].concat(...p));
}

if (!isMainThread) {
  const base = loadPR(workerData.set), nowind = loadPR(Object.assign({}, workerData.set, NOWIND));
  parentPort.postMessage(workerData.jobs.map(j => playRound(j.windOff ? nowind : base, j)));
} else main();

async function main() {
  const a = { suite: process.argv[2] || 'main', n: 0, min: 10, set: null, tag: '' };
  for (let i = 3; i < process.argv.length; i++) {
    const k = process.argv[i];
    if (k === '--n') a.n = +process.argv[++i]; else if (k === '--min') a.min = +process.argv[++i];
    else if (k === '--set') a.set = JSON.parse(process.argv[++i]); else if (k === '--set-file') a.set = JSON.parse(fs.readFileSync(process.argv[++i], 'utf8'));
    else if (k === '--tag') a.tag = '-' + process.argv[++i];
    else if (k === '--only') a.only = process.argv[++i].split(',');          // e.g. 'easy,normal' or 'kid 5-6' or 'easy:kid 5-6'
    else if (k === '--nowind') a.nowind = process.argv[++i] !== '0';
  }
  a.n = a.n || { main: 60, exploit: 60, level1: 400 }[a.suite];
  const t0 = Date.now();
  let J = jobs(a.suite, a);
  if (a.only) J = J.filter(j => a.only.some(o => o === j.diff || o === j.label || o === j.diff + ':' + j.label || o === j.size));
  if (a.nowind === false) J = J.filter(j => !j.windOff);
  const recs = await runJobs(J, a.set);
  let md = `## playtest ${a.suite}${a.tag} — ${a.n} rounds per cell, ≤ ${a.min} min${a.set ? '\n\nCONFIG overrides: `' + JSON.stringify(a.set) + '`' : ''}\n`;
  if (a.suite === 'main') md += `\n### rounds\n${mainTable(recs)}\n\n### per-level median s (landscape)\n\n${levelTable(recs)}\n\n### wind on vs off (landscape)\n\n${windTable(recs)}\n\n### golden flake\n\n${goldTable(recs)}\n`;
  if (a.suite === 'exploit') md += '\n' + simpleTable(recs) + '\n';
  if (a.suite === 'level1') md += '\n' + level1Table(recs) + '\n';
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `playtest-${a.suite}${a.tag}.md`), md);
  // compact json of per-cell summaries (for diffs between variants)
  const js = {};
  for (const [k, rs] of group(recs, r => [r.label, r.diff, r.size, r.wind].join('|'))) {
    const s = summary(rs);
    js[k] = { over: s.over, survP50: pct(s.surv, 0.5), scoreP50: pct(s.score, 0.5), firstP50: pct(s.first, 0.5), levels: s.levels,
      ztP10: pct(s.zt, 0.1), ztP50: pct(s.zt, 0.5), ztP90: pct(s.zt, 0.9), inBand: s.inBand, l1P50: pct(s.l1, 0.5), l1Clear: s.l1.length / rs.length,
      escLv: s.escLv, snapLv: s.snapLv, swaySnap: s.swaySnap, windMissLv: s.windMissLv, goldMin: s.goldMin, goldCaught: s.goldCaught, catchHook: s.catchHook, fpm: s.fpm };
  }
  fs.writeFileSync(path.join(OUT, `playtest-${a.suite}${a.tag}.json`), JSON.stringify(js, null, 1));
  console.log(md);
  console.log(`${recs.length} rounds in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
