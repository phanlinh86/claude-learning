// Puddle's Greenhouse Hop — compare candidate CONFIG patches (growth / weight) on the key playtest numbers.
//   node tests/sim/sweep.js [diff,diff] [nSeeds]
// Each candidate is a patch {"*": {...}, "easy": {...}} (see run.js). Prints one line per candidate × difficulty × player.
'use strict';
const L = require('./lib.js');
const [, , diffArg = 'easy,normal,hard', nArg = '40', only] = process.argv;
const DIFFS = diffArg.split(','), N = +nArg;

// candidates around the shipped growth / weight numbers (base = CONFIG as it is)
const CANDIDATES = {
  base: {},
  slowGrow: { '*': { growPerFirefly: 0.004 } },
  fastGrow: { '*': { growPerFirefly: 0.008 } },
  heavy: { '*': { steerK: 0.35 } },          // DESIGN's first guess: 0.65× top speed at 1.6
  light: { '*': { steerK: 0.15 } },
  easyMax14: { easy: { 'difficulty.easy.maxSize': 1.4 } },
};
const PLAYERS = [['kid', 5], ['kid', 6], ['casual'], ['lagBot', 0.25], ['bot', 0.5], ['bot', 1]];

for (const [name, patch] of Object.entries(CANDIDATES)) {
  if (only && !only.split(',').includes(name)) continue;
  for (const d of DIFFS) {
    const PH = L.freshFH(Object.assign({}, patch['*'] || {}, patch[d] || {}));
    const cells = [];
    for (const [p, a] of PLAYERS) {
      const real = [], l1 = [], lv = []; let falls = 0, T = 0;
      for (let s = 0; s < N; s++) {
        const m = L.runRound(PH, { diff: d, seed: 300 + s, player: p, arg: a, maxT: 600 });
        real.push(m.time); l1.push(m.levelT.length ? m.levelT[0].dt : Infinity);
        if (s < Math.ceil(N / 4)) {
          const u = L.runRound(PH, { diff: d, seed: 600 + s, player: p, arg: a, maxT: 300, unlimited: true });
          falls += u.falls.length; T += u.time; for (const x of u.levelT) lv.push(x.dt);
        }
      }
      const l1r = l1.filter(isFinite).length / N;
      cells.push(`${(p + (a || '')).padEnd(7)} surv ${L.quant(real, 0.5).toFixed(0).padStart(3)} L1 ${(l1r * 100).toFixed(0).padStart(3)}% ${isFinite(L.quant(l1, 0.5)) ? L.quant(l1, 0.5).toFixed(0).padStart(3) : '  -'}s f/m ${(falls / T * 60).toFixed(1).padStart(4)} s/lvl ${lv.length ? L.quant(lv, 0.5).toFixed(0) : '-'}`);
    }
    console.log(`${name.padEnd(10)} ${d.padEnd(6)} | ` + cells.join(' | '));
  }
}
