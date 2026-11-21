#!/usr/bin/env node
// Bristle's Moon Pop — print markdown tables from tests/sim/results/deep_<tag>.json
//   node tests/sim/deepreport.js <tag> [--cols main,pace,style,magnet,fair,lap] [--cmp otherTag]
'use strict';
const fs = require('fs');
const path = require('path');
const tag = process.argv[2] || 'humans';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const load = t => JSON.parse(fs.readFileSync(path.join(__dirname, 'results', `deep_${t}.json`), 'utf8'));
const D = load(tag), S = D.summary;
const f = (v, d) => (v !== null && isFinite(v)) ? (+v).toFixed(d || 0) : '–';
const pct = v => (v !== null && isFinite(v)) ? (100 * v).toFixed(0) + '%' : '–';
const q3 = (a, d) => a.map(v => f(v, d)).join(' / ');
const cols = arg('cols', 'main,pace,style,magnet,fair,lap').split(',');
const keys = Object.keys(S);
const name = k => { const [m, d, l] = k.split('|'); return `| ${m} | ${d} | ${l} `; };
let md = `### ${tag}: ${D.runs} runs, N ${D.N} per cell, cap ${D.cap} min${D.overrides ? ', overrides ' + JSON.stringify(D.overrides) : ''}\n\n`;
const head = (h) => '| Model | Diff | lenK | ' + h.join(' | ') + ' |\n|' + '---|'.repeat(h.length + 3) + '\n';
if (cols.includes('main')) {
  md += head(['Survival min p10/50/90', 'Died', 'Score p10/50/90', 'Score/min', '1st pop s p10/50/90', 'Level p50']);
  for (const k of keys) { const s = S[k]; md += name(k) + `| ${q3(s.surv, 1)} | ${pct(s.died)} | ${q3(s.score)} | ${f(s.scoreMin)} | ${q3(s.firstPop, 1)} | ${f(s.levelReached[1])} |\n`; }
  md += '\n';
}
if (cols.includes('pace')) {
  md += head(['Dawn s p10/50/90', 'Noon', 'Sunset', 'Night', 'Reach night']);
  for (const k of keys) { const s = S[k]; md += name(k) + '| ' + s.zone.map(z => q3(z)).join(' | ') + ` | ${pct(s.clearZone[2])} |\n`; }
  md += '\n';
}
if (cols.includes('style')) {
  md += head(['Pop rate', 'Esc/min', 'Ground / air', 'Tier 1/2/3', 'Air pts', 'Sky/min', 'Jumps/min', 'Pops per jump 0/1/2/3/4/5+', 'Best chain p50/p90', 'Best streak p50']);
  for (const k of keys) { const s = S[k], h = s.share; md += name(k) + `| ${pct(s.popRate)} | ${f(s.escMin, 1)} | ${pct(h.ground)} / ${pct(h.air)} | ${pct(h.t1)} / ${pct(h.t2)} / ${pct(h.t3)} | ${pct(s.ptsAirShare)} | ${f(s.skyMin, 2)} | ${f(s.jumpMin, 1)} | ${s.chainHist.map(pct).join(' ')} | ${f(s.bestChain[1])} / ${f(s.bestChain[2])} | ${f(s.bestCombo[1])} |\n`; }
  md += '\n';
}
if (cols.includes('magnet')) {
  md += head(['Magnet caught', 'Time with magnet', 'Pops/min on vs off', 'Points/min on vs off', 'Esc/min on vs off']);
  for (const k of keys) { const m = S[k].magnet; md += name(k) + `| ${pct(m.caught)} | ${pct(m.onShare)} | ${f(m.onRate, 1)} vs ${f(m.offRate, 1)} | ${f(m.ptsOn)} vs ${f(m.ptsOff)} | ${f(m.escOn, 1)} vs ${f(m.escOff, 1)} |\n`; }
  md += '\n';
}
if (cols.includes('fair')) {
  md += head(['Bonks/min', 'Bonks in air', 'Probed', 'Unavoidable @0.45 s', '@0.8 s', 'Heals/game', 'Hearts at clear p10/50/90', 'Deaths by zone d/n/s/n']);
  for (const k of keys) { const s = S[k]; md += name(k) + `| ${f(s.bonkMin, 2)} | ${pct(s.bonkAir)} | ${s.probed} | ${s.unavoid[0]} | ${s.unavoid[1]} | ${f(s.heals, 1)} | ${q3(s.heartsAtClear)} | ${s.deathZone.join(' / ')} |\n`; }
  md += '\n';
}
if (cols.includes('lap')) {
  md += head(['Lap: reach / med s per level / bonks/min / pop rate (lap 0 · 1 · 2 · 3)']);
  for (const k of keys) { const s = S[k]; md += name(k) + '| ' + s.lap.map(L => `${pct(L.reach)} ${f(L.t)}s ${f(L.bonkMin, 2)} ${pct(L.popRate)}`).join(' · ') + ' |\n'; }
  md += '\n';
}
console.log(md);
