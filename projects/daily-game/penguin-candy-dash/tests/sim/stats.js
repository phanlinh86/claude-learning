// Aggregation helpers for the Pip's Candy Dash playtest sim.
'use strict';
const BIOMES = ['Meadow', 'River', 'Clouds', 'Glacier'];

const q = (arr, p) => {
  if (!arr.length) return NaN;
  const a = arr.slice().sort((x, y) => x - y);
  const i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return a[lo] + (a[hi] - a[lo]) * (i - lo);
};
const med = (a) => q(a, 0.5);
const mean = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;
const pct = (x) => isNaN(x) ? '–' : Math.round(x * 100) + '%';
const f1 = (x) => isNaN(x) ? '–' : x.toFixed(1);
const f2 = (x) => isNaN(x) ? '–' : x.toFixed(2);
const f0 = (x) => isNaN(x) ? '–' : Math.round(x).toString();
const levelName = (lv) => BIOMES[lv % 4] + (lv >= 4 ? ' L' + (Math.floor(lv / 4) + 1) : '');

function summarize(runs) {
  const n = runs.length;
  const clearedLevel = (r, i) => r.levels[i] && r.levels[i].cleared;
  const lapDone = (k) => runs.filter(r => clearedLevel(r, 4 * k + 3)).length / n;
  const biome = [0, 1, 2, 3].map(b => {
    const ls = runs.map(r => r.levels[b]).filter(Boolean);           // lap-1 instance of biome b
    const cl = ls.filter(l => l.cleared);
    const kinds = { red: 0, green: 0, orange: 0 }, ter = { plain: 0, slow: 0, ice: 0, puff: 0 };
    let bumps = 0;
    for (const l of ls) for (const x of l.bumps) { bumps++; kinds[x.kind]++; ter[x.ter]++; }
    return {
      reached: ls.length / n, clearIfReached: ls.length ? cl.length / ls.length : NaN,
      time: med(cl.map(l => l.playTime)), timeP90: q(cl.map(l => l.playTime), 0.9),
      hearts: ls.length ? bumps / ls.length : NaN, kinds, ter, bumps,
      pops: mean(ls.map(l => l.pops)), maxSizeFrac: mean(ls.map(l => l.maxSizeT / Math.max(1, l.playTime))),
      meanSize: mean(ls.map(l => l.sizeT / Math.max(1, l.playTime)))
    };
  });
  // all bumps by kind / terrain over the whole run
  const kinds = { red: 0, green: 0, orange: 0 }, ter = { plain: 0, slow: 0, ice: 0, puff: 0 };
  let bumps = 0, gateBumps = 0;
  for (const r of runs) for (const l of r.levels) for (const x of l.bumps) { bumps++; kinds[x.kind]++; ter[x.ter]++; if (x.gate) gateBumps++; }
  const tot = (k) => runs.reduce((s, r) => s + r[k], 0);
  const score = tot('score') || 1;
  const gems = runs.reduce((s, r) => s + r.levels.reduce((a, l) => a + l.gems, 0), 0);
  return {
    n, lap1: lapDone(0), lap2: lapDone(1), lap3: lapDone(2), laps: [0, 1, 2, 3, 4, 5].map(lapDone),
    meadow: runs.filter(r => clearedLevel(r, 0)).length / n,
    deathLevel: med(runs.map(r => r.deathLevel)), capped: runs.filter(r => r.capped).length / n,
    sessionMin: med(runs.map(r => r.time / 60)), sessionP10: q(runs.map(r => r.time / 60), 0.1), sessionP90: q(runs.map(r => r.time / 60), 0.9),
    score: med(runs.map(r => r.score)), scorePerMin: tot('score') / Math.max(1e-9, tot('time') / 60),
    gemShare: tot('gemPts') / score, popShare: tot('popPts') / score, clearShare: tot('clearPts') / score,
    gemMul: runs.reduce((s, r) => s + r.gemPts, 0) / Math.max(1, gems * 10),
    pops: mean(runs.map(r => r.levels.reduce((a, l) => a + l.pops, 0))),
    stunnedPerPop: runs.reduce((s, r) => s + r.levels.reduce((a, l) => a + l.stunned, 0), 0) / Math.max(1, runs.reduce((s, r) => s + r.levels.reduce((a, l) => a + l.pops, 0), 0)),
    biome, kinds, ter, bumps, gateBumps
  };
}

function table(headers, rows) {
  return ['| ' + headers.join(' | ') + ' |', '|' + headers.map(() => '---').join('|') + '|', ...rows.map(r => '| ' + r.join(' | ') + ' |')].join('\n');
}
const shares = (o, tot) => Object.entries(o).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${pct(v / Math.max(1, tot))}`).join(', ') || '–';

module.exports = { summarize, table, shares, pct, f0, f1, f2, med, mean, q, levelName, BIOMES };
