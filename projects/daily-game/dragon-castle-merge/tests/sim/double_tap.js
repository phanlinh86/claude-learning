// Effect of the drop buffer on a 5-year-old's accidental double taps: same kid model, with the excited
// double tap (10 % of drops) vs without. node tests/sim/double_tap.js [overrides.json]
'use strict';
const fs = require('fs');
const { makeEG, runGame, summarise, f, pct } = require('./lib.js');
const P = require('./players.js');
const ov = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) : null;
const EG = makeEG(ov);
console.log('| diff | kid | L1 / L2 / L3 / L4 s | game over (20 min) | refused/game | score med |\n|---|---|---|---|---|---|');
for (const diff of ['easy', 'normal']) for (const dbl of [true, false]) {
  const ms = [];
  for (let s = 1; s <= 200; s++) {
    ms.push(runGame(EG, P.kidPlayer(EG, s, { noDouble: !dbl }), { diff, seed: 1000 + s, maxTime: 1200 }));
  }
  const S = summarise(ms, 1200);
  console.log(`| ${diff} | ${dbl ? 'with double taps' : 'no double taps'} | ${S.lvT.map(x => f(x.med)).join(' / ')} | ${pct(S.overs, S.n)} | ${f(S.refusedPerGame, 1)} | ${f(S.scoreMed)} |`);
}
