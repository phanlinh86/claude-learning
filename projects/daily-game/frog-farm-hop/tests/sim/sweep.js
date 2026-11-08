// Clover's Farm Hop — compare candidate CONFIG patches on the key playtest numbers.
//   node tests/sim/sweep.js [diff,diff] [nSeeds]
// Each candidate is a patch {"*": {...}, "easy": {...}} (see run.js). Prints one line per candidate × difficulty × player.
'use strict';
const L = require('./lib.js');
const [, , diffArg = 'easy,normal,hard', nArg = '40', only] = process.argv;
const DIFFS = diffArg.split(','), N = +nArg;

const A = { maxVx: 5.0, drag: 11, landPad: 0.3, 'difficulty.easy.widthK': 1.5, 'difficulty.normal.widthK': 1.1, 'difficulty.hard.widthK': 0.95 };
const CANDIDATES = {
  base: {},
  vx50: { '*': { maxVx: 5.0 } },
  A: { '*': A },
  B: { '*': Object.assign({}, A, { 'difficulty.easy.maxDx': 2.6 }) },
  C: { '*': A, easy: { maxVx: 4.5 } },
  D: { '*': Object.assign({}, A, { g: 22, bounceV: 11.4 }) },
  F: { '*': Object.assign({}, A, { landPad: 0.32, lanternSize: 15, 'difficulty.easy.maxDx': 2.6, 'difficulty.normal.widthK': 1.2 }) },
  G: { '*': Object.assign({}, A, { landPad: 0.32, lanternSize: 15, 'difficulty.easy.maxDx': 2.6, 'difficulty.normal.widthK': 1.2, 'difficulty.normal.hearts': 4 }) },
  H: { '*': Object.assign({}, A, { landPad: 0.32, lanternSize: 15, 'difficulty.easy.maxDx': 2.6, 'difficulty.normal.widthK': 1.2 }), easy: { maxVx: 4.5 } },
  E: { '*': Object.assign({}, A, { g: 22, bounceV: 11.4, 'difficulty.easy.maxDx': 2.6 }), easy: { maxVx: 4.5 } },
};
const PLAYERS = [['kid', 5], ['kid', 6], ['casual'], ['lagBot', 0.25], ['bot', 0.5], ['bot', 1]];

for (const [name, patch] of Object.entries(CANDIDATES)) {
  if (only && !only.split(',').includes(name)) continue;
  for (const d of DIFFS) {
    const FH = L.freshFH(Object.assign({}, patch['*'] || {}, patch[d] || {}));
    const cells = [];
    for (const [p, a] of PLAYERS) {
      const real = [], l1 = [], lv = []; let falls = 0, T = 0;
      for (let s = 0; s < N; s++) {
        const m = L.runRound(FH, { diff: d, seed: 300 + s, player: p, arg: a, maxT: 600 });
        real.push(m.time); l1.push(m.levelT.length ? m.levelT[0].dt : Infinity);
        if (s < Math.ceil(N / 4)) {
          const u = L.runRound(FH, { diff: d, seed: 600 + s, player: p, arg: a, maxT: 300, unlimited: true });
          falls += u.falls.length; T += u.time; for (const x of u.levelT) lv.push(x.dt);
        }
      }
      const l1r = l1.filter(isFinite).length / N;
      cells.push(`${(p + (a || '')).padEnd(7)} surv ${L.quant(real, 0.5).toFixed(0).padStart(3)} L1 ${(l1r * 100).toFixed(0).padStart(3)}% ${isFinite(L.quant(l1, 0.5)) ? L.quant(l1, 0.5).toFixed(0).padStart(3) : '  -'}s f/m ${(falls / T * 60).toFixed(1).padStart(4)} s/lvl ${lv.length ? L.quant(lv, 0.5).toFixed(0) : '-'}`);
    }
    console.log(`${name.padEnd(10)} ${d.padEnd(6)} | ` + cells.join(' | '));
  }
}
