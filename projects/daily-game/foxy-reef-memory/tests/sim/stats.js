// Aggregation helpers for the playtest sim.
'use strict';
const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];

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
const f0 = (x) => isNaN(x) ? '–' : Math.round(x).toString();
const levelName = (lv) => SEASONS[lv % 4] + (lv >= 4 ? ' L' + (Math.floor(lv / 4) + 1) : '');

function summarize(runs, maxLevel) {
  maxLevel = maxLevel || 40;
  const n = runs.length;
  const clear = [];
  for (let i = 0; i < 12; i++) clear.push(runs.filter(r => r.levels[i] && r.levels[i].cleared).length / n);
  const deaths = runs.filter(r => r.dead);
  const lossAt = {};
  for (const r of deaths) { const k = levelName(r.deathLevel); lossAt[k] = (lossAt[k] || 0) + 1; }
  const topLoss = Object.entries(lossAt).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, v]) => `${k} ${Math.round(v / n * 100)}%`).join(', ');
  const season = [0, 1, 2, 3].map(s => {
    const ls = runs.map(r => r.levels[s]).filter(Boolean);
    const cl = ls.filter(l => l.cleared);
    return {
      reached: ls.length / n,
      clearIfReached: ls.length ? cl.length / ls.length : NaN,
      time: med(cl.map(l => l.playTime)),
      airLeft: med(cl.map(l => l.air)),
      airLeftFrac: med(cl.map(l => l.air / l.airMax)),
      minAirFrac: med(cl.map(l => l.minAir / l.airMax)),
      mistakesPerPair: mean(ls.map(l => l.mistakes / l.pairs)),
      score: med(cl.map(l => l.score)),
      bonusShare: med(cl.map(l => l.bonus / Math.max(1, l.score))),
      maxCombo: med(ls.map(l => l.maxCombo))
    };
  });
  return {
    n, clear, lap1: clear[3], lap2: clear[7],
    deathLevel: med(runs.map(r => r.dead ? r.deathLevel : maxLevel)),
    endless: runs.filter(r => !r.dead).length / n,
    sessionMin: med(runs.map(r => r.time / 60)), sessionP10: q(runs.map(r => r.time / 60), 0.1), sessionP90: q(runs.map(r => r.time / 60), 0.9),
    score: med(runs.map(r => r.score)), bestCombo: med(runs.map(r => r.bestCombo)),
    topLoss, season
  };
}

function table(headers, rows) {
  return ['| ' + headers.join(' | ') + ' |', '|' + headers.map(() => '---').join('|') + '|', ...rows.map(r => '| ' + r.join(' | ') + ' |')].join('\n');
}

module.exports = { summarize, table, pct, f1, f0, med, mean, q, levelName, SEASONS };
