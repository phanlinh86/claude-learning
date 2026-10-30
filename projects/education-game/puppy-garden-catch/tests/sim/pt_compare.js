#!/usr/bin/env node
// Before/after table for playtest.js runs:  node tests/sim/pt_compare.js v_baseline v_proposal [--drivers a,b] [--ages 3,4]
// Rows = driver × age; for each metric "before → after".
'use strict';
const { load, agg, table } = require('./pt_summary');
const { f0, f1, fp } = require('./lib');
const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const A = load(args[0]), B = load(args[1]);
const drivers = get('drivers', [...new Set(B.map(s => s.driver))].join(',')).split(',');
const ages = get('ages', [...new Set(B.map(s => s.age))].sort().join(',')).split(',').map(Number);
const M = [
  ['session med s', x => f0(x.ses)], ['session p90', x => f0(x.sesP90)], ['> 8 min', x => fp(x.over8)], ['chapter med', x => f0(x.chap)],
  ['ch cut to 3 rds', x => fp(x.ch3)], ['round med', x => f1(x.round)], ['1st catch', x => f1(x.fc)], ['stuck', x => String(x.stuck)], ['active stuck', x => String(x.aStuck)],
  ['wrong rate', x => fp(x.wrongRate)], ['wrong into still/round', x => x.wrongStillPerRound.toFixed(2)], ['hands-off catches', x => fp(x.handsOff)],
  ['miss/round', x => x.missPerRound.toFixed(2)], ['hints/min', x => f1(x.hintsPerMin)], ['stars %', x => fp(x.starPct)], ['rep. target', x => fp(x.repT)]
];
const sel = get('metrics', null), MM = sel ? M.filter(m => sel.split(',').includes(m[0])) : M;
const rows = [];
for (const d of drivers) for (const a of ages) {
  const ga = A.filter(s => s.driver === d && s.age === a), gb = B.filter(s => s.driver === d && s.age === a);
  if (!ga.length || !gb.length) continue;
  const x = agg(ga), y = agg(gb);
  rows.push([d, a].concat(MM.map(([, f]) => { const p = f(x), q = f(y); return p === q ? p : `${p} → ${q}`; })));
}
const all = (S) => agg(S.filter(s => drivers.includes(s.driver) && ages.includes(s.age)));
const X = all(A), Y = all(B);
rows.push(['**all**', '']. concat(MM.map(([, f]) => { const p = f(X), q = f(Y); return p === q ? p : `${p} → ${q}`; })));
process.stdout.write(`#### ${args[0]} → ${args[1]}\n\n` + table(['driver', 'age'].concat(MM.map(m => m[0])), rows));
console.log(`\ntalk errors ${X.talkErr} → ${Y.talkErr}; errors ${X.errors} → ${Y.errors}; hint gap min ${f1(X.hintGapMin)} → ${f1(Y.hintGapMin)}; identical pool repeat ${fp(X.repP)} → ${fp(Y.repP)}`);
