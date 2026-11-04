// Quick CONFIG sweeps (in memory) for the playtest proposal.  node tests/sim/sweep.js easy|normal|hard|loop
'use strict';
const L = require('./lib');
const P = require('./players');
const which = process.argv[2] || 'easy', SEEDS = +(process.argv[3] || 40);
const kid6 = (MS, s) => P.kidPlayer(MS, s, { name: 'kid6', react: [0.35, 0.65], k: 0.86, kSd: 0.1, aimSd: 0.16, random: 0.05, late: 0.08, distract: 0.05 });
const who = { kid: (MS, s) => P.kidPlayer(MS, s), kid6, adult: (MS, s) => P.adultPlayer(MS, s), bot07: (MS) => P.botPlayer(MS, 0.7), bot05: (MS) => P.botPlayer(MS, 0.5), bot09: (MS) => P.botPlayer(MS, 0.9) };

function row(ov, diff, name, W, H, extra) {
  const MS = L.makeMS({ overrides: ov }), ms = [];
  for (let s = 1; s <= SEEDS; s++) ms.push(L.runGame(MS, who[name](MS, s), Object.assign({ diff, seed: s, maxTime: 600, width: W, height: H }, extra || {})));
  const r = L.summarise(ms);
  return [diff, name, W + 'x' + H, 'P1 ' + L.f(r.p1Clear, 0) + '%', 'planets ' + L.f(r.lv50, 0), 'surv ' + L.f(r.surv50, 0), 'P1T ' + L.f(r.p1T, 0), 'lvT ' + L.f(r.lvlT, 0),
    'perf ' + L.f(r.perfectPct, 0), 'miss ' + L.f(r.missPct, 1), 'topG ' + L.f(r.toppleGamesPct, 0) + '%', 'm:t ' + r.lossMiss + ':' + r.lossTopple, 'score ' + L.f(r.score50, 0)].join('  ');
}
const sets = {
  easy: [
    ['base', {}],
    ['crate1.3', { difficulty: { easy: { crate: 1.3 } } }],
    ['swing0.6', { difficulty: { easy: { swing: 0.6 } } }],
    ['crate1.3 swing0.62', { difficulty: { easy: { crate: 1.3, swing: 0.62 } } }],
    ['crate1.35 swing0.6 hearts5', { difficulty: { easy: { crate: 1.35, swing: 0.6, hearts: 5 } } }],
    ['crate1.35 swing0.6 hearts5 assist0.5', { difficulty: { easy: { crate: 1.35, swing: 0.6, hearts: 5, assist: 0.5 } } }],
    ['crate1.3 swing0.6 hearts5 assist0.5', { difficulty: { easy: { crate: 1.3, swing: 0.6, hearts: 5, assist: 0.5 } } }]
  ],
  normal: [
    ['base', {}],
    ['assist0.3', { difficulty: { normal: { assist: 0.3 } } }],
    ['assist0.35 tol0.15', { difficulty: { normal: { assist: 0.35, perfectTol: 0.15 } } }],
    ['assist0.3 tol0.15', { difficulty: { normal: { assist: 0.3, perfectTol: 0.15 } } }],
    ['assist0.3 tol0.15 loopGoal1', { difficulty: { normal: { assist: 0.3, perfectTol: 0.15 } }, loopGoal: 1 }]
  ],
  hard: [
    ['base', {}],
    ['tol0.11', { difficulty: { hard: { perfectTol: 0.11 } } }],
    ['tol0.11 assist0.1', { difficulty: { hard: { perfectTol: 0.11, assist: 0.1 } } }],
    ['tol0.11 assist0.15', { difficulty: { hard: { perfectTol: 0.11, assist: 0.15 } } }]
  ]
};
const rows = { easy: [['easy', 'kid', 960, 540], ['easy', 'kid6', 960, 540], ['easy', 'kid', 390, 844], ['easy', 'kid6', 390, 844], ['easy', 'adult', 960, 540], ['easy', 'bot05', 960, 540]],
  normal: [['normal', 'adult', 960, 540], ['normal', 'adult', 390, 844], ['normal', 'bot07', 960, 540], ['normal', 'bot05', 960, 540], ['normal', 'bot09', 960, 540]],
  hard: [['hard', 'adult', 960, 540], ['hard', 'adult', 390, 844], ['hard', 'bot07', 960, 540], ['hard', 'bot09', 960, 540]] };
for (const [label, ov] of sets[which]) {
  console.log('== ' + label);
  for (const [d, n, W, H] of rows[which]) console.log('  ' + row(ov, d, n, W, H));
}
