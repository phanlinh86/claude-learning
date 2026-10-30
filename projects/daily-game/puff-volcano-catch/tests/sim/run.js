#!/usr/bin/env node
// Puff's Volcano Catch — quick headless balance sim (VC.Bot × difficulty).
//   node tests/sim/run.js [N] [maxMinutes]     default N = 100 rounds per cell, 15 min game-time cap
// Prints a markdown table; also writes tests/sim/results/latest.md. Runs on 2 child processes.
'use strict';
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const { load } = require('../unit/load');

const SKILLS = [0.4, 0.7, 1.0], DIFFS = ['easy', 'normal', 'hard'];

function runGame(job) {
  const VC = load(['rng.js', 'world.js', 'bot.js']);
  const w = new VC.World({ seed: job.seed, config: VC.DIFFICULTY[job.diff] });
  const bot = new VC.Bot(w, { skill: job.skill, seed: job.seed * 13 + 5 });
  const dt = 1 / 60, maxT = job.maxMin * 60;
  let t = 0, levelStart = 0, perZone = [null, null, null, null];
  const lap0 = [];
  let catchesL0 = 0, missesL0 = 0;
  while (w.state !== 'dead' && t < maxT) {
    bot.step(dt); w.update(dt); t += dt;
    for (const e of w.drainEvents()) {
      if (e.type === 'cleared') { if (e.level < 4) lap0[e.level] = w.time - levelStart; }
      if (e.type === 'zone') levelStart = w.time;
      if (w.level === 0) { if (e.type === 'catch') catchesL0++; if (e.type === 'miss') missesL0++; }
    }
  }
  bot.step(dt);   // sync the final stats
  const s = bot.stats;
  return {
    t, score: w.score, level: w.level, dead: w.state === 'dead', catches: s.catches, misses: s.misses, ouches: s.ouches,
    rains: s.rains, steamed: s.steamed, bestCombo: w.bestCombo, lap0, l0rate: catchesL0 / Math.max(1, catchesL0 + missesL0)
  };
}

if (process.argv[2] === '--worker') {
  process.on('message', (m) => { if (m === 'exit') process.exit(0); process.send({ i: m.i, r: runGame(m.job) }); });
} else {
  const N = +process.argv[2] || 100, maxMin = +process.argv[3] || 15;
  const jobs = [];
  for (const diff of DIFFS) for (const skill of SKILLS) for (let k = 0; k < N; k++) jobs.push({ diff, skill, seed: 1000 + k * 7919, maxMin });
  const out = new Array(jobs.length);
  let next = 0, done = 0;
  const t0 = Date.now();
  const nW = Math.min(require('os').cpus().length, 4);
  for (let k = 0; k < nW; k++) {
    const ch = fork(__filename, ['--worker']);
    const feed = () => { if (next < jobs.length) { ch.send({ i: next, job: jobs[next] }); next++; } else ch.send('exit'); };
    ch.on('message', (m) => { out[m.i] = m.r; if (++done === jobs.length) report(); feed(); });
    feed();
  }
  function report() {
    const med = a => { a = a.filter(v => v !== undefined && v !== null && isFinite(v)).sort((x, y) => x - y); return a.length ? a[a.length >> 1] : NaN; };
    const mean = a => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
    const f = (v, d) => isFinite(v) ? v.toFixed(d === undefined ? 0 : d) : '–';
    let md = `# Sim results — ${N} rounds per cell, ${maxMin} min cap (VC.Bot, sees everything; a child plays like skill ≤ 0.4)\n\n`;
    md += '| Diff | Skill | Survival min (median) | Died ≤ cap | Score (median) | Level reached (median) | Clear L1 | Catch rate | Catch L1 | Ouches/min | Rains/min | Best combo | s per zone, lap 1: beach / jungle / ash / crater |\n';
    md += '|---|---|---|---|---|---|---|---|---|---|---|---|---|\n';
    let i = 0;
    for (const diff of DIFFS) for (const skill of SKILLS) {
      const rs = out.slice(i, i + N); i += N;
      const z = [0, 1, 2, 3].map(k => f(med(rs.map(r => r.lap0[k])), 0));
      md += `| ${diff} | ${skill} | ${f(med(rs.map(r => r.t / 60)), 1)} | ${f(100 * mean(rs.map(r => r.dead ? 1 : 0)))} % | ${f(med(rs.map(r => r.score)))} | ${f(med(rs.map(r => r.level)))} | ` +
        `${f(100 * mean(rs.map(r => r.level >= 1 ? 1 : 0)))} % | ${f(mean(rs.map(r => r.catches / Math.max(1, r.catches + r.misses))), 3)} | ${f(mean(rs.map(r => r.l0rate)), 3)} | ` +
        `${f(mean(rs.map(r => r.ouches / (r.t / 60))), 2)} | ${f(mean(rs.map(r => r.rains / (r.t / 60))), 1)} | ${f(med(rs.map(r => r.bestCombo)))} | ${z.join(' / ')} |\n`;
    }
    md += `\n${jobs.length} runs in ${((Date.now() - t0) / 1000).toFixed(0)} s.\n`;
    console.log(md);
    const dir = path.join(__dirname, 'results');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'latest.md'), md);
  }
}
