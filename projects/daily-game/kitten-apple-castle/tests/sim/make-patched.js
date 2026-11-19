// Writes results/world.patched.js = game/js/world.js with the proposal-config.json edits as literal source edits,
// then checks that the patched source and the in-memory overrides play identical games.  node tests/sim/make-patched.js
'use strict';
const fs = require('fs'), path = require('path'), L = require('./lib'), P = require('./players');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'game', 'js', 'world.js'), 'utf8');
const edits = [
  ["easy:   { swing: 0.6,  crate: 1.35,", "easy:   { swing: 0.52, crate: 1.45,"],
  ["hard:   { swing: 1.22, crate: 0.9,  perfectTol: 0.11,  hearts: 3, inherit: 1.15, sway: 1.25, assist: 0.2 }", "hard:   { swing: 1.22, crate: 0.9,  perfectTol: 0.11,  hearts: 3, inherit: 1.15, sway: 1.25, assist: 0.35 }"],
  ["drag: 0.15, appleChance: 0.6,  goal: 14 }", "drag: 0.15, appleChance: 0.6,  goal: 13 }"],
  ["drag: 0.1,  appleChance: 0.65, goal: 16 }", "drag: 0.1,  appleChance: 0.65, goal: 14 }"]
];
let out = src;
for (const [a, b] of edits) { if (out.split(a).length !== 2) throw new Error('edit not unique/found: ' + a); out = out.replace(a, b); }
fs.mkdirSync(path.join(__dirname, 'results'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'results', 'world.patched.js'), out);
const A = L.makeAC({ worldSrc: out }), B = L.makeAC({ overrides: require('./proposal-config.json').overrides });
let same = 0, n = 0;
for (const d of ['easy', 'normal', 'hard']) for (let s = 1; s <= 10; s++) {
  const a = L.runGame(A, P.kidPlayer(A, s), { diff: d, seed: s, maxTime: 300 }), b = L.runGame(B, P.kidPlayer(B, s), { diff: d, seed: s, maxTime: 300 });
  const c = L.runGame(A, P.botPlayer(A, 0.7), { diff: d, seed: s, maxTime: 300 }), e = L.runGame(B, P.botPlayer(B, 0.7), { diff: d, seed: s, maxTime: 300 });
  n += 2; if (a.score === b.score && a.time === b.time) same++; if (c.score === e.score && c.time === e.time) same++;
}
console.log('wrote results/world.patched.js; patched source vs overrides: ' + same + '/' + n + ' games identical');
