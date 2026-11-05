// Quick in-memory CONFIG sweeps behind the playtest proposal.
//   node tests/sim/sweep.js easy [seeds]      Easy candidates vs the three kid models (+ adult sanity)
//   node tests/sim/sweep.js normal [seeds]    Normal/Hard candidates vs adult + bots
'use strict';
const L = require('./lib');
const P = require('./players');
const which = process.argv[2] || 'easy', SEEDS = +(process.argv[3] || 150);
const who = {
  kid4: (RF, s) => P.kidPlayer(RF, s, { name: 'kid4', react: [0.8, 1.1], bias: 0.12, errSd: 0.22, forget: 0.08, randomRate: 0.12, misread: 0.10, double: 0.15 }),
  kid: (RF, s) => P.kidPlayer(RF, s),
  kid6: (RF, s) => P.kidPlayer(RF, s, { name: 'kid6', react: [0.6, 0.8], bias: 0.06, errSd: 0.14, forget: 0.03, randomRate: 0.05, misread: 0.04, double: 0.06 }),
  adult: (RF, s) => P.adultPlayer(RF, s), bot05: RF => P.botPlayer(RF, 0.5), bot1: RF => P.botPlayer(RF, 1),
  spam: (RF, s) => P.spamPlayer(RF, s, 250), never: () => P.neverTap()
};
function row(ov, diff, name, time) {
  const RF = L.makeRF({ overrides: ov }), ms = [];
  for (let s = 1; s <= SEEDS; s++) ms.push(L.runGame(RF, who[name](RF, s), { diff, seed: s, maxTime: time || 300 }));
  const r = L.summarise(ms);
  return ['  ' + name.padEnd(6), 'reach N/S/Ni ' + [r.reach1, r.reach2, r.reach3].map(x => L.f(x, 0)).join('/'), 'batt@Dawn ' + L.f(r.dawnHearts50, 0),
    'surv ' + L.f(r.surv50, 0), 'hpm ' + L.f(r.hitsPerMin, 2), 'dawnHits ' + L.f(r.dawnHits, 2), 'pts/min ' + L.f(r.ptsPerMin, 0), 'lvT ' + L.f(r.dawnT, 1)].join('  ');
}
const sets = {
  easy: [
    ['base', {}],
    ['hitK0.6', { difficulty: { easy: { hitK: 0.6 } } }],
    ['speed0.7', { difficulty: { easy: { speed: 0.7 } } }],
    ['extra0.8-2.0', { difficulty: { easy: { extra: [0.8, 2.0] } } }],
    ['reaction1.8', { difficulty: { easy: { reaction: 1.8 } } }],
    ['hearts6', { difficulty: { easy: { hearts: 6 } } }],
    ['gapShare0.2', { difficulty: { easy: { gapShare: 0.2 } } }],
    ['buffer0.12', { buffer: 0.12 }],
    ['invuln2.0', { invuln: 2.0 }],
    ['combo A', { difficulty: { easy: { hitK: 0.65, extra: [0.8, 2.0], reaction: 1.7 } } }],
    ['combo B', { difficulty: { easy: { hitK: 0.65, extra: [0.8, 2.0], reaction: 1.7, speed: 0.72 } } }],
    ['combo C', { difficulty: { easy: { hitK: 0.6, extra: [0.9, 2.2], reaction: 1.8, speed: 0.72 } } }],
    ['combo D', { difficulty: { easy: { hitK: 0.6, extra: [0.9, 2.2], reaction: 1.8 } } }],
    ['combo F', { difficulty: { easy: { hitK: 0.6, extra: [1.0, 2.4], reaction: 1.8 } } }],
    ['combo G', { difficulty: { easy: { hitK: 0.6, extra: [0.9, 2.2], reaction: 1.8, gapShare: 0.35 } } }]
  ],
  normal: [
    ['base', {}]
  ]
};
const names = which === 'easy' ? ['kid4', 'kid', 'kid6'] : ['adult', 'bot05'];
const diffs = which === 'easy' ? ['easy'] : ['normal', 'hard'];
const filter = process.argv[4] ? process.argv[4].split(',') : null;
for (const [label, ov] of sets[which]) {
  if (filter && !filter.includes(label)) continue;
  console.log(label, JSON.stringify(ov));
  for (const d of diffs) for (const n of names) console.log(d.padEnd(6), row(ov, d, n));
}
