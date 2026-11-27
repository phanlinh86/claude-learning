#!/usr/bin/env node
// Pip's Oasis Glow — high-speed playtest sweep. REPORT-ONLY (does not touch game/js).
// Run from projects/daily-game/frog-oasis-glow:
//   node tests/sim/run.js            → current CONFIG (markdown tables)
//   node tests/sim/run.js --quick    → fewer seeds (≈ ¼)
//   node tests/sim/run.js base alt   → several named PATCHES side by side
// Results also go to tests/sim/out/<patch>.json.
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('./harness');
const { pct, mean, f0, f1 } = H;

/** CONFIG patches to compare (deep-merged into World.CONFIG); `base` = the shipped CONFIG */
const PATCHES = {
  base: null,
  // what the forked colour game used on Easy (for comparison): longer gaps between pops
  slowEasy: { DIFFICULTY: { easy: { interval: 3.0 } } }
};

const QUICK = process.argv.includes('--quick');
const K = QUICK ? 0.25 : 1;
const n = x => Math.max(10, Math.round(x * K));
const DIFFS = ['easy', 'normal', 'hard'];

function cell(Z, model, diff, N, cap, extra) {
  const rs = [];
  for (let s = 1; s <= N; s++) rs.push(H.run(Z, Object.assign({ model, diff, seed: s, cap }, extra || {})));
  const W = rs.reduce((a, r) => a + r.taps.wrong, 0), M = rs.reduce((a, r) => a + r.taps.match, 0);
  const lt = [[], [], [], []]; rs.forEach(r => r.levelTimes.forEach((x, i) => lt[Math.min(i, 3)].push(x)));
  const surv = rs.map(r => r.t), score = rs.map(r => r.score), fb = rs.map(r => r.firstBoop).filter(x => x >= 0);
  const pops = rs.reduce((a, r) => a + r.pops, 0);
  return {
    model, diff, N, cap, skill: extra && extra.skill,
    alive: rs.filter(r => !r.over).length / N,
    surv: [pct(surv, .1), pct(surv, .5), pct(surv, .9)],
    score: [pct(score, .1), pct(score, .5), pct(score, .9)],
    levels: pct(rs.map(r => r.level), .5), l0: rs.filter(r => r.level >= 1).length / N,
    firstBoop: pct(fb, .5), lt: lt.map(a => mean(a)), wrongShare: W / Math.max(1, W + M),
    ppm: mean(rs.map(r => r.score / (r.t / 60))), wrong: W,
    goldShare: rs.reduce((a, r) => a + r.goldPops, 0) / Math.max(1, pops), sleepShare: rs.reduce((a, r) => a + r.sleepPops, 0) / Math.max(1, pops),
    naps: mean(rs.map(r => r.naps / (r.t / 60))),
    maxPopGap: Math.max(...rs.map(r => r.maxPopGap)), maxNoFirefly: Math.max(...rs.map(r => r.maxNoFirefly)), nan: rs.some(r => r.nan),
    pipY: [Math.min(...rs.map(r => r.minPipY)), Math.max(...rs.map(r => r.maxPipY))],
    leaves: pct(rs.map(r => r.leaves), .5)
  };
}

/** chapter 1 on Easy for one kid model, many seeds */
function kidClear(Z, model, N) {
  const tt = []; let ok = 0; const fb = [];
  for (let s = 1; s <= N; s++) {
    const r = H.run(Z, { model, diff: 'easy', seed: 100000 + s, cap: 300, stopAtLevel: 1 });
    if (r.level >= 1) { ok++; tt.push(r.levelTimes[0]); }
    if (r.firstBoop >= 0) fb.push(r.firstBoop);
  }
  return { model, N, rate: ok / N, t: [pct(tt, .1), pct(tt, .5), pct(tt, .9)], firstBoop: [pct(fb, .5), pct(fb, .9)] };
}

function sweep(name) {
  const Z = H.load(PATCHES[name]);
  const out = { patch: name, config: PATCHES[name], bots: [], humans: [], kids: [], long: [], idle: [] };
  const t0 = Date.now();
  for (const d of DIFFS) for (const sk of [0.3, 0.5, 0.8, 1]) out.bots.push(cell(Z, 'bot', d, n(100), 600, { skill: sk }));
  for (const d of DIFFS) for (const m of ['kid3', 'kid4', 'kid5', 'parent', 'kidSpam', 'tapAll', 'mash', 'mash4', 'preTap', 'smartSpam']) out.humans.push(cell(Z, m, d, n(100), 600));
  for (const d of DIFFS) out.idle.push(cell(Z, 'idle', d, n(20), 1200));
  for (const m of ['kid3', 'kid4', 'kid5']) out.kids.push(kidClear(Z, m, n(1000)));
  for (const [m, sk] of [['parent'], ['bot', 0.3], ['bot', 1], ['kid4']]) out.long.push(cell(Z, m, 'easy', n(30), 1800, sk === undefined ? {} : { skill: sk }));
  out.ms = Date.now() - t0;
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', name + '.json'), JSON.stringify(out, null, 1));
  return out;
}

function label(c) { return c.model === 'bot' ? 'bot ' + c.skill : c.model; }
function tables(o) {
  const L = [];
  L.push(`\n### patch: ${o.patch}  (${(o.ms / 1000).toFixed(0)} s of CPU)\n`);
  L.push('| player | diff | N | alive @600 s | survival p10/p50/p90 s | score p50 | levels p50 | ch.1 cleared | 1st boop p50 s | s/chapter 1/2/3/4+ | wrong share | pts/min |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const c of [...o.bots, ...o.humans]) L.push(`| ${label(c)} | ${c.diff} | ${c.N} | ${f0(100 * c.alive)}% | ${c.surv.map(f0).join('/')} | ${f0(c.score[1])} | ${c.levels} | ${f0(100 * c.l0)}% | ${f1(c.firstBoop)} | ${c.lt.map(f0).join('/')} | ${f0(100 * c.wrongShare)}% | ${f0(c.ppm)} |`);
  L.push('\nIdle (never taps), 1200 s cap:\n\n| diff | game over | survival p50 s | hearts left p50 | sleeper share of pops | gold share of pops | max pop gap s |\n|---|---|---|---|---|---|---|');
  for (const c of o.idle) L.push(`| ${c.diff} | ${f0(100 * (1 - c.alive))}% | ${f0(c.surv[1])} | ${c.leaves} | ${f0(100 * c.sleepShare)}% | ${f1(100 * c.goldShare)}% | ${f1(c.maxPopGap)} |`);
  L.push('\nChapter 1 (The Morning Spring) on Easy:\n\n| kid model | N | cleared | clear time p10/p50/p90 s | first boop p50/p90 s |\n|---|---|---|---|---|');
  for (const k of o.kids) L.push(`| ${k.model} | ${k.N} | ${f0(100 * k.rate)}% | ${k.t.map(f0).join('/')} | ${k.firstBoop.map(f1).join('/')} |`);
  L.push('\nEasy, 1800 s cap:\n\n| player | N | alive @1800 s | survival p50 s | levels p50 |\n|---|---|---|---|---|');
  for (const c of o.long) L.push(`| ${label(c)} | ${c.N} | ${f0(100 * c.alive)}% | ${f0(c.surv[1])} | ${c.levels} |`);
  const all = [...o.bots, ...o.humans, ...o.idle, ...o.long];
  L.push(`\nStall check: max gap between pops ${f1(Math.max(...all.map(c => c.maxPopGap)))} s; max time with no firefly holder visible ${f1(Math.max(...all.map(c => c.maxNoFirefly)))} s; ` +
    `Pip's y range ${f0(Math.min(...all.map(c => c.pipY[0])))}…${f0(Math.max(...all.map(c => c.pipY[1])))} px; NaN positions: ${all.some(c => c.nan) ? 'YES' : 'none'}`);
  return L.join('\n');
}

const which = process.argv.slice(2).filter(a => !a.startsWith('--'));
for (const name of which.length ? which : ['base']) console.log(tables(sweep(name)));
