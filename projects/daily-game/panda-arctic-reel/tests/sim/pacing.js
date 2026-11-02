#!/usr/bin/env node
// Bao's Arctic Reel — headless pacing sim (world + bot), numbers for docs/MECHANICS.md.
// Run from the project folder:  node tests/sim/pacing.js [seeds=8] [minutes=10]
'use strict';
const { load } = require('../unit/load');
const PR = load();
const SEEDS = +process.argv[2] || 8, MIN = +process.argv[3] || 10;
const rows = [];
for (const diff of ['easy', 'normal', 'hard']) for (const skill of [0.5, 0.75, 0.95]) {
  let t = 0, zones = 0, gems = 0, snaps = 0, esc = 0, over = 0, perf = 0, taps = 0, zt0 = [], zt = [];
  for (let seed = 1; seed <= SEEDS; seed++) {
    const w = new PR.World({ seed, difficulty: diff, width: 960, height: 540 });
    const b = new PR.Bot(w, { skill, seed: seed * 7 });
    let s = 0; const dt = 1 / 60;
    while (s < MIN * 60 && w.phase !== 'over') { b.step(dt); w.update(dt); w.drainEvents(); s += dt; }
    t += s; zones += w.level; gems += w.totalGems; snaps += w.stats.snaps; esc += w.stats.escapes;
    over += w.phase === 'over' ? 1 : 0; perf += w.stats.perfect; taps += w.stats.perfect + w.stats.good + w.stats.slip;
    if (w.stats.zoneTimes.length) zt0.push(w.stats.zoneTimes[0]);
    zt.push(...w.stats.zoneTimes.slice(0, 4));
  }
  const avg = a => a.length ? (a.reduce((x, y) => x + y, 0) / a.length) : NaN;
  rows.push({ diff, skill, zone1: avg(zt0).toFixed(0), zones1to4: avg(zt).toFixed(0), zonesIn10min: (zones / SEEDS).toFixed(1),
    gemsPerMin: (gems / (t / 60)).toFixed(1), snapsPerZone: (snaps / Math.max(1, zones)).toFixed(2),
    escapesPerZone: (esc / Math.max(1, zones)).toFixed(2), perfectPct: (100 * perf / Math.max(1, taps)).toFixed(0),
    gameOvers: over + '/' + SEEDS });
}
console.table(rows);
