#!/usr/bin/env node
// Compares variant runs against the same-seed baseline (baseline_sub).
//   node tests/sim/compare.js baseline_sub touch tapGuard ...
'use strict';
const { agg, load } = require('./summarize');
const { f0, f1, fp } = require('./lib');
const names = process.argv.slice(2);
const runs = names.map(n => ({ n, S: load(n).sessions }));
const groups = [
  ['toddler', [3]], ['toddler', [4]], ['typical', [3]], ['typical', [4]], ['typical', [5]], ['typical', [6, 7]],
  ['bot0.6', [3, 4, 5, 6, 7]], ['beside', [3, 4, 5, 6, 7]], ['dropsHigh', [3, 4, 5, 6, 7]], ['idleKid', [3, 4, 5, 6, 7]],
  ['tapper', [3, 4, 5, 6, 7]], ['spammer', [3, 4, 5, 6, 7]]
];
let md = '| group | metric | ' + names.join(' | ') + ' |\n|---|---|' + names.map(() => '---').join('|') + '|\n';
const metrics = [
  ['session s (mean / p90)', A => f0(A.ses) + ' / ' + f0(A.sesP90)],
  ['chapter s (mean / p90)', A => f0(A.chap) + ' / ' + f0(A.chapP90)],
  ['stars (% of max)', A => f1(A.stars) + ' (' + fp(A.starPct) + ')'],
  ['near-nest misses', A => fp(A.nearMissRate)],
  ['miss / drop', A => fp(A.missRate)],
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
// viewport-level geometry
md += '\n| viewport | metric | ' + names.join(' | ') + ' |\n|---|---|' + names.map(() => '---').join('|') + '|\n';
for (const vp of ['iphoneP', 'iphoneL', 'ipadL', 'ipadP']) {
  const As = runs.map(r => agg(r.S.filter(s => s.vp === vp)));
  md += `| ${vp} | items resting in a drop zone | ${As.map(A => fp(A.tapHazard)).join(' | ')} |\n`;
  md += `| ${vp} | min pack scale / pack fails | ${As.map(A => f1(A.shrinkMin) + ' / ' + A.packFail).join(' | ')} |\n`;
  md += `| ${vp} | unreachable items | ${As.map(A => A.unreachable).join(' | ')} |\n`;
}
process.stdout.write(md);
