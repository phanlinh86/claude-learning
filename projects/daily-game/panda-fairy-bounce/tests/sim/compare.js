#!/usr/bin/env node
// Before/after table from playtest --out JSON files.
//   node tests/sim/compare.js tests/sim/out/baseline.json tests/sim/out/proposed_stall.json [more.json] [--diff easy]
'use strict';
const fs = require('fs');
const files = process.argv.slice(2).filter(a => a.endsWith('.json'));
const di = process.argv.indexOf('--diff'), only = di > 0 ? process.argv[di + 1] : null;
const sets = files.map(f => JSON.parse(fs.readFileSync(f)));
const names = files.map(f => f.split('/').pop().replace('.json', ''));
const pc = v => Number.isFinite(v) ? (100 * v).toFixed(0) + '%' : '-';
const f0 = v => Number.isFinite(v) ? v.toFixed(0) : '-';
const f1 = v => Number.isFinite(v) ? v.toFixed(1) : '-';
const METRICS = [
  ['clears S1', s => pc(s.clear1)], ['surv p50 s', s => f0(s.survP50)], ['seasons p50', s => String(s.seaP50)],
  ['season p50 s', s => f0(s.seasonP50)], ['in 45–90 s', s => pc(s.seasonIn45_90)],
  ['no-block p50/max s', s => f1(s.noBrickP50) + '/' + f0(s.noBrickMax)], ['at 5 hearts', s => pc(s.at5Frac)]
];
console.log('| model | diff | ' + METRICS.map(m => m[0] + ' (' + names.join(' → ') + ')').join(' | ') + ' |');
console.log('|---|---|' + METRICS.map(() => '---:').join('|') + '|');
for (const cell of sets[0]) {
  if (only && cell.diff !== only) continue;
  const others = sets.map(S => S.find(c => c.model === cell.model && c.diff === cell.diff));
  console.log(`| ${cell.model} | ${cell.diff} | ` + METRICS.map(m => others.map(o => o ? m[1](o.s) : '-').join(' → ')).join(' | ') + ' |');
}
