#!/usr/bin/env node
// One row per run (paired full matrices): key metrics over the child models (absent excluded unless --absent).
//   node tests/sim/pt_table.js v2_baseline v2_final2 ...
'use strict';
const { load, agg, table } = require('./pt_summary');
const { f0, f1, fp } = require('./lib');
const names = process.argv.slice(2).filter(a => !a.startsWith('--')), absent = process.argv.includes('--absent');
const rows = [];
for (const n of names) {
  const S0 = load(n), S = S0.filter(s => absent ? s.driver === 'absent' : s.driver !== 'absent'), A = agg(S);
  const kids = agg(S.filter(s => ['slowKid', 'lateKid', 'tapper', 'spammer', 'idleKid'].includes(s.driver)));
  const a4 = agg(S.filter(s => s.age === 4 && ['slowKid', 'lateKid', 'bot0.3'].includes(s.driver)));
  const ab = S0.filter(s => s.driver === 'absent'), abR = ab.reduce((x, s) => x + s.rounds.filter(r => r.d !== null).length, 0) / Math.max(1, ab.length);
  const abA = agg(ab);
  rows.push([n, S.length, f0(A.ses), f0(A.sesP90), f0(A.sesMax), fp(A.over8), fp(kids.over8), f0(a4.chap), fp(A.ch3), f1(A.fc), String(A.aStuck), fp(A.wrongRate), A.wrongStillPerRound.toFixed(2), fp(A.starPct), fp(A.repT), String(A.talkErr), abR.toFixed(1), fp(abA.wrongRate)]);
}
process.stdout.write(table(['run', 'sessions', 'session med s', 'p90', 'max', '> 8 min (all)', '> 8 min (child models)', 'age-4 toddler chapter med', 'chapters cut to 3 rounds', '1st catch s', 'active stuck rounds', 'wrong-catch rate', 'wrong into still basket / round', 'stars % of max', 'same target as last round', 'Talk content errors', 'absent child: rounds in 10 min', 'absent: wrong-catch rate'], rows));
