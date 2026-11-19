// CONFIG sweeps for the Ziggy's Apple Castle playtest proposal (in memory, never edits game/).
//   node tests/sim/sweep2.js easy|lantern|pace|hard|all [seeds]
'use strict';
const L = require('./lib');
const D = require('./deep');
const which = process.argv[2] || 'all', SEEDS = +(process.argv[3] || 60);
const f = L.f;
const who = n => n.startsWith('bot') ? D.bot(+n.slice(3)) : D.HUMANS[n];

function row(ov, diff, n, W, H) {
  const AC = D.mkAC({ overrides: ov });
  const r = D.deepSum(D.many(AC, who(n), diff, { seeds: SEEDS, width: W || 960, height: H || 540 }));
  return `${(diff + ' ' + n + (W ? ' ' + W + 'x' + H : '')).padEnd(26)} over ${f(r.overPct, 0).padStart(3)}%  surv ${f(r.surv50, 0).padStart(3)}  lv ${f(r.lv50, 0).padStart(2)}  dawn ${f(r.dawnClear, 0).padStart(3)}%  ` +
    `miss ${f(r.missPct, 1).padStart(4)}  zMiss ${[0, 1, 2, 3].map(z => f(r.zoneMiss[z], 0)).join('/')}  zT ${[0, 1, 2, 3].map(z => f(r.zoneT[z], 0)).join('/')}  perf ${f(r.perfectPct, 0)}  top ${f(r.topplePer100, 1)}  ` +
    `lanTop ${f(r.lanTop.miss, 0)} vs ${f(r.noLanTop.miss, 0)} (lit ${f(r.lanTop.lit, 2)}/${f(r.noLanTop.lit, 2)})  pieH ${f(r.pieHeartsPerGame, 1)}`;
}
const E = { difficulty: { easy: {} } };
const sets = {
  easy: [
    ['base', {}],
    ['easy swing0.5', { difficulty: { easy: { swing: 0.5 } } }],
    ['easy crate1.45', { difficulty: { easy: { crate: 1.45 } } }],
    ['easy swing0.52 crate1.45', { difficulty: { easy: { swing: 0.52, crate: 1.45 } } }],
    ['easy swing0.52 crate1.45 tol0.25', { difficulty: { easy: { swing: 0.52, crate: 1.45, perfectTol: 0.25 } } }],
    ['easy swing0.5 crate1.5', { difficulty: { easy: { swing: 0.5, crate: 1.5 } } }]
  ],
  lantern: [
    ['base', {}],
    ['lantern r1.8', { lights: { lantern: { r: 1.8 } } }],
    ['lantern r2.0', { lights: { lantern: { r: 2.0 } } }],
    ['lantern r2.2', { lights: { lantern: { r: 2.2 } } }],
    ['lantern r2.0 a1', { lights: { lantern: { r: 2.0, a: 1 } } }],
    ['lantern r2.0 nightEnd0.3', { lights: { lantern: { r: 2.0 } }, nightEnd: 0.3 }],
    ['lantern r2.0 sunset0.6 night0.35 end0.3', { lights: { lantern: { r: 2.0 } }, nightEnd: 0.3, zones: { 2: { light: 0.6 }, 3: { light: 0.35 } } }]
  ],
  pace: [
    ['base', {}],
    ['goals 10/12/13/14', { zones: { 2: { goal: 13 }, 3: { goal: 14 } } }],
    ['goals 10/12/14/14', { zones: { 3: { goal: 14 } } }],
    ['goals 11/12/13/14', { zones: { 0: { goal: 11 }, 2: { goal: 13 }, 3: { goal: 14 } } }]
  ],
  hard: [
    ['base', {}],
    ['hard assist0.3', { difficulty: { hard: { assist: 0.3 } } }],
    ['hard assist0.35', { difficulty: { hard: { assist: 0.35 } } }],
    ['hard assist0.3 sway1.1', { difficulty: { hard: { assist: 0.3, sway: 1.1 } } }]
  ]
};
const rows = {
  easy: [['easy', 'kid4'], ['easy', 'kid6'], ['easy', 'kid4', 390, 844], ['easy', 'kid6', 390, 844], ['easy', 'adult'], ['easy', 'bot0.2'], ['easy', 'bot0.35']],
  lantern: [['easy', 'kid6'], ['normal', 'adult'], ['hard', 'adult'], ['normal', 'bot0.5'], ['normal', 'bot0.7'], ['normal', 'bot0.9'], ['hard', 'bot0.7']],
  pace: [['easy', 'kid4'], ['easy', 'kid6'], ['easy', 'adult'], ['normal', 'adult'], ['hard', 'adult'], ['normal', 'bot0.7'], ['normal', 'bot1']],
  hard: [['hard', 'adult'], ['hard', 'bot0.5'], ['hard', 'bot0.7'], ['hard', 'bot0.9'], ['hard', 'adult', 390, 844]]
};
for (const k of which === 'all' ? Object.keys(sets) : which.split(',')) {
  console.log('######## ' + k);
  for (const [label, ov] of sets[k]) {
    console.log('== ' + label);
    for (const [d, n, W, H] of rows[k]) console.log('  ' + row(ov, d, n, W, H));
  }
}
void E;
