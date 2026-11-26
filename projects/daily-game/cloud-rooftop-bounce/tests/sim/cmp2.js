#!/usr/bin/env node
// Before/after table from deep.js --out files: node tests/sim/cmp2.js a.json b.json ... [--models kid4,kid56]
'use strict';
const fs = require('fs');
const files = process.argv.slice(2).filter(a => a.endsWith('.json'));
const mi = process.argv.indexOf('--models'), only = mi > 0 ? process.argv[mi + 1].split(',') : null;
const sets = files.map(f => JSON.parse(fs.readFileSync(f)));
const f0 = v => Number.isFinite(v) ? v.toFixed(0) : '-', f1 = v => Number.isFinite(v) ? v.toFixed(1) : '-';
const pc = v => Number.isFinite(v) ? (100 * v).toFixed(0) + '%' : '-';
const COLS = [['game over', s => pc(s.overPct)], ['surv p50 s', s => f0(s.survP50)], ['zones p50', s => String(s.zP50)],
  ['clears Z1', s => pc(s.clear1)], ['zone p50 s', s => f0(s.zoneP50)], ['in 45–90', s => pc(s.in45_90)],
  ['last 3 p50/p90', s => f0(s.last3P50) + '/' + f0(s.last3P90)], ['lost/min', s => f1(s.lostPerMin)], ['at 5♥', s => pc(s.at5Frac)]];
console.log('| model | diff | patch | ' + COLS.map(c => c[0]).join(' | ') + ' |');
console.log('|---|---|---|' + COLS.map(() => '---:').join('|') + '|');
for (const cell of sets[0].results) {
  if (only && !only.includes(cell.model)) continue;
  for (const S of sets) {
    const o = S.results.find(c => c.model === cell.model && c.diff === cell.diff); if (!o) continue;
    console.log(`| ${cell.model} | ${cell.diff} | ${S.patch} | ` + COLS.map(c => c[1](o.s)).join(' | ') + ' |');
  }
}
