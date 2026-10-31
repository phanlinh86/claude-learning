#!/usr/bin/env node
// Spike's Dino Jam — headless playtest sim (DJ.Bot × difficulty).
//   node tests/sim/run.js [N] [maxMinutes] [diffs]   default N = 40 rounds per cell, 10 min cap, easy,normal,hard
// Prints a markdown table and writes tests/sim/results/latest.md. Runs on up to 4 child processes.
'use strict';
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const { load } = require('../unit/load');

const SKILLS = [0.4, 0.7, 1.0], DIFFS = (process.argv[4] || 'easy,normal,hard').split(',');

function runGame(job) {
  const DJ = load(['rng.js', 'world.js', 'bot.js']);
  const w = new DJ.World({ seed: job.seed, config: DJ.DIFFICULTY[job.diff] });
  const bot = new DJ.Bot(w, { skill: job.skill, seed: job.seed * 13 + 5 });
  const dt = 1 / 60, maxT = job.maxMin * 60;
  let t = 0, levelStart = 0, l1 = null, pillows = 0;
  const lap0 = [];
  while (w.state !== 'dead' && t < maxT) {
    bot.step(dt); w.update(dt); t += dt;
    for (const e of w.drainEvents()) {
      if (e.type === 'cleared') { if (e.level < 4) lap0[e.level] = w.time - levelStart; if (e.level === 0) l1 = w.time; }
      if (e.type === 'biome') levelStart = w.time;
      if (e.type === 'throw') pillows++;
    }
  }
  return { t, score: w.score, cleared: w.levelsCleared, dead: w.state === 'dead', bonks: w.bonks, hits: w.pillowHits,
    dodges: w.dodges, flips: w.flips, pillows, lap0, l1 };
}

if (process.argv[2] === '--worker') {
  process.on('message', (m) => { if (m === 'exit') process.exit(0); process.send({ i: m.i, r: runGame(m.job) }); });
} else {
  const N = +process.argv[2] || 40, maxMin = +process.argv[3] || 10;
  const jobs = [];
  for (const diff of DIFFS) for (const skill of SKILLS) for (let k = 0; k < N; k++) jobs.push({ diff, skill, seed: 1000 + k * 7919, maxMin });
  const out = new Array(jobs.length);
  let next = 0, done = 0;
  const t0 = Date.now();
  const nW = Math.max(1, Math.min(require('os').cpus().length, 4));
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
    let md = `# Sim results — ${N} rounds per cell, ${maxMin} min cap (DJ.Bot sees everything; a 6-year-old plays roughly like skill ≤ 0.4, about 2× slower)\n\n`;
    md += '| Diff | Skill | Survival min (median) | Died ≤ cap | Levels cleared (median) | Clear biome 1 | Biome 1 s (median) | s per level, lap 1: meadow / swamp / canyon / snow | Bonks/min | Pillow hits/min | Dodges/min | Pillows thrown/min | Score (median) |\n';
    md += '|---|---|---|---|---|---|---|---|---|---|---|---|---|\n';
    let i = 0;
    for (const diff of DIFFS) for (const skill of SKILLS) {
      const rs = out.slice(i, i + N); i += N;
      const mins = rs.reduce((a, r) => a + r.t / 60, 0);
      md += `| ${diff} | ${skill} | ${f(med(rs.map(r => r.t / 60)), 1)} | ${rs.filter(r => r.dead).length}/${N} | ${f(med(rs.map(r => r.cleared)))} | ` +
        `${rs.filter(r => r.l1 !== null).length}/${N} | ${f(med(rs.map(r => r.l1)))} | ` +
        `${[0, 1, 2, 3].map(z => f(med(rs.map(r => r.lap0[z])))).join(' / ')} | ` +
        `${f(rs.reduce((a, r) => a + r.bonks, 0) / mins, 2)} | ${f(rs.reduce((a, r) => a + r.hits, 0) / mins, 2)} | ` +
        `${f(rs.reduce((a, r) => a + r.dodges, 0) / mins, 2)} | ${f(rs.reduce((a, r) => a + r.pillows, 0) / mins, 1)} | ${f(med(rs.map(r => r.score)))} |\n`;
    }
    md += `\n(${((Date.now() - t0) / 1000).toFixed(1)} s wall time)\n`;
    console.log(md);
    const dir = path.join(__dirname, 'results');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'latest.md'), md);
  }
}
