#!/usr/bin/env node
// Bristle's Moon Pop — quick headless balance sim: MP.Bot skills × difficulties.
//   node tests/sim/run.js [N] [maxMinutes]     default N = 30 rounds per cell, 15 min game-time cap
// Prints a markdown table; also writes tests/sim/results/latest.md. Runs on up to 4 child processes.
'use strict';
const fs = require('fs');
const path = require('path');
const P = require('./players');

const SKILLS = ['bot0.3', 'bot0.5', 'bot0.8', 'bot1.0'], DIFFS = ['easy', 'normal', 'hard'];
const N = +process.argv[2] || 30, maxMin = +process.argv[3] || 15;
const jobs = P.makeJobs(SKILLS, DIFFS, N, maxMin, null), t0 = Date.now();
P.runAll(jobs, 0, (out) => {
  const S = P.cells(jobs, out), f = P.f, pct = P.pct;
  let md = `# Bot sim — ${N} rounds per cell, ${maxMin} min cap (MP.Bot sees everything; see players.js for kid models)\n\n`;
  md += '| Diff | Bot skill | Survival min med | Died ≤ cap | Score med | Level med | Clear L1 / loop 1 | s per level dawn / noon / sunset / night | 1st pop s | Bonks/min | Air pops | Best chain |\n';
  md += '|---|---|---|---|---|---|---|---|---|---|---|---|\n';
  for (const d of DIFFS) for (const m of SKILLS) {
    const s = S[m + '|' + d];
    md += `| ${d} | ${m.slice(3)} | ${f(s.surv[1], 1)} | ${pct(s.died)} | ${f(s.score[1])} | ${f(s.level)} | ${pct(s.clear1)} / ${pct(s.loop1)} | ${s.lvMed.map(v => f(v)).join(' / ')} | ${f(s.firstPop, 1)} | ${f(s.bonkMin, 2)} | ${pct(s.airShare)} | ${f(s.chain)} |\n`;
  }
  md += `\n${jobs.length} runs in ${((Date.now() - t0) / 1000).toFixed(0)} s.\n`;
  console.log(md);
  const dir = path.join(__dirname, 'results');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'latest.md'), md);
});
