#!/usr/bin/env node
// Compact before/after tables for docs/reports/playtest_report.md.   node tests/sim/pt_report_tables.js <before> <after>
'use strict';
const { load, agg, table } = require('./pt_summary');
const { f0, f1, fp } = require('./lib');
const [an, bn] = process.argv.slice(2), A = load(an), B = load(bn);
const ba = (f, x, y) => { const p = f(x), q = f(y); return p === q ? p : `${p} → ${q}`; };
const cols = [
  ['session med s', x => f0(x.ses)], ['p90', x => f0(x.sesP90)], ['max', x => f0(x.sesMax)], ['> 8 min', x => fp(x.over8)],
  ['chapter med s', x => f0(x.chap)], ['round med s', x => f1(x.round)], ['1st catch s', x => f1(x.fc)], ['stuck rounds (active, >40 s)', x => String(x.aStuck)],
  ['hints/min', x => f1(x.hintsPerMin)], ['only-wrong air time', x => fp(x.onlyWrong)], ['wrong-catch rate', x => fp(x.wrongRate)],
  ['wrong into still basket', x => fp(x.wrongStill)], ['hands-off catches', x => fp(x.handsOff)], ['3★/2★/1★ rounds', x => `${f0(100 * x.st3)}/${f0(100 * x.st2)}/${f0(100 * x.st1)}`],
  ['stars % max', x => fp(x.starPct)], ['Talk right', x => fp(x.talkRight)]
];
function by(key, vals, filt) {
  const rows = [];
  for (const v of vals) { const a = A.filter(s => filt(s) && s[key] === v), b = B.filter(s => filt(s) && s[key] === v); if (!a.length) continue; const x = agg(a), y = agg(b); rows.push([v, a.length].concat(cols.map(([, f]) => ba(f, x, y)))); }
  const x = agg(A.filter(filt)), y = agg(B.filter(filt)); rows.push(['**all**', A.filter(filt).length].concat(cols.map(([, f]) => ba(f, x, y))));
  return table([key, 'sessions'].concat(cols.map(c => c[0])), rows);
}
const notAbsent = s => s.driver !== 'absent';
process.stdout.write('##### by age (all child models except absent)\n\n' + by('age', [3, 4, 5, 6, 7], notAbsent));
process.stdout.write('\n##### by child model (all ages)\n\n' + by('driver', ['bot0.3', 'bot0.6', 'bot0.9', 'tapper', 'slowKid', 'lateKid', 'spammer', 'idleKid', 'absent'], () => true));
process.stdout.write('\n##### by viewport (all except absent)\n\n' + by('vp', ['iphoneL', 'iphoneP', 'ipadL', 'ipadP'], notAbsent));
