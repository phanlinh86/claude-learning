#!/usr/bin/env node
// Compares variant runs against the same-seed baseline (baseline_sub).
//   node tests/sim/compare.js baseline designSpeed ...
'use strict';
const { agg, load } = require('./summarize');
const { f0, f1, fp } = require('./lib');
const names = process.argv.slice(2);
const runs = names.map(n => ({ n, S: load(n).sessions }));
const groups = [
  ['toddler', [3]], ['toddler', [4]], ['typical', [3]], ['typical', [4]], ['typical', [5]], ['typical', [6, 7]],
  ['bot0.5', [3, 4, 5, 6, 7]], ['bot0.9', [3, 4, 5, 6, 7]], ['slowKid', [3, 4, 5, 6, 7]], ['idleKid', [3, 4, 5, 6, 7]],
  ['tapper', [3, 4, 5, 6, 7]], ['spammer', [3, 4, 5, 6, 7]]
];
let md = '| group | metric | ' + names.join(' | ') + ' |\n|---|---|' + names.map(() => '---').join('|') + '|\n';
const metrics = [
  ['session s (median / p90)', A => f0(A.sesMed) + ' / ' + f0(A.sesP90)],
  ['chapter s (median / p90)', A => f0(A.chapMed) + ' / ' + f0(A.chapP90)],
  ['stars (% of max)', A => f1(A.stars) + ' (' + fp(A.starPct) + ')'],
  ['right caught before the grass', A => fp(A.catchRate)],
  ['wrong / round', A => f1(A.wrongPerRound)],
  ['hints/min', A => f1(A.hintsPerMin)],
  ['idle prompts/min', A => f1(A.idlesPerMin)],
  ['speech cuts/min (never-spoken)', A => f1(A.cutsPerMin) + ' (' + f1(A.neverPerMin) + ')'],
  ['sessions done', A => A.done + '/' + A.n],
  ['stuck rounds', A => String(A.stuck)]
];
for (const [d, ages] of groups) {
  const As = runs.map(r => { const g = r.S.filter(s => s.driver === d && ages.includes(s.age)); return g.length ? agg(g) : null; });
  if (!As.some(Boolean)) continue;
  for (const [mn, fn] of metrics) md += `| ${d} ${ages.join(',')} | ${mn} | ${As.map(A => (A ? fn(A) : '–')).join(' | ')} |\n`;
}
md += '\n| viewport | metric | ' + names.join(' | ') + ' |\n|---|---|' + names.map(() => '---').join('|') + '|\n';
for (const vp of ['iphoneP', 'iphoneL', 'ipadL', 'ipadP']) {
  const As = runs.map(r => { const g = r.S.filter(s => s.vp === vp); return g.length ? agg(g) : null; });
  md += `| ${vp} | right caught | ${As.map(A => (A ? fp(A.catchRate) : '–')).join(' | ')} |\n`;
  md += `| ${vp} | max s only-wrong in the air | ${As.map(A => (A ? f1(A.maxNoRight) : '–')).join(' | ')} |\n`;
}
process.stdout.write(md);
