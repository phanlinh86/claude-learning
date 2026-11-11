#!/usr/bin/env node
// Zippy's Jungle Boop — high-speed playtest sweep. REPORT-ONLY (does not touch game/js).
// Run from projects/daily-game/snail-jungle-boop:
//   node tests/sim/run.js            → baseline CONFIG and the recommended patch, side by side (markdown tables)
//   node tests/sim/run.js --quick    → fewer seeds
// Results also go to tests/sim/out/<patch>.json.
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('./harness');
const { pct, mean, f0, f1 } = H;

/** the recommended CONFIG diff (keep in sync with docs/reports/playtest.md) */
const PATCHES = {
  base: null,
  rec: {
    START_LEAVES: 4,           // was 3
    GRACE: 1.5,                // was 0.8
    DIFFICULTY: { easy: { up: 2.8, interval: 3.0, matchP: 0.75 } }   // was up 2.6, interval 2.4, matchP 0.65
  }
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
  const wa = {}; rs.forEach(r => { for (const k in r.wrongAfter) wa[k] = (wa[k] || 0) + r.wrongAfter[k]; });
  const surv = rs.map(r => r.t), score = rs.map(r => r.score), fb = rs.map(r => r.firstBoop).filter(x => x >= 0);
  return {
    model, diff, N, cap, skill: extra && extra.skill,
    alive: rs.filter(r => !r.over).length / N,
    surv: [pct(surv, .1), pct(surv, .5), pct(surv, .9)],
    score: [pct(score, .1), pct(score, .5), pct(score, .9)],
    levels: pct(rs.map(r => r.level), .5), l0: rs.filter(r => r.level >= 1).length / N,
    firstBoop: pct(fb, .5), noBoop: rs.filter(r => r.firstBoop < 0).length / N,
    lt: lt.map(a => mean(a)), wrongShare: W / Math.max(1, W + M),
    ppm: mean(rs.map(r => r.score / (r.t / 60))),
    wrongAfter: wa, wrong: W,
    maxPopGap: Math.max(...rs.map(r => r.maxPopGap)), maxNoMatch: Math.max(...rs.map(r => r.maxNoMatch)), nan: rs.some(r => r.nan),
    colourChanges: mean(rs.map(r => r.colourChanges / (r.t / 60))), leaves: pct(rs.map(r => r.leaves), .5),
    firstLeafLost: pct(rs.map(r => r.firstLeafLostT).filter(x => x >= 0), .5)
  };
}

function sweep(name) {
  const Z = H.load(PATCHES[name]);
  const out = { patch: name, config: PATCHES[name], bots: [], humans: [], kidClear: null, long: [], idle: [] };
  const t0 = Date.now();
  for (const d of DIFFS) for (const sk of [0.3, 0.5, 0.8, 1]) out.bots.push(cell(Z, 'bot', d, n(200), 600, { skill: sk }));
  for (const d of DIFFS) for (const m of ['kid4', 'parent', 'kidSpam', 'tapAll', 'mash', 'mash4', 'preTap', 'smartSpam']) out.humans.push(cell(Z, m, d, n(300), 600));
  for (const d of DIFFS) out.idle.push(cell(Z, 'idle', d, n(30), 1800));
  // the 4-year-old's first biome, many seeds
  {
    const N = n(2000), tt = []; let ok = 0; const fb = [];
    for (let s = 1; s <= N; s++) {
      const r = H.run(Z, { model: 'kid4', diff: 'easy', seed: 100000 + s, cap: 300, stopAtLevel: 1 });
      if (r.level >= 1) { ok++; tt.push(r.levelTimes[0]); }
      if (r.firstBoop >= 0) fb.push(r.firstBoop);
    }
    out.kidClear = { N, rate: ok / N, t: [pct(tt, .1), pct(tt, .5), pct(tt, .9)], firstBoop: [pct(fb, .5), pct(fb, .9)] };
  }
  // can Easy be played forever?
  for (const [m, sk] of [['parent'], ['bot', 0.3], ['bot', 1], ['kid4']]) out.long.push(cell(Z, m, 'easy', n(40), 1800, sk === undefined ? {} : { skill: sk }));
  // prototype mash guard (code-side idea, not CONFIG): 3 empty taps within 1 s → 1.5 s nap
  const GUARD = { n: 3, win: 1.0, nap: 1.5 };
  out.guard = [];
  for (const m of ['kid4', 'parent', 'mash', 'mash4', 'preTap', 'tapAll']) {
    out.guard.push({ off: cell(Z, m, 'easy', n(300), 600), on: cell(Z, m, 'easy', n(300), 600, { guard: GUARD }) });
  }
  out.ms = Date.now() - t0;
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', name + '.json'), JSON.stringify(out, null, 1));
  return out;
}

function label(c) { return c.model === 'bot' ? 'bot ' + c.skill : c.model; }
function tables(o) {
  const L = [];
  L.push(`\n### patch: ${o.patch}  (${(o.ms / 1000).toFixed(0)} s of CPU)\n`);
  L.push('| player | diff | N | alive @600 s | survival p10/p50/p90 s | score p10/p50/p90 | levels p50 | L0 cleared | 1st boop p50 s | s/level L0/L1/L2/L3+ | wrong share | pts/min |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const c of [...o.bots, ...o.humans]) L.push(`| ${label(c)} | ${c.diff} | ${c.N} | ${f0(100 * c.alive)}% | ${c.surv.map(f0).join('/')} | ${c.score.map(f0).join('/')} | ${c.levels} | ${f0(100 * c.l0)}% | ${f1(c.firstBoop)} | ${c.lt.map(f0).join('/')} | ${f0(100 * c.wrongShare)}% | ${f0(c.ppm)} |`);
  L.push('\nIdle (never taps), 1800 s cap:\n\n| diff | game over | survival p50 s | leaves left p50 | colour changes / min | max pop gap s |\n|---|---|---|---|---|---|');
  for (const c of o.idle) L.push(`| ${c.diff} | ${f0(100 * (1 - c.alive))}% | ${f0(c.surv[1])} | ${c.leaves} | ${f1(c.colourChanges)} | ${f1(c.maxPopGap)} |`);
  const k = o.kidClear;
  L.push(`\n4-year-old, Riverbank on Easy: cleared ${f0(100 * k.rate)}% of ${k.N}; clear time p10/p50/p90 ${k.t.map(f0).join('/')} s; first boop p50/p90 ${k.firstBoop.map(f1).join('/')} s`);
  L.push('\nEasy, 1800 s cap:\n\n| player | N | alive @1800 s | survival p50 s | levels p50 |\n|---|---|---|---|---|');
  for (const c of o.long) L.push(`| ${label(c)} | ${c.N} | ${f0(100 * c.alive)}% | ${f0(c.surv[1])} | ${c.levels} |`);
  L.push('\nWrong taps by time since the last colour change (all difficulties):\n\n| player | wrong taps | < 1 s | 1–2 s | 2–3 s | > 3 s | old colour within 4 s |\n|---|---|---|---|---|---|---|');
  const agg = {};
  for (const c of [...o.bots, ...o.humans]) {
    const a = agg[label(c)] = agg[label(c)] || { w: 0, lt1: 0, b1_2: 0, b2_3: 0, gt3: 0, stale: 0 };
    a.w += c.wrong; for (const kk of ['lt1', 'b1_2', 'b2_3', 'gt3', 'stale']) a[kk] += c.wrongAfter[kk] || 0;
  }
  for (const [lb, a] of Object.entries(agg)) if (a.w) L.push(`| ${lb} | ${a.w} | ${f0(100 * a.lt1 / a.w)}% | ${f0(100 * a.b1_2 / a.w)}% | ${f0(100 * a.b2_3 / a.w)}% | ${f0(100 * a.gt3 / a.w)}% | ${f0(100 * a.stale / a.w)}% |`);
  L.push('\nPrototype mash guard on Easy (3 empty taps within 1 s → 1.5 s nap), 600 s cap:\n\n| player | survival p50 off → on | pts/min off → on | levels p50 off → on |\n|---|---|---|---|');
  for (const g of o.guard) L.push(`| ${label(g.off)} | ${f0(g.off.surv[1])} → ${f0(g.on.surv[1])} | ${f0(g.off.ppm)} → ${f0(g.on.ppm)} | ${g.off.levels} → ${g.on.levels} |`);
  const all = [...o.bots, ...o.humans, ...o.idle, ...o.long];
  L.push(`\nStall check: max gap between pops ${f1(Math.max(...all.map(c => c.maxPopGap)))} s; max time with no matching critter visible ${f1(Math.max(...all.map(c => c.maxNoMatch)))} s; NaN positions: ${all.some(c => c.nan) ? 'YES' : 'none'}`);
  return L.join('\n');
}

const which = process.argv.slice(2).filter(a => !a.startsWith('--'));
for (const name of which.length ? which : ['base', 'rec']) console.log(tables(sweep(name)));
