#!/usr/bin/env node
// Spike's Dino Jam — quick config sweep for the kid model (prototype CONFIG overrides, no game/js edits).
//   node tests/sim/sweep.js [N] [model] [arena]     default 80 rounds, kid, land
// Each round stops after lap 1 (4 biomes) or game over or 8 min. Writes tests/sim/results/sweep-<model>-<arena>.md
'use strict';
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');

const VARIANTS = {
  easy: {
    A_current: {},
    B_slow: { speed0: 105, speedPerBiome: 4 },
    C_slow_tail: { speed0: 105, speedPerBiome: 4, safeNeck: 7, bonkR: 12 },
    D_C_songs: { speed0: 105, speedPerBiome: 4, safeNeck: 7, bonkR: 12, songTargets: [8, 10, 12, 14] },
    E_D_invuln_edge: { speed0: 105, speedPerBiome: 4, safeNeck: 7, bonkR: 12, songTargets: [8, 10, 12, 14], invulnTime: 2.2, edgeSafe: 46 },
    F_E_heal2: { speed0: 105, speedPerBiome: 4, safeNeck: 7, bonkR: 12, songTargets: [8, 10, 12, 14], invulnTime: 2.2, edgeSafe: 46, healOnClear: 2 }
  },
  normal: {
    A_current: {},
    B_slow: { speed0: 135, speedPerBiome: 5 },
    C_slow_tail: { speed0: 135, speedPerBiome: 5, safeNeck: 5, bonkR: 15 },
    D_C_songs: { speed0: 135, speedPerBiome: 5, safeNeck: 5, bonkR: 15, songTargets: [10, 12, 15, 18] },
    E_D_invuln_edge: { speed0: 135, speedPerBiome: 5, safeNeck: 5, bonkR: 15, songTargets: [10, 12, 15, 18], invulnTime: 1.8, edgeSafe: 44 },
    F_E_heal2: { speed0: 135, speedPerBiome: 5, safeNeck: 5, bonkR: 15, songTargets: [10, 12, 15, 18], invulnTime: 1.8, edgeSafe: 44, healOnClear: 2 }
  }
};
const V = process.env.SWEEP ? JSON.parse(fs.readFileSync(process.env.SWEEP, 'utf8')) : VARIANTS;

if (process.argv[2] === '--worker') {
  const { runGame } = require('./players');
  process.on('message', (m) => { if (m === 'exit') process.exit(0); process.send({ i: m.i, r: runGame(m.job) }); });
} else {
  const N = +process.argv[2] || 80, model = process.argv[3] || 'kid', arena = process.argv[4] || 'land';
  const jobs = [];
  for (const diff in V) for (const v in V[diff]) for (let k = 0; k < N; k++)
    jobs.push({ model, diff, arena, over: V[diff][v], label: v, seed: 9000 + k * 7919, maxMin: 8, stopAfter: 3 });
  const out = new Array(jobs.length);
  let next = 0, done = 0;
  const t0 = Date.now();
  for (let k = 0; k < Math.min(4, require('os').cpus().length); k++) {
    const ch = fork(__filename, ['--worker']);
    const feed = () => { if (next < jobs.length) { ch.send({ i: next, job: jobs[next] }); next++; } else ch.send('exit'); };
    ch.on('message', (m) => { out[m.i] = m.r; if (++done === jobs.length) report(); feed(); });
    feed();
  }
  function report() {
    const med = a => { a = a.filter(v => v !== undefined && v !== null && isFinite(v)).sort((x, y) => x - y); return a.length ? a[a.length >> 1] : NaN; };
    const f = (v, d) => (isFinite(v) ? v.toFixed(d || 0) : '–');
    let md = `# Sweep — ${model} on ${arena}, ${N} rounds per row, stop after biome 4 / game over / 8 min\n\n`;
    md += '| Diff | Variant | Clear biome 1 / 2 / 3 / 4 | s per biome (median of clears) | Bonks/min | Pillow hits/min | Survival min (median) | Overrides |\n|---|---|---|---|---|---|---|---|\n';
    let i = 0;
    for (const diff in V) for (const v in V[diff]) {
      const rs = out.slice(i, i + N); i += N;
      const mins = rs.reduce((a, r) => a + r.t / 60, 0);
      md += `| ${diff} | ${v} | ${[0, 1, 2, 3].map(z => f(100 * rs.filter(r => r.lap0[z] !== undefined).length / N) + '%').join(' / ')} | ` +
        `${[0, 1, 2, 3].map(z => f(med(rs.map(r => r.lap0[z])))).join(' / ')} | ${f(rs.reduce((a, r) => a + r.bonks, 0) / mins, 2)} | ` +
        `${f(rs.reduce((a, r) => a + r.hits, 0) / mins, 2)} | ${f(med(rs.map(r => r.t / 60)), 1)} | \`${JSON.stringify(V[diff][v])}\` |\n`;
    }
    md += `\n(${jobs.length} games, ${((Date.now() - t0) / 1000).toFixed(0)} s)\n`;
    console.log(md);
    fs.mkdirSync(path.join(__dirname, 'results'), { recursive: true });
    fs.writeFileSync(path.join(__dirname, 'results', `sweep-${model}-${arena}${process.env.SWEEP ? '-' + path.basename(process.env.SWEEP, '.json') : ''}.md`), md);
  }
}
