// Nimbus's Bubble Garden — CONFIG sweep: the same players/seeds against several CONFIG variants (sandbox overrides,
// game/ is never edited). node tests/sim/sweep.js [easy|normal|floor|final] [--seeds N] [--time S]
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./lib');
const P = require('./players');

const args = process.argv.slice(2);
const which = args[0] || 'easy';
function opt(k, d) { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; }
const nSeeds = +opt('seeds', 40), maxTime = +opt('time', 600);
const seeds = Array.from({ length: nSeeds }, (_, i) => 5000 + i * 13);
const f = L.f;
const E = (o) => ({ difficulty: { easy: o } });
const proposal = JSON.parse(fs.readFileSync(path.join(__dirname, 'proposal-config.json'), 'utf8'));

const VARIANTS = {
  easy: [
    ['baseline', null],
    ['goal.easy 48→40', { goal: { easy: 40 } }],
    ['easy.rise 0.75→0.6', E({ rise: 0.6 })],
    ['easy.popK 1.25→1.45', E({ popK: 1.45 })],
    ['easy.spawn 1.05→1.2', E({ spawn: 1.2 })],
    ['goal 40 + rise 0.6', { goal: { easy: 40 }, difficulty: { easy: { rise: 0.6 } } }],
    ['goal 40 + rise 0.6 + popK 1.45', { goal: { easy: 40 }, difficulty: { easy: { rise: 0.6, popK: 1.45 } } }],
    ['goal 36 + rise 0.6 + popK 1.45 + spawn 1.15', { goal: { easy: 36 }, difficulty: { easy: { rise: 0.6, popK: 1.45, spawn: 1.15 } } }]
  ],
  normal: [
    ['baseline', null],
    ['burrClear.normal 0.5→1.0', { burrClear: { normal: 1.0 } }],
    ['normal.hangTime 1.1→1.35', { difficulty: { normal: { hangTime: 1.35 } } }],
    ['normal.burrR 1.0→0.92', { difficulty: { normal: { burrR: 0.92 } } }],
    ['clear 1.0 + hang 1.35', { burrClear: { normal: 1.0 }, difficulty: { normal: { hangTime: 1.35 } } }],
    ['clear 1.0 + hang 1.35 + burrR 0.92', { burrClear: { normal: 1.0 }, difficulty: { normal: { hangTime: 1.35, burrR: 0.92 } } }]
  ],
  easy2: [
    ['baseline', null],
    ['A: goal 40, rise 0.6, popK 1.45, spawn 1.1', { goal: { easy: 40 }, difficulty: { easy: { rise: 0.6, popK: 1.45, spawn: 1.1 } } }],
    ['B: A + rise 0.55', { goal: { easy: 40 }, difficulty: { easy: { rise: 0.55, popK: 1.45, spawn: 1.1 } } }],
    ['C: A + goal 38', { goal: { easy: 38 }, difficulty: { easy: { rise: 0.6, popK: 1.45, spawn: 1.1 } } }],
    ['D: A + burrEvery 1.8', { goal: { easy: 40 }, difficulty: { easy: { rise: 0.6, popK: 1.45, spawn: 1.1, burrEvery: 1.8 } } }],
    ['E: A + burrR 0.75', { goal: { easy: 40 }, difficulty: { easy: { rise: 0.6, popK: 1.45, spawn: 1.1, burrR: 0.75 } } }],
    ['F: A + burrEvery 1.8 + burrR 0.75', { goal: { easy: 40 }, difficulty: { easy: { rise: 0.6, popK: 1.45, spawn: 1.1, burrEvery: 1.8, burrR: 0.75 } } }]
  ],
  normal2: [
    ['baseline', null],
    ['normal.hangTime 1.1→1.35', { difficulty: { normal: { hangTime: 1.35 } } }],
    ['normal.burrEvery 1.0→1.15', { difficulty: { normal: { burrEvery: 1.15 } } }],
    ['growK 0.25→0.2', { growK: 0.2 }],
    ['hang 1.35 + burrEvery 1.15', { difficulty: { normal: { hangTime: 1.35, burrEvery: 1.15 } } }]
  ],
  final: [['baseline', null], ['proposal-config.json', proposal]]
};

const PLAYERS = {
  easy: [
    ['kid · easy · land', () => P.kid(), { diff: 'easy', layout: 'land' }],
    ['kid · easy · port', () => P.kid(), { diff: 'easy', layout: 'port' }],
    ['casual · easy · land', () => P.casual(), { diff: 'easy', layout: 'land' }],
    ['bot 0.9 · easy · land', () => P.bot(0.9), { diff: 'easy', layout: 'land' }],
    ['bot 0.3 · easy · land', () => P.bot(0.3), { diff: 'easy', layout: 'land' }]
  ],
  normal: [
    ['casual · normal · land', () => P.casual(), { diff: 'normal', layout: 'land' }],
    ['casual · normal · port', () => P.casual(), { diff: 'normal', layout: 'port' }],
    ['keyboard · normal · land', () => P.keyboard(), { diff: 'normal', layout: 'land' }],
    ['bot 0.5 · normal · land', () => P.bot(0.5), { diff: 'normal', layout: 'land' }],
    ['bot 0.9 · normal · land', () => P.bot(0.9), { diff: 'normal', layout: 'land' }],
    ['puddle camp · normal · land', () => P.puddleCamp(), { diff: 'normal', layout: 'land' }]
  ]
};
PLAYERS.easy2 = PLAYERS.easy; PLAYERS.normal2 = PLAYERS.normal.slice(0, 5);
PLAYERS.final = PLAYERS.easy.concat(PLAYERS.normal, [
  ['kid · easy · land (first 120 s only)', () => P.kid(), { diff: 'easy', layout: 'land', maxTime: 120 }],
  ['afk · easy · port', () => P.afk(), { diff: 'easy', layout: 'port' }],
  ['casual · hard · land', () => P.casual(), { diff: 'hard', layout: 'land' }],
  ['bot 0.5 · hard · land', () => P.bot(0.5), { diff: 'hard', layout: 'land' }],
  ['bot 0.9 · hard · land', () => P.bot(0.9), { diff: 'hard', layout: 'land' }]
]);

console.log(`\n### sweep: ${which} (${nSeeds} seeds × ≤${maxTime} s)\n` +
  '| player | variant | 1st level s p50 (p90) | s/level all zones p50 | escaped | hits/min | game over ≤120 s | game over ≤10 min | survival p50 | score p50 | showers/min |\n|---|---|---|---|---|---|---|---|---|---|---|');
const out = {};
for (const [pname, pf, o] of PLAYERS[which]) {
  for (const [vname, ov] of VARIANTS[which]) {
    const s = L.runMany(() => L.makeNB(ov), pf, Object.assign({ maxTime }, o), seeds);
    out[pname + ' | ' + vname] = s;
    const all = s.levelSecAll.map(z => f(z.p50, 0)).join('/');
    console.log(`| ${pname} | ${vname} | ${f(s.firstLevel.p50, 0)} (${f(s.firstLevel.p90, 0)})${s.firstLevel.notDone ? ' [' + s.firstLevel.notDone + ' not done]' : ''} | ${all} | ${f(100 * s.escapeShare, 0)} % | ${f(s.hitsPerMin, 2)} | ${f(100 * s.over120, 0)} % | ${f(100 * s.overRate, 0)} % | ${f(s.surv.p50, 0)} | ${f(s.score.p50, 0)} | ${f(s.showersPerMin, 2)} |`);
  }
}
fs.mkdirSync(path.join(__dirname, 'results'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'results', 'sweep-' + which + '.json'), JSON.stringify(out, null, 1));
