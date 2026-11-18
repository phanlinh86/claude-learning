#!/usr/bin/env node
// Present-but-slow children vs main.js "idle #5 → pause()" (idleSaid resets only at a new round, not on a tap):
// how many rounds reach 5 idle nudges while the child IS playing (so the game would pause on her)?
//   node tests/sim/pt_idlepause.js → stdout (copied into docs/reports/playtest_report.md)
'use strict';
const P = require('./pt_lib');
const out = [];
for (const d of ['slow3', 'weak4', 'typical', 'repeat4']) for (const age of [3, 4]) {
  let rounds = 0, r5 = 0, r4 = 0, ses5 = 0, n = 0;
  for (let s = 0; s < 30; s++) {
    const m = P.run({ age, vp: ['iphoneP', 'ipadL', 'wide'][s % 3], driver: d, seed: 900 + s, lang: s % 2 ? 'vi' : 'en' }); n++;
    let hit = false;
    for (const r of m.rounds) { rounds++; if (r.idles >= 5) { r5++; hit = true; } if (r.idles >= 4) r4++; }
    if (hit) ses5++;
  }
  out.push(`${d} age ${age}: ${n} sessions, ${rounds} rounds — rounds with ≥4 idle nudges ${r4}, with ≥5 (main.js would pause while the child plays) ${r5}; sessions affected ${ses5}`);
}
console.log(out.join('\n'));
