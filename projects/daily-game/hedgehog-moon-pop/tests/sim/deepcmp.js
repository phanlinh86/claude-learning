#!/usr/bin/env node
// Compare two deep_<tag>.json runs cell by cell:  node tests/sim/deepcmp.js kids_base kids_box
'use strict';
const path = require('path');
const [A, B] = process.argv.slice(2).map(t => require(path.join(__dirname, 'results', `deep_${t}.json`)).summary);
const f = (v, d) => (v !== null && isFinite(v)) ? (+v).toFixed(d || 0) : '–';
const pct = v => (v !== null && isFinite(v)) ? (100 * v).toFixed(0) + '%' : '–';
const ab = (a, b, fn) => `${fn(a)} → ${fn(b)}`;
console.log('| Model | Diff | Survival p50 min | Died | Score p50 | Score/min | Level p50 | Dawn / Noon / Sunset / Night s p50 | Reach night (loop 1) | Bonks/min | Sky pops/min | Tier 2+3 share | Deaths d/n/s/n |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const k in A) {
  const a = A[k], b = B[k]; if (!b) continue;
  const [m, d] = k.split('|');
  console.log(`| ${m} | ${d} | ${ab(a.surv[1], b.surv[1], v => f(v, 1))} | ${ab(a.died, b.died, pct)} | ${ab(a.score[1], b.score[1], f)} | ${ab(a.scoreMin, b.scoreMin, f)} | ${ab(a.levelReached[1], b.levelReached[1], f)} | ${a.zone.map(z => f(z[1])).join('/')} → ${b.zone.map(z => f(z[1])).join('/')} | ${ab(a.clearZone[2], b.clearZone[2], pct)} | ${ab(a.bonkMin, b.bonkMin, v => f(v, 2))} | ${ab(a.skyMin, b.skyMin, v => f(v, 2))} | ${ab(a.share.t2 + a.share.t3, b.share.t2 + b.share.t3, pct)} | ${a.deathZone.join('/')} → ${b.deathZone.join('/')} |`);
}
